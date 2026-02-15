import { App, TFile, TFolder } from "obsidian";
import { MarkerLibrary } from "../marker/MarkerLibrary";
import { MarkerDefinition, CreatureSize } from "../marker/MarkerTypes";

/**
 * Current template versions - increment when templates change
 */
export const TEMPLATE_VERSIONS = {
  world: "1.0.0",
  session: "1.2.1", // Fixed escaping issues in interactive scene checkboxes
  npc: "1.2.0", // Added Edit/Delete buttons
  pc: "1.2.0", // Added Edit/Delete buttons
  player: "1.2.0", // Added Edit/Delete buttons (same as pc)
  adventure: "1.1.1", // Fixed escaping issues in interactive scene checkboxes
  scene: "2.0.0", // Specialized scene templates (social, combat, exploration, puzzle, montage)
  faction: "1.0.0",
  item: "1.1.0", // Updated with Edit/Delete buttons
  spell: "1.0.0",
  campaign: "1.0.0",
  trap: "1.1.0", // Updated with Edit/Delete buttons
  creature: "1.2.0" // Added token_id for map markers
};

/**
 * Safe template migration system
 * Tracks versions and applies incremental updates without data loss
 */
export class MigrationManager {
  private app: App;
  private markerLibrary: MarkerLibrary;

