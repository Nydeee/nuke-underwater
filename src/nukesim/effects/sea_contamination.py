"""Fallout radioactivity in the sea: sinking, mixing, decay, and dose rates.

Plain-language summary
----------------------
* Amount: glasstone1977 sec. 9.159 -- the fission products of 1 kt (fission)
  give about 530 gamma-megacuries at 1 hour, average gamma energy about 0.7 MeV,
  which over 1 square mile gives 2,900 rads/hr (sec. 9.160). So a reference dose
  rate R1 (rads/hr) corresponds to a gamma activity per square metre of sea.
* Sinking and mixing (redwing1956): the activity starts in the top 10-20 m,
  sinks at 3-4 m per hour, and stops at the thermocline (40-60 m), staying
  roughly uniform above it for at least 2 days.
* Decay: dose rate falls as t^-1.2 (glasstone1977 Eq. 9.147.1; within 25% to
  about 2 weeks and a factor of 2 to about 6 months, sec. 9.15).
* Dose to something immersed in the contaminated layer: all the gamma energy
  released around it is absorbed around it ("infinite medium"), so
      dose rate = concentration (Bq/kg) x 0.7 MeV.
  It is about half that at the surface, and fades below the thermocline.
  The fading near those boundaries uses an exponential with the water
  tenth-value thickness for fission-product gammas (glasstone1977 Table 8.41);
  that edge shape is OUR approximation and matters only within ~1 m of them.
* Above the water (a boat): about half the in-water value at the surface.

Check: this reproduces Redwing's factor of ~1,000 between land and sea dose rates
(see the tests).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from ..scenario import Burst, Environment, Receiver
from . import fallout as fo
from .radiation_shielding import gamma_tvt_m

M2_PER_SQ_MILE = 1609.344**2
CI_TO_BQ = 3.7e10
GAMMA_MCI_PER_KT_1H = 530.0          # glasstone1977 sec. 9.159
R1_PER_KT_PER_SQMI = 2900.0           # glasstone1977 sec. 9.160 (rads/hr at 1 h)
MEAN_GAMMA_MEV = 0.7                  # glasstone1977 sec. 9.159
MEV_TO_J = 1.602176634e-13
RAD_TO_GY = 0.01

# redwing1956 (WT-1317 sec. 3.2.5; summary report sec. 3.4)
INITIAL_MIX_DEPTH_M = 15.0            # 10-20 m
SINK_RATE_M_PER_H = 3.5               # 3-4 m/h
DEFAULT_THERMOCLINE_M = 60.0          # 40-60 m


def gamma_bq_per_m2_at_1h(r1_rad_h: float) -> float:
    """Gamma activity per square metre of sea at 1 h that corresponds to a land reference dose rate R1."""
    bq_per_kt = GAMMA_MCI_PER_KT_1H * 1e6 * CI_TO_BQ
    return r1_rad_h / R1_PER_KT_PER_SQMI * bq_per_kt / M2_PER_SQ_MILE


def decay_factor(t_h: np.ndarray | float) -> np.ndarray | float:
    """Fraction of the 1-hour activity remaining at time t (hours): t^-1.2."""
    return np.power(t_h, -1.2)


def mixing_depth_m(t_since_deposit_h, thermocline_m: float = DEFAULT_THERMOCLINE_M,
                   water_depth_m: float = math.inf):
    """Depth of the contaminated layer vs time since the fallout landed (redwing1956)."""
    h = INITIAL_MIX_DEPTH_M + SINK_RATE_M_PER_H * np.maximum(t_since_deposit_h, 0.0)
    return np.minimum(np.minimum(h, thermocline_m), water_depth_m)


def depth_factor(depth_m: float, layer_m, density: float = 1025.0):
    """Fraction of the infinite-medium dose rate at a depth, for a uniform layer 0..layer."""
    lam = gamma_tvt_m(density, conservative=False) / math.log(10)   # attenuation length (approx.)
    layer = np.asarray(layer_m, dtype=float)
    inside = 1.0 - 0.5 * np.exp(-depth_m / lam) - 0.5 * np.exp(-(layer - depth_m) / lam)
    below = 0.5 * np.exp(-(depth_m - layer) / lam)
    return np.where(depth_m <= layer, inside, below)


@dataclass
class SeaDose:
    times_h: np.ndarray
    dose_rate_gy_h: tuple[np.ndarray, np.ndarray]        # (low, high) at the receiver
    accumulated_gy: tuple[np.ndarray, np.ndarray]
    layer_depth_m: np.ndarray
    arrival_time_h: float
    r1_rad_h: tuple[float, float]
    warnings: list[str] = field(default_factory=list)


def infinite_medium_dose_rate_gy_h(bq_per_m2: float, layer_m, density: float = 1025.0):
    """Dose rate (Gy/h) deep inside a uniformly contaminated layer."""
    bq_per_kg = bq_per_m2 / (np.asarray(layer_m) * density)
    return bq_per_kg * MEAN_GAMMA_MEV * MEV_TO_J * 3600.0


def compute(burst: Burst, receiver: Receiver, env: Environment | None = None, *, wind_mph: float = 15.0,
            wind_dir_deg: float = 0.0, fission_fraction: float = 1.0,
            thermocline_m: float = DEFAULT_THERMOCLINE_M, t_end_h: float = 24.0 * 30) -> SeaDose:
    """Fallout dose rate and accumulated dose for a receiver in (or on a boat above) the sea."""
    env = env or Environment()
    fa = fo.fallout_at(burst.yield_kt, burst.z_m, receiver.x_m, receiver.y_m, wind_mph, wind_dir_deg, fission_fraction)
    warnings = list(fa.warnings)
    if not math.isfinite(fa.arrival_time_h):   # no local fallout at all
        times = np.geomspace(1.0, max(t_end_h, 1.01), 600)
        zero = np.zeros_like(times)
        return SeaDose(times, (zero, zero), (zero, zero), np.zeros_like(times), math.inf, fa.r1_rad_h, warnings)
    t0 = max(fa.arrival_time_h, 1.0)  # Eq. 9.147.1 is used from 1 h on, once fallout has arrived
    times = np.geomspace(t0, max(t_end_h, t0 * 1.01), 600)
    layer = mixing_depth_m(times - fa.arrival_time_h, thermocline_m, env.water_depth_m)
    depth = receiver.depth_m
    rates = []
    for r1 in fa.r1_rad_h:
        a1 = gamma_bq_per_m2_at_1h(r1)
        d_inf = infinite_medium_dose_rate_gy_h(a1, layer, env.density_kg_m3) * decay_factor(times)
        if receiver.z_m >= 0:   # on a boat / above water: half the surface infinite-medium value
            rates.append(0.5 * d_inf)
        else:
            rates.append(d_inf * depth_factor(depth, layer, env.density_kg_m3))
    acc = tuple(np.concatenate([[0.0], np.cumsum(0.5 * (r[1:] + r[:-1]) * np.diff(times))]) for r in rates)
    if fa.r1_rad_h[1] > 0:
        warnings.append("Neutron-activated seawater (Na-24, Cl-38) not included: Redwing found Na-24 gave "
                        "33-65% of the dose rate at 24 h for water-surface shots, so early values may be low.")
        warnings.append("0.7 MeV average gamma energy is the 1-hour value; it changes as the mix decays.")
    if t_end_h > 24 * 180:
        warnings.append("t^-1.2 decay is only good to about a factor of 2 up to ~6 months (glasstone1977 sec. 9.15).")
    return SeaDose(times, (rates[0], rates[1]), acc, layer, fa.arrival_time_h, fa.r1_rad_h, warnings)
