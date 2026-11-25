"""Stress tests: many scenario combinations must run without crashes or impossible numbers,
and effects must never get worse farther from the burst."""

import itertools
import math

import pytest

from nukesim.biology.assess import LEVELS, assess
from nukesim.biology.long_term import assess_long_term
from nukesim.effects import air_blast, water_waves
from nukesim.scenario import Burst, Environment, Receiver

YIELDS = [0.01, 20, 20000]
HEIGHTS = [-2000, -27, -3, 0, 3, 500, 30000]
WATER = [math.inf, 30]
PLACES = [(5, -1), (3000, -20), (300_000, -25), (1000, 2)]
KINDS = ["fish", "mammal", "turtle", "diver", "person"]


def _cases():
    for y, z, wd in itertools.product(YIELDS, HEIGHTS, WATER):
        if z < 0 and -z >= wd:
            continue
        for (x, rz), k in itertools.product(PLACES, KINDS):
            if (k == "person") != (rz > 0) or -rz >= wd:
                continue
            yield y, z, wd, x, rz, k


@pytest.mark.parametrize("y,z,wd,x,rz,k", list(_cases()))
def test_no_crash_no_impossible_numbers(y, z, wd, x, rz, k):
    b, env = Burst(y, z), Environment(water_depth_m=wd)
    a = assess(b, Receiver(x, 0, rz, k), env)
    assert a.worst in LEVELS
    for e in a.effects:
        if e.quantity is not None:
            assert math.isfinite(e.quantity)
            assert e.unit == "dB" or e.quantity >= 0
    if k in ("fish", "person") and z >= 0:
        for v in assess_long_term(b, Receiver(x, 0, rz, k), env, days=5).summary.values():
            assert math.isfinite(v) and v >= 0
    water_waves.compute(b, 10_000, env)


def test_brode_never_negative_far_away():
    assert air_blast.peak_overpressure_pa(0.01, 50, 3000) >= 0
    sb = air_blast.surface_blast(0.01, 50, 3000)
    assert sb.duration_s > 0 and sb.impulse_pa_s >= 0


@pytest.mark.parametrize("y,z,k", list(itertools.product([20, 1000], [-200, 0, 500], ["fish", "mammal", "diver", "person"])))
def test_effects_never_worse_farther_away(y, z, k):
    d = -2 if k == "person" else 20
    lv = [LEVELS.index(assess(Burst(y, z), Receiver(r, 0, -d, k)).worst) for r in (100, 1000, 10_000, 100_000)]
    assert all(b <= a for a, b in zip(lv, lv[1:]))
