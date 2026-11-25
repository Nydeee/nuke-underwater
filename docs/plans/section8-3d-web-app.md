# Section 8 plan: 3D local web app

## Goal
A window on your Mac where you:
- set up a burst (yield, height above or depth below the water, water depth, wind, weapon fission share);
- place fish, whales, dolphins, turtles, divers and boats in a 3D sea by dragging them;
- see what happens to each one. That means the effects report already built in Section 6, plus the
  physics numbers behind it, all with their sources.

Everything runs on your Mac. Nothing is sent to the internet.

## How it fits together
```
Browser window (3D scene + controls)  <-- talks to -->  small Python server  -->  existing nukesim code
        plain HTML / JavaScript / Three.js                 FastAPI + uvicorn        (unchanged, tested)
```
- **No build tools:** Node.js isn't installed, so the interface is plain HTML, CSS and JavaScript files that
  the browser loads directly. Three.js (the 3D library) is pinned to one version (0.160.0) and stored
  in the project, so it works offline. That's a one-time download of about 1 MB from the jsDelivr CDN.
- **New Python dependencies:** `fastapi` and `uvicorn` (the standard tools for small Python web servers).
- **Start it with one command:** `uv run nukesim-web` starts the server and opens the browser at
  `http://127.0.0.1:8000`.

## What you'll see (version 1)
1. **The 3D scene:**
   - a sea surface and a cut-away showing the depth, with an adjustable vertical stretch, since depths
     are metres and distances are kilometres;
   - the sea floor at the chosen water depth;
   - the burst point, with the fireball drawn to scale (Glasstone §2.127);
   - a distance grid and labels.
   - You can orbit, zoom and pan the camera.
2. **Placing things:** add a fish, mammal, turtle, diver or boat from a toolbar, then drag it on the cut-away
   plane (distance and depth) or on the surface (for boats). You set each one's mass, swim bladder or
   hearing group in a side panel.
3. **Results:**
   - each receiver is coloured by its worst effect (none / possible / likely / severe / lethal);
   - clicking one opens its full report: blast, hearing, burns, radiation, fallout over weeks, each with
     its numbers, the threshold and its source;
   - an "assumptions & warnings" list shows every caveat the models report.
4. **Overlay on the cut-away plane (switchable):**
   - peak water pressure (Sections 1, 2 and 7);
   - initial radiation dose (Section 3);
   - the danger zones for a chosen animal (Section 6).
5. **Waves and fallout panel:** wave height vs distance (Section 7), and the fallout dose over time for a
   selected fish or boat (Sections 4 and 6b), as simple charts.

## Behind the scenes (`src/nukesim/web/`)
- `server.py`, which provides these endpoints:
  - `POST /api/assess` takes the scenario and returns one report per receiver;
  - `POST /api/field` returns grid values for an overlay;
  - `POST /api/waves` and `POST /api/fallout` return chart data.
- Input checks (pydantic) give clear errors, for example "a fish must be underwater".
- `static/`: `index.html`, `app.js` (scene and controls), `api.js`, `style.css`, `vendor/three/…`.

## Tests
- API tests with FastAPI's test client:
  - every endpoint answers;
  - the answers match calling the Python functions directly;
  - bad input gives a clear error.
- I'll start the app in the built-in browser and check that the 3D scene, dragging, reports and overlays
  actually work, using screenshots.

## Guide
- Chapter 9, "Using the simulator": a tour of the interface, plus a short plain-language explanation of how
  the browser, the server and the physics code talk to each other.

## Later (not in version 1)
- Animated waves and blast fronts moving out over time.
- Packaging as a double-clickable Mac app (pywebview or Tauri).
- Saving and loading scenarios.

## Honest limits
- The interface only *shows* the existing models. All their caveats carry through and are displayed.
- Large overlay grids take a few seconds to compute, because some models (air blast into water) do a
  calculation per point.
