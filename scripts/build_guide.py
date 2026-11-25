"""Build the learning guide PDF (output/guide.pdf).

1. Generates the figures the guide uses (output/guide_figures/*.png), directly
   from the simulator code, so the figures always match the current models.
2. Compiles docs/guide/main.typ with Typst.

    uv run python scripts/build_guide.py
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import typst

from nukesim.effects import air_blast as ab
from nukesim.effects import air_to_water as aw
from nukesim.effects import initial_radiation as ir
from nukesim.effects import underwater_shock as us
from nukesim.scenario import Burst, Environment, Receiver

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "output" / "guide_figures"


def save(fig, name):
    FIG.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(FIG / name, dpi=160)
    plt.close(fig)


def fig_log_vs_linear():
    r = np.linspace(10, 10_000, 1000)
    p = [us.peak_pressure_pa(20, x) / 1e6 for x in r]
    fig, (a, b) = plt.subplots(1, 2, figsize=(9, 3.4))
    a.plot(r, p)
    a.set(title="Ordinary (linear) axes", xlabel="distance (m)", ylabel="peak pressure (MPa)")
    b.loglog(r, p)
    b.set(title="Logarithmic axes", xlabel="distance (m)", ylabel="peak pressure (MPa)")
    for ax in (a, b):
        ax.grid(True, which="both", alpha=0.3)
    save(fig, "log_vs_linear.png")


def fig_exponential_decay():
    t = np.linspace(0, 5, 500)
    fig, ax = plt.subplots(figsize=(6.5, 3.2))
    ax.plot(t, np.exp(-t))
    for k in range(1, 4):
        ax.plot([k], [np.exp(-k)], "o", c="C3")
        ax.annotate(f"after {k}θ: {100 * np.exp(-k):.0f}%", (k, np.exp(-k)), xytext=(8, 8), textcoords="offset points")
    ax.set(xlabel="time, in units of θ", ylabel="pressure / peak pressure", title="Exponential decay")
    ax.grid(True, alpha=0.3)
    save(fig, "exponential_decay.png")


def fig_pressure_vs_range():
    r = np.logspace(1.5, 4.5, 300)
    fig, ax = plt.subplots(figsize=(6.5, 4))
    for y in (1, 20, 100, 1000):
        ax.loglog(r, [us.peak_pressure_pa(y, x) / 1e6 for x in r], label=f"{y:g} kt")
    ax.axhline(206.8, ls=":", c="gray")
    ax.text(1000, 260, "30,000 psi: formulas unreliable above this", fontsize=8, color="gray", ha="center")
    ax.set(xlabel="slant range (m)", ylabel="peak overpressure (MPa)", title="Peak shock pressure vs distance")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    save(fig, "pressure_vs_range.png")


def fig_image_source():
    fig, ax = plt.subplots(figsize=(6.5, 4))
    ax.axhspan(-70, 0, color="#cfe3f3")
    ax.axhline(0, c="#1f5f8b")
    ax.text(160, 3, "water surface", color="#1f5f8b")
    b, im, rcv = (0, -30), (0, 30), (120, -10)
    ax.plot(*b, "r*", ms=16)
    ax.plot(*im, "*", mfc="white", mec="r", ms=16)
    ax.plot(*rcv, "ko", ms=8)
    ax.annotate("burst", b, xytext=(-40, -18), textcoords="offset points")
    ax.annotate("mirror-image burst\n(imaginary)", im, xytext=(-60, 10), textcoords="offset points")
    ax.annotate("receiver", rcv, xytext=(6, -16), textcoords="offset points")
    ax.plot([b[0], rcv[0]], [b[1], rcv[1]], "r-", label="direct path (pushes)")
    ax.plot([im[0], rcv[0]], [im[1], rcv[1]], "r--", label="reflected path (pulls)")
    ax.set(xlim=(-80, 230), ylim=(-70, 50), xlabel="horizontal distance (m)", ylabel="height (m)")
    ax.legend(loc="lower right")
    ax.set_title("The image-source trick for the surface reflection")
    save(fig, "image_source.png")


def fig_cutoff_depths():
    burst = Burst(yield_kt=20, z_m=-27)
    env = Environment()
    fig, ax = plt.subplots(figsize=(6.5, 3.6))
    for d in (3, 15, 50, 150):
        rec = Receiver(500, 0, -d)
        res = us.compute(burst, rec, env)
        t = np.linspace(res.arrival_time_s - 0.002, res.arrival_time_s + 0.06, 4000)
        ax.plot((t - res.arrival_time_s) * 1e3, us.pressure_history(burst, rec, env, t) / 1e6, label=f"receiver {d} m deep")
    ax.set(xlabel="time after shock arrives (ms)", ylabel="overpressure (MPa)",
           title="20 kt at 27 m depth, receivers 500 m away")
    ax.grid(True, alpha=0.3)
    ax.legend()
    save(fig, "cutoff_depths.png")


def fig_surface_overpressure():
    r = np.linspace(0, 4000, 400)
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    for h in (100, 300, 500, 1000):
        ax.semilogy(r, [ab.peak_overpressure_pa(20, h, x) / 1e3 for x in r], label=f"burst {h} m up")
    ax.set(xlabel="distance from ground zero (m)", ylabel="peak overpressure on water (kPa)",
           title="20 kt: blast pressure on the water surface")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    save(fig, "surface_overpressure.png")


def fig_trace_speed():
    r = np.linspace(0, 3000, 600)
    v = np.array([ab.trace_speed_m_s(20, 500, x) for x in r])
    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    ax.semilogy(r, v)
    ax.axhline(1500, c="C3", ls="--")
    ax.text(1500, 1650, "speed of sound in water (1,500 m/s)", color="C3", fontsize=8)
    ax.axhline(340, c="gray", ls=":")
    ax.text(1500, 360, "speed of sound in air", color="gray", fontsize=8)
    ax.set(xlabel="distance from ground zero (m)", ylabel="trace speed (m/s)", ylim=(200, 1e5),
           title="20 kt at 500 m: how fast the blast sweeps across the water")
    ax.grid(True, which="both", alpha=0.3)
    save(fig, "trace_speed.png")


def fig_water_map():
    from matplotlib.colors import LogNorm

    burst = Burst(yield_kt=20, z_m=500)
    ranges = np.linspace(0, 3000, 60)
    depths = np.linspace(0, 200, 40)
    peak = np.array([[aw.compute(burst, Receiver(r, 0, -d), n_samples=2**13).peak_overpressure_pa for r in ranges] for d in depths])
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.2))
    im = a1.pcolormesh(ranges, depths, peak / 1e3, norm=LogNorm(), shading="auto", cmap="viridis")
    fig.colorbar(im, ax=a1, label="peak overpressure (kPa)")
    cs = a1.contour(ranges, depths, peak / 1e3, levels=[3, 10, 30, 100], colors="white", linewidths=0.7)
    a1.clabel(cs, fmt="%g kPa", fontsize=7)
    a1.axvline(171, c="r", ls="--", lw=1)
    a1.invert_yaxis()
    a1.set(xlabel="distance from ground zero (m)", ylabel="depth (m)", title="Peak pressure in the water")
    for d in (0, 10, 50, 150):
        res = aw.compute(burst, Receiver(1000, 0, -d))
        a2.plot((res.t - res.surface.arrival_time_s) * 1e3, res.p / 1e3, label=f"{d} m deep")
    a2.set(xlim=(-200, 800), xlabel="time after blast reaches the surface above (ms)", ylabel="overpressure (kPa)",
           title="1 km from ground zero")
    a2.grid(True, alpha=0.3)
    a2.legend()
    save(fig, "water_map.png")


def fig_surface_dose():
    r = np.linspace(300, 4000, 300)
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    for y in (1, 20, 100, 1000):
        ax.semilogy(r, [ir.incident_dose(y, 500, x).total_gy for x in r], label=f"{y:g} kt")
    ax.axhline(1, c="gray", ls=":")
    ax.set(xlabel="slant distance from the burst (m)", ylabel="initial dose at surface (Gy)", ylim=(1e-3, 1e4),
           title="Initial radiation reaching the water surface")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    save(fig, "surface_dose.png")


def fig_radiation_map():
    import importlib.util

    spec = importlib.util.spec_from_file_location("prw", ROOT / "scripts" / "plot_radiation_water.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fig = mod.plot(Burst(yield_kt=20, z_m=500))
    save(fig, "radiation_map.png")


def fig_decay():
    from nukesim.effects import sea_contamination as sc

    t = np.geomspace(1, 24 * 30, 300)
    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    ax.loglog(t, sc.decay_factor(t))
    for k, tt in enumerate((7, 49, 343)):
        ax.plot([tt], [sc.decay_factor(tt)], "o", c="C3")
        ax.annotate(f"{tt} h: about 1/{10**(k + 1)}", (tt, sc.decay_factor(tt)), xytext=(6, 6), textcoords="offset points")
    ax.set(xlabel="time after the burst (hours)", ylabel="dose rate / 1-hour value", title="Fallout decay: t^-1.2 and the 7:10 rule")
    ax.grid(True, which="both", alpha=0.3)
    save(fig, "decay.png")


def fig_fallout_sea():
    import importlib.util

    spec = importlib.util.spec_from_file_location("pfs", ROOT / "scripts" / "plot_fallout_sea.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    save(mod.plot(Burst(yield_kt=1000, z_m=0)), "fallout_sea.png")


def main():
    for f in (fig_log_vs_linear, fig_exponential_decay, fig_pressure_vs_range, fig_image_source, fig_cutoff_depths,
              fig_surface_overpressure, fig_trace_speed, fig_water_map,
              fig_surface_dose, fig_radiation_map, fig_decay, fig_fallout_sea):
        f()
    out = ROOT / "output" / "guide.pdf"
    typst.compile(str(ROOT / "docs" / "guide" / "main.typ"), output=str(out), root=str(ROOT))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
