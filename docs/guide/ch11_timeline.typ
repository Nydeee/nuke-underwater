#import "template.typ": *

= Watching it happen: the timeline

_Code: `src/nukesim/timeline.py` (the timing) and `src/nukesim/web/static/timeline.js` (the slider)._

The earlier chapters answer *how bad* each effect gets. The timeline answers *when*. Under the 3D
view there is a slider like the one on a video. Drag it, or press play, and the scene shows what is
happening at that moment: the fireball growing and fading, the blast front sweeping over the water,
waves moving out, and fallout drifting downwind. Each animal or boat stays grey until something
reaches it, then takes the colour of the worst effect that has happened *so far*.

== Why the slider is "logarithmic"

The interesting moments are spread over a huge range of times:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Time after the burst*], [*What happens*]),
  [microseconds to milliseconds], [The fireball forms and grows.],
  [about 0.1--1 s], [The heat flash peaks (for 20 kt, about 0.16 s).],
  [seconds], [The blast front crosses kilometres of water; the pressure pulse reaches animals and boats.],
  [first minute], [Initial radiation (neutrons and gamma rays) is over.],
  [minutes], [The biggest water waves travel outward (about 17 m/s for 20 kt).],
  [minutes to hours], [Fallout lands downwind, carried by the wind.],
  [days to weeks], [Fallout in the sea decays and mixes deeper.],
)

On an ordinary slider the first minute would be a tiny sliver at the left. So each *power of ten*
gets the same width: 1 ms to 10 ms takes as much room as 1 day to 10 days. That's what
"logarithmic" means. The *speed* menu works the same way: "×10 every 3 s" means the clock
multiplies by ten every three seconds. There are also *real time* speeds, useful in the first few
seconds.

The coloured marks on the slider are *events* (like chapters in a video): the heat peak, the blast
reaching the water, the pulse reaching each animal, waves, fallout. Click one to jump there.

#keyidea[The timeline adds *no new physics*. Every time it shows comes from a model in an earlier
chapter. The simulator already knew *when* things arrive; it just didn't show it.]

== Where each time comes from

*The air blast front (chapter 2).* Brode's Eq. 40 gives the time the shock takes to reach a
distance. The timeline needs it the other way round: *where is the front at time $t$?* Because
the arrival time always increases with distance, the computer finds the distance by
*bisection*: guess a distance, check whether the arrival time is too early or too late, halve the
interval, and repeat until it is exact. A test checks that turning the answer back into an arrival
time gives the same $t$. Far out, the front slows to the speed of sound (about 340 m/s), as it should.

*The fireball (chapter 5).* Early on, the fireball's edge *is* the shock front, so we use the same
radius, up to the maximum fireball size from Glasstone (Eq. 2.127). Its brightness follows the
*thermal power*: how quickly Fletcher's "fraction of heat delivered so far" (Eq. 2.112) is rising.

*Burns.* Heat travels at the speed of light, but it isn't delivered all at once. A boat's burn
colour appears at the moment the heat received *so far* (total × fraction delivered) passes the
burn threshold.

*The pressure pulse (chapters 1, 2 and 8).* We take the very same pressure history the injury
criteria use and say the pulse "arrives" when it first passes 1% of its peak. For bursts above
the water, nothing can arrive before the blast reaches the water above the animal, so we never
show it earlier than that.

*Water waves (chapter 8).* The very first ripple travels at $sqrt(g d)$ ($g$ = gravity, $d$ =
water depth). The *biggest* waves travel much slower, at $g T slash 4 pi$, where $T$ is the wave
period. In the deep open ocean the first-ripple speed isn't meaningful in our model, so only the
biggest-wave ring is drawn there.

*Fallout (chapter 4).* Particles are assumed to drift with the wind, so they land at
(distance) ÷ (wind speed). Once there, the dose rate falls as $t^(-1.2)$ and the contamination
mixes deeper at 3--4 m per hour, exactly as in chapter 4. The slider then shows the *dose rate now*
and the *dose so far*.

== What the timeline does *not* know

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Thing*], [*What we do instead*]),
  [How fast initial radiation arrives], [Neutrons arrive within about a second (Glasstone sec. 8.51). For gamma rays, the share in the first second depends strongly on yield and distance: about 65% at 1,000 yards from 20 kt, but only about 5% at 2,500 yards from 5 Mt (sec. 8.47). There is no formula for this, so the simulator shows the dose as "arriving" for the first minute and counts it complete at 1 minute.],
  [Fireball growth after "breakaway"], [It keeps the shock-front radius until the full size. This is a rough sketch in the middle of the growth.],
  [The last ~20% of the heat], [Fletcher's fit stops at about 80% delivered. The fade-out after that is only illustrative.],
  [The rising cloud and the mushroom], [Not drawn.],
  [Fallout before 1 hour], [The $t^(-1.2)$ rule only works from about 1 hour on, so the first hour of fallout dose isn't counted. The time particles spend rising and falling out of the cloud isn't included either.],
)

#caution[Times near the start (the first seconds) are much better known than the fallout times,
which depend on the weather. Treat fallout arrival times as rough estimates.]

#questions(
  [On the logarithmic slider, is the distance from 1 s to 1 min bigger or smaller than from 1 min to 1 hour?],
  [Why does a fish 10 m under the water feel the air blast slightly *after* it sweeps over the water above it?],
  [A 20 kt burst on the water's surface, wind 15 mph (about 6.7 m/s). Roughly when does fallout reach a boat 2 km downwind?],
  [Why does the simulator not say exactly how much of the initial radiation arrives in the first second?],
)

#answers(
  [The same: both are a factor of 60, so they take the same width.],
  [The pressure has to travel down through the water, which takes a little time (or, far out, it fades with depth and its peak comes slightly later).],
  [2,000 m ÷ 6.7 m/s ≈ 300 s, about 5 minutes. (The dose-rate formula is only used from 1 hour on.)],
  [The published sources only give it for two examples (65% and 5%), and it depends strongly on yield and distance. There's no formula to use, so the simulator doesn't invent one.],
)
