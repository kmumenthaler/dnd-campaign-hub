import { App, Modal, Notice, TFile } from "obsidian";
import { MigrationRunner } from "./runner";
import { MigrationScanResult, TEMPLATE_VERSIONS } from "./types";

/**
 * Interface for the plugin context needed by MigrationModal
 */
export interface MigrationPluginContext {
  migrationRunner: MigrationRunner;
  settings: { currentCampaign: string };
  getAllCampaigns(): string[] | { name: string }[];
}

/**
 * Modal for managing safe file migrations.
 * Redesigned to show per-file migration details and progress.
 */
export class MigrationModal extends Modal {
  plugin: MigrationPluginContext;
  private scanResults: MigrationScanResult[] = [];
  private selectedIndices: Set<number> = new Set();
  private currentCampaign: string = "";

  constructor(app: App, plugin: MigrationPluginContext) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-migration-modal");

    contentEl.createEl("h2", { text: "🛡️ Safe File Migration" });

    // Get current campaign
    const campaigns = this.plugin.getAllCampaigns();
    if (campaigns.length === 0) {
      contentEl.createEl("p", { text: "No campaigns found. Nothing to migrate." });
      const closeBtn = contentEl.createEl("button", { text: "Close", cls: "mod-cta" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }

    // Campaign selector
    const campaignContainer = contentEl.createDiv({ cls: "setting-item" });
    campaignContainer.createEl("label", { text: "Select Campaign:" });
    const campaignSelect = campaignContainer.createEl("select");

    campaigns.forEach(campaign => {
      const campaignName = typeof campaign === "string" ? campaign : campaign.name;
      const option = campaignSelect.createEl("option", {
        text: campaignName,
        value: `ttrpgs/${campaignName}`,
      });
      if (`ttrpgs/${campaign}` === this.plugin.settings.currentCampaign) {
        option.selected = true;
      }
    });

    this.currentCampaign = campaignSelect.value;

    // Scan button
    const scanBtn = contentEl.createEl("button", {
      text: "🔍 Scan for Updates",
      cls: "mod-cta",
    });

    const resultsContainer = contentEl.createDiv({ cls: "migration-results" });

    scanBtn.addEventListener("click", async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = "Scanning...";
      resultsContainer.empty();
      this.scanResults = [];
      this.selectedIndices.clear();

      this.scanResults = await this.plugin.migrationRunner.scanForMigrations(this.currentCampaign);

      if (this.scanResults.length === 0) {
        resultsContainer.createEl("p", {
          text: "✅ All files are up to date!",
          cls: "migration-success",
        });
        scanBtn.disabled = false;
        scanBtn.textContent = "🔍 Scan for Updates";
        return;
      }

      this.renderScanResults(resultsContainer);

      scanBtn.disabled = false;
      scanBtn.textContent = "🔍 Scan for Updates";
    });

    campaignSelect.addEventListener("change", () => {
      this.currentCampaign = campaignSelect.value;
      resultsContainer.empty();
      this.scanResults = [];
      this.selectedIndices.clear();
    });

    // Close button
    const closeBtn = contentEl.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  private renderScanResults(container: HTMLElement): void {
    container.createEl("h3", {
      text: `Found ${this.scanResults.length} file(s) that can be updated:`,
    });

    // Select all checkbox
    const selectAllContainer = container.createDiv({ cls: "setting-item" });
    const selectAllCheckbox = selectAllContainer.createEl("input", { type: "checkbox" });
    selectAllCheckbox.checked = true;
    selectAllContainer.createEl("label", { text: " Select all files" });

    // Pre-select all
    this.scanResults.forEach((_, i) => this.selectedIndices.add(i));

    // File list
    const fileList = container.createDiv({ cls: "migration-file-list" });
    const checkboxes: HTMLInputElement[] = [];

    for (let i = 0; i < this.scanResults.length; i++) {
      const scan = this.scanResults[i]!;
      const fileItem = fileList.createDiv({ cls: "migration-file-item" });

      const checkbox = fileItem.createEl("input", { type: "checkbox" });
      checkbox.checked = true;
      checkboxes.push(checkbox);

      const migrationNames = scan.pendingMigrations.map(m => m.description).join(", ");
      fileItem.createEl("span", {
        text: `${scan.file.path} (${scan.fileType}: v${scan.currentVersion} → v${scan.targetVersion})`,
      });
      // Show migration details on hover
      if (migrationNames) {
        fileItem.createEl("div", {
          text: `  → ${migrationNames}`,
          cls: "migration-detail-text",
        });
      }

      const idx = i;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedIndices.add(idx);
        } else {
          this.selectedIndices.delete(idx);
        }
        migrateBtn.textContent = `Migrate ${this.selectedIndices.size} file(s)`;
      });
    }

    selectAllCheckbox.addEventListener("change", () => {
      for (let i = 0; i < checkboxes.length; i++) {
        checkboxes[i]!.checked = selectAllCheckbox.checked;
        if (selectAllCheckbox.checked) {
          this.selectedIndices.add(i);
        } else {
          this.selectedIndices.delete(i);
        }
      }
      migrateBtn.textContent = `Migrate ${this.selectedIndices.size} file(s)`;
    });

    // Migration info
    const infoBox = container.createDiv({ cls: "migration-info" });
    infoBox.createEl("h3", { text: "What will be updated:" });
    const updateList = infoBox.createEl("ul");
    updateList.createEl("li", { text: "✅ New frontmatter fields will be added" });
    updateList.createEl("li", { text: "✅ Inline button blocks replaced with dynamic render blocks" });
    updateList.createEl("li", { text: "✅ Template version will be tracked" });
    updateList.createEl("li", { text: "✅ Map tokens will be created for PCs/NPCs/creatures" });

    infoBox.createEl("h3", { text: "Safety measures:" });
    const safetyList = infoBox.createEl("ul");
    safetyList.createEl("li", { text: "🛡️ All your existing content is preserved" });
    safetyList.createEl("li", { text: "🛡️ All frontmatter values are preserved" });
    safetyList.createEl("li", { text: "🛡️ Backups created before any changes" });
    safetyList.createEl("li", { text: "🛡️ Atomic writes — partial failures don't corrupt files" });

    // Migrate button
    const migrateBtn = container.createEl("button", {
      text: `Migrate ${this.selectedIndices.size} file(s)`,
      cls: "mod-cta",
    });

    migrateBtn.addEventListener("click", async () => {
      await this.performMigration(migrateBtn, container);
    });
  }

  private async performMigration(button: HTMLButtonElement, container: HTMLElement): Promise<void> {
    if (this.selectedIndices.size === 0) {
      new Notice("No files selected for migration.");
      return;
    }

    button.disabled = true;

    // Collect selected scan results
    const selected = Array.from(this.selectedIndices)
      .sort((a, b) => a - b)
      .map(i => this.scanResults[i]!)
      .filter(Boolean);

    // Run migrations with progress
    const results = await this.plugin.migrationRunner.migrateFiles(
      selected,
      (current, total, file) => {
        button.textContent = `Migrating ${current}/${total}: ${file.name}`;
      },
    );

    // Show results
    container.empty();

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    if (succeeded > 0) {
      container.createEl("p", {
        text: `✅ Successfully migrated ${succeeded} file(s)!`,
        cls: "migration-success",
      });
    }

    if (failed.length > 0) {
      container.createEl("p", {
        text: `⚠️ Failed to migrate ${failed.length} file(s):`,
        cls: "migration-warning",
      });
      const errorList = container.createEl("ul");
      for (const f of failed) {
        errorList.createEl("li", {
          text: `${f.file.path}: ${f.error ?? "Unknown error"}`,
        });
      }
    }

    container.createEl("p", {
      text: "Backups saved to .dnd-hub-backups/ in your vault.",
      cls: "migration-info-text",
    });

    new Notice(`Migration complete: ${succeeded} succeeded, ${failed.length} failed.`);

    // Cleanup / Close buttons
    const btnRow = container.createDiv({ attr: { style: "display: flex; gap: 10px; margin-top: 16px;" } });

    const cleanupBtn = btnRow.createEl("button", { text: "🗑️ Remove Backups" });
    cleanupBtn.addEventListener("click", async () => {
      const count = await this.plugin.migrationRunner.cleanupBackups();
      new Notice(`Cleaned up ${count} backup file(s).`);
      cleanupBtn.disabled = true;
      cleanupBtn.textContent = "Backups removed";
    });

    const closeBtn = btnRow.createEl("button", { text: "Close", cls: "mod-cta" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
