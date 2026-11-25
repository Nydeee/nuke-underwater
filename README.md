# Nuke Simulation (nukesim)

An **accuracy-first** simulator of nuclear detonations in and over water. It models the
effects on the water itself and on fish, humans, ships and other "receivers" you place
anywhere in the scene. Every number in the code traces back to a published source
(`src/nukesim/sources.py`).

## Getting started
```bash
uv sync                      # install dependencies into .venv
uv run pytest                # run the test suite
uv run python scripts/plot_shock.py --yield-kt 20 --burst-depth-m 27 --range-m 1000
```

## Coordinates
- `x`, `y`: horizontal metres; the burst is at x = y = 0.
- `z`: metres relative to the water surface (negative = underwater).

## Roadmap
1. ✅ Foundation + underwater shock wave (`effects/underwater_shock.py`)
2. Bubble dynamics + surface phenomena (spray dome, column, base surge)
3. Surface water waves
4. Water state: equation of state, vaporisation/dissociation, radiolysis, induced radioactivity
5. Air/surface bursts over water: fireball, thermal, airblast
6. Radiation & fallout
7. Biological effects: fish, marine mammals, humans
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
