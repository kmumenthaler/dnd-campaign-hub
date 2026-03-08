import { ItemView, MarkdownRenderer, Menu, Modal, Notice, Setting, TFile, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { COMBAT_TRACKER_VIEW_TYPE, COMBAT_PLAYER_VIEW_TYPE } from "../constants";
import type { CombatTracker } from "./CombatTracker";
import type { Combatant, CombatState, StatusEffect } from "./types";
import { enumerateScreens, screenKey, type ScreenInfo } from "../utils/ScreenEnumeration";

/**
 * Sidebar view for the Combat Tracker — styled to match Initiative Tracker.
 *
 * Layout:
 *  ┌─ Toolbar: ◀ ▶ │ 🎲 Roll │ 📺 Player View │ ⋮ Options ─┐
 *  ├─ Encounter header (name, round, XP, difficulty bar)      │
 *  ├─ Column headers: Init │ Name │ HP │ AC │ ⋮              │
 *  ├─ Combatant rows with markers, statuses, context menus    │
 *  └──────────────────────────────────────────────────────────┘
 */
export class CombatTrackerView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private unsubscribe: (() => void) | null = null;
  private statblockPanel: HTMLElement | null = null;
  private activeStatblockName: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return COMBAT_TRACKER_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Combat Tracker";
  }
  getIcon(): string {
    return "swords";
  }

  async onOpen() {
    this.unsubscribe = this.plugin.combatTracker.onChange(() => this.render());
    await this.render();
  }

  onClose() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return Promise.resolve();
  }

  /* ═══════════════════════ Main Render ═══════════════════════ */

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();
    container.addClass("dnd-combat-tracker");

    const tracker = this.plugin.combatTracker;
    const state = tracker.getState();

    if (!state) {
      this.renderNoCombat(container);
      return;
    }

    this.renderToolbar(container, tracker, state);
    this.renderEncounterHeader(container, state);
    this.renderColumnHeaders(container);
    this.renderCombatantList(container, tracker, state);

    // Statblock panel (rendered inline below combatant list)
    this.statblockPanel = container.createDiv({ cls: "dnd-ct-statblock-panel" });
    if (this.activeStatblockName) {
      this.renderStatblockInPanel(this.activeStatblockName);
    }
  }

  /* ═══════════════════════ No Active Combat ═══════════════════════ */

  private renderNoCombat(container: HTMLElement) {
    const empty = container.createDiv({ cls: "dnd-ct-empty" });
    empty.createEl("p", { text: "No active combat." });
    empty.createEl("p", {
      text: "Run an encounter to start, or resume a saved state.",
      cls: "dnd-ct-hint",
    });

    // Show saved combats for quick resume
    const saved = this.plugin.settings.combatStates;
    if (saved && Object.keys(saved).length > 0) {
      const resumeSection = container.createDiv({ cls: "dnd-ct-resume-section" });
      resumeSection.createEl("h4", { text: "Saved Combats" });
      for (const name of Object.keys(saved)) {
        const info = this.plugin.combatTracker.getSavedStateInfo(name);
        if (!info) continue;
        const row = resumeSection.createDiv({ cls: "dnd-ct-resume-row" });
        row.createEl("span", { text: `${name} — Round ${info.round}, ${info.combatantCount} combatants` });
        const btn = row.createEl("button", { text: "▶ Resume", cls: "dnd-ct-btn dnd-ct-btn-primary" });
        btn.addEventListener("click", () => this.plugin.combatTracker.resumeCombat(name));
      }
    }
  }

  /* ═══════════════════════ Toolbar ═══════════════════════ */

  private renderToolbar(container: HTMLElement, tracker: CombatTracker, state: CombatState) {
    const toolbar = container.createDiv({ cls: "dnd-ct-toolbar" });

    if (!state.started) {
      // Pre-combat: just roll initiative
      const rollBtn = toolbar.createEl("button", {
        text: "🎲 Roll Initiative",
        cls: "dnd-ct-btn dnd-ct-btn-primary",
      });
      rollBtn.addEventListener("click", () => tracker.rollAllInitiative());
    } else {
      // Turn navigation
      const prevBtn = toolbar.createEl("button", { text: "◀", cls: "dnd-ct-toolbar-btn", attr: { title: "Previous Turn" } });
      prevBtn.addEventListener("click", () => tracker.prevTurn());

      const roundLabel = toolbar.createEl("span", { cls: "dnd-ct-toolbar-round" });
      roundLabel.textContent = `Round ${state.round}`;

      const nextBtn = toolbar.createEl("button", { text: "▶", cls: "dnd-ct-toolbar-btn dnd-ct-toolbar-btn-primary", attr: { title: "Next Turn" } });
      nextBtn.addEventListener("click", () => tracker.nextTurn());
    }

    // Spacer
    toolbar.createDiv({ cls: "dnd-ct-toolbar-spacer" });

    // Player view button — toggles between project and stop
    const pm = this.plugin.projectionManager;
    const hasCombatProjection = pm
      ? pm.getLiveProjections().some((p) => p.contentType === "combat")
      : false;

    const pvBtn = toolbar.createEl("button", {
      text: hasCombatProjection ? "⏹" : "📺",
      cls: `dnd-ct-toolbar-btn ${hasCombatProjection ? "dnd-ct-toolbar-btn-stop" : ""}`,
      attr: { title: hasCombatProjection ? "Stop Player View" : "Open Player View" },
    });
    pvBtn.addEventListener("click", (e) => {
      if (hasCombatProjection && pm) {
        // Stop all combat projections
        for (const proj of pm.getLiveProjections()) {
          if (proj.contentType === "combat") {
            pm.stopProjectionOnScreen(screenKey(proj.screen));
          }
        }
        this.render();
      } else {
        this.openPlayerView(e);
      }
    });

    // End encounter button (only when combat is active)
    if (state.started) {
      const endBtn = toolbar.createEl("button", {
        text: "🏁",
        cls: "dnd-ct-toolbar-btn dnd-ct-toolbar-btn-stop",
        attr: { title: "End Encounter" },
      });
      endBtn.addEventListener("click", () => {
        new ConfirmEndCombatModal(this.app, tracker).open();
      });
    }

    // Options menu button (⋮)
    const menuBtn = toolbar.createEl("button", {
      text: "⋮",
      cls: "dnd-ct-toolbar-btn dnd-ct-toolbar-btn-menu",
      attr: { title: "Options" },
    });
    menuBtn.addEventListener("click", (e) => this.showOptionsMenu(e, tracker, state));
  }

  /* ═══════════════════════ Encounter Header ═══════════════════════ */

  private renderEncounterHeader(container: HTMLElement, state: CombatState) {
    const header = container.createDiv({ cls: "dnd-ct-encounter-header" });

    // Encounter name
    header.createEl("div", { text: state.encounterName, cls: "dnd-ct-encounter-name" });

    // Current turn indicator
    if (state.started) {
      const current = state.combatants[state.turnIndex];
      if (current) {
        const turnEl = header.createEl("div", { cls: "dnd-ct-current-turn" });
        turnEl.textContent = `${current.display}'s Turn`;
      }
    }

    // Combatant summary
    const alive = state.combatants.filter(c => c.currentHP > 0 && (c.enabled ?? true));
    const total = state.combatants.length;
    const summary = header.createEl("div", { cls: "dnd-ct-encounter-summary" });
    summary.textContent = `${alive.length}/${total} active`;
  }

  /* ═══════════════════════ Column Headers ═══════════════════════ */

  private renderColumnHeaders(container: HTMLElement) {
    const headers = container.createDiv({ cls: "dnd-ct-col-headers" });
    headers.createEl("span", { text: "Init", cls: "dnd-ct-col dnd-ct-col-init" });
    headers.createEl("span", { text: "Name", cls: "dnd-ct-col dnd-ct-col-name" });
    headers.createEl("span", { text: "HP", cls: "dnd-ct-col dnd-ct-col-hp" });
    headers.createEl("span", { text: "AC", cls: "dnd-ct-col dnd-ct-col-ac" });
    headers.createEl("span", { text: "", cls: "dnd-ct-col dnd-ct-col-menu" });
  }

  /* ═══════════════════════ Combatant List ═══════════════════════ */

  private renderCombatantList(container: HTMLElement, tracker: CombatTracker, state: CombatState) {
    const list = container.createDiv({ cls: "dnd-ct-list" });

    for (let i = 0; i < state.combatants.length; i++) {
      const c = state.combatants[i];
      if (!c) continue;
      const isActive = state.started && i === state.turnIndex;
      this.renderCombatantRow(list, tracker, c, isActive, state);
    }
  }

  private renderCombatantRow(
    list: HTMLElement,
    tracker: CombatTracker,
    c: Combatant,
    isActive: boolean,
    state: CombatState,
  ) {
    const isEnabled = c.enabled ?? true;
    const isDead = c.currentHP <= 0;

    const rowClasses = ["dnd-ct-row"];
    if (isActive) rowClasses.push("dnd-ct-row-active");
    if (isDead) rowClasses.push("dnd-ct-row-dead");
    if (c.hidden) rowClasses.push("dnd-ct-row-hidden");
    if (!isEnabled) rowClasses.push("dnd-ct-row-disabled");

    const row = list.createDiv({ cls: rowClasses.join(" ") });

    // ── Initiative badge ──
    const initBadge = row.createEl("span", { cls: "dnd-ct-init" });
    initBadge.textContent = state.started ? String(c.initiative) : "—";
    initBadge.title = "Click to set initiative";
    initBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      new SetInitiativeModal(this.app, c, tracker).open();
    });

    // ── Name cell ──
    const nameCell = row.createDiv({ cls: "dnd-ct-name-cell" });

    // Markers row
    const markers = nameCell.createDiv({ cls: "dnd-ct-markers" });
    if (c.player) {
      markers.createEl("span", { text: "👤", cls: "dnd-ct-marker", attr: { title: "Player Character" } });
    }
    if (c.friendly && !c.player) {
      markers.createEl("span", { text: "♥", cls: "dnd-ct-marker dnd-ct-marker-friendly", attr: { title: "Friendly" } });
    }
    if (c.hidden) {
      markers.createEl("span", { text: "👁", cls: "dnd-ct-marker dnd-ct-marker-hidden", attr: { title: "Hidden from players" } });
    }

    // Name (clickable → statblock below)
    const nameEl = nameCell.createEl("span", {
      text: c.display,
      cls: `dnd-ct-name ${c.player ? "dnd-ct-name-player" : ""} ${c.friendly && !c.player ? "dnd-ct-name-friendly" : ""} ${!c.player && !c.friendly ? "dnd-ct-name-enemy" : ""}`,
    });

    if (c.player && c.notePath) {
      // PCs: open full note in split leaf
      nameEl.addClass("dnd-ct-name-link");
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openNote(c.notePath!);
      });
    } else if (!c.player) {
      // Creatures/NPCs: show Fantasy Statblock inline
      nameEl.addClass("dnd-ct-name-link");
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleStatblock(c.name);
      });
    }

    // Status badges (inline under name)
    if (c.statuses.length > 0) {
      const statusRow = nameCell.createDiv({ cls: "dnd-ct-statuses" });
      for (let si = 0; si < c.statuses.length; si++) {
        const s = c.statuses[si];
        if (!s) continue;
        const badge = statusRow.createEl("span", {
          cls: "dnd-ct-status-badge",
          title: s.note ? `${s.name}: ${s.note}` : s.name,
        });
        badge.createEl("span", {
          text: s.duration !== undefined ? `${s.name} (${s.duration})` : s.name,
        });
        // ✕ remove button
        const removeBtn = badge.createEl("span", { text: "✕", cls: "dnd-ct-status-remove" });
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          tracker.removeStatus(c.id, si);
        });
      }
    }

    // ── HP cell ──
    const hpCell = row.createDiv({ cls: "dnd-ct-hp-cell" });
    this.renderHPBar(hpCell, c);

    // ── AC cell ──
    const acCell = row.createEl("span", { cls: "dnd-ct-ac-cell" });
    acCell.textContent = String(c.currentAC);
    if (c.currentAC !== c.ac) {
      acCell.title = `Base AC: ${c.ac}`;
      acCell.addClass("dnd-ct-ac-modified");
    }

    // ── Context menu button ──
    const menuBtn = row.createEl("button", {
      text: "⋮",
      cls: "dnd-ct-row-menu-btn",
      attr: { title: "Options" },
    });
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showRowContextMenu(e, tracker, c);
    });
  }

  /* ═══════════════════════ HP Bar ═══════════════════════ */

  private renderHPBar(parent: HTMLElement, c: Combatant) {
    const pct = c.maxHP > 0 ? Math.max(0, c.currentHP / c.maxHP) : 0;

    const bar = parent.createDiv({ cls: "dnd-ct-hp-bar" });
    const fill = bar.createDiv({ cls: "dnd-ct-hp-fill" });
    fill.style.width = `${pct * 100}%`;

    if (pct > 0.5) fill.addClass("dnd-ct-hp-healthy");
    else if (pct > 0.25) fill.addClass("dnd-ct-hp-wounded");
    else if (pct > 0) fill.addClass("dnd-ct-hp-critical");
    else fill.addClass("dnd-ct-hp-dead");

    // Temp HP overlay
    if (c.tempHP > 0) {
      const tempPct = Math.min(1, c.tempHP / c.maxHP);
      const tempFill = bar.createDiv({ cls: "dnd-ct-hp-temp" });
      tempFill.style.width = `${tempPct * 100}%`;
    }

    // Text overlay
    const hpText = parent.createEl("span", { cls: "dnd-ct-hp-text" });
    let text = `${c.currentHP}/${c.maxHP}`;
    if (c.tempHP > 0) text += ` (+${c.tempHP})`;
    hpText.textContent = text;
  }

  /* ═══════════════════════ Statblock Display ═══════════════════════ */

  /** Toggle the inline statblock panel for a creature. */
  private toggleStatblock(creatureName: string) {
    if (this.activeStatblockName === creatureName) {
      this.activeStatblockName = null;
      if (this.statblockPanel) this.statblockPanel.empty();
    } else {
      this.activeStatblockName = creatureName;
      this.renderStatblockInPanel(creatureName);
    }
  }

  /** Render a Fantasy Statblocks code block into the inline panel. */
  private async renderStatblockInPanel(creatureName: string) {
    if (!this.statblockPanel) return;
    this.statblockPanel.empty();

    const header = this.statblockPanel.createDiv({ cls: "dnd-ct-statblock-header" });
    header.createEl("span", { text: creatureName, cls: "dnd-ct-statblock-title" });
    const closeBtn = header.createEl("button", { text: "✕", cls: "dnd-ct-statblock-close" });
    closeBtn.addEventListener("click", () => {
      this.activeStatblockName = null;
      if (this.statblockPanel) this.statblockPanel.empty();
    });

    const content = this.statblockPanel.createDiv({ cls: "dnd-ct-statblock-content" });
    const markdown = "```statblock\ncreature: " + creatureName + "\n```";
    await MarkdownRenderer.render(this.app, markdown, content, "", this);
  }

  /** Open a note in a split leaf below the tracker (for PCs). */
  private async openNote(notePath: string) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      new Notice("Note not found");
      return;
    }
    const newLeaf = this.app.workspace.createLeafBySplit(this.leaf, "horizontal", false);
    await newLeaf.openFile(file, { state: { mode: "preview" } });
  }

  /* ═══════════════════════ Player View Projection ═══════════════════════ */

  private async openPlayerView(evt?: MouseEvent) {
    const pm = this.plugin.projectionManager;
    if (!pm) { new Notice("Projection manager not available"); return; }

    const screens = await enumerateScreens();
    if (screens.length === 0) { new Notice("No screens detected"); return; }

    const occupied = pm.getOccupiedScreenKeys();

    // Check if a combat view is already projected
    for (const proj of pm.getLiveProjections()) {
      if (proj.contentType === 'combat') {
        new Notice("Combat player view already projected");
        return;
      }
    }

    if (screens.length <= 1) {
      const screen = screens[0]!;
      const sKey = screenKey(screen);
      if (occupied.has(sKey)) {
        // Screen occupied by a map — offer to switch
        const menu = new Menu();
        menu.addItem((item) =>
          item.setTitle(`🔄 Switch ${screen.label} to Combat View`).onClick(async () => {
            await pm.projectCombatView(screen);
            this.render();
          })
        );
        if (evt) menu.showAtMouseEvent(evt);
        else menu.showAtPosition({ x: 100, y: 100 });
      } else {
        await pm.projectCombatView(screen);
        this.render();
      }
      return;
    }

    // Multi-screen — show menu with available + switch options
    const menu = new Menu();
    for (const screen of screens) {
      const sKey = screenKey(screen);
      const isOccupied = occupied.has(sKey);
      const label = `${screen.isPrimary ? '🖥️' : '🖵'} ${screen.label} (${screen.width}×${screen.height})`;

      if (isOccupied) {
        menu.addItem((item) =>
          item.setTitle(`🔄 Switch ${screen.label} to Combat View`).onClick(async () => {
            await pm.projectCombatView(screen);
            this.render();
          })
        );
      } else {
        menu.addItem((item) =>
          item.setTitle(label).onClick(async () => {
            await pm.projectCombatView(screen);
            this.render();
          })
        );
      }
    }
    if (evt) {
      menu.showAtMouseEvent(evt);
    } else {
      menu.showAtPosition({ x: 100, y: 100 });
    }
  }

  /* ═══════════════════════ Row Context Menu ═══════════════════════ */

  private showRowContextMenu(e: MouseEvent, tracker: CombatTracker, c: Combatant) {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle("💔 Set Health / Status").setIcon("heart").onClick(() => {
        new HPAndStatusModal(this.app, c, tracker).open();
      }),
    );

    menu.addItem((item) =>
      item.setTitle("✏️ Edit").setIcon("pencil").onClick(() => {
        new CombatantEditModal(this.app, c, tracker).open();
      }),
    );

    menu.addSeparator();

    const isEnabled = c.enabled ?? true;
    menu.addItem((item) =>
      item
        .setTitle(c.hidden ? "👁 Show to Players" : "👁‍🗨 Hide from Players")
        .setIcon(c.hidden ? "eye" : "eye-off")
        .onClick(() => tracker.toggleHidden(c.id)),
    );

    menu.addItem((item) =>
      item
        .setTitle(isEnabled ? "⏸ Disable" : "▶ Enable")
        .setIcon(isEnabled ? "pause" : "play")
        .onClick(() => tracker.toggleEnabled(c.id)),
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("🗑️ Remove")
        .setIcon("trash")
        .onClick(() => tracker.removeCombatant(c.id)),
    );

    menu.showAtMouseEvent(e);
  }

  /* ═══════════════════════ Options Menu ═══════════════════════ */

  private showOptionsMenu(e: MouseEvent, tracker: CombatTracker, state: CombatState) {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle("➕ Add Creature").setIcon("plus").onClick(() => {
        new AddCreatureModal(this.app, tracker).open();
      }),
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle("❤️ Reset HP & Status").setIcon("heart").onClick(() => {
        tracker.resetHPAndStatuses();
      }),
    );

    menu.addItem((item) =>
      item.setTitle("🎲 Re-roll Initiatives").setIcon("dice").onClick(() => {
        tracker.rerollAllInitiative();
      }),
    );

    menu.addItem((item) =>
      item
        .setTitle(tracker.sortAscending ? "↓ Sort Descending" : "↑ Sort Ascending")
        .setIcon("arrow-up-down")
        .onClick(() => tracker.toggleSortOrder()),
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle("💾 Save Combat").setIcon("save").onClick(() => {
        tracker.saveCombat();
      }),
    );

    menu.addItem((item) =>
      item.setTitle("📂 Load Encounter").setIcon("folder-open").onClick(() => {
        new LoadEncounterModal(this.app, this.plugin).open();
      }),
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("🏁 End Combat")
        .setIcon("flag")
        .onClick(() => {
          new ConfirmEndCombatModal(this.app, tracker).open();
        }),
    );

    menu.showAtMouseEvent(e);
  }
}

