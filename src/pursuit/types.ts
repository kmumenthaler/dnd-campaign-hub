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
  | "complication"        // Auto-rolled d6, showing result
  | "complication-check"  // Waiting for PC to roll complication check
  | "action"              // Choose action
  | "action-resolve"      // Waiting for action resolution (stealth/CON save)
  | "bonus"               // Choose bonus action (Cunning Action only)
  | "bonus-resolve"       // Waiting for bonus resolution
  | "movement"            // Movement phase
  | "turn-end";           // Summary, ready to advance

// ── Complications ──────────────────────────────────────────────

/** Definition of a single complication result in the d6 table. */
export interface ComplicationEntry {
  roll: number;
  title: string;
  description: string;
  requiresCheck: boolean;
  checkAbility?: string;  // "DEX" | "STR" | "Stealth"
  checkDC?: number;
  onSuccess?: ComplicationEffect;
  onFail?: ComplicationEffect;
}

/** Effect applied from a complication check pass or fail. */
export interface ComplicationEffect {
  description: string;
  grantsLoS?: boolean;
  speedPenalty?: "halved" | "zero";
  damage?: string;  // dice formula like "1d6"
}

/** Active complication for the current turn. */
export interface ActiveComplication {
  entry: ComplicationEntry;
  roll: number;
  resolved: boolean;
  checkResult?: number;
  checkNatural?: number;
  passed?: boolean;
  effectDescription?: string;
}

/** Default Urban Chase Complications (d6). */
export const CHASE_COMPLICATIONS: ComplicationEntry[] = [
  {
    roll: 1, title: "Clear path",
    description: "No complication.",
    requiresCheck: false,
  },
  {
    roll: 2, title: "Uneven ground",
    description: "DEX save DC 12 or fall prone.",
    requiresCheck: true, checkAbility: "DEX", checkDC: 12,
    onFail: { description: "Falls prone! Speed halved this turn.", speedPenalty: "halved" },
  },
  {
    roll: 3, title: "Obstacle",
    description: "Athletics/Acrobatics DC 13 to get past.",
    requiresCheck: true, checkAbility: "DEX", checkDC: 13,
    onFail: { description: "Blocked! Loses all movement this turn.", speedPenalty: "zero" },
  },
  {
    roll: 4, title: "Crowd",
    description: "Stealth DC 12 to slip through.",
    requiresCheck: true, checkAbility: "Stealth", checkDC: 12,
    onSuccess: { description: "Slips through the crowd — line of sight broken!", grantsLoS: true },
    onFail: { description: "Struggles through the crowd. Speed halved.", speedPenalty: "halved" },
  },
  {
    roll: 5, title: "Hazard",
    description: "DEX save DC 14 or take damage.",
    requiresCheck: true, checkAbility: "DEX", checkDC: 14,
    onFail: { description: "Hit by hazard!", damage: "1d6" },
  },
  {
    roll: 6, title: "Dead end",
    description: "Athletics DC 15 to find another way.",
    requiresCheck: true, checkAbility: "STR", checkDC: 15,
    onFail: { description: "Dead end! Must backtrack — loses all movement.", speedPenalty: "zero" },
  },
];

// ── Pending Input ──────────────────────────────────────────────

/** Describes a roll the system is waiting for from the GM (for PCs). */
export interface PendingInput {
  type: "complication-check" | "stealth" | "con-save" | "perception";
  participantId: string;
  label: string;
  modifier: number;
  dc?: number;
  description: string;
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
export type TurnAction = "dash" | "hide" | "disengage" | "dodge" | "search" | "other";

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
  /** Complication granted LoS break this turn. */
  complicationLoSBreak: boolean;

  // ── Carry mechanic ──
  /** ID of participant being carried by this one. */
  carrying?: string;
  /** ID of participant carrying this one. */
  carriedBy?: string;
  /** Carrier's STR score (for capacity calculation). */
  strScore: number;
  /** Estimated weight of this participant in lbs (size-based). */
  estimatedWeight: number;

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

  // ── Health & status (carried from combat or vault) ──
  currentHP: number;
  maxHP: number;
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
