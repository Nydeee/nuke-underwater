"""The local web server returns the same results as calling the simulator directly."""

import math

import pytest
from fastapi.testclient import TestClient

from nukesim.biology.assess import assess
from nukesim.effects import water_waves
from nukesim.scenario import Burst, Environment, Receiver
from nukesim.web.server import app, fireball_radius_m

client = TestClient(app)


def test_index_and_vendor_files_are_served():
    assert client.get("/").status_code == 200
    assert "importmap" in client.get("/").text
    assert client.get("/vendor/three/three.module.min.js").status_code == 200
    assert client.get("/app.js").status_code == 200


def test_info():
    j = client.post("/api/info", json={"burst": {"yield_kt": 20, "z_m": 500}}).json()
    assert j["regime"] == "air burst"
    assert j["local_fallout"] is False
    assert j["fireball_radius_m"] == pytest.approx(fireball_radius_m(20, 500))
    j2 = client.post("/api/info", json={"burst": {"yield_kt": 1000, "z_m": 0}}).json()
    assert j2["regime"].startswith("near-surface")
    assert j2["coupling"] == pytest.approx(0.018, rel=0.01)


def test_fireball_radius_glasstone():
    # glasstone1977 Eq. 2.127.1: breakaway 100 W^0.4 ft; maximum about twice that
    assert fireball_radius_m(1000, 2000) == pytest.approx(2 * 100 * 1000**0.4 * 0.3048)


def test_assess_matches_direct_call():
    body = {"burst": {"yield_kt": 20, "z_m": 500},
            "receivers": [{"id": "d", "kind": "diver", "x_m": 1000, "z_m": -10}]}
    j = client.post("/api/assess", json=body).json()["receivers"][0]
    direct = assess(Burst(20, 500), Receiver(1000, 0, -10, "diver"))
    assert j["worst"] == direct.worst
    assert [e["name"] for e in j["effects"]] == [e.name for e in direct.effects]


def test_assess_reports_errors_per_receiver():
    body = {"burst": {"yield_kt": 20, "z_m": 500},
            "receivers": [{"id": "bad", "kind": "fish", "x_m": 100, "z_m": 3},
                          {"id": "ok", "kind": "person", "x_m": 2000, "z_m": 2}]}
    out = {r["id"]: r for r in client.post("/api/assess", json=body).json()["receivers"]}
    assert "must be in the water" in out["bad"]["error"]
    assert out["ok"]["worst"] in ("none", "possible", "likely", "severe", "lethal")


def test_bad_input_is_rejected():
    r = client.post("/api/assess", json={"burst": {"yield_kt": -5, "z_m": 0}, "receivers": []})
    assert r.status_code == 422


def test_field_shapes_and_sea_floor():
    body = {"burst": {"yield_kt": 20, "z_m": -27}, "env": {"water_depth_m": 60}, "kind": "pressure",
            "max_range_m": 2000, "max_depth_m": 100, "nr": 8, "nd": 6}
    j = client.post("/api/field", json=body).json()
    assert len(j["values"]) == 6 and len(j["values"][0]) == 8
    deep_rows = [row for row, d in zip(j["values"], j["depths_m"]) if d >= 60]
    assert deep_rows and all(v is None for row in deep_rows for v in row)


def test_waves_match_module():
    j = client.post("/api/waves", json={"burst": {"yield_kt": 1000, "z_m": -30}, "env": {"water_depth_m": 4000},
                                        "max_range_m": 50000}).json()
    direct = water_waves.compute(Burst(1000, -30), j["ranges_m"][-1], Environment(water_depth_m=4000))
    assert j["high_m"][-1] == pytest.approx(direct.height_m[1])


def test_fallout_series():
    body = {"burst": {"yield_kt": 1000, "z_m": 0},
            "receiver": {"id": "f", "kind": "fish", "x_m": 50000, "z_m": -10, "mass_kg": 1}, "days": 10}
    j = client.post("/api/fallout", json=body).json()
    assert len(j["times_h"]) == len(j["total_high_ugy_h"]) > 10
    assert max(j["total_high_ugy_h"]) > 0


def test_assess_with_uncertainty():
    body = {"burst": {"yield_kt": 20, "z_m": 500}, "uncertainty": True, "n_samples": 50,
            "receivers": [{"id": "p", "kind": "person", "x_m": 1000, "z_m": 2}]}
    u = client.post("/api/assess", json=body).json()["receivers"][0]["uncertain"]
    assert u["n"] == 50
    assert sum(u["level_probs"].values()) == pytest.approx(1.0)
    assert all(e["p05"] <= e["p50"] <= e["p95"] for e in u["effects"])


def test_uncertainty_list():
    items = client.get("/api/uncertainties").json()
    assert {"brode_peak", "initial_radiation", "cf_fish"} <= {i["name"] for i in items}
    assert {i["basis"] for i in items} == {"sourced", "judgement"}
