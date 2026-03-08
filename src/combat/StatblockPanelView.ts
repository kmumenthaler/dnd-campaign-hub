import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import { STATBLOCK_PANEL_VIEW_TYPE } from "../constants";

/**
 * Lightweight leaf view that renders a Fantasy Statblocks code block.
 *
 * Because it lives in its own WorkspaceLeaf, Obsidian's full markdown
 * post-processor pipeline runs — including the Dice Roller plugin.
 */
export class StatblockPanelView extends ItemView {
  private creatureName = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return STATBLOCK_PANEL_VIEW_TYPE;
  }
  getDisplayText(): string {
    return this.creatureName ? `Statblock: ${this.creatureName}` : "Statblock";
  }
  getIcon(): string {
    return "book-open";
  }

  async onOpen() {
    await this.renderStatblock();
  }

  async setState(state: { creature?: string }, result: any) {
    if (state.creature) {
      this.creatureName = state.creature;
      await this.renderStatblock();
    }
    return super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return { creature: this.creatureName };
  }

  private async renderStatblock() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();

    if (!this.creatureName) {
      container.createEl("p", { text: "No creature selected." });
      return;
    }

    const markdown = "```statblock\ncreature: " + this.creatureName + "\n```";
    await MarkdownRenderer.render(this.app, markdown, container, "", this);
  }

  onClose() {
    return Promise.resolve();
  }
}
