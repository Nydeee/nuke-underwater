#import "template.typ": *

= What it does to living things: immediate effects

_Simulator section 6a. Code: `src/nukesim/biology/`._

The previous chapters calculated pressures, doses and heat. This chapter turns those numbers
into effects on fish, whales, turtles, divers and people on boats. It uses *injury criteria*:
published thresholds, mostly from experiments and from the rules navies and fisheries
agencies use to protect animals from underwater explosions.

#keyidea[An injury criterion is a line drawn through messy biological data. Animals vary,
experiments are limited, and most of the data comes from small explosive charges, not nuclear
weapons. Treat every result in this chapter as "the best published estimate", not a
certainty.]

== Measuring underwater sound: decibels

Biologists describe underwater blasts in *decibels* (dB) relative to one micropascal:

$ "SPL"_"peak" = 20 log_10 (p_"peak" / (1 thin mu"Pa")) $

Every +20 dB is 10× the pressure. Some useful values:

- 206 dB = 20 kPa;
- 229 dB = 282 kPa;
- 237 dB = 7 MPa.

== Why gas-filled organs are the weak point

Water and flesh are almost incompressible, so a pressure wave passes straight through them.
*Gas* is different. A fish's *swim bladder*, or a mammal's or diver's *lungs*, are squeezed
hard by the shock, then spring back, and can tear. That's why fish without swim bladders are
far tougher (their damage range is about 100× smaller, Popper et al. 2014), and why lungs and
gut are what the criteria for mammals and divers focus on.

== The long-pulse problem

Almost all injury data comes from small charges whose pulses last a few *milliseconds*. A
nuclear pulse, especially air blast pressed into the water, can last *hundreds* of
milliseconds. A gas organ can't be "squeezed" by a slow push the same way as by a sudden
blow: it just compresses gently and evenly.

The U.S. Navy deals with this by only counting the impulse during a short window: until the
surface-reflected wave arrives, or 20% of the organ's natural "ringing" period, whichever is
sooner (JASCO UXO report §6.2). The simulator does the same. It estimates the ringing period
by treating the lung or swim bladder as a bubble (Minnaert's formula). For a 5 kg animal near
the surface that's about 9 ms, so the window is about 2 ms.

#caution[The window method is the Navy's approach, but using Minnaert's bubble formula for the
period is this project's stand-in for the original Goertner lung model, which wasn't readable.
For swim bladders the simulator assumes the bladder is about 5% of the fish's volume, a
typical textbook value that wasn't checked against a source.]

== Fish

- *Injury possible* above 206 dB peak (the US fisheries service's criteria, set by its 2008
  Fisheries Hydroacoustic Working Group).
- *Mortality* from 229--234 dB peak (Popper et al. 2014, Table 7.2).
- *Swim-bladder impulse*: Yelverton et al. (1975) found that the impulse that kills half the
  fish (the *LD50*) rises with body size: 1.7 psi·ms for tiny 0.02 g fry up to 49.5 psi·ms for
  a 744 g carp. The simulator draws a line through these two points; the published fitted line
  is only in a figure that couldn't be read.

== Whales, dolphins, seals and turtles

The U.S. Navy (2025 criteria) uses the *modified Goertner equations*. The impulse that causes
injury grows with body mass $M$ (kg) and depth $D$ (m):

$ I = C thin M^(1\/3) (1 + D \/ 10.1)^(1\/6) quad "Pa·s" $

with $C = 47.5$ for the onset of slight lung injury and $C = 103$ for the onset of mortality.
"Onset" means about 1% of animals. The 50% values are 65.8 and 144. Bigger animals have bigger
lungs that ring more slowly and tolerate more; deeper animals' lungs are already compressed.

#analogy[A large drum hit by a short tap barely moves; a small one rattles. Big whales have
"large drums".]

The Navy also gives a *gut injury* threshold (237 dB peak) and *hearing* thresholds that depend
on the animal's hearing group. Porpoises are the most sensitive: temporary hearing loss from
196 dB and permanent injury from 202 dB.

#fig("/output/guide_figures/zones_mammal.png")[Worst immediate effect on a 200 kg marine
mammal around a 20 kt burst 27 m underwater. Near the surface, the surface cutoff (chapter 1)
protects animals; deeper down the shock is lethal for kilometres.]

== Divers and swimmers

- The *U.S. Navy Diving Manual* (Rev. 7):
  - keep a diver's exposure below *50 psi*;
  - *500 psi* causes serious lung and gut injury;
  - more than *2,000 psi* is "certain death".
