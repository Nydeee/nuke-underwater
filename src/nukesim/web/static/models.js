// Simple low-poly 3D models built from basic shapes (no downloaded model files).
// Every model is about 1 unit long, points along +x, with "up" = +y.
// The returned group carries `.material` = the main body material, so code that
// recolours receivers (app.js, timeline.js) can treat it like a single mesh.

import * as THREE from "three";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: true, ...extra });

function body(geo, mat, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  return m;
}

function eyes(g, x, y, z, r = 0.025) {
  const mat = std(0x111111);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    e.position.set(x, y, s * z);
    g.add(e);
  }
}

function fish(color) {
  const g = new THREE.Group(), mat = std(color);
  g.add(body(new THREE.SphereGeometry(0.5, 14, 10), mat, 0.75, 0.32, 0.17));
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 4), mat);
  tail.rotation.z = Math.PI / 2; tail.position.x = -0.48; tail.scale.set(1, 1, 0.25);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 3), mat);
  fin.position.set(0.02, 0.17, 0); fin.scale.set(1.2, 1, 0.3);
  g.add(tail, fin);
  eyes(g, 0.25, 0.04, 0.07);
  return { g, mat };
}

function whale(color) {
  const g = new THREE.Group(), mat = std(color), belly = std(0xd9dde2);
  g.add(body(new THREE.CapsuleGeometry(0.17, 0.62, 6, 14), mat, 1, 1, 1).rotateZ(Math.PI / 2));
  const b = body(new THREE.SphereGeometry(0.16, 12, 8), belly, 2.6, 0.55, 0.9);
  b.position.set(0.05, -0.08, 0); g.add(b);
  const stock = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), mat);
  stock.rotation.z = Math.PI / 2; stock.position.x = -0.52;
  const flukes = body(new THREE.BoxGeometry(0.12, 0.02, 0.42), mat, 1, 1, 1);
  flukes.position.x = -0.68;
  g.add(stock, flukes);
  for (const s of [-1, 1]) {
    const f = body(new THREE.BoxGeometry(0.2, 0.02, 0.08), mat, 1, 1, 1);
    f.position.set(0.18, -0.1, s * 0.18); f.rotation.y = s * 0.5; g.add(f);
  }
  eyes(g, 0.38, -0.02, 0.15, 0.015);
  return { g, mat };
}

function dolphin(color) {
  const g = new THREE.Group(), mat = std(color);
  g.add(body(new THREE.CapsuleGeometry(0.12, 0.55, 6, 12), mat, 1, 1, 0.9).rotateZ(Math.PI / 2));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), mat);
  beak.rotation.z = -Math.PI / 2; beak.position.x = 0.46;
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), mat);
  dorsal.position.set(-0.02, 0.17, 0); dorsal.rotation.z = 0.5; dorsal.scale.z = 0.25;
  const flukes = body(new THREE.BoxGeometry(0.08, 0.015, 0.3), mat, 1, 1, 1);
  flukes.position.x = -0.46;
  g.add(beak, dorsal, flukes);
  eyes(g, 0.3, 0.03, 0.09, 0.014);
  return { g, mat };
}

function turtle(color) {
  const g = new THREE.Group(), mat = std(color), skin = std(0x8fa36b);
  g.add(body(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, 1, 0.45, 0.85));
  const plate = body(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16), skin, 1, 1, 0.85);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin);
  head.position.set(0.45, 0.04, 0);
  g.add(plate, head);
  for (const [x, z, ry] of [[0.2, 0.36, 0.5], [0.2, -0.36, -0.5], [-0.25, 0.3, -0.4], [-0.25, -0.3, 0.4]]) {
    const f = body(new THREE.BoxGeometry(0.28, 0.025, 0.09), skin, 1, 1, 1);
    f.position.set(x, 0, z); f.rotation.y = ry; g.add(f);
  }
  return { g, mat };
}

