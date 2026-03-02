import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { MarkerDefinition, MarkerType, CreatureSize } from '../marker/MarkerTypes';

export class ImportPCModal extends Modal {
  plugin: DndCampaignHubPlugin;
  targetCampaign: string;
  selectedPC: TFile | null = null;
  importMode: "clone" | "link" = "clone";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.targetCampaign = plugin.settings.currentCampaign;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "📥 Import Existing PC" });
    contentEl.createEl("p", {
      text: "Bring a player character from another campaign into the current one.",
      cls: "setting-item-description"
    });

    // Target campaign selector
    const campaigns = this.getAllCampaigns();
    new Setting(contentEl)
      .setName("Target Campaign")
      .setDesc("The campaign to import the PC into")
      .addDropdown((dropdown) => {
        campaigns.forEach(c => dropdown.addOption(c.path, c.name));
        dropdown.setValue(this.targetCampaign)
          .onChange((value) => {
            this.targetCampaign = value;
            this.renderPCList(pcListContainer);
          });
      });

    // Import mode
    new Setting(contentEl)
      .setName("Import Mode")
      .setDesc("Clone creates an independent copy. Link keeps a reference to the original.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("clone", "🗐 Clone — Independent copy (own stats)")
          .addOption("link", "🔗 Link — Reference to original (shared stats)")
          .setValue(this.importMode)
          .onChange((value: string) => {
            this.importMode = value as "clone" | "link";
            modeHint.setText(this.importMode === "clone"
              ? "The PC will be copied into the target campaign with its own frontmatter. Edits to one copy won't affect the other."
              : "A lightweight note will be created that embeds the original PC. Stats stay in sync because there's only one source file.");
          });
      });

    const modeHint = contentEl.createEl("p", {
      text: "The PC will be copied into the target campaign with its own frontmatter. Edits to one copy won't affect the other.",
      cls: "setting-item-description"
    });
    modeHint.style.marginTop = "-8px";
    modeHint.style.marginBottom = "12px";

    // PC list
    contentEl.createEl("h3", { text: "Select a PC" });
    const pcListContainer = contentEl.createDiv({ cls: "import-pc-list" });
    pcListContainer.style.maxHeight = "350px";
    pcListContainer.style.overflowY = "auto";

    this.renderPCList(pcListContainer);

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());

    const importButton = buttonContainer.createEl("button", { text: "Import PC", cls: "mod-cta" });
    importButton.addEventListener("click", async () => {
      if (!this.selectedPC) {
        new Notice("Please select a PC to import!");
        return;
      }
      this.close();
      await this.executeImport();
    });
  }

  /**
   * Render the list of PCs from other campaigns that can be imported.
   */
  renderPCList(container: HTMLElement) {
    container.empty();

    const pcs = this.getImportablePCs();

    if (pcs.length === 0) {
      container.createEl("p", {
        text: "No PCs found in other campaigns.",
        cls: "setting-item-description"
      });
      return;
    }

    // Search filter
    const searchInput = container.createEl("input", {
      type: "text",
      placeholder: "Filter PCs..."
    });
    searchInput.style.width = "100%";
    searchInput.style.padding = "8px";
    searchInput.style.borderRadius = "4px";
    searchInput.style.border = "1px solid var(--background-modifier-border)";
    searchInput.style.marginBottom = "8px";

    const listDiv = container.createDiv();

    const renderItems = (filter: string) => {
      listDiv.empty();
      const filtered = filter
        ? pcs.filter(pc =>
            pc.file.basename.toLowerCase().includes(filter.toLowerCase()) ||
            (pc.campaign || "").toLowerCase().includes(filter.toLowerCase()) ||
            (pc.player || "").toLowerCase().includes(filter.toLowerCase()))
        : pcs;

      if (filtered.length === 0) {
        listDiv.createEl("p", { text: "No matching PCs.", cls: "setting-item-description" });
        return;
      }

      for (const pc of filtered) {
        const item = listDiv.createDiv();
        item.style.padding = "8px 10px";
        item.style.border = "1px solid var(--background-modifier-border)";
        item.style.borderRadius = "4px";
        item.style.marginBottom = "6px";
        item.style.cursor = "pointer";
        item.style.transition = "all 0.15s ease";

        if (this.selectedPC?.path === pc.file.path) {
          item.style.backgroundColor = "var(--interactive-accent)";
          item.style.color = "var(--text-on-accent)";
        }

        // Name + class
        const nameEl = item.createEl("div", {
          text: `${pc.name}${pc.classStr ? ` — ${pc.classStr} ${pc.level}` : ""}`
        });
        nameEl.style.fontWeight = "600";

        // Campaign + player
        const metaEl = item.createEl("div", {
          text: `Campaign: ${pc.campaign}${pc.player ? ` · Player: ${pc.player}` : ""}`
        });
        metaEl.style.fontSize = "0.85em";
        metaEl.style.color = this.selectedPC?.path === pc.file.path
          ? "var(--text-on-accent)"
          : "var(--text-muted)";

        // Already in target?
        if (pc.alreadyInTarget) {
          const warnEl = item.createEl("div", { text: "⚠️ Already exists in target campaign" });
          warnEl.style.fontSize = "0.8em";
          warnEl.style.color = "var(--text-error)";
        }

        item.addEventListener("mouseenter", () => {
          if (this.selectedPC?.path !== pc.file.path) {
            item.style.backgroundColor = "var(--background-modifier-hover)";
          }
        });
        item.addEventListener("mouseleave", () => {
          if (this.selectedPC?.path !== pc.file.path) {
            item.style.backgroundColor = "";
          }
        });
        item.addEventListener("click", () => {
          this.selectedPC = pc.file;
          renderItems(searchInput.value);
        });
      }
    };

    searchInput.addEventListener("input", () => renderItems(searchInput.value));
    renderItems("");
  }

  /**
   * Find all PCs across all campaigns except the ones already in the target campaign.
   */
  getImportablePCs(): Array<{
    file: TFile;
    name: string;
    campaign: string;
    player: string;
    classStr: string;
    level: string;
    alreadyInTarget: boolean;
  }> {
    const results: Array<{
      file: TFile;
      name: string;
      campaign: string;
      player: string;
      classStr: string;
      level: string;
      alreadyInTarget: boolean;
    }> = [];

    const targetCampaignName = this.targetCampaign.split("/").pop() || "";

    // Find all PC files across all campaigns
    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      // Must be in a PCs subfolder under ttrpgs
      if (!file.path.match(/^ttrpgs\/[^/]+\/PCs\//)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) continue;
      if (cache.frontmatter.type !== "player") continue;

      const fm = cache.frontmatter;
      const pcCampaign = fm.campaign || "";
      const isInTarget = pcCampaign === targetCampaignName ||
        file.path.startsWith(`${this.targetCampaign}/PCs/`);

      // Exclude linked PCs (they're references, not originals)
      if (fm.linked_from) continue;

      results.push({
        file,
        name: fm.name || file.basename,
        campaign: pcCampaign,
        player: fm.player || "",
        classStr: fm.class?.toString() || "",
        level: fm.level?.toString() || "",
        alreadyInTarget: isInTarget
      });
    }

    // Sort: non-target PCs first, then by name
    results.sort((a, b) => {
      if (a.alreadyInTarget !== b.alreadyInTarget) return a.alreadyInTarget ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  /**
   * Execute the import — clone or link the selected PC into the target campaign.
   */
  async executeImport() {
    if (!this.selectedPC) return;

    const sourceFile = this.selectedPC;
    const sourceContent = await this.app.vault.read(sourceFile);
    const sourceCache = this.app.metadataCache.getFileCache(sourceFile);
    const fm = sourceCache?.frontmatter;
    if (!fm) {
      new Notice("❌ Could not read PC frontmatter.");
      return;
    }

    const pcName = fm.name || sourceFile.basename;
    const targetCampaignName = this.targetCampaign.split("/").pop() || "Unknown";
    const targetPCsFolder = `${this.targetCampaign}/PCs`;
    const targetFilePath = `${targetPCsFolder}/${pcName}.md`;

    // Check if file already exists in target
    if (await this.app.vault.adapter.exists(targetFilePath)) {
      new Notice(`⚠️ "${pcName}" already exists in ${targetCampaignName}. Delete or rename it first.`);
      return;
    }

    await this.plugin.ensureFolderExists(targetPCsFolder);

    if (this.importMode === "clone") {
      await this.clonePC(sourceFile, sourceContent, fm, pcName, targetCampaignName, targetFilePath);
    } else {
      await this.linkPC(sourceFile, fm, pcName, targetCampaignName, targetFilePath);
    }
  }

  /**
   * Clone: Copy the PC file with updated campaign frontmatter. Fully independent.
   */
  async clonePC(
    sourceFile: TFile,
    sourceContent: string,
    fm: Record<string, any>,
    pcName: string,
    targetCampaignName: string,
    targetFilePath: string
  ) {
    // Get world name from target campaign
    let worldName = targetCampaignName;
    const worldFile = this.app.vault.getAbstractFileByPath(`${this.targetCampaign}/World.md`);
    if (worldFile instanceof TFile) {
      const worldContent = await this.app.vault.read(worldFile);
      const worldMatch = worldContent.match(/^world:\s*([^\r\n]\w*)$/m);
      if (worldMatch?.[1]?.trim()) {
        worldName = worldMatch[1].trim();
      }
    }

    // Replace campaign and world in the frontmatter
    let clonedContent = sourceContent.replace(
      /^(campaign:\s*).*$/m,
      `$1${targetCampaignName}`
    ).replace(
      /^(world:\s*).*$/m,
      `$1${worldName}`
    );

    // Create a new map token for the clone (independent from original)
    const now = Date.now();
    const newTokenId = this.plugin.markerLibrary.generateId();
    const sourceTokenId = fm.token_id;

    // Copy token appearance from source if available
    const sourceMarker = sourceTokenId
      ? this.plugin.markerLibrary.getMarker(sourceTokenId)
      : null;

    const tokenDef: MarkerDefinition = {
      id: newTokenId,
      name: pcName,
      type: 'player' as MarkerType,
      icon: sourceMarker?.icon || '🛡️',
      backgroundColor: sourceMarker?.backgroundColor || '#4a90d9',
      borderColor: sourceMarker?.borderColor || '#ffffff',
      creatureSize: (sourceMarker?.creatureSize || 'medium') as CreatureSize,
      campaign: targetCampaignName,
      createdAt: now,
      updatedAt: now
    };
    await this.plugin.markerLibrary.setMarker(tokenDef);

    // Update token_id in cloned content
    clonedContent = clonedContent.replace(
      /^(token_id:\s*).*$/m,
      `$1${newTokenId}`
    );

    // Update date
    const currentDate = new Date().toISOString().split("T")[0];
    clonedContent = clonedContent.replace(
      /^(date:\s*).*$/m,
      `$1${currentDate}`
    );

    await this.app.vault.create(targetFilePath, clonedContent);
    new Notice(`✅ PC "${pcName}" cloned into ${targetCampaignName}!`);

    // Auto-register in Initiative Tracker
    await this.autoRegisterInTracker(pcName, fm, targetFilePath, targetCampaignName);

    // Open the new file
    await this.app.workspace.openLinkText(targetFilePath, "", false);
  }

  /**
   * Link: Create a lightweight reference note that embeds the original PC.
   * The dataview table will pick up the frontmatter stats from this file,
   * and the body content transcludes the original PC for reading.
   */
  async linkPC(
    sourceFile: TFile,
    fm: Record<string, any>,
    pcName: string,
    targetCampaignName: string,
    targetFilePath: string
  ) {
    // Get world name from target campaign
    let worldName = targetCampaignName;
    const worldFile = this.app.vault.getAbstractFileByPath(`${this.targetCampaign}/World.md`);
    if (worldFile instanceof TFile) {
      const worldContent = await this.app.vault.read(worldFile);
      const worldMatch = worldContent.match(/^world:\s*([^\r\n]\w*)$/m);
      if (worldMatch?.[1]?.trim()) {
        worldName = worldMatch[1].trim();
      }
    }

    // Build frontmatter for the linked note — mirrors the source so dataview works
    const linkedContent = `---
type: player
name: ${fm.name || pcName}
player: ${fm.player || ""}
campaign: ${targetCampaignName}
world: ${worldName}
race: ${fm.race || ""}
class: ${fm.class || ""}
subclass: ${fm.subclass || ""}
level: ${fm.level || 1}
hp: ${fm.hp || 0}
hp_max: ${fm.hp_max || 0}
thp: ${fm.thp || 0}
ac: ${fm.ac || 10}
init_bonus: ${fm.init_bonus || 0}
speed: ${fm.speed || 30}
passive_perception: ${fm.passive_perception || 10}
background: ${fm.background || ""}
alignment: ${fm.alignment || ""}
experience: ${fm.experience || 0}
readonlyUrl: ${fm.readonlyUrl || ""}
characterSheetPdf: ${fm.characterSheetPdf || ""}
token_id: ${fm.token_id || ""}
linked_from: ${sourceFile.path}
date: ${new Date().toISOString().split("T")[0]}
---

# ${pcName} *(Linked)*

> [!info] 🔗 This PC is linked from [[${sourceFile.path}|${pcName} (${fm.campaign || "source"})]]
> Stats shown in the campaign table come from this note's frontmatter.
> To edit the character, open the **original PC note** linked above.

![[${sourceFile.path}]]
`;

    await this.app.vault.create(targetFilePath, linkedContent);
    new Notice(`✅ PC "${pcName}" linked into ${targetCampaignName}!`);

    // Auto-register in Initiative Tracker
    await this.autoRegisterInTracker(pcName, fm, targetFilePath, targetCampaignName);

    // Open the new file
    await this.app.workspace.openLinkText(targetFilePath, "", false);
  }

  /**
   * Auto-register the imported PC in Initiative Tracker under the target campaign's party.
   */
  async autoRegisterInTracker(
    pcName: string,
    fm: Record<string, any>,
    pcFilePath: string,
    campaignName: string
  ) {
    try {
      const initiativePlugin = (this.app as any).plugins?.plugins?.["initiative-tracker"];
      if (!initiativePlugin) {
        // Initiative Tracker not installed — that's fine, just skip
        return;
      }

      // Check GM role for target campaign
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.targetCampaign}/World.md`);
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const roleMatch = worldContent.match(/^role:\s*([^\r\n]\w*)$/m);
        if (!roleMatch || roleMatch[1]?.toLowerCase() !== "gm") {
          // Not a GM campaign — don't register
          return;
        }
      }

      if (!initiativePlugin.data.players) {
        initiativePlugin.data.players = [];
      }

      // Check for duplicate
      const existingPlayer = initiativePlugin.data.players.find((p: any) =>
        p.name === pcName || p.path === pcFilePath
      );
      if (existingPlayer) {
        new Notice(`⚠️ ${pcName} already registered in Initiative Tracker.`);
        return;
      }

      const initMod = parseInt(String(fm.init_bonus || "0").replace(/[^-\d]/g, "")) || 0;
      const currentHP = parseInt(fm.hp) || parseInt(fm.hp_max) || 1;
      const maxHP = parseInt(fm.hp_max) || currentHP;
      const armorClass = parseInt(fm.ac) || 10;
      const charLevel = parseInt(fm.level) || 1;

      const playerId = this.generatePlayerId();
      const playerData = {
        name: pcName,
        display: pcName,
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
        path: pcFilePath,
        note: pcFilePath,
        player: true,
        marker: "default",
        status: [],
        enabled: true,
        active: false,
        hidden: false,
        friendly: true,
        rollHP: false
      };

      initiativePlugin.data.players.push(playerData);

      // Get or create party
      const partyName = `${campaignName} Party`;
      if (!initiativePlugin.data.parties) {
        initiativePlugin.data.parties = [];
      }

      let party = initiativePlugin.data.parties.find((p: any) => p.name === partyName);
      if (!party) {
        party = {
          name: partyName,
          id: this.generatePlayerId(),
          players: []
        };
        initiativePlugin.data.parties.push(party);
        if (!initiativePlugin.data.defaultParty) {
          initiativePlugin.data.defaultParty = party.id;
        }
      }

      if (!party.players.includes(pcName)) {
        party.players.push(pcName);
      }

      if (initiativePlugin.saveSettings) {
        await initiativePlugin.saveSettings();
        new Notice(`✅ ${pcName} registered in ${partyName}!`);
      }
    } catch (error) {
      console.error("Error auto-registering imported PC in Initiative Tracker:", error);
      new Notice("⚠️ PC imported but could not register in Initiative Tracker.");
    }
  }

  generatePlayerId(): string {
    const chars = "0123456789abcdef";
    let id = "ID_";
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  getAllCampaigns(): Array<{ path: string; name: string }> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const campaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      ttrpgsFolder.children.forEach((child) => {
        if (child instanceof TFolder) {
          campaigns.push({ path: child.path, name: child.name });
        }
      });
    }

    return campaigns;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
