/**
 * PursuitTracker — State engine for the D&D 5e chase / pursuit system.
 *
 * Follows the same onChange() listener pattern as CombatTracker.
 * All state mutations go through this class; views subscribe via onChange().
 *
 * Fully automated phase machine:
 *   COMPLICATION → COMPLICATION_CHECK → ACTION → ACTION_RESOLVE
 *   → BONUS → BONUS_RESOLVE → MOVEMENT → TURN_END
 *
 * NPCs auto-roll all checks (d20 + modifier).
 * PCs prompt the GM for roll results via pendingInput.
 * Line of Sight is auto-computed (distance + environment + complication).
 * Hidden quarry not found by end of round → ESCAPE.
 */

import { App } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type {
  PursuitState,
  PursuitParticipant,
  PursuitListener,
  PursuitLogEntry,
  TurnAction,
  TurnPhase,
  ActiveComplication,
  PendingInput,
  StealthCondition,
  ChaseEnvironment,
} from "./types";
import { computeStealthCondition, computeCarryPenalty, CHASE_COMPLICATIONS } from "./types";

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

  // ── Query helpers ───────────────────────────────────────────

  /** Maximum movement feet for this participant this turn (accounting for dash + complication). */
  getMaxMovement(p: PursuitParticipant): number {
    if (p.movementPenalty === "zero") return 0;
    let speed = this.getEffectiveSpeed(p);
    const dashed = p.turnAction === "dash" || p.bonusAction === "dash";
    if (dashed) speed *= 2;
    if (p.movementPenalty === "halved") speed = Math.floor(speed / 2);
    return speed;
  }

  /** Whether Line of Sight is auto-broken for a quarry based on distance + environment + complication. */
  isLoSBroken(quarry: PursuitParticipant): boolean {
    if (!this.state) return false;
    if (quarry.complicationLoSBreak) return true;
    const env = this.state.environment;
    if (!env.hasCover && !env.hasObscurement && !env.crowdedOrNoisy) return false;
    const pursuers = this.state.participants.filter(
      (p) => p.role === "pursuer" && !p.droppedOut && !p.incapacitated
    );
    if (pursuers.length === 0) return true;
    const nearest = Math.min(...pursuers.map((p) => p.position));
    return quarry.position - nearest >= 30;
  }

  /** Auto-roll a d20 + modifier. Returns { natural, total }. */
  private autoRoll(modifier: number): { natural: number; total: number } {
    const natural = Math.floor(Math.random() * 20) + 1;
    return { natural, total: natural + modifier };
  }

  /** Roll a dice formula like "1d6", "2d8+3". */
  private rollDice(formula: string): number {
    const match = formula.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (!match) return 0;
    const count = parseInt(match[1]!, 10);
    const sides = parseInt(match[2]!, 10);
    const mod = parseInt(match[3] || "0", 10);
    let total = mod;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return Math.max(0, total);
  }

  /** Get the ability modifier for a complication check. */
  private getAbilityModifier(p: PursuitParticipant, ability?: string): number {
    switch (ability) {
      case "DEX": return p.initiativeModifier;
      case "STR": return Math.floor((p.strScore - 10) / 2);
      case "Stealth": return p.stealthModifier;
      default: return 0;
    }
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
      turnPhase: "complication" as TurnPhase,
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
    this.skipInactiveForward();
    this.addLog(`Chase begins! Round 1.`);
    this.beginTurn();
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
    p.movementPenalty = "none";
    p.complicationLoSBreak = false;
  }

  /** Advance to the next participant's turn. */
  nextTurn(): void {
    if (!this.state || !this.state.started || this.state.ended) return;

    const active = this.getActive();
    if (active) active.hasActed = true;

    const len = this.state.participants.length;
    let next = this.state.turnIndex + 1;

    // Round wrap
    if (next >= len) {
      this.runEndOfRound();
      if (this.state.ended) return;
      this.state.round++;
      next = 0;
      for (const p of this.state.participants) {
        p.hasActed = false;
        this.resetTurnFlags(p);
      }
      this.addLog(`Round ${this.state.round} begins.`);
    }

    this.state.turnIndex = next;
    this.skipInactiveForward();
    this.beginTurn();
  }

  /** Go back to the previous participant's turn (GM undo). */
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

    while (prev >= 0) {
      const p = this.state.participants[prev];
      if (p && !p.droppedOut && !p.escaped && !p.incapacitated) break;
      prev--;
    }
    if (prev < 0) prev = 0;

    this.state.turnIndex = prev;
    const p = this.getActive();
    if (p) {
      p.hasActed = false;
      this.resetTurnFlags(p);
    }
    this.beginTurn();
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

  // ── Phase Machine ───────────────────────────────────────────
  //
  // Turn flow: COMPLICATION → COMPLICATION_CHECK → ACTION → ACTION_RESOLVE
  //            → BONUS → BONUS_RESOLVE → MOVEMENT → TURN_END
  //
  // NPCs auto-roll all checks. PCs set pendingInput for GM entry.

  /** Begin the current participant's turn: reset flags, compute LoS, roll complication. */
  private beginTurn(): void {
    if (!this.state || this.state.ended) return;
    const p = this.getActive();
    if (!p) return;
    this.resetTurnFlags(p);
    if (p.role === "quarry") {
      p.lineOfSightBroken = this.isLoSBroken(p);
    }
    this.state.currentComplication = undefined;
    this.state.pendingInput = undefined;
    this.rollComplication();
  }

  /** Roll d6 complication for the active participant. */
  private rollComplication(): void {
    if (!this.state) return;
    const p = this.getActive();
    if (!p) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    const entry = CHASE_COMPLICATIONS[roll - 1];
    if (!entry) return;
    const comp: ActiveComplication = { entry, roll, resolved: false };
    this.state.currentComplication = comp;
    this.addLog(`🎲 ${p.display} — Complication: ${entry.title} (d6 = ${roll}).`);

    if (!entry.requiresCheck) {
      comp.resolved = true;
      this.state.turnPhase = "complication";
      this.emit();
      return;
    }

    // Check needed — auto-roll for NPCs, prompt for PCs
    if (!p.player) {
      const mod = this.getAbilityModifier(p, entry.checkAbility);
      const { natural, total } = this.autoRoll(mod);
      comp.checkNatural = natural;
      comp.checkResult = total;
      comp.resolved = true;
      comp.passed = total >= (entry.checkDC ?? 0);
      this.applyComplicationResult(p, comp);
      this.state.turnPhase = "complication";
      this.emit();
    } else {
      const mod = this.getAbilityModifier(p, entry.checkAbility);
      this.state.pendingInput = {
        type: "complication-check",
        participantId: p.id,
        label: `${entry.checkAbility} DC ${entry.checkDC}`,
        modifier: mod,
        dc: entry.checkDC,
        description: entry.description,
      };
      this.state.turnPhase = "complication-check";
      this.emit();
    }
  }

  /** Submit a complication check result (PC roll from GM). */
  submitComplicationCheck(total: number): void {
    if (!this.state) return;
    const comp = this.state.currentComplication;
    const p = this.getActive();
    if (!comp || !p || comp.resolved) return;

    comp.checkResult = total;
    comp.resolved = true;
    comp.passed = total >= (comp.entry.checkDC ?? 0);
    this.applyComplicationResult(p, comp);
    this.state.pendingInput = undefined;
    this.state.turnPhase = "action";
    this.emit();
  }

  /** Apply complication effects after the check is resolved. */
  private applyComplicationResult(p: PursuitParticipant, comp: ActiveComplication): void {
    const effect = comp.passed ? comp.entry.onSuccess : comp.entry.onFail;
    if (!effect) {
      comp.effectDescription = comp.passed ? "Passed — no effect." : "No penalty on failure.";
      return;
    }
    comp.effectDescription = effect.description;
    if (effect.grantsLoS) {
      p.complicationLoSBreak = true;
      p.lineOfSightBroken = true;
      this.addLog(`${p.display}: ${effect.description}`);
    }
    if (effect.speedPenalty === "halved") {
      p.movementPenalty = "halved";
      this.addLog(`${p.display}: speed halved this turn.`);
    } else if (effect.speedPenalty === "zero") {
      p.movementPenalty = "zero";
      this.addLog(`${p.display}: loses all movement this turn.`);
    }
    if (effect.damage) {
      const dmg = this.rollDice(effect.damage);
      p.currentHP -= dmg;
      if (p.currentHP <= 0) {
        p.currentHP = 0;
        p.incapacitated = true;
        p.droppedOut = true;
        this.addLog(`${p.display} takes ${dmg} damage and is incapacitated!`);
        this.checkChaseEnd();
      } else {
        this.addLog(`${p.display} takes ${dmg} damage (HP: ${p.currentHP}/${p.maxHP}).`);
      }
    }
  }

  /** Advance from complication to action phase (called by view "Continue" button). */
  advanceToAction(): void {
    if (!this.state) return;
    this.state.pendingInput = undefined;
    this.state.turnPhase = "action";
    this.emit();
  }

  /** Select the action for the active participant. */
  selectAction(action: TurnAction): void {
    if (!this.state) return;
    const p = this.getActive();
    if (!p || p.turnAction !== undefined) return;

    p.turnAction = action;
    if (action === "dash") {
      this.handleDash(p, false);
    } else if (action === "hide") {
      this.handleHide(p, false);
    } else if (action === "search") {
      this.handleSearch(p, false);
    } else {
      this.addLog(`${p.display} takes the ${action} action.`);
      this.advanceAfterAction(p);
    }
  }

  /** Handle a Dash action (or bonus dash). */
  private handleDash(p: PursuitParticipant, isBonus: boolean): void {
    p.dashesUsed++;
    const needsSave = p.dashesUsed > p.freeDashes;
    const label = isBonus ? "bonus-dashes" : "dashes";
    if (needsSave) {
      if (!p.player) {
        const { natural, total } = this.autoRoll(p.conModifier);
        const passed = total >= 10;
        if (!passed) {
          p.exhaustionLevel++;
          this.addLog(`${p.display} ${label} (${p.dashesUsed}/${p.freeDashes} free). CON save ${total} (d20=${natural}) — FAIL! Exhaustion → ${p.exhaustionLevel}.`);
          if (p.exhaustionLevel >= 5) {
            p.incapacitated = true;
            p.droppedOut = true;
            this.addLog(`${p.display} collapses from exhaustion!`);
            this.checkChaseEnd();
          }
        } else {
          this.addLog(`${p.display} ${label} (${p.dashesUsed}/${p.freeDashes} free). CON save ${total} (d20=${natural}) — passed.`);
        }
        this.advanceAfterAction(p, isBonus);
      } else {
        p.pendingDashSave = true;
        this.addLog(`${p.display} ${label} (${p.dashesUsed}/${p.freeDashes} free). DC 10 CON save required!`);
        this.state!.pendingInput = {
          type: "con-save",
          participantId: p.id,
          label: "CON Save DC 10",
          modifier: p.conModifier,
          dc: 10,
          description: `DC 10 Constitution save to avoid exhaustion (dash ${p.dashesUsed}, ${p.freeDashes} free).`,
        };
        this.state!.turnPhase = isBonus ? "bonus-resolve" : "action-resolve";
        this.emit();
      }
    } else {
      this.addLog(`${p.display} ${label} (${p.dashesUsed}/${p.freeDashes} free).`);
      this.advanceAfterAction(p, isBonus);
    }
  }

  /** Handle a Hide action (or bonus hide via Cunning Action). */
  private handleHide(p: PursuitParticipant, isBonus: boolean): void {
    if (p.role === "quarry") {
      p.lineOfSightBroken = this.isLoSBroken(p);
    }
    if (!p.lineOfSightBroken && p.role === "quarry") {
      this.addLog(`${p.display} tries to hide but line of sight is not broken!`);
      this.advanceAfterAction(p, isBonus);
      return;
    }

    if (!p.player) {
      const { natural, total } = this.autoRoll(p.stealthModifier);
      this.resolveHide(p, total, natural, isBonus);
    } else {
      this.state!.pendingInput = {
        type: "stealth",
        participantId: p.id,
        label: "Stealth Check",
        modifier: p.stealthModifier,
        description: "Roll Stealth to hide from pursuers.",
      };
      this.state!.turnPhase = isBonus ? "bonus-resolve" : "action-resolve";
      this.emit();
    }
  }

  /** Resolve a Hide attempt: compare stealth to all pursuers' passive perception. */
  private resolveHide(p: PursuitParticipant, total: number, natural: number | undefined, isBonus: boolean): void {
    if (!this.state) return;
    p.stealthRoll = total;
    const pursuers = this.state.participants.filter(
      (q) => q.role === "pursuer" && !q.droppedOut && !q.incapacitated
    );
    let allHidden = true;
    const spotted: string[] = [];
    for (const pur of pursuers) {
      if (total < pur.passivePerception) {
        allHidden = false;
        spotted.push(pur.display);
      }
    }
    if (allHidden && pursuers.length > 0) {
      p.isHidden = true;
      p.hiddenStealthRoll = total;
      this.addLog(`${p.display} hides! Stealth ${total}${natural != null ? ` (d20=${natural})` : ""} — hidden from all pursuers.`);
    } else {
      p.isHidden = false;
      p.hiddenStealthRoll = undefined;
      this.addLog(`${p.display} fails to hide (Stealth ${total}${natural != null ? `, d20=${natural}` : ""}) — spotted by ${spotted.join(", ")}.`);
    }
    this.advanceAfterAction(p, isBonus);
  }

  /** Handle a Search action (pursuers only, to find hidden quarry). */
  private handleSearch(p: PursuitParticipant, isBonus: boolean): void {
    if (!p.player) {
      const { natural, total } = this.autoRoll(p.perceptionModifier);
      this.resolveSearch(p, total, natural, isBonus);
    } else {
      this.state!.pendingInput = {
        type: "perception",
        participantId: p.id,
        label: "Perception Check",
        modifier: p.perceptionModifier,
        description: "Roll Perception to find hidden quarry.",
      };
      this.state!.turnPhase = isBonus ? "bonus-resolve" : "action-resolve";
      this.emit();
    }
  }

  /** Resolve a Search: compare perception to all hidden quarry's stealth rolls. */
  private resolveSearch(p: PursuitParticipant, total: number, natural: number | undefined, isBonus: boolean): void {
    if (!this.state) return;
    p.activePerceptionRoll = total;
    const hidden = this.state.participants.filter(
      (q) => q.role === "quarry" && q.isHidden && !q.escaped && !q.droppedOut
    );
    for (const quarry of hidden) {
      const stealth = quarry.hiddenStealthRoll ?? 0;
      if (total >= stealth) {
        quarry.isHidden = false;
        quarry.hiddenStealthRoll = undefined;
        this.addLog(`${p.display} searches (Perception ${total}${natural != null ? `, d20=${natural}` : ""}) — finds ${quarry.display}! (Stealth was ${stealth})`);
      } else {
        this.addLog(`${p.display} searches (Perception ${total}${natural != null ? `, d20=${natural}` : ""}) — ${quarry.display} remains hidden (Stealth ${stealth}).`);
      }
    }
    if (hidden.length === 0) {
      this.addLog(`${p.display} searches but no quarry is hidden.`);
    }
    this.advanceAfterAction(p, isBonus);
  }

  /** Submit the resolution of an action roll (PC input from GM). */
  submitActionInput(total: number): void {
    if (!this.state) return;
    const p = this.getActive();
    const pending = this.state.pendingInput;
    if (!p || !pending) return;

    this.state.pendingInput = undefined;

    if (pending.type === "con-save") {
      p.pendingDashSave = false;
      const passed = total >= 10;
      if (!passed) {
        p.exhaustionLevel++;
        this.addLog(`${p.display} CON save ${total} — FAIL! Exhaustion → ${p.exhaustionLevel}.`);
        if (p.exhaustionLevel >= 5) {
          p.incapacitated = true;
          p.droppedOut = true;
          this.addLog(`${p.display} collapses from exhaustion!`);
          this.checkChaseEnd();
        }
      } else {
        this.addLog(`${p.display} CON save ${total} — passed.`);
      }
      const isBonus = this.state.turnPhase === "bonus-resolve";
      this.advanceAfterAction(p, isBonus);
    } else if (pending.type === "stealth") {
      const isBonus = this.state.turnPhase === "bonus-resolve";
      this.resolveHide(p, total, undefined, isBonus);
    } else if (pending.type === "perception") {
      const isBonus = this.state.turnPhase === "bonus-resolve";
      this.resolveSearch(p, total, undefined, isBonus);
    }
  }

  /** Advance to the next phase after an action (or bonus action) resolves. */
  private advanceAfterAction(p: PursuitParticipant, isBonus = false): void {
    if (!this.state) return;
    this.state.pendingInput = undefined;
    if (!isBonus && p.hasCunningAction && p.bonusAction === undefined) {
      this.state.turnPhase = "bonus";
    } else {
      this.state.turnPhase = "movement";
    }
    this.emit();
  }

  /** Select a bonus action (Cunning Action). */
  selectBonusAction(action: TurnAction): void {
    if (!this.state) return;
    const p = this.getActive();
    if (!p || !p.hasCunningAction || p.bonusAction !== undefined) return;

    p.bonusAction = action;
    if (action === "dash") {
      this.handleDash(p, true);
    } else if (action === "hide") {
      this.handleHide(p, true);
    } else {
      this.addLog(`${p.display} uses Cunning Action: ${action}.`);
      this.state.turnPhase = "movement";
      this.emit();
    }
  }

  /** Skip the bonus action phase. */
  skipBonusAction(): void {
    if (!this.state) return;
    this.state.turnPhase = "movement";
    this.emit();
  }

  // ── Movement ───────────────────────────────────────────────

  /** Confirm movement for the active participant (called from movement phase). */
  confirmMovement(feet: number): void {
    if (!this.state) return;
    const p = this.getActive();
    if (!p || p.hasMoved) return;

    const maxFeet = this.getMaxMovement(p);
    const clamped = Math.min(Math.max(feet, 0), maxFeet);

    p.position += clamped;
    p.hasMoved = true;
    p.feetMovedThisTurn = clamped;

    if (clamped > 0) {
      this.addLog(`${p.display} moves ${clamped}ft → position ${p.position}ft.`);
    } else {
      this.addLog(`${p.display} stays in place (position ${p.position}ft).`);
    }

    if (p.carrying) {
      const carried = this.getParticipant(p.carrying);
      if (carried) carried.position = p.position;
    }

    this.checkCatchUp();

    if (p.role === "quarry") {
      p.lineOfSightBroken = this.isLoSBroken(p);
    }

    this.state.turnPhase = "turn-end";
    this.emit();
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

  /** Set a participant's active speed mode. */
  setActiveSpeed(id: string, mode: string): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.activeSpeed = mode;
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

  /** Run end-of-round logic: hidden quarry that weren't found this round escape. */
  private runEndOfRound(): void {
    if (!this.state) return;

    const hidden = this.state.participants.filter(
      (p) => p.role === "quarry" && p.isHidden && !p.droppedOut && !p.escaped && !p.incapacitated
    );

    for (const quarry of hidden) {
      quarry.escaped = true;
      if (quarry.carrying) {
        const carried = this.getParticipant(quarry.carrying);
        if (carried) carried.escaped = true;
      }
      this.addLog(`🏃 ${quarry.display} escapes! Hidden quarry was not found by end of round ${this.state.round}.`);
    }

    if (hidden.length > 0) {
      this.checkChaseEnd();
    }

    // Reset per-turn LoS (will be recomputed at start of each turn)
    for (const q of this.state.participants.filter((p) => p.role === "quarry")) {
      q.lineOfSightBroken = false;
      q.complicationLoSBreak = false;
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
