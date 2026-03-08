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
  private scrollAnimationId: number | null = null;

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

    // Preserve scroll position from existing list before rebuild
    const oldList = container.querySelector(".dnd-ct-pv-list") as HTMLElement | null;
    const previousScroll = oldList ? oldList.scrollTop : 0;

    container.empty();
    container.addClass("dnd-ct-player-view");

    const state = this.plugin.combatTracker.getState();

    if (!state) {
      const msg = container.createDiv({ cls: "dnd-ct-pv-waiting" });
      msg.createEl("h1", { text: "⚔️" });
      msg.createEl("p", { text: "Waiting for combat..." });
      return;
    }

    // Count visible combatants to compute dynamic sizing
    const visibleCount = state.combatants.filter(
      (c) => c && !c.hidden && (c.enabled ?? true),
    ).length;
    const hasTurnCallout = state.started &&
      state.combatants[state.turnIndex] &&
      !state.combatants[state.turnIndex]!.hidden;

    // Budget: header ~3.2em, each row ~2.8em, row gaps ~0.3em, callout ~3.5em, padding ~2.5em
    const overhead = 3.2 + 2.5 + (hasTurnCallout ? 3.5 : 0);
    const rowBudget = visibleCount * 2.8 + Math.max(0, visibleCount - 1) * 0.3;
    const totalEms = overhead + rowBudget;
    // vh available = 100; font-size = vh / totalEms, clamped to reasonable bounds
    // Min 2.5vh keeps text readable from a distance on projected screens
    const computedSize = Math.min(5, Math.max(2.5, 100 / totalEms));
    container.style.fontSize = `${computedSize}vh`;

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

      // Portrait image (from token marker if available)
      this.renderPortrait(row, c);

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
      this.renderPVHPBar(row, c, isAlly);

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

    // Restore scroll, then smoothly pan to active row
    requestAnimationFrame(() => {
      list.scrollTop = previousScroll;
      const activeRow = list.querySelector(".dnd-ct-pv-row-active") as HTMLElement | null;
      if (activeRow) {
        // Calculate target: center the active row in the list viewport
        const rowTop = activeRow.offsetTop;
        const rowH = activeRow.offsetHeight;
        const listH = list.clientHeight;
        const target = rowTop - (listH - rowH) / 2;
        this.smoothScrollTo(list, target, 800);
      }
    });
  }

  /** Animate scrollTop from current position to target over duration ms. */
  private smoothScrollTo(el: HTMLElement, target: number, duration: number) {
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
      this.scrollAnimationId = null;
    }

    const start = el.scrollTop;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const clampedTarget = Math.max(0, Math.min(target, maxScroll));
    const distance = clampedTarget - start;
    if (Math.abs(distance) < 1) return;

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-in-out cubic
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      el.scrollTop = start + distance * ease;

      if (progress < 1) {
        this.scrollAnimationId = requestAnimationFrame(step);
      } else {
        this.scrollAnimationId = null;
      }
    };

    this.scrollAnimationId = requestAnimationFrame(step);
  }

  /** Render a circular portrait from the combatant's token marker image. */
  private renderPortrait(parent: HTMLElement, c: { tokenId?: string; notePath?: string }) {
    let imageFile: string | undefined;

    // Try tokenId first
    if (c.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(c.tokenId);
      if (marker?.imageFile) imageFile = marker.imageFile;
    }

    // Fallback: read token_id from vault note frontmatter
    if (!imageFile && c.notePath) {
      const file = this.app.vault.getAbstractFileByPath(c.notePath);
      if (file) {
        const cache = this.app.metadataCache.getFileCache(file as any);
        const noteTokenId = cache?.frontmatter?.token_id;
        if (noteTokenId) {
          const marker = this.plugin.markerLibrary.getMarker(noteTokenId);
          if (marker?.imageFile) imageFile = marker.imageFile;
        }
      }
    }

    if (!imageFile) return;

    const wrap = parent.createDiv({ cls: "dnd-ct-pv-portrait" });
    const img = wrap.createEl("img", { cls: "dnd-ct-pv-portrait-img" });
    img.src = this.app.vault.adapter.getResourcePath(imageFile);
    img.alt = "";
  }

  /** Map HP percentage to a green→orange→red color. */
  private hpColor(pct: number): string {
    // 1.0 = green (#5cb85c), 0.5 = orange (#e0a030), 0.0 = red (#c9302c)
    const r = pct > 0.5 ? Math.round(92 + (224 - 92) * (1 - (pct - 0.5) * 2)) : Math.round(224 + (201 - 224) * (1 - pct * 2));
    const g = pct > 0.5 ? Math.round(184 + (160 - 184) * (1 - (pct - 0.5) * 2)) : Math.round(160 * pct * 2 + 48 * (1 - pct * 2));
    const b = pct > 0.5 ? Math.round(92 + (48 - 92) * (1 - (pct - 0.5) * 2)) : Math.round(48 * pct * 2 + 44 * (1 - pct * 2));
    return `rgb(${r},${g},${b})`;
  }

  /** Map HP percentage to a condition label for enemies. */
  private hpCondition(pct: number): string {
    if (pct <= 0) return "Dead";
    if (pct <= 0.25) return "Critical";
    if (pct <= 0.5) return "Bloodied";
    if (pct <= 0.75) return "Hurt";
    if (pct < 1) return "Scratched";
    return "Uninjured";
  }

  private renderPVHPBar(parent: HTMLElement, c: { currentHP: number; maxHP: number; tempHP: number }, isAlly: boolean) {
    const hpCell = parent.createDiv({ cls: "dnd-ct-pv-hp" });
    const pct = c.maxHP > 0 ? Math.max(0, Math.min(1, c.currentHP / c.maxHP)) : 0;
    const color = this.hpColor(pct);

    if (isAlly) {
      // Allies: show HP bar + numbers
      const bar = hpCell.createDiv({ cls: "dnd-ct-pv-hp-bar" });
      const fill = bar.createDiv({ cls: "dnd-ct-pv-hp-fill" });
      fill.style.width = `${pct * 100}%`;
      fill.style.background = color;

      if (c.tempHP > 0) {
        const tempPct = Math.min(1, c.tempHP / c.maxHP);
        bar.createDiv({ cls: "dnd-ct-hp-temp" }).style.width = `${tempPct * 100}%`;
      }

      let text = `${c.currentHP}/${c.maxHP}`;
      if (c.tempHP > 0) text += ` (+${c.tempHP})`;
      const textEl = hpCell.createEl("span", { text, cls: "dnd-ct-pv-hp-text" });
      textEl.style.color = color;
    } else {
      // Enemies: condition text only — no bar
      const condition = this.hpCondition(pct);
      const textEl = hpCell.createEl("span", { text: condition, cls: "dnd-ct-pv-hp-text dnd-ct-pv-hp-condition" });
      textEl.style.color = color;
    }
  }
}
