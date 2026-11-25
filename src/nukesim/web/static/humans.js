// Rigged, animated people: "Animated Human" by Quaternius (public domain, CC0), from Poly Pizza
// (vendor/models/human.glb). It has a standard skeleton (Hips, Spine, Arm, ForeArm, UpLeg, Leg, ...)
// and a skin that bends with it, plus animations (Idle, Walk, Run, Death, ...).
//
// Every person is normalised to 1 unit tall, feet at y = 0, facing +x (like the old code-built people).
// Standing people play the Idle animation; divers lie flat and kick slowly (driven bone by bone here).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

let source = null;          // the loaded model (cloned for every person)
const live = new Set();     // people to animate each frame

export async function loadHumans() {
  try { source = await new GLTFLoader().loadAsync("vendor/models/human.glb"); }
  catch (e) { console.warn("Rigged human not available, using the simple model:", e); source = null; }
  return !!source;
}
export const humansReady = () => !!source;

/**
 * A new rigged person. pose: "stand" (idle animation) or "swim" (lying face down, head at +x, kicking).
 * Returns { group, bones, mixer, skinned, setPose }.
 */
// clothes, painted onto the skin by which bone moves each part (skin, shirt, trousers, shoes)
const OUTFITS = {
  deck: { skin: 0xd9a882, shirt: 0x2f5d8a, pants: 0x2b2f36, shoes: 0x1b1d21, hair: 0x3a2a1e },
  orange: { skin: 0xc68d6a, shirt: 0xe07b28, pants: 0x34383f, shoes: 0x1b1d21, hair: 0x1e1712 },
  wetsuit: { skin: 0xd9a882, shirt: 0x15171b, pants: 0x15171b, shoes: 0x15171b, hair: 0x15171b },
};
function partOf(name) {
  if (/Head|Neck/.test(name)) return "skin";
  if (/Hand/.test(name)) return "skin";
  if (/ForeArm/.test(name)) return "skin";         // sleeves rolled up
  if (/Spine|Shoulder|Arm/.test(name)) return "shirt";
  if (/Foot|Toe/.test(name)) return "shoes";
  return "pants";                                    // hips and legs
}
function paint(skinned, outfit) {
  const g = skinned.geometry = skinned.geometry.clone();
  const idx = g.attributes.skinIndex, w = g.attributes.skinWeight, n = g.attributes.position.count;
  const names = skinned.skeleton.bones.map((b) => b.name), col = new Float32Array(n * 3), c = new THREE.Color();
  const headTop = names.indexOf("HeadTop_End");
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const wk = w.getComponent(i, k); if (wk > bw) { bw = wk; best = idx.getComponent(i, k); } }
    let part = partOf(names[best] || "");
    if (part === "skin" && names[best] === "Head" && g.attributes.position.getY(i) > 0 && best === headTop) part = "hair";
    c.set(outfit[part] ?? outfit.skin);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  skinned.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0, flatShading: false });
}

export function createHuman({ pose = "stand", outfit = "deck" } = {}) {
  if (!source) return null;
  const inner = SkeletonUtils.clone(source.scene);
  inner.updateMatrixWorld(true);   // (the model has its own internal scale; measure it as drawn)
  const box = new THREE.Box3().setFromObject(inner, true);
  const h = box.max.y - box.min.y, s = 1 / h;
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;
  // the model faces +z; turn it to face +x
  const holder = new THREE.Group();
  holder.add(inner);
  holder.rotation.y = Math.PI / 2;
  const group = new THREE.Group();
  group.add(holder);
  const bones = {};
  let skinned = null;
  inner.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { skinned = o; o.frustumCulled = false; }
  });
  if (skinned) paint(skinned, OUTFITS[outfit] || OUTFITS.deck);
  const mixer = new THREE.AnimationMixer(inner);
  const clip = (name) => source.animations.find((a) => a.name.endsWith(`|${name}`));
  const p = { group, holder, inner, bones, mixer, skinned, pose, phase: Math.random() * 10, ragdoll: false };
  p.setPose = (ps) => {
    p.pose = ps;
    mixer.stopAllAction();
    // both poses start from the Idle animation (relaxed arms); swimmers add a kick on top (tickHumans)
    if (clip("Idle")) { const a = mixer.clipAction(clip("Idle")); a.time = p.phase; a.timeScale = ps === "swim" ? 0.4 : 1; a.play(); }
    if (ps === "swim") {
      // lie face down, head toward +x: rotate the standing person (up y -> +x, front +x -> -y)
      holder.rotation.set(0, 0, -Math.PI / 2);
      holder.rotateY(Math.PI / 2);
      holder.position.set(-0.5, 0, 0);
    }
  };
  p.setPose(pose);
  live.add(p);
  return p;
}

/** Forget a person (when its model is removed). */
export function dropHuman(p) { live.delete(p); }

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const turn = (b, x, y = 0, z = 0) => { if (b) b.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z))); };   // on top of the animation
/** Animate everyone: the Idle clip, and for swimmers a slow flutter kick added on top of it. */
export function tickHumans(dt, now) {
  for (const p of live) {
    if (p.ragdoll) continue;
    if (!p.group.parent) { live.delete(p); continue; }
    p.mixer.update(dt);
    if (p.pose === "swim") {
      const t = now / 1000 + p.phase, k = Math.sin(t * 4.2) * 0.3, b = p.bones;
      turn(b.LeftUpLeg, k); turn(b.RightUpLeg, -k);                   // legs kick in turn
      turn(b.LeftLeg, Math.max(0, -k) * 0.7); turn(b.RightLeg, Math.max(0, k) * 0.7);
      turn(b.LeftFoot, 0.7); turn(b.RightFoot, 0.7);                  // toes pointed, like with fins
      turn(b.Neck, -0.45); turn(b.Head, -0.2);                        // looking ahead
    }
  }
}
