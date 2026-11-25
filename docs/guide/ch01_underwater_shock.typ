#import "template.typ": *

= The underwater shock wave

_Simulator section 1. Code: `src/nukesim/effects/underwater_shock.py`._

== What happens in the first instant

When a nuclear weapon detonates underwater, its energy is released in less than a
millionth of a second into a very small volume. The surrounding water is heated to
enormous temperatures and turned into a ball of extremely hot, compressed gas and
steam: the *bubble*, which gets its own chapter later.

That sudden expansion slams into the surrounding water and launches a *shock wave*: a
thin front of suddenly raised pressure that races outward in all directions
(Glasstone & Dolan 1977, sections 2.63--2.89).

#keyidea[A shock wave is not water flowing outward like a current. It's a _pressure
disturbance_ passed from one bit of water to the next. The water itself only moves a
small distance as it passes, much like a "stadium wave" in a crowd moves around the
stadium while each person stays in their seat.]

== Why water carries shocks so well

Water is very hard to compress. Because of that, pressure waves travel fast in it:
about 1,500 m/s, compared with about 340 m/s in air. Water also loses very little
energy as the wave passes through it, so shocks stay dangerous over long distances.
That's why underwater explosions are especially destructive to ships, which feel it
through their hulls, and to marine life.

#analogy[Push one end of a long steel rod and the other end moves almost instantly. Push
one end of a long spring and the push arrives slowly and weakly. Water behaves much more
like the steel rod than like air does.]

== The four numbers that describe a shock

The simulator describes the shock at each receiver with four main quantities.

=== Peak overpressure, $P_m$

The highest pressure above ambient that the receiver feels, the moment the shock front
arrives. The pressure jumps up almost instantaneously, which is what makes it a "shock".

=== Time constant, $theta$

After the peak, the pressure decays roughly exponentially (see chapter 0):

$ P(t) = P_m e^(-(t - t_a) \/ theta) quad "for" t >= t_a $ <eq-history>

where $t_a$ is the *arrival time*, when the shock reaches the receiver. A bigger
$theta$ means a longer, "fatter" pulse. Glasstone & Dolan (§6.116) note that the
pressure "does not [decay exponentially] except at early times", so this is an
approximation that's best near the peak.

=== Impulse, $I$

The *impulse* is the area under the pressure--time curve, or "how hard, for how long".
For a pure exponential pulse the area is simply $P_m theta$. The simulator uses a
measured formula instead (below), which also accounts for the slower tail.

#keyidea[Peak pressure and impulse cause different kinds of harm. A very high but very
short spike can be survivable where a lower but longer push is not, and the reverse is
also possible. Injury models for fish and people (a later chapter) use both.]

=== Energy flux density, $E$

How much shock energy passes through each square metre, in J/m². For a sound-like wave,
the energy carried is $P^2 \/ (rho c)$ per unit time, where $rho c$ is the water's
*acoustic impedance* (density times sound speed, about $1.5 times 10^6$ kg/(m² s) for
seawater). Adding that up over the exponential pulse gives

$ E = (P_m^2 theta) / (2 rho c) $

This is used later for damage to ship hulls (Glasstone & Dolan §6.65).

== The similitude equations

For decades, navies set off chemical explosives underwater and measured the pressure at
many distances. Cole (1948) summarised the results as *similitude equations*: power laws
in the *scaled range*

$ lambda = R / W^(1\/3) $

where $R$ is the distance in feet and $W$ the charge weight in pounds of TNT. For TNT
(quoted in USACE 1991, Eqs. 1--4):

$ P_m &= 21,600 thin lambda^(-1.13) quad &"psi" \
  theta &= 6.0 times 10^(-5) thin W^(1\/3) lambda^(0.18) quad &"s" \
  I &= 1.46 thin W^(1\/3) lambda^(-0.89) quad &"psi·s" $

#symbols(
  [$P_m$], [peak overpressure], [psi (converted to Pa)],
  [$theta$], [time constant: time to fall to 37% of peak], [s],
  [$I$], [impulse: area under the pressure curve], [psi·s],
  [$W$], [explosive weight, TNT equivalent], [lb],
  [$R$], [slant range from the charge], [ft],
  [$lambda$], [scaled range $R \/ W^(1\/3)$], [ft/lb#super[1/3]],
)

=== Reading the equations

- $P_m prop lambda^(-1.13)$: pressure falls a bit faster than "one over distance".
  Doubling the distance cuts the peak to $2^(-1.13) approx 46%$.
- $theta$ grows with both $W$ and distance: big explosions and far-away receivers get
  longer pulses (Glasstone & Dolan §6.116 say the same).
- Everything depends on distance only through $lambda$. That's *cube-root scaling*: a
  1,000-times bigger explosion gives the same peak pressure 10 times farther away.

*Worked example.* 1 lb of TNT, 10 ft away: $lambda = 10$, so
$P_m = 21,600 times 10^(-1.13) approx 1,600$ psi (about 11 MPa), $theta approx 0.09$ ms,
and $I approx 0.19$ psi·s.

#caution[USACE (1991) says these formulas apply where pressure is below about 30,000 psi
(about 207 MPa). Closer in, the water behaves very non-linearly. The simulator prints a
warning if you place a receiver that close.]

== From TNT to nuclear

A nuclear burst is not just a very large TNT charge. A much larger share of its energy
goes into heating and vaporising water and into radiation, so less goes into the shock.
We capture this with one number, the *nuclear shock factor* $f$:

$ W_"effective" = f times W_"TNT-equivalent yield" $

