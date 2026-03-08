import { App, Notice } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { CombatantSnapshot, CombatState } from "../types";

/**
 * Manages saving and restoring full combat state from the Initiative Tracker.
 *
 * IT's own save only preserves NPC HP/status — players are discarded.
 * This manager snapshots every combatant (including players) so a GM can
 * resume mid-combat exactly where they left off next session.
 */
export class CombatStateManager {
  constructor(private app: App, private plugin: DndCampaignHubPlugin) {}

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /** Capture the live combat state from Initiative Tracker and persist it. */
  async saveCombatState(encounterName: string): Promise<boolean> {
    const it = this.getIT();
    if (!it) {
      new Notice("Initiative Tracker plugin not found");
      return false;
    }

    // Try to read the live tracker state first (most accurate)
    const live = this.readLiveTrackerState(it);

    let state: CombatState;

    if (live && live.combatants.length > 0) {
      state = {
        encounterName,
        savedAt: new Date().toISOString(),
        round: live.round,
        combatants: live.combatants,
        activeIndex: live.combatants.findIndex(c => c.active),
      };
    } else {
      // Fall back to IT's stored encounter data
      const stored = it.data?.encounters?.[encounterName];
      if (!stored?.creatures?.length) {
        new Notice("No active combat found for this encounter. Open the tracker first.");
        return false;
      }
      state = {
        encounterName,
        savedAt: new Date().toISOString(),
        round: stored.round ?? 1,
        combatants: (stored.creatures as any[]).map(c => this.snapshot(c)),
        activeIndex: (stored.creatures as any[]).findIndex((c: any) => c.active),
      };
    }

    if (!this.plugin.settings.combatStates) {
      this.plugin.settings.combatStates = {};
    }
    this.plugin.settings.combatStates[encounterName] = state;
    await this.plugin.saveSettings();

    const statusCount = state.combatants.reduce((n, c) => n + c.status.length, 0);
    console.log(
      `[CombatStateManager] Saved "${encounterName}" — round ${state.round}, ` +
      `${state.combatants.length} combatants, ${statusCount} active statuses. ` +
      `Initiative order: ${state.combatants.map(c => `${c.display || c.name}(${c.initiative})`).join(", ")}`,
    );
    new Notice(
      `💾 Combat saved! Round ${state.round}, ${state.combatants.length} combatants ` +
      `(HP, initiative, and ${statusCount} status effect${statusCount !== 1 ? "s" : ""} preserved)`,
    );
    return true;
  }

  /** Load a saved combat state back into Initiative Tracker. */
  async loadCombatState(encounterName: string): Promise<boolean> {
    const state = this.plugin.settings.combatStates?.[encounterName];
    if (!state) {
      new Notice("No saved combat state found for this encounter");
      return false;
    }

    const it = this.getIT();
    if (!it) {
      new Notice("Initiative Tracker plugin not found");
      return false;
    }

    // Build an encounter object that IT can load
    const encounter = {
      name: encounterName,
      creatures: state.combatants,
      state: true,
      round: state.round,
      rollHP: false,
      logFile: null,
    };

    // Persist to IT's data store so the tracker can find it
    if (!it.data.encounters) it.data.encounters = {};
    it.data.encounters[encounterName] = encounter;
    if (typeof it.saveSettings === "function") {
      await it.saveSettings();
    }

    // Load into the live tracker
    if (it.tracker?.new) {
      it.tracker.new(it, encounter);
      new Notice(
        `✅ Combat resumed! Round ${state.round}, ${state.combatants.length} combatants`,
      );
    } else {
      new Notice("⚠️ Could not open tracker. Open Initiative Tracker manually and load the encounter.");
    }

    // Open IT view
    (this.app as any).commands?.executeCommandById("initiative-tracker:open-tracker");

    return true;
  }

  /** Check whether a saved combat state exists for the given encounter. */
  hasSavedState(encounterName: string): boolean {
    return !!this.plugin.settings.combatStates?.[encounterName];
  }

  /** Return display-friendly metadata about a saved state (or null). */
  getSavedStateInfo(encounterName: string): { round: number; savedAt: string; combatantCount: number } | null {
    const s = this.plugin.settings.combatStates?.[encounterName];
    if (!s) return null;
    return { round: s.round, savedAt: s.savedAt, combatantCount: s.combatants.length };
  }

