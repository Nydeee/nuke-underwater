// Body view: a close-up of one animal or person, see-through like an X-ray, with the injured
// body parts glowing in the colour of their injury level.
//
// What is from the models and what is drawn:
//   * which injuries happen, how bad, and when: from the simulator (the same results as the panel)
//   * which organ each injury belongs to follows from what the criterion measures: blast injures the
//     gas-filled organs (lungs, gut, ears, a fish's swim bladder); burns hit the skin facing the
//     fireball; whole-body radiation affects the whole body (bone marrow, gut lining)
//   * the exact spot on the body is where that organ usually is, not a measured location

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeModel, humanModel } from "./models.js";
import { esc } from "./ui.js";
import { icon } from "./icons.js";
import { iconOf } from "./species.js";

const LEVELS = ["none", "possible", "likely", "severe", "lethal"];
const LEVEL_COLORS = { none: "#6fbf73", possible: "#e6cf5a", likely: "#f0a23c", severe: "#e2552c", lethal: "#a51818" };
const PART_NAMES = {
  lungs: "Lungs", gut: "Gut (intestines)", ears: "Ears (eardrums)", swimBladder: "Swim bladder", organs: "Internal organs",
  skin: "Skin facing the fireball", body: "Whole body (bone marrow, gut lining)", eyes: "Eyes",
};

/** Which body parts an effect (from the assessment) belongs to. */
function partsFor(kind, e) {
  const n = e.name;
  if (n.startsWith("ship damage")) return [];
  if (n.includes("bird")) return ["body"];
  if (n.includes("radiation")) return ["body"];
  if (n.includes("burns")) return ["skin"];
  if (n.includes("flash blindness")) return ["eyes"];
  if (n.startsWith("hearing")) return ["ears"];
  if (n.includes("lung")) return ["lungs"];
  if (n.includes("gut")) return ["gut"];
  if (n.includes("swim bladder")) return ["swimBladder"];
  if (kind === "fish") return ["organs"];
  if (kind === "diver") return ["lungs", "gut"];                // underwater blast: gas-filled organs
  if (kind === "person" || kind === "ship") {                    // air blast on deck: Glasstone's bands
    const psi = parseFloat(e.value);
    const parts = [];
    if (!(psi < 5)) parts.push("ears");                           // eardrum rupture from 5 psi
    if (!(psi < 12)) parts.push("lungs");                         // lung damage from 12 psi
    return parts.length ? parts : ["ears"];
  }
  return ["body"];
}

