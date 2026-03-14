/**
 * PursuitTrackerView — GM sidebar view for managing an active chase.
 *
 * Fully guided phase-based UI:
 *   COMPLICATION → ACTION → BONUS → MOVEMENT → TURN_END
 * Shows only the current phase. NPCs auto-resolve; PCs prompt for rolls.
 */

import { App, ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PURSUIT_TRACKER_VIEW_TYPE } from "../constants";
import type { PursuitTracker } from "./PursuitTracker";
import type {
  PursuitState,
  PursuitParticipant,
  TurnAction,
  TurnPhase,
  PendingInput,
  ActiveComplication,
  ComplicationCheckOption,
} from "./types";
import { computeCarryPenalty, STANDARD_CONDITIONS, SIZE_WEIGHT_ESTIMATE, parseSpeed } from "./types";
import type { PursuitRole, SpeedEntry } from "./types";
import { getComplicationTable, COMPLICATION_TABLES } from "./complications";
import type { ChaseComplicationTable } from "./complications";
import { enumerateScreens, screenKey } from "../utils/ScreenEnumeration";

export class PursuitTrackerView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return PURSUIT_TRACKER_VIEW_TYPE; }
  getDisplayText(): string { return "Pursuit Tracker"; }
  getIcon(): string { return "footprints"; }

  async onOpen() {
    this.unsubscribe = this.plugin.pursuitTracker.onChange(() => this.render());
    this.render();
  }

  onClose() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return Promise.resolve();
  }

  // ── Main Render ────────────────────────────────────────────

  private render() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();
    container.addClass("dnd-pursuit-tracker");

    const tracker = this.plugin.pursuitTracker;
    const state = tracker.getState();

    if (!state) {
      this.renderNoChase(container);
      return;
    }

    this.renderToolbar(container, tracker, state);
    this.renderHeader(container, state);

    if (!state.started) {
      this.renderPreChase(container, tracker, state);
    } else if (state.ended) {
      this.renderEnded(container, state);
    } else {
      this.renderCatchUpAlerts(container, tracker, state);
      this.renderActiveTurns(container, tracker, state);
      this.renderEnvironmentSummary(container, state);
      this.renderLog(container, state);
    }
  }

  // ── No Chase ───────────────────────────────────────────────

  private renderNoChase(container: HTMLElement) {
    const div = container.createDiv({ cls: "dnd-pursuit-empty" });
    div.createEl("h3", { text: "🏃 Pursuit Tracker" });
    div.createEl("p", { text: "No active chase. Start one from the Combat Tracker or the command palette." });

    const btn = div.createEl("button", { text: "🏃 Start New Chase", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    btn.addEventListener("click", () => {
      this.plugin.startPursuitSetup();
    });
  }

  // ── Toolbar ────────────────────────────────────────────────

  private renderToolbar(container: HTMLElement, tracker: PursuitTracker, state: PursuitState) {
    const toolbar = container.createDiv({ cls: "dnd-pursuit-toolbar" });

    if (!state.started) {
      const rollBtn = toolbar.createEl("button", {
        text: "🎲 Roll Initiative",
        cls: "dnd-pursuit-btn dnd-pursuit-btn-primary",
      });
      rollBtn.addEventListener("click", () => {
        tracker.rollAllInitiative();
        tracker.startChase();
      });
    } else if (!state.ended) {
      // Turn navigation
      const prevBtn = toolbar.createEl("button", { text: "◀", cls: "dnd-pursuit-toolbar-btn", attr: { title: "Previous Turn" } });
      prevBtn.addEventListener("click", () => tracker.prevTurn());

      const roundLabel = toolbar.createEl("span", { cls: "dnd-pursuit-toolbar-round" });
      roundLabel.textContent = `Round ${state.round}`;

      const nextBtn = toolbar.createEl("button", {
        text: "▶ Next Turn",
        cls: "dnd-pursuit-toolbar-btn dnd-pursuit-toolbar-btn-primary",
        attr: { title: "Next Turn" },
      });
      // Only enabled during turn-end phase
      const active = state.participants[state.turnIndex];
      if (state.turnPhase !== "turn-end") {
        nextBtn.disabled = true;
        nextBtn.addClass("dnd-pursuit-btn-disabled");
        nextBtn.title = "Complete the current turn first";
      }
      nextBtn.addEventListener("click", () => tracker.nextTurn());
    }

    // Spacer
    toolbar.createDiv({ cls: "dnd-pursuit-toolbar-spacer" });

    // Player view projection
    const pm = this.plugin.projectionManager;
    const hasPursuitProjection = pm
      ? pm.getLiveProjections().some((p) => p.contentType === "pursuit")
      : false;

    const pvBtn = toolbar.createEl("button", {
      text: hasPursuitProjection ? "⏹" : "📺",
      cls: `dnd-pursuit-toolbar-btn ${hasPursuitProjection ? "dnd-pursuit-toolbar-btn-stop" : ""}`,
      attr: { title: hasPursuitProjection ? "Stop Player View" : "Project Player View" },
    });
    pvBtn.addEventListener("click", (e) => {
      if (hasPursuitProjection && pm) {
        for (const proj of pm.getLiveProjections()) {
          if (proj.contentType === "pursuit") {
            pm.stopProjectionOnScreen(screenKey(proj.screen));
          }
        }
        this.render();
      } else {
        this.openPlayerView(e);
      }
    });

    // End chase button
    if (state.started && !state.ended) {
      // Add participant button
      const addBtn = toolbar.createEl("button", {
        text: "➕",
        cls: "dnd-pursuit-toolbar-btn",
        attr: { title: "Add Participant" },
      });
      addBtn.addEventListener("click", () => this.showAddParticipantMenu());

      const endBtn = toolbar.createEl("button", {
        text: "🏁",
        cls: "dnd-pursuit-toolbar-btn dnd-pursuit-toolbar-btn-stop",
        attr: { title: "End Chase" },
      });
      endBtn.addEventListener("click", () => {
        tracker.endChase("surrendered");
      });
    }
  }

  // ── Header ─────────────────────────────────────────────────

  private renderHeader(container: HTMLElement, state: PursuitState) {
    const header = container.createDiv({ cls: "dnd-pursuit-header" });
    header.createEl("h3", { text: `🏃 ${state.name}` });

    // Stealth condition badge
    const condBadge = header.createEl("span", { cls: `dnd-pursuit-condition dnd-pursuit-condition-${state.stealthCondition}` });
    const condText = state.stealthCondition === "advantage"
      ? "Stealth: Advantage"
      : state.stealthCondition === "disadvantage"
        ? "Stealth: Disadvantage"
        : "Stealth: Normal";
    condBadge.textContent = condText;

    // Max distance / rounds progress
    const infoItems: string[] = [];
    if (state.maxDistance > 0) infoItems.push(`Max dist: ${state.maxDistance}ft`);
    if (state.maxRounds > 0) infoItems.push(`Max rounds: ${state.round}/${state.maxRounds}`);
    if (infoItems.length > 0) {
      header.createEl("span", { text: infoItems.join(" · "), cls: "dnd-pursuit-limits-badge" });
    }
  }

  // ── Catch-Up Alerts ────────────────────────────────────────

  private renderCatchUpAlerts(container: HTMLElement, tracker: PursuitTracker, state: PursuitState) {
    if (!state.catchUpAlerts || state.catchUpAlerts.length === 0) return;

    for (const alert of state.catchUpAlerts) {
      const pursuer = state.participants.find((p) => p.id === alert.pursuerId);
      const quarry = state.participants.find((p) => p.id === alert.quarryId);
      if (!pursuer || !quarry) continue;

      const alertDiv = container.createDiv({ cls: "dnd-pursuit-catch-alert" });
      alertDiv.createEl("h4", {
        text: `⚔️ ${pursuer.display} caught ${quarry.display}!`,
      });
      alertDiv.createEl("p", {
        text: "The pursuer is within striking distance. Initiate combat or continue the chase?",
        cls: "setting-item-description",
      });

      const btnRow = alertDiv.createDiv({ cls: "dnd-pursuit-catch-alert-btns" });
      const combatBtn = btnRow.createEl("button", {
        text: "⚔️ Initiate Combat",
        cls: "dnd-pursuit-btn dnd-pursuit-btn-primary",
      });
      combatBtn.addEventListener("click", () => {
        tracker.endChase("returned-to-combat");
      });

      const continueBtn = btnRow.createEl("button", {
        text: "🏃 Continue Chase",
        cls: "dnd-pursuit-btn",
      });
      continueBtn.addEventListener("click", () => {
        tracker.dismissCatchUpAlert(alert.pursuerId, alert.quarryId);
      });
    }
  }

  // ── Pre-chase (initiative setup) ───────────────────────────

  private renderPreChase(container: HTMLElement, tracker: PursuitTracker, state: PursuitState) {
    container.createEl("p", { text: "Set initiative for each participant, or roll for all.", cls: "setting-item-description" });

    const list = container.createDiv({ cls: "dnd-pursuit-init-list" });
    for (const p of state.participants) {
      const row = list.createDiv({ cls: "dnd-pursuit-init-row" });
      const roleIcon = p.role === "quarry" ? "🏃" : "🔍";
      row.createEl("span", { text: `${roleIcon} ${p.display}`, cls: "dnd-pursuit-init-name" });

      const input = row.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-init-input",
        attr: { value: String(p.initiative), min: "1", max: "30" },
      });
      input.addEventListener("change", () => {
        tracker.setInitiative(p.id, parseInt(input.value, 10) || 0);
      });
    }
  }

  // ── Active Turns ───────────────────────────────────────────

  private renderActiveTurns(container: HTMLElement, tracker: PursuitTracker, state: PursuitState) {
    const list = container.createDiv({ cls: "dnd-pursuit-turn-list" });

    for (let i = 0; i < state.participants.length; i++) {
      const p = state.participants[i];
      if (!p) continue;
      const isActive = state.started && i === state.turnIndex;
      this.renderParticipantRow(list, tracker, p, isActive, state);
    }
  }

  private renderParticipantRow(
    container: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    isActive: boolean,
    state: PursuitState,
  ) {
    const row = container.createDiv({
      cls: `dnd-pursuit-row ${isActive ? "dnd-pursuit-row-active" : ""} ${p.escaped ? "dnd-pursuit-row-escaped" : ""} ${p.droppedOut ? "dnd-pursuit-row-dropped" : ""} ${p.incapacitated ? "dnd-pursuit-row-incap" : ""}`,
    });

    // ── Header line: role icon, name, initiative, position ──
    const headerLine = row.createDiv({ cls: "dnd-pursuit-row-header" });

    const roleIcon = p.role === "quarry" ? "🏃" : "🔍";
    headerLine.createEl("span", { text: `${roleIcon} ${p.display}`, cls: "dnd-pursuit-row-name" });

    if (isActive) {
      headerLine.createEl("span", { text: "▶ TURN", cls: "dnd-pursuit-turn-badge" });
    }
    if (p.escaped) {
      headerLine.createEl("span", { text: "ESCAPED", cls: "dnd-pursuit-escaped-badge" });
    }
    if (p.droppedOut) {
      headerLine.createEl("span", { text: "OUT", cls: "dnd-pursuit-out-badge" });
    }

    headerLine.createEl("span", { text: `Init ${p.initiative}`, cls: "dnd-pursuit-row-init" });
    headerLine.createEl("span", { text: `${p.position}ft`, cls: "dnd-pursuit-row-pos" });

    // Movement plane badge
    if (p.movementPlane !== "ground") {
      const planeIcon = p.movementPlane === "air" ? "🦅" : "⛏️";
      headerLine.createEl("span", { text: `${planeIcon} ${p.movementPlane}`, cls: "dnd-pursuit-plane-badge" });
    }

    // Active target for pursuers
    if (p.role === "pursuer" && p.activeTargetId) {
      const target = state.participants.find((q) => q.id === p.activeTargetId);
      if (target) {
        headerLine.createEl("span", { text: `🎯 ${target.display}`, cls: "dnd-pursuit-target-badge" });
      }
    }

    // Grappled indicator
    if (p.grappledBy) {
      const grappler = state.participants.find((q) => q.id === p.grappledBy);
      headerLine.createEl("span", { text: `🤼 by ${grappler?.display ?? "?"}`, cls: "dnd-pursuit-grappled-badge" });
    }

    // Skip detailed controls for escaped/dropped
    if (p.escaped || p.droppedOut) return;

    // ── Stats line: speed, HP, exhaustion ──
    const statsLine = row.createDiv({ cls: "dnd-pursuit-row-stats" });

    // Speed selector (if multiple speeds)
    if (p.speeds.length > 1) {
      const speedSelect = statsLine.createEl("select", { cls: "dnd-pursuit-speed-select" });
      for (const s of p.speeds) {
        const opt = speedSelect.createEl("option", {
          text: `${s.mode} ${s.feet}ft`,
          attr: { value: s.mode },
        });
        if (s.mode === p.activeSpeed) opt.selected = true;
      }
      speedSelect.addEventListener("change", () => tracker.setActiveSpeed(p.id, speedSelect.value));
    } else {
      const entry = p.speeds[0];
      statsLine.createEl("span", { text: `${entry?.feet ?? 30}ft`, cls: "dnd-pursuit-speed-label" });
    }

    // Effective speed (with carry/grapple penalty)
    const effectiveSpeed = tracker.getEffectiveSpeed(p);
    if (p.carrying.length > 0 || p.grappling.length > 0) {
      const reason = p.grappling.length > 0 ? "grappling" : "carrying";
      statsLine.createEl("span", { text: `→ ${effectiveSpeed}ft (${reason})`, cls: "dnd-pursuit-effective-speed dnd-pursuit-carry-warning" });
    }

    // HP
    const hpText = p.tempHP > 0 ? `HP ${p.currentHP}/${p.maxHP} +${p.tempHP}` : `HP ${p.currentHP}/${p.maxHP}`;
    statsLine.createEl("span", { text: hpText, cls: "dnd-pursuit-row-hp" });

    // Dash counter
    statsLine.createEl("span", {
      text: `Dash ${p.dashesUsed}/${p.freeDashes}`,
      cls: `dnd-pursuit-dash-counter ${p.dashesUsed > p.freeDashes ? "dnd-pursuit-dash-over" : ""}`,
    });

    // Exhaustion pips
    const exDiv = statsLine.createDiv({ cls: "dnd-pursuit-exhaustion" });
    for (let e = 0; e < 5; e++) {
      exDiv.createEl("span", {
        text: e < p.exhaustionLevel ? "●" : "○",
        cls: `dnd-pursuit-exhaustion-pip ${e < p.exhaustionLevel ? "dnd-pursuit-exhaustion-filled" : ""}`,
      });
    }

    // ── Condition badges (always visible) ──
    this.renderConditionBadges(row, tracker, p);

    // ── HP controls (always visible for GM) ──
    this.renderHPControls(row, tracker, p);

    // ══════════════════════════════════════════════════════════
    // ACTIVE TURN — GUIDED PHASE UI (shows only current phase)
    // ══════════════════════════════════════════════════════════
    if (isActive && !p.incapacitated) {
      // Target selection for pursuers
      if (p.role === "pursuer") {
        this.renderTargetSelection(row, tracker, p, state);
      }

      this.renderActivePhase(row, tracker, p, state);

      // ── Carry controls ──
      this.renderCarryControls(row, p, tracker, state);

      // ── Break grapple button for grappled participants ──
      if (p.grappledBy) {
        const grappleLine = row.createDiv({ cls: "dnd-pursuit-carry-line" });
        const grappler = state.participants.find((q) => q.id === p.grappledBy);
        grappleLine.createEl("span", { text: `🤼 Grappled by ${grappler?.display ?? "?"}` });
        const breakBtn = grappleLine.createEl("button", { text: "Break Free", cls: "dnd-pursuit-btn dnd-pursuit-btn-danger" });
        breakBtn.addEventListener("click", () => tracker.breakGrapple(p.id));
      }

      // ── Drop out ──
      const dropLine = row.createDiv({ cls: "dnd-pursuit-drop-line" });
      const dropBtn = dropLine.createEl("button", { text: "🏳️ Drop Out", cls: "dnd-pursuit-btn dnd-pursuit-btn-danger" });
      dropBtn.addEventListener("click", () => tracker.dropOut(p.id));
    }
  }

  // ── Active Phase Dispatcher ────────────────────────────────

  private renderActivePhase(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    state: PursuitState,
  ) {
    const phase = state.turnPhase;
    const comp = state.currentComplication;
    const pending = state.pendingInput;

    switch (phase) {
      case "complication":
        this.renderComplicationResult(row, tracker, p, comp);
        break;
      case "complication-check":
        this.renderRollPrompt(row, tracker, pending, "Submit");
        break;
      case "action":
        this.renderActionSelection(row, tracker, p, state);
        break;
      case "action-resolve":
        this.renderRollPrompt(row, tracker, pending, "Submit");
        break;
      case "bonus":
        this.renderBonusSelection(row, tracker, p);
        break;
      case "bonus-resolve":
        this.renderRollPrompt(row, tracker, pending, "Submit");
        break;
      case "movement":
        this.renderMovementPhase(row, tracker, p, state);
        break;
      case "complication-roll":
        this.renderComplicationRoll(row, tracker, state);
        break;
      case "escape-check":
        this.renderEscapeCheck(row, tracker, state);
        break;
      case "turn-end":
        this.renderTurnEnd(row, tracker, p, state);
        break;
    }
  }

  // ── Complication Phase ─────────────────────────────────────

  private renderComplicationResult(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    comp?: ActiveComplication,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase dnd-pursuit-complication" });
    if (!comp) {
      div.createEl("span", { text: "No complication this turn." });
      this.addContinueButton(div, () => tracker.advanceToAction());
      return;
    }

    const header = div.createDiv({ cls: "dnd-pursuit-complication-header" });
    header.createEl("span", { text: `⚠️ d20 = ${comp.d20Roll}: `, cls: "dnd-pursuit-phase-label" });
    header.createEl("span", { text: comp.entry.title, cls: "dnd-pursuit-complication-title" });
    if (comp.rolledByName) {
      header.createEl("span", { text: ` (from ${comp.rolledByName})`, cls: "dnd-pursuit-phase-detail" });
    }

    div.createEl("p", { text: comp.entry.description, cls: "dnd-pursuit-complication-desc" });

    if (comp.resolved) {
      if (comp.entry.type === "check" && comp.selectedCheck) {
        const resultDiv = div.createDiv({ cls: "dnd-pursuit-complication-result" });
        const passText = comp.passed ? "✅ Passed" : "❌ Failed";
        resultDiv.createEl("span", { text: `${comp.selectedCheck.label}: ${comp.checkResult}` });
        if (comp.checkNatural != null) {
          resultDiv.createEl("span", { text: ` (d20=${comp.checkNatural})`, cls: "dnd-pursuit-phase-detail" });
        }
        resultDiv.createEl("span", { text: ` — ${passText}`, cls: comp.passed ? "dnd-pursuit-success" : "dnd-pursuit-fail" });
      }
      if (comp.effectDescription) {
        div.createEl("p", { text: comp.effectDescription, cls: comp.passed ? "dnd-pursuit-success" : "dnd-pursuit-warning" });
      }

      // Encounter complication: offer quick creature add
      if (comp.entry.isEncounter) {
        const encounterBtn = div.createEl("button", {
          text: "🐲 Add Creature",
          cls: "dnd-pursuit-btn dnd-pursuit-btn-encounter",
        });
        encounterBtn.addEventListener("click", () => {
          this.showEncounterCreatureSearch(p.position, p.display);
        });
      }

      this.addContinueButton(div, () => tracker.advanceToAction());
    }
  }

  // ── Roll Prompt (generic — complication check, stealth, CON save, perception) ──

  private renderRollPrompt(
    row: HTMLElement,
    tracker: PursuitTracker,
    pending?: PendingInput,
    submitText = "Submit",
  ) {
    if (!pending) return;
    const div = row.createDiv({ cls: "dnd-pursuit-phase dnd-pursuit-roll-prompt" });

    div.createEl("p", { text: pending.description, cls: "dnd-pursuit-roll-desc" });
    div.createEl("span", {
      text: `Modifier: ${pending.modifier >= 0 ? "+" : ""}${pending.modifier}`,
      cls: "dnd-pursuit-phase-detail",
    });
    if (pending.dc) {
      div.createEl("span", { text: ` · DC ${pending.dc}`, cls: "dnd-pursuit-phase-detail" });
    }

    // Check option selector (when complication offers multiple checks)
    let selectedOption: ComplicationCheckOption | undefined;
    if (pending.checkOptions && pending.checkOptions.length > 1) {
      const optRow = div.createDiv({ cls: "dnd-pursuit-check-options" });
      optRow.createEl("span", { text: "Choose check: ", cls: "dnd-pursuit-phase-detail" });
      const optSel = optRow.createEl("select", { cls: "dnd-pursuit-speed-select" });
      for (const opt of pending.checkOptions) {
        optSel.createEl("option", { text: opt.label, attr: { value: opt.abilityKey } });
      }
      selectedOption = pending.checkOptions[0];
      optSel.addEventListener("change", () => {
        selectedOption = pending.checkOptions!.find((o) => o.abilityKey === optSel.value);
      });
    }

    const inputRow = div.createDiv({ cls: "dnd-pursuit-save-row" });
    const input = inputRow.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-save-input",
      attr: { placeholder: "Roll total (d20 + mod)" },
    });
    const btn = inputRow.createEl("button", { text: submitText, cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    btn.addEventListener("click", () => {
      const val = parseInt(input.value, 10);
      if (isNaN(val)) { new Notice("Enter a roll result."); return; }

      if (pending.type === "complication-check") {
        tracker.submitComplicationCheck(val, selectedOption);
      } else if (pending.type === "grapple-check") {
        tracker.submitActionInput(val);
      } else {
        tracker.submitActionInput(val);
      }
    });
    input.focus();
  }

  // ── Action Selection ───────────────────────────────────────

  private renderActionSelection(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    state: PursuitState,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase" });
    div.createEl("span", { text: "Choose Action:", cls: "dnd-pursuit-phase-label" });

    const btnGroup = div.createDiv({ cls: "dnd-pursuit-btn-group" });
    const actions: Array<{ label: string; action: TurnAction; tip: string; highlight?: boolean }> = [
      { label: "🏃 Dash", action: "dash", tip: `Double movement (${p.dashesUsed}/${p.freeDashes} free dashes used)` },
    ];

    // Hide: only available for quarry with LoS broken
    if (p.role === "quarry") {
      const losOk = tracker.isLoSBroken(p);
      actions.push({
        label: losOk ? "🫥 Hide ✨" : "🫥 Hide",
        action: "hide",
        tip: losOk ? "LoS is broken — stealth check available!" : "LoS not broken — cannot hide",
        highlight: losOk,
      });
    }

    // Search: only for pursuers when there are hidden quarry
    if (p.role === "pursuer") {
      const hasHidden = state.participants.some((q) => q.role === "quarry" && q.isHidden && !q.escaped);
      actions.push({
        label: hasHidden ? "🔎 Search !" : "🔎 Search",
        action: "search",
        tip: hasHidden ? "Hidden quarry detected — Perception check!" : "No hidden quarry",
        highlight: hasHidden,
      });
    }

    actions.push(
      { label: "⚔️ Attack", action: "attack", tip: "Attack, cast a spell, multiattack" },
      { label: "🛡️ Dsng", action: "disengage", tip: "No opportunity attacks" },
      { label: "🔄 Dodge", action: "dodge", tip: "Attacks have disadvantage" },
      { label: "✨ Other", action: "other", tip: "Spell, Help, item, etc." },
    );

    // Create Obstacle: only for quarry
    if (p.role === "quarry") {
      actions.push({
        label: "🪵 Obstacle",
        action: "create-obstacle",
        tip: "Create obstacle for next pursuer",
      });
    }

    // Grapple: only for participants within 5ft of an opponent
    {
      const opponents = state.participants.filter((q) =>
        q.role !== p.role && !q.escaped && !q.droppedOut && !q.incapacitated && !q.grappledBy
        && Math.abs(q.position - p.position) <= 5
      );
      if (opponents.length > 0) {
        actions.push({
          label: "🤼 Grapple",
          action: "grapple",
          tip: `Grapple nearby target (${opponents.map((o) => o.display).join(", ")})`,
          highlight: true,
        });
      }
    }

    // Escape Grapple: only for grappled participants
    if (p.grappledBy) {
      const grappler = state.participants.find((q) => q.id === p.grappledBy);
      actions.push({
        label: "💪 Break Free",
        action: "escape-grapple",
        tip: `Contested Athletics/Acrobatics vs ${grappler?.display ?? "grappler"}'s Athletics`,
        highlight: true,
      });
    }

    for (const a of actions) {
      const btn = btnGroup.createEl("button", {
        text: a.label,
        cls: `dnd-pursuit-action-btn ${a.highlight ? "dnd-pursuit-action-highlight" : ""}`,
        attr: { title: a.tip },
      });
      btn.addEventListener("click", () => tracker.selectAction(a.action));
    }

    // LoS info for quarry
    if (p.role === "quarry") {
      const losInfo = div.createDiv({ cls: "dnd-pursuit-los-info" });
      if (p.lineOfSightBroken) {
        losInfo.createEl("span", { text: "✅ Line of Sight broken", cls: "dnd-pursuit-success" });
      } else {
        losInfo.createEl("span", { text: "👁️ Pursuers have line of sight", cls: "dnd-pursuit-phase-detail" });
      }
    }

    // Hidden status for quarry
    if (p.isHidden) {
      div.createEl("div", { text: "🫥 Currently hidden from all pursuers", cls: "dnd-pursuit-success" });
    }
  }

  // ── Bonus Action Selection ─────────────────────────────────

  private renderBonusSelection(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase" });
    div.createEl("span", { text: "Bonus Action (Cunning Action):", cls: "dnd-pursuit-phase-label" });

    const btnGroup = div.createDiv({ cls: "dnd-pursuit-btn-group" });
    for (const ba of [
      { label: "🏃 Dash", action: "dash" as TurnAction, tip: "Bonus Dash" },
      { label: "🫥 Hide", action: "hide" as TurnAction, tip: "Bonus Hide (needs LoS broken)" },
      { label: "🛡️ Dsng", action: "disengage" as TurnAction, tip: "Bonus Disengage" },
    ]) {
      const btn = btnGroup.createEl("button", {
        text: ba.label,
        cls: "dnd-pursuit-bonus-btn",
        attr: { title: ba.tip },
      });
      btn.addEventListener("click", () => tracker.selectBonusAction(ba.action));
    }

    const skipBtn = btnGroup.createEl("button", {
      text: "Skip",
      cls: "dnd-pursuit-bonus-btn dnd-pursuit-btn-skip",
      attr: { title: "Skip bonus action" },
    });
    skipBtn.addEventListener("click", () => tracker.skipBonusAction());
  }

  // ── Movement Phase ─────────────────────────────────────────

  private renderMovementPhase(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    state: PursuitState,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase" });
    const maxMove = tracker.getMaxMovement(p);
    const dashed = p.turnAction === "dash" || p.bonusAction === "dash";
    const baseSpeed = tracker.getEffectiveSpeed(p);

    const speedInfo = div.createDiv({ cls: "dnd-pursuit-speed-info" });
    speedInfo.createEl("span", { text: "Movement: ", cls: "dnd-pursuit-phase-label" });
    if (p.movementPenalty === "zero") {
      speedInfo.createEl("span", { text: "0ft (lost to complication)", cls: "dnd-pursuit-warning" });
    } else if (dashed) {
      speedInfo.createEl("span", { text: `${baseSpeed}ft × 2 = `, cls: "dnd-pursuit-phase-detail" });
      speedInfo.createEl("span", { text: `${maxMove}ft`, cls: "dnd-pursuit-dash-speed" });
    } else {
      speedInfo.createEl("span", { text: `${maxMove}ft`, cls: "dnd-pursuit-phase-value" });
    }
    if (p.movementPenalty === "halved") {
      speedInfo.createEl("span", { text: " (halved by complication)", cls: "dnd-pursuit-warning" });
    }

    if (maxMove === 0) {
      this.addContinueButton(div, () => tracker.confirmMovement(0));
      return;
    }

    const moveLine = div.createDiv({ cls: "dnd-pursuit-move-line" });
    const quickBtns = moveLine.createDiv({ cls: "dnd-pursuit-btn-group" });

    const fullBtn = quickBtns.createEl("button", {
      text: `Full (${maxMove}ft)`,
      cls: "dnd-pursuit-btn dnd-pursuit-btn-primary",
    });
    fullBtn.addEventListener("click", () => tracker.confirmMovement(maxMove));

    if (maxMove >= 10) {
      const halfBtn = quickBtns.createEl("button", {
        text: `Half (${Math.floor(maxMove / 2)}ft)`,
        cls: "dnd-pursuit-btn",
      });
      halfBtn.addEventListener("click", () => tracker.confirmMovement(Math.floor(maxMove / 2)));
    }

    const stayBtn = quickBtns.createEl("button", {
      text: "Stay (0ft)",
      cls: "dnd-pursuit-btn",
    });
    stayBtn.addEventListener("click", () => tracker.confirmMovement(0));

    const customDiv = moveLine.createDiv({ cls: "dnd-pursuit-move-custom" });
    const moveInput = customDiv.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-move-input",
      attr: { min: "0", max: String(maxMove), placeholder: `0-${maxMove}` },
    });
    const moveBtn = customDiv.createEl("button", { text: "Move", cls: "dnd-pursuit-btn" });
    moveBtn.addEventListener("click", () => {
      const val = parseInt(moveInput.value, 10);
      if (isNaN(val) || val < 0) { new Notice("Enter a valid number of feet."); return; }
      if (val > maxMove) { new Notice(`Max movement is ${maxMove}ft.`); return; }
      tracker.confirmMovement(val);
    });
  }

  // ── Turn End ───────────────────────────────────────────────

  private renderTurnEnd(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    state: PursuitState,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase dnd-pursuit-turn-summary" });
    div.createEl("span", { text: "Turn Summary", cls: "dnd-pursuit-phase-label" });

    const summary = div.createDiv({ cls: "dnd-pursuit-summary-items" });
    if (p.turnAction) {
      summary.createEl("div", { text: `Action: ${this.actionLabel(p.turnAction)}` });
    }
    if (p.bonusAction) {
      summary.createEl("div", { text: `Bonus: ${this.actionLabel(p.bonusAction)}` });
    }
    summary.createEl("div", { text: `Moved: ${p.feetMovedThisTurn}ft → Position ${p.position}ft` });
    if (p.isHidden) {
      summary.createEl("div", { text: "🫥 Hidden from pursuers", cls: "dnd-pursuit-success" });
    }
    if (p.lineOfSightBroken && p.role === "quarry") {
      summary.createEl("div", { text: "✅ Line of Sight broken", cls: "dnd-pursuit-success" });
    }

    // Gap info
    const others = state.participants.filter((q) => q.role !== p.role && !q.droppedOut && !q.escaped && !q.incapacitated);
    if (others.length > 0) {
      const nearest = p.role === "quarry"
        ? Math.max(...others.map((q) => q.position))
        : Math.min(...others.map((q) => q.position));
      const gap = Math.abs(p.position - nearest);
      const gapLabel = p.role === "quarry" ? `Nearest pursuer: ${gap}ft behind` : `Nearest quarry: ${gap}ft ahead`;
      summary.createEl("div", { text: gapLabel, cls: "dnd-pursuit-phase-detail" });
    }

    const nextBtn = div.createEl("button", {
      text: "▶ Next Turn",
      cls: "dnd-pursuit-btn dnd-pursuit-btn-primary",
    });
    nextBtn.addEventListener("click", () => tracker.nextTurn());
  }

  // ── Complication Roll Phase (end-of-turn d20) ──────────────

  private renderComplicationRoll(
    row: HTMLElement,
    tracker: PursuitTracker,
    state: PursuitState,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase dnd-pursuit-complication" });
    const d20 = state.endOfTurnD20 ?? 0;
    const comp = state.currentComplication;

    div.createEl("span", { text: "End-of-Turn Complication Roll", cls: "dnd-pursuit-phase-label" });

    const rollLine = div.createDiv({ cls: "dnd-pursuit-complication-header" });
    rollLine.createEl("span", { text: `🎲 d20 = ${d20}`, cls: "dnd-pursuit-phase-value" });

    if (d20 > 10 || !comp) {
      rollLine.createEl("span", { text: " — No complication", cls: "dnd-pursuit-success" });
    } else {
      const nextName = comp.effectDescription ?? comp.entry.title;
      div.createEl("p", {
        text: `⚠️ ${nextName}`,
        cls: "dnd-pursuit-warning",
      });
    }

    this.addContinueButton(div, () => tracker.advanceFromComplicationRoll());
  }

  // ── Escape Check Phase (end-of-round) ─────────────────────

  private renderEscapeCheck(
    row: HTMLElement,
    tracker: PursuitTracker,
    state: PursuitState,
  ) {
    const div = row.createDiv({ cls: "dnd-pursuit-phase dnd-pursuit-complication" });
    div.createEl("span", { text: "End-of-Round: Escape Check", cls: "dnd-pursuit-phase-label" });

    const pending = state.pendingInput;
    if (pending && pending.type === "escape-stealth") {
      div.createEl("p", { text: pending.description, cls: "dnd-pursuit-roll-desc" });
      div.createEl("span", {
        text: `Stealth modifier: ${pending.modifier >= 0 ? "+" : ""}${pending.modifier} (${state.stealthCondition})`,
        cls: "dnd-pursuit-phase-detail",
      });

      const inputRow = div.createDiv({ cls: "dnd-pursuit-save-row" });
      const input = inputRow.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-save-input",
        attr: { placeholder: "Stealth total" },
      });
      const btn = inputRow.createEl("button", { text: "Submit", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
      btn.addEventListener("click", () => {
        const val = parseInt(input.value, 10);
        if (isNaN(val)) { new Notice("Enter a roll result."); return; }
        tracker.submitEscapeCheck(val);
      });
      input.focus();
    } else {
      div.createEl("p", { text: "Processing escape checks...", cls: "dnd-pursuit-phase-detail" });
    }
  }

  // ── Inline HP & Condition Controls ─────────────────────────

  private renderHPControls(
    container: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
  ) {
    const div = container.createDiv({ cls: "dnd-pursuit-hp-controls" });

    // Damage
    const dmgInput = div.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-hp-input",
      attr: { placeholder: "Dmg", min: "1" },
    });
    const dmgBtn = div.createEl("button", { text: "💥", cls: "dnd-pursuit-hp-btn dnd-pursuit-btn-danger", attr: { title: "Apply damage" } });
    dmgBtn.addEventListener("click", () => {
      const val = parseInt(dmgInput.value, 10);
      if (val > 0) { tracker.applyDamage(p.id, val); dmgInput.value = ""; }
    });

    // Heal
    const healInput = div.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-hp-input",
      attr: { placeholder: "Heal", min: "1" },
    });
    const healBtn = div.createEl("button", { text: "💚", cls: "dnd-pursuit-hp-btn dnd-pursuit-btn-heal", attr: { title: "Heal" } });
    healBtn.addEventListener("click", () => {
      const val = parseInt(healInput.value, 10);
      if (val > 0) { tracker.applyHealing(p.id, val); healInput.value = ""; }
    });

    // TempHP
    const tempInput = div.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-hp-input",
      attr: { placeholder: "Tmp", min: "0" },
    });
    const tempBtn = div.createEl("button", { text: "🛡️", cls: "dnd-pursuit-hp-btn", attr: { title: "Set temp HP" } });
    tempBtn.addEventListener("click", () => {
      const val = parseInt(tempInput.value, 10);
      if (val >= 0) { tracker.setTempHP(p.id, val); tempInput.value = ""; }
    });
  }

  private renderConditionBadges(
    container: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
  ) {
    if (p.conditions.length === 0 && p.escaped) return;
    const div = container.createDiv({ cls: "dnd-pursuit-conditions" });

    // Active conditions
    for (const cond of p.conditions) {
      const badge = div.createEl("span", { text: cond, cls: "dnd-pursuit-condition-badge" });
      const removeBtn = badge.createEl("span", { text: " ×", cls: "dnd-pursuit-condition-remove" });
      removeBtn.addEventListener("click", (e) => { e.stopPropagation(); tracker.removeCondition(p.id, cond); });
    }

    // Add condition button
    if (!p.escaped && !p.droppedOut) {
      const addBtn = div.createEl("button", { text: "+", cls: "dnd-pursuit-condition-add", attr: { title: "Add condition" } });
      addBtn.addEventListener("click", (e) => {
        const menu = new Menu();
        for (const c of STANDARD_CONDITIONS) {
          if (!p.conditions.includes(c)) {
            menu.addItem((item) => item.setTitle(c).onClick(() => tracker.addCondition(p.id, c)));
          }
        }
        menu.showAtMouseEvent(e as MouseEvent);
      });
    }
  }

  // ── Continue Button Helper ─────────────────────────────────

  private addContinueButton(container: HTMLElement, onClick: () => void) {
    const btn = container.createEl("button", {
      text: "Continue →",
      cls: "dnd-pursuit-btn dnd-pursuit-btn-continue",
    });
    btn.addEventListener("click", onClick);
  }

  // ── Carry Controls ─────────────────────────────────────────

  private renderCarryControls(
    row: HTMLElement,
    p: PursuitParticipant,
    tracker: PursuitTracker,
    state: PursuitState,
  ) {
    // Pick up same-role ally: incapacitated OR willing (not already carried/self)
    const candidates = state.participants.filter(
      (q) =>
        q.role === p.role &&
        !q.carriedBy &&
        q.id !== p.id &&
        !q.droppedOut &&
        !q.escaped
    );
    if (candidates.length > 0) {
      const carryLine = row.createDiv({ cls: "dnd-pursuit-carry-line" });
      carryLine.createEl("span", { text: "Pick up: " });
      for (const cand of candidates) {
        const result = computeCarryPenalty(p.strScore, cand.estimatedWeight);
        const tag = cand.incapacitated ? " 💀" : "";
        const label = result.status === "impossible"
          ? `${cand.display}${tag} (too heavy)`
          : result.status === "drag"
            ? `${cand.display}${tag} (drag, 5ft)`
            : `${cand.display}${tag} (½ speed)`;
        const btn = carryLine.createEl("button", {
          text: label,
          cls: "dnd-pursuit-carry-btn",
        });
        btn.disabled = result.status === "impossible";
        btn.addEventListener("click", () => tracker.pickUp(p.id, cand.id));
      }
    }

    // Already carrying someone(s)
    if (p.carrying.length > 0) {
      const carryLine = row.createDiv({ cls: "dnd-pursuit-carry-line" });
      for (const carriedId of p.carrying) {
        const carried = state.participants.find((q) => q.id === carriedId);
        if (!carried) continue;
        const span = carryLine.createEl("span", { text: `Carrying: ${carried.display} ` });
        const dropBtn = span.createEl("button", { text: "Put Down", cls: "dnd-pursuit-carry-btn" });
        dropBtn.addEventListener("click", () => tracker.putDown(p.id, carriedId));
      }
    }

    // Grappling someone(s)
    if (p.grappling.length > 0) {
      const grpLine = row.createDiv({ cls: "dnd-pursuit-carry-line" });
      for (const grappledId of p.grappling) {
        const grappled = state.participants.find((q) => q.id === grappledId);
        if (!grappled) continue;
        const span = grpLine.createEl("span", { text: `🤼 Grappling: ${grappled.display} ` });
        const releaseBtn = span.createEl("button", { text: "Release", cls: "dnd-pursuit-carry-btn" });
        releaseBtn.addEventListener("click", () => tracker.breakGrapple(grappledId));
      }
    }
  }

  // ── Target Selection for Pursuers ────────────────────────

  private renderTargetSelection(
    row: HTMLElement,
    tracker: PursuitTracker,
    p: PursuitParticipant,
    state: PursuitState,
  ) {
    const visibleQuarries = state.participants.filter(
      (q) => q.role === "quarry" && !q.escaped && !q.droppedOut && !q.incapacitated
        && tracker.canPerceive(p, q)
    );
    if (visibleQuarries.length <= 1) return;

    const div = row.createDiv({ cls: "dnd-pursuit-target-select" });
    div.createEl("span", { text: "🎯 Target: ", cls: "dnd-pursuit-phase-label" });
    const sel = div.createEl("select", { cls: "dnd-pursuit-speed-select" });
    for (const q of visibleQuarries) {
      const dist = Math.abs(q.position - p.position);
      const opt = sel.createEl("option", {
        text: `${q.display} (${dist}ft)`,
        attr: { value: q.id },
      });
      if (q.id === p.activeTargetId) opt.selected = true;
    }
    sel.addEventListener("change", () => tracker.setActiveTarget(p.id, sel.value));
  }

  // ── Environment Summary ────────────────────────────────────

  private renderEnvironmentSummary(container: HTMLElement, state: PursuitState) {
    const div = container.createDiv({ cls: "dnd-pursuit-env-summary" });
    div.createEl("h4", { text: `📍 ${state.environment.name}` });

    const tags: string[] = [];
    if (state.environment.hasCover) tags.push("Cover");
    if (state.environment.hasObscurement) tags.push("Obscured");
    if (state.environment.crowdedOrNoisy) tags.push("Crowded");
    if (state.environment.hasElevation) tags.push("Elevation");
    if (state.environment.wideOpen) tags.push("Wide Open");
    if (state.hasRangerPursuer) tags.push("Ranger Pursuer");

    if (tags.length > 0) {
      div.createEl("span", { text: tags.join(" · "), cls: "dnd-pursuit-env-tags" });
    }
  }

  // ── Chase Ended ────────────────────────────────────────────

  private renderEnded(container: HTMLElement, state: PursuitState) {
    const div = container.createDiv({ cls: "dnd-pursuit-ended" });

    const outcomeText: Record<string, string> = {
      escaped: "🏃 The quarry escaped!",
      caught: "⚔️ The quarry was caught!",
      surrendered: "🏳️ The chase was called off.",
      "returned-to-combat": "⚔️ Returned to combat.",
      "gm-ended": "🏁 The chase ended.",
    };

    div.createEl("h3", { text: outcomeText[state.outcome ?? "surrendered"] });

    // Summary
    for (const p of state.participants) {
      const icon = p.escaped ? "✅" : p.droppedOut ? "❌" : p.incapacitated ? "💀" : "—";
      div.createEl("div", { text: `${icon} ${p.display} (${p.role}) — exhaustion ${p.exhaustionLevel}` });
    }

    // Clear button
    const clearBtn = div.createEl("button", { text: "Clear", cls: "dnd-pursuit-btn" });
    clearBtn.addEventListener("click", () => this.plugin.pursuitTracker.clear());

    this.renderLog(container, state);
  }

  // ── Log ────────────────────────────────────────────────────

  private renderLog(container: HTMLElement, state: PursuitState) {
    const logDiv = container.createDiv({ cls: "dnd-pursuit-log" });
    logDiv.createEl("h4", { text: "📜 Chase Log" });

    const logList = logDiv.createDiv({ cls: "dnd-pursuit-log-list" });
    for (const entry of [...state.log].reverse()) {
      const line = logList.createDiv({ cls: "dnd-pursuit-log-entry" });
      line.createEl("span", { text: `R${entry.round}`, cls: "dnd-pursuit-log-round" });
      line.createEl("span", { text: entry.text });
    }
  }

  // ── Add Participant (mid-chase) ──────────────────────────

  private showAddParticipantMenu() {
    const tracker = this.plugin.pursuitTracker;
    const state = tracker.getState();
    if (!state) return;

    // Create a simple modal-like overlay for quick add
    const overlay = document.createElement("div");
    overlay.className = "dnd-pursuit-add-overlay";

    const panel = overlay.appendChild(document.createElement("div"));
    panel.className = "dnd-pursuit-add-panel";
    panel.createEl("h3", { text: "➕ Add Participant" });

    let name = "";
    let role: PursuitRole = "pursuer";
    let speed = 30;
    let strScore = 10;
    let position = 0;

    // Name
    const nameRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    nameRow.createEl("label", { text: "Name" });
    const nameInput = nameRow.createEl("input", { type: "text", attr: { placeholder: "Name" } });
    nameInput.addEventListener("input", () => { name = nameInput.value; });

    // Role
    const roleRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    roleRow.createEl("label", { text: "Role" });
    const roleSel = roleRow.createEl("select");
    roleSel.createEl("option", { text: "🔍 Pursuer", attr: { value: "pursuer" } });
    roleSel.createEl("option", { text: "🏃 Quarry", attr: { value: "quarry" } });
    roleSel.addEventListener("change", () => { role = roleSel.value as PursuitRole; });

    // Speed
    const speedRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    speedRow.createEl("label", { text: "Speed (ft)" });
    const speedInput = speedRow.createEl("input", { type: "number", attr: { value: "30" } });
    speedInput.addEventListener("input", () => { speed = parseInt(speedInput.value) || 30; });

    // STR
    const strRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    strRow.createEl("label", { text: "STR Score" });
    const strInput = strRow.createEl("input", { type: "number", attr: { value: "10" } });
    strInput.addEventListener("input", () => { strScore = parseInt(strInput.value) || 10; });

    // Position
    const posRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    posRow.createEl("label", { text: "Position (ft)" });
    const posInput = posRow.createEl("input", { type: "number", attr: { value: "0" } });
    posInput.addEventListener("input", () => { position = parseInt(posInput.value) || 0; });

    // Buttons
    const btnRow = panel.createDiv({ cls: "dnd-pursuit-add-row dnd-pursuit-add-btns" });
    const addBtn = btnRow.createEl("button", { text: "Add", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "dnd-pursuit-btn" });

    addBtn.addEventListener("click", () => {
      if (!name.trim()) { new Notice("Enter a name."); return; }
      const now = Date.now();
      tracker.addParticipant({
        id: `pursuit_${now}_add`,
        name: name.trim(),
        display: name.trim(),
        role,
        initiative: 0,
        initiativeModifier: 0,
        speeds: [{ mode: "walk", feet: speed }],
        activeSpeed: "walk",
        position,
        dashesUsed: 0,
        freeDashes: 3,
        conModifier: 0,
        exhaustionLevel: 0,
        hasActed: false,
        hasCunningAction: false,
        hasMoved: false,
        feetMovedThisTurn: 0,
        pendingDashSave: false,
        strScore,
        estimatedWeight: SIZE_WEIGHT_ESTIMATE.medium ?? 150,
        stealthModifier: 0,
        passivePerception: 10,
        perceptionModifier: 0,
        lineOfSightBroken: false,
        targetIds: [],
        currentHP: 10,
        maxHP: 10,
        incapacitated: false,
        conditions: [],
        escaped: false,
        droppedOut: false,
        player: false,
        hidden: false,
        isHidden: false,
        hiddenStealthRoll: undefined,
        movementPenalty: "none",
        complicationLoSBreak: false,
        wisModifier: 0,
        intModifier: 0,
        chaModifier: 0,
        wasOutOfSightThisRound: false,
        movementReductionFeet: 0,
        tempHP: 0,
        carrying: [],
        grappling: [],
        movementPlane: "ground",
        hasTremorsense: false,
        startPenalty: "none",
        startPenaltyApplied: false,
      });
      overlay.remove();
      new Notice(`Added ${name.trim()} to the chase!`);
    });

    cancelBtn.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    document.body.appendChild(overlay);
    nameInput.focus();
  }

  // ── Player View Projection ─────────────────────────────────

  private async openPlayerView(e: MouseEvent) {
    const pm = this.plugin.projectionManager;
    if (!pm) {
      new Notice("Projection system not available.");
      return;
    }

    const screens = await enumerateScreens();
    if (screens.length === 0) {
      new Notice("No external screens detected.");
      return;
    }

    // Prevent duplicate pursuit projections
    for (const proj of pm.getLiveProjections()) {
      if (proj.contentType === "pursuit") {
        new Notice("Pursuit player view already projected.");
        return;
      }
    }

    const occupied = pm.getOccupiedScreenKeys();

    if (screens.length <= 1) {
      const screen = screens[0]!;
      const sKey = screenKey(screen);
      if (occupied.has(sKey)) {
        const menu = new Menu();
        menu.addItem((item) =>
          item.setTitle(`🔄 Switch ${screen.label} to Pursuit View`).onClick(async () => {
            await pm.projectPursuitView(screen);
            this.render();
          })
        );
        menu.showAtMouseEvent(e);
      } else {
        await pm.projectPursuitView(screen);
        this.render();
      }
      return;
    }

    // Multiple screens: show picker menu with occupancy info
    const menu = new Menu();
    for (const screen of screens) {
      const sKey = screenKey(screen);
      const isOccupied = occupied.has(sKey);
      const label = `${screen.isPrimary ? "🖥️" : "🖵"} ${screen.label} (${screen.width}×${screen.height})`;

      if (isOccupied) {
        menu.addItem((item) =>
          item.setTitle(`🔄 Switch ${screen.label} to Pursuit View`).onClick(async () => {
            await pm.projectPursuitView(screen);
            this.render();
          })
        );
      } else {
        menu.addItem((item) =>
          item.setTitle(label).onClick(async () => {
            await pm.projectPursuitView(screen);
            this.render();
          })
        );
      }
    }
    menu.showAtMouseEvent(e);
  }

  // ── Encounter Creature Search ──────────────────────────────

  private showEncounterCreatureSearch(position: number, encounterSource: string) {
    const tracker = this.plugin.pursuitTracker;
    const state = tracker.getState();
    if (!state) return;

    // Scan vault for creatures / NPCs
    interface VaultCreature {
      name: string;
      speeds: SpeedEntry[];
      strScore: number;
      conModifier: number;
      stealthModifier: number;
      passivePerception: number;
      perceptionModifier: number;
      initBonus: number;
      currentHP: number;
      maxHP: number;
      size: string;
      wisModifier: number;
      intModifier: number;
      chaModifier: number;
    }

    const extractSkillBonus = (skillsaves: unknown, skillName: string): number | null => {
      if (!Array.isArray(skillsaves)) return null;
      const lower = skillName.toLowerCase();
      for (const entry of skillsaves) {
        if (typeof entry !== "object" || entry === null) continue;
        for (const [key, val] of Object.entries(entry as Record<string, unknown>)) {
          if (key.toLowerCase() === lower && typeof val === "number") return val;
        }
      }
      return null;
    };

    const extractPassivePerception = (senses: unknown): number | null => {
      if (typeof senses !== "string") return null;
      const m = senses.match(/passive perception\s+(\d+)/i);
      return m ? parseInt(m[1]!, 10) : null;
    };

    const creatures: VaultCreature[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;
      const type = fm.type;
      const isNPC = type === "npc";
      const isCreature = type !== "player" && type !== "pc" && !isNPC && fm.statblock === true;
      if (!isNPC && !isCreature) continue;

      const speeds = parseSpeed(fm.speed);
      const hasStats = Array.isArray(fm.stats) && fm.stats.length >= 6;
      const str = hasStats && typeof fm.stats[0] === "number" ? fm.stats[0] : 10;
      const dex = hasStats && typeof fm.stats[1] === "number" ? fm.stats[1] : 10;
      const con = hasStats && typeof fm.stats[2] === "number" ? fm.stats[2] : 10;
      const wis = hasStats && typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
      const int = hasStats && typeof fm.stats[3] === "number" ? fm.stats[3] : 10;
      const cha = hasStats && typeof fm.stats[5] === "number" ? fm.stats[5] : 10;
      const dexMod = Math.floor((dex - 10) / 2);
      const conMod = Math.floor((con - 10) / 2);
      const wisMod = Math.floor((wis - 10) / 2);
      const intMod = Math.floor((int - 10) / 2);
      const chaMod = Math.floor((cha - 10) / 2);
      const stealthMod = extractSkillBonus(fm.skillsaves, "stealth") ?? dexMod;
      const percMod = extractSkillBonus(fm.skillsaves, "perception") ?? wisMod;
      const passivePerc = extractPassivePerception(fm.senses) ?? (10 + percMod);
      const hp = typeof fm.hp === "number" ? fm.hp : (typeof fm.hp_max === "number" ? fm.hp_max : 10);
      const maxHP = typeof fm.hp_max === "number" ? fm.hp_max : hp;
      let size = "medium";
      if (typeof fm.size === "string") size = fm.size.toLowerCase();

      creatures.push({
        name: fm.name || file.basename,
        speeds,
        strScore: str,
        conModifier: conMod,
        stealthModifier: stealthMod,
        passivePerception: passivePerc,
        perceptionModifier: percMod,
        initBonus: dexMod,
        currentHP: hp,
        maxHP,
        size,
        wisModifier: wisMod,
        intModifier: intMod,
        chaModifier: chaMod,
      });
    }
    creatures.sort((a, b) => a.name.localeCompare(b.name));

    // Build overlay
    const overlay = document.createElement("div");
    overlay.className = "dnd-pursuit-add-overlay";
    const panel = overlay.appendChild(document.createElement("div"));
    panel.className = "dnd-pursuit-add-panel";
    panel.createEl("h3", { text: `🐲 Add Encounter Creature` });
    panel.createEl("p", { text: `Near ${encounterSource} at ${position}ft`, cls: "setting-item-description" });

    let selected: VaultCreature | null = null;
    let role: PursuitRole = "pursuer";

    // Search input
    const searchRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    searchRow.createEl("label", { text: "Search" });
    const searchInput = searchRow.createEl("input", {
      type: "text",
      attr: { placeholder: "Search creatures…" },
      cls: "dnd-creature-search-input",
    });
    const resultsDiv = panel.createDiv({ cls: "dnd-creature-search-results" });
    resultsDiv.style.display = "none";

    const showResults = (query: string) => {
      if (!query || query.length < 1) { resultsDiv.style.display = "none"; return; }
      const q = query.toLowerCase().trim();
      const filtered = creatures.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10);
      resultsDiv.empty();
      if (filtered.length === 0) {
        resultsDiv.createEl("div", { text: "No creatures found", cls: "dnd-creature-search-no-results" });
        resultsDiv.style.display = "block";
        return;
      }
      for (const c of filtered) {
        const row = resultsDiv.createDiv({ cls: "dnd-creature-search-result" });
        row.createDiv({ text: `🐉 ${c.name}`, cls: "dnd-creature-search-result-name" });
        const speed = c.speeds.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
        row.createDiv({ text: `${speed} | HP ${c.currentHP} | STR ${c.strScore}`, cls: "dnd-creature-search-result-stats" });
        row.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          selected = c;
          searchInput.value = c.name;
          resultsDiv.style.display = "none";
        });
      }
      resultsDiv.style.display = "block";
    };
    searchInput.addEventListener("input", () => showResults(searchInput.value));

    // Role selector
    const roleRow = panel.createDiv({ cls: "dnd-pursuit-add-row" });
    roleRow.createEl("label", { text: "Role" });
    const roleSel = roleRow.createEl("select");
    roleSel.createEl("option", { text: "🔍 Pursuer", attr: { value: "pursuer" } });
    roleSel.createEl("option", { text: "🏃 Quarry", attr: { value: "quarry" } });
    roleSel.addEventListener("change", () => { role = roleSel.value as PursuitRole; });

    // Buttons
    const btnRow = panel.createDiv({ cls: "dnd-pursuit-add-row dnd-pursuit-add-btns" });
    const addBtn = btnRow.createEl("button", { text: "Add", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel", cls: "dnd-pursuit-btn" });

    addBtn.addEventListener("click", () => {
      if (!selected) { new Notice("Search and select a creature first."); return; }
      const now = Date.now();
      const weight = SIZE_WEIGHT_ESTIMATE[selected.size as keyof typeof SIZE_WEIGHT_ESTIMATE] ?? SIZE_WEIGHT_ESTIMATE.medium ?? 150;
      tracker.addParticipant({
        id: `pursuit_${now}_enc`,
        name: selected.name,
        display: selected.name,
        role,
        initiative: 0,
        initiativeModifier: selected.initBonus,
        speeds: selected.speeds,
        activeSpeed: selected.speeds[0]?.mode ?? "walk",
        position,
        dashesUsed: 0,
        freeDashes: Math.max(3 + selected.conModifier, 0),
        conModifier: selected.conModifier,
        exhaustionLevel: 0,
        hasActed: false,
        hasCunningAction: false,
        hasMoved: false,
        feetMovedThisTurn: 0,
        pendingDashSave: false,
        strScore: selected.strScore,
        estimatedWeight: weight,
        stealthModifier: selected.stealthModifier,
        passivePerception: selected.passivePerception,
        perceptionModifier: selected.perceptionModifier,
        lineOfSightBroken: false,
        targetIds: [],
        currentHP: selected.currentHP,
        maxHP: selected.maxHP,
        incapacitated: false,
        conditions: [],
        escaped: false,
        droppedOut: false,
        player: false,
        hidden: false,
        isHidden: false,
        hiddenStealthRoll: undefined,
        movementPenalty: "none",
        complicationLoSBreak: false,
        wisModifier: selected.wisModifier,
        intModifier: selected.intModifier,
        chaModifier: selected.chaModifier,
        wasOutOfSightThisRound: false,
        movementReductionFeet: 0,
        tempHP: 0,
        carrying: [],
        grappling: [],
        movementPlane: "ground",
        hasTremorsense: false,
        startPenalty: "none",
        startPenaltyApplied: false,
      });
      overlay.remove();
      new Notice(`🐲 Added ${selected.name} at ${position}ft!`);
    });

    cancelBtn.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) overlay.remove(); });

    document.body.appendChild(overlay);
    searchInput.focus();
  }

  // ── Helpers ────────────────────────────────────────────────

  private actionLabel(action: TurnAction): string {
    switch (action) {
      case "dash": return "🏃 Dash";
      case "hide": return "🫥 Hide";
      case "search": return "🔎 Search";
      case "disengage": return "🛡️ Disengage";
      case "dodge": return "🔄 Dodge";
      case "attack": return "⚔️ Attack";
      case "create-obstacle": return "🪵 Obstacle";
      case "grapple": return "🤼 Grapple";
      case "escape-grapple": return "💪 Break Free";
      case "other": return "✨ Other";
    }
  }
}
