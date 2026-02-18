/**
 * Hexcrawl Wilderness Travel System - Type Definitions
 * 
 * Implements the RAW D&D 5e hexcrawl system with 6-mile hexes,
 * terrain-based travel modifiers, survival tracking, and per-hex
 * exploration procedures.
 */

// ─── Terrain System ───────────────────────────────────────────────────────
/** Supported languages for read-aloud hex descriptions. */
export type DescriptionLanguage = 'en' | 'de';

export const DESCRIPTION_LANGUAGES: { id: DescriptionLanguage; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];
/**
 * Terrain types based on DMG/XGtE standard environments.
 * Each terrain has travel speed modifiers and thematic encounter tables.
 */
export type TerrainType =
  | 'plains'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'swamp'
  | 'desert'
  | 'arctic'
  | 'coastal'
  | 'jungle'
  | 'underdark'
  | 'water'
  | 'river'
  | 'riverside'
  | 'river-crossing'
  | 'inferno-river'
  | 'inferno-riverside'
  | 'inferno-river-crossing'
  | 'road';

export interface TerrainDefinition {
  id: TerrainType;
  name: string;
  icon: string;
  color: string; // Fill color for hex overlay
  travelModifier: number; // 1.0 = normal, 0.5 = half speed, etc.
  difficultTerrain: boolean;
  forageDC: number; // Survival DC to forage
  navigationDC: number; // INT/Survival DC to avoid getting lost
  encounterDC: number; // Base DC for random encounter (d20 >= DC triggers)
  description: string;
}

/**
 * Standard terrain definitions with RAW-aligned modifiers.
 * 
 * Travel modifiers based on the article's guidance:
 * - Normal terrain: full speed (4 hexes/day at normal pace)
 * - Difficult terrain: half speed (2 hexes/day)
 * - Very difficult terrain: 1/3 speed
 * 
 * Forage/Navigation DCs from DMG Ch.5 and XGtE.
 */
export const TERRAIN_DEFINITIONS: TerrainDefinition[] = [
  { id: 'road',       name: 'Road',       icon: '🛤️', color: '#A0855B', travelModifier: 1.25, difficultTerrain: false, forageDC: 20, navigationDC: 0,  encounterDC: 20, description: 'Maintained path or trade route — fast, safe travel' },
  { id: 'plains',     name: 'Plains',     icon: '🌾', color: '#90B860', travelModifier: 1.0,  difficultTerrain: false, forageDC: 15, navigationDC: 10, encounterDC: 18, description: 'Open grasslands, meadows, and prairies' },
  { id: 'coastal',    name: 'Coastal',    icon: '🏖️', color: '#E8D5A0', travelModifier: 1.0,  difficultTerrain: false, forageDC: 10, navigationDC: 5,  encounterDC: 18, description: 'Shorelines, beaches, and tidal flats' },
  { id: 'forest',     name: 'Forest',     icon: '🌲', color: '#2D6B30', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 10, navigationDC: 15, encounterDC: 16, description: 'Dense woodlands and thick canopy' },
  { id: 'hills',      name: 'Hills',      icon: '⛰️', color: '#8B7355', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 15, navigationDC: 10, encounterDC: 17, description: 'Rolling highlands and rocky outcrops' },
  { id: 'jungle',     name: 'Jungle',     icon: '🌴', color: '#1A5C1A', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 10, navigationDC: 15, encounterDC: 14, description: 'Tropical jungle with extreme undergrowth' },
  { id: 'swamp',      name: 'Swamp',      icon: '🐊', color: '#5C6B3C', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 10, navigationDC: 15, encounterDC: 15, description: 'Marshes, bogs, and wetlands' },
  { id: 'desert',     name: 'Desert',     icon: '🏜️', color: '#D4A843', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 20, navigationDC: 10, encounterDC: 17, description: 'Arid wastelands and sand dunes' },
  { id: 'mountains',  name: 'Mountains',  icon: '🏔️', color: '#6B6B6B', travelModifier: 0.33, difficultTerrain: true,  forageDC: 20, navigationDC: 15, encounterDC: 16, description: 'Steep peaks and alpine passes' },
  { id: 'arctic',     name: 'Arctic',     icon: '❄️', color: '#B0D4E8', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 20, navigationDC: 10, encounterDC: 17, description: 'Frozen tundra, glaciers, and icy wastes' },
  { id: 'underdark',  name: 'Underdark',  icon: '🕳️', color: '#3C2845', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 20, navigationDC: 20, encounterDC: 12, description: 'Subterranean tunnels and caverns' },
  { id: 'water',          name: 'Water',          icon: '🌊', color: '#4A80B0', travelModifier: 0.0,  difficultTerrain: false, forageDC: 15, navigationDC: 15, encounterDC: 18, description: 'Open water — requires a vessel to cross' },
  { id: 'river',                  name: 'River',                  icon: '🏞️', color: '#5B9BD5', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 10, navigationDC: 10, encounterDC: 17, description: 'Flowing river — may require fording, swimming, or a boat' },
  { id: 'riverside',              name: 'Riverside',              icon: '🚶', color: '#7EB8DA', travelModifier: 0.75, difficultTerrain: false, forageDC: 10, navigationDC: 5,  encounterDC: 17, description: 'Walking along the riverbank — easy travel following the water' },
  { id: 'river-crossing',         name: 'River Crossing',         icon: '🌉', color: '#8FAADC', travelModifier: 1.0,  difficultTerrain: false, forageDC: 10, navigationDC: 5,  encounterDC: 18, description: 'A crossing point — bridge, ford, or ferry over the river' },
  { id: 'inferno-river',          name: 'Inferno River',          icon: '🌋', color: '#CC3300', travelModifier: 0.0,  difficultTerrain: true,  forageDC: 25, navigationDC: 15, encounterDC: 12, description: 'River of molten lava — impassable without magic or fire immunity' },
  { id: 'inferno-riverside',      name: 'Inferno Riverside',      icon: '🔥', color: '#E85C33', travelModifier: 0.5,  difficultTerrain: true,  forageDC: 20, navigationDC: 10, encounterDC: 14, description: 'Walking alongside a lava river — intense heat but passable' },
  { id: 'inferno-river-crossing',  name: 'Inferno River Crossing',  icon: '⛓️', color: '#FF6644', travelModifier: 0.75, difficultTerrain: true,  forageDC: 22, navigationDC: 10, encounterDC: 13, description: 'A crossing over the lava flow — enchanted bridge, cooled obsidian path, or similar' },
];

