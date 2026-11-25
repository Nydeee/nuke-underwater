#import "template.typ": *

= The basics you need first

This chapter covers the ideas every later chapter assumes: units, pressure, energy,
very large and very small numbers, and how to read the kinds of equations and graphs
the simulator uses. If something here feels familiar, skim it. If it doesn't, take
your time. Everything else is built on it.

== What the simulator is (and is not)

The simulator answers questions like: _"A 20-kiloton weapon explodes 500 metres
above the sea. What does a fish 1 kilometre away, 10 metres below the surface, experience?"_

It does *not* simulate every water molecule. Even supercomputers cannot do that for a
whole explosion. It uses *models*: equations fitted to measurements from real tests,
plus established physics. A model is a simplified description that is good enough
for a purpose and has known limits. Every model in the simulator says where its
numbers come from and when it stops being trustworthy.

#keyidea[A simulation is only as good as its models and the data behind them. This is
why every number in the code points to a published source, and why every chapter of
this guide has a "How sure are we?" box.]

== Units and the SI system

Scientists measure with the *SI system* (metric). The simulator works in SI
internally:

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Quantity*], [*SI unit*], [*Symbol*]),
  [length / distance], [metre], [m],
  [time], [second], [s],
  [mass], [kilogram], [kg],
  [energy], [joule], [J],
  [pressure], [pascal], [Pa],
)

Many of the original sources on underwater explosions are American documents from the
1940s--1970s that use *feet*, *pounds* and *psi* (pounds per square inch). The
simulator converts those to SI only at the edge of each formula, using exact
conversion factors (1 ft = 0.3048 m exactly, 1 psi ≈ 6,895 Pa).

=== Prefixes

Prefixes scale a unit by powers of ten:

#table(
  columns: (auto, auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Prefix*], [*Symbol*], [*Multiplier*], [*Example*]),
  [milli], [m], [$10^(-3)$ = 0.001], [1 ms = one thousandth of a second],
  [kilo], [k], [$10^3$ = 1,000], [1 kPa = 1,000 Pa],
  [mega], [M], [$10^6$ = 1,000,000], [1 MPa = 1,000,000 Pa],
  [giga], [G], [$10^9$], [],
  [tera], [T], [$10^12$], [],
)

=== Scientific notation

Very large and very small numbers are written as a number times a power of ten.
For example, $4.184 times 10^12$ means 4.184 with the decimal point moved 12 places
right: 4,184,000,000,000. And $6.0 times 10^(-5)$ means 0.000060.

== Pressure

*Pressure* is force spread over an area: $P = F / A$. One pascal is one newton of
force on one square metre, which is tiny. Air pressure at sea level is about
101,325 Pa, also called *1 atmosphere* (atm), or about 14.7 psi.

#analogy[A newton is roughly the weight of a small apple. One pascal is that apple's
weight spread over a whole square metre. That's why everyday pressures need thousands of
pascals (kPa) and explosion pressures need millions (MPa).]

=== Pressure under water

Water is heavy, so pressure increases with depth. Every 10 metres of seawater adds about
one more atmosphere:

$ P_"ambient" = P_"air" + rho g d $

where $rho$ (the Greek letter "rho") is the water's density (about 1,025 kg/m³ for
seawater), $g$ = 9.81 m/s² is gravity, and $d$ is the depth. At 10 m depth the total is
about 2 atm, and at 100 m about 11 atm.

=== Absolute pressure vs overpressure

- *Absolute pressure* is the total pressure, counted from a perfect vacuum.
- *Overpressure* is the pressure *above* the normal (ambient) pressure. A shock wave is
  described by its overpressure: how much it adds on top of what was already there.

This difference matters later. An overpressure can be _negative_ (a pull or suction),
but absolute pressure can't really go below zero. Water that is pulled too hard tears
apart into vapour bubbles, which is called *cavitation*.

== Energy and explosive yield

*Energy* is measured in joules. The energy of nuclear weapons is described by comparison
with the chemical explosive TNT:

- 1 *kiloton* (kt) = the energy of 1,000 tonnes of TNT, defined as exactly
  $4.184 times 10^12$ J.
- 1 *megaton* (Mt) = 1,000 kt.

This number is the *yield*. The Hiroshima bomb was about 15 kt, and the 1946 BAKER
underwater test at Bikini was about 20 kt.

