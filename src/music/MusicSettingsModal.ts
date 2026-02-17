/**
 * Music Settings Modal - Configure playlists, soundboard, and scene integration.
 */
import { App, Modal, Notice, Setting, TFile, TFolder } from 'obsidian';
import type { MusicSettings, Playlist, SoundEffect } from './types';
import { AUDIO_EXTENSIONS, DEFAULT_SOUNDBOARD_ICONS, isAudioExtension } from './types';

/** Generate a short unique ID */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Modal for configuring music settings: playlists, soundboard slots, and scene mapping.
 */
export class MusicSettingsModal extends Modal {
  private settings: MusicSettings;
  private onSave: (settings: MusicSettings) => void;
  private activeTab: 'playlists' | 'soundboard' | 'general' = 'playlists';

  constructor(app: App, settings: MusicSettings, onSave: (settings: MusicSettings) => void) {
    super(app);
    // Deep clone so edits can be discarded on cancel
    this.settings = JSON.parse(JSON.stringify(settings));
    this.onSave = onSave;
  }

  onOpen() {
    this.modalEl.addClass('music-settings-modal');
    this.titleEl.setText('🎵 Music Settings');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  // ─── Render ───────────────────────────────────────────────

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    // Tab bar
    const tabBar = contentEl.createEl('div', { cls: 'music-settings-tabs' });
    const tabs: Array<{ id: 'playlists' | 'soundboard' | 'general'; label: string }> = [
      { id: 'playlists', label: '🎶 Playlists' },
      { id: 'soundboard', label: '🔊 Soundboard' },
      { id: 'general', label: '⚙️ General' },
    ];
    for (const tab of tabs) {
      const btn = tabBar.createEl('button', {
        text: tab.label,
        cls: `music-tab-btn ${this.activeTab === tab.id ? 'active' : ''}`,
      });
      btn.addEventListener('click', () => {
        this.activeTab = tab.id;
        this.render();
      });
    }

    // Tab content
    const body = contentEl.createEl('div', { cls: 'music-settings-body' });
    switch (this.activeTab) {
      case 'playlists':
        this.renderPlaylistsTab(body);
        break;
      case 'soundboard':
        this.renderSoundboardTab(body);
        break;
      case 'general':
        this.renderGeneralTab(body);
        break;
    }

    // Save / Cancel
    const footer = contentEl.createEl('div', { cls: 'music-settings-footer' });
    const saveBtn = footer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => {
      this.onSave(this.settings);
      this.close();
    });
    const cancelBtn = footer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  // ─── Playlists Tab ────────────────────────────────────────

  private renderPlaylistsTab(container: HTMLElement) {
    const addBtn = container.createEl('button', { text: '+ New Playlist', cls: 'mod-cta music-add-btn' });
    addBtn.addEventListener('click', () => {
      this.settings.playlists.push({
        id: uid(),
        name: 'New Playlist',
        mood: 'ambient',
        trackPaths: [],
      });
      this.render();
    });

    if (this.settings.playlists.length === 0) {
      container.createEl('p', { text: 'No playlists configured. Add one to get started!', cls: 'empty-message' });
      return;
    }

    for (const playlist of this.settings.playlists) {
      this.renderPlaylistCard(container, playlist);
    }
  }

