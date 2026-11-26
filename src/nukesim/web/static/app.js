// nukesim 3D interface.
// The browser only draws things and sends the scenario to the local Python server
// (server.py), which runs the tested simulator code and sends results back.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { initTimeline } from "./timeline.js";   // time slider (see timeline.js)
import { makeModel } from "./models.js";
import { setBase, pose } from "./reactions.js";
import { createBodyView } from "./bodyview.js";
import { initSimple } from "./simple.js";
import { createDive } from "./dive.js";
import { createSound } from "./sound.js";
import { loadHumans, tickHumans } from "./humans.js";
import { loadAnimals, tickAnimals } from "./animals.js";
import { callApi, startPhysics, physicsState } from "./physics.js";

// The rigged people and the artist-made animals and ships (about 2 MB) load in the background, so the page
// appears at once; until they arrive the simple code-built models are used, then everything is rebuilt.
const modelsReady = Promise.all([loadHumans(), loadAnimals()]).then(() => {
  buildReceivers();
  realistic?.rebuildReceivers();
});
import { fmtTime } from "./timeline.js";
import { SPECIES, speciesOf, speciesIn, GROUPS, iconOf } from "./species.js";
import { icon, fillIcons } from "./icons.js";
fillIcons();   // the icons written into index.html as <i data-icon="…">
import { initRealistic } from "./realistic.js";   // realistic view (see realistic.js)
import { createFreecam, createCameraTween } from "./freecam.js";   // WASD free camera, smooth camera moves
import { units, setSystem, readInput, writeInput, fmtLen, fmtDepth, chartUnits } from "./units.js";
import { store, toast, attachMenu, closeMenus, openModal, closeModal, anyModalOpen, askText, download, runTour, esc } from "./ui.js";

// ---------------------------------------------------------------- talking to the physics (server, or this browser: physics.js)
startPhysics();   // on the static website: start loading Python and the physics now, in the background
async function api(path, body) {
  const { ok, data } = await callApi(path, body);
  if (!ok) {
    let msg = typeof data.detail === "string" ? data.detail
      : Array.isArray(data.detail) ? data.detail.map((d) => `${(d.loc || []).slice(1).join(" › ")}: ${d.msg}`).join("; ") : "the server could not handle this request";
    // a choice the server does not recognise usually means the server is older than this page
    if (/Input should be/.test(msg)) msg = `${SERVER_OLD} (Details: ${msg})`;
    throw new Error(msg);
  }
  return data;
}

const SERVER_OLD = 'The app\u2019s server is running older code than this page. Restart it: stop it with Ctrl+C, then run "uv run nukesim-web" again.';

// ---------------------------------------------------------------- state
const LEVEL_COLORS = { none: "#6fbf73", possible: "#e6cf5a", likely: "#f0a23c", severe: "#e2552c", lethal: "#a51818" };
const LEVELS = ["none", "possible", "likely", "severe", "lethal"];
const PRESETS = SPECIES;   // what you can add (species.js)
const onSurface = (r) => r.kind === "person" || r.kind === "ship";   // on (or in) a boat, not in the water
const state = { receivers: [], selected: null, results: {}, nextId: 1, overlay: null };
let timeline = null;   // set up near the end (timeline.js)
const $ = (id) => document.getElementById(id);

function scenario() {
  const y = parseFloat($("yield").value) * parseFloat($("yieldUnit").value);
  const d = readInput($("burstDist")) || 0;
  return {
    burst: {
      yield_kt: y,
      z_m: $("side").value === "above" ? d : -d,
      fission_fraction: Math.min(Math.max(parseFloat($("fission").value) / 100, 0.01), 1),
      wind_mph: readInput($("wind")) || 15,
    },
    env: { water_depth_m: $("deepOcean").checked ? null : readInput($("waterDepth")),
      visibility: $("visibility").value, overcast: $("overcast").checked, night: $("timeOfDay").value === "night" },
  };
}
const view = () => ({ R: (readInput($("maxRange")) || 3) * 1000, D: readInput($("maxDepth")) || 100, s: parseFloat($("stretch").value) });

// Scene units: 1 unit = 1 km horizontally. The water is drawn so that the depth
// shown takes up a chosen percentage of the distance shown (slider); heights above
// the water are not stretched.
const waterScale = () => { const { R, D, s } = view(); return ((R / 1000) * (s / 100)) / D; };   // scene units per metre of depth
const toY = (z_m) => (z_m < 0 ? z_m * waterScale() : z_m / 1000);
const fromY = (y) => (y < 0 ? y / waterScale() : y * 1000);

// ---------------------------------------------------------------- three.js scene
const host = $("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
const QUALITY = { high: 2, balanced: 1.35, low: 1 };
const applyQuality = (q) => { renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[q] || 2)); resize(); };
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = (() => {   // soft vertical gradient behind the technical view
  const c = document.createElement("canvas"); c.width = 2; c.height = 256;
  const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#16263a"); grad.addColorStop(0.55, "#0e1825"); grad.addColorStop(1, "#070c12");
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const techTween = createCameraTween(camera, controls);
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2a3a, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 10, 6);
scene.add(sun);

const staticGroup = new THREE.Group();
const receiverGroup = new THREE.Group();
scene.add(staticGroup, receiverGroup);
let cutaway = null;

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (realistic) realistic.resize(w, h);
}
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(host);

function clearGroup(g) {
  while (g.children.length) {
    const c = g.children.pop();
    c.geometry?.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
  }
}

function textSprite(text, color = "#e3ebf3") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.font = "600 52px -apple-system, Segoe UI, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 10; g.strokeStyle = "rgba(7,12,18,0.85)"; g.strokeText(text, 256, 64);
  g.fillStyle = color; g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.5, 0.125, 1);
  s.renderOrder = 5;
  return s;
}

