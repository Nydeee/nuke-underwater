"""Injury and lethality criteria, each with its source.

Everything here comes from published criteria. Where we had to fit or combine
numbers ourselves, the docstring says so.
"""

from __future__ import annotations

import math

P_REF_UPA = 1e-6  # 1 micropascal


# --- decibel helpers ---------------------------------------------------------
def spl_peak_db(p_pa: float) -> float:
    """Peak sound pressure level, dB re 1 uPa: 20 log10(|p| / 1 uPa)."""
    return 20.0 * math.log10(max(abs(p_pa), 1e-12) / P_REF_UPA)


def db_to_pa(db: float) -> float:
    return P_REF_UPA * 10 ** (db / 20.0)


# --- Fish (nmfs2023, popper2014, yelverton1975) -------------------------------
FISH_INJURY_ONSET_DB = 206.0          # nmfs2023 (FHWG 2008)
FISH_MORTALITY_DB = (229.0, 234.0)    # popper2014 Table 7.2 (explosions); NMFS onset = 229


def fish_ld50_impulse_pa_s(mass_kg: float) -> float:
    """Impulse that kills 50% of fish of a given mass.

    Yelverton et al. (1975) report LD50 from 1.7 psi-ms (0.02 g guppy fry) to 49.5 psi-ms
    (744 g carp) and a good correlation with body mass, but the fitted line is only in a
    figure we could not read. We draw a power law through those two endpoints -- OUR fit.
    """
    psi_ms_to_pa_s = 6.894757
    m_g = mass_kg * 1000.0
    exponent = math.log(49.5 / 1.7) / math.log(744.0 / 0.02)
    return 1.7 * (m_g / 0.02) ** exponent * psi_ms_to_pa_s


# --- Marine mammals and sea turtles (navy_phase4) -----------------------------
def goertner_impulse_pa_s(coeff: float, mass_kg: float, depth_m: float) -> float:
    """Modified Goertner equation: coeff * M^(1/3) * (1 + D/10.1)^(1/6) Pa-s."""
    return coeff * mass_kg ** (1.0 / 3.0) * (1.0 + depth_m / 10.1) ** (1.0 / 6.0)


MAMMAL_LUNG_INJURY_ONSET = 47.5     # navy_phase4 Table 20, Eq. 2 (~1% risk)
MAMMAL_MORTALITY_ONSET = 103.0      # navy_phase4 Table 20, Eq. 1 (~1% risk)
MAMMAL_LUNG_INJURY_50 = 65.8        # Phase III 50% value (BSEE Table D-5)
MAMMAL_MORTALITY_50 = 144.0         # Phase III 50% value (BSEE Table D-5)
GI_INJURY_ONSET_DB = 237.0          # navy_phase4 Table 20
GI_INJURY_50_DB = 243.0             # Phase III 50% (BSEE Table D-5)

# navy_phase4 Table 19, explosives: (TTS peak dB, auditory injury peak dB)
HEARING_PEAK_DB = {
    "LF": (216.0, 222.0),   # low-frequency cetaceans (baleen whales)
    "HF": (224.0, 230.0),   # high-frequency cetaceans (most dolphins)
    "VHF": (196.0, 202.0),  # very-high-frequency cetaceans (porpoises)
    "PW": (217.0, 223.0),   # phocid seals in water
    "OW": (224.0, 230.0),   # otariids (sea lions) in water
}
TURTLE_HEARING_PEAK_DB = (226.0, 232.0)  # Phase III (DoN 2017): TTS, PTS


# --- Lung / swim-bladder oscillation window (jasco_uxo, csa2004, minnaert1933) -
def gas_volume_resonance_period_s(gas_volume_m3_at_surface: float, depth_m: float, water_density: float = 1025.0) -> float:
    """Natural period of a gas volume (lung or swim bladder) treated as a bubble (Minnaert).

    Volume shrinks with depth as 10/(z+10) (csa2004), equivalent sphere radius a,
    f = (1/(2 pi a)) sqrt(3 gamma P / rho) with gamma = 1.4 and P = 101.3 kPa (1 + z/10).
    Using Minnaert's formula for the lung is OUR stand-in for Goertner's exact model.
    """
    v = gas_volume_m3_at_surface * 10.0 / (depth_m + 10.0)
    a = (3.0 * v / (4.0 * math.pi)) ** (1.0 / 3.0)
    p = 1.013e5 * (1.0 + depth_m / 10.0)
    f = math.sqrt(3.0 * 1.4 * p / water_density) / (2.0 * math.pi * a)
    return 1.0 / f


