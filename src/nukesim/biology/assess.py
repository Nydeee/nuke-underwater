"""One plain-language effects report per receiver: blast, burns, acute radiation.

How impulse is counted (important for nuclear pulses)
-----------------------------------------------------
All underwater injury criteria come from small explosive charges with pulses of a
few milliseconds. Nuclear pulses (especially air blast pushed into the water) last
hundreds of milliseconds. Following the U.S. Navy approach (jasco_uxo sec. 6.2),
impulse is only counted for 20% of the natural oscillation period of the animal's
gas-filled organ (lungs or swim bladder), or until the surface-reflected wave
arrives, whichever is sooner. The oscillation period uses Minnaert's bubble formula
(our stand-in for Goertner's model). Peak-pressure criteria are reported as well.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .. import units
from ..effects import air_blast, air_to_water, conditions, near_surface_shock, radiation_shielding, ships, thermal, underwater_shock
from ..scenario import Burst, Environment, Receiver
from ..uncertainty import pick
from . import criteria as c

LEVELS = ["none", "possible", "likely", "severe", "lethal"]


@dataclass
class Effect:
    name: str
    level: str
    value: str
    criterion: str
    source: str
    quantity: float | None = None   # the main number behind the effect (for uncertainty ranges)
    unit: str = ""


@dataclass
class Assessment:
    receiver: Receiver
    effects: list[Effect] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def worst(self) -> str:
        return max((e.level for e in self.effects), key=LEVELS.index, default="none")

    def report(self) -> str:
        r = self.receiver
        lines = [f"{r.label or r.kind} at x={r.x_m:g} m, y={r.y_m:g} m, z={r.z_m:g} m -> worst: {self.worst.upper()}"]
        for e in self.effects:
            lines.append(f"  [{e.level:>8}] {e.name}: {e.value}  ({e.criterion}; {e.source})")
        for n in self.notes:
            lines.append(f"  note: {n}")
        return "\n".join(lines)


# --- pressure history in the water --------------------------------------------
def _water_pulse(burst: Burst, receiver: Receiver, env: Environment):
    """(t, p, cutoff_delay_s or None) at an underwater receiver.

    Deep bursts use Section 1; bursts within EM-1's near-surface range use the
    coupling model (Section 7) -- and for those just above the water, whichever of
    the direct shock and the transmitted air blast is stronger; higher bursts use
    Section 2.
    """
    if near_surface_shock.in_regime(burst):
        ns = near_surface_shock.compute(burst, receiver, env)
        t = np.linspace(ns.arrival_time_s - 0.1 * ns.time_constant_s, ns.arrival_time_s + 10 * ns.time_constant_s, 40_001)
        p = ns.pressure_history(t)
        if burst.z_m >= 0:
            aw = air_to_water.compute(burst, receiver, env)
            if aw.peak_overpressure_pa > ns.peak_pressure_pa:
                return aw.t, aw.p, None
        return t, p, None
    if burst.z_m < 0:
        res = underwater_shock.compute(burst, receiver, env)
        t = np.linspace(res.arrival_time_s - 0.1 * res.time_constant_s, res.arrival_time_s + 10 * res.time_constant_s, 40_001)
        return t, underwater_shock.pressure_history(burst, receiver, env, t), res.surface_cutoff_delay_s
    res = air_to_water.compute(burst, receiver, env)
    return res.t, res.p, None


def _windowed_impulse(t: np.ndarray, p: np.ndarray, window_s: float) -> float:
    peak = p.max()
    if peak <= 0:
        return 0.0
    i0 = int(np.argmax(p >= 0.01 * peak))
    mask = (t >= t[i0]) & (t <= t[i0] + window_s)
    return float(np.trapezoid(np.clip(p[mask], 0, None), t[mask])) if mask.sum() > 1 else 0.0


def _window(gas_volume_m3: float, depth_m: float, cutoff_s: float | None, env: Environment) -> float:
    w = 0.2 * c.gas_volume_resonance_period_s(gas_volume_m3, depth_m, env.density_kg_m3)
    return min(w, cutoff_s) if cutoff_s is not None else w


def _fmt_gy(x: float) -> str:
    return "<0.000001" if x < 1e-6 else f"{x:.3g}"


def _level_from_thresholds(value: float, thresholds: list[tuple[float, str]]) -> str:
    level = "none"
    for thr, lvl in thresholds:
        if value >= thr:
            level = lvl
    return level


# --- individual effect families ---------------------------------------------------
def _fish(burst, rec, env, a: Assessment):
    t, p, cut = _water_pulse(burst, rec, env)
    pk_db = c.spl_peak_db(p.max())
    a.effects.append(Effect(
        "blast (peak pressure)",
        _level_from_thresholds(pk_db, [(c.FISH_INJURY_ONSET_DB, "possible"), (c.FISH_MORTALITY_DB[0], "severe"), (c.FISH_MORTALITY_DB[1], "lethal")]),
        f"{p.max() / 1e3:.3g} kPa = {pk_db:.0f} dB re 1 uPa",
        "injury onset 206 dB; mortality 229-234 dB", "nmfs2023, popper2014", p.max() / 1e3, "kPa"))
    if rec.swim_bladder:
        m = rec.mass_kg or 0.5
        vol = c.SWIM_BLADDER_VOLUME_FRACTION * m / env.density_kg_m3
        win = _window(vol, rec.depth_m, cut, env)
        imp = _windowed_impulse(t, p, win)
        ld50 = c.fish_ld50_impulse_pa_s(m)
        if not 0.00002 <= m <= 0.744:
            a.notes.append(f"Fish mass {m:g} kg is outside the range of Yelverton's tests (0.02 g to 744 g); "
                           "the swim-bladder LD50 is extrapolated from our power-law fit.")
        lvl = "lethal" if imp >= ld50 else ("likely" if imp >= 0.5 * ld50 else "none")
        a.effects.append(Effect(
            "blast (impulse on swim bladder)", lvl,
            f"{imp:.3g} Pa-s in a {win * 1e3:.2g} ms window",
            f"LD50 for {m * 1000:g} g fish ~ {ld50:.3g} Pa-s (our fit to Yelverton's endpoints; 'likely' = half of LD50, our choice)",
            "yelverton1975", imp, "Pa-s"))
    else:
        a.notes.append("No swim bladder: fish are far less sensitive (damage range ~100x smaller, popper2014).")


def _mammal_or_turtle(burst, rec, env, a: Assessment, turtle: bool):
    t, p, cut = _water_pulse(burst, rec, env)
    m = rec.mass_kg or (40.0 if turtle else 200.0)
    d = rec.depth_m
    win = _window(c.lung_volume_m3(m), d, cut, env)
    imp = _windowed_impulse(t, p, win)
    thr = [(c.goertner_impulse_pa_s(c.MAMMAL_LUNG_INJURY_ONSET, m, d), "possible"),
           (c.goertner_impulse_pa_s(c.MAMMAL_LUNG_INJURY_50, m, d), "likely"),
           (c.goertner_impulse_pa_s(c.MAMMAL_MORTALITY_ONSET, m, d), "severe"),
           (c.goertner_impulse_pa_s(c.MAMMAL_MORTALITY_50, m, d), "lethal")]
    a.effects.append(Effect(
        "blast (lung injury, impulse)", _level_from_thresholds(imp, thr),
        f"{imp:.3g} Pa-s in a {win * 1e3:.2g} ms window",
        f"lung injury onset {thr[0][0]:.3g}, 50% {thr[1][0]:.3g}; mortality onset {thr[2][0]:.3g}, 50% {thr[3][0]:.3g} Pa-s for {m:g} kg at {d:g} m",
        "navy_phase4", imp, "Pa-s"))
    pk_db = c.spl_peak_db(p.max())
    a.effects.append(Effect(
        "blast (gut injury, peak)",
        _level_from_thresholds(pk_db, [(c.GI_INJURY_ONSET_DB, "possible"), (c.GI_INJURY_50_DB, "likely")]),
        f"{pk_db:.0f} dB peak", "onset 237 dB, 50% 243 dB", "navy_phase4", pk_db, "dB"))
    tts, pts = c.TURTLE_HEARING_PEAK_DB if turtle else c.HEARING_PEAK_DB[rec.hearing_group or "HF"]
    a.effects.append(Effect(
        "hearing", _level_from_thresholds(pk_db, [(tts, "possible"), (pts, "likely")]),
        f"{pk_db:.0f} dB peak", f"temporary loss {tts:g} dB, permanent injury {pts:g} dB" + ("" if turtle else f" (group {rec.hearing_group or 'HF'})"),
        "navy_phase4", pk_db, "dB"))


def _diver(burst, rec, env, a: Assessment):
    t, p, cut = _water_pulse(burst, rec, env)
    psi = p.max() * units.PA_TO_PSI
    a.effects.append(Effect(
        "blast (peak pressure)",
        _level_from_thresholds(psi, [(c.DIVER_PSI["prudent_limit"], "possible"), (c.DIVER_PSI["serious_injury"], "severe"), (c.DIVER_PSI["certain_death"], "lethal")]),
        f"{psi:.3g} psi", "keep below 50 psi; 500 psi serious lung/gut injury; >2,000 psi certain death", "usn_diving_manual",
        psi, "psi"))
    m = rec.mass_kg or 75.0
    win = _window(c.lung_volume_m3(m), rec.depth_m, cut, env)
    imp = _windowed_impulse(t, p, win)
    risks = {k: c.lance_risk(imp, *k) for k in c.LANCE_WEIBULL}
    fat = max(risks[("pulmonary", "fatality")], risks[("abdominal", "fatality")])
    inj = max(risks[("pulmonary", "injury")], risks[("abdominal", "injury")])
    lvl = "lethal" if fat >= 0.5 else "severe" if fat >= 0.1 else "likely" if inj >= 0.5 else "possible" if imp > c.DIVER_SAFE_IMPULSE_PA_S else "none"
    a.effects.append(Effect(
        "blast (impulse)", lvl,
        f"{imp:.3g} Pa-s in a {win * 1e3:.2g} ms window: injury risk {100 * inj:.0f}%, death risk {100 * fat:.0f}%",
        "Weibull risk curves from 262 human exposures; safe below 14 Pa-s", "lance2015, yelverton_richmond1981",
        imp, "Pa-s"))


def _deck(burst, rec, env, a: Assessment, prefix: str = ""):
    if burst.z_m < 0:
        a.notes.append("Air blast above an underwater burst is not modelled yet.")
        return
    r = math.hypot(rec.x_m, rec.y_m)
    sb = air_blast.surface_blast(burst.yield_kt, burst.z_m, r)
    p = sb.peak_overpressure_pa
    q = c.dynamic_pressure(p)
    eff_psi = (p + q) * units.PA_TO_PSI
    lvl, what = "none", "below 5 psi"
    for thr, txt, l in c.DECK_PSI:
        if eff_psi >= thr:
            lvl, what = l, txt
    a.effects.append(Effect(
        prefix + "blast (standing in the open)", lvl,
        f"{eff_psi:.3g} psi effective ({p * units.PA_TO_PSI:.3g} overpressure + {q * units.PA_TO_PSI:.3g} dynamic): {what}",
        "Table 12.38 (long-duration pulses); effective = overpressure + dynamic pressure (sec. 12.32)", "glasstone1977",
        eff_psi, "psi"))
    a.notes.append("Being thrown by the blast, flying debris and falling overboard are not modelled.")


def burn_level(q: float, b: dict) -> str:
    """Burn level for an exposure q (cal/cm2): severe = 2nd degree; likely = 1st degree or 2nd on dark skin."""
    if q >= b["second_degree"]:
        return "severe"
    if q >= b["second_degree"] * thermal.DARK_SKIN_FACTOR or q >= b["first_degree"]:
        return "likely"
    return "none"


def _burns(burst, rec, env, a: Assessment, prefix: str = ""):
    if burst.z_m < 0:
        return
    rng = math.hypot(rec.x_m, rec.y_m)
    s = thermal.at_surface(burst.yield_kt, burst.z_m, rng)
    b = thermal.burn_thresholds_cal_cm2(burst.yield_kt)
    lo_f, hi_f, notes = conditions.thermal_factor(burst.z_m, math.hypot(rng, burst.z_m), env.visibility, env.overcast)
    q_lo, q_hi = s.exposure_cal_cm2 * lo_f, s.exposure_cal_cm2 * hi_f
    a.notes.extend(n for n in notes if n not in a.notes)
    weather = "clear day" if (lo_f, hi_f) == (1.0, 1.0) else "with the weather chosen"
    a.effects.append(Effect(
        prefix + "burns (bare skin facing the fireball)", burn_level(q_hi, b),
        f"{q_hi:.3g} cal/cm2" if q_lo == q_hi else f"{q_lo:.3g}-{q_hi:.3g} cal/cm2",
        f"1st degree {b['first_degree']:.2g}, 2nd degree {b['second_degree']:.2g} cal/cm2 ({weather})",
        "fletcher1962" + ("" if (lo_f, hi_f) == (1.0, 1.0) else ", dna_em1_1978, glasstone1977"),
        q_hi, "cal/cm2"))


def _flash(burst, rec, env, a: Assessment, prefix: str = ""):
    """Flash blindness / retinal burn for someone looking toward the burst (Glasstone Fig. 12.88)."""
    if burst.z_m < 0:
        return
    d = conditions.flash_safe_distances_m(burst.yield_kt, burst.z_m, env.night, env.overcast)
    when = "at night" if env.night else "by day"
    if d is None:
        note = ("Flash blindness: Glasstone's curves (Fig. 12.88) only cover bursts at 10,000 ft and 50,000 ft, so it is "
                "not assessed for this burst height" + (". At night it reaches much farther than the other effects." if env.night else "."))
        if note not in a.notes:
            a.notes.append(note)
        return
    fb, rb = d
    slant = math.hypot(math.hypot(rec.x_m, rec.y_m), burst.z_m)
    if slant <= rb:
        lvl, txt = "severe", "retinal burn possible (permanent blind spot) if looking toward the burst"
    elif slant <= fb:
        lvl, txt = "likely", "flash blindness: about 10 s of lost vision (longer in dim light)"
    else:
        lvl, txt = "none", "beyond the flash-blindness distance"
    a.effects.append(Effect(
        prefix + "flash blindness (eyes)", lvl,
        f"{slant / 1000:.3g} km from the burst {when}: {txt}",
        f"safe distances {when}: flash blindness {fb / 1609.344:.3g} mi, retinal burn {rb / 1609.344:.3g} mi (read off the graphs, ~10%)",
        "glasstone1977 (Figs. 12.88a/b)", slant, "m"))


def _radiation(burst, rec, env, a: Assessment, human: bool, prefix: str = "", shield=None):
    if burst.z_m < 0:
        note = "Initial radiation from underwater bursts is not modelled."
        if note not in a.notes:
            a.notes.append(note)
        return
    d = radiation_shielding.compute(burst, rec, env)
    lo, hi = d.total_gy
    if shield:   # inside a ship (tm23_200 Table 6-5): gamma and neutron fractions
        g_lo, g_hi, n_lo, n_hi = shield
        lo = d.gamma_gy[0] * g_lo + d.neutron_gy[0] * n_lo
        hi = d.gamma_gy[1] * g_hi + d.neutron_gy[1] * n_hi
    dose = pick(lo, hi, "shielding_u")   # position within the shielding range (default: the high end)
    if human:
        lvl, txt = "none", ""
        for thr, t_, l in c.HUMAN_DOSE_BANDS_GY:
            if dose >= thr:
                lvl, txt = l, t_
        a.effects.append(Effect(
            prefix + "radiation sickness (initial radiation)", lvl,
            f"{_fmt_gy(lo)}-{_fmt_gy(hi)} Gy ({txt})",
            f"Table 12.108 dose bands; LD50 ~ {c.HUMAN_LD50_GY} Gy with minimal care"
            + ("; inside the ship: TM 23-200 Table 6-5 transmission factors" if shield else ""),
            "glasstone1977, pnnl2003" + (", tm23_200" if shield else ""),
            dose, "Gy"))
    else:
        j_lo = c.FISH_LD50_JUVENILE_GY[0]
        lvl = "lethal" if dose >= j_lo else "possible" if dose >= c.FISH_EMBRYO_LD50_GY else "none"
        a.effects.append(Effect(
            "radiation (initial)", lvl, f"{_fmt_gy(lo)}-{_fmt_gy(hi)} Gy",
            "juvenile marine fish LD50 10.5-55.5 Gy; embryos ~0.9 Gy", "icrp108_draft", dose, "Gy"))
    note = "Fallout radiation over days is assessed separately (Section 6b)."
    if note not in a.notes:
        a.notes.append(note)


def _ship(burst, rec, env, a: Assessment):
    st = rec.ship_type or "destroyer"
    rng = math.hypot(rec.x_m, rec.y_m)
    if burst.z_m >= 0:
        sb = air_blast.surface_blast(burst.yield_kt, burst.z_m, rng)
        lvl, txt = ships.air_blast_damage(st, sb.peak_overpressure_pa)
        sev, mod, light = ships.AIR_PSI[st]
        a.effects.append(Effect(
            "ship damage (air blast)", lvl, f"{sb.peak_overpressure_pa * units.PA_TO_PSI:.3g} psi peak overpressure: {txt}",
            f"{ships.SHIP_LABEL[st]}: light {light:g}, moderate {mod:g}, severe {sev:g} psi (Table 8-1)", "tm23_200",
            sb.peak_overpressure_pa * units.PA_TO_PSI, "psi"))
        if st == "small_craft":
            a.notes.append("Small craft use the 'LSTs, landing craft' row of TM 23-200 Table 8-1 (closest category).")
        a.notes.append("Capsizing by the blast wind and damage from the water waves are not assessed (no published criteria).")
    else:
        lvl, txt, r = ships.underwater_damage(st, burst.yield_kt, -burst.z_m, rng)
        a.effects.append(Effect(
            "ship damage (underwater shock)", lvl, f"{rng / 1000:.3g} km away: {txt}",
            f"{ships.SHIP_LABEL[st]}: severe within {r['severe'] / 1000:.2g} km, moderate {r['moderate'] / 1000:.2g} km, "
            f"light {r['light'] / 1000:.2g} km (Figs. 8-1 to 8-3, cube-root scaled, read off the graphs)", "tm23_200",
            rng, "m"))
        a.notes.append("Underwater ship-damage ranges ignore the shock reflected from the sea floor, which can control "
                       "light damage in shallow water (TM 23-200 p. 8-5).")
    # the crew: on deck (exposed) and below deck (shielded by the hull)
    deck = Receiver(rec.x_m, rec.y_m, max(rec.z_m, 1.0), kind="person", label=rec.label, mass_kg=rec.mass_kg)
    _deck(burst, deck, env, a, prefix="crew on deck: ")
    _burns(burst, deck, env, a, prefix="crew on deck: ")
    _flash(burst, deck, env, a, prefix="crew on deck: ")
    _radiation(burst, deck, env, a, human=True, prefix="crew on deck: ")
    shield = ships.below_deck_factors(st)
    if shield:
        _radiation(burst, deck, env, a, human=True, prefix="crew below deck: ", shield=shield)
        a.notes.append("Crew below deck: the range covers the different interior compartments (TM 23-200 Table 6-5, "
                       "'estimated values'). They are not burned: the hull blocks the heat completely (Glasstone sec. 7.18). "
                       "There is no published criterion for blast injury inside compartments.")
    else:
        a.notes.append("A small boat gives its crew little shielding; no transmission factors are published for small craft, "
                       "so only the crew on deck is assessed.")


def assess(burst: Burst, receiver: Receiver, env: Environment | None = None) -> Assessment:
    """Immediate effects (blast, burns, acute radiation) for one receiver."""
    env = env or Environment()
    if burst.z_m < 0 and -burst.z_m >= env.water_depth_m:
        raise ValueError("The burst is below the sea floor: make the water deeper or the burst shallower.")
    a = Assessment(receiver)
    kind = receiver.kind
    in_water = receiver.z_m < 0
    if kind in ("fish", "mammal", "turtle", "diver") and not in_water:
        raise ValueError(f"A {kind} must be in the water (z_m < 0).")
    if kind in ("person", "ship") and in_water:
        raise ValueError("A 'person' is on deck (z_m >= 0); use kind='diver' for someone underwater.")
    if kind not in ("person", "ship"):
        a.notes.append("Injury criteria come from small charges with short pulses; applying them to nuclear "
                       "pulses is an extrapolation.")
    if kind == "fish":
        _fish(burst, receiver, env, a)
        _radiation(burst, receiver, env, a, human=False)
    elif kind in ("mammal", "turtle"):
        _mammal_or_turtle(burst, receiver, env, a, turtle=(kind == "turtle"))
        if receiver.depth_m <= 0.5:
            a.notes.append("Animal at the surface: also exposed to air blast, heat and full radiation (not assessed for animals).")
    elif kind == "diver":
        _diver(burst, receiver, env, a)
        if receiver.depth_m <= 0.5:   # a swimmer with head out of the water
            _burns(burst, receiver, env, a)
        _radiation(burst, receiver, env, a, human=True)
    elif kind == "person":
        _deck(burst, receiver, env, a)
        _burns(burst, receiver, env, a)
        _flash(burst, receiver, env, a)
        _radiation(burst, receiver, env, a, human=True)
    elif kind == "ship":
        _ship(burst, receiver, env, a)
    else:
        raise ValueError(f"Unknown receiver kind {kind!r}")
    return a
