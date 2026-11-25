// Real places drawn around the burst. Bikini Atoll, where the 1946 Crossroads tests (ABLE, BAKER)
// took place.
//
// Sources:
//   * Rim outline: sampled from OpenStreetMap relation 3973841 "Bikini Atoll" (natural=reef),
//     © OpenStreetMap contributors, ODbL. One point per 15° sector, clockwise from north.
//   * Island centres: OpenStreetMap (ODbL).
//   * Size, depth and reef width: USGS Professional Paper 260-A (Emery, Tracey & Ladd 1954), p. 23:
//     about 26 x 15 mi, lagoon up to 32 fathoms (192 ft), average 25 fathoms (150 ft); reef about 1/2 mi
//     wide on average; Enyu Channel (south-east) about 9 mi wide.
//   * BAKER position: 11.59 N, 165.52 E (Wikipedia, "Operation Crossroads"; coarse, about +/-1 km).
// The physics uses ONE water depth everywhere (here the 55 m at the BAKER site); the reef, the
// islands and the deep ocean outside the atoll are only drawn.

import * as THREE from "three";

export const BIKINI = {
  origin: [11.59, 165.52],   // BAKER surface zero
  rim: [
    [11.7155, 165.4035], [11.7148, 165.4204], [11.6946, 165.4336], [11.6543, 165.4903], [11.6351, 165.5567],
    [11.6269, 165.5618], [11.5310, 165.5743], [11.5254, 165.5754], [11.4980, 165.5177], [11.5066, 165.4469],
    [11.5069, 165.4131], [11.4991, 165.3791], [11.4926, 165.3438], [11.5182, 165.3020], [11.5291, 165.2744],
    [11.5513, 165.2461], [11.5835, 165.2053], [11.6091, 165.1928], [11.6297, 165.2000], [11.6657, 165.2262],
    [11.7080, 165.2659], [11.7131, 165.2935], [11.6920, 165.3395],
  ],
  gap: [7, 8],   // segments 8->9 and 9->10 (Enyu Channel): no reef drawn
  islands: [
    ["Bikini", 11.6243, 165.5505, 2600], ["Enyu", 11.5265, 165.5673, 2200], ["Bokonfuaaku", 11.6032, 165.5510, 700],
    ["Aomoen", 11.6910, 165.4283, 900], ["Namu", 11.7030, 165.2903, 1300], ["Enirik", 11.4988, 165.3426, 900],
  ],
  depth_m: 55,               // BAKER: 180 ft of water (Wikipedia); lagoon average 150 ft (USGS)
};

/** Latitude/longitude -> local metres (x east, z south) around the origin. */
export function toLocal([lat, lon], [lat0, lon0] = BIKINI.origin) {
  const x = (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180);
  const z = -(lat - lat0) * 110574;
  return new THREE.Vector2(x, z);
}

export function buildBikini() {
  const g = new THREE.Group();
  const pts = BIKINI.rim.map((p) => toLocal(p));
  // lagoon: lighter, greener water inside the rim
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
  const lagoon = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0x2bb5b0, transparent: true, opacity: 0.22, depthWrite: false, fog: true }));
  lagoon.rotation.x = -Math.PI / 2; lagoon.position.y = 0.4;
  g.add(lagoon);
  // reef: a band about 800 m wide along the rim, awash (pale turquoise and sand)
  const reefMat = new THREE.MeshStandardMaterial({ color: 0xbfe3d6, roughness: 0.9, transparent: true, opacity: 0.85 });
  const W = 400;
  for (let i = 0; i < pts.length; i++) {
    if (BIKINI.gap.includes(i)) continue;
    const a = pts[i], b = pts[(i + 1) % pts.length], d = b.clone().sub(a), len = d.length();
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len + W, 1.2, 2 * W), reefMat);
    seg.position.set((a.x + b.x) / 2, 0.3, (a.y + b.y) / 2);
    seg.rotation.y = -Math.atan2(d.y, d.x);
    g.add(seg);
  }
  // islands: low sandy islets with trees on top, lying along the rim
  const sand = new THREE.MeshStandardMaterial({ color: 0xe8dcb8, roughness: 0.95 }), green = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9 });
  for (const [name, lat, lon, len] of BIKINI.islands) {
    const c = toLocal([lat, lon]);
    // turn it along the nearest stretch of rim
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const dd = p.distanceTo(c); if (dd < bd) { bd = dd; best = i; } });
    const t = pts[(best + 1) % pts.length].clone().sub(pts[best]);
    const isl = new THREE.Group();
    const base = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), sand);
    base.scale.set(len / 2, 6, len / 7);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), green);
    top.scale.set(len / 2.3, 14, len / 9); top.position.y = 2;
    isl.add(base, top);
    isl.position.set(c.x, 0, c.y);
    isl.rotation.y = -Math.atan2(t.y, t.x);
    isl.userData.name = name;
    g.add(isl);
  }
  return g;
}
