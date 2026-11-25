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
- *Scenario menu*: save the setup under a name, open saved ones, copy a *share link*, export
  the setup to a file or open one, and start over. See "Saving and sharing" below.
- *Export menu*: a picture of the 3D view (PNG), the results as a table (CSV, opens in
  Excel), or every result in full (JSON).
- *Technical / Realistic*: the two ways of drawing the scene (see below).
- *Basic / Expert*: how much detail you see (see below).
- *Settings* (the gear): metric or imperial units, graphics quality (lower it if the 3D view is slow),
  whether the timeline plays by itself in the realistic view, marker pins on or off, and a button
  that resets the layout and preferences.
- *Help*: a guided tour that points at each part of the screen, the keyboard shortcuts, and the
  quick-start card. The quick-start card appears the first time you open the app.

*Side panels*: the small tabs at the edges of the 3D view (or the `[` and `]` keys) hide and show
the side panels, to give the view more room. Drag a panel's inner edge to make it wider or narrower.

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

== Simple, Expert (and the older Basic)

All levels use exactly the same physics; they only change what is *shown* and how you use it.

*Simple* is what the app opens with, and is meant for anyone:
+ Pick a bomb, from *Small* (1 kiloton) to *Tsar Bomba-size* (50 megatons, the largest ever tested).
+ Pick where it goes off: high in the sky, on the water, or just underwater.
+ Pick what is in the sea: a few fish, dolphins and whales, boats and ships, or "fill the sea".
+ Press *Detonate*. After a 3-2-1 countdown the event plays as a short film. The camera moves by
  itself (a close look at the flash, then a boat as the blast arrives, then a wide view of the
  cloud), and captions explain each step with numbers from the simulator, for example when the
  blast reaches each boat, how wide the fireball gets and how high the cloud climbs compared with
  Mount Everest.
+ At the end, *What happened* gives each animal, person or ship a one-line verdict ("Would not
  survive", "Injured", "Unharmed"...) and the reason in plain words ("the pressure wave burst its
  swim bladder"). *Why? The numbers* shows the numbers behind it.

The film's playback speed changes as it goes: very slow-motion for the first second (so the flash
and fireball can be seen), close to real time while the blast passes, then faster while the cloud
rises. The things in the sea are placed at distances that scale with the cube root of the yield, so
every bomb size shows a range from "would not survive" to "unharmed".

*Extras in Simple mode:*
- The start screen floats over the calm sea. *Surprise me* picks everything at random.
- While the countdown runs, a short fact from the sources appears.
- *In real-world terms* compares the results with familiar things: the fireball against football pitches,
  the cloud against the tallest building or Mount Everest, the area where fish were killed against
  Manhattan.
- *Share* makes a picture with the main results and a link that opens the same setup, ready to
  detonate.
- *Dive into the deep* is a page you scroll down, from the surface to the deep ocean floor. At each
  depth it shows the animals that live there (sardines, dolphins, tuna, sperm whales, anglerfish,
  beaked whales and more) and what the chosen burst would do to them at the distance you set. The
  verdicts come from the same injury models; the typical depths are rounded field-guide values.
- On phones the app picks lighter graphics, and the panels rearrange to fit.

*Sound* (the speaker button or `M`) is timed by the physics:
- the boom comes when the simulator's blast front actually reaches the camera, so far away it comes
  late, as in real life;
- under water you hear a muffled thud when the shock in the water arrives;
- there is a wash when the big waves pass.

The sound itself is synthesised, not a recording.

*Expert* shows everything: the panels, the technical cut-away view, every criterion, source,
uncertainty setting and caveat.

The older *Basic* level (the full panels, with plain labels) is still there: tick "Show the older
Basic level" in *Settings* to bring its button back.

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
*From a boat*, *Far away* and *Underwater*. Camera changes glide rather than jump. Dragging things
is only possible in the technical view.

#caution[The realistic view is a picture, not a measurement. The cloud's puffs, colours and
lighting are artistic. Its sizes and timings follow the models, but use the technical view and the
results panel for numbers.]

== The underwater view

