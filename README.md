# Nuke Simulation (nukesim)

An **accuracy-first** simulator of nuclear detonations in and over water. It models the
effects on the water itself and on fish, humans, ships and other "receivers" you place
anywhere in the scene. Every number in the code traces back to a published source
(`src/nukesim/sources.py`).

## The 3D interface
```bash
uv run nukesim-web
```
Opens a local 3D interface in your browser (http://127.0.0.1:8000): set up a burst, drag fish, whales,
divers and boats into the sea, and see what happens to each one, with sources and caveats.
Runs only on your computer.

## Getting started
```bash
uv sync                      # install dependencies into .venv
uv run pytest                # run the test suite
uv run python scripts/validate.py   # compare with historical/published numbers -> docs/validation.md
uv run python scripts/plot_air_blast_water.py --yield-kt 20 --height-m 500
uv run python scripts/plot_radiation_water.py --yield-kt 20 --height-m 500
uv run python scripts/plot_fallout_sea.py --yield-kt 1000 --height-m 0 --x-km 50
uv run python scripts/plot_thermal_water.py --yield-kt 1000 --height-m 2000 --range-km 3
uv run python scripts/plot_effects_zones.py --yield-kt 20 --height-m -27 --kind mammal --mass-kg 200
uv run python scripts/plot_long_term.py --yield-kt 1000 --height-m 0 --x-km 50 --depth-m 10
uv run python scripts/plot_surface_bursts.py --yield-kt 1000 --burst-depth-m 30 --water-depth-m 4000
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
4. ✅ Fallout on the sea and radioactive seawater (`effects/fallout.py`, `effects/sea_contamination.py`)
5. ✅ Thermal radiation on the sea: heating, boiling, burns on deck (`effects/thermal.py`, `effects/thermal_water.py`)
6. ✅ 6a Immediate effects on fish, marine mammals, turtles, divers, people on deck (`biology/`)
   ✅ 6b Fallout radiation over weeks and radioactive uptake into fish (`biology/uptake.py`, `biology/long_term.py`)
7. ✅ Low and surface bursts: direct shock coupling, crater, waves and shoaling (`effects/near_surface_shock.py`, `effects/water_waves.py`)
8. ✅ Local 3D web interface (`web/`, `uv run nukesim-web`)
9. ✅ Uncertainty: Monte Carlo ranges and outcome probabilities (`uncertainty.py`, `biology/uncertain.py`; "Show uncertainty" in the web app)

Physics explanations live in `docs/physics/`.

## Learning guide (PDF)
A beginner-friendly companion guide explains every concept, term and equation, chapter by
chapter as the simulator grows. Sources are in `docs/guide/` (Typst format); figures are
generated from the simulator code itself.
```bash
uv run python scripts/build_guide.py   # writes output/guide.pdf
```

## Licence
The simulator's own code is released under the [MIT licence](LICENSE). Bundled third-party parts keep
their own licences: three.js and cannon-es (MIT, see `src/nukesim/web/static/vendor/*/LICENSE`), the 3D
models (CC0 and CC-BY 3.0; authors are credited in the app's "How does this work?" box) and the
Bikini Atoll outline (© OpenStreetMap contributors, ODbL).
