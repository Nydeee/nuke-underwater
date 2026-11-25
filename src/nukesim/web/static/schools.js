// Schools of fish in the realistic view: hundreds of small fish swimming in shoals at different
// distances. Each fish is hit when the pressure pulse reaches its distance (air-blast front or
// shock in the water, from the timeline), and what happens to it comes from the danger
// distances of the injury models (biology/zones.py: "fish with a swim bladder"): beyond the
// "possible" distance it carries on; inside it is stunned (tilts), badly hurt (rolls over) or
// killed (belly up, drifting up slowly: illustrative).

import * as THREE from "three";

const LV = ["none", "possible", "likely", "severe", "lethal"];

function fishGeometry() {
  const g = new THREE.SphereGeometry(0.5, 10, 6);
  g.scale(1, 0.32, 0.16);
  const tail = new THREE.ConeGeometry(0.16, 0.28, 4);
  tail.rotateZ(Math.PI / 2); tail.translate(-0.55, 0, 0); tail.scale(1, 1, 0.25);
  // merge the tail into the body (both are plain triangle lists after toNonIndexed)
  const a = g.toNonIndexed(), b = tail.toNonIndexed();
  const pos = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
  pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, a.attributes.position.array.length);
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  m.computeVertexNormals();
  return m;
}

export function createSchools(scene) {
  const PER = 140, N_SCHOOLS = 7, N = PER * N_SCHOOLS;
  const mesh = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshStandardMaterial({ color: 0xb8c6d2, roughness: 0.35, metalness: 0.4 }), N);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  const rnd = new Float32Array(N * 4).map(() => Math.random());
  let layout = null;     // [{ x, z, depth, arrive, level }] per school
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();

  /** Place the schools: distances spread around the fish danger distances (or a default scale). */
  function plan(zones, data, bz, yieldKt) {
    const fz = zones?.find((z) => z.key === "fish_bladder")?.farthest_m;
    // spread from well inside the "killed" distance to beyond the "possible" one
    const scale = fz?.lethal || fz?.severe || fz?.likely || (fz?.possible ? fz.possible / 3 : 1500 * Math.cbrt(Math.max(yieldKt, 0.01) / 15));
    const fr = [0.35, 0.7, 0.95, 1.25, 1.8, 3, 5];
    layout = fr.map((f, i) => {
      const r = scale * f, az = 0.35 + i * 0.83, depth = 6 + 10 * ((i * 37) % 7) / 7;
      let level = 0;
      if (fz) for (let k = 4; k >= 1; k--) if (fz[LV[k]] && r <= fz[LV[k]]) { level = k; break; }
      return { x: Math.cos(az) * r, z: Math.sin(az) * r, depth, r, level, arrive: arrival(data, r, depth, bz) };
    });
  }
  function arrival(data, r, depth, bz) {
    const ab = data?.air_blast;
    if (ab && bz >= 0 && ab.ground_radius_m?.length) {
      const g = ab.ground_radius_m, t = ab.t_s;
      for (let i = 1; i < g.length; i++) if (g[i] >= r) return t[i - 1] + (t[i] - t[i - 1]) * (r - g[i - 1]) / ((g[i] - g[i - 1]) || 1);
      return Infinity;
    }
    const ws = data?.water_shock;
    if (ws) return Math.hypot(r, -depth - (ws.source_z_m ?? bz)) / ws.speed_m_s;
    return Infinity;
  }

  function update(t, now, on) {
    mesh.visible = !!(on && layout);
    if (!mesh.visible) return;
    let k = 0;
    for (const [si, sc] of layout.entries()) {
      const hit = t >= sc.arrive, dt = t - sc.arrive;
      for (let j = 0; j < PER; j++, k++) {
        const a = rnd[k * 4], b = rnd[k * 4 + 1], c = rnd[k * 4 + 2], d = rnd[k * 4 + 3];
        // a loose ball of fish circling slowly
        const R = 14 * Math.cbrt(a), th = b * Math.PI * 2 + (hit && sc.level >= 2 ? 0 : now * 0.00025 * (0.8 + 0.4 * c)), ph = (c - 0.5) * 1.2;
        p.set(sc.x + Math.cos(th) * R, -sc.depth + Math.sin(ph) * R * 0.35, sc.z + Math.sin(th) * R);
        let yaw = -th - Math.PI / 2, roll = 0, pitch = 0;
        if (hit && sc.level >= 1) {
          const f = Math.min(1, dt / 2), lv = sc.level;
          if (lv === 1) roll = 0.6 * f * (d > 0.5 ? 1 : -1);                    // stunned: tipped over
          else if (lv <= 3) roll = (1.4 + 0.8 * d) * f;                          // badly hurt: on its side
          else roll = Math.PI * f;                                               // killed: belly up
          if (lv >= 4) p.y += Math.min(sc.depth - 0.3, Math.max(0, dt - 5) * 0.02 * (0.5 + d));   // dead fish drift up (illustrative)
          if (dt < 1) p.x += (sc.x / sc.r) * (1 - dt) * 0.8 * lv, p.z += (sc.z / sc.r) * (1 - dt) * 0.8 * lv;   // a shove outwards
        }
        e.set(roll, yaw, pitch, "YXZ"); q.setFromEuler(e);
        s.setScalar(0.25 + 0.15 * d);
        m4.compose(p, q, s);
        mesh.setMatrixAt(k, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  /** Where a school is (for the camera): the one nearest the edge of the "killed" zone by default. */
  function spot(i = 2) { const s = layout?.[i]; return s ? { x: s.x, y: -s.depth, z: s.z, r: s.r } : null; }
  return { plan, update, mesh, spot };
}
