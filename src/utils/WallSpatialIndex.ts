/**
 * Uniform-grid spatial index for wall segments.
 *
 * Replaces the O(n) full-walls scan inside computeVisibilityPolygon with
 * O(1) per-cell lookups, typically reducing the number of wall segments
 * tested per raycast from 200+ to ~20-40 (depending on local density).
 *
 * Build cost: O(n) where n = number of walls.
 * Query cost: O(cells_in_AABB) — constant for a fixed radius.
 *
 * Rebuild when walls change (door open/close, wall add/delete).
 */

export class WallSpatialIndex {
  private readonly cellSize: number;
  private readonly cells: Map<number, number[]>; // packed cell key → wall indices
  private readonly walls: readonly any[];

  constructor(walls: any[], cellSize: number = 200) {
    this.cellSize = cellSize;
    this.walls = walls;
    this.cells = new Map();
    this._build();
  }

  private _build(): void {
    const cs = this.cellSize;
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      if (!w?.start || !w?.end) continue;
      // Rasterize wall segment bounding box into grid cells
      const c0 = Math.floor(Math.min(w.start.x, w.end.x) / cs);
      const c1 = Math.floor(Math.max(w.start.x, w.end.x) / cs);
      const r0 = Math.floor(Math.min(w.start.y, w.end.y) / cs);
      const r1 = Math.floor(Math.max(w.start.y, w.end.y) / cs);
      for (let c = c0; c <= c1; c++) {
        for (let r = r0; r <= r1; r++) {
          const key = c * 100003 + r; // packed integer key (large prime avoids collisions)
          const arr = this.cells.get(key);
          if (arr) arr.push(i);
          else this.cells.set(key, [i]);
        }
      }
    }
  }

  /** Number of walls in the index. */
  get wallCount(): number {
    return this.walls.length;
  }

  /**
   * Return unique wall objects whose grid cells overlap the axis-aligned
   * bounding box of a circle (cx, cy, radius).
   *
   * Callers should still do their own distance / elevation checks since
   * the grid is a coarse approximation.
   */
  queryCircle(cx: number, cy: number, radius: number): any[] {
    const cs = this.cellSize;
    const c0 = Math.floor((cx - radius) / cs);
    const c1 = Math.floor((cx + radius) / cs);
    const r0 = Math.floor((cy - radius) / cs);
    const r1 = Math.floor((cy + radius) / cs);

    // Deduplicate using a Uint8Array (faster than Set for dense integer keys)
    const seen = new Uint8Array(this.walls.length);
    const result: any[] = [];

    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const arr = this.cells.get(c * 100003 + r);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const idx = arr[k]!;
          if (!seen[idx]) {
            seen[idx] = 1;
            result.push(this.walls[idx]);
          }
        }
      }
    }
    return result;
  }

  /**
   * Return unique wall objects whose grid cells overlap a line from
   * (x1,y1) to (x2,y2). Used for hasLineOfSight fast-path.
   */
  querySegment(x1: number, y1: number, x2: number, y2: number): any[] {
    const cs = this.cellSize;
    const c0 = Math.floor(Math.min(x1, x2) / cs);
    const c1 = Math.floor(Math.max(x1, x2) / cs);
    const r0 = Math.floor(Math.min(y1, y2) / cs);
    const r1 = Math.floor(Math.max(y1, y2) / cs);

    const seen = new Uint8Array(this.walls.length);
    const result: any[] = [];

    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const arr = this.cells.get(c * 100003 + r);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const idx = arr[k]!;
          if (!seen[idx]) {
            seen[idx] = 1;
            result.push(this.walls[idx]);
          }
        }
      }
    }
    return result;
  }
}
