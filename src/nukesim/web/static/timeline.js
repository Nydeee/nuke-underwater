// nukesim timeline: a YouTube-style time slider that shows the scene at a chosen moment
// after the detonation (from microseconds to weeks).
//
// Kept separate from app.js on purpose. app.js only has to:
//   1. import { initTimeline } from "./timeline.js"
//   2. call initTimeline({...}) once with its scene objects and helpers
//   3. call timeline.update() in its animation loop
//   4. tag the static fireball mesh with userData.role = "fireball" (we hide it and draw our own)
// Everything else (fetching /api/timeline, the slider, the 3D objects) lives here.

const LEVELS = ["none", "possible", "likely", "severe", "lethal"];
const NOT_YET = "#9aa8b6";              // grey: nothing has reached it yet
const T0 = 1e-4;                         // s: left end of the logarithmic scale (just after detonation)
const SPEEDS = [
  { label: "slow: ×10 every 6 s", log: 6 },
  { label: "normal: ×10 every 3 s", log: 3 },
  { label: "fast: ×10 every 1 s", log: 1 },
  { label: "real time", real: 1 },
  { label: "real time ×60 (1 min/s)", real: 60 },
  { label: "real time ×3600 (1 h/s)", real: 3600 },
];
const EVENT_COLORS = { burst: "#ffffff", thermal: "#ffb347", blast: "#e2552c", radiation: "#b48cff", wave: "#4fd1ff", fallout: "#d6c24a" };

// ---------------------------------------------------------------- small helpers
export function fmtTime(t) {
  if (!(t > 0)) return "0 s (detonation)";
  const p = (v) => +v.toPrecision(v < 10 ? 2 : 3);
  if (t < 1e-3) return `${p(t * 1e6)} µs`;
  if (t < 1) return `${p(t * 1e3)} ms`;
  if (t < 60) return `${p(t)} s`;
  if (t < 3600) return `${p(t / 60)} min`;
  if (t < 86400) return `${p(t / 3600)} h`;
  return `${p(t / 86400)} days`;
}
import { fmtLen as fmtDist } from "./units.js";
const fmtNum = (v) => (v == null ? "–" : Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : +v.toPrecision(3));

// linear interpolation in log(t); returns `before` before the first sample, the last value after the last
function interpLogT(ts, ys, t, before = 0) {
  if (!ts || !ts.length || t < ts[0]) return before;
  if (t >= ts[ts.length - 1]) return ys[ys.length - 1];
  let i = 1;
  while (ts[i] < t) i++;
  const a = Math.log(Math.max(ts[i - 1], 1e-12)), b = Math.log(ts[i]), f = (Math.log(t) - a) / (b - a || 1);
  const y0 = ys[i - 1] ?? 0, y1 = ys[i] ?? y0;
  return y0 + (y1 - y0) * f;
}
function interpLin(ts, ys, t) {
  if (!ts || !ts.length || t <= ts[0] || t >= ts[ts.length - 1]) return 0;
  let i = 1;
  while (ts[i] < t) i++;
  const f = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
  return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
}

