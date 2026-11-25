// Background worker for the static website: runs the simulator's own Python code in the browser.
// Pyodide (Python compiled to WebAssembly, https://pyodide.org) comes from the jsDelivr CDN; the physics
// itself is physics.zip, made by scripts/build_static.py from src/nukesim (without the web server parts).
// Answers each request exactly like the web server would (nukesim/web/api.py, handle()).

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";
importScripts(PYODIDE + "pyodide.js");

const ready = (async () => {
  const py = await loadPyodide({ indexURL: PYODIDE });
  await py.loadPackage(["numpy", "pydantic"]);
  const zip = await fetch("physics.zip");
  if (!zip.ok) throw new Error(`physics.zip: ${zip.status}`);
  py.unpackArchive(await zip.arrayBuffer(), "zip");
  py.runPython("from nukesim.web.api import handle");
  return py.globals.get("handle");
})();

ready.then(() => postMessage({ type: "ready" }))
  .catch((err) => postMessage({ type: "failed", error: `the physics engine could not load (${err.message || err})` }));

onmessage = async (e) => {
  const { id, path, body } = e.data;
  try {
    const handle = await ready;
    const out = handle(path, body);
    const [status, text] = out.toJs();
    out.destroy();
    postMessage({ type: "answer", id, status, text });
  } catch (err) {
    postMessage({ type: "error", id, error: String(err.message || err) });
  }
};
