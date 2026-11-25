"""Air blast into water: checked against Sawyers' exact sonic-boom solution."""

import math

import numpy as np
import pytest

from nukesim.effects import air_to_water as aw
from nukesim.scenario import Burst, Receiver


def sawyers(tau, zeta):
    """Sawyers (1968) closed form for an N-wave, as given in sparrow1995 p.144 (p / p_surface)."""
    a = 2 * tau - 1
    return (a * np.arctan((tau - 1) / zeta) - a * np.arctan(tau / zeta)
            + zeta * np.log((zeta**2 + tau**2) / (zeta**2 + (tau - 1) ** 2))) / np.pi


def test_fft_method_reproduces_sawyers_n_wave():
    c, v, T, depth = 1500.0, 714.0, 0.3, 25.0
    t = np.linspace(-20, 20, 2**18)
    surface = np.where((t >= 0) & (t <= T), 1 - 2 * t / T, 0.0)
    p = aw.transmit_waveform(t, surface, v, c, depth)
    m = v / math.sqrt(1 - v**2 / c**2)
    exact = sawyers(t / T, depth / (m * T))
    assert np.max(np.abs(p - exact)) < 0.01


def test_sparrow_quoted_decay_at_25m():
    # sparrow1995 p.143: 0.3 s N-wave at Mach 2.1 -> about 45% of surface peak at 25 m.
    c, v, T = 1500.0, 2.1 * 340.0, 0.3
    m = v / math.sqrt(1 - v**2 / c**2)
    tau = np.linspace(-1, 2, 300_001)
    assert sawyers(tau, 25 / (m * T)).max() == pytest.approx(0.45, abs=0.02)


def test_no_decay_when_pattern_moves_faster_than_sound_in_water():
    t = np.linspace(-1, 1, 2**14)
    surface = np.exp(-((t / 0.01) ** 2))
    p = aw.transmit_waveform(t, surface, 5000.0, 1500.0, 100.0)
    assert p.max() == pytest.approx(1.0, rel=1e-3)


def test_slower_patterns_decay_faster():
    t = np.linspace(-1, 1, 2**14)
    surface = np.exp(-((t / 0.01) ** 2))
    fast = aw.transmit_waveform(t, surface, 1400.0, 1500.0, 10.0).max()
    slow = aw.transmit_waveform(t, surface, 400.0, 1500.0, 10.0).max()
    assert slow < fast < 1.0


def test_receiver_results():
    b = Burst(yield_kt=20, z_m=500)
    surf = aw.compute(b, Receiver(500, 0, 0))
    assert surf.peak_overpressure_pa == pytest.approx(surf.surface.peak_overpressure_pa, rel=1e-3)
    gz = aw.compute(b, Receiver(0, 0, -100))
    assert gz.zone == "propagating"
    assert gz.peak_fraction_of_surface == pytest.approx(1.0, abs=0.01)
    peaks = [aw.compute(b, Receiver(1000, 0, -d)).peak_overpressure_pa for d in (0, 5, 20, 80)]
    assert all(a > b_ for a, b_ in zip(peaks, peaks[1:]))
    assert aw.compute(b, Receiver(1000, 0, -20)).zone == "evanescent"


def test_rejects_wrong_geometry():
    with pytest.raises(ValueError):
        aw.compute(Burst(20, -50), Receiver(100, 0, -10))
    with pytest.raises(ValueError):
        aw.compute(Burst(20, 500), Receiver(100, 0, 5))
