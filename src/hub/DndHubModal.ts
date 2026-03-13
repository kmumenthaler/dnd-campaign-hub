import { App, Modal, Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

/* ── Browse-category definition ──────────────────────────────── */

interface BrowseCategory {
  label: string;
  icon: string;
  /**
   * Return one or more folder paths to scan.
   * Receives the list of all campaign paths (e.g. ["ttrpgs/Eberron", "ttrpgs/Greyhawk"]).
   */
  folders: (campaigns: string[]) => string[];
  /** Frontmatter `type` value(s) to match. */
  types?: string[];
  /** Search subfolders? */
  recursive?: boolean;
  /** Subtitle renderer – one-liner shown beside each entity name. */
  subtitle?: (fm: Record<string, any>) => string;
}

/** Single query result with campaign origin. */
interface EntityResult {
  file: TFile;
  fm: Record<string, any>;
  /** Campaign display name (empty for global entities). */
  campaign: string;
}

/* ── The modal ───────────────────────────────────────────────── */

export class DndHubModal extends Modal {
  plugin: DndCampaignHubPlugin;
  private expandedCategory: string | null = null;
  private categoryFilters: Record<string, string> = {};

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  /* ── Browse categories ──────────────────────────────────────── */

  private getBrowseCategories(): Record<string, BrowseCategory> {
    return {
      campaigns: {
        label: "Campaigns",
        icon: "📁",
        folders: (cs) => cs,
        types: ["world"],
        recursive: false,
        subtitle: (fm) => [fm.system, fm.status].filter(Boolean).join(" · "),
      },
      npcs: {
        label: "NPCs",
        icon: "👥",
        folders: (cs) => cs.map((c) => `${c}/NPCs`),
        types: ["npc"],
        subtitle: (fm) => [fm.race, fm.location].filter(Boolean).join(" · "),
      },
      pcs: {
        label: "PCs",
        icon: "🛡️",
        folders: (cs) => cs.map((c) => `${c}/PCs`),
        types: ["player", "pc"],
        subtitle: (fm) => [fm.class, fm.level ? `Lvl ${fm.level}` : ""].filter(Boolean).join(" · "),
      },
      adventures: {
        label: "Adventures",
        icon: "🗺️",
        folders: (cs) => cs.map((c) => `${c}/Adventures`),
        types: ["adventure"],
        subtitle: (fm) => [fm.status, fm.level_range].filter(Boolean).join(" · "),
      },
      sessions: {
        label: "Sessions",
        icon: "📜",
        // Prefer canonical Sessions folders, but also scan campaign roots for legacy layouts.
        folders: (cs) => [...cs.map((c) => `${c}/Sessions`), ...cs],
        types: ["session"],
        recursive: true,
        subtitle: (fm) => fm.date || fm.summary?.slice(0, 60) || "",
      },
      factions: {
        label: "Factions",
        icon: "🏛️",
        folders: (cs) => cs.map((c) => `${c}/Factions`),
        types: ["faction"],
        subtitle: (fm) => fm.main_goal || "",
      },
      items: {
        label: "Items",
        icon: "⚔️",
        folders: (cs) => cs.map((c) => `${c}/Items`),
        types: ["item"],
        subtitle: (fm) => [fm.rarity, fm.item_type].filter(Boolean).join(" · "),
      },
      spells: {
        label: "Spells",
        icon: "✨",
        folders: () => ["z_Spells"],
        types: ["spell"],
        subtitle: (fm) => [fm.level ? `Level ${fm.level}` : "Cantrip", fm.school].filter(Boolean).join(" · "),
      },
      creatures: {
        label: "Creatures",
        icon: "🐉",
        folders: () => ["z_Beastiarity"],
        // Creature notes use statblock-style frontmatter where `type` is creature kind (humanoid, dragon, ...),
        // not entity type. Filter by folder only.
        types: undefined,
        recursive: true,
        subtitle: (fm) => [fm.size, fm.type, fm.cr ? `CR ${fm.cr}` : ""].filter(Boolean).join(" · "),
      },
      traps: {
        label: "Traps",
        icon: "🪤",
        // Support all known trap locations (global, per-campaign, and legacy campaign-root scans).
        folders: (cs) => ["z_Traps", ...cs.map((c) => `${c}/z_Traps`), ...cs],
        types: ["trap"],
        recursive: true,
        subtitle: (fm) => [fm.threat_level, fm.trap_type].filter(Boolean).join(" · "),
      },
    };
  }

  /* ── Query helpers ──────────────────────────────────────────── */

  /**
   * Resolve campaign name from a file path.
   * E.g. "ttrpgs/Eberron/NPCs/Gobbo.md" → "Eberron"
   */
  private campaignFromPath(filePath: string): string {
    if (!filePath.startsWith("ttrpgs/")) return "";
    const parts = filePath.split("/");
    return parts.length >= 2 ? (parts[1] ?? "") : "";
  }

  /** Query a single folder and return results tagged with campaign origin. */
  private queryFolder(folderPath: string, types?: string[], recursive = false): EntityResult[] {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return [];

    const files: TFile[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") files.push(child);
        else if (recursive && child instanceof TFolder) walk(child);
      }
    };
    walk(folder);

    const results: EntityResult[] = [];
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;
      if (types && types.length > 0 && !types.includes(fm.type)) continue;
      results.push({ file, fm, campaign: this.campaignFromPath(file.path) });
    }
    return results;
  }

  /** Query across multiple folders, deduplicate, and sort. */
  private queryCategory(cat: BrowseCategory, campaignPaths: string[]): EntityResult[] {
    const folders = cat.folders(campaignPaths);
    const seen = new Set<string>();
    const results: EntityResult[] = [];

    for (const folder of folders) {
      for (const r of this.queryFolder(folder, cat.types, cat.recursive)) {
        if (seen.has(r.file.path)) continue;
        seen.add(r.file.path);
        results.push(r);
      }
    }

    results.sort((a, b) => (a.fm.name || a.file.basename).localeCompare(b.fm.name || b.file.basename));
    return results;
  }

  /* ── Initialization screen ─────────────────────────────────── */

  private showInitializationUI(container: HTMLElement) {
    container.createEl("p", {
      text: "Welcome to D&D Campaign Hub! Your vault needs to be initialized before you can start creating campaigns.",
      cls: "dnd-hub-info",
    });

    container.createEl("p", { text: "This will create the following structure:" });

    const list = container.createEl("ul");
    [
      "ttrpgs/ - Main folder for all campaigns",
      "z_Templates/ - Template files for campaigns, sessions, NPCs, etc.",
      "z_Assets/ - Images and other assets",
      "z_Beastiarity/ - Monster and creature stats",
      "z_Databases/ - Campaign databases",
      "z_Log/ - Session logs",
      "z_Tables/ - Random tables and generators",
      "And more supporting folders...",
    ].forEach((t) => list.createEl("li", { text: t }));

    const buttonContainer = container.createDiv({ cls: "dnd-hub-init-buttons" });

    const initButton = buttonContainer.createEl("button", { text: "🎲 Initialize Vault", cls: "mod-cta" });
    initButton.addEventListener("click", async () => {
      this.close();
      await this.plugin.initializeVault();
      new DndHubModal(this.app, this.plugin).open();
    });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
  }

  /* ── Main render ───────────────────────────────────────────── */

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-hub-modal");

    contentEl.createEl("h1", { text: "D&D Campaign Hub" });

    if (!this.plugin.isVaultInitialized()) {
      this.showInitializationUI(contentEl);
      return;
    }

    const campaigns = this.plugin.getAllCampaigns();
    const hasCampaigns = campaigns.length > 0;

    // ── Quick Actions ──
    contentEl.createEl("h2", { text: "Quick Actions" });
    const quickActionsContainer = contentEl.createDiv({ cls: "dnd-hub-quick-actions" });

    this.createActionButton(quickActionsContainer, "🎲 New Campaign", () => {
      this.close();
      this.plugin.createCampaign();
    });

    if (hasCampaigns) {
      this.createActionButton(quickActionsContainer, "👤 New NPC", () => { this.close(); this.plugin.createNpc(); });
      this.createActionButton(quickActionsContainer, "🛡️ New PC", () => { this.close(); this.plugin.createPc(); });
      this.createActionButton(quickActionsContainer, "🏛️ New Faction", () => { this.close(); this.plugin.createFaction(); });
      this.createActionButton(quickActionsContainer, "🗺️ New Adventure", () => { this.close(); this.plugin.createAdventure(); });
      this.createActionButton(quickActionsContainer, "⚔️ New Encounter", () => { this.close(); this.plugin.createEncounter(); });
      this.createActionButton(quickActionsContainer, "🪤 New Trap", () => { this.close(); this.plugin.createTrap(); });
      this.createActionButton(quickActionsContainer, "⚔️ New Item", () => { this.close(); this.plugin.createItem(); });
      this.createActionButton(quickActionsContainer, "🐉 New Creature", () => { this.close(); this.plugin.createCreature(); });

      contentEl.createEl("p", {
        text: "Create sessions from a campaign's World note or via the 'Create New Session' command.",
        cls: "dnd-hub-info",
      });

      // ── Browse Vault ──
      contentEl.createEl("h2", { text: "Browse Vault" });
      this.renderBrowseSection(contentEl);
    } else {
      contentEl.createEl("p", { text: "Create your first campaign to get started!", cls: "dnd-hub-info" });
    }
  }

  /* ── Browse section with expandable categories ─────────────── */

  private renderBrowseSection(root: HTMLElement) {
    const campaignPaths = this.plugin.getAllCampaigns().map((c) => c.path);
    const categories = this.getBrowseCategories();
    const browseContainer = root.createDiv({ cls: "dnd-hub-browse-section" });

    for (const [key, cat] of Object.entries(categories)) {
      const entities = this.queryCategory(cat, campaignPaths);
      const isExpanded = this.expandedCategory === key;

      // Category header row
      const header = browseContainer.createDiv({
        cls: `dnd-hub-cat-header ${isExpanded ? "is-expanded" : ""}`,
      });
      header.createEl("span", { cls: "dnd-hub-cat-chevron", text: isExpanded ? "▾" : "▸" });
      header.createEl("span", { cls: "dnd-hub-cat-icon", text: cat.icon });
      header.createEl("span", { cls: "dnd-hub-cat-label", text: cat.label });
      header.createEl("span", { cls: "dnd-hub-cat-count", text: String(entities.length) });

      header.addEventListener("click", () => {
        this.expandedCategory = this.expandedCategory === key ? null : key;
        this.refreshBrowse(root);
      });

      // Expanded panel
      if (isExpanded) {
        const panel = browseContainer.createDiv({ cls: "dnd-hub-cat-panel" });
        this.renderCategoryPanel(panel, key, cat, entities, campaignPaths.length > 1);
      }
    }
  }

  /** Re-render only the browse section (preserves scroll). */
  private refreshBrowse(root: HTMLElement) {
    const existing = root.querySelector(".dnd-hub-browse-section");
    if (existing) existing.remove();
    this.renderBrowseSection(root);
  }

  /* ── Panel for a single expanded category ──────────────────── */

  private renderCategoryPanel(
    panel: HTMLElement,
    key: string,
    cat: BrowseCategory,
    entities: EntityResult[],
    showCampaignOrigin: boolean,
  ) {
    // Search / filter input
    const filterRow = panel.createDiv({ cls: "dnd-hub-filter-row" });
    const filterInput = filterRow.createEl("input", {
      type: "text",
      placeholder: `Search ${cat.label.toLowerCase()}…`,
      cls: "dnd-hub-filter-input",
      value: this.categoryFilters[key] || "",
    });

    const listEl = panel.createDiv({ cls: "dnd-hub-entity-list" });

    const renderList = (filter: string) => {
      listEl.empty();
      const lowerFilter = filter.toLowerCase();
      const filtered = filter
        ? entities.filter((e) => {
            const name = (e.fm.name || e.file.basename).toLowerCase();
            const sub = cat.subtitle?.(e.fm)?.toLowerCase() || "";
            const camp = e.campaign.toLowerCase();
            return name.includes(lowerFilter) || sub.includes(lowerFilter) || camp.includes(lowerFilter);
          })
        : entities;

      if (filtered.length === 0) {
        listEl.createEl("div", {
          cls: "dnd-hub-entity-empty",
          text: filter ? "No matches." : `No ${cat.label.toLowerCase()} found.`,
        });
        return;
      }

      // Group by campaign when showing origin
      if (showCampaignOrigin && this.hasMixedCampaigns(filtered)) {
        const groups = this.groupByCampaign(filtered);
        for (const [campaign, items] of groups) {
          const groupLabel = campaign || "Global";
          const groupHeader = listEl.createDiv({ cls: "dnd-hub-campaign-bar" });
          groupHeader.createEl("span", { cls: "dnd-hub-campaign-bar-label", text: groupLabel });
          groupHeader.createEl("span", { cls: "dnd-hub-campaign-bar-count", text: String(items.length) });
          for (const entity of items) {
            this.renderEntityRow(listEl, entity, cat);
          }
        }
      } else {
        for (const entity of filtered) {
          this.renderEntityRow(listEl, entity, cat, showCampaignOrigin);
        }
      }
    };

    renderList(this.categoryFilters[key] || "");

    filterInput.addEventListener("input", () => {
      this.categoryFilters[key] = filterInput.value;
      renderList(filterInput.value);
    });

    // Auto-focus the search when category opens
    filterInput.focus();
  }

  /* ── Entity row rendering ──────────────────────────────────── */

  private renderEntityRow(parent: HTMLElement, entity: EntityResult, cat: BrowseCategory, showTag = false) {
    const { file, fm } = entity;
    const row = parent.createDiv({ cls: "dnd-hub-entity-row" });

    const link = row.createEl("a", {
      cls: "dnd-hub-entity-link internal-link",
      text: fm.name || file.basename,
      href: file.path,
    });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.close();
      this.app.workspace.openLinkText(file.path, "", false);
    });

    if (showTag && entity.campaign) {
      row.createEl("span", { cls: "dnd-hub-entity-tag", text: entity.campaign });
    }

    const subtitle = cat.subtitle?.(fm);
    if (subtitle) {
      row.createEl("span", { cls: "dnd-hub-entity-sub", text: subtitle });
    }
  }

  /* ── Grouping helpers ──────────────────────────────────────── */

  private hasMixedCampaigns(entities: EntityResult[]): boolean {
    if (entities.length === 0) return false;
    const first = entities[0]?.campaign;
    return entities.some((e) => e.campaign !== first);
  }

  private groupByCampaign(entities: EntityResult[]): [string, EntityResult[]][] {
    const map = new Map<string, EntityResult[]>();
    for (const e of entities) {
      const key = e.campaign;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }

  /* ── Helpers ────────────────────────────────────────────────── */

  private createActionButton(container: Element, text: string, callback: () => void) {
    const button = container.createEl("button", { text, cls: "dnd-hub-button" });
    button.addEventListener("click", callback);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
