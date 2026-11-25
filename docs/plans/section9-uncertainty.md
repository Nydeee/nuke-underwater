# Section 9 plan: uncertainty everywhere

## Goal
Every result gets a consistent "how sure are we" range. Each effect on a fish, whale or person
also gets a **probability** for each outcome, for example "lethal: 30%, severe: 45%, likely: 25%",
instead of a single verdict.

## Method: Monte Carlo (run it many times with the uncertain parts varied)
1. **List every uncertain ingredient** in one place (`uncertainty.py`). Each entry records:
   - how big its uncertainty is;
   - where that comes from: either *the source states it* or *our own judgement* (clearly marked);
   - how it varies (log-normal or log-uniform, so "×2 too high" and "×2 too low" are equally likely).
2. **Let the models read an adjustment factor for each ingredient.** It defaults to 1, so results don't
   change unless the uncertainty mode is on, and all existing tests still pass.
3. **Run the assessment many times** (default 200 runs per receiver), each with randomly drawn factors.
   Report:
   - the middle value (median) and the 5%–95% range for each effect's main number;
   - the probability of each outcome level.

## The uncertain ingredients
| Ingredient | Range | Basis |
|---|---|---|
| Brode air-blast pressure | ×/÷ 1.2 | Brode 1987: "within 20 percent" |
| Initial radiation dose at the surface | ×/÷ 2 | Glasstone §8.33: reliability 0.5–2 |
| Water shielding (gamma TVT 24–39 in, neutrons 0.07–0.103 /cm, slant vs vertical path) | already a low–high range | Glasstone Table 8.41 and Section 3 |
| Fallout reaching the sea (20–30%) | already a range | Glasstone §9.59 |
| Fallout decay (t^−1.2) | ±25% (to 2 weeks) | Glasstone §9.15 |
| Mixing: start 10–20 m, sink 3–4 m/h, thermocline 40–60 m | sourced ranges | Redwing 1956 |
| Fish uptake (concentration factors) | ×/÷ 10 (as the 95% range) | IAEA TRS-422 §3.3 |
| Wave heights | ±35%, plus the existing low–high range | Glasstone §6.119 |
| Heat pulse peak time | ±25% | Glasstone §7.85 |
| Contact-burst heat (0.5–0.75 of an air burst) | sourced range | Glasstone §7.20 |
| Nuclear underwater shock calibration | ×/÷ 1.3 | **our judgement** (one calibration point) |
| Air blast into water (sonic-boom theory extension) | ×/÷ 1.5 | **our judgement** |
| Near-surface coupling ε | ×/÷ 2 | **our judgement** (Soviet 1961 test within a factor of 2) |
| Heat at the surface on a clear day | ×/÷ 1.25 | **our judgement** (visibility not modelled) |

The injury *thresholds* stay as published: the onset (1%) and 50% levels already grade the outcomes. The
probabilities come from uncertainty in the *physics* reaching each threshold.

## Deliverables
- `uncertainty.py`: the list of ingredients, the "adjustment factor" switch, and `assess_with_uncertainty(...)`.
- Small edits to the models so they read their adjustment factor (default 1).
- Effects gain a numeric main value with units, alongside the existing text, so ranges can be computed.
- **Web app:** each receiver's report shows an outcome-probability bar and a 5–95% range per effect. Each
  receiver's colour stays its most likely outcome. There's a switch to set the number of runs.
- **Guide Chapter 10, "How sure are we, overall?":** what Monte Carlo is, the full table above, which ranges
  are sourced and which are judgement, and how to read the probabilities.

## Tests
- With all factors at 1, results are identical to before.
- Ranges always bracket the middle value, and probabilities add up to 100%.
- With a fixed random seed, results repeat exactly.
- Sanity: radiation dose ranges span about 4× (from the ×/÷2), and a receiver far from any threshold gets
  "none" with 100% probability.

## Then: full testing
After this, a full test pass of the whole simulator and web app (the "let's test it" step): automated
tests, a set of end-to-end scenarios checked against known historical numbers (BAKER, Redwing,
Glasstone examples), and a walk-through of the web app.

## Honest limits
- Several ranges are **our judgement** where sources give none. They're marked as such everywhere they
  appear.
- **Ingredients are treated as independent** of each other. In reality some may be linked.
- This captures *known* uncertainties. It can't capture missing physics: the absent negative phase,
  sodium-24, currents and so on stay listed as warnings.
