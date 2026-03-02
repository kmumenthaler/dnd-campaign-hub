/**
 * Module-level light flicker utilities.
 * Shared by both the GM-view and the player-view rendering.
 */

/** Light types that exhibit flame-like flickering. */
export const FLICKER_LIGHT_TYPES_SET = new Set<string>(['candle', 'torch', 'dancing', 'continual', 'fluorescent']);

/** Subset: lights that use neon-buzz animation instead of flame flicker. */
export const BUZZ_LIGHT_TYPES_SET = new Set<string>(['fluorescent']);

/**
 * Compute a flicker multiplier for a given light at the current time.
 * Uses layered sine waves at incommensurate frequencies for organic, flame-like motion.
 */
export function computeLightFlicker(
  seed: number,
  time: number,
  intensity: 'low' | 'high' = 'high'
): { radius: number; alpha: number } {
  const t = time + seed;
  const wave1 = Math.sin(t * 8.7);
  const wave2 = Math.sin(t * 5.1 + 1.3);
  const wave3 = Math.sin(t * 13.3 + 2.7);
  const wave4 = Math.sin(t * 2.3 + 0.5);
  const combined = wave1 * 0.4 + wave2 * 0.25 + wave3 * 0.15 + wave4 * 0.2;
  const normalized = (combined + 1) * 0.5;

  if (intensity === 'high') {
    return { radius: 0.82 + normalized * 0.18, alpha: 0.78 + normalized * 0.22 };
  } else {
    return { radius: 0.92 + normalized * 0.08, alpha: 0.90 + normalized * 0.10 };
  }
}

/**
 * Compute a neon-buzz flicker for fluorescent lights.
 * Simulates a subtle static electrical buzz.
 */
export function computeNeonBuzz(
  seed: number,
  time: number
): { radius: number; alpha: number } {
  const t = time + seed;
  const buzz60 = Math.sin(t * 60 * 2 * Math.PI);
  const drift1 = Math.sin(t * 4.3 + 1.7);
  const drift2 = Math.sin(t * 7.1 + 2.9);
  const driftCombined = drift1 * 0.4 + drift2 * 0.6;
  const buzzComponent = buzz60 * 0.03;
  const driftComponent = driftCombined * 0.04;
  const alpha = Math.max(0.88, Math.min(1.0, 0.96 + buzzComponent + driftComponent));
  const radius = 0.99 + driftCombined * 0.005;
  return { radius, alpha };
}

/**
 * Convert a hex colour string to RGB components.
 * Falls back to warm yellow (255,255,136) on invalid input.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
    : { r: 255, g: 255, b: 136 };
}

/** Per-light flicker seed cache (deterministic but unique per light instance). */
const flickerSeedMap = new Map<string, number>();
let flickerSeedCounter = 0;

export function getFlickerSeedForKey(key: string): number {
  let seed = flickerSeedMap.get(key);
  if (seed === undefined) {
    seed = flickerSeedCounter++ * 137.508;
    flickerSeedMap.set(key, seed);
  }
  return seed;
}
