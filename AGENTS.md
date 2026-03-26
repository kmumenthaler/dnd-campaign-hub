# AI Agent Development Guide: D&D Campaign Hub

_Last updated: 2026-03-13_

## Quick Reference

- **Location**: `C:/Users/kevin/SynologyDrive/Plugins/dnd-campaign-hub`
- **Main branch**: `main`
- **Remote**: `https://github.com/kmumenthaler/dnd-campaign-hub.git`
- **Build**: Run `npm run check`, `npm run test`, then `npm run build`
- **Deploy Target**: `C:\Users\kevin\SynologyDrive\Obsidian Vault\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\`

---

## Feature Development Workflow

### 1. Create Feature Branch
```powershell
git checkout main
git pull
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes
- **Main code**: [src/main.ts](src/main.ts) (~25,000 lines)
- **Templates**: [src/templates.ts](src/templates.ts)
- **Migrations**: [src/migration/](src/migration/) (registry.ts, runner.ts, types.ts, frontmatter.ts)
- **Styles**: [src/styles.css](src/styles.css)

### 3. Validate and Build the Plugin
```powershell
npm run check
npm run test
npm run build
```
This creates `dist/main.js` and `dist/main.js.map`.

### 4. Deploy to Test Vault
```powershell
Copy-Item -Path "dist\main.js" -Destination "C:\Users\kevin\SynologyDrive\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\" -Force
Copy-Item -Path "manifest.json" -Destination "C:\Users\kevin\SynologyDrive\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\" -Force
Copy-Item -Path "src\styles.css" -Destination "C:\Users\kevin\SynologyDrive\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\" -Force
```

Or combine build and deploy:
```powershell
npm run check; npm run test; npm run build; Copy-Item -Path "dist\main.js" -Destination "C:\Users\kevin\SynologyDrive\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\" -Force
```

### 5. Test in Obsidian
Reload the plugin in Obsidian (Ctrl+P → "Reload app without saving") to see your changes.

### 6. Commit Your Changes
```powershell
git add .
git commit -m "feat: descriptive message

- Bullet point 1
- Bullet point 2"
```

---

## Working with Templates

### Template System Overview
Templates live in [src/templates.ts](src/templates.ts) and are exported as constants (e.g., `PC_TEMPLATE`, `NPC_TEMPLATE`). Each template has a version tracked in `TEMPLATE_VERSIONS` in [src/migration/types.ts](src/migration/types.ts).

Entity action buttons (Edit, Delete, etc.) are rendered at runtime via `dnd-hub` code blocks in each template. The plugin's `renderNoteActions()` method in [src/main.ts](src/main.ts) resolves buttons by frontmatter `type` — so button changes **never** require note migration.

### When You Modify a Template

**CRITICAL**: Always update both the template AND the migration logic.

#### Step 1: Update the Template in templates.ts
```typescript
export const PC_TEMPLATE = `---
type: player
template_version: 1.4.0  // ← INCREMENT THIS
name: 
...
---

# <% tp.frontmatter.name %>

\`\`\`dnd-hub
\`\`\`

<!-- Rest of template -->
`;
```

#### Step 2: Update TEMPLATE_VERSIONS in types.ts
```typescript
// src/migration/types.ts
export const TEMPLATE_VERSIONS: Record<string, string> = {
  // ... other templates
  pc: "1.4.0",      // ← MATCH THE TEMPLATE VERSION
  player: "1.4.0",  // ← Both pc and player use same template
  // ... other templates
};
```

#### Step 3: Add a MigrationStep in registry.ts
If your template change adds new content (not just button changes), register a new `MigrationStep` in `getAllMigrations()` inside [src/migration/registry.ts](src/migration/registry.ts):

```typescript
// src/migration/registry.ts — inside getAllMigrations()
{
  entityType: "player",
  targetVersion: "1.4.0",
  description: "Add new-field to PC notes",
  apply(content: string, ctx: MigrationContext): string | null {
    const fm = parseFrontmatter(content);
    if (!fm) return null;

    // Skip if already present
    if (fm.fields["new_field"] !== undefined) {
      return setFrontmatterField(content, "template_version", "1.4.0");
    }

    let out = content;
    out = addFrontmatterFieldAfter(out, "existing_field", "new_field", "default_value");
    out = setFrontmatterField(out, "template_version", "1.4.0");
    return out;
  },
},
```

**Key rules for MigrationStep.apply():**
- Receives the full file content as a string, returns the modified string (or `null` to skip).
- Must be **idempotent**: check if the change already exists before applying.
- Must call `setFrontmatterField(content, "template_version", targetVersion)` as the last step.
- Use helpers from `frontmatter.ts` (`parseFrontmatter`, `addFrontmatterField`, `insertAfterTitle`, etc.).
- Never use the Obsidian API — work only on the content string.

### Migration Best Practices
1. **Never lose user data** — Only add content, never remove/overwrite
2. **Check before inserting** — Always verify new content doesn't already exist (idempotent)
3. **Update version last** — Only bump `template_version` after all changes are applied
4. **Pure functions** — Migration steps are pure string transforms; file I/O is handled by `MigrationRunner`
5. **Backups** — `MigrationRunner` creates automatic backups in `.dnd-hub-backups/` before writing

---

## Adding Edit/Delete Functionality

This pattern is used for Items, Traps, PCs, and NPCs. Follow this checklist:

### 1. Add Edit Mode to Modal Class
```typescript
class EntityCreationModal extends Modal {
  // ... existing properties ...
  
