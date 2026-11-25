"""How the air blast on the water surface gets INTO the water.

Plain-language summary
----------------------
1. Pressure is continuous across the surface (sparrow1995 p.141): just below the
   surface, the water feels the full surface overpressure from ``air_blast``.
2. The blast front sweeps across the surface at a "trace speed" V.
   * V faster than sound in water (c, about 1,500 m/s; near ground zero): the pulse
     travels down into the water ("propagating" zone).
   * V slower (everywhere else): the pressure fades with depth ("evanescent" zone),
     and sharp, high-frequency parts fade fastest.
3. Method (sonic-boom penetration theory: sawyers1968, via sparrow1995): treat the
   surface pressure locally as a flat pattern moving at speed V. Split the surface
   pressure history into frequencies, and carry each one down to depth z with
       exp(-i w z sqrt(1/c^2 - 1/V^2))    if V > c   (a pure time delay)
       exp(-|w| z sqrt(1/V^2 - 1/c^2))    if V < c   (fading with depth)
   This reproduces Sawyers' exact N-wave solution (see the tests).

Applying this sonic-boom theory to a nuclear blast front is OUR extension. No
public measurements of underwater pressure under nuclear air bursts exist.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from ..scenario import Burst, Environment, Receiver
from ..uncertainty import factor
from . import air_blast


def transmit_waveform(t: np.ndarray, p_surface: np.ndarray, trace_speed: float, c_water: float, depth: float) -> np.ndarray:
    """Pressure history at ``depth`` below a surface pressure pattern moving at ``trace_speed``.

    ``t`` must be uniformly spaced, with enough quiet time before and after the
    pulse that FFT wrap-around is negligible (the caller pads).
    """
    if depth <= 0:
        return np.array(p_surface, dtype=float)
    dt = t[1] - t[0]
    n = len(t)
    spec = np.fft.rfft(p_surface)
    w = 2 * np.pi * np.fft.rfftfreq(n, dt)
    inv_v2 = 0.0 if math.isinf(trace_speed) else 1.0 / trace_speed**2
    s = 1.0 / c_water**2 - inv_v2
    if s >= 0:  # propagating: delay by depth * sqrt(s)
        transfer = np.exp(-1j * w * depth * math.sqrt(s))
    else:  # evanescent
        transfer = np.exp(-w * depth * math.sqrt(-s))
    return np.fft.irfft(spec * transfer, n)


@dataclass
class WaterBlastResult:
    ground_range_m: float
    depth_m: float
    zone: str                       # "propagating" or "evanescent"
    trace_speed_m_s: float
    surface: air_blast.SurfaceBlast
    peak_overpressure_pa: float
    min_overpressure_pa: float
    impulse_pa_s: float             # positive-phase area
    t: np.ndarray = field(repr=False)
    p: np.ndarray = field(repr=False)
    warnings: list[str] = field(default_factory=list)

    @property
    def peak_fraction_of_surface(self) -> float:
        return self.peak_overpressure_pa / self.surface.peak_overpressure_pa


def compute(burst: Burst, receiver: Receiver, env: Environment | None = None, n_samples: int = 2**15) -> WaterBlastResult:
    """Air-blast-induced pressure at a receiver in the water."""
    env = env or Environment()
    if burst.z_m < 0:
        raise ValueError("air_to_water is for bursts at or above the surface; use underwater_shock for underwater bursts")
    if receiver.z_m > 0:
        raise ValueError("receiver must be in the water (z_m <= 0)")

    r = math.hypot(receiver.x_m, receiver.y_m)
    depth = receiver.depth_m
    c = env.sound_speed_m_s
    sb = air_blast.surface_blast(burst.yield_kt, burst.z_m, r)
    v = sb.trace_speed_m_s
    zone = "propagating" if v > c else "evanescent"
    kappa = abs((0.0 if math.isinf(v) else 1.0 / v**2) - 1.0 / c**2) ** 0.5
    lag = depth * kappa  # s: delay (propagating) or smoothing width (evanescent)

    # Time window: pulse plus generous padding so the FFT doesn't wrap around.
    pre = 0.2 * sb.duration_s + (20 * lag if zone == "evanescent" else 0.0)
    post = sb.duration_s * 1.5 + 40 * lag
    t = np.linspace(sb.arrival_time_s - pre, sb.arrival_time_s + post, n_samples)
    if zone == "propagating":
        p = sb.overpressure(t - lag)  # exact pure delay (avoids FFT ringing at the sharp front)
    else:
        p = transmit_waveform(t, sb.overpressure(t), v, c, depth)
    p = p * factor("air_to_water")
    # Water cannot hold much tension: absolute pressure >= 0 (crude cavitation cap).
    p = np.maximum(p, -env.hydrostatic_pressure_pa(depth))

    warnings = list(sb.warnings)
    warnings.append("Air-to-water model is sonic-boom theory applied to a nuclear blast (not validated against nuclear data).")
    if zone == "propagating" and depth > 0:
        warnings.append("Propagating zone: spreading with depth is ignored, so deep values are upper estimates.")
    if zone == "evanescent" and depth > 0:
        warnings.append(
            "Impulse at depth is an upper estimate: the blast's negative (suction) phase is not "
            "modelled yet, and it would cancel part of the deep, slow pressure."
        )
    if depth > 0.5 * max(r, burst.z_m, 1.0):
        warnings.append("Depth is comparable to range/height: the flat moving-footprint assumption is weak here.")
    if math.isfinite(env.water_depth_m) and depth > env.water_depth_m:
        raise ValueError("receiver is below the sea floor")

    dt = t[1] - t[0]
    return WaterBlastResult(
        ground_range_m=r,
        depth_m=depth,
        zone=zone,
        trace_speed_m_s=v,
        surface=sb,
        peak_overpressure_pa=float(p.max()),
        min_overpressure_pa=float(p.min()),
        impulse_pa_s=float(np.clip(p, 0, None).sum() * dt),
        t=t,
        p=p,
        warnings=warnings,
    )
