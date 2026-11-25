"""The calculations behind the app, without any web server: input checks, limits and one function per
kind of result. The same code answers in two places:

* the web server (server.py) for "uv run nukesim-web" and server hosting;
* the visitor's own browser on the static website (Python running in WebAssembly, "Pyodide"), through
  handle() below, so the site can be hosted as plain files (GitHub Pages) with no server at all.
"""

from __future__ import annotations

import json
import math
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field, ValidationError, model_validator

from .. import units
from ..biology.assess import LEVELS, assess
from ..biology.long_term import assess_long_term
from ..biology.zones import danger_distances
from ..biology.uncertain import assess_uncertain
from ..uncertainty import INGREDIENTS
from ..effects import (air_blast, air_to_water, fallout, near_surface_shock, radiation_shielding,
                       underwater_shock, water_waves)
from ..scenario import Burst, Environment, Receiver
from ..timeline import timeline as build_timeline


class ApiError(Exception):
    """A request the physics can't answer (e.g. a burst below the sea floor): a status and a short message."""
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


# ---------------------------------------------------------------- request limits
# Chosen so the app's own requests fit easily, while one request can't keep the server busy for long.
# (Measured on a laptop: an uncertainty run costs about 0.8 ms per sample per receiver; a "zones"
# overlay about 0.5 ms per grid cell.)
MAX_RECEIVERS = 50              # animals, people and ships in one request
MAX_SAMPLES_TOTAL = 10_000      # uncertainty runs x receivers in one /api/assess request
MAX_GRID_CELLS = 64 * 40        # overlay cells (nr x nd); the app asks for 48 x 30
MAX_DAYS = 365                  # fallout / timeline length
MAX_RANGE_M = 10_000_000.0      # 10,000 km
MAX_COORD_M = 10_000_000.0


# ---------------------------------------------------------------- input models
class BurstIn(BaseModel):
    yield_kt: float = Field(20.0, gt=0, le=100_000, description="kilotons")
    z_m: float = Field(500.0, ge=-20_000, le=100_000, description="height above the water (negative = depth below)")
    fission_fraction: float = Field(1.0, gt=0, le=1)
    wind_mph: float = Field(15.0, gt=0, le=100)


class EnvIn(BaseModel):
    water_depth_m: float | None = Field(None, gt=0, le=20_000, description="None = deep open ocean")
    visibility: Literal["exceptionally_clear", "very_clear", "clear", "light_haze", "medium_haze", "thin_fog"] = "exceptionally_clear"
    overcast: bool = False
    night: bool = False


class ReceiverIn(BaseModel):
    id: str = Field(max_length=100)
    kind: Literal["fish", "mammal", "turtle", "diver", "person", "ship", "bird"]
    x_m: float = Field(ge=-MAX_COORD_M, le=MAX_COORD_M)
    y_m: float = Field(0.0, ge=-MAX_COORD_M, le=MAX_COORD_M)
    z_m: float = Field(ge=-20_000, le=100_000)
    mass_kg: float | None = Field(None, gt=0, le=1_000_000)
    swim_bladder: bool = True
    hearing_group: Literal["LF", "HF", "VHF", "PW", "OW"] | None = None
    ship_type: Literal["small_craft", "destroyer", "carrier"] | None = None


class Scenario(BaseModel):
    burst: BurstIn = BurstIn()
    env: EnvIn = EnvIn()


