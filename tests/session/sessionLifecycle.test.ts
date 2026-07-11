import { describe, expect, it } from "vitest";
import { normalizeSessionStatus, selectCurrentSession } from "../../src/session/sessionLifecycle";

describe("session lifecycle selection", () => {
  it("prioritizes an in-progress session over newer planned and legacy sessions", () => {
    expect(selectCurrentSession([
      { value: "legacy", sessionNumber: 12 },
      { value: "planned", status: "planned", sessionNumber: 13 },
      { value: "running", status: "in-progress", sessionNumber: 4 },
    ])).toBe("running");
  });

  it("uses the newest planned session, then falls back to legacy notes", () => {
    expect(selectCurrentSession([
      { value: "old-planned", status: "planned", sessionNumber: 3 },
      { value: "new-planned", status: "planned", sessionNumber: 5 },
      { value: "legacy", sessionNumber: 20 },
    ])).toBe("new-planned");
    expect(selectCurrentSession([
      { value: "old", sessionNumber: 1 },
      { value: "new", sessionNumber: 2 },
    ])).toBe("new");
  });

  it("only accepts supported lifecycle values", () => {
    expect(normalizeSessionStatus(" COMPLETED ")).toBe("completed");
    expect(normalizeSessionStatus("active")).toBeNull();
  });
});
