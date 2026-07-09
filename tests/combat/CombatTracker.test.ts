import { beforeEach, describe, expect, it, vi } from "vitest";
import { CombatTracker } from "../../src/combat/CombatTracker";

vi.mock("obsidian", () => {
  class TFile {}
  class TFolder {}
  return {
    Notice: vi.fn(),
    TFile,
    TFolder,
  };
});

type PartyMember = {
  name: string;
  level: number;
  hp: number;
  ac: number;
  notePath?: string;
  tokenId?: string;
  initBonus?: number;
  thp?: number;
};

type EncounterCreature = {
  name: string;
  count: number;
  initiative?: number;
  initiativeCounts?: number[];
  fixedInitiative?: boolean;
  hp?: number;
  ac?: number;
  cr?: string;
  path?: string;
  isTrap?: boolean;
  trapPath?: string;
  isFriendly?: boolean;
  isHidden?: boolean;
};

function createTracker() {
  const app: any = {
    vault: {
      getAbstractFileByPath: vi.fn(() => null),
      read: vi.fn(async () => ""),
    },
    metadataCache: {
      getFileCache: vi.fn(() => null),
    },
  };

  const plugin: any = {
    partyManager: {
      rollPlayerInitiatives: 1,
    },
    settings: {
      combatStates: {},
    },
    saveSettings: vi.fn(async () => {}),
  };

  return { tracker: new CombatTracker(app, plugin), plugin };
}

async function seedCombat(
  tracker: CombatTracker,
  creatures: EncounterCreature[],
  partyMembers: PartyMember[] = [],
): Promise<string[]> {
  await tracker.startFromEncounter("Test Encounter", creatures as any, partyMembers as any, false);
  const state = tracker.getState();
  if (!state) throw new Error("Expected combat state");
  return state.combatants.map((c) => c.id);
}

