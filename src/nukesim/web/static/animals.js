// Artist-made animals, loaded from free models (vendor/models/animals/, sources and licences in CREDITS below).
//
// Every animal is normalised like the old code-built ones: 1 unit long along x, head at +x, back up (+y),
// centred on the origin. Then each gets a gentle movement:
//   - models that come with a skeleton and a swim animation (Quaternius) play it;
//   - the others are bent a little every frame: fish wave their tails side to side, whales and dolphins
//     beat their flukes up and down, birds flap, turtles paddle.
// The movement is drawing only; it does not change any result.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const Q = "Quaternius (public domain, CC0)";
const G = "Poly by Google (CC-BY 3.0)";
export const CREDITS = [
  ["Fish, Shark, Dolphin, Whale, Fish Mackerel, Fish Tuna", Q],
  ["Sperm Whale, Orca, Turtle, Sea lion, Flying seagull, Flying gull", G],
];

// fwd: which way the head points in the file; wag: how the body bends when there is no animation
const DEFS = {
  fish:      { file: "fish.glb", fwd: "+z", wag: "tail", speed: 1.4 },
  fish_deep: { file: "fish_deep.glb", fwd: "+z", wag: "tail", speed: 1.0 },
  mackerel:  { file: "mackerel.glb", fwd: "-x", wag: "tail" },
  tuna:      { file: "tuna.glb", fwd: "-x", wag: "tail" },
  shark:     { file: "shark.glb", fwd: "+z", wag: "tail", speed: 0.7 },
  dolphin:   { file: "dolphin.glb", fwd: "+z", wag: "fluke", speed: 0.9 },
  humpback:  { file: "humpback.glb", fwd: "+z", wag: "fluke", speed: 0.45 },
  sperm:     { file: "sperm.glb", fwd: "+z", wag: "fluke" },
  orca:      { file: "orca.glb", fwd: "-z", wag: "fluke" },
  turtle:    { file: "turtle.glb", fwd: "+z", wag: "paddle" },
  sealion:   { file: "sealion.glb", fwd: "+z", wag: "fluke", tilt: -1.05 },   // sits up in the file; laid down to swim
  gull:      { file: "gull.glb", fwd: "+x", wag: "flap", side: true },
  gull_dark: { file: "gull_dark.glb", fwd: "+x", wag: "flap", side: true },
};

// species -> [model, colour changes by material name, wag strength]
const SPECIES = {
  sardine:     ["fish", { Top: 0x2f6688, Bottom: 0xe7eef3, Fins: 0x7d97a8 }],
  cod:         ["fish", { Top: 0x7b6b42, Bottom: 0xe9e1c8, Fins: 0x6d5f3d }],
  salmon:      ["fish", { Top: 0x48657f, Bottom: 0xeef1f3, Fins: 0x5d7286 }],
  grouper:     ["fish_deep", { Body: 0x77603d, Stripes: 0x4b3b24, Outline: 0x33281a }],
  mackerel:    ["mackerel"],
  tuna:        ["tuna"],
  shark:       ["shark"],
  dolphin:     ["dolphin"],
  humpback:    ["humpback"],
  sperm:       ["sperm"],
  orca:        ["orca"],
  sealion:     ["sealion"],
  green:       ["turtle"],
  loggerhead:  ["turtle", { Mat: 0x9a5a2c, WhiteShell: 0xe0c28f, GreenSkin: 0xa08a64 }],
  leatherback: ["turtle", { Mat: 0x26292e, Brown: 0x1e2226, WhiteShell: 0x30353b, GreenSkin: 0x2a2e33 }],
  gull:        ["gull"],
  tern:        ["gull", { "*": 0xf4f6f8 }],
  frigatebird: ["gull_dark", { "*": 0x3a3d44 }],
};

const loaded = {};
const live = new Set();

export async function loadAnimals() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(DEFS).map(async ([k, d]) => {
    try { loaded[k] = await loader.loadAsync(`vendor/models/animals/${d.file}`); }
    catch (e) { console.warn(`Animal model ${d.file} not available, using the simple one:`, e); }
  }));
  return Object.keys(loaded).length;
}
export const hasAnimal = (key) => !!(SPECIES[key] && loaded[SPECIES[key][0]]);

const TURN = { "+x": 0, "-x": Math.PI, "+z": Math.PI / 2, "-z": -Math.PI / 2 };
const _m = new THREE.Matrix4();

