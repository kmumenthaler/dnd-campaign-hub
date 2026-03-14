/**
 * Chase Complication Tables — environment-specific d20 tables (DMG RAW).
 *
 * Each participant rolls d20 at end of their turn:
 *   1–10 = complication affects the NEXT participant in initiative order.
 *   11–20 = no complication.
 *
 * Tables are generic enough for the GM to narrate flexibly while keeping
 * mechanical crunch (DCs, damage, conditions) faithful to the DMG.
 */

import type {
  ComplicationEntry,
  ComplicationCheckOption,
} from "./types";

// ── Table container ──────────────────────────────────────────

export interface ChaseComplicationTable {
  id: string;
  name: string;
  icon: string;
  entries: ComplicationEntry[];           // d20 results 1–10
  obstacleTemplates: ComplicationEntry[]; // quarry-created obstacles
  narrationPrompts: string[];             // random chase flavour for GM
}

// ── Urban ────────────────────────────────────────────────────

const URBAN_TABLE: ChaseComplicationTable = {
  id: "urban", name: "Urban", icon: "🏙️",
  entries: [
    {
      roll: 1, title: "Blocked Path", type: "check",
      description: "A large obstacle blocks the way ahead.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 15", abilityKey: "Acrobatics", dc: 15 }],
      onFail: { description: "Obstacle slows you. 10 ft. of movement lost.", movementReduction: 10 },
    },
    {
      roll: 2, title: "Dense Crowd", type: "check",
      description: "A crowd blocks the path.",
      checkOptions: [
        { label: "STR (Athletics) DC 10", abilityKey: "Athletics", dc: 10 },
        { label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 },
      ],
      onFail: { description: "Crowd impedes movement. 10 ft. lost.", movementReduction: 10 },
    },
    {
      roll: 3, title: "Barrier", type: "check",
      description: "A barrier blocks the path — smash through or go around.",
      checkOptions: [{ label: "STR Save DC 10", abilityKey: "STR", dc: 10 }],
      onFail: { description: "Bounce off the barrier and fall prone!", condition: "prone" },
    },
    {
      roll: 4, title: "Debris Maze", type: "check",
      description: "A maze of crates, barrels, or rubble fills the area.",
      checkOptions: [
        { label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 },
        { label: "INT DC 10", abilityKey: "INT", dc: 10 },
      ],
      onFail: { description: "Takes time to navigate. 10 ft. lost.", movementReduction: 10 },
    },
    {
      roll: 5, title: "Slippery Ground", type: "check",
      description: "The ground is slick with rain, oil, or some other liquid.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "You fall prone!", condition: "prone" },
    },
    {
      roll: 6, title: "Hostile Animals", type: "check",
      description: "Aggressive animals block the path.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Bitten! 1d4 piercing damage, 5 ft. lost.", damage: "1d4", damageType: "piercing", movementReduction: 5 },
    },
    {
      roll: 7, title: "Violent Disturbance", type: "check",
      description: "A fight or disturbance erupts nearby.",
      checkOptions: [
        { label: "STR (Athletics) DC 15", abilityKey: "Athletics", dc: 15 },
        { label: "DEX (Acrobatics) DC 15", abilityKey: "Acrobatics", dc: 15 },
        { label: "CHA (Intimidation) DC 15", abilityKey: "CHA", dc: 15 },
      ],
      onFail: { description: "Caught in the brawl! 2d4 bludgeoning damage, 10 ft. lost.", damage: "2d4", damageType: "bludgeoning", movementReduction: 10 },
    },
    {
      roll: 8, title: "Bystander", type: "check",
      description: "Someone gets in the way.",
      checkOptions: [
        { label: "STR (Athletics) DC 10", abilityKey: "Athletics", dc: 10 },
        { label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 },
        { label: "CHA (Intimidation) DC 10", abilityKey: "CHA", dc: 10 },
      ],
      onFail: { description: "Can't get past! 5 ft. of movement lost.", movementReduction: 5 },
    },
    {
      roll: 9, title: "Hostile Bystander", type: "gm-adjudicate",
      description: "An aggressive local intervenes and makes an opportunity attack (+3 to hit, 1d6+1 piercing).",
      autoEffect: { description: "GM: resolve the opportunity attack, then apply damage if it hits." },
    },
    {
      roll: 10, title: "Sharp Turn", type: "check",
      description: "A sudden turn or narrow passage ahead.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Collide with something hard! 1d4 bludgeoning damage.", damage: "1d4", damageType: "bludgeoning" },
    },
  ],
  obstacleTemplates: [
    {
      roll: 0, title: "Topple Furniture", type: "check",
      description: "Knock over tables, carts, or barrels to block the path.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 12", abilityKey: "Acrobatics", dc: 12 }],
      onFail: { description: "Blocked! 10 ft. of movement lost, may fall prone.", movementReduction: 10, condition: "prone" },
    },
    {
      roll: 0, title: "Slam Door", type: "check",
      description: "Slam a door, gate, or shutter shut behind you.",
      checkOptions: [{ label: "STR (Athletics) DC 15", abilityKey: "Athletics", dc: 15 }],
      onFail: { description: "Door holds! Lose all movement breaking through.", speedPenalty: "zero" },
    },
    {
      roll: 0, title: "Scatter Goods", type: "check",
      description: "Toss goods, debris, or refuse across the path.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Stumbles through scattered debris. 10 ft. lost.", movementReduction: 10 },
    },
  ],
  narrationPrompts: [
    "The street narrows between tall, overhanging buildings...",
    "Ahead: a busy intersection with shouting vendors...",
    "A side alley branches off into shadow...",
    "The path leads through a dimly lit archway...",
    "Stone steps descend towards the lower quarter...",
    "An open square with a central fountain lies ahead...",
    "Laundry lines criss-cross the alley above...",
    "A bridge spans a muddy canal to the next district...",
  ],
};

