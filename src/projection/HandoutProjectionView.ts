/**
 * HandoutProjectionView — Obsidian ItemView that renders handout content
 * (images, notes, PDFs) as a temporary overlay on a player-facing screen.
 *
 * Lifecycle:
 *  - Projected via ProjectionManager.projectHandout()
 *  - Stopped via ProjectionManager.stopHandout()
 *  - Auto-stops if the source file is deleted while projected
 */

import { EventRef, ItemView, MarkdownRenderer, WorkspaceLeaf, MarkdownView } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import { HANDOUT_PROJECTION_VIEW_TYPE } from '../constants';
import type { HandoutProjectionState } from './types';

export class HandoutProjectionView extends ItemView {
  private plugin: DndCampaignHubPlugin;
  private filePath = '';
  private contentType: HandoutProjectionState['contentType'] = 'image';
  private contentContainer!: HTMLElement;
  private noteScrollContainer: HTMLElement | null = null;
  private sourceView: MarkdownView | null = null;
  private sourceScrollListeners: Array<{ element: HTMLElement; listener: () => void }> = [];
  private sourceEditChangeOff: (() => void) | null = null;
  private activeLeafChangeRef: EventRef | null = null;

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
    await this.bindSourceNoteEvents();
    if (this.filePath) {
      await this.renderContent();
    }
    this.hideObsidianChrome();
    this.registerFileListeners();
  }

  async onClose(): Promise<void> {
    this.unregisterFileListeners();
    this.unregisterSourceListeners();
    this.containerEl.empty();
  }

  async setState(state: any, result: any): Promise<void> {
    const previousFilePath = this.filePath;
    if (state?.filePath) {
      this.filePath = state.filePath;
      this.contentType = state.contentType ?? 'image';
      if (this.filePath !== previousFilePath) {
        await this.bindSourceNoteEvents();
      }
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
    const previousScrollRatio = this.getCurrentScrollRatio();
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

    if (this.contentType === 'note' && this.noteScrollContainer && previousScrollRatio !== null) {
      this.applyScrollRatio(previousScrollRatio);
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
    this.noteScrollContainer = noteContainer;
    try {
      const content = await this.getSourceNoteContent();
      await MarkdownRenderer.render(
        this.app,
        content,
        noteContainer,
        this.filePath,
        this,
      );
      this.applySourceScroll();
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

  private async bindSourceNoteEvents(): Promise<void> {
    this.unregisterSourceListeners();
    if (this.contentType !== 'note' || !this.filePath) return;

    // Rebind when the user switches leaves so we can follow the active note view.
    const activeLeafRef = this.app.workspace.on('active-leaf-change', () => {
      this.updateSourceBindings();
    });
    this.activeLeafChangeRef = activeLeafRef;
    this.registerEvent(activeLeafRef);

    this.updateSourceBindings();
  }

  private updateSourceBindings(): void {
    if (!this.filePath) return;

    const sourceView = this.findSourceMarkdownView();
    const sourceScrollContainer = sourceView ? this.getSourceScrollContainer(sourceView) : null;
    const existingContainer = this.sourceScrollListeners[0]?.element ?? null;

    if (sourceView === this.sourceView && sourceScrollContainer === existingContainer) return;

    this.unregisterSourceListeners();
    this.sourceView = sourceView;

    if (!sourceView || !sourceScrollContainer) return;

    const listener = () => this.applySourceScroll();
    sourceScrollContainer.addEventListener('scroll', listener);
    this.sourceScrollListeners.push({ element: sourceScrollContainer, listener });

    const editor = (sourceView as any).editor;
    if (editor && typeof editor.on === 'function') {
      const changeHandler = () => {
        if (this.contentType === 'note') {
          void this.renderContent();
        }
      };
      editor.on('change', changeHandler);
      if (typeof editor.off === 'function') {
        this.sourceEditChangeOff = () => editor.off('change', changeHandler);
      }
    }
  }

  private unregisterSourceListeners(): void {
    for (const { element, listener } of this.sourceScrollListeners) {
      element.removeEventListener('scroll', listener);
    }
    this.sourceScrollListeners = [];
    this.sourceView = null;
    if (this.sourceEditChangeOff) {
      this.sourceEditChangeOff();
      this.sourceEditChangeOff = null;
    }
    if (this.activeLeafChangeRef) {
      this.app.workspace.offref(this.activeLeafChangeRef);
      this.activeLeafChangeRef = null;
    }
  }

  private findSourceMarkdownView(): MarkdownView | null {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.file?.path === this.filePath) {
      return activeLeaf.view;
    }

    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as MarkdownView;
      if (view.file?.path === this.filePath) {
        return view;
      }
    }

    return null;
  }

  private getSourceScrollContainer(view: MarkdownView): HTMLElement | null {
    const preview = view.containerEl.querySelector('.markdown-preview-view') as HTMLElement | null;
    const source = view.containerEl.querySelector('.cm-scroller') as HTMLElement | null;
    const sourceView = view.containerEl.querySelector('.markdown-source-view') as HTMLElement | null;

    if (typeof (view as any).getMode === 'function') {
      const mode = (view as any).getMode();
      if (mode === 'preview' || mode === 'reading') {
        return preview ?? sourceView ?? source;
      }
      if (mode === 'source') {
        return source ?? sourceView ?? preview;
      }
    }

    if (preview && this.isElementVisible(preview)) return preview;
    if (source && this.isElementVisible(source)) return source;
    if (sourceView && this.isElementVisible(sourceView)) return sourceView;

    return preview ?? source ?? sourceView;
  }

  private isElementVisible(element: HTMLElement): boolean {
    return element.offsetHeight > 0 && element.offsetWidth > 0;
  }

  private getSourceNoteContent(): Promise<string> {
    if (this.sourceView) {
      const editor = (this.sourceView as any).editor;
      if (editor?.getValue && typeof editor.getValue === 'function') {
        return Promise.resolve(editor.getValue());
      }
    }
    return this.app.vault.adapter.read(this.filePath);
  }

  private applySourceScroll(): void {
    if (!this.sourceView || !this.noteScrollContainer) return;

    const sourceScrollInfo = this.getSourceScrollInfo(this.sourceView);
    if (!sourceScrollInfo) return;

    const target = this.noteScrollContainer;
    const targetScrollHeight = target.scrollHeight - target.clientHeight;
    if (targetScrollHeight <= 0) return;

    target.scrollTop = Math.round(sourceScrollInfo.ratio * targetScrollHeight);
  }

  private getSourceScrollInfo(view: MarkdownView): { ratio: number } | null {
    const container = this.getSourceScrollContainer(view);
    if (!container) return null;

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return { ratio: 0 };

    return { ratio: container.scrollTop / maxScroll };
  }

  private getCurrentScrollRatio(): number | null {
    const container = this.noteScrollContainer;
    if (!container) return null;

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return 0;

    return container.scrollTop / maxScroll;
  }

  private applyScrollRatio(ratio: number): void {
    if (!this.noteScrollContainer) return;

    const target = this.noteScrollContainer;
    const maxScroll = target.scrollHeight - target.clientHeight;
    if (maxScroll <= 0) return;

    target.scrollTop = Math.round(ratio * maxScroll);
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
