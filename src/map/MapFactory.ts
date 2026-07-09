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
export const MAP_SCHEMA_VERSION = 4;

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
    showInitiativeInPlayerView: false,
    initiativeOverlaySize: 'medium',
    // Annotations
    highlights: [],
    markers: [],
    drawings: [],
    textAnnotations: [],
    roomAnnotations: [],
    roomAnnotationDefaults: {
      badgeSize: 32,
      fontSize: 14,
      fontColor: '#111827',
    },
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
    templateSourceId: '',
    templateSourceName: '',
    templateSyncedAt: '',
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

  // ── Strip runtime-only fields (prefixed with "_") from nested objects ──
  // These are set at render-time and must not leak into save files.
  if (Array.isArray(out.markers)) {
    out.markers = out.markers.map((m: any) => {
      const cleaned = _stripRuntimeFields(m);
      if (cleaned.elevation && typeof cleaned.elevation === 'object') {
        cleaned.elevation = _stripRuntimeFields(cleaned.elevation);
      }
      if (cleaned.tunnelState && typeof cleaned.tunnelState === 'object') {
        cleaned.tunnelState = _stripRuntimeFields(cleaned.tunnelState);
      }
      return cleaned;
    });
  }

  return out;
}

/**
 * Remove any keys starting with "_" from a shallow copy of `obj`.
 * Convention: underscore-prefixed fields are runtime-only and must
 * not be persisted to disk.
 */
function _stripRuntimeFields(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!key.startsWith('_')) {
      out[key] = val;
    }
  }
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
  cloned.templateSourceId = templateData.mapId || '';
  cloned.templateSourceName = templateData.name || '';
  cloned.templateSyncedAt = new Date().toISOString();
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

/**
 * Fields that are considered part of the reusable map/template structure.
 * Syncing applies these from the latest template while preserving active-map
 * encounter content and child-map additions.
 */
export const TEMPLATE_STRUCTURAL_FIELDS = [
  'imageFile',
  'isVideo',
  'type',
  'dimensions',
  'gridType',
  'gridSize',
  'gridOffsetX',
  'gridOffsetY',
  'gridSizeW',
  'gridSizeH',
  'gridVisible',
  'scale',
  'fogOfWar',
  'walls',
  'lightSources',
  'tunnels',
  'tileElevations',
  'difficultTerrain',
  'envAssets',
  'hexTerrains',
  'hexClimates',
  'customTerrainDescriptions',
  'hexcrawlState',
] as const;

export type TemplateStructuralField = typeof TEMPLATE_STRUCTURAL_FIELDS[number];

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRecord(currentVal: any, templateVal: any): any {
  const current = currentVal && typeof currentVal === 'object' && !Array.isArray(currentVal) ? currentVal : {};
  const template = templateVal && typeof templateVal === 'object' && !Array.isArray(templateVal) ? templateVal : {};
  return {
    ...structuredClone(current),
    ...structuredClone(template),
  };
}

function formatCoord(value: any): string {
  return Number.isFinite(value) ? Number(value).toFixed(3) : '';
}

function getItemKey(item: any, fallbackKey?: (item: any) => string | null): string | null {
  if (item?.id !== undefined && item?.id !== null && String(item.id).trim()) {
    return `id:${String(item.id)}`;
  }
  return fallbackKey?.(item) || null;
}

function mergeArrayByKey(
  currentVal: any,
  templateVal: any,
  fallbackKey?: (item: any) => string | null,
): any[] {
  const current = Array.isArray(currentVal) ? currentVal : [];
  const template = Array.isArray(templateVal) ? templateVal : [];
  const merged = structuredClone(current);
  const indexByKey = new Map<string, number>();

  merged.forEach((item: any, index: number) => {
    const key = getItemKey(item, fallbackKey);
    if (key && !indexByKey.has(key)) indexByKey.set(key, index);
  });

  for (const templateItem of template) {
    const key = getItemKey(templateItem, fallbackKey);
    const clonedTemplateItem = structuredClone(templateItem);

    if (key && indexByKey.has(key)) {
      merged[indexByKey.get(key)!] = clonedTemplateItem;
      continue;
    }

    if (!merged.some((item: any) => deepEqual(item, templateItem))) {
      if (key) indexByKey.set(key, merged.length);
      merged.push(clonedTemplateItem);
    }
  }

  return merged;
}

