"""Fallout pattern (Glasstone Table 9.93) and sea contamination (Redwing 1956)."""

import math

import numpy as np
import pytest

from nukesim.effects import fallout as fo
from nukesim.effects import sea_contamination as sc
from nukesim.scenario import Burst, Environment, Receiver

MI = 1609.344


def test_no_local_fallout_for_high_air_bursts():
    # glasstone1977 Eq. 2.128.1: H < 180 W^0.4 ft -> 1 Mt about 2,900 ft (880 m)
    assert fo.has_local_fallout(1000, 800)
    assert not fo.has_local_fallout(1000, 1000)
    res = fo.fallout_at(20, 500, 10_000, 0)
    assert res.r1_rad_h == (0.0, 0.0)


def test_table_9_93_contour_sizes():
    c = {k.r1_rad_h: k for k in fo.contours(1000)}
    assert c[3000].downwind_m == pytest.approx(0.95 * 1000**0.45 * MI)
    assert c[1].max_width_m == pytest.approx(3.3 * 1000**0.48 * MI)
    assert c[100].gz_width_m == pytest.approx(0.39 * 1000**0.42 * MI)


def test_wind_factor():
    assert fo.wind_factor(15) == 1.0
    assert fo.wind_factor(30) == pytest.approx(1.25)   # glasstone1977 sec. 9.98 worked example
    assert fo.wind_factor(10) == pytest.approx(1 - 5 / 30)


def test_pattern_values_on_contour_edges_and_ordering():
    c = {k.r1_rad_h: k for k in fo.contours(1000)}
    # Just inside the tip of the 100 rad/hr contour -> about 100
    assert fo.land_r1(1000, c[100].downwind_m * 0.999, 0) == pytest.approx(100, rel=0.05)
    downwind = [fo.land_r1(1000, x, 0) for x in (40e3, 100e3, 200e3, 400e3)]
    assert all(a > b for a, b in zip(downwind, downwind[1:]))
    assert fo.land_r1(1000, -200e3, 0) == 0.0   # far upwind: nothing


def test_sea_adjustment_and_fission_fraction():
    res = fo.fallout_at(1000, 0, 100e3, 0, fission_fraction=0.5)
    land = fo.land_r1(1000, 100e3, 0) * 0.5
    assert res.r1_rad_h[0] == pytest.approx(land * 0.2 / 0.6)
    assert res.r1_rad_h[1] == pytest.approx(land * 0.3 / 0.6)


def test_arrival_time_is_distance_over_wind_speed():
    res = fo.fallout_at(1000, 0, 15 * MI * 3, 0, wind_mph=15)
    assert res.arrival_time_h == pytest.approx(3.0)


def test_seven_ten_rule():
    # glasstone1977 sec. 9.15: 7x later -> about 10x lower
    assert sc.decay_factor(7.0) / sc.decay_factor(1.0) == pytest.approx(0.1, rel=0.05)


def test_glasstone_activity_matches_2900_rad_per_hour():
    # 530 gamma-MCi per kt over 1 sq mi <-> 2,900 rads/hr (sec. 9.159-9.160)
    a = sc.gamma_bq_per_m2_at_1h(2900)
    assert a * sc.M2_PER_SQ_MILE == pytest.approx(530e6 * 3.7e10)


def test_reproduces_redwing_factor_of_about_1000():
    # redwing1956: dose rate 3 ft above sea mixed to 60 m x ~1,000 = land-equivalent
    a = sc.gamma_bq_per_m2_at_1h(2900)
    above_sea_rad_h = 0.5 * sc.infinite_medium_dose_rate_gy_h(a, 60.0) * 100
    ratio = 2900 / above_sea_rad_h
    assert 700 < ratio < 1500


def test_mixing_depth_growth_and_limits():
    assert sc.mixing_depth_m(0.0) == pytest.approx(15.0)
    assert sc.mixing_depth_m(4.0) == pytest.approx(15 + 3.5 * 4)
    assert sc.mixing_depth_m(100.0) == pytest.approx(60.0)
    assert sc.mixing_depth_m(100.0, water_depth_m=30) == pytest.approx(30.0)


def test_activity_is_conserved_when_mixing():
    a = sc.gamma_bq_per_m2_at_1h(100)
    for h in (15, 30, 60):
        assert sc.infinite_medium_dose_rate_gy_h(a, h) * h == pytest.approx(sc.infinite_medium_dose_rate_gy_h(a, 60) * 60)


def test_receiver_doses():
    b = Burst(1000, 0)
    fish10 = sc.compute(b, Receiver(50e3, 0, -10))
    boat = sc.compute(b, Receiver(50e3, 0, 1))
    deep = sc.compute(b, Receiver(50e3, 0, -150))
    assert fish10.accumulated_gy[1][-1] > boat.accumulated_gy[1][-1] > deep.accumulated_gy[1][-1]
    lo, hi = fish10.accumulated_gy
    assert np.all(lo <= hi)
    assert np.all(np.diff(hi) >= 0)
    assert sc.compute(Burst(20, 500), Receiver(5e3, 0, -5)).accumulated_gy[1][-1] == 0.0
    with pytest.raises(NotImplementedError):
        sc.compute(Burst(20, -10), Receiver(1e3, 0, -5))