// ── Wilderness ───────────────────────────────────────────────

const WILDERNESS_TABLE: ChaseComplicationTable = {
  id: "wilderness", name: "Wilderness", icon: "🌲",
  entries: [
    {
      roll: 1, title: "Dense Vegetation", type: "check",
      description: "Thick brush or roots block the path.",
      checkOptions: [
        { label: "STR (Athletics) DC 10", abilityKey: "Athletics", dc: 10 },
        { label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 },
      ],
      onFail: { description: "Tangled in vegetation. 5 ft. of movement lost.", movementReduction: 5 },
    },
    {
      roll: 2, title: "Uneven Ground", type: "check",
      description: "Rocky, muddy, or sloped terrain threatens to slow you.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Stumble on uneven ground. 10 ft. lost.", movementReduction: 10 },
    },
    {
      roll: 3, title: "Swarming Vermin", type: "gm-adjudicate",
      description: "A swarm of insects or small creatures attacks (+3 to hit, 4d4 piercing).",
      autoEffect: { description: "GM: resolve the swarm's opportunity attack, then apply damage." },
    },
    {
      roll: 4, title: "Natural Obstacle", type: "check",
      description: "A stream, ravine, or fallen tree blocks the path.",
      checkOptions: [
        { label: "STR (Athletics) DC 10", abilityKey: "Athletics", dc: 10 },
        { label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 },
      ],
      onFail: { description: "Obstacle slows progress. 10 ft. lost.", movementReduction: 10 },
    },
    {
      roll: 5, title: "Blinding Debris", type: "check",
      description: "Wind kicks up sand, dirt, ash, or pollen.",
      checkOptions: [{ label: "CON Save DC 10", abilityKey: "CON", dc: 10 }],
      onFail: { description: "Blinded! Speed halved until end of turn.", speedPenalty: "halved", condition: "blinded" },
    },
    {
      roll: 6, title: "Sudden Drop", type: "check",
      description: "The ground drops away unexpectedly.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Fall! 1d6 bludgeoning damage, land prone.", damage: "1d6", damageType: "bludgeoning", condition: "prone" },
    },
    {
      roll: 7, title: "Trap or Snare", type: "check",
      description: "A hidden trap catches you off guard.",
      checkOptions: [{ label: "DEX Save DC 15", abilityKey: "DEX", dc: 15 }],
      onFail: { description: "Caught! Restrained (escape DC 10 STR check).", condition: "restrained", speedPenalty: "zero" },
    },
    {
      roll: 8, title: "Stampede", type: "check",
      description: "Large spooked animals charge through the area.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Knocked about! 2d4 bludgeoning damage.", damage: "2d4", damageType: "bludgeoning" },
    },
    {
      roll: 9, title: "Hazardous Flora", type: "check",
      description: "Thorns, razorvine, or poisonous plants in the path.",
      checkOptions: [{ label: "DEX Save DC 15", abilityKey: "DEX", dc: 15 }],
      onFail: { description: "Slashed! 1d10 slashing damage.", damage: "1d10", damageType: "slashing" },
    },
    {
      roll: 10, title: "Territorial Creature", type: "gm-adjudicate",
      description: "A creature indigenous to the area attacks! GM decides the creature and resolves.",
      autoEffect: { description: "GM: choose a creature and resolve the encounter." },
      isEncounter: true,
    },
  ],
  obstacleTemplates: [
    {
      roll: 0, title: "Disturb Nest", type: "check",
      description: "Disturb a wasp nest, ant hill, or animal den on your way past.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 12", abilityKey: "Acrobatics", dc: 12 }],
      onFail: { description: "Stung! 1d4 piercing damage, 5 ft. lost.", damage: "1d4", damageType: "piercing", movementReduction: 5 },
    },
    {
      roll: 0, title: "Break Branch", type: "check",
      description: "Snap a branch or push a log across the trail.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Trip on the obstacle! 10 ft. lost, fall prone.", movementReduction: 10, condition: "prone" },
    },
    {
      roll: 0, title: "Push Rocks", type: "check",
      description: "Send loose rocks tumbling down the slope.",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Hit by falling rocks! 1d6 bludgeoning damage.", damage: "1d6", damageType: "bludgeoning" },
    },
  ],
  narrationPrompts: [
    "The path winds through dense forest canopy...",
    "A clearing opens ahead, tall grass swaying in the wind...",
    "The trail follows a rocky ridge with a steep drop...",
    "You crash through undergrowth into a shallow stream bed...",
    "Ancient trees form a natural corridor ahead...",
    "The ground slopes steeply downhill toward a valley...",
    "A fallen tree forces a quick detour to the left...",
    "Moonlight filters through the canopy onto a narrow game trail...",
  ],
};

