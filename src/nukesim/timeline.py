"""What happens WHEN: time-dependent view of a scenario (for the timeline slider).

The rest of the simulator answers "how bad does it get?" for each receiver. This
module adds "and when?". It does not add new physics: every time here comes from
a model that is already in the simulator and already validated.

  what                          timing used                                         source
  ----------------------------  --------------------------------------------------  ------------------------------
  air blast front               Brode Eq. 40 (arrival time vs shock radius),        brode1987
                                solved backwards for the radius at a given time
  fireball size                 edge = shock front until it reaches the maximum     glasstone1977 secs 2.110-2.127
                                radius (Eqs. 2.127.1/2), then held there
  fireball brightness           thermal power = slope of Fletcher Eq. 2.112         fletcher1962, glasstone1977 7.85
  heat received (burns)         radiant exposure x delivered fraction (Eq. 2.112)   fletcher1962
  pressure pulse at a receiver  the same pressure histories the injury criteria     sections 1, 2 and 7 models
                                use (first time above 1% of the peak = arrival)
  initial radiation             neutrons: nearly all within 1 s (sec. 8.51);        glasstone1977 secs 8.02, 8.47,
                                gammas: over the first minute (sec. 8.02); the       8.50, 8.51
                                share in the first second depends on yield and
                                distance (65% at 1,000 yd from 20 kt, 5% at
                                2,500 yd from 5 Mt, sec. 8.47) -- NOT modelled
  underwater gas bubble         max radius: Cole's TNT bubble law with the same      cole1948, glasstone1977 secs
                                TNT equivalent as the water shock; growth and        2.67, 2.86, 6.53
                                collapse: Rayleigh's bubble equation (first cycle)
  water waves                   front at sqrt(g d), biggest wave at g T / (4 pi)    glasstone1977 6.120, lemehaute1996
  fallout                       arrives at distance / wind speed, then decays as     glasstone1977 9.97, 9.147
                                t^-1.2 and mixes down 3-4 m/h                       redwing1956

Things we do NOT know well are reported as notes rather than invented.
"""

from __future__ import annotations

import math

import numpy as np

from . import units
from .biology.assess import _water_pulse, assess
from .biology.long_term import assess_long_term
from .effects import air_blast, conditions, fallout, near_surface_shock, thermal, underwater_shock, water_waves
from .scenario import Burst, Environment, Receiver

INITIAL_RADIATION_END_S = 60.0     # glasstone1977 sec. 8.02: "initial" = first minute
FLASH_ONSET_S = 1e-3               # the light arrives at once; eye damage happens before a blink (0.25 s, sec. 12.88). Shown at 1 ms.
NEUTRONS_DELIVERED_S = 1.0         # glasstone1977 sec. 8.51: nearly all neutrons within a second
BRODE_ARRIVAL_VALID_S = (0.62e-3, 26.0)   # brode1987 Eq. 40 range at 1 kt (scales with W^(1/3))


# ---------------------------------------------------------------- helpers
def _log_times(t0: float, t1: float, n: int) -> np.ndarray:
    return np.geomspace(max(t0, 1e-9), max(t1, t0 * 1.0001), n)


def shock_radius_m(yield_kt: float, t_s: float) -> float:
    """Radius of the air shock front (slant distance from the burst) at time t.

    Brode Eq. 40 gives arrival time as a function of radius; it rises steadily
    with radius, so we find the radius by bisection.
    """
    if t_s <= 0:
        return 0.0
    t_ms = t_s * 1000.0
    lo, hi = 1e-7, 1e3   # kft
    while air_blast.brode_arrival_ms(yield_kt, hi) < t_ms:
        hi *= 4.0
    for _ in range(80):
        mid = math.sqrt(lo * hi)
        if air_blast.brode_arrival_ms(yield_kt, mid) < t_ms:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi) * air_blast.M_PER_KFT


