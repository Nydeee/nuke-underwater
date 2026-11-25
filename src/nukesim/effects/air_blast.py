"""Air blast from a nuclear burst above the water, evaluated AT the water surface.

Plain-language summary
----------------------
* Peak overpressure on the water surface for any burst height comes from Brode's
  height-of-burst fit (brode1987 Eq. 62). It already includes the reflection
  off the surface and the Mach stem, so we never "double" it again.
* Arrival time, positive-phase duration and impulse come from Brode's free-air
  fits (Eqs. 40, 45, 48). Following Brode's own rule for a burst at a surface,
  durations and impulses use twice the yield ("2W") to account for the reflection.
* The pressure-time SHAPE is the standard Friedlander form (friedlander1946),
  with its decay chosen so the area under the curve matches Brode's impulse.

Brode's fits assume an "ideal" flat reflecting surface at sea level. Water is
about as close to that as real surfaces get (glasstone1977 Table 3.83).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import brentq

from .. import units
from ..uncertainty import factor

# Unit helpers: Brode works in kilofeet (kft), milliseconds and psi.
M_PER_KFT = 1000.0 * units.FT_TO_M


def _scale(yield_kt: float) -> float:
    """Brode's scale factor m = W^(1/3)."""
    return yield_kt ** (1.0 / 3.0)


# ---------------------------------------------------------------------------
# Brode 1987 Eq. 33 -- free-air peak overpressure (psi), r in kft/kt^(1/3)
# Valid 0.07 < dP < 400,000 psi.
# ---------------------------------------------------------------------------
def brode_free_air_psi(r_scaled_kft: float) -> float:
    r = r_scaled_kft
    return 2.0 / r + 3.0 / r**1.5 + (1.6 / r**3) * (1.0 + 105.0 * (10 * r) ** 4 / (1.0 + 12_920.0 * (10 * r) ** 8))


# ---------------------------------------------------------------------------
# Brode 1987 Eq. 62 -- peak overpressure vs scaled ground range x and scaled
# burst height y (both kft/kt^(1/3)), in psi. Coefficients from pp. 70-71.
# ---------------------------------------------------------------------------
def brode_hob_psi(x: float, y: float) -> float:
    x = max(x, 1e-4)  # z = y/x is singular at ground zero
    y = max(y, 0.0)
    z = y / x
    r = math.hypot(x, y)
    a = 1.22 - 3.908 * z**2 / (1 + 810.2 * z**5)
    b = (2.321 + 6.195 * z**18 / (1 + 1.113 * z**18) - 0.03831 * z**17 / (1 + 0.02415 * z**17)
         + 0.6692 / (1 + 4164 * z**8))
    c = 4.153 - 1.149 * z**18 / (1 + 1.641 * z**18) - 1.1 / (1 + 2.771 * z**2.5)
    d = -4.166 + 25.76 * z**1.75 / (1 + 1.382 * z**18) + 8.257 * z / (1 + 3.219 * z)
    e = 1 - 0.004642 * z**18 / (1 + 0.003886 * z**18)
    f = 0.6096 + 2.879 * z**9.25 / (1 + 2.359 * z**14.5) - 17.15 * z**2 / (1 + 71.66 * z**3)
    g = 1.83 + 5.361 * z**2 / (1 + 0.3139 * z**6)
    h = (8.808 * z**1.5 / (1 + 154.5 * z**3.5) - (0.2905 + 64.67 * z**5) / (1 + 441.5 * z**5)
         - 1.389 * z / (1 + 49.03 * z**5)
         + 1.094 * r**2 / ((781.2 - 123.4 * r + 37.98 * r**1.5 + r**2) * (1 + 2 * y)))
    j = 0.000629 * y**4 / (3.493e-9 + y**4) - 2.67 * y**2 / (1 + 1e7 * y**4.3)
    k = 5.18 + 0.2803 * y**3.5 / (3.788e-6 + y**4)
    return 10.47 / r**a + b / r**c + d * e / (1 + f * r**g) + h + j / r**k


# ---------------------------------------------------------------------------
# Brode 1987 Eq. 40 -- arrival time (ms) vs shock radius sr (kft), free air.
# Valid 620 us to 26 s at 1 kt.
# ---------------------------------------------------------------------------
def brode_arrival_ms(yield_kt: float, sr_kft: float) -> float:
    m = _scale(yield_kt)
    s = sr_kft
    return (0.54291 * m**3 - 21.185 * s * m**2 + 361.8 * s**2 * m + 2383 * s**3) / (m**2 + 2.048 * s * m + 2.6872 * s**2)


# ---------------------------------------------------------------------------
# Brode 1987 Eq. 45 -- positive-phase duration (ms) vs peak overpressure (psi).
# Brode 1987 Eq. 48 -- positive-phase impulse (psi*ms) vs peak overpressure.
# For a burst at a surface, use 2W in m (Brode p.36 and p.38).
# ---------------------------------------------------------------------------
def brode_duration_ms(yield_kt: float, dp_psi: float) -> float:
    m = _scale(yield_kt)
    pi = dp_psi / 1000.0
    return m * (-148.6 + 497.3 / (1 + 18.68 * pi**0.6783) + 1629 * pi**0.8711 / (1 + 6.477 * pi**0.8555))


def brode_impulse_psi_ms(yield_kt: float, dp_psi: float) -> float:
    m = _scale(yield_kt)
    return 145.0 * dp_psi**0.5 / (1 + 0.00385 * dp_psi**0.5) * m


