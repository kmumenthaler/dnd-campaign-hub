/**
 * Visibility Polygon Memoization Cache.
 * computeVisibilityPolygon is O(segments²) and called 10-20+ times per frame.
 * This cache deduplicates within-frame AND preserves results across frames
 * when walls haven't changed.
 */

/** Fast walls-array fingerprint (cached per array reference via WeakMap). */
const wallsHashWM = new WeakMap<any[], string>();

export function getWallsHash(walls: any[]): string {
  let h = wallsHashWM.get(walls);
  if (h !== undefined) return h;
  const n = walls.length;
  if (n === 0) { h = '0'; wallsHashWM.set(walls, h); return h; }
  const parts: string[] = [String(n)];
  const samples = Math.min(n, 8);
  for (let i = 0; i < samples; i++) {
    const w = walls[Math.floor(i * n / samples)];
    if (w?.start && w?.end) {
      parts.push(`${w.start.x | 0},${w.start.y | 0},${w.end.x | 0},${w.end.y | 0}`);
    }
  }
  h = parts.join('|');
  wallsHashWM.set(walls, h);
  return h;
}

/** Quantised cache key. Position→1 px, radius→16 px buckets, elevation→int. */
export function visCacheKey(
  ox: number, oy: number, r: number, elev: number, wallsHash: string
): string {
  return `${ox | 0}|${oy | 0}|${(r + 8) >> 4}|${elev | 0}|${wallsHash}`;
}

export const visCacheMap = new Map<string, { x: number; y: number }[]>();
export const VIS_CACHE_MAX = 256;
