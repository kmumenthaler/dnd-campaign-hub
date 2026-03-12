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
import type { IdleContentConfig, IdleContentType, ManagedScreenConfig, ProjectionProfile } from './types';
import { DEFAULT_IDLE_CONTENT } from './types';
import { MediaPickerModal, type MediaPickerFilter } from './MediaPickerModal';

export class SessionProjectionHubModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private screens: ScreenInfo[] = [];

  /** Configs being edited, keyed by screenKey. */
  private selectedScreens: Map<string, ManagedScreenConfig> = new Map();

  /** Currently active profile ID (null = ad-hoc). */
  private activeProfileId: string | null = null;

  constructor(plugin: DndCampaignHubPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('dnd-session-projection-modal');

    // Load saved config
    const sp = this.plugin.settings.sessionProjection;
    this.activeProfileId = sp.activeProfileId;
    for (const cfg of sp.managedScreens) {
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
    this.renderProfileBar(container);

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

  // ── Profile management ──────────────────────────────────────────

  private renderProfileBar(container: HTMLElement): void {
    const profiles = this.plugin.settings.sessionProjection.profiles ?? [];

    const bar = container.createDiv({ cls: 'profile-bar' });

    // Dropdown
    new Setting(bar)
      .setName('Profile')
      .addDropdown((dd) => {
        dd.addOption('', '— None —');
        for (const p of profiles) {
          dd.addOption(p.id, p.name);
        }
        dd.setValue(this.activeProfileId ?? '');
        dd.onChange((id) => {
          if (id) {
            this.loadProfile(id);
          } else {
            this.activeProfileId = null;
          }
          this.render();
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon('save').setTooltip('Save to profile').onClick(async () => {
          if (!this.activeProfileId) {
            this.promptSaveAs();
            return;
          }
          this.saveToProfile(this.activeProfileId);
          await this.saveConfig();
          new Notice('Profile saved');
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon('plus').setTooltip('Save as new profile').onClick(() => {
          this.promptSaveAs();
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon('pencil').setTooltip('Rename profile').onClick(() => {
          if (!this.activeProfileId) {
            new Notice('No profile selected');
            return;
          }
          const profile = profiles.find((p) => p.id === this.activeProfileId);
          if (profile) this.promptRename(profile);
        });
      })
      .addExtraButton((btn) => {
        btn.setIcon('trash').setTooltip('Delete profile').onClick(async () => {
          if (!this.activeProfileId) {
            new Notice('No profile selected');
            return;
          }
          await this.deleteProfile(this.activeProfileId);
          this.render();
        });
      });
  }

  /** Populate selectedScreens from a saved profile. */
  private loadProfile(profileId: string): void {
    const profiles = this.plugin.settings.sessionProjection.profiles ?? [];
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    this.activeProfileId = profile.id;
    this.selectedScreens.clear();
    for (const cfg of profile.screens) {
      this.selectedScreens.set(cfg.screenKey, { ...cfg, idleContent: { ...cfg.idleContent } });
    }
  }

  /** Write current selectedScreens into an existing profile. */
  private saveToProfile(profileId: string): void {
    const sp = this.plugin.settings.sessionProjection;
    const profile = (sp.profiles ?? []).find((p) => p.id === profileId);
    if (!profile) return;
    profile.screens = Array.from(this.selectedScreens.values()).map((c) => ({
      ...c, idleContent: { ...c.idleContent },
    }));
  }

  /** Prompt user for a name, then create a new profile from current config. */
  private promptSaveAs(): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText('Save Profile As');
    let name = '';
    new Setting(modal.contentEl)
      .setName('Profile name')
      .addText((text) => {
        text.setPlaceholder('e.g. Main Campaign').onChange((v) => { name = v; });
        // Auto-focus
        setTimeout(() => text.inputEl.focus(), 50);
      });
    new Setting(modal.contentEl)
      .addButton((btn) => {
        btn.setButtonText('Save').setCta().onClick(async () => {
          const trimmed = name.trim();
          if (!trimmed) { new Notice('Please enter a name'); return; }
          const id = Date.now().toString(36);
          const newProfile: ProjectionProfile = {
            id,
            name: trimmed,
            screens: Array.from(this.selectedScreens.values()).map((c) => ({
              ...c, idleContent: { ...c.idleContent },
            })),
          };
          const sp = this.plugin.settings.sessionProjection;
          if (!sp.profiles) sp.profiles = [];
          sp.profiles.push(newProfile);
          this.activeProfileId = id;
          await this.saveConfig();
          modal.close();
          new Notice(`Profile "${trimmed}" created`);
          this.render();
        });
      });
    modal.open();
  }

  /** Prompt user to rename an existing profile. */
  private promptRename(profile: ProjectionProfile): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText('Rename Profile');
    let name = profile.name;
    new Setting(modal.contentEl)
      .setName('Profile name')
      .addText((text) => {
        text.setValue(name).onChange((v) => { name = v; });
        setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);
      });
    new Setting(modal.contentEl)
      .addButton((btn) => {
        btn.setButtonText('Rename').setCta().onClick(async () => {
          const trimmed = name.trim();
          if (!trimmed) { new Notice('Please enter a name'); return; }
          profile.name = trimmed;
          await this.saveConfig();
          modal.close();
          new Notice(`Profile renamed to "${trimmed}"`);
          this.render();
        });
      });
    modal.open();
  }

  /** Delete a profile by ID. */
  private async deleteProfile(profileId: string): Promise<void> {
    const sp = this.plugin.settings.sessionProjection;
    sp.profiles = (sp.profiles ?? []).filter((p) => p.id !== profileId);
    if (this.activeProfileId === profileId) {
      this.activeProfileId = null;
    }
    await this.saveConfig();
    new Notice('Profile deleted');
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
      case 'video': {
        const mediaFilter: MediaPickerFilter = cfg.idleContent.type === 'video' ? 'video' : 'image';
        const mediaLabel = cfg.idleContent.type === 'image' ? 'Image / GIF' : 'Video file';

        // File path display + browse button
        const fileSetting = new Setting(section).setName(mediaLabel);

        // Show current path as description if set
        if (cfg.idleContent.filePath) {
          fileSetting.setDesc(cfg.idleContent.filePath);
        }

        fileSetting.addButton((btn) => {
          btn.setButtonText('🔍 Browse Vault').onClick(() => {
            new MediaPickerModal(this.app, (vaultPath) => {
              cfg.idleContent.filePath = vaultPath;
              this.render();
            }, mediaFilter).open();
          });
        });

        // Thumbnail preview of selected file
        if (cfg.idleContent.filePath) {
          const previewContainer = section.createDiv({ cls: 'idle-config-preview' });
          const resourcePath = this.app.vault.adapter.getResourcePath(cfg.idleContent.filePath);

          if (cfg.idleContent.type === 'video') {
            const video = previewContainer.createEl('video', {
              cls: 'idle-config-preview-media',
              attr: { src: resourcePath, muted: 'true', preload: 'metadata' },
            });
            video.addEventListener('loadeddata', () => { video.currentTime = 0.1; });
          } else {
            previewContainer.createEl('img', {
              cls: 'idle-config-preview-media',
              attr: { src: resourcePath },
            });
          }

          // Clear button
          const clearBtn = previewContainer.createEl('button', {
            cls: 'idle-config-preview-clear',
            text: '✕ Remove',
          });
          clearBtn.addEventListener('click', () => {
            cfg.idleContent.filePath = undefined;
            this.render();
          });
        }

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
  }

  // ── Persistence ─────────────────────────────────────────────────

  private async saveConfig(): Promise<void> {
    const sp = this.plugin.settings.sessionProjection;
    sp.managedScreens = Array.from(this.selectedScreens.values());
    sp.activeProfileId = this.activeProfileId;
    await this.plugin.saveSettings();
  }
}
