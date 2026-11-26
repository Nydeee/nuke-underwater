// The animals (and people) you can put in the sea, with typical adult values.
//
// kind       : what the physics treats it as (fish / mammal / turtle / diver / person)
// mass_kg    : typical adult body mass (you can change it per animal in the list)
// length_m   : typical adult length, used to draw it at true size in the realistic view
// swim_bladder (fish): whether it has a gas-filled swim bladder (the main blast-injury organ in fish)
// hearing_group (mammals): U.S. Navy Phase 4 hearing groups (LF baleen whales, HF dolphins and most
//   toothed whales, VHF porpoises, PW true seals in water, OW sea lions and fur seals in water)
// Masses and lengths are typical textbook/field-guide values for adults, rounded; they are
// starting values, not data from the effect models.

export const SPECIES = {
  // ---- fish
  sardine:  { group: "fish", kind: "fish", label: "Sardine", icon: "fish", mass_kg: 0.1, length_m: 0.2, swim_bladder: true, z_m: -8 },
  mackerel: { group: "fish", kind: "fish", label: "Atlantic mackerel", icon: "fish", mass_kg: 0.5, length_m: 0.35, swim_bladder: false, z_m: -15,
    note: "Atlantic mackerel has no swim bladder, so it is much less sensitive to blast." },
  cod:      { group: "fish", kind: "fish", label: "Atlantic cod", icon: "fish", mass_kg: 5, length_m: 0.8, swim_bladder: true, z_m: -40 },
  salmon:   { group: "fish", kind: "fish", label: "Atlantic salmon", icon: "fish", mass_kg: 4, length_m: 0.75, swim_bladder: true, z_m: -10 },
  tuna:     { group: "fish", kind: "fish", label: "Bluefin tuna", icon: "fish", mass_kg: 250, length_m: 2.2, swim_bladder: true, z_m: -25 },
  grouper:  { group: "fish", kind: "fish", label: "Grouper", icon: "fish", mass_kg: 10, length_m: 0.9, swim_bladder: true, z_m: -30 },
  // ---- large animals
  dolphin:  { group: "big", kind: "mammal", label: "Bottlenose dolphin", icon: "dolphin", mass_kg: 200, length_m: 2.8, hearing_group: "HF", z_m: -10 },
  orca:     { group: "big", kind: "mammal", label: "Orca", icon: "whale", mass_kg: 4000, length_m: 7, hearing_group: "HF", z_m: -10 },
  shark:    { group: "big", kind: "fish", label: "Great white shark", icon: "shark", mass_kg: 1000, length_m: 4.5, swim_bladder: false, z_m: -15,
    note: "Sharks have no swim bladder (an oily liver keeps them afloat)." },
  sealion:  { group: "big", kind: "mammal", label: "Sea lion", icon: "seal", mass_kg: 200, length_m: 2.2, hearing_group: "OW", z_m: -5 },
  humpback: { group: "big", kind: "mammal", label: "Humpback whale", icon: "whale", mass_kg: 30000, length_m: 14, hearing_group: "LF", z_m: -20 },
  sperm:    { group: "big", kind: "mammal", label: "Sperm whale", icon: "whale", mass_kg: 35000, length_m: 15, hearing_group: "HF", z_m: -40 },
  // ---- turtles
  green:       { group: "turtle", kind: "turtle", label: "Green turtle", icon: "turtle", mass_kg: 150, length_m: 1.1, z_m: -5 },
  loggerhead:  { group: "turtle", kind: "turtle", label: "Loggerhead turtle", icon: "turtle", mass_kg: 115, length_m: 0.95, z_m: -5 },
  leatherback: { group: "turtle", kind: "turtle", label: "Leatherback turtle", icon: "turtle", mass_kg: 500, length_m: 1.8, z_m: -10 },
  // ---- seabirds (blast criteria: Damon et al. 1974, birds of 0.1-4.2 kg)
  gull:        { group: "bird", kind: "bird", label: "Herring gull", icon: "bird", mass_kg: 1.0, length_m: 0.6, z_m: 30 },
  tern:        { group: "bird", kind: "bird", label: "Common tern", icon: "bird", mass_kg: 0.12, length_m: 0.35, z_m: 15 },
  frigatebird: { group: "bird", kind: "bird", label: "Frigatebird", icon: "bird", mass_kg: 1.3, length_m: 1.0, z_m: 80 },
  // ---- people
  diver:    { group: "diver", kind: "diver", label: "Diver", icon: "diver", mass_kg: 75, length_m: 1.8, z_m: -10 },
  boat:     { group: "boat", kind: "person", label: "Person on a boat", icon: "speedboat", length_m: 8, z_m: 2 },
  // ---- ships (TM 23-200 damage criteria; crew on deck and below deck)
  fishingboat: { group: "boat", kind: "ship", ship_type: "small_craft", label: "Fishing boat", icon: "fishingboat", length_m: 22, z_m: 2 },
  destroyer:   { group: "boat", kind: "ship", ship_type: "destroyer", label: "Destroyer", icon: "ship", length_m: 150, z_m: 2 },
  carrier:     { group: "boat", kind: "ship", ship_type: "carrier", label: "Aircraft carrier", icon: "carrier", length_m: 330, z_m: 2 },
};

// older names (saved files and links from before species existed)
export const ALIASES = { fish: "cod", whale: "humpback" };
export const speciesOf = (key) => SPECIES[ALIASES[key] || key];

export const GROUPS = [
  { key: "fish", label: "Fish", icon: "fish" },
  { key: "big", label: "Big animals", icon: "dolphin" },
  { key: "turtle", label: "Turtle", icon: "turtle" },
  { key: "bird", label: "Seabird", icon: "bird" },
  { key: "diver", label: "Diver", icon: "diver" },
  { key: "boat", label: "Boats & ships", icon: "ship" },
];
/** The icon (icons.js) for something in the sea. */
export const iconOf = (r) => r.icon || speciesOf(r.preset)?.icon || "fish";
export const speciesIn = (group) => Object.entries(SPECIES).filter(([, s]) => s.group === group);
