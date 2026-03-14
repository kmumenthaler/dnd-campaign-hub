/* ── Pursuit / Chase System Data Model (D&D 5e RAW) ──────────── */

// ── Movement ───────────────────────────────────────────────────

/** A single movement mode with speed in feet. */
export interface SpeedEntry {
  /** "walk" | "fly" | "swim" | "burrow" | "climb" */
  mode: string;
  /** Speed in feet, e.g. 30, 60. */
  feet: number;
}

// ── Turn Phase Machine ─────────────────────────────────────────

/**
 * Phase of the current participant's turn.
 * The tracker advances through these in order;
 * the view renders based on the current phase.
 */
export type TurnPhase =
  | "complication"        // Resolving complication from previous participant's d20
  | "complication-check"  // Waiting for PC to roll complication check
  | "action"              // Choose action
  | "action-resolve"      // Waiting for action resolution (stealth/CON save)
  | "bonus"               // Choose bonus action (Cunning Action only)
  | "bonus-resolve"       // Waiting for bonus resolution
  | "movement"            // Movement phase
  | "complication-roll"   // End-of-turn d20 roll (affects next participant)
  | "escape-check"        // End-of-round quarry escape Stealth check
  | "turn-end";           // Summary, ready to advance

// ── Complications ──────────────────────────────────────────────

/** A single check option when a complication allows player choice. */
export interface ComplicationCheckOption {
  /** Display label, e.g. "DEX (Acrobatics) DC 15". */
  label: string;
  /** Key for modifier lookup: "DEX"|"STR"|"CON"|"WIS"|"INT"|"CHA"|"Athletics"|"Acrobatics"|"Stealth"|"Perception". */
  abilityKey: string;
  /** Difficulty class for the check / save. */
  dc: number;
}

/** Whether the complication has a check or must be adjudicated by the GM. */
export type ComplicationType = "check" | "gm-adjudicate";

/** Definition of a single complication result (d20 entries 1–10). */
export interface ComplicationEntry {
  /** Position in the table (1–10). 0 for quarry-created obstacles. */
  roll: number;
  title: string;
  /** Read-aloud / narration text for the GM. */
  description: string;
  type: ComplicationType;
  /** Available check / save options (player may choose when multiple). */
  checkOptions?: ComplicationCheckOption[];
  onSuccess?: ComplicationEffect;
  onFail?: ComplicationEffect;
  /** Description for gm-adjudicate entries (suggested handling). */
  autoEffect?: ComplicationEffect;
  /** True when this complication involves a creature encounter (enables quick-add). */
  isEncounter?: boolean;
}

/** Effect applied from a complication check pass or fail. */
export interface ComplicationEffect {
  description: string;
  damage?: string;              // dice formula like "1d6"
  damageType?: string;          // "bludgeoning" | "piercing" | "slashing" etc.
  speedPenalty?: "halved" | "zero";
  movementReduction?: number;   // feet of movement lost (difficult terrain)
  condition?: string;           // "prone" | "restrained" | "blinded" | "poisoned"
  grantsLoS?: boolean;
}

/** Active complication being resolved on the current turn. */
export interface ActiveComplication {
  entry: ComplicationEntry;
  /** The actual d20 value that triggered this (1–10). */
  d20Roll: number;
  /** Display name of who rolled the d20 (previous participant). */
  rolledByName: string;
  resolved: boolean;
  /** Which check option was selected (if multiple available). */
  selectedCheck?: ComplicationCheckOption;
  checkResult?: number;
  checkNatural?: number;
  passed?: boolean;
  effectDescription?: string;
}

/** Pending complication stored between turns (rolled by one, affects next). */
export interface PendingComplicationForNext {
  entry: ComplicationEntry;
  d20Roll: number;
  rolledByName: string;
  rolledById: string;
  /** True when the quarry deliberately created this obstacle. */
  isQuarryObstacle?: boolean;
}

/** An obstacle placed at a specific position on the chase lane by a quarry. */
export interface PlacedObstacle {
  /** Unique ID for this obstacle instance. */
  id: string;
  /** Complication entry describing the obstacle. */
  entry: ComplicationEntry;
  /** Position (feet) where the obstacle was placed. */
  position: number;
  /** Name of the quarry who created this obstacle. */
  createdByName: string;
  /** ID of the quarry who created this obstacle. */
  createdById: string;
}

// ── Pending Input ──────────────────────────────────────────────

/** Describes a roll the system is waiting for from the GM (for PCs). */
export interface PendingInput {
  type: "complication-check" | "stealth" | "con-save" | "perception" | "escape-stealth" | "grapple-check" | "grapple-defense" | "escape-grapple-check" | "escape-grapple-defense";
  participantId: string;
  label: string;
  modifier: number;
  dc?: number;
  description: string;
  /** Available check options when participant can choose. */
  checkOptions?: ComplicationCheckOption[];
}

