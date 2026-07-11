import { describe, expect, it } from "vitest";
import { addSessionBacklink, normalizeSessionBacklinks, removeSessionBacklink } from "../../src/session/SessionBacklinks";

describe("session backlink reconciliation", () => {
  it("normalizes scalar and array legacy values without duplicates", () => {
    expect(normalizeSessionBacklinks("Old Session")).toEqual(["[[Old Session.md]]"]);
    expect(normalizeSessionBacklinks(["[[Old Session.md]]", "Old Session", "[[Other|label]]"])).toEqual([
      "[[Old Session.md]]",
      "[[Other.md]]",
    ]);
  });

  it("adds the target once while preserving other sessions", () => {
    expect(addSessionBacklink(["[[Other.md]]", "[[Session.md]]"], "Session.md")).toEqual([
      "[[Other.md]]",
      "[[Session.md]]",
    ]);
  });

  it("removes only the exact target", () => {
    expect(removeSessionBacklink(["[[Session.md]]", "[[Session Extended.md]]", "[[Other.md]]"], "Session.md")).toEqual([
      "[[Session Extended.md]]",
      "[[Other.md]]",
    ]);
  });
});
