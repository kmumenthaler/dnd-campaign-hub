/**
 * SRD API Client for fetching D&D 5e monster data
 * 
 * Uses the free D&D 5e SRD API (https://www.dnd5eapi.co/) to retrieve monster
 * stats. Results are cached in memory so repeated calls are instant and the
 * plugin works offline after the first fetch.
 * 
 * Uses Obsidian's `requestUrl` to avoid CORS issues.
 */

import { requestUrl } from "obsidian";

const BASE_URL = "https://www.dnd5eapi.co/api";

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
   * Cached after the first call.
   */
  async getMonsterList(): Promise<SRDMonsterListItem[]> {
    if (this.listCache) return this.listCache;

    const response = await requestUrl({ url: `${BASE_URL}/monsters` });
    this.listCache = response.json.results as SRDMonsterListItem[];
    return this.listCache;
  }

  // ── Detail endpoints ────────────────────────────────────────────────

  /**
   * Fetch full details for a single monster by index.
   * Returns null if the monster doesn't exist or the request fails.
   */
  async getMonster(index: string): Promise<SRDMonster | null> {
    if (this.monsterCache.has(index)) return this.monsterCache.get(index)!;

    try {
      const response = await requestUrl({ url: `${BASE_URL}/monsters/${index}` });
      const monster = response.json as SRDMonster;
      this.monsterCache.set(index, monster);
      return monster;
    } catch (error) {
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
   * Clear the in-memory cache (useful for testing or forced refresh).
   */
  clearCache(): void {
    this.monsterCache.clear();
    this.listCache = null;
  }
}