/**
 * Get a terrain definition by ID
 */
export function getTerrainDefinition(id: TerrainType): TerrainDefinition {
  return TERRAIN_DEFINITIONS.find(t => t.id === id) ?? TERRAIN_DEFINITIONS[1]!; // Default to plains
}

// ─── Hex Terrain Data ─────────────────────────────────────────────────────

/**
 * Per-hex terrain assignment stored on the map.
 * Stored alongside highlights and PoIs in map annotation JSON.
 */
export interface HexTerrain {
  col: number;
  row: number;
  terrain: TerrainType;
  customDescription?: string; // GM's custom read-aloud text for this hex
}

// ─── Climate / Biome Zones ────────────────────────────────────────────────

/**
 * Climate zones that can be painted on top of terrain to modify the
 * flavour and descriptions of hexes. A hex's terrain determines mechanics
 * (travel modifier, DCs), while climate determines narrative flavour.
 *
 * Examples:
 *   arctic + forest  → frozen taiga with frost-crusted pines
 *   volcanic + water → acidic hot springs, steaming geothermal pools
 *   tropical + hills → terraced rice-paddy highlands
 */
export type ClimateType =
  | 'temperate'
  | 'arctic'
  | 'tropical'
  | 'arid'
  | 'volcanic'
  | 'maritime';

export interface ClimateDefinition {
  id: ClimateType;
  name: string;
  icon: string;
  color: string;       // Border tint rendered around hex edge
  description: string; // Short GM-facing tooltip
}

export const CLIMATE_DEFINITIONS: ClimateDefinition[] = [
  { id: 'temperate', name: 'Temperate',  icon: '🌿', color: '#5B9945', description: 'Mild seasons, deciduous forests, rolling farmlands (Sword Coast heartlands)' },
  { id: 'arctic',    name: 'Arctic',     icon: '❄️', color: '#8EC8E8', description: 'Frozen tundra, permafrost, howling winds (Icewind Dale, Eiselcross)' },
  { id: 'tropical',  name: 'Tropical',   icon: '🌺', color: '#E86B30', description: 'Hot, humid jungles, monsoon rains, dense canopy (Chult)' },
  { id: 'arid',      name: 'Arid',       icon: '☀️', color: '#D4A020', description: 'Scorching deserts, sandstorms, oases (Anauroch, Calimshan)' },
  { id: 'volcanic',  name: 'Volcanic',   icon: '🌋', color: '#C83030', description: 'Ash-choked wastelands, lava flows, geothermal vents (Inferno River)' },
  { id: 'maritime',  name: 'Maritime',   icon: '🌊', color: '#4080A0', description: 'Fog-shrouded coasts, salt marshes, briny air (Sword Coast shoreline)' },
];

