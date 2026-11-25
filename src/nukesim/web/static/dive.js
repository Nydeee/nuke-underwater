// "Dive into the deep": a scroll-down page from the sea surface to the deep ocean floor. At each depth,
// the animals that live there, and what the chosen burst would do to them at a chosen distance.
// The verdicts come from the same injury models as everything else (/api/assess); the page only
// arranges them by depth. Typical depths are rounded field-guide values.

import { BOMBS, WHERE, VERDICT, reason } from "./simple.js";
import { esc } from "./ui.js";

const LV = ["none", "possible", "likely", "severe", "lethal"];
const COL = { none: "#3aa76d", possible: "#c9a21f", likely: "#e0862a", severe: "#d9472b", lethal: "#a51818" };

// [key, name, emoji, depth (m), kind, mass (kg), extra, note]
const LIFE = [
  ["sardine", "Sardines", "🐟", 10, "fish", 0.1, { swim_bladder: true }, "Shoals near the surface."],
  ["diver", "Scuba diver", "🤿", 18, "diver", 75, {}, "Recreational divers rarely go below 40 m."],
  ["dolphin", "Bottlenose dolphin", "🐬", 30, "mammal", 200, { hearing_group: "HF" }, "Most dives are shallow and short."],
  ["turtle", "Green turtle", "🐢", 40, "turtle", 150, {}, "Grazes on seagrass in shallow water."],
  ["cod", "Atlantic cod", "🐟", 80, "fish", 5, { swim_bladder: true }, "Lives near the bottom on the continental shelf."],
  ["humpback", "Humpback whale", "🐋", 120, "mammal", 30000, { hearing_group: "LF" }, "Feeds from the surface to about 200 m."],
  ["tuna", "Bluefin tuna", "🐟", 200, "fish", 250, { swim_bladder: true }, "Dives deep to hunt."],
  ["shark", "Great white shark", "🦈", 300, "fish", 1000, { swim_bladder: false }, "No swim bladder: an oily liver keeps it afloat."],
  ["lantern", "Lanternfish", "🐟", 600, "fish", 0.005, { swim_bladder: true }, "Tiny glowing fish of the twilight zone; many have a gas-filled swim bladder."],
  ["sperm", "Sperm whale", "🐋", 1200, "mammal", 35000, { hearing_group: "HF" }, "Dives over a kilometre to hunt squid."],
  ["angler", "Deep-sea anglerfish", "🐡", 2000, "fish", 0.5, { swim_bladder: false }, "Lives in total darkness; no swim bladder."],
  ["beaked", "Cuvier's beaked whale", "🐋", 2900, "mammal", 2500, { hearing_group: "HF" }, "The deepest-diving mammal known: close to 3 km."],
  ["grenadier", "Grenadier (rattail)", "🐟", 3600, "fish", 1, { swim_bladder: true }, "A fish of the deep ocean floor."],
];
const yOf = (d) => 360 + 2300 * Math.log10(1 + d / 4);   // pixels down the page for a depth (more room near the top)
const FLOOR = 3700;                                        // the average ocean is about 3,700 m deep
const fmtKm = (m) => (m < 1000 ? `${Math.round(m)} m` : `${+(m / 1000).toPrecision(2)} km`);

