"""Air blast at the water surface: Brode 1987 fits and Friedlander waveform."""

import math

import numpy as np
import pytest

from nukesim import units
from nukesim.effects import air_blast as ab


def test_eq62_matches_eq34_for_surface_burst():
    # With burst height y=0, the HOB fit (Eq. 62) should be close to Brode's own
    # ideal-surface-burst fit (Eq. 34) -- the report says Eq. 51 (the y=0 form) is
    # within 7% of Eq. 34 between 10,000 and 0.03 psi (brode1987 p.43).
    def eq34(x):
        return 2.52 / x + 4.24 / x**1.5 + (3.2 / x**3) * (1 + 41.7 * (10 * x) ** 4 / (1 + 2035 * (10 * x) ** 8))

    for x in (0.3, 0.5, 1.0, 2.0, 5.0):
        assert ab.brode_hob_psi(x, 0.0) == pytest.approx(eq34(x), rel=0.10)


def test_eq33_free_air_value():
    # Hand evaluation of Eq. 33 at r = 1 kft/kt^(1/3)
    expected = 2 + 3 + 1.6 * (1 + 105 * 1e4 / (1 + 12_920 * 1e8))
    assert ab.brode_free_air_psi(1.0) == pytest.approx(expected)


def test_reflection_factor_below_high_burst_between_2_and_8():
    # Directly below a burst, the reflected pressure on the surface is between
    # 2x (weak shock) and 8x (strong shock) the incident free-air pressure
    # (glasstone1977 Eq. 3.56.2).
    for y in (0.5, 1.0, 2.0):
        ratio = ab.brode_hob_psi(1e-3, y) / ab.brode_free_air_psi(y)
        assert 1.8 < ratio < 8.0


def test_cube_root_scaling_of_peak():
    p1 = ab.peak_overpressure_pa(1, 200, 300)
    p1000 = ab.peak_overpressure_pa(1000, 2000, 3000)
    assert p1 == pytest.approx(p1000, rel=1e-9)


def test_pressure_falls_with_range():
    p = [ab.peak_overpressure_pa(20, 500, r) for r in (0, 500, 1000, 3000, 10_000)]
    assert all(a > b for a, b in zip(p, p[1:]))


def test_arrival_time_eq40_and_eq39_agree():
    # Eq. 39 gives arrival time from peak pressure, Eq. 40 from radius; both free air, 1 kt.
    r = 1.0  # kft
    p = ab.brode_free_air_psi(r)
    t39 = 0.03394 + 893 / p**0.80424 + 2015 / p
    assert ab.brode_arrival_ms(1, r) == pytest.approx(t39, rel=0.10)


def test_friedlander_impulse_matches_target():
    sb = ab.surface_blast(20, 500, 1000)
    t = np.linspace(sb.arrival_time_s - 0.01, sb.arrival_time_s + sb.duration_s + 0.01, 200_001)
    area = np.trapezoid(sb.overpressure(t), t)
    assert area == pytest.approx(sb.impulse_pa_s, rel=1e-3)
    assert sb.overpressure(np.array([sb.arrival_time_s]))[0] == pytest.approx(sb.peak_overpressure_pa)


def test_trace_speed_infinite_at_ground_zero_and_near_air_sound_speed_far_away():
    assert ab.trace_speed_m_s(20, 500, 0) > 10_000
    far = ab.trace_speed_m_s(20, 500, 20_000)
    assert 330 < far < 380  # weak, nearly horizontal front moves at about the speed of sound in air


def test_fireball_and_contact_flags():
    assert ab.fireball_touches_water(20, 50)
    assert not ab.fireball_touches_water(20, 600)
    assert ab.is_contact_burst(20, 1.0)
    with pytest.raises(ValueError):
        ab.surface_blast(20, -10, 100)