export function getClimateDefinition(id: ClimateType): ClimateDefinition {
  return CLIMATE_DEFINITIONS.find(c => c.id === id) ?? CLIMATE_DEFINITIONS[0]!;
}

/**
 * Per-hex climate zone assignment, stored separately from terrain.
 * A hex can have terrain (mechanics) + climate (narrative flavour).
 */
export interface HexClimate {
  col: number;
  row: number;
  climate: ClimateType;
}

// ─── Exploration Roles ────────────────────────────────────────────────────

/**
 * Exploration roles that players take when entering a hex.
 * Based on the article's "ALL THE PLAYERS are scouts" system.
 */
export type ExplorationRoleId =
  | 'navigator'
  | 'forager';

export interface ExplorationRole {
  id: ExplorationRoleId;
  name: string;
  icon: string;
  skill: string; // e.g. 'Survival', 'Perception'
  ability: string; // e.g. 'WIS', 'INT'
  description: string;
}

export const EXPLORATION_ROLES: ExplorationRole[] = [
  { id: 'navigator', name: 'Navigator', icon: '🧭', skill: 'Survival',   ability: 'WIS', description: 'Avoid getting lost — Wisdom (Survival) check vs terrain DC (DMG p.112)' },
  { id: 'forager',   name: 'Forager',   icon: '🍖', skill: 'Survival',   ability: 'WIS', description: 'Find food & water — Wisdom (Survival) check, find 1d6+WIS mod lbs on success (DMG p.111)' },
];

// ─── Food & Water Rations (RAW — DMG p.111, PHB p.185) ────────────────────

/**
 * RAW food/water tracking.
 * - A creature needs 1 lb food and 1 gallon water per day.
 * - After 3 + CON modifier days without food → 1 exhaustion/day.
 * - Without water: 1 exhaustion/day (or 2 in extreme heat).
 * - Foraging: DC varies by terrain. On success, find 1d6 + WIS mod lbs food.
 */
export interface RationsState {
  /** Pounds of food the party currently carries */
  foodLbs: number;
  /** Gallons of water the party currently carries */
  waterGallons: number;
  /** Number of party members (for daily consumption) */
  partySize: number;
  /** Consecutive days without sufficient food */
  daysWithoutFood: number;
  /** Consecutive days without sufficient water */
  daysWithoutWater: number;
}

export const DEFAULT_RATIONS: RationsState = {
  foodLbs: 10,
  waterGallons: 10,
  partySize: 4,
  daysWithoutFood: 0,
  daysWithoutWater: 0,
};

// ─── Weather System ───────────────────────────────────────────────────────

export type WeatherSeverity = 'clear' | 'light' | 'moderate' | 'severe' | 'extreme';

export type WeatherType =
  | 'clear'
  | 'overcast'
  | 'fog'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'snow'
  | 'blizzard'
  | 'hail'
  | 'sandstorm'
  | 'extreme-heat'
  | 'extreme-cold';

export interface WeatherCondition {
  type: WeatherType;
  severity: WeatherSeverity;
  name: string;
  icon: string;
  travelModifier: number; // Multiplied with terrain modifier. 1.0 = no effect
  visibilityReduction: string; // Narrative description
  mechanicalEffect: string; // Rules effect
}