  private renderPlaylistCard(container: HTMLElement, playlist: Playlist) {
    const card = container.createEl('div', { cls: 'music-playlist-card' });

    // Header row with name + mood + delete
    const header = card.createEl('div', { cls: 'music-playlist-header' });

    // Name input
    const nameInput = header.createEl('input', { type: 'text', cls: 'music-playlist-name-input' });
    nameInput.value = playlist.name;
    nameInput.placeholder = 'Playlist name';
    nameInput.addEventListener('change', () => {
      playlist.name = nameInput.value.trim() || 'Untitled';
    });

    // Mood tag
    const moodSelect = header.createEl('select', { cls: 'music-mood-select' });
    const moods = ['ambient', 'combat', 'exploration', 'mysterious', 'epic', 'tavern', 'horror', 'calm', 'dramatic', 'custom'];
    for (const mood of moods) {
      const opt = moodSelect.createEl('option', { text: mood, value: mood });
      if (playlist.mood === mood) opt.selected = true;
    }
    moodSelect.addEventListener('change', () => {
      playlist.mood = moodSelect.value;
    });

    // Delete playlist button
    const delBtn = header.createEl('button', { text: '🗑️', cls: 'music-delete-btn', attr: { 'aria-label': 'Delete playlist' } });
    delBtn.addEventListener('click', () => {
      this.settings.playlists = this.settings.playlists.filter(p => p.id !== playlist.id);
      this.render();
    });

    // Track list
    const trackList = card.createEl('div', { cls: 'music-track-list' });
    if (playlist.trackPaths.length === 0) {
      trackList.createEl('p', { text: 'No tracks added yet.', cls: 'empty-message' });
    } else {
      for (let i = 0; i < playlist.trackPaths.length; i++) {
        const trackRow = trackList.createEl('div', { cls: 'music-track-row' });
        const trackPath = playlist.trackPaths[i] ?? '';
        const label = trackPath.split('/').pop() ?? trackPath;
        trackRow.createEl('span', { text: `${i + 1}. ${label}`, cls: 'music-track-label' });

        // Move up
        if (i > 0) {
          const upBtn = trackRow.createEl('button', { text: '▲', cls: 'music-track-btn' });
          upBtn.addEventListener('click', () => {
            const tmp = playlist.trackPaths[i - 1]!;
            playlist.trackPaths[i - 1] = playlist.trackPaths[i]!;
            playlist.trackPaths[i] = tmp;
            this.render();
          });
        }
        // Move down
        if (i < playlist.trackPaths.length - 1) {
          const downBtn = trackRow.createEl('button', { text: '▼', cls: 'music-track-btn' });
          downBtn.addEventListener('click', () => {
            const tmp = playlist.trackPaths[i]!;
            playlist.trackPaths[i] = playlist.trackPaths[i + 1]!;
            playlist.trackPaths[i + 1] = tmp;
            this.render();
          });
        }
        // Remove
        const removeBtn = trackRow.createEl('button', { text: '✕', cls: 'music-track-btn music-track-remove' });
        removeBtn.addEventListener('click', () => {
          playlist.trackPaths.splice(i, 1);
          this.render();
        });
      }
    }

    // Add tracks button (picks from vault audio files)
    const addTrackBtn = card.createEl('button', { text: '+ Add Tracks', cls: 'music-add-track-btn' });
    addTrackBtn.addEventListener('click', () => {
      new AudioFilePickerModal(this.app, this.settings.audioFolderPath, (paths) => {
        for (const p of paths) {
          if (!playlist.trackPaths.includes(p)) {
            playlist.trackPaths.push(p);
          }
        }
        this.render();
      }).open();
    });
  }

  // ─── Soundboard Tab ───────────────────────────────────────

  private renderSoundboardTab(container: HTMLElement) {
    const addBtn = container.createEl('button', { text: '+ New Sound Effect', cls: 'mod-cta music-add-btn' });
    addBtn.addEventListener('click', () => {
      this.settings.soundEffects.push({
        id: uid(),
        name: 'New SFX',
        filePath: '',
        icon: '🔔',
        volume: undefined,
      });
      this.render();
    });

    if (this.settings.soundEffects.length === 0) {
      container.createEl('p', { text: 'No sound effects configured.', cls: 'empty-message' });

      // Offer preset icons
      const presetBtn = container.createEl('button', { text: '🎁 Load Preset Names', cls: 'music-add-btn' });
      presetBtn.addEventListener('click', () => {
        for (const [name, icon] of Object.entries(DEFAULT_SOUNDBOARD_ICONS)) {
          this.settings.soundEffects.push({
            id: uid(),
            name,
            filePath: '',
            icon,
          });
        }
        this.render();
      });
      return;
    }

    const grid = container.createEl('div', { cls: 'music-sfx-grid' });
    for (const sfx of this.settings.soundEffects) {
      this.renderSfxCard(grid, sfx);
    }
  }

