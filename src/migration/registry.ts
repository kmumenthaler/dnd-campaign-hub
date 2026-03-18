import { MigrationStep, MigrationContext } from "./types";
import { MarkerDefinition, CreatureSize } from "../marker/MarkerTypes";
import {
  compareVersions,
  addFrontmatterField,
  addFrontmatterFieldAfter,
  setFrontmatterField,
  replaceDataviewjsBlock,
  removeAllDataviewjsBlocks,
  replaceDataviewTableBlocks,
  insertAfterTitle,
} from "./frontmatter";

// ─── Render block constant ─────────────────────────────────────────────────
const DND_HUB_BLOCK = "```dnd-hub\n```";

// ─── Shared helpers ─────────────────────────────────────────────────────────

async function createToken(
  ctx: MigrationContext,
  name: string,
  type: "player" | "npc" | "creature",
  size: CreatureSize = "medium",
): Promise<string> {
  const tokenId = ctx.markerLibrary.generateId();
  const iconMap: Record<string, { icon: string; bg: string }> = {
    player: { icon: "🛡️", bg: "#4a90d9" },
    npc: { icon: "👤", bg: "#6b8e23" },
    creature: { icon: "🐉", bg: "#8b0000" },
  };
  const cfg = iconMap[type] ?? iconMap.creature!;
  const now = Date.now();

  const def: MarkerDefinition = {
    id: tokenId,
    name,
    type,
    icon: cfg.icon,
    backgroundColor: cfg.bg,
    borderColor: "#ffffff",
    creatureSize: size,
    createdAt: now,
    updatedAt: now,
  };
  await ctx.markerLibrary.setMarker(def);
  return tokenId;
}

/**
 * Replace an inline dataviewjs button block with the slim `dnd-hub` render block.
 * `markerText` identifies which block to replace (e.g. "dnd-campaign-hub:edit-npc").
 * If no matching block is found, the render block is inserted after the title.
 */
function replaceButtonsWithRenderBlock(content: string, markerText: string): string {
  // Already has the render block — nothing to do
  if (content.includes("```dnd-hub")) return content;

  const replaced = replaceDataviewjsBlock(content, markerText, DND_HUB_BLOCK);
  if (replaced !== null) return replaced;

  // No existing button block found — insert after title
  return insertAfterTitle(content, DND_HUB_BLOCK);
}

function fileBasename(filePath: string): string {
  return filePath.split("/").pop()?.replace(".md", "") ?? "Unknown";
}

// ─── Migration Registry ─────────────────────────────────────────────────────

/**
 * Central registry for all migration steps.
 * Migrations are sorted by targetVersion per entity type.
 */
export class MigrationRegistry {
  private migrations: Map<string, MigrationStep[]> = new Map();

  /** Register a migration step. */
  register(step: MigrationStep): void {
    for (const type of step.entityTypes) {
      const list = this.migrations.get(type) ?? [];
      list.push(step);
      list.sort((a, b) => compareVersions(a.targetVersion, b.targetVersion));
      this.migrations.set(type, list);
    }
  }

  /** Register multiple steps at once. */
  registerAll(steps: MigrationStep[]): void {
    for (const step of steps) this.register(step);
  }

  /** Get all migrations that need to run for a given type and current version. */
  getApplicable(entityType: string, currentVersion: string): MigrationStep[] {
    const list = this.migrations.get(entityType) ?? [];
    return list.filter((m) => compareVersions(currentVersion, m.targetVersion) < 0);
  }

  /** Get the highest target version registered for a type. */
  getTargetVersion(entityType: string): string | null {
    const list = this.migrations.get(entityType);
    if (!list || list.length === 0) return null;
    return list[list.length - 1]!.targetVersion;
  }

  /** Get all registered entity types. */
  getEntityTypes(): string[] {
    return Array.from(this.migrations.keys());
  }
}

// ─── All Migration Definitions ──────────────────────────────────────────────

/**
 * Returns every migration step the plugin has ever shipped.
 * Steps are ordered by targetVersion within each entity type.
 */
