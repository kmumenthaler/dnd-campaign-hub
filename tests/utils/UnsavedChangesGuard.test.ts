import { describe, expect, it } from "vitest";
import { serializeUnsavedState, UnsavedChangesTracker } from "../../src/utils/UnsavedChangesGuard";

describe("UnsavedChangesTracker", () => {
  it("does not report changes before or immediately after capture", () => {
    const tracker = new UnsavedChangesTracker();
    expect(tracker.isDirty({ name: "" })).toBe(false);
    tracker.capture({ name: "", defaults: [1, 2] });
    expect(tracker.isDirty({ defaults: [1, 2], name: "" })).toBe(false);
  });

  it("detects nested and ordered-list changes", () => {
    const tracker = new UnsavedChangesTracker();
    tracker.capture({ name: "Scene", creatures: [{ name: "Goblin", count: 2 }] });
    expect(tracker.isDirty({ name: "Scene", creatures: [{ name: "Goblin", count: 3 }] })).toBe(true);
    expect(tracker.isDirty({ name: "Scene", creatures: [{ count: 2, name: "Goblin" }] })).toBe(false);
  });

  it("preserves array order while ignoring object key order", () => {
    expect(serializeUnsavedState({ b: 2, a: 1 })).toBe(serializeUnsavedState({ a: 1, b: 2 }));
    expect(serializeUnsavedState(["a", "b"])).not.toBe(serializeUnsavedState(["b", "a"]));
  });
});