  constructor(app: App, markerLibrary: MarkerLibrary) {
    this.app = app;
    this.markerLibrary = markerLibrary;
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
   * Parse frontmatter fields from file content
   * More reliable than metadataCache which might not be populated yet
   */
  async parseFrontmatter(file: TFile): Promise<Record<string, any> | null> {
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) return null;

    const frontmatter = frontmatterMatch[1];
    const result: Record<string, any> = {};

    // Parse each line as key: value
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match && match[1] && match[2] !== undefined) {
        const key = match[1];
        const value = match[2].trim();
        result[key] = value;
      }
    }

    return result;
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
    if (this.compareVersions(currentVersion, targetVersion) < 0) {
      return true;
    }

    // Even if version matches, check if required fields are missing
    // This handles cases where migration partially failed
    const frontmatter = await this.parseFrontmatter(file);
    if (!frontmatter) return false;

    // Check for token_id field in types that should have it
    const typesThatNeedTokens = ['player', 'npc', 'creature'];
    if (typesThatNeedTokens.includes(fileType) && !frontmatter.token_id) {
      return true;
    }

    return false;
  }

  /**
   * Compare semantic versions (returns -1 if a < b, 0 if equal, 1 if a > b)
   */
  compareVersions(a: string, b: string): number {
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

    // Also check z_Beastiarity folder for creatures
    const beastiaryFolder = this.app.vault.getAbstractFileByPath("z_Beastiarity");
    if (beastiaryFolder instanceof TFolder) {
      await processFolder(beastiaryFolder);
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
   * Create a map token for an entity and add token_id to frontmatter
   */
  async createTokenForEntity(
    file: TFile,
    entityName: string,
    entityType: 'player' | 'npc' | 'creature',
    creatureSize: CreatureSize = 'medium'
  ): Promise<string> {
    const now = Date.now();
    const tokenId = this.markerLibrary.generateId();
    
    // Determine token appearance based on type
    const defaultConfig = { icon: '🐉', backgroundColor: '#8b0000' };
    const tokenConfigs: Record<string, { icon: string; backgroundColor: string }> = {
      'player': { icon: '🛡️', backgroundColor: '#4a90d9' },
      'npc': { icon: '👤', backgroundColor: '#6b8e23' },
      'creature': defaultConfig
    };
    
    const config = tokenConfigs[entityType] ?? defaultConfig;
    
    const tokenDef: MarkerDefinition = {
      id: tokenId,
      name: entityName,
      type: entityType,
      icon: config.icon,
      backgroundColor: config.backgroundColor,
      borderColor: '#ffffff',
      creatureSize: creatureSize,
      createdAt: now,
      updatedAt: now
    };
    
    await this.markerLibrary.setMarker(tokenDef);
    
    // Add token_id to frontmatter
    await this.addFrontmatterField(file, 'token_id', tokenId);
    
    return tokenId;
  }

  /**
   * Migrate PC/Player to v1.1.0 (add token)
   */
  async migratePlayerTo1_1_0(file: TFile): Promise<void> {
    console.log(`Migrating player ${file.path} to v1.1.0`);

    const frontmatter = await this.parseFrontmatter(file);
    
    if (!frontmatter) {
      console.error(`Failed to parse frontmatter for ${file.path}`);
      return;
    }
    
    // Check if already has token_id
    if (frontmatter.token_id) {
      console.log(`Player ${file.path} already has token_id`);
      await this.updateTemplateVersion(file, "1.1.0");
      return;
    }
    
    const name = frontmatter.name || file.basename;
    await this.createTokenForEntity(file, name, 'player', 'medium');
    await this.updateTemplateVersion(file, "1.1.0");
    
    console.log(`Player ${file.path} migrated to v1.1.0 with token`);
  }

  /**
   * Migrate NPC to v1.1.0 (add token)
   */
  async migrateNPCTo1_1_0(file: TFile): Promise<void> {
    console.log(`Migrating NPC ${file.path} to v1.1.0`);

    const frontmatter = await this.parseFrontmatter(file);
    
    if (!frontmatter) {
      console.error(`Failed to parse frontmatter for ${file.path}`);
      return;
    }
    
    // Check if already has token_id
    if (frontmatter.token_id) {
      console.log(`NPC ${file.path} already has token_id`);
      await this.updateTemplateVersion(file, "1.1.0");
      return;
    }
    
    const name = frontmatter.name || file.basename;
    await this.createTokenForEntity(file, name, 'npc', 'medium');
    await this.updateTemplateVersion(file, "1.1.0");
    
    console.log(`NPC ${file.path} migrated to v1.1.0 with token`);
  }

  /**
   * Migrate Creature to v1.2.0 (add token)
   */
  async migrateCreatureTo1_2_0(file: TFile): Promise<void> {
    console.log(`Migrating creature ${file.path} to v1.2.0`);

    const frontmatter = await this.parseFrontmatter(file);
    
    if (!frontmatter) {
      console.error(`Failed to parse frontmatter for ${file.path}`);
      return;
    }
    
    // Check if already has token_id
    if (frontmatter.token_id) {
      console.log(`Creature ${file.path} already has token_id`);
      await this.updateTemplateVersion(file, "1.2.0");
      return;
    }
    
    const name = frontmatter.name || file.basename;
    
    // Map creature size from frontmatter
    const sizeMap: Record<string, CreatureSize> = {
      'Tiny': 'tiny',
      'Small': 'small',
      'Medium': 'medium',
      'Large': 'large',
      'Huge': 'huge',
      'Gargantuan': 'gargantuan'
    };
    const size: CreatureSize = sizeMap[frontmatter.size] || 'medium';
    
    await this.createTokenForEntity(file, name, 'creature', size);
    await this.updateTemplateVersion(file, "1.2.0");
    
    console.log(`Creature ${file.path} migrated to v1.2.0 with token`);
  }

  /**
   * Migrate PC/Player to v1.2.0 (add edit/delete buttons)
   */
  async migratePlayerTo1_2_0(file: TFile): Promise<void> {
    console.log(`Migrating player ${file.path} to v1.2.0`);

    const content = await this.app.vault.read(file);
    
    // Check if edit/delete buttons already exist
    if (content.includes("dnd-campaign-hub:edit-pc")) {
      console.log(`Player ${file.path} already has edit/delete buttons`);
      await this.updateTemplateVersion(file, "1.2.0");
      return;
    }
    
    const buttonBlock = `\`\`\`dataviewjs
// Action buttons for PC management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit PC button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit PC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-pc");
});

// Delete PC button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete PC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-pc");
});
\`\`\`
`;
    
    // Insert button block after the title (first # heading)
    const titleMatch = content.match(/^(---\n[\s\S]*?\n---\n\n)(# .+\n)/m);
    if (titleMatch) {
      const newContent = content.replace(
        titleMatch[0],
        `${titleMatch[1]}${titleMatch[2]}\n${buttonBlock}\n`
      );
      await this.app.vault.modify(file, newContent);
    }
    
    await this.updateTemplateVersion(file, "1.2.0");
    console.log(`Player ${file.path} migrated to v1.2.0 with edit/delete buttons`);
  }

  /**
   * Migrate NPC to v1.2.0 (add edit/delete buttons)
   */
  async migrateNPCTo1_2_0(file: TFile): Promise<void> {
    console.log(`Migrating NPC ${file.path} to v1.2.0`);

    const content = await this.app.vault.read(file);
    
    // Check if edit/delete buttons already exist
    if (content.includes("dnd-campaign-hub:edit-npc")) {
      console.log(`NPC ${file.path} already has edit/delete buttons`);
      await this.updateTemplateVersion(file, "1.2.0");
      return;
    }
    
    const buttonBlock = `\`\`\`dataviewjs
// Action buttons for NPC management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit NPC button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit NPC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-npc");
});

// Delete NPC button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete NPC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-npc");
});
\`\`\`
`;
    
    // Insert button block after the title (first # heading)
    const titleMatch = content.match(/^(---\n[\s\S]*?\n---\n\n)(# .+\n)/m);
    if (titleMatch) {
      const newContent = content.replace(
        titleMatch[0],
        `${titleMatch[1]}${titleMatch[2]}\n${buttonBlock}\n`
      );
      await this.app.vault.modify(file, newContent);
    }
    
    await this.updateTemplateVersion(file, "1.2.0");
    console.log(`NPC ${file.path} migrated to v1.2.0 with edit/delete buttons`);
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

      // Player/PC-specific migrations
      if (fileType === "player" || fileType === "pc") {
        // Migrate to 1.1.0 (add token)
        if (this.compareVersions(currentVersion, "1.1.0") < 0) {
          await this.migratePlayerTo1_1_0(file);
          // After migrating to 1.1.0, continue to check for 1.2.0
          const updatedVersion = await this.getFileTemplateVersion(file);
          if (updatedVersion && this.compareVersions(updatedVersion, "1.2.0") < 0) {
            await this.migratePlayerTo1_2_0(file);
          }
          return true;
        }
        // Migrate from 1.1.0 to 1.2.0 (add edit/delete buttons)
        if (this.compareVersions(currentVersion, "1.2.0") < 0) {
          await this.migratePlayerTo1_2_0(file);
          return true;
        }
        // Check if token_id is missing even if version is up to date
        const frontmatter = await this.parseFrontmatter(file);
        if (frontmatter && !frontmatter.token_id) {
          console.log(`${file.path} has correct version but missing token_id, re-running migration`);
          await this.migratePlayerTo1_1_0(file);
          return true;
        }
      }

      // NPC-specific migrations
      if (fileType === "npc") {
        // Migrate to 1.1.0 (add token)
        if (this.compareVersions(currentVersion, "1.1.0") < 0) {
          await this.migrateNPCTo1_1_0(file);
          // After migrating to 1.1.0, continue to check for 1.2.0
          const updatedVersion = await this.getFileTemplateVersion(file);
          if (updatedVersion && this.compareVersions(updatedVersion, "1.2.0") < 0) {
            await this.migrateNPCTo1_2_0(file);
          }
          return true;
        }
        // Migrate from 1.1.0 to 1.2.0 (add edit/delete buttons)
        if (this.compareVersions(currentVersion, "1.2.0") < 0) {
          await this.migrateNPCTo1_2_0(file);
          return true;
        }
        // Check if token_id is missing even if version is up to date
        const frontmatter = await this.parseFrontmatter(file);
        if (frontmatter && !frontmatter.token_id) {
          console.log(`${file.path} has correct version but missing token_id, re-running migration`);
          await this.migrateNPCTo1_1_0(file);
          return true;
        }
      }

      // Creature-specific migrations (add token)
      if (fileType === "creature") {
        if (this.compareVersions(currentVersion, "1.2.0") < 0) {
          await this.migrateCreatureTo1_2_0(file);
          return true;
        }
        // Check if token_id is missing even if version is up to date
        const frontmatter = await this.parseFrontmatter(file);
        if (frontmatter && !frontmatter.token_id) {
          console.log(`${file.path} has correct version but missing token_id, re-running migration`);
          await this.migrateCreatureTo1_2_0(file);
          return true;
        }
      }

      // For other types, if version is outdated, update it
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
