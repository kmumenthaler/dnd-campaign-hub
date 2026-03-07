/**
 * SRD API Client for fetching D&D 5e monster data
 * 
 * Uses the free D&D 5e SRD API (https://www.dnd5eapi.co/) to retrieve monster
 * stats. Results are cached in memory AND persisted to localStorage so the
 * plugin works offline across sessions after the first successful fetch.
 * 
 * Uses Obsidian's `requestUrl` to avoid CORS issues.
 */

import { requestUrl } from "obsidian";

const BASE_URL = "https://www.dnd5eapi.co/api";

// ─── Persistent cache keys ────────────────────────────────────────────────

const LS_LIST_KEY = "dnd-srd-monster-list";
const LS_MONSTER_PREFIX = "dnd-srd-monster:";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SRDMonsterListItem {
  index: string;
  name: string;
  url: string;
}

export interface SRDMonsterArmorClass {
  type: string;
  value: number;
}

export interface SRDMonster {
  index: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  armor_class: SRDMonsterArmorClass[];
  hit_points: number;
  hit_dice: string;
  challenge_rating: number;
  xp: number;
  // We only need the above fields for encounter generation,
  // but the API returns much more. Keep the type loose for extras.
  [key: string]: unknown;
}

// ─── Client ───────────────────────────────────────────────────────────────

export class SRDApiClient {
  /** Individual monster detail cache (index → monster) */
  private monsterCache: Map<string, SRDMonster> = new Map();

  /** Full monster list cache */
  private listCache: SRDMonsterListItem[] | null = null;

  // ── List endpoints ──────────────────────────────────────────────────

  /**
   * Fetch the complete list of SRD monsters (index + name only).
   * Cached in memory after the first call and persisted to localStorage.
   * Falls back to the localStorage cache when the API is unreachable.
   */
  async getMonsterList(): Promise<SRDMonsterListItem[]> {
    if (this.listCache) return this.listCache;

    try {
      const response = await requestUrl({ url: `${BASE_URL}/monsters` });
      this.listCache = response.json.results as SRDMonsterListItem[];

      // Persist to localStorage for offline use
      try { localStorage.setItem(LS_LIST_KEY, JSON.stringify(this.listCache)); } catch { /* quota exceeded – non-fatal */ }

      return this.listCache;
    } catch (error) {
      console.warn("[SRDApiClient] API unreachable, falling back to localStorage cache", error);

      // Try localStorage fallback
      try {
        const cached = localStorage.getItem(LS_LIST_KEY);
        if (cached) {
          this.listCache = JSON.parse(cached) as SRDMonsterListItem[];
          return this.listCache;
        }
      } catch { /* corrupt cache – fall through */ }

      // Nothing cached – rethrow original error so callers know there's no data
      throw error;
    }
  }

  // ── Detail endpoints ────────────────────────────────────────────────

  /**
   * Fetch full details for a single monster by index.
   * Falls back to localStorage if the API request fails.
   * Returns null only when neither API nor cache has the data.
   */
  async getMonster(index: string): Promise<SRDMonster | null> {
    if (this.monsterCache.has(index)) return this.monsterCache.get(index)!;

    try {
      const response = await requestUrl({ url: `${BASE_URL}/monsters/${index}` });
      const monster = response.json as SRDMonster;
      this.monsterCache.set(index, monster);

      // Persist to localStorage
      try { localStorage.setItem(LS_MONSTER_PREFIX + index, JSON.stringify(monster)); } catch { /* quota exceeded */ }

      return monster;
    } catch (error) {
      // Try localStorage fallback before giving up
      try {
        const cached = localStorage.getItem(LS_MONSTER_PREFIX + index);
        if (cached) {
          const monster = JSON.parse(cached) as SRDMonster;
          this.monsterCache.set(index, monster);
          return monster;
        }
      } catch { /* corrupt cache */ }

      console.error(`[SRDApiClient] Failed to fetch monster "${index}":`, error);
      return null;
    }
  }

  /**
   * Batch-fetch multiple monsters by index.
   * Fetches from cache where available and only makes API calls for misses.
   * Returns all successfully fetched monsters (skips failures).
   */
  async getMonsters(indices: string[]): Promise<SRDMonster[]> {
    const results: SRDMonster[] = [];
    const toFetch: string[] = [];

    // Separate cached vs uncached
    for (const index of indices) {
      const cached = this.monsterCache.get(index);
      if (cached) {
        results.push(cached);
      } else {
        toFetch.push(index);
      }
    }

    // Fetch uncached monsters (in batches to avoid overwhelming the API)
    const BATCH_SIZE = 10;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      const promises = batch.map(index => this.getMonster(index));
      const fetched = await Promise.all(promises);
      for (const monster of fetched) {
        if (monster) results.push(monster);
      }
    }

    return results;
  }

  // ── Filtering helpers ───────────────────────────────────────────────

  /**
   * Fetch monsters from a list of indices and filter by challenge rating range.
   * 
   * @param monsterIndices - Monster indices to consider
   * @param minCR - Minimum challenge rating (inclusive)
   * @param maxCR - Maximum challenge rating (inclusive)
   */
  async getMonstersInCRRange(
    monsterIndices: string[],
    minCR: number,
    maxCR: number
  ): Promise<SRDMonster[]> {
    const allMonsters = await this.getMonsters(monsterIndices);
    return allMonsters.filter(m => m.challenge_rating >= minCR && m.challenge_rating <= maxCR);
  }

  // ── Utility ─────────────────────────────────────────────────────────

  /**
   * Convert a numeric CR to the standard display format.
   * 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", 3 → "3"
   */
  static formatCR(cr: number): string {
    if (cr === 0.125) return "1/8";
    if (cr === 0.25)  return "1/4";
    if (cr === 0.5)   return "1/2";
    return cr.toString();
  }

  /**
   * Convert a display CR string to its numeric value.
   * "1/8" → 0.125, "1/4" → 0.25, "1/2" → 0.5, "3" → 3
   */
  static parseCR(cr: string): number {
    if (cr === "1/8") return 0.125;
    if (cr === "1/4") return 0.25;
    if (cr === "1/2") return 0.5;
    return parseFloat(cr) || 0;
  }

  /**
   * Clear the in-memory cache.
   * If `clearPersistent` is true, also wipes the localStorage fallback data.
   */
  clearCache(clearPersistent = false): void {
    this.monsterCache.clear();
    this.listCache = null;

    if (clearPersistent) {
      try {
        localStorage.removeItem(LS_LIST_KEY);
        // Remove all individual monster entries
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(LS_MONSTER_PREFIX)) keysToRemove.push(key);
        }
        for (const key of keysToRemove) localStorage.removeItem(key);
      } catch { /* non-fatal */ }
    }
  }
}
