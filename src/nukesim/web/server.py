"""Small local web server: the browser interface asks it for results, it calls the
existing (tested) simulator code and sends back numbers. Runs only on this Mac
(127.0.0.1); nothing is sent to the internet.

Start with:  uv run nukesim-web
"""

from __future__ import annotations

import argparse
import math
import webbrowser
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import units
from ..biology.assess import LEVELS, assess
from ..biology.long_term import assess_long_term
from ..biology.uncertain import assess_uncertain
from ..uncertainty import INGREDIENTS
from ..effects import (air_blast, air_to_water, fallout, near_surface_shock, radiation_shielding,
                       underwater_shock, water_waves)
from ..scenario import Burst, Environment, Receiver
from ..timeline import timeline as build_timeline

STATIC = Path(__file__).parent / "static"


# ---------------------------------------------------------------- input models
class BurstIn(BaseModel):
    yield_kt: float = Field(20.0, gt=0, le=100_000, description="kilotons")
    z_m: float = Field(500.0, description="height above the water (negative = depth below)")
    fission_fraction: float = Field(1.0, gt=0, le=1)
    wind_mph: float = Field(15.0, gt=0, le=100)


class EnvIn(BaseModel):
    water_depth_m: float | None = Field(None, gt=0, description="None = deep open ocean")


class ReceiverIn(BaseModel):
    id: str
    kind: Literal["fish", "mammal", "turtle", "diver", "person"]
    x_m: float
    y_m: float = 0.0
    z_m: float
    mass_kg: float | None = Field(None, gt=0)
    swim_bladder: bool = True
    hearing_group: Literal["LF", "HF", "VHF", "PW", "OW"] | None = None


class Scenario(BaseModel):
    burst: BurstIn = BurstIn()
    env: EnvIn = EnvIn()


class AssessIn(Scenario):
    receivers: list[ReceiverIn] = []
    long_term: bool = True
    uncertainty: bool = False
    n_samples: int = Field(200, ge=20, le=2000)


class FieldIn(Scenario):
    kind: Literal["pressure", "dose", "zones"] = "pressure"
    zones_kind: Literal["fish", "mammal", "turtle", "diver"] = "fish"
    zones_mass_kg: float | None = None
    max_range_m: float = Field(3000.0, gt=0)
    max_depth_m: float = Field(100.0, gt=0)
    nr: int = Field(40, ge=4, le=120)
    nd: int = Field(25, ge=4, le=80)


class RangeIn(Scenario):
    max_range_m: float = Field(100_000.0, gt=0)


class FalloutIn(Scenario):
    receiver: ReceiverIn
    days: float = Field(30.0, gt=0, le=365)


class TimelineIn(Scenario):
    receivers: list[ReceiverIn] = []
    days: float = Field(30.0, gt=0, le=365)


# ---------------------------------------------------------------- helpers
def _burst(b: BurstIn) -> Burst:
    return Burst(yield_kt=b.yield_kt, z_m=b.z_m)


def _env(e: EnvIn) -> Environment:
    return Environment(water_depth_m=e.water_depth_m if e.water_depth_m else float("inf"))


def _receiver(r: ReceiverIn) -> Receiver:
    return Receiver(r.x_m, r.y_m, r.z_m, kind=r.kind, label=r.id, mass_kg=r.mass_kg,
                    swim_bladder=r.swim_bladder, hearing_group=r.hearing_group)


def _clean(x):
    """Make numbers JSON-safe (no inf/nan)."""
    if isinstance(x, float):
        return None if not math.isfinite(x) else x
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, np.ndarray):
        return _clean(x.tolist())
    if isinstance(x, (np.floating,)):
        return _clean(float(x))
    return x


def regime(b: Burst, env: Environment | None = None) -> str:
    if env is not None and b.z_m < 0 and -b.z_m >= env.water_depth_m:
        return "impossible: the burst is below the sea floor"
    if near_surface_shock.in_regime(b):
        return "near-surface burst (fireball touches the water)"
    if b.z_m < 0:
        return "underwater burst"
    if air_blast.fireball_touches_water(b.yield_kt, b.z_m):
        return "low air burst (fireball reaches the water)"
    return "air burst"


