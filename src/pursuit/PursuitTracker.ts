/**
 * PursuitTracker — State engine for the D&D 5e chase / pursuit system.
 *
 * Follows the same onChange() listener pattern as CombatTracker.
 * All state mutations go through this class; views subscribe via onChange().
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
    this.addLog(`Chase begins! Round 1.`);
    this.emit();
  }

  // ── Turn Management ────────────────────────────────────────

  /** Advance to the next participant's turn. */
  nextTurn(): void {
    if (!this.state || !this.state.started || this.state.ended) return;

    const active = this.state.participants;

    // Mark current participant as having acted
    const current = active[this.state.turnIndex];
    if (current) current.hasActed = true;

    // Find next non-incapacitated, non-dropped participant
    let next = this.state.turnIndex + 1;
    let wrapped = false;

    while (true) {
      if (next >= active.length) {
        // End of round — trigger stealth phase
        this.runEndOfRound();
        next = 0;
        wrapped = true;
        this.state.round++;
        this.addLog(`Round ${this.state.round} begins.`);
        // Reset per-turn state
        for (const p of active) {
          p.hasActed = false;
          p.turnAction = undefined;
          p.bonusAction = undefined;
          p.activePerceptionRoll = undefined;
          p.stealthRoll = undefined;
        }
      }

      const candidate = active[next];
      if (!candidate) break;

      // Skip participants who dropped out or escaped
      if (candidate.droppedOut || candidate.escaped || candidate.incapacitated) {
        next++;
        // Safety: prevent infinite loop if everyone is out
        if (wrapped && next >= active.length) break;
        continue;
      }
      break;
    }

    this.state.turnIndex = Math.min(next, active.length - 1);
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
    this.emit();
  }

  // ── Movement ───────────────────────────────────────────────

  /**
   * Move a participant by the given number of feet.
   * Positive = forward (away from pursuers for quarry, towards quarry for pursuers).
   */
  move(id: string, feet: number): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;

    // Apply carry penalty
    let maxFeet = this.getEffectiveSpeed(p);
    if (p.turnAction === "dash") maxFeet *= 2;

    const clamped = Math.min(Math.abs(feet), maxFeet);
    p.position += feet >= 0 ? clamped : -clamped;
    this.emit();
  }

  /** Set a participant's position directly. */
  setPosition(id: string, position: number): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.position = position;
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
   * Record a Dash action. If dashes exceed free dashes, returns true
   * to indicate a DC 10 CON save is required.
   */
  dash(id: string): boolean {
    if (!this.state) return false;
    const p = this.getParticipant(id);
    if (!p) return false;

    p.dashesUsed++;
    p.turnAction = "dash";

    const needsSave = p.dashesUsed > p.freeDashes;
    if (needsSave) {
      this.addLog(`${p.display} dashes (${p.dashesUsed}/${p.freeDashes} free). DC 10 CON save required!`);
    } else {
      this.addLog(`${p.display} dashes (${p.dashesUsed}/${p.freeDashes} free).`);
    }

    this.emit();
    return needsSave;
  }

  /**
   * Resolve a DC 10 CON save for an extra dash.
   * @param roll The raw d20 + CON modifier result.
   * @returns Whether the save succeeded.
   */
  resolveDashSave(id: string, roll: number): boolean {
    if (!this.state) return false;
    const p = this.getParticipant(id);
    if (!p) return false;

    const success = roll >= 10;
    if (!success) {
      p.exhaustionLevel++;
      this.addLog(`${p.display} fails CON save (rolled ${roll}). Exhaustion → ${p.exhaustionLevel}.`);
      if (p.exhaustionLevel >= 5) {
        p.droppedOut = true;
        this.addLog(`${p.display} collapses from exhaustion! Dropped out of the chase.`);
      }
    } else {
      this.addLog(`${p.display} succeeds CON save (rolled ${roll}).`);
    }

    this.emit();
    return success;
  }

  // ── Actions ────────────────────────────────────────────────

  /** Set the action a participant takes this turn. */
  setTurnAction(id: string, action: TurnAction): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.turnAction = action;
    this.emit();
  }

  /** Set the bonus action (for Cunning Action users). */
  setBonusAction(id: string, action: TurnAction): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p) return;
    p.bonusAction = action;
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
      this.addLog(`${quarry.display} detected. (Stealth ${roll} vs ${highestPursuerName}'s Perception ${highestPerception})`);
      this.emit();
      return "detected";
    }
  }

  /** Set an active Perception roll for a pursuer (Search action). */
  setActivePerception(id: string, roll: number): void {
    if (!this.state) return;
    const p = this.getParticipant(id);
    if (!p || p.role !== "pursuer") return;
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

  /** Run end-of-round logic: reset LoS flags, log summary. */
  private runEndOfRound(): void {
    if (!this.state) return;

    // Auto-detect check eligibility for quarry
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

    // Reset LoS broken for next round
    for (const q of quarries) {
      q.lineOfSightBroken = false;
    }
  }

  /** Check if the chase should end (all quarry escaped or all pursuers dropped out). */
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
