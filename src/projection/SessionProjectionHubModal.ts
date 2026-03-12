/**
 * SessionProjectionHubModal — GM-facing setup UI for launching a projection session.
 *
 * - Enumerates available monitors
 * - Lets the GM select which screens are player-facing
 * - Configures idle content per screen (black / color / image / video)
 * - Starts or stops the session
 */

import { Modal, Notice, Setting } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import { enumerateScreens, screenKey, type ScreenInfo } from '../utils/ScreenEnumeration';
import type { IdleContentConfig, IdleContentType, ManagedScreenConfig } from './types';
import { DEFAULT_IDLE_CONTENT } from './types';

export class SessionProjectionHubModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private screens: ScreenInfo[] = [];

  /** Configs being edited, keyed by screenKey. */
  private selectedScreens: Map<string, ManagedScreenConfig> = new Map();

  constructor(plugin: DndCampaignHubPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-session-projection-modal');

    // Load saved config
    const saved = this.plugin.settings.sessionProjection.managedScreens;
    for (const cfg of saved) {
      this.selectedScreens.set(cfg.screenKey, { ...cfg });
    }

    // Enumerate screens
    try {
      this.screens = await enumerateScreens();
    } catch {
      this.screens = [];
    }

    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // ── Rendering ───────────────────────────────────────────────────

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const spm = this.plugin.sessionProjectionManager;
    const isActive = spm?.isActive() ?? false;

    // Title
    contentEl.createEl('h2', { text: '🎬 Session Projection' });

    // Session status bar
    const statusBar = contentEl.createDiv({
      cls: `session-status ${isActive ? 'active' : 'inactive'}`,
    });
    statusBar.createSpan({ text: isActive ? '● Session Active' : '○ Session Inactive' });

    if (isActive) {
      this.renderActiveSession(contentEl);
    } else {
      this.renderSetup(contentEl);
    }
  }

  // ── Active session view ─────────────────────────────────────────

  private renderActiveSession(container: HTMLElement): void {
    const spm = this.plugin.sessionProjectionManager!;
    const states = spm.getAllScreenStates();

    const list = container.createDiv({ cls: 'screen-list' });
    for (const st of states) {
      const card = list.createDiv({ cls: 'screen-card selected' });
      const header = card.createDiv({ cls: 'screen-card-header' });
      header.createEl('label', { text: `🖥️ ${st.config.screenLabel}` });
      header.createSpan({
        cls: 'screen-card-detail',
        text: st.status === 'idle'
          ? 'Idle'
          : st.status === 'map'
            ? 'Map'
            : st.status === 'combat'
              ? 'Combat'
              : 'Media',
      });
    }

    // Stop session button
    new Setting(container)
      .addButton((btn) => {
        btn.setButtonText('⏹ Stop Session')
          .setCta()
          .onClick(() => {
            spm.stopSession();
            this.render();
          });
      });
  }

  // ── Setup / configure view ──────────────────────────────────────

  private renderSetup(container: HTMLElement): void {
    if (this.screens.length === 0) {
      container.createEl('p', {
        text: 'No screens detected. Make sure your monitors are connected and try again.',
        cls: 'setting-item-description',
      });
      new Setting(container).addButton((btn) =>
        btn.setButtonText('🔄 Refresh').onClick(async () => {
          try {
            this.screens = await enumerateScreens();
          } catch { /* ignore */ }
          this.render();
        }),
      );
      return;
    }

    container.createEl('p', {
      text: 'Select which monitors are player-facing, then configure their idle content.',
      cls: 'setting-item-description',
    });

    const list = container.createDiv({ cls: 'screen-list' });

    for (const screen of this.screens) {
      const sKey = screenKey(screen);
      const isSelected = this.selectedScreens.has(sKey);

      const card = list.createDiv({
        cls: `screen-card ${isSelected ? 'selected' : ''}`,
      });

      // Header with checkbox
      const header = card.createDiv({ cls: 'screen-card-header' });

      const checkbox = header.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
      checkbox.checked = isSelected;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedScreens.set(sKey, {
            screenKey: sKey,
            screenLabel: screen.label,
            idleContent: { ...DEFAULT_IDLE_CONTENT },
          });
        } else {
          this.selectedScreens.delete(sKey);
        }
        this.render();
      });

      const label = header.createEl('label', {
        text: `${screen.label}`,
      });
      label.addEventListener('click', () => { checkbox.click(); });

      header.createSpan({
        cls: 'screen-card-detail',
        text: `${screen.width}×${screen.height}${screen.isPrimary ? ' (Primary)' : ''}`,
      });

      // Idle content config (only when selected)
      if (isSelected) {
        const cfg = this.selectedScreens.get(sKey)!;
        this.renderIdleConfig(card, sKey, cfg);
      }
    }

    // Action buttons
    const actions = new Setting(container);

    actions.addButton((btn) =>
      btn.setButtonText('💾 Save Config').onClick(async () => {
        await this.saveConfig();
        new Notice('Screen configuration saved');
      }),
    );

    actions.addButton((btn) =>
      btn.setButtonText('▶ Start Session')
        .setCta()
        .onClick(async () => {
          await this.saveConfig();
          const spm = this.plugin.sessionProjectionManager;
          if (!spm) return;
          await spm.startSession(this.screens, Array.from(this.selectedScreens.values()));
          this.render();
        }),
    );
  }

  // ── Idle content configuration per screen ───────────────────────

  private renderIdleConfig(card: HTMLElement, sKey: string, cfg: ManagedScreenConfig): void {
    const section = card.createDiv({ cls: 'idle-config' });

    // Idle content type dropdown
    new Setting(section)
      .setName('Idle content')
      .addDropdown((dd) => {
        dd.addOption('black', 'Black screen');
        dd.addOption('color', 'Solid color');
        dd.addOption('image', 'Image / GIF');
        dd.addOption('video', 'Looping video');
        dd.setValue(cfg.idleContent.type);
        dd.onChange((val) => {
          cfg.idleContent = { ...cfg.idleContent, type: val as IdleContentType };
          // Re-render to show type-specific fields
          this.render();
        });
      });

    // Type-specific fields
    switch (cfg.idleContent.type) {
      case 'color':
        new Setting(section)
          .setName('Color')
          .addText((text) => {
            text
              .setPlaceholder('#1a1a2e')
              .setValue(cfg.idleContent.color || '')
              .onChange((val) => { cfg.idleContent.color = val; });
            text.inputEl.type = 'color';
            text.inputEl.style.width = '60px';
            text.inputEl.style.padding = '2px';
          });
        break;

      case 'image':
      case 'video':
        new Setting(section)
          .setName('Vault path')
          .setDesc(cfg.idleContent.type === 'image' ? 'Image or animated GIF' : 'Video file')
          .addText((text) => {
            text
              .setPlaceholder('Assets/idle-screen.mp4')
              .setValue(cfg.idleContent.filePath || '')
              .onChange((val) => { cfg.idleContent.filePath = val; });
          });

        if (cfg.idleContent.type === 'video') {
          new Setting(section)
            .setName('Loop')
            .addToggle((t) => {
              t.setValue(cfg.idleContent.loop !== false);
              t.onChange((val) => { cfg.idleContent.loop = val; });
            });
        }

        new Setting(section)
          .setName('Fit mode')
          .addDropdown((dd) => {
            dd.addOption('cover', 'Cover (fill, crop edges)');
            dd.addOption('contain', 'Contain (fit, letterbox)');
            dd.addOption('fill', 'Stretch to fill');
            dd.setValue(cfg.idleContent.objectFit || 'cover');
            dd.onChange((val) => {
              cfg.idleContent.objectFit = val as IdleContentConfig['objectFit'];
            });
          });
        break;
    }
  }

  // ── Persistence ─────────────────────────────────────────────────

  private async saveConfig(): Promise<void> {
    this.plugin.settings.sessionProjection.managedScreens =
      Array.from(this.selectedScreens.values());
    await this.plugin.saveSettings();
  }
}
