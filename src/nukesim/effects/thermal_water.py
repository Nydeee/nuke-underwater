"""How the fireball's heat and light are absorbed by the sea, layer by layer.

Plain-language summary
----------------------
* The radiation reaching the water is treated as a 6,000 K blackbody spectrum
  (glasstone1977 sec. 7.76: "about 6,000 to 7,000 K").
* Each wavelength fades with depth as exp(-a z) (Beer-Lambert), using measured
  absorption of pure water: popefry1997 for 380-700 nm, segelstein1981 elsewhere.
  Infrared is absorbed within millimetres; blue-green light reaches tens of metres.
* The energy absorbed in each thin layer warms it: dT = E / (rho c dz), with
  seawater specific heat from sharqawy2010 (Eq. 9). Above 100 C the extra energy
  boils water off (latent heat from sharqawy2010 Eq. 54).

Big caveat (upper estimate near the surface): the atmosphere's water vapour has
already removed many of the same infrared wavelengths that seawater absorbs in its
top millimetre, and that filtering is NOT modelled. Heat conduction during the
pulse (about a millimetre over seconds) is also ignored.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.resources import files

import numpy as np

H = 6.62607015e-34
C = 2.99792458e8
KB = 1.380649e-23
FIREBALL_TEMPERATURE_K = 6000.0          # glasstone1977 sec. 7.76
SEAWATER_CP = 3999.0                     # J/kg/K, sharqawy2010 Eq. 9 at 20 C, 35 g/kg
WATER_REFRACTIVE_INDEX = 1.34


def latent_heat_j_kg(t_c: float = 100.0) -> float:
    """sharqawy2010 Eq. 54: latent heat of vaporization of water (J/kg), 0-200 C."""
    return 2.501e6 - 2.369e3 * t_c + 2.678e-1 * t_c**2 - 8.103e-3 * t_c**3 - 2.079e-5 * t_c**4


def _read(name: str) -> np.ndarray:
    text = files("nukesim.data").joinpath(name).read_text(errors="replace")
    rows = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2:
            try:
                rows.append((float(parts[0]), float(parts[1])))
            except ValueError:
                pass
    return np.array(rows)


@lru_cache(maxsize=1)
def absorption_table() -> tuple[np.ndarray, np.ndarray]:
    """(wavelength_m, absorption_1_per_m): Pope & Fry 380-700 nm, Segelstein elsewhere."""
    seg = _read("water_absorption_segelstein1981.txt")
    pf = _read("water_absorption_popefry1997.txt")
    keep = (seg[:, 0] < 380) | (seg[:, 0] > 700)
    merged = np.vstack([seg[keep], pf])
    merged = merged[np.argsort(merged[:, 0])]
    return merged[:, 0] * 1e-9, merged[:, 1] * 100.0


def absorption_per_m(wavelength_m: np.ndarray) -> np.ndarray:
    wl, a = absorption_table()
    return np.exp(np.interp(np.log(wavelength_m), np.log(wl), np.log(a)))


@lru_cache(maxsize=4)
def spectrum(temperature_k: float = FIREBALL_TEMPERATURE_K, n: int = 4000):
    """Wavelengths (m) and energy weights (sum to 1) of a blackbody, 0.2-50 um."""
    wl = np.geomspace(0.2e-6, 50e-6, n)
    b = wl**-5 / np.expm1(H * C / (wl * KB * temperature_k))
    w = b * np.gradient(wl)
    return wl, w / w.sum()


def fraction_remaining(depth_m, refracted_cos: float = 1.0, temperature_k: float = FIREBALL_TEMPERATURE_K):
    """Fraction of the energy that entered the water still travelling at depth z."""
    wl, w = spectrum(temperature_k)
    a = absorption_per_m(wl)
    z = np.atleast_1d(np.asarray(depth_m, dtype=float))
    path = z / refracted_cos
    return (w[None, :] * np.exp(-np.outer(path, a))).sum(axis=1)


@dataclass
class WaterHeating:
    depth_edges_m: np.ndarray
    absorbed_j_m2: np.ndarray            # energy absorbed in each layer
    temperature_rise_c: np.ndarray       # if no boiling and no conduction
    final_temperature_c: np.ndarray      # capped at 100 C
    evaporated_mm: float
    warnings: list[str] = field(default_factory=list)


def heat_profile(into_water_j_m2: float, incidence_deg: float = 0.0, start_temp_c: float = 20.0,
                 density: float = 1025.0, max_depth_m: float = 100.0, n_layers: int = 300) -> WaterHeating:
    """Temperature rise vs depth for a given energy per m^2 entering the water."""
    edges = np.concatenate([[0.0], np.geomspace(1e-6, max_depth_m, n_layers)])
    cos_t = math.cos(math.asin(math.sin(math.radians(incidence_deg)) / WATER_REFRACTIVE_INDEX))
    frac = fraction_remaining(edges, cos_t)
    absorbed = into_water_j_m2 * (frac[:-1] - frac[1:])
    dz = np.diff(edges)
    dT = absorbed / (density * SEAWATER_CP * dz)
    to_boil = max(100.0 - start_temp_c, 0.0)
    excess_j = np.clip(dT - to_boil, 0.0, None) * density * SEAWATER_CP * dz
    evaporated_kg = excess_j.sum() / latent_heat_j_kg(100.0)
    final = np.minimum(start_temp_c + dT, 100.0)
    warnings = [
        "Upper estimate near the surface: atmospheric water vapour would remove part of the infrared that "
        "seawater absorbs in its top millimetre (not modelled).",
        "Heat conduction during the pulse is ignored (it spreads heat about 1 mm over seconds).",
        "Pure-water absorption: plankton and sediment would stop visible light sooner.",
    ]
    return WaterHeating(edges, absorbed, dT, final, evaporated_kg / density * 1000.0, warnings)


def energy_at_depth_j_m2(into_water_j_m2: float, depth_m: float, incidence_deg: float = 0.0) -> float:
    cos_t = math.cos(math.asin(math.sin(math.radians(incidence_deg)) / WATER_REFRACTIVE_INDEX))
    return float(into_water_j_m2 * fraction_remaining(depth_m, cos_t)[0])