export const WEATHER_TABLE: WeatherCondition[] = [
  { type: 'clear',         severity: 'clear',    name: 'Clear Skies',      icon: '☀️', travelModifier: 1.0,  visibilityReduction: 'None',               mechanicalEffect: 'No effects' },
  { type: 'overcast',      severity: 'light',    name: 'Overcast',         icon: '☁️', travelModifier: 1.0,  visibilityReduction: 'Slightly reduced',   mechanicalEffect: 'No effects' },
  { type: 'fog',           severity: 'moderate', name: 'Dense Fog',        icon: '🌫️', travelModifier: 0.75, visibilityReduction: 'Heavily obscured beyond 30 ft', mechanicalEffect: 'Disadvantage on Perception (sight). Navigation DC +5' },
  { type: 'rain',          severity: 'light',    name: 'Light Rain',       icon: '🌧️', travelModifier: 1.0,  visibilityReduction: 'Lightly obscured',   mechanicalEffect: 'Disadvantage on Perception (hearing)' },
  { type: 'heavy-rain',    severity: 'moderate', name: 'Heavy Rain',       icon: '🌧️', travelModifier: 0.75, visibilityReduction: 'Lightly obscured',   mechanicalEffect: 'Disadvantage on Perception. Open flames extinguished' },
  { type: 'thunderstorm',  severity: 'severe',   name: 'Thunderstorm',     icon: '⛈️', travelModifier: 0.5,  visibilityReduction: 'Heavily obscured',   mechanicalEffect: 'Disadvantage on Perception. Navigation DC +5. Risk of lightning' },
  { type: 'snow',          severity: 'moderate', name: 'Snowfall',         icon: '🌨️', travelModifier: 0.75, visibilityReduction: 'Lightly obscured',   mechanicalEffect: 'Terrain becomes difficult. Disadvantage on tracking' },
  { type: 'blizzard',      severity: 'extreme',  name: 'Blizzard',         icon: '❄️', travelModifier: 0.25, visibilityReduction: 'Heavily obscured beyond 10 ft', mechanicalEffect: 'Terrain very difficult. CON save DC 10/hr or 1 exhaustion' },
  { type: 'hail',          severity: 'severe',   name: 'Hailstorm',        icon: '🧊', travelModifier: 0.5,  visibilityReduction: 'Lightly obscured',   mechanicalEffect: '1d4 bludgeoning/hr without cover. Terrain becomes difficult' },
  { type: 'sandstorm',     severity: 'severe',   name: 'Sandstorm',        icon: '💨', travelModifier: 0.25, visibilityReduction: 'Heavily obscured beyond 10 ft', mechanicalEffect: '1d4 slashing/hr without cover. CON save DC 10 or blinded' },
  { type: 'extreme-heat',  severity: 'severe',   name: 'Extreme Heat',     icon: '🔥', travelModifier: 0.75, visibilityReduction: 'Shimmer/mirage',     mechanicalEffect: 'CON save DC 10/hr or 1 exhaustion. Water consumption doubled' },
  { type: 'extreme-cold',  severity: 'severe',   name: 'Extreme Cold',     icon: '🥶', travelModifier: 0.75, visibilityReduction: 'None',               mechanicalEffect: 'CON save DC 10/hr or 1 exhaustion. Cold resistance negates' },
];

// ─── Hexcrawl Travel State ────────────────────────────────────────────────

/**
 * Travel pace modifier for hexcrawl.
 * Applied on top of whichever travel method the party is using.
 */
export type HexcrawlPace = 'slow' | 'normal' | 'fast';

export interface HexcrawlPaceDefinition {
  id: HexcrawlPace;
  name: string;
  modifier: number;           // 0.75 / 1.0 / 1.25
  stealthPossible: boolean;
  perceptionPenalty: boolean;  // -5 passive Perception for fast
  description: string;
}

export const HEXCRAWL_PACES: HexcrawlPaceDefinition[] = [
  { id: 'slow',   name: 'Slow Pace',   modifier: 0.75, stealthPossible: true,  perceptionPenalty: false, description: 'Able to use stealth. ×0.75 speed' },
  { id: 'normal', name: 'Normal Pace', modifier: 1.0,  stealthPossible: false, perceptionPenalty: false, description: 'Standard travel. ×1.0 speed' },
  { id: 'fast',   name: 'Fast Pace',   modifier: 1.25, stealthPossible: false, perceptionPenalty: true,  description: '-5 passive Perception. ×1.25 speed' },
];

/**
 * Travel method categories
 */
export type TravelMethodCategory = 'land' | 'water' | 'air' | 'magic';

/**
 * A specific means of travel (walking, horse, ship, griffon, etc.)
 * hexesPerDay is the base movement at normal pace, before pace/weather modifiers.
 */
export interface TravelMethodDefinition {
  id: string;
  name: string;
  category: TravelMethodCategory;
  icon: string;
  milesPerDay: number;
  hexesPerDay: number; // milesPerDay / 6, rounded
  description: string;
}

