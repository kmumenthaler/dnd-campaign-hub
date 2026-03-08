import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { EncounterBuilder, EncounterCreature } from "./EncounterBuilder";
import { RenameCreatureModal } from "../utils/CreatureModals";
import { MarkerDefinition, CreatureSize } from "../marker/MarkerTypes";

export class EncounterBuilderModal extends Modal {
  plugin: DndCampaignHubPlugin;
  encounterBuilder: EncounterBuilder;
  encounterName = "";
  creatures: EncounterCreature[] = [];
  includeParty = true;
  selectedPartyMembers: string[] = [];  // Selected party member names
  selectedPartyId = "";
  selectedPartyName = "";
  useColorNames = false;
  adventurePath = "";
  scenePath = "";
  campaignPath = "";
  
  // For editing existing encounters
  isEdit = false;
  originalEncounterPath = "";
  
  // UI containers
  creatureListContainer: HTMLElement | null = null;
  difficultyContainer: HTMLElement | null = null;
  partySelectionContainer: HTMLElement | null = null;
  partyMemberListContainer: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, encounterPath?: string) {
    super(app);
    this.plugin = plugin;
    this.encounterBuilder = new EncounterBuilder(app, plugin);
    if (encounterPath) {
      this.isEdit = true;
      this.originalEncounterPath = encounterPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // If editing, load existing encounter data
    if (this.isEdit) {
      await this.loadEncounterData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "⚔️ Edit Encounter" : "⚔️ Create New Encounter" });

    // Encounter Name
    new Setting(contentEl)
      .setName("Encounter Name")
      .setDesc("Give this encounter a memorable name")
      .addText((text) =>
        text
          .setPlaceholder("Goblin Ambush")
          .setValue(this.encounterName)
          .onChange((value) => {
            this.encounterName = value;
          })
      );

    // Include Party
    new Setting(contentEl)
      .setName("Include Party Members")
      .setDesc("Select party members to include in the encounter")
      .addToggle((toggle) =>
        toggle
          .setValue(this.includeParty)
          .onChange(async (value) => {
            this.includeParty = value;
            await this.renderPartySelection();
            this.updateDifficultyDisplay();
          })
      );

    // Party Selection Container
    this.partySelectionContainer = contentEl.createDiv();
    this.partySelectionContainer.style.marginBottom = "15px";
    await this.renderPartySelection();

    // Party Member List Container
    this.partyMemberListContainer = contentEl.createDiv({ cls: "dnd-party-member-list" });
    this.partyMemberListContainer.style.marginBottom = "15px";
    await this.renderPartyMemberList();

    // Use Color Names
    new Setting(contentEl)
      .setName("Use Color Names")
      .setDesc("Add color suffixes to creatures (e.g., 'Goblin Red', 'Goblin Blue')")
      .addToggle((toggle) =>
        toggle
          .setValue(this.useColorNames)
          .onChange((value) => {
            this.useColorNames = value;
          })
      );

    // Creatures Section
    contentEl.createEl("h3", { text: "Creatures" });
    
    // Creature list container
    this.creatureListContainer = contentEl.createDiv({ cls: "dnd-creature-list" });
    this.renderCreatureList();
    
    // Show creature input fields
    await this.showCreatureInputFields(contentEl);

    // Difficulty Display Section
    contentEl.createEl("h3", { text: "Encounter Difficulty" });
    this.difficultyContainer = contentEl.createDiv({ cls: "dnd-difficulty-container" });
    await this.updateDifficultyDisplay();

    // Action Buttons (placed at the end after all content)
    const buttonContainer = new Setting(contentEl);
    
    buttonContainer.addButton((button) =>
      button
        .setButtonText(this.isEdit ? "Update Encounter" : "Create Encounter")
        .setCta()
        .onClick(() => {
          this.saveEncounter();
        })
    );

    if (this.isEdit) {
      buttonContainer.addButton((button) =>
        button
          .setButtonText("Delete Encounter")
          .setWarning()
          .onClick(() => {
            this.deleteEncounter();
          })
      );
    }
  }

  async loadEncounterData() {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.originalEncounterPath);
      if (!(file instanceof TFile)) return;

      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      
      if (cache?.frontmatter) {
        this.encounterName = cache.frontmatter.name || "";
        this.includeParty = cache.frontmatter.include_party !== false;
        this.useColorNames = cache.frontmatter.use_color_names || false;
        this.adventurePath = cache.frontmatter.adventure_path || "";
        this.scenePath = cache.frontmatter.scene_path || "";
        this.campaignPath = cache.frontmatter.campaign_path || "";
        this.selectedPartyId = cache.frontmatter.selected_party_id || "";
        this.selectedPartyName = cache.frontmatter.selected_party_name || "";
        if (!this.selectedPartyId && this.selectedPartyName) {
          this.selectedPartyId = this.selectedPartyName;
        }
        
        // Load creatures
        if (cache.frontmatter.creatures && Array.isArray(cache.frontmatter.creatures)) {
          this.creatures = cache.frontmatter.creatures.map((c: any) => ({
            name: c.name || "",
            count: c.count || 1,
            hp: c.hp,
            ac: c.ac,
            cr: c.cr,
            source: c.source,
            path: c.path,
            isFriendly: c.is_friendly === true || c.is_friendly === "true",
            isHidden: c.is_hidden === true || c.is_hidden === "true"
          }));
        }
      }

      this.syncEncounterBuilder();
    } catch (error) {
      console.error("Error loading encounter data:", error);
      new Notice("Error loading encounter data");
    }
  }

  syncEncounterBuilder() {
    this.encounterBuilder.encounterName = this.encounterName;
    this.encounterBuilder.creatures = [...this.creatures];
    this.encounterBuilder.includeParty = this.includeParty;
    this.encounterBuilder.useColorNames = this.useColorNames;
    this.encounterBuilder.selectedPartyMembers = [...this.selectedPartyMembers];
    this.encounterBuilder.selectedPartyId = this.selectedPartyId || "";
    this.encounterBuilder.adventurePath = this.adventurePath;
    this.encounterBuilder.scenePath = this.scenePath;
    this.encounterBuilder.campaignPath = this.campaignPath;
  }

  async renderPartySelection() {
    if (!this.partySelectionContainer) return;
    this.partySelectionContainer.empty();

    if (!this.includeParty) return;

    try {
      this.syncEncounterBuilder();
      const parties = await this.encounterBuilder.getAvailableParties();

      if (parties.length === 0) {
        this.partySelectionContainer.createEl("p", {
          text: "⚠️ No parties found in Initiative Tracker",
          attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" }
        });
        return;
      }

      if (!this.selectedPartyId) {
        const defaultParty = await this.encounterBuilder.getResolvedParty();
        if (defaultParty?.id) this.selectedPartyId = defaultParty.id;
        if (defaultParty?.name) this.selectedPartyName = defaultParty.name;
      }

      const partySetting = new Setting(this.partySelectionContainer)
        .setName("Party")
        .setDesc("Choose which party to use for difficulty calculations");

      partySetting.addDropdown((dropdown) => {
        parties.forEach(party => {
          dropdown.addOption(party.id, party.name);
        });
        dropdown.setValue(this.selectedPartyId || parties[0]!.id);
        dropdown.onChange((value) => {
          this.selectedPartyId = value;
          const selected = parties.find(p => p.id === value);
          this.selectedPartyName = selected?.name || "";
          this.selectedPartyMembers = [];
        });
      });

      partySetting.addButton((button) =>
        button
          .setButtonText("Apply Party")
          .onClick(async () => {
            await this.renderPartySelection();
            await this.renderPartyMemberList();
            this.updateDifficultyDisplay();
          })
      );

      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      
      if (partyMembers.length === 0) {
        this.partySelectionContainer.createEl("p", {
          text: "⚠️ No party members found in Initiative Tracker",
          attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" }
        });
        return;
      }

      const selectionDiv = this.partySelectionContainer.createDiv();
      selectionDiv.style.border = "1px solid var(--background-modifier-border)";
      selectionDiv.style.padding = "10px";
      selectionDiv.style.borderRadius = "5px";
      selectionDiv.style.marginBottom = "10px";

      selectionDiv.createEl("h4", { text: "Select Party Members", attr: { style: "margin-top: 0;" } });

      for (const member of partyMembers) {
        const checkboxDiv = selectionDiv.createDiv();
        checkboxDiv.style.marginBottom = "5px";

        const checkbox = checkboxDiv.createEl("input", { type: "checkbox" });
        checkbox.checked = this.selectedPartyMembers.includes(member.name);
        checkbox.style.marginRight = "10px";
        checkbox.onchange = () => {
          if (checkbox.checked) {
            if (!this.selectedPartyMembers.includes(member.name)) {
              this.selectedPartyMembers.push(member.name);
            }
          } else {
            this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== member.name);
          }
          this.renderPartyMemberList();
          this.updateDifficultyDisplay();
        };

        const label = checkboxDiv.createEl("span", { 
          text: `${member.name} (Level ${member.level}, HP: ${member.hp}, AC: ${member.ac})`
        });
        label.style.cursor = "pointer";
        label.onclick = () => {
          checkbox.checked = !checkbox.checked;
          checkbox.onchange?.(new Event('change'));
        };
      }

      // Select All / Deselect All / Refresh buttons
      const buttonsDiv = selectionDiv.createDiv();
      buttonsDiv.style.marginTop = "10px";
      buttonsDiv.style.display = "flex";
      buttonsDiv.style.gap = "10px";

      const selectAllBtn = buttonsDiv.createEl("button", { text: "Select All" });
      selectAllBtn.style.fontSize = "0.85em";
      selectAllBtn.onclick = () => {
        this.selectedPartyMembers = partyMembers.map(m => m.name);
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      };

      const deselectAllBtn = buttonsDiv.createEl("button", { text: "Deselect All" });
      deselectAllBtn.style.fontSize = "0.85em";
      deselectAllBtn.onclick = () => {
        this.selectedPartyMembers = [];
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      };

      const refreshBtn = buttonsDiv.createEl("button", { text: "🔄 Refresh Stats" });
      refreshBtn.style.fontSize = "0.85em";
      refreshBtn.title = "Reload party stats from Initiative Tracker";
      refreshBtn.onclick = async () => {
        const success = await this.encounterBuilder.refreshPartyData();
        if (success) {
          this.renderPartySelection();
          this.renderPartyMemberList();
          this.updateDifficultyDisplay();
        }
      };
    } catch (error) {
      console.error("Error rendering party selection:", error);
    }
  }

  async renderPartyMemberList() {
    if (!this.partyMemberListContainer) return;
    this.partyMemberListContainer.empty();

    if (!this.includeParty || this.selectedPartyMembers.length === 0) {
      return;
    }

    try {
      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      const memberByName = new Map(partyMembers.map(m => [m.name, m]));

      const headerDiv = this.partyMemberListContainer.createDiv({ cls: "dnd-party-member-header" });
      headerDiv.style.marginBottom = "10px";
      headerDiv.style.fontWeight = "600";
      headerDiv.setText(`Selected Party Members (${this.selectedPartyMembers.length})`);

      for (const memberName of this.selectedPartyMembers) {
        const memberData = memberByName.get(memberName);
        if (!memberData) continue;

        const memberItem = this.partyMemberListContainer.createDiv({ cls: "dnd-creature-item" });
        
        const nameEl = memberItem.createSpan({ cls: "dnd-creature-name" });
        nameEl.setText(memberName);
        
        const statsEl = memberItem.createSpan({ cls: "dnd-creature-stats" });
        const stats: string[] = [];
        stats.push(`Level: ${memberData.level}`);
        stats.push(`HP: ${memberData.hp}`);
        stats.push(`AC: ${memberData.ac}`);
        statsEl.setText(` | ${stats.join(" | ")}`);
        
        const removeBtn = memberItem.createEl("button", {
          text: "Remove",
          cls: "dnd-creature-remove"
        });
        removeBtn.addEventListener("click", () => {
          this.removePartyMember(memberName);
        });
      }
    } catch (error) {
      console.error("Error rendering party member list:", error);
    }
  }

  removePartyMember(memberName: string) {
    this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== memberName);
    this.renderPartySelection();
    this.renderPartyMemberList();
    this.updateDifficultyDisplay();
  }

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getAvailablePartyMembers();
  }

  async showCreatureInputFields(container: HTMLElement) {
    // === VAULT CREATURE SELECTION ===
    const vaultCreatureSection = container.createDiv({ cls: "dnd-add-creature-vault" });
    
    let selectedCreature: { name: string; path: string; hp: number; ac: number; cr?: string } | null = null;
    let vaultCreatureCount = "1";
    let vaultCreatureIsFriendly = false;
    let vaultCreatureIsHidden = false;
    let searchResults: HTMLElement | null = null;
    let friendlyCheckbox: HTMLInputElement;
    let hiddenCheckbox: HTMLInputElement;
    
    // Load creatures from vault
    this.syncEncounterBuilder();
    const vaultCreatures = await this.encounterBuilder.loadAllCreatures();
    
    
    if (vaultCreatures.length > 0) {
      const vaultCreatureSetting = new Setting(vaultCreatureSection)
        .setName("Add from Vault")
        .setDesc(`Search and select creatures from your vault (${vaultCreatures.length} available)`);
      
      // Create search input container
      const searchContainer = vaultCreatureSetting.controlEl.createDiv({ cls: "dnd-creature-search-container" });
      
      const searchInput = searchContainer.createEl("input", {
        type: "text",
        placeholder: "Search creatures...",
        cls: "dnd-creature-search-input"
      });
      
      // Search results container
      searchResults = searchContainer.createDiv({ cls: "dnd-creature-search-results" });
      searchResults.style.display = "none";
      
      // Filter and display results
      const showSearchResults = (query: string) => {
        if (!searchResults) return;
        
        if (!query || query.length < 1) {
          searchResults.style.display = "none";
          return;
        }
        
        const queryLower = query.toLowerCase().trim();
        
        const filtered = vaultCreatures.filter(c => {
          return c.name.toLowerCase().includes(queryLower);
        }).slice(0, 10); // Limit to 10 results
        
        searchResults.empty();
        
        if (filtered.length === 0) {
          searchResults.createEl("div", {
            text: "No creatures found",
            cls: "dnd-creature-search-no-results"
          });
          searchResults.style.display = "block";
          return;
        }
        
        filtered.forEach(creature => {
          const resultEl = searchResults!.createDiv({ cls: "dnd-creature-search-result" });
          
          const nameEl = resultEl.createDiv({ cls: "dnd-creature-search-result-name" });
          nameEl.setText(creature.name);
          
          const statsEl = resultEl.createDiv({ cls: "dnd-creature-search-result-stats" });
          const statsParts: string[] = [];
          if (creature.cr) statsParts.push(`CR ${creature.cr}`);
          statsParts.push(`HP ${creature.hp}`);
          statsParts.push(`AC ${creature.ac}`);
          statsEl.setText(statsParts.join(" | "));
          
          resultEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedCreature = creature;
            searchInput.value = creature.name;
            if (searchResults) {
              searchResults.style.display = "none";
            }
          });
        });
        
        searchResults.style.display = "block";
      };
      
      // Search input events
      searchInput.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        showSearchResults(target.value);
      });
      
      searchInput.addEventListener("focus", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value.length >= 1) {
          showSearchResults(target.value);
        }
      });
      
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && selectedCreature) {
          e.preventDefault();
          // Add creature
          this.creatures.push({
            name: selectedCreature.name,
            count: parseInt(vaultCreatureCount) || 1,
            hp: selectedCreature.hp,
            ac: selectedCreature.ac,
            cr: selectedCreature.cr,
            source: "vault",
            path: selectedCreature.path,
            isCustom: false,
            isFriendly: vaultCreatureIsFriendly,
            isHidden: vaultCreatureIsHidden
          });
          this.renderCreatureList();
          this.updateDifficultyDisplay();
          new Notice(`Added ${vaultCreatureCount}x ${selectedCreature.name}`);
          searchInput.value = "";
          selectedCreature = null;
          vaultCreatureIsFriendly = false;
          vaultCreatureIsHidden = false;
          // Reset checkboxes (they're created later but will exist when this callback runs)
          setTimeout(() => {
            const friendlyCheckbox = searchInput.closest('.setting-item')?.querySelector('.dnd-inline-checkbox input[type=\"checkbox\"]') as HTMLInputElement;
            const hiddenCheckbox = searchInput.closest('.setting-item')?.querySelectorAll('.dnd-inline-checkbox input[type=\"checkbox\"]')[1] as HTMLInputElement;
            if (friendlyCheckbox) friendlyCheckbox.checked = false;
            if (hiddenCheckbox) hiddenCheckbox.checked = false;
          }, 0);
        }
      });
      
      // Close search results when clicking outside
      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (searchResults) {
            searchResults.style.display = "none";
          }
        }, 250);
      });
      
      // Count input
      vaultCreatureSetting.addText(text => {
        text.setPlaceholder("Count")
          .setValue("1")
          .onChange(value => vaultCreatureCount = value);
        text.inputEl.type = "number";
        text.inputEl.style.width = "60px";
      });
      
      // Friendly checkbox container
      const friendlyContainer = vaultCreatureSetting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
      friendlyContainer.style.display = "inline-flex";
      friendlyContainer.style.alignItems = "center";
      friendlyContainer.style.marginLeft = "8px";
      
      friendlyCheckbox = friendlyContainer.createEl("input", { type: "checkbox" });
      friendlyCheckbox.style.marginRight = "4px";
      friendlyCheckbox.addEventListener("change", (e) => {
        vaultCreatureIsFriendly = (e.target as HTMLInputElement).checked;
      });
      
      const friendlyLabel = friendlyContainer.createEl("label");
      friendlyLabel.setText("Friendly");
      friendlyLabel.style.fontSize = "13px";
      friendlyLabel.style.cursor = "pointer";
      friendlyLabel.addEventListener("click", () => {
        friendlyCheckbox.checked = !friendlyCheckbox.checked;
        vaultCreatureIsFriendly = friendlyCheckbox.checked;
      });
      
      // Hidden checkbox container
      const hiddenContainer = vaultCreatureSetting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
      hiddenContainer.style.display = "inline-flex";
      hiddenContainer.style.alignItems = "center";
      hiddenContainer.style.marginLeft = "8px";
      
      hiddenCheckbox = hiddenContainer.createEl("input", { type: "checkbox" });
      hiddenCheckbox.style.marginRight = "4px";
      hiddenCheckbox.addEventListener("change", (e) => {
        vaultCreatureIsHidden = (e.target as HTMLInputElement).checked;
      });
      
      const hiddenLabel = hiddenContainer.createEl("label");
      hiddenLabel.setText("Hidden");
      hiddenLabel.style.fontSize = "13px";
      hiddenLabel.style.cursor = "pointer";
      hiddenLabel.addEventListener("click", () => {
        hiddenCheckbox.checked = !hiddenCheckbox.checked;
        vaultCreatureIsHidden = hiddenCheckbox.checked;
      });
      
      // Add button
      vaultCreatureSetting.addButton(btn => btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => {
          if (!selectedCreature) {
            new Notice("Please search and select a creature first!");
            return;
          }
          
          this.creatures.push({
            name: selectedCreature.name,
            count: parseInt(vaultCreatureCount) || 1,
            hp: selectedCreature.hp,
            ac: selectedCreature.ac,
            cr: selectedCreature.cr,
            source: "vault",
            path: selectedCreature.path,
            isCustom: false,
            isFriendly: vaultCreatureIsFriendly,
            isHidden: vaultCreatureIsHidden
          });
          
          this.renderCreatureList();
          this.updateDifficultyDisplay();
          new Notice(`Added ${vaultCreatureCount}x ${selectedCreature.name}`);
          
          // Clear search and reset checkboxes
          searchInput.value = "";
          selectedCreature = null;
          vaultCreatureIsFriendly = false;
          vaultCreatureIsHidden = false;
          friendlyCheckbox.checked = false;
          hiddenCheckbox.checked = false;
        }));
    } else {
      vaultCreatureSection.createEl("p", {
        text: "⚠️ No creatures found in z_Beastiarity folder. Use manual entry below.",
        cls: "setting-item-description mod-warning"
      });
    }
    
    // === MANUAL CREATURE ENTRY ===
    const addCreatureSection = container.createDiv({ cls: "dnd-add-creature-manual" });
    
    let newCreatureName = "";
    let newCreatureCount = "1";
    let newCreatureHP = "";
    let newCreatureAC = "";
    let newCreatureCR = "";
    let newCreatureIsFriendly = false;
    let newCreatureIsHidden = false;
    
    const addCreatureSetting = new Setting(addCreatureSection)
      .setName("Add Custom Creature")
      .setDesc("Enter creature details manually for custom or homebrew enemies");
    
    // Creature name input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Name (e.g., Goblin)")
        .onChange(value => newCreatureName = value);
      text.inputEl.style.width = "120px";
    });
    
    // Count input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Count")
        .setValue("1")
        .onChange(value => newCreatureCount = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // HP input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("HP")
        .onChange(value => newCreatureHP = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // AC input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("AC")
        .onChange(value => newCreatureAC = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // CR input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("CR")
        .onChange(value => newCreatureCR = value);
      text.inputEl.style.width = "60px";
    });
    
    // Friendly checkbox container
    const manualFriendlyContainer = addCreatureSetting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
    manualFriendlyContainer.style.display = "inline-flex";
    manualFriendlyContainer.style.alignItems = "center";
    manualFriendlyContainer.style.marginLeft = "8px";
    
    const manualFriendlyCheckbox = manualFriendlyContainer.createEl("input", { type: "checkbox" });
    manualFriendlyCheckbox.style.marginRight = "4px";
    manualFriendlyCheckbox.addEventListener("change", (e) => {
      newCreatureIsFriendly = (e.target as HTMLInputElement).checked;
    });
    
    const manualFriendlyLabel = manualFriendlyContainer.createEl("label");
    manualFriendlyLabel.setText("Friendly");
    manualFriendlyLabel.style.fontSize = "13px";
    manualFriendlyLabel.style.cursor = "pointer";
    manualFriendlyLabel.addEventListener("click", () => {
      manualFriendlyCheckbox.checked = !manualFriendlyCheckbox.checked;
      newCreatureIsFriendly = manualFriendlyCheckbox.checked;
    });
    
    // Hidden checkbox container
    const manualHiddenContainer = addCreatureSetting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
    manualHiddenContainer.style.display = "inline-flex";
    manualHiddenContainer.style.alignItems = "center";
    manualHiddenContainer.style.marginLeft = "8px";
    
    const manualHiddenCheckbox = manualHiddenContainer.createEl("input", { type: "checkbox" });
    manualHiddenCheckbox.style.marginRight = "4px";
    manualHiddenCheckbox.addEventListener("change", (e) => {
      newCreatureIsHidden = (e.target as HTMLInputElement).checked;
    });
    
    const manualHiddenLabel = manualHiddenContainer.createEl("label");
    manualHiddenLabel.setText("Hidden");
    manualHiddenLabel.style.fontSize = "13px";
    manualHiddenLabel.style.cursor = "pointer";
    manualHiddenLabel.addEventListener("click", () => {
      manualHiddenCheckbox.checked = !manualHiddenCheckbox.checked;
      newCreatureIsHidden = manualHiddenCheckbox.checked;
    });
    
    // Add button
    addCreatureSetting.addButton(btn => btn
      .setButtonText("Add")
      .setCta()
      .onClick(() => {
        if (!newCreatureName.trim()) {
          new Notice("Please enter a creature name!");
          return;
        }
        
        this.creatures.push({
          name: newCreatureName.trim(),
          count: parseInt(newCreatureCount) || 1,
          hp: newCreatureHP ? parseInt(newCreatureHP) : undefined,
          ac: newCreatureAC ? parseInt(newCreatureAC) : undefined,
          cr: newCreatureCR || undefined,
          source: "manual",
          path: undefined,
          isCustom: true,
          isFriendly: newCreatureIsFriendly,
          isHidden: newCreatureIsHidden
        });
        
        this.renderCreatureList();
        this.updateDifficultyDisplay();
        new Notice(`Added ${newCreatureCount}x ${newCreatureName}`);
        
        // Reset all input fields
        newCreatureName = "";
        newCreatureCount = "1";
        newCreatureHP = "";
        newCreatureAC = "";
        newCreatureCR = "";
        newCreatureIsFriendly = false;
        newCreatureIsHidden = false;
        manualFriendlyCheckbox.checked = false;
        manualHiddenCheckbox.checked = false;
      }));
    
    // Info text
    container.createEl("p", {
      text: "💡 Tip: Select creatures from your vault or add custom enemies on the fly. You can edit stats later in Initiative Tracker.",
      cls: "setting-item-description"
    });
  }

  removeCreature(index: number) {
    this.creatures.splice(index, 1);
    this.renderCreatureList();
    this.updateDifficultyDisplay();
  }

  /**
   * Rename a creature by creating a copy of its vault note (and map token) under a new name.
   * The original creature entry is replaced with the copy. Count is preserved.
   */
  async renameCreature(index: number) {
    const creature = this.creatures[index];
    if (!creature) return;

    const modal = new RenameCreatureModal(this.app, creature.name, async (newName: string) => {
      try {
        // Determine the beastiaryPath — first existing folder wins
        const possiblePaths = ["z_Beastiarity", "My Vault/z_Beastiarity"];
        let beastiaryPath = "z_Beastiarity";
        for (const p of possiblePaths) {
          if (this.app.vault.getAbstractFileByPath(p) instanceof TFolder) {
            beastiaryPath = p;
            break;
          }
        }

        const newFilePath = `${beastiaryPath}/${newName}.md`;

        // Check if a creature with the new name already exists
        if (await this.app.vault.adapter.exists(newFilePath)) {
          new Notice(`A creature named "${newName}" already exists! Using existing file.`);
          // Point the encounter entry at the existing file
          const existingFile = this.app.vault.getAbstractFileByPath(newFilePath);
          if (existingFile instanceof TFile) {
            const cache = this.app.metadataCache.getFileCache(existingFile);
            creature.name = newName;
            creature.path = newFilePath;
            creature.source = "vault";
            creature.isCustom = false;
            // Pick up stats from the existing file if available
            if (cache?.frontmatter) {
              if (cache.frontmatter.hp) creature.hp = parseInt(cache.frontmatter.hp) || creature.hp;
              if (cache.frontmatter.ac) creature.ac = parseInt(cache.frontmatter.ac) || creature.ac;
              if (cache.frontmatter.cr) creature.cr = cache.frontmatter.cr?.toString() || creature.cr;
            }
          }
          this.renderCreatureList();
          this.updateDifficultyDisplay();
          return;
        }

        // --- Build the new creature file content ---
        let newContent: string | null = null;
        let sourceTokenId: string | undefined;

        if (creature.path && creature.path !== "[SRD]") {
          // ── Vault creature: read and patch the original file ──
          const originalFile = this.app.vault.getAbstractFileByPath(creature.path);
          if (originalFile instanceof TFile) {
            const fileContent = await this.app.vault.read(originalFile);
            const cache = this.app.metadataCache.getFileCache(originalFile);
            sourceTokenId = cache?.frontmatter?.token_id;

            // Replace name in frontmatter and statblock code block
            newContent = fileContent
              .replace(/^name:\s*.+$/m, `name: ${newName}`)
              .replace(/^creature:\s*.+$/m, `creature: ${newName}`);
          }
        }

        if (!newContent && creature.path === "[SRD]") {
          // ── SRD creature: read full data from Fantasy Statblocks bestiary ──
          const statblocksPlugin = (this.app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
          let monsterData: any = null;

          if (statblocksPlugin) {
            // Try API first
            if (statblocksPlugin.api?.getBestiaryCreatures) {
              const all = statblocksPlugin.api.getBestiaryCreatures();
              if (Array.isArray(all)) {
                monsterData = all.find((m: any) => m.name === creature.name);
              }
            }
            // Fallback: data.bestiary / data.monsters
            if (!monsterData) {
              const src = statblocksPlugin.data?.bestiary || statblocksPlugin.data?.monsters;
              if (Array.isArray(src)) {
                monsterData = src.find((m: any) => m.name === creature.name);
              }
            }
          }

          if (monsterData) {
            newContent = this.buildCreatureFileFromStatblock(newName, monsterData);
          }
        }

        // ── Fallback: create a minimal creature file from encounter stats ──
        if (!newContent) {
          newContent = this.buildMinimalCreatureFile(newName, creature);
        }

        // --- Generate a new token_id and create the MarkerDefinition ---
        const newTokenId = this.plugin.markerLibrary.generateId();

        // Try to copy the source marker's visual properties
        let existingMarker: MarkerDefinition | undefined;
        if (sourceTokenId) {
          existingMarker = this.plugin.markerLibrary.getMarker(sourceTokenId);
        }
        // Fallback: search by creature name
        if (!existingMarker) {
          existingMarker = this.plugin.markerLibrary.getAllMarkers().find(
            (m: MarkerDefinition) => m.name.toLowerCase() === creature.name.toLowerCase() && m.type === 'creature'
          );
        }

        const now = Date.now();
        const tokenDef: MarkerDefinition = {
          ...(existingMarker ? { ...existingMarker } : {}),
          id: newTokenId,
          name: newName,
          type: existingMarker?.type || 'creature',
          icon: existingMarker?.icon || '',
          backgroundColor: existingMarker?.backgroundColor || '#8b0000',
          borderColor: existingMarker?.borderColor || '#ffffff',
          creatureSize: existingMarker?.creatureSize || 'medium',
          createdAt: now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);

        // Inject the new token_id into the file content
        if (newContent.includes("token_id:")) {
          newContent = newContent.replace(/^token_id:\s*.+$/m, `token_id: ${newTokenId}`);
        } else {
          // Insert token_id before the closing ---
          newContent = newContent.replace(/\n---\s*\n/, `\ntoken_id: ${newTokenId}\n---\n`);
        }

        // --- Create the new creature file ---
        await this.app.vault.create(newFilePath, newContent);

        // --- Save to Fantasy Statblocks bestiary ---
        try {
          const statblocksPlugin = (this.app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
          if (statblocksPlugin?.data?.bestiary) {
            // Parse the new file's frontmatter to build the bestiary entry
            const newFile = this.app.vault.getAbstractFileByPath(newFilePath);
            if (newFile instanceof TFile) {
              // Wait a moment for metadata cache to update
              await new Promise(resolve => setTimeout(resolve, 200));
              const cache = this.app.metadataCache.getFileCache(newFile);
              if (cache?.frontmatter) {
                const fm = cache.frontmatter;
                const statblock: any = {
                  name: newName,
                  size: fm.size || "Medium",
                  type: fm.type || "humanoid",
                  alignment: fm.alignment || "",
                  ac: parseInt(fm.ac) || 10,
                  hp: parseInt(fm.hp) || 1,
                  hit_dice: fm.hit_dice || "",
                  speed: fm.speed || "30 ft.",
                  stats: fm.stats || [10, 10, 10, 10, 10, 10],
                  cr: fm.cr?.toString() || "0",
                  source: "Homebrew"
                };
                statblocksPlugin.data.bestiary.push(statblock);
                await statblocksPlugin.saveSettings();
              }
            }
          }
        } catch (e) {
        }

        // --- Update the encounter creature entry ---
        const originalName = creature.name;
        creature.name = newName;
        creature.path = newFilePath;
        creature.source = "vault";
        creature.isCustom = false;
        // count, isFriendly, isHidden stay the same

        // Read stats back from the newly created file to ensure hp/ac/cr are set
        const createdFile = this.app.vault.getAbstractFileByPath(newFilePath);
        if (createdFile instanceof TFile) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const cache = this.app.metadataCache.getFileCache(createdFile);
          if (cache?.frontmatter) {
            const fm = cache.frontmatter;
            creature.hp = parseInt(fm.hp) || creature.hp;
            creature.ac = parseInt(fm.ac) || creature.ac;
            creature.cr = fm.cr?.toString() || creature.cr;
          }
        }

        this.renderCreatureList();
        this.updateDifficultyDisplay();
        new Notice(`✅ Renamed "${originalName}" → "${newName}" — creature note and map token created.`);
      } catch (error) {
        console.error("[Rename] Error renaming creature:", error);
        new Notice(`❌ Failed to rename creature: ${error}`);
      }
    });
    modal.open();
  }

  /**
   * Build a creature markdown file from Fantasy Statblocks bestiary data.
   */
  private buildCreatureFileFromStatblock(newName: string, monster: any): string {
    const stats = monster.stats || [10, 10, 10, 10, 10, 10];
    const calcMod = (score: number) => Math.floor((score - 10) / 2);

    let fm = `---\nstatblock: true\nlayout: Basic 5e Layout\nname: ${newName}\n`;
    fm += `size: ${monster.size || "Medium"}\n`;
    fm += `type: ${monster.type || "humanoid"}\n`;
    if (monster.subtype) fm += `subtype: ${monster.subtype}\n`;
    fm += `alignment: ${monster.alignment || ""}\n`;
    fm += `ac: ${monster.ac ?? 10}\n`;
    fm += `hp: ${monster.hp ?? 1}\n`;
    if (monster.hit_dice) fm += `hit_dice: ${monster.hit_dice}\n`;
    fm += `speed: ${monster.speed || "30 ft."}\n`;
    fm += `stats:\n`;
    for (const s of stats) fm += `  - ${s}\n`;
    fm += `fage_stats:\n`;
    for (const s of stats) fm += `  - ${calcMod(s)}\n`;

    // Saves
    if (Array.isArray(monster.saves) && monster.saves.length > 0) {
      fm += `saves:\n`;
      for (const save of monster.saves) {
        if (typeof save === 'object') {
          const key = Object.keys(save)[0];
          if (key) fm += `  - ${key}: ${save[key]}\n`;
        }
      }
    } else { fm += `saves:\n`; }

    // Skills
    if (Array.isArray(monster.skillsaves) && monster.skillsaves.length > 0) {
      fm += `skillsaves:\n`;
      for (const skill of monster.skillsaves) {
        if (typeof skill === 'object') {
          const key = Object.keys(skill)[0];
          if (key) fm += `  - ${key}: ${skill[key]}\n`;
        }
      }
    } else { fm += `skillsaves:\n`; }

    fm += `damage_vulnerabilities: ${monster.damage_vulnerabilities || ""}\n`;
    fm += `damage_resistances: ${monster.damage_resistances || ""}\n`;
    fm += `damage_immunities: ${monster.damage_immunities || ""}\n`;
    fm += `condition_immunities: ${monster.condition_immunities || ""}\n`;
    fm += `senses: ${monster.senses || ""}\n`;
    fm += `languages: ${monster.languages || ""}\n`;
    fm += `cr: ${monster.cr ?? "0"}\n`;
    fm += `spells:\n`;

    // Traits
    if (Array.isArray(monster.traits) && monster.traits.length > 0) {
      fm += `traits:\n`;
      for (const t of monster.traits) {
        if (t.name && t.desc) {
          fm += `  - name: ${t.name}\n    desc: "${String(t.desc).replace(/"/g, '\\"')}"\n`;
        }
      }
    } else { fm += `traits:\n`; }

    // Actions
    if (Array.isArray(monster.actions) && monster.actions.length > 0) {
      fm += `actions:\n`;
      for (const a of monster.actions) {
        if (a.name && a.desc) {
          fm += `  - name: ${a.name}\n    desc: "${String(a.desc).replace(/"/g, '\\"')}"\n`;
        }
      }
    } else { fm += `actions:\n`; }

    fm += `legendary_actions:\n`;
    if (Array.isArray(monster.legendary_actions) && monster.legendary_actions.length > 0) {
      for (const la of monster.legendary_actions) {
        if (la.name && la.desc) {
          fm += `  - name: ${la.name}\n    desc: "${String(la.desc).replace(/"/g, '\\"')}"\n`;
        }
      }
    }

    fm += `bonus_actions:\n`;
    fm += `reactions:\n`;
    if (Array.isArray(monster.reactions) && monster.reactions.length > 0) {
      for (const r of monster.reactions) {
        if (r.name && r.desc) {
          fm += `  - name: ${r.name}\n    desc: "${String(r.desc).replace(/"/g, '\\"')}"\n`;
        }
      }
    }

    fm += `token_id: PLACEHOLDER\n`;
    fm += `---\n\n`;

    fm += `${newName} creature description.\n`;
    fm += `\n\`\`\`statblock\ncreature: ${newName}\n\`\`\`\n`;

    return fm;
  }

  /**
   * Build a minimal creature markdown file from encounter stats (fallback).
   */
  private buildMinimalCreatureFile(newName: string, creature: EncounterCreature): string {
    let fm = `---\nstatblock: true\nlayout: Basic 5e Layout\nname: ${newName}\n`;
    fm += `size: Medium\ntype: humanoid\nalignment: ""\n`;
    fm += `ac: ${creature.ac ?? 10}\nhp: ${creature.hp ?? 1}\n`;
    fm += `speed: 30 ft.\n`;
    fm += `stats:\n  - 10\n  - 10\n  - 10\n  - 10\n  - 10\n  - 10\n`;
    fm += `fage_stats:\n  - 0\n  - 0\n  - 0\n  - 0\n  - 0\n  - 0\n`;
    fm += `saves:\nskillsaves:\n`;
    fm += `damage_vulnerabilities: ""\ndamage_resistances: ""\n`;
    fm += `damage_immunities: ""\ncondition_immunities: ""\n`;
    fm += `senses: ""\nlanguages: ""\n`;
    fm += `cr: ${creature.cr || "0"}\nspells:\ntraits:\nactions:\n`;
    fm += `legendary_actions:\nbonus_actions:\nreactions:\n`;
    fm += `token_id: PLACEHOLDER\n`;
    fm += `---\n\n`;
    fm += `${newName} creature description.\n`;
    fm += `\n\`\`\`statblock\ncreature: ${newName}\n\`\`\`\n`;
    return fm;
  }

  renderCreatureList() {
    if (!this.creatureListContainer) return;
    this.creatureListContainer.empty();

    if (this.creatures.length === 0) {
      this.creatureListContainer.createEl("p", {
        text: "No creatures added yet. Add creatures below.",
        cls: "setting-item-description"
      });
      return;
    }

    this.creatures.forEach((creature, index) => {
      const creatureItem = this.creatureListContainer!.createDiv({ 
        cls: `dnd-creature-item${creature.isFriendly ? ' friendly' : ''}` 
      });
      
      const nameEl = creatureItem.createSpan({ cls: "dnd-creature-name" });
      const friendlyIndicator = creature.isFriendly ? "🤝 " : "";
      const hiddenIndicator = creature.isHidden ? "👁️‍🗨️ " : "";
      nameEl.setText(`${friendlyIndicator}${hiddenIndicator}${creature.name} x${creature.count}`);
      
      const statsEl = creatureItem.createSpan({ cls: "dnd-creature-stats" });
      const stats: string[] = [];
      if (creature.hp) stats.push(`HP: ${creature.hp}`);
      if (creature.ac) stats.push(`AC: ${creature.ac}`);
      if (creature.cr) stats.push(`CR: ${creature.cr}`);
      if (creature.isFriendly) stats.push("🤝 Friendly");
      if (creature.isHidden) stats.push("👁️‍🗨️ Hidden");
      statsEl.setText(stats.length > 0 ? ` | ${stats.join(" | ")}` : "");
      
      // Friendly toggle button
      const friendlyBtn = creatureItem.createEl("button", {
        text: "Friendly",
        cls: `dnd-creature-friendly-toggle${creature.isFriendly ? ' active' : ''}`
      });
      friendlyBtn.addEventListener("click", () => {
        creature.isFriendly = !creature.isFriendly;
        this.renderCreatureList();
        this.updateDifficultyDisplay();
      });
      
      // Hidden toggle button
      const hiddenBtn = creatureItem.createEl("button", {
        text: "Hidden",
        cls: `dnd-creature-hidden-toggle${creature.isHidden ? ' active' : ''}`
      });
      hiddenBtn.addEventListener("click", () => {
        creature.isHidden = !creature.isHidden;
        this.renderCreatureList();
        this.updateDifficultyDisplay();
      });
      
      // Rename button — copy creature with a new name
      const renameBtn = creatureItem.createEl("button", {
        text: "✏️",
        cls: "dnd-creature-rename",
        attr: { title: "Rename (copy with new name)" }
      });
      renameBtn.addEventListener("click", () => {
        this.renameCreature(index);
      });
      
      const removeBtn = creatureItem.createEl("button", {
        text: "Remove",
        cls: "dnd-creature-remove"
      });
      removeBtn.addEventListener("click", () => {
        this.removeCreature(index);
      });
    });
  }

  async updateDifficultyDisplay() {
    if (!this.difficultyContainer) return;

    this.difficultyContainer.empty();

    if (this.creatures.length === 0) {
      this.difficultyContainer.createEl("p", {
        text: "Add creatures to see encounter difficulty analysis.",
        cls: "setting-item-description"
      });
      return;
    }

    const loadingEl = this.difficultyContainer.createEl("p", { text: "Calculating difficulty..." });

    this.syncEncounterBuilder();
    const result = await this.encounterBuilder.calculateEncounterDifficulty();

    loadingEl.remove();

    const difficultyCard = this.difficultyContainer.createDiv({ cls: "dnd-difficulty-card" });

    const header = difficultyCard.createDiv({ cls: "dnd-difficulty-header" });

    const difficultyBadge = header.createEl("span", {
      text: result.analysis.difficulty,
      cls: "dnd-difficulty-badge"
    });
    difficultyBadge.style.backgroundColor = result.analysis.difficultyColor;

    header.createEl("span", {
      text: ` ~${result.analysis.roundsToDefeatEnemies} round${result.analysis.roundsToDefeatEnemies !== 1 ? 's' : ''}`,
      cls: "dnd-rounds-estimate"
    });

    const statsGrid = difficultyCard.createDiv({ cls: "dnd-difficulty-stats-grid" });

    const partyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    partyCol.createEl("h5", { text: `⚔️ Party (${result.partyStats.memberCount})` });
    const partyStats = partyCol.createDiv();
    partyStats.innerHTML = `
      <div>HP Pool: <strong>${result.partyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.partyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.partyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.partyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.partyEffectiveDPR.toFixed(0)}</strong></div>
    `;

    const enemyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    enemyCol.createEl("h5", { text: `👹 Enemies (${result.enemyStats.creatureCount})` });
    const enemyStats = enemyCol.createDiv();
    enemyStats.innerHTML = `
      <div>HP Pool: <strong>${result.enemyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.enemyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.enemyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.enemyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.enemyEffectiveDPR.toFixed(0)}</strong></div>
    `;

    const analysisSummary = difficultyCard.createDiv({ cls: "dnd-difficulty-analysis" });

    const partyDamage3Rounds = result.analysis.partyEffectiveDPR * 3;
    const enemyDamage3Rounds = result.analysis.enemyEffectiveDPR * 3;
    const partyHPAfter3 = Math.max(0, result.partyStats.totalHP - enemyDamage3Rounds);
    const enemyHPAfter3 = Math.max(0, result.enemyStats.totalHP - partyDamage3Rounds);

    // Action economy display
    const partyAEMod = result.analysis.partyActionEconomyMod || 1.0;
    const enemyAEMod = result.analysis.enemyActionEconomyMod || 1.0;
    const actionEconomyInfo = partyAEMod !== 1.0 || enemyAEMod !== 1.0
      ? `<div style="margin-bottom: 8px; padding: 8px; background: var(--background-modifier-border); border-radius: 4px;">
          <strong>⚖️ Action Economy:</strong> 
          Party ${partyAEMod > 1 ? '✓' : partyAEMod < 1 ? '✗' : '='} 
          ${(partyAEMod * 100).toFixed(0)}% efficiency | 
          Enemies ${enemyAEMod > 1 ? '✓' : enemyAEMod < 1 ? '✗' : '='} 
          ${(enemyAEMod * 100).toFixed(0)}% efficiency
        </div>`
      : '';

    analysisSummary.innerHTML = `
      ${actionEconomyInfo}
      <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
      <div>Party deals: <strong>${partyDamage3Rounds.toFixed(0)}</strong> damage → Enemies at <strong>${enemyHPAfter3.toFixed(0)}</strong> HP (${((enemyHPAfter3 / result.enemyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div>Enemies deal: <strong>${enemyDamage3Rounds.toFixed(0)}</strong> damage → Party at <strong>${partyHPAfter3.toFixed(0)}</strong> HP (${((partyHPAfter3 / result.partyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div style="margin-top: 8px; opacity: 0.8;">
        Survival Ratio: ${result.analysis.survivalRatio.toFixed(2)}
        (Party can survive ${result.analysis.roundsToDefeatParty} rounds, enemies survive ${result.analysis.roundsToDefeatEnemies} rounds)
      </div>
    `;

    const partyMembers = await this.getPartyForDifficulty();
    if (result.partyStats.memberCount === 0 || partyMembers.length === 0) {
      const warningEl = difficultyCard.createDiv({ cls: "dnd-difficulty-warning" });
      warningEl.innerHTML = `⚠️ <strong>No party registered!</strong> Using default estimates for 4 Level-3 PCs.
        <br>Register PCs via "Create PC" to get accurate calculations.`;
    }
  }

  /**
   * Parse statblock YAML to extract real combat stats
   * Returns hp, ac, dpr (damage per round), and attackBonus
   */
  async parseStatblockStats(filePath: string): Promise<{ hp: number; ac: number; dpr: number; attackBonus: number } | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return null;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) {
        return null;
      }

      const fm = cache.frontmatter;
      
      // Extract basic stats
      const hp = this.parseHP(fm.hp);
      const ac = this.parseAC(fm.ac);
      
      // Calculate DPR and attack bonus from actions
      let totalDPR = 0;
      let highestAttackBonus = 0;
      let attackCount = 0;
      
      // Check for actions array (where attacks are defined)
      if (fm.actions && Array.isArray(fm.actions)) {
        
        for (const action of fm.actions) {
          if (!action.name) continue;
          
          // === CHECK STRUCTURED FIELDS FIRST ===
          // Many statblocks (especially from Fantasy Statblocks plugin) have structured data
          let actionDPR = 0;
          let actionAttackBonus = 0;
          let usedStructuredData = false;
          
          // Check for attack_bonus field
          if (typeof action.attack_bonus === 'number') {
            actionAttackBonus = action.attack_bonus;
            if (actionAttackBonus > highestAttackBonus) {
              highestAttackBonus = actionAttackBonus;
            }
            usedStructuredData = true;
          }
          
          // Check for damage_dice and damage_bonus fields
          if (action.damage_dice || action.damage_bonus) {
            
            // Parse damage_dice (e.g., "1d6" or "2d8")
            let diceDamage = 0;
            if (action.damage_dice && typeof action.damage_dice === 'string') {
              const diceMatch = action.damage_dice.match(/(\d+)d(\d+)/i);
              if (diceMatch) {
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                diceDamage = numDice * ((dieSize + 1) / 2); // Average of dice
              }
            }
            
            // Add damage bonus
            let damageBonus = 0;
            if (typeof action.damage_bonus === 'number') {
              damageBonus = action.damage_bonus;
            } else if (typeof action.damage_bonus === 'string') {
              damageBonus = parseInt(action.damage_bonus) || 0;
            }
            
            actionDPR = diceDamage + damageBonus;
            
            if (actionDPR > 0) {
              totalDPR += actionDPR;
              attackCount++;
              usedStructuredData = true;
            }
          }
          
          // If we successfully used structured data, skip text parsing for this action
          if (usedStructuredData) {
            continue;
          }
          
          // === FALLBACK TO TEXT PARSING ===
          // Parse attack actions from description text
          if (action.desc && typeof action.desc === 'string') {
            const desc = action.desc;
            
            // Look for attack bonus: "+5 to hit" or "attack: +5"
            const attackMatch = desc.match(/[+\-]\d+\s+to\s+hit/i);
            if (attackMatch) {
              const bonusMatch = attackMatch[0].match(/[+\-]\d+/);
              if (bonusMatch) {
                attackCount++; // Increment attack count
                const bonus = parseInt(bonusMatch[0]);
                if (bonus > highestAttackBonus) highestAttackBonus = bonus;
              }
            }
            
            // Look for damage in various formats
            // Format 1: "4 (1d6 + 1)" - average shown first
            // Format 2: "(1d6+1)" - just dice
            // Format 3: "1d6+1" or "2d6 + 3"
            const damagePatterns = [
              /(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/gi,  // "4 (1d6+1)"
              /\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/gi,           // "(1d6+1)"
              /(\d+)d(\d+)\s*([+\-]?\s*\d+)?(?!\))/gi          // "1d6+1"
            ];
            
            let damageFound = false;
            
            // Try format 1 first (with pre-calculated average)
            const avgDamageMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/i);
            if (avgDamageMatch) {
              const avgDamage = parseInt(avgDamageMatch[1]);
              totalDPR += avgDamage;
              damageFound = true;
              if (!attackMatch) attackCount++; // Count this as an attack if we haven't already
            } else {
              // Try parsing dice notation
              const diceMatch = desc.match(/(\d+)d(\d+)\s*([+\-]?\s*\d+)?/i);
              if (diceMatch) {
                if (!attackMatch) attackCount++; // Count this as an attack if we haven't already
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                const modifier = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, '')) : 0;
                const avgDamage = Math.floor(numDice * (dieSize + 1) / 2) + modifier;
                totalDPR += avgDamage;
                damageFound = true;
              }
            }
            
            if (!damageFound) {
            }
          }
        }
      } else {
      }
      
      
      // Check for multiattack
      let multiattackMultiplier = 1;
      if (fm.actions && Array.isArray(fm.actions)) {
        const multiattack = fm.actions.find((a: any) => 
          a.name && a.name.toLowerCase().includes('multiattack')
        );
        
        if (multiattack?.desc) {
          // Look for "makes two attacks" or "makes three weapon attacks"
          const countMatch = multiattack.desc.match(/makes?\s+(two|three|four|five|\d+)\s+.*?attack/i);
          if (countMatch) {
            const countStr = countMatch[1].toLowerCase();
            const countMap: Record<string, number> = { 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
            multiattackMultiplier = countMap[countStr] || parseInt(countStr) || 1;
          }
        }
      }
      
      // Apply multiattack multiplier if we found actual attack damage
      // Note: We don't strictly require attackCount > 0 because some statblocks 
      // might have damage without explicit "to hit" text
      if (totalDPR > 0 && multiattackMultiplier > 1) {
        totalDPR *= multiattackMultiplier;
      }
      
      // If we couldn't parse DPR, return null to fall back to CR estimates
      // We allow attack bonus to be 0 as it's less critical than DPR
      if (totalDPR === 0) {
        return null;
      }
      
      // Use a reasonable default attack bonus if we couldn't parse it
      if (highestAttackBonus === 0) {
        // Estimate based on DPR (higher DPR usually means higher attack bonus)
        highestAttackBonus = Math.max(2, Math.floor(totalDPR / 5));
      }
      
      const result = {
        hp: hp || 1,
        ac: ac || 10,
        dpr: totalDPR,
        attackBonus: highestAttackBonus
      };
      return result;
    } catch (error) {
      console.error("[Parser] Error parsing statblock:", filePath, error);
      return null;
    }
  }

  /**
   * Parse HP from various formats: "45 (6d10+12)" or just "45"
   */
  parseHP(hpStr: any): number {
    if (typeof hpStr === 'number') return hpStr;
    if (typeof hpStr !== 'string') return 0;
    
    // Try to extract number before parentheses: "45 (6d10+12)"
    const match = hpStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 0;
  }

  /**
   * Parse AC from various formats: "13 (natural armor)" or just "13" or number
   */
  parseAC(acStr: any): number {
    if (typeof acStr === 'number') return acStr;
    if (typeof acStr !== 'string') return 10;
    
    // Try to extract number: "13 (natural armor)" or "13"
    const match = acStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 10;
  }

  /**
   * Consolidate trap elements (creatures with [SRD] path and initiative numbers)
   * into single trap entities with trapData loaded from trap files
   */
  async consolidateTrapElements(): Promise<void> {
    const trapGroups = new Map<string, any[]>();
    const nonTraps: any[] = [];
    
    // Group creatures by trap name (before the "Initiative" part)
    for (const creature of this.creatures) {
      // Check if this looks like a trap element: has [SRD] path and name with "Initiative"
      if (creature.path === "[SRD]" && creature.name.includes("(Initiative")) {
        const baseName = creature.name.replace(/\s*\(Initiative\s+\d+\)/, '').trim();
        if (!trapGroups.has(baseName)) {
          trapGroups.set(baseName, []);
        }
        trapGroups.get(baseName)!.push(creature);
      } else if (!creature.isTrap) {
        // Keep non-trap creatures as-is
        nonTraps.push(creature);
      } else {
        // Already a proper trap with trapData
        nonTraps.push(creature);
      }
    }
    
    // Find and load trap files for each trap group
    const consolidatedTraps: any[] = [];
    for (const [trapName, elements] of trapGroups.entries()) {
      
      // Search for the trap file
      let trapFile: TFile | null = null;
      for (const file of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type === 'trap' && 
            (cache.frontmatter.trap_name === trapName || file.basename === trapName)) {
          trapFile = file;
          break;
        }
      }
      
      if (trapFile) {
        try {
          const trapCache = this.app.metadataCache.getFileCache(trapFile);
          if (trapCache?.frontmatter) {
            const fm = trapCache.frontmatter;
            const consolidatedTrap = {
              name: trapName,
              count: 1,
              isTrap: true,
              trapData: {
                trapType: fm.trap_type || "complex",
                threatLevel: fm.threat_level || "dangerous",
                elements: fm.elements || []
              },
              // Preserve manual overrides from first element if any
              hp: elements[0].hp,
              ac: elements[0].ac,
              cr: elements[0].cr,
              path: trapFile.path
            };
            consolidatedTraps.push(consolidatedTrap);
          }
        } catch (error) {
          console.error(`Error loading trap file for ${trapName}:`, error);
          // If we can't load the trap, keep the elements as regular creatures
          nonTraps.push(...elements);
        }
      } else {
        nonTraps.push(...elements);
      }
    }
    
    // Replace creatures array with consolidated version
    this.creatures = [...nonTraps, ...consolidatedTraps];
  }

  async calculateEncounterDifficulty(): Promise<any> {
    // First, consolidate any trap elements
    await this.consolidateTrapElements();
    
    // Calculate enemy stats with real statblock data when available
    let enemyTotalHP = 0;
    let enemyTotalAC = 0;
    let enemyTotalDPR = 0;
    let enemyTotalAttackBonus = 0;
    let enemyCount = 0;
    
    // Track friendly creatures to add to party
    let friendlyTotalHP = 0;
    let friendlyTotalAC = 0;
    let friendlyTotalDPR = 0;
    let friendlyTotalAttackBonus = 0;
    let friendlyCount = 0;
    
    
    for (const creature of this.creatures) {
      const count = creature.count || 1;
      
      
      // Handle friendly creatures - add them to the party side
      if (creature.isFriendly) {
        
        // Get stats for friendly creature (same logic as enemies)
        let realStats = null;
        if (creature.path && typeof creature.path === 'string') {
          realStats = await this.parseStatblockStats(creature.path);
        }
        
        const crStats = this.getCRStats(creature.cr);
        const hp = creature.hp || realStats?.hp || crStats.hp;
        const ac = creature.ac || realStats?.ac || crStats.ac;
        const dpr = realStats?.dpr || crStats.dpr;
        const attackBonus = realStats?.attackBonus || crStats.attackBonus;
        
        
        friendlyTotalHP += hp * count;
        friendlyTotalAC += ac * count;
        friendlyTotalDPR += dpr * count;
        friendlyTotalAttackBonus += attackBonus * count;
        friendlyCount += count;
        continue;
      }
      
      // Handle traps differently from creatures
      if (creature.isTrap && creature.trapData) {
        const trapStats = await this.plugin.encounterBuilder.calculateTrapStats(creature.trapData);
        
        const hp = trapStats.hp;
        const ac = trapStats.ac;
        const dpr = trapStats.dpr;
        const attackBonus = trapStats.attackBonus;
        
        
        // Traps don't add to HP pool (they're hazards, not damage sponges)
        // But they DO contribute DPR, AC (for difficulty calculation), and count as threats
        enemyTotalAC += ac * count;
        enemyTotalDPR += dpr * count;
        enemyTotalAttackBonus += attackBonus * count;
        enemyCount += count;
        continue;
      }
      
      // Try to get real stats from statblock if available
      let realStats = null;
      if (creature.path && typeof creature.path === 'string') {
        realStats = await this.parseStatblockStats(creature.path);
      } else {
      }
      
      // Fall back to CR-based estimates if no statblock or parsing failed
      const crStats = this.getCRStats(creature.cr);
      
      const hp = creature.hp || realStats?.hp || crStats.hp;
      const ac = creature.ac || realStats?.ac || crStats.ac;
      const dpr = realStats?.dpr || crStats.dpr;
      const attackBonus = realStats?.attackBonus || crStats.attackBonus;
      
      const dprSource = realStats?.dpr ? '📊 STATBLOCK' : '📖 CR_TABLE';
      const hpSource = realStats?.hp ? '📊 STATBLOCK' : creature.hp ? '✏️ MANUAL' : '📖 CR_TABLE';
      const acSource = realStats?.ac ? '📊 STATBLOCK' : creature.ac ? '✏️ MANUAL' : '📖 CR_TABLE';
      
      
      enemyTotalHP += hp * count;
      enemyTotalAC += ac * count;
      enemyTotalDPR += dpr * count;
      enemyTotalAttackBonus += attackBonus * count;
      enemyCount += count;
    }
    
    
    const avgEnemyAC = enemyCount > 0 ? enemyTotalAC / enemyCount : 13;
    const avgEnemyAttackBonus = enemyCount > 0 ? enemyTotalAttackBonus / enemyCount : 3;
    
    // Get party stats
    const partyMembers = await this.getPartyForDifficulty();
    
    let partyTotalHP = 0;
    let partyTotalAC = 0;
    let partyTotalDPR = 0;
    let partyTotalAttackBonus = 0;
    let totalLevel = 0;
    
    for (const member of partyMembers) {
      const levelStats = this.getLevelStats(member.level);
      
      const memberHP = Number(member.hp) || 0;
      const memberAC = Number(member.ac) || 0;
      
      partyTotalHP += memberHP > 0 ? memberHP : levelStats.hp;
      partyTotalAC += memberAC > 0 ? memberAC : levelStats.ac;
      partyTotalDPR += levelStats.dpr;
      partyTotalAttackBonus += levelStats.attackBonus;
      totalLevel += member.level;
    }
    
    // Add friendly creatures to party totals
    
    partyTotalHP += friendlyTotalHP;
    partyTotalAC += friendlyTotalAC;
    partyTotalDPR += friendlyTotalDPR;
    partyTotalAttackBonus += friendlyTotalAttackBonus;
    
    const memberCount = partyMembers.length + friendlyCount;
    const pcMemberCount = partyMembers.length;
    
    let avgPartyAC: number;
    let avgPartyAttackBonus: number;
    let avgLevel: number;
    let effectivePartyCount: number; // Track effective count for action economy
    
    if (memberCount > 0) {
      avgPartyAC = partyTotalAC / memberCount;
      avgPartyAttackBonus = partyTotalAttackBonus / memberCount;
      avgLevel = pcMemberCount > 0 ? totalLevel / pcMemberCount : 3;
      effectivePartyCount = memberCount;
    } else {
      const defaultStats = this.getLevelStats(3);
      partyTotalHP = defaultStats.hp * 4;
      partyTotalDPR = defaultStats.dpr * 4;
      avgPartyAC = defaultStats.ac;
      avgPartyAttackBonus = defaultStats.attackBonus;
      avgLevel = 3;
      effectivePartyCount = 4; // Default to 4-person party
    }
    
    // Calculate hit chances
    const partyHitChance = this.calculateHitChance(avgPartyAttackBonus, avgEnemyAC);
    const enemyHitChance = this.calculateHitChance(avgEnemyAttackBonus, avgPartyAC);
    
    // === ACTION ECONOMY ADJUSTMENT ===
    // In D&D 5e, action economy affects combat through:
    // 1. Focus Fire: More creatures can eliminate threats faster
    // 2. Action Efficiency: Fewer creatures waste actions on downed targets
    // 3. Target Distribution: Very few creatures can't threaten all enemies
    
    const partyActionCount = effectivePartyCount;
    const enemyActionCount = enemyCount;
    
    // Calculate action economy modifiers based on creature count disparity
    let partyActionEconomyMod = 1.0;
    let enemyActionEconomyMod = 1.0;
    
    if (partyActionCount > 0 && enemyActionCount > 0) {
      const actionRatio = partyActionCount / enemyActionCount;
      
      if (actionRatio > 2.0) {
        // Extreme party advantage: 6+ PCs vs 1-2 enemies
        // Party can focus fire and chain eliminate threats
        partyActionEconomyMod = 1.0 + Math.min((actionRatio - 1) * 0.1, 0.25); // Up to +25%
        // Very few enemies spread damage thin, but still somewhat effective
        enemyActionEconomyMod = Math.max(0.85, 1.0 - (actionRatio - 2) * 0.05); // Down to 85%
      } else if (actionRatio < 0.5) {
        // Extreme enemy advantage: outnumbered 2:1 or worse
        // Party spread too thin, can't focus effectively
        const inverseRatio = enemyActionCount / partyActionCount;
        partyActionEconomyMod = Math.max(0.85, 1.0 - (inverseRatio - 2) * 0.05); // Down to 85%
        enemyActionEconomyMod = 1.0 + Math.min((inverseRatio - 1) * 0.1, 0.25); // Up to +25%
      }
      // Between 0.5-2.0 ratio: relatively balanced, minimal adjustment
    }
    
    // Calculate effective DPR with action economy adjustments
    const partyBaseDPR = this.calculateEffectiveDPR(partyTotalDPR, partyHitChance);
    const enemyBaseDPR = this.calculateEffectiveDPR(enemyTotalDPR, enemyHitChance);
    
    const partyEffectiveDPR = partyBaseDPR * partyActionEconomyMod;
    const enemyEffectiveDPR = enemyBaseDPR * enemyActionEconomyMod;
    
    // Calculate rounds to defeat
    const roundsToDefeatEnemies = this.calculateRoundsToDefeat(enemyTotalHP, partyEffectiveDPR);
    const roundsToDefeatParty = this.calculateRoundsToDefeat(partyTotalHP, enemyEffectiveDPR);
    
    // Survival ratio
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;
    
    // Determine difficulty
    let difficulty: string;
    let difficultyColor: string;
    
    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) {
      difficulty = "Trivial";
      difficultyColor = "#888888";
    } else if (survivalRatio >= 2.5) {
      difficulty = "Easy";
      difficultyColor = "#00aa00";
    } else if (survivalRatio >= 1.5) {
      difficulty = "Medium";
      difficultyColor = "#aaaa00";
    } else if (survivalRatio >= 1.0) {
      difficulty = "Hard";
      difficultyColor = "#ff8800";
    } else if (survivalRatio >= 0.6) {
      difficulty = "Deadly";
      difficultyColor = "#ff0000";
    } else {
      difficulty = "TPK Risk";
      difficultyColor = "#880000";
    }
    
    // Generate summary
    let summary = "";
    if (partyMembers.length === 0 && friendlyCount === 0) {
      summary = `⚠️ No party found. Using default 4-player party (Level 3).\\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
    } else {
      const partyText = pcMemberCount > 0 ? `${pcMemberCount} PC${pcMemberCount !== 1 ? 's' : ''}` : '';
      const friendlyText = friendlyCount > 0 ? `${friendlyCount} friendly creature${friendlyCount !== 1 ? 's' : ''}` : '';
      const combatants = [partyText, friendlyText].filter(t => t).join(' + ');
      
      summary = `Party: ${combatants}`;
      if (pcMemberCount > 0) {
        summary += ` (Avg Level ${avgLevel.toFixed(1)})`;
      }
      summary += `\\n`;
      summary += `Enemies: ${enemyCount} creatures\\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}`;
    }
    
    return {
      enemyStats: {
        totalHP: enemyTotalHP,
        avgAC: avgEnemyAC,
        totalDPR: enemyTotalDPR,
        avgAttackBonus: avgEnemyAttackBonus,
        creatureCount: enemyCount
      },
      partyStats: {
        totalHP: partyTotalHP,
        avgAC: avgPartyAC,
        totalDPR: partyTotalDPR,
        avgAttackBonus: avgPartyAttackBonus,
        memberCount: memberCount,
        avgLevel: avgLevel
      },
      analysis: {
        partyHitChance,
        enemyHitChance,
        partyEffectiveDPR,
        enemyEffectiveDPR,
        partyActionEconomyMod,
        enemyActionEconomyMod,
        roundsToDefeatEnemies,
        roundsToDefeatParty,
        survivalRatio,
        difficulty,
        difficultyColor,
        summary
      }
    };
  }

  generateUniqueId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper methods (copied from SceneCreationModal)
  getCRStats(cr: string | undefined): { hp: number; ac: number; dpr: number; attackBonus: number; xp: number } {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getCRStats(cr);
  }

  getLevelStats(level: number): { hp: number; ac: number; dpr: number; attackBonus: number } {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getLevelStats(level);
  }

  async getPartyForDifficulty(): Promise<Array<{ level: number; hp?: number; ac?: number }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getPartyForDifficulty();
  }

  calculateHitChance(attackBonus: number, targetAC: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateHitChance(attackBonus, targetAC);
  }

  calculateEffectiveDPR(baseDPR: number, hitChance: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateEffectiveDPR(baseDPR, hitChance);
  }

  calculateRoundsToDefeat(totalHP: number, effectiveDPR: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateRoundsToDefeat(totalHP, effectiveDPR);
  }

  async saveEncounter() {
    if (!this.encounterName.trim()) {
      new Notice("Please enter an encounter name");
      return;
    }

    if (this.creatures.length === 0) {
      new Notice("Please add at least one creature");
      return;
    }

    try {
      // Determine encounter folder path
      let encounterFolder = "z_Encounters";
      
      // Check if we're in a campaign context
      const activeCampaignFile = this.app.workspace.getActiveFile();
      if (activeCampaignFile) {
        const campaignFolder = this.findCampaignFolder(activeCampaignFile.path);
        if (campaignFolder) {
          encounterFolder = `${campaignFolder}/z_Encounters`;
          this.campaignPath = campaignFolder;
        }
      }

      // Create folder if it doesn't exist
      const folderExists = this.app.vault.getAbstractFileByPath(encounterFolder);
      if (!folderExists) {
        await this.app.vault.createFolder(encounterFolder);
      }

      // Generate encounter file content
      this.syncEncounterBuilder();
      const diffResult = await this.encounterBuilder.calculateEncounterDifficulty();
      const encounterContent = await this.generateEncounterContent(diffResult);

      // Save or update encounter file
      const fileName = `${this.encounterName}.md`;
      const encounterPath = `${encounterFolder}/${fileName}`;

      if (this.isEdit && this.originalEncounterPath !== encounterPath) {
        // If name changed, delete old file and create new one
        const oldFile = this.app.vault.getAbstractFileByPath(this.originalEncounterPath);
        if (oldFile instanceof TFile) {
          await this.app.vault.delete(oldFile);
        }
      }

      const existingFile = this.app.vault.getAbstractFileByPath(encounterPath);
      let fileToOpen: TFile;
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, encounterContent);
        new Notice(`Encounter "${this.encounterName}" updated!`);
        fileToOpen = existingFile;
      } else {
        const newFile = await this.app.vault.create(encounterPath, encounterContent);
        new Notice(`Encounter "${this.encounterName}" created!`);
        fileToOpen = newFile;
      }

      // Save to Initiative Tracker
      await this.saveToInitiativeTracker(encounterPath);

      this.close();
      
      // Open the encounter note
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(fileToOpen);
    } catch (error) {
      console.error("Error saving encounter:", error);
      new Notice("Error saving encounter");
    }
  }

  findCampaignFolder(filePath: string): string | null {
    // Look for campaign folder in path (folders containing "ttrpgs" subdirectory)
    const parts = filePath.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const potentialCampaign = parts.slice(0, i + 1).join('/');
      const ttrpgPath = `${potentialCampaign}/ttrpgs`;
      if (this.app.vault.getAbstractFileByPath(ttrpgPath)) {
        return potentialCampaign;
      }
    }
    return null;
  }

  escapeYamlString(str: string): string {
    if (!str) return '""';
    // Use single quotes for YAML strings - only need to escape single quotes within
    // Single quotes are safer as they don't interpret escape sequences
    if (str.includes("'")) {
      // If string contains single quotes, double them (YAML escaping for single quotes)
      return "'" + str.replace(/'/g, "''") + "'";
    }
    // If no single quotes, just wrap in single quotes
    return "'" + str + "'";
  }

  async generateEncounterContent(diffResult: any): Promise<string> {
    const currentDate = window.moment().format("YYYY-MM-DD");

    let frontmatter = `---
