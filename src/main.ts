import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, requestUrl } from "obsidian";
import {
  WORLD_TEMPLATE,
  SESSION_GM_TEMPLATE,
  SESSION_PLAYER_TEMPLATE,
  NPC_TEMPLATE,
  PC_TEMPLATE,
  ADVENTURE_TEMPLATE,
  SCENE_TEMPLATE,
  TRAP_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  SPELL_TEMPLATE,
  CAMPAIGN_TEMPLATE,
  SESSION_DEFAULT_TEMPLATE
} from "./templates";

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
  session: "1.0.0",
  npc: "1.0.0",
  pc: "1.0.0",
  adventure: "1.0.0",
  scene: "1.2.0", // Updated with encounter_creatures field
  faction: "1.0.0",
  item: "1.0.0",
  spell: "1.0.0",
  campaign: "1.0.0"
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

  async calculateEncounterDifficulty(): Promise<any> {
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
    // Escape backslashes first, then quotes
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
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

export default class DndCampaignHubPlugin extends Plugin {
  settings!: DndCampaignHubSettings;
  SessionCreationModal = SessionCreationModal;
  migrationManager!: MigrationManager;

  async onload() {
    await this.loadSettings();

    // Initialize the migration manager
    this.migrationManager = new MigrationManager(this.app, this);

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
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "M",
        },
      ],
      callback: () => this.createTrap(),
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
		// Open session creation modal
		new SessionCreationModal(this.app, this).open();
	}

	async createItem() {
		const itemName = await this.promptForName("Item");
		if (!itemName) return;

		const itemPath = `${this.settings.currentCampaign}/Items/${itemName}`;
		await this.ensureFolderExists(itemPath);

		const template = this.getDefaultItemTemplate();
		const filePath = `${itemPath}/${itemName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`Item "${itemName}" created!`);
	}

	async createSpell() {
		const spellName = await this.promptForName("Spell");
		if (!spellName) return;

		const spellPath = `${this.settings.currentCampaign}/Spells/${spellName}`;
		await this.ensureFolderExists(spellPath);

		const template = this.getDefaultSpellTemplate();
		const filePath = `${spellPath}/${spellName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`Spell "${spellName}" created!`);
	}

	async createFaction() {
		// Open Faction creation modal
		new FactionCreationModal(this.app, this).open();
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
      "And all other z_* folders"
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

class SessionCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
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

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string) {
    super(app);
    this.plugin = plugin;
    this.sessionDate = new Date().toISOString().split('T')[0] || "";
    if (adventurePath) {
      this.adventurePath = adventurePath;
    }
  }

  async getAllAdventures(): Promise<Array<{ path: string; name: string }>> {
    const adventures: Array<{ path: string; name: string }> = [];
    const campaignPath = this.plugin.settings.currentCampaign;
    
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
    const campaignPath = this.plugin.settings.currentCampaign;
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
    const campaignFolder = this.app.vault.getAbstractFileByPath(this.plugin.settings.currentCampaign);
    
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
    const campaignPath = this.plugin.settings.currentCampaign;
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
    const campaignFolder = this.app.vault.getAbstractFileByPath(this.plugin.settings.currentCampaign);
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
    const campaignPath = this.plugin.settings.currentCampaign;
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

  async calculateEncounterDifficulty(): Promise<any> {
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
      this.sceneName = frontmatter.name || sceneFile.basename;
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
          this.creatures = creaturesData.map((c: any) => ({
            name: c.name || "Unknown",
            count: c.count || 1,
            hp: c.hp,
            ac: c.ac,
            cr: c.cr,
            source: c.source || "vault",
            path: c.path
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
        .addOption("social", "Social")
        .addOption("combat", "Combat")
        .addOption("exploration", "Exploration")
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

      new Notice(`Creating scene "${this.sceneName}"...`);

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
    // Renumber scenes from highest to lowest to avoid conflicts
    const sorted = [...scenes].sort((a, b) => b.number - a.number);
    
    for (const scene of sorted) {
      const oldFile = this.app.vault.getAbstractFileByPath(scene.path);
      if (!(oldFile instanceof TFile)) continue;

      const newNumber = scene.number + 1;
      const newPath = scene.path.replace(
        /Scene\s+\d+\s+-/,
        `Scene ${newNumber} -`
      );

      // Read content and update scene_number in frontmatter
      let content = await this.app.vault.read(oldFile);
      content = content.replace(
        /^scene_number:\s*\d+$/m,
        `scene_number: ${newNumber}`
      );

      // Create new file with updated content
      await this.app.vault.create(newPath, content);
      
      // Delete old file
      await this.app.vault.delete(oldFile);
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
    
    const sceneContent = SCENE_TEMPLATE
      .replace(/{{SCENE_NUMBER}}/g, scene.num.toString())
      .replace(/{{SCENE_NAME}}/g, scene.name)
      .replace(/{{ADVENTURE_NAME}}/g, adventureName)
      .replace(/{{ACT_NUMBER}}/g, scene.act.toString())
      .replace(/{{DURATION}}/g, scene.duration)
      .replace(/{{TYPE}}/g, scene.type)
      .replace(/{{DIFFICULTY}}/g, scene.difficulty)
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
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
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

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, scenePath?: string) {
    super(app);
    this.plugin = plugin;
    if (adventurePath) this.adventurePath = adventurePath;
    if (scenePath) this.scenePath = scenePath;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create New Trap" });

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
        .setButtonText("Create Trap")
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
              element.damage = value;
            })
        );

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

      // Create trap file path
      let trapPath = "";
      if (this.scenePath) {
        // Create trap in same folder as scene
        const sceneFolder = this.scenePath.substring(0, this.scenePath.lastIndexOf("/"));
        trapPath = `${sceneFolder}/${this.trapName}.md`;
      } else if (this.adventurePath) {
        // Create in adventure's Scenes folder
        const adventureFolder = this.adventurePath.replace(".md", "");
        trapPath = `${adventureFolder}/Scenes/${this.trapName}.md`;
        
        // Ensure Scenes folder exists
        const scenesFolder = `${adventureFolder}/Scenes`;
        if (!(await this.app.vault.adapter.exists(scenesFolder))) {
          await this.app.vault.createFolder(scenesFolder);
        }
      } else {
        // Create in current folder
        trapPath = `${this.trapName}.md`;
      }

      // Check if file already exists
      if (await this.app.vault.adapter.exists(trapPath)) {
        new Notice(`A trap named "${this.trapName}" already exists!`);
        return;
      }

      // Create trap content
      const trapContent = this.createTrapContent(campaignName, worldName);

      // Create the file
      await this.app.vault.create(trapPath, trapContent);

      new Notice(`Trap "${this.trapName}" created!`);
      this.close();

      // Open the new trap file
      const trapFile = this.app.vault.getAbstractFileByPath(trapPath);
      if (trapFile instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(trapFile);
      }
    } catch (error) {
      console.error("Error creating trap:", error);
      new Notice("Failed to create trap. Check console for details.");
    }
  }

  createTrapContent(campaignName: string, worldName: string): string {
    const now = new Date().toISOString().split('T')[0];
    
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
template_version: 1.0.0
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

## Trap Details

**Type:** ${this.trapType.charAt(0).toUpperCase() + this.trapType.slice(1)} Trap  
**Threat Level:** ${this.threatLevel.charAt(0).toUpperCase() + this.threatLevel.slice(1)}  
**Level Range:** ${this.minLevel}-${this.maxLevel}

### Trigger Condition
${this.trigger || "Not specified"}

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
        dv.paragraph(\`**Attack:** +\${element.attack_bonus} to hit\`);
      }
      if (element.save_dc !== undefined) {
        dv.paragraph(\`**Save:** DC \${element.save_dc} \${element.save_ability || "DEX"}\`);
      }
      if (element.damage) {
        dv.paragraph(\`**Damage:** \${element.damage}\`);
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
            dv.paragraph(\`  Attack: +\${element.attack_bonus} to hit\`);
          }
          if (element.save_dc !== undefined) {
            dv.paragraph(\`  Save: DC \${element.save_dc} \${element.save_ability || "DEX"}\`);
          }
          if (element.damage) {
            dv.paragraph(\`  Damage: \${element.damage}\`);
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