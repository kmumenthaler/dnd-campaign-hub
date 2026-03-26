/**
 * SessionProjectionManager — manages persistent "session mode" for player-facing monitors.
 *
 * Sits above ProjectionManager:
 * - Opens IdleScreenView popouts on configured managed screens
 * - Tracks runtime ManagedScreenState per screen
 * - Transitions between idle / map / combat / media via view-state swaps
 * - When content stops, returns to idle instead of closing the window
 */

import { Notice, WorkspaceLeaf } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import { IDLE_SCREEN_VIEW_TYPE } from '../constants';
import { screenKey, type ScreenInfo } from '../utils/ScreenEnumeration';
import type { ManagedScreenConfig, ManagedScreenState, ManagedScreenStatus, HandoutProjectionState } from './types';

export class SessionProjectionManager {
  private plugin: DndCampaignHubPlugin;

  /** Whether a session is currently active. */
  private _active = false;

  /** Runtime state per managed screen, keyed by screenKey. */
  private screenStates: Map<string, ManagedScreenState> = new Map();

  /** Popout leaves opened by this manager, keyed by screenKey. */
  private managedLeaves: Map<string, WorkspaceLeaf> = new Map();

  /** Listeners notified whenever session state changes. */
  private _changeCallbacks: Set<() => void> = new Set();

  constructor(plugin: DndCampaignHubPlugin) {
    this.plugin = plugin;
  }

  // ── Change Notification ─────────────────────────────────────

  /**
   * Register a callback invoked whenever session state changes.
   * Returns an unsubscribe function.
   */
  onChange(cb: () => void): () => void {
    this._changeCallbacks.add(cb);
    return () => { this._changeCallbacks.delete(cb); };
  }

  private _notifyChange(): void {
    for (const cb of this._changeCallbacks) {
      try { cb(); } catch (e) { console.error('SessionProjectionManager onChange error:', e); }
    }
  }

  // ── Public Query API ────────────────────────────────────────────

  /** Whether a projection session is currently running. */
  isActive(): boolean {
    return this._active;
  }

  /** All managed screen keys that are part of the active session. */
  getManagedScreenKeys(): string[] {
    return Array.from(this.screenStates.keys());
  }

  /** Get runtime state for a specific screen. */
  getScreenState(sKey: string): ManagedScreenState | undefined {
    return this.screenStates.get(sKey);
  }

  /** Get all runtime screen states. */
  getAllScreenStates(): ManagedScreenState[] {
    return Array.from(this.screenStates.values());
  }

  /** Get the popout leaf for a managed screen (if alive). */
  getManagedLeaf(sKey: string): WorkspaceLeaf | null {
    const leaf = this.managedLeaves.get(sKey);
    if (!leaf) return null;
    try {
      const el = (leaf.view as any)?.containerEl;
      if (!el?.isConnected) throw new Error('disconnected');
      // Extra safety: verify the host window is still open
      const win = el.ownerDocument?.defaultView;
      if (win && win !== window && win.closed) throw new Error('window closed');
      return leaf;
    } catch { /* leaf dead */ }
    this.managedLeaves.delete(sKey);
    this.screenStates.delete(sKey);
    return null;
  }

  /** Whether a given screenKey belongs to this active session. */
  isManagedScreen(sKey: string): boolean {
    return this._active && this.managedLeaves.has(sKey);
  }

  // ── Session Lifecycle ───────────────────────────────────────────

  /**
   * Start a projection session.
   *
   * Opens an IdleScreenView popout on each managed screen configuration,
   * positions them fullscreen, and tracks their runtime state.
   *
   * @param screens  The live ScreenInfo objects (from enumerateScreens).
   * @param configs  The ManagedScreenConfig array from settings.
   */
  async startSession(
    screens: ScreenInfo[],
    configs: ManagedScreenConfig[],
  ): Promise<void> {
    if (this._active) {
      new Notice('Session is already active');
      return;
    }

    if (configs.length === 0) {
      new Notice('No managed screens configured. Set up screens first.');
      return;
    }

    // Build a lookup of live screens by key
    const screenByKey = new Map<string, ScreenInfo>();
    for (const s of screens) screenByKey.set(screenKey(s), s);

    let opened = 0;
    for (const cfg of configs) {
      const screen = screenByKey.get(cfg.screenKey);
      if (!screen) {
        console.warn(`SessionProjectionManager: screen "${cfg.screenKey}" not found — skipping`);
        continue;
      }

      const leaf = await this.openIdleScreen(screen, cfg);
      if (leaf) {
        this.managedLeaves.set(cfg.screenKey, leaf);
        this.screenStates.set(cfg.screenKey, {
          screen,
          config: cfg,
          status: 'idle',
        });
        opened++;
      }
    }

    if (opened === 0) {
      new Notice('Could not open any managed screens.');
      return;
    }

    this._active = true;
    this._notifyChange();
    new Notice(`🎬 Session started — ${opened} screen${opened > 1 ? 's' : ''} active`);
  }