  // Add these properties:
  isEdit = false;
  originalEntityPath = "";
  originalEntityName = "";

  constructor(app: App, plugin: Plugin, entityPath?: string) {
    super(app);
    this.plugin = plugin;
    if (entityPath) {
      this.isEdit = true;
      this.originalEntityPath = entityPath;
    }
  }
}
```

### 2. Add Data Loading Method
```typescript
async loadEntityData() {
  try {
    const file = this.app.vault.getAbstractFileByPath(this.originalEntityPath) as TFile;
    if (!file) {
      new Notice("Entity file not found!");
      return;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    
    if (cache?.frontmatter) {
      const fm = cache.frontmatter;
      this.entityName = fm.name || file.basename;
      this.originalEntityName = this.entityName;
      // ... load other fields ...
    }
  } catch (error) {
    console.error("Error loading entity data:", error);
    new Notice("Error loading entity data.");
  }
}
```

### 3. Load Data in onOpen()
```typescript
async onOpen() {
  const { contentEl } = this;
  contentEl.empty();

  // Load existing data if editing
  if (this.isEdit) {
    await this.loadEntityData();
  }

  contentEl.createEl("h2", { 
    text: this.isEdit ? "✏️ Edit Entity" : "Create New Entity" 
  });
  
  // ... build form with .setValue() calls ...
}
```

### 4. Pre-populate Form Fields
**CRITICAL**: Use `.setValue()` on all inputs:
```typescript
new Setting(contentEl)
  .setName("Entity Name")
  .addText((text) => {
    text
      .setPlaceholder("Name")
      .setValue(this.entityName)  // ← PRE-POPULATE
      .onChange((value) => {
        this.entityName = value;
      });
    if (!this.isEdit) text.inputEl.focus();  // Only focus when creating
  });
```

### 5. Handle Create/Update in Save Method
```typescript
async createEntityFile() {
  if (this.isEdit) {
    // EDIT MODE: Load existing file and modify it
    let entityFile = this.app.vault.getAbstractFileByPath(this.originalEntityPath) as TFile;
    
    // Handle rename if name changed
    if (this.entityName !== this.originalEntityName) {
      const folder = this.originalEntityPath.substring(0, this.originalEntityPath.lastIndexOf('/'));
      const newPath = `${folder}/${this.entityName}.md`;
      
      if (await this.app.vault.adapter.exists(newPath)) {
        new Notice(`An entity named "${this.entityName}" already exists!`);
        return;
      }
      
      await this.app.fileManager.renameFile(entityFile, newPath);
      filePath = newPath;
      entityFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
    }
    
    // Update file content
    await this.app.vault.modify(entityFile, newContent);
    new Notice(`✅ Entity "${this.entityName}" updated!`);
  } else {
    // CREATE MODE: Normal creation
    await this.app.vault.create(filePath, newContent);
    new Notice(`✅ Entity "${this.entityName}" created!`);
  }
}
```

### 6. Add Plugin Methods
```typescript
async editEntity(entityPath: string) {
  new EntityCreationModal(this.app, this, entityPath).open();
}
```

### 7. Register Commands
```typescript
this.addCommand({
  id: "edit-entity",
  name: "Edit Entity",
  callback: () => {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.type === "entity") {
        this.editEntity(file.path);
      } else {
        new Notice("This is not an entity note");
      }
    } else {
      new Notice("Please open an entity note first");
    }
  },
});

this.addCommand({
  id: "delete-entity",
  name: "Delete Entity",
  callback: async () => {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.type === "entity") {
        const entityName = cache.frontmatter.name || file.basename;
        const confirmed = await this.confirmDelete(file.name);
        if (confirmed) {
          // Delete associated resources (tokens, etc.)
          const tokenId = cache.frontmatter.token_id;
          if (tokenId) {
            await this.markerLibrary.deleteMarker(tokenId);
          }
          
          await this.app.vault.delete(file);
          new Notice(`✓ Entity "${entityName}" deleted`);
        }
      } else {
        new Notice("This is not an entity note");
      }
    }
  },
});
```

### 8. Add Buttons to Template
Add a `dnd-hub` code block to your template in [src/templates.ts](src/templates.ts) and register the buttons in `renderNoteActions()` in [src/main.ts](src/main.ts):
```typescript
// In templates.ts:
export const ENTITY_TEMPLATE = `---
type: entity
template_version: 1.2.0
---

# <% tp.frontmatter.name %>

\`\`\`dnd-hub
\`\`\`

<!-- Rest of template -->
`;

