// 3D models of the animals, divers and boats, built from code (no downloaded model files).
//
// Every model is about 1 unit long, points along +x (head at +x), with "up" = +y.
// The returned group carries:
//   .material          a "status" material (a ring around the model in the technical view);
//                      code that recolours receivers by injury level (app.js, timeline.js) uses it
//   .userData.bodyMats the materials of the body (used to show burns)
//   .userData.anatomy  where the injured organs are, in the model's own coordinates
//   .userData.ring     the status ring (hidden in the realistic view)

import * as THREE from "three";
import { speciesOf, ALIASES } from "./species.js";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });
const C = (h) => new THREE.Color(h);
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- body generator
// A smooth body of revolution, squashed into an ellipse, with a species-specific outline
// (profile) and colour pattern painted on the vertices.
//   profile(u): body half-height as a fraction of the maximum, u = 0 at the tail, 1 at the nose
//   paint(u, yN, zN, c): change colour c (yN, zN = -1..1 around the body)
function body({ h = 0.25, w = 0.16, profile, back, belly, paint, line = 0.5, soft = 0.12, rough = 0.45 }) {
  const g = new THREE.SphereGeometry(0.5, 48, 24);
  g.rotateZ(-Math.PI / 2);                       // poles along x: tail at -0.5, nose at +0.5
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const cBack = C(back), cBelly = C(belly), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r0 = Math.sqrt(Math.max(0.25 - x * x, 1e-6));
    const u = x + 0.5, p = Math.max(profile(u), 0.004);
    const yN = y / r0, zN = z / r0;
    pos.setY(i, yN * p * h / 2);
    pos.setZ(i, zN * p * w / 2);
    c.copy(cBelly).lerp(cBack, smooth(line - soft, line + soft, (yN + 1) / 2));   // dark back, pale belly
    if (paint) paint(u, yN, zN, c);
    col.set([c.r, c.g, c.b], 3 * i);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, std(0xffffff, { vertexColors: true, roughness: rough, metalness: 0.12 }));
}
// common outlines
const teardrop = (k = 0.75, e = 0.85, stem = 0.06) => (u) => Math.max(Math.pow(Math.sin(Math.PI * Math.pow(u, k)), e), u < 0.12 ? stem + u : 0);
const torpedo = (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.7) * (u < 0.1 ? 0.35 + 6 * u : 1);