// ── Participant ────────────────────────────────────────────────

export type PursuitRole = "quarry" | "pursuer";

/**
 * Action a participant can take on their turn.
 * - dash: double movement, cannot Hide
 * - hide: attempt Stealth (requires LoS broken), base movement only
 * - disengage: avoid opportunity attacks, base movement only
 * - dodge: attacks have disadvantage, base movement only
 * - search: pursuers only — active Perception vs hidden quarry
 * - other: spell, Help, item, etc.
 */
export type TurnAction = "dash" | "hide" | "disengage" | "dodge" | "search" | "attack" | "create-obstacle" | "grapple" | "escape-grapple" | "other";

/** Advantage / disadvantage modifier for the Stealth check. */
export type StealthCondition = "advantage" | "disadvantage" | "normal";

/** A single participant in a running chase. */
export interface PursuitParticipant {
  /** Unique identifier for this instance. */
  id: string;
  /** Base creature / character name. */
  name: string;
  /** Display name shown in the tracker. */
  display: string;
  /** "quarry" or "pursuer". */
  role: PursuitRole;

  // ── Initiative ──
  /** Rolled initiative score. */
  initiative: number;
  /** DEX / initiative modifier. */
  initiativeModifier: number;

  // ── Movement ──
  /** All available movement modes parsed from frontmatter. */
  speeds: SpeedEntry[];
  /** Which speed mode is active this turn. */
  activeSpeed: string;
  /** Position in feet from chase origin (higher = further ahead). */
  position: number;

  // ── Dash tracking (5e RAW) ──
  /** Total dashes used during this chase. */
  dashesUsed: number;
  /** Free dashes before CON saves are required (3 + CON modifier). */
  freeDashes: number;
  /** Constitution modifier (for free-dash calc and CON saves). */
  conModifier: number;
  /** Current exhaustion level (0-5). At 5 the participant drops out. */
  exhaustionLevel: number;

  // ── Action economy ──
  /** Action taken this turn (set when the GM resolves). */
  turnAction?: TurnAction;
  /** Whether this participant has already acted this round. */
  hasActed: boolean;
  /** Can use bonus action to Dash or Hide (Rogue Cunning Action, etc.). */
  hasCunningAction: boolean;
  /** Bonus action used this turn (for Cunning Action tracking). */
  bonusAction?: TurnAction;
  /** Whether this participant has moved this turn. */
  hasMoved: boolean;
  /** Feet moved this turn (for display). */
  feetMovedThisTurn: number;
  /** Whether a CON save from an extra dash is currently pending. */
  pendingDashSave: boolean;

  // ── Complication state (per-turn) ──
  /** Speed penalty from complications this turn. */
  movementPenalty: "none" | "halved" | "zero";
  /** Flat movement reduction in feet from complications (difficult terrain). */
  movementReductionFeet: number;
  /** Complication granted LoS break this turn. */
  complicationLoSBreak: boolean;

  // ── Carry mechanic ──
  /** IDs of participants being carried by this one. */
  carrying: string[];
  /** ID of participant carrying this one. */
  carriedBy?: string;
  /** Carrier's STR score (for capacity calculation). */
  strScore: number;
  /** Estimated weight of this participant in lbs (size-based). */
  estimatedWeight: number;

  // ── Grapple mechanic ──
  /** IDs of participants this one is actively grappling (hostile carry). */
  grappling: string[];
  /** ID of participant grappling this one. */
  grappledBy?: string;

  // ── Stealth / Perception ──
  /** Stealth modifier (for quarry end-of-round checks). */
  stealthModifier: number;
  /** Passive Perception score (for pursuers). */
  passivePerception: number;
  /** Perception modifier (for pursuer active Search rolls). */
  perceptionModifier: number;
  /** Active Perception roll result if they used Search this turn. */
  activePerceptionRoll?: number;
  /** End-of-round stealth roll result (quarry only). */
  stealthRoll?: number;
  /**
   * Auto-computed: LoS is broken based on distance + environment + complication.
   * No manual toggle — the tracker sets this automatically.
   */
  lineOfSightBroken: boolean;
  /** Quarry is currently hidden from all pursuers (stealth beat all perceptions). */
  isHidden: boolean;
  /** The stealth roll that made this quarry hidden (for pursuer Search contests). */
  hiddenStealthRoll?: number;

  // ── Targeting (pursuers) ──
  /** IDs of quarry members this pursuer is chasing. */
  targetIds: string[];
  /** Currently active chase target (pursuer selects at start of turn). */
  activeTargetId?: string;

