"""Geometry helpers: distances between the burst and receivers.

The "image source" trick: the water surface reflects the shock wave as an
inverted (tension) wave. That reflected wave behaves as if it came from a
mirror-image burst located the same distance *above* the surface.
"""

import math

from .scenario import Burst, Receiver


def horizontal_range_m(burst: Burst, receiver: Receiver) -> float:
    """Horizontal distance from surface zero to the receiver."""
    return math.hypot(receiver.x_m, receiver.y_m)


def slant_range_m(burst: Burst, receiver: Receiver) -> float:
    """Straight-line distance from the burst point to the receiver."""
    return math.sqrt(receiver.x_m**2 + receiver.y_m**2 + (receiver.z_m - burst.z_m) ** 2)


def image_range_m(burst: Burst, receiver: Receiver) -> float:
    """Distance from the mirror-image burst (reflected in the surface z=0)."""
    z_image = -burst.z_m
    return math.sqrt(receiver.x_m**2 + receiver.y_m**2 + (receiver.z_m - z_image) ** 2)
