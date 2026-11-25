#import "template.typ": *

= Fallout on the sea

_Simulator section 4. Code: `src/nukesim/effects/fallout.py` and `sea_contamination.py`._

Chapter 3 covered the radiation released in the first minute. This chapter is about what
stays behind: radioactive *fallout* that rains down over hours, and how the sea deals with
it. The short version: *the sea hides fallout from people above it, but spreads it
through the water where fish live.*

== What fallout is

A nuclear explosion splits heavy atoms into lighter *fission products*, hundreds of
different radioactive atoms. If the fireball touches the surface, it sucks up huge amounts of
material (soil, or seawater and salt), which mixes with these radioactive atoms. As the
mushroom cloud cools, the material condenses into particles and drops, and the wind carries
them downwind as they fall. That's *local fallout*.

Two facts decide whether there is any:

- *Burst height.* If the burst is higher than about $180 W^(0.4)$ feet (about 180 m for 20 kt,
  870 m for 1 Mt), the fireball never touches the surface and there is no significant local
  fallout (Glasstone & Dolan Eq. 2.128.1, ±30%). The radioactivity rises high into the
  atmosphere and comes down much later, very spread out and much decayed.
- *What's underneath.* Over the sea, the particles are mostly sea salt and water drops, which
  are smaller and lighter than soil particles (§9.53). Only about *20--30%* of the
  radioactivity comes down as early fallout, against about 60% for a land burst (§9.59).

== Radioactive decay and the 7:10 rule

Each radioactive atom has a *half-life*: the time for half of a batch of them to decay. Some
fission products have half-lives of seconds, others of decades. Because there are so many
kinds, the mixture's radioactivity doesn't halve at a steady rate. It falls fast at first,
then more and more slowly:

$ R_t = R_1 t^(-1.2) $

where $R_1$ is the dose rate 1 hour after the explosion and $t$ is in hours (Glasstone Eq.
9.147.1). A handy version is the *7:10 rule*: every time the time after the explosion
multiplies by 7, the dose rate drops by 10 (§9.15). So at 7 hours it is 1/10, at 49 hours
(about 2 days) 1/100, and at 2 weeks about 1/1000 of the 1-hour value. This is accurate to
about 25% up to 2 weeks, and to a factor of 2 up to about 6 months.

#fig("/output/guide_figures/decay.png", width: 75%)[Decay of fallout radioactivity: the $t^(-1.2)$
law, with the 7:10 rule marked.]

== Where the fallout lands

Glasstone gives an *idealized fallout pattern* (Table 9.93). For a contact surface burst and a
15 mph wind, it gives the size of the zones where the "1-hour reference dose rate" $R_1$ is
1, 3, 10, …, 3,000 rads/hour. For example, the 100 rads/hr zone reaches $8.9 W^(0.45)$ miles
downwind. The simulator:

- stretches the pattern for other wind speeds (§9.97);
- scales the dose rates by the fraction of the yield that came from fission (§9.94);
- multiplies by (20--30%)/60% because the burst is on the sea. That last step is *this
  project's adjustment*, based on §9.59, and the reason the answer is a range.

#fig("/output/guide_figures/fallout_sea.png")[Left: idealized fallout pattern for a 1 Mt burst on
the sea (upper estimate). Right: dose rate over time 50 km downwind, for a person on a boat and
for fish at different depths.]

== Why the sea hides fallout

On land, fallout stays on the surface and irradiates anyone standing on it. On the sea, it
*sinks and mixes*. Measurements after the 1956 Redwing tests in the Pacific found that the
radioactivity:

- started in the top 10--20 m of the water;
- sank at about *3--4 metres per hour*;
- stopped at the *thermocline*, about 40--60 m down, and stayed fairly evenly mixed above it
  for at least 2 days (Redwing reports WT-1317 and the summary report, §3.4).

#keyidea[The *thermocline* is the boundary between the warm, well-mixed surface layer of the
ocean and the cold, still water below. Water doesn't mix easily across it, so it acts like a
floor that the contamination sits on.]

Spread through 60 m of water, the radioactivity is very dilute near the surface, and the water
itself shields a person on a boat from most of it. The Redwing scientists found that the dose
rate 3 ft above the sea had to be multiplied by *about 1,000* to match what the same fallout
would give on land.

*The simulator reproduces this from first principles.* Glasstone says the fission products of
1 kt, spread over 1 square mile of land, give 2,900 rads/hour at 1 hour (§9.160). It also gives
the corresponding radioactivity (530 million curies of gamma emitters) and average gamma energy
(0.7 MeV) (§9.159). Mix that same radioactivity evenly into 60 m of seawater and calculate
the dose rate just above the surface: it comes out *about 1,170 times* lower than on land. That's
within about 15% of the measured factor.

== Dose to a fish in contaminated water