// a flat fin from an outline [[x, y], ...]; vertical by default, horizontal with flat = true
function fin(pts, color, { x = 0, y = 0, z = 0, flat = false, rz = 0, ry = 0, rx = 0, opacity = 1 } = {}) {
  const s = new THREE.Shape();
  pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), std(color, { side: THREE.DoubleSide, transparent: opacity < 1, opacity, roughness: 0.6 }));
  if (flat) m.rotation.x = -Math.PI / 2;
  m.rotation.z += rz; m.rotation.y += ry; m.rotation.x += rx;
  m.position.set(x, y, z);
  return m;
}
const TAILS = {
  forked:  [[0, 0], [-0.12, 0.13], [-0.16, 0.14], [-0.08, 0.02], [-0.08, -0.02], [-0.16, -0.14], [-0.12, -0.13]],
  lunate:  [[0, 0], [-0.08, 0.1], [-0.2, 0.2], [-0.12, 0.05], [-0.1, 0], [-0.12, -0.05], [-0.2, -0.2], [-0.08, -0.1]],
  square:  [[0, 0.03], [-0.1, 0.1], [-0.13, 0.09], [-0.12, 0], [-0.13, -0.09], [-0.1, -0.1], [0, -0.03]],
  rounded: [[0, 0.04], [-0.06, 0.1], [-0.12, 0.08], [-0.15, 0], [-0.12, -0.08], [-0.06, -0.1], [0, -0.04]],
  shark:   [[0.02, 0.02], [-0.1, 0.2], [-0.16, 0.24], [-0.1, 0.06], [-0.08, -0.02], [-0.12, -0.11], [-0.06, -0.07], [0, -0.02]],
  slight:  [[0, 0], [-0.1, 0.11], [-0.13, 0.11], [-0.1, 0.01], [-0.1, -0.01], [-0.13, -0.11], [-0.1, -0.11]],
};
const FLUKES = [[0.02, 0], [-0.06, 0.12], [-0.14, 0.2], [-0.13, 0.12], [-0.08, 0.02], [-0.08, -0.02], [-0.13, -0.12], [-0.14, -0.2], [-0.06, -0.12]];
function eyes(g, x, y, z, r = 0.018, iris = 0x111111) {
  const mat = std(iris, { roughness: 0.15, metalness: 0.3 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    e.position.set(x, y, s * z); g.add(e);
  }
}

// ---------------------------------------------------------------- fish
function fishModel(key) {
  const g = new THREE.Group();
  const add = (...m) => m.forEach((o) => g.add(o));
  let b, h, w, anat;
  if (key === "sardine") {
    h = 0.2; w = 0.12;
    b = body({ h, w, profile: teardrop(0.8, 0.8), back: 0x2a5f7e, belly: 0xe3ebf0, line: 0.62,
      paint: (u, y, z, c) => { if (Math.abs(y - 0.25) < 0.12 && u > 0.5 && u < 0.85 && hash(Math.floor(u * 14), 1) > 0.45 && Math.abs(Math.sin(u * 44)) > 0.6) c.multiplyScalar(0.35); } });
    add(fin(TAILS.forked, 0x5f7f92, { x: -0.48 }), fin([[0, 0], [0.04, 0.09], [0.12, 0]], 0x5f7f92, { x: 0.0, y: 0.08 }));
  } else if (key === "mackerel") {
    h = 0.2; w = 0.14;
    b = body({ h, w, profile: teardrop(0.75, 0.75), back: 0x1d6a5c, belly: 0xe8eef0, line: 0.55, soft: 0.06,
      paint: (u, y, z, c) => { if (y > 0.1 && Math.sin(u * 46 + Math.sin(y * 5) * 2.2) > 0.35) c.multiplyScalar(0.18); } });
    add(fin(TAILS.forked, 0x3f6f6a, { x: -0.48 }), fin([[0, 0], [0.03, 0.08], [0.1, 0]], 0x3f6f6a, { x: 0.06, y: 0.08 }),
      fin([[0, 0], [0.02, 0.05], [0.07, 0]], 0x3f6f6a, { x: -0.12, y: 0.07 }));
    for (let i = 0; i < 4; i++) add(fin([[0, 0], [0.01, 0.025], [0.025, 0]], 0x3f6f6a, { x: -0.36 + i * 0.035, y: 0.045 - i * 0.002 }));
  } else if (key === "cod") {
    h = 0.24; w = 0.18;
    b = body({ h, w, profile: teardrop(0.7, 0.8, 0.08), back: 0x7b6b42, belly: 0xece6d2, line: 0.45, soft: 0.2,
      paint: (u, y, z, c) => {
        if (Math.abs(y - 0.18) < 0.05 && u > 0.1 && u < 0.85) c.lerp(C(0xf2ecd8), 0.7);              // pale lateral line
        else if (y > 0 && hash(Math.floor(u * 30), Math.floor(y * 8 + z * 8)) > 0.7) c.multiplyScalar(0.7);   // mottling
      } });
    add(fin(TAILS.square, 0x6d5f3d, { x: -0.47 }));
    for (const [x0, l] of [[0.14, 0.12], [-0.02, 0.13], [-0.2, 0.12]]) add(fin([[0, 0], [0.02, 0.07], [l - 0.02, 0.06], [l, 0]], 0x6d5f3d, { x: x0 - l / 2, y: 0.095 }));
    for (const [x0, l] of [[-0.02, 0.13], [-0.2, 0.12]]) add(fin([[0, 0], [0.02, -0.05], [l - 0.02, -0.045], [l, 0]], 0xb8ab84, { x: x0 - l / 2, y: -0.09 }));
    const barbel = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.05, 5), std(0xcfc4a4));
    barbel.position.set(0.46, -0.07, 0); g.add(barbel);
  } else if (key === "salmon") {
    h = 0.24; w = 0.14;
    b = body({ h, w, profile: teardrop(0.78, 0.8), back: 0x3e5f7c, belly: 0xeef1f3, line: 0.6,
      paint: (u, y, z, c) => { if (y > 0.15 && hash(Math.floor(u * 40), Math.floor(y * 12 + z * 12)) > 0.86) c.multiplyScalar(0.15); } });
    add(fin(TAILS.slight, 0x4d6273, { x: -0.48 }), fin([[0, 0], [0.04, 0.1], [0.12, 0]], 0x4d6273, { x: 0.0, y: 0.1 }),
      fin([[0, 0], [0.02, 0.035], [0.05, 0]], 0x4d6273, { x: -0.3, y: 0.07 }));   // adipose fin
  } else if (key === "tuna") {
    h = 0.27; w = 0.22;
    b = body({ h, w, profile: torpedo, back: 0x112a52, belly: 0xdde2e8, line: 0.55, soft: 0.08, rough: 0.3,
      paint: (u, y, z, c) => { if (Math.abs(y - 0.25) < 0.06 && u > 0.25 && u < 0.8) c.lerp(C(0x7fa6c9), 0.5); } });
    add(fin(TAILS.lunate, 0x1d3150, { x: -0.48 }), fin([[0, 0], [0.04, 0.16], [0.07, 0.14], [0.12, 0]], 0x1d3150, { x: 0.02, y: 0.11 }),
      fin([[0, 0], [0.05, 0.12], [0.1, 0]], 0xc8a43a, { x: -0.15, y: 0.1 }), fin([[0, 0], [0.05, -0.12], [0.1, 0]], 0xc8a43a, { x: -0.15, y: -0.1 }));
    for (let i = 0; i < 6; i++) for (const s of [1, -1]) add(fin([[0, 0], [0.008, 0.03 * s], [0.02, 0]], 0xe8c547, { x: -0.38 + i * 0.03, y: s * (0.05 - i * 0.004) }));
    add(fin([[0, 0], [-0.24, -0.03], [-0.25, -0.05], [0, -0.03]], 0x1d3150, { x: 0.25, y: -0.01, z: 0.11, ry: 0.25 }));
  } else if (key === "grouper") {
    h = 0.32; w = 0.2;
    b = body({ h, w, profile: teardrop(0.6, 0.7, 0.1), back: 0x6e5b3c, belly: 0xb9a57c, line: 0.4, soft: 0.25,
      paint: (u, y, z, c) => { if (hash(Math.floor(u * 12 + y * 3), Math.floor(y * 4 + z * 4)) > 0.62) c.multiplyScalar(0.6); } });
    add(fin(TAILS.rounded, 0x5c4b31, { x: -0.46 }), fin([[0, 0], [0.02, 0.08], [0.32, 0.07], [0.36, 0]], 0x5c4b31, { x: -0.22, y: 0.13 }),
      fin([[0, 0], [0.02, -0.07], [0.12, -0.06], [0.14, 0]], 0x5c4b31, { x: -0.25, y: -0.13 }));
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI), std(0x2b2116));
    mouth.rotation.set(0, Math.PI / 2, Math.PI / 2); mouth.position.set(0.48, -0.02, 0); g.add(mouth);
  } else {   // shark
    h = 0.22; w = 0.2;
    b = body({ h, w, profile: (u) => Math.max(Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.75) * (u > 0.85 ? 1 - (u - 0.85) * 2.2 : 1), u < 0.1 ? 0.12 + u : 0),
      back: 0x667685, belly: 0xf2f2f0, line: 0.45, soft: 0.03, rough: 0.55,
      paint: (u, y, z, c) => { if (u > 0.68 && u < 0.76 && Math.abs(y) < 0.4 && Math.abs(Math.sin(u * 260)) > 0.75) c.multiplyScalar(0.5); } });   // gill slits
    add(fin(TAILS.shark, 0x5b6a78, { x: -0.48 }), fin([[0, 0], [0.06, 0.17], [0.09, 0.17], [0.16, 0]], 0x5b6a78, { x: 0.0, y: 0.09 }),
      fin([[0, 0], [0.02, 0.04], [0.05, 0]], 0x5b6a78, { x: -0.3, y: 0.06 }));
    for (const s of [1, -1]) add(fin([[0, 0], [-0.18, 0.02], [-0.2, 0], [0, -0.06]], 0x5b6a78, { x: 0.22, y: -0.06, z: s * 0.08, flat: true, rx: s * 0.35 }));
  }
  g.add(b);
  if (key !== "shark") for (const s of [1, -1]) g.add(fin([[0, 0], [-0.05, 0.025], [-0.08, 0.012], [-0.075, -0.012], [0, -0.025]], 0x8796a3,
    { x: 0.28, y: -0.035, z: s * w * 0.44, ry: s * 0.55, rx: s * 0.5, opacity: 0.7 }));   // pectoral fins
  eyes(g, 0.4, h * 0.12, w * 0.33, 0.02, 0x0b0b0b);
  anat = {
    swimBladder: [0.03, 0.03 * h / 0.25, 0, 0.18], organs: [0.12, -0.03, 0, 0.14], gills: [0.33, 0, 0, 0.08],
    head: [0.4, 0, 0, 0.1], body: [0, 0, 0, 0.45], skinSide: "+z",
  };
  return { g, bodyMats: [b.material], anat, h };
}

