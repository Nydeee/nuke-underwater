"""Fission-product inventory, fish uptake and long-term doses (Section 6b)."""

import numpy as np
import pytest

from nukesim.biology import uptake as up
from nukesim.biology.long_term import ICRP_DCRL_FISH_UGY_H, assess_long_term
from nukesim.scenario import Burst, Receiver


def _nuc(name):
    return next(n for n in up.NUCLIDES if n.name == name)


def test_sr90_inventory_brackets_glasstone():
    # glasstone1977 sec. 9.141 fn 9: about 0.11 MCi of Sr-90 per Mt of fission
    sr90 = _nuc("Sr-90")
    mci_per_mt = {f: up.activity_bq_per_kt(sr90, 0.0, f) * 1000 / 3.7e10 / 1e6 for f in up.FISSILE}
    assert mci_per_mt["U238"] < 0.11 < mci_per_mt["U235"]


def test_cs_to_sr_atom_ratio_matches_glasstone():
    # glasstone1977 sec. 9.145: roughly 1.5x as many Cs-137 as Sr-90 atoms (mixed fission)
    ratio = up.atoms_per_kt(_nuc("Cs-137"), "U238") / up.atoms_per_kt(_nuc("Sr-90"), "U238")
    assert 1.0 < ratio < 3.5


def test_half_life_decay():
    i131 = _nuc("I-131")
    a0 = up.activity_bq_per_kt(i131, 0.0)
    assert up.activity_bq_per_kt(i131, 8.0252 * 24) == pytest.approx(a0 / 2)


def test_deposit_conversion_uses_2900_rule():
    assert up.kt_fission_per_m2(2900.0) * 1609.344**2 == pytest.approx(1.0)


def test_uptake_scales_with_concentration_factor():
    t = np.array([24.0])
    fu = up.fish_uptake(100.0, t, np.array([60.0]))
    assert fu.fish_bq_per_kg["Cs-137"][0] == pytest.approx(100 * fu.water_bq_per_l["Cs-137"][0])
    assert fu.fish_bq_per_kg["Sr-90"][0] == pytest.approx(3 * fu.water_bq_per_l["Sr-90"][0])
    below = up.fish_uptake(100.0, t, np.array([60.0]), in_layer=False)
    assert below.internal_ugy_h[0] == 0.0


def test_internal_dose_coefficient_sanity():
    # Vives i Batlle (ICRP 2013): ~2 uGy/h for 1e4 Bq/kg Cs-137 in fish
    assert _nuc("Cs-137").dc_int * 1e4 == pytest.approx(2.0, rel=0.2)


def test_fish_long_term_assessment():
    r = assess_long_term(Burst(1000, 0), Receiver(50e3, 0, -10, "fish", mass_kg=1))
    lo, hi = r.total_ugy_h
    assert np.all(lo <= hi + 1e-12)
    assert hi.max() > ICRP_DCRL_FISH_UGY_H[0]
    # internal dose becomes more important as the short-lived external gamma emitters decay
    i1 = np.searchsorted(r.times_h, 24)
    i30 = len(r.times_h) - 1
    share = lambda i: r.internal_ugy_h[1][i] / r.total_ugy_h[1][i]
    assert share(i30) > share(i1)
    assert any("Accumulated" in f for f in r.findings)


def test_no_fallout_cases_and_person():
    r = assess_long_term(Burst(20, 500), Receiver(5e3, 0, -5, "fish"))
    assert r.total_ugy_h[1].max() == 0.0
    p = assess_long_term(Burst(1000, 0), Receiver(50e3, 0, 1, "person"))
    assert any("First week" in f for f in p.findings)
