#import "template.typ": *

= Bursts at the surface: shock, crater and waves

_Simulator section 7. Code: `src/nukesim/effects/near_surface_shock.py` and `water_waves.py`._

Chapter 2 covered bursts high enough that the fireball stays in the air, and chapter 1 covered
bursts deep underwater. This chapter fills the gap: bursts *at* the surface, or just above or
below it, where the fireball touches the sea. Three things happen that don't for high air bursts:

- a shock is driven *directly* into the water;
- a huge *crater* is blown in the water surface;
- the crater collapses and sends out *waves*.

== Scaled depth

Everything here is described by the *scaled burst depth*: the depth (or, if negative, the
height) of the burst divided by the cube root of the yield, in ft/kt#super[1/3]. For 1 Mt the cube root
is 10, so a burst 30 m (98 ft) deep has a scaled depth of about 10 ft/kt#super[1/3]. The simulator uses
this chapter's models from about −10 (just above the water) to +15 (just below).

== How much shock gets into the water: coupling

When the fireball touches the surface, much of its energy blasts upward into the air instead of
into the water. The U.S. military's nuclear weapons effects handbook (EM-1, 1996) expresses this
as a *coupling coefficient* $epsilon$: the fraction of the peak pressure that a fully submerged
burst would produce. The equations are reproduced in a 2004 Defense Threat Reduction Agency report
(Eneva, Stevens & Murphy):

$ P_max = (A thin epsilon) / R^n quad "psi", quad A = 10^4 (217.6)^n $

with $R$ the scaled distance. The exponent $n$ grows for receivers close to the surface,
which accounts for the surface reflection from chapter 1.

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Scaled burst depth*], [*Small yield (< 1 kt)*], [*Large yield (> 20 kt)*]),
  [−10 (just above the water)], [1.6%], [0.14%],
  [0 (at the surface)], [20%], [1.8%],
  [+1], [29%], [22%],
  [+5], [62%], [58%],
  [+15 and deeper], [100%], [100%],
)

So a megaton burst sitting on the sea puts only about *2%* of the shock pressure into the water,
compared with the same burst 45 m down.

*Checking it.* The formula reproduces the coupling values quoted in the report (0.20, 0.162,
0.114 and 0.056 for 1, 5, 10 and 16 kt at the surface). With full coupling it gives about
2,670 psi for Glasstone's 100 kt example, against his "about 2,700 psi". A Soviet test on
27 October 1961, 16 kt exploded 1.1 m above the water at Novaya Zemlya, produced underwater
sound 35 km away consistent with about 4% coupling. The simulator gives 2%: within a factor of 2.

#caution[For large yields, two parts of EM-1's coupling curve (above the water, and deeper than
0.82 ft/kt#super[1/3]) use functions that aren't printed in the report the project could read. The simulator
fills them with its own stand-ins. Reassuringly, the deeper stand-in reaches exactly full
coupling at 15 ft/kt#super[1/3], as EM-1 says it should. The report's own 1961 example also only works if
metres and feet were mixed up, so it isn't a precise test.]

#fig("/output/guide_figures/surface_bursts.png")[Left: coupling of the shock into the water vs
scaled burst depth. Middle: wave height vs distance for 1 Mt in 4,000 m of water. Right: what
happens to a 7 m wave as it approaches a coast.]

== The crater and the column

The explosion blows a bowl-shaped *crater* in the water surface. A fit to chemical-explosive data
(Le Méhauté & Wang 1996) gives, for 1 Mt at the surface, a crater about 1.8 km in radius and
160 m deep. When the 20 kt BAKER test exploded in a lagoon about 60 m deep (1946), it threw up a
column of water about 600 m across and 1.8 km high, lifting roughly a million tons of water
(Glasstone §2.68). As the column fell back it made the *base surge*: a ring of radioactive mist
that rolled outward faster than a mile a minute and was 3½ miles (5.6 km) across after 4 minutes
(§2.73).

#caution[The app scales the BAKER column with the cube root of the yield, but it only *quotes* a height
up to 100 kt. The largest underwater nuclear tests were about 30 kt (BAKER 1946, WIGWAM 1955); scaling
them to megatons (a "25 km column" for 50 Mt) has nothing behind it, and a megaton bomb only tens of
metres down would act more like a burst on the surface anyway. So for bigger bombs the results say the
height is not known. The column is still *drawn* at the scaled size, as an illustration only.]

== Waves

When the crater collapses, it sends out a *train* of waves. Only 2--5% of the yield ends up in
the waves (Glasstone §6.54). Unlike an ordinary single wave, the train spreads out as it goes,
and the biggest wave moves further back in the train with distance (§6.56).

