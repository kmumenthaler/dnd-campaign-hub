import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PDFFileSuggest, PDFBrowserModal } from "../utils/PDFBrowser";
import { MarkerDefinition } from '../marker/MarkerTypes';
import { NPC_TEMPLATE } from '../templates';

export class NPCCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  npcName = "";
  campaign = "";
  motivation = "";
  pursuit = "";
  physicalDetail = "";
  speechPattern = "";
  activeProblem = "";

  // For editing existing NPCs
  isEdit = false;
  originalNPCPath = "";
  originalNPCName = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, npcPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
    if (npcPath) {
      this.isEdit = true;
      this.originalNPCPath = npcPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Load existing NPC data if editing
    if (this.isEdit) {
      await this.loadNPCData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit NPC" : "👤 Create New NPC" });

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
          .setValue(this.npcName)
          .onChange((value) => {
            this.npcName = value;
          });
        if (!this.isEdit) text.inputEl.focus();
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
          .setValue(this.motivation)
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
          .setValue(this.pursuit)
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
          .setValue(this.physicalDetail)
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
          .setValue(this.speechPattern)
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
          .setValue(this.activeProblem)
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
      text: this.isEdit ? "Update NPC" : "Create NPC",
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

  async loadNPCData() {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.originalNPCPath) as TFile;
      if (!file) {
        new Notice("NPC file not found!");
        return;
      }

      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      
      if (cache?.frontmatter) {
        const fm = cache.frontmatter;
        this.npcName = fm.name || file.basename;
        this.originalNPCName = this.npcName;
        this.campaign = fm.campaign ? `ttrpgs/${fm.campaign}` : this.campaign;
        this.motivation = fm.motivation || "";
        this.pursuit = fm.pursuit || "";
        this.physicalDetail = fm.physical_detail || "";
        this.speechPattern = fm.speech_pattern || "";
        this.activeProblem = fm.active_problem || "";
      }

    } catch (error) {
      console.error("Error loading NPC data:", error);
      new Notice("Error loading NPC data. Check console for details.");
    }
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
    
    new Notice(this.isEdit ? `Updating NPC "${this.npcName}"...` : `Creating NPC "${this.npcName}"...`);

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

      let tokenId: string;
      let npcFile: TFile | null = null;
      let filePath: string;

      if (this.isEdit) {
        // Editing existing NPC
        npcFile = this.app.vault.getAbstractFileByPath(this.originalNPCPath) as TFile;
        if (!npcFile) {
          new Notice("Original NPC file not found!");
          return;
        }
        
        // Get existing token ID from frontmatter
        const cache = this.app.metadataCache.getFileCache(npcFile);
        tokenId = cache?.frontmatter?.token_id || this.plugin.markerLibrary.generateId();
        
        filePath = this.originalNPCPath;

        // If NPC name changed, rename the file
        if (this.npcName !== this.originalNPCName) {
          const folder = filePath.substring(0, filePath.lastIndexOf('/'));
          const newPath = `${folder}/${this.npcName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`An NPC named "${this.npcName}" already exists!`);
            return;
          }
          
          await this.app.fileManager.renameFile(npcFile, newPath);
          filePath = newPath;
          npcFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        }
        
        // Update the map token, preserving existing fields (imageFile, darkvision, etc.)
        const now = Date.now();
        const existingMarker = this.plugin.markerLibrary.getMarker(tokenId);
        const tokenDef: MarkerDefinition = {
          ...(existingMarker || {}),
          id: tokenId,
          name: this.npcName,
          type: 'npc',
          icon: existingMarker?.icon || '👤',
          backgroundColor: existingMarker?.backgroundColor || '#6b8e23',
          borderColor: existingMarker?.borderColor || '#ffffff',
          creatureSize: existingMarker?.creatureSize || 'medium',
          campaign: campaignName,
          createdAt: existingMarker?.createdAt || now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);
      } else {
        // Creating new NPC
        filePath = `${npcPath}/${this.npcName}.md`;

        // Check if NPC already exists BEFORE creating token
        if (await this.app.vault.adapter.exists(filePath)) {
          new Notice(`An NPC named "${this.npcName}" already exists!`);
          return;
        }

        // Create a map token for this NPC
        const now = Date.now();
        tokenId = this.plugin.markerLibrary.generateId();
        const tokenDef: MarkerDefinition = {
          id: tokenId,
          name: this.npcName,
          type: 'npc',
          icon: '👤',
          backgroundColor: '#6b8e23',  // Olive green for NPCs
          borderColor: '#ffffff',
          creatureSize: 'medium',
          campaign: campaignName,
          createdAt: now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);
      }

      // Get NPC content - use existing file content when editing, template for new NPCs
      let npcContent: string;

      if (this.isEdit && npcFile) {
        // Preserve existing content when editing
        npcContent = await this.app.vault.read(npcFile);
      } else {
        // Always use the bundled template (guaranteed to have latest buttons/features)
        npcContent = NPC_TEMPLATE;
      }

      // Get current date
      const currentDate = new Date().toISOString().split('T')[0];

      // Replace placeholders in template - both frontmatter and content
      npcContent = npcContent
        .replace(/name: $/m, `name: ${this.npcName}`)
        .replace(/world: $/m, `world: ${worldName}`)
        .replace(/campaign: $/m, `campaign: ${campaignName}`)
        .replace(/date: $/m, `date: ${currentDate}\ntoken_id: ${tokenId}`)
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

      // Create or update the file
      if (this.isEdit && npcFile) {
        await this.app.vault.modify(npcFile, npcContent);
        new Notice(`✅ NPC "${this.npcName}" updated successfully!`);
      } else {
        await this.app.vault.create(filePath, npcContent);
        new Notice(`✅ NPC "${this.npcName}" created successfully!`);
        npcFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;
      }

      // Open the file
      if (npcFile) {
        await this.app.workspace.openLinkText(filePath, "", false);
      }
    } catch (error) {
      new Notice(`❌ Error ${this.isEdit ? 'updating' : 'creating'} NPC: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`NPC ${this.isEdit ? 'update' : 'creation'} error:`, error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
