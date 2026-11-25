"""Compare the simulator with every published or measured number we have.

Writes docs/validation.md. Each row says whether the comparison is an independent
check, or only a consistency check (the model was calibrated to that number, or
the reference is the same source as the model).

    uv run python scripts/validate.py
"""

import math
from pathlib import Path

import numpy as np

from nukesim import units
from nukesim.biology import criteria as c
from nukesim.biology import uptake as up
from nukesim.effects import (air_blast, air_to_water, initial_radiation, near_surface_shock, sea_contamination,
                             thermal, underwater_shock, water_waves)

ROOT = Path(__file__).resolve().parents[1]
rows = []


def check(section, what, reference, model, unit, tol, kind, source):
    """tol: (low_ratio, high_ratio) accepted for model/reference."""
    ratio = model / reference if reference else float("nan")
    ok = tol[0] <= ratio <= tol[1]
    rows.append((section, what, reference, model, unit, ratio, ok, kind, source))


# ---- Section 1: underwater shock
check("1", "100 kt, deep water, 3,000 ft: peak pressure", 2700,
      underwater_shock.peak_pressure_pa(100, 3000 * units.FT_TO_M) * units.PA_TO_PSI, "psi", (0.99, 1.01),
      "calibration", "Glasstone 1977 sec. 6.41")
psi_em1, _ = near_surface_shock.em1_peak_psi(100, 1.0, 3000 * units.FT_TO_M, 1000)
check("1", "Same case, independent EM-1 formula (full coupling)", 2700, psi_em1, "psi", (0.8, 1.25),
      "independent", "EM-1 via DTRA-TR-01-19 vs Glasstone 6.41")

# ---- Section 2: air blast
def eq34(x):
    return 2.52 / x + 4.24 / x**1.5 + (3.2 / x**3) * (1 + 41.7 * (10 * x) ** 4 / (1 + 2035 * (10 * x) ** 8))
for x in (0.5, 1.0, 3.0):
    check("2", f"Surface burst, x = {x} kft/kt^1/3: Brode Eq. 62 vs Eq. 34", eq34(x), air_blast.brode_hob_psi(x, 0.0),
          "psi", (0.9, 1.1), "consistency", "Brode 1987 (two fits from the same report)")
t = np.linspace(-20, 20, 2**18)
surface = np.where((t >= 0) & (t <= 0.3), 1 - 2 * t / 0.3, 0.0)
p = air_to_water.transmit_waveform(t, surface, 2.1 * 340, 1500, 25.0)
check("2", "Sonic boom N-wave (Mach 2.1, 0.3 s) at 25 m depth: fraction of surface peak", 0.45, p.max(), "",
      (0.9, 1.1), "independent", "Sparrow 1995 p.143 (Sawyers theory)")

# ---- Section 3: initial radiation
yd = 0.9144 / 1609.344
_, g = initial_radiation.fletcher_dose_rem(50, 2000 * yd)
check("3", "50 kt, 2,000 yd: initial gamma dose", 250, g, "rad", (0.5, 2.0), "independent",
      "Glasstone 1977 sec. 8.34 (1977 curves vs 1962-based fit)")
n, g = initial_radiation.fletcher_dose_rem(1000, 4000 * yd)
check("3", "1 Mt, 4,000 yd: total initial dose", 8.3, n + g, "rad", (0.5, 2.0), "independent",
      "Glasstone 1977 sec. 8.132 worked example")

# ---- Section 4: fallout in the sea
a = sea_contamination.gamma_bq_per_m2_at_1h(2900)
above = 0.5 * sea_contamination.infinite_medium_dose_rate_gy_h(a, 60.0) * 100
check("4", "Land vs sea (60 m mixing) dose-rate factor", 1000, 2900 / above, "x", (0.7, 1.5), "independent",
      "Operation Redwing 1956 measurements")
sr90 = next(nu for nu in up.NUCLIDES if nu.name == "Sr-90")
mid = 0.5 * (up.activity_bq_per_kt(sr90, 0, "U235") + up.activity_bq_per_kt(sr90, 0, "U238")) * 1000 / 3.7e10 / 1e6
check("6b", "Sr-90 per Mt of fission (U-235/U-238 average)", 0.11, mid, "MCi", (0.7, 1.5), "independent",
      "Glasstone 1977 sec. 9.141")

