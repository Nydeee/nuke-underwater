#import "template.typ": *

= Ships, weather, night and the body view

_Code: `src/nukesim/effects/ships.py`, `src/nukesim/effects/conditions.py`; in the app
`species.js`, `models.js`, `bodyview.js`, `reactions.js`._

This chapter adds four things: real ships with crews, the weather and time of day, injuries that
appear as the timeline reaches them, and a close-up "body view" that shows *where* each injury is.

== Choosing what to put in the sea

The *Things in the sea* buttons now open a list:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Group*], [*Choices (typical adult size)*]),
  [Fish], [sardine (0.1 kg), Atlantic mackerel (0.5 kg, *no swim bladder*), Atlantic cod (5 kg),
    Atlantic salmon (4 kg), bluefin tuna (250 kg), grouper (10 kg)],
  [Big animals], [bottlenose dolphin, orca, great white shark (a fish with *no swim bladder*),
    sea lion, humpback whale, sperm whale],
  [Turtles], [green, loggerhead, leatherback],
  [Boats & ships], [a person on a small boat, a fishing boat, a destroyer, an aircraft carrier],
)

Each choice fills in a typical mass, length, swim bladder (fish) and hearing group (whales and
dolphins), which you can still change. The masses and lengths are typical field-guide values, not
data from the effect models.

#caution[Yelverton's fish tests (chapter 6) used fish from 0.02 g to 744 g. For a 5 kg cod or a
250 kg tuna the swim-bladder limit is *extrapolated*, and the warnings list says so.]

== Ships

#table(
  columns: (auto, auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Ship*], [*Light damage*], [*Moderate*], [*Severe*]),
  [Destroyer], [5 psi], [15 psi], [25 psi],
  [Aircraft carrier], [5 psi], [20 psi], [30 psi],
  [Fishing boat / small craft#super[a]], [5 psi], [15 psi], [25 psi],
)
#text(size: 9pt)[#super[a] TM 23-200 has no row for fishing boats; we use "LSTs, landing craft", the
closest category.]

These are *peak air overpressures* from the U.S. armed forces' manual _Capabilities of Atomic
Weapons_ (TM 23-200, Table 8-1). The damage levels mean:
- *light*: radar, electrics and other gear damaged, but the ship can still operate;
- *moderate*: the ship cannot move (engines, boilers, shock-sensitive equipment);
- *severe*: sunk, or needs rebuilding.

For an *underwater* burst the same manual gives distances instead (its Figs. 8-1 to 8-3): how far
from a 1 kt burst at each depth a ship is severely, moderately or lightly damaged. Bigger bursts
scale with the cube root of the yield, for both the distance and the depth. We read these off
the graphs by hand (about ±10%), and the manual itself calls them "based on limited data".

#analogy[The underwater ranges are like a recipe for a 1 kt burst. For 8 kt you double every length:
the burst twice as deep, and the damage reaching twice as far.]

*The crew.* Each ship has crew *on deck* (assessed like the person on a boat: blast, burns,
radiation, flash blindness) and *below deck*:
- Below deck nobody is burned: anything opaque blocks the heat completely (Glasstone sec. 7.18).
- The steel decks and bulkheads cut the radiation. TM 23-200 Table 6-5 gives the fraction that gets
  inside, compartment by compartment: on a destroyer 10--70% of the gamma rays, on a large carrier
  from 20% down to 0.05%. We show the whole range.
- There is no published criterion for blast injury inside compartments, so it is not assessed.

#caution[Capsizing, being swamped by the waves, fires and flying debris are not assessed: there are no
published numbers to base them on.]

*How a ship is drawn when it is hit.* Only the damage to the *ship itself* moves the ship. (An
earlier version flipped the whole ship over when its crew on deck were badly hurt, even if the hull
was fine; that was a bug.) The hull shudders when the shock arrives; a ship that is *disabled* takes
on a slight list; one that is *wrecked or sunk* leans over by about 23° and slowly settles low in the
water over four minutes. How a ship really lists or sinks is not in the sources, so this movement is
only an illustration of the damage level.

