/**
 * Environment definitions and curated SRD monster-to-environment mapping
 * 
 * The D&D 5e SRD API does not include environment/terrain tags for monsters.
 * This file provides a hand-curated mapping of all ~330 SRD monsters to their
 * typical environments based on D&D 5e lore.
 * 
 * Environment IDs follow the standard terrain types from the DMG/XGtE.
 * Users can override or extend these mappings in future versions.
 */

// ─── Environment Definitions ──────────────────────────────────────────────

export interface EnvironmentDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const ENVIRONMENTS: EnvironmentDefinition[] = [
  { id: "arctic",     name: "Arctic",      icon: "❄️",  description: "Frozen tundras, glacial regions, and icy wastelands" },
  { id: "coastal",    name: "Coastal",     icon: "🏖️",  description: "Beaches, cliffs, shorelines, and tidal caves" },
  { id: "desert",     name: "Desert",      icon: "🏜️",  description: "Sandy wastelands, arid dunes, and scorching badlands" },
  { id: "forest",     name: "Forest",      icon: "🌲",  description: "Woodlands, jungles, groves, and dense thickets" },
  { id: "grassland",  name: "Grassland",   icon: "🌾",  description: "Plains, savannas, meadows, and open prairies" },
  { id: "hill",       name: "Hill",        icon: "⛰️",  description: "Rolling hills, highlands, and rocky outcrops" },
  { id: "mountain",   name: "Mountain",    icon: "🏔️",  description: "Peaks, alpine passes, and high-altitude terrain" },
  { id: "swamp",      name: "Swamp",       icon: "🐊",  description: "Marshes, bogs, wetlands, and mangrove forests" },
  { id: "underdark",  name: "Underdark",   icon: "🕳️",  description: "Deep underground caverns, tunnels, and subterranean realms" },
  { id: "underwater", name: "Underwater",  icon: "🌊",  description: "Ocean depths, lakes, rivers, and aquatic environments" },
  { id: "urban",      name: "Urban",       icon: "🏰",  description: "Cities, towns, ruins, dungeons, and civilized areas" },
];

// ─── Monster Environment Mapping ──────────────────────────────────────────

export interface MonsterEnvironmentEntry {
  /** SRD API index (e.g., "goblin") */
  index: string;
  /** Array of environment IDs this monster can be found in */
  environments: string[];
}

/**
 * Curated mapping of all SRD monsters to their typical environments.
 * Based on D&D 5e lore, monster type, habitat, and common encounter logic.
 * 
 * Sorted alphabetically by index for easy maintenance.
 */