def thermal_power(t_s: np.ndarray, yield_kt: float) -> np.ndarray:
    """Relative thermal power (0..1, 1 at the peak): slope of Fletcher's delivered fraction."""
    t = np.asarray(t_s, dtype=float)
    f = np.array([thermal.delivered_fraction(x, yield_kt) for x in t])
    p = np.gradient(f, t)
    p = np.clip(p, 0, None)
    return p / p.max() if p.max() > 0 else p


def _first_above(t: np.ndarray, p: np.ndarray, frac: float = 0.01) -> tuple[float, float, float]:
    """(arrival, time of peak, end of the strong part) of a pressure history."""
    peak = float(np.max(p))
    if peak <= 0:
        return math.nan, math.nan, math.nan
    above = np.nonzero(p >= frac * peak)[0]
    return float(t[above[0]]), float(t[int(np.argmax(p))]), float(t[above[-1]])


def _downsample(t: np.ndarray, p: np.ndarray, t0: float, t1: float, n: int = 160) -> tuple[list, list]:
    span = max(t1 - t0, 1e-9)
    tt = np.linspace(t0 - 0.1 * span, t1 + 0.3 * span, n)
    return tt.tolist(), np.interp(tt, t, p, left=0.0, right=0.0).tolist()


def _clean_float(x: float) -> float | None:
    return float(x) if x is not None and math.isfinite(x) else None


# ---------------------------------------------------------------- scene-wide parts
def _fireball(b: Burst, max_radius_m: float, notes: list[str]) -> dict | None:
    if b.z_m < 0 or max_radius_m <= 0:
        return None
    w = b.yield_kt
    t_fit_end = 0.285 * w**0.5            # end of Fletcher Eq. 2.112's range (~80% delivered)
    t_fade = 2.0 * t_fit_end              # illustrative: last ~20% fades out by twice that time
    t = _log_times(1e-5, t_fade, 140)
    power = thermal_power(t, w)
    after = t > t_fit_end
    if after.any():                      # fit stops at 80%: fade the rest linearly (flagged below)
        p_end = power[~after][-1] if (~after).any() else 0.0
        power[after] = p_end * (t_fade - t[after]) / (t_fade - t_fit_end)
    radius = np.array([min(shock_radius_m(w, x), max_radius_m) for x in t])
    notes.append("Fireball: its edge is drawn at the shock front (Brode) until it reaches its maximum size "
                 "(Glasstone Eq. 2.127); real growth slows after 'breakaway' at about half that size, so the "
                 "middle of the growth is a rough sketch.")
    notes.append("Fireball brightness follows the thermal power from Fletcher's fit, which stops at ~80% of the "
                 "heat; the fade-out after that, the rising cloud and the mushroom are not modelled.")
    delivered = [thermal.delivered_fraction(x, w) for x in t]
    return {"t_s": t, "radius_m": radius, "power": power, "delivered": delivered,
            "max_radius_m": max_radius_m, "t_max_s": thermal.time_of_maximum_s(w),
            "fit_end_s": t_fit_end, "end_s": t_fade}


def _air_blast_front(b: Burst, t_end_s: float, notes: list[str]) -> dict | None:
    if b.z_m < 0:
        return None
    w, h = b.yield_kt, b.z_m
    t = _log_times(1e-5, t_end_s, 160)
    slant = np.array([shock_radius_m(w, x) for x in t])
    ground = np.sqrt(np.clip(slant**2 - h**2, 0, None))
    peak_kpa = np.array([air_blast.peak_overpressure_pa(w, h, g) / 1e3 if g > 0 else math.nan for g in ground])
    m = w ** (1.0 / 3.0)
    lo, hi = (x * m for x in BRODE_ARRIVAL_VALID_S)
    notes.append(f"Blast front from Brode Eq. 40, valid {lo * 1e3:.2g} ms to {hi:.3g} s for this yield; "
                 "later it is extrapolated (it tends to the speed of sound, as it should).")
    # where the blast becomes negligible (< 0.07 psi, the edge of Brode's fits)
    neg = air_blast.BRODE_MIN_PSI * units.PSI_TO_PA / 1e3
    weak = np.nonzero((peak_kpa < neg) & (ground > 0))[0]
    return {"t_s": t, "slant_radius_m": slant, "ground_radius_m": ground, "peak_kpa": peak_kpa,
            "reaches_water_s": air_blast.arrival_time_s(w, h, 0.0), "negligible_kpa": neg,
            "negligible_after_s": float(t[weak[0]]) if len(weak) else None, "valid_s": [lo, hi]}


