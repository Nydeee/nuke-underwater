# Section 2 plan: air blast over water, and how it gets into the water

## Goal
The user picks a yield and a burst height above the water, then places fish, divers,
swimmers, etc. at any range and depth. For each receiver the simulator gives the blast
pressure history, peak pressure and impulse *in the water*. This is the foundation for
the later injury models (fish, humans) and comes before radiation and fallout.

## Part A: air blast at the water surface (`effects/air_blast.py`)
| Quantity | Model | Source | Checked? |
|---|---|---|---|
| Peak overpressure at the surface vs yield, burst height and ground range | Brode Eq. 62 (height-of-burst fit; includes surface reflection and Mach stem) | Brode 1987, pp. 60, 70–71 | ✅ every coefficient checked against the scanned pages |
| Free-air peak overpressure (for tests and reference) | Brode Eq. 33 | Brode 1987, p. 26 | to check against the scan |
| Arrival time, positive-phase duration | Brode Eqs. 40, 45 (scaled to slant range) | Brode 1987, pp. 31, 36 | to check against the scan |
| Shock-front speed | U = c₀(1 + 6p/7P₀)^½ | Glasstone & Dolan Eq. 3.55 | quoted |
| Contact burst | burst within 5·W^0.3 ft of the surface | Glasstone & Dolan §2.127 footnote | quoted |
| Fireball reaches the water | H < 180·W^0.4 ft (±30%); flagged as an interpretation | Glasstone & Dolan Eq. 2.128.1 | quoted |
| Pressure-vs-time shape at the surface | Waveform shape from a published source (Brode Eq. 63 or a Friedlander form) | to find | ❗ must be sourced before coding |

- Water counts as a near-ideal (smooth) reflecting surface (Glasstone & Dolan Table 3.83).
- Yield scaling: cube-root (Glasstone & Dolan §3.61–3.63).
- Sea-level atmosphere.

## Part B: from the surface into the water (`effects/air_to_water.py`)
Physics (sonic-boom penetration theory: Sawyers 1968, Sparrow NASA N95-14887, Sohn et al. 2000):
1. **Pressure continuity.** Just below the surface, the water feels the total surface pressure. Brode's
   numbers already include the reflection, so they are not doubled again.
2. **Trace speed.** The blast front sweeps across the water at a "trace speed" V. Near
   ground zero V is faster than sound in water (1,500 m/s) and the pulse travels down
   into the water. Farther out V is slower, and the pressure fades with depth. Low frequencies
   reach deeper than sharp spikes do.
3. **Method.** Take the surface pressure history, split it into frequencies (FFT), and
   carry each one down to depth z with a factor exp(i·k_z·z), where k_z = ω·√(1/c_w² − 1/V²).
   This one formula covers both regimes: real k_z means the pulse travels down,
   imaginary k_z means it fades with depth. This treats the surface locally as a flat
   moving pressure pattern.
4. Output per receiver: pressure history, peak pressure, impulse, and whether it is in
   the "propagating" or "fading" zone.

## Tests
- Brode Eq. 62 against the report's own test values (Appendix A, p. 177) and Eq. 34 for a
  surface burst.
- The into-water method reproduces **Sawyers' exact N-wave solution** (Sparrow p. 144), and
  Sparrow's quoted decay (about 45% at 25 m and about 15% at 120 m for a 0.3 s boom at Mach 2.1).
- Limits: V → ∞ gives no decay with depth; V just below 1,500 m/s fades slowly; low V fades fast.
- Cube-root scaling and surface-pressure continuity at z = 0.

## Deliverables
- Code: `air_blast.py`, `air_to_water.py`, `Burst` accepts heights above water.
- A script plotting a **colour map of peak pressure in the water** (range × depth), plus pressure histories
  at chosen receivers.
- Guide **Chapter 2**: air blast, Mach stem, why only about 13° of the blast "gets in",
  trace speed, evanescent waves, and how sure we are.

## Honest limits
- No public measurements exist of underwater pressure under a nuclear air burst, so Part B is
  physics-based, not checked against nuclear data. Applying the trace-speed theory to a
  nuclear blast front is our extension of sonic-boom theory, and it will be labelled as such.
- Near ground zero, for low bursts, the shock is very strong (non-linear) and the fireball can
  touch the water. The simulator will flag this zone rather than pretend to be accurate there.
- Waves, the sea floor, rough seas and layered water are not included in this section.

## Optional, if you can get it
Pinkston & Sakurai (1966), *Water Shock Waves from Above-Water Explosions*, WES Misc.
Paper 1-808 (DTIC AD0747824). It has real measurements of TNT exploded above water
and would let us validate Part B. DTIC blocks automated downloads, but it may open in your
browser.