  private renderSfxCard(container: HTMLElement, sfx: SoundEffect) {
    const card = container.createEl('div', { cls: 'music-sfx-card' });

    // Icon input (emoji)
    const iconInput = card.createEl('input', { type: 'text', cls: 'music-sfx-icon-input' });
    iconInput.value = sfx.icon;
    iconInput.maxLength = 4;
    iconInput.addEventListener('change', () => {
      sfx.icon = iconInput.value || '🔔';
    });

    // Name input
    const nameInput = card.createEl('input', { type: 'text', cls: 'music-sfx-name-input' });
    nameInput.value = sfx.name;
    nameInput.placeholder = 'SFX name';
    nameInput.addEventListener('change', () => {
      sfx.name = nameInput.value.trim() || 'Untitled';
    });

    // File path display + pick button
    const fileRow = card.createEl('div', { cls: 'music-sfx-file-row' });
    const fileLabel = fileRow.createEl('span', {
      text: sfx.filePath ? sfx.filePath.split('/').pop() ?? sfx.filePath : 'No file',
      cls: `music-sfx-file-label ${sfx.filePath ? '' : 'empty-message'}`,
    });
    const pickFileBtn = fileRow.createEl('button', { text: '📂', cls: 'music-track-btn', attr: { 'aria-label': 'Choose audio file' } });
    pickFileBtn.addEventListener('click', () => {
      new AudioFilePickerModal(this.app, this.settings.audioFolderPath, (paths) => {
        if (paths.length > 0) {
          sfx.filePath = paths[0] ?? '';
          this.render();
        }
      }, true).open();
    });

    // Volume override
    const volRow = card.createEl('div', { cls: 'music-sfx-vol-row' });
    volRow.createEl('span', { text: 'Vol:', cls: 'music-sfx-vol-label' });
    const volInput = volRow.createEl('input', { type: 'range', cls: 'music-sfx-vol-slider' });
    volInput.min = '0';
    volInput.max = '100';
    volInput.value = String(sfx.volume ?? this.settings.defaultVolume);
    const volDisplay = volRow.createEl('span', { text: `${volInput.value}%`, cls: 'music-sfx-vol-display' });
    volInput.addEventListener('input', () => {
      const v = parseInt(volInput.value);
      sfx.volume = v;
      volDisplay.textContent = `${v}%`;
    });

    // Delete button
    const delBtn = card.createEl('button', { text: '🗑️', cls: 'music-delete-btn', attr: { 'aria-label': 'Delete SFX' } });
    delBtn.addEventListener('click', () => {
      this.settings.soundEffects = this.settings.soundEffects.filter(s => s.id !== sfx.id);
      this.render();
    });
  }

  // ─── General Tab ──────────────────────────────────────────

  private renderGeneralTab(container: HTMLElement) {
    // Audio folder path
    new Setting(container)
      .setName('Audio Folder')
      .setDesc('Vault folder containing your music/sfx files')
      .addText(text => {
        text.setPlaceholder('e.g. Assets/Music')
          .setValue(this.settings.audioFolderPath)
          .onChange(val => { this.settings.audioFolderPath = val.trim(); });
      });

    // Default volume
    new Setting(container)
      .setName('Default Volume')
      .setDesc('Master volume (0–100)')
      .addSlider(slider => {
        slider.setLimits(0, 100, 1)
          .setValue(this.settings.defaultVolume)
          .setDynamicTooltip()
          .onChange(val => { this.settings.defaultVolume = val; });
      });

    // Ambient layer volume
    new Setting(container)
      .setName('Ambient Layer Volume')
      .setDesc('Default volume for the ambient layer (0–100)')
      .addSlider(slider => {
        slider.setLimits(0, 100, 1)
          .setValue(this.settings.ambientVolume)
          .setDynamicTooltip()
          .onChange(val => { this.settings.ambientVolume = val; });
      });

    // Crossfade duration
    new Setting(container)
      .setName('Crossfade Duration')
      .setDesc('Crossfade in ms when switching playlists (0 to disable)')
      .addText(text => {
        text.setPlaceholder('2000')
          .setValue(String(this.settings.crossfadeDurationMs))
          .onChange(val => {
            const n = parseInt(val);
            if (!isNaN(n) && n >= 0) this.settings.crossfadeDurationMs = n;
          });
      });

    // Fade in/out duration
    new Setting(container)
      .setName('Fade In / Out Duration')
      .setDesc('Smooth volume fade when playing, pausing, or stopping (in ms, 0 = instant)')
      .addText(text => {
        text.setPlaceholder('500')
          .setValue(String(this.settings.fadeDurationMs ?? 0))
          .onChange(val => {
            const n = parseInt(val);
            if (!isNaN(n) && n >= 0) this.settings.fadeDurationMs = n;
          });
      });

    // Auto-play on scene change
    new Setting(container)
      .setName('Auto-play on Scene Change')
      .setDesc('Automatically start music when a scene is opened or changed')
      .addToggle(toggle => {
        toggle.setValue(this.settings.autoPlayOnSceneChange)
          .onChange(val => { this.settings.autoPlayOnSceneChange = val; });
      });

    // Scene type → mood mapping
    container.createEl('h4', { text: 'Scene Type → Mood Mapping' });
    container.createEl('p', { text: 'Map scene types to playlist moods for auto-play.', cls: 'setting-item-description' });

    const sceneTypes = ['combat', 'social', 'exploration', 'puzzle', 'montage'];
    const availableMoods = ['ambient', 'combat', 'exploration', 'mysterious', 'epic', 'tavern', 'horror', 'calm', 'dramatic'];

    for (const sceneType of sceneTypes) {
      new Setting(container)
        .setName(sceneType.charAt(0).toUpperCase() + sceneType.slice(1))
        .addDropdown(dd => {
          for (const mood of availableMoods) {
            dd.addOption(mood, mood);
          }
          dd.setValue(this.settings.sceneTypeMoodMap[sceneType] || 'ambient');
          dd.onChange(val => { this.settings.sceneTypeMoodMap[sceneType] = val; });
        });
    }
  }
}

