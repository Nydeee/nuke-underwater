"""Map of peak air-blast pressure in the water under an air burst, plus pressure histories.

Example (20 kt at 500 m above the water):
    uv run python scripts/plot_air_blast_water.py --yield-kt 20 --height-m 500
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm

from nukesim.effects import air_to_water as aw
from nukesim.scenario import Burst, Receiver


def pressure_map(burst, max_range, max_depth, nr=70, nd=45):
    ranges = np.linspace(0, max_range, nr)
    depths = np.linspace(0, max_depth, nd)
    peak = np.zeros((nd, nr))
    for j, r in enumerate(ranges):
        for i, d in enumerate(depths):
            peak[i, j] = aw.compute(burst, Receiver(r, 0, -d), n_samples=2**13).peak_overpressure_pa
    return ranges, depths, peak


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=20.0)
    ap.add_argument("--height-m", type=float, default=500.0)
    ap.add_argument("--max-range-m", type=float, default=3000.0)
    ap.add_argument("--max-depth-m", type=float, default=200.0)
    ap.add_argument("--out", default="output/air_blast_water.png")
    a = ap.parse_args()

    burst = Burst(yield_kt=a.yield_kt, z_m=a.height_m)
    ranges, depths, peak = pressure_map(burst, a.max_range_m, a.max_depth_m)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5))
    im = ax1.pcolormesh(ranges, depths, peak / 1e3, norm=LogNorm(vmin=max(peak.min() / 1e3, 0.1)), shading="auto", cmap="viridis")
    fig.colorbar(im, ax=ax1, label="peak overpressure (kPa)")
    cs = ax1.contour(ranges, depths, peak / 1e3, levels=[1, 3, 10, 30, 100, 300], colors="white", linewidths=0.7)
    ax1.clabel(cs, fmt="%g kPa", fontsize=7)
    # Edge of the propagating zone (trace speed = sound speed in water)
    edge = next((r for r in np.linspace(0, a.max_range_m, 2000)
                 if aw.compute(burst, Receiver(r, 0, 0), n_samples=2**10).zone == "evanescent"), None)
    if edge is not None:
        ax1.axvline(edge, color="red", ls="--", lw=1)
        ax1.text(edge, a.max_depth_m * 0.97, "  ← pulse travels down | fades with depth →", color="red", fontsize=8, va="bottom")
    ax1.invert_yaxis()
    ax1.set(xlabel="horizontal distance from ground zero (m)", ylabel="depth (m)",
            title=f"Peak air-blast pressure in the water\n{a.yield_kt:g} kt burst {a.height_m:g} m above the water")

    for r, d in [(1000, 0), (1000, 10), (1000, 50), (1000, 150)]:
        res = aw.compute(burst, Receiver(r, 0, -d))
        ax2.plot((res.t - res.surface.arrival_time_s) * 1e3, res.p / 1e3, label=f"{r} m out, {d} m deep")
    ax2.set(xlabel="time after blast reaches the surface above (ms)", ylabel="overpressure (kPa)",
            title="Pressure histories at 1 km range")
    ax2.set_xlim(-200, 800)
    ax2.grid(True, alpha=0.3)
    ax2.legend()

    fig.tight_layout()
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.out, dpi=130)
    print(f"Saved {a.out}")

    res = aw.compute(burst, Receiver(1000, 0, -10))
    print(f"Example: receiver 1000 m out, 10 m deep -> {res.peak_overpressure_pa / 1e3:.1f} kPa "
          f"({100 * res.peak_fraction_of_surface:.0f}% of the {res.surface.peak_overpressure_pa / 1e3:.1f} kPa on the surface above), zone: {res.zone}")
    for w in res.warnings:
        print("  NOTE:", w)


if __name__ == "__main__":
    main()