let info = null;
function buildStatic() {
  clearGroup(staticGroup);
  const { R, D, s } = view();
  const Rk = R / 1000, depthY = toY(-D);
  const sc = scenario();

  // sea surface (both sides of the burst, so the 3D scene reads as an ocean)
  const surf = new THREE.Mesh(new THREE.CircleGeometry(Rk * 1.15, 96),
    new THREE.MeshStandardMaterial({ color: 0x2d77a8, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  surf.rotation.x = -Math.PI / 2;
  staticGroup.add(surf);
  // distance rings around ground zero (every quarter of the distance shown)
  for (let i = 1; i <= 4; i++) {
    const r = (Rk * i) / 4;
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(r - Rk * 0.0015, r + Rk * 0.0015, 160),
      new THREE.MeshBasicMaterial({ color: 0x5fb4ea, transparent: true, opacity: i === 4 ? 0.55 : 0.3, side: THREE.DoubleSide, depthWrite: false }));
    ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.y = 0.0005;
    staticGroup.add(ringMesh);
  }
  const cross = new THREE.Mesh(new THREE.RingGeometry(0, Rk * 0.01, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  cross.rotation.x = -Math.PI / 2; cross.position.y = 0.0006;
  staticGroup.add(cross);

  // cut-away plane: distance (x >= 0) vs depth, where receivers live and overlays are drawn
  cutaway = new THREE.Mesh(new THREE.PlaneGeometry(Rk, -depthY),
    new THREE.MeshBasicMaterial({ color: 0x1b5f8c, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(Rk, -depthY)), new THREE.LineBasicMaterial({ color: 0x5fb4ea, transparent: true, opacity: 0.6 }));
  edge.position.set(Rk / 2, depthY / 2, 0);
  staticGroup.add(edge);
  cutaway.position.set(Rk / 2, depthY / 2, 0);
  staticGroup.add(cutaway);
  if (state.overlay) applyOverlayTexture();

  // sea floor
  const wd = sc.env.water_depth_m;
  if (wd && wd <= D) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * Rk, 2 * Rk),
      new THREE.MeshStandardMaterial({ color: 0x7a6548, roughness: 0.95, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = toY(-wd);
    staticGroup.add(floor);
  }

  // burst and fireball
  const bz = sc.burst.z_m;
  const burst = new THREE.Mesh(new THREE.SphereGeometry(Rk * 0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  burst.position.set(0, toY(bz), 0);
  staticGroup.add(burst);
  if (info && info.fireball_radius_m) {
    const r = info.fireball_radius_m / 1000;
    // fireball in the air: only the part above the water surface is drawn
    const cut = Math.min(Math.max(toY(bz) / r, -1), 1);
    const fb = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.acos(-cut)),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.35, depthWrite: false }));
    fb.position.copy(burst.position);
    fb.userData.role = "fireball";   // the timeline hides this and draws a growing one
    staticGroup.add(fb);
  }

  // labels: distances along the cut-away, and depths
  for (let i = 0; i <= 4; i++) {
    const x = (Rk * i) / 4;
    const l = textSprite(fmtLen(x * 1000));
    l.position.set(x, 0.08, 0.02);
    l.scale.multiplyScalar(Rk / 2.5);
    staticGroup.add(l);
  }
  for (let i = 1; i <= 4; i++) {
    const z = -(D * i) / 4;
    const l = textSprite(`${fmtDepth(-z)} deep`, "#8ea2b5");
    l.position.set(-Rk * 0.06, toY(z), 0.02);
    l.scale.multiplyScalar(Rk / 2.5);
    staticGroup.add(l);
  }
}

function receiverMesh(r) {
  const { R } = view();
  const big = r.kind === "mammal" && (r.preset === "whale" || (r.mass_kg ?? 0) > 1000);
  const size = (R / 1000) * (r.kind === "ship" ? 0.1 : big ? 0.07 : onSurface(r) ? 0.06 : 0.045);   // icon size, not to scale
  const color = colorOf(r);
  const m = makeModel(r, color);
  m.scale.setScalar(size);
  m.userData.size = size;
  m.userData.floatTo = onSurface(r) ? null : toY(-0.3) - size * 0.15;
  m.rotation.y = Math.PI;   // face ground zero
  if (r.id === state.selected) m.material.emissive?.setHex(0x335577);
  m.position.set(r.x_m / 1000, toY(r.z_m) + (onSurface(r) ? size * 0.05 : 0), 0);
  m.userData.id = r.id;
  m.traverse((o) => { o.userData.id = r.id; });
  setBase(m);
  return m;
}

function buildReceivers() {
  clearGroup(receiverGroup);
  state.receivers.forEach((r) => receiverGroup.add(receiverMesh(r)));
  if (state.zones) renderZones();   // the rings drawn depend on what is in the sea
}

// technical-view camera presets (scene units: km)
function techPreset(name = "overview", instant = false) {
  const { R, D } = view();
  const Rk = R / 1000, dy = toY(-D);
  const bz = toY(scenario().burst.z_m), top = Math.max(bz, 0);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  const fit = Math.max(1, Math.pow(1.45 / camera.aspect, 0.6));   // step back on narrow screens so everything fits
  if (name === "side") { T.set(Rk * 0.5, (dy + top) * 0.5, 0); P.set(Rk * 0.5, (dy + top) * 0.5, (Rk * 1.45 + top) * fit); }
  else if (name === "top") { T.set(Rk * 0.5, 0, 0); P.set(Rk * 0.5, Rk * 1.9 + top, 0.001); }
  else if (name === "burst") { T.set(0, bz * 0.6, 0); P.set(Rk * 0.32, Rk * 0.16 + Math.abs(bz) * 0.6, Rk * 0.42 + Math.abs(bz)); }
  else { T.set(Rk * (fit > 1.05 ? 0.34 : 0.42), (dy + top) * 0.45, 0); P.set(Rk * 0.55, Rk * 0.4 + top * 0.5, Rk * 1.75 * fit + top); }
  techTween.to(P, T, 1.0, instant);
}
const frameCamera = (instant = true) => techPreset("overview", instant);

// ---------------------------------------------------------------- dragging receivers on the cut-away
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragging = null;
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}

renderer.domElement.addEventListener("pointerdown", (ev) => {
  pick(ev);
  if (mode !== "technical" || freecam.active) return;
  const hit = raycaster.intersectObjects(receiverGroup.children, true)[0];
  if (hit) {
    dragging = hit.object.userData.id;
    controls.enabled = false;
    select(dragging);
  }
});
renderer.domElement.addEventListener("pointermove", (ev) => {
  if (!dragging) return;
  pick(ev);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, p)) return;
  const r = state.receivers.find((x) => x.id === dragging);
  const { R, D } = view();
  r.x_m = Math.min(Math.max(p.x * 1000, 0), R);
  if (onSurface(r)) r.z_m = 2;
  else if (r.kind === "bird") r.z_m = Math.min(Math.max(fromY(p.y), 3), 500);
  else {
    const wd = scenario().env.water_depth_m;
    const maxDepth = Math.min(D, wd ? wd - 0.5 : D);
    r.z_m = Math.min(Math.max(fromY(p.y), -maxDepth), -0.3);
  }
  const mesh = receiverGroup.children.find((m) => m.userData.id === dragging);
  mesh.position.set(r.x_m / 1000, toY(r.z_m), 0);
  setBase(mesh);
  renderList();
});
// realistic view: a click (not a drag) on a pin or model selects it
let downAt = null;
renderer.domElement.addEventListener("pointerdown", (ev) => { downAt = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener("click", (ev) => {
  if (mode !== "realistic" || freecam.active || !downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const id = realistic.pick(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1));
  if (id) select(id);
});
renderer.domElement.addEventListener("pointermove", (ev) => {   // hand cursor over things you can click
  if (mode !== "realistic" || freecam.active || ev.buttons) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const id = realistic.pick(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1));
  renderer.domElement.style.cursor = id ? "pointer" : "";
});
window.addEventListener("pointerup", () => {
  if (dragging) { dragging = null; controls.enabled = true; scheduleAssess(); }
});

// ---------------------------------------------------------------- receivers list and report
function addReceiver(preset) {
  const p = speciesOf(preset);
  const id = `${preset}-${state.nextId++}`;
  const { R } = view();
  state.receivers.push({ id, preset, kind: p.kind, label: `${p.label} ${state.nextId - 1}`, icon: p.icon,
    x_m: R * (0.2 + 0.6 * Math.random()), y_m: 0, z_m: p.z_m, mass_kg: p.mass_kg ?? null,
    swim_bladder: p.swim_bladder ?? true, hearing_group: p.hearing_group ?? null, ship_type: p.ship_type ?? null });
  state.selected = id;
  buildReceivers(); renderList(); scheduleAssess();
}

function renderList() {
  const ul = $("receiverList");
  ul.innerHTML = "";
  for (const r of state.receivers) {
    const li = document.createElement("li");
    if (r.id === state.selected) li.className = "selected";
    const color = colorOf(r);
    const where = onSurface(r) ? (r.kind === "ship" ? "on the surface" : "on deck") : r.kind === "bird" ? `${fmtDepth(r.z_m)} up` : `${fmtDepth(-r.z_m)} deep`;
    li.innerHTML = `<div class="top"><span><span class="dot" style="background:${color}"></span>${icon(iconOf(r))} ${esc(r.label)}</span>
      <button class="del" title="Remove (Delete)">✕</button></div>
      <div class="hint">${fmtLen(r.x_m)} out, ${where}</div>`;
    {
      const props = document.createElement("div");
      props.className = "props";
      const sp = speciesOf(r.preset), same = sp ? speciesIn(sp.group) : [];
      const spSel = same.length > 1 ? `<label class="wide">${onSurface(r) ? "vessel" : "species"}<select class="spSel">${same.map(([k, x]) => `<option value="${k}" ${speciesOf(k) === sp ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>` : "";
      props.innerHTML = spSel + (onSurface(r) ? "" : `<label>mass (kg)<input class="massIn" type="number" min="0.001" step="any" value="${r.mass_kg ?? ""}"></label>`) +
        (r.kind === "fish" ? `<label class="check"><input class="sbIn" type="checkbox" ${r.swim_bladder ? "checked" : ""}> swim bladder</label>` : "") +
        (r.kind === "mammal" ? `<label>hearing<select class="hgSel">${["LF", "HF", "VHF", "PW", "OW"].map((g) => `<option ${g === r.hearing_group ? "selected" : ""}>${g}</option>`).join("")}</select></label>` : "");
      props.querySelector(".massIn")?.addEventListener("change", (e) => { r.mass_kg = parseFloat(e.target.value) || null; buildReceivers(); scheduleAssess(); });
      props.querySelector(".spSel")?.addEventListener("change", (e) => changeSpecies(r, e.target.value));
      props.querySelector(".sbIn")?.addEventListener("change", (e) => { r.swim_bladder = e.target.checked; scheduleAssess(); });
      props.querySelector(".hgSel")?.addEventListener("change", (e) => { r.hearing_group = e.target.value; scheduleAssess(); });
      props.addEventListener("click", (e) => e.stopPropagation());
      if (props.innerHTML.trim()) li.appendChild(props);
    }
    li.querySelector(".del").addEventListener("click", (e) => { e.stopPropagation(); removeReceiver(r.id); });
    li.addEventListener("click", () => select(r.id));
    ul.appendChild(li);
  }
}

// switch an animal to another species of the same group (keeps where it is)
function changeSpecies(r, key) {
  const p = SPECIES[key];
  const oldLabel = speciesOf(r.preset)?.label;
  Object.assign(r, { preset: key, kind: p.kind, icon: p.icon, mass_kg: p.mass_kg ?? null, swim_bladder: p.swim_bladder ?? true, hearing_group: p.hearing_group ?? null, ship_type: p.ship_type ?? null });
  if (oldLabel && r.label.startsWith(oldLabel)) r.label = p.label + r.label.slice(oldLabel.length);
  if (p.note) toast(p.note);
  buildReceivers(); renderList(); scheduleAssess();
  if (mode === "realistic") realistic.rebuildReceivers();
}

let lastRemoved = null;
function removeReceiver(id) {
  const i = state.receivers.findIndex((x) => x.id === id);
  if (i < 0) return;
  lastRemoved = { r: state.receivers[i], i };
  state.receivers.splice(i, 1);
  if (state.selected === id) state.selected = null;
  buildReceivers(); renderList(); renderReport(); if (mode === "realistic") realistic.rebuildReceivers();
  toast(`Removed ${lastRemoved.r.label}`, { action: { label: "Undo", fn: undoRemove } });
}
function undoRemove() {
  if (!lastRemoved) return false;
  state.receivers.splice(Math.min(lastRemoved.i, state.receivers.length), 0, lastRemoved.r);
  state.selected = lastRemoved.r.id; lastRemoved = null;
  buildReceivers(); renderList(); scheduleAssess();
  return true;
}

// Colour: the most likely outcome when uncertainty is shown, otherwise the single best-estimate outcome.
// ---- body view (bodyview.js)
let bodyView = null, dive = null;
function openBodyView(id) {
  bodyView ??= createBodyView({
    getReceiver: (x) => state.receivers.find((r) => r.id === x), getResult: (x) => state.results[x],
    getTimelineEntry: tlOf, getTime: () => timeline.getTime(), following: followTL,
  });
  bodyView.open(id);
}

// ---- what has happened so far (the timeline): used by the report, the list and the colours
const NOT_YET = "#9aa8b6";
const followTL = () => $("followTL").checked && !!timeline?.getData();
function tlOf(id) { return (timeline?.getData()?.receivers || []).find((x) => x.id === id) || null; }
function worstSoFar(id) {
  const rt = tlOf(id), t = timeline.getTime();
  if (!rt || rt.error) return undefined;
  let w = -1;
  for (const e of rt.effects || []) if (e.onset_s != null && e.onset_s <= t) w = Math.max(w, LEVELS.indexOf(e.level));
  return w >= 0 ? LEVELS[w] : null;   // null = nothing has reached it yet
}
function colorOf(r) {
  if (!followTL()) return levelColor(state.results[r.id]);
  const w = worstSoFar(r.id);
  return w === undefined ? levelColor(state.results[r.id]) : w === null ? NOT_YET : LEVEL_COLORS[w];
}
function statusKey() {   // changes whenever something visible in the report or list should change
  if (!followTL()) return "final";
  const t = timeline.getTime();
  return state.receivers.map((r) => { const rt = tlOf(r.id); return (rt?.effects || []).map((e) => (e.onset_s != null && e.onset_s <= t ? 1 : 0)).join(""); }).join("|");
}

function levelColor(res) {
  if (!res || !res.worst) return "#9aa8b6";
  return LEVEL_COLORS[res.uncertain ? res.uncertain.most_likely : res.worst];
}

function probBar(probs) {
  const segs = LEVELS.filter((l) => probs[l] > 0)
    .map((l) => `<div style="width:${(probs[l] * 100).toFixed(1)}%;background:${LEVEL_COLORS[l]}" title="${l} ${(probs[l] * 100).toFixed(0)}%"></div>`).join("");
  const text = LEVELS.filter((l) => probs[l] > 0).map((l) => `${l} ${(probs[l] * 100).toFixed(0)}%`).join(" · ");
  return `<div class="probbar">${segs}</div><div class="probtext">${text}</div>`;
}
const fmtNum = (v) => (v == null ? "–" : Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : +v.toPrecision(3));

function select(id) {
  state.selected = id;
  buildReceivers(); renderList(); renderReport(); loadFallout();   // (the realistic view recolours its pins by itself)
  if (bodyView?.openId && id) bodyView.open(id);
  document.querySelector("#receiverList li.selected")?.scrollIntoView({ block: "nearest" });
}


function renderReport() {
  const box = $("report");
  const r = state.receivers.find((x) => x.id === state.selected);
  if (!r) { box.innerHTML = ""; return; }
  const res = state.results[r.id];
  if (!res) { box.innerHTML = `<p class="hint">Calculating…</p>`; return; }
  if (res.error) { box.innerHTML = `<p class="error">${esc(res.error)}</p>`; return; }
  const u = res.uncertain;
  const expert = detail === "expert";
  const where = onSurface(r) ? (r.kind === "ship" ? "on the surface" : "on deck") : r.kind === "bird" ? `${fmtDepth(r.z_m)} up` : `${fmtDepth(-r.z_m)} deep`;
  const follow = followTL(), rt = follow ? tlOf(r.id) : null, t = timeline.getTime();
  const onset = (name) => rt?.effects?.find((x) => x.name === name)?.onset_s ?? null;
  const happened = (name) => !rt || (onset(name) != null && onset(name) <= t);
  const sofar = rt ? worstSoFar(r.id) : res.worst;
  let html = `<div class="summaryCard"><div class="big">${icon(iconOf(r))} ${esc(r.label)}</div>
    <div class="help">${fmtLen(r.x_m)} from ground zero, ${where}</div>
    <div style="margin-top:6px">${rt ? `At ${esc(fmtTime(t))}: ${sofar ? `<span class="level lv-${sofar}">${sofar}</span>` : `<span class="tl-pending">nothing yet</span>`}
      <span class="help inline">· in the end: <span class="level lv-${res.worst}">${res.worst}</span></span>`
      : `Worst effect: <span class="level lv-${res.worst}">${res.worst}</span>`}
    ${u ? ` · most likely: <span class="level lv-${u.most_likely}">${u.most_likely}</span>` : ""}</div>
    ${u ? `${probBar(u.level_probs)}<div class="help">chance of each worst outcome over ${u.n} runs</div>` : ""}
    <button class="bodyBtn" id="bodyBtn" title="See where on the body each injury is">${icon("bodyScan")} Body view</button></div>`;
  // in time order when following the timeline: an injury log
  const effects = rt ? [...res.effects].sort((a, b) => (onset(a.name) ?? 1e12) - (onset(b.name) ?? 1e12)) : res.effects;
  for (const e of effects) {
    const ue = u && u.effects.find((x) => x.name === e.name);
    const range = ue && ue.p05 != null ? `<div class="range">likely range (5–95%): ${fmtNum(ue.p05)} – ${fmtNum(ue.p95)} ${esc(ue.unit)}</div>${expert ? probBar(ue.level_probs) : ""}` : "";
    const on = onset(e.name), done = happened(e.name);
    const when = rt && on != null ? `<span class="when">${done ? "at" : "arrives at"} ${esc(fmtTime(on))}</span>` : "";
    html += `<div class="effect ${done ? "" : "pending"}">${done ? `<span class="level lv-${e.level}">${e.level}</span>` : `<span class="tl-pending">not yet</span>`} <b>${esc(e.name)}</b>${when}
      ${done ? `<div class="val">${esc(e.value)}</div>${range}` : ""}
      <div class="src">${expert ? `${esc(e.criterion)} · source: ${esc(e.source)}` : `threshold: ${esc(e.criterion)}`}</div></div>`;
  }
  if (res.long_term) {
    html += `<h3>Fallout over the following weeks</h3><ul class="notes">${res.long_term.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
    if (u && u.long_term && u.long_term.dose_gy && u.long_term.dose_gy.p95 > 0) {
      const d = u.long_term.dose_gy;
      html += `<div class="range">Fallout dose over the period, likely range (5–95%): ${fmtNum(d.p05)} – ${fmtNum(d.p95)} Gy (median ${fmtNum(d.p50)})</div>`;
    }
  }
  const notes = [...new Set([...(res.notes || []), ...((res.long_term && res.long_term.notes) || []), ...((u && u.notes) || [])])];
  if (notes.length) html += `<details ${expert ? "open" : ""}><summary>Assumptions &amp; warnings (${notes.length})</summary>
    <ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>`;
  box.innerHTML = html;
  $("bodyBtn")?.addEventListener("click", () => openBodyView(r.id));
  $("resultsHint").hidden = true;
}

// ---------------------------------------------------------------- calling the server
let assessTimer = null;
function scheduleAssess() { clearTimeout(assessTimer); assessTimer = setTimeout(runAssess, 250); }

async function runAssess() {
  const sc = scenario();
  if (!(sc.burst.yield_kt > 0)) return;
  setStatus("Calculating…", true);
  try {
    const unc = $("uncertainty").checked;
    const data = await api("/api/assess", { ...sc, uncertainty: unc, n_samples: parseInt($("nSamples").value) || 200, receivers: state.receivers.map(({ id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group, ship_type }) =>
      ({ id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group, ship_type })) });
    state.results = Object.fromEntries(data.receivers.map((x) => [x.id, x]));
    setStatus(`Up to date · ${state.receivers.length} in the sea`);
    if (mode === "realistic") realistic.rebuildReceivers();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    toast(`Could not calculate: ${err.message}`, { kind: "err" });
  }
  buildReceivers(); renderList(); renderReport(); loadFallout();
}

async function refreshScenario() {
  const sc = scenario();
  if (!(sc.burst.yield_kt > 0)) {
    setStatus("Enter a yield above zero.");
    $("burstInfo").innerHTML = "<b>No burst: the yield must be above zero.</b>";
    state.results = {}; buildReceivers(); renderList();
    $("report").innerHTML = `<p class="hint">No burst to assess.</p>`;
    return;
  }
  const wd = sc.env.water_depth_m;   // keep everything in the sea above the sea floor
  if (wd) state.receivers.forEach((r) => { if (r.kind !== "person" && -r.z_m > wd - 0.5) r.z_m = -Math.max(wd - 0.5, 0.3); });
  renderList();
  if (!(sc.burst.yield_kt > 0)) return;
  try {
    info = await api("/api/info", sc);
    renderBurstInfo();
    if (mode === "realistic" && !freecam.active) realistic.setPreset("aerial");
  } catch (err) { $("burstInfo").textContent = err.message; }
  state.overlay = null; $("legend").innerHTML = "";
  buildStatic(); buildReceivers(); scheduleAssess(); loadWaves(); loadZones();
}

function renderBurstInfo() {
  if (!info) return;
  const sc = scenario();
  const parts = [`<b>${esc(info.regime)}</b>`,
    info.fireball_radius_m ? `fireball radius about ${fmtLen(info.fireball_radius_m)}` : null,
    info.coupling != null ? `shock coupling into the water: ${(info.coupling * 100).toFixed(info.coupling < 0.1 ? 1 : 0)}%` : null,
    info.crater_radius_m ? `water crater about ${fmtLen(info.crater_radius_m)} radius, ${fmtDepth(info.crater_depth_m)} deep` : null,
    sc.burst.z_m >= 0 ? (info.local_fallout ? "local fallout: yes" : "local fallout: none (burst too high)") : null];
  $("burstInfo").innerHTML = parts.filter(Boolean).join("<br>");
}

// ---------------------------------------------------------------- danger distances (/api/zones)
const ZONE_RINGS = [   // which ones are drawn on the sea: [key, level, colour, label, icon]
  ["fish_bladder", "lethal", "#ff6b5a", "fish killed", "fish"],
  ["whale", "severe", "#f0a23c", "whales badly hurt", "whale"],
  ["person", "lethal", "#ffd166", "people on deck killed", "person"],
  ["destroyer", "severe", "#7cc7ff", "ships wrecked", "ship"],
];
async function loadZones() {
  state.zones = null; renderZones();
  try { state.zones = (await api("/api/zones", scenario())).kinds; } catch (_) { state.zones = null; }
  renderZones(); simple?.refresh();
}
function zoneRings() {
  if (!state.zones) return [];
  const by = Object.fromEntries(state.zones.map((z) => [z.key, z]));
  // only for what is actually in the sea (no "ships wrecked" ring when there are no ships)
  const kinds = new Set(state.receivers.map((r) => r.kind));
  const present = { fish_bladder: kinds.has("fish"), whale: kinds.has("mammal"), person: kinds.has("person") || kinds.has("ship"), destroyer: kinds.has("ship") };
  return ZONE_RINGS.filter(([k]) => present[k] ?? true).map(([k, lvl, color, text, ic]) => {
    const r = by[k]?.farthest_m?.[lvl];
    return r ? { r, color, icon: ic, text: `${text} within ${fmtLen(r)}` } : null;
  }).filter(Boolean);
}
function renderZones() {
  realistic?.setZones(prefs.zones ? zoneRings() : null);
  const box = $("zonesBox");
  if (!box) return;
  if (!state.zones) { box.innerHTML = `<p class="help">Working out the distances…</p>`; return; }
  const lv = ["lethal", "severe", "likely", "possible"];
  box.innerHTML = `<table class="zones"><tr><th></th>${lv.map((l) => `<th><span class="level lv-${l}">${l}</span></th>`).join("")}</tr>` +
    state.zones.map((z) => `<tr><td>${esc(z.label)}</td>${lv.map((l) => `<td>${z.farthest_m[l] ? fmtLen(z.farthest_m[l]) : "–"}</td>`).join("")}</tr>`).join("") +
    `</table><p class="help">Farthest distance at which each level still happens (same injury models as the reports; ships: the hull).</p>`;
}

// ---------------------------------------------------------------- overlays
function colormap(t) {   // simple dark-blue -> yellow scale
  const stops = [[13, 8, 135], [126, 3, 168], [204, 71, 120], [248, 149, 64], [240, 249, 33]];
  t = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2), f = t - i;
  return stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
}

async function computeOverlay() {
  const kind = $("overlay").value;
  if (kind === "none") { state.overlay = null; $("legend").innerHTML = ""; buildStatic(); return; }
  const { R, D } = view();
  setStatus("Computing overlay (can take a few seconds)…", true);
  try {
    const data = await api("/api/field", { ...scenario(), kind, zones_kind: $("zonesKind").value, max_range_m: R, max_depth_m: D, nr: 48, nd: 30 });
    state.overlay = { kind, data };
    buildStatic(); buildReceivers();
    setStatus(data.message || "Overlay ready");
  } catch (err) { setStatus(`Error: ${err.message}`); toast(err.message, { kind: "err" }); }
}

function applyOverlayTexture() {
  const { kind, data } = state.overlay;
  const nr = data.ranges_m.length, nd = data.depths_m.length;
  const c = document.createElement("canvas");
  c.width = nr; c.height = nd;
  const g = c.getContext("2d");
  const img = g.createImageData(nr, nd);
  const flat = data.values.flat().filter((v) => v != null && v > 0);
  const hi = flat.length ? Math.log10(Math.max(...flat)) : 1;
  // show at most 6 powers of ten below the maximum, otherwise tiny values flatten the colours
  const lo = flat.length ? Math.max(Math.log10(Math.max(Math.min(...flat), 1e-300)), hi - 6) : 0;
  for (let i = 0; i < nd; i++) for (let j = 0; j < nr; j++) {
    const v = data.values[i][j];
    let rgb = [40, 40, 40];
    if (kind === "zones") rgb = v == null ? rgb : hexToRgb(LEVEL_COLORS[LEVELS[v]]);
    else if (v != null && v > 0) rgb = colormap((Math.log10(v) - lo) / Math.max(hi - lo, 1e-9));
    const k = 4 * (i * nr + j);
    img.data.set([...rgb, 230], k);
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = kind === "zones" ? THREE.NearestFilter : THREE.LinearFilter;   // canvas row 0 = shallowest = top
  cutaway.material.dispose();
  cutaway.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  // legend
  if (kind === "zones") {
    $("legend").innerHTML = LEVELS.map((l) => `<span class="level lv-${l}">${l}</span>`).join(" ");
  } else {
    const grad = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${colormap(t).join(",")})`).join(",");
    $("legend").innerHTML = `${esc(data.unit)}<div class="bar" style="background:linear-gradient(90deg,${grad})"></div>
      <span>${(10 ** lo).toPrecision(2)}</span><span style="float:right">${(10 ** hi).toPrecision(2)}</span>`;
  }
}
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------------------------------------------------------------- charts (plain canvas)
function chart(canvas, series, { xlabel, ylabel, logx = true, logy = true }) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, L = 46, B = 30, T = 10, Rr = 10;
  g.clearRect(0, 0, W, H);
  const pts = series.flatMap((s) => s.x.map((x, i) => [x, s.y[i]])).filter(([x, y]) => x > 0 && y > 0 && isFinite(y));
  if (!pts.length) { g.fillStyle = "#8ea2b5"; g.fillText("no data", W / 2 - 20, H / 2); return; }
  const fx = logx ? Math.log10 : (v) => v, fy = logy ? Math.log10 : (v) => v;
  const xs = pts.map((p) => fx(p[0])), ys = pts.map((p) => fy(p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys) + 1e-9;
  const X = (v) => L + ((fx(v) - x0) / (x1 - x0 || 1)) * (W - L - Rr);
  const Y = (v) => H - B - ((fy(v) - y0) / (y1 - y0 || 1)) * (H - B - T);
  g.strokeStyle = "#2a3a4a"; g.fillStyle = "#8ea2b5"; g.font = "10px sans-serif";
  g.strokeRect(L, T, W - L - Rr, H - B - T);
  g.fillText(xlabel, L + 4, H - 6);
  g.save(); g.translate(10, H - B); g.rotate(-Math.PI / 2); g.fillText(ylabel, 0, 0); g.restore();
  const fmt = (v) => (Math.abs(v) >= 1000 || Math.abs(v) < 0.01 ? v.toExponential(0) : +v.toPrecision(2));
  g.fillText(fmt(logy ? 10 ** y0 : y0), 2, H - B); g.fillText(fmt(logy ? 10 ** y1 : y1), 2, T + 8);
  g.fillText(fmt(logx ? 10 ** x0 : x0), L, H - B + 12); g.fillText(fmt(logx ? 10 ** x1 : x1), W - Rr - 30, H - B + 12);
  for (const s of series) {
    g.strokeStyle = s.color; g.lineWidth = s.width || 1.5; g.setLineDash(s.dash || []);
    g.beginPath();
    let first = true;
    s.x.forEach((x, i) => {
      const y = s.y[i];
      if (!(x > 0 && y > 0 && isFinite(y))) { first = true; return; }
      first ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y));
      first = false;
    });
    g.stroke();
  }
  g.setLineDash([]);
}

async function loadWaves() {
  try {
    const d = await api("/api/waves", { ...scenario(), max_range_m: 100000 });
    const cu = chartUnits(), km = d.ranges_m.map((r) => (r / 1000) * cu.dist), h = (a) => a.map((v) => v * cu.height);
    chart($("waveChart"), [{ x: km, y: h(d.high_m), color: "#4fa3d9" }, { x: km, y: h(d.low_m), color: "#4fa3d9", dash: [4, 3] }],
      { xlabel: `distance (${cu.distLabel})`, ylabel: `wave height (${cu.heightLabel})` });
    $("waveInfo").textContent = d.regime.startsWith("air")
      ? "Air burst: the fireball doesn't reach the water, so waves are negligible."
      : `${d.regime}: solid = upper, dashed = lower estimate. Period about ${Math.round(d.period_s)} s, wavelength about ${fmtLen(d.wavelength_m)}.`;
  } catch (err) { $("waveInfo").textContent = err.message; }
}

async function loadFallout() {
  const r = state.receivers.find((x) => x.id === state.selected);
  const sc = scenario();
  const canvas = $("falloutChart");
  if (!r || sc.burst.z_m < 0 || !info || !info.local_fallout) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    $("falloutInfo").textContent = !info || !info.local_fallout ? "No local fallout for this burst." : "Select something in the sea.";
    return;
  }
  try {
    const { id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group, ship_type } = r;
    const d = await api("/api/fallout", { ...sc, receiver: { id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group, ship_type }, days: 30 });
    const days = d.times_h.map((t) => t / 24);
    const series = [{ x: days, y: d.total_high_ugy_h, color: "#f0a23c" }, { x: days, y: d.total_low_ugy_h, color: "#f0a23c", dash: [4, 3] }];
    if (d.internal_high_ugy_h) series.push({ x: days, y: d.internal_high_ugy_h, color: "#e2552c", width: 1 });
    chart(canvas, series, { xlabel: "days after the burst", ylabel: "dose rate (µGy/h)" });
    $("falloutInfo").textContent = d.findings.join(" ");
  } catch (err) { $("falloutInfo").textContent = err.message; }
}

// ---------------------------------------------------------------- wiring
// "add" buttons: one per group; groups with several species open a list to choose from
(function buildAddButtons() {
  const box = $("addButtons");
  box.innerHTML = "";
  for (const gr of GROUPS) {
    const list = speciesIn(gr.key), b = document.createElement("button");
    b.innerHTML = `${icon(gr.icon)} ${gr.label}${list.length > 1 ? " ▾" : ""}`;
    b.title = list.length > 1 ? `Add: ${list.map(([, x]) => x.label).join(", ")}` : `Add a ${gr.label.toLowerCase()}`;
    box.appendChild(b);
    if (list.length > 1) attachMenu(b, () => list.map(([k, x]) => ({ icon: icon(x.icon), label: `${x.label}`, kbd: x.mass_kg ? (x.mass_kg >= 1000 ? `${x.mass_kg / 1000} t` : `${x.mass_kg} kg`) : "", action: () => addReceiver(k) })));
    else b.addEventListener("click", () => addReceiver(list[0][0]));
  }
})();
const conditions = () => ({ tod: $("timeOfDay").value, visibility: $("visibility").value, overcast: $("overcast").checked, place: $("place").value });
$("place").addEventListener("change", () => setPlace($("place").value, true));
// a real place: drawn around the burst; Bikini also sets the water depth to the BAKER site's
function setPlace(name, announce = false) {
  $("place").value = name;
  realistic.setPlace(name);
  if (name === "bikini") {
    $("deepOcean").checked = false; $("waterDepth").disabled = false; writeInput($("waterDepth"), 55);
    if (announce) toast("Bikini Atoll: water depth set to 55 m, the depth at the BAKER site. The physics uses this depth everywhere; the reef and islands are only drawn.");
  }
  if (announce) refreshScenario();
}
["timeOfDay", "visibility", "overcast"].forEach((id) => $(id).addEventListener("change", () => { realistic.setConditions(conditions()); refreshScenario(); }));
["yield", "yieldUnit", "side", "burstDist", "fission", "wind", "waterDepth"].forEach((id) => $(id).addEventListener("change", () => { $("presetSel").value = ""; refreshScenario(); }));
$("deepOcean").addEventListener("change", () => { $("waterDepth").disabled = $("deepOcean").checked; refreshScenario(); });
["maxRange", "maxDepth"].forEach((id) => $(id).addEventListener("change", () => { state.overlay = null; $("legend").innerHTML = ""; buildStatic(); buildReceivers(); frameCamera(); }));
$("stretch").addEventListener("input", () => { $("stretchVal").textContent = `${$("stretch").value}%`; buildStatic(); buildReceivers(); });
$("overlay").addEventListener("change", () => { $("zonesKindLabel").hidden = $("overlay").value !== "zones"; });
$("computeOverlay").addEventListener("click", computeOverlay);
$("uncertainty").addEventListener("change", scheduleAssess);
$("nSamples").addEventListener("change", scheduleAssess);

// ---------------------------------------------------------------- status pill
function setStatus(text, busy = false) {
  $("status").querySelector(".txt").textContent = text;
  $("status").classList.toggle("busy", busy);
}

// ---------------------------------------------------------------- preferences (this browser only)
const firstVisit = !store.get("prefs", null);
const smallScreen = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
const prefs = Object.assign({ units: "metric", quality: "high", autoPlay: true, pins: true, hideLeft: false, hideRight: false, lw: null, rw: null, detail: "simple", reactions: true, followTL: true, classicBasic: false, bigWaves: false, zones: false, schools: true,
  calm: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches },
  store.get("prefs", {}));
const savePrefs = () => store.set("prefs", prefs);
if (firstVisit && smallScreen) {   // phones and tablets: lighter graphics, more room for the 3D view
  prefs.quality = "low"; prefs.hideLeft = true; prefs.hideRight = true;
}

// ---------------------------------------------------------------- view mode, detail level, camera bar
let mode = "technical", detail = "basic", realistic = null, simple = null;
const sound = createSound();
function toggleMute() {
  sound.setMuted(!sound.muted);
  $("muteBtn").innerHTML = icon(sound.muted ? "soundOff" : "soundOn");
  toast(sound.muted ? "Sound off" : "Sound on");
}
$("muteBtn").addEventListener("click", toggleMute);
$("muteBtn").innerHTML = icon(sound.muted ? "soundOff" : "soundOn");

// Simple mode puts a whole scene together from its three choices
function simpleSetup({ kt, z_m, items }) {
  const mt = kt >= 1000;
  $("yield").value = mt ? kt / 1000 : kt; $("yieldUnit").value = mt ? "1000" : "1";
  $("side").value = z_m < 0 ? "below" : "above"; writeInput($("burstDist"), Math.abs(z_m));
  $("deepOcean").checked = true; $("waterDepth").disabled = true;
  $("presetSel").value = ""; setPlace("open");
  state.receivers = []; state.results = {}; state.nextId = 1; state.selected = null;
  for (const it of items) {
    addReceiver(it.key);
    const r = state.receivers[state.receivers.length - 1];
    r.x_m = it.x; r.y_m = 0; r.z_m = onSurface(r) ? 2 : it.z;
  }
  state.selected = state.receivers[0]?.id ?? null;
  writeInput($("maxRange"), Math.max(...items.map((i) => i.x)) * 1.25 / 1000);
  writeInput($("maxDepth"), Math.max(50, ...items.map((i) => -i.z + 10)));
  buildReceivers(); renderList(); refreshScenario();
  realistic.rebuildReceivers();
}

const CAMS = {
  technical: [["overview", "Overview"], ["side", "Side-on"], ["top", "Top-down"], ["burst", "Burst close-up"]],
  realistic: [["aerial", "Aerial"], ["side", "Side"], ["boat", "From a boat"], ["far", "Far away"], ["under", "Underwater"]],
};
function buildCamBar() {
  const list = CAMS[mode];
  $("camBar").innerHTML = `<span class="lbl">Camera</span>` +
    list.map(([k, l], i) => `<button data-cam="${k}" title="${l} (${i + 1})">${l}</button>`).join("") +
    `<button data-cam="free" class="free" title="Fly freely with W A S D and the mouse (F)">${icon("plane")} Free <kbd>F</kbd></button>` +
    `<button class="lookMenu" title="Point the camera at one animal, person or boat">${icon("eye")} Look at ▾</button>`;
  $("camBar").querySelectorAll("button[data-cam]").forEach((b) => b.addEventListener("click", () => { simple?.lockCamera(); setCam(b.dataset.cam); }));
  attachMenu($("camBar").querySelector(".lookMenu"), () => state.receivers.length
    ? [...state.receivers.map((r) => ({ icon: icon(iconOf(r)), label: r.label, action: () => lookAtReceiver(r.id) })),
      ...(mode === "realistic" && prefs.schools ? ["-", { icon: icon("school"), label: "School of fish (edge of the killing zone)", action: () => { stopFree(false); simple?.lockCamera(); currentCam = "school"; realistic.setPreset("school", false, { i: 2 }); markCam(); } }] : [])]
    : [{ label: "Nothing in the sea yet", disabled: true, action: () => {} }]);
  markCam();
}
let currentCam = "overview";
function markCam() {
  $("camBar").querySelectorAll("button").forEach((b) => b.classList.toggle("on", freecam.active ? b.dataset.cam === "free" : b.dataset.cam === currentCam));
}
function setCam(name) {
  if (name === "free") { freecam.active ? stopFree() : startFree(); return; }
  if (freecam.active) stopFree(false);
  currentCam = name;
  if (mode === "realistic") realistic.setPreset(name); else techPreset(name);
  markCam();
}

// point the camera at one thing in the sea (and select it)
function lookAtReceiver(id) {
  const r = state.receivers.find((x) => x.id === id);
  if (!r) return;
  stopFree(false);
  simple?.lockCamera();
  currentCam = "focus";
  if (mode === "realistic") realistic.setPreset("focus", false, { id });
  else {
    const T = new THREE.Vector3(r.x_m / 1000, toY(r.z_m), 0), d = view().R / 1000 * 0.14;
    techTween.to(new THREE.Vector3(T.x + d * 0.5, T.y + d * 0.35, d * 1.3), T, 1.0);
  }
  markCam();
  if (state.selected !== id) select(id);
}

// ---------------------------------------------------------------- free camera
const freecam = createFreecam({ dom: renderer.domElement, onChange: updateFlyHint });
function activeCam() { return mode === "realistic" ? realistic.camera : camera; }
function activeControls() { return mode === "realistic" ? realistic.controls : controls; }
function startFree() {
  simple?.lockCamera();
  activeControls().enabled = false;
  (mode === "realistic" ? realistic.tween : techTween).cancel();
  const speed = mode === "realistic"
    ? (p) => Math.max(10, Math.abs(p.y) * 0.25)                 // metres per second, faster when high up
    : (p) => Math.max(view().R / 1000 * 0.15, Math.abs(p.y) * 0.4);   // km per second
  freecam.enable(activeCam(), speed);
  markCam();
}
function stopFree(keepView = true) {
  if (!freecam.active) return;
  const cam = activeCam(), c = activeControls();
  freecam.disable();
  if (keepView) {   // hand the camera back to the orbit controls, looking where it was looking
    const dist = mode === "realistic" ? Math.max(150, Math.abs(cam.position.y)) : view().R / 1000 * 0.4;
    c.target.copy(freecam.lookPoint(dist));
  }
  c.enabled = true; c.update();
  markCam();
}
function updateFlyHint() {
  const h = $("flyHint");
  h.hidden = !freecam.active;
  if (!freecam.active) return;
  h.innerHTML = freecam.locked
    ? `<b>Free camera</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>E</kbd>/<kbd>Q</kbd> up/down · <kbd>Shift</kbd> faster · wheel: speed ×${freecam.speed.toPrecision(2)} · <kbd>Esc</kbd> release mouse`
    : `<b>Free camera</b> · click the scene to look around · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> still move · <kbd>F</kbd> to leave`;
  markCam();
}

function setMode(m) {
  if (m === mode && realistic) { buildCamBar(); return; }
  stopFree(false);
  mode = m;
  document.querySelectorAll("#viewSeg button").forEach((b) => b.classList.toggle("on", b.dataset.view === m));
  const real = m === "realistic";
  document.body.classList.toggle("real", real);
  $("techViewBox").hidden = real;
  controls.enabled = !real;
  realistic.setActive(real);
  renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = real ? 0.5 : 1;
  currentCam = real ? "aerial" : "overview";
  buildCamBar();
  if (real) {
    realistic.setPreset("aerial", true);
    if (prefs.autoPlay && detail !== "simple" && timeline.isAtEnd()) { timeline.setTime(0); timeline.play(); }   // start the show from the flash
  }
}

// Detail levels: "simple" (for anyone: start screen, film, plain words), "expert" (everything), and the
// older "basic" level (the standard panels with plain labels), kept and shown only if switched on in Settings.
function setDetail(d) {
  if (d === "basic" && !prefs.classicBasic) d = "simple";
  const wasSimple = detail === "simple";
  detail = d; prefs.detail = d; savePrefs();
  document.body.classList.toggle("simple", d === "simple");
  document.body.classList.toggle("basic", d === "basic");
  document.body.classList.toggle("expert", d === "expert");
  document.querySelectorAll("#detailSeg button").forEach((b) => b.classList.toggle("on", b.dataset.detail === d));
  document.querySelectorAll("[data-basic]").forEach((el) => { el.textContent = el.dataset[d === "expert" ? "expert" : "basic"]; });
  if (d === "simple") {
    setMode("realistic");
    if (simple && simple.state !== "film" && simple.state !== "results") simple.show("start");
  } else if (wasSimple && simple) { simple.show("none"); bodyView?.close(); }
  resize();
  renderReport();
}

// ---------------------------------------------------------------- example scenarios
const SCENARIOS = {
  hiroshima:  { yield: 15, unit: 1, side: "above", dist: 580, deep: true, range: 3, depth: 100 },
  baker:      { yield: 23, unit: 1, side: "below", dist: 27, deep: false, water: 55, range: 3, depth: 55 },
  surface1mt: { yield: 1, unit: 1000, side: "above", dist: 0, deep: true, range: 20, depth: 200 },
  air1mt:     { yield: 1, unit: 1000, side: "above", dist: 2000, deep: true, range: 10, depth: 100 },
  deep:       { yield: 100, unit: 1, side: "below", dist: 300, deep: true, range: 5, depth: 500 },
};
function applyScenario(key) {
  const s = SCENARIOS[key];
  if (!s) return;
  $("yield").value = s.yield; $("yieldUnit").value = s.unit; $("side").value = s.side; writeInput($("burstDist"), s.dist);
  $("deepOcean").checked = s.deep; $("waterDepth").disabled = s.deep; if (s.water) writeInput($("waterDepth"), s.water);
  writeInput($("maxRange"), s.range); writeInput($("maxDepth"), s.depth);
  // spread the existing things in the sea across the new distance shown
  state.receivers.forEach((r, i) => { r.x_m = s.range * 1000 * (0.25 + 0.6 * (i + 0.5) / Math.max(state.receivers.length, 1)); });
  if (mode === "technical") frameCamera(false);
  setPlace(key === "baker" ? "bikini" : "open");
  refreshScenario();
  timeline.setTime(0);
}

// ---------------------------------------------------------------- save, open and share
function serialize() {
  return {
    app: "nukesim", v: 1,
    burst: { yield: +$("yield").value, unit: +$("yieldUnit").value, side: $("side").value, dist_m: readInput($("burstDist")),
      wind_mph: readInput($("wind")), fission_pct: +$("fission").value },
    sea: { deep: $("deepOcean").checked, depth_m: readInput($("waterDepth")) },
    conditions: conditions(),
    view: { range_km: readInput($("maxRange")), depth_m: readInput($("maxDepth")), stretch: +$("stretch").value, mode, detail },
    uncertainty: $("uncertainty").checked, runs: +$("nSamples").value,
    receivers: state.receivers.map(({ preset, kind, label, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group }) =>
      ({ preset, kind, label, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group })),
    t_s: timeline.getTime(),
  };
}
const num = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.min(Math.max(+v, lo), hi) : d);
function applySaved(o) {
  if (!o || o.app !== "nukesim" || !o.burst) throw new Error("This is not a nukesim scenario file.");
  const b = o.burst, sea = o.sea || {}, v = o.view || {};
  $("yield").value = num(b.yield, 0.001, 1e6, 20); $("yieldUnit").value = b.unit === 1000 ? "1000" : "1";
  $("side").value = b.side === "below" ? "below" : "above";
  writeInput($("burstDist"), num(b.dist_m, 0, 1e5, 500)); writeInput($("wind"), num(b.wind_mph, 1, 120, 15));
  $("fission").value = num(b.fission_pct, 1, 100, 100);
  $("deepOcean").checked = sea.deep !== false; $("waterDepth").disabled = $("deepOcean").checked;
  writeInput($("waterDepth"), num(sea.depth_m, 1, 11000, 200));
  writeInput($("maxRange"), num(v.range_km, 0.1, 1000, 3)); writeInput($("maxDepth"), num(v.depth_m, 1, 11000, 100));
  $("stretch").value = num(v.stretch, 5, 100, 35); $("stretchVal").textContent = `${$("stretch").value}%`;
  $("uncertainty").checked = !!o.uncertainty; $("nSamples").value = num(o.runs, 20, 2000, 200);
  const cd = o.conditions || {};
  $("timeOfDay").value = ["day", "dawn", "dusk", "night"].includes(cd.tod) ? cd.tod : "day";
  $("visibility").value = [...$("visibility").options].some((x) => x.value === cd.visibility) ? cd.visibility : "exceptionally_clear";
  $("overcast").checked = !!cd.overcast;
  setPlace(cd.place === "bikini" ? "bikini" : "open");
  realistic.setConditions(conditions());
  state.receivers = []; state.results = {}; state.nextId = 1;
  for (const r of o.receivers || []) {
    const p = speciesOf(r.preset);
    if (!p) continue;
    const id = `${r.preset}-${state.nextId++}`;
    state.receivers.push({ id, preset: r.preset, kind: p.kind, label: String(r.label || `${p.label} ${state.nextId - 1}`).slice(0, 60), icon: p.icon,
      x_m: num(r.x_m, 0, 1e7, 1000), y_m: num(r.y_m, -1e7, 1e7, 0), z_m: (p.kind === "person" || p.kind === "ship") ? 2 : p.kind === "bird" ? num(r.z_m, 3, 500, p.z_m) : num(r.z_m, -11000, -0.3, p.z_m),
      mass_kg: r.mass_kg == null ? p.mass_kg ?? null : num(r.mass_kg, 0.001, 2e5, p.mass_kg ?? null),
      swim_bladder: r.swim_bladder !== false, hearing_group: ["LF", "HF", "VHF", "PW", "OW"].includes(r.hearing_group) ? r.hearing_group : p.hearing_group ?? null,
      ship_type: p.ship_type ?? null });
  }
  state.selected = state.receivers[0]?.id ?? null;
  $("presetSel").value = "";
  setDetail(v.detail === "expert" ? "expert" : "basic");
  setMode(v.mode === "realistic" ? "realistic" : "technical");
  if (mode === "technical") frameCamera(false);
  buildReceivers(); renderList(); refreshScenario();
  if (Number.isFinite(+o.t_s)) timeline.setTime(+o.t_s);
}

let currentName = null;
const savedList = () => store.get("saved", []);
async function saveAs() {
  const name = await askText("Save scenario as", currentName || defaultName());
  if (!name) return;
  const list = savedList().filter((x) => x.name !== name);
  list.unshift({ name, at: new Date().toISOString(), data: serialize() });
  if (store.set("saved", list.slice(0, 50))) { currentName = name; toast(`Saved "${name}"`, { kind: "ok" }); }
  else toast("This browser won't let the page store data. Use Export to file instead.", { kind: "err" });
}
function defaultName() {
  const y = +$("yield").value * +$("yieldUnit").value;
  return `${y >= 1000 ? `${+(y / 1000).toPrecision(3)} Mt` : `${y} kt`} ${$("side").value === "above" ? "above" : "below"} the sea`;
}
const b64 = { enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))) };
async function shareLink() {
  const url = `${location.origin}${location.pathname}#s=${b64.enc(JSON.stringify(serialize()))}`;
  try { await navigator.clipboard.writeText(url); toast("Link copied. Anyone who opens it sees this exact scenario.", { kind: "ok", ms: 5000 }); }
  catch (_) { await askText("Copy this link", url, "Close"); }
}
function exportFile() {
  download(`nukesim-${(currentName || defaultName()).replace(/[^\w.-]+/g, "_")}.json`, JSON.stringify(serialize(), null, 2));
  toast("Scenario file saved to your downloads", { kind: "ok" });
}
$("importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try { applySaved(JSON.parse(await f.text())); currentName = f.name.replace(/^nukesim-|\.json$/g, ""); toast(`Opened ${f.name}`, { kind: "ok" }); }
  catch (err) { toast(`Could not open that file: ${err.message}`, { kind: "err" }); }
});
function startOver() {
  applySaved({ app: "nukesim", burst: { yield: 20, unit: 1, side: "above", dist_m: 500, wind_mph: 15, fission_pct: 100 }, sea: { deep: true, depth_m: 200 },
    view: { range_km: 3, depth_m: 100, stretch: 35, mode, detail }, receivers: [{ preset: "fish", x_m: 1200, z_m: -10 }, { preset: "dolphin", x_m: 1800, z_m: -10 }, { preset: "boat", x_m: 2400 }] });
  currentName = null; timeline.setTime(0);
}

attachMenu($("saveBtn"), () => {
  const saved = savedList();
  return [
    { icon: icon("save"), label: "Save as…", kbd: "⌘S", action: saveAs },
    { icon: icon("link"), label: "Copy share link", action: shareLink },
    "-",
    { icon: "⤓", label: "Export to file (.json)", action: exportFile },
    { icon: icon("folder"), label: "Open file…", action: () => $("importFile").click() },
    { icon: icon("replay"), label: "Start over", action: startOver },
    "-",
    { html: saved.length ? `<div class="menuHead">Saved in this browser</div>` + saved.map((x, i) =>
        `<div class="savedRow" data-i="${i}"><button class="load" title="Open">${esc(x.name)}<small>${new Date(x.at).toLocaleString()}</small></button><button class="rm" title="Delete">✕</button></div>`).join("")
        : `<div class="menuHead">No saved scenarios yet</div>`,
      onMount(d) {
        d.querySelectorAll(".savedRow").forEach((row) => {
          const x = saved[+row.dataset.i];
          row.querySelector(".load").addEventListener("click", () => { closeMenus(); applySaved(x.data); currentName = x.name; toast(`Opened "${x.name}"`, { kind: "ok" }); });
          row.querySelector(".rm").addEventListener("click", (e) => {
            e.stopPropagation();
            store.set("saved", savedList().filter((y) => y.name !== x.name)); row.remove();
            toast(`Deleted "${x.name}"`, { action: { label: "Undo", fn: () => store.set("saved", [x, ...savedList()]) } });
          });
        });
      } },
  ];
});

// ---------------------------------------------------------------- export results
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
function screenshot() {
  const real = mode === "realistic";
  renderer.render(real ? realistic.scene : scene, activeCam());     // draw now so the picture isn't blank
  download(`nukesim-${stamp()}.png`, renderer.domElement.toDataURL("image/png"));
  toast("Picture saved to your downloads", { kind: "ok" });
}
function resultsCSV() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const sc = scenario();
  const rows = [["# nukesim results", new Date().toISOString()], ["# yield_kt", sc.burst.yield_kt], ["# burst_height_m (negative = depth)", sc.burst.z_m],
    ["# wind_mph", sc.burst.wind_mph], ["# water_depth_m", sc.env.water_depth_m ?? "deep ocean"],
    ["thing", "kind", "distance_m", "depth_m", "worst", "effect", "level", "value", "threshold", "source"]];
  for (const r of state.receivers) {
    const res = state.results[r.id];
    for (const e of res?.effects || [{}]) rows.push([r.label, r.kind, Math.round(r.x_m), onSurface(r) ? 0 : +(-r.z_m).toFixed(1), res?.worst ?? "", e.name, e.level, e.value, e.criterion, e.source]);
  }
  download(`nukesim-results-${stamp()}.csv`, rows.map((row) => row.map(q).join(",")).join("\n"), "text/csv");
  toast("Results table saved to your downloads", { kind: "ok" });
}
function resultsJSON() {
  download(`nukesim-results-${stamp()}.json`, JSON.stringify({ scenario: serialize(), burst: info, results: state.results }, null, 2));
  toast("Full results saved to your downloads", { kind: "ok" });
}
// ---- video: records the 3D view (whatever the camera shows) to a video file
let rec = null;
function toggleRecording(fromStart = false) {
  if (rec) { rec.mr.stop(); return; }
  if (typeof MediaRecorder === "undefined" || !renderer.domElement.captureStream) { toast("This browser can't record video.", { kind: "err" }); return; }
  const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const mr = new MediaRecorder(renderer.domElement.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 10e6 } : undefined);
  const chunks = [], t0 = performance.now();
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = () => {
    clearInterval(rec.timer); $("recBadge").hidden = true; rec = null;
    const type = mr.mimeType || "video/webm", ext = type.includes("mp4") ? "mp4" : "webm";
    download(`nukesim-${stamp()}.${ext}`, new Blob(chunks, { type }));
    toast(`Video saved to your downloads (${ext.toUpperCase()})`, { kind: "ok" });
  };
  rec = { mr, fromStart, timer: setInterval(() => {
    const s = Math.round((performance.now() - t0) / 1000);
    $("recBadge").querySelector(".t").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if (rec.fromStart && timeline.isAtEnd()) rec.mr.stop();   // the whole event has played
  }, 250) };
  $("recBadge").hidden = false;
  if (fromStart) { timeline.setTime(0); timeline.play(); }
  mr.start(500);
}
$("recStop").addEventListener("click", () => toggleRecording());

attachMenu($("exportBtn"), () => [
  { icon: icon("image"), label: "Picture of the 3D view (PNG)", kbd: "P", action: screenshot },
  { icon: icon("film"), label: rec ? "Stop recording" : "Record video of the 3D view", kbd: "V", action: () => toggleRecording() },
  { icon: icon("burst"), label: "Record the whole event from the flash", action: () => toggleRecording(true), disabled: !!rec },
  { icon: icon("table"), label: "Results table (CSV, for Excel)", action: resultsCSV, disabled: !state.receivers.length },
  { icon: "{ }", label: "Full results (JSON)", action: resultsJSON },
]);

// ---------------------------------------------------------------- help menu, tour, settings
attachMenu($("helpBtn"), () => [
  { icon: icon("compass"), label: "Guided tour", action: startTour },
  { icon: icon("keyboard"), label: "Keyboard shortcuts", kbd: "?", action: () => openModal("shortcutsModal") },
  { icon: icon("info"), label: "Quick start", action: () => openModal("helpModal") },
]);
function startTour() {
  closeModal("helpModal"); store.set("helpSeen", 1);
  if (detail === "simple") {
    if (simple.state !== "start") simple.show("start");
    return runTour([
      { el: '.spCards[data-group="bomb"]', title: "Pick a bomb", text: "From a small 1-kiloton bomb up to the largest ever tested, the 50-megaton Tsar Bomba." },
      { el: '.spCards[data-group="where"]', title: "Where it goes off", text: "High in the sky, right on the water, or just under the surface. Each looks and acts very differently." },
      { el: '.spCards[data-group="sea"]', title: "What's in the sea", text: "Fish, dolphins and whales, boats and ships, or a bit of everything at different distances." },
      { el: ".spGo", title: "Detonate", text: "Then sit back: the camera follows the flash, the blast, the waves and the mushroom cloud, with captions explaining each step." },
      { el: "#muteBtn", title: "Sound", text: "The boom arrives late if you're far away, just as it would in real life. Turn the sound on or off here (or press <kbd>M</kbd>)." },
      { el: "#detailSeg", title: "Want all the numbers?", text: "<b>Expert</b> shows every pressure, dose and source, the scientific cut-away view, and lets you set up anything you like." },
    ]);
  }
  if (prefs.hideLeft) togglePanel("left"); if (prefs.hideRight) togglePanel("right");
  runTour([
    { el: "#presetSel", title: "Start from an example", text: "Pick a ready-made scenario, such as a Hiroshima-sized air burst or the 1946 BAKER test. It fills in everything for you." },
    { el: "#controls details", title: "Set up the burst", text: "Or set it yourself: the <b>yield</b>, whether it goes off <b>above or below</b> the water, and the wind." },
    { el: "#addButtons", title: "Put things in the sea", text: "Add fish, whales, dolphins, turtles, divers and boats. Each one is coloured by what happens to it, from green (nothing) to dark red (lethal)." },
    { el: "#scene", title: "The 3D view", text: "Drag to turn the view, scroll to zoom. In the technical view, drag an animal along the cut-away to move it, and click one to see its results." },
    { el: "#camBar", title: "Cameras", text: "Jump to a preset view, or press <kbd>F</kbd> for the <b>free camera</b>: fly with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> and look with the mouse." },
    { el: "#timeline", title: "The timeline", text: "Play the event from the first microsecond to weeks later. The coloured marks are when each effect arrives. <kbd>Space</kbd> plays and pauses." },
    { el: "#viewSeg", title: "Technical or realistic", text: "<b>Technical</b> is the scientific cut-away with overlays. <b>Realistic</b> shows the ocean, sky, fireball, mushroom cloud and waves as they would look." },
    { el: "#detailSeg", title: "Basic or expert", text: "Basic shows the key numbers. Expert adds every threshold, source, uncertainty setting and caveat." },
    { el: "#results", title: "Results", text: "Everything that happens to the selected thing: blast, hearing, burns, radiation and fallout, with the numbers behind each. Tick <b>Show uncertainty</b> for likely ranges." },
    { el: "#saveBtn", title: "Save, share, export", text: "Save scenarios, copy a link that reopens exactly this setup, or export a picture and the results table." },
    { el: "#helpBtn", title: "That's it", text: "Find this tour and all keyboard shortcuts here any time. Press <kbd>?</kbd> for the shortcut list." },
  ]);
}

function applyUnits(sys) {
  setSystem(sys); prefs.units = sys; savePrefs();
  document.querySelectorAll("#unitSeg button").forEach((b) => b.classList.toggle("on", b.dataset.units === sys));
}
units.onChange(() => { buildStatic(); buildReceivers(); renderList(); renderReport(); renderBurstInfo(); loadWaves(); });
document.querySelectorAll("#unitSeg button").forEach((b) => b.addEventListener("click", () => applyUnits(b.dataset.units)));
function setQuality(q) {
  prefs.quality = q; savePrefs(); applyQuality(q);
  document.querySelectorAll("#qualitySeg button").forEach((b) => b.classList.toggle("on", b.dataset.quality === q));
}
document.querySelectorAll("#qualitySeg button").forEach((b) => b.addEventListener("click", () => setQuality(b.dataset.quality)));
$("autoPlay").addEventListener("change", (e) => { prefs.autoPlay = e.target.checked; savePrefs(); });
$("classicBasic").addEventListener("change", (e) => {
  prefs.classicBasic = e.target.checked; savePrefs();
  document.body.classList.toggle("classic", prefs.classicBasic);
  if (!prefs.classicBasic && detail === "basic") setDetail("simple");
});
$("schools").addEventListener("change", (e) => { prefs.schools = e.target.checked; savePrefs(); });
$("showZones").addEventListener("change", (e) => { prefs.zones = e.target.checked; savePrefs(); renderZones(); });
$("calm").addEventListener("change", (e) => { prefs.calm = e.target.checked; savePrefs(); });
$("bigWaves").addEventListener("change", (e) => { prefs.bigWaves = e.target.checked; savePrefs(); toast(e.target.checked ? "Waves drawn 10x taller than they really are" : "Waves drawn at their true height"); });
$("reactions").addEventListener("change", (e) => { prefs.reactions = e.target.checked; savePrefs(); });
$("followTL").addEventListener("change", (e) => { prefs.followTL = e.target.checked; savePrefs(); state.followTimeline = e.target.checked; lastStatusKey = null; });
$("showPins").addEventListener("change", (e) => { prefs.pins = e.target.checked; savePrefs(); realistic.setPins(prefs.pins); });
$("resetPrefs").addEventListener("click", () => {
  const saved = savedList();
  store.clearAll(); store.set("saved", saved);
  location.hash = ""; location.reload();
});
$("settingsBtn").addEventListener("click", () => openModal("settingsModal"));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { b.closest(".modal").hidden = true; openModal(b.dataset.open); }));
document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; }));
$("helpClose").addEventListener("click", () => { closeModal("helpModal"); store.set("helpSeen", 1); });
$("tourStart").addEventListener("click", startTour);

