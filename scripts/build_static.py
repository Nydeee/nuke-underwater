"""Build the static website (no server needed): build/site/, ready for GitHub Pages or any file host.

    uv run python scripts/build_static.py            # build it
    uv run python scripts/build_static.py --serve    # build it and open it at http://127.0.0.1:8001

What it does:
  * copies the web app (src/nukesim/web/static), leaving out developer pages (dev/);
  * packs the physics (src/nukesim, without the web server) into physics.zip; the visitor's browser runs it
    with Pyodide (Python compiled to WebAssembly), see physics.js and physics-worker.js;
  * tells the page to calculate in the browser instead of asking a server;
  * adds CNAME (the custom domain for GitHub Pages) and .nojekyll (serve the files exactly as they are).
"""
from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "nukesim"
STATIC = SRC / "web" / "static"
OUT = ROOT / "build" / "site"
DOMAIN = "whatifanukeexplodedunderwater.com"
# the web server and its protections are not needed in the browser (they need FastAPI)
SKIP_PY = {"web/server.py", "web/protect.py"}


def build(out: Path = OUT) -> Path:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(STATIC, out, ignore=shutil.ignore_patterns("dev", "__pycache__", ".DS_Store"))

    # the physics, as a zip the browser unpacks into its Python
    with zipfile.ZipFile(out / "physics.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(SRC.rglob("*.py")):
            rel = p.relative_to(SRC).as_posix()
            if rel.startswith("web/static/") or rel in SKIP_PY or "__pycache__" in rel:
                continue
            z.write(p, f"nukesim/{rel}")

    # calculate in the browser
    index = out / "index.html"
    html = index.read_text(encoding="utf-8")
    marker = '<script type="importmap">'
    assert marker in html, "index.html: importmap not found"
    html = html.replace(marker, "<script>window.NUKESIM_LOCAL_PHYSICS = true;   // static site: the physics runs in this browser</script>\n  " + marker, 1)
    index.write_text(html, encoding="utf-8")

    (out / "CNAME").write_text(DOMAIN + "\n", encoding="utf-8")
    (out / ".nojekyll").write_text("", encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"built {out.relative_to(ROOT)}: {sum(1 for f in out.rglob('*') if f.is_file())} files, {size / 1e6:.1f} MB "
          f"(physics.zip {(out / 'physics.zip').stat().st_size / 1e3:.0f} kB)")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serve", action="store_true", help="also serve it at http://127.0.0.1:8001")
    a = ap.parse_args()
    site = build()
    if a.serve:
        import functools
        import http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
        print("serving at http://127.0.0.1:8001  (Ctrl+C to stop)")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8001), handler).serve_forever()
