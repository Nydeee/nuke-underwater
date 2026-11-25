"""Fallout on the sea: idealized pattern, and dose over time at one spot.

Example (1 Mt surface burst, 15 mph wind, a spot 50 km downwind):
    uv run python scripts/plot_fallout_sea.py --yield-kt 1000 --height-m 0 --x-km 50
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm

from nukesim.effects import fallout as fo
from nukesim.effects import sea_contamination as sc
from nukesim.scenario import Burst, Receiver


def plot(burst, x_km=50.0, wind_mph=15.0, fission_fraction=1.0, out=None):
    cs = fo.contours(burst.yield_kt, wind_mph)
    xmax = cs[-1].downwind_m * 1.05
    ymax = cs[-1].max_width_m * 0.7
    xs = np.linspace(-0.1 * xmax, xmax, 300)
    ys = np.linspace(-ymax, ymax, 160)
    grid = np.array([[fo.fallout_at(burst.yield_kt, burst.z_m, x, y, wind_mph, 0, fission_fraction).r1_rad_h[1]
                      for x in xs] for y in ys])

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 4.8))
    im = a1.pcolormesh(xs / 1e3, ys / 1e3, np.clip(grid, 0.3, None), norm=LogNorm(vmin=0.3), shading="auto", cmap="inferno")
    fig.colorbar(im, ax=a1, label="1-hour reference dose rate, land-equivalent (rad/h)")
    a1.plot([x_km], [0], "c*", ms=12)
    a1.set(xlabel="downwind distance (km)", ylabel="crosswind (km)",
           title=f"Idealized fallout on the sea (upper estimate)\n{burst.yield_kt:g} kt surface burst, {wind_mph:g} mph wind")
    a1.set_aspect("auto")

    for z, lab, col, ls in ((1, "person on a boat", "C3", "-"), (-10, "fish 10 m deep", "C0", "-"),
                            (-50, "fish 50 m deep", "C2", "--"), (-100, "fish 100 m deep (below thermocline)", "C7", "-")):
        r = sc.compute(burst, Receiver(x_km * 1e3, 0, z), wind_mph=wind_mph, fission_fraction=fission_fraction)
        lo, hi = r.dose_rate_gy_h
        a2.fill_between(r.times_h, np.clip(lo, 1e-9, None), np.clip(hi, 1e-9, None), color=col, alpha=0.25)
        a2.loglog(r.times_h, np.clip(hi, 1e-9, None), color=col, ls=ls, label=f"{lab}: {r.accumulated_gy[0][-1]:.2g}-{r.accumulated_gy[1][-1]:.2g} Gy in 30 d")
    a2.set(xlabel="time after the burst (hours)", ylabel="dose rate (Gy/h)", ylim=(1e-7, None),
           title=f"Dose rate {x_km:g} km downwind")
    a2.grid(True, which="both", alpha=0.3)
    a2.legend(fontsize=8)
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=130)
    return fig


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=1000.0)
    ap.add_argument("--height-m", type=float, default=0.0)
    ap.add_argument("--x-km", type=float, default=50.0, help="spot this far downwind")
    ap.add_argument("--wind-mph", type=float, default=15.0)
    ap.add_argument("--fission-fraction", type=float, default=1.0)
    ap.add_argument("--out", default="output/fallout_sea.png")
    a = ap.parse_args()
    burst = Burst(yield_kt=a.yield_kt, z_m=a.height_m)
    if not fo.has_local_fallout(a.yield_kt, a.height_m):
        print("This burst is too high for significant local fallout (Glasstone Eq. 2.128.1). Nothing to plot.")
        return
    plot(burst, a.x_km, a.wind_mph, a.fission_fraction, a.out)
    print(f"Saved {a.out}")
    r = sc.compute(burst, Receiver(a.x_km * 1e3, 0, -10), wind_mph=a.wind_mph, fission_fraction=a.fission_fraction)
    print(f"Fallout arrives about {r.arrival_time_h:.1f} h after the burst.")
    for w in r.warnings:
        print("  NOTE:", w)


if __name__ == "__main__":
    main()
