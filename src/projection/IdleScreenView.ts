/**
 * IdleScreenView — Obsidian ItemView that renders idle/ambient content
 * on a managed player-facing screen.
 *
 * Supports: solid black, solid color, static image, looping video.
 * Shown when no active map/combat/media is projected.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import { IDLE_SCREEN_VIEW_TYPE } from '../constants';
import type { IdleContentConfig } from './types';

export class IdleScreenView extends ItemView {
  private plugin: DndCampaignHubPlugin;
  private idleContent: IdleContentConfig = { type: 'black' };
  private contentContainer!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return IDLE_SCREEN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Idle Screen';
  }

  getIcon(): string {
    return 'monitor';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('dnd-idle-screen-root');

    this.contentContainer = container.createDiv({ cls: 'dnd-idle-screen-content' });
    this.renderIdleContent();
    this.hideObsidianChrome();
  }

  async onClose(): Promise<void> {
    this.containerEl.empty();
  }

  /** Called by Obsidian when the view state is set (e.g. during transitions). */
  async setState(state: any, result: any): Promise<void> {
    if (state?.idleContent) {
      this.idleContent = state.idleContent;
      if (this.contentContainer) {
        this.renderIdleContent();
      }
    }
    await super.setState(state, result);
  }

  getState(): any {
    return { idleContent: this.idleContent };
  }

  // ── Rendering ───────────────────────────────────────────────────

  private renderIdleContent(): void {
    this.contentContainer.empty();

    switch (this.idleContent.type) {
      case 'black':
        this.contentContainer.style.backgroundColor = '#000000';
        break;

      case 'color':
        this.contentContainer.style.backgroundColor = this.idleContent.color || '#000000';
        break;

      case 'image':
        this.renderImage();
        break;

      case 'video':
        this.renderVideo();
        break;

      default:
        this.contentContainer.style.backgroundColor = '#000000';
    }
  }

  private renderImage(): void {
    const filePath = this.idleContent.filePath;
    if (!filePath) {
      this.contentContainer.style.backgroundColor = '#000000';
      return;
    }

    const img = this.contentContainer.createEl('img', {
      cls: 'dnd-idle-screen-media',
    });

    const resourcePath = this.app.vault.adapter.getResourcePath(filePath);
    img.src = resourcePath;
    img.style.objectFit = this.idleContent.objectFit || 'cover';
  }

  private renderVideo(): void {
    const filePath = this.idleContent.filePath;
    if (!filePath) {
      this.contentContainer.style.backgroundColor = '#000000';
      return;
    }

    const video = this.contentContainer.createEl('video', {
      cls: 'dnd-idle-screen-media',
    });

    const resourcePath = this.app.vault.adapter.getResourcePath(filePath);
    video.src = resourcePath;
    video.loop = this.idleContent.loop !== false;
    video.muted = this.idleContent.muted !== false;
    video.autoplay = true;
    video.playsInline = true;
    video.style.objectFit = this.idleContent.objectFit || 'cover';
  }

  // ── Chrome hiding ───────────────────────────────────────────────

  private hideObsidianChrome(): void {
    const win = this.containerEl.ownerDocument?.defaultView;
    if (!win || win === window) return;

    const doc = win.document;
    if (doc.getElementById('dnd-idle-screen-chrome-hide')) return;

    const style = doc.createElement('style');
    style.id = 'dnd-idle-screen-chrome-hide';
    style.textContent = `
      .workspace-tab-header-container { display: none !important; }
      .view-header { display: none !important; }
      .titlebar { display: none !important; }
      .sidebar-toggle-button { display: none !important; }
      .status-bar { display: none !important; }
      .mod-root { top: 0 !important; }
      .workspace-leaf-content { position: relative !important; }
      .workspace-leaf-content::before { display: none !important; }
    `;
    doc.head.appendChild(style);
  }
}
