/**
 * Encounter Generator
 * 
 * Builds random encounter table entries by combining:
 *   - Environment-filtered monster lists (from EnvironmentMapping)
 *   - Monster stats from the SRD API (via SRDApiClient)
 *   - The plugin's own survival-ratio difficulty calculation (from EncounterBuilder)
 *
 * The generator picks random monsters from the available pool and adjusts counts
 * to achieve a target difficulty spread across the table.
 */

import type { SRDMonster } from "./SRDApiClient";
import { SRDApiClient } from "./SRDApiClient";
import { getMonstersForEnvironment } from "./EnvironmentMapping";

// ─── Types ────────────────────────────────────────────────────────────────

export type EncounterDifficulty = "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly" | "TPK Risk";

export interface EncounterMonsterGroup {
  /** Display name from SRD */
  name: string;
  /** SRD API index */
  index: string;
  /** Count of this monster in the encounter */
  count: number;
  /** Challenge rating in display format ("1/4", "2", etc.) */
  cr: string;
  /** Numeric CR */
  crNumeric: number;
  /** XP per individual monster */
  xpEach: number;
}

export interface EncounterTableEntry {
  /** 1-based roll number */
  roll: number;
  /** Monster groups in this encounter (usually 1, sometimes 2 for mixed encounters) */
  monsters: EncounterMonsterGroup[];
  /** Calculated difficulty using plugin's survival-ratio system */
  difficulty: EncounterDifficulty;
  /** Total XP of the encounter */
  totalXP: number;
}

export interface GenerationOptions {
  /** Environment ID (e.g. "forest") */
  environmentId: string;
  /** Average party level (1–20) */
  partyLevel: number;
  /** Number of party members */
  partySize: number;
  /** How many table entries to generate */
  numEntries: number;
}

/** Interface for the difficulty math we borrow from EncounterBuilder */
export interface DifficultyCalculator {
  getCRStats(cr: string | undefined): { hp: number; ac: number; dpr: number; attackBonus: number; xp: number };
  getLevelStats(level: number): { hp: number; ac: number; dpr: number; attackBonus: number };
  calculateHitChance(attackBonus: number, targetAC: number): number;
}

// ─── Difficulty defaults ──────────────────────────────────────────────────

/** Difficulty distribution for generated tables (weighted towards Medium) */
const DIFFICULTY_DISTRIBUTION: EncounterDifficulty[] = [
  "Easy",
  "Medium",
  "Medium",
  "Hard",
  "Medium",
  "Deadly",
  "Easy",
  "Medium",
  "Hard",
  "Medium",
  "Medium",
  "Easy",
  "Hard",
  "Medium",
  "Easy",
  "Medium",
  "Medium",
  "Deadly",
  "Medium",
  "Hard",
];

const DIFFICULTY_ORDER: EncounterDifficulty[] = ["Trivial", "Easy", "Medium", "Hard", "Deadly", "TPK Risk"];

// ─── Generator ────────────────────────────────────────────────────────────

export class EncounterGenerator {
  private apiClient: SRDApiClient;
  private diffCalc: DifficultyCalculator;

  constructor(apiClient: SRDApiClient, difficultyCalculator: DifficultyCalculator) {
    this.apiClient = apiClient;
    this.diffCalc = difficultyCalculator;
  }

  /**
   * Generate a complete set of random encounter table entries.
   * 
   * If the monster pool for the environment + level range is empty,
   * returns an empty array (caller should show a notice).
   */
  async generateTable(options: GenerationOptions): Promise<EncounterTableEntry[]> {
    const { environmentId, partyLevel, partySize, numEntries } = options;

    // 1. Get monster indices for this environment
    const monsterIndices = getMonstersForEnvironment(environmentId);
    if (monsterIndices.length === 0) return [];

    // 2. Determine CR range appropriate for party level
    const { minCR, maxCR } = this.getCRRange(partyLevel);

    // 3. Fetch and filter monsters from SRD API
    const availableMonsters = await this.apiClient.getMonstersInCRRange(monsterIndices, minCR, maxCR);
    if (availableMonsters.length === 0) return [];

    // 4. Pre-compute party stats
    const partyStats = this.getPartyStats(partyLevel, partySize);

    // 5. Build entries
    const entries: EncounterTableEntry[] = [];
    const usedCombinations = new Set<string>(); // Avoid duplicate encounters

    for (let i = 0; i < numEntries; i++) {
      const targetDifficulty = DIFFICULTY_DISTRIBUTION[i % DIFFICULTY_DISTRIBUTION.length] ?? "Medium";
      const entry = this.buildEntry(availableMonsters, targetDifficulty, partyStats, usedCombinations);
      entries.push({ roll: i + 1, ...entry });
    }

    return entries;
  }

