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
  /** Track previous HP so we can detect changes and animate. */
  private prevHP: Map<string, { hp: number; maxHP: number; tempHP: number }> = new Map();

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
    // Budget: header ~3.2em, each row ~2.8em, row gaps ~0.3em, padding ~2.5em
    const overhead = 3.2 + 2.5;
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
      const isDead = c.dead ?? (c.currentHP <= 0);
      const isAlly = c.player || c.friendly;

      const row = list.createDiv({
        cls: `dnd-ct-pv-row ${isActive ? "dnd-ct-pv-row-active" : ""} ${isDead ? "dnd-ct-pv-row-dead" : ""} ${isAlly ? "dnd-ct-pv-row-ally" : "dnd-ct-pv-row-enemy"}`,
      });

      // Detect HP change — defer the CSS class until after pan
      const prev = this.prevHP.get(c.id);
      let hpChangeClass: string | null = null;
      if (prev) {
        if (c.currentHP < prev.hp) {
          hpChangeClass = "dnd-ct-pv-row-damage";
        } else if (c.currentHP > prev.hp) {
          hpChangeClass = "dnd-ct-pv-row-heal";
        } else if (c.maxHP !== prev.maxHP) {
          hpChangeClass = "dnd-ct-pv-row-maxhp";
        } else if (c.tempHP > prev.tempHP) {
          hpChangeClass = "dnd-ct-pv-row-temp-gain";
        } else if (c.tempHP < prev.tempHP) {
          hpChangeClass = "dnd-ct-pv-row-temp-loss";
        }
      }
      if (hpChangeClass) {
        row.dataset.hpChange = hpChangeClass;
      }

      // Initiative
      const initEl = row.createEl("span", { cls: "dnd-ct-pv-init" });
      initEl.textContent = state.started ? String(c.initiative) : "—";

      // Portrait image (from token marker if available)
      this.renderPortrait(row, c);

      // Name
      const nameCell = row.createDiv({ cls: "dnd-ct-pv-name-cell" });
      nameCell.createEl("span", { text: c.display, cls: "dnd-ct-pv-name" });

      // "YOUR TURN" badge on active combatant
      if (isActive) {
        nameCell.createEl("span", { text: "YOUR TURN", cls: "dnd-ct-pv-turn-badge" });
      }

      // Status badges + death saves
      if (c.statuses.length > 0 || c.deathSaves) {
        const statuses = nameCell.createDiv({ cls: "dnd-ct-pv-statuses" });

        // Death save indicators (visible for allies only)
        if (c.deathSaves && isAlly) {
          const dsContainer = statuses.createEl("span", { cls: "dnd-ct-pv-death-saves" });
          for (let i = 0; i < 3; i++) {
            dsContainer.createEl("span", {
              cls: `dnd-ct-ds-pip dnd-ct-ds-success ${i < c.deathSaves.successes ? "dnd-ct-ds-filled" : ""}`,
              text: i < c.deathSaves.successes ? "✔" : "○",
            });
          }
          dsContainer.createEl("span", { cls: "dnd-ct-ds-divider", text: "|" });
          for (let i = 0; i < 3; i++) {
            dsContainer.createEl("span", {
              cls: `dnd-ct-ds-pip dnd-ct-ds-failure ${i < c.deathSaves.failures ? "dnd-ct-ds-filled" : ""}`,
              text: i < c.deathSaves.failures ? "✘" : "○",
            });
          }
        }

        for (const s of c.statuses) {
          statuses.createEl("span", {
            text: s.duration !== undefined ? `${s.name} (${s.duration})` : s.name,
            cls: "dnd-ct-pv-status",
          });
        }
      }

      // AC (show value for allies, empty placeholder for enemies — before HP bar)
      row.createEl("span", {
        text: isAlly ? String(c.currentAC) : "",
        cls: "dnd-ct-pv-ac",
      });

      // HP bar (defer animation if HP changed — bar starts at old value)
      const hasHPChange = !!hpChangeClass;
      // Capture deltas before renderPVHPBar overwrites prevHP
      const hpDelta = prev ? prev.hp - c.currentHP : 0;
      const tempDelta = prev ? c.tempHP - prev.tempHP : 0;
      const maxDelta = prev ? c.maxHP - prev.maxHP : 0;
      this.renderPVHPBar(row, c, isAlly, hasHPChange);
      if (hasHPChange) {
        row.dataset.changedCombatant = JSON.stringify({
          id: c.id, currentHP: c.currentHP, maxHP: c.maxHP, tempHP: c.tempHP, isAlly,
          dmg: hpDelta, tempDelta, maxDelta, changeType: hpChangeClass,
        });
      }
    }

    // Restore scroll, then handle pan sequence
    requestAnimationFrame(() => {
      list.scrollTop = previousScroll;

      // Find the row that had an HP change (deferred animation)
      const changedRow = list.querySelector(
        "[data-hp-change]",
      ) as HTMLElement | null;
      const activeRow = list.querySelector(
        ".dnd-ct-pv-row-active",
      ) as HTMLElement | null;

      if (changedRow) {
        const animClass = changedRow.dataset.hpChange!;
        delete changedRow.dataset.hpChange;

        const panTarget = changedRow !== activeRow
          ? this.centeredScrollTarget(list, changedRow)
          : null;

        const applyAndReturn = () => {
          // Pause → shield break + flash + HP bar transition + floating number → pause → pan back
          setTimeout(() => {
            const ccData = changedRow.dataset.changedCombatant;
            let changeType = "";
            let hpDelta = 0;
            let tempDelta = 0;
            let maxDelta = 0;
            if (ccData) {
              const parsed = JSON.parse(ccData);
              changeType = parsed.changeType || "";
              hpDelta = parsed.dmg ?? 0;
              tempDelta = parsed.tempDelta ?? 0;
              maxDelta = parsed.maxDelta ?? 0;
            }

            const isHPDamage = hpDelta > 0; // prev.hp - current > 0 means damage

            // Shield break animation on actual HP damage
            if (isHPDamage) {
              const acEl = changedRow.querySelector(".dnd-ct-pv-ac") as HTMLElement | null;
              if (acEl && acEl.textContent) {
                acEl.addClass("dnd-ct-pv-ac-break");
                setTimeout(() => acEl.removeClass("dnd-ct-pv-ac-break"), 850);
              }
            }

            changedRow.addClass(animClass);

            // Transition HP bar from old to new values
            if (ccData) {
              const { id, currentHP, maxHP, tempHP, isAlly } = JSON.parse(ccData);
              this.applyHPBarTransition(changedRow, { id, currentHP, maxHP, tempHP }, isAlly);
              delete changedRow.dataset.changedCombatant;
            }

            // Floating number indicator
            const hpCell = changedRow.querySelector(".dnd-ct-pv-hp") as HTMLElement | null;
            if (hpCell) {
              hpCell.style.position = "relative";

              if (changeType === "dnd-ct-pv-row-damage" && Math.abs(hpDelta) > 0) {
                this.showFloatingNumber(hpCell, `-${Math.abs(hpDelta)}`, "dnd-ct-pv-dmg-number");
              } else if (changeType === "dnd-ct-pv-row-heal" && Math.abs(hpDelta) > 0) {
                this.showFloatingNumber(hpCell, `+${Math.abs(hpDelta)}`, "dnd-ct-pv-heal-number");
              } else if (changeType === "dnd-ct-pv-row-temp-gain" && tempDelta > 0) {
                this.showFloatingNumber(hpCell, `+${tempDelta} THP`, "dnd-ct-pv-temp-number");
              } else if (changeType === "dnd-ct-pv-row-temp-loss" && tempDelta < 0) {
                this.showFloatingNumber(hpCell, `${tempDelta} THP`, "dnd-ct-pv-temp-loss-number");
              } else if (changeType === "dnd-ct-pv-row-maxhp" && maxDelta !== 0) {
                const sign = maxDelta > 0 ? "+" : "";
                this.showFloatingNumber(hpCell, `${sign}${maxDelta} Max`, "dnd-ct-pv-maxhp-number");
              }
            }

            setTimeout(() => {
              if (activeRow && changedRow !== activeRow) {
                const activeTarget = this.centeredScrollTarget(list, activeRow);
                this.smoothScrollTo(list, activeTarget, 1000);
              }
            }, 1200);
          }, 400);
        };

        if (panTarget !== null) {
          // Pan to changed combatant first
          this.smoothScrollTo(list, panTarget, 1000, applyAndReturn);
        } else {
          applyAndReturn();
        }
      } else if (activeRow) {
        // No HP change — just pan to active combatant
        const target = this.centeredScrollTarget(list, activeRow);
        this.smoothScrollTo(list, target, 800);
      }
    });
  }

  /** Calculate the scrollTop that centers a row in the list viewport. */
  private centeredScrollTarget(list: HTMLElement, row: HTMLElement): number {
    return row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
  }

  /** Animate scrollTop from current position to target over duration ms. */
  private smoothScrollTo(el: HTMLElement, target: number, duration: number, onDone?: () => void) {
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
      this.scrollAnimationId = null;
    }

    const start = el.scrollTop;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const clampedTarget = Math.max(0, Math.min(target, maxScroll));
    const distance = clampedTarget - start;
    if (Math.abs(distance) < 1) { onDone?.(); return; }

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
        onDone?.();
      }
    };

    this.scrollAnimationId = requestAnimationFrame(step);
  }

  /** Render a circular portrait from the combatant's token marker image. */
  private renderPortrait(parent: HTMLElement, c: { name: string; tokenId?: string; notePath?: string; friendly?: boolean; player?: boolean }) {
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

    // Fallback: match by name in the marker library
    if (!imageFile && c.name) {
      const matches = this.plugin.markerLibrary.findMarkersByName(c.name);
      const withImage = matches.find((m) => m.imageFile);
      if (withImage) imageFile = withImage.imageFile;
    }

    if (!imageFile) return;

    const wrap = parent.createDiv({ cls: "dnd-ct-pv-portrait" });
    const img = wrap.createEl("img", { cls: "dnd-ct-pv-portrait-img" });
    img.src = this.app.vault.adapter.getResourcePath(imageFile);
    img.alt = "";

    // Friendly heart overlay (top-left of portrait)
    if (c.friendly && !c.player) {
      wrap.createEl("span", { text: "♥", cls: "dnd-ct-pv-portrait-friendly" });
    }
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

  private renderPVHPBar(parent: HTMLElement, c: { id: string; currentHP: number; maxHP: number; tempHP: number }, isAlly: boolean, deferAnimation: boolean) {
    const hpCell = parent.createDiv({ cls: "dnd-ct-pv-hp" });
    const pct = c.maxHP > 0 ? Math.max(0, Math.min(1, c.currentHP / c.maxHP)) : 0;
    const color = this.hpColor(pct);

    // Determine old values for animation deferral
    const prev = this.prevHP.get(c.id);
    const oldPct = prev && prev.maxHP > 0
      ? Math.max(0, Math.min(1, prev.hp / prev.maxHP))
      : pct;
    const hpChanged = Math.abs(oldPct - pct) > 0.001;
    const tempChanged = prev ? c.tempHP !== prev.tempHP : false;
    const shouldDefer = deferAnimation && (hpChanged || tempChanged);

    // When deferring, render at old values first
    const displayPct = (shouldDefer && hpChanged) ? oldPct : pct;
    const displayColor = (shouldDefer && hpChanged) ? this.hpColor(oldPct) : color;

    if (isAlly) {
      // Allies: HP bar with text inside
      const bar = hpCell.createDiv({ cls: "dnd-ct-pv-hp-bar" });

      // Ghost bar: shows the lost HP segment, then fades away
      if (oldPct > pct) {
        const ghost = bar.createDiv({ cls: "dnd-ct-pv-hp-ghost" });
        ghost.style.width = `${oldPct * 100}%`;
        // Shrink + fade is triggered later if deferred, or after 400ms
        if (!deferAnimation) {
          setTimeout(() => {
            ghost.style.width = `${pct * 100}%`;
            ghost.style.opacity = "0";
          }, 400);
        }
      }

      const fill = bar.createDiv({ cls: "dnd-ct-pv-hp-fill" });
      fill.style.width = `${displayPct * 100}%`;
      fill.style.background = displayColor;

      // Temp HP segment — show old value when deferring
      const displayTempHP = shouldDefer && prev ? prev.tempHP : c.tempHP;
      if (displayTempHP > 0) {
        const tempPct = Math.min(1, displayTempHP / c.maxHP);
        bar.createDiv({ cls: "dnd-ct-hp-temp" }).style.width = `${tempPct * 100}%`;
      }

      const oldHP = prev ? prev.hp : c.currentHP;
      const displayHP = (shouldDefer && hpChanged) ? oldHP : c.currentHP;
      const displayMax = (shouldDefer && prev && prev.maxHP !== c.maxHP) ? prev.maxHP : c.maxHP;
      let text = `${displayHP}/${displayMax}`;
      if (displayTempHP > 0) text += ` (+${displayTempHP})`;
      bar.createEl("span", { text, cls: "dnd-ct-pv-hp-text" });
    } else {
      // Enemies: condition text only, no bar
      const dispPct = (shouldDefer && hpChanged) ? oldPct : pct;
      const condition = this.hpCondition(dispPct);
      const textEl = hpCell.createEl("span", { text: condition, cls: "dnd-ct-pv-hp-text dnd-ct-pv-hp-condition" });
      textEl.style.color = displayColor;
    }

    // Store current HP for next render
    this.prevHP.set(c.id, { hp: c.currentHP, maxHP: c.maxHP, tempHP: c.tempHP });
  }

  /** Transition a deferred HP bar from old values to current values. */
  private applyHPBarTransition(row: HTMLElement, c: { id: string; currentHP: number; maxHP: number; tempHP: number }, isAlly: boolean) {
    const pct = c.maxHP > 0 ? Math.max(0, Math.min(1, c.currentHP / c.maxHP)) : 0;
    const color = this.hpColor(pct);

    if (isAlly) {
      const fill = row.querySelector(".dnd-ct-pv-hp-fill") as HTMLElement | null;
      if (fill) {
        fill.style.width = `${pct * 100}%`;
        fill.style.background = color;
      }
      const ghost = row.querySelector(".dnd-ct-pv-hp-ghost") as HTMLElement | null;
      if (ghost) {
        setTimeout(() => {
          ghost.style.width = `${pct * 100}%`;
          ghost.style.opacity = "0";
        }, 400);
      }

      // Update temp HP segment
      const bar = row.querySelector(".dnd-ct-pv-hp-bar") as HTMLElement | null;
      if (bar) {
        const oldTemp = bar.querySelector(".dnd-ct-hp-temp") as HTMLElement | null;
        if (c.tempHP > 0) {
          const tempPct = Math.min(1, c.tempHP / c.maxHP);
          if (oldTemp) {
            oldTemp.style.width = `${tempPct * 100}%`;
          } else {
            const tempEl = document.createElement("div");
            tempEl.className = "dnd-ct-hp-temp";
            tempEl.style.width = `${tempPct * 100}%`;
            bar.insertBefore(tempEl, bar.querySelector(".dnd-ct-pv-hp-text"));
          }
        } else if (oldTemp) {
          oldTemp.style.width = "0%";
          setTimeout(() => oldTemp.remove(), 600);
        }
      }

      const hpText = row.querySelector(".dnd-ct-pv-hp-text") as HTMLElement | null;
      if (hpText) {
        let text = `${c.currentHP}/${c.maxHP}`;
        if (c.tempHP > 0) text += ` (+${c.tempHP})`;
        hpText.textContent = text;
      }
    } else {
      const condEl = row.querySelector(".dnd-ct-pv-hp-condition") as HTMLElement | null;
      if (condEl) {
        condEl.textContent = this.hpCondition(pct);
        condEl.style.color = color;
      }
    }
  }

  /** Append a floating number element that auto-removes after animation. */
  private showFloatingNumber(parent: HTMLElement, text: string, cls: string) {
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = text;
    parent.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}