export const TRAVEL_METHODS: TravelMethodDefinition[] = [
  // ── Land — On Foot ──────────────────────────────────────
  { id: 'walking',        name: 'Walking',          category: 'land',  icon: '🚶', milesPerDay: 24,  hexesPerDay: 4,  description: 'On foot, standard travel' },

  // ── Land — Mounted ─────────────────────────────────────
  { id: 'horse-riding',   name: 'Horse (Riding)',    category: 'land',  icon: '🐴', milesPerDay: 48,  hexesPerDay: 8,  description: 'Mounted on a riding horse' },
  { id: 'horse-draft',    name: 'Horse (Draft)',     category: 'land',  icon: '🐴', milesPerDay: 40,  hexesPerDay: 7,  description: 'Mounted on a draft horse' },
  { id: 'pony',           name: 'Pony',              category: 'land',  icon: '🐎', milesPerDay: 32,  hexesPerDay: 5,  description: 'Mounted on a pony' },
  { id: 'camel',          name: 'Camel',             category: 'land',  icon: '🐪', milesPerDay: 40,  hexesPerDay: 7,  description: 'Mounted on a camel' },
  { id: 'elephant',       name: 'Elephant',          category: 'land',  icon: '🐘', milesPerDay: 32,  hexesPerDay: 5,  description: 'Riding an elephant' },

  // ── Land — Vehicles ────────────────────────────────────
  { id: 'cart',           name: 'Cart / Wagon',      category: 'land',  icon: '🛒', milesPerDay: 16,  hexesPerDay: 3,  description: 'Horse-drawn cart or wagon' },
  { id: 'carriage',       name: 'Carriage',          category: 'land',  icon: '🎠', milesPerDay: 32,  hexesPerDay: 5,  description: 'Horse-drawn carriage' },

  // ── Water ──────────────────────────────────────────────
  { id: 'rowboat',        name: 'Rowboat',           category: 'water', icon: '🚣', milesPerDay: 15,  hexesPerDay: 3,  description: 'Small rowing boat' },
  { id: 'keelboat',       name: 'Keelboat',          category: 'water', icon: '⛵', milesPerDay: 12,  hexesPerDay: 2,  description: 'River keelboat' },
  { id: 'longship',       name: 'Longship',          category: 'water', icon: '⛵', milesPerDay: 36,  hexesPerDay: 6,  description: 'Viking-style longship' },
  { id: 'sailing-ship',   name: 'Sailing Ship',      category: 'water', icon: '⛵', milesPerDay: 48,  hexesPerDay: 8,  description: 'Ocean-going sailing vessel' },
  { id: 'galley',         name: 'Galley',            category: 'water', icon: '🚢', milesPerDay: 60,  hexesPerDay: 10, description: 'Large oar-powered warship' },
  { id: 'warship',        name: 'Warship',           category: 'water', icon: '⚓', milesPerDay: 30,  hexesPerDay: 5,  description: 'Military sailing vessel' },

  // ── Air — Mounts ───────────────────────────────────────
  { id: 'griffon',        name: 'Griffon',           category: 'air',   icon: '🦅', milesPerDay: 64,  hexesPerDay: 11, description: 'Flying griffon mount' },
  { id: 'hippogriff',     name: 'Hippogriff',        category: 'air',   icon: '🦅', milesPerDay: 64,  hexesPerDay: 11, description: 'Flying hippogriff mount' },
  { id: 'pegasus',        name: 'Pegasus',           category: 'air',   icon: '🦄', milesPerDay: 72,  hexesPerDay: 12, description: 'Winged horse' },
  { id: 'wyvern',         name: 'Wyvern',            category: 'air',   icon: '🐉', milesPerDay: 64,  hexesPerDay: 11, description: 'Wyvern mount' },
  { id: 'giant-eagle',    name: 'Giant Eagle',       category: 'air',   icon: '🦅', milesPerDay: 64,  hexesPerDay: 11, description: 'Giant eagle mount' },

  // ── Air / Magic ────────────────────────────────────────
  { id: 'broom-of-flying',  name: 'Broom of Flying',  category: 'magic', icon: '🧹', milesPerDay: 72,  hexesPerDay: 12, description: 'Magical flying broom' },
  { id: 'carpet-of-flying', name: 'Carpet of Flying', category: 'magic', icon: '🧵', milesPerDay: 64,  hexesPerDay: 11, description: 'Magical flying carpet' },
  { id: 'phantom-steed',    name: 'Phantom Steed',   category: 'magic', icon: '✨', milesPerDay: 104, hexesPerDay: 17, description: 'Phantom horse (3rd-level spell)' },

  // ── Air — Dragons ──────────────────────────────────────
  { id: 'dragon-young',   name: 'Dragon (Young)',    category: 'air',   icon: '🐉', milesPerDay: 80,  hexesPerDay: 13, description: 'Young dragon mount' },
  { id: 'dragon-adult',   name: 'Dragon (Adult)',    category: 'air',   icon: '🐉', milesPerDay: 80,  hexesPerDay: 13, description: 'Adult dragon mount' },
  { id: 'dragon-ancient', name: 'Dragon (Ancient)',  category: 'air',   icon: '🐉', milesPerDay: 80,  hexesPerDay: 13, description: 'Ancient dragon mount' },
];

