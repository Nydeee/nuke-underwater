// Realistic view: sky, sun, animated ocean, fireball, mushroom cloud (or water column),
// blast front, waves, and the animals/boats as 3D models.
//
// Everything is in METRES here (the technical view uses kilometres), because the ocean
// shader's ripple maths assumes metre-scale distances.
//
// What is physics and what is decoration:
//   * fireball size and brightness, blast front, wave positions/heights: the timeline data
//     from the server (the same validated models as everything else);
//   * mushroom cloud size and rise: curve fits to Glasstone & Dolan (1977) Figs. 2.12 and
//     9.96 and Miller (1963), as implemented in NUKEMAP; stem width from Glasstone sec. 2.17.
//     The puffy SHAPE is illustrative;
//   * underwater-burst water column: illustrative, sized from the 1946 BAKER test
//     (Glasstone sec. 2.68) with cube-root scaling (our assumption);
//   * sky, sun, ripples, colours: decoration.
//   * underwater mode (camera below the surface): see underwater.js.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCameraTween } from "./freecam.js";
import { fmtDepth } from "./units.js";
import { setBase, pose } from "./reactions.js";
import { Water } from "three/addons/objects/Water.js";
import { makeModel, realLength, bombModel, canisterModel, bargeModel } from "./models.js";
import { bakeAnimal } from "./animals.js";
import { drawIcon } from "./icons.js";
import { iconOf } from "./species.js";
import { initUnderwater } from "./underwater.js";
import { fireballMaterial, puffTextures, glareTexture, makeStars, cloudDeck } from "./fx.js";
import { polarSea, patchWater, updateWaves, etaAt } from "./waves3d.js";
import { createSpray } from "./spray.js";
import { createRagdolls, pushSpeed } from "./ragdoll.js";
import { createSchools } from "./schools.js";
import { buildBikini } from "./places.js";

const FT = 0.3048;

// ---------------------------------------------------------------- cloud size (NUKEMAP fits, feet -> metres)
// Glasstone Fig. 9.96 fits (cloud top / bottom, stabilised, ~10 min). Yield in kt.
export function cloudTopM(y) {
  let kft;
  if (y <= 100) kft = 9.0355598798544854 * Math.pow(y, 0.32095070520890268 - 4.7081309288753766e-5 * y) + 0.081777330384279173;
  else kft = 23.037246630847605 * Math.pow(Math.min(y, 4000), 0.15119655810555122 - 4.634742640937322 / Math.min(y, 4000)) + 1.4709881303279233;
  // above 4 Mt NUKEMAP's third branch looks unreliable; we hold the 4 Mt shape and scale gently (assumption)
  if (y > 4000) kft *= Math.pow(y / 4000, 0.1);
  return kft * 1000 * FT;
}
function cloudBottomM(y) {
  const s = y / 524029.66478808509;
  return (171.54976807456771 * Math.pow(s, 0.2544529219292091) * Math.exp(s) - 0.32665357749287349) * 1000 * FT;
}
// Miller (1963): final horizontal semi-axis of the cloud top, a = 2340 W^0.431 ft
const cloudRadiusM = (y) => 2340 * Math.pow(y, 0.431) * FT;
// Glasstone Fig. 2.12 fit: fraction of final top height reached at time t (s); 1 after 270 s
export function riseFraction(t) {
  if (t >= 270) return 1;
  return Math.max(0, 9.7225115080563657e-3 + 7.9925510016408026e-3 * t - 1.8866872395194888e-5 * t * t + 1.0765594837466863e-8 * t * t * t);
}
// Glasstone sec. 2.17: stem radius ~ 1/2 of cloud radius below ~20 kt, 1/5 to 1/10 in the megaton range
function stemRatio(y) {
  if (y <= 20) return 0.5;
  if (y >= 1000) return 0.15;
  return 0.5 + (0.15 - 0.5) * Math.log10(y / 20) / Math.log10(50);
}

