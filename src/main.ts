import { App, ItemView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, requestUrl } from "obsidian";
import {
  WORLD_TEMPLATE,
  SESSION_GM_TEMPLATE,
  SESSION_PLAYER_TEMPLATE,
  NPC_TEMPLATE,
  PC_TEMPLATE,
  ADVENTURE_TEMPLATE,
  SCENE_TEMPLATE,
  SCENE_SOCIAL_TEMPLATE,
  SCENE_COMBAT_TEMPLATE,
  SCENE_EXPLORATION_TEMPLATE,
  SCENE_PUZZLE_TEMPLATE,
  SCENE_MONTAGE_TEMPLATE,
  TRAP_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  SPELL_TEMPLATE,
  CAMPAIGN_TEMPLATE,
  SESSION_DEFAULT_TEMPLATE
} from "./templates";
import { MapManager } from "./map/MapManager";
import { MapCreationModal } from "./map/MapCreationModal";

interface DndCampaignHubSettings {
  currentCampaign: string;
  pluginVersion: string;
}

const DEFAULT_SETTINGS: DndCampaignHubSettings = {
  currentCampaign: "ttrpgs/Frozen Sick (SOLINA)",
  pluginVersion: "0.0.0",
};

// Current template versions - increment when templates change
const TEMPLATE_VERSIONS = {
  world: "1.0.0",
  session: "1.2.1", // Fixed escaping issues in interactive scene checkboxes
  npc: "1.0.0",
  pc: "1.0.0",
  adventure: "1.1.1", // Fixed escaping issues in interactive scene checkboxes
  scene: "2.0.0", // Specialized scene templates (social, combat, exploration, puzzle, montage)
  faction: "1.0.0",
  item: "1.1.0", // Updated with Edit/Delete buttons
  spell: "1.0.0",
  campaign: "1.0.0",
  trap: "1.1.0", // Updated with Edit/Delete buttons
  creature: "1.1.0" // Updated with Edit/Delete buttons
};

/**
 * Safe template migration system
 * Tracks versions and applies incremental updates without data loss
 */
class MigrationManager {
  private app: App;
  private plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Get the current template version from a file's frontmatter
   */
  async getFileTemplateVersion(file: TFile): Promise<string | null> {
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) return null;

    const frontmatter = frontmatterMatch[1];
    const versionMatch = frontmatter.match(/^template_version:\s*(.+)$/m);
    return versionMatch && versionMatch[1] ? versionMatch[1].trim() : null;
  }

  /**
   * Get the file type from frontmatter
   */
  async getFileType(file: TFile): Promise<string | null> {
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) return null;

    const frontmatter = frontmatterMatch[1];
    const typeMatch = frontmatter.match(/^type:\s*(.+)$/m);
    return typeMatch && typeMatch[1] ? typeMatch[1].trim() : null;
  }

  /**
   * Check if a file needs migration
   */
  async needsMigration(file: TFile): Promise<boolean> {
    const fileType = await this.getFileType(file);
    if (!fileType || !(fileType in TEMPLATE_VERSIONS)) return false;

    const currentVersion = await this.getFileTemplateVersion(file);
    const targetVersion = TEMPLATE_VERSIONS[fileType as keyof typeof TEMPLATE_VERSIONS];

    // No version means old template, needs migration
    if (!currentVersion) return true;

    // Compare versions
    return this.compareVersions(currentVersion, targetVersion) < 0;
  }

  /**
   * Compare semantic versions (returns -1 if a < b, 0 if equal, 1 if a > b)
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  }

  /**
   * Find all files that need migration in a campaign
   */
  async findFilesNeedingMigration(campaignPath: string): Promise<TFile[]> {
    const filesNeedingMigration: TFile[] = [];
    const campaignFolder = this.app.vault.getAbstractFileByPath(campaignPath);

    if (!(campaignFolder instanceof TFolder)) return filesNeedingMigration;

    const processFolder = async (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
          if (await this.needsMigration(child)) {
            filesNeedingMigration.push(child);
          }
        } else if (child instanceof TFolder) {
          await processFolder(child);
        }
      }
    };

    await processFolder(campaignFolder);
    
    // Also check root-level z_Traps folder (for traps created before campaign structure)
    const rootTrapsFolder = this.app.vault.getAbstractFileByPath("z_Traps");
    if (rootTrapsFolder instanceof TFolder) {
      await processFolder(rootTrapsFolder);
    }
    
    return filesNeedingMigration;
  }

  /**
   * Update only the template_version field in frontmatter
   */
  async updateTemplateVersion(file: TFile, newVersion: string): Promise<void> {
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch || !frontmatterMatch[1]) {
      console.error(`No frontmatter found in ${file.path}`);
      return;
    }

    let frontmatter = frontmatterMatch[1];
    const versionMatch = frontmatter.match(/^template_version:\s*(.+)$/m);

    if (versionMatch) {
      // Update existing version
      frontmatter = frontmatter.replace(
        /^template_version:\s*(.+)$/m,
        `template_version: ${newVersion}`
      );
    } else {
      // Add version field after type field if it exists
      if (frontmatter.match(/^type:/m)) {
        frontmatter = frontmatter.replace(
          /^(type:\s*.+)$/m,
          `$1\ntemplate_version: ${newVersion}`
        );
      } else {
        // Add at the beginning
        frontmatter = `template_version: ${newVersion}\n${frontmatter}`;
      }
    }

    const newContent = content.replace(
      /^---\n[\s\S]*?\n---/,
      `---\n${frontmatter}\n---`
    );

    await this.app.vault.modify(file, newContent);
  }

  /**
   * Add a new frontmatter field if it doesn't exist
   */
  async addFrontmatterField(
    file: TFile,
    fieldName: string,
    defaultValue: string
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch || !frontmatterMatch[1]) return;

    let frontmatter = frontmatterMatch[1];
    const fieldMatch = frontmatter.match(new RegExp(`^${fieldName}:`, "m"));

    if (!fieldMatch) {
      // Add field at the end of frontmatter
      frontmatter = `${frontmatter}\n${fieldName}: ${defaultValue}`;

      const newContent = content.replace(
        /^---\n[\s\S]*?\n---/,
        `---\n${frontmatter}\n---`
      );

      await this.app.vault.modify(file, newContent);
    }
  }

  /**
   * Inject a new section into a file if it doesn't exist
   */
  async injectSection(
    file: TFile,
    sectionHeading: string,
    sectionContent: string,
    insertAfterHeading?: string
  ): Promise<void> {
    const content = await this.app.vault.read(file);

    // Check if section already exists
    const sectionRegex = new RegExp(`^#{1,6}\\s+${sectionHeading}`, "m");
    if (sectionRegex.test(content)) {
      console.log(`Section "${sectionHeading}" already exists in ${file.path}`);
      return;
    }

    let newContent: string;

    if (insertAfterHeading) {
      // Insert after specific heading
      const afterRegex = new RegExp(`(^#{1,6}\\s+${insertAfterHeading}[^\n]*\n(?:.*\n)*?)(?=^#{1,6}\\s+|$)`, "m");
      const match = content.match(afterRegex);

      if (match) {
        newContent = content.replace(
          afterRegex,
          `${match[1]}\n${sectionContent}\n\n`
        );
      } else {
        // Fallback: add at the end
        newContent = `${content}\n\n${sectionContent}`;
      }
    } else {
      // Add at the end of the file
      newContent = `${content}\n\n${sectionContent}`;
    }

    await this.app.vault.modify(file, newContent);
  }

  /**
   * Update a specific dataview query in a file
   */
  async updateDataviewQuery(
    file: TFile,
    queryIdentifier: string,
    newQuery: string
  ): Promise<void> {
    const content = await this.app.vault.read(file);

    // Match dataview code blocks with the identifier nearby
    const queryRegex = new RegExp(
      `(\`\`\`dataview[^\`]*${queryIdentifier}[^\`]*\`\`\`)`,
      "g"
    );

    if (!queryRegex.test(content)) {
      console.log(`Query "${queryIdentifier}" not found in ${file.path}`);
      return;
    }

    const newContent = content.replace(queryRegex, newQuery);
    await this.app.vault.modify(file, newContent);
  }

  /**
   * Replace a dataviewjs code block that contains a specific marker text
   */
  async replaceDataviewjsBlock(
    file: TFile,
    markerText: string,
    newBlock: string
  ): Promise<boolean> {
    const content = await this.app.vault.read(file);

    // Find dataviewjs blocks
    const blockRegex = /```dataviewjs\n([\s\S]*?)```/g;
    let match;
    let found = false;
    
    while ((match = blockRegex.exec(content)) !== null) {
      if (match[1] && match[1].includes(markerText)) {
        // Replace this block
        const oldBlock = match[0];
        const newContent = content.replace(oldBlock, newBlock);
        await this.app.vault.modify(file, newContent);
        found = true;
        break;
      }
    }

    return found;
  }

  /**
   * Apply scene v1.1.0 migration (Initiative Tracker integration)
   */
  async migrateSceneTo1_1_0(file: TFile): Promise<void> {
    console.log(`Migrating scene ${file.path} to v1.1.0`);

    // 1. Add tracker_encounter field to frontmatter
    await this.addFrontmatterField(file, "tracker_encounter", "");
    
    // 2. Add encounter_creatures field to frontmatter
    await this.addFrontmatterField(file, "encounter_creatures", "[]");

    // 2. Inject Initiative Tracker section in Combat section
    const trackerSection = `### Initiative Tracker

\`\`\`dataview
TABLE WITHOUT ID
  choice(tracker_encounter != "" and tracker_encounter != null,
    "🎲 **Encounter Linked:** " + tracker_encounter + "\\n\\n" +
    "\`\`\`button\\nname Open Initiative Tracker\\ntype command\\naction Initiative Tracker: Open Tracker View\\n\`\`\`",
    "ℹ️ **No encounter linked yet**\\n\\nTo use the Initiative Tracker:\\n1. Create an encounter in the Initiative Tracker plugin\\n2. Add the encounter name to the \`tracker_encounter\` field in this note's frontmatter\\n3. The button to open the tracker will appear here"
  ) AS "Combat Tracker"
FROM ""
WHERE file.path = this.file.path
LIMIT 1
\`\`\``;

    await this.injectSection(file, "Initiative Tracker", trackerSection, "Combat");

    // 3. Update template version
    await this.updateTemplateVersion(file, "1.1.0");

    console.log(`Scene ${file.path} migrated successfully`);
  }

  async migrateSceneTo1_2_0(file: TFile): Promise<void> {
    console.log(`Migrating scene ${file.path} to v1.2.0`);

    // Ensure encounter_creatures field exists
    await this.addFrontmatterField(file, "encounter_creatures", "[]");

    // Update template version
    await this.updateTemplateVersion(file, "1.2.0");

    console.log(`Scene ${file.path} migrated to v1.2.0 successfully`);
  }

  /**
   * Apply item v1.1.0 migration (Edit/Delete buttons)
   */
  async migrateItemTo1_1_0(file: TFile): Promise<void> {
    console.log(`Migrating item ${file.path} to v1.1.0`);

    const content = await this.app.vault.read(file);
    
    // Check if edit/delete buttons already exist
    if (content.includes("Edit Item") && content.includes("Delete Item")) {
      console.log("Edit/Delete buttons already exist, just updating version");
      await this.updateTemplateVersion(file, "1.1.0");
      return;
    }

    // Find the item name heading (# Item Name)
    const headingMatch = content.match(/^(# .+)$/m);
    
    if (headingMatch) {
      const buttonSection = `

\`\`\`dataviewjs
// Action buttons for item management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Item button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Item",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-item");
});

// Delete Item button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Item",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-item");
});
\`\`\`
`;

      // Insert button section after the heading
      const newContent = content.replace(
        headingMatch[0],
        `${headingMatch[0]}${buttonSection}`
      );

      await this.app.vault.modify(file, newContent);
    }

    // Update template version
    await this.updateTemplateVersion(file, "1.1.0");

    console.log(`Item ${file.path} migrated to v1.1.0 successfully`);
  }

  /**
   * Apply trap v1.1.0 migration (Edit/Delete buttons)
   */
  async migrateTrapTo1_1_0(file: TFile): Promise<void> {
    console.log(`Migrating trap ${file.path} to v1.1.0`);

    const content = await this.app.vault.read(file);
    
    // Check if edit/delete buttons already exist
    if (content.includes("Edit Trap") && content.includes("Delete Trap")) {
      console.log("Edit/Delete buttons already exist, just updating version");
      await this.updateTemplateVersion(file, "1.1.0");
      return;
    }

    // Find the trap name heading (# Trap Name)
    const headingMatch = content.match(/^(# .+)$/m);
    
    if (headingMatch) {
      const buttonSection = `

\`\`\`dataviewjs
// Action buttons for trap management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Trap button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Trap",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-trap");
});

// Delete Trap button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Trap",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-trap");
});
\`\`\`
`;

      // Insert button section after the heading
      const newContent = content.replace(
        headingMatch[0],
        `${headingMatch[0]}${buttonSection}`
      );

      await this.app.vault.modify(file, newContent);
    }

    // Update template version
    await this.updateTemplateVersion(file, "1.1.0");

    console.log(`Trap ${file.path} migrated to v1.1.0 successfully`);
  }

  /**
   * Apply creature v1.1.0 migration (Edit/Delete buttons)
   */
  async migrateCreatureTo1_1_0(file: TFile): Promise<void> {
    console.log(`Migrating creature ${file.path} to v1.1.0`);

    const content = await this.app.vault.read(file);
    
    // Check if edit/delete buttons already exist
    if (content.includes("Edit Creature") && content.includes("Delete Creature")) {
      console.log("Edit/Delete buttons already exist, just updating version");
      await this.updateTemplateVersion(file, "1.1.0");
      return;
    }

    // Find the position before the statblock
    const statblockMatch = content.match(/```statblock/);
    
    if (statblockMatch && statblockMatch.index !== undefined) {
      const buttonSection = `\`\`\`dataviewjs
// Action buttons for creature management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Creature button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Creature",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-creature");
});

// Delete Creature button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Creature",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-creature");
});
\`\`\`

`;

      // Insert button section before the statblock
      const beforeStatblock = content.substring(0, statblockMatch.index);
      const afterStatblock = content.substring(statblockMatch.index);
      const newContent = beforeStatblock + buttonSection + afterStatblock;

      await this.app.vault.modify(file, newContent);
    }

    // Update template version
    await this.updateTemplateVersion(file, "1.1.0");

    console.log(`Creature ${file.path} migrated to v1.1.0 successfully`);
  }

  /**
   * Apply session v1.2.1 migration (Interactive scene checkboxes - fixed escaping)
   */
  async migrateSessionTo1_2_1(file: TFile): Promise<void> {
    console.log(`Migrating session ${file.path} to v1.2.1`);

    const newDataviewjsBlock = `\`\`\`dataviewjs
// Get current session's adventure (if linked)
const sessionFile = dv.current();
let adventureLink = sessionFile.adventure;

// Parse wikilink if present: "[[path]]" -> path
if (adventureLink && typeof adventureLink === 'string') {
  const match = adventureLink.match(/\\[\\[(.+?)\\]\\]/);
  if (match) adventureLink = match[1];
}

if (adventureLink) {
  // Get the adventure file
  const adventurePage = dv.page(adventureLink);
  
  if (adventurePage) {
    const adventureName = adventurePage.name || adventurePage.file.name;
    const campaignFolder = adventurePage.campaign;
    const adventureFolder = adventurePage.file.folder;
    
    // Find scenes in both flat and folder structures
    let scenesFlat = dv.pages(\`"\${campaignFolder}/Adventures/\${adventureName} - Scenes"\`)
      .where(p => p.file.name.startsWith("Scene"));
    let scenesFolder = dv.pages(\`"\${adventureFolder}"\`)
      .where(p => p.file.name.startsWith("Scene"));
    
    let allScenes = [...scenesFlat, ...scenesFolder];
    
    if (allScenes.length > 0) {
      // Sort by scene number
      allScenes.sort((a, b) => {
        const aNum = parseInt(a.scene_number || a.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
        const bNum = parseInt(b.scene_number || b.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
        return aNum - bNum;
      });
      
      dv.header(4, "Adventure Scenes");
      for (const scene of allScenes) {
        const status = scene.status === "completed" ? "✅" : scene.status === "in-progress" ? "🎬" : "⬜";
        const duration = scene.duration || "?min";
        const type = scene.type || "?";
        
        // Create clickable status button
        const sceneDiv = dv.el('div', '', { cls: 'scene-item' });
        const statusBtn = dv.el('button', status, { container: sceneDiv });
        statusBtn.style.border = 'none';
        statusBtn.style.background = 'transparent';
        statusBtn.style.cursor = 'pointer';
        statusBtn.style.fontSize = '1.2em';
        statusBtn.title = 'Click to change status';
        statusBtn.onclick = async () => {
          const file = app.vault.getAbstractFileByPath(scene.file.path);
          if (file) {
            const content = await app.vault.read(file);
            const currentStatus = scene.status || 'not-started';
            const nextStatus = currentStatus === 'not-started' ? 'in-progress' : 
                               currentStatus === 'in-progress' ? 'completed' : 'not-started';
            const newContent = content.replace(
              /^status:\\s*.+$/m,
              \`status: \${nextStatus}\`
            );
            await app.vault.modify(file, newContent);
          }
        };
        dv.span(' ', { container: sceneDiv });
        dv.span(dv.fileLink(scene.file.path, false, scene.file.name), { container: sceneDiv });
        dv.span(\` - \\\`\${duration} | \${type}\\\`\`, { container: sceneDiv });
      }
    }
  }
} else {
  dv.paragraph("*No adventure linked to this session.*");
  dv.paragraph("To link an adventure, add it to the frontmatter:");
  dv.paragraph(\`\\\`\\\`\\\`yaml\\nadventure: "[[Your Adventure Name]]"\\n\\\`\\\`\\\`\`);
  dv.paragraph("Or create a new adventure:");
  const createAdvBtn = dv.el('button', '🗺️ Create Adventure');
  createAdvBtn.className = 'mod-cta';
  createAdvBtn.style.marginTop = '10px';
  createAdvBtn.onclick = () => {
    app.commands.executeCommandById('dnd-campaign-hub:create-adventure');
  };
}
\`\`\``;

    const updated = await this.replaceDataviewjsBlock(
      file,
      "Get current session's adventure",
      newDataviewjsBlock
    );

    if (updated) {
      console.log("Updated session adventure scenes dataviewjs block");
    }

    // Update template version
    await this.updateTemplateVersion(file, "1.2.1");

    console.log(`Session ${file.path} migrated to v1.2.1 successfully`);
  }

  /**
   * Apply adventure v1.1.1 migration (Interactive scene checkboxes - fixed escaping)
   */
  async migrateAdventureTo1_1_1(file: TFile): Promise<void> {
    console.log(`Migrating adventure ${file.path} to v1.1.1`);

    const newScenesBlock = `\`\`\`dataviewjs
// Get all scenes for this adventure
const adventureName = dv.current().name || dv.current().file.name;
const campaignFolder = dv.current().campaign;
const adventureFolder = dv.current().file.folder;

// Find scenes in both flat and folder structures
// Flat: Adventures/Adventure - Scenes/
// Folder: Adventures/Adventure/ (scenes directly or in Act subfolders)
let scenesFlat = dv.pages(\`"\${campaignFolder}/Adventures/\${adventureName} - Scenes"\`)
  .where(p => p.file.name.startsWith("Scene"));
let scenesFolder = dv.pages(\`"\${adventureFolder}"\`)
  .where(p => p.file.name.startsWith("Scene"));

let allScenes = [...scenesFlat, ...scenesFolder];

if (allScenes.length === 0) {
  dv.paragraph("*No scenes created yet. Use the button above to create your first scene.*");
} else {
  // Sort by scene number
  allScenes.sort((a, b) => {
    const aNum = parseInt(a.scene_number || a.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
    const bNum = parseInt(b.scene_number || b.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
    return aNum - bNum;
  });

  // Group by act if act numbers exist
  const hasActs = allScenes.some(s => s.act);
  
  if (hasActs) {
    // Display grouped by acts
    const acts = {1: [], 2: [], 3: []};
    allScenes.forEach(scene => {
      const act = scene.act || 1;
      if (acts[act]) acts[act].push(scene);
    });

    const actNames = {
      1: "Act 1: Setup & Inciting Incident",
      2: "Act 2: Rising Action & Confrontation",
      3: "Act 3: Climax & Resolution"
    };

    for (const [actNum, actScenes] of Object.entries(acts)) {
      if (actScenes.length > 0) {
        dv.header(3, actNames[actNum]);
        for (const scene of actScenes) {
          const status = scene.status === "completed" ? "✅" : scene.status === "in-progress" ? "🎬" : "⬜";
          const duration = scene.duration || "?min";
          const type = scene.type || "?";
          const difficulty = scene.difficulty || "?";
          
          // Create clickable status button
          const sceneDiv = dv.el('div', '', { cls: 'scene-item' });
          const statusBtn = dv.el('button', status, { container: sceneDiv });
          statusBtn.style.border = 'none';
          statusBtn.style.background = 'transparent';
          statusBtn.style.cursor = 'pointer';
          statusBtn.style.fontSize = '1.2em';
          statusBtn.title = 'Click to change status';
          statusBtn.onclick = async () => {
            const file = app.vault.getAbstractFileByPath(scene.file.path);
            if (file) {
              const content = await app.vault.read(file);
              const currentStatus = scene.status || 'not-started';
              const nextStatus = currentStatus === 'not-started' ? 'in-progress' : 
                                 currentStatus === 'in-progress' ? 'completed' : 'not-started';
              const newContent = content.replace(
                /^status:\\s*.+$/m,
                \`status: \${nextStatus}\`
              );
              await app.vault.modify(file, newContent);
            }
          };
          dv.span(' **', { container: sceneDiv });
          dv.span(dv.fileLink(scene.file.path, false, scene.file.name), { container: sceneDiv });
          dv.span(\`**  \\n\\\`\${duration} | \${type} | \${difficulty}\\\`\`, { container: sceneDiv });
        }
      }
    }
  } else {
    // Display as simple list
    for (const scene of allScenes) {
      const status = scene.status === "completed" ? "✅" : scene.status === "in-progress" ? "🎬" : "⬜";
      const duration = scene.duration || "?min";
      const type = scene.type || "?";
      const difficulty = scene.difficulty || "?";
      
      // Create clickable status button
      const sceneDiv = dv.el('div', '', { cls: 'scene-item' });
      const statusBtn = dv.el('button', status, { container: sceneDiv });
      statusBtn.style.border = 'none';
      statusBtn.style.background = 'transparent';
      statusBtn.style.cursor = 'pointer';
      statusBtn.style.fontSize = '1.2em';
      statusBtn.title = 'Click to change status';
      statusBtn.onclick = async () => {
        const file = app.vault.getAbstractFileByPath(scene.file.path);
        if (file) {
          const content = await app.vault.read(file);
          const currentStatus = scene.status || 'not-started';
          const nextStatus = currentStatus === 'not-started' ? 'in-progress' : 
                             currentStatus === 'in-progress' ? 'completed' : 'not-started';
          const newContent = content.replace(
            /^status:\\s*.+$/m,
            \`status: \${nextStatus}\`
          );
          await app.vault.modify(file, newContent);
        }
      };
      dv.span(' **', { container: sceneDiv });
      dv.span(dv.fileLink(scene.file.path, false, scene.file.name), { container: sceneDiv });
      dv.span(\`**  \\n\\\`\${duration} | \${type} | \${difficulty}\\\`\`, { container: sceneDiv });
    }
  }
}
\`\`\``;

    const updated = await this.replaceDataviewjsBlock(
      file,
      "Get all scenes for this adventure",
      newScenesBlock
    );

    if (updated) {
      console.log("Updated adventure scenes dataviewjs block");
    }

    // Update template version
    await this.updateTemplateVersion(file, "1.1.1");

    console.log(`Adventure ${file.path} migrated to v1.1.1 successfully`);
  }

  /**
   * Apply migration based on file type and version
   */
  async migrateFile(file: TFile): Promise<boolean> {
    try {
      const fileType = await this.getFileType(file);
      const currentVersion = await this.getFileTemplateVersion(file);

      if (!fileType) {
        console.error(`No file type found in ${file.path}`);
        return false;
      }

      // Get target version for this file type
      const targetVersion = TEMPLATE_VERSIONS[fileType as keyof typeof TEMPLATE_VERSIONS];
      if (!targetVersion) {
        console.warn(`No template version defined for type: ${fileType}`);
        return false;
      }

      // If file has no version, add the current template version
      if (!currentVersion) {
        console.log(`Adding template_version to ${file.path}`);
        await this.updateTemplateVersion(file, targetVersion);
        return true;
      }

      // Scene-specific migrations
      if (fileType === "scene") {
        if (this.compareVersions(currentVersion, "1.1.0") < 0) {
          await this.migrateSceneTo1_1_0(file);
          return true;
        }
        if (this.compareVersions(currentVersion, "1.2.0") < 0) {
          await this.migrateSceneTo1_2_0(file);
          return true;
        }
      }

      // Item-specific migrations
      if (fileType === "item") {
        if (this.compareVersions(currentVersion, "1.1.0") < 0) {
          await this.migrateItemTo1_1_0(file);
          return true;
        }
      }

      // Trap-specific migrations
      if (fileType === "trap") {
        if (this.compareVersions(currentVersion, "1.1.0") < 0) {
          await this.migrateTrapTo1_1_0(file);
          return true;
        }
      }

      // Creature-specific migrations
      if (fileType === "creature") {
        if (this.compareVersions(currentVersion, "1.1.0") < 0) {
          await this.migrateCreatureTo1_1_0(file);
          return true;
        }
      }

      // Session-specific migrations
      if (fileType === "session") {
        if (this.compareVersions(currentVersion, "1.2.1") < 0) {
          await this.migrateSessionTo1_2_1(file);
          return true;
        }
      }

      // Adventure-specific migrations
      if (fileType === "adventure") {
        if (this.compareVersions(currentVersion, "1.1.1") < 0) {
          await this.migrateAdventureTo1_1_1(file);
          return true;
        }
      }

      // For other types, if version is outdated, update it
      // (In the future, add type-specific migration logic here as needed)
      if (this.compareVersions(currentVersion, targetVersion) < 0) {
        console.log(`Updating ${file.path} from v${currentVersion} to v${targetVersion}`);
        await this.updateTemplateVersion(file, targetVersion);
        return true;
      }

      // File is already up to date
      return true;
    } catch (error) {
      console.error(`Error migrating ${file.path}:`, error);
      return false;
    }
  }

  /**
   * Migrate multiple files with progress tracking
   */
  async migrateFiles(files: TFile[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const file of files) {
      const result = await this.migrateFile(file);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }
}

class CalibrationModal extends Modal {
  pixelDistance: number;
  onSelect: (miles: number) => void;

  constructor(app: App, pixelDistance: number, onSelect: (miles: number) => void) {
    super(app);
    this.pixelDistance = pixelDistance;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Calibrate Grid" });

    contentEl.createEl("p", { 
      text: `Measured distance: ${Math.round(this.pixelDistance)} pixels`,
      cls: "dnd-map-calibration-info"
    });

    contentEl.createEl("p", { 
      text: "Select the travel pace this hex represents (D&D 5e daily travel distance):",
      cls: "dnd-map-calibration-label"
    });

    // Travel pace options
    const optionsContainer = contentEl.createDiv({ cls: "dnd-calibration-options" });

    const paceOptions = [
      { miles: 30, label: "30 Miles/Day (Fast Pace)", desc: "Forced march" },
      { miles: 24, label: "24 Miles/Day (Normal Pace)", desc: "Standard travel" },
      { miles: 18, label: "18 Miles/Day (Slow Pace)", desc: "Stealthy or difficult terrain" }
    ];

    paceOptions.forEach(option => {
      const optionBtn = optionsContainer.createEl("button", {
        cls: "dnd-calibration-option-btn"
      });

      optionBtn.createEl("div", { 
        text: option.label,
        cls: "dnd-calibration-option-label"
      });

      optionBtn.createEl("div", { 
        text: option.desc,
        cls: "dnd-calibration-option-desc"
      });

      optionBtn.addEventListener("click", () => {
        this.onSelect(option.miles);
        this.close();
      });
    });

    // Cancel button
    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class CreatureSelectorModal extends Modal {
  creatures: any[];
  onSelect: (creature: any) => void;
  searchInput!: HTMLInputElement;
  resultsContainer!: HTMLElement;

  constructor(app: App, creatures: any[], onSelect: (creature: any) => void) {
    super(app);
    this.creatures = creatures;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("encounter-creature-selector");

    contentEl.createEl("h2", { text: "Select Creature" });

    // Search input
    const searchContainer = contentEl.createDiv({ cls: "search-input-container" });
    this.searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search creatures by name...",
      cls: "search-input"
    });

    this.searchInput.addEventListener("input", () => this.updateResults());
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstResult = this.resultsContainer.querySelector(".creature-item");
        if (firstResult) {
          (firstResult as HTMLElement).click();
        }
      }
    });

    // Results container
    this.resultsContainer = contentEl.createDiv({ cls: "creature-results" });
    
    // Initial results
    this.updateResults();

    // Focus search input
    setTimeout(() => this.searchInput.focus(), 100);
  }

  updateResults() {
    this.resultsContainer.empty();
    
    const searchTerm = this.searchInput.value.toLowerCase();
    const filtered = this.creatures.filter(c => 
      (c.name || "").toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      this.resultsContainer.createDiv({ 
        text: "No creatures found", 
        cls: "no-results" 
      });
      return;
    }

    // Show up to 50 results
    const displayList = filtered.slice(0, 50);
    
    displayList.forEach(creature => {
      const item = this.resultsContainer.createDiv({ cls: "creature-item" });
      
      const nameEl = item.createDiv({ cls: "creature-name" });
      nameEl.setText(creature.name || "Unknown");
      
      const detailsEl = item.createDiv({ cls: "creature-details" });
      const cr = creature.cr?.toString() || "?";
      const source = creature.source || "Unknown";
      detailsEl.setText(`CR ${cr} • ${source}`);
      
      item.addEventListener("click", () => {
        this.onSelect(creature);
        this.close();
      });
    });

    if (filtered.length > 50) {
      this.resultsContainer.createDiv({ 
        text: `Showing 50 of ${filtered.length} results. Refine your search.`,
        cls: "results-note"
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class MultiCreatureSelectorModal extends Modal {
  creatures: any[];
  onSelect: (creatures: any[]) => void;
  searchInput!: HTMLInputElement;
  resultsContainer!: HTMLElement;
  footerContainer!: HTMLElement;
  selectedKeys = new Set<string>();
  creatureByKey = new Map<string, any>();

  constructor(app: App, creatures: any[], onSelect: (creatures: any[]) => void) {
    super(app);
    this.creatures = creatures;
    this.onSelect = onSelect;
    for (const c of creatures) {
      this.creatureByKey.set(this.getKey(c), c);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("encounter-creature-selector");

    contentEl.createEl("h2", { text: "Select Creatures" });

    const searchContainer = contentEl.createDiv({ cls: "search-input-container" });
    this.searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search creatures by name...",
      cls: "search-input"
    });

    this.searchInput.addEventListener("input", () => this.updateResults());

    this.resultsContainer = contentEl.createDiv({ cls: "creature-results" });
    this.footerContainer = contentEl.createDiv({ cls: "creature-selector-footer" });
    this.footerContainer.style.display = "flex";
    this.footerContainer.style.justifyContent = "space-between";
    this.footerContainer.style.alignItems = "center";
    this.footerContainer.style.marginTop = "10px";

    const leftControls = this.footerContainer.createDiv();
    leftControls.style.display = "flex";
    leftControls.style.gap = "10px";

    const selectVisibleBtn = leftControls.createEl("button", { text: "Select Visible" });
    selectVisibleBtn.onclick = () => {
      const visibleItems = this.resultsContainer.querySelectorAll(".creature-item[data-key]");
      visibleItems.forEach((el) => {
        const key = (el as HTMLElement).dataset.key;
        if (key) this.selectedKeys.add(key);
      });
      this.updateResults();
    };

    const clearBtn = leftControls.createEl("button", { text: "Clear" });
    clearBtn.onclick = () => {
      this.selectedKeys.clear();
      this.updateResults();
    };

    const actionControls = this.footerContainer.createDiv();
    actionControls.style.display = "flex";
    actionControls.style.gap = "10px";

    const addSelectedBtn = actionControls.createEl("button", { text: "Add Selected" });
    addSelectedBtn.onclick = () => {
      const selectedCreatures = Array.from(this.selectedKeys)
        .map((key) => this.creatureByKey.get(key))
        .filter(Boolean);
      if (selectedCreatures.length > 0) {
        this.onSelect(selectedCreatures);
        this.close();
      }
    };

    const cancelBtn = actionControls.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    this.updateResults();

    setTimeout(() => this.searchInput.focus(), 100);
  }

  getKey(creature: any): string {
    return creature?.path ? `${creature.path}::${creature.name}` : (creature?.name || "Unknown");
  }

  updateResults() {
    this.resultsContainer.empty();

    const searchTerm = this.searchInput.value.toLowerCase();
    const filtered = this.creatures.filter(c =>
      (c.name || "").toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      this.resultsContainer.createDiv({
        text: "No creatures found",
        cls: "no-results"
      });
      return;
    }

    const displayList = filtered.slice(0, 50);

    displayList.forEach(creature => {
      const key = this.getKey(creature);
      const item = this.resultsContainer.createDiv({ cls: "creature-item" });
      item.dataset.key = key;
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.gap = "10px";

      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selectedKeys.has(key);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selectedKeys.add(key);
        } else {
          this.selectedKeys.delete(key);
        }
      };

      const infoDiv = item.createDiv();
      const nameEl = infoDiv.createDiv({ cls: "creature-name" });
      nameEl.setText(creature.name || "Unknown");

      const detailsEl = infoDiv.createDiv({ cls: "creature-details" });
      const cr = creature.cr?.toString() || "?";
      const source = creature.source || "Unknown";
      detailsEl.setText(`CR ${cr} • ${source}`);

      item.addEventListener("click", (evt) => {
        if ((evt.target as HTMLElement).tagName.toLowerCase() === "input") return;
        checkbox.checked = !checkbox.checked;
        checkbox.onchange?.(new Event("change"));
      });
    });

    if (filtered.length > 50) {
      this.resultsContainer.createDiv({
        text: `Showing 50 of ${filtered.length} results. Refine your search.`,
        cls: "results-note"
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class EncounterBuilderModal extends Modal {
  plugin: DndCampaignHubPlugin;
  encounterBuilder: EncounterBuilder;
  encounterName = "";
  creatures: EncounterCreature[] = [];
  includeParty = true;
  selectedPartyMembers: string[] = [];  // Selected party member names
  selectedPartyId = "";
  selectedPartyName = "";
  useColorNames = false;
  adventurePath = "";
  scenePath = "";
  campaignPath = "";
  
  // For editing existing encounters
  isEdit = false;
  originalEncounterPath = "";
  
  // UI containers
  creatureListContainer: HTMLElement | null = null;
  difficultyContainer: HTMLElement | null = null;
  partySelectionContainer: HTMLElement | null = null;
  partyMemberListContainer: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, encounterPath?: string) {
    super(app);
    this.plugin = plugin;
    this.encounterBuilder = new EncounterBuilder(app, plugin);
    if (encounterPath) {
      this.isEdit = true;
      this.originalEncounterPath = encounterPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // If editing, load existing encounter data
    if (this.isEdit) {
      await this.loadEncounterData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "⚔️ Edit Encounter" : "⚔️ Create New Encounter" });

    // Encounter Name
    new Setting(contentEl)
      .setName("Encounter Name")
      .setDesc("Give this encounter a memorable name")
      .addText((text) =>
        text
          .setPlaceholder("Goblin Ambush")
          .setValue(this.encounterName)
          .onChange((value) => {
            this.encounterName = value;
          })
      );

    // Include Party
    new Setting(contentEl)
      .setName("Include Party Members")
      .setDesc("Select party members to include in the encounter")
      .addToggle((toggle) =>
        toggle
          .setValue(this.includeParty)
          .onChange(async (value) => {
            this.includeParty = value;
            await this.renderPartySelection();
            this.updateDifficultyDisplay();
          })
      );

    // Party Selection Container
    this.partySelectionContainer = contentEl.createDiv();
    this.partySelectionContainer.style.marginBottom = "15px";
    await this.renderPartySelection();

    // Party Member List Container
    this.partyMemberListContainer = contentEl.createDiv({ cls: "dnd-party-member-list" });
    this.partyMemberListContainer.style.marginBottom = "15px";
    await this.renderPartyMemberList();

    // Use Color Names
    new Setting(contentEl)
      .setName("Use Color Names")
      .setDesc("Add color suffixes to creatures (e.g., 'Goblin Red', 'Goblin Blue')")
      .addToggle((toggle) =>
        toggle
          .setValue(this.useColorNames)
          .onChange((value) => {
            this.useColorNames = value;
          })
      );

    // Creatures Section
    contentEl.createEl("h3", { text: "Creatures" });
    
    // Creature list container
    this.creatureListContainer = contentEl.createDiv({ cls: "dnd-creature-list" });
    this.renderCreatureList();
    
    // Show creature input fields
    await this.showCreatureInputFields(contentEl);

    // Difficulty Display Section
    contentEl.createEl("h3", { text: "Encounter Difficulty" });
    this.difficultyContainer = contentEl.createDiv({ cls: "dnd-difficulty-container" });
    await this.updateDifficultyDisplay();

    // Action Buttons (placed at the end after all content)
    const buttonContainer = new Setting(contentEl);
    
    buttonContainer.addButton((button) =>
      button
        .setButtonText(this.isEdit ? "Update Encounter" : "Create Encounter")
        .setCta()
        .onClick(() => {
          this.saveEncounter();
        })
    );

    if (this.isEdit) {
      buttonContainer.addButton((button) =>
        button
          .setButtonText("Delete Encounter")
          .setWarning()
          .onClick(() => {
            this.deleteEncounter();
          })
      );
    }
  }

  async loadEncounterData() {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.originalEncounterPath);
      if (!(file instanceof TFile)) return;

      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      
      if (cache?.frontmatter) {
        this.encounterName = cache.frontmatter.name || "";
        this.includeParty = cache.frontmatter.include_party !== false;
        this.useColorNames = cache.frontmatter.use_color_names || false;
        this.adventurePath = cache.frontmatter.adventure_path || "";
        this.scenePath = cache.frontmatter.scene_path || "";
        this.campaignPath = cache.frontmatter.campaign_path || "";
        this.selectedPartyId = cache.frontmatter.selected_party_id || "";
        this.selectedPartyName = cache.frontmatter.selected_party_name || "";
        if (!this.selectedPartyId && this.selectedPartyName) {
          this.selectedPartyId = this.selectedPartyName;
        }
        
        // Load creatures
        if (cache.frontmatter.creatures && Array.isArray(cache.frontmatter.creatures)) {
          this.creatures = cache.frontmatter.creatures.map((c: any) => ({
            name: c.name || "",
            count: c.count || 1,
            hp: c.hp,
            ac: c.ac,
            cr: c.cr,
            source: c.source,
            path: c.path
          }));
        }
      }

      this.syncEncounterBuilder();
    } catch (error) {
      console.error("Error loading encounter data:", error);
      new Notice("Error loading encounter data");
    }
  }

  syncEncounterBuilder() {
    this.encounterBuilder.encounterName = this.encounterName;
    this.encounterBuilder.creatures = [...this.creatures];
    this.encounterBuilder.includeParty = this.includeParty;
    this.encounterBuilder.useColorNames = this.useColorNames;
    this.encounterBuilder.selectedPartyMembers = [...this.selectedPartyMembers];
    this.encounterBuilder.selectedPartyId = this.selectedPartyId || "";
    this.encounterBuilder.adventurePath = this.adventurePath;
    this.encounterBuilder.scenePath = this.scenePath;
    this.encounterBuilder.campaignPath = this.campaignPath;
  }

  async renderPartySelection() {
    if (!this.partySelectionContainer) return;
    this.partySelectionContainer.empty();

    if (!this.includeParty) return;

    try {
      this.syncEncounterBuilder();
      const parties = await this.encounterBuilder.getAvailableParties();

      if (parties.length === 0) {
        this.partySelectionContainer.createEl("p", {
          text: "⚠️ No parties found in Initiative Tracker",
          attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" }
        });
        return;
      }

      if (!this.selectedPartyId) {
        const defaultParty = await this.encounterBuilder.getResolvedParty();
        if (defaultParty?.id) this.selectedPartyId = defaultParty.id;
        if (defaultParty?.name) this.selectedPartyName = defaultParty.name;
      }

      const partySetting = new Setting(this.partySelectionContainer)
        .setName("Party")
        .setDesc("Choose which party to use for difficulty calculations");

      partySetting.addDropdown((dropdown) => {
        parties.forEach(party => {
          dropdown.addOption(party.id, party.name);
        });
        dropdown.setValue(this.selectedPartyId || parties[0]!.id);
        dropdown.onChange((value) => {
          this.selectedPartyId = value;
          const selected = parties.find(p => p.id === value);
          this.selectedPartyName = selected?.name || "";
          this.selectedPartyMembers = [];
        });
      });

      partySetting.addButton((button) =>
        button
          .setButtonText("Apply Party")
          .onClick(async () => {
            await this.renderPartySelection();
            await this.renderPartyMemberList();
            this.updateDifficultyDisplay();
          })
      );

      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      
      if (partyMembers.length === 0) {
        this.partySelectionContainer.createEl("p", {
          text: "⚠️ No party members found in Initiative Tracker",
          attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" }
        });
        return;
      }

      const selectionDiv = this.partySelectionContainer.createDiv();
      selectionDiv.style.border = "1px solid var(--background-modifier-border)";
      selectionDiv.style.padding = "10px";
      selectionDiv.style.borderRadius = "5px";
      selectionDiv.style.marginBottom = "10px";

      selectionDiv.createEl("h4", { text: "Select Party Members", attr: { style: "margin-top: 0;" } });

      for (const member of partyMembers) {
        const checkboxDiv = selectionDiv.createDiv();
        checkboxDiv.style.marginBottom = "5px";

        const checkbox = checkboxDiv.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedPartyMembers.includes(member.name);
        checkbox.style.marginRight = "10px";
        checkbox.onchange = () => {
          if (checkbox.checked) {
            if (!this.selectedPartyMembers.includes(member.name)) {
              this.selectedPartyMembers.push(member.name);
            }
          } else {
            this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== member.name);
          }
          this.renderPartyMemberList();
          this.updateDifficultyDisplay();
        };

        const label = checkboxDiv.createEl("span", { 
          text: `${member.name} (Level ${member.level}, HP: ${member.hp}, AC: ${member.ac})`
        });
        label.style.cursor = "pointer";
        label.onclick = () => {
          checkbox.checked = !checkbox.checked;
          checkbox.onchange?.(new Event('change'));
        };
      }

      // Select All / Deselect All buttons
      const buttonsDiv = selectionDiv.createDiv();
      buttonsDiv.style.marginTop = "10px";
      buttonsDiv.style.display = "flex";
      buttonsDiv.style.gap = "10px";

      const selectAllBtn = buttonsDiv.createEl("button", { text: "Select All" });
      selectAllBtn.style.fontSize = "0.85em";
      selectAllBtn.onclick = () => {
        this.selectedPartyMembers = partyMembers.map(m => m.name);
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      };

      const deselectAllBtn = buttonsDiv.createEl("button", { text: "Deselect All" });
      deselectAllBtn.style.fontSize = "0.85em";
      deselectAllBtn.onclick = () => {
        this.selectedPartyMembers = [];
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      };
    } catch (error) {
      console.error("Error rendering party selection:", error);
    }
  }

  async renderPartyMemberList() {
    if (!this.partyMemberListContainer) return;
    this.partyMemberListContainer.empty();

    if (!this.includeParty || this.selectedPartyMembers.length === 0) {
      return;
    }

    try {
      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      const memberByName = new Map(partyMembers.map(m => [m.name, m]));

      const headerDiv = this.partyMemberListContainer.createDiv({ cls: "dnd-party-member-header" });
      headerDiv.style.marginBottom = "10px";
      headerDiv.style.fontWeight = "600";
      headerDiv.setText(`Selected Party Members (${this.selectedPartyMembers.length})`);

      for (const memberName of this.selectedPartyMembers) {
        const memberData = memberByName.get(memberName);
        if (!memberData) continue;

        const memberItem = this.partyMemberListContainer.createDiv({ cls: "dnd-creature-item" });
        
        const nameEl = memberItem.createSpan({ cls: "dnd-creature-name" });
        nameEl.setText(memberName);
        
        const statsEl = memberItem.createSpan({ cls: "dnd-creature-stats" });
        const stats: string[] = [];
        stats.push(`Level: ${memberData.level}`);
        stats.push(`HP: ${memberData.hp}`);
        stats.push(`AC: ${memberData.ac}`);
        statsEl.setText(` | ${stats.join(" | ")}`);
        
        const removeBtn = memberItem.createEl("button", {
          text: "Remove",
          cls: "dnd-creature-remove"
        });
        removeBtn.addEventListener("click", () => {
          this.removePartyMember(memberName);
        });
      }
    } catch (error) {
      console.error("Error rendering party member list:", error);
    }
  }

  removePartyMember(memberName: string) {
    this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== memberName);
    this.renderPartySelection();
    this.renderPartyMemberList();
    this.updateDifficultyDisplay();
  }

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getAvailablePartyMembers();
  }

  async showCreatureInputFields(container: HTMLElement) {
    // === VAULT CREATURE SELECTION ===
    const vaultCreatureSection = container.createDiv({ cls: "dnd-add-creature-vault" });
    
    let selectedCreature: { name: string; path: string; hp: number; ac: number; cr?: string } | null = null;
    let vaultCreatureCount = "1";
    let searchResults: HTMLElement | null = null;
    
    // Load creatures from vault
    this.syncEncounterBuilder();
    const vaultCreatures = await this.encounterBuilder.loadAllCreatures();
    
    console.log("Loaded creatures:", vaultCreatures.length, vaultCreatures.slice(0, 3).map(c => c.name));
    
    if (vaultCreatures.length > 0) {
      const vaultCreatureSetting = new Setting(vaultCreatureSection)
        .setName("Add from Vault")
        .setDesc(`Search and select creatures from your vault (${vaultCreatures.length} available)`);
      
      // Create search input container
      const searchContainer = vaultCreatureSetting.controlEl.createDiv({ cls: "dnd-creature-search-container" });
      
      const searchInput = searchContainer.createEl("input", {
        type: "text",
        placeholder: "Search creatures...",
        cls: "dnd-creature-search-input"
      });
      
      // Search results container
      searchResults = searchContainer.createDiv({ cls: "dnd-creature-search-results" });
      searchResults.style.display = "none";
      
      // Filter and display results
      const showSearchResults = (query: string) => {
        if (!searchResults) return;
        
        if (!query || query.length < 1) {
          searchResults.style.display = "none";
          return;
        }
        
        const queryLower = query.toLowerCase().trim();
        
        const filtered = vaultCreatures.filter(c => {
          return c.name.toLowerCase().includes(queryLower);
        }).slice(0, 10); // Limit to 10 results
        
        searchResults.empty();
        
        if (filtered.length === 0) {
          searchResults.createEl("div", {
            text: "No creatures found",
            cls: "dnd-creature-search-no-results"
          });
          searchResults.style.display = "block";
          return;
        }
        
        filtered.forEach(creature => {
          const resultEl = searchResults!.createDiv({ cls: "dnd-creature-search-result" });
          
          const nameEl = resultEl.createDiv({ cls: "dnd-creature-search-result-name" });
          nameEl.setText(creature.name);
          
          const statsEl = resultEl.createDiv({ cls: "dnd-creature-search-result-stats" });
          const statsParts: string[] = [];
          if (creature.cr) statsParts.push(`CR ${creature.cr}`);
          statsParts.push(`HP ${creature.hp}`);
          statsParts.push(`AC ${creature.ac}`);
          statsEl.setText(statsParts.join(" | "));
          
          resultEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedCreature = creature;
            searchInput.value = creature.name;
            if (searchResults) {
              searchResults.style.display = "none";
            }
          });
        });
        
        searchResults.style.display = "block";
      };
      
      // Search input events
      searchInput.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        showSearchResults(target.value);
      });
      
      searchInput.addEventListener("focus", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value.length >= 1) {
          showSearchResults(target.value);
        }
      });
      
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && selectedCreature) {
          e.preventDefault();
          // Add creature
          this.creatures.push({
            name: selectedCreature.name,
            count: parseInt(vaultCreatureCount) || 1,
            hp: selectedCreature.hp,
            ac: selectedCreature.ac,
            cr: selectedCreature.cr,
            source: "vault",
            path: selectedCreature.path,
            isCustom: false,
            isFriendly: false,
            isHidden: false
          });
          this.renderCreatureList();
          this.updateDifficultyDisplay();
          new Notice(`Added ${vaultCreatureCount}x ${selectedCreature.name}`);
          searchInput.value = "";
          selectedCreature = null;
        }
      });
      
      // Close search results when clicking outside
      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (searchResults) {
            searchResults.style.display = "none";
          }
        }, 250);
      });
      
      // Count input
      vaultCreatureSetting.addText(text => {
        text.setPlaceholder("Count")
          .setValue("1")
          .onChange(value => vaultCreatureCount = value);
        text.inputEl.type = "number";
        text.inputEl.style.width = "60px";
      });
      
      // Add button
      vaultCreatureSetting.addButton(btn => btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => {
          if (!selectedCreature) {
            new Notice("Please search and select a creature first!");
            return;
          }
          
          this.creatures.push({
            name: selectedCreature.name,
            count: parseInt(vaultCreatureCount) || 1,
            hp: selectedCreature.hp,
            ac: selectedCreature.ac,
            cr: selectedCreature.cr,
            source: "vault",
            path: selectedCreature.path,
            isCustom: false,
            isFriendly: false,
            isHidden: false
          });
          
          this.renderCreatureList();
          this.updateDifficultyDisplay();
          new Notice(`Added ${vaultCreatureCount}x ${selectedCreature.name}`);
          
          // Clear search
          searchInput.value = "";
          selectedCreature = null;
        }));
    } else {
      vaultCreatureSection.createEl("p", {
        text: "⚠️ No creatures found in z_Beastiarity folder. Use manual entry below.",
        cls: "setting-item-description mod-warning"
      });
    }
    
    // === MANUAL CREATURE ENTRY ===
    const addCreatureSection = container.createDiv({ cls: "dnd-add-creature-manual" });
    
    let newCreatureName = "";
    let newCreatureCount = "1";
    let newCreatureHP = "";
    let newCreatureAC = "";
    let newCreatureCR = "";
    
    const addCreatureSetting = new Setting(addCreatureSection)
      .setName("Add Custom Creature")
      .setDesc("Enter creature details manually for custom or homebrew enemies");
    
    // Creature name input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Name (e.g., Goblin)")
        .onChange(value => newCreatureName = value);
      text.inputEl.style.width = "120px";
    });
    
    // Count input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Count")
        .setValue("1")
        .onChange(value => newCreatureCount = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // HP input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("HP")
        .onChange(value => newCreatureHP = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // AC input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("AC")
        .onChange(value => newCreatureAC = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // CR input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("CR")
        .onChange(value => newCreatureCR = value);
      text.inputEl.style.width = "60px";
    });
    
    // Add button
    addCreatureSetting.addButton(btn => btn
      .setButtonText("Add")
      .setCta()
      .onClick(() => {
        if (!newCreatureName.trim()) {
          new Notice("Please enter a creature name!");
          return;
        }
        
        this.creatures.push({
          name: newCreatureName.trim(),
          count: parseInt(newCreatureCount) || 1,
          hp: newCreatureHP ? parseInt(newCreatureHP) : undefined,
          ac: newCreatureAC ? parseInt(newCreatureAC) : undefined,
          cr: newCreatureCR || undefined,
          source: "manual",
          path: undefined,
          isCustom: true,
          isFriendly: false,
          isHidden: false
        });
        
        this.renderCreatureList();
        this.updateDifficultyDisplay();
        new Notice(`Added ${newCreatureCount}x ${newCreatureName}`);
      }));
    
    // Info text
    container.createEl("p", {
      text: "💡 Tip: Select creatures from your vault or add custom enemies on the fly. You can edit stats later in Initiative Tracker.",
      cls: "setting-item-description"
    });
  }

  removeCreature(index: number) {
    this.creatures.splice(index, 1);
    this.renderCreatureList();
    this.updateDifficultyDisplay();
  }

  renderCreatureList() {
    if (!this.creatureListContainer) return;
    this.creatureListContainer.empty();

    if (this.creatures.length === 0) {
      this.creatureListContainer.createEl("p", {
        text: "No creatures added yet. Add creatures below.",
        cls: "setting-item-description"
      });
      return;
    }

    this.creatures.forEach((creature, index) => {
      const creatureItem = this.creatureListContainer!.createDiv({ cls: "dnd-creature-item" });
      
      const nameEl = creatureItem.createSpan({ cls: "dnd-creature-name" });
      nameEl.setText(`${creature.name} x${creature.count}`);
      
      const statsEl = creatureItem.createSpan({ cls: "dnd-creature-stats" });
      const stats: string[] = [];
      if (creature.hp) stats.push(`HP: ${creature.hp}`);
      if (creature.ac) stats.push(`AC: ${creature.ac}`);
      if (creature.cr) stats.push(`CR: ${creature.cr}`);
      statsEl.setText(stats.length > 0 ? ` | ${stats.join(" | ")}` : "");
      
      const removeBtn = creatureItem.createEl("button", {
        text: "Remove",
        cls: "dnd-creature-remove"
      });
      removeBtn.addEventListener("click", () => {
        this.removeCreature(index);
      });
    });
  }

  async updateDifficultyDisplay() {
    if (!this.difficultyContainer) return;

    this.difficultyContainer.empty();

    if (this.creatures.length === 0) {
      this.difficultyContainer.createEl("p", {
        text: "Add creatures to see encounter difficulty analysis.",
        cls: "setting-item-description"
      });
      return;
    }

    const loadingEl = this.difficultyContainer.createEl("p", { text: "Calculating difficulty..." });

    this.syncEncounterBuilder();
    const result = await this.encounterBuilder.calculateEncounterDifficulty();

    loadingEl.remove();

    const difficultyCard = this.difficultyContainer.createDiv({ cls: "dnd-difficulty-card" });

    const header = difficultyCard.createDiv({ cls: "dnd-difficulty-header" });

    const difficultyBadge = header.createEl("span", {
      text: result.analysis.difficulty,
      cls: "dnd-difficulty-badge"
    });
    difficultyBadge.style.backgroundColor = result.analysis.difficultyColor;

    header.createEl("span", {
      text: ` ~${result.analysis.roundsToDefeatEnemies} round${result.analysis.roundsToDefeatEnemies !== 1 ? 's' : ''}`,
      cls: "dnd-rounds-estimate"
    });

    const statsGrid = difficultyCard.createDiv({ cls: "dnd-difficulty-stats-grid" });

    const partyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    partyCol.createEl("h5", { text: `⚔️ Party (${result.partyStats.memberCount})` });
    const partyStats = partyCol.createDiv();
    partyStats.innerHTML = `
      <div>HP Pool: <strong>${result.partyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.partyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.partyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.partyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.partyEffectiveDPR.toFixed(0)}</strong></div>
    `;

    const enemyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    enemyCol.createEl("h5", { text: `👹 Enemies (${result.enemyStats.creatureCount})` });
    const enemyStats = enemyCol.createDiv();
    enemyStats.innerHTML = `
      <div>HP Pool: <strong>${result.enemyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.enemyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.enemyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.enemyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.enemyEffectiveDPR.toFixed(0)}</strong></div>
    `;

    const analysisSummary = difficultyCard.createDiv({ cls: "dnd-difficulty-analysis" });

    const partyDamage3Rounds = result.analysis.partyEffectiveDPR * 3;
    const enemyDamage3Rounds = result.analysis.enemyEffectiveDPR * 3;
    const partyHPAfter3 = Math.max(0, result.partyStats.totalHP - enemyDamage3Rounds);
    const enemyHPAfter3 = Math.max(0, result.enemyStats.totalHP - partyDamage3Rounds);

    // Action economy display
    const partyAEMod = result.analysis.partyActionEconomyMod || 1.0;
    const enemyAEMod = result.analysis.enemyActionEconomyMod || 1.0;
    const actionEconomyInfo = partyAEMod !== 1.0 || enemyAEMod !== 1.0
      ? `<div style="margin-bottom: 8px; padding: 8px; background: var(--background-modifier-border); border-radius: 4px;">
          <strong>⚖️ Action Economy:</strong> 
          Party ${partyAEMod > 1 ? '✓' : partyAEMod < 1 ? '✗' : '='} 
          ${(partyAEMod * 100).toFixed(0)}% efficiency | 
          Enemies ${enemyAEMod > 1 ? '✓' : enemyAEMod < 1 ? '✗' : '='} 
          ${(enemyAEMod * 100).toFixed(0)}% efficiency
        </div>`
      : '';

    analysisSummary.innerHTML = `
      ${actionEconomyInfo}
      <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
      <div>Party deals: <strong>${partyDamage3Rounds.toFixed(0)}</strong> damage → Enemies at <strong>${enemyHPAfter3.toFixed(0)}</strong> HP (${((enemyHPAfter3 / result.enemyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div>Enemies deal: <strong>${enemyDamage3Rounds.toFixed(0)}</strong> damage → Party at <strong>${partyHPAfter3.toFixed(0)}</strong> HP (${((partyHPAfter3 / result.partyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div style="margin-top: 8px; opacity: 0.8;">
        Survival Ratio: ${result.analysis.survivalRatio.toFixed(2)}
        (Party can survive ${result.analysis.roundsToDefeatParty} rounds, enemies survive ${result.analysis.roundsToDefeatEnemies} rounds)
      </div>
    `;

    const partyMembers = await this.getPartyForDifficulty();
    if (result.partyStats.memberCount === 0 || partyMembers.length === 0) {
      const warningEl = difficultyCard.createDiv({ cls: "dnd-difficulty-warning" });
      warningEl.innerHTML = `⚠️ <strong>No party registered!</strong> Using default estimates for 4 Level-3 PCs.
        <br>Register PCs via "Create PC" to get accurate calculations.`;
    }
  }

  /**
   * Parse statblock YAML to extract real combat stats
   * Returns hp, ac, dpr (damage per round), and attackBonus
   */
  async parseStatblockStats(filePath: string): Promise<{ hp: number; ac: number; dpr: number; attackBonus: number } | null> {
    try {
      console.log(`[Parser] Reading file: ${filePath}`);
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        console.log(`[Parser] File not found or not a TFile`);
        return null;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) {
        console.log(`[Parser] No frontmatter found`);
        return null;
      }

      const fm = cache.frontmatter;
      console.log(`[Parser] Frontmatter keys:`, Object.keys(fm));
      
      // Extract basic stats
      const hp = this.parseHP(fm.hp);
      const ac = this.parseAC(fm.ac);
      console.log(`[Parser] Parsed HP: ${hp}, AC: ${ac}`);
      
      // Calculate DPR and attack bonus from actions
      let totalDPR = 0;
      let highestAttackBonus = 0;
      let attackCount = 0;
      
      // Check for actions array (where attacks are defined)
      if (fm.actions && Array.isArray(fm.actions)) {
        console.log(`[Parser] Found ${fm.actions.length} actions`);
        
        for (const action of fm.actions) {
          if (!action.name) continue;
          console.log(`[Parser] Action: "${action.name}"`);
          
          // === CHECK STRUCTURED FIELDS FIRST ===
          // Many statblocks (especially from Fantasy Statblocks plugin) have structured data
          let actionDPR = 0;
          let actionAttackBonus = 0;
          let usedStructuredData = false;
          
          // Check for attack_bonus field
          if (typeof action.attack_bonus === 'number') {
            actionAttackBonus = action.attack_bonus;
            if (actionAttackBonus > highestAttackBonus) {
              highestAttackBonus = actionAttackBonus;
            }
            console.log(`[Parser] Found structured attack_bonus: ${actionAttackBonus}`);
            usedStructuredData = true;
          }
          
          // Check for damage_dice and damage_bonus fields
          if (action.damage_dice || action.damage_bonus) {
            console.log(`[Parser] Found structured damage fields: dice="${action.damage_dice}", bonus="${action.damage_bonus}"`);
            
            // Parse damage_dice (e.g., "1d6" or "2d8")
            let diceDamage = 0;
            if (action.damage_dice && typeof action.damage_dice === 'string') {
              const diceMatch = action.damage_dice.match(/(\d+)d(\d+)/i);
              if (diceMatch) {
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                diceDamage = numDice * ((dieSize + 1) / 2); // Average of dice
                console.log(`[Parser] Calculated dice damage: ${numDice}d${dieSize} = ${diceDamage}`);
              }
            }
            
            // Add damage bonus
            let damageBonus = 0;
            if (typeof action.damage_bonus === 'number') {
              damageBonus = action.damage_bonus;
            } else if (typeof action.damage_bonus === 'string') {
              damageBonus = parseInt(action.damage_bonus) || 0;
            }
            
            actionDPR = diceDamage + damageBonus;
            console.log(`[Parser] Calculated structured damage: ${diceDamage} + ${damageBonus} = ${actionDPR}`);
            
            if (actionDPR > 0) {
              totalDPR += actionDPR;
              attackCount++;
              usedStructuredData = true;
            }
          }
          
          // If we successfully used structured data, skip text parsing for this action
          if (usedStructuredData) {
            console.log(`[Parser] Used structured data for ${action.name}, DPR=${actionDPR}, Attack=${actionAttackBonus}`);
            continue;
          }
          
          // === FALLBACK TO TEXT PARSING ===
          // Parse attack actions from description text
          if (action.desc && typeof action.desc === 'string') {
            const desc = action.desc;
            console.log(`[Parser] Description: ${desc.substring(0, 100)}...`);
            
            // Look for attack bonus: "+5 to hit" or "attack: +5"
            const attackMatch = desc.match(/[+\-]\d+\s+to\s+hit/i);
            if (attackMatch) {
              const bonusMatch = attackMatch[0].match(/[+\-]\d+/);
              if (bonusMatch) {
                attackCount++; // Increment attack count
                const bonus = parseInt(bonusMatch[0]);
                console.log(`[Parser] Found attack bonus: ${bonus}`);
                if (bonus > highestAttackBonus) highestAttackBonus = bonus;
              }
            }
            
            // Look for damage in various formats
            // Format 1: "4 (1d6 + 1)" - average shown first
            // Format 2: "(1d6+1)" - just dice
            // Format 3: "1d6+1" or "2d6 + 3"
            const damagePatterns = [
              /(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/gi,  // "4 (1d6+1)"
              /\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/gi,           // "(1d6+1)"
              /(\d+)d(\d+)\s*([+\-]?\s*\d+)?(?!\))/gi          // "1d6+1"
            ];
            
            let damageFound = false;
            
            // Try format 1 first (with pre-calculated average)
            const avgDamageMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/i);
            if (avgDamageMatch) {
              const avgDamage = parseInt(avgDamageMatch[1]);
              console.log(`[Parser] Found pre-calculated damage: ${avgDamage}`);
              totalDPR += avgDamage;
              damageFound = true;
              if (!attackMatch) attackCount++; // Count this as an attack if we haven't already
            } else {
              // Try parsing dice notation
              const diceMatch = desc.match(/(\d+)d(\d+)\s*([+\-]?\s*\d+)?/i);
              if (diceMatch) {
                if (!attackMatch) attackCount++; // Count this as an attack if we haven't already
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                const modifier = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, '')) : 0;
                const avgDamage = Math.floor(numDice * (dieSize + 1) / 2) + modifier;
                console.log(`[Parser] Calculated damage from ${diceMatch[0]}: ${avgDamage}`);
                totalDPR += avgDamage;
                damageFound = true;
              }
            }
            
            if (!damageFound) {
              console.log(`[Parser] No damage found in action`);
            }
          }
        }
      } else {
        console.log(`[Parser] No actions array found`);
      }
      
      console.log(`[Parser] Total DPR before multiattack: ${totalDPR}`);
      
      // Check for multiattack
      let multiattackMultiplier = 1;
      if (fm.actions && Array.isArray(fm.actions)) {
        const multiattack = fm.actions.find((a: any) => 
          a.name && a.name.toLowerCase().includes('multiattack')
        );
        
        if (multiattack?.desc) {
          console.log(`[Parser] Multiattack found: ${multiattack.desc}`);
          // Look for "makes two attacks" or "makes three weapon attacks"
          const countMatch = multiattack.desc.match(/makes?\s+(two|three|four|five|\d+)\s+.*?attack/i);
          if (countMatch) {
            const countStr = countMatch[1].toLowerCase();
            const countMap: Record<string, number> = { 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
            multiattackMultiplier = countMap[countStr] || parseInt(countStr) || 1;
            console.log(`[Parser] Multiattack multiplier: ${multiattackMultiplier}`);
          }
        }
      }
      
      // Apply multiattack multiplier if we found actual attack damage
      // Note: We don't strictly require attackCount > 0 because some statblocks 
      // might have damage without explicit "to hit" text
      if (totalDPR > 0 && multiattackMultiplier > 1) {
        console.log(`[Parser] Applying multiattack multiplier ${multiattackMultiplier} to DPR ${totalDPR}`);
        totalDPR *= multiattackMultiplier;
        console.log(`[Parser] Final DPR after multiattack: ${totalDPR}`);
      }
      
      // If we couldn't parse DPR, return null to fall back to CR estimates
      // We allow attack bonus to be 0 as it's less critical than DPR
      if (totalDPR === 0) {
        console.log(`[Parser] No DPR found, returning null to use CR estimates`);
        return null;
      }
      
      // Use a reasonable default attack bonus if we couldn't parse it
      if (highestAttackBonus === 0) {
        // Estimate based on DPR (higher DPR usually means higher attack bonus)
        highestAttackBonus = Math.max(2, Math.floor(totalDPR / 5));
        console.log(`[Parser] No attack bonus found, estimating ${highestAttackBonus} based on DPR`);
      }
      
      const result = {
        hp: hp || 1,
        ac: ac || 10,
        dpr: totalDPR,
        attackBonus: highestAttackBonus
      };
      console.log(`[Parser] SUCCESS: Returning`, result);
      return result;
    } catch (error) {
      console.error("[Parser] Error parsing statblock:", filePath, error);
      return null;
    }
  }

  /**
   * Parse HP from various formats: "45 (6d10+12)" or just "45"
   */
  parseHP(hpStr: any): number {
    if (typeof hpStr === 'number') return hpStr;
    if (typeof hpStr !== 'string') return 0;
    
    // Try to extract number before parentheses: "45 (6d10+12)"
    const match = hpStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 0;
  }

  /**
   * Parse AC from various formats: "13 (natural armor)" or just "13" or number
   */
  parseAC(acStr: any): number {
    if (typeof acStr === 'number') return acStr;
    if (typeof acStr !== 'string') return 10;
    
    // Try to extract number: "13 (natural armor)" or "13"
    const match = acStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 10;
  }

  /**
   * Consolidate trap elements (creatures with [SRD] path and initiative numbers)
   * into single trap entities with trapData loaded from trap files
   */
  async consolidateTrapElements(): Promise<void> {
    const trapGroups = new Map<string, any[]>();
    const nonTraps: any[] = [];
    
    // Group creatures by trap name (before the "Initiative" part)
    for (const creature of this.creatures) {
      // Check if this looks like a trap element: has [SRD] path and name with "Initiative"
      if (creature.path === "[SRD]" && creature.name.includes("(Initiative")) {
        const baseName = creature.name.replace(/\s*\(Initiative\s+\d+\)/, '').trim();
        if (!trapGroups.has(baseName)) {
          trapGroups.set(baseName, []);
        }
        trapGroups.get(baseName)!.push(creature);
      } else if (!creature.isTrap) {
        // Keep non-trap creatures as-is
        nonTraps.push(creature);
      } else {
        // Already a proper trap with trapData
        nonTraps.push(creature);
      }
    }
    
    // Find and load trap files for each trap group
    const consolidatedTraps: any[] = [];
    for (const [trapName, elements] of trapGroups.entries()) {
      console.log(`🪤 Consolidating trap: ${trapName} (${elements.length} elements)`);
      
      // Search for the trap file
      let trapFile: TFile | null = null;
      for (const file of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type === 'trap' && 
            (cache.frontmatter.trap_name === trapName || file.basename === trapName)) {
          trapFile = file;
          break;
        }
      }
      
      if (trapFile) {
        try {
          const trapCache = this.app.metadataCache.getFileCache(trapFile);
          if (trapCache?.frontmatter) {
            const fm = trapCache.frontmatter;
            const consolidatedTrap = {
              name: trapName,
              count: 1,
              isTrap: true,
              trapData: {
                trapType: fm.trap_type || "complex",
                threatLevel: fm.threat_level || "dangerous",
                elements: fm.elements || []
              },
              // Preserve manual overrides from first element if any
              hp: elements[0].hp,
              ac: elements[0].ac,
              cr: elements[0].cr,
              path: trapFile.path
            };
            consolidatedTraps.push(consolidatedTrap);
            console.log(`✅ Consolidated ${trapName} from ${elements.length} elements`);
          }
        } catch (error) {
          console.error(`Error loading trap file for ${trapName}:`, error);
          // If we can't load the trap, keep the elements as regular creatures
          nonTraps.push(...elements);
        }
      } else {
        console.warn(`⚠️ No trap file found for ${trapName}, keeping as separate creatures`);
        nonTraps.push(...elements);
      }
    }
    
    // Replace creatures array with consolidated version
    this.creatures = [...nonTraps, ...consolidatedTraps];
    console.log(`📊 Consolidated ${trapGroups.size} traps, ${nonTraps.length} other creatures`);
  }

  async calculateEncounterDifficulty(): Promise<any> {
    // First, consolidate any trap elements
    await this.consolidateTrapElements();
    
    // Calculate enemy stats with real statblock data when available
    let enemyTotalHP = 0;
    let enemyTotalAC = 0;
    let enemyTotalDPR = 0;
    let enemyTotalAttackBonus = 0;
    let enemyCount = 0;
    
    console.log("=== ENCOUNTER DIFFICULTY CALCULATION ===");
    
    for (const creature of this.creatures) {
      const count = creature.count || 1;
      
      console.log(`\n--- Creature: ${creature.name} (x${count}) ---`);
      console.log(`Path: ${creature.path || 'none'}`);
      console.log(`CR: ${creature.cr || 'unknown'}`);
      console.log(`Is Trap: ${creature.isTrap || false}`);
      
      // Handle traps differently from creatures
      if (creature.isTrap && creature.trapData) {
        console.log(`🪤 TRAP DETECTED - Using trap-specific calculation`);
        const trapStats = await this.plugin.encounterBuilder.calculateTrapStats(creature.trapData);
        console.log(`Trap stats:`, trapStats);
        
        const hp = trapStats.hp;
        const ac = trapStats.ac;
        const dpr = trapStats.dpr;
        const attackBonus = trapStats.attackBonus;
        
        console.log(`Final trap stats: HP=${hp}, AC=${ac}, DPR=${dpr}, Attack=${attackBonus}, Effective CR=${trapStats.cr}`);
        console.log(`Total contribution (x${count}): HP=0 (traps don't contribute to HP pool), DPR=${dpr * count}`);
        
        // Traps don't add to HP pool (they're hazards, not damage sponges)
        // But they DO contribute DPR, AC (for difficulty calculation), and count as threats
        enemyTotalAC += ac * count;
        enemyTotalDPR += dpr * count;
        enemyTotalAttackBonus += attackBonus * count;
        enemyCount += count;
        continue;
      }
      
      // Try to get real stats from statblock if available
      let realStats = null;
      if (creature.path && typeof creature.path === 'string') {
        console.log(`Attempting to parse statblock: ${creature.path}`);
        realStats = await this.parseStatblockStats(creature.path);
        console.log(`Parsed stats:`, realStats);
      } else {
        console.log(`No valid path, using CR estimates`);
      }
      
      // Fall back to CR-based estimates if no statblock or parsing failed
      const crStats = this.getCRStats(creature.cr);
      console.log(`CR-based fallback stats:`, crStats);
      
      const hp = creature.hp || realStats?.hp || crStats.hp;
      const ac = creature.ac || realStats?.ac || crStats.ac;
      const dpr = realStats?.dpr || crStats.dpr;
      const attackBonus = realStats?.attackBonus || crStats.attackBonus;
      
      const dprSource = realStats?.dpr ? '📊 STATBLOCK' : '📖 CR_TABLE';
      const hpSource = realStats?.hp ? '📊 STATBLOCK' : creature.hp ? '✏️ MANUAL' : '📖 CR_TABLE';
      const acSource = realStats?.ac ? '📊 STATBLOCK' : creature.ac ? '✏️ MANUAL' : '📖 CR_TABLE';
      
      console.log(`Final stats used: HP=${hp} (${hpSource}), AC=${ac} (${acSource}), DPR=${dpr} (${dprSource}), Attack=${attackBonus}`);
      console.log(`Total contribution (x${count}): HP=${hp * count}, DPR=${dpr * count}`);
      
      enemyTotalHP += hp * count;
      enemyTotalAC += ac * count;
      enemyTotalDPR += dpr * count;
      enemyTotalAttackBonus += attackBonus * count;
      enemyCount += count;
    }
    
    console.log(`\n=== TOTALS ===`);
    console.log(`Total Enemies: ${enemyCount}`);
    console.log(`Total Enemy HP: ${enemyTotalHP}`);
    console.log(`Total Enemy DPR: ${enemyTotalDPR}`);
    console.log(`Average Enemy AC: ${enemyCount > 0 ? (enemyTotalAC / enemyCount).toFixed(1) : 0}`);
    console.log(`Average Enemy Attack Bonus: ${enemyCount > 0 ? (enemyTotalAttackBonus / enemyCount).toFixed(1) : 0}`);
    
    const avgEnemyAC = enemyCount > 0 ? enemyTotalAC / enemyCount : 13;
    const avgEnemyAttackBonus = enemyCount > 0 ? enemyTotalAttackBonus / enemyCount : 3;
    
    // Get party stats
    const partyMembers = await this.getPartyForDifficulty();
    
    let partyTotalHP = 0;
    let partyTotalAC = 0;
    let partyTotalDPR = 0;
    let partyTotalAttackBonus = 0;
    let totalLevel = 0;
    
    for (const member of partyMembers) {
      const levelStats = this.getLevelStats(member.level);
      
      const memberHP = Number(member.hp) || 0;
      const memberAC = Number(member.ac) || 0;
      
      partyTotalHP += memberHP > 0 ? memberHP : levelStats.hp;
      partyTotalAC += memberAC > 0 ? memberAC : levelStats.ac;
      partyTotalDPR += levelStats.dpr;
      partyTotalAttackBonus += levelStats.attackBonus;
      totalLevel += member.level;
    }
    
    const memberCount = partyMembers.length;
    
    let avgPartyAC: number;
    let avgPartyAttackBonus: number;
    let avgLevel: number;
    let effectivePartyCount: number; // Track effective count for action economy
    
    if (memberCount > 0) {
      avgPartyAC = partyTotalAC / memberCount;
      avgPartyAttackBonus = partyTotalAttackBonus / memberCount;
      avgLevel = totalLevel / memberCount;
      effectivePartyCount = memberCount;
    } else {
      const defaultStats = this.getLevelStats(3);
      partyTotalHP = defaultStats.hp * 4;
      partyTotalDPR = defaultStats.dpr * 4;
      avgPartyAC = defaultStats.ac;
      avgPartyAttackBonus = defaultStats.attackBonus;
      avgLevel = 3;
      effectivePartyCount = 4; // Default to 4-person party
    }
    
    // Calculate hit chances
    const partyHitChance = this.calculateHitChance(avgPartyAttackBonus, avgEnemyAC);
    const enemyHitChance = this.calculateHitChance(avgEnemyAttackBonus, avgPartyAC);
    
    // === ACTION ECONOMY ADJUSTMENT ===
    // In D&D 5e, action economy affects combat through:
    // 1. Focus Fire: More creatures can eliminate threats faster
    // 2. Action Efficiency: Fewer creatures waste actions on downed targets
    // 3. Target Distribution: Very few creatures can't threaten all enemies
    
    const partyActionCount = effectivePartyCount;
    const enemyActionCount = enemyCount;
    
    // Calculate action economy modifiers based on creature count disparity
    let partyActionEconomyMod = 1.0;
    let enemyActionEconomyMod = 1.0;
    
    if (partyActionCount > 0 && enemyActionCount > 0) {
      const actionRatio = partyActionCount / enemyActionCount;
      
      if (actionRatio > 2.0) {
        // Extreme party advantage: 6+ PCs vs 1-2 enemies
        // Party can focus fire and chain eliminate threats
        partyActionEconomyMod = 1.0 + Math.min((actionRatio - 1) * 0.1, 0.25); // Up to +25%
        // Very few enemies spread damage thin, but still somewhat effective
        enemyActionEconomyMod = Math.max(0.85, 1.0 - (actionRatio - 2) * 0.05); // Down to 85%
      } else if (actionRatio < 0.5) {
        // Extreme enemy advantage: outnumbered 2:1 or worse
        // Party spread too thin, can't focus effectively
        const inverseRatio = enemyActionCount / partyActionCount;
        partyActionEconomyMod = Math.max(0.85, 1.0 - (inverseRatio - 2) * 0.05); // Down to 85%
        enemyActionEconomyMod = 1.0 + Math.min((inverseRatio - 1) * 0.1, 0.25); // Up to +25%
      }
      // Between 0.5-2.0 ratio: relatively balanced, minimal adjustment
    }
    
    // Calculate effective DPR with action economy adjustments
    const partyBaseDPR = this.calculateEffectiveDPR(partyTotalDPR, partyHitChance);
    const enemyBaseDPR = this.calculateEffectiveDPR(enemyTotalDPR, enemyHitChance);
    
    const partyEffectiveDPR = partyBaseDPR * partyActionEconomyMod;
    const enemyEffectiveDPR = enemyBaseDPR * enemyActionEconomyMod;
    
    // Calculate rounds to defeat
    const roundsToDefeatEnemies = this.calculateRoundsToDefeat(enemyTotalHP, partyEffectiveDPR);
    const roundsToDefeatParty = this.calculateRoundsToDefeat(partyTotalHP, enemyEffectiveDPR);
    
    // Survival ratio
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;
    
    // Determine difficulty
    let difficulty: string;
    let difficultyColor: string;
    
    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) {
      difficulty = "Trivial";
      difficultyColor = "#888888";
    } else if (survivalRatio >= 2.5) {
      difficulty = "Easy";
      difficultyColor = "#00aa00";
    } else if (survivalRatio >= 1.5) {
      difficulty = "Medium";
      difficultyColor = "#aaaa00";
    } else if (survivalRatio >= 1.0) {
      difficulty = "Hard";
      difficultyColor = "#ff8800";
    } else if (survivalRatio >= 0.6) {
      difficulty = "Deadly";
      difficultyColor = "#ff0000";
    } else {
      difficulty = "TPK Risk";
      difficultyColor = "#880000";
    }
    
    // Generate summary
    let summary = "";
    if (partyMembers.length === 0) {
      summary = `⚠️ No party found. Using default 4-player party (Level 3).\\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
    } else {
      summary = `Party: ${memberCount} members (Avg Level ${avgLevel.toFixed(1)})\\n`;
      summary += `Enemies: ${enemyCount} creatures\\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}`;
    }
    
    return {
      enemyStats: {
        totalHP: enemyTotalHP,
        avgAC: avgEnemyAC,
        totalDPR: enemyTotalDPR,
        avgAttackBonus: avgEnemyAttackBonus,
        creatureCount: enemyCount
      },
      partyStats: {
        totalHP: partyTotalHP,
        avgAC: avgPartyAC,
        totalDPR: partyTotalDPR,
        avgAttackBonus: avgPartyAttackBonus,
        memberCount: memberCount,
        avgLevel: avgLevel
      },
      analysis: {
        partyHitChance,
        enemyHitChance,
        partyEffectiveDPR,
        enemyEffectiveDPR,
        partyActionEconomyMod,
        enemyActionEconomyMod,
        roundsToDefeatEnemies,
        roundsToDefeatParty,
        survivalRatio,
        difficulty,
        difficultyColor,
        summary
      }
    };
  }

  generateUniqueId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper methods (copied from SceneCreationModal)
  getCRStats(cr: string | undefined): { hp: number; ac: number; dpr: number; attackBonus: number; xp: number } {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getCRStats(cr);
  }

  getLevelStats(level: number): { hp: number; ac: number; dpr: number; attackBonus: number } {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getLevelStats(level);
  }

  async getPartyForDifficulty(): Promise<Array<{ level: number; hp?: number; ac?: number }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getPartyForDifficulty();
  }

  calculateHitChance(attackBonus: number, targetAC: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateHitChance(attackBonus, targetAC);
  }

  calculateEffectiveDPR(baseDPR: number, hitChance: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateEffectiveDPR(baseDPR, hitChance);
  }

  calculateRoundsToDefeat(totalHP: number, effectiveDPR: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateRoundsToDefeat(totalHP, effectiveDPR);
  }

  async saveEncounter() {
    if (!this.encounterName.trim()) {
      new Notice("Please enter an encounter name");
      return;
    }

    if (this.creatures.length === 0) {
      new Notice("Please add at least one creature");
      return;
    }

    try {
      // Determine encounter folder path
      let encounterFolder = "z_Encounters";
      
      // Check if we're in a campaign context
      const activeCampaignFile = this.app.workspace.getActiveFile();
      if (activeCampaignFile) {
        const campaignFolder = this.findCampaignFolder(activeCampaignFile.path);
        if (campaignFolder) {
          encounterFolder = `${campaignFolder}/z_Encounters`;
          this.campaignPath = campaignFolder;
        }
      }

      // Create folder if it doesn't exist
      const folderExists = this.app.vault.getAbstractFileByPath(encounterFolder);
      if (!folderExists) {
        await this.app.vault.createFolder(encounterFolder);
      }

      // Generate encounter file content
      this.syncEncounterBuilder();
      const diffResult = await this.encounterBuilder.calculateEncounterDifficulty();
      const encounterContent = await this.generateEncounterContent(diffResult);

      // Save or update encounter file
      const fileName = `${this.encounterName}.md`;
      const encounterPath = `${encounterFolder}/${fileName}`;

      if (this.isEdit && this.originalEncounterPath !== encounterPath) {
        // If name changed, delete old file and create new one
        const oldFile = this.app.vault.getAbstractFileByPath(this.originalEncounterPath);
        if (oldFile instanceof TFile) {
          await this.app.vault.delete(oldFile);
        }
      }

      const existingFile = this.app.vault.getAbstractFileByPath(encounterPath);
      let fileToOpen: TFile;
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, encounterContent);
        new Notice(`Encounter "${this.encounterName}" updated!`);
        fileToOpen = existingFile;
      } else {
        const newFile = await this.app.vault.create(encounterPath, encounterContent);
        new Notice(`Encounter "${this.encounterName}" created!`);
        fileToOpen = newFile;
      }

      // Save to Initiative Tracker
      await this.saveToInitiativeTracker(encounterPath);

      this.close();
      
      // Open the encounter note
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(fileToOpen);
    } catch (error) {
      console.error("Error saving encounter:", error);
      new Notice("Error saving encounter");
    }
  }

  findCampaignFolder(filePath: string): string | null {
    // Look for campaign folder in path (folders containing "ttrpgs" subdirectory)
    const parts = filePath.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const potentialCampaign = parts.slice(0, i + 1).join('/');
      const ttrpgPath = `${potentialCampaign}/ttrpgs`;
      if (this.app.vault.getAbstractFileByPath(ttrpgPath)) {
        return potentialCampaign;
      }
    }
    return null;
  }

  escapeYamlString(str: string): string {
    if (!str) return '""';
    // Use single quotes for YAML strings - only need to escape single quotes within
    // Single quotes are safer as they don't interpret escape sequences
    if (str.includes("'")) {
      // If string contains single quotes, double them (YAML escaping for single quotes)
      return "'" + str.replace(/'/g, "''") + "'";
    }
    // If no single quotes, just wrap in single quotes
    return "'" + str + "'";
  }

  async generateEncounterContent(diffResult: any): Promise<string> {
    const currentDate = window.moment().format("YYYY-MM-DD");

    let frontmatter = `---
type: encounter
name: ${this.escapeYamlString(this.encounterName)}
creatures:`;

    for (const creature of this.creatures) {
      frontmatter += `\n  - name: ${this.escapeYamlString(creature.name)}
    count: ${creature.count}`;
      if (creature.hp) frontmatter += `\n    hp: ${creature.hp}`;
      if (creature.ac) frontmatter += `\n    ac: ${creature.ac}`;
      if (creature.cr) frontmatter += `\n    cr: ${this.escapeYamlString(creature.cr)}`;
      if (creature.source) frontmatter += `\n    source: ${this.escapeYamlString(creature.source)}`;
      if (creature.path) frontmatter += `\n    path: ${this.escapeYamlString(creature.path)}`;
    }

    frontmatter += `
include_party: ${this.includeParty}
use_color_names: ${this.useColorNames}`;

  if (this.selectedPartyId) frontmatter += `\nselected_party_id: ${this.escapeYamlString(this.selectedPartyId)}`;
  if (this.selectedPartyName) frontmatter += `\nselected_party_name: ${this.escapeYamlString(this.selectedPartyName)}`;

    if (this.adventurePath) frontmatter += `\nadventure_path: ${this.escapeYamlString(this.adventurePath)}`;
    if (this.scenePath) frontmatter += `\nscene_path: ${this.escapeYamlString(this.scenePath)}`;
    if (this.campaignPath) frontmatter += `\ncampaign_path: ${this.escapeYamlString(this.campaignPath)}`;

    frontmatter += `
difficulty:
  rating: ${this.escapeYamlString(diffResult.analysis.difficulty)}
  color: ${this.escapeYamlString(diffResult.analysis.difficultyColor)}
  party_count: ${diffResult.partyStats.memberCount}
  party_avg_level: ${diffResult.partyStats.avgLevel.toFixed(1)}
  party_total_hp: ${diffResult.partyStats.totalHP}
  party_avg_ac: ${diffResult.partyStats.avgAC.toFixed(1)}
  party_total_dpr: ${diffResult.partyStats.totalDPR.toFixed(1)}
  party_hit_chance: ${(diffResult.analysis.partyHitChance * 100).toFixed(0)}
  party_effective_dpr: ${diffResult.analysis.partyEffectiveDPR.toFixed(0)}
  enemy_count: ${diffResult.enemyStats.creatureCount}
  enemy_total_hp: ${diffResult.enemyStats.totalHP}
  enemy_avg_ac: ${diffResult.enemyStats.avgAC.toFixed(1)}
  enemy_total_dpr: ${diffResult.enemyStats.totalDPR.toFixed(1)}
  enemy_hit_chance: ${(diffResult.analysis.enemyHitChance * 100).toFixed(0)}
  enemy_effective_dpr: ${diffResult.analysis.enemyEffectiveDPR.toFixed(0)}
  rounds_to_defeat: ${diffResult.analysis.roundsToDefeatEnemies}
  rounds_party_survives: ${diffResult.analysis.roundsToDefeatParty}
  survival_ratio: ${diffResult.analysis.survivalRatio.toFixed(2)}
date: ${currentDate}
---`;

    const content = `${frontmatter}

# ${this.encounterName}

\`\`\`dataviewjs
// Create action buttons
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Open Initiative Tracker and load encounter button
const openTrackerBtn = buttonContainer.createEl("button", { 
  text: "⚔️ Open & Load in Tracker",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--interactive-accent); color: var(--text-on-accent);" }
});
openTrackerBtn.addEventListener("click", async () => {
  const encounterName = dv.current().name;
  const initiativeTracker = app.plugins?.plugins?.["initiative-tracker"];
  
  if (!initiativeTracker) {
    new Notice("Initiative Tracker plugin not found");
    return;
  }
  
  const encounter = initiativeTracker.data?.encounters?.[encounterName];
  if (!encounter) {
    new Notice("Encounter \\"" + encounterName + "\\" not found. Try recreating it.");
    return;
  }
  
  // Use Initiative Tracker's internal tracker API to load the encounter
  try {
    if (initiativeTracker.tracker?.new) {
      initiativeTracker.tracker.new(initiativeTracker, encounter);
      new Notice("✅ Loaded encounter: " + encounterName);
    } else {
      new Notice("⚠️ Could not load encounter. Try using Load Encounter from Initiative Tracker menu.");
    }
  } catch (e) {
    console.error("Error loading encounter:", e);
    new Notice("⚠️ Could not load encounter: " + e.message);
  }
  
  // Open Initiative Tracker view
  app.commands.executeCommandById("initiative-tracker:open-tracker");
});

// Edit button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-encounter");
});

// Delete button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-encounter");
});
\`\`\`

---

## Difficulty Analysis

\`\`\`dataviewjs
const diff = dv.current().difficulty;
if (!diff) {
  dv.paragraph("*No difficulty data available.*");
} else {
  // Create difficulty card
  const card = dv.el("div", "", { cls: "dnd-difficulty-card" });
  
  // Header with difficulty badge and rounds
  const header = dv.el("div", "", { cls: "dnd-difficulty-header", container: card });
  const badge = dv.el("span", diff.rating, { cls: "dnd-difficulty-badge", container: header });
  badge.style.backgroundColor = diff.color;
  dv.el("span", \` ~\${diff.rounds_to_defeat} round\${diff.rounds_to_defeat !== 1 ? 's' : ''}\`, { cls: "dnd-rounds-estimate", container: header });
  
  // Stats grid
  const grid = dv.el("div", "", { cls: "dnd-difficulty-stats-grid", container: card });
  
  // Party column
  const partyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`⚔️ Party (\${diff.party_count})\`, { container: partyCol });
  const partyStats = dv.el("div", "", { container: partyCol });
  partyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.party_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.party_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.party_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.party_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.party_effective_dpr}</strong></div>
  \`;
  
  // Enemy column
  const enemyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`👹 Enemies (\${diff.enemy_count})\`, { container: enemyCol });
  const enemyStats = dv.el("div", "", { container: enemyCol });
  enemyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.enemy_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.enemy_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.enemy_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.enemy_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.enemy_effective_dpr}</strong></div>
  \`;
  
  // 3-round analysis
  const analysis = dv.el("div", "", { cls: "dnd-difficulty-analysis", container: card });
  const partyDamage3 = diff.party_effective_dpr * 3;
  const enemyDamage3 = diff.enemy_effective_dpr * 3;
  const partyHPAfter3 = Math.max(0, diff.party_total_hp - enemyDamage3);
  const enemyHPAfter3 = Math.max(0, diff.enemy_total_hp - partyDamage3);
  const partyHPPercent = Math.round((partyHPAfter3 / diff.party_total_hp) * 100);
  const enemyHPPercent = Math.round((enemyHPAfter3 / diff.enemy_total_hp) * 100);
  
  analysis.innerHTML = \`
    <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
    <div>Party deals: <strong>\${Math.round(partyDamage3)}</strong> damage → Enemies at <strong>\${Math.round(enemyHPAfter3)}</strong> HP (\${enemyHPPercent}%)</div>
    <div>Enemies deal: <strong>\${Math.round(enemyDamage3)}</strong> damage → Party at <strong>\${Math.round(partyHPAfter3)}</strong> HP (\${partyHPPercent}%)</div>
    <div style="margin-top: 8px; opacity: 0.8;">
      Survival Ratio: \${diff.survival_ratio}
      (Party can survive \${diff.rounds_party_survives} rounds, enemies survive \${diff.rounds_to_defeat} rounds)
    </div>
  \`;
}
\`\`\`

---

## Creatures

\`\`\`dataviewjs
const creatures = dv.current().creatures || [];

if (creatures.length === 0) {
  dv.paragraph("*No creatures in this encounter.*");
} else {
  const table = creatures.map(c => {
    return [
      c.name,
      c.count || 1,
      c.cr || "?",
      c.hp || "?",
      c.ac || "?"
    ];
  });
  
  dv.table(["Creature", "Count", "CR", "HP", "AC"], table);
}
\`\`\`

---

## GM Notes

_Add notes about tactics, environment, or special conditions here._
`;

    return content;
  }

  async saveToInitiativeTracker(encounterPath: string) {
    try {
      const initiativeTracker = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativeTracker) {
        console.log("Initiative Tracker plugin not found - skipping encounter save to tracker");
        new Notice("⚠️ Initiative Tracker not found. Encounter saved to vault only.");
        return;
      }

      // Build creature list for initiative tracker
      const creatures: any[] = [];

      // Add party members if requested
      if (this.includeParty && this.selectedPartyMembers.length > 0) {
        try {
          this.syncEncounterBuilder();
          const selectedPlayers = await this.encounterBuilder.getSelectedPartyPlayers();
          console.log("Adding party members to encounter:", selectedPlayers.length);
          for (const player of selectedPlayers) {
            const hp = player.hp || player.currentMaxHP || 20;
            const ac = player.ac || player.currentAC || 14;
            creatures.push({
              name: player.name || "Player",
              display: "",
              initiative: 0,
              static: false,
              modifier: Math.floor(((player.level || 1) - 1) / 4) + 2,
              hp: hp,
              currentMaxHP: hp,
              currentHP: hp,
              tempHP: player.thp || 0,
              ac: ac,
              currentAC: ac,
              id: this.generateUniqueId(),
              status: [],
              enabled: true,
              active: false,
              hidden: false,
              friendly: true,
              player: true,
              rollHP: false
            });
          }
        } catch (error) {
          console.error("Error getting party members for Initiative Tracker:", error);
        }
      }

      // Helper function to generate unique IDs like Initiative Tracker does
      const generateId = () => {
        const chars = '0123456789abcdef';
        let id = 'ID_';
        for (let i = 0; i < 12; i++) {
          id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
      };

      // Color names for duplicate creatures
      const colors = [
        "Red", "Blue", "Green", "Yellow", "Purple", "Orange", 
        "Pink", "Brown", "Black", "White", "Gray", "Cyan", 
        "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold", 
        "Silver", "Bronze"
      ];

      // Build creature data in Initiative Tracker format using flatMap
      const enemyCreatures = this.creatures.flatMap(c => {
        console.log(`Building creature: ${c.name}, HP: ${c.hp}, AC: ${c.ac}`);
        const instances = [];
        for (let i = 0; i < c.count; i++) {
          const hp = c.hp || 1;
          const ac = c.ac || 10;

          // Determine name and display based on useColorNames setting
          // IMPORTANT: 'name' is used for bestiary lookup and must be the base creature name
          // 'display' is used for visual representation in the tracker
          // Initiative Tracker will auto-number duplicate display names (Zombie -> Zombie 1, Zombie 2)
          let displayName = c.name;  // Always show at least the creature name

          if (c.count > 1 && this.useColorNames) {
            const colorIndex = i % colors.length;
            // Use display for color names
            displayName = `${c.name} (${colors[colorIndex]})`;
          }
          // For single creatures or multiple without colors, display is just the creature name
          // Initiative Tracker will add numbers automatically for duplicates

          const creature = {
            name: c.name,  // Base creature name for bestiary lookup
            display: displayName,  // Display name (always has a value now)
            initiative: 0,
            static: false,
            modifier: 0,  // Initiative modifier
            hp: hp,
            currentMaxHP: hp,  // Initiative Tracker uses currentMaxHP, not max
            cr: c.cr || undefined,
            ac: ac,  // AC as number
            currentAC: ac,  // Initiative Tracker also tracks currentAC
            id: generateId(),  // CRITICAL: Unique ID for each creature instance
            currentHP: hp,  // Initiative Tracker uses currentHP, not hp
            tempHP: 0,  // Initiative Tracker uses tempHP, not temp
            status: [],  // Array of status effects
            enabled: true,
            active: false,  // Whether this creature is currently active in turn order
            hidden: false,  // Hidden from players
            friendly: false,  // Friendly to players
            rollHP: false  // Whether to roll HP when adding to tracker
          };
          console.log(`Created creature instance:`, creature);
          instances.push(creature);
        }
        return instances;
      });

      // Add enemy creatures to the main creatures array
      creatures.push(...enemyCreatures);

      console.log(`Saving encounter "${this.encounterName}" with ${creatures.length} creatures to Initiative Tracker`);
      console.log("Initiative Tracker data structure available:", !!initiativeTracker.data);
      console.log("Initiative Tracker saveSettings available:", !!initiativeTracker.saveSettings);

      // Save encounter to Initiative Tracker's data structure
      if (initiativeTracker.data) {
        // Initialize encounters object if it doesn't exist
        if (!initiativeTracker.data.encounters) {
          console.log("Initializing encounters object in Initiative Tracker data");
          initiativeTracker.data.encounters = {};
        }

        console.log("Current encounters in Initiative Tracker:", Object.keys(initiativeTracker.data.encounters));

        // Save encounter in Initiative Tracker format
        initiativeTracker.data.encounters[this.encounterName] = {
          creatures: creatures,
          state: false,
          name: this.encounterName,
          round: 1,
          logFile: null,
          rollHP: false
        };

        console.log(`Encounter "${this.encounterName}" added to data.encounters`);

        // Persist the data
        if (initiativeTracker.saveSettings) {
          await initiativeTracker.saveSettings();
          console.log(`✓ Successfully saved encounter "${this.encounterName}" to Initiative Tracker`);
          new Notice(`✓ Encounter saved to Initiative Tracker with ${creatures.length} creatures`);
        } else {
          console.warn("Initiative Tracker doesn't have saveSettings method");
          new Notice("⚠️ Could not persist encounter to Initiative Tracker");
        }
      } else {
        console.warn("Initiative Tracker data not accessible");
        new Notice("⚠️ Initiative Tracker data not accessible - encounter saved to vault only");
      }
    } catch (error) {
      console.error("Error saving to Initiative Tracker:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`⚠️ Error saving to Initiative Tracker: ${errorMessage}`);
    }
  }

  async deleteEncounter() {
    if (!this.isEdit) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.contentEl.createEl("h3", { text: "Delete Encounter?" });
      modal.contentEl.createEl("p", { text: `Are you sure you want to delete "${this.encounterName}"?` });
      modal.contentEl.createEl("p", { 
        text: "This will remove the encounter file and remove it from the Initiative Tracker.", 
        cls: "mod-warning" 
      });

      const buttonContainer = modal.contentEl.createDiv();
      buttonContainer.style.display = "flex";
      buttonContainer.style.justifyContent = "flex-end";
      buttonContainer.style.gap = "10px";
      buttonContainer.style.marginTop = "20px";

      const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
      cancelBtn.onclick = () => {
        modal.close();
        resolve(false);
      };

      const deleteBtn = buttonContainer.createEl("button", { text: "Delete", cls: "mod-warning" });
      deleteBtn.onclick = () => {
        modal.close();
        resolve(true);
      };

      modal.open();
    });

    if (!confirmed) return;

    try {
      // Delete the encounter file
      const file = this.app.vault.getAbstractFileByPath(this.originalEncounterPath);
      if (file instanceof TFile) {
        await this.app.vault.delete(file);
        console.log(`Deleted encounter file: ${this.originalEncounterPath}`);
      }

      // Remove from Initiative Tracker
      const initiativeTracker = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      console.log("Initiative Tracker plugin found:", !!initiativeTracker);
      
      if (initiativeTracker?.data?.encounters) {
        console.log("Current encounters in Initiative Tracker:", Object.keys(initiativeTracker.data.encounters));
        console.log(`Attempting to delete encounter: "${this.encounterName}"`);
        console.log("Encounter exists in data:", !!initiativeTracker.data.encounters[this.encounterName]);
        
        if (initiativeTracker.data.encounters[this.encounterName]) {
          delete initiativeTracker.data.encounters[this.encounterName];
          console.log(`✓ Deleted encounter "${this.encounterName}" from data.encounters`);
          
          if (initiativeTracker.saveSettings) {
            await initiativeTracker.saveSettings();
            console.log("✓ Initiative Tracker settings saved after deletion");
            new Notice(`✓ Encounter deleted from Initiative Tracker`);
          } else {
            console.warn("Initiative Tracker saveSettings not available");
            new Notice("⚠️ Could not persist deletion to Initiative Tracker");
          }
        } else {
          console.warn(`Encounter "${this.encounterName}" not found in Initiative Tracker`);
          new Notice("⚠️ Encounter not found in Initiative Tracker");
        }
      } else {
        console.warn("Initiative Tracker data.encounters not accessible");
        new Notice("⚠️ Initiative Tracker data not accessible");
      }

      new Notice(`Encounter "${this.encounterName}" deleted from vault`);
      this.close();
    } catch (error) {
      console.error("Error deleting encounter:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Error deleting encounter: ${errorMessage}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

const SESSION_PREP_VIEW_TYPE = "session-prep-dashboard";
const SESSION_RUN_VIEW_TYPE = "session-run-dashboard";
const DM_SCREEN_VIEW_TYPE = "dm-screen";

export default class DndCampaignHubPlugin extends Plugin {
  settings!: DndCampaignHubSettings;
  SessionCreationModal = SessionCreationModal;
  migrationManager!: MigrationManager;
  encounterBuilder!: EncounterBuilder;
  mapManager!: MapManager;

  async onload() {
    await this.loadSettings();

    // Register the Session Prep Dashboard view
    this.registerView(
      SESSION_PREP_VIEW_TYPE,
      (leaf) => new SessionPrepDashboardView(leaf, this)
    );

    // Register the Session Run Dashboard view
    this.registerView(
      SESSION_RUN_VIEW_TYPE,
      (leaf) => new SessionRunDashboardView(leaf, this)
    );

    // Register the DM Screen view
    this.registerView(
      DM_SCREEN_VIEW_TYPE,
      (leaf) => new DMScreenView(leaf, this)
    );

    // Initialize the migration manager
    this.migrationManager = new MigrationManager(this.app, this);
    
    // Initialize the encounter builder
    this.encounterBuilder = new EncounterBuilder(this.app, this);

    // Initialize the map manager
    this.mapManager = new MapManager(this.app);

    // Register markdown code block processor for rendering maps
    this.registerMarkdownCodeBlockProcessor('dnd-map', (source, el, ctx) => {
      this.renderMapView(source, el, ctx);
    });

    console.log("D&D Campaign Hub: Plugin loaded");

    // Check for version updates
    await this.checkForUpdates();

    // Add the main command with configurable hotkey
    this.addCommand({
      id: "open-dnd-hub",
      name: "Open D&D Campaign Hub",
      callback: () => {
        new DndHubModal(this.app, this).open();
      },
      hotkeys: [
        {
          modifiers: ["Ctrl", "Shift"],
          key: "M",
        },
      ],
    });

    this.addCommand({
      id: "initialize-dnd-hub",
      name: "Initialize D&D Campaign Hub",
      callback: async () => {
        if (this.isVaultInitialized()) {
          new Notice("D&D Campaign Hub is already initialized in this vault.");
          return;
        }
        await this.initializeVault();
      },
    });

    this.addCommand({
      id: "update-dnd-hub-templates",
      name: "Migrate D&D Hub Files",
      callback: () => {
        if (!this.isVaultInitialized()) {
          new Notice("Initialize D&D Campaign Hub before migrating files.");
          return;
        }
        this.migrateTemplates();
      },
    });

    // Add commands for the features available in the preview release
    this.addCommand({
      id: "create-campaign",
      name: "Create New Campaign",
      callback: () => this.createCampaign(),
    });

    this.addCommand({
      id: "create-session",
      name: "Create New Session",
      callback: () => this.createSession(),
    });

    this.addCommand({
      id: "session-prep-dashboard",
      name: "Open Session Prep Dashboard",
      callback: () => this.openSessionPrepDashboard(),
    });

    this.addCommand({
      id: "session-run-dashboard",
      name: "Open Session Run Dashboard",
      callback: () => this.openSessionRunDashboard(),
    });

    this.addCommand({
      id: "create-npc",
      name: "Create New NPC",
      callback: () => this.createNpc(),
    });

    this.addCommand({
      id: "create-pc",
      name: "Create New PC",
      callback: () => this.createPc(),
    });

    this.addCommand({
      id: "create-faction",
      name: "Create New Faction",
      callback: () => this.createFaction(),
    });

    this.addCommand({
      id: "create-adventure",
      name: "Create New Adventure",
      callback: () => this.createAdventure(),
    });

    this.addCommand({
      id: "create-spell",
      name: "Create New Spell",
      callback: () => this.createSpell(),
    });

    this.addCommand({
      id: "create-map",
      name: "🗺️ Create Battle Map",
      callback: () => this.createMap(),
    });

    this.addCommand({
      id: "create-scene",
      name: "Create New Scene",
      callback: () => this.createScene(),
    });

    this.addCommand({
      id: "edit-scene",
      name: "Edit Scene",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editScene(file.path);
        } else {
          new Notice("Please open a scene note first");
        }
      },
    });

    this.addCommand({
      id: "delete-scene",
      name: "Delete Scene",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "scene") {
            const sceneName = cache.frontmatter.name || file.basename;
            const encounterName = cache.frontmatter.tracker_encounter;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              console.log(`Deleted scene file: ${file.path}`);
              
              // Remove encounter from Initiative Tracker if it exists
              if (encounterName) {
                const initiativeTracker = (this.app as any).plugins?.plugins?.["initiative-tracker"];
                console.log("Initiative Tracker plugin found:", !!initiativeTracker);
                
                if (initiativeTracker?.data?.encounters) {
                  console.log(`Attempting to delete encounter: "${encounterName}"`);
                  
                  if (initiativeTracker.data.encounters[encounterName]) {
                    delete initiativeTracker.data.encounters[encounterName];
                    console.log(`✓ Deleted encounter "${encounterName}" from data.encounters`);
                    
                    if (initiativeTracker.saveSettings) {
                      await initiativeTracker.saveSettings();
                      console.log("✓ Initiative Tracker settings saved after deletion");
                      new Notice(`✓ Scene "${sceneName}" and its encounter deleted`);
                    } else {
                      console.warn("Initiative Tracker saveSettings not available");
                      new Notice(`⚠️ Scene deleted but could not persist encounter deletion`);
                    }
                  } else {
                    console.warn(`Encounter "${encounterName}" not found in Initiative Tracker`);
                    new Notice(`✓ Scene "${sceneName}" deleted from vault`);
                  }
                } else {
                  console.warn("Initiative Tracker data.encounters not accessible");
                  new Notice(`✓ Scene "${sceneName}" deleted from vault`);
                }
              } else {
                new Notice(`✓ Scene "${sceneName}" deleted from vault`);
              }
            }
          } else {
            new Notice("This is not a scene note");
          }
        } else {
          new Notice("Please open a scene note first");
        }
      },
    });

    this.addCommand({
      id: "create-trap",
      name: "Create New Trap",
      callback: () => this.createTrap(),
    });

    this.addCommand({
      id: "edit-trap",
      name: "Edit Trap",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editTrap(file.path);
        } else {
          new Notice("Please open a trap note first");
        }
      },
    });

    this.addCommand({
      id: "delete-trap",
      name: "Delete Trap",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "trap") {
            const trapName = cache.frontmatter.trap_name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete trap statblocks from Fantasy Statblocks first
              await this.deleteTrapStatblocks(trapName);
              
              // Delete from vault
              await this.app.vault.delete(file);
              console.log(`Deleted trap file: ${file.path}`);
              
              new Notice(`✓ Trap "${trapName}" deleted`);
            }
          } else {
            new Notice("This is not a trap note");
          }
        } else {
          new Notice("Please open a trap note first");
        }
      },
    });

    this.addCommand({
      id: "create-item",
      name: "⚔️ Create New Item",
      callback: () => this.createItem(),
    });

    this.addCommand({
      id: "edit-item",
      name: "Edit Item",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editItem(file.path);
        } else {
          new Notice("Please open an item note first");
        }
      },
    });

    this.addCommand({
      id: "delete-item",
      name: "Delete Item",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "item") {
            const itemName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              console.log(`Deleted item file: ${file.path}`);
              
              new Notice(`✓ Item "${itemName}" deleted`);
            }
          } else {
            new Notice("This is not an item note");
          }
        } else {
          new Notice("Please open an item note first");
        }
      },
    });

    this.addCommand({
      id: "create-creature",
      name: "🐉 Create New Creature",
      callback: () => this.createCreature(),
    });

    this.addCommand({
      id: "edit-creature",
      name: "Edit Creature",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editCreature(file.path);
        } else {
          new Notice("Please open a creature note first");
        }
      },
    });

    this.addCommand({
      id: "delete-creature",
      name: "Delete Creature",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.statblock === true) {
            const creatureName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              console.log(`Deleted creature file: ${file.path}`);
              
              // Delete from Fantasy Statblocks plugin
              await this.deleteCreatureStatblock(creatureName);
              
              new Notice(`✓ Creature "${creatureName}" deleted`);
            }
          } else {
            new Notice("This is not a creature note");
          }
        } else {
          new Notice("Please open a creature note first");
        }
      },
    });

    this.addCommand({
      id: "create-encounter",
      name: "Create New Encounter",
      callback: () => this.createEncounter(),
    });

    this.addCommand({
      id: "edit-encounter",
      name: "Edit Encounter",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editEncounter(file.path);
        } else {
          new Notice("Please open an encounter note first");
        }
      },
    });

    // Register file watcher for encounter modifications
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file instanceof TFile && file.path.startsWith('z_Encounters/')) {
          console.log(`[File Watcher] Encounter modified: ${file.path}`);
          // Wait for metadata cache to update
          setTimeout(async () => {
            await this.syncEncounterToScenes(file);
          }, 100);
        }
      })
    );

    this.addCommand({
      id: "delete-encounter",
      name: "Delete Encounter",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "encounter") {
            const encounterName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              console.log(`Deleted encounter file: ${file.path}`);
              
              // Remove from Initiative Tracker
              const initiativeTracker = (this.app as any).plugins?.plugins?.["initiative-tracker"];
              console.log("Initiative Tracker plugin found:", !!initiativeTracker);
              
              if (initiativeTracker?.data?.encounters) {
                console.log("Current encounters in Initiative Tracker:", Object.keys(initiativeTracker.data.encounters));
                console.log(`Attempting to delete encounter: "${encounterName}"`);
                console.log("Encounter exists in data:", !!initiativeTracker.data.encounters[encounterName]);
                
                if (initiativeTracker.data.encounters[encounterName]) {
                  delete initiativeTracker.data.encounters[encounterName];
                  console.log(`✓ Deleted encounter "${encounterName}" from data.encounters`);
                  
                  if (initiativeTracker.saveSettings) {
                    await initiativeTracker.saveSettings();
                    console.log("✓ Initiative Tracker settings saved after deletion");
                    new Notice(`✓ Encounter "${encounterName}" deleted from vault and Initiative Tracker`);
                  } else {
                    console.warn("Initiative Tracker saveSettings not available");
                    new Notice(`⚠️ Encounter deleted from vault but could not persist deletion to Initiative Tracker`);
                  }
                } else {
                  console.warn(`Encounter "${encounterName}" not found in Initiative Tracker`);
                  new Notice(`⚠️ Encounter deleted from vault but not found in Initiative Tracker`);
                }
              } else {
                console.warn("Initiative Tracker data.encounters not accessible");
                new Notice(`⚠️ Encounter deleted from vault but Initiative Tracker data not accessible`);
              }
            }
          } else {
            new Notice("This is not an encounter note");
          }
        } else {
          new Notice("Please open an encounter note first");
        }
      },
    });

    this.addCommand({
      id: "purge-vault",
      name: "Purge D&D Campaign Hub Data",
      callback: () => {
        new PurgeConfirmModal(this.app, this).open();
      },
    });

    this.addSettingTab(new DndCampaignHubSettingTab(this.app, this));
  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Check if plugin has been updated and notify user
	 */
	async checkForUpdates() {
		const manifest = this.manifest;
		const currentVersion = manifest.version;
		const savedVersion = this.settings.pluginVersion;

		if (savedVersion !== currentVersion) {
			// Plugin was updated
			if (savedVersion !== "0.0.0") {
				new Notice(`D&D Campaign Hub updated to v${currentVersion}! Use "Migrate D&D Hub Files" to safely update your existing files.`, 10000);
			}
			
			// Update saved version
			this.settings.pluginVersion = currentVersion;
			await this.saveSettings();
		}
	}

	/**
	 * Migrate template files safely without data loss
	 */
	async migrateTemplates() {
		// Show migration modal
		new MigrationModal(this.app, this).open();
	}

	/**
	 * Check if the vault has been initialized with the required folder structure
	 */
	isVaultInitialized(): boolean {
		const requiredFolders = [
			"z_Templates",
			"z_Assets",
			"z_Beastiarity",
			"z_Databases",
			"z_Dataviews",
			"z_Daten",
			"z_Decks",
			"z_Log",
			"z_Scripts",
			"z_SessionTranscripts",
			"z_Tables",
			"ttrpgs"
		];

		return requiredFolders.every(folder => {
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			return folderExists instanceof TFolder;
		});
	}

  /**
   * Purge all D&D Campaign Hub files and folders from the vault
   */
  async purgeVault() {
		const foldersToRemove = [
			"z_Templates",
			"z_Assets",
			"z_Beastiarity",
			"z_Databases",
			"z_Dataviews",
			"z_Daten",
			"z_Decks",
			"z_Log",
			"z_Scripts",
			"z_SessionTranscripts",
			"z_Tables",
			"z_Spells",
			"z_AbilityScores",
			"z_Classes",
			"z_Conditions",
			"z_DamageTypes",
			"z_Equipment",
			"z_Features",
			"z_Languages",
			"z_MagicSchools",
			"z_Proficiencies",
			"z_Races",
			"z_Skills",
			"z_Subclasses",
			"z_Subraces",
			"z_Traits",
			"z_WeaponProperties",
			"ttrpgs"
		];

		let removedCount = 0;
		let errors: string[] = [];

		for (const folderPath of foldersToRemove) {
			try {
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (folder instanceof TFolder) {
					await this.app.vault.delete(folder, true); // true = recursive delete
					removedCount++;
				}
			} catch (error) {
				errors.push(`${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (errors.length > 0) {
			new Notice(`Purge completed with errors. Removed ${removedCount} folders. Errors: ${errors.join(", ")}`);
		} else {
			new Notice(`Successfully purged ${removedCount} D&D Campaign Hub folders.`);
		}
	}

  /**
   * Install required community plugins
   */
  async installRequiredPlugins() {
    const requiredPlugins = [
      {
        id: "buttons",
        name: "Buttons",
        repo: "shabegom/buttons",
        version: "0.5.1"
      },
      {
        id: "dataview",
        name: "Dataview",
        repo: "blacksmithgu/obsidian-dataview",
        version: "0.5.68"
      },
      {
        id: "calendarium",
        name: "Calendarium",
        repo: "javalent/calendarium",
        version: "2.1.0"
      },
      {
        id: "initiative-tracker",
        name: "Initiative Tracker",
        repo: "javalent/initiative-tracker",
        version: "9.2.5"
      }
    ];

    new Notice("Installing required plugins...");

    for (const plugin of requiredPlugins) {
      try {
        await this.installPlugin(plugin);
      } catch (error) {
        console.error(`Failed to install ${plugin.name}:`, error);
        new Notice(`Failed to install ${plugin.name}. Please install manually.`);
      }
    }

    // Enable the plugins programmatically
    await this.enablePlugins(requiredPlugins.map(p => p.id));

    new Notice("Required plugins installed! Please reload Obsidian (Ctrl+R) to activate them.");
  }

  /**
   * Install a single plugin from GitHub
   */
  async installPlugin(plugin: { id: string; name: string; repo: string; version: string }) {
    const adapter = this.app.vault.adapter;
    const pluginsFolder = `.obsidian/plugins`;
    const pluginPath = `${pluginsFolder}/${plugin.id}`;

    // Check if plugin already exists
    const exists = await adapter.exists(pluginPath);
    if (exists) {
      console.log(`Plugin ${plugin.name} already installed`);
      return;
    }

    // Create plugin directory
    await adapter.mkdir(pluginPath);

    // Download manifest.json using Obsidian's requestUrl to bypass CORS
    const manifestUrl = `https://raw.githubusercontent.com/${plugin.repo}/HEAD/manifest.json`;
    const manifestResponse = await requestUrl({ url: manifestUrl });
    const manifest = manifestResponse.text;
    await adapter.write(`${pluginPath}/manifest.json`, manifest);

    // Download main.js from specific version
    const mainUrl = `https://github.com/${plugin.repo}/releases/download/${plugin.version}/main.js`;
    const mainResponse = await requestUrl({
      url: mainUrl,
      method: 'GET'
    });
    const mainJsArray = new Uint8Array(mainResponse.arrayBuffer);
    await adapter.writeBinary(`${pluginPath}/main.js`, mainJsArray.buffer);

    // Download styles.css if it exists
    try {
      const stylesUrl = `https://github.com/${plugin.repo}/releases/download/${plugin.version}/styles.css`;
      const stylesResponse = await requestUrl({ url: stylesUrl });
      await adapter.write(`${pluginPath}/styles.css`, stylesResponse.text);
    } catch (error) {
      // styles.css is optional
    }

    console.log(`Installed plugin: ${plugin.name}`);
  }

  /**
   * Enable plugins in community-plugins.json
   */
  async enablePlugins(pluginIds: string[]) {
    const adapter = this.app.vault.adapter;
    const configPath = `.obsidian/community-plugins.json`;

    let enabledPlugins: string[] = [];

    const exists = await adapter.exists(configPath);
    if (exists) {
      const content = await adapter.read(configPath);
      enabledPlugins = JSON.parse(content);
    }

    // Add new plugins if not already enabled
    for (const id of pluginIds) {
      if (!enabledPlugins.includes(id)) {
        enabledPlugins.push(id);
      }
    }

    await adapter.write(configPath, JSON.stringify(enabledPlugins, null, 2));
  }

  /**
   * Check if required dependencies are installed
   */
  async checkDependencies(): Promise<{ missing: string[]; installed: string[] }> {
    const requiredPlugins = [
      { id: "buttons", name: "Buttons" },
      { id: "dataview", name: "Dataview" },
      { id: "calendarium", name: "Calendarium" },
      { id: "templater-obsidian", name: "Templater" },
      { id: "initiative-tracker", name: "Initiative Tracker" }
    ];

    const installed: string[] = [];
    const missing: string[] = [];
    const enabledPlugins: Set<string> = (this.app as any).plugins?.enabledPlugins ?? new Set();

    for (const plugin of requiredPlugins) {
      if (enabledPlugins.has(plugin.id)) {
        installed.push(plugin.name);
      } else {
        missing.push(plugin.name);
      }
    }

    return { missing, installed };
  }

  /**
   * Show dependency status to user. Returns dependency summary for caller reuse.
   */
  async showDependencyModal(force = false, silentWhenSatisfied = false): Promise<{ missing: string[]; installed: string[] }> {
    const deps = await this.checkDependencies();
    if (deps.missing.length > 0 || force) {
      new DependencyModal(this.app, deps).open();
    } else if (!silentWhenSatisfied) {
      new Notice("All required D&D Campaign Hub plugins are already installed.");
    }

    return deps;
  }

	/**
	 * Initialize the vault with the required folder structure and templates
	 */
  async initializeVault() {
    new Notice("Initializing D&D Campaign Hub vault structure...");

    // Install required plugins first
    await this.installRequiredPlugins();

    // Verify dependencies before continuing
    const deps = await this.showDependencyModal(false, true);
    if (deps.missing.length > 0) {
      return;
    }

		// Create all required folders
		const foldersToCreate = [
			"z_Templates",
			"z_Assets",
			"z_Beastiarity", 
			"z_Databases",
			"z_Dataviews",
			"z_Daten",
			"z_Decks",
			"z_Log",
			"z_Scripts",
			"z_SessionTranscripts",
			"z_Tables",
			"z_Backups",
			"ttrpgs"
		];

		for (const folder of foldersToCreate) {
			try {
				await this.app.vault.createFolder(folder);
			} catch (error) {
				// Folder might already exist
			}
		}

		// Create template files
		await this.createTemplateFiles();

		// Configure plugin settings
		await this.configurePluginSettings();

		new Notice("Vault initialized successfully!");
	}

	/**
	 * Create template files in z_Templates folder
	 */
	async createTemplateFiles() {
		const templates = {
			"z_Templates/world.md": WORLD_TEMPLATE,
			"z_Templates/session-gm.md": SESSION_GM_TEMPLATE,
			"z_Templates/session-player.md": SESSION_PLAYER_TEMPLATE,
			"z_Templates/Frontmatter - NPC.md": NPC_TEMPLATE,
			"z_Templates/Frontmatter - Player Character.md": PC_TEMPLATE,
			"z_Templates/Frontmatter - Adventure.md": ADVENTURE_TEMPLATE,
			"z_Templates/Frontmatter - Faction.md": FACTION_TEMPLATE,
			"z_Templates/Frontmatter - Item.md": ITEM_TEMPLATE,
			"z_Templates/Frontmatter - Spell.md": SPELL_TEMPLATE,
		};

		for (const [path, content] of Object.entries(templates)) {
			try {
				// Check if file already exists
				const existingFile = this.app.vault.getAbstractFileByPath(path);
				if (existingFile instanceof TFile) {
					// Update existing template
					await this.app.vault.modify(existingFile, content);
				} else {
					// Create new template
					await this.app.vault.create(path, content);
				}
			} catch (error) {
				console.error(`Failed to create/update template ${path}:`, error);
			}
		}
	}

	/**
	 * Configure settings for integrated plugins
	 */
	async configurePluginSettings() {
		// Configure Templater
		try {
			const templaterSettings = {
				templates_folder: "z_Templates",
				user_scripts_folder: "z_Scripts",
				trigger_on_file_creation: true,
				enable_folder_templates: true,
				folder_templates: [
					{
						folder: "ttrpgs",
						template: "z_Templates/world.md"
					}
				]
			};
			
			// Note: We can't directly modify other plugin settings, but we can provide guidance
			console.log("D&D Campaign Hub: Suggested Templater settings:", templaterSettings);
		} catch (error) {
			console.error("Failed to configure Templater:", error);
		}

		// Configure Hide Folders
		try {
			const hideFoldersSettings = {
				attachmentFolderNames: ["startsWith::z_"],
				matchCaseInsensitive: true
			};
			console.log("D&D Campaign Hub: Suggested Hide Folders settings:", hideFoldersSettings);
		} catch (error) {
			console.error("Failed to configure Hide Folders:", error);
		}
	}

	async createCampaign() {
		// Open campaign creation modal instead of simple name prompt
		new CampaignCreationModal(this.app, this).open();
	}

	async createNpc() {
		// Check dependencies first
		const deps = await this.checkDependencies();
		if (deps.missing.length > 0) {
			new DependencyModal(this.app, deps).open();
			return;
		}
		
		// Open NPC creation modal instead of simple name prompt
		new NPCCreationModal(this.app, this).open();
	}

	async createPc() {
		// Open PC creation modal
		new PCCreationModal(this.app, this).open();
	}

	async createAdventure() {
		// Open Adventure creation modal
		new AdventureCreationModal(this.app, this).open();
	}

	async createScene() {
		// Open Scene creation modal
		new SceneCreationModal(this.app, this).open();
	}

	async createTrap() {
		// Open Trap creation modal
		new TrapCreationModal(this.app, this).open();
	}

	async editTrap(trapPath: string) {
		// Open Trap creation modal in edit mode
		new TrapCreationModal(this.app, this, undefined, undefined, trapPath).open();
	}

	async createItem() {
		// Open Item creation modal
		new ItemCreationModal(this.app, this).open();
	}

	async editItem(itemPath: string) {
		// Open Item creation modal in edit mode
		new ItemCreationModal(this.app, this, itemPath).open();
	}

	async createCreature() {
		// Open Creature creation modal
		new CreatureCreationModal(this.app, this).open();
	}

	async editCreature(creaturePath: string) {
		// Open Creature creation modal in edit mode
		new CreatureCreationModal(this.app, this, creaturePath).open();
	}

	async deleteCreatureStatblock(creatureName: string) {
		try {
			const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
			if (!statblocksPlugin) {
				console.warn("Fantasy Statblocks plugin not found.");
				return;
			}

			// Delete from bestiary
			const bestiary = statblocksPlugin.data?.bestiary || [];
			const index = bestiary.findIndex((c: any) => c.name === creatureName);
			
			if (index !== -1) {
				bestiary.splice(index, 1);
				await statblocksPlugin.saveSettings();
				console.log(`Deleted creature "${creatureName}" from Fantasy Statblocks`);
			}
		} catch (error) {
			console.error("Error deleting creature statblock:", error);
		}
	}

	async deleteTrapStatblocks(trapName: string) {
		try {
			const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
			if (!statblocksPlugin) {
				console.warn("Fantasy Statblocks plugin not found.");
				return;
			}

			const homebrewSource = `Trap: ${trapName}`;
			let deletedCount = 0;

			// Try to delete from data.monsters
			if (statblocksPlugin.data?.monsters && Array.isArray(statblocksPlugin.data.monsters)) {
				const originalLength = statblocksPlugin.data.monsters.length;
				
				// Remove all statblocks with matching source (includes all elements for complex traps)
				statblocksPlugin.data.monsters = statblocksPlugin.data.monsters.filter(
					(m: any) => m.source !== homebrewSource
				);
				
				deletedCount = originalLength - statblocksPlugin.data.monsters.length;
				
				if (deletedCount > 0) {
					// Save plugin data
					await statblocksPlugin.saveData(statblocksPlugin.data);
					console.log(`Deleted ${deletedCount} trap statblock(s) from Fantasy Statblocks`);
				}
			}
		} catch (error) {
			console.error("Error deleting trap statblocks:", error);
		}
	}

	async createEncounter() {
		// Open Encounter Builder modal
		new EncounterBuilderModal(this.app, this).open();
	}

	async editEncounter(encounterPath: string) {
		// Open Encounter Builder modal in edit mode
		new EncounterBuilderModal(this.app, this, encounterPath).open();
	}

	async editScene(scenePath: string) {
		// Open Scene creation modal in edit mode
		new SceneCreationModal(this.app, this, undefined, scenePath).open();
	}

	async confirmDelete(fileName: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText("Confirm Delete");
			modal.contentEl.createEl("p", { text: `Are you sure you want to delete "${fileName}"?` });
			modal.contentEl.createEl("p", { 
				text: "This action cannot be undone.", 
				attr: { style: "color: var(--text-error); font-weight: bold;" }
			});

			const buttonContainer = modal.contentEl.createDiv({ cls: "modal-button-container" });
			buttonContainer.style.display = "flex";
			buttonContainer.style.gap = "10px";
			buttonContainer.style.justifyContent = "flex-end";
			buttonContainer.style.marginTop = "20px";

			const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
			cancelBtn.onclick = () => {
				resolve(false);
				modal.close();
			};

			const deleteBtn = buttonContainer.createEl("button", { text: "Delete" });
			deleteBtn.style.backgroundColor = "var(--interactive-accent)";
			deleteBtn.style.color = "var(--text-on-accent)";
			deleteBtn.onclick = () => {
				resolve(true);
				modal.close();
			};

			modal.open();
		});
	}

	/**
	 * Sync encounter modifications back to linked scenes and Initiative Tracker
	 * Called when an encounter file is modified in z_Encounters folder
	 */
	async syncEncounterToScenes(encounterFile: TFile) {
		try {
			console.log(`[SyncEncounter] Starting sync for: ${encounterFile.path}`);

			// Wait a moment for metadata cache to update, then read file directly
			await new Promise(resolve => setTimeout(resolve, 100));

			// Read the file content directly and parse frontmatter
			const content = await this.app.vault.read(encounterFile);
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			
			if (!frontmatterMatch || !frontmatterMatch[1]) {
				console.log(`[SyncEncounter] No frontmatter found in encounter`);
				return;
			}

			// Parse YAML frontmatter manually
			const frontmatterText = frontmatterMatch[1];
			const lines = frontmatterText.split('\n');
			
			let encounterName = encounterFile.basename;
			let encounterCreatures: any[] = [];
			let encounterDifficulty = 'easy';
			let selectedPartyId: string | null = null;
			let useColorNames = false;
			
			// Parse creatures array
			let inCreaturesArray = false;
			let currentCreature: any = null;
			
			for (const line of lines) {
				const trimmed = line.trim();
				
				// Check for top-level fields (no indentation at start of line)
				const isTopLevel = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
				
				if (trimmed.startsWith('name:') && isTopLevel) {
					encounterName = trimmed.substring(5).trim().replace(/^["']|["']$/g, '');
				} else if (trimmed === 'creatures:' && isTopLevel) {
					inCreaturesArray = true;
					if (currentCreature) {
						encounterCreatures.push(currentCreature);
						currentCreature = null;
					}
				} else if (isTopLevel && trimmed.includes(':') && inCreaturesArray) {
					// Any top-level field ends the creatures array
					inCreaturesArray = false;
					if (currentCreature) {
						encounterCreatures.push(currentCreature);
						currentCreature = null;
					}
					
					// Process the field we just encountered
					if (trimmed.startsWith('selected_party_id:')) {
						selectedPartyId = trimmed.substring(18).trim().replace(/^["']|["']$/g, '') || null;
					} else if (trimmed.startsWith('use_color_names:')) {
						useColorNames = trimmed.substring(16).trim().toLowerCase() === 'true';
					}
				} else if (inCreaturesArray && trimmed.startsWith('- name:')) {
					if (currentCreature) {
						encounterCreatures.push(currentCreature);
					}
					currentCreature = {
						name: trimmed.substring(7).trim().replace(/^["']|["']$/g, ''),
						count: 1,
						hp: null,
						ac: null,
						cr: null,
						path: null,
						source: null
					};
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('count:')) {
					currentCreature.count = parseInt(trimmed.substring(6).trim());
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('hp:')) {
					currentCreature.hp = parseInt(trimmed.substring(3).trim());
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('ac:')) {
					currentCreature.ac = parseInt(trimmed.substring(3).trim());
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('cr:')) {
					currentCreature.cr = trimmed.substring(3).trim().replace(/^["']|["']$/g, '');
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('path:')) {
					currentCreature.path = trimmed.substring(5).trim().replace(/^["']|["']$/g, '');
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('source:')) {
					currentCreature.source = trimmed.substring(7).trim().replace(/^["']|["']$/g, '');
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('is_trap:')) {
					currentCreature.isTrap = trimmed.substring(8).trim().toLowerCase() === 'true';
				} else if (inCreaturesArray && currentCreature && trimmed.startsWith('trap_path:')) {
					// Store trap file path for later loading
					currentCreature.trapPath = trimmed.substring(10).trim().replace(/^["']|["']$/g, '');
				} else if (!inCreaturesArray && trimmed.startsWith('selected_party_id:')) {
					selectedPartyId = trimmed.substring(18).trim().replace(/^["']|["']$/g, '') || null;
				} else if (!inCreaturesArray && trimmed.startsWith('use_color_names:')) {
					useColorNames = trimmed.substring(16).trim().toLowerCase() === 'true';
				}
			}
			
			// Add last creature if exists
			if (currentCreature) {
				encounterCreatures.push(currentCreature);
			}

			console.log(`[SyncEncounter] Parsed encounter data:`, {
				name: encounterName,
				creatures: encounterCreatures.length,
				creaturesDetails: encounterCreatures,
				difficulty: encounterDifficulty,
				partyId: selectedPartyId,
				useColorNames
			});

			// Find all scenes that link to this encounter
			const encounterWikiLink = `[[${encounterFile.path}]]`;
			const scenesLinking: TFile[] = [];

			// Search through all scene files
			for (const file of this.app.vault.getMarkdownFiles()) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.type === 'scene') {
					const sceneEncounterFile = cache.frontmatter.encounter_file;
					if (sceneEncounterFile && 
						(sceneEncounterFile === encounterWikiLink || 
						 sceneEncounterFile === encounterFile.path ||
						 sceneEncounterFile.includes(encounterFile.basename))) {
						scenesLinking.push(file);
					}
				}
			}

			console.log(`[SyncEncounter] Found ${scenesLinking.length} scenes linking to this encounter`);

			// Update each scene's frontmatter
			for (const sceneFile of scenesLinking) {
				await this.updateSceneFrontmatter(sceneFile, {
					encounter_creatures: JSON.stringify(encounterCreatures),
					encounter_difficulty: encounterDifficulty,
					selected_party_id: selectedPartyId
				});
				console.log(`[SyncEncounter] Updated scene: ${sceneFile.path}`);
			}

			// Update Initiative Tracker encounter
			await this.updateInitiativeTrackerEncounter(encounterName, encounterCreatures, selectedPartyId, useColorNames);

			if (scenesLinking.length > 0) {
				new Notice(`✅ Encounter "${encounterName}" synced to ${scenesLinking.length} scene(s)`);
			}
		} catch (error) {
			console.error('[SyncEncounter] Error:', error);
			new Notice('⚠️ Error syncing encounter to scenes');
		}
	}

	/**
	 * Update a scene's frontmatter fields
	 */
	async updateSceneFrontmatter(sceneFile: TFile, updates: Record<string, any>) {
		const content = await this.app.vault.read(sceneFile);
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		
		if (!frontmatterMatch || !frontmatterMatch[1]) {
			console.error(`No frontmatter found in ${sceneFile.path}`);
			return;
		}

		let frontmatter = frontmatterMatch[1];

		// Update each field
		for (const [key, value] of Object.entries(updates)) {
			const fieldMatch = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
			if (fieldMatch) {
				// Update existing field
				frontmatter = frontmatter.replace(
					new RegExp(`^${key}:\\s*.*$`, 'm'),
					`${key}: ${value}`
				);
			} else {
				// Add new field at the end
				frontmatter = `${frontmatter}\n${key}: ${value}`;
			}
		}

		const newContent = content.replace(
			/^---\n[\s\S]*?\n---/,
			`---\n${frontmatter}\n---`
		);

		await this.app.vault.modify(sceneFile, newContent);
	}

	/**
	 * Update Initiative Tracker encounter data
	 */
	async updateInitiativeTrackerEncounter(encounterName: string, creatures: any[], selectedPartyId: string | null, useColorNames: boolean = false) {
		try {
			console.log(`[UpdateTracker] Starting update for encounter: ${encounterName}`);
			console.log(`[UpdateTracker] Creatures:`, creatures);
			console.log(`[UpdateTracker] Party ID: ${selectedPartyId}, Use color names: ${useColorNames}`);

			const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
			if (!initiativePlugin?.data?.encounters) {
				console.log('[UpdateTracker] Initiative Tracker not available');
				return;
			}

			// Check if encounter exists in Initiative Tracker
			if (!initiativePlugin.data.encounters[encounterName]) {
				console.log(`[UpdateTracker] Encounter "${encounterName}" not found in tracker`);
				return;
			}

			// Helper function to generate unique IDs like Initiative Tracker does
			const generateId = () => {
				const chars = '0123456789abcdef';
				let id = 'ID_';
				for (let i = 0; i < 12; i++) {
					id += chars[Math.floor(Math.random() * chars.length)];
				}
				return id;
			};

			// Get party members if a party is selected
			let partyMembers: any[] = [];
			if (selectedPartyId && initiativePlugin.data.parties) {
				const party = Object.values(initiativePlugin.data.parties).find((p: any) => p.id === selectedPartyId);
				if (party && (party as any).players) {
					partyMembers = (party as any).players.map((player: any) => ({
						...player,
						id: player.id || generateId(),
						status: player.status || []
					}));
					console.log(`[UpdateTracker] Loaded ${partyMembers.length} party members from party: ${(party as any).name}`);
				}
			}

			// Convert creatures to Initiative Tracker format
			const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Brown'];
			
			const trackerCreatures = await Promise.all(creatures.map(async (c: any) => {
				const instances: any[] = [];
				const count = c.count || 1;
				
				console.log(`[UpdateTracker] Processing creature: ${c.name}, count: ${count}, HP: ${c.hp}, AC: ${c.ac}`);
				
				for (let i = 0; i < count; i++) {
					let creatureName = c.name;
					let displayName = c.name;

					// Use the encounter-level useColorNames setting
					if (count > 1 && useColorNames) {
						const colorIndex = i % colors.length;
						creatureName = `${c.name} (${colors[colorIndex]})`;
						displayName = creatureName;
					}

					instances.push({
						name: creatureName,
						display: displayName,
						initiative: 0,
						static: false,
						modifier: 0,
						hp: c.hp || 1,
						currentMaxHP: c.hp || 1,
						cr: c.cr || undefined,
						ac: c.ac || 10,
						currentAC: c.ac || 10,
						id: generateId(),
						currentHP: c.hp || 1,
						tempHP: 0,
						status: [],  // CRITICAL: Initialize empty status array
						enabled: true,
						active: false,
						hidden: false,
						friendly: false,
						rollHP: false,
						note: c.path || '',
						path: c.path || ''
					});
				}
				return instances;
			}));

			const flatCreatures = trackerCreatures.flat();
			const allCombatants = [...partyMembers, ...flatCreatures];

			console.log(`[UpdateTracker] Total combatants: ${allCombatants.length} (${partyMembers.length} party + ${flatCreatures.length} creatures)`);

			// Update the encounter in Initiative Tracker
			initiativePlugin.data.encounters[encounterName] = {
				...initiativePlugin.data.encounters[encounterName],
				creatures: allCombatants
			};

			// Save settings
			if (initiativePlugin.saveSettings) {
				await initiativePlugin.saveSettings();
				console.log(`[UpdateTracker] ✅ Successfully updated encounter "${encounterName}" in Initiative Tracker`);
				new Notice(`✅ Initiative Tracker updated with latest encounter data`);
			}
		} catch (error) {
			console.error('[UpdateTracker] Error updating Initiative Tracker:', error);
		}
	}

	async createSession() {
		// Detect campaign from active file or use default
		const campaignPath = this.detectCampaignFromActiveFile() || this.settings.currentCampaign;
		// Open session creation modal
		new SessionCreationModal(this.app, this, undefined, campaignPath).open();
	}

	async openSessionPrepDashboard() {
		// Detect campaign from active file or use default
		const campaignPath = this.detectCampaignFromActiveFile() || this.settings.currentCampaign;
		
		// Check if view is already open
		const existing = this.app.workspace.getLeavesOfType(SESSION_PREP_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			// Reveal existing view and update campaign
			this.app.workspace.revealLeaf(existing[0]);
			const view = existing[0].view as SessionPrepDashboardView;
			view.setCampaign(campaignPath);
			return;
		}

		// Open in left pane
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: SESSION_PREP_VIEW_TYPE,
				active: true,
			});
			const view = leaf.view as SessionPrepDashboardView;
			view.setCampaign(campaignPath);
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async openSessionRunDashboard() {
		// Detect campaign from active file or use default
		const campaignPath = this.detectCampaignFromActiveFile() || this.settings.currentCampaign;
		
		// Check if dashboard view is already open
		const existing = this.app.workspace.getLeavesOfType(SESSION_RUN_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			const view = existing[0].view as SessionRunDashboardView;
			view.setCampaign(campaignPath);
			// Setup the session layout even if already open
			await view.setupSessionLayout();
			
			// Also open DM Screen if not already open
			await this.openDMScreen();
			return;
		}

		// Open dashboard control panel in left sidebar
		const dashboardLeaf = this.app.workspace.getLeftLeaf(false);
		if (dashboardLeaf) {
			await dashboardLeaf.setViewState({
				type: SESSION_RUN_VIEW_TYPE,
				active: true,
			});
			const view = dashboardLeaf.view as SessionRunDashboardView;
			view.setCampaign(campaignPath);
			this.app.workspace.revealLeaf(dashboardLeaf);
			
			// Setup the session layout with multiple panes
			await view.setupSessionLayout();
			
			// Open DM Screen in right sidebar
			await this.openDMScreen();
		}
	}

	async openDMScreen() {
		// Check if DM Screen is already open
		const existing = this.app.workspace.getLeavesOfType(DM_SCREEN_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// Open DM Screen in right sidebar
		const dmScreenLeaf = this.app.workspace.getRightLeaf(false);
		if (dmScreenLeaf) {
			await dmScreenLeaf.setViewState({
				type: DM_SCREEN_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(dmScreenLeaf);
		}
	}

	/**
	 * Detect campaign path from the currently active file
	 */
	detectCampaignFromActiveFile(): string | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return null;
		
		// Check if file is in a campaign folder (ttrpgs/CampaignName/...)
		const pathMatch = activeFile.path.match(/^ttrpgs\/([^\/]+)/);
		if (pathMatch && pathMatch[1]) {
			return `ttrpgs/${pathMatch[1]}`;
		}
		
		return null;
	}

	async createSpell() {
		// Open Spell Import/Creation modal with SRD API integration
		new SpellImportModal(this.app, this).open();
	}

	async createMap() {
		// Open Map creation modal
		new MapCreationModal(this.app, this, this.mapManager).open();
	}

	/**
	 * Render map view from dnd-map code block
	 */
	async renderMapView(source: string, el: HTMLElement, ctx: any) {
		try {
			// Parse the map configuration
			const config = JSON.parse(source);
			
			// Ensure mapId exists
			if (!config.mapId) {
				config.mapId = 'map_' + Date.now();
			}
			
			// Validate required fields
			if (!config.imageFile) {
				el.createEl('div', { 
					text: '⚠️ Map configuration missing imageFile',
					cls: 'dnd-map-error'
				});
				return;
			}

			// Get the image file from vault
			const imageFile = this.app.vault.getAbstractFileByPath(config.imageFile);
			if (!imageFile || !(imageFile instanceof TFile)) {
				el.createEl('div', { 
					text: `⚠️ Image file not found: ${config.imageFile}`,
					cls: 'dnd-map-error'
				});
				return;
			}

			// Load annotations from separate file
			const annotations = await this.loadMapAnnotations(config.mapId);
			config.highlights = annotations.highlights || [];
			config.markers = annotations.markers || [];
			config.drawings = annotations.drawings || [];

			// Create container for the map
			const mapContainer = el.createDiv({ cls: 'dnd-map-viewer' });
			
			// Add map title if available
			if (config.name) {
				const titleBar = mapContainer.createDiv({ cls: 'dnd-map-title' });
				titleBar.createEl('h4', { text: config.name });
				
				// Add map info
				const info = titleBar.createEl('span', { cls: 'dnd-map-info' });
				const typeEmoji = config.type === 'battlemap' ? '⚔️' : config.type === 'world' ? '🌎' : '🗺️';
				info.textContent = `${typeEmoji} ${config.type} • ${config.dimensions.width}×${config.dimensions.height}px`;
				
				if (config.scale) {
					const scale = titleBar.createEl('span', { cls: 'dnd-map-scale' });
					scale.textContent = `📏 ${config.scale.value} ${config.scale.unit} per square`;
				}
			}

			// Tool state
			let activeTool: 'pan' | 'select' | 'draw' | 'ruler' = 'pan';
			let selectedColor = '#ff0000';
			let rulerStart: { x: number; y: number } | null = null;
			let rulerEnd: { x: number; y: number } | null = null;
			let isDrawing = false;
			let currentPath: { x: number; y: number }[] = [];
			let isCalibrating = false;
			let calibrationPoint1: { x: number; y: number } | null = null;
			let calibrationPoint2: { x: number; y: number } | null = null;


		// Create scrollable viewport
		const viewport = mapContainer.createDiv({ cls: 'dnd-map-viewport' });
		
		// Create wrapper that will be transformed (zoom + pan)
		const mapWrapper = viewport.createDiv({ cls: 'dnd-map-wrapper' });
		
		// Get the resource path for the image
		const resourcePath = this.app.vault.getResourcePath(imageFile);
		
		// Create and configure the image element
		const img = mapWrapper.createEl('img', {
			cls: 'dnd-map-image',
			attr: {
				src: resourcePath,
				alt: config.name || 'Battle Map'
			}
		});

		// Add floating toolbar inside viewport
		const toolbar = viewport.createDiv({ cls: 'dnd-map-toolbar' });
		
		// Toolbar header with just collapse toggle icon
		const toolbarHeader = toolbar.createDiv({ cls: 'dnd-map-toolbar-header' });
		const toggleIcon = toolbarHeader.createEl('span', { 
			text: '▼', 
			cls: 'dnd-map-toolbar-toggle' 
		});
		
		// Toolbar content wrapper for collapse animation
		const toolbarContent = toolbar.createDiv({ cls: 'dnd-map-toolbar-content' });
		
		// Tool buttons group
		const toolGroup = toolbarContent.createDiv({ cls: 'dnd-map-tool-group' });
		
		// Helper to create icon-only buttons with hover labels
		const createToolBtn = (icon: string, label: string, isActive = false): HTMLButtonElement => {
			const btn = toolGroup.createEl('button', { 
				cls: 'dnd-map-tool-btn' + (isActive ? ' active' : '')
			});
			btn.createEl('span', { text: icon, cls: 'dnd-map-tool-btn-icon' });
			btn.createEl('span', { text: label, cls: 'dnd-map-tool-btn-label' });
			return btn;
		};
		
		const panBtn = createToolBtn('⬆', 'Pan', true);
		const selectBtn = createToolBtn('⬡', 'Select');
		const drawBtn = createToolBtn('✎', 'Draw');
		const rulerBtn = createToolBtn('⟷', 'Ruler');
		const calibrateBtn = createToolBtn('⚙', 'Calibrate');
		
		calibrateBtn.addEventListener('click', () => {
			isCalibrating = true;
			calibrationPoint1 = null;
			calibrationPoint2 = null;
			calibrateBtn.addClass('active');
			setActiveTool('pan'); // Clear other tools
			viewport.style.cursor = 'crosshair';
			new Notice('Click two points on the map to measure one hex width');
		});

		// Separator for color picker (hidden by default)
		const colorSeparator = toolbarContent.createDiv({ cls: 'dnd-map-tool-separator hidden' });

		// Color picker for highlights/drawings (hidden by default)
		const colorPicker = toolbarContent.createDiv({ cls: 'dnd-map-color-picker hidden' });
		const colorInput = colorPicker.createEl('input', { 
			type: 'color',
			cls: 'dnd-map-color-input',
			attr: { value: selectedColor }
		});
		colorInput.addEventListener('change', (e) => {
			selectedColor = (e.target as HTMLInputElement).value;
		});
		
		// Toolbar collapse/expand functionality
		toolbarHeader.addEventListener('click', () => {
			toolbar.toggleClass('collapsed', !toolbar.hasClass('collapsed'));
		});

		// State for zoom and pan
		let scale = 1;
		let translateX = 0;
		let translateY = 0;
		let isDragging = false;
		let startX = 0;
		let startY = 0;
		let gridCanvas: HTMLCanvasElement | null = null;
		let annotationCanvas: HTMLCanvasElement | null = null;

		// Function to update transform
		const updateTransform = () => {
			mapWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
		};

		// Function to convert screen coordinates to map coordinates (in natural image pixel space)
		const screenToMap = (screenX: number, screenY: number) => {
			const rect = viewport.getBoundingClientRect();
			// First get coordinates in displayed image space
			const displayX = (screenX - rect.left - translateX) / scale;
			const displayY = (screenY - rect.top - translateY) / scale;
			
			// Scale to natural image dimensions (for canvas drawing)
			const scaleX = img.naturalWidth / img.width;
			const scaleY = img.naturalHeight / img.height;
			const x = displayX * scaleX;
			const y = displayY * scaleY;
			
			return { x, y };
		};

			// Function to get hex coordinates from pixel position
			const pixelToHex = (x: number, y: number) => {
				if (config.gridType === 'hex-horizontal') {
					const horiz = config.gridSize;
					const size = (2/3) * horiz;
					const vert = Math.sqrt(3) * size;
					
					const col = Math.round(x / horiz);
					const row = Math.round((y - ((col & 1) ? vert / 2 : 0)) / vert);
					return { col, row };
				} else if (config.gridType === 'hex-vertical') {
					const vert = config.gridSize;
					const size = (2/3) * vert;
					const horiz = Math.sqrt(3) * size;
					
					const row = Math.round(y / vert);
					const col = Math.round((x - ((row & 1) ? horiz / 2 : 0)) / horiz);
					return { col, row };
				} else if (config.gridType === 'square') {
					const col = Math.floor(x / config.gridSize);
					const row = Math.floor(y / config.gridSize);
					return { col, row };
				}
				return { col: 0, row: 0 };
			};

			// Function to redraw annotations
			const redrawAnnotations = () => {
				console.log('redrawAnnotations called, annotationCanvas exists:', !!annotationCanvas);
				if (!annotationCanvas) return;
				const ctx = annotationCanvas.getContext('2d');
				console.log('Got canvas context:', !!ctx);
				if (!ctx) return;
				
				ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
				
				// Draw highlights
				if (config.highlights) {
					config.highlights.forEach((highlight: any) => {
						drawHighlight(ctx, highlight);
					});
				}
				
				// Draw markers
				if (config.markers) {
					config.markers.forEach((marker: any) => {
						drawMarker(ctx, marker);
					});
				}
				
				// Draw drawings
				if (config.drawings) {
					config.drawings.forEach((drawing: any) => {
						drawDrawing(ctx, drawing);
					});
				}
				
				// Draw active ruler
				if (rulerStart && rulerEnd) {
					ctx.strokeStyle = '#00ff00';
					ctx.lineWidth = 3;
					ctx.setLineDash([5, 5]);
					ctx.beginPath();
					ctx.moveTo(rulerStart.x, rulerStart.y);
					ctx.lineTo(rulerEnd.x, rulerEnd.y);
					ctx.stroke();
					ctx.setLineDash([]);
					
					// Draw measurement
					const distance = Math.sqrt(
						Math.pow(rulerEnd.x - rulerStart.x, 2) + 
						Math.pow(rulerEnd.y - rulerStart.y, 2)
					);
					const gridDistance = distance / config.gridSize;
					const realDistance = gridDistance * config.scale.value;
					
					ctx.fillStyle = '#00ff00';
					ctx.font = 'bold 16px sans-serif';
					ctx.fillText(
						`${realDistance.toFixed(1)} ${config.scale.unit}`,
						(rulerStart.x + rulerEnd.x) / 2,
						(rulerStart.y + rulerEnd.y) / 2 - 10
					);
				}
				
				// Draw calibration measurement line
				if (calibrationPoint1) {
					ctx.strokeStyle = '#ff9900';
					ctx.lineWidth = 4;
					ctx.setLineDash([10, 5]);
					ctx.beginPath();
					ctx.moveTo(calibrationPoint1.x, calibrationPoint1.y);
					
					if (calibrationPoint2) {
						ctx.lineTo(calibrationPoint2.x, calibrationPoint2.y);
						ctx.stroke();
						ctx.setLineDash([]);
						
						// Draw distance in pixels
						const distance = Math.sqrt(
							Math.pow(calibrationPoint2.x - calibrationPoint1.x, 2) + 
							Math.pow(calibrationPoint2.y - calibrationPoint1.y, 2)
						);
						
						ctx.fillStyle = '#ff9900';
						ctx.font = 'bold 18px sans-serif';
						ctx.fillText(
							`${Math.round(distance)} pixels`,
							(calibrationPoint1.x + calibrationPoint2.x) / 2,
							(calibrationPoint1.y + calibrationPoint2.y) / 2 - 15
						);
					} else {
						// Just draw the first point as a circle
						ctx.setLineDash([]);
						ctx.beginPath();
						ctx.arc(calibrationPoint1.x, calibrationPoint1.y, 8, 0, 2 * Math.PI);
						ctx.fillStyle = '#ff9900';
						ctx.fill();
						ctx.stroke();
					}
				}
			};

			// Function to draw a hex highlight
			const drawHighlight = (ctx: CanvasRenderingContext2D, highlight: any) => {
				ctx.fillStyle = highlight.color + '60'; // Add alpha
				ctx.strokeStyle = highlight.color;
				ctx.lineWidth = 2;
				
				if (config.gridType === 'hex-horizontal') {
					const horiz = config.gridSize;
					const size = (2/3) * horiz;
					const vert = Math.sqrt(3) * size;
					const colOffsetY = (highlight.col & 1) ? vert / 2 : 0;
					const centerX = highlight.col * horiz;
					const centerY = highlight.row * vert + colOffsetY;
					this.drawFilledHexFlat(ctx, centerX, centerY, size);
				} else if (config.gridType === 'hex-vertical') {
					const vert = config.gridSize;
					const size = (2/3) * vert;
					const horiz = Math.sqrt(3) * size;
					const rowOffsetX = (highlight.row & 1) ? horiz / 2 : 0;
					const centerX = highlight.col * horiz + rowOffsetX;
					const centerY = highlight.row * vert;
					this.drawFilledHexPointy(ctx, centerX, centerY, size);
				} else if (config.gridType === 'square') {
					ctx.fillRect(
						highlight.col * config.gridSize,
						highlight.row * config.gridSize,
						config.gridSize,
						config.gridSize
					);
					ctx.strokeRect(
						highlight.col * config.gridSize,
						highlight.row * config.gridSize,
						config.gridSize,
						config.gridSize
					);
				}
			};

			// Function to draw a marker
			const drawMarker = (ctx: CanvasRenderingContext2D, marker: any) => {
				ctx.fillStyle = marker.color || '#ff0000';
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 2;
				
				// Draw circle marker
				ctx.beginPath();
				ctx.arc(marker.position.x, marker.position.y, 8, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				
				// Draw icon/label if present
				if (marker.icon) {
					ctx.fillStyle = '#ffffff';
					ctx.font = '12px sans-serif';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText(marker.icon, marker.position.x, marker.position.y);
				}
			};

			// Function to draw a drawing
			const drawDrawing = (ctx: CanvasRenderingContext2D, drawing: any) => {
				if (drawing.points.length === 0) return;
				
				ctx.strokeStyle = drawing.color;
				ctx.lineWidth = drawing.strokeWidth || 2;
				
				if (drawing.type === 'freehand') {
					ctx.beginPath();
					ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
					for (let i = 1; i < drawing.points.length; i++) {
						ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
					}
					ctx.stroke();
				}
			};

			// Tool switching function
			const setActiveTool = (tool: typeof activeTool) => {
				console.log('setActiveTool called with:', tool);
				activeTool = tool;
				console.log('activeTool is now:', activeTool);
				[panBtn, selectBtn, drawBtn, rulerBtn].forEach(btn => btn.removeClass('active'));
				
				// Show/hide color picker based on tool (with animation)
				const showColorPicker = tool === 'select' || tool === 'draw';
				colorPicker.toggleClass('hidden', !showColorPicker);
				colorSeparator.toggleClass('hidden', !showColorPicker);
				
				if (tool === 'pan') {
					panBtn.addClass('active');
					viewport.style.cursor = 'grab';
				} else if (tool === 'select') {
					selectBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'draw') {
					drawBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'ruler') {
					rulerBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				}
				
				// Clear ruler when switching tools
				if (tool !== 'ruler' && annotationCanvas) {
					rulerStart = null;
					rulerEnd = null;
					redrawAnnotations();
				}
			};

			// Wire up tool button handlers
			panBtn.addEventListener('click', () => {
				console.log('Pan button clicked');
				setActiveTool('pan');
			});
			selectBtn.addEventListener('click', () => {
				console.log('Select button clicked');
				setActiveTool('select');
			});
			drawBtn.addEventListener('click', () => {
				console.log('Draw button clicked');
				setActiveTool('draw');
			});
			rulerBtn.addEventListener('click', () => {
				console.log('Ruler button clicked');
				setActiveTool('ruler');
			});

			// Add grid overlay if grid is enabled
			img.onload = () => {
				if (config.gridType && config.gridType !== 'none' && config.gridSize) {
					gridCanvas = this.drawGridOverlay(mapWrapper, img, config);
				}
				
				// Create annotation canvas
				annotationCanvas = document.createElement('canvas');
				annotationCanvas.classList.add('dnd-map-annotation-layer');
				annotationCanvas.width = img.naturalWidth;
				annotationCanvas.height = img.naturalHeight;
				annotationCanvas.style.position = 'absolute';
				annotationCanvas.style.top = '0';
				annotationCanvas.style.left = '0';
				annotationCanvas.style.width = `${img.width}px`;
				annotationCanvas.style.height = `${img.height}px`;
				mapWrapper.appendChild(annotationCanvas);
				
				redrawAnnotations();
				
				// Add ResizeObserver to update canvas dimensions when img resizes
				// This prevents grid distortion when window resizes
				const resizeObserver = new ResizeObserver(() => {
					// Update annotation canvas display size
					if (annotationCanvas) {
						annotationCanvas.style.width = `${img.width}px`;
						annotationCanvas.style.height = `${img.height}px`;
						redrawAnnotations();
					}
					
					// Update grid overlay display size
					if (gridCanvas) {
						gridCanvas.style.width = `${img.width}px`;
						gridCanvas.style.height = `${img.height}px`;
					}
				});
				resizeObserver.observe(img);
			};

			// Mouse wheel zoom (always active)
			viewport.addEventListener('wheel', (e: WheelEvent) => {
				e.preventDefault();
				
				const rect = viewport.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;
				
				// Calculate position in the map before zoom
				const pointX = (mouseX - translateX) / scale;
				const pointY = (mouseY - translateY) / scale;
				
				// Update scale
				const delta = e.deltaY > 0 ? 0.9 : 1.1;
				scale = Math.max(0.25, Math.min(5, scale * delta));
				
				// Adjust translation to keep the point under the mouse
				translateX = mouseX - pointX * scale;
				translateY = mouseY - pointY * scale;
				
				updateTransform();
				zoomReset.textContent = `${Math.round(scale * 100)}%`;
			});

			// Tool-aware mouse handlers
			viewport.addEventListener('mousedown', (e: MouseEvent) => {
				console.log('Mousedown event fired, activeTool:', activeTool);
				if (e.button !== 0) return; // Only left mouse button
				
				const mapPos = screenToMap(e.clientX, e.clientY);
				console.log('Map position:', mapPos);
				
				// Handle calibration mode
				if (isCalibrating) {
					if (!calibrationPoint1) {
						calibrationPoint1 = { x: mapPos.x, y: mapPos.y };
						new Notice('Click second point to complete measurement');
						redrawAnnotations();
					} else {
						calibrationPoint2 = { x: mapPos.x, y: mapPos.y };
						
						// Calculate pixel distance
						const pixelDistance = Math.sqrt(
							Math.pow(calibrationPoint2.x - calibrationPoint1.x, 2) +
							Math.pow(calibrationPoint2.y - calibrationPoint1.y, 2)
						);
						
						// Show modal to select travel pace
						new CalibrationModal(this.app, pixelDistance, async (miles: number) => {
							// Update grid size and scale
							config.gridSize = Math.round(pixelDistance);
							config.scale = {
								value: miles,
								unit: 'miles'
							};
							
							// Redraw grid with new size
							if (gridCanvas) {
								gridCanvas.remove();
							}
							if (config.gridType && config.gridType !== 'none' && config.gridSize) {
								gridCanvas = this.drawGridOverlay(mapWrapper, img, config);
							}
							
							// Save configuration to code block
							await this.updateMapConfig(config);
							
							new Notice(`Grid calibrated: ${miles} miles per hex`);
							
							// Reset calibration state
							isCalibrating = false;
							calibrationPoint1 = null;
							calibrationPoint2 = null;
							calibrateBtn.removeClass('active');
							setActiveTool('pan');
							redrawAnnotations();
						}).open();
					}
					e.preventDefault();
					return;
				}
				
				if (activeTool === 'pan') {
					isDragging = true;
					startX = e.clientX - translateX;
					startY = e.clientY - translateY;
					viewport.style.cursor = 'grabbing';
				} else if (activeTool === 'select') {
					console.log('Select tool: calculating hex position');
					console.log('Map position:', mapPos);
					// Select hex and toggle highlight
					const hex = pixelToHex(mapPos.x, mapPos.y);
					console.log('Hex calculated:', hex);
					console.log('Current highlights:', config.highlights);
					const existingIndex = config.highlights.findIndex(
						(h: any) => h.col === hex.col && h.row === hex.row
					);
					console.log('Existing index:', existingIndex);
					
					if (existingIndex >= 0) {
						// Remove highlight
						config.highlights.splice(existingIndex, 1);
						console.log('Removed highlight');
					} else {
						// Add highlight
						config.highlights.push({
							id: `highlight_${Date.now()}`,
							col: hex.col,
							row: hex.row,
							color: selectedColor
						});
						console.log('Added highlight, new array:', config.highlights);
					}
					
					console.log('Calling redrawAnnotations');
					redrawAnnotations();
					console.log('Calling saveMapAnnotations');
					this.saveMapAnnotations(config, el);
				} else if (activeTool === 'draw') {
					console.log('Draw tool: starting path');
					isDrawing = true;
					currentPath = [{ x: mapPos.x, y: mapPos.y }];
					console.log('isDrawing set to:', isDrawing, 'currentPath:', currentPath);
				} else if (activeTool === 'ruler') {
					console.log('Ruler tool: rulerStart is', rulerStart);
					if (!rulerStart) {
						rulerStart = { x: mapPos.x, y: mapPos.y };
						console.log('Set rulerStart to:', rulerStart);
					} else {
						rulerEnd = { x: mapPos.x, y: mapPos.y };
						console.log('Set rulerEnd to:', rulerEnd);
						redrawAnnotations();
						// Reset for next measurement
						setTimeout(() => {
							rulerStart = null;
							rulerEnd = null;
							redrawAnnotations();
						}, 3000);
					}
				}
				
				e.preventDefault();
			});

			viewport.addEventListener('mousemove', (e: MouseEvent) => {
				const mapPos = screenToMap(e.clientX, e.clientY);
				
				if (activeTool === 'pan' && isDragging) {
					translateX = e.clientX - startX;
					translateY = e.clientY - startY;
					updateTransform();
				} else if (activeTool === 'draw' && isDrawing) {
					currentPath.push({ x: mapPos.x, y: mapPos.y });
					redrawAnnotations();
					
					// Draw temporary path
					if (annotationCanvas && currentPath.length > 1) {
						const ctx = annotationCanvas.getContext('2d');
						if (ctx) {
							const last = currentPath[currentPath.length - 1];
							const prev = currentPath[currentPath.length - 2];
							if (last && prev) {
								ctx.strokeStyle = selectedColor;
								ctx.lineWidth = 3;
								ctx.beginPath();
								ctx.moveTo(prev.x, prev.y);
								ctx.lineTo(last.x, last.y);
								ctx.stroke();
							}
						}
					}
				} else if (activeTool === 'ruler' && rulerStart && !rulerEnd) {
					// Show temporary ruler line
					rulerEnd = { x: mapPos.x, y: mapPos.y };
					redrawAnnotations();
				}
			});

			viewport.addEventListener('mouseup', () => {
				if (activeTool === 'pan' && isDragging) {
					isDragging = false;
					viewport.style.cursor = 'grab';
				} else if (activeTool === 'draw' && isDrawing) {
					isDrawing = false;
					if (currentPath.length > 2) {
						config.drawings.push({
							id: `drawing_${Date.now()}`,
							type: 'freehand',
							points: currentPath,
							color: selectedColor,
							strokeWidth: 3
						});
						this.saveMapAnnotations(config, el);
					}
					currentPath = [];
					redrawAnnotations();
				}
			});

			viewport.addEventListener('mouseleave', () => {
				if (activeTool === 'pan' && isDragging) {
					isDragging = false;
					viewport.style.cursor = 'grab';
				} else if (activeTool === 'draw' && isDrawing) {
					isDrawing = false;
					currentPath = [];
					redrawAnnotations();
				} else if (activeTool === 'ruler') {
					if (rulerStart && !rulerEnd) {
						rulerEnd = null;
						redrawAnnotations();
					}
				}
			});

			// Add controls
			const controls = mapContainer.createDiv({ cls: 'dnd-map-controls' });
			
			// Zoom controls
			const zoomContainer = controls.createDiv({ cls: 'dnd-map-zoom-controls' });
			zoomContainer.createEl('span', { text: 'Zoom: ', cls: 'dnd-map-zoom-label' });
			
			const zoomOut = zoomContainer.createEl('button', { text: '−', cls: 'dnd-map-zoom-btn' });
			const zoomReset = zoomContainer.createEl('button', { text: '100%', cls: 'dnd-map-zoom-btn' });
			const zoomIn = zoomContainer.createEl('button', { text: '+', cls: 'dnd-map-zoom-btn' });
			
			zoomIn.addEventListener('click', () => {
				scale = Math.min(scale * 1.25, 5);
				updateTransform();
				zoomReset.textContent = `${Math.round(scale * 100)}%`;
			});
			
			zoomOut.addEventListener('click', () => {
				scale = Math.max(scale * 0.8, 0.25);
				updateTransform();
				zoomReset.textContent = `${Math.round(scale * 100)}%`;
			});
			
			zoomReset.addEventListener('click', () => {
				scale = 1;
				translateX = 0;
				translateY = 0;
				updateTransform();
				zoomReset.textContent = '100%';
			});

			// Grid toggle
			if (config.gridType && config.gridType !== 'none') {
				const gridToggle = controls.createDiv({ cls: 'dnd-map-grid-toggle' });
				const toggleBtn = gridToggle.createEl('button', { 
					text: '🔲 Toggle Grid', 
					cls: 'dnd-map-toggle-btn' 
				});
				
				let gridVisible = true;
				toggleBtn.addEventListener('click', () => {
					gridVisible = !gridVisible;
					if (gridCanvas) {
						gridCanvas.style.display = gridVisible ? 'block' : 'none';
					}
				});
			}

			// Clear annotations button
			const clearBtn = controls.createEl('button', {
				text: '🗑️ Clear Annotations',
				cls: 'dnd-map-toggle-btn'
			});
			clearBtn.addEventListener('click', () => {
				config.highlights = [];
				config.markers = [];
				config.drawings = [];
				redrawAnnotations();
				this.saveMapAnnotations(config, el);
				new Notice('Annotations cleared');
			});

			// Edit button
			const editButton = controls.createDiv({ cls: 'dnd-map-edit-btn-container' });
			const editBtn = editButton.createEl('button', {
				text: '⚙️ Edit Map',
				cls: 'dnd-map-toggle-btn'
			});
			editBtn.addEventListener('click', () => {
				new MapCreationModal(this.app, this, this.mapManager, config, el).open();
			});

		} catch (error) {
			console.error('Error rendering dnd-map:', error);
			el.createEl('div', { 
				text: `⚠️ Error rendering map: ${error instanceof Error ? error.message : String(error)}`,
				cls: 'dnd-map-error'
			});
		}
	}

	/**
	 * Get the path for the map annotations file
	 */
	getMapAnnotationPath(mapId: string): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/map-annotations/${mapId}.json`;
	}

	/**
	 * Update map configuration in the code block (for grid settings, scale, etc.)
	 */
	async updateMapConfig(config: any): Promise<void> {
		try {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return;
			
			const editor = activeView.editor;
			if (!editor) return;
			
			const content = editor.getValue();
			
			// Create clean config without annotations
			const cleanConfig = {
				mapId: config.mapId,
				imageFile: config.imageFile,
				name: config.name,
				type: config.type,
				dimensions: config.dimensions,
				gridType: config.gridType,
				gridSize: config.gridSize,
				scale: config.scale
			};
			
			// Find and replace the code block
			const mapIdPattern = new RegExp('```dnd-map\\s*\\n[^`]*"mapId"\\s*:\\s*"' + config.mapId + '"[^`]*```', 's');
			const newCodeBlock = '```dnd-map\n' + JSON.stringify(cleanConfig, null, 2) + '\n```';
			
			const newContent = content.replace(mapIdPattern, newCodeBlock);
			
			if (newContent !== content) {
				editor.setValue(newContent);
				console.log('Map config updated in code block');
			}
		} catch (error) {
			console.error('Error updating map config:', error);
		}
	}

	/**
	 * Load map annotations from dedicated file
	 */
	async loadMapAnnotations(mapId: string): Promise<any> {
		try {
			const annotationPath = this.getMapAnnotationPath(mapId);
			console.log('Loading annotations from:', annotationPath);
			
			// Use adapter.read() for config directory files (not getAbstractFileByPath which only works for vault files)
			if (await this.app.vault.adapter.exists(annotationPath)) {
				const content = await this.app.vault.adapter.read(annotationPath);
				const annotations = JSON.parse(content);
				console.log('Loaded annotations:', {
					highlights: annotations.highlights?.length || 0,
					markers: annotations.markers?.length || 0,
					drawings: annotations.drawings?.length || 0
				});
				return annotations;
			} else {
				console.log('No annotation file found for mapId:', mapId);
			}
		} catch (error) {
			console.log('Error loading annotations for map:', mapId, error);
		}
		
		// Return empty annotations structure
		return {
			highlights: [],
			markers: [],
			drawings: []
		};
	}

	/**
	 * Save map annotations to dedicated file
	 */
	async saveMapAnnotations(config: any, el: HTMLElement) {
		try {
			if (!config.mapId) {
				console.error('Cannot save annotations: mapId missing');
				return;
			}
			
			// Prepare annotation data
			const annotations = {
				highlights: config.highlights || [],
				markers: config.markers || [],
				drawings: config.drawings || [],
				lastModified: new Date().toISOString()
			};
			
			// Ensure annotation directory exists
			const annotationDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}/map-annotations`;
			const dirExists = await this.app.vault.adapter.exists(annotationDir);
			if (!dirExists) {
				await this.app.vault.adapter.mkdir(annotationDir);
			}
			
			console.log('Saving annotations to:', annotationDir);
			console.log('MapId:', config.mapId);
			console.log('Highlights count:', annotations.highlights.length);
			console.log('Markers count:', annotations.markers.length);
			console.log('Drawings count:', annotations.drawings.length);
			
			// Save to dedicated annotation file using adapter for config directory files
			const annotationPath = this.getMapAnnotationPath(config.mapId);
			const annotationJson = JSON.stringify(annotations, null, 2);
			
			await this.app.vault.adapter.write(annotationPath, annotationJson);
			
			console.log('Map annotations saved to:', annotationPath);
		} catch (error) {
			console.error('Error saving map annotations:', error);
		}
	}

	/**
	 * Draw grid overlay on the map
	 * Based on https://www.redblobgames.com/grids/hexagons/
	 * 
	 * gridSize represents the spacing between hex centers (horizontal for flat-top, vertical for pointy-top)
	 */
	drawGridOverlay(container: HTMLElement, img: HTMLImageElement, config: any, offsetX: number = 0, offsetY: number = 0): HTMLCanvasElement {
		// Remove existing canvas if any
		const existingCanvas = container.querySelector('.dnd-map-grid-overlay');
		if (existingCanvas) {
			existingCanvas.remove();
		}

		// Create canvas for grid - same size as the image
		const canvas = document.createElement('canvas');
		canvas.classList.add('dnd-map-grid-overlay');
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		canvas.style.position = 'absolute';
		canvas.style.top = '0';
		canvas.style.left = '0';
		canvas.style.width = `${img.width}px`;
		canvas.style.height = `${img.height}px`;
		canvas.style.pointerEvents = 'none';

		const ctx = canvas.getContext('2d');
		if (!ctx) return canvas;

		// Style for grid lines
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
		ctx.lineWidth = 2;

		if (config.gridType === 'square') {
			const size = config.gridSize;
			// Normalize offset to stay within one grid cell
			const normalizedOffsetX = ((offsetX % size) + size) % size;
			const normalizedOffsetY = ((offsetY % size) + size) % size;
			
			// Draw vertical lines
			for (let x = normalizedOffsetX; x <= canvas.width; x += size) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, canvas.height);
				ctx.stroke();
			}

			// Draw horizontal lines
			for (let y = normalizedOffsetY; y <= canvas.height; y += size) {
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(canvas.width, y);
				ctx.stroke();
			}
		} else if (config.gridType === 'hex-horizontal') {
			// Flat-top hex grid (horizontal orientation)
			// gridSize = horizontal spacing between hex centers (horiz = 3/2 * size)
			const horiz = config.gridSize; // center-to-center X spacing
			const size = (2/3) * horiz; // radius (center -> corner)
			const vert = Math.sqrt(3) * size; // center-to-center Y spacing
			
			// Calculate range accounting for offset - need to cover entire canvas
			const startCol = Math.floor(-offsetX / horiz) - 2;
			const endCol = Math.ceil((canvas.width - offsetX) / horiz) + 2;
			const startRow = Math.floor(-offsetY / vert) - 2;
			const endRow = Math.ceil((canvas.height - offsetY) / vert) + 2;
			
			for (let row = startRow; row < endRow; row++) {
				for (let col = startCol; col < endCol; col++) {
					// ✅ flat-top uses odd-q: offset odd columns in Y by half vertical spacing
					const colOffsetY = (col & 1) ? vert / 2 : 0;
					const centerX = col * horiz + offsetX;
					const centerY = row * vert + colOffsetY + offsetY;
					
					this.drawHexFlat(ctx, centerX, centerY, size);
				}
			}
		} else if (config.gridType === 'hex-vertical') {
			// Pointy-top hex grid (vertical orientation)
			// gridSize = vertical spacing between hex centers (vert = 3/2 * size)
			const vert = config.gridSize; // center-to-center Y spacing
			const size = (2/3) * vert; // radius (center -> corner)
			const horiz = Math.sqrt(3) * size; // center-to-center X spacing
			
			// Calculate range accounting for offset - need to cover entire canvas
			const startCol = Math.floor(-offsetX / horiz) - 2;
			const endCol = Math.ceil((canvas.width - offsetX) / horiz) + 2;
			const startRow = Math.floor(-offsetY / vert) - 2;
			const endRow = Math.ceil((canvas.height - offsetY) / vert) + 2;
			
			for (let row = startRow; row < endRow; row++) {
				for (let col = startCol; col < endCol; col++) {
					// ✅ pointy-top uses odd-r: offset odd rows in X by half horizontal spacing
					const rowOffsetX = (row & 1) ? horiz / 2 : 0;
					const centerX = col * horiz + rowOffsetX + offsetX;
					const centerY = row * vert + offsetY;
					
					this.drawHexPointy(ctx, centerX, centerY, size);
				}
			}
		}

		// Append canvas to container
		container.appendChild(canvas);
		return canvas;
	}

	/**
	 * Draw a flat-top hexagon (horizontal orientation)
	 */
	drawHexFlat(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 3) * i; // 60 degree increments
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.closePath();
		ctx.stroke();
	}

	/**
	 * Draw a pointy-top hexagon (vertical orientation)
	 */
	drawHexPointy(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 6) + (Math.PI / 3) * i; // Start at 30 degrees, 60 degree increments
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.closePath();
		ctx.stroke();
	}

	/**
	 * Draw a filled flat-top hexagon (horizontal orientation)
	 */
	drawFilledHexFlat(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 3) * i;
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}

	/**
	 * Draw a filled pointy-top hexagon (vertical orientation)
	 */
	drawFilledHexPointy(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI / 6) + (Math.PI / 3) * i;
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}

	async createFaction() {
		// Open Faction creation modal
		new FactionCreationModal(this.app, this).open();
	}

	async importAllSRDData() {
		const categories = [
			{ key: "ability-scores", folder: "z_AbilityScores", name: "Ability Scores" },
			{ key: "classes", folder: "z_Classes", name: "Classes" },
			{ key: "conditions", folder: "z_Conditions", name: "Conditions" },
			{ key: "damage-types", folder: "z_DamageTypes", name: "Damage Types" },
			{ key: "equipment", folder: "z_Equipment", name: "Equipment" },
			{ key: "features", folder: "z_Features", name: "Features" },
			{ key: "languages", folder: "z_Languages", name: "Languages" },
			{ key: "magic-schools", folder: "z_MagicSchools", name: "Magic Schools" },
			{ key: "proficiencies", folder: "z_Proficiencies", name: "Proficiencies" },
			{ key: "races", folder: "z_Races", name: "Races" },
			{ key: "skills", folder: "z_Skills", name: "Skills" },
			{ key: "subclasses", folder: "z_Subclasses", name: "Subclasses" },
			{ key: "subraces", folder: "z_Subraces", name: "Subraces" },
			{ key: "traits", folder: "z_Traits", name: "Traits" },
			{ key: "weapon-properties", folder: "z_WeaponProperties", name: "Weapon Properties" }
		];

		let totalSuccess = 0;
		let totalErrors = 0;
		const startTime = Date.now();

		new Notice("Starting full SRD data import...");

		for (const category of categories) {
			const result = await this.importSRDCategory(category.key, category.folder, category.name, true);
			totalSuccess += result.success;
			totalErrors += result.errors;
		}

		const duration = Math.round((Date.now() - startTime) / 1000);
		new Notice(`✅ SRD import complete! ${totalSuccess} items imported, ${totalErrors} errors. (${duration}s)`);
	}

	async importSRDCategory(
		categoryKey: string, 
		folderName: string, 
		categoryName: string,
		isBulkImport: boolean = false
	): Promise<{success: number, errors: number}> {
		try {
			if (!isBulkImport) {
				new Notice(`Starting ${categoryName} import...`);
			}

			// Ensure folder exists
			await this.ensureFolderExists(folderName);

			// Fetch list of items
			const listResponse = await requestUrl({
				url: `https://www.dnd5eapi.co/api/2014/${categoryKey}`,
				method: "GET"
			});

			const items = listResponse.json.results || [];
			let successCount = 0;
			let errorCount = 0;

			for (let i = 0; i < items.length; i++) {
				try {
					const item = items[i];
					const filePath = `${folderName}/${item.name}.md`;

					// Check if file already exists
					const exists = await this.app.vault.adapter.exists(filePath);
					if (exists) {
						console.log(`Skipping ${item.name} - already exists`);
						successCount++;
						continue;
					}

					// Fetch detailed data
					const detailResponse = await requestUrl({
						url: `https://www.dnd5eapi.co${item.url}`,
						method: "GET"
					});

					const data = detailResponse.json;

					// Generate markdown content based on category
					const content = this.generateSRDMarkdown(categoryKey, data);

					await this.app.vault.create(filePath, content);
					successCount++;

					// Show progress every 20 items for bulk imports
					if (isBulkImport && i % 20 === 0 && i > 0) {
						console.log(`${categoryName}: ${i}/${items.length}`);
					}
				} catch (error) {
					errorCount++;
					console.error(`Failed to import ${items[i].name}:`, error);
				}
			}

			if (!isBulkImport) {
				new Notice(`✅ ${categoryName} import complete! ${successCount} items imported, ${errorCount} errors.`);
			}

			return { success: successCount, errors: errorCount };
		} catch (error) {
			new Notice(`❌ Failed to import ${categoryName}: ${error instanceof Error ? error.message : String(error)}`);
			console.error(`${categoryName} import error:`, error);
			return { success: 0, errors: 0 };
		}
	}

	generateSRDMarkdown(categoryKey: string, data: any): string {
		const name = data.name || "Unknown";
		const index = data.index || "";

		// Common frontmatter
		let frontmatter = `---
type: srd-${categoryKey}
name: ${name}
index: ${index}
source: D&D 5e SRD
---

# ${name}

`;

		// Category-specific content
		switch (categoryKey) {
			case "ability-scores":
				frontmatter += this.generateAbilityScoreContent(data);
				break;
			case "classes":
				frontmatter += this.generateClassContent(data);
				break;
			case "conditions":
				frontmatter += this.generateConditionContent(data);
				break;
			case "damage-types":
				frontmatter += this.generateDamageTypeContent(data);
				break;
			case "equipment":
				frontmatter += this.generateEquipmentContent(data);
				break;
			case "features":
				frontmatter += this.generateFeatureContent(data);
				break;
			case "languages":
				frontmatter += this.generateLanguageContent(data);
				break;
			case "magic-schools":
				frontmatter += this.generateMagicSchoolContent(data);
				break;
			case "proficiencies":
				frontmatter += this.generateProficiencyContent(data);
				break;
			case "races":
				frontmatter += this.generateRaceContent(data);
				break;
			case "skills":
				frontmatter += this.generateSkillContent(data);
				break;
			case "subclasses":
				frontmatter += this.generateSubclassContent(data);
				break;
			case "subraces":
				frontmatter += this.generateSubraceContent(data);
				break;
			case "traits":
				frontmatter += this.generateTraitContent(data);
				break;
			case "weapon-properties":
				frontmatter += this.generateWeaponPropertyContent(data);
				break;
			default:
				frontmatter += this.generateGenericContent(data);
		}

		return frontmatter;
	}

	generateAbilityScoreContent(data: any): string {
		let content = `**Full Name:** ${data.full_name}\n\n`;
		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}
		if (data.skills && data.skills.length > 0) {
			content += `## Skills\n\n`;
			data.skills.forEach((skill: any) => {
				content += `- ${skill.name}\n`;
			});
		}
		return content;
	}

	generateClassContent(data: any): string {
		let content = `**Hit Die:** d${data.hit_die}\n\n`;
		
		if (data.proficiency_choices && data.proficiency_choices.length > 0) {
			content += `## Proficiency Choices\n\n`;
			data.proficiency_choices.forEach((choice: any) => {
				content += `**Choose ${choice.choose} from:**\n`;
				choice.from.options.forEach((opt: any) => {
					content += `- ${opt.item?.name || "Unknown"}\n`;
				});
				content += `\n`;
			});
		}

		if (data.proficiencies && data.proficiencies.length > 0) {
			content += `## Proficiencies\n\n`;
			data.proficiencies.forEach((prof: any) => {
				content += `- ${prof.name}\n`;
			});
			content += `\n`;
		}

		if (data.saving_throws && data.saving_throws.length > 0) {
			content += `## Saving Throws\n\n`;
			data.saving_throws.forEach((save: any) => {
				content += `- ${save.name}\n`;
			});
			content += `\n`;
		}

		if (data.starting_equipment && data.starting_equipment.length > 0) {
			content += `## Starting Equipment\n\n`;
			data.starting_equipment.forEach((eq: any) => {
				content += `- ${eq.quantity}x ${eq.equipment.name}\n`;
			});
			content += `\n`;
		}

		return content;
	}

	generateConditionContent(data: any): string {
		let content = "";
		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}
		return content;
	}

	generateDamageTypeContent(data: any): string {
		let content = "";
		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}
		return content;
	}

	generateEquipmentContent(data: any): string {
		let content = "";

		if (data.equipment_category) {
			content += `**Category:** ${data.equipment_category.name}\n`;
		}

		if (data.cost) {
			content += `**Cost:** ${data.cost.quantity} ${data.cost.unit}\n`;
		}

		if (data.weight) {
			content += `**Weight:** ${data.weight} lbs\n`;
		}

		content += `\n`;

		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}

		if (data.armor_category) {
			content += `## Armor Properties\n\n`;
			content += `- **Armor Category:** ${data.armor_category}\n`;
			if (data.armor_class) {
				content += `- **AC:** ${data.armor_class.base}`;
				if (data.armor_class.dex_bonus !== undefined) {
					content += ` + Dex ${data.armor_class.max_bonus !== null ? `(max ${data.armor_class.max_bonus})` : ""}`;
				}
				content += `\n`;
			}
			if (data.str_minimum) {
				content += `- **Str Minimum:** ${data.str_minimum}\n`;
			}
			if (data.stealth_disadvantage) {
				content += `- **Stealth Disadvantage:** Yes\n`;
			}
		}

		if (data.weapon_category) {
			content += `## Weapon Properties\n\n`;
			content += `- **Category:** ${data.weapon_category}\n`;
			if (data.weapon_range) {
				content += `- **Range:** ${data.weapon_range}\n`;
			}
			if (data.damage) {
				content += `- **Damage:** ${data.damage.damage_dice} ${data.damage.damage_type.name}\n`;
			}
			if (data.two_handed_damage) {
				content += `- **Two-Handed Damage:** ${data.two_handed_damage.damage_dice} ${data.two_handed_damage.damage_type.name}\n`;
			}
			if (data.range) {
				content += `- **Normal Range:** ${data.range.normal} ft\n`;
				if (data.range.long) {
					content += `- **Long Range:** ${data.range.long} ft\n`;
				}
			}
			if (data.properties && data.properties.length > 0) {
				content += `- **Properties:** ${data.properties.map((p: any) => p.name).join(", ")}\n`;
			}
		}

		return content;
	}

	generateFeatureContent(data: any): string {
		let content = "";

		if (data.level) {
			content += `**Level:** ${data.level}\n`;
		}

		if (data.class) {
			content += `**Class:** ${data.class.name}\n`;
		}

		if (data.subclass) {
			content += `**Subclass:** ${data.subclass.name}\n`;
		}

		content += `\n`;

		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}

		return content;
	}

	generateLanguageContent(data: any): string {
		let content = "";

		if (data.type) {
			content += `**Type:** ${data.type}\n\n`;
		}

		if (data.typical_speakers && data.typical_speakers.length > 0) {
			content += `**Typical Speakers:** ${data.typical_speakers.join(", ")}\n\n`;
		}

		if (data.script) {
			content += `**Script:** ${data.script}\n\n`;
		}

		if (data.desc) {
			content += `## Description\n\n${data.desc}\n\n`;
		}

		return content;
	}

	generateMagicSchoolContent(data: any): string {
		let content = "";
		if (data.desc) {
			content += `## Description\n\n${data.desc}\n\n`;
		}
		return content;
	}

	generateProficiencyContent(data: any): string {
		let content = "";

		if (data.type) {
			content += `**Type:** ${data.type}\n\n`;
		}

		if (data.classes && data.classes.length > 0) {
			content += `**Classes:** ${data.classes.map((c: any) => c.name).join(", ")}\n\n`;
		}

		if (data.races && data.races.length > 0) {
			content += `**Races:** ${data.races.map((r: any) => r.name).join(", ")}\n\n`;
		}

		if (data.reference) {
			content += `**Reference:** ${data.reference.name}\n\n`;
		}

		return content;
	}

	generateRaceContent(data: any): string {
		let content = "";

		if (data.speed) {
			content += `**Speed:** ${data.speed} ft\n`;
		}

		if (data.size) {
			content += `**Size:** ${data.size}\n`;
		}

		if (data.size_description) {
			content += `**Size Description:** ${data.size_description}\n`;
		}

		if (data.alignment) {
			content += `**Alignment:** ${data.alignment}\n`;
		}

		if (data.age) {
			content += `**Age:** ${data.age}\n`;
		}

		content += `\n`;

		if (data.ability_bonuses && data.ability_bonuses.length > 0) {
			content += `## Ability Score Increases\n\n`;
			data.ability_bonuses.forEach((bonus: any) => {
				content += `- **${bonus.ability_score.name}:** +${bonus.bonus}\n`;
			});
			content += `\n`;
		}

		if (data.starting_proficiencies && data.starting_proficiencies.length > 0) {
			content += `## Starting Proficiencies\n\n`;
			data.starting_proficiencies.forEach((prof: any) => {
				content += `- ${prof.name}\n`;
			});
			content += `\n`;
		}

		if (data.languages && data.languages.length > 0) {
			content += `## Languages\n\n`;
			data.languages.forEach((lang: any) => {
				content += `- ${lang.name}\n`;
			});
			content += `\n`;
		}

		if (data.traits && data.traits.length > 0) {
			content += `## Racial Traits\n\n`;
			data.traits.forEach((trait: any) => {
				content += `- ${trait.name}\n`;
			});
			content += `\n`;
		}

		if (data.subraces && data.subraces.length > 0) {
			content += `## Subraces\n\n`;
			data.subraces.forEach((subrace: any) => {
				content += `- ${subrace.name}\n`;
			});
			content += `\n`;
		}

		return content;
	}

	generateSkillContent(data: any): string {
		let content = "";

		if (data.ability_score) {
			content += `**Ability Score:** ${data.ability_score.name}\n\n`;
		}

		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}

		return content;
	}

	generateSubclassContent(data: any): string {
		let content = "";

		if (data.class) {
			content += `**Class:** ${data.class.name}\n`;
		}

		if (data.subclass_flavor) {
			content += `**Flavor:** ${data.subclass_flavor}\n`;
		}

		content += `\n`;

		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}

		if (data.spells && data.spells.length > 0) {
			content += `## Spells\n\n`;
			data.spells.forEach((spell: any) => {
				content += `- **Level ${spell.prerequisites[0]?.level || "N/A"}:** ${spell.spell.name}\n`;
			});
			content += `\n`;
		}

		return content;
	}

	generateSubraceContent(data: any): string {
		let content = "";

		if (data.race) {
			content += `**Race:** ${data.race.name}\n`;
		}

		content += `\n`;

		if (data.desc) {
			content += `## Description\n\n${data.desc}\n\n`;
		}

		if (data.ability_bonuses && data.ability_bonuses.length > 0) {
			content += `## Ability Score Increases\n\n`;
			data.ability_bonuses.forEach((bonus: any) => {
				content += `- **${bonus.ability_score.name}:** +${bonus.bonus}\n`;
			});
			content += `\n`;
		}

		if (data.starting_proficiencies && data.starting_proficiencies.length > 0) {
			content += `## Starting Proficiencies\n\n`;
			data.starting_proficiencies.forEach((prof: any) => {
				content += `- ${prof.name}\n`;
			});
			content += `\n`;
		}

		if (data.racial_traits && data.racial_traits.length > 0) {
			content += `## Racial Traits\n\n`;
			data.racial_traits.forEach((trait: any) => {
				content += `- ${trait.name}\n`;
			});
			content += `\n`;
		}

		return content;
	}

	generateTraitContent(data: any): string {
		let content = "";

		if (data.races && data.races.length > 0) {
			content += `**Races:** ${data.races.map((r: any) => r.name).join(", ")}\n\n`;
		}

		if (data.subraces && data.subraces.length > 0) {
			content += `**Subraces:** ${data.subraces.map((s: any) => s.name).join(", ")}\n\n`;
		}

		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}

		return content;
	}

	generateWeaponPropertyContent(data: any): string {
		let content = "";
		if (data.desc && data.desc.length > 0) {
			content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
		}
		return content;
	}

	generateGenericContent(data: any): string {
		let content = "## Data\n\n```json\n";
		content += JSON.stringify(data, null, 2);
		content += "\n```\n";
		return content;
	}

	async promptForName(type: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new NamePromptModal(this.app, type, resolve);
			modal.open();
		});
	}

	async ensureFolderExists(path: string) {
		const folders = path.split("/");
		let currentPath = "";

		for (const folder of folders) {
			currentPath += (currentPath ? "/" : "") + folder;
			try {
				await this.app.vault.createFolder(currentPath);
			} catch (error) {
				// Folder might already exist, continue
			}
		}
	}

	getDefaultCampaignTemplate(): string {
		return CAMPAIGN_TEMPLATE;
	}

	getDefaultNpcTemplate(): string {
		return NPC_TEMPLATE;
	}

	getDefaultPcTemplate(): string {
		return PC_TEMPLATE;
	}

	getDefaultAdventureTemplate(): string {
		return ADVENTURE_TEMPLATE;
	}

	getDefaultSessionTemplate(): string {
		return SESSION_DEFAULT_TEMPLATE;
	}

	getDefaultItemTemplate(): string {
		return ITEM_TEMPLATE;
	}

	getDefaultSpellTemplate(): string {
		return SPELL_TEMPLATE;
	}

	getDefaultFactionTemplate(): string {
		return FACTION_TEMPLATE;
	}

	getFileNameFromPath(): string {
		// This is a placeholder - in actual use, this would be the filename
		return "New Entity";
	}

	getAllCampaigns(): Array<{ path: string; name: string }> {
		const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
		const campaigns: Array<{ path: string; name: string }> = [];

		if (ttrpgsFolder instanceof TFolder) {
			ttrpgsFolder.children.forEach((child) => {
				if (child instanceof TFolder) {
					campaigns.push({
						path: child.path,
						name: child.name
					});
				}
			});
		}

		return campaigns;
	}
}

class DndCampaignHubSettingTab extends PluginSettingTab {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "D&D Campaign Hub Settings" });

    // Plugin Dependencies Section
    containerEl.createEl("h3", { text: "📦 Plugin Dependencies" });
    
    const depsContainer = containerEl.createDiv({ cls: "dnd-dependencies-container" });
    await this.displayDependencyStatus(depsContainer);

    // Campaign Settings
    containerEl.createEl("h3", { text: "⚙️ Campaign Settings" });

    new Setting(containerEl)
      .setName("Current Campaign")
      .setDesc("The currently active campaign for quick access")
      .addText((text) =>
        text
          .setPlaceholder("ttrpgs/Campaign Name")
          .setValue(this.plugin.settings.currentCampaign)
          .onChange(async (value) => {
            this.plugin.settings.currentCampaign = value;
            await this.plugin.saveSettings();
          })
      );

    // SRD Data Import Section
    containerEl.createEl("h3", { text: "📥 SRD Data Import" });
    
    const srdContainer = containerEl.createDiv({ cls: "dnd-about-container" });
    srdContainer.createEl("p", { 
      text: "Download and import D&D 5e SRD data from the official API. Data will be saved to system folders in your vault." 
    });

    new Setting(containerEl)
      .setName("Import All SRD Data")
      .setDesc("Downloads all available SRD content (conditions, equipment, races, features, etc.) and saves to system folders (e.g., z_Conditions, z_Equipment). This may take several minutes.")
      .addButton((button) =>
        button
          .setButtonText("Import All SRD Data")
          .setCta()
          .onClick(async () => {
            await this.plugin.importAllSRDData();
          })
      );

    new Setting(containerEl)
      .setName("Import Individual Categories")
      .setDesc("Import specific SRD data categories")
      .setHeading();

    const srdCategories = [
      { key: "ability-scores", folder: "z_AbilityScores", name: "Ability Scores" },
      { key: "classes", folder: "z_Classes", name: "Classes" },
      { key: "conditions", folder: "z_Conditions", name: "Conditions" },
      { key: "damage-types", folder: "z_DamageTypes", name: "Damage Types" },
      { key: "equipment", folder: "z_Equipment", name: "Equipment" },
      { key: "features", folder: "z_Features", name: "Features" },
      { key: "languages", folder: "z_Languages", name: "Languages" },
      { key: "magic-schools", folder: "z_MagicSchools", name: "Magic Schools" },
      { key: "proficiencies", folder: "z_Proficiencies", name: "Proficiencies" },
      { key: "races", folder: "z_Races", name: "Races" },
      { key: "skills", folder: "z_Skills", name: "Skills" },
      { key: "subclasses", folder: "z_Subclasses", name: "Subclasses" },
      { key: "subraces", folder: "z_Subraces", name: "Subraces" },
      { key: "traits", folder: "z_Traits", name: "Traits" },
      { key: "weapon-properties", folder: "z_WeaponProperties", name: "Weapon Properties" }
    ];

    srdCategories.forEach(category => {
      new Setting(containerEl)
        .setName(category.name)
        .addButton((button) =>
          button
            .setButtonText(`Import ${category.name}`)
            .onClick(async () => {
              await this.plugin.importSRDCategory(category.key, category.folder, category.name);
            })
        );
    });

    // About Section
    containerEl.createEl("h3", { text: "ℹ️ About" });
    
    const aboutContainer = containerEl.createDiv({ cls: "dnd-about-container" });
    aboutContainer.createEl("p", { 
      text: `D&D Campaign Hub v${this.plugin.manifest.version}` 
    });
    aboutContainer.createEl("p", { 
      text: "A comprehensive plugin for managing D&D campaigns in Obsidian." 
    });
    
    new Setting(containerEl)
      .setName("Migrate Files")
      .setDesc("Safely migrate campaign files to the latest template versions (preserves all your content)")
      .addButton((button) =>
        button
          .setButtonText("Migrate Files")
          .setCta()
          .onClick(async () => {
            this.plugin.migrateTemplates();
          })
      );

    containerEl.createEl("h3", { text: "Danger Zone" });

    new Setting(containerEl)
      .setName("Purge D&D Campaign Hub")
      .setDesc("⚠️ Remove all D&D Campaign Hub folders and files from this vault. This cannot be undone!")
      .addButton((button) =>
        button
          .setButtonText("Purge Vault")
          .setWarning()
          .onClick(async () => {
            new PurgeConfirmModal(this.app, this.plugin).open();
          })
      );
  }

  async displayDependencyStatus(container: HTMLElement): Promise<void> {
    container.empty();

    const deps = await this.plugin.checkDependencies();
    const allInstalled = deps.missing.length === 0;

    // Status indicator
    const statusContainer = container.createDiv({ cls: "dnd-dependency-status" });
    
    if (allInstalled) {
      statusContainer.createEl("div", { 
        text: "✅ All dependencies installed and ready!",
        cls: "dnd-status-success"
      });
    } else {
      statusContainer.createEl("div", { 
        text: `⚠️ ${deps.missing.length} dependency plugin(s) missing`,
        cls: "dnd-status-warning"
      });
    }

    // Detailed plugin list
    const pluginsContainer = container.createDiv({ cls: "dnd-plugins-list" });
    
    const requiredPlugins = [
      { id: "buttons", name: "Buttons", url: "obsidian://show-plugin?id=buttons" },
      { id: "dataview", name: "Dataview", url: "obsidian://show-plugin?id=dataview" },
      { id: "calendarium", name: "Calendarium", url: "obsidian://show-plugin?id=calendarium" },
      { id: "templater-obsidian", name: "Templater", url: "obsidian://show-plugin?id=templater-obsidian" },
      { id: "initiative-tracker", name: "Initiative Tracker", url: "obsidian://show-plugin?id=initiative-tracker" }
    ];

    for (const plugin of requiredPlugins) {
      const isInstalled = deps.installed.includes(plugin.name);
      
      const pluginRow = pluginsContainer.createDiv({ cls: "dnd-plugin-row" });
      
      const statusIcon = pluginRow.createEl("span", { 
        text: isInstalled ? "✅" : "❌",
        cls: "dnd-plugin-status-icon"
      });
      
      const pluginName = pluginRow.createEl("span", { 
        text: plugin.name,
        cls: isInstalled ? "dnd-plugin-installed" : "dnd-plugin-missing"
      });
      
      if (!isInstalled) {
        const installButton = pluginRow.createEl("button", {
          text: "Install",
          cls: "mod-cta"
        });
        installButton.addEventListener("click", () => {
          // Open Obsidian's plugin browser directly to this plugin
          window.open(plugin.url, "_blank");
        });
      }
    }

    // Refresh button
    new Setting(container)
      .setName("Refresh Status")
      .setDesc("Check dependency status again")
      .addButton((button) =>
        button
          .setButtonText("Refresh")
          .onClick(async () => {
            await this.displayDependencyStatus(container);
            new Notice("Dependency status refreshed!");
          })
      );
  }
}

class MigrationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  private filesNeedingMigration: TFile[] = [];
  private selectedFiles: Set<TFile> = new Set();
  private currentCampaign: string = "";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-migration-modal");

    contentEl.createEl("h2", { text: "🛡️ Safe File Migration" });

    // Get current campaign
    const campaigns = this.plugin.getAllCampaigns();
    if (campaigns.length === 0) {
      contentEl.createEl("p", { text: "No campaigns found. Nothing to migrate." });
      const closeBtn = contentEl.createEl("button", { text: "Close", cls: "mod-cta" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }

    // Campaign selector
    const campaignContainer = contentEl.createDiv({ cls: "setting-item" });
    campaignContainer.createEl("label", { text: "Select Campaign:" });
    const campaignSelect = campaignContainer.createEl("select");
    
    campaigns.forEach(campaign => {
      const campaignName = typeof campaign === 'string' ? campaign : campaign.name;
      const option = campaignSelect.createEl("option", { 
        text: campaignName,
        value: `ttrpgs/${campaignName}`
      });
      if (`ttrpgs/${campaign}` === this.plugin.settings.currentCampaign) {
        option.selected = true;
      }
    });

    this.currentCampaign = campaignSelect.value;

    // Scan button
    const scanBtn = contentEl.createEl("button", {
      text: "🔍 Scan for Updates",
      cls: "mod-cta"
    });

    const resultsContainer = contentEl.createDiv({ cls: "migration-results" });

    scanBtn.addEventListener("click", async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = "Scanning...";
      resultsContainer.empty();

      this.filesNeedingMigration = await this.plugin.migrationManager.findFilesNeedingMigration(this.currentCampaign);
      
      if (this.filesNeedingMigration.length === 0) {
        resultsContainer.createEl("p", { 
          text: "✅ All files are up to date!",
          cls: "migration-success"
        });
        scanBtn.disabled = false;
        scanBtn.textContent = "🔍 Scan for Updates";
        return;
      }

      // Show results
      resultsContainer.createEl("h3", { 
        text: `Found ${this.filesNeedingMigration.length} file(s) that can be updated:` 
      });

      // Select all checkbox
      const selectAllContainer = resultsContainer.createDiv({ cls: "setting-item" });
      const selectAllCheckbox = selectAllContainer.createEl("input", { type: "checkbox" });
      selectAllCheckbox.checked = true;
      selectAllContainer.createEl("label", { text: " Select all files" });
      
      selectAllCheckbox.addEventListener("change", () => {
        const allCheckboxes = resultsContainer.querySelectorAll('input[type="checkbox"]:not(:first-child)');
        allCheckboxes.forEach((element) => {
          const checkbox = element as HTMLInputElement;
          checkbox.checked = selectAllCheckbox.checked;
        });
        this.updateSelectedFiles();
      });

      // File list
      const fileList = resultsContainer.createEl("div", { cls: "migration-file-list" });
      
      for (const file of this.filesNeedingMigration) {
        const fileItem = fileList.createDiv({ cls: "migration-file-item" });
        
        const checkbox = fileItem.createEl("input", { type: "checkbox" });
        checkbox.checked = true;
        this.selectedFiles.add(file);

        const fileType = await this.plugin.migrationManager.getFileType(file);
        const currentVersion = await this.plugin.migrationManager.getFileTemplateVersion(file) || "none";
        const targetVersion = TEMPLATE_VERSIONS[fileType as keyof typeof TEMPLATE_VERSIONS];

        const fileInfo = fileItem.createEl("span", {
          text: `${file.path} (${fileType}: v${currentVersion} → v${targetVersion})`
        });

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            this.selectedFiles.add(file);
          } else {
            this.selectedFiles.delete(file);
          }
        });
      }

      this.updateSelectedFiles();

      // Migration info
      const infoBox = resultsContainer.createDiv({ cls: "migration-info" });
      infoBox.createEl("h3", { text: "What will be updated:" });
      const updateList = infoBox.createEl("ul");
      updateList.createEl("li", { text: "✅ New frontmatter fields will be added" });
      updateList.createEl("li", { text: "✅ New sections will be injected (not replacing existing ones)" });
      updateList.createEl("li", { text: "✅ Dataview queries may be updated" });
      updateList.createEl("li", { text: "✅ Template version will be tracked" });
      
      infoBox.createEl("h3", { text: "What will be preserved:" });
      const preserveList = infoBox.createEl("ul");
      preserveList.createEl("li", { text: "🛡️ All your existing content" });
      preserveList.createEl("li", { text: "🛡️ All frontmatter values" });
      preserveList.createEl("li", { text: "🛡️ All sections you've written" });

      // Migrate button
      const migrateBtn = resultsContainer.createEl("button", {
        text: `Migrate ${this.selectedFiles.size} file(s)`,
        cls: "mod-cta"
      });

      migrateBtn.addEventListener("click", async () => {
        await this.performMigration(migrateBtn, resultsContainer);
      });

      scanBtn.disabled = false;
      scanBtn.textContent = "🔍 Scan for Updates";
    });

    campaignSelect.addEventListener("change", () => {
      this.currentCampaign = campaignSelect.value;
      resultsContainer.empty();
      this.filesNeedingMigration = [];
      this.selectedFiles.clear();
    });

    // Close button
    const closeBtn = contentEl.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  private updateSelectedFiles() {
    // This method can be used to update UI based on selection
  }

  private async performMigration(button: HTMLButtonElement, container: HTMLElement) {
    if (this.selectedFiles.size === 0) {
      new Notice("No files selected for migration.");
      return;
    }

    button.disabled = true;
    button.textContent = "Migrating...";

    const filesToMigrate = Array.from(this.selectedFiles);
    const result = await this.plugin.migrationManager.migrateFiles(filesToMigrate);

    container.empty();
    
    if (result.success > 0) {
      container.createEl("p", {
        text: `✅ Successfully migrated ${result.success} file(s)!`,
        cls: "migration-success"
      });
    }

    if (result.failed > 0) {
      container.createEl("p", {
        text: `⚠️ Failed to migrate ${result.failed} file(s). Check console for details.`,
        cls: "migration-warning"
      });
    }

    new Notice(`Migration complete: ${result.success} succeeded, ${result.failed} failed.`);

    // Add close button
    const closeBtn = container.createEl("button", { text: "Close", cls: "mod-cta" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class PurgeConfirmModal extends Modal {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "⚠️ Purge D&D Campaign Hub" });

    contentEl.createEl("p", {
      text: "This will permanently delete ALL D&D Campaign Hub folders and their contents:",
      cls: "mod-warning"
    });

    const list = contentEl.createEl("ul");
    const folders = [
      "ttrpgs/ - All campaigns and their content",
      "z_Templates/ - All template files",
      "z_Assets/ - All assets",
      "z_Beastiarity/ - All monster data",
      "z_Databases/ - All databases",
      "z_Log/ - All session logs",
      "z_Tables/ - All tables",
      "z_Spells/ - All imported spells from API",
      "And all other z_* folders (SRD data, scripts, etc.)"
    ];

    folders.forEach(folder => {
      list.createEl("li", { text: folder });
    });

    contentEl.createEl("p", {
      text: "⚠️ THIS CANNOT BE UNDONE!",
      cls: "mod-warning"
    });

    contentEl.createEl("p", {
      text: "Type 'PURGE' to confirm:"
    });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Type PURGE to confirm"
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const purgeButton = buttonContainer.createEl("button", {
      text: "Purge Vault",
      cls: "mod-warning"
    });

    purgeButton.disabled = true;

    input.addEventListener("input", () => {
      purgeButton.disabled = input.value !== "PURGE";
    });

    purgeButton.addEventListener("click", async () => {
      if (input.value === "PURGE") {
        this.close();
        await this.plugin.purgeVault();
      }
    });

    input.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class DndHubModal extends Modal {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  showInitializationUI(container: HTMLElement) {
    container.createEl("p", { 
      text: "Welcome to D&D Campaign Hub! Your vault needs to be initialized before you can start creating campaigns.",
      cls: "dnd-hub-info"
    });

    container.createEl("p", {
      text: "This will create the following structure:"
    });

    const list = container.createEl("ul");
    const folders = [
      "ttrpgs/ - Main folder for all campaigns",
      "z_Templates/ - Template files for campaigns, sessions, NPCs, etc.",
      "z_Assets/ - Images and other assets",
      "z_Beastiarity/ - Monster and creature stats",
      "z_Databases/ - Campaign databases",
      "z_Log/ - Session logs",
      "z_Tables/ - Random tables and generators",
      "And more supporting folders..."
    ];

    folders.forEach(folder => {
      list.createEl("li", { text: folder });
    });

    container.createEl("p", {
      text: "⚠️ Note: This will also configure settings for Templater and Hide Folders plugins if they are installed."
    });

    const buttonContainer = container.createDiv({ cls: "dnd-hub-init-buttons" });
    
    const initButton = buttonContainer.createEl("button", {
      text: "🎲 Initialize Vault",
      cls: "mod-cta"
    });

    initButton.addEventListener("click", async () => {
      this.close();
      await this.plugin.initializeVault();
      // Reopen the modal to show the full UI
      new DndHubModal(this.app, this.plugin).open();
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel"
    });

    cancelButton.addEventListener("click", () => {
      this.close();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h1", { text: "D&D Campaign Hub" });

    // Check if vault is initialized
    if (!this.plugin.isVaultInitialized()) {
      console.log("DND Hub: Vault not initialized, showing init UI");
      this.showInitializationUI(contentEl);
      return;
    }

    // Check if any campaigns exist
    const campaigns = this.plugin.getAllCampaigns();
    const hasCampaigns = campaigns.length > 0;
    console.log("DND Hub: Found", campaigns.length, "campaigns. hasCampaigns:", hasCampaigns);

    // Quick Actions Section
    contentEl.createEl("h2", { text: "Quick Actions" });

    const quickActionsContainer = contentEl.createDiv({ cls: "dnd-hub-quick-actions" });

    console.log("DND Hub: Creating 'New Campaign' button");
    this.createActionButton(quickActionsContainer, "🎲 New Campaign", () => {
      this.close();
      this.plugin.createCampaign();
    });

    // Only show other buttons if campaigns exist
    if (hasCampaigns) {
      this.createActionButton(quickActionsContainer, "👤 New NPC", () => {
        this.close();
        this.plugin.createNpc();
      });

      this.createActionButton(quickActionsContainer, "🛡️ New PC", () => {
        this.close();
        this.plugin.createPc();
      });

      this.createActionButton(quickActionsContainer, "🏛️ New Faction", () => {
        this.close();
        this.plugin.createFaction();
      });

      this.createActionButton(quickActionsContainer, "🗺️ New Adventure", () => {
        this.close();
        this.plugin.createAdventure();
      });

      this.createActionButton(quickActionsContainer, "⚔️ New Encounter", () => {
        this.close();
        this.plugin.createEncounter();
      });

      this.createActionButton(quickActionsContainer, "🪤 New Trap", () => {
        this.close();
        this.plugin.createTrap();
      });

      this.createActionButton(quickActionsContainer, "⚔️ New Item", () => {
        this.close();
        this.plugin.createItem();
      });

      this.createActionButton(quickActionsContainer, "🐉 New Creature", () => {
        this.close();
        this.plugin.createCreature();
      });
    }

    if (hasCampaigns) {
      contentEl.createEl("p", {
        text: "Create sessions from a campaign's World note or via the 'Create New Session' command.",
        cls: "dnd-hub-info",
      });

      // Browse Vault Section
      contentEl.createEl("h2", { text: "Browse Vault" });
      const browseContainer = contentEl.createDiv({ cls: "dnd-hub-browse" });

      this.createBrowseButton(browseContainer, "📁 Campaigns", "Campaigns");
      this.createBrowseButton(browseContainer, "👥 NPCs", "NPCs");
      this.createBrowseButton(browseContainer, "🛡️ PCs", "PCs");
      this.createBrowseButton(browseContainer, "🗺️ Adventures", "Adventures");
      this.createBrowseButton(browseContainer, "📜 Sessions", "Sessions");
      this.createBrowseButton(browseContainer, "⚔️ Items", "Items");
      this.createBrowseButton(browseContainer, "✨ Spells", "Spells");
      this.createBrowseButton(browseContainer, "🏛️ Factions", "Factions");
    } else {
      contentEl.createEl("p", {
        text: "Create your first campaign to get started!",
        cls: "dnd-hub-info",
      });
    }
  }

  createActionButton(container: Element, text: string, callback: () => void) {
    const button = container.createEl("button", { text, cls: "dnd-hub-button" });
    button.addEventListener("click", callback);
  }

  createBrowseButton(container: Element, text: string, folderName: string) {
    const button = container.createEl("button", { text, cls: "dnd-hub-button" });
    button.addEventListener("click", () => {
      this.close();
      this.browseFolder(folderName);
    });
  }

  async browseFolder(folderName: string) {
    let folderPath: string;
    if (["NPCs", "PCs", "Adventures", "Factions", "Items"].includes(folderName)) {
      folderPath = `${this.plugin.settings.currentCampaign}/${folderName}`;
    } else if (folderName === "Campaigns") {
      folderPath = "ttrpgs";
    } else if (folderName === "Sessions") {
      folderPath = this.plugin.settings.currentCampaign;
    } else {
      folderPath = folderName;
    }

    try {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        // Open the folder in the file explorer
        const leaf = this.app.workspace.getLeaf();
        await this.app.workspace.revealLeaf(leaf);
      } else {
        new Notice(`Folder "${folderName}" not found. Create some ${folderName.toLowerCase()} first!`);
      }
    } catch (error) {
      new Notice(`Error browsing ${folderName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class NamePromptModal extends Modal {
  type: string;
  resolve: (value: string | null) => void;

  constructor(app: App, type: string, resolve: (value: string | null) => void) {
    super(app);
    this.type = type;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: `Create New ${this.type}` });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: `Enter ${this.type.toLowerCase()} name...`,
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.resolve(null);
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create",
      cls: "mod-cta",
    });
    createButton.addEventListener("click", () => {
      const name = input.value.trim();
      if (name) {
        this.close();
        this.resolve(name);
      }
    });

    input.focus();
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        createButton.click();
      }
    });
  }

  onClose() {
    this.resolve(null);
  }
}

class PCCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  pcName = "";
  playerName = "";
  campaign = "";
  classes: string[] = [""];
  level = "1";
  hpCurrent = "";
  hpMax = "";
  ac = "10";
  initBonus = "0";
  speed = "30";
  characterSheetUrl = "";
  characterSheetPdf = "";
  isGM = false;
  registerInTracker = true;  // Default: register PCs in Initiative Tracker

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🛡️ Create New Player Character" });

    contentEl.createEl("p", {
      text: "Create a new player character with detailed stats and information.",
      cls: "setting-item-description"
    });

    // Campaign Selection
    const campaigns = this.getAllCampaigns();
    const campaignSetting = new Setting(contentEl)
      .setName("Campaign")
      .setDesc("Which campaign does this PC belong to?")
      .addDropdown((dropdown) => {
        campaigns.forEach(campaign => {
          dropdown.addOption(campaign.path, campaign.name);
        });
        dropdown.setValue(this.campaign)
          .onChange(async (value) => {
            this.campaign = value;
            await this.checkCampaignRole();
            this.refresh();
          });
      });

    // Check initial role
    this.checkCampaignRole().then(() => {
      this.buildForm(contentEl);
    });
  }

  async checkCampaignRole() {
    const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
    if (worldFile instanceof TFile) {
      const worldContent = await this.app.vault.read(worldFile);
      const roleMatch = worldContent.match(/^role:\s*([^\r\n]\w*)$/m);
      if (roleMatch && roleMatch[1]) {
        this.isGM = roleMatch[1].toLowerCase() === 'gm';
      }
    }
  }

  buildForm(contentEl: HTMLElement) {
    // Clear existing form content (keep header and campaign selection)
    const children = Array.from(contentEl.children);
    for (let i = children.length - 1; i >= 3; i--) {
      children[i]?.remove();
    }

    // PC Name
    new Setting(contentEl)
      .setName("Character Name")
      .setDesc("The name of the player character")
      .addText((text) => {
        text
          .setPlaceholder("e.g., Gandalf the Grey")
          .setValue(this.pcName)
          .onChange((value) => {
            this.pcName = value;
          });
        if (!this.pcName) text.inputEl.focus();
      });

    // Player Name
    new Setting(contentEl)
      .setName("Player Name")
      .setDesc("Who plays this character?")
      .addText((text) =>
        text
          .setPlaceholder("e.g., John Smith")
          .setValue(this.playerName)
          .onChange((value) => {
            this.playerName = value;
          })
      );

    // GM-only fields
    if (this.isGM) {
      contentEl.createEl("h3", { text: "⚔️ Character Stats" });

      // Class (with multiple class support)
      const classContainer = contentEl.createDiv({ cls: "dnd-class-container" });
      
      const updateClassInputs = () => {
        classContainer.empty();
        this.classes.forEach((cls, index) => {
          new Setting(classContainer)
            .setName(index === 0 ? "Class" : `Class ${index + 1}`)
            .setDesc(index === 0 ? "Character class(es)" : "Additional class for multiclassing")
            .addText((text) => {
              text
                .setPlaceholder("e.g., Fighter, Wizard")
                .setValue(cls)
                .onChange((value) => {
                  this.classes[index] = value;
                });
              text.inputEl.style.width = "200px";
            })
            .addButton((button) => {
              if (index === this.classes.length - 1) {
                button
                  .setButtonText("+")
                  .setTooltip("Add another class (multiclassing)")
                  .onClick(() => {
                    this.classes.push("");
                    updateClassInputs();
                  });
              } else {
                button
                  .setButtonText("−")
                  .setTooltip("Remove this class")
                  .setWarning()
                  .onClick(() => {
                    this.classes.splice(index, 1);
                    updateClassInputs();
                  });
              }
            });
        });
      };

      updateClassInputs();

      // Level
      new Setting(contentEl)
        .setName("Level")
        .setDesc("Character level")
        .addText((text) => {
          text
            .setPlaceholder("1")
            .setValue(this.level)
            .onChange((value) => {
              this.level = value;
            });
          text.inputEl.type = "number";
          text.inputEl.style.width = "80px";
        });

      // HP
      const hpSetting = new Setting(contentEl)
        .setName("Hit Points")
        .setDesc("Current HP / Max HP");

      hpSetting.addText((text) => {
        text
          .setPlaceholder("Current")
          .setValue(this.hpCurrent)
          .onChange((value) => {
            this.hpCurrent = value;
          });
        text.inputEl.type = "number";
        text.inputEl.style.width = "80px";
      });

      hpSetting.controlEl.createSpan({ text: " / ", cls: "dnd-hp-separator" });

      hpSetting.addText((text) => {
        text
          .setPlaceholder("Max")
          .setValue(this.hpMax)
          .onChange((value) => {
            this.hpMax = value;
          });
        text.inputEl.type = "number";
        text.inputEl.style.width = "80px";
      });

      // AC
      new Setting(contentEl)
        .setName("Armor Class (AC)")
        .setDesc("Character's AC")
        .addText((text) => {
          text
            .setPlaceholder("10")
            .setValue(this.ac)
            .onChange((value) => {
              this.ac = value;
            });
          text.inputEl.type = "number";
          text.inputEl.style.width = "80px";
        });

      // Initiative Modifier
      new Setting(contentEl)
        .setName("Initiative Modifier")
        .setDesc("Bonus or penalty to initiative rolls")
        .addText((text) => {
          text
            .setPlaceholder("+0")
            .setValue(this.initBonus)
            .onChange((value) => {
              this.initBonus = value;
            });
          text.inputEl.style.width = "80px";
        });

      // Speed
      new Setting(contentEl)
        .setName("Speed")
        .setDesc("Movement speed in feet")
        .addText((text) => {
          text
            .setPlaceholder("30")
            .setValue(this.speed)
            .onChange((value) => {
              this.speed = value;
            });
          text.inputEl.type = "number";
          text.inputEl.style.width = "80px";
        });
    }

    // Character Sheet Links (for both GM and Player)
    contentEl.createEl("h3", { text: "📄 Character Sheet" });

    new Setting(contentEl)
      .setName("Digital Character Sheet Link")
      .setDesc("Optional: Link to D&D Beyond, Roll20, or other digital sheet")
      .addText((text) =>
        text
          .setPlaceholder("https://www.dndbeyond.com/characters/...")
          .setValue(this.characterSheetUrl)
          .onChange((value) => {
            this.characterSheetUrl = value;
          })
      );
    
    // Initiative Tracker Integration
    if (this.isGM) {
      contentEl.createEl("h3", { text: "🎲 Initiative Tracker Integration" });
      
      new Setting(contentEl)
        .setName("Register in Initiative Tracker")
        .setDesc("Automatically add this PC to Initiative Tracker's party management system")
        .addToggle((toggle) =>
          toggle
            .setValue(this.registerInTracker)
            .onChange((value) => {
              this.registerInTracker = value;
            })
        );
    }

    new Setting(contentEl)
      .setName("Character Sheet PDF")
      .setDesc("Optional: Upload or link to a PDF character sheet")
      .addButton((button) =>
        button
          .setButtonText("📎 Attach PDF")
          .onClick(async () => {
            new Notice("PDF upload: Please manually add the PDF to your vault and reference it in the note.");
            // In a full implementation, this could trigger file picker
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("Path to PDF in vault or external link")
          .setValue(this.characterSheetPdf)
          .onChange((value) => {
            this.characterSheetPdf = value;
          })
      );

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create PC",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.pcName.trim()) {
        new Notice("Please enter a character name!");
        return;
      }

      this.close();
      await this.createPCFile();
    });
  }

  refresh() {
    const { contentEl } = this;
    this.buildForm(contentEl);
  }

  getAllCampaigns(): Array<{ path: string; name: string }> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const campaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      ttrpgsFolder.children.forEach((child) => {
        if (child instanceof TFolder) {
          campaigns.push({
            path: child.path,
            name: child.name
          });
        }
      });
    }

    return campaigns;
  }

  async createPCFile() {
    const campaignName = this.campaign.split('/').pop() || "Unknown";
    const pcPath = `${this.campaign}/PCs`;
    
    new Notice(`Creating PC "${this.pcName}"...`);

    try {
      await this.plugin.ensureFolderExists(pcPath);

      // Get world info from campaign World.md
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
      let worldName = campaignName;
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*([^\r\n]\w*)$/m);
        if (worldMatch && worldMatch[1] && worldMatch[1].trim()) {
          worldName = worldMatch[1].trim();
        }
      }

      // Get PC template
      const templatePath = "z_Templates/Frontmatter - Player Character.md";
      const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      let pcContent: string;

      if (templateFile instanceof TFile) {
        pcContent = await this.app.vault.read(templateFile);
      } else {
        pcContent = PC_TEMPLATE;
      }

      // Get current date
      const currentDate = new Date().toISOString().split('T')[0];

      // Combine classes into a single string
      const classString = this.classes.filter(c => c.trim()).join("/");

      // Build complete frontmatter
      const frontmatter = `---
type: player
name: ${this.pcName}
player: ${this.playerName}
campaign: ${campaignName}
world: ${worldName}
race: 
class: ${classString}
subclass: 
level: ${this.level}
hp: ${this.hpCurrent || "0"}
hp_max: ${this.hpMax || "0"}
thp: 0
ac: ${this.ac}
init_bonus: ${this.initBonus}
speed: ${this.speed}
passive_perception: 10
background: 
alignment: 
experience: 0
readonlyUrl: ${this.characterSheetUrl}
characterSheetPdf: ${this.characterSheetPdf}
date: ${currentDate}
---`;

      // Replace the frontmatter
      pcContent = pcContent.replace(/^---\n[\s\S]*?\n---/, frontmatter);
      
      // Replace the title
      pcContent = pcContent.replace(/# <% tp\.frontmatter\.name %>/, `# ${this.pcName}`);

      // Replace template references with actual values
      pcContent = pcContent
        .replace(/<% tp\.frontmatter\.name %>/g, this.pcName)
        .replace(/<% tp\.frontmatter\.class %>/g, classString)
        .replace(/<% tp\.frontmatter\.level %>/g, this.level)
        .replace(/<% tp\.frontmatter\.hp %>/g, this.hpCurrent || "0")
        .replace(/<% tp\.frontmatter\.hp_max %>/g, this.hpMax || "0")
        .replace(/<% tp\.frontmatter\.ac %>/g, this.ac)
        .replace(/<% tp\.frontmatter\.init_bonus %>/g, this.initBonus)
        .replace(/<% tp\.frontmatter\.speed %>/g, this.speed)
        .replace(/<% tp\.frontmatter\.readonlyUrl \? "\[Digital Character Sheet\]\(" \+ tp\.frontmatter\.readonlyUrl \+ "\)" : "_No digital sheet linked_" %>/g, 
          this.characterSheetUrl ? `[Digital Character Sheet](${this.characterSheetUrl})` : "_No digital sheet linked_")
        .replace(/<% tp\.frontmatter\.characterSheetPdf \? "\[\[" \+ tp\.frontmatter\.characterSheetPdf \+ "\|Character Sheet PDF\]\]" : "_No PDF uploaded_" %>/g,
          this.characterSheetPdf ? `[[${this.characterSheetPdf}|Character Sheet PDF]]` : "_No PDF uploaded_");

      const filePath = `${pcPath}/${this.pcName}.md`;
      await this.app.vault.create(filePath, pcContent);

      // Open the file
      await this.app.workspace.openLinkText(filePath, "", true);

      new Notice(`✅ PC "${this.pcName}" created successfully!`);
      
      // Register in Initiative Tracker if requested
      if (this.registerInTracker && this.isGM) {
        await this.registerPCInInitiativeTracker(filePath);
      }
    } catch (error) {
      new Notice(`❌ Error creating PC: ${error instanceof Error ? error.message : String(error)}`);
      console.error("PC creation error:", error);
    }
  }

  /**
   * Register PC in Initiative Tracker's party management system
   */
  async registerPCInInitiativeTracker(pcFilePath: string) {
    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin) {
        new Notice("⚠️ Initiative Tracker not found. PC created but not registered in tracker.");
        return;
      }

      // Initialize players array if it doesn't exist
      if (!initiativePlugin.data.players) {
        initiativePlugin.data.players = [];
      }

      // Check if player already exists (by name or path)
      const existingPlayer = initiativePlugin.data.players.find((p: any) => 
        p.name === this.pcName || p.path === pcFilePath
      );
      
      if (existingPlayer) {
        new Notice(`⚠️ ${this.pcName} already registered in Initiative Tracker. Skipping duplicate registration.`);
        console.log("Player already exists:", existingPlayer);
        return;
      }

      // Generate unique ID for the player
      const playerId = this.generatePlayerId();
      
      // Parse initiative modifier - handle both "+2" and "2" formats
      console.log("Raw initBonus value:", this.initBonus);
      const initMod = parseInt(this.initBonus.replace(/[^-\d]/g, '')) || 0;
      console.log("Parsed initiative modifier:", initMod);
      
      // Parse HP values
      const currentHP = parseInt(this.hpCurrent) || parseInt(this.hpMax) || 1;
      const maxHP = parseInt(this.hpMax) || currentHP;
      
      // Parse AC
      const armorClass = parseInt(this.ac) || 10;
      
      // Parse level
      const charLevel = parseInt(this.level) || 1;
      
      // Create player data in Initiative Tracker format
      const playerData = {
        name: this.pcName,
        display: this.pcName,  // CRITICAL: Display name for party view
        id: playerId,
        initiative: 0,
        static: false,
        modifier: initMod,
        hp: maxHP,
        currentMaxHP: maxHP,
        currentHP: currentHP,
        tempHP: 0,
        ac: armorClass,
        currentAC: armorClass,
        level: charLevel,
        path: pcFilePath,  // Link to PC note in vault
        note: pcFilePath,  // Also used for "Link to Note" display
        player: true,
        marker: "default",
        status: [],
        enabled: true,
        active: false,
        hidden: false,
        friendly: true,
        rollHP: false
      };
      
      console.log("Player data to save:", JSON.stringify(playerData, null, 2));

      // Initialize players array if it doesn't exist
      if (!initiativePlugin.data.players) {
        initiativePlugin.data.players = [];
      }

      // Add player to Initiative Tracker
      initiativePlugin.data.players.push(playerData);

      // Get or create party for this campaign
      const campaignName = this.campaign.split('/').pop() || "Unknown Campaign";
      const partyId = await this.getOrCreateCampaignParty(campaignName, initiativePlugin);
      
      // Add player to party
      if (!initiativePlugin.data.parties) {
        initiativePlugin.data.parties = [];
      }
      
      const party = initiativePlugin.data.parties.find((p: any) => p.id === partyId);
      if (party && !party.players.includes(this.pcName)) {
        // Party.players stores player NAMES, not IDs
        party.players.push(this.pcName);
        
        // Clean up any orphaned entries (names that don't exist in players array)
        const validPlayerNames = new Set(initiativePlugin.data.players.map((p: any) => p.name));
        party.players = party.players.filter((name: string) => validPlayerNames.has(name));
      }

      // Save Initiative Tracker settings
      if (initiativePlugin.saveSettings) {
        await initiativePlugin.saveSettings();
        new Notice(`✅ ${this.pcName} registered in Initiative Tracker party!`);
      }
    } catch (error) {
      console.error("Error registering PC in Initiative Tracker:", error);
      new Notice("⚠️ PC created but could not register in Initiative Tracker. Check console for details.");
    }
  }

  /**
   * Get existing party for campaign or create a new one
   */
  async getOrCreateCampaignParty(campaignName: string, initiativePlugin: any): Promise<string> {
    const partyName = `${campaignName} Party`;
    
    // Initialize parties array if needed
    if (!initiativePlugin.data.parties) {
      initiativePlugin.data.parties = [];
    }
    
    // Check if party already exists
    const existingParty = initiativePlugin.data.parties.find((p: any) => p.name === partyName);
    if (existingParty) {
      return existingParty.id;
    }
    
    // Create new party
    const partyId = this.generatePlayerId(); // Reuse the ID generator
    const newParty = {
      name: partyName,
      id: partyId,
      players: []
    };
    
    initiativePlugin.data.parties.push(newParty);
    
    // Set as default party if no default exists
    if (!initiativePlugin.data.defaultParty) {
      initiativePlugin.data.defaultParty = partyId;
    }
    
    return partyId;
  }

  /**
   * Generate unique ID for player/party
   */
  generatePlayerId(): string {
    const chars = '0123456789abcdef';
    let id = 'ID_';
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class NPCCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  npcName = "";
  campaign = "";
  motivation = "";
  pursuit = "";
  physicalDetail = "";
  speechPattern = "";
  activeProblem = "";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "👤 Create New NPC" });

    contentEl.createEl("p", {
      text: "Build your NPC's core engine with these essential questions.",
      cls: "setting-item-description"
    });

    // NPC Name
    new Setting(contentEl)
      .setName("NPC Name")
      .setDesc("What is this character's name?")
      .addText((text) => {
        text
          .setPlaceholder("e.g., Gundren Rockseeker")
          .onChange((value) => {
            this.npcName = value;
          });
        text.inputEl.focus();
      });

    // Campaign Selection
    const campaigns = this.getAllCampaigns();
    new Setting(contentEl)
      .setName("Campaign")
      .setDesc("Which campaign does this NPC belong to?")
      .addDropdown((dropdown) => {
        campaigns.forEach(campaign => {
          dropdown.addOption(campaign.path, campaign.name);
        });
        dropdown.setValue(this.campaign)
          .onChange((value) => {
            this.campaign = value;
          });
      });

    contentEl.createEl("h3", { text: "🎭 Core NPC Engine" });

    // Motivation: What do they want?
    new Setting(contentEl)
      .setName("What do they want?")
      .setDesc("The NPC's primary motivation or goal")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., To reclaim their family's mine from goblin invaders")
          .onChange((value) => {
            this.motivation = value;
          });
        text.inputEl.rows = 3;
      });

    // Pursuit: How do they pursue it?
    new Setting(contentEl)
      .setName("How do they pursue it?")
      .setDesc("Their methods, approach, or behavior in achieving their goal")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., By hiring adventurers and offering generous rewards")
          .onChange((value) => {
            this.pursuit = value;
          });
        text.inputEl.rows = 3;
      });

    contentEl.createEl("h3", { text: "🎨 Character Details" });

    // Physical Detail
    new Setting(contentEl)
      .setName("Physical Detail")
      .setDesc("A memorable physical characteristic or appearance note")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Scarred hands from years of mining, always wears a bronze pendant")
          .onChange((value) => {
            this.physicalDetail = value;
          });
        text.inputEl.rows = 2;
      });

    // Speech Pattern
    new Setting(contentEl)
      .setName("Speech Pattern")
      .setDesc("How do they speak? Any quirks, accents, or mannerisms?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Gruff but warm, often uses mining metaphors")
          .onChange((value) => {
            this.speechPattern = value;
          });
        text.inputEl.rows = 2;
      });

    contentEl.createEl("h3", { text: "⚠️ Current Situation" });

    // Active Problem
    new Setting(contentEl)
      .setName("Active Problem")
      .setDesc("What problem or conflict is this NPC currently facing?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Captured by goblins while traveling to Phandalin")
          .onChange((value) => {
            this.activeProblem = value;
          });
        text.inputEl.rows = 3;
      });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create NPC",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.npcName.trim()) {
        new Notice("Please enter an NPC name!");
        return;
      }

      this.close();
      await this.createNPCFile();
    });
  }

  getAllCampaigns(): Array<{ path: string; name: string }> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const campaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      ttrpgsFolder.children.forEach((child) => {
        if (child instanceof TFolder) {
          campaigns.push({
            path: child.path,
            name: child.name
          });
        }
      });
    }

    return campaigns;
  }

  async createNPCFile() {
    const campaignName = this.campaign.split('/').pop() || "Unknown";
    const npcPath = `${this.campaign}/NPCs`;
    
    new Notice(`Creating NPC "${this.npcName}"...`);

    try {
      await this.plugin.ensureFolderExists(npcPath);

      // Get world info from campaign World.md
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
      let worldName = campaignName;
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*(.+)$/m);
        if (worldMatch && worldMatch[1]) {
          worldName = worldMatch[1].trim();
        }
      }

      // Get NPC template
      const templatePath = "z_Templates/npc.md";
      const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      let npcContent: string;

      if (templateFile instanceof TFile) {
        npcContent = await this.app.vault.read(templateFile);
      } else {
        npcContent = NPC_TEMPLATE;
      }

      // Get current date
      const currentDate = new Date().toISOString().split('T')[0];

      // Replace placeholders in template - both frontmatter and content
      npcContent = npcContent
        .replace(/name: $/m, `name: ${this.npcName}`)
        .replace(/world: $/m, `world: ${worldName}`)
        .replace(/campaign: $/m, `campaign: ${campaignName}`)
        .replace(/date: $/m, `date: ${currentDate}`)
        .replace(/motivation: $/m, `motivation: "${this.motivation}"`)
        .replace(/pursuit: $/m, `pursuit: "${this.pursuit}"`)
        .replace(/physical_detail: $/m, `physical_detail: "${this.physicalDetail}"`)
        .replace(/speech_pattern: $/m, `speech_pattern: "${this.speechPattern}"`)
        .replace(/active_problem: $/m, `active_problem: "${this.activeProblem}"`)
        .replace(/# <% tp\.frontmatter\.name %>/g, `# ${this.npcName}`)
        .replace(/<% tp\.frontmatter\.name %>/g, this.npcName)
        .replace(/<% tp\.frontmatter\.motivation %>/g, this.motivation)
        .replace(/<% tp\.frontmatter\.pursuit %>/g, this.pursuit)
        .replace(/<% tp\.frontmatter\.active_problem %>/g, this.activeProblem)
        .replace(/<% tp\.frontmatter\.physical_detail %>/g, this.physicalDetail)
        .replace(/<% tp\.frontmatter\.speech_pattern %>/g, this.speechPattern);

      const filePath = `${npcPath}/${this.npcName}.md`;
      await this.app.vault.create(filePath, npcContent);

      // Open the file
      await this.app.workspace.openLinkText(filePath, "", true);

      new Notice(`✅ NPC "${this.npcName}" created successfully!`);
    } catch (error) {
      new Notice(`❌ Error creating NPC: ${error instanceof Error ? error.message : String(error)}`);
      console.error("NPC creation error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Session Prep Dashboard - Central hub for GM session preparation (View)
 */
class SessionPrepDashboardView extends ItemView {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  private refreshInterval: number | null = null;
  private activeLeafChangeRef: any = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.settings.currentCampaign;
  }

  getViewType(): string {
    return SESSION_PREP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Session Prep Dashboard";
  }

  getIcon(): string {
    return "clipboard-list";
  }

  setCampaign(campaignPath: string) {
    this.campaignPath = campaignPath;
    this.render();
  }

  async onOpen() {
    // Set minimum width for the leaf pane
    const leafContainer = this.containerEl;
    leafContainer.style.minWidth = "800px";
    
    await this.render();

    // Set up auto-refresh every 30 seconds
    this.refreshInterval = window.setInterval(() => {
      this.render();
    }, 30000);

    // Refresh when this view becomes active
    this.activeLeafChangeRef = this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf?.view === this) {
        this.render();
      }
    });
  }

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("session-prep-dashboard");

    // Header
    const header = container.createEl("div", { cls: "dashboard-header" });
    header.createEl("h2", { text: "📋 Session Prep Dashboard" });
    
    const campaignName = this.campaignPath.split('/').pop() || "Unknown Campaign";
    header.createEl("p", { 
      text: `Campaign: ${campaignName}`,
      cls: "dashboard-campaign-name"
    });

    // Last Session Recap
    await this.renderLastSessionRecap(container);

    // Main content container
    const mainContainer = container.createEl("div", { cls: "dashboard-main" });

    // Left column - Adventures & Scenes
    const leftColumn = mainContainer.createEl("div", { cls: "dashboard-column-left" });
    await this.renderAdventuresAndScenes(leftColumn);

    // Right column - Quick Reference
    const rightColumn = mainContainer.createEl("div", { cls: "dashboard-column-right" });
    await this.renderQuickReference(rightColumn);

    // Bottom - Session Notes
    const bottomSection = container.createEl("div", { cls: "dashboard-bottom" });
    await this.renderSessionNotes(bottomSection);

    // Action buttons
    const actions = container.createEl("div", { cls: "dashboard-actions" });
    
    const createSessionBtn = actions.createEl("button", {
      text: "📝 Create New Session",
      cls: "mod-cta"
    });
    createSessionBtn.addEventListener("click", () => {
      this.plugin.createSession();
    });

    const refreshBtn = actions.createEl("button", { text: "🔄 Refresh" });
    refreshBtn.addEventListener("click", () => this.render());
  }

  async renderAdventuresAndScenes(container: HTMLElement) {
    container.createEl("h3", { text: "🗺️ Active Adventures" });

    // Get all adventures in this campaign
    const adventures = await this.getActiveAdventures();

    if (adventures.length === 0) {
      container.createEl("p", { text: "No active adventures found." });
      return;
    }

    for (const adventure of adventures) {
      const adventureCard = container.createEl("div", { cls: "dashboard-adventure-card" });
      
      // Adventure header
      const adventureHeader = adventureCard.createEl("div", { cls: "adventure-header" });
      const adventureLink = adventureHeader.createEl("a", {
        cls: "adventure-title",
        href: adventure.path
      });
      adventureLink.textContent = `${adventure.name}`;
      adventureLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.app.workspace.openLinkText(adventure.path, "", false);
      });

      const statusBadge = adventureHeader.createEl("span", {
        cls: `status-badge status-${adventure.status}`,
        text: adventure.status
      });

      // Get scenes for this adventure
      const scenes = await this.getScenesForAdventure(adventure.path);
      
      if (scenes.length === 0) {
        adventureCard.createEl("p", { text: "No scenes yet" });
        continue;
      }

      // Find next scene (first not-completed)
      const nextScene = scenes.find(s => s.status !== "completed") || scenes[0];
      const completedCount = scenes.filter(s => s.status === "completed").length;

      // Progress bar
      const progressContainer = adventureCard.createEl("div", { cls: "progress-container" });
      progressContainer.createEl("span", { 
        text: `Progress: ${completedCount}/${scenes.length} scenes completed`
      });
      const progressBar = progressContainer.createEl("div", { cls: "progress-bar" });
      const progressFill = progressBar.createEl("div", { cls: "progress-fill" });
      progressFill.style.width = `${(completedCount / scenes.length) * 100}%`;

      // Next scene card
      if (nextScene) {
        const nextSceneCard = adventureCard.createEl("div", { cls: "next-scene-card" });
        nextSceneCard.createEl("strong", { text: "🎬 Next Up:" });
        
        const sceneLink = nextSceneCard.createEl("a", {
          cls: "scene-link",
          href: nextScene.path
        });
        sceneLink.textContent = `Scene ${nextScene.number}: ${nextScene.name}`;
        sceneLink.addEventListener("click", async (e) => {
          e.preventDefault();
          await this.app.workspace.openLinkText(nextScene.path, "", false);
        });

        // Scene preview
        const scenePreview = nextSceneCard.createEl("div", { cls: "scene-preview" });
        scenePreview.createEl("span", { 
          text: `⏱️ ${nextScene.duration} | ${this.getSceneIcon(nextScene.type)} ${nextScene.type} | 🎲 ${nextScene.difficulty}`
        });

        // Quick scene details if available
        if (nextScene.goal) {
          scenePreview.createEl("p", { 
            text: `Goal: ${nextScene.goal}`,
            cls: "scene-goal"
          });
        }

        // Open scene button
        const openBtn = nextSceneCard.createEl("button", {
          text: "Open Scene",
          cls: "mod-cta"
        });
        openBtn.addEventListener("click", async () => {
          await this.app.workspace.openLinkText(nextScene.path, "", false);
        });
      }

      // Upcoming scenes (collapsed by default)
      if (scenes.length > 1) {
        const upcomingHeader = adventureCard.createEl("div", { cls: "upcoming-header" });
        const toggleBtn = upcomingHeader.createEl("button", {
          text: `▶ Show ${scenes.length - 1} more scenes`,
          cls: "upcoming-toggle"
        });

        const upcomingList = adventureCard.createEl("div", { cls: "upcoming-scenes-list" });
        upcomingList.style.display = "none";

        for (const scene of scenes) {
          if (scene.path === nextScene?.path) continue; // Skip the next scene

          const sceneItem = upcomingList.createEl("div", { cls: "scene-list-item" });
          const statusIcon = scene.status === "completed" ? "✅" : "⬜";
          const sceneItemLink = sceneItem.createEl("a", { href: scene.path });
          sceneItemLink.textContent = `${statusIcon} Scene ${scene.number}: ${scene.name}`;
          sceneItemLink.addEventListener("click", async (e) => {
            e.preventDefault();
            await this.app.workspace.openLinkText(scene.path, "", false);
          });

          sceneItem.createEl("span", {
            text: ` - ${this.getSceneIcon(scene.type)} ${scene.type}`,
            cls: "scene-type"
          });
        }

        let isExpanded = false;
        toggleBtn.addEventListener("click", () => {
          isExpanded = !isExpanded;
          upcomingList.style.display = isExpanded ? "block" : "none";
          toggleBtn.textContent = isExpanded 
            ? `▼ Hide scenes` 
            : `▶ Show ${scenes.length - 1} more scenes`;
        });
      }
    }

    // Party Stats
    await this.renderPartyStats(container);
  }

  async renderQuickReference(container: HTMLElement) {
    container.createEl("h3", { text: "🔖 Quick Reference" });

    // Recent NPCs
    const npcsSection = container.createEl("div", { cls: "quick-ref-section" });
    npcsSection.createEl("h4", { text: "👥 Recent NPCs" });
    await this.renderRecentNPCs(npcsSection);

    // Quick Actions - Organized by category
    const actionsSection = container.createEl("div", { cls: "quick-ref-section" });
    actionsSection.createEl("h4", { text: "⚡ Quick Actions" });
    
    // Session Management
    const sessionGroup = actionsSection.createEl("div", { cls: "quick-action-group" });
    sessionGroup.createEl("h5", { text: "Session Management", cls: "action-group-title" });
    const sessionActions = [
      { text: "📝 Create Session", cmd: "dnd-campaign-hub:create-session" },
      { text: "🎬 Create Scene", cmd: "dnd-campaign-hub:create-scene" },
      { text: "⚔️ Create Encounter", cmd: "dnd-campaign-hub:create-encounter" }
    ];
    this.renderActionButtons(sessionGroup, sessionActions);

    // World Building
    const worldGroup = actionsSection.createEl("div", { cls: "quick-action-group" });
    worldGroup.createEl("h5", { text: "World Building", cls: "action-group-title" });
    const worldActions = [
      { text: "🗺️ Create Adventure", cmd: "dnd-campaign-hub:create-adventure" },
      { text: "🏛️ Create Faction", cmd: "dnd-campaign-hub:create-faction" }
    ];
    this.renderActionButtons(worldGroup, worldActions);

    // Characters
    const characterGroup = actionsSection.createEl("div", { cls: "quick-action-group" });
    characterGroup.createEl("h5", { text: "Characters", cls: "action-group-title" });
    const characterActions = [
      { text: "👤 Create NPC", cmd: "dnd-campaign-hub:create-npc" },
      { text: "🎭 Create PC", cmd: "dnd-campaign-hub:create-pc" },
      { text: "🐉 Create Creature", cmd: "dnd-campaign-hub:create-creature" }
    ];
    this.renderActionButtons(characterGroup, characterActions);

    // Resources
    const resourceGroup = actionsSection.createEl("div", { cls: "quick-action-group" });
    resourceGroup.createEl("h5", { text: "Resources", cls: "action-group-title" });
    const resourceActions = [
      { text: "⚔️ Create Item", cmd: "dnd-campaign-hub:create-item" },
      { text: "✨ Create Spell", cmd: "dnd-campaign-hub:create-spell" },
      { text: "🪤 Create Trap", cmd: "dnd-campaign-hub:create-trap" }
    ];
    this.renderActionButtons(resourceGroup, resourceActions);
  }

  renderActionButtons(container: HTMLElement, actions: Array<{text: string, cmd: string}>) {
    for (const action of actions) {
      const btn = container.createEl("button", {
        text: action.text,
        cls: "quick-action-btn"
      });
      btn.addEventListener("click", () => {
        (this.app as any).commands?.executeCommandById(action.cmd);
      });
    }
  }

  async renderRecentNPCs(container: HTMLElement) {
    // Get NPCs from the campaign
    const npcsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/NPCs`);
    
    if (!(npcsFolder instanceof TFolder)) {
      container.createEl("p", { text: "No NPCs found" });
      return;
    }

    const npcFiles: TFile[] = [];
    for (const item of npcsFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        npcFiles.push(item);
      }
    }

    // Sort by modification time (most recent first)
    npcFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

    // Show top 5
    const recentNPCs = npcFiles.slice(0, 5);

    if (recentNPCs.length === 0) {
      container.createEl("p", { text: "No NPCs yet" });
      return;
    }

    const npcList = container.createEl("div", { cls: "npc-list" });
    for (const npc of recentNPCs) {
      const npcItem = npcList.createEl("div", { cls: "npc-item" });
      const npcLink = npcItem.createEl("a", { href: npc.path });
      npcLink.textContent = `👤 ${npc.basename}`;
      npcLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.app.workspace.openLinkText(npc.path, "", false);
      });
    }
  }

  async renderPartyStats(container: HTMLElement) {
    const partySection = container.createEl("div", { cls: "quick-ref-section" });
    partySection.createEl("h4", { text: "🎭 Party Overview" });

    // Get PCs from the campaign
    const pcsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/PCs`);
    
    if (!(pcsFolder instanceof TFolder)) {
      partySection.createEl("p", { text: "No PCs found", cls: "empty-message" });
      return;
    }

    const pcFiles: TFile[] = [];
    for (const item of pcsFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        pcFiles.push(item);
      }
    }

    if (pcFiles.length === 0) {
      partySection.createEl("p", { text: "No PCs yet", cls: "empty-message" });
      return;
    }

    // Collect PC stats
    const party: Array<{
      name: string;
      player: string;
      class: string;
      level: number;
      hp: number;
      hpMax: number;
      ac: number;
      passivePerception: number;
      path: string;
    }> = [];

    for (const pcFile of pcFiles) {
      const cache = this.app.metadataCache.getFileCache(pcFile);
      const fm = cache?.frontmatter;
      
      if (fm && fm.type === "player") {
        party.push({
          name: fm.name || pcFile.basename,
          player: fm.player || "Unknown",
          class: fm.class || "?",
          level: parseInt(fm.level) || 1,
          hp: parseInt(fm.hp) || 0,
          hpMax: parseInt(fm.hp_max) || 0,
          ac: parseInt(fm.ac) || 10,
          passivePerception: parseInt(fm.passive_perception) || 10,
          path: pcFile.path
        });
      }
    }

    if (party.length === 0) {
      partySection.createEl("p", { text: "No active PCs", cls: "empty-message" });
      return;
    }

    // Sort by name
    party.sort((a, b) => a.name.localeCompare(b.name));

    // Party summary stats
    const avgLevel = Math.round(party.reduce((sum, pc) => sum + pc.level, 0) / party.length);
    const avgAC = Math.round(party.reduce((sum, pc) => sum + pc.ac, 0) / party.length);
    const avgHP = Math.round(party.reduce((sum, pc) => sum + pc.hpMax, 0) / party.length);
    const minPP = Math.min(...party.map(pc => pc.passivePerception));
    const maxPP = Math.max(...party.map(pc => pc.passivePerception));

    const summary = partySection.createEl("div", { cls: "party-summary" });
    summary.createEl("div", { text: `👥 ${party.length} PCs • Avg Lvl ${avgLevel}` });
    summary.createEl("div", { text: `🛡️ Avg AC ${avgAC} • ❤️ Avg HP ${avgHP}` });
    summary.createEl("div", { text: `👁️ PP ${minPP}-${maxPP}` });

    // Individual PC list
    const partyList = partySection.createEl("div", { cls: "party-list" });
    
    for (const pc of party) {
      const pcCard = partyList.createEl("div", { cls: "party-member" });
      
      // PC name and link
      const pcHeader = pcCard.createEl("div", { cls: "party-member-header" });
      const pcLink = pcHeader.createEl("a", { 
        href: pc.path,
        cls: "party-member-name"
      });
      pcLink.textContent = pc.name;
      pcLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.app.workspace.openLinkText(pc.path, "", false);
      });

      // HP bar with status color
      const hpPercent = pc.hpMax > 0 ? (pc.hp / pc.hpMax) * 100 : 0;
      let hpStatus = "healthy";
      if (hpPercent < 25) hpStatus = "critical";
      else if (hpPercent < 50) hpStatus = "wounded";

      const hpBar = pcCard.createEl("div", { cls: "party-hp-bar" });
      const hpFill = hpBar.createEl("div", { 
        cls: `party-hp-fill hp-${hpStatus}`
      });
      hpFill.style.width = `${hpPercent}%`;
      
      const hpText = pcCard.createEl("div", { 
        cls: "party-member-stats",
        text: `❤️ ${pc.hp}/${pc.hpMax} • 🛡️ AC ${pc.ac} • 👁️ PP ${pc.passivePerception}`
      });

      // Class and level
      pcCard.createEl("div", { 
        cls: "party-member-class",
        text: `Lvl ${pc.level} ${pc.class}`
      });
    }
  }

  async renderSessionNotes(container: HTMLElement) {
    container.createEl("h3", { text: "📓 Session Notes" });

    // Get recent sessions
    const sessionsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Sessions`);
    const sessionFiles: TFile[] = [];

    if (sessionsFolder instanceof TFolder) {
      // Sessions in subfolder
      for (const item of sessionsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          sessionFiles.push(item);
        }
      }
    } else {
      // Sessions at campaign root
      const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
      if (campaignFolder instanceof TFolder) {
        for (const item of campaignFolder.children) {
          if (item instanceof TFile && item.extension === "md") {
            const cache = this.app.metadataCache.getFileCache(item);
            if (cache?.frontmatter?.type === "session") {
              sessionFiles.push(item);
            }
          }
        }
      }
    }

    // Sort by session number (descending)
    sessionFiles.sort((a, b) => {
      const cacheA = this.app.metadataCache.getFileCache(a);
      const cacheB = this.app.metadataCache.getFileCache(b);
      
      const aNum = cacheA?.frontmatter?.sessionNum || this.extractSessionNumber(a.basename);
      const bNum = cacheB?.frontmatter?.sessionNum || this.extractSessionNumber(b.basename);
      
      return bNum - aNum;
    });

    const lastSession = sessionFiles[0];
    if (!lastSession) {
      container.createEl("p", { text: "No sessions yet" });
      return;
    }

    // Show last session summary
    const sessionCard = container.createEl("div", { cls: "session-card" });
    const sessionLink = sessionCard.createEl("a", { href: lastSession.path });
    sessionLink.textContent = `Last Session: ${lastSession.basename}`;
    sessionLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.app.workspace.openLinkText(lastSession.path, "", false);
    });

    // Try to extract summary from last session
    try {
      const content = await this.app.vault.read(lastSession);
      const summaryMatch = content.match(/##\s*Summary\s*\n\n([\s\S]*?)(?=\n##|$)/);
      if (summaryMatch && summaryMatch[1]) {
        const summary = summaryMatch[1].trim().substring(0, 200);
        sessionCard.createEl("p", {
          text: summary + (summaryMatch[1].length > 200 ? "..." : ""),
          cls: "session-summary"
        });
      }
    } catch (error) {
      console.error("Error reading session file:", error);
    }
  }

  async getActiveAdventures(): Promise<Array<{
    path: string;
    name: string;
    status: string;
  }>> {
    const adventures: Array<{ path: string; name: string; status: string }> = [];
    const adventuresFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Adventures`);

    if (!(adventuresFolder instanceof TFolder)) {
      return adventures;
    }

    for (const item of adventuresFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        const cache = this.app.metadataCache.getFileCache(item);
        const status = cache?.frontmatter?.status || "planning";
        
        // Only show active adventures (not completed or on-hold)
        if (status === "active" || status === "in-progress" || status === "planning") {
          adventures.push({
            path: item.path,
            name: item.basename,
            status: status
          });
        }
      } else if (item instanceof TFolder) {
        // Check for adventure in folder structure
        const adventureFile = this.app.vault.getAbstractFileByPath(`${item.path}/${item.name}.md`);
        if (adventureFile instanceof TFile) {
          const cache = this.app.metadataCache.getFileCache(adventureFile);
          const status = cache?.frontmatter?.status || "planning";
          
          if (status === "active" || status === "in-progress" || status === "planning") {
            adventures.push({
              path: adventureFile.path,
              name: item.name,
              status: status
            });
          }
        }
      }
    }

    return adventures;
  }

  async getScenesForAdventure(adventurePath: string): Promise<Array<{
    path: string;
    number: number;
    name: string;
    type: string;
    duration: string;
    difficulty: string;
    status: string;
    goal: string;
  }>> {
    const scenes: Array<any> = [];
    const adventureFile = this.app.vault.getAbstractFileByPath(adventurePath);

    if (!(adventureFile instanceof TFile)) return scenes;

    const adventureFolder = adventureFile.parent;
    if (!adventureFolder) return scenes;

    // Check for flat structure
    const flatScenesFolder = this.app.vault.getAbstractFileByPath(
      `${adventureFolder.path}/${adventureFile.basename} - Scenes`
    );

    // Check for folder structure
    const folderScenesPath = `${adventureFolder.path}/${adventureFile.basename}`;
    const folderStructure = this.app.vault.getAbstractFileByPath(folderScenesPath);

    let sceneFolders: TFolder[] = [];

    if (flatScenesFolder instanceof TFolder) {
      sceneFolders.push(flatScenesFolder);
    } else if (folderStructure instanceof TFolder) {
      for (const child of folderStructure.children) {
        if (child instanceof TFolder && child.name.startsWith("Act ")) {
          sceneFolders.push(child);
        }
      }
      if (sceneFolders.length === 0) {
        sceneFolders.push(folderStructure);
      }
    } else {
      // Check if the adventure folder itself contains Act folders
      // (case where adventure file is inside a folder with the same name)
      for (const child of adventureFolder.children) {
        if (child instanceof TFolder && child.name.startsWith("Act ")) {
          sceneFolders.push(child);
        }
      }
      // If no Act folders, check the adventure folder itself for scenes
      if (sceneFolders.length === 0) {
        for (const child of adventureFolder.children) {
          if (child instanceof TFile && child.extension === "md" && 
              child.path !== adventurePath && 
              child.basename.match(/^Scene\s+\d+/)) {
            sceneFolders.push(adventureFolder);
            break;
          }
        }
      }
    }

    // Scan all scene folders
    for (const folder of sceneFolders) {
      for (const item of folder.children) {
        if (item instanceof TFile && item.extension === "md") {
          const match = item.basename.match(/^Scene\s+(\d+)\s+-\s+(.+)$/);
          if (match && match[1] && match[2]) {
            const cache = this.app.metadataCache.getFileCache(item);
            const frontmatter = cache?.frontmatter;

            scenes.push({
              path: item.path,
              number: parseInt(match[1]),
              name: match[2],
              type: frontmatter?.scene_type || "exploration",
              duration: frontmatter?.duration || "?",
              difficulty: frontmatter?.difficulty || "medium",
              status: frontmatter?.status || "not-started",
              goal: ""  // We'll extract this if needed
            });
          }
        }
      }
    }

    // Sort by scene number
    scenes.sort((a, b) => a.number - b.number);
    return scenes;
  }

  getSceneIcon(type: string): string {
    const icons: Record<string, string> = {
      social: "🗣️",
      combat: "⚔️",
      exploration: "🔍",
      puzzle: "🧩",
      montage: "🎬"
    };
    return icons[type] || "📝";
  }

  async renderLastSessionRecap(container: HTMLElement) {
    const recapSection = container.createEl("div", { cls: "last-session-recap" });
    recapSection.createEl("h3", { text: "📖 Last Session Recap" });

    // Get recent sessions
    const sessionsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Sessions`);
    const sessionFiles: TFile[] = [];

    if (sessionsFolder instanceof TFolder) {
      for (const item of sessionsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          sessionFiles.push(item);
        }
      }
    } else {
      const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
      if (campaignFolder instanceof TFolder) {
        for (const item of campaignFolder.children) {
          if (item instanceof TFile && item.extension === "md") {
            const cache = this.app.metadataCache.getFileCache(item);
            if (cache?.frontmatter?.type === "session") {
              sessionFiles.push(item);
            }
          }
        }
      }
    }

    if (sessionFiles.length === 0) {
      recapSection.createEl("p", { 
        text: "No previous sessions yet. Start your first session!",
        cls: "empty-message"
      });
      return;
    }

    // Sort by session number (descending)
    sessionFiles.sort((a, b) => {
      const cacheA = this.app.metadataCache.getFileCache(a);
      const cacheB = this.app.metadataCache.getFileCache(b);
      
      const aNum = cacheA?.frontmatter?.sessionNum || this.extractSessionNumber(a.basename);
      const bNum = cacheB?.frontmatter?.sessionNum || this.extractSessionNumber(b.basename);
      
      return bNum - aNum;
    });

    const lastSession = sessionFiles[0];
    if (!lastSession) {
      recapSection.createEl("p", { 
        text: "No previous sessions yet. Start your first session!",
        cls: "empty-message"
      });
      return;
    }

    const cache = this.app.metadataCache.getFileCache(lastSession);

    // Create recap card
    const recapCard = recapSection.createEl("div", { cls: "recap-card" });

    // Session title and info
    const recapHeader = recapCard.createEl("div", { cls: "recap-header" });
    const sessionLink = recapHeader.createEl("a", { 
      href: lastSession.path,
      cls: "recap-session-link"
    });
    sessionLink.textContent = lastSession.basename;
    sessionLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.app.workspace.openLinkText(lastSession.path, "", false);
    });

    // Session date
    if (cache?.frontmatter?.date || cache?.frontmatter?.gameDate) {
      const dateInfo = recapHeader.createEl("span", { cls: "recap-date" });
      const date = cache.frontmatter.date || cache.frontmatter.gameDate;
      dateInfo.textContent = ` • ${date}`;
    }

    // Read session content for highlights
    try {
      const content = await this.app.vault.read(lastSession);
      const recapContent = recapCard.createEl("div", { cls: "recap-content" });

      // Look for highlights section
      let highlightsMatch = content.match(/##\s*(?:Highlights?|Key Events?)\s*\n([\s\S]*?)(?=\n##|$)/i);
      if (highlightsMatch && highlightsMatch[1]) {
        const highlightsList = recapContent.createEl("div", { cls: "recap-highlights" });
        highlightsList.createEl("strong", { text: "Key Events:" });
        
        const highlightsText = highlightsMatch[1];
        // Extract bullet points
        const bullets = highlightsText.match(/^[-*]\s+(.+)$/gm);
        if (bullets && bullets.length > 0) {
          const ul = highlightsList.createEl("ul");
          bullets.slice(0, 5).forEach(bullet => {
            const text = bullet.replace(/^[-*]\s+/, '').trim();
            ul.createEl("li", { text });
          });
        } else {
          // Use first paragraph if no bullets
          const firstPara = highlightsText.trim().split('\n')[0];
          recapContent.createEl("p", { text: firstPara, cls: "recap-summary" });
        }
      } else {
        // Try summary section
        const summaryMatch = content.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i);
        if (summaryMatch && summaryMatch[1]) {
          const summaryText = summaryMatch[1]!.trim();
          const bullets = summaryText.match(/^[-*]\s+(.+)$/gm);
          
          if (bullets && bullets.length > 0) {
            const highlightsList = recapContent.createEl("div", { cls: "recap-highlights" });
            highlightsList.createEl("strong", { text: "Summary:" });
            const ul = highlightsList.createEl("ul");
            bullets.slice(0, 5).forEach(bullet => {
              const text = bullet.replace(/^[-*]\s+/, '').trim();
              ul.createEl("li", { text });
            });
          } else {
            const firstPara = (summaryText.split('\n')[0] || '').substring(0, 300);
            recapContent.createEl("p", { 
              text: firstPara + (summaryText.length > 300 ? "..." : ""),
              cls: "recap-summary"
            });
          }
        }
      }

      // Look for cliffhanger
      const cliffhangerMatch = content.match(/##\s*(?:Cliffhanger|Next Time|Where We Left Off)\s*\n([\s\S]*?)(?=\n##|$)/i);
      if (cliffhangerMatch && cliffhangerMatch[1]) {
        const cliffhangerText = cliffhangerMatch[1]!.trim();
        const firstLine = (cliffhangerText.split('\n')[0] || '').replace(/^[-*]\s+/, '');
        if (firstLine) {
          const cliffhangerDiv = recapCard.createEl("div", { cls: "recap-cliffhanger" });
          cliffhangerDiv.createEl("strong", { text: "🎬 Cliffhanger: " });
          cliffhangerDiv.createEl("span", { text: firstLine });
        }
      }

    } catch (error) {
      console.error("Error reading session file:", error);
      recapCard.createEl("p", { 
        text: "Unable to load session details",
        cls: "empty-message"
      });
    }
  }

  extractSessionNumber(filename: string): number {
    // Try "Session X" format
    let match = filename.match(/Session\s+(\d+)/i);
    if (match && match[1]) return parseInt(match[1]);
    
    // Try "001_20250521" format
    match = filename.match(/^(\d{3})_\d{8}$/);
    if (match && match[1]) return parseInt(match[1]);
    
    return 0;
  }

  async onClose() {
    // Clear auto-refresh interval
    if (this.refreshInterval !== null) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Unregister workspace event listener
    if (this.activeLeafChangeRef) {
      this.app.workspace.offref(this.activeLeafChangeRef);
      this.activeLeafChangeRef = null;
    }
  }
}

/**
 * Timer Name Modal - Prompt for timer name
 */
class TimerNameModal extends Modal {
  resolve: (value: string | null) => void;
  defaultName: string;

  constructor(app: App, defaultName: string, resolve: (value: string | null) => void) {
    super(app);
    this.defaultName = defaultName;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Add Timer" });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Enter timer name...",
    });
    input.value = this.defaultName;

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.resolve(null);
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Add",
      cls: "mod-cta",
    });
    createButton.addEventListener("click", () => {
      const name = input.value.trim();
      if (name) {
        this.close();
        this.resolve(name);
      }
    });

    input.focus();
    input.select();
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        createButton.click();
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Session Run Dashboard - Active session management for GMs
 */
class SessionRunDashboardView extends ItemView {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  currentSessionFile: TFile | null = null;
  readOnlyMode: boolean = true;
  timers: Array<{id: string; name: string; startTime: number; paused: boolean; pausedAt: number; elapsed: number}> = [];
  diceHistory: Array<{roll: string; result: number; timestamp: number}> = [];
  quickNotesContent: string = "";
  autoSaveInterval: number | null = null;
  timerUpdateInterval: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.settings.currentCampaign;
  }

  getViewType(): string {
    return SESSION_RUN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Session Running";
  }

  getIcon(): string {
    return "play-circle";
  }

  setCampaign(campaignPath: string) {
    this.campaignPath = campaignPath;
    this.render();
  }

  async onOpen() {
    // Find current session file
    await this.detectCurrentSession();
    
    await this.render();
    
    // Enable read-only mode after a short delay to ensure workspace is ready
    setTimeout(() => {
      if (this.readOnlyMode) {
        this.enableReadOnlyMode();
      }
    }, 300);

    // Start auto-save for quick notes
    this.startAutoSave();
  }

  async detectCurrentSession() {
    // First try Sessions subfolder
    const sessionsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Sessions`);
    const sessionFiles: TFile[] = [];

    if (sessionsFolder instanceof TFolder) {
      // Sessions are in a subfolder
      for (const item of sessionsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          sessionFiles.push(item);
        }
      }
    } else {
      // Sessions are at campaign root level (same level as world.md)
      const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
      if (campaignFolder instanceof TFolder) {
        for (const item of campaignFolder.children) {
          if (item instanceof TFile && item.extension === "md") {
            // Check frontmatter for type: session
            const cache = this.app.metadataCache.getFileCache(item);
            if (cache?.frontmatter?.type === "session") {
              sessionFiles.push(item);
            } else if (item.basename.match(/^Session\s+\d+/i) || 
                       item.basename.match(/^\d{3}_\d{8}$/)) {
              // Fallback to filename patterns: "Session X" or "001_20250521"
              sessionFiles.push(item);
            }
          }
        }
      }
    }

    // Get the most recent session
    sessionFiles.sort((a, b) => {
      // Try to get session number from frontmatter first
      const cacheA = this.app.metadataCache.getFileCache(a);
      const cacheB = this.app.metadataCache.getFileCache(b);
      
      const aNum = cacheA?.frontmatter?.sessionNum || this.extractSessionNumber(a.basename);
      const bNum = cacheB?.frontmatter?.sessionNum || this.extractSessionNumber(b.basename);
      
      return bNum - aNum;
    });

    this.currentSessionFile = sessionFiles[0] || null;
  }

  extractSessionNumber(filename: string): number {
    // Try "Session X" format
    let match = filename.match(/Session\s+(\d+)/i);
    if (match && match[1]) return parseInt(match[1]);
    
    // Try "001_20250521" format
    match = filename.match(/^(\d{3})_\d{8}$/);
    if (match && match[1]) return parseInt(match[1]);
    
    return 0;
  }

  enableReadOnlyMode() {
    this.readOnlyMode = true;
    // Set all markdown views to read mode
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (view.getMode && view.getMode() === "source") {
          const state = view.getState();
          view.setState({ ...state, mode: "preview" }, {});
        }
      }
    });
  }

  disableReadOnlyMode() {
    this.readOnlyMode = false;
    // User can manually switch views back to edit mode
  }

  startAutoSave() {
    if (this.autoSaveInterval) return;
    
    // Auto-save every 30 seconds
    this.autoSaveInterval = window.setInterval(() => {
      this.saveQuickNotes();
    }, 30000);
  }

  async saveQuickNotes() {
    if (!this.currentSessionFile || !this.quickNotesContent.trim()) return;

    try {
      const content = await this.app.vault.read(this.currentSessionFile);
      
      // Check if Quick Notes section exists
      const quickNotesMarker = "## Quick Notes (During Session)";
      
      if (content.includes(quickNotesMarker)) {
        // Update existing section
        const regex = /## Quick Notes \(During Session\)\s*\n([\s\S]*?)(?=\n##|$)/;
        const newContent = content.replace(
          regex,
          `## Quick Notes (During Session)\n\n${this.quickNotesContent}\n`
        );
        await this.app.vault.modify(this.currentSessionFile, newContent);
      } else {
        // Add new section at the end
        const newContent = content + `\n\n${quickNotesMarker}\n\n${this.quickNotesContent}\n`;
        await this.app.vault.modify(this.currentSessionFile, newContent);
      }
    } catch (error) {
      console.error("Error saving quick notes:", error);
    }
  }

  addTimer(name: string) {
    const timer = {
      id: `timer-${Date.now()}`,
      name: name,
      startTime: Date.now(),
      paused: false,
      pausedAt: 0,
      elapsed: 0
    };
    this.timers.push(timer);
    this.render();
  }

  removeTimer(id: string) {
    this.timers = this.timers.filter(t => t.id !== id);
    this.render();
  }

  toggleTimer(id: string) {
    const timer = this.timers.find(t => t.id === id);
    if (!timer) return;

    if (timer.paused) {
      // Resume
      timer.startTime = Date.now() - timer.elapsed;
      timer.paused = false;
    } else {
      // Pause
      timer.elapsed = Date.now() - timer.startTime;
      timer.pausedAt = Date.now();
      timer.paused = true;
    }
    this.render();
  }

  getTimerDisplay(timer: {startTime: number; paused: boolean; elapsed: number}): string {
    const totalMs = timer.paused ? timer.elapsed : Date.now() - timer.startTime;
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  rollDice(diceType: string) {
    // Built-in dice roller
    const sides = parseInt(diceType.substring(1)); // Remove 'd' prefix (e.g., "d20" -> 20)
    const result = Math.floor(Math.random() * sides) + 1;
    
    this.diceHistory.unshift({
      roll: diceType,
      result: result,
      timestamp: Date.now()
    });

    // Keep only last 20 rolls
    if (this.diceHistory.length > 20) {
      this.diceHistory = this.diceHistory.slice(0, 20);
    }

    this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    if (!container) return;
    
    container.empty();
    container.addClass("session-run-dashboard");
    container.addClass("session-run-compact");

    // Header with session info
    const header = container.createEl("div", { cls: "run-dashboard-header-compact" });
    const sessionName = this.currentSessionFile?.basename || "No Active Session";
    header.createEl("h3", { text: `🎮 Session Control` });
    header.createEl("p", { 
      text: sessionName,
      cls: "session-name-compact"
    });

    // Read-only mode toggle
    const modeToggle = header.createEl("div", { cls: "mode-toggle-compact" });
    const toggleBtn = modeToggle.createEl("button", {
      text: this.readOnlyMode ? "🔒 Read-Only" : "🔓 Editable",
      cls: this.readOnlyMode ? "mod-warning" : ""
    });
    toggleBtn.addEventListener("click", () => {
      if (this.readOnlyMode) {
        this.disableReadOnlyMode();
      } else {
        this.enableReadOnlyMode();
      }
      this.render();
    });

    // Compact single-column layout for control panel
    const controlPanel = container.createEl("div", { cls: "run-dashboard-controls" });

    // Timers section
    await this.renderTimers(controlPanel);
    
    // Dice roller section
    this.renderDiceRoller(controlPanel);
    
    // Quick notes section
    await this.renderQuickNotes(controlPanel);
    
    // SRD Quick Search section
    await this.renderSRDQuickSearch(controlPanel);
    
    // Quick actions section
    await this.renderQuickActions(controlPanel);

    // Setup Layout button
    const layoutSection = container.createEl("div", { cls: "dashboard-section" });
    const setupBtn = layoutSection.createEl("button", {
      text: "📐 Setup Session Layout",
      cls: "mod-cta"
    });
    setupBtn.style.width = "100%";
    setupBtn.addEventListener("click", () => {
      console.log("🔘 Setup Session Layout button clicked");
      this.setupSessionLayout();
    });

    // Update timers display every second
    if (this.timerUpdateInterval) {
      window.clearInterval(this.timerUpdateInterval);
    }
    
    this.timerUpdateInterval = window.setInterval(() => {
      const timerDisplays = container.querySelectorAll('.timer-display');
      timerDisplays.forEach((display, index) => {
        if (this.timers[index]) {
          display.textContent = this.getTimerDisplay(this.timers[index]);
        }
      });
    }, 1000);
  }

  async setupSessionLayout() {
    console.log("🎯 setupSessionLayout called");
    
    // Get or create main workspace leaf
    let mainLeaf = this.app.workspace.getLeaf(false);
    
    if (!mainLeaf) {
      console.error("❌ No workspace leaf available");
      new Notice("Could not set up layout - no workspace available");
      return;
    }

    console.log("✅ Got main leaf");

    // Get active adventure and scene
    const adventures = await this.getActiveAdventures();
    console.log(`📚 Found ${adventures.length} adventures`);
    const adventure = adventures.length > 0 ? adventures[0] : null;
    
    if (adventure) {
      console.log(`📖 Adventure found: ${adventure.name}`);
      const scenes = await this.getScenesForAdventure(adventure.path);
      console.log(`🎬 Found ${scenes.length} scenes`);
      const currentScene = scenes.find(s => s.status === "in-progress") || 
                          scenes.find(s => s.status === "not-started");
      
      if (currentScene) {
        console.log(`🎬 Opening scene: ${currentScene.name}`);
        // Open scene in main pane (largest view)
        const sceneFile = this.app.vault.getAbstractFileByPath(currentScene.path);
        if (sceneFile instanceof TFile) {
          await mainLeaf.openFile(sceneFile);
          // Collapse properties for scene
          await this.collapseProperties(mainLeaf);
        }
        
        // Split right for adventure
        const adventureLeaf = this.app.workspace.getLeaf('split', 'vertical');
        const adventureFile = this.app.vault.getAbstractFileByPath(adventure.path);
        if (adventureFile instanceof TFile) {
          await adventureLeaf.openFile(adventureFile);
          // Collapse properties for adventure
          await this.collapseProperties(adventureLeaf);
        }
        
        // Split bottom of adventure pane for session notes
        if (this.currentSessionFile) {
          const sessionLeaf = this.app.workspace.getLeaf('split', 'horizontal');
          await sessionLeaf.openFile(this.currentSessionFile);
          // Collapse properties for session
          await this.collapseProperties(sessionLeaf);
        }
      } else {
        // No scene available, open adventure in main
        const adventureFile = this.app.vault.getAbstractFileByPath(adventure.path);
        if (adventureFile instanceof TFile) {
          await mainLeaf.openFile(adventureFile);
          await this.collapseProperties(mainLeaf);
        }
        
        // Open session in split if available
        if (this.currentSessionFile) {
          const sessionLeaf = this.app.workspace.getLeaf('split', 'vertical');
          await sessionLeaf.openFile(this.currentSessionFile);
          await this.collapseProperties(sessionLeaf);
        }
      }
    } else if (this.currentSessionFile) {
      // No adventure, just open session
      await mainLeaf.openFile(this.currentSessionFile);
      await this.collapseProperties(mainLeaf);
    }

    // Try to open Initiative Tracker if available
    const initiativePlugin = (this.app as any).plugins?.getPlugin("initiative-tracker");
    if (initiativePlugin) {
      // Give a moment for the layout to settle, then open tracker
      setTimeout(() => {
        (this.app as any).commands?.executeCommandById("initiative-tracker:open-tracker");
      }, 500);
    }

    // Enable read-only mode for the opened files
    setTimeout(() => {
      if (this.readOnlyMode) {
        this.enableReadOnlyMode();
      }
    }, 800);

    new Notice("Session layout configured!");
  }

  /**
   * Collapse the properties (frontmatter) panel in a leaf
   */
  async collapseProperties(leaf: WorkspaceLeaf) {
    // Wait for the file to fully load and metadata editor to be ready
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const view = leaf.view;
    if (view.getViewType() === "markdown") {
      try {
        // Access the metadata editor (properties panel) directly
        const metadataEditor = (view as any).metadataEditor;
        
        if (metadataEditor) {
          // Method 1: Try to collapse via the toggle method
          if (typeof metadataEditor.toggle === 'function') {
            // Close it if it's open
            if (!metadataEditor.collapsed) {
              metadataEditor.toggle();
            }
          }
          
          // Method 2: Set collapsed state directly
          if ('collapsed' in metadataEditor) {
            metadataEditor.collapsed = true;
          }
          
          // Method 3: Hide the container element
          if (metadataEditor.containerEl) {
            metadataEditor.containerEl.style.display = 'none';
          }
        }
        
        // Also try setting ephemeral state as fallback
        leaf.setEphemeralState({ showProperties: false });
      } catch (error) {
        console.error("Error collapsing properties:", error);
      }
    }
  }

  async renderTimers(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "⏱️ Timers" });

    if (this.timers.length === 0) {
      section.createEl("p", { text: "No active timers", cls: "empty-message" });
    }

    for (const timer of this.timers) {
      const timerCard = section.createEl("div", { cls: "timer-card" });
      
      const timerHeader = timerCard.createEl("div", { cls: "timer-header" });
      timerHeader.createEl("strong", { text: timer.name });
      
      const timerDisplay = timerCard.createEl("div", { 
        cls: "timer-display",
        text: this.getTimerDisplay(timer)
      });

      const timerControls = timerCard.createEl("div", { cls: "timer-controls" });
      
      const pauseBtn = timerControls.createEl("button", {
        text: timer.paused ? "▶️ Resume" : "⏸️ Pause"
      });
      pauseBtn.addEventListener("click", () => this.toggleTimer(timer.id));

      const removeBtn = timerControls.createEl("button", {
        text: "🗑️ Remove",
        cls: "mod-warning"
      });
      removeBtn.addEventListener("click", () => this.removeTimer(timer.id));
    }

    // Add timer button
    const addTimerBtn = section.createEl("button", {
      text: "+ Add Timer",
      cls: "mod-cta"
    });
    addTimerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Add timer button clicked");
      
      // Use modal instead of prompt (prompt() not supported in Electron)
      new Promise<string | null>((resolve) => {
        new TimerNameModal(this.app, "Session Timer", resolve).open();
      }).then((name) => {
        console.log("Timer name entered:", name);
        if (name) {
          this.addTimer(name);
        }
      });
    });
  }

  renderDiceRoller(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "🎲 Dice Roller" });

    const diceButtons = section.createEl("div", { cls: "dice-buttons" });
    const commonDice = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
    
    for (const dice of commonDice) {
      const btn = diceButtons.createEl("button", {
        text: dice,
        cls: "dice-button"
      });
      btn.addEventListener("click", () => this.rollDice(dice));
    }

    // Dice history
    if (this.diceHistory.length > 0) {
      const historyHeader = section.createEl("div", { cls: "dice-history-header" });
      historyHeader.createEl("h4", { text: "History" });
      const clearBtn = historyHeader.createEl("button", {
        text: "🗑️ Clear",
        cls: "dice-clear-button"
      });
      clearBtn.addEventListener("click", () => {
        this.diceHistory = [];
        this.render();
      });
      
      const history = section.createEl("div", { cls: "dice-history" });
      
      for (const roll of this.diceHistory.slice(0, 10)) {
        const rollItem = history.createEl("div", { cls: "dice-history-item" });
        rollItem.createEl("span", { 
          text: `${roll.roll}: `,
          cls: "dice-type"
        });
        rollItem.createEl("span", { 
          text: roll.result.toString(),
          cls: "dice-result"
        });
      }
    }
  }

  async renderQuickNotes(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "📝 Quick Notes" });
    
    const textarea = section.createEl("textarea", {
      cls: "quick-notes-textarea",
      placeholder: "Jot down quick notes... (Auto-saves every 30s)"
    });
    textarea.value = this.quickNotesContent;
    textarea.addEventListener("input", (e) => {
      this.quickNotesContent = (e.target as HTMLTextAreaElement).value;
    });

    const saveBtn = section.createEl("button", {
      text: "💾 Save Now",
      cls: "mod-cta"
    });
    saveBtn.addEventListener("click", () => {
      this.saveQuickNotes();
      new Notice("Quick notes saved to session!");
    });
  }

  async renderSRDQuickSearch(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "🔍 SRD Quick Search" });
    
    // Search input
    const searchContainer = section.createEl("div", { cls: "srd-search-container" });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search spells, equipment, classes...",
      cls: "srd-search-input"
    });

    // Results container
    const resultsContainer = section.createEl("div", { cls: "srd-search-results" });
    resultsContainer.style.display = "none";

    let searchTimeout: number | null = null;

    searchInput.addEventListener("input", async (e) => {
      const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
      
      // Clear previous timeout
      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }

      if (query.length < 2) {
        resultsContainer.style.display = "none";
        resultsContainer.empty();
        return;
      }

      // Debounce search
      searchTimeout = window.setTimeout(async () => {
        resultsContainer.empty();
        resultsContainer.style.display = "block";
        
        const loading = resultsContainer.createEl("div", {
          text: "Searching...",
          cls: "srd-search-loading"
        });

        try {
          const results = await this.searchSRDData(query);
          
          loading.remove();

          if (results.length === 0) {
            resultsContainer.createEl("div", {
              text: "No results found",
              cls: "srd-search-empty"
            });
            return;
          }

          // Show max 10 results
          const displayResults = results.slice(0, 10);
          
          for (const result of displayResults) {
            const resultCard = resultsContainer.createEl("div", { cls: "srd-search-result-card" });
            
            // Type badge
            const header = resultCard.createEl("div", { cls: "srd-result-header" });
            header.createEl("span", {
              text: result.type,
              cls: "srd-result-type"
            });
            
            // Name (as link)
            const nameLink = header.createEl("a", {
              text: result.name,
              cls: "srd-result-name"
            });
            nameLink.addEventListener("click", async (e) => {
              e.preventDefault();
              await this.app.workspace.openLinkText(result.path, "", true);
            });

            // Preview content
            if (result.preview) {
              resultCard.createEl("div", {
                text: result.preview,
                cls: "srd-result-preview"
              });
            }
          }

          if (results.length > 10) {
            resultsContainer.createEl("div", {
              text: `...and ${results.length - 10} more results`,
              cls: "srd-search-more"
            });
          }
        } catch (error) {
          loading.remove();
          resultsContainer.createEl("div", {
            text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            cls: "srd-search-error"
          });
        }
      }, 300);
    });

    // Clear search on focus out after a delay
    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        // Only hide if we're not clicking on a result link
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== "A" || !activeElement.classList.contains("srd-result-name")) {
          resultsContainer.style.display = "none";
        }
      }, 200);
    });

    searchInput.addEventListener("focus", () => {
      if (searchInput.value.trim().length >= 2) {
        resultsContainer.style.display = "block";
      }
    });
  }

  async searchSRDData(query: string): Promise<Array<{type: string; name: string; path: string; preview: string}>> {
    const results: Array<{type: string; name: string; path: string; preview: string; score: number}> = [];
    
    // Define SRD folders to search
    const srdFolders = [
      { path: "z_Spells", type: "Spell" },
      { path: "z_Equipment", type: "Equipment" },
      { path: "z_Classes", type: "Class" },
      { path: "z_Races", type: "Race" },
      { path: "z_Conditions", type: "Condition" },
      { path: "z_Features", type: "Feature" },
      { path: "z_Traits", type: "Trait" },
      { path: "z_AbilityScores", type: "Ability" },
      { path: "z_Skills", type: "Skill" },
      { path: "z_Languages", type: "Language" },
      { path: "z_DamageTypes", type: "Damage Type" },
      { path: "z_MagicSchools", type: "Magic School" },
      { path: "z_Proficiencies", type: "Proficiency" },
      { path: "z_Subclasses", type: "Subclass" },
      { path: "z_Subraces", type: "Subrace" },
      { path: "z_WeaponProperties", type: "Weapon Property" }
    ];

    for (const folder of srdFolders) {
      const srdFolder = this.app.vault.getAbstractFileByPath(folder.path);
      
      if (!(srdFolder instanceof TFolder)) continue;

      for (const file of srdFolder.children) {
        if (!(file instanceof TFile) || file.extension !== "md") continue;

        const fileName = file.basename.toLowerCase();
        
        // Calculate match score
        let score = 0;
        if (fileName === query) {
          score = 100; // Exact match
        } else if (fileName.startsWith(query)) {
          score = 50; // Starts with query
        } else if (fileName.includes(query)) {
          score = 25; // Contains query
        }

        if (score > 0) {
          try {
            const content = await this.app.vault.read(file);
            
            // Extract preview from content (first non-frontmatter paragraph)
            let preview = "";
            const lines = content.split("\n");
            let inFrontmatter = false;
            let foundContent = false;
            
            for (const line of lines) {
              if (line.trim() === "---") {
                if (!foundContent) {
                  inFrontmatter = !inFrontmatter;
                }
                continue;
              }
              
              if (!inFrontmatter && line.trim() && !line.startsWith("#")) {
                preview = line.trim();
                if (preview.length > 100) {
                  preview = preview.substring(0, 100) + "...";
                }
                break;
              }
            }

            results.push({
              type: folder.type,
              name: file.basename,
              path: file.path,
              preview: preview,
              score: score
            });
          } catch (error) {
            console.error(`Error reading file ${file.path}:`, error);
          }
        }
      }
    }

    // Sort by score (highest first) and then alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  async renderQuickActions(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "⚡ Quick Actions" });
    
    const actions = section.createEl("div", { cls: "quick-actions-compact" });

    // Initiative Tracker
    const initiativeBtn = actions.createEl("button", {
      text: "⚔️ Open Initiative Tracker",
      cls: "quick-action-button"
    });
    initiativeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      
      const initiativePlugin = (this.app as any).plugins?.getPlugin("initiative-tracker");
      
      if (!initiativePlugin) {
        new Notice("Initiative Tracker plugin not installed or enabled");
        return;
      }
      
      // Try method 1: Look for existing Initiative Tracker view and reveal it
      const existingLeaves = this.app.workspace.getLeavesOfType("initiative-tracker-view");
      if (existingLeaves.length > 0 && existingLeaves[0]) {
        this.app.workspace.revealLeaf(existingLeaves[0]);
        new Notice("Initiative Tracker opened");
        return;
      }
      
      // Try method 2: Execute the command to open the tracker
      try {
        const commands = (this.app as any).commands;
        if (commands) {
          // Try different possible command IDs
          const commandIds = [
            "initiative-tracker:open-tracker",
            "initiative-tracker:toggle-encounter",
            "obsidian-initiative-tracker:open-tracker"
          ];
          
          for (const cmdId of commandIds) {
            const executed = commands.executeCommandById(cmdId);
            if (executed) {
              new Notice("Initiative Tracker opened");
              return;
            }
          }
        }
      } catch (error) {
        console.error("Error executing command:", error);
      }
      
      // Try method 3: Create a new leaf in the right sidebar with the tracker view
      try {
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
          await leaf.setViewState({
            type: "initiative-tracker-view",
            active: true
          });
          this.app.workspace.revealLeaf(leaf);
          new Notice("Initiative Tracker opened");
          return;
        }
      } catch (error) {
        console.error("Error creating tracker view:", error);
      }
      
      new Notice("Could not open Initiative Tracker. Try opening it manually from the command palette.");
    });

    // Create Encounter
    const encounterBtn = actions.createEl("button", {
      text: "⚔️ Create Encounter",
      cls: "quick-action-button"
    });
    encounterBtn.addEventListener("click", () => {
      (this.app as any).commands?.executeCommandById("dnd-campaign-hub:create-encounter");
    });

    // Open Session File
    if (this.currentSessionFile) {
      const sessionBtn = actions.createEl("button", {
        text: "📄 Open Session Note",
        cls: "quick-action-button"
      });
      sessionBtn.addEventListener("click", async () => {
        if (this.currentSessionFile) {
          await this.app.workspace.openLinkText(this.currentSessionFile.path, "", false);
        }
      });
    }
  }

  async getActiveAdventures() {
    const adventures: Array<{path: string; name: string; status: string}> = [];
    const adventuresFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Adventures`);

    if (!(adventuresFolder instanceof TFolder)) {
      return adventures;
    }

    for (const item of adventuresFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        const cache = this.app.metadataCache.getFileCache(item);
        const status = cache?.frontmatter?.status || "planning";
        
        // Show active, in-progress, and planning adventures (not completed or on-hold)
        if (status === "active" || status === "in-progress" || status === "planning") {
          adventures.push({
            path: item.path,
            name: item.basename,
            status: status
          });
        }
      } else if (item instanceof TFolder) {
        // Check for adventure in folder structure
        const adventureFile = this.app.vault.getAbstractFileByPath(`${item.path}/${item.name}.md`);
        if (adventureFile instanceof TFile) {
          const cache = this.app.metadataCache.getFileCache(adventureFile);
          const status = cache?.frontmatter?.status || "planning";
          
          if (status === "active" || status === "in-progress" || status === "planning") {
            adventures.push({
              path: adventureFile.path,
              name: item.name,
              status: status
            });
          }
        }
      }
    }

    return adventures;
  }

  async getScenesForAdventure(adventurePath: string) {
    const scenes: Array<any> = [];
    const adventureFile = this.app.vault.getAbstractFileByPath(adventurePath);

    if (!(adventureFile instanceof TFile)) return scenes;

    const adventureFolder = adventureFile.parent;
    if (!adventureFolder) return scenes;

    const flatScenesFolder = this.app.vault.getAbstractFileByPath(
      `${adventureFolder.path}/${adventureFile.basename} - Scenes`
    );

    const folderScenesPath = `${adventureFolder.path}/${adventureFile.basename}`;
    const folderStructure = this.app.vault.getAbstractFileByPath(folderScenesPath);

    let sceneFolders: TFolder[] = [];

    if (flatScenesFolder instanceof TFolder) {
      sceneFolders.push(flatScenesFolder);
    } else if (folderStructure instanceof TFolder) {
      for (const child of folderStructure.children) {
        if (child instanceof TFolder && child.name.startsWith("Act ")) {
          sceneFolders.push(child);
        }
      }
      if (sceneFolders.length === 0) {
        sceneFolders.push(folderStructure);
      }
    } else {
      for (const child of adventureFolder.children) {
        if (child instanceof TFolder && child.name.startsWith("Act ")) {
          sceneFolders.push(child);
        }
      }
      if (sceneFolders.length === 0) {
        for (const child of adventureFolder.children) {
          if (child instanceof TFile && child.extension === "md" && 
              child.path !== adventurePath && 
              child.basename.match(/^Scene\s+\d+/)) {
            sceneFolders.push(adventureFolder);
            break;
          }
        }
      }
    }

    for (const folder of sceneFolders) {
      for (const item of folder.children) {
        if (item instanceof TFile && item.extension === "md") {
          const match = item.basename.match(/^Scene\s+(\d+)\s+-\s+(.+)$/);
          if (match && match[1] && match[2]) {
            const cache = this.app.metadataCache.getFileCache(item);
            const frontmatter = cache?.frontmatter;

            scenes.push({
              path: item.path,
              number: parseInt(match[1]),
              name: match[2],
              type: frontmatter?.scene_type || "exploration",
              difficulty: frontmatter?.difficulty || "medium",
              status: frontmatter?.status || "not-started"
            });
          }
        }
      }
    }

    scenes.sort((a, b) => a.number - b.number);
    return scenes;
  }

  getSceneIcon(type: string): string {
    const icons: Record<string, string> = {
      social: "🗣️",
      combat: "⚔️",
      exploration: "🔍",
      puzzle: "🧩",
      montage: "🎬"
    };
    return icons[type] || "📝";
  }

  async markSceneComplete(scenePath: string) {
    const file = this.app.vault.getAbstractFileByPath(scenePath);
    if (!(file instanceof TFile)) return;

    try {
      const content = await this.app.vault.read(file);
      const newContent = content.replace(
        /status:\s*[^\n]+/,
        'status: completed'
      );
      await this.app.vault.modify(file, newContent);
      new Notice("Scene marked as completed!");
    } catch (error) {
      console.error("Error marking scene complete:", error);
      new Notice("Error updating scene status");
    }
  }

  async onClose() {
    // Stop auto-save
    if (this.autoSaveInterval) {
      window.clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Stop timer updates
    if (this.timerUpdateInterval) {
      window.clearInterval(this.timerUpdateInterval);
      this.timerUpdateInterval = null;
    }
    
    // Save any unsaved notes
    await this.saveQuickNotes();
    
    // Disable read-only mode
    if (this.readOnlyMode) {
      this.disableReadOnlyMode();
    }
  }
}

class SessionCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  sessionTitle = "";
  sessionDate: string;
  location = "";
  adventurePath = "";
  useCustomDate = false;
  calendar = "";
  startYear = "";
  startMonth = "";
  startDay = "";
  endYear = "";
  endMonth = "";
  endDay = "";
  selectedCalendarData: any = null;
  endDayDropdown: any = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, campaignPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaignPath = campaignPath || plugin.settings.currentCampaign;
    this.sessionDate = new Date().toISOString().split('T')[0] || "";
    if (adventurePath) {
      this.adventurePath = adventurePath;
    }
  }

  async getAllAdventures(): Promise<Array<{ path: string; name: string }>> {
    const adventures: Array<{ path: string; name: string }> = [];
    const campaignPath = this.campaignPath;
    
    const adventuresFolder = this.app.vault.getAbstractFileByPath(`${campaignPath}/Adventures`);
    
    if (adventuresFolder instanceof TFolder) {
      for (const item of adventuresFolder.children) {
        if (item instanceof TFile && item.extension === 'md') {
          // Adventure file directly in Adventures folder (flat structure)
          adventures.push({
            path: item.path,
            name: item.basename
          });
        } else if (item instanceof TFolder) {
          // Adventure folder with main note inside (folder structure)
          const mainFile = this.app.vault.getAbstractFileByPath(`${item.path}/${item.name}.md`);
          if (mainFile instanceof TFile) {
            adventures.push({
              path: mainFile.path,
              name: item.name
            });
          }
        }
      }
    }

    return adventures;
  }

  async loadCalendarData() {
    // Get campaign World.md to fetch calendar and dates
    const campaignPath = this.campaignPath;
    const worldFile = this.app.vault.getAbstractFileByPath(`${campaignPath}/World.md`);
    
    if (worldFile instanceof TFile) {
      const worldContent = await this.app.vault.read(worldFile);
      const calendarMatch = worldContent.match(/fc-calendar:\s*([^\r\n]\w*)$/m);
      if (calendarMatch && calendarMatch[1]) {
        this.calendar = calendarMatch[1].trim();
        // Get calendar data from Calendarium - search by name
        const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
        if (calendariumPlugin && calendariumPlugin.data?.calendars) {
          // Find calendar by name (stored in fc-calendar field)
          const calendars = calendariumPlugin.data.calendars;
          for (const [id, calData] of Object.entries(calendars)) {
            if ((calData as any).name === this.calendar) {
              this.selectedCalendarData = calData;
              break;
            }
          }
        }
      }
    }

    // Try to get start date from previous session
    const previousSession = await this.getPreviousSession();
    if (previousSession) {
      // Use end date of previous session as start date of this session
      this.startYear = previousSession.endYear;
      this.startMonth = previousSession.endMonth;
      this.startDay = previousSession.endDay;
    } else {
      // No previous session, use campaign start date
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const yearMatch = worldContent.match(/fc-date:\s*\n\s*year:\s*([^\r\n]\w*)$/m);
        const monthMatch = worldContent.match(/fc-date:\s*\n\s*year:.*\n\s*month:\s*([^\r\n]\w*)$/m);
        const dayMatch = worldContent.match(/fc-date:\s*\n\s*year:.*\n\s*month:.*\n\s*day:\s*([^\r\n]\w*)$/m);
        
        if (yearMatch && yearMatch[1]) this.startYear = yearMatch[1].trim();
        if (monthMatch && monthMatch[1]) this.startMonth = monthMatch[1].trim();
        if (dayMatch && dayMatch[1]) this.startDay = dayMatch[1].trim();
      }
    }

    // Ensure defaults if still empty
    if (!this.startYear) this.startYear = "1";
    if (!this.startMonth) this.startMonth = "1";
    if (!this.startDay) this.startDay = "1";

    // Initialize end date same as start date
    this.endYear = this.startYear;
    this.endMonth = this.startMonth;
    this.endDay = this.startDay;
  }

  async getPreviousSession(): Promise<{endYear: string, endMonth: string, endDay: string} | null> {
    const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
    
    if (campaignFolder instanceof TFolder) {
      const files = campaignFolder.children.filter(
        f => f instanceof TFile && f.name.match(/^\d{3}_\d{8}\.md$/)
      );
      
      if (files.length === 0) return null;
      
      // Sort by session number and get the last one
      const sortedFiles = files.sort((a, b) => {
        const numA = parseInt((a as TFile).name.substring(0, 3));
        const numB = parseInt((b as TFile).name.substring(0, 3));
        return numB - numA;
      });
      
      const lastSession = sortedFiles[0] as TFile;
      const content = await this.app.vault.read(lastSession);
      
      const endYearMatch = content.match(/fc-end:\s*\n\s*year:\s*(.+)/);
      const endMonthMatch = content.match(/fc-end:\s*\n\s*year:.*\n\s*month:\s*(.+)/);
      const endDayMatch = content.match(/fc-end:\s*\n\s*year:.*\n\s*month:.*\n\s*day:\s*(.+)/);
      
      if (endYearMatch?.[1] && endMonthMatch?.[1] && endDayMatch?.[1]) {
        return {
          endYear: endYearMatch[1].trim(),
          endMonth: endMonthMatch[1].trim(),
          endDay: endDayMatch[1].trim()
        };
      }
    }
    
    return null;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "📜 Create New Session" });

    // Wait for calendar data to load
    await this.loadCalendarData();

    // Get campaign info
    const campaignPath = this.campaignPath;
    const campaignName = campaignPath?.split('/').pop() || "Unknown";
    
    contentEl.createEl("p", { 
      text: `Campaign: ${campaignName}`,
      cls: "setting-item-description"
    });

    // Calculate next session number
    const nextSessionNum = this.getNextSessionNumber();
    contentEl.createEl("p", { 
      text: `Session Number: ${nextSessionNum}`,
      cls: "setting-item-description"
    });

    // Session Title/Name
    new Setting(contentEl)
      .setName("Session Title")
      .setDesc("Optional descriptive title for this session")
      .addText((text) => {
        text
          .setPlaceholder("e.g., The Goblin Ambush")
          .onChange((value) => {
            this.sessionTitle = value;
          });
        text.inputEl.focus();
      });

    // Adventure Selection
    const adventures = await this.getAllAdventures();
    if (adventures.length > 0) {
      new Setting(contentEl)
        .setName("Adventure")
        .setDesc("Link this session to an adventure (optional)")
        .addDropdown(dropdown => {
          dropdown.addOption("", "-- None --");
          adventures.forEach(adv => {
            dropdown.addOption(adv.path, adv.name);
          });
          dropdown.setValue(this.adventurePath);
          dropdown.onChange(value => {
            this.adventurePath = value;
          });
        });
    }

    // Session Date (real world)
    new Setting(contentEl)
      .setName("Session Date")
      .setDesc("Date when this session was/will be played (real world)")
      .addText((text) =>
        text
          .setValue(this.sessionDate)
          .onChange((value) => {
            this.sessionDate = value;
          })
      )
      .addToggle((toggle) =>
        toggle
          .setTooltip("Use custom date")
          .setValue(this.useCustomDate)
          .onChange((value) => {
            this.useCustomDate = value;
            if (!value) {
              this.sessionDate = new Date().toISOString().split('T')[0] || "";
            }
          })
      );

    // Calendar section
    if (this.calendar && this.selectedCalendarData) {
      contentEl.createEl("h3", { text: `📅 In-Game Calendar: ${this.selectedCalendarData.name || this.calendar}` });

      const monthData = this.selectedCalendarData.static?.months || [];

      // Start Date (from previous session or campaign) - Read only display
      new Setting(contentEl)
        .setName("Start Date (In-Game)")
        .setDesc(`Starts: ${this.getDateDisplay(this.startYear, this.startMonth, this.startDay, monthData)}`);

      // End Date (user sets this)
      const endDateSetting = new Setting(contentEl)
        .setName("End Date (In-Game)")
        .setDesc("When does this session end in your world?");

      // Display current end date
      const endDateDisplay = contentEl.createEl("div", {
        cls: "dnd-date-display",
        text: this.getDateDisplay(this.endYear, this.endMonth, this.endDay, monthData)
      });

      // Add button to open date picker
      endDateSetting.addButton((button) => {
        button
          .setButtonText("📅 Pick End Date")
          .setCta()
          .onClick(async () => {
            await this.openSessionDatePicker(endDateDisplay, monthData);
          });
      });
    }

    // Location
    new Setting(contentEl)
      .setName("Location")
      .setDesc("Where does this session take place in your world?")
      .addText((text) =>
        text
          .setPlaceholder("e.g., Phandalin")
          .onChange((value) => {
            this.location = value;
          })
      );

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create Session",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      this.close();
      await this.createSessionFile();
    });
  }

  getNextSessionNumber(): number {
    const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
    let nextNumber = 1;
    
    if (campaignFolder instanceof TFolder) {
      const files = campaignFolder.children.filter(
        f => f instanceof TFile && f.name.match(/^\d{3}_\d{8}\.md$/)
      );
      const numbers = files.map(f => parseInt((f as TFile).name.substring(0, 3)));
      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      }
    }
    
    return nextNumber;
  }

  getDateDisplay(year: string, month: string, day: string, monthData: any[]): string {
    const monthIndex = parseInt(month) - 1;
    const monthName = monthData[monthIndex]?.name || `Month ${month}`;
    return `${monthName} ${day}, Year ${year}`;
  }

  async openSessionDatePicker(displayElement: HTMLElement, monthData: any[]) {
    // Use our custom date picker modal with calendar validation
    const modal = new CalendarDateInputModal(
      this.app,
      this.selectedCalendarData,
      this.endYear,
      this.endMonth,
      this.endDay,
      (year, month, day) => {
        this.endYear = year;
        this.endMonth = month;
        this.endDay = day;
        displayElement.setText(this.getDateDisplay(this.endYear, this.endMonth, this.endDay, monthData));
      }
    );
    modal.open();
  }

  async createSessionFile() {
    const campaignPath = this.campaignPath;
    const campaignName = campaignPath?.split('/').pop() || "Unknown";
    const nextNumber = this.getNextSessionNumber();

    new Notice(`Creating session ${nextNumber}...`);

    try {
      // Determine which template to use based on campaign role
      const worldFile = this.app.vault.getAbstractFileByPath(`${campaignPath}/World.md`);
      let isGM = true; // Default to GM
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const roleMatch = worldContent.match(/role:\s*(GM|player)/i);
        if (roleMatch && roleMatch[1]) {
          isGM = roleMatch[1].toLowerCase() === 'gm';
        }
      }

      // Get appropriate template
      const templatePath = isGM ? "z_Templates/session-gm.md" : "z_Templates/session-player.md";
      const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      let sessionContent: string;

      if (templateFile instanceof TFile) {
        sessionContent = await this.app.vault.read(templateFile);
      } else {
        sessionContent = isGM ? SESSION_GM_TEMPLATE : SESSION_PLAYER_TEMPLATE;
      }

      // Create filename: 001_20260120.md format
      const dateStr = this.sessionDate.replace(/-/g, '');
      const fileName = `${nextNumber.toString().padStart(3, '0')}_${dateStr}.md`;
      const filePath = `${campaignPath}/${fileName}`;

      // Find previous session for recap
      let recapContent = "";
      if (nextNumber > 1) {
        const prevNumber = nextNumber - 1;
        const campaignFolder = this.app.vault.getAbstractFileByPath(campaignPath);
        
        if (campaignFolder instanceof TFolder) {
          // Find the previous session file (format: 001_20260120.md)
          const prevSessionFile = campaignFolder.children.find(
            f => f instanceof TFile && f.name.match(new RegExp(`^${prevNumber.toString().padStart(3, '0')}_\\d{8}\\.md$`))
          );
          
          if (prevSessionFile instanceof TFile) {
            // Get filename without extension
            const prevSessionName = prevSessionFile.basename;
            recapContent = `\n![[${prevSessionName}#^summary]]\n`;
          }
        }
      }

      // Replace the Recap section with previous session's summary (if available)
      if (recapContent) {
        sessionContent = sessionContent.replace(/## Recap\s*\n/m, `## Recap\n${recapContent}`);
      }

      // Replace placeholders in template using proper regex patterns
      sessionContent = sessionContent
        .replace(/campaign:\s*([^\r\n]\w*)$/m, `campaign: ${campaignName}`)
        .replace(/world:\s*([^\r\n]\w*)$/m, `world: ${campaignName}`)
        .replace(/adventure:\s*([^\r\n]\w*)$/m, `adventure: ${this.adventurePath ? `"[[${this.adventurePath}]]"` : ''}`)
        .replace(/sessionNum:\s*([^\r\n]\w*)$/m, `sessionNum: ${nextNumber}`)
        .replace(/location:\s*([^\r\n]\w*)$/m, `location: ${this.location}`)
        .replace(/date:\s*([^\r\n]\w*)$/m, `date: ${this.sessionDate}`)
        .replace(/fc-calendar:\s*([^\r\n]\w*)$/m, `fc-calendar: ${this.calendar}`)
        .replace(/# Session\s*([^\r\n]\w*)$/m, `# Session ${nextNumber}${this.sessionTitle ? ' - ' + this.sessionTitle : ''}`);

      // Replace fc-date (start date) - need to match the nested structure
      sessionContent = sessionContent
        .replace(/fc-date:\s*\n\s*year:\s*([^\r\n]\w*)$/m, `fc-date:\n  year: ${this.startYear}`)
        .replace(/(fc-date:\s*\n\s*year:.*\n\s*)month:\s*([^\r\n]\w*)$/m, `$1month: ${this.startMonth}`)
        .replace(/(fc-date:\s*\n\s*year:.*\n\s*month:.*\n\s*)day:\s*([^\r\n]\w*)$/m, `$1day: ${this.startDay}`);

      // Replace fc-end (end date) - need to match the nested structure
      sessionContent = sessionContent
        .replace(/fc-end:\s*\n\s*year:\s*([^\r\n]\w*)$/m, `fc-end:\n  year: ${this.endYear}`)
        .replace(/(fc-end:\s*\n\s*year:.*\n\s*)month:\s*([^\r\n]\w*)$/m, `$1month: ${this.endMonth}`)
        .replace(/(fc-end:\s*\n\s*year:.*\n\s*month:.*\n\s*)day:\s*([^\r\n]\w*)$/m, `$1day: ${this.endDay}`);
      // Create the file
      await this.app.vault.create(filePath, sessionContent);

      // Open the file
      await this.app.workspace.openLinkText(filePath, "", true);

      new Notice(`✅ Session ${nextNumber} created successfully!`);
    } catch (error) {
      new Notice(`❌ Error creating session: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Session creation error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class CampaignCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  campaignName = "";
  dmName = "";
  system = "D&D 5e";
  role = "GM";
  calendar = "";
  calendarName = "";
  startYear = "";
  startMonth = "";
  startDay = "";
  selectedCalendarData: any = null;
  calendarContainer: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🎲 Create New Campaign" });

    // Campaign Name
    new Setting(contentEl)
      .setName("Campaign Name")
      .setDesc("The name of your campaign")
      .addText((text) => {
        text
          .setPlaceholder("e.g., Lost Mines of Phandelver")
          .onChange((value) => {
            this.campaignName = value;
          });
        text.inputEl.focus();
      });

    // Role Selection
    new Setting(contentEl)
      .setName("Your Role")
      .setDesc("Are you the GM/DM or a player?")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("GM", "Game Master / DM")
          .addOption("player", "Player")
          .setValue(this.role)
          .onChange((value) => {
            this.role = value;
            this.updateDMField();
          });
      });

    // DM Name (shown only if player)
    const dmSetting = new Setting(contentEl)
      .setName("DM Name")
      .setDesc("Name of the Dungeon Master")
      .addText((text) =>
        text
          .setPlaceholder("e.g., John Smith")
          .onChange((value) => {
            this.dmName = value;
          })
      );

    // Hide DM field initially if GM
    if (this.role === "GM") {
      dmSetting.settingEl.style.display = "none";
    }

    // System Selection
    new Setting(contentEl)
      .setName("Game System")
      .setDesc("Which RPG system are you using?")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("D&D 5e", "Dungeons & Dragons 5th Edition")
          .addOption("Pathfinder 2e", "Pathfinder 2nd Edition")
          .addOption("Call of Cthulhu", "Call of Cthulhu")
          .addOption("Savage Worlds", "Savage Worlds")
          .addOption("FATE", "FATE Core")
          .addOption("OSR", "Old School Renaissance")
          .addOption("Other", "Other / Custom")
          .setValue(this.system)
          .onChange((value) => {
            this.system = value;
          });
      });

    contentEl.createEl("h3", { text: "📅 Calendar Settings" });

    // Calendar Selection
    const calendars = this.getAvailableCalendars();
    new Setting(contentEl)
      .setName("Fantasy Calendar")
      .setDesc("Select an existing calendar or create a new one")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "None");
        dropdown.addOption("__CREATE_NEW__", "➕ Create New Calendar");
        calendars.forEach(cal => {
          dropdown.addOption(cal.id, cal.name);
        });
        dropdown.setValue(this.calendar)
          .onChange((value) => {
            this.calendar = value;
            if (value === "__CREATE_NEW__") {
              this.showCreateCalendarUI();
            } else if (value) {
              this.selectedCalendarData = this.getCalendarData(value);
              this.calendarName = this.selectedCalendarData?.name || value;
              this.showDateSelectors();
            } else {
              this.hideDateSelectors();
            }
          });
      });

    // Container for calendar-specific UI
    this.calendarContainer = contentEl.createDiv({ cls: "dnd-calendar-container" });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create Campaign",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.campaignName.trim()) {
        new Notice("Please enter a campaign name!");
        return;
      }

      this.close();
      await this.createCampaignStructure();
    });

    // Store DM setting reference for later
    this.updateDMField = () => {
      if (this.role === "GM") {
        dmSetting.settingEl.style.display = "none";
      } else {
        dmSetting.settingEl.style.display = "";
      }
    };
  }

  updateDMField() {
    // This will be set in onOpen
  }

  showDateSelectors() {
    if (!this.calendarContainer) return;
    this.calendarContainer.empty();

    if (!this.selectedCalendarData) return;

    // Initialize default values if not set
    if (!this.startYear) this.startYear = "1";
    if (!this.startMonth) this.startMonth = "1";
    if (!this.startDay) this.startDay = "1";

    // Campaign Start Date with date picker button
    const dateSetting = new Setting(this.calendarContainer)
      .setName("Campaign Start Date")
      .setDesc("When does the campaign begin in your world?");

    // Display current date
    const dateDisplay = this.calendarContainer.createEl("div", {
      cls: "dnd-date-display"
    });
    this.updateDateDisplay(dateDisplay);

    // Add button to open Calendarium's date picker
    dateSetting.addButton((button) => {
      button
        .setButtonText("📅 Pick Date")
        .setCta()
        .onClick(async () => {
          await this.openCalendariumDatePicker();
        });
    });
  }

  updateDateDisplay(container: HTMLElement) {
    const monthData = this.selectedCalendarData?.static?.months || [];
    const monthIndex = parseInt(this.startMonth || "1") - 1;
    const monthName = monthData[monthIndex]?.name || `Month ${this.startMonth}`;
    
    container.setText(`${monthName} ${this.startDay}, Year ${this.startYear}`);
  }

  async openCalendariumDatePicker() {
    // Use our custom date picker modal with calendar validation
    const modal = new CalendarDateInputModal(
      this.app,
      this.selectedCalendarData,
      this.startYear,
      this.startMonth,
      this.startDay,
      (year, month, day) => {
        this.startYear = year;
        this.startMonth = month;
        this.startDay = day;
        
        const dateDisplay = this.calendarContainer?.querySelector('.dnd-date-display');
        if (dateDisplay) {
          this.updateDateDisplay(dateDisplay as HTMLElement);
        }
      }
    );
    modal.open();
  }

  hideDateSelectors() {
    if (this.calendarContainer) {
      this.calendarContainer.empty();
    }
  }

  showCreateCalendarUI() {
    if (!this.calendarContainer) return;
    this.calendarContainer.empty();

    this.calendarContainer.createEl("p", {
      text: "Click below to open Calendarium's calendar creation interface.",
      cls: "setting-item-description"
    });

    const buttonContainer = this.calendarContainer.createDiv({ cls: "dnd-calendar-buttons" });

    // Quick Create button
    const quickButton = buttonContainer.createEl("button", {
      text: "⚡ Quick Create",
      cls: "mod-cta"
    });
    quickButton.addEventListener("click", async () => {
      await this.openCalendariumCreation("quick");
    });

    // Full Create button
    const fullButton = buttonContainer.createEl("button", {
      text: "🎨 Full Create"
    });
    fullButton.addEventListener("click", async () => {
      await this.openCalendariumCreation("full");
    });

    // Import button
    const importButton = buttonContainer.createEl("button", {
      text: "📥 Import"
    });
    importButton.addEventListener("click", async () => {
      await this.openCalendariumCreation("import");
    });

    this.calendarContainer.createEl("p", {
      text: "After creating your calendar, reopen this modal to select it.",
      cls: "setting-item-description mod-warning"
    });
  }

  async openCalendariumCreation(type: "quick" | "full" | "import") {
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (!calendariumPlugin) {
      new Notice("Calendarium plugin not found!");
      return;
    }

    // Close this modal temporarily
    this.close();

    // Open Calendarium settings to the calendar creation section
    // This uses Obsidian's settings API
    const settingTab = (this.app as any).setting;
    if (settingTab) {
      settingTab.open();
      settingTab.openTabById("calendarium");
    }

    // Try to trigger the appropriate calendar creation command
    const commands = {
      quick: "calendarium:open-quick-creator",
      full: "calendarium:open-creator",
      import: "calendarium:import-calendar"
    };

    const commandId = commands[type];

    setTimeout(() => {
      (this.app as any).commands?.executeCommandById(commandId);
    }, 100);

    new Notice("After creating your calendar, use 'Create Campaign' again to select it.");
  }

  getAvailableCalendars(): Array<{ id: string; name: string }> {
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (calendariumPlugin && calendariumPlugin.data?.calendars) {
      const calendars = calendariumPlugin.data.calendars as Record<string, { name?: string }>;
      return Object.keys(calendars).map((id) => ({
        id,
        name: calendars[id]?.name || id,
      }));
    }
    return [];
  }

  getCalendarData(calendarId: string): any {
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (calendariumPlugin && calendariumPlugin.data?.calendars) {
      return calendariumPlugin.data.calendars[calendarId];
    }
    return null;
  }

  async createCampaignStructure() {
    const campaignName = this.campaignName.trim();
    const campaignPath = `ttrpgs/${campaignName}`;

    new Notice(`Creating campaign "${campaignName}"...`);

    try {
      const campaignFolders = [
        campaignPath,
        `${campaignPath}/NPCs`,
        `${campaignPath}/PCs`,
        `${campaignPath}/Adventures`,
        `${campaignPath}/Factions`,
        `${campaignPath}/Items`,
        `${campaignPath}/Modules`,
        `${campaignPath}/Plot`,
        `${campaignPath}/fc-calendar`,
      ];

      for (const folder of campaignFolders) {
        await this.plugin.ensureFolderExists(folder);
      }

      const worldTemplate = this.app.vault.getAbstractFileByPath("z_Templates/world.md");
      let worldContent: string;

      if (worldTemplate instanceof TFile) {
        worldContent = await this.app.vault.read(worldTemplate);
      } else {
        worldContent = WORLD_TEMPLATE;
      }

      worldContent = worldContent
        .replace(/world: $/m, `world: ${campaignName}`)
        .replace(/campaign: $/m, `campaign: ${campaignName}`)
        .replace(/role: player$/m, `role: ${this.role}`)
        .replace(/system:$/m, `system: ${this.system}`)
        .replace(/fc-calendar:\s*([^\r\n]\w*)$/m, `fc-calendar: ${this.calendarName}`)
        .replace(/fc-date:\s*\n\s*year:\s*([^\r\n]\w*)$/m, `fc-date:\n  year: ${this.startYear}`)
        .replace(/(fc-date:\s*\n\s*year:.+\n\s*)month:\s*([^\r\n]\w*)$/m, `$1month: ${this.startMonth}`)
        .replace(/(fc-date:\s*\n\s*year:.+\n\s*month:.+\n\s*)day:\s*([^\r\n]\w*)$/m, `$1day: ${this.startDay}`)
        .replace(/# The World of Your Campaign/g, `# The World of ${campaignName}`)
        .replace(/{{CAMPAIGN_NAME}}/g, campaignName);

      const worldFilePath = `${campaignPath}/World.md`;
      await this.app.vault.create(worldFilePath, worldContent);

      if (this.role === "GM") {
        const houseRulesContent = `---
type: rules
campaign: ${campaignName}
---

# House Rules

## Character Creation
- 

## Combat Rules
- 

## Homebrew Content
- 

## Table Etiquette
- 
`;
        await this.app.vault.create(`${campaignPath}/House Rules.md`, houseRulesContent);
      }

      this.plugin.settings.currentCampaign = campaignPath;
      await this.plugin.saveSettings();

      await this.app.workspace.openLinkText(worldFilePath, "", true);

      new Notice(`✅ Campaign "${campaignName}" created successfully!`);
    } catch (error) {
      new Notice(`❌ Error creating campaign: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Campaign creation error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal to inform users about missing plugin dependencies
 */
class DependencyModal extends Modal {
  dependencies: { missing: string[]; installed: string[] };

  constructor(app: App, dependencies: { missing: string[]; installed: string[] }) {
    super(app);
    this.dependencies = dependencies;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "⚠️ Missing Plugin Dependencies" });

    contentEl.createEl("p", {
      text: "D&D Campaign Hub requires the following community plugins to work properly:"
    });

    // Show missing plugins
    if (this.dependencies.missing.length > 0) {
      const missingList = contentEl.createEl("div", { cls: "dnd-dependency-list" });
      missingList.createEl("h3", { text: "❌ Missing:" });
      const ul = missingList.createEl("ul");
      this.dependencies.missing.forEach(plugin => {
        ul.createEl("li", { text: plugin });
      });
    }

    // Show installed plugins
    if (this.dependencies.installed.length > 0) {
      const installedList = contentEl.createEl("div", { cls: "dnd-dependency-list" });
      installedList.createEl("h3", { text: "✅ Installed:" });
      const ul = installedList.createEl("ul");
      this.dependencies.installed.forEach(plugin => {
        ul.createEl("li", { text: plugin });
      });
    }

    contentEl.createEl("h3", { text: "📦 How to Install" });
    const instructions = contentEl.createEl("div", { cls: "dnd-dependency-instructions" });
    instructions.createEl("p", { text: "1. Open Settings → Community Plugins" });
    instructions.createEl("p", { text: "2. Click 'Browse' to open the plugin browser" });
    instructions.createEl("p", { text: "3. Search for and install the missing plugins" });
    instructions.createEl("p", { text: "4. Enable each plugin after installation" });
    instructions.createEl("p", { text: "5. Return to D&D Campaign Hub and try again" });

    contentEl.createEl("p", { 
      text: "💡 These plugins add buttons, tables, and calendar features that make your campaigns interactive and organized.",
      cls: "dnd-dependency-note"
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const settingsButton = buttonContainer.createEl("button", {
      text: "Open Settings",
      cls: "mod-cta"
    });
    settingsButton.addEventListener("click", () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('community-plugins');
      this.close();
    });

    const closeButton = buttonContainer.createEl("button", { text: "Close" });
    closeButton.addEventListener("click", () => {
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class CalendarDateInputModal extends Modal {
  calendarData: any;
  year: string;
  month: string;
  day: string;
  onSubmit: (year: string, month: string, day: string) => void;
  dayDropdown: any = null;

  constructor(
    app: App,
    calendarData: any,
    year: string,
    month: string,
    day: string,
    onSubmit: (year: string, month: string, day: string) => void
  ) {
    super(app);
    this.calendarData = calendarData;
    this.year = year || "1";
    this.month = month || "1";
    this.day = day || "1";
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: " Select Date" });

    const monthData = this.calendarData?.static?.months || [];

    const dateSetting = new Setting(contentEl)
      .setName("Date")
      .setDesc("Select year, month, and day");

    dateSetting.addText((text) => {
      text
        .setPlaceholder("Year")
        .setValue(this.year)
        .onChange((value) => {
          this.year = value;
        });
      text.inputEl.style.width = "80px";
    });

    dateSetting.addDropdown((dropdown) => {
      monthData.forEach((month: any, index: number) => {
        const monthName = month.name || `Month ${index + 1}`;
        dropdown.addOption((index + 1).toString(), monthName);
      });
      dropdown.setValue(this.month || "1")
        .onChange((value) => {
          this.month = value;
          this.updateDayDropdown();
        });
    });

    dateSetting.addDropdown((dropdown) => {
      this.dayDropdown = dropdown;
      this.updateDayDropdown();
      dropdown.setValue(this.day || "1")
        .onChange((value) => {
          this.day = value;
        });
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const selectButton = buttonContainer.createEl("button", {
      text: "Select Date",
      cls: "mod-cta"
    });
    selectButton.addEventListener("click", () => {
      this.onSubmit(this.year, this.month, this.day);
      this.close();
    });
  }

  updateDayDropdown() {
    if (!this.dayDropdown) return;

    const monthData = this.calendarData?.static?.months || [];
    const monthIndex = parseInt(this.month || "1") - 1;
    const daysInMonth = monthData[monthIndex]?.length || 30;

    this.dayDropdown.selectEl.empty();
    for (let d = 1; d <= daysInMonth; d++) {
      this.dayDropdown.addOption(d.toString(), d.toString());
    }
    
    if (parseInt(this.day) > daysInMonth) {
      this.day = daysInMonth.toString();
      this.dayDropdown.setValue(this.day);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class AdventureCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  adventureName = "";
  campaign = "";
  theProblem = "";
  levelFrom = "1";
  levelTo = "3";
  expectedSessions = "3";
  useFolderStructure = false;
  isGM = false;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🗺️ Create New Adventure" });

    // Get all campaigns and filter for GM ones
    const allCampaigns = await this.getAllGMCampaigns();

    if (allCampaigns.length === 0) {
      contentEl.createEl("p", {
        text: "⚠️ Only GMs can create adventures. You don't have any campaigns where you are set as GM (role: gm in World.md).",
        cls: "mod-warning"
      });
      
      const closeBtn = contentEl.createEl("button", { text: "Close" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }

    // Default to first GM campaign
    if (allCampaigns.length > 0 && allCampaigns[0]) {
      this.campaign = allCampaigns[0].path;
      this.isGM = true;
    }

    contentEl.createEl("p", {
      text: "Plan a compelling multi-session adventure with a 3-act structure.",
      cls: "setting-item-description"
    });

    // Adventure Name
    new Setting(contentEl)
      .setName("Adventure Name")
      .setDesc("What is this adventure called?")
      .addText((text) => {
        text
          .setPlaceholder("e.g., The Sunless Citadel, Murder in Baldur's Gate")
          .onChange((value) => {
            this.adventureName = value;
          });
        text.inputEl.focus();
      });

    // Campaign Selection (only GM campaigns)
    new Setting(contentEl)
      .setName("Campaign")
      .setDesc("Which campaign does this adventure belong to?")
      .addDropdown((dropdown) => {
        allCampaigns.forEach(campaign => {
          dropdown.addOption(campaign.path, campaign.name);
        });
        dropdown.setValue(this.campaign)
          .onChange((value) => {
            this.campaign = value;
          });
      });

    contentEl.createEl("h3", { text: "📖 Core Adventure" });

    // The Problem
    new Setting(contentEl)
      .setName("The Problem")
      .setDesc("What urgent situation demands heroes? (2-3 sentences)")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., A kobold tribe has taken over an ancient citadel and is terrorizing nearby settlements. The mayor desperately needs heroes to stop the raids before the town is abandoned.")
          .onChange((value) => {
            this.theProblem = value;
          });
        text.inputEl.rows = 4;
      });

    contentEl.createEl("h3", { text: "⚙️ Adventure Parameters" });

    // Level Range
    const levelSetting = new Setting(contentEl)
      .setName("Target Level Range")
      .setDesc("What character levels is this adventure designed for?");

    levelSetting.addText((text) => {
      text
        .setPlaceholder("1")
        .setValue(this.levelFrom)
        .onChange((value) => {
          this.levelFrom = value;
        });
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });

    levelSetting.controlEl.createSpan({ text: " to ", cls: "dnd-level-separator" });

    levelSetting.addText((text) => {
      text
        .setPlaceholder("3")
        .setValue(this.levelTo)
        .onChange((value) => {
          this.levelTo = value;
        });
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });

    // Expected Sessions
    new Setting(contentEl)
      .setName("Expected Sessions")
      .setDesc("How many sessions do you expect this adventure to take?")
      .addText((text) => {
        text
          .setPlaceholder("3")
          .setValue(this.expectedSessions)
          .onChange((value) => {
            this.expectedSessions = value;
          });
        text.inputEl.type = "number";
        text.inputEl.style.width = "80px";
      });

    contentEl.createEl("h3", { text: "📁 Structure Options" });

    // Folder Structure Toggle
    new Setting(contentEl)
      .setName("Create full folder structure with Acts")
      .setDesc("Organize scenes into separate Act folders (recommended for 3+ session adventures)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.useFolderStructure)
          .onChange((value) => {
            this.useFolderStructure = value;
          })
      );

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create Adventure",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.adventureName.trim()) {
        new Notice("Please enter an adventure name!");
        return;
      }

      this.close();
      await this.createAdventureFile();
    });
  }

  async getAllGMCampaigns(): Promise<Array<{ path: string; name: string }>> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const gmCampaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      for (const child of ttrpgsFolder.children) {
        if (child instanceof TFolder) {
          // Check if this campaign has role: gm
          const worldFile = this.app.vault.getAbstractFileByPath(`${child.path}/World.md`);
          if (worldFile instanceof TFile) {
            const worldContent = await this.app.vault.read(worldFile);
            const roleMatch = worldContent.match(/^role:\s*([^\r\n]\w*)$/m);
            if (roleMatch && roleMatch[1] && roleMatch[1].toLowerCase() === 'gm') {
              gmCampaigns.push({
                path: child.path,
                name: child.name
              });
            }
          }
        }
      }
    }

    return gmCampaigns;
  }

  async createAdventureFile() {
    const campaignName = this.campaign.split('/').pop() || "Unknown";
    const baseAdventurePath = `${this.campaign}/Adventures`;
    
    new Notice(`Creating Adventure "${this.adventureName}"...`);

    try {
      await this.plugin.ensureFolderExists(baseAdventurePath);

      // Get world info from campaign World.md
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
      let worldName = campaignName;
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*([^\r\n]+)$/m);
        if (worldMatch && worldMatch[1] && worldMatch[1].trim()) {
          worldName = worldMatch[1].trim();
        }
      }

      // Determine folder structure
      let adventureFolder: string;
      let mainNotePath: string;
      let scenesBasePath: string;

      if (this.useFolderStructure) {
        // Full folder structure: Adventures/Adventure Name/Adventure Name.md
        adventureFolder = `${baseAdventurePath}/${this.adventureName}`;
        await this.plugin.ensureFolderExists(adventureFolder);
        mainNotePath = `${adventureFolder}/${this.adventureName}.md`;
        scenesBasePath = adventureFolder; // Acts will be subfolders here
      } else {
        // Flat structure: Adventures/Adventure Name.md with Scenes subfolder
        mainNotePath = `${baseAdventurePath}/${this.adventureName}.md`;
        scenesBasePath = `${baseAdventurePath}/${this.adventureName} - Scenes`;
        await this.plugin.ensureFolderExists(scenesBasePath);
      }

      // Get current date
      const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);

      // Ensure worldName has a value for type safety
      const safeWorldName: string = worldName || campaignName || "Unknown";
      const safeCampaignName: string = campaignName || "Unknown";

      // Create main adventure note
      await this.createMainAdventureNote(mainNotePath, safeCampaignName, safeWorldName, currentDate);

      // Create scene notes
      await this.createSceneNotes(scenesBasePath, safeCampaignName, safeWorldName, currentDate);

      // Open the main adventure file
      await this.app.workspace.openLinkText(mainNotePath, "", true);

      new Notice(`✅ Adventure "${this.adventureName}" created with 9 scenes!`);
    } catch (error) {
      new Notice(`❌ Error creating Adventure: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Adventure creation error:", error);
    }
  }

  async createMainAdventureNote(filePath: string, campaignName: string, worldName: string, currentDate: string) {
    // Get Adventure template
    const templatePath = "z_Templates/Frontmatter - Adventure.md";
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    let adventureContent: string;

    if (templateFile instanceof TFile) {
      adventureContent = await this.app.vault.read(templateFile);
    } else {
      adventureContent = ADVENTURE_TEMPLATE;
    }

    // Build complete frontmatter
    const frontmatter = `---
type: adventure
name: ${this.adventureName}
campaign: ${campaignName}
world: ${worldName}
status: planning
level_range: ${this.levelFrom}-${this.levelTo}
current_act: 1
expected_sessions: ${this.expectedSessions}
sessions: []
date: ${currentDate}
---`;

    // Replace the frontmatter
    adventureContent = adventureContent.replace(/^---\n[\s\S]*?\n---/, frontmatter);
    
    // Replace template placeholders
    adventureContent = adventureContent
      .replace(/# <% tp\.frontmatter\.name %>/g, `# ${this.adventureName}`)
      .replace(/<% tp\.frontmatter\.name %>/g, this.adventureName)
      .replace(/{{ADVENTURE_NAME}}/g, this.adventureName)
      .replace(/{{CAMPAIGN_NAME}}/g, campaignName)
      .replace(/{{LEVEL_RANGE}}/g, `${this.levelFrom}-${this.levelTo}`)
      .replace(/{{EXPECTED_SESSIONS}}/g, this.expectedSessions)
      .replace(/{{THE_PROBLEM}}/g, this.theProblem || "_[What urgent situation demands heroes?]_")
      .replace(/<% tp\.frontmatter\.level_range %>/g, `${this.levelFrom}-${this.levelTo}`)
      .replace(/<% tp\.frontmatter\.expected_sessions %>/g, this.expectedSessions)
      .replace(/<% tp\.frontmatter\.current_act %>/g, "1");

    await this.app.vault.create(filePath, adventureContent);
  }

  async createSceneNotes(basePath: string, campaignName: string, worldName: string, currentDate: string) {
    const scenes = [
      { act: 1, num: 1, name: "Opening Hook", duration: "15min", type: "social", difficulty: "easy" },
      { act: 1, num: 2, name: "Investigation", duration: "30min", type: "exploration", difficulty: "medium" },
      { act: 1, num: 3, name: "First Confrontation", duration: "45min", type: "combat", difficulty: "medium" },
      { act: 2, num: 4, name: "Complication Arises", duration: "20min", type: "social", difficulty: "medium" },
      { act: 2, num: 5, name: "Major Challenge", duration: "40min", type: "combat", difficulty: "hard" },
      { act: 2, num: 6, name: "Critical Choice", duration: "30min", type: "social", difficulty: "hard" },
      { act: 3, num: 7, name: "Preparation", duration: "20min", type: "exploration", difficulty: "medium" },
      { act: 3, num: 8, name: "Climactic Battle", duration: "60min", type: "combat", difficulty: "deadly" },
      { act: 3, num: 9, name: "Resolution", duration: "10min", type: "social", difficulty: "easy" }
    ];

    for (const scene of scenes) {
      let scenePath: string;
      
      if (this.useFolderStructure) {
        // Create Act folders
        const actName = scene.act === 1 ? "Act 1 - Setup" : scene.act === 2 ? "Act 2 - Rising Action" : "Act 3 - Climax";
        const actFolder = `${basePath}/${actName}`;
        await this.plugin.ensureFolderExists(actFolder);
        scenePath = `${actFolder}/Scene ${scene.num} - ${scene.name}.md`;
      } else {
        // Flat structure
        scenePath = `${basePath}/Scene ${scene.num} - ${scene.name}.md`;
      }

      await this.createSceneNote(scenePath, scene, campaignName, worldName, currentDate);
    }
  }

  async createSceneNote(filePath: string, scene: any, campaignName: string, worldName: string, currentDate: string) {
    const sceneContent = SCENE_TEMPLATE
      .replace(/{{SCENE_NUMBER}}/g, scene.num.toString())
      .replace(/{{SCENE_NAME}}/g, scene.name)
      .replace(/{{ADVENTURE_NAME}}/g, this.adventureName)
      .replace(/{{ACT_NUMBER}}/g, scene.act.toString())
      .replace(/{{DURATION}}/g, scene.duration)
      .replace(/{{TYPE}}/g, scene.type)
      .replace(/{{DIFFICULTY}}/g, scene.difficulty)
      .replace(/{{CAMPAIGN}}/g, campaignName)
      .replace(/{{WORLD}}/g, worldName)
      .replace(/{{DATE}}/g, currentDate)
      .replace(/{{TRACKER_ENCOUNTER}}/g, "")
      .replace(/{{ENCOUNTER_CREATURES}}/g, "[]")
      .replace(/{{ENCOUNTER_DIFFICULTY}}/g, "null");

    await this.app.vault.create(filePath, sceneContent);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Trap-related interfaces
interface TrapElement {
  name: string;
  element_type: 'active' | 'dynamic' | 'constant';
  initiative?: number;  // For active elements
  attack_bonus?: number;
  save_dc?: number;
  save_ability?: string;
  damage?: string;
  additional_damage?: string;  // Extra damage (e.g., ongoing, secondary)
  range?: string;  // Attack/effect range (e.g., "60 ft.", "Touch")
  on_success?: string;  // What happens on successful save
  on_failure?: string;  // What happens on failed save
  effect?: string;
  condition?: string;  // For dynamic elements
}

interface TrapCountermeasure {
  method: string;
  description?: string;
  dc?: number;
  checks_needed?: number;
  effect?: string;
}

interface EncounterCreature {
  name: string;
  count: number;
  hp?: number;
  ac?: number;
  cr?: string;
  source?: string;
  path?: string;  // Path to creature file for statblock plugin
  isCustom?: boolean;  // Temporary custom creature
  isFriendly?: boolean;  // Friendly NPC/creature
  isHidden?: boolean;  // Hidden from players
  isTrap?: boolean;  // Trap hazard (uses trap calculation logic)
  trapData?: {  // Trap-specific data for difficulty calculation
    elements: TrapElement[];
    threatLevel: 'setback' | 'dangerous' | 'deadly';
    trapType: 'simple' | 'complex';
  };
}

interface EncounterData {
  name: string;
  creatures: EncounterCreature[];
  includeParty: boolean;
  useColorNames: boolean;
  adventurePath?: string;
  scenePath?: string;
  campaignPath?: string;
  difficulty?: {
    rating: string;
    color: string;
    summary: string;
    partyStats?: any;
    enemyStats?: any;
  };
}

class EncounterBuilder {
  app: App;
  plugin: DndCampaignHubPlugin;

  encounterName = "";
  creatures: EncounterCreature[] = [];
  includeParty = true;
  selectedPartyMembers: string[] = [];
  selectedPartyId = "";
  useColorNames = false;
  adventurePath = "";
  scenePath = "";
  campaignPath = "";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  findCampaignFolder(filePath: string): string | null {
    // Look for campaign folder in path (folders containing "ttrpgs" subdirectory)
    const parts = filePath.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const potentialCampaign = parts.slice(0, i + 1).join('/');
      const ttrpgPath = `${potentialCampaign}/ttrpgs`;
      if (this.app.vault.getAbstractFileByPath(ttrpgPath)) {
        return potentialCampaign;
      }
    }
    return null;
  }

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number }>> {
    const members: Array<{ name: string; level: number; hp: number; ac: number }> = [];

    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin?.data) return members;

      const party = this.resolveParty(initiativePlugin);
      if (!party?.players) return members;

      const players = this.getPartyPlayersFromParty(initiativePlugin, party, false);
      for (const player of players) {
        members.push({
          name: player.name || "Unknown",
          level: player.level || 1,
          hp: player.hp || player.currentMaxHP || 20,
          ac: player.ac || player.currentAC || 14
        });
      }
    } catch (error) {
      console.error("Error getting available party members:", error);
    }

    return members;
  }

  async getAvailableParties(): Promise<Array<{ id: string; name: string }>> {
    const parties: Array<{ id: string; name: string }> = [];

    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin?.data?.parties) return parties;

      for (const party of initiativePlugin.data.parties) {
        const id = party.id || party.name;
        const name = party.name || "Unnamed Party";
        parties.push({ id, name });
      }

      parties.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error("Error getting available parties:", error);
    }

    return parties;
  }

  async getResolvedParty(): Promise<{ id: string; name: string } | null> {
    const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
    if (!initiativePlugin?.data) return null;

    const party = this.resolveParty(initiativePlugin);
    if (!party) return null;

    return { id: party.id || party.name, name: party.name || "Unnamed Party" };
  }

  async getPartyForDifficulty(): Promise<Array<{ level: number; hp?: number; ac?: number }>> {
    if (!this.includeParty) return [];

    const partyMembers: Array<{ level: number; hp?: number; ac?: number }> = [];

    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin?.data) return partyMembers;

      const party = this.resolveParty(initiativePlugin);
      if (!party?.players) return partyMembers;

      const players = this.getPartyPlayersFromParty(initiativePlugin, party, true);
      for (const player of players) {
        partyMembers.push({
          level: player.level || 1,
          hp: player.hp || player.currentMaxHP,
          ac: player.ac || player.currentAC
        });
      }
    } catch (error) {
      console.error("Error getting party for difficulty:", error);
    }

    return partyMembers;
  }

  async getSelectedPartyPlayers(): Promise<any[]> {
    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin?.data) return [];

      const party = this.resolveParty(initiativePlugin);
      if (!party?.players) return [];

      return this.getPartyPlayersFromParty(initiativePlugin, party, true);
    } catch (error) {
      console.error("Error getting selected party players:", error);
      return [];
    }
  }

  resolveParty(initiativePlugin: any, campaignNameOverride?: string): any | null {
    const parties: any[] = initiativePlugin?.data?.parties || [];
    if (parties.length === 0) return null;

    if (this.selectedPartyId) {
      const selected = parties.find((p: any) => (p.id || p.name) === this.selectedPartyId);
      if (selected) return selected;
    }

    let campaignName = campaignNameOverride || "";
    
    // Use campaignPath if available (e.g., "ttrpgs/Frozen Sick (SOLINA)")
    if (!campaignName && this.campaignPath) {
      const pathParts = this.campaignPath.split('/');
      campaignName = pathParts[pathParts.length - 1] || "";
      console.log(`[EncounterBuilder] Using campaignPath to resolve party: "${campaignName}"`);
    }
    
    if (!campaignName) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const campaignFolder = this.findCampaignFolder(activeFile.path);
        if (campaignFolder) {
          campaignName = campaignFolder.split('/').pop() || "";
          console.log(`[EncounterBuilder] Resolved campaign from active file: "${campaignName}"`);
        }
      }
    }

    if (campaignName) {
      const partyName = `${campaignName} Party`;
      console.log(`[EncounterBuilder] Looking for party: "${partyName}"`);
      const namedParty = parties.find((p: any) => p.name === partyName);
      if (namedParty) {
        console.log(`[EncounterBuilder] Found party: "${namedParty.name}" with ${namedParty.players?.length || 0} players`);
        return namedParty;
      } else {
        console.log(`[EncounterBuilder] Party "${partyName}" not found. Available parties:`, parties.map(p => p.name));
      }
    }

    if (initiativePlugin?.data?.defaultParty) {
      const defaultParty = parties.find((p: any) => p.id === initiativePlugin.data.defaultParty);
      if (defaultParty) {
        console.log(`[EncounterBuilder] Using default party: "${defaultParty.name}"`);
        return defaultParty;
      }
    }

    console.log(`[EncounterBuilder] No matching party found, using first available party`);
    return parties[0] || null;
  }

  getPartyPlayersFromParty(initiativePlugin: any, party: any, filterSelected = true): any[] {
    const players: any[] = initiativePlugin?.data?.players || [];
    const playerById = new Map(players.map(p => [p.id, p]));
    const playerByName = new Map(players.map(p => [p.name, p]));

    const selectedNames = filterSelected && this.selectedPartyMembers.length > 0
      ? new Set(this.selectedPartyMembers)
      : null;

    const results: any[] = [];
    for (const entry of party.players || []) {
      const player = playerById.get(entry) || playerByName.get(entry);
      if (!player) continue;
      if (selectedNames && !selectedNames.has(player.name)) continue;
      results.push(player);
    }

    return results;
  }

  getCRStats(cr: string | undefined): { hp: number; ac: number; dpr: number; attackBonus: number; xp: number } {
    // CR stats table from D&D 5e DMG
    const crTable: { [key: string]: { hp: number; ac: number; dpr: number; attackBonus: number; xp: number } } = {
      "0": { hp: 5, ac: 13, dpr: 1, attackBonus: 3, xp: 10 },
      "1/8": { hp: 10, ac: 13, dpr: 2, attackBonus: 3, xp: 25 },
      "1/4": { hp: 20, ac: 13, dpr: 3, attackBonus: 3, xp: 50 },
      "1/2": { hp: 35, ac: 13, dpr: 5, attackBonus: 3, xp: 100 },
      "1": { hp: 70, ac: 13, dpr: 8, attackBonus: 3, xp: 200 },
      "2": { hp: 85, ac: 13, dpr: 15, attackBonus: 3, xp: 450 },
      "3": { hp: 100, ac: 13, dpr: 21, attackBonus: 4, xp: 700 },
      "4": { hp: 115, ac: 14, dpr: 27, attackBonus: 5, xp: 1100 },
      "5": { hp: 130, ac: 15, dpr: 33, attackBonus: 6, xp: 1800 },
      "6": { hp: 145, ac: 15, dpr: 39, attackBonus: 6, xp: 2300 },
      "7": { hp: 160, ac: 15, dpr: 45, attackBonus: 6, xp: 2900 },
      "8": { hp: 175, ac: 16, dpr: 51, attackBonus: 7, xp: 3900 },
      "9": { hp: 190, ac: 16, dpr: 57, attackBonus: 7, xp: 5000 },
      "10": { hp: 205, ac: 17, dpr: 63, attackBonus: 7, xp: 5900 },
      "11": { hp: 220, ac: 17, dpr: 69, attackBonus: 7, xp: 7200 },
      "12": { hp: 235, ac: 17, dpr: 75, attackBonus: 8, xp: 8400 },
      "13": { hp: 250, ac: 18, dpr: 81, attackBonus: 8, xp: 10000 },
      "14": { hp: 265, ac: 18, dpr: 87, attackBonus: 8, xp: 11500 },
      "15": { hp: 280, ac: 18, dpr: 93, attackBonus: 8, xp: 13000 },
      "16": { hp: 295, ac: 18, dpr: 99, attackBonus: 9, xp: 15000 },
      "17": { hp: 310, ac: 19, dpr: 105, attackBonus: 10, xp: 18000 },
      "18": { hp: 325, ac: 19, dpr: 111, attackBonus: 10, xp: 20000 },
      "19": { hp: 340, ac: 19, dpr: 117, attackBonus: 10, xp: 22000 },
      "20": { hp: 355, ac: 19, dpr: 123, attackBonus: 10, xp: 25000 },
      "21": { hp: 400, ac: 19, dpr: 140, attackBonus: 11, xp: 33000 },
      "22": { hp: 450, ac: 19, dpr: 150, attackBonus: 11, xp: 41000 },
      "23": { hp: 500, ac: 19, dpr: 160, attackBonus: 11, xp: 50000 },
      "24": { hp: 550, ac: 19, dpr: 170, attackBonus: 12, xp: 62000 },
      "25": { hp: 600, ac: 19, dpr: 180, attackBonus: 12, xp: 75000 },
      "26": { hp: 650, ac: 19, dpr: 190, attackBonus: 12, xp: 90000 },
      "27": { hp: 700, ac: 19, dpr: 200, attackBonus: 13, xp: 105000 },
      "28": { hp: 750, ac: 19, dpr: 210, attackBonus: 13, xp: 120000 },
      "29": { hp: 800, ac: 19, dpr: 220, attackBonus: 13, xp: 135000 },
      "30": { hp: 850, ac: 19, dpr: 230, attackBonus: 14, xp: 155000 }
    };

    return crTable[cr || "1/4"] || crTable["1/4"]!;
  }

  getLevelStats(level: number): { hp: number; ac: number; dpr: number; attackBonus: number } {
    // Level-based stats from D&D 5e Player's Handbook averages
    // Updated DPR to be more realistic for actual play
    const baseHP = 8; // Average starting HP
    const hpPerLevel = 5; // Average HP gain per level
    const baseAC = 12;
    const acIncreaseInterval = 4; // AC increases every 4 levels
    const baseDPR = 8; // Starting DPR at level 1 (more realistic)
    const dprPerLevel = 2.5; // DPR increases more significantly per level
    const baseAttackBonus = 2;
    const proficiencyBonus = Math.floor((level - 1) / 4) + 2;

    return {
      hp: baseHP + hpPerLevel * (level - 1),
      ac: baseAC + Math.floor(level / acIncreaseInterval),
      dpr: baseDPR + dprPerLevel * (level - 1),
      attackBonus: baseAttackBonus + proficiencyBonus
    };
  }

  calculateHitChance(attackBonus: number, targetAC: number): number {
    const rollNeeded = Math.max(2, Math.min(20, targetAC - attackBonus));
    return Math.max(0.05, Math.min(0.95, (21 - rollNeeded) / 20));
  }

  calculateEffectiveDPR(baseDPR: number, hitChance: number): number {
    return baseDPR * hitChance;
  }

  calculateRoundsToDefeat(totalHP: number, effectiveDPR: number): number {
    if (effectiveDPR <= 0) return 999;
    return Math.max(1, Math.ceil(totalHP / effectiveDPR));
  }

  /**
   * Detect if trap effect text indicates area-of-effect (multiple targets)
   */
  detectAoETargets(effectText: string): number {
    if (!effectText) return 1;
    
    const text = effectText.toLowerCase();
    
    // Strong AoE indicators - likely hits all party members
    const strongAoE = [
      'each creature',
      'all creatures',
      'any creature',
      'creatures in the',
      'everyone in',
      'all targets',
      'each target',
      'all characters'
    ];
    
    for (const indicator of strongAoE) {
      if (text.includes(indicator)) {
        console.log(`[AoE Detection] Strong AoE indicator found: "${indicator}" - assuming 4 targets`);
        return 4; // Average party size
      }
    }
    
    // Area indicators with size
    const areaPatterns = [
      /(\d+)-foot (radius|cone|cube|line|sphere|cylinder)/,
      /(\d+)-foot.{0,20}(radius|cone|cube|line|sphere|cylinder)/,
      /within (\d+) feet/
    ];
    
    for (const pattern of areaPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const size = parseInt(match[1]);
        // Estimate targets based on area size
        let targets = 1;
        if (size >= 30) targets = 4; // Large area
        else if (size >= 20) targets = 3; // Medium area
        else if (size >= 10) targets = 2; // Small area
        console.log(`[AoE Detection] ${size}-foot area detected - assuming ${targets} targets`);
        return targets;
      }
    }
    
    // Moderate AoE indicators - likely hits 2-3 characters
    const moderateAoE = [
      'creatures within',
      'multiple targets',
      'targets within',
      'nearby creatures',
      'adjacent creatures'
    ];
    
    for (const indicator of moderateAoE) {
      if (text.includes(indicator)) {
        console.log(`[AoE Detection] Moderate AoE indicator found: "${indicator}" - assuming 2 targets`);
        return 2;
      }
    }
    
    // Single target indicators
    const singleTarget = [
      'one target',
      'one creature',
      'single target',
      'the target',
      'a target'
    ];
    
    for (const indicator of singleTarget) {
      if (text.includes(indicator)) {
        console.log(`[AoE Detection] Single target indicator found: "${indicator}"`);
        return 1;
      }
    }
    
    // No clear indicators - check if it mentions targeting at all
    if (text.includes('target') || text.includes('creature')) {
      console.log(`[AoE Detection] Generic targeting text - assuming 2 targets (conservative)`);
      return 2; // Conservative estimate for unclear traps
    }
    
    console.log(`[AoE Detection] No targeting indicators - assuming 1 target`);
    return 1;
  }

  /**
   * Calculate trap stats for encounter difficulty
   * Traps are treated as hostile entities that deal damage but have different mechanics
   */
  calculateTrapStats(trapData: {
    elements: TrapElement[];
    threatLevel: 'setback' | 'dangerous' | 'deadly';
    trapType: 'simple' | 'complex';
  }): { hp: number; ac: number; dpr: number; attackBonus: number; cr: string } {
    
    console.log(`[Trap Stats] Starting calculation for ${trapData.trapType} trap, threat: ${trapData.threatLevel}`);
    console.log(`[Trap Stats] Elements count: ${trapData.elements?.length || 0}`);
    
    let totalDamage = 0;
    let maxDC = 0;
    let maxAttackBonus = 0;
    let elementCount = 0;
    let maxAoETargets = 1;

    // Parse damage from each element and detect AoE
    for (const element of trapData.elements) {
      console.log(`[Trap Stats] Processing element: ${element.name}`);
      
      if (element.damage) {
        const avgDamage = this.parseTrapDamage(element.damage);
        console.log(`[Trap Stats] - Damage: ${element.damage} → ${avgDamage} avg`);
        totalDamage += avgDamage;
        elementCount++;
      }

      if (element.additional_damage) {
        const additionalDmg = this.parseTrapDamage(element.additional_damage);
        console.log(`[Trap Stats] - Additional damage: ${element.additional_damage} → ${additionalDmg} avg`);
        totalDamage += additionalDmg;
      }

      if (element.save_dc && element.save_dc > maxDC) {
        maxDC = element.save_dc;
        console.log(`[Trap Stats] - Save DC: ${element.save_dc}`);
      }

      if (element.attack_bonus && element.attack_bonus > maxAttackBonus) {
        maxAttackBonus = element.attack_bonus;
        console.log(`[Trap Stats] - Attack bonus: ${element.attack_bonus}`);
      }
      
      // Check for AoE indicators in effect text
      if (element.effect) {
        console.log(`[Trap Stats] - Effect text: ${element.effect.substring(0, Math.min(100, element.effect.length))}...`);
        const targets = this.detectAoETargets(element.effect);
        if (targets > maxAoETargets) {
          maxAoETargets = targets;
        }
      } else {
        console.log(`[Trap Stats] - No effect text found`);
      }
    }

    // Calculate DPR (damage per round)
    // All trap elements deal their full damage (even if on different initiatives)
    // Complex traps with multiple initiatives create sustained threat, not reduced damage
    let dpr = totalDamage;

    // Multiply DPR by number of targets for AoE traps
    if (maxAoETargets > 1) {
      console.log(`[Trap Stats] AoE trap detected - multiplying DPR by ${maxAoETargets} targets`);
      dpr *= maxAoETargets;
    }

    // Apply threat level modifier to DPR
    if (trapData.threatLevel === 'dangerous') {
      dpr *= 1.25;
    } else if (trapData.threatLevel === 'deadly') {
      dpr *= 1.5;
    } else if (trapData.threatLevel === 'setback') {
      dpr *= 0.75;
    }

    // Determine attack bonus or save DC for hit chance calculation
    // Prefer attack bonus if present, otherwise derive from save DC
    const attackBonus = maxAttackBonus > 0 
      ? maxAttackBonus 
      : maxDC > 0 
        ? Math.floor((maxDC - 8) / 0.8) // Approximate attack bonus from DC
        : 5; // Default moderate attack bonus

    // Traps have high AC (hard to damage) but can be disabled
    // AC 15-20 depending on complexity and threat level
    let ac = 15;
    if (trapData.trapType === 'complex') ac += 2;
    if (trapData.threatLevel === 'dangerous') ac += 1;
    if (trapData.threatLevel === 'deadly') ac += 2;

    // Traps have limited HP (they're not creatures)
    // HP represents how much effort to disable/destroy
    // Base HP is proportional to DPR and threat level
    let hp = Math.max(1, Math.floor(dpr * 2));
    if (trapData.threatLevel === 'dangerous') hp *= 1.5;
    if (trapData.threatLevel === 'deadly') hp *= 2;

    // Estimate CR based on DPR
    let estimatedCR = this.estimateCRFromDPR(dpr);
    
    // Adjust CR based on save DC or attack bonus
    if (maxDC > 0 || maxAttackBonus > 0) {
      const dcOrAttack = maxDC > 0 ? maxDC : maxAttackBonus;
      const crByDC = this.estimateCRFromDC(dcOrAttack);
      estimatedCR = Math.round((estimatedCR + crByDC) / 2);
    }

    const crString = this.formatCR(estimatedCR);

    console.log(`[Trap Stats] Base Damage: ${totalDamage}, AoE Targets: ${maxAoETargets}, DPR: ${dpr.toFixed(1)}, AC: ${ac}, HP: ${hp}, Attack: ${attackBonus}, CR: ${crString}`);

    return {
      hp,
      ac,
      dpr,
      attackBonus,
      cr: crString
    };
  }

  /**
   * Parse trap damage string to average damage value
   * Examples: "4d10" -> 22, "2d6+3" -> 10, "45" -> 45
   */
  parseTrapDamage(damageStr: string | undefined): number {
    if (!damageStr) return 0;
    
    console.log(`[Damage Parser] Input: "${damageStr}"`);
    
    let cleanDamage = damageStr.trim().toLowerCase();
    
    // Remove damage type (e.g., "4d10 fire" -> "4d10")
    const parts = cleanDamage.split(' ');
    cleanDamage = parts[0] || cleanDamage;
    console.log(`[Damage Parser] After cleanup: "${cleanDamage}"`);

    // Parse dice notation FIRST: XdY+Z or XdY-Z or XdY
    const diceMatch = cleanDamage.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (diceMatch) {
      const numDice = parseInt(diceMatch[1]!);
      const dieSize = parseInt(diceMatch[2]!);
      const modifier = diceMatch[3] ? parseInt(diceMatch[3]) : 0;
      
      // Average of XdY is X * (Y+1)/2
      const avgRoll = numDice * (dieSize + 1) / 2;
      const total = Math.floor(avgRoll + modifier);
      console.log(`[Damage Parser] Dice: ${numDice}d${dieSize}${modifier >= 0 ? '+' : ''}${modifier || ''} = ${avgRoll} + ${modifier} = ${total}`);
      return total;
    }

    // Check if it's just a number (static damage)
    const staticDamage = parseInt(cleanDamage);
    if (!isNaN(staticDamage)) {
      console.log(`[Damage Parser] Parsed as static damage: ${staticDamage}`);
      return staticDamage;
    }

    console.log(`[Damage Parser] No match, returning 0`);
    return 0;
  }

  /**
   * Estimate CR from DPR using D&D 5e CR table
   */
  estimateCRFromDPR(dpr: number): number {
    const crDPRTable = [
      { cr: 0, dpr: 1 },
      { cr: 0.125, dpr: 2 },
      { cr: 0.25, dpr: 3 },
      { cr: 0.5, dpr: 5 },
      { cr: 1, dpr: 8 },
      { cr: 2, dpr: 15 },
      { cr: 3, dpr: 21 },
      { cr: 4, dpr: 27 },
      { cr: 5, dpr: 33 },
      { cr: 6, dpr: 39 },
      { cr: 7, dpr: 45 },
      { cr: 8, dpr: 51 },
      { cr: 9, dpr: 57 },
      { cr: 10, dpr: 63 },
      { cr: 11, dpr: 69 },
      { cr: 12, dpr: 75 },
      { cr: 13, dpr: 81 },
      { cr: 14, dpr: 87 },
      { cr: 15, dpr: 93 },
      { cr: 16, dpr: 99 },
      { cr: 17, dpr: 105 },
      { cr: 18, dpr: 111 },
      { cr: 19, dpr: 117 },
      { cr: 20, dpr: 123 }
    ];

    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDPRTable) {
      const diff = Math.abs(entry.dpr - dpr);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return closestCR;
  }

  /**
   * Estimate CR from save DC or attack bonus
   */
  estimateCRFromDC(dc: number): number {
    const crDCTable = [
      { cr: 0, dc: 13 },
      { cr: 1, dc: 13 },
      { cr: 2, dc: 13 },
      { cr: 3, dc: 13 },
      { cr: 4, dc: 14 },
      { cr: 5, dc: 15 },
      { cr: 8, dc: 16 },
      { cr: 11, dc: 17 },
      { cr: 13, dc: 18 },
      { cr: 17, dc: 19 },
      { cr: 21, dc: 20 },
      { cr: 24, dc: 21 },
      { cr: 27, dc: 22 },
      { cr: 29, dc: 23 },
      { cr: 30, dc: 24 }
    ];

    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDCTable) {
      const diff = Math.abs(entry.dc - dc);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return closestCR;
  }

  /**
   * Format CR as string (handles fractional CRs)
   */
  formatCR(cr: number): string {
    if (cr === 0.125) return "1/8";
    if (cr === 0.25) return "1/4";
    if (cr === 0.5) return "1/2";
    return cr.toString();
  }

  /**
   * Parse statblock YAML to extract real combat stats
   * Returns hp, ac, dpr (damage per round), and attackBonus
   */
  async parseStatblockStats(filePath: string): Promise<{ hp: number; ac: number; dpr: number; attackBonus: number } | null> {
    try {
      console.log(`[Parser] Reading file: ${filePath}`);
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        console.log(`[Parser] File not found or not a TFile`);
        return null;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) {
        console.log(`[Parser] No frontmatter found`);
        return null;
      }

      const fm = cache.frontmatter;
      console.log(`[Parser] Frontmatter keys:`, Object.keys(fm));
      
      // Extract basic stats
      const hp = this.parseHP(fm.hp);
      const ac = this.parseAC(fm.ac);
      console.log(`[Parser] Parsed HP: ${hp}, AC: ${ac}`);
      
      // Calculate DPR and attack bonus from actions
      let totalDPR = 0;
      let highestAttackBonus = 0;
      let attackCount = 0;
      
      // Check for actions array (where attacks are defined)
      if (fm.actions && Array.isArray(fm.actions)) {
        console.log(`[Parser] Found ${fm.actions.length} actions`);
        
        for (const action of fm.actions) {
          if (!action.name) continue;
          console.log(`[Parser] Action: "${action.name}"`);
          
          // === CHECK STRUCTURED FIELDS FIRST ===
          let actionDPR = 0;
          let actionAttackBonus = 0;
          let usedStructuredData = false;
          
          // Check for attack_bonus field
          if (typeof action.attack_bonus === 'number') {
            actionAttackBonus = action.attack_bonus;
            if (actionAttackBonus > highestAttackBonus) {
              highestAttackBonus = actionAttackBonus;
            }
            console.log(`[Parser] Found structured attack_bonus: ${actionAttackBonus}`);
            usedStructuredData = true;
          }
          
          // Check for damage_dice and damage_bonus fields
          if (action.damage_dice || action.damage_bonus) {
            console.log(`[Parser] Found structured damage fields: dice="${action.damage_dice}", bonus="${action.damage_bonus}"`);
            
            // Parse damage_dice (e.g., "1d6" or "2d8")
            let diceDamage = 0;
            if (action.damage_dice && typeof action.damage_dice === 'string') {
              const diceMatch = action.damage_dice.match(/(\d+)d(\d+)/i);
              if (diceMatch) {
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                diceDamage = numDice * ((dieSize + 1) / 2); // Average of dice
                console.log(`[Parser] Calculated dice damage: ${numDice}d${dieSize} = ${diceDamage}`);
              }
            }
            
            // Add damage bonus
            let damageBonus = 0;
            if (typeof action.damage_bonus === 'number') {
              damageBonus = action.damage_bonus;
            } else if (typeof action.damage_bonus === 'string') {
              damageBonus = parseInt(action.damage_bonus) || 0;
            }
            
            actionDPR = diceDamage + damageBonus;
            console.log(`[Parser] Calculated structured damage: ${diceDamage} + ${damageBonus} = ${actionDPR}`);
            
            if (actionDPR > 0) {
              totalDPR += actionDPR;
              attackCount++;
              usedStructuredData = true;
            }
          }
          
          // If we successfully used structured data, skip text parsing for this action
          if (usedStructuredData) {
            console.log(`[Parser] Used structured data for ${action.name}, DPR=${actionDPR}, Attack=${actionAttackBonus}`);
            continue;
          }
          
          // === FALLBACK TO TEXT PARSING ===
          if (action.desc && typeof action.desc === 'string') {
            const desc = action.desc;
            console.log(`[Parser] Description: ${desc.substring(0, 100)}...`);
            
            // Look for attack bonus
            const attackMatch = desc.match(/[+\-]\d+\s+to\s+hit/i);
            if (attackMatch) {
              const bonusMatch = attackMatch[0].match(/[+\-]\d+/);
              if (bonusMatch) {
                attackCount++;
                const bonus = parseInt(bonusMatch[0]);
                console.log(`[Parser] Found attack bonus: ${bonus}`);
                if (bonus > highestAttackBonus) highestAttackBonus = bonus;
              }
            }
            
            // Look for damage
            let damageFound = false;
            const avgDamageMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/i);
            if (avgDamageMatch) {
              const avgDamage = parseInt(avgDamageMatch[1]);
              console.log(`[Parser] Found pre-calculated damage: ${avgDamage}`);
              totalDPR += avgDamage;
              damageFound = true;
              if (!attackMatch) attackCount++;
            } else {
              const diceMatch = desc.match(/(\d+)d(\d+)\s*([+\-]?\s*\d+)?/i);
              if (diceMatch) {
                if (!attackMatch) attackCount++;
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                const modifier = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, '')) : 0;
                const avgDamage = Math.floor(numDice * (dieSize + 1) / 2) + modifier;
                console.log(`[Parser] Calculated damage from ${diceMatch[0]}: ${avgDamage}`);
                totalDPR += avgDamage;
                damageFound = true;
              }
            }
            
            if (!damageFound) {
              console.log(`[Parser] No damage found in action`);
            }
          }
        }
      } else {
        console.log(`[Parser] No actions array found`);
      }
      
      console.log(`[Parser] Total DPR before multiattack: ${totalDPR}`);
      
      // Check for multiattack
      let multiattackMultiplier = 1;
      if (fm.actions && Array.isArray(fm.actions)) {
        const multiattack = fm.actions.find((a: any) => 
          a.name && a.name.toLowerCase().includes('multiattack')
        );
        
        if (multiattack?.desc) {
          console.log(`[Parser] Multiattack found: ${multiattack.desc}`);
          const countMatch = multiattack.desc.match(/makes?\s+(two|three|four|five|\d+)\s+.*?attack/i);
          if (countMatch) {
            const countStr = countMatch[1].toLowerCase();
            const countMap: Record<string, number> = { 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
            multiattackMultiplier = countMap[countStr] || parseInt(countStr) || 1;
            console.log(`[Parser] Multiattack multiplier: ${multiattackMultiplier}`);
          }
        }
      }
      
      // Apply multiattack multiplier
      if (totalDPR > 0 && multiattackMultiplier > 1) {
        console.log(`[Parser] Applying multiattack multiplier ${multiattackMultiplier} to DPR ${totalDPR}`);
        totalDPR *= multiattackMultiplier;
        console.log(`[Parser] Final DPR after multiattack: ${totalDPR}`);
      }
      
      // If we couldn't parse DPR, return null to fall back to CR estimates
      if (totalDPR === 0) {
        console.log(`[Parser] No DPR found, returning null to use CR estimates`);
        return null;
      }
      
      // Use a reasonable default attack bonus if we couldn't parse it
      if (highestAttackBonus === 0) {
        highestAttackBonus = Math.max(2, Math.floor(totalDPR / 5));
        console.log(`[Parser] No attack bonus found, estimating ${highestAttackBonus} based on DPR`);
      }
      
      const result = {
        hp: hp || 1,
        ac: ac || 10,
        dpr: totalDPR,
        attackBonus: highestAttackBonus
      };
      console.log(`[Parser] SUCCESS: Returning`, result);
      return result;
    } catch (error) {
      console.error("[Parser] Error parsing statblock:", filePath, error);
      return null;
    }
  }

  /**
   * Parse HP from various formats: "45 (6d10+12)" or just "45"
   */
  parseHP(hpStr: any): number {
    if (typeof hpStr === 'number') return hpStr;
    if (typeof hpStr !== 'string') return 0;
    
    const match = hpStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 0;
  }

  /**
   * Parse AC from various formats: "13 (natural armor)" or just "13" or number
   */
  parseAC(acStr: any): number {
    if (typeof acStr === 'number') return acStr;
    if (typeof acStr !== 'string') return 10;
    
    const match = acStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 10;
  }

  /**
   * Consolidate trap elements (creatures with [SRD] path and initiative numbers)
   * into single trap entities with trapData loaded from trap files
   */
  async consolidateTrapElements(): Promise<void> {
    const trapGroups = new Map<string, any[]>();
    const nonTraps: any[] = [];
    
    // Group creatures by trap name (before the "Initiative" part)
    for (const creature of this.creatures) {
      // Check if this looks like a trap element: has [SRD] path and name with "Initiative"
      if (creature.path === "[SRD]" && creature.name.includes("(Initiative")) {
        const baseName = creature.name.replace(/\s*\(Initiative\s+\d+\)/, '').trim();
        if (!trapGroups.has(baseName)) {
          trapGroups.set(baseName, []);
        }
        trapGroups.get(baseName)!.push(creature);
      } else if (!creature.isTrap) {
        // Keep non-trap creatures as-is
        nonTraps.push(creature);
      } else {
        // Already a proper trap with trapData
        nonTraps.push(creature);
      }
    }
    
    // Find and load trap files for each trap group
    const consolidatedTraps: any[] = [];
    for (const [trapName, elements] of trapGroups.entries()) {
      console.log(`🪤 Consolidating trap: ${trapName} (${elements.length} elements)`);
      
      // Search for the trap file
      let trapFile: TFile | null = null;
      for (const file of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type === 'trap' && 
            (cache.frontmatter.trap_name === trapName || file.basename === trapName)) {
          trapFile = file;
          break;
        }
      }
      
      if (trapFile) {
        try {
          const trapCache = this.app.metadataCache.getFileCache(trapFile);
          if (trapCache?.frontmatter) {
            const fm = trapCache.frontmatter;
            const consolidatedTrap = {
              name: trapName,
              count: 1,
              isTrap: true,
              trapData: {
                trapType: fm.trap_type || "complex",
                threatLevel: fm.threat_level || "dangerous",
                elements: fm.elements || []
              },
              // Preserve manual overrides from first element if any
              hp: elements[0].hp,
              ac: elements[0].ac,
              cr: elements[0].cr,
              path: trapFile.path
            };
            consolidatedTraps.push(consolidatedTrap);
            console.log(`✅ Consolidated ${trapName} from ${elements.length} elements`);
          }
        } catch (error) {
          console.error(`Error loading trap file for ${trapName}:`, error);
          // If we can't load the trap, keep the elements as regular creatures
          nonTraps.push(...elements);
        }
      } else {
        console.warn(`⚠️ No trap file found for ${trapName}, keeping as separate creatures`);
        nonTraps.push(...elements);
      }
    }
    
    // Replace creatures array with consolidated version
    this.creatures = [...nonTraps, ...consolidatedTraps];
    console.log(`📊 Consolidated ${trapGroups.size} traps, ${nonTraps.length} other creatures`);
  }

  async calculateEncounterDifficulty(): Promise<any> {
    // First, consolidate any trap elements
    await this.consolidateTrapElements();
    
    // Calculate enemy stats with real statblock data when available
    let enemyTotalHP = 0;
    let enemyTotalAC = 0;
    let enemyTotalDPR = 0;
    let enemyTotalAttackBonus = 0;
    let enemyCount = 0;
    
    console.log("=== ENCOUNTER DIFFICULTY CALCULATION (EncounterBuilder) ===");
    
    for (const creature of this.creatures) {
      const count = creature.count || 1;
      
      console.log(`\n--- Creature: ${creature.name} (x${count}) ---`);
      console.log(`Path: ${creature.path || 'none'}`);
      console.log(`CR: ${creature.cr || 'unknown'}`);
      console.log(`Is Trap: ${creature.isTrap || false}`);
      
      // Handle traps differently from creatures
      if (creature.isTrap && creature.trapData) {
        console.log(`🪤 TRAP DETECTED - Using trap-specific calculation`);
        const trapStats = await this.calculateTrapStats(creature.trapData);
        console.log(`Trap stats:`, trapStats);
        
        const hp = trapStats.hp;
        const ac = trapStats.ac;
        const dpr = trapStats.dpr;
        const attackBonus = trapStats.attackBonus;
        
        console.log(`Final trap stats: HP=${hp}, AC=${ac}, DPR=${dpr}, Attack=${attackBonus}, Effective CR=${trapStats.cr}`);
        console.log(`Total contribution (x${count}): HP=0 (traps don't contribute to HP pool), DPR=${dpr * count}`);
        
        // Traps don't add to HP pool (they're hazards, not damage sponges)
        // But they DO contribute DPR, AC (for difficulty calculation), and count as threats
        enemyTotalAC += ac * count;
        enemyTotalDPR += dpr * count;
        enemyTotalAttackBonus += attackBonus * count;
        enemyCount += count;
        continue;
      }
      
      // Try to get real stats from statblock if available
      let realStats = null;
      if (creature.path && typeof creature.path === 'string') {
        console.log(`Attempting to parse statblock: ${creature.path}`);
        realStats = await this.parseStatblockStats(creature.path);
        console.log(`Parsed stats:`, realStats);
      } else {
        console.log(`No valid path, using CR estimates`);
      }
      
      // Fall back to CR-based estimates if no statblock or parsing failed
      const crStats = this.getCRStats(creature.cr);
      console.log(`CR-based fallback stats:`, crStats);
      
      const hp = creature.hp || realStats?.hp || crStats.hp;
      const ac = creature.ac || realStats?.ac || crStats.ac;
      const dpr = realStats?.dpr || crStats.dpr;
      const attackBonus = realStats?.attackBonus || crStats.attackBonus;
      
      const dprSource = realStats?.dpr ? '📊 STATBLOCK' : '📖 CR_TABLE';
      const hpSource = realStats?.hp ? '📊 STATBLOCK' : creature.hp ? '✏️ MANUAL' : '📖 CR_TABLE';
      const acSource = realStats?.ac ? '📊 STATBLOCK' : creature.ac ? '✏️ MANUAL' : '📖 CR_TABLE';
      
      console.log(`Final stats used: HP=${hp} (${hpSource}), AC=${ac} (${acSource}), DPR=${dpr} (${dprSource}), Attack=${attackBonus}`);
      console.log(`Total contribution (x${count}): HP=${hp * count}, DPR=${dpr * count}`);

      enemyTotalHP += hp * count;
      enemyTotalAC += ac * count;
      enemyTotalDPR += dpr * count;
      enemyTotalAttackBonus += attackBonus * count;
      enemyCount += count;
    }
    
    console.log(`\n=== TOTALS ===`);
    console.log(`Total Enemies: ${enemyCount}`);
    console.log(`Total Enemy HP: ${enemyTotalHP}`);
    console.log(`Total Enemy DPR: ${enemyTotalDPR}`);
    console.log(`Average Enemy AC: ${enemyCount > 0 ? (enemyTotalAC / enemyCount).toFixed(1) : 0}`);
    console.log(`Average Enemy Attack Bonus: ${enemyCount > 0 ? (enemyTotalAttackBonus / enemyCount).toFixed(1) : 0}`)

    const avgEnemyAC = enemyCount > 0 ? enemyTotalAC / enemyCount : 13;
    const avgEnemyAttackBonus = enemyCount > 0 ? enemyTotalAttackBonus / enemyCount : 3;

    // Get party stats
    const partyMembers = await this.getPartyForDifficulty();

    let partyTotalHP = 0;
    let partyTotalAC = 0;
    let partyTotalDPR = 0;
    let partyTotalAttackBonus = 0;
    let totalLevel = 0;

    for (const member of partyMembers) {
      const levelStats = this.getLevelStats(member.level);

      const memberHP = Number(member.hp) || 0;
      const memberAC = Number(member.ac) || 0;

      partyTotalHP += memberHP > 0 ? memberHP : levelStats.hp;
      partyTotalAC += memberAC > 0 ? memberAC : levelStats.ac;
      partyTotalDPR += levelStats.dpr;
      partyTotalAttackBonus += levelStats.attackBonus;
      totalLevel += member.level;
    }

    const memberCount = partyMembers.length;

    let avgPartyAC: number;
    let avgPartyAttackBonus: number;
    let avgLevel: number;

    if (memberCount > 0) {
      avgPartyAC = partyTotalAC / memberCount;
      avgPartyAttackBonus = partyTotalAttackBonus / memberCount;
      avgLevel = totalLevel / memberCount;
    } else {
      const defaultStats = this.getLevelStats(3);
      partyTotalHP = defaultStats.hp * 4;
      partyTotalDPR = defaultStats.dpr * 4;
      avgPartyAC = defaultStats.ac;
      avgPartyAttackBonus = defaultStats.attackBonus;
      avgLevel = 3;
    }

    // Calculate hit chances
    const partyHitChance = this.calculateHitChance(avgPartyAttackBonus, avgEnemyAC);
    const enemyHitChance = this.calculateHitChance(avgEnemyAttackBonus, avgPartyAC);

    // Calculate effective DPR
    const partyEffectiveDPR = this.calculateEffectiveDPR(partyTotalDPR, partyHitChance);
    const enemyEffectiveDPR = this.calculateEffectiveDPR(enemyTotalDPR, enemyHitChance);

    // Calculate rounds to defeat
    const roundsToDefeatEnemies = this.calculateRoundsToDefeat(enemyTotalHP, partyEffectiveDPR);
    const roundsToDefeatParty = this.calculateRoundsToDefeat(partyTotalHP, enemyEffectiveDPR);

    // Survival ratio
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;

    // Determine difficulty
    let difficulty: string;
    let difficultyColor: string;

    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) {
      difficulty = "Trivial";
      difficultyColor = "#888888";
    } else if (survivalRatio >= 2.5) {
      difficulty = "Easy";
      difficultyColor = "#00aa00";
    } else if (survivalRatio >= 1.5) {
      difficulty = "Medium";
      difficultyColor = "#aaaa00";
    } else if (survivalRatio >= 1.0) {
      difficulty = "Hard";
      difficultyColor = "#ff8800";
    } else if (survivalRatio >= 0.6) {
      difficulty = "Deadly";
      difficultyColor = "#ff0000";
    } else {
      difficulty = "TPK Risk";
      difficultyColor = "#880000";
    }

    // Generate summary
    let summary = "";
    if (partyMembers.length === 0) {
      summary = `⚠️ No party found. Using default 4-player party (Level 3).\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
    } else {
      summary = `Party: ${memberCount} members (Avg Level ${avgLevel.toFixed(1)})\n`;
      summary += `Enemies: ${enemyCount} creatures\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}`;
    }

    return {
      enemyStats: {
        totalHP: enemyTotalHP,
        avgAC: avgEnemyAC,
        totalDPR: enemyTotalDPR,
        avgAttackBonus: avgEnemyAttackBonus,
        creatureCount: enemyCount
      },
      partyStats: {
        totalHP: partyTotalHP,
        avgAC: avgPartyAC,
        totalDPR: partyTotalDPR,
        avgAttackBonus: avgPartyAttackBonus,
        memberCount: memberCount,
        avgLevel: avgLevel
      },
      analysis: {
        partyHitChance,
        enemyHitChance,
        partyEffectiveDPR,
        enemyEffectiveDPR,
        roundsToDefeatEnemies,
        roundsToDefeatParty,
        survivalRatio,
        difficulty,
        difficultyColor,
        summary
      }
    };
  }

  async searchVaultCreatures(query: string): Promise<Array<{ name: string; path: string; hp: number; ac: number; cr?: string }>> {
    const creatures: Array<{ name: string; path: string; hp: number; ac: number; cr?: string }> = [];

    // Check multiple possible creature/monster folder locations
    const possiblePaths = [
      "z_Beastiarity",
      "My Vault/z_Beastiarity",
      "nvdh-ttrpg-vault/monsters",
      "monsters"
    ];

    const beastiaryFolders: TFolder[] = [];
    for (const path of possiblePaths) {
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (folder instanceof TFolder) {
        beastiaryFolders.push(folder);
      }
    }

    if (beastiaryFolders.length === 0) return creatures;

    const queryLower = query.toLowerCase();

    // Recursively search all files in beastiary
    const searchFolder = async (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
          try {
            const cache = this.app.metadataCache.getFileCache(child);

            // Check if file has statblock
            if (cache?.frontmatter && cache.frontmatter.statblock === true) {
              const name = cache.frontmatter.name || child.basename;

              // Filter by query
              if (!query || name.toLowerCase().includes(queryLower)) {
                creatures.push({
                  name: name,
                  path: child.path,
                  hp: cache.frontmatter.hp || 1,
                  ac: cache.frontmatter.ac || 10,
                  cr: cache.frontmatter.cr?.toString() || undefined
                });
              }
            }
          } catch (error) {
            console.error(`Error reading creature file ${child.path}:`, error);
          }
        } else if (child instanceof TFolder) {
          await searchFolder(child);
        }
      }
    };

    // Search all found beastiary folders
    for (const folder of beastiaryFolders) {
      await searchFolder(folder);
    }

    // Sort alphabetically
    creatures.sort((a, b) => a.name.localeCompare(b.name));

    return creatures;
  }

  async loadAllCreatures(): Promise<Array<{ name: string; path: string; hp: number; ac: number; cr?: string }>> {
    const vaultCreatures = await this.searchVaultCreatures("");
    const statblocksCreatures = await this.getStatblocksPluginCreatures();

    // Merge and deduplicate by name (vault takes priority)
    const allCreatures = [...vaultCreatures];
    const vaultNames = new Set(vaultCreatures.map(c => c.name.toLowerCase()));

    for (const creature of statblocksCreatures) {
      if (!vaultNames.has(creature.name.toLowerCase())) {
        allCreatures.push(creature);
      }
    }

    // Sort alphabetically
    allCreatures.sort((a, b) => a.name.localeCompare(b.name));

    return allCreatures;
  }

  async getStatblocksPluginCreatures(): Promise<Array<{ name: string; path: string; hp: number; ac: number; cr?: string }>> {
    const creatures: Array<{ name: string; path: string; hp: number; ac: number; cr?: string }> = [];

    try {
      const statblocksPlugin = (this.app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
      if (!statblocksPlugin) {
        console.log("5e Statblocks plugin not found");
        return creatures;
      }

      let bestiaryCreatures: any[] = [];

      if (statblocksPlugin.api?.getBestiaryCreatures) {
        const apiCreatures = statblocksPlugin.api.getBestiaryCreatures();
        if (Array.isArray(apiCreatures)) {
          bestiaryCreatures = apiCreatures;
        }
      }

      if (bestiaryCreatures.length === 0 && statblocksPlugin.data?.monsters) {
        const monstersData = statblocksPlugin.data.monsters;
        if (Array.isArray(monstersData)) {
          bestiaryCreatures = monstersData;
        } else if (typeof monstersData === "object") {
          bestiaryCreatures = Object.values(monstersData);
        }
      }

      if (bestiaryCreatures.length === 0) {
        console.log("No creatures found via Statblocks API or data.monsters");
        return creatures;
      }

      console.log(`Loading ${bestiaryCreatures.length} creatures from 5e Statblocks plugin`);

      for (const monster of bestiaryCreatures) {
        if (!monster || typeof monster !== "object") continue;

        creatures.push({
          name: monster.name || "Unknown",
          path: monster.path || "[SRD]",
          hp: monster.hp || 1,
          ac: typeof monster.ac === "number" ? monster.ac : (parseInt(monster.ac) || 10),
          cr: monster.cr?.toString() || undefined
        });
      }

      console.log(`Loaded ${creatures.length} creatures from 5e Statblocks plugin`);
      if (creatures.length > 0) {
        console.log("First 5 creatures:", creatures.slice(0, 5).map(c => c.name));
      }
    } catch (error) {
      console.error("Error accessing 5e Statblocks plugin creatures:", error);
    }

    return creatures;
  }

  async createInitiativeTrackerEncounter(scenePath: string) {
    if (this.creatures.length === 0) return;

    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin) {
        new Notice("⚠️ Initiative Tracker plugin not found. Encounter data saved to scene frontmatter only.");
        console.log("Initiative Tracker plugin not found");
        return;
      }

      console.log("Initiative Tracker plugin found:", initiativePlugin);
      console.log("Available properties:", Object.keys(initiativePlugin));

      // Debug: Log creature data before building encounter
      console.log("Creatures to add:", this.creatures);

      // Helper function to generate unique IDs like Initiative Tracker does
      const generateId = () => {
        const chars = '0123456789abcdef';
        let id = 'ID_';
        for (let i = 0; i < 12; i++) {
          id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
      };

      // Color names for duplicate creatures
      const colors = [
        "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
        "Pink", "Brown", "Black", "White", "Gray", "Cyan",
        "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold",
        "Silver", "Bronze"
      ];

      // Get campaign party members if requested
      let partyMembers: any[] = [];
      if (this.includeParty) {
        partyMembers = await this.getCampaignPartyMembers(initiativePlugin);
      }

      // Build creature data in Initiative Tracker format
      const creatures = this.creatures.flatMap(c => {
        console.log(`Building creature: ${c.name}, HP: ${c.hp}, AC: ${c.ac}`);
        const instances = [];
        for (let i = 0; i < c.count; i++) {
          const hp = c.hp || 1;
          const ac = c.ac || 10;

          // Determine name and display based on useColorNames setting
          // IMPORTANT: 'name' must be unique to prevent auto-numbering
          // 'display' is used for visual representation in the tracker
          // Initiative Tracker will auto-number duplicate names
          let creatureName = c.name;  // Start with base name for bestiary lookup
          let displayName = c.name;  // Always show at least the creature name

          if (c.count > 1 && this.useColorNames) {
            const colorIndex = i % colors.length;
            // Make name unique to prevent Initiative Tracker from auto-numbering
            creatureName = `${c.name} (${colors[colorIndex]})`;
            displayName = creatureName;
          }
          // For single creatures or multiple without colors, name and display are just the creature name
          // Initiative Tracker will add numbers automatically for duplicates

          const creature = {
            name: creatureName,  // Unique name for each creature instance
            display: displayName,  // Display name (always has a value now)
            initiative: 0,
            static: false,
            modifier: 0,  // Initiative modifier
            hp: hp,
            currentMaxHP: hp,  // Initiative Tracker uses currentMaxHP, not max
            cr: c.cr || undefined,
            ac: ac,  // AC as number
            currentAC: ac,  // Initiative Tracker also tracks currentAC
            id: generateId(),  // CRITICAL: Unique ID for each creature instance
            currentHP: hp,  // Initiative Tracker uses currentHP, not hp
            tempHP: 0,  // Initiative Tracker uses tempHP, not temp
            status: [],  // Array of status effects
            enabled: true,
            active: false,  // Whether this creature is currently active in turn order
            hidden: false,  // Hidden from players
            friendly: false,  // Friendly to players
            rollHP: false,  // Whether to roll HP when adding to tracker
            note: c.path || "",  // Path to statblock file for Fantasy Statblock plugin
            path: c.path || ""   // Also store path field for compatibility
          };
          console.log(`Created creature instance:`, creature);
          instances.push(creature);
        }
        return instances;
      });

      // Save encounter to Initiative Tracker's data.encounters for later loading
      if (initiativePlugin.data && typeof initiativePlugin.data.encounters === 'object') {
        console.log("Saving encounter to Initiative Tracker data...");

        // Combine party members and creatures
        const allCombatants = [...partyMembers, ...creatures];

        // Initiative Tracker stores encounters as: data.encounters[name] = { creatures, state, name, round, ... }
        initiativePlugin.data.encounters[this.encounterName] = {
          creatures: allCombatants,
          state: false,
          name: this.encounterName,
          round: 1,
          logFile: null,
          rollHP: false
        };

        // Save settings to persist the encounter
        if (initiativePlugin.saveSettings) {
          await initiativePlugin.saveSettings();
          console.log(`Encounter "${this.encounterName}" saved to Initiative Tracker`);
          new Notice(`✅ Encounter "${this.encounterName}" saved! Use "Load Encounter" in Initiative Tracker to start combat.`);
        }
      } else {
        console.log("Could not access Initiative Tracker data structure");
        new Notice(`⚠️ Encounter data saved to scene frontmatter only. Load manually in Initiative Tracker.`);
      }

      // Link encounter to scene
      await this.linkEncounterToScene(scenePath);

    } catch (error) {
      console.error("Error creating Initiative Tracker encounter:", error);
      new Notice("⚠️ Could not save encounter to Initiative Tracker. Check console for details.");
    }
  }

  async getCampaignPartyMembers(initiativePlugin: any): Promise<any[]> {
    try {
      // Get campaign name from adventure path
      const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
      if (!(adventureFile instanceof TFile)) return [];

      const adventureContent = await this.app.vault.read(adventureFile);
      const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
      const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');

      // Find the campaign's party
      const party = this.resolveParty(initiativePlugin, campaignName);

      if (!party || !party.players || party.players.length === 0) {
        console.log(`No party found for campaign "${campaignName}"`);
        return [];
      }

      // Get all player data for party members
      const partyMembers: any[] = [];
      const players = this.getPartyPlayersFromParty(initiativePlugin, party, true);
      for (const player of players) {
        partyMembers.push({
          ...player,
          initiative: 0,
          active: false,
          enabled: true
        });
      }

      console.log(`Found ${partyMembers.length} party members for "${campaignName}"`);
      return partyMembers;
    } catch (error) {
      console.error("Error fetching party members:", error);
      return [];
    }
  }

  async linkEncounterToScene(scenePath: string) {
    try {
      const sceneFile = this.app.vault.getAbstractFileByPath(scenePath);
      if (!(sceneFile instanceof TFile)) return;

      let content = await this.app.vault.read(sceneFile);

      // Update tracker_encounter field in frontmatter
      content = content.replace(
        /^tracker_encounter:\s*$/m,
        `tracker_encounter: "${this.encounterName}"`
      );

      await this.app.vault.modify(sceneFile, content);

    } catch (error) {
      console.error("Error linking encounter to scene:", error);
    }
  }
}

class SceneCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  encounterBuilder: EncounterBuilder;
  adventurePath = "";
  campaignPath = "";  // Track campaign for party resolution
  sceneName = "";
  act = "1";
  sceneNumber = "1";
  duration = "30min";
  type = "exploration";
  difficulty = "medium";
  
  // Encounter builder properties
  createEncounter = false;
  encounterName = "";
  useColorNames = false;
  includeParty = true;  // Include party members in encounter
  selectedPartyMembers: string[] = [];  // Selected party member names
  selectedPartyId = "";
  selectedPartyName = "";
  creatures: Array<{
    name: string;
    count: number;
    hp?: number;
    ac?: number;
    cr?: string;
    source?: string;
    path?: string;  // Path to creature file for statblock plugin
  }> = [];
  
  // UI state
  encounterSection: HTMLElement | null = null;
  difficultyContainer: HTMLElement | null = null;
  creatureListContainer: HTMLElement | null = null;
  partySelectionContainer: HTMLElement | null = null;
  partyMemberListContainer: HTMLElement | null = null;
  
  // For editing existing scenes
  isEdit = false;
  originalScenePath = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, scenePath?: string) {
    super(app);
    this.plugin = plugin;
    this.encounterBuilder = new EncounterBuilder(app, plugin);
    if (adventurePath) {
      this.adventurePath = adventurePath;
    }
    if (scenePath) {
      this.isEdit = true;
      this.originalScenePath = scenePath;
    }
  }

  async loadSceneData() {
    try {
      const sceneFile = this.app.vault.getAbstractFileByPath(this.originalScenePath);
      if (!(sceneFile instanceof TFile)) {
        new Notice("Scene file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(sceneFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read scene data!");
        return;
      }

      // Load basic scene properties
      // Extract scene name from filename (remove "Scene X - " prefix)
      let extractedName = sceneFile.basename;
      const nameMatch = sceneFile.basename.match(/^Scene\s+\d+\s+-\s+(.+)$/);
      if (nameMatch && nameMatch[1]) {
        extractedName = nameMatch[1];
      }
      
      this.sceneName = frontmatter.name || extractedName;
      this.act = String(frontmatter.act || "1");
      this.sceneNumber = String(frontmatter.scene_number || "1");
      this.duration = frontmatter.duration || "30min";
      this.type = frontmatter.scene_type || frontmatter.type || "exploration";
      this.difficulty = frontmatter.difficulty || "medium";

      // Load encounter properties if combat scene
      if (this.type === "combat") {
        this.createEncounter = !!frontmatter.tracker_encounter;
        this.encounterName = frontmatter.tracker_encounter || "";
        
        // Load creatures from encounter_creatures or YAML field
        const creaturesData = frontmatter.encounter_creatures;
        if (creaturesData && Array.isArray(creaturesData)) {
          this.creatures = await Promise.all(creaturesData.map(async (c: any) => {
            const creature: any = {
              name: c.name || "Unknown",
              count: c.count || 1,
              hp: c.hp,
              ac: c.ac,
              cr: c.cr,
              source: c.source || "vault",
              path: c.path,
              isTrap: c.is_trap || false
            };
            
            // If it's a trap, load the trap data from the trap file
            if (creature.isTrap && c.trap_path) {
              try {
                const trapFile = this.app.vault.getAbstractFileByPath(c.trap_path);
                if (trapFile instanceof TFile) {
                  const trapContent = await this.app.vault.read(trapFile);
                  const trapCache = this.app.metadataCache.getFileCache(trapFile);
                  if (trapCache?.frontmatter) {
                    const fm = trapCache.frontmatter;
                    creature.trapData = {
                      traptrapType: fm.trap_type || "simple",
                      threatLevel: fm.threat_level || "dangerous",
                      elements: fm.elements || []
                    };
                  }
                }
              } catch (error) {
                console.error(`Error loading trap data for ${creature.name}:`, error);
              }
            }
            
            return creature;
          }));
        }
        
        // Load party selection
        this.selectedPartyId = frontmatter.selected_party_id || "";
        if (frontmatter.selected_party_members && Array.isArray(frontmatter.selected_party_members)) {
          this.selectedPartyMembers = [...frontmatter.selected_party_members];
        }
        
        console.log(`[Scene Edit] Loaded party selection: id=${this.selectedPartyId}, members=${this.selectedPartyMembers.length}`);
      }

      // Extract adventure path from scene path
      // Path format: adventures/Adventure Name/Act 1 - Setup/Scene 1 - Name.md
      // or: adventures/Adventure Name - Scenes/Scene 1 - Name.md
      const pathParts = this.originalScenePath.split('/');
      let adventureIndex = -1;
      
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i] === "Adventures" || pathParts[i] === "adventures") {
          adventureIndex = i;
          break;
        }
      }
      
      if (adventureIndex >= 0 && pathParts.length > adventureIndex + 1) {
        const adventureName = pathParts[adventureIndex + 1]!.replace(/ - Scenes$/, '');
        // Try to find the adventure file
        const possiblePaths = [
          `${pathParts.slice(0, adventureIndex + 2).join('/')}/${adventureName}.md`,
          `${pathParts.slice(0, adventureIndex + 1).join('/')}/${adventureName}.md`
        ];
        
        for (const path of possiblePaths) {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            this.adventurePath = path;
            
            // Load campaignPath from adventure frontmatter
            try {
              const adventureContent = await this.app.vault.read(file);
              const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
              const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');
              this.campaignPath = `ttrpgs/${campaignName}`;
              console.log(`[Scene Edit] Loaded campaignPath: ${this.campaignPath}`);
            } catch (err) {
              console.error("Error loading campaign from adventure:", err);
            }
            
            break;
          }
        }
      }

    } catch (error) {
      console.error("Error loading scene data:", error);
      new Notice("Error loading scene data");
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Load existing scene data if editing
    if (this.isEdit) {
      await this.loadSceneData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Scene" : "🎬 Create New Scene" });

    // Get all adventures from GM campaigns
    const allAdventures = await this.getAllAdventures();

    if (allAdventures.length === 0) {
      contentEl.createEl("p", {
        text: "⚠️ No adventures found. Create an adventure first.",
        cls: "mod-warning"
      });
      
      const closeBtn = contentEl.createEl("button", { text: "Close" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }

    // Set default adventure if provided, otherwise first one
    if (!this.adventurePath && allAdventures.length > 0 && allAdventures[0]) {
      this.adventurePath = allAdventures[0].path;
    }

    contentEl.createEl("p", {
      text: "Add a new scene to your adventure. The scene will be inserted at the specified number.",
      cls: "setting-item-description"
    });

    // Adventure Selection
    new Setting(contentEl)
      .setName("Adventure")
      .setDesc("Select the adventure to add this scene to")
      .addDropdown(dropdown => {
        allAdventures.forEach(adv => {
          dropdown.addOption(adv.path, adv.name);
        });
        dropdown.setValue(this.adventurePath);
        dropdown.onChange(value => {
          this.adventurePath = value;
          // Update suggested scene number based on existing scenes
          this.updateSceneNumberSuggestion();
        });
      });

    // Scene Name
    new Setting(contentEl)
      .setName("Scene Name")
      .setDesc("Give this scene a descriptive name")
      .addText(text => text
        .setPlaceholder("e.g., Tavern Ambush")
        .setValue(this.sceneName)
        .onChange(value => this.sceneName = value));

    // Act Selection
    new Setting(contentEl)
      .setName("Act")
      .setDesc("Which act does this scene belong to?")
      .addDropdown(dropdown => dropdown
        .addOption("1", "Act 1 - Setup")
        .addOption("2", "Act 2 - Rising Action")
        .addOption("3", "Act 3 - Climax")
        .setValue(this.act)
        .onChange(value => this.act = value));

    // Scene Number
    const sceneNumberSetting = new Setting(contentEl)
      .setName("Scene Number")
      .setDesc("Position in the adventure (existing scenes will be renumbered if needed)")
      .addText(text => text
        .setPlaceholder("e.g., 5")
        .setValue(this.sceneNumber)
        .onChange(value => this.sceneNumber = value));

    // Duration
    new Setting(contentEl)
      .setName("Duration")
      .setDesc("Estimated scene duration")
      .addDropdown(dropdown => dropdown
        .addOption("15min", "15 minutes")
        .addOption("20min", "20 minutes")
        .addOption("30min", "30 minutes")
        .addOption("40min", "40 minutes")
        .addOption("45min", "45 minutes")
        .addOption("60min", "60 minutes")
        .setValue(this.duration)
        .onChange(value => this.duration = value));

    // Type
    new Setting(contentEl)
      .setName("Type")
      .setDesc("Primary scene type")
      .addDropdown(dropdown => dropdown
        .addOption("social", "🗣️ Social - NPC interactions")
        .addOption("combat", "⚔️ Combat - Fighting enemies")
        .addOption("exploration", "🔍 Exploration - Discovery & investigation")
        .addOption("puzzle", "🧩 Puzzle - Riddles & challenges")
        .addOption("montage", "🎬 Montage - Skill challenge")
        .setValue(this.type)
        .onChange(value => {
          this.type = value;
          this.showEncounterBuilderIfCombat();
        }));

    // Difficulty
    new Setting(contentEl)
      .setName("Difficulty")
      .setDesc("Challenge level")
      .addDropdown(dropdown => dropdown
        .addOption("easy", "Easy")
        .addOption("medium", "Medium")
        .addOption("hard", "Hard")
        .addOption("deadly", "Deadly")
        .setValue(this.difficulty)
        .onChange(value => this.difficulty = value));

    // Encounter Builder Section (only for combat scenes)
    this.encounterSection = contentEl.createDiv({ cls: "dnd-encounter-section" });
    this.showEncounterBuilderIfCombat();

    // Create/Update button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText(this.isEdit ? "Save Changes" : "Create Scene")
        .setCta()
        .onClick(async () => {
          if (!this.sceneName) {
            new Notice("Please enter a scene name!");
            return;
          }

          this.close();
          await this.createSceneFile();
        }));
  }

  async updateSceneNumberSuggestion() {
    const existingScenes = await this.getExistingScenes(this.adventurePath);
    const nextNumber = existingScenes.length + 1;
    this.sceneNumber = nextNumber.toString();
  }

  async getAllAdventures(): Promise<Array<{ path: string; name: string }>> {
    const adventures: Array<{ path: string; name: string }> = [];
    const gmCampaigns = await this.getAllGMCampaigns();

    for (const campaign of gmCampaigns) {
      const adventuresFolder = this.app.vault.getAbstractFileByPath(`${campaign.path}/Adventures`);
      
      if (adventuresFolder instanceof TFolder) {
        for (const item of adventuresFolder.children) {
          if (item instanceof TFile && item.extension === 'md') {
            // Adventure file directly in Adventures folder (flat structure)
            adventures.push({
              path: item.path,
              name: item.basename
            });
          } else if (item instanceof TFolder) {
            // Adventure folder with main note inside (folder structure)
            const mainFile = this.app.vault.getAbstractFileByPath(`${item.path}/${item.name}.md`);
            if (mainFile instanceof TFile) {
              adventures.push({
                path: mainFile.path,
                name: item.name
              });
            }
          }
        }
      }
    }

    return adventures;
  }

  async getAllGMCampaigns(): Promise<Array<{ path: string; name: string }>> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const gmCampaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      for (const child of ttrpgsFolder.children) {
        if (child instanceof TFolder) {
          const worldFile = this.app.vault.getAbstractFileByPath(`${child.path}/World.md`);
          if (worldFile instanceof TFile) {
            const worldContent = await this.app.vault.read(worldFile);
            const roleMatch = worldContent.match(/^role:\s*([^\r\n]\w*)$/m);
            if (roleMatch && roleMatch[1] && roleMatch[1].toLowerCase() === 'gm') {
              gmCampaigns.push({
                path: child.path,
                name: child.name
              });
            }
          }
        }
      }
    }

    return gmCampaigns;
  }

  async getExistingScenes(adventurePath: string): Promise<Array<{ path: string; number: number; name: string }>> {
    const scenes: Array<{ path: string; number: number; name: string }> = [];
    const adventureFile = this.app.vault.getAbstractFileByPath(adventurePath);
    
    if (!(adventureFile instanceof TFile)) return scenes;

    // Determine base path for scenes
    const adventureFolder = adventureFile.parent;
    if (!adventureFolder) return scenes;

    // Check for flat structure (Adventure - Scenes folder)
    const flatScenesFolder = this.app.vault.getAbstractFileByPath(
      `${adventureFolder.path}/${adventureFile.basename} - Scenes`
    );

    // Check for folder structure (Adventure/Scene files or Adventure/Act X folders)
    const folderScenesPath = `${adventureFolder.path}/${adventureFile.basename}`;
    const folderStructure = this.app.vault.getAbstractFileByPath(folderScenesPath);

    let sceneFolders: TFolder[] = [];

    if (flatScenesFolder instanceof TFolder) {
      // Flat structure
      sceneFolders.push(flatScenesFolder);
    } else if (folderStructure instanceof TFolder) {
      // Folder structure - check for Act folders or direct scenes
      for (const child of folderStructure.children) {
        if (child instanceof TFolder && child.name.startsWith("Act ")) {
          sceneFolders.push(child);
        }
      }
      // If no Act folders, the main folder contains scenes
      if (sceneFolders.length === 0) {
        sceneFolders.push(folderStructure);
      }
    }

    // Scan all scene folders for scene files
    for (const folder of sceneFolders) {
      for (const item of folder.children) {
        if (item instanceof TFile && item.extension === 'md') {
          // Extract scene number from filename: "Scene X - Name.md"
          const match = item.basename.match(/^Scene\s+(\d+)\s+-\s+(.+)$/);
          if (match && match[1] && match[2]) {
            scenes.push({
              path: item.path,
              number: parseInt(match[1]),
              name: match[2]
            });
          }
        }
      }
    }

    // Sort by scene number
    scenes.sort((a, b) => a.number - b.number);
    return scenes;
  }

  async createSceneFile() {
    try {
      const sceneNum = parseInt(this.sceneNumber);
      if (isNaN(sceneNum) || sceneNum < 1) {
        new Notice("Scene number must be a positive number!");
        return;
      }

      // Get adventure info
      const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
      if (!(adventureFile instanceof TFile)) {
        new Notice("❌ Adventure file not found!");
        return;
      }

      const adventureContent = await this.app.vault.read(adventureFile);
      const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
      const worldMatch = adventureContent.match(/^world:\s*([^\r\n]+)$/m);
      const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');
      const worldName = (worldMatch?.[1]?.trim() || campaignName).replace(/^["']|["']$/g, '');
      
      // Set campaignPath for party resolution
      this.campaignPath = `ttrpgs/${campaignName}`;

      // ====================
      // EDIT MODE: Update existing scene
      // ====================
      if (this.isEdit && this.originalScenePath) {
        new Notice(`Updating scene "${this.sceneName}"...`);
        
        const originalFile = this.app.vault.getAbstractFileByPath(this.originalScenePath);
        if (!(originalFile instanceof TFile)) {
          new Notice("❌ Original scene file not found!");
          return;
        }

        // Get original scene number from filename or frontmatter
        const originalBasename = originalFile.basename;
        const originalNumberMatch = originalBasename.match(/^Scene\s+(\d+)\s+-/);
        const originalSceneNum = (originalNumberMatch && originalNumberMatch[1]) ? parseInt(originalNumberMatch[1]) : sceneNum;

        // Check if scene number changed
        const numberChanged = originalSceneNum !== sceneNum;

        // Determine the target path
        const adventureFolder = adventureFile.parent;
        if (!adventureFolder) {
          new Notice("❌ Adventure folder not found!");
          return;
        }

        let targetPath: string;
        
        if (numberChanged) {
          // Scene number changed - need to determine new path and potentially renumber
          const flatScenesFolder = `${adventureFolder.path}/${adventureFile.basename} - Scenes`;
          const flatExists = this.app.vault.getAbstractFileByPath(flatScenesFolder) instanceof TFolder;
          const isFolderStructure = adventureFolder.name === adventureFile.basename;

          if (flatExists) {
            targetPath = `${flatScenesFolder}/Scene ${sceneNum} - ${this.sceneName}.md`;
          } else if (isFolderStructure) {
            const actFolderName = this.act === "1" ? "Act 1 - Setup" : 
                                  this.act === "2" ? "Act 2 - Rising Action" : "Act 3 - Climax";
            const actFolderPath = `${adventureFolder.path}/${actFolderName}`;
            const actFolder = this.app.vault.getAbstractFileByPath(actFolderPath);
            
            if (actFolder instanceof TFolder) {
              targetPath = `${actFolderPath}/Scene ${sceneNum} - ${this.sceneName}.md`;
            } else {
              // Check if any act folders exist
              const act1Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 1 - Setup`) instanceof TFolder;
              const act2Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 2 - Rising Action`) instanceof TFolder;
              const act3Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 3 - Climax`) instanceof TFolder;
              
              if (act1Exists || act2Exists || act3Exists) {
                await this.plugin.ensureFolderExists(actFolderPath);
                targetPath = `${actFolderPath}/Scene ${sceneNum} - ${this.sceneName}.md`;
              } else {
                targetPath = `${adventureFolder.path}/Scene ${sceneNum} - ${this.sceneName}.md`;
              }
            }
          } else {
            new Notice("❌ Could not determine scene folder structure!");
            return;
          }

          // Check if new number conflicts with existing scenes (excluding the current scene)
          const existingScenes = await this.getExistingScenes(this.adventurePath);
          const conflictingScenes = existingScenes.filter(s => 
            s.number === sceneNum && s.path !== this.originalScenePath
          );

          if (conflictingScenes.length > 0) {
            // Renumber conflicting scenes
            const scenesToRenumber = existingScenes.filter(s => 
              s.number >= sceneNum && s.path !== this.originalScenePath
            );
            await this.renumberScenes(scenesToRenumber, sceneNum);
          }
        } else {
          // Scene number didn't change - update in place, but handle name/act changes
          const parentPath = originalFile.parent?.path || "";
          targetPath = `${parentPath}/Scene ${sceneNum} - ${this.sceneName}.md`;
        }

        // Create the updated scene content
        const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
        const sceneData = {
          act: parseInt(this.act),
          num: sceneNum,
          name: this.sceneName,
          duration: this.duration,
          type: this.type,
          difficulty: this.difficulty
        };

        // Handle encounter file
        let encounterFilePath = "";
        if (this.createEncounter && this.creatures.length > 0) {
          const savedPath = await this.saveEncounterFile();
          if (savedPath) {
            encounterFilePath = savedPath;
          }
        }

        // Update or recreate the scene note
        const tempPath = targetPath + ".tmp";
        await this.createSceneNote(tempPath, sceneData, campaignName, worldName, adventureFile.basename, currentDate, encounterFilePath);

        // Read the new content
        const tempFile = this.app.vault.getAbstractFileByPath(tempPath);
        if (tempFile instanceof TFile) {
          const newContent = await this.app.vault.read(tempFile);
          await this.app.vault.delete(tempFile);

          if (originalFile.path === targetPath) {
            // Same path - just update content
            await this.app.vault.modify(originalFile, newContent);
          } else {
            // Path changed - create new and delete old
            await this.app.vault.create(targetPath, newContent);
            await this.app.vault.delete(originalFile);
          }
        }

        // Update Initiative Tracker encounter
        if (this.createEncounter && this.creatures.length > 0) {
          await this.encounterBuilder.createInitiativeTrackerEncounter(targetPath);
        }

        // Open the updated scene
        await this.app.workspace.openLinkText(targetPath, "", true);

        new Notice(`✅ Scene "${this.sceneName}" updated!`);
        return;
      }

      // ====================
      // CREATE MODE: Create new scene
      // ====================
      new Notice(`Creating scene "${this.sceneName}"...`);

      // Determine folder structure
      const adventureFolder = adventureFile.parent;
      if (!adventureFolder) {
        new Notice("❌ Adventure folder not found!");
        return;
      }

      // Check which structure is being used
      // Flat structure: Adventures/Adventure Name.md with "Adventure Name - Scenes" folder
      // Folder structure: Adventures/Adventure Name/Adventure Name.md with scenes in that folder (or Act subfolders)
      
      const flatScenesFolder = `${adventureFolder.path}/${adventureFile.basename} - Scenes`;
      const flatExists = this.app.vault.getAbstractFileByPath(flatScenesFolder) instanceof TFolder;
      
      // For folder structure, check if we're in a dedicated adventure folder
      // (i.e., adventure file has same name as its parent folder)
      const isFolderStructure = adventureFolder.name === adventureFile.basename;

      let scenePath: string;
      let usesActFolders = false;

      if (flatExists) {
        // Flat structure
        scenePath = `${flatScenesFolder}/Scene ${sceneNum} - ${this.sceneName}.md`;
      } else if (isFolderStructure) {
        // Folder structure - scenes go in the adventure folder or act subfolders
        const actFolderName = this.act === "1" ? "Act 1 - Setup" : 
                              this.act === "2" ? "Act 2 - Rising Action" : "Act 3 - Climax";
        const actFolderPath = `${adventureFolder.path}/${actFolderName}`;
        const actFolder = this.app.vault.getAbstractFileByPath(actFolderPath);
        
        if (actFolder instanceof TFolder) {
          usesActFolders = true;
          scenePath = `${actFolderPath}/Scene ${sceneNum} - ${this.sceneName}.md`;
        } else {
          // Check if ANY act folders exist - if so, this is act-based structure
          const act1Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 1 - Setup`) instanceof TFolder;
          const act2Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 2 - Rising Action`) instanceof TFolder;
          const act3Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 3 - Climax`) instanceof TFolder;
          
          if (act1Exists || act2Exists || act3Exists) {
            // Act-based structure - create the missing act folder
            usesActFolders = true;
            await this.plugin.ensureFolderExists(actFolderPath);
            scenePath = `${actFolderPath}/Scene ${sceneNum} - ${this.sceneName}.md`;
          } else {
            // No act folders, scenes directly in adventure folder
            scenePath = `${adventureFolder.path}/Scene ${sceneNum} - ${this.sceneName}.md`;
          }
        }
      } else {
        new Notice("❌ Could not determine scene folder structure!");
        return;
      }

      // Check if we need to renumber existing scenes
      const existingScenes = await this.getExistingScenes(this.adventurePath);
      const scenesAtOrAfter = existingScenes.filter(s => s.number >= sceneNum);

      if (scenesAtOrAfter.length > 0) {
        // Renumber scenes
        await this.renumberScenes(scenesAtOrAfter, sceneNum);
      }

      // Ensure parent folder exists
      const parentPath = scenePath.substring(0, scenePath.lastIndexOf('/'));
      await this.plugin.ensureFolderExists(parentPath);

      // Create the scene file
      const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
      
      const sceneData = {
        act: parseInt(this.act),
        num: sceneNum,
        name: this.sceneName,
        duration: this.duration,
        type: this.type,
        difficulty: this.difficulty
      };

      // Create Initiative Tracker encounter and save encounter file if requested
      let encounterFilePath = "";
      if (this.createEncounter && this.creatures.length > 0) {
        const savedPath = await this.saveEncounterFile();
        if (savedPath) {
          encounterFilePath = savedPath;
        }
      }

      await this.createSceneNote(scenePath, sceneData, campaignName, worldName, adventureFile.basename, currentDate, encounterFilePath);

      // Save to Initiative Tracker after scene is created
      if (this.createEncounter && this.creatures.length > 0) {
        await this.encounterBuilder.createInitiativeTrackerEncounter(scenePath);
      }

      // Open the new scene
      await this.app.workspace.openLinkText(scenePath, "", true);

      new Notice(`✅ Scene "${this.sceneName}" created!`);
    } catch (error) {
      new Notice(`❌ Error creating scene: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Scene creation error:", error);
    }
  }

  async renumberScenes(scenes: Array<{ path: string; number: number; name: string }>, insertAt: number) {
    // Renumber scenes from highest to lowest to avoid conflicts during rename
    const sorted = [...scenes].sort((a, b) => b.number - a.number);
    
    for (const scene of sorted) {
      const oldFile = this.app.vault.getAbstractFileByPath(scene.path);
      if (!(oldFile instanceof TFile)) continue;

      const newNumber = scene.number + 1;
      
      // Construct new filename preserving exact scene name
      const oldFilename = oldFile.basename; // e.g., "Scene 5 - Tavern Fight"
      const sceneNameMatch = oldFilename.match(/^Scene\s+\d+\s+-\s+(.+)$/);
      const sceneName = sceneNameMatch?.[1] || scene.name;
      const newFilename = `Scene ${newNumber} - ${sceneName}`;
      
      // Build new path
      const parentPath = oldFile.parent?.path || "";
      const newPath = `${parentPath}/${newFilename}.md`;

      // Skip if source and destination are the same (shouldn't happen, but safety check)
      if (oldFile.path === newPath) {
        console.warn(`Skipping rename: ${oldFile.path} already has correct name`);
        continue;
      }

      // Read and update content
      let content = await this.app.vault.read(oldFile);
      
      // Update scene_number in frontmatter
      content = content.replace(
        /^scene_number:\s*\d+$/m,
        `scene_number: ${newNumber}`
      );
      
      // Update the h1 header if it exists
      content = content.replace(
        /^# Scene\s+\d+:/m,
        `# Scene ${newNumber}:`
      );

      try {
        // Create new file with updated content
        await this.app.vault.create(newPath, content);
        
        // Delete old file only after successful creation
        await this.app.vault.delete(oldFile);
        
        console.log(`Renumbered: ${oldFile.path} → ${newPath}`);
      } catch (error) {
        console.error(`Error renumbering scene ${oldFile.path}:`, error);
        new Notice(`⚠️ Could not renumber ${oldFilename}`);
      }
    }
  }

  async createSceneNote(
    filePath: string,
    scene: any,
    campaignName: string,
    worldName: string,
    adventureName: string,
    currentDate: string,
    encounterFilePath = ""
  ) {
    // Prepare encounter data for frontmatter
    const trackerEncounter = this.encounterName || "";
    const encounterFile = encounterFilePath ? `"[[${encounterFilePath}]]"` : '""';
    const encounterCreaturesJson = this.creatures.length > 0 
      ? JSON.stringify(this.creatures) 
      : "[]";
    
    // Calculate encounter difficulty if creatures exist
    let encounterDifficultyJson = "null";
    if (this.creatures.length > 0) {
      const diffResult = await this.calculateEncounterDifficulty();
      encounterDifficultyJson = JSON.stringify({
        difficulty: diffResult.analysis.difficulty,
        roundsToDefeat: diffResult.analysis.roundsToDefeatEnemies,
        survivalRatio: Math.round(diffResult.analysis.survivalRatio * 100) / 100,
        partyHP: diffResult.partyStats.totalHP,
        partyEffectiveDPR: Math.round(diffResult.analysis.partyEffectiveDPR),
        enemyHP: diffResult.enemyStats.totalHP,
        enemyEffectiveDPR: Math.round(diffResult.analysis.enemyEffectiveDPR),
        enemyCount: diffResult.enemyStats.creatureCount,
        partyCount: diffResult.partyStats.memberCount
      });
    }
    
    // Select the appropriate template based on scene type
    let templateToUse = SCENE_EXPLORATION_TEMPLATE; // Default
    switch (scene.type) {
      case 'social':
        templateToUse = SCENE_SOCIAL_TEMPLATE;
        break;
      case 'combat':
        templateToUse = SCENE_COMBAT_TEMPLATE;
        break;
      case 'exploration':
        templateToUse = SCENE_EXPLORATION_TEMPLATE;
        break;
      case 'puzzle':
        templateToUse = SCENE_PUZZLE_TEMPLATE;
        break;
      case 'montage':
        templateToUse = SCENE_MONTAGE_TEMPLATE;
        break;
    }
    
    // Calculate difficulty DC based on difficulty level
    const difficultyDCs: Record<string, string> = {
      'easy': '12',
      'medium': '15',
      'hard': '18',
      'deadly': '20'
    };
    const difficultyDC = difficultyDCs[scene.difficulty] || '15';
    
    const sceneContent = templateToUse
      .replace(/{{SCENE_NUMBER}}/g, scene.num.toString())
      .replace(/{{SCENE_NAME}}/g, scene.name)
      .replace(/{{ADVENTURE_NAME}}/g, adventureName)
      .replace(/{{ACT_NUMBER}}/g, scene.act.toString())
      .replace(/{{DURATION}}/g, scene.duration)
      .replace(/{{TYPE}}/g, scene.type)
      .replace(/{{DIFFICULTY}}/g, scene.difficulty)
      .replace(/{{DIFFICULTY_DC}}/g, difficultyDC)
      .replace(/{{CAMPAIGN}}/g, campaignName)
      .replace(/{{WORLD}}/g, worldName)
      .replace(/{{DATE}}/g, currentDate)
      .replace(/{{TRACKER_ENCOUNTER}}/g, trackerEncounter)
      .replace(/{{ENCOUNTER_FILE}}/g, encounterFile)
      .replace(/{{ENCOUNTER_CREATURES}}/g, encounterCreaturesJson)
      .replace(/{{ENCOUNTER_DIFFICULTY}}/g, encounterDifficultyJson)
      .replace(/{{SELECTED_PARTY_ID}}/g, this.selectedPartyId || "")
      .replace(/{{SELECTED_PARTY_MEMBERS}}/g, JSON.stringify(this.selectedPartyMembers));

    await this.app.vault.create(filePath, sceneContent);
  }

  syncEncounterBuilder() {
    this.encounterBuilder.encounterName = this.encounterName;
    this.encounterBuilder.creatures = [...this.creatures];
    this.encounterBuilder.includeParty = this.includeParty;
    this.encounterBuilder.useColorNames = this.useColorNames;
    this.encounterBuilder.selectedPartyMembers = [...this.selectedPartyMembers];
    this.encounterBuilder.selectedPartyId = this.selectedPartyId || "";
    this.encounterBuilder.adventurePath = this.adventurePath;
    this.encounterBuilder.campaignPath = this.campaignPath;
  }

  /**
   * Show/hide encounter builder section based on scene type
   */
  showEncounterBuilderIfCombat() {
    if (!this.encounterSection) return;
    
    this.encounterSection.empty();
    
    if (this.type !== "combat") {
      this.encounterSection.style.display = "none";
      return;
    }
    
    this.encounterSection.style.display = "block";
    
    // Header
    this.encounterSection.createEl("h3", { text: "⚔️ Combat Encounter" });
    
    // Toggle to create encounter
    new Setting(this.encounterSection)
      .setName("Create Initiative Tracker Encounter")
      .setDesc("Build an encounter that will be ready to use in Initiative Tracker")
      .addToggle(toggle => toggle
        .setValue(this.createEncounter)
        .onChange(value => {
          this.createEncounter = value;
          // Re-render entire section to show/hide color option
          this.showEncounterBuilderIfCombat();
        }));
    
    // Color naming option (only show when encounter creation is enabled)
    if (this.createEncounter) {
      new Setting(this.encounterSection)
        .setName("Use Color Names")
        .setDesc("Name duplicate creatures with colors (Red Goblin, Blue Goblin) instead of numbers (Goblin 1, Goblin 2)")
        .addToggle(toggle => toggle
          .setValue(this.useColorNames)
          .onChange(value => {
            this.useColorNames = value;
          }));
      
      new Setting(this.encounterSection)
        .setName("Include Party Members")
        .setDesc("Add party members to this encounter for difficulty calculation")
        .addToggle(toggle => toggle
          .setValue(this.includeParty)
          .onChange(async (value) => {
            this.includeParty = value;
            await this.renderPartySelection();
            await this.renderPartyMemberList();
            this.updateDifficultyDisplay();
          }));
      
      // Party selection container
      this.partySelectionContainer = this.encounterSection.createDiv({ cls: "dnd-party-selection" });
      this.renderPartySelection();
      
      // Party member list container
      this.partyMemberListContainer = this.encounterSection.createDiv({ cls: "dnd-party-member-list" });
      this.renderPartyMemberList();
      
      // Show the builder fields
      this.showEncounterBuilderFields();
    }
  }

  /**
   * Show encounter builder input fields
   */
  async showEncounterBuilderFields() {
    if (!this.encounterSection) return;
    
    // Remove existing builder fields
    const existingBuilder = this.encounterSection.querySelector(".dnd-encounter-builder");
    if (existingBuilder) {
      existingBuilder.remove();
    }
    
    if (!this.createEncounter) return;
    
    const builderContainer = this.encounterSection.createDiv({ cls: "dnd-encounter-builder" });
    
    // Auto-fill encounter name based on scene name
    if (!this.encounterName && this.sceneName) {
      this.encounterName = `${this.sceneName} - Encounter`;
    }
    
    // Encounter Name
    new Setting(builderContainer)
      .setName("Encounter Name")
      .setDesc("Name for this encounter in Initiative Tracker")
      .addText(text => text
        .setPlaceholder("e.g., Goblin Ambush")
        .setValue(this.encounterName)
        .onChange(value => this.encounterName = value));
    
    // Creature management section
    builderContainer.createEl("h4", { text: "Creatures" });
    
    // Creature list container
    this.creatureListContainer = builderContainer.createDiv({ cls: "dnd-creature-list" });
    this.renderCreatureList();
    
    // === VAULT CREATURE SELECTION ===
    const vaultCreatureSection = builderContainer.createDiv({ cls: "dnd-add-creature-vault" });
    
    let selectedCreature: { name: string; path: string; hp: number; ac: number; cr?: string } | null = null;
    let vaultCreatureCount = "1";
    let searchResults: HTMLElement | null = null;
    
    // Load creatures from vault
    this.syncEncounterBuilder();
    const vaultCreatures = await this.encounterBuilder.loadAllCreatures();
    
    console.log("Loaded creatures:", vaultCreatures.length, vaultCreatures.slice(0, 3).map(c => c.name));
    
    if (vaultCreatures.length > 0) {
      const vaultCreatureSetting = new Setting(vaultCreatureSection)
        .setName("Add from Vault")
        .setDesc(`Search and select creatures from your vault (${vaultCreatures.length} available)`);
      
      // Create search input container
      const searchContainer = vaultCreatureSetting.controlEl.createDiv({ cls: "dnd-creature-search-container" });
      
      const searchInput = searchContainer.createEl("input", {
        type: "text",
        placeholder: "Search creatures...",
        cls: "dnd-creature-search-input"
      });
      
      // Search results container
      searchResults = searchContainer.createDiv({ cls: "dnd-creature-search-results" });
      searchResults.style.display = "none";
      
      // Filter and display results
      const showSearchResults = (query: string) => {
        console.log("showSearchResults called with query:", query, "Total creatures:", vaultCreatures.length);
        if (!searchResults) {
          console.log("No searchResults element!");
          return;
        }
        
        if (!query || query.length < 1) {
          searchResults.style.display = "none";
          return;
        }
        
        const queryLower = query.toLowerCase().trim();
        console.log("Searching for:", queryLower);
        console.log("Sample creature names:", vaultCreatures.slice(0, 5).map(c => ({name: c.name, lower: c.name.toLowerCase()})));
        
        const filtered = vaultCreatures.filter(c => {
          const matches = c.name.toLowerCase().includes(queryLower);
          if (queryLower.length <= 3 && matches) {
            console.log("Match found:", c.name, "matches query:", queryLower);
          }
          return matches;
        }).slice(0, 10); // Limit to 10 results
        
        console.log("Filtered results:", filtered.length, "matches");
        if (filtered.length > 0) {
          console.log("First 3 matches:", filtered.slice(0, 3).map(c => c.name));
        }
        
        searchResults.empty();
        
        if (filtered.length === 0) {
          searchResults.createEl("div", {
            text: "No creatures found",
            cls: "dnd-creature-search-no-results"
          });
          searchResults.style.display = "block";
          return;
        }
        
        filtered.forEach(creature => {
          const resultEl = searchResults!.createDiv({ cls: "dnd-creature-search-result" });
          
          const nameEl = resultEl.createDiv({ cls: "dnd-creature-search-result-name" });
          nameEl.setText(creature.name);
          
          const statsEl = resultEl.createDiv({ cls: "dnd-creature-search-result-stats" });
          const statsParts: string[] = [];
          if (creature.cr) statsParts.push(`CR ${creature.cr}`);
          statsParts.push(`HP ${creature.hp}`);
          statsParts.push(`AC ${creature.ac}`);
          statsEl.setText(statsParts.join(" | "));
          
          resultEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Creature clicked:", creature.name);
            selectedCreature = creature;
            searchInput.value = creature.name;
            if (searchResults) {
              searchResults.style.display = "none";
            }
          });
        });
        
        searchResults.style.display = "block";
      };
      
      // Search input events
      searchInput.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        console.log("Input event:", target.value);
        showSearchResults(target.value);
      });
      
      searchInput.addEventListener("focus", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value.length >= 2) {
          showSearchResults(target.value);
        }
      });
      
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && selectedCreature) {
          e.preventDefault();
          // Trigger add button
        }
      });
      
      // Close search results when clicking outside
      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (searchResults) {
            searchResults.style.display = "none";
          }
        }, 250); // Increased timeout to ensure click registers
      });
      
      // Count input
      vaultCreatureSetting.addText(text => {
        text.setPlaceholder("Count")
          .setValue("1")
          .onChange(value => vaultCreatureCount = value);
        text.inputEl.type = "number";
        text.inputEl.style.width = "60px";
      });
      
      // Add button
      vaultCreatureSetting.addButton(btn => btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => {
          if (!selectedCreature) {
            new Notice("Please search and select a creature first!");
            return;
          }
          
          this.addCreature({
            name: selectedCreature.name,
            count: parseInt(vaultCreatureCount) || 1,
            hp: selectedCreature.hp,
            ac: selectedCreature.ac,
            cr: selectedCreature.cr,
            source: "vault",
            path: selectedCreature.path  // Include path for statblock plugin
          });
          
          new Notice(`Added ${vaultCreatureCount}x ${selectedCreature.name}`);
          
          // Clear search
          searchInput.value = "";
          selectedCreature = null;
        }));
    } else {
      vaultCreatureSection.createEl("p", {
        text: "⚠️ No creatures found in z_Beastiarity folder. Use manual entry below.",
        cls: "setting-item-description mod-warning"
      });
    }
    
    // === MANUAL CREATURE ENTRY ===
    const addCreatureSection = builderContainer.createDiv({ cls: "dnd-add-creature-manual" });
    
    let newCreatureName = "";
    let newCreatureCount = "1";
    let newCreatureHP = "";
    let newCreatureAC = "";
    let newCreatureCR = "";
    
    const addCreatureSetting = new Setting(addCreatureSection)
      .setName("Add Custom Creature")
      .setDesc("Enter creature details manually for custom or homebrew enemies");
    
    // Creature name input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Name (e.g., Goblin)")
        .onChange(value => newCreatureName = value);
      text.inputEl.style.width = "120px";
    });
    
    // Count input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Count")
        .setValue("1")
        .onChange(value => newCreatureCount = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // HP input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("HP")
        .onChange(value => newCreatureHP = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // AC input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("AC")
        .onChange(value => newCreatureAC = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // CR input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("CR")
        .onChange(value => newCreatureCR = value);
      text.inputEl.style.width = "60px";
    });
    
    // Add button
    addCreatureSetting.addButton(btn => btn
      .setButtonText("Add")
      .setCta()
      .onClick(() => {
        if (!newCreatureName.trim()) {
          new Notice("Please enter a creature name!");
          return;
        }
        
        this.addCreature({
          name: newCreatureName.trim(),
          count: parseInt(newCreatureCount) || 1,
          hp: newCreatureHP ? parseInt(newCreatureHP) : undefined,
          ac: newCreatureAC ? parseInt(newCreatureAC) : undefined,
          cr: newCreatureCR || undefined,
          source: "manual"
        });
        
        new Notice(`Added ${newCreatureCount}x ${newCreatureName}`);
        
        // Clear inputs
        newCreatureName = "";
        newCreatureCount = "1";
        newCreatureHP = "";
        newCreatureAC = "";
        newCreatureCR = "";
        
        // Re-render to clear fields
        this.showEncounterBuilderFields();
      }));
    
    // === ENCOUNTER DIFFICULTY CALCULATOR ===
    builderContainer.createEl("h4", { text: "⚔️ Encounter Difficulty" });
    this.difficultyContainer = builderContainer.createDiv({ cls: "dnd-difficulty-container" });
    await this.updateDifficultyCalculation();
    
    // Info text
    builderContainer.createEl("p", {
      text: "💡 Tip: Select creatures from your vault or add custom enemies on the fly. You can edit stats later in Initiative Tracker.",
      cls: "setting-item-description"
    });
  }

  /**
   * Add a creature to the encounter
   */
  addCreature(creature: { name: string; count: number; hp?: number; ac?: number; cr?: string; source?: string; path?: string }) {
    this.creatures.push(creature);
    this.renderCreatureList();
  }

  /**
   * Remove a creature from the encounter
   */
  removeCreature(index: number) {
    this.creatures.splice(index, 1);
    this.renderCreatureList();
  }

  /**
   * Render the list of creatures in the encounter
   */
  renderCreatureList() {
    if (!this.creatureListContainer) return;
    
    this.creatureListContainer.empty();
    
    if (this.creatures.length === 0) {
      this.creatureListContainer.createEl("p", {
        text: "No creatures added yet. Add creatures below.",
        cls: "setting-item-description"
      });
      return;
    }
    
    this.creatures.forEach((creature, index) => {
      const creatureItem = this.creatureListContainer!.createDiv({ cls: "dnd-creature-item" });
      
      const nameEl = creatureItem.createSpan({ cls: "dnd-creature-name" });
      nameEl.setText(`${creature.name} x${creature.count}`);
      
      const statsEl = creatureItem.createSpan({ cls: "dnd-creature-stats" });
      const stats: string[] = [];
      if (creature.hp) stats.push(`HP: ${creature.hp}`);
      if (creature.ac) stats.push(`AC: ${creature.ac}`);
      if (creature.cr) stats.push(`CR: ${creature.cr}`);
      statsEl.setText(stats.length > 0 ? ` | ${stats.join(" | ")}` : "");
      
      const removeBtn = creatureItem.createEl("button", {
        text: "Remove",
        cls: "dnd-creature-remove"
      });
      removeBtn.addEventListener("click", () => {
        this.removeCreature(index);
      });
    });
    
    // Update difficulty calculation after creature list changes
    this.updateDifficultyCalculation();
  }

  /**
   * CR to combat stats mapping (D&D 5e approximations)
   * Returns: { dpr, attackBonus, ac, hp }
   */
  getCRStats(cr: string | undefined): { dpr: number; attackBonus: number; ac: number; hp: number } {
    this.syncEncounterBuilder();
    const stats = this.encounterBuilder.getCRStats(cr);
    return {
      dpr: stats.dpr,
      attackBonus: stats.attackBonus,
      ac: stats.ac,
      hp: stats.hp
    };
  }

  /**
   * Player level to combat stats mapping (D&D 5e approximations)
   * Returns: { dpr, attackBonus, ac, hp }
   */
  getLevelStats(level: number): { dpr: number; attackBonus: number; ac: number; hp: number } {
    this.syncEncounterBuilder();
    const stats = this.encounterBuilder.getLevelStats(level);
    return {
      dpr: stats.dpr,
      attackBonus: stats.attackBonus,
      ac: stats.ac,
      hp: stats.hp
    };
  }

  /**
   * Parse CR string to numeric value
   */
  parseCR(cr: string | undefined): number {
    if (!cr) return 0;
    
    const crStr = cr.toString().trim().toLowerCase();
    
    // Handle fractions
    if (crStr === "1/8") return 0.125;
    if (crStr === "1/4") return 0.25;
    if (crStr === "1/2") return 0.5;
    
    const parsed = parseFloat(crStr);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Calculate hit probability (bounded between 5% and 95%)
   */
  calculateHitChance(attackBonus: number, targetAC: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateHitChance(attackBonus, targetAC);
  }

  /**
   * Calculate expected damage per round considering hit chance
   */
  calculateEffectiveDPR(baseDPR: number, hitChance: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateEffectiveDPR(baseDPR, hitChance);
  }

  /**
   * Calculate rounds to defeat a group (HP pool / effective DPR)
   */
  calculateRoundsToDefeat(totalHP: number, effectiveDPR: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateRoundsToDefeat(totalHP, effectiveDPR);
  }

  async renderPartySelection() {
    if (!this.partySelectionContainer) return;
    this.partySelectionContainer.empty();

    if (!this.includeParty) return;

    try {
      this.syncEncounterBuilder();
      const parties = await this.encounterBuilder.getAvailableParties();

      if (parties.length === 0) {
        this.partySelectionContainer.createEl("p", {
          text: "⚠️ No parties found in Initiative Tracker",
          attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" }
        });
        return;
      }

      if (!this.selectedPartyId) {
        const defaultParty = await this.encounterBuilder.getResolvedParty();
        if (defaultParty?.id) this.selectedPartyId = defaultParty.id;
        if (defaultParty?.name) this.selectedPartyName = defaultParty.name;
      }

      const partySetting = new Setting(this.partySelectionContainer)
        .setName("Party")
        .setDesc("Choose which party to use for difficulty calculations");

      partySetting.addDropdown((dropdown) => {
        parties.forEach(party => {
          dropdown.addOption(party.id, party.name);
        });
        dropdown.setValue(this.selectedPartyId || parties[0]!.id);
        dropdown.onChange((value) => {
          this.selectedPartyId = value;
          const selected = parties.find(p => p.id === value);
          this.selectedPartyName = selected?.name || "";
          this.selectedPartyMembers = [];
        });
      });

      partySetting.addButton((button) =>
        button
          .setButtonText("Apply Party")
          .onClick(async () => {
            await this.renderPartySelection();
            await this.renderPartyMemberList();
            this.updateDifficultyDisplay();
          })
      );

      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      
      if (partyMembers.length === 0) {
        this.partySelectionContainer.createEl("p", {
          text: "⚠️ No party members found in Initiative Tracker",
          attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" }
        });
        return;
      }

      const selectionDiv = this.partySelectionContainer.createDiv();
      selectionDiv.style.border = "1px solid var(--background-modifier-border)";
      selectionDiv.style.padding = "10px";
      selectionDiv.style.borderRadius = "5px";
      selectionDiv.style.marginBottom = "10px";

      selectionDiv.createEl("h4", { text: "Select Party Members", attr: { style: "margin-top: 0;" } });

      for (const member of partyMembers) {
        const checkboxDiv = selectionDiv.createDiv();
        checkboxDiv.style.marginBottom = "5px";

        const checkbox = checkboxDiv.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedPartyMembers.includes(member.name);
        checkbox.style.marginRight = "10px";
        checkbox.onchange = () => {
          if (checkbox.checked) {
            if (!this.selectedPartyMembers.includes(member.name)) {
              this.selectedPartyMembers.push(member.name);
            }
          } else {
            this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== member.name);
          }
          this.renderPartyMemberList();
          this.updateDifficultyDisplay();
        };

        const label = checkboxDiv.createEl("span", { 
          text: `${member.name} (Level ${member.level}, HP: ${member.hp}, AC: ${member.ac})`
        });
        label.style.cursor = "pointer";
        label.onclick = () => {
          checkbox.checked = !checkbox.checked;
          checkbox.onchange?.(new Event('change'));
        };
      }

      // Select All / Deselect All buttons
      const buttonsDiv = selectionDiv.createDiv();
      buttonsDiv.style.marginTop = "10px";
      buttonsDiv.style.display = "flex";
      buttonsDiv.style.gap = "10px";

      const selectAllBtn = buttonsDiv.createEl("button", { text: "Select All" });
      selectAllBtn.style.fontSize = "0.85em";
      selectAllBtn.onclick = () => {
        this.selectedPartyMembers = partyMembers.map(m => m.name);
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      };

      const deselectAllBtn = buttonsDiv.createEl("button", { text: "Deselect All" });
      deselectAllBtn.style.fontSize = "0.85em";
      deselectAllBtn.onclick = () => {
        this.selectedPartyMembers = [];
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      };
    } catch (error) {
      console.error("Error rendering party selection:", error);
    }
  }

  async renderPartyMemberList() {
    if (!this.partyMemberListContainer) return;
    this.partyMemberListContainer.empty();

    if (!this.includeParty || this.selectedPartyMembers.length === 0) {
      return;
    }

    try {
      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      const memberByName = new Map(partyMembers.map(m => [m.name, m]));

      const headerDiv = this.partyMemberListContainer.createDiv({ cls: "dnd-party-member-header" });
      headerDiv.style.marginBottom = "10px";
      headerDiv.style.fontWeight = "600";
      headerDiv.setText(`Selected Party Members (${this.selectedPartyMembers.length})`);

      for (const memberName of this.selectedPartyMembers) {
        const memberData = memberByName.get(memberName);
        if (!memberData) continue;

        const memberItem = this.partyMemberListContainer.createDiv({ cls: "dnd-creature-item" });
        
        const nameEl = memberItem.createSpan({ cls: "dnd-creature-name" });
        nameEl.setText(memberName);
        
        const statsEl = memberItem.createSpan({ cls: "dnd-creature-stats" });
        const stats: string[] = [];
        stats.push(`Level: ${memberData.level}`);
        stats.push(`HP: ${memberData.hp}`);
        stats.push(`AC: ${memberData.ac}`);
        statsEl.setText(` | ${stats.join(" | ")}`);
        
        const removeBtn = memberItem.createEl("button", {
          text: "Remove",
          cls: "dnd-creature-remove"
        });
        removeBtn.addEventListener("click", () => {
          this.removePartyMember(memberName);
        });
      }
    } catch (error) {
      console.error("Error rendering party member list:", error);
    }
  }

  removePartyMember(memberName: string) {
    this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== memberName);
    this.renderPartySelection();
    this.renderPartyMemberList();
    this.updateDifficultyDisplay();
  }

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getAvailablePartyMembers();
  }

  /**
   * Get party members from Initiative Tracker for difficulty calculation
   */
  async getPartyForDifficulty(): Promise<Array<{ name: string; hp: number; ac: number; level: number }>> {
    this.syncEncounterBuilder();
    const members = await this.encounterBuilder.getAvailablePartyMembers();
    return members.map(member => ({
      name: member.name,
      hp: member.hp,
      ac: member.ac,
      level: member.level
    }));
  }

  /**
   * Calculate comprehensive encounter difficulty
   */
  async calculateEncounterDifficulty(): Promise<{
    enemyStats: {
      totalHP: number;
      avgAC: number;
      totalDPR: number;
      avgAttackBonus: number;
      creatureCount: number;
    };
    partyStats: {
      totalHP: number;
      avgAC: number;
      totalDPR: number;
      avgAttackBonus: number;
      memberCount: number;
      avgLevel: number;
    };
    analysis: {
      partyHitChance: number;
      enemyHitChance: number;
      partyEffectiveDPR: number;
      enemyEffectiveDPR: number;
      roundsToDefeatEnemies: number;
      roundsToDefeatParty: number;
      survivalRatio: number;
      difficulty: "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly" | "TPK Risk";
      difficultyColor: string;
      summary: string;
    };
  }> {
    // Calculate enemy stats
    let enemyTotalHP = 0;
    let enemyTotalAC = 0;
    let enemyTotalDPR = 0;
    let enemyTotalAttackBonus = 0;
    let enemyCount = 0;
    
    for (const creature of this.creatures) {
      const crStats = this.getCRStats(creature.cr);
      const count = creature.count || 1;
      
      // Use actual HP/AC if provided, otherwise use CR-based estimates
      const hp = creature.hp || crStats.hp;
      const ac = creature.ac || crStats.ac;
      
      enemyTotalHP += hp * count;
      enemyTotalAC += ac * count;
      enemyTotalDPR += crStats.dpr * count;
      enemyTotalAttackBonus += crStats.attackBonus * count;
      enemyCount += count;
    }
    
    const avgEnemyAC = enemyCount > 0 ? enemyTotalAC / enemyCount : 13;
    const avgEnemyAttackBonus = enemyCount > 0 ? enemyTotalAttackBonus / enemyCount : 3;
    
    // Get party stats
    const partyMembers = await this.getPartyForDifficulty();
    
    let partyTotalHP = 0;
    let partyTotalAC = 0;
    let partyTotalDPR = 0;
    let partyTotalAttackBonus = 0;
    let totalLevel = 0;
    
    for (const member of partyMembers) {
      const levelStats = this.getLevelStats(member.level);
      
      // Use actual HP/AC if available, otherwise use level-based estimates
      // Ensure numeric conversion to prevent string concatenation bugs
      const memberHP = Number(member.hp) || 0;
      const memberAC = Number(member.ac) || 0;
      
      partyTotalHP += memberHP > 0 ? memberHP : levelStats.hp;
      partyTotalAC += memberAC > 0 ? memberAC : levelStats.ac;
      partyTotalDPR += levelStats.dpr;
      partyTotalAttackBonus += levelStats.attackBonus;
      totalLevel += member.level;
    }
    
    const memberCount = partyMembers.length;
    
    // Calculate averages with proper fallbacks
    let avgPartyAC: number;
    let avgPartyAttackBonus: number;
    let avgLevel: number;
    
    if (memberCount > 0) {
      avgPartyAC = partyTotalAC / memberCount;
      avgPartyAttackBonus = partyTotalAttackBonus / memberCount;
      avgLevel = totalLevel / memberCount;
    } else {
      // Use defaults for a level 3 party of 4
      const defaultStats = this.getLevelStats(3);
      partyTotalHP = defaultStats.hp * 4;
      partyTotalDPR = defaultStats.dpr * 4;
      avgPartyAC = defaultStats.ac;
      avgPartyAttackBonus = defaultStats.attackBonus;
      avgLevel = 3;
    }
    
    // Calculate hit chances
    const partyHitChance = this.calculateHitChance(avgPartyAttackBonus, avgEnemyAC);
    const enemyHitChance = this.calculateHitChance(avgEnemyAttackBonus, avgPartyAC);
    
    // Calculate effective DPR (considering hit chance)
    const partyEffectiveDPR = this.calculateEffectiveDPR(partyTotalDPR, partyHitChance);
    const enemyEffectiveDPR = this.calculateEffectiveDPR(enemyTotalDPR, enemyHitChance);
    
    // Calculate rounds to defeat
    const roundsToDefeatEnemies = this.calculateRoundsToDefeat(enemyTotalHP, partyEffectiveDPR);
    const roundsToDefeatParty = this.calculateRoundsToDefeat(partyTotalHP, enemyEffectiveDPR);
    
    // Survival ratio: how many more rounds the party can survive vs enemies
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;
    
    // Determine difficulty based on survival ratio and rounds
    let difficulty: "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly" | "TPK Risk";
    let difficultyColor: string;
    
    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) {
      difficulty = "Trivial";
      difficultyColor = "#888888";
    } else if (survivalRatio >= 2.5) {
      difficulty = "Easy";
      difficultyColor = "#00aa00";
    } else if (survivalRatio >= 1.5) {
      difficulty = "Medium";
      difficultyColor = "#aaaa00";
    } else if (survivalRatio >= 1.0) {
      difficulty = "Hard";
      difficultyColor = "#ff8800";
    } else if (survivalRatio >= 0.6) {
      difficulty = "Deadly";
      difficultyColor = "#ff0000";
    } else {
      difficulty = "TPK Risk";
      difficultyColor = "#880000";
    }
    
    // Generate summary
    let summary = "";
    if (enemyCount === 0) {
      summary = "Add creatures to calculate difficulty.";
    } else if (partyMembers.length === 0) {
      summary = `⚠️ No party found. Using default 4-player party (Level 3).\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
    } else {
      summary = `Party of ${memberCount} (Avg Lvl ${avgLevel.toFixed(1)}) vs ${enemyCount} creature${enemyCount !== 1 ? 's' : ''}.\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
      
      if (difficulty === "TPK Risk") {
        summary += "\n⚠️ HIGH RISK: Party may not survive this encounter!";
      } else if (difficulty === "Deadly") {
        summary += "\n⚠️ Deadly encounter - expect possible character deaths.";
      }
    }
    
    return {
      enemyStats: {
        totalHP: enemyTotalHP,
        avgAC: avgEnemyAC,
        totalDPR: enemyTotalDPR,
        avgAttackBonus: avgEnemyAttackBonus,
        creatureCount: enemyCount
      },
      partyStats: {
        totalHP: partyTotalHP,
        avgAC: avgPartyAC,
        totalDPR: partyTotalDPR,
        avgAttackBonus: avgPartyAttackBonus,
        memberCount: memberCount,
        avgLevel: avgLevel
      },
      analysis: {
        partyHitChance,
        enemyHitChance,
        partyEffectiveDPR,
        enemyEffectiveDPR,
        roundsToDefeatEnemies,
        roundsToDefeatParty,
        survivalRatio,
        difficulty,
        difficultyColor,
        summary
      }
    };
  }

  /**
   * Update and render the difficulty calculation display
   */
  async updateDifficultyCalculation() {
    if (!this.difficultyContainer) return;
    
    this.difficultyContainer.empty();
    
    if (this.creatures.length === 0) {
      this.difficultyContainer.createEl("p", {
        text: "Add creatures to see encounter difficulty analysis.",
        cls: "setting-item-description"
      });
      return;
    }
    
    // Show loading
    const loadingEl = this.difficultyContainer.createEl("p", { text: "Calculating difficulty..." });
    
    this.syncEncounterBuilder();
    const result = await this.encounterBuilder.calculateEncounterDifficulty();
    
    loadingEl.remove();
    
    // Create difficulty display
    const difficultyCard = this.difficultyContainer.createDiv({ cls: "dnd-difficulty-card" });
    
    // Header with difficulty rating
    const header = difficultyCard.createDiv({ cls: "dnd-difficulty-header" });
    
    const difficultyBadge = header.createEl("span", {
      text: result.analysis.difficulty,
      cls: "dnd-difficulty-badge"
    });
    difficultyBadge.style.backgroundColor = result.analysis.difficultyColor;
    difficultyBadge.style.color = "#ffffff";
    difficultyBadge.style.padding = "4px 12px";
    difficultyBadge.style.borderRadius = "12px";
    difficultyBadge.style.fontWeight = "bold";
    difficultyBadge.style.fontSize = "14px";
    
    const roundsEstimate = header.createEl("span", {
      text: ` ~${result.analysis.roundsToDefeatEnemies} round${result.analysis.roundsToDefeatEnemies !== 1 ? 's' : ''}`,
      cls: "dnd-rounds-estimate"
    });
    roundsEstimate.style.marginLeft = "10px";
    roundsEstimate.style.opacity = "0.8";
    
    // Stats comparison grid
    const statsGrid = difficultyCard.createDiv({ cls: "dnd-difficulty-stats-grid" });
    statsGrid.style.display = "grid";
    statsGrid.style.gridTemplateColumns = "1fr 1fr";
    statsGrid.style.gap = "15px";
    statsGrid.style.marginTop = "15px";
    
    // Party stats
    const partyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    partyCol.createEl("h5", { text: `⚔️ Party (${result.partyStats.memberCount})` });
    const partyStats = partyCol.createDiv();
    partyStats.innerHTML = `
      <div>HP Pool: <strong>${result.partyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.partyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.partyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.partyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.partyEffectiveDPR.toFixed(0)}</strong></div>
    `;
    
    // Enemy stats
    const enemyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    enemyCol.createEl("h5", { text: `👹 Enemies (${result.enemyStats.creatureCount})` });
    const enemyStats = enemyCol.createDiv();
    enemyStats.innerHTML = `
      <div>HP Pool: <strong>${result.enemyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.enemyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.enemyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.enemyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.enemyEffectiveDPR.toFixed(0)}</strong></div>
    `;
    
    // Analysis summary
    const analysisSummary = difficultyCard.createDiv({ cls: "dnd-difficulty-analysis" });
    analysisSummary.style.marginTop = "15px";
    analysisSummary.style.padding = "10px";
    analysisSummary.style.backgroundColor = "var(--background-secondary)";
    analysisSummary.style.borderRadius = "6px";
    analysisSummary.style.fontSize = "12px";
    
    // Calculate damage over 3 rounds
    const partyDamage3Rounds = result.analysis.partyEffectiveDPR * 3;
    const enemyDamage3Rounds = result.analysis.enemyEffectiveDPR * 3;
    const partyHPAfter3 = Math.max(0, result.partyStats.totalHP - enemyDamage3Rounds);
    const enemyHPAfter3 = Math.max(0, result.enemyStats.totalHP - partyDamage3Rounds);
    
    analysisSummary.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
      <div>Party deals: <strong>${partyDamage3Rounds.toFixed(0)}</strong> damage → Enemies at <strong>${enemyHPAfter3.toFixed(0)}</strong> HP (${((enemyHPAfter3 / result.enemyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div>Enemies deal: <strong>${enemyDamage3Rounds.toFixed(0)}</strong> damage → Party at <strong>${partyHPAfter3.toFixed(0)}</strong> HP (${((partyHPAfter3 / result.partyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div style="margin-top: 8px; opacity: 0.8;">
        Survival Ratio: ${result.analysis.survivalRatio.toFixed(2)} 
        (Party can survive ${result.analysis.roundsToDefeatParty} rounds, enemies survive ${result.analysis.roundsToDefeatEnemies} rounds)
      </div>
    `;
    
    // Warning for no party
    if (result.partyStats.memberCount === 0 || (await this.getPartyForDifficulty()).length === 0) {
      const warningEl = difficultyCard.createDiv({ cls: "dnd-difficulty-warning" });
      warningEl.style.marginTop = "10px";
      warningEl.style.padding = "8px";
      warningEl.style.backgroundColor = "#ff880033";
      warningEl.style.borderRadius = "4px";
      warningEl.style.fontSize = "12px";
      warningEl.innerHTML = `⚠️ <strong>No party registered!</strong> Using default estimates for 4 Level-3 PCs. 
        <br>Register PCs via "Create PC" to get accurate calculations.`;
    }
  }

  /**
   * Alias for updateDifficultyCalculation to match EncounterBuilderModal interface
   */
  async updateDifficultyDisplay() {
    return this.updateDifficultyCalculation();
  }

  /**
   * Search vault for creature files in z_Beastiarity
   * Parses creature statblocks from frontmatter
   */
  async searchVaultCreatures(query: string): Promise<Array<{
    name: string;
    path: string;
    hp: number;
    ac: number;
    cr?: string;
  }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.searchVaultCreatures(query);
  }
  
  /**
   * Load all creatures from vault for dropdown
   */
  async loadAllCreatures(): Promise<Array<{
    name: string;
    path: string;
    hp: number;
    ac: number;
    cr?: string;
  }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.loadAllCreatures();
  }
  
  /**
   * Get creatures from the 5e Statblocks plugin (includes SRD monsters)
   */
  async getStatblocksPluginCreatures(): Promise<Array<{
    name: string;
    path: string;
    hp: number;
    ac: number;
    cr?: string;
  }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getStatblocksPluginCreatures();
  }

  /**
   * Create encounter in Initiative Tracker and link to scene
   * Note: The encounter file is saved earlier in createSceneFile
   */
  async createInitiativeTrackerEncounter(scenePath: string) {
    if (!this.createEncounter || this.creatures.length === 0) return;

    this.syncEncounterBuilder();
    
    // Save to Initiative Tracker plugin
    await this.encounterBuilder.createInitiativeTrackerEncounter(scenePath);
  }

  /**
   * Save encounter file to z_Encounters folder
   * Uses the same proven approach as EncounterBuilderModal.saveEncounter()
   */
  async saveEncounterFile() {
    if (!this.encounterName || this.creatures.length === 0) {
      console.log("[SceneCreation - saveEncounterFile] Skipping - no encounter name or creatures");
      return null;
    }

    if (!this.campaignPath) {
      console.error("[SceneCreation - saveEncounterFile] No campaignPath set!");
      new Notice("⚠️ Cannot save encounter: campaign path not found");
      return null;
    }

    try {
      // Use vault's root z_Encounters folder (same as EncounterBuilderModal)
      const encounterFolder = "z_Encounters";
      
      console.log("[SceneCreation - saveEncounterFile] Saving encounter:", this.encounterName);
      console.log("[SceneCreation - saveEncounterFile] Campaign:", this.campaignPath);
      console.log("[SceneCreation - saveEncounterFile] Folder:", encounterFolder);
      
      // Create folder if it doesn't exist
      const folderExists = this.app.vault.getAbstractFileByPath(encounterFolder);
      if (!folderExists) {
        console.log("[SceneCreation - saveEncounterFile] Creating folder...");
        await this.app.vault.createFolder(encounterFolder);
      }

      // Generate encounter file content (same as EncounterBuilderModal)
      this.syncEncounterBuilder();
      const diffResult = await this.encounterBuilder.calculateEncounterDifficulty();
      const encounterContent = await this.generateEncounterContent(diffResult);

      // Save encounter file
      const fileName = `${this.encounterName}.md`;
      const encounterPath = `${encounterFolder}/${fileName}`;
      
      console.log("[SceneCreation - saveEncounterFile] File path:", encounterPath);

      const existingFile = this.app.vault.getAbstractFileByPath(encounterPath);
      if (existingFile instanceof TFile) {
        console.log("[SceneCreation - saveEncounterFile] Updating existing file");
        await this.app.vault.modify(existingFile, encounterContent);
      } else {
        console.log("[SceneCreation - saveEncounterFile] Creating new file");
        await this.app.vault.create(encounterPath, encounterContent);
      }

      console.log(`[SceneCreation - saveEncounterFile] ✅ Success! Path: ${encounterPath}`);
      new Notice(`✅ Encounter "${this.encounterName}" saved to z_Encounters`);
      
      return encounterPath;
    } catch (error) {
      console.error("[SceneCreation - saveEncounterFile] ERROR:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      new Notice(`⚠️ Could not save encounter file: ${errorMsg}`);
      return null;
    }
  }

  escapeYamlString(str: string): string {
    if (!str) return '""';
    // Use single quotes for YAML strings - only need to escape single quotes within
    // Single quotes are safer as they don't interpret escape sequences
    if (str.includes("'")) {
      // If string contains single quotes, double them (YAML escaping for single quotes)
      return "'" + str.replace(/'/g, "''") + "'";
    }
    // If no single quotes, just wrap in single quotes
    return "'" + str + "'";
  }


  /**
   * Generate encounter file content using the EXACT same format as EncounterBuilderModal
   */
  async generateEncounterContent(diffResult: any): Promise<string> {
    const currentDate = window.moment().format("YYYY-MM-DD");

    let frontmatter = `---
type: encounter
name: ${this.escapeYamlString(this.encounterName)}
creatures:`;

    for (const creature of this.creatures) {
      frontmatter += `\n  - name: ${this.escapeYamlString(creature.name)}
    count: ${creature.count}`;
      if (creature.hp) frontmatter += `\n    hp: ${creature.hp}`;
      if (creature.ac) frontmatter += `\n    ac: ${creature.ac}`;
      if (creature.cr) frontmatter += `\n    cr: ${this.escapeYamlString(creature.cr)}`;
      if (creature.source) frontmatter += `\n    source: ${this.escapeYamlString(creature.source)}`;
      if (creature.path) frontmatter += `\n    path: ${this.escapeYamlString(creature.path)}`;
    }

    frontmatter += `
include_party: ${this.includeParty}
use_color_names: ${this.useColorNames}`;

    if (this.selectedPartyId) frontmatter += `\nselected_party_id: ${this.escapeYamlString(this.selectedPartyId)}`;
    if (this.selectedPartyMembers.length > 0) {
      const selectedPartyName = this.selectedPartyMembers.join(", ");
      frontmatter += `\nselected_party_name: ${this.escapeYamlString(selectedPartyName)}`;
    }

    if (this.adventurePath) frontmatter += `\nadventure_path: ${this.escapeYamlString(this.adventurePath)}`;
    if (this.campaignPath) frontmatter += `\ncampaign_path: ${this.escapeYamlString(this.campaignPath)}`;

    frontmatter += `
difficulty:
  rating: ${this.escapeYamlString(diffResult.analysis.difficulty)}
  color: ${this.escapeYamlString(diffResult.analysis.difficultyColor)}
  party_count: ${diffResult.partyStats.memberCount}
  party_avg_level: ${diffResult.partyStats.avgLevel.toFixed(1)}
  party_total_hp: ${diffResult.partyStats.totalHP}
  party_avg_ac: ${diffResult.partyStats.avgAC.toFixed(1)}
  party_total_dpr: ${diffResult.partyStats.totalDPR.toFixed(1)}
  party_hit_chance: ${(diffResult.analysis.partyHitChance * 100).toFixed(0)}
  party_effective_dpr: ${diffResult.analysis.partyEffectiveDPR.toFixed(0)}
  enemy_count: ${diffResult.enemyStats.creatureCount}
  enemy_total_hp: ${diffResult.enemyStats.totalHP}
  enemy_avg_ac: ${diffResult.enemyStats.avgAC.toFixed(1)}
  enemy_total_dpr: ${diffResult.enemyStats.totalDPR.toFixed(1)}
  enemy_hit_chance: ${(diffResult.analysis.enemyHitChance * 100).toFixed(0)}
  enemy_effective_dpr: ${diffResult.analysis.enemyEffectiveDPR.toFixed(0)}
  rounds_to_defeat: ${diffResult.analysis.roundsToDefeatEnemies}
  rounds_party_survives: ${diffResult.analysis.roundsToDefeatParty}
  survival_ratio: ${diffResult.analysis.survivalRatio.toFixed(2)}
date: ${currentDate}
---`;

    // Use EXACT same content structure as EncounterBuilderModal
    const content = `${frontmatter}

# ${this.encounterName}

\`\`\`dataviewjs
// Create action buttons
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Open Initiative Tracker and load encounter button
const openTrackerBtn = buttonContainer.createEl("button", { 
  text: "⚔️ Open & Load in Tracker",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--interactive-accent); color: var(--text-on-accent);" }
});
openTrackerBtn.addEventListener("click", async () => {
  const encounterName = dv.current().name;
  const initiativeTracker = app.plugins?.plugins?.["initiative-tracker"];
  
  if (!initiativeTracker) {
    new Notice("Initiative Tracker plugin not found");
    return;
  }
  
  const encounter = initiativeTracker.data?.encounters?.[encounterName];
  if (!encounter) {
    new Notice("Encounter \\"" + encounterName + "\\" not found. Try recreating it.");
    return;
  }
  
  // Use Initiative Tracker's internal tracker API to load the encounter
  try {
    if (initiativeTracker.tracker?.new) {
      initiativeTracker.tracker.new(initiativeTracker, encounter);
      new Notice("✅ Loaded encounter: " + encounterName);
    } else {
      new Notice("⚠️ Could not load encounter. Try using Load Encounter from Initiative Tracker menu.");
    }
  } catch (e) {
    console.error("Error loading encounter:", e);
    new Notice("⚠️ Could not load encounter: " + e.message);
  }
  
  // Open Initiative Tracker view
  app.commands.executeCommandById("initiative-tracker:open-tracker");
});

// Edit button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-encounter");
});

// Delete button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-encounter");
});
\`\`\`

---

## Difficulty Analysis

\`\`\`dataviewjs
const diff = dv.current().difficulty;
if (!diff) {
  dv.paragraph("*No difficulty data available.*");
} else {
  // Create difficulty card
  const card = dv.el("div", "", { cls: "dnd-difficulty-card" });
  
  // Header with difficulty badge and rounds
  const header = dv.el("div", "", { cls: "dnd-difficulty-header", container: card });
  const badge = dv.el("span", diff.rating, { cls: "dnd-difficulty-badge", container: header });
  badge.style.backgroundColor = diff.color;
  dv.el("span", \` ~\${diff.rounds_to_defeat} round\${diff.rounds_to_defeat !== 1 ? 's' : ''}\`, { cls: "dnd-rounds-estimate", container: header });
  
  // Stats grid
  const grid = dv.el("div", "", { cls: "dnd-difficulty-stats-grid", container: card });
  
  // Party column
  const partyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`⚔️ Party (\${diff.party_count})\`, { container: partyCol });
  const partyStats = dv.el("div", "", { container: partyCol });
  partyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.party_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.party_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.party_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.party_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.party_effective_dpr}</strong></div>
  \`;
  
  // Enemy column
  const enemyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`👹 Enemies (\${diff.enemy_count})\`, { container: enemyCol });
  const enemyStats = dv.el("div", "", { container: enemyCol });
  enemyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.enemy_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.enemy_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.enemy_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.enemy_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.enemy_effective_dpr}</strong></div>
  \`;
  
  // 3-round analysis
  const analysis = dv.el("div", "", { cls: "dnd-difficulty-analysis", container: card });
  const partyDamage3 = diff.party_effective_dpr * 3;
  const enemyDamage3 = diff.enemy_effective_dpr * 3;
  const partyHPAfter3 = Math.max(0, diff.party_total_hp - enemyDamage3);
  const enemyHPAfter3 = Math.max(0, diff.enemy_total_hp - partyDamage3);
  const partyHPPercent = Math.round((partyHPAfter3 / diff.party_total_hp) * 100);
  const enemyHPPercent = Math.round((enemyHPAfter3 / diff.enemy_total_hp) * 100);
  
  analysis.innerHTML = \`
    <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
    <div>Party deals: <strong>\${Math.round(partyDamage3)}</strong> damage → Enemies at <strong>\${Math.round(enemyHPAfter3)}</strong> HP (\${enemyHPPercent}%)</div>
    <div>Enemies deal: <strong>\${Math.round(enemyDamage3)}</strong> damage → Party at <strong>\${Math.round(partyHPAfter3)}</strong> HP (\${partyHPPercent}%)</div>
    <div style="margin-top: 8px; opacity: 0.8;">
      Survival Ratio: \${diff.survival_ratio}
      (Party can survive \${diff.rounds_party_survives} rounds, enemies survive \${diff.rounds_to_defeat} rounds)
    </div>
  \`;
}
\`\`\`

---

## Creatures

\`\`\`dataviewjs
const creatures = dv.current().creatures || [];

if (creatures.length === 0) {
  dv.paragraph("*No creatures in this encounter.*");
} else {
  const table = creatures.map(c => {
    return [
      c.name,
      c.count || 1,
      c.cr || "?",
      c.hp || "?",
      c.ac || "?"
    ];
  });
  
  dv.table(["Creature", "Count", "CR", "HP", "AC"], table);
}
\`\`\`

---

## GM Notes

_Add notes about tactics, environment, or special conditions here._
`;

    return content;
  }

  /**
   * Get party members for the current campaign
   */
  async getCampaignPartyMembers(initiativePlugin: any): Promise<any[]> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getCampaignPartyMembers(initiativePlugin);
  }

  /**
   * Link encounter to scene by updating tracker_encounter frontmatter field
   */
  async linkEncounterToScene(scenePath: string) {
    this.syncEncounterBuilder();
    return this.encounterBuilder.linkEncounterToScene(scenePath);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class TrapCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  trapName = "";
  trapType: 'simple' | 'complex' = 'simple';
  threatLevel: 'setback' | 'dangerous' | 'deadly' = 'setback';
  minLevel = 1;
  maxLevel = 5;
  trigger = "";
  adventurePath = "";
  scenePath = "";
  
  elements: TrapElement[] = [];
  countermeasures: TrapCountermeasure[] = [];
  
  // UI containers
  elementsContainer: HTMLElement | null = null;
  countermeasuresContainer: HTMLElement | null = null;

  // For editing existing traps
  isEdit = false;
  originalTrapPath = "";
  originalTrapName = "";
  originalElements: TrapElement[] = [];

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, scenePath?: string, trapPath?: string) {
    super(app);
    this.plugin = plugin;
    if (adventurePath) this.adventurePath = adventurePath;
    if (scenePath) this.scenePath = scenePath;
    if (trapPath) {
      this.isEdit = true;
      this.originalTrapPath = trapPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // Load existing trap data if editing
    if (this.isEdit) {
      await this.loadTrapData();
    }
    
    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Trap" : "Create New Trap" });

    // Trap Name
    new Setting(contentEl)
      .setName("Trap Name")
      .setDesc("Name of the trap")
      .addText((text) =>
        text
          .setPlaceholder("Thundering Squall")
          .setValue(this.trapName)
          .onChange((value) => {
            this.trapName = value;
          })
      );

    // Trap Type
    new Setting(contentEl)
      .setName("Trap Type")
      .setDesc("Simple traps have basic effects. Complex traps have multiple initiatives and elements.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("simple", "Simple")
          .addOption("complex", "Complex")
          .setValue(this.trapType)
          .onChange((value) => {
            this.trapType = value as 'simple' | 'complex';
            this.refreshUI();
          })
      );

    // Threat Level
    new Setting(contentEl)
      .setName("Threat Level")
      .setDesc("How dangerous is this trap?")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("setback", "Setback")
          .addOption("dangerous", "Dangerous")
          .addOption("deadly", "Deadly")
          .setValue(this.threatLevel)
          .onChange((value: any) => {
            this.threatLevel = value;
          })
      );

    // Level Range
    new Setting(contentEl)
      .setName("Level Range")
      .setDesc("Minimum and maximum character levels for this trap")
      .addText((text) =>
        text
          .setPlaceholder("1")
          .setValue(this.minLevel.toString())
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 1 && num <= 20) {
              this.minLevel = num;
            }
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(this.maxLevel.toString())
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 1 && num <= 20) {
              this.maxLevel = num;
            }
          })
      );

    // Trigger
    new Setting(contentEl)
      .setName("Trigger")
      .setDesc("What activates this trap?")
      .addTextArea((text) => {
        text
          .setPlaceholder("A creature enters the area without the cult insignia...")
          .setValue(this.trigger)
          .onChange((value) => {
            this.trigger = value;
          });
        text.inputEl.rows = 3;
        text.inputEl.style.width = "100%";
      });

    // Elements Section
    contentEl.createEl("h3", { text: "Trap Elements" });
    this.elementsContainer = contentEl.createDiv();
    this.renderElements();

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Element")
          .onClick(() => {
            this.addElement();
          })
      );

    // Countermeasures Section
    contentEl.createEl("h3", { text: "Countermeasures" });
    this.countermeasuresContainer = contentEl.createDiv();
    this.renderCountermeasures();

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Countermeasure")
          .onClick(() => {
            this.addCountermeasure();
          })
      );

    // Adventure/Scene Link
    const adventureDisplay = this.adventurePath 
      ? this.adventurePath.split('/').pop()?.replace('.md', '') || 'None'
      : 'None';

    const sceneDisplay = this.scenePath
      ? this.scenePath.split('/').pop()?.replace('.md', '') || 'None'
      : 'None';

    contentEl.createEl("p", { 
      text: `Adventure: ${adventureDisplay} | Scene: ${sceneDisplay}`,
      attr: { style: "margin-top: 1em; font-size: 0.9em; color: var(--text-muted);" }
    });

    // Create Button
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText(this.isEdit ? "Update Trap" : "Create Trap")
        .setCta()
        .onClick(() => {
          this.createTrap();
        })
    );
  }

  refreshUI() {
    this.renderElements();
  }

  addElement() {
    const newElement: TrapElement = {
      name: "",
      element_type: this.trapType === 'simple' ? 'active' : 'active',
      initiative: this.trapType === 'complex' ? 20 : undefined,
      effect: ""
    };
    this.elements.push(newElement);
    this.renderElements();
  }

  removeElement(index: number) {
    this.elements.splice(index, 1);
    this.renderElements();
  }

  renderElements() {
    if (!this.elementsContainer) return;
    this.elementsContainer.empty();

    if (this.elements.length === 0) {
      this.elementsContainer.createEl("p", { 
        text: "No elements added yet. Click '+ Add Element' to add trap effects.",
        attr: { style: "color: var(--text-muted); font-style: italic;" }
      });
      return;
    }

    this.elements.forEach((element, index) => {
      const elementContainer = this.elementsContainer!.createDiv({ cls: "trap-element" });
      elementContainer.style.border = "1px solid var(--background-modifier-border)";
      elementContainer.style.padding = "10px";
      elementContainer.style.marginBottom = "10px";
      elementContainer.style.borderRadius = "5px";

      // Element header with remove button
      const headerDiv = elementContainer.createDiv();
      headerDiv.style.display = "flex";
      headerDiv.style.justifyContent = "space-between";
      headerDiv.style.alignItems = "center";
      headerDiv.style.marginBottom = "10px";

      headerDiv.createEl("h4", { text: `Element ${index + 1}`, attr: { style: "margin: 0;" } });
      
      const removeBtn = headerDiv.createEl("button", { text: "Remove" });
      removeBtn.style.padding = "2px 8px";
      removeBtn.style.fontSize = "0.8em";
      removeBtn.onclick = () => this.removeElement(index);

      // Name
      new Setting(elementContainer)
        .setName("Name")
        .addText((text) =>
          text
            .setPlaceholder("Thunderous Slam")
            .setValue(element.name)
            .onChange((value) => {
              element.name = value;
            })
        );

      // Element Type (for complex traps)
      if (this.trapType === 'complex') {
        new Setting(elementContainer)
          .setName("Element Type")
          .addDropdown((dropdown) =>
            dropdown
              .addOption("active", "Active (on initiative)")
              .addOption("dynamic", "Dynamic (conditional)")
              .addOption("constant", "Constant (ongoing)")
              .setValue(element.element_type)
              .onChange((value: any) => {
                element.element_type = value;
                this.renderElements();
              })
          );

        // Initiative (for active elements)
        if (element.element_type === 'active') {
          new Setting(elementContainer)
            .setName("Initiative")
            .addText((text) =>
              text
                .setPlaceholder("20")
                .setValue(element.initiative?.toString() || "")
                .onChange((value) => {
                  const num = parseInt(value);
                  if (!isNaN(num)) {
                    element.initiative = num;
                  }
                })
            );
        }

        // Condition (for dynamic elements)
        if (element.element_type === 'dynamic') {
          new Setting(elementContainer)
            .setName("Condition")
            .addTextArea((text) => {
              text
                .setPlaceholder("On each initiative count 10...")
                .setValue(element.condition || "")
                .onChange((value) => {
                  element.condition = value;
                });
              text.inputEl.rows = 2;
              text.inputEl.style.width = "100%";
            });
        }
      }

      // Attack Bonus
      new Setting(elementContainer)
        .setName("Attack Bonus (optional)")
        .addText((text) =>
          text
            .setPlaceholder("+8")
            .setValue(element.attack_bonus?.toString() || "")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num)) {
                element.attack_bonus = num;
              } else if (value === "") {
                element.attack_bonus = undefined;
              }
            })
        );

      // Range
      new Setting(elementContainer)
        .setName("Range (optional)")
        .addText((text) =>
          text
            .setPlaceholder("60 ft. or Touch or Melee")
            .setValue(element.range || "")
            .onChange((value) => {
              element.range = value || undefined;
            })
        );

      // Save DC
      new Setting(elementContainer)
        .setName("Save DC (optional)")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(element.save_dc?.toString() || "")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num)) {
                element.save_dc = num;
              } else if (value === "") {
                element.save_dc = undefined;
              }
            })
        )
        .addDropdown((dropdown) =>
          dropdown
            .addOption("DEX", "DEX")
            .addOption("STR", "STR")
            .addOption("CON", "CON")
            .addOption("INT", "INT")
            .addOption("WIS", "WIS")
            .addOption("CHA", "CHA")
            .setValue(element.save_ability || "DEX")
            .onChange((value) => {
              element.save_ability = value;
            })
        );

      // Damage
      new Setting(elementContainer)
        .setName("Damage (optional)")
        .addText((text) =>
          text
            .setPlaceholder("4d10 thunder")
            .setValue(element.damage || "")
            .onChange((value) => {
              element.damage = value || undefined;
            })
        );

      // Additional Damage
      new Setting(elementContainer)
        .setName("Additional Damage (optional)")
        .addText((text) =>
          text
            .setPlaceholder("2d6 fire (ongoing)")
            .setValue(element.additional_damage || "")
            .onChange((value) => {
              element.additional_damage = value || undefined;
            })
        );

      // Save Success/Failure (only if save_dc is set)
      if (element.save_dc) {
        new Setting(elementContainer)
          .setName("On Successful Save")
          .addTextArea((text) => {
            text
              .setPlaceholder("Takes half damage...")
              .setValue(element.on_success || "")
              .onChange((value) => {
                element.on_success = value || undefined;
              });
            text.inputEl.rows = 2;
            text.inputEl.style.width = "100%";
          });

        new Setting(elementContainer)
          .setName("On Failed Save")
          .addTextArea((text) => {
            text
              .setPlaceholder("Takes full damage and is knocked prone...")
              .setValue(element.on_failure || "")
              .onChange((value) => {
                element.on_failure = value || undefined;
              });
            text.inputEl.rows = 2;
            text.inputEl.style.width = "100%";
          });
      }

      // Effect
      new Setting(elementContainer)
        .setName("Effect")
        .addTextArea((text) => {
          text
            .setPlaceholder("The target is pushed 10 feet and knocked prone...")
            .setValue(element.effect || "")
            .onChange((value) => {
              element.effect = value;
            });
          text.inputEl.rows = 3;
          text.inputEl.style.width = "100%";
        });
    });
  }

  addCountermeasure() {
    const newCM: TrapCountermeasure = {
      method: "",
      dc: 15,
      checks_needed: 1
    };
    this.countermeasures.push(newCM);
    this.renderCountermeasures();
  }

  removeCountermeasure(index: number) {
    this.countermeasures.splice(index, 1);
    this.renderCountermeasures();
  }

  renderCountermeasures() {
    if (!this.countermeasuresContainer) return;
    this.countermeasuresContainer.empty();

    if (this.countermeasures.length === 0) {
      this.countermeasuresContainer.createEl("p", { 
        text: "No countermeasures added yet. Click '+ Add Countermeasure' to add ways to disable the trap.",
        attr: { style: "color: var(--text-muted); font-style: italic;" }
      });
      return;
    }

    this.countermeasures.forEach((cm, index) => {
      const cmContainer = this.countermeasuresContainer!.createDiv({ cls: "trap-countermeasure" });
      cmContainer.style.border = "1px solid var(--background-modifier-border)";
      cmContainer.style.padding = "10px";
      cmContainer.style.marginBottom = "10px";
      cmContainer.style.borderRadius = "5px";

      // Header with remove button
      const headerDiv = cmContainer.createDiv();
      headerDiv.style.display = "flex";
      headerDiv.style.justifyContent = "space-between";
      headerDiv.style.alignItems = "center";
      headerDiv.style.marginBottom = "10px";

      headerDiv.createEl("h4", { text: `Countermeasure ${index + 1}`, attr: { style: "margin: 0;" } });
      
      const removeBtn = headerDiv.createEl("button", { text: "Remove" });
      removeBtn.style.padding = "2px 8px";
      removeBtn.style.fontSize = "0.8em";
      removeBtn.onclick = () => this.removeCountermeasure(index);

      // Method
      new Setting(cmContainer)
        .setName("Method")
        .addText((text) =>
          text
            .setPlaceholder("Force open the door")
            .setValue(cm.method)
            .onChange((value) => {
              cm.method = value;
            })
        );

      // DC
      new Setting(cmContainer)
        .setName("DC")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(cm.dc?.toString() || "")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num)) {
                cm.dc = num;
              }
            })
        );

      // Checks Needed
      new Setting(cmContainer)
        .setName("Checks Needed")
        .setDesc("How many successful checks to complete?")
        .addText((text) =>
          text
            .setPlaceholder("1")
            .setValue(cm.checks_needed?.toString() || "1")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num) && num >= 1) {
                cm.checks_needed = num;
              }
            })
        );

      // Description
      new Setting(cmContainer)
        .setName("Description")
        .addTextArea((text) => {
          text
            .setPlaceholder("Three DC 20 Strength checks required to force the door...")
            .setValue(cm.description || "")
            .onChange((value) => {
              cm.description = value;
            });
          text.inputEl.rows = 2;
          text.inputEl.style.width = "100%";
        });

      // Effect
      new Setting(cmContainer)
        .setName("Effect on Success")
        .addTextArea((text) => {
          text
            .setPlaceholder("The trap is disabled...")
            .setValue(cm.effect || "")
            .onChange((value) => {
              cm.effect = value;
            });
          text.inputEl.rows = 2;
          text.inputEl.style.width = "100%";
        });
    });
  }

  async loadTrapData() {
    try {
      const trapFile = this.app.vault.getAbstractFileByPath(this.originalTrapPath);
      if (!(trapFile instanceof TFile)) {
        new Notice("Trap file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(trapFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read trap data!");
        return;
      }

      // Load basic trap properties
      this.trapName = frontmatter.trap_name || trapFile.basename;
      this.originalTrapName = this.trapName; // Store original name for statblock updates
      this.trapType = frontmatter.trap_type || 'simple';
      this.threatLevel = frontmatter.threat_level || 'setback';
      this.minLevel = frontmatter.min_level || 1;
      this.maxLevel = frontmatter.max_level || 5;
      this.trigger = frontmatter.trigger || "";
      this.adventurePath = frontmatter.adventure || "";
      this.scenePath = frontmatter.scene || "";

      // Load elements
      if (frontmatter.elements && Array.isArray(frontmatter.elements)) {
        this.elements = frontmatter.elements.map((e: any) => ({
          name: e.name || "",
          element_type: e.element_type || 'active',
          initiative: e.initiative,
          attack_bonus: e.attack_bonus,
          save_dc: e.save_dc,
          save_ability: e.save_ability,
          damage: e.damage,
          additional_damage: e.additional_damage,
          range: e.range,
          on_success: e.on_success,
          on_failure: e.on_failure,
          effect: e.effect || "",
          condition: e.condition
        }));
        // Store original elements to track deletions
        this.originalElements = JSON.parse(JSON.stringify(this.elements));
      }

      // Load countermeasures
      if (frontmatter.countermeasures && Array.isArray(frontmatter.countermeasures)) {
        this.countermeasures = frontmatter.countermeasures.map((cm: any) => ({
          method: cm.method || "",
          description: cm.description,
          dc: cm.dc,
          checks_needed: cm.checks_needed || 1,
          effect: cm.effect
        }));
      }

      console.log(`[Trap Edit] Loaded trap data: ${this.trapName}, ${this.elements.length} elements`);
    } catch (error) {
      console.error("Error loading trap data:", error);
      new Notice("Error loading trap data. Check console for details.");
    }
  }

  async createTrap() {
    if (!this.trapName) {
      new Notice("Please enter a trap name");
      return;
    }

    if (this.elements.length === 0) {
      new Notice("Please add at least one trap element");
      return;
    }

    try {
      // Get campaign and world info
      let campaignName = "";
      let worldName = "";

      if (this.adventurePath) {
        const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
        if (adventureFile instanceof TFile) {
          const content = await this.app.vault.read(adventureFile);
          const campaignMatch = content.match(/^campaign:\s*(.+)$/m);
          const worldMatch = content.match(/^world:\s*(.+)$/m);
          
          if (campaignMatch && campaignMatch[1]) campaignName = campaignMatch[1].trim();
          if (worldMatch && worldMatch[1]) worldName = worldMatch[1].trim();
        }
      }

      let trapPath: string;
      let trapFile: TFile | null = null;

      if (this.isEdit) {
        // Editing existing trap
        trapFile = this.app.vault.getAbstractFileByPath(this.originalTrapPath) as TFile;
        if (!trapFile) {
          new Notice("Original trap file not found!");
          return;
        }
        trapPath = this.originalTrapPath;

        // If trap name changed, handle file rename and statblock updates
        if (this.trapName !== this.originalTrapName) {
          // Delete old statblocks
          await this.plugin.deleteTrapStatblocks(this.originalTrapName);
          
          // Rename file if name changed
          const folder = trapPath.substring(0, trapPath.lastIndexOf('/'));
          const newPath = `${folder}/${this.trapName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`A trap named "${this.trapName}" already exists!`);
            return;
          }
          
          await this.app.fileManager.renameFile(trapFile, newPath);
          trapPath = newPath;
          trapFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        } else {
          // Same name - delete old statblocks and we'll recreate
          await this.plugin.deleteTrapStatblocks(this.originalTrapName);
        }

        // Track removed elements for complex traps
        if (this.trapType === 'complex') {
          // Find elements that were removed
          const currentElementNames = new Set(this.elements.map(e => e.name));
          const removedElements = this.originalElements.filter(e => !currentElementNames.has(e.name));
          
          if (removedElements.length > 0) {
            console.log(`[Trap Edit] Removed ${removedElements.length} elements, will delete their statblocks`);
            // Note: We already deleted all statblocks above, so this is just logging
          }
        }
      } else {
        // Creating new trap
        // Create trap file path in z_Traps folder
        let trapsFolder = "z_Traps";
        
        // If we have a campaign, create in campaign's z_Traps folder
        if (campaignName) {
          trapsFolder = `${campaignName}/z_Traps`;
        }
        
        // Ensure z_Traps folder exists
        if (!(await this.app.vault.adapter.exists(trapsFolder))) {
          await this.app.vault.createFolder(trapsFolder);
        }
        
        trapPath = `${trapsFolder}/${this.trapName}.md`;

        // Check if file already exists
        if (await this.app.vault.adapter.exists(trapPath)) {
          new Notice(`A trap named "${this.trapName}" already exists!`);
          return;
        }
      }

      // Create trap content with statblocks
      const trapContent = this.createTrapContent(campaignName, worldName);

      // Create or update the file
      if (this.isEdit && trapFile) {
        await this.app.vault.modify(trapFile, trapContent);
        new Notice(`Trap "${this.trapName}" updated!`);
      } else {
        await this.app.vault.create(trapPath, trapContent);
        new Notice(`Trap "${this.trapName}" created!`);
        trapFile = this.app.vault.getAbstractFileByPath(trapPath) as TFile;
      }

      // Save statblocks to Fantasy Statblocks plugin
      await this.saveStatblocks();

      this.close();

      // Open the trap file
      if (trapFile) {
        await this.app.workspace.getLeaf().openFile(trapFile);
      }
    } catch (error) {
      console.error("Error creating/editing trap:", error);
      new Notice("Failed to save trap. Check console for details.");
    }
  }

  createTrapContent(campaignName: string, worldName: string): string {
    const now = new Date().toISOString().split('T')[0];
    
    // Generate statblock content
    const statblockContent = this.generateStatblockContent();
    
    // Convert elements and countermeasures to YAML
    const elementsYaml = JSON.stringify(this.elements, null, 2)
      .split('\n')
      .map((line, idx) => idx === 0 ? line : '  ' + line)
      .join('\n');

    const countermeasuresYaml = JSON.stringify(this.countermeasures, null, 2)
      .split('\n')
      .map((line, idx) => idx === 0 ? line : '  ' + line)
      .join('\n');

    return `---
type: trap
template_version: 1.1.0
campaign: ${campaignName}
adventure: ${this.adventurePath?.split('/').pop()?.replace('.md', '') || ''}
world: ${worldName}
scene: ${this.scenePath?.split('/').pop()?.replace('.md', '') || ''}
trap_name: ${this.trapName}
trap_type: ${this.trapType}
threat_level: ${this.threatLevel}
min_level: ${this.minLevel}
max_level: ${this.maxLevel}
trigger: ${this.trigger}
elements: ${elementsYaml}
countermeasures: ${countermeasuresYaml}
date: ${now}
---

# ${this.trapName}

\`\`\`dataviewjs
// Action buttons for trap management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Trap button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Trap",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-trap");
});

// Delete Trap button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Trap",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-trap");
});
\`\`\`

## Trap Details

**Type:** ${this.trapType.charAt(0).toUpperCase() + this.trapType.slice(1)} Trap  
**Threat Level:** ${this.threatLevel.charAt(0).toUpperCase() + this.threatLevel.slice(1)}  
**Level Range:** ${this.minLevel}-${this.maxLevel}

### Trigger Condition
${this.trigger || "Not specified"}

---

## Statblocks

${statblockContent}

---

## Trap Elements & Effects

\`\`\`dataviewjs
const elements = dv.current().elements || [];
const trapType = dv.current().trap_type || 'simple';

if (elements.length === 0) {
  dv.paragraph("*No trap elements defined.*");
} else {
  if (trapType === 'simple') {
    for (const element of elements) {
      dv.header(4, element.name || "Effect");
      if (element.attack_bonus !== undefined) {
        dv.paragraph(\`**Attack:** +\${element.attack_bonus} to hit\${element.range ? \`, \${element.range}\` : ""}\`);
      }
      if (element.save_dc !== undefined) {
        dv.paragraph(\`**Save:** DC \${element.save_dc} \${element.save_ability || "DEX"}\`);
      }
      if (element.damage) {
        dv.paragraph(\`**Damage:** \${element.damage}\`);
      }
      if (element.additional_damage) {
        dv.paragraph(\`**Additional Damage:** \${element.additional_damage}\`);
      }
      if (element.on_success) {
        dv.paragraph(\`**On Success:** \${element.on_success}\`);
      }
      if (element.on_failure) {
        dv.paragraph(\`**On Failure:** \${element.on_failure}\`);
      }
      if (element.effect) {
        dv.paragraph(\`**Effect:** \${element.effect}\`);
      }
      dv.paragraph("");
    }
  } else {
    const byInitiative = new Map();
    const constant = [];
    const dynamic = [];
    
    for (const element of elements) {
      if (element.element_type === 'constant') {
        constant.push(element);
      } else if (element.element_type === 'dynamic') {
        dynamic.push(element);
      } else if (element.initiative !== undefined) {
        if (!byInitiative.has(element.initiative)) {
          byInitiative.set(element.initiative, []);
        }
        byInitiative.get(element.initiative).push(element);
      }
    }
    
    if (byInitiative.size > 0) {
      dv.header(3, "Initiative Actions");
      const sortedInit = Array.from(byInitiative.keys()).sort((a, b) => b - a);
      for (const init of sortedInit) {
        dv.header(4, \`Initiative \${init}\`);
        for (const element of byInitiative.get(init)) {
          dv.paragraph(\`**\${element.name || "Effect"}**\`);
          if (element.attack_bonus !== undefined) {
            dv.paragraph(\`  Attack: +\${element.attack_bonus} to hit\${element.range ? \`, \${element.range}\` : ""}\`);
          }
          if (element.save_dc !== undefined) {
            dv.paragraph(\`  Save: DC \${element.save_dc} \${element.save_ability || "DEX"}\`);
          }
          if (element.damage) {
            dv.paragraph(\`  Damage: \${element.damage}\`);
          }
          if (element.additional_damage) {
            dv.paragraph(\`  Additional Damage: \${element.additional_damage}\`);
          }
          if (element.on_success) {
            dv.paragraph(\`  On Success: \${element.on_success}\`);
          }
          if (element.on_failure) {
            dv.paragraph(\`  On Failure: \${element.on_failure}\`);
          }
          if (element.effect) {
            dv.paragraph(\`  Effect: \${element.effect}\`);
          }
          dv.paragraph("");
        }
      }
    }
    
    if (dynamic.length > 0) {
      dv.header(3, "Dynamic Elements");
      for (const element of dynamic) {
        dv.paragraph(\`**\${element.name || "Dynamic Effect"}**\`);
        if (element.condition) {
          dv.paragraph(\`  Condition: \${element.condition}\`);
        }
        if (element.effect) {
          dv.paragraph(\`  Effect: \${element.effect}\`);
        }
        dv.paragraph("");
      }
    }
    
    if (constant.length > 0) {
      dv.header(3, "Constant Effects");
      for (const element of constant) {
        dv.paragraph(\`**\${element.name || "Constant Effect"}**\`);
        if (element.effect) {
          dv.paragraph(\`  \${element.effect}\`);
        }
        dv.paragraph("");
      }
    }
  }
}
\`\`\`

---

## Countermeasures

\`\`\`dataviewjs
const countermeasures = dv.current().countermeasures || [];

if (countermeasures.length === 0) {
  dv.paragraph("*No countermeasures defined.*");
} else {
  for (const cm of countermeasures) {
    dv.header(4, cm.method || "Countermeasure");
    
    if (cm.dc !== undefined) {
      dv.paragraph(\`**DC:** \${cm.dc}\`);
    }
    if (cm.checks_needed !== undefined && cm.checks_needed > 1) {
      dv.paragraph(\`**Checks Needed:** \${cm.checks_needed}\`);
    }
    if (cm.description) {
      dv.paragraph(\`**Description:** \${cm.description}\`);
    }
    if (cm.effect) {
      dv.paragraph(\`**Effect on Success:** \${cm.effect}\`);
    }
    dv.paragraph("");
  }
}
\`\`\`

---

## GM Notes

### Setup
*How to describe and introduce this trap*

### Running the Trap
*Tips for managing the trap in combat*

### Disabling
*Additional notes on countermeasures and player creativity*

---

## Session History

**Created:** ${now}

*Record when this trap was encountered and what happened*
`;
  }

  async saveStatblocks() {
    try {
      const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
      if (!statblocksPlugin) {
        console.warn("Fantasy Statblocks plugin not found. Statblocks will not be saved to bestiary.");
        return;
      }

      const homebrewSource = `Trap: ${this.trapName}`;
      const homebrewCreatures: any[] = [];

      if (this.trapType === 'simple') {
        // Create single statblock for simple trap
        const statblock = this.createSimpleStatblock(homebrewSource);
        homebrewCreatures.push(statblock);
      } else {
        // Create multiple statblocks for complex trap
        const statblocks = this.createComplexStatblocks(homebrewSource);
        homebrewCreatures.push(...statblocks);
      }

      // Save to Fantasy Statblocks bestiary
      if (homebrewCreatures.length > 0) {
        console.log("Attempting to save trap statblocks:", homebrewCreatures);
        
        // Try multiple methods to save the monsters
        if (statblocksPlugin.saveMonsters) {
          // Method 1: Direct saveMonsters API
          await statblocksPlugin.saveMonsters(homebrewCreatures);
          console.log(`Saved ${homebrewCreatures.length} trap statblock(s) via saveMonsters`);
        } else if (statblocksPlugin.api?.saveMonsters) {
          // Method 2: API object saveMonsters
          await statblocksPlugin.api.saveMonsters(homebrewCreatures);
          console.log(`Saved ${homebrewCreatures.length} trap statblock(s) via api.saveMonsters`);
        } else if (statblocksPlugin.data?.monsters) {
          // Method 3: Direct data manipulation
          if (!Array.isArray(statblocksPlugin.data.monsters)) {
            statblocksPlugin.data.monsters = [];
          }
          
          // Add each creature to the monsters array
          for (const creature of homebrewCreatures) {
            // Check if creature already exists (by name and source)
            const existingIndex = statblocksPlugin.data.monsters.findIndex(
              (m: any) => m.name === creature.name && m.source === creature.source
            );
            
            if (existingIndex >= 0) {
              // Replace existing creature
              statblocksPlugin.data.monsters[existingIndex] = creature;
              console.log(`Updated existing trap statblock: ${creature.name}`);
            } else {
              // Add new creature
              statblocksPlugin.data.monsters.push(creature);
              console.log(`Added new trap statblock: ${creature.name}`);
            }
          }
          
          // Save plugin data
          await statblocksPlugin.saveData(statblocksPlugin.data);
          console.log(`Saved ${homebrewCreatures.length} trap statblock(s) via data.monsters`);
        } else {
          console.warn("No valid method found to save monsters to Fantasy Statblocks plugin");
          console.warn("Available plugin methods:", Object.keys(statblocksPlugin));
          console.warn("Available plugin.api methods:", statblocksPlugin.api ? Object.keys(statblocksPlugin.api) : "No API");
        }
      }
    } catch (error) {
      console.error("Error saving trap statblocks:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      // Don't fail the trap creation if statblock saving fails
    }
  }

  createSimpleStatblock(source: string): any {
    const element = this.elements[0]; // Use first element for simple trap
    
    // Build actions from trap element
    const actions: any[] = [];
    
    if (element) {
      const action: any = {
        name: element.name || "Trap Effect",
        desc: ""
      };

      if (element.attack_bonus !== undefined) {
        const range = element.range || "reach 5 ft. or range 60 ft.";
        action.desc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
      }

      if (element.save_dc !== undefined) {
        action.desc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
      }

      if (element.damage) {
        if (element.attack_bonus !== undefined) {
          action.desc += `Hit: ${element.damage} damage. `;
        } else if (element.save_dc !== undefined) {
          // Use custom success/failure text if provided
          if (element.on_failure) {
            action.desc += `On a failed save: ${element.on_failure} `;
          } else {
            action.desc += `On a failed save: ${element.damage} damage`;
            if (element.on_success) {
              action.desc += `, ${element.on_success} `;
            } else {
              action.desc += `, or half as much damage on a successful one. `;
            }
          }
        }
      } else if (element.save_dc && (element.on_failure || element.on_success)) {
        // No damage but has success/failure effects
        if (element.on_failure) {
          action.desc += `On a failed save: ${element.on_failure} `;
        }
        if (element.on_success) {
          action.desc += `On a successful save: ${element.on_success} `;
        }
      }

      if (element.additional_damage) {
        action.desc += `Additional: ${element.additional_damage}. `;
      }

      if (element.effect) {
        action.desc += element.effect;
      }

      actions.push(action);
    }

    // Build traits from countermeasures
    const traits: any[] = this.countermeasures.map(cm => ({
      name: `Countermeasure: ${cm.method}`,
      desc: `${cm.description || cm.method}${cm.dc ? ` (DC ${cm.dc})` : ''}${cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : ''} ${cm.effect || ''}`
    }));

    return {
      name: this.trapName,
      source: source,
      type: "trap",
      size: "Large",
      alignment: "unaligned",
      ac: 15,
      hp: 50,
      speed: "0 ft.",
      stats: [10, 10, 10, 10, 10, 10],
      senses: "—",
      languages: "—",
      cr: this.calculateTrapCR(),
      traits: traits,
      actions: actions,
      layout: "Basic 5e Layout"
    };
  }

  createComplexStatblocks(source: string): any[] {
    const statblocks: any[] = [];

    // Group elements by initiative
    const byInitiative = new Map<number, TrapElement[]>();
    const constantElements: TrapElement[] = [];
    const dynamicElements: TrapElement[] = [];

    for (const element of this.elements) {
      if (element.element_type === 'constant') {
        constantElements.push(element);
      } else if (element.element_type === 'dynamic') {
        dynamicElements.push(element);
      } else if (element.initiative !== undefined) {
        if (!byInitiative.has(element.initiative)) {
          byInitiative.set(element.initiative, []);
        }
        byInitiative.get(element.initiative)!.push(element);
      }
    }

    console.log(`[createComplexStatblocks] Processing ${this.elements.length} elements`);
    console.log(`[createComplexStatblocks] Initiative groups: ${byInitiative.size}`);
    console.log(`[createComplexStatblocks] Constant elements: ${constantElements.length}`);
    console.log(`[createComplexStatblocks] Dynamic elements: ${dynamicElements.length}`);

    // Create statblock for each initiative group
    for (const [initiative, elements] of byInitiative.entries()) {
      console.log(`[createComplexStatblocks] Creating statblock for initiative ${initiative} with ${elements.length} elements`);
      
      const actions: any[] = elements.map(element => {
        let desc = "";

        if (element.attack_bonus !== undefined) {
          const range = element.range || "reach 5 ft. or range 60 ft.";
          desc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
        }

        if (element.save_dc !== undefined) {
          desc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
        }

        if (element.damage) {
          if (element.attack_bonus !== undefined) {
            desc += `Hit: ${element.damage} damage. `;
          } else if (element.save_dc !== undefined) {
            // Use custom success/failure text if provided
            if (element.on_failure) {
              desc += `On a failed save: ${element.on_failure} `;
            } else {
              desc += `On a failed save: ${element.damage} damage`;
              if (element.on_success) {
                desc += `, ${element.on_success} `;
              } else {
                desc += `, or half as much damage on a successful one. `;
              }
            }
          }
        } else if (element.save_dc && (element.on_failure || element.on_success)) {
          // No damage but has success/failure effects
          if (element.on_failure) {
            desc += `On a failed save: ${element.on_failure} `;
          }
          if (element.on_success) {
            desc += `On a successful save: ${element.on_success} `;
          }
        }

        if (element.additional_damage) {
          desc += `Additional: ${element.additional_damage}. `;
        }

        if (element.effect) {
          desc += element.effect;
        }

        return {
          name: element.name || "Effect",
          desc: desc
        };
      });

      const initTraits: any[] = [
        {
          name: "Fixed Initiative",
          desc: `This trap element acts on initiative count ${initiative}. Do not roll initiative for this creature.`
        }
      ];

      statblocks.push({
        name: `${this.trapName} (Initiative ${initiative})`,
        source: source,
        type: "trap",
        size: "Large",
        alignment: "unaligned",
        ac: 15,
        hp: 1,
        speed: "0 ft.",
        stats: [10, 10, 10, 10, 10, 10],
        senses: "—",
        languages: "—",
        cr: 0,
        modifier: initiative,
        initiative: initiative,  // Fixed initiative value
        traits: initTraits,
        actions: actions,
        layout: "Basic 5e Layout"
      });
      
      console.log(`[createComplexStatblocks] Added statblock: ${this.trapName} (Initiative ${initiative})`);
    }

    console.log(`[createComplexStatblocks] Total statblocks created: ${statblocks.length}`);
    
    // Create constant effects statblock if any
    if (constantElements.length > 0) {
      const traits: any[] = constantElements.map(element => ({
        name: element.name || "Constant Effect",
        desc: element.effect || ""
      }));

      statblocks.push({
        name: `${this.trapName} (Constant)`,
        source: source,
        type: "trap",
        size: "Large",
        alignment: "unaligned",
        ac: 15,
        hp: 1,
        speed: "0 ft.",
        stats: [10, 10, 10, 10, 10, 10],
        senses: "—",
        languages: "—",
        cr: 0,
        traits: traits,
        actions: [],
        layout: "Basic 5e Layout"
      });
    }

    // Create dynamic effects statblock if any
    if (dynamicElements.length > 0) {
      const traits: any[] = dynamicElements.map(element => ({
        name: element.name || "Dynamic Effect",
        desc: `${element.condition ? 'Condition: ' + element.condition + '. ' : ''}${element.effect || ''}`
      }));

      statblocks.push({
        name: `${this.trapName} (Dynamic)`,
        source: source,
        type: "trap",
        size: "Large",
        alignment: "unaligned",
        ac: 15,
        hp: 1,
        speed: "0 ft.",
        stats: [10, 10, 10, 10, 10, 10],
        senses: "—",
        languages: "—",
        cr: 0,
        traits: traits,
        actions: [],
        layout: "Basic 5e Layout"
      });
    }

    // Add countermeasures to first statblock
    if (statblocks.length > 0 && this.countermeasures.length > 0) {
      const counterTraits = this.countermeasures.map(cm => ({
        name: `Countermeasure: ${cm.method}`,
        desc: `${cm.description || cm.method}${cm.dc ? ` (DC ${cm.dc})` : ''}${cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : ''} ${cm.effect || ''}`
      }));
      statblocks[0].traits = [...statblocks[0].traits, ...counterTraits];
    }

    return statblocks;
  }

  calculateTrapCR(): number {
    // Calculate average damage per activation
    let totalDamage = 0;
    let maxDC = 0;
    let maxAttackBonus = 0;
    let elementCount = 0;

    for (const element of this.elements) {
      if (element.damage) {
        // Parse damage string to get average (e.g., "4d10" -> 22, "2d6+3" -> 10)
        const avgDamage = this.parseDamageAverage(element.damage);
        totalDamage += avgDamage;
        elementCount++;
      }

      if (element.save_dc && element.save_dc > maxDC) {
        maxDC = element.save_dc;
      }

      if (element.attack_bonus && element.attack_bonus > maxAttackBonus) {
        maxAttackBonus = element.attack_bonus;
      }
    }

    // If no damage, return CR 0
    if (totalDamage === 0) {
      return 0;
    }

    // For complex traps, consider how many elements activate per round
    let dpr = totalDamage;
    if (this.trapType === 'complex') {
      // Count unique initiatives (elements that can activate in same round)
      const initiatives = new Set(
        this.elements
          .filter(e => e.element_type === 'active' && e.initiative !== undefined)
          .map(e => e.initiative)
      );
      
      // If multiple initiatives, trap deals damage over multiple rounds
      // Average DPR is lower
      if (initiatives.size > 1) {
        dpr = totalDamage / initiatives.size;
      }
    }

    // Find CR based on DPR using existing CR tables
    let estimatedCR = this.findCRByDPR(dpr);

    // Adjust based on save DC or attack bonus
    const dcOrAttack = maxDC > 0 ? maxDC : maxAttackBonus;
    if (dcOrAttack > 0) {
      const crByDC = this.findCRByDC(dcOrAttack);
      // Average the two estimates
      estimatedCR = Math.round((estimatedCR + crByDC) / 2);
    }

    // Apply threat level modifier
    if (this.threatLevel === 'dangerous') {
      estimatedCR = Math.ceil(estimatedCR * 1.25);
    } else if (this.threatLevel === 'deadly') {
      estimatedCR = Math.ceil(estimatedCR * 1.5);
    } else if (this.threatLevel === 'setback') {
      estimatedCR = Math.max(0, Math.floor(estimatedCR * 0.75));
    }

    // Clamp to reasonable range based on level range
    const minCR = Math.max(0, Math.floor(this.minLevel / 4));
    const maxCR = Math.ceil(this.maxLevel / 2);
    estimatedCR = Math.max(minCR, Math.min(maxCR, estimatedCR));

    return estimatedCR;
  }

  parseDamageAverage(damageStr: string | undefined): number {
    // Parse damage strings like "4d10", "2d6+3", "22", etc.
    if (!damageStr) return 0;
    
    let cleanDamage = damageStr.trim().toLowerCase();
    
    // Remove damage type (e.g., "4d10 fire" -> "4d10")
    const parts = cleanDamage.split(' ');
    cleanDamage = parts[0] || cleanDamage;

    // Check if it's just a number
    const staticDamage = parseInt(cleanDamage);
    if (!isNaN(staticDamage)) {
      return staticDamage;
    }

    // Parse dice notation: XdY+Z or XdY-Z or XdY
    const diceMatch = cleanDamage.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (diceMatch) {
      const numDice = parseInt(diceMatch[1]!);
      const dieSize = parseInt(diceMatch[2]!);
      const modifier = diceMatch[3] ? parseInt(diceMatch[3]) : 0;
      
      // Average of XdY is X * (Y+1)/2
      const avgRoll = numDice * (dieSize + 1) / 2;
      return Math.floor(avgRoll + modifier);
    }

    // Couldn't parse, return 0
    return 0;
  }

  findCRByDPR(dpr: number): number {
    // Use existing CR table to find closest CR by DPR
    // CR table from getCRStats function
    const crDPRTable = [
      { cr: 0, dpr: 1 },
      { cr: 0.125, dpr: 2 },
      { cr: 0.25, dpr: 3 },
      { cr: 0.5, dpr: 5 },
      { cr: 1, dpr: 8 },
      { cr: 2, dpr: 15 },
      { cr: 3, dpr: 21 },
      { cr: 4, dpr: 27 },
      { cr: 5, dpr: 33 },
      { cr: 6, dpr: 39 },
      { cr: 7, dpr: 45 },
      { cr: 8, dpr: 51 },
      { cr: 9, dpr: 57 },
      { cr: 10, dpr: 63 },
      { cr: 11, dpr: 69 },
      { cr: 12, dpr: 75 },
      { cr: 13, dpr: 81 },
      { cr: 14, dpr: 87 },
      { cr: 15, dpr: 93 },
      { cr: 16, dpr: 99 },
      { cr: 17, dpr: 105 },
      { cr: 18, dpr: 111 },
      { cr: 19, dpr: 117 },
      { cr: 20, dpr: 123 },
      { cr: 21, dpr: 140 },
      { cr: 22, dpr: 150 },
      { cr: 23, dpr: 160 },
      { cr: 24, dpr: 170 },
      { cr: 25, dpr: 180 },
      { cr: 26, dpr: 190 },
      { cr: 27, dpr: 200 },
      { cr: 28, dpr: 210 },
      { cr: 29, dpr: 220 },
      { cr: 30, dpr: 230 }
    ];

    // Find closest CR
    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDPRTable) {
      const diff = Math.abs(entry.dpr - dpr);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return Math.floor(closestCR);
  }

  findCRByDC(dc: number): number {
    // Find CR based on save DC or attack bonus
    // From DMG: DC starts at 13 for CR 0, increases by ~1 every 2-3 CR
    const crDCTable = [
      { cr: 0, dc: 13 },
      { cr: 1, dc: 13 },
      { cr: 2, dc: 13 },
      { cr: 3, dc: 13 },
      { cr: 4, dc: 14 },
      { cr: 5, dc: 15 },
      { cr: 6, dc: 15 },
      { cr: 7, dc: 15 },
      { cr: 8, dc: 16 },
      { cr: 9, dc: 16 },
      { cr: 10, dc: 16 },
      { cr: 11, dc: 17 },
      { cr: 12, dc: 17 },
      { cr: 13, dc: 18 },
      { cr: 14, dc: 18 },
      { cr: 15, dc: 18 },
      { cr: 16, dc: 18 },
      { cr: 17, dc: 19 },
      { cr: 18, dc: 19 },
      { cr: 19, dc: 19 },
      { cr: 20, dc: 19 },
      { cr: 21, dc: 20 },
      { cr: 22, dc: 20 },
      { cr: 23, dc: 20 },
      { cr: 24, dc: 21 },
      { cr: 25, dc: 22 },
      { cr: 26, dc: 22 },
      { cr: 27, dc: 22 },
      { cr: 28, dc: 23 },
      { cr: 29, dc: 23 },
      { cr: 30, dc: 24 }
    ];

    // Find closest CR
    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDCTable) {
      const diff = Math.abs(entry.dc - dc);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return Math.floor(closestCR);
  }

  generateStatblockContent(): string {
    if (this.trapType === 'simple') {
      return this.generateSimpleStatblockContent();
    } else {
      return this.generateComplexStatblockContent();
    }
  }

  generateSimpleStatblockContent(): string {
    const element = this.elements[0];
    const homebrewSource = `Trap: ${this.trapName}`;

    let actionsContent = '';
    if (element) {
      let actionDesc = '';
      
      if (element.attack_bonus !== undefined) {
        const range = element.range || "reach 5 ft. or range 60 ft.";
        actionDesc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
      }
      
      if (element.save_dc !== undefined) {
        actionDesc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
      }
      
      if (element.damage) {
        if (element.attack_bonus !== undefined) {
          actionDesc += `Hit: ${element.damage} damage. `;
        } else if (element.save_dc !== undefined) {
          // Use custom success/failure text if provided
          if (element.on_failure) {
            actionDesc += `On a failed save: ${element.on_failure} `;
          } else {
            actionDesc += `On a failed save: ${element.damage} damage`;
            if (element.on_success) {
              actionDesc += `, ${element.on_success} `;
            } else {
              actionDesc += `, or half as much damage on a successful one. `;
            }
          }
        }
      } else if (element.save_dc && (element.on_failure || element.on_success)) {
        // No damage but has success/failure effects
        if (element.on_failure) {
          actionDesc += `On a failed save: ${element.on_failure} `;
        }
        if (element.on_success) {
          actionDesc += `On a successful save: ${element.on_success} `;
        }
      }
      
      if (element.additional_damage) {
        actionDesc += `Additional: ${element.additional_damage}. `;
      }
      
      if (element.effect) {
        actionDesc += element.effect;
      }

      actionsContent = `actions:
  - name: "${element.name || "Trap Effect"}"
    desc: "${actionDesc}"`;
    }

    let traitsContent = '';
    if (this.countermeasures.length > 0) {
      traitsContent = 'traits:\n';
      for (const cm of this.countermeasures) {
        const dcText = cm.dc ? ` (DC ${cm.dc})` : '';
        const checksText = cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : '';
        const traitDesc = `${cm.description || cm.method}${dcText}${checksText} ${cm.effect || ''}`;
        traitsContent += `  - name: "Countermeasure: ${cm.method}"\n    desc: "${traitDesc}"\n`;
      }
    }

    return `\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName}"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 50
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: ${this.calculateTrapCR()}
${traitsContent}${actionsContent}
\`\`\``;
  }

  generateComplexStatblockContent(): string {
    const homebrewSource = `Trap: ${this.trapName}`;
    let statblockContent = '';

    // Group elements by initiative
    const byInitiative = new Map<number, TrapElement[]>();
    const constantElements: TrapElement[] = [];
    const dynamicElements: TrapElement[] = [];

    for (const element of this.elements) {
      if (element.element_type === 'constant') {
        constantElements.push(element);
      } else if (element.element_type === 'dynamic') {
        dynamicElements.push(element);
      } else if (element.initiative !== undefined) {
        if (!byInitiative.has(element.initiative)) {
          byInitiative.set(element.initiative, []);
        }
        byInitiative.get(element.initiative)!.push(element);
      }
    }

    // Create statblock for each initiative
    const sortedInits = Array.from(byInitiative.keys()).sort((a, b) => b - a);
    for (const initiative of sortedInits) {
      const elements = byInitiative.get(initiative)!;
      
      let actionsContent = '';
      if (elements.length > 0) {
        actionsContent = 'actions:\n';
        for (const element of elements) {
          let actionDesc = '';
          
          if (element.attack_bonus !== undefined) {
            const range = element.range || "reach 5 ft. or range 60 ft.";
            actionDesc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
          }
          
          if (element.save_dc !== undefined) {
            actionDesc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
          }
          
          if (element.damage) {
            if (element.attack_bonus !== undefined) {
              actionDesc += `Hit: ${element.damage} damage. `;
            } else if (element.save_dc !== undefined) {
              // Use custom success/failure text if provided
              if (element.on_failure) {
                actionDesc += `On a failed save: ${element.on_failure} `;
              } else {
                actionDesc += `On a failed save: ${element.damage} damage`;
                if (element.on_success) {
                  actionDesc += `, ${element.on_success} `;
                } else {
                  actionDesc += `, or half as much damage on a successful one. `;
                }
              }
            }
          } else if (element.save_dc && (element.on_failure || element.on_success)) {
            // No damage but has success/failure effects
            if (element.on_failure) {
              actionDesc += `On a failed save: ${element.on_failure} `;
            }
            if (element.on_success) {
              actionDesc += `On a successful save: ${element.on_success} `;
            }
          }
          
          if (element.additional_damage) {
            actionDesc += `Additional: ${element.additional_damage}. `;
          }
          
          if (element.effect) {
            actionDesc += element.effect;
          }

          actionsContent += `  - name: "${element.name || "Effect"}"\n    desc: "${actionDesc}"\n`;
        }
      }

      const traitsContent = `traits:
  - name: "Fixed Initiative"
    desc: "This trap element acts on initiative count ${initiative}. Do not roll initiative for this creature."
`;

      statblockContent += `\n\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName} (Initiative ${initiative})"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 1
modifier: ${initiative}
initiative: ${initiative}
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: 0
${traitsContent}${actionsContent}\`\`\`\n`;
    }

    // Add constant effects statblock
    if (constantElements.length > 0) {
      let traitsContent = 'traits:\n';
      for (const element of constantElements) {
        traitsContent += `  - name: "${element.name || "Constant Effect"}"\n    desc: "${element.effect || ""}"\n`;
      }

      statblockContent += `\n\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName} (Constant)"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 1
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: 0
${traitsContent}\`\`\`\n`;
    }

    // Add dynamic effects statblock
    if (dynamicElements.length > 0) {
      let traitsContent = 'traits:\n';
      for (const element of dynamicElements) {
        const traitDesc = `${element.condition ? 'Condition: ' + element.condition + '. ' : ''}${element.effect || ''}`;
        traitsContent += `  - name: "${element.name || "Dynamic Effect"}"\n    desc: "${traitDesc}"\n`;
      }

      statblockContent += `\n\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName} (Dynamic)"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 1
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: 0
${traitsContent}\`\`\`\n`;
    }

    // Add countermeasures to first statblock or as separate section
    if (this.countermeasures.length > 0) {
      statblockContent += '\n## Countermeasures\n\n';
      for (const cm of this.countermeasures) {
        const dcText = cm.dc ? ` (DC ${cm.dc})` : '';
        const checksText = cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : '';
        const cmDesc = `${cm.description || cm.method}${dcText}${checksText} ${cm.effect || ''}`;
        statblockContent += `- **${cm.method}:** ${cmDesc}\n`;
      }
    }

    return statblockContent;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class ItemCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  itemName = "";
  itemType: 'simple' | 'evolving' = 'simple';
  rarity: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact' = 'common';
  requiresAttunement = false;
  attunementRequirement = "";
  category: 'weapon' | 'armor' | 'wondrous' | 'potion' | 'scroll' | 'ring' | 'rod' | 'staff' | 'wand' | 'other' = 'other';
  
  // Simple item properties
  description = "";
  weight = "";
  value = "";
  
  // Evolving item properties
  evolvesWithLevel = false;
  levelThresholds: { level: number; description: string }[] = [];
  
  // Container for level thresholds UI
  levelThresholdsContainer: HTMLElement | null = null;

  // For editing existing items
  isEdit = false;
  originalItemPath = "";
  originalItemName = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, itemPath?: string) {
    super(app);
    this.plugin = plugin;
    if (itemPath) {
      this.isEdit = true;
      this.originalItemPath = itemPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // Load existing item data if editing
    if (this.isEdit) {
      await this.loadItemData();
    }
    
    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Item" : "⚔️ Create New Item" });

    // Item Name
    new Setting(contentEl)
      .setName("Item Name")
      .setDesc("Name of the item")
      .addText((text) =>
        text
          .setPlaceholder("Sword of the Planes")
          .setValue(this.itemName)
          .onChange((value) => {
            this.itemName = value;
          })
      );

    // Item Type
    new Setting(contentEl)
      .setName("Item Type")
      .setDesc("Simple items are standard D&D items. Evolving items grow with the character's level.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("simple", "Simple D&D 5e Item")
          .addOption("evolving", "Evolving Homebrew Item")
          .setValue(this.itemType)
          .onChange((value) => {
            this.itemType = value as 'simple' | 'evolving';
            this.refreshUI();
          })
      );

    // Category
    new Setting(contentEl)
      .setName("Category")
      .setDesc("Type of item")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("weapon", "Weapon")
          .addOption("armor", "Armor")
          .addOption("wondrous", "Wondrous Item")
          .addOption("potion", "Potion")
          .addOption("scroll", "Scroll")
          .addOption("ring", "Ring")
          .addOption("rod", "Rod")
          .addOption("staff", "Staff")
          .addOption("wand", "Wand")
          .addOption("other", "Other")
          .setValue(this.category)
          .onChange((value: any) => {
            this.category = value;
          })
      );

    // Rarity
    new Setting(contentEl)
      .setName("Rarity")
      .setDesc("How rare is this item?")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("common", "Common")
          .addOption("uncommon", "Uncommon")
          .addOption("rare", "Rare")
          .addOption("very rare", "Very Rare")
          .addOption("legendary", "Legendary")
          .addOption("artifact", "Artifact")
          .setValue(this.rarity)
          .onChange((value: any) => {
            this.rarity = value;
          })
      );

    // Requires Attunement
    new Setting(contentEl)
      .setName("Requires Attunement")
      .setDesc("Does this item require attunement?")
      .addToggle((toggle) =>
        toggle
          .setValue(this.requiresAttunement)
          .onChange((value) => {
            this.requiresAttunement = value;
            this.refreshUI();
          })
      );

    // Attunement Requirement (conditional)
    if (this.requiresAttunement) {
      new Setting(contentEl)
        .setName("Attunement Requirement")
        .setDesc("e.g., 'by a spellcaster', 'by a paladin', leave empty for no specific requirement")
        .addText((text) => {
          text
            .setPlaceholder("by a wizard")
            .setValue(this.attunementRequirement)
            .onChange((value) => {
              this.attunementRequirement = value;
            });
          text.inputEl.style.width = "100%";
        });
    }

    // Weight and Value
    new Setting(contentEl)
      .setName("Weight")
      .setDesc("Item weight (e.g., '3 lb.')")
      .addText((text) =>
        text
          .setPlaceholder("3 lb.")
          .setValue(this.weight)
          .onChange((value) => {
            this.weight = value;
          })
      );

    new Setting(contentEl)
      .setName("Value")
      .setDesc("Item value (e.g., '500 gp')")
      .addText((text) =>
        text
          .setPlaceholder("500 gp")
          .setValue(this.value)
          .onChange((value) => {
            this.value = value;
          })
      );

    // Description
    new Setting(contentEl)
      .setName(this.itemType === 'simple' ? "Description" : "Base Description")
      .setDesc(this.itemType === 'simple' ? "Full description of the item and its properties" : "Base properties of the item before it evolves")
      .addTextArea((text) => {
        text
          .setPlaceholder(
            this.itemType === 'simple' 
              ? "This magical sword glows with an inner light..." 
              : "This blade contains dormant power that awakens as its wielder grows stronger..."
          )
          .setValue(this.description)
          .onChange((value) => {
            this.description = value;
          });
        text.inputEl.rows = 8;
        text.inputEl.style.width = "100%";
      });

    // Evolving Item Section
    if (this.itemType === 'evolving') {
      contentEl.createEl("h3", { text: "Evolution Thresholds" });
      contentEl.createEl("p", { 
        text: "Define how the item evolves at different character levels",
        cls: "setting-item-description"
      });
      
      this.levelThresholdsContainer = contentEl.createDiv();
      this.renderLevelThresholds();

      new Setting(contentEl)
        .addButton((button) =>
          button
            .setButtonText("+ Add Level Threshold")
            .onClick(() => {
              this.addLevelThreshold();
            })
        );
    }

    // Campaign Selection
    const campaigns = await this.getAllCampaigns();
    if (campaigns.length > 0) {
      let selectedCampaign = campaigns[0]?.path || "";
      
      contentEl.createEl("h3", { text: "Save Location" });
      new Setting(contentEl)
        .setName("Campaign")
        .setDesc("Which campaign should this item be saved to?")
        .addDropdown((dropdown) => {
          campaigns.forEach(campaign => {
            dropdown.addOption(campaign.path, campaign.name);
          });
          dropdown.setValue(selectedCampaign)
            .onChange((value) => {
              selectedCampaign = value;
            });
          
          // Add create/update button
          new Setting(contentEl)
            .addButton((button) =>
              button
                .setButtonText(this.isEdit ? "Update Item" : "Create Item")
                .setCta()
                .onClick(async () => {
                  await this.createItem(selectedCampaign);
                })
            );
        });
    } else {
      contentEl.createEl("p", { 
        text: "⚠️ No campaigns found. Please create a campaign first.",
        cls: "mod-warning"
      });
    }
  }

  refreshUI() {
    this.onOpen();
  }

  addLevelThreshold() {
    this.levelThresholds.push({
      level: this.levelThresholds.length > 0 
        ? Math.max(...this.levelThresholds.map(t => t.level)) + 1 
        : 5,
      description: ""
    });
    this.renderLevelThresholds();
  }

  removeLevelThreshold(index: number) {
    this.levelThresholds.splice(index, 1);
    this.renderLevelThresholds();
  }

  renderLevelThresholds() {
    if (!this.levelThresholdsContainer) return;
    
    this.levelThresholdsContainer.empty();

    this.levelThresholds.forEach((threshold, index) => {
      const thresholdEl = this.levelThresholdsContainer!.createDiv({ cls: "trap-element-item" });
      
      const heading = thresholdEl.createEl("h4", { text: `Level Threshold` });

      new Setting(thresholdEl)
        .setName("Character Level")
        .addText((text) =>
          text
            .setValue(threshold.level.toString())
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num) && num >= 1 && num <= 20) {
                threshold.level = num;
                heading.textContent = `Level ${num} Threshold`;
              }
            })
        );

      new Setting(thresholdEl)
        .setName("Evolution Description")
        .setDesc("What new abilities or properties does the item gain at this level?")
        .addTextArea((text) => {
          text
            .setPlaceholder("The weapon gains +1 to attack and damage rolls...")
            .setValue(threshold.description)
            .onChange((value) => {
              threshold.description = value;
            });
          text.inputEl.rows = 4;
          text.inputEl.style.width = "100%";
        });

      new Setting(thresholdEl)
        .addButton((button) =>
          button
            .setButtonText("Remove")
            .setWarning()
            .onClick(() => {
              this.removeLevelThreshold(index);
            })
        );
    });
  }

  async getAllCampaigns(): Promise<Array<{ path: string; name: string }>> {
    const campaigns: Array<{ path: string; name: string }> = [];
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");

    if (ttrpgsFolder instanceof TFolder) {
      for (const child of ttrpgsFolder.children) {
        if (child instanceof TFolder) {
          campaigns.push({
            path: child.path,
            name: child.name
          });
        }
      }
    }

    return campaigns;
  }

  async loadItemData() {
    try {
      const itemFile = this.app.vault.getAbstractFileByPath(this.originalItemPath);
      if (!(itemFile instanceof TFile)) {
        new Notice("Item file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(itemFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read item data!");
        return;
      }

      // Load basic item properties
      this.itemName = frontmatter.name || itemFile.basename;
      this.originalItemName = this.itemName; // Store original name
      this.itemType = frontmatter.item_type || 'simple';
      this.category = frontmatter.category || 'other';
      this.rarity = frontmatter.rarity || 'common';
      this.requiresAttunement = frontmatter.requires_attunement || false;
      this.attunementRequirement = frontmatter.attunement_requirement || "";
      this.weight = frontmatter.weight || "";
      this.value = frontmatter.value || "";

      // Load description from file content
      const content = await this.app.vault.read(itemFile);
      
      // Extract description based on item type
      if (this.itemType === 'simple') {
        const descMatch = content.match(/##\s*Description\s*\n\n([\s\S]*?)(?:\n##|$)/);
        if (descMatch && descMatch[1]) {
          this.description = descMatch[1].trim();
        }
      } else {
        const basePropsMatch = content.match(/##\s*Base Properties\s*\n\n([\s\S]*?)(?:\n##|$)/);
        if (basePropsMatch && basePropsMatch[1]) {
          this.description = basePropsMatch[1].trim();
        }
        
        // Load level thresholds
        const evolutionMatch = content.match(/##\s*Evolution\s*\n\n[\s\S]*?(?=\n##|$)/);
        if (evolutionMatch) {
          const levelMatches = content.matchAll(/###\s*Level\s*(\d+)\s*\n\n([\s\S]*?)(?=\n###|\n##|$)/g);
          this.levelThresholds = [];
          for (const match of levelMatches) {
            if (match[1] && match[2]) {
              this.levelThresholds.push({
                level: parseInt(match[1]),
                description: match[2].trim()
              });
            }
          }
        }
      }

      console.log(`[Item Edit] Loaded item data: ${this.itemName}`);
    } catch (error) {
      console.error("Error loading item data:", error);
      new Notice("Error loading item data. Check console for details.");
    }
  }

  async createItem(campaignPath: string) {
    if (!this.itemName.trim()) {
      new Notice("Please enter an item name");
      return;
    }

    try {
      // Determine campaign name and world
      const campaignName = campaignPath.split('/').pop() || "Unknown";
      let worldName = campaignName;
      
      const worldFile = this.app.vault.getAbstractFileByPath(`${campaignPath}/World.md`);
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*([^\r\n]+)$/m);
        if (worldMatch && worldMatch[1]) {
          worldName = worldMatch[1].trim();
        }
      }

      let itemPath: string;
      let itemFile: TFile | null = null;

      if (this.isEdit) {
        // Editing existing item
        itemFile = this.app.vault.getAbstractFileByPath(this.originalItemPath) as TFile;
        if (!itemFile) {
          new Notice("Original item file not found!");
          return;
        }
        itemPath = this.originalItemPath;

        // If item name changed, rename the file
        if (this.itemName !== this.originalItemName) {
          const folder = itemPath.substring(0, itemPath.lastIndexOf('/'));
          const newPath = `${folder}/${this.itemName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`An item named "${this.itemName}" already exists!`);
            return;
          }
          
          await this.app.fileManager.renameFile(itemFile, newPath);
          itemPath = newPath;
          itemFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        }
      } else {
        // Creating new item
        // Create Items folder if it doesn't exist
        const itemsFolder = `${campaignPath}/Items`;
        if (!(await this.app.vault.adapter.exists(itemsFolder))) {
          await this.app.vault.createFolder(itemsFolder);
        }

        itemPath = `${itemsFolder}/${this.itemName}.md`;

        // Check if item already exists
        if (await this.app.vault.adapter.exists(itemPath)) {
          new Notice(`An item named "${this.itemName}" already exists!`);
          return;
        }
      }

      // Create item content
      const itemContent = this.createItemContent(campaignName, worldName);

      // Create or update the file
      if (this.isEdit && itemFile) {
        await this.app.vault.modify(itemFile, itemContent);
        new Notice(`Item "${this.itemName}" updated!`);
      } else {
        await this.app.vault.create(itemPath, itemContent);
        new Notice(`Item "${this.itemName}" created!`);
        itemFile = this.app.vault.getAbstractFileByPath(itemPath) as TFile;
      }

      this.close();

      // Open the file
      if (itemFile) {
        await this.app.workspace.openLinkText(itemPath, "", true);
      }
    } catch (error) {
      console.error("Error creating/editing item:", error);
      new Notice("Failed to save item. Check console for details.");
    }
  }

  createItemContent(campaignName: string, worldName: string): string {
    const currentDate = window.moment().format("YYYY-MM-DD");
    
    // Build attunement string
    let attunementText = "";
    if (this.requiresAttunement) {
      attunementText = this.attunementRequirement 
        ? `requires attunement ${this.attunementRequirement}`
        : "requires attunement";
    }

    // Create frontmatter
    let frontmatter = `---
type: item
name: '${this.itemName}'
item_type: ${this.itemType}
category: ${this.category}
rarity: ${this.rarity}
requires_attunement: ${this.requiresAttunement}`;

    if (this.attunementRequirement) {
      frontmatter += `\nattunement_requirement: '${this.attunementRequirement}'`;
    }

    if (this.weight) {
      frontmatter += `\nweight: '${this.weight}'`;
    }

    if (this.value) {
      frontmatter += `\nvalue: '${this.value}'`;
    }

    frontmatter += `\ncampaign: '${campaignName}'
world: '${worldName}'
date: ${currentDate}
template_version: '1.1.0'
---

`;

    // Create content body
    let content = `# ${this.itemName}\n\n`;

    // Add edit/delete buttons
    content += `\`\`\`dataviewjs
// Action buttons for item management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Item button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Item",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-item");
});

// Delete Item button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Item",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-item");
});
\`\`\`

`;

    // Item header with rarity and attunement
    const rarityCapitalized = this.rarity.charAt(0).toUpperCase() + this.rarity.slice(1);
    const categoryText = this.category !== 'other' ? this.category : 'item';
    content += `*${rarityCapitalized} ${categoryText}`;
    if (attunementText) {
      content += ` (${attunementText})`;
    }
    content += `*\n\n`;

    // Properties
    if (this.weight || this.value) {
      content += `## Properties\n\n`;
      if (this.weight) content += `- **Weight:** ${this.weight}\n`;
      if (this.value) content += `- **Value:** ${this.value}\n`;
      content += `\n`;
    }

    // Description
    if (this.itemType === 'simple') {
      content += `## Description\n\n${this.description}\n\n`;
    } else {
      content += `## Base Properties\n\n${this.description}\n\n`;
      
      // Evolution section
      if (this.levelThresholds.length > 0) {
        content += `## Evolution\n\n`;
        content += `This item evolves as its attuned owner gains levels, unlocking new abilities:\n\n`;
        
        // Sort by level
        const sortedThresholds = [...this.levelThresholds].sort((a, b) => a.level - b.level);
        
        for (const threshold of sortedThresholds) {
          content += `### Level ${threshold.level}\n\n`;
          content += `${threshold.description}\n\n`;
        }
      }
    }

    // Notes section
    content += `## Notes\n\n_Add any additional notes about the item's history, lore, or usage here._\n`;

    return frontmatter + content;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class CreatureCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  
  // For editing existing creatures
  isEdit = false;
  originalCreaturePath = "";
  originalCreatureName = "";
  
  // Creature properties
  creatureName = "";
  size: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan' = 'Medium';
  type = "";
  subtype = "";
  alignment = "";
  ac = "";
  hp = "";
  hitDice = "";
  speed = "";
  
  // Ability scores
  str = 10;
  dex = 10;
  con = 10;
  int = 10;
  wis = 10;
  cha = 10;
  
  // Optional fields
  saves: string[] = [];
  skills: string[] = [];
  vulnerabilities = "";
  resistances = "";
  immunities = "";
  conditionImmunities = "";
  senses = "";
  languages = "";
  cr = "";
  
  // Features and actions
  traits: Array<{name: string, desc: string}> = [];
  actions: Array<{name: string, desc: string}> = [];
  bonusActions: Array<{name: string, desc: string}> = [];
  reactions: Array<{name: string, desc: string}> = [];
  legendaryActions: Array<{name: string, desc: string}> = [];
  
  // Description
  description = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, creaturePath?: string) {
    super(app);
    this.plugin = plugin;
    if (creaturePath) {
      this.isEdit = true;
      this.originalCreaturePath = creaturePath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("creature-creation-modal");
    
    // Load existing creature data if editing
    if (this.isEdit) {
      await this.loadCreatureData();
    }
    
    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Creature" : "🐉 Create New Creature" });

    // Import section
    contentEl.createEl("h3", { text: "Import from Text" });
    contentEl.createEl("p", { 
      text: "Paste a D&D Beyond or similar statblock below to auto-fill the form:",
      cls: "setting-item-description"
    });

    const importContainer = contentEl.createDiv({ cls: "creature-import-container" });
    const importTextArea = importContainer.createEl("textarea", {
      placeholder: "Paste creature statblock here (e.g., from D&D Beyond)...",
      attr: { rows: "8", style: "width: 100%; margin-bottom: 10px;" }
    });

    const importButton = importContainer.createEl("button", {
      text: "📥 Parse Statblock",
      cls: "mod-cta"
    });

    importButton.addEventListener("click", () => {
      this.parseStatblockText(importTextArea.value);
      this.refreshUI();
      new Notice("Statblock parsed! Review and adjust fields below.");
    });

    contentEl.createEl("hr");
    contentEl.createEl("h3", { text: "Creature Details" });

    // Basic Info
    new Setting(contentEl)
      .setName("Creature Name")
      .setDesc("Name of the creature")
      .addText((text) =>
        text
          .setPlaceholder("Frost Giant Zombie")
          .setValue(this.creatureName)
          .onChange((value) => {
            this.creatureName = value;
          })
      );

    new Setting(contentEl)
      .setName("Size")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Tiny", "Tiny")
          .addOption("Small", "Small")
          .addOption("Medium", "Medium")
          .addOption("Large", "Large")
          .addOption("Huge", "Huge")
          .addOption("Gargantuan", "Gargantuan")
          .setValue(this.size)
          .onChange((value) => {
            this.size = value as any;
          })
      );

    new Setting(contentEl)
      .setName("Type")
      .setDesc("Creature type (e.g., undead, elemental, humanoid)")
      .addText((text) =>
        text
          .setPlaceholder("undead")
          .setValue(this.type)
          .onChange((value) => {
            this.type = value;
          })
      );

    new Setting(contentEl)
      .setName("Subtype/Tags")
      .setDesc("Optional subtype or tags (e.g., goblinoid, shapechanger)")
      .addText((text) =>
        text
          .setPlaceholder("giant")
          .setValue(this.subtype)
          .onChange((value) => {
            this.subtype = value;
          })
      );

    new Setting(contentEl)
      .setName("Alignment")
      .addText((text) =>
        text
          .setPlaceholder("neutral evil")
          .setValue(this.alignment)
          .onChange((value) => {
            this.alignment = value;
          })
      );

    // Combat Stats
    contentEl.createEl("h3", { text: "Combat Statistics" });

    new Setting(contentEl)
      .setName("Armor Class")
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(this.ac)
          .onChange((value) => {
            this.ac = value;
          })
      );

    new Setting(contentEl)
      .setName("Hit Points")
      .addText((text) =>
        text
          .setPlaceholder("138")
          .setValue(this.hp)
          .onChange((value) => {
            this.hp = value;
          })
      );

    new Setting(contentEl)
      .setName("Hit Dice")
      .setDesc("Format: XdY + Z (e.g., 12d12 + 60)")
      .addText((text) =>
        text
          .setPlaceholder("12d12 + 60")
          .setValue(this.hitDice)
          .onChange((value) => {
            this.hitDice = value;
          })
      );

    new Setting(contentEl)
      .setName("Speed")
      .setDesc("All movement speeds (e.g., 40 ft., fly 30 ft.)")
      .addText((text) =>
        text
          .setPlaceholder("40 ft.")
          .setValue(this.speed)
          .onChange((value) => {
            this.speed = value;
          })
      );

    // Ability Scores
    contentEl.createEl("h3", { text: "Ability Scores" });
    
    const abilityScoresContainer = contentEl.createDiv({ cls: "ability-scores-grid" });
    abilityScoresContainer.style.display = "grid";
    abilityScoresContainer.style.gridTemplateColumns = "repeat(3, 1fr)";
    abilityScoresContainer.style.gap = "10px";

    this.createAbilityScore(abilityScoresContainer, "STR", this.str, (val) => this.str = val);
    this.createAbilityScore(abilityScoresContainer, "DEX", this.dex, (val) => this.dex = val);
    this.createAbilityScore(abilityScoresContainer, "CON", this.con, (val) => this.con = val);
    this.createAbilityScore(abilityScoresContainer, "INT", this.int, (val) => this.int = val);
    this.createAbilityScore(abilityScoresContainer, "WIS", this.wis, (val) => this.wis = val);
    this.createAbilityScore(abilityScoresContainer, "CHA", this.cha, (val) => this.cha = val);

    // Additional Stats
    contentEl.createEl("h3", { text: "Additional Statistics" });

    new Setting(contentEl)
      .setName("Saving Throws")
      .setDesc("Comma-separated (e.g., WIS +2, CON +5)")
      .addText((text) =>
        text
          .setPlaceholder("WIS +2")
          .setValue(this.saves.join(", "))
          .onChange((value) => {
            this.saves = value ? value.split(",").map(s => s.trim()) : [];
          })
      );

    new Setting(contentEl)
      .setName("Skills")
      .setDesc("Comma-separated (e.g., Perception +4, Stealth +6)")
      .addText((text) =>
        text
          .setPlaceholder("Perception +4")
          .setValue(this.skills.join(", "))
          .onChange((value) => {
            this.skills = value ? value.split(",").map(s => s.trim()) : [];
          })
      );

    new Setting(contentEl)
      .setName("Damage Vulnerabilities")
      .addText((text) =>
        text
          .setPlaceholder("Fire")
          .setValue(this.vulnerabilities)
          .onChange((value) => {
            this.vulnerabilities = value;
          })
      );

    new Setting(contentEl)
      .setName("Damage Resistances")
      .addText((text) =>
        text
          .setPlaceholder("Lightning, Poison")
          .setValue(this.resistances)
          .onChange((value) => {
            this.resistances = value;
          })
      );

    new Setting(contentEl)
      .setName("Damage Immunities")
      .addText((text) =>
        text
          .setPlaceholder("Poison, Cold")
          .setValue(this.immunities)
          .onChange((value) => {
            this.immunities = value;
          })
      );

    new Setting(contentEl)
      .setName("Condition Immunities")
      .addText((text) =>
        text
          .setPlaceholder("Poisoned")
          .setValue(this.conditionImmunities)
          .onChange((value) => {
            this.conditionImmunities = value;
          })
      );

    new Setting(contentEl)
      .setName("Senses")
      .addText((text) =>
        text
          .setPlaceholder("Darkvision 60 ft.")
          .setValue(this.senses)
          .onChange((value) => {
            this.senses = value;
          })
      );

    new Setting(contentEl)
      .setName("Languages")
      .addText((text) =>
        text
          .setPlaceholder("understands Giant but can't speak")
          .setValue(this.languages)
          .onChange((value) => {
            this.languages = value;
          })
      );

    new Setting(contentEl)
      .setName("Challenge Rating")
      .addText((text) =>
        text
          .setPlaceholder("9")
          .setValue(this.cr)
          .onChange((value) => {
            this.cr = value;
          })
      );

    // Traits
    contentEl.createEl("h3", { text: "Traits & Features" });
    contentEl.createEl("p", { 
      text: "Passive abilities and special features",
      cls: "setting-item-description"
    });

    const traitsContainer = contentEl.createDiv({ cls: "creature-features-container" });
    this.renderFeatureList(traitsContainer, this.traits, "Trait");

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Trait")
          .onClick(() => {
            this.traits.push({ name: "", desc: "" });
            this.refreshUI();
          })
      );

    // Actions
    contentEl.createEl("h3", { text: "Actions" });
    const actionsContainer = contentEl.createDiv({ cls: "creature-features-container" });
    this.renderFeatureList(actionsContainer, this.actions, "Action");

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Action")
          .onClick(() => {
            this.actions.push({ name: "", desc: "" });
            this.refreshUI();
          })
      );

    // Description
    contentEl.createEl("h3", { text: "Description" });
    new Setting(contentEl)
      .setName("Creature Description")
      .setDesc("Lore, appearance, and behavior")
      .addTextArea((text) => {
        text
          .setPlaceholder("Describe the creature...")
          .setValue(this.description)
          .onChange((value) => {
            this.description = value;
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
      });

    // Create/Update Button
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(this.isEdit ? "Update Creature" : "Create Creature")
          .setCta()
          .onClick(async () => {
            await this.saveCreature();
          })
      );
  }

  createAbilityScore(container: HTMLElement, ability: string, value: number, onChange: (val: number) => void) {
    const abilityDiv = container.createDiv({ cls: "ability-score" });
    abilityDiv.createEl("label", { text: ability, attr: { style: "font-weight: bold;" } });
    const input = abilityDiv.createEl("input", {
      type: "number",
      value: value.toString(),
      attr: { min: "1", max: "30", style: "width: 100%;" }
    });
    
    const modifier = Math.floor((value - 10) / 2);
    const modText = abilityDiv.createEl("span", { 
      text: ` (${modifier >= 0 ? '+' : ''}${modifier})`,
      attr: { style: "font-size: 0.9em; color: #888;" }
    });

    input.addEventListener("change", () => {
      const val = parseInt(input.value);
      if (!isNaN(val) && val >= 1 && val <= 30) {
        onChange(val);
        const newMod = Math.floor((val - 10) / 2);
        modText.textContent = ` (${newMod >= 0 ? '+' : ''}${newMod})`;
      }
    });
  }

  renderFeatureList(container: HTMLElement, features: Array<{name: string, desc: string}>, type: string) {
    container.empty();
    
    features.forEach((feature, index) => {
      const featureDiv = container.createDiv({ cls: "creature-feature-item" });
      featureDiv.style.marginBottom = "15px";
      featureDiv.style.padding = "10px";
      featureDiv.style.border = "1px solid #ccc";
      featureDiv.style.borderRadius = "4px";

      new Setting(featureDiv)
        .setName(`${type} Name`)
        .addText((text) =>
          text
            .setPlaceholder("Feature name")
            .setValue(feature.name)
            .onChange((value) => {
              feature.name = value;
            })
        );

      new Setting(featureDiv)
        .setName(`${type} Description`)
        .addTextArea((text) => {
          text
            .setPlaceholder("Feature description...")
            .setValue(feature.desc)
            .onChange((value) => {
              feature.desc = value;
            });
          text.inputEl.rows = 3;
          text.inputEl.style.width = "100%";
        });

      new Setting(featureDiv)
        .addButton((button) =>
          button
            .setButtonText("Remove")
            .setWarning()
            .onClick(() => {
              features.splice(index, 1);
              this.refreshUI();
            })
        );
    });
  }

  parseStatblockText(text: string) {
    if (!text || text.trim().length === 0) {
      new Notice("Please paste a statblock first");
      return;
    }

    // Extract creature name (first line)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0 && lines[0]) {
      this.creatureName = lines[0];
    }

    // Extract size, type, alignment
    const sizeTypeLine = text.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.+?),\s*(.+)$/m);
    if (sizeTypeLine && sizeTypeLine[1] && sizeTypeLine[2] && sizeTypeLine[3]) {
      this.size = sizeTypeLine[1] as any;
      this.type = sizeTypeLine[2].trim();
      this.alignment = sizeTypeLine[3].trim();
    }

    // Extract AC
    const acMatch = text.match(/Armor Class\s+(\d+)/i);
    if (acMatch && acMatch[1]) this.ac = acMatch[1];

    // Extract HP
    const hpMatch = text.match(/Hit Points\s+(\d+)/i);
    if (hpMatch && hpMatch[1]) this.hp = hpMatch[1];

    // Extract Hit Dice
    const hitDiceMatch = text.match(/Hit Points\s+\d+\s+\(([^)]+)\)/i);
    if (hitDiceMatch && hitDiceMatch[1]) this.hitDice = hitDiceMatch[1];

    // Extract Speed
    const speedMatch = text.match(/Speed\s+(.+?)(?:\n|STR)/i);
    if (speedMatch && speedMatch[1]) this.speed = speedMatch[1].trim();

    // Extract ability scores
    const strMatch = text.match(/STR\s*\n?\s*(\d+)/i);
    const dexMatch = text.match(/DEX\s*\n?\s*(\d+)/i);
    const conMatch = text.match(/CON\s*\n?\s*(\d+)/i);
    const intMatch = text.match(/INT\s*\n?\s*(\d+)/i);
    const wisMatch = text.match(/WIS\s*\n?\s*(\d+)/i);
    const chaMatch = text.match(/CHA\s*\n?\s*(\d+)/i);

    if (strMatch && strMatch[1]) this.str = parseInt(strMatch[1]);
    if (dexMatch && dexMatch[1]) this.dex = parseInt(dexMatch[1]);
    if (conMatch && conMatch[1]) this.con = parseInt(conMatch[1]);
    if (intMatch && intMatch[1]) this.int = parseInt(intMatch[1]);
    if (wisMatch && wisMatch[1]) this.wis = parseInt(wisMatch[1]);
    if (chaMatch && chaMatch[1]) this.cha = parseInt(chaMatch[1]);

    // Extract saving throws
    const savesMatch = text.match(/Saving Throws\s+(.+?)(?:\n|Damage|Skills|Senses)/i);
    if (savesMatch && savesMatch[1]) {
      this.saves = savesMatch[1].trim().split(',').map(s => s.trim());
    }

    // Extract skills
    const skillsMatch = text.match(/Skills\s+(.+?)(?:\n|Damage|Senses|Languages)/i);
    if (skillsMatch && skillsMatch[1]) {
      this.skills = skillsMatch[1].trim().split(',').map(s => s.trim());
    }

    // Extract vulnerabilities
    const vulnMatch = text.match(/Damage Vulnerabilities\s+(.+?)(?:\n|Damage|Condition|Senses)/i);
    if (vulnMatch && vulnMatch[1]) this.vulnerabilities = vulnMatch[1].trim();

    // Extract resistances
    const resistMatch = text.match(/Damage Resistances\s+(.+?)(?:\n|Damage|Condition|Senses)/i);
    if (resistMatch && resistMatch[1]) this.resistances = resistMatch[1].trim();

    // Extract immunities
    const immuneMatch = text.match(/Damage Immunities\s+(.+?)(?:\n|Condition|Senses|Languages)/i);
    if (immuneMatch && immuneMatch[1]) this.immunities = immuneMatch[1].trim();

    // Extract condition immunities
    const condImmuneMatch = text.match(/Condition Immunities\s+(.+?)(?:\n|Senses|Languages|Challenge)/i);
    if (condImmuneMatch && condImmuneMatch[1]) this.conditionImmunities = condImmuneMatch[1].trim();

    // Extract senses
    const sensesMatch = text.match(/Senses\s+(.+?)(?:\n|Languages|Challenge)/i);
    if (sensesMatch && sensesMatch[1]) this.senses = sensesMatch[1].trim();

    // Extract languages
    const langMatch = text.match(/Languages\s+(.+?)(?:\n|Challenge|Proficiency)/i);
    if (langMatch && langMatch[1]) this.languages = langMatch[1].trim();

    // Extract CR
    const crMatch = text.match(/Challenge\s+([\d/]+)/i);
    if (crMatch && crMatch[1]) this.cr = crMatch[1];

    // Extract traits (features before Actions)
    this.traits = [];
    const actionsIndex = text.indexOf("Actions");
    const traitsSection = actionsIndex > 0 ? text.substring(0, actionsIndex) : text;
    
    // Look for trait patterns after CR line
    const crIndex = text.indexOf("Challenge");
    if (crIndex > 0) {
      const traitsText = traitsSection.substring(crIndex);
      const traitMatches = traitsText.matchAll(/^([A-Z][^\.]+?)\.\s+(.+?)(?=\n\n|\n[A-Z][^\.]+?\.|Actions|$)/gms);
      
      for (const match of traitMatches) {
        if (match[1] && match[2]) {
          const name = match[1].trim();
          const desc = match[2].trim();
          if (name && desc && !name.startsWith("Challenge") && !name.startsWith("Proficiency")) {
            this.traits.push({ name, desc });
          }
        }
      }
    }

    // Extract actions
    this.actions = [];
    if (actionsIndex > 0) {
      const actionsText = text.substring(actionsIndex);
      // Skip the 'Actions' header line
      const actionsContent = actionsText.replace(/^Actions\s*\n/i, '');
      
      // Match action patterns: Name. Description
      const actionMatches = actionsContent.matchAll(/^([A-Z][A-Za-z\s]+?)\.\s+(.+?)(?=\n\n|\n[A-Z][A-Za-z\s]+?\.|Bonus Actions|Reactions|Legendary Actions|$)/gms);
      
      for (const match of actionMatches) {
        if (match[1] && match[2]) {
          const name = match[1].trim();
          const desc = match[2].trim().replace(/\n/g, ' ');
          if (name && desc) {
            this.actions.push({ name, desc });
          }
        }
      }
    }

    console.log("Parsed creature:", this.creatureName);
  }

  refreshUI() {
    this.onOpen();
  }

  async loadCreatureData() {
    try {
      const creatureFile = this.app.vault.getAbstractFileByPath(this.originalCreaturePath);
      if (!(creatureFile instanceof TFile)) {
        new Notice("Creature file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(creatureFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read creature data!");
        return;
      }

      // Load basic properties
      this.creatureName = frontmatter.name || creatureFile.basename;
      this.originalCreatureName = this.creatureName;
      this.size = frontmatter.size || 'Medium';
      this.type = frontmatter.type || "";
      this.subtype = frontmatter.subtype || "";
      this.alignment = frontmatter.alignment || "";
      this.ac = frontmatter.ac?.toString() || "";
      this.hp = frontmatter.hp?.toString() || "";
      this.hitDice = frontmatter.hit_dice || "";
      this.speed = frontmatter.speed || "";

      // Load ability scores
      if (frontmatter.stats && Array.isArray(frontmatter.stats)) {
        [this.str, this.dex, this.con, this.int, this.wis, this.cha] = frontmatter.stats;
      }

      // Load optional fields
      this.vulnerabilities = frontmatter.damage_vulnerabilities || "";
      this.resistances = frontmatter.damage_resistances || "";
      this.immunities = frontmatter.damage_immunities || "";
      this.conditionImmunities = frontmatter.condition_immunities || "";
      this.senses = frontmatter.senses || "";
      this.languages = frontmatter.languages || "";
      this.cr = frontmatter.cr?.toString() || "";

      // Load saves
      if (frontmatter.saves) {
        this.saves = Object.entries(frontmatter.saves).map(([key, val]) => `${key.toUpperCase()} ${val}`);
      }

      // Load skills
      if (frontmatter.skillsaves) {
        this.skills = Object.entries(frontmatter.skillsaves).map(([key, val]) => `${key} ${val}`);
      }

      // Load traits
      if (frontmatter.traits && Array.isArray(frontmatter.traits)) {
        this.traits = frontmatter.traits.map((t: any) => ({
          name: t.name || "",
          desc: t.desc || ""
        }));
      }

      // Load actions
      if (frontmatter.actions && Array.isArray(frontmatter.actions)) {
        this.actions = frontmatter.actions.map((a: any) => ({
          name: a.name || "",
          desc: a.desc || ""
        }));
      }

      // Load description from content
      const content = await this.app.vault.read(creatureFile);
      const descMatch = content.match(/---\n\n([\s\S]*?)(?:\n```statblock|$)/);
      if (descMatch && descMatch[1]) {
        this.description = descMatch[1].trim();
      }

      console.log(`[Creature Edit] Loaded creature data: ${this.creatureName}`);
    } catch (error) {
      console.error("Error loading creature data:", error);
      new Notice("Error loading creature data. Check console for details.");
    }
  }

  async saveCreature() {
    if (!this.creatureName.trim()) {
      new Notice("Please enter a creature name");
      return;
    }

    try {
      const beastiaryPath = "z_Beastiarity";
      
      // Ensure beastiary folder exists
      if (!(await this.app.vault.adapter.exists(beastiaryPath))) {
        new Notice(`Beastiary folder not found at ${beastiaryPath}`);
        return;
      }

      let creaturePath: string;
      let creatureFile: TFile | null = null;

      if (this.isEdit) {
        // Editing existing creature
        creatureFile = this.app.vault.getAbstractFileByPath(this.originalCreaturePath) as TFile;
        if (!creatureFile) {
          new Notice("Original creature file not found!");
          return;
        }
        creaturePath = this.originalCreaturePath;

        // If creature name changed, rename the file
        if (this.creatureName !== this.originalCreatureName) {
          const folder = creaturePath.substring(0, creaturePath.lastIndexOf('/'));
          const newPath = `${folder}/${this.creatureName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`A creature named "${this.creatureName}" already exists!`);
            return;
          }
          
          // Delete old statblock
          await this.plugin.deleteCreatureStatblock(this.originalCreatureName);
          
          await this.app.fileManager.renameFile(creatureFile, newPath);
          creaturePath = newPath;
          creatureFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        } else {
          // Same name - delete old statblock and we'll recreate
          await this.plugin.deleteCreatureStatblock(this.originalCreatureName);
        }
      } else {
        // Creating new creature
        creaturePath = `${beastiaryPath}/${this.creatureName}.md`;

        // Check if creature already exists
        if (await this.app.vault.adapter.exists(creaturePath)) {
          new Notice(`A creature named "${this.creatureName}" already exists!`);
          return;
        }
      }

      // Create creature content
      const creatureContent = this.createCreatureContent();

      // Create or update the file
      if (this.isEdit && creatureFile) {
        await this.app.vault.modify(creatureFile, creatureContent);
        new Notice(`Creature "${this.creatureName}" updated!`);
      } else {
        await this.app.vault.create(creaturePath, creatureContent);
        new Notice(`Creature "${this.creatureName}" created!`);
        creatureFile = this.app.vault.getAbstractFileByPath(creaturePath) as TFile;
      }

      // Save to Fantasy Statblocks plugin
      await this.saveToStatblocks();

      this.close();

      // Open the creature file
      if (creatureFile) {
        await this.app.workspace.openLinkText(creaturePath, "", true);
      }
    } catch (error) {
      console.error("Error creating/editing creature:", error);
      new Notice("Failed to save creature. Check console for details.");
    }
  }

  createCreatureContent(): string {
    // Calculate ability modifiers
    const calcMod = (score: number) => Math.floor((score - 10) / 2);
    const fageStats = [
      calcMod(this.str),
      calcMod(this.dex),
      calcMod(this.con),
      calcMod(this.int),
      calcMod(this.wis),
      calcMod(this.cha)
    ];

    // Build frontmatter
    let frontmatter = `---
statblock: true
layout: Basic 5e Layout
name: ${this.creatureName}
size: ${this.size}
type: ${this.type}`;

    if (this.subtype) {
      frontmatter += `\nsubtype: ${this.subtype}`;
    }

    frontmatter += `\nalignment: ${this.alignment}
ac: ${this.ac}
hp: ${this.hp}
hit_dice: ${this.hitDice}
speed: ${this.speed}
stats:
  - ${this.str}
  - ${this.dex}
  - ${this.con}
  - ${this.int}
  - ${this.wis}
  - ${this.cha}
fage_stats:
  - ${fageStats[0]}
  - ${fageStats[1]}
  - ${fageStats[2]}
  - ${fageStats[3]}
  - ${fageStats[4]}
  - ${fageStats[5]}`;

    // Add saves
    if (this.saves.length > 0) {
      frontmatter += `\nsaves:`;
      this.saves.forEach(save => {
        const parts = save.trim().split(/\s+/);
        if (parts.length >= 2 && parts[0]) {
          const ability = parts[0].toLowerCase().substring(0, 3);
          const bonus = parts.slice(1).join('').replace(/\+/g, '');
          frontmatter += `\n  - ${ability}: ${bonus}`;
        }
      });
    } else {
      frontmatter += `\nsaves:`;
    }

    // Add skills
    if (this.skills.length > 0) {
      frontmatter += `\nskillsaves:`;
      this.skills.forEach(skill => {
        const colonIndex = skill.indexOf(':');
        const plusIndex = skill.indexOf('+');
        const spaceIndex = skill.lastIndexOf(' ');
        
        let skillName = "";
        let bonus = "";
        
        if (colonIndex > 0) {
          skillName = skill.substring(0, colonIndex).trim();
          bonus = skill.substring(colonIndex + 1).trim().replace(/\+/g, '');
        } else if (plusIndex > 0) {
          skillName = skill.substring(0, plusIndex).trim();
          bonus = skill.substring(plusIndex).trim().replace(/\+/g, '');
        } else if (spaceIndex > 0) {
          skillName = skill.substring(0, spaceIndex).trim();
          bonus = skill.substring(spaceIndex).trim().replace(/\+/g, '');
        }
        
        if (skillName && bonus) {
          skillName = skillName.toLowerCase().replace(/\s+/g, '');
          frontmatter += `\n  - ${skillName}: ${bonus}`;
        }
      });
    } else {
      frontmatter += `\nskillsaves:`;
    }

    frontmatter += `\ndamage_vulnerabilities: ${this.vulnerabilities}`;
    frontmatter += `\ndamage_resistances: ${this.resistances}`;
    frontmatter += `\ndamage_immunities: ${this.immunities}`;
    frontmatter += `\ncondition_immunities: ${this.conditionImmunities}`;
    frontmatter += `\nsenses: ${this.senses}`;
    frontmatter += `\nlanguages: ${this.languages}`;
    frontmatter += `\ncr: ${this.cr}`;
    frontmatter += `\nspells:`;

    // Add traits
    if (this.traits.length > 0) {
      frontmatter += `\ntraits:`;
      this.traits.forEach(trait => {
        if (trait.name && trait.desc) {
          frontmatter += `\n  - name: ${trait.name}`;
          frontmatter += `\n    desc: "${trait.desc.replace(/"/g, '\\"')}"`;
        }
      });
    } else {
      frontmatter += `\ntraits:`;
    }

    // Add actions
    if (this.actions.length > 0) {
      frontmatter += `\nactions:`;
      this.actions.forEach(action => {
        if (action.name && action.desc) {
          frontmatter += `\n  - name: ${action.name}`;
          frontmatter += `\n    desc: "${action.desc.replace(/"/g, '\\"')}"`;
        }
      });
    } else {
      frontmatter += `\nactions:`;
    }

    frontmatter += `\nlegendary_actions:`;
    frontmatter += `\nbonus_actions:`;
    frontmatter += `\nreactions:`;
    frontmatter += `\n---\n\n`;

    // Add description
    let content = this.description || `${this.creatureName} creature description.\n`;
    
    // Add edit/delete buttons
    content += `\n\`\`\`dataviewjs
// Action buttons for creature management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Creature button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Creature",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-creature");
});

// Delete Creature button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Creature",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-creature");
});
\`\`\`

`;
    
    // Add statblock
    content += `\`\`\`statblock\ncreature: ${this.creatureName}\n\`\`\`\n`;

    return frontmatter + content;
  }

  async saveToStatblocks() {
    try {
      const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
      if (!statblocksPlugin) {
        console.warn("Fantasy Statblocks plugin not found.");
        return;
      }

      // Create statblock object
      const statblock: any = {
        name: this.creatureName,
        size: this.size,
        type: this.type,
        subtype: this.subtype || undefined,
        alignment: this.alignment,
        ac: parseInt(this.ac) || 10,
        hp: parseInt(this.hp) || 1,
        hit_dice: this.hitDice,
        speed: this.speed,
        stats: [this.str, this.dex, this.con, this.int, this.wis, this.cha],
        saves: [],
        skillsaves: [],
        damage_vulnerabilities: this.vulnerabilities,
        damage_resistances: this.resistances,
        damage_immunities: this.immunities,
        condition_immunities: this.conditionImmunities,
        senses: this.senses,
        languages: this.languages,
        cr: this.cr,
        traits: this.traits.filter(t => t.name && t.desc),
        actions: this.actions.filter(a => a.name && a.desc),
        legendary_actions: [],
        bonus_actions: [],
        reactions: []
      };

      // Parse saves
      if (this.saves.length > 0) {
        this.saves.forEach(save => {
          const parts = save.split(' ');
          if (parts.length >= 2 && parts[0]) {
            const ability = parts[0].toLowerCase().substring(0, 3);
            const bonus = parts.slice(1).join(' ');
            statblock.saves.push({ [ability]: bonus });
          }
        });
      }

      // Parse skills
      if (this.skills.length > 0) {
        this.skills.forEach(skill => {
          const colonIndex = skill.indexOf(':');
          const plusIndex = skill.indexOf('+');
          const spaceIndex = skill.lastIndexOf(' ');
          
          let skillName = "";
          let bonus = "";
          
          if (colonIndex > 0) {
            skillName = skill.substring(0, colonIndex).trim();
            bonus = skill.substring(colonIndex + 1).trim();
          } else if (plusIndex > 0) {
            skillName = skill.substring(0, plusIndex).trim();
            bonus = skill.substring(plusIndex).trim();
          } else if (spaceIndex > 0) {
            skillName = skill.substring(0, spaceIndex).trim();
            bonus = skill.substring(spaceIndex).trim();
          }
          
          if (skillName && bonus) {
            skillName = skillName.toLowerCase().replace(/\s+/g, '');
            statblock.skillsaves.push({ [skillName]: bonus });
          }
        });
      }

      // Add to bestiary
      if (!statblocksPlugin.data.bestiary) {
        statblocksPlugin.data.bestiary = [];
      }

      // Remove existing entry if editing
      const existingIndex = statblocksPlugin.data.bestiary.findIndex((c: any) => c.name === this.creatureName);
      if (existingIndex !== -1) {
        statblocksPlugin.data.bestiary[existingIndex] = statblock;
      } else {
        statblocksPlugin.data.bestiary.push(statblock);
      }

      await statblocksPlugin.saveSettings();
      console.log(`Saved creature "${this.creatureName}" to Fantasy Statblocks`);
    } catch (error) {
      console.error("Error saving to Fantasy Statblocks:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class FactionCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  factionName = "";
  campaign = "";
  mainGoal = "";
  pursuitMethod = "";
  leader = "";
  size = "";
  resources = "";
  reputation = "";
  territories = "";
  allies = "";
  enemies = "";
  activeProblem = "";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🏛️ Create New Faction" });

    contentEl.createEl("p", {
      text: "Build a compelling faction with clear goals and methods of operation.",
      cls: "setting-item-description"
    });

    // Faction Name
    new Setting(contentEl)
      .setName("Faction Name")
      .setDesc("What is this faction called?")
      .addText((text) => {
        text
          .setPlaceholder("e.g., The Emerald Enclave, The Zhentarim")
          .onChange((value) => {
            this.factionName = value;
          });
        text.inputEl.focus();
      });

    // Campaign Selection
    const campaigns = this.getAllCampaigns();
    new Setting(contentEl)
      .setName("Campaign")
      .setDesc("Which campaign does this faction belong to?")
      .addDropdown((dropdown) => {
        campaigns.forEach(campaign => {
          dropdown.addOption(campaign.path, campaign.name);
        });
        dropdown.setValue(this.campaign)
          .onChange((value) => {
            this.campaign = value;
          });
      });

    contentEl.createEl("h3", { text: "🎯 Core Faction Engine" });

    // Main Goal
    new Setting(contentEl)
      .setName("What is their main goal?")
      .setDesc("The faction's primary objective or purpose")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Preserve the balance of nature and protect the wilderness from civilization's encroachment")
          .onChange((value) => {
            this.mainGoal = value;
          });
        text.inputEl.rows = 3;
      });

    // Pursuit Method
    new Setting(contentEl)
      .setName("How do they pursue it?")
      .setDesc("Their methods, tactics, and approach to achieving their goal")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Through covert operations, strategic alliances with druid circles, and carefully placed agents in key positions")
          .onChange((value) => {
            this.pursuitMethod = value;
          });
        text.inputEl.rows = 3;
      });

    contentEl.createEl("h3", { text: "📋 Faction Details" });

    // Leader
    new Setting(contentEl)
      .setName("Leader")
      .setDesc("Who leads this faction? (Optional)")
      .addText((text) => {
        text
          .setPlaceholder("e.g., High Druid Amaranthe Silvermoon")
          .onChange((value) => {
            this.leader = value;
          });
      });

    // Size/Influence
    new Setting(contentEl)
      .setName("Size & Influence")
      .setDesc("How large and influential is this faction?")
      .addText((text) => {
        text
          .setPlaceholder("e.g., Regional, hundreds of members")
          .onChange((value) => {
            this.size = value;
          });
      });

    // Resources
    new Setting(contentEl)
      .setName("Resources")
      .setDesc("What resources does this faction control?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Hidden forest sanctuaries, network of informants, ancient druidic artifacts")
          .onChange((value) => {
            this.resources = value;
          });
        text.inputEl.rows = 2;
      });

    // Reputation
    new Setting(contentEl)
      .setName("Reputation")
      .setDesc("How is this faction viewed by others?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Respected by rural communities, distrusted by merchant guilds, feared by loggers")
          .onChange((value) => {
            this.reputation = value;
          });
        text.inputEl.rows = 2;
      });

    contentEl.createEl("h3", { text: "🗺️ Relationships" });

    // Territories
    new Setting(contentEl)
      .setName("Territories")
      .setDesc("What areas or locations does this faction control or operate in?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., The Misty Forest, Hidden groves throughout the Sword Coast")
          .onChange((value) => {
            this.territories = value;
          });
        text.inputEl.rows = 2;
      });

    // Allies
    new Setting(contentEl)
      .setName("Allies")
      .setDesc("Which factions or groups are allied with them?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Harpers, local druid circles, forest creatures")
          .onChange((value) => {
            this.allies = value;
          });
        text.inputEl.rows = 2;
      });

    // Enemies
    new Setting(contentEl)
      .setName("Enemies")
      .setDesc("Which factions or groups oppose them?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Zhentarim, logging companies, industrialist merchants")
          .onChange((value) => {
            this.enemies = value;
          });
        text.inputEl.rows = 2;
      });

    contentEl.createEl("h3", { text: "⚠️ Current Situation" });

    // Active Problem
    new Setting(contentEl)
      .setName("Active Problem")
      .setDesc("What challenge or conflict is this faction currently facing?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., A corrupted member has been selling secrets to logging companies")
          .onChange((value) => {
            this.activeProblem = value;
          });
        text.inputEl.rows = 3;
      });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create Faction",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.factionName.trim()) {
        new Notice("Please enter a faction name!");
        return;
      }

      this.close();
      await this.createFactionFile();
    });
  }

  getAllCampaigns(): Array<{ path: string; name: string }> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const campaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      ttrpgsFolder.children.forEach((child) => {
        if (child instanceof TFolder) {
          campaigns.push({
            path: child.path,
            name: child.name
          });
        }
      });
    }

    return campaigns;
  }

  async createFactionFile() {
    const campaignName = this.campaign.split('/').pop() || "Unknown";
    const factionPath = `${this.campaign}/Factions`;
    
    new Notice(`Creating Faction "${this.factionName}"...`);

    try {
      await this.plugin.ensureFolderExists(factionPath);

      // Get world info from campaign World.md
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
      let worldName = campaignName;
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*([^\r\n]+)$/m);
        if (worldMatch && worldMatch[1] && worldMatch[1].trim()) {
          worldName = worldMatch[1].trim();
        }
      }

      // Get Faction template
      const templatePath = "z_Templates/Frontmatter - Faction.md";
      const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      let factionContent: string;

      if (templateFile instanceof TFile) {
        factionContent = await this.app.vault.read(templateFile);
      } else {
        factionContent = FACTION_TEMPLATE;
      }

      // Get current date
      const currentDate = new Date().toISOString().split('T')[0];

      // Build complete frontmatter
      const frontmatter = `---
type: faction
name: ${this.factionName}
campaign: ${campaignName}
world: ${worldName}
main_goal: "${this.mainGoal}"
pursuit_method: "${this.pursuitMethod}"
leader: ${this.leader}
size: ${this.size}
resources: "${this.resources}"
reputation: "${this.reputation}"
territories: "${this.territories}"
allies: "${this.allies}"
enemies: "${this.enemies}"
active_problem: "${this.activeProblem}"
date: ${currentDate}
---`;

      // Replace the frontmatter
      factionContent = factionContent.replace(/^---\n[\s\S]*?\n---/, frontmatter);
      
      // Replace the title and template references
      factionContent = factionContent
        .replace(/# <% tp\.frontmatter\.name %>/g, `# ${this.factionName}`)
        .replace(/<% tp\.frontmatter\.name %>/g, this.factionName)
        .replace(/<% tp\.frontmatter\.main_goal %>/g, this.mainGoal)
        .replace(/<% tp\.frontmatter\.pursuit_method %>/g, this.pursuitMethod)
        .replace(/<% tp\.frontmatter\.leader %>/g, this.leader || "_No leader specified_")
        .replace(/<% tp\.frontmatter\.active_problem %>/g, this.activeProblem)
        .replace(/<% tp\.frontmatter\.resources %>/g, this.resources)
        .replace(/<% tp\.frontmatter\.reputation %>/g, this.reputation)
        .replace(/<% tp\.frontmatter\.territories %>/g, this.territories)
        .replace(/<% tp\.frontmatter\.allies %>/g, this.allies)
        .replace(/<% tp\.frontmatter\.enemies %>/g, this.enemies);

      const filePath = `${factionPath}/${this.factionName}.md`;
      await this.app.vault.create(filePath, factionContent);

      // Open the file
      await this.app.workspace.openLinkText(filePath, "", true);

      new Notice(`✅ Faction "${this.factionName}" created successfully!`);
    } catch (error) {
      new Notice(`❌ Error creating Faction: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Faction creation error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Spell Import Modal - Search and import spells from D&D 5e SRD API or create custom
 */
class SpellImportModal extends Modal {
  plugin: DndCampaignHubPlugin;
  spellList: any[] = [];
  filteredSpells: any[] = [];
  selectedSpell: any = null;
  searchQuery = "";
  filterLevels: string[] = [];
  filterSchools: string[] = [];
  filterClasses: string[] = [];
  isLoading = false;
  private readonly CACHE_PATH = ".obsidian/plugins/dnd-campaign-hub/spell-cache.json";
  private readonly CACHE_EXPIRY_DAYS = 7;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async loadSpellCache(): Promise<any[] | null> {
    try {
      const exists = await this.app.vault.adapter.exists(this.CACHE_PATH);
      if (!exists) {
        return null;
      }

      const cacheContent = await this.app.vault.adapter.read(this.CACHE_PATH);
      const cache = JSON.parse(cacheContent);

      // Check cache age
      const ageMs = Date.now() - cache.timestamp;
      const maxAgeMs = this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      
      if (ageMs > maxAgeMs) {
        console.log(`Spell cache expired (${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days old)`);
        return null;
      }

      console.log(`Loaded ${cache.count} spells from cache (${Math.floor(ageMs / (60 * 60 * 1000))} hours old)`);
      return cache.spells || [];
    } catch (error) {
      console.error("Failed to load spell cache:", error);
      return null;
    }
  }

  async saveSpellCache(spells: any[]): Promise<void> {
    try {
      const cache = {
        version: "2014",
        timestamp: Date.now(),
        count: spells.length,
        spells: spells
      };

      const cacheContent = JSON.stringify(cache);
      await this.app.vault.adapter.write(this.CACHE_PATH, cacheContent);
      console.log(`Saved ${spells.length} spells to cache`);
    } catch (error) {
      console.error("Failed to save spell cache:", error);
    }
  }

  async refreshSpellsFromAPI(container: HTMLElement, listContainer: HTMLElement): Promise<void> {
    const loadingEl = container.createEl("div", { 
      text: "Refreshing spells from D&D 5e SRD API...",
      cls: "spell-loading"
    });

    try {
      const response = await requestUrl({
        url: "https://www.dnd5eapi.co/api/2014/spells",
        method: "GET"
      });

      const spellRefs = response.json.results || [];
      loadingEl.setText(`Loading spell details... (0/${spellRefs.length})`);

      this.spellList = [];
      for (let i = 0; i < spellRefs.length; i++) {
        try {
          const detailResponse = await requestUrl({
            url: `https://www.dnd5eapi.co${spellRefs[i].url}`,
            method: "GET"
          });
          this.spellList.push(detailResponse.json);
          
          if (i % 10 === 0 || i === spellRefs.length - 1) {
            loadingEl.setText(`Loading spell details... (${i + 1}/${spellRefs.length})`);
          }
        } catch (error) {
          console.error(`Failed to load spell: ${spellRefs[i].name}`, error);
        }
      }

      await this.saveSpellCache(this.spellList);
      this.filteredSpells = [...this.spellList];
      loadingEl.remove();
      this.renderSpellList(listContainer);
    } catch (error) {
      loadingEl.setText("❌ Failed to load spells from API. Please check your internet connection.");
      console.error("Spell API error:", error);
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("spell-import-modal");

    contentEl.createEl("h2", { text: "📖 Spell Library" });
    contentEl.createEl("p", { 
      text: "Import spells from the D&D 5e SRD or create your own custom spell.",
      cls: "setting-item-description"
    });

    // Create tabs
    const tabContainer = contentEl.createEl("div", { cls: "spell-tabs" });
    
    const srdTab = tabContainer.createEl("button", { 
      text: "📚 SRD Spells",
      cls: "spell-tab active"
    });
    
    const customTab = tabContainer.createEl("button", { 
      text: "✨ Custom Spell",
      cls: "spell-tab"
    });

    // Content containers
    const srdContent = contentEl.createEl("div", { cls: "spell-content active" });
    const customContent = contentEl.createEl("div", { cls: "spell-content hidden" });

    // Tab switching
    srdTab.addEventListener("click", () => {
      srdTab.addClass("active");
      customTab.removeClass("active");
      srdContent.removeClass("hidden");
      srdContent.addClass("active");
      customContent.removeClass("active");
      customContent.addClass("hidden");
    });

    customTab.addEventListener("click", () => {
      customTab.addClass("active");
      srdTab.removeClass("active");
      customContent.removeClass("hidden");
      customContent.addClass("active");
      srdContent.removeClass("active");
      srdContent.addClass("hidden");
    });

    // SRD Content
    await this.renderSRDContent(srdContent);

    // Custom Content  
    this.renderCustomContent(customContent);
  }

  async renderSRDContent(container: HTMLElement) {
    // Top bar with search and refresh button
    const topBar = container.createEl("div", { cls: "spell-top-bar" });
    
    // Search
    const searchInput = topBar.createEl("input", {
      type: "text",
      placeholder: "Search spells...",
      cls: "spell-search-input"
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.toLowerCase();
      this.filterAndRenderSpells(listContainer);
    });

    // Refresh button
    const refreshBtn = topBar.createEl("button", { 
      text: "🔄 Refresh from API",
      cls: "spell-refresh-btn"
    });

    // Bulk import button
    const bulkImportBtn = topBar.createEl("button", { 
      text: "📥 Import All",
      cls: "spell-bulk-import-btn"
    });

    // Filters container
    const filterContainer = container.createEl("div", { cls: "spell-filters" });

    // Level filter
    const levelFilterDiv = filterContainer.createEl("div", { cls: "spell-filter-group" });
    levelFilterDiv.createEl("div", { text: "Level:", cls: "spell-filter-label" });
    const levelDropdown = this.createMultiSelectDropdown(levelFilterDiv, [
      { value: "0", label: "Cantrip" },
      { value: "1", label: "Level 1" },
      { value: "2", label: "Level 2" },
      { value: "3", label: "Level 3" },
      { value: "4", label: "Level 4" },
      { value: "5", label: "Level 5" },
      { value: "6", label: "Level 6" },
      { value: "7", label: "Level 7" },
      { value: "8", label: "Level 8" },
      { value: "9", label: "Level 9" }
    ], (selected) => {
      this.filterLevels = selected;
      this.filterAndRenderSpells(listContainer);
    });

    // School filter
    const schoolFilterDiv = filterContainer.createEl("div", { cls: "spell-filter-group" });
    schoolFilterDiv.createEl("div", { text: "School:", cls: "spell-filter-label" });
    const schoolDropdown = this.createMultiSelectDropdown(schoolFilterDiv, [
      { value: "abjuration", label: "Abjuration" },
      { value: "conjuration", label: "Conjuration" },
      { value: "divination", label: "Divination" },
      { value: "enchantment", label: "Enchantment" },
      { value: "evocation", label: "Evocation" },
      { value: "illusion", label: "Illusion" },
      { value: "necromancy", label: "Necromancy" },
      { value: "transmutation", label: "Transmutation" }
    ], (selected) => {
      this.filterSchools = selected;
      this.filterAndRenderSpells(listContainer);
    });

    // Class filter
    const classFilterDiv = filterContainer.createEl("div", { cls: "spell-filter-group" });
    classFilterDiv.createEl("div", { text: "Class:", cls: "spell-filter-label" });
    const classCheckboxes = classFilterDiv.createEl("div", { cls: "spell-filter-checkboxes" });
    const classes = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];
    classes.forEach((className) => {
      const checkboxContainer = classCheckboxes.createEl("label", { cls: "spell-checkbox" });
      const checkbox = checkboxContainer.createEl("input", { type: "checkbox" });
      checkbox.value = className.toLowerCase();
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.filterClasses.push(className.toLowerCase());
        } else {
          this.filterClasses = this.filterClasses.filter(c => c !== className.toLowerCase());
        }
        this.filterAndRenderSpells(listContainer);
      });
      checkboxContainer.createEl("span", { text: className });
    });

    // Spell list container
    const listContainer = container.createEl("div", { cls: "spell-list-container" });

    // Loading indicator
    const loadingEl = container.createEl("div", { 
      text: "Loading spells...",
      cls: "spell-loading"
    });

    // Try to load from cache first
    const cachedSpells = await this.loadSpellCache();
    if (cachedSpells && cachedSpells.length > 0) {
      this.spellList = cachedSpells;
      this.filteredSpells = [...this.spellList];
      loadingEl.setText(`✓ Loaded ${cachedSpells.length} spells from cache`);
      setTimeout(() => loadingEl.remove(), 1000);
      this.renderSpellList(listContainer);
    } else {
      // Fetch from API if no cache
      await this.refreshSpellsFromAPI(container, listContainer);
    }

    // Refresh button handler
    refreshBtn.addEventListener("click", async () => {
      listContainer.empty();
      this.searchQuery = "";
      this.filterLevels = [];
      this.filterSchools = [];
      this.filterClasses = [];
      searchInput.value = "";
      // Clear select options
      levelDropdown.clearSelections();
      schoolDropdown.clearSelections();
      // Uncheck all checkboxes
      filterContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        (cb as HTMLInputElement).checked = false;
      });
      await this.refreshSpellsFromAPI(container, listContainer);
    });

    // Bulk import button handler
    bulkImportBtn.addEventListener("click", async () => {
      await this.bulkImportAllSpells(bulkImportBtn);
    });
  }

  async bulkImportAllSpells(button?: HTMLElement) {
    try {
      // Prevent multiple simultaneous imports
      if (button) {
        if (button.hasClass("importing")) {
          new Notice("Import already in progress...");
          return;
        }
        button.addClass("importing");
        button.textContent = "⏳ Importing...";
        (button as HTMLButtonElement).disabled = true;
      }

      // Ensure spells are loaded
      if (this.spellList.length === 0) {
        new Notice("Loading spells from API first...");
        const response = await requestUrl({
          url: "https://www.dnd5eapi.co/api/2014/spells",
          method: "GET"
        });
        const spellRefs = response.json.results || [];
        
        for (let i = 0; i < spellRefs.length; i++) {
          try {
            const detailResponse = await requestUrl({
              url: `https://www.dnd5eapi.co${spellRefs[i].url}`,
              method: "GET"
            });
            this.spellList.push(detailResponse.json);
          } catch (error) {
            console.error(`Failed to load spell: ${spellRefs[i].name}`, error);
          }
        }
        await this.saveSpellCache(this.spellList);
      }

      // Create z_Spells folder
      const spellsPath = "z_Spells";
      await this.plugin.ensureFolderExists(spellsPath);

      let successCount = 0;
      let errorCount = 0;
      const totalSpells = this.spellList.length;

      new Notice(`Starting bulk import of ${totalSpells} spells...`);

      for (let i = 0; i < this.spellList.length; i++) {
        try {
          const spell = this.spellList[i];
          const filePath = `${spellsPath}/${spell.name}.md`;
          
          // Check if file already exists
          const exists = await this.app.vault.adapter.exists(filePath);
          if (exists) {
            console.log(`Skipping ${spell.name} - already exists`);
            successCount++;
            continue;
          }

          // Build spell content
          const levelText = spell.level === 0 ? "Cantrip" : spell.level.toString();
          const components = spell.components.join(", ");
          const material = spell.material ? `\nMaterials: ${spell.material}` : "";
          
          const description = spell.desc.join("\n\n");
          const higherLevel = spell.higher_level && spell.higher_level.length > 0 
            ? spell.higher_level.join("\n\n")
            : "N/A";

          const classes = spell.classes && spell.classes.length > 0
            ? spell.classes.map((c: any) => c.name).join(", ")
            : "N/A";

          const content = `---
type: spell
template_version: 1.0.0
name: ${spell.name}
level: ${spell.level}
school: ${spell.school.name}
casting_time: ${spell.casting_time}
range: ${spell.range}
components: ${components}
duration: ${spell.duration}
concentration: ${spell.concentration || false}
ritual: ${spell.ritual || false}
classes: ${classes}
source: SRD
---

# ${spell.name}

**${levelText} ${spell.school.name}**

**Casting Time:** ${spell.casting_time}  
**Range:** ${spell.range}  
**Components:** ${components}${material}  
**Duration:** ${spell.duration}${spell.concentration ? " (Concentration)" : ""}${spell.ritual ? " (Ritual)" : ""}

## Description

${description}

## At Higher Levels

${higherLevel}

## Classes

${classes}
`;

          await this.app.vault.create(filePath, content);
          successCount++;

          // Update progress notification every 50 spells
          if (i % 50 === 0 && i > 0) {
            new Notice(`Importing spells... ${i}/${totalSpells}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Failed to import ${this.spellList[i].name}:`, error);
        }
      }

      new Notice(`✅ Bulk import complete! ${successCount} spells imported, ${errorCount} errors.`);
    } catch (error) {
      new Notice(`❌ Bulk import failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Bulk import error:", error);
    } finally {
      // Re-enable button
      if (button) {
        button.removeClass("importing");
        button.textContent = "📥 Import All";
        (button as HTMLButtonElement).disabled = false;
      }
    }
  }

  createMultiSelectDropdown(
    parent: HTMLElement, 
    options: Array<{value: string, label: string}>, 
    onChange: (selected: string[]) => void
  ) {
    const dropdownContainer = parent.createEl("div", { cls: "custom-multiselect" });
    const dropdownButton = dropdownContainer.createEl("button", { 
      cls: "custom-multiselect-button",
      text: "Select..."
    });
    const dropdownList = dropdownContainer.createEl("div", { cls: "custom-multiselect-list" });
    dropdownList.style.display = "none";

    const selectedValues = new Set<string>();
    const checkboxes: Array<{checkbox: HTMLInputElement, value: string}> = [];

    options.forEach(option => {
      const item = dropdownList.createEl("label", { cls: "custom-multiselect-item" });
      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.value = option.value;
      item.createEl("span", { text: option.label });

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedValues.add(option.value);
        } else {
          selectedValues.delete(option.value);
        }
        updateButtonText();
        onChange(Array.from(selectedValues));
      });

      checkboxes.push({ checkbox, value: option.value });
    });

    const updateButtonText = () => {
      if (selectedValues.size === 0) {
        dropdownButton.textContent = "Select...";
      } else {
        dropdownButton.textContent = `${selectedValues.size} selected`;
      }
    };

    dropdownButton.addEventListener("click", (e) => {
      e.preventDefault();
      const isVisible = dropdownList.style.display !== "none";
      dropdownList.style.display = isVisible ? "none" : "block";
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!dropdownContainer.contains(e.target as Node)) {
        dropdownList.style.display = "none";
      }
    });

    return {
      clearSelections: () => {
        selectedValues.clear();
        checkboxes.forEach(item => item.checkbox.checked = false);
        updateButtonText();
      }
    };
  }

  filterAndRenderSpells(container: HTMLElement) {
    this.filteredSpells = this.spellList.filter(spell => {
      // Search filter
      const matchesSearch = spell.name.toLowerCase().includes(this.searchQuery);
      
      // Level filter (if any levels selected, spell must match one of them)
      const matchesLevel = this.filterLevels.length === 0 || 
        this.filterLevels.includes(spell.level.toString());
      
      // School filter (if any schools selected, spell must match one of them)
      const matchesSchool = this.filterSchools.length === 0 || 
        this.filterSchools.includes(spell.school?.name?.toLowerCase());
      
      // Class filter (if any classes selected, spell must be available to one of them)
      const matchesClass = this.filterClasses.length === 0 || 
        spell.classes?.some((c: any) => this.filterClasses.includes(c.name.toLowerCase()));
      
      return matchesSearch && matchesLevel && matchesSchool && matchesClass;
    });

    this.renderSpellList(container);
  }

  renderSpellList(container: HTMLElement) {
    container.empty();

    if (this.filteredSpells.length === 0) {
      container.createEl("div", { 
        text: "No spells found matching your search.",
        cls: "empty-message"
      });
      return;
    }

    const list = container.createEl("div", { cls: "spell-list" });
    
    this.filteredSpells.forEach(spell => {
      const item = list.createEl("div", { cls: "spell-list-item" });
      const levelText = spell.level === 0 ? "Cantrip" : `Lvl ${spell.level}`;
      const schoolText = spell.school?.name || "Unknown";
      const classNames = spell.classes?.map((c: any) => c.name).join(", ") || "";
      
      item.createEl("span", { 
        text: spell.name,
        cls: "spell-item-name"
      });
      item.createEl("span", { 
        text: ` (${levelText} ${schoolText})`,
        cls: "spell-item-meta"
      });
      if (classNames) {
        item.createEl("div", { 
          text: classNames,
          cls: "spell-item-classes"
        });
      }
      
      item.addEventListener("click", async () => {
        await this.showSpellDetails(spell);
      });
    });

    container.createEl("div", { 
      text: `${this.filteredSpells.length} spells found`,
      cls: "spell-count"
    });
  }

  async showSpellDetails(spell: any) {
    try {
      // Spell data is already loaded from initial fetch
      this.selectedSpell = spell;

      // Show modal with spell details
      new SpellDetailsModal(this.app, this.plugin, spell).open();
      this.close();
    } catch (error) {
      new Notice("❌ Failed to load spell details");
      console.error("Spell details error:", error);
    }
  }

  renderCustomContent(container: HTMLElement) {
    container.createEl("p", {
      text: "Create your own custom spell with D&D 5e format.",
      cls: "setting-item-description"
    });

    let spellName = "";

    new Setting(container)
      .setName("Spell Name")
      .setDesc("Name of your custom spell")
      .addText((text) => {
        text.setPlaceholder("e.g., Arcane Blast")
          .onChange((value) => {
            spellName = value;
          });
        text.inputEl.focus();
      });

    const buttonContainer = container.createEl("div", { cls: "dnd-modal-buttons" });
    
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const createBtn = buttonContainer.createEl("button", { 
      text: "Create Custom Spell",
      cls: "mod-cta"
    });
    createBtn.addEventListener("click", async () => {
      if (!spellName.trim()) {
        new Notice("Please enter a spell name");
        return;
      }

      await this.createCustomSpell(spellName);
      this.close();
    });
  }

  async createCustomSpell(spellName: string) {
    try {
      const spellPath = `${this.plugin.settings.currentCampaign}/Spells`;
      await this.plugin.ensureFolderExists(spellPath);

      const template = this.plugin.getDefaultSpellTemplate();
      const filePath = `${spellPath}/${spellName}.md`;

      // Update template with spell name
      const content = template.replace("# Spell", `# ${spellName}`);

      await this.app.vault.create(filePath, content);
      await this.app.workspace.openLinkText(filePath, "", true);
      new Notice(`✅ Custom spell "${spellName}" created!`);
    } catch (error) {
      new Notice(`❌ Error creating spell: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Spell Details Modal - Shows full spell info and import button
 */
class SpellDetailsModal extends Modal {
  plugin: DndCampaignHubPlugin;
  spellData: any;

  constructor(app: App, plugin: DndCampaignHubPlugin, spellData: any) {
    super(app);
    this.plugin = plugin;
    this.spellData = spellData;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("spell-details-modal");

    const spell = this.spellData;

    // Header
    contentEl.createEl("h2", { text: spell.name });
    
    const meta = contentEl.createEl("div", { cls: "spell-meta" });
    const levelText = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
    meta.createEl("span", { text: `${levelText} ${spell.school.name}`, cls: "spell-level-school" });

    // Details grid
    const details = contentEl.createEl("div", { cls: "spell-details-grid" });

    this.addDetail(details, "⏱️ Casting Time", spell.casting_time);
    this.addDetail(details, "📏 Range", spell.range);
    this.addDetail(details, "🎭 Components", spell.components.join(", ") + (spell.material ? ` (${spell.material})` : ""));
    this.addDetail(details, "⏳ Duration", spell.duration);
    
    if (spell.concentration) {
      details.createEl("div", { text: "⚠️ Requires Concentration", cls: "spell-concentration" });
    }
    if (spell.ritual) {
      details.createEl("div", { text: "🕯️ Ritual", cls: "spell-ritual" });
    }

    // Description
    const descSection = contentEl.createEl("div", { cls: "spell-description" });
    descSection.createEl("h3", { text: "Description" });
    spell.desc.forEach((para: string) => {
      descSection.createEl("p", { text: para });
    });

    // Higher levels
    if (spell.higher_level && spell.higher_level.length > 0) {
      const higherSection = contentEl.createEl("div", { cls: "spell-higher-level" });
      higherSection.createEl("h3", { text: "At Higher Levels" });
      spell.higher_level.forEach((para: string) => {
        higherSection.createEl("p", { text: para });
      });
    }

    // Classes
    if (spell.classes && spell.classes.length > 0) {
      const classesSection = contentEl.createEl("div", { cls: "spell-classes" });
      classesSection.createEl("strong", { text: "Classes: " });
      classesSection.createEl("span", { 
        text: spell.classes.map((c: any) => c.name).join(", ")
      });
    }

    // Buttons
    const buttonContainer = contentEl.createEl("div", { cls: "dnd-modal-buttons" });
    
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const importBtn = buttonContainer.createEl("button", { 
      text: "📥 Import Spell",
      cls: "mod-cta"
    });
    importBtn.addEventListener("click", async () => {
      await this.importSpell();
      this.close();
    });
  }

  addDetail(container: HTMLElement, label: string, value: string) {
    const detail = container.createEl("div", { cls: "spell-detail" });
    detail.createEl("strong", { text: label + ": " });
    detail.createEl("span", { text: value });
  }

  async importSpell() {
    try {
      const spell = this.spellData;
      const spellPath = `${this.plugin.settings.currentCampaign}/Spells`;
      await this.plugin.ensureFolderExists(spellPath);

      // Build spell content from API data
      const levelText = spell.level === 0 ? "Cantrip" : spell.level.toString();
      const components = spell.components.join(", ");
      const material = spell.material ? `\nMaterials: ${spell.material}` : "";
      
      const description = spell.desc.join("\n\n");
      const higherLevel = spell.higher_level && spell.higher_level.length > 0 
        ? spell.higher_level.join("\n\n")
        : "N/A";

      const classes = spell.classes && spell.classes.length > 0
        ? spell.classes.map((c: any) => c.name).join(", ")
        : "N/A";

      const content = `---
type: spell
template_version: 1.0.0
name: ${spell.name}
level: ${spell.level}
school: ${spell.school.name}
casting_time: ${spell.casting_time}
range: ${spell.range}
components: ${components}
duration: ${spell.duration}
concentration: ${spell.concentration || false}
ritual: ${spell.ritual || false}
classes: ${classes}
source: SRD
---

# ${spell.name}

**${levelText} ${spell.school.name}**

**Casting Time:** ${spell.casting_time}  
**Range:** ${spell.range}  
**Components:** ${components}${material}  
**Duration:** ${spell.duration}${spell.concentration ? " (Concentration)" : ""}${spell.ritual ? " (Ritual)" : ""}

## Description

${description}

## At Higher Levels

${higherLevel}

## Classes

${classes}
`;

      const filePath = `${spellPath}/${spell.name}.md`;
      await this.app.vault.create(filePath, content);
      await this.app.workspace.openLinkText(filePath, "", true);
      new Notice(`✅ Spell "${spell.name}" imported successfully!`);
    } catch (error) {
      new Notice(`❌ Error importing spell: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Import error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * DM Screen - Virtual Dungeon Master reference screen with quick access to rules and SRD data
 */
class DMScreenView extends ItemView {
  plugin: DndCampaignHubPlugin;
  activeTab: string = "conditions";

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DM_SCREEN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "DM Screen";
  }

  getIcon(): string {
    return "shield";
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    if (!container) return;
    
    container.empty();
    container.addClass("dm-screen-view");

    // Header
    const header = container.createEl("div", { cls: "dm-screen-header" });
    header.createEl("h3", { text: "📜 DM Screen" });

    // Tab navigation
    const tabNav = container.createEl("div", { cls: "dm-screen-tabs" });
    const tabs = [
      { id: "conditions", label: "Conditions", icon: "⚠️" },
      { id: "actions", label: "Actions", icon: "⚔️" },
      { id: "combat", label: "Combat", icon: "🎯" },
      { id: "skills", label: "Skills", icon: "🎲" },
      { id: "travel", label: "Travel & Rest", icon: "🏕️" },
      { id: "dcs", label: "DCs", icon: "📊" },
      { id: "damage", label: "Damage", icon: "💥" },
      { id: "cover", label: "Cover", icon: "🛡️" }
    ];

    for (const tab of tabs) {
      const tabBtn = tabNav.createEl("button", {
        text: `${tab.icon} ${tab.label}`,
        cls: `dm-screen-tab ${this.activeTab === tab.id ? "active" : ""}`
      });
      tabBtn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.render();
      });
    }

    // Content area
    const content = container.createEl("div", { cls: "dm-screen-content" });

    switch (this.activeTab) {
      case "conditions":
        await this.renderConditionsTab(content);
        break;
      case "actions":
        this.renderActionsTab(content);
        break;
      case "combat":
        this.renderCombatTab(content);
        break;
      case "skills":
        this.renderSkillsTab(content);
        break;
      case "travel":
        this.renderTravelTab(content);
        break;
      case "dcs":
        this.renderDCsTab(content);
        break;
      case "damage":
        await this.renderDamageTab(content);
        break;
      case "cover":
        this.renderCoverTab(content);
        break;
    }
  }

  async renderConditionsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Conditions" });

    // Try to load from SRD data first
    const conditionsFolder = this.app.vault.getAbstractFileByPath("z_Conditions");
    
    if (conditionsFolder instanceof TFolder && conditionsFolder.children.length > 0) {
      const conditionsGrid = container.createEl("div", { cls: "dm-screen-conditions-grid" });
      
      for (const file of conditionsFolder.children) {
        if (file instanceof TFile && file.extension === "md") {
          const conditionCard = conditionsGrid.createEl("div", { cls: "dm-condition-card" });
          const conditionName = conditionCard.createEl("strong", { text: file.basename });
          conditionName.addClass("dm-condition-link");
          conditionName.addEventListener("click", async () => {
            await this.app.workspace.openLinkText(file.path, "", true);
          });
          
          // Read file to get description
          try {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            let description = "";
            let inFrontmatter = false;
            
            for (const line of lines) {
              if (line.trim() === "---") {
                inFrontmatter = !inFrontmatter;
                continue;
              }
              if (!inFrontmatter && line.trim() && !line.startsWith("#")) {
                description = line.trim();
                break;
              }
            }
            
            if (description) {
              conditionCard.createEl("p", { text: description.substring(0, 150) + (description.length > 150 ? "..." : "") });
            }
          } catch (error) {
            // Ignore read errors
          }
        }
      }
    } else {
      // Fallback to hardcoded conditions
      const conditions = [
        { name: "Blinded", desc: "Can't see. Auto-fail sight checks. Attack rolls have disadvantage; attacks against have advantage." },
        { name: "Charmed", desc: "Can't attack charmer. Charmer has advantage on social checks." },
        { name: "Deafened", desc: "Can't hear. Auto-fail hearing checks." },
        { name: "Frightened", desc: "Disadvantage on checks/attacks while source is visible. Can't willingly move closer." },
        { name: "Grappled", desc: "Speed becomes 0. Ends if grappler is incapacitated or forcefully separated." },
        { name: "Incapacitated", desc: "Can't take actions or reactions." },
        { name: "Invisible", desc: "Impossible to see without magic. Attacks have advantage; attacks against have disadvantage." },
        { name: "Paralyzed", desc: "Incapacitated, can't move or speak. Auto-fail STR/DEX saves. Attacks have advantage; melee crits." },
        { name: "Petrified", desc: "Transformed to stone. Weight x10. Incapacitated, unaware. Resistance to all damage." },
        { name: "Poisoned", desc: "Disadvantage on attack rolls and ability checks." },
        { name: "Prone", desc: "Can only crawl (half speed). Disadvantage on attacks. Melee attacks have advantage; ranged disadvantage." },
        { name: "Restrained", desc: "Speed 0. Attacks have disadvantage; attacks against have advantage. Disadvantage on DEX saves." },
        { name: "Stunned", desc: "Incapacitated, can't move, can speak only falteringly. Auto-fail STR/DEX saves. Attacks have advantage." },
        { name: "Unconscious", desc: "Incapacitated, can't move or speak, unaware. Drop what held, fall prone. Auto-fail STR/DEX. Attacks have advantage; melee crits." },
        { name: "Exhaustion", desc: "1: Disadv on checks. 2: Speed halved. 3: Disadv attacks/saves. 4: HP max halved. 5: Speed 0. 6: Death." }
      ];

      const conditionsGrid = container.createEl("div", { cls: "dm-screen-conditions-grid" });
      
      for (const condition of conditions) {
        const card = conditionsGrid.createEl("div", { cls: "dm-condition-card" });
        card.createEl("strong", { text: condition.name });
        card.createEl("p", { text: condition.desc });
      }
    }
  }

  renderActionsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Actions in Combat" });

    const actionsData = [
      {
        category: "Actions",
        items: [
          { name: "Attack", desc: "Make one melee or ranged attack. Some features allow multiple attacks." },
          { name: "Cast a Spell", desc: "Cast a spell with a casting time of 1 action." },
          { name: "Dash", desc: "Gain extra movement equal to your speed for the turn." },
          { name: "Disengage", desc: "Your movement doesn't provoke opportunity attacks for the turn." },
          { name: "Dodge", desc: "Attacks against you have disadvantage; DEX saves have advantage (if you can see)." },
          { name: "Help", desc: "Give an ally advantage on their next ability check or attack roll." },
          { name: "Hide", desc: "Make a Dexterity (Stealth) check to hide." },
          { name: "Ready", desc: "Prepare an action to trigger on a specific condition (uses reaction)." },
          { name: "Search", desc: "Make a Wisdom (Perception) or Intelligence (Investigation) check." },
          { name: "Use an Object", desc: "Interact with an object that requires an action." },
          { name: "Grapple", desc: "STR (Athletics) vs STR (Athletics) or DEX (Acrobatics). Target at most one size larger." },
          { name: "Shove", desc: "STR (Athletics) vs STR (Athletics) or DEX (Acrobatics). Push 5ft or knock prone." }
        ]
      },
      {
        category: "Bonus Actions",
        items: [
          { name: "Two-Weapon Fighting", desc: "Attack with light melee weapon in off hand (no ability mod to damage)." },
          { name: "Class Features", desc: "Cunning Action (Rogue), Rage (Barbarian), etc." },
          { name: "Spells", desc: "Cast spells with bonus action casting time." }
        ]
      },
      {
        category: "Reactions",
        items: [
          { name: "Opportunity Attack", desc: "Melee attack when hostile creature leaves your reach." },
          { name: "Readied Action", desc: "Use your prepared action when trigger occurs." },
          { name: "Spells", desc: "Shield, Counterspell, etc." }
        ]
      },
      {
        category: "Movement",
        items: [
          { name: "Move", desc: "Move up to your speed. Can split before/after actions." },
          { name: "Stand Up", desc: "Costs half your movement to stand from prone." },
          { name: "Climb/Swim", desc: "Each foot costs 2 feet of movement (unless you have a climb/swim speed)." },
          { name: "Difficult Terrain", desc: "Each foot costs 2 feet of movement." },
          { name: "Jump", desc: "Long: STR score in feet (running). High: 3 + STR mod feet (running)." }
        ]
      },
      {
        category: "Free Actions",
        items: [
          { name: "Object Interaction", desc: "One free object interaction per turn (draw weapon, open door)." },
          { name: "Communicate", desc: "Brief utterances and gestures during your turn." },
          { name: "Drop Item", desc: "Drop something you're holding." },
          { name: "Drop Prone", desc: "Fall prone (standing costs movement)." }
        ]
      }
    ];

    for (const section of actionsData) {
      const sectionEl = container.createEl("div", { cls: "dm-screen-section" });
      sectionEl.createEl("h5", { text: section.category });
      
      const tableEl = sectionEl.createEl("table", { cls: "dm-screen-table" });
      const tbody = tableEl.createEl("tbody");
      
      for (const item of section.items) {
        const row = tbody.createEl("tr");
        row.createEl("td", { text: item.name, cls: "dm-table-name" });
        row.createEl("td", { text: item.desc });
      }
    }
  }

  renderCombatTab(container: HTMLElement) {
    container.createEl("h4", { text: "Combat Rules Quick Reference" });

    // Attack Roll
    const attackSection = container.createEl("div", { cls: "dm-screen-section" });
    attackSection.createEl("h5", { text: "Attack Roll" });
    attackSection.createEl("p", { text: "d20 + ability modifier + proficiency bonus (if proficient)" });
    attackSection.createEl("p", { text: "• Melee: Strength modifier (or Dex with Finesse weapons)" });
    attackSection.createEl("p", { text: "• Ranged: Dexterity modifier" });
    attackSection.createEl("p", { text: "• Spell: Spellcasting ability modifier" });

    // Critical Hits
    const critSection = container.createEl("div", { cls: "dm-screen-section" });
    critSection.createEl("h5", { text: "Critical Hits" });
    critSection.createEl("p", { text: "Natural 20: Roll damage dice twice, then add modifiers." });
    critSection.createEl("p", { text: "Natural 1: Automatic miss regardless of modifiers." });

    // Advantage/Disadvantage
    const advSection = container.createEl("div", { cls: "dm-screen-section" });
    advSection.createEl("h5", { text: "Advantage & Disadvantage" });
    advSection.createEl("p", { text: "Advantage: Roll 2d20, use higher result" });
    advSection.createEl("p", { text: "Disadvantage: Roll 2d20, use lower result" });
    advSection.createEl("p", { text: "Multiple sources don't stack. If both apply, they cancel out." });

    // Death Saves
    const deathSection = container.createEl("div", { cls: "dm-screen-section" });
    deathSection.createEl("h5", { text: "Death Saving Throws" });
    deathSection.createEl("p", { text: "At 0 HP, roll d20 at start of each turn:" });
    deathSection.createEl("p", { text: "• 10+: Success | <10: Failure" });
    deathSection.createEl("p", { text: "• Natural 1: 2 failures | Natural 20: Regain 1 HP" });
    deathSection.createEl("p", { text: "• 3 successes: Stabilize | 3 failures: Death" });

    // Concentration
    const concentrationSection = container.createEl("div", { cls: "dm-screen-section" });
    concentrationSection.createEl("h5", { text: "Concentration" });
    concentrationSection.createEl("p", { text: "When damaged: CON save DC = 10 or half damage (whichever is higher)" });
    concentrationSection.createEl("p", { text: "Broken by: Incapacitation, death, or casting another concentration spell" });

    // Initiative
    const initSection = container.createEl("div", { cls: "dm-screen-section" });
    initSection.createEl("h5", { text: "Initiative" });
    initSection.createEl("p", { text: "d20 + Dexterity modifier" });
    initSection.createEl("p", { text: "Ties: DM decides (often higher Dex goes first, or simultaneous)" });

    // Surprise
    const surpriseSection = container.createEl("div", { cls: "dm-screen-section" });
    surpriseSection.createEl("h5", { text: "Surprise" });
    surpriseSection.createEl("p", { text: "Surprised creatures can't move or take actions on their first turn." });
    surpriseSection.createEl("p", { text: "Can't take reactions until that turn ends." });
  }

  renderSkillsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Skills by Ability" });

    const skills = {
      "Strength (STR)": ["Athletics"],
      "Dexterity (DEX)": ["Acrobatics", "Sleight of Hand", "Stealth"],
      "Constitution (CON)": ["(No skills, but concentration and HP)"],
      "Intelligence (INT)": ["Arcana", "History", "Investigation", "Nature", "Religion"],
      "Wisdom (WIS)": ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
      "Charisma (CHA)": ["Deception", "Intimidation", "Performance", "Persuasion"]
    };

    for (const [ability, skillList] of Object.entries(skills)) {
      const section = container.createEl("div", { cls: "dm-screen-section" });
      section.createEl("h5", { text: ability });
      const list = section.createEl("ul");
      for (const skill of skillList) {
        list.createEl("li", { text: skill });
      }
    }

    // Passive Scores
    const passiveSection = container.createEl("div", { cls: "dm-screen-section" });
    passiveSection.createEl("h5", { text: "Passive Scores" });
    passiveSection.createEl("p", { text: "Passive Score = 10 + all modifiers that apply" });
    passiveSection.createEl("p", { text: "Advantage: +5 | Disadvantage: -5" });
    passiveSection.createEl("p", { text: "Common: Passive Perception, Passive Investigation, Passive Insight" });
  }

  renderTravelTab(container: HTMLElement) {
    container.createEl("h4", { text: "Travel & Rest" });

    // Travel Pace
    const travelSection = container.createEl("div", { cls: "dm-screen-section" });
    travelSection.createEl("h5", { text: "Travel Pace" });
    const travelTable = travelSection.createEl("table", { cls: "dm-screen-table" });
    const travelBody = travelTable.createEl("tbody");
    
    const paces = [
      { pace: "Fast", perMin: "400 ft", perHour: "4 miles", perDay: "30 miles", effect: "-5 passive Perception" },
      { pace: "Normal", perMin: "300 ft", perHour: "3 miles", perDay: "24 miles", effect: "—" },
      { pace: "Slow", perMin: "200 ft", perHour: "2 miles", perDay: "18 miles", effect: "Can use Stealth" }
    ];

    const header = travelBody.createEl("tr");
    header.createEl("th", { text: "Pace" });
    header.createEl("th", { text: "/Minute" });
    header.createEl("th", { text: "/Hour" });
    header.createEl("th", { text: "/Day" });
    header.createEl("th", { text: "Effect" });

    for (const pace of paces) {
      const row = travelBody.createEl("tr");
      row.createEl("td", { text: pace.pace });
      row.createEl("td", { text: pace.perMin });
      row.createEl("td", { text: pace.perHour });
      row.createEl("td", { text: pace.perDay });
      row.createEl("td", { text: pace.effect });
    }

    // Short Rest
    const shortRestSection = container.createEl("div", { cls: "dm-screen-section" });
    shortRestSection.createEl("h5", { text: "Short Rest (1+ hour)" });
    shortRestSection.createEl("p", { text: "• Spend Hit Dice to recover HP (roll + CON mod each)" });
    shortRestSection.createEl("p", { text: "• Some class features recharge" });
    shortRestSection.createEl("p", { text: "• Light activity: eating, reading, keeping watch" });

    // Long Rest
    const longRestSection = container.createEl("div", { cls: "dm-screen-section" });
    longRestSection.createEl("h5", { text: "Long Rest (8+ hours, 6 hours sleep)" });
    longRestSection.createEl("p", { text: "• Regain all HP" });
    longRestSection.createEl("p", { text: "• Regain half your total Hit Dice (minimum 1)" });
    longRestSection.createEl("p", { text: "• Regain all spell slots" });
    longRestSection.createEl("p", { text: "• Remove 1 level of Exhaustion" });
    longRestSection.createEl("p", { text: "• Can only benefit from one long rest per 24 hours" });

    // Carrying Capacity
    const carrySection = container.createEl("div", { cls: "dm-screen-section" });
    carrySection.createEl("h5", { text: "Carrying Capacity" });
    carrySection.createEl("p", { text: "Carry: STR × 15 lbs" });
    carrySection.createEl("p", { text: "Push/Drag/Lift: STR × 30 lbs (speed = 5 ft)" });
    carrySection.createEl("p", { text: "Encumbered (variant): > STR × 5 lbs = -10 speed" });
    carrySection.createEl("p", { text: "Heavily Encumbered (variant): > STR × 10 lbs = -20 speed, disadvantage on attacks/checks/saves" });
  }

  renderDCsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Difficulty Classes" });

    // Standard DCs
    const dcSection = container.createEl("div", { cls: "dm-screen-section" });
    dcSection.createEl("h5", { text: "Typical Difficulty Classes" });
    const dcTable = dcSection.createEl("table", { cls: "dm-screen-table" });
    const dcBody = dcTable.createEl("tbody");
    
    const dcs = [
      { difficulty: "Very Easy", dc: "5" },
      { difficulty: "Easy", dc: "10" },
      { difficulty: "Medium", dc: "15" },
      { difficulty: "Hard", dc: "20" },
      { difficulty: "Very Hard", dc: "25" },
      { difficulty: "Nearly Impossible", dc: "30" }
    ];

    for (const dc of dcs) {
      const row = dcBody.createEl("tr");
      row.createEl("td", { text: dc.difficulty });
      row.createEl("td", { text: `DC ${dc.dc}`, cls: "dm-table-highlight" });
    }

    // Spell Save DC
    const spellDcSection = container.createEl("div", { cls: "dm-screen-section" });
    spellDcSection.createEl("h5", { text: "Spell Save DC" });
    spellDcSection.createEl("p", { text: "8 + proficiency bonus + spellcasting ability modifier" });

    // Spell Attack
    const spellAttackSection = container.createEl("div", { cls: "dm-screen-section" });
    spellAttackSection.createEl("h5", { text: "Spell Attack Modifier" });
    spellAttackSection.createEl("p", { text: "Proficiency bonus + spellcasting ability modifier" });

    // AC Calculation
    const acSection = container.createEl("div", { cls: "dm-screen-section" });
    acSection.createEl("h5", { text: "Armor Class" });
    acSection.createEl("p", { text: "No Armor: 10 + DEX mod" });
    acSection.createEl("p", { text: "Light Armor: Armor AC + DEX mod" });
    acSection.createEl("p", { text: "Medium Armor: Armor AC + DEX mod (max +2)" });
    acSection.createEl("p", { text: "Heavy Armor: Armor AC (no DEX)" });
    acSection.createEl("p", { text: "Shield: +2 AC" });
  }

  async renderDamageTab(container: HTMLElement) {
    container.createEl("h4", { text: "Damage Types" });

    // Try to load from SRD data
    const damageFolder = this.app.vault.getAbstractFileByPath("z_DamageTypes");
    
    if (damageFolder instanceof TFolder && damageFolder.children.length > 0) {
      const damageGrid = container.createEl("div", { cls: "dm-screen-damage-grid" });
      
      for (const file of damageFolder.children) {
        if (file instanceof TFile && file.extension === "md") {
          const card = damageGrid.createEl("div", { cls: "dm-damage-card" });
          const nameEl = card.createEl("strong", { text: file.basename });
          nameEl.addClass("dm-damage-link");
          nameEl.addEventListener("click", async () => {
            await this.app.workspace.openLinkText(file.path, "", true);
          });
          
          // Read description
          try {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            let description = "";
            let inFrontmatter = false;
            
            for (const line of lines) {
              if (line.trim() === "---") {
                inFrontmatter = !inFrontmatter;
                continue;
              }
              if (!inFrontmatter && line.trim() && !line.startsWith("#")) {
                description = line.trim();
                break;
              }
            }
            
            if (description) {
              card.createEl("p", { text: description.substring(0, 100) + (description.length > 100 ? "..." : "") });
            }
          } catch (error) {
            // Ignore
          }
        }
      }
    } else {
      // Fallback
      const damageTypes = [
        { name: "Acid", desc: "Corrosive spray or digestive enzymes.", example: "Black dragon breath" },
        { name: "Bludgeoning", desc: "Blunt force attacks.", example: "Clubs, falling, constriction" },
        { name: "Cold", desc: "Infernal chill.", example: "White dragon breath, cone of cold" },
        { name: "Fire", desc: "Flames and heat.", example: "Red dragon breath, fireball" },
        { name: "Force", desc: "Pure magical energy.", example: "Magic missile, spiritual weapon" },
        { name: "Lightning", desc: "Electrical discharge.", example: "Blue dragon breath, lightning bolt" },
        { name: "Necrotic", desc: "Life-draining energy.", example: "Chill touch, harm" },
        { name: "Piercing", desc: "Puncturing and stabbing.", example: "Arrows, spears, teeth" },
        { name: "Poison", desc: "Toxins and venom.", example: "Green dragon breath, poison spray" },
        { name: "Psychic", desc: "Mental assault.", example: "Mind flayer attacks, vicious mockery" },
        { name: "Radiant", desc: "Divine and celestial.", example: "Guiding bolt, sacred flame" },
        { name: "Slashing", desc: "Cutting attacks.", example: "Swords, axes, claws" },
        { name: "Thunder", desc: "Concussive sound.", example: "Thunderwave, shatter" }
      ];

      const damageGrid = container.createEl("div", { cls: "dm-screen-damage-grid" });
      
      for (const type of damageTypes) {
        const card = damageGrid.createEl("div", { cls: "dm-damage-card" });
        card.createEl("strong", { text: type.name });
        card.createEl("p", { text: type.desc });
        card.createEl("p", { text: `(${type.example})`, cls: "dm-damage-example" });
      }
    }

    // Resistances and Immunities
    const resistSection = container.createEl("div", { cls: "dm-screen-section" });
    resistSection.createEl("h5", { text: "Resistance & Immunity" });
    resistSection.createEl("p", { text: "Resistance: Take half damage (round down)" });
    resistSection.createEl("p", { text: "Vulnerability: Take double damage" });
    resistSection.createEl("p", { text: "Immunity: Take no damage" });
    resistSection.createEl("p", { text: "Multiple resistances/vulnerabilities don't stack." });
  }

  renderCoverTab(container: HTMLElement) {
    container.createEl("h4", { text: "Cover" });

    const coverSection = container.createEl("div", { cls: "dm-screen-section" });
    const coverTable = coverSection.createEl("table", { cls: "dm-screen-table" });
    const coverBody = coverTable.createEl("tbody");
    
    const header = coverBody.createEl("tr");
    header.createEl("th", { text: "Cover" });
    header.createEl("th", { text: "AC/DEX Bonus" });
    header.createEl("th", { text: "Example" });

    const covers = [
      { type: "Half Cover", bonus: "+2", example: "Low wall, furniture, another creature" },
      { type: "Three-Quarters", bonus: "+5", example: "Arrow slit, tree trunk" },
      { type: "Total Cover", bonus: "Can't be targeted", example: "Completely concealed" }
    ];

    for (const cover of covers) {
      const row = coverBody.createEl("tr");
      row.createEl("td", { text: cover.type });
      row.createEl("td", { text: cover.bonus, cls: "dm-table-highlight" });
      row.createEl("td", { text: cover.example });
    }

    // Obscurement
    const obscureSection = container.createEl("div", { cls: "dm-screen-section" });
    obscureSection.createEl("h5", { text: "Obscurement" });
    
    const obscureTable = obscureSection.createEl("table", { cls: "dm-screen-table" });
    const obscureBody = obscureTable.createEl("tbody");
    
    const obscureHeader = obscureBody.createEl("tr");
    obscureHeader.createEl("th", { text: "Type" });
    obscureHeader.createEl("th", { text: "Effect" });
    obscureHeader.createEl("th", { text: "Example" });

    const obscures = [
      { type: "Lightly Obscured", effect: "Disadvantage on Perception", example: "Dim light, patchy fog, moderate foliage" },
      { type: "Heavily Obscured", effect: "Effectively blinded", example: "Darkness, opaque fog, dense foliage" }
    ];

    for (const obs of obscures) {
      const row = obscureBody.createEl("tr");
      row.createEl("td", { text: obs.type });
      row.createEl("td", { text: obs.effect });
      row.createEl("td", { text: obs.example });
    }

    // Light
    const lightSection = container.createEl("div", { cls: "dm-screen-section" });
    lightSection.createEl("h5", { text: "Light" });
    lightSection.createEl("p", { text: "Bright Light: Normal vision" });
    lightSection.createEl("p", { text: "Dim Light: Lightly obscured, disadvantage on Perception" });
    lightSection.createEl("p", { text: "Darkness: Heavily obscured, effectively blinded" });

    // Vision Types
    const visionSection = container.createEl("div", { cls: "dm-screen-section" });
    visionSection.createEl("h5", { text: "Special Vision" });
    visionSection.createEl("p", { text: "Darkvision: See dim light as bright, darkness as dim (no color). Common range: 60 ft." });
    visionSection.createEl("p", { text: "Blindsight: Perceive surroundings without sight. Common range: 10-60 ft." });
    visionSection.createEl("p", { text: "Truesight: See in darkness, invisible creatures, illusions, shapechangers, ethereal plane." });
    visionSection.createEl("p", { text: "Tremorsense: Detect vibrations through the ground." });
  }

  async onClose() {
    const container = this.containerEl.children[1];
    if (container) {
      container.empty();
    }
  }
}
