/**
 * PursuitPlayerView — Projectable player-facing chase lane view.
 *
 * Renders a horizontal "chase lane" showing quarry and pursuer tokens
 * with their relative positions, animated movement, distance labels,
 * dash counters, exhaustion pips, and stealth results.
 *
 * Designed for projection to a player-facing monitor via ProjectionManager.
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PURSUIT_PLAYER_VIEW_TYPE } from "../constants";
import type { PursuitState, PursuitParticipant, StealthCondition } from "./types";

/** Previous render state for animation diffing. */
interface PrevRenderState {
  positions: Map<string, number>;
  exhaustion: Map<string, number>;
  escaped: Set<string>;
  droppedOut: Set<string>;
}

export class PursuitPlayerView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private unsubscribe: (() => void) | null = null;
  private prev: PrevRenderState = {
    positions: new Map(),
    exhaustion: new Map(),
    escaped: new Set(),
    droppedOut: new Set(),
  };

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return PURSUIT_PLAYER_VIEW_TYPE; }
  getDisplayText(): string { return "Pursuit Player View"; }
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

    const state = this.plugin.pursuitTracker.getState();
    if (!state) {
      container.empty();
      container.addClass("dnd-pursuit-pv");
      container.createDiv({ cls: "dnd-pursuit-pv-empty", text: "No active chase." });
      return;
    }

    // Capture previous state BEFORE clearing DOM
    const newPrev: PrevRenderState = {
      positions: new Map(),
      exhaustion: new Map(),
      escaped: new Set(),
      droppedOut: new Set(),
    };

    container.empty();
    container.addClass("dnd-pursuit-pv");

    // Dynamic font scaling (same approach as CombatPlayerView)
    const participantCount = state.participants.filter((p) => !p.hidden).length;
    const fontSize = Math.min(4.5, Math.max(2, 80 / Math.max(participantCount * 6, 1)));
    container.style.fontSize = `${fontSize}vh`;

    // ── Header ──
    this.renderPVHeader(container, state);

    // ── Chase ended overlay ──
    if (state.ended) {
      this.renderEndedOverlay(container, state);
      return;
    }

    // ── Chase Lane ──
    if (state.started) {
      this.renderChaseLane(container, state);
      this.renderInfoBar(container, state);
    }

    // Store for next diff
    for (const p of state.participants) {
      newPrev.positions.set(p.id, p.position);
      newPrev.exhaustion.set(p.id, p.exhaustionLevel);
      if (p.escaped) newPrev.escaped.add(p.id);
      if (p.droppedOut) newPrev.droppedOut.add(p.id);
    }
    this.prev = newPrev;
  }

  // ── Header ─────────────────────────────────────────────────

  private renderPVHeader(container: HTMLElement, state: PursuitState) {
    const header = container.createDiv({ cls: "dnd-pursuit-pv-header" });

    const left = header.createDiv({ cls: "dnd-pursuit-pv-header-left" });
    left.createEl("span", { text: `Round ${state.round}`, cls: "dnd-pursuit-pv-round" });

    const center = header.createDiv({ cls: "dnd-pursuit-pv-header-center" });
    center.createEl("span", { text: state.name, cls: "dnd-pursuit-pv-name" });

    const right = header.createDiv({ cls: "dnd-pursuit-pv-header-right" });
    // Active turn
    if (state.started && !state.ended) {
      const active = state.participants[state.turnIndex];
      if (active) {
        right.createEl("span", { text: `▶ ${active.display}'s Turn`, cls: "dnd-pursuit-pv-active-turn" });
      }
    }

    // Environment + stealth condition
    const envBar = container.createDiv({ cls: "dnd-pursuit-pv-env-bar" });
    envBar.createEl("span", { text: `📍 ${state.environment.name}`, cls: "dnd-pursuit-pv-env-name" });

    const condCls = state.stealthCondition === "advantage" ? "dnd-pursuit-pv-cond-adv"
      : state.stealthCondition === "disadvantage" ? "dnd-pursuit-pv-cond-disadv"
        : "dnd-pursuit-pv-cond-normal";
    const condLabel = state.stealthCondition === "advantage" ? "Stealth: Advantage"
      : state.stealthCondition === "disadvantage" ? "Stealth: Disadvantage"
        : "Stealth: Normal";
    envBar.createEl("span", { text: condLabel, cls: `dnd-pursuit-pv-condition ${condCls}` });

    // LoS hints for quarry players
    const hints: string[] = [];
    if (state.environment.hasCover) hints.push("Cover available");
    if (state.environment.hasObscurement) hints.push("Obscured areas");
    if (state.environment.hasElevation) hints.push("Elevation changes");
    if (state.environment.crowdedOrNoisy) hints.push("Crowded/Noisy");
    if (hints.length > 0) {
      envBar.createEl("span", { text: `Break LoS: ${hints.join(" · ")}`, cls: "dnd-pursuit-pv-los-hints" });
    }
  }

  // ── Chase Lane ─────────────────────────────────────────────

  private renderChaseLane(container: HTMLElement, state: PursuitState) {
    const visible = state.participants.filter((p) => !p.hidden);
    if (visible.length === 0) return;

    // Calculate position range for scaling
    const positions = visible.map((p) => p.position);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);
    const range = Math.max(maxPos - minPos, 60); // Minimum 60ft range
    const padding = 30; // Extra padding on each side

    const lane = container.createDiv({ cls: "dnd-pursuit-pv-lane" });

    // Direction labels
    const dirBar = lane.createDiv({ cls: "dnd-pursuit-pv-dir-bar" });
    dirBar.createEl("span", { text: "← CAUGHT", cls: "dnd-pursuit-pv-dir-caught" });
    dirBar.createEl("span", { text: "ESCAPED →", cls: "dnd-pursuit-pv-dir-escaped" });

    // Track area
    const track = lane.createDiv({ cls: "dnd-pursuit-pv-track" });

    // Distance markers (every 30ft)
    const markerStart = Math.floor((minPos - padding) / 30) * 30;
    const markerEnd = Math.ceil((maxPos + padding) / 30) * 30;
    for (let ft = markerStart; ft <= markerEnd; ft += 30) {
      const pct = this.posToPercent(ft, minPos - padding, range + padding * 2);
      const marker = track.createDiv({ cls: "dnd-pursuit-pv-dist-marker" });
      marker.style.left = `${pct}%`;
      marker.createEl("span", { text: `${ft}ft`, cls: "dnd-pursuit-pv-dist-label" });
    }

    // Render tokens grouped by approximate row
    const quarries = visible.filter((p) => p.role === "quarry" && !p.escaped && !p.droppedOut);
    const pursuers = visible.filter((p) => p.role === "pursuer" && !p.droppedOut);
    const escapedList = visible.filter((p) => p.escaped);
    const droppedList = visible.filter((p) => p.droppedOut);

    // Quarry row
    const quarryRow = track.createDiv({ cls: "dnd-pursuit-pv-token-row dnd-pursuit-pv-quarry-row" });
    for (const p of quarries) {
      this.renderToken(quarryRow, p, state, minPos - padding, range + padding * 2);
    }

    // Pursuer row
    const pursuerRow = track.createDiv({ cls: "dnd-pursuit-pv-token-row dnd-pursuit-pv-pursuer-row" });
    for (const p of pursuers) {
      this.renderToken(pursuerRow, p, state, minPos - padding, range + padding * 2);
    }

    // Distance lines between nearest quarry-pursuer pairs
    this.renderDistanceLines(track, quarries, pursuers, minPos - padding, range + padding * 2);

    // Escaped tokens (right edge)
    if (escapedList.length > 0) {
      const escRow = track.createDiv({ cls: "dnd-pursuit-pv-escaped-row" });
      for (const p of escapedList) {
        const token = escRow.createDiv({ cls: "dnd-pursuit-pv-token dnd-pursuit-pv-token-escaped" });
        token.createEl("span", { text: this.getTokenIcon(p), cls: "dnd-pursuit-pv-token-icon" });
        token.createEl("span", { text: p.display, cls: "dnd-pursuit-pv-token-name" });
        token.createEl("span", { text: "ESCAPED!", cls: "dnd-pursuit-pv-escaped-label" });
      }
    }
  }

  // ── Token Rendering ────────────────────────────────────────

  private renderToken(
    row: HTMLElement,
    p: PursuitParticipant,
    state: PursuitState,
    rangeStart: number,
    rangeSize: number,
  ) {
    const pct = this.posToPercent(p.position, rangeStart, rangeSize);
    const isActive = state.started && state.participants[state.turnIndex]?.id === p.id;

    const token = row.createDiv({
      cls: `dnd-pursuit-pv-token ${p.role === "quarry" ? "dnd-pursuit-pv-token-quarry" : "dnd-pursuit-pv-token-pursuer"} ${isActive ? "dnd-pursuit-pv-token-active" : ""}`,
    });
    token.style.left = `${pct}%`;

    // Animate movement
    const prevPos = this.prev.positions.get(p.id);
    if (prevPos !== undefined && prevPos !== p.position) {
      token.addClass("dnd-pursuit-pv-token-moving");
    }

    // Detect new escape
    if (p.escaped && !this.prev.escaped.has(p.id)) {
      token.addClass("dnd-pursuit-pv-token-just-escaped");
    }

    // Token content
    const iconEl = token.createDiv({ cls: "dnd-pursuit-pv-token-circle" });

    // Try to load token image from MarkerLibrary
    if (p.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(p.tokenId);
      if (marker?.imageFile) {
        const file = this.app.vault.getAbstractFileByPath(marker.imageFile);
        if (file) {
          const img = iconEl.createEl("img", { cls: "dnd-pursuit-pv-token-img" });
          img.src = this.app.vault.getResourcePath(file as any);
        }
      } else if (marker) {
        iconEl.createEl("span", { text: marker.icon || "⬤", cls: "dnd-pursuit-pv-token-icon-text" });
        if (marker.backgroundColor) iconEl.style.backgroundColor = marker.backgroundColor;
      }
    } else {
      const icon = this.getTokenIcon(p);
      iconEl.createEl("span", { text: icon, cls: "dnd-pursuit-pv-token-icon-text" });
    }

    // Name
    token.createEl("div", { text: p.display, cls: "dnd-pursuit-pv-token-label" });

    // Active turn badge
    if (isActive) {
      token.createEl("div", { text: "YOUR TURN", cls: "dnd-pursuit-pv-your-turn" });
    }

    // Carrying indicator
    if (p.carrying) {
      const carried = state.participants.find((q) => q.id === p.carrying);
      if (carried) {
        token.createEl("div", { text: `Carrying: ${carried.display}`, cls: "dnd-pursuit-pv-carrying" });
      }
    }

    // Hidden / LoS broken indicator
    if (p.lineOfSightBroken && p.role === "quarry") {
      token.createEl("div", { text: "👁️‍🗨️ Hidden", cls: "dnd-pursuit-pv-hidden-badge" });
    }

    // Stealth result (if rolled this round)
    if (p.stealthRoll !== undefined) {
      const isEscaped = p.escaped;
      token.createEl("div", {
        text: isEscaped ? `Stealth ${p.stealthRoll} ✅` : `Stealth ${p.stealthRoll} ❌`,
        cls: `dnd-pursuit-pv-stealth-result ${isEscaped ? "dnd-pursuit-pv-stealth-pass" : "dnd-pursuit-pv-stealth-fail"}`,
      });
    }
  }

  // ── Distance Lines ─────────────────────────────────────────

  private renderDistanceLines(
    track: HTMLElement,
    quarries: PursuitParticipant[],
    pursuers: PursuitParticipant[],
    rangeStart: number,
    rangeSize: number,
  ) {
    if (quarries.length === 0 || pursuers.length === 0) return;

    // Find lead pursuer (highest position)
    const leadPursuer = pursuers.reduce((a, b) => a.position > b.position ? a : b);

    for (const q of quarries) {
      const dist = Math.abs(q.position - leadPursuer.position);
      if (dist === 0) continue;

      const minP = Math.min(q.position, leadPursuer.position);
      const maxP = Math.max(q.position, leadPursuer.position);
      const leftPct = this.posToPercent(minP, rangeStart, rangeSize);
      const rightPct = this.posToPercent(maxP, rangeStart, rangeSize);

      const line = track.createDiv({ cls: "dnd-pursuit-pv-distance-line" });
      line.style.left = `${leftPct}%`;
      line.style.width = `${rightPct - leftPct}%`;

      const label = line.createDiv({ cls: "dnd-pursuit-pv-distance-label" });
      label.textContent = `${dist}ft`;

      // Warning if within melee range
      if (dist <= 5) {
        line.addClass("dnd-pursuit-pv-distance-melee");
        label.textContent = `${dist}ft ⚔️`;
      }
    }
  }

  // ── Info Bar (bottom) ──────────────────────────────────────

  private renderInfoBar(container: HTMLElement, state: PursuitState) {
    const bar = container.createDiv({ cls: "dnd-pursuit-pv-info-bar" });

    const visible = state.participants.filter((p) => !p.hidden && !p.escaped && !p.droppedOut);

    // Dash counters
    const dashDiv = bar.createDiv({ cls: "dnd-pursuit-pv-dash-section" });
    dashDiv.createEl("span", { text: "Dashes: ", cls: "dnd-pursuit-pv-info-label" });
    for (const p of visible) {
      const span = dashDiv.createEl("span", { cls: "dnd-pursuit-pv-dash-entry" });
      span.textContent = `${p.display} ${p.dashesUsed}/${p.freeDashes}`;
      if (p.dashesUsed > p.freeDashes) span.addClass("dnd-pursuit-pv-dash-over");
    }

    // Exhaustion pips
    const exDiv = bar.createDiv({ cls: "dnd-pursuit-pv-exhaustion-section" });
    exDiv.createEl("span", { text: "Exhaustion: ", cls: "dnd-pursuit-pv-info-label" });
    for (const p of visible) {
      const entry = exDiv.createDiv({ cls: "dnd-pursuit-pv-ex-entry" });
      entry.createEl("span", { text: `${p.display} `, cls: "dnd-pursuit-pv-ex-name" });
      for (let i = 0; i < 5; i++) {
        const prevEx = this.prev.exhaustion.get(p.id) ?? 0;
        const pip = entry.createEl("span", {
          text: i < p.exhaustionLevel ? "●" : "○",
          cls: `dnd-pursuit-pv-ex-pip ${i < p.exhaustionLevel ? "dnd-pursuit-pv-ex-filled" : ""}`,
        });
        // New exhaustion animation
        if (i < p.exhaustionLevel && i >= prevEx) {
          pip.addClass("dnd-pursuit-pv-ex-new");
        }
      }
    }
  }

  // ── Ended Overlay ──────────────────────────────────────────

  private renderEndedOverlay(container: HTMLElement, state: PursuitState) {
    const overlay = container.createDiv({ cls: "dnd-pursuit-pv-ended-overlay" });

    const outcomeClass = state.outcome === "escaped" ? "dnd-pursuit-pv-outcome-escaped"
      : state.outcome === "caught" ? "dnd-pursuit-pv-outcome-caught"
        : "dnd-pursuit-pv-outcome-other";

    const outcomeText = state.outcome === "escaped" ? "🏃 ESCAPED!"
      : state.outcome === "caught" ? "⚔️ CAUGHT!"
        : "🏁 CHASE OVER";

    overlay.createEl("h1", { text: outcomeText, cls: `dnd-pursuit-pv-outcome ${outcomeClass}` });

    // Show who escaped / was caught
    for (const p of state.participants.filter((q) => q.role === "quarry")) {
      const icon = p.escaped ? "✅" : p.droppedOut ? "❌" : p.incapacitated ? "💀" : "⚔️";
      overlay.createEl("div", {
        text: `${icon} ${p.display}`,
        cls: `dnd-pursuit-pv-outcome-member ${p.escaped ? "dnd-pursuit-pv-outcome-esc" : "dnd-pursuit-pv-outcome-caught-member"}`,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private posToPercent(pos: number, rangeStart: number, rangeSize: number): number {
    if (rangeSize === 0) return 50;
    return ((pos - rangeStart) / rangeSize) * 100;
  }

  private getTokenIcon(p: PursuitParticipant): string {
    if (p.role === "quarry") return p.player ? "🏃" : "🏃‍♂️";
    return "🔍";
  }
}
