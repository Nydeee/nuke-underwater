"""Uncertainty: every uncertain ingredient in one place, and Monte Carlo sampling.

How it works (plain language)
-----------------------------
Each model that has a known uncertainty reads an "adjustment" for it through
``factor(name)`` or ``param(name, default)``. Normally nothing is set, so every
adjustment is 1 (or the default) and results are exactly as before.

For an uncertainty run, ``draw_samples`` picks random values for all the
ingredients many times; each run sets them with ``use(sample)`` and re-runs the
model. The spread of the results is the uncertainty.

``basis`` says where each range comes from: "sourced" (stated by the source)
or "judgement" (our own estimate, because the sources give none).
"""

from __future__ import annotations

import math
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

import numpy as np

_current: ContextVar[dict] = ContextVar("nukesim_uncertainty", default={})


@dataclass(frozen=True)
class Ingredient:
    name: str
    description: str
    kind: str            # "lognormal95" (95% within x/÷ spread), "uniform" (low..high), "uniform_u" (0..1 position in a range)
    spread: float = 1.0  # lognormal95: the x/÷ factor covering 95%
    low: float = 0.0
    high: float = 1.0
    basis: str = "sourced"
    source: str = ""


INGREDIENTS = [
    Ingredient("brode_peak", "Air-blast peak overpressure (Brode fits)", "lognormal95", spread=1.2,
               source="brode1987: 'in most cases ... within 20 percent'"),
    Ingredient("initial_radiation", "Initial radiation dose at the surface", "lognormal95", spread=2.0,
               source="glasstone1977 sec. 8.33: reliability factor 0.5 to 2"),
    Ingredient("shielding_u", "Position within the water-shielding range (TVT 24-39 in, neutron removal, slant vs vertical path)",
               "uniform_u", source="glasstone1977 Table 8.41; Section 3 low/high"),
    Ingredient("fallout_fraction_u", "Position within the 20-30% sea-burst early-fallout fraction",
               "uniform_u", source="glasstone1977 sec. 9.59"),
    Ingredient("fallout_decay", "Fallout decay law t^-1.2", "lognormal95", spread=1.25,
               source="glasstone1977 sec. 9.15: within about 25% up to 2 weeks"),
    Ingredient("mix_initial_m", "Initial depth of fallout in the sea (m)", "uniform", low=10.0, high=20.0,
               source="redwing1956"),
    Ingredient("mix_sink_m_per_h", "Sinking rate of fallout in the sea (m/h)", "uniform", low=3.0, high=4.0,
               source="redwing1956"),
    Ingredient("cf_fish", "Fish concentration factors", "lognormal95", spread=10.0,
               source="trs422 sec. 3.3: one order of magnitude either way"),
    Ingredient("thermal", "Thermal exposure at the surface (clear day, visibility not modelled)", "lognormal95",
               spread=1.25, basis="judgement"),
    Ingredient("underwater_shock", "Nuclear underwater shock calibration (one data point)", "lognormal95",
               spread=1.3, basis="judgement"),
    Ingredient("air_to_water", "Air blast transmitted into water (sonic-boom theory applied to nuclear blasts)",
               "lognormal95", spread=1.5, basis="judgement"),
    Ingredient("coupling", "Near-surface shock coupling into water", "lognormal95", spread=2.0, basis="judgement",
               source="Soviet 1961 test reproduced within a factor of 2 (eneva2000)"),
]
BY_NAME = {i.name: i for i in INGREDIENTS}


def factor(name: str) -> float:
    """Multiplicative adjustment for an ingredient (1.0 unless a sample is active)."""
    return float(_current.get().get(name, 1.0))


def param(name: str, default: float) -> float:
    """A sampled parameter value, or the default."""
    return float(_current.get().get(name, default))


def pick(low, high, name: str):
    """A value within [low, high]: geometric interpolation at the sampled position (default: high)."""
    u = _current.get().get(name, 1.0)
    low_a, high_a = np.asarray(low, dtype=float), np.asarray(high, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        geo = np.where((low_a > 0) & (high_a > 0), low_a ** (1 - u) * high_a**u, low_a + (high_a - low_a) * u)
    return float(geo) if geo.ndim == 0 else geo


@contextmanager
def use(sample: dict):
    """Run code with a set of sampled ingredient values."""
    token = _current.set(sample)
    try:
        yield
    finally:
        _current.reset(token)


def draw_samples(n: int, seed: int = 0) -> list[dict]:
    """n random sets of ingredient values."""
    rng = np.random.default_rng(seed)
    cols = {}
    for ing in INGREDIENTS:
        if ing.kind == "lognormal95":
            sigma = math.log(ing.spread) / 1.96
            cols[ing.name] = np.exp(rng.normal(0.0, sigma, n))
        elif ing.kind == "uniform":
            cols[ing.name] = rng.uniform(ing.low, ing.high, n)
        else:
            cols[ing.name] = rng.uniform(0.0, 1.0, n)
    return [{k: float(v[i]) for k, v in cols.items()} for i in range(n)]
