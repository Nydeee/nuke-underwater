#import "template.typ": *

= Initial radiation, and why water is a shield

_Simulator section 3. Code: `src/nukesim/effects/initial_radiation.py` and `radiation_shielding.py`._

Besides the blast, a nuclear explosion sends out a burst of invisible, penetrating
radiation. This chapter covers the *initial* (or "prompt") radiation, which arrives within
about the first minute. Radioactive fallout and seawater made radioactive by the explosion
come in a later chapter. The headline result: *a few metres of water block almost all of
it.*

== What the radiation is

Two kinds of initial radiation matter:

- *Gamma rays*: very high-energy light, invisible and far more penetrating than X-rays.
  They come from the nuclear reactions themselves, from neutrons striking nitrogen in the
  air ("nitrogen-capture" gammas, up to about 7.5 MeV), and from the radioactive fission
  products in the rising fireball (mainly 1--2 MeV) (Glasstone & Dolan §8.105).
- *Neutrons*: uncharged particles from the atomic nucleus, released by fission and fusion
  with energies of several MeV (up to 14 MeV for fusion, §8.57). Nearly all of them arrive
  within a second (§8.51).

#analogy[An *MeV* (mega-electronvolt) is a unit of energy for single particles. Visible
light is about 2 eV per photon, so a 2 MeV gamma ray carries about a million times more
energy than a photon of visible light. That's why it can pass through so much material.]

== Measuring radiation dose

*Dose* means the energy radiation deposits in matter, per kilogram:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Unit*], [*Meaning*]),
  [gray (Gy)], [1 joule of energy absorbed per kilogram. The modern SI unit.],
  [rad], [The older unit: 1 rad = 0.01 Gy.],
  [rem, sievert (Sv)], [Dose weighted by how harmful each radiation type is to living tissue. 1 rem = 0.01 Sv.],
)

The old sources this simulator relies on mix rad and rem. At the accuracy we have (about a
factor of 2), the simulator treats 1 rem ≈ 1 rad ≈ 0.01 Gy.

#keyidea[One gray is a tiny amount of *energy*: it would warm water by less than a
thousandth of a degree. Radiation is dangerous because that energy breaks the chemical bonds
in DNA and other molecules, not because of heating. What doses mean for fish and people is
covered in the biology chapter. For now, think of 1 Gy as "seriously harmful to a person",
and 5 Gy as "often lethal without treatment".]

== How much reaches the water surface

The simulator uses a formula fitted by Fletcher et al. (1962) to Glasstone's curves:

$ I = W / d^2 {4997 e^(-9.26 (rho\/rho_0) d) + 1033 (W'/W) e^(-5.42 (rho\/rho_0) d)} quad "rem" $

where $W$ is the yield in kilotons and $d$ the slant distance in *miles*. Reading it piece by
piece:

- $W \/ d^2$ is the *inverse-square law*. Radiation spreads out over the surface of an
  ever-larger sphere, so doubling the distance spreads it over 4× the area.
- The exponentials $e^(-dots d)$ describe *absorption by the air*. Each stretch of air
  removes a fixed fraction. The first term falls faster: the simulator reads it as the
  *neutrons*, and the second as the *gamma rays*.
- $rho \/ rho_0$ is the air density relative to normal (0.9 is used for air bursts).
- $W' \/ W$ is the *hydrodynamic enhancement*. For big weapons the blast wave thins the
  air, so more of the slower-arriving gamma rays get through (Glasstone §8.36). It's 1 up to
  10 kt, about 2.3 at 1 Mt and about 16 at 20 Mt.

#fig("/output/guide_figures/surface_dose.png", width: 85%)[Initial radiation dose reaching
the water surface vs distance for several yields. The inverse-square law and absorption by
the air together make it fall off very steeply.]

*Checking it.* Glasstone & Dolan's 1977 edition works examples with newer curves:

- 50 kt at 2,000 yards gives about 250 rad of gamma (§8.34). The formula gives 176.
- 1 Mt at 4,000 yards gives about 8.3 rad in total (§8.132). The formula gives 7.1.

Both are inside Glasstone's own stated reliability of 0.5--2× (§8.33). Fletcher warns that
the formula is unreliable closer than about 450 m (0.28 miles).

== Why water is such a good shield

=== Gamma rays

Gamma rays are stopped by hitting electrons, and the more mass in the way, the more
electrons. So shielding depends mainly on *mass per area*: a thick layer of light material
does the same job as a thin layer of heavy material.

The handy measure is the *tenth-value thickness* (TVT): the thickness that cuts the dose to
one tenth. Glasstone & Dolan (Table 8.41) give, for water:

- *24 inches (61 cm)* for fission-product gamma rays,
- *39 inches (99 cm)* for the more energetic nitrogen-capture gamma rays.

Two TVTs cut the dose to 1/100, three to 1/1000, and so on:

$ "dose at depth" = "surface dose" times 10^(-"depth" \/ "TVT") $

#keyidea[Glasstone's TVT values are *effective* values. They already include *buildup*:
gamma rays that bounce around inside the water rather than going straight through, which
adds to the dose. Near the surface they are slightly pessimistic (§8.40), which is the safe
side.]