# ---------------------------------------------------------------------------
# Friedlander waveform  p(t) = P (1 - t/D) exp(-b t / D),  0 <= t <= D
# Impulse = P D [1/b - (1 - e^-b)/b^2]
# ---------------------------------------------------------------------------
def friedlander_impulse_ratio(b: float) -> float:
    """Impulse / (P*D) for decay parameter b (tends to 0.5 as b -> 0)."""
    if b < 1e-6:
        return 0.5 - b / 6.0
    return 1.0 / b - (1.0 - math.exp(-b)) / b**2


def solve_friedlander_b(impulse: float, peak: float, duration: float) -> float:
    """Decay parameter b so that the waveform has the requested impulse."""
    ratio = impulse / (peak * duration)
    if ratio >= 0.5:  # b = 0 (straight-line decay) is the fullest Friedlander shape
        return 0.0
    return brentq(lambda b: friedlander_impulse_ratio(b) - ratio, 1e-9, 500.0)


def friedlander(t: np.ndarray, peak: float, duration: float, b: float) -> np.ndarray:
    tt = np.clip(t, 0.0, None)
    p = peak * (1.0 - tt / duration) * np.exp(-b * tt / duration)
    return np.where((t >= 0.0) & (t <= duration), p, 0.0)


# ---------------------------------------------------------------------------
# Public SI interface
# ---------------------------------------------------------------------------
def fireball_touches_water(yield_kt: float, height_m: float) -> bool:
    """glasstone1977 Eq. 2.128.1: H < 180 W^0.4 ft (+-30%).

    Glasstone gives this as the height below which local fallout becomes serious,
    which is tied to the fireball reaching the surface. Using it as the
    'fireball touches the water' height is a common interpretation, flagged as such.
    """
    return height_m < 180.0 * yield_kt**0.4 * units.FT_TO_M


def is_contact_burst(yield_kt: float, height_m: float) -> bool:
    """glasstone1977 sec. 2.127 footnote: within 5 W^0.3 ft of the surface."""
    return abs(height_m) <= 5.0 * yield_kt**0.3 * units.FT_TO_M


@dataclass
class SurfaceBlast:
    ground_range_m: float
    peak_overpressure_pa: float
    arrival_time_s: float
    duration_s: float
    impulse_pa_s: float
    friedlander_b: float
    trace_speed_m_s: float
    warnings: list[str] = field(default_factory=list)

    def overpressure(self, t: np.ndarray) -> np.ndarray:
        """Overpressure (Pa) at this point on the surface; t in s after detonation."""
        return friedlander(np.asarray(t) - self.arrival_time_s, self.peak_overpressure_pa, self.duration_s, self.friedlander_b)


def peak_overpressure_pa(yield_kt: float, height_m: float, ground_range_m: float) -> float:
    m = _scale(yield_kt)
    x = ground_range_m / M_PER_KFT / m
    y = height_m / M_PER_KFT / m
    return brode_hob_psi(x, y) * units.PSI_TO_PA * factor("brode_peak")


def arrival_time_s(yield_kt: float, height_m: float, ground_range_m: float) -> float:
    sr_kft = math.hypot(ground_range_m, height_m) / M_PER_KFT
    return brode_arrival_ms(yield_kt, sr_kft) / 1000.0


def trace_speed_m_s(yield_kt: float, height_m: float, ground_range_m: float) -> float:
    """Speed at which the blast front sweeps across the water surface (dr/dt of arrival)."""
    h = max(1.0, 1e-4 * max(ground_range_m, height_m, 1.0))
    r1, r2 = max(ground_range_m - h, 0.0), ground_range_m + h
    dt = arrival_time_s(yield_kt, height_m, r2) - arrival_time_s(yield_kt, height_m, r1)
    return math.inf if dt <= 0 else (r2 - r1) / dt


def surface_blast(yield_kt: float, height_m: float, ground_range_m: float) -> SurfaceBlast:
    """Everything about the air blast at one point on the water surface."""
    if height_m < 0:
        raise ValueError("air_blast is for bursts at or above the surface (height_m >= 0)")
    warnings: list[str] = []
    p_pa = peak_overpressure_pa(yield_kt, height_m, ground_range_m)
    p_psi = p_pa * units.PA_TO_PSI
    w_surface = 2.0 * yield_kt  # Brode's surface-burst rule for durations/impulses
    d_s = brode_duration_ms(w_surface, p_psi) / 1000.0
    i_pa_s = brode_impulse_psi_ms(w_surface, p_psi) * units.PSI_TO_PA / 1000.0
    if p_psi > 15_000:
        warnings.append("Overpressure > 15,000 psi: pressure-time shape unreliable this close (brode1987 p.41).")
    if not (2.0 <= p_psi <= 100_000):
        warnings.append("Impulse fit is only good to 10% for 2-100,000 psi (brode1987 p.38).")
    if fireball_touches_water(yield_kt, height_m):
        warnings.append("Fireball likely reaches the water: vaporisation and direct water shock not modelled here.")
    b = solve_friedlander_b(i_pa_s, p_pa, d_s)
    return SurfaceBlast(
        ground_range_m=ground_range_m,
        peak_overpressure_pa=p_pa,
        arrival_time_s=arrival_time_s(yield_kt, height_m, ground_range_m),
        duration_s=d_s,
        impulse_pa_s=i_pa_s,
        friedlander_b=b,
        trace_speed_m_s=trace_speed_m_s(yield_kt, height_m, ground_range_m),
        warnings=warnings,
    )
