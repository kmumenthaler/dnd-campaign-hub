import { App, Modal, Notice, Setting, TFile, TFolder, requestUrl } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SpellDetailsModal } from "./SpellDetailsModal";

export class SpellImportModal extends Modal {
  plugin: DndCampaignHubPlugin;
  spellList: any[] = [];
  filteredSpells: any[] = [];
  selectedSpell: any = null;
  searchQuery = "";
  filterLevels: string[] = [];
  filterSchools: string[] = [];
  filterClasses: string[] = [];
  isLoading = false;
  private readonly CACHE_PATH = ".obsidian/plugins/dnd-campaign-hub/spell-cache.json";
  private readonly CACHE_EXPIRY_DAYS = 7;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async loadSpellCache(): Promise<any[] | null> {
    try {
      const exists = await this.app.vault.adapter.exists(this.CACHE_PATH);
      if (!exists) {
        return null;
      }

      const cacheContent = await this.app.vault.adapter.read(this.CACHE_PATH);
      const cache = JSON.parse(cacheContent);

      // Check cache age
      const ageMs = Date.now() - cache.timestamp;
      const maxAgeMs = this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      
      if (ageMs > maxAgeMs) {
        return null;
      }

      return cache.spells || [];
    } catch (error) {
      console.error("Failed to load spell cache:", error);
      return null;
    }
  }

  async saveSpellCache(spells: any[]): Promise<void> {
    try {
      const cache = {
        version: "2014",
        timestamp: Date.now(),
        count: spells.length,
        spells: spells
      };

      const cacheContent = JSON.stringify(cache);
      await this.app.vault.adapter.write(this.CACHE_PATH, cacheContent);
    } catch (error) {
      console.error("Failed to save spell cache:", error);
    }
  }

