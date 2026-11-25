#import "template.typ": *

= Heat from the fireball, and what it does to the sea

_Simulator section 5. Code: `src/nukesim/effects/thermal.py` and `thermal_water.py`._

A nuclear fireball is, for a few seconds, brighter than the Sun as seen from nearby. About a
third of the weapon's energy comes out as *thermal radiation*: light and heat. On land it
causes burns and fires. At sea, two very different things happen: the top skin of the water
is heated intensely, while the water just centimetres below barely warms at all.

== Thermal radiation

For an air burst, roughly *35%* of the yield is emitted as thermal radiation within the first
minute or less (Glasstone & Dolan §7.04). It travels at the speed of light, so it arrives
before the blast wave.

The pulse comes in two parts (§7.03, §7.85--7.86):

- a brief first flash, carrying only about 1% of the energy;
- the main pulse, which peaks at a time $t_"max" approx 0.0417 W^(0.44)$ seconds and has
  delivered about 80% of its energy by $10 t_"max"$. For 20 kt the peak comes at 0.16 s;
  for 1 Mt it comes at 0.87 s, with most of the heat arriving over the next 8 seconds or so.

#analogy[A small weapon delivers its heat like a camera flash; a large one like holding your hand
near an open oven door for several seconds. The same total heat delivered more slowly does
somewhat less damage, because the skin has time to carry some of it away. That's why burn
thresholds go up with yield.]

== How much heat arrives

Heat is measured as *radiant exposure*: energy per area, usually in *calories per square
centimetre* (cal/cm²). One cal/cm² is 41,840 joules per square metre. Glasstone's basic
equation (Eq. 7.96.3) is:

$ Q approx (85.6 f W tau) / D^2 $

with $Q$ in cal/cm², $f$ the thermal fraction (0.35), $W$ the yield in kt, $D$ the slant
distance in thousands of feet, and $tau$ the *transmittance*: the fraction that makes it
through the air. It's the inverse-square law again (chapter 3), times the air's losses.

The simulator uses Fletcher et al.'s fit (Eq. 2.106), which builds in the transmittance for a
*clear day* (50-mile visibility). For a burst touching the surface it uses 70% of the yield,
because dust, spray and water vapour near the burst absorb part of the heat (§7.20). Haze,
fog or rain would reduce the exposure considerably (§7.13--7.15).

== Burns on deck

A person on a boat facing the fireball receives the full exposure. Fletcher's fits for bare
white skin give, for example:

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Yield*], [*1st-degree burn*], [*2nd-degree burn*]),
  [1 kt], [about 2.1 cal/cm²], [about 4.0 cal/cm²],
  [1 Mt], [about 3.1 cal/cm²], [about 6.5 cal/cm²],
)

Very dark skin can burn at about two-thirds of these exposures (§12.64). Clothing protects,
but some fabrics can ignite at higher exposures (Table 7.35).

#fig("/output/guide_figures/thermal_water.png")[Left: heat reaching the sea vs distance for
1 Mt at 2,000 m (clear day), with burn levels. Right: temperature rise and remaining energy vs
depth 3 km from ground zero.]

== The sea surface: reflection

A little of the heat bounces off the water. For light from straight overhead it's only about 2%,
rising to about 4% at 55° from vertical and a third at 80° (glancing light). These come from the
*Fresnel equations* of optics (Mobley's _Ocean Optics Web Book_). Far from ground zero the heat
also comes in at a slant, so the flat sea surface catches less of it per square metre than a
person facing the fireball does.

== Into the water: every colour behaves differently

The fireball's light resembles a very hot object at about 6,000 K (§7.76), similar to sunlight.
Its energy is spread across ultraviolet, visible light and infrared. Water treats each
wavelength very differently. Measured absorption values for pure water (Segelstein 1981; Pope &
Fry 1997) give the depth over which each colour is reduced to about a third:

#table(
  columns: (auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Light*], [*Fades within about…*]),
  [blue-green (0.5 µm)], [50 m],
  [red (0.7 µm)], [1.6 m],
  [near infrared (1 µm)], [3 cm],
  [infrared (2 µm)], [0.15 mm],
  [infrared (3 µm)], [1 µm (a thousandth of a millimetre)],
)

Adding it all up for the whole spectrum:

- about 12% of the energy is absorbed in the top *millimetre*;
- about 22% in the top *centimetre*;
- about half in the top *metre*;
- the rest, mostly blue-green light, spreads over tens of metres.

#keyidea[Because so much energy is dumped into such a thin skin, the very top of the sea can be
heated to boiling while the water a few centimetres below warms by only a few degrees.]

== Heating and boiling

The temperature rise of each thin layer is the energy it absorbs divided by its heat capacity:

$ Delta T = E / (rho c Delta z) $

where $rho c$ is about 4.1 million J per cubic metre per °C for seawater (Sharqawy et al. 2010).
Wherever the water would go past 100 °C, the extra energy instead boils water off. Each kilogram
takes about 2.26 MJ.

*Worked example.* 1 Mt at 2,000 m above the sea, 3 km from ground zero (clear day). The flat
sea surface receives about 93 cal/cm² (3.7 MJ/m², after about 5% reflection):

#table(
  columns: (auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Depth*], [*Temperature rise*]),
  [top half-millimetre], [reaches boiling; about 0.1 mm of water boils off],
  [1 mm], [about +34 °C],
  [1 cm], [about +5 °C],
  [10 cm], [about +0.6 °C],
  [1 m], [less than +0.1 °C],
)

So for a fish even 10 cm below the surface, the heat flash is harmless as *heat*. What does
reach depth is an intense flash of *light*: at 10 m, about a quarter of the energy is still
travelling down, mostly as blue-green light.

#caution[
- *The heating near the surface is an upper estimate.* The atmosphere's water vapour removes many
  of the same infrared wavelengths that seawater would absorb in its top millimetre, and the
  simulator doesn't yet subtract them. Real surface heating and boiling would be lower.
- *Heat conduction* during the pulse is ignored; over a few seconds heat spreads about a
  millimetre, which smooths out the very top layer.
- The absorption data are for *pure* water. Seawater with plankton and sediment stops visible
  light sooner, so less light reaches fish at depth.
- *Clear day only*: Fletcher's fit assumes 50-mile visibility.
- Spray, steam clouds and the fireball touching the water (low bursts) aren't modelled.
- Glasstone & Dolan's chapter on thermal radiation says almost nothing about water surfaces.
  Combining their formulas with standard optics and water data is this project's own approach.
]

== Where to find this in the code

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Code*], [*What it does*]),
  [`thermal.radiant_exposure_cal_cm2`], [Fletcher Eqs. 2.106/2.107: heat vs distance],
  [`thermal.burn_thresholds_cal_cm2`], [Fletcher Eqs. 2.110/2.111: skin-burn levels],
  [`thermal.fresnel_reflectance`], [reflection off the water vs angle],
  [`thermal_water.fraction_remaining`], [energy still travelling at a depth (spectral absorption)],
  [`thermal_water.heat_profile`], [temperature rise and boiling vs depth],
  [`scripts/plot_thermal_water.py`], [the plots above],
)

#questions(
  [Why does the thermal radiation arrive before the blast wave?],
  [Why does a 1 Mt weapon need a higher exposure (cal/cm²) to cause a burn than a 1 kt weapon?],
  [Roughly what fraction of the heat entering the sea is absorbed in the top centimetre, and why so much?],
  [Why can the very top of the sea boil while water 10 cm below warms by less than a degree?],
  [Why does the flat sea surface far from ground zero receive less heat per square metre than a person standing on a boat at the same spot?],
  [Give two reasons the simulator's surface heating is probably too high.],
)

#answers(
  [It is light, which travels at about 300,000 km/s; the blast wave travels at roughly the speed of sound.],
  [Large weapons deliver their heat over several seconds instead of a fraction of a second, so the skin has time to lose some of it.],
  [About a fifth (22%). Water absorbs infrared extremely strongly, and a large part of the fireball's energy is infrared.],
  [The infrared part is absorbed within millimetres, concentrating a lot of energy in a tiny volume. The light that goes deeper is spread over metres, so it heats each bit of water only slightly.],
  [Far away, the rays arrive at a glancing angle, so the same beam is spread over a larger area of flat water. More is also reflected at glancing angles.],
  [The atmosphere's water vapour removes much of the infrared before it arrives (not modelled), and heat conduction during the pulse (also not modelled) would spread out the heat in the top millimetre.],
)