// ─── Audio File Picker Modal ──────────────────────────────

/**
 * Lists audio files from the vault (optionally restricted to audioFolderPath)
 * and lets the user select one or more.
 */
class AudioFilePickerModal extends Modal {
  private audioFolderPath: string;
  private onPick: (paths: string[]) => void;
  private singleSelect: boolean;
  private selected: Set<string> = new Set();
  private filterText = '';

  constructor(app: App, audioFolderPath: string, onPick: (paths: string[]) => void, singleSelect = false) {
    super(app);
    this.audioFolderPath = audioFolderPath;
    this.onPick = onPick;
    this.singleSelect = singleSelect;
  }

  onOpen() {
    this.modalEl.addClass('audio-file-picker-modal');
    this.titleEl.setText('🎵 Select Audio Files');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    // Search filter
    const filterInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Filter files...',
      cls: 'audio-picker-filter',
    });
    filterInput.value = this.filterText;
    filterInput.addEventListener('input', () => {
      this.filterText = filterInput.value;
      this.renderList(listContainer);
    });

    const listContainer = contentEl.createEl('div', { cls: 'audio-picker-list' });
    this.renderList(listContainer);

    // Confirm button
    if (!this.singleSelect) {
      const confirmBtn = contentEl.createEl('button', { text: `Add ${this.selected.size} track(s)`, cls: 'mod-cta audio-picker-confirm' });
      confirmBtn.addEventListener('click', () => {
        this.onPick(Array.from(this.selected));
        this.close();
      });
    }

    filterInput.focus();
  }

  private renderList(container: HTMLElement) {
    container.empty();

    const audioFiles = this.getAudioFiles();
    const filtered = this.filterText
      ? audioFiles.filter(f => f.path.toLowerCase().includes(this.filterText.toLowerCase()))
      : audioFiles;

    if (filtered.length === 0) {
      container.createEl('p', { text: 'No audio files found.', cls: 'empty-message' });
      if (!this.audioFolderPath) {
        container.createEl('p', { text: 'Tip: Set an Audio Folder in General settings to narrow results.', cls: 'empty-message' });
      }
      return;
    }

    for (const file of filtered) {
      const row = container.createEl('div', {
        cls: `audio-picker-row ${this.selected.has(file.path) ? 'selected' : ''}`,
      });
      
      if (!this.singleSelect) {
        const checkbox = row.createEl('input', { type: 'checkbox' });
        checkbox.checked = this.selected.has(file.path);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            this.selected.add(file.path);
          } else {
            this.selected.delete(file.path);
          }
        });
      }

      const label = row.createEl('span', { text: file.name, cls: 'audio-picker-name' });
      const pathLabel = row.createEl('span', { text: file.path, cls: 'audio-picker-path' });

      if (this.singleSelect) {
        row.addEventListener('click', () => {
          this.onPick([file.path]);
          this.close();
        });
        row.style.cursor = 'pointer';
      }
    }
  }

  private getAudioFiles(): TFile[] {
    let root: TFolder;
    if (this.audioFolderPath) {
      const folder = this.app.vault.getAbstractFileByPath(this.audioFolderPath);
      if (folder instanceof TFolder) {
        root = folder;
      } else {
        // Configured path doesn't exist or isn't a folder – fall back to entire vault
        root = this.app.vault.getRoot();
      }
    } else {
      root = this.app.vault.getRoot();
    }
    
    const results: TFile[] = [];

    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && isAudioExtension(child.extension)) {
          results.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };

    walk(root);

    results.sort((a, b) => a.path.localeCompare(b.path));
    return results;
  }
}
