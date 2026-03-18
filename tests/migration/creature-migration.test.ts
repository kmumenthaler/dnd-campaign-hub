import { describe, expect, it } from "vitest";
import { getEntityType, replaceDataviewjsBlock, setFrontmatterField } from "../../src/migration/frontmatter";

// ── Shared fixture helpers ───────────────────────────────────────────────────

/** A realistic SRD creature note before any migration. */
const makeSRDNote = (overrides: { type?: string; hasDataviewjs?: boolean; hasPluginType?: boolean } = {}) => {
  const { type = "humanoid", hasDataviewjs = true, hasPluginType = false } = overrides;
  const pluginTypeLine = hasPluginType ? "plugin_type: creature\n" : "";
  const buttonBlock = hasDataviewjs
    ? `\n\`\`\`dataviewjs\n// Action buttons for creature management\nconst buttonContainer = dv.el("div", "", { attr: { style: "display: flex;" } });\nconst editBtn = buttonContainer.createEl("button", { text: "Edit Creature" });\neditBtn.addEventListener("click", () => {\n  app.commands.executeCommandById("dnd-campaign-hub:edit-creature");\n});\nconst deleteBtn = buttonContainer.createEl("button", { text: "Delete Creature" });\ndeleteBtn.addEventListener("click", () => {\n  app.commands.executeCommandById("dnd-campaign-hub:delete-creature");\n});\n\`\`\`\n`
    : "";
  return [
    "---",
    "statblock: true",
    "layout: Basic 5e Layout",
    pluginTypeLine.trim(),
    `name: Acolyte`,
    "size: Medium",
    `type: ${type}`,
    "alignment: any alignment",
    "ac: 10",
    "hp: 9",
    "cr: 1/4",
    "token_id: marker_123",
    "source: D&D 5e SRD",
    "---",
    "",
    "![[z_Beastiarity/images/acolyte.png]]",
    "",
    "Acolyte creature imported from the D&D 5e SRD.",
    buttonBlock,
    "```statblock",
    "creature: Acolyte",
    "```",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
};

// ── getEntityType ────────────────────────────────────────────────────────────

describe("getEntityType — SRD creature fingerprinting", () => {
  it("returns 'creature' for an SRD note with statblock:true and source:D&D 5e SRD", () => {
    const note = makeSRDNote({ type: "humanoid" });
    expect(getEntityType(note)).toBe("creature");
  });

  it("returns 'creature' for dragon type SRD notes", () => {
    const note = makeSRDNote({ type: "dragon" });
    expect(getEntityType(note)).toBe("creature");
  });

  it("returns plugin_type when present, regardless of type field", () => {
    const note = makeSRDNote({ type: "humanoid", hasPluginType: true });
    expect(getEntityType(note)).toBe("creature");
  });

  it("returns normal type for plugin notes without statblock fingerprint", () => {
    const npcNote = [
      "---",
      "type: npc",
      "name: Bob",
      "template_version: 1.4.0",
      "---",
      "",
      "# Bob",
      "",
    ].join("\n");
    expect(getEntityType(npcNote)).toBe("npc");
  });

  it("returns null when there is no type field and no SRD fingerprint", () => {
    const plain = "# Just a plain note\n\nNo frontmatter here.\n";
    expect(getEntityType(plain)).toBeNull();
  });

  it("does not trigger for statblock notes without source: D&D 5e SRD", () => {
    const customNote = [
      "---",
      "statblock: true",
      "layout: Basic 5e Layout",
      "name: My Custom Creature",
      "type: beast",
      "---",
      "",
      "Custom content.",
      "",
    ].join("\n");
    // No `source: D&D 5e SRD` — should fall back to `type`
    expect(getEntityType(customNote)).toBe("beast");
  });
});

// ── creature-1.4.0 migration logic ───────────────────────────────────────────

/** Simulates the creature-1.4.0 migration step. */
function applyCreature140(content: string): string | null {
  if (/^plugin_type:/m.test(content)) return null;
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || match[1] === undefined) return null;
  let fm = match[1];
  if (/^layout:/m.test(fm)) {
    fm = fm.replace(/^(layout:\s*.+)$/m, "$1\nplugin_type: creature");
  } else if (/^name:/m.test(fm)) {
    fm = fm.replace(/^(name:\s*.+)$/m, "plugin_type: creature\n$1");
  } else {
    fm = `${fm}\nplugin_type: creature`;
  }
  const out = content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  return setFrontmatterField(out, "template_version", "1.4.0");
}

describe("creature-1.4.0: add plugin_type field", () => {
  it("inserts plugin_type: creature after layout: field", () => {
    const note = makeSRDNote();
    const out = applyCreature140(note);
    expect(out).not.toBeNull();
    expect(out).toContain("layout: Basic 5e Layout\nplugin_type: creature");
  });

  it("sets template_version to 1.4.0", () => {
    const out = applyCreature140(makeSRDNote());
    expect(out).toContain("template_version: 1.4.0");
  });

  it("is idempotent — returns null when plugin_type already exists", () => {
    const note = makeSRDNote({ hasPluginType: true });
    expect(applyCreature140(note)).toBeNull();
  });

  it("inserts plugin_type before name when no layout field", () => {
    const note = [
      "---",
      "statblock: true",
      "name: Test Creature",
      "type: beast",
      "source: D&D 5e SRD",
      "---",
      "",
      "Body.",
      "",
    ].join("\n");
    const out = applyCreature140(note);
    expect(out).not.toBeNull();
    expect(out).toContain("plugin_type: creature\nname: Test Creature");
  });
});

// ── creature-1.5.0 migration logic ───────────────────────────────────────────

const DND_HUB_BLOCK = "```dnd-hub\n```";

/** Simulates the creature-1.5.0 migration step. */
function applyCreature150(content: string): string | null {
  if (content.includes("```dnd-hub")) return null;
  const replaced = replaceDataviewjsBlock(content, "dnd-campaign-hub:edit-creature", DND_HUB_BLOCK);
  if (replaced !== null) return setFrontmatterField(replaced, "template_version", "1.5.0");
  // No matching block — nothing to do
  return null;
}

describe("creature-1.5.0: replace dataviewjs with dnd-hub", () => {
  it("replaces the dataviewjs button block with a dnd-hub block", () => {
    const note = makeSRDNote({ hasDataviewjs: true });
    const out = applyCreature150(note);
    expect(out).not.toBeNull();
    expect(out).toContain("```dnd-hub\n```");
    expect(out).not.toContain("```dataviewjs");
  });

  it("sets template_version to 1.5.0", () => {
    const note = makeSRDNote({ hasDataviewjs: true });
    const out = applyCreature150(note);
    expect(out).toContain("template_version: 1.5.0");
  });

  it("is idempotent — returns null when dnd-hub block already present", () => {
    const note = [
      "---",
      "plugin_type: creature",
      "name: Acolyte",
      "type: humanoid",
      "source: D&D 5e SRD",
      "template_version: 1.4.0",
      "---",
      "",
      "```dnd-hub",
      "```",
      "",
      "```statblock",
      "creature: Acolyte",
      "```",
      "",
    ].join("\n");
    expect(applyCreature150(note)).toBeNull();
  });

  it("returns null when there is no dataviewjs block to replace", () => {
    const note = makeSRDNote({ hasDataviewjs: false });
    // No dataviewjs and no dnd-hub — replaceDataviewjsBlock returns null
    expect(applyCreature150(note)).toBeNull();
  });
});
