// "Dive into the deep": scroll from the sea surface down to the deep ocean floor. At each depth, the
// animals that live there (the same 3D models as the rest of the site, swimming) and what the chosen
// burst would do to them at a chosen distance.
//
// The verdicts come from the same injury models as everything else (/api/assess); this page only
// arranges them by depth. Typical depths, lengths and water temperatures are rounded field-guide values.
//
// How it is drawn: the page (cards, labels) is ordinary HTML that scrolls. Behind it is one WebGL canvas:
//  * a full-screen shader paints the sea for whatever depth each pixel is at: the sky and the wavy surface,
//    sun rays and shimmer near the top, the water getting darker and bluer, drifting "marine snow",
//    glowing animals in the dark, a lamp, and the sandy floor at the bottom;
//  * the animals are drawn on top with an orthographic camera (1 unit = 1 screen pixel), each one placed
//    on its empty slot in the HTML, so they scroll exactly with their cards.

import * as THREE from "three";
import { BOMBS, VERDICT, WHERE, reason } from "./simple.js";
import { esc } from "./ui.js";
import { createAnimal, hasAnimal } from "./animals.js";
import { humansReady } from "./humans.js";
import { makeModel } from "./models.js";

const LV = ["none", "possible", "likely", "severe", "lethal"];
const COL = { none: "#3fbf7f", possible: "#e3bb2a", likely: "#f0903a", severe: "#ef5a3c", lethal: "#d42a2a" };

