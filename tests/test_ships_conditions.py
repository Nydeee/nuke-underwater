"""Ships (TM 23-200), weather (EM-1 haze, Glasstone cloud factors) and flash blindness (Glasstone Fig. 12.88)."""

import math

import pytest
from fastapi.testclient import TestClient

from nukesim.biology.assess import assess
from nukesim.effects import air_blast, conditions, ships
from nukesim.scenario import Burst, Environment, Receiver
from nukesim.timeline import timeline
from nukesim.web.server import app

PSI = 6894.757
client = TestClient(app)


# ---------------------------------------------------------------- ships
@pytest.mark.parametrize("ship,psi,level", [
    ("destroyer", 4.9, "none"), ("destroyer", 5.0, "possible"), ("destroyer", 15.0, "likely"), ("destroyer", 25.0, "severe"),
    ("carrier", 25.0, "likely"), ("carrier", 30.0, "severe"), ("small_craft", 25.0, "severe"),
])
def test_air_blast_damage_follows_table_8_1(ship, psi, level):
    assert ships.air_blast_damage(ship, psi * PSI)[0] == level


def test_underwater_ranges_read_from_the_curves_and_cube_root_scaling():
    r = ships.underwater_damage_ranges_m("carrier", 1.0, 100 * 0.3048)
    assert r["severe"] == pytest.approx(204 * 0.9144, rel=1e-6)
    assert r["light"] == pytest.approx(477 * 0.9144, rel=1e-6)
    # 8 kt at twice the depth: same scaled depth, ranges twice as large
    r8 = ships.underwater_damage_ranges_m("carrier", 8.0, 200 * 0.3048)
    assert r8["severe"] == pytest.approx(2 * r["severe"], rel=1e-6)
    # TM 23-200 worked example: 30 kt at 2,000 ft, severe damage to a carrier ~1,000 yd
    ex = ships.underwater_damage_ranges_m("carrier", 30.0, 2000 * 0.3048)
    assert ex["severe"] / 0.9144 == pytest.approx(1000, rel=0.05)


def test_ship_assessment_has_hull_and_crew_effects():
    a = assess(Burst(20, 500), Receiver(1500, 0, 2, kind="ship", ship_type="destroyer"))
    names = [e.name for e in a.effects]
    assert "ship damage (air blast)" in names
    assert "crew on deck: burns (bare skin facing the fireball)" in names
    assert "crew below deck: radiation sickness (initial radiation)" in names
    assert not any(n.startswith("crew below deck: burns") for n in names)   # the hull blocks the heat
    deck = next(e for e in a.effects if e.name == "crew on deck: radiation sickness (initial radiation)").quantity
    below = next(e for e in a.effects if e.name == "crew below deck: radiation sickness (initial radiation)").quantity
    assert below < deck
    p = air_blast.surface_blast(20, 500, 1500).peak_overpressure_pa
    assert next(e for e in a.effects if e.name == "ship damage (air blast)").level == ships.air_blast_damage("destroyer", p)[0]


def test_ship_underwater_burst_uses_the_depth_curves():
    a = assess(Burst(23, -27), Receiver(300, 0, 2, kind="ship", ship_type="carrier"), Environment(water_depth_m=55))
    e = next(e for e in a.effects if e.name == "ship damage (underwater shock)")
    assert e.level == "severe"
    far = assess(Burst(23, -27), Receiver(5000, 0, 2, kind="ship", ship_type="carrier"), Environment(water_depth_m=55))
    assert next(e for e in far.effects if e.name == "ship damage (underwater shock)").level == "none"


def test_ship_timeline_gets_onsets():
    tl = timeline(Burst(23, -27), Environment(water_depth_m=55), [Receiver(600, 0, 2, kind="ship", ship_type="destroyer", label="s")])
    eff = next(e for e in tl["receivers"][0]["effects"] if e["name"] == "ship damage (underwater shock)")
    assert eff["onset_s"] == pytest.approx(600 / 1500, rel=0.3)   # the water shock reaches the hull


# ---------------------------------------------------------------- weather
def test_default_weather_leaves_burns_unchanged():
    lo, hi, notes = conditions.thermal_factor(500, 2000)
    assert (lo, hi, notes) == (1.0, 1.0, [])


def test_haze_and_cloud_change_the_heat():
    clear = conditions.transmittance(5000, 50)
    assert conditions.transmittance(5000, 4) < clear
    lo, hi, _ = conditions.thermal_factor(500, 5000, "medium_haze")
    assert lo == hi < 1
    lo, hi, _ = conditions.thermal_factor(500, 5000, overcast=True)      # cloud above the burst
    assert lo == hi == pytest.approx(1.5)
    lo, hi, _ = conditions.thermal_factor(3000, 5000, overcast=True)     # cloud between burst and sea
    assert (lo, hi) == pytest.approx((0.1, 0.3))


def test_haze_lowers_burns_in_the_assessment():
    r = Receiver(3000, 0, 2, kind="person")
    clear = next(e for e in assess(Burst(20, 500), r).effects if e.name.startswith("burns")).quantity
    hazy = next(e for e in assess(Burst(20, 500), r, Environment(visibility="thin_fog")).effects if e.name.startswith("burns")).quantity
    assert hazy < 0.5 * clear


# ---------------------------------------------------------------- flash blindness
def test_flash_blindness_only_for_the_heights_in_the_figure():
    assert conditions.flash_safe_distances_m(20, 500, night=True) is None
    fb, rb = conditions.flash_safe_distances_m(10, 10_000 * 0.3048, night=True)
    assert fb / 1609.344 == pytest.approx(60) and rb / 1609.344 == pytest.approx(31)
    day = conditions.flash_safe_distances_m(10, 10_000 * 0.3048, night=False)
    assert day[0] < fb                                    # night reaches much farther


def test_flash_blindness_effect_at_night():
    b, r = Burst(100, 4000), Receiver(40_000, 0, 2, kind="person")
    night = next(e for e in assess(b, r, Environment(night=True)).effects if e.name.startswith("flash"))
    day = next(e for e in assess(b, r, Environment(night=False)).effects if e.name.startswith("flash"))
    assert night.level == "severe" and day.level == "none"


def test_api_accepts_ships_and_weather():
    j = client.post("/api/assess", json={"burst": {"yield_kt": 20, "z_m": 500},
                                         "env": {"visibility": "light_haze", "overcast": True, "night": True},
                                         "receivers": [{"id": "s", "kind": "ship", "ship_type": "carrier", "x_m": 2000, "z_m": 2}]}).json()
    names = [e["name"] for e in j["receivers"][0]["effects"]]
    assert "ship damage (air blast)" in names
    assert j["receivers"][0]["effects"][0]["level"] in ("none", "possible", "likely", "severe", "lethal")