  /** Stop the active session — close all managed popouts. */
  stopSession(): void {
    if (!this._active) return;

    for (const [, leaf] of this.managedLeaves) {
      try { leaf.detach(); } catch { /* already gone */ }
    }
    this.managedLeaves.clear();
    this.screenStates.clear();
    this._active = false;
    this._notifyChange();
    new Notice('🎬 Session ended — all screens closed');
  }

  // ── Screen Transitions ──────────────────────────────────────────

  /**
   * Transition a managed screen back to its idle state with a smooth crossfade.
   */
  async transitionToIdle(sKey: string): Promise<void> {
    const leaf = this.getManagedLeaf(sKey);
    const state = this.screenStates.get(sKey);
    if (!leaf || !state) return;

    // Clear any active handout before transitioning to idle
    if (state.activeHandout) {
      state.activeHandout = null;
    }

    await this.plugin.projectionManager.crossfadeOnLeaf(
      leaf,
      IDLE_SCREEN_VIEW_TYPE,
      { idleContent: state.config.idleContent },
    );

    state.status = 'idle';
    state.mediaPath = undefined;
    this._notifyChange();
  }

  /**
   * Update the tracked status for a managed screen.
   * Called by ProjectionManager when it projects content onto a managed screen.
   */
  setScreenStatus(sKey: string, status: ManagedScreenStatus, mediaPath?: string): void {
    const state = this.screenStates.get(sKey);
    if (!state) return;
    state.status = status;
    state.mediaPath = mediaPath;
  }

  /**
   * Track a handout overlay on a managed screen.
   * Called by ProjectionManager.projectHandout().
   */
  setHandoutStatus(sKey: string, handout: HandoutProjectionState): void {
    const state = this.screenStates.get(sKey);
    if (!state) return;
    state.status = 'handout';
    state.activeHandout = handout;
    this._notifyChange();
  }

  /**
   * Clear the handout overlay from a managed screen.
   * Resets status based on what primary content is active.
   */
  clearHandout(sKey: string): void {
    const state = this.screenStates.get(sKey);
    if (!state) return;
    state.activeHandout = null;

    // Revert status to whatever primary content is active (or idle)
    const primaryProj = this.plugin.projectionManager.activeProjections.get(sKey);
    if (primaryProj) {
      state.status = primaryProj.contentType as ManagedScreenStatus;
    } else {
      state.status = 'idle';
    }
    this._notifyChange();
  }

  /**
   * Check if a managed screen has an active handout overlay.
   */
  hasActiveHandout(sKey: string): boolean {
    const state = this.screenStates.get(sKey);
    return !!(state?.activeHandout);
  }

  // ── Internal Helpers ────────────────────────────────────────────

  /**
   * Open a popout window with an IdleScreenView for a specific screen.
   * Positions and fullscreens it using ProjectionManager's infrastructure.
   */
  private async openIdleScreen(
    screen: ScreenInfo,
    config: ManagedScreenConfig,
  ): Promise<WorkspaceLeaf | null> {
    try {
      const popoutLeaf = this.plugin.app.workspace.openPopoutLeaf({
        size: { width: screen.width, height: screen.height },
      });

      await popoutLeaf.setViewState({
        type: IDLE_SCREEN_VIEW_TYPE,
        active: true,
        state: {
          idleContent: config.idleContent,
        },
      });

      // Reuse ProjectionManager's positioning infrastructure
      setTimeout(async () => {
        await this.plugin.projectionManager.positionAndFullscreen(
          popoutLeaf,
          screen,
        );
      }, 300);

      return popoutLeaf;
    } catch (e) {
      console.error('SessionProjectionManager: failed to open idle screen', e);
      return null;
    }
  }
}
