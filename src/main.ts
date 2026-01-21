import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, requestUrl } from "obsidian";
import {
  WORLD_TEMPLATE,
  SESSION_GM_TEMPLATE,
  SESSION_PLAYER_TEMPLATE,
  NPC_TEMPLATE,
  PC_TEMPLATE,
  ADVENTURE_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  SPELL_TEMPLATE,
  CAMPAIGN_TEMPLATE,
  SESSION_DEFAULT_TEMPLATE
} from "./templates";

interface DndCampaignHubSettings {
  vaultPath: string;
  currentCampaign: string;
  hotkey: string;
  pluginVersion: string;
  defaultTemplates: {
    campaign: string;
    npc: string;
    pc: string;
    adventure: string;
    item: string;
    spell: string;
    faction: string;
    session: string;
  };
}

const DEFAULT_SETTINGS: DndCampaignHubSettings = {
  vaultPath: "",
  currentCampaign: "ttrpgs/Frozen Sick (SOLINA)",
  hotkey: "Ctrl+Shift+M",
  pluginVersion: "0.0.0",
  defaultTemplates: {
    campaign: "",
    npc: "",
    pc: "",
    adventure: "",
    item: "",
    spell: "",
    faction: "",
    session: "",
  },
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
				if (!typeMatch) continue;
				
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
		const userTruths = truthsMatch ? truthsMatch[1].trim() : "-";
		
		// Get campaign name from path
		const campaignName = file.path.split('/')[1];
		
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
		const role = roleMatch ? roleMatch[1].trim() : 'gm';
		
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
    await adapter.writeBinary(`${pluginPath}/main.js`, mainJsArray);

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
      { id: "calendarium", name: "Calendarium" }
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
		const npcName = await this.promptForName("NPC");
		if (!npcName) return;

		const npcPath = `${this.settings.currentCampaign}/NPCs/${npcName}`;
		await this.ensureFolderExists(npcPath);

		const template = this.settings.defaultTemplates.npc || this.getDefaultNpcTemplate();
		const filePath = `${npcPath}/${npcName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`NPC "${npcName}" created!`);
	}

	async createPc() {
		const pcName = await this.promptForName("Player Character");
		if (!pcName) return;

		const pcPath = `${this.settings.currentCampaign}/PCs/${pcName}`;
		await this.ensureFolderExists(pcPath);

		const template = this.settings.defaultTemplates.pc || this.getDefaultPcTemplate();
		const filePath = `${pcPath}/${pcName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`Player Character "${pcName}" created!`);
	}

	async createAdventure() {
		const adventureName = await this.promptForName("Adventure");
		if (!adventureName) return;

		const adventurePath = `${this.settings.currentCampaign}/Adventures/${adventureName}`;
		await this.ensureFolderExists(adventurePath);

		const template = this.settings.defaultTemplates.adventure || this.getDefaultAdventureTemplate();
		const filePath = `${adventurePath}/${adventureName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`Adventure "${adventureName}" created!`);
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

		const template = this.settings.defaultTemplates.item || this.getDefaultItemTemplate();
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

		const template = this.settings.defaultTemplates.spell || this.getDefaultSpellTemplate();
		const filePath = `${spellPath}/${spellName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`Spell "${spellName}" created!`);
	}

	async createFaction() {
		const factionName = await this.promptForName("Faction");
		if (!factionName) return;

		const factionPath = `${this.settings.currentCampaign}/Factions/${factionName}`;
		await this.ensureFolderExists(factionPath);

		const template = this.settings.defaultTemplates.faction || this.getDefaultFactionTemplate();
		const filePath = `${factionPath}/${factionName}.md`;

		await this.app.vault.create(filePath, template);
		await this.app.workspace.openLinkText(filePath, "", true);
		new Notice(`Faction "${factionName}" created!`);
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

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("D&D Vault Path")
      .setDesc("Path to your D&D vault (relative to Obsidian vault root)")
      .addText((text) =>
        text
          .setPlaceholder("My Vault")
          .setValue(this.plugin.settings.vaultPath)
          .onChange(async (value) => {
            this.plugin.settings.vaultPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Current Campaign")
      .setDesc("Path to the current active campaign (relative to vault root)")
      .addText((text) =>
        text
          .setPlaceholder("ttrpgs/Campaign Name")
          .setValue(this.plugin.settings.currentCampaign)
          .onChange(async (value) => {
            this.plugin.settings.currentCampaign = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Hotkey")
      .setDesc("Hotkey to open the D&D Hub (currently Ctrl+Shift+M)")
      .addText((text) =>
        text
          .setPlaceholder("Ctrl+Shift+M")
          .setValue(this.plugin.settings.hotkey)
          .onChange(async (value) => {
            this.plugin.settings.hotkey = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Default Templates" });

    new Setting(containerEl)
      .setName("Campaign Template")
      .setDesc("Default template for new campaigns")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter campaign template...")
          .setValue(this.plugin.settings.defaultTemplates.campaign)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.campaign = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("NPC Template")
      .setDesc("Default template for new NPCs")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter NPC template...")
          .setValue(this.plugin.settings.defaultTemplates.npc)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.npc = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("PC Template")
      .setDesc("Default template for new player characters")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter PC template...")
          .setValue(this.plugin.settings.defaultTemplates.pc)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.pc = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Adventure Template")
      .setDesc("Default template for new adventures")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter adventure template...")
          .setValue(this.plugin.settings.defaultTemplates.adventure)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.adventure = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Session Template")
      .setDesc("Default template for new sessions")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter session template...")
          .setValue(this.plugin.settings.defaultTemplates.session)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.session = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Item Template")
      .setDesc("Default template for new items")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter item template...")
          .setValue(this.plugin.settings.defaultTemplates.item)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.item = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Spell Template")
      .setDesc("Default template for new spells")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter spell template...")
          .setValue(this.plugin.settings.defaultTemplates.spell)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.spell = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Faction Template")
      .setDesc("Default template for new factions")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter faction template...")
          .setValue(this.plugin.settings.defaultTemplates.faction)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplates.faction = value;
            await this.plugin.saveSettings();
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

    this.createActionButton(quickActionsContainer, "📜 New Session", () => {
      this.close();
      this.plugin.createSession();
    });

    contentEl.createEl("p", {
      text: "NPCs, PCs, adventures, and more builders are coming soon.",
      cls: "dnd-hub-info",
    });
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
      const calendarMatch = worldContent.match(/fc-calendar:\s*(.+)/);
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
        const yearMatch = worldContent.match(/fc-date:\s*\n\s*year:\s*(.+)/);
        const monthMatch = worldContent.match(/fc-date:\s*\n\s*year:.*\n\s*month:\s*(.+)/);
        const dayMatch = worldContent.match(/fc-date:\s*\n\s*year:.*\n\s*month:.*\n\s*day:\s*(.+)/);
        
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

      // Replace placeholders in template
      sessionContent = sessionContent
        .replace(/campaign: $/m, `campaign: ${campaignName}`)
        .replace(/world: $/m, `world: ${campaignName}`)
        .replace(/sessionNum: $/m, `sessionNum: ${nextNumber}`)
        .replace(/location: $/m, `location: ${this.location}`)
        .replace(/date: $/m, `date: ${this.sessionDate}`)
        .replace(/fc-calendar: $/m, `fc-calendar: ${this.calendar}`)
        .replace(/# Session\s*$/m, `# Session ${nextNumber}${this.sessionTitle ? ' - ' + this.sessionTitle : ''}`);

      // Replace fc-date (start date) - need to match the nested structure
      sessionContent = sessionContent
        .replace(/fc-date:\s*\n\s*year:\s*$/m, `fc-date:\n  year: ${this.startYear}`)
        .replace(/(fc-date:\s*\n\s*year:.*\n\s*)month:\s*$/m, `$1month: ${this.startMonth}`)
        .replace(/(fc-date:\s*\n\s*year:.*\n\s*month:.*\n\s*)day:\s*$/m, `$1day: ${this.startDay}`);

      // Replace fc-end (end date) - need to match the nested structure
      sessionContent = sessionContent
        .replace(/fc-end:\s*\n\s*year:\s*$/m, `fc-end:\n  year: ${this.endYear}`)
        .replace(/(fc-end:\s*\n\s*year:.*\n\s*)month:\s*$/m, `$1month: ${this.endMonth}`)
        .replace(/(fc-end:\s*\n\s*year:.*\n\s*month:.*\n\s*)day:\s*$/m, `$1day: ${this.endDay}`);
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
    
    // Use a small delay to ensure settings are open
    setTimeout(() => {
      // Try to execute the command
      (this.app as any).commands?.executeCommandById(commandId);
    }, 100);

    new Notice("After creating your calendar, use 'Create Campaign' again to select it.");
  }

  dayDropdown: any = null;

  getAvailableCalendars(): Array<{id: string, name: string}> {
    // Try to get calendars from Calendarium plugin
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (calendariumPlugin && calendariumPlugin.data?.calendars) {
      const calendars = calendariumPlugin.data.calendars;
      return Object.keys(calendars).map(id => ({
        id: id,
        name: calendars[id].name || id
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
      // Create campaign folder structure
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

      // Create World.md from template
      const worldTemplate = this.app.vault.getAbstractFileByPath("z_Templates/world.md");
      let worldContent: string;

      if (worldTemplate instanceof TFile) {
        worldContent = await this.app.vault.read(worldTemplate);
      } else {
        worldContent = WORLD_TEMPLATE;
      }

      // Replace placeholders with actual data
      worldContent = worldContent
        .replace(/world: $/m, `world: ${campaignName}`)
        .replace(/campaign: $/m, `campaign: ${campaignName}`)
        .replace(/role: player$/m, `role: ${this.role}`)
        .replace(/system:$/m, `system: ${this.system}`)
        .replace(/fc-calendar: $/m, `fc-calendar: ${this.calendarName}`)
        .replace(/fc-date:\s*\n\s*year:\s*$/m, `fc-date:\n  year: ${this.startYear}`)
        .replace(/(fc-date:\s*\n\s*year:.*\n\s*)month:\s*$/m, `$1month: ${this.startMonth}`)
        .replace(/(fc-date:\s*\n\s*year:.*\n\s*month:.*\n\s*)day:\s*$/m, `$1day: ${this.startDay}`)
        .replace(/# The World of Your Campaign/g, `# The World of ${campaignName}`)
        .replace(/{{CAMPAIGN_NAME}}/g, campaignName);

      const worldFilePath = `${campaignPath}/World.md`;
      await this.app.vault.create(worldFilePath, worldContent);

      // Create initial House Rules file if GM
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

      // Update current campaign setting
      this.plugin.settings.currentCampaign = campaignPath;
      await this.plugin.saveSettings();

      // Open World.md
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