// ---------------------------------------------------------------- side panels: hide and resize
function layoutPanels() {
  document.body.classList.toggle("hideLeft", prefs.hideLeft);
  document.body.classList.toggle("hideRight", prefs.hideRight);
  if (prefs.lw) document.body.style.setProperty("--lw", `${prefs.lw}px`);   // only once the user has dragged a panel edge
  if (prefs.rw) document.body.style.setProperty("--rw", `${prefs.rw}px`);
  $("toggleLeft").textContent = prefs.hideLeft ? "›" : "‹";
  $("toggleRight").textContent = prefs.hideRight ? "‹" : "›";
}
function togglePanel(side) {
  if (side === "left") prefs.hideLeft = !prefs.hideLeft; else prefs.hideRight = !prefs.hideRight;
  savePrefs(); layoutPanels();
}
$("toggleLeft").addEventListener("click", () => togglePanel("left"));
$("toggleRight").addEventListener("click", () => togglePanel("right"));
document.querySelectorAll(".splitter").forEach((sp) => {
  sp.addEventListener("pointerdown", (e) => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
    const move = (ev) => {
      if (sp.dataset.side === "left") prefs.lw = Math.round(Math.min(Math.max(ev.clientX, 230), 520));
      else prefs.rw = Math.round(Math.min(Math.max(window.innerWidth - ev.clientX, 280), 640));
      layoutPanels();
    };
    const up = () => { sp.removeEventListener("pointermove", move); sp.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); savePrefs(); };
    sp.addEventListener("pointermove", move); sp.addEventListener("pointerup", up);
  });
});

