// Simple mode: for anyone. Pick a bomb, where it goes off and what is in the sea, press
// Detonate, and watch it as a short film with captions; then see what happened to each
// animal or boat in plain words. Every number still comes from the same simulator; this
// file only chooses the camera, the playback speed and the wording.

import { esc } from "./ui.js";
import { icon, drawIcon } from "./icons.js";
import { iconOf } from "./species.js";
import { cloudTopM } from "./realistic.js";

const LEVELS = ["none", "possible", "likely", "severe", "lethal"];
const LEVEL_COLORS = { none: "#6fbf73", possible: "#e6cf5a", likely: "#f0a23c", severe: "#e2552c", lethal: "#a51818" };

export const BOMBS = [
  { key: "small", label: "Small", sub: "1 kiloton", kt: 1, size: 1 },
  { key: "hiroshima", label: "Hiroshima-size", sub: "15 kilotons", kt: 15, size: 2 },
  { key: "city", label: "City-buster", sub: "1 megaton", kt: 1000, size: 3 },
  { key: "bravo", label: "Castle Bravo-size", sub: "15 megatons", kt: 15000, size: 4 },
  { key: "tsar", label: "Tsar Bomba-size", sub: "50 megatons, the largest ever tested", kt: 50000, size: 5 },
];
export const WHERE = [
  { key: "sky", label: "High in the sky", sub: "an air burst", icon: "cloud" },
  { key: "surface", label: "On the water", sub: "touching the sea", icon: "wave" },
  { key: "under", label: "Underwater", sub: "just below the surface", icon: "bubbles" },
];
// what to put in the sea: [species, distance as a multiple of the scale D, depth (m, negative)]
export const SEAS = [
  { key: "fish", label: "A few fish", icon: "fish", items: [["sardine", 0.6, -8], ["cod", 1.2, -30], ["tuna", 2.4, -20], ["salmon", 4.5, -10]] },
  { key: "big", label: "Dolphins and whales", icon: "dolphin", items: [["dolphin", 0.8, -10], ["shark", 1.4, -15], ["humpback", 2.2, -20], ["orca", 4, -10]] },
  { key: "boats", label: "Boats and ships", icon: "ship", items: [["boat", 0.9, 2], ["fishingboat", 1.8, 2], ["destroyer", 3.5, 2]] },
  { key: "fill", label: "Fill the sea", icon: "globe", items: [["cod", 0.7, -30], ["diver", 1.0, -10], ["dolphin", 1.3, -10], ["fishingboat", 1.8, 2],
    ["shark", 2.4, -15], ["gull", 2.8, 30], ["humpback", 3.2, -20], ["destroyer", 4.5, 2]] },
];

// plain-language verdicts
export const VERDICT = { none: "Unharmed", possible: "Probably fine", likely: "Injured", severe: "Badly injured", lethal: "Would not survive" };
const SHIP_VERDICT = { none: "Undamaged", possible: "Lightly damaged", likely: "Disabled", severe: "Wrecked or sunk", lethal: "Wrecked or sunk" };
export function reason(e, kind) {
  const n = e.name, l = e.level;
  if (n.startsWith("ship damage")) return { possible: "the shock damaged its radar and electrics", likely: "the shock wrecked its engines", severe: "the blast tore it apart" }[l] || "";
  if (n.includes("swim bladder")) return "the pressure wave burst its swim bladder (the air sac fish float with)";
  const mild = l === "possible";   // "possible" = at the threshold where injuries begin
  if (n.includes("lung")) return mild ? "the pressure wave may have slightly hurt its lungs" : "the pressure wave hurt its lungs";
  if (n.includes("gut")) return mild ? "the pressure wave may have slightly hurt its gut" : "the pressure wave hurt its gut";
  if (n.startsWith("hearing")) return l === "likely" ? "the bang permanently damaged its hearing" : "the bang left it temporarily deaf";
  if (n.includes("peak pressure")) return mild ? "the pressure wave may have caused small injuries inside its body"
    : kind === "diver" ? "the pressure wave crushed into the lungs and gut" : "the pressure wave crushed its insides";
  if (n.includes("impulse")) return mild ? "the pressure wave may have slightly hurt the lungs and gut" : "the pressure wave hit the lungs and gut";
  if (n.includes("bird")) return { possible: "the blast may have bruised it", likely: "the blast injured it", lethal: "the blast killed it" }[l] || "";
  if (n.includes("standing in the open")) return { possible: "the blast burst eardrums", likely: "the blast hurt the lungs", severe: "the blast caused deadly lung damage", lethal: "the blast was deadly" }[l] || "";
  if (n.includes("burns")) return l === "severe" ? "the heat flash caused bad burns" : "the heat flash burned the skin";
  if (n.includes("flash blindness")) return l === "severe" ? "the flash burned a blind spot into the eyes" : "the flash blinded them for a while";
  if (n.includes("radiation")) return { possible: "a dose of radiation that could make them sick", likely: "radiation sickness", severe: "severe radiation sickness", lethal: "a deadly dose of radiation" }[l] || "";
  return "";
}

