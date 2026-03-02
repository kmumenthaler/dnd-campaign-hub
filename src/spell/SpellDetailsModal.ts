import { App, Modal, Notice } from "obsidian";
import type DndCampaignHubPlugin from '../main';

export class SpellDetailsModal extends Modal {
  plugin: DndCampaignHubPlugin;
  spellData: any;

  constructor(app: App, plugin: DndCampaignHubPlugin, spellData: any) {
    super(app);
    this.plugin = plugin;
    this.spellData = spellData;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("spell-details-modal");

    const spell = this.spellData;

    // Header
    contentEl.createEl("h2", { text: spell.name });
    
    const meta = contentEl.createEl("div", { cls: "spell-meta" });
    const levelText = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
    meta.createEl("span", { text: `${levelText} ${spell.school.name}`, cls: "spell-level-school" });

    // Details grid
    const details = contentEl.createEl("div", { cls: "spell-details-grid" });

    this.addDetail(details, "⏱️ Casting Time", spell.casting_time);
    this.addDetail(details, "📏 Range", spell.range);
    this.addDetail(details, "🎭 Components", spell.components.join(", ") + (spell.material ? ` (${spell.material})` : ""));
    this.addDetail(details, "⏳ Duration", spell.duration);
    
    if (spell.concentration) {
      details.createEl("div", { text: "⚠️ Requires Concentration", cls: "spell-concentration" });
    }
    if (spell.ritual) {
      details.createEl("div", { text: "🕯️ Ritual", cls: "spell-ritual" });
    }

    // Description
    const descSection = contentEl.createEl("div", { cls: "spell-description" });
    descSection.createEl("h3", { text: "Description" });
    spell.desc.forEach((para: string) => {
      descSection.createEl("p", { text: para });
    });

    // Higher levels
    if (spell.higher_level && spell.higher_level.length > 0) {
      const higherSection = contentEl.createEl("div", { cls: "spell-higher-level" });
      higherSection.createEl("h3", { text: "At Higher Levels" });
      spell.higher_level.forEach((para: string) => {
        higherSection.createEl("p", { text: para });
      });
    }

    // Classes
    if (spell.classes && spell.classes.length > 0) {
      const classesSection = contentEl.createEl("div", { cls: "spell-classes" });
      classesSection.createEl("strong", { text: "Classes: " });
      classesSection.createEl("span", { 
        text: spell.classes.map((c: any) => c.name).join(", ")
      });
    }

    // Buttons
    const buttonContainer = contentEl.createEl("div", { cls: "dnd-modal-buttons" });
    
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const importBtn = buttonContainer.createEl("button", { 
      text: "📥 Import Spell",
      cls: "mod-cta"
    });
    importBtn.addEventListener("click", async () => {
      await this.importSpell();
      this.close();
    });
  }

  addDetail(container: HTMLElement, label: string, value: string) {
    const detail = container.createEl("div", { cls: "spell-detail" });
    detail.createEl("strong", { text: label + ": " });
    detail.createEl("span", { text: value });
  }

  async importSpell() {
    try {
      const spell = this.spellData;
      const spellPath = `${this.plugin.settings.currentCampaign}/Spells`;
      await this.plugin.ensureFolderExists(spellPath);

      // Build spell content from API data
      const levelText = spell.level === 0 ? "Cantrip" : spell.level.toString();
      const components = spell.components.join(", ");
      const material = spell.material ? `\nMaterials: ${spell.material}` : "";
      
      const description = spell.desc.join("\n\n");
      const higherLevel = spell.higher_level && spell.higher_level.length > 0 
        ? spell.higher_level.join("\n\n")
        : "N/A";

      const classes = spell.classes && spell.classes.length > 0
        ? spell.classes.map((c: any) => c.name).join(", ")
        : "N/A";

      const content = `---
type: spell
template_version: 1.0.0
name: ${spell.name}
level: ${spell.level}
school: ${spell.school.name}
casting_time: ${spell.casting_time}
range: ${spell.range}
components: ${components}
duration: ${spell.duration}
concentration: ${spell.concentration || false}
ritual: ${spell.ritual || false}
classes: ${classes}
source: SRD
---

# ${spell.name}

**${levelText} ${spell.school.name}**

**Casting Time:** ${spell.casting_time}  
**Range:** ${spell.range}  
**Components:** ${components}${material}  
**Duration:** ${spell.duration}${spell.concentration ? " (Concentration)" : ""}${spell.ritual ? " (Ritual)" : ""}

## Description

${description}

## At Higher Levels

${higherLevel}

## Classes

${classes}
`;

      const filePath = `${spellPath}/${spell.name}.md`;
      await this.app.vault.create(filePath, content);
      await this.app.workspace.openLinkText(filePath, "", true);
      new Notice(`✅ Spell "${spell.name}" imported successfully!`);
    } catch (error) {
      new Notice(`❌ Error importing spell: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Import error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}