Turn the camera down below the sea surface, or press *Underwater*, and the realistic view shows
the scene as a diver would see it. The *Underwater* button puts you next to the first animal or
diver in the list, at its true depth, looking back toward the burst. A label at the top shows how
deep the camera is.

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*What you see*], [*Where it comes from*]),
  [Shock front], [A thin, glassy shell growing from the burst at the speed of sound in water
    (about 1.5 km per second). It is cut off at the surface and the sea floor. Where it reaches the
    surface you see a fast bright ring spreading overhead.],
  [Gas bubble], [For underwater bursts only: a silvery ball of hot gas and steam. Its largest size
    comes from Cole's (1948) bubble formula for TNT, and its growth from Rayleigh's bubble equation
    (see the note below). In shallow water, as at BAKER, it reaches the surface within a fraction of a
    second and bursts out into the air.],
  [Waves and blast from below], [Bright bands passing across the surface overhead, at the same
    distances as the wave rings and the air-blast ring seen from above.],
  [The bright window overhead], [Water bends light, so the whole sky is squeezed into a circle
    overhead about 97 degrees wide (Snell's law). Outside it the surface acts like a mirror and looks
    dark. The light shafts lean at the angle the sunlight is bent to.],
  [Animals, divers, boat hulls], [The same 3D models at their true positions. Under water boats are
    drawn at their true size, so you see the hull from below.],
)

#caution[Several things here are decoration and are listed as such in the view's notes. Real sea
water is much murkier: you could see a few tens of metres, not the few hundred drawn here. The
colour of the water, the pattern of the caustics (the dancing lines of light), the floating
particles and the brightness of the shock front are also made up. The bubble model is a rough
estimate: Glasstone gives no bubble size, so we use the TNT formula with the same "TNT equivalent"
as the shock model. It also ignores the bubble rising and the later pulses (a deep bubble shrinks
and grows again two or three times). The shock bouncing off the sea floor is not shown.]

#keyidea[Chapter 12 covers what came after: species to choose from, ships, weather and night,
injuries that follow the timeline, the body view and video recording.]

== The free camera

Both views have a *Free* camera button (or press `F`). It works like the spectator camera in a
video game:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Key*], [*What it does*]),
  [click the view], [grab the mouse, so moving it looks around],
  [`W` `A` `S` `D`], [fly forwards, left, backwards, right],
  [`E` / `Q` (or Space / `C`)], [fly up / down],
  [`Shift` / `Alt`], [faster / slower while held; the mouse wheel sets the normal speed],
  [`Esc`], [let go of the mouse],
  [`F` again, or a camera button], [leave the free camera; the normal camera carries on from where you are],
)

The speed grows with height, so you can skim over the waves near the surface and still cross a
mushroom cloud kilometres up in a few seconds. In the realistic view you can fly straight down into
the water to switch to the underwater look.

== Saving and sharing

- *Save as…* (`⌘/Ctrl S`) keeps the whole setup (burst, sea, everything in it, the view and the
  moment on the timeline) under a name, in this browser only.
- *Copy share link* puts the whole setup inside a link. Anyone who has nukesim running opens the
  link and sees exactly the same scenario. Nothing is uploaded: the setup is written into the link
  itself.
- *Export to file* saves the same thing as a small `.json` file you can e-mail or keep; *Open file*
  loads it again.
- Removing something from the sea can be undone (the message that appears has an *Undo* button, or
  press `⌘/Ctrl Z`).

== Keyboard shortcuts

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Key*], [*What it does*]),
  [Space], [play / pause the timeline],
  [← / →, Home / End], [step through time; jump to the detonation / the end],
  [`1`–`6`], [camera presets (in the order of the camera buttons)],
  [`F`], [free camera on / off],
  [`T` / `R`], [technical / realistic view],
  [`X`], [basic / expert detail],
  [`[` / `]`], [hide / show the left / right panel],
  [Delete], [remove the selected thing],
  [`P`], [save a picture of the view],
  [`?`], [list of shortcuts],
)

#keyidea[*Units* only change what is *shown*. The physics always works in metric. Some result
texts come straight from the models and keep the units of their sources (often both, such as psi
and kPa).]

== Things to try

+ *Pick the Hiroshima scenario*, switch to Realistic and press play. Then try the 1 Mt surface
  burst from the *Far away* camera.
+ *20 kt, 500 m above the sea.* Place a fish 10 m deep at 1 km and a person on a boat at the same
  distance. Compare them: water protects the fish from radiation and heat, but the person on deck
  is exposed to everything.
+ *The same 20 kt, 27 m underwater in 60 m of water* (like BAKER, 1946). Add a dolphin and drag
  it from near the surface to deeper water. Watch how the surface cutoff protects it near the top.
+ *Pick BAKER, switch to Realistic and press Underwater*, then drag the timeline to the first
  second. Watch the bubble burst out through the surface and the shock front sweep past the fish.
+ *1 Mt on the surface, deep ocean.* Note the coupling (about 2%), the crater and the waves, then
  move a fish tens of kilometres downwind and look at its fallout dose over weeks.
+ Use the *danger zones* overlay to see, at a glance, where each kind of animal would be hurt.

#caution[The interface only *shows* the models from chapters 1--8, with all their limits.
When the warnings list says something is an upper estimate or an extrapolation, that applies to the
picture too. Large overlays take a few seconds, because some models calculate each point
separately.]
