"""Long-term fallout radiation for a fish: dose rate (outside vs absorbed) and radioactivity in its flesh.

Example (1 Mt surface burst, fish 10 m deep, 50 km downwind):
    uv run python scripts/plot_long_term.py --yield-kt 1000 --height-m 0 --x-km 50 --depth-m 10
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from nukesim.biology.long_term import (ERICA_SCREENING_UGY_H, ICRP_DCRL_FISH_UGY_H,
                                       UNSCEAR_REDUCED_FERTILITY_UGY_H, assess_long_term)
from nukesim.scenario import Burst, Receiver


def plot(burst, x_km=50.0, depth_m=10.0, days=60.0, out=None):
    r = assess_long_term(burst, Receiver(x_km * 1e3, 0, -depth_m, "fish", mass_kg=1.0), days=days)
    t_d = r.times_h / 24.0
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 4.8))
    if r.internal_ugy_h is None:
        a1.text(0.5, 0.5, "no local fallout here", ha="center", transform=a1.transAxes)
    else:
        a1.loglog(t_d, r.external_gy_h[1] * 1e6, label="from the water around it")
        a1.loglog(t_d, r.internal_ugy_h[1], label="from elements absorbed into it")
        a1.fill_between(t_d, np.clip(r.total_ugy_h[0], 1e-3, None), np.clip(r.total_ugy_h[1], 1e-3, None),
                        color="k", alpha=0.15, label="total (range)")
        a1.axhspan(*ICRP_DCRL_FISH_UGY_H, color="orange", alpha=0.15)
        a1.text(t_d[0] * 1.2, ICRP_DCRL_FISH_UGY_H[0] * 1.15, "ICRP level for fish (1-10 mGy/day)", fontsize=8)
        a1.axhline(ERICA_SCREENING_UGY_H, color="green", ls=":")
        a1.text(t_d[0] * 1.2, ERICA_SCREENING_UGY_H * 1.15, "ERICA screening level", fontsize=8, color="green")
        a1.axhline(UNSCEAR_REDUCED_FERTILITY_UGY_H[0], color="red", ls="--", lw=0.8)
        a1.set_ylim(1e-1, None)
        for name in ("Cs-137", "I-131", "Sr-90", "Ba-140", "Ce-144"):
            a2.loglog(t_d, np.clip(r.fish_bq_per_kg[name], 1e-3, None), label=name)
        a2.set_ylim(1e-1, None)
    a1.set(xlabel="days after the burst", ylabel="dose rate to the fish (uGy/h)",
           title=f"Fish {depth_m:g} m deep, {x_km:g} km downwind ({burst.yield_kt:g} kt surface burst)")
    a1.grid(True, which="both", alpha=0.3)
    a1.legend(fontsize=8, loc="lower left")
    a2.set(xlabel="days after the burst", ylabel="radioactivity in fish flesh (Bq/kg, upper estimate)",
           title="Radioactive elements absorbed by the fish")
    a2.grid(True, which="both", alpha=0.3)
    a2.legend(fontsize=8)
    fig.tight_layout()
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, dpi=130)
    return fig, r


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=1000.0)
    ap.add_argument("--height-m", type=float, default=0.0)
    ap.add_argument("--x-km", type=float, default=50.0)
    ap.add_argument("--depth-m", type=float, default=10.0)
    ap.add_argument("--days", type=float, default=60.0)
    ap.add_argument("--out", default="output/long_term_fish.png")
    a = ap.parse_args()
    _, r = plot(Burst(a.yield_kt, a.height_m), a.x_km, a.depth_m, a.days, a.out)
    print(f"Saved {a.out}")
    print("\n".join("  " + f for f in r.findings))
    for n in r.notes:
        print("  NOTE:", n)


if __name__ == "__main__":
    main()
