/**
 * CombatPursuitSync — Bidirectional bridge between CombatTracker and PursuitTracker.
 *
 * Created when a chase starts from an active combat encounter.
 * Keeps HP, tempHP, conditions, and incapacitated/dead state in sync
 * between both systems. Uses `combatantId` on PursuitParticipant to map
 * back to the correct Combatant.
 *
 * Lifecycle:
 *   activate()  → subscribes to both onChange listeners
 *   teardown()  → unsubscribes; called when either system ends
 */

import type { CombatState, Combatant, StatusEffect } from "../combat/types";
import type { PursuitState, PursuitParticipant } from "./types";
import type { CombatTracker } from "../combat/CombatTracker";
import type { PursuitTracker } from "./PursuitTracker";

/** Snapshot of sync-relevant fields for diff detection. */
interface SyncSnapshot {
  hp: number;
  maxHP: number;
  tempHP: number;
  conditions: string[];
  incapacitated: boolean;
  dead: boolean;
}

export class CombatPursuitSync {
  private unsubCombat: (() => void) | null = null;
  private unsubPursuit: (() => void) | null = null;
  private syncing = false;
  private active = false;

  /** Last-known state per combatant ID (keyed by combatantId). */
  private lastCombat = new Map<string, SyncSnapshot>();
  private lastPursuit = new Map<string, SyncSnapshot>();

