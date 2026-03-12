/**
 * Types for the Session Projection system.
 *
 * The session projection layer sits above ProjectionManager, providing
 * persistent "managed" monitors that stay alive for the entire session
 * with configurable idle screens between content projections.
 */

import type { ScreenInfo } from '../utils/ScreenEnumeration';

// ── Idle content types ─────────────────────────────────────────────────

/** What a managed screen shows when no content is actively projected. */
export type IdleContentType = 'black' | 'image' | 'video' | 'color';

export interface IdleContentConfig {
  type: IdleContentType;
  /** Vault path to image/gif/video file (for 'image' and 'video' types). */
  filePath?: string;
  /** CSS color string (for 'color' type, e.g. "#1a1a2e"). */
  color?: string;
  /** Whether video should loop (default: true). */
  loop?: boolean;
  /** Whether video should be muted (default: true). */
  muted?: boolean;
  /** Object-fit mode for images/video (default: 'cover'). */
  objectFit?: 'cover' | 'contain' | 'fill';
}

export const DEFAULT_IDLE_CONTENT: IdleContentConfig = {
  type: 'black',
};

// ── Managed screen config ──────────────────────────────────────────────

/** Persistent per-screen configuration saved in plugin settings. */
export interface ManagedScreenConfig {
  /** Stable screen key (label + position). */
  screenKey: string;
  /** Human-readable label at the time of setup. */
  screenLabel: string;
  /** What to show when idle (between projections). */
  idleContent: IdleContentConfig;
}

// ── Session state (runtime only, not persisted) ────────────────────────

/** What kind of content is currently shown on a managed screen. */
export type ManagedScreenStatus = 'idle' | 'map' | 'combat' | 'media';

/** Runtime state for a single managed screen during an active session. */
export interface ManagedScreenState {
  /** The screen this state refers to. */
  screen: ScreenInfo;
  /** Saved configuration (idle content, etc.). */
  config: ManagedScreenConfig;
  /** What is currently showing. */
  status: ManagedScreenStatus;
  /** Vault path of the media file currently projected (for 'media' status). */
  mediaPath?: string;
}

// ── Settings extension ─────────────────────────────────────────────────

/** Persisted session projection settings (embedded in DndCampaignHubSettings). */
export interface SessionProjectionSettings {
  /** Screens the GM has configured as player-facing projectors. */
  managedScreens: ManagedScreenConfig[];
}

export const DEFAULT_SESSION_PROJECTION_SETTINGS: SessionProjectionSettings = {
  managedScreens: [],
};
