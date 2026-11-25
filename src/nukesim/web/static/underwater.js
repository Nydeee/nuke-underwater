// Underwater mode for the realistic view (used by realistic.js).
//
// When the camera dips below the sea surface (or the "Underwater" camera preset is picked),
// the scene switches to an underwater look. Everything is in METRES, like realistic.js.
//
// What is physics and what is decoration:
//   * shock front in the water: a sphere growing at the speed of sound from the burst
//     (timeline `water_shock`), cut off at the surface and at the sea floor;
//   * gas bubble of an underwater burst: its radius over time comes from the timeline
//     (`bubble`: Cole's bubble size, Rayleigh's growth and collapse);
//   * wave crests and the air-blast ring seen from below: the same radii as the rings above water
//     (timeline `waves` and `air_blast`);
//   * the bright "window" overhead: Snell's law (light from the whole sky squeezed into a cone
//     of about 48.6 degrees, because water bends light by a factor of 1.33);
//   * light shafts lean at the refracted sun angle (Snell's law again);
//   * water colour, how far you can see, the caustics' pattern and brightness, the floating
//     particles: decoration.

import * as THREE from "three";

const N_WATER = 1.333;
const UW_DEEP = new THREE.Color(0x03202c), UW_SHALLOW = new THREE.Color(0x1c95a0);
const FOG_DENSITY = 0.0042;     // illustrative: things fade out over a few hundred metres
const MAX_RINGS = 6;

// GLSL helpers shared by the shaders below
const HASH = `
  vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  // caustic-like bright web: the edges of an animated cell (Worley) pattern
  float cells(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p); float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = h22(i + g);
      o = 0.5 + 0.42 * sin(t * 0.9 + 6.2831 * o);
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return 1.0 - smoothstep(0.0, 0.16, f2 - f1);
  }
  float caustic(vec2 p, float t) { return cells(p, t) * 0.6 + cells(p * 1.7 + 3.1, t * 1.3) * 0.5; }
`;

const LOGDEPTH_V = ["#include <logdepthbuf_pars_vertex>", "#include <logdepthbuf_vertex>"];
const LOGDEPTH_F = ["#include <logdepthbuf_pars_fragment>", "#include <logdepthbuf_fragment>"];

