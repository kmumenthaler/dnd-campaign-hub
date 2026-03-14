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
import {
  PursuitState,
  PursuitParticipant,
  PursuitListener,
  PursuitLogEntry,
  TurnAction,
  TurnPhase,
  ActiveComplication,
  PendingInput,
  PendingComplicationForNext,
  ComplicationCheckOption,
  StealthCondition,
  ChaseEnvironment,
} from "./types";
import { computeStealthCondition, computeCarryPenalty, totalBurdenWeight } from "./types";
import { getComplicationTable } from "./complications";

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
    speed -= (p.movementReductionFeet ?? 0);
    return Math.max(0, speed);
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
      case "CON": return p.conModifier;
      case "WIS": return p.wisModifier;
      case "INT": return p.intModifier;
      case "CHA": return p.chaModifier;
      case "Stealth": return p.stealthModifier;
      case "Perception": return p.perceptionModifier;
      case "Athletics": return Math.floor((p.strScore - 10) / 2);
      case "Acrobatics": return p.initiativeModifier;
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
    maxDistance = 0,
    maxRounds = 0,
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
      complicationTableId: environment.complicationTableId ?? "urban",
      environment,
      stealthCondition,
      hasRangerPursuer,
      catchDistance: 5,
      maxDistance,
      maxRounds,
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
    p.movementReductionFeet = 0;
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
      // If escape checks are pending, don't advance yet
      if (this.state.escapeCheckQueue && this.state.escapeCheckQueue.length > 0) return;
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

  /** Begin the current participant's turn: reset flags, resolve any pending complication, or go to action. */
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
    this.state.endOfTurnD20 = undefined;

    // Apply start penalty (first turn only)
    if (!p.startPenaltyApplied && p.startPenalty !== "none") {
      p.movementPenalty = p.startPenalty;
      p.startPenaltyApplied = true;
      this.addLog(`${p.display} starts with movement ${p.startPenalty === "zero" ? "halted" : "halved"} (start penalty).`);
    }

    // Auto-assign default target for pursuers (closest quarry they can perceive)
    if (p.role === "pursuer" && !p.activeTargetId) {
      this.autoAssignTarget(p);
    }

    // Check for pending complication from previous participant's d20 roll
    const pending = this.state.pendingComplicationForNext;
    if (pending) {
      this.state.pendingComplicationForNext = undefined;
      this.resolvePendingComplication(p, pending);
    } else {
      this.state.turnPhase = "action";
      this.emit();
    }
  }

  /** Auto-assign the closest visible quarry as a pursuer's target. */
  private autoAssignTarget(pursuer: PursuitParticipant): void {
    if (!this.state) return;
    const quarries = this.state.participants.filter(
      (q) => q.role === "quarry" && !q.escaped && !q.droppedOut && !q.incapacitated
        && this.canPerceive(pursuer, q)
    );
    if (quarries.length === 0) return;
    // Closest quarry by position difference
    quarries.sort((a, b) => Math.abs(a.position - pursuer.position) - Math.abs(b.position - pursuer.position));
    pursuer.activeTargetId = quarries[0]!.id;
  }

  /** Whether a pursuer can perceive a quarry (accounts for movement plane + hidden + tremorsense). */
  canPerceive(pursuer: PursuitParticipant, quarry: PursuitParticipant): boolean {
    // Hidden quarry cannot be perceived
    if (quarry.isHidden) return false;
    // Ground pursuer cannot perceive burrowing quarry unless tremorsense
    if (quarry.movementPlane === "underground" && pursuer.movementPlane !== "underground" && !pursuer.hasTremorsense) return false;
    return true;
  }

  /** Whether a pursuer can physically catch a quarry (same movement plane required for melee). */
  canCatch(pursuer: PursuitParticipant, quarry: PursuitParticipant): boolean {
    if (!this.canPerceive(pursuer, quarry)) return false;
    // Air quarry can only be caught by air pursuer
    if (quarry.movementPlane === "air" && pursuer.movementPlane !== "air") return false;
    // Underground quarry can only be caught by underground pursuer
    if (quarry.movementPlane === "underground" && pursuer.movementPlane !== "underground") return false;
    return true;
  }

  /** Set the active chase target for a pursuer (GM action). */
  setActiveTarget(pursuerId: string, quarryId: string): void {
    const p = this.getParticipant(pursuerId);
    if (!p || p.role !== "pursuer") return;
    p.activeTargetId = quarryId;
    const q = this.getParticipant(quarryId);
    if (q) this.addLog(`${p.display} targets ${q.display}.`);
    this.emit();
  }

  /** Resolve a complication that was rolled by the previous participant (or quarry obstacle). */
  private resolvePendingComplication(p: PursuitParticipant, pending: PendingComplicationForNext): void {
    if (!this.state) return;
    const comp: ActiveComplication = {
      entry: pending.entry,
      d20Roll: pending.d20Roll,
      rolledByName: pending.rolledByName,
      resolved: false,
    };
    this.state.currentComplication = comp;
    const src = pending.isQuarryObstacle
      ? `obstacle from ${pending.rolledByName}`
      : `complication from ${pending.rolledByName}`;
    this.addLog(`⚠️ ${p.display} faces ${src}: ${pending.entry.title} (d20=${pending.d20Roll}).`);

    if (pending.entry.type === "gm-adjudicate") {
      comp.resolved = true;
      comp.effectDescription = pending.entry.autoEffect?.description ?? pending.entry.description;
      this.state.turnPhase = "complication";
      this.emit();
      return;
    }

    const checkOptions = pending.entry.checkOptions;
    if (!checkOptions || checkOptions.length === 0) {
      comp.resolved = true;
      this.state.turnPhase = "complication";
      this.emit();
      return;
    }

    if (!p.player) {
      // NPC: auto-pick best check and roll
      const best = this.pickBestCheck(p, checkOptions);
      comp.selectedCheck = best;
      const mod = this.getAbilityModifier(p, best.abilityKey);
      const { natural, total } = this.autoRoll(mod);
      comp.checkNatural = natural;
      comp.checkResult = total;
      comp.resolved = true;
      comp.passed = total >= best.dc;
      this.applyComplicationResult(p, comp);
      this.state.turnPhase = "complication";
      this.emit();
    } else {
      // PC: prompt GM for check
      if (checkOptions.length === 1) {
        const opt = checkOptions[0]!;
        comp.selectedCheck = opt;
        const mod = this.getAbilityModifier(p, opt.abilityKey);
        this.state.pendingInput = {
          type: "complication-check",
          participantId: p.id,
          label: opt.label,
          modifier: mod,
          dc: opt.dc,
          description: pending.entry.description,
        };
      } else {
        // Multiple options — view will let GM pick
        const mod = this.getAbilityModifier(p, checkOptions[0]!.abilityKey);
        this.state.pendingInput = {
          type: "complication-check",
          participantId: p.id,
          label: checkOptions.map((o) => o.label).join(" or "),
          modifier: mod,
          dc: checkOptions[0]!.dc,
          description: pending.entry.description,
          checkOptions,
        };
      }
      this.state.turnPhase = "complication-check";
      this.emit();
    }
  }

  /** Pick the check option where the NPC has the highest modifier. */
  private pickBestCheck(p: PursuitParticipant, options: ComplicationCheckOption[]): ComplicationCheckOption {
    let best = options[0]!;
    let bestMod = this.getAbilityModifier(p, best.abilityKey);
    for (const opt of options) {
      const mod = this.getAbilityModifier(p, opt.abilityKey);
      if (mod > bestMod) { best = opt; bestMod = mod; }
    }
    return best;
  }

  /** Roll d20 at end of turn — d20 ≤ 10 stores a complication for the next participant. */
  private rollComplicationD20(): void {
    if (!this.state) return;
    const p = this.getActive();
    if (!p) return;

    const d20 = Math.floor(Math.random() * 20) + 1;
    this.state.endOfTurnD20 = d20;
    const table = getComplicationTable(this.state.complicationTableId);

    if (d20 <= 10) {
      const entry = table.entries[d20 - 1];
      if (entry) {
        const nextP = this.getNextActiveParticipant();
        const nextName = nextP?.display ?? "the next participant";
        this.state.pendingComplicationForNext = {
          entry,
          d20Roll: d20,
          rolledByName: p.display,
          rolledById: p.id,
        };
        this.state.currentComplication = {
          entry,
          d20Roll: d20,
          rolledByName: p.display,
          resolved: true,
          effectDescription: `Complication for ${nextName}: ${entry.title}`,
        };
        this.addLog(`🎲 ${p.display} rolls d20=${d20}: Complication "${entry.title}" for ${nextName}!`);
      }
    } else {
      this.state.currentComplication = undefined;
      this.addLog(`🎲 ${p.display} rolls d20=${d20}: No complication.`);
    }

    this.state.turnPhase = "complication-roll";
    this.emit();
  }

  /** Get the next active participant in initiative after the current one. */
  private getNextActiveParticipant(): PursuitParticipant | undefined {
    if (!this.state) return undefined;
    const len = this.state.participants.length;
    for (let i = 1; i < len; i++) {
      const idx = (this.state.turnIndex + i) % len;
      const p = this.state.participants[idx];
      if (p && !p.droppedOut && !p.escaped && !p.incapacitated) return p;
    }
    return undefined;
  }

  /** Advance from complication-roll phase to turn-end. */
  advanceFromComplicationRoll(): void {
    if (!this.state) return;
    this.state.turnPhase = "turn-end";
    this.emit();
  }

  /** Submit a complication check result (PC roll from GM). */
  submitComplicationCheck(total: number, selectedCheck?: ComplicationCheckOption): void {
    if (!this.state) return;
    const comp = this.state.currentComplication;
    const p = this.getActive();
    if (!comp || !p || comp.resolved) return;

    if (selectedCheck) comp.selectedCheck = selectedCheck;
    const dc = comp.selectedCheck?.dc ?? 10;
    comp.checkResult = total;
    comp.resolved = true;
    comp.passed = total >= dc;
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
    if (effect.movementReduction && effect.movementReduction > 0) {
      p.movementReductionFeet += effect.movementReduction;
      this.addLog(`${p.display}: ${effect.movementReduction}ft of difficult terrain.`);
    }
    if (effect.condition) {
      const cond = effect.condition.charAt(0).toUpperCase() + effect.condition.slice(1).toLowerCase();
      if (!p.conditions.includes(cond)) {
        p.conditions.push(cond);
        this.addLog(`${p.display} gains condition: ${cond}.`);
      }
    }
    if (effect.damage) {
      const dmg = this.rollDice(effect.damage);
      const dtype = effect.damageType ? ` ${effect.damageType}` : "";
      this.applyDamageInternal(p, dmg, dtype);
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
    } else if (action === "attack") {
      this.addLog(`${p.display} takes the Attack action. (GM: resolve attacks manually.)`);
      this.advanceAfterAction(p);
    } else if (action === "create-obstacle") {
      this.addLog(`${p.display} creates an obstacle. (GM: select obstacle template or adjudicate.)`);
      this.advanceAfterAction(p);
    } else if (action === "grapple") {
      this.handleGrapple(p);
    } else {
      this.addLog(`${p.display} takes the ${action} action.`);
      this.advanceAfterAction(p);
    }
  }

  /** Create a quarry obstacle (sets pending complication for next pursuer). */
  createObstacle(entry: import("./types").ComplicationEntry): void {
    if (!this.state) return;
    const p = this.getActive();
    if (!p) return;
    this.state.pendingComplicationForNext = {
      entry,
      d20Roll: 0,
      rolledByName: p.display,
      rolledById: p.id,
      isQuarryObstacle: true,
    };
    this.addLog(`${p.display} creates obstacle: ${entry.title}.`);
    this.emit();
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
    } else if (pending.type === "escape-stealth") {
      this.submitEscapeCheck(total);
    } else if (pending.type === "grapple-check") {
      this.resolveGrappleCheck(p, total);
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

    // Snap all carried and grappled to carrier position
    for (const id of [...p.carrying, ...p.grappling]) {
      const dep = this.getParticipant(id);
      if (dep) dep.position = p.position;
    }

    this.checkCatchUp();

    if (p.role === "quarry") {
      p.lineOfSightBroken = this.isLoSBroken(p);
      if (p.lineOfSightBroken) p.wasOutOfSightThisRound = true;
    }

    // End-of-turn d20 complication roll (DMG RAW)
    this.rollComplicationD20();
  }

  /** Set a participant's position directly (GM override). */
  setPosition(id: string, position: number): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.position = position;
    for (const id2 of [...p.carrying, ...p.grappling]) {
      const carried = this.getParticipant(id2);
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

    // Carry + grapple penalty (sum all burden weight)
    const burdenWeight = totalBurdenWeight(p, this.state?.participants ?? []);
    if (burdenWeight > 0) {
      const result = computeCarryPenalty(p.strScore, burdenWeight);
      if (result.status === "ok") speed = Math.floor(speed * result.speedMultiplier);
      else if (result.status === "drag") speed = result.speedFeet;
      else speed = 0;
    }

    // Exhaustion penalty (5e RAW: exhaustion 2+ halves speed)
    if (p.exhaustionLevel >= 2) speed = Math.floor(speed / 2);

    // Exhaustion 5: speed 0
    if (p.exhaustionLevel >= 5) speed = 0;

    return speed;
  }

  // ── Carry ──────────────────────────────────────────────────

  /** One participant picks up another (voluntary carry). */
  pickUp(carrierId: string, targetId: string): boolean {
    if (!this.state) return false;
    const carrier = this.getParticipant(carrierId);
    const target = this.getParticipant(targetId);
    if (!carrier || !target) return false;

    // Check total burden weight with new target
    const currentWeight = totalBurdenWeight(carrier, this.state.participants);
    const newWeight = currentWeight + target.estimatedWeight;
    const result = computeCarryPenalty(carrier.strScore, newWeight);
    if (result.status === "impossible") {
      this.addLog(`${carrier.display} cannot carry ${target.display} (too heavy — total ${newWeight} lbs).`);
      this.emit();
      return false;
    }

    carrier.carrying.push(targetId);
    target.carriedBy = carrierId;
    target.position = carrier.position;

    const penalty = result.status === "ok" ? "speed halved" : "speed 5ft (dragging)";
    this.addLog(`${carrier.display} picks up ${target.display} (${penalty}).`);
    this.emit();
    return true;
  }

  /** Drop a specific carried participant. */
  putDown(carrierId: string, targetId?: string): void {
    if (!this.state) return;
    const carrier = this.getParticipant(carrierId);
    if (!carrier || carrier.carrying.length === 0) return;

    if (targetId) {
      const idx = carrier.carrying.indexOf(targetId);
      if (idx >= 0) {
        carrier.carrying.splice(idx, 1);
        const target = this.getParticipant(targetId);
        if (target) {
          target.carriedBy = undefined;
          this.addLog(`${carrier.display} puts down ${target.display}.`);
        }
      }
    } else {
      // Drop all
      for (const id of carrier.carrying) {
        const target = this.getParticipant(id);
        if (target) target.carriedBy = undefined;
      }
      this.addLog(`${carrier.display} puts down everyone.`);
      carrier.carrying = [];
    }
    this.emit();
  }

  // ── Grapple ────────────────────────────────────────────────

  /** Handle a grapple action — pursuer attempts to restrain a quarry within 5ft. */
  private handleGrapple(pursuer: PursuitParticipant): void {
    if (!this.state) return;
    // Find the closest quarry within 5ft
    const target = this.getGrappleTarget(pursuer);
    if (!target) {
      this.addLog(`${pursuer.display} tries to grapple but no target within 5ft!`);
      this.advanceAfterAction(pursuer);
      return;
    }

    if (!pursuer.player) {
      // NPC auto-roll: Athletics vs Athletics or Acrobatics
      const atkMod = this.getAbilityModifier(pursuer, "Athletics");
      const { total: atkTotal, natural: atkNat } = this.autoRoll(atkMod);
      const defMod = Math.max(
        this.getAbilityModifier(target, "Athletics"),
        this.getAbilityModifier(target, "Acrobatics"),
      );
      const { total: defTotal, natural: defNat } = this.autoRoll(defMod);
      if (atkTotal >= defTotal) {
        this.applyGrapple(pursuer, target);
        this.addLog(`${pursuer.display} grapples ${target.display}! (Athletics ${atkTotal}, d20=${atkNat} vs ${defTotal}, d20=${defNat})`);
      } else {
        this.addLog(`${pursuer.display} fails to grapple ${target.display} (Athletics ${atkTotal}, d20=${atkNat} vs ${defTotal}, d20=${defNat}).`);
      }
      this.advanceAfterAction(pursuer);
    } else {
      // PC: prompt for Athletics check
      this.state.pendingInput = {
        type: "grapple-check",
        participantId: pursuer.id,
        label: `Athletics (Grapple vs ${target.display})`,
        modifier: this.getAbilityModifier(pursuer, "Athletics"),
        description: `Grapple check: Athletics vs ${target.display}'s Athletics or Acrobatics.`,
      };
      this.state.turnPhase = "action-resolve";
      // Store grapple target in a way the resolver can find it
      (this.state as any).__grappleTargetId = target.id;
      this.emit();
    }
  }

  /** Find the closest grappable target within 5ft of the active participant. */
  private getGrappleTarget(p: PursuitParticipant): PursuitParticipant | undefined {
    if (!this.state) return undefined;
    const opponents = this.state.participants.filter(
      (q) => q.role !== p.role && !q.droppedOut && !q.escaped && !q.incapacitated
        && !q.grappledBy
        && this.canCatch(p, q)
        && Math.abs(q.position - p.position) <= 5
    );
    if (opponents.length === 0) return undefined;
    // Return the closest
    opponents.sort((a, b) => Math.abs(a.position - p.position) - Math.abs(b.position - p.position));
    return opponents[0];
  }

  /** Apply grapple: target is now grappled by the grappler. */
  private applyGrapple(grappler: PursuitParticipant, target: PursuitParticipant): void {
    grappler.grappling.push(target.id);
    target.grappledBy = grappler.id;
    target.position = grappler.position;
    if (!target.conditions.includes("Grappled")) target.conditions.push("Grappled");
  }

  /** Break a grapple (target breaks free on their turn, or GM override). */
  breakGrapple(targetId: string): void {
    if (!this.state) return;
    const target = this.getParticipant(targetId);
    if (!target || !target.grappledBy) return;
    const grappler = this.getParticipant(target.grappledBy);
    if (grappler) {
      const idx = grappler.grappling.indexOf(targetId);
      if (idx >= 0) grappler.grappling.splice(idx, 1);
    }
    target.grappledBy = undefined;
    const condIdx = target.conditions.indexOf("Grappled");
    if (condIdx >= 0) target.conditions.splice(condIdx, 1);
    this.addLog(`${target.display} breaks free from grapple!`);
    this.emit();
  }

  /** Resolve a PC grapple check (called from submitActionInput). */
  private resolveGrappleCheck(pursuer: PursuitParticipant, total: number): void {
    if (!this.state) return;
    const targetId = (this.state as any).__grappleTargetId;
    delete (this.state as any).__grappleTargetId;
    const target = targetId ? this.getParticipant(targetId) : undefined;
    if (!target) {
      this.advanceAfterAction(pursuer);
      return;
    }
    // NPC target auto-rolls defense
    const defMod = Math.max(
      this.getAbilityModifier(target, "Athletics"),
      this.getAbilityModifier(target, "Acrobatics"),
    );
    const { total: defTotal } = this.autoRoll(defMod);
    if (total >= defTotal) {
      this.applyGrapple(pursuer, target);
      this.addLog(`${pursuer.display} grapples ${target.display}! (Athletics ${total} vs ${defTotal})`);
    } else {
      this.addLog(`${pursuer.display} fails to grapple ${target.display} (Athletics ${total} vs ${defTotal}).`);
    }
    this.advanceAfterAction(pursuer);
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

  // ── HP & Conditions (combat-like, accessible any time) ─────

  /** Apply damage to a participant. TempHP absorbs first. */
  applyDamage(id: string, amount: number): void {
    if (!this.state || amount <= 0) return;
    const p = this.getParticipant(id);
    if (!p) return;
    this.applyDamageInternal(p, amount, "");
    this.emit();
  }

  /** Internal damage application (tempHP absorbs first). */
  private applyDamageInternal(p: PursuitParticipant, dmg: number, damageLabel: string): void {
    let remaining = dmg;
    if (p.tempHP > 0) {
      const absorbed = Math.min(p.tempHP, remaining);
      p.tempHP -= absorbed;
      remaining -= absorbed;
    }
    p.currentHP -= remaining;
    if (p.currentHP <= 0) {
      p.currentHP = 0;
      p.incapacitated = true;
      p.droppedOut = true;
      this.addLog(`${p.display} takes ${dmg}${damageLabel} damage and is incapacitated!`);
      this.checkChaseEnd();
    } else {
      this.addLog(`${p.display} takes ${dmg}${damageLabel} damage (HP: ${p.currentHP}/${p.maxHP}${p.tempHP > 0 ? ` +${p.tempHP} temp` : ""}).`);
    }
  }

  /** Heal a participant. */
  applyHealing(id: string, amount: number): void {
    if (!this.state || amount <= 0) return;
    const p = this.getParticipant(id);
    if (!p) return;
    const before = p.currentHP;
    p.currentHP = Math.min(p.maxHP, p.currentHP + amount);
    const healed = p.currentHP - before;
    if (healed > 0) {
      this.addLog(`${p.display} heals ${healed} HP (now ${p.currentHP}/${p.maxHP}).`);
    }
    this.emit();
  }

  /** Set temporary hit points (does not stack — takes highest). */
  setTempHP(id: string, amount: number): void {
    if (!this.state || amount < 0) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.tempHP = Math.max(p.tempHP, amount);
    this.addLog(`${p.display} gains ${amount} temp HP (total: ${p.tempHP}).`);
    this.emit();
  }

  /** Add a condition to a participant. */
  addCondition(id: string, condition: string): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    if (!p.conditions.includes(condition)) {
      p.conditions.push(condition);
      this.addLog(`${p.display} gains condition: ${condition}.`);
      this.emit();
    }
  }

  /** Remove a condition from a participant. */
  removeCondition(id: string, condition: string): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    const idx = p.conditions.indexOf(condition);
    if (idx >= 0) {
      p.conditions.splice(idx, 1);
      this.addLog(`${p.display} loses condition: ${condition}.`);
      this.emit();
    }
  }

  /** End the chase with a specific outcome. */
  endChase(outcome: PursuitState["outcome"]): void {
    if (!this.state) return;
    this.state.ended = true;
    this.state.outcome = outcome;
    this.addLog(`Chase ended: ${outcome}.`);
    this.emit();
  }

  /** Add a new participant mid-chase (inserted at end of initiative order). */
  addParticipant(p: PursuitParticipant): void {
    if (!this.state) return;
    this.state.participants.push(p);
    this.addLog(`${p.display} joins the chase at position ${p.position}ft as ${p.role}!`);
    this.emit();
  }

  /** Set a participant's movement plane (ground/air/underground). */
  setMovementPlane(id: string, plane: "ground" | "air" | "underground"): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    // Switch active speed to match the plane
    const modeMap: Record<string, string> = { ground: "walk", air: "fly", underground: "burrow" };
    const desiredMode = modeMap[plane] ?? "walk";
    const hasMode = p.speeds.some((s) => s.mode === desiredMode);
    if (!hasMode && plane !== "ground") {
      this.addLog(`${p.display} cannot move to ${plane} — no ${desiredMode} speed!`);
      this.emit();
      return;
    }
    p.movementPlane = plane;
    if (hasMode) p.activeSpeed = desiredMode;
    this.addLog(`${p.display} is now ${plane === "air" ? "flying" : plane === "underground" ? "burrowing" : "on the ground"}.`);
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
    this.state.complicationTableId = env.complicationTableId ?? this.state.complicationTableId;
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

  /** Run end-of-round logic: DMG escape check for quarry that were out of sight. */
  private runEndOfRound(): void {
    if (!this.state) return;

    // Check max rounds
    if (this.state.maxRounds > 0 && this.state.round >= this.state.maxRounds) {
      this.addLog(`⏱️ Maximum rounds (${this.state.maxRounds}) reached — chase ends!`);
      this.endChase("gm-ended");
      return;
    }

    // Hidden quarry that weren't found still escape (backwards compat)
    const hidden = this.state.participants.filter(
      (p) => p.role === "quarry" && p.isHidden && !p.droppedOut && !p.escaped && !p.incapacitated
    );
    for (const quarry of hidden) {
      quarry.escaped = true;
      this.escapeCarried(quarry);
      this.addLog(`🏃 ${quarry.display} escapes! Hidden quarry was not found by end of round ${this.state.round}.`);
    }
    if (hidden.length > 0) this.checkChaseEnd();
    if (this.state.ended) return;

    // DMG end-of-round escape check: quarry that were ever out of sight
    // (but are NOT already hidden/escaped) make a Stealth check
    const escapeEligible = this.state.participants.filter(
      (p) =>
        p.role === "quarry" &&
        p.wasOutOfSightThisRound &&
        !p.isHidden &&
        !p.escaped &&
        !p.droppedOut &&
        !p.incapacitated
    );

    if (escapeEligible.length > 0) {
      this.state.escapeCheckQueue = escapeEligible.map((p) => p.id);
      this.processNextEscapeCheck();
      return; // nextTurn will resume after escape checks complete
    }

    this.finishEndOfRound();
  }

  /** Finish end-of-round cleanup (after escape checks are done). */
  private finishEndOfRound(): void {
    if (!this.state) return;
    // Reset per-round flags
    for (const q of this.state.participants.filter((p) => p.role === "quarry")) {
      q.lineOfSightBroken = false;
      q.complicationLoSBreak = false;
      q.wasOutOfSightThisRound = false;
    }
    this.state.escapeCheckQueue = undefined;
  }

  /** Process the next quarry in the escape check queue. */
  private processNextEscapeCheck(): void {
    if (!this.state) return;
    const queue = this.state.escapeCheckQueue;
    if (!queue || queue.length === 0) {
      this.finishEndOfRound();
      this.checkChaseEnd();
      return;
    }

    const quarryId = queue[0]!;
    const quarry = this.getParticipant(quarryId);
    if (!quarry || quarry.escaped || quarry.droppedOut || quarry.incapacitated) {
      queue.shift();
      this.processNextEscapeCheck();
      return;
    }

    this.state.turnPhase = "escape-check";

    if (!quarry.player) {
      // NPC: auto-roll Stealth with advantage/disadvantage from environment
      const { natural, total } = this.autoRollWithAdvantage(
        quarry.stealthModifier,
        this.state.stealthCondition
      );
      this.resolveEscapeCheck(quarry, total, natural);
    } else {
      // PC: prompt GM for Stealth roll
      this.state.pendingInput = {
        type: "escape-stealth",
        participantId: quarry.id,
        label: `Stealth (${this.state.stealthCondition})`,
        modifier: quarry.stealthModifier,
        description: `End-of-round escape check: ${quarry.display} was out of sight — Stealth vs pursuers' passive Perception.`,
      };
      this.emit();
    }
  }

  /** Submit a PC's escape Stealth check result. */
  submitEscapeCheck(total: number): void {
    if (!this.state) return;
    const queue = this.state.escapeCheckQueue;
    if (!queue || queue.length === 0) return;

    const quarryId = queue[0]!;
    const quarry = this.getParticipant(quarryId);
    if (!quarry) return;

    this.state.pendingInput = undefined;
    this.resolveEscapeCheck(quarry, total, undefined);
  }

  /** Resolve an escape check: compare Stealth to highest pursuer perception. */
  private resolveEscapeCheck(quarry: PursuitParticipant, total: number, natural: number | undefined): void {
    if (!this.state) return;
    const queue = this.state.escapeCheckQueue;

    // Highest pursuer passive Perception (or active if Search was used)
    const pursuers = this.state.participants.filter(
      (p) => p.role === "pursuer" && !p.droppedOut && !p.incapacitated
    );
    let highestPerception = 0;
    for (const pur of pursuers) {
      const perception = pur.activePerceptionRoll ?? pur.passivePerception;
      if (perception > highestPerception) highestPerception = perception;
    }

    const rollStr = natural != null ? ` (d20=${natural})` : "";
    if (total > highestPerception) {
      quarry.escaped = true;
      this.escapeCarried(quarry);
      this.addLog(`🏃 ${quarry.display} escape check: Stealth ${total}${rollStr} > ${highestPerception} — ESCAPED!`);
    } else {
      this.addLog(`${quarry.display} escape check: Stealth ${total}${rollStr} ≤ ${highestPerception} — still being pursued.`);
    }

    queue?.shift();
    if (queue && queue.length > 0) {
      this.processNextEscapeCheck();
    } else {
      this.finishEndOfRound();
      this.checkChaseEnd();
      if (!this.state.ended) {
        // Advance to the next round
        this.state.round++;
        for (const pp of this.state.participants) {
          pp.hasActed = false;
          this.resetTurnFlags(pp);
        }
        this.addLog(`Round ${this.state.round} begins.`);
        this.state.turnIndex = 0;
        this.skipInactiveForward();
        this.beginTurn();
      } else {
        this.emit();
      }
    }
  }

  /** Auto-roll with advantage or disadvantage. */
  private autoRollWithAdvantage(modifier: number, condition: StealthCondition): { natural: number; total: number } {
    const r1 = Math.floor(Math.random() * 20) + 1;
    const r2 = Math.floor(Math.random() * 20) + 1;
    let natural: number;
    if (condition === "advantage") {
      natural = Math.max(r1, r2);
    } else if (condition === "disadvantage") {
      natural = Math.min(r1, r2);
    } else {
      natural = r1;
    }
    return { natural, total: natural + modifier };
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
        if (dist <= catchDist && dist >= 0 && this.canCatch(pur, q)) {
          this.addLog(`⚔️ ${pur.display} catches up to ${q.display}! (${dist}ft apart)`);
        }
      }
    }

    // Check max distance escape
    if (this.state.maxDistance > 0) {
      for (const q of quarries) {
        if (q.position >= this.state.maxDistance) {
          q.escaped = true;
          this.addLog(`🏃 ${q.display} reaches ${q.position}ft — auto-escaped! (max distance: ${this.state.maxDistance}ft)`);
          this.escapeCarried(q);
        }
      }
      this.checkChaseEnd();
    }
  }

  /** Escape all carried/grappled participants along with the escapee. */
  private escapeCarried(p: PursuitParticipant): void {
    for (const id of [...p.carrying, ...p.grappling]) {
      const dep = this.getParticipant(id);
      if (dep) dep.escaped = true;
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