  /** Remove a saved combat state. */
  async clearCombatState(encounterName: string): Promise<void> {
    if (this.plugin.settings.combatStates?.[encounterName]) {
      delete this.plugin.settings.combatStates[encounterName];
      await this.plugin.saveSettings();
      new Notice("🗑️ Saved combat state cleared");
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                   */
  /* ------------------------------------------------------------------ */

  private getIT(): any | null {
    return (this.app as any).plugins?.plugins?.["initiative-tracker"] ?? null;
  }

  /**
   * Attempt to read the live, in-memory state from the Initiative Tracker view.
   * Tries several access patterns to be resilient across IT versions.
   */
  private readLiveTrackerState(it: any): { combatants: CombatantSnapshot[]; round: number } | null {
    try {
      // Helper: extract creatures array from any object that might hold them
      const extractCreatures = (obj: any): any[] | null => {
        if (!obj) return null;
        for (const key of ["ordered", "creatures", "combatants"]) {
          if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
        }
        return null;
      };

      // Helper: extract round number from any object that might hold it
      const extractRound = (obj: any): number => {
        if (!obj) return 1;
        if (typeof obj.round === "number") return obj.round;
        if (typeof obj.state?.round === "number") return obj.state.round;
        if (typeof obj.data?.round === "number") return obj.data.round;
        return 1;
      };

      // Strategy 1: Read from the open IT tracker view leaf
      const leaves = this.app.workspace.getLeavesOfType("initiative-tracker");
      for (const leaf of leaves) {
        const view = leaf.view as any;
        if (!view) continue;

        // Log top-level keys for debugging
        console.log("[CombatStateManager] IT view keys:", Object.keys(view).filter(k => !k.startsWith("_")));

        // Direct arrays on the view
        const viewCreatures = extractCreatures(view);
        if (viewCreatures) {
          return {
            combatants: viewCreatures.map((c: any) => this.snapshot(c)),
            round: extractRound(view),
          };
        }

        // Nested tracker/store on the view (Svelte component internals)
        for (const prop of ["tracker", "store", "state", "encounter", "combat"]) {
          const nested = view[prop];
          if (!nested) continue;
          const nestedCreatures = extractCreatures(nested);
          if (nestedCreatures) {
            return {
              combatants: nestedCreatures.map((c: any) => this.snapshot(c)),
              round: extractRound(nested) || extractRound(view),
            };
          }
        }

        // Walk one more level: view.tracker.creatures, etc.
        if (view.tracker) {
          for (const prop of ["store", "state", "data"]) {
            const deep = view.tracker[prop];
            const deepCreatures = extractCreatures(deep);
            if (deepCreatures) {
              return {
                combatants: deepCreatures.map((c: any) => this.snapshot(c)),
                round: extractRound(deep) || extractRound(view.tracker) || extractRound(view),
              };
            }
          }
        }
      }

      // Strategy 2: Read from the plugin's tracker object directly
      if (it.tracker) {
        console.log("[CombatStateManager] IT plugin.tracker keys:", Object.keys(it.tracker).filter(k => !k.startsWith("_")));
        const t = it.tracker;
        const trackerCreatures = extractCreatures(t);
        if (trackerCreatures) {
          return {
            combatants: trackerCreatures.map((c: any) => this.snapshot(c)),
            round: extractRound(t),
          };
        }
        // One level deeper
        for (const prop of ["store", "state", "data", "encounter"]) {
          const nested = t[prop];
          const nestedCreatures = extractCreatures(nested);
          if (nestedCreatures) {
            return {
              combatants: nestedCreatures.map((c: any) => this.snapshot(c)),
              round: extractRound(nested) || extractRound(t),
            };
          }
        }
      }

      console.warn("[CombatStateManager] Could not read live tracker state — falling back to stored encounter data");
      return null;
    } catch (e) {
      console.error("[CombatStateManager] Error reading live tracker:", e);
      return null;
    }
  }

  /** Create a clean snapshot of a single combatant from an IT creature object. */
  private snapshot(c: any): CombatantSnapshot {
    // Deep-clone statuses — they may contain nested duration/condition objects
    let statuses: any[] = [];
    if (Array.isArray(c.status) && c.status.length > 0) {
      try {
        statuses = JSON.parse(JSON.stringify(c.status));
      } catch {
        statuses = c.status.map((s: any) => ({ ...s }));
      }
    }

    return {
      name: c.name ?? "",
      display: c.display ?? c.name ?? "",
      id: c.id ?? this.generateId(),
      initiative: typeof c.initiative === "number" ? c.initiative : 0,
      currentHP: typeof c.currentHP === "number" ? c.currentHP
        : typeof c.hp === "number" ? c.hp : 0,
      currentMaxHP: typeof c.currentMaxHP === "number" ? c.currentMaxHP
        : typeof c.maxHP === "number" ? c.maxHP
        : typeof c.max === "number" ? c.max
        : typeof c.hp === "number" ? c.hp : 0,
      tempHP: typeof c.tempHP === "number" ? c.tempHP : 0,
      ac: typeof c.ac === "number" ? c.ac : 10,
      currentAC: typeof c.currentAC === "number" ? c.currentAC
        : typeof c.ac === "number" ? c.ac : 10,
      friendly: c.friendly ?? false,
      hidden: c.hidden ?? false,
      player: c.player ?? false,
      enabled: c.enabled ?? true,
      active: c.active ?? false,
      note: c.note ?? undefined,
      status: statuses,
      marker: c.marker ?? undefined,
      modifier: typeof c.modifier === "number" ? c.modifier : 0,
    };
  }

  private generateId(): string {
    const chars = "0123456789abcdef";
    let id = "ID_";
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}
