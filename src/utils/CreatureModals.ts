import { App, Modal, Notice, Setting } from "obsidian";

/**
 * Modal for selecting a single creature from a list.
 */
export class CreatureSelectorModal extends Modal {
  creatures: any[];
  onSelect: (creature: any) => void;
  searchInput!: HTMLInputElement;
  resultsContainer!: HTMLElement;

  constructor(app: App, creatures: any[], onSelect: (creature: any) => void) {
    super(app);
    this.creatures = creatures;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("encounter-creature-selector");

    contentEl.createEl("h2", { text: "Select Creature" });

    const searchContainer = contentEl.createDiv({ cls: "search-input-container" });
    this.searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search creatures by name...",
      cls: "search-input"
    });

    this.searchInput.addEventListener("input", () => this.updateResults());
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstResult = this.resultsContainer.querySelector(".creature-item");
        if (firstResult) {
          (firstResult as HTMLElement).click();
        }
      }
    });

    this.resultsContainer = contentEl.createDiv({ cls: "creature-results" });
    this.updateResults();
    setTimeout(() => this.searchInput.focus(), 100);
  }

  updateResults() {
    this.resultsContainer.empty();
    
    const searchTerm = this.searchInput.value.toLowerCase();
    const filtered = this.creatures.filter(c => 
      (c.name || "").toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      this.resultsContainer.createDiv({ 
        text: "No creatures found", 
        cls: "no-results" 
      });
      return;
    }

    const displayList = filtered.slice(0, 50);
    
    displayList.forEach(creature => {
      const item = this.resultsContainer.createDiv({ cls: "creature-item" });
      
      const nameEl = item.createDiv({ cls: "creature-name" });
      nameEl.setText(creature.name || "Unknown");
      
      const detailsEl = item.createDiv({ cls: "creature-details" });
      const cr = creature.cr?.toString() || "?";
      const source = creature.source || "Unknown";
      detailsEl.setText(`CR ${cr} • ${source}`);
      
      item.addEventListener("click", () => {
        this.onSelect(creature);
        this.close();
      });
    });

    if (filtered.length > 50) {
      this.resultsContainer.createDiv({ 
        text: `Showing 50 of ${filtered.length} results. Refine your search.`,
        cls: "results-note"
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal for selecting multiple creatures from a list.
 */
export class MultiCreatureSelectorModal extends Modal {
  creatures: any[];
  onSelect: (creatures: any[]) => void;
  searchInput!: HTMLInputElement;
  resultsContainer!: HTMLElement;
  footerContainer!: HTMLElement;
  selectedKeys = new Set<string>();
  creatureByKey = new Map<string, any>();

  constructor(app: App, creatures: any[], onSelect: (creatures: any[]) => void) {
    super(app);
    this.creatures = creatures;
    this.onSelect = onSelect;
    for (const c of creatures) {
      this.creatureByKey.set(this.getKey(c), c);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("encounter-creature-selector");

    contentEl.createEl("h2", { text: "Select Creatures" });

    const searchContainer = contentEl.createDiv({ cls: "search-input-container" });
    this.searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search creatures by name...",
      cls: "search-input"
    });

    this.searchInput.addEventListener("input", () => this.updateResults());

    this.resultsContainer = contentEl.createDiv({ cls: "creature-results" });
    this.footerContainer = contentEl.createDiv({ cls: "creature-selector-footer" });
    this.footerContainer.style.display = "flex";
    this.footerContainer.style.justifyContent = "space-between";
    this.footerContainer.style.alignItems = "center";
    this.footerContainer.style.marginTop = "10px";

    const leftControls = this.footerContainer.createDiv();
    leftControls.style.display = "flex";
    leftControls.style.gap = "10px";

    const selectVisibleBtn = leftControls.createEl("button", { text: "Select Visible" });
    selectVisibleBtn.onclick = () => {
      const visibleItems = this.resultsContainer.querySelectorAll(".creature-item[data-key]");
      visibleItems.forEach((el) => {
        const key = (el as HTMLElement).dataset.key;
        if (key) this.selectedKeys.add(key);
      });
      this.updateResults();
    };

    const clearBtn = leftControls.createEl("button", { text: "Clear" });
    clearBtn.onclick = () => {
      this.selectedKeys.clear();
      this.updateResults();
    };

    const actionControls = this.footerContainer.createDiv();
    actionControls.style.display = "flex";
    actionControls.style.gap = "10px";

    const addSelectedBtn = actionControls.createEl("button", { text: "Add Selected" });
    addSelectedBtn.onclick = () => {
      const selectedCreatures = Array.from(this.selectedKeys)
        .map((key) => this.creatureByKey.get(key))
        .filter(Boolean);
      if (selectedCreatures.length > 0) {
        this.onSelect(selectedCreatures);
        this.close();
      }
    };

    const cancelBtn = actionControls.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    this.updateResults();
    setTimeout(() => this.searchInput.focus(), 100);
  }

  getKey(creature: any): string {
    return creature?.path ? `${creature.path}::${creature.name}` : (creature?.name || "Unknown");
  }

  updateResults() {
    this.resultsContainer.empty();

    const searchTerm = this.searchInput.value.toLowerCase();
    const filtered = this.creatures.filter(c =>
      (c.name || "").toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      this.resultsContainer.createDiv({
        text: "No creatures found",
        cls: "no-results"
      });
      return;
    }

    const displayList = filtered.slice(0, 50);

    displayList.forEach(creature => {
      const key = this.getKey(creature);
      const item = this.resultsContainer.createDiv({ cls: "creature-item" });
      item.dataset.key = key;
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.gap = "10px";

      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selectedKeys.has(key);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selectedKeys.add(key);
        } else {
          this.selectedKeys.delete(key);
        }
      };

      const infoDiv = item.createDiv();
      const nameEl = infoDiv.createDiv({ cls: "creature-name" });
      nameEl.setText(creature.name || "Unknown");

      const detailsEl = infoDiv.createDiv({ cls: "creature-details" });
      const cr = creature.cr?.toString() || "?";
      const source = creature.source || "Unknown";
      detailsEl.setText(`CR ${cr} • ${source}`);

      item.addEventListener("click", (evt) => {
        if ((evt.target as HTMLElement).tagName.toLowerCase() === "input") return;
        checkbox.checked = !checkbox.checked;
        checkbox.onchange?.(new Event("change"));
      });
    });

    if (filtered.length > 50) {
      this.resultsContainer.createDiv({
        text: `Showing 50 of ${filtered.length} results. Refine your search.`,
        cls: "results-note"
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Simple modal to prompt for a new creature name when renaming/copying.
 */
export class RenameCreatureModal extends Modal {
  originalName: string;
  onSubmit: (newName: string) => void;

  constructor(app: App, originalName: string, onSubmit: (newName: string) => void) {
    super(app);
    this.originalName = originalName;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Rename Creature" });
    contentEl.createEl("p", {
      text: `This will create a copy of "${this.originalName}" with a new name, including its stats and map token.`,
      cls: "setting-item-description"
    });

    let newName = "";
    new Setting(contentEl)
      .setName("New Name")
      .addText(text => {
        text.setPlaceholder("e.g. Bandit Captain's Guard")
          .onChange(value => { newName = value.trim(); });
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && newName) {
            this.onSubmit(newName);
            this.close();
          }
        });
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Create Copy")
        .setCta()
        .onClick(() => {
          if (!newName) {
            new Notice("Please enter a name.");
            return;
          }
          this.onSubmit(newName);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText("Cancel")
        .onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}
