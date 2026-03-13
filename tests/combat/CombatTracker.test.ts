import { beforeEach, describe, expect, it, vi } from "vitest";
import { CombatTracker } from "../../src/combat/CombatTracker";

vi.mock("obsidian", () => {
  class TFile {}
  return {
    Notice: vi.fn(),
    TFile,
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
  hp?: number;
  ac?: number;
  cr?: string;
  path?: string;
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
});
