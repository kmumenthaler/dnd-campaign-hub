import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { EncounterBuilder, EncounterCreature } from "./EncounterBuilder";
import { RenameCreatureModal } from "../utils/CreatureModals";
import { MarkerDefinition, CreatureSize } from "../marker/MarkerTypes";
import { PartySelector } from "../party/PartySelector";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";

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
  private partySelector: PartySelector | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, encounterPath?: string, campaignPath?: string) {
    super(app);
    this.plugin = plugin;
    this.encounterBuilder = new EncounterBuilder(app, plugin);
    if (campaignPath) {
      this.campaignPath = campaignPath;
      const campaignName = campaignPath.split("/").pop() || campaignPath;
      const party = plugin.partyManager.getPartiesForCampaign(campaignPath)[0]
        || plugin.partyManager.resolveParty(undefined, campaignPath)
        || plugin.partyManager.resolveParty(undefined, campaignName);
      if (party) {
        this.selectedPartyId = party.id;
        this.selectedPartyName = party.name;
      }
    }
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
            initiative: c.initiative,
            initiativeCounts: Array.isArray(c.initiative_counts) ? c.initiative_counts : c.initiativeCounts,
            fixedInitiative: c.fixed_initiative === true || c.fixedInitiative === true,
            hp: c.hp,
            ac: c.ac,
            cr: c.cr,
            source: c.source,
            path: c.path,
            isTrap: c.is_trap === true || c.isTrap === true,
            trapPath: c.trap_path || c.trapPath,
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

    const campaignHint = this.campaignPath
      ? this.campaignPath.split("/").pop() || ""
      : "";

    this.partySelector = new PartySelector({
      partyManager: this.plugin.partyManager,
      container: this.partySelectionContainer,
      campaignHint,
      initialPartyId: this.selectedPartyId,
      initialMembers: this.selectedPartyMembers,
      onChange: (partyId, partyName, members) => {
        this.selectedPartyId = partyId;
        this.selectedPartyName = partyName;
        this.selectedPartyMembers = members;
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      },
    });
    await this.partySelector.render();
    this.selectedPartyId = this.partySelector.getSelectedPartyId();
    this.selectedPartyName = this.partySelector.getSelectedPartyName();
    this.selectedPartyMembers = this.partySelector.getSelectedMembers();
    this.syncEncounterBuilder();
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
        if (memberData.cr) {
          stats.push(`CR: ${memberData.cr}`);
        } else {
          stats.push(`Level: ${memberData.level}`);
        }
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

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number; cr?: string }>> {
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

            // Replace name in frontmatter and creature reference in statblock block.
            newContent = updateYamlFrontmatter(fileContent, (fm) => ({
              ...fm,
              name: newName,
            }));
            newContent = newContent.replace(
              /```statblock\ncreature:\s*.+\n```/,
              `\`\`\`statblock\ncreature: ${newName}\n\`\`\``
            );
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

        // Inject the new token_id into frontmatter.
        const withToken = updateYamlFrontmatter(newContent, (fm) => ({
          ...fm,
          token_id: newTokenId,
        }));
        if (withToken === newContent && !newContent.includes("token_id:")) {
          // Fallback for malformed files with no frontmatter.
          newContent = newContent.replace(/\n---\s*\n/, `\ntoken_id: ${newTokenId}\n---\n`);
        } else {
          newContent = withToken;
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
      const empty = this.creatureListContainer.createDiv({ cls: "encounter-creature-empty-state" });
      empty.createEl("p", { text: "No creatures in this encounter yet." });
      empty.createEl("p", {
        text: "Search your bestiary, import a creature, or add a manual entry below.",
        cls: "setting-item-description",
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
    header.createEl("span", {
      text: "Combat Estimate",
      cls: "dnd-difficulty-label"
    });

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
    const xp = result.analysis.xpDifficulty;
    const dprOverrides = result.partyStats.dprOverrideCount || 0;
    const attackOverrides = result.partyStats.attackOverrideCount || 0;
    const partyCount = result.partyStats.memberCount || 0;
    const overrideInfo = dprOverrides > 0 || attackOverrides > 0
      ? `<div style="margin-bottom: 8px; opacity: 0.85;">
          <strong>Tuned Party Stats:</strong> DPR ${dprOverrides}/${partyCount}, Attack ${attackOverrides}/${partyCount}
        </div>`
      : '';
    const xpInfo = xp
      ? `<div style="margin-bottom: 8px; padding: 8px; background: var(--background-secondary); border-radius: 4px;">
          <strong>D&D 5e DMG XP Budget:</strong> ${xp.rating}
          (${xp.adjustedXp.toLocaleString()} adjusted XP; ${xp.baseXp.toLocaleString()} base XP ×${xp.multiplier})
        </div>`
      : '';

    analysisSummary.innerHTML = `
      ${actionEconomyInfo}
      ${overrideInfo}
      ${xpInfo}
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
      warningEl.innerHTML = `⚠️ <strong>No party registered!</strong> Using D&D 5e default estimates for four level-3 characters.
        <br>Register characters via "Create PC" to get accurate calculations.`;
    }
  }

  /**
   * Parse statblock YAML to extract real combat stats.
   * Delegates to EncounterBuilder to avoid code duplication.
   */
  async parseStatblockStats(filePath: string): Promise<{ hp: number; ac: number; dpr: number; attackBonus: number; hasPackTactics?: boolean } | null> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.parseStatblockStats(filePath);
  }

  /**
   * Parse HP from various formats: "45 (6d10+12)" or just "45"
   */
  parseHP(hpStr: any): number {
    return this.encounterBuilder.parseHP(hpStr);
  }

  /**
   * Parse AC from various formats: "13 (natural armor)" or just "13" or number
   */
  parseAC(acStr: any): number {
    return this.encounterBuilder.parseAC(acStr);
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
            const initiativeCounts = Array.from(new Set<number>((fm.elements || [])
              .filter((e: any) => e && e.element_type !== "dynamic" && e.element_type !== "constant")
              .map((e: any) => parseInt(String(e.initiative ?? ""), 10))
              .filter((n: number) => !Number.isNaN(n) && n > 0)))
              .sort((a, b) => b - a);
            const trapInitiative = parseInt(String(fm.trap_initiative ?? ""), 10) || undefined;
            const consolidatedTrap = {
              name: trapName,
              count: 1,
              isTrap: true,
              fixedInitiative: true,
              initiative: initiativeCounts[0] ?? trapInitiative,
              initiativeCounts: initiativeCounts.length > 0 ? initiativeCounts : (trapInitiative ? [trapInitiative] : []),
              trapPath: trapFile.path,
              trapData: {
                trapType: fm.trap_type || "complex",
                threatLevel: fm.threat_level || "dangerous",
                elements: fm.elements || [],
                initiative: trapInitiative,
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
    this.syncEncounterBuilder();
    const result = await this.encounterBuilder.calculateEncounterDifficulty();
    this.creatures = [...this.encounterBuilder.creatures];
    return result;
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

  async getPartyForDifficulty(): Promise<Array<{ level: number; hp?: number; ac?: number; combatDpr?: number; combatAttackBonus?: number }>> {
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
      this.creatures = [...this.encounterBuilder.creatures];
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

      // Save to Party Manager
      await this.saveToPartyManager(encounterPath);

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
template_version: 1.2.0
name: ${this.escapeYamlString(this.encounterName)}
creatures:`;

    for (const creature of this.creatures) {
      frontmatter += `\n  - name: ${this.escapeYamlString(creature.name)}
    count: ${creature.count}`;
      if (creature.initiative) frontmatter += `\n    initiative: ${creature.initiative}`;
      if (Array.isArray(creature.initiativeCounts) && creature.initiativeCounts.length > 0) {
        frontmatter += `\n    initiative_counts: [${creature.initiativeCounts.join(", ")}]`;
      }
      if (creature.fixedInitiative) frontmatter += `\n    fixed_initiative: true`;
      if (creature.hp) frontmatter += `\n    hp: ${creature.hp}`;
      if (creature.ac) frontmatter += `\n    ac: ${creature.ac}`;
      if (creature.cr) frontmatter += `\n    cr: ${this.escapeYamlString(creature.cr)}`;
      if (creature.source) frontmatter += `\n    source: ${this.escapeYamlString(creature.source)}`;
      if (creature.path) frontmatter += `\n    path: ${this.escapeYamlString(creature.path)}`;
      if (creature.isTrap) frontmatter += `\n    is_trap: true`;
      if (creature.trapPath) frontmatter += `\n    trap_path: ${this.escapeYamlString(creature.trapPath)}`;
      if (creature.isFriendly) frontmatter += `\n    is_friendly: ${creature.isFriendly}`;
      if (creature.isHidden) frontmatter += `\n    is_hidden: ${creature.isHidden}`;
    }

    frontmatter += `
include_party: ${this.includeParty}
use_color_names: ${this.useColorNames}`;

  if (this.selectedPartyId) frontmatter += `\nselected_party_id: ${this.escapeYamlString(this.selectedPartyId)}`;
  if (this.selectedPartyName) frontmatter += `\nselected_party_name: ${this.escapeYamlString(this.selectedPartyName)}`;

    // Save individual party members so the Combat Tracker can load them
    // without depending on Initiative Tracker at runtime.
    if (this.includeParty && this.selectedPartyMembers.length > 0) {
      try {
        const party = this.plugin.partyManager.resolveParty(
          this.selectedPartyId,
          this.campaignPath ? this.campaignPath.split("/").pop() || "" : "",
        );
        if (party) {
          const resolved = await this.plugin.partyManager.resolveMembers(party.id);
          const selected = resolved.filter((m) => m.enabled && !m.absent && this.selectedPartyMembers.includes(m.name));

          if (selected.length > 0) {
            frontmatter += `\nparty_members:`;
            for (const m of selected) {
              frontmatter += `\n  - name: ${this.escapeYamlString(m.name)}`;
              frontmatter += `\n    level: ${m.level}`;
              frontmatter += `\n    hp: ${m.maxHp}`;
              frontmatter += `\n    ac: ${m.ac}`;
              if (m.combatDpr !== undefined) frontmatter += `\n    combat_dpr: ${m.combatDpr}`;
              if (m.combatAttackBonus !== undefined) frontmatter += `\n    combat_attack_bonus: ${m.combatAttackBonus}`;
              if (m.notePath) frontmatter += `\n    note_path: ${this.escapeYamlString(m.notePath)}`;
              if (m.tokenId) frontmatter += `\n    token_id: ${this.escapeYamlString(m.tokenId)}`;
              if (m.initBonus !== undefined) frontmatter += `\n    init_bonus: ${m.initBonus}`;
              if (m.thp) frontmatter += `\n    thp: ${m.thp}`;
            }
          }
        }
      } catch (error) {
        console.error("Error saving party members to encounter frontmatter:", error);
      }
    }

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
  party_dpr_override_count: ${diffResult.partyStats.dprOverrideCount}
  party_attack_override_count: ${diffResult.partyStats.attackOverrideCount}
  party_hit_chance: ${(diffResult.analysis.partyHitChance * 100).toFixed(0)}
  party_action_economy_mod: ${diffResult.analysis.partyActionEconomyMod.toFixed(2)}
  party_effective_dpr: ${diffResult.analysis.partyEffectiveDPR.toFixed(0)}
  enemy_count: ${diffResult.enemyStats.creatureCount}
  enemy_total_hp: ${diffResult.enemyStats.totalHP}
  enemy_avg_ac: ${diffResult.enemyStats.avgAC.toFixed(1)}
  enemy_total_dpr: ${diffResult.enemyStats.totalDPR.toFixed(1)}
  enemy_hit_chance: ${(diffResult.analysis.enemyHitChance * 100).toFixed(0)}
  enemy_action_economy_mod: ${diffResult.analysis.enemyActionEconomyMod.toFixed(2)}
  enemy_effective_dpr: ${diffResult.analysis.enemyEffectiveDPR.toFixed(0)}
  xp_rating: ${this.escapeYamlString(diffResult.analysis.xpDifficulty.rating)}
  base_xp: ${diffResult.analysis.xpDifficulty.baseXp}
  adjusted_xp: ${diffResult.analysis.xpDifficulty.adjustedXp}
  xp_multiplier: ${diffResult.analysis.xpDifficulty.multiplier}
  easy_threshold: ${diffResult.analysis.xpDifficulty.thresholds.easy}
  medium_threshold: ${diffResult.analysis.xpDifficulty.thresholds.medium}
  hard_threshold: ${diffResult.analysis.xpDifficulty.thresholds.hard}
  deadly_threshold: ${diffResult.analysis.xpDifficulty.thresholds.deadly}
  rounds_to_defeat: ${diffResult.analysis.roundsToDefeatEnemies}
  rounds_party_survives: ${diffResult.analysis.roundsToDefeatParty}
  survival_ratio: ${diffResult.analysis.survivalRatio.toFixed(2)}
date: ${currentDate}
---`;

    const content = `${frontmatter}

# ${this.encounterName}

\`\`\`dnd-hub
\`\`\`

---

## Difficulty Analysis

\`\`\`dnd-hub-view
encounter-difficulty
\`\`\`

---

## Creatures

\`\`\`dnd-hub-view
encounter-creatures
\`\`\`

---

## GM Notes

_Add notes about tactics, environment, or special conditions here._
`;

    return content;
  }

  async saveToPartyManager(encounterPath: string) {
    try {
      const pm = this.plugin.partyManager;

      // Build creature list
      const creatures: import("../party/PartyTypes").StoredEncounterCreature[] = [];

      // Add party members if requested
      if (this.includeParty && this.selectedPartyMembers.length > 0) {
        try {
          this.syncEncounterBuilder();
          const partyCreatures = await this.encounterBuilder.getCampaignPartyCreatures();
          creatures.push(...partyCreatures);
        } catch (error) {
          console.error("Error getting party members for encounter:", error);
        }
      }

      // Color names for duplicate creatures
      const colors = [
        "Red", "Blue", "Green", "Yellow", "Purple", "Orange", 
        "Pink", "Brown", "Black", "White", "Gray", "Cyan", 
        "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold", 
        "Silver", "Bronze"
      ];

      // Build creature data
      const enemyCreatures: import("../party/PartyTypes").StoredEncounterCreature[] = this.creatures.flatMap(c => {
        const instances: import("../party/PartyTypes").StoredEncounterCreature[] = [];
        const fixedInitiatives = c.isTrap && Array.isArray(c.initiativeCounts) && c.initiativeCounts.length > 0
          ? c.initiativeCounts
          : (c.fixedInitiative && c.initiative ? [c.initiative] : []);
        const instanceCount = fixedInitiatives.length > 0 ? fixedInitiatives.length : c.count;

        for (let i = 0; i < instanceCount; i++) {
          const hp = c.hp || 1;
          const ac = c.ac || 10;
          const fixedInitiative = fixedInitiatives[i];

          let displayName = c.name;
          if (fixedInitiative) {
            displayName = fixedInitiatives.length > 1 ? `${c.name} (Initiative ${fixedInitiative})` : c.name;
          } else if (c.count > 1 && this.useColorNames) {
            const colorIndex = i % colors.length;
            displayName = `${c.name} (${colors[colorIndex]})`;
          }

          const creature: import("../party/PartyTypes").StoredEncounterCreature = {
            name: c.name,
            display: displayName,
            initiative: fixedInitiative || 0,
            fixedInitiative: !!fixedInitiative,
            modifier: fixedInitiative || 0,
            hp: hp,
            maxHP: hp,
            currentHP: hp,
            tempHP: 0,
            cr: c.cr || undefined,
            ac: ac,
            currentAC: ac,
            id: pm.generateId(),
            enabled: true,
            hidden: c.isHidden || false,
            friendly: c.isFriendly || false,
            trap: c.isTrap === true,
            player: false,
            statuses: [],
          };
          const notePath = c.trapPath || c.path;
          if (notePath && notePath !== '[SRD]') {
            creature.notePath = notePath;
          }
          instances.push(creature);
        }
        return instances;
      });

      creatures.push(...enemyCreatures);

      const encounter = pm.buildEncounter(this.encounterName, creatures, encounterPath);
      await pm.saveEncounter(this.encounterName, encounter);
      new Notice(`✓ Encounter saved with ${creatures.length} creatures`);
    } catch (error) {
      console.error("Error saving encounter:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`⚠️ Error saving encounter: ${errorMessage}`);
    }
  }

  async deleteEncounter() {
    if (!this.isEdit) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      const modal = new Modal(this.app);
      modal.contentEl.createEl("h3", { text: "Delete Encounter?" });
      modal.contentEl.createEl("p", { text: `Are you sure you want to delete "${this.encounterName}"?` });
      modal.contentEl.createEl("p", { 
        text: "This will remove the encounter file and its saved data.", 
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

      // Remove from Party Manager encounters
      await this.plugin.partyManager.deleteEncounter(this.encounterName);

      new Notice(`✓ Encounter "${this.encounterName}" deleted`);
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