// ---------------------------------------------------------------- marine mammals
function mammalModel(key) {
  const g = new THREE.Group();
  let b, h = 0.2, w = 0.18, finCol;
  if (key === "orca") {
    h = 0.22; w = 0.2; finCol = 0x101318;
    b = body({ h, w, profile: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.7) * (u < 0.12 ? 0.3 + 5 * u : 1), back: 0x0e1115, belly: 0x0e1115,
      paint: (u, y, z, c) => {
        if (y < -0.15 && u > 0.35) c.set(0xf3f3ef);                                                // white belly
        if (u > 0.76 && u < 0.88 && y > 0.05 && y < 0.55 && Math.abs(z) > 0.55) c.set(0xf3f3ef);  // eye patch
        if (u > 0.42 && u < 0.52 && y > 0.75) c.set(0x7f858c);                                     // grey saddle
      } });
    g.add(fin([[0, 0], [0.02, 0.32], [0.05, 0.3], [0.1, 0]], finCol, { x: -0.03, y: 0.09 }));
  } else if (key === "sealion") {
    h = 0.2; w = 0.18; finCol = 0x3d2e22;
    b = body({ h, w, profile: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.8) * (u > 0.82 ? 0.75 : 1) * (u < 0.1 ? 0.35 + 6 * u : 1),
      back: 0x5e4836, belly: 0x8a6c50, rough: 0.35 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), b.material);
    head.scale.set(1.5, 1, 1); head.position.set(0.47, 0.03, 0); g.add(head);
    for (const s of [1, -1]) {
      g.add(fin([[0, 0], [-0.04, 0.0], [-0.2, -0.05], [-0.2, -0.09], [0, -0.04]], finCol, { x: 0.2, y: -0.06, z: s * 0.08, ry: s * 0.6, rx: s * 0.8 }));
      g.add(fin([[0, 0], [-0.14, 0.03], [-0.15, -0.03]], finCol, { x: -0.45, y: 0, z: s * 0.03, flat: true }));
    }
    eyes(g, 0.53, 0.05, 0.045, 0.012);
    g.add(b);
    return { g, bodyMats: [b.material], anat: mammalAnat(h, w, 0.5), h };
  } else if (key === "humpback") {
    h = 0.2; w = 0.2; finCol = 0x262c33;
    b = body({ h, w, profile: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.7) * (u < 0.12 ? 0.25 + 6 * u : 1), back: 0x252b32, belly: 0x252b32,
      paint: (u, y, z, c) => { if (y < -0.35 && u > 0.55 && u < 0.95) c.set(Math.abs(Math.sin(z * 30)) > 0.5 ? 0xe9e9e4 : 0x3a4048); } });   // throat grooves
    g.add(fin([[0, 0], [0.03, 0.04], [0.07, 0]], finCol, { x: -0.18, y: 0.08 }));
    for (const s of [1, -1]) g.add(fin([[0, 0.02], [-0.15, 0.04], [-0.34, 0.01], [-0.36, -0.03], [-0.15, -0.06], [0, -0.06]], 0xd6d8d3, { x: 0.25, y: -0.07, z: s * 0.09, flat: true, rx: s * 0.4, ry: s * 0.5 }));
  } else if (key === "sperm") {
    h = 0.2; w = 0.17; finCol = 0x3f454c;
    b = body({ h, w, profile: (u) => (u > 0.62 ? 1 : Math.sin((Math.PI / 2) * Math.pow(u / 0.62, 0.8)) * 0.92 + 0.08) * (u > 0.97 ? 0.85 : 1) * (u < 0.1 ? 0.3 + 7 * u : 1),
      back: 0x464c53, belly: 0x5a6068, paint: (u, y, z, c) => { if (Math.abs(Math.sin(u * 90 + y * 20)) > 0.92) c.multiplyScalar(0.85); } });   // wrinkled skin
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.06), std(0xd9d6cf));
    jaw.position.set(0.3, -0.1, 0); g.add(jaw);
    g.add(fin([[0, 0], [0.03, 0.035], [0.08, 0]], finCol, { x: -0.16, y: 0.09 }));
    for (const s of [1, -1]) g.add(fin([[0, 0], [-0.08, 0.01], [-0.09, -0.02], [0, -0.03]], finCol, { x: 0.2, y: -0.08, z: s * 0.08, flat: true, rx: s * 0.4 }));
  } else {   // bottlenose dolphin
    h = 0.2; w = 0.18; finCol = 0x56636f;
    b = body({ h, w, profile: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.75) * (u > 0.9 ? 1 - (u - 0.9) * 5.5 : 1) * (u < 0.12 ? 0.25 + 6 * u : 1),
      back: 0x55626f, belly: 0xdfe3e7, line: 0.42, soft: 0.14, rough: 0.3 });
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 12), b.material.clone());
    beak.material.vertexColors = false; beak.material.color.set(0x8b97a2);
    beak.rotation.z = -Math.PI / 2; beak.position.set(0.52, -0.02, 0); g.add(beak);
    g.add(fin([[0, 0], [0.02, 0.06], [-0.06, 0.15], [0.1, 0]], finCol, { x: -0.04, y: 0.08 }));
  }
  if (key !== "humpback" && key !== "sperm") for (const s of [1, -1]) g.add(fin([[0, 0], [-0.13, 0.02], [-0.14, -0.01], [0, -0.04]], finCol, { x: 0.25, y: -0.06, z: s * 0.08, flat: true, rx: s * 0.45, ry: s * 0.35 }));
  g.add(fin(FLUKES, finCol, { x: -0.47, flat: true }));
  g.add(b);
  eyes(g, key === "sperm" ? 0.3 : 0.38, -0.01, w * 0.42, 0.012);
  return { g, bodyMats: [b.material], anat: mammalAnat(h, w, key === "sperm" ? 0.3 : 0.38), h };
}
const mammalAnat = (h, w, earX) => ({
  lungs: [0.14, h * 0.15, 0, 0.17], gut: [-0.06, -h * 0.15, 0, 0.15], ears: [[earX - 0.04, 0, w * 0.4], [earX - 0.04, 0, -w * 0.4], 0.035],
  body: [0, 0, 0, 0.45], skinSide: "+z",
});

