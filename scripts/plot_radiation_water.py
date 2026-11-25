"""Initial radiation dose in the water under an air burst (upper estimate map + depth profile).

Example (20 kt at 500 m above the water):
    uv run python scripts/plot_radiation_water.py --yield-kt 20 --height-m 500
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm

from nukesim.effects import radiation_shielding as rs
from nukesim.scenario import Burst, Receiver


def dose_map(burst, max_range, max_depth, nr=80, nd=60):
    ranges = np.linspace(0, max_range, nr)
    depths = np.linspace(0, max_depth, nd)
    hi = np.array([[rs.compute(burst, Receiver(r, 0, -d)).total_gy[1] for r in ranges] for d in depths])
    return ranges, depths, hi


def plot(burst, max_range=3000, max_depth=5, profile_range=1000, out=None):
    ranges, depths, hi = dose_map(burst, max_range, max_depth)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 4.6))
    im = a1.pcolormesh(ranges, depths, np.clip(hi, 1e-4, None), norm=LogNorm(vmin=1e-4), shading="auto", cmap="magma")
    fig.colorbar(im, ax=a1, label="dose, upper estimate (Gy)")
    cs = a1.contour(ranges, depths, hi, levels=[0.01, 0.1, 1, 5], colors="cyan", linewidths=0.8)
    a1.clabel(cs, fmt="%g Gy", fontsize=7)
    a1.invert_yaxis()
    a1.set(xlabel="horizontal distance from ground zero (m)", ylabel="depth (m)",
           title=f"Initial radiation in the water (upper estimate)\n{burst.yield_kt:g} kt, {burst.z_m:g} m above the water")

    d = np.linspace(0, max_depth, 200)
    res = [rs.compute(burst, Receiver(profile_range, 0, -x)) for x in d]
    for key, col, lab in (("gamma_gy", "C0", "gamma"), ("neutron_gy", "C1", "neutron")):
        lo = np.array([getattr(x, key)[0] for x in res])
        hi_ = np.array([getattr(x, key)[1] for x in res])
        a2.fill_between(d, np.clip(lo, 1e-6, None), np.clip(hi_, 1e-6, None), color=col, alpha=0.3, label=f"{lab} (range)")
        a2.semilogy(d, np.clip(hi_, 1e-6, None), color=col)
    a2.axhline(1, c="gray", ls=":")
    a2.text(max_depth * 0.6, 1.2, "1 Gy reference", color="gray", fontsize=8)
    a2.set(xlabel="depth (m)", ylabel="dose (Gy)", ylim=(1e-4, None),
           title=f"Dose vs depth, {profile_range:g} m from ground zero")
    a2.grid(True, which="both", alpha=0.3)
    a2.legend()
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=130)
    return fig


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=20.0)
    ap.add_argument("--height-m", type=float, default=500.0)
    ap.add_argument("--max-range-m", type=float, default=3000.0)
    ap.add_argument("--max-depth-m", type=float, default=5.0)
    ap.add_argument("--profile-range-m", type=float, default=1000.0)
    ap.add_argument("--out", default="output/radiation_water.png")
    a = ap.parse_args()
    burst = Burst(yield_kt=a.yield_kt, z_m=a.height_m)
    plot(burst, a.max_range_m, a.max_depth_m, a.profile_range_m, a.out)
    print(f"Saved {a.out}")
    for depth in (0, 0.5, 1, 2, 5):
        x = rs.compute(burst, Receiver(a.profile_range_m, 0, -depth))
        lo, hi = x.total_gy
        print(f"  {a.profile_range_m:g} m out, {depth:>4} m deep: {lo:.3g} - {hi:.3g} Gy")
    for w in x.warnings:
        print("  NOTE:", w)


if __name__ == "__main__":
    main()
