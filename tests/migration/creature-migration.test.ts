import { describe, expect, it } from "vitest";
import { getEntityType, replaceDataviewjsBlock, removeAllDataviewjsBlocks, setFrontmatterField, insertAfterTitle } from "../../src/migration/frontmatter";

// ── creature-1.7.0 simulation helper ─────────────────────────────────────────

/**
 * Simulates the creature-1.7.0 migration step.
 * Mirrors the logic in registry.ts exactly so tests stay in sync.
 */
function applyCreature170(content: string): string | null {
  const ALWAYS_QUOTE = [
    "speed",
    "senses",
    "languages",
    "damage_vulnerabilities",
    "damage_resistances",
    "damage_immunities",
    "condition_immunities",
  ] as const;

  let out = content;
  let changed = false;

  for (const field of ALWAYS_QUOTE) {
    const match = out.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
    const rawValue = match?.[1]?.trim() ?? "";
    if (!rawValue) continue;
    const alreadyQuoted = rawValue.startsWith('"') || rawValue.startsWith("'");
    if (alreadyQuoted) continue;
    const escaped = rawValue.replace(/"/g, '\\"');
    out = out.replace(
      new RegExp(`^(${field}:\\s*)(.+)$`, "m"),
      `$1"${escaped}"`,
    );
    changed = true;
  }

  const crMatch = out.match(/^cr:\s*(.+)$/m);
  const crRaw = crMatch?.[1]?.trim() ?? "";
  if (crRaw && crRaw.includes("/")) {
    const alreadyQuoted = crRaw.startsWith('"') || crRaw.startsWith("'");
    if (!alreadyQuoted) {
      const escaped = crRaw.replace(/"/g, '\\"');
      out = out.replace(/^(cr:\s*)(.+)$/m, `$1"${escaped}"`);
      changed = true;
    }
  }

  if (!changed) return null;

  return setFrontmatterField(out, "template_version", "1.7.0");
}

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

// ── creature-1.6.0 migration logic ───────────────────────────────────────────

const DND_HUB_BLOCK_160 = "```dnd-hub\n```";

/**
 * Simulates the creature-1.6.0 migration step.
 * Mirrors the logic in registry.ts exactly so tests stay in sync.
 */
function applyCreature160(content: string): string | null {
  let out = content;
  const original = out;

  // 1. Remove any remaining dataviewjs blocks.
  if (out.includes("```dataviewjs")) {
    const stripped = removeAllDataviewjsBlocks(out);
    if (stripped !== null) out = stripped;
  }

  // 2. Ensure a dnd-hub render block exists.
  if (!out.includes("```dnd-hub")) {
    out = insertAfterTitle(out, DND_HUB_BLOCK_160);
  }

  // 3. Remove stray single-character lines between a closing code fence and an image embed.
  out = out.replace(/(```\n)\n*([^\s`\n!])\n(?=!?\[\[)/g, "$1\n");

  // 4. Collapse 3+ consecutive blank lines down to 2.
  out = out.replace(/\n{3,}/g, "\n\n");

  if (out === original) return null;

  return setFrontmatterField(out, "template_version", "1.6.0");
}

/** Note that already has a dnd-hub block but ALSO still has a dataviewjs block (the bug state). */
const makePostCreature130Note = (opts: { strayChar?: string } = {}) => {
  const strayLine = opts.strayChar !== undefined ? `${opts.strayChar}\n` : "";
  return [
    "---",
    "statblock: true",
    "layout: Basic 5e Layout",
    "plugin_type: creature",
    "name: Adult Black Dragon",
    "size: Huge",
    "type: dragon",
    "template_version: 1.5.0",
    "source: D&D 5e SRD",
    "---",
    "",
    "```dnd-hub",
    "```",
    "",
    `${strayLine}![[z_Beastiarity/images/adult-black-dragon.png]]`,
    "",
    "Adult Black Dragon creature imported from the D&D 5e SRD.",
    "",
    "```dataviewjs",
    "// Action buttons for creature management",
    'const buttonContainer = dv.el("div", "", { attr: { style: "display: flex;" } });',
    'const editBtn = buttonContainer.createEl("button", { text: "Edit Creature" });',
    "editBtn.addEventListener('click', () => {",
    '  app.commands.executeCommandById("dnd-campaign-hub:edit-creature");',
    "});",
    "```",
    "",
    "```statblock",
    "creature: Adult Black Dragon",
    "```",
    "",
  ].join("\n");
};

describe("creature-1.6.0: strip dataviewjs and clean stray characters", () => {
  it("removes the dataviewjs block when a dnd-hub block is already present", () => {
    const note = makePostCreature130Note();
    const out = applyCreature160(note);
    expect(out).not.toBeNull();
    expect(out).not.toContain("```dataviewjs");
    expect(out).toContain("```dnd-hub\n```");
  });

  it("sets template_version to 1.6.0", () => {
    const note = makePostCreature130Note();
    const out = applyCreature160(note);
    expect(out).toContain("template_version: 1.6.0");
  });

  it("removes a stray single character between the code fence and the image embed", () => {
    const note = makePostCreature130Note({ strayChar: "d" });
    const out = applyCreature160(note);
    expect(out).not.toBeNull();
    // The stray 'd' line should be gone
    expect(out).not.toMatch(/```\n\nd\n/);
    // The image embed should still be present
    expect(out).toContain("![[z_Beastiarity/images/adult-black-dragon.png]]");
  });

  it("collapses 3+ blank lines to 2", () => {
    const note = makePostCreature130Note();
    const out = applyCreature160(note);
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("is idempotent — returns null when already fully migrated", () => {
    const cleanNote = [
      "---",
      "statblock: true",
      "layout: Basic 5e Layout",
      "plugin_type: creature",
      "name: Acolyte",
      "type: humanoid",
      "template_version: 1.6.0",
      "source: D&D 5e SRD",
      "---",
      "",
      "```dnd-hub",
      "```",
      "",
      "![[z_Beastiarity/images/acolyte.png]]",
      "",
      "Acolyte creature imported from the D&D 5e SRD.",
      "",
      "```statblock",
      "creature: Acolyte",
      "```",
      "",
    ].join("\n");
    expect(applyCreature160(cleanNote)).toBeNull();
  });

  it("inserts a dnd-hub block if one is missing", () => {
    // Note with neither dnd-hub nor dataviewjs — shouldn't normally exist but
    // the step should still be safe.
    const bareNote = [
      "---",
      "plugin_type: creature",
      "name: Test Creature",
      "type: beast",
      "template_version: 1.5.0",
      "source: D&D 5e SRD",
      "---",
      "",
      "# Test Creature",
      "",
      "Some content.",
      "",
    ].join("\n");
    const out = applyCreature160(bareNote);
    expect(out).not.toBeNull();
    expect(out).toContain("```dnd-hub\n```");
  });
});

// ── creature-1.7.0 migration logic ───────────────────────────────────────────

/** A creature note with unquoted special-character frontmatter fields. */
const makeUnquotedNote = (overrides: Partial<{
  speed: string;
  senses: string;
  languages: string;
  damage_vulnerabilities: string;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  cr: string;
}> = {}) => {
  const f = {
    speed: "30 ft., fly 60 ft.",
    senses: "darkvision 60 ft., passive Perception 14",
    languages: "Common, Draconic",
    damage_vulnerabilities: "",
    damage_resistances: "bludgeoning, piercing, slashing from nonmagical attacks",
    damage_immunities: "fire, poison",
    condition_immunities: "charmed, frightened",
    cr: "1/4",
    ...overrides,
  };
  return [
    "---",
    "statblock: true",
    "layout: Basic 5e Layout",
    "plugin_type: creature",
    "name: Test Dragon",
    "size: Large",
    "type: dragon",
    "alignment: chaotic evil",
    "ac: 18",
    "hp: 136",
    `speed: ${f.speed}`,
    "stats:",
    "  - 23",
    "  - 10",
    "  - 21",
    "  - 14",
    "  - 11",
    "  - 19",
    `damage_vulnerabilities: ${f.damage_vulnerabilities}`,
    `damage_resistances: ${f.damage_resistances}`,
    `damage_immunities: ${f.damage_immunities}`,
    `condition_immunities: ${f.condition_immunities}`,
    `senses: ${f.senses}`,
    `languages: ${f.languages}`,
    `cr: ${f.cr}`,
    "template_version: 1.6.0",
    "source: D&D 5e SRD",
    "---",
    "",
    "```dnd-hub",
    "```",
    "",
    "Test Dragon creature imported from the D&D 5e SRD.",
    "",
    "```statblock",
    "creature: Test Dragon",
    "```",
    "",
  ].join("\n");
};

describe("creature-1.7.0: quote special-character frontmatter fields", () => {
  it("quotes speed field containing commas", () => {
    const note = makeUnquotedNote({ speed: "30 ft., fly 60 ft." });
    const out = applyCreature170(note);
    expect(out).not.toBeNull();
    expect(out).toContain(`speed: "30 ft., fly 60 ft."`);
  });

  it("quotes cr field containing / (fractional CR)", () => {
    const note = makeUnquotedNote({ cr: "1/4" });
    const out = applyCreature170(note);
    expect(out).not.toBeNull();
    expect(out).toContain(`cr: "1/4"`);
  });

  it("does not quote cr when it is a whole number", () => {
    const note = makeUnquotedNote({ cr: "5" });
    const out = applyCreature170(note);
    // The note still has other unquoted fields so out is not null,
    // but cr should remain unquoted.
    if (out !== null) {
      expect(out).toContain("cr: 5");
      expect(out).not.toContain(`cr: "5"`);
    }
  });

  it("quotes senses field containing commas", () => {
    const note = makeUnquotedNote({ senses: "darkvision 60 ft., passive Perception 14" });
    const out = applyCreature170(note);
    expect(out).not.toBeNull();
    expect(out).toContain(`senses: "darkvision 60 ft., passive Perception 14"`);
  });

  it("quotes languages field containing commas", () => {
    const note = makeUnquotedNote({ languages: "Common, Draconic" });
    const out = applyCreature170(note);
    expect(out).not.toBeNull();
    expect(out).toContain(`languages: "Common, Draconic"`);
  });

  it("sets template_version to 1.7.0", () => {
    const note = makeUnquotedNote();
    const out = applyCreature170(note);
    expect(out).not.toBeNull();
    expect(out).toContain("template_version: 1.7.0");
  });

  it("is idempotent — does not double-quote already-quoted fields", () => {
    // Start with an already-quoted note (simulate running the migration twice)
    const note = makeUnquotedNote();
    const firstPass = applyCreature170(note)!;
    expect(firstPass).not.toBeNull();
    // Second pass should be a no-op
    const secondPass = applyCreature170(firstPass);
    expect(secondPass).toBeNull();
  });

  it("returns null when all quotable fields are already quoted", () => {
    const alreadyQuotedNote = [
      "---",
      "statblock: true",
      "layout: Basic 5e Layout",
      "plugin_type: creature",
      "name: Acolyte",
      "size: Medium",
      "type: humanoid",
      `speed: "30 ft."`,
      `damage_vulnerabilities: ""`,
      `damage_resistances: ""`,
      `damage_immunities: ""`,
      `condition_immunities: ""`,
      `senses: "passive Perception 10"`,
      `languages: "any one language"`,
      `cr: "1/4"`,
      "template_version: 1.7.0",
      "source: D&D 5e SRD",
      "---",
      "",
      "```dnd-hub",
      "```",
      "",
    ].join("\n");
    expect(applyCreature170(alreadyQuotedNote)).toBeNull();
  });
});