// ── Underground ──────────────────────────────────────────────

const UNDERGROUND_TABLE: ChaseComplicationTable = {
  id: "underground", name: "Underground", icon: "⛏️",
  entries: [
    {
      roll: 1, title: "Low Ceiling", type: "check",
      description: "Stalactites, beams, or pipes hang low overhead.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Head strike! 1d4 bludgeoning damage.", damage: "1d4", damageType: "bludgeoning" },
    },
    {
      roll: 2, title: "Unstable Floor", type: "check",
      description: "Loose rubble or rotting boards underfoot.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Floor gives way — you fall prone!", condition: "prone" },
    },
    {
      roll: 3, title: "Narrow Passage", type: "check",
      description: "The tunnel narrows to a tight squeeze.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 12", abilityKey: "Acrobatics", dc: 12 }],
      onFail: { description: "Stuck briefly! 5 ft. of movement lost.", movementReduction: 5 },
    },
    {
      roll: 4, title: "Flooded Section", type: "check",
      description: "Water pools on the floor, knee-deep or worse.",
      checkOptions: [{ label: "STR (Athletics) DC 10", abilityKey: "Athletics", dc: 10 }],
      onFail: { description: "Slowed by water. 10 ft. of movement lost.", movementReduction: 10 },
    },
    {
      roll: 5, title: "Sudden Darkness", type: "check",
      description: "A gust extinguishes lights, or a dark cloud of spores blooms.",
      checkOptions: [{ label: "CON Save DC 10", abilityKey: "CON", dc: 10 }],
      onFail: { description: "Blinded! Speed halved until end of turn.", speedPenalty: "halved", condition: "blinded" },
    },
    {
      roll: 6, title: "Collapsing Section", type: "check",
      description: "The ceiling or wall partially collapses!",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Crushed! 2d6 bludgeoning damage.", damage: "2d6", damageType: "bludgeoning" },
    },
    {
      roll: 7, title: "Webs or Slime", type: "check",
      description: "Sticky webs or slippery slime coat the passage.",
      checkOptions: [{ label: "STR Save DC 12", abilityKey: "STR", dc: 12 }],
      onFail: { description: "Speed halved this turn, struggling through.", speedPenalty: "halved" },
    },
    {
      roll: 8, title: "Foul Air", type: "check",
      description: "Noxious fumes or toxic gas fills the area.",
      checkOptions: [{ label: "CON Save DC 12", abilityKey: "CON", dc: 12 }],
      onFail: { description: "Poisoned until end of turn! Disadvantage on checks.", condition: "poisoned" },
    },
    {
      roll: 9, title: "Hidden Pit", type: "check",
      description: "A concealed hole or shaft in the ground.",
      checkOptions: [{ label: "DEX Save DC 13", abilityKey: "DEX", dc: 13 }],
      onFail: { description: "Fall in! 1d6 bludgeoning damage, land prone.", damage: "1d6", damageType: "bludgeoning", condition: "prone" },
    },
    {
      roll: 10, title: "Denizen", type: "gm-adjudicate",
      description: "A creature inhabiting the area strikes from the shadows!",
      autoEffect: { description: "GM: choose a creature (ooze, rat swarm, etc.) and resolve." },
      isEncounter: true,
    },
  ],
  obstacleTemplates: [
    {
      roll: 0, title: "Collapse Support", type: "check",
      description: "Smash a support beam or kick a loose pillar as you pass.",
      checkOptions: [{ label: "DEX Save DC 13", abilityKey: "DEX", dc: 13 }],
      onFail: { description: "Falling debris! 2d4 bludgeoning damage, 10 ft. lost.", damage: "2d4", damageType: "bludgeoning", movementReduction: 10 },
    },
    {
      roll: 0, title: "Spill Oil or Slime", type: "check",
      description: "Kick over a lantern or burst a slime pod to coat the floor.",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Slip! Fall prone.", condition: "prone" },
    },
    {
      roll: 0, title: "Lock Gate", type: "check",
      description: "Slam and lock a gate or portcullis behind you.",
      checkOptions: [{ label: "STR (Athletics) DC 15", abilityKey: "Athletics", dc: 15 }],
      onFail: { description: "Stuck! Lose all movement breaking through.", speedPenalty: "zero" },
    },
  ],
  narrationPrompts: [
    "The tunnel widens into a damp cavern...",
    "Ahead, a junction splits into three dark passages...",
    "Water drips from the ceiling onto slick stone...",
    "The passage slopes downward, the air growing colder...",
    "Glowing fungi dimly light a chamber ahead...",
    "Old mining rails cross the floor, rusted and broken...",
    "The stench of stagnant water fills the narrow tunnel...",
    "A side chamber opens up, cluttered with old debris...",
  ],
};

