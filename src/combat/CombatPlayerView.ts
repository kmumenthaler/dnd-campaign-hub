import { ItemView, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { COMBAT_PLAYER_VIEW_TYPE } from "../constants";
import type { CombatState } from "./types";

/**
 * Player-facing combat view — designed for fullscreen projection.
 *
 * Shows the initiative order, round counter, HP bars, and status effects.
 * Hidden creatures are excluded. No GM controls are exposed.
 */
export class CombatPlayerView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return COMBAT_PLAYER_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Combat — Player View";
  }
  getIcon(): string {
    return "swords";
  }

  async onOpen() {
    this.unsubscribe = this.plugin.combatTracker.onChange(() => this.render());
    this.render();
  }

  onClose() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    return Promise.resolve();
  }

  /* ═══════════════════════ Render ═══════════════════════ */

  private render() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();
    container.addClass("dnd-ct-player-view");

    const state = this.plugin.combatTracker.getState();

    if (!state) {
      const msg = container.createDiv({ cls: "dnd-ct-pv-waiting" });
      msg.createEl("h1", { text: "⚔️" });
      msg.createEl("p", { text: "Waiting for combat..." });
      return;
    }

    // Header
    const header = container.createDiv({ cls: "dnd-ct-pv-header" });
    header.createEl("h2", { text: state.encounterName, cls: "dnd-ct-pv-title" });
    if (state.started) {
      header.createEl("span", { text: `Round ${state.round}`, cls: "dnd-ct-pv-round" });
    }

    // Combatant list (exclude hidden & disabled)
    const list = container.createDiv({ cls: "dnd-ct-pv-list" });

    for (let i = 0; i < state.combatants.length; i++) {
      const c = state.combatants[i];
      if (!c || c.hidden || !(c.enabled ?? true)) continue;

      const isActive = state.started && i === state.turnIndex;
      const isDead = c.currentHP <= 0;
      const isAlly = c.player || c.friendly;

      const row = list.createDiv({
        cls: `dnd-ct-pv-row ${isActive ? "dnd-ct-pv-row-active" : ""} ${isDead ? "dnd-ct-pv-row-dead" : ""} ${isAlly ? "dnd-ct-pv-row-ally" : "dnd-ct-pv-row-enemy"}`,
      });

      // Initiative
      const initEl = row.createEl("span", { cls: "dnd-ct-pv-init" });
      initEl.textContent = state.started ? String(c.initiative) : "—";

      // Name + markers
      const nameCell = row.createDiv({ cls: "dnd-ct-pv-name-cell" });
      if (c.player) {
        nameCell.createEl("span", { text: "👤 ", cls: "dnd-ct-pv-marker" });
      } else if (c.friendly) {
        nameCell.createEl("span", { text: "♥ ", cls: "dnd-ct-pv-marker dnd-ct-pv-marker-friendly" });
      }
      nameCell.createEl("span", { text: c.display, cls: "dnd-ct-pv-name" });

      // Status badges
      if (c.statuses.length > 0) {
        const statuses = nameCell.createDiv({ cls: "dnd-ct-pv-statuses" });
        for (const s of c.statuses) {
          statuses.createEl("span", {
            text: s.duration !== undefined ? `${s.name} (${s.duration})` : s.name,
            cls: "dnd-ct-pv-status",
          });
        }
      }

      // HP bar
      this.renderPVHPBar(row, c);

      // AC
      row.createEl("span", { text: String(c.currentAC), cls: "dnd-ct-pv-ac" });
    }

    // Current turn callout
    if (state.started) {
      const current = state.combatants[state.turnIndex];
      if (current && !current.hidden) {
        const turnCallout = container.createDiv({ cls: "dnd-ct-pv-turn-callout" });
        turnCallout.createEl("span", { text: `${current.display}'s Turn`, cls: "dnd-ct-pv-turn-text" });
      }
    }
  }

  private renderPVHPBar(parent: HTMLElement, c: { currentHP: number; maxHP: number; tempHP: number }) {
    const hpCell = parent.createDiv({ cls: "dnd-ct-pv-hp" });
    const pct = c.maxHP > 0 ? Math.max(0, c.currentHP / c.maxHP) : 0;

    const bar = hpCell.createDiv({ cls: "dnd-ct-pv-hp-bar" });
    const fill = bar.createDiv({ cls: "dnd-ct-pv-hp-fill" });
    fill.style.width = `${pct * 100}%`;

    if (pct > 0.5) fill.addClass("dnd-ct-hp-healthy");
    else if (pct > 0.25) fill.addClass("dnd-ct-hp-wounded");
    else if (pct > 0) fill.addClass("dnd-ct-hp-critical");
    else fill.addClass("dnd-ct-hp-dead");

    if (c.tempHP > 0) {
      const tempPct = Math.min(1, c.tempHP / c.maxHP);
      bar.createDiv({ cls: "dnd-ct-hp-temp" }).style.width = `${tempPct * 100}%`;
    }

    let text = `${c.currentHP}/${c.maxHP}`;
    if (c.tempHP > 0) text += ` (+${c.tempHP})`;
    hpCell.createEl("span", { text, cls: "dnd-ct-pv-hp-text" });
  }
}