/** A new animal of this species, or null if its model is not loaded. Returns { g, bodyMats, h }. */
export function createAnimal(key) {
  const [base, tint = {}] = SPECIES[key] || [];
  const def = DEFS[base], src = loaded[base];
  if (!src) return null;
  const inner = SkeletonUtils.clone(src.scene);
  const turn = new THREE.Group();
  turn.add(inner);
  turn.rotation.y = TURN[def.fwd];
  const holder = new THREE.Group();
  holder.add(turn);
  holder.rotation.z = def.tilt || 0;
  const g = new THREE.Group();
  g.add(holder);
  // normalise: 1 unit long along x, centred
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder, true), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = 1 / size.x;
  holder.scale.setScalar(s);
  holder.position.copy(c).multiplyScalar(-s);
  g.updateMatrixWorld(true);

  // own copies of the materials (so injuries can tint one animal), with the species' colours
  const mats = new Map(), clip = src.animations.find((a) => /Swim$/.test(a.name)) || src.animations[0];
  let skinned = false;
  inner.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) { skinned = true; o.frustumCulled = false; }
    const one = (m) => {
      if (!mats.has(m)) {
        const n = m.clone();
        if (tint[m.name] != null) n.color.set(tint[m.name]);        // repaint this part
        else if (tint["*"] != null) n.color.multiply(new THREE.Color(tint["*"]));   // darken/lighten the whole animal
        if (def.side) n.side = THREE.DoubleSide;
        n.roughness = Math.min(n.roughness ?? 0.6, 0.6);
        mats.set(m, n);
      }
      return mats.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });

  const a = { g, base, def, phase: Math.random() * 10, frozen: false, mixer: null, bent: [] };
  if (skinned && clip) {
    a.mixer = new THREE.AnimationMixer(inner);
    const act = a.mixer.clipAction(clip);
    act.timeScale = def.speed ?? 1; act.time = a.phase; act.play();
  } else {
    // no skeleton: bake every part into the animal's own frame, so it can be bent vertex by vertex
    const parts = [];
    inner.traverse((o) => { if (o.isMesh) parts.push(o); });
    for (const o of parts) {
      const geo = o.geometry.clone().applyMatrix4(_m.copy(o.matrixWorld));
      const mesh = new THREE.Mesh(geo, o.material);
      mesh.userData.spine = true; mesh.frustumCulled = false;
      g.add(mesh);
      a.bent.push({ mesh, orig: Float32Array.from(geo.attributes.position.array) });
    }
    g.remove(holder);
  }
  g.userData.animal = a;
  live.add(a);
  return { g, bodyMats: [...mats.values()], h: size.y * s };
}

/** Before a ragdoll takes over: freeze the animal, and turn a skinned one into plain meshes in its own frame. */
export function bakeAnimal(g) {
  const a = g.userData.animal;
  if (!a) return;
  a.frozen = true;
  live.delete(a);
  if (!a.mixer) return;
  const holder = g.children.find((c) => c.isGroup && !c.userData.spine);
  if (!holder) return;
  g.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(g.matrixWorld).invert(), v = new THREE.Vector3();
  const parts = [];
  holder.traverse((o) => { if (o.isMesh) parts.push(o); });
  for (const o of parts) {
    const src = o.geometry, n = src.attributes.position.count, pos = new Float32Array(n * 3);
    const M = new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld);
    for (let i = 0; i < n; i++) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(src.attributes.position, i);
      v.applyMatrix4(M); pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    for (const k of ["uv", "color"]) if (src.attributes[k]) geo.setAttribute(k, src.attributes[k]);
    if (src.index) geo.setIndex(src.index);
    for (const gr of src.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, o.material);
    mesh.userData.spine = true; mesh.frustumCulled = false;
    g.add(mesh);
  }
  g.remove(holder);
}

/** Move every animal a little (call once a frame). */
export function tickAnimals(dt, now) {
  const t = now / 1000;
  for (const a of live) {
    if (!a.g.parent) { live.delete(a); continue; }
    if (a.frozen) continue;
    if (a.mixer) { a.mixer.update(dt); continue; }
    const w = a.def.wag, tt = t * (a.def.speed ?? 1) + a.phase;
    for (const { mesh, orig } of a.bent) {
      const p = mesh.geometry.attributes.position, arr = p.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = orig[i], y = orig[i + 1], z = orig[i + 2];
        let nx = x, ny = y, nz = z;
        if (w === "tail") {          // a wave running down the body, growing toward the tail
          const k = Math.max(0, 0.3 - x) ** 2;
          nz = z + 0.09 * k * Math.sin(tt * 7 - x * 5);
        } else if (w === "fluke") {  // the tail and flukes beat up and down
          const k = Math.max(0, 0.1 - x) ** 2;
          ny = y + 0.18 * k * Math.sin(tt * 2.6 - x * 3);
        } else if (w === "flap") {   // wings go up and down from the shoulders
          const r = Math.abs(z) - 0.08;
          if (r > 0) { const ang = 0.5 * Math.sin(tt * 6); ny = y + r * Math.sin(ang); nz = Math.sign(z) * (0.08 + r * Math.cos(ang)); }
        } else if (w === "paddle") { // turtles: the front flippers sweep slowly
          const r = Math.max(0, Math.abs(z) - 0.28);
          if (x > -0.1) ny = y + r * 0.6 * Math.sin(tt * 1.8);
        }
        arr[i] = nx; arr[i + 1] = ny; arr[i + 2] = nz;
      }
      p.needsUpdate = true;
    }
  }
}
