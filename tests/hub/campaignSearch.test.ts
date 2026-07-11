import { describe, expect, it } from "vitest";
import { scoreCampaignSearchItem, searchCampaignItems, type CampaignSearchItem } from "../../src/hub/campaignSearch";

const items: CampaignSearchItem[] = [
  { path: "Scenes/Goblin Ambush.md", name: "Goblin Ambush", type: "scene", context: "Lost Mine" },
  { path: "NPCs/Goblin King.md", name: "Goblin King", type: "npc", context: "NPCs" },
  { path: "Sessions/Session 4.md", name: "Session 4", type: "session", context: "Goblin Ambush" },
];

describe("campaign content search", () => {
  it("prioritizes exact and prefix name matches over context matches", () => {
    const results = searchCampaignItems(items, "goblin");
    expect(results.map(item => item.name)).toEqual(["Goblin King", "Goblin Ambush", "Session 4"]);
  });

  it("supports type and multi-term context filtering", () => {
    expect(searchCampaignItems(items, "npc").map(item => item.name)).toEqual(["Goblin King"]);
    expect(searchCampaignItems(items, "session goblin").map(item => item.name)).toEqual(["Session 4"]);
  });

  it("returns no score for unrelated content and honors limits", () => {
    expect(scoreCampaignSearchItem(items[0]!, "dragon")).toBe(0);
    expect(searchCampaignItems(items, "", 2)).toHaveLength(2);
  });
});