def _water_shock(b: Burst, env: Environment) -> dict | None:
    """Shock front inside the water: a sphere growing at the speed of sound."""
    if b.z_m >= 0 and not near_surface_shock.in_regime(b):
        return None
    return {"source_z_m": min(b.z_m, 0.0), "speed_m_s": env.sound_speed_m_s}


# Cole (1948) TNT bubble law: R_max = J * (W / (Z + 33))^(1/3), R and Z in ft, W in lb TNT,
# J = 12.6 ft for TNT; Z + 33 ft is the absolute pressure at the burst depth in feet of sea water.
COLE_BUBBLE_J_FT = 12.6
SCALED_DEPTH_VENTS_FT = 35.0   # glasstone1977 sec. 6.53: below ~35 ft/kt^(1/3) the bubble vents on its first expansion


def bubble_max_radius_m(yield_kt: float, depth_m: float) -> float:
    """Largest radius of the gas bubble (Cole's TNT law, nuclear yield -> TNT as for the water shock)."""
    w_lb = underwater_shock.effective_tnt_lb(yield_kt)
    z_ft = depth_m * units.M_TO_FT
    return COLE_BUBBLE_J_FT * (w_lb / (z_ft + 33.0)) ** (1.0 / 3.0) * units.FT_TO_M


def _bubble(b: Burst, env: Environment, notes: list[str]) -> dict | None:
    """Gas bubble of an underwater burst: radius vs time over its first expansion and collapse.

    Rayleigh's equation for an empty cavity in incompressible water (gas pressure neglected),
    written so it reaches the Cole maximum radius: with R = R_max * sin(phi)^(2/3),
    t = R_max * sqrt(rho / P) * sqrt(3/2) * (2/3) * integral_0^phi sin(psi)^(2/3) dpsi,
    which gives the classic time to maximum 0.915 R_max sqrt(rho / P).
    """
    if b.z_m >= 0:
        return None
    depth = -b.z_m
    r_max = bubble_max_radius_m(b.yield_kt, depth)
    p = env.hydrostatic_pressure_pa(depth)
    phi = np.linspace(0.0, math.pi, 400)
    integrand = np.abs(np.sin(phi)) ** (2.0 / 3.0)
    integral = np.concatenate([[0.0], np.cumsum(0.5 * (integrand[1:] + integrand[:-1]) * np.diff(phi))])
    t = r_max * math.sqrt(env.density_kg_m3 / p) * math.sqrt(1.5) * (2.0 / 3.0) * integral
    r = r_max * integrand
    scaled = depth * units.M_TO_FT / b.yield_kt ** (1.0 / 3.0)
    vents = r_max >= depth
    vent_s = None
    if vents:   # the top of the bubble reaches the surface while it is still growing: it vents (sec. 2.67)
        k = int(np.argmax(r >= depth))
        vent_s = float(np.interp(depth, r[: k + 1], t[: k + 1]))
        keep = t <= vent_s
        t, r = np.append(t[keep], vent_s), np.append(r[keep], depth)
    floor = env.water_depth_m if math.isfinite(env.water_depth_m) else None
    notes.append("Gas bubble: largest size from Cole's (1948) TNT bubble law, using the same TNT equivalent as the "
                 "water shock (an assumption: Glasstone gives no bubble size); growth and collapse follow Rayleigh's "
                 "bubble equation, which ignores the gas pressure inside, the bubble rising, and the later "
                 "pulsations (Glasstone secs. 2.86-2.88: two or three more cycles).")
    if vents:
        notes.append(f"The bubble reaches the surface after about {vent_s * 1e3:.0f} ms and vents (Glasstone sec. 2.67; "
                     f"scaled depth {scaled:.0f} ft/kt^1/3, venting expected below about 35, sec. 6.53). For BAKER, "
                     "Glasstone sec. 2.68 says 'a few milliseconds' after the spray dome began (~4 ms).")
    return {"center_z_m": b.z_m, "max_radius_m": r_max, "t_s": t, "radius_m": r, "vents": bool(vents),
            "vent_s": vent_s, "floor_z_m": -floor if floor else None, "scaled_depth_ft": scaled,
            "end_s": float(t[-1])}


