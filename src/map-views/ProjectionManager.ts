/**
 * ProjectionManager — orchestrates the "Project to Monitor" workflow.
 *
 * Manages the lifecycle of a single projected player view:
 * - Opens a popout window positioned on a chosen monitor
 * - Auto-fullscreens and applies per-monitor calibration
 * - Supports seamless map transitions via `swapMap()`
 * - Persists per-monitor calibration so setup is one-time
 */

import { Notice, WorkspaceLeaf } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import type { PlayerMapView } from '../map-views/PlayerMapView';
import { PLAYER_MAP_VIEW_TYPE } from '../constants';
import type { ProjectionTarget, TabletopCalibration } from '../types';
import { enumerateScreens, screenKey, type ScreenInfo } from '../utils/ScreenEnumeration';

// ── Types ──────────────────────────────────────────────────────────────

export interface ProjectionState {
  /** The player view leaf currently being projected. */
  leaf: WorkspaceLeaf;
  /** The screen this projection is targeting. */
  screen: ScreenInfo;
  /** The mapId currently displayed. */
  mapId: string;
}

// ── Class ──────────────────────────────────────────────────────────────

export class ProjectionManager {
  private plugin: DndCampaignHubPlugin;

  /** The currently active projection, or null if nothing is projected. */
  activeProjection: ProjectionState | null = null;

