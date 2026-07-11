import { describe, expect, it } from "vitest";
import { addSessionBacklink, collectSessionRelationshipPaths, normalizeSessionBacklinks, removeSessionBacklink } from "../../src/session/SessionBacklinks";

describe("session relationship cleanup", () => {
  it("normalizes scalar and array legacy values without duplicates", () => {
    expect(normalizeSessionBacklinks("Old Session")).toEqual(["[[Old Session.md]]"]);
    expect(normalizeSessionBacklinks(["[[Old Session.md]]", "Old Session", "[[Other|label]]"])).toEqual([
      "[[Old Session.md]]", "[[Other.md]]",
    ]);
  });

  it("adds the target once while preserving other sessions", () => {
    expect(addSessionBacklink(["[[Other.md]]", "[[Session.md]]"], "Session.md")).toEqual([
      "[[Other.md]]", "[[Session.md]]",
    ]);
  });

  it("collects and deduplicates scalar, array, alias, and legacy relationships", () => {
    expect(collectSessionRelationshipPaths({
      adventure: "[[Campaign/Adventure A.md|A]]",
      adventures: ["[[Campaign/Adventure A]]", { path: "Campaign/Adventure B.md" }],
      starting_scene: "[[Campaign/Scene 1#Read aloud]]",
      ending_scene: "Campaign/Scene 2.md",
      planned_scenes: "[[Campaign/Scene 3]]",
    })).toEqual([
      "Campaign/Adventure A", "Campaign/Adventure B", "Campaign/Scene 1",
      "Campaign/Scene 2", "Campaign/Scene 3",
    ]);
  });

  it("removes only the exact session backlink and its basename-only legacy form", () => {
    expect(removeSessionBacklink([
      "[[Campaign/Sessions/001.md]]",
      "[[001]]",
      "[[Other/Sessions/001.md]]",
      "[[Campaign/Sessions/002.md]]",
    ], "Campaign/Sessions/001.md")).toEqual([
      "[[Other/Sessions/001.md]]",
      "[[Campaign/Sessions/002.md]]",
    ]);
  });
});
