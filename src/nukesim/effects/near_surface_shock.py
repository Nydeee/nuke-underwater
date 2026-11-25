"""Shock driven straight into the water by bursts at or near the surface.

Plain-language summary
----------------------
When the fireball touches the water, much of the explosion's energy vents into
the air instead of the water. EM-1 (as reproduced in em1_dtra2004, pp. 4-5)
describes this with a "coupling coefficient" eps: the fraction of the peak
pressure a fully submerged burst would give.

    P_max = A * eps / R^n   [psi],  R in ft/kt^(1/3)
    A = 1e4 * 217.6^n,  n = 1.4 exp(-D/35.4) + 1.13

D is the receiver's scaled depth (ft/kt^(1/3), valid 2.5-100); n grows for
shallow receivers, which accounts for the surface reflection.

Coupling depends on the scaled burst depth x (ft/kt^(1/3), negative = above the
water) and on yield:
* below 1 kt (eps_L): fully given.
* above 20 kt (eps_H): given only for 0 <= x <= 0.82. EM-1's functions F (above
  water) and G (deeper) are not printed in the source we could read, so OUR
  stand-ins are used and labelled:
    - above the water: eps_L(x) * eps_H(0)/eps_L(0)
    - deeper: G(x) = -0.36(x-0.82) - 0.011(x-0.82)^2, i.e. the eps_L shape shifted
      to start at 0.82 (it reaches full coupling, eps = 1.00, at x = 15 as EM-1 says).
* 1-20 kt: EM-1's interpolation eps_I = eps_H - (W-20)(eps_L - eps_H)/19.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .. import units
from ..scenario import Burst, Environment, Receiver
from ..uncertainty import factor
from . import underwater_shock

X_MIN, X_MAX = -10.0, 15.0     # range of the EM-1 coupling fits (ft/kt^(1/3))


def scaled_depth_ft(yield_kt: float, depth_below_surface_m: float) -> float:
    """Scaled depth in ft/kt^(1/3) (negative = above the surface)."""
    return depth_below_surface_m * units.M_TO_FT / yield_kt ** (1.0 / 3.0)


def eps_low(x: float) -> float:
    """EM-1 coupling for yields below 1 kt (em1_dtra2004)."""
    if x <= 0:
        return 0.2 * math.exp(1.268 * (math.exp(0.76 * x) - 1.0) + 0.128 * x)
    return 0.2 * math.exp(1.109 * (1.0 - math.exp(-0.36 * x - 0.011 * x * x)) + 0.0334 * x)


def eps_high(x: float) -> float:
    """EM-1 coupling for yields above 20 kt; outside 0 <= x <= 0.82 uses OUR stand-ins (see module doc)."""
    if x < 0:
        return eps_low(x) * 0.018 / eps_low(0.0)
    if x <= 0.82:
        return 0.018 * math.exp(2.967 * x)
    s = x - 0.82
    g = -0.36 * s - 0.011 * s * s
    return 0.205 * math.exp(1.109 * (1.0 - math.exp(g)) + 0.0336 * s)


def coupling(yield_kt: float, x: float) -> float:
    """Coupling coefficient eps for any yield (EM-1 interpolation between 1 and 20 kt)."""
    x = min(max(x, X_MIN), X_MAX)
    if yield_kt <= 1.0:
        eps = eps_low(x)
    elif yield_kt >= 20.0:
        eps = eps_high(x)
    else:
        el, eh = eps_low(x), eps_high(x)
        eps = eh - (yield_kt - 20.0) * (el - eh) / 19.0
    return min(1.0, eps * factor("coupling"))


def in_regime(burst: Burst) -> bool:
    """True if the burst is within EM-1's near-surface range (-10 to +15 ft/kt^(1/3))."""
    x = scaled_depth_ft(burst.yield_kt, -burst.z_m)
    return X_MIN <= x <= X_MAX


def em1_peak_psi(yield_kt: float, eps: float, slant_m: float, receiver_depth_m: float) -> tuple[float, list[str]]:
    w3 = yield_kt ** (1.0 / 3.0)
    r = slant_m * units.M_TO_FT / w3
    d = receiver_depth_m * units.M_TO_FT / w3
    warnings = []
    if not (2.5 <= d <= 100):
        warnings.append("Receiver scaled depth outside EM-1's 2.5-100 ft/kt^(1/3) range for the exponent n.")
        d = min(max(d, 2.5), 100.0)
    n = 1.4 * math.exp(-d / 35.4) + 1.13
    a = 1e4 * 217.6**n
    return a * eps / r**n, warnings


@dataclass
class NearSurfaceShock:
    scaled_burst_depth_ft: float
    coupling: float
    slant_range_m: float
    peak_pressure_pa: float
    arrival_time_s: float
    time_constant_s: float
    warnings: list[str] = field(default_factory=list)

    def pressure_history(self, t: np.ndarray) -> np.ndarray:
        """Exponential pulse with Section 1's free-water time constant (OUR assumed shape)."""
        dt = np.asarray(t) - self.arrival_time_s
        return np.where(dt >= 0, self.peak_pressure_pa * np.exp(-np.clip(dt, 0, None) / self.time_constant_s), 0.0)


def compute(burst: Burst, receiver: Receiver, env: Environment | None = None) -> NearSurfaceShock:
    env = env or Environment()
    if receiver.z_m > 0:
        raise ValueError("receiver must be in the water")
    x = scaled_depth_ft(burst.yield_kt, -burst.z_m)
    warnings = []
    if not (X_MIN <= x <= X_MAX):
        warnings.append("Burst outside the near-surface range: use underwater_shock (deeper) or air_to_water (higher).")
    eps = coupling(burst.yield_kt, x)
    src_z = min(burst.z_m, 0.0)   # treat the source as at the surface if above it
    slant = math.sqrt(receiver.x_m**2 + receiver.y_m**2 + (receiver.z_m - src_z) ** 2)
    psi, w = em1_peak_psi(burst.yield_kt, eps, max(slant, 1.0), receiver.depth_m)
    warnings += w
    if burst.yield_kt > 20 and (x < 0 or x > 0.82):
        warnings.append("Large-yield coupling here uses OUR stand-in for EM-1's unprinted functions.")
    elif 1 < burst.yield_kt < 20 and (x < 0 or x > 0.82):
        warnings.append("Coupling interpolates toward a large-yield value that uses OUR stand-in.")
    warnings.append("Pulse shape assumed like a free-water shock (Section 1 time constant).")
    if psi > underwater_shock.SIMILITUDE_MAX_PRESSURE_PSI:
        warnings.append("Very close in (> 30,000 psi): the formula is unreliable.")
    return NearSurfaceShock(x, eps, slant, psi * units.PSI_TO_PA, slant / env.sound_speed_m_s,
                            underwater_shock.time_constant_s(burst.yield_kt, max(slant, 1.0)), warnings)
