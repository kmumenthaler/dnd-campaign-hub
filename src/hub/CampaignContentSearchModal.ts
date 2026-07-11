import { App, Modal, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { CampaignSearchItem, searchCampaignItems } from "./campaignSearch";

const SEARCHABLE_TYPES = new Set(["session", "adventure", "scene", "encounter", "npc", "pc", "player", "creature", "item", "map", "battlemap"]);
const TYPE_LABELS: Record<string, string> = { pc: "PC", player: "PC", npc: "NPC", battlemap: "Map" };

export class CampaignContentSearchModal extends Modal {
  private items: Array<CampaignSearchItem & { file: TFile }> = [];
  private selectedIndex = 0;

  constructor(app: App, private plugin: DndCampaignHubPlugin, private campaignPath = plugin.getActiveCampaignPath()) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-campaign-content-search");
    contentEl.createEl("h2", { text: "Find Campaign Content" });
    contentEl.createEl("p", { text: this.campaignPath ? `Searching ${this.campaignPath}` : "Select a campaign in Campaign Home first.", cls: "setting-item-description" });
    if (!this.campaignPath) {
      contentEl.createEl("p", { text: "No active campaign. Open Campaign Home and select or create a campaign.", cls: "dnd-hub-empty" });
      return;
    }
    this.items = this.collectItems();
    if (this.items.length === 0) {
      contentEl.createEl("p", { text: "No searchable campaign notes yet. Create a session, adventure, scene, encounter, character, creature, item, or map note first.", cls: "dnd-hub-empty" });
      return;
    }
    const input = contentEl.createEl("input", { type: "search", placeholder: "Search sessions, scenes, NPCs, items…", cls: "dnd-campaign-search-input" });
    input.setAttribute("aria-label", "Search campaign content");
    const results = contentEl.createDiv({ cls: "dnd-campaign-search-results" });
    let visible = this.items.slice(0, 50);
    const updateSelection = () => {
      Array.from(results.children).forEach((child, index) => child.toggleClass("is-selected", index === this.selectedIndex));
    };
    const render = () => {
      visible = searchCampaignItems(this.items, input.value, 50) as typeof this.items;
      this.selectedIndex = Math.min(this.selectedIndex, Math.max(visible.length - 1, 0));
      results.empty();
      if (visible.length === 0) {
        results.createEl("p", { text: `No campaign content matches “${input.value}”. Try a name, type, or adventure/folder.`, cls: "dnd-hub-empty" });
        return;
      }
      visible.forEach((item, index) => {
        const row = results.createDiv({ cls: `dnd-campaign-search-result${index === this.selectedIndex ? " is-selected" : ""}` });
        row.createEl("strong", { text: item.name });
        row.createEl("span", { text: `${TYPE_LABELS[item.type] || item.type} · ${item.context}`, cls: "setting-item-description" });
        row.addEventListener("mouseenter", () => { this.selectedIndex = index; updateSelection(); });
        row.addEventListener("click", () => void this.openItem(item));
      });
    };
    input.addEventListener("input", () => { this.selectedIndex = 0; render(); });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") { event.preventDefault(); this.selectedIndex = Math.min(this.selectedIndex + 1, visible.length - 1); render(); }
      if (event.key === "ArrowUp") { event.preventDefault(); this.selectedIndex = Math.max(this.selectedIndex - 1, 0); render(); }
      if (event.key === "Enter" && visible[this.selectedIndex]) { event.preventDefault(); void this.openItem(visible[this.selectedIndex]!); }
    });
    render();
    window.setTimeout(() => input.focus(), 0);
  }

  private collectItems(): Array<CampaignSearchItem & { file: TFile }> {
    const seen = new Set<string>();
    const result: Array<CampaignSearchItem & { file: TFile }> = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!(file.path === this.campaignPath || file.path.startsWith(`${this.campaignPath}/`)) || seen.has(file.path)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const rawType = String(fm?.type || "").toLowerCase();
      if (!SEARCHABLE_TYPES.has(rawType)) continue;
      seen.add(file.path);
      const type = rawType === "player" ? "pc" : rawType === "battlemap" ? "map" : rawType;
      const parent = file.parent?.path.replace(`${this.campaignPath}/`, "") || "Campaign root";
      const linkedAdventure = String(fm?.adventure || "").replace(/^\[\[|\]\]$/g, "");
      result.push({ file, path: file.path, name: String(fm?.name || file.basename), type, context: linkedAdventure || parent });
    }
    return result;
  }

  private async openItem(item: CampaignSearchItem & { file: TFile }): Promise<void> {
    try {
      await this.app.workspace.getLeaf("tab").openFile(item.file);
      this.close();
    } catch (error) {
      console.error("[CampaignSearch] Could not open note", error);
      new Notice("Could not open that campaign note.");
    }
  }
}
