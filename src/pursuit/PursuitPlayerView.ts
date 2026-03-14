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

  // ── Chase Lane (2D dynamic layout) ──────────────────────

  /** Resolved 2D position for a token. */
  private tokenPositions = new Map<string, { x: number; y: number }>();

  private renderChaseLane(container: HTMLElement, state: PursuitState) {
    const visible = state.participants.filter((p) => !p.hidden && !p.carriedBy && !p.grappledBy);
    if (visible.length === 0) return;

    // Calculate position range for scaling
    const allPos = state.participants.filter((p) => !p.hidden).map((p) => p.position);
    const minPos = Math.min(...allPos);
    const maxPos = Math.max(...allPos);
    const range = Math.max(maxPos - minPos, 60);
    const pad = 30;
    const rangeStart = minPos - pad;
    const rangeSize = range + pad * 2;

    const lane = container.createDiv({ cls: "dnd-pursuit-pv-lane" });

    // Direction labels
    const dirBar = lane.createDiv({ cls: "dnd-pursuit-pv-dir-bar" });
    dirBar.createEl("span", { text: "← CAUGHT", cls: "dnd-pursuit-pv-dir-caught" });
    dirBar.createEl("span", { text: "ESCAPED →", cls: "dnd-pursuit-pv-dir-escaped" });

    // Scene area (2D absolute positioning)
    const scene = lane.createDiv({ cls: "dnd-pursuit-pv-scene" });

    // Distance markers (bottom)
    const mStart = Math.floor(rangeStart / 30) * 30;
    const mEnd = Math.ceil((rangeStart + rangeSize) / 30) * 30;
    for (let ft = mStart; ft <= mEnd; ft += 30) {
      const pct = this.posToPercent(ft, rangeStart, rangeSize);
      const m = scene.createDiv({ cls: "dnd-pursuit-pv-dist-marker" });
      m.style.left = `${pct}%`;
      m.createEl("span", { text: `${ft}ft`, cls: "dnd-pursuit-pv-dist-label" });
    }

    // ── Compute 2D positions ──
    const quarries = visible.filter((p) => p.role === "quarry" && !p.escaped && !p.droppedOut);
    const pursuers = visible.filter((p) => p.role === "pursuer" && !p.droppedOut);
    const escapedList = state.participants.filter((p) => !p.hidden && p.escaped);

    this.tokenPositions.clear();

    // Layout tokens by grouping same-position tokens and spreading them
    this.layoutTokenGroup(quarries, rangeStart, rangeSize, 10, 50);
    this.layoutTokenGroup(pursuers, rangeStart, rangeSize, 55, 92);

    // ── Collision resolution: nudge overlapping tokens ──
    this.resolveOverlaps(visible.filter((p) => !p.escaped && !p.droppedOut));

    // ── Draw connection lines (pursuer → target) using SVG ──
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "dnd-pursuit-pv-svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    scene.appendChild(svg);

    for (const p of pursuers) {
      if (!p.activeTargetId) continue;
      const from = this.tokenPositions.get(p.id);
      const to = this.tokenPositions.get(p.activeTargetId);
      if (!from || !to) continue;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
      const dist = Math.abs(p.position - (state.participants.find((q) => q.id === p.activeTargetId)?.position ?? p.position));
      line.setAttribute("class", dist <= 5 ? "dnd-pursuit-pv-line dnd-pursuit-pv-line-melee" : "dnd-pursuit-pv-line");
      svg.appendChild(line);

      // Distance label at midpoint
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(mx));
      text.setAttribute("y", String(my - 1.5));
      text.setAttribute("class", "dnd-pursuit-pv-line-label");
      text.textContent = dist <= 5 ? `${dist}ft ⚔️` : `${dist}ft`;
      svg.appendChild(text);
    }

    // ── Render tokens ──
    for (const p of [...quarries, ...pursuers].filter((p) => !p.escaped && !p.droppedOut)) {
      this.render2DToken(scene, p, state);
    }

    // ── Render placed obstacles ──
    if (state.placedObstacles && state.placedObstacles.length > 0) {
      for (const obs of state.placedObstacles) {
        const xPct = this.posToPercent(obs.position, rangeStart, rangeSize);
        const marker = scene.createDiv({ cls: "dnd-pursuit-pv-obstacle-marker" });
        marker.style.left = `${xPct}%`;
        marker.createEl("span", { text: "⚠️", cls: "dnd-pursuit-pv-obstacle-icon" });
        marker.createEl("span", { text: obs.entry.title, cls: "dnd-pursuit-pv-obstacle-label" });
      }
    }

    // ── Escaped tokens (right edge cluster) ──
    if (escapedList.length > 0) {
      const escRow = scene.createDiv({ cls: "dnd-pursuit-pv-escaped-row" });
      for (const p of escapedList) {
        const token = escRow.createDiv({ cls: "dnd-pursuit-pv-token dnd-pursuit-pv-token-escaped" });
        token.createEl("span", { text: this.getTokenIcon(p), cls: "dnd-pursuit-pv-token-icon" });
        token.createEl("span", { text: p.display, cls: "dnd-pursuit-pv-token-name" });
        token.createEl("span", { text: "ESCAPED!", cls: "dnd-pursuit-pv-escaped-label" });
      }
    }
  }

  // ── Token Layout ───────────────────────────────────────────

  /**
   * Lay out a group of tokens (quarries or pursuers) within a Y band.
   * Tokens at the same position get spread vertically and nudged
   * horizontally to avoid overlap.
   */
  private layoutTokenGroup(
    tokens: PursuitParticipant[],
    rangeStart: number,
    rangeSize: number,
    yMin: number,
    yMax: number,
  ) {
    if (tokens.length === 0) return;

    // Group tokens by their position (feet)
    const groups = new Map<number, PursuitParticipant[]>();
    for (const p of tokens) {
      const existing = groups.get(p.position) ?? [];
      existing.push(p);
      groups.set(p.position, existing);
    }

    // For each position group, spread tokens vertically within the band
    const yRange = yMax - yMin;
    const totalTokens = tokens.length;

    // If only one group, spread all tokens evenly across the full Y band
    if (groups.size === 1) {
      const group = [...groups.values()][0]!;
      const baseX = this.posToPercent(group[0]!.position, rangeStart, rangeSize);
      const step = totalTokens > 1 ? yRange / (totalTokens - 1) : 0;
      const xSpread = Math.min(3, 12 / totalTokens); // slight horizontal spread
      group.forEach((p, i) => {
        const y = totalTokens === 1 ? yMin + yRange / 2 : yMin + i * step;
        const xOffset = totalTokens > 1 ? (i - (totalTokens - 1) / 2) * xSpread : 0;
        this.tokenPositions.set(p.id, { x: baseX + xOffset, y });
      });
      return;
    }

    // Multiple position groups: spread each group in its own vertical sub-band
    // Each group gets a proportional share of the Y space
    let yOffset = yMin;
    const sortedPositions = [...groups.keys()].sort((a, b) => a - b);

    for (const pos of sortedPositions) {
      const group = groups.get(pos)!;
      const share = (group.length / totalTokens) * yRange;
      const baseX = this.posToPercent(pos, rangeStart, rangeSize);
      const step = group.length > 1 ? share / (group.length - 1) : 0;
      const xSpread = Math.min(2.5, 10 / group.length);
      group.forEach((p, i) => {
        const y = group.length === 1 ? yOffset + share / 2 : yOffset + i * step;
        const xOffset = group.length > 1 ? (i - (group.length - 1) / 2) * xSpread : 0;
        this.tokenPositions.set(p.id, { x: baseX + xOffset, y });
      });
      yOffset += share + (yRange * 0.05); // small gap between position groups
    }
  }

  // ── Overlap Resolution ─────────────────────────────────────

  private resolveOverlaps(participants: PursuitParticipant[]) {
    const entries = participants.map((p) => ({
      id: p.id,
      pos: this.tokenPositions.get(p.id)!,
    })).filter((e) => e.pos);

    const minGapX = 6;
    const minGapY = 10;

    // Multiple passes to settle overlaps
    for (let pass = 0; pass < 5; pass++) {
      entries.sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);

      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i]!;
          const b = entries[j]!;
          const dx = Math.abs(a.pos.x - b.pos.x);
          const dy = Math.abs(a.pos.y - b.pos.y);

          if (dx < minGapX && dy < minGapY) {
            const shift = (minGapY - dy) / 2 + 0.5;
            if (b.pos.y >= a.pos.y) {
              b.pos.y = Math.min(95, b.pos.y + shift);
              a.pos.y = Math.max(5, a.pos.y - shift);
            } else {
              a.pos.y = Math.min(95, a.pos.y + shift);
              b.pos.y = Math.max(5, b.pos.y - shift);
            }
            this.tokenPositions.set(a.id, a.pos);
            this.tokenPositions.set(b.id, b.pos);
          }
        }
      }
    }
  }

  // ── 2D Token Rendering ─────────────────────────────────────

  private render2DToken(
    scene: HTMLElement,
    p: PursuitParticipant,
    state: PursuitState,
  ) {
    const pos = this.tokenPositions.get(p.id);
    if (!pos) return;
    const isActive = state.started && state.participants[state.turnIndex]?.id === p.id;

    const token = scene.createDiv({
      cls: `dnd-pursuit-pv-token dnd-pursuit-pv-token-2d ${p.role === "quarry" ? "dnd-pursuit-pv-token-quarry" : "dnd-pursuit-pv-token-pursuer"} ${isActive ? "dnd-pursuit-pv-token-active" : ""}`,
    });
    token.style.left = `${pos.x}%`;
    token.style.top = `${pos.y}%`;

    // Animate movement
    const prevPos = this.prev.positions.get(p.id);
    if (prevPos !== undefined && prevPos !== p.position) {
      token.addClass("dnd-pursuit-pv-token-moving");
    }

    // New escape animation
    if (p.escaped && !this.prev.escaped.has(p.id)) {
      token.addClass("dnd-pursuit-pv-token-just-escaped");
    }

    // Movement plane badge
    if (p.movementPlane === "air") {
      token.addClass("dnd-pursuit-pv-token-flying");
    } else if (p.movementPlane === "underground") {
      token.addClass("dnd-pursuit-pv-token-burrowing");
    }

    // Token circle with image or icon
    const iconEl = token.createDiv({ cls: "dnd-pursuit-pv-token-circle" });
    if (p.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(p.tokenId);
      if (marker?.imageFile) {
        const img = iconEl.createEl("img", { cls: "dnd-pursuit-pv-token-img" });
        img.src = this.app.vault.adapter.getResourcePath(marker.imageFile);
      } else if (marker) {
        iconEl.createEl("span", { text: marker.icon || "⬤", cls: "dnd-pursuit-pv-token-icon-text" });
        if (marker.backgroundColor) iconEl.style.backgroundColor = marker.backgroundColor;
      }
    } else {
      iconEl.createEl("span", { text: this.getTokenIcon(p), cls: "dnd-pursuit-pv-token-icon-text" });
    }

    // Plane indicator
    if (p.movementPlane === "air") {
      token.createEl("div", { text: "🦅", cls: "dnd-pursuit-pv-plane-icon" });
    } else if (p.movementPlane === "underground") {
      token.createEl("div", { text: "⛏️", cls: "dnd-pursuit-pv-plane-icon" });
    }

    // Name
    token.createEl("div", { text: p.display, cls: "dnd-pursuit-pv-token-label" });

    // Active turn badge
    if (isActive) {
      token.createEl("div", { text: "YOUR TURN", cls: "dnd-pursuit-pv-your-turn" });
    }

    // Action summary
    if (p.turnAction) {
      const actionText = p.turnAction === "dash" ? "Dashing!"
        : p.turnAction === "hide" ? "Hiding..."
        : p.turnAction === "search" ? "Searching..."
        : p.turnAction === "attack" ? "Attacking!"
        : p.turnAction === "grapple" ? "Grappling!"
        : p.turnAction === "escape-grapple" ? "Breaking free!"
        : p.turnAction === "create-obstacle" ? "Creating obstacle!"
        : "";
      if (actionText) {
        token.createEl("div", { text: actionText, cls: "dnd-pursuit-pv-action-badge" });
      }
    }

    // Movement info
    if (p.feetMovedThisTurn > 0) {
      token.createEl("div", { text: `+${p.feetMovedThisTurn}ft`, cls: "dnd-pursuit-pv-moved-badge" });
    }

    // ── Carried tokens (smaller sub-tokens) ──
    if (p.carrying.length > 0) {
      const carryCluster = token.createDiv({ cls: "dnd-pursuit-pv-carried-cluster" });
      for (const carriedId of p.carrying) {
        const c = state.participants.find((q) => q.id === carriedId);
        if (!c) continue;
        const sub = carryCluster.createDiv({ cls: "dnd-pursuit-pv-sub-token dnd-pursuit-pv-sub-carried" });
        this.renderSubTokenIcon(sub, c);
        sub.createEl("span", { text: c.display, cls: "dnd-pursuit-pv-sub-label" });
      }
    }

    // ── Grappled tokens (smaller sub-tokens with chain icon) ──
    if (p.grappling.length > 0) {
      const grpCluster = token.createDiv({ cls: "dnd-pursuit-pv-carried-cluster dnd-pursuit-pv-grapple-cluster" });
      for (const grappledId of p.grappling) {
        const g = state.participants.find((q) => q.id === grappledId);
        if (!g) continue;
        const sub = grpCluster.createDiv({ cls: "dnd-pursuit-pv-sub-token dnd-pursuit-pv-sub-grappled" });
        sub.createEl("span", { text: "🔗", cls: "dnd-pursuit-pv-chain-icon" });
        this.renderSubTokenIcon(sub, g);
        sub.createEl("span", { text: g.display, cls: "dnd-pursuit-pv-sub-label" });
      }
    }

    // Hidden indicator
    if (p.isHidden && p.role === "quarry") {
      token.addClass("dnd-pursuit-pv-token-hidden");
      token.createEl("div", { text: "👁️‍🗨️ Hidden", cls: "dnd-pursuit-pv-hidden-badge" });
    }

    // Condition badges
    if (p.conditions.length > 0) {
      const condRow = token.createDiv({ cls: "dnd-pursuit-pv-token-conditions" });
      for (const c of p.conditions) {
        condRow.createEl("span", { text: c, cls: "dnd-pursuit-pv-cond-badge" });
      }
    }

    // Incapacitated
    if (p.incapacitated) {
      token.addClass("dnd-pursuit-pv-token-incapacitated");
      token.createEl("div", { text: "💀 Down", cls: "dnd-pursuit-pv-down-badge" });
    }

    // Escaped via stealth
    if (p.escaped && p.isHidden) {
      token.createEl("div", { text: "Vanished! ✅", cls: "dnd-pursuit-pv-stealth-result dnd-pursuit-pv-stealth-pass" });
    }
  }

  /** Render a small token icon for carried/grappled sub-tokens. */
  private renderSubTokenIcon(el: HTMLElement, p: PursuitParticipant) {
    if (p.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(p.tokenId);
      if (marker?.imageFile) {
        const img = el.createEl("img", { cls: "dnd-pursuit-pv-sub-img" });
        img.src = this.app.vault.adapter.getResourcePath(marker.imageFile);
        return;
      }
    }
    el.createEl("span", { text: this.getTokenIcon(p), cls: "dnd-pursuit-pv-sub-icon" });
  }

  // ── Info Bar (bottom) ──────────────────────────────────────

  private renderInfoBar(container: HTMLElement, state: PursuitState) {
    const bar = container.createDiv({ cls: "dnd-pursuit-pv-info-bar" });

    // Only show dash/exhaustion info for player characters (not GM-controlled creatures)
    const playerVisible = state.participants.filter((p) => !p.hidden && !p.escaped && !p.droppedOut && p.player);

    if (playerVisible.length === 0) return;

    // Dash counters
    const dashDiv = bar.createDiv({ cls: "dnd-pursuit-pv-dash-section" });
    dashDiv.createEl("span", { text: "Dashes: ", cls: "dnd-pursuit-pv-info-label" });
    for (const p of playerVisible) {
      const span = dashDiv.createEl("span", { cls: "dnd-pursuit-pv-dash-entry" });
      span.textContent = `${p.display} ${p.dashesUsed}/${p.freeDashes}`;
      if (p.dashesUsed > p.freeDashes) span.addClass("dnd-pursuit-pv-dash-over");
    }

    // Exhaustion pips
    const exDiv = bar.createDiv({ cls: "dnd-pursuit-pv-exhaustion-section" });
    exDiv.createEl("span", { text: "Exhaustion: ", cls: "dnd-pursuit-pv-info-label" });
    for (const p of playerVisible) {
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