type: encounter
name: ${this.escapeYamlString(this.encounterName)}
creatures:`;

    for (const creature of this.creatures) {
      frontmatter += `\n  - name: ${this.escapeYamlString(creature.name)}
    count: ${creature.count}`;
      if (creature.hp) frontmatter += `\n    hp: ${creature.hp}`;
      if (creature.ac) frontmatter += `\n    ac: ${creature.ac}`;
      if (creature.cr) frontmatter += `\n    cr: ${this.escapeYamlString(creature.cr)}`;
      if (creature.source) frontmatter += `\n    source: ${this.escapeYamlString(creature.source)}`;
      if (creature.path) frontmatter += `\n    path: ${this.escapeYamlString(creature.path)}`;
      if (creature.isFriendly) frontmatter += `\n    is_friendly: ${creature.isFriendly}`;
      if (creature.isHidden) frontmatter += `\n    is_hidden: ${creature.isHidden}`;
    }

    frontmatter += `
include_party: ${this.includeParty}
use_color_names: ${this.useColorNames}`;

  if (this.selectedPartyId) frontmatter += `\nselected_party_id: ${this.escapeYamlString(this.selectedPartyId)}`;
  if (this.selectedPartyName) frontmatter += `\nselected_party_name: ${this.escapeYamlString(this.selectedPartyName)}`;

    if (this.adventurePath) frontmatter += `\nadventure_path: ${this.escapeYamlString(this.adventurePath)}`;
    if (this.scenePath) frontmatter += `\nscene_path: ${this.escapeYamlString(this.scenePath)}`;
    if (this.campaignPath) frontmatter += `\ncampaign_path: ${this.escapeYamlString(this.campaignPath)}`;

    frontmatter += `
