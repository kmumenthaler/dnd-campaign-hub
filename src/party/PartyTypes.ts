/* ── Party Management Data Model ─────────────────────────────── */

/** A reference to a PC in a party. The vault note is the source of truth;
 *  we only store the path here and resolve stats on demand. */
export interface PartyMemberRef {
  /** Vault path to the PC note (e.g. "ttrpgs/Campaign/PCs/Alara.md"). */
  notePath: string;
  /** Cached display name (updated on sync). */
  name: string;
}

/** Resolved stats for a party member — fetched live from PC note frontmatter. */
export interface ResolvedPartyMember {
  name: string;
  notePath: string;
  level: number;
  hp: number;
  maxHp: number;
  thp: number;
  ac: number;
  initBonus: number;
  /** token_id from frontmatter for map integration. */
  tokenId?: string;
  /** Player name (the real person). */
  player?: string;
  /** Race / species. */
  race?: string;
  /** Class name. */
  class?: string;
  /** Active — false if the PC has been retired or killed. */
  enabled: boolean;
}

/** A named party — a group of PCs that adventure together. */
export interface Party {
  /** Unique identifier (hex string). */
  id: string;
  /** Human-readable name (e.g. "Frozen Sick Party"). */
  name: string;
  /** Ordered list of member references. */
  members: PartyMemberRef[];
  /** ISO timestamp when the party was created. */
  createdAt: string;
  /** Vault path to the campaign folder (e.g. "ttrpgs/Frozen Sick"). */
  campaignPath?: string;
}

/** A stored encounter definition — replaces IT's encounter storage. */
export interface StoredEncounter {
  /** Encounter display name (same as the note's frontmatter `name`). */
  name: string;
  /** Vault path to the encounter note. */
  notePath?: string;
  /** Creature instances in the encounter (both party + enemies). */
  creatures: StoredEncounterCreature[];
  /** Whether the encounter has been started at least once. */
  started: boolean;
  /** Current round (if resumed). */
  round: number;
}

/** A creature/combatant stored in an encounter definition. */
export interface StoredEncounterCreature {
  name: string;
  display: string;
  hp: number;
  maxHP: number;
  currentHP: number;
  tempHP: number;
  ac: number;
  currentAC: number;
  initiative: number;
  modifier: number;
  cr?: string;
  level?: number;
  /** Is this a player character? */
  player: boolean;
  /** Friendly NPC (fights alongside party). */
  friendly: boolean;
  /** Hidden from players. */
  hidden: boolean;
  enabled: boolean;
  /** Vault note path for linking. */
  notePath?: string;
  /** Token marker id from MarkerLibrary. */
  tokenId?: string;
  /** Unique instance ID. */
  id: string;
  /** Status effects. */
  statuses: Array<{ name: string; duration?: number; note?: string }>;
}

/** Top-level persisted data structure for the PartyManager. */
export interface PartyManagerData {
  version: string;
  parties: Party[];
  encounters: Record<string, StoredEncounter>;
  /** ID of the default party (used as fallback when no campaign context). */
  defaultPartyId: string;
  /** Whether to auto-roll initiative for PCs.
   *  0 = don't roll, 1 = roll automatically, 2 = let players roll. */
  rollPlayerInitiatives: 0 | 1 | 2;
}

/** Callback for party data change listeners. */
export type PartyChangeListener = () => void;
