/**
 * MapFactory — shared utilities for creating battlemaps from templates.
 *
 * Centralises the deep-clone + identity-reset logic so that
 * TemplatePickerModal, EncounterBattlemapModal, and any future
 * consumer all share a single code path.
 */

/**
 * Deep-clone a template's annotation data into a new active battlemap config.
 *
 * Uses `structuredClone` (single pass) instead of per-field
 * `JSON.parse(JSON.stringify(...))` round-trips.
 *
 * @param templateData  The full annotation object loaded from the template JSON.
 * @param newMapId      A fresh unique map ID for the new instance.
 * @param mapName       Display name for the new map.
 * @param overrides     Optional fields to merge on top (e.g. gridType, scaleValue from the caller).
 * @returns A fully independent config object ready for `saveMapAnnotations`.
 */
export function cloneTemplateToMap(
  templateData: any,
  newMapId: string,
  mapName: string,
  overrides?: Record<string, any>,
): any {
  // Single deep-clone of the entire template
  const cloned = structuredClone(templateData);

  // ── Identity — new map ─────────────────────────────────────────
  cloned.mapId = newMapId;
  cloned.name = mapName;

  // ── Ensure required fields have sensible defaults ──────────────
  cloned.imageFile = cloned.imageFile || '';
  cloned.isVideo = cloned.isVideo || false;
  cloned.type = 'battlemap';
  cloned.dimensions = cloned.dimensions || {};
  cloned.gridType = cloned.gridType || 'square';
  cloned.gridSize = cloned.gridSize || 70;
  cloned.gridOffsetX = cloned.gridOffsetX || 0;
  cloned.gridOffsetY = cloned.gridOffsetY || 0;
  cloned.gridVisible = cloned.gridVisible !== undefined ? cloned.gridVisible : true;
  cloned.scale = cloned.scale || { value: 5, unit: 'feet' };

  // Annotation arrays — already cloned, just ensure they exist
  cloned.walls = cloned.walls || [];
  cloned.lightSources = cloned.lightSources || [];
  cloned.fogOfWar = cloned.fogOfWar || { enabled: false, regions: [] };
  cloned.drawings = cloned.drawings || [];
  cloned.tileElevations = cloned.tileElevations || {};
  cloned.difficultTerrain = cloned.difficultTerrain || {};
  cloned.tunnels = cloned.tunnels || [];
  cloned.envAssets = cloned.envAssets || [];
  cloned.markers = cloned.markers || [];

  // ── Reset instance-specific fields ─────────────────────────────
  cloned.highlights = [];            // template highlights stay with the template
  cloned.isTemplate = false;
  cloned.templateTags = undefined;
  cloned.linkedEncounter = '';
  cloned.linkedScene = '';
  cloned.activeLayer = 'Player';
  cloned.lastModified = new Date().toISOString();

  // ── Re-generate marker instance IDs so they're unique ──────────
  for (const marker of cloned.markers) {
    marker.id = `marker_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }

  // ── Apply caller overrides last ────────────────────────────────
  if (overrides) {
    Object.assign(cloned, overrides);
  }

  return cloned;
}