def fireball_radius_m(yield_kt: float, z_m: float) -> float:
    """Approximate maximum fireball radius: about twice the breakaway radius (glasstone1977 sec. 2.127)."""
    if z_m < 0:
        return 0.0
    coeff = 145.0 if air_blast.is_contact_burst(yield_kt, z_m) else 100.0   # Eqs. 2.127.1 / 2.127.2 (ft)
    return 2.0 * coeff * yield_kt**0.4 * units.FT_TO_M


def peak_water_pressure_pa(b: Burst, r: Receiver, env: Environment) -> float:
    if near_surface_shock.in_regime(b):
        p = near_surface_shock.compute(b, r, env).peak_pressure_pa
        if b.z_m >= 0:
            p = max(p, air_to_water.compute(b, r, env, n_samples=2**11).peak_overpressure_pa)
        return p
    if b.z_m < 0:
        return underwater_shock.compute(b, r, env).peak_pressure_pa
    return air_to_water.compute(b, r, env, n_samples=2**11).peak_overpressure_pa


# ---------------------------------------------------------------- app
app = FastAPI(title="nukesim", description="Local interface to the nuclear-blast-on-water simulator")


@app.post("/api/info")
def info(s: Scenario):
    b, env = _burst(s.burst), _env(s.env)
    depth_ft = max(-b.z_m, 0.0) * units.M_TO_FT
    rc, dc = water_waves.crater_ft(b.yield_kt, depth_ft)
    if regime(b, env).startswith("impossible"):
        return _clean({"regime": regime(b, env), "fireball_radius_m": 0.0, "local_fallout": False, "coupling": None,
                       "crater_radius_m": None, "crater_depth_m": None, "levels": LEVELS})
    return _clean({
        "regime": regime(b, env),
        "fireball_radius_m": fireball_radius_m(b.yield_kt, b.z_m),
        "local_fallout": b.z_m >= 0 and fallout.has_local_fallout(b.yield_kt, b.z_m),
        "coupling": near_surface_shock.coupling(b.yield_kt, near_surface_shock.scaled_depth_ft(b.yield_kt, -b.z_m))
        if near_surface_shock.in_regime(b) else (1.0 if b.z_m < 0 else None),
        "crater_radius_m": rc * units.FT_TO_M if b.z_m <= 0 or near_surface_shock.in_regime(b) else None,
        "crater_depth_m": dc * units.FT_TO_M if b.z_m <= 0 or near_surface_shock.in_regime(b) else None,
        "levels": LEVELS,
    })


@app.post("/api/assess")
def assess_all(a: AssessIn):
    b, env = _burst(a.burst), _env(a.env)
    out = []
    for r_in in a.receivers:
        r = _receiver(r_in)
        item = {"id": r_in.id, "kind": r_in.kind}
        try:
            res = assess(b, r, env)
            item.update(worst=res.worst, notes=res.notes,
                        effects=[{"name": e.name, "level": e.level, "value": e.value,
                                  "criterion": e.criterion, "source": e.source} for e in res.effects])
        except (ValueError, NotImplementedError) as exc:
            item.update(worst=None, error=str(exc), effects=[], notes=[])
        if a.long_term and r_in.kind in ("fish", "person", "diver") and b.z_m >= 0 and "error" not in item:
            try:
                lt = assess_long_term(b, r, env, wind_mph=a.burst.wind_mph, fission_fraction=a.burst.fission_fraction)
                item["long_term"] = {"findings": lt.findings, "notes": lt.notes}
            except (ValueError, NotImplementedError) as exc:
                item["long_term"] = {"findings": [f"not available: {exc}"], "notes": []}
        if a.uncertainty and "error" not in item:
            lt_ok = a.long_term and r_in.kind in ("fish", "person", "diver") and b.z_m >= 0
            ua = assess_uncertain(b, r, env, n=a.n_samples, long_term=lt_ok,
                                  **({"wind_mph": a.burst.wind_mph, "fission_fraction": a.burst.fission_fraction} if lt_ok else {}))
            item["uncertain"] = {
                "n": ua.n, "level_probs": ua.level_probs, "most_likely": ua.most_likely,
                "effects": [{"name": e.name, "unit": e.unit, "p05": e.p05, "p50": e.p50, "p95": e.p95,
                             "level_probs": e.level_probs} for e in ua.effects],
                "long_term": ua.long_term, "notes": ua.notes,
            }
        out.append(item)
    return _clean({"receivers": out})