=== Neutrons

Neutrons are stopped best by *hydrogen*. A neutron hitting a hydrogen nucleus (a proton of
almost the same mass) loses on average half its energy in one bounce, like one billiard
ball hitting another. Water is about two-thirds hydrogen atoms, so it's an excellent neutron
shield. Glasstone calls it "very satisfactory" (§8.67).

The simulator uses a *removal cross-section* of 0.103 per cm. That's the chance per
centimetre that a fast neutron is knocked out of the beam, and it means the neutron dose
drops tenfold every *22 cm* or so.

#caution[The neutron number comes from secondary sources that the project could only see in
search snippets; the original wasn't readable. This matters little in practice: neutrons
die out so fast in water that below about half a metre the gamma rays dominate anyway.
High-energy (14 MeV) neutrons from fusion weapons penetrate further, so the simulator's
upper estimate uses a smaller value (0.07 per cm) to cover that.]

== The angle problem, and why the answer is a range

Radiation from the burst enters the water at a slant, so it travels further than the
receiver's depth to reach it. But some of the radiation has been scattered in the air and
comes down from overhead. The simulator therefore gives a *range*:

- *Upper estimate*: the radiation goes straight down (path = depth), the pessimistic TVT is
  used, and high-energy neutrons are assumed.
- *Lower estimate*: the radiation follows the slanted direct path from the burst, with the
  smaller TVT and fission-spectrum neutrons.

#fig("/output/guide_figures/radiation_map.png")[Left: upper-estimate dose in the top 5 m of
water under a 20 kt burst at 500 m. Right: the range of gamma and neutron dose vs depth,
1 km from ground zero.]

*Worked example.* 20 kt at 500 m above the sea, 1 km from ground zero:

#table(
  columns: (auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Depth*], [*Initial radiation dose*]),
  [surface], [about 22 Gy],
  [0.5 m], [0.2 -- 4.8 Gy],
  [1 m], [0.003 -- 1.4 Gy],
  [2 m], [less than 0.13 Gy],
  [5 m], [less than 0.0001 Gy],
)

So for initial radiation, a fish a few metres down is far safer than a swimmer at the
surface or a person on a boat. Remember the blast pressure from chapter 2 still reaches it.

#caution[
- The surface dose comes from a *1962-era generic fit*, reliable to about a factor of 2,
  with no detail about weapon design. Neutron doses especially vary between fission and
  thermonuclear weapons.
- *Gamma rays produced inside seawater* aren't included. They come from neutrons being
  captured by hydrogen (2.2 MeV) and by chlorine (up to about 8.6 MeV); in seawater about a
  third of captures are on chlorine. No source the project found gives the resulting dose.
- *Timing* isn't modelled: the simulator gives the total for the first minute, though most of
  it arrives in the first second or so.
- This chapter is only the *initial* radiation. Fallout and radioactive seawater can deliver
  dose for days to years, and they come next.
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`initial_radiation.fletcher_dose_rem`], [Fletcher Eq. 2.114, neutron and gamma dose],
  [`initial_radiation.gamma_enhancement`], [Fletcher Eq. 2.115, $W' \/ W$],
  [`radiation_shielding.gamma_tvt_m`], [Glasstone Table 8.41, adjusted for water density],
  [`radiation_shielding.compute`], [dose range at a receiver in or above the water],
  [`scripts/plot_radiation_water.py`], [the dose map and depth profile],
)

#questions(
  [What is the difference between a gray and a rem?],
  [Why does the initial radiation dose fall off with distance much faster than the inverse-square law alone?],
  [Why do big weapons have a "hydrodynamic enhancement" of gamma dose?],
  [The surface dose is 20 Gy and the TVT is 1 m. Roughly what is the dose at 3 m depth?],
  [Why is water especially good at stopping neutrons?],
  [Why does the simulator give a range rather than a single number for the dose at depth?],
)

#answers(
  [A gray is energy absorbed per kilogram (1 J/kg). A rem (or sievert) weights the dose by how harmful the type of radiation is to living tissue.],
  [The air also absorbs and scatters radiation, removing a fixed fraction per distance (the exponential terms).],
  [Their blast wave thins the air around the fireball, so more of the slower-arriving gamma rays get through.],
  [Three TVTs: $20 times 10^(-3) = 0.02$ Gy.],
  [Water is two-thirds hydrogen atoms, and hydrogen nuclei have almost the same mass as neutrons, so each collision removes a large share of the neutron's energy.],
  [Radiation arrives both along slanted paths (longer through water) and scattered from overhead (shorter). The true value lies between the two cases.],
)