# ---- Section 5: thermal
check("5", "Fraction of heat delivered by 10 t_max (1 Mt)", 0.80,
      thermal.delivered_fraction(10 * thermal.time_of_maximum_s(1000), 1000), "", (0.9, 1.1), "independent",
      "Glasstone sec. 7.86 vs Fletcher Eq. 2.112")
slant = 5 * 1609.344
tau = thermal.radiant_exposure_cal_cm2(1000, 1000, math.sqrt(slant**2 - 1000**2)) / thermal.glasstone_exposure_cal_cm2(1000, slant, 1.0)
check("5", "Implied air transmittance at 5 miles (clear day)", 0.7, tau, "", (0.75, 1.3), "consistency",
      "Fletcher fit vs Glasstone Eq. 7.96.3 (typical clear-day value ~0.7)")

# ---- Section 6: biology criteria
check("6a", "Navy lung-injury onset, 60 kg at 1 m", 188.9, c.goertner_impulse_pa_s(47.5, 60, 1), "Pa-s", (0.999, 1.001),
      "consistency", "JASCO UXO report Table 7 (same Navy equation)")
check("6a", "Diver 50% fatality impulse", 302, 302 * (1 if abs(c.lance_risk(302, 'pulmonary', 'fatality') - 0.5) < 0.01 else 0),
      "kPa-ms", (0.99, 1.01), "consistency", "Lance et al. 2015 abstract")

# ---- Section 7: near-surface bursts and waves
for w, eps in ((1, 0.2), (5, 0.162), (10, 0.11), (16, 0.057)):
    check("7", f"Coupling at the surface, {w} kt", eps, near_surface_shock.coupling(w, 0.0), "", (0.95, 1.05),
          "consistency", "values quoted in DTRA-TR-01-19 / Eneva 2000")
check("7", "Soviet 1961 burst 1.1 m above water (16 kt): coupling", 0.0412,
      near_surface_shock.coupling(16, near_surface_shock.scaled_depth_ft(16, -1.1)), "", (0.45, 2.2), "independent",
      "Eneva et al. 2000 (measured hydroacoustic level)")
nmi = 1852 * units.M_TO_FT
check("7", "1 Mt deep-water wave at 5 nmi", 55.5, water_waves.deep_height_ft(1000, 5 * nmi), "ft", (0.98, 1.02),
      "consistency", "Le Mehaute & Wang 1996 Table 1-3 (same correlation as Glasstone)")
for yd_, h in ((330, 94), (1330, 24), (4000, 9)):
    lo = water_waves.shallow_height_ft(23.5, yd_ * 3, 180)
    check("7", f"BAKER wave at {yd_} yd (upper estimate)", h, lo * water_waves.BAKER_FACTOR, "ft", (0.75, 1.3),
          "partly calibrated", "Glasstone Table 6.57 (measured, 1946)")
    check("7", f"BAKER wave at {yd_} yd (Glasstone formula alone)", h, lo, "ft", (0.4, 1.0), "independent",
          "Glasstone Table 6.57 vs Eq. in sec. 6.121")


def main():
    lines = ["# Validation report", "",
             "Generated by `scripts/validate.py`. Ratio = simulator / reference. "
             "**Independent** rows compare against data the model was *not* built from; "
             "**consistency** and **calibration** rows only confirm the code reproduces its own sources.", "",
             "| Sec. | Check | Reference | Simulator | Ratio | Pass | Kind | Source |",
             "|---|---|---|---|---|---|---|---|"]
    for sec, what, ref, mod, unit, ratio, ok, kind, src in rows:
        lines.append(f"| {sec} | {what} | {ref:.4g} {unit} | {mod:.4g} {unit} | {ratio:.2f} | {'yes' if ok else '**NO**'} | {kind} | {src} |")
    n_ind = sum(1 for r in rows if r[7] == "independent")
    n_ind_ok = sum(1 for r in rows if r[7] == "independent" and r[6])
    lines += ["", f"**{sum(r[6] for r in rows)} of {len(rows)} checks pass.** "
              f"Independent checks: {n_ind_ok} of {n_ind} within their stated tolerance.", ""]
    out = ROOT / "docs" / "validation.md"
    out.write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