// ---------------------------------------------------------------- keyboard shortcuts
const typing = () => {
  const a = document.activeElement;
  return a && (a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes(a.type)));
};
const FLY_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyC", "Space"];
window.addEventListener("keydown", (e) => {
  if (typing() || document.querySelector(".tourCard")) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveAs(); return; }
  if (mod && e.key.toLowerCase() === "z") { if (undoRemove()) e.preventDefault(); return; }
  if (mod || e.altKey) return;
  if (e.key === "Escape") {
    closeMenus();
    bodyView?.close();
    document.querySelectorAll(".modal").forEach((m) => { m.hidden = true; });
    return;
  }
  if (anyModalOpen() || (freecam.active && FLY_KEYS.includes(e.code))) return;
  if (e.code === "Space" && document.body.classList.contains("spFilm")) { simple.togglePause(); e.preventDefault(); return; }
  const onTrack = document.activeElement?.classList.contains("tl-track");
  const camBtns = [...$("camBar").querySelectorAll("button")];
  switch (e.key) {
    case "ArrowLeft": if (!onTrack) { timeline.step(-1); e.preventDefault(); } break;
    case "ArrowRight": if (!onTrack) { timeline.step(1); e.preventDefault(); } break;
    case "Home": timeline.toStart(); e.preventDefault(); break;
    case "End": timeline.toEnd(); e.preventDefault(); break;
    case "f": case "F": setCam("free"); break;
    case "t": case "T": setMode("technical"); break;
    case "r": case "R": setMode("realistic"); break;
    case "x": case "X": setDetail(detail === "expert" ? "simple" : "expert"); break;
    case "m": case "M": toggleMute(); break;
    case "[": togglePanel("left"); break;
    case "]": togglePanel("right"); break;
    case "p": case "P": screenshot(); break;
    case "v": case "V": toggleRecording(); break;
    case "?": openModal("shortcutsModal"); break;
    case "Delete": case "Backspace": if (state.selected) { removeReceiver(state.selected); e.preventDefault(); } break;
    default:
      if (/^[1-9]$/.test(e.key) && camBtns[+e.key - 1]) camBtns[+e.key - 1].click();
  }
});