// ---------------------------------------------------------------- the timeline
export function initTimeline({ THREE, scene, renderer, staticGroup, receiverGroup, state, scenario, view, toY, levelColor }) {
  // ---------- DOM (built here so index.html stays untouched)
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "timeline.css";
  document.head.appendChild(link);
  const main = document.querySelector("main");
  const bar = document.createElement("div");
  bar.id = "timeline";
  bar.innerHTML = `
    <div class="tl-track" tabindex="0" title="Drag to choose a moment after the detonation">
      <div class="tl-rail"><div class="tl-fill"></div></div>
      <div class="tl-markers"></div>
      <div class="tl-thumb"></div>
      <div class="tl-hover" hidden></div>
    </div>
    <div class="tl-ticks"></div>
    <div class="tl-row">
      <button class="tl-play" title="Play / pause (space)">▶</button>
      <span class="tl-time">–</span>
      <span class="tl-what"></span>
      <span class="tl-spacer"></span>
      <label class="tl-speed">speed <select>${SPEEDS.map((s, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${s.label}</option>`).join("")}</select></label>
      <button class="tl-end" title="Jump to the end (everything has happened)">⏭</button>
    </div>`;
  main.appendChild(bar);
  const nowBox = document.createElement("div");
  nowBox.id = "tlNow";
  nowBox.innerHTML = `<button class="tlNowHead" title="Show / hide this box"><span>At this moment</span><span class="chev">▾</span></button><div class="tlNowBody"></div>`;
  main.appendChild(nowBox);
  const now = nowBox.querySelector(".tlNowBody");
  let pref = null;
  try { pref = localStorage.getItem("nukesim.tlNowCollapsed"); } catch (_) { /* ignore */ }
  // collapsed if the user left it so, or (by default) when the 3D view is narrow
  if (pref === "1") nowBox.classList.add("collapsed");
  else if (pref === null) setTimeout(() => { if (main.clientWidth < 760) nowBox.classList.add("collapsed"); }, 300);   // after the page has laid out
  nowBox.querySelector(".tlNowHead").addEventListener("click", () => {
    nowBox.classList.toggle("collapsed");
    try { localStorage.setItem("nukesim.tlNowCollapsed", nowBox.classList.contains("collapsed") ? "1" : "0"); } catch (_) { /* ignore */ }
  });
  const q = (s) => bar.querySelector(s);
  const track = q(".tl-track"), fill = q(".tl-fill"), thumb = q(".tl-thumb"), hover = q(".tl-hover");
  const markers = q(".tl-markers"), ticks = q(".tl-ticks"), playBtn = q(".tl-play"), speedSel = q(".tl-speed select");

  // ---------- time <-> slider position (logarithmic: each power of ten gets the same width)
  let tEnd = 30 * 86400;
  const tOf = (u) => (u <= 0 ? 0 : T0 * Math.pow(tEnd / T0, Math.min(u, 1)));
  const uOf = (t) => (t <= 0 ? 0 : Math.min(Math.max(Math.log(t / T0) / Math.log(tEnd / T0), 0), 1));
  let t = tEnd, playing = false, data = null, lastFrame = performance.now();

  function drawTicks() {
    const marks = [[1e-3, "1 ms"], [1, "1 s"], [60, "1 min"], [3600, "1 h"], [86400, "1 day"], [7 * 86400, "1 week"]];
    ticks.innerHTML = marks.filter(([v]) => v < tEnd).map(([v, l]) => `<span style="left:${uOf(v) * 100}%">${l}</span>`).join("");
  }
  function drawMarkers() {
    markers.innerHTML = "";
    if (!data) return;
    for (const e of data.events) {
      const m = document.createElement("div");
      m.className = "tl-mark";
      m.style.left = `${uOf(e.t_s) * 100}%`;
      m.style.background = EVENT_COLORS[e.kind] || "#fff";
      m.title = `${fmtTime(e.t_s)}: ${e.label}`;
      m.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); setT(e.t_s * 1.0001); });
      markers.appendChild(m);
    }
  }
  drawTicks();

  function setT(v) { t = Math.min(Math.max(v, 0), tEnd); }
  function uFromEvent(ev) {
    const r = track.getBoundingClientRect();
    return Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1);
  }
  let scrubbing = false;
  track.addEventListener("pointerdown", (ev) => { scrubbing = true; track.setPointerCapture(ev.pointerId); setT(tOf(uFromEvent(ev))); });
  track.addEventListener("pointermove", (ev) => {
    const u = uFromEvent(ev);
    hover.hidden = false; hover.style.left = `${u * 100}%`; hover.textContent = fmtTime(tOf(u));
    if (scrubbing) setT(tOf(u));
  });
  track.addEventListener("pointerleave", () => { hover.hidden = true; });
  track.addEventListener("pointerup", () => { scrubbing = false; });
  track.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowRight") { setT(tOf(uOf(Math.max(t, T0)) + 0.01)); ev.preventDefault(); }
    if (ev.key === "ArrowLeft") { setT(tOf(uOf(t) - 0.01)); ev.preventDefault(); }
  });
  playBtn.addEventListener("click", () => {
    playing = !playing;
    if (playing && t >= tEnd) t = 0;
    playBtn.textContent = playing ? "❚❚" : "▶";
  });
  q(".tl-end").addEventListener("click", () => { setT(tEnd); playing = false; playBtn.textContent = "▶"; });
  window.addEventListener("keydown", (ev) => {
    if (ev.code !== "Space" || document.body.classList.contains("flying") || document.querySelector(".modal:not([hidden]), .tourCard")
      || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName)) return;
    ev.preventDefault(); playBtn.click();
  });

  // ---------- fetching the time series (whenever the scenario or the receivers change)
  let lastKey = "", pending = null, keyCheck = 0;
  const payload = () => {
    const sc = scenario();
    return { ...sc, days: tEnd / 86400, receivers: state.receivers.map(({ id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group }) =>
      ({ id, kind, x_m, y_m, z_m, mass_kg, swim_bladder, hearing_group })) };
  };
  async function fetchTimeline(body) {
    try {
      const res = await fetch("/api/timeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.detail === "string" ? j.detail : "invalid scenario");
      data = j; tEnd = j.t_end_s; dirty = true;
      drawTicks(); drawMarkers();
    } catch (err) { data = null; now.innerHTML = `<b>Timeline</b><div class="tl-err">${esc(err.message)}</div>`; drawMarkers(); }
  }
  function checkForChanges(ts) {
    if (ts - keyCheck < 250) return;
    keyCheck = ts;
    const body = payload();
    if (!(body.burst.yield_kt > 0)) return;
    const key = JSON.stringify(body);
    if (key === lastKey) return;
    lastKey = key;
    clearTimeout(pending);
    pending = setTimeout(() => fetchTimeline(body), 400);
  }

  // ---------- 3D objects
  renderer.localClippingEnabled = true;
  const aboveWater = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const group = new THREE.Group();
  scene.add(group);
  const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  const ring = (color, width = 0.012) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 160), flat(color, 0.9));
    m.rotation.x = -Math.PI / 2; m.visible = false; group.add(m); return m;
  };
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, depthWrite: false, clippingPlanes: aboveWater }));
  const blastShell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8a5c, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: aboveWater }));
  const blastRing = ring(0xff6a3d, 0.02);
  const waterShockRing = ring(0xe8f4ff, 0.015);
  const waveRing = ring(0x4fd1ff, 0.02);
  const waveFront = ring(0x4fd1ff, 0.006);
  const arc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.9 }));
  fireball.visible = blastShell.visible = arc.visible = false;
  group.add(fireball, blastShell, arc);

  // fallout: a texture painted on the sea surface (recomputed when it changes noticeably)
  const fc = document.createElement("canvas");
  fc.width = fc.height = 256;
  const falloutTex = new THREE.CanvasTexture(fc);
  const falloutMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: falloutTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  falloutMesh.rotation.x = -Math.PI / 2; falloutMesh.position.y = 0.001; falloutMesh.visible = false;
  group.add(falloutMesh);
  let falloutKey = "", dirty = true;

  function paintFallout(fo, reach_m, R) {
    const g = fc.getContext("2d"), n = fc.width, img = g.createImageData(n, n);
    const decay = Math.pow(Math.max(t / 3600, 1), fo.decay_exponent);   // t^-1.2 from 1 h on (before: the 1-hour level)
    const cs = [...fo.contours].sort((a, b) => b.r1_rad_h - a.r1_rad_h); // strongest first
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -R + (2 * R * (j + 0.5)) / n;          // downwind (+x)
      const y = R - (2 * R * (i + 0.5)) / n;           // crosswind (plane rows -> -z in the scene)
      if (Math.hypot(x, y) > reach_m) continue;        // the fallout has not got this far yet
      let r1 = 0;
      for (const c of cs) {                            // same shape test as fallout.Contour.normalized_radius
        const a = c.downwind_m / 2, b = c.max_width_m / 2;
        const inside = Math.hypot(x, y) <= c.gz_width_m / 2 || ((x - a) / a) ** 2 + (y / b) ** 2 <= 1;
        if (inside) { r1 = c.r1_rad_h; break; }
      }
      if (!r1) continue;
      const level = Math.log10(r1 * decay);            // land-equivalent rad/h now
      const alpha = Math.min(Math.max(0.12 + 0.13 * (level + 1), 0.06), 0.75);
      img.data.set([214, 194, 74, alpha * 255], 4 * (i * n + j));
    }
    g.putImageData(img, 0, 0);
    falloutTex.needsUpdate = true;
  }

  // ---------- one frame
  function update() {
    const ts = performance.now(), dt = Math.min((ts - lastFrame) / 1000, 0.5);
    lastFrame = ts;
    checkForChanges(ts);
    if (playing && !scrubbing) {
      const sp = SPEEDS[+speedSel.value];
      if (sp.real) setT(t + dt * sp.real);
      else setT(tOf(uOf(Math.max(t, T0)) + dt / (sp.log * Math.log10(tEnd / T0))));
      if (t >= tEnd) { playing = false; playBtn.textContent = "▶"; }
    }
    const u = uOf(t);
    fill.style.width = `${u * 100}%`; thumb.style.left = `${u * 100}%`;
    q(".tl-time").textContent = `t = ${fmtTime(t)}`;
    staticGroup.children.forEach((c) => { if (c.userData.role === "fireball") c.visible = !data; });
    if (!data) { group.visible = false; return; }
    group.visible = true;

    const sc = scenario(), { R, D } = view(), Rk = R / 1000;
    const bz = sc.burst.z_m, by = toY(bz);
    const lines = [];

    // fireball
    const fb = data.fireball;
    if (fb && t > 0 && t < fb.end_s) {
      const r = interpLogT(fb.t_s, fb.radius_m, t), pw = interpLogT(fb.t_s, fb.power, t);
      fireball.visible = r > 0;
      fireball.scale.setScalar(Math.max(r, 0.1) / 1000);
      fireball.position.set(0, by, 0);
      fireball.material.opacity = 0.15 + 0.8 * pw;
      fireball.material.color.setHSL(0.1 - 0.05 * (1 - pw), 1, 0.55 + 0.4 * pw);
      const got = interpLogT(fb.t_s, fb.delivered, t) * 100;
      lines.push(`Fireball ${fmtDist(r)} across ${r >= fb.max_radius_m * 0.999 ? "(full size)" : "(growing)"}, ${got < 79 ? `${got.toFixed(0)}% of its heat given off` : "at least 80% of its heat given off"}`);
    } else fireball.visible = false;

    // air blast: shell in the air, ring on the water
    const ab = data.air_blast;
    if (ab && t > 0 && t <= ab.t_s[ab.t_s.length - 1]) {
      const slant = interpLogT(ab.t_s, ab.slant_radius_m, t), ground = interpLogT(ab.t_s, ab.ground_radius_m, t);
      blastShell.visible = slant > 0 && slant < 3 * R;
      blastShell.scale.setScalar(Math.max(slant, 0.1) / 1000); blastShell.position.set(0, by, 0);
      const pk = ground > 0 ? interpLogT(ab.t_s, ab.peak_kpa, t) : null;
      const weak = pk != null && pk < ab.negligible_kpa;
      blastRing.visible = ground > 0 && !weak;
      blastRing.scale.setScalar(Math.max(ground, 1) / 1000);
      blastRing.material.opacity = pk ? Math.min(Math.max(0.3 + 0.25 * Math.log10(pk), 0.25), 1) : 0.5;
      if (ground > 0) lines.push(`Air blast front ${fmtDist(ground)} from ground zero` + (pk ? (weak ? " (now too weak to matter)" : `, peak ${fmtNum(pk)} kPa there`) : ""));
      else lines.push(`Air blast front ${fmtDist(slant)} from the burst, not yet at the water (reaches it at ${fmtTime(ab.reaches_water_s)})`);
    } else { blastShell.visible = blastRing.visible = false; }

    // water shock (underwater or touching the water): a circle on the cut-away
    const ws = data.water_shock;
    const wd = sc.env.water_depth_m, bottom = -Math.min(D, wd || D);
    if (ws && t > 0) {
      const r = ws.speed_m_s * t, z0 = ws.source_z_m;
      const pts = [];
      for (let k = 0; k <= 96; k++) {
        const th = -Math.PI / 2 + (Math.PI * k) / 96;   // -90..+90 degrees (straight down .. straight up)
        const x = r * Math.cos(th), z = z0 + r * Math.sin(th);
        if (x >= 0 && x <= R && z <= 0 && z >= bottom) pts.push(new THREE.Vector3(x / 1000, toY(z), 0.003));
      }
      arc.visible = pts.length > 1;
      arc.geometry.dispose(); arc.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      const surf = r > -z0 ? Math.sqrt(r * r - z0 * z0) : 0;
      waterShockRing.visible = surf > 0 && surf < 3 * R;
      waterShockRing.scale.setScalar(Math.max(surf, 1) / 1000);
      if (r < 3 * R) lines.push(`Shock in the water ${fmtDist(r)} from the burst (travels at ${Math.round(ws.speed_m_s)} m/s)`);
    } else { arc.visible = waterShockRing.visible = false; }

    // waves
    const wv = data.waves;
    if (wv && t > 0) {
      const rMax = wv.max_wave_speed_m_s * t, rFront = wv.front_speed_m_s * t;
      const hHi = interpLogT(wv.ranges_m, wv.height_high_m, Math.max(rMax, wv.ranges_m[0]), wv.height_high_m[0]);
      waveRing.visible = rMax > 0;
      waveRing.scale.setScalar(Math.max(rMax, 1) / 1000);
      waveRing.material.opacity = Math.min(Math.max(0.35 + 0.2 * Math.log10(Math.max(hHi, 1e-3)), 0.25), 1);
      waveFront.visible = !!wd && rFront > 0;   // deep open ocean: the first-wave speed is not meaningful (see notes)
      waveFront.scale.setScalar(Math.max(rFront, 1) / 1000);
      waveFront.material.opacity = 0.35;
      lines.push(`Biggest waves ${fmtDist(rMax)} out, up to ${fmtNum(hHi)} m crest-to-trough there`);
    } else { waveRing.visible = waveFront.visible = false; }

    // fallout
    const fo = data.fallout;
    if (fo && t > 0) {
      const reach = fo.wind_m_s * t;
      const key = `${Math.round(Math.log(reach) * 40)}|${Math.round(Math.log(Math.max(t / 3600, 1)) * 10)}|${R}`;
      if (key !== falloutKey || dirty) { falloutKey = key; dirty = false; paintFallout(fo, reach, R); }
      falloutMesh.visible = true;
      falloutMesh.scale.set(2 * Rk, 2 * Rk, 1);
      const longest = Math.max(...fo.contours.map((c) => c.downwind_m));
      lines.push(reach < longest ? `Fallout landing up to ${fmtDist(reach)} downwind (carried by the wind)`
        : `Fallout has landed over the whole pattern (${fmtDist(longest)} downwind); decaying${t > 3600 ? `: ${(100 * Math.pow(t / 3600, -1.2)).toPrecision(2)}% of the 1-hour level` : ""}`);
    } else falloutMesh.visible = false;
    if (t > 0 && t <= 60 && sc.burst.z_m >= 0) lines.push("Initial radiation (neutrons and gamma rays) is arriving during this first minute");

    // receivers: colour by the worst effect that has already happened
    const byId = Object.fromEntries((data.receivers || []).map((r) => [r.id, r]));
    for (const m of receiverGroup.children) {
      const rt = byId[m.userData.id];
      if (!rt || !m.material?.color) continue;
      if (m.userData.tlEmissive == null) m.userData.tlEmissive = m.material.emissive?.getHex() ?? 0;
      if (rt.error) continue;
      const arrived = (rt.effects || []).filter((e) => e.onset_s != null && e.onset_s <= t);
      const worst = arrived.reduce((w, e) => Math.max(w, LEVELS.indexOf(e.level)), -1);
      const somethingArrived = arrived.length || (rt.pulse && t >= rt.pulse.arrival_s) || (rt.fallout && t >= rt.fallout.arrival_s);
      m.material.color.set(worst >= 0 ? levelColor({ worst: LEVELS[worst] }) : somethingArrived ? levelColor({ worst: "none" }) : NOT_YET);
      const hit = (rt.pulse && t >= rt.pulse.arrival_s && t <= rt.pulse.end_s) ||
        (rt.waves && rt.waves.height_high_m > 0 && Math.abs(t - rt.waves.max_wave_arrival_s) < 0.5 * data.waves.period_s);
      m.material.emissive?.setHex(hit ? 0xffffff : m.userData.tlEmissive);
    }

    q(".tl-what").textContent = lines[0] || (t >= tEnd ? "End: everything shown has happened" : "");
    renderNow(lines, byId[state.selected]);
  }

  // ---------- the "at this moment" box
  let lastHtml = "";
  function renderNow(lines, rt) {
    let html = `<b>At t = ${esc(fmtTime(t))}</b>`;
    if (lines.length) html += `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    const r = rt && state.receivers.find((x) => x.id === rt.id);
    if (r) {
      html += `<div class="tl-rec"><b>${r.emoji || ""} ${esc(r.label)}</b>`;
      if (rt.error) html += `<div class="tl-err">${esc(rt.error)}</div>`;
      const p = rt.pulse;
      if (p) {
        const what = p.medium === "air" ? "Air blast" : "Pressure pulse in the water";
        if (t < p.arrival_s) html += `<div>${what}: not here yet (arrives at ${fmtTime(p.arrival_s)}, in ${fmtTime(p.arrival_s - t)})</div>`;
        else if (t <= p.end_s) html += `<div class="tl-hit">${what}: passing now, ${fmtNum(Math.max(interpLin(p.t_s, p.p_kpa, t), 0))} kPa (peak ${fmtNum(p.peak_kpa)} kPa)</div>`;
        else html += `<div>${what}: has passed (peak ${fmtNum(p.peak_kpa)} kPa at ${fmtTime(p.peak_s)})</div>`;
      }
      const w = rt.waves;
      if (w && w.height_high_m > 0) {
        html += t < w.max_wave_arrival_s
          ? `<div>Biggest waves (up to ${fmtNum(w.height_high_m)} m): arrive at ${fmtTime(w.max_wave_arrival_s)}</div>`
          : `<div>Biggest waves (${fmtNum(w.height_low_m)}–${fmtNum(w.height_high_m)} m) have reached it</div>`;
      }
      const f = rt.fallout;
      if (f) {
        if (t < f.arrival_s) html += `<div>Fallout: arrives at ${fmtTime(f.arrival_s)}</div>`;
        else {
          const ts = f.t_s;
          const lo = interpLogT(ts, f.rate_low_ugy_h, t, f.rate_low_ugy_h[0]), hi = interpLogT(ts, f.rate_high_ugy_h, t, f.rate_high_ugy_h[0]);
          const dlo = interpLogT(ts, f.dose_low_gy, t), dhi = interpLogT(ts, f.dose_high_gy, t);
          html += `<div>Fallout dose rate now ${fmtNum(lo)}–${fmtNum(hi)} µGy/h; fallout dose so far ${fmtNum(dlo)}–${fmtNum(dhi)} Gy</div>`;
        }
      }
      for (const e of rt.effects || []) {
        const done = e.onset_s != null && e.onset_s <= t;
        const radNow = e.name.startsWith("radiation") && t > 0 && t < 60;
        html += `<div class="tl-eff">${done ? `<span class="level lv-${e.level}">${e.level}</span>` : `<span class="tl-pending">${radNow ? "arriving" : "not yet"}</span>`} ${esc(e.name)}` +
          `${done ? ` · ${esc(e.value)}` : e.onset_s != null ? ` · at ${fmtTime(e.onset_s)}` : ""}</div>`;
      }
      if (rt.notes?.length) html += `<details><summary>timing notes</summary><ul>${rt.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>`;
      html += `</div>`;
    } else html += `<div class="tl-muted">Click something in the sea to follow it through time.</div>`;
    if (data.notes?.length) html += `<details><summary>What is approximate in this timeline</summary><ul>${data.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>`;
    if (html !== lastHtml) {
      // keep <details> open/closed as the user left them
      const open = [...now.querySelectorAll("details")].map((d) => d.open);
      now.innerHTML = html; lastHtml = html;
      now.querySelectorAll("details").forEach((d, i) => { if (open[i]) d.open = true; });
    }
  }

  const api = {
    update, setTime: setT, getTime: () => t,
    getData: () => data,                                                   // used by realistic.js
    play: () => { if (!playing) playBtn.click(); },                        // used by realistic.js
    isAtEnd: () => t >= tEnd,
    isPlaying: () => playing,
    togglePlay: () => playBtn.click(),
    pause: () => { if (playing) playBtn.click(); },
    step: (dir) => setT(tOf(Math.min(Math.max(uOf(Math.max(t, T0)) + 0.02 * dir, 0), 1))),   // 1/50 of the slider
    toStart: () => setT(0),
    toEnd: () => q(".tl-end").click(),
  };
  window.nukesimTimeline = api;   // handy for trying things in the browser console
  return api;
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
