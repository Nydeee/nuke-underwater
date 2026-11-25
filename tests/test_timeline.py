"""The timeline (when things happen) agrees with the models it is built from."""

import math

import pytest
from fastapi.testclient import TestClient

from nukesim import timeline as tl
from nukesim.effects import air_blast, fallout, thermal, underwater_shock, water_waves
from nukesim.scenario import Burst, Environment, Receiver
from nukesim.web.server import app

client = TestClient(app)
FISH = {"id": "fish", "kind": "fish", "x_m": 1500, "z_m": -10, "mass_kg": 0.5}
BOAT = {"id": "boat", "kind": "person", "x_m": 2500, "z_m": 2}


def post(burst, receivers=(FISH, BOAT), **extra):
    r = client.post("/api/timeline", json={"burst": burst, "receivers": list(receivers), **extra})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("w", [1.0, 20.0, 1000.0])
@pytest.mark.parametrize("t", [0.01, 0.5, 5.0])
def test_shock_radius_inverts_brode_eq40(w, t):
    r = tl.shock_radius_m(w, t)
    assert air_blast.arrival_time_s(w, 0.0, r) == pytest.approx(t, rel=1e-6)


def test_shock_radius_grows_and_tends_to_sound_speed():
    rs = [tl.shock_radius_m(20, t) for t in (0.01, 0.1, 1, 10, 100)]
    assert all(b > a for a, b in zip(rs, rs[1:]))
    speed = (tl.shock_radius_m(20, 200) - tl.shock_radius_m(20, 100)) / 100
    assert 320 < speed < 380   # far out, the blast front moves at about the speed of sound


def test_events_air_burst():
    j = post({"yield_kt": 20, "z_m": 500})
    ev = {e["label"]: e["t_s"] for e in j["events"]}
    assert ev["detonation"] == 0
    assert ev["thermal pulse peak"] == pytest.approx(thermal.time_of_maximum_s(20))
    assert ev["blast reaches the water"] == pytest.approx(air_blast.arrival_time_s(20, 500, 0))
    assert ev["initial radiation over"] == 60
    assert [e["t_s"] for e in j["events"]] == sorted(e["t_s"] for e in j["events"])
    assert j["fallout"] is None and j["waves"] is None       # too high for local fallout or waves
    fb = j["fireball"]
    assert max(fb["radius_m"]) <= fb["max_radius_m"] + 1e-9
    assert max(fb["power"]) == pytest.approx(1.0)


def test_boat_blast_arrival_matches_brode():
    j = post({"yield_kt": 20, "z_m": 500})
    boat = next(r for r in j["receivers"] if r["id"] == "boat")
    assert boat["pulse"]["arrival_s"] == pytest.approx(air_blast.arrival_time_s(20, 500, 2500))
    blast = next(e for e in boat["effects"] if e["name"].startswith("blast"))
    assert blast["onset_s"] == boat["pulse"]["arrival_s"]
    burns = next(e for e in boat["effects"] if e["name"].startswith("burns"))
    if burns["level"] != "none":   # heat arrives within the thermal pulse
        assert 0 < burns["onset_s"] <= 0.285 * 20**0.5


def test_fish_pulse_comes_after_the_blast_reaches_the_water_above_it():
    j = post({"yield_kt": 20, "z_m": 500})
    fish = next(r for r in j["receivers"] if r["id"] == "fish")
    t_surface = air_blast.arrival_time_s(20, 500, 1500)
    assert t_surface <= fish["pulse"]["arrival_s"] < t_surface + 0.1
    assert fish["pulse"]["peak_s"] >= fish["pulse"]["arrival_s"]


def test_underwater_burst_pulse_at_sound_speed():
    j = post({"yield_kt": 20, "z_m": -30})
    fish = next(r for r in j["receivers"] if r["id"] == "fish")
    slant = math.hypot(1500, 20)
    assert fish["pulse"]["arrival_s"] == pytest.approx(slant / 1500.0, rel=1e-3)
    assert j["water_shock"]["speed_m_s"] == 1500.0
    assert j["fireball"] is None and j["air_blast"] is None
    assert not any(e["kind"] == "radiation" for e in j["events"])   # not modelled underwater


def test_waves_and_fallout_for_surface_burst():
    j = post({"yield_kt": 20, "z_m": 0, "wind_mph": 15})
    fish = next(r for r in j["receivers"] if r["id"] == "fish")
    w = water_waves.compute(Burst(20, 0), 1500, Environment())
    assert fish["waves"]["max_wave_arrival_s"] == pytest.approx(w.max_wave_arrival_s)
    assert j["waves"]["max_wave_speed_m_s"] == pytest.approx(water_waves.G * w.period_s / (4 * math.pi))
    speed = 15 * fallout.M_PER_MILE / 3600
    assert j["fallout"]["wind_m_s"] == pytest.approx(speed)
    assert fish["fallout"]["arrival_s"] == pytest.approx(1500 / speed)
    rates = fish["fallout"]["rate_high_ugy_h"]
    assert rates[-1] < max(rates)                 # it decays
    doses = fish["fallout"]["dose_high_gy"]
    assert all(b >= a for a, b in zip(doses, doses[1:]))   # dose so far only grows
    kinds = {e["kind"] for e in j["events"]}
    assert {"wave", "fallout", "blast"} <= kinds


def test_receiver_errors_are_reported_not_raised():
    j = post({"yield_kt": 20, "z_m": 500}, receivers=[{"id": "bad", "kind": "fish", "x_m": 100, "z_m": 3}])
    assert "must be in the water" in j["receivers"][0]["error"]


def test_burst_below_sea_floor_rejected():
    r = client.post("/api/timeline", json={"burst": {"yield_kt": 20, "z_m": -300}, "env": {"water_depth_m": 100}})
    assert r.status_code == 422


def test_timeline_effect_levels_match_assess():
    from nukesim.biology.assess import assess
    j = post({"yield_kt": 1000, "z_m": 10})
    fish = next(r for r in j["receivers"] if r["id"] == "fish")
    direct = assess(Burst(1000, 10), Receiver(1500, 0, -10, "fish", mass_kg=0.5))
    assert [(e["name"], e["level"]) for e in fish["effects"]] == [(e.name, e.level) for e in direct.effects]
    assert underwater_shock  # imported model used by the near-surface/underwater paths


def test_bubble_reaches_cole_maximum_at_rayleigh_time():
    b, env = Burst(yield_kt=100, z_m=-300), Environment()
    bub = tl._bubble(b, env, [])
    assert not bub["vents"]
    assert max(bub["radius_m"]) == pytest.approx(tl.bubble_max_radius_m(100, 300), rel=1e-4)
    t_peak = bub["t_s"][int(max(range(len(bub["radius_m"])), key=lambda i: bub["radius_m"][i]))]
    p = env.hydrostatic_pressure_pa(300)
    assert t_peak == pytest.approx(0.915 * bub["max_radius_m"] * math.sqrt(env.density_kg_m3 / p), rel=0.01)


def test_shallow_bubble_vents_and_air_burst_has_none():
    j = post({"yield_kt": 23, "z_m": -27}, env={"water_depth_m": 55})
    bub = j["bubble"]
    assert bub["vents"] and 0.001 < bub["vent_s"] < 0.1
    assert bub["radius_m"][-1] == pytest.approx(27)
    assert any(e["label"] == "gas bubble reaches the surface" for e in j["events"])
    assert post({"yield_kt": 15, "z_m": 580})["bubble"] is None
