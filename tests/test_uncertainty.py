"""Uncertainty: registry, sampling, and Monte Carlo assessments (Section 9)."""

import math

import numpy as np
import pytest

from nukesim import uncertainty as un
from nukesim.biology.assess import LEVELS, assess
from nukesim.biology.uncertain import assess_uncertain
from nukesim.effects import air_blast, initial_radiation, near_surface_shock
from nukesim.scenario import Burst, Receiver


def test_defaults_leave_results_unchanged():
    assert un.factor("brode_peak") == 1.0
    assert un.param("mix_sink_m_per_h", 3.5) == 3.5
    assert un.pick(1.0, 4.0, "shielding_u") == 4.0      # default = high end, as before
    base = air_blast.peak_overpressure_pa(20, 500, 1000)
    with un.use({}):
        assert air_blast.peak_overpressure_pa(20, 500, 1000) == base


def test_factor_is_applied_and_restored():
    base = air_blast.peak_overpressure_pa(20, 500, 1000)
    with un.use({"brode_peak": 1.2}):
        assert air_blast.peak_overpressure_pa(20, 500, 1000) == pytest.approx(1.2 * base)
    assert air_blast.peak_overpressure_pa(20, 500, 1000) == base


def test_coupling_factor_is_capped_at_one():
    with un.use({"coupling": 5.0}):
        assert near_surface_shock.coupling(1000, 14.0) == 1.0


def test_pick_interpolates_geometrically():
    with un.use({"shielding_u": 0.5}):
        assert un.pick(1.0, 4.0, "shielding_u") == pytest.approx(2.0)
    with un.use({"shielding_u": 0.0}):
        assert un.pick(1.0, 4.0, "shielding_u") == pytest.approx(1.0)


def test_sampling_is_reproducible_and_matches_spreads():
    a = un.draw_samples(4000, seed=1)
    b = un.draw_samples(4000, seed=1)
    assert a[0] == b[0] and a[-1] == b[-1]
    rad = np.array([s["initial_radiation"] for s in a])
    # 'x/÷ 2 covers 95%': about 95% of samples between 0.5 and 2
    inside = np.mean((rad > 0.5) & (rad < 2.0))
    assert inside == pytest.approx(0.95, abs=0.015)
    sink = np.array([s["mix_sink_m_per_h"] for s in a])
    assert 3.0 <= sink.min() and sink.max() <= 4.0


def test_every_ingredient_has_a_basis():
    for ing in un.INGREDIENTS:
        assert ing.basis in ("sourced", "judgement")
        if ing.basis == "sourced":
            assert ing.source


def test_radiation_range_spans_about_4x():
    with un.use({"initial_radiation": 0.5}):
        lo = initial_radiation.incident_dose(20, 500, 1500).total_gy
    with un.use({"initial_radiation": 2.0}):
        hi = initial_radiation.incident_dose(20, 500, 1500).total_gy
    assert hi / lo == pytest.approx(4.0)


def test_monte_carlo_assessment_properties():
    u = assess_uncertain(Burst(20, 500), Receiver(1000, 0, 2, "person"), n=150, seed=3)
    assert sum(u.level_probs.values()) == pytest.approx(1.0)
    assert u.central.worst == assess(Burst(20, 500), Receiver(1000, 0, 2, "person")).worst
    for e in u.effects:
        assert e.p05 <= e.p50 <= e.p95
        assert sum(e.level_probs.values()) == pytest.approx(1.0)
    again = assess_uncertain(Burst(20, 500), Receiver(1000, 0, 2, "person"), n=150, seed=3)
    assert again.level_probs == u.level_probs


def test_far_away_receiver_is_certainly_unharmed():
    u = assess_uncertain(Burst(20, 500), Receiver(20_000, 0, -50, "diver"), n=100)
    assert u.level_probs["none"] == 1.0
    assert u.most_likely == "none"


def test_long_term_percentiles():
    u = assess_uncertain(Burst(1000, 0), Receiver(50e3, 0, -10, "fish", mass_kg=1), n=60, long_term=True)
    d = u.long_term["dose_gy"]
    assert d["p05"] <= d["p50"] <= d["p95"]
    assert d["p95"] / d["p05"] > 2      # concentration factors alone vary ~100x across 95%
