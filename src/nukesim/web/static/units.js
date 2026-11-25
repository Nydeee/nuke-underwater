// Display units (metric or imperial). The physics always works in metric; this file only
// changes what the interface shows and what the input boxes mean.
//
// Inputs that hold a length or a speed carry data-q="m" (metres), "km" or "wind" (mph inside
// the program). Their unit label is the next <span class="unit">.

const Q = {
  m:    { metric: ["m", 1],      imperial: ["ft", 3.28084] },
  km:   { metric: ["km", 1],     imperial: ["mi", 0.621371] },
  wind: { metric: ["km/h", 1.609344], imperial: ["mph", 1] },   // canonical value is mph
};

const listeners = [];
export const units = {
  system: "metric",
  onChange(fn) { listeners.push(fn); },
};

const factor = (q, sys = units.system) => Q[q][sys][1];
export const unitLabel = (q) => Q[q][units.system][0];

/** Canonical value (m, km or mph) of an input box with data-q. */
export function readInput(el) {
  if (el.dataset.shown === el.value && el.dataset.canon) return +el.dataset.canon;   // unchanged since we wrote it: exact value
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v / factor(el.dataset.q) : NaN;
}
/** Put a canonical value into an input box with data-q. */
export function writeInput(el, canonical) {
  el.value = tidy(canonical * factor(el.dataset.q));
  el.dataset.canon = canonical; el.dataset.shown = el.value;    // so switching units back and forth doesn't drift
}
const tidy = (v) => (v === 0 ? 0 : +v.toPrecision(v >= 100 ? 4 : 3));

export function setSystem(sys) {
  if (sys === units.system) return;
  const inputs = [...document.querySelectorAll("input[data-q]")];
  const canon = inputs.map(readInput);
  units.system = sys;
  inputs.forEach((el, i) => {
    if (Number.isFinite(canon[i])) writeInput(el, canon[i]);
    const lab = el.parentElement.querySelector(".unit");
    if (lab) lab.textContent = unitLabel(el.dataset.q);
  });
  listeners.forEach((fn) => fn(sys));
}

const p3 = (v) => +v.toPrecision(3);
/** A distance in metres, as text: "350 m" / "2.4 km" or "1150 ft" / "1.5 mi". */
export function fmtLen(m) {
  if (!Number.isFinite(m)) return "–";
  if (units.system === "imperial") {
    const ft = m * 3.28084;
    return ft < 1320 ? `${Math.round(ft)} ft` : `${p3(m / 1609.344)} mi`;
  }
  return m < 1000 ? `${Math.round(m)} m` : `${p3(m / 1000)} km`;
}
/** A depth or height in metres, always in the small unit: "12 m" / "39 ft". */
export function fmtDepth(m) {
  if (!Number.isFinite(m)) return "–";
  return units.system === "imperial" ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`;
}
/** Factor and label for charts: distances (km or mi) and heights (m or ft). */
export const chartUnits = () => (units.system === "imperial"
  ? { dist: 0.621371, distLabel: "mi", height: 3.28084, heightLabel: "ft" }
  : { dist: 1, distLabel: "km", height: 1, heightLabel: "m" });
