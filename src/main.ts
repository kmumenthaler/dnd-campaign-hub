import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, requestUrl } from "obsidian";
import {
  WORLD_TEMPLATE,
  SESSION_GM_TEMPLATE,
  SESSION_PLAYER_TEMPLATE,
  NPC_TEMPLATE,
  PC_TEMPLATE,
  ADVENTURE_TEMPLATE,
  SCENE_TEMPLATE,
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
      .replace(/{{ENCOUNTER_CREATURES}}/g, "[]");

    await this.app.vault.create(filePath, sceneContent);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class SceneCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  adventurePath = "";
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
  creatures: Array<{
    name: string;
    count: number;
    hp?: number;
    ac?: number;
    cr?: string;
    source?: string;
  }> = [];
  
  // UI state
  encounterSection: HTMLElement | null = null;
  creatureListContainer: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string) {
    super(app);
    this.plugin = plugin;
    if (adventurePath) {
      this.adventurePath = adventurePath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🎬 Create New Scene" });

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

    // Create button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Create Scene")
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

      await this.createSceneNote(scenePath, sceneData, campaignName, worldName, adventureFile.basename, currentDate);

      // Create Initiative Tracker encounter if requested
      if (this.createEncounter && this.creatures.length > 0) {
        await this.createInitiativeTrackerEncounter(scenePath);
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
    currentDate: string
  ) {
    // Prepare encounter data for frontmatter
    const trackerEncounter = this.encounterName || "";
    const encounterCreaturesJson = this.creatures.length > 0 
      ? JSON.stringify(this.creatures) 
      : "[]";
    
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
      .replace(/{{ENCOUNTER_CREATURES}}/g, encounterCreaturesJson);

    await this.app.vault.create(filePath, sceneContent);
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
        .setDesc("Automatically add the campaign's party to this encounter")
        .addToggle(toggle => toggle
          .setValue(this.includeParty)
          .onChange(value => {
            this.includeParty = value;
          }));
      
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
    const vaultCreatures = await this.loadAllCreatures();
    
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
            source: "vault"
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
    
    // Info text
    builderContainer.createEl("p", {
      text: "💡 Tip: Select creatures from your vault or add custom enemies on the fly. You can edit stats later in Initiative Tracker.",
      cls: "setting-item-description"
    });
  }

  /**
   * Add a creature to the encounter
   */
  addCreature(creature: { name: string; count: number; hp?: number; ac?: number; cr?: string; source?: string }) {
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
    const creatures: Array<{ name: string; path: string; hp: number; ac: number; cr?: string }> = [];
    
    try {
      const statblocksPlugin = (this.app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
      if (!statblocksPlugin || !statblocksPlugin.api) {
        console.log("5e Statblocks plugin or API not found");
        return creatures;
      }
      
      // Use the API's getBestiaryCreatures() method to get all creatures
      const bestiaryCreatures = statblocksPlugin.api.getBestiaryCreatures();
      
      if (!Array.isArray(bestiaryCreatures)) {
        console.log("getBestiaryCreatures() did not return an array");
        return creatures;
      }
      
      console.log(`Loading ${bestiaryCreatures.length} creatures from 5e Statblocks plugin`);
      
      for (const monster of bestiaryCreatures) {
        if (!monster || typeof monster !== 'object') continue;
        
        creatures.push({
          name: monster.name || "Unknown",
          path: monster.path || "[SRD]",
          hp: monster.hp || 1,
          ac: typeof monster.ac === 'number' ? monster.ac : (parseInt(monster.ac) || 10),
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

  /**
   * Create encounter in Initiative Tracker and link to scene
   */
  async createInitiativeTrackerEncounter(scenePath: string) {
    if (!this.createEncounter || this.creatures.length === 0) return;
    
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
          let creatureName = c.name;
          let displayName = "";
          
          if (this.useColorNames && c.count > 1) {
            const colorIndex = i % colors.length;
            // Make the name itself unique to prevent auto-numbering
            creatureName = `${c.name} (${colors[colorIndex]})`;
            // Display name same as name for consistency
            displayName = creatureName;
          }
          
          const creature = {
            name: creatureName,  // Unique name with color to prevent auto-numbering
            display: displayName,  // Display name (empty for default, or colored name)
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

  /**
   * Get party members for the current campaign
   */
  async getCampaignPartyMembers(initiativePlugin: any): Promise<any[]> {
    try {
      // Get campaign name from adventure path
      const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
      if (!(adventureFile instanceof TFile)) return [];
      
      const adventureContent = await this.app.vault.read(adventureFile);
      const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
      const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');
      
      // Find the campaign's party
      const partyName = `${campaignName} Party`;
      const party = initiativePlugin.data.parties?.find((p: any) => p.name === partyName);
      
      if (!party || !party.players || party.players.length === 0) {
        console.log(`No party found for campaign "${campaignName}"`);
        return [];
      }
      
      // Get all player data for party members
      const partyMembers: any[] = [];
      for (const playerId of party.players) {
        const player = initiativePlugin.data.players?.find((p: any) => p.id === playerId);
        if (player) {
          // Clone the player data to avoid modifying the original
          partyMembers.push({
            ...player,
            initiative: 0,  // Reset initiative for new encounter
            active: false,
            enabled: true
          });
        }
      }
      
      console.log(`Found ${partyMembers.length} party members for "${campaignName}"`);
      return partyMembers;
    } catch (error) {
      console.error("Error fetching party members:", error);
      return [];
    }
  }

  /**
   * Link encounter to scene by updating tracker_encounter frontmatter field
   */
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