def lung_volume_m3(mass_kg: float) -> float:
    """csa2004: lung volume ~ 0.001 x 0.03 x M  (m^3, M in kg)."""
    return 0.001 * 0.03 * mass_kg


SWIM_BLADDER_VOLUME_FRACTION = 0.05  # typical marine teleost (~5% of body volume) -- general literature value, not checked


# --- Submerged humans (usn_diving_manual, lance2015, yelverton_richmond1981) --
DIVER_PSI = {"prudent_limit": 50.0, "serious_injury": 500.0, "certain_death": 2000.0}  # usn_diving_manual
DIVER_SAFE_IMPULSE_PA_S = 14.0       # yelverton_richmond1981 (14 kPa-ms)
LANCE_WEIBULL = {                    # lance2015 Table 3 (beta, eta[kPa-ms = Pa-s])
    ("pulmonary", "injury"): (2.197, 277.5),
    ("pulmonary", "fatality"): (8.068, 316.5),
    ("abdominal", "injury"): (0.885, 386.6),
    ("abdominal", "fatality"): (8.048, 802.5),
}


def lance_risk(impulse_pa_s: float, organ: str, outcome: str) -> float:
    """lance2015 Eq. 2: F(I) = 1 - exp(-(I/eta)^beta)."""
    beta, eta = LANCE_WEIBULL[(organ, outcome)]
    return 1.0 - math.exp(-((max(impulse_pa_s, 0.0) / eta) ** beta))


# --- People in air (glasstone1977 Table 12.38, sec. 12.32) --------------------
BIRD_PSI = [   # damon1974 pp. 30-31: birds in the open at sea level, incident overpressure
    (5.0, "no injuries", "none"),
    (10.0, "slight to extensive injuries", "likely"),
    (20.0, "about 50% killed", "lethal"),
]

DECK_PSI = [  # (effective peak overpressure psi, effect, level)
    (5.0, "eardrum rupture threshold", "possible"),
    (12.0, "lung damage threshold", "likely"),
    (17.5, "50% eardrum rupture (adults over 20)", "likely"),
    (25.0, "severe lung damage", "severe"),
    (40.0, "lethality threshold", "severe"),
    (62.0, "50% lethality", "lethal"),
    (92.0, "near 100% lethality", "lethal"),
]


def dynamic_pressure(p_pa: float, p0_pa: float = 101_325.0) -> float:
    """glasstone1977 Eq. 3.55.1: q = (5/2) p^2 / (7 P0 + p)."""
    return 2.5 * p_pa**2 / (7.0 * p0_pa + p_pa)


# --- Acute radiation -----------------------------------------------------------
HUMAN_DOSE_BANDS_GY = [  # glasstone1977 Table 12.108 (doses at the body surface; rem ~ 0.01 Gy)
    (0.0, "subclinical: no symptoms below about 0.5 Gy", "none"),
    (1.0, "100-200 rem: vomiting uncommon to common, no deaths expected", "possible"),
    (2.0, "200-600 rem: severe blood damage, 0-90% deaths within 2-12 weeks", "severe"),
    (6.0, "600-1,000 rem: 90-100% deaths within 1-6 weeks", "lethal"),
    (10.0, "1,000-5,000 rem: gut syndrome, 100% deaths within 2-14 days", "lethal"),
    (50.0, ">5,000 rem: nervous-system syndrome, death within 2 days", "lethal"),
]
HUMAN_LD50_GY = 4.5          # pnnl2003, minimal medical care
FISH_LD50_JUVENILE_GY = (10.5, 55.5)   # icrp108_draft (White & Angelovic 1966, 6 marine species)
FISH_EMBRYO_LD50_GY = 0.9              # icrp108_draft (plaice embryos)
