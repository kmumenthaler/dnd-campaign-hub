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
import { queryPhysicalMonitorSizes, matchScreenToPhysical } from '../utils/MonitorPhysicalSize';

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

        // Auto-calibrate from EDID if no calibration exists for the new screen
        await this.ensureCalibration(screen);

        // Apply calibration for potentially different screen
        const hasCalibration = this.applyCalibration(pv, screen, mapConfig);

        // Re-orient after the swap animation finishes
        setTimeout(() => {
          this.autoOrientAndFit(pv, screen, !hasCalibration);
        }, 800);

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
    setTimeout(async () => {
      await this.positionAndFullscreen(popoutLeaf, screen);

      // Auto-calibrate from EDID if no calibration exists
      await this.ensureCalibration(screen);

      // Apply per-monitor calibration
      const pv = popoutLeaf.view as PlayerMapView | undefined;
      if (pv) {
        const hasCalibration = this.applyCalibration(pv, screen, mapConfig);
        // Auto-orient (rotate if elongated) and fit-to-screen when no calibration
        this.autoOrientAndFit(pv, screen, !hasCalibration);
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
      const screen = this.activeProjection.screen;

      // Apply calibration + orientation after the swap animation finishes
      // swapMap does fade-out 300 ms → _doSwap → fade-in 100 ms + 350 ms
      setTimeout(() => {
        const hasCalibration = this.applyCalibration(pv, screen, mapConfig);
        this.autoOrientAndFit(pv, screen, !hasCalibration);
      }, 800);

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

  // ── Auto-calibration ─────────────────────────────────────────────

  /**
   * Ensure calibration data exists for a screen.
   * If no manual calibration is saved, auto-detect physical dimensions
   * from EDID via WMI and compute pixelsPerMm automatically.
   */
  private async ensureCalibration(screen: ScreenInfo): Promise<void> {
    // Skip if any calibration already exists (manual or previous auto)
    if (this.getCalibrationForScreen(screen) || this.plugin.settings.tabletopCalibration) return;

    const autoCal = this.autoCalibrate(screen);
    if (autoCal) {
      await this.saveCalibrationForScreen(screen, autoCal);
      new Notice(
        `Auto-calibrated ${screen.label}: ` +
        `${autoCal.monitorDiagonalInch}" diagonal, ` +
        `${autoCal.pixelsPerMm.toFixed(1)} px/mm`
      );
    }
  }

  /**
   * Attempt to compute calibration from the monitor's EDID physical
   * dimensions (queried via WMI on Windows).
   *
   * @returns A TabletopCalibration if physical dimensions were found,
   *          or null if detection failed.
   */
  private autoCalibrate(screen: ScreenInfo): TabletopCalibration | null {
    try {
      const monitors = queryPhysicalMonitorSizes();
      if (!monitors.length) return null;

      const matched = matchScreenToPhysical(screen.label, monitors);
      if (!matched || matched.widthCm <= 0) return null;

      const physWidthMm = matched.widthCm * 10;
      const physHeightMm = matched.heightCm * 10;
      const pixelsPerMm = screen.width / physWidthMm;
      const diagMm = Math.sqrt(physWidthMm ** 2 + physHeightMm ** 2);
      const diagInch = Math.round((diagMm / 25.4) * 10) / 10;

      console.log(
        `ProjectionManager: autoCalibrate matched "${screen.label}" → ` +
        `"${matched.friendlyName}" (${matched.widthCm}×${matched.heightCm} cm, ` +
        `${diagInch}", ${pixelsPerMm.toFixed(2)} px/mm)`
      );

      return {
        monitorDiagonalInch: diagInch,
        pixelsPerMm,
        miniBaseMm: 25, // standard D&D miniature base
      };
    } catch (e) {
      console.warn('ProjectionManager: autoCalibrate failed', e);
      return null;
    }
  }

  // ── Internals ───────────────────────────────────────────────────

  /**
   * Position the popout window on the target screen and request fullscreen.
   *
   * Strategy 1 (preferred): Use Electron's BrowserWindow.setBounds() +
   * setFullScreen() — this is the only reliable way to move an Electron
   * window to a specific monitor.
   *
   * Strategy 2: requestFullscreen({ screen }) from the Multi-Screen
   * Window Placement API (Chromium spec, may not work in Electron).
   *
   * Strategy 3: moveTo/resizeTo with retries + manual fullscreen.
   */
  private async positionAndFullscreen(leaf: WorkspaceLeaf, screen: ScreenInfo): Promise<void> {
    try {
      const win: Window | null = (leaf as any).containerEl?.win
        ?? leaf.view?.containerEl?.ownerDocument?.defaultView
        ?? null;

      if (!win || win === window) {
        console.warn('ProjectionManager: no popout window reference');
        return;
      }

      const pv = leaf.view as PlayerMapView | undefined;
      const targetBounds = {
        x: Math.round(screen.left),
        y: Math.round(screen.top),
        width: Math.round(screen.width),
        height: Math.round(screen.height),
      };

      // ── Strategy 1: Electron BrowserWindow API ──────────────────
      const bw = this.getElectronBrowserWindow(win);
      if (bw) {
        console.log('ProjectionManager: setBounds', targetBounds);
        bw.setBounds(targetBounds);
        await new Promise(r => setTimeout(r, 200));
        bw.setFullScreen(true);

        if (pv) {
          (pv as any).isFullscreen = true;
          if (typeof (pv as any).hideObsidianChrome === 'function') {
            (pv as any).hideObsidianChrome();
          }
        }
        return;
      }

      // ── Strategy 2: requestFullscreen({ screen }) ───────────────
      if (screen._native) {
        try {
          await win.document.documentElement.requestFullscreen({
            screen: screen._native,
          } as any);
          if (pv) {
            (pv as any).isFullscreen = true;
            if (typeof (pv as any).hideObsidianChrome === 'function') {
              (pv as any).hideObsidianChrome();
            }
          }
          return;
        } catch (e) {
          console.warn('ProjectionManager: requestFullscreen({ screen }) failed', e);
        }
      }

      // ── Strategy 3: moveTo / resizeTo with retries ──────────────
      const place = () => {
        win.moveTo(targetBounds.x, targetBounds.y);
        win.resizeTo(targetBounds.width, targetBounds.height);
      };
      place();
      setTimeout(place, 150);
      setTimeout(place, 400);
      setTimeout(place, 800);

      setTimeout(() => {
        try {
          if (pv && typeof pv.toggleFullscreen === 'function') {
            if (!(pv as any).isFullscreen) {
              pv.toggleFullscreen();
            }
          } else {
            win.document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch { /* fullscreen may be blocked by policy */ }
      }, 1000);
    } catch (e) {
      console.warn('ProjectionManager: positionAndFullscreen failed', e);
    }
  }

  /**
   * Attempt to obtain the Electron `BrowserWindow` handle for a popout
   * window.  Uses dynamic require to avoid esbuild bundling issues.
   */
  private getElectronBrowserWindow(popoutWin: Window): any {
    // Dynamic require so esbuild doesn't try to resolve Electron modules.
    const _require: NodeRequire | undefined =
      (popoutWin as any).require ?? (globalThis as any).require;

    if (!_require) return null;

    // Method 1: @electron/remote from the popout window's renderer context.
    try {
      const remote = _require('@electron/remote');
      if (remote?.getCurrentWindow) {
        const bw = remote.getCurrentWindow();
        if (bw && typeof bw.setBounds === 'function') {
          return bw;
        }
      }
    } catch { /* module not available */ }

    // Method 2: Look up via the main window's @electron/remote.
    try {
      const mainReq: NodeRequire | undefined = (window as any).require;
      if (mainReq) {
        const remote = mainReq('@electron/remote');
        if (remote?.BrowserWindow && remote?.getCurrentWindow) {
          const mainBW = remote.getCurrentWindow();
          const all: any[] = remote.BrowserWindow.getAllWindows();
          // Filter to non-main, non-destroyed windows; pick most recent.
          const others = all
            .filter((w: any) => w.id !== mainBW?.id && !w.isDestroyed())
            .sort((a: any, b: any) => b.id - a.id);
          if (others.length > 0) return others[0];
        }
      }
    } catch { /* module not available */ }

    // Method 3: Legacy electron.remote (pre-Electron 14).
    try {
      const electron = _require('electron');
      if (electron?.remote?.getCurrentWindow) {
        const bw = electron.remote.getCurrentWindow();
        if (bw && typeof bw.setBounds === 'function') return bw;
      }
    } catch { /* not available */ }

    console.warn('ProjectionManager: could not obtain Electron BrowserWindow');
    return null;
  }

  /**
   * Apply the stored calibration for a screen to a player view.
   * If no calibration exists, falls back to the global tabletop calibration.
   * @returns true if a calibration scale was actually applied.
   */
  private applyCalibration(pv: PlayerMapView, screen: ScreenInfo, mapConfig: any): boolean {
    const target = this.getCalibrationForScreen(screen);
    const cal: TabletopCalibration | null = target?.calibration ?? this.plugin.settings.tabletopCalibration;

    if (!cal) return false;

    const gridSize = mapConfig?.gridSize || 0;
    if (gridSize <= 0) return false;

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

    return true;
  }

  /**
   * Auto-rotate the map 90° if that orientation fills the screen better,
   * and (when no physical calibration is active) scale the map to fit.
   *
   * Waits for the player view image to load before making the decision.
   */
  private autoOrientAndFit(pv: PlayerMapView, screen: ScreenInfo, applyFitScale: boolean): void {
    const tryOrient = (): boolean => {
      const img: HTMLImageElement | null = (pv as any).mapImage;
      if (!img || !(img as any).complete || !img.naturalWidth || !img.naturalHeight) return false;

      const mw = img.naturalWidth;
      const mh = img.naturalHeight;
      const sw = screen.width;
      const sh = screen.height;

      // Fit scale for the two possible orientations
      const scaleNormal  = Math.min(sw / mw, sh / mh);
      const scaleRotated = Math.min(sw / mh, sh / mw);

      // Auto-rotate when 90° rotation yields ≥ 20 % more coverage
      const shouldRotate = scaleRotated > scaleNormal * 1.2;
      if (shouldRotate) {
        pv.setTabletopRotation(90);
      }

      // When no per-monitor calibration is active, scale the map to fill
      // the screen as closely as possible.
      if (applyFitScale) {
        const fitScale = shouldRotate ? scaleRotated : scaleNormal;
        pv.setTabletopScale(fitScale);
        if (typeof (pv as any).syncCanvasToImage === 'function') {
          (pv as any).syncCanvasToImage();
        }
      }

      return true;
    };

    // Try immediately; if the image hasn't loaded yet, poll up to ~7.5 s.
    if (!tryOrient()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (tryOrient() || attempts > 30) {
          clearInterval(interval);
        }
      }, 250);
    }
  }
}
