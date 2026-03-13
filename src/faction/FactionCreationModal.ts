import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { FACTION_TEMPLATE } from '../templates';
import { TEMPLATE_VERSIONS } from "../migration";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";

export class FactionCreationModal extends Modal {
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
    this.campaign = plugin.resolveCampaign();
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
      const currentDate = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
      const factionTemplateVersion = TEMPLATE_VERSIONS.faction || "1.1.0";

      factionContent = updateYamlFrontmatter(factionContent, (fm) => ({
        ...fm,
        type: "faction",
        template_version: factionTemplateVersion,
        name: this.factionName,
        campaign: campaignName,
        world: worldName,
        main_goal: this.mainGoal,
        pursuit_method: this.pursuitMethod,
        leader: this.leader,
        size: this.size,
        resources: this.resources,
        reputation: this.reputation,
        territories: this.territories,
        allies: this.allies,
        enemies: this.enemies,
        active_problem: this.activeProblem,
        date: currentDate,
      }));
      
      // Replace the title and template references
      factionContent = factionContent
        .replace(/{{name}}/g, this.factionName)
        .replace(/{{main_goal}}/g, this.mainGoal)
        .replace(/{{pursuit_method}}/g, this.pursuitMethod)
        .replace(/{{leader}}/g, this.leader || "_No leader specified_")
        .replace(/{{active_problem}}/g, this.activeProblem)
        .replace(/{{resources}}/g, this.resources)
        .replace(/{{reputation}}/g, this.reputation)
        .replace(/{{territories}}/g, this.territories)
        .replace(/{{allies}}/g, this.allies)
        .replace(/{{enemies}}/g, this.enemies)
        .replace(/{{size}}/g, this.size);

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