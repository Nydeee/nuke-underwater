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

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Water } from "three/addons/objects/Water.js";
import { makeModel, realLength } from "./models.js";

const FT = 0.3048;

// ---------------------------------------------------------------- cloud size (NUKEMAP fits, feet -> metres)
// Glasstone Fig. 9.96 fits (cloud top / bottom, stabilised, ~10 min). Yield in kt.
function cloudTopM(y) {
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
function riseFraction(t) {
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

function pinTexture(emoji, ring) {
  const n = 128, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, Math.PI * 2);
  g.fillStyle = "rgba(15,23,32,0.75)"; g.fill();
  g.lineWidth = n * 0.07; g.strokeStyle = ring; g.stroke();
  g.font = `${n * 0.48}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emoji, n / 2, n / 2 + n * 0.03);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- the view
export function initRealistic({ renderer, state, scenario, levelColor, timeline, getInfo }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 3e6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.maxPolarAngle = Math.PI * 0.495;   // stay above the water (the underwater view is a later step)

  // sun and sky
  // sun behind and to the side of the preset cameras (they look roughly toward -z), so the sky reads blue
const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(35));
  // sky: a simple gradient dome (deep blue overhead -> pale haze at the horizon) with a sun glow
  const HORIZON = new THREE.Color(0xcddcea), ZENITH = new THREE.Color(0x2f6fb4);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { horizon: { value: HORIZON }, zenith: { value: ZENITH }, sunDir: { value: sun.clone().normalize() } },
    vertexShader: `varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { vDir = normalize(position); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDir; varying vec3 vDir;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float h = max(vDir.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.45));
        if (vDir.y < 0.0) col = horizon;
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.93, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sky.scale.setScalar(1e6);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(sky.geometry, sky.material));
  scene.environment = pmrem.fromScene(skyScene, 0, 0.1, 10).texture;
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x23415a, 0.6));
  const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sunLight.position.copy(sun).multiplyScalar(1e5);
  scene.add(sunLight);
  scene.fog = new THREE.FogExp2(0xcddcea, 6e-6);

  // ocean
  const water = new Water(new THREE.PlaneGeometry(1.2e6, 1.2e6), {
    textureWidth: 1024, textureHeight: 1024, waterNormals: rippleNormals(),
    sunDirection: sun.clone().normalize(), sunColor: 0xfff4e0, waterColor: 0x0a3550,
    distortionScale: 3.2, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 0.6;
  scene.add(water);

  // fireball
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false, transparent: true }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const fireLight = new THREE.PointLight(0xffc27a, 0, 0, 1.2);
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
  const puffTex = puffTexture();
  const cloud = new THREE.Group();
  scene.add(cloud);
  const puffs = [];
  function addPuff(kind, u, v, w) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffffff, transparent: true, depthWrite: false, fog: true }));
    s.userData = { kind, u, v, w, spin: (Math.random() - 0.5) * 0.4, size: 0.8 + Math.random() * 0.5 };
    cloud.add(s);
    puffs.push(s);
  }
  for (let i = 0; i < 220; i++) {          // cap: points on a flattened, rolling torus-like shell
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    addPuff("cap", th, ph, Math.random());
  }
  for (let i = 0; i < 70; i++) addPuff("stem", Math.random() * Math.PI * 2, Math.random(), Math.random());   // stem
  for (let i = 0; i < 60; i++) addPuff("base", Math.random() * Math.PI * 2, Math.random(), Math.random());  // base surge / skirt

  // receivers (3D models + floating marker pins)
  const recGroup = new THREE.Group();
  scene.add(recGroup);
  function buildReceivers() {
    while (recGroup.children.length) recGroup.remove(recGroup.children[0]);
    for (const r of state.receivers) {
      const color = levelColor(state.results[r.id]);
      const model = makeModel(r, color);
      const L = realLength(r);
      const vis = r.kind === "person" ? 6 : 1;            // boats drawn 6x bigger so they can be seen
      model.scale.setScalar(L * vis);
      model.position.set(r.x_m, r.kind === "person" ? 0.4 * L * vis * 0.16 : r.z_m, r.y_m || 0);
      model.rotation.y = r.kind === "person" ? Math.PI : 0;   // boats face ground zero
      recGroup.add(model);
      const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(r.emoji || "•", color), depthTest: false, sizeAttenuation: false }));
      pin.scale.set(0.045, 0.045, 1);
      pin.position.set(r.x_m, Math.max(25, L * vis * 2), r.y_m || 0);
      pin.renderOrder = 10;
      recGroup.add(pin);
      if (r.kind !== "person") {   // a line from the pin down to the animal's depth
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(r.x_m, pin.position.y, 0), new THREE.Vector3(r.x_m, r.z_m, 0)]);
        recGroup.add(new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.8 })).computeLineDistances());
      }
    }
  }

  // ---------------------------------------------------------------- camera presets
  function sizes() {
    const y = scenario().burst.yield_kt || 1;
    return { top: cloudTopM(y), rad: cloudRadiusM(y) };
  }
  function setPreset(name) {
    const sc = scenario(), { top } = sizes(), bz = Math.max(sc.burst.z_m, 0);
    const boat = state.receivers.find((r) => r.kind === "person");
    const look = new THREE.Vector3(0, Math.max(top * 0.45, bz), 0);
    if (name === "boat") {
      const x = boat ? boat.x_m : Math.max(top * 1.5, 3000);
      camera.position.set(x + 15, 6, 8);
    } else if (name === "side") {
      camera.position.set(-top * 0.2, Math.max(top * 0.08, 60), top * 2.2);
      look.set(0, top * 0.4, 0);
    } else if (name === "far") {
      camera.position.set(top * 4.5, Math.max(top * 0.1, 80), top * 3.5);
      look.set(0, top * 0.35, 0);
    } else {   // aerial
      camera.position.set(top * 1.6, top * 1.1, top * 1.9);
    }
    controls.target.copy(look);
    controls.update();
  }

  // ---------------------------------------------------------------- per-frame update
  let lastT = performance.now(), active = false;
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
    controls.update();

    const sc = scenario(), y = sc.burst.yield_kt;
    const t = timeline.getTime(), data = timeline.getData();
    const bz = sc.burst.z_m;
    const info = getInfo();

    // --- fireball and flash
    let flash = 0;
    const fb = data && data.fireball;
    if (bz >= 0 && fb && t > 0 && t < fb.end_s) {
      const r = interpLogT(fb.t_s, fb.radius_m, t), pw = interpLogT(fb.t_s, fb.power, t);
      const fade = Math.min(1, Math.max(0, 1.4 - t / fb.end_s));
      fireball.visible = glow.visible = true;
      fireball.scale.setScalar(Math.max(r, 1));
      fireball.position.set(0, bz + Math.max(0, t - fb.end_s * 0.3) * 20, 0);
      fireball.material.color.setHSL(0.1 - 0.06 * (1 - pw), 1, 0.55 + 0.4 * pw);
      fireball.material.opacity = 0.35 + 0.65 * fade;
      glow.position.copy(fireball.position);
      glow.scale.setScalar(r * (4 + 6 * pw));
      glow.material.opacity = 0.4 + 0.6 * pw;
      fireLight.position.copy(fireball.position);
      fireLight.intensity = 2e9 * pw * Math.pow(y, 0.8);
      flash = pw;
    } else if (bz >= 0 && !data && info && info.fireball_radius_m) {   // no timeline yet: show the full-size fireball
      fireball.visible = glow.visible = true;
      fireball.scale.setScalar(info.fireball_radius_m);
      fireball.position.set(0, bz, 0);
      glow.position.copy(fireball.position); glow.scale.setScalar(info.fireball_radius_m * 5);
      fireLight.intensity = 0;
    } else { fireball.visible = glow.visible = false; fireLight.intensity = 0; }
    renderer.toneMappingExposure = 0.5 + 2.5 * flash;

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
    } else { shell.visible = blastRing.visible = false; }

    // --- waves (crest rings); heights below 1 m drawn at 1 m so they stay visible
    const wv = data && data.waves;
    if (wv && t > 0) {
      const rMax = wv.max_wave_speed_m_s * t;
      const L = 9.81 * wv.period_s * wv.period_s / (2 * Math.PI);   // deep-water wavelength for that period
      const h = interpLogT(wv.ranges_m, wv.height_high_m, Math.max(rMax, wv.ranges_m[0]), wv.height_high_m[0]);
      waveRings.forEach((m, k) => {
        const r = rMax - k * L;
        m.visible = r > 50 && h > 0.05;
        if (!m.visible) return;
        m.scale.set(r, r, Math.max(h, 1) / 2 / (r * 0.0025));   // tube thickness ~ wave height
        m.position.y = 0.2;
        m.material.opacity = 0.85 * Math.pow(0.7, k);
      });
    } else waveRings.forEach((m) => (m.visible = false));

    // --- cloud or water column
    updateCloud(t, y, bz, data, fb);

    // --- receivers bob a little with the ripples
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

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
      for (const p of puffs) {
        const { kind, u, v, w } = p.userData;
        let x, yy, z, size, op;
        if (kind === "base") {
          const r = surgeR * (0.7 + 0.3 * w);
          x = Math.cos(u) * r; z = Math.sin(u) * r; yy = 60 * k * (0.3 + v); size = 260 * k; op = surgeR > 0 ? 0.55 * (1 - fall * 0.7) : 0;
        } else {
          const h = H * rise * (kind === "stem" ? v : 0.8 + 0.2 * w) * (1 - 0.8 * fall);
          const rr = R * (kind === "stem" ? 0.8 : 1.1) * (0.5 + 0.5 * w);
          x = Math.cos(u) * rr; z = Math.sin(u) * rr; yy = h; size = R * 0.9; op = 0.9 * (1 - fall);
        }
        p.position.set(x, yy, z);
        p.scale.setScalar(size * p.userData.size);
        p.material.opacity = op;
        p.material.color.setRGB(0.95, 0.97, 1.0);
      }
      return;
    }
    // air / surface burst: mushroom cloud
    const topF = cloudTopM(y) + (y <= 15 ? bz : 0), botF = Math.min(cloudBottomM(y) + (y <= 15 ? bz : 0), topF * 0.8);
    const aF = cloudRadiusM(y);
    const frac = riseFraction(tEff);
    const fbMax = (fb && fb.max_radius_m) || 100;
    const top = Math.max(topF * frac, bz + fbMax * 1.2);
    if (tEff <= 0 || (fb && tEff < fb.end_s * 0.4)) return show(false);
    const disperse = Math.min(1, Math.max(0, (tEff - 3600) / 7200));   // visible for about an hour, then disperses (sec. 2.15)
    if (disperse >= 1) return show(false);
    show(true);
    const capH = Math.max((topF - botF) / 2, 50) * Math.min(1, 0.3 + frac);
    const capC = top - capH;
    const a = aF * Math.min(1, 0.2 + 0.8 * frac) * (1 + 0.2 * Math.max(0, Math.log10(Math.max(tEff / 600, 1))));
    const stemR = aF * stemRatio(y) * Math.min(1, 0.3 + frac);
    const hot = Math.max(0, 1 - tEff / 25);             // glowing orange for the first ~20 s
    const surface = bz < 3 * Math.cbrt(y) * 0.3048 * 5;  // contact-ish burst: darker, debris-laden stem
    for (const p of puffs) {
      const { kind, u, v, w, spin } = p.userData;
      let x, yy, z, size;
      if (kind === "cap") {
        const roll = u + spin * tEff * 0.02;
        const ring = 0.55 + 0.45 * Math.sin(v);           // denser at the rim (rolling torus look)
        x = Math.cos(roll) * a * ring; z = Math.sin(roll) * a * ring;
        yy = capC + Math.cos(v) * capH;
        size = a * 0.55;
      } else if (kind === "stem") {
        const r = stemR * (0.4 + 0.6 * w) * (1 + 0.6 * (1 - v));
        x = Math.cos(u) * r; z = Math.sin(u) * r;
        yy = bz * 0 + (capC - capH * 0.6) * v;
        size = stemR * 1.4;
      } else {   // low skirt of spray/condensation at the base
        const r = (stemR * 1.5 + a * 0.4 * w) * Math.min(1, frac * 2);
        x = Math.cos(u) * r; z = Math.sin(u) * r; yy = 40 + 80 * v; size = stemR * 1.6;
      }
      p.position.set(x, Math.max(yy, 5), z);
      p.scale.setScalar(Math.max(size, 30) * p.userData.size);
      const shade = kind === "cap" ? 0.92 - 0.25 * (1 - Math.cos(v)) * 0.5 : kind === "stem" ? (surface ? 0.75 : 0.88) : 0.95;
      p.material.color.setRGB(lerp(shade, 1.0, hot), lerp(shade, 0.55, hot), lerp(shade * (surface ? 0.95 : 1), 0.25, hot));
      p.material.opacity = (kind === "base" ? 0.45 : 0.9) * (1 - disperse);
    }
  }

  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function setActive(on) {
    active = on;
    controls.enabled = on;
    if (on) buildReceivers();
  }

  setPreset("aerial");
  window.nukesimRealistic = { cloud, glow, fireball, camera, scene, sky, water, renderer, controls };   // handy for checking things in the browser console
  return { scene, camera, controls, update, setPreset, setActive, resize, rebuildReceivers: buildReceivers,
    notes: [
      "Fireball, blast front and waves: from the simulator's timeline (validated models).",
      "Mushroom cloud size and rise: curve fits to Glasstone & Dolan Figs. 2.12 and 9.96 and Miller (1963), as in NUKEMAP; its shape is illustrative.",
      "Underwater-burst water column: illustrative, scaled from the 1946 BAKER test by the cube root of the yield (our assumption).",
      "Boats are drawn 6x larger and animals have marker pins so they can be seen at these distances.",
    ] };
}
