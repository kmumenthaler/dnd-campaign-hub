import { App, Modal, Notice, Setting, TextComponent, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PDFFileSuggest, PDFBrowserModal } from "../utils/PDFBrowser";
import { MarkerDefinition, CreatureSize } from '../marker/MarkerTypes';
import { TokenEditorWidget } from '../marker/TokenEditorWidget';
import { PC_TEMPLATE } from '../templates';
import { TEMPLATE_VERSIONS } from '../migration';
import { updateYamlFrontmatter } from '../utils/YamlFrontmatter';

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
  registerInTracker = true;  // Default: register PCs in party manager

  // Token appearance widget
  private tokenEditor: TokenEditorWidget | null = null;

  // For editing existing PCs
  isEdit = false;
  originalPCPath = "";
  originalPCName = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, pcPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.resolveCampaign();
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
      contentEl.createEl("h3", { text: "🎲 Party Registration" });
      
      new Setting(contentEl)
        .setName("Register in Party Manager")
        .setDesc("Automatically add this PC to the campaign's party")
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

    // ── Token Appearance ──
    contentEl.createEl("h3", { text: "🎨 Token Appearance" });
    const tokenContainer = contentEl.createDiv();
    this.initTokenEditor(tokenContainer);

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

  /**
   * Initialise (or re-render) the token appearance widget.
   * On edit, loads values from the existing MarkerDefinition.
   */
  private initTokenEditor(container: HTMLElement): void {
    let initial: Partial<{ icon: string; backgroundColor: string; borderColor: string; imageFile: string; imageFit: 'cover' | 'contain' }> | undefined;

    if (this.tokenEditor) {
      // Preserve user's in-progress edits across refresh()
      initial = this.tokenEditor.getValues();
    } else if (this.isEdit) {
      const file = this.app.vault.getAbstractFileByPath(this.originalPCPath) as TFile;
      if (file) {
        const cache = this.app.metadataCache.getFileCache(file);
        const tokenId = cache?.frontmatter?.token_id;
        if (tokenId) {
          const marker = this.plugin.markerLibrary.getMarker(tokenId);
          if (marker) {
            initial = {
              icon: marker.icon,
              backgroundColor: marker.backgroundColor,
              borderColor: marker.borderColor,
              imageFile: marker.imageFile,
              imageFit: marker.imageFit
            };
          }
        }
      }
    }

    this.tokenEditor = new TokenEditorWidget(this.app, {
      initial,
      creatureSize: 'medium',
      defaultBackgroundColor: '#4a90d9',
      defaultBorderColor: '#ffffff'
    });
    this.tokenEditor.render(container);
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
        
        // Update the map token using widget values + computed fields
        const now = Date.now();
        const existingMarker = this.plugin.markerLibrary.getMarker(tokenId);
        const tokenAppearance = this.tokenEditor?.getValues();
        const tokenDef: MarkerDefinition = {
          ...(existingMarker || {}),
          id: tokenId,
          name: this.pcName,
          type: 'player',
          icon: tokenAppearance?.icon ?? existingMarker?.icon ?? '',
          backgroundColor: tokenAppearance?.backgroundColor ?? existingMarker?.backgroundColor ?? '#4a90d9',
          borderColor: tokenAppearance?.borderColor ?? existingMarker?.borderColor ?? '#ffffff',
          imageFile: tokenAppearance?.imageFile || undefined,
          imageFit: tokenAppearance?.imageFit !== 'cover' ? tokenAppearance?.imageFit : undefined,
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

        // Create a map token for this PC using widget values
        const now = Date.now();
        tokenId = this.plugin.markerLibrary.generateId();
        const tokenAppearance = this.tokenEditor?.getValues();
        const tokenDef: MarkerDefinition = {
          id: tokenId,
          name: this.pcName,
          type: 'player',
          icon: tokenAppearance?.icon ?? '',
          backgroundColor: tokenAppearance?.backgroundColor ?? '#4a90d9',
          borderColor: tokenAppearance?.borderColor ?? '#ffffff',
          imageFile: tokenAppearance?.imageFile || undefined,
          imageFit: tokenAppearance?.imageFit !== 'cover' ? tokenAppearance?.imageFit : undefined,
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

      const playerTemplateVersion = TEMPLATE_VERSIONS.player || TEMPLATE_VERSIONS.pc || "1.3.0";
      pcContent = updateYamlFrontmatter(pcContent, (fm) => ({
        ...fm,
        type: 'player',
        template_version: playerTemplateVersion,
        name: this.pcName,
        player: this.playerName,
        campaign: campaignName,
        world: worldName,
        class: classString,
        level: this.level,
        hp: this.hpCurrent || "0",
        hp_max: this.hpMax || "0",
        thp: 0,
        ac: this.ac,
        init_bonus: this.initBonus,
        speed: this.speed,
        readonlyUrl: this.characterSheetUrl,
        characterSheetPdf: this.characterSheetPdf,
        token_id: tokenId,
        date: currentDate,
      }));
      
      // Replace the title
      pcContent = pcContent.replace(/# {{name}}/, `# ${this.pcName}`);

      // Replace template references with actual values
      pcContent = pcContent
        .replace(/{{name}}/g, this.pcName)
        .replace(/{{class}}/g, classString)
        .replace(/{{level}}/g, this.level)
        .replace(/{{hp}}/g, this.hpCurrent || "0")
        .replace(/{{hp_max}}/g, this.hpMax || "0")
        .replace(/{{ac}}/g, this.ac)
        .replace(/{{init_bonus}}/g, this.initBonus)
        .replace(/{{speed}}/g, this.speed)
        .replace(/{{characterSheetLink}}/g, 
          this.characterSheetUrl ? `[Digital Character Sheet](${this.characterSheetUrl})` : "_No digital sheet linked_")
        .replace(/{{characterSheetPdf}}/g,
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
      
      // Register in Party Manager if requested (only for new PCs)
      if (!this.isEdit && this.registerInTracker && this.isGM) {
        await this.registerPCInPartyManager(filePath);
      }
    } catch (error) {
      new Notice(`❌ Error ${this.isEdit ? 'updating' : 'creating'} PC: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`PC ${this.isEdit ? 'update' : 'creation'} error:`, error);
    }
  }

  /**
   * Register PC in the built-in Party Manager.
   */
  async registerPCInPartyManager(pcFilePath: string) {
    try {
      const campaignName = this.campaign.split('/').pop() || "Unknown Campaign";
      await this.plugin.partyManager.registerPC(this.pcName, pcFilePath, campaignName);
      new Notice(`✅ ${this.pcName} registered in party!`);
    } catch (error) {
      console.error("Error registering PC in Party Manager:", error);
      new Notice("⚠️ PC created but could not register in party. Check console for details.");
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