// ── Waterfront ───────────────────────────────────────────────

const WATERFRONT_TABLE: ChaseComplicationTable = {
  id: "waterfront", name: "Waterfront", icon: "⚓",
  entries: [
    {
      roll: 1, title: "Slippery Dock", type: "check",
      description: "Wet, algae-covered planks underfoot.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "You slip and fall prone!", condition: "prone" },
    },
    {
      roll: 2, title: "Cargo", type: "check",
      description: "Stacked crates, barrels, and cargo block the dock.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Navigating cargo costs time. 10 ft. lost.", movementReduction: 10 },
    },
    {
      roll: 3, title: "Swinging Load", type: "check",
      description: "A crane swings a heavy load across the path.",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Struck by the load! 2d4 bludgeoning damage.", damage: "2d4", damageType: "bludgeoning" },
    },
    {
      roll: 4, title: "Gangplank", type: "check",
      description: "A narrow, bouncing gangplank is the only way forward.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Wobble and fall prone! Risk falling into water.", condition: "prone" },
    },
    {
      roll: 5, title: "Tangled Nets", type: "check",
      description: "Fishing nets strewn across the ground.",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Tangled! Speed halved this turn.", speedPenalty: "halved" },
    },
    {
      roll: 6, title: "Dock Workers", type: "check",
      description: "Busy workers haul cargo, blocking your path.",
      checkOptions: [
        { label: "STR (Athletics) DC 10", abilityKey: "Athletics", dc: 10 },
        { label: "CHA (Intimidation) DC 10", abilityKey: "CHA", dc: 10 },
      ],
      onFail: { description: "Workers slow you down. 5 ft. lost.", movementReduction: 5 },
    },
    {
      roll: 7, title: "Vessel Crossing", type: "check",
      description: "Jump across to a moored boat or barge.",
      checkOptions: [{ label: "STR (Athletics) DC 12", abilityKey: "Athletics", dc: 12 }],
      onFail: { description: "Short landing! 10 ft. of movement lost.", movementReduction: 10 },
    },
    {
      roll: 8, title: "Rope Crossing", type: "check",
      description: "A swaying rope or chain is the only way across.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 12", abilityKey: "Acrobatics", dc: 12 }],
      onFail: { description: "Lose grip! 1d4 bludgeoning damage, fall prone.", damage: "1d4", damageType: "bludgeoning", condition: "prone" },
    },
    {
      roll: 9, title: "Harbour Creature", type: "check",
      description: "Something in the water snaps at you!",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Bitten! 1d6 piercing damage.", damage: "1d6", damageType: "piercing" },
    },
    {
      roll: 10, title: "Collapsing Pier", type: "check",
      description: "Rotten wood gives way beneath you!",
      checkOptions: [{ label: "DEX Save DC 13", abilityKey: "DEX", dc: 13 }],
      onFail: { description: "Fall through! 1d4 damage, 10 ft. lost.", damage: "1d4", damageType: "bludgeoning", movementReduction: 10 },
    },
  ],
  obstacleTemplates: [
    {
      roll: 0, title: "Cut the Rope", type: "check",
      description: "Sever a mooring line or crane rope, sending cargo swinging.",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Struck by swinging cargo! 1d6 bludgeoning, 5 ft. lost.", damage: "1d6", damageType: "bludgeoning", movementReduction: 5 },
    },
    {
      roll: 0, title: "Push Cargo", type: "check",
      description: "Shove crates or barrels off the dock into the path.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Blocked! 10 ft. of movement lost.", movementReduction: 10 },
    },
    {
      roll: 0, title: "Release Boat", type: "check",
      description: "Untie a small boat, sending it drifting across the path.",
      checkOptions: [{ label: "STR (Athletics) DC 13", abilityKey: "Athletics", dc: 13 }],
      onFail: { description: "Boat blocks the dock! Lose all movement.", speedPenalty: "zero" },
    },
  ],
  narrationPrompts: [
    "Wooden docks stretch out over dark water...",
    "Crates and barrels line the wharf, stacked high...",
    "The stench of fish and salt fills the air...",
    "A narrow pier leads toward a moored vessel...",
    "Ropes and chains hang from pulleys overhead...",
    "The dock creaks ominously underfoot...",
    "Sailors shout as cargo swings from a crane above...",
    "A low bridge crosses to the next section of docks...",
  ],
};

