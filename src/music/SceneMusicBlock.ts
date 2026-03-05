/**
 * Scene Music Code Block – `dnd-music`
 *
 * Provides:
 *  1.  SceneMusicModal      – opened via the "Insert Scene Music" command to
 *                             let the GM pick a primary + ambient playlist/track.
 *  2.  renderSceneMusicBlock – registered as a Markdown code-block processor;
 *                             renders a compact card with a ▶ Play button.
 */
import { App, Modal, Setting, Notice, MarkdownPostProcessorContext, Editor, TFile, TFolder } from 'obsidian';
import { MusicPlayer } from './MusicPlayer';
import type { MusicSettings, Playlist, SceneMusicConfig, RepeatMode } from './types';
import { DEFAULT_SCENE_MUSIC_CONFIG } from './types';

// ─────────────────────────────────────────────────────────────────
//  SceneMusicModal – form to configure primary + ambient music
// ─────────────────────────────────────────────────────────────────

export class SceneMusicModal extends Modal {
  private settings: MusicSettings;
  private config: SceneMusicConfig;
  private onSubmit: (config: SceneMusicConfig) => void;

  constructor(
    app: App,
    settings: MusicSettings,
    existing: SceneMusicConfig | null,
    onSubmit: (config: SceneMusicConfig) => void
  ) {
    super(app);
    this.settings = settings;
    this.config = existing
      ? { ...existing }
      : { ...DEFAULT_SCENE_MUSIC_CONFIG };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass('scene-music-modal');
    this.titleEl.setText('🎵 Scene Music Configuration');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    const playlists = this.settings.playlists;

    // ── Primary layer ──────────────────────────────────────
    contentEl.createEl('h4', { text: '🎵 Primary Layer' });

    // Playlist dropdown
    new Setting(contentEl)
      .setName('Playlist')
      .setDesc('Select a playlist for the primary (melodic) layer')
      .addDropdown(dd => {
        dd.addOption('', '— None —');
        for (const pl of playlists) {
          dd.addOption(pl.id, `${pl.name} (${pl.mood})`);
        }
        dd.setValue(this.config.primaryPlaylistId || '');
        dd.onChange(val => {
          this.config.primaryPlaylistId = val || null;
          // Reset track when playlist changes
          this.config.primaryTrackPath = null;
          this.render();
        });
      });

    // Track dropdown (only if a playlist is selected)
    if (this.config.primaryPlaylistId) {
      const pl = playlists.find(p => p.id === this.config.primaryPlaylistId);
      if (pl && pl.trackPaths.length > 0) {
        new Setting(contentEl)
          .setName('Starting Track')
          .setDesc('Optional: pick a specific track to start on')
          .addDropdown(dd => {
            dd.addOption('', '— Default (first / shuffle) —');
            for (const tp of pl.trackPaths) {
              const label = tp.split('/').pop() || tp;
              dd.addOption(tp, label);
            }
            dd.setValue(this.config.primaryTrackPath || '');
            dd.onChange(val => {
              this.config.primaryTrackPath = val || null;
            });
          });
      }
    }

    // ── Ambient layer ──────────────────────────────────────
    contentEl.createEl('h4', { text: '🌊 Ambient Layer' });

    const ambientPlaylists = playlists.filter(p => p.isBackgroundSound);
    new Setting(contentEl)
      .setName('Playlist')
      .setDesc('Select a playlist for the ambient (background) layer')
      .addDropdown(dd => {
        dd.addOption('', '— None —');
        for (const pl of ambientPlaylists) {
          dd.addOption(pl.id, `${pl.name} (${pl.mood})`);
        }
        dd.setValue(this.config.ambientPlaylistId || '');
        dd.onChange(val => {
          this.config.ambientPlaylistId = val || null;
          this.config.ambientTrackPath = null;
          this.render();
        });
      });

    if (this.config.ambientPlaylistId) {
      const pl = playlists.find(p => p.id === this.config.ambientPlaylistId);
      if (pl && pl.trackPaths.length > 0) {
        new Setting(contentEl)
          .setName('Starting Track')
          .setDesc('Optional: pick a specific track to start on')
          .addDropdown(dd => {
            dd.addOption('', '— Default (first / shuffle) —');
            for (const tp of pl.trackPaths) {
              const label = tp.split('/').pop() || tp;
              dd.addOption(tp, label);
            }
            dd.setValue(this.config.ambientTrackPath || '');
            dd.onChange(val => {
              this.config.ambientTrackPath = val || null;
            });
          });
      }
    }

    // ── Playback behaviour ─────────────────────────────────
    contentEl.createEl('h4', { text: '🔁 Playback' });

    const repeatLabels: { [K in RepeatMode]: string } = {
      'playlist': '🔁 Repeat Playlist',
      'track': '🔂 Repeat Track',
      'none': '▶️ No Repeat',
    };

    // Primary repeat mode
    new Setting(contentEl)
      .setName('Primary Repeat')
      .setDesc('How the primary playlist repeats')
      .addDropdown(dd => {
        dd.addOption('playlist', repeatLabels['playlist']);
        dd.addOption('track', repeatLabels['track']);
        dd.addOption('none', repeatLabels['none']);
        dd.setValue(this.config.primaryRepeatMode ?? 'playlist');
        dd.onChange(val => {
          this.config.primaryRepeatMode = val as RepeatMode;
        });
      });

    // Primary shuffle
    new Setting(contentEl)
      .setName('Primary Shuffle')
      .setDesc('Shuffle the track order in the primary playlist')
      .addToggle(t => {
        t.setValue(this.config.primaryShuffle ?? false);
        t.onChange(val => { this.config.primaryShuffle = val; });
      });

    // Ambient repeat mode
    new Setting(contentEl)
      .setName('Ambient Repeat')
      .setDesc('How the ambient playlist repeats')
      .addDropdown(dd => {
        dd.addOption('playlist', repeatLabels['playlist']);
        dd.addOption('track', repeatLabels['track']);
        dd.addOption('none', repeatLabels['none']);
        dd.setValue(this.config.ambientRepeatMode ?? 'playlist');
        dd.onChange(val => {
          this.config.ambientRepeatMode = val as RepeatMode;
        });
      });

    // Ambient shuffle
    new Setting(contentEl)
      .setName('Ambient Shuffle')
      .setDesc('Shuffle the track order in the ambient playlist')
      .addToggle(t => {
        t.setValue(this.config.ambientShuffle ?? false);
        t.onChange(val => { this.config.ambientShuffle = val; });
      });

    // ── Volume controls ───────────────────────────────────
    contentEl.createEl('h4', { text: '🔊 Volume' });

    // Primary layer volume
    const primaryVolVal = this.config.primaryVolume ?? this.settings.defaultVolume ?? 70;
    const primaryVolSetting = new Setting(contentEl)
      .setName('Primary Volume')
      .setDesc(`Volume for the primary (melodic) layer: ${primaryVolVal}%`);
    primaryVolSetting.addSlider(slider => {
      slider.setLimits(0, 100, 1);
      slider.setValue(primaryVolVal);
      slider.setDynamicTooltip();
      slider.onChange(val => {
        this.config.primaryVolume = val;
        primaryVolSetting.setDesc(`Volume for the primary (melodic) layer: ${val}%`);
      });
    });

    // Ambient layer volume
    const ambientVolVal = this.config.ambientVolume ?? this.settings.ambientVolume ?? 50;
    const ambientVolSetting = new Setting(contentEl)
      .setName('Ambient Volume')
      .setDesc(`Volume for the ambient (background) layer: ${ambientVolVal}%`);
    ambientVolSetting.addSlider(slider => {
      slider.setLimits(0, 100, 1);
      slider.setValue(ambientVolVal);
      slider.setDynamicTooltip();
      slider.onChange(val => {
        this.config.ambientVolume = val;
        ambientVolSetting.setDesc(`Volume for the ambient (background) layer: ${val}%`);
      });
    });

    // ── Options ────────────────────────────────────────────
    contentEl.createEl('h4', { text: '⚙️ Options' });

    new Setting(contentEl)
      .setName('Auto-play')
      .setDesc('Automatically start playback when the Play button is pressed')
      .addToggle(t => {
        t.setValue(this.config.autoPlay);
        t.onChange(val => { this.config.autoPlay = val; });
      });

    // ── Actions ────────────────────────────────────────────
    const actions = contentEl.createEl('div', { cls: 'scene-music-actions' });

    const insertBtn = actions.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.addEventListener('click', () => {
      this.onSubmit(this.config);
      this.close();
    });

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }
}

