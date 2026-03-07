/**
 * MapFactory — shared utilities for creating battlemaps from templates,
 * schema versioning, and annotation normalisation.
 *
 * This module is the **single source of truth** for:
 *   • the current schema version
 *   • default values for every annotation field
 *   • deep-clone + identity-reset when instantiating a template
 *   • load-time normalisation / migration of old annotation JSON
 */

// ── Schema version ───────────────────────────────────────────────────
/** Bump this whenever the annotation shape changes. */
export const MAP_SCHEMA_VERSION = 1;

// ── Canonical defaults ───────────────────────────────────────────────
/**
 * Every field that can appear in a map annotation JSON, together with
 * its default value.  Used by `normalizeMapAnnotations`, `_flushMapSave`
 * and `cloneTemplateToMap` so the field list is maintained in one place.
 */
export function getMapAnnotationDefaults(): Record<string, any> {
  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    mapId: '',
    name: '',
    imageFile: '',
    isVideo: false,
    type: 'battlemap',
    dimensions: {},
    gridType: 'square',
    gridSize: 70,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridSizeW: undefined,
    gridSizeH: undefined,
    gridVisible: true,
    scale: { value: 5, unit: 'feet' },
    activeLayer: 'Player',
    // Annotations
    highlights: [],
    markers: [],
    drawings: [],
    tunnels: [],
    poiReferences: [],
    hexTerrains: [],
    hexClimates: [],
    customTerrainDescriptions: {},
    hexcrawlState: null,
    fogOfWar: { enabled: false, regions: [] },
    walls: [],
    lightSources: [],
    tileElevations: {},
    difficultTerrain: {},
    envAssets: [],
    // Template system
    isTemplate: false,
    templateTags: undefined,
    // Metadata
    lastModified: '',
  };
}

// ── Normalise / migrate ──────────────────────────────────────────────
/**
 * Ensure every expected field exists with a sensible default.
 * Called on load so that older annotation files are transparently
 * upgraded to the current schema without data loss.
 *
 * @param raw  The parsed JSON from disk (may be missing fields).
 * @returns    A complete annotation object with all fields present.
 */
export function normalizeMapAnnotations(raw: any): any {
  if (!raw || typeof raw !== 'object') return { ...getMapAnnotationDefaults() };

  const defaults = getMapAnnotationDefaults();
  const out: any = {};

  for (const [key, defaultVal] of Object.entries(defaults)) {
    // Use existing value if present, otherwise fall back to default.
    // Special-case: `gridVisible` — false is a valid explicit value.
    if (key === 'gridVisible') {
      out[key] = raw[key] !== undefined ? raw[key] : defaultVal;
    } else {
      out[key] = raw[key] ?? defaultVal;
    }
  }

  // Preserve any extra keys the caller may have set (e.g. linkedEncounter)
  for (const key of Object.keys(raw)) {
    if (!(key in out)) {
      out[key] = raw[key];
    }
  }

  // Stamp the current schema version
  out.schemaVersion = MAP_SCHEMA_VERSION;

  return out;
}

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
  // Single deep-clone of the entire template, then normalise
  const cloned = normalizeMapAnnotations(structuredClone(templateData));

  // ── Identity — new map ─────────────────────────────────────────
  cloned.mapId = newMapId;
  cloned.name = mapName;

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
