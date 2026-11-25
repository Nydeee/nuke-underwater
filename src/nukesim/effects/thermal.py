"""Thermal radiation (heat and light from the fireball) reaching the sea surface.

Plain-language summary
----------------------
* About 35% of an air burst's energy comes out as thermal radiation within the
  first minute or less (glasstone1977 sec. 7.04).
* Radiant exposure Q (cal/cm^2) vs distance uses Fletcher's fits (fletcher1962
  Table 2.11, checked against the page image): Eq. 2.106 for air bursts (slant
  range), Eq. 2.107 for contact surface bursts, which use 0.7 W and ground range.
  The fits assume a clear day with 50-mile visibility.
* Timing: the main heat pulse peaks at t_max ~ 0.0417 W^0.44 s (sec. 7.85) and
  about 80% has arrived by 10 t_max (sec. 7.86); Fletcher Eq. 2.112 gives the
  cumulative percentage vs t / W^0.5.
* Burns to bare white skin: Fletcher Eqs. 2.110-2.111. Very dark skin can burn at
  about two-thirds of that exposure (glasstone1977 sec. 12.64).
* Part of the radiation reflects off the water (Fresnel equations, mobley_fresnel).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .. import units
from .air_blast import is_contact_burst

M_PER_MILE = 1609.344
CAL_CM2_TO_J_M2 = 4.184 * 1e4          # 1 cal/cm^2 = 41,840 J/m^2

# fletcher1962 Table 2.11: log10 y = sum c_i (log10 x)^i
EQ_2_106 = (-0.0401874, -2.0823477, -0.0511744, -0.0074958)          # Q/W vs d_s (miles), 0.05-50
EQ_2_110 = (0.3141555, 0.0599042, 0.0007636, -0.0002015)             # Q_1st vs W, 1-20,000 kt
EQ_2_111 = (0.6025982, 0.0201394, 0.0139640, 0.0008559)              # Q_2nd vs W
EQ_2_112 = (1.7457220, -1.9692127, -6.0520927, -7.4741163, -4.1282124, -0.7737418)  # Q% vs t/W^0.5
SURFACE_YIELD_FACTOR = 0.7
THERMAL_PARTITION_AIR = 0.35            # glasstone1977 sec. 7.04
DARK_SKIN_FACTOR = 2.0 / 3.0            # glasstone1977 sec. 12.64
WATER_REFRACTIVE_INDEX = 1.34           # mobley_fresnel (n ~ 1.34 for seawater, visible)


def _logpoly(coeffs, x: float) -> float:
    lx = math.log10(x)
    return 10 ** sum(c * lx**i for i, c in enumerate(coeffs))


def radiant_exposure_cal_cm2(yield_kt: float, height_m: float, ground_range_m: float) -> float:
    """Q (cal/cm^2) on a surface facing the fireball, clear day (Fletcher Eqs. 2.106/2.107)."""
    if is_contact_burst(yield_kt, height_m):
        d = max(ground_range_m, 1.0) / M_PER_MILE
        return SURFACE_YIELD_FACTOR * yield_kt * _logpoly(EQ_2_106, d)
    ds = math.hypot(ground_range_m, height_m) / M_PER_MILE
    return yield_kt * _logpoly(EQ_2_106, max(ds, 1e-4))


def glasstone_exposure_cal_cm2(yield_kt: float, slant_m: float, transmittance: float,
                               partition: float = THERMAL_PARTITION_AIR) -> float:
    """glasstone1977 Eq. 7.96.3: Q ~ 85.6 f W tau / D^2, D in kilofeet (cross-check only)."""
    d_kft = slant_m * units.M_TO_FT / 1000.0
    return 85.6 * partition * yield_kt * transmittance / d_kft**2


def time_of_maximum_s(yield_kt: float) -> float:
    """glasstone1977 sec. 7.85 (bursts below 15,000 ft): t_max ~ 0.0417 W^0.44 s (+-25%)."""
    return 0.0417 * yield_kt**0.44


def delivered_fraction(t_s: float, yield_kt: float) -> float:
    """Fraction of the thermal energy received by time t (Fletcher Eq. 2.112).

    The fit covers t/W^0.5 = 0.012-0.285 s, i.e. about 1.6% to 80% of the energy.
    Before that we ramp linearly from zero; after it we return the fit's last
    value (~0.80) -- read it as "at least 80%", since the fit says nothing later.
    """
    x = t_s / yield_kt**0.5
    if x <= 0.012:
        return _logpoly(EQ_2_112, 0.012) / 100.0 * max(x, 0.0) / 0.012
    return _logpoly(EQ_2_112, min(x, 0.285)) / 100.0


def burn_thresholds_cal_cm2(yield_kt: float) -> dict[str, float]:
    """Radiant exposure for 1st- and 2nd-degree burns, bare white skin (Fletcher Eqs. 2.110-2.111)."""
    w = min(max(yield_kt, 1.0), 20_000.0)
    return {"first_degree": _logpoly(EQ_2_110, w), "second_degree": _logpoly(EQ_2_111, w)}


def fresnel_reflectance(incidence_rad: float, n: float = WATER_REFRACTIVE_INDEX) -> float:
    """Unpolarized reflectance of a flat water surface (mobley_fresnel Eq. 5; Eq. 6 at normal incidence)."""
    ti = min(abs(incidence_rad), math.radians(89.999))
    if ti < 1e-6:
        return ((n - 1) / (n + 1)) ** 2
    tt = math.asin(math.sin(ti) / n)
    rs = math.sin(ti - tt) ** 2 / math.sin(ti + tt) ** 2
    rp = math.tan(ti - tt) ** 2 / math.tan(ti + tt) ** 2
    return 0.5 * (rs + rp)


@dataclass
class ThermalAtSurface:
    ground_range_m: float
    incidence_deg: float                 # angle of the direct rays from vertical
    exposure_cal_cm2: float              # on a surface facing the fireball
    exposure_horizontal_cal_cm2: float   # on the flat sea (cosine of incidence)
    reflectance: float
    into_water_j_m2: float
    t_max_s: float
    burns: dict[str, bool]
    warnings: list[str] = field(default_factory=list)


def at_surface(yield_kt: float, height_m: float, ground_range_m: float) -> ThermalAtSurface:
    """Thermal radiation arriving at one point on the sea surface."""
    if height_m < 0:
        raise NotImplementedError("Underwater bursts: thermal radiation is absorbed by the water (glasstone1977 sec. 7.21).")
    warnings = ["Clear-day fit (50-mile visibility); haze, fog or rain lower the exposure (glasstone1977 sec. 7.13-7.15)."]
    q = radiant_exposure_cal_cm2(yield_kt, height_m, ground_range_m)
    slant_mi = math.hypot(ground_range_m, height_m) / M_PER_MILE
    if not (0.05 <= slant_mi <= 50):
        warnings.append("Outside the 0.05-50 mile range of Fletcher's fit.")
    if height_m > 15_000 * units.FT_TO_M:
        warnings.append("Burst above 15,000 ft: pulse-timing formula not valid (glasstone1977 sec. 7.85).")
    inc = math.atan2(ground_range_m, max(height_m, 0.0))
    cos_inc = math.cos(inc) if not is_contact_burst(yield_kt, height_m) else 0.0
    q_h = q * cos_inc
    r = fresnel_reflectance(inc)
    into = q_h * (1.0 - r) * CAL_CM2_TO_J_M2
    th = burn_thresholds_cal_cm2(yield_kt)
    burns = {
        "first_degree": q >= th["first_degree"],
        "second_degree": q >= th["second_degree"],
        "second_degree_dark_skin": q >= th["second_degree"] * DARK_SKIN_FACTOR,
    }
    if is_contact_burst(yield_kt, height_m):
        warnings.append("Contact burst: the fireball lies on the water; heating of the sea near it is not modelled.")
    return ThermalAtSurface(ground_range_m, math.degrees(inc), q, q_h, r, into, time_of_maximum_s(yield_kt), burns, warnings)