// ── Rooftop ──────────────────────────────────────────────────

const ROOFTOP_TABLE: ChaseComplicationTable = {
  id: "rooftop", name: "Rooftop", icon: "🏠",
  entries: [
    {
      roll: 1, title: "Gap Between Buildings", type: "check",
      description: "A gap between rooftops — jump or fall!",
      checkOptions: [{ label: "STR (Athletics) DC 12", abilityKey: "Athletics", dc: 12 }],
      onFail: { description: "Short jump! 1d6 bludgeoning damage (fall).", damage: "1d6", damageType: "bludgeoning" },
    },
    {
      roll: 2, title: "Loose Tiles", type: "check",
      description: "Unstable roofing shifts underfoot.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 10", abilityKey: "Acrobatics", dc: 10 }],
      onFail: { description: "Tiles slide — you fall prone!", condition: "prone" },
    },
    {
      roll: 3, title: "Laundry Line", type: "check",
      description: "Lines of rope and fabric at neck height.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Clotheslined! You fall prone.", condition: "prone" },
    },
    {
      roll: 4, title: "Steep Slope", type: "check",
      description: "A sharply angled roof section.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 12", abilityKey: "Acrobatics", dc: 12 }],
      onFail: { description: "Slide down the slope. 10 ft. of movement lost.", movementReduction: 10 },
    },
    {
      roll: 5, title: "Chimney Smoke", type: "check",
      description: "A blast of smoke from a chimney below.",
      checkOptions: [{ label: "CON Save DC 10", abilityKey: "CON", dc: 10 }],
      onFail: { description: "Blinded by smoke! Speed halved until end of turn.", speedPenalty: "halved", condition: "blinded" },
    },
    {
      roll: 6, title: "Weak Section", type: "check",
      description: "The roof won't hold your weight!",
      checkOptions: [{ label: "DEX Save DC 12", abilityKey: "DEX", dc: 12 }],
      onFail: { description: "Fall through! 2d6 bludgeoning damage, prone.", damage: "2d6", damageType: "bludgeoning", condition: "prone" },
    },
    {
      roll: 7, title: "Obstruction", type: "check",
      description: "A weather vane, antenna, or chimney at full speed.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Smack! 1d4 bludgeoning damage.", damage: "1d4", damageType: "bludgeoning" },
    },
    {
      roll: 8, title: "Startled Flock", type: "check",
      description: "Birds or bats scatter in a blinding cloud.",
      checkOptions: [{ label: "CON Save DC 10", abilityKey: "CON", dc: 10 }],
      onFail: { description: "Disoriented! 5 ft. of movement lost.", movementReduction: 5 },
    },
    {
      roll: 9, title: "Guard Below", type: "gm-adjudicate",
      description: "A guard spots you from the street and hurls a javelin (+3 to hit, 1d6+1 piercing).",
      autoEffect: { description: "GM: resolve the guard's ranged attack, then apply damage." },
    },
    {
      roll: 10, title: "Dead End", type: "check",
      description: "The rooftop ends — nowhere to go but back or down.",
      checkOptions: [{ label: "STR (Athletics) DC 15", abilityKey: "Athletics", dc: 15 }],
      onFail: { description: "Dead end! Lose all remaining movement.", speedPenalty: "zero" },
    },
  ],
  obstacleTemplates: [
    {
      roll: 0, title: "Kick Tiles", type: "check",
      description: "Send loose tiles cascading down behind you.",
      checkOptions: [{ label: "DEX (Acrobatics) DC 12", abilityKey: "Acrobatics", dc: 12 }],
      onFail: { description: "Sliding tiles! 1d4 damage, fall prone.", damage: "1d4", damageType: "bludgeoning", condition: "prone" },
    },
    {
      roll: 0, title: "Drop Plank", type: "check",
      description: "Remove a board or bridge connecting two roofs.",
      checkOptions: [{ label: "STR (Athletics) DC 13", abilityKey: "Athletics", dc: 13 }],
      onFail: { description: "No bridge! Must jump (lose 10 ft.) or risk a fall.", movementReduction: 10 },
    },
    {
      roll: 0, title: "Cut Clothesline", type: "check",
      description: "Slash a clothesline to tangle the pursuer.",
      checkOptions: [{ label: "DEX Save DC 10", abilityKey: "DEX", dc: 10 }],
      onFail: { description: "Tangled! Speed halved this turn.", speedPenalty: "halved" },
    },
  ],
  narrationPrompts: [
    "Rooftops stretch out in every direction under open sky...",
    "A narrow ledge runs along the building's edge...",
    "Smoke rises from chimneys all around...",
    "The gap between buildings is wider here — three feet at least...",
    "A sloped tile roof leads up to a flat terrace...",
    "Window shutters bang open on the floor below...",
    "A dovecote sits on the next roof, pigeons cooing...",
    "The city spreads below as the rooftops climb higher...",
  ],
};

// ── Public API ───────────────────────────────────────────────

export const COMPLICATION_TABLES: ChaseComplicationTable[] = [
  URBAN_TABLE,
  WILDERNESS_TABLE,
  UNDERGROUND_TABLE,
  WATERFRONT_TABLE,
  ROOFTOP_TABLE,
];

/** Get a complication table by ID. Falls back to urban if not found. */
export function getComplicationTable(id: string): ChaseComplicationTable {
  return COMPLICATION_TABLES.find((t) => t.id === id) ?? URBAN_TABLE;
}
