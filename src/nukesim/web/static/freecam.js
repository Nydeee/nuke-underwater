// Game-style free camera ("freecam") and smooth camera moves, shared by both views.
//
// Freecam: click the scene to grab the mouse. Mouse = look around, W/A/S/D = move,
// E or Space = up, Q or C = down, Shift = faster, Alt = slower, mouse wheel = change speed,
// Esc = let go of the mouse (press F or pick a camera preset to leave freecam).

import * as THREE from "three";

export function createFreecam({ dom, onChange }) {
  let camera = null, speedOf = () => 10, active = false, locked = false, speedMul = 1;
  let yaw = 0, pitch = 0;
  const keys = new Set(), vel = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");

  function typing() {
    const a = document.activeElement;
    return !!a && (a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes(a.type)));
  }

  function enable(cam, speedFn) {
    camera = cam; speedOf = speedFn;
    euler.setFromQuaternion(camera.quaternion, "YXZ");
    yaw = euler.y; pitch = euler.x;
    vel.set(0, 0, 0);
    active = true;
    document.body.classList.add("flying");
    lock();
    onChange?.();
  }
  function disable() {
    if (!active) return;
    active = false; keys.clear();
    document.body.classList.remove("flying");
    if (document.pointerLockElement === dom) document.exitPointerLock();
    onChange?.();
  }
  function lock() {
    try { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* needs a click */ }
  }

  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === dom;
    document.body.classList.toggle("flyLocked", locked);
    onChange?.();
  });
  dom.addEventListener("click", () => { if (active && !locked) lock(); });
  document.addEventListener("mousemove", (e) => {
    if (!active || !locked) return;
    yaw -= e.movementX * 0.0022;
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0022));
  });
  dom.addEventListener("wheel", (e) => {
    if (!active) return;
    e.preventDefault();
    speedMul = Math.min(Math.max(speedMul * (e.deltaY < 0 ? 1.25 : 0.8), 0.05), 50);
    onChange?.();
  }, { passive: false });

  const MOVE = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyC", "Space", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"];
  window.addEventListener("keydown", (e) => {
    if (!active || typing() || e.metaKey || e.ctrlKey) return;
    if (MOVE.includes(e.code)) { keys.add(e.code); e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();
  function update(dt) {
    if (!active) return;
    euler.set(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    want.set(0, 0, 0);
    if (keys.has("KeyW")) want.add(fwd);
    if (keys.has("KeyS")) want.sub(fwd);
    if (keys.has("KeyD")) want.add(right);
    if (keys.has("KeyA")) want.sub(right);
    if (keys.has("KeyE") || keys.has("Space")) want.y += 1;
    if (keys.has("KeyQ") || keys.has("KeyC")) want.y -= 1;
    if (want.lengthSq() > 0) want.normalize();
    let s = speedOf(camera.position) * speedMul;
    if (keys.has("ShiftLeft") || keys.has("ShiftRight")) s *= 4;
    if (keys.has("AltLeft") || keys.has("AltRight")) s *= 0.25;
    want.multiplyScalar(s);
    vel.lerp(want, 1 - Math.exp(-dt * 8));          // smooth start and stop
    camera.position.addScaledVector(vel, dt);
  }

  /** A point straight ahead of the camera, for handing back to the orbit camera. */
  function lookPoint(dist) {
    camera.getWorldDirection(fwd);
    return camera.position.clone().addScaledVector(fwd, dist);
  }

  return {
    enable, disable, update, lookPoint,
    get active() { return active; }, get locked() { return locked; }, get speed() { return speedMul; },
  };
}

/** Smoothly move an orbit camera to a new position and target (eased, about a second). */
export function createCameraTween(camera, controls) {
  let tw = null;
  const ease = (f) => (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);
  return {
    to(pos, target, dur = 1.1, instant = false) {
      if (instant || dur <= 0) {
        tw = null; camera.position.copy(pos); controls.target.copy(target); controls.update(); return;
      }
      // long jumps: go through a log-space path so huge distance changes don't feel like a teleport
      tw = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), dur: dur * 1000 };
    },
    update() {
      if (!tw) return false;
      const f = Math.min((performance.now() - tw.start) / tw.dur, 1), e = ease(f);
      camera.position.lerpVectors(tw.p0, tw.p1, e);
      controls.target.lerpVectors(tw.t0, tw.t1, e);
      if (f >= 1) tw = null;
      return true;
    },
    cancel() { tw = null; },
    get busy() { return !!tw; },
  };
}
