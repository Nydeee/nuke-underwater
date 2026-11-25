"""Small web server: the browser interface asks it for results, it calls the
existing (tested) simulator code and sends back numbers.

On your Mac:   uv run nukesim-web      (only this Mac can reach it: 127.0.0.1)
As a website:  see docs/DEPLOY.md      (the Dockerfile runs uvicorn on 0.0.0.0:$PORT)

Limits on request sizes, per-visitor rate limits and safe error messages are here and in
protect.py, so the same code is safe to put on the public internet.
"""

from __future__ import annotations

import argparse
import logging
import webbrowser
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import api
from .api import (AssessIn, FalloutIn, FieldIn, RangeIn, Scenario, TimelineIn, ApiError,   # noqa: F401 (re-exported)
                  MAX_RECEIVERS, MAX_SAMPLES_TOTAL, MAX_GRID_CELLS, MAX_DAYS, MAX_RANGE_M, MAX_COORD_M,
                  fireball_radius_m, peak_water_pressure_pa, regime)
from .protect import ProtectMiddleware

STATIC = Path(__file__).parent / "static"
log = logging.getLogger("nukesim.web")

# The calculations and input checks are in api.py (shared with the static website, where they run in the
# visitor's browser). This file only connects them to the web.
app = FastAPI(title="nukesim", description="Interface to the nuclear-blast-on-water simulator")


@app.get("/healthz")
def healthz():
    """For the hosting service: answers quickly so it knows the server is up (no calculation)."""
    return {"status": "ok"}


# ---------------------------------------------------------------- errors: short messages, never Python internals
@app.exception_handler(RequestValidationError)
async def _bad_input(request: Request, exc: RequestValidationError):
    return JSONResponse({"detail": api.validation_detail(exc.errors())}, status_code=422)


@app.exception_handler(ApiError)
async def _cannot(request: Request, exc: ApiError):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status)


@app.exception_handler(Exception)
async def _unexpected(request: Request, exc: Exception):
    """Anything unexpected: log the details for the owner, tell the visitor only that it failed."""
    log.error("error while handling %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse({"detail": "The server could not calculate this scenario (an internal error). "
                                   "Try different settings."}, status_code=500)


@app.post("/api/info")
def info(s: Scenario):
    return api.info(s)


@app.post("/api/assess")
def assess_all(a: AssessIn):
    return api.assess_all(a)


@app.get("/api/uncertainties")
def uncertainties():
    return api.uncertainties()


@app.post("/api/field")
def field(f: FieldIn):
    return api.field(f)


@app.post("/api/waves")
def waves(s: RangeIn):
    return api.waves(s)


@app.post("/api/fallout")
def fallout_series(f: FalloutIn):
    return api.fallout_series(f)


@app.post("/api/zones")
def zones(s: Scenario):
    return api.zones(s)


@app.post("/api/timeline")
def timeline_series(tl: TimelineIn):
    return api.timeline_series(tl)


@app.middleware("http")
async def _caching_and_headers(request, call_next):
    """Caching (see docs/DEPLOY.md, "How caching works"):
    * the app's own files (HTML, JS, CSS): "no-cache" = the browser must ask "has this changed?" every time.
      The answer is a tiny "304 not modified" when it hasn't (the files carry an ETag), so this is cheap,
      and an update to the site shows up on the very next page load.
    * vendor/ (three.js, which only changes when we upgrade it): kept for a day without asking.
    * API answers: never stored (they depend on the scenario sent)."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") or path == "/healthz":
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith("/vendor/"):
        response.headers["Cache-Control"] = "public, max-age=86400"
    else:
        response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


app.add_middleware(GZipMiddleware, minimum_size=1000)   # smaller downloads (three.js: about 670 kB -> 165 kB)
app.add_middleware(ProtectMiddleware)                    # outermost: rate limit / busy / size checks first
app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")


def main():
    import uvicorn

    ap = argparse.ArgumentParser(description="Start the local nukesim web interface.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1",
                    help="127.0.0.1 = only this computer (default); 0.0.0.0 = anyone on the network")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    url = f"http://127.0.0.1:{a.port}"
    print(f"nukesim interface running at {url}  (press Ctrl+C to stop)")
    if not a.no_browser:
        webbrowser.open(url)
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
