"""Shock-wave tests, each tied to a published value or a physical law."""

import numpy as np
import pytest

from nukesim import units
from nukesim.effects import underwater_shock as us
from nukesim.scenario import Burst, Environment, Receiver


def test_tnt_formula_matches_cole_coefficients():
    # At scaled range lambda = 1 ft/lb^(1/3), Pm equals the coefficient (usace1991 Eq. 2).
    assert us.tnt_peak_pressure_psi(1.0, 1.0) == pytest.approx(21_600)
    # 1 lb TNT at 10 ft: 21600 * 10^-1.13
    assert us.tnt_peak_pressure_psi(1.0, 10.0) == pytest.approx(21_600 * 10**-1.13)
    assert us.tnt_impulse_psi_s(1.0, 10.0) == pytest.approx(1.46 * 10**-0.89)
    assert us.tnt_time_constant_s(1.0, 10.0) == pytest.approx(6.0e-5 * 10**0.18)


def test_reproduces_glasstone_6_41_calibration_point():
    # glasstone1977 sec. 6.41: 100 kt, deep water, 3,000 ft -> about 2,700 psi
    p = us.peak_pressure_pa(100, 3000 * units.FT_TO_M) * units.PA_TO_PSI
    assert p == pytest.approx(2700, rel=1e-9)


def test_nuclear_factor_is_physically_plausible():
    # A nuclear burst should put LESS of its energy into the water shock than TNT.
    assert 0.2 < us.NUCLEAR_SHOCK_TNT_FACTOR < 1.0


def test_cube_root_scaling():
    # Same scaled range R/W^(1/3) -> same peak pressure, for any yield.
    p1 = us.peak_pressure_pa(1, 500)
    p1000 = us.peak_pressure_pa(1000, 500 * 10)
    assert p1 == pytest.approx(p1000)


def test_pressure_decreases_with_range_and_pulse_lengthens():
    ranges = np.array([200, 500, 1000, 3000, 10000])
    p = [us.peak_pressure_pa(20, r) for r in ranges]
    th = [us.time_constant_s(20, r) for r in ranges]
    assert all(a > b for a, b in zip(p, p[1:]))
    # glasstone1977 sec. 6.116: duration increases with distance and with yield
    assert all(a < b for a, b in zip(th, th[1:]))
    assert us.time_constant_s(1000, 1000) > us.time_constant_s(10, 1000)


def test_surface_cutoff_reduces_impulse_for_shallow_receivers():
    burst = Burst(yield_kt=20, z_m=-300)
    deep = us.compute(burst, Receiver(1000, 0, -300))
    shallow = us.compute(burst, Receiver(1000, 0, -2))
    assert shallow.surface_cutoff_delay_s < deep.surface_cutoff_delay_s
    assert shallow.impulse_with_cutoff_pa_s < 0.2 * shallow.impulse_free_field_pa_s
    assert deep.impulse_with_cutoff_pa_s > shallow.impulse_with_cutoff_pa_s


def test_pressure_history_shape():
    burst = Burst(yield_kt=1, z_m=-500)
    rec = Receiver(300, 0, -500)
    env = Environment()
    res = us.compute(burst, rec, env)
    t = np.array([res.arrival_time_s - 1e-4, res.arrival_time_s, res.arrival_time_s + res.time_constant_s])
    p = us.pressure_history(burst, rec, env, t, include_surface_cutoff=False)
    assert p[0] == 0
    assert p[1] == pytest.approx(res.peak_pressure_pa)
    assert p[2] == pytest.approx(res.peak_pressure_pa / np.e)


def test_cavitation_cap():
    burst = Burst(yield_kt=20, z_m=-50)
    rec = Receiver(800, 0, -3)
    env = Environment()
    t = np.linspace(0.4, 1.0, 5000)
    p = us.pressure_history(burst, rec, env, t)
    assert p.min() >= -env.hydrostatic_pressure_pa(3) - 1e-6


def test_warnings_and_errors():
    near = us.compute(Burst(100, -500), Receiver(5, 0, -500))
    assert any("30,000 psi" in w for w in near.warnings)
    with pytest.raises(NotImplementedError):
        us.compute(Burst(20, 100), Receiver(100, 0, -10))
    with pytest.raises(ValueError):
        us.compute(Burst(20, -10), Receiver(100, 0, -100), Environment(water_depth_m=50))
