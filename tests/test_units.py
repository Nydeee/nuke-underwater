import pytest

from nukesim import units


def test_psi_to_pa():
    assert units.PSI_TO_PA == pytest.approx(6894.757, rel=1e-6)


def test_feet_round_trip():
    assert 1000 * units.FT_TO_M * units.M_TO_FT == pytest.approx(1000)


def test_kiloton_definitions():
    assert units.KT_TO_J == 4.184e12
    assert units.kt_to_lb_tnt(1) == pytest.approx(2.20462e6, rel=1e-5)
    assert units.mt_to_kt(1.5) == 1500
