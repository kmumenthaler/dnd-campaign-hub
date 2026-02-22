/**
 * Magic Wand Wall Detection — Utility Module
 *
 * Provides flood-fill based region selection and contour tracing
 * for automatically generating wall segments from dungeon map images.
 *
 * Usage: click on a dark (void) area of the map → flood-fill finds the
 * connected dark region → boundary is traced → simplified into wall segments.
 */

/** Wall segment as stored in the map annotation JSON */
export interface MagicWandWall {
  id: string;
  type: string;
  name: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  open: boolean;
}

/**
 * Perform a flood fill from (startX, startY) on the given image data,
 * selecting all connected pixels whose brightness is below (or above,
 * if inverted) the threshold.
 *
 * Returns a Uint8Array mask (1 = selected, 0 = not selected) of size w×h.
 */
export function floodFillMask(
  imageData: ImageData,
  startX: number,
  startY: number,
  threshold: number,
  tolerance: number,
  invert: boolean,
): Uint8Array {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  const mask = new Uint8Array(w * h);

  // Clamp start coordinates
  const sx = Math.max(0, Math.min(w - 1, Math.round(startX)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(startY)));

  // Brightness helper (perceived luminance, rec. 601)
  const brightness = (idx: number): number => {
    return 0.299 * data[idx * 4]! + 0.587 * data[idx * 4 + 1]! + 0.114 * data[idx * 4 + 2]!;
  };

  // Check if a pixel qualifies as "dark" (void) given the threshold
  const isDark = (idx: number): boolean => {
    const b = brightness(idx);
    return invert ? b >= threshold : b < threshold;
  };

  // Get the reference brightness at the click point
  const refBrightness = brightness(sy * w + sx);

  // Check if a pixel matches the clicked region (within tolerance of the click point)
  const matches = (idx: number): boolean => {
    const b = brightness(idx);
    return Math.abs(b - refBrightness) <= tolerance;
  };

  // If the clicked pixel isn't "dark", still allow the fill based on
  // tolerance from the clicked pixel so light areas can be selected too
  const clickedIsDark = isDark(sy * w + sx);

  // Flood fill using scanline approach for performance
  const visited = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];

  while (stack.length > 0) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    const idx = cy * w + cx;

    if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
    if (visited[idx]) continue;
    visited[idx] = 1;

    // Check if this pixel belongs to the same region
    const pixelMatches = clickedIsDark ? isDark(idx) : matches(idx);
    if (!pixelMatches) continue;

    mask[idx] = 1;

    // Push neighbors (4-connected)
    stack.push(cx + 1, cy);
    stack.push(cx - 1, cy);
    stack.push(cx, cy + 1);
    stack.push(cx, cy - 1);
  }

  return mask;
}

/**
 * Trace the boundary contour of a binary mask region using a simple
 * chain-code / boundary-following algorithm.
 *
 * Returns an array of polylines (arrays of {x,y} points in image coordinates).
 */
export function traceContourFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
): Array<Array<{ x: number; y: number }>> {
  const contours: Array<Array<{ x: number; y: number }>> = [];
  const visited = new Uint8Array(w * h);

  // Helper: is (x,y) inside the mask?
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    return mask[y * w + x] === 1;
  };

  // Helper: is (x,y) a boundary pixel? (inside mask AND has at least one neighbor outside)
  const isBoundary = (x: number, y: number): boolean => {
    if (!inside(x, y)) return false;
    return !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
  };

  // Moore neighborhood tracing (8-connected boundary following)
  // Directions: 0=right, 1=down-right, 2=down, 3=down-left, 4=left, 5=up-left, 6=up, 7=up-right
  const ddx = [1, 1, 0, -1, -1, -1, 0, 1];
  const ddy = [0, 1, 1, 1, 0, -1, -1, -1];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBoundary(x, y) || visited[y * w + x]) continue;

      // Start a new contour
      const contour: Array<{ x: number; y: number }> = [];
      let cx = x;
      let cy = y;
      let dir = 0; // Start looking right

      const maxSteps = w * h;
      let steps = 0;

      do {
        contour.push({ x: cx, y: cy });
        visited[cy * w + cx] = 1;

        // Look for the next boundary pixel in Moore neighborhood
        // Start from (dir + 5) % 8 to turn back first, then scan clockwise
        const startDir = (dir + 5) % 8;
        let found = false;

        for (let i = 0; i < 8; i++) {
          const d = (startDir + i) % 8;
          const nx = cx + ddx[d]!;
          const ny = cy + ddy[d]!;

          if (isBoundary(nx, ny)) {
            dir = d;
            cx = nx;
            cy = ny;
            found = true;
            break;
          }
        }

        if (!found) break;
        steps++;
      } while ((cx !== x || cy !== y) && steps < maxSteps);

      // Close the contour if it wraps around
      if (contour.length >= 3) {
        contour.push(contour[0]!); // close it
        contours.push(contour);
      }
    }
  }

  return contours;
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Reduces point count while preserving shape within `epsilon` tolerance.
 */
export function rdpSimplify(
  points: Array<{ x: number; y: number }>,
  epsilon: number,
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): number {
  const ddx = lineEnd.x - lineStart.x;
  const ddy = lineEnd.y - lineStart.y;
  const lenSq = ddx * ddx + ddy * ddy;
  if (lenSq === 0) {
    const ex = point.x - lineStart.x;
    const ey = point.y - lineStart.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const num = Math.abs(
    ddy * point.x - ddx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x,
  );
  return num / Math.sqrt(lenSq);
}

/**
 * Full pipeline: flood-fill from click → trace boundary → simplify → wall segments.
 *
 * @param imageData   Full image data from the map canvas
 * @param clickX      Click x in image-pixel coordinates
 * @param clickY      Click y in image-pixel coordinates
 * @param threshold   Brightness cutoff (0–255). Darker → void.
 * @param tolerance   How close a pixel's brightness must be to the clicked pixel
 * @param simplifyEps Douglas-Peucker epsilon (higher = fewer segments)
 * @param minLen      Minimum wall segment length in pixels
 * @param invert      If true, treat bright areas as void instead
 * @returns           Object with generated walls and the flood-fill mask for preview
 */
export function magicWandDetect(
  imageData: ImageData,
  clickX: number,
  clickY: number,
  threshold: number,
  tolerance: number,
  simplifyEps: number,
  minLen: number,
  invert: boolean,
): { walls: MagicWandWall[]; mask: Uint8Array } {
  const w = imageData.width;
  const h = imageData.height;

  // Step 1: Flood fill from click point
  const mask = floodFillMask(imageData, clickX, clickY, threshold, tolerance, invert);

  // Step 2: Trace contours
  const contours = traceContourFromMask(mask, w, h);

  // Step 3: Simplify and convert to wall segments
  const walls: MagicWandWall[] = [];
  for (const contour of contours) {
    const simplified = rdpSimplify(contour, simplifyEps);
    for (let i = 0; i < simplified.length - 1; i++) {
      const start = simplified[i]!;
      const end = simplified[i + 1]!;
      const segDx = end.x - start.x;
      const segDy = end.y - start.y;
      const len = Math.sqrt(segDx * segDx + segDy * segDy);
      if (len < minLen) continue;

      walls.push({
        id: `wall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'wall',
        name: 'Wall',
        start: { x: Math.round(start.x), y: Math.round(start.y) },
        end: { x: Math.round(end.x), y: Math.round(end.y) },
        open: false,
      });
    }
  }

  return { walls, mask };
}