def _waves(b: Burst, env: Environment, notes: list[str]) -> dict | None:
    probe = water_waves.compute(b, 1000.0, env)
    if probe.regime.startswith("air burst"):
        return None
    ranges = np.geomspace(100.0, 200_000.0, 50)
    res = [water_waves.compute(b, r, env) for r in ranges]
    c_front = 1000.0 / probe.front_arrival_s
    c_max = 1000.0 / probe.max_wave_arrival_s
    if not math.isfinite(env.water_depth_m):
        notes.append("Deep open ocean: the first-wave speed sqrt(g d) uses the model's 100 km stand-in depth, so "
                     "that ring runs far ahead; the biggest-wave ring (g T / 4 pi) is the meaningful one.")
    return {"regime": probe.regime, "front_speed_m_s": c_front, "max_wave_speed_m_s": c_max,
            "period_s": probe.period_s, "ranges_m": ranges,
            "height_low_m": [r.height_m[0] for r in res], "height_high_m": [r.height_m[1] for r in res]}


def _fallout(b: Burst, wind_mph: float, fission_fraction: float, notes: list[str]) -> dict | None:
    if b.z_m < 0 or not fallout.has_local_fallout(b.yield_kt, b.z_m):
        return None
    speed = wind_mph * fallout.M_PER_MILE / 3600.0
    cs = fallout.contours(b.yield_kt, wind_mph)
    notes.append("Fallout: particles are assumed to travel with the wind and land at distance / wind speed "
                 "(Glasstone's idealized pattern); the cloud itself, rain-out and wind shear are not modelled. "
                 "Wind blows along the cut-away (+x).")
    return {"wind_m_s": speed, "wind_dir_deg": 0.0, "fission_fraction": fission_fraction,
            "contours": [{"r1_rad_h": c.r1_rad_h * fission_fraction, "downwind_m": c.downwind_m,
                          "max_width_m": c.max_width_m, "gz_width_m": c.gz_width_m} for c in cs],
            "decay_exponent": -1.2, "reference_h": 1.0}


# ---------------------------------------------------------------- receivers
def _burn_onset(b: Burst, r: Receiver, level: str, env: Environment | None = None) -> float | None:
    """Time at which the heat received reaches the burn level found by the assessment."""
    if level == "none":
        return None
    s = thermal.at_surface(b.yield_kt, b.z_m, math.hypot(r.x_m, r.y_m))
    if env is not None:   # weather changes how much heat arrives (same factor as the assessment)
        rng = math.hypot(r.x_m, r.y_m)
        s.exposure_cal_cm2 *= conditions.thermal_factor(b.z_m, math.hypot(rng, b.z_m), env.visibility, env.overcast)[1]
    th = thermal.burn_thresholds_cal_cm2(b.yield_kt)
    need = th["second_degree"] if level == "severe" else min(th["first_degree"], th["second_degree"] * thermal.DARK_SKIN_FACTOR)
    frac_needed = need / s.exposure_cal_cm2
    t_end = 0.285 * b.yield_kt**0.5
    t = _log_times(1e-5, t_end, 400)
    f = np.array([thermal.delivered_fraction(x, b.yield_kt) for x in t])
    hit = np.nonzero(f >= frac_needed)[0]
    return float(t[hit[0]]) if len(hit) else t_end   # fit ends at ~80%: the rest arrives after that


