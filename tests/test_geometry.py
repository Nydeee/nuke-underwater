import pytest

from nukesim.geometry import horizontal_range_m, image_range_m, slant_range_m
from nukesim.scenario import Burst, Receiver


def test_slant_and_image_ranges():
    b = Burst(yield_kt=1, z_m=-30)
    r = Receiver(x_m=40, y_m=0, z_m=-30)
    assert horizontal_range_m(b, r) == pytest.approx(40)
    assert slant_range_m(b, r) == pytest.approx(40)
    # Image burst at z=+30, receiver at z=-30: vertical gap 60, horizontal 40 -> 72.11
    assert image_range_m(b, r) == pytest.approx((40**2 + 60**2) ** 0.5)


def test_image_always_farther_for_underwater_points():
    b = Burst(yield_kt=1, z_m=-10)
    r = Receiver(x_m=100, y_m=50, z_m=-5)
    assert image_range_m(b, r) > slant_range_m(b, r)


def test_megaton_constructor():
    assert Burst.from_megatons(1, -100).yield_kt == 1000
