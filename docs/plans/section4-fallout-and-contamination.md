# Section 4 plan: fallout on the sea and radioactive seawater

## Goal
For a burst at or over the sea, find where radioactive fallout lands on the water and how it
sinks and mixes into the sea. Then, over hours to weeks, find the radiation dose rate and the
total dose for:
- something *in* the water (a fish or diver at any depth);
- something *above* it (a person on a boat).

## When there is local fallout at all
- Bursts higher than about 180·W^0.4 ft produce no significant local fallout (Glasstone §2.128, ±30%;
  §9.51). For those, the simulator says so and stops. This covers most air bursts.
- Water-surface bursts put only **20–30%** of the radioactivity into early fallout, against about 60%
  for land (Glasstone §9.59), because the particles are mostly sea-salt and water drops (§9.53).

## Part A: where the fallout lands (`effects/fallout.py`)
- **Pattern:** Glasstone's idealized fallout pattern (Table 9.93). It gives the downwind distance,
  maximum width and ground-zero width for 8 dose-rate levels (1–3,000 rads/hr at 1 h), as
  powers of W, with a 15 mph wind. I've read the table in the source text.
- **Wind speed:** Glasstone's wind-scaling factor F (§9.97, valid 8–45 mph).
- **Weapon type:** contour values are multiplied by the fission fraction (§9.94).
- **Over water:** the table is for land, so the simulator multiplies by (20–30%) / 60% for a water
  surface. This is our adjustment based on §9.59, shown as a range and labelled as such.
- **Arrival time:** distance divided by wind speed (§9.91). The cloud radius is ignored for now.
- **Output:** the "1-hour reference dose rate" R₁ at any point. That's the land-equivalent dose
  rate 3 ft above a smooth surface, 1 hour after the burst.

## Part B: radioactivity in the water (`effects/sea_contamination.py`)
- **Amount of radioactivity:** Glasstone §9.159 says 530 gamma-megacuries per kt of fission at
  1 h, with an average gamma energy of 0.7 MeV, corresponds to 2,900 rads/hr over 1 sq mi. This
  converts R₁ into becquerels of gamma activity per square metre of sea.
- **Sinking and mixing:** from the Redwing 1956 measurements (WT-1317 and the Redwing summary report):
  - the activity starts in the top 10–20 m;
  - it sinks at 3–4 m per hour;
  - it stops at the thermocline (40–60 m; user-settable, default 60 m);
  - it stays fairly evenly spread above the thermocline for at least 2 days.
- **Decay:** dose rate ∝ t^−1.2 (Glasstone Eq. 9.147.1). That's within 25% to about 2 weeks and
  within a factor of 2 to about 6 months (§9.15).
- **Dose to a receiver in the water:** inside the contaminated layer, all the gamma energy released
  nearby is absorbed nearby, so the dose rate is concentration × 0.7 MeV. It is about half that at
  the surface, and close to zero below the thermocline.
- **Dose above the water (on a boat):** about half the in-water value at the surface.
- **Totals:** accumulated dose over any time window (Glasstone Eq. 9.150.1).

## Key check (already done by hand)
Mixing Glasstone's activity into 60 m of seawater predicts a dose rate above the water about
**1,170× lower** than over land. Redwing's measured factor was **about 1,000×**. This becomes a test.

## Other tests
- The 7:10 rule: 7× later gives 10× lower dose rate.
- Table 9.93 contour sizes reproduced. Wind factor F = 1 at 15 mph.
- No fallout above the 180·W^0.4 ft height.
- Mixing depth grows at the stated rate and stops at the thermocline. Concentration × depth stays
  constant (no radioactivity is lost).

## Deliverables
- `fallout.py`, `sea_contamination.py`, and a script that plots:
  - the fallout pattern on the sea;
  - dose rate over time for a fish at depth and for a person on a boat.
- Guide **Chapter 4**: what fallout is, half-lives and the t^−1.2 rule, why the sea "hides"
  fallout, the mixed layer and thermocline, neutron-activated seawater (Na-24, Cl-38), how sure
  we are.

## Not in this section (and why)
- **Uptake into fish and the dose from inside the fish:** this needs radioactivity broken down by
  individual radioactive element. The international factors are already found (IAEA TRS-422 for
  how much fish take up; ICRP 136 for dose per amount). This belongs with the biology section, where
  the dose-rate effect levels for fish (ICRP, UNSCEAR) will also be used.
- **Seawater made radioactive by neutrons** (Na-24, 15 h half-life; Cl-38, 37 min): no source gives
  the amount per kiloton. Redwing found Na-24 made up 33–65% of the dose rate after 24 h for
  water-surface shots. The simulator will flag this as a possible underestimate during the first
  couple of days rather than invent a number.
- **Underwater bursts:** the BAKER "pool" data (Glasstone Table 9.57) go in the guide as real-world
  reference only.
- **Rain washout, currents and sideways spreading** beyond the idealized pattern.