class AssessIn(Scenario):
    receivers: list[ReceiverIn] = Field([], max_length=MAX_RECEIVERS)
    long_term: bool = True
    uncertainty: bool = False
    n_samples: int = Field(200, ge=20, le=2000)

    @model_validator(mode="after")
    def _uncertainty_budget(self):
        if self.uncertainty and self.n_samples * len(self.receivers) > MAX_SAMPLES_TOTAL:
            most = max(20, MAX_SAMPLES_TOTAL // max(len(self.receivers), 1))
            raise ValueError(f"too much work for one request: {self.n_samples} uncertainty runs x {len(self.receivers)} "
                             f"receivers is over {MAX_SAMPLES_TOTAL:,}. Use at most {most} runs, or fewer receivers.")
        return self


class FieldIn(Scenario):
    kind: Literal["pressure", "dose", "zones"] = "pressure"
    zones_kind: Literal["fish", "mammal", "turtle", "diver"] = "fish"
    zones_mass_kg: float | None = Field(None, gt=0, le=1_000_000)
    max_range_m: float = Field(3000.0, gt=0, le=MAX_RANGE_M)
    max_depth_m: float = Field(100.0, gt=0, le=20_000)
    nr: int = Field(40, ge=4, le=120)
    nd: int = Field(25, ge=4, le=80)

    @model_validator(mode="after")
    def _grid_budget(self):
        if self.nr * self.nd > MAX_GRID_CELLS:
            raise ValueError(f"overlay grid too fine: {self.nr} x {self.nd} = {self.nr * self.nd:,} cells, "
                             f"the most is {MAX_GRID_CELLS:,}")
        return self


class RangeIn(Scenario):
    max_range_m: float = Field(100_000.0, gt=0, le=MAX_RANGE_M)


class FalloutIn(Scenario):
    receiver: ReceiverIn
    days: float = Field(30.0, gt=0, le=MAX_DAYS)


class TimelineIn(Scenario):
    receivers: list[ReceiverIn] = Field([], max_length=MAX_RECEIVERS)
    days: float = Field(30.0, gt=0, le=MAX_DAYS)


# ---------------------------------------------------------------- helpers
def _burst(b: BurstIn) -> Burst:
    return Burst(yield_kt=b.yield_kt, z_m=b.z_m)


def _env(e: EnvIn) -> Environment:
    return Environment(water_depth_m=e.water_depth_m if e.water_depth_m else float("inf"),
                       visibility=e.visibility, overcast=e.overcast, night=e.night)


def _receiver(r: ReceiverIn) -> Receiver:
    return Receiver(r.x_m, r.y_m, r.z_m, kind=r.kind, label=r.id, mass_kg=r.mass_kg,
                    swim_bladder=r.swim_bladder, hearing_group=r.hearing_group, ship_type=r.ship_type)


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
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
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


# ---------------------------------------------------------------- the calculations
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


def uncertainties():
    """The list of uncertain ingredients, their ranges and where each range comes from."""
    return [{"name": i.name, "description": i.description, "kind": i.kind, "spread": i.spread,
             "low": i.low, "high": i.high, "basis": i.basis, "source": i.source} for i in INGREDIENTS]


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


def waves(s: RangeIn):
    b, env = _burst(s.burst), _env(s.env)
    r = np.geomspace(max(s.max_range_m / 200, 100.0), s.max_range_m, 60)
    res = [water_waves.compute(b, x, env) for x in r]
    return _clean({
        "ranges_m": r, "low_m": [w.height_m[0] for w in res], "high_m": [w.height_m[1] for w in res],
        "period_s": res[0].period_s, "wavelength_m": res[0].wavelength_m, "regime": res[0].regime,
        "max_wave_arrival_s": [w.max_wave_arrival_s for w in res], "warnings": res[-1].warnings,
    })


def fallout_series(f: FalloutIn):
    b, env = _burst(f.burst), _env(f.env)
    r = _receiver(f.receiver)
    try:
        lt = assess_long_term(b, r, env, wind_mph=f.burst.wind_mph, fission_fraction=f.burst.fission_fraction, days=f.days)
    except (ValueError, NotImplementedError) as exc:
        raise ApiError(422, str(exc))
    return _clean({
        "times_h": lt.times_h, "total_low_ugy_h": lt.total_ugy_h[0], "total_high_ugy_h": lt.total_ugy_h[1],
        "internal_high_ugy_h": lt.internal_ugy_h[1] if lt.internal_ugy_h is not None else None,
        "findings": lt.findings, "notes": lt.notes,
    })


def zones(s: Scenario):
    """How far each level of harm reaches for typical animals, people and ships (biology/zones.py)."""
    b, env = _burst(s.burst), _env(s.env)
    if regime(b, env).startswith("impossible"):
        raise ApiError(422, regime(b, env))
    return _clean({"kinds": danger_distances(b, env), "levels": LEVELS})


def timeline_series(tl: TimelineIn):
    """When things happen: event times, blast/wave fronts vs time, fallout, and each receiver's timeline."""
    b, env = _burst(tl.burst), _env(tl.env)
    if regime(b, env).startswith("impossible"):
        raise ApiError(422, regime(b, env))
    return _clean(build_timeline(b, env, [_receiver(r) for r in tl.receivers], wind_mph=tl.burst.wind_mph,
                                 fission_fraction=tl.burst.fission_fraction, days=tl.days,
                                 max_fireball_radius_m=fireball_radius_m(b.yield_kt, b.z_m)))


# ---------------------------------------------------------------- one entry point (used in the browser)
def validation_detail(errors) -> list[dict]:
    """Say what was wrong with the input (field and reason) without echoing the input back."""
    detail = []
    for e in list(errors)[:20]:
        loc = list(e.get("loc", []))
        if len(loc) <= 1:                       # a whole-request check (e.g. too much work), not one field
            loc.append("limits")
        msg = str(e.get("msg", "invalid value")).removeprefix("Value error, ")[:300]
        detail.append({"loc": loc, "msg": msg, "type": e.get("type")})
    return detail


ROUTES = {
    "/api/info": (Scenario, info), "/api/assess": (AssessIn, assess_all), "/api/field": (FieldIn, field),
    "/api/waves": (RangeIn, waves), "/api/fallout": (FalloutIn, fallout_series), "/api/zones": (Scenario, zones),
    "/api/timeline": (TimelineIn, timeline_series), "/api/uncertainties": (None, uncertainties),
}


def handle(path: str, body: str | None) -> tuple[int, str]:
    """Answer one request like the web server would: (HTTP status, JSON text)."""
    if path not in ROUTES:
        return 404, json.dumps({"detail": "Not Found"})
    model, fn = ROUTES[path]
    try:
        result = fn() if model is None else fn(model.model_validate_json(body or "{}"))
        return 200, json.dumps(result)
    except ValidationError as exc:
        # the same shape as the server's answer ("body" first in each location)
        return 422, json.dumps({"detail": validation_detail([{**e, "loc": ["body", *e.get("loc", [])]} for e in exc.errors()])})
    except ApiError as exc:
        return exc.status, json.dumps({"detail": exc.detail})
    except Exception:   # never Python internals to the visitor
        return 500, json.dumps({"detail": "Could not calculate this scenario (an internal error). Try different settings."})