  // ── Movement plane ──
  /** Current movement plane: ground, air, or underground. */
  movementPlane: "ground" | "air" | "underground";
  /** Whether this creature has tremorsense (can track burrowing). */
  hasTremorsense: boolean;

  // ── Start configuration ──
  /** Movement penalty applied at start of this participant's first turn. */
  startPenalty: "none" | "halved" | "zero";
  /** Whether the start penalty has been consumed. */
  startPenaltyApplied: boolean;

  // ── Ability modifiers (for complication checks) ──
  /** Wisdom modifier (for WIS saves / checks). */
  wisModifier: number;
  /** Intelligence modifier (for INT checks). */
  intModifier: number;
  /** Charisma modifier (for CHA / Intimidation checks). */
  chaModifier: number;

  // ── Escape tracking (per-round) ──
  /** Was this quarry ever out of the lead pursuer's sight this round? */
  wasOutOfSightThisRound: boolean;

  // ── Health & status (carried from combat or vault) ──
  currentHP: number;
  maxHP: number;
  /** Temporary hit points (absorb damage first, don't stack). */
  tempHP: number;
  /** True when at 0 HP or otherwise unable to act. */
  incapacitated: boolean;
  /** Active conditions (e.g. "prone", "restrained"). */
  conditions: string[];

  // ── Chase status ──
  /** Has this participant escaped the chase? */
  escaped: boolean;
  /** Has this participant dropped out (exhaustion 5, gave up, etc.)? */
  droppedOut: boolean;

  // ── Player / display flags ──
  /** Is this a player character? */
  player: boolean;
  /** Hidden from player view (GM-only). */
  hidden: boolean;

  // ── References ──
  /** Path to the vault note (PC/NPC/creature). */
  notePath?: string;
  /** Token marker id from MarkerLibrary. */
  tokenId?: string;
  /** Combat tracker combatant ID (for sync when started from combat). */
  combatantId?: string;
}

// ── Chase environment ──────────────────────────────────────────

/** Describes the chase environment and LoS-breaking opportunities. */
export interface ChaseEnvironment {
  /** Short description (e.g. "Crowded Market"). */
  name: string;
  /** Whether cover / hiding spots are available. */
  hasCover: boolean;
  /** Whether heavily obscured areas exist (fog, darkness, smoke). */
  hasObscurement: boolean;
  /** Whether the area is wide open with few hiding spots. */
  wideOpen: boolean;
  /** Whether elevation changes are available (rooftops, balconies). */
  hasElevation: boolean;
  /** Whether the area is crowded or noisy. */
  crowdedOrNoisy: boolean;
  /** ID of the complication table to use ("urban", "wilderness", etc.). */
  complicationTableId: string;
  /** Free-form GM notes. */
  notes: string;
}

/** Computed stealth condition from environment. */
export function computeStealthCondition(env: ChaseEnvironment, hasRangerPursuer: boolean): StealthCondition {
  let adv = 0;
  if (env.hasCover) adv++;
  if (env.crowdedOrNoisy) adv++;
  if (env.hasObscurement) adv++;
  let disadv = 0;
  if (env.wideOpen) disadv++;
  if (hasRangerPursuer) disadv++;
  if (adv > disadv) return "advantage";
  if (disadv > adv) return "disadvantage";
  return "normal";
}

// ── Chase state ────────────────────────────────────────────────

/** A log entry in the chase. */
export interface PursuitLogEntry {
  round: number;
  text: string;
}

/** Full state of a running chase — serializable to JSON. */
export interface PursuitState {
  /** Chase name (e.g. "Market Chase"). */
  name: string;
  /** All participants. */
  participants: PursuitParticipant[];
  /** Current round number (1-based). */
  round: number;
  /** Index into participants[] for whose turn it is. */
  turnIndex: number;
  /** Whether the chase has started (initiative sorted). */
  started: boolean;
  /** Whether the chase has ended. */
  ended: boolean;
  /** How the chase ended. */
  outcome?: "escaped" | "caught" | "surrendered" | "returned-to-combat" | "gm-ended";

  // ── Phase machine ──
  /** Current phase of the active participant's turn. */
  turnPhase: TurnPhase;
  /** Complication rolled for the current turn (undefined outside complication phases). */
  currentComplication?: ActiveComplication;
  /** Pending input the system is waiting for from the GM (PC rolls only). */
  pendingInput?: PendingInput;

  // ── Complication system (d20, targets next participant) ──
  /** ID of the complication table in use ("urban", "wilderness", etc.). */
  complicationTableId: string;
  /** Complication stored from a previous participant's end-of-turn d20 roll. */
  pendingComplicationForNext?: PendingComplicationForNext;
  /** Queue of quarry IDs awaiting end-of-round escape Stealth checks. */
  escapeCheckQueue?: string[];
  /** The d20 value rolled at end of the current turn (for display). */
  endOfTurnD20?: number;

