import { App, Modal } from "obsidian";

export type UnsavedState = unknown;

/** Deterministic serialization used to compare form state without object key-order noise. */
export function serializeUnsavedState(value: UnsavedState): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeUnsavedState).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${serializeUnsavedState(record[key])}`).join(",")}}`;
}

export class UnsavedChangesTracker {
  private initial: string | null = null;

  capture(state: UnsavedState): void {
    this.initial = serializeUnsavedState(state);
  }

  isDirty(state: UnsavedState): boolean {
    return this.initial !== null && this.initial !== serializeUnsavedState(state);
  }
}

class DiscardChangesModal extends Modal {
  private settled = false;

  constructor(app: App, private readonly finish: (discard: boolean) => void) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("h3", { text: "Discard unsaved changes?" });
    this.contentEl.createEl("p", { text: "Your changes will be lost if you close this window." });
    const buttons = this.contentEl.createDiv({ cls: "dnd-modal-buttons" });
    buttons.createEl("button", { text: "Keep Editing" }).onclick = () => {
      this.settle(false);
      super.close();
    };
    buttons.createEl("button", { text: "Discard Changes", cls: "mod-warning" }).onclick = () => {
      this.settle(true);
      super.close();
    };
  }

  private settle(discard: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.finish(discard);
  }

  onClose(): void {
    this.settle(false);
    this.contentEl.empty();
  }
}

/** Coordinates close attempts for a modal while leaving form-state ownership with that modal. */
export class UnsavedChangesGuard {
  private readonly tracker = new UnsavedChangesTracker();
  private closeAllowed = false;
  private confirmationOpen = false;

  constructor(private readonly app: App, private readonly getState: () => UnsavedState) {}

  captureInitialState(): void {
    this.tracker.capture(this.getState());
  }

  allowClose(): void {
    this.closeAllowed = true;
  }

  requestClose(closeNow: () => void): void {
    if (this.closeAllowed || !this.tracker.isDirty(this.getState())) {
      closeNow();
      return;
    }
    if (this.confirmationOpen) return;
    this.confirmationOpen = true;
    new DiscardChangesModal(this.app, discard => {
      this.confirmationOpen = false;
      if (discard) {
        this.closeAllowed = true;
        closeNow();
      }
    }).open();
  }
}