difficulty:
  rating: ${this.escapeYamlString(diffResult.analysis.difficulty)}
  color: ${this.escapeYamlString(diffResult.analysis.difficultyColor)}
  party_count: ${diffResult.partyStats.memberCount}
  party_avg_level: ${diffResult.partyStats.avgLevel.toFixed(1)}
  party_total_hp: ${diffResult.partyStats.totalHP}
  party_avg_ac: ${diffResult.partyStats.avgAC.toFixed(1)}
  party_total_dpr: ${diffResult.partyStats.totalDPR.toFixed(1)}
  party_hit_chance: ${(diffResult.analysis.partyHitChance * 100).toFixed(0)}
  party_effective_dpr: ${diffResult.analysis.partyEffectiveDPR.toFixed(0)}
  enemy_count: ${diffResult.enemyStats.creatureCount}
  enemy_total_hp: ${diffResult.enemyStats.totalHP}
  enemy_avg_ac: ${diffResult.enemyStats.avgAC.toFixed(1)}
  enemy_total_dpr: ${diffResult.enemyStats.totalDPR.toFixed(1)}
  enemy_hit_chance: ${(diffResult.analysis.enemyHitChance * 100).toFixed(0)}
  enemy_effective_dpr: ${diffResult.analysis.enemyEffectiveDPR.toFixed(0)}
  rounds_to_defeat: ${diffResult.analysis.roundsToDefeatEnemies}
  rounds_party_survives: ${diffResult.analysis.roundsToDefeatParty}
  survival_ratio: ${diffResult.analysis.survivalRatio.toFixed(2)}
