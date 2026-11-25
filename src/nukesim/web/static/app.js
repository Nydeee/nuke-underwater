// nukesim 3D interface.
// The browser only draws things and sends the scenario to the local Python server
// (server.py), which runs the tested simulator code and sends results back.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { initTimeline } from "./timeline.js";   // time slider (see timeline.js)
import { makeModel } from "./models.js";
import { initRealistic } from "./realistic.js";   // realistic view (see realistic.js)

// ---------------------------------------------------------------- talking to the server
async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail));
  return data;
}

// ---------------------------------------------------------------- state
const LEVEL_COLORS = { none: "#6fbf73", possible: "#e6cf5a", likely: "#f0a23c", severe: "#e2552c", lethal: "#a51818" };
const LEVELS = ["none", "possible", "likely", "severe", "lethal"];
const PRESETS = {
  fish:    { kind: "fish", label: "Fish", emoji: "🐟", mass_kg: 0.5, swim_bladder: true, z_m: -10 },
  whale:   { kind: "mammal", label: "Whale", emoji: "🐋", mass_kg: 20000, hearing_group: "LF", z_m: -30 },
  dolphin: { kind: "mammal", label: "Dolphin", emoji: "🐬", mass_kg: 150, hearing_group: "HF", z_m: -10 },
  turtle:  { kind: "turtle", label: "Turtle", emoji: "🐢", mass_kg: 50, z_m: -5 },
  diver:   { kind: "diver", label: "Diver", emoji: "🤿", mass_kg: 75, z_m: -10 },
  boat:    { kind: "person", label: "Person on a boat", emoji: "🚤", z_m: 2 },
};
const state = { receivers: [], selected: null, results: {}, nextId: 1, overlay: null };
const $ = (id) => document.getElementById(id);

function scenario() {
  const y = parseFloat($("yield").value) * parseFloat($("yieldUnit").value);
  const d = parseFloat($("burstDist").value) || 0;
  return {
    burst: {
      yield_kt: y,
      z_m: $("side").value === "above" ? d : -d,
      fission_fraction: Math.min(Math.max(parseFloat($("fission").value) / 100, 0.01), 1),
      wind_mph: parseFloat($("wind").value) || 15,
    },
    env: { water_depth_m: $("deepOcean").checked ? null : parseFloat($("waterDepth").value) },
  };
}
const view = () => ({ R: parseFloat($("maxRange").value) * 1000, D: parseFloat($("maxDepth").value), s: parseFloat($("stretch").value) });

// Scene units: 1 unit = 1 km horizontally. The water is drawn so that the depth
// shown takes up a chosen percentage of the distance shown (slider); heights above
// the water are not stretched.
const waterScale = () => { const { R, D, s } = view(); return ((R / 1000) * (s / 100)) / D; };   // scene units per metre of depth
const toY = (z_m) => (z_m < 0 ? z_m * waterScale() : z_m / 1000);
const fromY = (y) => (y < 0 ? y / waterScale() : y * 1000);

// ---------------------------------------------------------------- three.js scene
const host = $("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
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
  realistic?.resize(w, h);
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
    const l = textSprite(`${(x).toFixed(x < 10 ? 1 : 0)} km`);
    l.position.set(x, 0.08, 0.02);
    l.scale.multiplyScalar(Rk / 2.5);
    staticGroup.add(l);
  }
  for (let i = 1; i <= 4; i++) {
    const z = -(D * i) / 4;
    const l = textSprite(`${Math.round(-z)} m deep`, "#8ea2b5");
    l.position.set(-Rk * 0.06, toY(z), 0.02);
    l.scale.multiplyScalar(Rk / 2.5);
    staticGroup.add(l);
  }
}

function receiverMesh(r) {
  const { R } = view();
  const big = r.kind === "mammal" && (r.preset === "whale" || (r.mass_kg ?? 0) > 1000);
  const size = (R / 1000) * (big ? 0.07 : r.kind === "person" ? 0.06 : 0.045);   // icon size, not to scale
  const color = levelColor(state.results[r.id]);
  const m = makeModel(r, color);
  m.scale.setScalar(size);
  m.rotation.y = Math.PI;   // face ground zero
  if (r.id === state.selected) m.material.emissive?.setHex(0x335577);
  m.position.set(r.x_m / 1000, toY(r.z_m) + (r.kind === "person" ? size * 0.05 : 0), 0);
  m.userData.id = r.id;
  m.traverse((o) => { o.userData.id = r.id; });
  return m;
}

function buildReceivers() {
  clearGroup(receiverGroup);
  state.receivers.forEach((r) => receiverGroup.add(receiverMesh(r)));
}

