# Section 5 plan: heat from the fireball hitting the sea

## Goal
For a burst above the water, find:
- how much heat (thermal radiation) reaches each point on the sea surface, and when;
- burn risk for people on boats;
- how the heat is absorbed in the water with depth: how hot the top layer gets, whether it boils,
  and how much light and heat reaches fish below.

## Part A: heat reaching the surface (`effects/thermal.py`)
| Item | Model | Source |
|---|---|---|
| Radiant exposure Q (cal/cm²) vs slant range, air burst | log-polynomial fit Eq. 2.106 (0.05–50 miles; 50-mile visibility) | Fletcher et al. 1962, Table 2.11 (agent checked it against the page image; I'll re-check before coding) |
| Contact surface burst | same fit with 0.7·W | Fletcher Eq. 2.107; consistent with G&D §7.20 ("half to three-fourths") |
| Cross-check | Q ≈ 85.6·f·W·τ/D² (D in kft), f = 0.35 | G&D Eq. 7.96.3, §7.04 |
| Pulse timing | t_max ≈ 0.0417·W^0.44 s; about 80% delivered by 10·t_max; cumulative-% fit Eq. 2.112 | G&D §7.85–7.86; Fletcher Eq. 2.112 |
| Burns, bare skin (boat crew) | 1st and 2nd degree thresholds vs yield, Eqs. 2.110–2.111; darker skin burns at about ⅔ of the exposure | Fletcher; G&D §12.64 |
| Reflection off the water | Fresnel reflectance at the incidence angle (about 2% from overhead, more at grazing angles) | Mobley, *Ocean Optics Web Book*, Fresnel Eqs. 5–6 |

- **Visibility:** the fit assumes a clear day (50-mile visibility). The guide will explain that haze, fog
  or rain lower the exposure (G&D §7.13–7.15). Visibility can't be adjusted yet.

## Part B: heat entering the water (`effects/thermal_water.py`)
- **Spectrum:** a 6,000 K blackbody. G&D §7.76 says 6,000–7,000 K, "somewhat depleted in the ultraviolet".
- **Absorption by wavelength:** measured pure-water absorption data. Pope & Fry (1997) for
  0.38–0.7 µm; Segelstein (1981) elsewhere. The data files will be bundled in the project with citations.
- **Depth profile:** energy absorbed in each layer (spectral Beer–Lambert, the rule that light fades
  exponentially as it passes through). Temperature rise ΔT = energy ÷ (density × specific heat),
  using Sharqawy et al. (2010) seawater properties (about 3,999 J/kg/K).
- **Boiling:** where the top layer would pass 100 °C, the extra energy boils water off. Latent heat is from
  Sharqawy Eq. 54. Output: millimetres of water evaporated.
- **Light reaching fish:** heat and light energy per m² that gets down to a receiver's depth.
- **Starting temperature:** you can choose it; the default is 20 °C.

## Tests
- Fletcher fit vs G&D's simple equation: the implied transmittance should be between 0.6 and 1 at
  1–10 miles.
- Burn thresholds: 1 kt gives about 2.06 cal/cm² (1st degree) and 4.00 (2nd degree). Fletcher fits match
  hand values.
- Fresnel: R(0°) ≈ 0.021 and it rises with angle.
- The blackbody spectrum peaks where Wien's law says it should. No energy is lost: absorbed plus
  transmitted equals what entered.
- ΔT is proportional to fluence. The boiling switch is placed correctly.

## Deliverables
- `thermal.py`, `thermal_water.py`, the bundled absorption data, and a script that plots:
  - heat on the surface vs distance, with burn thresholds;
  - temperature rise vs depth at a chosen spot.
- Guide **Chapter 5**: thermal radiation, cal/cm², transmittance, the double flash, why water absorbs
  infrared in the top millimetre but blue light reaches tens of metres, heating and boiling, burn
  risk on deck, and how sure we are.

## Honest limits (flagged in code and guide)
- **Near-surface absorption is an upper estimate:** the atmosphere's water vapour removes many of the
  same infrared wavelengths that seawater would absorb in its top millimetre. The spectral shape
  after passing through air isn't modelled.
- **No heat spreading:** heat conducting away during the pulse is ignored. Over seconds it only spreads
  about a millimetre, but that matters for the very top layer.
- **Pure-water data:** real seawater with plankton and sediment absorbs visible light faster, so less
  light reaches depth.
- **Not modelled:** spray, steam clouds, the fireball touching the water (low bursts; that's for the
  roadmap's surface-burst section), and visibility other than clear.