// ---------------------------------------------------------------- turtles
function turtleModel(key) {
  const g = new THREE.Group();
  const shellCol = { green: 0x6b5d32, loggerhead: 0x8a4c27, leatherback: 0x1e2226 }[key] || 0x6b5d32;
  const skinCol = key === "leatherback" ? 0x2a2e33 : 0x8f9a6a;
  const shell = body({ h: 0.5, w: 0.85, profile: (u) => Math.pow(Math.sin(Math.PI * u), 0.6), back: shellCol, belly: 0xd8c99a, line: 0.48, soft: 0.03,
    paint: (u, y, z, c) => {
      if (key === "leatherback") { if (Math.abs(Math.sin(z * 9)) > 0.93 && y > 0) c.multiplyScalar(1.8); if (hash(Math.floor(u * 40), Math.floor(z * 20)) > 0.93) c.set(0xd8d8d8); }
      else if (y > 0 && (Math.abs(Math.sin(u * 14)) < 0.1 || Math.abs(Math.sin(z * 4.5)) < 0.08)) c.multiplyScalar(0.55);   // scute seams
    } });
  shell.scale.set(0.82, 0.45, 1);
  const skin = std(skinCol, { roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(key === "loggerhead" ? 0.1 : 0.08, 14, 10), skin);
  head.scale.set(1.3, 0.9, 1); head.position.set(0.47, 0.02, 0);
  g.add(shell, head);
  for (const [x, z, ry, l] of [[0.22, 0.3, 0.55, 0.38], [0.22, -0.3, -0.55, 0.38], [-0.3, 0.2, -0.5, 0.16], [-0.3, -0.2, 0.5, 0.16]]) {
    const f = fin([[0, 0], [l * 0.3, 0.05], [l, 0.01], [l, -0.02], [0, -0.04]], skinCol, { x, y: -0.02, z, flat: true });
    f.rotation.z = 0; f.rotation.y = Math.PI + ry; g.add(f);
  }
  eyes(g, 0.55, 0.04, 0.05, 0.013);
  return { g, bodyMats: [shell.material, skin], anat: { lungs: [0.02, 0.08, 0, 0.2], gut: [-0.02, -0.03, 0, 0.16], ears: [[0.5, 0.02, 0.07], [0.5, 0.02, -0.07], 0.03], body: [0, 0, 0, 0.45], skinSide: "+z" }, h: 0.45 };
}

// ---------------------------------------------------------------- people
// A person, about 1 unit tall, standing on y = 0 (feet) facing +x.
export function humanModel({ suit = 0x2f4a6b, skin = 0xd9a882, pants = 0x2b2f36 } = {}) {
  const g = new THREE.Group();
  const mSkin = std(skin, { roughness: 0.6 }), mSuit = std(suit, { roughness: 0.7 }), mPants = std(pants, { roughness: 0.8 });
  const part = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; g.add(m); return m; };
  for (const s of [1, -1]) {
    part(new THREE.CapsuleGeometry(0.055, 0.36, 4, 10), mPants, 0, 0.24, s * 0.07);          // legs
    part(new THREE.CapsuleGeometry(0.04, 0.3, 4, 10), mSuit, 0, 0.61, s * 0.19, s * 0.08);    // arms
    part(new THREE.SphereGeometry(0.04, 10, 8), mSkin, 0, 0.42, s * 0.2);                       // hands
  }
  const torso = part(new THREE.CapsuleGeometry(0.13, 0.24, 6, 14), mSuit, 0, 0.62, 0);
  torso.scale.set(0.75, 1, 1.15);
  part(new THREE.CylinderGeometry(0.04, 0.045, 0.06, 10), mSkin, 0, 0.83, 0);                // neck
  const head = part(new THREE.SphereGeometry(0.085, 16, 12), mSkin, 0, 0.92, 0);
  head.scale.set(1, 1.15, 0.95);
  const hair = part(new THREE.SphereGeometry(0.088, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3a2a1e), -0.01, 0.94, 0);
  hair.scale.set(1, 1.1, 0.97);
  eyes(g, 0.075, 0.94, 0.03, 0.01);
  return { g, bodyMats: [mSkin], clothMats: [mSuit, mPants],
    anat: { ears: [[0, 0.92, 0.085], [0, 0.92, -0.085], 0.025], lungs: [0.0, 0.66, 0, 0.12], gut: [0.0, 0.48, 0, 0.1], head: [0, 0.92, 0, 0.1],
      body: [0, 0.5, 0, 0.5], skinSide: "+x", eyesAt: [0.08, 0.94, 0, 0.03] } };
}

