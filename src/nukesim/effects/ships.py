"""Damage to ships, and how much a ship's steel shields the crew below deck.

Plain-language summary
----------------------
* Air blast (tm23_200 Table 8-1): peak overpressure is the measure. About 5 psi does light
  damage to most ships (radar, electrics); severe damage (sunk or needing a rebuild) needs
  25 psi for a destroyer and 30 psi for a carrier. Small craft use the "LSTs, landing craft"
  row (our choice of the closest category).
* Underwater bursts (tm23_200 Figs. 8-1 to 8-3): ranges for severe / moderate / light damage
  for a 1 kt burst at each depth, scaled by the cube root of the yield (distance and depth).
  Read off the graphs by hand (about +/-10%); the manual calls them "based on limited data".
  The shock bouncing off the sea floor (which can matter in shallow water) is not included.
* Crew below deck (tm23_200 Table 6-5, "estimated values"): the fraction of the outside
  radiation dose that reaches the compartments inside. Different compartments get very
  different amounts, so we give the range over the interior compartments.
* Thermal: anything opaque blocks the heat completely, so crew below deck are not burned
  (glasstone1977 sec. 7.18).
"""

from __future__ import annotations

import math

PSI_TO_PA = 6894.757
YD = 0.9144
FT = 0.3048

# tm23_200 Table 8-1: (severe, moderate, light) peak overpressure, psi
AIR_PSI = {
    "small_craft": (25.0, 15.0, 5.0),   # "LSTs, landing craft and landing vehicles"
    "destroyer": (25.0, 15.0, 5.0),
    "carrier": (30.0, 20.0, 5.0),
}
SHIP_LABEL = {"small_craft": "fishing boat / small craft", "destroyer": "destroyer", "carrier": "aircraft carrier"}

# tm23_200 Figs. 8-1..8-3: 1 kt damage ranges (yards) vs depth of burst (ft), read by hand.
_DEPTH_FT = (20, 100, 200, 400, 600, 800)
_SEVERE_HEAVY = (170, 204, 257, 304, 321, 323)      # battleships, cruisers, carriers, LSTs
_SEVERE_LIGHT = (186, 230, 288, 365, 392, 400)      # destroyers, transports
_MODERATE = (210, 287, 382, 529, 603, 675)
_LIGHT = (370, 477, 616, 860, 988, 1087)
_SEVERE_COL = {"small_craft": _SEVERE_HEAVY, "destroyer": _SEVERE_LIGHT, "carrier": _SEVERE_HEAVY}

# tm23_200 Table 6-5: interior compartments only (the 1.0 rows are crew topside).
# (gamma low, gamma high, neutron low, neutron high)
BELOW_DECK = {
    "carrier": (0.0005, 0.2, 0.001, 0.8),      # "battleships and large carriers"
    "destroyer": (0.1, 0.7, 0.1, 0.8),         # "destroyers, transports, escort carriers"
}


def air_blast_damage(ship_type: str, peak_overpressure_pa: float) -> tuple[str, str]:
    """(level, text) from the incident peak air overpressure."""
    sev, mod, light = AIR_PSI[ship_type]
    psi = peak_overpressure_pa / PSI_TO_PA
    if psi >= sev:
        return "severe", "severe damage: sunk or needs rebuilding"
    if psi >= mod:
        return "likely", "moderate damage: immobilized (engines, boilers, shock-sensitive equipment)"
    if psi >= light:
        return "possible", "light damage: electrical and electronic gear, can still operate"
    return "none", "no significant damage"


def _interp(xs, ys, x):
    x = min(max(x, xs[0]), xs[-1])
    for a, b, ya, yb in zip(xs, xs[1:], ys, ys[1:]):
        if a <= x <= b:
            return ya + (yb - ya) * (x - a) / (b - a)
    return ys[-1]


def underwater_damage_ranges_m(ship_type: str, yield_kt: float, depth_m: float) -> dict[str, float]:
    """Severe / moderate / light damage ranges (m) for an underwater burst (cube-root scaling)."""
    s = yield_kt ** (1.0 / 3.0)
    d1 = depth_m / FT / s                                 # scaled depth (ft at 1 kt)
    return {k: _interp(_DEPTH_FT, col, d1) * YD * s for k, col in
            (("severe", _SEVERE_COL[ship_type]), ("moderate", _MODERATE), ("light", _LIGHT))}


def underwater_damage(ship_type: str, yield_kt: float, depth_m: float, range_m: float) -> tuple[str, str, dict]:
    rng = underwater_damage_ranges_m(ship_type, yield_kt, depth_m)
    if range_m <= rng["severe"]:
        return "severe", "severe damage: hull ruptured, sunk or needs rebuilding", rng
    if range_m <= rng["moderate"]:
        return "likely", "moderate damage: immobilized (shock to machinery)", rng
    if range_m <= rng["light"]:
        return "possible", "light damage: shock-sensitive equipment", rng
    return "none", "no significant damage", rng


def below_deck_factors(ship_type: str) -> tuple[float, float, float, float] | None:
    return BELOW_DECK.get(ship_type)
