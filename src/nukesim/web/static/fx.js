// Visual building blocks for the realistic view: the fireball's surface, cloud puffs, the
// flash glare and the night sky. These only change how things LOOK; every size, time and
// distance they are drawn at comes from the simulator (see realistic.js).

import * as THREE from "three";

const NOISE = `
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
`;

/** The fireball's glowing, boiling surface. heat: 1 = just formed (white-hot) ... 0 = cooled (dark red, smoky). */
export function fireballMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, heat: { value: 1 }, opacity: { value: 1 }, gain: { value: 1 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vPos; varying vec3 vN; varying vec3 vV;
      void main() {
        vPos = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform float time; uniform float heat; uniform float opacity; uniform float gain;
      varying vec3 vPos; varying vec3 vN; varying vec3 vV;
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      vec3 ramp(float x) {
        vec3 a = vec3(0.10, 0.015, 0.0), b = vec3(0.75, 0.12, 0.02), c = vec3(1.0, 0.45, 0.08), d = vec3(1.0, 0.82, 0.45), e = vec3(1.0, 0.98, 0.92);
        if (x < 0.25) return mix(a, b, x / 0.25);
        if (x < 0.5) return mix(b, c, (x - 0.25) / 0.25);
        if (x < 0.75) return mix(c, d, (x - 0.5) / 0.25);
        return mix(d, e, (x - 0.75) / 0.25);
      }
      void main() {
        #include <logdepthbuf_fragment>
        float big = fbm(vPos * 2.2 + vec3(0.0, -time * 0.35, time * 0.1));
        float fine = fbm(vPos * 7.0 + vec3(time * 0.5, 0.0, -time * 0.3));
        float facing = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        float temp = heat * (0.62 + 0.5 * big) + 0.18 * fine * heat + 0.12 - (1.0 - facing) * (0.35 - 0.2 * heat);
        vec3 col = ramp(clamp(temp, 0.0, 1.0));
        float smoke = smoothstep(0.5, 0.78, fine * 0.7 + big * 0.5) * (1.0 - heat) * 0.9;   // dark smoke as it cools
        col = mix(col, vec3(0.09, 0.06, 0.05), smoke);
        col *= gain * (1.0 + 4.0 * heat * heat);   // brighter than white: the tone mapping squeezes it
        gl_FragColor = vec4(col, opacity * (0.65 + 0.35 * facing));
      }`,
  });
}

/** Soft cloud puffs, lit from above (a few varieties so the cloud doesn't look repetitive). */
export function puffTextures(n = 4) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    let seed = 1 + k * 97;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // overlapping round blobs inside a soft disc -> cauliflower edge
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * S * 0.26;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.85, r = S * (0.1 + rnd() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(0.6, "rgba(255,255,255,0.25)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // light from above: bright top, shaded underside
    g.globalCompositeOperation = "source-atop";
    const sh = g.createLinearGradient(0, S * 0.2, 0, S * 0.85);
    sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(70,80,95,0.55)");
    g.fillStyle = sh; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    out.push(t);
  }
  return out;
}

/** Star-shaped glare for the flash. */
export function glareTexture() {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.08, "rgba(255,250,235,0.9)");
  gr.addColorStop(0.3, "rgba(255,210,150,0.25)"); gr.addColorStop(1, "rgba(255,180,120,0)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {   // rays
    g.save(); g.translate(S / 2, S / 2); g.rotate((i * Math.PI) / 6 + 0.2);
    const rg = g.createLinearGradient(-S / 2, 0, S / 2, 0);
    rg.addColorStop(0, "rgba(255,240,220,0)"); rg.addColorStop(0.5, "rgba(255,240,220,0.5)"); rg.addColorStop(1, "rgba(255,240,220,0)");
    g.fillStyle = rg; g.fillRect(-S / 2, -1.5, S, 3);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A dome of stars for night (fixed random pattern). */
export function makeStars() {
  const n = 2500, pos = new Float32Array(n * 3);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) {
    const u = rnd() * Math.PI * 2, v = Math.acos(rnd());   // upper hemisphere
    pos.set([Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.scale.setScalar(9e5);
  p.frustumCulled = false;
  return p;
}

/** A layer of grey cloud seen from below and above (overcast weather). */
export function cloudDeck() {
  const S = 512, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(200,205,212,0.55)"; g.fillRect(0, 0, S, S);
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 40, a = 0.05 + rnd() * 0.12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 150 + Math.floor(rnd() * 90);
    gr.addColorStop(0, `rgba(${v},${v + 4},${v + 10},${a * 2})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6e5, 6e5),
    new THREE.MeshLambertMaterial({ map: t, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
