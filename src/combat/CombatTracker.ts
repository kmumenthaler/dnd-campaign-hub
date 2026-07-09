import { App, Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { Combatant, CombatState, CombatListener, StatusEffect, DeathSaveState, SyncPreviewEntry, CombatRunActorRef, CombatRunEventType, CombatRunEvent, CombatUndoKind, CombatUndoSummary } from "./types";
import type { EncounterCreature } from "../encounter/EncounterBuilder";

/**
 * Core combat engine. Manages combatants, initiative order, rounds,
 * HP tracking, and status effects. Fully self-contained — no dependency
 * on the Initiative Tracker plugin.
 */
export class CombatTracker {
  private state: CombatState | null = null;
  private listeners = new Set<CombatListener>();
  private undoStack: Array<CombatUndoSummary & { before: CombatState; beforeSortAscending: boolean }> = [];
  private readonly maxUndoEntries = 25;

  constructor(private app: App, public readonly plugin: DndCampaignHubPlugin) {}

  /* ────────────────── Listeners ────────────────── */

  onChange(fn: CombatListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.getState();
    for (const fn of this.listeners) fn(snap);
  }

  private cloneState(state: CombatState): CombatState {
    return JSON.parse(JSON.stringify(state)) as CombatState;
  }

  private createUndo(label: string, kind: CombatUndoKind, detail?: string): (CombatUndoSummary & { before: CombatState; beforeSortAscending: boolean }) | null {
    if (!this.state) return null;
    return {
      id: this.generateId(),
      label,
      detail,
      kind,
      timestamp: new Date().toISOString(),
      before: this.cloneState(this.state),
      beforeSortAscending: this.sortAscending,
    };
  }

  private pushUndo(entry: (CombatUndoSummary & { before: CombatState; beforeSortAscending: boolean }) | null) {
    if (!entry) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxUndoEntries) {
      this.undoStack.splice(0, this.undoStack.length - this.maxUndoEntries);
    }
  }

  private clearUndoHistory() {
    this.undoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0 && !!this.state;
  }

  getRecentActions(limit = 5): CombatUndoSummary[] {
    return this.undoStack
      .slice(-limit)
      .reverse()
      .map(({ before: _before, beforeSortAscending: _beforeSortAscending, ...summary }) => ({ ...summary }));
  }

  undoLastAction(): boolean {
    if (!this.state || this.undoStack.length === 0) {
      new Notice("Nothing to undo");
      return false;
    }

    const entry = this.undoStack.pop()!;
    this.state = this.cloneState(entry.before);
    this.sortAscending = entry.beforeSortAscending;
    this.emit();
    new Notice(`Undid: ${entry.label}`);
    return true;
  }

  private turnContextDetail(): string {
    if (!this.state?.started) return "Pre-combat";
    const current = this.state.combatants[this.state.turnIndex];
    return `Round ${this.state.round}${current ? `, ${current.display}'s turn` : ""}`;
  }

  /* ────────────────── State Accessors ────────────────── */

  getState(): CombatState | null {
    return this.state ? { ...this.state, combatants: this.state.combatants.map(c => ({ ...c, statuses: [...c.statuses], deathSaves: c.deathSaves ? { ...c.deathSaves } : undefined })) } : null;
  }

  isActive(): boolean {
    return this.state !== null;
  }

  getCurrentCombatant(): Combatant | null {
    if (!this.state || !this.state.started) return null;
    return this.state.combatants[this.state.turnIndex] ?? null;
  }

  isDefeatedHostile(c: Combatant | null | undefined): boolean {
    if (!c) return false;
    if (c.player || c.friendly) return false;
    return !!c.dead || c.currentHP <= 0;
  }

  isTurnEligible(c: Combatant | null | undefined): boolean {
    return !!c && (c.enabled ?? true) && !this.isDefeatedHostile(c);
  }

  private actorRef(c: Combatant | null | undefined): CombatRunActorRef | undefined {
    if (!c) return undefined;
    return {
      id: c.id,
      name: c.name,
      display: c.display,
      player: c.player,
      friendly: c.friendly,
      notePath: c.notePath,
      tokenId: c.tokenId,
    };
  }

  private getActiveCombatantRef(): CombatRunActorRef | undefined {
    if (!this.state?.started) return undefined;
    return this.actorRef(this.state.combatants[this.state.turnIndex]);
  }

  private ensureRunStats() {
    if (!this.state) return null;
    if (!this.state.runStats) {
      this.state.runStats = {
        startedAt: new Date().toISOString(),
        events: [],
      };
    }
    return this.state.runStats;
  }

  private recordRunEvent(type: CombatRunEventType, data: {
    source?: CombatRunActorRef;
    target?: CombatRunActorRef;
    amount?: number;
    note?: string;
  } = {}) {
    const stats = this.ensureRunStats();
    if (!this.state || !stats) return;
    stats.events.push({
      id: this.generateId(),
      type,
      timestamp: new Date().toISOString(),
      round: this.state.round,
      turnCombatantId: this.state.started ? this.state.combatants[this.state.turnIndex]?.id : undefined,
      ...data,
    });
  }

  getDefaultEventSourceId(): string | null {
    return this.getActiveCombatantRef()?.id || null;
  }

  getCombatantPortraitResourcePath(actor: Pick<Combatant, "name" | "tokenId" | "notePath"> | CombatRunActorRef | null | undefined): string | null {
    if (!actor) return null;
    let imageFile: string | undefined;

    if (actor.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(actor.tokenId);
      if (marker?.imageFile) imageFile = marker.imageFile;
    }

    if (!imageFile && actor.notePath) {
      const file = this.app.vault.getAbstractFileByPath(actor.notePath);
      if (file instanceof TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const noteTokenId = cache?.frontmatter?.token_id;
        if (noteTokenId) {
          const marker = this.plugin.markerLibrary.getMarker(noteTokenId);
          if (marker?.imageFile) imageFile = marker.imageFile;
        }
      }
    }

    if (!imageFile && actor.name) {
      const match = this.plugin.markerLibrary.findMarkersByName(actor.name).find((m) => m.imageFile);
      if (match?.imageFile) imageFile = match.imageFile;
    }

    return imageFile ? this.app.vault.adapter.getResourcePath(imageFile) : null;
  }

  summarizeCombatRun(state: CombatState | null = this.state) {
    const events = state?.runStats?.events || [];
    const add = (map: Map<string, { actor: CombatRunActorRef; value: number }>, actor: CombatRunActorRef | undefined, amount = 1) => {
      if (!actor || !actor.player) return;
      const current = map.get(actor.id) || { actor, value: 0 };
      current.value += amount;
      map.set(actor.id, current);
    };
    const damageDealt = new Map<string, { actor: CombatRunActorRef; value: number }>();
    const damageTaken = new Map<string, { actor: CombatRunActorRef; value: number }>();
    const healingDone = new Map<string, { actor: CombatRunActorRef; value: number }>();
    const enemiesDefeated = new Map<string, { actor: CombatRunActorRef; value: number }>();

    events.forEach((event) => {
      if (event.type === "damage") {
        add(damageDealt, event.source, event.amount || 0);
        add(damageTaken, event.target, event.amount || 0);
      } else if (event.type === "healing") {
        add(healingDone, event.source, event.amount || 0);
      } else if (event.type === "defeated") {
        add(enemiesDefeated, event.source, 1);
      }
    });

    const rank = (map: Map<string, { actor: CombatRunActorRef; value: number }>) =>
      Array.from(map.values()).filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);
    const ranked = {
      damageDealt: rank(damageDealt),
      damageTaken: rank(damageTaken),
      healingDone: rank(healingDone),
      enemiesDefeated: rank(enemiesDefeated),
    };
    const mvpScores = new Map<string, { actor: CombatRunActorRef; score: number; reasons: string[] }>();
    const addMvpPoints = (entries: Array<{ actor: CombatRunActorRef; value: number }>, label: string) => {
      entries.slice(0, 3).forEach((entry, index) => {
        const points = [5, 3, 1][index] ?? 0;
        if (points <= 0) return;
        const current = mvpScores.get(entry.actor.id) || { actor: entry.actor, score: 0, reasons: [] };
        current.score += points;
        current.reasons.push(`#${index + 1} ${label}`);
        mvpScores.set(entry.actor.id, current);
      });
    };
    addMvpPoints(ranked.enemiesDefeated, "enemy defeats");
    addMvpPoints(ranked.damageDealt, "damage dealt");
    addMvpPoints(ranked.damageTaken, "damage taken");
    addMvpPoints(ranked.healingDone, "healing");
    const mvp = Array.from(mvpScores.values()).sort((a, b) => b.score - a.score)[0] || null;

    return {
      ...ranked,
      mvp,
      eventCount: events.length,
    };
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Encounter";
  }

  private async ensureFolder(path: string): Promise<TFolder | null> {
    const normalized = path.split("/").map((part) => part.trim()).filter(Boolean).join("/");
    if (!normalized) return null;
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFolder) return existing;

    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(current);
      if (!folder) {
        await this.app.vault.createFolder(current);
      }
    }
    const created = this.app.vault.getAbstractFileByPath(normalized);
    return created instanceof TFolder ? created : null;
  }

  private formatLeaderboard(entries: Array<{ actor: CombatRunActorRef; value: number }>, unit: string): string {
    if (entries.length === 0) return "_No entries._";
    return [
      "| Rank | Character | Score |",
      "|---:|---|---:|",
      ...entries.map((entry, index) => `| ${index + 1} | ${entry.actor.display} | ${entry.value} ${unit} |`),
    ].join("\n");
  }

  private formatTimelineEvent(event: CombatRunEvent): string {
    const source = event.source?.display || "Environment";
    const target = event.target?.display || "";
    if (event.type === "damage") return `- Round ${event.round}: ${source} dealt ${event.amount || 0} damage to ${target}.`;
    if (event.type === "healing") return `- Round ${event.round}: ${source} healed ${target} for ${event.amount || 0}.`;
    if (event.type === "defeated") return `- Round ${event.round}: ${source} defeated ${target}.`;
    if (event.type === "turn-start") return `- Round ${event.round}: ${target}'s turn started.`;
    if (event.type === "combat-start") return `- Combat started: ${event.note || ""}`;
    if (event.type === "combat-end") return `- Combat ended: ${event.note || ""}`;
    return `- Round ${event.round}: ${event.type}`;
  }

  async writeEncounterLog(state: CombatState | null = this.state): Promise<TFile | null> {
    if (!state) return null;
    const folderPath = this.plugin.settings.combatEncounterLogFolder || "z_ITEncounterLog";
    const folder = await this.ensureFolder(folderPath);
    if (!folder) {
      new Notice("Could not create encounter log folder.");
      return null;
    }

    const summary = this.summarizeCombatRun(state);
    const startedAt = state.runStats?.startedAt || state.savedAt;
    const endedAt = state.runStats?.endedAt || new Date().toISOString();
    const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")} ${this.sanitizeFileName(state.encounterName)}.md`;
    const path = `${folder.path}/${fileName}`;
    const lines = [
      "---",
      "type: initiative-encounter-log",
      `encounter: ${JSON.stringify(state.encounterName)}`,
      `started: ${JSON.stringify(startedAt)}`,
      `ended: ${JSON.stringify(endedAt)}`,
      `rounds: ${state.round}`,
      "---",
      "",
      `# ${state.encounterName} - Encounter Log`,
      "",
      "```dnd-hub",
      "```",
      "",
      `- Started: ${startedAt}`,
      `- Ended: ${endedAt}`,
      `- Rounds: ${state.round}`,
      `- Participants: ${state.combatants.length}`,
      "",
      "## Awards",
      "",
      "### MVP",
      summary.mvp ? `${summary.mvp.actor.display} (${summary.mvp.reasons.join(", ")})` : "_No MVP awarded._",
      "",
      "### Most Enemies Defeated",
      this.formatLeaderboard(summary.enemiesDefeated, "defeated"),
      "",
      "### Most Damage Dealt",
      this.formatLeaderboard(summary.damageDealt, "damage"),
      "",
      "### Most Damage Taken",
      this.formatLeaderboard(summary.damageTaken, "damage"),
      "",
      "### Best Healer",
      this.formatLeaderboard(summary.healingDone, "healing"),
      "",
      "## Final State",
      "",
      "| Participant | HP | AC | Status |",
      "|---|---:|---:|---|",
      ...state.combatants.map((c) => `| ${c.display} | ${c.currentHP}/${c.maxHP}${c.tempHP > 0 ? ` (+${c.tempHP})` : ""} | ${c.currentAC} | ${c.statuses.map((s) => s.name).join(", ") || "-"} |`),
      "",
      "## Timeline",
      "",
      ...(state.runStats?.events || []).map((event) => this.formatTimelineEvent(event)),
      "",
      "<!-- dnd-combat-awards-state",
      JSON.stringify(state, null, 2),
      "-->",
      "",
    ];

    return await this.app.vault.create(path, lines.join("\n"));
  }

  async readEncounterLogState(file: TFile): Promise<CombatState | null> {
    const content = await this.app.vault.read(file);
    const match =
      content.match(/<!--\s*dnd-combat-awards-state\s*([\s\S]*?)-->/) ||
      content.match(/```dnd-combat-awards-state\s*([\s\S]*?)```/);
    if (!match?.[1]) return null;

    try {
      const parsed = JSON.parse(match[1].trim()) as CombatState;
      if (!parsed || typeof parsed.encounterName !== "string" || !Array.isArray(parsed.combatants)) {
        return null;
      }
      return parsed;
    } catch (error) {
      console.error("[CombatTracker] Failed to parse encounter awards state:", error);
      return null;
    }
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
    partyMembers: Array<{ name: string; level: number; hp: number; maxHp?: number; ac: number; notePath?: string; tokenId?: string; initBonus?: number; thp?: number }>,
    useColorNames: boolean,
    encounterPath?: string,
  ): Promise<void> {
    this.clearUndoHistory();
    this.sortAscending = false;
    const combatants: Combatant[] = [];

    // ── Party members ──
    for (const pm of partyMembers) {
      const maxHP = pm.maxHp ?? pm.hp;
      combatants.push({
        id: this.generateId(),
        name: pm.name,
        display: pm.name,
        initiative: 0,
        modifier: pm.initBonus ?? 0,
        currentHP: pm.hp,
        maxHP,
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

    combatants.push(...await this.buildCreatureCombatants(creatures, useColorNames, false));

    this.state = {
      encounterName,
      encounterPath,
      combatants,
      round: 0,
      turnIndex: 0,
      started: false,
      savedAt: new Date().toISOString(),
      runStats: {
        startedAt: new Date().toISOString(),
        events: [],
      },
    };
    this.recordRunEvent("combat-start", { note: encounterName });

    this.emit();
    new Notice(`⚔️ Combat ready: ${combatants.length} combatants. Roll initiative!`);
  }

  async addCreaturesFromEncounter(
    encounterName: string,
    creatures: EncounterCreature[],
    useColorNames: boolean,
  ): Promise<number> {
    if (!this.state) {
      new Notice("No active encounter in the tracker");
      return 0;
    }

    const additions = await this.buildCreatureCombatants(creatures, useColorNames, this.state.started);
    if (additions.length === 0) return 0;

    const undo = this.createUndo(`Added ${additions.length} participant${additions.length !== 1 ? "s" : ""}`, "combatant", this.turnContextDetail());
    this.state.combatants.push(...additions);
    this.sortByInitiative();
    this.pushUndo(undo);
    this.emit();
    new Notice(`Added ${additions.length} participant${additions.length !== 1 ? "s" : ""} from "${encounterName}"`);
    return additions.length;
  }

  private async buildCreatureCombatants(
    creatures: EncounterCreature[],
    useColorNames: boolean,
    rollInitiative: boolean,
  ): Promise<Combatant[]> {
    const combatants: Combatant[] = [];
    const colors = [
      "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
      "Pink", "Brown", "Black", "White", "Gray", "Cyan",
      "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold",
      "Silver", "Bronze",
    ];

    for (const ec of creatures) {
      if (ec.isTrap) {
        const trapCombatants = await this.createTrapCombatants(ec);
        combatants.push(...trapCombatants);
        continue;
      }

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
          initiative: rollInitiative ? this.rollD20() + modifier : 0,
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

    return combatants;
  }

  /** Check whether the Party Manager is configured to auto-roll initiative for PCs.
   *  Stored as 0 = don't roll, 1 = roll, 2 = let players roll. */
  private get rollPlayerInitiatives(): boolean {
    return this.plugin.partyManager.rollPlayerInitiatives === 1;
  }

  /** Roll initiative for all combatants and sort.
   *  PCs are skipped unless the Initiative Tracker's "Roll for Players" setting is enabled. */
  rollAllInitiative(): void {
    if (!this.state) return;
    const undo = this.createUndo("Rolled initiative", "initiative", "Combat start");
    const rollPCs = this.rollPlayerInitiatives;

    for (const c of this.state.combatants) {
      if (c.fixedInitiative) continue;
      if (c.player && !rollPCs) continue;
      c.initiative = this.rollD20() + c.modifier;
    }

    this.sortByInitiative();
    this.state.round = 1;
    this.state.turnIndex = 0;
    this.state.started = true;

    // Mark first combatant as active turn
    this.pushUndo(undo);
    this.emit();
    const pcNote = rollPCs ? "" : " (enter PC initiatives manually)";
    new Notice(`🎲 Initiative rolled! Round 1 — ${this.state.combatants[0]?.display}'s turn${pcNote}`);
  }

  /** Set initiative manually for a single combatant. */
  setInitiative(combatantId: string, value: number): void {
    const c = this.findCombatant(combatantId);
    if (!c || !this.state) return;
    const undo = this.createUndo(`Set initiative for ${c.display}`, "initiative", `${c.initiative} -> ${value}`);
    c.initiative = value;
    this.sortByInitiative();
    this.pushUndo(undo);
    this.emit();
  }

  /** Roll initiative for a single combatant (e.g. if they join mid-combat). */
  rollInitiativeFor(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c || !this.state) return;
    const undo = this.createUndo(`Rolled initiative for ${c.display}`, "initiative", this.turnContextDetail());
    c.initiative = this.rollD20() + c.modifier;
    this.sortByInitiative();
    this.pushUndo(undo);
    this.emit();
  }

  /** Advance to the next combatant's turn. */
  nextTurn(): void {
    if (!this.state || !this.state.started) return;
    const previous = this.state.combatants[this.state.turnIndex];
    const undo = this.createUndo("Advanced turn", "turn", this.turnContextDetail());

    // Tick down status durations on the combatant whose turn is ending
    this.tickStatuses(this.state.turnIndex);

    // Find next turn-eligible combatant. Defeated hostiles stay in the
    // encounter data, but do not consume turns.
    const len = this.state.combatants.length;
    let next = this.state.turnIndex;
    let nextRound = this.state.round;
    let foundEligible = false;
    for (let i = 0; i < len; i++) {
      next++;
      if (next >= len) {
        next = 0;
        nextRound++;
      }
      const c = this.state.combatants[next];
      if (this.isTurnEligible(c)) {
        foundEligible = true;
        break;
      }
    }
    if (!foundEligible) {
      if (undo) {
        undo.label = "Advanced turn: no active combatants";
        this.pushUndo(undo);
      }
      this.emit();
      new Notice("No active combatants left to advance to.");
      return;
    }
    this.state.turnIndex = next;
    this.state.round = nextRound;

    const current = this.state.combatants[this.state.turnIndex];
    if (previous && current) {
      undo!.label = `Advanced turn: ${previous.display} -> ${current.display}`;
      undo!.detail = `Round ${this.state.round}`;
    }
    if (current) {
      this.recordRunEvent("turn-start", { target: this.actorRef(current) });
    }
    this.pushUndo(undo);
    this.emit();
    if (current) {
      new Notice(`⏩ Round ${this.state.round} — ${current.display}'s turn`);
    }
  }

  /** Go back to the previous combatant's turn. */
  prevTurn(): void {
    if (!this.state || !this.state.started) return;
    const previous = this.state.combatants[this.state.turnIndex];
    const undo = this.createUndo("Moved to previous turn", "turn", this.turnContextDetail());

    const len = this.state.combatants.length;
    let prev = this.state.turnIndex;
    let prevRound = this.state.round;
    let foundEligible = false;
    for (let i = 0; i < len; i++) {
      prev--;
      if (prev < 0) {
        prev = len - 1;
        prevRound = Math.max(1, prevRound - 1);
      }
      const c = this.state.combatants[prev];
      if (this.isTurnEligible(c)) {
        foundEligible = true;
        break;
      }
    }
    if (foundEligible) {
      this.state.turnIndex = prev;
      this.state.round = prevRound;
    }

    const current = this.state.combatants[this.state.turnIndex];
    if (foundEligible && previous && current) {
      undo!.label = `Previous turn: ${previous.display} -> ${current.display}`;
      undo!.detail = `Round ${this.state.round}`;
      this.pushUndo(undo);
    }
    this.emit();
  }

  /** End combat entirely. */
  endCombat(): void {
    if (this.state) {
      const stats = this.ensureRunStats();
      if (stats) stats.endedAt = new Date().toISOString();
      this.recordRunEvent("combat-end", { note: this.state.encounterName });
    }
    this.state = null;
    this.clearUndoHistory();
    this.sortAscending = false;
    this.emit();
    new Notice("🏁 Combat ended");
  }

  /* ────────────────── HP Management ────────────────── */

  /** Apply damage to a combatant. Temp HP absorbed first.
   *  Implements D&D 5e instant death and death save rules:
   *  - Overflow damage >= maxHP at 0 HP → instant death
   *  - Damage at 0 HP → 1 failed death save (2 if critical hit)
   *  - 3 failed death saves → dead */
  applyDamage(combatantId: string, amount: number, isCritical = false, sourceCombatantId?: string | null): void {
    const c = this.findCombatant(combatantId);
    if (!c || c.dead) return;
    const source = sourceCombatantId ? this.findCombatant(sourceCombatantId) : (this.state?.combatants[this.state.turnIndex] || null);
    const undo = this.createUndo(
      `${source?.display || "Environment"} dealt ${Math.max(0, amount)} damage to ${c.display}`,
      "hp",
      this.turnContextDetail(),
    );
    let remaining = Math.max(0, amount);
    const hpBeforeDamage = c.currentHP;

    const wasAtZero = c.currentHP <= 0;

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

    if (wasAtZero && remaining > 0) {
      // ── Already at 0 HP ──
      if (remaining >= c.maxHP) {
        // Massive damage → instant death
        this.killCombatant(c);
      } else if (c.player) {
        // PCs: add failed death saves
        if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0 };
        c.deathSaves.failures += isCritical ? 2 : 1;
        if (c.deathSaves.failures >= 3) {
          this.killCombatant(c);
        }
      }
      // Non-PCs at 0 HP are already dead — no further action
    } else {
      // ── Normal damage: reduce HP, check for 0 ──
      const hpBefore = c.currentHP;
      c.currentHP = Math.max(0, c.currentHP - remaining);

      if (c.currentHP <= 0 && hpBefore > 0) {
        const overflow = remaining - hpBefore;
        if (overflow >= c.maxHP) {
          // Massive damage → instant death
          this.killCombatant(c);
        } else if (c.player) {
          // PCs fall unconscious and start death saves
          c.deathSaves = { successes: 0, failures: 0 };
          this.syncUnconsciousStatus(c);
        } else {
          // Non-PCs fall unconscious at 0 HP (no death saves)
          this.syncUnconsciousStatus(c);
        }
      }
    }

    this.recordRunEvent("damage", {
      source: this.actorRef(source),
      target: this.actorRef(c),
      amount,
      note: isCritical ? "critical" : undefined,
    });
    if (!c.player && !c.friendly && hpBeforeDamage > 0 && c.currentHP <= 0) {
      this.recordRunEvent("defeated", {
        source: this.actorRef(source),
        target: this.actorRef(c),
      });
    }
    this.pushUndo(undo);
    this.emit();
  }

  /** Heal a combatant (cannot exceed maxHP).
   *  Healing a creature at 0 HP clears death saves and removes Unconscious. */
  applyHealing(combatantId: string, amount: number, sourceCombatantId?: string | null): void {
    const c = this.findCombatant(combatantId);
    if (!c || c.dead) return;
    const source = sourceCombatantId ? this.findCombatant(sourceCombatantId) : (this.state?.combatants[this.state.turnIndex] || null);
    const undo = this.createUndo(
      `${source?.display || "Environment"} healed ${c.display} for ${Math.max(0, amount)}`,
      "hp",
      this.turnContextDetail(),
    );
    const wasAtZero = c.currentHP <= 0;
    const before = c.currentHP;
    c.currentHP = Math.min(c.maxHP, c.currentHP + Math.max(0, amount));
    if (wasAtZero && c.currentHP > 0) {
      c.deathSaves = undefined;
    }
    this.syncUnconsciousStatus(c);
    this.recordRunEvent("healing", {
      source: this.actorRef(source),
      target: this.actorRef(c),
      amount: Math.max(0, c.currentHP - before),
    });
    this.pushUndo(undo);
    this.emit();
  }

  /** Set temp HP (replaces, not stacks — per 5e rules). */
  setTempHP(combatantId: string, amount: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    const next = Math.max(0, amount);
    if (c.tempHP === next) return;
    const undo = this.createUndo(`Set temp HP for ${c.display}`, "hp", `${c.tempHP} -> ${next}`);
    c.tempHP = next;
    this.pushUndo(undo);
    this.emit();
  }

  /** Modify max HP (positive = increase, negative = reduce). */
  modifyMaxHP(combatantId: string, delta: number): void {
    const c = this.findCombatant(combatantId);
    if (!c || delta === 0) return;
    const next = Math.max(1, c.maxHP + delta);
    if (c.maxHP === next) return;
    const undo = this.createUndo(`Changed max HP for ${c.display}`, "hp", `${c.maxHP} -> ${next}`);
    c.maxHP = Math.max(1, c.maxHP + delta);
    c.currentHP = Math.min(c.currentHP, c.maxHP);
    this.pushUndo(undo);
    this.emit();
  }

  /** Set current HP directly. */
  setHP(combatantId: string, hp: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    const next = Math.max(0, Math.min(c.maxHP, hp));
    const hasRecoveryState = c.dead || !!c.deathSaves || c.statuses.some(s => s.name === "Dead" || s.name === "Unconscious");
    if (c.currentHP === next && !hasRecoveryState) return;
    const undo = this.createUndo(`Set HP for ${c.display}`, "hp", `${c.currentHP} -> ${next}`);
    const wasAtZero = c.currentHP <= 0;
    c.currentHP = next;
    if (wasAtZero && c.currentHP > 0) {
      c.deathSaves = undefined;
      c.dead = false;
      // Remove "Dead" status if manually revived
      const deadIdx = c.statuses.findIndex(s => s.name === "Dead");
      if (deadIdx !== -1) c.statuses.splice(deadIdx, 1);
    }
    this.syncUnconsciousStatus(c);
    this.pushUndo(undo);
    this.emit();
  }

  /** Modify AC (e.g. Shield spell: +5). */
  modifyAC(combatantId: string, delta: number): void {
    const c = this.findCombatant(combatantId);
    if (!c || delta === 0) return;
    const next = Math.max(0, c.currentAC + delta);
    if (c.currentAC === next) return;
    const undo = this.createUndo(`Changed AC for ${c.display}`, "state", `${c.currentAC} -> ${next}`);
    c.currentAC = Math.max(0, c.currentAC + delta);
    this.pushUndo(undo);
    this.emit();
  }

  /* ────────────────── Auto-Condition Sync ────────────────── */

  /** Add Unconscious when HP drops to 0; remove it when HP rises above 0. */
  private syncUnconsciousStatus(c: Combatant): void {
    const label = "Unconscious";
    const idx = c.statuses.findIndex(s => s.name === label);
    if (c.currentHP <= 0 && !c.dead && idx === -1) {
      c.statuses.push({ name: label });
    } else if ((c.currentHP > 0 || c.dead) && idx !== -1) {
      c.statuses.splice(idx, 1);
    }
  }

  /* ────────────────── Death Saving Throws ────────────────── */

  /** Mark a combatant as dead — clears death saves, replaces Unconscious with Dead. */
  private killCombatant(c: Combatant): void {
    c.currentHP = 0;
    c.dead = true;
    c.deathSaves = undefined;
    // Replace Unconscious with Dead
    c.statuses = c.statuses.filter(s => s.name !== "Unconscious");
    if (!c.statuses.some(s => s.name === "Dead")) {
      c.statuses.push({ name: "Dead" });
    }
    new Notice(`☠️ ${c.display} has died!`);
  }

  /** Add a death save success. Natural 20 = regain 1 HP (auto-handled by caller). */
  addDeathSaveSuccess(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c || c.dead || c.currentHP > 0) return;
    const undo = this.createUndo(`Added death save success for ${c.display}`, "hp", this.turnContextDetail());
    if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0 };
    c.deathSaves.successes++;
    if (c.deathSaves.successes >= 3) {
      // Stabilized — remove Unconscious, zero out saves, add Stable
      c.deathSaves = undefined;
      c.statuses = c.statuses.filter(s => s.name !== "Unconscious");
      if (!c.statuses.some(s => s.name === "Stable")) {
        c.statuses.push({ name: "Stable" });
      }
      new Notice(`💤 ${c.display} is stabilized!`);
    }
    this.pushUndo(undo);
    this.emit();
  }

  /** Add a death save failure. */
  addDeathSaveFailure(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c || c.dead || c.currentHP > 0) return;
    const undo = this.createUndo(`Added death save failure for ${c.display}`, "hp", this.turnContextDetail());
    if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0 };
    c.deathSaves.failures++;
    if (c.deathSaves.failures >= 3) {
      this.killCombatant(c);
    }
    this.pushUndo(undo);
    this.emit();
  }

  /**
   * Roll a death saving throw (d20). Applies 5e rules:
   * - Natural 1: 2 failures
   * - Natural 20: regain 1 HP (clears death saves, removes Unconscious)
   * - 10+: 1 success
   * - <10: 1 failure
   * Returns the die result for UI display.
   */
  rollDeathSave(combatantId: string): number | null {
    const c = this.findCombatant(combatantId);
    if (!c || c.dead || c.currentHP > 0) return null;
    const undo = this.createUndo(`Rolled death save for ${c.display}`, "hp", this.turnContextDetail());
    if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0 };

    const roll = this.rollD20();
    if (undo) undo.label = `Rolled death save for ${c.display}: ${roll}`;

    if (roll === 1) {
      // Natural 1: two failures
      c.deathSaves.failures += 2;
      new Notice(`🎲 ${c.display} death save: ☠️ Natural 1! (2 failures)`);
    } else if (roll === 20) {
      // Natural 20: regain 1 HP
      c.currentHP = 1;
      c.deathSaves = undefined;
      c.statuses = c.statuses.filter(s => s.name !== "Unconscious" && s.name !== "Stable");
      new Notice(`🎲 ${c.display} death save: ✨ Natural 20! Regains 1 HP!`);
      this.pushUndo(undo);
      this.emit();
      return roll;
    } else if (roll >= 10) {
      c.deathSaves.successes++;
      new Notice(`🎲 ${c.display} death save: ✅ ${roll} (success)`);
    } else {
      c.deathSaves.failures++;
      new Notice(`🎲 ${c.display} death save: ❌ ${roll} (failure)`);
    }

    // Check thresholds
    if (c.deathSaves && c.deathSaves.failures >= 3) {
      this.killCombatant(c);
    } else if (c.deathSaves && c.deathSaves.successes >= 3) {
      c.deathSaves = undefined;
      c.statuses = c.statuses.filter(s => s.name !== "Unconscious");
      if (!c.statuses.some(s => s.name === "Stable")) {
        c.statuses.push({ name: "Stable" });
      }
      new Notice(`💤 ${c.display} is stabilized!`);
    }

    this.pushUndo(undo);
    this.emit();
    return roll;
  }

  /** Get the death save state for a combatant (null if not making death saves). */
  getDeathSaves(combatantId: string): DeathSaveState | null {
    const c = this.findCombatant(combatantId);
    if (!c || !c.deathSaves) return null;
    return { ...c.deathSaves };
  }

  /* ────────────────── Status Effects ────────────────── */

  addStatus(combatantId: string, status: StatusEffect): void {
    const c = this.findCombatant(combatantId);
    if (!c || !this.state) return;
    const undo = this.createUndo(`Added ${status.name} to ${c.display}`, "status", this.turnContextDetail());
    // Record the applied round for expiry tracking
    status.appliedRound = status.appliedRound ?? this.state.round;
    c.statuses.push(status);
    this.pushUndo(undo);
    this.emit();
  }

  removeStatus(combatantId: string, statusIndex: number): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    const status = c.statuses[statusIndex];
    if (!status) return;
    const undo = this.createUndo(`Removed ${status.name} from ${c.display}`, "status", this.turnContextDetail());
    c.statuses.splice(statusIndex, 1);
    this.pushUndo(undo);
    this.emit();
  }

  /* ────────────────── Combatant Management ────────────────── */

  /** Add a combatant mid-combat. */
  addCombatant(combatant: Combatant): void {
    if (!this.state) return;
    const undo = this.createUndo(`Added ${combatant.display}`, "combatant", this.turnContextDetail());
    this.state.combatants.push(combatant);
    this.sortByInitiative();
    this.pushUndo(undo);
    this.emit();
  }

  /** Remove a combatant from combat. */
  removeCombatant(combatantId: string): void {
    if (!this.state) return;
    const idx = this.state.combatants.findIndex(c => c.id === combatantId);
    if (idx < 0) return;

    const removed = this.state.combatants[idx]!;
    const undo = this.createUndo(`Removed ${removed.display}`, "combatant", this.turnContextDetail());
    this.state.combatants.splice(idx, 1);
    // Adjust turn index if needed
    if (this.state.turnIndex >= this.state.combatants.length) {
      this.state.turnIndex = 0;
    } else if (idx < this.state.turnIndex) {
      this.state.turnIndex--;
    }
    this.pushUndo(undo);
    this.emit();
  }

  /** Toggle hidden flag. */
  toggleHidden(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    const undo = this.createUndo(`${c.hidden ? "Showed" : "Hid"} ${c.display}`, "state", this.turnContextDetail());
    c.hidden = !c.hidden;
    this.pushUndo(undo);
    this.emit();
  }

  /** Update arbitrary combatant fields (display name, modifier, friendly, etc.). */
  updateCombatant(combatantId: string, updates: Partial<Pick<Combatant, "display" | "modifier" | "friendly" | "hidden">>): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    const changes: string[] = [];
    if (updates.display !== undefined && updates.display !== c.display) changes.push("name");
    if (updates.modifier !== undefined && updates.modifier !== c.modifier) changes.push("initiative modifier");
    if (updates.friendly !== undefined && updates.friendly !== c.friendly) changes.push("allegiance");
    if (updates.hidden !== undefined && updates.hidden !== c.hidden) changes.push("visibility");
    if (changes.length === 0) return;
    const undo = this.createUndo(`Updated ${c.display}`, "state", changes.join(", "));
    if (updates.display !== undefined) c.display = updates.display;
    if (updates.modifier !== undefined) c.modifier = updates.modifier;
    if (updates.friendly !== undefined) c.friendly = updates.friendly;
    if (updates.hidden !== undefined) c.hidden = updates.hidden;
    this.pushUndo(undo);
    this.emit();
  }

  /** Reset all combatants to full HP, clear temp HP, statuses, death saves, and dead flag. */
  resetHPAndStatuses(): void {
    if (!this.state) return;
    const undo = this.createUndo("Reset HP & statuses", "state", this.turnContextDetail());
    for (const c of this.state.combatants) {
      c.currentHP = c.maxHP;
      c.tempHP = 0;
      c.currentAC = c.ac;
      c.statuses = [];
      c.deathSaves = undefined;
      c.dead = false;
    }
    this.pushUndo(undo);
    this.emit();
    new Notice("❤️ All HP & statuses reset");
  }

  /** Re-roll initiative for all combatants and re-sort.
   *  PCs are skipped unless the Initiative Tracker's "Roll for Players" setting is enabled. */
  rerollAllInitiative(): void {
    if (!this.state) return;
    const undo = this.createUndo("Re-rolled initiative", "initiative", this.turnContextDetail());
    const rollPCs = this.rollPlayerInitiatives;
    for (const c of this.state.combatants) {
      if (c.fixedInitiative) continue;
      if (c.player && !rollPCs) continue;
      c.initiative = this.rollD20() + c.modifier;
    }
    this.sortByInitiative();
    this.state.turnIndex = 0;
    this.pushUndo(undo);
    this.emit();
    new Notice("🎲 Initiative re-rolled!");
  }

  /** Toggle sort direction (ascending/descending). */
  sortAscending: boolean = false;

  toggleSortOrder(): void {
    if (!this.state) return;
    const undo = this.createUndo(this.sortAscending ? "Sorted descending" : "Sorted ascending", "initiative", this.turnContextDetail());
    this.sortAscending = !this.sortAscending;
    const currentId = this.state.combatants[this.state.turnIndex]?.id;
    if (this.sortAscending) {
      this.state.combatants.sort((a, b) => {
        if (a.initiative !== b.initiative) return a.initiative - b.initiative;
        if (a.initiativeTieOrder !== undefined && b.initiativeTieOrder !== undefined) {
          return a.initiativeTieOrder - b.initiativeTieOrder;
        }
        return a.modifier - b.modifier;
      });
    } else {
      this.state.combatants.sort((a, b) => {
        if (b.initiative !== a.initiative) return b.initiative - a.initiative;
        if (a.initiativeTieOrder !== undefined && b.initiativeTieOrder !== undefined) {
          return a.initiativeTieOrder - b.initiativeTieOrder;
        }
        return b.modifier - a.modifier;
      });
    }
    if (currentId) {
      const newIdx = this.state.combatants.findIndex(c => c.id === currentId);
      if (newIdx >= 0) this.state.turnIndex = newIdx;
    }
    this.pushUndo(undo);
    this.emit();
    new Notice(this.sortAscending ? "↑ Sorted ascending" : "↓ Sorted descending");
  }

  /** Toggle a combatant's enabled/disabled state (grayed out, skipped in turn order). */
  toggleEnabled(combatantId: string): void {
    const c = this.findCombatant(combatantId);
    if (!c) return;
    const undo = this.createUndo(`${(c.enabled ?? true) ? "Disabled" : "Enabled"} ${c.display}`, "state", this.turnContextDetail());
    c.enabled = !(c.enabled ?? true);
    this.pushUndo(undo);
    this.emit();
  }

  /** Swap two combatants within the same initiative count. */
  swapCombatantsWithSameInitiative(sourceId: string, targetId: string): boolean {
    if (!this.state || sourceId === targetId) return false;

    const sourceIndex = this.state.combatants.findIndex(c => c.id === sourceId);
    const targetIndex = this.state.combatants.findIndex(c => c.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return false;

    const source = this.state.combatants[sourceIndex];
    const target = this.state.combatants[targetIndex];
    if (!source || !target || source.initiative !== target.initiative) return false;

    const undo = this.createUndo(`Swapped ${source.display} and ${target.display}`, "initiative", `Initiative ${source.initiative}`);
    const currentId = this.state.combatants[this.state.turnIndex]?.id;
    this.state.combatants[sourceIndex] = target;
    this.state.combatants[targetIndex] = source;
    this.assignTieOrderForInitiative(source.initiative);

    if (currentId) {
      const nextTurnIndex = this.state.combatants.findIndex(c => c.id === currentId);
      if (nextTurnIndex >= 0) this.state.turnIndex = nextTurnIndex;
    }

    this.pushUndo(undo);
    this.emit();
    return true;
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
    this.clearUndoHistory();
    this.sortAscending = false;
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

  /* ────────────────── PC Note Sync ────────────────── */

  /**
   * Build a read-only preview of what would change if we synced tracker HP
   * to vault notes. Used by the confirmation modal.
   * @param combatantIds If provided, only include these combatants. Otherwise all PCs.
   */
  async buildSyncPreview(combatantIds?: string[]): Promise<SyncPreviewEntry[]> {
    if (!this.state) return [];

    let pcs = this.state.combatants.filter(c => c.player && c.notePath);
    if (combatantIds) {
      const idSet = new Set(combatantIds);
      pcs = pcs.filter(c => idSet.has(c.id));
    }

    const entries: SyncPreviewEntry[] = [];
    for (const c of pcs) {
      if (!c.notePath) continue;
      try {
        const file = this.app.vault.getAbstractFileByPath(c.notePath);
        if (!(file instanceof TFile)) {
          entries.push({ combatant: c, vaultHP: 0, vaultTHP: 0, trackerHP: c.currentHP, trackerTHP: c.tempHP, changed: true, drastic: false, error: "Note not found" });
          continue;
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        const vaultHP = fm ? (parseInt(fm.hp) || 0) : 0;
        const vaultTHP = fm ? (parseInt(fm.thp) || 0) : 0;

        const changed = vaultHP !== c.currentHP || vaultTHP !== c.tempHP;
        // Drastic: tracker is at full HP but vault was significantly wounded
        const drastic = changed && c.currentHP === c.maxHP && vaultHP < c.maxHP * 0.9;

        entries.push({ combatant: c, vaultHP, vaultTHP, trackerHP: c.currentHP, trackerTHP: c.tempHP, changed, drastic });
      } catch (err) {
        entries.push({ combatant: c, vaultHP: 0, vaultTHP: 0, trackerHP: c.currentHP, trackerTHP: c.tempHP, changed: true, drastic: false, error: String(err) });
      }
    }
    return entries;
  }

  /**
   * Write selected PC combatants' tracker HP and temp HP back to their
   * vault note's frontmatter (`hp` and `thp` fields).
   * @param combatantIds The IDs of combatants to sync. Only PCs with notePath are written.
   */
  async syncSelectedPCsToNotes(combatantIds: string[]): Promise<{ synced: number; failed: number }> {
    if (!this.state) return { synced: 0, failed: 0 };

    const idSet = new Set(combatantIds);
    const pcs = this.state.combatants.filter(c => c.player && c.notePath && idSet.has(c.id));

    let synced = 0;
    let failed = 0;

    for (const c of pcs) {
      if (!c.notePath) continue;
      try {
        const file = this.app.vault.getAbstractFileByPath(c.notePath);
        if (!(file instanceof TFile)) { failed++; continue; }

        let content = await this.app.vault.read(file);
        content = this.setFrontmatterField(content, "hp", String(c.currentHP));
        content = this.setFrontmatterField(content, "thp", String(c.tempHP));
        await this.app.vault.modify(file, content);
        synced++;
      } catch (err) {
        console.error(`[CombatTracker] Failed to sync PC "${c.name}" to note:`, err);
        failed++;
      }
    }

    if (failed > 0) {
      new Notice(`Synced ${synced} PC${synced !== 1 ? "s" : ""} to notes (${failed} failed)`);
    } else if (synced > 0) {
      new Notice(`Synced ${synced} PC${synced !== 1 ? "s" : ""} to notes`);
    }
    return { synced, failed };
  }

  /**
   * Write all PC combatants' tracker HP to vault notes (legacy convenience wrapper).
   */
  async syncPCsToNotes(): Promise<void> {
    if (!this.state) {
      new Notice("No active combat to sync");
      return;
    }
    const pcs = this.state.combatants.filter(c => c.player && c.notePath);
    if (pcs.length === 0) {
      new Notice("No PCs with linked notes in this combat");
      return;
    }
    await this.syncSelectedPCsToNotes(pcs.map(c => c.id));
  }

  /**
   * Re-read selected PCs' `hp` and `thp` from their vault notes into the tracker.
   * @param combatantIds The IDs of combatants to refresh.
   */
  async refreshSelectedPCsFromNotes(combatantIds: string[]): Promise<{ refreshed: number; failed: number }> {
    if (!this.state) return { refreshed: 0, failed: 0 };

    const idSet = new Set(combatantIds);
    const pcs = this.state.combatants.filter(c => c.player && c.notePath && idSet.has(c.id));
    const undo = pcs.length > 0
      ? this.createUndo(`Refreshed ${pcs.length} PC${pcs.length !== 1 ? "s" : ""} from notes`, "hp", this.turnContextDetail())
      : null;

    let refreshed = 0;
    let failed = 0;

    for (const c of pcs) {
      if (!c.notePath) continue;
      try {
        const file = this.app.vault.getAbstractFileByPath(c.notePath);
        if (!(file instanceof TFile)) { failed++; continue; }

        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm) { failed++; continue; }

        const currentHP = parseInt(fm.hp) || 0;
        const maxHP = parseInt(fm.hp_max) || parseInt(fm.hp) || c.maxHP;
        const tempHP = parseInt(fm.thp) || 0;

        c.currentHP = Math.max(0, Math.min(maxHP, currentHP));
        c.maxHP = maxHP;
        c.tempHP = Math.max(0, tempHP);
        this.syncUnconsciousStatus(c);
        refreshed++;
      } catch (err) {
        console.error(`[CombatTracker] Failed to refresh PC "${c.name}" from note:`, err);
        failed++;
      }
    }

    if (refreshed > 0) {
      if (undo) undo.label = `Refreshed ${refreshed} PC${refreshed !== 1 ? "s" : ""} from notes`;
      this.pushUndo(undo);
      this.emit();
    }

    if (failed > 0) {
      new Notice(`Refreshed ${refreshed} PC${refreshed !== 1 ? "s" : ""} from notes (${failed} failed)`);
    } else if (refreshed > 0) {
      new Notice(`Refreshed ${refreshed} PC${refreshed !== 1 ? "s" : ""} from notes`);
    }
    return { refreshed, failed };
  }

  /**
   * Re-read all PCs' HP from vault notes (legacy convenience wrapper).
   */
  async refreshPCsFromNotes(): Promise<void> {
    if (!this.state) {
      new Notice("No active combat to refresh");
      return;
    }
    const pcs = this.state.combatants.filter(c => c.player && c.notePath);
    if (pcs.length === 0) {
      new Notice("No PCs with linked notes in this combat");
      return;
    }
    await this.refreshSelectedPCsFromNotes(pcs.map(c => c.id));
  }

  /**
   * Set (or update) a single frontmatter field value in raw file content.
   * Operates purely on the string — does not call vault.modify().
   */
  private setFrontmatterField(content: string, field: string, value: string): string {
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch || fmMatch[1] === undefined) return content;

    const fieldRegex = new RegExp(`^(${field}:\\s*).*$`, "m");
    if (fieldRegex.test(fmMatch[0])) {
      return content.replace(fieldRegex, `$1${value}`);
    }

    // Field not present — insert after the opening --- line
    return content.replace(/^---(\r?\n)/, `---$1${field}: ${value}$1`);
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
      if (a.initiativeTieOrder !== undefined && b.initiativeTieOrder !== undefined) {
        return a.initiativeTieOrder - b.initiativeTieOrder;
      }
      return b.modifier - a.modifier; // DEX tiebreaker
    });

    // Restore turnIndex to the same combatant
    if (currentId) {
      const newIdx = this.state.combatants.findIndex(c => c.id === currentId);
      if (newIdx >= 0) this.state.turnIndex = newIdx;
    }
  }

  private assignTieOrderForInitiative(initiative: number): void {
    if (!this.state) return;
    let order = 0;
    for (const c of this.state.combatants) {
      if (c.initiative === initiative) {
        c.initiativeTieOrder = order++;
      }
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

  private async createTrapCombatants(ec: EncounterCreature): Promise<Combatant[]> {
    const trapDetails = await this.readTrapDetails(ec);
    const initiatives = this.getTrapInitiativeCounts(ec, trapDetails);
    const counts = initiatives.length > 0 ? initiatives : [0];
    const hp = ec.hp ?? trapDetails.hp ?? 1;
    const ac = ec.ac ?? trapDetails.ac ?? 10;
    const combatants: Combatant[] = [];

    for (const initiative of counts) {
      const hasFixedInitiative = initiative > 0;
      const display = hasFixedInitiative && counts.length > 1
        ? `${ec.name} (Initiative ${initiative})`
        : ec.name;

      combatants.push({
        id: this.generateId(),
        name: ec.name,
        display,
        initiative: hasFixedInitiative ? initiative : 0,
        fixedInitiative: hasFixedInitiative,
        modifier: hasFixedInitiative ? initiative : 0,
        currentHP: hp,
        maxHP: hp,
        tempHP: 0,
        ac,
        currentAC: ac,
        player: false,
        friendly: ec.isFriendly ?? false,
        hidden: ec.isHidden ?? false,
        trap: true,
        notePath: (ec.trapPath || ec.path) && (ec.trapPath || ec.path) !== "[SRD]" ? (ec.trapPath || ec.path) : undefined,
        statuses: [],
        cr: ec.cr,
      });
    }

    return combatants;
  }

  private getTrapInitiativeCounts(
    ec: EncounterCreature,
    trapDetails: { initiative?: number; elements: Array<{ element_type?: string; initiative?: number }> },
  ): number[] {
    const counts = new Set<number>();
    const add = (value: unknown) => {
      const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
      if (!Number.isNaN(n) && n > 0) counts.add(n);
    };

    if (Array.isArray(ec.initiativeCounts)) {
      for (const value of ec.initiativeCounts) add(value);
    }
    add(ec.initiative);

    for (const element of trapDetails.elements) {
      if (!element || element.element_type === "dynamic" || element.element_type === "constant") continue;
      add(element.initiative);
    }

    add(trapDetails.initiative);

    const nameMatch = ec.name.match(/\(Initiative\s+(\d+)\)/i);
    if (nameMatch?.[1]) add(nameMatch[1]);

    return Array.from(counts).sort((a, b) => b - a);
  }

  private async readTrapDetails(ec: EncounterCreature): Promise<{
    initiative?: number;
    elements: Array<{ element_type?: string; initiative?: number }>;
    hp?: number;
    ac?: number;
  }> {
    const path = ec.trapPath || ec.path;
    const fallback = {
      initiative: ec.trapData?.initiative,
      elements: ec.trapData?.elements ?? [],
      hp: ec.hp,
      ac: ec.ac,
    };

    if (!path || path === "[SRD]") return fallback;

    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return fallback;

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || fm.type !== "trap") return fallback;

      return {
        initiative: typeof fm.trap_initiative === "number" ? fm.trap_initiative : parseInt(String(fm.trap_initiative ?? ""), 10) || fallback.initiative,
        elements: Array.isArray(fm.elements) ? fm.elements : fallback.elements,
        hp: typeof fm.hp === "number" ? fm.hp : fallback.hp,
        ac: typeof fm.ac === "number" ? fm.ac : fallback.ac,
      };
    } catch {
      return fallback;
    }
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