  constructor(plugin: DndCampaignHubPlugin) {
    this.plugin = plugin;
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Project a map to a specific screen.
   *
   * If an active projection exists and is still alive, this reuses the
   * existing window (calling `swapMap`) rather than opening a new one.
   * Otherwise it opens a new popout leaf, positions it on the target
   * screen, fullscreens it, and applies stored calibration.
   */
  async project(
    mapId: string,
    mapConfig: any,
    imageResourcePath: string,
    screen: ScreenInfo,
  ): Promise<void> {
    // ── Reuse existing projection window if possible ───────────────
    if (this.activeProjection && this.isProjectionAlive()) {
      const pv = this.activeProjection.leaf.view as PlayerMapView | undefined;
      if (pv && typeof pv.swapMap === 'function') {
        pv.swapMap(mapId, mapConfig, imageResourcePath);
        this.activeProjection.mapId = mapId;
        this.activeProjection.screen = screen;

        // Apply calibration for potentially different screen
        this.applyCalibration(pv, screen, mapConfig);

        new Notice(`Projection updated — ${mapConfig.name || mapId}`);
        return;
      }
    }

    // ── Open a fresh popout window ────────────────────────────────
    const popoutLeaf = this.plugin.app.workspace.openPopoutLeaf({
      size: { width: screen.width, height: screen.height },
    });

    await popoutLeaf.setViewState({
      type: PLAYER_MAP_VIEW_TYPE,
      active: true,
      state: {
        mapId,
        mapConfig,
        imageResourcePath,
      },
    });

    this.activeProjection = { leaf: popoutLeaf, screen, mapId };

    // Save last-used screen preference
    this.plugin.settings.lastProjectionScreenKey = screenKey(screen);
    await this.plugin.saveSettings();

    // Position + fullscreen after a short delay to let the window open
    setTimeout(() => {
      this.positionAndFullscreen(popoutLeaf, screen);

      // Apply per-monitor calibration
      const pv = popoutLeaf.view as PlayerMapView | undefined;
      if (pv) {
        this.applyCalibration(pv, screen, mapConfig);
      }
    }, 300);

    new Notice(`Projecting to ${screen.label}`);
  }

  /**
   * Swap the map on an active projection without touching the window.
   * No-ops if there is no active projection.
   */
  async swapMap(mapId: string, mapConfig: any, imageResourcePath: string): Promise<void> {
    if (!this.activeProjection || !this.isProjectionAlive()) {
      return;
    }
    const pv = this.activeProjection.leaf.view as PlayerMapView | undefined;
    if (pv && typeof pv.swapMap === 'function') {
      pv.swapMap(mapId, mapConfig, imageResourcePath);
      this.activeProjection.mapId = mapId;
      this.applyCalibration(pv, this.activeProjection.screen, mapConfig);
      new Notice(`Map transitioned — ${mapConfig.name || mapId}`);
    }
  }

  /** Close the active projection and clean up. */
  stopProjection(): void {
    if (this.activeProjection) {
      try {
        this.activeProjection.leaf.detach();
      } catch { /* leaf may already be gone */ }
      this.activeProjection = null;
      new Notice('Projection stopped');
    }
  }

  /** Whether there is a live projection window. */
  isProjectionAlive(): boolean {
    if (!this.activeProjection) return false;
    try {
      const view = this.activeProjection.leaf.view;
      return !!view && !!(view as any).containerEl?.isConnected;
    } catch {
      this.activeProjection = null;
      return false;
    }
  }

  /** Get all available screens. */
  async getScreens(): Promise<ScreenInfo[]> {
    return enumerateScreens();
  }

  // ── Per-monitor calibration persistence ─────────────────────────

  /** Retrieve the stored calibration for a given screen, or null. */
  getCalibrationForScreen(screen: ScreenInfo): ProjectionTarget | null {
    const key = screenKey(screen);
    return this.plugin.settings.projectionTargets.find(t => t.screenKey === key) ?? null;
  }

  /** Save or update calibration for a screen. */
  async saveCalibrationForScreen(screen: ScreenInfo, calibration: TabletopCalibration): Promise<void> {
    const key = screenKey(screen);
    const targets = this.plugin.settings.projectionTargets;
    const existing = targets.findIndex(t => t.screenKey === key);

    const entry: ProjectionTarget = {
      screenKey: key,
      screenLabel: screen.label,
      screenBounds: { left: screen.left, top: screen.top, width: screen.width, height: screen.height },
      devicePixelRatio: screen.devicePixelRatio,
      calibration,
    };

    if (existing >= 0) {
      targets[existing] = entry;
    } else {
      targets.push(entry);
    }

    await this.plugin.saveSettings();
  }

  /** Remove stored calibration for a screen. */
  async removeCalibrationForScreen(screen: ScreenInfo): Promise<void> {
    const key = screenKey(screen);
    this.plugin.settings.projectionTargets = this.plugin.settings.projectionTargets.filter(t => t.screenKey !== key);
    await this.plugin.saveSettings();
  }

  // ── Internals ───────────────────────────────────────────────────

  /**
   * Position the popout window on the target screen and request fullscreen.
   */
  private positionAndFullscreen(leaf: WorkspaceLeaf, screen: ScreenInfo): void {
    try {
      // Get the popout window from the leaf's container
      const win: Window | null = (leaf as any).containerEl?.win
        ?? leaf.view?.containerEl?.ownerDocument?.defaultView
        ?? null;

      if (!win || win === window) return; // only works on actual popout windows

      // Move to the target screen's coordinates
      win.moveTo(screen.left, screen.top);
      win.resizeTo(screen.width, screen.height);

      // Request full-screen on the document element
      setTimeout(() => {
        try {
          const pv = leaf.view as PlayerMapView | undefined;
          if (pv && typeof pv.toggleFullscreen === 'function') {
            // Use PlayerMapView's built-in fullscreen which also hides Obsidian chrome
            if (!(pv as any).isFullscreen) {
              pv.toggleFullscreen();
            }
          } else {
            // Direct fullscreen as fallback
            win.document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch { /* fullscreen may be blocked by browser policy */ }
      }, 200);
    } catch (e) {
      console.warn('ProjectionManager: positionAndFullscreen failed', e);
    }
  }

  /**
   * Apply the stored calibration for a screen to a player view.
   * If no calibration exists, falls back to the global tabletop calibration.
   */
  private applyCalibration(pv: PlayerMapView, screen: ScreenInfo, mapConfig: any): void {
    const target = this.getCalibrationForScreen(screen);
    const cal: TabletopCalibration | null = target?.calibration ?? this.plugin.settings.tabletopCalibration;

    if (!cal) return;

    const gridSize = mapConfig?.gridSize || 0;
    if (gridSize <= 0) return;

    // Scale such that (gridSize * scale) CSS px == (miniBaseMm * pixelsPerMm)
    const calibratedScale = (cal.pixelsPerMm * cal.miniBaseMm) / gridSize;
    const safeScale = Math.max(0.001, Math.min(100, calibratedScale));

    if (typeof (pv as any).setTabletopScale === 'function') {
      (pv as any).setTabletopScale(safeScale);
    } else {
      (pv as any).tabletopScale = safeScale;
    }

    if (typeof (pv as any).syncCanvasToImage === 'function') {
      (pv as any).syncCanvasToImage();
    }
  }
}