A fish swimming *inside* the contaminated layer is surrounded by radioactivity on all sides.
Practically all the gamma energy released in the water around it is absorbed there, including
by the fish. So the dose rate is simply:

$ "dose rate" = "concentration (Bq/kg)" times "energy per decay" $

A *becquerel* (Bq) is one radioactive decay per second. Near the surface the dose rate is
about half this (there's no radioactive water above), and below the thermocline it drops to
almost nothing.

*Worked example.* A 1 Mt burst on the sea, 15 mph wind, 50 km downwind. Fallout arrives about
2 hours after the burst:

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Who*], [*Dose rate after 1 day*], [*Total over 30 days*]),
  [person on a boat], [about 0.00014 Gy/h], [0.02 -- 0.03 Gy],
  [fish 10 m deep], [about 0.00027 Gy/h], [0.04 -- 0.06 Gy],
  [fish 50 m deep], [about 0.00027 Gy/h (after the activity sinks to it)], [0.014 -- 0.021 Gy],
  [fish 100 m deep], [essentially zero (below the thermocline)], [essentially zero],
)

For comparison, the same spot *on land* would have about 0.32 Gy/h after 1 day, over 2,000
times more than on the boat. The sea's effect comes from mixing (about 1,000×) times the
smaller fallout fraction for sea bursts (about 2×).

== Seawater made radioactive

The bomb's neutrons also make the sea itself radioactive (Glasstone §9.38):

- *Sodium-24* (from the sodium in sea salt): half-life 15 hours. Each decay gives off two
  energetic gamma rays (1.4 and 2.8 MeV).
- *Chlorine-38* (from the chlorine): half-life 37 minutes, so it is down to about 1% within
  4--5 hours.

At the Redwing water-surface shots, sodium-24 made up somewhere between a third and two-thirds of
the dose rate a day after the burst. No source the project found gives how much is made per
kiloton, so the simulator *doesn't include it yet* and warns that early values may be too low.

#caution[
- The fallout pattern is *idealized* and based on *land* data. Real patterns are irregular,
  with hot spots, and rain can wash fallout down in patches (§9.67). The sea adjustment
  (20--30% vs 60%) is this project's own.
- *Mixing* uses the Redwing averages (start 15 m, sink 3.5 m/h, stop at 60 m by default). Real
  oceans vary, and you can change the thermocline depth.
- *Sideways spreading* by currents and eddies isn't included, so dose rates after a few days
  are probably overestimates. For the 1946 BAKER underwater test, Glasstone's Table 9.57 shows
  the contaminated area growing from about 17 to 71 square miles over 4 days.
- *Neutron-activated seawater* (sodium-24, chlorine-38) is missing, see above.
- This chapter only covers radiation *from the water around* a fish. Fish also *absorb*
  radioactive elements (caesium, strontium, iodine…), which irradiate them from the inside.
  That needs element-by-element data and is part of the biology chapter.
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`fallout.has_local_fallout`], [Glasstone Eq. 2.128.1 burst-height test],
  [`fallout.fallout_at`], [1-hour reference dose rate and arrival time at a sea location],
  [`sea_contamination.mixing_depth_m`], [depth of the contaminated layer over time (Redwing)],
  [`sea_contamination.compute`], [dose rate and accumulated dose over time for a receiver],
  [`scripts/plot_fallout_sea.py`], [fallout pattern and dose-over-time plots],
)

#questions(
  [Why does a 20 kt burst at 500 m produce almost no local fallout, while one at the surface does?],
  [Using the 7:10 rule, roughly what fraction of the 1-hour dose rate remains after 49 hours?],
  [Why does a sea burst put less radioactivity into early fallout than a land burst?],
  [What is the thermocline, and why does it matter for fallout in the sea?],
  [Why is a fish 10 m deep in contaminated water exposed to *more* radiation than a person on a boat directly above it?],
  [Name two ways the simulator's fallout doses could be too low, and one way they could be too high.],
)

#answers(
  [500 m is well above $180 W^(0.4)$ ft (about 180 m for 20 kt), so the fireball never touches the surface and doesn't pick up material to form heavy fallout particles.],
  [49 h is 7 × 7 hours, so the dose rate drops by 10 × 10: about 1/100.],
  [Sea-burst particles are mostly small, light salt crystals and water drops, which stay up longer and carry less radioactivity down nearby (Glasstone §9.53).],
  [The boundary between the warm mixed surface layer and cold deep water. Contamination mixes down to it but not easily through it, so it sets how deep the radioactivity spreads.],
  [The fish is surrounded by contaminated water on all sides; the person on the boat only gets radiation from below, through the shielding of the top layer of water.],
  [Too low: neutron-activated seawater (sodium-24) and radioactivity absorbed by fish are not included; hot spots and rain-out are ignored. Too high: sideways spreading by currents isn't included.],
)
