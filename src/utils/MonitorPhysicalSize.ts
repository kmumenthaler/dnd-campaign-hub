/**
 * Query physical monitor dimensions via Windows WMI / EDID.
 *
 * Used by the projection auto-calibration system to compute pixels-per-mm
 * without the user having to manually enter their monitor diagonal.
 *
 * Windows-only — returns an empty array on other platforms.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface PhysicalMonitorInfo {
  /** EDID friendly name (e.g. "U2720Q", "LG TV SSCR2"). */
  friendlyName: string;
  /** Physical panel width in centimetres. */
  widthCm: number;
  /** Physical panel height in centimetres. */
  heightCm: number;
}

// ── Cache ──────────────────────────────────────────────────────────────

let _cache: PhysicalMonitorInfo[] | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 120_000; // 2 minutes

// ── Public API ────────────────────────────────────────────────────────

/**
 * Enumerate the physical dimensions of all active monitors.
 *
 * On Windows this shells out to PowerShell to query
 * `WmiMonitorBasicDisplayParams` (physical size in cm) and
 * `WmiMonitorID` (EDID friendly name) from the `root/wmi` namespace.
 *
 * Results are cached for 2 minutes — monitor hot-plug is rare.
 */
export function queryPhysicalMonitorSizes(): PhysicalMonitorInfo[] {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache;

  const nodeRequire: NodeRequire | undefined = (globalThis as any).require;
  if (!nodeRequire) return [];

  try {
    const platform: string | undefined = (globalThis as any).process?.platform;
    if (platform !== 'win32') return [];

    const { execSync } = nodeRequire('child_process') as typeof import('child_process');

    // PowerShell script that:
    // 1. Queries WmiMonitorBasicDisplayParams for physical panel size (cm)
    // 2. Queries WmiMonitorID for the EDID friendly name
    // 3. Correlates them by InstanceName prefix
    // 4. Outputs JSON array
    const psScript = [
      '$ErrorActionPreference="SilentlyContinue"',
      '$p=Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams',
      '$n=Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID',
      '$r=@()',
      'foreach($m in $p){',
      '  if(-not $m.Active){continue}',
      '  $k=($m.InstanceName -split "_")[0..1]-join"_"',
      '  $fn=""',
      '  foreach($i in $n){',
      '    $ik=($i.InstanceName -split "_")[0..1]-join"_"',
      '    if($ik -eq $k){',
      '      $fn=(($i.UserFriendlyName|?{$_ -ne 0}|%{[char]$_})-join"").Trim()',
      '      break',
      '    }',
      '  }',
      '  $r+=[PSCustomObject]@{N=$fn;W=[int]$m.MaxHorizontalImageSize;H=[int]$m.MaxVerticalImageSize}',
      '}',
      'if($r.Count -eq 0){"[]"}',
      'elseif($r.Count -eq 1){ConvertTo-Json @($r) -Compress}',
      'else{ConvertTo-Json $r -Compress}',
    ].join('\n');

    const output = (execSync('powershell -NoProfile -Command -', {
      input: psScript,
      encoding: 'utf-8',
      timeout: 10_000,
      windowsHide: true,
    }) as string).trim();

    if (!output || output === '[]') {
      _cache = [];
      _cacheTs = Date.now();
      return _cache;
    }

    const parsed = JSON.parse(output);
    const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];

    _cache = arr
      .filter((m: any) => m.W > 0 && m.H > 0)
      .map((m: any) => ({
        friendlyName: String(m.N || '').trim(),
        widthCm: Number(m.W) || 0,
        heightCm: Number(m.H) || 0,
      }));
    _cacheTs = Date.now();

    console.log('MonitorPhysicalSize: detected', _cache);
    return _cache;
  } catch (e) {
    console.warn('queryPhysicalMonitorSizes failed:', e);
    _cache = [];
    _cacheTs = Date.now();
    return _cache;
  }
}

/**
 * Match a `ScreenInfo.label` to a physical monitor entry by comparing
 * the EDID friendly name with the Window Management API screen label.
 */
export function matchScreenToPhysical(
  screenLabel: string,
  monitors: PhysicalMonitorInfo[],
): PhysicalMonitorInfo | null {
  if (!monitors.length) return null;
  if (!screenLabel) return monitors.length === 1 ? monitors[0] : null;

  const label = screenLabel.toLowerCase();

  // 1. Direct substring match on friendly name
  for (const m of monitors) {
    if (!m.friendlyName) continue;
    const fn = m.friendlyName.toLowerCase();
    if (label.includes(fn) || fn.includes(label)) return m;
  }

  // 2. Model-number fragment match (tokens ≥ 3 chars)
  for (const m of monitors) {
    if (!m.friendlyName) continue;
    const parts = m.friendlyName.split(/[\s\-_]+/).filter(p => p.length >= 3);
    for (const part of parts) {
      if (label.includes(part.toLowerCase())) return m;
    }
  }

  // 3. If only one physical monitor, use it regardless of name
  if (monitors.length === 1) return monitors[0];

  return null;
}

/** Invalidate cached data (e.g. after monitor change). */
export function clearPhysicalMonitorCache(): void {
  _cache = null;
  _cacheTs = 0;
}
