// Simple mode: for anyone. Pick a bomb, where it goes off and what is in the sea, press
// Detonate, and watch it as a short film with captions; then see what happened to each
// animal or boat in plain words. Every number still comes from the same simulator; this
// file only chooses the camera, the playback speed and the wording.

import { esc } from "./ui.js";
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
  { key: "sky", label: "High in the sky", sub: "an air burst", icon: "☁️" },
  { key: "surface", label: "On the water", sub: "touching the sea", icon: "🌊" },
  { key: "under", label: "Underwater", sub: "just below the surface", icon: "🫧" },
];
// what to put in the sea: [species, distance as a multiple of the scale D, depth (m, negative)]
export const SEAS = [
  { key: "fish", label: "A few fish", icon: "🐟", items: [["sardine", 0.6, -8], ["cod", 1.2, -30], ["tuna", 2.4, -20], ["salmon", 4.5, -10]] },
  { key: "big", label: "Dolphins and whales", icon: "🐬", items: [["dolphin", 0.8, -10], ["shark", 1.4, -15], ["humpback", 2.2, -20], ["orca", 4, -10]] },
  { key: "boats", label: "Boats and ships", icon: "🚢", items: [["boat", 0.9, 2], ["fishingboat", 1.8, 2], ["destroyer", 3.5, 2]] },
  { key: "fill", label: "Fill the sea", icon: "🌐", items: [["cod", 0.7, -30], ["diver", 1.0, -10], ["dolphin", 1.3, -10], ["fishingboat", 1.8, 2],
    ["shark", 2.4, -15], ["humpback", 3.2, -20], ["destroyer", 4.5, 2]] },
];

// plain-language verdicts
const VERDICT = { none: "Unharmed", possible: "Probably fine", likely: "Injured", severe: "Badly injured", lethal: "Would not survive" };
const SHIP_VERDICT = { none: "Undamaged", possible: "Lightly damaged", likely: "Disabled", severe: "Wrecked or sunk", lethal: "Wrecked or sunk" };
function reason(e, kind) {
  const n = e.name, l = e.level;
  if (n.startsWith("ship damage")) return { possible: "the shock damaged its radar and electrics", likely: "the shock wrecked its engines", severe: "the blast tore it apart" }[l] || "";
  if (n.includes("swim bladder")) return "the pressure wave burst its swim bladder (the air sac fish float with)";
  if (n.includes("lung")) return "the pressure wave hurt its lungs";
  if (n.includes("gut")) return "the pressure wave hurt its gut";
  if (n.startsWith("hearing")) return l === "likely" ? "the bang permanently damaged its hearing" : "the bang left it temporarily deaf";
  if (n.includes("peak pressure")) return kind === "diver" ? "the pressure wave crushed into the lungs and gut" : "the pressure wave crushed its insides";
  if (n.includes("impulse")) return "the pressure wave hit the lungs and gut";
  if (n.includes("standing in the open")) return { possible: "the blast burst eardrums", likely: "the blast hurt the lungs", severe: "the blast caused deadly lung damage", lethal: "the blast was deadly" }[l] || "";
  if (n.includes("burns")) return l === "severe" ? "the heat flash caused bad burns" : "the heat flash burned the skin";
  if (n.includes("flash blindness")) return l === "severe" ? "the flash burned a blind spot into the eyes" : "the flash blinded them for a while";
  if (n.includes("radiation")) return { possible: "a dose of radiation that could make them sick", likely: "radiation sickness", severe: "severe radiation sickness", lethal: "a deadly dose of radiation" }[l] || "";
  return "";
}

