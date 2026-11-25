// Flying water: thousands of droplets/spray clumps thrown up by bursts at or under the surface.
// Each one flies on a ballistic arc (up, then falling back under gravity) from the moment of the
// burst, so a spray dome, a hollow column and its fall-back appear on their own.
//
// ILLUSTRATIVE: the overall height and width are the same BAKER-scaled sizes as the water column in
// realistic.js (Glasstone sec. 2.53-2.68, cube-root scaling: our assumption); how individual
// droplets fly is drawing, not a physical spray model.

import * as THREE from "three";

const G = 9.81;

function dropTexture() {
  const S = 64, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.4, "rgba(240,246,250,0.55)"); gr.addColorStop(1, "rgba(230,240,245,0)");
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export function createSpray(scene, n = 9000) {
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("psize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("palpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: dropTexture() }, scale: { value: 800 }, tint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `
      attribute float psize; attribute float palpha; varying float vA;
      uniform float scale;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vA = palpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(psize * scale / max(-mv.z, 1.0), 0.0, 220.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 tint; varying float vA;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec4 c = texture2D(map, gl_PointCoord);
        if (c.a * vA < 0.01) discard;
        gl_FragColor = vec4(tint * c.rgb, c.a * vA);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);

  // fixed random "recipe" for every droplet: launch delay, where on the ring, how steep, how fast
  const rnd = new Float32Array(n * 5);
  for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();

  /**
   * t: seconds since the burst; mode: "under" (column), "surface" (spray thrown out) or null;
   * H, R: column height and radius (m); light: [r, g, b] for the lighting of the moment.
   */
  function update(t, mode, H, R, light) {
    if (!mode || !(t > 0) || t > 240) { pts.visible = false; return; }
    pts.visible = true;
    mat.uniforms.tint.value.setRGB(...light);
    const vUp = Math.sqrt(2 * G * H);                 // launch speed that reaches height H
    for (let i = 0; i < n; i++) {
      const a = rnd[i * 5], b = rnd[i * 5 + 1], c = rnd[i * 5 + 2], d = rnd[i * 5 + 3], e = rnd[i * 5 + 4];
      let x0, z0, vx, vz, vy, t0, sz;
      const az = a * Math.PI * 2;
      if (mode === "under") {
        if (i < n * 0.25) {                            // spray dome: a fast hemisphere of spray at first
          const el = Math.acos(Math.pow(b, 0.6));      // mostly upward
          const v = vUp * (0.35 + 0.25 * c);
          vx = Math.cos(az) * Math.sin(el) * v; vz = Math.sin(az) * Math.sin(el) * v; vy = Math.cos(el) * v;
          x0 = z0 = 0; t0 = 0; sz = R * (0.08 + 0.1 * d);
        } else if (i < n * 0.8) {                      // the hollow column: water shot straight up from a ring
          const rr = R * (0.65 + 0.35 * Math.sqrt(b));
          x0 = Math.cos(az) * rr; z0 = Math.sin(az) * rr;
          const out = (0.02 + 0.06 * c) * vUp;          // spreading out a little as it rises
          vx = Math.cos(az) * out; vz = Math.sin(az) * out; vy = vUp * (0.75 + 0.25 * Math.pow(d, 0.3));
          t0 = 0.2 + 1.2 * e; sz = R * (0.12 + 0.14 * d);
        } else {                                       // plumes leaning outward ("cauliflower")
          const el = 0.25 + 0.5 * b;
          const v = vUp * (0.6 + 0.35 * c);
          vx = Math.cos(az) * Math.sin(el) * v; vz = Math.sin(az) * Math.sin(el) * v; vy = Math.cos(el) * v;
          x0 = Math.cos(az) * R * 0.5; z0 = Math.sin(az) * R * 0.5; t0 = 0.3 + 1.5 * e; sz = R * (0.15 + 0.2 * d);
        }
      } else {                                         // burst on the surface: spray thrown outward, lower
        const el = 0.35 + 0.9 * b;
        const v = vUp * (0.4 + 0.6 * c);
        vx = Math.cos(az) * Math.sin(el) * v; vz = Math.sin(az) * Math.sin(el) * v; vy = Math.cos(el) * v;
        x0 = Math.cos(az) * R * 0.3 * d; z0 = Math.sin(az) * R * 0.3 * d; t0 = 0.05 + 0.6 * e; sz = R * (0.08 + 0.12 * d);
      }
      const tt = t - t0;
      let x = 0, y = -1e6, z = 0, al = 0;
      if (tt > 0) {
        const drag = 1 / (1 + 0.04 * tt);              // air slows the spray down a little
        x = x0 + vx * tt * drag; z = z0 + vz * tt * drag;
        y = vy * tt - 0.5 * G * tt * tt;
        const flight = 2 * vy / G;
        al = y > 0 ? Math.min(1, tt * 3) * (1 - Math.max(0, (tt - flight * 0.85) / (flight * 0.15))) : 0;
        if (y < 0) { y = 0; al = 0; }                  // back in the sea
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      size[i] = 3 * sz * (1 + 0.8 * Math.min(Math.max(tt, 0) / 10, 1));   // clumps of spray, spreading out as they fly
      alpha[i] = al * 0.8;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.psize.needsUpdate = true;
    geo.attributes.palpha.needsUpdate = true;
  }
  function setScale(viewportHeight, fovDeg) { mat.uniforms.scale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); }
  return { update, setScale, points: pts };
}
