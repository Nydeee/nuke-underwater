"""Initial nuclear radiation (gamma rays + neutrons, first minute) from a burst above water.

Model: Fletcher et al. (fletcher1962) Eq. 2.114, a fit to the 1962 edition of
Glasstone's curves, giving the total dose versus yield and slant range:

    I = (W / d^2) * { 4997.41 exp(-9.263158 (rho/rho0) d)
                      + 1033 (W'/W) exp(-5.415385 (rho/rho0) d) }      [rem, d in miles]

W'/W (Eq. 2.115) boosts the second term for big yields: the blast wave thins the
air, letting more delayed gamma rays through ("hydrodynamic enhancement",
glasstone1977 sec. 8.36). Glasstone sec. 8.65 says neutrons are NOT enhanced,
so we read the first term as the neutron dose and the second as the gamma
dose. That split is OUR reading of the fit, not stated by Fletcher.

Units: rem was used for both. At this accuracy we take 1 rem ~ 1 rad ~ 0.01 Gy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .. import units
from ..uncertainty import factor
from .air_blast import is_contact_burst

M_PER_MILE = 1609.344  # exact

NEUTRON_COEFF = 4997.41
NEUTRON_EXP = 9.263158
GAMMA_COEFF_AIR = 1033.0
GAMMA_COEFF_SURFACE = 688.7   # fletcher1962 p.43: 2/3 of 1033 for surface bursts
GAMMA_EXP = 5.415385
RHO_RATIO_AIR_BURST = 0.9     # fletcher1962 p.43
RHO_RATIO_SURFACE = 1.0
UNRELIABLE_BELOW_MILES = 0.28  # fletcher1962 p.41
REM_TO_GY = 0.01


def gamma_enhancement(yield_kt: float) -> float:
    """W'/W from fletcher1962 Eq. 2.115 (unity for W <= 10 kt; fit valid to 20,000 kt)."""
    if yield_kt <= 10:
        return 1.0
    lw = math.log10(yield_kt)
    log_ratio = (-2.1343121 + 5.6948378 * lw - 5.7707609 * lw**2 + 2.7712520 * lw**3
                 - 0.6206012 * lw**4 + 0.0526380 * lw**5)
    return 10**log_ratio


def fletcher_dose_rem(yield_kt: float, slant_miles: float, surface_burst: bool = False) -> tuple[float, float]:
    """(neutron, gamma) initial dose in rem at a slant range in miles."""
    rho = RHO_RATIO_SURFACE if surface_burst else RHO_RATIO_AIR_BURST
    g_coeff = GAMMA_COEFF_SURFACE if surface_burst else GAMMA_COEFF_AIR
    pre = yield_kt / slant_miles**2
    neutron = pre * NEUTRON_COEFF * math.exp(-NEUTRON_EXP * rho * slant_miles)
    gamma = pre * g_coeff * gamma_enhancement(yield_kt) * math.exp(-GAMMA_EXP * rho * slant_miles)
    return neutron, gamma


@dataclass
class IncidentDose:
    slant_range_m: float
    neutron_gy: float
    gamma_gy: float
    warnings: list[str] = field(default_factory=list)

    @property
    def total_gy(self) -> float:
        return self.neutron_gy + self.gamma_gy


def incident_dose(yield_kt: float, height_m: float, slant_range_m: float) -> IncidentDose:
    """Initial radiation dose (Gy, approximate) arriving at a point a given slant range from the burst."""
    if height_m < 0:
        raise NotImplementedError("Initial radiation for underwater bursts is not modelled.")
    warnings = ["Generic 1962-era fit; reliability about 0.5x-2x (glasstone1977 sec. 8.33). No weapon-design detail."]
    miles = max(slant_range_m, 1.0) / M_PER_MILE
    if miles < UNRELIABLE_BELOW_MILES:
        warnings.append("Closer than 0.28 miles (~450 m): Fletcher's fit is unreliable here.")
    if not (1 <= yield_kt <= 20_000):
        warnings.append("Yield outside 1-20,000 kt, the range Fletcher's fits were made for.")
    surface = is_contact_burst(yield_kt, height_m)
    n_rem, g_rem = fletcher_dose_rem(yield_kt, miles, surface_burst=surface)
    f = factor("initial_radiation")
    return IncidentDose(slant_range_m, n_rem * REM_TO_GY * f, g_rem * REM_TO_GY * f, warnings)
