import { App, Modal, Notice, Setting, TextComponent, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PDFFileSuggest, PDFBrowserModal } from "../utils/PDFBrowser";
import { MarkerDefinition } from '../marker/MarkerTypes';
import { PC_TEMPLATE } from '../templates';

export class PCCreationModal extends Modal {
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

  // For editing existing PCs
  isEdit = false;
  originalPCPath = "";
  originalPCName = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, pcPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
    if (pcPath) {
      this.isEdit = true;
      this.originalPCPath = pcPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Load existing PC data if editing
    if (this.isEdit) {
      await this.loadPCData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Player Character" : "🛡️ Create New Player Character" });

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

    // Character Sheet PDF with file browsing and suggestions
    let pdfTextComponent: TextComponent;
    const pdfSetting = new Setting(contentEl)
      .setName("Character Sheet PDF")
      .setDesc(this.characterSheetPdf ? `Selected: ${this.characterSheetPdf}` : 'Browse vault, import file, or type to search PDFs');

    pdfSetting.addButton(btn => btn
      .setButtonText('Browse Vault')
      .onClick(() => {
        // Get all PDF files from the vault
        const pdfFiles = this.app.vault.getFiles().filter(f => f.extension === 'pdf');
        
        if (pdfFiles.length === 0) {
          new Notice('No PDF files found in vault');
          return;
        }
        
        // Sort PDFs by path
        pdfFiles.sort((a, b) => a.path.localeCompare(b.path));
        
        new PDFBrowserModal(this.app, pdfFiles, (file: TFile) => {
          this.characterSheetPdf = file.path;
          pdfSetting.setDesc(`Selected: ${this.characterSheetPdf}`);
          pdfTextComponent?.setValue(file.path);
        }).open();
      })
    );

    pdfSetting.addButton(btn => btn
      .setButtonText('Import File')
      .onClick(() => {
        // Use hidden file input to pick from OS file system
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,application/pdf';
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          
          // Validate it's a PDF
          if (!file.name.toLowerCase().endsWith('.pdf')) {
            new Notice('Please select a PDF file');
            return;
          }
          
          try {
            const buffer = await file.arrayBuffer();
            // Ensure z_Assets folder exists
            const assetsFolder = this.app.vault.getAbstractFileByPath('z_Assets');
            if (!assetsFolder) {
              await this.app.vault.createFolder('z_Assets');
            }
            // Save to z_Assets with original filename
            const destPath = `z_Assets/${file.name}`;
            const existing = this.app.vault.getAbstractFileByPath(destPath);
            if (existing) {
              // File already exists, just use it
              this.characterSheetPdf = destPath;
            } else {
              await this.app.vault.createBinary(destPath, buffer);
              this.characterSheetPdf = destPath;
            }
            pdfSetting.setDesc(`Selected: ${this.characterSheetPdf}`);
            pdfTextComponent?.setValue(this.characterSheetPdf);
            new Notice(`PDF saved to ${destPath}`);
          } catch (err) {
            new Notice('Failed to import PDF');
            console.error('PDF import error:', err);
          }
        });
        input.click();
      })
    );

