import { App, Modal, Setting, Notice } from "obsidian";

export class TimerNameModal extends Modal {
  resolve: (value: string | null) => void;
  defaultName: string;

  constructor(app: App, defaultName: string, resolve: (value: string | null) => void) {
    super(app);
    this.defaultName = defaultName;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Add Timer" });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: "Enter timer name...",
    });
    input.value = this.defaultName;

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.resolve(null);
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Add",
      cls: "mod-cta",
    });
    createButton.addEventListener("click", () => {
      const name = input.value.trim();
      if (name) {
        this.close();
        this.resolve(name);
      }
    });

    input.focus();
    input.select();
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        createButton.click();
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
