/**
 * PursuitTrackerView — GM sidebar view for managing an active chase.
 *
 * Shows turn order, participant stats, action selectors, LoS toggles,
 * carry pairings, end-of-round stealth panel, and chase log.
 */

import { App, ItemView, Menu, Modal, Notice, Setting, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PURSUIT_TRACKER_VIEW_TYPE, PURSUIT_PLAYER_VIEW_TYPE } from "../constants";
import type { PursuitTracker } from "./PursuitTracker";
import type {
  PursuitState,
  PursuitParticipant,
  TurnAction,
  StealthCondition,
} from "./types";
import { computeStealthCondition, computeCarryPenalty } from "./types";
import { enumerateScreens, screenKey, type ScreenInfo } from "../utils/ScreenEnumeration";

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

      const nextBtn = toolbar.createEl("button", { text: "▶", cls: "dnd-pursuit-toolbar-btn dnd-pursuit-toolbar-btn-primary", attr: { title: "Next Turn" } });
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

    // Effective speed (with carry penalty)
    const effectiveSpeed = tracker.getEffectiveSpeed(p);
    if (p.carrying) {
      statsLine.createEl("span", { text: `→ ${effectiveSpeed}ft (carrying)`, cls: "dnd-pursuit-effective-speed dnd-pursuit-carry-warning" });
    }

    // HP
    statsLine.createEl("span", { text: `HP ${p.currentHP}/${p.maxHP}`, cls: "dnd-pursuit-row-hp" });

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

    // ── Action controls (only for active participant) ──
    if (isActive && !p.incapacitated) {
      const actionLine = row.createDiv({ cls: "dnd-pursuit-row-actions" });

      // Action buttons
      const actions: Array<{ label: string; action: TurnAction; tip: string }> = [
        { label: "🏃 Dash", action: "dash", tip: "Double movement, no Hide" },
        { label: "🫥 Hide", action: "hide", tip: "Stealth check at end of round (needs LoS broken)" },
        { label: "🛡️ Disengage", action: "disengage", tip: "No opportunity attacks" },
        { label: "🔄 Dodge", action: "dodge", tip: "Attacks have disadvantage" },
        { label: "✨ Other", action: "other", tip: "Spell, Help, item, etc." },
      ];

      for (const a of actions) {
        const btn = actionLine.createEl("button", {
          text: a.label,
          cls: `dnd-pursuit-action-btn ${p.turnAction === a.action ? "dnd-pursuit-action-active" : ""}`,
          attr: { title: a.tip },
        });
        btn.addEventListener("click", () => {
          if (a.action === "dash") {
            const needsSave = tracker.dash(p.id);
            if (needsSave) {
              new DashConSaveModal(this.app, p, tracker).open();
            }
          } else {
            tracker.setTurnAction(p.id, a.action);
          }
        });
      }

      // Bonus action for Cunning Action users
      if (p.hasCunningAction) {
        actionLine.createEl("span", { text: " | Bonus:", cls: "dnd-pursuit-bonus-label" });
        for (const ba of [
          { label: "Dash", action: "dash" as TurnAction },
          { label: "Hide", action: "hide" as TurnAction },
          { label: "Disengage", action: "disengage" as TurnAction },
        ]) {
          const btn = actionLine.createEl("button", {
            text: ba.label,
            cls: `dnd-pursuit-bonus-btn ${p.bonusAction === ba.action ? "dnd-pursuit-action-active" : ""}`,
          });
          btn.addEventListener("click", () => tracker.setBonusAction(p.id, ba.action));
        }
      }

      // LoS toggle (quarry only)
      if (p.role === "quarry") {
        const losLine = row.createDiv({ cls: "dnd-pursuit-los-line" });
        const losCheck = losLine.createEl("input", { type: "checkbox" }) as HTMLInputElement;
        losCheck.checked = p.lineOfSightBroken;
        losCheck.addEventListener("change", () => tracker.setLineOfSightBroken(p.id, losCheck.checked));
        losLine.createEl("label", { text: " Line of Sight broken" });

        // LoS hint panel
        const hintDiv = losLine.createDiv({ cls: "dnd-pursuit-los-hints" });
        const env = state.environment;
        const hints: string[] = [];
        if (env.hasCover) hints.push("✅ Cover available (stalls, buildings)");
        if (env.hasObscurement) hints.push("✅ Obscurement (fog, darkness)");
        if (env.hasElevation) hints.push("✅ Elevation (rooftops, balconies)");
        if (env.crowdedOrNoisy) hints.push("✅ Crowded/noisy area");
        if (env.wideOpen) hints.push("⚠️ Wide open — few hiding spots");
        if (hints.length === 0) hints.push("No environment factors set");
        for (const h of hints) {
          hintDiv.createEl("div", { text: h, cls: "dnd-pursuit-hint" });
        }

        // Eligibility warning
        if (p.lineOfSightBroken) {
          const canHide = p.turnAction === "hide" || (p.hasCunningAction && p.bonusAction === "hide");
          if (!canHide) {
            losLine.createEl("div", {
              text: "⚠️ LoS broken but no Hide action taken — cannot make stealth check",
              cls: "dnd-pursuit-warning",
            });
          }
        }
      }

      // Carry controls
      if (p.role === "quarry" && !p.carrying) {
        const incapMembers = state.participants.filter(
          (q) => q.role === "quarry" && q.incapacitated && !q.carriedBy && q.id !== p.id
        );
        if (incapMembers.length > 0) {
          const carryLine = row.createDiv({ cls: "dnd-pursuit-carry-line" });
          carryLine.createEl("span", { text: "Pick up: " });
          for (const inc of incapMembers) {
            const result = computeCarryPenalty(p.strScore, inc.estimatedWeight);
            const label = result.status === "impossible"
              ? `${inc.display} (too heavy)`
              : result.status === "drag"
                ? `${inc.display} (drag, 5ft)`
                : `${inc.display} (½ speed)`;
            const btn = carryLine.createEl("button", {
              text: label,
              cls: "dnd-pursuit-carry-btn",
            });
            btn.disabled = result.status === "impossible";
            btn.addEventListener("click", () => tracker.pickUp(p.id, inc.id));
          }
        }
      }
      if (p.carrying) {
        const carried = state.participants.find((q) => q.id === p.carrying);
        if (carried) {
          const carryLine = row.createDiv({ cls: "dnd-pursuit-carry-line" });
          carryLine.createEl("span", { text: `Carrying: ${carried.display}` });
          const dropBtn = carryLine.createEl("button", { text: "Put Down", cls: "dnd-pursuit-carry-btn" });
          dropBtn.addEventListener("click", () => tracker.putDown(p.id));
        }
      }

      // Movement controls
      const moveLine = row.createDiv({ cls: "dnd-pursuit-move-line" });
      const moveLabel = moveLine.createEl("span", { text: `Move (${effectiveSpeed}ft): ` });
      const moveInput = moveLine.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-move-input",
        attr: { value: String(effectiveSpeed), min: "0", max: String(effectiveSpeed * 2) },
      });
      const moveBtn = moveLine.createEl("button", { text: "Move ▶", cls: "dnd-pursuit-btn" });
      moveBtn.addEventListener("click", () => {
        const feet = parseInt(moveInput.value, 10) || 0;
        tracker.move(p.id, feet);
      });

      // Pursuer: Search action + Drop Out
      if (p.role === "pursuer") {
        const pursuerLine = row.createDiv({ cls: "dnd-pursuit-pursuer-actions" });
        const searchBtn = pursuerLine.createEl("button", { text: "🔎 Search", cls: "dnd-pursuit-action-btn" });
        searchBtn.addEventListener("click", () => {
          new PerceptionRollModal(this.app, p, tracker).open();
        });
      }

      // Drop out button
      const dropLine = row.createDiv({ cls: "dnd-pursuit-drop-line" });
      const dropBtn = dropLine.createEl("button", { text: "🏳️ Drop Out", cls: "dnd-pursuit-btn dnd-pursuit-btn-danger" });
      dropBtn.addEventListener("click", () => tracker.dropOut(p.id));
    }

    // ── End-of-round stealth (shown for quarry after all turns) ──
    if (p.role === "quarry" && p.lineOfSightBroken && p.hasActed) {
      const canHide = p.turnAction === "hide" || (p.hasCunningAction && p.bonusAction === "hide");
      if (canHide && !p.stealthRoll) {
        const stealthLine = row.createDiv({ cls: "dnd-pursuit-stealth-line" });
        stealthLine.createEl("span", { text: `Stealth check (mod ${p.stealthModifier >= 0 ? "+" : ""}${p.stealthModifier}): ` });
        const stInput = stealthLine.createEl("input", {
          type: "number",
          cls: "dnd-pursuit-stealth-input",
          attr: { placeholder: "Roll result" },
        });
        const stBtn = stealthLine.createEl("button", { text: "Check", cls: "dnd-pursuit-btn" });
        stBtn.addEventListener("click", () => {
          const roll = parseInt((stInput as HTMLInputElement).value, 10);
          if (isNaN(roll)) { new Notice("Enter a stealth roll result."); return; }
          tracker.resolveStealthCheck(p.id, roll);
        });

        // Show the DC (highest pursuer Perception)
        const pursuers = state.participants.filter((q) => q.role === "pursuer" && !q.droppedOut);
        let highestPerc = 0;
        let highestName = "";
        for (const pur of pursuers) {
          const eff = Math.max(pur.passivePerception, pur.activePerceptionRoll ?? 0);
          if (eff > highestPerc) { highestPerc = eff; highestName = pur.display; }
        }
        stealthLine.createEl("span", {
          text: ` vs DC ${highestPerc} (${highestName})`,
          cls: "dnd-pursuit-stealth-dc",
        });

        // Condition note
        if (state.stealthCondition !== "normal") {
          stealthLine.createEl("span", {
            text: ` [${state.stealthCondition}]`,
            cls: `dnd-pursuit-stealth-cond dnd-pursuit-condition-${state.stealthCondition}`,
          });
        }
      }
    }
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

    if (screens.length === 1 && screens[0]) {
      await pm.projectPursuitView(screens[0]);
      this.render();
      return;
    }

    // Multiple screens: show picker menu
    const menu = new Menu();
    for (const s of screens) {
      menu.addItem((item) =>
        item.setTitle(s.label).onClick(async () => {
          await pm.projectPursuitView(s);
          this.render();
        })
      );
    }
    menu.showAtMouseEvent(e);
  }
}