const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${+(m / 1000).toPrecision(2)} km`);
const fmtT = (t) => (t < 1e-3 ? `${+(t * 1e6).toPrecision(2)} µs` : t < 1 ? `${+(t * 1e3).toPrecision(2)} ms` : t < 60 ? `${+t.toPrecision(2)} s` : `${+(t / 60).toPrecision(2)} min`);

export function initSimple(ctx) {
  // ctx: { timeline, realistic, sound, state, getResults, worstSoFar, setup({ kt, z_m, items }), toExpert, setCam }
  const main = document.querySelector("main");
  const el = document.createElement("div");
  el.id = "simple";
  el.innerHTML = `
    <div class="spStart">
      <h1>What happens when a nuclear bomb goes off over the sea?</h1>
      <div class="spStep"><div class="spNum">1</div><div class="spBody"><h3>Pick a bomb</h3><div class="spCards" data-group="bomb">
        ${BOMBS.map((b) => `<button class="spCard" data-key="${b.key}"><span class="spBoom s${b.size}"></span><b>${b.label}</b><small>${b.sub}</small></button>`).join("")}
      </div></div></div>
      <div class="spStep"><div class="spNum">2</div><div class="spBody"><h3>Where does it go off?</h3><div class="spCards" data-group="where">
        ${WHERE.map((w) => `<button class="spCard" data-key="${w.key}"><span class="spIcon">${w.icon}</span><b>${w.label}</b><small>${w.sub}</small></button>`).join("")}
      </div></div></div>
      <div class="spStep"><div class="spNum">3</div><div class="spBody"><h3>What's in the sea?</h3><div class="spCards" data-group="sea">
        ${SEAS.map((s) => `<button class="spCard" data-key="${s.key}"><span class="spIcon">${s.icon}</span><b>${s.label}</b></button>`).join("")}
      </div></div></div>
      <button class="spGo">💥 Detonate</button>
      <p class="spNote">Every number comes from published science (Glasstone &amp; Dolan, the U.S. Navy and others).
        The pictures are drawn to scale; the bursts are hypothetical.</p>
    </div>
    <div class="spCount" hidden></div>
    <div class="spCaption" hidden></div>
    <div class="spBar" hidden>
      <button class="spReplay" title="Watch it again">↺ Replay</button>
      <button class="spSkip" title="Jump to the results">Skip to results ⏭</button>
      <button class="spNew" title="Choose a different bomb or sea">✎ Change setup</button>
    </div>
    <div class="spResults" hidden><div class="spResHead"><h2>What happened</h2><button class="spResClose" title="Hide">✕</button></div><div class="spResBody"></div>
      <div class="spResFoot"><button class="spReplay2">↺ Replay</button><button class="spNew2">✎ Try something else</button><button class="spExpert">🔬 See all the numbers</button></div></div>`;
  main.appendChild(el);
  const q = (s) => el.querySelector(s);
  const choice = { bomb: "hiroshima", where: "sky", sea: "fill" };
  el.querySelectorAll(".spCards").forEach((box) => {
    const mark = () => box.querySelectorAll(".spCard").forEach((b) => b.classList.toggle("on", b.dataset.key === choice[box.dataset.group]));
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
    q(".spResults").hidden = what !== "results";
    document.body.classList.toggle("spOverlay", what === "start" || what === "count");
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
    let n = 3;
    const step = () => {
      q(".spCount").textContent = n || "";
      if (n > 0) { ctx.sound.tick(n === 1); n--; setTimeout(step, 800); return; }
      // wait for the simulator's timeline of this scenario (it is computed in the background)
      const t0 = performance.now();
      const wait = () => {
        const d = ctx.timeline.getData();
        if ((d && d !== before) || performance.now() - t0 > 8000) startFilm(d);
        else setTimeout(wait, 100);
      };
      wait();
    };
    step();
  }

  function startFilm(data) {
    if (!data) { show("start"); return; }
    const sc = ctx.scenario(), bz = sc.burst.z_m, y = sc.burst.yield_kt;
    const fb = data.fireball, fbEnd = fb ? fb.end_s : 1;
    const recs = data.receivers || [];
    const byLabel = Object.fromEntries(ctx.state.receivers.map((r) => [r.id, r]));
    const boat = recs.find((r) => ["person", "ship"].includes(byLabel[r.id]?.kind) && r.pulse);
    const tBoat = boat ? boat.pulse.arrival_s : null;
    const firstHit = Math.min(...recs.filter((r) => r.pulse).map((r) => r.pulse.arrival_s), 30);
    const tKey = Math.min(Math.max((tBoat ?? firstHit) + 4, fbEnd), fbEnd + 20);
    // camera shots (switch when the film time passes t)
    const shots = [];
    if (bz < 0) {
      shots.push({ t: 0, cam: ctx.state.receivers.some((r) => r.z_m < 0) ? "under" : "side" }, { t: 1.5, cam: "side" });
      if (tBoat != null) shots.push({ t: Math.max(tBoat - 0.6, 2), cam: "boat" }, { t: tBoat + 6, cam: "far" });
      else shots.push({ t: 25, cam: "far" });
    } else {
      shots.push({ t: 0, cam: "close" }, { t: Math.max(fbEnd * 0.6, 0.8), cam: "side" });
      if (tBoat != null && tBoat > 0.3) shots.push({ t: Math.max(tBoat - 0.8, fbEnd * 0.3), cam: "boat" }, { t: tBoat + 5, cam: "far" });
      else shots.push({ t: Math.max(fbEnd, 6), cam: "far" });
      shots.push({ t: 200, cam: "aerial" });
    }
    shots.sort((a, b) => a.t - b.t);
    // captions
    const cap = [];
    cap.push({ t: 1e-4, text: "Detonation. In a millionth of a second the fireball is as hot as the centre of the Sun." });
    if (fb && bz >= 0) {
      cap.push({ t: Math.max(fb.t_s[0], 2e-3), text: "A flash brighter than the Sun: about a third of the energy leaves as heat and light." });
      const D = 2 * fb.max_radius_m;
      cap.push({ t: Math.min(fbEnd * 0.4, 3), text: `The fireball grows to ${fmtKm(D)} across: as wide as ${Math.max(1, Math.round(D / 105))} football pitches end to end.` });
    }
    if (bz < 0) {
      cap.push({ t: 2e-3, text: "Underwater, the shock races through the sea at about 1,500 m/s, more than four times faster than sound in air." });
      cap.push({ t: 3, text: "A huge column of water and spray shoots up out of the sea." });
    }
    for (const r of recs) {
      const rr = byLabel[r.id];
      if (!rr || !r.pulse) continue;
      cap.push({ t: r.pulse.arrival_s, text: `${fmtT(r.pulse.arrival_s)}: the ${r.pulse.medium === "air" ? "blast wave" : "pressure wave"} reaches the ${rr.label.replace(/ \d+$/, "").toLowerCase()} ${fmtKm(Math.hypot(rr.x_m, rr.y_m || 0))} away.` });
    }
    if (bz >= 0) {
      const top = cloudTopM(y);
      cap.push({ t: 60, text: "The mushroom cloud climbs, sucking up air, spray and debris." });
      cap.push({ t: 300, text: `The cloud stops rising about ${fmtKm(top)} up: ${(top / 8849).toFixed(1)} times as high as Mount Everest.` });
    }
    if (data.waves && boat?.waves && boat.waves.height_high_m > 0.5) cap.push({ t: boat.waves.max_wave_arrival_s, text: `Waves up to ${Math.round(boat.waves.height_high_m)} m high reach the boats.` });
    cap.sort((a, b) => a.t - b.t);
    film = { simT: 1e-4, lastSet: null, shots, shotIdx: -1, cap, capIdx: -1, fbEnd, tKey, camLocked: false, end: bz >= 0 ? 600 : 300 };
    show("film");
    renderResults();
  }

  function rate(t) { return t < film.fbEnd ? null : t < film.tKey ? 1 : t < 120 ? 6 : 30; }

  function update(dt) {
    if (showing !== "film" || !film) return;
    // the user took over the timeline (dragged it or pressed play): stop directing
    if (film.lastSet != null && Math.abs(ctx.timeline.getTime() - film.lastSet) > 1e-9 * Math.max(1, film.lastSet)) { finish(); return; }
    const r = rate(film.simT);
    film.simT = r == null ? Math.min(film.simT * Math.pow(10, dt * 0.8), Math.max(film.fbEnd, film.simT + 1e-9)) : film.simT + dt * r;
    if (film.simT >= film.end) { film.simT = film.end; ctx.timeline.setTime(film.simT); finish(); return; }
    ctx.timeline.setTime(film.simT); film.lastSet = ctx.timeline.getTime();
    // camera
    let si = -1;
    film.shots.forEach((s, i) => { if (film.simT >= s.t) si = i; });
    if (si !== film.shotIdx && !film.camLocked) { film.shotIdx = si; ctx.setCam(film.shots[si].cam); }
    // caption
    let ci = -1;
    film.cap.forEach((c, i) => { if (film.simT >= c.t) ci = i; });
    if (ci !== film.capIdx) {
      film.capIdx = ci;
      const box = q(".spCaption");
      box.classList.remove("in"); void box.offsetWidth;
      box.textContent = ci >= 0 ? film.cap[ci].text : ""; box.classList.add("in");
    }
    if (Math.random() < 0.1) renderResults();
  }

  function finish() { show("results"); renderResults(); }

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
      return `<div class="spRes" style="--c:${col}"><div class="spResTop"><span class="spEmoji">${esc(r.emoji)}</span>
        <div><b>${esc(r.label.replace(/ \d+$/, ""))}</b> <small>${dist} away${r.z_m < 0 ? `, ${Math.round(-r.z_m)} m deep` : ""}</small>
        <div class="spVerdict">${verdict}</div></div></div>
        ${lvl === null ? "" : `<div class="spWhy">${esc(why.charAt(0).toUpperCase() + why.slice(1))}.</div>
        <details><summary>Why? The numbers</summary><ul>${details}</ul></details>`}</div>`;
    }).join("");
    body.innerHTML = cards || `<p class="help">Working it out…</p>`;
  }

  // ---------------------------------------------------------------- buttons
  q(".spGo").addEventListener("click", detonate);
  const replay = () => { ctx.sound.unlock(); ctx.timeline.pause(); ctx.timeline.setTime(0); film ? startFilm(ctx.timeline.getData()) : detonate(); };
  q(".spReplay").addEventListener("click", replay);
  q(".spReplay2").addEventListener("click", replay);
  q(".spSkip").addEventListener("click", () => { ctx.timeline.setTime(film?.end ?? 600); finish(); });
  const again = () => { film = null; ctx.timeline.pause(); show("start"); };
  q(".spNew").addEventListener("click", again);
  q(".spNew2").addEventListener("click", again);
  q(".spResClose").addEventListener("click", () => { q(".spResults").hidden = true; });
  q(".spExpert").addEventListener("click", () => ctx.toExpert());

  return {
    update,
    show,
    lockCamera() { if (film) film.camLocked = true; },
    refresh: renderResults,
    get state() { return showing; },
    get choice() { return choice; },
  };
}
