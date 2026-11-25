"""Danger-zone maps: the worst immediate effect on a chosen animal or person around a burst.

Examples:
    uv run python scripts/plot_effects_zones.py --yield-kt 20 --height-m -27 --kind mammal --mass-kg 200
    uv run python scripts/plot_effects_zones.py --yield-kt 20 --height-m 500 --kind fish --mass-kg 0.3
    uv run python scripts/plot_effects_zones.py --yield-kt 20 --height-m 500 --kind person
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import BoundaryNorm, ListedColormap

from nukesim.biology.assess import LEVELS, assess
from nukesim.scenario import Burst, Receiver

COLORS = ["#d9ecd0", "#fde58a", "#f7a540", "#e2552c", "#7a0d0d"]


def plot(burst, kind, mass_kg=None, hearing_group=None, max_range_m=3000, max_depth_m=100, out=None):
    cmap = ListedColormap(COLORS)
    norm = BoundaryNorm(np.arange(-0.5, len(LEVELS)), cmap.N)
    fig, ax = plt.subplots(figsize=(9, 4.8))
    ranges = np.linspace(20, max_range_m, 60)
    if kind == "person":
        lv = [LEVELS.index(assess(burst, Receiver(r, 0, 2, kind)).worst) for r in ranges]
        ax.imshow([lv], aspect="auto", cmap=cmap, norm=norm, extent=(ranges[0], ranges[-1], 0, 1))
        ax.set_yticks([])
        ax.set_xlabel("distance from ground zero (m)")
        title = "Person on deck"
    else:
        depths = np.linspace(1, max_depth_m, 30)
        grid = np.array([[LEVELS.index(assess(burst, Receiver(r, 0, -d, kind, mass_kg=mass_kg, hearing_group=hearing_group)).worst)
                          for r in ranges] for d in depths])
        ax.pcolormesh(ranges, depths, grid, cmap=cmap, norm=norm, shading="auto")
        ax.invert_yaxis()
        ax.set(xlabel="distance from ground zero (m)", ylabel="depth (m)")
        title = f"{kind}" + (f", {mass_kg:g} kg" if mass_kg else "")
    where = f"{burst.z_m:g} m above" if burst.z_m >= 0 else f"{-burst.z_m:g} m below"
    ax.set_title(f"Worst immediate effect: {title}\n{burst.yield_kt:g} kt, {where} the water")
    handles = [plt.Rectangle((0, 0), 1, 1, color=col) for col in COLORS]
    ax.legend(handles, LEVELS, loc="lower right", fontsize=8, title="worst effect")
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=130)
    return fig


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=20.0)
    ap.add_argument("--height-m", type=float, default=-27.0, help="negative = underwater burst depth")
    ap.add_argument("--kind", choices=["fish", "mammal", "turtle", "diver", "person"], default="mammal")
    ap.add_argument("--mass-kg", type=float, default=None)
    ap.add_argument("--hearing-group", choices=["LF", "HF", "VHF", "PW", "OW"], default=None)
    ap.add_argument("--max-range-m", type=float, default=3000.0)
    ap.add_argument("--max-depth-m", type=float, default=100.0)
    ap.add_argument("--out", default="output/effects_zones.png")
    a = ap.parse_args()
    burst = Burst(yield_kt=a.yield_kt, z_m=a.height_m)
    plot(burst, a.kind, a.mass_kg, a.hearing_group, a.max_range_m, a.max_depth_m, a.out)
    print(f"Saved {a.out}")
    example = Receiver(1000, 0, 2 if a.kind == "person" else -10, a.kind, mass_kg=a.mass_kg, hearing_group=a.hearing_group)
    print(assess(burst, example).report())


if __name__ == "__main__":
    main()
