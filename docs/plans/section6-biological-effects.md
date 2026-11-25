# Section 6 plan: effects on living things

This is the biggest section, so it's split in two:
- **6a: immediate effects.** Blast injury, burns and acute radiation sickness, combined into
  one report per receiver. Build this first.
- **6b: long-term radiation effects.** Fallout radiation over days to months, and radioactive
  elements taken up into fish. Build this next.

## 6a: immediate effects (`biology/` package)

### Receivers
A receiver gets a `kind` and a body mass:
- **fish**, with or without a swim bladder (mass in grams);
- **marine mammal**, with a hearing group: low-, mid- or high-frequency cetacean, phocid seal,
  otariid sea lion (mass in kg);
- **sea turtle**;
- **diver** (submerged human);
- **person on deck** (human above water).

### Blast injury: underwater receivers (uses Sections 1 and 2)
| Receiver | Criterion | Source | Checked? |
|---|---|---|---|
| Fish (all) | onset of injury: 206 dB peak; mortality: 229–234 dB peak | NMFS 2023 summary (FHWG 2008); Popper et al. 2014 Table 7.2 | ✅ in source text |
| Fish (impulse, by size) | LD50 impulse rises with mass: 1.7 psi·ms at 0.02 g up to 49.5 psi·ms at 744 g | Yelverton et al. 1975 abstract. The fitted line isn't published in text, so it's drawn through these two points (**my fit**, labelled) | partly |
| Marine mammals and turtles | slight lung injury 47.5·M^⅓·(1+D/10.1)^⅙ Pa·s; mortality 103·M^⅓·(…) Pa·s; GI injury 237 dB peak (all "onset" = about 1% risk) | US Navy Phase 4, 90 FR 32118 (2025) Table 20 | ✅ in source text |
| Marine mammals (hearing) | temporary/permanent hearing damage (TTS/PTS) peak thresholds by hearing group | 90 FR 32118 Table 19 | quoted |
| Divers | Navy: below 50 psi "prudent"; 500 psi serious lung/gut injury; above 2,000 psi certain death | US Navy Diving Manual Rev 7 §2-7.3.6–8 | ✅ in source text |
| Divers (impulse risk curves) | Weibull risk of lung and abdominal injury and death vs impulse | Lance et al. 2015, PLoS ONE (262 human cases) | ❗ re-check the table values on the paper before coding |
| Divers (safe level) | 14 kPa·ms (≈2 psi·ms) safe for swimmers | Yelverton & Richmond 1981 abstract | quoted |

**Long-pulse problem.** All the criteria above come from small charges with millisecond pulses.
Nuclear pulses (especially air blast entering the water) last hundreds of milliseconds, and
integrating impulse over that whole time would wildly overstate injury.

The US Navy's approach is to count impulse only up to the arrival of the surface reflection,
or 20% of the lung's oscillation period, whichever comes first (JASCO UXO report §6.2). I'll use
that window, with the lung oscillation period from standard bubble physics (Minnaert). That's a
labelled approximation, since the exact Goertner formula couldn't be read. Peak-pressure criteria
are reported alongside, so both are visible.

### Blast injury: people on deck (uses Section 2)
- Glasstone Table 12.38 (long pulses, which applies to nuclear blasts):
  - lung damage threshold 12 psi, severe 25;
  - lethality threshold 40, 50% 62, 100% 92;
  - eardrum rupture threshold 5 psi, 50% 15–35 depending on age.
- "Effective" pressure for someone standing in the open is overpressure + dynamic pressure
  (§12.32). Dynamic pressure is from Glasstone Eq. 3.55.1.
- Being thrown by the blast isn't modelled yet. It needs a body-velocity model; Glasstone Table
  12.49 gives the injury velocities.

### Burns (from Section 5)
- First- and second-degree burn thresholds (already built) go into the receiver report.

### Acute radiation (from Section 3)
- **Humans:** Glasstone Table 12.108 dose bands, compared directly with the simulator's surface
  doses as §12.108 says. LD50/60 ≈ 4.5 Gy with minimal care (PNNL-14424). About 10 Gy kills almost
  everyone (CDC).
- **Fish:** acute lethal doses from the ICRP 108 review: about 10–55 Gy for juvenile marine fish,
  much lower for embryos (0.3–0.9 Gy).

### Output
`assess(burst, receiver)` returns a plain-language list of effects (none, possible, likely,
lethal), each with the numbers, the criterion and its source. There's also a script that maps
"lethal zones" for a chosen animal around a burst.

## 6b: long-term radiation (next)
- **Fallout dose rate** (Section 4) compared with the ICRP dose levels for fish (1–10 mGy/day) and
  the effect levels from the UNSCEAR review.
- **Uptake into fish:**
  - how much of each radioactive element fission produces (JEFF-3.1.1 via the IAEA nuclear-data
    service; 1.45×10²³ fissions per kt);
  - how much fish take up from seawater (IAEA TRS-422);
  - dose from inside the fish (ICRP 136 coefficients).
  - Glasstone's strontium-90 figure falls between the values I'll use.

## Tests (6a)
- Navy equations at the JASCO worked values (5 kg, 1 m depth → 82.5 Pa·s).
- dB conversions: 206 dB = 20 kPa, 229 dB = 282 kPa.
- Glasstone table thresholds exactly. Monotonic behaviour: closer means worse, heavier animal
  means more tolerant.

## Honest limits
- **The biggest uncertainty is extrapolation:** all injury criteria come from small charges and
  short pulses. The guide will say this plainly.
- **Generic animals:** species vary enormously, and the criteria describe "typical" animals.
- **Combined injuries:** blast plus radiation plus burns make each other worse (Glasstone
  §12.140). This isn't modelled; each effect is reported separately.
