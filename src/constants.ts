export const SESSION_PREP_VIEW_TYPE = "session-prep-dashboard";
export const SESSION_RUN_VIEW_TYPE = "session-run-dashboard";
export const DM_SCREEN_VIEW_TYPE = "dm-screen";
export const PLAYER_MAP_VIEW_TYPE = "dnd-player-map-view";
export const GM_MAP_VIEW_TYPE = "dnd-gm-map-view";
export const COMBAT_TRACKER_VIEW_TYPE = "dnd-combat-tracker";
export const COMBAT_PLAYER_VIEW_TYPE = "dnd-combat-player-view";
export const IDLE_SCREEN_VIEW_TYPE = "dnd-idle-screen-view";
export const MEDIA_PROJECTION_VIEW_TYPE = "dnd-media-projection-view";

/**
 * A media element (image or video) that exposes image-compatible dimension properties.
 * For video elements, these are shimmed at runtime via Object.defineProperty.
 */
export type MapMediaElement = (HTMLImageElement | HTMLVideoElement) & {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly complete: boolean;
  readonly width: number;
  readonly height: number;
};
