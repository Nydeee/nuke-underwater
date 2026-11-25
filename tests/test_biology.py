"""Biological effect criteria and assessments (Section 6a)."""

import math

import pytest

from nukesim.biology import criteria as c
from nukesim.biology.assess import LEVELS, assess
from nukesim.scenario import Burst, Receiver


def test_decibel_conversions():
    assert c.db_to_pa(206) == pytest.approx(20_000, rel=0.01)
    assert c.db_to_pa(229) == pytest.approx(282_000, rel=0.01)
    assert c.spl_peak_db(c.db_to_pa(237)) == pytest.approx(237)


def test_navy_equations_match_jasco_worked_values():
    # jasco_uxo Table 7, onset lung injury at 1 m depth
    assert c.goertner_impulse_pa_s(47.5, 5, 1) == pytest.approx(82.5, abs=0.1)
    assert c.goertner_impulse_pa_s(47.5, 60, 1) == pytest.approx(188.9, abs=0.1)
    assert c.goertner_impulse_pa_s(47.5, 16000, 1) == pytest.approx(1215.9, abs=0.5)


def test_heavier_and_deeper_animals_tolerate_more():
    assert c.goertner_impulse_pa_s(103, 1000, 1) > c.goertner_impulse_pa_s(103, 10, 1)
    assert c.goertner_impulse_pa_s(103, 100, 50) > c.goertner_impulse_pa_s(103, 100, 0)


def test_fish_ld50_fit_hits_yelverton_endpoints():
    psi_ms = 6.894757
    assert c.fish_ld50_impulse_pa_s(0.02e-3) == pytest.approx(1.7 * psi_ms)
    assert c.fish_ld50_impulse_pa_s(0.744) == pytest.approx(49.5 * psi_ms)


def test_lance_risk_reproduces_published_values():
    # lance2015 abstract (verbatim): 50% fatality at 302 kPa-ms
    assert c.lance_risk(302, "pulmonary", "fatality") == pytest.approx(0.5, abs=0.01)
    # 1% injury: about 34 (chest) and 2 (abdomen) kPa-ms
    assert c.lance_risk(34, "pulmonary", "injury") == pytest.approx(0.01, abs=0.002)
    assert c.lance_risk(2, "abdominal", "injury") == pytest.approx(0.01, abs=0.003)


def test_lung_period_reasonable():
    # 5 kg animal at 1 m: lung ~0.15 L -> period of order 10 ms
    assert 0.005 < c.gas_volume_resonance_period_s(c.lung_volume_m3(5), 1) < 0.02
    assert c.gas_volume_resonance_period_s(c.lung_volume_m3(5), 50) < c.gas_volume_resonance_period_s(c.lung_volume_m3(5), 1)


def test_dynamic_pressure_glasstone():
    p0 = 101_325.0
    p = 10 * 6894.757
    assert c.dynamic_pressure(p, p0) == pytest.approx(2.5 * p**2 / (7 * p0 + p))


def test_assessment_gets_worse_closer_in():
    b = Burst(1000, -100)
    near = assess(b, Receiver(500, 0, -50, "mammal", mass_kg=200, hearing_group="LF")).worst
    far = assess(b, Receiver(20_000, 0, -50, "mammal", mass_kg=200, hearing_group="LF")).worst
    assert LEVELS.index(near) > LEVELS.index(far)


def test_person_on_deck_effects_and_validation():
    a = assess(Burst(20, 500), Receiver(1000, 0, 2, "person"))
    names = {e.name for e in a.effects}
    assert {"blast (standing in the open)", "burns (bare skin facing the fireball)"} <= names
    assert a.worst == "lethal"   # ~22 Gy initial radiation
    with pytest.raises(ValueError):
        assess(Burst(20, 500), Receiver(1000, 0, -5, "person"))
    with pytest.raises(ValueError):
        assess(Burst(20, 500), Receiver(1000, 0, 5, "fish"))


def test_fish_without_swim_bladder_skips_impulse():
    a = assess(Burst(20, -30), Receiver(800, 0, -20, "fish", mass_kg=0.5, swim_bladder=False))
    assert not any("swim bladder" in e.name for e in a.effects)
    assert any("No swim bladder" in n for n in a.notes)


def test_diver_far_from_air_burst_is_safe_and_report_text():
    a = assess(Burst(20, 500), Receiver(3000, 0, -10, "diver"))
    assert a.worst == "none"
    assert "diver" in a.report()
