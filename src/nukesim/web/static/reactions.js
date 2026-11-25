// Optional "reactions" of the 3D models to what happens to them, driven by the timeline.
//
// ILLUSTRATIVE ONLY: the simulator tells us WHEN each effect arrives and HOW BAD it is; the
// movements here (a jolt when the pressure pulse passes, a badly hurt animal rolling over and
// drifting up, a person on deck falling, skin darkening after burns) are drawings of those
// results, not physics of how bodies move.
//
// Everything is a function of the timeline time t, so scrubbing back and forth works.

import * as THREE from "three";

const LEVELS = ["none", "possible", "likely", "severe", "lethal"];
const smooth = (a, b, x) => { const f = Math.min(Math.max((x - a) / (b - a), 0), 1); return f * f * (3 - 2 * f); };
const BURN = new THREE.Color(0x4a2414);

/** Remember a model's resting pose (call after placing it). */
export function setBase(model) {
  model.userData.base = { pos: model.position.clone(), rot: model.rotation.clone() };
}

/**
 * Pose a model at time t.
 *   rt     : this receiver's timeline entry (effects with onset_s, pulse, ...), or null
 *   on     : reactions switched on?
 *   scale  : how far a "big" movement is in this view's units (e.g. body length)
 *   awayX  : direction away from the burst along x (+1 or -1)
 */
export function pose(model, rt, t, { on = true, scale = 1, awayX = 1, canFloat = true } = {}) {
  const b = model.userData.base;
  if (!b) return;
  model.position.copy(b.pos);
  model.rotation.copy(b.rot);
  const person = model.userData.person;
  if (person) person.rotation.set(person.userData.rx0 ?? 0, person.rotation.y, 0);
  const mats = model.userData.bodyMats || [];
  for (const m of mats) { if (m.userData.orig == null) m.userData.orig = m.color.clone(); m.color.copy(m.userData.orig); }
  if (!on || !rt || rt.error) return;

  // worst injury that has happened so far (for a ship: only the damage to the ship itself, not to its crew)
  const ship = !!model.userData.ship;
  let worst = -1;
  for (const e of rt.effects || []) {
    if (ship && !e.name.startsWith("ship damage")) continue;
    if (e.onset_s != null && e.onset_s <= t) worst = Math.max(worst, LEVELS.indexOf(e.level));
  }
  if (ship) { shipPose(model, rt, t, worst); return; }

  // 1. a jolt as the pressure pulse passes (bigger for worse injuries)
  const p = rt.pulse;
  if (p && t >= p.arrival_s) {
    const dt = t - p.arrival_s;
    const amp = scale * (worst >= 3 ? 0.35 : worst >= 2 ? 0.2 : 0.08);
    const k = Math.exp(-dt / 0.25);
    model.position.x += awayX * amp * k * (1 - Math.cos(dt * 30)) * 0.5;
    model.rotation.z += 0.25 * k * Math.sin(dt * 34) * (worst >= 2 ? 1 : 0.4);
  }

  // 2. badly hurt: an animal rolls over and drifts up; a person on deck falls
  if (p && worst >= 3) {
    const dt = t - p.arrival_s;
    const roll = smooth(0.3, 6, dt);
    if (person) {
      person.rotation.z = -roll * Math.PI / 2;            // falls onto the deck
    } else {
      model.rotation.x += roll * Math.PI;                  // belly up
      if (canFloat && model.userData.floatTo != null) {
        const up = Math.min(model.userData.floatTo - b.pos.y, scale * 0.15 * Math.max(dt - 2, 0) / 60);   // slowly, over minutes
        model.position.y += Math.max(up, 0);
      }
    }
  } else if (p && worst === 2 && !person) {
    const dt = t - p.arrival_s;
    model.rotation.x += smooth(0.3, 4, dt) * 0.45;        // stunned: tilted to one side
  }

  // 3. burns darken the skin
  const burn = (rt.effects || []).find((e) => e.name.startsWith("burns") && e.onset_s != null && e.onset_s <= t);
  if (burn) {
    const f = { possible: 0.15, likely: 0.3, severe: 0.55, lethal: 0.7 }[burn.level] || 0;
    for (const m of mats) m.color.lerp(BURN, f);
  }
}

/** A ship: a short jolt when the shock arrives; a disabled ship takes on a slight list; a wrecked one
 *  heels over and settles low in the water over a few minutes. Drawing only: the damage level comes
 *  from the TM 23-200 criteria; how a ship lists or sinks is not modelled. */
function shipPose(model, rt, t, worst) {
  const p = rt.pulse;
  if (!p || t < p.arrival_s || worst < 1) return;
  const dt = t - p.arrival_s, k = Math.exp(-dt / 0.4);
  model.rotation.z += 0.03 * k * Math.sin(dt * 18);                        // the hull shudders
  if (worst === 2) model.rotation.x += smooth(1, 40, dt) * 0.1;              // disabled: a slight list
  if (worst >= 3) {                                                          // wrecked or sunk
    model.rotation.x += smooth(1, 60, dt) * 0.4;
    model.position.y -= smooth(5, 240, dt) * 0.12 * model.scale.y;
  }
}

