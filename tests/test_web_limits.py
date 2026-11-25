"""Protection for running as a public website: request limits, rate limiting, safe errors, caching."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from nukesim.web import server
from nukesim.web.protect import ProtectMiddleware, RateLimiter, Settings, client_ip
from nukesim.web.server import MAX_GRID_CELLS, MAX_RECEIVERS, MAX_SAMPLES_TOTAL, app

client = TestClient(app)
BURST = {"yield_kt": 20, "z_m": 500}


def _rec(i, kind="person", z=2):
    return {"id": f"r{i}", "kind": kind, "x_m": 1000 + 50 * i, "z_m": z}


# ---------------------------------------------------------------- health check
def test_health_check():
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert r.headers["cache-control"] == "no-store"


# ---------------------------------------------------------------- input limits
def test_too_many_receivers_rejected():
    body = {"burst": BURST, "receivers": [_rec(i) for i in range(MAX_RECEIVERS + 1)]}
    assert client.post("/api/assess", json=body).status_code == 422
    assert client.post("/api/timeline", json=body).status_code == 422
    body["receivers"] = body["receivers"][:MAX_RECEIVERS]
    assert client.post("/api/assess", json=body).status_code == 200


def test_uncertainty_budget():
    n = 2000
    too_many = MAX_SAMPLES_TOTAL // n + 1
    body = {"burst": BURST, "uncertainty": True, "n_samples": n, "receivers": [_rec(i) for i in range(too_many)]}
    r = client.post("/api/assess", json=body)
    assert r.status_code == 422
    assert "too much work" in r.json()["detail"][0]["msg"]
    # the same receivers without uncertainty runs are fine
    body["uncertainty"] = False
    assert client.post("/api/assess", json=body).status_code == 200
    # per-request maximum and minimum for n_samples are kept
    assert client.post("/api/assess", json={"burst": BURST, "n_samples": 2001}).status_code == 422
    assert client.post("/api/assess", json={"burst": BURST, "n_samples": 19}).status_code == 422


def test_overlay_grid_limit():
    ok = client.post("/api/field", json={"burst": BURST, "kind": "pressure", "nr": 48, "nd": 30})   # what the app asks for
    assert ok.status_code == 200
    assert 48 * 30 <= MAX_GRID_CELLS
    r = client.post("/api/field", json={"burst": BURST, "kind": "zones", "nr": 120, "nd": 80})
    assert r.status_code == 422 and "grid too fine" in r.json()["detail"][0]["msg"]


@pytest.mark.parametrize("path,extra", [("/api/fallout", {"receiver": _rec(0)}), ("/api/timeline", {})])
def test_days_limit(path, extra):
    assert client.post(path, json={"burst": {"yield_kt": 20, "z_m": 0}, "days": 366, **extra}).status_code == 422
    assert client.post(path, json={"burst": {"yield_kt": 20, "z_m": 0}, "days": 365, **extra}).status_code == 200


def test_absurd_numbers_rejected():
    assert client.post("/api/waves", json={"burst": BURST, "max_range_m": 1e30}).status_code == 422
    assert client.post("/api/field", json={"burst": BURST, "max_range_m": 1e30}).status_code == 422
    bad = _rec(0) | {"x_m": 1e300}
    assert client.post("/api/assess", json={"burst": BURST, "receivers": [bad]}).status_code == 422
    assert client.post("/api/assess", json={"burst": BURST, "receivers": [_rec(0) | {"id": "x" * 101}]}).status_code == 422


def test_validation_errors_do_not_echo_input():
    secret = "x" * 101
    r = client.post("/api/assess", json={"burst": BURST, "receivers": [_rec(0) | {"id": secret}]})
    assert r.status_code == 422
    assert secret not in r.text
    assert set(r.json()["detail"][0]) == {"loc", "msg", "type"}


def test_body_size_limit():
    big = {"burst": BURST, "receivers": [], "padding": "x" * 100_000}
    r = client.post("/api/assess", json=big)
    assert r.status_code == 413
    assert "too large" in r.json()["detail"]


# ---------------------------------------------------------------- errors never leak internals
def test_unexpected_error_is_a_short_json_message(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret internal detail /Users/someone/file.py line 42")

    from nukesim.web import api
    monkeypatch.setattr(api, "build_timeline", boom)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.post("/api/timeline", json={"burst": BURST})
    assert r.status_code == 500
    assert r.headers["content-type"].startswith("application/json")
    assert "internal error" in r.json()["detail"]
    for leak in ("Traceback", "secret", "RuntimeError", ".py"):
        assert leak not in r.text


def test_unknown_api_path_is_json_404():
    r = client.post("/api/nothing", json={})
    assert r.status_code in (404, 405)
    assert "Traceback" not in r.text


# ---------------------------------------------------------------- rate limiting
def test_token_bucket_refills():
    lim = RateLimiter(rate_per_min=60, burst=3)       # 1 token per second, at most 3 saved up
    assert [lim.take("a", now=0.0) for _ in range(3)] == [0, 0, 0]
    wait = lim.take("a", now=0.0)
    assert wait == pytest.approx(1.0)
    assert lim.take("b", now=0.0) == 0                 # other visitors are not affected
    assert lim.take("a", now=1.0) == 0                 # one second later: one more allowed
    assert lim.take("a", 6, now=100.0) > 0             # a cost bigger than the bucket never fits all at once


def test_rate_limiter_memory_is_bounded():
    lim = RateLimiter(rate_per_min=60, burst=1, max_clients=100)
    for i in range(1000):
        lim.take(f"ip{i}", now=float(i))
    assert len(lim._buckets) <= 101


def _tiny_app(settings):
    a = FastAPI()

    @a.post("/api/assess")
    def ok():
        return {"ok": True}

    @a.post("/api/field")
    def ok2():
        return {"ok": True}

    @a.get("/healthz")
    def health():
        return {"status": "ok"}

    a.add_middleware(ProtectMiddleware, settings=settings)
    return a


def test_rate_limit_returns_429_with_retry_after():
    c = TestClient(_tiny_app(Settings(rate_per_min=60, burst=4, max_busy=8, max_body_bytes=64_000, proxy_hops=0)))
    codes = [c.post("/api/assess", json={}).status_code for _ in range(3)]   # each costs 2 tokens
    assert codes == [200, 200, 429]
    r = c.post("/api/assess", json={})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) >= 1
    assert "Too many requests" in r.json()["detail"]
    assert c.get("/healthz").status_code == 200          # the health check is never limited


def test_overlay_costs_more():
    c = TestClient(_tiny_app(Settings(rate_per_min=60, burst=6, max_busy=8, max_body_bytes=64_000, proxy_hops=0)))
    assert c.post("/api/field", json={}).status_code == 200
    assert c.post("/api/field", json={}).status_code == 429


def test_busy_limit():
    c = TestClient(_tiny_app(Settings(rate_per_min=6000, burst=100, max_busy=0, max_body_bytes=64_000, proxy_hops=0)))
    r = c.post("/api/assess", json={})
    assert r.status_code == 503 and "busy" in r.json()["detail"]


def test_client_ip_behind_proxy():
    scope = {"client": ("10.0.0.1", 1234), "headers": [(b"x-forwarded-for", b"6.6.6.6, 1.2.3.4")]}
    assert client_ip(scope, 0) == "10.0.0.1"              # on a laptop: the direct connection
    assert client_ip(scope, 1) == "1.2.3.4"               # one proxy: the address it added (a visitor can't fake it)
    assert client_ip(scope, 2) == "6.6.6.6"
    assert client_ip({"client": ("10.0.0.1", 1), "headers": []}, 1) == "10.0.0.1"


# ---------------------------------------------------------------- caching
def test_cache_headers():
    assert client.get("/").headers["cache-control"] == "no-cache"
    assert client.get("/app.js").headers["cache-control"] == "no-cache"
    assert client.get("/vendor/three/three.module.min.js").headers["cache-control"].startswith("public, max-age=")
    assert client.post("/api/info", json={"burst": BURST}).headers["cache-control"] == "no-store"
    etag = client.get("/app.js").headers["etag"]
    assert client.get("/app.js", headers={"If-None-Match": etag}).status_code == 304   # cheap re-check


def test_static_files_are_compressed():
    r = client.get("/vendor/three/three.module.min.js", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"
