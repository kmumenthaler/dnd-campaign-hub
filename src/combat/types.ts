/* ── Combat Tracker Data Model ─────────────────────────────────── */

/** A D&D 5e status condition applied to a combatant. */
export interface StatusEffect {
  /** Display name, e.g. "Prone", "Haste", "Rage". */
  name: string;
  /** Optional duration in rounds (undefined = indefinite). */
  duration?: number;
  /** Round the effect was applied (used for expiry check). */
  appliedRound?: number;
  /** Free-form text for the GM (e.g. "DC 15 CON save to end"). */
  note?: string;
}

/** Death saving throw tracker (D&D 5e). */
export interface DeathSaveState {
  /** Number of successful saves (0–3). Three = stabilized. */
  successes: number;
  /** Number of failed saves (0–3). Three = dead. */
  failures: number;
}

/** A single combatant in a running combat. */
export interface Combatant {
  /** Unique identifier for this instance. */
  id: string;
  /** Base creature / character name (used for stat lookups). */
  name: string;
  /** Display name shown in the tracker (may include color suffix). */
  display: string;
  /** Rolled initiative score. */
  initiative: number;
  /** DEX modifier (tiebreaker for initiative) and initiative roll modifier. */
  modifier: number;
  /** Current hit points. */
  currentHP: number;
  /** Max hit points (can be reduced by effects like max-HP drain). */
  maxHP: number;
  /** Temporary hit points. */
  tempHP: number;
  /** Base AC. */
  ac: number;
  /** Current AC (may differ from base due to effects). */
  currentAC: number;
  /** Is this a player character? */
  player: boolean;
  /** Friendly NPC (fights alongside party). */
  friendly: boolean;
  /** Hidden from players. */
  hidden: boolean;
  /** Whether the combatant is enabled (disabled = grayed out, skipped in turns). */
  enabled?: boolean;
  /** Path to the vault note (PC/NPC/creature .md file). */
  notePath?: string;
  /** Token marker id from MarkerLibrary. */
  tokenId?: string;
  /** Active status effects. */
  statuses: StatusEffect[];
  /** Death saving throw state (only present while at 0 HP). */
  deathSaves?: DeathSaveState;
  /** True when the combatant has been killed (instant death or 3 failed saves). */
  dead?: boolean;
  /** Creature level (for PCs) or CR string (for creatures). */
  level?: number;
  cr?: string;
}

/** Full state of a running combat — serializable to JSON. */
export interface CombatState {
  /** Encounter name this combat belongs to. */
  encounterName: string;
  /** Vault path to the encounter note (for map linking). */
  encounterPath?: string;
  /** Ordered combatant list (sorted by initiative descending). */
  combatants: Combatant[];
  /** Current round number (1-based). */
  round: number;
  /** Index into combatants[] for whose turn it is. */
  turnIndex: number;
  /** Whether combat has started (initiative rolled, first turn begun). */
  started: boolean;
  /** ISO timestamp when the state was last saved. */
  savedAt: string;
}

/** Callback signature for combat state change listeners. */
export type CombatListener = (state: CombatState | null) => void;
