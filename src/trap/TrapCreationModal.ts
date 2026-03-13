import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { TrapElement, TrapCountermeasure } from "../encounter/EncounterBuilder";
import { TRAP_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration";

export class TrapCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  trapName = "";
  trapType: 'simple' | 'complex' = 'simple';
  threatLevel: 'setback' | 'dangerous' | 'deadly' = 'setback';
  minLevel = 1;
  maxLevel = 5;
  trigger = "";
  adventurePath = "";
  scenePath = "";
  
  elements: TrapElement[] = [];
  countermeasures: TrapCountermeasure[] = [];
  
  // UI containers
  elementsContainer: HTMLElement | null = null;
  countermeasuresContainer: HTMLElement | null = null;

  // For editing existing traps
  isEdit = false;
  originalTrapPath = "";
  originalTrapName = "";
  originalElements: TrapElement[] = [];

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, scenePath?: string, trapPath?: string) {
    super(app);
    this.plugin = plugin;
    if (adventurePath) this.adventurePath = adventurePath;
    if (scenePath) this.scenePath = scenePath;
    if (trapPath) {
      this.isEdit = true;
      this.originalTrapPath = trapPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // Load existing trap data if editing
    if (this.isEdit) {
      await this.loadTrapData();
    }
    
    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Trap" : "Create New Trap" });

    // Trap Name
    new Setting(contentEl)
      .setName("Trap Name")
      .setDesc("Name of the trap")
      .addText((text) =>
        text
          .setPlaceholder("Thundering Squall")
          .setValue(this.trapName)
          .onChange((value) => {
            this.trapName = value;
          })
      );

    // Trap Type
    new Setting(contentEl)
      .setName("Trap Type")
      .setDesc("Simple traps have basic effects. Complex traps have multiple initiatives and elements.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("simple", "Simple")
          .addOption("complex", "Complex")
          .setValue(this.trapType)
          .onChange((value) => {
            this.trapType = value as 'simple' | 'complex';
            this.refreshUI();
          })
      );

    // Threat Level
    new Setting(contentEl)
      .setName("Threat Level")
      .setDesc("How dangerous is this trap?")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("setback", "Setback")
          .addOption("dangerous", "Dangerous")
          .addOption("deadly", "Deadly")
          .setValue(this.threatLevel)
          .onChange((value: any) => {
            this.threatLevel = value;
          })
      );

    // Level Range
    new Setting(contentEl)
      .setName("Level Range")
      .setDesc("Minimum and maximum character levels for this trap")
      .addText((text) =>
        text
          .setPlaceholder("1")
          .setValue(this.minLevel.toString())
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 1 && num <= 20) {
              this.minLevel = num;
            }
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("5")
          .setValue(this.maxLevel.toString())
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 1 && num <= 20) {
              this.maxLevel = num;
            }
          })
      );

    // Trigger
    new Setting(contentEl)
      .setName("Trigger")
      .setDesc("What activates this trap?")
      .addTextArea((text) => {
        text
          .setPlaceholder("A creature enters the area without the cult insignia...")
          .setValue(this.trigger)
          .onChange((value) => {
            this.trigger = value;
          });
        text.inputEl.rows = 3;
        text.inputEl.style.width = "100%";
      });

    // Elements Section
    contentEl.createEl("h3", { text: "Trap Elements" });
    this.elementsContainer = contentEl.createDiv();
    this.renderElements();

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Element")
          .onClick(() => {
            this.addElement();
          })
      );

    // Countermeasures Section
    contentEl.createEl("h3", { text: "Countermeasures" });
    this.countermeasuresContainer = contentEl.createDiv();
    this.renderCountermeasures();

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Countermeasure")
          .onClick(() => {
            this.addCountermeasure();
          })
      );

    // Adventure/Scene Link
    const adventureDisplay = this.adventurePath 
      ? this.adventurePath.split('/').pop()?.replace('.md', '') || 'None'
      : 'None';

    const sceneDisplay = this.scenePath
      ? this.scenePath.split('/').pop()?.replace('.md', '') || 'None'
      : 'None';

    contentEl.createEl("p", { 
      text: `Adventure: ${adventureDisplay} | Scene: ${sceneDisplay}`,
      attr: { style: "margin-top: 1em; font-size: 0.9em; color: var(--text-muted);" }
    });

    // Create Button
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText(this.isEdit ? "Update Trap" : "Create Trap")
        .setCta()
        .onClick(() => {
          this.createTrap();
        })
    );
  }

  refreshUI() {
    this.renderElements();
  }

  addElement() {
    const newElement: TrapElement = {
      name: "",
      element_type: this.trapType === 'simple' ? 'active' : 'active',
      initiative: this.trapType === 'complex' ? 20 : undefined,
      effect: ""
    };
    this.elements.push(newElement);
    this.renderElements();
  }

  removeElement(index: number) {
    this.elements.splice(index, 1);
    this.renderElements();
  }

  renderElements() {
    if (!this.elementsContainer) return;
    this.elementsContainer.empty();

    if (this.elements.length === 0) {
      this.elementsContainer.createEl("p", { 
        text: "No elements added yet. Click '+ Add Element' to add trap effects.",
        attr: { style: "color: var(--text-muted); font-style: italic;" }
      });
      return;
    }

    this.elements.forEach((element, index) => {
      const elementContainer = this.elementsContainer!.createDiv({ cls: "trap-element" });
      elementContainer.style.border = "1px solid var(--background-modifier-border)";
      elementContainer.style.padding = "10px";
      elementContainer.style.marginBottom = "10px";
      elementContainer.style.borderRadius = "5px";

      // Element header with remove button
      const headerDiv = elementContainer.createDiv();
      headerDiv.style.display = "flex";
      headerDiv.style.justifyContent = "space-between";
      headerDiv.style.alignItems = "center";
      headerDiv.style.marginBottom = "10px";

      headerDiv.createEl("h4", { text: `Element ${index + 1}`, attr: { style: "margin: 0;" } });
      
      const removeBtn = headerDiv.createEl("button", { text: "Remove" });
      removeBtn.style.padding = "2px 8px";
      removeBtn.style.fontSize = "0.8em";
      removeBtn.onclick = () => this.removeElement(index);

      // Name
      new Setting(elementContainer)
        .setName("Name")
        .addText((text) =>
          text
            .setPlaceholder("Thunderous Slam")
            .setValue(element.name)
            .onChange((value) => {
              element.name = value;
            })
        );

      // Element Type (for complex traps)
      if (this.trapType === 'complex') {
        new Setting(elementContainer)
          .setName("Element Type")
          .addDropdown((dropdown) =>
            dropdown
              .addOption("active", "Active (on initiative)")
              .addOption("dynamic", "Dynamic (conditional)")
              .addOption("constant", "Constant (ongoing)")
              .setValue(element.element_type)
              .onChange((value: any) => {
                element.element_type = value;
                this.renderElements();
              })
          );

        // Initiative (for active elements)
        if (element.element_type === 'active') {
          new Setting(elementContainer)
            .setName("Initiative")
            .addText((text) =>
              text
                .setPlaceholder("20")
                .setValue(element.initiative?.toString() || "")
                .onChange((value) => {
                  const num = parseInt(value);
                  if (!isNaN(num)) {
                    element.initiative = num;
                  }
                })
            );
        }

        // Condition (for dynamic elements)
        if (element.element_type === 'dynamic') {
          new Setting(elementContainer)
            .setName("Condition")
            .addTextArea((text) => {
              text
                .setPlaceholder("On each initiative count 10...")
                .setValue(element.condition || "")
                .onChange((value) => {
                  element.condition = value;
                });
              text.inputEl.rows = 2;
              text.inputEl.style.width = "100%";
            });
        }
      }

      // Attack Bonus
      new Setting(elementContainer)
        .setName("Attack Bonus (optional)")
        .addText((text) =>
          text
            .setPlaceholder("+8")
            .setValue(element.attack_bonus?.toString() || "")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num)) {
                element.attack_bonus = num;
              } else if (value === "") {
                element.attack_bonus = undefined;
              }
            })
        );

      // Range
      new Setting(elementContainer)
        .setName("Range (optional)")
        .addText((text) =>
          text
            .setPlaceholder("60 ft. or Touch or Melee")
            .setValue(element.range || "")
            .onChange((value) => {
              element.range = value || undefined;
            })
        );

      // Save DC
      new Setting(elementContainer)
        .setName("Save DC (optional)")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(element.save_dc?.toString() || "")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num)) {
                element.save_dc = num;
              } else if (value === "") {
                element.save_dc = undefined;
              }
            })
        )
        .addDropdown((dropdown) =>
          dropdown
            .addOption("DEX", "DEX")
            .addOption("STR", "STR")
            .addOption("CON", "CON")
            .addOption("INT", "INT")
            .addOption("WIS", "WIS")
            .addOption("CHA", "CHA")
            .setValue(element.save_ability || "DEX")
            .onChange((value) => {
              element.save_ability = value;
            })
        );

      // Damage
      new Setting(elementContainer)
        .setName("Damage (optional)")
        .addText((text) =>
          text
            .setPlaceholder("4d10 thunder")
            .setValue(element.damage || "")
            .onChange((value) => {
              element.damage = value || undefined;
            })
        );

      // Additional Damage
      new Setting(elementContainer)
        .setName("Additional Damage (optional)")
        .addText((text) =>
          text
            .setPlaceholder("2d6 fire (ongoing)")
            .setValue(element.additional_damage || "")
            .onChange((value) => {
              element.additional_damage = value || undefined;
            })
        );

      // Save Success/Failure (only if save_dc is set)
      if (element.save_dc) {
        new Setting(elementContainer)
          .setName("On Successful Save")
          .addTextArea((text) => {
            text
              .setPlaceholder("Takes half damage...")
              .setValue(element.on_success || "")
              .onChange((value) => {
                element.on_success = value || undefined;
              });
            text.inputEl.rows = 2;
            text.inputEl.style.width = "100%";
          });

        new Setting(elementContainer)
          .setName("On Failed Save")
          .addTextArea((text) => {
            text
              .setPlaceholder("Takes full damage and is knocked prone...")
              .setValue(element.on_failure || "")
              .onChange((value) => {
                element.on_failure = value || undefined;
              });
            text.inputEl.rows = 2;
            text.inputEl.style.width = "100%";
          });
      }

      // Effect
      new Setting(elementContainer)
        .setName("Effect")
        .addTextArea((text) => {
          text
            .setPlaceholder("The target is pushed 10 feet and knocked prone...")
            .setValue(element.effect || "")
            .onChange((value) => {
              element.effect = value;
            });
          text.inputEl.rows = 3;
          text.inputEl.style.width = "100%";
        });
    });
  }

  addCountermeasure() {
    const newCM: TrapCountermeasure = {
      method: "",
      dc: 15,
      checks_needed: 1
    };
    this.countermeasures.push(newCM);
    this.renderCountermeasures();
  }

  removeCountermeasure(index: number) {
    this.countermeasures.splice(index, 1);
    this.renderCountermeasures();
  }

  renderCountermeasures() {
    if (!this.countermeasuresContainer) return;
    this.countermeasuresContainer.empty();

    if (this.countermeasures.length === 0) {
      this.countermeasuresContainer.createEl("p", { 
        text: "No countermeasures added yet. Click '+ Add Countermeasure' to add ways to disable the trap.",
        attr: { style: "color: var(--text-muted); font-style: italic;" }
      });
      return;
    }

    this.countermeasures.forEach((cm, index) => {
      const cmContainer = this.countermeasuresContainer!.createDiv({ cls: "trap-countermeasure" });
      cmContainer.style.border = "1px solid var(--background-modifier-border)";
      cmContainer.style.padding = "10px";
      cmContainer.style.marginBottom = "10px";
      cmContainer.style.borderRadius = "5px";

      // Header with remove button
      const headerDiv = cmContainer.createDiv();
      headerDiv.style.display = "flex";
      headerDiv.style.justifyContent = "space-between";
      headerDiv.style.alignItems = "center";
      headerDiv.style.marginBottom = "10px";

      headerDiv.createEl("h4", { text: `Countermeasure ${index + 1}`, attr: { style: "margin: 0;" } });
      
      const removeBtn = headerDiv.createEl("button", { text: "Remove" });
      removeBtn.style.padding = "2px 8px";
      removeBtn.style.fontSize = "0.8em";
      removeBtn.onclick = () => this.removeCountermeasure(index);

      // Method
      new Setting(cmContainer)
        .setName("Method")
        .addText((text) =>
          text
            .setPlaceholder("Force open the door")
            .setValue(cm.method)
            .onChange((value) => {
              cm.method = value;
            })
        );

      // DC
      new Setting(cmContainer)
        .setName("DC")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(cm.dc?.toString() || "")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num)) {
                cm.dc = num;
              }
            })
        );

      // Checks Needed
      new Setting(cmContainer)
        .setName("Checks Needed")
        .setDesc("How many successful checks to complete?")
        .addText((text) =>
          text
            .setPlaceholder("1")
            .setValue(cm.checks_needed?.toString() || "1")
            .onChange((value) => {
              const num = parseInt(value);
              if (!isNaN(num) && num >= 1) {
                cm.checks_needed = num;
              }
            })
        );

      // Description
      new Setting(cmContainer)
        .setName("Description")
        .addTextArea((text) => {
          text
            .setPlaceholder("Three DC 20 Strength checks required to force the door...")
            .setValue(cm.description || "")
            .onChange((value) => {
              cm.description = value;
            });
          text.inputEl.rows = 2;
          text.inputEl.style.width = "100%";
        });

      // Effect
      new Setting(cmContainer)
        .setName("Effect on Success")
        .addTextArea((text) => {
          text
            .setPlaceholder("The trap is disabled...")
            .setValue(cm.effect || "")
            .onChange((value) => {
              cm.effect = value;
            });
          text.inputEl.rows = 2;
          text.inputEl.style.width = "100%";
        });
    });
  }

  async loadTrapData() {
    try {
      const trapFile = this.app.vault.getAbstractFileByPath(this.originalTrapPath);
      if (!(trapFile instanceof TFile)) {
        new Notice("Trap file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(trapFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read trap data!");
        return;
      }

      // Load basic trap properties
      this.trapName = frontmatter.trap_name || trapFile.basename;
      this.originalTrapName = this.trapName; // Store original name for statblock updates
      this.trapType = frontmatter.trap_type || 'simple';
      this.threatLevel = frontmatter.threat_level || 'setback';
      this.minLevel = frontmatter.min_level || 1;
      this.maxLevel = frontmatter.max_level || 5;
      this.trigger = frontmatter.trigger || "";
      this.adventurePath = frontmatter.adventure || "";
      this.scenePath = frontmatter.scene || "";

      // Load elements
      if (frontmatter.elements && Array.isArray(frontmatter.elements)) {
        this.elements = frontmatter.elements.map((e: any) => ({
          name: e.name || "",
          element_type: e.element_type || 'active',
          initiative: e.initiative,
          attack_bonus: e.attack_bonus,
          save_dc: e.save_dc,
          save_ability: e.save_ability,
          damage: e.damage,
          additional_damage: e.additional_damage,
          range: e.range,
          on_success: e.on_success,
          on_failure: e.on_failure,
          effect: e.effect || "",
          condition: e.condition
        }));
        // Store original elements to track deletions
        this.originalElements = JSON.parse(JSON.stringify(this.elements));
      }

      // Load countermeasures
      if (frontmatter.countermeasures && Array.isArray(frontmatter.countermeasures)) {
        this.countermeasures = frontmatter.countermeasures.map((cm: any) => ({
          method: cm.method || "",
          description: cm.description,
          dc: cm.dc,
          checks_needed: cm.checks_needed || 1,
          effect: cm.effect
        }));
      }

    } catch (error) {
      console.error("Error loading trap data:", error);
      new Notice("Error loading trap data. Check console for details.");
    }
  }

  async createTrap() {
    if (!this.trapName) {
      new Notice("Please enter a trap name");
      return;
    }

    if (this.elements.length === 0) {
      new Notice("Please add at least one trap element");
      return;
    }

    try {
      // Get campaign and world info
      let campaignName = "";
      let worldName = "";

      if (this.adventurePath) {
        const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
        if (adventureFile instanceof TFile) {
          const content = await this.app.vault.read(adventureFile);
          const campaignMatch = content.match(/^campaign:\s*(.+)$/m);
          const worldMatch = content.match(/^world:\s*(.+)$/m);
          
          if (campaignMatch && campaignMatch[1]) campaignName = campaignMatch[1].trim();
          if (worldMatch && worldMatch[1]) worldName = worldMatch[1].trim();
        }
      }

      let trapPath: string;
      let trapFile: TFile | null = null;

      if (this.isEdit) {
        // Editing existing trap
        trapFile = this.app.vault.getAbstractFileByPath(this.originalTrapPath) as TFile;
        if (!trapFile) {
          new Notice("Original trap file not found!");
          return;
        }
        trapPath = this.originalTrapPath;

        // If trap name changed, handle file rename and statblock updates
        if (this.trapName !== this.originalTrapName) {
          // Delete old statblocks
          await this.plugin.deleteTrapStatblocks(this.originalTrapName);
          
          // Rename file if name changed
          const folder = trapPath.substring(0, trapPath.lastIndexOf('/'));
          const newPath = `${folder}/${this.trapName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`A trap named "${this.trapName}" already exists!`);
            return;
          }
          
          await this.app.fileManager.renameFile(trapFile, newPath);
          trapPath = newPath;
          trapFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        } else {
          // Same name - delete old statblocks and we'll recreate
          await this.plugin.deleteTrapStatblocks(this.originalTrapName);
        }

        // Track removed elements for complex traps
        if (this.trapType === 'complex') {
          // Find elements that were removed
          const currentElementNames = new Set(this.elements.map(e => e.name));
          const removedElements = this.originalElements.filter(e => !currentElementNames.has(e.name));
          
          if (removedElements.length > 0) {
            // Note: We already deleted all statblocks above, so this is just logging
          }
        }
      } else {
        // Creating new trap
        // Create trap file path in z_Traps folder
        let trapsFolder = "z_Traps";
        
        // If we have a campaign, create in campaign's z_Traps folder
        if (campaignName) {
          trapsFolder = `${campaignName}/z_Traps`;
        }
        
        // Ensure z_Traps folder exists
        if (!(await this.app.vault.adapter.exists(trapsFolder))) {
          await this.app.vault.createFolder(trapsFolder);
        }
        
        trapPath = `${trapsFolder}/${this.trapName}.md`;

        // Check if file already exists
        if (await this.app.vault.adapter.exists(trapPath)) {
          new Notice(`A trap named "${this.trapName}" already exists!`);
          return;
        }
      }

      // Create trap content with statblocks
      const trapContent = this.createTrapContent(campaignName, worldName);

      // Create or update the file
      if (this.isEdit && trapFile) {
        await this.app.vault.modify(trapFile, trapContent);
        new Notice(`Trap "${this.trapName}" updated!`);
      } else {
        await this.app.vault.create(trapPath, trapContent);
        new Notice(`Trap "${this.trapName}" created!`);
        trapFile = this.app.vault.getAbstractFileByPath(trapPath) as TFile;
      }

      // Save statblocks to Fantasy Statblocks plugin
      await this.saveStatblocks();

      this.close();

      // Open the trap file
      if (trapFile) {
        await this.app.workspace.getLeaf().openFile(trapFile);
      }
    } catch (error) {
      console.error("Error creating/editing trap:", error);
      new Notice("Failed to save trap. Check console for details.");
    }
  }

  createTrapContent(campaignName: string, worldName: string): string {
    const now = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
    const trapTemplateVersion = TEMPLATE_VERSIONS.trap || "1.3.0";
    
    // Generate statblock content
    const statblockContent = this.generateStatblockContent();
    
    // Convert elements and countermeasures to YAML
    const elementsYaml = JSON.stringify(this.elements, null, 2)
      .split('\n')
      .map((line, idx) => idx === 0 ? line : '  ' + line)
      .join('\n');

    const countermeasuresYaml = JSON.stringify(this.countermeasures, null, 2)
      .split('\n')
      .map((line, idx) => idx === 0 ? line : '  ' + line)
      .join('\n');
    const frontmatter = `---
type: trap
template_version: ${trapTemplateVersion}
campaign: ${campaignName}
adventure: ${this.adventurePath?.split('/').pop()?.replace('.md', '') || ''}
world: ${worldName}
scene: ${this.scenePath?.split('/').pop()?.replace('.md', '') || ''}
trap_name: ${this.trapName}
trap_type: ${this.trapType}
threat_level: ${this.threatLevel}
min_level: ${this.minLevel}
max_level: ${this.maxLevel}
trigger: ${this.trigger}
elements: ${elementsYaml}
countermeasures: ${countermeasuresYaml}
date: ${now}
---`;

    let content = TRAP_TEMPLATE
      .replace(/^---\n[\s\S]*?\n---/, frontmatter)
      .replace(/{{trap_name}}/g, this.trapName)
      .replace(/{{trap_type}}/g, this.trapType)
      .replace(/{{threat_level}}/g, this.threatLevel)
      .replace(/{{min_level}}/g, this.minLevel.toString())
      .replace(/{{max_level}}/g, this.maxLevel.toString())
      .replace(/{{trigger}}/g, this.trigger || "Not specified")
      .replace(/{{DATE}}/g, now);

    // Keep generated statblock output for GM reference while action/elements rendering
    // is handled by dnd-hub and dnd-hub-view blocks from the canonical trap template.
    content = content.replace(
      "## Trap Elements & Effects",
      `## Statblocks\n\n${statblockContent}\n\n---\n\n## Trap Elements & Effects`
    );

    return content;
  }

  async saveStatblocks() {
    try {
      const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
      if (!statblocksPlugin) {
        return;
      }

      const homebrewSource = `Trap: ${this.trapName}`;
      const homebrewCreatures: any[] = [];

      if (this.trapType === 'simple') {
        // Create single statblock for simple trap
        const statblock = this.createSimpleStatblock(homebrewSource);
        homebrewCreatures.push(statblock);
      } else {
        // Create multiple statblocks for complex trap
        const statblocks = this.createComplexStatblocks(homebrewSource);
        homebrewCreatures.push(...statblocks);
      }

      // Save to Fantasy Statblocks bestiary
      if (homebrewCreatures.length > 0) {
        
        // Try multiple methods to save the monsters
        if (statblocksPlugin.saveMonsters) {
          // Method 1: Direct saveMonsters API
          await statblocksPlugin.saveMonsters(homebrewCreatures);
        } else if (statblocksPlugin.api?.saveMonsters) {
          // Method 2: API object saveMonsters
          await statblocksPlugin.api.saveMonsters(homebrewCreatures);
        } else if (statblocksPlugin.data?.monsters) {
          // Method 3: Direct data manipulation
          if (!Array.isArray(statblocksPlugin.data.monsters)) {
            statblocksPlugin.data.monsters = [];
          }
          
          // Add each creature to the monsters array
          for (const creature of homebrewCreatures) {
            // Check if creature already exists (by name and source)
            const existingIndex = statblocksPlugin.data.monsters.findIndex(
              (m: any) => m.name === creature.name && m.source === creature.source
            );
            
            if (existingIndex >= 0) {
              // Replace existing creature
              statblocksPlugin.data.monsters[existingIndex] = creature;
            } else {
              // Add new creature
              statblocksPlugin.data.monsters.push(creature);
            }
          }
          
          // Save plugin data
          await statblocksPlugin.saveData(statblocksPlugin.data);
        } else {
        }
      }
    } catch (error) {
      console.error("Error saving trap statblocks:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      // Don't fail the trap creation if statblock saving fails
    }
  }

  createSimpleStatblock(source: string): any {
    const element = this.elements[0]; // Use first element for simple trap
    
    // Build actions from trap element
    const actions: any[] = [];
    
    if (element) {
      const action: any = {
        name: element.name || "Trap Effect",
        desc: ""
      };

      if (element.attack_bonus !== undefined) {
        const range = element.range || "reach 5 ft. or range 60 ft.";
        action.desc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
      }

      if (element.save_dc !== undefined) {
        action.desc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
      }

      if (element.damage) {
        if (element.attack_bonus !== undefined) {
          action.desc += `Hit: ${element.damage} damage. `;
        } else if (element.save_dc !== undefined) {
          // Use custom success/failure text if provided
          if (element.on_failure) {
            action.desc += `On a failed save: ${element.on_failure} `;
          } else {
            action.desc += `On a failed save: ${element.damage} damage`;
            if (element.on_success) {
              action.desc += `, ${element.on_success} `;
            } else {
              action.desc += `, or half as much damage on a successful one. `;
            }
          }
        }
      } else if (element.save_dc && (element.on_failure || element.on_success)) {
        // No damage but has success/failure effects
        if (element.on_failure) {
          action.desc += `On a failed save: ${element.on_failure} `;
        }
        if (element.on_success) {
          action.desc += `On a successful save: ${element.on_success} `;
        }
      }

      if (element.additional_damage) {
        action.desc += `Additional: ${element.additional_damage}. `;
      }

      if (element.effect) {
        action.desc += element.effect;
      }

      actions.push(action);
    }

    // Build traits from countermeasures
    const traits: any[] = this.countermeasures.map(cm => ({
      name: `Countermeasure: ${cm.method}`,
      desc: `${cm.description || cm.method}${cm.dc ? ` (DC ${cm.dc})` : ''}${cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : ''} ${cm.effect || ''}`
    }));

    return {
      name: this.trapName,
      source: source,
      type: "trap",
      size: "Large",
      alignment: "unaligned",
      ac: 15,
      hp: 50,
      speed: "0 ft.",
      stats: [10, 10, 10, 10, 10, 10],
      senses: "—",
      languages: "—",
      cr: this.calculateTrapCR(),
      traits: traits,
      actions: actions,
      layout: "Basic 5e Layout"
    };
  }

  createComplexStatblocks(source: string): any[] {
    const statblocks: any[] = [];

    // Group elements by initiative
    const byInitiative = new Map<number, TrapElement[]>();
    const constantElements: TrapElement[] = [];
    const dynamicElements: TrapElement[] = [];

    for (const element of this.elements) {
      if (element.element_type === 'constant') {
        constantElements.push(element);
      } else if (element.element_type === 'dynamic') {
        dynamicElements.push(element);
      } else if (element.initiative !== undefined) {
        if (!byInitiative.has(element.initiative)) {
          byInitiative.set(element.initiative, []);
        }
        byInitiative.get(element.initiative)!.push(element);
      }
    }


    // Create statblock for each initiative group
    for (const [initiative, elements] of byInitiative.entries()) {
      
      const actions: any[] = elements.map(element => {
        let desc = "";

        if (element.attack_bonus !== undefined) {
          const range = element.range || "reach 5 ft. or range 60 ft.";
          desc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
        }

        if (element.save_dc !== undefined) {
          desc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
        }

        if (element.damage) {
          if (element.attack_bonus !== undefined) {
            desc += `Hit: ${element.damage} damage. `;
          } else if (element.save_dc !== undefined) {
            // Use custom success/failure text if provided
            if (element.on_failure) {
              desc += `On a failed save: ${element.on_failure} `;
            } else {
              desc += `On a failed save: ${element.damage} damage`;
              if (element.on_success) {
                desc += `, ${element.on_success} `;
              } else {
                desc += `, or half as much damage on a successful one. `;
              }
            }
          }
        } else if (element.save_dc && (element.on_failure || element.on_success)) {
          // No damage but has success/failure effects
          if (element.on_failure) {
            desc += `On a failed save: ${element.on_failure} `;
          }
          if (element.on_success) {
            desc += `On a successful save: ${element.on_success} `;
          }
        }

        if (element.additional_damage) {
          desc += `Additional: ${element.additional_damage}. `;
        }

        if (element.effect) {
          desc += element.effect;
        }

        return {
          name: element.name || "Effect",
          desc: desc
        };
      });

      const initTraits: any[] = [
        {
          name: "Fixed Initiative",
          desc: `This trap element acts on initiative count ${initiative}. Do not roll initiative for this creature.`
        }
      ];

      statblocks.push({
        name: `${this.trapName} (Initiative ${initiative})`,
        source: source,
        type: "trap",
        size: "Large",
        alignment: "unaligned",
        ac: 15,
        hp: 1,
        speed: "0 ft.",
        stats: [10, 10, 10, 10, 10, 10],
        senses: "—",
        languages: "—",
        cr: 0,
        modifier: initiative,
        initiative: initiative,  // Fixed initiative value
        traits: initTraits,
        actions: actions,
        layout: "Basic 5e Layout"
      });
      
    }

    
    // Create constant effects statblock if any
    if (constantElements.length > 0) {
      const traits: any[] = constantElements.map(element => ({
        name: element.name || "Constant Effect",
        desc: element.effect || ""
      }));

      statblocks.push({
        name: `${this.trapName} (Constant)`,
        source: source,
        type: "trap",
        size: "Large",
        alignment: "unaligned",
        ac: 15,
        hp: 1,
        speed: "0 ft.",
        stats: [10, 10, 10, 10, 10, 10],
        senses: "—",
        languages: "—",
        cr: 0,
        traits: traits,
        actions: [],
        layout: "Basic 5e Layout"
      });
    }

    // Create dynamic effects statblock if any
    if (dynamicElements.length > 0) {
      const traits: any[] = dynamicElements.map(element => ({
        name: element.name || "Dynamic Effect",
        desc: `${element.condition ? 'Condition: ' + element.condition + '. ' : ''}${element.effect || ''}`
      }));

      statblocks.push({
        name: `${this.trapName} (Dynamic)`,
        source: source,
        type: "trap",
        size: "Large",
        alignment: "unaligned",
        ac: 15,
        hp: 1,
        speed: "0 ft.",
        stats: [10, 10, 10, 10, 10, 10],
        senses: "—",
        languages: "—",
        cr: 0,
        traits: traits,
        actions: [],
        layout: "Basic 5e Layout"
      });
    }

    // Add countermeasures to first statblock
    if (statblocks.length > 0 && this.countermeasures.length > 0) {
      const counterTraits = this.countermeasures.map(cm => ({
        name: `Countermeasure: ${cm.method}`,
        desc: `${cm.description || cm.method}${cm.dc ? ` (DC ${cm.dc})` : ''}${cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : ''} ${cm.effect || ''}`
      }));
      statblocks[0].traits = [...statblocks[0].traits, ...counterTraits];
    }

    return statblocks;
  }

  calculateTrapCR(): number {
    // Calculate average damage per activation
    let totalDamage = 0;
    let maxDC = 0;
    let maxAttackBonus = 0;
    let elementCount = 0;

    for (const element of this.elements) {
      if (element.damage) {
        // Parse damage string to get average (e.g., "4d10" -> 22, "2d6+3" -> 10)
        const avgDamage = this.parseDamageAverage(element.damage);
        totalDamage += avgDamage;
        elementCount++;
      }

      if (element.save_dc && element.save_dc > maxDC) {
        maxDC = element.save_dc;
      }

      if (element.attack_bonus && element.attack_bonus > maxAttackBonus) {
        maxAttackBonus = element.attack_bonus;
      }
    }

    // If no damage, return CR 0
    if (totalDamage === 0) {
      return 0;
    }

    // For complex traps, consider how many elements activate per round
    let dpr = totalDamage;
    if (this.trapType === 'complex') {
      // Count unique initiatives (elements that can activate in same round)
      const initiatives = new Set(
        this.elements
          .filter(e => e.element_type === 'active' && e.initiative !== undefined)
          .map(e => e.initiative)
      );
      
      // If multiple initiatives, trap deals damage over multiple rounds
      // Average DPR is lower
      if (initiatives.size > 1) {
        dpr = totalDamage / initiatives.size;
      }
    }

    // Find CR based on DPR using existing CR tables
    let estimatedCR = this.findCRByDPR(dpr);

    // Adjust based on save DC or attack bonus
    const dcOrAttack = maxDC > 0 ? maxDC : maxAttackBonus;
    if (dcOrAttack > 0) {
      const crByDC = this.findCRByDC(dcOrAttack);
      // Average the two estimates
      estimatedCR = Math.round((estimatedCR + crByDC) / 2);
    }

    // Apply threat level modifier
    if (this.threatLevel === 'dangerous') {
      estimatedCR = Math.ceil(estimatedCR * 1.25);
    } else if (this.threatLevel === 'deadly') {
      estimatedCR = Math.ceil(estimatedCR * 1.5);
    } else if (this.threatLevel === 'setback') {
      estimatedCR = Math.max(0, Math.floor(estimatedCR * 0.75));
    }

    // Clamp to reasonable range based on level range
    const minCR = Math.max(0, Math.floor(this.minLevel / 4));
    const maxCR = Math.ceil(this.maxLevel / 2);
    estimatedCR = Math.max(minCR, Math.min(maxCR, estimatedCR));

    return estimatedCR;
  }

  parseDamageAverage(damageStr: string | undefined): number {
    // Parse damage strings like "4d10", "2d6+3", "22", etc.
    if (!damageStr) return 0;
    
    let cleanDamage = damageStr.trim().toLowerCase();
    
    // Remove damage type (e.g., "4d10 fire" -> "4d10")
    const parts = cleanDamage.split(' ');
    cleanDamage = parts[0] || cleanDamage;

    // Check if it's just a number
    const staticDamage = parseInt(cleanDamage);
    if (!isNaN(staticDamage)) {
      return staticDamage;
    }

    // Parse dice notation: XdY+Z or XdY-Z or XdY
    const diceMatch = cleanDamage.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (diceMatch) {
      const numDice = parseInt(diceMatch[1]!);
      const dieSize = parseInt(diceMatch[2]!);
      const modifier = diceMatch[3] ? parseInt(diceMatch[3]) : 0;
      
      // Average of XdY is X * (Y+1)/2
      const avgRoll = numDice * (dieSize + 1) / 2;
      return Math.floor(avgRoll + modifier);
    }

    // Couldn't parse, return 0
    return 0;
  }

  findCRByDPR(dpr: number): number {
    // Use existing CR table to find closest CR by DPR
    // CR table from getCRStats function
    const crDPRTable = [
      { cr: 0, dpr: 1 },
      { cr: 0.125, dpr: 2 },
      { cr: 0.25, dpr: 3 },
      { cr: 0.5, dpr: 5 },
      { cr: 1, dpr: 8 },
      { cr: 2, dpr: 15 },
      { cr: 3, dpr: 21 },
      { cr: 4, dpr: 27 },
      { cr: 5, dpr: 33 },
      { cr: 6, dpr: 39 },
      { cr: 7, dpr: 45 },
      { cr: 8, dpr: 51 },
      { cr: 9, dpr: 57 },
      { cr: 10, dpr: 63 },
      { cr: 11, dpr: 69 },
      { cr: 12, dpr: 75 },
      { cr: 13, dpr: 81 },
      { cr: 14, dpr: 87 },
      { cr: 15, dpr: 93 },
      { cr: 16, dpr: 99 },
      { cr: 17, dpr: 105 },
      { cr: 18, dpr: 111 },
      { cr: 19, dpr: 117 },
      { cr: 20, dpr: 123 },
      { cr: 21, dpr: 140 },
      { cr: 22, dpr: 150 },
      { cr: 23, dpr: 160 },
      { cr: 24, dpr: 170 },
      { cr: 25, dpr: 180 },
      { cr: 26, dpr: 190 },
      { cr: 27, dpr: 200 },
      { cr: 28, dpr: 210 },
      { cr: 29, dpr: 220 },
      { cr: 30, dpr: 230 }
    ];

    // Find closest CR
    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDPRTable) {
      const diff = Math.abs(entry.dpr - dpr);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return Math.floor(closestCR);
  }

  findCRByDC(dc: number): number {
    // Find CR based on save DC or attack bonus
    // From DMG: DC starts at 13 for CR 0, increases by ~1 every 2-3 CR
    const crDCTable = [
      { cr: 0, dc: 13 },
      { cr: 1, dc: 13 },
      { cr: 2, dc: 13 },
      { cr: 3, dc: 13 },
      { cr: 4, dc: 14 },
      { cr: 5, dc: 15 },
      { cr: 6, dc: 15 },
      { cr: 7, dc: 15 },
      { cr: 8, dc: 16 },
      { cr: 9, dc: 16 },
      { cr: 10, dc: 16 },
      { cr: 11, dc: 17 },
      { cr: 12, dc: 17 },
      { cr: 13, dc: 18 },
      { cr: 14, dc: 18 },
      { cr: 15, dc: 18 },
      { cr: 16, dc: 18 },
      { cr: 17, dc: 19 },
      { cr: 18, dc: 19 },
      { cr: 19, dc: 19 },
      { cr: 20, dc: 19 },
      { cr: 21, dc: 20 },
      { cr: 22, dc: 20 },
      { cr: 23, dc: 20 },
      { cr: 24, dc: 21 },
      { cr: 25, dc: 22 },
      { cr: 26, dc: 22 },
      { cr: 27, dc: 22 },
      { cr: 28, dc: 23 },
      { cr: 29, dc: 23 },
      { cr: 30, dc: 24 }
    ];

    // Find closest CR
    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDCTable) {
      const diff = Math.abs(entry.dc - dc);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return Math.floor(closestCR);
  }

  generateStatblockContent(): string {
    if (this.trapType === 'simple') {
      return this.generateSimpleStatblockContent();
    } else {
      return this.generateComplexStatblockContent();
    }
  }

  generateSimpleStatblockContent(): string {
    const element = this.elements[0];
    const homebrewSource = `Trap: ${this.trapName}`;

    let actionsContent = '';
    if (element) {
      let actionDesc = '';
      
      if (element.attack_bonus !== undefined) {
        const range = element.range || "reach 5 ft. or range 60 ft.";
        actionDesc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
      }
      
      if (element.save_dc !== undefined) {
        actionDesc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
      }
      
      if (element.damage) {
        if (element.attack_bonus !== undefined) {
          actionDesc += `Hit: ${element.damage} damage. `;
        } else if (element.save_dc !== undefined) {
          // Use custom success/failure text if provided
          if (element.on_failure) {
            actionDesc += `On a failed save: ${element.on_failure} `;
          } else {
            actionDesc += `On a failed save: ${element.damage} damage`;
            if (element.on_success) {
              actionDesc += `, ${element.on_success} `;
            } else {
              actionDesc += `, or half as much damage on a successful one. `;
            }
          }
        }
      } else if (element.save_dc && (element.on_failure || element.on_success)) {
        // No damage but has success/failure effects
        if (element.on_failure) {
          actionDesc += `On a failed save: ${element.on_failure} `;
        }
        if (element.on_success) {
          actionDesc += `On a successful save: ${element.on_success} `;
        }
      }
      
      if (element.additional_damage) {
        actionDesc += `Additional: ${element.additional_damage}. `;
      }
      
      if (element.effect) {
        actionDesc += element.effect;
      }

      actionsContent = `actions:
  - name: "${element.name || "Trap Effect"}"
    desc: "${actionDesc}"`;
    }

    let traitsContent = '';
    if (this.countermeasures.length > 0) {
      traitsContent = 'traits:\n';
      for (const cm of this.countermeasures) {
        const dcText = cm.dc ? ` (DC ${cm.dc})` : '';
        const checksText = cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : '';
        const traitDesc = `${cm.description || cm.method}${dcText}${checksText} ${cm.effect || ''}`;
        traitsContent += `  - name: "Countermeasure: ${cm.method}"\n    desc: "${traitDesc}"\n`;
      }
    }

    return `\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName}"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 50
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: ${this.calculateTrapCR()}
${traitsContent}${actionsContent}
\`\`\``;
  }

  generateComplexStatblockContent(): string {
    const homebrewSource = `Trap: ${this.trapName}`;
    let statblockContent = '';

    // Group elements by initiative
    const byInitiative = new Map<number, TrapElement[]>();
    const constantElements: TrapElement[] = [];
    const dynamicElements: TrapElement[] = [];

    for (const element of this.elements) {
      if (element.element_type === 'constant') {
        constantElements.push(element);
      } else if (element.element_type === 'dynamic') {
        dynamicElements.push(element);
      } else if (element.initiative !== undefined) {
        if (!byInitiative.has(element.initiative)) {
          byInitiative.set(element.initiative, []);
        }
        byInitiative.get(element.initiative)!.push(element);
      }
    }

    // Create statblock for each initiative
    const sortedInits = Array.from(byInitiative.keys()).sort((a, b) => b - a);
    for (const initiative of sortedInits) {
      const elements = byInitiative.get(initiative)!;
      
      let actionsContent = '';
      if (elements.length > 0) {
        actionsContent = 'actions:\n';
        for (const element of elements) {
          let actionDesc = '';
          
          if (element.attack_bonus !== undefined) {
            const range = element.range || "reach 5 ft. or range 60 ft.";
            actionDesc += `Melee or Ranged Weapon Attack: +${element.attack_bonus} to hit, ${range}, one target. `;
          }
          
          if (element.save_dc !== undefined) {
            actionDesc += `DC ${element.save_dc} ${element.save_ability || "DEX"} saving throw. `;
          }
          
          if (element.damage) {
            if (element.attack_bonus !== undefined) {
              actionDesc += `Hit: ${element.damage} damage. `;
            } else if (element.save_dc !== undefined) {
              // Use custom success/failure text if provided
              if (element.on_failure) {
                actionDesc += `On a failed save: ${element.on_failure} `;
              } else {
                actionDesc += `On a failed save: ${element.damage} damage`;
                if (element.on_success) {
                  actionDesc += `, ${element.on_success} `;
                } else {
                  actionDesc += `, or half as much damage on a successful one. `;
                }
              }
            }
          } else if (element.save_dc && (element.on_failure || element.on_success)) {
            // No damage but has success/failure effects
            if (element.on_failure) {
              actionDesc += `On a failed save: ${element.on_failure} `;
            }
            if (element.on_success) {
              actionDesc += `On a successful save: ${element.on_success} `;
            }
          }
          
          if (element.additional_damage) {
            actionDesc += `Additional: ${element.additional_damage}. `;
          }
          
          if (element.effect) {
            actionDesc += element.effect;
          }

          actionsContent += `  - name: "${element.name || "Effect"}"\n    desc: "${actionDesc}"\n`;
        }
      }

      const traitsContent = `traits:
  - name: "Fixed Initiative"
    desc: "This trap element acts on initiative count ${initiative}. Do not roll initiative for this creature."
`;

      statblockContent += `\n\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName} (Initiative ${initiative})"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 1
modifier: ${initiative}
initiative: ${initiative}
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: 0
${traitsContent}${actionsContent}\`\`\`\n`;
    }

    // Add constant effects statblock
    if (constantElements.length > 0) {
      let traitsContent = 'traits:\n';
      for (const element of constantElements) {
        traitsContent += `  - name: "${element.name || "Constant Effect"}"\n    desc: "${element.effect || ""}"\n`;
      }

      statblockContent += `\n\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName} (Constant)"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 1
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: 0
${traitsContent}\`\`\`\n`;
    }

    // Add dynamic effects statblock
    if (dynamicElements.length > 0) {
      let traitsContent = 'traits:\n';
      for (const element of dynamicElements) {
        const traitDesc = `${element.condition ? 'Condition: ' + element.condition + '. ' : ''}${element.effect || ''}`;
        traitsContent += `  - name: "${element.name || "Dynamic Effect"}"\n    desc: "${traitDesc}"\n`;
      }

      statblockContent += `\n\`\`\`statblock
layout: Basic 5e Layout
source: "${homebrewSource}"
name: "${this.trapName} (Dynamic)"
type: trap
size: Large
alignment: unaligned
ac: 15
hp: 1
speed: "0 ft."
stats: [10, 10, 10, 10, 10, 10]
senses: "—"
languages: "—"
cr: 0
${traitsContent}\`\`\`\n`;
    }

    // Add countermeasures to first statblock or as separate section
    if (this.countermeasures.length > 0) {
      statblockContent += '\n## Countermeasures\n\n';
      for (const cm of this.countermeasures) {
        const dcText = cm.dc ? ` (DC ${cm.dc})` : '';
        const checksText = cm.checks_needed && cm.checks_needed > 1 ? ` Requires ${cm.checks_needed} successful checks.` : '';
        const cmDesc = `${cm.description || cm.method}${dcText}${checksText} ${cm.effect || ''}`;
        statblockContent += `- **${cm.method}:** ${cmDesc}\n`;
      }
    }

    return statblockContent;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}