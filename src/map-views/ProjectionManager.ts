/**
 * ProjectionManager — orchestrates the "Project to Monitor" workflow.
 *
 * Manages the lifecycle of one or more projected player views, each
 * pinned to a different monitor:
 * - Opens a popout window positioned on a chosen monitor
 * - Auto-fullscreens and applies per-monitor calibration
 * - Supports seamless map transitions via `swapMapOnScreen()`
 * - Persists per-monitor calibration so setup is one-time
 * - Multiple maps can be projected to different monitors simultaneously
 */

import { Notice, WorkspaceLeaf } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import type { PlayerMapView } from '../map-views/PlayerMapView';
import { PLAYER_MAP_VIEW_TYPE } from '../constants';
import type { ProjectionTarget, TabletopCalibration } from '../types';
import { enumerateScreens, screenKey, type ScreenInfo } from '../utils/ScreenEnumeration';
import { queryPhysicalMonitorSizes, matchScreenToPhysical } from '../utils/MonitorPhysicalSize';

// ── Types ──────────────────────────────────────────────────────────────

/** Projection mode: 'battle' = auto-calibrated grid-scale, 'free' = user-controlled pan/zoom. */
export type ProjectionMode = 'battle' | 'free';

export interface ProjectionState {
  /** The player view leaf currently being projected. */
  leaf: WorkspaceLeaf;
  /** The screen this projection is targeting. */
  screen: ScreenInfo;
  /** The mapId currently displayed. */
  mapId: string;
  /** Projection mode. */
  mode: ProjectionMode;
}

// ── Class ──────────────────────────────────────────────────────────────

export class ProjectionManager {
  private plugin: DndCampaignHubPlugin;

  /** All currently active projections, keyed by screenKey. */
  activeProjections: Map<string, ProjectionState> = new Map();

  /**
   * Compat getter — returns the first live projection, or null.
   * Prefer iterating `activeProjections` directly when possible.
   */
  get activeProjection(): ProjectionState | null {
    this.pruneDeadProjections();
    for (const proj of this.activeProjections.values()) {
      return proj;
    }
    return null;
  }

