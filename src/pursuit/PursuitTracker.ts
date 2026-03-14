/**
 * PursuitTracker — State engine for the D&D 5e chase / pursuit system.
 *
 * Follows the same onChange() listener pattern as CombatTracker.
 * All state mutations go through this class; views subscribe via onChange().
 *
 * Turn phases:  ACTION  →  BONUS  →  MOVE  →  (resolve pending saves)  →  END
 * The view uses `canX()` query methods to enable/disable controls.
 */

import { App } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type {
  PursuitState,
  PursuitParticipant,
  PursuitListener,
  PursuitLogEntry,
  TurnAction,
  StealthCondition,
  ChaseEnvironment,
} from "./types";
import { computeStealthCondition, computeCarryPenalty } from "./types";

export class PursuitTracker {
  private app: App;
  private plugin: DndCampaignHubPlugin;
  private state: PursuitState | null = null;
  private listeners: Set<PursuitListener> = new Set();

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  // ── Subscriptions ──────────────────────────────────────────

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: PursuitListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const fn of this.listeners) fn(snapshot);
  }

  // ── State Access ───────────────────────────────────────────

  /** Returns a deep-copy snapshot of the current state, or null. */
  getState(): PursuitState | null {
    if (!this.state) return null;
    return JSON.parse(JSON.stringify(this.state));
  }

  /** Get a participant by ID (live reference — internal use). */
  private getParticipant(id: string): PursuitParticipant | undefined {
    return this.state?.participants.find((p) => p.id === id);
  }

  /** Get the currently active participant (live reference). */
  private getActive(): PursuitParticipant | undefined {
    if (!this.state || !this.state.started || this.state.ended) return undefined;
    return this.state.participants[this.state.turnIndex];
  }

  // ── Query helpers (used by the view to decide what to show) ─

  /** Can this participant still choose an action? */
  canAct(p: PursuitParticipant): boolean {
    return p.turnAction === undefined && !p.pendingDashSave;
  }

  /** Can this participant use a bonus action? */
  canBonus(p: PursuitParticipant): boolean {
    return p.hasCunningAction && p.bonusAction === undefined && !p.pendingDashSave;
  }

  /** Can this participant still move? */
  canMove(p: PursuitParticipant): boolean {
    return !p.hasMoved && !p.pendingDashSave;
  }

  /** Is the current turn ready to advance (no pending dash save)? */
  canAdvanceTurn(): boolean {
    const p = this.getActive();
    return !!p && !p.pendingDashSave;
  }

  /** Maximum movement feet for this participant this turn. */
  getMaxMovement(p: PursuitParticipant): number {
    let speed = this.getEffectiveSpeed(p);
    const dashed = p.turnAction === "dash" || p.bonusAction === "dash";
    if (dashed) speed *= 2;
    return speed;
  }

  // ── Setup ──────────────────────────────────────────────────

  /**
   * Initialize a new chase from prepared participant data.
   * Called by PursuitSetupModal after the GM assigns roles and stats.
   */
  setup(
    name: string,
    participants: PursuitParticipant[],
    environment: ChaseEnvironment,
    hasRangerPursuer: boolean,
  ): void {
    const stealthCondition = computeStealthCondition(environment, hasRangerPursuer);
    this.state = {
      name,
      participants,
      round: 1,
      turnIndex: 0,
      started: false,
      ended: false,
      environment,
      stealthCondition,
      hasRangerPursuer,
      catchDistance: 5,
      log: [{ round: 0, text: `Chase "${name}" initialized with ${participants.length} participants.` }],
    };
    this.emit();
  }

  // ── Initiative ─────────────────────────────────────────────

  /** Roll initiative for all participants (d20 + modifier). */
  rollAllInitiative(): void {
    if (!this.state) return;
    for (const p of this.state.participants) {
      const roll = Math.floor(Math.random() * 20) + 1;
      p.initiative = roll + p.initiativeModifier;
    }
    this.sortByInitiative();
    this.emit();
  }

  /** Set a specific participant's initiative (manual entry for PCs). */
  setInitiative(id: string, value: number): void {
    const p = this.getParticipant(id);
    if (!p) return;
    p.initiative = value;
    this.sortByInitiative();
    this.emit();
  }

  /** Keep initiative from combat (pre-sorted). */
  keepInitiativeFromCombat(): void {
    if (!this.state) return;
    this.sortByInitiative();
    this.emit();
  }

  private sortByInitiative(): void {
    if (!this.state) return;
    this.state.participants.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.initiativeModifier - a.initiativeModifier;
    });
  }

  /** Start the chase (initiative has been set). */
  startChase(): void {
    if (!this.state) return;
    this.sortByInitiative();
    this.state.started = true;
    this.state.turnIndex = 0;
    this.state.round = 1;
    // Find first non-skipped participant
    this.skipInactiveForward();
    this.addLog(`Chase begins! Round 1.`);
    this.emit();
  }

  // ── Turn Management ────────────────────────────────────────

  /** Reset per-turn flags for a participant at the start of their turn. */
  private resetTurnFlags(p: PursuitParticipant): void {
    p.turnAction = undefined;
    p.bonusAction = undefined;
    p.hasMoved = false;
    p.feetMovedThisTurn = 0;
    p.pendingDashSave = false;
    p.activePerceptionRoll = undefined;
    p.stealthRoll = undefined;
  }

  /** Advance to the next participant's turn. */
  nextTurn(): void {
    if (!this.state || !this.state.started || this.state.ended) return;

    const active = this.getActive();
    // Block if a CON save is still pending
    if (active?.pendingDashSave) return;

    // Mark current participant as done
    if (active) active.hasActed = true;

    const len = this.state.participants.length;
    let next = this.state.turnIndex + 1;

    // Check for round wrap
    if (next >= len) {
      this.runEndOfRound();
      this.state.round++;
      next = 0;
      // Reset per-turn state for all participants
      for (const p of this.state.participants) {
        p.hasActed = false;
        this.resetTurnFlags(p);
      }
      this.addLog(`Round ${this.state.round} begins.`);
    }

    this.state.turnIndex = next;
    this.skipInactiveForward();
    // Reset turn flags for the new active participant
    const newActive = this.getActive();
    if (newActive) this.resetTurnFlags(newActive);
    this.emit();
  }

  /** Go back to the previous participant's turn. */
  prevTurn(): void {
    if (!this.state || !this.state.started) return;

    let prev = this.state.turnIndex - 1;
    if (prev < 0) {
      if (this.state.round > 1) {
        this.state.round--;
        prev = this.state.participants.length - 1;
      } else {
        return;
      }
    }

    // Skip dropped/escaped backwards
    while (prev >= 0) {
      const p = this.state.participants[prev];
      if (p && !p.droppedOut && !p.escaped && !p.incapacitated) break;
      prev--;
    }
    if (prev < 0) prev = 0;

    this.state.turnIndex = prev;
    // Reset that participant's turn flags so they can re-do
    const p = this.getActive();
    if (p) {
      p.hasActed = false;
      this.resetTurnFlags(p);
    }
    this.emit();
  }

  /** Skip forward past inactive participants. Safety-capped to prevent infinite loop. */
  private skipInactiveForward(): void {
    if (!this.state) return;
    const len = this.state.participants.length;
    let checks = 0;
    while (checks < len) {
      const p = this.state.participants[this.state.turnIndex];
      if (!p || (!p.droppedOut && !p.escaped && !p.incapacitated)) break;
      this.state.turnIndex++;
      if (this.state.turnIndex >= len) {
        // Wrap — but don't trigger end-of-round again
        this.state.turnIndex = 0;
      }
      checks++;
    }
  }

  // ── Movement ───────────────────────────────────────────────

  /**
   * Move a participant by the given number of feet.
   * Enforces: only once per turn, clamped to max speed (doubled if dashed).
   * Positive = forward (away from pursuers for quarry, towards quarry for pursuers).
   *
   * Returns the actual feet moved, or 0 if blocked.
   */
  move(id: string, feet: number): number {
    if (!this.state) return 0;
    const p = this.getParticipant(id);
    if (!p || p.hasMoved || p.pendingDashSave) return 0;

    const maxFeet = this.getMaxMovement(p);
    const clamped = Math.min(Math.max(feet, 0), maxFeet);
    if (clamped === 0) return 0;

    p.position += clamped;
    p.hasMoved = true;
    p.feetMovedThisTurn = clamped;

    this.addLog(`${p.display} moves ${clamped}ft → position ${p.position}ft.`);

    // Sync carried participant position
    if (p.carrying) {
      const carried = this.getParticipant(p.carrying);
      if (carried) carried.position = p.position;
    }

    // Auto-detect catch / melee range
    this.checkCatchUp();
    this.emit();
    return clamped;
  }

  /** Set a participant's position directly (GM override). */
  setPosition(id: string, position: number): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.position = position;
    if (p.carrying) {
      const carried = this.getParticipant(p.carrying);
      if (carried) carried.position = p.position;
    }
    this.checkCatchUp();
    this.emit();
  }

  /** Get effective speed in feet, accounting for carry penalty and exhaustion. */
  getEffectiveSpeed(p: PursuitParticipant): number {
    // Base speed from active mode
    const entry = p.speeds.find((s) => s.mode === p.activeSpeed) ?? p.speeds[0];
    let speed = entry?.feet ?? 30;

    // Carry penalty
    if (p.carrying) {
      const carried = this.getParticipant(p.carrying);
      if (carried) {
        const result = computeCarryPenalty(p.strScore, carried.estimatedWeight);
        if (result.status === "ok") speed = Math.floor(speed * result.speedMultiplier);
        else if (result.status === "drag") speed = result.speedFeet;
        else speed = 0;
      }
    }

    // Exhaustion penalty (5e RAW: exhaustion 2+ halves speed)
    if (p.exhaustionLevel >= 2) speed = Math.floor(speed / 2);

    // Exhaustion 5: speed 0
    if (p.exhaustionLevel >= 5) speed = 0;

    return speed;
  }

  // ── Dash ───────────────────────────────────────────────────

  /**
   * Record a Dash action. Sets turnAction, increments dash counter.
   * If dashes exceed free dashes, sets pendingDashSave = true.
   * The view MUST resolve the save before the turn can advance.
   *
   * @returns "free" | "save-needed" indicating whether a CON save modal is required.
   */
  dash(id: string): "free" | "save-needed" {
    if (!this.state) return "free";
    const p = this.getParticipant(id);
    if (!p || p.turnAction !== undefined) return "free"; // Already acted

    p.dashesUsed++;
    p.turnAction = "dash";

    const needsSave = p.dashesUsed > p.freeDashes;
    if (needsSave) {
      p.pendingDashSave = true;
      this.addLog(`${p.display} dashes (${p.dashesUsed}/${p.freeDashes} free). DC 10 CON save required!`);
    } else {
      this.addLog(`${p.display} dashes (${p.dashesUsed}/${p.freeDashes} free).`);
    }

    this.emit();
    return needsSave ? "save-needed" : "free";
  }

  /**
   * Record a Dash as bonus action (Cunning Action).
   * Same dash-counter logic applies.
   */
  dashBonus(id: string): "free" | "save-needed" {
    if (!this.state) return "free";
    const p = this.getParticipant(id);
    if (!p || !p.hasCunningAction || p.bonusAction !== undefined) return "free";

    p.dashesUsed++;
    p.bonusAction = "dash";

    const needsSave = p.dashesUsed > p.freeDashes;
    if (needsSave) {
      p.pendingDashSave = true;
      this.addLog(`${p.display} bonus-dashes (${p.dashesUsed}/${p.freeDashes} free). DC 10 CON save required!`);
    } else {
      this.addLog(`${p.display} bonus-dashes (${p.dashesUsed}/${p.freeDashes} free).`);
    }

    this.emit();
    return needsSave ? "save-needed" : "free";
  }

  /**
   * Resolve a DC 10 CON save for an extra dash.
   * Clears pendingDashSave so the turn can proceed.
   * @returns Whether the save succeeded.
   */
  resolveDashSave(id: string, roll: number): boolean {
    if (!this.state) return false;
    const p = this.getParticipant(id);
    if (!p || !p.pendingDashSave) return false;

    p.pendingDashSave = false;

    const success = roll >= 10;
    if (!success) {
      p.exhaustionLevel++;
      this.addLog(`${p.display} fails CON save (rolled ${roll}). Exhaustion → ${p.exhaustionLevel}.`);
      if (p.exhaustionLevel >= 5) {
        p.incapacitated = true;
        p.droppedOut = true;
        this.addLog(`${p.display} collapses from exhaustion! Dropped out of the chase.`);
        this.checkChaseEnd();
      }
    } else {
      this.addLog(`${p.display} succeeds CON save (rolled ${roll}).`);
    }

    this.emit();
    return success;
  }

  // ── Actions ────────────────────────────────────────────────

  /** Set the action a participant takes this turn. Blocked if already acted. */
  setTurnAction(id: string, action: TurnAction): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p || p.turnAction !== undefined) return; // Already used action

    p.turnAction = action;

    if (action === "hide") {
      this.addLog(`${p.display} takes the Hide action.`);
    } else if (action === "disengage") {
      this.addLog(`${p.display} takes the Disengage action.`);
    } else if (action === "dodge") {
      this.addLog(`${p.display} takes the Dodge action.`);
    } else if (action === "other") {
      this.addLog(`${p.display} uses their action (spell/item/other).`);
    }

    this.emit();
  }

  /** Set the bonus action (for Cunning Action users). Blocked if already used. */
  setBonusAction(id: string, action: TurnAction): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p || !p.hasCunningAction || p.bonusAction !== undefined) return;

    p.bonusAction = action;
    this.addLog(`${p.display} uses Cunning Action: ${action}.`);
    this.emit();
  }

  // ── Active Speed ───────────────────────────────────────────

  setActiveSpeed(id: string, mode: string): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.activeSpeed = mode;
    this.emit();
  }

  // ── Line of Sight ──────────────────────────────────────────

  /** GM toggles whether a quarry member has broken line of sight. */
  setLineOfSightBroken(id: string, broken: boolean): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p || p.role !== "quarry") return;
    p.lineOfSightBroken = broken;
    if (broken) {
      this.addLog(`${p.display} breaks line of sight!`);
    }
    this.emit();
  }

  // ── Stealth (end-of-round) ─────────────────────────────────

  /**
   * Resolve a quarry member's stealth check against all pursuers.
   * Only valid when LoS is broken and the quarry took the Hide action
   * (or has Cunning Action + used bonus action to Hide).
   *
   * @returns "escaped" | "detected" | "ineligible"
   */
  resolveStealthCheck(
    quarryId: string,
    roll: number,
  ): "escaped" | "detected" | "ineligible" {
    if (!this.state) return "ineligible";
    const quarry = this.getParticipant(quarryId);
    if (!quarry || quarry.role !== "quarry") return "ineligible";

    // Check eligibility
    if (!quarry.lineOfSightBroken) return "ineligible";
    const canHide =
      quarry.turnAction === "hide" ||
      (quarry.hasCunningAction && quarry.bonusAction === "hide");
    if (!canHide) return "ineligible";

    quarry.stealthRoll = roll;

    // Find highest effective perception among pursuers
    const pursuers = this.state.participants.filter((p) => p.role === "pursuer" && !p.droppedOut);
    let highestPerception = 0;
    let highestPursuerName = "";
    for (const pur of pursuers) {
      // Active Perception roll beats passive if higher
      const effective = Math.max(pur.passivePerception, pur.activePerceptionRoll ?? 0);
      if (effective > highestPerception) {
        highestPerception = effective;
        highestPursuerName = pur.display;
      }
    }

    if (roll > highestPerception) {
      quarry.escaped = true;
      // Release carried participant too
      if (quarry.carrying) {
        const carried = this.getParticipant(quarry.carrying);
        if (carried) carried.escaped = true;
      }
      this.addLog(`${quarry.display} escapes! (Stealth ${roll} vs ${highestPursuerName}'s Perception ${highestPerception})`);
      this.checkChaseEnd();
      this.emit();
      return "escaped";
    } else {
      quarry.lineOfSightBroken = false;
      this.addLog(`${quarry.display} detected! (Stealth ${roll} vs ${highestPursuerName}'s Perception ${highestPerception})`);
      this.emit();
      return "detected";
    }
  }

  /** Set an active Perception roll for a pursuer (Search action). */
  setActivePerception(id: string, roll: number): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p || p.role !== "pursuer") return;
    if (p.turnAction !== undefined) return; // Already used action
    p.activePerceptionRoll = roll;
    p.turnAction = "other"; // Search is their action
    this.addLog(`${p.display} searches (Perception ${roll}).`);
    this.emit();
  }

  // ── Carry ──────────────────────────────────────────────────

  /** One participant picks up another. */
  pickUp(carrierId: string, targetId: string): boolean {
    if (!this.state) return false;
    const carrier = this.getParticipant(carrierId);
    const target = this.getParticipant(targetId);
    if (!carrier || !target) return false;

    // Prevent overwriting an existing carry
    if (carrier.carrying) return false;

    // Check capacity
    const result = computeCarryPenalty(carrier.strScore, target.estimatedWeight);
    if (result.status === "impossible") {
      this.addLog(`${carrier.display} cannot carry ${target.display} (too heavy).`);
      this.emit();
      return false;
    }

    carrier.carrying = targetId;
    target.carriedBy = carrierId;
    target.position = carrier.position;

    const penalty = result.status === "ok" ? "speed halved" : "speed 5ft (dragging)";
    this.addLog(`${carrier.display} picks up ${target.display} (${penalty}).`);
    this.emit();
    return true;
  }

  /** Drop a carried participant. */
  putDown(carrierId: string): void {
    if (!this.state) return;
    const carrier = this.getParticipant(carrierId);
    if (!carrier || !carrier.carrying) return;
    const target = this.getParticipant(carrier.carrying);
    if (target) {
      target.carriedBy = undefined;
      this.addLog(`${carrier.display} puts down ${target.display}.`);
    }
    carrier.carrying = undefined;
    this.emit();
  }

  // ── Drop out / state changes ───────────────────────────────

  /** Participant voluntarily drops out of the chase. */
  dropOut(id: string): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.droppedOut = true;
    this.addLog(`${p.display} drops out of the chase.`);
    this.checkChaseEnd();
    this.emit();
  }

  /** End the chase with a specific outcome. */
  endChase(outcome: PursuitState["outcome"]): void {
    if (!this.state) return;
    this.state.ended = true;
    this.state.outcome = outcome;
    this.addLog(`Chase ended: ${outcome}.`);
    this.emit();
  }

  /** Clear the chase state entirely. */
  clear(): void {
    this.state = null;
    this.emit();
  }

  // ── Environment ────────────────────────────────────────────

  /** Update the chase environment (mid-chase environment change). */
  updateEnvironment(env: ChaseEnvironment): void {
    if (!this.state) return;
    this.state.environment = env;
    this.state.stealthCondition = computeStealthCondition(env, this.state.hasRangerPursuer);
    this.addLog(`Environment changed: ${env.name} (stealth: ${this.state.stealthCondition}).`);
    this.emit();
  }

  /** Toggle ranger/Survival pursuer flag. */
  setRangerPursuer(has: boolean): void {
    if (!this.state) return;
    this.state.hasRangerPursuer = has;
    this.state.stealthCondition = computeStealthCondition(this.state.environment, has);
    this.emit();
  }

  // ── Internal helpers ───────────────────────────────────────

  /** Run end-of-round logic: log stealth-eligible quarry, then reset LoS. */
  private runEndOfRound(): void {
    if (!this.state) return;

    const quarries = this.state.participants.filter(
      (p) => p.role === "quarry" && !p.droppedOut && !p.escaped && !p.incapacitated
    );

    const eligible = quarries.filter((q) => {
      if (!q.lineOfSightBroken) return false;
      return q.turnAction === "hide" || (q.hasCunningAction && q.bonusAction === "hide");
    });

    if (eligible.length > 0) {
      this.addLog(`End of round ${this.state.round}: ${eligible.length} quarry member(s) eligible for stealth check.`);
    } else if (quarries.length > 0) {
      this.addLog(`End of round ${this.state.round}: No quarry members eligible for stealth (need LoS broken + Hide action).`);
    }

    // Reset LoS broken for next round (stealth already resolved or not eligible)
    for (const q of quarries) {
      q.lineOfSightBroken = false;
    }
  }

  /**
   * Check if any pursuer has caught up with a quarry (position within catchDistance).
   * Logs a notice but does NOT auto-end — the GM decides what happens.
   */
  private checkCatchUp(): void {
    if (!this.state) return;
    const catchDist = this.state.catchDistance;
    const quarries = this.state.participants.filter(
      (p) => p.role === "quarry" && !p.droppedOut && !p.escaped && !p.incapacitated
    );
    const pursuers = this.state.participants.filter(
      (p) => p.role === "pursuer" && !p.droppedOut && !p.incapacitated
    );

    for (const pur of pursuers) {
      for (const q of quarries) {
        const dist = q.position - pur.position;
        if (dist <= catchDist && dist >= 0) {
          this.addLog(`⚔️ ${pur.display} catches up to ${q.display}! (${dist}ft apart)`);
        }
      }
    }
  }

  /** Check if the chase should end (all quarry escaped/caught or all pursuers dropped out). */
  private checkChaseEnd(): void {
    if (!this.state) return;

    const quarries = this.state.participants.filter((p) => p.role === "quarry");
    const pursuers = this.state.participants.filter((p) => p.role === "pursuer");

    const allQuarryGone = quarries.every((q) => q.escaped || q.droppedOut || q.incapacitated);
    const allPursuerGone = pursuers.every((p) => p.droppedOut || p.incapacitated);

    if (allQuarryGone) {
      const allEscaped = quarries.every((q) => q.escaped);
      this.endChase(allEscaped ? "escaped" : "caught");
    } else if (allPursuerGone) {
      this.endChase("escaped");
    }
  }

  /** Add a log entry for the current round. */
  private addLog(text: string): void {
    if (!this.state) return;
    this.state.log.push({ round: this.state.round, text });
  }
}