// ── Helper Modals ────────────────────────────────────────────

/** Modal for rolling a DC 10 CON save after extra dash. */
class DashConSaveModal extends Modal {
  private p: PursuitParticipant;
  private tracker: PursuitTracker;

  constructor(app: App, p: PursuitParticipant, tracker: PursuitTracker) {
    super(app);
    this.p = p;
    this.tracker = tracker;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `DC 10 CON Save — ${this.p.display}` });
    contentEl.createEl("p", { text: `Free dashes exhausted (${this.p.dashesUsed}/${this.p.freeDashes}). Roll a DC 10 Constitution saving throw.` });
    contentEl.createEl("p", { text: `CON modifier: ${this.p.conModifier >= 0 ? "+" : ""}${this.p.conModifier}` });

    const inputDiv = contentEl.createDiv();
    const input = inputDiv.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-save-input",
      attr: { placeholder: "d20 + CON mod total" },
    });

    const btnDiv = contentEl.createDiv({ cls: "dnd-pursuit-footer" });
    const btn = btnDiv.createEl("button", { text: "Resolve", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    btn.addEventListener("click", () => {
      const roll = parseInt(input.value, 10);
      if (isNaN(roll)) { new Notice("Enter the save result."); return; }
      const success = this.tracker.resolveDashSave(this.p.id, roll);
      new Notice(success
        ? `✅ ${this.p.display} succeeds the CON save!`
        : `❌ ${this.p.display} fails! Exhaustion → ${this.p.exhaustionLevel + 1}`
      );
      this.close();
    });
  }

  onClose() { this.contentEl.empty(); }
}

/** Modal for a pursuer's active Perception roll. */
class PerceptionRollModal extends Modal {
  private p: PursuitParticipant;
  private tracker: PursuitTracker;

  constructor(app: App, p: PursuitParticipant, tracker: PursuitTracker) {
    super(app);
    this.p = p;
    this.tracker = tracker;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `Perception Check — ${this.p.display}` });
    contentEl.createEl("p", { text: `Passive Perception: ${this.p.passivePerception} · Modifier: ${this.p.perceptionModifier >= 0 ? "+" : ""}${this.p.perceptionModifier}` });

    const inputDiv = contentEl.createDiv();
    const input = inputDiv.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-save-input",
      attr: { placeholder: "d20 + WIS (Perception) total" },
    });

    const btnDiv = contentEl.createDiv({ cls: "dnd-pursuit-footer" });
    const btn = btnDiv.createEl("button", { text: "Set", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    btn.addEventListener("click", () => {
      const roll = parseInt(input.value, 10);
      if (isNaN(roll)) { new Notice("Enter the Perception result."); return; }
      this.tracker.setActivePerception(this.p.id, roll);
      this.close();
    });
  }

  onClose() { this.contentEl.empty(); }
}
