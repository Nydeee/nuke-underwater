// Real 3D waves on the sea surface, from the simulator's wave model (water_waves.py via the timeline).
//
// What comes from the model: the height of the biggest waves at each distance (upper estimate,
// crest to trough), their period, and how fast the wave group travels outwards.
// What is our drawing: the shape of the wave train around the biggest wave (a few crests ahead and
// a longer train behind, as in a dispersive wave group), and the foam on steep crests.
// Heights are true size unless the "exaggerate waves" setting multiplies them (labelled in the app).

import * as THREE from "three";

const NA = 16;   // number of distance samples passed to the shader

/** A disc of water centred on ground zero, fine near the middle and coarse far away. */
export function polarSea(rMax = 6e5, nr = 360, na = 300, rMin = 3) {
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 0; i < nr; i++) {
    const r = rMin * Math.pow(rMax / rMin, i / (nr - 1));
    for (let j = 0; j < na; j++) {
      const a = (j / na) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);   // in the plane's own x-y (it is turned flat later)
    }
  }
  const at = (i, j) => 1 + i * na + (j % na);
  for (let j = 0; j < na; j++) idx.push(0, at(0, j), at(0, j + 1));
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < na; j++) {
    idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

const GLSL = `
  uniform float wOn, wGroupR, wPhaseC, wLen, wTime, wGain, wLogR0, wLogStep;
  uniform float wAmp[${NA}];
  float wAmpAt(float r) {
    float x = (log(max(r, 1.0)) - wLogR0) / wLogStep;
    if (x <= 0.0) return wAmp[0];
    float a = 0.0;
    for (int i = 0; i < ${NA - 1}; i++) {
      if (x >= float(i) && x < float(i + 1)) a = mix(wAmp[i], wAmp[i + 1], x - float(i));
    }
    if (x >= float(${NA - 1})) a = wAmp[${NA - 1}];
    return a;
  }
  // height of the sea (m) at distance r from ground zero, and its slope along r
  vec2 wEta(float r) {
    if (wOn < 0.5) return vec2(0.0);
    float d = r - wGroupR;
    float w = d > 0.0 ? 1.3 * wLen : 4.0 * wLen;           // a few crests ahead, a longer train behind
    float env = exp(-(d * d) / (w * w)) * smoothstep(0.0, 0.6 * wLen, r);
    float k = 6.2831853 / wLen;
    float ph = k * (r - wPhaseC * wTime);
    float A = wAmpAt(r) * wGain;
    return vec2(A * env * cos(ph), -A * env * k * sin(ph));
  }
`;

/** Add the waves to three.js's Water shader (the plane is turned flat: its local z is "up"). */
export function patchWater(material) {
  const u = {
    wOn: { value: 0 }, wGroupR: { value: 0 }, wPhaseC: { value: 1 }, wLen: { value: 100 }, wTime: { value: 0 },
    wGain: { value: 1 }, wLogR0: { value: 0 }, wLogStep: { value: 1 }, wAmp: { value: new Array(NA).fill(0) },
  };
  Object.assign(material.uniforms, u);
  material.vertexShader = material.vertexShader
    .replace("varying vec4 worldPosition;", `varying vec4 worldPosition;\nvarying vec2 wSlope;\n${GLSL}`)
    .replace("mirrorCoord = modelMatrix * vec4( position, 1.0 );", `
      vec3 p = position;
      float rr = length(p.xy);
      vec2 e = wEta(rr);
      p.z += e.x;
      wSlope = rr > 0.0 ? e.y * p.xy / rr : vec2(0.0);
      mirrorCoord = modelMatrix * vec4( p, 1.0 );`)
    .replace("vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );", "vec4 mvPosition =  modelViewMatrix * vec4( p, 1.0 );");
  material.fragmentShader = material.fragmentShader
    .replace("varying vec4 worldPosition;", "varying vec4 worldPosition;\nvarying vec2 wSlope;")
    .replace("vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );",
      // local plane (x, y) -> world (x, -z) after the flat turn
      "vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) + vec3( -wSlope.x, 0.0, wSlope.y ) * 4.0 );")
    .replace("gl_FragColor = vec4( outgoingLight, alpha );", `
      float steep = length(wSlope);
      outgoingLight = mix(outgoingLight, vec3(0.92, 0.96, 1.0), smoothstep(0.06, 0.22, steep) * 0.75);   // foam on steep crests
      gl_FragColor = vec4( outgoingLight, alpha );`);
  material.needsUpdate = true;
  return material.uniforms;
}

/** Update the waves for timeline time t. wv = timeline data.waves; gain = exaggeration. Returns a JS copy for boats. */
export function updateWaves(u, wv, t, gain = 1) {
  if (!wv || !(t > 0) || !wv.ranges_m?.length) { u.wOn.value = 0; return null; }
  const T = wv.period_s, L = 9.81 * T * T / (2 * Math.PI);   // deep-water wavelength for that period
  const rs = wv.ranges_m, hs = wv.height_high_m;
  const l0 = Math.log(rs[0]), l1 = Math.log(rs[rs.length - 1]), step = (l1 - l0) / (NA - 1);
  const amp = u.wAmp.value;
  for (let i = 0; i < NA; i++) {   // sample the model's heights (log-spaced distances); amplitude = half the crest-to-trough height
    const lr = l0 + i * step;
    let j = 1;
    while (j < rs.length - 1 && Math.log(rs[j]) < lr) j++;
    const f = (lr - Math.log(rs[j - 1])) / (Math.log(rs[j]) - Math.log(rs[j - 1]) || 1);
    const h = Math.exp(Math.log(Math.max(hs[j - 1], 1e-4)) + (Math.log(Math.max(hs[j], 1e-4)) - Math.log(Math.max(hs[j - 1], 1e-4))) * Math.min(Math.max(f, 0), 1));
    amp[i] = 0.5 * h;
  }
  u.wOn.value = 1;
  u.wGroupR.value = wv.max_wave_speed_m_s * t;
  u.wPhaseC.value = 2 * wv.max_wave_speed_m_s;   // deep water: crests move at twice the group speed
  u.wLen.value = Math.max(L, 20);
  u.wTime.value = t;
  u.wGain.value = gain;
  u.wLogR0.value = l0; u.wLogStep.value = step;
  return { groupR: u.wGroupR.value, c: u.wPhaseC.value, L: u.wLen.value, t, gain, amp: amp.slice(), l0, step };
}

/** Same formula in JavaScript: sea height and slope at distance r (for floating boats). */
export function etaAt(w, r) {
  if (!w) return [0, 0];
  const x = (Math.log(Math.max(r, 1)) - w.l0) / w.step, i = Math.min(Math.max(Math.floor(x), 0), NA - 2);
  const A = (x <= 0 ? w.amp[0] : x >= NA - 1 ? w.amp[NA - 1] : w.amp[i] + (w.amp[i + 1] - w.amp[i]) * (x - i)) * w.gain;
  const d = r - w.groupR, wd = d > 0 ? 1.3 * w.L : 4 * w.L;
  const env = Math.exp(-(d * d) / (wd * wd)) * Math.min(1, Math.max(0, r / (0.6 * w.L)));
  const k = 2 * Math.PI / w.L, ph = k * (r - w.c * w.t);
  return [A * env * Math.cos(ph), -A * env * k * Math.sin(ph)];
}
