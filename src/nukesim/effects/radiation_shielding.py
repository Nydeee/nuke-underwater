"""How water shields a receiver from initial gamma rays and neutrons.

Gamma rays: glasstone1977 Table 8.41 "effective" tenth-value thicknesses (TVT)
for water: 24 in for fission-product gammas, 39 in for nitrogen-capture gammas.
They are given as mass per area (125 and 201 lb/ft^2), so in denser seawater the
thickness shrinks slightly. "Effective" means they already include scattered
rays (buildup) for thick shields; near the surface they are conservative
(sec. 8.40). Glasstone sec. 8.42 recommends the larger value; we use it by
default and show the smaller as the low end.

Neutrons: exponential removal, Sigma_R = 0.103 1/cm for fission-spectrum
neutrons in water (removal_xs_water -- secondary source only). High-energy
(14 MeV) neutrons go further; ~0.07 1/cm is used as the "reaches deeper" end
(also from a search snippet only).

Path through the water: the two limits are straight down (upper estimate,
covers scattered radiation from overhead) and along the slanted direct ray from
the burst (lower estimate).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..scenario import Burst, Environment, Receiver
from . import initial_radiation as ir

LB_PER_FT2_TO_KG_PER_M2 = 0.45359237 / 0.3048**2   # exact: 4.8824 kg/m^2

GAMMA_TVT_FISSION_PRODUCT_LB_FT2 = 125.0   # glasstone1977 Table 8.41 (water)
GAMMA_TVT_N_CAPTURE_LB_FT2 = 201.0         # glasstone1977 Table 8.41 (water)
NEUTRON_REMOVAL_XS_PER_CM = 0.103           # removal_xs_water, at 1000 kg/m^3
NEUTRON_REMOVAL_XS_14MEV_PER_CM = 0.07      # 14 MeV value (snippet only)
WATER_REF_DENSITY = 1000.0


def gamma_tvt_m(density_kg_m3: float, conservative: bool = True) -> float:
    lb_ft2 = GAMMA_TVT_N_CAPTURE_LB_FT2 if conservative else GAMMA_TVT_FISSION_PRODUCT_LB_FT2
    return lb_ft2 * LB_PER_FT2_TO_KG_PER_M2 / density_kg_m3


def neutron_tvt_m(density_kg_m3: float, high_energy: bool = False) -> float:
    xs = NEUTRON_REMOVAL_XS_14MEV_PER_CM if high_energy else NEUTRON_REMOVAL_XS_PER_CM
    xs_per_m = xs * 100.0 * density_kg_m3 / WATER_REF_DENSITY
    return math.log(10) / xs_per_m


def transmission(path_m: float, tvt_m: float) -> float:
    """Fraction surviving a path through water: 10^(-path / TVT)."""
    return 10.0 ** (-max(path_m, 0.0) / tvt_m)


@dataclass
class UnderwaterDose:
    depth_m: float
    incident: ir.IncidentDose
    slant_path_m: float
    gamma_gy: tuple[float, float]     # (low, high)
    neutron_gy: tuple[float, float]   # (low, high)
    warnings: list[str] = field(default_factory=list)

    @property
    def total_gy(self) -> tuple[float, float]:
        return (self.gamma_gy[0] + self.neutron_gy[0], self.gamma_gy[1] + self.neutron_gy[1])


def compute(burst: Burst, receiver: Receiver, env: Environment | None = None) -> UnderwaterDose:
    """Initial radiation dose at a receiver in (or above) the water, as a low-high range."""
    env = env or Environment()
    if burst.z_m < 0:
        raise NotImplementedError("Underwater bursts: initial radiation not modelled.")
    r = math.hypot(receiver.x_m, receiver.y_m)
    depth = receiver.depth_m
    if math.isfinite(env.water_depth_m) and depth > env.water_depth_m:
        raise ValueError("receiver is below the sea floor")

    # Dose arriving at the water surface above the receiver (or at the receiver if above water).
    z_incident = max(receiver.z_m, 0.0)
    slant = math.hypot(r, burst.z_m - z_incident)
    inc = ir.incident_dose(burst.yield_kt, burst.z_m, slant)

    # Path lengths through water: vertical (upper estimate) and along the direct ray (lower).
    cos_theta = (burst.z_m + depth) / math.hypot(r, burst.z_m + depth) if depth > 0 else 1.0
    slant_path = depth / cos_theta if cos_theta > 0 else math.inf

    rho = env.density_kg_m3
    g_hi = inc.gamma_gy * transmission(depth, gamma_tvt_m(rho, conservative=True))
    g_lo = inc.gamma_gy * transmission(slant_path, gamma_tvt_m(rho, conservative=False))
    n_hi = inc.neutron_gy * transmission(depth, neutron_tvt_m(rho, high_energy=True))
    n_lo = inc.neutron_gy * transmission(slant_path, neutron_tvt_m(rho, high_energy=False))

    warnings = list(inc.warnings)
    if depth > 0:
        warnings.append("Neutron attenuation in water uses a secondary-source removal cross-section (not yet verified).")
        warnings.append("Gamma rays made inside seawater by neutron capture (H, Cl) are not included.")
    return UnderwaterDose(depth, inc, slant_path, (g_lo, g_hi), (n_lo, n_hi), warnings)
