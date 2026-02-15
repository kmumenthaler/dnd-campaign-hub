# AI Agent Development Guide: D&D Campaign Hub

_Last updated: 2026-02-15_

## Quick Reference

- **Location**: `C:/Users/kevin/SynologyDrive/Plugins/dnd-campaign-hub`
- **Main branch**: `main`
- **Remote**: `https://github.com/kmumenthaler/dnd-campaign-hub.git`
- **Build**: Use Node from `../nodejs/node.exe` (portable Node installation)
- **Deploy Target**: `C:\Users\kevin\SynologyDrive\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\`

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
- **Migrations**: [src/migration/MigrationManager.ts](src/migration/MigrationManager.ts)
- **Styles**: [src/styles.css](src/styles.css)

### 3. Build the Plugin
```powershell
..\nodejs\node.exe esbuild.config.mjs
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
..\nodejs\node.exe esbuild.config.mjs; Copy-Item -Path "dist\main.js" -Destination "C:\Users\kevin\SynologyDrive\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\" -Force
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
Templates live in [src/templates.ts](src/templates.ts) and are exported as constants (e.g., `PC_TEMPLATE`, `NPC_TEMPLATE`). Each template has a version tracked in [src/migration/MigrationManager.ts](src/migration/MigrationManager.ts).

### When You Modify a Template

**CRITICAL**: Always update both the template AND the migration logic.

#### Step 1: Update the Template in templates.ts
```typescript
export const PC_TEMPLATE = `---
type: player
template_version: 1.2.0  // ← INCREMENT THIS
name: 
...
---

# <% tp.frontmatter.name %>

\`\`\`dataviewjs
// Your new button or content here
\`\`\`
```

#### Step 2: Update TEMPLATE_VERSIONS in MigrationManager.ts
```typescript
export const TEMPLATE_VERSIONS = {
  // ... other templates
  pc: "1.2.0",      // ← MATCH THE TEMPLATE VERSION
  player: "1.2.0",  // ← Both pc and player use same template
  // ... other templates
};
```

#### Step 3: Add Migration Logic (if needed)
If your template change adds new content (not just frontmatter), add a migration method:

```typescript
/**
 * Migrate PC to v1.2.0 (add edit/delete buttons)
 */
async migratePCTo1_2_0(file: TFile): Promise<void> {
  console.log(`Migrating PC ${file.path} to v1.2.0`);

  const content = await this.app.vault.read(file);
  
  // Check if new content already exists
  if (content.includes("your-new-content-marker")) {
    console.log(`PC ${file.path} already has new content`);
    await this.updateTemplateVersion(file, "1.2.0");
    return;
  }
  
  // Insert new content
  const newBlock = `your new template content here`;
  
  // Find insertion point and modify file
  // ... your insertion logic ...
  
  await this.updateTemplateVersion(file, "1.2.0");
  console.log(`PC ${file.path} migrated to v1.2.0`);
}
```

#### Step 4: Wire Up Migration in migrateFile()
```typescript
async migrateFile(file: TFile): Promise<boolean> {
  // ... existing code ...
  
  if (fileType === "player" || fileType === "pc") {
    // ... existing version checks ...
    
    // Add your new version check
    if (this.compareVersions(currentVersion, "1.2.0") < 0) {
      await this.migratePCTo1_2_0(file);
      return true;
    }
  }
  
  // ... rest of method ...
}
```

### Migration Best Practices
1. **Never lose user data** - Only add content, never remove/overwrite
2. **Check before inserting** - Always verify new content doesn't already exist
3. **Update version last** - Only bump template_version after successful migration
4. **Test incrementally** - Migrations should work from any previous version (e.g., 1.0.0 → 1.1.0 → 1.2.0)

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
Add to your template in [src/templates.ts](src/templates.ts):
```typescript
export const ENTITY_TEMPLATE = `---
type: entity
template_version: 1.2.0
---

# <% tp.frontmatter.name %>

\`\`\`dataviewjs
// Action buttons for entity management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Entity",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-entity");
});

// Delete button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Entity",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-entity");
});
\`\`\`

<!-- Rest of template -->
`;
```

---

## Project Structure

```
src/
├── main.ts               # Core plugin (~25,000 lines)
│                         # Contains: Plugin class, all modals, views, commands
├── templates.ts          # All template definitions (WORLD_TEMPLATE, NPC_TEMPLATE, etc.)
├── styles.css            # Plugin styles
├── map/                  # Battle map system
│   ├── MapManager.ts     # Map storage and CRUD
│   └── MapCreationModal.ts
├── marker/               # Token/marker system
│   ├── MarkerLibrary.ts  # Token storage
│   └── MarkerTypes.ts    # Type definitions
└── migration/            # Template migration system
    ├── index.ts
    ├── MigrationManager.ts   # Version tracking, migration logic
    └── MigrationModal.ts     # Migration UI
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
The build will fail if there are errors, so just run:
```powershell
..\nodejs\node.exe esbuild.config.mjs
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

1. Build: `..\nodejs\node.exe esbuild.config.mjs`
2. Deploy to test vault (see deploy command above)
3. Reload Obsidian: Ctrl+P → "Reload app without saving"
4. Test your feature
5. Check browser console (Ctrl+Shift+I) for errors

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
  session: "1.2.1",
  npc: "1.2.0",      // Edit/Delete buttons
  pc: "1.2.0",       // Edit/Delete buttons
  player: "1.2.0",   // Edit/Delete buttons (same as pc)
  adventure: "1.1.1",
  scene: "2.0.0",
  faction: "1.0.0",
  item: "1.1.0",     // Edit/Delete buttons
  spell: "1.0.0",
  campaign: "1.0.0",
  trap: "1.1.0",     // Edit/Delete buttons
  creature: "1.2.0"  // token_id with size
}
```

---

## Troubleshooting

**Build fails**: Check TypeScript syntax, ensure all imports are correct.

**Plugin doesn't reload**: Try restarting Obsidian completely.

**Changes not appearing**: Make sure you deployed the latest `dist/main.js`, not an old version.

**Migration not running**: Check template version numbers match in both `templates.ts` and `MigrationManager.ts`.

---

_Update this file whenever workflow or patterns change significantly._
