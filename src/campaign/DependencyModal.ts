import { App, Modal, Setting } from "obsidian";

export class DependencyModal extends Modal {
  dependencies: { missing: string[]; installed: string[] };

  constructor(app: App, dependencies: { missing: string[]; installed: string[] }) {
    super(app);
    this.dependencies = dependencies;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "⚠️ Missing Plugin Dependencies" });

    contentEl.createEl("p", {
      text: "D&D Campaign Hub requires the following community plugins to work properly:"
    });

    // Show missing plugins
    if (this.dependencies.missing.length > 0) {
      const missingList = contentEl.createEl("div", { cls: "dnd-dependency-list" });
      missingList.createEl("h3", { text: "❌ Missing:" });
      const ul = missingList.createEl("ul");
      this.dependencies.missing.forEach(plugin => {
        ul.createEl("li", { text: plugin });
      });
    }

    // Show installed plugins
    if (this.dependencies.installed.length > 0) {
      const installedList = contentEl.createEl("div", { cls: "dnd-dependency-list" });
      installedList.createEl("h3", { text: "✅ Installed:" });
      const ul = installedList.createEl("ul");
      this.dependencies.installed.forEach(plugin => {
        ul.createEl("li", { text: plugin });
      });
    }

    contentEl.createEl("h3", { text: "📦 How to Install" });
    const instructions = contentEl.createEl("div", { cls: "dnd-dependency-instructions" });
    instructions.createEl("p", { text: "1. Open Settings → Community Plugins" });
    instructions.createEl("p", { text: "2. Click 'Browse' to open the plugin browser" });
    instructions.createEl("p", { text: "3. Search for and install the missing plugins" });
    instructions.createEl("p", { text: "4. Enable each plugin after installation" });
    instructions.createEl("p", { text: "5. Return to D&D Campaign Hub and try again" });

    contentEl.createEl("p", { 
      text: "💡 These plugins add buttons, tables, and calendar features that make your campaigns interactive and organized.",
      cls: "dnd-dependency-note"
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const settingsButton = buttonContainer.createEl("button", {
      text: "Open Settings",
      cls: "mod-cta"
    });
    settingsButton.addEventListener("click", () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('community-plugins');
      this.close();
    });

    const closeButton = buttonContainer.createEl("button", { text: "Close" });
    closeButton.addEventListener("click", () => {
      this.close();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