function frameCamera() {
  const { R, D } = view();
  const Rk = R / 1000, dy = toY(-D);
  const top = Math.max(toY(scenario().burst.z_m), 0);
  controls.target.set(Rk * 0.42, (dy + top) * 0.45, 0);
  camera.position.set(Rk * 0.55, Rk * 0.4 + top * 0.5, Rk * 1.75 + top);
  controls.update();
}

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
  if (mode !== "technical") return;
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
  if (r.kind === "person") r.z_m = 2;
  else {
    const wd = scenario().env.water_depth_m;
    const maxDepth = Math.min(D, wd ? wd - 0.5 : D);
    r.z_m = Math.min(Math.max(fromY(p.y), -maxDepth), -0.3);
  }
  const mesh = receiverGroup.children.find((m) => m.userData.id === dragging);
  mesh.position.set(r.x_m / 1000, toY(r.z_m), 0);
  renderList();
});
window.addEventListener("pointerup", () => {
  if (dragging) { dragging = null; controls.enabled = true; scheduleAssess(); }
});

// ---------------------------------------------------------------- receivers list and report
function addReceiver(preset) {
  const p = PRESETS[preset];
  const id = `${preset}-${state.nextId++}`;
  const { R } = view();
  state.receivers.push({ id, preset, kind: p.kind, label: `${p.label} ${state.nextId - 1}`, emoji: p.emoji,
    x_m: R * (0.2 + 0.6 * Math.random()), y_m: 0, z_m: p.z_m, mass_kg: p.mass_kg ?? null,
    swim_bladder: p.swim_bladder ?? true, hearing_group: p.hearing_group ?? null });
  state.selected = id;
  buildReceivers(); renderList(); scheduleAssess();
}

function renderList() {
  const ul = $("receiverList");
  ul.innerHTML = "";
  for (const r of state.receivers) {
    const li = document.createElement("li");
    if (r.id === state.selected) li.className = "selected";
    const color = levelColor(state.results[r.id]);
    const where = r.kind === "person" ? "on deck" : `${Math.round(-r.z_m)} m deep`;
    li.innerHTML = `<div class="top"><span><span class="dot" style="background:${color}"></span>${r.emoji} ${r.label}</span>
      <button class="del" title="Remove">✕</button></div>
      <div class="hint">${(r.x_m / 1000).toFixed(2)} km out, ${where}</div>`;
    if (r.kind !== "person") {
      const props = document.createElement("div");
      props.className = "props";
      props.innerHTML = `<label>mass (kg)<input type="number" min="0.001" step="any" value="${r.mass_kg ?? ""}"></label>` +
        (r.kind === "fish" ? `<label class="check"><input type="checkbox" ${r.swim_bladder ? "checked" : ""}> swim bladder</label>` : "") +
        (r.kind === "mammal" ? `<label>hearing<select>${["LF", "HF", "VHF", "PW", "OW"].map((g) => `<option ${g === r.hearing_group ? "selected" : ""}>${g}</option>`).join("")}</select></label>` : "");
      props.querySelector("input[type=number]").addEventListener("change", (e) => { r.mass_kg = parseFloat(e.target.value) || null; buildReceivers(); scheduleAssess(); });
      props.querySelector("input[type=checkbox]")?.addEventListener("change", (e) => { r.swim_bladder = e.target.checked; scheduleAssess(); });
      props.querySelector("select")?.addEventListener("change", (e) => { r.hearing_group = e.target.value; scheduleAssess(); });
      props.addEventListener("click", (e) => e.stopPropagation());
      li.appendChild(props);
    }
    li.querySelector(".del").addEventListener("click", (e) => {
      e.stopPropagation();
      state.receivers = state.receivers.filter((x) => x.id !== r.id);
      if (state.selected === r.id) state.selected = null;
      buildReceivers(); renderList(); renderReport();
    });
    li.addEventListener("click", () => select(r.id));
    ul.appendChild(li);
  }
}

// Colour: the most likely outcome when uncertainty is shown, otherwise the single best-estimate outcome.
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
  buildReceivers(); renderList(); renderReport(); loadFallout();
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