#keyidea[Yield tells you the *total* energy released. It does not tell you how that
energy is split between heat, light, radiation and pressure waves. That split depends on
where the weapon explodes (in air, at the surface, or underwater), and it is the main
reason a nuclear explosion is not exactly the same as the "equivalent" amount of TNT.]

== Powers, roots and power laws

Many explosion formulas look like this:

$ y = C x^a $

This is a *power law*. $C$ is a constant and $a$ is the *exponent*. Some important
cases:

- $a = 2$: double $x$ and $y$ becomes 4 times bigger.
- $a = -1$: double $x$ and $y$ halves.
- $a = 1/3$: the *cube root*. Multiply $x$ by 1,000 and $y$ becomes only 10 times bigger,
  because $10 times 10 times 10 = 1,000$.

The cube root appears constantly in explosion physics. An explosion's energy fills a
_volume_, and volume grows as length cubed. So to reach the same effect 10 times farther
away, you need about 1,000 times the energy. This is called *cube-root scaling*.

#analogy[Inflate a balloon to twice the width and it holds 8 times the air
($2^3 = 8$). Lengths and volumes don't grow at the same rate.]

== Logarithmic graphs

When values span many powers of ten, ordinary graphs fail: everything interesting gets
squashed into a corner. *Logarithmic axes* space 1, 10, 100, 1,000 evenly instead.

#fig("/output/guide_figures/log_vs_linear.png")[The same data (peak shock pressure of
a 20 kt underwater burst) on ordinary and logarithmic axes. On log--log axes a power
law becomes a straight line, and its slope is the exponent.]

#keyidea[On a log--log graph, a straight line means a power law. The steeper the line,
the bigger the exponent. You'll see this on almost every graph in this guide.]

== Exponential decay

Some things shrink by the same _fraction_ in each equal step of time. A shock wave's
pressure, after it passes, is one example:

$ P(t) = P_m e^(-t \/ theta) $

Here $e approx 2.718$ is a special mathematical constant. $theta$ ("theta") is the
*time constant*: after one $theta$ the pressure has fallen to $1 \/ e approx 37%$ of its
peak, after two $theta$ to about 14%, and after three to about 5%.

#fig("/output/guide_figures/exponential_decay.png", width: 80%)[Exponential decay. Each
time constant $theta$ multiplies the value by about 0.37.]

== How to read an equation

When you meet a new equation:

+ *Find out what each symbol means and what its units are.* Every chapter has symbol
  tables for this.
+ *Ask what happens when one input grows.* Does the output go up or down? How fast?
+ *Plug in one simple example.* The worked examples do this.
+ *Ask where it comes from and when it fails.* Is it fundamental physics or a fit to
  data? What range of conditions was it fitted to?

== Models, data and uncertainty

There have been only a handful of nuclear explosions underwater, so most of what we know
comes from a few tests (such as BAKER in 1946 and WIGWAM in 1955) plus many experiments
with ordinary explosives. Results from the small chemical tests are "scaled up" to
nuclear sizes using laws like cube-root scaling.

#caution[Expect uncertainties of tens of percent, sometimes a factor of 2, in many
results. A good simulator tells you this instead of hiding it behind precise-looking
numbers. The simulator will eventually show ranges (uncertainty bands) instead of single
values.]

== The simulator's coordinates

- $x$, $y$: horizontal position in metres. The burst is always at $x = y = 0$.
- $z$: height relative to the water surface. *Negative $z$ means underwater.*
  A fish at $z = -3$ is 3 m below the surface.
- *Slant range*: the straight-line distance from the burst to a point, including any
  depth difference.

#questions(
  [How many pascals are in 20 MPa? About how many atmospheres is that?],
  [What is the total (absolute) pressure 30 m below the surface of the sea, in atmospheres?],
  [If $y = C x^(1\/3)$ and $x$ grows by a factor of 8, by what factor does $y$ grow?],
  [A pressure decays exponentially with $theta$ = 20 ms. Roughly what fraction of the peak remains after 40 ms?],
  [On a log--log graph, two straight lines have slopes $-1$ and $-2$. Which quantity falls off faster with distance?],
)

#answers(
  [20,000,000 Pa; divided by 101,325 Pa/atm that is about 197 atm.],
  [About 1 + 3 = 4 atm (1 atm of air plus about 1 atm per 10 m of seawater).],
  [$8^(1\/3) = 2$, so $y$ doubles.],
  [40 ms is $2 theta$, so about $e^(-2) approx 14%$.],
  [The one with slope $-2$: doubling the distance cuts it to a quarter, not a half.],
)