export function initUnderwater({ scene, camera, renderer, sunDir, normalMap, glowTexture }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const fogColor = new THREE.Color().copy(UW_SHALLOW);
  const fog = new THREE.FogExp2(fogColor, FOG_DENSITY);

  // refracted sun direction under water (Snell): light shafts and caustics lean this way
  const sunUp = sunDir.clone().normalize();
  const sinI = Math.sqrt(1 - sunUp.y * sunUp.y), sinR = sinI / N_WATER;
  const horiz = new THREE.Vector3(sunUp.x, 0, sunUp.z).normalize();
  const shaftDir = new THREE.Vector3().copy(horiz).multiplyScalar(sinR).setY(Math.sqrt(1 - sinR * sinR)).normalize();   // points up to the light

  // ------------------------------------------------ the underside of the sea surface
  const ringR = new Float32Array(MAX_RINGS), ringA = new Float32Array(MAX_RINGS);
  const surfMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, depthWrite: true, fog: false,
    uniforms: {
      time: { value: 0 }, normalMap: { value: normalMap }, sunDir: { value: sunUp },
      fogColor: { value: fogColor }, density: { value: FOG_DENSITY },
      fireDir: { value: new THREE.Vector3(0, 1, 0) }, firePower: { value: 0 },
      ringR: { value: ringR }, ringA: { value: ringA }, ringW: { value: 20 },
      blastR: { value: 0 }, blastA: { value: 0 }, slickR: { value: -1e9 },
    },
    vertexShader: `varying vec3 vWorld;
      #include <common>
      ${LOGDEPTH_V[0]}
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `uniform float time; uniform sampler2D normalMap; uniform vec3 sunDir; uniform vec3 fogColor; uniform float density;
      uniform vec3 fireDir; uniform float firePower;
      uniform float ringR[${MAX_RINGS}]; uniform float ringA[${MAX_RINGS}]; uniform float ringW; uniform float blastR; uniform float blastA; uniform float slickR;
      varying vec3 vWorld;
      ${HASH}
      ${LOGDEPTH_F[0]}
      void main() {
        ${LOGDEPTH_F[1]}
        vec3 toFrag = vWorld - cameraPosition; float dist = length(toFrag); vec3 v = toFrag / dist;
        vec2 uv = vWorld.xz * 0.02;
        vec3 n1 = texture2D(normalMap, uv + vec2(time * 0.01, time * 0.007)).xzy * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, uv * 2.3 - vec2(time * 0.013, -time * 0.004)).xzy * 2.0 - 1.0;
        vec3 n = normalize(vec3(0.0, -1.0, 0.0) + 0.18 * vec3(n1.x + n2.x, 0.0, n1.z + n2.z));
        vec3 r = refract(v, n, ${N_WATER.toFixed(3)});
        vec3 col;
        if (dot(r, r) < 1e-4) {
          // outside Snell's window: total internal reflection shows the water below (dark, slightly lit)
          col = fogColor * 0.55 + vec3(0.0, 0.02, 0.03);
        } else {
          float h = max(r.y, 0.0);
          vec3 sky = mix(vec3(0.75, 0.86, 0.92), vec3(0.32, 0.6, 0.85), pow(h, 0.5));
          float s = max(dot(r, sunDir), 0.0);
          sky += vec3(1.0, 0.95, 0.8) * (pow(s, 300.0) * 6.0 + pow(s, 8.0) * 0.4);
          float f = max(dot(r, fireDir), 0.0);
          sky += vec3(1.0, 0.85, 0.55) * firePower * (pow(f, 40.0) * 30.0 + pow(f, 3.0) * 3.0);
          float edge = smoothstep(0.0, 0.25, -dot(v, n) - 0.66);   // Fresnel: dimmer near the window's edge
          col = mix(fogColor * 0.8, sky, 0.25 + 0.75 * edge);
        }
        col += vec3(0.5, 0.7, 0.75) * caustic(vWorld.xz * 0.12, time) * 0.06;
        // wave crests (from the timeline) seen from below: lighter bands of foam and bent light
        float rr = length(vWorld.xz);
        for (int i = 0; i < ${MAX_RINGS}; i++) {
          float b = exp(-pow((rr - ringR[i]) / ringW, 2.0));
          col = mix(col, vec3(0.85, 0.95, 1.0), b * ringA[i]);
          col *= 1.0 - 0.35 * ringA[i] * exp(-pow((rr - ringR[i] + ringW * 1.6) / ringW, 2.0));   // trough behind the crest
        }
        // air blast front sweeping over the surface (from the timeline)
        float bb = exp(-pow((rr - blastR) / max(blastR * 0.01, 3.0), 2.0));
        col += vec3(1.0) * bb * blastA;
        // where the water shock meets the surface: the fast-spreading "slick" described for underwater bursts in Glasstone ch. 2
        float sl = exp(-pow((rr - slickR) / max(slickR * 0.015, 4.0), 2.0));
        col = mix(col, vec3(0.9, 0.98, 1.0), sl * 0.8);
        col *= 1.0 - 0.25 * step(rr, slickR) * step(0.0, slickR);   // inside it the surface is churned and darker
        col = mix(fogColor, col, exp(-density * 0.6 * dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(6e4, 6e4), surfMat);
  surface.rotation.x = Math.PI / 2;   // faces down
  surface.position.y = -0.02;
  group.add(surface);

  // ------------------------------------------------ sea floor with caustics (only if the sea has a floor)
  const floorMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { time: { value: 0 }, fogColor: { value: fogColor }, density: { value: FOG_DENSITY }, depth: { value: 50 },
      shaft: { value: new THREE.Vector2(shaftDir.x / shaftDir.y, shaftDir.z / shaftDir.y) } },
    vertexShader: `varying vec3 vWorld;
      #include <common>
      ${LOGDEPTH_V[0]}
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `uniform float time; uniform vec3 fogColor; uniform float density; uniform float depth; uniform vec2 shaft;
      varying vec3 vWorld;
      ${HASH}
      ${LOGDEPTH_F[0]}
      void main() {
        ${LOGDEPTH_F[1]}
        float dist = length(vWorld - cameraPosition);
        vec2 p = vWorld.xz + shaft * depth;            // caustics are cast along the refracted sun direction
        float grain = h22(floor(vWorld.xz * 3.0)).x * 0.08;
        vec3 sand = vec3(0.55, 0.52, 0.42) * (0.92 + grain);
        float light = exp(-depth / 25.0);                // light fades with depth (illustrative)
        vec3 col = sand * (0.18 + 0.5 * light) + vec3(0.9, 1.0, 0.95) * caustic(p * 0.35, time) * 0.9 * light;
        col *= mix(vec3(1.0), vec3(0.4, 0.8, 0.85), clamp(depth / 40.0, 0.0, 1.0));   // red light is absorbed first
        col = mix(fogColor, col, exp(-density * dist));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6e4, 6e4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // ------------------------------------------------ light shafts (god rays)
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { time: { value: 0 }, strength: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying float vSeed;
      attribute float seed;
      #include <common>
      ${LOGDEPTH_V[0]}
      void main() { vUv = uv; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        ${LOGDEPTH_V[1]}
      }`,
    fragmentShader: `uniform float time; uniform float strength; varying vec2 vUv; varying float vSeed;
      ${LOGDEPTH_F[0]}
      void main() {
        ${LOGDEPTH_F[1]}
        float across = sin(vUv.x * 3.14159);
        float down = pow(vUv.y, 1.6);                  // brightest just under the surface
        float flicker = 0.55 + 0.45 * sin(time * (0.7 + vSeed) + vSeed * 40.0);
        float a = pow(across, 3.0) * down * flicker * 0.13 * strength;
        gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * a, a);
      }`,
  });
  const shafts = new THREE.Group();
  const SHAFT_LEN = 90;
  for (let i = 0; i < 26; i++) {
    const w = 4 + Math.random() * 9;
    const g = new THREE.PlaneGeometry(w, SHAFT_LEN, 1, 1);
    g.translate(0, -SHAFT_LEN / 2, 0);    // top edge at the surface
    g.setAttribute("seed", new THREE.Float32BufferAttribute(new Array(4).fill(Math.random()), 1));
    const m = new THREE.Mesh(g, shaftMat);
    m.userData.off = new THREE.Vector2((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120);
    m.frustumCulled = false;
    shafts.add(m);
  }
  group.add(shafts);
  const shaftQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaftDir);

  // ------------------------------------------------ floating particles ("marine snow")
  const SNOW = 1800, SNOW_BOX = 60;
  const snowPos = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW * 3; i++) snowPos[i] = (Math.random() - 0.5) * SNOW_BOX;
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const dg = dot.getContext("2d"), grad = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  dg.fillStyle = grad; dg.fillRect(0, 0, 32, 32);
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xcfe9e6, size: 0.06, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.6, depthWrite: false }));
  snow.frustumCulled = false;
  const snowBase = snowPos.slice();
  group.add(snow);

  // ------------------------------------------------ shock front in the water (timeline: water_shock)
  const clipSurface = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // keep y <= 0
  const clipFloor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e7);     // keep y >= -depth
  const rimMat = (color) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    clipping: true, clippingPlanes: [clipSurface, clipFloor],
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0.5 }, time: { value: 0 }, fogColor: { value: fogColor } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vWorld;
      #include <common>
      #include <clipping_planes_pars_vertex>
      ${LOGDEPTH_V[0]}
      void main() { vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
        ${LOGDEPTH_V[1]}
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; uniform float time; uniform vec3 fogColor; varying vec3 vN; varying vec3 vV; varying vec3 vWorld;
      #include <clipping_planes_pars_fragment>
      ${LOGDEPTH_F[0]}
      void main() {
        #include <clipping_planes_fragment>
        ${LOGDEPTH_F[1]}
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0);
        float shimmer = 0.75 + 0.25 * sin(vWorld.y * 0.9 + time * 7.0) * sin(vWorld.x * 0.05 + vWorld.z * 0.05);
        float vis = 0.25 + 0.75 * exp(-0.0015 * length(vWorld - cameraPosition));   // partly hidden by the murk
        float a = opacity * (0.3 + 0.8 * f) * shimmer * vis;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  const shock = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), rimMat(0xd8f6ff));
  shock.frustumCulled = false;
  group.add(shock);

  // ------------------------------------------------ gas bubble (timeline: bubble)
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({
    color: 0xd9eef5, metalness: 1, roughness: 0.12, envMapIntensity: 1.6, transparent: true, opacity: 0.92,
    clippingPlanes: [clipSurface, clipFloor], fog: false,
  }));
  const bubbleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  group.add(bubble, bubbleGlow);

  // ------------------------------------------------ per frame
  let time = 0;
  const interp = (ts, ys, t) => {     // linear interpolation (bubble times start at 0)
    if (t <= ts[0]) return ys[0];
    if (t >= ts[ts.length - 1]) return ys[ys.length - 1];
    let i = 1;
    while (ts[i] < t) i++;
    const f = (t - ts[i - 1]) / (ts[i] - ts[i - 1] || 1);
    return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
  };

  /**
   * Draw one frame of the underwater scene.
   * s: { dt, t, data, floorY (or null), rings: [{r, h}], ringWidth, blast: {r, strength}, fire: {pos, power} }
   */
  function update(s) {
    time += s.dt;
    const cam = camera.position, depth = Math.max(-cam.y, 0);
    // water colour darkens with depth (illustrative)
    fogColor.copy(UW_SHALLOW).lerp(UW_DEEP, Math.min(depth / 220, 1));
    fog.color.copy(fogColor);
    scene.background = fogColor;

    surfMat.uniforms.time.value = time;
    floorMat.uniforms.time.value = time;
    shaftMat.uniforms.time.value = time;
    surface.position.x = cam.x; surface.position.z = cam.z;

    // sea floor
    const hasFloor = s.floorY != null && isFinite(s.floorY);
    floor.visible = hasFloor;
    if (hasFloor) {
      floor.position.set(cam.x, s.floorY, cam.z);
      floorMat.uniforms.depth.value = -s.floorY;
      clipFloor.constant = -s.floorY;
    } else clipFloor.constant = 1e7;

    // light shafts around the camera, fading out deeper down
    shaftMat.uniforms.strength.value = Math.exp(-depth / 60) * (1 + 1.5 * (s.fire ? s.fire.power : 0));
    shafts.children.forEach((m) => {
      const o = m.userData.off;
      const x = cam.x + o.x, z = cam.z + o.y;
      m.position.set(x, -0.1, z);
      // turn each shaft to face the camera around its own (slanted) axis
      m.quaternion.copy(shaftQuat);
      const axis = shaftDir, toCam = new THREE.Vector3(cam.x - x, cam.y + SHAFT_LEN / 2, cam.z - z);
      toCam.addScaledVector(axis, -toCam.dot(axis)).normalize();
      const face = new THREE.Vector3(0, 0, 1).applyQuaternion(shaftQuat);
      const ang = Math.atan2(new THREE.Vector3().crossVectors(face, toCam).dot(axis), face.dot(toCam));
      m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
    });

    // marine snow drifts slowly and wraps around the camera
    const p = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW; i++) {
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? cam.x : k === 1 ? cam.y : cam.z;
        const drift = k === 1 ? -time * 0.15 : Math.sin(time * 0.2 + i) * 0.3;
        let v = snowBase[3 * i + k] + drift - c;
        v = ((v % SNOW_BOX) + SNOW_BOX * 1.5) % SNOW_BOX - SNOW_BOX / 2;
        p[3 * i + k] = c + v;
      }
      if (p[3 * i + 1] > -0.2) p[3 * i + 1] = -0.2 - (p[3 * i + 1] + 0.2) % 5;
    }
    snowGeo.attributes.position.needsUpdate = true;

    // wave crests and the air-blast ring seen from below
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = s.rings[i];
      ringR[i] = r ? r.r : -1e9;
      ringA[i] = r ? Math.min(0.85, 0.25 + 0.12 * Math.log2(1 + r.h)) * r.fade : 0;
    }
    surfMat.uniforms.ringW.value = s.ringWidth;
    surfMat.uniforms.blastR.value = s.blast ? s.blast.r : 0;
    surfMat.uniforms.blastA.value = s.blast ? s.blast.strength : 0;
    if (s.fire && s.fire.power > 0) {
      surfMat.uniforms.fireDir.value.copy(s.fire.pos).sub(cam).normalize();
      surfMat.uniforms.firePower.value = s.fire.power;
    } else surfMat.uniforms.firePower.value = 0;

    // shock front in the water: radius = speed of sound x time (timeline data)
    const ws = s.data && s.data.water_shock, t = s.t;
    if (ws && t > 0) {
      const r = ws.speed_m_s * t;
      shock.visible = r < 6e4;
      shock.scale.setScalar(r);
      shock.position.set(0, ws.source_z_m, 0);
      shock.material.uniforms.opacity.value = Math.min(1, 0.35 + 600 / Math.max(r, 1)) * 0.8;   // brightness illustrative
      shock.material.uniforms.time.value = time;
      const z0 = -ws.source_z_m;
      surfMat.uniforms.slickR.value = r > z0 ? Math.sqrt(r * r - z0 * z0) : -1e9;
    } else { shock.visible = false; surfMat.uniforms.slickR.value = -1e9; }

    // gas bubble (timeline data); it vents when it reaches the surface
    const b = s.data && s.data.bubble;
    if (b && t > 0 && t <= b.end_s) {
      const r = interp(b.t_s, b.radius_m, t);
      bubble.visible = bubbleGlow.visible = r > 0.5;
      bubble.scale.setScalar(r);
      bubble.position.set(0, b.center_z_m, 0);
      const hot = Math.max(0, 1 - t / Math.max(b.end_s * 0.15, 1e-3));   // glowing at first (illustrative)
      bubbleGlow.position.copy(bubble.position);
      bubbleGlow.scale.setScalar(r * 3.2);
      bubbleGlow.material.opacity = 0.25 + 0.75 * hot;
      bubble.material.emissive.setRGB(1.0 * hot, 0.75 * hot, 0.4 * hot);
    } else bubble.visible = bubbleGlow.visible = false;
  }

  function setOn(on) { group.visible = on; }
  return { group, fog, fogColor, update, setOn, shock, bubble, surface, floor };
}