// In main.ts renderNoteActions() switch:
case "entity":
  createBtn("✏️ Edit Entity", "dnd-hub-btn-edit", cmd("edit-entity"));
  createBtn("🗑️ Delete Entity", "dnd-hub-btn-delete", cmd("delete-entity"));
  break;
```

---

## Project Structure

```
src/
├── main.ts               # Core plugin (~25,000 lines)
│                         # Contains: Plugin class, all modals, views, commands
│                         # Contains: renderNoteActions() for dnd-hub code blocks
├── templates.ts          # All template definitions (WORLD_TEMPLATE, NPC_TEMPLATE, etc.)
├── styles.css            # Plugin styles
├── map/                  # Battle map system
│   ├── MapManager.ts     # Map storage and CRUD
│   └── MapCreationModal.ts
├── marker/               # Token/marker system
│   ├── MarkerLibrary.ts  # Token storage
│   └── MarkerTypes.ts    # Type definitions
└── migration/            # Template migration system (registry-based)
    ├── index.ts           # Public exports
    ├── types.ts           # MigrationStep interface, TEMPLATE_VERSIONS
    ├── frontmatter.ts     # Content parsing/manipulation utilities
    ├── registry.ts        # MigrationRegistry + all migration definitions
    ├── runner.ts          # MigrationRunner (scan, backup, apply, write)
    └── MigrationModal.ts  # Migration UI
```

---

## Common Tasks

### Add a New Command
```typescript
this.addCommand({
  id: "your-command-id",
  name: "Display Name",
  callback: () => this.yourMethod(),
});
```

### Add a New Modal
```typescript
class YourModal extends Modal {
  plugin: DndCampaignHubPlugin;
  
  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl("h2", { text: "Your Modal" });
    
    // Add settings using Setting class
    new Setting(contentEl)
      .setName("Field Name")
      .addText((text) => text.onChange((value) => {
        // Handle change
      }));
  }
  
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

### Check for TypeScript Errors
Run strict typecheck directly:
```powershell
npm run check
```

---

## Git Workflow

### Standard Commit
```powershell
git add .
git commit -m "type: short description

- Detail 1
- Detail 2"
```

**Commit types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Merge Feature Branch
```powershell
git checkout main
git merge feature/your-feature-name
git push origin main
git branch -d feature/your-feature-name
```

---

## Testing Changes

1. Typecheck: `npm run check`
2. Unit tests: `npm run test`
3. Build: `npm run build`
4. Deploy to test vault (see deploy command above)
5. Reload Obsidian: Ctrl+P → "Reload app without saving"
6. Test your feature
7. Check browser console (Ctrl+Shift+I) for errors

---

## Key Patterns in This Codebase

### Modal Pattern
All creation/edit UIs extend Obsidian's `Modal` class. See `ItemCreationModal`, `NPCCreationModal`, etc.

### Entity Storage
- Notes stored as Markdown files with YAML frontmatter
- Tokens stored in plugin data via `MarkerLibrary`
- Maps stored as JSON in `maps/` folder

### Command Registration
All commands registered in `onload()` method of `DndCampaignHubPlugin` class.

### Settings
Settings use Obsidian's `Setting` class for form controls in modals.

---

## Current Template Versions

```typescript
TEMPLATE_VERSIONS = {
  world: "1.0.0",
  session: "1.4.0",      // party_id field
  npc: "1.4.0",          // dnd-hub render block
  pc: "1.3.0",           // dnd-hub render block
  player: "1.3.0",       // dnd-hub render block (same as pc)
  adventure: "1.3.0",    // dnd-hub render block
  scene: "2.3.0",        // dnd-hub render block
  faction: "1.1.0",      // dnd-hub render block
  item: "1.1.0",         // dnd-hub render block
  spell: "1.1.0",        // dnd-hub render block
  campaign: "1.1.0",     // party_id field
  trap: "1.2.0",         // dnd-hub render block
  creature: "1.3.0",     // dnd-hub render block
  "encounter-table": "1.2.0",  // dnd-hub render block
  "point-of-interest": "1.1.0" // dnd-hub render block
}
```

---

## Troubleshooting

**Build fails**: Check TypeScript syntax, ensure all imports are correct.

**Plugin doesn't reload**: Try restarting Obsidian completely.

**Changes not appearing**: Make sure you deployed the latest `dist/main.js`, not an old version.

**Migration not running**: Check template version numbers match in `src/templates.ts` and `src/migration/types.ts`.

---

_Update this file whenever workflow or patterns change significantly._
