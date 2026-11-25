"""Long-term radiation effects of fallout in the sea (Section 6b).

For a fish: external dose from the contaminated water (Section 4) plus internal dose
from radioactive elements it absorbs (uptake.py), compared with dose-rate
benchmarks for fish (fish_benchmarks) and acute lethal doses (icrp108_draft).
For a person on a boat: accumulated fallout dose compared with Glasstone's dose
bands (Table 12.108). Spreading a dose over days is less harmful than receiving it
all at once, so this comparison is pessimistic.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..effects import sea_contamination as sc
from ..scenario import Burst, Environment, Receiver
from . import criteria as c
from . import uptake as up

# fish_benchmarks (uGy/h)
ERICA_SCREENING_UGY_H = 10.0
ICRP_DCRL_FISH_UGY_H = (1000.0 / 24, 10000.0 / 24)       # 1-10 mGy/d = 42-417 uGy/h
UNSCEAR_NO_POPULATION_EFFECT_UGY_H = 400.0
UNSCEAR_REDUCED_FERTILITY_UGY_H = (100.0, 1000.0)


@dataclass
class LongTermResult:
    receiver: Receiver
    times_h: np.ndarray
    external_gy_h: tuple[np.ndarray, np.ndarray]
    internal_ugy_h: tuple[np.ndarray, np.ndarray] | None
    total_ugy_h: tuple[np.ndarray, np.ndarray]
    accumulated_gy: tuple[np.ndarray, np.ndarray]
    fish_bq_per_kg: dict | None
    findings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _acc(rate_gy_h: np.ndarray, t: np.ndarray) -> np.ndarray:
    return np.concatenate([[0.0], np.cumsum(0.5 * (rate_gy_h[1:] + rate_gy_h[:-1]) * np.diff(t))])


def assess_long_term(burst: Burst, receiver: Receiver, env: Environment | None = None, *, wind_mph: float = 15.0,
                     wind_dir_deg: float = 0.0, fission_fraction: float = 1.0, fissile: str = "U235",
                     thermocline_m: float = sc.DEFAULT_THERMOCLINE_M, days: float = 30.0) -> LongTermResult:
    env = env or Environment()
    sd = sc.compute(burst, receiver, env, wind_mph=wind_mph, wind_dir_deg=wind_dir_deg,
                    fission_fraction=fission_fraction, thermocline_m=thermocline_m, t_end_h=24 * days)
    t = sd.times_h
    ext = sd.dose_rate_gy_h
    notes = list(sd.warnings)
    findings: list[str] = []
    if sd.r1_rad_h[1] == 0.0:
        findings.append("No local fallout reaches this spot (or the burst is too high for local fallout).")
        zero = np.zeros_like(t)
        return LongTermResult(receiver, t, (zero, zero), None, (zero, zero), (zero, zero), None, findings, notes)

    if receiver.kind == "fish":
        in_layer = receiver.depth_m <= sd.layer_depth_m
        internal = []
        fish_bq = None
        for r1 in sd.r1_rad_h:
            fu = up.fish_uptake(r1, t, np.maximum(sd.layer_depth_m, 1e-3), fissile=fissile, in_layer=in_layer)
            internal.append(fu.internal_ugy_h)
            fish_bq = fu.fish_bq_per_kg   # keep the high case
        total = tuple(ext[i] * 1e6 + internal[i] for i in range(2))
        acc = tuple(_acc(total[i] / 1e6, t) for i in range(2))
        peak = total[1].max()
        days_over = np.trapezoid((total[1] > ICRP_DCRL_FISH_UGY_H[0]).astype(float), t) / 24.0
        findings.append(f"Peak dose rate {total[0].max():.3g}-{peak:.3g} uGy/h "
                        f"({100 * internal[1].max() / max(peak, 1e-30):.0f}% from absorbed elements at that moment).")
        for lvl, txt in ((UNSCEAR_REDUCED_FERTILITY_UGY_H[0], "reduced fertility seen in fish from 100 uGy/h (UNSCEAR 2008)"),
                         (ICRP_DCRL_FISH_UGY_H[0], "above the ICRP 'consideration' level for fish (1-10 mGy/day): possible reduced reproductive success"),
                         (ERICA_SCREENING_UGY_H, "above the ERICA screening level (10 uGy/h): effects can't be ruled out")):
            if peak >= lvl:
                findings.append(txt)
                break
        else:
            findings.append("Below the ERICA screening level (10 uGy/h): no effects expected.")
        findings.append(f"About {days_over:.1f} days above 42 uGy/h (1 mGy/day).")
        d30 = acc[1][-1]
        findings.append(f"Accumulated over {days:g} days: {acc[0][-1]:.3g}-{d30:.3g} Gy.")
        if d30 >= c.FISH_LD50_JUVENILE_GY[0]:
            findings.append(f"Accumulated {d30:.3g} Gy: in the range that kills juvenile fish (LD50 10.5-55.5 Gy).")
        elif d30 >= c.FISH_EMBRYO_LD50_GY:
            findings.append(f"Accumulated {d30:.3g} Gy: could kill fish eggs and embryos (LD50 ~0.9 Gy), adults likely survive.")
        notes.append("Internal dose assumes fish instantly match the water and no fractionation or sideways dilution: upper estimate.")
        if fissile != "U235":
            notes.append(f"Fission yields for {fissile}.")
        return LongTermResult(receiver, t, ext, tuple(internal), total, acc, fish_bq, findings, notes)

    # people (on a boat or swimming) and other animals: external dose only
    total = tuple(e * 1e6 for e in ext)
    acc = sd.accumulated_gy
    d7 = float(np.interp(24 * 7, t, acc[1]))
    lvl_txt = "no illness expected"
    for thr, txt, _ in c.HUMAN_DOSE_BANDS_GY:
        if d7 >= thr:
            lvl_txt = txt
    if receiver.kind in ("person", "diver"):
        findings.append(f"First week: {float(np.interp(24 * 7, t, acc[0])):.3g}-{d7:.3g} Gy -> {lvl_txt} "
                        "(pessimistic: a dose spread over days is less harmful than the same dose at once).")
    findings.append(f"Over {days:g} days: {acc[0][-1]:.3g}-{acc[1][-1]:.3g} Gy.")
    return LongTermResult(receiver, t, ext, None, total, acc, None, findings, notes)
