import { App, Modal, Notice, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

export class DndHubModal extends Modal {
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

    // Check if any campaigns exist
    const campaigns = this.plugin.getAllCampaigns();
    const hasCampaigns = campaigns.length > 0;

    // Quick Actions Section
    contentEl.createEl("h2", { text: "Quick Actions" });

    const quickActionsContainer = contentEl.createDiv({ cls: "dnd-hub-quick-actions" });

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
