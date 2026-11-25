# Section 3 plan: initial radiation reaching the water, and how water shields it

## Goal
For a burst above the water, find the radiation dose (gamma rays + neutrons, first minute)
received by a fish, diver or swimmer at any range and depth. Fallout and seawater made
radioactive by neutrons are Section 4 (contamination), not this one.

## Part A: dose arriving at the water surface (`effects/initial_radiation.py`)
| Item | Model | Source | Checked? |
|---|---|---|---|
| Total initial dose vs yield and slant range | I = (W/d²)·{4997.41·e^(−9.263158·(ρ/ρ₀)·d) + 1033·(W′/W)·e^(−5.415385·(ρ/ρ₀)·d)} rem, d in miles | Fletcher et al. 1962 (CEX-62.2) Eq. 2.114 | ✅ checked against the page image |
| Gamma enhancement at high yield (the blast thins the air) | log(W′/W) polynomial; W′/W = 1 for W ≤ 10 kt | Fletcher Eq. 2.115 | ✅ |
| Air density | ρ/ρ₀ = 0.9 for air bursts, 1.0 for surface bursts, which also use 2/3 of the gamma term | Fletcher p. 43 | quoted |
| Neutron vs gamma split | First term = neutrons, second = gamma (only gamma gets the enhancement factor, consistent with Glasstone §8.65: neutrons are not enhanced) | our reading, labelled as such | inference |

- **What the dose means:** this is a generic estimate. It doesn't model different weapon designs (fission vs thermonuclear), and Glasstone's own reliability band is 0.5–2×.
- **Close-range limit:** the formula is "unreliable" closer than 0.28 miles (about 450 m), and the simulator will warn there.
- **Checks against Glasstone 1977:** its worked examples should come out within the 0.5–2× band. For example, 50 kt at 2,000 yd gives about 250 rad (§8.34).
- **Units:** 1 rem ≈ 1 rad ≈ 0.01 Gy is close enough for the gamma and neutron mix at this accuracy. The guide will explain it.

## Part B: shielding by water (`effects/radiation_shielding.py`)
- **Gamma rays:** Glasstone Table 8.41 effective tenth-value thicknesses for water: 24 in for fission-product gammas, 39 in for nitrogen-capture gammas. These are "effective" values that already include scattered rays (the buildup effect). §8.42 recommends the larger value to be safe.
  - Stated as mass per area (125 and 201 lb/ft²), so for seawater (1.025× denser) the thickness shrinks slightly.
  - The simulator uses 39 in by default and shows 24 in as the low end.
- **Neutrons:** exponential "removal" attenuation with Σ_R ≈ 0.103 cm⁻¹ for fission-spectrum neutrons, which means a tenth-value of about 22 cm.
  - ❗ This is only from search snippets so far, and I'll verify it in a readable source before coding.
  - 14 MeV (thermonuclear) neutrons go farther. That will be noted, not modelled.
- **Path through the water:** radiation from the burst enters at an angle. The two limits are:
  - straight down through the receiver's depth (upper estimate, includes scattered "sky-shine");
  - along the slanted direct path, depth/cos θ (lower estimate).
  - The simulator reports both, so you see a range instead of a falsely precise number.
- **Not modelled (flagged):** gammas made inside seawater when neutrons are captured (mostly by chlorine and hydrogen, with no source quantifying the dose), reflection off the water surface, and the timing of the dose within the first minute.

## Tests
- Fletcher Eq. 2.114 hand-checked values; W′/W = 1 at ≤ 10 kt and about 2.5 at 1 Mt (Fletcher Fig. 2.15).
- Within 0.5–2× of Glasstone 1977's worked examples (§8.34; §8.132: 1 Mt at 4,000 yd ≈ 8.3 rad).
- Water: one tenth-value thickness gives exactly 10% transmission. Dose falls with depth; slanted path ≤ vertical path.

## Deliverables
- `initial_radiation.py`, `radiation_shielding.py`.
- A script mapping dose in the water (distance × depth), with lines at 1 Gy and 5 Gy as rough reference levels. Real biological effects come in the biology section.
- Guide **Chapter 3**: what gamma rays and neutrons are, dose units (Gy, rad, rem, Sv), why water is a good shield, tenth-value thickness, buildup, how sure we are. Plus glossary and references.

## Honest limits
- 1962-era generic fit, reliable to about 0.5–2×, with no weapon-design detail.
- Neutron attenuation in water is the weakest-sourced number until it's verified.
- Most of the dose is in the first second (Glasstone §8.47, §8.51); the simulator gives the total.
