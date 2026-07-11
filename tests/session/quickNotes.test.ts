import { describe, expect, it } from "vitest";
import { extractQuickNotes, updateQuickNotesSection } from "../../src/session/quickNotes";

describe("session quick notes", () => {
  it("clears an existing section without changing later content", () => {
    const input = "# Session\n\n## Quick Notes (During Session)\n\nold note\n\n## Summary\n\nKeep me.\n";
    const output = updateQuickNotesSection(input, "");
    expect(extractQuickNotes(output)).toBe("");
    expect(output).toContain("## Summary\n\nKeep me.");
    expect(output).not.toContain("old note");
  });

  it("updates only the quick notes body", () => {
    const input = "# Session\r\n\r\n## Quick Notes (During Session)\r\n\r\nold\r\n## Summary\r\nunchanged";
    const output = updateQuickNotesSection(input, "new");
    expect(extractQuickNotes(output)).toBe("new");
    expect(output).toContain("## Summary\r\nunchanged");
  });

  it("does not add an empty section when one does not exist", () => {
    const input = "# Session\n\n## Summary\nKeep me\n";
    expect(updateQuickNotesSection(input, "")).toBe(input);
  });
});
