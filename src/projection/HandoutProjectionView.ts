/**
 * HandoutProjectionView — Obsidian ItemView that renders handout content
 * (images, notes, PDFs) as a temporary overlay on a player-facing screen.
 *
 * Lifecycle:
 *  - Projected via ProjectionManager.projectHandout()
 *  - Stopped via ProjectionManager.stopHandout()
 *  - Auto-stops if the source file is deleted while projected
 */

import { ItemView, MarkdownRenderer, WorkspaceLeaf } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import { HANDOUT_PROJECTION_VIEW_TYPE } from '../constants';
import type { HandoutProjectionState } from './types';

export class HandoutProjectionView extends ItemView {
  private plugin: DndCampaignHubPlugin;
  private filePath = '';
  private contentType: HandoutProjectionState['contentType'] = 'image';
  private contentContainer!: HTMLElement;

  private _modifyRef: (() => void) | null = null;
  private _deleteRef: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return HANDOUT_PROJECTION_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Handout Projection';
  }

  getIcon(): string {
    return 'image';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('dnd-handout-root');

    this.contentContainer = container.createDiv({ cls: 'dnd-handout-content' });
    if (this.filePath) {
      await this.renderContent();
    }
    this.hideObsidianChrome();
    this.registerFileListeners();
  }

  async onClose(): Promise<void> {
    this.unregisterFileListeners();
    this.containerEl.empty();
  }

  async setState(state: any, result: any): Promise<void> {
    if (state?.filePath) {
      this.filePath = state.filePath;
      this.contentType = state.contentType ?? 'image';
      if (this.contentContainer) {
        await this.renderContent();
      }
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return { filePath: this.filePath, contentType: this.contentType };
  }

  // ── Rendering ────────────────────────────────────────────────────

  private async renderContent(): Promise<void> {
    this.contentContainer.empty();

    switch (this.contentType) {
      case 'image':
        this.renderImage();
        break;
      case 'pdf':
        this.renderPdf();
        break;
      case 'note':
        await this.renderNote();
        break;
    }
  }

  private renderImage(): void {
    const img = this.contentContainer.createEl('img', { cls: 'handout-image' });
    img.src = this.app.vault.adapter.getResourcePath(this.filePath);
    img.alt = '';
  }

  private renderPdf(): void {
    const embed = this.contentContainer.createEl('embed', { cls: 'handout-pdf' });
    (embed as HTMLEmbedElement).src = this.app.vault.adapter.getResourcePath(this.filePath);
    (embed as HTMLEmbedElement).type = 'application/pdf';

    embed.addEventListener('error', () => {
      embed.remove();
      this.contentContainer.createDiv({
        cls: 'handout-fallback',
        text: `PDF: ${this.filePath.split('/').pop() ?? this.filePath}`,
      });
    });
  }

  private async renderNote(): Promise<void> {
    const noteContainer = this.contentContainer.createDiv({ cls: 'handout-note' });
    try {
      const content = await this.app.vault.adapter.read(this.filePath);
      await MarkdownRenderer.render(
        this.app,
        content,
        noteContainer,
        this.filePath,
        this,
      );
    } catch (e) {
      noteContainer.createDiv({
        cls: 'handout-fallback',
        text: `Could not render note: ${this.filePath}`,
      });
    }
  }

  // ── File event listeners ────────────────────────────────────────

  private registerFileListeners(): void {
    this._modifyRef = this.app.vault.on('modify', async (file) => {
      if (this.contentType === 'note' && file.path === this.filePath) {
        await this.renderContent();
      }
    }) as unknown as () => void;

    this._deleteRef = this.app.vault.on('delete', (file) => {
      if (file.path === this.filePath) {
        const sKey = this.findOwnScreenKey();
        if (sKey) {
          this.plugin.projectionManager.stopHandout(sKey).catch((e) => {
            console.error('HandoutProjectionView: stopHandout on delete failed', e);
          });
        }
      }
    }) as unknown as () => void;

    this.registerEvent(this._modifyRef as any);
    this.registerEvent(this._deleteRef as any);
  }

  private unregisterFileListeners(): void {
    // Listeners registered via registerEvent are automatically cleaned up on close
    this._modifyRef = null;
    this._deleteRef = null;
  }

  /**
   * Find the screenKey that is currently showing this view as a handout.
   * Checks both managed screens (via SessionProjectionManager) and
   * unmanaged popout leaves (via ProjectionManager.handoutLeaves).
   */
  private findOwnScreenKey(): string | null {
    return this.plugin.projectionManager.findHandoutScreenKeyForLeaf(this.leaf);
  }

  // ── Chrome hiding ───────────────────────────────────────────────

  private hideObsidianChrome(): void {
    const win = this.containerEl.ownerDocument?.defaultView;
    if (!win || win === window) return;

    const doc = win.document;
    if (doc.getElementById('dnd-handout-chrome-hide')) return;

    const style = doc.createElement('style');
    style.id = 'dnd-handout-chrome-hide';
    style.textContent = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #000 !important;
        overflow: hidden !important;
      }
      .app-container {
        padding: 0 !important;
        background: #000 !important;
      }
      .workspace {
        padding: 0 !important;
        background: #000 !important;
      }
      .workspace-split {
        margin: 0 !important;
        padding: 0 !important;
        background: #000 !important;
      }
      .workspace-tab-header-container { display: none !important; }
      .view-header { display: none !important; }
      .titlebar { display: none !important; }
      .sidebar-toggle-button { display: none !important; }
      .status-bar { display: none !important; }
      .mod-root {
        top: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        background: #000 !important;
      }
      .workspace-leaf {
        padding: 0 !important;
        margin: 0 !important;
      }
      .workspace-leaf-content {
        position: relative !important;
        padding: 0 !important;
        margin: 0 !important;
        background: #000 !important;
      }
      .workspace-leaf-content::before { display: none !important; }
      .view-content {
        padding: 0 !important;
        margin: 0 !important;
        height: 100% !important;
        background: #000 !important;
      }
    `;
    doc.head.appendChild(style);
  }
}
