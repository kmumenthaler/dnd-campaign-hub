/**
 * Visibility Polygon Memoization Cache.
 * computeVisibilityPolygon is O(segments²) and called 10-20+ times per frame.
 * This cache deduplicates within-frame AND preserves results across frames
 * when walls haven't changed.
 */

/**
 * Content-based walls fingerprint using djb2 over ALL wall endpoints + open
 * states.  Replaces the old WeakMap approach which missed across frames
 * because the walls array is rebuilt (filter + push) every render.
 * A Map<walls ref → hash> still short-circuits within the same frame.
 */
const _wallsHashCache = new WeakMap<any[], string>();
let _wallsHashStr: string | null = null;
let _wallsHashRef: any[] | null = null;

export function getWallsHash(walls: any[]): string {
  // Fast path: same array reference as last call (same frame)
  if (walls === _wallsHashRef && _wallsHashStr !== null) return _wallsHashStr;
  // WeakMap hit (same reference, different call site within frame)
  const wm = _wallsHashCache.get(walls);
  if (wm !== undefined) { _wallsHashRef = walls; _wallsHashStr = wm; return wm; }

  // Content-based djb2 hash over every wall
  let h = 5381;
  const n = walls.length;
  h = ((h << 5) + h + n) | 0;
  for (let i = 0; i < n; i++) {
    const w = walls[i];
    if (w?.start && w?.end) {
      h = ((h << 5) + h + (w.start.x | 0)) | 0;
      h = ((h << 5) + h + (w.start.y | 0)) | 0;
      h = ((h << 5) + h + (w.end.x | 0)) | 0;
      h = ((h << 5) + h + (w.end.y | 0)) | 0;
    }
    // Open/close state and wall height affect visibility
    h = ((h << 5) + h + (w?.open ? 1 : 0)) | 0;
    h = ((h << 5) + h + (w?.height || 0)) | 0;
  }
  const hashStr = String(h);
  _wallsHashCache.set(walls, hashStr);
  _wallsHashRef = walls;
  _wallsHashStr = hashStr;
  return hashStr;
}

/** Quantised cache key. Position→1 px, radius→16 px buckets, elevation→int. */
export function visCacheKey(
  ox: number, oy: number, r: number, elev: number, wallsHash: string
): string {
  return `${ox | 0}|${oy | 0}|${(r + 8) >> 4}|${elev | 0}|${wallsHash}`;
}

export const visCacheMap = new Map<string, { x: number; y: number }[]>();
export const VIS_CACHE_MAX = 1024;