export const MONSTER_ENVIRONMENTS: MonsterEnvironmentEntry[] = [
  // ── A ──
  { index: "aboleth",                    environments: ["underdark", "underwater"] },
  { index: "acolyte",                    environments: ["urban", "forest", "hill"] },
  { index: "adult-black-dragon",         environments: ["swamp"] },
  { index: "adult-blue-dragon",          environments: ["desert", "coastal"] },
  { index: "adult-brass-dragon",         environments: ["desert"] },
  { index: "adult-bronze-dragon",        environments: ["coastal"] },
  { index: "adult-copper-dragon",        environments: ["hill", "mountain"] },
  { index: "adult-gold-dragon",          environments: ["grassland", "forest", "mountain"] },
  { index: "adult-green-dragon",         environments: ["forest"] },
  { index: "adult-red-dragon",           environments: ["mountain", "hill"] },
  { index: "adult-silver-dragon",        environments: ["mountain", "urban"] },
  { index: "adult-white-dragon",         environments: ["arctic"] },
  { index: "air-elemental",             environments: ["mountain", "desert", "arctic"] },
  { index: "ancient-black-dragon",       environments: ["swamp"] },
  { index: "ancient-blue-dragon",        environments: ["desert", "coastal"] },
  { index: "ancient-brass-dragon",       environments: ["desert"] },
  { index: "ancient-bronze-dragon",      environments: ["coastal"] },
  { index: "ancient-copper-dragon",      environments: ["hill", "mountain"] },
  { index: "ancient-gold-dragon",        environments: ["grassland", "forest", "mountain"] },
  { index: "ancient-green-dragon",       environments: ["forest"] },
  { index: "ancient-red-dragon",         environments: ["mountain", "hill"] },
  { index: "ancient-silver-dragon",      environments: ["mountain", "urban"] },
  { index: "ancient-white-dragon",       environments: ["arctic"] },
  { index: "androsphinx",               environments: ["desert", "urban"] },
  { index: "animated-armor",            environments: ["urban", "underdark"] },
  { index: "ankheg",                    environments: ["grassland", "forest", "hill"] },
  { index: "ape",                       environments: ["forest"] },
  { index: "archmage",                  environments: ["urban", "mountain"] },
  { index: "assassin",                  environments: ["urban"] },
  { index: "awakened-shrub",            environments: ["forest", "grassland", "swamp"] },
  { index: "awakened-tree",             environments: ["forest", "swamp"] },
  { index: "axe-beak",                  environments: ["grassland", "hill"] },

  // ── B ──
  { index: "baboon",                    environments: ["forest", "hill"] },
  { index: "badger",                    environments: ["forest", "grassland", "hill"] },
  { index: "balor",                     environments: ["underdark", "urban"] },
  { index: "bandit",                    environments: ["forest", "grassland", "hill", "urban", "coastal", "desert"] },
  { index: "bandit-captain",            environments: ["forest", "grassland", "hill", "urban", "coastal", "desert"] },
  { index: "basilisk",                  environments: ["mountain", "underdark", "desert"] },
  { index: "bat",                       environments: ["forest", "underdark", "urban"] },
  { index: "bear-black",               environments: ["forest"] },
  { index: "bear-brown",               environments: ["forest", "mountain", "hill", "arctic"] },
  { index: "bear-polar",               environments: ["arctic"] },
  { index: "behir",                     environments: ["mountain", "underdark"] },
  { index: "berserker",                 environments: ["arctic", "mountain", "forest", "grassland"] },
  { index: "black-bear",                environments: ["forest"] },
  { index: "black-dragon-wyrmling",     environments: ["swamp"] },
  { index: "black-pudding",             environments: ["underdark", "swamp"] },
  { index: "blink-dog",                 environments: ["forest", "grassland"] },
  { index: "blood-hawk",               environments: ["mountain", "grassland", "coastal", "arctic"] },
  { index: "blue-dragon-wyrmling",      environments: ["desert", "coastal"] },
  { index: "boar",                      environments: ["forest", "grassland", "hill"] },
  { index: "bone-devil",               environments: ["underdark", "urban"] },
  { index: "brass-dragon-wyrmling",     environments: ["desert"] },
  { index: "bronze-dragon-wyrmling",    environments: ["coastal"] },
  { index: "brown-bear",                environments: ["forest", "mountain", "hill", "arctic"] },
  { index: "bugbear",                   environments: ["forest", "underdark", "hill"] },
  { index: "bulette",                   environments: ["grassland", "hill", "mountain"] },

  // ── C ──
  { index: "camel",                     environments: ["desert"] },
  { index: "cat",                       environments: ["urban", "forest"] },
  { index: "centaur",                   environments: ["grassland", "forest"] },
  { index: "chain-devil",              environments: ["underdark", "urban"] },
  { index: "chimera",                   environments: ["mountain", "hill"] },
  { index: "chuul",                     environments: ["underwater", "swamp", "underdark"] },
  { index: "clay-golem",               environments: ["urban", "underdark"] },
  { index: "cloaker",                   environments: ["underdark"] },
  { index: "cloud-giant",              environments: ["mountain", "arctic"] },
  { index: "cockatrice",               environments: ["grassland", "swamp"] },
  { index: "commoner",                 environments: ["urban", "grassland", "forest", "hill", "coastal"] },
  { index: "constrictor-snake",         environments: ["forest", "swamp"] },
  { index: "copper-dragon-wyrmling",    environments: ["hill", "mountain"] },
  { index: "couatl",                    environments: ["forest", "grassland", "urban"] },
  { index: "crab",                      environments: ["coastal", "underwater"] },
  { index: "crocodile",                environments: ["swamp", "coastal"] },
  { index: "cult-fanatic",             environments: ["urban", "underdark"] },
  { index: "cultist",                   environments: ["urban", "underdark", "forest"] },

  // ── D ──
  { index: "darkmantle",               environments: ["underdark"] },
  { index: "death-dog",                environments: ["desert", "underdark"] },
  { index: "deep-gnome-svirfneblin",   environments: ["underdark"] },
  { index: "deer",                      environments: ["forest", "grassland"] },
  { index: "deva",                      environments: ["urban", "mountain"] },
  { index: "dire-wolf",                environments: ["forest", "arctic", "hill"] },
  { index: "djinni",                    environments: ["desert", "mountain"] },
  { index: "doppelganger",             environments: ["urban", "underdark"] },
  { index: "draft-horse",              environments: ["urban", "grassland"] },
  { index: "dragon-turtle",            environments: ["coastal", "underwater"] },
  { index: "dretch",                    environments: ["underdark", "swamp"] },
  { index: "drider",                    environments: ["underdark"] },
  { index: "druid",                     environments: ["forest", "swamp", "grassland", "mountain"] },
  { index: "dryad",                     environments: ["forest"] },
  { index: "duergar",                   environments: ["underdark"] },
  { index: "dust-mephit",              environments: ["desert", "underdark"] },

  // ── E ──
  { index: "eagle",                     environments: ["mountain", "hill", "grassland"] },
  { index: "earth-elemental",          environments: ["mountain", "underdark", "hill"] },
  { index: "efreeti",                   environments: ["desert"] },
  { index: "elephant",                  environments: ["grassland", "forest"] },
  { index: "elk",                       environments: ["forest", "grassland", "hill"] },
  { index: "erinyes",                   environments: ["urban", "underdark"] },
  { index: "ettercap",                  environments: ["forest", "underdark"] },
  { index: "ettin",                     environments: ["hill", "mountain", "underdark"] },

  // ── F ──
  { index: "fire-elemental",           environments: ["desert", "mountain", "underdark"] },
  { index: "fire-giant",               environments: ["mountain", "underdark"] },
  { index: "flesh-golem",              environments: ["urban", "underdark"] },
  { index: "flying-snake",             environments: ["forest", "desert", "coastal"] },
  { index: "flying-sword",             environments: ["urban", "underdark"] },
  { index: "frog",                      environments: ["swamp", "forest", "coastal"] },
  { index: "frost-giant",              environments: ["arctic", "mountain"] },

  // ── G ──
  { index: "gargoyle",                  environments: ["urban", "mountain"] },
  { index: "gelatinous-cube",          environments: ["underdark", "urban"] },
  { index: "ghast",                     environments: ["underdark", "swamp", "urban"] },
  { index: "ghost",                     environments: ["urban", "underdark", "swamp"] },
  { index: "ghoul",                     environments: ["underdark", "swamp", "urban"] },
  { index: "giant-ape",                environments: ["forest"] },
  { index: "giant-badger",             environments: ["forest", "hill"] },
  { index: "giant-bat",                environments: ["underdark", "forest"] },
  { index: "giant-boar",               environments: ["forest", "grassland", "hill"] },
  { index: "giant-centipede",          environments: ["underdark", "forest", "swamp"] },
  { index: "giant-constrictor-snake",   environments: ["forest", "swamp", "underdark"] },
  { index: "giant-crab",               environments: ["coastal", "underwater"] },
  { index: "giant-crocodile",          environments: ["swamp", "coastal"] },
  { index: "giant-eagle",              environments: ["mountain", "grassland"] },
  { index: "giant-elk",                environments: ["forest", "grassland", "hill"] },
  { index: "giant-fire-beetle",        environments: ["underdark", "forest"] },
  { index: "giant-frog",               environments: ["swamp", "forest"] },
  { index: "giant-goat",               environments: ["mountain", "hill"] },
  { index: "giant-hyena",              environments: ["grassland", "desert"] },
  { index: "giant-lizard",             environments: ["desert", "forest", "underdark"] },
  { index: "giant-octopus",            environments: ["underwater", "coastal"] },
  { index: "giant-owl",                environments: ["forest", "arctic"] },
  { index: "giant-poisonous-snake",    environments: ["forest", "swamp", "underdark"] },
  { index: "giant-rat",                environments: ["urban", "underdark", "swamp"] },
  { index: "giant-scorpion",           environments: ["desert", "underdark"] },
  { index: "giant-sea-horse",          environments: ["underwater", "coastal"] },
  { index: "giant-shark",              environments: ["underwater", "coastal"] },
  { index: "giant-spider",             environments: ["forest", "underdark", "urban"] },
  { index: "giant-toad",               environments: ["swamp", "forest", "underdark"] },
  { index: "giant-vulture",            environments: ["desert", "grassland", "mountain"] },
  { index: "giant-wasp",               environments: ["forest", "grassland", "urban"] },
  { index: "giant-weasel",             environments: ["forest", "grassland"] },
  { index: "giant-wolf-spider",        environments: ["forest", "grassland", "underdark"] },
  { index: "gibbering-mouther",        environments: ["underdark"] },
  { index: "glabrezu",                 environments: ["underdark", "urban"] },
  { index: "gladiator",                environments: ["urban"] },
  { index: "gnoll",                     environments: ["grassland", "forest", "desert", "hill"] },
  { index: "goat",                      environments: ["mountain", "hill", "grassland"] },
  { index: "goblin",                    environments: ["forest", "hill", "underdark", "grassland"] },
  { index: "gold-dragon-wyrmling",     environments: ["grassland", "forest"] },
  { index: "gorgon",                    environments: ["grassland", "hill"] },
  { index: "gray-ooze",                environments: ["underdark", "swamp"] },
  { index: "green-dragon-wyrmling",    environments: ["forest"] },
  { index: "green-hag",                environments: ["swamp", "forest"] },
  { index: "grick",                     environments: ["underdark"] },
  { index: "griffon",                   environments: ["mountain", "hill", "grassland"] },
  { index: "grimlock",                  environments: ["underdark"] },
  { index: "guard",                     environments: ["urban", "grassland", "forest"] },
  { index: "guardian-naga",             environments: ["forest", "urban"] },
  { index: "gynosphinx",               environments: ["desert", "urban"] },

  // ── H ──
  { index: "half-red-dragon-veteran",   environments: ["mountain", "urban"] },
  { index: "harpy",                     environments: ["mountain", "coastal", "forest"] },
  { index: "hawk",                      environments: ["mountain", "grassland", "forest"] },
  { index: "hell-hound",               environments: ["mountain", "underdark", "urban"] },
  { index: "hezrou",                    environments: ["underdark", "swamp"] },
  { index: "hill-giant",               environments: ["hill", "mountain", "grassland"] },
  { index: "hippogriff",               environments: ["mountain", "grassland", "hill"] },
  { index: "hobgoblin",                environments: ["grassland", "hill", "forest", "underdark"] },
  { index: "homunculus",               environments: ["urban"] },
  { index: "horned-devil",             environments: ["underdark", "urban"] },
  { index: "hunter-shark",             environments: ["underwater", "coastal"] },
  { index: "hydra",                     environments: ["swamp", "coastal"] },
  { index: "hyena",                     environments: ["grassland", "desert"] },

  // ── I ──
  { index: "ice-devil",                environments: ["arctic", "underdark"] },
  { index: "ice-mephit",               environments: ["arctic", "mountain"] },
  { index: "imp",                       environments: ["urban", "underdark"] },
  { index: "invisible-stalker",         environments: ["urban", "mountain"] },
  { index: "iron-golem",               environments: ["urban", "underdark"] },

  // ── J ──
  { index: "jackal",                    environments: ["desert", "grassland"] },

  // ── K ──
  { index: "killer-whale",             environments: ["underwater", "coastal", "arctic"] },
  { index: "knight",                    environments: ["urban", "grassland"] },
  { index: "kobold",                    environments: ["forest", "underdark", "hill", "mountain"] },
  { index: "kraken",                    environments: ["underwater", "coastal"] },

  // ── L ──
  { index: "lamia",                     environments: ["desert"] },
  { index: "lemure",                    environments: ["underdark"] },
  { index: "lich",                      environments: ["underdark", "urban"] },
  { index: "lion",                      environments: ["grassland", "desert"] },
  { index: "lizard",                    environments: ["forest", "desert", "swamp"] },
  { index: "lizardfolk",               environments: ["swamp", "coastal"] },

  // ── M ──
  { index: "mage",                      environments: ["urban"] },
  { index: "magma-mephit",             environments: ["mountain", "underdark"] },
  { index: "magmin",                    environments: ["mountain", "underdark"] },
  { index: "mammoth",                   environments: ["arctic", "grassland"] },
  { index: "manticore",                environments: ["mountain", "grassland", "arctic"] },
  { index: "marilith",                 environments: ["underdark", "urban"] },
  { index: "mastiff",                   environments: ["urban", "grassland", "forest"] },
  { index: "medusa",                    environments: ["urban", "desert"] },
  { index: "merfolk",                   environments: ["underwater", "coastal"] },
  { index: "merrow",                    environments: ["underwater", "coastal"] },
  { index: "mimic",                     environments: ["underdark", "urban"] },
  { index: "minotaur",                  environments: ["underdark", "mountain"] },
  { index: "minotaur-skeleton",         environments: ["underdark", "urban"] },
  { index: "mule",                      environments: ["urban", "grassland", "hill"] },
  { index: "mummy",                     environments: ["desert", "underdark"] },
  { index: "mummy-lord",               environments: ["desert", "underdark"] },

  // ── N ──
  { index: "nalfeshnee",               environments: ["underdark"] },
  { index: "night-hag",                environments: ["underdark", "swamp"] },
  { index: "nightmare",                environments: ["underdark"] },
  { index: "noble",                     environments: ["urban"] },
  { index: "nothic",                    environments: ["underdark", "urban"] },

  // ── O ──
  { index: "ochre-jelly",              environments: ["underdark", "swamp"] },
  { index: "octopus",                   environments: ["underwater", "coastal"] },
  { index: "ogre",                      environments: ["hill", "mountain", "forest", "swamp"] },
  { index: "ogre-zombie",              environments: ["hill", "swamp", "underdark"] },
  { index: "oni",                       environments: ["forest", "hill", "urban"] },
  { index: "orc",                       environments: ["forest", "hill", "mountain", "underdark"] },
  { index: "orc-war-chief",            environments: ["forest", "hill", "mountain"] },
  { index: "otyugh",                    environments: ["underdark", "urban", "swamp"] },
  { index: "owl",                       environments: ["forest", "arctic"] },
  { index: "owlbear",                   environments: ["forest"] },

  // ── P ──
  { index: "panther",                   environments: ["forest", "grassland"] },
  { index: "pegasus",                   environments: ["grassland", "mountain", "forest"] },
  { index: "phase-spider",             environments: ["underdark", "forest"] },
  { index: "pit-fiend",                environments: ["underdark", "urban"] },
  { index: "planetar",                 environments: ["mountain", "urban"] },
  { index: "plesiosaurus",             environments: ["underwater", "coastal"] },
  { index: "poisonous-snake",          environments: ["forest", "swamp", "desert"] },
  { index: "polar-bear",               environments: ["arctic"] },
  { index: "pony",                      environments: ["urban", "grassland"] },
  { index: "priest",                    environments: ["urban"] },
  { index: "pseudodragon",             environments: ["forest", "urban"] },
  { index: "pteranodon",               environments: ["coastal", "mountain", "grassland"] },
  { index: "purple-worm",              environments: ["underdark", "desert"] },

  // ── Q ──
  { index: "quasit",                    environments: ["urban", "underdark"] },
  { index: "quipper",                   environments: ["underwater", "coastal"] },

  // ── R ──
  { index: "rakshasa",                  environments: ["urban"] },
  { index: "rat",                       environments: ["urban", "underdark"] },
  { index: "raven",                     environments: ["forest", "swamp", "urban"] },
  { index: "red-dragon-wyrmling",      environments: ["mountain", "hill"] },
  { index: "reef-shark",               environments: ["underwater", "coastal"] },
  { index: "remorhaz",                 environments: ["arctic"] },
  { index: "rhinoceros",               environments: ["grassland"] },
  { index: "riding-horse",             environments: ["urban", "grassland"] },
  { index: "roc",                       environments: ["mountain", "arctic", "coastal"] },
  { index: "roper",                     environments: ["underdark"] },
  { index: "rug-of-smothering",        environments: ["urban", "underdark"] },
  { index: "rust-monster",             environments: ["underdark"] },

  // ── S ──
  { index: "saber-toothed-tiger",      environments: ["arctic", "mountain"] },
  { index: "sahuagin",                  environments: ["underwater", "coastal"] },
  { index: "salamander",               environments: ["underdark", "mountain"] },
  { index: "satyr",                     environments: ["forest"] },
  { index: "scorpion",                  environments: ["desert"] },
  { index: "scout",                     environments: ["forest", "grassland", "hill", "mountain", "arctic"] },
  { index: "sea-hag",                  environments: ["coastal", "underwater", "swamp"] },
  { index: "sea-horse",               environments: ["underwater", "coastal"] },
  { index: "shadow",                    environments: ["underdark", "urban", "swamp"] },
  { index: "shambling-mound",          environments: ["swamp", "forest"] },
  { index: "shield-guardian",           environments: ["urban", "underdark"] },
  { index: "shrieker",                  environments: ["underdark"] },
  { index: "silver-dragon-wyrmling",   environments: ["mountain", "arctic"] },
  { index: "skeleton",                  environments: ["underdark", "urban", "desert", "swamp"] },
  { index: "solar",                     environments: ["mountain", "urban"] },
  { index: "specter",                   environments: ["underdark", "urban", "swamp"] },
  { index: "spider",                    environments: ["forest", "underdark", "urban"] },
  { index: "spirit-naga",              environments: ["underdark", "swamp"] },
  { index: "sprite",                    environments: ["forest"] },
  { index: "spy",                       environments: ["urban"] },
  { index: "steam-mephit",             environments: ["underdark", "swamp"] },
  { index: "stirge",                    environments: ["forest", "underdark", "swamp", "urban"] },
  { index: "stone-giant",              environments: ["mountain", "underdark"] },
  { index: "stone-golem",              environments: ["urban", "underdark"] },
  { index: "storm-giant",              environments: ["coastal", "mountain", "underwater"] },
  { index: "succubus",                 environments: ["urban", "underdark"] },
  { index: "swarm-of-bats",            environments: ["underdark", "forest", "urban"] },
  { index: "swarm-of-insects",         environments: ["forest", "swamp", "underdark"] },
  { index: "swarm-of-poisonous-snakes", environments: ["forest", "swamp", "desert"] },
  { index: "swarm-of-quippers",        environments: ["underwater", "coastal"] },
  { index: "swarm-of-rats",            environments: ["urban", "underdark", "swamp"] },
  { index: "swarm-of-ravens",          environments: ["forest", "swamp", "urban"] },

  // ── T ──
  { index: "tarrasque",                environments: ["grassland", "urban", "hill"] },
  { index: "thug",                      environments: ["urban"] },
  { index: "tiger",                     environments: ["forest", "grassland"] },
  { index: "treant",                    environments: ["forest"] },
  { index: "tribal-warrior",           environments: ["grassland", "forest", "desert", "arctic", "mountain"] },
  { index: "triceratops",              environments: ["grassland", "forest"] },
  { index: "troll",                     environments: ["hill", "forest", "mountain", "swamp", "underdark"] },
  { index: "tyrannosaurus-rex",        environments: ["grassland", "forest"] },

  // ── U ──
  { index: "unicorn",                   environments: ["forest"] },

  // ── V ──
  { index: "vampire",                   environments: ["urban", "underdark"] },
  { index: "vampire-spawn",            environments: ["urban", "underdark"] },
  { index: "veteran",                   environments: ["urban", "grassland", "hill"] },
  { index: "violet-fungus",            environments: ["underdark"] },
  { index: "vrock",                     environments: ["underdark", "mountain"] },
  { index: "vulture",                   environments: ["desert", "grassland"] },

  // ── W ──
  { index: "warhorse",                  environments: ["urban", "grassland"] },
  { index: "warhorse-skeleton",        environments: ["underdark", "urban"] },
  { index: "water-elemental",          environments: ["underwater", "coastal", "swamp"] },
  { index: "weasel",                    environments: ["forest", "grassland"] },
  { index: "werebear",                 environments: ["forest", "arctic"] },
  { index: "wereboar",                 environments: ["forest", "grassland"] },
  { index: "wererat",                  environments: ["urban", "underdark"] },
  { index: "weretiger",                environments: ["forest", "grassland"] },
  { index: "werewolf",                 environments: ["forest", "hill"] },
  { index: "white-dragon-wyrmling",    environments: ["arctic"] },
  { index: "wight",                     environments: ["underdark", "swamp", "urban"] },
  { index: "will-o-wisp",              environments: ["swamp", "forest", "underdark"] },
  { index: "winter-wolf",              environments: ["arctic"] },
  { index: "wolf",                      environments: ["forest", "grassland", "hill"] },
  { index: "worg",                      environments: ["forest", "grassland", "hill"] },
  { index: "wraith",                    environments: ["underdark", "urban", "swamp"] },
  { index: "wyvern",                    environments: ["mountain", "hill", "coastal"] },

  // ── X ──
  { index: "xorn",                      environments: ["underdark"] },

  // ── Y ──
  { index: "young-black-dragon",       environments: ["swamp"] },
  { index: "young-blue-dragon",        environments: ["desert", "coastal"] },
  { index: "young-brass-dragon",       environments: ["desert"] },
  { index: "young-bronze-dragon",      environments: ["coastal"] },
  { index: "young-copper-dragon",      environments: ["hill", "mountain"] },
  { index: "young-gold-dragon",        environments: ["grassland", "forest"] },
  { index: "young-green-dragon",       environments: ["forest"] },
  { index: "young-red-dragon",         environments: ["mountain", "hill"] },
  { index: "young-silver-dragon",      environments: ["mountain", "arctic"] },
  { index: "young-white-dragon",       environments: ["arctic"] },

  // ── Z ──
  { index: "zombie",                    environments: ["underdark", "urban", "swamp"] },
];

