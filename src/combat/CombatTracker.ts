import { App, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { Combatant, CombatState, CombatListener, StatusEffect } from "./types";
import type { EncounterCreature } from "../encounter/EncounterBuilder";

/**
 * Core combat engine. Manages combatants, initiative order, rounds,
 * HP tracking, and status effects. Fully self-contained — no dependency
 * on the Initiative Tracker plugin.
 */
export class CombatTracker {
  private state: CombatState | null = null;
  private listeners = new Set<CombatListener>();

  constructor(private app: App, private plugin: DndCampaignHubPlugin) {}

  /* ────────────────── Listeners ────────────────── */

  onChange(fn: CombatListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.getState();
    for (const fn of this.listeners) fn(snap);
  }

  /* ────────────────── State Accessors ────────────────── */

  getState(): CombatState | null {
    return this.state ? { ...this.state, combatants: this.state.combatants.map(c => ({ ...c, statuses: [...c.statuses] })) } : null;
  }

  isActive(): boolean {
    return this.state !== null;
  }

  getCurrentCombatant(): Combatant | null {
    if (!this.state || !this.state.started) return null;
    return this.state.combatants[this.state.turnIndex] ?? null;
  }

  /* ────────────────── Start / End Combat ────────────────── */

  /**
   * Start a new combat from an encounter's creature list + party members.
   * Creatures get expanded (count → individual instances).
   * PCs are resolved from vault notes via frontmatter.
   */
  async startFromEncounter(
    encounterName: string,
    creatures: EncounterCreature[],
    partyMembers: Array<{ name: string; level: number; hp: number; ac: number; notePath?: string; tokenId?: string; initBonus?: number; thp?: number }>,
    useColorNames: boolean,
  ): Promise<void> {
    const combatants: Combatant[] = [];

    // ── Party members ──
    for (const pm of partyMembers) {
      combatants.push({
        id: this.generateId(),
        name: pm.name,
        display: pm.name,
        initiative: 0,
        modifier: pm.initBonus ?? 0,
        currentHP: pm.hp,
        maxHP: pm.hp,
        tempHP: pm.thp ?? 0,
        ac: pm.ac,
        currentAC: pm.ac,
        player: true,
        friendly: false,
        hidden: false,
        notePath: pm.notePath,
        tokenId: pm.tokenId,
        statuses: [],
        level: pm.level,
      });
    }

    // ── Creatures ──
    const colors = [
      "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
      "Pink", "Brown", "Black", "White", "Gray", "Cyan",
      "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold",
      "Silver", "Bronze",
    ];

    for (const ec of creatures) {
      for (let i = 0; i < ec.count; i++) {
        let display = ec.name;
        if (ec.count > 1 && useColorNames) {
          display = `${ec.name} (${colors[i % colors.length]})`;
        } else if (ec.count > 1) {
          display = `${ec.name} ${i + 1}`;
        }

        // Try to read modifier from vault note
        let modifier = 0;
        if (ec.path && ec.path !== "[SRD]") {
          const dexMod = await this.readDexModifier(ec.path);
          if (dexMod !== null) modifier = dexMod;
        }

        // Resolve tokenId from MarkerLibrary
        let tokenId: string | undefined;
        if (ec.path && ec.path !== "[SRD]") {
          const file = this.app.vault.getAbstractFileByPath(ec.path);
          if (file instanceof TFile) {
            const cache = this.app.metadataCache.getFileCache(file);
            tokenId = cache?.frontmatter?.token_id;
          }
        }

        combatants.push({
          id: this.generateId(),
          name: ec.name,
          display,
          initiative: 0,
          modifier,
          currentHP: ec.hp ?? 1,
          maxHP: ec.hp ?? 1,
          tempHP: 0,
          ac: ec.ac ?? 10,
          currentAC: ec.ac ?? 10,
          player: false,
          friendly: ec.isFriendly ?? false,
          hidden: ec.isHidden ?? false,
          notePath: ec.path && ec.path !== "[SRD]" ? ec.path : undefined,
          tokenId,
          statuses: [],
          cr: ec.cr,
        });
      }
    }

    this.state = {
      encounterName,
      combatants,
      round: 0,
      turnIndex: 0,
      started: false,
      savedAt: new Date().toISOString(),
    };

    this.emit();
    new Notice(`⚔️ Combat ready: ${combatants.length} combatants. Roll initiative!`);
  }

  /** Check whether the Initiative Tracker plugin is configured to auto-roll initiative for PCs. */
  private get rollPlayerInitiatives(): boolean {
    const it = (this.app as any).plugins?.plugins?.["initiative-tracker"];
    return !!it?.data?.rollPlayerInitiatives;
  }

  /** Roll initiative for all combatants and sort.
   *  PCs are skipped unless the Initiative Tracker's "Roll for Players" setting is enabled. */
  rollAllInitiative(): void {
    if (!this.state) return;
    const rollPCs = this.rollPlayerInitiatives;

    for (const c of this.state.combatants) {
      if (c.player && !rollPCs) continue;
      c.initiative = this.rollD20() + c.modifier;
    }

    this.sortByInitiative();
    this.state.round = 1;
    this.state.turnIndex = 0;
    this.state.started = true;

    // Mark first combatant as active turn
    this.emit();
    const pcNote = rollPCs ? "" : " (enter PC initiatives manually)";
    new Notice(`🎲 Initiative rolled! Round 1 — ${this.state.combatants[0]?.display}'s turn${pcNote}`);
  }

  /** Set initiative manually for a single combatant. */
  setInitiative(combatantId: string, value: number): void {
    const c = this.findCombatant(combatantId);
    if (!c || !this.state) return;
    c.initiative = value;
    this.sortByInitiative();
    this.emit();
  }

  /** Roll initiative for a single combatant (e.g. if they join mid-combat). */
  rollInitiativeFor(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c || !this.state) return;
    c.initiative = this.rollD20() + c.modifier;
    this.sortByInitiative();
    this.emit();
  }

  /** Advance to the next combatant's turn. */
  nextTurn(): void {
    if (!this.state || !this.state.started) return;

    // Tick down status durations on the combatant whose turn is ending
    this.tickStatuses(this.state.turnIndex);

    // Find next enabled combatant
    const len = this.state.combatants.length;
    let next = this.state.turnIndex;
    for (let i = 0; i < len; i++) {
      next++;
      if (next >= len) {
        next = 0;
        this.state.round++;
      }
      const c = this.state.combatants[next];
      if (c && (c.enabled ?? true)) break;
    }
    this.state.turnIndex = next;

    const current = this.state.combatants[this.state.turnIndex];
    this.emit();
    if (current) {
      new Notice(`⏩ Round ${this.state.round} — ${current.display}'s turn`);
    }
  }

  /** Go back to the previous combatant's turn. */
  prevTurn(): void {
    if (!this.state || !this.state.started) return;

    this.state.turnIndex--;
    if (this.state.turnIndex < 0) {
      this.state.turnIndex = this.state.combatants.length - 1;
      this.state.round = Math.max(1, this.state.round - 1);
    }

    this.emit();
  }

  /** End combat entirely. */
  endCombat(): void {
    this.state = null;
    this.emit();
    new Notice("🏁 Combat ended");
  }

  /* ────────────────── HP Management ────────────────── */

  /** Apply damage to a combatant. Temp HP absorbed first. */
  applyDamage(combatantId: string, amount: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    let remaining = Math.max(0, amount);

    // Temp HP absorbs first
    if (c.tempHP > 0) {
      if (remaining <= c.tempHP) {
        c.tempHP -= remaining;
        remaining = 0;
      } else {
        remaining -= c.tempHP;
        c.tempHP = 0;
      }
    }

    c.currentHP = Math.max(0, c.currentHP - remaining);
    this.emit();
  }

  /** Heal a combatant (cannot exceed maxHP). */
  applyHealing(combatantId: string, amount: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.currentHP = Math.min(c.maxHP, c.currentHP + Math.max(0, amount));
    this.emit();
  }

  /** Set temp HP (replaces, not stacks — per 5e rules). */
  setTempHP(combatantId: string, amount: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.tempHP = Math.max(0, amount);
    this.emit();
  }

  /** Modify max HP (positive = increase, negative = reduce). */
  modifyMaxHP(combatantId: string, delta: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.maxHP = Math.max(1, c.maxHP + delta);
    c.currentHP = Math.min(c.currentHP, c.maxHP);
    this.emit();
  }

  /** Set current HP directly. */
  setHP(combatantId: string, hp: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.currentHP = Math.max(0, Math.min(c.maxHP, hp));
    this.emit();
  }

  /** Modify AC (e.g. Shield spell: +5). */
  modifyAC(combatantId: string, delta: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.currentAC = Math.max(0, c.currentAC + delta);
    this.emit();
  }

  /* ────────────────── Status Effects ────────────────── */

  addStatus(combatantId: string, status: StatusEffect): void {
    const c = this.findCombatant(combatantId);
    if (!c || !this.state) return;
    // Record the applied round for expiry tracking
    status.appliedRound = status.appliedRound ?? this.state.round;
    c.statuses.push(status);
    this.emit();
  }

  removeStatus(combatantId: string, statusIndex: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.statuses.splice(statusIndex, 1);
    this.emit();
  }

  /* ────────────────── Combatant Management ────────────────── */

  /** Add a combatant mid-combat. */
  addCombatant(combatant: Combatant): void {
    if (!this.state) return;
    this.state.combatants.push(combatant);
    this.sortByInitiative();
    this.emit();
  }

  /** Remove a combatant from combat. */
  removeCombatant(combatantId: string): void {
    if (!this.state) return;
    const idx = this.state.combatants.findIndex(c => c.id === combatantId);
    if (idx < 0) return;

    this.state.combatants.splice(idx, 1);
    // Adjust turn index if needed
    if (this.state.turnIndex >= this.state.combatants.length) {
      this.state.turnIndex = 0;
    } else if (idx < this.state.turnIndex) {
      this.state.turnIndex--;
    }
    this.emit();
  }

  /** Toggle hidden flag. */
  toggleHidden(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.hidden = !c.hidden;
    this.emit();
  }

  /** Update arbitrary combatant fields (display name, modifier, friendly, etc.). */
  updateCombatant(combatantId: string, updates: Partial<Pick<Combatant, "display" | "modifier" | "friendly" | "hidden">>): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    if (updates.display !== undefined) c.display = updates.display;
    if (updates.modifier !== undefined) c.modifier = updates.modifier;
    if (updates.friendly !== undefined) c.friendly = updates.friendly;
    if (updates.hidden !== undefined) c.hidden = updates.hidden;
    this.emit();
  }

  /** Reset all combatants to full HP, clear temp HP and status effects. */
  resetHPAndStatuses(): void {
    if (!this.state) return;
    for (const c of this.state.combatants) {
      c.currentHP = c.maxHP;
      c.tempHP = 0;
      c.currentAC = c.ac;
      c.statuses = [];
    }
    this.emit();
    new Notice("❤️ All HP & statuses reset");
  }

  /** Re-roll initiative for all combatants and re-sort.
   *  PCs are skipped unless the Initiative Tracker's "Roll for Players" setting is enabled. */
  rerollAllInitiative(): void {
    if (!this.state) return;
    const rollPCs = this.rollPlayerInitiatives;
    for (const c of this.state.combatants) {
      if (c.player && !rollPCs) continue;
      c.initiative = this.rollD20() + c.modifier;
    }
    this.sortByInitiative();
    this.state.turnIndex = 0;
    this.emit();
    new Notice("🎲 Initiative re-rolled!");
  }

  /** Toggle sort direction (ascending/descending). */
  sortAscending: boolean = false;

  toggleSortOrder(): void {
    this.sortAscending = !this.sortAscending;
    if (!this.state) return;
    const currentId = this.state.combatants[this.state.turnIndex]?.id;
    if (this.sortAscending) {
      this.state.combatants.sort((a, b) => {
        if (a.initiative !== b.initiative) return a.initiative - b.initiative;
        return a.modifier - b.modifier;
      });
    } else {
      this.state.combatants.sort((a, b) => {
        if (b.initiative !== a.initiative) return b.initiative - a.initiative;
        return b.modifier - a.modifier;
      });
    }
    if (currentId) {
      const newIdx = this.state.combatants.findIndex(c => c.id === currentId);
      if (newIdx >= 0) this.state.turnIndex = newIdx;
    }
    this.emit();
    new Notice(this.sortAscending ? "↑ Sorted ascending" : "↓ Sorted descending");
  }

  /** Toggle a combatant's enabled/disabled state (grayed out, skipped in turn order). */
  toggleEnabled(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    c.enabled = !(c.enabled ?? true);
    this.emit();
  }

  /* ────────────────── Save / Resume ────────────────── */

  /** Persist current combat state to plugin settings. */
  async saveCombat(): Promise<boolean> {
    if (!this.state) {
      new Notice("No active combat to save");
      return false;
    }
    this.state.savedAt = new Date().toISOString();

    if (!this.plugin.settings.combatStates) {
      this.plugin.settings.combatStates = {};
    }
    // Serialize to a clean JSON-safe copy
    this.plugin.settings.combatStates[this.state.encounterName] = JSON.parse(JSON.stringify(this.state));
    await this.plugin.saveSettings();

    const statusCount = this.state.combatants.reduce((n, c) => n + c.statuses.length, 0);
    new Notice(
      `💾 Combat saved! Round ${this.state.round}, ${this.state.combatants.length} combatants ` +
      `(${statusCount} status effect${statusCount !== 1 ? "s" : ""} preserved)`,
    );
    return true;
  }

  /** Resume combat from a saved state. */
  resumeCombat(encounterName: string): boolean {
    const saved = this.plugin.settings.combatStates?.[encounterName] as CombatState | undefined;
    if (!saved) {
      new Notice("No saved combat state found for this encounter");
      return false;
    }
    // Deep-clone so edits don't mutate the stored copy
    this.state = JSON.parse(JSON.stringify(saved));
    this.emit();
    new Notice(`✅ Combat resumed! Round ${saved.round}, ${saved.combatants.length} combatants`);
    return true;
  }

  /** Clear a saved combat state. */
  async clearSavedState(encounterName: string): Promise<void> {
    if (this.plugin.settings.combatStates?.[encounterName]) {
      delete this.plugin.settings.combatStates[encounterName];
      await this.plugin.saveSettings();
      new Notice("🗑️ Saved combat state cleared");
    }
  }

  hasSavedState(encounterName: string): boolean {
    return !!this.plugin.settings.combatStates?.[encounterName];
  }

  getSavedStateInfo(encounterName: string): { round: number; savedAt: string; combatantCount: number } | null {
    const s = this.plugin.settings.combatStates?.[encounterName] as CombatState | undefined;
    if (!s) return null;
    return { round: s.round, savedAt: s.savedAt, combatantCount: s.combatants.length };
  }

  /* ────────────────── Private Helpers ────────────────── */

  private findCombatant(id: string): Combatant | undefined {
    return this.state?.combatants.find(c => c.id === id);
  }

  private sortByInitiative(): void {
    if (!this.state) return;
    // Track who currently has the turn so we can preserve it after sort
    const currentId = this.state.combatants[this.state.turnIndex]?.id;

    this.state.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.modifier - a.modifier; // DEX tiebreaker
    });

    // Restore turnIndex to the same combatant
    if (currentId) {
      const newIdx = this.state.combatants.findIndex(c => c.id === currentId);
      if (newIdx >= 0) this.state.turnIndex = newIdx;
    }
  }

  /** Tick down status durations at end of a combatant's turn. */
  private tickStatuses(turnIndex: number): void {
    if (!this.state) return;
    const c = this.state.combatants[turnIndex];
    if (!c) return;

    c.statuses = c.statuses.filter(s => {
      if (s.duration === undefined) return true; // Indefinite
      s.duration--;
      if (s.duration <= 0) {
        new Notice(`${s.name} expired on ${c.display}`);
        return false;
      }
      return true;
    });
  }

  private rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
  }

  private generateId(): string {
    return "CB_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  /** Read DEX modifier from a creature's vault note frontmatter. */
  private async readDexModifier(filePath: string): Promise<number | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return null;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) return null;

      // PC template uses init_bonus directly
      if (typeof fm.init_bonus === "number") return fm.init_bonus;

      // Creature statblock: stats array [STR, DEX, CON, INT, WIS, CHA]
      if (Array.isArray(fm.stats) && fm.stats.length >= 2) {
        const dex = fm.stats[1];
        if (typeof dex === "number") return Math.floor((dex - 10) / 2);
      }
      return null;
    } catch {
      return null;
    }
  }
}
