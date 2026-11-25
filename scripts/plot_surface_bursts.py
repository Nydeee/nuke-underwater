"""Low and surface bursts: how much shock gets into the water, and the waves.

Example (1 Mt, burst 30 m below the surface, 4,000 m deep ocean):
    uv run python scripts/plot_surface_bursts.py --yield-kt 1000 --burst-depth-m 30 --water-depth-m 4000
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from nukesim.effects import near_surface_shock as ns
from nukesim.effects import water_waves as ww
from nukesim.scenario import Burst, Environment


def plot(yield_kt=1000.0, burst_depth_m=30.0, water_depth_m=4000.0, out=None):
    fig, (a1, a2, a3) = plt.subplots(1, 3, figsize=(15, 4.6))

    x = np.linspace(-10, 15, 300)
    for w, lab in ((0.5, "under 1 kt"), (10, "10 kt"), (1000, "over 20 kt")):
        a1.semilogy(x, [ns.coupling(w, xi) for xi in x], label=lab)
    a1.axvline(0, color="gray", lw=0.8)
    a1.text(-9.5, 0.6, "above the water", fontsize=8)
    a1.text(0.5, 0.6, "below the water", fontsize=8)
    a1.set(xlabel="scaled burst depth (ft/kt^1/3; negative = above)", ylabel="coupling (fraction of full shock)",
           title="How much shock gets into the water (EM-1)")
    a1.grid(True, which="both", alpha=0.3)
    a1.legend(fontsize=8)

    env = Environment(water_depth_m=water_depth_m)
    r = np.geomspace(2e3, 2e5, 200)
    sub = [ww.compute(Burst(yield_kt, -burst_depth_m), ri, env).height_m for ri in r]
    surf = [ww.compute(Burst(yield_kt, 0.0), ri, env).height_m for ri in r]
    a2.fill_between(r / 1e3, [h[0] for h in sub], [h[1] for h in sub], alpha=0.35, label=f"burst {burst_depth_m:g} m deep (range)")
    a2.loglog(r / 1e3, [h[1] for h in surf], "k--", label="surface burst (upper estimate)")
    a2.set(xlabel="distance (km)", ylabel="wave height, crest to trough (m)",
           title=f"Waves: {yield_kt:g} kt in {water_depth_m:g} m of water")
    a2.grid(True, which="both", alpha=0.3)
    a2.legend(fontsize=8)

    w50 = ww.compute(Burst(yield_kt, -burst_depth_m), 50e3, env)
    h50 = w50.height_m[1]
    depths = list(np.geomspace(water_depth_m, 2.0, 120))
    coast = ww.approach_coast(h50, water_depth_m, depths, wavelength_m=w50.wavelength_m)
    a3.semilogx(depths, coast.heights_m, label="wave height")
    a3.semilogx(depths, [0.78 * d for d in depths], "r:", label="breaking limit (0.78 × depth)")
    a3.invert_xaxis()
    a3.set_ylim(0, max(coast.heights_m) * 1.4)
    a3.set(xlabel="water depth (m), moving toward shore →", ylabel="wave height (m)",
           title=f"A {h50:.1f} m wave (50 km out) approaching a coast")
    a3.grid(True, which="both", alpha=0.3)
    a3.legend(fontsize=8)
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=130)
    return fig


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=1000.0)
    ap.add_argument("--burst-depth-m", type=float, default=30.0)
    ap.add_argument("--water-depth-m", type=float, default=4000.0)
    ap.add_argument("--out", default="output/surface_bursts.png")
    a = ap.parse_args()
    plot(a.yield_kt, a.burst_depth_m, a.water_depth_m, a.out)
    print(f"Saved {a.out}")
    env = Environment(water_depth_m=a.water_depth_m)
    b = Burst(a.yield_kt, -a.burst_depth_m)
    rc, dc = ww.crater_ft(a.yield_kt, a.burst_depth_m * 3.28084)
    print(f"Water crater: radius about {rc * 0.3048:.0f} m, depth about {dc * 0.3048:.0f} m (chemical-explosive fit)")
    print(f"Coupling into the water: {ns.coupling(a.yield_kt, ns.scaled_depth_ft(a.yield_kt, a.burst_depth_m)):.3f}")
    for km in (5, 20, 50, 100):
        w = ww.compute(b, km * 1e3, env)
        print(f"  {km:>4} km: waves {w.height_m[0]:.2g}-{w.height_m[1]:.2g} m, period {w.period_s:.0f} s, "
              f"biggest wave arrives after {w.max_wave_arrival_s / 60:.1f} min")
    for note in w.warnings:
        print("  NOTE:", note)


if __name__ == "__main__":
    main()
