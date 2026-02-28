/**
 * Insert Encounter Widget Modal
 *
 * A searchable picker that lists all encounter notes from z_Encounters.
 * On selection, calls back with a `dnd-encounter` code block referencing
 * the chosen encounter, ready to be inserted at the editor cursor.
 */

import { App, Modal, Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

interface EncounterEntry {
  file: TFile;
  name: string;
  difficulty: string;
  difficultyColor: string;
  creatureSummary: string;
  partyCount: number;
}

export class InsertEncounterWidgetModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private onSelect: (codeblock: string) => void;
  private encounters: EncounterEntry[] = [];
  private filtered: EncounterEntry[] = [];
  private listContainer: HTMLElement | null = null;
  private selectedIndex = 0;

  constructor(
    app: App,
    plugin: DndCampaignHubPlugin,
    onSelect: (codeblock: string) => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-insert-encounter-widget-modal");

    contentEl.createEl("h2", { text: "⚔️ Insert Encounter Widget" });

    // Search bar
    const searchContainer = contentEl.createDiv({ cls: "encounter-widget-search" });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search encounters…",
      cls: "encounter-widget-search-input",
    });
    searchInput.style.width = "100%";
    searchInput.style.padding = "8px 12px";
    searchInput.style.marginBottom = "12px";
    searchInput.style.borderRadius = "6px";
    searchInput.style.border = "1px solid var(--background-modifier-border)";
    searchInput.style.background = "var(--background-primary)";
    searchInput.style.color = "var(--text-normal)";
    searchInput.style.fontSize = "14px";

    searchInput.addEventListener("input", () => {
      this.filterEncounters(searchInput.value);
    });

    // Keyboard navigation
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
        this.highlightSelected();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.highlightSelected();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = this.filtered[this.selectedIndex];
        if (selected) {
          this.selectEncounter(selected);
        }
      }
    });

    // Loading state
    const loadingEl = contentEl.createDiv();
    loadingEl.createEl("p", { text: "Loading encounters…", cls: "encounter-widget-loading" });
    loadingEl.style.textAlign = "center";
    loadingEl.style.color = "var(--text-muted)";
    loadingEl.style.padding = "20px 0";

    // List container
    this.listContainer = contentEl.createDiv({ cls: "encounter-widget-list" });
    this.listContainer.style.maxHeight = "400px";
    this.listContainer.style.overflowY = "auto";

    // Load encounters
    await this.loadEncounters();
    loadingEl.remove();

    if (this.encounters.length === 0) {
      this.renderEmptyState();
    } else {
      this.filtered = [...this.encounters];
      this.renderList();
    }

    // Auto-focus search
    setTimeout(() => searchInput.focus(), 50);
  }

  private async loadEncounters() {
    // Scan all markdown files looking for encounter frontmatter
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (!file.path.includes("z_Encounters")) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || fm.type !== "encounter") continue;

      const creatures = fm.creatures || [];
      const creatureSummary = creatures
        .map((c: any) => `${c.count || 1}× ${c.name}`)
        .join(", ");

      this.encounters.push({
        file,
        name: fm.name || file.basename,
        difficulty: fm.difficulty?.rating || "Unknown",
        difficultyColor: fm.difficulty?.color || "#888888",
        creatureSummary: creatureSummary || "No creatures",
        partyCount: fm.difficulty?.party_count || 0,
      });
    }

    // Sort alphabetically
    this.encounters.sort((a, b) => a.name.localeCompare(b.name));
  }

  private filterEncounters(query: string) {
    const q = query.toLowerCase().trim();
    this.selectedIndex = 0;

    if (!q) {
      this.filtered = [...this.encounters];
    } else {
      this.filtered = this.encounters.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.difficulty.toLowerCase().includes(q) ||
          e.creatureSummary.toLowerCase().includes(q),
      );
    }
    this.renderList();
  }

  private renderList() {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.filtered.length === 0) {
      const empty = this.listContainer.createDiv();
      empty.style.textAlign = "center";
      empty.style.padding = "20px";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No encounters match your search";
      return;
    }

    this.filtered.forEach((entry, i) => {
      const row = this.listContainer!.createDiv({ cls: "encounter-widget-row" });
      row.style.padding = "10px 12px";
      row.style.borderRadius = "6px";
      row.style.cursor = "pointer";
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.marginBottom = "4px";
      row.style.border = "1px solid transparent";
      row.style.transition = "background 0.1s";

      // Difficulty badge
      const badge = row.createEl("span");
      badge.textContent = entry.difficulty;
      badge.style.display = "inline-block";
      badge.style.padding = "2px 8px";
      badge.style.borderRadius = "10px";
      badge.style.fontSize = "11px";
      badge.style.fontWeight = "600";
      badge.style.color = "#fff";
      badge.style.backgroundColor = entry.difficultyColor;
      badge.style.flexShrink = "0";
      badge.style.minWidth = "55px";
      badge.style.textAlign = "center";

      // Text column
      const textCol = row.createDiv();
      textCol.style.flex = "1";
      textCol.style.minWidth = "0";

      const nameEl = textCol.createDiv();
      nameEl.textContent = entry.name;
      nameEl.style.fontWeight = "600";
      nameEl.style.fontSize = "14px";
      nameEl.style.color = "var(--text-normal)";

      const detailEl = textCol.createDiv();
      detailEl.textContent = entry.creatureSummary;
      detailEl.style.fontSize = "12px";
      detailEl.style.color = "var(--text-muted)";
      detailEl.style.whiteSpace = "nowrap";
      detailEl.style.overflow = "hidden";
      detailEl.style.textOverflow = "ellipsis";

      row.addEventListener("mouseenter", () => {
        row.style.background = "var(--background-modifier-hover)";
      });
      row.addEventListener("mouseleave", () => {
        if (i !== this.selectedIndex) {
          row.style.background = "";
        }
      });
      row.addEventListener("click", () => this.selectEncounter(entry));
    });

    this.highlightSelected();
  }

  private highlightSelected() {
    if (!this.listContainer) return;
    const rows = this.listContainer.querySelectorAll(".encounter-widget-row");
    rows.forEach((row, i) => {
      const el = row as HTMLElement;
      if (i === this.selectedIndex) {
        el.style.background = "var(--background-modifier-hover)";
        el.style.borderColor = "var(--interactive-accent)";
        el.scrollIntoView({ block: "nearest" });
      } else {
        el.style.background = "";
        el.style.borderColor = "transparent";
      }
    });
  }

  private selectEncounter(entry: EncounterEntry) {
    // Build the code block referencing the encounter via wikilink
    const wikilink = entry.file.path.replace(/\.md$/, "");
    const codeblock = `\`\`\`dnd-encounter\n[[${wikilink}]]\n\`\`\``;
    this.onSelect(codeblock);
    this.close();
  }

  private renderEmptyState() {
    if (!this.listContainer) return;
    this.listContainer.empty();

    const empty = this.listContainer.createDiv();
    empty.style.textAlign = "center";
    empty.style.padding = "30px 20px";

    empty.createEl("p", { text: "No encounters found." }).style.color = "var(--text-muted)";
    empty.createEl("p", { text: "Create encounters first using the Encounter Builder." }).style.color = "var(--text-faint)";
    empty.style.fontSize = "13px";

    const createBtn = empty.createEl("button", {
      text: "⚔️ Create Encounter",
      cls: "mod-cta",
    });
    createBtn.style.marginTop = "12px";
    createBtn.addEventListener("click", () => {
      this.close();
      this.plugin.createEncounter();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
