/**
 * Screen enumeration utility for the projection system.
 *
 * Uses the Window Management API (`window.getScreenDetails()`) when available,
 * with a graceful fallback to the basic `window.screen` object.  The Window
 * Management API is available in Chromium 100+ / Electron 22+; since Obsidian
 * ships Electron 25+ it should be present but we guard against it being blocked
 * or unavailable all the same.
 */

// ── Types ──────────────────────────────────────────────────────────────

/** Normalised description of a single display. */
export interface ScreenInfo {
  /** Human-readable label (e.g. "DELL U2720Q") or a fallback like "Screen 1". */
  label: string;
  /** Whether this is the operating system's primary display. */
  isPrimary: boolean;
  /** Whether this is the display that hosts the window that made the query. */
  isInternal: boolean;
  /** Pixel bounds within the virtual multi-monitor space. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Available (usable) area — excludes system taskbar / dock. */
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  /** Device pixel ratio (retina / HiDPI scale factor). */
  devicePixelRatio: number;
  /** @internal Native ScreenDetailed object — used by requestFullscreen({ screen }). */
  _native?: any;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Enumerate all attached displays.
 *
 * The first call may trigger a browser permission prompt ("This site wants to
 * know about your screens").  Subsequent calls are instant and use a cached
 * `ScreenDetails` object whose `.screens` array updates live.
 *
 * @returns An array of `ScreenInfo` objects — one per display.  Falls back to
 *          a single-element array built from `window.screen` when the Window
 *          Management API is unavailable.
 */
export async function enumerateScreens(): Promise<ScreenInfo[]> {
  // Try the Window Management API first (Chromium 100+)
  try {
    if ('getScreenDetails' in window && typeof (window as any).getScreenDetails === 'function') {
      const details: any = await (window as any).getScreenDetails();
      if (details?.screens?.length) {
        return (details.screens as any[]).map((s, i) => ({
          label: s.label || `Screen ${i + 1}`,
          isPrimary: !!s.isPrimary,
          isInternal: !!s.isInternal,
          left: s.left ?? s.availLeft ?? 0,
          top: s.top ?? s.availTop ?? 0,
          width: s.width ?? s.availWidth ?? 1920,
          height: s.height ?? s.availHeight ?? 1080,
          availLeft: s.availLeft ?? s.left ?? 0,
          availTop: s.availTop ?? s.top ?? 0,
          availWidth: s.availWidth ?? s.width ?? 1920,
          availHeight: s.availHeight ?? s.height ?? 1080,
          devicePixelRatio: s.devicePixelRatio ?? window.devicePixelRatio ?? 1,
          _native: s,
        }));
      }
    }
  } catch {
    // Permission denied or API unavailable — fall through to legacy path.
  }

  // Fallback: build a single ScreenInfo from the basic Screen API.
  const s = window.screen;
  return [{
    label: 'Primary Screen',
    isPrimary: true,
    isInternal: true,
    left: (s as any).availLeft ?? 0,
    top: (s as any).availTop ?? 0,
    width: s.width,
    height: s.height,
    availLeft: (s as any).availLeft ?? 0,
    availTop: (s as any).availTop ?? 0,
    availWidth: s.availWidth,
    availHeight: s.availHeight,
    devicePixelRatio: window.devicePixelRatio ?? 1,
  }];
}

/**
 * Check whether the multi-screen Window Management API is available.
 * This does NOT trigger the permission prompt.
 */
export function isMultiScreenSupported(): boolean {
  return 'getScreenDetails' in window && typeof (window as any).getScreenDetails === 'function';
}

/**
 * Build a stable key for a ScreenInfo that survives across sessions
 * (as long as the monitor configuration doesn't change).
 */
export function screenKey(s: ScreenInfo): string {
  return `${s.label}@${s.left},${s.top}`;
}
