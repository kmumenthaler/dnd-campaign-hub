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
import type { ManagedScreenConfig, ManagedScreenState, ManagedScreenStatus } from './types';

export class SessionProjectionManager {
  private plugin: DndCampaignHubPlugin;

  /** Whether a session is currently active. */
  private _active = false;

  /** Runtime state per managed screen, keyed by screenKey. */
  private screenStates: Map<string, ManagedScreenState> = new Map();

  /** Popout leaves opened by this manager, keyed by screenKey. */
  private managedLeaves: Map<string, WorkspaceLeaf> = new Map();

  constructor(plugin: DndCampaignHubPlugin) {
    this.plugin = plugin;
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
      if ((leaf.view as any)?.containerEl?.isConnected) return leaf;
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
    new Notice(`🎬 Session started — ${opened} screen${opened > 1 ? 's' : ''} active`);
  }

  /** Stop the active session — close all managed popouts. */
  stopSession(): void {
    if (!this._active) return;

    for (const [sKey, leaf] of this.managedLeaves) {
      try { leaf.detach(); } catch { /* already gone */ }
    }
    this.managedLeaves.clear();
    this.screenStates.clear();
    this._active = false;
    new Notice('🎬 Session ended — all screens closed');
  }

  // ── Screen Transitions ──────────────────────────────────────────

  /**
   * Transition a managed screen back to its idle state.
   *
   * Swaps the leaf's view state to IdleScreenView with the configured idle content.
   */
  async transitionToIdle(sKey: string): Promise<void> {
    const leaf = this.getManagedLeaf(sKey);
    const state = this.screenStates.get(sKey);
    if (!leaf || !state) return;

    await leaf.setViewState({
      type: IDLE_SCREEN_VIEW_TYPE,
      active: true,
      state: {
        idleContent: state.config.idleContent,
      },
    });

    state.status = 'idle';
    state.mediaPath = undefined;
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
