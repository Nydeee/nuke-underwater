"""Plot underwater shock peak pressure vs range, and the pressure history at one receiver.

Example (roughly Operation Crossroads BAKER: ~20 kt in a ~200 ft = 61 m deep lagoon):
    uv run python scripts/plot_shock.py --yield-kt 20 --burst-depth-m 27 --receiver-depth-m 10 --range-m 1000
"""

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from nukesim import units
from nukesim.effects import underwater_shock as us
from nukesim.scenario import Burst, Environment, Receiver


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yield-kt", type=float, default=20.0)
    ap.add_argument("--burst-depth-m", type=float, default=27.0)
    ap.add_argument("--receiver-depth-m", type=float, default=10.0)
    ap.add_argument("--range-m", type=float, default=1000.0, help="horizontal range of the receiver")
    ap.add_argument("--out", default="output/shock.png")
    a = ap.parse_args()

    burst = Burst(yield_kt=a.yield_kt, z_m=-a.burst_depth_m)
    env = Environment()
    rec = Receiver(a.range_m, 0, -a.receiver_depth_m, kind="gauge")
    res = us.compute(burst, rec, env)

    print(f"Yield {a.yield_kt} kt at {a.burst_depth_m} m depth; receiver {a.range_m} m away at {a.receiver_depth_m} m depth")
    print(f"  slant range          {res.slant_range_m:10.1f} m")
    print(f"  arrival time         {res.arrival_time_s * 1e3:10.1f} ms")
    print(f"  peak overpressure    {res.peak_pressure_pa / 1e6:10.2f} MPa  ({res.peak_pressure_psi:,.0f} psi)")
    print(f"  time constant        {res.time_constant_s * 1e3:10.2f} ms")
    print(f"  surface cutoff after {res.surface_cutoff_delay_s * 1e3:10.2f} ms")
    print(f"  impulse (free field) {res.impulse_free_field_pa_s / 1e3:10.1f} kPa*s")
    print(f"  impulse (w/ cutoff)  {res.impulse_with_cutoff_pa_s / 1e3:10.1f} kPa*s")
    for w in res.warnings:
        print("  WARNING:", w)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))
    r = np.logspace(1, 4.5, 300)
    ax1.loglog(r, [us.peak_pressure_pa(a.yield_kt, x) / 1e6 for x in r])
    ax1.axhline(us.SIMILITUDE_MAX_PRESSURE_PSI * units.PSI_TO_PA / 1e6, ls=":", c="gray", label="similitude limit (30,000 psi)")
    ax1.set(xlabel="slant range (m)", ylabel="peak overpressure (MPa)", title=f"Free-field peak pressure, {a.yield_kt:g} kt")
    ax1.grid(True, which="both", alpha=0.3)
    ax1.legend()

    t = np.linspace(res.arrival_time_s - 2 * res.time_constant_s, res.arrival_time_s + 6 * res.time_constant_s, 4000)
    ax2.plot((t - res.arrival_time_s) * 1e3, us.pressure_history(burst, rec, env, t, False) / 1e6, label="free field")
    ax2.plot((t - res.arrival_time_s) * 1e3, us.pressure_history(burst, rec, env, t, True) / 1e6, label="with surface cutoff")
    ax2.set(xlabel="time after shock arrival (ms)", ylabel="overpressure (MPa)", title="Pressure history at receiver")
    ax2.grid(True, alpha=0.3)
    ax2.legend()

    fig.tight_layout()
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(a.out, dpi=130)
    print(f"Saved plot to {a.out}")


if __name__ == "__main__":
    main()
