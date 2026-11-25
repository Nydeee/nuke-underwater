#import "template.typ": *

= Waves, spray, ragdolls, schools of fish and danger distances

_Code: `waves3d.js`, `spray.js`, `ragdoll.js`, `schools.js` (the drawing) and
`src/nukesim/biology/zones.py` (the danger distances)._

This chapter covers six things:
- real waves on the sea surface;
- flying spray from bursts in or on the water;
- bodies that are thrown and go limp when the blast reaches them;
- whole schools of fish;
- the danger distances, which say how far each kind of harm reaches;
- the underwater gas bubble, with its rises and pulses.

== Real waves on the sea

The sea surface itself now moves. Its shape comes from the wave model of chapter 8:
- the height of the biggest waves at each distance (the upper estimate, crest to trough);
- their period;
- the speed at which the group of waves travels outwards.

Around that biggest wave we draw a few crests ahead and a longer train behind, which is how waves
from a sudden splash spread out. The crests move twice as fast as the group, as they do in deep
water. Steep crests turn white with foam, and boats rise, fall and tip with the water.

#caution[Waves from small bursts are often under a metre high, which is hard to see from far away.
*Settings → Exaggerate the waves* draws them ten times taller. When it is on, the picture is not to
scale (the app says so); the numbers in the results never change.]

== Flying water

A burst in or on the sea throws water into the air. We draw thousands of clumps of spray, each flying
on a ballistic arc: up, then back down under gravity. Three things appear by themselves:
- the *spray dome*, which bursts up first;
- the hollow *column*;
- the water raining back down, which feeds the base surge.

The overall height and width of the column are the BAKER sizes scaled by the cube root of the yield,
as before. How the individual droplets fly is drawing.

== Ragdolls: bodies that are thrown

When the pressure pulse reaches a person or an animal hard enough to injure it ("likely" or worse in
the results), its 3D model goes limp and is thrown. A small physics engine, *cannon-es*, takes over:
- *People* (on a boat, or divers) become a jointed body: head, chest, hips, arms and legs.
- *Fish, dolphins and whales* get a bendy spine, so they flex and tumble.
- *Turtles* tumble as one piece.

How hard the push is comes from physics:
- *In water*, a shock wave moves the water itself at $u = p slash (rho c)$, where $p$ is the peak
  pressure, $rho$ the density of seawater and $c$ the speed of sound in it. A body moves with the water
  around it.
- *In air*, the wind behind the blast front has speed
  $ u = (5 p slash 7 P_0) c_0 slash sqrt(1 + 6 p slash 7 P_0) $
  from the shock relations in Glasstone & Dolan ch. III. A person only reaches part of that wind
  speed; we use a quarter (our choice).

#keyidea[The *injury levels* always come from the injury models. The ragdoll only *illustrates*
them. The joints, the tumbling, the water drag and the floating are drawing, not measurements. Untick
*Animate injuries* in Settings to switch it off.]

*Rigged people.* People are no longer built from boxes and capsules. They use a free, public-domain
(CC0) model, "Animated Human" by Quaternius, which has a real skeleton (hips, spine, neck, head, arms,
hands, legs and feet) and a skin that bends with it:
- people on boats play its idle animation, shifting their weight;
- divers lie flat in a wetsuit and do a slow flutter kick, with their tank, vest, mask and fins
  attached to the right bones;
- when a ragdoll takes over, the physics bodies drive the real bones, so the whole body bends
  naturally: knees buckle, arms swing, and the person can be thrown off the deck into the sea.

*Artist-made animals.* The fish, sharks, dolphins, whales, sea lions, turtles and seabirds are also
free models made by artists, no longer shapes built in code:
- from Quaternius (public domain, CC0): a small fish (used, recoloured, for sardine, cod and salmon), a
  deep-bodied fish (grouper), a mackerel, a tuna, a shark, a dolphin and a humpback-like whale. Most come
  with a skeleton and a swimming animation, which they play;
- from Poly by Google (CC-BY 3.0, which means we must name them): a sperm whale, an orca, a sea turtle
  (recoloured for loggerhead and leatherback), a sea lion and two flying gulls (the darker one, darkened
  further, is the frigatebird).

The schools of fish now use the sardine model too, a thousand copies at once, each waving its tail
until the pressure pulse hurts it.

Divers' gear (tank, vest, mask and fins) is fitted to the body *as it is posed*, measured from the
bones, so it stays on when a ragdoll takes over: the fins ride on the feet.

The models without an animation are bent a little every frame: fish wave their tails from side to side,
whales and dolphins beat their flukes up and down (as real ones do), birds flap and turtles paddle.
When a ragdoll takes over, the animal is frozen in its current pose and given the same bendy spine as
before. All of this is drawing; it changes no result.

*Keeping a ragdoll in one piece.* Early ragdolls sometimes bent in ways no body can: knees folding
forward, elbows bending backwards, joints pulling apart and limbs whirling. A test page throws a person
80 times (pushes of 2 to 40 m/s, standing on a deck and swimming) and measures what goes wrong. The
fixes, each checked against those numbers:
- knees and elbows are *hinges* that turn about the bone's own axis, one way only (knee from 5° past
  straight to 135°, elbow to 140°), like real joints;
