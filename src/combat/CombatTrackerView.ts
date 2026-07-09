import { ItemView, Menu, Modal, Notice, Setting, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { COMBAT_TRACKER_VIEW_TYPE, COMBAT_PLAYER_VIEW_TYPE } from "../constants";
import type { CombatTracker } from "./CombatTracker";
import type { Combatant, CombatRunActorRef, CombatState, StatusEffect, SyncPreviewEntry } from "./types";
import { enumerateScreens, screenKey, type ScreenInfo } from "../utils/ScreenEnumeration";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";
import { startEncounterFromFile } from "../encounter/renderEncounterView";

type CombatLauncherEntry =
  | { kind: "saved"; name: string; label: string; detail: string; scoreText: string }
  | { kind: "encounter"; file: TFile; label: string; detail: string; scoreText: string };

function compactSearchText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function scoreCombatLauncherEntry(entry: CombatLauncherEntry, query: string): number {
  if (!query.trim()) return 1;
  const haystack = compactSearchText(`${entry.label} ${entry.detail}`);
  const needle = compactSearchText(query.trim());
  if (haystack.includes(needle)) return 100 + needle.length;

  let score = 0;
  let pos = 0;
  for (const ch of needle) {
    const hit = haystack.indexOf(ch, pos);
    if (hit < 0) return 0;
    score += Math.max(1, 12 - (hit - pos));
    pos = hit + 1;
  }
  return score;
}

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
  private _projectionUnsub: (() => void) | null = null;

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
    this._projectionUnsub = this.plugin.projectionManager?.onChange(() => this.render()) ?? null;
    await this.render();
  }

  onClose() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this._projectionUnsub) {
      this._projectionUnsub();
      this._projectionUnsub = null;
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
    this.renderRecentActions(container, tracker);
    this.renderColumnHeaders(container);
    this.renderCombatantList(container, tracker, state);
  }

  /* ═══════════════════════ No Active Combat ═══════════════════════ */

  private renderNoCombat(container: HTMLElement) {
    const empty = container.createDiv({ cls: "dnd-ct-empty" });
    empty.createEl("p", { text: "No active combat." });
    empty.createEl("p", {
      text: "Search encounters to start, or resume a saved combat.",
      cls: "dnd-ct-hint",
    });

    const launcher = container.createDiv({ cls: "dnd-ct-launcher" });
    const searchInput = launcher.createEl("input", {
      cls: "dnd-ct-launcher-search",
      attr: {
        type: "search",
        placeholder: "Search saved combats and encounter notes...",
        spellcheck: "false",
      },
    });
    const resultList = launcher.createDiv({ cls: "dnd-ct-launcher-results" });

    const entries: CombatLauncherEntry[] = [];
    const saved = this.plugin.settings.combatStates || {};
    for (const name of Object.keys(saved)) {
        const info = this.plugin.combatTracker.getSavedStateInfo(name);
        if (!info) continue;
      entries.push({
        kind: "saved",
        name,
        label: name,
        detail: `Round ${info.round}, ${info.combatantCount} combatants`,
        scoreText: `${name} saved combat round ${info.round}`,
      });
    }

    const encounterFiles = this.app.vault.getMarkdownFiles()
      .filter((file) => this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "encounter")
      .sort((a, b) => a.basename.localeCompare(b.basename));
    for (const file of encounterFiles) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const label = fm?.encounter_name || fm?.name || file.basename;
      const creatures = Array.isArray(fm?.creatures) ? fm.creatures.length : 0;
      const partyText = fm?.include_party === false ? "no party" : "party included";
      entries.push({
        kind: "encounter",
        file,
        label,
        detail: `${creatures} creature${creatures === 1 ? "" : "s"} • ${partyText} • ${file.parent?.path || "Vault"}`,
        scoreText: `${label} ${file.path}`,
      });
    }

    const renderResults = () => {
      resultList.empty();
      const query = searchInput.value;
      const filtered = entries
        .map((entry) => ({
          entry,
          score: scoreCombatLauncherEntry({ ...entry, detail: `${entry.detail} ${entry.scoreText}` }, query),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
        .slice(0, 30)
        .map((item) => item.entry);

      if (filtered.length === 0) {
        resultList.createDiv({
          cls: "dnd-ct-launcher-empty",
          text: entries.length === 0 ? "No saved combats or encounter notes found." : "No matches.",
        });
        return;
      }

      for (const entry of filtered) {
        const row = resultList.createDiv({ cls: `dnd-ct-launcher-row dnd-ct-launcher-${entry.kind}` });
        const main = row.createDiv({ cls: "dnd-ct-launcher-main" });
        main.createEl("span", {
          cls: "dnd-ct-launcher-kind",
          text: entry.kind === "saved" ? "Saved" : "Encounter",
        });
        main.createEl("span", { cls: "dnd-ct-launcher-title", text: entry.label });
        main.createEl("span", { cls: "dnd-ct-launcher-detail", text: entry.detail });

        const actions = row.createDiv({ cls: "dnd-ct-launcher-actions" });
        if (entry.kind === "saved") {
          const resumeBtn = actions.createEl("button", { text: "▶ Resume", cls: "dnd-ct-btn dnd-ct-btn-primary" });
          resumeBtn.addEventListener("click", () => this.plugin.combatTracker.resumeCombat(entry.name));
        } else {
          const runBtn = actions.createEl("button", { text: "⚔ Run", cls: "dnd-ct-btn dnd-ct-btn-primary" });
          runBtn.addEventListener("click", () => {
            void startEncounterFromFile(this.plugin, entry.file);
          });
          const openBtn = actions.createEl("button", { text: "Open", cls: "dnd-ct-btn" });
          openBtn.addEventListener("click", () => {
            void this.app.workspace.openLinkText(entry.file.path, "");
          });
        }
      }
    };

    searchInput.addEventListener("input", renderResults);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = resultList.querySelector("button.dnd-ct-btn-primary") as HTMLButtonElement | null;
      first?.click();
    });

    renderResults();
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

      // Start Chase button
      const chaseBtn = toolbar.createEl("button", {
        text: "🏃",
        cls: "dnd-ct-toolbar-btn",
        attr: { title: "Start Chase from Combat" },
      });
      chaseBtn.addEventListener("click", () => {
        this.plugin.startPursuitFromCombat();
      });
    }

    const undoBtn = toolbar.createEl("button", {
      text: "↶",
      cls: "dnd-ct-toolbar-btn",
      attr: { title: "Undo Last Action" },
    });
    undoBtn.disabled = !tracker.canUndo();
    undoBtn.addEventListener("click", () => tracker.undoLastAction());

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
        // Stop all combat projections (async — UI updates via onChange)
        for (const proj of pm.getLiveProjections()) {
          if (proj.contentType === "combat") {
            void pm.stopProjectionOnScreen(screenKey(proj.screen));
          }
        }
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

  private renderRecentActions(container: HTMLElement, tracker: CombatTracker) {
    const actions = tracker.getRecentActions(4);
    if (actions.length === 0) return;

    const panel = container.createDiv({ cls: "dnd-ct-recent-actions" });
    const header = panel.createDiv({ cls: "dnd-ct-recent-header" });
    header.createEl("span", { text: "Recent", cls: "dnd-ct-recent-title" });
    const undoBtn = header.createEl("button", {
      text: "↶ Undo",
      cls: "dnd-ct-recent-undo",
      attr: { title: "Undo latest action" },
    });
    undoBtn.addEventListener("click", () => tracker.undoLastAction());

    const list = panel.createDiv({ cls: "dnd-ct-recent-list" });
    for (const action of actions) {
      const row = list.createDiv({ cls: `dnd-ct-recent-action dnd-ct-recent-${action.kind}` });
      const main = row.createDiv({ cls: "dnd-ct-recent-action-main" });
      main.createEl("span", { text: action.label, cls: "dnd-ct-recent-action-label" });
      if (action.detail) {
        main.createEl("span", { text: action.detail, cls: "dnd-ct-recent-action-detail" });
      }
    }
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
    const alive = state.combatants.filter(c => (c.enabled ?? true) && !this.plugin.combatTracker.isDefeatedHostile(c));
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
    let draggedCombatantId: string | null = null;
    const defeatedHostiles: Array<{ combatant: Combatant; index: number }> = [];

    for (let i = 0; i < state.combatants.length; i++) {
      const c = state.combatants[i];
      if (!c) continue;
      if (tracker.isDefeatedHostile(c)) {
        defeatedHostiles.push({ combatant: c, index: i });
        continue;
      }
      const isActive = state.started && i === state.turnIndex;
      this.renderCombatantRow(list, tracker, c, isActive, state, {
        canDragTie: state.started && state.combatants.some(other => other.id !== c.id && other.initiative === c.initiative),
        getDraggedId: () => draggedCombatantId,
        setDraggedId: (id) => {
          draggedCombatantId = id;
        },
      });
    }

    if (defeatedHostiles.length > 0) {
      const details = container.createEl("details", { cls: "dnd-ct-defeated-section" });
      const summary = details.createEl("summary", { cls: "dnd-ct-defeated-summary" });
      summary.textContent = `Defeated enemies (${defeatedHostiles.length})`;
      const defeatedList = details.createDiv({ cls: "dnd-ct-list dnd-ct-defeated-list" });
      defeatedHostiles.forEach(({ combatant, index }) => {
        this.renderCombatantRow(defeatedList, tracker, combatant, state.started && index === state.turnIndex, state, {
          canDragTie: false,
          getDraggedId: () => null,
          setDraggedId: () => {},
        });
      });
    }
  }

  private renderCombatantRow(
    list: HTMLElement,
    tracker: CombatTracker,
    c: Combatant,
    isActive: boolean,
    state: CombatState,
    dragState: {
      canDragTie: boolean;
      getDraggedId: () => string | null;
      setDraggedId: (id: string | null) => void;
    },
  ) {
    const isEnabled = c.enabled ?? true;
    const isDead = c.dead ?? false;
    const isDown = c.currentHP <= 0;

    const rowClasses = ["dnd-ct-row"];
    if (isActive) rowClasses.push("dnd-ct-row-active");
    if (isDead) rowClasses.push("dnd-ct-row-dead");
    else if (isDown) rowClasses.push("dnd-ct-row-dead");
    if (c.hidden) rowClasses.push("dnd-ct-row-hidden");
    if (!isEnabled) rowClasses.push("dnd-ct-row-disabled");

    const row = list.createDiv({ cls: rowClasses.join(" ") });
    row.dataset.combatantId = c.id;

    if (dragState.canDragTie) {
      row.draggable = true;
      row.addClass("dnd-ct-row-draggable");
      row.title = "Drag onto another combatant with the same initiative to swap tie order";
      row.addEventListener("dragstart", (e) => {
        dragState.setDraggedId(c.id);
        row.addClass("dnd-ct-row-dragging");
        e.dataTransfer?.setData("text/plain", c.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        dragState.setDraggedId(null);
        row.removeClass("dnd-ct-row-dragging");
      });
      row.addEventListener("dragover", (e) => {
        const draggedId = dragState.getDraggedId();
        const dragged = state.combatants.find(combatant => combatant.id === draggedId);
        if (!dragged || dragged.id === c.id || dragged.initiative !== c.initiative) return;
        e.preventDefault();
        row.addClass("dnd-ct-row-drag-over");
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("dragleave", () => {
        row.removeClass("dnd-ct-row-drag-over");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.removeClass("dnd-ct-row-drag-over");
        const draggedId = dragState.getDraggedId() || e.dataTransfer?.getData("text/plain") || null;
        if (!draggedId) return;
        tracker.swapCombatantsWithSameInitiative(draggedId, c.id);
        dragState.setDraggedId(null);
      });
    }

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

    // Hidden-from-players indicator
    if (c.hidden) {
      nameCell.createEl("span", { text: "👁", cls: "dnd-ct-marker dnd-ct-marker-hidden", attr: { title: "Hidden from players" } });
    }

    // Name (clickable → statblock below)
    const nameEl = nameCell.createEl("span", {
      text: c.display,
      cls: `dnd-ct-name ${c.player ? "dnd-ct-name-player" : ""} ${c.friendly && !c.player ? "dnd-ct-name-friendly" : ""} ${!c.player && !c.friendly ? "dnd-ct-name-enemy" : ""}`,
    });

    if (c.player && c.notePath) {
      // PCs: show Fantasy Statblock if available, otherwise open full note
      nameEl.addClass("dnd-ct-name-link");
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openStatblockLeaf(c.name, c.notePath);
      });
    } else if (!c.player) {
      // Creatures/NPCs: show Fantasy Statblock in split leaf (or note fallback)
      nameEl.addClass("dnd-ct-name-link");
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openStatblockLeaf(c.name, c.notePath);
      });
    }

    // Status badges (inline under name)
    if (c.statuses.length > 0 || c.deathSaves) {
      const statusRow = nameCell.createDiv({ cls: "dnd-ct-statuses" });

      // Death save indicators
      if (c.deathSaves) {
        const dsContainer = statusRow.createEl("span", { cls: "dnd-ct-death-saves" });
        // Successes (green pips)
        for (let i = 0; i < 3; i++) {
          dsContainer.createEl("span", {
            cls: `dnd-ct-ds-pip dnd-ct-ds-success ${i < c.deathSaves.successes ? "dnd-ct-ds-filled" : ""}`,
            text: i < c.deathSaves.successes ? "✔" : "○",
          });
        }
        dsContainer.createEl("span", { cls: "dnd-ct-ds-divider", text: "|" });
        // Failures (red pips)
        for (let i = 0; i < 3; i++) {
          dsContainer.createEl("span", {
            cls: `dnd-ct-ds-pip dnd-ct-ds-failure ${i < c.deathSaves.failures ? "dnd-ct-ds-filled" : ""}`,
            text: i < c.deathSaves.failures ? "✘" : "○",
          });
        }
      }

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

  private static readonly STATBLOCK_TEMP_PATH = "_statblock_preview.md";

  /** Check whether the Fantasy Statblocks plugin is installed and enabled. */
  private hasFantasyStatblocks(): boolean {
    return !!(this.app as any).plugins?.getPlugin?.("obsidian-5e-statblocks");
  }

  /** Open a creature statblock in a split leaf using a real MarkdownView. */
  private async openStatblockLeaf(creatureName: string, notePath?: string) {
    // If Fantasy Statblocks is not available, fall back to the creature note
    if (!this.hasFantasyStatblocks()) {
      if (notePath) {
        await this.openNote(notePath);
        return;
      }
      new Notice("Install the \"Fantasy Statblocks\" plugin to view rendered statblocks.");
      return;
    }

    const tempPath = CombatTrackerView.STATBLOCK_TEMP_PATH;
    const content = "```statblock\ncreature: " + creatureName + "\n```";

    // Write (or overwrite) the temp preview file
    const existing = this.app.vault.getAbstractFileByPath(tempPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(tempPath, content);
    }
    const file = this.app.vault.getAbstractFileByPath(tempPath) as TFile;

    // Reuse an existing preview leaf if one is already showing this file
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if ((leaf.view as any)?.file?.path === tempPath) {
        await leaf.openFile(file, { state: { mode: "preview" } });
        this.app.workspace.revealLeaf(leaf);
        this.restrictTabMenu(leaf);
        return;
      }
    }

    // Otherwise split below the combat tracker
    const newLeaf = this.app.workspace.createLeafBySplit(this.leaf, "horizontal", false);
    await newLeaf.openFile(file, { state: { mode: "preview" } });
    this.restrictTabMenu(newLeaf);
  }

  /** Replace the default tab right-click menu with only a "Close" option. */
  private restrictTabMenu(leaf: WorkspaceLeaf) {
    const tabHeader = (leaf as any).tabHeaderEl as HTMLElement | undefined;
    if (!tabHeader) return;

    const handler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) =>
        item.setTitle("Close").setIcon("x").onClick(() => leaf.detach()),
      );
      menu.showAtMouseEvent(e);
    };

    // Remove any previously attached handler
    const prev = (tabHeader as any)._dndStatblockCtx as ((e: MouseEvent) => void) | undefined;
    if (prev) tabHeader.removeEventListener("contextmenu", prev, true);
    (tabHeader as any)._dndStatblockCtx = handler;
    tabHeader.addEventListener("contextmenu", handler, true);
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
          })
        );
        if (evt) menu.showAtMouseEvent(evt);
        else menu.showAtPosition({ x: 100, y: 100 });
      } else {
        await pm.projectCombatView(screen);
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
          })
        );
      } else {
        menu.addItem((item) =>
          item.setTitle(label).onClick(async () => {
            await pm.projectCombatView(screen);
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

    // Death save options (PCs only, at 0 HP, not dead)
    if (c.player && c.currentHP <= 0 && !c.dead && c.deathSaves) {
      menu.addItem((item) =>
        item.setTitle("🎲 Roll Death Save").setIcon("dice").onClick(() => {
          tracker.rollDeathSave(c.id);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("✅ Death Save Success").setIcon("check").onClick(() => {
          tracker.addDeathSaveSuccess(c.id);
        }),
      );
      menu.addItem((item) =>
        item.setTitle("❌ Death Save Failure").setIcon("x").onClick(() => {
          tracker.addDeathSaveFailure(c.id);
        }),
      );
      menu.addSeparator();
    }

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

    if (c.player && c.notePath) {
      menu.addSeparator();
      menu.addItem((item) =>
        item.setTitle("\u2193 Sync HP to Note").setIcon("arrow-down-to-line").onClick(async () => {
          const entries = await tracker.buildSyncPreview([c.id]);
          if (!entries.length) return;
          if (!entries[0]!.changed) {
            new Notice(`${c.display}: HP already matches note`);
            return;
          }
          new ConfirmSyncModal(this.app, tracker, entries, "toNotes").open();
        }),
      );
      menu.addItem((item) =>
        item.setTitle("\u2191 Refresh HP from Note").setIcon("refresh-cw").onClick(async () => {
          const entries = await tracker.buildSyncPreview([c.id]);
          if (!entries.length) return;
          if (!entries[0]!.changed) {
            new Notice(`${c.display}: HP already matches tracker`);
            return;
          }
          new ConfirmSyncModal(this.app, tracker, entries, "fromNotes").open();
        }),
      );
    }

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

    // Place on Map — only shown when a map is active
    const mc = this.plugin.mapController;
    if (mc.isMapActive()) {
      const alreadyOnMap = mc.isCombatantOnMap(c.name, c.tokenId, c.display);
      menu.addItem((item) =>
        item
          .setTitle(alreadyOnMap ? "📍 Already on Map" : "📍 Place on Map")
          .setIcon("map-pin")
          .setDisabled(alreadyOnMap)
          .onClick(async () => {
            const result = await mc.placeToken({
              name: c.name,
              display: c.display,
              tokenId: c.tokenId,
              notePath: c.notePath,
              player: c.player,
              friendly: c.friendly,
            });
            if (result.success) {
              new Notice(`📍 Placed "${c.display}" on the map`);
            } else {
              new Notice(`⚠️ ${result.reason}`);
            }
          }),
      );
    }

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
    const hasLoadedEncounter = !!state.encounterPath;

    menu.addItem((item) =>
      item
        .setTitle("↶ Undo Last Action")
        .setIcon("undo-2")
        .setDisabled(!tracker.canUndo())
        .onClick(() => tracker.undoLastAction()),
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle(hasLoadedEncounter ? "➕ Add Creature to Encounter" : "➕ Add Creature").setIcon("plus").onClick(() => {
        new AddCreatureModal(this.app, this.plugin, tracker).open();
      }),
    );

    menu.addItem((item) =>
      item.setTitle(hasLoadedEncounter ? "➕ Add Party Member to Encounter" : "➕ Add Party Member").setIcon("user-plus").onClick(() => {
        new AddPartyMemberModal(this.app, this.plugin, tracker).open();
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
      item.setTitle("\u2193 Sync PCs to Notes").setIcon("arrow-down-to-line").onClick(async () => {
        const entries = await tracker.buildSyncPreview();
        if (!entries.length) { new Notice("No PCs with linked notes"); return; }
        new ConfirmSyncModal(this.app, tracker, entries, "toNotes").open();
      }),
    );

    menu.addItem((item) =>
      item.setTitle("\u2191 Refresh PCs from Notes").setIcon("refresh-cw").onClick(async () => {
        const entries = await tracker.buildSyncPreview();
        if (!entries.length) { new Notice("No PCs with linked notes"); return; }
        new ConfirmSyncModal(this.app, tracker, entries, "fromNotes").open();
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
  private sourceCombatantId: string | null = null;
  private targetCombatantId: string;

  constructor(app: any, private combatant: Combatant, private tracker: CombatTracker) {
    super(app);
    this.targetCombatantId = combatant.id;
    this.sourceCombatantId = tracker.getDefaultEventSourceId();
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

    const combatants = this.tracker.getState()?.combatants || [];
    const sourceOptions = combatants.filter((c) => c.enabled ?? true);
    const targetOptions = combatants.filter((c) => c.enabled ?? true);
    const sourceTargetDetails = contentEl.createEl("details", { cls: "dnd-ct-source-target-details" });
    const sourceTargetSummary = sourceTargetDetails.createEl("summary", { text: "Source / target overrides" });
    sourceTargetSummary.title = "Defaults to current turn as source and clicked row as target";

    new Setting(sourceTargetDetails)
      .setName("Source")
      .setDesc("Who caused this HP change?")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Environment / unknown");
        sourceOptions.forEach((c) => dropdown.addOption(c.id, c.display));
        dropdown.setValue(this.sourceCombatantId || "");
        dropdown.onChange((value) => {
          this.sourceCombatantId = value || null;
        });
      });

    new Setting(sourceTargetDetails)
      .setName("Target")
      .setDesc("Who receives the damage or healing?")
      .addDropdown((dropdown) => {
        targetOptions.forEach((c) => dropdown.addOption(c.id, c.display));
        dropdown.setValue(this.targetCombatantId);
        dropdown.onChange((value) => {
          this.targetCombatantId = value || this.combatant.id;
        });
      });

    // ── Damage ──
    new Setting(contentEl).setName("Damage").addText((text) => {
      text.setPlaceholder("Amount");
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.dataset["field"] = "damage";
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const val = parseInt((e.target as HTMLInputElement).value, 10);
          if (!isNaN(val) && val > 0) { this.tracker.applyDamage(this.targetCombatantId, val, false, this.sourceCombatantId); this.close(); }
        }
      });
    }).addButton((btn) => btn.setButtonText("Apply").onClick(() => {
      const input = contentEl.querySelector("[data-field='damage']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val) && val > 0) { this.tracker.applyDamage(this.targetCombatantId, val, false, this.sourceCombatantId); this.close(); }
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
          if (!isNaN(val) && val > 0) { this.tracker.applyHealing(this.targetCombatantId, val, this.sourceCombatantId); this.close(); }
        }
      });
    }).addButton((btn) => btn.setButtonText("Apply").onClick(() => {
      const input = contentEl.querySelector("[data-field='heal']") as HTMLInputElement;
      const val = parseInt(input?.value ?? "0", 10);
      if (!isNaN(val) && val > 0) { this.tracker.applyHealing(this.targetCombatantId, val, this.sourceCombatantId); this.close(); }
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

    // Container for statuses + quick buttons — re-rendered on toggle
    const statusContainer = contentEl.createDiv();

    /** Re-sync this.combatant from tracker state (getState returns copies). */
    const refreshCombatant = () => {
      const fresh = this.tracker.getState()?.combatants.find((c) => c.id === this.combatant.id);
      if (fresh) this.combatant = fresh;
    };

    const renderStatusSection = () => {
      statusContainer.empty();

      // Current statuses
      if (this.combatant.statuses.length > 0) {
        const currentStatuses = statusContainer.createDiv({ cls: "dnd-ct-statuses" });
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
          removeBtn.addEventListener("click", () => {
            this.tracker.removeStatus(this.combatant.id, si);
            refreshCombatant();
            renderStatusSection();
          });
        }
      }

      // Quick-add condition buttons (toggle: click to add, click again to remove)
      const quickRow = statusContainer.createDiv({ cls: "dnd-ct-quick-statuses" });
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
          refreshCombatant();
          renderStatusSection();
        });
      }
    };
    renderStatusSection();

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
async function appendCreaturesToActiveEncounter(
  app: any,
  tracker: CombatTracker,
  creatures: Array<Record<string, unknown>>,
): Promise<boolean> {
  const state = tracker.getState();
  if (!state?.encounterPath || creatures.length === 0) return false;

  const file = app.vault.getAbstractFileByPath(state.encounterPath);
  if (!(file instanceof TFile)) return false;

  try {
    const content = await app.vault.read(file);
    const nextContent = updateYamlFrontmatter(content, (frontmatter) => {
      const existing = Array.isArray(frontmatter.creatures) ? frontmatter.creatures : [];
      return {
        ...frontmatter,
        creatures: [...existing, ...creatures],
      };
    });

    if (nextContent !== content) {
      await app.vault.modify(file, nextContent);
    }
    return true;
  } catch (error) {
    console.error("[CombatTracker] Failed to append creatures to encounter:", error);
    new Notice("Added to tracker, but could not update the encounter note.");
    return false;
  }
}

async function appendPartyMembersToActiveEncounter(
  app: any,
  tracker: CombatTracker,
  members: Array<Record<string, unknown>>,
): Promise<boolean> {
  const state = tracker.getState();
  if (!state?.encounterPath || members.length === 0) return false;

  const file = app.vault.getAbstractFileByPath(state.encounterPath);
  if (!(file instanceof TFile)) return false;

  try {
    const content = await app.vault.read(file);
    const nextContent = updateYamlFrontmatter(content, (frontmatter) => {
      const existing = Array.isArray(frontmatter.party_members) ? frontmatter.party_members : [];
      return {
        ...frontmatter,
        party_members: [...existing, ...members],
      };
    });

    if (nextContent !== content) {
      await app.vault.modify(file, nextContent);
    }
    return true;
  } catch (error) {
    console.error("[CombatTracker] Failed to append party members to encounter:", error);
    new Notice("Added to tracker, but could not update the encounter note.");
    return false;
  }
}

class AddCreatureModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private tracker: CombatTracker;

  /* Vault creature state */
  private selectedCreature: { name: string; path: string; hp: number; ac: number; cr?: string } | null = null;
  private vaultCount = "1";
  private vaultFriendly = false;
  private vaultHidden = false;
  private saveToEncounter = true;

  /* Manual creature state */
  private creatureName = "";
  private hp = "10";
  private ac = "10";
  private modifier = "0";
  private count = "1";
  private friendly = false;

  private static readonly COLORS = [
    "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
    "Pink", "Brown", "Black", "White", "Gray", "Cyan",
    "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold",
    "Silver", "Bronze",
  ];

  constructor(app: any, plugin: DndCampaignHubPlugin, tracker: CombatTracker) {
    super(app);
    this.plugin = plugin;
    this.tracker = tracker;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "➕ Add Creature" });

    const state = this.tracker.getState();
    if (state?.encounterPath) {
      new Setting(contentEl)
        .setName("Save to Encounter")
        .setDesc("Add this participant to the loaded encounter note as well as the active tracker.")
        .addToggle((toggle) =>
          toggle.setValue(this.saveToEncounter).onChange((value) => {
            this.saveToEncounter = value;
          }),
        );
    } else {
      this.saveToEncounter = false;
    }

    /* ── Vault creature section ── */
    await this.buildVaultSection(contentEl);

    /* ── Manual section ── */
    const manualHeader = contentEl.createEl("h4", { text: "Manual Entry" });
    manualHeader.style.marginTop = "18px";

    new Setting(contentEl).setName("Name").addText((text) => {
      text.setPlaceholder("Creature name").onChange((v) => (this.creatureName = v));
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
      btn.setButtonText("Add").setCta().onClick(() => this.addManual()),
    );
  }

  /* ── Vault creature search UI ── */
  private async buildVaultSection(container: HTMLElement) {
    const vaultCreatures = await this.plugin.encounterBuilder.loadAllCreatures();
    if (vaultCreatures.length === 0) return;

    const section = container.createDiv();
    const setting = new Setting(section)
      .setName("Add from Vault")
      .setDesc(`Search creatures from your vault (${vaultCreatures.length} available)`);

    const searchContainer = setting.controlEl.createDiv({ cls: "dnd-creature-search-container" });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search creatures...",
      cls: "dnd-creature-search-input",
    });
    const searchResults = searchContainer.createDiv({ cls: "dnd-creature-search-results" });
    searchResults.style.display = "none";

    const showResults = (query: string) => {
      if (!query || query.length < 1) { searchResults.style.display = "none"; return; }
      const q = query.toLowerCase().trim();
      const filtered = vaultCreatures.filter(c => c.name.toLowerCase().includes(q)).slice(0, 10);
      searchResults.empty();
      if (filtered.length === 0) {
        searchResults.createEl("div", { text: "No creatures found", cls: "dnd-creature-search-no-results" });
      } else {
        for (const creature of filtered) {
          const row = searchResults.createDiv({ cls: "dnd-creature-search-result" });
          row.createDiv({ cls: "dnd-creature-search-result-name", text: creature.name });
          const parts: string[] = [];
          if (creature.cr) parts.push(`CR ${creature.cr}`);
          parts.push(`HP ${creature.hp}`, `AC ${creature.ac}`);
          row.createDiv({ cls: "dnd-creature-search-result-stats", text: parts.join(" | ") });
          row.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectedCreature = creature;
            searchInput.value = creature.name;
            searchResults.style.display = "none";
          });
        }
      }
      searchResults.style.display = "block";
    };

    searchInput.addEventListener("input", (e) => showResults((e.target as HTMLInputElement).value));
    searchInput.addEventListener("focus", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v.length >= 1) showResults(v);
    });
    searchInput.addEventListener("blur", () => setTimeout(() => { searchResults.style.display = "none"; }, 250));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.selectedCreature) { e.preventDefault(); this.addVaultCreature(searchInput); }
    });
    setTimeout(() => searchInput.focus(), 50);

    /* Count */
    setting.addText((text) => {
      text.setPlaceholder("Count").setValue("1").onChange((v) => (this.vaultCount = v));
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.inputEl.style.width = "60px";
    });

    /* Friendly checkbox */
    const friendlyC = setting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
    friendlyC.style.cssText = "display:inline-flex;align-items:center;margin-left:8px;";
    const friendlyCB = friendlyC.createEl("input", { type: "checkbox" });
    friendlyCB.style.marginRight = "4px";
    friendlyCB.addEventListener("change", (e) => { this.vaultFriendly = (e.target as HTMLInputElement).checked; });
    const friendlyLbl = friendlyC.createEl("label", { text: "Friendly" });
    friendlyLbl.style.cssText = "font-size:13px;cursor:pointer;";
    friendlyLbl.addEventListener("click", () => { friendlyCB.checked = !friendlyCB.checked; this.vaultFriendly = friendlyCB.checked; });

    /* Hidden checkbox */
    const hiddenC = setting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
    hiddenC.style.cssText = "display:inline-flex;align-items:center;margin-left:8px;";
    const hiddenCB = hiddenC.createEl("input", { type: "checkbox" });
    hiddenCB.style.marginRight = "4px";
    hiddenCB.addEventListener("change", (e) => { this.vaultHidden = (e.target as HTMLInputElement).checked; });
    const hiddenLbl = hiddenC.createEl("label", { text: "Hidden" });
    hiddenLbl.style.cssText = "font-size:13px;cursor:pointer;";
    hiddenLbl.addEventListener("click", () => { hiddenCB.checked = !hiddenCB.checked; this.vaultHidden = hiddenCB.checked; });

    /* Add button */
    setting.addButton((btn) =>
      btn.setButtonText("Add").setCta().onClick(() => this.addVaultCreature(searchInput)),
    );
  }

  /* ── Read DEX modifier from a creature note ── */
  private readModifier(path: string): number {
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return 0;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) return 0;
      if (typeof fm.init_bonus === "number") return fm.init_bonus;
      if (Array.isArray(fm.stats) && fm.stats.length >= 2) {
        const dex = fm.stats[1];
        if (typeof dex === "number") return Math.floor((dex - 10) / 2);
      }
      return 0;
    } catch { return 0; }
  }

  /* ── Roll initiative ── */
  private rollInit(modifier: number): number {
    return Math.floor(Math.random() * 20) + 1 + modifier;
  }

  /* ── Add vault creature(s) ── */
  private async addVaultCreature(searchInput: HTMLInputElement) {
    if (!this.selectedCreature) { new Notice("Select a creature from the search results"); return; }
    const creature = this.selectedCreature;
    const count = Math.max(1, parseInt(this.vaultCount, 10) || 1);
    const modifier = creature.path ? this.readModifier(creature.path) : 0;

    /* Resolve tokenId from note frontmatter */
    let tokenId: string | undefined;
    if (creature.path) {
      const file = this.app.vault.getAbstractFileByPath(creature.path);
      if (file instanceof TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        tokenId = cache?.frontmatter?.token_id;
      }
    }

    for (let i = 0; i < count; i++) {
      let display = creature.name;
      if (count > 1) display = `${display} (${AddCreatureModal.COLORS[i % AddCreatureModal.COLORS.length]})`;

      this.tracker.addCombatant({
        id: `add-${Date.now()}-${i}`,
        name: creature.name,
        display,
        initiative: this.rollInit(modifier),
        modifier,
        currentHP: creature.hp,
        maxHP: creature.hp,
        tempHP: 0,
        ac: creature.ac,
        currentAC: creature.ac,
        player: false,
        friendly: this.vaultFriendly,
        hidden: this.vaultHidden,
        notePath: creature.path,
        tokenId,
        statuses: [],
        cr: creature.cr,
      });
    }

    if (this.saveToEncounter) {
      await appendCreaturesToActiveEncounter(this.app, this.tracker, [{
        name: creature.name,
        count,
        hp: creature.hp,
        ac: creature.ac,
        ...(creature.cr ? { cr: creature.cr } : {}),
        source: "vault",
        path: creature.path,
        ...(this.vaultFriendly ? { is_friendly: true } : {}),
        ...(this.vaultHidden ? { is_hidden: true } : {}),
      }]);
    }

    new Notice(`Added ${count}× ${creature.name}`);
    /* Reset for another addition */
    this.selectedCreature = null;
    searchInput.value = "";
  }

  /* ── Add manual creature(s) ── */
  private async addManual() {
    if (!this.creatureName.trim()) { new Notice("Enter a creature name"); return; }
    const hp = parseInt(this.hp, 10) || 10;
    const ac = parseInt(this.ac, 10) || 10;
    const mod = parseInt(this.modifier, 10) || 0;
    const count = Math.max(1, parseInt(this.count, 10) || 1);

    for (let i = 0; i < count; i++) {
      let display = this.creatureName.trim();
      if (count > 1) display = `${display} (${AddCreatureModal.COLORS[i % AddCreatureModal.COLORS.length]})`;

      this.tracker.addCombatant({
        id: `add-${Date.now()}-${i}`,
        name: this.creatureName.trim(),
        display,
        initiative: this.rollInit(mod),
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

    if (this.saveToEncounter) {
      await appendCreaturesToActiveEncounter(this.app, this.tracker, [{
        name: this.creatureName.trim(),
        count,
        hp,
        ac,
        ...(this.friendly ? { is_friendly: true } : {}),
      }]);
    }

    new Notice(`Added ${count}× ${this.creatureName.trim()}`);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Add a party member (PC) mid-combat. */
class AddPartyMemberModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private tracker: CombatTracker;
  private selected = new Set<string>(); // notePaths of selected PCs
  private memberListEl!: HTMLElement;
  private addBtn!: HTMLButtonElement;
  private currentMembers: import("../party/PartyTypes").ResolvedPartyMember[] = [];
  private saveToEncounter = true;

  constructor(app: any, plugin: DndCampaignHubPlugin, tracker: CombatTracker) {
    super(app);
    this.plugin = plugin;
    this.tracker = tracker;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "➕ Add Party Member" });

    const trackerState = this.tracker.getState();
    if (trackerState?.encounterPath) {
      new Setting(contentEl)
        .setName("Save to Encounter")
        .setDesc("Add selected party members to the loaded encounter note as well as the active tracker.")
        .addToggle((toggle) =>
          toggle.setValue(this.saveToEncounter).onChange((value) => {
            this.saveToEncounter = value;
          }),
        );
    } else {
      this.saveToEncounter = false;
    }

    const parties = this.plugin.partyManager.getParties();
    if (parties.length === 0) {
      contentEl.createEl("p", {
        text: "No parties configured. Create a party in the Party Manager first.",
        cls: "mod-warning",
      });
      return;
    }

    // Pre-select the party linked to the encounter, if any
    const autoParty = trackerState?.encounterPath
      ? this.plugin.partyManager.resolvePartyForNote(trackerState.encounterPath)
      : undefined;
    const defaultPartyId = autoParty?.id ?? parties[0]!.id;

    // Party dropdown
    new Setting(contentEl).setName("Party").addDropdown((dd) => {
      for (const p of parties) dd.addOption(p.id, p.name);
      dd.setValue(defaultPartyId);
      dd.onChange((id) => this.loadMembers(id));
    });

    // Member list container
    this.memberListEl = contentEl.createDiv();

    // Add button
    const btnSetting = new Setting(contentEl).addButton((btn) => {
      this.addBtn = btn.buttonEl;
      btn.setButtonText("Add Selected").setCta().onClick(() => this.addSelected());
    });
    btnSetting.settingEl.style.borderTop = "1px solid var(--background-modifier-border)";
    btnSetting.settingEl.style.paddingTop = "12px";

    // Load default party
    await this.loadMembers(defaultPartyId);
  }

  private async loadMembers(partyId: string) {
    this.selected.clear();
    this.memberListEl.empty();

    const trackerState = this.tracker.getState();
    const presentPaths = new Set(
      (trackerState?.combatants ?? [])
        .filter((c) => c.player && c.notePath)
        .map((c) => c.notePath as string),
    );

    const members = await this.plugin.partyManager.resolveMembers(partyId);
    this.currentMembers = members.filter((m) => m.enabled && !m.absent && !presentPaths.has(m.notePath));

    if (this.currentMembers.length === 0) {
      this.memberListEl.createEl("p", {
        text: members.length === 0
          ? "No members in this party."
          : "All present party members are already in combat.",
        cls: "setting-item-description",
      });
      return;
    }

    for (const pm of this.currentMembers) {
      const row = new Setting(this.memberListEl)
        .setName(pm.name)
        .setDesc(`Level ${pm.level} · HP ${pm.hp}/${pm.maxHp} · AC ${pm.ac}`);
      row.addToggle((toggle) =>
        toggle.setValue(false).onChange((v) => {
          if (v) this.selected.add(pm.notePath);
          else this.selected.delete(pm.notePath);
        }),
      );
    }
  }

  private async addSelected() {
    if (this.selected.size === 0) {
      new Notice("Select at least one party member");
      return;
    }

    const toAdd = this.currentMembers.filter((pm) => this.selected.has(pm.notePath));
    for (const pm of toAdd) {
      const modifier = pm.initBonus ?? 0;
      const initiative = Math.floor(Math.random() * 20) + 1 + modifier;
      this.tracker.addCombatant({
        id: `add-${Date.now()}-${pm.notePath}`,
        name: pm.name,
        display: pm.name,
        initiative,
        modifier,
        currentHP: pm.hp,
        maxHP: pm.maxHp,
        tempHP: pm.thp ?? 0,
        ac: pm.ac,
        currentAC: pm.ac,
        player: true,
        friendly: false,
        hidden: false,
        notePath: pm.notePath,
        tokenId: pm.tokenId,
        statuses: [],
        level: pm.level,
      });
    }

    if (this.saveToEncounter) {
      await appendPartyMembersToActiveEncounter(this.app, this.tracker, toAdd.map((pm) => ({
        name: pm.name,
        level: pm.level,
        hp: pm.maxHp,
        ac: pm.ac,
        note_path: pm.notePath,
        ...(pm.tokenId ? { token_id: pm.tokenId } : {}),
        init_bonus: pm.initBonus,
        ...(pm.thp ? { thp: pm.thp } : {}),
      })));
    }

    new Notice(`Added ${toAdd.length} party member${toAdd.length !== 1 ? "s" : ""}`);
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

    const search = contentEl.createEl("input", {
      cls: "dnd-ct-launcher-search",
      attr: {
        type: "search",
        placeholder: "Search encounters...",
        spellcheck: "false",
      },
    });
    const listEl = contentEl.createDiv({ cls: "dnd-ct-encounter-list" });
    const render = () => {
      listEl.empty();
      const query = search.value;
      const filtered = encounters
        .map((file) => {
          const cache = this.app.metadataCache.getFileCache(file);
          const name = cache?.frontmatter?.encounter_name || cache?.frontmatter?.name || file.basename;
          const detail = file.path;
          return {
            file,
            name,
            detail,
            score: scoreCombatLauncherEntry({
              kind: "encounter",
              file,
              label: name,
              detail,
              scoreText: `${name} ${detail}`,
            }, query),
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

      if (filtered.length === 0) {
        listEl.createDiv({ cls: "dnd-ct-launcher-empty", text: "No matches." });
        return;
      }

      for (const enc of filtered) {
        const row = listEl.createDiv({ cls: "dnd-ct-encounter-list-row" });
        const nameWrap = row.createDiv({ cls: "dnd-ct-encounter-list-name" });
        nameWrap.createEl("span", { text: enc.name });
        nameWrap.createEl("span", { text: enc.detail, cls: "dnd-ct-launcher-detail" });
        const runBtn = row.createEl("button", { text: "⚔ Run", cls: "dnd-ct-btn dnd-ct-btn-primary" });
        runBtn.addEventListener("click", () => {
          void startEncounterFromFile(this.plugin, enc.file);
          this.close();
        });
        const openBtn = row.createEl("button", { text: "Open", cls: "dnd-ct-btn" });
        openBtn.addEventListener("click", () => {
          this.app.workspace.openLinkText(enc.file.path, "");
          this.close();
        });
      }
    };

    search.addEventListener("input", render);
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = listEl.querySelector("button.dnd-ct-btn-primary") as HTMLButtonElement | null;
      first?.click();
    });
    render();
    search.focus();
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

  private async finishCombat(writeSave: boolean) {
    const snapshot = this.tracker.getState();
    let logFile: TFile | null = null;
    if (snapshot) {
      logFile = await this.tracker.writeEncounterLog(snapshot);
    }
    if (writeSave) {
      await this.tracker.saveCombat();
    }
    this.tracker.endCombat();
    this.close();
    if (snapshot) {
      new EndCombatSummaryModal(this.app, this.tracker, snapshot, logFile).open();
    }
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
        btn.setButtonText("Sync, Save & End").setCta().onClick(async () => {
          const entries = await this.tracker.buildSyncPreview();
          const hasChanges = entries.some(e => e.changed);
          if (hasChanges) {
            new ConfirmSyncModal(this.app, this.tracker, entries, "toNotes", async () => {
              await this.finishCombat(true);
            }).open();
          } else {
            await this.finishCombat(true);
          }
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Save & End").onClick(async () => {
          await this.finishCombat(true);
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("End Without Saving").setWarning().onClick(() => {
          void this.finishCombat(false);
        }),
      )
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class EndCombatSummaryModal extends Modal {
  constructor(
    app: any,
    private tracker: CombatTracker,
    private state: CombatState,
    private logFile: TFile | null,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-ct-end-summary-modal");
    const hero = contentEl.createDiv({ cls: "dnd-ct-end-summary-hero" });
    hero.createEl("div", { cls: "dnd-ct-end-summary-kicker", text: "Encounter Complete" });
    hero.createEl("h2", { text: this.state.encounterName });
    hero.createEl("p", {
      cls: "dnd-ct-end-summary-subtitle",
      text: `Round ${this.state.round} results`,
    });

    const summary = this.tracker.summarizeCombatRun(this.state);
    const awards = [
      { title: "Most Enemies Defeated", entries: summary.enemiesDefeated, unit: "defeated" },
      { title: "Most Damage Dealt", entries: summary.damageDealt, unit: "damage" },
      { title: "Most Damage Taken", entries: summary.damageTaken, unit: "damage" },
      { title: "Best Healer", entries: summary.healingDone, unit: "healing" },
    ];

    if (summary.mvp) {
      const mvp = contentEl.createDiv({ cls: "dnd-ct-award-mvp" });
      mvp.createDiv({ cls: "dnd-ct-award-mvp-trophy", text: "🏆" });
      this.renderPortrait(mvp, summary.mvp.actor, "dnd-ct-award-mvp-portrait");
      const text = mvp.createDiv({ cls: "dnd-ct-award-mvp-text" });
      text.createDiv({ cls: "dnd-ct-award-mvp-label", text: "MVP of the Encounter" });
      text.createDiv({ cls: "dnd-ct-award-mvp-name", text: summary.mvp.actor.display });
      text.createDiv({ cls: "dnd-ct-award-mvp-reasons", text: summary.mvp.reasons.join(" · ") });
    }

    const grid = contentEl.createDiv({ cls: "dnd-ct-awards-grid" });
    awards.forEach((award) => this.renderAwardCard(grid, award));

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Project Awards")
          .setCta()
          .onClick((evt) => {
            void this.projectAwards(evt);
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(this.logFile ? "Open Log" : "Log unavailable")
          .setDisabled(!this.logFile)
          .onClick(() => {
            if (this.logFile) {
              void this.app.workspace.openLinkText(this.logFile.path, "");
              this.close();
            }
          })
      )
      .addButton((btn) => btn.setButtonText("Close").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }

  private renderAwardCard(parent: HTMLElement, award: {
    title: string;
    entries: Array<{ actor: CombatRunActorRef; value: number }>;
    unit: string;
  }) {
    const card = parent.createDiv({ cls: "dnd-ct-award-card" });
    card.createEl("h3", { text: award.title });

    if (award.entries.length === 0) {
      card.createEl("p", { cls: "dnd-ct-award-empty", text: "No score this time." });
      return;
    }

    const podium = card.createDiv({ cls: "dnd-ct-award-mini-podium" });
    const placements = [
      { place: 2, entry: award.entries[1], cls: "second" },
      { place: 1, entry: award.entries[0], cls: "first" },
      { place: 3, entry: award.entries[2], cls: "third" },
    ];

    placements.forEach((slot) => {
      const step = podium.createDiv({ cls: `dnd-ct-award-mini-step dnd-ct-award-mini-step-${slot.cls}` });
      if (!slot.entry) {
        step.createEl("span", { cls: "dnd-ct-award-mini-empty", text: String(slot.place) });
        return;
      }
      this.renderPortrait(step, slot.entry.actor);
      step.createEl("span", { cls: "dnd-ct-award-mini-rank", text: `#${slot.place}` });
      step.createEl("span", { cls: "dnd-ct-award-winner", text: slot.entry.actor.display });
      step.createEl("span", { cls: "dnd-ct-award-score", text: `${slot.entry.value} ${award.unit}` });
    });
  }

  private renderPortrait(parent: HTMLElement, actor: CombatRunActorRef, extraClass = "") {
    const portrait = parent.createDiv({ cls: `dnd-ct-award-portrait ${extraClass}`.trim() });
    const imageResourcePath = this.tracker.getCombatantPortraitResourcePath(actor);
    if (imageResourcePath) {
      const img = portrait.createEl("img");
      img.src = imageResourcePath;
      img.alt = "";
      return;
    }

    const initials = actor.display
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";
    portrait.createEl("span", { text: initials });
  }

  private async projectAwards(evt?: MouseEvent) {
    const pm = this.tracker.plugin.projectionManager;
    if (!pm) {
      new Notice("Projection manager not available");
      return;
    }

    const screens = await enumerateScreens();
    if (screens.length === 0) {
      new Notice("No screens detected");
      return;
    }

    const occupied = pm.getOccupiedScreenKeys();
    const projectTo = async (screen: ScreenInfo) => {
      await pm.projectCombatAwardsView(screen, this.state);
    };

    if (screens.length <= 1) {
      const screen = screens[0]!;
      const sKey = screenKey(screen);
      if (occupied.has(sKey)) {
        const menu = new Menu();
        menu.addItem((item) =>
          item.setTitle(`Switch ${screen.label} to Combat Awards`).onClick(() => {
            void projectTo(screen);
          }),
        );
        if (evt) menu.showAtMouseEvent(evt);
        else menu.showAtPosition({ x: 100, y: 100 });
      } else {
        await projectTo(screen);
      }
      return;
    }

    const menu = new Menu();
    for (const screen of screens) {
      const sKey = screenKey(screen);
      const label = `${screen.isPrimary ? "Primary" : "Screen"} ${screen.label} (${screen.width}x${screen.height})`;
      menu.addItem((item) =>
        item
          .setTitle(occupied.has(sKey) ? `Switch ${screen.label} to Combat Awards` : label)
          .onClick(() => {
            void projectTo(screen);
          }),
      );
    }
    if (evt) menu.showAtMouseEvent(evt);
    else menu.showAtPosition({ x: 100, y: 100 });
  }
}

/** Confirmation modal for syncing HP between tracker and vault notes. */
class ConfirmSyncModal extends Modal {
  private selected = new Map<string, boolean>();
  private _confirmBtn: HTMLButtonElement | null = null;

  constructor(
    app: any,
    private tracker: CombatTracker,
    private entries: SyncPreviewEntry[],
    private direction: "toNotes" | "fromNotes",
    private onComplete?: () => Promise<void>,
  ) {
    super(app);
    for (const e of entries) {
      this.selected.set(e.combatant.id, e.changed);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-ct-sync-modal");

    const isToNotes = this.direction === "toNotes";
    contentEl.createEl("h3", {
      text: isToNotes ? "Sync HP to Notes" : "Refresh HP from Notes",
    });
    contentEl.createEl("p", {
      text: isToNotes
        ? "Review changes before writing tracker HP to vault notes."
        : "Review changes before overwriting tracker HP with vault note values.",
      cls: "dnd-ct-sync-subtitle",
    });

    const hasAnyDrastic = this.entries.some(e => e.drastic);
    if (hasAnyDrastic) {
      const warningEl = contentEl.createDiv({ cls: "dnd-ct-sync-warning" });
      const drasticCount = this.entries.filter(e => e.drastic).length;
      warningEl.createEl("span", {
        text: `\u26A0 ${drasticCount} PC${drasticCount !== 1 ? "s" : ""} at full HP \u2014 possible accidental reset. Review carefully.`,
      });
    }

    // Table
    const table = contentEl.createEl("table", { cls: "dnd-ct-sync-table" });
    const thead = table.createEl("thead");
    const headRow = thead.createEl("tr");
    headRow.createEl("th", { text: "" });
    headRow.createEl("th", { text: "Name" });
    if (isToNotes) {
      headRow.createEl("th", { text: "Note HP" });
      headRow.createEl("th", { text: "" });
      headRow.createEl("th", { text: "Tracker HP" });
    } else {
      headRow.createEl("th", { text: "Tracker HP" });
      headRow.createEl("th", { text: "" });
      headRow.createEl("th", { text: "Note HP" });
    }
    headRow.createEl("th", { text: "Status" });

    const tbody = table.createEl("tbody");
    const checkboxEls: HTMLInputElement[] = [];

    for (const entry of this.entries) {
      const c = entry.combatant;
      const row = tbody.createEl("tr");
      if (!entry.changed) row.addClass("dnd-ct-sync-row-unchanged");
      if (entry.drastic) row.addClass("dnd-ct-sync-row-drastic");
      if (entry.error) row.addClass("dnd-ct-sync-row-error");

      // Checkbox
      const cbCell = row.createEl("td");
      const cb = cbCell.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = this.selected.get(c.id) ?? false;
      cb.disabled = !!entry.error;
      cb.addEventListener("change", () => {
        this.selected.set(c.id, cb.checked);
        this.updateConfirmBtn();
      });
      checkboxEls.push(cb);

      // Name
      row.createEl("td", { text: c.display, cls: "dnd-ct-sync-name" });

      const noteHPStr = entry.error
        ? "?"
        : `${entry.vaultHP}/${c.maxHP}` + (entry.vaultTHP ? ` (+${entry.vaultTHP})` : "");
      const trackerHPStr = `${entry.trackerHP}/${c.maxHP}` + (entry.trackerTHP ? ` (+${entry.trackerTHP})` : "");

      if (isToNotes) {
        // Note HP (old) -> Tracker HP (new)
        row.createEl("td", { text: noteHPStr, cls: "dnd-ct-sync-hp" });
        const arrowCell = row.createEl("td", { cls: "dnd-ct-sync-arrow" });
        if (entry.changed && !entry.error) arrowCell.textContent = "\u2190";
        row.createEl("td", { text: trackerHPStr, cls: "dnd-ct-sync-hp" });
      } else {
        // Tracker HP (old) -> Note HP (new)
        row.createEl("td", { text: trackerHPStr, cls: "dnd-ct-sync-hp" });
        const arrowCell = row.createEl("td", { cls: "dnd-ct-sync-arrow" });
        if (entry.changed && !entry.error) arrowCell.textContent = "\u2192";
        row.createEl("td", { text: noteHPStr, cls: "dnd-ct-sync-hp" });
      }

      // Status badge
      const statusCell = row.createEl("td", { cls: "dnd-ct-sync-status" });
      if (entry.error) {
        statusCell.createEl("span", { text: "error", cls: "dnd-ct-sync-badge dnd-ct-sync-badge-error" });
      } else if (entry.drastic) {
        statusCell.createEl("span", { text: "reset?", cls: "dnd-ct-sync-badge dnd-ct-sync-badge-reset" });
      } else if (!entry.changed) {
        statusCell.createEl("span", { text: "same", cls: "dnd-ct-sync-badge dnd-ct-sync-badge-same" });
      }
    }

    // Buttons
    const btnRow = new Setting(contentEl);

    btnRow.addButton((btn) =>
      btn.setButtonText("Select Changed").onClick(() => {
        for (let i = 0; i < this.entries.length; i++) {
          const e = this.entries[i]!;
          const checked = e.changed && !e.error;
          this.selected.set(e.combatant.id, checked);
          checkboxEls[i]!.checked = checked;
        }
        this.updateConfirmBtn();
      }),
    );

    btnRow.addButton((btn) => {
      btn.setButtonText("Confirm Sync").setCta().onClick(async () => {
        const ids = [...this.selected.entries()]
          .filter(([, v]) => v)
          .map(([id]) => id);
        if (ids.length === 0) return;

        if (isToNotes) {
          await this.tracker.syncSelectedPCsToNotes(ids);
        } else {
          await this.tracker.refreshSelectedPCsFromNotes(ids);
        }
        if (this.onComplete) await this.onComplete();
        this.close();
      });
      this._confirmBtn = btn.buttonEl;
    });

    btnRow.addButton((btn) =>
      btn.setButtonText("Cancel").onClick(() => this.close()),
    );

    this.updateConfirmBtn();
  }

  private updateConfirmBtn() {
    if (!this._confirmBtn) return;
    const anySelected = [...this.selected.values()].some(v => v);
    this._confirmBtn.disabled = !anySelected;
  }

  onClose() {
    this.contentEl.empty();
  }
}