// ─── Lookup Helpers ────────────────────────────────────────────────────────

/** Build a fast lookup map: environment → monster indices */
const _envToMonsters: Map<string, string[]> = new Map();
const _monsterToEnvs: Map<string, string[]> = new Map();

for (const entry of MONSTER_ENVIRONMENTS) {
  _monsterToEnvs.set(entry.index, entry.environments);
  for (const env of entry.environments) {
    if (!_envToMonsters.has(env)) {
      _envToMonsters.set(env, []);
    }
    _envToMonsters.get(env)!.push(entry.index);
  }
}

/**
 * Get all SRD monster indices for a given environment
 */
export function getMonstersForEnvironment(environmentId: string): string[] {
  return _envToMonsters.get(environmentId) || [];
}

/**
 * Get all environments for a given monster index
 */
export function getEnvironmentsForMonster(monsterIndex: string): string[] {
  return _monsterToEnvs.get(monsterIndex) || [];
}

/**
 * Get all environment IDs that have at least one monster mapped
 */
export function getPopulatedEnvironments(): string[] {
  return ENVIRONMENTS.filter(e => (_envToMonsters.get(e.id)?.length ?? 0) > 0).map(e => e.id);
}

// ─── Hexcrawl Terrain → Encounter Environment Mapping ─────────────────────

