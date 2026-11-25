# Section 7 plan: low and surface bursts (direct shock into the water, crater, waves)

## Goal
When the fireball touches or nearly touches the sea, the explosion drives a shock straight into
the water, blows a crater in the surface, and sends out waves. This section covers bursts from about
10 ft/kt^⅓ *above* the water to 15 ft/kt^⅓ *below* it. (Scaled distances: for 1 Mt that's about
30 m above to 45 m below.) It also covers the waves and their growth as they reach shallow water.

## Part A: shock into the water (`effects/near_surface_shock.py`)
**Source:** the U.S. Defense Nuclear Agency handbook EM-1 (1996), as reproduced in DTRA-TR-01-19
(Eneva, Stevens & Murphy 2004), pp. 4–5. I checked it against the page image.

- **Peak pressure:** P_max = A·ε / R^n psi.
  - R is in ft/kt^⅓, and A = 10⁴·(217.6)^n.
  - n = 1.4·e^(−D/35.4) + 1.13, which depends on the receiver's scaled depth D.
- **Coupling ε:** the fraction of a fully submerged burst's pressure, depending on the scaled burst
  depth x (negative = above the water):
  - **Small yields (< 1 kt):** fully given. ε = 0.2 at the surface, rising to 1 at 15 ft/kt^⅓ deep, and
    about 0.02 at 10 ft/kt^⅓ above.
  - **Large yields (> 20 kt):** given only from 0 to 0.82 ft/kt^⅓ deep (ε = 0.018 at the surface,
    i.e. about 2%). The two pieces of the formula for above the water and deeper down aren't
    printed. Filling those gaps is **my assumption**, labelled in the code:
    - above the water: same shape as the small-yield curve, scaled down;
    - deeper: the small-yield shape, shifted to join at 0.82.
  - **In between (1–20 kt):** EM-1's interpolation formula.
- **Checks:**
  - Coupling at the surface gives 0.20, 0.162, 0.114 and 0.056 for 1, 5, 10 and 16 kt. These match
    the values the report quotes.
  - The fully submerged case gives 2,920 psi against Glasstone's 2,700 (8% apart).
  - Measured: a 1961 Soviet 16 kt burst 1.1 m above the water. Coupling was about 4%, matching the
    quieter sound recorded 35 km away.
- **Pulse shape for the biology section:** the same exponential decay as Section 1 at that
  distance, with the peak replaced by this one. This is **my assumption**, so the injury reports will
  lean on peak-pressure criteria here.
- **Bursts deeper than 15 ft/kt^⅓:** use Section 1. Higher than 10 ft/kt^⅓ above: use Section 2.

## Part B: waves (`effects/water_waves.py`)
- **Deep water:** H ≈ 40,500·W^0.54/R (ft, kt; ±35%), Glasstone Eq. 6.119.1. This matches
  Le Méhauté & Wang's (1996) "most probable" table *exactly* (1 Mt gives 55.5 ft at 5 nautical miles),
  which I re-computed.
  - **Upper estimate:** 2.25× higher, from Le Méhauté's "upper critical depth" peak for bursts just
    below the surface.
  - **Valid water depths:** 256–850·W^0.25 ft.
- **Wave period and length:** T ≈ 14.1·W^0.144 s and L ≈ 1010·W^0.288 ft (Glasstone §6.119).
- **Arrival time:** the wave front moves at √(g·d); the largest wave moves at g·T/4π (Le Méhauté
  Eq. 1.14).
- **Shallow water:** H ≈ 150·d_w·W^0.25/R (Glasstone §6.121).
  - **A test will show openly** that this formula underpredicts Glasstone's own BAKER measurements by
    about 1.6–1.9× (Table 6.57).
  - The simulator shows a range up to the BAKER-matched value.
- **Surface and above-water bursts:** less wave energy, because more is vented into the air
  (Le Méhauté §1.4; Hardtack report WT-1611). No formula exists, so these get the deep-water value
  as an *upper* estimate, flagged. Air bursts high enough to keep the fireball off the water are
  treated as making negligible waves.
- **Crater:** Le Méhauté Eqs. 3.2a/b (from chemical-explosive data):
  - radius ≈ 9.5–10.8·W^0.3 ft;
  - depth ≈ 1.5–3.1·W^0.24 ft (W in lb).
  - Plus Glasstone's BAKER column and base-surge facts in the guide.
- **Approaching the coast:**
  - Green's law: height grows as depth^(−¼) as a wave moves into shallower water.
  - Waves break when height reaches 0.78× the water depth (Le Méhauté Eq. 1.25).
  - Flooding can reach about 2× the approaching wave height (Glasstone §2.71).
  - Le Méhauté notes these waves always break offshore and don't behave like tsunamis.

## Tests
- Coupling values above. Big-yield coupling at 0.82 ft/kt^⅓ joins smoothly.
- Wave formula equals Le Méhauté's table. Wave period values match (e.g. 1 kt gives 14.7 s).
- BAKER comparison (documents the underprediction). Green's law and breaking limit.

## Deliverables
- Two modules and a plot script:
  - shock pressure in the water vs distance and depth, for different burst heights around the surface;
  - wave height vs distance, plus what happens approaching a coast.
- The biology reports will use the new shock model for near-surface bursts.
- Guide **Chapter 8**: coupling, venting, the crater and column, base surge, waves and shoaling,
  how sure we are.

## Honest limits
- **Large-yield coupling has gaps** (above the water, and deeper than 0.82 ft/kt^⅓). They're filled by
  my assumption, labelled.
- **Possible unit mix-up in the source:** the source's own 16 kt example only works if metres and
  feet were mixed up. I'll show it, not hide it.
- **Waves for surface bursts** have no formula, only an upper estimate.
- **Mostly chemical-explosive data:** most wave fits are from chemical explosives; the only nuclear
  wave data are from shallow lagoons.
- **Not modelled:** the bubble's later pulses, and the base surge's radioactivity.