export function createDive({ api, toast }) {
  const el = document.createElement("div");
  el.id = "dive"; el.hidden = true;
  const H = yOf(FLOOR) + 420;
  el.innerHTML = `
    <div class="dvTop">
      <button class="dvBack">← Back</button>
      <select class="dvBomb" title="Which bomb">${BOMBS.map((b) => `<option value="${b.key}">${esc(b.label)}</option>`).join("")}</select>
      <select class="dvWhere" title="Where it goes off">${WHERE.map((w) => `<option value="${w.key}">${esc(w.label)}</option>`).join("")}</select>
      <label class="dvDist">Distance from the burst <input type="range" min="0" max="1000" value="500"><b></b></label>
    </div>
    <div class="dvMeter"><span>0 m</span></div>
    <div class="dvScroll"><div class="dvPage" style="height:${H}px">
      <div class="dvTitle" style="top:90px"><h1>Dive into the deep</h1><p>Scroll down. At each depth you'll see the animals that live there, and what the burst would do to them.</p><p class="dvHint"></p></div>
      ${LIFE.map(([k, name, emoji, depth, , , , note]) => `<div class="dvItem" data-k="${k}" style="top:${yOf(depth)}px">
        <div class="dvEmoji">${emoji}</div><div class="dvText"><b>${esc(name)}</b> <small>${depth.toLocaleString()} m</small>
        <div class="dvVerdict">…</div><div class="dvWhy"></div><div class="dvNote">${esc(note)}</div></div></div>`).join("")}
      ${[100, 200, 1000].map((d) => `<div class="dvZone" style="top:${yOf(d)}px">${d === 200 ? "200 m: the twilight zone begins; sunlight fades" : d === 1000 ? "1,000 m: the midnight zone, no sunlight at all" : "100 m"}</div>`).join("")}
      <div class="dvFloor" style="top:${yOf(FLOOR)}px"><b>The deep ocean floor</b><p>The average ocean is about 3,700 m deep.</p></div>
    </div></div>`;
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const scroll = q(".dvScroll"), meter = q(".dvMeter span"), slider = q(".dvDist input");
  let choice = null, scale = 1000;

  // depth under the middle of the screen, for the meter on the left
  const dOf = (y) => Math.max(0, 4 * (Math.pow(10, (y - 360) / 2300) - 1));
  scroll.addEventListener("scroll", () => {
    const mid = scroll.scrollTop + scroll.clientHeight / 2;
    meter.textContent = `${Math.round(Math.min(dOf(mid), FLOOR)).toLocaleString()} m`;
    // the water gets darker as you go down
    const f = Math.min(1, Math.log10(1 + dOf(mid) / 4) / Math.log10(1 + FLOOR / 4));
    el.style.setProperty("--depthDark", f.toFixed(3));
  });

  const distOf = (v) => scale * Math.pow(10, (v - 500) / 400);   // the slider moves in steps of ratio, around the scale
  function burst() {
    const b = BOMBS.find((x) => x.key === choice.bomb), k = Math.cbrt(b.kt / 15);
    const z_m = choice.where === "sky" ? Math.round(580 * k) : choice.where === "surface" ? 0 : -Math.round(27 * Math.cbrt(b.kt / 23));
    return { b, z_m };
  }
  let timer = null;
  async function compute() {
    const { b, z_m } = burst(), x = distOf(+slider.value);
    q(".dvDist b").textContent = fmtKm(x);
    q(".dvHint").textContent = choice.where === "sky"
      ? "Water is a good shield: most of an air burst's blast bounces off the sea. Try “Underwater” to see how far down a shock reaches."
      : "Underwater, the shock travels through the sea at 1,500 m/s and reaches deep down.";
    try {
      const res = await api("/api/assess", {
        burst: { yield_kt: b.kt, z_m, fission_fraction: 1, wind_mph: 15 }, env: { water_depth_m: null }, long_term: false,
        receivers: LIFE.map(([k, , , depth, kind, mass, extra]) => ({ id: k, kind, x_m: x, y_m: 0, z_m: -depth, mass_kg: mass, ...extra })),
      });
      for (const r of res.receivers) {
        const item = q(`.dvItem[data-k="${r.id}"]`), life = LIFE.find((l) => l[0] === r.id);
        if (!item) continue;
        if (r.error) { item.querySelector(".dvVerdict").textContent = "–"; continue; }
        const worst = [...r.effects].sort((a, c) => LV.indexOf(c.level) - LV.indexOf(a.level))[0];
        const lv = r.worst || "none";
        const v = item.querySelector(".dvVerdict");
        v.textContent = VERDICT[lv]; v.style.color = COL[lv];
        const why = worst && LV.indexOf(worst.level) > 0 ? reason(worst, life[4]) : "too far away for anything serious to reach it";
        item.querySelector(".dvWhy").textContent = why.charAt(0).toUpperCase() + why.slice(1) + ".";
        item.style.setProperty("--c", COL[lv]);
      }
    } catch (err) { toast(`Could not work it out: ${err.message}`, { kind: "err" }); }
  }
  slider.addEventListener("input", () => { q(".dvDist b").textContent = fmtKm(distOf(+slider.value)); clearTimeout(timer); timer = setTimeout(compute, 250); });
  q(".dvBack").addEventListener("click", () => { el.hidden = true; });
  q(".dvBomb").addEventListener("change", (e) => { choice.bomb = e.target.value; scale = 1100 * Math.cbrt(BOMBS.find((x) => x.key === choice.bomb).kt / 15); compute(); });
  q(".dvWhere").addEventListener("change", (e) => { choice.where = e.target.value; compute(); });

  return {
    open(c) {
      choice = { ...c };
      const b = BOMBS.find((x) => x.key === choice.bomb);
      scale = 1100 * Math.cbrt(b.kt / 15);   // the same distance scale as the film
      slider.value = 500;
      q(".dvBomb").value = choice.bomb; q(".dvWhere").value = choice.where;
      el.hidden = false; scroll.scrollTop = 0; scroll.dispatchEvent(new Event("scroll"));
      compute();
    },
  };
}