function diverModel() {
  // the person lying horizontally (swimming), head at +x
  const p = humanModel({ suit: 0x1f2328, pants: 0x1f2328 });
  const g = new THREE.Group();
  p.g.rotation.z = -Math.PI / 2; p.g.position.set(-0.5, 0, 0);
  g.add(p.g);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 14), std(0xcfd3d8, { metalness: 0.6, roughness: 0.3 }));
  tank.rotation.z = Math.PI / 2; tank.position.set(0.12, 0.17, 0); g.add(tank);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), std(0xf2c14e));
  vest.position.set(0.15, 0.1, 0); g.add(vest);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), std(0x7fd3ff, { metalness: 0.3, roughness: 0.1 }));
  mask.position.set(0.47, 0.02, 0); g.add(mask);
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.09), std(0xf2c14e));
    f.position.set(-0.56, 0, s * 0.07); g.add(f);
  }
  // anatomy rotated with the body: (x, y) -> (y - 0.5, -x)
  const rot = ([x, y, z, r]) => [y - 0.5, -x, z, r];
  const a = p.anat;
  return { g, bodyMats: p.bodyMats, anat: { ears: [[a.ears[0][1] - 0.5, 0, a.ears[0][2]], [a.ears[1][1] - 0.5, 0, a.ears[1][2]], a.ears[2]],
    lungs: rot(a.lungs), gut: rot(a.gut), head: rot(a.head), body: [0, 0, 0, 0.5], skinSide: "+y" }, h: 0.3 };
}

