// Ragdolls: when the blast or the shock in the water reaches a person or an animal hard enough to
// hurt it ("likely" or worse), its 3D model goes limp and is thrown, using a physics engine (cannon-es).
//
// What comes from physics and what is drawing:
//   * WHEN: the moment the pressure pulse arrives (simulator timeline).
//   * HOW HARD the push is:
//       - in water: the shock moves the water itself at u = p / (rho c) (plane acoustic wave), and a
//         body moves with the water around it;
//       - in air: the wind behind the blast front, u = (5p / 7P0) c0 / sqrt(1 + 6p / 7P0), from the
//         Rankine-Hugoniot shock relations (Glasstone & Dolan ch. III). A person reaches only part of
//         that speed (we use a quarter: our choice; the real fraction depends on body size and the
//         length of the pulse).
//   * HOW the body bends and tumbles (joints, limits, water drag, neutral buoyancy): our drawing.
// This is illustrative; injury levels themselves always come from the injury models.

import * as THREE from "three";
import * as CANNON from "cannon-es";

const RHO_W = 1025, C_W = 1500, P0 = 101.325, C0 = 340;

/** Speed (m/s) a body is pushed at by a pulse with peak pressure p_kpa in water or air. */
export function pushSpeed(p_kpa, medium) {
  if (medium === "water") return Math.min(p_kpa * 1e3 / (RHO_W * C_W), 40);
  const x = p_kpa / P0;
  const wind = (5 * x / 7) * C0 / Math.sqrt(1 + 6 * x / 7);
  return Math.min(0.25 * wind, 40);
}

const v3 = (v) => new CANNON.Vec3(v.x, v.y, v.z);
const q4 = (q) => new CANNON.Quaternion(q.x, q.y, q.z, q.w);

// How the physics is solved, and the limits that keep a body from coming apart or bending the wrong way.
// Each was checked with a test harness (40 thrown people per setting: push speeds 2-40 m/s, on a deck and
// under water), measuring how far joints pull apart, how far knees and elbows bend backwards, and spin.
export const RAG = {
  step: 1 / 120,        // s, physics time step (smaller is steadier)
  iterations: 30,       // solver passes per step (more = joints held more firmly)
  maxSpin: 50,          // rad/s, a safety net only (clamping spin part by part pulls joints apart; in the tests
                        //   bodies stayed below about 23 rad/s, so this never acts unless something goes wrong)
  spin0: 3,             // rad/s, the whole body starts tumbling at up to this (all parts together)
  inertiaFloor: 0.35,   // thin limbs get at least this share of their largest moment of inertia (no whirling)
  hinges: true,         // knees and elbows bend one way only, like real ones
  angularDamping: 0.3,  // share of spin lost per second (in air)
  waterSpinLoss: 0.97,  // spin kept per physics step under water
};