// [key, name, depth (m), length (m), kind, mass (kg), extra, note, how many (a school)]
const LIFE = [
  ["sardine", "Sardines", 10, 0.2, "fish", 0.1, { swim_bladder: true }, "Swim in huge shoals near the surface.", 9],
  ["diver", "Scuba diver", 18, 1.8, "diver", 75, {}, "Holiday divers rarely go below 40 m.", 1],
  ["dolphin", "Bottlenose dolphin", 30, 2.5, "mammal", 200, { hearing_group: "HF" }, "Most of its dives are shallow and short.", 2],
  ["green", "Green turtle", 40, 1.1, "turtle", 150, {}, "Grazes on seagrass in shallow water.", 1],
  ["cod", "Atlantic cod", 80, 0.9, "fish", 5, { swim_bladder: true }, "Lives near the bottom of the continental shelf.", 3],
  ["humpback", "Humpback whale", 120, 14, "mammal", 30000, { hearing_group: "LF" }, "Feeds anywhere from the surface to about 200 m.", 1],
  ["tuna", "Bluefin tuna", 150, 2.5, "fish", 250, { swim_bladder: true }, "A fast hunter that dives deep after prey.", 2],
  ["shark", "Great white shark", 300, 4.5, "fish", 1000, { swim_bladder: false }, "Has no swim bladder: an oily liver keeps it afloat.", 1],
  ["lantern", "Lanternfish", 600, 0.08, "fish", 0.005, { swim_bladder: true }, "Tiny fish with glowing spots. Many have a gas-filled swim bladder.", 9],
  ["sperm", "Sperm whale", 1200, 14, "mammal", 35000, { hearing_group: "HF" }, "Dives over a kilometre down to hunt squid.", 1],
  ["angler", "Deep-sea anglerfish", 2000, 0.4, "fish", 0.5, { swim_bladder: false }, "Lures prey with a glowing bait in total darkness.", 1],
  ["beaked", "Cuvier's beaked whale", 2900, 6, "mammal", 2500, { hearing_group: "HF" }, "The deepest-diving mammal known: almost 3 km.", 1],
  ["grenadier", "Grenadier (rattail)", 3600, 0.8, "fish", 1, { swim_bladder: true }, "Cruises just above the deep ocean floor.", 3],
];
const FLOOR = 3700;              // the average ocean is about 3,700 m deep
const TOP = 620;                 // where the sea surface is on the page (pixels); the title sits in the sky above it
const GAP = 540;                 // pixels between one animal and the next
// page position <-> depth: evenly spaced animals, straight lines in between (so every card sits at its real depth)
const AY = [TOP, ...LIFE.map((_, i) => TOP + GAP * (i + 1)), TOP + GAP * (LIFE.length + 1)];
const AD = [0, ...LIFE.map((l) => l[2]), FLOOR];
const FLOOR_Y = AY[AY.length - 1];
const PAGE_H = FLOOR_Y + 560;
function depthAt(y) {
  if (y <= TOP) return (y - TOP) * 0.05;
  for (let i = 0; i < AY.length - 1; i++) if (y <= AY[i + 1]) return AD[i] + (AD[i + 1] - AD[i]) * (y - AY[i]) / (AY[i + 1] - AY[i]);
  return FLOOR;
}
function yAt(d) {
  if (d <= 0) return TOP;
  for (let i = 0; i < AD.length - 1; i++) if (d <= AD[i + 1]) return AY[i] + (AY[i + 1] - AY[i]) * (d - AD[i]) / (AD[i + 1] - AD[i]);
  return FLOOR_Y;
}
const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${+(m / 1000).toPrecision(2)} km`);
const fmtLen = (m) => (m < 1 ? `${Math.round(m * 100)} cm` : `${+m.toPrecision(2)} m`);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// what it is like at a depth (rounded, typical open-ocean values)
const pressure = (d) => 1 + d / 10.06;                                     // atmospheres: one more for every ~10 m of sea water
function lightText(d) {
  if (d < 0.5) return "full sunlight";
  if (d < 200) { const p = 100 * Math.exp(-d / 43); return `${p >= 1 ? Math.round(p) : +p.toPrecision(1)}% of the sunlight`; }   // clear ocean: 1% left at ~200 m
  return d < 1000 ? "only a faint blue glow" : "no sunlight at all";
}
function tempC(d) {   // a typical mid-latitude ocean: warm on top, a fast drop (the thermocline), then near-freezing
  if (d < 50) return 18;
  if (d < 1000) return 18 - 14 * Math.log(d / 50) / Math.log(20);
  return 4 - 2 * Math.min(1, (d - 1000) / 2700);
}

// ------------------------------------------------------------------ the painted sea (full-screen shader)
const SEA_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes; uniform float uDpr, uScroll, uTime, uFloorY;
uniform float uY[16]; uniform float uD[16]; uniform int uN;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float depthAt(float y) {
  if (y <= uY[0]) return (y - uY[0]) * 0.05;
  for (int i = 0; i < 15; i++) {
    if (i + 1 >= uN) break;
    if (y <= uY[i + 1]) return mix(uD[i], uD[i + 1], (y - uY[i]) / (uY[i + 1] - uY[i]));
  }
  return uD[uN - 1];
}
vec3 water(float d) {          // the colour of the open sea, getting darker and bluer with depth
  float t = log(1.0 + max(d, 0.0) / 6.0);
  vec3 c = vec3(0.32, 0.70, 0.86);
  c = mix(c, vec3(0.13, 0.50, 0.71), smoothstep(0.0, 1.3, t));
  c = mix(c, vec3(0.05, 0.30, 0.49), smoothstep(1.3, 2.6, t));
  c = mix(c, vec3(0.025, 0.16, 0.29), smoothstep(2.6, 3.5, t));
  c = mix(c, vec3(0.010, 0.065, 0.13), smoothstep(3.5, 4.6, t));
  c = mix(c, vec3(0.006, 0.028, 0.06), smoothstep(4.6, 5.1, t));
  c = mix(c, vec3(0.004, 0.012, 0.03), smoothstep(5.1, 6.4, t));
  return c;
}
// specks in a grid of cells, one (or none) per cell; p in pixels
float specks(vec2 p, float cell, float seed, float keep, float size) {
  vec2 id = floor(p / cell), f = fract(p / cell);
  if (hash(id + seed) > keep) return 0.0;
  vec2 c = 0.15 + 0.7 * vec2(hash(id + seed + 1.7), hash(id + seed + 9.1));
  float r = length((f - c) * cell), s = size * (0.5 + hash(id + seed + 4.2));
  return smoothstep(s + 0.9, s - 0.3, r);
}
void main() {
  float x = gl_FragCoord.x / uDpr, fy = uRes.y - gl_FragCoord.y / uDpr;   // CSS pixels from the top-left
  float py = uScroll + fy, d = depthAt(py), t = uTime;
  vec3 col;
  float surf = uY[0] + 5.0 * sin(x * 0.018 + t * 1.1) + 3.0 * sin(x * 0.047 - t * 1.7) + 1.4 * sin(x * 0.11 + t * 2.3);
  if (py < surf) {
    // the sky, with a soft sun
    col = mix(vec3(0.55, 0.78, 0.93), vec3(0.90, 0.96, 0.99), smoothstep(0.0, uY[0], py));
    col += vec3(1.0, 0.95, 0.8) * 0.35 * exp(-length(vec2(x - uRes.x * 0.78, py - uY[0] * 0.25)) / 140.0);
    col = mix(col, vec3(0.97, 0.99, 1.0), smoothstep(surf - 3.0, surf, py) * 0.8);   // a bright line of foam
  } else {
    float below = py - surf;
    col = water(d);
    col += vec3(0.30, 0.55, 0.62) * exp(-below / 9.0) * 0.9;                    // the bright underside of the surface
    // rippling light (caustics) just under the surface
    float cx = sin(x * 0.045 + sin(py * 0.031 + t * 0.9) * 1.6) * sin(py * 0.052 + sin(x * 0.038 - t * 0.7) * 1.6);
    col += vec3(0.5, 0.8, 0.85) * pow(abs(cx), 6.0) * exp(-below / 28.0) * 0.35;
    // slanting shafts of sunlight that fade with depth
    float a = x + below * 0.32;
    float r = sin(a * 0.010 + sin(a * 0.0031 + t * 0.12) * 3.0) * sin(a * 0.021 - t * 0.08 + 1.3);
    col += vec3(0.55, 0.85, 0.95) * smoothstep(0.25, 1.0, r) * exp(-max(d, 0.0) / 50.0) * 0.20 * smoothstep(0.0, 25.0, below);
    // our lamp, which matters once the sunlight is gone
    vec2 q = vec2(x - uRes.x * 0.5, fy - uRes.y * 0.5);
    float lamp = exp(-dot(q, q) / (2.0 * 380.0 * 380.0)) * smoothstep(120.0, 600.0, d);
    col += vec3(0.04, 0.085, 0.11) * lamp;
    // marine snow: bits of dead plankton drifting down, two layers at different distances
    float drift = sin(t * 0.3 + x * 0.01) * 6.0;
    float snow = specks(vec2(x + drift, uScroll * 0.55 + fy - t * 7.0), 46.0, 3.0, 0.55, 0.7)
               + 0.6 * specks(vec2(x - drift, uScroll * 0.35 + fy - t * 4.0), 31.0, 11.0, 0.5, 0.45);
    col += vec3(0.70, 0.82, 0.88) * snow * (0.10 + 0.30 * smoothstep(40.0, 300.0, d) + 0.35 * lamp);
    // animals that make their own light, blinking in the dark
    vec2 bp = vec2(x, uScroll * 0.8 + fy);
    vec2 bid = floor(bp / 80.0), bf = fract(bp / 80.0);
    float h = hash(bid + 21.0);
    if (h > 0.72) {
      vec2 bc = 0.2 + 0.6 * vec2(hash(bid + 5.3), hash(bid + 8.9));
      float rr = length((bf - bc) * 80.0);
      float blink = pow(max(0.0, sin(t * (0.5 + h) + h * 60.0)), 18.0);
      vec3 glow = mix(vec3(0.25, 1.0, 0.85), vec3(0.35, 0.6, 1.0), hash(bid + 2.2));
      col += glow * (exp(-rr * rr / 5.0) * 0.9 + exp(-rr / 9.0) * 0.18) * blink * smoothstep(220.0, 600.0, d);
    }
    // the deep floor: soft sand and pebbles, lit by the lamp
    float floorTop = uFloorY + 16.0 * sin(x * 0.0065 + 1.0) + 7.0 * sin(x * 0.023 + 2.0);
    if (py > floorTop - 2.0) {
      float g = hash(floor(vec2(x, py) / 3.0));
      vec3 sand = vec3(0.19, 0.16, 0.11) * (0.8 + 0.25 * g);
      sand += vec3(0.06, 0.05, 0.035) * specks(vec2(x, py), 23.0, 40.0, 0.35, 2.0);
      float lit = 0.18 + 1.5 * exp(-pow((x - uRes.x * 0.5) / 420.0, 2.0)) * exp(-pow((fy - uRes.y * 0.55) / 380.0, 2.0));
      col = mix(col, sand * lit, smoothstep(floorTop - 2.0, floorTop + 3.0, py));
    }
    // darker towards the edges of the screen in the deep, like looking out of a submarine
    vec2 v = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    col *= 1.0 - 0.45 * smoothstep(0.35, 1.1, length(v)) * smoothstep(60.0, 500.0, d);
  }
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;   // tiny noise: no visible colour banding
  gl_FragColor = vec4(col, 1.0);
}`;

