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


def main():
    for f in (fig_log_vs_linear, fig_exponential_decay, fig_pressure_vs_range, fig_image_source, fig_cutoff_depths):
        f()
    out = ROOT / "output" / "guide.pdf"
    typst.compile(str(ROOT / "docs" / "guide" / "main.typ"), output=str(out), root=str(ROOT))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