function boatModel() {
  const g = new THREE.Group(), hullMat = std(0xf4f4f0, { roughness: 0.35 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.28, 8, 2, 2), hullMat);
  const pos = hull.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (x > 0.15) pos.setZ(i, pos.getZ(i) * Math.max(1 - (x - 0.15) / 0.27, 0.02));   // pointed bow
    if (y < 0) pos.setZ(i, pos.getZ(i) * 0.55);                                        // narrow keel
    if (x > 0.15 && y > 0) pos.setY(i, y + (x - 0.15) * 0.15);                         // raised bow
  }
  hull.geometry.computeVertexNormals();
  g.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.285), std(0x1f5f99));
  stripe.position.set(-0.08, 0.03, 0); g.add(stripe);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.2), std(0xe4eaef));
  cabin.position.set(-0.02, 0.14, 0); g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.18), std(0x2a4c66, { metalness: 0.5, roughness: 0.1 }));
  glass.position.set(0.11, 0.16, 0); g.add(glass);
  const person = humanModel();
  person.g.scale.setScalar(0.22); person.g.position.set(-0.26, 0.08, 0); person.g.rotation.y = Math.PI;
  g.add(person.g);
  person.g.userData.rx0 = 0;
  return { g, bodyMats: person.bodyMats, anat: null, h: 0.3, person: person.g };
}

