import { App, PluginSettingTab, Setting } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { MapManagerModal } from "../map/MapManagerModal";
import { PurgeConfirmModal } from "../hub/PurgeConfirmModal";

export class DndCampaignHubSettingTab extends PluginSettingTab {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "D&D Campaign Hub Settings" });

    // Campaign Settings
    containerEl.createEl("h3", { text: "⚙️ Campaign Settings" });

    new Setting(containerEl)
      .setName("Current Campaign")
      .setDesc("The currently active campaign for quick access")
      .addText((text) =>
        text
          .setPlaceholder("ttrpgs/Campaign Name")
          .setValue(this.plugin.settings.currentCampaign)
          .onChange(async (value) => {
            this.plugin.settings.currentCampaign = value;
            await this.plugin.saveSettings();
          })
      );

    // Map Management Section
    containerEl.createEl("h3", { text: "🗺️ Map Management" });

    const mapMgmtContainer = containerEl.createDiv({ cls: "dnd-about-container" });
    mapMgmtContainer.createEl("p", {
      text: "Create, edit, and delete your battle maps and world maps."
    });

    new Setting(containerEl)
      .setName("Open Map Manager")
      .setDesc("View and manage all maps in your campaign")
      .addButton((button) =>
        button
          .setButtonText("🗺️ Map Manager")
          .setCta()
          .onClick(() => {
            new MapManagerModal(this.app, this.plugin, this.plugin.mapManager).open();
          })
      );

    // SRD Data Import Section
    containerEl.createEl("h3", { text: "📥 SRD Data Import" });
    
    const srdContainer = containerEl.createDiv({ cls: "dnd-about-container" });
    srdContainer.createEl("p", { 
      text: "Download and import D&D 5e SRD data from the official API. Data will be saved to system folders in your vault." 
    });

    new Setting(containerEl)
      .setName("Import All SRD Data")
      .setDesc("Downloads all available SRD content (conditions, equipment, races, features, etc.) and saves to system folders (e.g., z_Conditions, z_Equipment). This may take several minutes.")
      .addButton((button) =>
        button
          .setButtonText("Import All SRD Data")
          .setCta()
          .onClick(async () => {
            await this.plugin.importAllSRDData();
          })
      );

    new Setting(containerEl)
      .setName("Import Individual Categories")
      .setDesc("Import specific SRD data categories")
      .setHeading();

    const srdCategories = [
      { key: "ability-scores", folder: "z_AbilityScores", name: "Ability Scores" },
      { key: "classes", folder: "z_Classes", name: "Classes" },
      { key: "conditions", folder: "z_Conditions", name: "Conditions" },
      { key: "damage-types", folder: "z_DamageTypes", name: "Damage Types" },
      { key: "equipment", folder: "z_Equipment", name: "Equipment" },
      { key: "features", folder: "z_Features", name: "Features" },
      { key: "languages", folder: "z_Languages", name: "Languages" },
      { key: "magic-schools", folder: "z_MagicSchools", name: "Magic Schools" },
      { key: "proficiencies", folder: "z_Proficiencies", name: "Proficiencies" },
      { key: "races", folder: "z_Races", name: "Races" },
      { key: "skills", folder: "z_Skills", name: "Skills" },
      { key: "subclasses", folder: "z_Subclasses", name: "Subclasses" },
      { key: "subraces", folder: "z_Subraces", name: "Subraces" },
      { key: "traits", folder: "z_Traits", name: "Traits" },
      { key: "weapon-properties", folder: "z_WeaponProperties", name: "Weapon Properties" }
    ];

    srdCategories.forEach(category => {
      new Setting(containerEl)
        .setName(category.name)
        .addButton((button) =>
          button
            .setButtonText(`Import ${category.name}`)
            .onClick(async () => {
              await this.plugin.importSRDCategory(category.key, category.folder, category.name);
            })
        );
    });

    // SRD Creature Token Import
    containerEl.createEl("h3", { text: "🐉 SRD Creature Token Import" });

    const creatureImportContainer = containerEl.createDiv({ cls: "dnd-about-container" });
    creatureImportContainer.createEl("p", {
      text: "Import all 334 SRD creatures as battlemap tokens with artwork. Each creature gets a note in z_Beastiarity with full stats, a token in the marker library with the correct size and darkvision, and its SRD artwork saved locally. Already-existing creatures will be overwritten."
    });

    const creatureImportStatusEl = containerEl.createDiv();

    new Setting(containerEl)
      .setName("Import All SRD Creature Tokens")
      .setDesc("Downloads all SRD monsters, their images, creates creature notes and battlemap tokens. This may take a few minutes.")
      .addButton((button) =>
        button
          .setButtonText("🐉 Import SRD Creatures")
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText("⏳ Importing…");
            creatureImportStatusEl.empty();
            creatureImportStatusEl.createEl("p", { text: "Import in progress… check Obsidian notices for updates." });

            try {
              const result = await this.plugin.importSRDCreatureTokens();
              creatureImportStatusEl.empty();
              creatureImportStatusEl.createEl("p", {
                text: `✅ Done! ${result.imported} creatures imported, ${result.errors} errors.`
              });
            } catch (err) {
              creatureImportStatusEl.empty();
              creatureImportStatusEl.createEl("p", {
                text: `❌ Import failed: ${err instanceof Error ? err.message : String(err)}`
              });
            } finally {
              button.setDisabled(false);
              button.setButtonText("🐉 Import SRD Creatures");
            }
          })
      );

    // Battle Map Settings
    containerEl.createEl("h3", { text: "�️ Battle Maps" });

    new Setting(containerEl)
      .setName("Auto-pan to active combatant")
      .setDesc(
        "When combat is running, smoothly pan the projected player view " +
        "to center on the active combatant's token each time the turn changes."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.combatAutoPan)
          .onChange(async (value) => {
            this.plugin.settings.combatAutoPan = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "�🔦 Dynamic Lighting" });

    new Setting(containerEl)
      .setName("Vision update mode")
      .setDesc(
        "Controls when fog of war updates during token movement. " +
        "'Update on drop' freezes the fog while dragging and recomputes when you release the token. " +
        "'Update while dragging' recomputes the fog each time the token crosses a grid cell boundary."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("on-drop", "Update on drop (fast)")
          .addOption("while-dragging", "Update while dragging (live)")
          .setValue(this.plugin.settings.visionUpdateMode)
          .onChange(async (value) => {
            this.plugin.settings.visionUpdateMode = value as 'on-drop' | 'while-dragging';
            await this.plugin.saveSettings();
          })
      );

    // About Section
    containerEl.createEl("h3", { text: "ℹ️ About" });
    
    const aboutContainer = containerEl.createDiv({ cls: "dnd-about-container" });
    aboutContainer.createEl("p", { 
      text: `D&D Campaign Hub v${this.plugin.manifest.version}` 
    });
    aboutContainer.createEl("p", { 
      text: "A comprehensive plugin for managing D&D campaigns in Obsidian." 
    });
    
    new Setting(containerEl)
      .setName("Migrate Files")
      .setDesc("Safely migrate campaign files to the latest template versions (preserves all your content)")
      .addButton((button) =>
        button
          .setButtonText("Migrate Files")
          .setCta()
          .onClick(async () => {
            this.plugin.migrateTemplates();
          })
      );

    containerEl.createEl("h3", { text: "Danger Zone" });

    new Setting(containerEl)
      .setName("Purge D&D Campaign Hub")
      .setDesc("⚠️ Remove all D&D Campaign Hub folders and files from this vault. This cannot be undone!")
      .addButton((button) =>
        button
          .setButtonText("Purge Vault")
          .setWarning()
          .onClick(async () => {
            new PurgeConfirmModal(this.app, this.plugin).open();
          })
      );
  }
}
