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

export default class DndCampaignHubPlugin extends Plugin {
  settings!: DndCampaignHubSettings;

  async onload() {
    await this.loadSettings();

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
      name: "Update D&D Hub Templates",
      callback: () => {
        if (!this.isVaultInitialized()) {
          new Notice("Initialize D&D Campaign Hub before updating templates.");
          return;
        }
        this.updateTemplates();
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
				new Notice(`D&D Campaign Hub updated to v${currentVersion}! Use "Update D&D Hub Templates" to get the latest templates.`, 8000);
			}
			
			// Update saved version
			this.settings.pluginVersion = currentVersion;
			await this.saveSettings();
		}
	}

	/**
	 * Update template files without affecting user data
	 */
	async updateTemplates() {
		// Show confirmation modal first
		new UpdateConfirmModal(this.app, this).open();
	}

	/**
	 * Actually perform the template update after user confirmation
	 */
	async performTemplateUpdate() {
		new Notice("Updating D&D Hub templates...");

		try {
			// Create backup of existing campaign files
			await this.backupCampaignFiles();
			
			// Update template files in z_Templates
			await this.createTemplateFiles();
			
			// Update existing campaign files based on their templates
			await this.updateExistingCampaignFiles();
			
			new Notice("✅ Templates updated successfully! Backups saved in z_Backups folder.");
		} catch (error) {
			console.error("Failed to update templates:", error);
			new Notice("❌ Failed to update templates. Check console for details.");
		}
	}

	/**
	 * Create backups of all template-based campaign files before updating
	 */
	async backupCampaignFiles() {
		const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
		const backupFolder = `z_Backups/${timestamp}`;
		
		// Ensure backup folder exists
		try {
			await this.app.vault.createFolder(backupFolder);
		} catch (error) {
			// Folder might exist
		}

		// Find all markdown files in ttrpgs folder (campaigns)
		const campaignFiles = this.app.vault.getMarkdownFiles().filter(file => 
			file.path.startsWith("ttrpgs/")
		);

		for (const file of campaignFiles) {
			try {
				const content = await this.app.vault.read(file);
				const backupPath = file.path.replace(/\//g, '_').replace('ttrpgs_', '');
				const backupFileName = `${backupFolder}/${backupPath}`;
				
				await this.app.vault.create(backupFileName, content);
			} catch (error) {
				console.error(`Failed to backup ${file.path}:`, error);
			}
		}
	}

	/**
	 * Update existing campaign files with new template content while preserving user data
	 */
	async updateExistingCampaignFiles() {
		const campaignFiles = this.app.vault.getMarkdownFiles().filter(file => 
			file.path.startsWith("ttrpgs/")
		);

		for (const file of campaignFiles) {
			try {
				const content = await this.app.vault.read(file);
				
				// Determine file type from frontmatter
				const typeMatch = content.match(/^---\n[\s\S]*?type:\s*(.+?)\n[\s\S]*?---/);
				if (!typeMatch || !typeMatch[1]) continue;
				
				const fileType = typeMatch[1].trim();
				
				// Update based on file type
				switch (fileType) {
					case 'world':
						await this.updateWorldFile(file, content);
						break;
					case 'npc':
						await this.updateNpcFile(file, content);
						break;
					case 'player':
						await this.updatePcFile(file, content);
						break;
					case 'adventure':
						await this.updateAdventureFile(file, content);
						break;
					case 'session':
					case 'session-gm':
					case 'session-player':
						await this.updateSessionFile(file, content);
						break;
					case 'faction':
						await this.updateFactionFile(file, content);
						break;
					case 'item':
						await this.updateItemFile(file, content);
						break;
					case 'spell':
						await this.updateSpellFile(file, content);
						break;
				}
			} catch (error) {
				console.error(`Failed to update ${file.path}:`, error);
			}
		}
	}

	/**
	 * Update a World.md file
	 */
	async updateWorldFile(file: TFile, content: string) {
		// Extract frontmatter
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
		if (!frontmatterMatch) return;
		
		const frontmatter = frontmatterMatch[0];
		
		// Extract user content from "Truths about the campaign/world" section
		const truthsMatch = content.match(/## Truths about the campaign\/world\n\n\*[^*]+\*\n\n([\s\S]*?)(?=\n## |\n*$)/);
		const userTruths = (truthsMatch && truthsMatch[1]) ? truthsMatch[1].trim() : "-";
		
		// Get campaign name from path
		const campaignName = file.path.split('/')[1] || '';
		
		// Build new content with preserved user data
		let newContent = WORLD_TEMPLATE.replace(/{{CAMPAIGN_NAME}}/g, campaignName);
		
		// Replace the frontmatter with the user's existing frontmatter
		newContent = newContent.replace(/^---\n[\s\S]*?\n---\n/, frontmatter);
		
		// Replace the truths section with user content
		newContent = newContent.replace(
			/(## Truths about the campaign\/world\n\n\*[^*]+\*\n\n)- /,
			`$1${userTruths}\n`
		);
		
		// Update the file
		await this.app.vault.modify(file, newContent);
	}

	/**
	 * Update template-based files (NPC, PC, Adventure, etc.) by preserving frontmatter
	 */
	async updateTemplateBasedFile(file: TFile, content: string, template: string) {
		// Extract frontmatter
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
		if (!frontmatterMatch) return;
		
		const frontmatter = frontmatterMatch[0];
		
		// Replace frontmatter in template with user's frontmatter
		let newContent = template.replace(/^---\n[\s\S]*?\n---\n/, frontmatter);
		
		// Update the file
		await this.app.vault.modify(file, newContent);
	}

	async updateNpcFile(file: TFile, content: string) {
		await this.updateTemplateBasedFile(file, content, NPC_TEMPLATE);
	}

	async updatePcFile(file: TFile, content: string) {
		await this.updateTemplateBasedFile(file, content, PC_TEMPLATE);
	}

	async updateAdventureFile(file: TFile, content: string) {
		await this.updateTemplateBasedFile(file, content, ADVENTURE_TEMPLATE);
	}

	async updateSessionFile(file: TFile, content: string) {
		// Determine if it's GM or Player session
		const roleMatch = content.match(/role:\s*(.+)/);
		const role = (roleMatch && roleMatch[1]) ? roleMatch[1].trim() : 'gm';
		
		const template = role === 'player' ? SESSION_PLAYER_TEMPLATE : SESSION_GM_TEMPLATE;
		await this.updateTemplateBasedFile(file, content, template);
	}

	async updateFactionFile(file: TFile, content: string) {
		await this.updateTemplateBasedFile(file, content, FACTION_TEMPLATE);
	}

	async updateItemFile(file: TFile, content: string) {
		await this.updateTemplateBasedFile(file, content, ITEM_TEMPLATE);
	}

	async updateSpellFile(file: TFile, content: string) {
		await this.updateTemplateBasedFile(file, content, SPELL_TEMPLATE);
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

    new Notice("Required plugins installed! Reloading...");

    // Reload Obsidian to activate plugins
    setTimeout(() => {
      (this.app as any).commands.executeCommandById('app:reload');
    }, 1500);
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
      { id: "templater-obsidian", name: "Templater" }
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

		new Notice("Vault initialized successfully! Please reload Obsidian (Ctrl+R) to activate plugins.");
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
      .setName("Update Templates")
      .setDesc("Update all campaign templates to the latest version (with backup)")
      .addButton((button) =>
        button
          .setButtonText("Update Templates")
          .setCta()
          .onClick(async () => {
            this.plugin.updateTemplates();
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
      { id: "templater-obsidian", name: "Templater", url: "obsidian://show-plugin?id=templater-obsidian" }
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

class UpdateConfirmModal extends Modal {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🔄 Update D&D Hub Templates" });

    contentEl.createEl("p", {
      text: "This will update all template files and existing campaign World.md files with the latest version."
    });

    contentEl.createEl("h3", { text: "What will be updated:" });
    const updateList = contentEl.createEl("ul");
    updateList.createEl("li", { text: "Template files in z_Templates/" });
    updateList.createEl("li", { text: "All campaign World.md files (buttons, dataviews, structure)" });

    contentEl.createEl("h3", { text: "What will be preserved:" });
    const preserveList = contentEl.createEl("ul");
    preserveList.createEl("li", { text: "✅ Campaign frontmatter (name, dates, calendar settings)" });
    preserveList.createEl("li", { text: "✅ User-written content in 'Truths about the campaign/world'" });
    preserveList.createEl("li", { text: "✅ All NPCs, PCs, sessions, and other campaign files" });

    contentEl.createEl("h3", { text: "⚠️ Important:" });
    const warningList = contentEl.createEl("ul", { cls: "mod-warning" });
    warningList.createEl("li", { text: "Automatic backups will be created in z_Backups/" });
    warningList.createEl("li", { text: "Template updates may require manual cleanup if you heavily customized your files" });
    warningList.createEl("li", { text: "Review the updated files after the process completes" });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: "Update Templates",
      cls: "mod-cta"
    });
    confirmBtn.addEventListener("click", async () => {
      this.close();
      await this.plugin.performTemplateUpdate();
    });
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
      this.showInitializationUI(contentEl);
      return;
    }

        // Quick Actions Section
        contentEl.createEl("h2", { text: "Quick Actions" });

        const quickActionsContainer = contentEl.createDiv({ cls: "dnd-hub-quick-actions" });

        this.createActionButton(quickActionsContainer, "🎲 New Campaign", () => {
          this.close();
          this.plugin.createCampaign();
        });

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
    } catch (error) {
      new Notice(`❌ Error creating PC: ${error instanceof Error ? error.message : String(error)}`);
      console.error("PC creation error:", error);
    }
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

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.sessionDate = new Date().toISOString().split('T')[0] || "";
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
      const currentDate = new Date().toISOString().split('T')[0];

      // Create main adventure note
      await this.createMainAdventureNote(mainNotePath, campaignName || "Unknown", worldName || campaignName || "Unknown", currentDate);

      // Create scene notes
      await this.createSceneNotes(scenesBasePath, campaignName || "Unknown", worldName || campaignName || "Unknown", currentDate);

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
      .replace(/{{SCENE_TYPE}}/g, scene.type)
      .replace(/{{DIFFICULTY}}/g, scene.difficulty)
      .replace(/{{CAMPAIGN_NAME}}/g, campaignName)
      .replace(/{{WORLD_NAME}}/g, worldName)
      .replace(/{{DATE}}/g, currentDate);

    await this.app.vault.create(filePath, sceneContent);
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