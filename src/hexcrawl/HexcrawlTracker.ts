/**
 * Hexcrawl Tracker
 * 
 * Core state machine for managing wilderness hex-by-hex travel.
 * Tracks day progression, party position, movement budget, terrain effects,
 * weather, and the survival meter. Persisted alongside map annotations.
 */

import {
  HexcrawlState,
  HexcrawlPace,
  HexTerrain,
  HexClimate,
  TerrainType,
  ClimateType,
  WeatherType,
  TravelLogEntry,
  ExplorationCheckResult,
  SurvivalMeterState,
  createDefaultHexcrawlState,
  getTerrainDefinition,
  HEXCRAWL_PACES,
  WEATHER_TABLE,
  DEFAULT_SURVIVAL_METER,
} from './types';

// ─── Tracker ──────────────────────────────────────────────────────────────

export class HexcrawlTracker {
  state: HexcrawlState;
  private hexTerrainMap: Map<string, TerrainType>; // "col,row" → TerrainType
  private hexClimateMap: Map<string, ClimateType>; // "col,row" → ClimateType
  private hexCustomDescMap: Map<string, string>;   // "col,row" → custom description

  constructor(state?: HexcrawlState, hexTerrains?: HexTerrain[], hexClimates?: HexClimate[]) {
    this.state = state || createDefaultHexcrawlState('');
    this.hexTerrainMap = new Map();
    this.hexClimateMap = new Map();
    this.hexCustomDescMap = new Map();
    if (hexTerrains) {
      for (const ht of hexTerrains) {
        this.hexTerrainMap.set(`${ht.col},${ht.row}`, ht.terrain);
        if (ht.customDescription) {
          this.hexCustomDescMap.set(`${ht.col},${ht.row}`, ht.customDescription);
        }
      }
    }
    if (hexClimates) {
      for (const hc of hexClimates) {
        this.hexClimateMap.set(`${hc.col},${hc.row}`, hc.climate);
      }
    }
  }

  // ── Terrain Helpers ──────────────────────────────────────────────────

  /**
   * Load terrain data from map annotation hex terrains.
   */
  loadTerrainData(hexTerrains: HexTerrain[]): void {
    this.hexTerrainMap.clear();
    for (const ht of hexTerrains) {
      this.hexTerrainMap.set(`${ht.col},${ht.row}`, ht.terrain);
    }
  }

  /**
   * Get terrain type for a specific hex. Returns 'plains' if unassigned.
   */
  getTerrainAt(col: number, row: number): TerrainType {
    return this.hexTerrainMap.get(`${col},${row}`) || 'plains';
  }

  /**
   * Load climate data from map annotation hex climates.
   */
  loadClimateData(hexClimates: HexClimate[]): void {
    this.hexClimateMap.clear();
    for (const hc of hexClimates) {
      this.hexClimateMap.set(`${hc.col},${hc.row}`, hc.climate);
    }
  }

  /**
   * Get climate type for a specific hex. Returns undefined if no climate set.
   */
  getClimateAt(col: number, row: number): ClimateType | undefined {
    return this.hexClimateMap.get(`${col},${row}`);
  }

  /**
   * Get per-tile custom description. Returns undefined if none set.
   */
  getCustomDescriptionAt(col: number, row: number): string | undefined {
    return this.hexCustomDescMap.get(`${col},${row}`);
  }

  // ── Movement Budget ──────────────────────────────────────────────────

  /**
   * Get the maximum hexes the party can move today, considering:
   * - Base pace (slow/normal/fast → 3/4/5)
   * - Current hex terrain modifier
   * - Weather modifier
   */
  getMaxHexesToday(): number {
    const paceDef = HEXCRAWL_PACES.find(p => p.id === this.state.pace) ?? HEXCRAWL_PACES[1]!;
    const weather = WEATHER_TABLE.find(w => w.type === this.state.currentWeather) ?? WEATHER_TABLE[0]!;
    // Base budget from pace
    return Math.max(1, Math.floor(paceDef!.hexesPerDay * weather!.travelModifier));
  }

  /**
   * Calculate effective hexes-per-day for a specific terrain + weather combo.
   * Used for estimating travel cost of the next hex.
   */
  getMovementCostForHex(col: number, row: number): number {
    const terrain = getTerrainDefinition(this.getTerrainAt(col, row));
    // A hex with 0.5 travelModifier costs 2 movement points (takes twice as long)
    // A hex with 1.0 costs 1 movement point
    if (terrain.travelModifier <= 0) return Infinity; // Impassable (water without a vessel)
    return Math.max(1, Math.round(1 / terrain.travelModifier));
  }

  /**
   * Check if the party has movement budget left today
   */
  canMoveToday(): boolean {
    return this.state.hexesMovedToday < this.getMaxHexesToday();
  }

  /**
   * Get remaining movement this day.
   */
  getRemainingMovement(): number {
    return Math.max(0, this.getMaxHexesToday() - this.state.hexesMovedToday);
  }

  // ── Day / Hex Progression ────────────────────────────────────────────

  /**
   * Advance the party to a new hex. Returns the cost in movement points.
   * Does NOT trigger the per-hex procedure — that's handled by the modal.
   */
  moveToHex(col: number, row: number): number {
    const cost = this.getMovementCostForHex(col, row);
    this.state.hexesMovedToday += cost;
    this.state.partyPosition = { col, row };
    this.state.visitedHexes.push({ col, row, day: this.state.currentDay });
    this.state.lastModified = new Date().toISOString();
    return cost;
  }

