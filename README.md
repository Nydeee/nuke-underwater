# Nuke Simulation (nukesim)

An **accuracy-first** simulator of nuclear detonations in and over water. It models the
effects on the water itself and on fish, humans, ships and other "receivers" you place
anywhere in the scene. Every number in the code traces back to a published source
(`src/nukesim/sources.py`).

## Getting started
```bash
uv sync                      # install dependencies into .venv
uv run pytest                # run the test suite
uv run python scripts/plot_air_blast_water.py --yield-kt 20 --height-m 500
uv run python scripts/plot_radiation_water.py --yield-kt 20 --height-m 500
uv run python scripts/plot_shock.py --yield-kt 20 --burst-depth-m 27 --range-m 1000
```

## Coordinates
- `x`, `y`: horizontal metres; the burst is at x = y = 0.
- `z`: metres relative to the water surface (negative = underwater).

## Roadmap
Main focus: bursts **above** the water and what they do to the water and the things in it.
Underwater bursts are an optional mode.

1. ✅ Foundation + underwater shock wave (`effects/underwater_shock.py`, underwater-burst mode)
2. ✅ Air blast over water and into the water (`effects/air_blast.py`, `effects/air_to_water.py`)
3. ✅ Initial radiation into water (`effects/initial_radiation.py`, `effects/radiation_shielding.py`)
4. Fallout and contamination: debris on the water, mixing down, induced activity in seawater
5. Thermal effects on the water surface
6. Biological effects: fish, marine mammals, humans
7. Bubble, waves and surface phenomena for contact/underwater bursts
8. Web UI with 3D placement
9. Uncertainty bands everywhere

Physics explanations live in `docs/physics/`.

## Learning guide (PDF)
A beginner-friendly companion guide explains every concept, term and equation, chapter by
chapter as the simulator grows. Sources are in `docs/guide/` (Typst format); figures are
generated from the simulator code itself.
```bash
uv run python scripts/build_guide.py   # writes output/guide.pdf
```
