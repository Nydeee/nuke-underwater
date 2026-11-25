#import "template.typ": *

= How sure are we, overall?

_Simulator section 9. Code: `src/nukesim/uncertainty.py` and `src/nukesim/biology/uncertain.py`._

Every chapter ended with a "How sure are we?" box. This chapter brings all of that together, so
that every result can carry a *range* and every outcome a *probability*.

== The idea: run it many times

Most formulas in this simulator come with a stated accuracy. Brode's blast fits are "within 20
percent"; Glasstone's radiation curves are reliable to "a factor of 0.5 to 2"; the IAEA's fish
uptake factors are good to "one order of magnitude". Instead of picking one value, the simulator
can run the whole calculation many times (200 by default). Each time it nudges every uncertain
ingredient by a random amount within its range. This is called a *Monte Carlo* method, after the
casino, because it uses random numbers.

#analogy[Weather forecasts work the same way. Forecasters run their model many times with slightly
different starting conditions. If 30 out of 100 runs give rain, the forecast says "30% chance of
rain".]

From the runs the simulator reports:

- the *likely range* of each number: the middle 90% of the runs, from the 5th to the 95th
  percentile;
- the *probability of each outcome*, for example "lethal 30%, severe 45%, likely 25%", from how
  often each one came up.

== The uncertain ingredients

#table(
  columns: (1.6fr, 0.9fr, 1.6fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Ingredient*], [*Range*], [*Basis*]),
  [Air-blast pressure (Brode)], [×/÷ 1.2], [Brode 1987: "within 20 percent"],
  [Initial radiation at the surface], [×/÷ 2], [Glasstone §8.33: reliability 0.5--2],
  [Water shielding (thickness for gammas, neutrons, slant or straight path)], [within the low--high range], [Glasstone Table 8.41; chapter 3],
  [Fallout fraction for sea bursts], [20--30%], [Glasstone §9.59],
  [Fallout decay law], [×/÷ 1.25], [Glasstone §9.15],
  [Fallout starting depth / sinking rate], [10--20 m / 3--4 m/h], [Redwing 1956],
  [Fish concentration factors], [×/÷ 10], [IAEA TRS-422 §3.3],
  [Heat at the surface (clear day)], [×/÷ 1.25], [*our judgement*],
  [Nuclear underwater shock calibration], [×/÷ 1.3], [*our judgement* (one data point)],
  [Air blast into water], [×/÷ 1.5], [*our judgement* (sonic-boom theory applied to nuclear blasts)],
  [Near-surface coupling], [×/÷ 2], [*our judgement* (1961 test within a factor of 2)],
)

"×/÷ 2" means the true value is probably (95% of the time) between half and double the
simulator's best estimate. Ranges marked *our judgement* are where the sources give no
accuracy; those are this project's own estimates, and they are shown as such in the interface
(`/api/uncertainties`).

== Reading the results

In the 3D interface, tick *Show uncertainty*. Then:

- each animal or person is coloured by its *most likely* outcome;
- its report shows a bar with the chance of each worst outcome;
- each effect shows its likely range and its own probability bar.

*Example.* A person on a boat 1 km from a 20 kt burst 500 m above the sea:

- radiation dose 13--38 Gy (likely range), *lethal in 99% of runs*;
- burns: severe in all runs (31--47 cal/cm²);
- blast: 12--17 psi, "likely" lung damage in 96% of runs.

A fish 10 m down at the same spot gets "possible injury" (33--68 kPa peak pressure) in all runs.
The result doesn't change much, because it is far from the next threshold either way.

#keyidea[A probability near 100% means the answer is robust: even with all the known
uncertainties, the outcome is the same. A split like "possible 41%, none 60%" means the case sits
near a threshold, and you shouldn't trust a single verdict.]

== What uncertainty ranges can't tell you

- They only cover *known* uncertainties. Missing physics, such as the blast's suction phase,
  seawater made radioactive by neutrons, currents diluting fallout, and combined injuries, isn't in
  the ranges. That's why the *Assumptions & warnings* list matters as much as the ranges.
- The ingredients are treated as *independent*. In reality some errors may go together.
- The injury *thresholds* themselves are kept as published. Their spread is partly represented by
  the separate "onset" and "50%" levels.
- Several ranges are our judgement. A different careful person might choose different ones.

#caution[The honest summary of this whole project: the simulator gives *physically reasonable,
source-backed estimates*, often good to within a factor of 2, and it tells you where it's less sure
than that. It is a learning and exploration tool, not a substitute for classified or detailed
engineering models.]

#questions(
  [What does "×/÷ 2" mean for a predicted radiation dose of 10 Gy?],
  [Why does the simulator run a calculation hundreds of times instead of once?],
  [A diver's report says "none 55%, possible 45%". What does that tell you?],
  [Give two things the uncertainty ranges do not include.],
)

#answers(
  [The true dose is probably (95% of the time) between 5 and 20 Gy.],
  [Each run uses slightly different values for the uncertain ingredients; together the runs show how much the answer can vary and how likely each outcome is.],
  [The diver is close to an injury threshold: small changes in the uncertain physics decide whether they are hurt, so neither verdict is reliable on its own.],
  [Missing physics (e.g. the blast's suction phase, sodium-24 in seawater, currents), and links between uncertainties (they're treated as independent); also the spread in the injury thresholds themselves.],
)