  constructor(plugin: DndCampaignHubPlugin) {
    this.plugin = plugin;
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Project a map to a specific screen.
   *
   * @param mode  'battle' = auto-calibrate grid to 32 mm minis, auto-orient.
   *              'free'   = user controls pan/zoom via View Mode, no auto-calibration.
   */
  async project(
    mapId: string,
    mapConfig: any,
    imageResourcePath: string,
    screen: ScreenInfo,
    mode: ProjectionMode = 'battle',
  ): Promise<void> {
    const sKey = screenKey(screen);

    // ── Reuse existing projection on the SAME screen ───────────────
    const existing = this.activeProjections.get(sKey);
    if (existing && this.isProjectionAliveOnScreen(sKey)) {
      const pv = existing.leaf.view as PlayerMapView | undefined;
      if (pv && typeof pv.swapMap === 'function') {
        existing.mapId = mapId;
        existing.mode = mode;

        if (mode === 'battle') {
          await this.ensureCalibration(screen);
          pv.swapMap(mapId, mapConfig, imageResourcePath, (fadeIn) => {
            const hasCalibration = this.applyCalibration(pv, screen, mapConfig);
            this.autoOrientAndFit(pv, screen, !hasCalibration, () => {
              fadeIn();
            });
          });
        } else {
          // Free mode: swap map, fade in immediately (no calibration/orient)
          pv.swapMap(mapId, mapConfig, imageResourcePath);
        }

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

    this.activeProjections.set(sKey, { leaf: popoutLeaf, screen, mapId, mode });

    // Save last-used screen preference
    this.plugin.settings.lastProjectionScreenKey = sKey;
    await this.plugin.saveSettings();

    // Position + fullscreen after a short delay to let the window open
    setTimeout(async () => {
      await this.positionAndFullscreen(popoutLeaf, screen);

      const pv = popoutLeaf.view as PlayerMapView | undefined;
      if (pv) {
        if (mode === 'battle') {
          await this.ensureCalibration(screen);
          const hasCalibration = this.applyCalibration(pv, screen, mapConfig);
          this.autoOrientAndFit(pv, screen, !hasCalibration, () => {
            if (typeof (pv as any).fadeInInitial === 'function') {
              (pv as any).fadeInInitial();
            }
          });
        } else {
          // Free mode: just fade in (user will position via View Mode)
          if (typeof (pv as any).fadeInInitial === 'function') {
            (pv as any).fadeInInitial();
          }
        }
      }
    }, 300);

    new Notice(`Projecting to ${screen.label} (${mode === 'battle' ? 'Battle' : 'Free'})`);
  }

  /**
   * Swap the map on a specific projection identified by its screenKey.
   * Preserves the existing projection mode.
   * No-ops if no projection exists for that screen.
   */
  async swapMapOnScreen(
    sKey: string,
    mapId: string,
    mapConfig: any,
    imageResourcePath: string,
  ): Promise<void> {
    const proj = this.activeProjections.get(sKey);
    if (!proj || !this.isProjectionAliveOnScreen(sKey)) return;

    const pv = proj.leaf.view as PlayerMapView | undefined;
    if (pv && typeof pv.swapMap === 'function') {
      proj.mapId = mapId;
      const screen = proj.screen;

      if (proj.mode === 'battle') {
        pv.swapMap(mapId, mapConfig, imageResourcePath, (fadeIn) => {
          const hasCalibration = this.applyCalibration(pv, screen, mapConfig);
          this.autoOrientAndFit(pv, screen, !hasCalibration, () => {
            fadeIn();
          });
        });
      } else {
        // Free mode: swap map without calibration/orient
        pv.swapMap(mapId, mapConfig, imageResourcePath);
      }

      new Notice(`Map transitioned on ${screen.label} — ${mapConfig.name || mapId}`);
    }
  }

  /**
   * @deprecated Use swapMapOnScreen(). Swap map on the first active projection.
   */
  async swapMap(mapId: string, mapConfig: any, imageResourcePath: string): Promise<void> {
    this.pruneDeadProjections();
    const first = this.activeProjections.keys().next().value;
    if (first) await this.swapMapOnScreen(first, mapId, mapConfig, imageResourcePath);
  }

  /** Stop a specific projection by screenKey. */
  stopProjectionOnScreen(sKey: string): void {
    const proj = this.activeProjections.get(sKey);
    if (proj) {
      try { proj.leaf.detach(); } catch { /* leaf may already be gone */ }
      this.activeProjections.delete(sKey);
      new Notice(`Projection stopped — ${proj.screen.label}`);
    }
  }

  /** Stop all active projections. */
  stopAllProjections(): void {
    for (const [sKey, proj] of this.activeProjections) {
      try { proj.leaf.detach(); } catch { /* leaf may already be gone */ }
    }
    this.activeProjections.clear();
    new Notice('All projections stopped');
  }

  /** @deprecated compat — stops all projections. */
  stopProjection(): void {
    this.stopAllProjections();
  }

  /** Whether ANY projection is alive. */
  isProjectionAlive(): boolean {
    this.pruneDeadProjections();
    return this.activeProjections.size > 0;
  }

  /** Whether a specific screen has a live projection. */
  isProjectionAliveOnScreen(sKey: string): boolean {
    const proj = this.activeProjections.get(sKey);
    if (!proj) return false;
    try {
      const view = proj.leaf.view;
      if (view && (view as any).containerEl?.isConnected) return true;
    } catch { /* ignore */ }
    this.activeProjections.delete(sKey);
    return false;
  }

  /** Get the set of screenKeys currently occupied by projections. */
  getOccupiedScreenKeys(): Set<string> {
    this.pruneDeadProjections();
    return new Set(this.activeProjections.keys());
  }

  /** Get all live projections as an array. */
  getLiveProjections(): ProjectionState[] {
    this.pruneDeadProjections();
    return Array.from(this.activeProjections.values());
  }

  /** Find the projection showing a specific mapId, if any. */
  getProjectionForMap(mapId: string): { screenKey: string; state: ProjectionState } | null {
    this.pruneDeadProjections();
    for (const [sKey, proj] of this.activeProjections) {
      if (proj.mapId === mapId) return { screenKey: sKey, state: proj };
    }
    return null;
  }

  /** Get all available screens. */
  async getScreens(): Promise<ScreenInfo[]> {
    return enumerateScreens();
  }

  // ── Housekeeping ────────────────────────────────────────────────

  /** Remove projections whose leaves are no longer connected. */
  private pruneDeadProjections(): void {
    for (const [sKey, proj] of this.activeProjections) {
      try {
        const view = proj.leaf.view;
        if (!view || !(view as any).containerEl?.isConnected) {
          this.activeProjections.delete(sKey);
        }
      } catch {
        this.activeProjections.delete(sKey);
      }
    }
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
    const existingPerScreen = this.getCalibrationForScreen(screen);

    // Only skip if this specific screen already has calibration data
    if (existingPerScreen) return;

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

      if (!win || win === window) return;

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
   * Always centers the map in the viewport afterwards.
   *
   * Waits for the player view image to load before making the decision.
   */
  private autoOrientAndFit(pv: PlayerMapView, screen: ScreenInfo, applyFitScale: boolean, onComplete?: () => void): void {
    let completed = false;
    const finish = () => { if (!completed) { completed = true; onComplete?.(); } };

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

      // Center the map in the viewport (poll until layout is ready)
      this.centerMapInViewport(pv, finish);

      return true;
    };

    // Try immediately; if the image hasn't loaded yet, poll up to ~7.5 s.
    if (!tryOrient()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (tryOrient()) {
          clearInterval(interval);
        } else if (attempts > 30) {
          clearInterval(interval);
          finish();  // don't hang forever
        }
      }, 250);
    }
  }

  /**
   * Center the map image in the player view viewport.
   *
   * The viewport may not have real layout dimensions immediately after
   * the popout window opens, so this method polls up to ~3 s until the
   * container reports a non-zero size, then computes the correct pan.
   */
  private centerMapInViewport(pv: PlayerMapView, onComplete?: () => void): void {
    let completed = false;
    const finish = () => { if (!completed) { completed = true; onComplete?.(); } };

    const tryCenter = (): boolean => {
      const img: HTMLImageElement | null = (pv as any).mapImage;
      const container: HTMLElement | null = (pv as any).mapContainer;
      if (!img || !container) return false;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const s = (pv as any).tabletopScale || 1;
      const deg = ((pv as any).tabletopRotation || 0);
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const mw = img.naturalWidth * s;
      const mh = img.naturalHeight * s;

      // Compute rotated bounding box
      const corners = [
        { x: 0, y: 0 }, { x: mw, y: 0 },
        { x: 0, y: mh }, { x: mw, y: mh },
      ].map(p => ({
        x: cos * p.x - sin * p.y,
        y: sin * p.x + cos * p.y,
      }));
      const minX = Math.min(...corners.map(p => p.x));
      const maxX = Math.max(...corners.map(p => p.x));
      const minY = Math.min(...corners.map(p => p.y));
      const maxY = Math.max(...corners.map(p => p.y));

      const bboxW = maxX - minX;
      const bboxH = maxY - minY;

      // Center: pan so that the bbox center aligns with viewport center
      const panX = (rect.width - bboxW) / 2 - minX;
      const panY = (rect.height - bboxH) / 2 - minY;

      (pv as any).tabletopPanX = panX;
      (pv as any).tabletopPanY = panY;

      // Re-apply transform with the new pan
      if (typeof (pv as any).applyTabletopTransform === 'function') {
        (pv as any).applyTabletopTransform();
      }

      finish();
      return true;
    };

    // Try immediately, then poll with increasing delays
    if (!tryCenter()) {
      const delays = [100, 200, 400, 600, 1000, 1500, 2000, 3000];
      let i = 0;
      const retry = () => {
        if (tryCenter()) return;  // finish() called inside tryCenter → applyTabletopTransform path
        if (i >= delays.length) { finish(); return; }  // give up → still fade in
        setTimeout(retry, delays[i++]);
      };
      setTimeout(retry, delays[i++]);
    }
  }
}