  /**
   * End the current day and advance to the next one.
   * Resets daily movement budget.
   */
  endDay(): void {
    this.state.currentDay += 1;
    this.state.hexesMovedToday = 0;
    this.state.lastModified = new Date().toISOString();
  }

  /**
   * Set the party position without expending movement (e.g., initial placement).
   */
  setPartyPosition(col: number, row: number): void {
    this.state.partyPosition = { col, row };
    if (!this.state.visitedHexes.some(v => v.col === col && v.row === row)) {
      this.state.visitedHexes.push({ col, row, day: this.state.currentDay });
    }
    this.state.lastModified = new Date().toISOString();
  }

  // ── Pace ─────────────────────────────────────────────────────────────

  setPace(pace: HexcrawlPace): void {
    this.state.pace = pace;
    this.state.lastModified = new Date().toISOString();
  }

  // ── Weather ──────────────────────────────────────────────────────────

  setWeather(weather: WeatherType): void {
    this.state.currentWeather = weather;
    this.state.lastModified = new Date().toISOString();
  }

  /**
   * Roll random weather. Simple weighted d12 table.
   */
  rollWeather(): WeatherType {
    const roll = Math.floor(Math.random() * 12) + 1;
    let result: WeatherType;
    if (roll <= 4) result = 'clear';
    else if (roll <= 6) result = 'overcast';
    else if (roll <= 7) result = 'fog';
    else if (roll <= 9) result = 'rain';
    else if (roll === 10) result = 'heavy-rain';
    else if (roll === 11) result = 'thunderstorm';
    else result = 'snow'; // 12
    this.setWeather(result);
    return result;
  }

  // ── Survival Meter ───────────────────────────────────────────────────

  /**
   * Decrement the survival meter by an amount.
   * Returns the new value.
   */
  decrementMeter(amount: number = 1): number {
    this.state.survivalMeter.current = Math.max(0, this.state.survivalMeter.current - amount);
    this.state.lastModified = new Date().toISOString();
    return this.state.survivalMeter.current;
  }

  /**
   * Increment the survival meter (e.g., successful forage, sanctuary).
   */
  incrementMeter(amount: number = 1): number {
    this.state.survivalMeter.current = Math.min(
      this.state.survivalMeter.max,
      this.state.survivalMeter.current + amount
    );
    this.state.lastModified = new Date().toISOString();
    return this.state.survivalMeter.current;
  }

  /**
   * Reset meter to max (sanctuary, full rest in settlement, etc.)
   */
  resetMeter(): void {
    this.state.survivalMeter.current = this.state.survivalMeter.max;
    this.state.lastModified = new Date().toISOString();
  }

  /**
   * Check if survival meter is at or below the danger threshold.
   */
  isMeterAtThreshold(): boolean {
    return this.state.survivalMeter.current <= this.state.survivalMeter.threshold;
  }

  /**
   * Check if survival meter is at zero (exhaustion starts).
   */
  isMeterDepleted(): boolean {
    return this.state.survivalMeter.current <= 0;
  }

  // ── Exhaustion ───────────────────────────────────────────────────────

  addExhaustion(levels: number = 1): number {
    this.state.exhaustionLevel = Math.min(6, this.state.exhaustionLevel + levels);
    this.state.lastModified = new Date().toISOString();
    return this.state.exhaustionLevel;
  }

  removeExhaustion(levels: number = 1): number {
    this.state.exhaustionLevel = Math.max(0, this.state.exhaustionLevel - levels);
    this.state.lastModified = new Date().toISOString();
    return this.state.exhaustionLevel;
  }

  getExhaustionEffect(): string {
    switch (this.state.exhaustionLevel) {
      case 0: return 'None';
      case 1: return 'Disadvantage on ability checks';
      case 2: return 'Speed halved';
      case 3: return 'Disadvantage on attacks and saves';
      case 4: return 'HP maximum halved';
      case 5: return 'Speed reduced to 0';
      case 6: return 'Death';
      default: return 'None';
    }
  }

  // ── Travel Log ───────────────────────────────────────────────────────

  /**
   * Add a completed hex entry to the travel log.
   * Called after the per-hex procedure modal completes.
   */
  addLogEntry(entry: Omit<TravelLogEntry, 'timestamp'>): void {
    this.state.travelLog.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    this.state.lastModified = new Date().toISOString();
  }

  /**
   * Get today's log entries.
   */
  getTodayLog(): TravelLogEntry[] {
    return this.state.travelLog.filter(e => e.day === this.state.currentDay);
  }

  /**
   * Get the full log for a specific day.
   */
  getLogForDay(day: number): TravelLogEntry[] {
    return this.state.travelLog.filter(e => e.day === day);
  }

  // ── Role Assignments ─────────────────────────────────────────────────

  assignRole(roleId: string, playerName: string): void {
    this.state.roleAssignments[roleId] = playerName;
    this.state.lastModified = new Date().toISOString();
  }

  clearRoles(): void {
    this.state.roleAssignments = {};
    this.state.lastModified = new Date().toISOString();
  }

  // ── Serialization ────────────────────────────────────────────────────

  /**
   * Get the state for JSON serialization.
   */
  toJSON(): HexcrawlState {
    return { ...this.state };
  }

  /**
   * Create a tracker from saved JSON state.
   */
  static fromJSON(data: HexcrawlState, hexTerrains?: HexTerrain[]): HexcrawlTracker {
    return new HexcrawlTracker(data, hexTerrains);
  }
}
