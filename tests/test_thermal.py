"""Thermal radiation (Fletcher Table 2.11, Glasstone ch. VII) and absorption in water."""

import math

import numpy as np
import pytest

from nukesim.effects import thermal as th
from nukesim.effects import thermal_water as tw

MI = 1609.344


def test_eq_2_106_hand_value():
    # Q/W at d_s = 1 mile: log10 = a  ->  10**-0.0401874
    assert th.radiant_exposure_cal_cm2(1, 100.0, math.sqrt(MI**2 - 100.0**2)) == pytest.approx(10**-0.0401874, rel=1e-6)


def test_contact_burst_uses_0_7_w():
    air = th.radiant_exposure_cal_cm2(100, 600, 5 * MI)
    contact = th.radiant_exposure_cal_cm2(100, 0.0, 5 * MI)
    ds = math.hypot(5 * MI, 600) / MI
    assert contact == pytest.approx(0.7 * 100 * th._logpoly(th.EQ_2_106, 5.0))
    assert air == pytest.approx(100 * th._logpoly(th.EQ_2_106, ds))


def test_fletcher_vs_glasstone_implied_transmittance():
    # Q = 85.6 f W tau / D^2 (Eq. 7.96.3, f = 0.35): Fletcher's clear-day fit implies tau in (0.6, 1)
    for d_mi in (1, 2, 5, 10):
        slant = d_mi * MI
        q = th.radiant_exposure_cal_cm2(1000, 1000, math.sqrt(slant**2 - 1000**2))
        tau = q / th.glasstone_exposure_cal_cm2(1000, slant, 1.0)
        assert 0.55 < tau < 1.0


def test_burn_thresholds():
    b = th.burn_thresholds_cal_cm2(1)
    assert b["first_degree"] == pytest.approx(10**0.3141555)   # about 2.06
    assert b["second_degree"] == pytest.approx(10**0.6025982)  # about 4.00
    assert th.burn_thresholds_cal_cm2(1000)["second_degree"] > b["second_degree"]  # slower pulse needs more


def test_pulse_timing():
    assert th.time_of_maximum_s(1000) == pytest.approx(0.0417 * 1000**0.44)
    # glasstone1977 sec. 7.86: about 80% delivered by 10 t_max
    # (only for large yields, where 10 t_max still falls inside Fletcher's fit range)
    for w in (1000, 10_000):
        assert th.delivered_fraction(10 * th.time_of_maximum_s(w), w) == pytest.approx(0.8, abs=0.08)
    assert th.delivered_fraction(1e-4, 1000) < th.delivered_fraction(1.0, 1000) <= 0.81
    assert th.delivered_fraction(1e6, 20) == pytest.approx(0.80, abs=0.01)   # "at least 80%" beyond the fit


def test_fresnel():
    assert th.fresnel_reflectance(0.0) == pytest.approx(0.0211, abs=2e-4)
    r = [th.fresnel_reflectance(math.radians(a)) for a in (0, 30, 60, 80, 89)]
    assert all(x < y for x, y in zip(r, r[1:]))


def test_spectrum_peak_and_normalisation():
    wl, w = tw.spectrum(6000.0)
    assert w.sum() == pytest.approx(1.0)
    peak = wl[np.argmax(w / np.gradient(wl))]
    assert peak == pytest.approx(2.898e-3 / 6000.0, rel=0.02)   # Wien's law


def test_absorption_data_values():
    # Segelstein at 1 um ~ 37.7 /m; Pope & Fry at 500 nm ~ 0.0204 /m (data README)
    assert tw.absorption_per_m(np.array([1.0e-6]))[0] == pytest.approx(37.7, rel=0.05)
    assert tw.absorption_per_m(np.array([500e-9]))[0] == pytest.approx(0.0204, rel=0.05)


def test_energy_conservation_and_monotonic_decay():
    f = tw.fraction_remaining([0.0, 1e-3, 1e-2, 1.0, 10.0, 100.0])
    assert f[0] == pytest.approx(1.0)
    assert np.all(np.diff(f) < 0)
    h = tw.heat_profile(1e5, max_depth_m=1000.0, n_layers=400)
    assert h.absorbed_j_m2.sum() == pytest.approx(1e5 * (1 - tw.fraction_remaining(1000.0)[0]), rel=1e-6)


def test_heating_scales_and_boils():
    small = tw.heat_profile(1e4)
    big = tw.heat_profile(1e5)
    assert big.temperature_rise_c[50] == pytest.approx(10 * small.temperature_rise_c[50])
    assert small.evaporated_mm == 0.0 or small.evaporated_mm < big.evaporated_mm
    huge = tw.heat_profile(5e6)
    assert huge.evaporated_mm > 0
    assert huge.final_temperature_c.max() == pytest.approx(100.0)


def test_latent_heat():
    assert tw.latent_heat_j_kg(20.0) == pytest.approx(2.4537e6, rel=1e-3)
    assert tw.latent_heat_j_kg(100.0) == pytest.approx(2.2566e6, rel=1e-3)


def test_surface_result_and_underwater_burst():
    s = th.at_surface(20, 500, 1000)
    assert 0 < s.reflectance < 0.2
    assert s.exposure_horizontal_cal_cm2 < s.exposure_cal_cm2
    with pytest.raises(NotImplementedError):
        th.at_surface(20, -10, 100)