  async refreshSpellsFromAPI(container: HTMLElement, listContainer: HTMLElement): Promise<void> {
    const loadingEl = container.createEl("div", { 
      text: "Refreshing spells from D&D 5e SRD API...",
      cls: "spell-loading"
    });

    try {
      const response = await requestUrl({
        url: "https://www.dnd5eapi.co/api/2014/spells",
        method: "GET"
      });

      const spellRefs = response.json.results || [];
      loadingEl.setText(`Loading spell details... (0/${spellRefs.length})`);

      this.spellList = [];
      for (let i = 0; i < spellRefs.length; i++) {
        try {
          const detailResponse = await requestUrl({
            url: `https://www.dnd5eapi.co${spellRefs[i].url}`,
            method: "GET"
          });
          this.spellList.push(detailResponse.json);
          
          if (i % 10 === 0 || i === spellRefs.length - 1) {
            loadingEl.setText(`Loading spell details... (${i + 1}/${spellRefs.length})`);
          }
        } catch (error) {
          console.error(`Failed to load spell: ${spellRefs[i].name}`, error);
        }
      }

      await this.saveSpellCache(this.spellList);
      this.filteredSpells = [...this.spellList];
      loadingEl.remove();
      this.renderSpellList(listContainer);
    } catch (error) {
      loadingEl.setText("❌ Failed to load spells from API. Please check your internet connection.");
      console.error("Spell API error:", error);
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("spell-import-modal");

    contentEl.createEl("h2", { text: "📖 Spell Library" });
    contentEl.createEl("p", { 
      text: "Import spells from the D&D 5e SRD or create your own custom spell.",
      cls: "setting-item-description"
    });

    // Create tabs
    const tabContainer = contentEl.createEl("div", { cls: "spell-tabs" });
    
    const srdTab = tabContainer.createEl("button", { 
      text: "📚 SRD Spells",
      cls: "spell-tab active"
    });
    
    const customTab = tabContainer.createEl("button", { 
      text: "✨ Custom Spell",
      cls: "spell-tab"
    });

    // Content containers
    const srdContent = contentEl.createEl("div", { cls: "spell-content active" });
    const customContent = contentEl.createEl("div", { cls: "spell-content hidden" });

    // Tab switching
    srdTab.addEventListener("click", () => {
      srdTab.addClass("active");
      customTab.removeClass("active");
      srdContent.removeClass("hidden");
      srdContent.addClass("active");
      customContent.removeClass("active");
      customContent.addClass("hidden");
    });

    customTab.addEventListener("click", () => {
      customTab.addClass("active");
      srdTab.removeClass("active");
      customContent.removeClass("hidden");
      customContent.addClass("active");
      srdContent.removeClass("active");
      srdContent.addClass("hidden");
    });

    // SRD Content
    await this.renderSRDContent(srdContent);

    // Custom Content  
    this.renderCustomContent(customContent);
  }

  async renderSRDContent(container: HTMLElement) {
    // Top bar with search and refresh button
    const topBar = container.createEl("div", { cls: "spell-top-bar" });
    
    // Search
    const searchInput = topBar.createEl("input", {
      type: "text",
      placeholder: "Search spells...",
      cls: "spell-search-input"
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.toLowerCase();
      this.filterAndRenderSpells(listContainer);
    });

    // Refresh button
    const refreshBtn = topBar.createEl("button", { 
      text: "🔄 Refresh from API",
      cls: "spell-refresh-btn"
    });

    // Bulk import button
    const bulkImportBtn = topBar.createEl("button", { 
      text: "📥 Import All",
      cls: "spell-bulk-import-btn"
    });

    // Filters container
    const filterContainer = container.createEl("div", { cls: "spell-filters" });

    // Level filter
    const levelFilterDiv = filterContainer.createEl("div", { cls: "spell-filter-group" });
    levelFilterDiv.createEl("div", { text: "Level:", cls: "spell-filter-label" });
    const levelDropdown = this.createMultiSelectDropdown(levelFilterDiv, [
      { value: "0", label: "Cantrip" },
      { value: "1", label: "Level 1" },
      { value: "2", label: "Level 2" },
      { value: "3", label: "Level 3" },
      { value: "4", label: "Level 4" },
      { value: "5", label: "Level 5" },
      { value: "6", label: "Level 6" },
      { value: "7", label: "Level 7" },
      { value: "8", label: "Level 8" },
      { value: "9", label: "Level 9" }
    ], (selected) => {
      this.filterLevels = selected;
      this.filterAndRenderSpells(listContainer);
    });

    // School filter
    const schoolFilterDiv = filterContainer.createEl("div", { cls: "spell-filter-group" });
    schoolFilterDiv.createEl("div", { text: "School:", cls: "spell-filter-label" });
    const schoolDropdown = this.createMultiSelectDropdown(schoolFilterDiv, [
      { value: "abjuration", label: "Abjuration" },
      { value: "conjuration", label: "Conjuration" },
      { value: "divination", label: "Divination" },
      { value: "enchantment", label: "Enchantment" },
      { value: "evocation", label: "Evocation" },
      { value: "illusion", label: "Illusion" },
      { value: "necromancy", label: "Necromancy" },
      { value: "transmutation", label: "Transmutation" }
    ], (selected) => {
      this.filterSchools = selected;
      this.filterAndRenderSpells(listContainer);
    });

    // Class filter
    const classFilterDiv = filterContainer.createEl("div", { cls: "spell-filter-group" });
    classFilterDiv.createEl("div", { text: "Class:", cls: "spell-filter-label" });
    const classCheckboxes = classFilterDiv.createEl("div", { cls: "spell-filter-checkboxes" });
    const classes = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];
    classes.forEach((className) => {
      const checkboxContainer = classCheckboxes.createEl("label", { cls: "spell-checkbox" });
      const checkbox = checkboxContainer.createEl("input", { type: "checkbox" });
      checkbox.value = className.toLowerCase();
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.filterClasses.push(className.toLowerCase());
        } else {
          this.filterClasses = this.filterClasses.filter(c => c !== className.toLowerCase());
        }
        this.filterAndRenderSpells(listContainer);
      });
      checkboxContainer.createEl("span", { text: className });
    });

    // Spell list container
    const listContainer = container.createEl("div", { cls: "spell-list-container" });

    // Loading indicator
    const loadingEl = container.createEl("div", { 
      text: "Loading spells...",
      cls: "spell-loading"
    });

    // Try to load from cache first
    const cachedSpells = await this.loadSpellCache();
    if (cachedSpells && cachedSpells.length > 0) {
      this.spellList = cachedSpells;
      this.filteredSpells = [...this.spellList];
      loadingEl.setText(`✓ Loaded ${cachedSpells.length} spells from cache`);
      setTimeout(() => loadingEl.remove(), 1000);
      this.renderSpellList(listContainer);
    } else {
      // Fetch from API if no cache
      await this.refreshSpellsFromAPI(container, listContainer);
    }

    // Refresh button handler
    refreshBtn.addEventListener("click", async () => {
      listContainer.empty();
      this.searchQuery = "";
      this.filterLevels = [];
      this.filterSchools = [];
      this.filterClasses = [];
      searchInput.value = "";
      // Clear select options
      levelDropdown.clearSelections();
      schoolDropdown.clearSelections();
      // Uncheck all checkboxes
      filterContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        (cb as HTMLInputElement).checked = false;
      });
      await this.refreshSpellsFromAPI(container, listContainer);
    });

    // Bulk import button handler
    bulkImportBtn.addEventListener("click", async () => {
      await this.bulkImportAllSpells(bulkImportBtn);
    });
  }

  async bulkImportAllSpells(button?: HTMLElement) {
    try {
      // Prevent multiple simultaneous imports
      if (button) {
        if (button.hasClass("importing")) {
          new Notice("Import already in progress...");
          return;
        }
        button.addClass("importing");
        button.textContent = "⏳ Importing...";
        (button as HTMLButtonElement).disabled = true;
      }

      // Ensure spells are loaded
      if (this.spellList.length === 0) {
        new Notice("Loading spells from API first...");
        const response = await requestUrl({
          url: "https://www.dnd5eapi.co/api/2014/spells",
          method: "GET"
        });
        const spellRefs = response.json.results || [];
        
        for (let i = 0; i < spellRefs.length; i++) {
          try {
            const detailResponse = await requestUrl({
              url: `https://www.dnd5eapi.co${spellRefs[i].url}`,
              method: "GET"
            });
            this.spellList.push(detailResponse.json);
          } catch (error) {
            console.error(`Failed to load spell: ${spellRefs[i].name}`, error);
          }
        }
        await this.saveSpellCache(this.spellList);
      }

      // Create z_Spells folder
      const spellsPath = "z_Spells";
      await this.plugin.ensureFolderExists(spellsPath);

      let successCount = 0;
      let errorCount = 0;
      const totalSpells = this.spellList.length;

      new Notice(`Starting bulk import of ${totalSpells} spells...`);

      for (let i = 0; i < this.spellList.length; i++) {
        try {
          const spell = this.spellList[i];
          const filePath = `${spellsPath}/${spell.name}.md`;
          
          // Check if file already exists
          const exists = await this.app.vault.adapter.exists(filePath);
          if (exists) {
            successCount++;
            continue;
          }

          // Build spell content
          const levelText = spell.level === 0 ? "Cantrip" : spell.level.toString();
          const components = spell.components.join(", ");
          const material = spell.material ? `\nMaterials: ${spell.material}` : "";
          
          const description = spell.desc.join("\n\n");
          const higherLevel = spell.higher_level && spell.higher_level.length > 0 
            ? spell.higher_level.join("\n\n")
            : "N/A";

          const classes = spell.classes && spell.classes.length > 0
            ? spell.classes.map((c: any) => c.name).join(", ")
            : "N/A";

          const content = `---
type: spell
template_version: 1.0.0
name: ${spell.name}
level: ${spell.level}
school: ${spell.school.name}
casting_time: ${spell.casting_time}
range: ${spell.range}
components: ${components}
duration: ${spell.duration}
concentration: ${spell.concentration || false}
ritual: ${spell.ritual || false}
classes: ${classes}
source: SRD
---

# ${spell.name}

**${levelText} ${spell.school.name}**

**Casting Time:** ${spell.casting_time}  
**Range:** ${spell.range}  
**Components:** ${components}${material}  
**Duration:** ${spell.duration}${spell.concentration ? " (Concentration)" : ""}${spell.ritual ? " (Ritual)" : ""}

## Description

${description}

## At Higher Levels

${higherLevel}

## Classes

${classes}
`;

          await this.app.vault.create(filePath, content);
          successCount++;

          // Update progress notification every 50 spells
          if (i % 50 === 0 && i > 0) {
            new Notice(`Importing spells... ${i}/${totalSpells}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Failed to import ${this.spellList[i].name}:`, error);
        }
      }

      new Notice(`✅ Bulk import complete! ${successCount} spells imported, ${errorCount} errors.`);
    } catch (error) {
      new Notice(`❌ Bulk import failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Bulk import error:", error);
    } finally {
      // Re-enable button
      if (button) {
        button.removeClass("importing");
        button.textContent = "📥 Import All";
        (button as HTMLButtonElement).disabled = false;
      }
    }
  }

  createMultiSelectDropdown(
    parent: HTMLElement, 
    options: Array<{value: string, label: string}>, 
    onChange: (selected: string[]) => void
  ) {
    const dropdownContainer = parent.createEl("div", { cls: "custom-multiselect" });
    const dropdownButton = dropdownContainer.createEl("button", { 
      cls: "custom-multiselect-button",
      text: "Select..."
    });
    const dropdownList = dropdownContainer.createEl("div", { cls: "custom-multiselect-list" });
    dropdownList.style.display = "none";

    const selectedValues = new Set<string>();
    const checkboxes: Array<{checkbox: HTMLInputElement, value: string}> = [];

    options.forEach(option => {
      const item = dropdownList.createEl("label", { cls: "custom-multiselect-item" });
      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.value = option.value;
      item.createEl("span", { text: option.label });

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedValues.add(option.value);
        } else {
          selectedValues.delete(option.value);
        }
        updateButtonText();
        onChange(Array.from(selectedValues));
      });

      checkboxes.push({ checkbox, value: option.value });
    });

    const updateButtonText = () => {
      if (selectedValues.size === 0) {
        dropdownButton.textContent = "Select...";
      } else {
        dropdownButton.textContent = `${selectedValues.size} selected`;
      }
    };

    dropdownButton.addEventListener("click", (e) => {
      e.preventDefault();
      const isVisible = dropdownList.style.display !== "none";
      dropdownList.style.display = isVisible ? "none" : "block";
    });

    // Close dropdown when clicking outside (use named fn so it can be removed)
    const closeDropdown = (e: MouseEvent) => {
      if (!dropdownContainer.contains(e.target as Node)) {
        dropdownList.style.display = "none";
      }
    };
    document.addEventListener("click", closeDropdown);
    // Clean up when the element is detached from the DOM
    const dropdownObserver = new MutationObserver(() => {
      if (!dropdownContainer.isConnected) {
        document.removeEventListener("click", closeDropdown);
        dropdownObserver.disconnect();
      }
    });
    dropdownObserver.observe(dropdownContainer.parentElement || document.body, { childList: true, subtree: true });

    return {
      clearSelections: () => {
        selectedValues.clear();
        checkboxes.forEach(item => item.checkbox.checked = false);
        updateButtonText();
      }
    };
  }

  filterAndRenderSpells(container: HTMLElement) {
    this.filteredSpells = this.spellList.filter(spell => {
      // Search filter
      const matchesSearch = spell.name.toLowerCase().includes(this.searchQuery);
      
      // Level filter (if any levels selected, spell must match one of them)
      const matchesLevel = this.filterLevels.length === 0 || 
        this.filterLevels.includes(spell.level.toString());
      
      // School filter (if any schools selected, spell must match one of them)
      const matchesSchool = this.filterSchools.length === 0 || 
        this.filterSchools.includes(spell.school?.name?.toLowerCase());
      
      // Class filter (if any classes selected, spell must be available to one of them)
      const matchesClass = this.filterClasses.length === 0 || 
        spell.classes?.some((c: any) => this.filterClasses.includes(c.name.toLowerCase()));
      
      return matchesSearch && matchesLevel && matchesSchool && matchesClass;
    });

    this.renderSpellList(container);
  }

  renderSpellList(container: HTMLElement) {
    container.empty();

    if (this.filteredSpells.length === 0) {
      container.createEl("div", { 
        text: "No spells found matching your search.",
        cls: "empty-message"
      });
      return;
    }

    const list = container.createEl("div", { cls: "spell-list" });
    
    this.filteredSpells.forEach(spell => {
      const item = list.createEl("div", { cls: "spell-list-item" });
      const levelText = spell.level === 0 ? "Cantrip" : `Lvl ${spell.level}`;
      const schoolText = spell.school?.name || "Unknown";
      const classNames = spell.classes?.map((c: any) => c.name).join(", ") || "";
      
      item.createEl("span", { 
        text: spell.name,
        cls: "spell-item-name"
      });
      item.createEl("span", { 
        text: ` (${levelText} ${schoolText})`,
        cls: "spell-item-meta"
      });
      if (classNames) {
        item.createEl("div", { 
          text: classNames,
          cls: "spell-item-classes"
        });
      }
      
      item.addEventListener("click", async () => {
        await this.showSpellDetails(spell);
      });
    });

    container.createEl("div", { 
      text: `${this.filteredSpells.length} spells found`,
      cls: "spell-count"
    });
  }

  async showSpellDetails(spell: any) {
    try {
      // Spell data is already loaded from initial fetch
      this.selectedSpell = spell;

      // Show modal with spell details
      new SpellDetailsModal(this.app, this.plugin, spell).open();
      this.close();
    } catch (error) {
      new Notice("❌ Failed to load spell details");
      console.error("Spell details error:", error);
    }
  }

  renderCustomContent(container: HTMLElement) {
    container.createEl("p", {
      text: "Create your own custom spell with D&D 5e format.",
      cls: "setting-item-description"
    });

    let spellName = "";

    new Setting(container)
      .setName("Spell Name")
      .setDesc("Name of your custom spell")
      .addText((text) => {
        text.setPlaceholder("e.g., Arcane Blast")
          .onChange((value) => {
            spellName = value;
          });
        text.inputEl.focus();
      });

    const buttonContainer = container.createEl("div", { cls: "dnd-modal-buttons" });
    
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const createBtn = buttonContainer.createEl("button", { 
      text: "Create Custom Spell",
      cls: "mod-cta"
    });
    createBtn.addEventListener("click", async () => {
      if (!spellName.trim()) {
        new Notice("Please enter a spell name");
        return;
      }

      await this.createCustomSpell(spellName);
      this.close();
    });
  }

  async createCustomSpell(spellName: string) {
    try {
      const spellPath = `${this.plugin.settings.currentCampaign}/Spells`;
      await this.plugin.ensureFolderExists(spellPath);

      const template = this.plugin.getDefaultSpellTemplate();
      const filePath = `${spellPath}/${spellName}.md`;

      // Update template with spell name
      const content = template.replace("# Spell", `# ${spellName}`);

      await this.app.vault.create(filePath, content);
      await this.app.workspace.openLinkText(filePath, "", true);
      new Notice(`✅ Custom spell "${spellName}" created!`);
    } catch (error) {
      new Notice(`❌ Error creating spell: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}