"""Underwater shock wave from a nuclear burst (direct wave + surface cutoff).

How this model works (plain language)
------------------------------------
1. Explosions in water follow "similitude" (scaling) laws: if you scale the
   distance by the cube root of the charge size, every TNT charge produces the
   same peak pressure. Cole (1948) fitted these laws to TNT test data
   (equations quoted in USACE 1991, Eqs. 1-4).

2. A nuclear burst puts a smaller fraction of its energy into the water shock
   than TNT does (much of it goes into heating/vaporising water and radiation).
   We account for that with one factor, ``NUCLEAR_SHOCK_TNT_FACTOR``:
   "1 kt nuclear acts like f x 1 kt of TNT for the water shock". We do NOT make
   this number up: we solve for it from the one fully stated nuclear data point
   in Glasstone & Dolan (1977) sec. 6.41 (100 kt in deep water -> ~2,700 psi
   at 3,000 ft).

3. Near the water surface, the shock reflects off the surface as a tension
   wave (the "surface cutoff", Glasstone & Dolan sec. 6.43). We model this as a
   mirror-image burst above the surface whose pressure is subtracted. Water
   cannot hold much tension, so the total pressure is clipped at zero
   absolute pressure (a crude stand-in for cavitation).

Known limitations (to be improved in later sections)
----------------------------------------------------
* Single-point calibration. Glasstone Fig. 6.115 should be digitised to check
  the whole pressure-vs-range curve.
* Sea-floor reflection is not modelled (USACE 1991 p. 4 notes it lengthens the
  pulse and can raise peaks by up to ~2x).
* Bubble pulses (second shock waves) are not included here.
* Real decay is exponential only at early times (Glasstone sec. 6.116).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .. import units
from ..geometry import image_range_m, slant_range_m
from ..scenario import Burst, Environment, Receiver

# ---------------------------------------------------------------------------
# TNT similitude coefficients  [usace1991 Eqs. (2)-(4), quoting cole1948]
#   lambda = R / W^(1/3), R in ft, W in lb TNT
#   Pm    = 21,600 * lambda^-1.13          (psi)
#   theta = 6.0e-5 * W^(1/3) * lambda^0.18 (s)
#   I     = 1.46 * W^(1/3) * lambda^-0.89  (psi*s)
# ---------------------------------------------------------------------------
TNT_PM_COEFF_PSI = 21_600.0
TNT_PM_EXP = 1.13
TNT_THETA_COEFF_S = 6.0e-5
TNT_THETA_EXP = 0.18
TNT_IMPULSE_COEFF_PSI_S = 1.46
TNT_IMPULSE_EXP = 0.89

# usace1991 p.2: shock speed ~5,000 ft/s is valid for pressures below 30,000 psi.
SIMILITUDE_MAX_PRESSURE_PSI = 30_000.0

# ---------------------------------------------------------------------------
# Nuclear calibration point  [glasstone1977 sec. 6.41]
# "the peak overpressure at 3,000 feet from a 100-kiloton burst in deep water
#  is about 2,700 pounds per square inch"
# ---------------------------------------------------------------------------
GLASSTONE_641_YIELD_KT = 100.0
GLASSTONE_641_RANGE_FT = 3_000.0
GLASSTONE_641_PRESSURE_PSI = 2_700.0


# ---------------------------------------------------------------------------
# Pure TNT formulas (US customary units, exactly as published)
# ---------------------------------------------------------------------------
def tnt_peak_pressure_psi(w_lb: float, r_ft: float) -> float:
    lam = r_ft / w_lb ** (1.0 / 3.0)
    return TNT_PM_COEFF_PSI * lam ** (-TNT_PM_EXP)


def tnt_time_constant_s(w_lb: float, r_ft: float) -> float:
    lam = r_ft / w_lb ** (1.0 / 3.0)
    return TNT_THETA_COEFF_S * w_lb ** (1.0 / 3.0) * lam**TNT_THETA_EXP


def tnt_impulse_psi_s(w_lb: float, r_ft: float) -> float:
    lam = r_ft / w_lb ** (1.0 / 3.0)
    return TNT_IMPULSE_COEFF_PSI_S * w_lb ** (1.0 / 3.0) * lam ** (-TNT_IMPULSE_EXP)


def _solve_nuclear_factor() -> float:
    """Find f such that f * 100 kt of TNT gives 2,700 psi at 3,000 ft."""
    # Invert Pm = C * (R / W^(1/3))^-a  ->  W = (R * (P/C)^(1/a))^3
    w_eff_lb = (GLASSTONE_641_RANGE_FT * (GLASSTONE_641_PRESSURE_PSI / TNT_PM_COEFF_PSI) ** (1.0 / TNT_PM_EXP)) ** 3
    return w_eff_lb / units.kt_to_lb_tnt(GLASSTONE_641_YIELD_KT)


#: Fraction of nuclear yield that is "TNT-equivalent" for the water shock (~0.54).
NUCLEAR_SHOCK_TNT_FACTOR: float = _solve_nuclear_factor()


def effective_tnt_lb(yield_kt: float) -> float:
    """TNT mass (lb) that produces the same water shock as the nuclear yield."""
    return NUCLEAR_SHOCK_TNT_FACTOR * units.kt_to_lb_tnt(yield_kt)


# ---------------------------------------------------------------------------
# SI-unit nuclear free-field functions
# ---------------------------------------------------------------------------
def peak_pressure_pa(yield_kt: float, slant_range_m: float) -> float:
    """Free-field peak shock overpressure (Pa) at a slant range (m)."""
    return tnt_peak_pressure_psi(effective_tnt_lb(yield_kt), slant_range_m * units.M_TO_FT) * units.PSI_TO_PA


def time_constant_s(yield_kt: float, slant_range_m: float) -> float:
    """Time for the pressure to decay to 1/e (~37%) of its peak (Glasstone sec. 6.116)."""
    return tnt_time_constant_s(effective_tnt_lb(yield_kt), slant_range_m * units.M_TO_FT)


def impulse_pa_s(yield_kt: float, slant_range_m: float) -> float:
    """Free-field shock impulse (Pa*s), i.e. area under the pressure-time curve."""
    return tnt_impulse_psi_s(effective_tnt_lb(yield_kt), slant_range_m * units.M_TO_FT) * units.PSI_TO_PA


# ---------------------------------------------------------------------------
# Full receiver calculation with surface cutoff
# ---------------------------------------------------------------------------
@dataclass
class ShockResult:
    slant_range_m: float
    arrival_time_s: float
    peak_pressure_pa: float          # free-field (direct wave only)
    time_constant_s: float
    impulse_free_field_pa_s: float   # from similitude Eq. (4)
    energy_flux_free_field_j_m2: float
    surface_cutoff_delay_s: float    # time after arrival when the relief wave arrives
    impulse_with_cutoff_pa_s: float  # integrated from the cutoff-corrected history
    ambient_pressure_pa: float
    warnings: list[str] = field(default_factory=list)

    @property
    def peak_pressure_psi(self) -> float:
        return self.peak_pressure_pa * units.PA_TO_PSI


def _direct_wave(t: np.ndarray, t_arrival: float, pm: float, theta: float) -> np.ndarray:
    """Exponential pulse P(t) = Pm * exp(-(t - ta)/theta) for t >= ta  [usace1991 Eq. (1)]."""
    dt = t - t_arrival
    return np.where(dt >= 0.0, pm * np.exp(-np.clip(dt, 0.0, None) / theta), 0.0)


def pressure_history(
    burst: Burst,
    receiver: Receiver,
    env: Environment,
    t: np.ndarray,
    include_surface_cutoff: bool = True,
) -> np.ndarray:
    """Overpressure (Pa) above ambient at the receiver for each time in ``t`` (s after detonation)."""
    r_d = slant_range_m(burst, receiver)
    c = env.sound_speed_m_s
    p = _direct_wave(t, r_d / c, peak_pressure_pa(burst.yield_kt, r_d), time_constant_s(burst.yield_kt, r_d))
    if include_surface_cutoff:
        r_i = image_range_m(burst, receiver)
        # Inverted reflection from the free surface, as if from a mirror-image burst.
        p = p - _direct_wave(t, r_i / c, peak_pressure_pa(burst.yield_kt, r_i), time_constant_s(burst.yield_kt, r_i))
        # Water cannot sustain significant tension: absolute pressure >= 0 (crude cavitation cap).
        p = np.maximum(p, -env.hydrostatic_pressure_pa(receiver.depth_m))
    return p


def compute(burst: Burst, receiver: Receiver, env: Environment | None = None) -> ShockResult:
    """Compute the water shock at one receiver."""
    env = env or Environment()
    if not burst.is_underwater:
        raise NotImplementedError("Only underwater bursts are modelled so far (see roadmap section 5).")
    if receiver.z_m > 0:
        raise ValueError("Receiver must be in the water (z_m <= 0) for the water shock model.")

    warnings: list[str] = []
    r_d = slant_range_m(burst, receiver)
    r_i = image_range_m(burst, receiver)
    c = env.sound_speed_m_s
    pm = peak_pressure_pa(burst.yield_kt, r_d)
    theta = time_constant_s(burst.yield_kt, r_d)

    if pm * units.PA_TO_PSI > SIMILITUDE_MAX_PRESSURE_PSI:
        warnings.append(
            "Peak pressure exceeds 30,000 psi: receiver is too close to the burst for the "
            "similitude equations (usace1991). Values are unreliable."
        )
    if math.isfinite(env.water_depth_m):
        warnings.append("Sea-floor reflection is not modelled yet; real peaks/impulses may be higher.")
        if burst.depth_m > env.water_depth_m or receiver.depth_m > env.water_depth_m:
            raise ValueError("Burst and receiver must be above the sea floor.")

    # Acoustic energy flux density of an exponential pulse: integral of P^2/(rho c) dt = Pm^2 theta / (2 rho c)
    energy_flux = pm**2 * theta / (2.0 * env.density_kg_m3 * c)

    # Numerically integrate the cutoff-corrected history over ~10 time constants.
    t_a = r_d / c
    t = np.linspace(t_a, t_a + 10.0 * theta, 20_001)
    p = pressure_history(burst, receiver, env, t)
    impulse_cut = float(np.trapezoid(np.clip(p, 0.0, None), t))

    return ShockResult(
        slant_range_m=r_d,
        arrival_time_s=t_a,
        peak_pressure_pa=pm,
        time_constant_s=theta,
        impulse_free_field_pa_s=impulse_pa_s(burst.yield_kt, r_d),
        energy_flux_free_field_j_m2=energy_flux,
        surface_cutoff_delay_s=(r_i - r_d) / c,
        impulse_with_cutoff_pa_s=impulse_cut,
        ambient_pressure_pa=env.hydrostatic_pressure_pa(receiver.depth_m),
        warnings=warnings,
    )