date: ${currentDate}
---`;

    const content = `${frontmatter}

# ${this.encounterName}

\`\`\`dataviewjs
// Create action buttons
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Open Initiative Tracker and load encounter button
const openTrackerBtn = buttonContainer.createEl("button", { 
  text: "⚔️ Open & Load in Tracker",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--interactive-accent); color: var(--text-on-accent);" }
});
openTrackerBtn.addEventListener("click", async () => {
  const encounterName = dv.current().name;
  const initiativeTracker = app.plugins?.plugins?.["initiative-tracker"];
  
  if (!initiativeTracker) {
    new Notice("Initiative Tracker plugin not found");
    return;
  }
  
  const encounter = initiativeTracker.data?.encounters?.[encounterName];
  if (!encounter) {
    new Notice("Encounter \\"" + encounterName + "\\" not found. Try recreating it.");
    return;
  }
  
  // Use Initiative Tracker's internal tracker API to load the encounter
  try {
    if (initiativeTracker.tracker?.new) {
      initiativeTracker.tracker.new(initiativeTracker, encounter);
      new Notice("✅ Loaded encounter: " + encounterName);
    } else {
      new Notice("⚠️ Could not load encounter. Try using Load Encounter from Initiative Tracker menu.");
    }
  } catch (e) {
    console.error("Error loading encounter:", e);
    new Notice("⚠️ Could not load encounter: " + e.message);
  }
  
  // Open Initiative Tracker view
  app.commands.executeCommandById("initiative-tracker:open-tracker");
});

// Edit button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-encounter");
});

// Save Combat button
const saveBtn = buttonContainer.createEl("button", { 
  text: "💾 Save Combat",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
saveBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:save-combat-state");
});

// Resume Combat button
const resumeBtn = buttonContainer.createEl("button", { 
  text: "🔄 Resume Combat",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--interactive-accent); color: var(--text-on-accent);" }
});
resumeBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:load-combat-state");
});

// Clear Saved State button
const clearStateBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Clear Saved State",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
clearStateBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:clear-combat-state");
});

// Delete button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Encounter",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-encounter");
});
\`\`\`

---

## Difficulty Analysis

\`\`\`dataviewjs
const diff = dv.current().difficulty;
if (!diff) {
  dv.paragraph("*No difficulty data available.*");
} else {
  // Create difficulty card
  const card = dv.el("div", "", { cls: "dnd-difficulty-card" });
  
  // Header with difficulty badge and rounds
  const header = dv.el("div", "", { cls: "dnd-difficulty-header", container: card });
  const badge = dv.el("span", diff.rating, { cls: "dnd-difficulty-badge", container: header });
  badge.style.backgroundColor = diff.color;
  dv.el("span", \` ~\${diff.rounds_to_defeat} round\${diff.rounds_to_defeat !== 1 ? 's' : ''}\`, { cls: "dnd-rounds-estimate", container: header });
  
  // Stats grid
  const grid = dv.el("div", "", { cls: "dnd-difficulty-stats-grid", container: card });
  
  // Party column
  const partyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`⚔️ Party (\${diff.party_count})\`, { container: partyCol });
  const partyStats = dv.el("div", "", { container: partyCol });
  partyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.party_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.party_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.party_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.party_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.party_effective_dpr}</strong></div>
  \`;
  
  // Enemy column
  const enemyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`👹 Enemies (\${diff.enemy_count})\`, { container: enemyCol });
  const enemyStats = dv.el("div", "", { container: enemyCol });
  enemyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.enemy_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.enemy_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.enemy_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.enemy_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.enemy_effective_dpr}</strong></div>
  \`;
  
  // 3-round analysis
  const analysis = dv.el("div", "", { cls: "dnd-difficulty-analysis", container: card });
  const partyDamage3 = diff.party_effective_dpr * 3;
  const enemyDamage3 = diff.enemy_effective_dpr * 3;
  const partyHPAfter3 = Math.max(0, diff.party_total_hp - enemyDamage3);
  const enemyHPAfter3 = Math.max(0, diff.enemy_total_hp - partyDamage3);
  const partyHPPercent = Math.round((partyHPAfter3 / diff.party_total_hp) * 100);
  const enemyHPPercent = Math.round((enemyHPAfter3 / diff.enemy_total_hp) * 100);
  
  analysis.innerHTML = \`
    <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
    <div>Party deals: <strong>\${Math.round(partyDamage3)}</strong> damage → Enemies at <strong>\${Math.round(enemyHPAfter3)}</strong> HP (\${enemyHPPercent}%)</div>
    <div>Enemies deal: <strong>\${Math.round(enemyDamage3)}</strong> damage → Party at <strong>\${Math.round(partyHPAfter3)}</strong> HP (\${partyHPPercent}%)</div>
    <div style="margin-top: 8px; opacity: 0.8;">
      Survival Ratio: \${diff.survival_ratio}
      (Party can survive \${diff.rounds_party_survives} rounds, enemies survive \${diff.rounds_to_defeat} rounds)
    </div>
  \`;
}
\`\`\`

---

## Creatures

\`\`\`dataviewjs
const creatures = dv.current().creatures || [];

if (creatures.length === 0) {
  dv.paragraph("*No creatures in this encounter.*");
} else {
  const table = creatures.map(c => {
    return [
      c.name,
      c.count || 1,
      c.cr || "?",
      c.hp || "?",
      c.ac || "?"
    ];
  });
  
  dv.table(["Creature", "Count", "CR", "HP", "AC"], table);
}
\`\`\`

---

## GM Notes

_Add notes about tactics, environment, or special conditions here._
`;

    return content;
  }

  async saveToInitiativeTracker(encounterPath: string) {
    try {
      const initiativeTracker = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativeTracker) {
        new Notice("⚠️ Initiative Tracker not found. Encounter saved to vault only.");
        return;
      }

      // Build creature list for initiative tracker
      const creatures: any[] = [];

      // Add party members if requested
      if (this.includeParty && this.selectedPartyMembers.length > 0) {
        try {
          this.syncEncounterBuilder();
          const selectedPlayers = await this.encounterBuilder.getSelectedPartyPlayers();
          for (const player of selectedPlayers) {
            const hp = player.hp || player.currentMaxHP || 20;
            const ac = player.ac || player.currentAC || 14;
            creatures.push({
              name: player.name || "Player",
              display: "",
              initiative: 0,
              static: false,
              modifier: Math.floor(((player.level || 1) - 1) / 4) + 2,
              hp: hp,
              currentMaxHP: hp,
              currentHP: hp,
              tempHP: player.thp || 0,
              ac: ac,
              currentAC: ac,
              id: this.generateUniqueId(),
              status: [],
              enabled: true,
              active: false,
              hidden: false,
              friendly: false,  // Party members should NOT be marked as friendly
              player: true,
              rollHP: false
            });
          }
        } catch (error) {
          console.error("Error getting party members for Initiative Tracker:", error);
        }
      }

      // Helper function to generate unique IDs like Initiative Tracker does
      const generateId = () => {
        const chars = '0123456789abcdef';
        let id = 'ID_';
        for (let i = 0; i < 12; i++) {
          id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
      };

      // Color names for duplicate creatures
      const colors = [
        "Red", "Blue", "Green", "Yellow", "Purple", "Orange", 
        "Pink", "Brown", "Black", "White", "Gray", "Cyan", 
        "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold", 
        "Silver", "Bronze"
      ];

      // Build creature data in Initiative Tracker format using flatMap
      const enemyCreatures = this.creatures.flatMap(c => {
        const instances = [];
        for (let i = 0; i < c.count; i++) {
          const hp = c.hp || 1;
          const ac = c.ac || 10;

          // Determine name and display based on useColorNames setting
          // IMPORTANT: 'name' is used for bestiary lookup and must be the base creature name
          // 'display' is used for visual representation in the tracker
          // Initiative Tracker will auto-number duplicate display names (Zombie -> Zombie 1, Zombie 2)
          let displayName = c.name;  // Always show at least the creature name

          if (c.count > 1 && this.useColorNames) {
            const colorIndex = i % colors.length;
            // Use display for color names
            displayName = `${c.name} (${colors[colorIndex]})`;
          }
          // For single creatures or multiple without colors, display is just the creature name
          // Initiative Tracker will add numbers automatically for duplicates

          const creature: any = {
            name: c.name,  // Base creature name for bestiary lookup
            display: displayName,  // Display name (always has a value now)
            initiative: 0,
            static: false,
            modifier: 0,  // Initiative modifier
            hp: hp,
            currentMaxHP: hp,  // Initiative Tracker uses currentMaxHP, not max
            cr: c.cr || undefined,
            ac: ac,  // AC as number
            currentAC: ac,  // Initiative Tracker also tracks currentAC
            id: generateId(),  // CRITICAL: Unique ID for each creature instance
            currentHP: hp,  // Initiative Tracker uses currentHP, not hp
            tempHP: 0,  // Initiative Tracker uses tempHP, not temp
            status: [],  // Array of status effects
            enabled: true,
            active: false,  // Whether this creature is currently active in turn order
            hidden: c.isHidden || false,  // Hidden from players
            friendly: c.isFriendly || false,  // Friendly to players
            rollHP: false  // Whether to roll HP when adding to tracker
          };
          // Include vault path so the map token import can resolve the creature's note
          if (c.path && c.path !== '[SRD]') {
            creature.note = c.path;
          }
          instances.push(creature);
        }
        return instances;
      });

      // Add enemy creatures to the main creatures array
      creatures.push(...enemyCreatures);


      // Save encounter to Initiative Tracker's data structure
      if (initiativeTracker.data) {
        // Initialize encounters object if it doesn't exist
        if (!initiativeTracker.data.encounters) {
          initiativeTracker.data.encounters = {};
        }


        // Save encounter in Initiative Tracker format
        initiativeTracker.data.encounters[this.encounterName] = {
          creatures: creatures,
          state: false,
          name: this.encounterName,
          round: 1,
          logFile: null,
          rollHP: false
        };


        // Persist the data
        if (initiativeTracker.saveSettings) {
          await initiativeTracker.saveSettings();
          new Notice(`✓ Encounter saved to Initiative Tracker with ${creatures.length} creatures`);
        } else {
          new Notice("⚠️ Could not persist encounter to Initiative Tracker");
        }
      } else {
        new Notice("⚠️ Initiative Tracker data not accessible - encounter saved to vault only");
      }
    } catch (error) {
      console.error("Error saving to Initiative Tracker:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`⚠️ Error saving to Initiative Tracker: ${errorMessage}`);
    }
  }

  async deleteEncounter() {
    if (!this.isEdit) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.contentEl.createEl("h3", { text: "Delete Encounter?" });
      modal.contentEl.createEl("p", { text: `Are you sure you want to delete "${this.encounterName}"?` });
      modal.contentEl.createEl("p", { 
        text: "This will remove the encounter file and remove it from the Initiative Tracker.", 
        cls: "mod-warning" 
      });

      const buttonContainer = modal.contentEl.createDiv();
      buttonContainer.style.display = "flex";
      buttonContainer.style.justifyContent = "flex-end";
      buttonContainer.style.gap = "10px";
      buttonContainer.style.marginTop = "20px";

      const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
      cancelBtn.onclick = () => {
        modal.close();
        resolve(false);
      };

      const deleteBtn = buttonContainer.createEl("button", { text: "Delete", cls: "mod-warning" });
      deleteBtn.onclick = () => {
        modal.close();
        resolve(true);
      };

      modal.open();
    });

    if (!confirmed) return;

    try {
      // Delete the encounter file
      const file = this.app.vault.getAbstractFileByPath(this.originalEncounterPath);
      if (file instanceof TFile) {
        await this.app.vault.delete(file);
      }

      // Remove from Initiative Tracker
      const initiativeTracker = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      
      if (initiativeTracker?.data?.encounters) {
        
        if (initiativeTracker.data.encounters[this.encounterName]) {
          delete initiativeTracker.data.encounters[this.encounterName];
          
          if (initiativeTracker.saveSettings) {
            await initiativeTracker.saveSettings();
            new Notice(`✓ Encounter deleted from Initiative Tracker`);
          } else {
            new Notice("⚠️ Could not persist deletion to Initiative Tracker");
          }
        } else {
          new Notice("⚠️ Encounter not found in Initiative Tracker");
        }
      } else {
        new Notice("⚠️ Initiative Tracker data not accessible");
      }

      new Notice(`Encounter "${this.encounterName}" deleted from vault`);
      this.close();
    } catch (error) {
      console.error("Error deleting encounter:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Error deleting encounter: ${errorMessage}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}