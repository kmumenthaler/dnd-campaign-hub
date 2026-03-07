/**
 * Canonical D&D 5e light-source definitions — single source of truth.
 *
 * Every light-related constant (type keys, display metadata, radii, flicker /
 * buzz behaviour, default colour) lives here so that adding or tweaking a
 * light type only requires touching ONE file.
 */

/* ── Definition shape ────────────────────────────────────────────────── */

export interface LightSourceDef {
  readonly name: string;
  readonly bright: number;
  readonly dim: number;
  readonly icon: string;
  readonly defaultColor: string;
  readonly flicker?: boolean;   // flame-like radius / alpha animation
  readonly buzz?: boolean;      // neon-buzz animation (overrides flicker)
  readonly cone?: boolean;      // cone-shaped beam
  readonly isLine?: boolean;    // wall-mounted line light
}

/* ── Master catalogue ────────────────────────────────────────────────── */

export const LIGHT_SOURCES = {
  candle:         { name: 'Candle',            bright: 5,  dim: 5,  icon: '🕯️', flicker: true,                   defaultColor: '#ffff88' },
  torch:          { name: 'Torch',             bright: 20, dim: 20, icon: '🔥', flicker: true,                   defaultColor: '#ffff88' },
  lantern:        { name: 'Lantern',           bright: 30, dim: 30, icon: '🏮',                                   defaultColor: '#ffff88' },
  bullseye:       { name: 'Bullseye Lantern',  bright: 60, dim: 60, icon: '🔦', cone: true,                      defaultColor: '#ffff88' },
  light:          { name: 'Light Spell',       bright: 20, dim: 20, icon: '✨',                                   defaultColor: '#ffff88' },
  dancing:        { name: 'Dancing Lights',    bright: 0,  dim: 10, icon: '💫', flicker: true,                   defaultColor: '#ffff88' },
  continual:      { name: 'Continual Flame',   bright: 20, dim: 20, icon: '🔥', flicker: true,                   defaultColor: '#ffff88' },
  daylight:       { name: 'Daylight Spell',    bright: 60, dim: 60, icon: '☀️',                                   defaultColor: '#ffff88' },
  fluorescent:    { name: 'Fluorescent',       bright: 30, dim: 10, icon: '💡', flicker: true, buzz: true,       defaultColor: '#00ffff' },
  bioluminescent: { name: 'Bioluminescent',    bright: 0,  dim: 10, icon: '🧪',                                   defaultColor: '#00ff44' },
  walllight:      { name: 'Wall Light',        bright: 15, dim: 15, icon: '📏', isLine: true,                    defaultColor: '#ffff88' },
} as const satisfies Record<string, LightSourceDef>;

/* ── Derived types & collections ─────────────────────────────────────── */

/** Union of every valid light-source key. */
export type LightSourceType = keyof typeof LIGHT_SOURCES;

/** All light-source keys as a typed array (iteration-safe). */
export const LIGHT_SOURCE_KEYS = Object.keys(LIGHT_SOURCES) as LightSourceType[];

/** Placeable point-lights — everything except wall-mounted line lights. */
export const PLACEABLE_LIGHT_TYPES: LightSourceType[] =
  LIGHT_SOURCE_KEYS.filter(k => !LIGHT_SOURCES[k].isLine);

/** Light types that exhibit flame-like flickering. */
export const FLICKER_LIGHT_TYPES_SET = new Set<string>(
  LIGHT_SOURCE_KEYS.filter(k => LIGHT_SOURCES[k].flicker),
);

/** Subset: lights that use neon-buzz animation instead of flame flicker. */
export const BUZZ_LIGHT_TYPES_SET = new Set<string>(
  LIGHT_SOURCE_KEYS.filter(k => LIGHT_SOURCES[k].buzz),
);

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Return the default hex colour for a given light type. */
export function getDefaultLightColor(type: string): string {
  const def = LIGHT_SOURCES[type as LightSourceType];
  return def?.defaultColor ?? '#ffff88';
}
