#import "template.typ": *

= What it does to living things: fallout over weeks

_Simulator section 6b. Code: `src/nukesim/biology/uptake.py` and `long_term.py`._

Chapter 4 showed that fallout landing on the sea sinks and mixes into the top 50--60 m. This
chapter asks what that means for the fish living there over the following weeks. There are
two ways they're exposed:

- *from the outside*: gamma rays from the radioactive water around them (chapter 4);
- *from the inside*: radioactive elements the fish absorbs from the water and stores in its
  body.

== Which radioactive elements?

When a heavy nucleus splits, it breaks into two lighter ones. Hundreds of different products
are possible, each with a known probability, its *fission yield*. A kiloton of fission splits
$1.45 times 10^23$ nuclei (Glasstone Table 1.45), so the amount of each product follows
directly. The simulator tracks ten of the most important, using yields from the European
JEFF-3.1.1 nuclear data library:

#table(
  columns: (1.4fr, 0.8fr, 0.7fr, 1.6fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Element*], [*Half-life*], [*Fish uptake (CF)*], [*Why it matters*]),
  [iodine-131], [8 days], [9], [very abundant in the first weeks],
  [barium-140], [12.8 days], [10], [strong gamma emitter early on],
  [caesium-137], [30 years], [100], [long-lived; fish concentrate it strongly],
  [strontium-90], [29 years], [3], [long-lived; goes to bone],
  [cerium-144], [285 days], [50], [medium-lived],
  [zirconium-95, ruthenium-103/106, strontium-89, cerium-141], [weeks to a year], [2--50], [],
)

*Checking it.* Glasstone (§9.141) says one megaton of fission makes "about 0.11 megacurie of
strontium-90". The simulator's yields give 0.09 to 0.16, depending on whether uranium-238 or
uranium-235 is splitting, which neatly brackets Glasstone's figure.

== How fish take up radioactivity

Fish absorb elements from the water across their gills and through their food. The IAEA (TRS-422)
summarises this with a *concentration factor* (CF):

$ "CF" = ("Bq per kg of fish") / ("Bq per litre of seawater") $

Fish concentrate *caesium* about 100× (chemically it behaves like potassium, which cells
collect). They concentrate *strontium* only about 3×, because seawater is already full of
calcium, which strontium imitates. The IAEA warns these factors are uncertain by up to 10×
either way.

#keyidea[Two elements with the same amount in the water can give very different doses to a
fish. What matters is how strongly the fish collects each one, and how energetic its radiation is.]

== Dose from the inside

The ICRP publishes *dose coefficients* for "reference animals", including a reference
flatfish: the dose rate per becquerel per kilogram inside the body. Multiplying everything
together:

$ "internal dose rate" = sum_"elements" "DC" times "CF" times "water concentration" $

#caution[The dose coefficients come from the ICRP's 2016 public-consultation draft (which became
Publication 136); the draft says "do not reference". They match a published sanity check
(about 2 µGy/h for 10,000 Bq/kg of caesium-137 in fish), but the final values should be
checked.]

== Dose levels that matter for fish

Fish are much more radiation-tolerant than people, but long exposures affect *reproduction*
first. The levels used:

- *10 µGy/h*: the ERICA screening level. Below this, no effects are expected.
- *42--417 µGy/h (1--10 mGy per day)*: the ICRP "consideration" band for fish, where
  "possible reduced reproductive success" begins.
- *100--1,000 µGy/h*: reduced fertility and delayed spawning seen in fish (UNSCEAR 2008).
- *400 µGy/h*: below this, populations shouldn't be harmed (UNSCEAR 1996).
- Accumulated doses are compared with the lethal doses from chapter 6: about 0.9 Gy for
  embryos, and 10--55 Gy for juvenile fish.

These benchmarks come from a Swiss nuclear-safety report (ENSI 2018) that summarises the
original ICRP and UNSCEAR documents.

#fig("/output/guide_figures/long_term_fish.png")[A fish 10 m deep, 50 km downwind of a 1 Mt
burst on the sea. Left: dose rate from the water around it and from elements absorbed into it,
with the benchmark levels. Right: radioactivity in its flesh.]

== Example

1 Mt surface burst, fish 10 m deep, 50 km downwind (fallout arrives after about 2 hours):

- At first the dose rate is high, about 15,000--21,000 µGy/h, almost all from the water
  around it.
- It drops quickly as the short-lived elements decay and the fallout mixes deeper.
- After about *3 days*, elements *inside* the fish become the main source.
- The fish spends about *27 days* above the ICRP level where reproduction may suffer.
- Over 60 days it receives about *0.08--0.12 Gy*: well below lethal for adults, but enough to
  matter for eggs and larvae in the most contaminated water.
- Its flesh contains about *1,000 Bq/kg of caesium-137* and, early on, around *70,000 Bq/kg of
  iodine-131*.

A person on a boat at the same spot would receive about 0.02--0.03 Gy over the first week:
no radiation sickness, though not trivial.

#caution[
- *Upper estimate inside the fish*: the simulator assumes fish match the water instantly. Really
  it takes days to weeks.
- *Fractionation is ignored*. Caesium and strontium come from gaseous parents (xenon,
  krypton), so they are depleted in local fallout (Glasstone §9.14).
- *No sideways dilution*: currents spread contamination and lower concentrations over days to
  weeks, so long-term values are too high. This matters most for caesium-137, which would
  otherwise appear to stay at a constant level for years.
- *Only ten elements* are counted in the internal dose; the rest of the fission products
  are ignored there. They are included in the external dose from chapter 4.
- *Seawater made radioactive by neutrons* (sodium-24) is still missing (chapter 4).
- The *people* comparison uses Glasstone's acute dose bands. A dose spread over a week is less
  harmful than the same dose at once, so this is pessimistic.
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`biology/uptake.py`], [the ten radioactive elements: yields, half-lives, CFs, dose coefficients],
  [`biology/long_term.py`], [`assess_long_term(burst, receiver)`: dose over weeks for fish or people],
  [`scripts/plot_long_term.py`], [the plots above],
)

#questions(
  [Why does iodine-131 dominate early on, but caesium-137 matter for years?],
  [A fish lives in water with the same number of becquerels of caesium-137 and strontium-90 per litre. Which gives it more internal dose, and why?],
  [Why does the internal dose eventually exceed the dose from the surrounding water?],
  [What does the ICRP "1--10 mGy per day" band for fish mean?],
  [Give two reasons the simulator's fish doses are probably too high after a few weeks.],
)

#answers(
  [Iodine-131 is produced in large amounts and decays quickly (8-day half-life), so it is very radioactive at first and soon gone. Caesium-137 decays slowly (30 years), so it lingers.],
  [Caesium-137: fish concentrate caesium about 100× but strontium only about 3×. (Strontium-90's dose coefficient is higher, but not by enough to make up for that.)],
  [The external dose comes largely from short-lived gamma emitters that decay quickly, while the fish keeps concentrating longer-lived elements like caesium and cerium.],
  [It is a range of dose rates where effects on fish, mainly reduced reproductive success, become possible and should be considered.],
  [Fish are assumed to absorb elements instantly, and currents are not diluting the contamination; also, local fallout is depleted in caesium and strontium (fractionation).],
)