// ---------------------------------------------------------------- ships (waterline at y = 0, bow at +x)
function hullGeo(len, beam, depth, bowStart = 0.25, draft = 0.4) {
  const g = new THREE.BoxGeometry(len, depth, beam, 16, 3, 3);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const u = x / len + 0.5;                                          // 0 stern .. 1 bow
    let wz = 1;
    if (u > 1 - bowStart) wz = Math.max(1 - (u - (1 - bowStart)) / bowStart, 0.02);   // pointed bow
    if (u < 0.06) wz *= 0.85 + 2.5 * u;                               // rounded stern
    const keel = y < 0 ? 0.55 + 0.45 * (y / depth + 0.5) * 2 : 1;      // narrower below
    pos.setZ(i, pos.getZ(i) * wz * keel);
    if (u > 1 - bowStart && y > 0) pos.setY(i, y + (u - (1 - bowStart)) * depth * 0.6);   // raised bow
  }
  g.translate(0, depth / 2 - depth * draft, 0);
  g.computeVertexNormals();
  return g;
}
function crew(g, n, xs, y, scale, z = 0.02) {
  for (let i = 0; i < n; i++) {
    const p = humanModel({ suit: [0x2f4a6b, 0xd9822b, 0x3d6b3a][i % 3] });
    p.g.scale.setScalar(scale);
    p.g.position.set(xs[0] + (xs[1] - xs[0]) * (i / Math.max(n - 1, 1)), y, (i % 2 ? 1 : -1) * z);
    p.g.rotation.y = Math.PI / 2 + (i % 3) * 0.7;
    g.add(p.g);
  }
}
function shipModel(type) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  let deckY = 0.05;
  if (type === "small_craft") {            // fishing boat
    const hull = std(0xb3261e, { roughness: 0.5 }), white = std(0xf1efe8);
    add(hullGeo(1, 0.26, 0.17, 0.3), hull, 0, 0);
    add(new THREE.BoxGeometry(0.98, 0.02, 0.2), std(0x2c3036), -0.02, 0.0);       // boot stripe at the waterline
    deckY = 0.1;
    add(new THREE.BoxGeometry(0.22, 0.13, 0.18), white, 0.12, deckY + 0.065);     // wheelhouse
    add(new THREE.BoxGeometry(0.01, 0.05, 0.16), std(0x22394d, { metalness: 0.5, roughness: 0.1 }), 0.235, deckY + 0.1);
    add(new THREE.CylinderGeometry(0.006, 0.008, 0.38, 6), std(0xd8d8d8), 0.05, deckY + 0.19);   // mast
    const boom = add(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 6), std(0xd8d8d8), -0.18, deckY + 0.16);
    boom.rotation.z = 1.0;
    add(new THREE.BoxGeometry(0.16, 0.05, 0.12), std(0x5c7c3a, { roughness: 0.9 }), -0.32, deckY + 0.025);   // nets
    crew(g, 3, [-0.36, -0.05], deckY, 0.075, 0.05);
  } else if (type === "destroyer") {
    const grey = std(0x7d8791, { roughness: 0.55, metalness: 0.2 }), dark = std(0x4f565e, { roughness: 0.6 });
    add(hullGeo(1, 0.11, 0.08, 0.28), grey, 0, 0);
    add(new THREE.BoxGeometry(0.99, 0.008, 0.09), std(0x3a2020), 0, -0.002);
    deckY = 0.05;
    add(new THREE.BoxGeometry(0.22, 0.05, 0.07), grey, 0.08, deckY + 0.025);        // superstructure
    add(new THREE.BoxGeometry(0.1, 0.04, 0.06), grey, 0.1, deckY + 0.07);
    add(new THREE.CylinderGeometry(0.004, 0.006, 0.12, 6), dark, 0.07, deckY + 0.15);   // mast
    add(new THREE.BoxGeometry(0.06, 0.05, 0.035), dark, -0.06, deckY + 0.045);        // funnel
    for (const [x, rot] of [[0.33, 0], [-0.34, Math.PI]]) {                           // gun turrets
      const t = add(new THREE.CylinderGeometry(0.025, 0.028, 0.025, 12), grey, x, deckY + 0.012);
      const b = add(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 6), dark, x + (rot ? -0.04 : 0.04), deckY + 0.02);
      b.rotation.z = Math.PI / 2; t.rotation.y = rot;
    }
    add(new THREE.BoxGeometry(0.12, 0.012, 0.05), dark, -0.22, deckY + 0.006);        // missile launcher
    crew(g, 4, [-0.42, 0.42], deckY, 0.012, 0.035);
  } else {                                  // aircraft carrier
    const grey = std(0x6f7880, { roughness: 0.6, metalness: 0.15 }), deck = std(0x3d4248, { roughness: 0.9 });
    add(hullGeo(1, 0.11, 0.07, 0.18, 0.45), grey, 0, 0);
    deckY = 0.045;
    const fd = add(new THREE.BoxGeometry(1.02, 0.008, 0.17), deck, 0.0, deckY);      // flight deck (wider than the hull)
    fd.position.z = 0.01;
    const line = std(0xe8e4c8, { roughness: 0.8 });
    add(new THREE.BoxGeometry(0.9, 0.0015, 0.004), line, 0, deckY + 0.005);
    const angled = add(new THREE.BoxGeometry(0.45, 0.0015, 0.004), line, -0.1, deckY + 0.005, 0.04);
    angled.rotation.y = -0.15;
    add(new THREE.BoxGeometry(0.1, 0.05, 0.025), grey, 0.08, deckY + 0.03, -0.065);    // island
    add(new THREE.CylinderGeometry(0.003, 0.004, 0.06, 6), deck, 0.08, deckY + 0.08, -0.065);
    for (let i = 0; i < 6; i++) {                                                      // parked jets
      const j = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.04, 6), std(0x9aa3ab)); body.rotation.z = -Math.PI / 2;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.001, 0.03), std(0x9aa3ab));
      j.add(body, wing); j.position.set(-0.35 + i * 0.05, deckY + 0.006, 0.055); j.rotation.y = 0.6;
      g.add(j);
    }
    crew(g, 5, [-0.3, 0.3], deckY + 0.004, 0.0055, 0.03);
  }
  return { g, bodyMats: [], anat: null, h: 0.2, ship: true };
}

