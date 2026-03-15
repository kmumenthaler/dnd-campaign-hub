/**
 * PursuitPlayerView — Projectable player-facing chase lane view.
 *
 * Renders a horizontal "chase lane" showing quarry and pursuer tokens
 * with their relative positions, animated movement, distance labels,
 * dash counters, exhaustion pips, and stealth results.
 *
 * Designed for projection to a player-facing monitor via ProjectionManager.
 */

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PURSUIT_PLAYER_VIEW_TYPE } from "../constants";
import type { PursuitState, PursuitParticipant, StealthCondition } from "./types";
import type { MarkerDefinition } from "../marker/MarkerTypes";

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

  // ── Chase Lane (2D scatter layout) ──────────────────────

  private renderChaseLane(container: HTMLElement, state: PursuitState) {
    const visible = state.participants.filter((p) => !p.hidden && !p.carriedBy && !p.grappledBy);
    if (visible.length === 0) return;

    // Calculate position range for horizontal scaling
    const allPos = state.participants.filter((p) => !p.hidden).map((p) => p.position);
    const minPos = Math.min(...allPos);
    const maxPos = Math.max(...allPos);
    const range = Math.max(maxPos - minPos, 60);
    const pad = 30;
    const rangeStart = minPos - pad;
    const rangeSize = range + pad * 2;

    const lane = container.createDiv({ cls: "dnd-pursuit-pv-lane dnd-pursuit-pv-lane-2d" });

    // Direction labels
    const dirBar = lane.createDiv({ cls: "dnd-pursuit-pv-dir-bar" });
    dirBar.createEl("span", { text: "← CAUGHT", cls: "dnd-pursuit-pv-dir-caught" });
    dirBar.createEl("span", { text: "ESCAPED →", cls: "dnd-pursuit-pv-dir-escaped" });

    // Scene area (2D scatter field)
    const scene = lane.createDiv({ cls: "dnd-pursuit-pv-scene dnd-pursuit-pv-scene-2d" });

    // ── Environment zone overlays ──
    this.renderEnvironmentZones(scene, state);

    // ── Distance markers (bottom ruler) ──
    const mStart = Math.floor(rangeStart / 30) * 30;
    const mEnd = Math.ceil((rangeStart + rangeSize) / 30) * 30;
    for (let ft = mStart; ft <= mEnd; ft += 30) {
      const pct = this.posToPercent(ft, rangeStart, rangeSize);
      const m = scene.createDiv({ cls: "dnd-pursuit-pv-dist-marker" });
      m.style.left = `${pct}%`;
      m.createEl("span", { text: `${ft}ft`, cls: "dnd-pursuit-pv-dist-label" });
    }

    const quarries = visible.filter((p) => p.role === "quarry" && !p.escaped && !p.droppedOut);
    const pursuers = visible.filter((p) => p.role === "pursuer" && !p.droppedOut);
    const escapedList = state.participants.filter((p) => !p.hidden && p.escaped);

    // ── SVG range lines between pursuers and nearest quarry ──
    this.renderRangeLines(scene, quarries, pursuers, rangeStart, rangeSize);

    // ── Render tokens with 2D scatter positioning ──
    // Pursuers occupy top band (10%-40%), quarry occupy bottom band (60%-90%)
    // Within each band, spread tokens vertically to avoid overlap
    const pursuerYSlots = this.assignYSlots(pursuers, 12, 40);
    const quarryYSlots = this.assignYSlots(quarries, 60, 88);

    for (const p of pursuers) {
      const xPct = this.posToPercent(p.position, rangeStart, rangeSize);
      const yPct = pursuerYSlots.get(p.id) ?? 25;
      this.renderScatterToken(scene, p, state, xPct, yPct);
    }

    for (const p of quarries) {
      const xPct = this.posToPercent(p.position, rangeStart, rangeSize);
      const yPct = quarryYSlots.get(p.id) ?? 75;
      this.renderScatterToken(scene, p, state, xPct, yPct);
    }

    // ── Role region labels ──
    const pursuerLabel = scene.createDiv({ cls: "dnd-pursuit-pv-role-label dnd-pursuit-pv-role-pursuers" });
    pursuerLabel.textContent = "🔍 Pursuers";
    const quarryLabel = scene.createDiv({ cls: "dnd-pursuit-pv-role-label dnd-pursuit-pv-role-quarry" });
    quarryLabel.textContent = "🏃 Quarry";

    // ── Distance labels between pursuer and quarry positions ──
    const quarryGroups = this.groupByPosition(quarries);
    const pursuerGroups = this.groupByPosition(pursuers);
    const distBar = scene.createDiv({ cls: "dnd-pursuit-pv-distance-bar" });
    if (quarryGroups.size > 0 && pursuerGroups.size > 0) {
      const nearestQuarryPos = Math.min(...quarryGroups.keys());
      for (const [pos] of pursuerGroups) {
        const dist = Math.abs(nearestQuarryPos - pos);
        const midPct = this.posToPercent((nearestQuarryPos + pos) / 2, rangeStart, rangeSize);
        const label = distBar.createDiv({ cls: "dnd-pursuit-pv-dist-inline" });
        label.style.left = `${midPct}%`;
        label.textContent = dist <= 5 ? `${dist}ft ⚔️` : `${dist}ft`;
      }
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

  // ── Environment Zones ──────────────────────────────────────

  /** Render subtle background zone indicators based on environment flags. */
  private renderEnvironmentZones(scene: HTMLElement, state: PursuitState): void {
    const env = state.environment;
    const tags: { label: string; cls: string }[] = [];
    if (env.hasCover) tags.push({ label: "🛡️ Cover", cls: "dnd-pursuit-pv-zone-cover" });
    if (env.hasObscurement) tags.push({ label: "🌫️ Obscured", cls: "dnd-pursuit-pv-zone-obscured" });
    if (env.crowdedOrNoisy) tags.push({ label: "👥 Crowded", cls: "dnd-pursuit-pv-zone-crowd" });
    if (env.hasElevation) tags.push({ label: "⬆️ Elevation", cls: "dnd-pursuit-pv-zone-elevation" });
    if (env.wideOpen) tags.push({ label: "🏜️ Wide Open", cls: "dnd-pursuit-pv-zone-open" });
    if (tags.length === 0) return;

    const zoneBar = scene.createDiv({ cls: "dnd-pursuit-pv-env-zones" });
    for (const tag of tags) {
      zoneBar.createEl("span", { text: tag.label, cls: `dnd-pursuit-pv-env-zone-tag ${tag.cls}` });
    }
  }

  // ── Range Lines (SVG) ──────────────────────────────────────

  /** Draw SVG lines connecting each pursuer to their nearest quarry. */
  private renderRangeLines(
    scene: HTMLElement,
    quarries: PursuitParticipant[],
    pursuers: PursuitParticipant[],
    rangeStart: number,
    rangeSize: number,
  ): void {
    if (quarries.length === 0 || pursuers.length === 0) return;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "dnd-pursuit-pv-range-svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.pointerEvents = "none";
    svg.style.overflow = "visible";

    // Assign consistent Y slots for positioning
    const pursuerYSlots = this.assignYSlots(pursuers, 12, 40);
    const quarryYSlots = this.assignYSlots(quarries, 60, 88);

    for (const pur of pursuers) {
      // Find nearest quarry
      let nearest: PursuitParticipant | null = null;
      let nearestDist = Infinity;
      for (const q of quarries) {
        const d = Math.abs(q.position - pur.position);
        if (d < nearestDist) { nearestDist = d; nearest = q; }
      }
      if (!nearest) continue;

      const x1Pct = this.posToPercent(pur.position, rangeStart, rangeSize);
      const y1Pct = pursuerYSlots.get(pur.id) ?? 25;
      const x2Pct = this.posToPercent(nearest.position, rangeStart, rangeSize);
      const y2Pct = quarryYSlots.get(nearest.id) ?? 75;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", `${x1Pct}%`);
      line.setAttribute("y1", `${y1Pct}%`);
      line.setAttribute("x2", `${x2Pct}%`);
      line.setAttribute("y2", `${y2Pct}%`);

      // Color-code by distance
      const dist = Math.abs(nearest.position - pur.position);
      const strokeColor = dist <= 5 ? "rgba(220, 38, 38, 0.6)"   // Red — melee range
        : dist <= 30 ? "rgba(234, 179, 8, 0.4)"                   // Yellow — close
          : "rgba(100, 116, 139, 0.2)";                            // Gray — far
      line.setAttribute("stroke", strokeColor);
      line.setAttribute("stroke-width", dist <= 5 ? "3" : "2");
      line.setAttribute("stroke-dasharray", dist <= 5 ? "none" : "6 4");

      svg.appendChild(line);

      // Range label at midpoint
      if (dist <= 60) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", `${(x1Pct + x2Pct) / 2}%`);
        text.setAttribute("y", `${(y1Pct + y2Pct) / 2}%`);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("class", "dnd-pursuit-pv-range-label");
        text.textContent = `${dist}ft`;
        svg.appendChild(text);
      }
    }

    scene.appendChild(svg);
  }

  // ── Y-Slot Assignment ──────────────────────────────────────

  /**
   * Assign vertical Y% positions for a group of tokens within a band.
   * Tokens at the same X position get staggered vertically within the band.
   */
  private assignYSlots(
    tokens: PursuitParticipant[],
    bandMin: number,
    bandMax: number,
  ): Map<string, number> {
    const slots = new Map<string, number>();
    if (tokens.length === 0) return slots;

    // Group by position to detect stacking
    const byPos = this.groupByPosition(tokens);
    const bandMid = (bandMin + bandMax) / 2;
    const bandHalf = (bandMax - bandMin) / 2;

    for (const [, group] of byPos) {
      if (group.length === 1) {
        slots.set(group[0]!.id, bandMid);
      } else {
        // Spread evenly within the band
        const step = (bandMax - bandMin) / (group.length + 1);
        for (let i = 0; i < group.length; i++) {
          slots.set(group[i]!.id, bandMin + step * (i + 1));
        }
      }
    }

    // If multiple position-groups exist, add slight jitter to avoid exact same Y
    if (byPos.size > 1) {
      const positions = [...byPos.keys()].sort((a, b) => a - b);
      for (let gi = 0; gi < positions.length; gi++) {
        const group = byPos.get(positions[gi]!)!;
        const jitter = ((gi % 3) - 1) * bandHalf * 0.15; // ±15% vertical jitter
        for (const p of group) {
          const base = slots.get(p.id) ?? bandMid;
          slots.set(p.id, Math.max(bandMin, Math.min(bandMax, base + jitter)));
        }
      }
    }

    return slots;
  }

  // ── 2D Scatter Token Rendering ─────────────────────────────

  /** Render a single token at an absolute (x%, y%) position within the scene. */
  private renderScatterToken(
    scene: HTMLElement,
    p: PursuitParticipant,
    state: PursuitState,
    xPct: number,
    yPct: number,
  ) {
    const isActive = state.started && state.participants[state.turnIndex]?.id === p.id;

    const wrapper = scene.createDiv({ cls: "dnd-pursuit-pv-scatter-token" });
    wrapper.style.left = `${xPct}%`;
    wrapper.style.top = `${yPct}%`;

    const token = wrapper.createDiv({
      cls: `dnd-pursuit-pv-token dnd-pursuit-pv-token-2d ${p.role === "quarry" ? "dnd-pursuit-pv-token-quarry" : "dnd-pursuit-pv-token-pursuer"} ${isActive ? "dnd-pursuit-pv-token-active" : ""}`,
    });

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
    const resolved = this.resolveTokenImage(p);
    if (resolved.imageFile) {
      const img = iconEl.createEl("img", { cls: "dnd-pursuit-pv-token-img" });
      img.src = this.app.vault.adapter.getResourcePath(resolved.imageFile);
    } else if (resolved.marker) {
      iconEl.createEl("span", { text: resolved.marker.icon || "⬤", cls: "dnd-pursuit-pv-token-icon-text" });
      if (resolved.marker.backgroundColor) iconEl.style.backgroundColor = resolved.marker.backgroundColor;
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
    const resolved = this.resolveTokenImage(p);
    if (resolved.imageFile) {
      const img = el.createEl("img", { cls: "dnd-pursuit-pv-sub-img" });
      img.src = this.app.vault.adapter.getResourcePath(resolved.imageFile);
      return;
    }
    el.createEl("span", { text: this.getTokenIcon(p), cls: "dnd-pursuit-pv-sub-icon" });
  }

  /**
   * Resolve the token image for a participant using 3-level fallback:
   * 1. Direct tokenId lookup
   * 2. Vault note frontmatter token_id
   * 3. Name match in marker library
   */
  private resolveTokenImage(p: PursuitParticipant): { imageFile?: string; marker?: MarkerDefinition } {
    // 1. Direct tokenId
    if (p.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(p.tokenId);
      if (marker?.imageFile) return { imageFile: marker.imageFile, marker };
      if (marker) return { marker };
    }

    // 2. Vault note frontmatter token_id
    if (p.notePath) {
      const file = this.app.vault.getAbstractFileByPath(p.notePath);
      if (file instanceof TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const noteTokenId = cache?.frontmatter?.token_id;
        if (noteTokenId) {
          const marker = this.plugin.markerLibrary.getMarker(noteTokenId);
          if (marker?.imageFile) return { imageFile: marker.imageFile, marker };
          if (marker) return { marker };
        }
      }
    }

    // 3. Name match in marker library
    const matches = this.plugin.markerLibrary.findMarkersByName(p.display);
    const withImage = matches.find((m) => m.imageFile);
    if (withImage) return { imageFile: withImage.imageFile, marker: withImage };
    if (matches.length > 0) return { marker: matches[0] };

    return {};
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

  /** Group participants by their position (for stacking detection). */
  private groupByPosition(participants: PursuitParticipant[]): Map<number, PursuitParticipant[]> {
    const map = new Map<number, PursuitParticipant[]>();
    for (const p of participants) {
      const group = map.get(p.position);
      if (group) group.push(p);
      else map.set(p.position, [p]);
    }
    return map;
  }

  private getTokenIcon(p: PursuitParticipant): string {
    if (p.role === "quarry") return p.player ? "🏃" : "🏃‍♂️";
    return "🔍";
  }
}
