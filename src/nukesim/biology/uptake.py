"""Radioactive elements from fallout in seawater, and how fish take them up.

Plain-language summary
----------------------
* Inventory: each kiloton of fission splits 1.45e23 nuclei (glasstone1977 Table
  1.45). A fixed percentage of those end up as each radioactive product -- its
  cumulative fission yield (jeff311). From that and the half-life we get each
  product's activity.
* Where it is: the fallout deposit at a sea location is expressed as "kilotons of
  fission products per square mile" using Glasstone's 2,900 rads/hr per kt/sq mi
  (sec. 9.160). Section 4's mixing model spreads it through the mixed layer.
* Uptake: fish concentrate some elements from seawater. The concentration factor
  (CF) is Bq per kg of fish divided by Bq per litre of water (trs422). Caesium is
  concentrated about 100x; strontium only about 3x.
* Dose from inside the fish: activity in the fish x ICRP dose coefficient for a
  reference flatfish (icrp136_draft).

Simplifications (all make the internal dose an UPPER estimate)
* Fish are assumed to be in equilibrium with the water at once; really it takes
  days to weeks.
* No fractionation: local fallout is depleted in caesium and strontium, whose
  precursors are gases (glasstone1977 sec. 9.14 mentions fractionation).
* No sideways dilution of the contaminated water by currents.
* Only the listed nuclides contribute to the internal dose.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

FISSIONS_PER_KT = 1.45e23     # glasstone1977 Table 1.45
DAY_S = 86400.0
YEAR_D = 365.25


@dataclass(frozen=True)
class Nuclide:
    name: str
    element: str
    half_life_d: float
    yield_fast: dict          # cumulative fast-fission yield per fission (jeff311)
    cf_fish: float            # L/kg (trs422 Table III, recommended)
    dc_int: float             # uGy/h per Bq/kg in the fish (icrp136_draft, Reference Flatfish)
    dc_ext: float             # uGy/h per Bq/L in the water (icrp136_draft, Reference Flatfish)
    note: str = ""

    @property
    def decay_const_per_h(self) -> float:
        return math.log(2) / (self.half_life_d * 24.0)


NUCLIDES = [
    Nuclide("Sr-89", "Sr", 50.563, {"U235": 0.043839, "Pu239": 0.01712, "U238": 0.030349}, 3, 3.2e-4, 1.5e-5),
    Nuclide("Sr-90", "Sr", 28.91 * YEAR_D, {"U235": 0.052208, "Pu239": 0.020307, "U238": 0.031109}, 3, 6.0e-4, 4.9e-5,
            "includes Y-90 daughter"),
    Nuclide("Zr-95", "Zr", 64.032, {"U235": 0.063488, "Pu239": 0.046825, "U238": 0.051883}, 20, 1.1e-4, 3.9e-4,
            "Nb-95 daughter not included"),
    Nuclide("Ru-103", "Ru", 39.247, {"U235": 0.032481, "Pu239": 0.065875, "U238": 0.060288}, 2, 8.6e-5, 2.6e-4),
    Nuclide("Ru-106", "Ru", 371.8, {"U235": 0.0046896, "Pu239": 0.041256, "U238": 0.025185}, 2, 7.2e-4, 2.2e-4,
            "includes Rh-106 daughter"),
    Nuclide("I-131", "I", 8.0252, {"U235": 0.033648, "Pu239": 0.040862, "U238": 0.03321}, 9, 1.3e-4, 2.0e-4),
    Nuclide("Cs-137", "Cs", 30.08 * YEAR_D, {"U235": 0.058889, "Pu239": 0.063518, "U238": 0.060222}, 100, 1.7e-4, 3.0e-4,
            "includes Ba-137m daughter"),
    Nuclide("Ba-140", "Ba", 12.751, {"U235": 0.059594, "Pu239": 0.053035, "U238": 0.059718}, 10, 5.9e-4, 1.3e-3,
            "includes La-140 daughter"),
    Nuclide("Ce-141", "Ce", 32.5, {"U235": 0.05795, "Pu239": 0.050082, "U238": 0.059311}, 50, 1.0e-4, 4.0e-5,
            "half-life not fetched from ENSDF"),
    Nuclide("Ce-144", "Ce", 284.91, {"U235": 0.050943, "Pu239": 0.035039, "U238": 0.046682}, 50, 6.7e-4, 1.1e-4,
            "includes Pr-144 daughter"),
]
FISSILE = ("U235", "Pu239", "U238")


def atoms_per_kt(nuc: Nuclide, fissile: str = "U235") -> float:
    return FISSIONS_PER_KT * nuc.yield_fast[fissile]


def activity_bq_per_kt(nuc: Nuclide, t_h, fissile: str = "U235"):
    """Activity (Bq) per kt of fission at t hours after the burst (all precursors decayed in)."""
    lam_s = nuc.decay_const_per_h / 3600.0
    return atoms_per_kt(nuc, fissile) * lam_s * np.exp(-nuc.decay_const_per_h * np.asarray(t_h))


def kt_fission_per_m2(r1_rad_h: float) -> float:
    """Fission products deposited per m^2 for a 1-hour reference dose rate R1 (glasstone1977 sec. 9.160)."""
    return r1_rad_h / 2900.0 / (1609.344**2)


@dataclass
class FishUptake:
    times_h: np.ndarray
    water_bq_per_l: dict          # nuclide -> array
    fish_bq_per_kg: dict          # nuclide -> array (equilibrium, upper estimate)
    internal_ugy_h: np.ndarray    # total internal dose rate in the fish


def fish_uptake(r1_rad_h: float, times_h: np.ndarray, layer_depth_m: np.ndarray, *, fissile: str = "U235",
                in_layer: np.ndarray | bool = True) -> FishUptake:
    """Water and fish concentrations and internal dose rate for a fish (zero where it is below the layer)."""
    kt_m2 = kt_fission_per_m2(r1_rad_h)
    water, fish = {}, {}
    internal = np.zeros_like(np.asarray(times_h, dtype=float))
    for n in NUCLIDES:
        bq_m2 = kt_m2 * activity_bq_per_kt(n, times_h, fissile)
        bq_per_l = bq_m2 / np.asarray(layer_depth_m) / 1000.0 * np.asarray(in_layer, dtype=float)
        water[n.name] = bq_per_l
        fish[n.name] = n.cf_fish * bq_per_l
        internal = internal + n.dc_int * fish[n.name]
    return FishUptake(np.asarray(times_h), water, fish, internal)