/** Build a model for a receiver. `r` has kind, preset (species key) and mass_kg. */
export function makeModel(r, color) {
  const key = speciesOf(r.preset) ? (ALIASES[r.preset] || r.preset) : null;
  const sp = speciesOf(r.preset);
  let m;
  if (r.kind === "person") m = boatModel();
  else if (r.kind === "ship") m = shipModel(r.ship_type || "destroyer");
  else if (r.kind === "diver") m = diverModel();
  else if (r.kind === "turtle") m = turtleModel(key || "green");
  else if (r.kind === "fish") m = fishModel(sp && sp.kind === "fish" ? key : "cod");
  else m = mammalModel(sp && sp.kind === "mammal" ? key : ((r.mass_kg ?? 0) > 1000 ? "humpback" : "dolphin"));
  // status ring (technical view): its material is what gets recoloured by injury level
  const statusMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 48), statusMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = -(m.h || 0.25) * 0.75;
  m.g.add(ring);
  m.g.material = statusMat;
  m.g.userData.ring = ring;
  m.g.userData.bodyMats = m.bodyMats;
  m.g.userData.anatomy = m.anat;
  m.g.userData.person = m.person || null;
  m.g.userData.ship = !!m.ship;
  return m.g;
}

/** Real body length in metres, used by the realistic view (scaled with mass from the species' typical size). */
export function realLength(r) {
  if (r.kind === "person") return 8;
  if (r.kind === "ship") return speciesOf(r.preset)?.length_m || 150;
  const sp = speciesOf(r.preset);
  if (sp && sp.length_m) return sp.length_m * (sp.mass_kg && r.mass_kg ? Math.cbrt(r.mass_kg / sp.mass_kg) : 1);
  if (r.kind === "diver") return 1.8;
  if (r.kind === "turtle") return 1.0;
  if (r.kind === "fish") return Math.max(0.1, 0.25 * Math.cbrt((r.mass_kg ?? 0.5) / 0.15));
  return Math.max(1.5, 2.3 * Math.cbrt((r.mass_kg ?? 150) / 150));
}
