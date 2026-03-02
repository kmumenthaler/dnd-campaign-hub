/**
 * Reusable Canvas Pool — eliminates per-frame GC jank.
 * Hot-path rendering functions allocate many temporary canvases every frame.
 * This pool lets callers acquire pre-existing canvases (resized as needed)
 * and return them for reuse, avoiding repeated DOM allocation + GC pressure.
 */
export class CanvasPool {
  private pool: HTMLCanvasElement[] = [];

  /** Get a canvas of at least (w × h). It is cleared and ready to draw. */
  acquire(w: number, h: number): HTMLCanvasElement {
    let c = this.pool.pop();
    if (!c) {
      c = document.createElement('canvas');
    }
    c.width = w;
    c.height = h;
    return c;
  }

  /** Return a canvas to the pool for later reuse. */
  release(c: HTMLCanvasElement): void {
    this.pool.push(c);
  }

  /** Return many canvases at once (convenience for functions that use several). */
  releaseAll(...canvases: (HTMLCanvasElement | null | undefined)[]): void {
    for (const c of canvases) {
      if (c) this.pool.push(c);
    }
  }
}

/** Shared singleton canvas pool instance. */
export const canvasPool = new CanvasPool();
