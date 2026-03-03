import { App, Modal } from "obsidian";

/**
 * Generic confirmation modal with Yes/No buttons.
 */
export class ConfirmModal extends Modal {
  private resolve: (value: boolean) => void;
  private titleText: string;
  private bodyText: string;

  constructor(app: App, title: string, body: string, resolve: (value: boolean) => void) {
    super(app);
    this.titleText = title;
    this.bodyText = body;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: this.titleText });
    this.bodyText.split('\n').forEach(line => {
      if (line.trim()) contentEl.createEl('p', { text: line });
    });
    const btns = contentEl.createDiv({ cls: 'dnd-modal-buttons' });
    const yes = btns.createEl('button', { text: 'Yes', cls: 'mod-cta' });
    const no  = btns.createEl('button', { text: 'No' });
    yes.onclick = () => { this.resolve(true);  this.close(); };
    no.onclick  = () => { this.resolve(false); this.close(); };
  }

  onClose() {
    this.contentEl.empty();
    this.resolve(false);
  }
}

/**
 * Simple modal to prompt the user for a name.
 */
export class NamePromptModal extends Modal {
  type: string;
  resolve: (value: string | null) => void;

  constructor(app: App, type: string, resolve: (value: string | null) => void) {
    super(app);
    this.type = type;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: `Create New ${this.type}` });

    const input = contentEl.createEl("input", {
      type: "text",
      placeholder: `Enter ${this.type.toLowerCase()} name...`,
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.resolve(null);
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create",
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
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        createButton.click();
      }
    });
  }

  onClose() {
    this.resolve(null);
  }
}

/**
 * Confirmation modal for clearing all drawings from a map.
 */
export class ClearTokensConfirmModal extends Modal {
  private onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Clear All Tokens?" });

    contentEl.createEl("p", {
      text: "This will remove all tokens (players, creatures, NPCs) from the map. Drawings and other annotations will not be affected."
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const confirmButton = buttonContainer.createEl("button", {
      text: "Clear All Tokens",
      cls: "mod-warning"
    });
    confirmButton.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });

    confirmButton.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class ClearDrawingsConfirmModal extends Modal {
  private onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Clear Drawings?" });

    contentEl.createEl("p", {
      text: "This will remove all drawings created with the Draw tool. Markers and other annotations will not be affected."
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const confirmButton = buttonContainer.createEl("button", {
      text: "Clear Drawings",
      cls: "mod-warning"
    });
    confirmButton.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });

    confirmButton.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