// ---------------------------------------------------------------- procedural textures
function rippleNormals() {
  // a tileable normal map made from a few sine waves and noise
  const n = 256, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d"), img = g.createImageData(n, n);
  const waves = [];
  for (let k = 0; k < 18; k++) {
    const kx = Math.round((Math.random() - 0.5) * 16), ky = Math.round((Math.random() - 0.5) * 16);
    waves.push([kx, ky, Math.random() * Math.PI * 2, 1 / (1 + Math.hypot(kx, ky))]);
  }
  const h = (x, y) => waves.reduce((s, [kx, ky, ph, a]) => s + a * Math.sin(2 * Math.PI * (kx * x + ky * y) / n + ph), 0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const v = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
    img.data.set([(v.x * 0.5 + 0.5) * 255, (v.y * 0.5 + 0.5) * 255, (v.z * 0.5 + 0.5) * 255, 255], 4 * (y * n + x));
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function puffTexture() {
  const n = 128, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  for (let k = 0; k < 14; k++) {   // a few overlapping soft blobs = a cauliflower-like puff
    const x = n / 2 + (Math.random() - 0.5) * n * 0.35, y = n / 2 + (Math.random() - 0.5) * n * 0.35, r = n * (0.18 + Math.random() * 0.17);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }
  return new THREE.CanvasTexture(c);
}

function glowTexture() {
  const n = 128, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d"), grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, "rgba(255,250,220,1)");
  grad.addColorStop(0.25, "rgba(255,200,120,0.7)");
  grad.addColorStop(1, "rgba(255,120,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
}

function pinTexture(name, ring, selected = false) {
  const n = 128, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  if (selected) {   // white halo around the selected one
    g.beginPath(); g.arc(n / 2, n / 2, n * 0.48, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,0.9)"; g.fill();
  }
  g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, Math.PI * 2);
  g.fillStyle = "rgba(15,23,32,0.75)"; g.fill();
  g.lineWidth = n * 0.07; g.strokeStyle = ring; g.stroke();
  drawIcon(g, name, n / 2, n / 2, n * 0.56, "#fff");
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- the view
export function initRealistic({ renderer, state, scenario, levelColor, timeline, getInfo, colorOf = (r) => levelColor(state.results[r.id]), reactionsOn = () => true, sound = null, calm = () => false, waveGain = () => 1, getZones = () => null, schoolsOn = () => true }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 3e6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.maxPolarAngle = Math.PI;   // the camera may go below the surface: that switches to the underwater look
  controls.enableDamping = true;
  camera.layers.enable(1);
  const tween = createCameraTween(camera, controls);
  let pinsOn = true;

  // sun and sky
  // sun behind and to the side of the preset cameras (they look roughly toward -z), so the sky reads blue
const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(35));
  // sky: a simple gradient dome (deep blue overhead -> pale haze at the horizon) with a sun glow
  const HORIZON = new THREE.Color(0xcddcea), ZENITH = new THREE.Color(0x2f6fb4);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { horizon: { value: HORIZON.clone() }, zenith: { value: ZENITH.clone() }, sunDir: { value: sun.clone().normalize() }, sunGlow: { value: 1 } },
    vertexShader: `varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vDir = normalize(position); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDir; uniform float sunGlow; varying vec3 vDir;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float h = max(vDir.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.45));
        if (vDir.y < 0.0) col = horizon;
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.93, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25) * sunGlow;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sky.scale.setScalar(1e6);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(sky.geometry, sky.material));
  scene.environment = pmrem.fromScene(skyScene, 0, 0.1, 10).texture;
  const stars = makeStars(); stars.visible = false; stars.layers.set(1); scene.add(stars);   // layer 1: not mirrored in the water
  const deck = cloudDeck(); deck.position.y = 1500; deck.visible = false; scene.add(deck);   // overcast layer
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x23415a, 0.6);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sunLight.position.copy(sun).multiplyScalar(1e5);
  scene.add(sunLight);
  const airFog = new THREE.FogExp2(0xcddcea, 6e-6);
  scene.fog = airFog;
  // time of day and weather (setConditions below); these only change the look
  const look = { tod: "day", exposure: 0.5, cloudLight: [1, 1, 1], cloudShadow: [0.6, 0.64, 0.7] };

  // ocean
  const water = new Water(polarSea(), {
    textureWidth: 1024, textureHeight: 1024, waterNormals: rippleNormals(),
    sunDirection: sun.clone().normalize(), sunColor: 0xfff4e0, waterColor: 0x0a3550,
    distortionScale: 3.2, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 0.6;
  const waveU = patchWater(water.material);   // real 3D waves (waves3d.js)
  const spray = createSpray(scene);           // flying water for bursts at or under the surface (spray.js)
  const rag = createRagdolls(scene);          // bodies thrown by the blast (ragdoll.js)
  const schools = createSchools(scene);       // shoals of fish (schools.js)
  let planKey = null;
  let ragT = 0;
  let waveState = null;
  scene.add(water);
  const uw = initUnderwater({ scene, camera, renderer, sunDir: sun, normalMap: water.material.uniforms.normalSampler.value, glowTexture: glowTexture() });

  // fireball
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), fireballMaterial());
  fireball.material.color = new THREE.Color();   // (kept so older code that sets a colour does not fail)
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTexture(), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  glare.renderOrder = 20; scene.add(glare);
  const flashDiv = document.createElement("div");   // the whole view whiting out for an instant
  flashDiv.id = "flashOverlay"; document.querySelector("main").appendChild(flashDiv);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const fireLight = new THREE.PointLight(0xffc27a, 0, 0, 2);   // set each frame so the brightness at the camera stays sensible
  scene.add(fireball, glow, fireLight);

  // blast front: a faint shell in the air and a bright ring on the water
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.BackSide, depthWrite: false }));
  const blastRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 256),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  blastRing.rotation.x = -Math.PI / 2;
  scene.add(shell, blastRing);

  // waves: a few foamy crest rings
  const waveRings = [];
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.0025, 6, 256),
      new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.3, transparent: true, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    waveRings.push(m);
    scene.add(m);
  }

  // mushroom cloud / water column made of soft puffs (sprites)
  const puffTexs = puffTextures(4);
  const cloud = new THREE.Group();
  scene.add(cloud);
  const puffs = [];
  function addPuff(kind, u, v, w) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexs[puffs.length % puffTexs.length], color: 0xffffff, transparent: true, depthWrite: false, fog: true,
      rotation: (Math.random() - 0.5) * 0.5 }));
    s.userData = { kind, u, v, w, spin: (Math.random() - 0.5) * 0.4, size: 0.8 + Math.random() * 0.5, r: Math.random() };
    cloud.add(s);
    puffs.push(s);
  }
  for (let i = 0; i < 340; i++) addPuff("cap", Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 0.35 + 0.65 * Math.sqrt(Math.random()));   // rolling ring (torus)
  for (let i = 0; i < 90; i++) addPuff("dome", Math.random() * Math.PI * 2, Math.acos(Math.random()), Math.random());     // top of the cap
  for (let i = 0; i < 120; i++) addPuff("stem", Math.random() * Math.PI * 2, Math.random(), Math.random());              // stem
  for (let i = 0; i < 40; i++) addPuff("collar", Math.random() * Math.PI * 2, Math.random(), Math.random());             // condensation collar on the stem
  for (let i = 0; i < 90; i++) addPuff("base", Math.random() * Math.PI * 2, Math.random(), Math.random());              // base surge / skirt

  // receivers (3D models + floating marker pins)
  const recGroup = new THREE.Group();
  scene.add(recGroup);
  // Above water, boats are drawn 6x bigger so they can be seen from far away; under water everything is true size.
  function placeReceiver(model, pin, line, r, under) {
    const { L, vis, boat, ship } = model.userData.rec, k = under ? 1 : vis;
    model.scale.setScalar(L * k);
    model.position.set(r.x_m, ship ? 0 : boat ? 0.4 * L * k * 0.16 : r.z_m, r.y_m || 0);
    pin.position.set(r.x_m, under ? pin.userData.pin.below : pin.userData.pin.above, r.y_m || 0);
    pin.visible = pinsOn;
    if (line) line.visible = !under && pinsOn;
    if (model.userData.ring) model.userData.ring.visible = false;   // the pin shows the status here
    model.userData.floatTo = boat ? null : -0.3 * L * k;
    setBase(model);
  }
  function buildReceivers() {
    rag.clearAll();
    while (recGroup.children.length) recGroup.remove(recGroup.children[0]);
    for (const r of state.receivers) {
      const color = colorOf(r);
      const model = makeModel(r, color);
      const L = realLength(r);
      const ship = r.kind === "ship";
      const vis = r.kind === "person" ? 6 : ship && r.ship_type === "small_craft" ? 2 : 1;   // small boats drawn bigger so they can be seen
      model.userData.rec = { L, vis, boat: r.kind === "person" || ship, ship, phase: Math.random() * 6.28 };
      model.rotation.y = r.kind === "person" || ship ? Math.PI : 0;   // boats face ground zero
      model.traverse((o) => { o.userData.id = r.id; });
      recGroup.add(model);
      const sel = r.id === state.selected;
      const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(iconOf(r), color, sel), depthTest: false, sizeAttenuation: false }));
      pin.scale.setScalar(sel ? 0.058 : 0.045);
      pin.userData.id = r.id;
      pin.layers.set(1);   // pins: drawn for the camera only, not mirrored in the water
      pin.renderOrder = 10;
      pin.userData.pin = { above: r.kind === "bird" ? r.z_m + 8 : Math.max(25, ship ? L * 0.35 : L * vis * 2), below: r.kind === "person" || ship ? -2 : r.z_m + Math.max(1, L * 1.2) };
      recGroup.add(pin);
      let line = null;
      if (r.kind !== "person" && !ship && r.kind !== "bird") {   // a line from the pin down to the animal's depth
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(r.x_m, pin.userData.pin.above, r.y_m || 0), new THREE.Vector3(r.x_m, r.z_m, r.y_m || 0)]);
        line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.8 })).computeLineDistances();
        recGroup.add(line);
      }
      placeReceiver(model, pin, line, r, wasUnder);
    }
  }

  // ---------------------------------------------------------------- camera presets
  function sizes() {
    const sc = scenario(), y = sc.burst.yield_kt || 1;
    if (sc.burst.z_m < 0) {   // underwater: frame the water column (see updateCloud), not a mushroom cloud
      const k = Math.cbrt(y / 20), vent = (-sc.burst.z_m * 3.28084 / Math.cbrt(y)) < 35;
      return { top: Math.max((vent ? 1830 : 270) * k * 1.3, 600), rad: (vent ? 300 : 400) * k };
    }
    return { top: cloudTopM(y), rad: cloudRadiusM(y) };
  }
  function setPreset(name, instant = false, opts = {}) {
    const from = camera.position.clone();
    const sc = scenario(), { top } = sizes(), bz = Math.max(sc.burst.z_m, 0);
    const boat = state.receivers.find((r) => r.kind === "person" || r.kind === "ship");
    const look = new THREE.Vector3(0, Math.max(top * 0.45, bz), 0);
    const focus = name === "focus" && state.receivers.find((q) => q.id === opts.id);
    const sch = name === "school" && schools.spot(opts.i ?? 2);
    if (sch) {   // just outside a school of fish, looking back toward the burst through it
      const ux = sch.x / sch.r, uz = sch.z / sch.r;
      camera.position.set(sch.x + ux * 20 - uz * 7, Math.min(sch.y + 2, -1), sch.z + uz * 20 + ux * 7);
      look.set(sch.x - ux * 10, sch.y + 2, sch.z - uz * 10);
    } else if (focus) {
      // close to one animal or boat, on the far side from the burst, looking back toward it:
      // the thing in the foreground, the burst (and whatever is coming) behind it
      const r = focus, ship = r.kind === "ship", onTop = r.kind === "person" || ship;
      const L = realLength(r) * (r.kind === "person" ? 6 : ship && r.ship_type === "small_craft" ? 2 : 1);
      const rx = r.x_m, rz = r.y_m || 0, dist = Math.hypot(rx, rz) || 1;
      const ux = rx / dist, uz = rz / dist, px = -uz, pz = ux;             // away from the burst, and sideways
      if (onTop) {
        const back = L * (opts.low ? 1.6 : 1.8) + 15, side = L * 0.2, up = opts.low ? Math.max(L * 0.1, 3) : L * 0.25 + 5;
        camera.position.set(rx + ux * back + px * side, up, rz + uz * back + pz * side);
        const hFar = opts.low ? 2 : Math.min(Math.max(bz, 40), dist * 0.25);
        look.set(rx * 0.55, opts.low ? 1 : hFar * 0.45, rz * 0.55);
      } else {
        const wd = sc.env.water_depth_m, d = Math.max(4, L * 2.6), air = r.z_m > 0;   // a bird flies above the sea
        let y = air ? r.z_m + L * 0.5 : Math.min(r.z_m + L * 0.35, -1);
        if (wd && !air) y = Math.max(y, -wd + 1.5);
        camera.position.set(rx + ux * d + px * d * 0.55, y, rz + uz * d + pz * d * 0.55);
        look.set(rx - ux * L * 0.9, air ? r.z_m + L * 0.3 : Math.min(r.z_m + L * 0.45, -0.5), rz - uz * L * 0.9);   // just past the animal, a little upward
      }
    } else if (name === "under") {
      // next to the first animal/diver in the sea, at its true depth, looking back toward ground zero
      const wd = sc.env.water_depth_m, r = state.receivers.find((q) => q.z_m < 0);
      const L = r ? realLength(r) : 2, d = Math.max(5, L * 4);
      const x = r ? r.x_m : 600, z = r ? r.y_m || 0 : 0;
      let y = r ? r.z_m : -15;
      if (wd) y = Math.max(y, -wd + 2);
      camera.position.set(x + d * 0.9, Math.min(y + d * 0.2, -1), z + d * 0.7);
      look.set(x - d * 1.5, Math.min(y + d * 0.6, -0.5), z);   // tilted up a little: the bright window overhead
    } else if (name === "boat") {
      const x = boat ? boat.x_m : Math.max(top * 1.5, 3000);
      look.y = Math.min(look.y, Math.hypot(x, 0) * 0.45);   // don't stare straight up into empty sky
      if (boat && boat.kind === "ship") {   // standing on the deck, near the stern
        const L = realLength(boat) * (boat.ship_type === "small_craft" ? 2 : 1);   // small boats are drawn 2x
        camera.position.set(x - L * 0.4, L * (boat.ship_type === "small_craft" ? 0.22 : 0.06) + 3, L * 0.01);   // on the bow, which faces the burst
      } else camera.position.set(x + 15, 6, 8);
    } else if (name === "calm") {   // a quiet view of the sea and sky (the start screen)
      camera.position.set(1500, 30, 2800);
      look.set(-400, 260, 0);
    } else if (name === "close") {   // the fireball filling a good part of the view (used for the flash)
      const fr = getInfo()?.fireball_radius_m || 200, d = Math.max(fr * 16, 1200);
      camera.position.set(d * 0.75, Math.max(bz * 0.35, 25), d * 0.7);
      look.set(0, Math.max(bz, fr * 0.5), 0);
    } else if (name === "side") {
      camera.position.set(-top * 0.2, Math.max(top * 0.08, 60), top * 2.2);
      look.set(0, top * 0.4, 0);
    } else if (name === "far") {
      camera.position.set(top * 4.5, Math.max(top * 0.1, 80), top * 3.5);
      look.set(0, top * 0.35, 0);
    } else {   // aerial
      camera.position.set(top * 1.6, top * 1.1, top * 1.9);
    }
    const to = camera.position.clone();
    camera.position.copy(from);
    tween.to(to, look, 1.2, instant || !active);
  }

  // ---------------------------------------------------------------- per-frame update
  let lastT = performance.now(), active = false, lastColKey = "", lastSel = null;
  const lerp = (a, b, f) => a + (b - a) * Math.min(Math.max(f, 0), 1);
  function interpLogT(ts, ys, t, before = 0) {
    if (!ts || !ts.length || t < ts[0]) return before;
    if (t >= ts[ts.length - 1]) return ys[ys.length - 1];
    let i = 1;
    while (ts[i] < t) i++;
    const a = Math.log(Math.max(ts[i - 1], 1e-12)), b = Math.log(ts[i]), f = (Math.log(t) - a) / (b - a || 1);
    return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
  }

  function update() {
    const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (!active) return;
    water.material.uniforms.time.value += dt * 0.6;
    camera.position.sub(shakeOff); shakeOff.set(0, 0, 0);
    updateBomb(timeline.getTime(), timeline.getData(), scenario().burst.z_m, now);
    if (controls.enabled) { tween.update(); controls.update(); }   // (the free camera moves it otherwise)
    // pins follow the injuries that have happened so far; models react (optional, illustrative)
    const colKey = state.receivers.map((r) => colorOf(r)).join("|") + state.selected;
    if (colKey !== lastColKey) {   // recolour the pins (rebuilding the models would reset any ragdolls)
      lastColKey = colKey; lastSel = state.selected;
      if (!recGroup.children.length) buildReceivers();
      else for (const o of recGroup.children) {
        if (!o.isSprite || !o.userData.id) continue;
        const r = state.receivers.find((q) => q.id === o.userData.id);
        if (!r) continue;
        o.material.map?.dispose();
        o.material.map = pinTexture(iconOf(r), colorOf(r), r.id === state.selected);
        o.scale.setScalar(r.id === state.selected ? 0.058 : 0.045);
        o.material.needsUpdate = true;
      }
    }
    for (const o of zoneGroup.children) if (o.userData.zoneLabel) o.visible = innerWidth >= 700;   // too cluttered on a phone
    const tl = timeline.getData(), tNow = timeline.getTime();
    const byId = Object.fromEntries((tl?.receivers || []).map((x) => [x.id, x]));
    for (const m of recGroup.children) {
      if (!m.userData.rec || rag.has(m.userData.id)) continue;
      pose(m, byId[m.userData.id], tNow, { on: reactionsOn(), scale: m.userData.rec.L, awayX: 1 });
    }
    updateRagdolls(tNow, byId);
    for (const m of recGroup.children) {   // birds flap their wings (drawing)
      const w = m.userData.wings;
      if (!w || rag.has(m.userData.id)) continue;
      const a = Math.sin(now / 160 + (m.userData.rec?.phase || 0)) * 0.55;
      w[0].rotation.x = -a; w[1].rotation.x = a;
    }
    {   // schools of fish: (re)place them when the scenario or the danger distances change
      const zs = getZones(), key = [tl, zs, scenario().burst.z_m, scenario().burst.yield_kt];
      if (!planKey || key.some((v, i) => v !== planKey[i])) { planKey = key; schools.plan(zs, tl, key[2], key[3]); }
      schools.update(tNow, now, schoolsOn() && !!tl);
    }
    const wdFloor = scenario().env.water_depth_m;
    if (wdFloor && camera.position.y < -wdFloor + 0.5) camera.position.y = -wdFloor + 0.5;   // don't go through the sea floor
    const under = camera.position.y < 0;
    if (under !== wasUnder) setUnder(under);

    const sc = scenario(), y = sc.burst.yield_kt;
    const t = timeline.getTime(), data = timeline.getData();
    const night = look.tod === "night";
    const bz = sc.burst.z_m;
    const info = getInfo();
    let uwBlast = null;

    // --- fireball and flash
    let flash = 0;
    const fb = data && data.fireball;
    if (bz >= 0 && fb && t > 0 && t < fb.end_s) {
      // before the first data point (the first fraction of a millisecond) the fireball is tiny but blindingly bright
      const r = Math.max(interpLogT(fb.t_s, fb.radius_m, t), 3), pwModel = interpLogT(fb.t_s, fb.power, t, 0.9);
      // the very first flash (the first thermal maximum, within about a millisecond, Glasstone ch. II) is brief but
      // dazzling; the model's power is relative to the later main pulse, so we add it for the picture only
      const pw = Math.max(pwModel, Math.exp(-t / 0.004));
      const fade = Math.min(1, Math.max(0, 1.4 - t / fb.end_s));
      fireball.visible = glow.visible = true;
      fireball.scale.setScalar(Math.max(r, 1));
      fireball.position.set(0, bz + Math.max(0, t - fb.end_s * 0.3) * 20, 0);
      const u = fireball.material.uniforms;
      u.time.value = now / 1000; u.heat.value = Math.min(1, Math.max(pw, 0.4 * (1 - t / fb.end_s)));
      u.opacity.value = 0.35 + 0.65 * fade; u.gain.value = night ? 1.6 : 1;
      glare.visible = pw > 0.02;
      glare.position.copy(fireball.position);
      const dGl = camera.position.distanceTo(fireball.position);
      glare.scale.setScalar(Math.max(r * (6 + 26 * pw), dGl * 0.12 * pw) * (night ? 1.6 : 1));   // visible from any distance
      glare.material.opacity = Math.min(1, pw * 1.2);
      glow.position.copy(fireball.position);
      glow.scale.setScalar(r * (4 + 6 * pw));
      glow.material.opacity = 0.4 + 0.6 * pw;
      fireLight.position.copy(fireball.position);
      // light from the fireball: a few times the sun's at the camera's distance (physically it is far brighter,
      // but a screen can't show that: the flash overlay and exposure carry the "too bright" feeling)
      const dCam = Math.max(camera.position.distanceTo(fireball.position), r * 1.5);
      fireLight.intensity = (night ? 6 : 3) * pw * dCam * dCam;
      flash = pw;
    } else if (bz >= 0 && !data && info && info.fireball_radius_m) {   // no timeline yet: show the full-size fireball
      fireball.visible = glow.visible = true;
      fireball.scale.setScalar(info.fireball_radius_m);
      fireball.position.set(0, bz, 0);
      glow.position.copy(fireball.position); glow.scale.setScalar(info.fireball_radius_m * 5);
      fireLight.intensity = 0;
    } else { fireball.visible = glow.visible = false; fireLight.intensity = 0; }
    if (!(bz >= 0 && fb && t > 0 && t < fb.end_s)) glare.visible = false;
    // "calm" (a setting, or the device asking for reduced motion): a much softer flash, for people sensitive to it
    const soft = calm();
    renderer.toneMappingExposure = (under ? 0.9 : look.exposure) * (1 + (soft ? 0.35 : 1.6) * flash);
    // the screen whites out for an instant at the flash (much stronger at night, when the eye is dark-adapted)
    flashDiv.style.opacity = under ? 0 : Math.min(soft ? 0.12 : 0.92, Math.pow(flash, 2) * (night ? 1.1 : 0.7));

    // --- blast front
    const ab = data && data.air_blast;
    if (ab && t > 0 && t <= ab.t_s[ab.t_s.length - 1] && bz >= 0) {
      const slant = interpLogT(ab.t_s, ab.slant_radius_m, t), ground = interpLogT(ab.t_s, ab.ground_radius_m, t);
      const pk = ground > 0 ? interpLogT(ab.t_s, ab.peak_kpa, t) : 100;
      const strength = Math.min(Math.max(0.15 + 0.2 * Math.log10(Math.max(pk, 0.01)), 0), 0.9);
      shell.visible = slant > 0 && pk > ab.negligible_kpa;
      shell.scale.setScalar(Math.max(slant, 1)); shell.position.set(0, bz, 0);
      shell.material.opacity = 0.03 + 0.08 * strength;
      blastRing.visible = ground > 0 && pk > ab.negligible_kpa;
      blastRing.scale.setScalar(Math.max(ground, 1));
      blastRing.material.opacity = strength;
      uwBlast = blastRing.visible ? { r: ground, strength } : null;
    } else { shell.visible = blastRing.visible = false; }
    if (under) shell.visible = blastRing.visible = false;   // the underwater surface shader draws the ring instead

    // --- waves (crest rings); heights below 1 m drawn at 1 m so they stay visible
    const wv = data && data.waves;
    const uwRings = [];
    let ringWidth = 20;
    if (wv && t > 0) {
      const rMax = wv.max_wave_speed_m_s * t;
      const L = 9.81 * wv.period_s * wv.period_s / (2 * Math.PI);   // deep-water wavelength for that period
      const h = interpLogT(wv.ranges_m, wv.height_high_m, Math.max(rMax, wv.ranges_m[0]), wv.height_high_m[0]);
      waveRings.forEach((m, k) => {
        const r = rMax - k * L;
        m.visible = false;                         // the sea surface itself now carries the waves (waves3d.js)
        if (!(r > 50 && h > 0.05)) return;
        m.scale.set(r, r, Math.max(h, 1) / 2 / (r * 0.0025));   // tube thickness ~ wave height
        m.position.y = 0.2;
        uwRings.push({ r, h, fade: Math.pow(0.7, k) });
      });
      ringWidth = Math.min(Math.max(L / 8, 4), 300);   // band width illustrative; radii from the timeline
    } else waveRings.forEach((m) => (m.visible = false));

    waveState = updateWaves(waveU, wv, t, waveGain());
    // an above-water camera rides over the waves instead of ending up inside a big one
    if (waveState && camera.position.y > -1.5) {
      const [etaC] = etaAt(waveState, Math.hypot(camera.position.x, camera.position.z));
      if (camera.position.y < etaC + 2.5) camera.position.y = etaC + 2.5;
    }
    // boats ride the waves: up and down with the sea, tipped by its slope
    if (waveState) for (const m of recGroup.children) {
      if (!m.userData.rec?.boat) continue;
      const [eta, slope] = etaAt(waveState, Math.hypot(m.position.x, m.position.z));
      m.position.y += eta;
      m.rotation.z += Math.atan(slope) * (m.position.x >= 0 ? 1 : -1);
    }

    // --- cloud or water column
    updateCloud(t, y, bz, data, fb);
    {   // flying spray (same BAKER-scaled sizes as the column; illustrative)
      const k = Math.cbrt(Math.max(y, 0.001) / 20), fr = info?.fireball_radius_m || 100;
      const tS = data ? t : 0;
      if (under) spray.update(0, null);
      else if (bz < 0) {
        const vent = (-bz * 3.28084 / Math.cbrt(y)) < 35;
        spray.update(tS, "under", (vent ? 1830 : 270) * k, (vent ? 300 : 400) * k, look.cloudLight);
      } else if (bz < fr * 0.5) spray.update(tS, "surface", 500 * k, 300 * k, look.cloudLight);
      else spray.update(0, null);
    }

    // --- underwater
    if (under) {
      cloud.visible = false; fireball.visible = false; glow.visible = false;
      uw.update({ dt, t, data, floorY: wdFloor ? -wdFloor : null, rings: uwRings, ringWidth, blast: uwBlast,
        fire: flash > 0 ? { pos: fireball.position, power: flash } : null });
      // animals sway gently (decoration)
      for (const m of recGroup.children) {
        const rc = m.userData.rec;
        if (rc && !rc.boat && !rag.has(m.userData.id)) m.rotation.y = Math.sin(now / 700 + rc.phase) * 0.12;
      }
      if (hud) hud.querySelector("b").textContent = fmtDepth(-camera.position.y);
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // --- sound and shaking, timed by the physics: when the blast front (or the shock in the water, or the
    //     biggest wave) actually reaches the camera
    const tPrev = lastSimT; lastSimT = t;
    if (t < tPrev) heard.clear();                                   // went back in time: things can be heard again
    // Only make a sound when time runs forward by itself (playing, or the film). While the user drags the
    // slider, anything that has already arrived is marked as heard silently, so it does not go off on release.
    const audible = t > tPrev && !timeline.movedByHand?.();
    const hear = (key, play) => { if (heard.has(key)) return; heard.add(key); if (audible) play(); };
    const cam = camera.position, dBurst = Math.hypot(cam.x, cam.y - bz, cam.z);
    if (data && t > 0) {
      if (!under && ab && bz >= 0) {
        const slant = interpLogT(ab.t_s, ab.slant_radius_m, t);
        if (slant >= dBurst) hear("boom", () => {
          const pk = interpLogT(ab.t_s, ab.peak_kpa, Math.min(t, ab.t_s[ab.t_s.length - 1]));   // kPa at the front now
          const st = Math.min(1, Math.max(0, Math.log10(Math.max(pk, 0.05) / 0.05) / Math.log10(400 / 0.05)));
          sound?.boom(st); shake(st);
        });
      }
      const ws = data.water_shock;
      if (under && ws && ws.speed_m_s * t >= Math.hypot(cam.x, cam.y - (ws.source_z_m ?? bz), cam.z)) hear("thud", () => { sound?.boom(0.6, true); shake(0.5); });
      if (wv && Math.abs(cam.y) < 80) {
        const rMax = wv.max_wave_speed_m_s * t, dh = Math.hypot(cam.x, cam.z);
        if (rMax >= dh) hear("wave", () => { if (tPrev * wv.max_wave_speed_m_s < dh) sound?.wash(0.5); });
      }
    }
    // shake the camera for a moment after the blast reaches it
    const age = (now - shakeAt) / 1000;
    if (age < 1.6) {
      const a = shakeAmp * Math.exp(-age * 3) * Math.max(1, dBurst * 0.0015);
      shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      camera.position.add(shakeOff);
    }
  }
  // ---------------------------------------------------------------- ragdolls: thrown when the pulse hits hard enough
  const LV = ["none", "possible", "likely", "severe", "lethal"];
  function blastLevelSoFar(rt, t) {
    let w = -1;
    for (const e of rt.effects || []) if (e.onset_s != null && e.onset_s <= t && (e.name.includes("blast") || e.name.startsWith("ship"))) w = Math.max(w, LV.indexOf(e.level));
    return w;
  }
  function updateRagdolls(t, byId) {
    if (!reactionsOn() || !active) { if (rag.count) buildReceivers(); ragT = t; return; }
    if (t < ragT - 1e-6 && rag.count) { buildReceivers(); ragT = t; return; }   // scrubbed back: start again
    const bz = scenario().burst.z_m;
    for (const m of recGroup.children) {
      const rc = m.userData.rec, id = m.userData.id;
      if (!rc || rag.has(id)) continue;
      const rt = byId[id], r = state.receivers.find((q) => q.id === id);
      if (!rt || !r || !rt.pulse || r.kind === "ship" || t < rt.pulse.arrival_s || blastLevelSoFar(rt, t) < 2) continue;
      const wp = new THREE.Vector3(); m.getWorldPosition(wp);
      const dir = wp.clone().sub(new THREE.Vector3(0, bz, 0)).normalize();
      const v = dir.multiplyScalar(pushSpeed(rt.pulse.peak_kpa, rt.pulse.medium));
      const rigged = m.userData.rig;
      if (r.kind === "person" && m.userData.person) {
        v.y += 0.3 * v.length();
        const S = new THREE.Vector3(); m.getWorldScale(S);
        const Q = new THREE.Quaternion(); m.getWorldQuaternion(Q);
        const deck = { pos: wp, quat: Q, half: new THREE.Vector3(0.4 * S.x, 0.08 * S.y, 0.14 * S.z) };
        if (rigged) rag.spawnRig(id, rigged, v, deck);
        else rag.spawnHuman(id, m.userData.person, v, { skin: 0xd9a882, suit: 0x2f4a6b, pants: 0x2b2f36 }, deck);
      } else if (r.kind === "diver" && rigged) {
        rag.spawnRig(id, rigged, v);
      } else if (r.kind === "diver" && m.userData.human) {
        rag.spawnHuman(id, m.userData.human, v, { skin: 0xd9a882, suit: 0x1f2328, pants: 0x1f2328 });
        m.visible = false;
      } else if (r.kind === "turtle" || r.kind === "bird") { bakeAnimal(m); rag.spawnRigid(id, m, v); }
      else { bakeAnimal(m); rag.spawnSpine(id, m, v); }
    }
    rag.step(t - ragT);
    ragT = t;
  }

  const shakeOff = new THREE.Vector3(), heard = new Set();
  let shakeAt = -1e9, shakeAmp = 0, lastSimT = 0;
  function shake(strength) { if (calm()) return; shakeAt = performance.now(); shakeAmp = 2 + 10 * strength; }

  function updateCloud(t, y, bz, data, fb) {
    const show = (on) => { cloud.visible = on; };
    if (!(y > 0)) return show(false);
    const tEff = data ? t : 600;                 // no timeline yet: show the stabilised cloud (~10 min)
    const scaled = -bz * 3.28084 / Math.cbrt(y);   // ft/kt^1/3
    if (bz < 0) {
      // underwater burst: water column (vents, scaled depth < 35 ft/kt^1/3, Glasstone 6.53) or spray dome
      const k = Math.cbrt(y / 20), H = (scaled < 35 ? 1830 : 270) * k, R = (scaled < 35 ? 300 : 400) * k;
      const rise = Math.min(1, tEff / 10), fall = Math.max(0, Math.min(1, (tEff - 20) / 120));
      const surgeR = tEff > 10 ? Math.min(5600 * k, 5600 * k * (tEff - 10) / 230) : 0;   // BAKER base surge ~3.5 mi at 4 min
      if (tEff <= 0 || tEff > 3600) return show(false);
      show(true);
      const domeT = Math.min(1, tEff / 1.5);                         // spray dome: the first second or two (illustrative)
      const lift = Math.min(1, Math.max(0, (tEff - 0.5) / 10));      // column rises over ~10 s (BAKER, Glasstone sec. 2.53)
      const Lc = look.cloudLight, Sc = look.cloudShadow;
      for (const p of puffs) {
        const { kind, u, v, w } = p.userData;
        let x, yy, z, size, op, lit = 0.85;
        if (kind === "base") {                                         // base surge: a doughnut of mist rolling outwards
          const r = surgeR * (0.7 + 0.3 * w);
          x = Math.cos(u) * r; z = Math.sin(u) * r; yy = 60 * k * (0.3 + v); size = 260 * k; op = surgeR > 0 ? 0.55 * (1 - fall * 0.7) : 0;
        } else if (kind === "dome") {                                  // spray dome
          const rd = R * 1.25 * domeT, th = v;
          x = Math.cos(u) * Math.sin(th) * rd; z = Math.sin(u) * Math.sin(th) * rd; yy = Math.cos(th) * rd * 0.8;
          size = R * 0.45; op = 0.85 * (1 - 0.85 * lift); lit = 0.95;
        } else if (kind === "stem") {                                  // the hollow column of water
          const rr = R * (0.75 + 0.25 * w);
          x = Math.cos(u) * rr; z = Math.sin(u) * rr; yy = H * lift * v * 0.9 * (1 - 0.8 * fall);
          size = R * 0.8; op = 0.9 * (1 - fall); lit = 0.75 + 0.2 * v;
        } else {                                                       // "cauliflower" cloud on top of the column
          const rr = R * 1.55 * Math.sqrt(w);
          x = Math.cos(u) * rr; z = Math.sin(u) * rr;
          yy = H * lift * (0.84 + 0.12 * Math.sin(v * 3.1)) * (1 - 0.8 * fall);
          size = R * 0.85; op = 0.9 * (1 - fall) * Math.min(1, lift * 2); lit = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(v));
        }
        p.position.set(x, Math.max(yy, 3), z);
        p.scale.setScalar(size * p.userData.size);
        p.material.opacity = op;
        p.material.color.setRGB(Sc[0] + (Lc[0] - Sc[0]) * lit, Sc[1] + (Lc[1] - Sc[1]) * lit, Sc[2] + (Lc[2] - Sc[2]) * lit);
      }
      return;
    }
    // air / surface burst: mushroom cloud
    const topF = cloudTopM(y) + (y <= 15 ? bz : 0), botF = Math.min(cloudBottomM(y) + (y <= 15 ? bz : 0), topF * 0.8);
    const aF = cloudRadiusM(y);
    const frac = riseFraction(tEff);
    const fbMax = (fb && fb.max_radius_m) || 100;
    const top = Math.max(topF * frac, bz + fbMax * 1.2);
    if (tEff <= 0 || (fb && tEff < fb.end_s * 0.75)) return show(false);   // the fireball itself comes first
    const disperse = Math.min(1, Math.max(0, (tEff - 3600) / 7200));   // visible for about an hour, then disperses (sec. 2.15)
    if (disperse >= 1) return show(false);
    show(true);
    // early on the cloud is just the risen fireball: start at its size and grow to the full cloud with the rise
    const grow = Math.min(1, Math.max(0, frac));
    const capH = lerp(fbMax * 0.8, Math.max((topF - botF) / 2, 50), grow);
    const capC = top - capH;
    const a = lerp(fbMax * 1.1, aF, grow) * (1 + 0.2 * Math.max(0, Math.log10(Math.max(tEff / 600, 1))));
    const stemR = lerp(fbMax * 0.25, aF * stemRatio(y), grow);
    const surface = bz < 3 * Math.cbrt(y) * 0.3048 * 5;  // contact-ish burst: darker, debris-laden stem
    // light on the cloud: the sun (or moon) colour, the sky light, and early on its own glow
    const L = look.cloudLight, shadow = look.cloudShadow;
    const hotT = 25 * Math.cbrt(Math.max(y, 0.01) / 20);          // glowing for the first tens of seconds (illustrative)
    const hot = Math.max(0, 1 - tEff / hotT);
    const roll = 0.9 / (1 + tEff / 40);                              // the ring rolls fast at first, then slows
    const R0 = a * 0.62, rMin = Math.max(capH * 0.95, a * 0.3);
    for (const p of puffs) {
      const { kind, u, v, w, spin } = p.userData;
      let x, yy, z, size, op = 0.9, lit = 1;
      if (kind === "cap") {          // a doughnut that rolls: up through the middle, out over the top, down the outside
        const vv = v + roll * tEff * 0.15 + spin;
        const rr = R0 + rMin * w * Math.cos(vv);
        const az = u + spin * tEff * 0.01;
        x = Math.cos(az) * rr; z = Math.sin(az) * rr;
        yy = capC + rMin * w * Math.sin(vv) * 0.75;
        size = a * 0.5;
        lit = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(vv));         // lit on top, shaded underneath
      } else if (kind === "dome") {  // fills the top of the cap
        const rr = R0 * 0.95 * Math.sin(v);
        x = Math.cos(u) * rr; z = Math.sin(u) * rr;
        yy = capC + rMin * 0.55 + Math.cos(v) * rMin * 0.35;
        size = a * 0.55; lit = 0.95;
      } else if (kind === "stem") {  // rising column, wider at the bottom, drawn up into the cap
        const vv = (v + tEff * 0.004) % 1;
        const r = stemR * (0.25 + 0.5 * w) * (1 + 0.6 * (1 - vv));
        const tw = u + vv * 2.5;
        x = Math.cos(tw) * r; z = Math.sin(tw) * r;
        yy = (capC - capH * 0.55) * vv;
        size = stemR * 1.05; lit = 0.7 + 0.2 * vv;
      } else if (kind === "collar") { // condensation ring part-way up the stem, for a few minutes
        const r = stemR * (1.8 + 0.8 * w);
        x = Math.cos(u) * r; z = Math.sin(u) * r;
        yy = (capC - capH) * (0.45 + 0.1 * v);
        size = stemR * 1.3;
        op = 0.75 * Math.max(0, 1 - tEff / 240) * Math.min(1, frac * 3);
        lit = 1.05;
      } else {                       // low skirt of spray/condensation (thicker for bursts on the water)
        const r = (stemR * 1.5 + a * (surface ? 0.9 : 0.4) * w) * Math.min(1, frac * 2);
        x = Math.cos(u) * r; z = Math.sin(u) * r; yy = 30 + (surface ? 160 : 80) * v; size = stemR * (surface ? 2.2 : 1.6);
        op = surface ? 0.6 : 0.4; lit = 0.9;
      }
      p.position.set(x, Math.max(yy, 5), z);
      p.scale.setScalar(Math.max(size, 30) * p.userData.size);
      // colour: shadowed underside -> sunlit top; a debris-laden stem is browner; early on glowing orange inside
      const base = kind === "stem" && surface ? [0.78, 0.72, 0.66] : [1, 1, 1];
      const c = [0, 1, 2].map((k) => base[k] * (shadow[k] + (L[k] - shadow[k]) * lit));
      const glowCol = [1.0, 0.45, 0.14], g = hot * (kind === "stem" || kind === "collar" ? 0.6 : 1) * (0.6 + 0.4 * (1 - lit));
      p.material.color.setRGB(lerp(c[0], glowCol[0] * 2.2, g), lerp(c[1], glowCol[1] * 2.2, g), lerp(c[2], glowCol[2] * 2.2, g));
      p.material.opacity = op * (1 - disperse);
    }
  }

  // switch the whole scene between the above-water and underwater looks
  let wasUnder = false;
  const hud = document.getElementById("uwHud");
  function setUnder(on) {
    wasUnder = on;
    uw.setOn(on);
    water.visible = sky.visible = !on;
    scene.fog = on ? uw.fog : airFog;
    if (!on) scene.background = null;
    hemi.color.set(on ? 0x8fe0e0 : 0xcfe4ff); hemi.groundColor.set(on ? 0x05202a : 0x23415a); hemi.intensity = on ? 1.1 : 0.6;
    sunLight.intensity = on ? 1.2 : 2.2;
    if (!on) setConditions(lastCond);
    const recs = state.receivers;
    let i = 0;
    for (let k = 0; k < recGroup.children.length; k++) {   // children come in order: model, pin, (line)
      const model = recGroup.children[k];
      if (!model.userData.rec) continue;
      const pin = recGroup.children[k + 1], line = recGroup.children[k + 2] && recGroup.children[k + 2].isLine ? recGroup.children[k + 2] : null;
      if (recs[i]) placeReceiver(model, pin, line, recs[i], on);
      i++;
    }
    if (hud) hud.hidden = !on;
    document.body.classList.toggle("underwater", on);
  }

  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); spray.setScale(h * renderer.getPixelRatio(), camera.fov); }
  function setActive(on) {
    active = on;
    controls.enabled = on;
    if (!on && wasUnder) setUnder(false);
    if (on) buildReceivers();
  }

  // which thing in the sea is under the mouse? (ndc = position in -1..1 screen coordinates)
  const ray = new THREE.Raycaster();
  ray.layers.enable(1);
  function pick(ndc) {
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(recGroup.children.filter((o) => o.visible && !o.isLine), true);
    const hit = hits.find((h) => h.object.userData.id);
    return hit ? hit.object.userData.id : null;
  }
  // ---------------------------------------------------------------- time of day and weather (the look only;
  // the physics side is in effects/conditions.py: haze and cloud change the heat, night the flash blindness)
  const LOOKS = {
    day:   { elev: 28, az: 35,  sun: 0xfff2dc, sunI: 2.2, hor: 0xcddcea, zen: 0x2f6fb4, hemi: 0.6, exp: 0.5, water: 0x0a3550, cl: [1, 1, 1], sh: [0.6, 0.64, 0.7] },
    dawn:  { elev: 5, az: 95,   sun: 0xffb27a, sunI: 1.4, hor: 0xf2b07c, zen: 0x46608f, hemi: 0.45, exp: 0.6, water: 0x15304a, cl: [1, 0.82, 0.68], sh: [0.42, 0.4, 0.5] },
    dusk:  { elev: 5, az: -95,  sun: 0xff9a5c, sunI: 1.3, hor: 0xee8f60, zen: 0x2f3e6e, hemi: 0.4, exp: 0.6, water: 0x13283f, cl: [1, 0.76, 0.6], sh: [0.38, 0.34, 0.45] },
    night: { elev: 35, az: 20,  sun: 0x9fb4d8, sunI: 0.12, hor: 0x0c1626, zen: 0x02050c, hemi: 0.06, exp: 0.9, water: 0x02080f, cl: [0.2, 0.22, 0.28], sh: [0.07, 0.08, 0.11] },
  };
  const FOG_VIS_M = { exceptionally_clear: 80000, very_clear: 51000, clear: 26000, light_haze: 13000, medium_haze: 6400, thin_fog: 2400 };
  let lastCond = {};
  function setConditions({ tod = "day", visibility = "exceptionally_clear", overcast = false } = {}) {
    lastCond = { tod, visibility, overcast };
    const L = LOOKS[tod] || LOOKS.day;
    sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.elev), THREE.MathUtils.degToRad(L.az));
    const hor = new THREE.Color(L.hor), zen = new THREE.Color(L.zen);
    if (overcast) { const grey = new THREE.Color(tod === "night" ? 0x0a0d12 : tod === "day" ? 0xa3abb3 : 0x8a8580); hor.lerp(grey, 0.8); zen.lerp(grey, 0.9); }
    const su = sky.material.uniforms;
    su.horizon.value.copy(hor); su.zenith.value.copy(zen); su.sunDir.value.copy(sun).normalize();
    su.sunGlow.value = tod === "night" ? 0.15 : overcast ? 0 : 1;
    sunLight.color.set(L.sun); sunLight.intensity = L.sunI * (overcast ? 0.35 : 1);
    sunLight.position.copy(sun).multiplyScalar(1e5);
    hemi.intensity = L.hemi * (overcast ? 1.2 : 1);
    hemi.color.copy(hor).lerp(new THREE.Color(0xffffff), 0.3);
    airFog.color.copy(hor);
    const V = FOG_VIS_M[visibility] || 80000;
    airFog.density = Math.max(6e-6, 0.9 / V) * (overcast ? 1.5 : 1);
    const wu = water.material.uniforms;
    wu.sunDirection.value.copy(sun).normalize(); wu.sunColor.value.set(L.sun).multiplyScalar(overcast ? 0.3 : 1);
    wu.waterColor.value.set(L.water);
    stars.visible = tod === "night" && !overcast;
    deck.visible = overcast;
    deck.material.color.set(tod === "night" ? 0x1a1e26 : tod === "day" ? 0xffffff : 0xc9b8a8);
    look.tod = tod; look.exposure = L.exp;
    const dim = overcast ? 0.8 : 1;
    look.cloudLight = L.cl.map((v) => v * dim); look.cloudShadow = L.sh.map((v) => v * dim);
    // reflections of the new sky
    const old = scene.environment;
    scene.environment = pmrem.fromScene(skyScene, 0, 0.1, 10).texture;
    old?.dispose();
  }

  // ---------------------------------------------------------------- danger circles (biology/zones.py via /api/zones)
  const zoneGroup = new THREE.Group(); scene.add(zoneGroup);
  function labelSprite(text, color, ic = null) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 96;
    const g = c.getContext("2d");
    g.font = "600 40px -apple-system, Segoe UI, sans-serif"; g.textBaseline = "middle";
    const pad = ic ? 62 : 18;
    const w = Math.min(g.measureText(text).width + pad + 18, 512);
    g.fillStyle = "rgba(10,17,25,0.82)"; g.beginPath(); g.roundRect(0, 8, w, 80, 40); g.fill();
    if (ic) drawIcon(g, ic, 40, 48, 40, color);
    g.fillStyle = color; g.fillText(text, pad, 50);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false }));
    sp.scale.set(0.24, 0.045, 1); sp.center.set(0, 0.5); sp.renderOrder = 12; sp.layers.set(1);
    return sp;
  }
  /** rings: [{ r, color, text }] (metres); empty or null hides them. */
  function setZones(rings) {
    while (zoneGroup.children.length) { const o = zoneGroup.children.pop(); o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }
    for (const [i, z] of (rings || []).entries()) {
      if (!(z.r > 0)) continue;
      const w = Math.max(z.r * 0.006, 4);
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - w, z.r + w, 256),
        new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 1.5; ring.renderOrder = 3;
      zoneGroup.add(ring);
      const a = -0.5 - i * 0.35;   // spread the labels around so they do not overlap
      const lab = labelSprite(z.text, z.color, z.icon);
      lab.position.set(Math.cos(a) * z.r, 8, Math.sin(a) * z.r);
      lab.userData.zoneLabel = true;
      zoneGroup.add(lab);
    }
  }

  // ---------------------------------------------------------------- the bomb before it goes off (drawing only)
  // Above water: a bomb falling to the burst point (the film shows its last few seconds, about 900 m at a
  // steady fall). Under water: a sealed canister on a cable under a small ship, as for BAKER in 1946.
  const bomb = bombModel(); bomb.scale.setScalar(3.5); bomb.visible = false;
  const canister = canisterModel(); canister.scale.setScalar(2.2); canister.visible = false;
  const barge = bargeModel(); barge.scale.setScalar(62); barge.visible = false;
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]),
    new THREE.LineBasicMaterial({ color: 0x2a2e33 }));
  cable.visible = false; cable.frustumCulled = false;
  scene.add(bomb, canister, barge, cable);
  const FALL_M = 900;
  let pre = null;   // { f: 0..1 through the fall, follow: camera follows it }
  function setPreRoll(p) { pre = p; }
  function updateBomb(t, data, bz, now) {
    const before = !(t > 0) || (pre && pre.f < 1);
    const under = bz < 0;
    bomb.visible = before && !under;
    canister.visible = cable.visible = barge.visible = before && under;
    if (!before) return;
    if (under) {
      canister.position.set(0, bz, 0);
      canister.rotation.z = Math.sin(now / 900) * 0.03;
      const pos = cable.geometry.attributes.position;
      pos.setXYZ(0, 0, bz + 1.4, 0); pos.setXYZ(1, 0, 1.2, 0); pos.needsUpdate = true;
      barge.position.set(0, 0, 0);
      barge.rotation.set(Math.sin(now / 1700) * 0.01, 0.6, Math.sin(now / 1300) * 0.015);
      if (pre?.follow) {   // a diver's-eye view of the canister and the cable going up to the ship
        camera.position.set(16, bz + 5, 13); controls.target.set(0, bz + 2, 0); tween.cancel();
      }
    } else {
      const f = pre ? pre.f : 1;
      bomb.position.set(0, bz + FALL_M * (1 - f), 0);
      bomb.rotation.set(Math.sin(now / 300) * 0.04, 0, -Math.PI / 2 + Math.sin(now / 410) * 0.05);   // nose down, wobbling a little
      if (pre?.follow) {   // ride along beside it
        camera.position.set(bomb.position.x + 30, bomb.position.y + 9, bomb.position.z + 38);
        controls.target.set(bomb.position.x, bomb.position.y - 6, bomb.position.z); tween.cancel();
      }
    }
  }

  // ---------------------------------------------------------------- real places (places.js)
  const bikini = buildBikini(); bikini.visible = false; scene.add(bikini);
  function setPlace(name) { bikini.visible = name === "bikini"; }

  function setPins(on) { pinsOn = on; if (active) buildReceivers(); }

  setPreset("aerial", true);
  window.nukesimRealistic = { cloud, glow, fireball, camera, scene, sky, water, renderer, controls, uw, isUnderwater: () => wasUnder, pick, rag };   // handy for checking things in the browser console
  return { scene, camera, controls, update, setPreset, setActive, resize, setPins, setConditions, setZones, setPlace, setPreRoll, tween, pick, rebuildReceivers: buildReceivers,
    isUnderwater: () => wasUnder,
    notes: [
      "Fireball, blast front and waves: from the simulator's timeline (validated models).",
      "Mushroom cloud size and rise: curve fits to Glasstone & Dolan Figs. 2.12 and 9.96 and Miller (1963), as in NUKEMAP; its shape is illustrative.",
      "Underwater-burst water column: illustrative, scaled from the 1946 BAKER test by the cube root of the yield (our assumption).",
      "Boats are drawn 6x larger and animals have marker pins so they can be seen at these distances (under water everything is true size).",
      "Underwater: the shock front (speed of sound in water), the gas bubble (Cole's size, Rayleigh's growth) and the wave and blast rings overhead come from the timeline; the bright window overhead and the slant of the light shafts follow Snell's law.",
      "Underwater: the water colour, how far you can see (a few hundred metres, far more than in real sea water), the caustic pattern, the bubble's early glow, the shock front's brightness and the floating particles are illustrative. Reflection of the shock off the sea floor is not drawn.",
    ] };
}
