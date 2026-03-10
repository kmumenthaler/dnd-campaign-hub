import { MigrationStep, MigrationContext } from "./types";
import { MarkerDefinition, CreatureSize } from "../marker/MarkerTypes";
import {
  compareVersions,
  addFrontmatterField,
  addFrontmatterFieldAfter,
  replaceDataviewjsBlock,
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
