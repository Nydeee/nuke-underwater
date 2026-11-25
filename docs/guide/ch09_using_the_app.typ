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

*Top bar*
- *Scenario*: ready-made examples (a Hiroshima-sized air burst over the sea, Crossroads BAKER,
  1 Mt on the surface, a 1 Mt air burst and a deep underwater burst). Picking one fills in the
  burst, the sea and a few animals and boats, so you can start exploring straight away.
- *Technical / Realistic*: the two ways of drawing the scene (see below).
- *Basic / Expert*: how much detail you see (see below).
- *Help*: a short "how to use" card. It also appears the first time you open the app.

*Left panel: the setup*, in folding sections:
- *Burst*:
  - the yield (kilotons or megatons);
  - whether the burst is above or below the water, and how far;
  - the wind speed (fallout drifts with it);
  - in Expert mode, how much of the yield came from fission (this affects fallout).
- *Sea*: deep open ocean, or a chosen water depth (the sea floor appears).
- *Things in the sea*: add a fish, whale, dolphin, turtle, diver or a person on a boat. Each one
  can be given a body mass; fish can have a swim bladder or not; whales and dolphins have a hearing group.
- *Technical view* (only in that view):
  - how far and how deep to show;
  - in Expert mode, how tall the water part of the view is (depths are tiny compared with
    distances, so the water is stretched to be visible);
  - an *overlay* to colour the cut-away: peak water pressure, initial radiation dose, or the danger
    zones for one kind of animal.

*Right panel: results*
- Click anything in the sea to see its report. Each effect shows its level and the numbers.
- "Fallout over the following weeks" appears when the burst produces local fallout.
- *Assumptions & warnings* lists every caveat the models raised for that case. Read these: they
  say when a number is an estimate, an extrapolation or outside a formula's range.
- Two charts: wave height vs distance (chapter 8), and the fallout dose rate over 30 days for the
  selected fish or person (chapters 4 and 7).
- *Show uncertainty* adds the likely range to each number (chapter 10).

== Basic and Expert

Both modes use exactly the same physics; they only change what is *shown*.

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Mode*], [*What you see*]),
  [Basic], [The key numbers for every effect (pressures, doses, burn energy, wave heights), with
    plain labels such as "Where" for the burst position. Still technical, just less cluttered.],
  [Expert], [Everything in Basic, plus the threshold each level is judged against and its source,
    the fission share, the number of uncertainty runs, the stretch of the water view, technical
    labels (for example "height of burst (HOB) / depth of burst (DOB)"), the caveats list opened
    by default, and a box listing what the realistic view draws only approximately.],
)

== The technical view

- The sea surface, a vertical *cut-away* showing distance and depth, rings marking distances from
  ground zero, and the burst with its fireball drawn to scale.
- Animals, divers and boats are small 3D models, enlarged so they can be seen, and turned to face
  the burst.
- Drag with the mouse to rotate the view and scroll to zoom.
- Drag any animal or boat along the cut-away to move it. Its result updates as soon as you let go.
- Each one is coloured by its worst effect: green (none), yellow (possible), orange (likely),
  red (severe), dark red (lethal).
- The *timeline* under the scene lets you choose a moment after the burst and watch the effects
  arrive (chapter 11).
- The box in the top left summarises the burst: its type, fireball size, how much shock couples
  into the water (chapter 8), the crater, and whether there is local fallout.

== The realistic view

This view draws the same scenario as it might look to an observer: an ocean with reflections, a
blue sky with the sun, and the burst as it develops. It is driven by the timeline, so press play
to watch it unfold. Everything is drawn in real metres, at true size and distance.

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*What*], [*Where its size comes from*]),
  [Fireball], [Its radius over time and when it fades, from the timeline (chapter 5). The flash
    brightens the whole scene for a moment.],
  [Blast front], [A shell and a ring on the water, at the distance the air shock has reached
    (chapter 2).],
  [Waves], [Rings at the distance the waves have travelled, sized from the wave model (chapter 8).
    Small waves are drawn at least 1 m tall so they stay visible.],
  [Mushroom cloud], [Top and bottom height and cap width from fits to Glasstone & Dolan
    (Fig. 2.12 and 9.96) and the Miller cap-radius formula. It rises over the first few minutes and
    spreads out and fades after about an hour.],
  [Underwater bursts], [A water column or spray dome and base surge, scaled from BAKER by the cube
    root of the yield. This is illustrative only.],
  [Animals, divers, boats], [3D models at their true positions. Boats are drawn six times larger
    and every object has a small pin so you can find it.],
)

The camera can be turned freely with the mouse, or set with the buttons: *Aerial*, *Side*,
*From a boat* and *Far away*. Dragging things is only possible in the technical view.

#caution[The realistic view is a picture, not a measurement. The cloud's puffs, colours and
lighting are artistic. Its sizes and timings follow the models, but use the technical view and the
results panel for numbers.]

== Things to try

+ *Pick the Hiroshima scenario*, switch to Realistic and press play. Then try the 1 Mt surface
  burst from the *Far away* camera.
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
