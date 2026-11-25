# Underwater shock wave

## What happens
When a nuclear weapon detonates underwater, the water around it is vaporised and a
hugely compressed gas bubble forms. Its sudden expansion launches a **shock wave**:
a sharp pressure jump that travels outward at about the speed of sound in water
(~1,500 m/s, about 4.4x faster than in air). The pressure jumps up almost instantly,
then decays roughly exponentially (Glasstone & Dolan 1977, sec. 6.116).

This shock is what damages ship hulls and injures fish and swimmers. Most of that
harm comes from the pressure itself and from its **impulse** (pressure x time, the
area under the pressure curve).

## The equations (Cole 1948, quoted in USACE ETL 1110-8-11, 1991)
For W pounds of TNT, at range R feet, define the *scaled range* λ = R / W^(1/3):

| Quantity | Formula | Units |
|---|---|---|
| Peak pressure | Pm = 21,600 · λ^-1.13 | psi |
| Time constant | θ = 6.0×10⁻⁵ · W^(1/3) · λ^0.18 | s |
| Impulse | I = 1.46 · W^(1/3) · λ^-0.89 | psi·s |
| Pressure history | P(t) = Pm · e^-(t - ta)/θ | psi |

**Why the cube root?** Explosion energy fills a volume, and volume grows as length³.
Double the distance and you need 8x the charge to get the same pressure.

## From TNT to nuclear
A nuclear burst puts a smaller share of its energy into the water shock than the same
TNT-equivalent yield of chemical explosive. Instead of guessing that share, the code
solves for it from Glasstone & Dolan sec. 6.41: *about 2,700 psi at 3,000 ft from
100 kt in deep water*. The result is that **1 kt nuclear ≈ 0.49 kt TNT for the water
shock** (`NUCLEAR_SHOCK_TNT_FACTOR`). This is a single calibration point, so treat it
as an estimate. Next step: digitise Glasstone Fig. 6.115 and test the whole curve.

## Surface cutoff
The air–water surface reflects the shock back down as a *tension* (negative pressure)
wave. A receiver near the surface sees the shock "cut off" a short time after it
arrives (Glasstone sec. 6.43–6.45). The code models this with a mirror-image burst above
the surface (the **image source** method). Water cannot be pulled apart much (it
cavitates), so total pressure is never allowed below zero absolute pressure.

This purely acoustic model is **harsher** than reality very close to the surface.
Glasstone sec. 6.46 describes an "anomalous region" where non-linear effects soften the
cutoff. It will be refined later.

## Not modelled yet
- Sea-floor reflections: these can raise peak pressure up to ~2x and impulse up to
  ~2.5x (USACE 1991).
- Bubble pulses: secondary shocks under 20% of the peak, but they can carry up to 4x the
  impulse (USACE 1991, citing Cole).
- Non-constant sound speed with depth (Glasstone's data assume "isovelocity" water).