/** Category display metadata */
export const TRAVEL_METHOD_CATEGORIES: Record<TravelMethodCategory, { label: string; icon: string }> = {
  land:  { label: 'Land',  icon: '🏔️' },
  water: { label: 'Water', icon: '🌊' },
  air:   { label: 'Air',   icon: '☁️' },
  magic: { label: 'Magic', icon: '✨' },
};

/**
 * Log entry for a single hex visited during travel.
 */
export interface TravelLogEntry {
  day: number;
  hexIndex: number; // Which hex of the day (1, 2, 3...)
  col: number;
  row: number;
  terrain: TerrainType;
  weather: WeatherType;
  checks: ExplorationCheckResult[];
  encounterRolled: boolean;
  encounterTriggered: boolean;
  encounterDetails?: string;
  discoveryFound: boolean;
  discoveryDetails?: string;
  /** Whether navigation failed and the party got lost */
  navigationFailed?: boolean;
  /** Food found via foraging (lbs) — 0 if failed */
  foodForaged: number;
  notes: string;
  timestamp: string;
}

/**
 * Result of an exploration role's skill check.
 */
export interface ExplorationCheckResult {
  roleId: ExplorationRoleId;
  playerName?: string;
  dc: number;
  rolled?: number;
  passed: boolean;
  notes?: string;
}

/**
 * The full hexcrawl tracker state, persisted per map.
 */
export interface HexcrawlState {
  /** Whether hexcrawl tracking is active */
  enabled: boolean;
  /** Link to the map ID this state belongs to */
  mapId: string;
  /** Current in-game day number */
  currentDay: number;
  /** How many hexes the party has moved today */
  hexesMovedToday: number;
  /** Current party position on the hex map */
  partyPosition: { col: number; row: number };
  /** Previously visited hex positions (for path drawing) */
  visitedHexes: { col: number; row: number; day: number }[];
  /** Current travel pace */
  pace: HexcrawlPace;
  /** Current travel method (walking, horse, ship, etc.) */
  travelMethod: string;
  /** Food & water rations (RAW) */
  rations: RationsState;
  /** Today's weather */
  currentWeather: WeatherType;
  /** Full travel log */
  travelLog: TravelLogEntry[];
  /** Exploration role assignments (roleId → playerName) */
  roleAssignments: Record<string, string>;
  /** Current exhaustion level for the party (simplified) */
  exhaustionLevel: number;
  /** Hexes traveled since last encounter (progressive encounter DC) */
  hexesSinceEncounter: number;
  /** Timestamp of last update */
  lastModified: string;
  /** Language for auto-generated read-aloud descriptions */
  descriptionLanguage: DescriptionLanguage;
}

/**
 * Default initial hexcrawl state.
 */
export function createDefaultHexcrawlState(mapId: string): HexcrawlState {
  return {
    enabled: false,
    mapId,
    currentDay: 1,
    hexesMovedToday: 0,
    partyPosition: { col: 0, row: 0 },
    visitedHexes: [],
    pace: 'normal',
    travelMethod: 'walking',
    rations: { ...DEFAULT_RATIONS },
    currentWeather: 'clear',
    travelLog: [],
    roleAssignments: {},
    exhaustionLevel: 0,
    hexesSinceEncounter: 0,
    lastModified: new Date().toISOString(),
    descriptionLanguage: 'en',
  };
}
