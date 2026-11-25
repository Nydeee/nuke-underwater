"""Local fallout landing on the sea (idealized pattern).

Plain-language summary
----------------------
* Only bursts low enough for the fireball to reach the surface make significant
  local fallout: below about 180 W^0.4 ft (glasstone1977 Eq. 2.128.1, +-30%).
* Where it lands: Glasstone's idealized fallout pattern for a contact surface
  burst (Table 9.93). For each "1-hour reference dose rate" level (1 to 3,000
  rads/hr) it gives the downwind distance, maximum width and ground-zero width as
  powers of the yield, for a 15 mph wind. The wind factor F (sec. 9.97) stretches
  the downwind distances for other wind speeds.
* Dose-rate values scale with the FISSION fraction of the yield (sec. 9.94).
* Table 9.93 is for LAND. Over the sea only 20-30% of the radioactivity comes
  down as early fallout, versus about 60% assumed for land (sec. 9.59), so we
  multiply by 0.2/0.6 to 0.3/0.6 and report a range. That scaling is OUR
  adjustment, labelled as such.
* Contour shape: Glasstone shows the shape only as a figure (Fig. 9.93). We
  approximate each contour as an upwind semicircle (diameter = ground-zero width,
  as sec. 9.93 states) joined to a downwind ellipse (length = downwind distance,
  width = maximum width). That geometric shape is OUR approximation.

The reference dose rate R1 is the land-equivalent dose rate 3 ft above a smooth
surface 1 hour after the burst (as if all fallout were down by then).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .. import units

M_PER_MILE = 1609.344

# glasstone1977 Table 9.93: R1 (rads/hr): (downwind a, exp), (max width a, exp), (GZ width a, exp); statute miles
TABLE_9_93 = [
    (3000.0, (0.95, 0.45), (0.0076, 0.86), (0.026, 0.58)),
    (1000.0, (1.8, 0.45), (0.036, 0.76), (0.060, 0.57)),
    (300.0, (4.5, 0.45), (0.13, 0.66), (0.20, 0.48)),
    (100.0, (8.9, 0.45), (0.38, 0.60), (0.39, 0.42)),
    (30.0, (16.0, 0.45), (0.76, 0.56), (0.53, 0.41)),
    (10.0, (24.0, 0.45), (1.4, 0.53), (0.68, 0.41)),
    (3.0, (30.0, 0.45), (2.2, 0.50), (0.89, 0.41)),
    (1.0, (40.0, 0.45), (3.3, 0.48), (1.5, 0.41)),
]

LAND_FALLOUT_FRACTION = 0.60                 # glasstone1977 sec. 9.59
WATER_FALLOUT_FRACTION = (0.20, 0.30)        # glasstone1977 sec. 9.59


def has_local_fallout(yield_kt: float, height_m: float) -> bool:
    """glasstone1977 Eq. 2.128.1: local fallout only below about 180 W^0.4 ft."""
    return height_m < 180.0 * yield_kt**0.4 * units.FT_TO_M


def wind_factor(wind_mph: float) -> float:
    """glasstone1977 sec. 9.97: downwind-distance factor F (valid about 8-45 mph)."""
    if wind_mph >= 15:
        return 1.0 + (wind_mph - 15.0) / 60.0
    return 1.0 + (wind_mph - 15.0) / 30.0


@dataclass(frozen=True)
class Contour:
    r1_rad_h: float
    downwind_m: float
    max_width_m: float
    gz_width_m: float

    def normalized_radius(self, x_m: float, y_m: float) -> float:
        """<= 1 means the point is inside this contour (x = downwind, y = crosswind)."""
        circle = math.hypot(x_m, y_m) / (self.gz_width_m / 2.0)   # around ground zero
        a = self.downwind_m / 2.0
        b = self.max_width_m / 2.0
        ellipse = math.sqrt(((x_m - a) / a) ** 2 + (y_m / b) ** 2)  # downwind lobe
        return min(circle, ellipse)


def contours(yield_kt: float, wind_mph: float = 15.0) -> list[Contour]:
    f = wind_factor(wind_mph)
    out = []
    for r1, (ad, ed), (am, em), (ag, eg) in TABLE_9_93:
        out.append(Contour(r1, f * ad * yield_kt**ed * M_PER_MILE, am * yield_kt**em * M_PER_MILE, ag * yield_kt**eg * M_PER_MILE))
    return out


def land_r1(yield_kt: float, x_m: float, y_m: float, wind_mph: float = 15.0) -> float:
    """Land 1-h reference dose rate (rads/hr) at a point, interpolating between contours (all-fission weapon)."""
    cs = contours(yield_kt, wind_mph)
    rho = [c.normalized_radius(x_m, y_m) for c in cs]
    if rho[0] <= 1.0:
        return cs[0].r1_rad_h                      # inside the highest contour: cap at 3,000
    for i in range(1, len(cs)):
        if rho[i] <= 1.0:                          # between contour i-1 (outside) and i (inside)
            r_out, r_in = rho[i - 1], rho[i]
            frac = (r_out - 1.0) / (r_out - r_in) if r_out != r_in else 0.0
            lo, hi = math.log(cs[i].r1_rad_h), math.log(cs[i - 1].r1_rad_h)
            return math.exp(lo + (hi - lo) * (1.0 - frac))
    return 0.0                                     # outside the 1 rad/hr contour


@dataclass
class FalloutAtPoint:
    r1_rad_h: tuple[float, float]   # (low, high) sea-adjusted 1-h reference dose rate, land-equivalent
    arrival_time_h: float
    warnings: list[str] = field(default_factory=list)


def fallout_at(yield_kt: float, height_m: float, x_m: float, y_m: float, wind_mph: float = 15.0,
               wind_dir_deg: float = 0.0, fission_fraction: float = 1.0) -> FalloutAtPoint:
    """Fallout reference dose rate at a sea location. Wind blows TOWARD ``wind_dir_deg`` (0 = +x)."""
    warnings: list[str] = []
    if height_m < 0:
        raise NotImplementedError("Underwater bursts make a radioactive 'pool', not modelled (see guide, BAKER data).")
    if not has_local_fallout(yield_kt, height_m):
        return FalloutAtPoint((0.0, 0.0), math.inf, ["Burst too high for significant local fallout (glasstone1977 Eq. 2.128.1)."])
    th = math.radians(wind_dir_deg)
    xd = x_m * math.cos(th) + y_m * math.sin(th)     # downwind coordinate
    yc = -x_m * math.sin(th) + y_m * math.cos(th)    # crosswind coordinate
    land = land_r1(yield_kt, xd, yc, wind_mph) * fission_fraction
    lo, hi = (land * f / LAND_FALLOUT_FRACTION for f in WATER_FALLOUT_FRACTION)
    if not (8 <= wind_mph <= 45):
        warnings.append("Wind speed outside 8-45 mph: idealized pattern not valid (glasstone1977 sec. 9.97).")
    warnings.append("Idealized pattern from land data, scaled for sea bursts by our 20-30%/60% adjustment.")
    if land == 0.0:
        warnings.append("Outside the lowest (1 rad/hr) contour of the idealized pattern.")
    speed_m_h = wind_mph * M_PER_MILE
    arrival = max(math.hypot(x_m, y_m) / speed_m_h, 0.0)
    return FalloutAtPoint((lo, hi), arrival, warnings)