  constructor(
    private combat: CombatTracker,
    private pursuit: PursuitTracker,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────

  /** Start synchronising. Call once after the chase is set up. */
  activate(): void {
    if (this.active) return;
    this.active = true;

    // Seed initial snapshots from current state
    this.seedFromCombat();
    this.seedFromPursuit();

    this.unsubCombat = this.combat.onChange((state) => this.onCombatChange(state));
    this.unsubPursuit = this.pursuit.onChange((state) => this.onPursuitChange(state));
  }

  /** Stop synchronising and release listeners. */
  teardown(): void {
    this.active = false;
    this.unsubCombat?.();
    this.unsubPursuit?.();
    this.unsubCombat = null;
    this.unsubPursuit = null;
    this.lastCombat.clear();
    this.lastPursuit.clear();
  }

  isActive(): boolean {
    return this.active;
  }

  // ── Seed Snapshots ─────────────────────────────────────────

  private seedFromCombat(): void {
    const state = this.combat.getState();
    if (!state) return;
    for (const c of state.combatants) {
      this.lastCombat.set(c.id, this.combatantSnapshot(c));
    }
  }

  private seedFromPursuit(): void {
    const state = this.pursuit.getState();
    if (!state) return;
    for (const p of state.participants) {
      if (p.combatantId) {
        this.lastPursuit.set(p.combatantId, this.participantSnapshot(p));
      }
    }
  }

  // ── Change Handlers ────────────────────────────────────────

  private onCombatChange(state: CombatState | null): void {
    if (this.syncing || !this.active) return;
    if (!state) {
      // Combat ended — tear down sync
      this.teardown();
      return;
    }

    this.syncing = true;
    try {
      for (const c of state.combatants) {
        const prev = this.lastCombat.get(c.id);
        const curr = this.combatantSnapshot(c);
        this.lastCombat.set(c.id, curr);

        if (!prev) continue; // New combatant added mid-combat, skip
        if (this.snapshotsEqual(prev, curr)) continue;

        // Find matching pursuit participant
        const pursuitState = this.pursuit.getState();
        if (!pursuitState) continue;
        const participant = pursuitState.participants.find((p) => p.combatantId === c.id);
        if (!participant) continue;

        // Apply diffs: combat → pursuit
        this.applyCombatDiffToPursuit(participant.id, prev, curr);

        // Update pursuit snapshot
        this.lastPursuit.set(c.id, curr);
      }
    } finally {
      this.syncing = false;
    }
  }

  private onPursuitChange(state: PursuitState | null): void {
    if (this.syncing || !this.active) return;
    if (!state || state.ended) {
      // Chase ended — tear down sync
      this.teardown();
      return;
    }

    this.syncing = true;
    try {
      for (const p of state.participants) {
        if (!p.combatantId) continue;
        const prev = this.lastPursuit.get(p.combatantId);
        const curr = this.participantSnapshot(p);
        this.lastPursuit.set(p.combatantId, curr);

        if (!prev) continue;
        if (this.snapshotsEqual(prev, curr)) continue;

        // Find matching combat combatant
        const combatState = this.combat.getState();
        if (!combatState) continue;
        const combatant = combatState.combatants.find((co) => co.id === p.combatantId);
        if (!combatant) continue;

        // Apply diffs: pursuit → combat
        this.applyPursuitDiffToCombat(p.combatantId, prev, curr);

        // Update combat snapshot
        this.lastCombat.set(p.combatantId, curr);
      }
    } finally {
      this.syncing = false;
    }
  }

  // ── Diff Application ───────────────────────────────────────

  private applyCombatDiffToPursuit(
    participantId: string,
    prev: SyncSnapshot,
    curr: SyncSnapshot,
  ): void {
    // HP change
    if (curr.hp !== prev.hp) {
      const delta = curr.hp - prev.hp;
      if (delta < 0) {
        this.pursuit.applyDamage(participantId, -delta);
      } else {
        this.pursuit.applyHealing(participantId, delta);
      }
    }

    // TempHP change
    if (curr.tempHP !== prev.tempHP) {
      this.pursuit.setTempHP(participantId, curr.tempHP);
    }

    // Conditions added
    for (const cond of curr.conditions) {
      if (!prev.conditions.includes(cond)) {
        this.pursuit.addCondition(participantId, cond);
      }
    }
    // Conditions removed
    for (const cond of prev.conditions) {
      if (!curr.conditions.includes(cond)) {
        this.pursuit.removeCondition(participantId, cond);
      }
    }
  }

  private applyPursuitDiffToCombat(
    combatantId: string,
    prev: SyncSnapshot,
    curr: SyncSnapshot,
  ): void {
    // HP change
    if (curr.hp !== prev.hp) {
      const delta = curr.hp - prev.hp;
      if (delta < 0) {
        this.combat.applyDamage(combatantId, -delta);
      } else {
        this.combat.applyHealing(combatantId, delta);
      }
    }

    // TempHP change
    if (curr.tempHP !== prev.tempHP) {
      this.combat.setTempHP(combatantId, curr.tempHP);
    }

    // Conditions added/removed
    const combatState = this.combat.getState();
    if (!combatState) return;
    const combatant = combatState.combatants.find((c) => c.id === combatantId);
    if (!combatant) return;

    const existingNames = combatant.statuses.map((s) => s.name);

    for (const cond of curr.conditions) {
      if (!prev.conditions.includes(cond) && !existingNames.includes(cond)) {
        this.combat.addStatus(combatantId, { name: cond });
      }
    }
    for (const cond of prev.conditions) {
      if (!curr.conditions.includes(cond)) {
        const idx = combatant.statuses.findIndex((s) => s.name === cond);
        if (idx >= 0) {
          this.combat.removeStatus(combatantId, idx);
        }
      }
    }
  }

  // ── Snapshot Helpers ───────────────────────────────────────

  private combatantSnapshot(c: Combatant): SyncSnapshot {
    return {
      hp: c.currentHP,
      maxHP: c.maxHP,
      tempHP: c.tempHP,
      conditions: c.statuses.map((s) => s.name).sort(),
      incapacitated: c.currentHP <= 0,
      dead: c.dead === true,
    };
  }

  private participantSnapshot(p: PursuitParticipant): SyncSnapshot {
    return {
      hp: p.currentHP,
      maxHP: p.maxHP,
      tempHP: p.tempHP,
      conditions: [...p.conditions].sort(),
      incapacitated: p.incapacitated,
      dead: false, // Pursuit doesn't have a "dead" concept, just incapacitated
    };
  }

  private snapshotsEqual(a: SyncSnapshot, b: SyncSnapshot): boolean {
    return a.hp === b.hp
      && a.maxHP === b.maxHP
      && a.tempHP === b.tempHP
      && a.incapacitated === b.incapacitated
      && a.dead === b.dead
      && a.conditions.length === b.conditions.length
      && a.conditions.every((c, i) => c === b.conditions[i]);
  }
}