The fishing boat and the destroyer are free models made by artists ("Boat" by Poly by Google and "low
poly battleship" by angelo raffaele Catalano, both CC-BY 3.0); the crew stand on their real decks.

== Weather and time of day

The *Conditions* section on the left sets the time of day, how clear the air is, and whether it is
overcast. In the realistic view these change the sky, sun, water and fog. They also change two
results.

*Haze and fog absorb the heat.* The burn formula (chapter 5) assumes an exceptionally clear day
(about 50 miles visibility). For hazier air we use DNA EM-1's formula for the fraction of the heat
that gets through over a slant distance $R$ when you can see a distance $V$:
$ T = e^(-2.9 R slash V) (1 + 1.9 R slash V) $
and scale the burn exposure by $T(V) slash T(50 "mi")$. EM-1 gives this formula for bursts below
about a quarter of a mile; for higher bursts we use it as an approximation and say so.

*Clouds.* With a cloud layer _above_ the burst, heat bounces back down: about 1.5 times more
(Glasstone sec. 7.100). With the cloud layer _between_ the burst and the sea, only 10--30% gets
through (EM-1 Table 3-1, "medium cloud"). We put the overcast layer at 1,500 m (our choice).

*Flash blindness at night.* Looking toward the burst can blind someone for about ten seconds (flash
blindness) or burn a permanent blind spot on the retina. At night the pupils are wide open, so this
happens much farther away. Glasstone Figs. 12.88a/b give the "safe distances":

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*10 kt at 10,000 ft*], [*Flash blindness*], [*Retinal burn*]),
  [Day], [about 15 miles], [about 17 miles],
  [Night], [about 60 miles], [about 31 miles],
)

These curves only exist for bursts at 10,000 ft and 50,000 ft. For lower bursts the app does not
assess flash blindness and says why. Dawn and dusk count as day.

== Injuries that follow the timeline

With *Follow timeline* ticked (top of the results), the results become an *injury log*:
- each injury appears at the moment its cause arrives (the heat, then the blast, then radiation);
- the ones still to come show "not yet" and when they will arrive;
- the colours of the list, the 3D models and the marker pins show the worst injury *so far*.

Untick it to see the final results straight away.

In *Settings* you can also let the 3D models *react*:
- a jolt when the pressure pulse passes;
- a badly hurt animal rolls over and slowly drifts up;
- a person on deck falls;
- burned skin darkens.

These movements only *illustrate* the results. The simulator tells us when and how badly, not how
bodies move.

== The body view

Press *Body view* on a result to see that animal or person up close and see-through, with the
injured parts glowing in the colour of their injury:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Injury*], [*Where it is drawn*]),
  [blast (lungs, gut)], [lungs and intestines: blast hurts the gas-filled organs],
  [swim bladder], [the swim bladder, in the middle of a fish],
  [fish peak pressure], [internal organs],
  [hearing / eardrums], [the ears],
  [burns], [the skin facing the fireball],
  [radiation sickness], [the whole body (bone marrow, gut lining)],
  [flash blindness], [the eyes],
)

#keyidea[The models say *which organ* is hurt and *how badly*, because each criterion measures a
particular organ. *Exactly where* on that organ is not something they give: the glow is drawn where
the organ usually sits. A full "ragdoll" with physics is a possible later step.]

== Pictures and video

The *Export* menu can save a picture of the 3D view, or *record a video*, either of whatever you do
or of the whole event played from the flash. The video is saved as MP4 or WebM, whichever your
browser supports. The `V` key starts and stops recording.

#questions(
  [Why does a mackerel survive closer to a blast than a cod of the same size?],
  [Why can the crew below deck on a carrier get a thousand times less radiation than the crew on deck?],
  [Why does flash blindness reach so much farther at night?],
)
#answers(
  [It has no swim bladder, the gas-filled organ that the pressure pulse damages most.],
  [Several decks of steel lie between them and the burst; deep inside, only about 0.05% of the gamma rays get through (TM 23-200 Table 6-5).],
  [The pupils are wide open in the dark, so much more light reaches the retina (Glasstone sec. 12.84).],
)
