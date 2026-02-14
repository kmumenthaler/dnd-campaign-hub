import { App, Modal, Notice, TFile } from "obsidian";
import { MigrationManager, TEMPLATE_VERSIONS } from "./MigrationManager";

/**
 * Interface for the plugin context needed by MigrationModal
 */
export interface MigrationPluginContext {
  migrationManager: MigrationManager;
  settings: { currentCampaign: string };
  getAllCampaigns(): string[] | { name: string }[];
}

/**
 * Modal for managing safe file migrations
 */
export class MigrationModal extends Modal {
  plugin: MigrationPluginContext;
  private filesNeedingMigration: TFile[] = [];
  private selectedFiles: Set<TFile> = new Set();
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
      const campaignName = typeof campaign === 'string' ? campaign : campaign.name;
      const option = campaignSelect.createEl("option", { 
        text: campaignName,
        value: `ttrpgs/${campaignName}`
      });
      if (`ttrpgs/${campaign}` === this.plugin.settings.currentCampaign) {
        option.selected = true;
      }
    });

    this.currentCampaign = campaignSelect.value;

    // Scan button
    const scanBtn = contentEl.createEl("button", {
      text: "🔍 Scan for Updates",
      cls: "mod-cta"
    });

    const resultsContainer = contentEl.createDiv({ cls: "migration-results" });

    scanBtn.addEventListener("click", async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = "Scanning...";
      resultsContainer.empty();

      this.filesNeedingMigration = await this.plugin.migrationManager.findFilesNeedingMigration(this.currentCampaign);
      
      if (this.filesNeedingMigration.length === 0) {
        resultsContainer.createEl("p", { 
          text: "✅ All files are up to date!",
          cls: "migration-success"
        });
        scanBtn.disabled = false;
        scanBtn.textContent = "🔍 Scan for Updates";
        return;
      }

      // Show results
      resultsContainer.createEl("h3", { 
        text: `Found ${this.filesNeedingMigration.length} file(s) that can be updated:` 
      });

      // Select all checkbox
      const selectAllContainer = resultsContainer.createDiv({ cls: "setting-item" });
      const selectAllCheckbox = selectAllContainer.createEl("input", { type: "checkbox" });
      selectAllCheckbox.checked = true;
      selectAllContainer.createEl("label", { text: " Select all files" });
      
      selectAllCheckbox.addEventListener("change", () => {
        const allCheckboxes = resultsContainer.querySelectorAll('input[type="checkbox"]:not(:first-child)');
        allCheckboxes.forEach((element) => {
          const checkbox = element as HTMLInputElement;
          checkbox.checked = selectAllCheckbox.checked;
        });
        this.updateSelectedFiles();
      });

      // File list
      const fileList = resultsContainer.createEl("div", { cls: "migration-file-list" });
      
      for (const file of this.filesNeedingMigration) {
        const fileItem = fileList.createDiv({ cls: "migration-file-item" });
        
        const checkbox = fileItem.createEl("input", { type: "checkbox" });
        checkbox.checked = true;
        this.selectedFiles.add(file);

        const fileType = await this.plugin.migrationManager.getFileType(file);
        const currentVersion = await this.plugin.migrationManager.getFileTemplateVersion(file) || "none";
        const targetVersion = TEMPLATE_VERSIONS[fileType as keyof typeof TEMPLATE_VERSIONS];

        fileItem.createEl("span", {
          text: `${file.path} (${fileType}: v${currentVersion} → v${targetVersion})`
        });

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            this.selectedFiles.add(file);
          } else {
            this.selectedFiles.delete(file);
          }
        });
      }

      this.updateSelectedFiles();

      // Migration info
      const infoBox = resultsContainer.createDiv({ cls: "migration-info" });
      infoBox.createEl("h3", { text: "What will be updated:" });
      const updateList = infoBox.createEl("ul");
      updateList.createEl("li", { text: "✅ New frontmatter fields will be added" });
      updateList.createEl("li", { text: "✅ New sections will be injected (not replacing existing ones)" });
      updateList.createEl("li", { text: "✅ Dataview queries may be updated" });
      updateList.createEl("li", { text: "✅ Template version will be tracked" });
      updateList.createEl("li", { text: "✅ Map tokens will be created for PCs/NPCs/creatures" });
      
      infoBox.createEl("h3", { text: "What will be preserved:" });
      const preserveList = infoBox.createEl("ul");
      preserveList.createEl("li", { text: "🛡️ All your existing content" });
      preserveList.createEl("li", { text: "🛡️ All frontmatter values" });
      preserveList.createEl("li", { text: "🛡️ All sections you've written" });

      // Migrate button
      const migrateBtn = resultsContainer.createEl("button", {
        text: `Migrate ${this.selectedFiles.size} file(s)`,
        cls: "mod-cta"
      });

      migrateBtn.addEventListener("click", async () => {
        await this.performMigration(migrateBtn, resultsContainer);
      });

      scanBtn.disabled = false;
      scanBtn.textContent = "🔍 Scan for Updates";
    });

    campaignSelect.addEventListener("change", () => {
      this.currentCampaign = campaignSelect.value;
      resultsContainer.empty();
      this.filesNeedingMigration = [];
      this.selectedFiles.clear();
    });

    // Close button
    const closeBtn = contentEl.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  private updateSelectedFiles() {
    // This method can be used to update UI based on selection
  }

  private async performMigration(button: HTMLButtonElement, container: HTMLElement) {
    if (this.selectedFiles.size === 0) {
      new Notice("No files selected for migration.");
      return;
    }

    button.disabled = true;
    button.textContent = "Migrating...";

    const filesToMigrate = Array.from(this.selectedFiles);
    const result = await this.plugin.migrationManager.migrateFiles(filesToMigrate);

    container.empty();
    
    if (result.success > 0) {
      container.createEl("p", {
        text: `✅ Successfully migrated ${result.success} file(s)!`,
        cls: "migration-success"
      });
    }

    if (result.failed > 0) {
      container.createEl("p", {
        text: `⚠️ Failed to migrate ${result.failed} file(s). Check console for details.`,
        cls: "migration-warning"
      });
    }

    new Notice(`Migration complete: ${result.success} succeeded, ${result.failed} failed.`);

    // Add close button
    const closeBtn = container.createEl("button", { text: "Close", cls: "mod-cta" });
    closeBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
