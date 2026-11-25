"""Protection for running the web interface as a public website.

On your own Mac none of this matters, but on the open internet anyone (or any script) can send
requests. This module keeps one visitor from tying up the server for everybody else:

* a per-visitor rate limit (a "token bucket": each visitor gets a small allowance of requests that
  refills over time; the slow overlay requests cost more than the quick ones),
* a cap on how many calculations run at the same moment (extra ones get "busy, try again"),
* a cap on the size of a request body, and
* answers that are always short JSON messages, never Python error details.

Everything is plain Python (no extra packages). Settings come from environment variables so the
same code works locally and in the cloud; the defaults suit one small server.
"""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    """Read from the environment once, when the server starts."""
    rate_per_min: float = field(default_factory=lambda: _env_float("NUKESIM_RATE_PER_MIN", 180))
    burst: float = field(default_factory=lambda: _env_float("NUKESIM_RATE_BURST", 90))
    max_busy: int = field(default_factory=lambda: int(_env_float("NUKESIM_MAX_BUSY", 8)))
    max_body_bytes: int = field(default_factory=lambda: int(_env_float("NUKESIM_MAX_BODY_BYTES", 64_000)))
    # How many proxies sit in front of the app (the hosting company's load balancer). 0 = use the
    # address that connected directly (right for a laptop). With 1, the visitor's address is the last
    # entry of the X-Forwarded-For header, which that proxy adds and the visitor cannot fake.
    proxy_hops: int = field(default_factory=lambda: int(_env_float("NUKESIM_PROXY_HOPS", 0)))


# Requests that do more work cost more of the allowance (1 token = one quick request).
COST = {"/api/field": 6, "/api/assess": 2, "/api/timeline": 2, "/api/zones": 3}
EXEMPT = ("/healthz",)


class RateLimiter:
    """Token bucket per visitor address. Thread-safe and memory-bounded."""

    def __init__(self, rate_per_min: float, burst: float, max_clients: int = 50_000):
        self.rate = rate_per_min / 60.0
        self.burst = burst
        self.max_clients = max_clients
        self._buckets: dict[str, tuple[float, float]] = {}   # ip -> (tokens, last time)
        self._lock = threading.Lock()

    def take(self, key: str, cost: float = 1.0, now: float | None = None) -> float:
        """Spend `cost` tokens. Returns 0 if allowed, else the seconds to wait before trying again."""
        now = time.monotonic() if now is None else now
        with self._lock:
            if key not in self._buckets and len(self._buckets) >= self.max_clients:
                self._forget_full(now)
            tokens, last = self._buckets.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) * self.rate)
            if tokens >= cost:
                self._buckets[key] = (tokens - cost, now)
                return 0.0
            self._buckets[key] = (tokens, now)
            return (cost - tokens) / self.rate if self.rate > 0 else 3600.0

    def _forget_full(self, now: float) -> None:
        """Drop visitors whose allowance has refilled completely (they look like new visitors anyway)."""
        full = [k for k, (t, last) in self._buckets.items() if t + (now - last) * self.rate >= self.burst]
        for k in full:
            del self._buckets[k]
        if len(self._buckets) >= self.max_clients:     # still too many: start over rather than grow forever
            self._buckets.clear()


def client_ip(scope, proxy_hops: int) -> str:
    if proxy_hops > 0:
        for name, value in scope.get("headers", []):
            if name == b"x-forwarded-for":
                hops = [h.strip() for h in value.decode("latin-1").split(",") if h.strip()]
                if len(hops) >= proxy_hops:
                    return hops[-proxy_hops]
                break
    client = scope.get("client")
    return client[0] if client else "unknown"


async def _send_json(send, status: int, detail: str, headers: list[tuple[bytes, bytes]] = ()):
    body = json.dumps({"detail": detail}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
                            (b"cache-control", b"no-store"), *headers]})
    await send({"type": "http.response.body", "body": body})


class _TooLarge(Exception):
    pass


class ProtectMiddleware:
    """Plain ASGI middleware applying the limits above to every /api/ request."""

    def __init__(self, app, settings: Settings | None = None):
        self.app = app
        self.settings = settings or Settings()
        self.limiter = RateLimiter(self.settings.rate_per_min, self.settings.burst)
        self.busy = 0
        self._lock = threading.Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)
        s = self.settings

        # 1. body size: refuse at once if the header says it is too big, and count while reading otherwise
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    if int(value) > s.max_body_bytes:
                        return await _send_json(send, 413, "This request is too large.")
                except ValueError:
                    return await _send_json(send, 400, "Bad request.")
        seen = 0

        async def counted_receive():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > s.max_body_bytes:
                    raise _TooLarge
            return msg

        # 2. rate limit per visitor
        wait = self.limiter.take(client_ip(scope, s.proxy_hops), COST.get(scope["path"], 1))
        if wait > 0:
            secs = max(1, int(wait + 0.999))
            return await _send_json(send, 429, f"Too many requests from your address. Please wait {secs} s and try again.",
                                    [(b"retry-after", str(secs).encode())])

        # 3. how many calculations run at once
        with self._lock:
            if self.busy >= s.max_busy:
                full = True
            else:
                full = False
                self.busy += 1
        if full:
            return await _send_json(send, 503, "The server is busy right now. Please try again in a few seconds.",
                                    [(b"retry-after", b"5")])
        started = False

        async def tracked_send(msg):
            nonlocal started
            if msg["type"] == "http.response.start":
                started = True
            await send(msg)

        try:
            await self.app(scope, counted_receive, tracked_send)
        except _TooLarge:
            if not started:
                await _send_json(send, 413, "This request is too large.")
        finally:
            with self._lock:
                self.busy -= 1
