import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { ADVENTURE_TEMPLATE } from "../templates";

export class AdventureCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  adventureName = "";
  campaign = "";
  theProblem = "";
  levelFrom = "1";
  levelTo = "3";
  expectedSessions = "3";
  isGM = false;
  
  // Edit mode
  isEdit = false;
  originalPath = "";
  originalStatus = "planning";

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.resolveCampaign();
    if (adventurePath) {
      this.isEdit = true;
      this.originalPath = adventurePath;
    }
  }

  async loadAdventureData() {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.originalPath);
      if (!(file instanceof TFile)) {
        new Notice("Adventure file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read adventure data!");
        return;
      }

      this.adventureName = frontmatter.name || file.basename;
      this.theProblem = "";
      this.originalStatus = frontmatter.status || "planning";
      
      // Parse level range
      const levelRange = frontmatter.level_range || "1-3";
      const parts = String(levelRange).split("-");
      this.levelFrom = parts[0] || "1";
      this.levelTo = parts[1] || "3";
      
      this.expectedSessions = String(frontmatter.expected_sessions || "3");

      // Resolve campaign path
      const campaignName = frontmatter.campaign || "";
      this.campaign = `ttrpgs/${campaignName}`;
      
      // Read body to get "The Problem" text
      const content = await this.app.vault.read(file);
      const problemMatch = content.match(/## The Problem\s*\n\n([\s\S]*?)(?=\n##|\n---|\n$)/);
      if (problemMatch && problemMatch[1]) {
        const text = problemMatch[1].trim();
        // Skip placeholder text
        if (!text.startsWith("_[")) {
          this.theProblem = text;
        }
      }
    } catch (error) {
      console.error("Error loading adventure data:", error);
      new Notice("Error loading adventure data");
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Load existing adventure data if editing
    if (this.isEdit) {
      await this.loadAdventureData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Adventure" : "🗺️ Create New Adventure" });

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
          .setValue(this.adventureName)
          .onChange((value) => {
            this.adventureName = value;
          });
        if (!this.isEdit) text.inputEl.focus();
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
          .setValue(this.theProblem)
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

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: this.isEdit ? "Save Changes" : "Create Adventure",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.adventureName.trim()) {
        new Notice("Please enter an adventure name!");
        return;
      }

      this.close();
      if (this.isEdit) {
        await this.updateAdventureFile();
      } else {
        await this.createAdventureFile();
      }
    });
  }

  async updateAdventureFile() {
    try {
      const originalFile = this.app.vault.getAbstractFileByPath(this.originalPath);
      if (!(originalFile instanceof TFile)) {
        new Notice("❌ Adventure file not found!");
        return;
      }

      new Notice(`Updating adventure "${this.adventureName}"...`);

      const existingContent = await this.app.vault.read(originalFile);
      const campaignName = this.campaign.split('/').pop() || "Unknown";

      // Get world name
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
      let worldName = campaignName;
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*([^\r\n]+)$/m);
        if (worldMatch && worldMatch[1]?.trim()) {
          worldName = worldMatch[1].trim();
        }
      }

      const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);

      // Build updated frontmatter preserving status and sessions
      const cache = this.app.metadataCache.getFileCache(originalFile);
      const existingFm = cache?.frontmatter;
      const sessionsArr: string[] = [];
      if (existingFm?.sessions) {
        const raw = existingFm.sessions;
        if (Array.isArray(raw)) {
          for (const entry of raw) sessionsArr.push(String(entry));
        } else {
          sessionsArr.push(String(raw));
        }
      }
      const sessions = sessionsArr.length > 0
        ? `[${sessionsArr.map(s => { const n = s.startsWith('[[') ? s : `[[${s}]]`; return `"${n}"`; }).join(', ')}]`
        : '[]';
      const currentAct = existingFm?.current_act || 1;

      const updatedFrontmatter = `---
type: adventure
name: ${this.adventureName}
campaign: ${campaignName}
world: ${worldName}
status: ${this.originalStatus}
level_range: ${this.levelFrom}-${this.levelTo}
current_act: ${currentAct}
expected_sessions: ${this.expectedSessions}
sessions: ${sessions}
date: ${currentDate}
---`;

      // Replace frontmatter
      let updatedContent = existingContent.replace(/^---\n[\s\S]*?\n---/, updatedFrontmatter);

      // Update title
      updatedContent = updatedContent.replace(
        /^# .+$/m,
        `# ${this.adventureName}`
      );

      // Update metadata line
      updatedContent = updatedContent.replace(
        /\*\*Level:\*\* .+? \| \*\*Current Act:\*\*/,
        `**Level:** ${this.levelFrom}-${this.levelTo} | **Current Act:**`
      );
      updatedContent = updatedContent.replace(
        /\*\*Expected Sessions:\*\* \S+/,
        `**Expected Sessions:** ${this.expectedSessions}`
      );

      // Update "The Problem" section
      const problemText = this.theProblem || "_[What urgent situation demands heroes?]_";
      updatedContent = updatedContent.replace(
        /## The Problem\s*\n\n[\s\S]*?(?=\n## )/,
        `## The Problem\n\n${problemText}\n\n`
      );

      // Handle rename if name changed
      const originalName = originalFile.basename;
      if (originalName !== this.adventureName) {
        const parentFolder = originalFile.parent;
        
        if (parentFolder && parentFolder.name === originalName) {
          // Folder structure: Adventures/OldName/OldName.md → rename folder then file
          const grandParentPath = parentFolder.parent?.path || "";
          const newFolderPath = `${grandParentPath}/${this.adventureName}`;
          
          // Update content first
          await this.app.vault.modify(originalFile, updatedContent);
          
          // Rename the parent folder (this moves everything inside)
          await this.app.fileManager.renameFile(parentFolder, newFolderPath);
          
          // Now rename the file inside the new folder
          const movedFile = this.app.vault.getAbstractFileByPath(`${newFolderPath}/${originalName}.md`);
          if (movedFile instanceof TFile) {
            await this.app.fileManager.renameFile(movedFile, `${newFolderPath}/${this.adventureName}.md`);
          }
        } else {
          // Flat structure
          const parentPath = parentFolder?.path || "";
          const newPath = `${parentPath}/${this.adventureName}.md`;
          await this.app.vault.modify(originalFile, updatedContent);
          await this.app.fileManager.renameFile(originalFile, newPath);
        }
      } else {
        await this.app.vault.modify(originalFile, updatedContent);
      }

      new Notice(`✅ Adventure "${this.adventureName}" updated!`);
    } catch (error) {
      new Notice(`❌ Error updating adventure: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Adventure update error:", error);
    }
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

      // Always use folder structure: Adventures/Adventure Name/Adventure Name.md
      // with a Scenes subfolder for all scene notes
      const adventureFolder = `${baseAdventurePath}/${this.adventureName}`;
      await this.plugin.ensureFolderExists(adventureFolder);
      const mainNotePath = `${adventureFolder}/${this.adventureName}.md`;
      const scenesFolder = `${adventureFolder}/Scenes`;
      await this.plugin.ensureFolderExists(scenesFolder);

      // Get current date
      const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);

      // Ensure worldName has a value for type safety
      const safeWorldName: string = worldName || campaignName || "Unknown";
      const safeCampaignName: string = campaignName || "Unknown";

      // Create main adventure note (no placeholder scenes)
      await this.createMainAdventureNote(mainNotePath, safeCampaignName, safeWorldName, currentDate);

      // Open the main adventure file
      await this.app.workspace.openLinkText(mainNotePath, "", true);

      new Notice(`✅ Adventure "${this.adventureName}" created!`);
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


  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