function renderReport() {
  const box = $("report");
  const r = state.receivers.find((x) => x.id === state.selected);
  if (!r) { box.innerHTML = ""; return; }
  const res = state.results[r.id];
  if (!res) { box.innerHTML = `<p class="hint">Calculating…</p>`; return; }
  if (res.error) { box.innerHTML = `<p class="error">${esc(res.error)}</p>`; return; }
  const u = res.uncertain;
  const expert = detail === "expert";
  const where = r.kind === "person" ? "on deck" : `${Math.round(-r.z_m)} m deep`;
  let html = `<div class="summaryCard"><div class="big">${r.emoji} ${esc(r.label)}</div>
    <div class="help">${(r.x_m / 1000).toFixed(2)} km from ground zero, ${where}</div>
    <div style="margin-top:6px">Worst effect: <span class="level lv-${res.worst}">${res.worst}</span>
    ${u ? ` · most likely: <span class="level lv-${u.most_likely}">${u.most_likely}</span>` : ""}</div>
    ${u ? `${probBar(u.level_probs)}<div class="help">chance of each worst outcome over ${u.n} runs</div>` : ""}</div>`;
  for (const e of res.effects) {
    const ue = u && u.effects.find((x) => x.name === e.name);
    const range = ue && ue.p05 != null ? `<div class="range">likely range (5–95%): ${fmtNum(ue.p05)} – ${fmtNum(ue.p95)} ${esc(ue.unit)}</div>${expert ? probBar(ue.level_probs) : ""}` : "";
    html += `<div class="effect"><span class="level lv-${e.level}">${e.level}</span> <b>${esc(e.name)}</b>
      <div class="val">${esc(e.value)}</div>${range}
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
  $("resultsHint").hidden = true;
}

// ---------------------------------------------------------------- calling the server
let assessTimer = null;
function scheduleAssess() { clearTimeout(assessTimer); assessTimer = setTimeout(runAssess, 250); }

async function runAssess() {
  const sc = scenario();
  if (!(sc.burst.yield_kt > 0)) return;
  $("status").textContent = "Calculating…";
  try {
    const unc = $("uncertainty").checked;
    const data = await api("/api/assess", { ...sc, uncertainty: unc, n_samples: parseInt($("nSamples").value) || 200, receivers: state.receivers.map(({ id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group }) =>
      ({ id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group })) });
    state.results = Object.fromEntries(data.receivers.map((x) => [x.id, x]));
    $("status").textContent = `Updated · ${state.receivers.length} in the sea`;
    if (mode === "realistic") realistic.rebuildReceivers();
  } catch (err) {
    $("status").textContent = `Error: ${err.message}`;
  }
  buildReceivers(); renderList(); renderReport(); loadFallout();
}

async function refreshScenario() {
  const sc = scenario();
  if (!(sc.burst.yield_kt > 0)) {
    $("status").textContent = "Enter a yield above zero.";
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
    const parts = [`<b>${esc(info.regime)}</b>`,
      info.fireball_radius_m ? `fireball radius about ${Math.round(info.fireball_radius_m)} m` : null,
      info.coupling != null ? `shock coupling into the water: ${(info.coupling * 100).toFixed(info.coupling < 0.1 ? 1 : 0)}%` : null,
      info.crater_radius_m ? `water crater about ${Math.round(info.crater_radius_m)} m radius, ${Math.round(info.crater_depth_m)} m deep` : null,
      sc.burst.z_m >= 0 ? (info.local_fallout ? "local fallout: yes" : "local fallout: none (burst too high)") : null];
    if (mode === "realistic") realistic.setPreset("aerial");
    $("burstInfo").innerHTML = parts.filter(Boolean).join("<br>");
  } catch (err) { $("burstInfo").textContent = err.message; }
  state.overlay = null; $("legend").innerHTML = "";
  buildStatic(); buildReceivers(); scheduleAssess(); loadWaves();
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
  $("status").textContent = "Computing overlay (can take a few seconds)…";
  try {
    const data = await api("/api/field", { ...scenario(), kind, zones_kind: $("zonesKind").value, max_range_m: R, max_depth_m: D, nr: 48, nd: 30 });
    state.overlay = { kind, data };
    buildStatic(); buildReceivers();
    $("status").textContent = data.message || "Overlay ready";
  } catch (err) { $("status").textContent = `Error: ${err.message}`; }
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
    const km = d.ranges_m.map((r) => r / 1000);
    chart($("waveChart"), [{ x: km, y: d.high_m, color: "#4fa3d9" }, { x: km, y: d.low_m, color: "#4fa3d9", dash: [4, 3] }],
      { xlabel: "distance (km)", ylabel: "wave height (m)" });
    $("waveInfo").textContent = d.regime.startsWith("air")
      ? "Air burst: the fireball doesn't reach the water, so waves are negligible."
      : `${d.regime}: solid = upper, dashed = lower estimate. Period about ${Math.round(d.period_s)} s, wavelength about ${(d.wavelength_m / 1000).toFixed(1)} km.`;
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
    const { id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group } = r;
    const d = await api("/api/fallout", { ...sc, receiver: { id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group }, days: 30 });
    const days = d.times_h.map((t) => t / 24);
    const series = [{ x: days, y: d.total_high_ugy_h, color: "#f0a23c" }, { x: days, y: d.total_low_ugy_h, color: "#f0a23c", dash: [4, 3] }];
    if (d.internal_high_ugy_h) series.push({ x: days, y: d.internal_high_ugy_h, color: "#e2552c", width: 1 });
    chart(canvas, series, { xlabel: "days after the burst", ylabel: "dose rate (µGy/h)" });
    $("falloutInfo").textContent = d.findings.join(" ");
  } catch (err) { $("falloutInfo").textContent = err.message; }
}

// ---------------------------------------------------------------- wiring
document.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => addReceiver(b.dataset.add)));
["yield", "yieldUnit", "side", "burstDist", "fission", "wind", "waterDepth"].forEach((id) => $(id).addEventListener("change", refreshScenario));
$("deepOcean").addEventListener("change", () => { $("waterDepth").disabled = $("deepOcean").checked; refreshScenario(); });
["maxRange", "maxDepth"].forEach((id) => $(id).addEventListener("change", () => { state.overlay = null; $("legend").innerHTML = ""; buildStatic(); buildReceivers(); frameCamera(); }));
$("stretch").addEventListener("input", () => { $("stretchVal").textContent = `${$("stretch").value}%`; buildStatic(); buildReceivers(); });
$("overlay").addEventListener("change", () => { $("zonesKindLabel").hidden = $("overlay").value !== "zones"; });
$("computeOverlay").addEventListener("click", computeOverlay);
$("uncertainty").addEventListener("change", scheduleAssess);
$("nSamples").addEventListener("change", scheduleAssess);

// ---------------------------------------------------------------- view mode, detail level, presets, help
let mode = "technical", detail = "basic", realistic = null;

function setMode(m) {
  mode = m;
  document.querySelectorAll("#viewSeg button").forEach((b) => b.classList.toggle("on", b.dataset.view === m));
  const real = m === "realistic";
  document.body.classList.toggle("real", real);
  $("camBar").hidden = !real;
  $("techViewBox").hidden = real;
  controls.enabled = !real;
  realistic.setActive(real);
  renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = real ? 0.5 : 1;
  if (real) {
    realistic.setPreset("aerial");
    if (timeline.isAtEnd()) { timeline.setTime(0); timeline.play(); }   // start the show from the flash
  }
}

function setDetail(d) {
  detail = d;
  document.body.classList.toggle("basic", d === "basic");
  document.body.classList.toggle("expert", d === "expert");
  document.querySelectorAll("#detailSeg button").forEach((b) => b.classList.toggle("on", b.dataset.detail === d));
  document.querySelectorAll("[data-basic]").forEach((el) => { el.textContent = el.dataset[d]; });
  renderReport();
}

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
  $("yield").value = s.yield; $("yieldUnit").value = s.unit; $("side").value = s.side; $("burstDist").value = s.dist;
  $("deepOcean").checked = s.deep; $("waterDepth").disabled = s.deep; if (s.water) $("waterDepth").value = s.water;
  $("maxRange").value = s.range; $("maxDepth").value = s.depth;
  // spread the existing things in the sea across the new distance shown
  state.receivers.forEach((r, i) => { r.x_m = s.range * 1000 * (0.25 + 0.6 * (i + 0.5) / Math.max(state.receivers.length, 1)); });
  frameCamera();
  refreshScenario();
  timeline.setTime(0);
}

document.querySelectorAll("#viewSeg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.view)));
document.querySelectorAll("#detailSeg button").forEach((b) => b.addEventListener("click", () => setDetail(b.dataset.detail)));
document.querySelectorAll("#camBar [data-cam]").forEach((b) => b.addEventListener("click", () => realistic.setPreset(b.dataset.cam)));
$("presetSel").addEventListener("change", (e) => applyScenario(e.target.value));
$("helpBtn").addEventListener("click", () => { $("helpModal").hidden = false; });
$("helpClose").addEventListener("click", () => {
  $("helpModal").hidden = true;
  try { localStorage.setItem("nukesim.helpSeen", "1"); } catch (_) { /* storage may be unavailable */ }
});
try { if (!localStorage.getItem("nukesim.helpSeen")) $("helpModal").hidden = false; } catch (_) { /* ignore */ }

resize();
frameCamera();
// ---------------------------------------------------------------- timeline hook (everything else is in timeline.js)
const timeline = initTimeline({ THREE, scene, renderer, staticGroup, receiverGroup, state, scenario, view, toY, levelColor });
realistic = initRealistic({ renderer, state, scenario, levelColor, timeline, getInfo: () => info });
$("viewNotes").innerHTML = realistic.notes.map((n) => `<li>${esc(n)}</li>`).join("");
resize();
(function loop() {
  requestAnimationFrame(loop);
  timeline.update();
  if (mode === "realistic") { realistic.update(); renderer.render(realistic.scene, realistic.camera); }
  else { controls.update(); renderer.render(scene, camera); }
})();
addReceiver("fish");
addReceiver("dolphin");
addReceiver("boat");
refreshScenario();