@app.get("/api/uncertainties")
def uncertainties():
    """The list of uncertain ingredients, their ranges and where each range comes from."""
    return [{"name": i.name, "description": i.description, "kind": i.kind, "spread": i.spread,
             "low": i.low, "high": i.high, "basis": i.basis, "source": i.source} for i in INGREDIENTS]


@app.post("/api/field")
def field(f: FieldIn):
    b, env = _burst(f.burst), _env(f.env)
    ranges = np.linspace(0.0, f.max_range_m, f.nr)
    ranges[0] = min(10.0, f.max_range_m / f.nr)
    depths = np.linspace(0.5, f.max_depth_m, f.nd)
    values = np.zeros((len(depths), len(ranges)))
    below_floor = depths >= env.water_depth_m          # no water there: left empty (NaN)
    message, unit = "", ""
    if f.kind == "pressure":
        unit = "kPa (peak)"
        for i, d in enumerate(depths):
            for j, x in enumerate(ranges):
                values[i, j] = np.nan if below_floor[i] else peak_water_pressure_pa(b, Receiver(x, 0, -d), env) / 1e3
    elif f.kind == "dose":
        unit = "Gy (initial radiation, upper estimate)"
        if b.z_m < 0:
            message = "Initial radiation is not modelled for underwater bursts."
        else:
            for i, d in enumerate(depths):
                for j, x in enumerate(ranges):
                    values[i, j] = np.nan if below_floor[i] else radiation_shielding.compute(b, Receiver(x, 0, -d), env).total_gy[1]
    else:
        unit = "worst effect level (0 = none ... 4 = lethal)"
        for i, d in enumerate(depths):
            for j, x in enumerate(ranges):
                if below_floor[i]:
                    values[i, j] = np.nan
                    continue
                try:
                    res = assess(b, Receiver(x, 0, -d, kind=f.zones_kind, mass_kg=f.zones_mass_kg), env)
                    values[i, j] = LEVELS.index(res.worst)
                except (ValueError, NotImplementedError):
                    values[i, j] = float("nan")
    return _clean({"ranges_m": ranges, "depths_m": depths, "values": values, "unit": unit, "message": message})


@app.post("/api/waves")
def waves(s: RangeIn):
    b, env = _burst(s.burst), _env(s.env)
    r = np.geomspace(max(s.max_range_m / 200, 100.0), s.max_range_m, 60)
    res = [water_waves.compute(b, x, env) for x in r]
    return _clean({
        "ranges_m": r, "low_m": [w.height_m[0] for w in res], "high_m": [w.height_m[1] for w in res],
        "period_s": res[0].period_s, "wavelength_m": res[0].wavelength_m, "regime": res[0].regime,
        "max_wave_arrival_s": [w.max_wave_arrival_s for w in res], "warnings": res[-1].warnings,
    })


@app.post("/api/fallout")
def fallout_series(f: FalloutIn):
    b, env = _burst(f.burst), _env(f.env)
    r = _receiver(f.receiver)
    try:
        lt = assess_long_term(b, r, env, wind_mph=f.burst.wind_mph, fission_fraction=f.burst.fission_fraction, days=f.days)
    except (ValueError, NotImplementedError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return _clean({
        "times_h": lt.times_h, "total_low_ugy_h": lt.total_ugy_h[0], "total_high_ugy_h": lt.total_ugy_h[1],
        "internal_high_ugy_h": lt.internal_ugy_h[1] if lt.internal_ugy_h is not None else None,
        "findings": lt.findings, "notes": lt.notes,
    })


@app.post("/api/timeline")
def timeline_series(tl: TimelineIn):
    """When things happen: event times, blast/wave fronts vs time, fallout, and each receiver's timeline."""
    b, env = _burst(tl.burst), _env(tl.env)
    if regime(b, env).startswith("impossible"):
        raise HTTPException(status_code=422, detail=regime(b, env))
    return _clean(build_timeline(b, env, [_receiver(r) for r in tl.receivers], wind_mph=tl.burst.wind_mph,
                                 fission_fraction=tl.burst.fission_fraction, days=tl.days,
                                 max_fireball_radius_m=fireball_radius_m(b.yield_kt, b.z_m)))


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")


def main():
    import uvicorn

    ap = argparse.ArgumentParser(description="Start the local nukesim web interface.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    url = f"http://127.0.0.1:{a.port}"
    print(f"nukesim interface running at {url}  (press Ctrl+C to stop)")
    if not a.no_browser:
        webbrowser.open(url)
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