  /**
   * Generate a single replacement entry for a given roll number.
   * Used by the reroll feature to replace one row in an existing table.
   *
   * @param options       Same generation options as the original table
   * @param roll          The roll number to assign to the new entry
   * @param excludeIndices SRD monster indices to exclude (e.g. the current entry's monsters)
   * @param targetDifficulty Optional difficulty target; defaults to "Medium"
   */
  async generateSingleEntry(
    options: Omit<GenerationOptions, "numEntries">,
    roll: number,
    excludeIndices: string[] = [],
    targetDifficulty: EncounterDifficulty = "Medium",
  ): Promise<EncounterTableEntry | null> {
    const { environmentId, partyLevel, partySize } = options;

    const monsterIndices = getMonstersForEnvironment(environmentId);
    if (monsterIndices.length === 0) return null;

    const { minCR, maxCR } = this.getCRRange(partyLevel);
    const allMonsters = await this.apiClient.getMonstersInCRRange(monsterIndices, minCR, maxCR);
    if (allMonsters.length === 0) return null;

    // Filter out excluded monsters (the ones we're replacing)
    const excludeSet = new Set(excludeIndices);
    let availableMonsters = allMonsters.filter((m) => !excludeSet.has(m.index));

    // If filtering removed everything, fall back to the full pool
    if (availableMonsters.length === 0) {
      availableMonsters = allMonsters;
    }

    const partyStats = this.getPartyStats(partyLevel, partySize);
    const usedCombinations = new Set<string>();

    const entry = this.buildEntry(availableMonsters, targetDifficulty, partyStats, usedCombinations);
    return { roll, ...entry };
  }

  // ── CR Range ──────────────────────────────────────────────────────────

  /**
   * Determine an appropriate CR range for encounter generation
   * based on party level. Wider at higher levels to give variety.
   */
  private getCRRange(partyLevel: number): { minCR: number; maxCR: number } {
    // Low levels: CR 0 – partyLevel + 2
    // Mid levels: CR max(0, partyLevel-4) – partyLevel + 3
    // High levels: wider spread
    if (partyLevel <= 4) {
      return { minCR: 0, maxCR: partyLevel + 2 };
    } else if (partyLevel <= 10) {
      return { minCR: Math.max(0, partyLevel - 4), maxCR: partyLevel + 3 };
    } else {
      return { minCR: Math.max(0, partyLevel - 5), maxCR: partyLevel + 5 };
    }
  }

  // ── Party Stats ───────────────────────────────────────────────────────

  private getPartyStats(partyLevel: number, partySize: number) {
    const levelStats = this.diffCalc.getLevelStats(partyLevel);
    return {
      totalHP: levelStats.hp * partySize,
      totalDPR: levelStats.dpr * partySize,
      avgAC: levelStats.ac,
      avgAttackBonus: levelStats.attackBonus,
      count: partySize,
    };
  }

  // ── Single Entry Builder ──────────────────────────────────────────────

