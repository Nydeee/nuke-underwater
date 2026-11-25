// Where the calculations run.
//
//  * With the web server ("uv run nukesim-web", or server hosting): the page asks the server (/api/...).
//  * On the static website (GitHub Pages, no server): the same Python code runs in the visitor's own browser,
//    in a background worker (physics-worker.js), using Pyodide (Python compiled to WebAssembly). The static
//    build (scripts/build_static.py) switches this on by setting window.NUKESIM_LOCAL_PHYSICS.
//
// Either way, callApi() answers like fetch() would: { ok, status, data }.

const LOCAL = typeof window !== "undefined" && !!window.NUKESIM_LOCAL_PHYSICS;
const state = { local: LOCAL, ready: !LOCAL, error: null };
let worker = null, seq = 0;
const waiting = new Map();

/** Start loading Python and the physics in the background (static site only; harmless to call twice). */
export function startPhysics() {
  if (!LOCAL || worker) return;
  worker = new Worker("physics-worker.js");
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "ready") { state.ready = true; return; }
    if (m.type === "failed") { state.error = m.error; for (const w of waiting.values()) w.reject(new Error(m.error)); waiting.clear(); return; }
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === "error") w.reject(new Error(m.error));
    else w.resolve({ ok: m.status >= 200 && m.status < 300, status: m.status, data: JSON.parse(m.text) });
  };
  worker.onerror = (e) => { state.error = `the physics engine could not start (${e.message || "unknown error"})`; };
}

/** Is it local, loaded, failed? (for "getting the physics ready…" messages) */
export const physicsState = () => ({ ...state });

/** Ask for a result: path like "/api/timeline", body an object (or null for a GET). */
export async function callApi(path, body = null) {
  if (!LOCAL) {
    const res = await fetch(path, body == null ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, data: await res.json() };
  }
  startPhysics();
  if (state.error) throw new Error(state.error);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, path, body: body == null ? null : JSON.stringify(body) });
  });
}