def _receiver_timeline(b: Burst, r: Receiver, env: Environment, wind_mph: float, fission_fraction: float,
                       days: float) -> dict:
    out: dict = {"id": r.label, "kind": r.kind, "range_m": math.hypot(r.x_m, r.y_m), "notes": []}
    try:
        res = assess(b, r, env)
    except (ValueError, NotImplementedError) as exc:
        out["error"] = str(exc)
        return out
    rng = out["range_m"]

    # pressure pulse (a ship feels an underwater burst through its hull bottom: use a point just below the keel)
    pulse = None
    if r.kind == "ship" and b.z_m < 0:
        r = Receiver(r.x_m, r.y_m, -5.0, kind="gauge", label=r.label)
    if r.z_m <= 0:
        t, p, _ = _water_pulse(b, r, env)
        t_a, t_pk, t_e = _first_above(t, p)
        if math.isfinite(t_a) and b.z_m >= 0:
            # Nothing can arrive before the blast reaches the water above the receiver (or, for bursts touching
            # the water, before the water shock does). The air-to-water model smooths the pulse symmetrically in
            # time (steady-state theory), which puts a faint, unphysical "precursor" before that moment.
            earliest = air_blast.arrival_time_s(b.yield_kt, b.z_m, rng)
            if near_surface_shock.in_regime(b):
                earliest = min(earliest, near_surface_shock.compute(b, r, env).arrival_time_s)
            if t_a < earliest:
                t_a = earliest
                out["notes"].append("The water-pressure model spreads the pulse a little before its true arrival "
                                    "(a side effect of the method); the arrival shown is when the blast reaches the "
                                    "water above.")
            t_pk, t_e = max(t_pk, t_a), max(t_e, t_a)
        if math.isfinite(t_a):
            tt, pp = _downsample(t, p / 1e3, t_a, t_e)
            pulse = {"arrival_s": t_a, "peak_s": t_pk, "end_s": t_e, "peak_kpa": float(np.max(p)) / 1e3,
                     "t_s": tt, "p_kpa": pp, "medium": "water"}
    elif b.z_m >= 0:
        sb = air_blast.surface_blast(b.yield_kt, b.z_m, rng)
        pulse = {"arrival_s": sb.arrival_time_s, "peak_s": sb.arrival_time_s,
                 "end_s": sb.arrival_time_s + sb.duration_s, "peak_kpa": sb.peak_overpressure_pa / 1e3, "medium": "air"}
        tt = np.linspace(sb.arrival_time_s - 0.1 * sb.duration_s, sb.arrival_time_s + 1.3 * sb.duration_s, 160)
        pulse["t_s"] = tt.tolist()
        pulse["p_kpa"] = (sb.overpressure(tt) / 1e3).tolist()
    out["pulse"] = pulse

    # waves at this distance
    wv = water_waves.compute(b, rng, env)
    if not wv.regime.startswith("air burst"):
        out["waves"] = {"front_arrival_s": wv.front_arrival_s, "max_wave_arrival_s": wv.max_wave_arrival_s,
                        "height_low_m": wv.height_m[0], "height_high_m": wv.height_m[1]}

    # each immediate effect gets the time at which it happens
    effects = []
    for e in res.effects:
        n = e.name
        if "burns" in n:
            onset = _burn_onset(b, r, e.level, env)
        elif "radiation" in n:
            onset = INITIAL_RADIATION_END_S
        elif "flash blindness" in n:
            onset = FLASH_ONSET_S if e.level != "none" else None
        elif "blast" in n or "hearing" in n or n.startswith("ship damage"):
            onset = pulse["arrival_s"] if pulse else None
        else:
            onset = None
        effects.append({"name": e.name, "level": e.level, "value": e.value, "onset_s": onset})
    out["effects"] = effects
    if any("radiation" in e["name"] for e in effects):
        out["notes"].append("Initial radiation is counted as complete at 1 minute (Glasstone sec. 8.02). Neutrons come "
                            "within about a second (sec. 8.51); how much of the gamma dose comes in the first second "
                            "depends on yield and distance (65% near a 20 kt burst, 5% for 5 Mt, sec. 8.47) and is not modelled.")
    if any("burns" in e["name"] for e in effects):
        out["notes"].append("Heat arrives at the speed of light; the burn level is shown from the moment the heat "
                            "received so far (Fletcher Eq. 2.112) passes the burn threshold.")

    # fallout over days
    if b.z_m >= 0 and r.kind in ("fish", "person", "diver"):
        try:
            lt = assess_long_term(b, r, env, wind_mph=wind_mph, fission_fraction=fission_fraction, days=days)
            fa = fallout.fallout_at(b.yield_kt, b.z_m, r.x_m, r.y_m, wind_mph, 0.0, fission_fraction)
            if fa.r1_rad_h[1] > 0:
                idx = np.unique(np.linspace(0, len(lt.times_h) - 1, 120).astype(int))
                out["fallout"] = {
                    "arrival_s": fa.arrival_time_h * 3600.0,
                    "t_s": (lt.times_h[idx] * 3600.0).tolist(),
                    "rate_low_ugy_h": lt.total_ugy_h[0][idx].tolist(), "rate_high_ugy_h": lt.total_ugy_h[1][idx].tolist(),
                    "dose_low_gy": lt.accumulated_gy[0][idx].tolist(), "dose_high_gy": lt.accumulated_gy[1][idx].tolist(),
                    "findings": lt.findings,
                }
                if fa.arrival_time_h < 1.0:
                    out["notes"].append("Fallout lands here within the first hour; the dose-rate formula (t^-1.2) is "
                                        "only used from 1 hour on, so the first hour is not counted.")
        except (ValueError, NotImplementedError) as exc:
            out["notes"].append(f"Fallout not available: {exc}")
    return out