/* ════════════════════════════════════════════════════════════════
 * Helper Modals
 * ════════════════════════════════════════════════════════════════ */

/** Set initiative for a single combatant. */
class SetInitiativeModal extends Modal {
  private value = "";

  constructor(app: any, private combatant: Combatant, private tracker: CombatTracker) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `Set Initiative: ${this.combatant.display}` });

    new Setting(contentEl).setName("Initiative").addText((text) => {
      text
        .setPlaceholder("e.g. 15")
        .setValue(String(this.combatant.initiative || ""))
        .onChange((v) => (this.value = v));
      text.inputEl.type = "number";
      text.inputEl.focus();
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.save();
      });
    });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Set").setCta().onClick(() => this.save()))
      .addButton((btn) =>
        btn.setButtonText("🎲 Roll").onClick(() => {
          this.tracker.rollInitiativeFor(this.combatant.id);
          this.close();
        }),
      );
  }

  private save() {
    const num = parseInt(this.value, 10);
    if (!isNaN(num)) this.tracker.setInitiative(this.combatant.id, num);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Combined Health & Status modal — covers damage, heal, temp HP, max HP, AC, and status effects. */
class HPAndStatusModal extends Modal {
  constructor(app: any, private combatant: Combatant, private tracker: CombatTracker) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-ct-hp-status-modal");
    contentEl.createEl("h3", { text: `${this.combatant.display}` });

    // Current state
    const info = contentEl.createDiv({ cls: "dnd-ct-modal-info" });
    info.createEl("span", { text: `HP: ${this.combatant.currentHP}/${this.combatant.maxHP}` });
    if (this.combatant.tempHP > 0) info.createEl("span", { text: ` (+${this.combatant.tempHP} temp)` });
    info.createEl("span", { text: ` | AC: ${this.combatant.currentAC}` });

    // ── Damage ──
    new Setting(contentEl).setName("Damage").addText((text) => {
      text.setPlaceholder("Amount");
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.dataset["field"] = "damage";
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const val = parseInt((e.target as HTMLInputElement).value, 10);
          if (!isNaN(val) && val > 0) { this.tracker.applyDamage(this.combatant.id, val); this.close(); }
        }
      });
    }).addButton((btn) => btn.setButtonText("Apply").onClick(() => {
      const input = contentEl.querySelector("[data-field='damage']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val) && val > 0) { this.tracker.applyDamage(this.combatant.id, val); this.close(); }
    }));

    // ── Heal ──
    new Setting(contentEl).setName("Heal").addText((text) => {
      text.setPlaceholder("Amount");
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.dataset["field"] = "heal";
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const val = parseInt((e.target as HTMLInputElement).value, 10);
          if (!isNaN(val) && val > 0) { this.tracker.applyHealing(this.combatant.id, val); this.close(); }
        }
      });
    }).addButton((btn) => btn.setButtonText("Apply").onClick(() => {
      const input = contentEl.querySelector("[data-field='heal']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val) && val > 0) { this.tracker.applyHealing(this.combatant.id, val); this.close(); }
    }));

    // ── Set HP directly ──
    new Setting(contentEl).setName("Set HP").addText((text) => {
      text.setPlaceholder(String(this.combatant.currentHP));
      text.setValue(String(this.combatant.currentHP));
      text.inputEl.type = "number";
      text.inputEl.dataset["field"] = "setHP";
    }).addButton((btn) => btn.setButtonText("Set").onClick(() => {
      const input = contentEl.querySelector("[data-field='setHP']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val)) { this.tracker.setHP(this.combatant.id, val); this.close(); }
    }));

    // ── Temp HP ──
    new Setting(contentEl).setName("Temp HP").addText((text) => {
      text.setPlaceholder("0");
      text.setValue(String(this.combatant.tempHP));
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.dataset["field"] = "tempHP";
    }).addButton((btn) => btn.setButtonText("Set").onClick(() => {
      const input = contentEl.querySelector("[data-field='tempHP']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val)) { this.tracker.setTempHP(this.combatant.id, val); this.close(); }
    }));

    // ── Modify Max HP ──
    new Setting(contentEl).setName("Modify Max HP").setDesc(`Current max: ${this.combatant.maxHP}`).addText((text) => {
      text.setPlaceholder("+5 or -3");
      text.inputEl.dataset["field"] = "maxHP";
    }).addButton((btn) => btn.setButtonText("Apply").onClick(() => {
      const input = contentEl.querySelector("[data-field='maxHP']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val) && val !== 0) { this.tracker.modifyMaxHP(this.combatant.id, val); this.close(); }
    }));

    // ── Modify AC ──
    new Setting(contentEl).setName("Modify AC").setDesc(`Base: ${this.combatant.ac}, Current: ${this.combatant.currentAC}`).addText((text) => {
      text.setPlaceholder("+2 or -1");
      text.inputEl.dataset["field"] = "modAC";
    }).addButton((btn) => btn.setButtonText("Apply").onClick(() => {
      const input = contentEl.querySelector("[data-field='modAC']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val) && val !== 0) { this.tracker.modifyAC(this.combatant.id, val); this.close(); }
    }));

    contentEl.createEl("hr");
    contentEl.createEl("h4", { text: "⚡ Status Effects" });

    // Current statuses
    if (this.combatant.statuses.length > 0) {
      const currentStatuses = contentEl.createDiv({ cls: "dnd-ct-statuses" });
      for (let si = 0; si < this.combatant.statuses.length; si++) {
        const s = this.combatant.statuses[si];
        if (!s) continue;
        const badge = currentStatuses.createEl("span", {
          cls: "dnd-ct-status-badge",
          title: s.note ? `${s.name}: ${s.note}` : s.name,
        });
        badge.createEl("span", {
          text: s.duration !== undefined ? `${s.name} (${s.duration})` : s.name,
        });
        const removeBtn = badge.createEl("span", { text: "✕", cls: "dnd-ct-status-remove" });
        removeBtn.addEventListener("click", () => this.tracker.removeStatus(this.combatant.id, si));
      }
    }

    // Quick-add condition buttons (toggle: click to add, click again to remove)
    const quickRow = contentEl.createDiv({ cls: "dnd-ct-quick-statuses" });
    const conditions = [
      "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
      "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned",
      "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
      "Concentrating",
    ];
    const activeConditions = new Set(this.combatant.statuses.map((s) => s.name));
    for (const cond of conditions) {
      const isActive = activeConditions.has(cond);
      const btn = quickRow.createEl("button", {
        text: cond,
        cls: `dnd-ct-quick-status-btn ${isActive ? "dnd-ct-quick-status-btn-active" : ""}`,
      });
      btn.addEventListener("click", () => {
        const idx = this.combatant.statuses.findIndex((s) => s.name === cond);
        if (idx >= 0) {
          this.tracker.removeStatus(this.combatant.id, idx);
        } else {
          this.tracker.addStatus(this.combatant.id, { name: cond });
        }
        this.close();
        new StatusModal(this.app, this.combatant, this.tracker).open();
      });
    }

    // Custom status
    contentEl.createEl("h5", { text: "Custom Status" });
    let customName = "";
    let customDuration = "";
    let customNote = "";

    new Setting(contentEl).setName("Name").addText((text) =>
      text.setPlaceholder("Status name").onChange((v) => (customName = v)),
    );
    new Setting(contentEl).setName("Duration (rounds)").setDesc("Leave empty for indefinite").addText((text) => {
      text.setPlaceholder("e.g. 10").onChange((v) => (customDuration = v));
      text.inputEl.type = "number";
      text.inputEl.min = "1";
    });
    new Setting(contentEl).setName("Note").addText((text) =>
      text.setPlaceholder("e.g. DC 15 CON save").onChange((v) => (customNote = v)),
    );
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Add Status").setCta().onClick(() => {
        if (!customName.trim()) { new Notice("Enter a status name"); return; }
        const effect: StatusEffect = { name: customName.trim() };
        if (customDuration) { const d = parseInt(customDuration, 10); if (!isNaN(d) && d > 0) effect.duration = d; }
        if (customNote.trim()) effect.note = customNote.trim();
        this.tracker.addStatus(this.combatant.id, effect);
        this.close();
      }),
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Edit core combatant properties (name, HP, AC, modifier, friendly). */
class CombatantEditModal extends Modal {
  private editName: string;
  private editMaxHP: string;
  private editAC: string;
  private editModifier: string;
  private editFriendly: boolean;

  constructor(app: any, private combatant: Combatant, private tracker: CombatTracker) {
    super(app);
    this.editName = combatant.display;
    this.editMaxHP = String(combatant.maxHP);
    this.editAC = String(combatant.ac);
    this.editModifier = String(combatant.modifier);
    this.editFriendly = combatant.friendly;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `✏️ Edit: ${this.combatant.display}` });

    new Setting(contentEl).setName("Display Name").addText((text) =>
      text.setValue(this.editName).onChange((v) => (this.editName = v)),
    );
    new Setting(contentEl).setName("Max HP").addText((text) => {
      text.setValue(this.editMaxHP).onChange((v) => (this.editMaxHP = v));
      text.inputEl.type = "number";
    });
    new Setting(contentEl).setName("Base AC").addText((text) => {
      text.setValue(this.editAC).onChange((v) => (this.editAC = v));
      text.inputEl.type = "number";
    });
    new Setting(contentEl).setName("Initiative Modifier").addText((text) => {
      text.setValue(this.editModifier).onChange((v) => (this.editModifier = v));
      text.inputEl.type = "number";
    });
    new Setting(contentEl).setName("Friendly").addToggle((toggle) =>
      toggle.setValue(this.editFriendly).onChange((v) => (this.editFriendly = v)),
    );

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Save").setCta().onClick(() => this.save()),
    );
  }

  private save() {
    // Apply changes directly to the state (via tracker's internal accessors)
    const state = this.tracker.getState();
    if (!state) { this.close(); return; }

    // We need a way to update these — use the tracker's exposed methods where available
    const newMaxHP = parseInt(this.editMaxHP, 10);
    const oldMaxHP = this.combatant.maxHP;
    if (!isNaN(newMaxHP) && newMaxHP !== oldMaxHP) {
      this.tracker.modifyMaxHP(this.combatant.id, newMaxHP - oldMaxHP);
    }

    const newAC = parseInt(this.editAC, 10);
    if (!isNaN(newAC) && newAC !== this.combatant.ac) {
      this.tracker.modifyAC(this.combatant.id, newAC - this.combatant.currentAC);
    }

    // For name, modifier, friendly — we need direct state mutation + emit
    // These are updated via updateCombatant helper on the tracker
    this.tracker.updateCombatant(this.combatant.id, {
      display: this.editName,
      modifier: parseInt(this.editModifier, 10) || 0,
      friendly: this.editFriendly,
    });

    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Add a creature mid-combat. */
class AddCreatureModal extends Modal {
  private creatureName = "";
  private hp = "10";
  private ac = "10";
  private modifier = "0";
  private count = "1";
  private friendly = false;

  constructor(app: any, private tracker: CombatTracker) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "➕ Add Creature" });

    new Setting(contentEl).setName("Name").addText((text) => {
      text.setPlaceholder("Creature name").onChange((v) => (this.creatureName = v));
      text.inputEl.focus();
    });
    new Setting(contentEl).setName("HP").addText((text) => {
      text.setValue(this.hp).onChange((v) => (this.hp = v));
      text.inputEl.type = "number";
      text.inputEl.min = "1";
    });
    new Setting(contentEl).setName("AC").addText((text) => {
      text.setValue(this.ac).onChange((v) => (this.ac = v));
      text.inputEl.type = "number";
    });
    new Setting(contentEl).setName("Init Modifier").addText((text) => {
      text.setValue(this.modifier).onChange((v) => (this.modifier = v));
      text.inputEl.type = "number";
    });
    new Setting(contentEl).setName("Count").addText((text) => {
      text.setValue(this.count).onChange((v) => (this.count = v));
      text.inputEl.type = "number";
      text.inputEl.min = "1";
    });
    new Setting(contentEl).setName("Friendly").addToggle((toggle) =>
      toggle.setValue(this.friendly).onChange((v) => (this.friendly = v)),
    );

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Add").setCta().onClick(() => this.add()),
    );
  }

  private add() {
    if (!this.creatureName.trim()) { new Notice("Enter a creature name"); return; }
    const hp = parseInt(this.hp, 10) || 10;
    const ac = parseInt(this.ac, 10) || 10;
    const mod = parseInt(this.modifier, 10) || 0;
    const count = Math.max(1, parseInt(this.count, 10) || 1);

    const colors = [
      "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
      "Pink", "Brown", "Black", "White", "Gray", "Cyan",
    ];

    for (let i = 0; i < count; i++) {
      let display = this.creatureName.trim();
      if (count > 1) display = `${display} (${colors[i % colors.length]})`;

      const id = `add-${Date.now()}-${i}`;
      this.tracker.addCombatant({
        id,
        name: this.creatureName.trim(),
        display,
        initiative: Math.floor(Math.random() * 20) + 1 + mod,
        modifier: mod,
        currentHP: hp,
        maxHP: hp,
        tempHP: 0,
        ac,
        currentAC: ac,
        player: false,
        friendly: this.friendly,
        hidden: false,
        statuses: [],
      });
    }

    new Notice(`Added ${count}× ${this.creatureName.trim()}`);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Load an encounter from the vault. */
class LoadEncounterModal extends Modal {
  plugin: DndCampaignHubPlugin;

  constructor(app: any, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "📂 Load Encounter" });

    // Find all encounter notes in the vault
    const files = this.app.vault.getMarkdownFiles();
    const encounters: TFile[] = [];
    for (const f of files) {
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache?.frontmatter?.type === "encounter") {
        encounters.push(f);
      }
    }

    if (encounters.length === 0) {
      contentEl.createEl("p", { text: "No encounter notes found." });
      return;
    }

    const listEl = contentEl.createDiv({ cls: "dnd-ct-encounter-list" });
    for (const enc of encounters) {
      const cache = this.app.metadataCache.getFileCache(enc);
      const name = cache?.frontmatter?.encounter_name || enc.basename;
      const row = listEl.createDiv({ cls: "dnd-ct-encounter-list-row" });
      row.createEl("span", { text: name, cls: "dnd-ct-encounter-list-name" });
      const openBtn = row.createEl("button", { text: "Open", cls: "dnd-ct-btn" });
      openBtn.addEventListener("click", () => {
        this.app.workspace.openLinkText(enc.path, "");
        this.close();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Confirm before ending combat. */
class ConfirmEndCombatModal extends Modal {
  constructor(app: any, private tracker: CombatTracker) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "🏁 End Combat?" });
    contentEl.createEl("p", {
      text: "This will end the current combat. Save first if you want to resume later.",
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Save & End").setCta().onClick(async () => {
          await this.tracker.saveCombat();
          this.tracker.endCombat();
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("End Without Saving").setWarning().onClick(() => {
          this.tracker.endCombat();
          this.close();
        }),
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}