export function createRagdolls(scene) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = RAG.iterations;
  const dolls = new Map();   // id -> { bodies, constraints, sync(), extra: [three objects to remove], statics }
  const GROUP_DOLL = 2, GROUP_STATIC = 1;

  // water: bodies under the surface are held up (about neutral) and slowed by drag
  world.addEventListener("preStep", () => {
    for (const d of dolls.values()) for (const b of d.bodies) {
      const w = b.angularVelocity.length();
      if (w > RAG.maxSpin) b.angularVelocity.scale(RAG.maxSpin / w, b.angularVelocity);
      const under = b.position.y < 0;
      if (under) {
        // (forces act at the centre of each body: cannon-es takes the point relative to the centre)
        b.applyForce(new CANNON.Vec3(0, b.mass * 9.81 * d.buoy, 0));
        const k = b.mass * 2.5;
        b.applyForce(new CANNON.Vec3(-b.velocity.x * k, -b.velocity.y * k, -b.velocity.z * k));
        b.angularVelocity.scale(RAG.waterSpinLoss, b.angularVelocity);
      }
    }
  });

  function addBody(shape, mass, pos, quat) {
    const b = new CANNON.Body({ mass, shape, position: v3(pos), quaternion: q4(quat), linearDamping: 0.05, angularDamping: RAG.angularDamping,
      collisionFilterGroup: GROUP_DOLL, collisionFilterMask: GROUP_STATIC });
    if (RAG.inertiaFloor > 0) {   // a thin box spins far too easily about its long axis; give it a floor
      const I = b.inertia, m = Math.max(I.x, I.y, I.z) * RAG.inertiaFloor;
      I.set(Math.max(I.x, m), Math.max(I.y, m), Math.max(I.z, m));
      b.invInertia.set(1 / I.x, 1 / I.y, 1 / I.z);
      b.updateInertiaWorld(true);
    }
    world.addBody(b);
    return b;
  }
  function join(a, b, pivotWorld, axisWorld, angle, twist) {
    const pa = a.pointToLocalFrame(v3(pivotWorld)), pb = b.pointToLocalFrame(v3(pivotWorld));
    const ax = v3(axisWorld);
    const c = new CANNON.ConeTwistConstraint(a, b, { pivotA: pa, pivotB: pb, axisA: a.vectorToLocalFrame(ax), axisB: b.vectorToLocalFrame(ax), angle, twistAngle: twist });
    world.addConstraint(c);
    return c;
  }

  // a cone joint whose cone points along axisAWorld (fixed in body a) and holds body b's axisBWorld inside it
  // Its twist limit is measured from reference directions set at spawn so that they agree then (cannon-es on its
  // own derives them from each body's arbitrary local frame, so a joint could start "over-twisted" and snap),
  // with the swing taken out first (the reference on a is turned with the cone, from its axis to b's axis).
  const _qs = new CANNON.Quaternion(), _ca = new CANNON.Vec3(), _cb = new CANNON.Vec3(), _r = new CANNON.Vec3();
  function cone(a, b, pivotWorld, axisAWorld, axisBWorld, angle, twist) {
    const c = new CANNON.ConeTwistConstraint(a, b, { pivotA: a.pointToLocalFrame(v3(pivotWorld)), pivotB: b.pointToLocalFrame(v3(pivotWorld)),
      axisA: a.vectorToLocalFrame(v3(axisAWorld)), axisB: b.vectorToLocalFrame(v3(axisBWorld)), angle, twistAngle: twist });
    if (twist < Math.PI) {
      const cB = axisBWorld.clone().normalize(), cA = axisAWorld.clone().normalize();
      const helper = Math.abs(cB.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const refB = new THREE.Vector3().crossVectors(cB, helper).normalize();                       // across b's axis
      const refA = refB.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(cB, cA));  // the same, carried back onto a's axis
      const rA = a.vectorToLocalFrame(v3(refA)), rB = b.vectorToLocalFrame(v3(refB));
      const base = c.update.bind(c);
      c.update = () => {
        base();
        a.vectorToWorldFrame(c.axisA, _ca); b.vectorToWorldFrame(c.axisB, _cb);
        _qs.setFromVectors(_ca.unit(_ca), _cb.unit(_cb));
        a.vectorToWorldFrame(rA, _r); _qs.vmult(_r, c.twistEquation.axisA);
        b.vectorToWorldFrame(rB, c.twistEquation.axisB);
      };
    }
    world.addConstraint(c);
    return c;
  }

  // ---------------------------------------------------------------- a person
  // segments for a person 1 unit tall standing on y = 0, facing +x (same layout as models.humanModel)
  const SEG = {
    pelvis: { c: [0, 0.48, 0], h: [0.08, 0.06, 0.13], col: "pants" }, torso: { c: [0, 0.67, 0], h: [0.09, 0.13, 0.15], col: "suit" },
    head: { c: [0, 0.92, 0], r: 0.09, col: "skin" },
    uaL: { c: [0, 0.62, 0.2], h: [0.04, 0.09, 0.04], col: "suit" }, laL: { c: [0, 0.45, 0.2], h: [0.035, 0.08, 0.035], col: "skin" },
    uaR: { c: [0, 0.62, -0.2], h: [0.04, 0.09, 0.04], col: "suit" }, laR: { c: [0, 0.45, -0.2], h: [0.035, 0.08, 0.035], col: "skin" },
    thL: { c: [0, 0.33, 0.07], h: [0.05, 0.1, 0.05], col: "pants" }, shL: { c: [0, 0.12, 0.07], h: [0.045, 0.11, 0.045], col: "pants" },
    thR: { c: [0, 0.33, -0.07], h: [0.05, 0.1, 0.05], col: "pants" }, shR: { c: [0, 0.12, -0.07], h: [0.045, 0.11, 0.045], col: "pants" },
  };
  const JOINTS = [
    ["torso", "head", [0, 0.83, 0], 0.6, 0.4], ["pelvis", "torso", [0, 0.54, 0], 0.5, 0.3],
    ["torso", "uaL", [0, 0.72, 0.19], 1.6, 0.6], ["uaL", "laL", [0, 0.535, 0.2], 1.2, 0.2],
    ["torso", "uaR", [0, 0.72, -0.19], 1.6, 0.6], ["uaR", "laR", [0, 0.535, -0.2], 1.2, 0.2],
    ["pelvis", "thL", [0, 0.43, 0.07], 1.0, 0.3], ["thL", "shL", [0, 0.225, 0.07], 1.1, 0.1],
    ["pelvis", "thR", [0, 0.43, -0.07], 1.0, 0.3], ["thR", "shR", [0, 0.225, -0.07], 1.1, 0.1],
  ];
  /** Turn a standing/lying person (a group whose local frame is the 1-unit-tall person) into a ragdoll. */
  function spawnHuman(id, personGroup, velocity, colors, deck = null, buoy = 1.0) {
    personGroup.updateMatrixWorld(true);
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    personGroup.matrixWorld.decompose(P, Q, S);
    const s = S.y, mass = 75;
    const mats = { skin: new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.6 }),
      suit: new THREE.MeshStandardMaterial({ color: colors.suit, roughness: 0.7 }), pants: new THREE.MeshStandardMaterial({ color: colors.pants, roughness: 0.8 }) };
    const bodies = {}, meshes = [];
    const toWorld = (c) => new THREE.Vector3(...c).multiplyScalar(s).applyQuaternion(Q).add(P);
    for (const [k, g] of Object.entries(SEG)) {
      const shape = g.r ? new CANNON.Sphere(g.r * s) : new CANNON.Box(new CANNON.Vec3(g.h[0] * s, g.h[1] * s, g.h[2] * s));
      const b = addBody(shape, mass * (g.r ? 0.08 : (g.h[0] * g.h[1] * g.h[2]) / 0.0016 * 0.5 + 1) / 10, toWorld(g.c), Q);
      bodies[k] = b;
      const geo = g.r ? new THREE.SphereGeometry(g.r * s, 14, 10) : new THREE.BoxGeometry(2 * g.h[0] * s, 2 * g.h[1] * s, 2 * g.h[2] * s);
      const m = new THREE.Mesh(geo, mats[g.col]);
      scene.add(m); meshes.push([m, b]);
    }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(Q);
    const constraints = JOINTS.map(([a, b, p, ang, tw]) => join(bodies[a], bodies[b], toWorld(p), up, ang, tw));
    for (const b of Object.values(bodies)) { b.velocity.set(velocity.x, velocity.y, velocity.z); b.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4); }
    const statics = [];
    if (deck) {   // the boat's deck, so the person can land on it (or be thrown overboard)
      const d = new CANNON.Body({ mass: 0, shape: new CANNON.Box(v3(deck.half)), position: v3(deck.pos), quaternion: q4(deck.quat),
        collisionFilterGroup: GROUP_STATIC, collisionFilterMask: GROUP_DOLL });
      world.addBody(d); statics.push(d);
    }
    personGroup.visible = false;
    dolls.set(id, {
      bodies: Object.values(bodies), constraints, statics, buoy, hidden: [personGroup],
      sync() { for (const [m, b] of meshes) { m.position.copy(b.position); m.quaternion.copy(b.quaternion); } },
      extra: meshes.map(([m]) => m),
    });
  }

  // ---------------------------------------------------------------- a rigged person (humans.js): physics drives the real bones
  // [driven bone, bone at the far end of the segment, radius as a share of body height, share of the mass]
  const RIG = [
    ["Hips", "Spine2", 0.07, 0.2], ["Spine2", "Neck", 0.08, 0.25], ["Head", "HeadTop_End", 0.06, 0.08],
    ["LeftArm", "LeftForeArm", 0.03, 0.035], ["LeftForeArm", "LeftHand", 0.027, 0.025],
    ["RightArm", "RightForeArm", 0.03, 0.035], ["RightForeArm", "RightHand", 0.027, 0.025],
    ["LeftUpLeg", "LeftLeg", 0.045, 0.1], ["LeftLeg", "LeftFoot", 0.035, 0.06],
    ["RightUpLeg", "RightLeg", 0.045, 0.1], ["RightLeg", "RightFoot", 0.035, 0.06],
  ];
  // joints: [parent segment, child segment, the bone where they meet, type, ...]
  //   "cone", half-angle, twist, [lean toward "front"/"back", by]: the limb may swing within a cone, centred
  //      on its rest direction leaned that way (hips swing forward much further than back, for example);
  //   "hinge", from, to, bending toward: knees and elbows turn about one axis only, between the two angles
  //      (0 = straight). Rough anatomical ranges of motion: knee 0-140 deg (bending backward), elbow 0-145 deg
  //      (bending forward), hip -20 to 120 deg and about 40 deg of rotation, shoulder well above the head and
  //      about 60 deg of rotation, neck and spine a little.
  const D = Math.PI / 180;
  const RIG_JOINTS = [
    ["Hips", "Spine2", "Spine1", "cone", 30 * D, 15 * D], ["Spine2", "Head", "Neck", "cone", 35 * D, 30 * D],
    ["Spine2", "LeftArm", "LeftArm", "cone", 80 * D, 60 * D, "front", 25 * D], ["LeftArm", "LeftForeArm", "LeftForeArm", "hinge", -5 * D, 140 * D, "front"],
    ["Spine2", "RightArm", "RightArm", "cone", 80 * D, 60 * D, "front", 25 * D], ["RightArm", "RightForeArm", "RightForeArm", "hinge", -5 * D, 140 * D, "front"],
    ["Hips", "LeftUpLeg", "LeftUpLeg", "cone", 65 * D, 40 * D, "front", 50 * D], ["LeftUpLeg", "LeftLeg", "LeftLeg", "hinge", -5 * D, 135 * D, "back"],
    ["Hips", "RightUpLeg", "RightUpLeg", "cone", 65 * D, 40 * D, "front", 50 * D], ["RightUpLeg", "RightLeg", "RightLeg", "hinge", -5 * D, 135 * D, "back"],
  ];
  /** rig: from humans.createHuman (already placed in the scene). */
  function spawnRig(id, rig, velocity, deck = null, buoy = 1.0) {
    rig.ragdoll = true;
    rig.group.updateMatrixWorld(true);
    const wp = (b) => b.getWorldPosition(new THREE.Vector3());
    const Hh = wp(rig.bones.HeadTop_End).distanceTo(wp(rig.bones.LeftFoot)) || 1;   // body height in the world
    const bodies = {}, drive = [];
    const up = new THREE.Vector3(0, 1, 0);
    // the body's own directions: across (left to right), along the spine, and the way it faces
    // (from the model itself, which faces +z: the hips can be turned in the idle pose)
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.inner.getWorldQuaternion(new THREE.Quaternion())).normalize();
    // one tumble for the whole body (separate random spins for each part make the limbs fight the joints)
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(RAG.spin0 * Math.random());
    for (const [name, endName, rad, share] of RIG) {
      const a = rig.bones[name], e = rig.bones[endName];
      if (!a || !e) continue;
      const pa = wp(a), pe = wp(e), mid = pa.clone().add(pe).multiplyScalar(0.5), len = Math.max(pa.distanceTo(pe), Hh * 0.04);
      const q = new THREE.Quaternion().setFromUnitVectors(up, pe.clone().sub(pa).normalize());
      const body = addBody(new CANNON.Box(new CANNON.Vec3(rad * Hh, len / 2, rad * Hh)), 75 * share, mid, q);
      body.velocity.set(velocity.x, velocity.y, velocity.z);
      body.angularVelocity.set(spin.x, spin.y, spin.z);
      bodies[name] = body;
      // remember how the bone sits relative to its body, to put it back there every frame
      const bq = a.getWorldQuaternion(new THREE.Quaternion());
      drive.push({ bone: a, body, qOff: q.clone().invert().multiply(bq), pOff: pa.clone().sub(mid).applyQuaternion(q.clone().invert()), root: name === "Hips" });
    }
    const constraints = [];
    // lean a direction d toward "front" or "back" by an angle (about the body's across axis)
    const lean = (d, toward, by) => {
      const t = (toward === "back" ? front.clone().negate() : front.clone()), perp = t.sub(d.clone().multiplyScalar(t.dot(d)));
      if (perp.lengthSq() < 1e-8) return d.clone();
      return d.clone().multiplyScalar(Math.cos(by)).add(perp.normalize().multiplyScalar(Math.sin(by)));
    };
    for (const [pa, ch, at, type, a1, a2, toward, by] of RIG_JOINTS) {
      if (!bodies[pa] || !bodies[ch]) continue;
      const pivot = wp(rig.bones[at]);
      const childDir = wp(rig.bones[RIG.find((r) => r[0] === ch)[1]]).sub(pivot).normalize();
      if (type === "hinge" && RAG.hinges) {
        // a knee or elbow turns about the lower bone's own x axis; turning it the negative way bends the
        // joint the natural way (checked on the model: knees fold back, elbows fold forward, both sides)
        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.bones[ch].getWorldQuaternion(new THREE.Quaternion())).normalize();
        const upperDir = pivot.clone().sub(wp(rig.bones[pa])).normalize();
        const bendDir = upperDir.clone().cross(axis).normalize();   // where the lower segment goes as the joint bends
        // how far it is bent now (the model's own pose may sit a little outside the range: never start outside it)
        const bent0 = Math.atan2(childDir.dot(bendDir), childDir.dot(upperDir));
        const lo = Math.min(a1, bent0 - 5 * D), hi = Math.max(a2, bent0 + 5 * D);
        const mid = (lo + hi) / 2, half = (hi - lo) / 2;
        const centre = upperDir.clone().multiplyScalar(Math.cos(mid)).add(bendDir.multiplyScalar(Math.sin(mid)));
        constraints.push(cone(bodies[pa], bodies[ch], pivot, centre, childDir, half, Math.PI));   // the range; the hinge stops twisting
        const h = new CANNON.HingeConstraint(bodies[pa], bodies[ch], {
          pivotA: bodies[pa].pointToLocalFrame(v3(pivot)), pivotB: bodies[ch].pointToLocalFrame(v3(pivot)),
          axisA: bodies[pa].vectorToLocalFrame(v3(axis)), axisB: bodies[ch].vectorToLocalFrame(v3(axis)) });
        world.addConstraint(h); constraints.push(h);
      } else if (type === "hinge") {
        constraints.push(join(bodies[pa], bodies[ch], pivot, childDir, (a2 - a1) / 2, 0.2));
      } else {
        constraints.push(cone(bodies[pa], bodies[ch], pivot, toward ? lean(childDir, toward, by) : childDir, childDir, a1, a2));
      }
    }
    const statics = [];
    if (deck) {
      const d = new CANNON.Body({ mass: 0, shape: new CANNON.Box(v3(deck.half)), position: v3(deck.pos), quaternion: q4(deck.quat),
        collisionFilterGroup: GROUP_STATIC, collisionFilterMask: GROUP_DOLL });
      world.addBody(d); statics.push(d);
    }
    const tq = new THREE.Quaternion(), pq = new THREE.Quaternion(), tp = new THREE.Vector3();
    dolls.set(id, {
      bodies: Object.values(bodies), constraints, statics, buoy, hidden: [], extra: [],
      sync() {
        for (const d of drive) {   // in skeleton order: parents first
          const bq = tq.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
          const want = bq.clone().multiply(d.qOff);
          d.bone.parent.getWorldQuaternion(pq);
          d.bone.quaternion.copy(pq.invert().multiply(want));
          if (d.root) {
            tp.copy(d.pOff).applyQuaternion(bq).add(d.body.position);
            d.bone.position.copy(d.bone.parent.worldToLocal(tp));
          }
          d.bone.updateMatrixWorld(true);
        }
      },
    });
  }

  // ---------------------------------------------------------------- a fish, dolphin or whale: a bendy spine
  /** model: the group from models.makeModel (1 unit long along +x), already placed in the world. */
  function spawnSpine(id, model, velocity, buoy = 1.0) {
    model.updateMatrixWorld(true);
    // the body: the meshes marked as such (artist-made animals), else the one painted with vertex colours
    let mains = model.children.filter((c) => c.isMesh && c.userData.spine);
    if (!mains.length) mains = model.children.filter((c) => c.isMesh && c.geometry.attributes.color && !c.isSkinnedMesh).slice(0, 1);
    if (!mains.length) return spawnRigid(id, model, velocity, buoy);
    const xs = [-0.4, -0.2, 0, 0.2, 0.4], nB = xs.length;
    // skin the body onto bones placed along it
    const skins = mains.map((main) => {
      const geo = main.geometry.clone(), p = geo.attributes.position, n = p.count;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const f = Math.min(Math.max((p.getX(i) - xs[0]) / 0.2, 0), nB - 1 - 1e-6), i0 = Math.floor(f), w = f - i0;
        si[i * 4] = i0; si[i * 4 + 1] = Math.min(i0 + 1, nB - 1); sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
      }
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
      const skinned = new THREE.SkinnedMesh(geo, main.material);
      skinned.frustumCulled = false;   // it moves far from where it started
      skinned.position.copy(main.position); skinned.quaternion.copy(main.quaternion); skinned.scale.copy(main.scale);
      model.add(skinned); model.remove(main);
      return skinned;
    });
    model.updateMatrixWorld(true);
    const Qm = new THREE.Quaternion(); model.getWorldQuaternion(Qm);
    const S = new THREE.Vector3(); model.getWorldScale(S);
    const L = S.x;
    const bones = xs.map((x) => {
      const bone = new THREE.Bone();
      bone.position.copy(model.localToWorld(new THREE.Vector3(x, 0, 0)));
      bone.quaternion.copy(Qm);
      scene.add(bone); bone.updateMatrixWorld(true);
      return bone;
    });
    const skeleton = new THREE.Skeleton(bones);
    for (const sk of skins) sk.bind(skeleton, sk.matrixWorld);
    // fins, eyes and the rest follow the nearest bone
    for (const c of [...model.children]) {
      if (skins.includes(c)) continue;
      const bx = c.position.x, k = xs.reduce((best, x, i) => (Math.abs(x - bx) < Math.abs(xs[best] - bx) ? i : best), 0);
      bones[k].attach(c);
    }
    const mass = Math.max(1, 1000 * Math.pow(L, 3) * 0.02);
    const bodies = bones.map((bone) => addBody(new CANNON.Sphere(0.11 * L), mass / nB, bone.position, bone.quaternion));
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(Qm);
    const constraints = [];
    for (let i = 0; i < nB - 1; i++) {
      const mid = bones[i].position.clone().add(bones[i + 1].position).multiplyScalar(0.5);
      constraints.push(join(bodies[i], bodies[i + 1], mid, axis, 0.45, 0.25));
    }
    for (const b of bodies) {
      b.velocity.set(velocity.x, velocity.y, velocity.z);
      b.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    }
    dolls.set(id, {
      bodies, constraints, statics: [], buoy, hidden: [],
      sync() { bones.forEach((bone, i) => { bone.position.copy(bodies[i].position); bone.quaternion.copy(bodies[i].quaternion); }); },
      extra: bones,
    });
  }

  // ---------------------------------------------------------------- anything else: one tumbling body
  function spawnRigid(id, model, velocity, buoy = 1.0) {
    model.updateMatrixWorld(true);
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    model.matrixWorld.decompose(P, Q, S);
    const b = addBody(new CANNON.Sphere(0.3 * S.x), Math.max(1, 30 * S.x ** 3), P, Q);
    b.velocity.set(velocity.x, velocity.y, velocity.z);
    b.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    dolls.set(id, { bodies: [b], constraints: [], statics: [], buoy, hidden: [], extra: [],
      sync() { model.position.copy(b.position); model.quaternion.copy(b.quaternion); } });
  }

  function step(dt) {
    if (!dolls.size || !(dt > 0)) return;
    world.step(RAG.step, Math.min(dt, 2), Math.ceil(2 / RAG.step));
    for (const d of dolls.values()) d.sync();
  }
  function clearAll() {
    for (const d of dolls.values()) {
      d.bodies.forEach((b) => world.removeBody(b));
      d.statics.forEach((b) => world.removeBody(b));
      d.constraints.forEach((c) => world.removeConstraint(c));
      d.extra.forEach((o) => { o.parent?.remove(o); o.geometry?.dispose?.(); });
      d.hidden.forEach((o) => { o.visible = true; });
    }
    dolls.clear();
  }
  return { spawnHuman, spawnRig, spawnSpine, spawnRigid, step, clearAll, has: (id) => dolls.has(id), get count() { return dolls.size; }, debug: { dolls, world } };
}
