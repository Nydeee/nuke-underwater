"""Monte Carlo uncertainty for the biological assessments.

Runs ``assess`` (and optionally ``assess_long_term``) many times, each with the
uncertain ingredients drawn at random (see nukesim.uncertainty), and reports:
* the probability of each outcome level for the receiver and for each effect;
* the 5th, 50th (median) and 95th percentiles of each effect's main number.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..scenario import Burst, Environment, Receiver
from ..uncertainty import draw_samples, use
from .assess import LEVELS, Assessment, assess
from .long_term import assess_long_term


@dataclass
class EffectRange:
    name: str
    unit: str
    p05: float | None
    p50: float | None
    p95: float | None
    level_probs: dict


@dataclass
class UncertainAssessment:
    central: Assessment
    n: int
    level_probs: dict                 # probability of each worst-outcome level
    effects: list[EffectRange]
    long_term: dict | None = None     # percentiles of long-term numbers
    notes: list[str] = field(default_factory=list)

    @property
    def most_likely(self) -> str:
        return max(LEVELS, key=lambda lv: (self.level_probs.get(lv, 0.0), LEVELS.index(lv)))


def _probs(levels: list[str]) -> dict:
    n = max(len(levels), 1)
    return {lv: levels.count(lv) / n for lv in LEVELS}


def _pct(values: list[float]):
    v = np.asarray([x for x in values if x is not None and np.isfinite(x)], dtype=float)
    if v.size == 0:
        return None, None, None
    return tuple(float(x) for x in np.percentile(v, [5, 50, 95]))


def assess_uncertain(burst: Burst, receiver: Receiver, env: Environment | None = None, *, n: int = 200,
                     seed: int = 0, long_term: bool = False, **lt_kwargs) -> UncertainAssessment:
    env = env or Environment()
    central = assess(burst, receiver, env)
    worst: list[str] = []
    per: dict[str, dict] = {e.name: {"unit": e.unit, "q": [], "lv": []} for e in central.effects}
    lt_vals: dict[str, list] = {}
    for s in draw_samples(n, seed):
        with use(s):
            a = assess(burst, receiver, env)
            worst.append(a.worst)
            for e in a.effects:
                d = per.setdefault(e.name, {"unit": e.unit, "q": [], "lv": []})
                d["q"].append(e.quantity)
                d["lv"].append(e.level)
            if long_term:
                lt = assess_long_term(burst, receiver, env, **lt_kwargs)
                for k, v in lt.summary.items():
                    lt_vals.setdefault(k, []).append(v)
    effects = [EffectRange(name, d["unit"], *_pct(d["q"]), _probs(d["lv"])) for name, d in per.items()]
    lt_out = {k: dict(zip(("p05", "p50", "p95"), _pct(v))) for k, v in lt_vals.items()} if long_term else None
    notes = ["Ranges cover known uncertainties only (sourced and judgement-based, treated as independent); "
             "missing physics listed in the warnings is not included."]
    return UncertainAssessment(central, n, _probs(worst), effects, lt_out, notes)