  // ── Environment ──
  environment: ChaseEnvironment;
  /** Computed stealth condition. */
  stealthCondition: StealthCondition;
  /** Whether any pursuer is a ranger / has Survival proficiency. */
  hasRangerPursuer: boolean;

  /**
   * Feet of separation needed for auto-catch detection.
   * A pursuer catches a quarry when within this distance (default 5).
   */
  catchDistance: number;

  /** Maximum distance (feet) a quarry must reach to auto-escape. 0 = disabled. */
  maxDistance: number;
  /** Maximum rounds before the chase auto-ends. 0 = disabled. */
  maxRounds: number;

  /** Pending catch-up alerts requiring GM decision (initiate combat or continue). */
  catchUpAlerts: { pursuerId: string; quarryId: string }[];

  /** Obstacles placed on the chase lane by quarry (position-based). */
  placedObstacles: PlacedObstacle[];

  // ── Log ──
  log: PursuitLogEntry[];
}

/** Callback signature for pursuit state change listeners. */
export type PursuitListener = (state: PursuitState | null) => void;

// ── Carry capacity helpers (D&D 5e RAW) ────────────────────────

/** Estimated weight by creature size (lbs). */
export const SIZE_WEIGHT_ESTIMATE: Record<string, number> = {
  tiny: 10,
  small: 40,
  medium: 150,
  large: 500,
  huge: 2000,
  gargantuan: 8000,
};

/** Carry capacity = STR × 15 (5e RAW). */
export function carryCapacity(strScore: number): number {
  return strScore * 15;
}

/** Push/drag/lift limit = STR × 30 (speed drops to 5ft). */
export function pushDragLiftLimit(strScore: number): number {
  return strScore * 30;
}

export type CarryResult =
  | { status: "ok"; speedMultiplier: 0.5 }
  | { status: "drag"; speedFeet: 5 }
  | { status: "impossible" };

/** Determine carry penalty based on 5e encumbrance rules. */
export function computeCarryPenalty(strScore: number, weightLbs: number): CarryResult {
  if (weightLbs <= carryCapacity(strScore)) return { status: "ok", speedMultiplier: 0.5 };
  if (weightLbs <= pushDragLiftLimit(strScore)) return { status: "drag", speedFeet: 5 };
  return { status: "impossible" };
}

/**
 * Total the effective weight of everything a participant carries + grapples.
 * Grappled creatures count as 2× weight (struggling makes them harder to move).
 */
export function totalBurdenWeight(
  carrier: PursuitParticipant,
  allParticipants: PursuitParticipant[],
): number {
  let total = 0;
  for (const id of carrier.carrying) {
    const p = allParticipants.find((x) => x.id === id);
    if (p) total += p.estimatedWeight;
  }
  for (const id of carrier.grappling) {
    const p = allParticipants.find((x) => x.id === id);
    if (p) total += p.estimatedWeight * 2; // struggling = 2× effective weight
  }
  return total;
}

// ── Standard D&D conditions ────────────────────────────────────

export const STANDARD_CONDITIONS = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
  "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
] as const;

// ── Speed parsing ──────────────────────────────────────────────

/**
 * Parse a frontmatter speed value into structured SpeedEntry[].
 *
 * Handles all known formats:
 * - `30` → [{ mode: "walk", feet: 30 }]
 * - `"30 ft."` → [{ mode: "walk", feet: 30 }]
 * - `"40 ft., fly 60 ft., swim 30 ft."` → [{walk,40},{fly,60},{swim,30}]
 * - `"5 ft., fly 50 ft. (hover)"` → [{walk,5},{fly,50}]
 */
export function parseSpeed(raw: string | number | undefined): SpeedEntry[] {
  if (raw === undefined || raw === null || raw === "") return [{ mode: "walk", feet: 30 }];
  if (typeof raw === "number") return [{ mode: "walk", feet: raw }];

  const entries: SpeedEntry[] = [];
  // Split on commas
  const parts = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    // Strip parenthetical notes like "(hover)"
    const clean = part.replace(/\(.*?\)/g, "").trim();
    // Match optional mode prefix + number + optional "ft."
    const m = clean.match(/^(?:(\w+)\s+)?(\d+)\s*(?:ft\.?)?$/i);
    if (m) {
      const mode = m[1] ? m[1].toLowerCase() : "walk";
      const feet = parseInt(m[2] ?? "0", 10);
      if (!isNaN(feet)) entries.push({ mode, feet });
    }
  }
  return entries.length > 0 ? entries : [{ mode: "walk", feet: 30 }];
}