function diver(color) {
  const g = new THREE.Group(), mat = std(color), suit = std(0x22262b), tank = std(0xc9ccd1, { metalness: 0.5 });
  const torso = body(new THREE.CapsuleGeometry(0.09, 0.32, 6, 10), suit, 1, 1, 1);
  torso.rotation.z = Math.PI / 2; g.add(torso);
  const vest = body(new THREE.CapsuleGeometry(0.1, 0.2, 4, 10), mat, 1, 1, 1);   // coloured by status
  vest.rotation.z = Math.PI / 2; vest.position.x = 0.04; g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), suit);
  head.position.x = 0.3; g.add(head);
  const mask = body(new THREE.BoxGeometry(0.03, 0.05, 0.1), std(0x7fd3ff, { metalness: 0.3 }), 1, 1, 1);
  mask.position.set(0.37, 0.01, 0); g.add(mask);
  const t = body(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), tank, 1, 1, 1);
  t.rotation.z = Math.PI / 2; t.position.set(0.02, 0.11, 0); g.add(t);
  for (const s of [-1, 1]) {
    const leg = body(new THREE.CapsuleGeometry(0.035, 0.26, 4, 8), suit, 1, 1, 1);
    leg.rotation.z = Math.PI / 2; leg.position.set(-0.3, 0, s * 0.05); g.add(leg);
    const fin = body(new THREE.BoxGeometry(0.18, 0.01, 0.08), std(0xf2c14e), 1, 1, 1);
    fin.position.set(-0.52, 0, s * 0.05); g.add(fin);
  }
  return { g, mat };
}

function boat(color) {
  const g = new THREE.Group(), hullMat = std(0xf2f2ee), mat = std(color);
  // hull: a box narrowed at the bow
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.28, 4, 1, 1), hullMat);
  const pos = hull.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (x > 0.2) pos.setZ(i, pos.getZ(i) * (1 - (x - 0.2) / 0.25));     // pointed bow
    if (y < 0) pos.setZ(i, pos.getZ(i) * 0.7);                          // narrower keel
  }
  hull.geometry.computeVertexNormals();
  g.add(hull);
  const stripe = body(new THREE.BoxGeometry(0.62, 0.03, 0.29), mat, 1, 1, 1);   // coloured by status
  stripe.position.set(-0.08, 0.03, 0); g.add(stripe);
  const cabin = body(new THREE.BoxGeometry(0.26, 0.14, 0.2), std(0xdfe6ec), 1, 1, 1);
  cabin.position.set(-0.08, 0.15, 0); g.add(cabin);
  const glass = body(new THREE.BoxGeometry(0.02, 0.07, 0.18), std(0x2a4c66, { metalness: 0.4 }), 1, 1, 1);
  glass.position.set(0.06, 0.17, 0); g.add(glass);
  const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.08, 4, 8), mat);
  person.position.set(-0.3, 0.15, 0); g.add(person);
  return { g, mat };
}

/** Build a model for a receiver. `r` has kind, preset and mass_kg. */
export function makeModel(r, color) {
  let m;
  if (r.kind === "fish") m = fish(color);
  else if (r.kind === "turtle") m = turtle(color);
  else if (r.kind === "diver") m = diver(color);
  else if (r.kind === "person") m = boat(color);
  else m = (r.preset === "whale" || (r.mass_kg ?? 0) > 1000) ? whale(color) : dolphin(color);
  m.g.material = m.mat;          // lets existing code recolour it like a single mesh
  return m.g;
}

/** Real body length in metres, used by the realistic view (boats: a small motorboat). */
export function realLength(r) {
  if (r.kind === "person") return 8;
  if (r.kind === "diver") return 1.8;
  if (r.kind === "turtle") return 1.0;
  if (r.kind === "fish") return Math.max(0.1, 0.25 * Math.cbrt((r.mass_kg ?? 0.5) / 0.15));
  const m = r.mass_kg ?? 150;
  return Math.max(1.5, 2.3 * Math.cbrt(m / 150));   // dolphin ~2.3 m at 150 kg; whale scaled by mass
}
