"""Fireball heat on the sea: exposure vs distance (with burn levels) and heating vs depth.

Example (1 Mt at 2,000 m above the water, spot 3 km from ground zero):
    uv run python scripts/plot_thermal_water.py --yield-kt 1000 --height-m 2000 --range-km 3
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from nukesim.effects import thermal as th
from nukesim.effects import thermal_water as tw


def plot(yield_kt, height_m, range_km, start_temp_c=20.0, out=None):
    r = np.linspace(0, max(range_km * 4, 5) * 1000, 400)
    q = np.array([th.at_surface(yield_kt, height_m, x).exposure_cal_cm2 for x in r])
    qh = np.array([th.at_surface(yield_kt, height_m, x).exposure_horizontal_cal_cm2 for x in r])
    b = th.burn_thresholds_cal_cm2(yield_kt)

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 4.8))
    a1.semilogy(r / 1e3, q, label="facing the fireball (e.g. a person)")
    a1.semilogy(r / 1e3, qh, label="flat sea surface")
    for key, col, lab in (("first_degree", "orange", "1st-degree burn"), ("second_degree", "red", "2nd-degree burn")):
        a1.axhline(b[key], color=col, ls="--", lw=1)
        a1.text(r[-1] / 1e3, b[key] * 1.1, lab, color=col, ha="right", fontsize=8)
    a1.axvline(range_km, color="gray", ls=":")
    a1.set(xlabel="distance from ground zero (km)", ylabel="radiant exposure (cal/cm²)",
           title=f"Heat reaching the sea, {yield_kt:g} kt at {height_m:g} m (clear day)")
    a1.grid(True, which="both", alpha=0.3)
    a1.legend(fontsize=8)

    s = th.at_surface(yield_kt, height_m, range_km * 1000)
    h = tw.heat_profile(s.into_water_j_m2, s.incidence_deg, start_temp_c=start_temp_c)
    mid = np.sqrt(h.depth_edges_m[1:] * np.maximum(h.depth_edges_m[:-1], 1e-7))
    a2.semilogx(mid * 1000, h.final_temperature_c - start_temp_c, color="C3", label="temperature rise (capped at boiling)")
    a2.set(xlabel="depth (mm, log scale)", ylabel="temperature rise (°C)",
           title=f"Heating vs depth at {range_km:g} km: {s.exposure_horizontal_cal_cm2:.3g} cal/cm² on the water")
    a2.grid(True, which="both", alpha=0.3)
    ax3 = a2.twinx()
    ax3.semilogx(mid * 1000, tw.fraction_remaining(mid) * 100, color="C0", ls="--", label="% of energy still travelling")
    ax3.set_ylabel("% of energy still travelling", color="C0")
    a2.legend(loc="upper right", fontsize=8)
    ax3.legend(loc="center right", fontsize=8)
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=130)
    return fig, s, h


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=1000.0)
    ap.add_argument("--height-m", type=float, default=2000.0)
    ap.add_argument("--range-km", type=float, default=3.0)
    ap.add_argument("--start-temp-c", type=float, default=20.0)
    ap.add_argument("--out", default="output/thermal_water.png")
    a = ap.parse_args()
    _, s, h = plot(a.yield_kt, a.height_m, a.range_km, a.start_temp_c, a.out)
    print(f"Saved {a.out}")
    print(f"At {a.range_km:g} km: {s.exposure_cal_cm2:.3g} cal/cm² facing the fireball, "
          f"{s.exposure_horizontal_cal_cm2:.3g} on the flat sea, {100 * s.reflectance:.1f}% reflected.")
    print(f"Heat pulse peaks at about {s.t_max_s:.2f} s after the burst.")
    print("Burns to bare skin facing the fireball:", ", ".join(k for k, v in s.burns.items() if v) or "none")
    for depth in (0.001, 0.01, 0.1, 1.0, 10.0):
        print(f"  {depth * 1000:>7.0f} mm deep: +{np.interp(depth, h.depth_edges_m[1:], h.final_temperature_c) - a.start_temp_c:.3g} °C, "
              f"{tw.energy_at_depth_j_m2(s.into_water_j_m2, depth, s.incidence_deg) / 1e3:.3g} kJ/m² still travelling")
    print(f"  water boiled off: about {h.evaporated_mm:.3g} mm")
    for w in s.warnings + h.warnings:
        print("  NOTE:", w)


if __name__ == "__main__":
    main()
