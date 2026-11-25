#import "template.typ": *

= Air blast over water, and how it gets in

_Simulator section 2. Code: `src/nukesim/effects/air_blast.py` and `air_to_water.py`._

This is the simulator's main scenario: a weapon explodes *above* the sea, and we want to
know what reaches the fish, divers and swimmers below. The answer turns out to be
surprising. Most of the blast bounces off the water, but what does get in depends
strongly on _where_ you are and _how deep_.

== What happens above the water

In the first millionths of a second, the weapon's energy heats the surrounding air into
a glowing *fireball*. Its rapid expansion drives a *blast wave* (a shock wave in air)
outward in every direction. The blast wave races ahead of the fireball, reaches the water
surface, reflects, and spreads out across it.

The simulator distinguishes three kinds of burst by height:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Burst type*], [*Meaning (for 20 kt)*]),
  [Air burst], [The fireball never touches the water. Above about 180 m for 20 kt.],
  [Low air burst], [The fireball reaches the water, vaporising some of it. The simulator flags this.],
  [Contact burst], [Within a few metres of the surface (about 3.7 m for 20 kt).],
)

The "fireball touches the water" height uses $H approx 180 W^(0.4)$ feet (Glasstone &
Dolan Eq. 2.128.1, ±30%). Glasstone gives this as the height below which local fallout
becomes serious, which happens _because_ the fireball reaches the surface. Using it as the
contact height is a common interpretation, not Glasstone's exact wording.

== The blast wave in air

At a point on the water, the blast wave is described by the same kinds of quantities as
the underwater shock in chapter 1:

- *Peak overpressure*: the sudden jump when the front arrives.
- *Arrival time*: how long after the explosion the front gets there.
- *Positive-phase duration* $D$: how long the pressure stays above normal.
- *Impulse*: the area under the pressure curve.

After the positive phase there is a weaker, longer *negative phase* where pressure dips
slightly below normal (suction). The simulator doesn't include it yet (see "How sure are
we?" below).

=== The Friedlander shape

The pressure at a point rises instantly, then falls back to normal over the duration $D$.
The standard way to describe this is the *Friedlander waveform* (Friedlander 1946):

$ p(t) = P (1 - t / D) e^(-b t \/ D) $

$P$ is the peak and $b$ controls how quickly it sags. The simulator picks $b$ so that the
area under the curve equals the impulse from Brode's formula (below).

== Reflection and the Mach stem

When the blast wave hits the water it reflects, and the reflected wave adds to the
incoming one. Right under the burst, the pressure on the surface is between *2 and 8
times* the incoming pressure: about 2× for weak blasts and up to 8× for very strong ones
(Glasstone & Dolan Eq. 3.56.2).

Farther out, the reflected wave catches up with the incoming one and they merge into a
single, stronger front that stands upright on the surface: the *Mach stem*.

#analogy[Shout at a wall from far away and the echo is clearly separate. Shout right next to
it and the echo and your voice arrive together and sound louder. The Mach stem is the blast
wave's version of that merging.]

Water is very flat and very hard to push, so it is close to an *ideal* reflecting surface.
Glasstone & Dolan (Table 3.83) put water among the "nearly ideal" surfaces.

== Brode's formulas

Harold Brode (1987) fitted formulas to many computer simulations and test results. The
simplest is his free-air formula (Eq. 33), for a burst far from any surface:

$ Delta P_s approx 2/r + 3/r^(1.5) + 1.6/r^3 [1 + (105 (10 r)^4) / (1 + 12920 (10 r)^8)] quad "psi" $

Here $r$ is the *scaled* distance in kilofeet per cube-root kiloton, the same cube-root
scaling as in chapter 0. For example, at $r = 1$ (1,000 ft from a 1 kt burst) it gives
about 6.6 psi.

For bursts at a height $H$ above a surface, the simulator uses Brode's *height-of-burst*
fit (Eq. 62). It's long, with about 40 coefficients, but it captures the reflection and the
Mach stem. Brode reports agreement with detailed calculations "in most cases … within 20
percent". The simulator also uses Brode's fits for:

- arrival time (Eq. 40);
- positive-phase duration (Eq. 45);
- impulse (Eq. 48).

For the last two it uses Brode's rule of doubling the yield to account for the surface.

*Worked example.* 20 kt at 500 m above the water:
- *Directly below (ground zero):* about 380 kPa (55 psi), arriving after 0.54 s and lasting about 0.25 s.
- *1 km away:* about 79 kPa (11 psi), arriving after 2.0 s and lasting about 0.49 s.

#fig("/output/guide_figures/surface_overpressure.png", width: 85%)[Peak overpressure on
the water surface vs distance, for a 20 kt burst at different heights (Brode Eq. 62). Low
bursts are fiercer close in; higher bursts spread moderate pressure further.]

== Crossing into the water

=== Most of the energy bounces off

Air and water have hugely different acoustic impedance ($rho c$, chapter 1): water's is
about 3,700 times larger. When a pressure wave in air hits water, about *99.8% of its
energy is reflected* (Sparrow 1995).

But the *pressure* still gets in. Pressure must be the same on both sides of the surface
(Sparrow 1995), so just below the surface the water feels the full surface overpressure.
It's like pushing on a brick wall: the wall feels your push fully, but it barely moves, so
almost no energy goes into it.

#keyidea[Energy mostly reflects, but pressure is felt fully at the surface. The question is
how that pressure behaves as you go deeper.]

=== The critical angle

Sound travels about 4.4 times faster in water than in air. By Snell's law (the rule that
bends light entering a glass of water), a sound wave from the air can only enter the
water as a travelling wave if it arrives within about *13.2°* of straight down (Sparrow
1995). Beyond that "critical angle", no travelling wave enters the water.