// short facts shown while the countdown runs (each from the sources used in the simulator, or well-documented history)
/** A height compared with Mount Everest (8,849 m), in words: "about two-thirds as high as Mount Everest". */
function everest(m) {
  const r = m / 8849;
  if (r >= 1.05) return `${r.toFixed(1)} times as high as Mount Everest`;
  if (r >= 0.95) return "about as high as Mount Everest";
  const parts = [[0.25, "a quarter"], [1 / 3, "a third"], [0.5, "half"], [2 / 3, "two-thirds"], [0.75, "three-quarters"], [0.9, "nine-tenths"]];
  const [, w] = parts.reduce((b, p) => (Math.abs(p[0] - r) < Math.abs(b[0] - r) ? p : b));
  return `about ${w} as high as Mount Everest`;
}
const COLUMN_MAX_KT = 100;   // the BAKER-scaled column height is only quoted up to here (about 3x the largest underwater test)
export const FACTS = [
  "Sound travels about four times faster in water than in air: about 1,500 m/s against 340 m/s.",
  "The 1946 BAKER test threw up a column of about a million tons of water, 2,000 ft wide and 6,000 ft high (Glasstone & Dolan).",
  "About a third of an air burst's energy comes out as heat and light (Glasstone & Dolan sec. 7.04).",
  "Fish with a swim bladder, the air-filled sac they float with, are hurt by blasts far more easily than fish without one, like mackerel and sharks.",
  "The largest bomb ever tested, Tsar Bomba (1961), released about 50 megatons: over 3,000 times the Hiroshima bomb.",
  "Castle Bravo (1954) came out at 15 megatons, about two and a half times what its designers expected.",
  "Underwater, the gas bubble of a nuclear blast swells, collapses and bounces back two or three times while it rises.",
  "At night the flash can blind people from much farther away, because our pupils are wide open in the dark.",
  "The cloud from a 1 megaton burst climbs about 20 km: more than twice as high as Mount Everest.",
  "Waves from a burst at sea travel as a group; the biggest wave arrives after the first ones.",
];