// ---------------------------------------------------------------- start up
document.querySelectorAll("#viewSeg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.view)));
document.querySelectorAll("#detailSeg button").forEach((b) => b.addEventListener("click", () => setDetail(b.dataset.detail)));
$("presetSel").addEventListener("change", (e) => { applyScenario(e.target.value); currentName = null; });

layoutPanels();
applyQuality(prefs.quality);
document.querySelectorAll("#qualitySeg button").forEach((b) => b.classList.toggle("on", b.dataset.quality === prefs.quality));
$("classicBasic").checked = prefs.classicBasic; document.body.classList.toggle("classic", prefs.classicBasic);
$("autoPlay").checked = prefs.autoPlay; $("bigWaves").checked = prefs.bigWaves; $("showZones").checked = prefs.zones; $("calm").checked = prefs.calm; $("schools").checked = prefs.schools; $("reactions").checked = prefs.reactions; $("followTL").checked = prefs.followTL; state.followTimeline = prefs.followTL; $("showPins").checked = prefs.pins;
writeInput($("wind"), 15);            // canonical wind is 15 mph, shown in the chosen units
if (prefs.units !== "metric") applyUnits(prefs.units);
resize();
frameCamera();
// ---------------------------------------------------------------- timeline hook (everything else is in timeline.js)
timeline = initTimeline({ THREE, scene, renderer, staticGroup, receiverGroup, state, scenario, view, toY, levelColor });
realistic = initRealistic({ renderer, state, scenario, levelColor, timeline, getInfo: () => info, colorOf, reactionsOn: () => prefs.reactions, sound, calm: () => prefs.calm, waveGain: () => (prefs.bigWaves ? 10 : 1),
  getZones: () => state.zones, schoolsOn: () => prefs.schools });
realistic.setPins(prefs.pins);
realistic.setConditions(conditions());
$("viewNotes").innerHTML = realistic.notes.map((n) => `<li>${esc(n)}</li>`).join("");
// ---- sound and Simple mode
simple = initSimple({
  timeline, realistic, sound, state, scenario, worstSoFar, physicsState,
  getResults: () => state.results,
  toast, download,
  snapshot: () => { renderer.render(realistic.scene, realistic.camera); return renderer.domElement.toDataURL("image/jpeg", 0.88); },
  onShow: (what) => {
    if (what === "start") {   // the calm sea behind the start screen
      realistic.setPins(false);
      if (!freecam.active) { currentCam = "calm"; realistic.setPreset("calm"); realistic.controls.autoRotate = true; realistic.controls.autoRotateSpeed = 0.15; markCam(); }
    } else realistic.setPins(prefs.pins);
  },
  openDive: (choice) => { dive ??= createDive({ api, toast }); dive.open(choice); },
  openAbout: () => openModal("aboutModal"),
  openPrivacy: () => openModal("privacyModal"),
  getZones: () => state.zones,
  setZonesShown: (on) => { prefs.zones = on; savePrefs(); $("showZones").checked = on; renderZones(); },
  zonesShown: () => prefs.zones,
  setup: simpleSetup,
  toExpert: () => setDetail("expert"),
  setShot: (c, instant) => { if (freecam.active) return; currentCam = c.name; realistic.setPreset(c.name, instant, c); markCam(); },
  preRoll: (p) => realistic.setPreRoll(p),
  drift: (on) => { realistic.controls.autoRotate = on; realistic.controls.autoRotateSpeed = 0.3; },   // slow cinematic turn
});
setDetail(prefs.detail);
buildCamBar();
resize();
let lastFrame = performance.now(), lastStatusKey = null;
// "?pump" in the address keeps drawing even when the browser pauses animation for a hidden tab (for testing)
const nextFrame = location.search.includes("pump") ? (cb) => setTimeout(() => cb(performance.now()), 33) : (cb) => requestAnimationFrame(cb);
(function loop() {
  nextFrame(loop);
  const now = performance.now(), dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  timeline.update();
  // the report and list follow the timeline: redraw when an injury happens (or un-happens when scrubbing back)
  const sk = statusKey() + state.selected;
  if (sk !== lastStatusKey) { lastStatusKey = sk; renderReport(); renderList(); bodyView?.refresh(); }
  if (mode === "technical") {
    const byId = Object.fromEntries((timeline.getData()?.receivers || []).map((x) => [x.id, x]));
    for (const m of receiverGroup.children) if (m.userData.base && !dragging)
      pose(m, followTL() ? byId[m.userData.id] : null, timeline.getTime(), { on: prefs.reactions, scale: m.userData.size, awayX: 1 });
  }
  freecam.update(dt);
  tickHumans(dt, now);
  tickAnimals(dt, now);
  if (detail === "simple") simple.update(dt);
  if (dive?.isOpen()) { dive.frame(now); return; }   // "Dive into the deep" covers the screen: draw only that
  if (mode === "realistic") { realistic.update(); renderer.render(realistic.scene, realistic.camera); }
  else { if (controls.enabled) { techTween.update(); controls.update(); } renderer.render(scene, camera); }
})();

// open a shared link (#s=... full setup, #play=bomb.where.sea for Simple mode), otherwise the default scene
let opened = false;
if (location.hash.startsWith("#play=")) {
  const [b, w, s] = location.hash.slice(6).split(".");
  setDetail("simple"); simple.preset(b, w, s);
  toast("Someone shared this setup with you: press Detonate to watch it.", { kind: "ok", ms: 6000 });
}
if (location.hash.startsWith("#s=")) {
  try { applySaved(JSON.parse(b64.dec(location.hash.slice(3)))); opened = true; toast("Opened the shared scenario", { kind: "ok" }); }
  catch (err) { toast(`That link could not be opened: ${err.message}`, { kind: "err" }); }
}
if (!opened) {
  addReceiver("cod");
  addReceiver("dolphin");
  addReceiver("boat");
  refreshScenario();
}
if (!store.get("helpSeen", false) && !opened && detail !== "simple") openModal("helpModal");