function lightFallbackKey(light: any): string | null {
  if (!light) return null;
  if (light.start && light.end) {
    return [
      'walllight',
      light.type || '',
      formatCoord(light.start.x),
      formatCoord(light.start.y),
      formatCoord(light.end.x),
      formatCoord(light.end.y),
    ].join(':');
  }
  return ['light', light.type || '', formatCoord(light.x), formatCoord(light.y)].join(':');
}

function hexFallbackKey(hex: any): string | null {
  if (!Number.isFinite(hex?.col) || !Number.isFinite(hex?.row)) return null;
  return `hex:${hex.col}:${hex.row}`;
}

function mergeFogOfWar(currentVal: any, templateVal: any): any {
  const current = currentVal && typeof currentVal === 'object' ? currentVal : {};
  const template = templateVal && typeof templateVal === 'object' ? templateVal : {};

  return {
    ...structuredClone(current),
    ...structuredClone(template),
    enabled: current.enabled === true || template.enabled === true,
    regions: mergeArrayByKey(current.regions, template.regions),
  };
}

function mergeTemplateField(field: TemplateStructuralField, currentVal: any, templateVal: any): any {
  switch (field) {
    case 'fogOfWar':
      return mergeFogOfWar(currentVal, templateVal);
    case 'walls':
    case 'tunnels':
    case 'envAssets':
      return mergeArrayByKey(currentVal, templateVal);
    case 'lightSources':
      return mergeArrayByKey(currentVal, templateVal, lightFallbackKey);
    case 'hexTerrains':
    case 'hexClimates':
      return mergeArrayByKey(currentVal, templateVal, hexFallbackKey);
    case 'tileElevations':
    case 'difficultTerrain':
    case 'customTerrainDescriptions':
    case 'hexcrawlState':
      return mergeRecord(currentVal, templateVal);
    default:
      return structuredClone(templateVal);
  }
}

export function getTemplateSyncChangedFields(mapData: any, templateData: any): TemplateStructuralField[] {
  const map = normalizeMapAnnotations(structuredClone(mapData));
  const template = normalizeMapAnnotations(structuredClone(templateData));

  return TEMPLATE_STRUCTURAL_FIELDS.filter((field) => {
    const merged = mergeTemplateField(field, map[field], template[field]);
    return !deepEqual(map[field], merged);
  });
}

/**
 * Apply the small set of settings exposed by MapCreationModal edit mode.
 * The modal edits one uniform grid size, so stale per-axis calibration
 * overrides must be cleared or they will keep winning at render time.
 */
export function applyEditableMapSettings(existingData: any, mapData: any): any {
  return {
    ...existingData,
    mapId: mapData.id || mapData.mapId || existingData?.mapId || '',
    name: mapData.name,
    imageFile: mapData.imageFile,
    isVideo: mapData.isVideo || false,
    type: mapData.type,
    dimensions: mapData.dimensions,
    gridType: mapData.gridType,
    gridSize: mapData.gridSize,
    gridSizeW: undefined,
    gridSizeH: undefined,
    scale: mapData.scale,
    lastModified: mapData.lastModified || new Date().toISOString(),
  };
}

/**
 * Apply the latest structural base from a source template to an existing
 * active map. Sync is non-destructive for map components: template items are
 * added/updated by identity, while active-map additions remain on the map.
 * Instance-specific data also remains on the map: markers/tokens, highlights,
 * drawings, text annotations, POI refs, linked scene/encounter, active layer,
 * and player-view settings.
 */
export function syncMapFromTemplate(mapData: any, templateData: any): any {
  const synced = normalizeMapAnnotations(structuredClone(mapData));
  const template = normalizeMapAnnotations(structuredClone(templateData));

  for (const field of TEMPLATE_STRUCTURAL_FIELDS) {
    synced[field] = mergeTemplateField(field, synced[field], template[field]);
  }

  synced.isTemplate = false;
  synced.templateTags = undefined;
  synced.templateSourceId = template.mapId || synced.templateSourceId || '';
  synced.templateSourceName = template.name || synced.templateSourceName || '';
  synced.templateSyncedAt = new Date().toISOString();
  synced.lastModified = new Date().toISOString();

  return synced;
}
