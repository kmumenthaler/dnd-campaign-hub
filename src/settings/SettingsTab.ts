import { App, PluginSettingTab, Setting } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { MapManagerModal } from "../map/MapManagerModal";
import { PurgeConfirmModal } from "../hub/PurgeConfirmModal";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a collapsible section with a chevron toggle and smooth animation. */
function addSection(
  parent: HTMLElement,
  title: string,
  description: string,
  opts: { startOpen?: boolean; cls?: string } = {},
): HTMLElement {
  const open = opts.startOpen ?? false;
  const section = parent.createDiv({ cls: `dnd-settings-section ${opts.cls ?? ""}` });

  const header = section.createDiv({ cls: "dnd-settings-section-header" });
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", String(open));

  const chevron = header.createEl("span", { cls: "dnd-settings-chevron" });
  chevron.textContent = "▶";
  header.createEl("span", { text: title, cls: "dnd-settings-section-title" });

  if (description) {
    section.createEl("p", { text: description, cls: "dnd-settings-section-desc" });
  }

  const body = section.createDiv({ cls: "dnd-settings-section-body" });

  const toggle = () => {
    const expanding = !body.hasClass("is-open");
    body.toggleClass("is-open", expanding);
    chevron.toggleClass("is-open", expanding);
    header.setAttribute("aria-expanded", String(expanding));
  };

  if (open) {
    body.addClass("is-open");
    chevron.addClass("is-open");
  }

  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  return body;
}

// ─── Settings Tab ───────────────────────────────────────────────────────────

export class DndCampaignHubSettingTab extends PluginSettingTab {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("dnd-settings-root");

    // ── Header ──────────────────────────────────────────────────────────
    const hero = containerEl.createDiv({ cls: "dnd-settings-hero" });
    hero.createEl("h2", { text: "D&D Campaign Hub" });
    hero.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      cls: "dnd-settings-version",
    });

    // ── 1. Battle Maps & Combat ─────────────────────────────────────────
    const maps = addSection(containerEl, "Battle Maps & Combat", "Map management, combat behaviour, and dynamic lighting.");

    new Setting(maps)
      .setName("Map Manager")
      .setDesc("Create, edit, and delete your battle maps and world maps.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Map Manager")
          .setCta()
          .onClick(() => {
            new MapManagerModal(this.app, this.plugin, this.plugin.mapManager).open();
          })
      );

    new Setting(maps)
      .setName("Auto-pan to active combatant")
      .setDesc(
        "Smoothly pan the projected player view to center on the active combatant's token each time the turn changes."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.combatAutoPan)
          .onChange(async (value) => {
            this.plugin.settings.combatAutoPan = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(maps)
      .setName("Vision update mode")
      .setDesc(
        "Controls when fog of war recalculates during token movement."
      )
      .addDropdown((dd) =>
        dd
          .addOption("on-drop", "Update on drop (fast)")
          .addOption("while-dragging", "Update while dragging (live)")
          .setValue(this.plugin.settings.visionUpdateMode)
          .onChange(async (value) => {
            this.plugin.settings.visionUpdateMode = value as "on-drop" | "while-dragging";
            await this.plugin.saveSettings();
          })
      );

    new Setting(maps)
      .setName("Map canvas resolution")
      .setDesc(
        "Multiplier for overlay canvas buffers (tokens, fog, grid). Higher values produce sharper tokens on small maps but use more memory. Requires reopening your map."
      )
      .addDropdown((dd) =>
        dd
          .addOption("1", "1× (native)")
          .addOption("2", "2× (default)")
          .addOption("3", "3× (high)")
          .setValue(String(this.plugin.settings.mapCanvasScale ?? 2))
          .onChange(async (value) => {
            this.plugin.settings.mapCanvasScale = parseInt(value, 10);
            await this.plugin.saveSettings();
          })
      );

    // ── 3. SRD Data Import ──────────────────────────────────────────────
    const srd = addSection(containerEl, "SRD Data Import", "Download D&D 5e System Reference Document data from the official API.");

    new Setting(srd)
      .setName("Import all SRD reference data")
      .setDesc("Downloads conditions, equipment, races, features, and more into system folders (z_Conditions, z_Equipment, …).")
      .addButton((btn) =>
        btn
          .setButtonText("Import All")
          .setCta()
          .onClick(async () => {
            await this.plugin.importAllSRDData();
          })
      );

    // Individual categories inside a nested collapsible
    const catBody = addSection(srd, "Individual Categories", "Import a single SRD category.");

    const srdCategories: { key: string; folder: string; name: string }[] = [
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
      { key: "weapon-properties", folder: "z_WeaponProperties", name: "Weapon Properties" },
    ];

    // Render categories as a compact 2-column grid of buttons
    const catGrid = catBody.createDiv({ cls: "dnd-settings-srd-grid" });
    for (const cat of srdCategories) {
      const cell = catGrid.createEl("button", { text: cat.name, cls: "dnd-settings-srd-btn" });
      cell.addEventListener("click", async () => {
        cell.disabled = true;
        cell.textContent = `⏳ ${cat.name}…`;
        try {
          await this.plugin.importSRDCategory(cat.key, cat.folder, cat.name);
        } finally {
          cell.disabled = false;
          cell.textContent = cat.name;
        }
      });
    }

    // Creature token bulk import
    new Setting(srd)
      .setName("Import SRD creature tokens")
      .setDesc(
        "Downloads all 334 SRD creatures with artwork, creating creature notes and battlemap tokens. " +
        "Existing creatures will be overwritten."
      )
      .addButton((btn) => {
        const statusEl = srd.createDiv({ cls: "dnd-settings-import-status" });
        btn
          .setButtonText("Import Creatures")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("⏳ Importing…");
            statusEl.empty();
            statusEl.createEl("p", { text: "Import in progress — check notices for updates." });
            try {
              const result = await this.plugin.importSRDCreatureTokens();
              statusEl.empty();
              statusEl.createEl("p", {
                text: `✅ ${result.imported} creatures imported, ${result.errors} errors.`,
              });
            } catch (err) {
              statusEl.empty();
              statusEl.createEl("p", {
                text: `❌ Import failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("Import Creatures");
            }
          });
      });

    // ── 4. Maintenance ──────────────────────────────────────────────────
    const maintenance = addSection(containerEl, "Maintenance", "Migration tools and plugin information.");

    new Setting(maintenance)
      .setName("Migrate campaign files")
      .setDesc("Safely update your notes to the latest template versions. All content is preserved; backups are created automatically.")
      .addButton((btn) =>
        btn
          .setButtonText("Run Migrations")
          .setCta()
          .onClick(() => {
            this.plugin.migrateTemplates();
          })
      );

    // ── 5. Danger Zone ──────────────────────────────────────────────────
    const danger = addSection(containerEl, "Danger Zone", "Destructive actions — use with caution.", { cls: "dnd-settings-danger" });

    new Setting(danger)
      .setName("Purge all plugin data")
      .setDesc("Permanently remove all D&D Campaign Hub folders and files from this vault. This cannot be undone.")
      .addButton((btn) =>
        btn
          .setButtonText("Purge Vault")
          .setWarning()
          .onClick(() => {
            new PurgeConfirmModal(this.app, this.plugin).open();
          })
      );
  }
}
