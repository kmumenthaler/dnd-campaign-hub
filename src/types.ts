import type { MusicSettings, MusicPlaybackState } from "./music/types";
import { DEFAULT_MUSIC_SETTINGS, DEFAULT_PLAYBACK_STATE } from "./music/types";
import type { CombatState } from "./combat/types";

export interface TabletopCalibration {
  monitorDiagonalInch: number;
  pixelsPerMm: number;
  miniBaseMm: number;
}

/** Per-monitor projection target — saved so calibration is one-time. */
export interface ProjectionTarget {
  /** Stable key for the screen (label + position). */
  screenKey: string;
  /** Human-readable label (e.g. "DELL U2720Q"). */
  screenLabel: string;
  /** Pixel bounds in the virtual multi-monitor coordinate space. */
  screenBounds: { left: number; top: number; width: number; height: number };
  /** Device pixel ratio at the time of calibration. */
  devicePixelRatio: number;
  /** Physical calibration for this monitor. */
  calibration: TabletopCalibration;
}

export interface DndCampaignHubSettings {
  pluginVersion: string;
  tabletopCalibration: TabletopCalibration | null;
  /** Per-monitor projection targets (keyed by screenKey). */
  projectionTargets: ProjectionTarget[];
  /** The screenKey of the last-used projection target (for quick re-project). */
  lastProjectionScreenKey: string;
  musicSettings: MusicSettings;
  musicPlaybackState: MusicPlaybackState;
  /** Controls when dynamic lighting / vision updates during token movement.
   *  'on-drop'        – freeze fog during drag, recompute on drop (default)
   *  'while-dragging'  – update fog each time the token crosses a grid cell */
  visionUpdateMode: 'on-drop' | 'while-dragging';
  /** Saved mid-combat states keyed by encounter name. */
  combatStates: Record<string, CombatState>;
  /** Auto-pan projected player view to the active combatant's token on turn change. */
  combatAutoPan: boolean;
}

export const DEFAULT_SETTINGS: DndCampaignHubSettings = {
  pluginVersion: "0.0.0",
  tabletopCalibration: null,
  projectionTargets: [],
  lastProjectionScreenKey: "",
  musicSettings: { ...DEFAULT_MUSIC_SETTINGS },
  musicPlaybackState: { ...DEFAULT_PLAYBACK_STATE },
  visionUpdateMode: 'on-drop',
  combatStates: {},
  combatAutoPan: false,
};
