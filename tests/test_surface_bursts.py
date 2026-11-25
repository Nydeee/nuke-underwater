"""Near-surface water shock (EM-1 coupling) and explosion-generated waves (Section 7)."""

import math

import pytest

from nukesim import units
from nukesim.effects import near_surface_shock as ns
from nukesim.effects import water_waves as ww
from nukesim.scenario import Burst, Environment, Receiver

NMI_FT = 1852 * units.M_TO_FT


def test_coupling_at_surface_matches_report_values():
    # em1_dtra2004 / eneva2000: eps = 0.2, 0.162, 0.11, 0.057 for 1, 5, 10, 16 kt at x = 0
    for w, expected in ((1, 0.2), (5, 0.162), (10, 0.114), (16, 0.056)):
        assert ns.coupling(w, 0.0) == pytest.approx(expected, abs=0.002)


def test_full_coupling_at_15_ft_per_kt3():
    assert ns.eps_low(15.0) == pytest.approx(1.0, abs=0.002)
    assert ns.eps_high(15.0) == pytest.approx(1.0, abs=0.002)   # our stand-in also reaches 1


def test_high_yield_branch_is_continuous_at_0_82():
    assert ns.eps_high(0.8199) == pytest.approx(ns.eps_high(0.8201), rel=1e-3)
    assert ns.eps_high(0.82) == pytest.approx(0.205, rel=0.01)


def test_coupling_rises_with_depth():
    xs = [-10, -5, -1, 0, 1, 5, 10, 15]
    for w in (0.5, 10, 1000):
        e = [ns.coupling(w, x) for x in xs]
        assert all(a < b for a, b in zip(e, e[1:]))


def test_full_coupling_matches_glasstone_6_41():
    # 100 kt, 3,000 ft, deep receiver: Glasstone says about 2,700 psi
    psi, _ = ns.em1_peak_psi(100, 1.0, 3000 * units.FT_TO_M, 1000.0)
    assert psi == pytest.approx(2700, rel=0.1)


def test_soviet_16kt_example_within_factor_two():
    # eneva2000: 16 kt, 1.1 m above water -> eps = 0.0412 (their calculation; may mix units)
    eps = ns.coupling(16, ns.scaled_depth_ft(16, -1.1))
    assert 0.0412 / 2.2 < eps < 0.0412 * 2.2


def test_near_surface_result():
    r = ns.compute(Burst(1000, 0), Receiver(5000, 0, -30))
    assert 0 < r.peak_pressure_pa
    assert r.coupling == pytest.approx(0.018, rel=0.01)
    assert ns.in_regime(Burst(1000, 0)) and not ns.in_regime(Burst(1000, -500)) and not ns.in_regime(Burst(20, 500))


def test_glasstone_wave_formula_equals_le_mehaute_table():
    # lemehaute1996 Table 1-3, 'AVG' column at 5 nmi: 1 kt -> 1.32 ft, 1 Mt -> 55.5 ft; 'UCD' 1 Mt -> 125.1
    assert ww.deep_height_ft(1, 5 * NMI_FT) == pytest.approx(1.32, rel=0.02)
    assert ww.deep_height_ft(1000, 5 * NMI_FT) == pytest.approx(55.5, rel=0.01)
    assert ww.deep_height_ft(1000, 5 * NMI_FT) * ww.UCD_FACTOR == pytest.approx(125.1, rel=0.01)


def test_shallow_formula_underpredicts_baker():
    # glasstone1977 Table 6.57 (BAKER, ~23.5 kt in 180 ft of water) vs Eq. in sec. 6.121
    baker = {330: 94, 660: 47, 1330: 24, 2000: 16, 4000: 9}
    for yd, h in baker.items():
        ratio = h / ww.shallow_height_ft(23.5, yd * 3.0, 180.0)
        assert 1.4 < ratio < ww.BAKER_FACTOR + 0.05


def test_wave_period_length_and_arrivals():
    assert ww.period_s(1) == pytest.approx(14.1)
    assert ww.wavelength_ft(1000) == pytest.approx(1010 * 1000**0.288)
    r = ww.compute(Burst(1000, -30), 20_000, Environment(water_depth_m=4000))
    assert r.max_wave_arrival_s > r.front_arrival_s > 0
    assert r.height_m[1] > r.height_m[0] > 0


def test_surface_and_air_bursts():
    surf = ww.compute(Burst(1000, 0), 20_000, Environment(water_depth_m=4000))
    assert surf.height_m[0] == 0.0 and surf.height_m[1] > 0
    high = ww.compute(Burst(20, 500), 5_000, Environment(water_depth_m=4000))
    assert high.height_m == (0.0, 0.0)


def test_crater_and_coast():
    r, d = ww.crater_ft(1000, 0)
    assert r > d > 0
    c = ww.approach_coast(3.0, 4000.0, [1000, 100, 20, 5])
    assert c.heights_m[1] > c.heights_m[0]                       # Green's law growth
    assert c.heights_m[1] == pytest.approx(3.0 * (4000 / 100) ** 0.25)
    assert c.breaks_at_depth_m is not None
    assert all(h <= 0.78 * d + 1e-9 for h, d in zip(c.heights_m, c.depths_m))


def test_greens_law_only_in_shallow_water():
    # waves 2,000 m long don't grow in 4,000 m of water; growth starts below L/20 = 100 m
    c = ww.approach_coast(2.0, 4000.0, [3000, 500, 100, 50], wavelength_m=2000.0)
    assert c.heights_m[0] == c.heights_m[1] == c.heights_m[2] == 2.0
    assert c.heights_m[3] == pytest.approx(2.0 * (100 / 50) ** 0.25)
