#import "template.typ": *

= Using the simulator

_Simulator section 8. Code: `src/nukesim/web/`._

Everything in the earlier chapters can be explored in a 3D interface that runs on your own
computer. This chapter is a short tour, plus an explanation of how the pieces fit together.

== Starting it

In a terminal, in the project folder:

```
uv run nukesim-web
```

Your browser opens at `http://127.0.0.1:8000`. That address means "this computer": nothing is
sent over the internet. Press Ctrl+C in the terminal to stop it.

== How it works

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Part*], [*What it does*]),
  [The browser page], [Draws the 3D scene (with the Three.js library) and the controls. It does no physics itself.],
  [The local server], [A small Python program (FastAPI). When you change something, the page sends it the scenario; it runs the simulator code and sends back the results.],
  [The simulator], [The same tested, sourced code from chapters 1--8. The interface can't give a different answer from the scripts.],
)

#keyidea[Keeping the physics in one place (Python) and only *drawing* in the browser means every
number on screen comes from the same code that the tests check.]

== The screen

*Left panel: the setup*
- *Burst*:
  - the yield (kilotons or megatons);
  - whether the burst is above or below the water, and how far;
  - how much of the yield came from fission (this affects fallout);
  - the wind speed (fallout drifts with it).
- *Sea*: deep open ocean, or a chosen water depth (the sea floor appears).
- *Add something to the sea*: a fish, whale, dolphin, turtle, diver or a person on a boat. Each one
  can be given a body mass; fish can have a swim bladder or not; whales and dolphins have a hearing group.
- *View*:
  - how far and how deep to show;
  - how tall the water part of the view is (depths are tiny compared with distances, so the water is
    stretched to be visible);
  - an *overlay* to colour the cut-away: peak water pressure, initial radiation dose, or the danger
    zones for one kind of animal.

*Middle: the 3D scene*
- The sea surface, a vertical *cut-away* showing distance and depth, and the burst (white) with its
  fireball drawn to scale (orange).
- Drag with the mouse to rotate the view and scroll to zoom.
- Drag any animal or boat along the cut-away to move it. Its result updates as soon as you let go.
- Each one is coloured by its worst effect: green (none), yellow (possible), orange (likely),
  red (severe), dark red (lethal).
- The box in the top left summarises the burst: its type, fireball size, how much shock couples
  into the water (chapter 8), the crater, and whether there is local fallout.

*Right panel: results*
- Click anything in the sea to see its full report. Each effect shows its level, the numbers, the
  threshold used and its source (chapters 6 and 7).
- "Fallout over the following weeks" appears when the burst produces local fallout.
- *Assumptions & warnings* lists every caveat the models raised for that case. Read these: they
  say when a number is an estimate, an extrapolation or outside a formula's range.
- Two charts: wave height vs distance (chapter 8), and the fallout dose rate over 30 days for the
  selected fish or person (chapters 4 and 7).

== Things to try

+ *20 kt, 500 m above the sea.* Place a fish 10 m deep at 1 km and a person on a boat at the same
  distance. Compare them: water protects the fish from radiation and heat, but the person on deck
  is exposed to everything.
+ *The same 20 kt, 27 m underwater in 60 m of water* (like BAKER, 1946). Add a dolphin and drag
  it from near the surface to deeper water. Watch how the surface cutoff protects it near the top.
+ *1 Mt on the surface, deep ocean.* Note the coupling (about 2%), the crater and the waves, then
  move a fish tens of kilometres downwind and look at its fallout dose over weeks.
+ Use the *danger zones* overlay to see, at a glance, where each kind of animal would be hurt.

#caution[The interface only *shows* the models from chapters 1--8, with all their limits.
When the warnings list says something is an upper estimate or an extrapolation, that applies to the
picture too. Large overlays take a few seconds, because some models calculate each point
separately.]