/**
 * Base mapping from hexcrawl TerrainType to encounter environment IDs.
 * Some hexcrawl terrains map to multiple environments (primary + secondary)
 * to give a broader monster pool.
 */
const TERRAIN_TO_ENVIRONMENTS: Record<string, string[]> = {
  'road':                  ['grassland', 'urban'],
  'plains':                ['grassland'],
  'forest':                ['forest'],
  'hills':                 ['hill'],
  'mountains':             ['mountain'],
  'swamp':                 ['swamp'],
  'desert':                ['desert'],
  'arctic':                ['arctic'],
  'coastal':               ['coastal'],
  'jungle':                ['forest', 'swamp'],
  'underdark':             ['underdark'],
  'water':                 ['underwater', 'coastal'],
  'river':                 ['coastal', 'swamp'],
  'riverside':             ['coastal', 'forest'],
  'river-crossing':        ['coastal', 'grassland'],
  'inferno-river':         ['underdark', 'mountain'],
  'inferno-riverside':     ['underdark', 'mountain'],
  'inferno-river-crossing': ['underdark', 'mountain'],
};

/**
 * Climate can override or add environments to the primary terrain mapping.
 * For example, a "forest" hex in an arctic climate should also include arctic monsters.
 */
const CLIMATE_ENVIRONMENT_OVERRIDES: Record<string, string[]> = {
  'arctic':    ['arctic'],
  'tropical':  ['forest', 'swamp'],
  'arid':      ['desert'],
  'volcanic':  ['underdark'],
  'maritime':  ['coastal', 'underwater'],
  'temperate': [], // No override — use terrain as-is
};