// a soft round glow (for the anglerfish's bait)
function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(220,255,255,1)"); gr.addColorStop(0.25, "rgba(120,240,255,.6)"); gr.addColorStop(1, "rgba(80,200,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createDive({ api, toast }) {
  const el = document.createElement("div");
  el.id = "dive"; el.hidden = true;
  const f = (d) => ((yAt(d) - TOP) / (FLOOR_Y - TOP) * 100).toFixed(2);   // % down the depth gauge
  el.innerHTML = `
    <canvas class="dvGl" aria-hidden="true"></canvas>
    <div class="dvTop">
      <button class="dvBack">← Back</button>
      <select class="dvBomb" aria-label="Which bomb">${BOMBS.map((b) => `<option value="${b.key}">${esc(b.label)}</option>`).join("")}</select>
      <select class="dvWhere" aria-label="Where it goes off">${WHERE.map((w) => `<option value="${w.key}">${esc(w.label)}</option>`).join("")}</select>
      <label class="dvDist"><span>Distance<span class="dvLong"> from the burst</span></span><input type="range" min="0" max="1000" value="500"><b></b></label>
    </div>
    <div class="dvGauge" aria-hidden="true">
      <div class="dvTrack">
        <i class="dvBand" style="top:0;height:${f(200)}%"></i>
        <i class="dvBand tw" style="top:${f(200)}%;height:${(f(1000) - f(200)).toFixed(2)}%"></i>
        <i class="dvBand mid" style="top:${f(1000)}%;bottom:0"></i>
        <span style="top:${(f(200) / 2).toFixed(2)}%">Sunlight</span>
        <span style="top:${((+f(200) + +f(1000)) / 2).toFixed(2)}%">Twilight</span>
        <span style="top:${((+f(1000) + 100) / 2).toFixed(2)}%">Midnight</span>
        <em class="dvBurst"></em>
        <b class="dvMark"></b>
      </div>
      <div class="dvRead"><strong class="dvDepth">0 m</strong><span class="dvPress"></span><span class="dvLight"></span><span class="dvTemp"></span></div>
    </div>
    <div class="dvScroll"><div class="dvPage" style="height:${PAGE_H}px">
      <div class="dvTitle" style="top:120px"><h1>Dive into the deep</h1>
        <p>Scroll down through the ocean. At each depth you'll meet the animals that live there, and see what the burst would do to them.</p>
        <p class="dvHint"></p></div>
      <div class="dvCue" style="top:${TOP - 110}px">Scroll to dive<span>↓</span></div>
      ${LIFE.map(([k, name, depth, len, , , , note]) => `<section class="dvItem" data-k="${k}" style="top:${yAt(depth)}px">
        <div class="dvModel"></div>
        <div class="dvText"><div class="dvHead"><b>${esc(name)}</b><small>${depth.toLocaleString()} m deep · ${fmtLen(len)} long</small></div>
          <div class="dvVerdict">…</div><div class="dvWhy"></div><div class="dvNote">${esc(note)}</div></div></section>`).join("")}
      ${[[200, "200 m: the twilight zone. Sunlight is almost gone."], [1000, "1,000 m: the midnight zone. No sunlight ever reaches here."]]
        .map(([d, s]) => `<div class="dvZone" style="top:${yAt(d)}px"><span>${s}</span></div>`).join("")}
      <div class="dvFloor" style="top:${FLOOR_Y + 70}px"><b>The deep ocean floor</b>
        <p>The average ocean is about 3,700 m deep. The water here presses down about ${Math.round(pressure(FLOOR))} times harder than the air at the surface.</p>
        <button class="dvUp">Back to the surface ↑</button></div>
    </div></div>`;
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const scroll = q(".dvScroll"), slider = q(".dvDist input"), canvas = q(".dvGl");
  let choice = null, scale = 1000, open = false;

  // ---------------------------------------------------------------- 3D
  let renderer = null, sea = null, seaScene, seaCam, scene, cam, hemi, sun, lamp, rim, glowTex;
  const items = LIFE.map((l) => ({ l, slot: null, card: null, g: null, fish: [], ph: Math.random() * 6, yaw: 0, x: 0 }));
  function setup3d() {
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
    catch (e) { console.warn("Dive: no WebGL, plain background only", e); return; }
    // phones: fewer pixels (the sea is soft anyway), so it stays smooth
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia("(pointer: coarse)").matches ? 1.25 : 1.75));
    renderer.autoClear = false;
    seaScene = new THREE.Scene(); seaCam = new THREE.Camera();
    sea = new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: SEA_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2() }, uDpr: { value: 1 }, uScroll: { value: 0 }, uTime: { value: 0 }, uFloorY: { value: FLOOR_Y },
        uY: { value: [...AY, ...Array(16 - AY.length).fill(0)] }, uD: { value: [...AD, ...Array(16 - AD.length).fill(0)] }, uN: { value: AY.length },
      },
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(tri, sea); quad.frustumCulled = false;
    seaScene.add(quad);

    scene = new THREE.Scene();
    cam = new THREE.OrthographicCamera(0, 1, 0, -1, -3000, 3000);
    hemi = new THREE.HemisphereLight(0xdff2ff, 0x16384f, 1.2);
    sun = new THREE.DirectionalLight(0xfff6e6, 1.6); sun.position.set(0.3, 1, 0.5);
    lamp = new THREE.DirectionalLight(0xe2f2ff, 0); lamp.position.set(-0.2, 0.25, 1);
    rim = new THREE.DirectionalLight(0x9fd8ff, 0); rim.position.set(0.2, 0.8, -1);   // a cool edge light, so dark animals stand out
    scene.add(hemi, sun, lamp, rim);
    glowTex = glowTexture();
  }

  // the model(s) of one animal, once the 3D models have loaded
  function build(it) {
    const [key, , , len, kind, , , , n] = it.l;
    if (kind === "diver" ? !humansReady() : !hasAnimal(key)) return;
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      let m;
      if (kind === "diver") { m = makeModel({ kind: "diver" }, "#fff"); if (m.userData.ring) m.userData.ring.visible = false; }
      else m = createAnimal(key)?.g;
      if (!m) return;
      const holder = new THREE.Group(); holder.add(m);
      // a loose school: spread out, each fish a little different in size and timing
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, r = n > 1 ? 0.35 + 0.65 * Math.sqrt((i + 0.5) / n) : 0;
      holder.userData = { ox: Math.cos(a) * r * 1.9, oy: Math.sin(a) * r * 0.9, oz: (Math.random() - 0.5) * 0.6, s: 0.85 + Math.random() * 0.3, ph: Math.random() * 6 };
      g.add(holder);
      if (key === "angler") {   // the glowing bait on its stalk, in front of the head
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0x2a221e }));
        stalk.position.set(0.5, 0.24, 0); stalk.rotation.z = -0.9;
        const bait = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        bait.position.set(0.63, 0.33, 0); bait.scale.setScalar(0.22); bait.userData.bait = true;
        holder.add(stalk, bait);
      }
      if (key === "lantern") {  // rows of little light organs along the belly
        const dot = new THREE.MeshBasicMaterial({ color: 0x8ff3ff });
        for (let j = 0; j < 6; j++) for (const z of [-0.05, 0.05]) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 4), dot);
          s.position.set(-0.28 + j * 0.11, -0.07, z); holder.add(s);
        }
      }
    }
    it.g = g; it.len = len;
    scene.add(g);
  }

  function frame(now) {
    if (!open || !renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      renderer.setSize(w, h, false);
      cam.left = 0; cam.right = w; cam.top = 0; cam.bottom = -h; cam.updateProjectionMatrix();
    }
    const t = now / 1000, top = canvas.getBoundingClientRect().top;
    const u = sea.uniforms;
    u.uRes.value.set(w, h); u.uDpr.value = dpr; u.uTime.value = t % 1000;
    u.uScroll.value = scroll.scrollTop + (scroll.getBoundingClientRect().top - top);   // page y at the canvas's top edge

    // lights follow the depth in the middle of the screen: the sun fades, our lamp comes on
    const dc = Math.max(0, depthAt(u.uScroll.value + h / 2)), sunF = Math.exp(-dc / 70);
    hemi.intensity = 0.35 + 1.25 * sunF; sun.intensity = 1.7 * sunF;
    hemi.color.setRGB(0.55 + 0.33 * sunF, 0.75 + 0.2 * sunF, 1);
    const deep = smooth(60, 400, dc);
    lamp.intensity = 0.2 + 3.2 * deep; rim.intensity = 2.2 * deep;

    const narrow = w < 700;
    for (const it of items) {
      if (!it.g) { build(it); if (!it.g) continue; }
      const r = it.slot.getBoundingClientRect();
      const cy = r.top + r.height / 2 - top;
      it.g.visible = cy > -260 && cy < h + 260;
      if (!it.g.visible) continue;
      // shown bigger than life for the small ones (lengths are in the card), but bigger animals still look bigger
      const L = Math.min(Math.max(96 * Math.pow(it.len, 0.42), it.g.children.length > 1 ? 50 : 115) * (narrow ? 0.75 : 1), r.width * 0.8);
      // swim slowly back and forth across the slot, turning round at each end (a school stays inside it too)
      const half = L * (it.g.children.length > 1 ? 2.3 : 0.55);
      const span = Math.max(0, Math.min(r.width * 0.5 - half, 150)), sp = 0.32 / (1 + it.len / 6);
      const s = Math.sin(t * sp + it.ph), dir = Math.cos(t * sp + it.ph) >= 0 ? 1 : -1;
      const want = dir > 0 ? -0.35 : Math.PI + 0.35;
      it.yaw += (want - it.yaw) * 0.04;   // turn round gently
      it.g.position.set(r.left + r.width / 2 + s * span, -cy, 0);
      for (const fish of it.g.children) {
        const o = fish.userData;
        fish.scale.setScalar(L * o.s);
        fish.position.set((o.ox + 0.15 * Math.sin(t * 0.9 + o.ph)) * L, (o.oy + 0.12 * Math.sin(t * 1.3 + o.ph)) * L, o.oz * L);
        fish.rotation.set(0, it.yaw + 0.12 * Math.sin(t * 0.7 + o.ph), 0.06 * Math.sin(t * 1.1 + o.ph));
        for (const c of fish.children) if (c.userData.bait) c.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.3 + o.ph);
      }
    }
    renderer.clear();
    renderer.render(seaScene, seaCam);
    renderer.clearDepth();
    renderer.render(scene, cam);
  }

  // ---------------------------------------------------------------- the depth gauge
  const mark = q(".dvMark"), dEl = q(".dvDepth");
  function onScroll() {
    const mid = scroll.scrollTop + scroll.clientHeight / 2, d = Math.max(0, depthAt(mid));
    mark.style.top = `${Math.min(100, Math.max(0, (mid - TOP) / (FLOOR_Y - TOP) * 100))}%`;
    dEl.textContent = `${Math.round(d).toLocaleString()} m`;
    const p = pressure(d);
    q(".dvPress").textContent = `Pressure: ${p < 10 ? p.toFixed(1) : Math.round(p)}× the surface`;
    q(".dvLight").textContent = `Light: ${lightText(d)}`;
    q(".dvTemp").textContent = `Water: about ${Math.round(tempC(d))} °C`;
    q(".dvCue").style.opacity = scroll.scrollTop > 60 ? 0 : 1;
  }
  scroll.addEventListener("scroll", onScroll, { passive: true });

  // the page scrolls below the bar of controls, however tall it is (it wraps onto more rows on a phone)
  const fitTop = () => { const t = `${q(".dvTop").offsetHeight}px`; scroll.style.top = t; canvas.style.top = t; q(".dvGauge").style.top = t; el.style.setProperty("--dvTop", t); };
  window.addEventListener("resize", () => { if (open) { fitTop(); onScroll(); } });

  // ---------------------------------------------------------------- the verdicts
  const distOf = (v) => scale * Math.pow(10, (v - 500) / 400);   // the slider moves in steps of ratio, around the scale
  function burst() {
    const b = BOMBS.find((x) => x.key === choice.bomb), k = Math.cbrt(b.kt / 15);
    const z_m = choice.where === "sky" ? Math.round(580 * k) : choice.where === "surface" ? 0 : -Math.round(27 * Math.cbrt(b.kt / 23));
    return { b, z_m };
  }
  let timer = null, asked = 0;
  async function compute() {
    const { b, z_m } = burst(), x = distOf(+slider.value), mine = ++asked;
    q(".dvDist b").textContent = fmtKm(x);
    q(".dvHint").textContent = choice.where === "sky"
      ? "Water is a good shield: most of an air burst's blast bounces off the sea. Try “Underwater” to see how far down a shock reaches."
      : "Underwater, the shock travels through the sea at 1,500 m/s and reaches a long way down.";
    const bm = q(".dvBurst");
    bm.style.top = `${z_m < 0 ? f(-z_m) : 0}%`;
    bm.textContent = z_m < 0 ? `burst ${-z_m} m down` : z_m > 0 ? "burst above the sea" : "burst at the surface";
    el.querySelectorAll(".dvItem").forEach((n) => n.classList.add("busy"));
    try {
      const res = await api("/api/assess", {
        burst: { yield_kt: b.kt, z_m, fission_fraction: 1, wind_mph: 15 }, env: { water_depth_m: null }, long_term: false,
        receivers: LIFE.map(([k, , depth, , kind, mass, extra]) => ({ id: k, kind, x_m: x, y_m: 0, z_m: -depth, mass_kg: mass, ...extra })),
      });
      if (mine !== asked) return;   // a newer answer is on its way
      for (const r of res.receivers) {
        const item = q(`.dvItem[data-k="${r.id}"]`), life = LIFE.find((l) => l[0] === r.id);
        if (!item) continue;
        item.classList.remove("busy");
        const v = item.querySelector(".dvVerdict");
        if (r.error) { v.textContent = "–"; continue; }
        const worst = [...r.effects].sort((a, c) => LV.indexOf(c.level) - LV.indexOf(a.level))[0];
        const lv = r.worst || "none";
        v.textContent = VERDICT[lv];
        const why = worst && LV.indexOf(worst.level) > 0 ? reason(worst, life[4]) : "too far away for anything serious to reach it";
        item.querySelector(".dvWhy").textContent = why.charAt(0).toUpperCase() + why.slice(1) + ".";
        item.style.setProperty("--c", COL[lv]);
      }
    } catch (err) { toast(`Could not work it out: ${err.message}`, { kind: "err" }); }
  }
  slider.addEventListener("input", () => { q(".dvDist b").textContent = fmtKm(distOf(+slider.value)); clearTimeout(timer); timer = setTimeout(compute, 250); });
  q(".dvBack").addEventListener("click", () => { el.hidden = true; open = false; });
  q(".dvUp").addEventListener("click", () => scroll.scrollTo({ top: 0, behavior: "smooth" }));
  q(".dvBomb").addEventListener("change", (e) => { choice.bomb = e.target.value; scale = 1100 * Math.cbrt(BOMBS.find((x) => x.key === choice.bomb).kt / 15); compute(); });
  q(".dvWhere").addEventListener("change", (e) => { choice.where = e.target.value; compute(); });
  items.forEach((it) => { const n = q(`.dvItem[data-k="${it.l[0]}"]`); it.slot = n.querySelector(".dvModel"); it.card = n; });

  return {
    open(c) {
      choice = { ...c };
      const b = BOMBS.find((x) => x.key === choice.bomb);
      scale = 1100 * Math.cbrt(b.kt / 15);   // the same distance scale as the film
      slider.value = 500;
      q(".dvBomb").value = choice.bomb; q(".dvWhere").value = choice.where;
      el.hidden = false; open = true;
      if (!renderer) setup3d();
      fitTop();
      scroll.scrollTop = 0; onScroll();
      compute();
    },
    isOpen: () => open,
    frame,
  };
}
