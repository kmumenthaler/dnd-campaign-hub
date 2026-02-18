/**
 * Random Encounter Table Modal
 * 
 * UI for generating random encounter tables. The user selects an environment,
 * party level + size, and number of entries. The generator fetches SRD monster
 * data, uses the plugin's difficulty calculation to balance encounters, and
 * produces a preview. On confirmation, a markdown note is created with proper
 * frontmatter (type: encounter-table, template_version) so the migration
 * system can track it.
 */

import { App, ButtonComponent, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { ENVIRONMENTS } from "./EnvironmentMapping";
import { SRDApiClient } from "./SRDApiClient";
import { EncounterGenerator, EncounterTableEntry } from "./EncounterGenerator";
import { TEMPLATE_VERSIONS } from "../migration";

// ─── Modal ────────────────────────────────────────────────────────────────

export class RandomEncounterTableModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private apiClient: SRDApiClient;
  private generator: EncounterGenerator;

  // Form state
  private tableName = "";
  private selectedEnvironment = "";
  private partyLevel = 3;
  private partySize = 4;
  private numEntries = 6;
  private selectedCampaign = "";

  // Generated data
  private generatedEntries: EncounterTableEntry[] = [];

  // UI refs
  private previewContainer: HTMLElement | null = null;
  private generateBtnComponent: ButtonComponent | null = null;
  private createBtnComponent: ButtonComponent | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.apiClient = new SRDApiClient();
    this.generator = new EncounterGenerator(this.apiClient, plugin.encounterBuilder);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-encounter-table-modal");

    // Try to pre-fill party data from Initiative Tracker
    await this.prefillPartyData();

    contentEl.createEl("h2", { text: "🎲 Create Random Encounter Table" });

    // ── Campaign ──
    await this.renderCampaignSelector(contentEl);

    // ── Table Name ──
    new Setting(contentEl)
      .setName("Table Name")
      .setDesc("Name for this encounter table (auto-generated if left blank)")
      .addText((text) =>
        text
          .setPlaceholder("e.g. Forest Encounters Level 3–5")
          .setValue(this.tableName)
          .onChange((v) => (this.tableName = v))
      );

    // ── Environment ──
    new Setting(contentEl)
      .setName("Environment")
      .setDesc("Select the terrain type for encounters")
      .addDropdown((dd) => {
        dd.addOption("", "— Select Environment —");
        for (const env of ENVIRONMENTS) {
          dd.addOption(env.id, `${env.icon} ${env.name}`);
        }
        dd.onChange((v) => (this.selectedEnvironment = v));
      });

    // ── Party Level ──
    const levelSetting = new Setting(contentEl)
      .setName("Party Level")
      .setDesc(`Average level of the party: ${this.partyLevel}`);
    levelSetting.addSlider((slider) =>
      slider
        .setLimits(1, 20, 1)
        .setValue(this.partyLevel)
        .setDynamicTooltip()
        .onChange((v) => {
          this.partyLevel = v;
          levelSetting.setDesc(`Average level of the party: ${v}`);
        })
    );

    // ── Party Size ──
    const sizeSetting = new Setting(contentEl)
      .setName("Party Size")
      .setDesc(`Number of player characters: ${this.partySize}`);
    sizeSetting.addSlider((slider) =>
      slider
        .setLimits(1, 8, 1)
        .setValue(this.partySize)
        .setDynamicTooltip()
        .onChange((v) => {
          this.partySize = v;
          sizeSetting.setDesc(`Number of player characters: ${v}`);
        })
    );

    // ── Number of entries ──
    new Setting(contentEl)
      .setName("Table Entries")
      .setDesc("Number of different encounters in the table")
      .addDropdown((dd) => {
        dd.addOption("4", "4 entries (d4)");
        dd.addOption("6", "6 entries (d6)");
        dd.addOption("8", "8 entries (d8)");
        dd.addOption("10", "10 entries (d10)");
        dd.addOption("12", "12 entries (d12)");
        dd.addOption("20", "20 entries (d20)");
        dd.setValue(this.numEntries.toString());
        dd.onChange((v) => (this.numEntries = parseInt(v)));
      });

    // ── Generate button ──
    const generateSetting = new Setting(contentEl);
    generateSetting.addButton((btn) => {
      this.generateBtnComponent = btn;
      btn
        .setButtonText("🎲 Generate Encounters")
        .setCta()
        .onClick(() => this.generate());
    });

    // ── Status ──
    this.statusEl = contentEl.createDiv({ cls: "encounter-status" });

    // ── Preview ──
    contentEl.createEl("h3", { text: "Preview" });
    this.previewContainer = contentEl.createDiv({ cls: "encounter-table-preview" });
    this.previewContainer.createEl("p", {
      text: "Select an environment and click Generate to preview encounters.",
      cls: "encounter-preview-placeholder",
    });

    // ── Action buttons ──
    const actions = new Setting(contentEl);
    actions.addButton((btn) => {
      this.createBtnComponent = btn;
      btn
        .setButtonText("📝 Create Note")
        .setCta()
        .setDisabled(true)
        .onClick(() => this.createNote());
    });
    actions.addButton((btn) =>
      btn.setButtonText("Cancel").onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
  }

  // ── Pre-fill from Initiative Tracker ──────────────────────────────────

  private async prefillPartyData() {
    try {
      const members = await this.plugin.encounterBuilder.getAvailablePartyMembers();
      if (members.length > 0) {
        this.partySize = members.length;
        const totalLevel = members.reduce((sum, m) => sum + m.level, 0);
        this.partyLevel = Math.round(totalLevel / members.length);
      }
    } catch {
      // No Initiative Tracker or no party — use defaults
    }
  }

  // ── Campaign selector ─────────────────────────────────────────────────

  private async renderCampaignSelector(container: HTMLElement) {
    const campaigns = this.getCampaigns();

    // Auto-detect from active file
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      const detected = this.detectCampaignFromPath(activeFile.path);
      if (detected) this.selectedCampaign = detected;
    }

    // Fallback to plugin setting
    if (!this.selectedCampaign && this.plugin.settings.currentCampaign) {
      this.selectedCampaign = this.plugin.settings.currentCampaign;
    }

    new Setting(container)
      .setName("Campaign")
      .setDesc("Which campaign is this table for?")
      .addDropdown((dd) => {
        dd.addOption("", "— Select Campaign —");
        for (const c of campaigns) {
          dd.addOption(c.path, c.name);
        }
        if (this.selectedCampaign) dd.setValue(this.selectedCampaign);
        dd.onChange((v) => (this.selectedCampaign = v));
      });
  }

  private getCampaigns(): Array<{ path: string; name: string }> {
    const campaigns: Array<{ path: string; name: string }> = [];
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    if (ttrpgsFolder instanceof TFolder) {
      for (const child of ttrpgsFolder.children) {
        if (child instanceof TFolder) {
          campaigns.push({ path: child.path, name: child.name });
        }
      }
    }
    return campaigns;
  }

  private detectCampaignFromPath(path: string): string | null {
    if (path.startsWith("ttrpgs/")) {
      const parts = path.split("/");
      if (parts.length >= 2 && parts[1]) {
        return `ttrpgs/${parts[1]}`;
      }
    }
    return null;
  }

  // ── Generate ──────────────────────────────────────────────────────────

  private async generate() {
    // Validate
    if (!this.selectedEnvironment) {
      new Notice("Please select an environment.");
      return;
    }

    this.setGenerating(true);

    try {
      this.generatedEntries = await this.generator.generateTable({
        environmentId: this.selectedEnvironment,
        partyLevel: this.partyLevel,
        partySize: this.partySize,
        numEntries: this.numEntries,
      });

      if (this.generatedEntries.length === 0) {
        this.setStatus("⚠️ No SRD monsters found for this environment / level combination. Try a different environment or level.");
        this.renderEmptyPreview();
        return;
      }

      this.setStatus(`✅ Generated ${this.generatedEntries.length} encounters.`);
      this.renderPreview();
      if (this.createBtnComponent) this.createBtnComponent.setDisabled(false);
    } catch (error) {
      console.error("[RandomEncounterTable] Generation error:", error);
      this.setStatus("❌ Error generating encounters. Check the console for details.");
    } finally {
      this.setGenerating(false);
    }
  }

  // ── Preview rendering ─────────────────────────────────────────────────

  private renderPreview() {
    if (!this.previewContainer) return;
    this.previewContainer.empty();

    const table = this.previewContainer.createEl("table", { cls: "encounter-table" });

    // Header
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "Roll" });
    headerRow.createEl("th", { text: "Encounter" });
    headerRow.createEl("th", { text: "Difficulty" });
    headerRow.createEl("th", { text: "XP" });

    // Body
    const tbody = table.createEl("tbody");
    for (const entry of this.generatedEntries) {
      const row = tbody.createEl("tr");
      row.createEl("td", { text: entry.roll.toString() });

      const encounterText = entry.monsters
        .map((m) => `${m.count}× ${m.name} (CR ${m.cr})`)
        .join(", ");
      row.createEl("td", { text: encounterText });

      const diffCell = row.createEl("td", { text: entry.difficulty });
      diffCell.addClass(`encounter-difficulty-${entry.difficulty.toLowerCase().replace(/\s+/g, "-")}`);

      row.createEl("td", { text: entry.totalXP.toLocaleString() });
    }
  }

  private renderEmptyPreview() {
    if (!this.previewContainer) return;
    this.previewContainer.empty();
    this.previewContainer.createEl("p", {
      text: "No encounters could be generated. Try adjusting the environment or party level.",
      cls: "encounter-preview-placeholder",
    });
  }

  // ── Note creation ─────────────────────────────────────────────────────

  private async createNote() {
    if (this.generatedEntries.length === 0) {
      new Notice("Generate a table first!");
      return;
    }

    // Resolve name
    const envDef = ENVIRONMENTS.find((e) => e.id === this.selectedEnvironment);
    const envName = envDef?.name ?? this.selectedEnvironment;
    if (!this.tableName) {
      this.tableName = `${envName} Encounters Level ${this.partyLevel}`;
    }

    // Build note content
    const content = this.buildNoteContent(envDef?.icon ?? "🎲", envName);

    // Determine folder
    const folderPath = this.selectedCampaign
      ? `${this.selectedCampaign}/Encounter Tables`
      : "Encounter Tables";

    await this.plugin.ensureFolderExists(folderPath);

    // Avoid overwriting existing files
    let filePath = `${folderPath}/${this.tableName}.md`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${folderPath}/${this.tableName} (${counter}).md`;
      counter++;
    }

    await this.app.vault.create(filePath, content);
    new Notice(`✅ Created encounter table: ${filePath}`);

    // Open the new note
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf().openFile(file);
    }

    this.close();
  }

  /**
   * Build the full markdown content for the encounter table note.
   * Includes frontmatter with type + template_version for the migration system.
   */
  private buildNoteContent(envIcon: string, envName: string): string {
    const templateVersion = TEMPLATE_VERSIONS["encounter-table"] ?? "1.0.0";
    const today = new Date().toISOString().split("T")[0];

    // ── Frontmatter ──
    const lines: string[] = [
      "---",
      "type: encounter-table",
      `template_version: ${templateVersion}`,
      `name: "${this.tableName}"`,
      `environment: ${this.selectedEnvironment}`,
      `party_level: ${this.partyLevel}`,
      `party_size: ${this.partySize}`,
      `entries: ${this.numEntries}`,
      `campaign: "${this.selectedCampaign}"`,
      `date_created: ${today}`,
      "---",
      "",
    ];

    // ── Title + metadata ──
    lines.push(`# ${envIcon} ${this.tableName}`);
    lines.push("");

    // ── Action buttons ──
    lines.push("```dataviewjs");
    lines.push("// Action buttons for Encounter Table");
    lines.push('const buttonContainer = dv.el("div", "", {');
    lines.push('  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" }');
    lines.push("});");
    lines.push("");
    lines.push("// Roll Encounter button");
    lines.push('const rollBtn = buttonContainer.createEl("button", {');
    lines.push('  text: "🎲 Roll Encounter",');
    lines.push('  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }');
    lines.push("});");
    lines.push('rollBtn.addEventListener("click", () => {');
    lines.push('  app.commands.executeCommandById("dnd-campaign-hub:roll-random-encounter");');
    lines.push("});");
    lines.push("");
    lines.push("// Regenerate Table button");
    lines.push('const regenBtn = buttonContainer.createEl("button", {');
    lines.push('  text: "🔄 Regenerate Table",');
    lines.push('  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }');
    lines.push("});");
    lines.push('regenBtn.addEventListener("click", () => {');
    lines.push('  app.commands.executeCommandById("dnd-campaign-hub:create-random-encounter-table");');
    lines.push("});");
    lines.push("");
    lines.push("// Edit (Reroll Entries) button");
    lines.push('const editBtn = buttonContainer.createEl("button", {');
    lines.push('  text: "✏️ Edit Table",');
    lines.push('  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }');
    lines.push("});");
    lines.push('editBtn.addEventListener("click", () => {');
    lines.push('  app.commands.executeCommandById("dnd-campaign-hub:edit-encounter-table");');
    lines.push("});");
    lines.push("");
    lines.push("// Delete button");
    lines.push('const deleteBtn = buttonContainer.createEl("button", {');
    lines.push('  text: "🗑️ Delete Table",');
    lines.push('  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }');
    lines.push("});");
    lines.push('deleteBtn.addEventListener("click", () => {');
    lines.push('  app.commands.executeCommandById("dnd-campaign-hub:delete-encounter-table");');
    lines.push("});");
    lines.push("```");
    lines.push("");

    lines.push(`> [!info] Table Info`);
    lines.push(`> **Environment:** ${envIcon} ${envName}`);
    lines.push(`> **Party Level:** ${this.partyLevel} | **Party Size:** ${this.partySize}`);
    lines.push(`> **Roll:** 1d${this.numEntries}`);
    lines.push("");

    // ── Encounter Table ──
    lines.push("## Encounter Table");
    lines.push("");
    lines.push("| Roll | Encounter | Difficulty | XP |");
    lines.push("|------|-----------|------------|-----|");
    for (const entry of this.generatedEntries) {
      const encounter = entry.monsters
        .map((m) => `${m.count}× ${m.name} (CR ${m.cr})`)
        .join(", ");
      lines.push(`| ${entry.roll} | ${encounter} | ${entry.difficulty} | ${entry.totalXP.toLocaleString()} |`);
    }
    lines.push("");

    // ── Encounter Details ──
    lines.push("## Encounter Details");
    lines.push("");
    for (const entry of this.generatedEntries) {
      const title = entry.monsters.map((m) => m.name).join(" & ");
      lines.push(`### ${entry.roll}. ${title}`);
      lines.push("");
      lines.push(`**Difficulty:** ${entry.difficulty} | **Total XP:** ${entry.totalXP.toLocaleString()}`);
      lines.push("");
      lines.push("**Monsters:**");
      for (const m of entry.monsters) {
        lines.push(`- ${m.count}× **${m.name}** — CR ${m.cr} (${m.xpEach.toLocaleString()} XP each)`);
      }
      lines.push("");
      lines.push("**Tactics:**");
      lines.push("*Add tactical notes here*");
      lines.push("");
    }

    // ── GM Notes ──
    lines.push("## GM Notes");
    lines.push("");
    lines.push("*Add environmental details, encounter triggers, or narrative hooks here.*");
    lines.push("");

    return lines.join("\n");
  }

  // ── UI helpers ────────────────────────────────────────────────────────

  private setGenerating(isGenerating: boolean) {
    if (this.generateBtnComponent) {
      this.generateBtnComponent.setDisabled(isGenerating);
      this.generateBtnComponent.setButtonText(isGenerating ? "⏳ Generating…" : "🎲 Generate Encounters");
    }
  }

  private setStatus(message: string) {
    if (this.statusEl) {
      this.statusEl.empty();
      this.statusEl.createEl("p", { text: message });
    }
  }
}