- hips, shoulders, neck and spine swing within cones aimed the way they really move (a hip swings much
  further forward than back), with realistic twist limits (hip 40°, shoulder 60°);
- the twist of each joint is measured from directions that agree at the start; before, cannon-es could
  count a joint as "over-twisted" from the first moment, and the snap back set the whole body spinning;
- the whole body starts with one gentle tumble instead of each part spinning its own way;
- the physics takes smaller steps (1/120 s) with more solver passes.

#table(
  columns: (auto, auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Worst case in 80 throws*], [*before*], [*after*]),
  [knee bent the wrong way], [94°], [5°],
  [elbow bent the wrong way], [180°], [2° beyond the model's own pose],
  [joints pulled apart, under water], [22 cm], [0.1 cm],
  [joints pulled apart, on a deck], [6.6 cm], [2.7 cm (for a moment, on impact)],
  [fastest spin of a body part], [490 rad/s], [25 rad/s],
)

These limits are drawing; they do not change any injury result.

== Schools of fish

The realistic view now has about a thousand small fish in seven shoals. The shoals sit from well
inside the distance where fish are killed to beyond the distance where they are only "possibly"
hurt. Each fish is hit at the moment the pressure pulse reaches its distance, and what happens to
it comes from the danger distances below:
- inside the "killed" distance, fish turn belly-up and slowly drift up (the drifting is
  illustrative);
- a bit farther out they roll onto their side;
- farther still they are only stunned and tip over;
- beyond that they carry on swimming.

The *School of fish* camera button puts you at the edge of the killing zone.

== How far the danger reaches

For each kind of animal, person and ship, the app now finds the *farthest distance* at which each
level of harm still happens. It does this by moving the animal outwards from the burst and running
the same injury model as everywhere else. The kinds are:
- a 5 kg cod (with a swim bladder) and a mackerel (without one), 10 m deep;
- a dolphin and a humpback whale;
- a diver;
- a person on deck;
- a small boat and a destroyer (for ships it is the hull damage; the crew are the "person on deck").

Simple mode lists the main ones in plain words ("Fish killed out to 1.1 km"). Expert shows the whole
table. Either can draw the distances as circles on the sea.

#caution[A circle is the farthest point where that level still happens along one line out from the
burst. Close in, some models are outside their tested range; the warnings in each animal's report
still apply.]

== The gas bubble of an underwater burst

Underwater, the fireball becomes a huge bubble of hot gas and steam. It does not just grow and vanish:
it overshoots, collapses, and bounces back two or three times (Glasstone secs. 2.86--2.88, 6.51). Each
time it collapses it sends out a second, weaker pressure wave, a *bubble pulse*. After its first
expansion it also starts to *rise*.

The simulator now follows three cycles:

#table(
  columns: (auto, 1fr), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*What*], [*Where it comes from*]),
  [first size and timing], [Cole's TNT bubble law (as before) and Rayleigh's bubble equation],
  [later cycles], [periods in the ratios *measured* at the WIGWAM test (30 kt at 2,000 ft): 1 : 0.91 : 0.66
    (Snay et al. 1957); the size of each cycle in proportion to its period],
  [rising], [none before the first maximum; then the rise per cycle that Snay calculated for WIGWAM,
    scaled with the bubble's size (our assumption)],
  [venting], [it bursts through the surface when its top reaches it],
)

#keyidea[A check: for WIGWAM itself our first maximum radius is 97 m; Snay's prediction was 316 ft
(96 m). Our first period, 2.3 s, is shorter than the measured 2.87 s, because Rayleigh's equation
ignores the gas inside the bubble.]

The strength of the bubble pulses for nuclear bursts has no published figure, so only their *timing*
is shown: the bubble wobbles as it collapses, and a faint shell races outwards from it at each pulse.

== Seabirds

Gulls, terns and frigatebirds can now be added. They fly at a set height and flap their wings. Their
blast criteria come from shock-tube tests on birds (Damon et al. 1974, Lovelace Foundation), as peak
overpressure for birds in the open:

#table(
  columns: (auto, auto), stroke: 0.4pt + luma(180), inset: 6pt,
  table.header([*Overpressure*], [*Result*]),
  [below 5 psi], [no injuries],
  [10 psi], [slight to extensive injuries],
  [20 psi], [about half are killed],
)

Birds near the 10-megaton Mike test were found burned, dark-feathered ones worse (Donaldson 1953). No
heat threshold for birds is published, though, so burns are noted but not assessed.

== Bikini Atoll

*Conditions → Place → Bikini Atoll* draws the real atoll around the burst. The BAKER example chooses
it by itself. What is drawn:
- the reef rim, sampled from OpenStreetMap, with the 9-mile Enyu Channel gap in the south-east;
- the lagoon;
- the main islands at their real positions (Bikini Island is about 6 km from where BAKER went off).

The atoll is about 26 by 15 miles; the lagoon averages 150 ft deep and the reef is about half a mile
wide (USGS Professional Paper 260-A).

#caution[The physics still uses *one* water depth everywhere: 55 m, the depth at the BAKER site. The
reef, the islands and the deep ocean outside the atoll are only drawn; they do not change the shock or
the waves in the model.]
