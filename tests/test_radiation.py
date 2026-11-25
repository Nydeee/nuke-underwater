"""Initial radiation (Fletcher 1962) and water shielding (Glasstone Table 8.41)."""

import math

import pytest

from nukesim.effects import initial_radiation as ir
from nukesim.effects import radiation_shielding as rs
from nukesim.scenario import Burst, Environment, Receiver

YD_TO_MILES = 0.9144 / 1609.344


def test_eq_2_114_hand_value():
    # 1 kt at 1 mile, air burst (rho/rho0 = 0.9)
    n, g = ir.fletcher_dose_rem(1, 1.0)
    assert n == pytest.approx(4997.41 * math.exp(-9.263158 * 0.9))
    assert g == pytest.approx(1033 * math.exp(-5.415385 * 0.9))


def test_gamma_enhancement_eq_2_115():
    assert ir.gamma_enhancement(5) == 1.0
    assert ir.gamma_enhancement(10) == 1.0
    # fletcher1962 Fig. 2.15: about 1.3 at 100 kt, about 2.5 at 1 Mt, about 15 at 20 Mt
    assert ir.gamma_enhancement(100) == pytest.approx(1.3, rel=0.1)
    assert ir.gamma_enhancement(1000) == pytest.approx(2.5, rel=0.15)
    assert ir.gamma_enhancement(20_000) == pytest.approx(15, rel=0.15)


def test_within_glasstone_1977_reliability_band():
    # glasstone1977 sec. 8.34: 50 kt fission at 2,000 yd -> about 250 rad (gamma)
    _, g = ir.fletcher_dose_rem(50, 2000 * YD_TO_MILES)
    assert 0.5 <= g / 250 <= 2.0
    # glasstone1977 sec. 8.132: 1 Mt at 4,000 yd -> about 8.3 rad total
    n, g = ir.fletcher_dose_rem(1000, 4000 * YD_TO_MILES)
    assert 0.5 <= (n + g) / 8.3 <= 2.0


def test_fletcher_own_table_100_rem_at_1kt():
    # fletcher1962 p.43: 100 rem at 0.69 mi for 1 kt
    n, g = ir.fletcher_dose_rem(1, 0.69)
    assert n + g == pytest.approx(100, rel=0.15)


def test_neutrons_fall_faster_than_gamma_with_range():
    n1, g1 = ir.fletcher_dose_rem(20, 0.5)
    n2, g2 = ir.fletcher_dose_rem(20, 1.5)
    assert n2 / n1 < g2 / g1


def test_close_range_warning():
    assert any("0.28 miles" in w for w in ir.incident_dose(20, 100, 200).warnings)


def test_tenth_value_thicknesses():
    # Glasstone Table 8.41 for fresh water: 24 in and 39 in
    assert rs.gamma_tvt_m(1000, conservative=False) == pytest.approx(24 * 0.0254, rel=0.03)
    assert rs.gamma_tvt_m(1000, conservative=True) == pytest.approx(39 * 0.0254, rel=0.03)
    # seawater is denser, so slightly thinner
    assert rs.gamma_tvt_m(1025) < rs.gamma_tvt_m(1000)
    assert rs.transmission(rs.gamma_tvt_m(1025), rs.gamma_tvt_m(1025)) == pytest.approx(0.1)
    assert rs.neutron_tvt_m(1000) == pytest.approx(math.log(10) / 10.3)


def test_dose_falls_with_depth_and_range_is_ordered():
    b = Burst(20, 500)
    doses = [rs.compute(b, Receiver(1000, 0, -d)).total_gy for d in (0, 0.5, 1, 2, 5)]
    for lo, hi in doses:
        assert lo <= hi
    highs = [hi for _, hi in doses]
    assert all(a > c for a, c in zip(highs, highs[1:]))
    surf = rs.compute(b, Receiver(1000, 0, 0))
    assert surf.total_gy[0] == pytest.approx(surf.total_gy[1])
    assert surf.total_gy[1] == pytest.approx(surf.incident.total_gy)


def test_receiver_on_a_boat_gets_unshielded_dose():
    b = Burst(20, 500)
    boat = rs.compute(b, Receiver(1000, 0, 2))
    assert boat.depth_m == 0
    assert boat.total_gy[1] > 0


def test_underwater_burst_not_supported_and_sea_floor_check():
    with pytest.raises(NotImplementedError):
        rs.compute(Burst(20, -10), Receiver(1000, 0, -5))
    with pytest.raises(ValueError):
        rs.compute(Burst(20, 500), Receiver(1000, 0, -60), Environment(water_depth_m=50))
