"""The static website runs the calculations in the browser through nukesim.web.api.handle(). It must give
exactly the same answers (and the same error messages) as the web server."""
import json

import pytest
from fastapi.testclient import TestClient

from nukesim.web import api
from nukesim.web.server import app

client = TestClient(app)
BURST = {"yield_kt": 15, "z_m": -23}
RECEIVERS = [
    {"id": "cod", "kind": "fish", "x_m": 770, "z_m": -30, "mass_kg": 5},
    {"id": "boat", "kind": "ship", "x_m": 1980, "z_m": 2, "ship_type": "small_craft"},
    {"id": "whale", "kind": "mammal", "x_m": 3520, "z_m": -20, "mass_kg": 30000, "hearing_group": "LF"},
]
REQUESTS = [
    ("/api/info", {"burst": BURST}),
    ("/api/assess", {"burst": BURST, "receivers": RECEIVERS}),
    ("/api/assess", {"burst": {"yield_kt": 1000, "z_m": 2352}, "receivers": RECEIVERS, "long_term": True}),
    ("/api/waves", {"burst": BURST, "max_range_m": 20000}),
    ("/api/zones", {"burst": BURST}),
    ("/api/timeline", {"burst": BURST, "receivers": RECEIVERS, "days": 30}),
    ("/api/field", {"burst": BURST, "kind": "pressure", "nr": 8, "nd": 5}),
    ("/api/fallout", {"burst": {"yield_kt": 1000, "z_m": 0}, "receiver": {"id": "p", "kind": "person", "x_m": 20000, "z_m": 2}}),
]


@pytest.mark.parametrize("path,body", REQUESTS)
def test_same_answer_as_the_server(path, body):
    status, text = api.handle(path, json.dumps(body))
    r = client.post(path, json=body)
    assert status == r.status_code == 200
    assert json.loads(text) == r.json()


def test_uncertainties_list():
    status, text = api.handle("/api/uncertainties", None)
    assert status == 200 and json.loads(text) == client.get("/api/uncertainties").json()


def test_bad_input_same_message_as_the_server():
    body = {"burst": {"yield_kt": -5, "z_m": 0}}
    status, text = api.handle("/api/info", json.dumps(body))
    r = client.post("/api/info", json=body)
    assert status == r.status_code == 422
    assert json.loads(text) == r.json()


def test_impossible_scenario_same_message_as_the_server():
    body = {"burst": {"yield_kt": 15, "z_m": -100}, "env": {"water_depth_m": 50}}
    status, text = api.handle("/api/zones", json.dumps(body))
    r = client.post("/api/zones", json=body)
    assert status == r.status_code == 422
    assert json.loads(text) == r.json()


def test_unexpected_error_is_short_and_private(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret internal detail /Users/someone/file.py line 42")
    monkeypatch.setattr(api, "build_timeline", boom)
    status, text = api.handle("/api/timeline", json.dumps({"burst": BURST}))
    assert status == 500 and "internal error" in text
    for leak in ("Traceback", "secret", "RuntimeError", ".py"):
        assert leak not in text


def test_unknown_path():
    assert api.handle("/api/nothing", "{}")[0] == 404
