import { describe, expect, it } from "vitest";
import {
  addFrontmatterFieldAfter,
  compareVersions,
  parseFrontmatter,
  removeAllDataviewjsBlocks,
  replaceDataviewjsBlock,
  setFrontmatterField,
} from "../../src/migration/frontmatter";

describe("migration/frontmatter utilities", () => {
  it("parseFrontmatter returns hasFrontmatter=false when block is missing", () => {
    const res = parseFrontmatter("# No frontmatter here\n");
    expect(res.hasFrontmatter).toBe(false);
    expect(res.frontmatter).toEqual({});
  });

  it("setFrontmatterField updates an existing field", () => {
    const input = [
      "---",
      "type: session",
      "template_version: 1.0.0",
      "---",
      "",
      "# Session",
      "",
    ].join("\n");

    const out = setFrontmatterField(input, "template_version", "1.5.0");

    expect(out).toContain("template_version: 1.5.0");
    expect(out).not.toContain("template_version: 1.0.0");
  });

  it("setFrontmatterField inserts new field after type when missing", () => {
    const input = [
      "---",
      "type: npc",
      "name: Bob",
      "---",
      "",
      "# Bob",
      "",
    ].join("\n");

    const out = setFrontmatterField(input, "token_id", "abc123");

    expect(out).toContain("type: npc\ntoken_id: abc123\nname: Bob");
  });

  it("addFrontmatterFieldAfter inserts after the requested field and is idempotent", () => {
    const input = [
      "---",
      "type: scene",
      "status: planned",
      "---",
      "",
      "# Scene",
      "",
    ].join("\n");

    const once = addFrontmatterFieldAfter(input, "sessions", "[]", "status");
    const twice = addFrontmatterFieldAfter(once, "sessions", "[]", "status");

    expect(once).toContain("status: planned\nsessions: []");
    expect((twice.match(/^sessions:\s*\[\]$/gm) ?? []).length).toBe(1);
  });

  it("replaceDataviewjsBlock only replaces block containing marker text", () => {
    const input = [
      "```dataviewjs",
      "dv.paragraph('ignore me')",
      "```",
      "",
      "```dataviewjs",
      "app.commands.executeCommandById(\"dnd-campaign-hub:edit-npc\");",
      "```",
    ].join("\n");

    const out = replaceDataviewjsBlock(input, "edit-npc", "```dnd-hub\n```");

    expect(out).toContain("dv.paragraph('ignore me')");
    expect(out).toContain("```dnd-hub\n```");
  });

  it("compareVersions handles semver ordering", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.3.0", "1.3.0")).toBe(0);
    expect(compareVersions("1.2.9", "1.3.0")).toBe(-1);
  });

  it("removeAllDataviewjsBlocks strips every dataviewjs block", () => {
    const input = [
      "# Title",
      "",
      "```dataviewjs",
      "dv.paragraph('block 1')",
      "```",
      "",
      "Some text",
      "",
      "```dataviewjs",
      "dv.paragraph('block 2')",
      "```",
    ].join("\n");

    const out = removeAllDataviewjsBlocks(input);

    expect(out).not.toBeNull();
    expect(out).not.toContain("dataviewjs");
    expect(out).toContain("Some text");
    expect(out).toContain("# Title");
  });

  it("removeAllDataviewjsBlocks returns null when no blocks exist", () => {
    const input = "# Title\n\nSome text\n";
    expect(removeAllDataviewjsBlocks(input)).toBeNull();
  });
});