export function getAllMigrations(): MigrationStep[] {
  return [
    // ── Player / PC ──────────────────────────────────────────────────────

    {
      id: "player-1.1.0",
      entityTypes: ["player", "pc"],
      targetVersion: "1.1.0",
      description: "Add map token for battle map integration",
      async apply(ctx: MigrationContext) {
        if (ctx.frontmatter.token_id) return null;
        const name = ctx.frontmatter.name || fileBasename(ctx.filePath);
        const tokenId = await createToken(ctx, name, "player");
        return addFrontmatterField(ctx.content, "token_id", tokenId);
      },
    },

    {
      id: "player-1.2.0",
      entityTypes: ["player", "pc"],
      targetVersion: "1.2.0",
      description: "Add edit/delete action buttons",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("dnd-campaign-hub:edit-pc")) return null;
        const buttonBlock = `\`\`\`dataviewjs
// Action buttons for PC management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit PC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-pc");
});
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete PC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-pc");
});
\`\`\``;
        return insertAfterTitle(ctx.content, buttonBlock);
      },
    },

    {
      id: "player-1.3.0",
      entityTypes: ["player", "pc"],
      targetVersion: "1.3.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-pc");
      },
    },

    {
      id: "player-1.4.0",
      entityTypes: ["player", "pc"],
      targetVersion: "1.4.0",
      description: "Add Fantasy Statblock section to PC notes",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;
        const pcName = ctx.frontmatter.name || fileBasename(ctx.filePath);

        out = addFrontmatterField(out, "statblock", "true");
        out = addFrontmatterField(out, "layout", "Basic 5e Layout");

        if (!out.includes("```statblock\ncreature:")) {
          const block = `## Fantasy Statblock\n\n\`\`\`statblock\ncreature: ${pcName}\n\`\`\``;
          if (/^## Background/m.test(out)) {
            out = out.replace(/^## Background/m, `${block}\n\n## Background`);
          } else if (/^## Equipment & Inventory/m.test(out)) {
            out = out.replace(/^## Equipment & Inventory/m, `${block}\n\n## Equipment & Inventory`);
          } else {
            out = `${out.trimEnd()}\n\n${block}\n`;
          }
        }

        return setFrontmatterField(out, "template_version", "1.4.0");
      },
    },

    {
      id: "player-1.5.0",
      entityTypes: ["player", "pc"],
      targetVersion: "1.5.0",
      description: "Replace static Quick Stats callout with live dnd-hub-view block",
      async apply(ctx: MigrationContext) {
        // Already migrated — the dynamic view block is present
        if (ctx.content.includes("```dnd-hub-view\npc-quick-stats")) return null;

        let out = ctx.content;

        // Replace the static Quick Stats callout block with the dynamic view block.
        // The callout spans multiple lines; match greedily from the opening `> [!info] Quick Stats`
        // line through the last consecutive `>` line in the block.
        const staticCallout = /^> \[!info\] Quick Stats\n(?:>.*\n)*/m;
        const dynamicBlock = "```dnd-hub-view\npc-quick-stats\n```\n";

        if (staticCallout.test(out)) {
          out = out.replace(staticCallout, dynamicBlock);
        } else {
          // No static callout found — insert the view block after the dnd-hub render block
          // (or after the title if no render block exists) to avoid content loss.
          const afterRenderBlock = /^```dnd-hub\n```\n/m;
          if (afterRenderBlock.test(out)) {
            out = out.replace(afterRenderBlock, "```dnd-hub\n```\n\n" + dynamicBlock);
          } else {
            out = insertAfterTitle(out, dynamicBlock.trimEnd());
          }
        }

        // Collapse any triple-blank-line runs introduced by the replacement
        out = out.replace(/\n{3,}/g, "\n\n");

        return setFrontmatterField(out, "template_version", "1.5.0");
      },
    },

    // ── NPC ──────────────────────────────────────────────────────────────

    {
      id: "npc-1.1.0",
      entityTypes: ["npc"],
      targetVersion: "1.1.0",
      description: "Add map token for battle map integration",
      async apply(ctx: MigrationContext) {
        if (ctx.frontmatter.token_id) return null;
        const name = ctx.frontmatter.name || fileBasename(ctx.filePath);
        const tokenId = await createToken(ctx, name, "npc");
        return addFrontmatterField(ctx.content, "token_id", tokenId);
      },
    },

    {
      id: "npc-1.2.0",
      entityTypes: ["npc"],
      targetVersion: "1.2.0",
      description: "Add edit/delete action buttons",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("dnd-campaign-hub:edit-npc")) return null;
        const buttonBlock = `\`\`\`dataviewjs
// Action buttons for NPC management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit NPC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-npc");
});
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete NPC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-npc");
});
\`\`\``;
        return insertAfterTitle(ctx.content, buttonBlock);
      },
    },

    {
      id: "npc-1.3.0",
      entityTypes: ["npc"],
      targetVersion: "1.3.0",
      description: "Add Manage Statblock button",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("⚔️ Manage Statblock")) return null;
        // Append statblock button into existing dataviewjs block
        const marker = `app.commands.executeCommandById("dnd-campaign-hub:delete-npc");\n});`;
        const replacement = `app.commands.executeCommandById("dnd-campaign-hub:delete-npc");\n});\n\nconst statblockBtn = buttonContainer.createEl("button", { \n  text: "⚔️ Manage Statblock",\n  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }\n});\nstatblockBtn.addEventListener("click", () => {\n  app.commands.executeCommandById("dnd-campaign-hub:edit-npc");\n});`;
        if (ctx.content.includes(marker)) {
          return ctx.content.replace(marker, replacement);
        }
        return null;
      },
    },

    {
      id: "npc-1.4.0",
      entityTypes: ["npc"],
      targetVersion: "1.4.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-npc");
      },
    },

    // ── Creature ─────────────────────────────────────────────────────────

    {
      id: "creature-1.2.0",
      entityTypes: ["creature"],
      targetVersion: "1.2.0",
      description: "Add map token with creature size",
      async apply(ctx: MigrationContext) {
        if (ctx.frontmatter.token_id) return null;
        const name = ctx.frontmatter.name || fileBasename(ctx.filePath);
        const sizeMap: Record<string, CreatureSize> = {
          Tiny: "tiny", Small: "small", Medium: "medium",
          Large: "large", Huge: "huge", Gargantuan: "gargantuan",
        };
        const size: CreatureSize = sizeMap[ctx.frontmatter.size ?? ""] ?? "medium";
        const tokenId = await createToken(ctx, name, "creature", size);
        return addFrontmatterField(ctx.content, "token_id", tokenId);
      },
    },

    {
      id: "creature-1.3.0",
      entityTypes: ["creature"],
      targetVersion: "1.3.0",
      description: "Add dynamic render block for entity actions",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub")) return null;
        return insertAfterTitle(ctx.content, DND_HUB_BLOCK);
      },
    },

    {
      id: "creature-1.4.0",
      entityTypes: ["creature"],
      targetVersion: "1.4.0",
      description: "Add plugin_type: creature field so SRD notes are identified as creature entities",
      async apply(ctx: MigrationContext) {
        if (/^plugin_type:/m.test(ctx.content)) return null;
        // Insert plugin_type before name (or at end of frontmatter if no name field)
        const match = ctx.content.match(/^---\n([\s\S]*?)\n---/);
        if (!match || match[1] === undefined) return null;
        let fm = match[1];
        // Insert after layout: if present, otherwise before name:, otherwise append
        if (/^layout:/m.test(fm)) {
          fm = fm.replace(/^(layout:\s*.+)$/m, "$1\nplugin_type: creature");
        } else if (/^name:/m.test(fm)) {
          fm = fm.replace(/^(name:\s*.+)$/m, "plugin_type: creature\n$1");
        } else {
          fm = `${fm}\nplugin_type: creature`;
        }
        return ctx.content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
      },
    },

    {
      id: "creature-1.5.0",
      entityTypes: ["creature"],
      targetVersion: "1.5.0",
      description: "Replace inline dataviewjs buttons with dnd-hub render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-creature");
      },
    },

    {
      id: "creature-1.6.0",
      entityTypes: ["creature"],
      targetVersion: "1.6.0",
      description: "Strip leftover dataviewjs blocks and clean up stray characters from creature notes",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;
        const original = out;

        // 1. Remove any remaining dataviewjs blocks.
        // creature-1.5.0 was a no-op on notes that already had a dnd-hub block
        // (inserted by creature-1.3.0), so the dataviewjs block was never removed.
        if (out.includes("```dataviewjs")) {
          const stripped = removeAllDataviewjsBlocks(out);
          if (stripped !== null) out = stripped;
        }

        // 2. Ensure a dnd-hub render block exists (in case a note somehow lost it).
        if (!out.includes("```dnd-hub")) {
          out = insertAfterTitle(out, DND_HUB_BLOCK);
        }

        // 3. Remove stray single-character lines that appear between a closing
        //    code fence (```) and an image embed (![[). These are artifacts of
        //    the old insertAfterTitle logic that left a dangling character.
        //    The pattern is: end of code block fence line, optional blank lines,
        //    a lone non-whitespace single character on its own line, then image.
        out = out.replace(/(```\n)\n*([^\s`\n!])\n(?=!?\[\[)/g, "$1\n");

        // 4. Collapse 3+ consecutive blank lines down to 2.
        out = out.replace(/\n{3,}/g, "\n\n");

        if (out === original) return null;

        return setFrontmatterField(out, "template_version", "1.6.0");
      },
    },

    {
      id: "creature-1.7.0",
      entityTypes: ["creature"],
      targetVersion: "1.7.0",
      description: "Quote special-character frontmatter fields (speed, senses, languages, damage_*, cr) so YAML parses them correctly",
      async apply(ctx: MigrationContext) {
        /**
         * Fields that should always be quoted when non-empty.
         * These often contain commas, colons, or other YAML-special chars.
         */
        const ALWAYS_QUOTE = [
          "speed",
          "senses",
          "languages",
          "damage_vulnerabilities",
          "damage_resistances",
          "damage_immunities",
          "condition_immunities",
        ] as const;

        let out = ctx.content;
        let changed = false;

        for (const field of ALWAYS_QUOTE) {
          const match = out.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
          const rawValue = match?.[1]?.trim() ?? "";
          if (!rawValue) continue; // empty — skip
          const alreadyQuoted = rawValue.startsWith('"') || rawValue.startsWith("'");
          if (alreadyQuoted) continue;
          // Quote the value, escaping any embedded double-quotes
          const escaped = rawValue.replace(/"/g, '\\"');
          out = out.replace(
            new RegExp(`^(${field}:\\s*)(.+)$`, "m"),
            `$1"${escaped}"`,
          );
          changed = true;
        }

        // cr: only quote if the value contains '/' (fractional CRs like 1/4, 1/2, 1/8)
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
      },
    },

    {
      id: "creature-1.8.0",
      entityTypes: ["creature"],
      targetVersion: "1.8.0",
      description: "Repair broken YAML: fix quoted field-name lines, set empty damage/condition fields to \"\", empty list fields to []",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;
        let changed = false;

        // Fix A — Repair lines like `"damage_resistances:"` (a double-quoted YAML key
        // with colon but no value) — a regression introduced by creature-1.7.0.
        // Replace them with proper empty-value fields: `damage_resistances: ""`
        const brokenFieldRegex = /^"([a-z_]+):"$/gm;
        if (brokenFieldRegex.test(out)) {
          out = out.replace(/^"([a-z_]+):"$/gm, '$1: ""');
          changed = true;
        }

        // Fix B — Set empty damage/condition fields to ""
        // These fields must always have a quoted empty string, never bare null.
        const emptyStringFields = [
          "damage_vulnerabilities",
          "damage_resistances",
          "damage_immunities",
          "condition_immunities",
        ];
        for (const field of emptyStringFields) {
          const emptyFieldRegex = new RegExp(`^(${field}:)\\s*$`, "m");
          if (emptyFieldRegex.test(out)) {
            out = out.replace(emptyFieldRegex, `$1 ""`);
            changed = true;
          }
        }

        // Fix C — Set empty list fields to []
        // These fields should be empty arrays, not bare null values.
        // Use a negative lookahead to skip fields that already have indented list items
        // on the following line (which would be a valid populated YAML list).
        const emptyListFields = [
          "saves",
          "spells",
          "legendary_actions",
          "bonus_actions",
          "reactions",
        ];
        for (const field of emptyListFields) {
          // Match field: with no value AND not followed by a line starting with whitespace
          // (indented list items). The (?!\n[ \t]) lookahead prevents matching populated lists.
          const emptyFieldRegex = new RegExp(`^(${field}:)[ \\t]*$(?!\\n[ \\t])`, "m");
          if (emptyFieldRegex.test(out)) {
            out = out.replace(emptyFieldRegex, `$1 []`);
            changed = true;
          }
        }

        if (!changed) return null;

        return setFrontmatterField(out, "template_version", "1.8.0");
      },
    },

    {
      id: "creature-1.9.0",
      entityTypes: ["creature"],
      targetVersion: "1.9.0",
      description: "Repair fields where the entire 'fieldname: value' line was wrapped in quotes by creature-1.7.0",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;
        let changed = false;

        // creature-1.7.0 introduced a regression where some non-empty fields
        // had their entire line wrapped in double quotes instead of just the
        // value. Examples of broken lines:
        //   "damage_resistances: cold, lightning, ..."
        //   "senses: \"darkvision 120 ft., ...\""
        //   "cr: 30"
        //
        // Match any top-level line that is a quoted string looking like
        // "fieldname: optional_value". Extract fieldname and value, unescape
        // inner quotes, and rewrite as proper YAML.
        const brokenLineRegex = /^"([a-z][a-z_]*):\s*((?:\\"|[^"])*)"$/gm;

        if (brokenLineRegex.test(out)) {
          // Reset lastIndex after test()
          brokenLineRegex.lastIndex = 0;
          out = out.replace(brokenLineRegex, (_match, fieldName: string, rawValue: string) => {
            // Unescape \" → "
            let value = rawValue.replace(/\\"/g, '"');
            // Strip outer quotes from double-quoting: "value" → value
            if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
              value = value.slice(1, -1);
            }
            if (!value) return `${fieldName}: ""`;
            // Re-quote if the value contains YAML-special characters
            if (/[,:#{}\[\]&*!|>'"%@`]/.test(value) || value.includes("\\")) {
              const escaped = value.replace(/"/g, '\\"');
              return `${fieldName}: "${escaped}"`;
            }
            return `${fieldName}: ${value}`;
          });
          changed = true;
        }

        if (!changed) return null;

        return setFrontmatterField(out, "template_version", "1.9.0");
      },
    },

    // ── Scene ────────────────────────────────────────────────────────────

    {
      id: "scene-2.1.0",
      entityTypes: ["scene"],
      targetVersion: "2.1.0",
      description: "Add edit/delete action buttons",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("dnd-campaign-hub:edit-scene")) return null;
        const buttonBlock = `\`\`\`dataviewjs
// Action buttons for scene management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Scene",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-scene");
});
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Scene",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-scene");
});
\`\`\``;
        return insertAfterTitle(ctx.content, buttonBlock);
      },
    },

    {
      id: "scene-2.2.0",
      entityTypes: ["scene"],
      targetVersion: "2.2.0",
      description: "Add sessions[] backlink field to frontmatter",
      async apply(ctx: MigrationContext) {
        if (/^sessions:/m.test(ctx.content)) return null;
        return ctx.content.replace(
          /^(status:.*)(\n)/m,
          `$1$2sessions: []\n`,
        );
      },
    },

    {
      id: "scene-2.3.0",
      entityTypes: ["scene"],
      targetVersion: "2.3.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-scene");
      },
    },

    // ── Session ──────────────────────────────────────────────────────────

    {
      id: "session-1.3.0",
      entityTypes: ["session"],
      targetVersion: "1.3.0",
      description: "Add starting_scene and ending_scene fields",
      async apply(ctx: MigrationContext) {
        let content = ctx.content;
        if (!/^starting_scene:/m.test(content)) {
          content = content.replace(
            /^(adventure:.*)(\n)/m,
            `$1$2starting_scene: ""\nending_scene: ""\n`,
          );
        }
        return content !== ctx.content ? content : null;
      },
    },

    {
      id: "session-1.4.0",
      entityTypes: ["session"],
      targetVersion: "1.4.0",
      description: "Add party_id field",
      async apply(ctx: MigrationContext) {
        if (/^party_id:/m.test(ctx.content)) return null;
        return addFrontmatterField(ctx.content, "party_id", '""');
      },
    },

    {
      id: "session-1.5.0",
      entityTypes: ["session"],
      targetVersion: "1.5.0",
      description: "Replace Dataview scene navigator with native dnd-hub-view block",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub-view")) return null;
        const replacement = "```dnd-hub-view\nscene-navigator\n```";
        const replaced = replaceDataviewjsBlock(ctx.content, "Session Scene Navigator", replacement)
                      ?? replaceDataviewjsBlock(ctx.content, "sessionFile.adventure", replacement);
        if (!replaced) return null;
        return setFrontmatterField(replaced, "template_version", "1.5.0");
      },
    },

    // ── Adventure ────────────────────────────────────────────────────────

    {
      id: "adventure-1.2.0",
      entityTypes: ["adventure"],
      targetVersion: "1.2.0",
      description: "Add edit/delete buttons and adventure context passing",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("dnd-campaign-hub:edit-adventure")) return null;
        const buttonBlock = `\`\`\`dataviewjs
const adventurePath = dv.current().file.path;
const plugin = app.plugins.plugins['dnd-campaign-hub'];

const sceneButton = dv.el('button', '🎬 Create New Scene');
sceneButton.className = 'mod-cta';
sceneButton.onclick = () => {
  new plugin.SceneCreationModal(app, plugin, adventurePath).open();
};

const trapButton = dv.el('button', '🪤 Create New Trap', { cls: 'mod-cta' });
trapButton.style.marginLeft = '10px';
trapButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:create-trap');
};

const sessionButton = dv.el('button', '📜 Create Session', { cls: 'mod-cta' });
sessionButton.style.marginLeft = '10px';
sessionButton.onclick = async () => {
  new plugin.SessionCreationModal(app, plugin, adventurePath).open();
};

const editButton = dv.el('button', '✏️ Edit Adventure');
editButton.style.marginLeft = '10px';
editButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:edit-adventure');
};

const deleteButton = dv.el('button', '🗑️ Delete Adventure');
deleteButton.style.marginLeft = '10px';
deleteButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:delete-adventure');
};
\`\`\``;

        const replaced = replaceDataviewjsBlock(ctx.content, "Create New Scene", buttonBlock);
        if (replaced !== null) return replaced;
        return insertAfterTitle(ctx.content, buttonBlock);
      },
    },

    {
      id: "adventure-1.3.0",
      entityTypes: ["adventure"],
      targetVersion: "1.3.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-adventure");
      },
    },

    {
      id: "adventure-1.4.0",
      entityTypes: ["adventure"],
      targetVersion: "1.4.0",
      description: "Replace Dataview scene list with native dnd-hub-view block",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub-view")) return null;
        const replacement = "```dnd-hub-view\nadventure-scenes\n```";
        const replaced = replaceDataviewjsBlock(ctx.content, "Get all scenes for this adventure", replacement)
                      ?? replaceDataviewjsBlock(ctx.content, "adventureFolder", replacement);
        if (!replaced) return null;
        return setFrontmatterField(replaced, "template_version", "1.4.0");
      },
    },

    // ── Campaign ─────────────────────────────────────────────────────────

    {
      id: "campaign-1.1.0",
      entityTypes: ["campaign"],
      targetVersion: "1.1.0",
      description: "Add party_id field",
      async apply(ctx: MigrationContext) {
        if (/^party_id:/m.test(ctx.content)) return null;
        return addFrontmatterField(ctx.content, "party_id", '""');
      },
    },

    // ── Encounter Table ──────────────────────────────────────────────────

    {
      id: "encounter-table-1.1.0",
      entityTypes: ["encounter-table"],
      targetVersion: "1.1.0",
      description: "Add edit/delete/reroll buttons",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("dnd-campaign-hub:edit-encounter-table")) return null;
        const buttonBlock = `\`\`\`dataviewjs
// Action buttons for Encounter Table
const buttonContainer = dv.el("div", "", {
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" }
});
const rollBtn = buttonContainer.createEl("button", {
  text: "🎲 Roll Encounter",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
rollBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:roll-random-encounter");
});
const regenBtn = buttonContainer.createEl("button", {
  text: "🔄 Regenerate Table",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
regenBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:create-random-encounter-table");
});
const editBtn = buttonContainer.createEl("button", {
  text: "✏️ Edit Table",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-encounter-table");
});
const deleteBtn = buttonContainer.createEl("button", {
  text: "🗑️ Delete Table",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-encounter-table");
});
\`\`\``;
        const replaced = replaceDataviewjsBlock(ctx.content, "Action buttons for Encounter Table", buttonBlock);
        if (replaced !== null) return replaced;
        return insertAfterTitle(ctx.content, buttonBlock);
      },
    },

    {
      id: "encounter-table-1.2.0",
      entityTypes: ["encounter-table"],
      targetVersion: "1.2.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-encounter-table");
      },
    },

    {
      id: "encounter-table-1.3.0",
      entityTypes: ["encounter-table"],
      targetVersion: "1.3.0",
      description: "Replace remaining Dataview buttons with dnd-hub render block",
      async apply(ctx: MigrationContext) {
        // Some encounter-table notes still have dataviewjs blocks after 1.2.0
        if (ctx.content.includes("```dnd-hub") && !ctx.content.includes("```dataviewjs")) return null;
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:roll-random-encounter");
      },
    },

    // ── Encounter ────────────────────────────────────────────────────────

    {
      id: "encounter-1.1.0",
      entityTypes: ["encounter"],
      targetVersion: "1.1.0",
      description: "Replace Dataview encounter blocks with native dnd-hub render and view blocks",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;

        // Replace dataviewjs action buttons with dnd-hub render block
        if (!out.includes("```dnd-hub")) {
          const replaced = replaceDataviewjsBlock(out, "dnd-campaign-hub:open-combat-tracker", DND_HUB_BLOCK)
                        ?? replaceDataviewjsBlock(out, "dnd-campaign-hub:edit-encounter", DND_HUB_BLOCK);
          if (replaced) {
            out = replaced;
          } else {
            out = insertAfterTitle(out, DND_HUB_BLOCK);
          }
        }

        // Replace Difficulty Analysis dataviewjs
        const diffReplaced = replaceDataviewjsBlock(out, "dv.current().difficulty", "```dnd-hub-view\nencounter-difficulty\n```");
        if (diffReplaced) out = diffReplaced;

        // Replace Creatures table dataviewjs
        const creaturesReplaced = replaceDataviewjsBlock(out, "dv.current().creatures", "```dnd-hub-view\nencounter-creatures\n```");
        if (creaturesReplaced) out = creaturesReplaced;

        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.1.0");
      },
    },

    {
      id: "encounter-1.2.0",
      entityTypes: ["encounter"],
      targetVersion: "1.2.0",
      description: "Strip remaining dataviewjs blocks and ensure native encounter views exist",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;

        // Already fully migrated
        if (out.includes("```dnd-hub") && !out.includes("```dataviewjs")) return null;

        // Strip ALL remaining dataviewjs blocks
        const stripped = removeAllDataviewjsBlocks(out);
        if (stripped) out = stripped;

        // Ensure dnd-hub render block exists
        if (!out.includes("```dnd-hub")) {
          out = insertAfterTitle(out, DND_HUB_BLOCK);
        }

        // Ensure encounter-difficulty view exists
        if (!out.includes("encounter-difficulty")) {
          const diffHeader = /^(## .*Difficulty.*$)/m;
          if (diffHeader.test(out)) {
            out = out.replace(diffHeader, "$1\n\n```dnd-hub-view\nencounter-difficulty\n```");
          }
        }

        // Ensure encounter-creatures view exists
        if (!out.includes("encounter-creatures")) {
          const creaturesHeader = /^(## .*Creatures.*$)/m;
          if (creaturesHeader.test(out)) {
            out = out.replace(creaturesHeader, "$1\n\n```dnd-hub-view\nencounter-creatures\n```");
          }
        }

        // Collapse runs of 3+ blank lines left by removed/inserted blocks
        out = out.replace(/\n{3,}/g, "\n\n");

        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.2.0");
      },
    },

    // ── Trap ─────────────────────────────────────────────────────────────

    {
      id: "trap-1.2.0",
      entityTypes: ["trap"],
      targetVersion: "1.2.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-trap");
      },
    },

    {
      id: "trap-1.3.0",
      entityTypes: ["trap"],
      targetVersion: "1.3.0",
      description: "Replace Dataview trap views with native dnd-hub-view blocks",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;
        if (out.includes("```dnd-hub-view")) return null;

        const elemReplaced = replaceDataviewjsBlock(out, "dv.current().elements", "```dnd-hub-view\ntrap-elements\n```");
        if (elemReplaced) out = elemReplaced;

        const cmReplaced = replaceDataviewjsBlock(out, "dv.current().countermeasures", "```dnd-hub-view\ntrap-countermeasures\n```");
        if (cmReplaced) out = cmReplaced;

        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.3.0");
      },
    },

    {
      id: "trap-1.3.1",
      entityTypes: ["trap"],
      targetVersion: "1.3.1",
      description: "Normalize trap template body and bump version",
      async apply(ctx: MigrationContext) {
        // Legacy generated notes may contain an accidental standalone '5'
        // after the Session History helper text.
        let out = ctx.content.replace(
          /(\*Record when this trap was encountered and what happened\*\r?\n)5\r?\n/,
          "$1",
        );

        if (out === ctx.content) {
          // No content changes needed; still advance version target.
          return setFrontmatterField(ctx.content, "template_version", "1.3.1");
        }

        return setFrontmatterField(out, "template_version", "1.3.1");
      },
    },

    // ── Item ─────────────────────────────────────────────────────────────

    {
      id: "item-1.1.0",
      entityTypes: ["item"],
      targetVersion: "1.1.0",
      description: "Add dynamic render block for entity actions",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub")) return null;
        return insertAfterTitle(ctx.content, DND_HUB_BLOCK);
      },
    },

    {
      id: "item-1.2.0",
      entityTypes: ["item"],
      targetVersion: "1.2.0",
      description: "Strip remaining dataviewjs blocks from item notes",
      async apply(ctx: MigrationContext) {
        if (!ctx.content.includes("```dataviewjs")) return null;
        let out = removeAllDataviewjsBlocks(ctx.content) ?? ctx.content;
        out = out.replace(/\n{3,}/g, "\n\n");
        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.2.0");
      },
    },

    // ── Spell ────────────────────────────────────────────────────────────

    {
      id: "spell-1.1.0",
      entityTypes: ["spell"],
      targetVersion: "1.1.0",
      description: "Add dynamic render block for entity actions",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub")) return null;
        return insertAfterTitle(ctx.content, DND_HUB_BLOCK);
      },
    },

    {
      id: "spell-1.2.0",
      entityTypes: ["spell"],
      targetVersion: "1.2.0",
      description: "Strip remaining dataviewjs blocks from spell notes",
      async apply(ctx: MigrationContext) {
        if (!ctx.content.includes("```dataviewjs")) return null;
        let out = removeAllDataviewjsBlocks(ctx.content) ?? ctx.content;
        out = out.replace(/\n{3,}/g, "\n\n");
        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.2.0");
      },
    },

    // ── Faction ──────────────────────────────────────────────────────────

    {
      id: "faction-1.1.0",
      entityTypes: ["faction"],
      targetVersion: "1.1.0",
      description: "Add dynamic render block for entity actions",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub")) return null;
        return insertAfterTitle(ctx.content, DND_HUB_BLOCK);
      },
    },

    {
      id: "faction-1.2.0",
      entityTypes: ["faction"],
      targetVersion: "1.2.0",
      description: "Strip remaining dataviewjs blocks from faction notes",
      async apply(ctx: MigrationContext) {
        if (!ctx.content.includes("```dataviewjs")) return null;
        let out = removeAllDataviewjsBlocks(ctx.content) ?? ctx.content;
        out = out.replace(/\n{3,}/g, "\n\n");
        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.2.0");
      },
    },

    // ── Point of Interest ────────────────────────────────────────────────

    {
      id: "poi-1.1.0",
      entityTypes: ["point-of-interest"],
      targetVersion: "1.1.0",
      description: "Replace inline buttons with dynamic render block",
      async apply(ctx: MigrationContext) {
        return replaceButtonsWithRenderBlock(ctx.content, "dnd-campaign-hub:edit-poi");
      },
    },

    {
      id: "poi-1.2.0",
      entityTypes: ["point-of-interest"],
      targetVersion: "1.2.0",
      description: "Strip remaining dataviewjs blocks from POI notes",
      async apply(ctx: MigrationContext) {
        if (!ctx.content.includes("```dataviewjs")) return null;
        let out = removeAllDataviewjsBlocks(ctx.content) ?? ctx.content;
        out = out.replace(/\n{3,}/g, "\n\n");
        if (out === ctx.content) return null;
        return setFrontmatterField(out, "template_version", "1.2.0");
      },
    },

    // ── World ────────────────────────────────────────────────────────────

    {
      id: "world-1.1.0",
      entityTypes: ["world"],
      targetVersion: "1.1.0",
      description: "Replace Buttons-plugin button blocks with dynamic render block",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;

        // Remove all ```button ... ``` blocks (Buttons plugin format)
        out = out.replace(/```button\n[\s\S]*?```\n*/g, "");

        // Remove leftover ^button-* block IDs
        out = out.replace(/^\^button-[\w-]+\n*/gm, "");

        // Insert the dnd-hub render block after the title if not already present
        if (!out.includes("```dnd-hub")) {
          out = insertAfterTitle(out, DND_HUB_BLOCK);
        }

        // Collapse runs of 3+ blank lines left by removals
        out = out.replace(/\n{3,}/g, "\n\n");

        out = setFrontmatterField(out, "template_version", "1.1.0");
        return out;
      },
    },

    {
      id: "world-1.2.0",
      entityTypes: ["world"],
      targetVersion: "1.2.0",
      description: "Remove leftover ^button-* block IDs from world notes",
      async apply(ctx: MigrationContext) {
        let out = ctx.content;

        // Remove leftover ^button-* block IDs
        out = out.replace(/^\^button-[\w-]+\n*/gm, "");

        // Collapse runs of 3+ blank lines
        out = out.replace(/\n{3,}/g, "\n\n");

        if (out === ctx.content) return null;

        out = setFrontmatterField(out, "template_version", "1.2.0");
        return out;
      },
    },

    {
      id: "world-1.3.0",
      entityTypes: ["world"],
      targetVersion: "1.3.0",
      description: "Replace Dataview TABLE blocks with native dnd-hub-table blocks",
      async apply(ctx: MigrationContext) {
        if (ctx.content.includes("```dnd-hub-table")) return null;

        const replaced = replaceDataviewTableBlocks(ctx.content);
        if (!replaced) return null;

        return setFrontmatterField(replaced, "template_version", "1.3.0");
      },
    },
  ];
}

/**
 * Create a fully populated MigrationRegistry with all known migrations.
 */
export function createMigrationRegistry(): MigrationRegistry {
  const registry = new MigrationRegistry();
  registry.registerAll(getAllMigrations());
  return registry;
}