- *Lance et al. (2015)* analysed 262 real human exposures and fitted *risk curves* to impulse.
  The impulse giving a 50% risk of death is 302 kPa·ms. The 1% injury risk is about 34 kPa·ms
  for the chest and about 2 kPa·ms for the abdomen.
- A safe level of 14 kPa·ms for swimmers comes from Yelverton & Richmond (1981).

A swimmer with their head out of the water is also exposed to burns and radiation.

== People on deck

For someone standing in the open, Glasstone uses the *effective* pressure: the blast
overpressure plus the *dynamic pressure* (the "wind" behind the blast front) (§12.32). Table
12.38 gives, for the long pulses of nuclear explosions:

#table(
  columns: (auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Effective pressure*], [*Effect*]),
  [5 psi], [eardrum rupture begins],
  [12 psi], [lung damage begins],
  [25 psi], [severe lung damage],
  [40 psi], [deaths begin],
  [62 psi], [about 50% killed],
  [92 psi], [nearly all killed],
)

Burns come from chapter 5. Being thrown by the blast, flying debris and being knocked
overboard aren't modelled yet.

== Radiation sickness

For people, the simulator compares the initial radiation dose (chapter 3) with Glasstone's
Table 12.108, which describes what happens at each dose level:

- below 1 Gy: no illness;
- 2--6 Gy: severe damage to the blood system, with 0--90% deaths over weeks;
- above 10 Gy: death within days to two weeks.

The dose that kills half of people with minimal medical care (*LD50*) is about *4.5 Gy*
(PNNL-14424). The CDC gives 2.5--5 Gy, and about 10 Gy kills almost everyone.

For fish, the ICRP review gives LD50s of about 10--55 Gy for juvenile marine fish, but as low as
0.9 Gy for fish embryos.

== Example

20 kt exploding 500 m above the sea, 1 km from ground zero:

#table(
  columns: (auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Who*], [*Worst effect*]),
  [person on deck], [*lethal*: 22 Gy radiation, severe burns (39 cal/cm²), blast at the lung-damage threshold],
  [diver 10 m down], [none expected (7 psi peak; radiation blocked by the water)],
  [300 g fish 10 m down], [possible injury (213 dB peak)],
  [200 kg dolphin 10 m down], [none expected],
)

#fig("/output/guide_figures/zones_fish.png")[Worst immediate effect on a 300 g fish under a
20 kt burst 500 m above the sea. Directly below, the pulse travels straight down and is
dangerous. The thin dark strip at the top is lethal initial radiation in the top metre of water.]

#caution[
- *Extrapolation*: every underwater injury criterion was derived from small charges with
  short pulses. Applying them to nuclear pulses, even with the Navy's window method, is the
  largest uncertainty in this chapter.
- *Generic animals*: species, size, age and health vary enormously.
- *Combined injuries* make each other worse: blast plus radiation kills more than either alone
  (Glasstone §12.140). The simulator reports each effect separately.
- The diver risk curves' numbers were read from a summary of the paper. They reproduce the
  paper's abstract exactly, but the original tables weren't seen.
- *Fallout* radiation over days isn't included here; it comes in the next part (6b).
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`biology/criteria.py`], [every threshold, with its source],
  [`biology/assess.py`], [`assess(burst, receiver)`: the plain-language effects report],
  [`scripts/plot_effects_zones.py`], [danger-zone maps for any animal or person],
)

#questions(
  [How many times larger is the pressure at 229 dB than at 209 dB?],
  [Why are fish without swim bladders much less affected by underwater blasts?],
  [Why does the simulator count only a short window of the impulse for nuclear pulses?],
  [According to the Navy equations, who tolerates more impulse: a 10 kg seal or a 10,000 kg whale? Why?],
  [Why are animals near the surface partly protected from an underwater burst?],
  [A person on deck receives 3 Gy. Using Table 12.108, what would you expect?],
)

#answers(
  [20 dB is a factor of 10 in pressure.],
  [The injury mainly comes from gas-filled organs being violently squeezed and rebounding. Without a swim bladder there is little gas to do this.],
  [Gas organs are injured by sudden squeezing on the timescale of their natural oscillation. A slow push over hundreds of milliseconds mostly just compresses them evenly, so counting the whole pulse would overstate injury.],
  [The whale: the threshold grows as $M^(1\/3)$, so it is $(1000)^(1\/3) = 10$ times higher. Bigger lungs oscillate more slowly.],
  [The surface reflects the shock as a "pull" that arrives soon after it near the surface, cutting the pulse short (the surface cutoff from chapter 1).],
  [Severe radiation sickness (vomiting, blood damage, hair loss after about 2 weeks), with a significant chance of death within 2--12 weeks; hospital care needed.],
)