describe("combat/CombatTracker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("applies temp HP before reducing current HP", async () => {
    const { tracker } = createTracker();
    const [id] = await seedCombat(tracker, [{ name: "Goblin", count: 1, hp: 10, ac: 13, path: "[SRD]" }]);

    tracker.setTempHP(id!, 3);
    tracker.applyDamage(id!, 5);

    const c = tracker.getState()!.combatants[0]!;
    expect(c.tempHP).toBe(0);
    expect(c.currentHP).toBe(8);
  });

  it("adds two failed death saves on critical damage at 0 HP", async () => {
    const { tracker } = createTracker();
    const [id] = await seedCombat(tracker, [], [{ name: "Aelar", level: 3, hp: 18, ac: 15 }]);

    tracker.setHP(id!, 0);
    tracker.applyDamage(id!, 1, true);

    const c = tracker.getState()!.combatants[0]!;
    expect(c.deathSaves?.failures).toBe(2);
    expect(c.dead).not.toBe(true);
  });

  it("kills combatant after three death save failures", async () => {
    const { tracker } = createTracker();
    const [id] = await seedCombat(tracker, [], [{ name: "Miri", level: 4, hp: 24, ac: 16 }]);

    tracker.setHP(id!, 0);
    tracker.addDeathSaveFailure(id!);
    tracker.addDeathSaveFailure(id!);
    tracker.addDeathSaveFailure(id!);

    const c = tracker.getState()!.combatants[0]!;
    expect(c.dead).toBe(true);
    expect(c.statuses.some((s) => s.name === "Dead")).toBe(true);
    expect(c.statuses.some((s) => s.name === "Unconscious")).toBe(false);
  });

  it("natural 20 death save revives to 1 HP and clears death saves", async () => {
    const { tracker } = createTracker();
    const [id] = await seedCombat(tracker, [], [{ name: "Bram", level: 2, hp: 14, ac: 14 }]);

    tracker.setHP(id!, 0);
    vi.spyOn(tracker as any, "rollD20").mockReturnValue(20);

    const roll = tracker.rollDeathSave(id!);
    const c = tracker.getState()!.combatants[0]!;

    expect(roll).toBe(20);
    expect(c.currentHP).toBe(1);
    expect(c.deathSaves).toBeUndefined();
    expect(c.statuses.some((s) => s.name === "Unconscious")).toBe(false);
  });

  it("skips disabled combatants and increments round on wrap", async () => {
    const { tracker } = createTracker();
    const ids = await seedCombat(tracker, [
      { name: "A", count: 1, hp: 10, ac: 10, path: "[SRD]" },
      { name: "B", count: 1, hp: 10, ac: 10, path: "[SRD]" },
      { name: "C", count: 1, hp: 10, ac: 10, path: "[SRD]" },
    ]);

    tracker.setInitiative(ids[0]!, 20);
    tracker.setInitiative(ids[1]!, 15);
    tracker.setInitiative(ids[2]!, 10);

    (tracker as any).state.started = true;
    (tracker as any).state.round = 1;
    (tracker as any).state.turnIndex = 0;

    tracker.toggleEnabled(ids[1]!); // disable middle combatant

    tracker.nextTurn();
    let state = tracker.getState()!;
    expect(state.turnIndex).toBe(2);
    expect(state.round).toBe(1);

    tracker.nextTurn();
    state = tracker.getState()!;
    expect(state.turnIndex).toBe(0);
    expect(state.round).toBe(2);
  });

  it("skips defeated hostile combatants but keeps downed PCs in turn order", async () => {
    const { tracker } = createTracker();
    await seedCombat(
      tracker,
      [
        { name: "Goblin", count: 1, hp: 10, ac: 13, path: "[SRD]" },
        { name: "Orc", count: 1, hp: 12, ac: 13, path: "[SRD]" },
      ],
      [{ name: "Aelar", level: 3, hp: 18, ac: 15 }],
    );

    const idByName = (name: string) => tracker.getState()!.combatants.find((c) => c.name === name)!.id;
    const goblinId = idByName("Goblin");
    const orcId = idByName("Orc");
    const pcId = idByName("Aelar");

    tracker.setInitiative(goblinId, 20);
    tracker.setInitiative(orcId, 15);
    tracker.setInitiative(pcId, 10);

    (tracker as any).state.started = true;
    (tracker as any).state.round = 1;
    (tracker as any).state.turnIndex = 0;

    tracker.setHP(orcId, 0);
    tracker.setHP(pcId, 0);

    tracker.nextTurn();
    const state = tracker.getState()!;
    expect(state.combatants[state.turnIndex]?.name).toBe("Aelar");
    expect(state.round).toBe(1);
  });

  it("keeps trap initiative counts fixed when rolling initiative", async () => {
    const { tracker } = createTracker();
    await seedCombat(tracker, [
      {
        name: "Grinding Hallway",
        count: 1,
        hp: 1,
        ac: 15,
        isTrap: true,
        initiativeCounts: [20, 10],
        fixedInitiative: true,
      },
      { name: "Goblin", count: 1, hp: 10, ac: 13, path: "[SRD]" },
    ]);

    vi.spyOn(tracker as any, "rollD20").mockReturnValue(3);
    tracker.rollAllInitiative();

    const state = tracker.getState()!;
    const traps = state.combatants.filter((c) => c.trap);
    const goblin = state.combatants.find((c) => c.name === "Goblin")!;

    expect(traps.map((c) => c.initiative)).toEqual([20, 10]);
    expect(traps.every((c) => c.fixedInitiative)).toBe(true);
    expect(goblin.initiative).toBe(3);
  });

  it("swaps combatants only within the same initiative count", async () => {
    const { tracker } = createTracker();
    const ids = await seedCombat(tracker, [
      { name: "A", count: 1, hp: 10, ac: 10, path: "[SRD]" },
      { name: "B", count: 1, hp: 10, ac: 10, path: "[SRD]" },
      { name: "C", count: 1, hp: 10, ac: 10, path: "[SRD]" },
    ]);

    tracker.setInitiative(ids[0]!, 15);
    tracker.setInitiative(ids[1]!, 15);
    tracker.setInitiative(ids[2]!, 10);

    expect(tracker.swapCombatantsWithSameInitiative(ids[0]!, ids[1]!)).toBe(true);
    expect(tracker.getState()!.combatants.map((c) => c.name)).toEqual(["B", "A", "C"]);

    expect(tracker.swapCombatantsWithSameInitiative(ids[0]!, ids[2]!)).toBe(false);
    expect(tracker.getState()!.combatants.map((c) => c.name)).toEqual(["B", "A", "C"]);
  });

  it("adds another encounter's creatures to active combat in one call", async () => {
    const { tracker } = createTracker();
    await seedCombat(tracker, [{ name: "Goblin", count: 1, hp: 10, ac: 13, path: "[SRD]" }]);
    tracker.rollAllInitiative();

    vi.spyOn(tracker as any, "rollD20").mockReturnValue(12);
    const added = await tracker.addCreaturesFromEncounter("Reinforcements", [
      { name: "Wolf", count: 2, hp: 11, ac: 13, path: "[SRD]" },
    ], true);

    const state = tracker.getState()!;
    expect(added).toBe(2);
    expect(state.combatants.filter((c) => c.name === "Wolf")).toHaveLength(2);
    expect(state.combatants.filter((c) => c.name === "Wolf").map((c) => c.initiative)).toEqual([12, 12]);
  });

  it("undoes the latest damage and removes its encounter summary event", async () => {
    const { tracker } = createTracker();
    const [id] = await seedCombat(tracker, [{ name: "Goblin", count: 1, hp: 10, ac: 13, path: "[SRD]" }]);
    tracker.rollAllInitiative();

    const eventsBeforeDamage = tracker.getState()!.runStats?.events.length ?? 0;
    tracker.applyDamage(id!, 5);

    expect(tracker.getState()!.combatants[0]!.currentHP).toBe(5);
    expect(tracker.getRecentActions()[0]?.label).toContain("damage");

    expect(tracker.undoLastAction()).toBe(true);

    const state = tracker.getState()!;
    expect(state.combatants[0]!.currentHP).toBe(10);
    expect(state.runStats?.events.length ?? 0).toBe(eventsBeforeDamage);
  });

  it("undoes a turn advance including status duration ticks", async () => {
    const { tracker } = createTracker();
    const ids = await seedCombat(tracker, [
      { name: "A", count: 1, hp: 10, ac: 10, path: "[SRD]" },
      { name: "B", count: 1, hp: 10, ac: 10, path: "[SRD]" },
    ]);

    tracker.setInitiative(ids[0]!, 20);
    tracker.setInitiative(ids[1]!, 10);
    (tracker as any).state.started = true;
    (tracker as any).state.round = 1;
    (tracker as any).state.turnIndex = 0;
    tracker.addStatus(ids[0]!, { name: "Bless", duration: 1 });

    tracker.nextTurn();
    expect(tracker.getState()!.turnIndex).toBe(1);
    expect(tracker.getState()!.combatants[0]!.statuses).toEqual([]);

    expect(tracker.undoLastAction()).toBe(true);

    const state = tracker.getState()!;
    expect(state.turnIndex).toBe(0);
    expect(state.round).toBe(1);
    expect(state.combatants[0]!.statuses).toMatchObject([{ name: "Bless", duration: 1 }]);
  });
});