  private buildEntry(
    monsters: SRDMonster[],
    targetDifficulty: EncounterDifficulty,
    partyStats: ReturnType<typeof this.getPartyStats>,
    usedCombinations: Set<string>,
  ): Omit<EncounterTableEntry, "roll"> {
    // Try multiple times to avoid duplicates
    for (let attempt = 0; attempt < 20; attempt++) {
      const monster = monsters[Math.floor(Math.random() * monsters.length)];
      if (!monster) continue;
      const crStr = SRDApiClient.formatCR(monster.challenge_rating);
      const crStats = this.diffCalc.getCRStats(crStr);

      // Find the count that best matches the target difficulty
      const { count, difficulty } = this.findBestCount(crStats, partyStats, targetDifficulty);

      const key = `${monster.index}:${count}`;
      if (usedCombinations.has(key) && attempt < 19) continue;
      usedCombinations.add(key);

      const group: EncounterMonsterGroup = {
        name: monster.name,
        index: monster.index,
        count,
        cr: crStr,
        crNumeric: monster.challenge_rating,
        xpEach: crStats.xp,
      };

      return {
        monsters: [group],
        difficulty,
        totalXP: crStats.xp * count,
      };
    }

    // Fallback: just pick the first monster
    const fallback = monsters[0]!;
    const crStr = SRDApiClient.formatCR(fallback.challenge_rating);
    const crStats = this.diffCalc.getCRStats(crStr);
    return {
      monsters: [{
        name: fallback.name,
        index: fallback.index,
        count: 1,
        cr: crStr,
        crNumeric: fallback.challenge_rating,
        xpEach: crStats.xp,
      }],
      difficulty: this.classifyDifficulty(crStats, 1, partyStats),
      totalXP: crStats.xp,
    };
  }

  /**
   * Find the monster count that best matches the target difficulty.
   * Uses the plugin's survival-ratio calculation.
   */
  private findBestCount(
    crStats: { hp: number; ac: number; dpr: number; attackBonus: number; xp: number },
    partyStats: ReturnType<typeof this.getPartyStats>,
    target: EncounterDifficulty,
  ): { count: number; difficulty: EncounterDifficulty } {
    let bestCount = 1;
    let bestDifficulty = this.classifyDifficulty(crStats, 1, partyStats);
    let bestDistance = this.difficultyDistance(bestDifficulty, target);

    // Try counts 1–12
    for (let c = 1; c <= 12; c++) {
      const diff = this.classifyDifficulty(crStats, c, partyStats);
      const dist = this.difficultyDistance(diff, target);

      if (dist < bestDistance) {
        bestCount = c;
        bestDifficulty = diff;
        bestDistance = dist;
      }

      // If we overshoot past the target, stop searching
      if (dist === 0) break;
      if (this.isDifficultyHarder(diff, target) && c > 1) break;
    }

    return { count: bestCount, difficulty: bestDifficulty };
  }

  // ── Difficulty Classification (mirrors EncounterBuilder logic) ────────

  /**
   * Calculate the difficulty of N copies of a monster vs the party.
   * Uses the same survival-ratio thresholds as the plugin's EncounterBuilder.
   */
  private classifyDifficulty(
    crStats: { hp: number; ac: number; dpr: number; attackBonus: number },
    monsterCount: number,
    partyStats: ReturnType<typeof this.getPartyStats>,
  ): EncounterDifficulty {
    const enemyHP = crStats.hp * monsterCount;
    const enemyDPR = crStats.dpr * monsterCount;

    const partyHitChance = this.diffCalc.calculateHitChance(partyStats.avgAttackBonus, crStats.ac);
    const enemyHitChance = this.diffCalc.calculateHitChance(crStats.attackBonus, partyStats.avgAC);

    const partyEffectiveDPR = partyStats.totalDPR * partyHitChance;
    const enemyEffectiveDPR = enemyDPR * enemyHitChance;

    if (partyEffectiveDPR <= 0) return "TPK Risk";
    if (enemyEffectiveDPR <= 0) return "Trivial";

    const roundsToDefeatEnemies = enemyHP / partyEffectiveDPR;
    const roundsToDefeatParty = partyStats.totalHP / enemyEffectiveDPR;
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;

    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) return "Trivial";
    if (survivalRatio >= 2.5) return "Easy";
    if (survivalRatio >= 1.5) return "Medium";
    if (survivalRatio >= 1.0) return "Hard";
    if (survivalRatio >= 0.6) return "Deadly";
    return "TPK Risk";
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private isDifficultyHarder(a: EncounterDifficulty, b: EncounterDifficulty): boolean {
    return DIFFICULTY_ORDER.indexOf(a) > DIFFICULTY_ORDER.indexOf(b);
  }

  private difficultyDistance(a: EncounterDifficulty, b: EncounterDifficulty): number {
    return Math.abs(DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b));
  }
}