// ─────────────────────────────────────────────────────────────────
//  Code-block renderer  –  ```dnd-music
// ─────────────────────────────────────────────────────────────────

/**
 * Render function registered via `registerMarkdownCodeBlockProcessor('dnd-music', …)`.
 *
 * The code-block body is a JSON-encoded SceneMusicConfig.
 */
export function renderSceneMusicBlock(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  musicPlayer: MusicPlayer,
  settings: MusicSettings,
  onPlayTriggered?: () => void,
  app?: App
) {
  // ── Parse config ────────────────────────────────────────
  let config: SceneMusicConfig;
  try {
    config = JSON.parse(source.trim());
  } catch {
    el.createEl('div', {
      text: '⚠️ Invalid scene music configuration',
      cls: 'scene-music-block-error',
    });
    return;
  }

  const container = el.createEl('div', { cls: 'scene-music-block' });

  // ── Header ──────────────────────────────────────────────
  const header = container.createEl('div', { cls: 'scene-music-block-header' });
  header.createEl('span', { text: '🎵 Scene Music', cls: 'scene-music-block-title' });

  // Edit button – reopens the SceneMusicModal and writes the updated
  // config back into the code block.
  if (app) {
    const editBtn = header.createEl('button', {
      text: '✏️',
      cls: 'scene-music-edit-btn',
      attr: { 'aria-label': 'Edit scene music' },
    });
    editBtn.addEventListener('click', () => {
      new SceneMusicModal(app, settings, config, async (updated) => {
        const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;
        const content = await app.vault.read(file);
        const oldBlock = '```dnd-music\n' + source.trim() + '\n```';
        const newBlock = buildSceneMusicCodeblock(updated);
        if (content.includes(oldBlock)) {
          await app.vault.modify(file, content.replace(oldBlock, newBlock));
          new Notice('Scene music block updated');
        } else {
          new Notice('Could not locate code block to update');
        }
      }).open();
    });
  }

  // ── Summary rows ────────────────────────────────────────
  const body = container.createEl('div', { cls: 'scene-music-block-body' });

  // Primary
  const primaryRow = body.createEl('div', { cls: 'scene-music-row' });
  primaryRow.createEl('span', { text: '🎵 Primary:', cls: 'scene-music-label' });
  if (config.primaryPlaylistId) {
    const pl = settings.playlists.find(p => p.id === config.primaryPlaylistId);
    const plName = pl ? pl.name : '(unknown playlist)';
    let detail = plName;
    if (config.primaryTrackPath) {
      const trackName = config.primaryTrackPath.split('/').pop() || config.primaryTrackPath;
      detail += ` → ${trackName}`;
    }
    primaryRow.createEl('span', { text: detail, cls: 'scene-music-value' });
    const primaryBadges: string[] = [];
    if (config.primaryVolume != null) primaryBadges.push(`🔊 ${config.primaryVolume}%`);
    if (config.primaryRepeatMode && config.primaryRepeatMode !== 'playlist') {
      primaryBadges.push(config.primaryRepeatMode === 'track' ? '🔂 track' : '▶️ once');
    }
    if (config.primaryShuffle) primaryBadges.push('🔀');
    if (primaryBadges.length > 0) {
      primaryRow.createEl('span', { text: primaryBadges.join(' · '), cls: 'scene-music-volume-badge' });
    }
  } else {
    primaryRow.createEl('span', { text: 'None', cls: 'scene-music-value scene-music-none' });
  }

  // Ambient
  const ambientRow = body.createEl('div', { cls: 'scene-music-row' });
  ambientRow.createEl('span', { text: '🌊 Ambient:', cls: 'scene-music-label' });
  if (config.ambientPlaylistId) {
    const pl = settings.playlists.find(p => p.id === config.ambientPlaylistId);
    const plName = pl ? pl.name : '(unknown playlist)';
    let detail = plName;
    if (config.ambientTrackPath) {
      const trackName = config.ambientTrackPath.split('/').pop() || config.ambientTrackPath;
      detail += ` → ${trackName}`;
    }
    ambientRow.createEl('span', { text: detail, cls: 'scene-music-value' });
    const ambientBadges: string[] = [];
    if (config.ambientVolume != null) ambientBadges.push(`🔊 ${config.ambientVolume}%`);
    if (config.ambientRepeatMode && config.ambientRepeatMode !== 'playlist') {
      ambientBadges.push(config.ambientRepeatMode === 'track' ? '🔂 track' : '▶️ once');
    }
    if (config.ambientShuffle) ambientBadges.push('🔀');
    if (ambientBadges.length > 0) {
      ambientRow.createEl('span', { text: ambientBadges.join(' · '), cls: 'scene-music-volume-badge' });
    }
  } else {
    ambientRow.createEl('span', { text: 'None', cls: 'scene-music-value scene-music-none' });
  }

  // ── Play / Stop button ──────────────────────────────────
  const controls = container.createEl('div', { cls: 'scene-music-block-controls' });

  /** Sync button appearance with the actual player state. */
  const syncButton = () => {
    const active = musicPlayer.isScenePlaying(config);
    if (active) {
      playBtn.textContent = '⏹ Stop';
      playBtn.classList.remove('mod-cta');
      playBtn.classList.add('mod-warning');
      playBtn.classList.add('scene-music-playing');
    } else {
      playBtn.textContent = '▶ Load & Play';
      playBtn.classList.add('mod-cta');
      playBtn.classList.remove('mod-warning');
      playBtn.classList.remove('scene-music-playing');
    }
  };

  const playBtn = controls.createEl('button', {
    text: '▶ Load & Play',
    cls: 'scene-music-play-btn mod-cta',
  });

  playBtn.addEventListener('click', () => {
    // Ignore clicks while a stop is fading out
    if (musicPlayer.isStopping()) return;

    if (musicPlayer.isScenePlaying(config)) {
      // This scene is active → stop everything
      musicPlayer.stopAll();
    } else {
      // Ensure the music player leaf is open before loading
      if (onPlayTriggered) onPlayTriggered();
      // Load & play this scene (stops any previous scene first)
      musicPlayer.loadSceneMusic(config, config.autoPlay);
      new Notice('🎵 Scene music loaded' + (config.autoPlay ? ' & playing' : ''));
    }
    // Button state will be updated by the scene-change listener
  });

  // Listen for scene changes (another block started / stopped) so the
  // button always reflects reality.  Unsubscribe when the element is
  // removed from the DOM.
  const unsubscribe = musicPlayer.onSceneChange(() => syncButton());

  // Initial sync in case this scene is already playing
  syncButton();

  // Clean up listener when the code-block element is detached
  const observer = new MutationObserver(() => {
    if (!el.isConnected) {
      unsubscribe();
      observer.disconnect();
    }
  });
  observer.observe(el.parentElement || document.body, { childList: true, subtree: true });

  // Auto-play indicator
  if (config.autoPlay) {
    controls.createEl('span', {
      text: '⚡ auto-play',
      cls: 'scene-music-autoplay-badge',
    });
  }
}

// ─────────────────────────────────────────────────────────────────
//  Helper – build code-block string for insertion into the editor
// ─────────────────────────────────────────────────────────────────

export function buildSceneMusicCodeblock(config: SceneMusicConfig): string {
  return '```dnd-music\n' + JSON.stringify(config, null, 2) + '\n```';
}