=== Deep water

Glasstone's formula (Eq. 6.119.1, ±35%):

$ H approx (40500 thin W^(0.54)) / R quad "feet" $

where $H$ is the crest-to-trough height, $R$ the distance in feet and $W$ the yield in kt. It
matches the "most probable" column of Le Méhauté & Wang's table *exactly*; for example, 1 Mt gives
55.5 ft at 5 nautical miles. For bursts just below the surface they also give a higher value, the
"upper critical depth" effect, which is 2.25× bigger. The simulator uses that as its upper
estimate.

The waves are long and slow. For 1 Mt the period is about 38 s and the wavelength about 2.3 km
(§6.119). The biggest wave travels at about $g T \/ 4 pi$, so 50 km away it arrives about half an
hour after the burst.

*Surface and above-water bursts* make *smaller* waves, because more energy vents into the air
(Le Méhauté §1.4; Hardtack test reports). No formula exists, so the simulator shows the submerged
value as an upper limit.

=== Shallow water

In shallow water, such as the BAKER lagoon, less energy goes into the waves. Glasstone gives
$H approx 150 d_w W^(0.25) \/ R$ (§6.121). But compared with his own BAKER measurements (94 ft at
330 yards, 9 ft at 4,000 yards; Table 6.57), this formula comes out about 1.6--1.9× too low. The
simulator reports a range that reaches up to the BAKER-matched value, and a test checks this.

== Approaching a coast

In deep water the wave train barely changes. Once the water depth is less than about 1/20 of the
wavelength, the wave slows down, bunches up and grows taller (§6.120). For long waves the height
grows as $"depth"^(-1\/4)$ (*Green's law*). It keeps growing until it is about 0.78 times the
water depth, then *breaks* (Le Méhauté Eq. 1.25).

Flooding of the shore can reach about twice the height of the approaching wave (Glasstone
§2.71). But Le Méhauté & Wang stress that explosion waves are much shorter than tsunamis and
always break offshore; they don't behave like a tsunami.

*Worked example.* 1 Mt, 30 m below the surface, in 4,000 m of water:

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Distance*], [*Wave height (range)*], [*Biggest wave arrives after*]),
  [5 km], [23--71 m], [3 minutes],
  [20 km], [6--18 m], [11 minutes],
  [50 km], [2--7 m], [28 minutes],
  [100 km], [1--3.5 m], [56 minutes],
)

A 7 m wave from 50 km out keeps its height across the deep ocean, starts growing below about
110 m depth, and breaks at about 11--12 m high in about 15 m of water.

#caution[
- Coupling for large weapons has gaps filled by this project's stand-ins (see above).
- Most wave formulas were fitted to *chemical* explosions; the only nuclear wave data come from
  shallow lagoon tests.
- Surface-burst waves have no formula, only an upper estimate.
- The crater size is from chemical-explosive data.
- Near the burst (within about two crater radii) the waves are breaking and turbulent, and the
  formulas don't apply.
- Bubble pulsations, the base surge's radioactivity and the effect of the sea floor shape aren't
  modelled.
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`near_surface_shock.coupling`], [EM-1 coupling coefficient],
  [`near_surface_shock.compute`], [peak pressure at a receiver for a near-surface burst],
  [`water_waves.compute`], [wave height range, period, wavelength, arrival times],
  [`water_waves.crater_ft`], [crater radius and depth],
  [`water_waves.approach_coast`], [growth and breaking near the shore],
  [`scripts/plot_surface_bursts.py`], [the plots above],
)

The biology reports (chapter 6) now use the coupling model for bursts near the surface.

#questions(
  [Why does a burst exactly at the surface put so little shock into the water?],
  [What is the scaled depth of a 1 Mt burst 30 m below the surface?],
  [Why are explosion waves described as a "train" rather than a single wave?],
  [Why doesn't a wave grow while it crosses deep ocean, but grows quickly near the coast?],
  [At roughly what height does a wave break in 10 m of water?],
)

#answers(
  [Most of the fireball's energy vents upward into the air; only a small part pushes into the water. For large weapons only about 2% of the full shock pressure couples in.],
  [30 m = 98 ft; divided by $1000^(1\/3) = 10$ gives about 10 ft/kt#super[1/3].],
  [The collapsing crater excites waves of many lengths, which travel at different speeds and spread apart into a sequence.],
  [In deep water the wave doesn't "feel" the bottom. Once the depth is a small fraction of the wavelength, the wave slows down and its energy is squeezed into less water, so it grows.],
  [About 0.78 × 10 m ≈ 8 m.],
)
