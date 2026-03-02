import type { MusicSettings, MusicPlaybackState } from "./music/types";
import { DEFAULT_MUSIC_SETTINGS, DEFAULT_PLAYBACK_STATE } from "./music/types";

export interface TabletopCalibration {
  monitorDiagonalInch: number;
  pixelsPerMm: number;
  miniBaseMm: number;
}

export interface DndCampaignHubSettings {
  currentCampaign: string;
  pluginVersion: string;
  tabletopCalibration: TabletopCalibration | null;
  musicSettings: MusicSettings;
  musicPlaybackState: MusicPlaybackState;
}

export const DEFAULT_SETTINGS: DndCampaignHubSettings = {
  currentCampaign: "",
  pluginVersion: "0.0.0",
  tabletopCalibration: null,
  musicSettings: { ...DEFAULT_MUSIC_SETTINGS },
  musicPlaybackState: { ...DEFAULT_PLAYBACK_STATE },
};