    pdfSetting.addText((text) => {
      pdfTextComponent = text;
      text
        .setPlaceholder("Type to search vault PDFs...")
        .setValue(this.characterSheetPdf)
        .onChange((value) => {
          this.characterSheetPdf = value;
          pdfSetting.setDesc(value ? `Selected: ${value}` : 'Browse vault, import file, or type to search PDFs');
        });
      
      // Enable file suggestions for PDFs
      new PDFFileSuggest(this.app, text.inputEl);
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: this.isEdit ? "Update PC" : "Create PC",
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

  async loadPCData() {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.originalPCPath) as TFile;
      if (!file) {
        new Notice("PC file not found!");
        return;
      }

      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      
      if (cache?.frontmatter) {
        const fm = cache.frontmatter;
        this.pcName = fm.name || file.basename;
        this.originalPCName = this.pcName;
        this.playerName = fm.player || "";
        this.campaign = fm.campaign ? `ttrpgs/${fm.campaign}` : this.campaign;
        
        // Parse class string (could be multiclass like "Fighter/Wizard")
        if (fm.class) {
          this.classes = fm.class.toString().split("/").map((c: string) => c.trim());
        }
        
        this.level = fm.level?.toString() || "1";
        this.hpCurrent = fm.hp?.toString() || "";
        this.hpMax = fm.hp_max?.toString() || "";
        this.ac = fm.ac?.toString() || "10";
        this.initBonus = fm.init_bonus?.toString() || "0";
        this.speed = fm.speed?.toString() || "30";
        this.characterSheetUrl = fm.readonlyUrl || "";
        this.characterSheetPdf = fm.characterSheetPdf || "";
      }

    } catch (error) {
      console.error("Error loading PC data:", error);
      new Notice("Error loading PC data. Check console for details.");
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

  async createPCFile() {
    const campaignName = this.campaign.split('/').pop() || "Unknown";
    const pcPath = `${this.campaign}/PCs`;
    
    new Notice(this.isEdit ? `Updating PC "${this.pcName}"...` : `Creating PC "${this.pcName}"...`);

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

      let tokenId: string;
      let pcFile: TFile | null = null;
      let filePath: string;

      if (this.isEdit) {
        // Editing existing PC
        pcFile = this.app.vault.getAbstractFileByPath(this.originalPCPath) as TFile;
        if (!pcFile) {
          new Notice("Original PC file not found!");
          return;
        }
        
        // Get existing token ID from frontmatter
        const cache = this.app.metadataCache.getFileCache(pcFile);
        tokenId = cache?.frontmatter?.token_id || this.plugin.markerLibrary.generateId();
        
        filePath = this.originalPCPath;

        // If PC name changed, rename the file
        if (this.pcName !== this.originalPCName) {
          const folder = filePath.substring(0, filePath.lastIndexOf('/'));
          const newPath = `${folder}/${this.pcName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`A PC named "${this.pcName}" already exists!`);
            return;
          }
          
          await this.app.fileManager.renameFile(pcFile, newPath);
          filePath = newPath;
          pcFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        }
        
        // Update the map token, preserving existing fields (imageFile, darkvision, etc.)
        const now = Date.now();
        const existingMarker = this.plugin.markerLibrary.getMarker(tokenId);
        const tokenDef: MarkerDefinition = {
          ...(existingMarker || {}),
          id: tokenId,
          name: this.pcName,
          type: 'player',
          icon: existingMarker?.icon || '🛡️',
          backgroundColor: existingMarker?.backgroundColor || '#4a90d9',
          borderColor: existingMarker?.borderColor || '#ffffff',
          creatureSize: existingMarker?.creatureSize || 'medium',
          campaign: campaignName,
          createdAt: existingMarker?.createdAt || now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);
      } else {
        // Creating new PC
        filePath = `${pcPath}/${this.pcName}.md`;

        // Check if PC already exists BEFORE creating token
        if (await this.app.vault.adapter.exists(filePath)) {
          new Notice(`A PC named "${this.pcName}" already exists!`);
          return;
        }

        // Create a map token for this PC
        const now = Date.now();
        tokenId = this.plugin.markerLibrary.generateId();
        const tokenDef: MarkerDefinition = {
          id: tokenId,
          name: this.pcName,
          type: 'player',
          icon: '🛡️',
          backgroundColor: '#4a90d9',  // Blue for players
          borderColor: '#ffffff',
          creatureSize: 'medium',
          campaign: campaignName,
          createdAt: now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);
      }

      // Get PC content - use existing file content when editing, template for new PCs
      let pcContent: string;

      if (this.isEdit && pcFile) {
        // Preserve existing content when editing
        pcContent = await this.app.vault.read(pcFile);
      } else {
        // Always use the bundled template (guaranteed to have latest buttons/features)
        pcContent = PC_TEMPLATE;
      }

      // Get current date
      const currentDate = new Date().toISOString().split('T')[0];

      // Combine classes into a single string
      const classString = this.classes.filter(c => c.trim()).join("/");

      // Build complete frontmatter
      const frontmatter = `---
type: player
template_version: 1.2.0
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
token_id: ${tokenId}
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

      // When editing, also replace already-rendered content (not just Templater placeholders)
      if (this.isEdit) {
        // Replace existing PDF link or placeholder
        pcContent = pcContent
          .replace(/\[\[[^\]]+\|Character Sheet PDF\]\]/g, 
            this.characterSheetPdf ? `[[${this.characterSheetPdf}|Character Sheet PDF]]` : "_No PDF uploaded_")
          .replace(/_No PDF uploaded_/g, 
            this.characterSheetPdf ? `[[${this.characterSheetPdf}|Character Sheet PDF]]` : "_No PDF uploaded_");
        
        // Replace existing URL link or placeholder
        pcContent = pcContent
          .replace(/\[Digital Character Sheet\]\([^)]+\)/g, 
            this.characterSheetUrl ? `[Digital Character Sheet](${this.characterSheetUrl})` : "_No digital sheet linked_")
          .replace(/_No digital sheet linked_/g, 
            this.characterSheetUrl ? `[Digital Character Sheet](${this.characterSheetUrl})` : "_No digital sheet linked_");
      }

      // Create or update the file
      if (this.isEdit && pcFile) {
        await this.app.vault.modify(pcFile, pcContent);
        new Notice(`✅ PC "${this.pcName}" updated successfully!`);
      } else {
        await this.app.vault.create(filePath, pcContent);
        new Notice(`✅ PC "${this.pcName}" created successfully!`);
        pcFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;
      }

      // Open the file
      if (pcFile) {
        await this.app.workspace.openLinkText(filePath, "", false);
      }
      
      // Register in Initiative Tracker if requested (only for new PCs)
      if (!this.isEdit && this.registerInTracker && this.isGM) {
        await this.registerPCInInitiativeTracker(filePath);
      }
    } catch (error) {
      new Notice(`❌ Error ${this.isEdit ? 'updating' : 'creating'} PC: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`PC ${this.isEdit ? 'update' : 'creation'} error:`, error);
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
        return;
      }

      // Generate unique ID for the player
      const playerId = this.generatePlayerId();
      
      // Parse initiative modifier - handle both "+2" and "2" formats
      const initMod = parseInt(this.initBonus.replace(/[^-\d]/g, '')) || 0;
      
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