== Trace speed: the key idea

There's a more intuitive way to see this. Watch the blast front sweep outward across the
water surface. The speed at which it sweeps across is the *trace speed* $V$.

- *Right under the burst*, the front hits a wide patch of water almost at once, so $V$ is
  enormous.
- *Farther out*, the front meets the water at a glancing angle and sweeps across at
  roughly the speed of sound in air (about 340 m/s).

#analogy[Snap scissors shut: the point where the blades cross runs along the blades much
faster than the blades themselves move. Near ground zero the blast "crossing point" behaves
the same way.]

What happens in the water depends on how $V$ compares with sound in water ($c approx$
1,500 m/s):

- *$V > c$, the propagating zone.* The pressure pattern outruns sound in water, so it
  launches a real wave downward. The pulse travels down with almost no loss.
- *$V < c$, the evanescent zone.* The water "has time" to get out of the way sideways. The
  pressure *fades with depth*. Sharp, fast changes fade within a few metres. Slow pushes
  reach deeper but get smeared out.

For 20 kt at 500 m, the propagating zone only reaches about *170 m* from ground zero
(about a third of the burst height). Everywhere else, which is almost all of the area,
is evanescent.

#fig("/output/guide_figures/trace_speed.png", width: 80%)[Trace speed of the blast front
across the water. Only inside the red line (where it exceeds 1,500 m/s) does the pulse
travel straight down into the water.]

== The maths in one formula

Split the surface pressure history into frequencies $omega$ (a *Fourier transform*, like
splitting music into notes). Each frequency is carried down to depth $z$ by

$ "propagating:" quad e^(-i omega z sqrt(1\/c^2 - 1\/V^2)) wide "evanescent:" quad e^(-|omega| z sqrt(1\/V^2 - 1\/c^2)) $

The first is just a time delay. In the second, the damping grows with $omega$, so high
frequencies (sharp spikes) die out faster than low ones (slow pushes). That's why the
pulse gets smoother and more spread out with depth.

This is the theory of *sonic booms* entering the ocean (Sawyers 1968). It has been checked
in experiments and in the field: booms from real jets faded to nothing by 40--50 m depth,
in good agreement with theory (Sohn et al. 2000). The simulator's tests check that its
calculation reproduces Sawyers' exact mathematical solution to better than 1%.

== Results

#fig("/output/guide_figures/water_map.png")[Left: peak pressure in the water under a 20 kt
burst at 500 m. Near ground zero the pressure goes straight down; elsewhere it fades
with depth. Right: pressure histories 1 km from ground zero. The deeper the receiver, the
lower and slower the pulse.]

*Worked example.* 1 km from ground zero under a 20 kt burst at 500 m, the surface feels 79
kPa. At 10 m depth the peak is 47 kPa (60%), at 50 m it is 23 kPa (29%), and at 150 m it is
10 kPa (13%).

Notice in the figure that deep receivers start feeling pressure slightly _before_ the
blast reaches the surface directly above them. That's real physics: a deep point "feels"
a wide patch of surface, including parts closer to ground zero that were hit earlier.

#caution[
- *No nuclear measurements.* No public measurements exist of underwater pressure beneath a
  nuclear air burst. The into-water model is well-tested sonic-boom physics, but applying it
  to a nuclear blast front is this project's own extension.
- *Brode's fits* are within about 20% of detailed calculations. Brode notes that real test
  data scatter much more than that.
- *No negative phase yet.* Deep in the evanescent zone, the model's impulse is an
  *overestimate*, because the suction phase would partly cancel the slow push that reaches
  deep water.
- *Spreading.* In the propagating zone the model ignores how the wave spreads out going
  down, so deep values there are upper estimates.
- *Close to a low burst*, the fireball may touch the water. The simulator flags this rather
  than trusting the numbers.
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`air_blast.brode_hob_psi`], [Brode Eq. 62, peak pressure at the surface],
  [`air_blast.surface_blast`], [everything at one surface point: peak, timing, duration, impulse, trace speed],
  [`air_to_water.transmit_waveform`], [carries a surface pressure history down to a depth],
  [`air_to_water.compute`], [full result for a receiver in the water, with warnings],
  [`scripts/plot_air_blast_water.py`], [the pressure map and histories],
)

#questions(
  [Why does about 99.8% of the blast's energy bounce off the water, yet a fish just below the surface still feels the full pressure?],
  [Right under a burst, the reflected pressure can be up to 8 times the incoming pressure. When is it closer to 2 times?],
  [What is the "trace speed", and why is it very large right under the burst?],
  [A fish is 2 km from ground zero, 30 m deep. Is it in the propagating or the evanescent zone? What does that mean for the pulse it feels?],
  [Why do sharp spikes fade faster with depth than slow pushes?],
  [Why is the simulator's impulse deep underwater probably too high?],
)

#answers(
  [Pressure must be equal on both sides of the surface, so the water feels it fully; but water is so stiff that it hardly moves, so very little energy is transferred.],
  [For weak blast waves (low overpressure); the factor rises toward 8 only for very strong shocks.],
  [The speed the blast front sweeps across the water. Under the burst the front hits a wide area almost simultaneously, so the sweep speed is enormous.],
  [Evanescent (far from ground zero the trace speed is near 340 m/s, well below 1,500 m/s). The pressure is lower than at the surface and the pulse is smoother and longer.],
  [In the evanescent zone the damping is $e^(-|omega| z dots)$: the higher the frequency $omega$, the faster it decays with depth $z$.],
  [The model has no negative (suction) phase, which would partly cancel the slow pressure that reaches deep water.],
)