The value of $f$ isn't guessed. Glasstone & Dolan (§6.41) state that "the peak
overpressure at 3,000 feet from a 100-kiloton burst in deep water is about 2,700 pounds
per square inch". Setting the TNT formula equal to that and solving gives

$ f approx 0.49 $

So, for its water shock, 1 kt of nuclear yield behaves like about 0.49 kt of TNT.

*Worked example.* 20 kt at 1,000 m: the effective TNT weight is
$0.49 times 20 times 2.2 times 10^6 approx 2.2 times 10^7$ lb. The formulas give
$P_m approx 9.2$ MPa (about 1,330 psi, or roughly 90 atmospheres) and $theta approx 26$ ms.

#fig("/output/guide_figures/pressure_vs_range.png", width: 85%)[Free-field peak
pressure vs distance for several yields. The lines are parallel because they all follow
the same power law; cube-root scaling shifts them sideways.]

#caution[$f$ is based on a *single* published data point. Glasstone & Dolan's Figure
6.115 has a full curve that should be used to check (and maybe refine) the whole
pressure-vs-distance relationship. That's planned. Treat nuclear pressures from the
simulator as reasonable estimates, roughly ±30%, until then.]

== The surface cutoff

The air above the water is very easy to compress compared with water. When the shock
reaches the surface it can't push the air hard, so it *reflects back down as a pull*: a
wave of negative overpressure (tension). A receiver near the surface first gets the
push, then shortly afterwards the pull arrives and cancels it. The pulse is "cut off"
(Glasstone & Dolan §6.43--6.45).

=== The image-source trick

There's a neat way to compute this. The reflected wave behaves exactly as if it came from
an *imaginary mirror-image burst*, the same distance _above_ the surface, that produces
negative pressure. So the simulator computes

$ P_("total") (t) = P_("direct") (t) - P_("image") (t) $

#fig("/output/guide_figures/image_source.png", width: 80%)[The reflected path is longer
than the direct path, so the "pull" arrives slightly later. The closer the receiver is to
the surface, the smaller that delay.]

The delay between the push and the pull is

$ Delta t = (R_"image" - R_"direct") / c $

For a receiver just below the surface, $Delta t$ is a fraction of a millisecond, much
shorter than $theta$, so most of the impulse is cancelled.

#fig("/output/guide_figures/cutoff_depths.png", width: 85%)[The same 20 kt burst seen
by receivers at different depths. Near the surface the pulse is chopped off almost
instantly. Deep receivers feel much more of it.]

=== Cavitation

The "pull" can't be stronger than the water's ability to resist tearing apart. When
absolute pressure would drop below roughly zero, the water *cavitates*: it forms vapour
bubbles. The simulator caps the total pressure so absolute pressure never goes below
zero. This is a simple stand-in. Real cavitation zones are complicated, and when the
bubbles collapse they can produce extra pressure pulses.

#caution[The image-source model is a straight-line (acoustic) approximation. Glasstone &
Dolan (§6.46) describe an "anomalous region" just below the surface where strong shocks
behave non-linearly and the cutoff is softer. So for receivers within a few metres of the
surface, the simulator probably *underestimates* the impulse. This will be improved.]

== What this model leaves out (for now)

- *Sea-floor reflections.* In shallow water the shock also bounces off the bottom. USACE
  (1991) says this can roughly double peak pressure and raise impulse by about 2.5×.
  BAKER was in a lagoon only about 60 m deep, so this matters there.
- *Bubble pulses.* The gas bubble expands and contracts several times, sending out more,
  weaker pressure pulses that can carry substantial impulse (the next section of the simulator).
- *Changing sound speed.* Real oceans have layers of different temperature, which bend
  sound paths. The data used here assume uniform ("isovelocity") water.

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`tnt_peak_pressure_psi` etc.], [the TNT similitude formulas, in the original units],
  [`NUCLEAR_SHOCK_TNT_FACTOR`], [$f$, solved from Glasstone §6.41],
  [`peak_pressure_pa`, `time_constant_s`, `impulse_pa_s`], [nuclear versions, in SI units],
  [`pressure_history`], [$P(t)$ at a receiver, with the surface cutoff and cavitation cap],
  [`compute`], [everything for one receiver, plus warnings],
)

#questions(
  [Why do shock waves travel about 4--5 times faster in water than in air?],
  [Using cube-root scaling: a 1 kt burst produces some peak pressure at 100 m. At what distance does a 1,000 kt (1 Mt) burst produce the same peak pressure?],
  [By roughly what factor does the peak pressure fall if you double your distance from the burst?],
  [Why is the nuclear shock factor $f$ less than 1?],
  [Two fish are 500 m from a burst, one at 3 m depth and one at 150 m depth. Which experiences the larger impulse, and why?],
  [Why does the surface reflection produce a _pull_ (negative pressure) rather than a second push?],
)

#answers(
  [Water is far harder to compress than air, and pressure waves travel faster in stiffer materials.],
  [1,000 = $10^3$, so the distance scales by $1000^(1\/3) = 10$: about 1,000 m.],
  [$2^(-1.13) approx 0.46$, so to a bit less than half.],
  [Much of a nuclear burst's energy goes into heating and vaporising water and into radiation, rather than the shock.],
  [The deep fish. For the shallow fish, the surface-reflected pull arrives a fraction of a millisecond after the shock and cancels most of it.],
  [Air is much softer (easier to compress) than water, so it can't push back. The surface moves freely, and the reflected wave comes back inverted.],
)
