"""Danger distances: how far from the burst each level of harm reaches, for typical animals,
people and ships. Every number comes from the same injury models as the rest (assess.py); this
only searches outwards in distance for the farthest point where each level still happens.

Plain-language summary
----------------------
For each kind (a fish with a swim bladder, a fish without one, a dolphin, a whale, a diver, a
person on deck, a small boat, a destroyer) we place it at a typical depth and move it outwards
from ground zero, and record the farthest distance at which its worst injury is still
"lethal", "severe", "likely" or "possible". Close in, some models are outside their range of
validity; those are the same caveats as in the per-animal reports.
"""

from __future__ import annotations

import numpy as np

from ..scenario import Burst, Environment, Receiver
from .assess import LEVELS, assess

# (key, label, receiver kind, depth or height (m), extra receiver fields)
KINDS = [
    ("fish_bladder", "fish with a swim bladder (5 kg cod, 10 m deep)", "fish", -10.0, {"mass_kg": 5.0, "swim_bladder": True}),
    ("fish_no_bladder", "fish without a swim bladder (mackerel, 10 m deep)", "fish", -10.0, {"mass_kg": 0.5, "swim_bladder": False}),
    ("dolphin", "dolphin (200 kg, 10 m deep)", "mammal", -10.0, {"mass_kg": 200.0, "hearing_group": "HF"}),
    ("whale", "whale (humpback, 30 t, 20 m deep)", "mammal", -20.0, {"mass_kg": 30000.0, "hearing_group": "LF"}),
    ("diver", "diver (10 m deep)", "diver", -10.0, {"mass_kg": 75.0}),
    ("person", "person on deck", "person", 2.0, {}),
    ("bird", "seabird in flight (1 kg gull, 30 m up)", "bird", 30.0, {"mass_kg": 1.0}),
    ("small_craft", "small boat / fishing boat", "ship", 2.0, {"ship_type": "small_craft"}),
    ("destroyer", "destroyer", "ship", 2.0, {"ship_type": "destroyer"}),
]


def danger_distances(b: Burst, env: Environment, n: int = 36, max_range_m: float | None = None) -> list[dict]:
    rmax = max_range_m or 60_000.0 * (b.yield_kt / 15.0) ** (1.0 / 3.0)
    ranges = np.geomspace(20.0, rmax, n)
    out = []
    for key, label, kind, z, extra in KINDS:
        if kind != "person" and kind != "ship" and env.water_depth_m < -z:
            continue   # too shallow for this depth
        def level_at(r: float) -> int:
            try:
                res = assess(b, Receiver(float(r), 0.0, z, kind=kind, **extra), env)
            except (ValueError, NotImplementedError):
                return -1
            if kind == "ship":   # the ship itself (its crew are the "person on deck" row)
                hull = [e for e in res.effects if e.name.startswith("ship damage")]
                return LEVELS.index(hull[0].level) if hull else -1
            return LEVELS.index(res.worst)

        levels = [level_at(r) for r in ranges]
        farthest = {}
        for lvl in LEVELS[1:]:
            k = LEVELS.index(lvl)
            idx = [i for i, w in enumerate(levels) if w >= k]
            if not idx:
                farthest[lvl] = None
                continue
            i = idx[-1]
            lo, hi = float(ranges[i]), float(ranges[i + 1]) if i + 1 < len(ranges) else float(ranges[i])
            for _ in range(7):   # narrow down the edge between the last point inside and the next one outside
                mid = (lo * hi) ** 0.5
                if level_at(mid) >= k:
                    lo = mid
                else:
                    hi = mid
            farthest[lvl] = lo
        out.append({"key": key, "label": label, "kind": kind, "z_m": z, "farthest_m": farthest,
                    "searched_to_m": float(rmax)})
    return out