const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${+(m / 1000).toPrecision(2)} km`);
const fmtT = (t) => (t < 1e-3 ? `${+(t * 1e6).toPrecision(2)} µs` : t < 1 ? `${+(t * 1e3).toPrecision(2)} ms` : t < 60 ? `${+t.toPrecision(2)} s` : `${+(t / 60).toPrecision(2)} min`);

export function initSimple(ctx) {
  // ctx: { timeline, realistic, sound, state, getResults, worstSoFar, setup({ kt, z_m, items }), toExpert, setCam }
  const main = document.querySelector("main");
  const el = document.createElement("div");
  el.id = "simple";
  el.innerHTML = `
    <div class="spStart">
      <div class="spHero">
        <div class="spKicker">An interactive simulation</div>
        <h1>What if a nuke exploded underwater</h1>
        <p>Or right on the waves, or high above them. Pick a bomb and a spot, then watch what the science says happens to everything in and on the water.</p>
      </div>
      <div class="spPanel">
      <div class="spStep"><div class="spNum">1</div><div class="spBody"><h3>Pick a bomb</h3><div class="spCards" data-group="bomb">
        ${BOMBS.map((b) => `<button class="spCard" data-key="${b.key}"><span class="spBoom s${b.size}"></span><b>${b.label}</b><small>${b.sub}</small></button>`).join("")}
      </div></div></div>
      <div class="spStep"><div class="spNum">2</div><div class="spBody"><h3>Where does it go off?</h3><div class="spCards" data-group="where">
        ${WHERE.map((w) => `<button class="spCard" data-key="${w.key}"><span class="spIcon">${icon(w.icon)}</span><b>${w.label}</b><small>${w.sub}</small></button>`).join("")}
      </div></div></div>
      <div class="spStep"><div class="spNum">3</div><div class="spBody"><h3>What's in the sea?</h3><div class="spCards" data-group="sea">
        ${SEAS.map((s) => `<button class="spCard" data-key="${s.key}"><span class="spIcon">${icon(s.icon)}</span><b>${s.label}</b></button>`).join("")}
      </div></div></div>
      <div class="spActions"><button class="spGo">${icon("burst")} Detonate</button><button class="spRandom" title="Pick everything at random">${icon("dice")} Surprise me</button></div>
      </div>
      <div class="spMore"><button class="spDiveBtn">${icon("wave")} Dive into the deep</button><span>·</span><button class="spAboutBtn">How does this work?</button><span>·</span><button class="spPrivacyBtn">Privacy</button></div>
      <p class="spNote">Every number comes from published science (Glasstone &amp; Dolan, the U.S. Navy and others).
        Distances and sizes are to scale; the bursts are hypothetical.
        The explosion has a bright flash: you can soften it in Settings (${icon("gear")}).</p>
    </div>
    <div class="spCount" hidden><div class="spCountNum"></div><div class="spFact"></div></div>
    <div class="spCaption" hidden></div>
    <div class="spBar" hidden>
      <button class="spReplay" title="Watch it again">${icon("replay")} Replay</button>
      <button class="spPause" title="Pause / continue (Space)">${icon("pause")} Pause</button>
      <span class="spSpeed" title="How fast the film plays"><button data-sp="0.6">Slower</button><button data-sp="1" class="on">Normal</button><button data-sp="1.6">Faster</button></span>
      <button class="spSkip" title="Jump to the results">Skip to results ${icon("skip")}</button>
      <button class="spNew" title="Choose a different bomb or sea">${icon("edit")} Change setup</button>
    </div>
    <div class="spLook" hidden></div>
    <div class="spResults" hidden><div class="spResHead"><h2>What happened</h2><button class="spResClose" title="Hide">✕</button></div><div class="spResBody"></div>
      <div class="spResFoot"><button class="spShare">${icon("share")} Share</button><button class="spReplay2">${icon("replay")} Replay</button><button class="spNew2">${icon("edit")} Try something else</button><button class="spExpert">${icon("chart")} See all the numbers</button></div></div>`;
  main.appendChild(el);
  const q = (s) => el.querySelector(s);
  const choice = { bomb: "hiroshima", where: "under", sea: "fill" };   // underwater first: it is the site's question
  el.querySelectorAll(".spCards").forEach((box) => {
    const mark = () => box.querySelectorAll(".spCard").forEach((b) => (b.classList.toggle("on", b.dataset.key === choice[box.dataset.group]), b.setAttribute("aria-pressed", b.dataset.key === choice[box.dataset.group])));
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".spCard"); if (!b) return;
      choice[box.dataset.group] = b.dataset.key; mark();
    });
    mark();
  });

  // ---------------------------------------------------------------- the film
  let film = null;        // { simT, lastSet, shots, captions, startedAt, ... }
  let showing = "start";  // start | count | film | results

  function show(what) {
    showing = what;
    q(".spStart").hidden = what !== "start";
    q(".spCount").hidden = what !== "count";
    q(".spCaption").hidden = what !== "film";
    q(".spBar").hidden = !(what === "film" || what === "results");
    q(".spSkip").hidden = what !== "film";
    q(".spPause").hidden = q(".spSpeed").hidden = what !== "film";
    q(".spLook").hidden = !(what === "film" || what === "results");
    if (what === "film" || what === "results") renderLook();
    q(".spResults").hidden = what !== "results";
    document.body.classList.toggle("spOverlay", what === "start" || what === "count");
    document.body.classList.toggle("spFilm", what === "film");
    ctx.onShow?.(what);
  }

  function setupScene() {
    const b = BOMBS.find((x) => x.key === choice.bomb), w = choice.where, s = SEAS.find((x) => x.key === choice.sea);
    const k = Math.cbrt(b.kt / 15);
    const z_m = w === "sky" ? Math.round(580 * k) : w === "surface" ? 0 : -Math.round(27 * Math.cbrt(b.kt / 23));
    const D = 1100 * k;   // distance scale: things at 0.6-5 D show the whole range from "would not survive" to "unharmed"
    ctx.setup({ kt: b.kt, z_m, items: s.items.map(([key, f, z]) => ({ key, x: Math.round(f * D), z })) });
  }

  function detonate() {
    ctx.sound.unlock();
    const before = ctx.timeline.getData();
    setupScene();
    ctx.timeline.pause(); ctx.timeline.setTime(0);
    show("count");
    q(".spFact").innerHTML = icon("bulb") + " " + esc(FACTS[Math.floor(Math.random() * FACTS.length)]);
    let n = 3;
    const step = () => {
      q(".spCountNum").textContent = n || "";
      if (n > 0) { ctx.sound.tick(n === 1); n--; setTimeout(step, 800); return; }
      // wait for the simulator's timeline of this scenario (it is computed in the background)
      let t0 = performance.now(), told = false;
      const wait = () => {
        // static website, first visit: Python and the physics are still downloading (a few MB, once)
        const ps = ctx.physicsState?.();
        if (ps && ps.local && !ps.ready && !ps.error) {
          if (!told) { told = true; q(".spCountNum").innerHTML = icon("hourglass"); q(".spFact").textContent = "Getting the physics ready… (only on your first visit: it runs right here in your browser)"; }
          t0 = performance.now();   // the clock for "no answer" starts once it is ready
          setTimeout(wait, 150);
          return;
        }
        if (ps?.error) { show("start"); ctx.toast(`The explosion could not be worked out: ${ps.error}. Check your internet connection and reload the page.`, { kind: "err", ms: 12000 }); return; }
        const d = ctx.timeline.getData(), err = ctx.timeline.getError(), waited = performance.now() - t0;
        if ((d && d !== before) || (waited > 400 && ctx.timeline.upToDate())) return startFilm(d);   // (same scenario as last time: nothing new to wait for)
        if ((err && waited > 1500) || waited > 15000) {   // it failed (or never came): say so instead of freezing
          show("start");
          ctx.toast(`The explosion could not be worked out: ${err || "the server did not answer in time"}`, { kind: "err", ms: 12000 });
          return;
        }
        setTimeout(wait, 100);
      };
      wait();
    };
    step();
  }

  // ---- the film is a list of "beats": each has a moment in the event (sim time), a caption about it and
  //      a camera shot that shows exactly that. Playback glides from one beat to the next in a few
  //      seconds of real time (slow motion early on, fast later), so every caption gets time on screen.
  const nameOf = (r) => `the ${r.label.replace(/ \d+$/, "").toLowerCase().replace(/\batlantic\b/, "Atlantic")}`;
  const listNames = (rs) => rs.length === 1 ? nameOf(rs[0]) : `${rs.slice(0, -1).map(nameOf).join(", ")} and ${nameOf(rs[rs.length - 1])}`;

  function startFilm(data) {
    if (!data) { show("start"); return; }
    const sc = ctx.scenario(), bz = sc.burst.z_m, y = sc.burst.yield_kt;
    const fb = data.fireball, fbEnd = fb ? fb.end_s : 1;
    const recById = Object.fromEntries(ctx.state.receivers.map((r) => [r.id, r]));
    const tl = (data.receivers || []).filter((x) => recById[x.id] && !x.error);
    const beats = [];
    const PACE = 1.4;   // seconds on screen per beat are multiplied by this (and by the speed setting)
    const beat = (t, cam, text, dur = 3.2, real = null, rate = 1) => beats.push({ t, cam, text, dur: dur * PACE, real, rate });
    // an impact far away happens late, when the film is skimming fast through time; play the moments
    // around it as they happen (one second per second) so it moves at the same pace as a close one
    const REAL_FROM = 1.5;   // s: impacts later than this get a stretch at real speed

    // 1. the burst itself
    if (bz >= 0) {
      beat(1e-4, { name: "close" }, "Detonation. In a millionth of a second the fireball is as hot as the centre of the Sun.", 2.6);
      if (fb) {
        beat(Math.max(fb.t_s?.[0] ?? 1e-3, 1.5e-3), { name: "close" }, "A flash brighter than the Sun: about a third of the energy leaves as heat and light.", 3);
        const D = 2 * fb.max_radius_m;
        beat(Math.min(Math.max(fbEnd * 0.15, 0.05), 2), { name: "close" },
          `The fireball grows to ${fmtKm(D)} across: as wide as ${Math.max(1, Math.round(D / 105))} football pitches end to end.`, 3.4);
      }
    } else {
      const firstWet = tl.filter((x) => recById[x.id].z_m < 0 && x.pulse).sort((a, b) => a.pulse.arrival_s - b.pulse.arrival_s)[0];
      beat(1e-4, firstWet ? { name: "focus", id: firstWet.id } : { name: "side" }, "Detonation under the sea. A ball of hot gas forms and a shock wave races out through the water.", 2.8);
      if (firstWet) beat(firstWet.pulse.arrival_s * 0.7, { name: "focus", id: firstWet.id },
        `The shock travels at about 1,500 m/s, more than four times faster than sound in air. Here it comes: ${nameOf(recById[firstWet.id])}, ${fmtKm(Math.hypot(recById[firstWet.id].x_m, recById[firstWet.id].y_m || 0))} away.`, 3.6);
      beat(Math.max((firstWet?.pulse.arrival_s ?? 0.2) * 2, 0.8), { name: "side" }, "Above, a dome of spray bursts out of the sea, then a huge column of water shoots up.", 4);
    }

    // 2. the blast (or the pressure wave in the water) reaching each thing, grouped when they come close together
    const shown = new Set(beats.filter((b) => b.cam.id).map((b) => b.cam.id));   // already had its own beat
    const hits = tl.filter((x) => x.pulse && !shown.has(x.id)).sort((a, b) => a.pulse.arrival_s - b.pulse.arrival_s);
    const groups = [];
    for (const h of hits) {
      const g = groups[groups.length - 1];
      if (g && h.pulse.arrival_s < g.t * 1.6) g.items.push(h); else groups.push({ t: h.pulse.arrival_s, items: [h] });
    }
    const already = new Set(beats.filter((b) => b.cam.id).map((b) => b.cam.id));
    // How badly the pressure pulse itself hurts something (burns, radiation and the flash are not what
    // this shot is about). Only things it visibly hurts ("likely" or worse: they jolt, roll or go limp) get a
    // shot, so the camera is never left on an animal where nothing happens.
    const LVN = ["none", "possible", "likely", "severe", "lethal"];
    const hurt = (x) => (x.effects || []).filter((e) => !/burn|radiation|flash|blind/i.test(e.name)).reduce((m, e) => Math.max(m, LVN.indexOf(e.level)), 0);
    const isBoat = (x) => ["person", "ship"].includes(recById[x.id].kind) ? 1 : 0;
    const shots = [];
    for (const g of groups) {
      // in each group, the one hit hardest (a boat first when it is a tie), and the camera times its shot by
      // that one's own arrival, not the group's first
      const ranked = [...g.items].filter((x) => !already.has(x.id)).sort((p, q) => hurt(q) - hurt(p) || isBoat(q) - isBoat(p) || p.pulse.arrival_s - q.pulse.arrival_s);
      if (ranked.length) shots.push({ items: g.items, star: ranked[0], lvl: hurt(ranked[0]), ts: ranked[0].pulse.arrival_s });
    }
    let pick = shots.filter((x) => x.lvl >= 2);
    const lastShot = shots[shots.length - 1];
    if (lastShot && lastShot.lvl < 2) pick.push({ ...lastShot, fade: true });   // one shot of where it fades out, at the end
    pick = pick.sort((p, q) => p.ts - q.ts).slice(0, 5);
    for (const [i, sh] of pick.entries()) {
      const star = recById[sh.star.id], ts = sh.ts;
      const items = [star, ...sh.items.filter((x) => x.id !== star.id).map((x) => recById[x.id])];   // the one on camera first
      already.add(star.id);
      const inAir = sh.star.pulse.medium === "air";
      const what = inAir ? "The blast wave" : bz >= 0 ? "The pressure wave, pushed down into the sea," : "The shock wave";
      const dist = fmtKm(Math.hypot(star.x_m, star.y_m || 0));
      const text = sh.fade
        ? `${fmtT(ts)}: ${what} reaches ${nameOf(star)}, ${dist} away. ${sh.lvl === 1 ? "By now it is much weaker: at most a slight injury." : "By now it is too weak to hurt it."}`
        : `${fmtT(ts)}: ${what} reaches ${listNames(items)} (${dist} away).`;
      const big = star.kind === "person" || star.kind === "ship";
      if (ts > REAL_FROM) {
        // as it happens, from a moment before the hit until the next shot needs the camera (but at least 1 s after)
        const next = pick[i + 1];
        let end = ts + (big ? 7 : 4);
        if (next && next.ts > REAL_FROM) end = Math.min(end, Math.max(ts + 1, Math.max(next.ts - 2, next.ts * 0.72) - 0.05));
        const t0 = Math.max(ts - 2, ts * 0.72, i > 0 ? Math.min(pick[i - 1].ts + 1, ts - 0.3) : 0);
        beat(t0, { name: "focus", id: star.id }, text, 2.4, [t0, end]);
      } else beat(ts * 0.72, { name: "focus", id: star.id }, text, 3.6);
    }

    // 3. the cloud (or column)
    if (bz >= 0) {
      const top = cloudTopM(y);
      beat(Math.max(40, (beats[beats.length - 1]?.t ?? 0) * 1.5), { name: "side" }, "The fireball rises and cools; the mushroom cloud climbs, sucking up air, spray and debris.", 6);
      beat(270, { name: "far" }, `The cloud stops rising about ${fmtKm(top)} up: ${everest(top)}.`, 6);
    } else {
      beat(Math.max(60, (beats[beats.length - 1]?.t ?? 0) * 1.5), { name: "far" }, "The column falls back and a ring of mist, the base surge, rolls out across the sea.", 4.5);
    }

    // 4. waves reaching a boat (if they are big enough to matter)
    const boatTl = tl.find((x) => ["person", "ship"].includes(recById[x.id].kind) && x.waves && x.waves.height_high_m > 0.5);
    if (boatTl) {
      const tw = boatTl.waves.max_wave_arrival_s;
      // These waves are a long swell (a crest every ~10-40 s), so at true speed hardly one passes while you watch.
      // Play them sped up so a crest goes by about every 3 s, and say so.
      const T = data.waves?.period_s || 10, k = Math.max(1, Math.round(T / 3));
      const text = `${fmtT(tw)}: waves up to ${Math.round(boatTl.waves.height_high_m)} m high reach ${nameOf(recById[boatTl.id])}.`
        + (k > 1 ? ` (Shown ${k}× faster: a crest comes every ${Math.round(T)} seconds.)` : "");
      if (tw > REAL_FROM * 4) beat(Math.max(tw - 1.5 * T, tw * 0.6), { name: "focus", id: boatTl.id, low: true }, text, 2.4, [Math.max(tw - 1.5 * T, tw * 0.6), tw + 3 * T], k);
      else beat(tw * 0.8, { name: "focus", id: boatTl.id, low: true }, text, 4);
    }

    beats.sort((a, b) => a.t - b.t);
    for (let k = 1; k < beats.length; k++) if (beats[k].t <= beats[k - 1].t) beats[k].t = beats[k - 1].t * 1.05;   // strictly later
    for (let k = 0; k < beats.length - 1; k++) {   // a real-speed stretch must end before the next beat starts
      const b = beats[k];
      if (b.real) { b.real[0] = b.t; b.real[1] = Math.min(b.real[1], beats[k + 1].t / 1.02); if (b.real[1] <= b.real[0]) b.real = null; }
    }
    const end = Math.max(bz >= 0 ? 600 : 300, beats[beats.length - 1].t * 1.3);
    film = { simT: beats[0].t, lastSet: null, beats, k: -1, elapsed: 0, end, camLocked: false, paused: false };
    q(".spPause").innerHTML = icon("pause") + " Pause";
    show("film");
    // the lead-in: the bomb falling (above water) or hanging on its cable (underwater), then the flash
    const depth = Math.round(-bz);
    film.pre = { elapsed: 0, dur: bz >= 0 ? 4.2 : 3.6 };
    ctx.drift(false);
    ctx.preRoll({ f: 0, follow: true });
    ctx.timeline.setTime(0); film.lastSet = ctx.timeline.getTime();
    setCaption(bz > 50 ? "A bomb is falling toward the sea…" : bz >= 0 ? "A bomb is falling toward the sea surface…"
      : `${depth} m down, a bomb hangs on a cable under a small ship, as in the 1946 BAKER test…`, true);
    if (bz >= 0) ctx.sound.whistle(film.pre.dur);
    renderResults();
  }

  function setCaption(text, now = false) {
    const box = q(".spCaption");
    clearTimeout(film?.capTimer);
    box.classList.remove("in"); box.textContent = "";
    const put = () => { void box.offsetWidth; box.textContent = text; box.classList.add("in"); };
    if (now) put(); else film.capTimer = setTimeout(put, 700);
  }

  function goBeat(k) {
    film.k = k; film.elapsed = 0;
    const b = film.beats[k];
    b.from = b.t; b.live = !!b.real;   // a beat with a real-speed stretch plays that first, then glides on
    if (!film.camLocked) { ctx.setShot(b.cam, k === 0); ctx.drift(b.cam.name !== "focus"); }   // slow turn on wide shots only
    // the caption comes in as the camera arrives at its new shot (the move takes about a second)
    setCaption(b.text, k === 0 || film.camLocked);
  }

  function update(dt = 0.016) {
    if (showing !== "film" || !film) return;
    if (film.pre) {   // the lead-in before the detonation
      if (!film.paused) film.pre.elapsed += dt * speed;
      const f = Math.min(film.pre.elapsed / film.pre.dur, 1);
      ctx.preRoll({ f, follow: !film.camLocked });
      if (f >= 1) { film.pre = null; ctx.preRoll(null); goBeat(0); }
      return;
    }
    if (!film.paused) film.elapsed += dt * speed;
    // the user took over the timeline (dragged it or pressed play): stop directing
    if (film.lastSet != null && Math.abs(ctx.timeline.getTime() - film.lastSet) > 1e-6 * Math.max(1, film.lastSet)) { finish(); return; }
    const b = film.beats[film.k], next = film.beats[film.k + 1];
    const tNext = next ? next.t : film.end;
    let f = 0;
    if (b.live) {   // as it happens: one simulated second per second (times the speed setting)
      if (!film.paused) film.simT = Math.min(film.simT + dt * speed * (b.rate || 1), b.real[1]);
      if (film.simT >= b.real[1]) { b.live = false; b.from = b.real[1]; film.elapsed = 0; }
    } else {
      f = Math.min(film.elapsed / b.dur, 1);
      film.simT = b.from * Math.pow(tNext / b.from, f);    // glide in log time: slow motion early, fast later
    }
    ctx.timeline.setTime(film.simT); film.lastSet = ctx.timeline.getTime();
    if (f >= 1) {
      if (next) goBeat(film.k + 1);
      else { finish(); return; }
    }
    if (Math.random() < 0.1) renderResults();
  }

  function finish() { ctx.preRoll(null); if (film) film.pre = null; ctx.drift(false); show("results"); renderResults(); }

  // ---------------------------------------------------------------- results in plain words
  function renderResults() {
    const body = q(".spResBody");
    const res = ctx.getResults();
    const following = showing === "film";
    const cards = ctx.state.receivers.map((r) => {
      const a = res[r.id];
      if (!a || a.error) return "";
      const lvl = following ? (ctx.worstSoFar(r.id) ?? null) : a.worst;
      const isShip = r.kind === "ship";
      const hull = isShip ? a.effects.find((e) => e.name.startsWith("ship damage")) : null;
      const main = (hull && LEVELS.indexOf(hull.level) > 0) ? hull : [...a.effects].sort((x, y) => LEVELS.indexOf(y.level) - LEVELS.indexOf(x.level))[0];
      const lv = lvl || "none";
      let verdict = lvl === null ? "Not reached yet" : VERDICT[lv];
      let why = main && LEVELS.indexOf(main.level) > 0 ? reason(main, r.kind) : "too far away for anything serious to reach it";
      if (isShip && lvl !== null) {   // the ship and its crew are two different stories
        const hullL = hull ? hull.level : "none";
        const crew = a.effects.filter((e) => e.name.startsWith("crew on deck")).sort((x, y) => LEVELS.indexOf(y.level) - LEVELS.indexOf(x.level));
        const cw = crew[0] && LEVELS.indexOf(crew[0].level) > 0 ? crew[0] : null;
        verdict = `Ship: ${SHIP_VERDICT[hullL].toLowerCase()} · crew on deck: ${VERDICT[cw ? cw.level : "none"].toLowerCase()}`;
        why = (LEVELS.indexOf(hullL) > 0 ? reason(hull, r.kind) : "the ship itself was not damaged")
          + (cw ? `; on deck, ${reason(cw, "person")}` : "") + (a.effects.some((e) => e.name.startsWith("crew below deck")) ? "; the crew below deck were shielded by the hull" : "");
      }
      const dist = fmtKm(Math.hypot(r.x_m, r.y_m || 0));
      const col = lvl === null ? "#9aa8b6" : LEVEL_COLORS[lv];
      const details = a.effects.map((e) => `<li><span class="level lv-${e.level}">${e.level}</span> ${esc(e.name)}: ${esc(e.value)}</li>`).join("");
      return `<div class="spRes" style="--c:${col}"><div class="spResTop"><span class="spEmoji">${icon(iconOf(r))}</span>
        <div><b>${esc(r.label.replace(/ \d+$/, ""))}</b> <small>${dist} away${r.z_m < 0 ? `, ${Math.round(-r.z_m)} m deep` : r.kind === "bird" ? `, ${Math.round(r.z_m)} m up` : ""}</small>
        <div class="spVerdict">${verdict}</div></div><button class="spView" data-id="${esc(r.id)}" title="Point the camera at it">${icon("eye")} View</button></div>
        ${lvl === null ? "" : `<div class="spWhy">${esc(why.charAt(0).toUpperCase() + why.slice(1))}.</div>
        <details><summary>Why? The numbers</summary><ul>${details}</ul></details>`}</div>`;
    }).join("");
    // how far the danger reached, in plain words
    const zs = ctx.getZones?.();
    let zoneHtml = "";
    if (zs && showing === "results") {
      const by = Object.fromEntries(zs.map((z) => [z.key, z.farthest_m]));
      const line = (ic, what, r) => (r ? `<div>${icon(ic)} ${what} out to <b>${fmtKm(r)}</b></div>` : "");
      zoneHtml = `<div class="spZones"><h3>How far the danger reached</h3>` +
        line("fish", "Fish killed", by.fish_bladder?.lethal) + line("dolphin", "Dolphins badly hurt", by.dolphin?.severe) +
        line("whale", "Whales badly hurt", by.whale?.severe) + line("diver", "Divers killed", by.diver?.lethal) +
        line("person", "People on deck killed", by.person?.lethal) + line("injured", "People on deck injured", by.person?.likely) +
        line("ship", "Ships wrecked", by.destroyer?.severe) +
        `<label class="check"><input type="checkbox" class="spZoneToggle" ${ctx.zonesShown() ? "checked" : ""}> Draw these as circles on the sea</label></div>`;
    }
    body.innerHTML = zoneHtml + compareHtml() + (cards || `<p class="help">Working it out…</p>`);
    body.querySelector(".spZoneToggle")?.addEventListener("change", (e) => ctx.setZonesShown(e.target.checked));
    body.querySelectorAll(".spView").forEach((b) => b.addEventListener("click", () => lookAt(b.dataset.id)));
  }

  // ---------------------------------------------------------------- in real-world terms
  function compareLines() {
    const sc = ctx.scenario(), d = ctx.timeline.getData(), y = sc.burst.yield_kt, zs = ctx.getZones?.();
    const by = Object.fromEntries((zs || []).map((z) => [z.key, z.farthest_m]));
    const L = [];
    if (d?.fireball && sc.burst.z_m >= 0) {
      const D = 2 * d.fireball.max_radius_m;
      L.push(["fire", `The fireball was ${fmtKm(D)} across: wider than ${Math.max(1, Math.round(D / 105))} football pitches laid end to end.`]);
    }
    if (sc.burst.z_m >= 0) {
      const top = cloudTopM(y);
      // compare with whatever is just smaller than it, so it always reads "N times as high as ..."
      const cmp = top >= 11000 ? `${everest(top)}, and higher than airliners fly`
        : top >= 8849 ? `higher than Mount Everest (8.8 km)`
        : `${(top / 828).toFixed(top < 2000 ? 1 : 0)} times the height of the world's tallest building (828 m)`;
      L.push(["cloud", `The cloud rose about ${fmtKm(top)}: ${cmp}.`]);
    } else {
      // Only scale the BAKER column (20 kt, 1946) to bombs of a similar size: the largest underwater nuclear tests
      // were about 30 kt (BAKER, WIGWAM). Far beyond that, how high the water goes is simply not known.
      const k = Math.cbrt(y / 20), vent = (-sc.burst.z_m * 3.28084 / Math.cbrt(y)) < 35;
      if (y <= COLUMN_MAX_KT) L.push(["wave", `A column of water about ${fmtKm((vent ? 1830 : 270) * k)} high shot out of the sea (scaled from the 1946 BAKER test).`]);
      else L.push(["wave", `How high the water would be thrown is not known: no bomb this big has ever gone off underwater. The largest underwater tests were about 30 kilotons; at 1946's BAKER test the column of water was about 1.8 km high.`]);
    }
    const fish = by.fish_bladder?.lethal;
    if (fish) {
      const a = Math.PI * fish * fish / 1e6;
      L.push(["fish", `Fish were killed across ${a < 1 ? a.toFixed(2) : Math.round(a)} km² of sea${a > 6 ? `: about ${(a / 59).toFixed(a > 59 ? 0 : 1)} times the area of Manhattan` : ""}.`]);
    }
    const hurt = by.person?.likely;
    if (hurt) L.push(["person", `People out in the open were injured up to ${fmtKm(hurt)} away: ${hurt >= 2737
      ? `${(hurt / 2737).toFixed(1)} times the length of the Golden Gate Bridge` : `about ${Math.max(1, Math.round(hurt / 105))} football pitches end to end`}.`]);
    return L;
  }
  function compareHtml() {
    if (showing !== "results") return "";
    const L = compareLines();
    return L.length ? `<div class="spCompare"><h3>In real-world terms</h3>${L.map(([ic, l]) => `<div>${icon(ic)} ${esc(l)}</div>`).join("")}</div>` : "";
  }

  // ---------------------------------------------------------------- share: a picture + a link that sets up the same burst
  function shareLink() { return `${location.origin}${location.pathname}#play=${choice.bomb}.${choice.where}.${choice.sea}`; }
  async function share() {
    const b = BOMBS.find((x) => x.key === choice.bomb), w = WHERE.find((x) => x.key === choice.where);
    const shot = ctx.snapshot();
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630;
    const g = c.getContext("2d");
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = shot; });
    if (img.width) {   // cover the card with the picture
      const s = Math.max(1200 / img.width, 630 / img.height);
      g.drawImage(img, (1200 - img.width * s) / 2, (630 - img.height * s) / 2, img.width * s, img.height * s);
    } else { g.fillStyle = "#9cc7e0"; g.fillRect(0, 0, 1200, 630); }
    const grad = g.createLinearGradient(0, 260, 0, 630);
    grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(1, "rgba(255,255,255,0.95)");
    g.fillStyle = grad; g.fillRect(0, 0, 1200, 630);
    g.fillStyle = "#232846"; g.font = "800 46px -apple-system, Segoe UI, sans-serif";
    g.fillText(`${b.label} bomb, ${w.label.toLowerCase()}`, 48, 430);
    g.font = "600 26px -apple-system, Segoe UI, sans-serif";
    compareLines().slice(1, 4).forEach(([ic, l], i) => { drawIcon(g, ic, 62, 480 + i * 38, 26, "#232846"); g.fillText(l.length > 76 ? l.slice(0, 74) + "…" : l, 84, 480 + i * 38); });
    g.fillStyle = "#ff5a3a"; g.font = "700 22px -apple-system, Segoe UI, sans-serif";
    g.fillText("whatifanukeexplodedunderwater.com", 48, 602);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const file = new File([blob], "what-if-a-nuke-exploded-underwater.png", { type: "image/png" });
    const text = `${b.label} bomb, ${w.label.toLowerCase()}: what happens to everything in the sea.`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "What if a nuke exploded underwater", text, url: shareLink() }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    ctx.download("what-if-a-nuke-exploded-underwater.png", blob);
    try { await navigator.clipboard.writeText(shareLink()); ctx.toast("Picture saved, and a link to this setup copied: paste it anywhere.", { kind: "ok", ms: 6000 }); }
    catch (_) { ctx.toast(`Picture saved. Link to this setup: ${shareLink()}`, { kind: "ok", ms: 9000 }); }
  }

  // ---------------------------------------------------------------- looking at one thing
  let speed = 1;
  function lookAt(id) {
    if (film) film.camLocked = true;
    ctx.drift(false);
    if (id === "_burst") ctx.setShot({ name: "side" });
    else if (id === "_school") ctx.setShot({ name: "school", i: 2 });
    else ctx.setShot({ name: "focus", id });
    renderLook(id);
  }
  function autoCamera() {
    if (!film) return;
    film.camLocked = false;
    const b = film.beats[film.k];
    if (b) { ctx.setShot(b.cam); ctx.drift(b.cam.name !== "focus"); }
    renderLook();
  }
  function renderLook(active = null) {
    const box = q(".spLook");
    const chips = ctx.state.receivers.map((r) => `<button data-id="${esc(r.id)}" class="${active === r.id ? "on" : ""}" title="Look at the ${esc(r.label.replace(/ \d+$/, "").toLowerCase())}">${icon(iconOf(r))} ${esc(r.label.replace(/ \d+$/, ""))}</button>`).join("");
    box.innerHTML = `<span class="lbl">Look at</span>` +
      (showing === "film" ? `<button data-id="_auto" class="${film && !film.camLocked ? "on" : ""}" title="Let the film choose the shots">${icon("film")} Auto</button>` : "") +
      `<button data-id="_burst" class="${active === "_burst" ? "on" : ""}">${icon("burst")} The explosion</button>` +
      `<button data-id="_school" class="${active === "_school" ? "on" : ""}" title="A shoal of fish near the edge of the killing zone">${icon("school")} School of fish</button>` + chips;
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => (b.dataset.id === "_auto" ? autoCamera() : lookAt(b.dataset.id))));
  }

  // ---------------------------------------------------------------- buttons
  q(".spPause").addEventListener("click", () => {
    if (!film) return;
    film.paused = !film.paused;
    q(".spPause").innerHTML = film.paused ? icon("play") + " Continue" : icon("pause") + " Pause";
  });
  el.querySelectorAll(".spSpeed button").forEach((b) => b.addEventListener("click", () => {
    speed = +b.dataset.sp;
    el.querySelectorAll(".spSpeed button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  q(".spGo").addEventListener("click", detonate);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)].key;
  q(".spRandom").addEventListener("click", () => {
    choice.bomb = pick(BOMBS); choice.where = pick(WHERE); choice.sea = pick(SEAS);
    el.querySelectorAll(".spCards").forEach((box) => box.querySelectorAll(".spCard").forEach((b) => (b.classList.toggle("on", b.dataset.key === choice[box.dataset.group]), b.setAttribute("aria-pressed", b.dataset.key === choice[box.dataset.group]))));
    detonate();
  });
  q(".spDiveBtn").addEventListener("click", () => ctx.openDive?.(choice));
  q(".spAboutBtn").addEventListener("click", () => ctx.openAbout?.());
  q(".spPrivacyBtn").addEventListener("click", () => ctx.openPrivacy?.());
  const replay = () => { ctx.sound.unlock(); ctx.timeline.pause(); ctx.timeline.setTime(0); film ? startFilm(ctx.timeline.getData()) : detonate(); };
  q(".spReplay").addEventListener("click", replay);
  q(".spReplay2").addEventListener("click", replay);
  q(".spSkip").addEventListener("click", () => { ctx.preRoll(null); if (film) film.pre = null; ctx.timeline.setTime(film?.end ?? 600); finish(); });
  const again = () => { film = null; ctx.preRoll(null); ctx.drift(false); ctx.timeline.pause(); show("start"); };
  q(".spNew").addEventListener("click", again);
  q(".spNew2").addEventListener("click", again);
  q(".spResClose").addEventListener("click", () => { q(".spResults").hidden = true; });
  q(".spExpert").addEventListener("click", () => ctx.toExpert());
  q(".spShare").addEventListener("click", () => share());

  return {
    update,
    show,
    lockCamera() { if (film) { film.camLocked = true; ctx.drift(false); renderLook(); } },
    togglePause() { if (showing === "film") q(".spPause").click(); },
    refresh: renderResults,
    get state() { return showing; },
    get choice() { return choice; },
    /** Open with a shared setup ("#play=bomb.where.sea"): choices filled in, ready to detonate. */
    preset(bomb, where, sea) {
      if (BOMBS.some((x) => x.key === bomb)) choice.bomb = bomb;
      if (WHERE.some((x) => x.key === where)) choice.where = where;
      if (SEAS.some((x) => x.key === sea)) choice.sea = sea;
      el.querySelectorAll(".spCards").forEach((box) => box.querySelectorAll(".spCard").forEach((b) => (b.classList.toggle("on", b.dataset.key === choice[box.dataset.group]), b.setAttribute("aria-pressed", b.dataset.key === choice[box.dataset.group]))));
      q(".spGo").classList.add("pulse");
    },
  };
}
