import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

export class ItemCreationModal extends Modal {
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
        await this.app.workspace.openLinkText(itemPath, "", false);
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
    content += `\`\`\`dnd-hub\n\`\`\`\n\n`;

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