export function createBodyView({ getReceiver, getResult, getTimelineEntry, getTime, following, onClose }) {
  const panel = document.createElement("div");
  panel.id = "bodyView"; panel.hidden = true;
  panel.innerHTML = `<div class="bvHead"><b class="bvTitle"></b><span class="bvTime"></span><button class="bvClose" title="Close (Esc)">✕</button></div>
    <div class="bvMain"><div class="bvCanvas"></div><div class="bvList"></div></div>
    <p class="bvNote">See-through view. Parts glow in the colour of their injury. Which organs are hurt comes from the
      models (blast injures the gas-filled organs: lungs, gut, ears, swim bladder; burns the skin facing the fireball);
      where they are drawn is where those organs usually are, not a measured spot. Drag to turn it.</p>`;
  document.querySelector("main").appendChild(panel);
  const host = panel.querySelector(".bvCanvas");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.2; controls.enablePan = false;
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x203040, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 2); scene.add(dl);
  let id = null, root = null, markers = [], raf = 0, lastKey = "";

  panel.querySelector(".bvClose").addEventListener("click", close);
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; });

  function glowSprite(color) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.25, color); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, blending: THREE.AdditiveBlending }));
  }

  function build() {
    if (root) scene.remove(root);
    markers = [];
    const r = getReceiver(id);
    if (!r) return;
    root = new THREE.Group();
    let model, anat, size = 1;
    if (r.kind === "person" || r.kind === "ship") {   // the person on the boat (or a crew member), standing
      const h = humanModel();
      model = h.g; anat = h.anat; model.userData.bodyMats = h.bodyMats; model.userData.cloth = h.clothMats;
      model.position.y = -0.5;
    } else {
      model = makeModel(r, "#ffffff");
      model.userData.ring.visible = false;
      anat = model.userData.anatomy;
    }
    // see-through body
    const clones = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const c = clones.get(o.material) || o.material.clone();
      clones.set(o.material, c); o.material = c;
      c.transparent = true; c.opacity = 0.5; c.depthWrite = false;
      if (c.emissive) c.emissive.set(0x1c3550);
    });
    model.userData.skin = (model.userData.bodyMats || []).map((m) => clones.get(m)).filter(Boolean);
    model.userData.skin.forEach((m) => { m.userData.bvOrig = m.color.getHex(); });
    root.add(model);
    scene.add(root);
    root.userData.anat = anat; root.userData.model = model; root.userData.kind = r.kind;
    const box = new THREE.Box3().setFromObject(model), dim = box.getSize(new THREE.Vector3());
    size = Math.max(dim.x, dim.y, dim.z);
    const ctr = box.getCenter(new THREE.Vector3());
    controls.target.copy(ctr);
    camera.position.set(ctr.x + size * 0.35, ctr.y + size * 0.35, ctr.z + size * 2.1);
    controls.update();
    lastKey = "";
  }

  function anchor(part) {
    const a = root.userData.anat || {}, m = root.userData.model, off = m.position;
    const at = (p) => new THREE.Vector3(p[0], p[1], p[2]).add(off);
    if (part === "ears" && a.ears) return [at(a.ears[0]), at(a.ears[1])].map((v) => [v, a.ears[2]]);
    if (part === "skin") {   // the side facing the fireball (towards ground zero = the -x side of the scene for these close-ups we show the front)
      const h = a.head || a.lungs || a.body;
      return [[at(h).add(new THREE.Vector3(0.06, 0, 0)), (h[3] || 0.1) * 1.2], ...(a.lungs ? [[at(a.lungs).add(new THREE.Vector3(0.1, 0, 0)), a.lungs[3] * 1.3]] : [])];
    }
    if (part === "eyes" && a.eyesAt) return [[at(a.eyesAt), a.eyesAt[3] * 1.6]];
    const p = a[part] || (part === "organs" ? a.body : null) || a.body;
    return p ? [[at(p), part === "body" ? p[3] * 1.4 : p[3]]] : [];
  }

  function refresh() {
    if (panel.hidden || !id) return;
    const r = getReceiver(id), res = getResult(id);
    if (!r) { close(); return; }
    const rt = following() ? getTimelineEntry(id) : null, t = getTime();
    const onsetOf = (name) => rt?.effects?.find((x) => x.name === name)?.onset_s ?? null;
    const done = (name) => !rt || (onsetOf(name) != null && onsetOf(name) <= t);
    // body part -> worst level among the injuries that have happened
    const parts = {};
    for (const e of res?.effects || []) {
      for (const p of partsFor(r.kind, e)) {
        parts[p] ??= { level: -1, pending: false, items: [] };
        const d = done(e.name);
        parts[p].items.push({ e, done: d, onset: onsetOf(e.name) });
        if (d) parts[p].level = Math.max(parts[p].level, LEVELS.indexOf(e.level)); else parts[p].pending = true;
      }
    }
    const key = JSON.stringify(Object.entries(parts).map(([k, v]) => [k, v.level, v.pending])) + id;
    panel.querySelector(".bvTitle").innerHTML = `${icon(iconOf(r))} ${esc(r.label)}`;
    panel.querySelector(".bvTime").textContent = rt ? `at ${fmt(t)}` : "final result";
    if (key === lastKey) return;
    lastKey = key;
    markers.forEach((m) => root.remove(m)); markers = [];
    // burned skin: tint the skin
    const model = root.userData.model;
    for (const m of model.userData.skin || []) {
      const lvl = parts.skin?.level ?? -1;
      m.color.set(lvl >= 3 ? 0x7a2a16 : lvl >= 1 ? 0xb5532e : m.userData.bvOrig);
    }
    for (const [p, v] of Object.entries(parts)) {
      const col = v.level >= 0 ? LEVEL_COLORS[LEVELS[v.level]] : "#9aa8b6";
      if (v.level <= 0 && !v.pending) continue;   // nothing to show for "none"
      for (const [pos, rad] of anchor(p)) {
        const s = glowSprite(v.level >= 0 ? col : "rgba(154,168,182,0.6)");
        s.position.copy(pos); s.scale.setScalar(rad * (v.level >= 0 ? 3.2 : 2.2));
        s.userData.pulse = v.level >= 3; s.userData.base = s.scale.x;
        root.add(s); markers.push(s);
      }
    }
    // the list beside the picture
    const rows = Object.entries(parts).sort((a, b) => b[1].level - a[1].level).map(([p, v]) => {
      const lv = v.level >= 0 ? LEVELS[v.level] : null;
      const items = v.items.map((it) => `<div class="bvItem ${it.done ? "" : "pending"}">${it.done ? `<span class="level lv-${it.e.level}">${it.e.level}</span>` : `<span class="tl-pending">not yet</span>`}
        ${esc(it.e.name)}${it.onset != null ? ` <span class="when">${it.done ? "at" : "arrives"} ${fmt(it.onset)}</span>` : ""}</div>`).join("");
      return `<div class="bvPart"><div class="bvPartName"><span class="dot" style="background:${lv ? LEVEL_COLORS[lv] : "#9aa8b6"}"></span>${PART_NAMES[p] || p}</div>${items}</div>`;
    }).join("");
    panel.querySelector(".bvList").innerHTML = rows || `<p class="help">No injuries assessed.</p>`;
  }

  function loop() {
    raf = location.search.includes("pump") ? setTimeout(loop, 33) : requestAnimationFrame(loop);
    const w = host.clientWidth, h = host.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const k = 1 + 0.15 * Math.sin(performance.now() / 220);
    for (const m of markers) if (m.userData.pulse) m.scale.setScalar(m.userData.base * k);
    controls.update();
    renderer.render(scene, camera);
  }

  function open(newId) {
    id = newId; panel.hidden = false; controls.autoRotate = true;
    build(); refresh();
    cancelAnimationFrame(raf); clearTimeout(raf); loop();
  }
  function close() { panel.hidden = true; id = null; cancelAnimationFrame(raf); clearTimeout(raf); onClose?.(); }
  return { open, close, refresh, get openId() { return panel.hidden ? null : id; } };
}

function fmt(t) {
  if (!(t > 0)) return "0 s";
  const p = (v) => +v.toPrecision(v < 10 ? 2 : 3);
  if (t < 1e-3) return `${p(t * 1e6)} µs`;
  if (t < 1) return `${p(t * 1e3)} ms`;
  if (t < 60) return `${p(t)} s`;
  if (t < 3600) return `${p(t / 60)} min`;
  if (t < 86400) return `${p(t / 3600)} h`;
  return `${p(t / 86400)} days`;
}