/**
 * Resolve the encounter environment IDs for a given hexcrawl terrain + climate.
 * Returns a deduplicated array of environment IDs, with the primary terrain
 * environments first, optionally augmented by climate-influenced environments.
 *
 * @param terrainType - The hex's terrain (e.g. "forest", "mountains")
 * @param climateType - The hex's climate zone (e.g. "arctic", "volcanic"), or undefined
 */
export function getEnvironmentsForTerrain(
  terrainType: string,
  climateType?: string,
): string[] {
  const baseEnvs = TERRAIN_TO_ENVIRONMENTS[terrainType] ?? ['grassland'];
  const climateEnvs = climateType ? (CLIMATE_ENVIRONMENT_OVERRIDES[climateType] ?? []) : [];

  // Merge and deduplicate, primary environments first
  const merged = [...baseEnvs];
  for (const env of climateEnvs) {
    if (!merged.includes(env)) {
      merged.push(env);
    }
  }
  return merged;
}

/**
 * Get all unique SRD monster indices for a set of environment IDs.
 */
export function getMonstersForEnvironments(environmentIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const envId of environmentIds) {
    for (const mon of getMonstersForEnvironment(envId)) {
      if (!seen.has(mon)) {
        seen.add(mon);
        result.push(mon);
      }
    }
  }
  return result;
}
