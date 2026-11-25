"""Weather and time of day: how they change the heat that reaches people, and flash blindness.

Plain-language summary
----------------------
* Fletcher's burn-exposure fits (thermal.py) assume a very clear day (about 50-mile
  visibility). Haze and fog absorb and scatter the heat. DNA EM-1 gives the fraction of
  the heat that gets through for bursts below about 1/4 mile:
      T = exp(-2.9 R/V) * (1 + 1.9 R/V)      (R = slant range, V = visual range)
  We scale Fletcher's exposure by T(V) / T(50 miles) (dna_em1_1978, Ch. 3).
* A cloud layer ABOVE the burst reflects heat back down: about 1.5x more (glasstone1977
  sec. 7.100). A cloud layer BETWEEN the burst and the sea blocks most of it: EM-1 Table 3-1
  "medium cloud" lets through 0.1-0.3. We put the overcast cloud base at 1,500 m (our choice).
* Flash blindness and retinal burns: Glasstone Fig. 12.88a (day) and 12.88b (night) give
  "safe distances" for bursts at 10,000 ft and 50,000 ft only (values read off the graphs,
  about +/-10%). At night the pupil is wide open, so the distances are several times larger
  (sec. 12.84). For lower bursts there is no curve, so we do not assess it (and say so).
"""

from __future__ import annotations

import math

M_PER_MILE = 1609.344
FT = 0.3048

# EM-1 Table 3-1 probable visual ranges (miles); "exceptionally_clear" = Fletcher's 50-mile assumption
VISUAL_RANGE_MI = {
    "exceptionally_clear": 50.0,
    "very_clear": 32.0,
    "clear": 16.0,
    "light_haze": 8.0,
    "medium_haze": 4.0,
    "thin_fog": 1.5,
}
FLETCHER_VISUAL_RANGE_MI = 50.0
CLOUD_BASE_M = 1500.0                    # our choice for "overcast"
CLOUD_ABOVE_BURST_FACTOR = 1.5           # glasstone1977 sec. 7.100
CLOUD_BETWEEN_FACTOR = (0.1, 0.3)        # dna_em1_1978 Table 3-1, "medium cloud"


def transmittance(slant_m: float, visual_range_mi: float) -> float:
    """dna_em1_1978 Ch. 3: T = exp(-2.9 R/V)(1 + 1.9 R/V), total (direct + scattered) transmittance."""
    x = (slant_m / M_PER_MILE) / visual_range_mi
    return math.exp(-2.9 * x) * (1.0 + 1.9 * x)


def thermal_factor(height_m: float, slant_m: float, visibility: str = "exceptionally_clear",
                   overcast: bool = False) -> tuple[float, float, list[str]]:
    """(low, high) multiplier on Fletcher's clear-day exposure, and notes."""
    notes: list[str] = []
    v = VISUAL_RANGE_MI.get(visibility, FLETCHER_VISUAL_RANGE_MI)
    f = transmittance(slant_m, v) / transmittance(slant_m, FLETCHER_VISUAL_RANGE_MI)
    lo = hi = f
    if v != FLETCHER_VISUAL_RANGE_MI:
        notes.append(f"Haze/fog ({visibility.replace('_', ' ')}, visual range {v:g} mi): {f:.2g} of the clear-day heat "
                     "reaches here (EM-1 transmittance).")
        if height_m > 0.25 * M_PER_MILE:
            notes.append("The EM-1 haze formula is for bursts below about 1/4 mile; used here as an approximation.")
    if overcast:
        if height_m < CLOUD_BASE_M:
            lo, hi = lo * CLOUD_ABOVE_BURST_FACTOR, hi * CLOUD_ABOVE_BURST_FACTOR
            notes.append("Overcast with the cloud layer above the burst: about 1.5x more heat (reflected down, Glasstone sec. 7.100).")
        else:
            lo, hi = lo * CLOUD_BETWEEN_FACTOR[0], hi * CLOUD_BETWEEN_FACTOR[1]
            notes.append("Overcast with the cloud layer between the burst and the sea: only 0.1-0.3 of the heat gets through "
                         "(EM-1 Table 3-1, 'medium cloud'). Cloud base taken as 1,500 m.")
    return lo, hi, notes


# glasstone1977 Figs. 12.88a/b: safe separation distances (statute miles), read off the graphs.
# yield_kt -> (flash blindness @10k ft, @50k ft, retinal burn @10k ft, @50k ft)
_FB_DAY = {1: (5, 0, 11, 8), 10: (15, 10, 17, 20), 100: (20, 27, 24, 34), 1000: (13, 15, 32, 43), 10000: (26, 28, 55, 92)}
_FB_NIGHT = {1: (40, 50, 20, 27), 10: (60, 97, 31, 46), 100: (67, 145, 43, 71), 1000: (54, 115, 58, 98), 10000: (75, 139, 85, 155)}


def _interp_yield(table: dict, yield_kt: float) -> tuple[float, ...]:
    ys = sorted(table)
    y = min(max(yield_kt, ys[0]), ys[-1])
    for a, b in zip(ys, ys[1:]):
        if a <= y <= b:
            f = (math.log10(y) - math.log10(a)) / (math.log10(b) - math.log10(a))
            return tuple(p + (q - p) * f for p, q in zip(table[a], table[b]))
    return table[ys[-1]]


def flash_safe_distances_m(yield_kt: float, height_m: float, night: bool, overcast: bool = False) -> tuple[float, float] | None:
    """(flash blindness, retinal burn) safe distances in metres, or None if the burst height is outside the curves."""
    h_ft = height_m / FT
    if h_ft < 10_000:
        return None
    row = _interp_yield(_FB_NIGHT if night else _FB_DAY, yield_kt)
    f = min((h_ft - 10_000) / 40_000, 1.0)
    fb = row[0] + (row[1] - row[0]) * f
    rb = row[2] + (row[3] - row[2]) * f
    if overcast and not night:
        fb, rb = fb / 2, rb / 2                # "reduced to about half" on a cloudy day (sec. 12.88)
    return fb * M_PER_MILE, rb * M_PER_MILE
