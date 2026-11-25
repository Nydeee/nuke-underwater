"""Surface water waves and the water crater from bursts in, on or just above the sea.

Plain-language summary
----------------------
* The explosion blows a crater in the water surface; when it collapses it sends
  out a train of waves. Only 2-5% of the yield ends up in waves (glasstone1977
  sec. 6.54).
* Deep water (depth >= 256 W^0.25 ft): H ~ 40,500 W^0.54 / R (Eq. 6.119.1, +-35%),
  H = crest-to-trough height, R = distance (ft), W in kt. This equals the "most
  probable" column of Le Mehaute & Wang's Table 1-3 (lemehaute1996). Their "upper
  critical depth" column, for bursts just below the surface, is 2.25x higher.
* Shallow water (100-256 W^0.25 ft): H ~ 150 d_w W^0.25 / R (sec. 6.121). It
  underpredicts Glasstone's own BAKER measurements (Table 6.57) by about 1.6-1.9x,
  so the upper estimate is scaled up by the BAKER ratio.
* Surface and above-water bursts vent more energy into the air and make smaller
  waves (lemehaute1996 sec. 1.4; Hardtack WT-1611); no formula exists, so the
  submerged value is used as an UPPER estimate.
* Wave period T ~ 14.1 W^0.144 s and length L ~ 1010 W^0.288 ft (sec. 6.119).
* Approaching the coast: height grows as depth^-1/4 (Green's law) until it breaks
  at about 0.78 x the depth (lemehaute1996 Eq. 1.25); flooding can reach about
  twice the approaching wave height (glasstone1977 sec. 2.71).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .. import units
from ..scenario import Burst, Environment
from .air_blast import fireball_touches_water
from .near_surface_shock import X_MIN, scaled_depth_ft

G = 9.80665
UCD_FACTOR = 18.0 / 8.0          # lemehaute1996: upper critical depth vs Glasstone/average (2.25)
BAKER_FACTOR = 1.9               # Table 6.57 vs Eq. 6.121 (our comparison; see tests)
BREAKING_INDEX = 0.78            # lemehaute1996 Eq. 1.25 (McCowan)
INUNDATION_FACTOR = 2.0          # glasstone1977 sec. 2.71


def deep_height_ft(yield_kt: float, range_ft: float) -> float:
    """glasstone1977 Eq. 6.119.1: crest-to-trough height (ft), +-35%."""
    return 40_500.0 * yield_kt**0.54 / range_ft


def shallow_height_ft(yield_kt: float, range_ft: float, water_depth_ft: float) -> float:
    """glasstone1977 sec. 6.121: H ~ 150 d_w W^0.25 / R (ft)."""
    return 150.0 * water_depth_ft * yield_kt**0.25 / range_ft


def period_s(yield_kt: float) -> float:
    return 14.1 * yield_kt**0.144


def wavelength_ft(yield_kt: float) -> float:
    return 1010.0 * yield_kt**0.288


def crater_ft(yield_kt: float, burst_depth_ft: float) -> tuple[float, float]:
    """(radius, depth) of the equivalent water crater, ft (lemehaute1996 Eqs. 3.2a/b; HE-based).

    Le Mehaute's convention: W in lb TNT with 1 kt = 2e6 lb; z / W^0.3 < 0.25 is
    the "upper critical depth" case.
    """
    w_lb = yield_kt * 2e6
    if max(burst_depth_ft, 0.0) / w_lb**0.3 < 0.25:
        return 9.54 * w_lb**0.3, 3.07 * w_lb**0.24
    return 10.77 * w_lb**0.3, 1.51 * w_lb**0.24


@dataclass
class WaveResult:
    range_m: float
    height_m: tuple[float, float]       # crest-to-trough (low, high)
    period_s: float
    wavelength_m: float
    front_arrival_s: float
    max_wave_arrival_s: float
    regime: str
    warnings: list[str] = field(default_factory=list)


def compute(burst: Burst, range_m: float, env: Environment | None = None) -> WaveResult:
    """Wave heights at a horizontal distance from surface zero (open water at the burst's depth)."""
    env = env or Environment()
    w = burst.yield_kt
    warnings: list[str] = []
    d_w_m = env.water_depth_m if math.isfinite(env.water_depth_m) else 1e5
    d_w_ft = d_w_m * units.M_TO_FT
    r_ft = max(range_m, 1.0) * units.M_TO_FT
    x = scaled_depth_ft(w, -burst.z_m)
    t = period_s(w)
    lam_ft = wavelength_ft(w)

    if burst.z_m > 0 and (x < X_MIN or not fireball_touches_water(w, burst.z_m)):
        regime = "air burst: negligible waves"
        lo = hi = 0.0
        warnings.append("Air burst too high for the fireball to reach the water: wave generation not modelled (small).")
    elif d_w_ft >= 256 * w**0.25:
        regime = "deep water"
        h = deep_height_ft(w, r_ft)
        lo, hi = h / 1.35, h * 1.35
        if burst.z_m < 0:
            w_lb = w * 2e6
            if (-burst.z_m * units.M_TO_FT) / w_lb**0.3 < 0.25:
                hi = h * UCD_FACTOR
        if d_w_ft > 850 * w**0.25:
            warnings.append("Water deeper than Glasstone's validity range (850 W^0.25 ft).")
    else:
        regime = "shallow water"
        h = shallow_height_ft(w, r_ft, d_w_ft)
        lo, hi = h, h * BAKER_FACTOR
        if d_w_ft < 100 * w**0.25:
            warnings.append("Water shallower than 100 W^0.25 ft: outside Glasstone's shallow-water formula.")
        warnings.append("Shallow-water formula underpredicts the BAKER measurements by ~1.6-1.9x; range includes that.")
    if burst.z_m >= 0 and regime != "air burst: negligible waves":
        warnings.append("Surface/above-water burst: more energy vents to the air, so waves are smaller; "
                        "value shown is an upper estimate (no published formula).")
        lo = 0.0
    if range_m < 2 * crater_ft(w, max(-burst.z_m, 0) * units.M_TO_FT)[0] * units.FT_TO_M:
        warnings.append("Within about two crater radii: waves are breaking/turbulent; formulas not valid here.")

    c_front = math.sqrt(G * d_w_m)
    c_max = G * t / (4 * math.pi)
    t_front = range_m / c_front
    t_max = range_m / min(c_max, c_front)
    ft = units.FT_TO_M
    return WaveResult(range_m, (lo * ft, hi * ft), t, lam_ft * ft, t_front, t_max, regime, warnings)


@dataclass
class CoastResult:
    depths_m: list[float]
    heights_m: list[float]
    breaks_at_depth_m: float | None
    max_inundation_m: float


def approach_coast(height_m: float, start_depth_m: float, depths_m: list[float],
                   wavelength_m: float | None = None) -> CoastResult:
    """Wave height as it moves into shallower water, capped at breaking (0.78 x depth).

    Green's law (H ~ depth^-1/4) only holds for "long" waves, i.e. once the depth is
    below about 1/20 of the wavelength. In deeper water the height is kept constant
    (Glasstone sec. 6.120: changes begin below about L/3, with a small initial dip).
    """
    ref = start_depth_m if wavelength_m is None else min(start_depth_m, wavelength_m / 20.0)
    heights, breaks = [], None
    for d in depths_m:
        h = height_m * (ref / d) ** 0.25 if d < ref else height_m
        if h >= BREAKING_INDEX * d:
            h = BREAKING_INDEX * d
            if breaks is None:
                breaks = d
        heights.append(h)
    return CoastResult(depths_m, heights, breaks, INUNDATION_FACTOR * max(heights) if heights else 0.0)