# ---------------------------------------------------------------- everything together
def timeline(b: Burst, env: Environment, receivers: list[Receiver], *, wind_mph: float = 15.0,
             fission_fraction: float = 1.0, days: float = 30.0, max_fireball_radius_m: float = 0.0) -> dict:
    notes: list[str] = []
    t_end = days * 86400.0
    fb = _fireball(b, max_fireball_radius_m, notes)
    blast = _air_blast_front(b, min(t_end, 600.0), notes)
    ws = _water_shock(b, env)
    bub = _bubble(b, env, notes)
    wv = _waves(b, env, notes)
    fo = _fallout(b, wind_mph, fission_fraction, notes)
    recs = [_receiver_timeline(b, r, env, wind_mph, fission_fraction, days) for r in receivers]

    events: list[dict] = [{"t_s": 0.0, "label": "detonation", "kind": "burst"}]
    if fb:
        events.append({"t_s": fb["t_max_s"], "label": "thermal pulse peak", "kind": "thermal"})
    if blast and b.z_m > 0:
        events.append({"t_s": blast["reaches_water_s"], "label": "blast reaches the water", "kind": "blast"})
    if b.z_m >= 0:   # initial radiation is only modelled for bursts above the water
        events.append({"t_s": INITIAL_RADIATION_END_S, "label": "initial radiation over", "kind": "radiation"})
    for r in recs:
        p = r.get("pulse")
        if p:
            events.append({"t_s": p["arrival_s"], "label": f"pressure pulse reaches {r['id']}", "kind": "blast", "receiver": r["id"]})
        w = r.get("waves")
        if w and w["height_high_m"] > 0:
            events.append({"t_s": w["max_wave_arrival_s"], "label": f"biggest wave reaches {r['id']}", "kind": "wave", "receiver": r["id"]})
        f = r.get("fallout")
        if f:
            events.append({"t_s": f["arrival_s"], "label": f"fallout reaches {r['id']}", "kind": "fallout", "receiver": r["id"]})
    if bub and bub["vents"]:
        events.append({"t_s": bub["vent_s"], "label": "gas bubble reaches the surface", "kind": "blast"})
    events.sort(key=lambda e: e["t_s"])
    return {"t_end_s": t_end, "events": events, "fireball": fb, "air_blast": blast, "water_shock": ws, "bubble": bub,
            "waves": wv, "fallout": fo, "receivers": recs, "notes": notes}
