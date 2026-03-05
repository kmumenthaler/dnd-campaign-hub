/**
 * Music Settings Modal - Configure playlists, soundboard, and scene integration.
 */
import { App, AbstractInputSuggest, Modal, Notice, Setting, TFile, TFolder } from 'obsidian';
import type { MusicSettings, Playlist, SoundEffect } from './types';
import { AUDIO_EXTENSIONS, DEFAULT_SOUNDBOARD_ICONS, isAudioExtension } from './types';
import { FreesoundSearchModal } from './FreesoundSearchModal';

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
  /** Tracks which playlist cards are expanded (by id). New playlists auto-expand. */
  private expandedPlaylists: Set<string> = new Set();
  /** Current filter text for the playlists tab */
  private playlistFilter: string = '';

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
    const btnRow = container.createEl('div', { cls: 'music-playlist-btn-row' });

    const addBtn = btnRow.createEl('button', { text: '+ New Playlist', cls: 'mod-cta music-add-btn' });
    addBtn.addEventListener('click', () => {
      const newId = uid();
      this.settings.playlists.push({
        id: newId,
        name: 'New Playlist',
        mood: 'ambient',
        trackPaths: [],
      });
      this.expandedPlaylists.add(newId);
      this.render();
    });

    // ── Bulk-import: create one playlist per subfolder ──────
    const scanBtn = btnRow.createEl('button', { text: '📂 Import from Subfolders', cls: 'music-add-btn music-scan-btn' });
    scanBtn.addEventListener('click', () => {
      this.importPlaylistsFromSubfolders();
    });

    if (this.settings.playlists.length === 0) {
      container.createEl('p', { text: 'No playlists configured. Add one to get started!', cls: 'empty-message' });
      return;
    }

    // ── Search / Filter bar ─────────────────────────────────
    const filterRow = container.createEl('div', { cls: 'music-playlist-filter-row' });
    const filterInput = filterRow.createEl('input', {
      type: 'text',
      cls: 'music-playlist-filter-input',
      placeholder: '🔍 Filter playlists by name or mood…',
    });
    filterInput.value = this.playlistFilter;
    filterInput.addEventListener('input', () => {
      this.playlistFilter = filterInput.value;
      renderFilteredList();
    });

    // Expand / Collapse all
    const expandAllBtn = filterRow.createEl('button', {
      text: '▼ All',
      cls: 'music-playlist-expand-all-btn',
      attr: { 'aria-label': 'Expand all playlists' },
    });
    expandAllBtn.addEventListener('click', () => {
      for (const pl of this.settings.playlists) this.expandedPlaylists.add(pl.id);
      renderFilteredList();
    });
    const collapseAllBtn = filterRow.createEl('button', {
      text: '▲ All',
      cls: 'music-playlist-expand-all-btn',
      attr: { 'aria-label': 'Collapse all playlists' },
    });
    collapseAllBtn.addEventListener('click', () => {
      this.expandedPlaylists.clear();
      renderFilteredList();
    });

    const listContainer = container.createEl('div', { cls: 'music-playlist-list' });
    const countLabel = container.createEl('div', { cls: 'music-playlist-count' });

    const renderFilteredList = () => {
      listContainer.empty();
      const q = this.playlistFilter.toLowerCase().trim();
      const filtered = q
        ? this.settings.playlists.filter(p =>
            p.name.toLowerCase().includes(q) || p.mood.toLowerCase().includes(q))
        : this.settings.playlists;
      countLabel.textContent = q
        ? `Showing ${filtered.length} of ${this.settings.playlists.length} playlists`
        : `${this.settings.playlists.length} playlist${this.settings.playlists.length !== 1 ? 's' : ''}`;
      if (filtered.length === 0) {
        listContainer.createEl('p', { text: 'No matching playlists.', cls: 'empty-message' });
        return;
      }
      for (const playlist of filtered) {
        this.renderPlaylistCard(listContainer, playlist);
      }
    };

    renderFilteredList();
    // Focus filter & restore cursor position
    filterInput.focus();
    filterInput.setSelectionRange(filterInput.value.length, filterInput.value.length);
  }

  private renderPlaylistCard(container: HTMLElement, playlist: Playlist) {
    const isExpanded = this.expandedPlaylists.has(playlist.id);
    const card = container.createEl('div', { cls: `music-playlist-card ${isExpanded ? 'expanded' : 'collapsed'}` });

    // ── Compact summary header (always visible) ─────────────
    const summary = card.createEl('div', { cls: 'music-playlist-summary' });

    const toggleIcon = summary.createEl('span', {
      text: isExpanded ? '▼' : '▶',
      cls: 'music-playlist-toggle-icon',
    });
    summary.createEl('span', { text: playlist.name, cls: 'music-playlist-summary-name' });
    const moodBadge = summary.createEl('span', {
      text: playlist.mood,
      cls: 'music-playlist-mood-badge',
    });
    if (playlist.isBackgroundSound) {
      summary.createEl('span', { text: '🔊', cls: 'music-playlist-ambient-badge', attr: { title: 'Ambient layer' } });
    }
    summary.createEl('span', {
      text: `${playlist.trackPaths.length} track${playlist.trackPaths.length !== 1 ? 's' : ''}`,
      cls: 'music-playlist-track-count',
    });

    summary.addEventListener('click', (e) => {
      // Don't toggle if clicking the delete button
      if ((e.target as HTMLElement).closest('.music-delete-btn')) return;
      if (this.expandedPlaylists.has(playlist.id)) {
        this.expandedPlaylists.delete(playlist.id);
      } else {
        this.expandedPlaylists.add(playlist.id);
      }
      this.render();
    });

    // Delete playlist button (on summary row)
    const delBtn = summary.createEl('button', { text: '🗑️', cls: 'music-delete-btn', attr: { 'aria-label': 'Delete playlist' } });
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.settings.playlists = this.settings.playlists.filter(p => p.id !== playlist.id);
      this.expandedPlaylists.delete(playlist.id);
      this.render();
    });

    // ── Expanded body (details + tracks) ────────────────────
    if (!isExpanded) return;

    const body = card.createEl('div', { cls: 'music-playlist-card-body' });

    // Header row with name input + mood selector
    const header = body.createEl('div', { cls: 'music-playlist-header' });

    // Name input
    const nameInput = header.createEl('input', { type: 'text', cls: 'music-playlist-name-input' });
    nameInput.value = playlist.name;
    nameInput.placeholder = 'Playlist name';
    nameInput.addEventListener('change', () => {
      playlist.name = nameInput.value.trim() || 'Untitled';
      // Update summary
      this.render();
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
      this.render();
    });

    // Background sound toggle
    const bgRow = body.createEl('div', { cls: 'music-bg-toggle-row' });
    const bgLabel = bgRow.createEl('label', { cls: 'music-bg-toggle-label' });
    const bgCheckbox = bgLabel.createEl('input', { type: 'checkbox' });
    bgCheckbox.checked = playlist.isBackgroundSound ?? false;
    bgLabel.appendText(' 🔊 Background / Environment sound');
    const bgDesc = bgRow.createEl('span', { text: 'Allow on the ambient layer', cls: 'music-bg-toggle-desc' });
    bgCheckbox.addEventListener('change', () => {
      playlist.isBackgroundSound = bgCheckbox.checked;
    });

    // Track list (with drag-and-drop reordering)
    const trackList = body.createEl('div', { cls: 'music-track-list' });
    if (playlist.trackPaths.length === 0) {
      trackList.createEl('p', { text: 'No tracks added yet.', cls: 'empty-message' });
    } else {
      let dragSrcIndex: number | null = null;

      for (let i = 0; i < playlist.trackPaths.length; i++) {
        const trackRow = trackList.createEl('div', { cls: 'music-track-row', attr: { draggable: 'true' } });
        trackRow.dataset.index = String(i);
        const trackPath = playlist.trackPaths[i] ?? '';
        const label = trackPath.split('/').pop() ?? trackPath;

        // Drag handle
        trackRow.createEl('span', { text: '\u2261', cls: 'music-track-drag-handle' });

        trackRow.createEl('span', { text: `${i + 1}. ${label}`, cls: 'music-track-label' });

        // Remove
        const removeBtn = trackRow.createEl('button', { text: '\u2715', cls: 'music-track-btn music-track-remove' });
        removeBtn.addEventListener('click', () => {
          playlist.trackPaths.splice(i, 1);
          this.render();
        });

        // Drag events
        trackRow.addEventListener('dragstart', (e) => {
          dragSrcIndex = i;
          trackRow.classList.add('dragging');
          e.dataTransfer?.setData('text/plain', String(i));
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });

        trackRow.addEventListener('dragend', () => {
          trackRow.classList.remove('dragging');
          dragSrcIndex = null;
          trackList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        trackRow.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          trackRow.classList.add('drag-over');
        });

        trackRow.addEventListener('dragleave', () => {
          trackRow.classList.remove('drag-over');
        });

        trackRow.addEventListener('drop', (e) => {
          e.preventDefault();
          trackRow.classList.remove('drag-over');
          if (dragSrcIndex === null || dragSrcIndex === i) return;
          const [moved] = playlist.trackPaths.splice(dragSrcIndex, 1);
          if (moved !== undefined) {
            playlist.trackPaths.splice(i, 0, moved);
          }
          this.render();
        });
      }
    }

    // Track action buttons row
    const trackActions = body.createEl('div', { cls: 'music-track-actions' });

    // Add tracks button (picks from vault audio files)
    const addTrackBtn = trackActions.createEl('button', { text: '+ Add Tracks', cls: 'music-add-track-btn' });
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

    // Scan folder – add all audio files from a chosen folder
    const scanFolderBtn = trackActions.createEl('button', { text: '📂 Scan Folder', cls: 'music-add-track-btn music-scan-folder-btn' });
    scanFolderBtn.addEventListener('click', () => {
      new FolderPickerModal(this.app, this.settings.audioFolderPath, (folderPath) => {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) return;
        const audioFiles = this.getAudioFilesInFolder(folder);
        let added = 0;
        for (const f of audioFiles) {
          if (!playlist.trackPaths.includes(f.path)) {
            playlist.trackPaths.push(f.path);
            added++;
          }
        }
        new Notice(`Added ${added} track(s) from ${folder.name}`);
        this.render();
      }).open();
    });

    // Freesound search – download CC sounds as playlist tracks
    const fsTrackBtn = trackActions.createEl('button', { text: '🔍 Search Freesound', cls: 'music-add-track-btn music-freesound-btn' });
    fsTrackBtn.addEventListener('click', () => {
      this.openFreesoundForPlaylist(playlist);
    });
  }

  // ─── Soundboard Tab ───────────────────────────────────────

  private renderSoundboardTab(container: HTMLElement) {
    const btnRow = container.createEl('div', { cls: 'music-playlist-btn-row' });

    const addBtn = btnRow.createEl('button', { text: '+ New Sound Effect', cls: 'mod-cta music-add-btn' });
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

    // Bulk import: scan a folder and create one SFX per audio file
    const scanBtn = btnRow.createEl('button', { text: '📂 Scan Folder for SFX', cls: 'music-add-btn music-scan-btn' });
    scanBtn.addEventListener('click', () => {
      this.importSfxFromFolder();
    });

    // Freesound search – download CC sounds as SFX
    const fsBtn = btnRow.createEl('button', { text: '🔍 Search Freesound', cls: 'music-add-btn music-freesound-btn' });
    fsBtn.addEventListener('click', () => {
      this.openFreesoundForSfx();
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
    // Audio folder path with folder suggestions
    const folderSetting = new Setting(container)
      .setName('Audio Folder')
      .setDesc('Vault folder containing your music/sfx files');

    folderSetting.addText(text => {
      text.setPlaceholder('e.g. Assets/Music')
        .setValue(this.settings.audioFolderPath)
        .onChange(val => { this.settings.audioFolderPath = val.trim(); });

      // Attach folder autocomplete
      new FolderSuggest(this.app, text.inputEl);
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

    // ── Ducking settings ──────────────────────────────────────
    container.createEl('h4', { text: 'Sound Effect Ducking' });
    container.createEl('p', {
      text: 'Temporarily lower music & ambient volume when a sound effect plays, so SFX cut through clearly.',
      cls: 'setting-item-description'
    });

    new Setting(container)
      .setName('Enable Ducking')
      .setDesc('Reduce music volume while sound effects are playing')
      .addToggle(toggle => {
        toggle.setValue(this.settings.duckingEnabled ?? true)
          .onChange(val => { this.settings.duckingEnabled = val; });
      });

    new Setting(container)
      .setName('Duck Amount')
      .setDesc('How much to reduce volume (0–100%). Higher = quieter music during SFX.')
      .addSlider(slider => {
        slider.setLimits(0, 100, 5)
          .setValue(this.settings.duckingAmount ?? 50)
          .setDynamicTooltip()
          .onChange(val => { this.settings.duckingAmount = val; });
      });

    new Setting(container)
      .setName('Duck Fade Down')
      .setDesc('How quickly music fades down when SFX starts (in ms)')
      .addText(text => {
        text.setPlaceholder('100')
          .setValue(String(this.settings.duckingFadeDownMs ?? 100))
          .onChange(val => {
            const n = parseInt(val);
            if (!isNaN(n) && n >= 0) this.settings.duckingFadeDownMs = n;
          });
      });

    new Setting(container)
      .setName('Duck Fade Up')
      .setDesc('How quickly music fades back up when SFX ends (in ms)')
      .addText(text => {
        text.setPlaceholder('400')
          .setValue(String(this.settings.duckingFadeUpMs ?? 400))
          .onChange(val => {
            const n = parseInt(val);
            if (!isNaN(n) && n >= 0) this.settings.duckingFadeUpMs = n;
          });
      });

    // ─── Freesound Integration ───
    container.createEl('h4', { text: 'Freesound Integration' });

    new Setting(container)
      .setName('Freesound API Key')
      .setDesc('Get a free key at freesound.org/apiv2/apply')
      .addText(text => {
        text.setPlaceholder('Enter your API key…')
          .setValue(this.settings.freesoundApiKey ?? '')
          .onChange(val => {
            this.settings.freesoundApiKey = val.trim() || undefined;
          });
        text.inputEl.type = 'password';
        text.inputEl.style.width = '260px';
      });

  }

  // ─── Freesound Helpers ────────────────────────────────────

  private checkFreesoundKey(): boolean {
    if (!this.settings.freesoundApiKey) {
      new Notice('Set a Freesound API Key in the General tab first');
      return false;
    }
    return true;
  }

  /** Open Freesound search and import downloaded sounds as SFX entries */
  private openFreesoundForSfx() {
    if (!this.checkFreesoundKey()) return;
    new FreesoundSearchModal(
      this.app,
      this.settings.freesoundApiKey!,
      this.settings.audioFolderPath,
      (paths) => {
        for (const p of paths) {
          const baseName = p.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Freesound SFX';
          const { name, icon } = MusicSettingsModal.filenameToSfx(baseName);
          this.settings.soundEffects.push({
            id: uid(),
            name,
            filePath: p,
            icon,
          });
        }
        if (paths.length > 0) {
          new Notice(`Added ${paths.length} sound effect(s) from Freesound`);
          this.render();
        }
      },
    ).open();
  }

  /** Open Freesound search and add downloaded tracks to a playlist */
  private openFreesoundForPlaylist(playlist: Playlist) {
    if (!this.checkFreesoundKey()) return;
    new FreesoundSearchModal(
      this.app,
      this.settings.freesoundApiKey!,
      this.settings.audioFolderPath,
      (paths) => {
        let added = 0;
        for (const p of paths) {
          if (!playlist.trackPaths.includes(p)) {
            playlist.trackPaths.push(p);
            added++;
          }
        }
        if (added > 0) {
          new Notice(`Added ${added} track(s) from Freesound`);
          this.render();
        }
      },
    ).open();
  }

  // ─── Helpers ──────────────────────────────────────────────

  /** Collect all audio files inside a folder (recursively). */
  private getAudioFilesInFolder(folder: TFolder): TFile[] {
    const results: TFile[] = [];
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && isAudioExtension(child.extension)) {
          results.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(folder);
    results.sort((a, b) => a.path.localeCompare(b.path));
    return results;
  }

  /** Map a folder name to a sensible mood tag. */
  private static folderNameToMood(name: string): { mood: string; isBackground: boolean } {
    const lower = name.toLowerCase();
    const map: Record<string, { mood: string; isBackground: boolean }> = {
      ambience: { mood: 'ambient', isBackground: true },
      ambient: { mood: 'ambient', isBackground: true },
      battle: { mood: 'combat', isBackground: false },
      combat: { mood: 'combat', isBackground: false },
      exploration: { mood: 'exploration', isBackground: false },
      explore: { mood: 'exploration', isBackground: false },
      mystery: { mood: 'mysterious', isBackground: false },
      mysterious: { mood: 'mysterious', isBackground: false },
      tavern: { mood: 'tavern', isBackground: false },
      horror: { mood: 'horror', isBackground: false },
      calm: { mood: 'calm', isBackground: false },
      dramatic: { mood: 'dramatic', isBackground: false },
      epic: { mood: 'epic', isBackground: false },
      victory: { mood: 'epic', isBackground: false },
      soundboard: { mood: 'ambient', isBackground: false },
    };
    return map[lower] ?? { mood: 'custom', isBackground: false };
  }

  /**
   * Bulk-import: scan the audio folder for subfolders and create one
   * playlist per subfolder.  Skips folders that already have a matching playlist.
   */
  /**
   * Bulk-import SFX: pick a folder, scan for audio files, and create one
   * sound effect per file.  Skips files that already have a matching SFX.
   */
  private importSfxFromFolder() {
    const rootPath = this.settings.audioFolderPath;
    if (!rootPath) {
      new Notice('Set an Audio Folder in General settings first');
      return;
    }

    new FolderPickerModal(this.app, rootPath, (folderPath) => {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) {
        new Notice(`Folder not found: ${folderPath}`);
        return;
      }

      const audioFiles = this.getAudioFilesInFolder(folder);
      if (audioFiles.length === 0) {
        new Notice('No audio files found in that folder');
        return;
      }

      let created = 0;
      for (const file of audioFiles) {
        // Skip if an SFX with this exact file path already exists
        if (this.settings.soundEffects.some(s => s.filePath === file.path)) continue;

        const baseName = file.basename; // filename without extension
        const { name, icon } = MusicSettingsModal.filenameToSfx(baseName);

        this.settings.soundEffects.push({
          id: uid(),
          name,
          filePath: file.path,
          icon,
          volume: undefined,
        });
        created++;
      }

      if (created > 0) {
        new Notice(`Created ${created} sound effect(s) from folder`);
        this.render();
      } else {
        new Notice('All files in that folder already have SFX entries');
      }
    }).open();
  }

  /**
   * Derive a human-friendly SFX name and matching icon from a filename.
   * Strips leading numbers/separators, converts kebab/snake case to Title Case.
   */
  private static filenameToSfx(baseName: string): { name: string; icon: string } {
    // Strip leading numbers and separators (e.g. "01 - Sword Clash" → "Sword Clash")
    let cleaned = baseName.replace(/^[\d]+[\s._-]*/u, '');
    // Convert kebab-case / snake_case to spaces
    cleaned = cleaned.replace(/[-_]+/g, ' ');
    // Title Case
    const name = cleaned
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim() || baseName;

    // Try to match a known icon based on keywords
    const icon = MusicSettingsModal.matchSfxIcon(name);
    return { name, icon };
  }

  /** Best-effort emoji icon matching based on SFX name keywords. */
  private static matchSfxIcon(name: string): string {
    const lower = name.toLowerCase();
    const map: [RegExp, string][] = [
      [/sword|slash|blade|steel/i, '⚔️'],
      [/fire|flame|burn/i, '🔥'],
      [/fanfare|trumpet|horn/i, '🎺'],
      [/horror|scream|creep/i, '😱'],
      [/death|die|skull/i, '💀'],
      [/door|creak|gate/i, '🚪'],
      [/thunder|lightning|storm/i, '⚡'],
      [/magic|spell|cast|arcane/i, '✨'],
      [/explo|boom|blast|bomb/i, '💥'],
      [/arrow|bow|shoot/i, '🏹'],
      [/heal|cure|restore/i, '💚'],
      [/coin|gold|money|loot/i, '🪙'],
      [/water|splash|wave|rain/i, '🌊'],
      [/wind|gust|breeze/i, '💨'],
      [/bell|chime|ring/i, '🔔'],
      [/drum|beat/i, '🥁'],
      [/growl|roar|beast|monster/i, '🐉'],
      [/laugh|giggle|cackle/i, '😈'],
      [/whisper|voice|spirit/i, '👻'],
      [/chain|lock|prison/i, '⛓️'],
      [/glass|shatter|break/i, '🔮'],
      [/horse|gallop|hoof/i, '🐴'],
      [/crowd|cheer|tavern/i, '🍺'],
    ];
    for (const [pattern, emoji] of map) {
      if (pattern.test(lower)) return emoji;
    }
    return '🔊'; // default fallback
  }

  private importPlaylistsFromSubfolders() {
    const rootPath = this.settings.audioFolderPath;
    if (!rootPath) {
      new Notice('Set an Audio Folder in General settings first');
      return;
    }
    const rootFolder = this.app.vault.getAbstractFileByPath(rootPath);
    if (!(rootFolder instanceof TFolder)) {
      new Notice(`Folder not found: ${rootPath}`);
      return;
    }

    let created = 0;
    for (const child of rootFolder.children) {
      if (!(child instanceof TFolder)) continue;

      // Skip if a playlist with this folder's name already exists
      const folderName = child.name;
      if (this.settings.playlists.some(p => p.name === folderName)) continue;

      const audioFiles = this.getAudioFilesInFolder(child);
      if (audioFiles.length === 0) continue;

      const { mood, isBackground } = MusicSettingsModal.folderNameToMood(folderName);

      this.settings.playlists.push({
        id: uid(),
        name: folderName,
        mood,
        trackPaths: audioFiles.map(f => f.path),
        isBackgroundSound: isBackground,
      });
      created++;
    }

    if (created > 0) {
      new Notice(`Created ${created} playlist(s) from subfolders`);
      this.render();
    } else {
      new Notice('No new subfolders with audio files found');
    }
  }
}

// ─── Folder Picker Modal ──────────────────────────────────

/**
 * Simple modal that lists folders under the audio root and lets
 * the user pick one.
 */
class FolderPickerModal extends Modal {
  private audioFolderPath: string;
  private onPick: (folderPath: string) => void;

  constructor(app: App, audioFolderPath: string, onPick: (folderPath: string) => void) {
    super(app);
    this.audioFolderPath = audioFolderPath;
    this.onPick = onPick;
  }

  onOpen() {
    this.modalEl.addClass('folder-picker-modal');
    this.titleEl.setText('📂 Select Folder');
    const { contentEl } = this;

    const folders = this.getFolders();
    if (folders.length === 0) {
      contentEl.createEl('p', { text: 'No subfolders found.', cls: 'empty-message' });
      return;
    }

    const list = contentEl.createEl('div', { cls: 'folder-picker-list' });
    for (const folder of folders) {
      const row = list.createEl('div', { cls: 'folder-picker-row' });
      row.createEl('span', { text: '📁 ' + folder.name, cls: 'folder-picker-name' });
      const count = this.countAudioFiles(folder);
      row.createEl('span', { text: `${count} audio file(s)`, cls: 'folder-picker-count' });
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        this.onPick(folder.path);
        this.close();
      });
    }
  }

  onClose() { this.contentEl.empty(); }

  private getFolders(): TFolder[] {
    let root: TFolder;
    if (this.audioFolderPath) {
      const f = this.app.vault.getAbstractFileByPath(this.audioFolderPath);
      root = f instanceof TFolder ? f : this.app.vault.getRoot();
    } else {
      root = this.app.vault.getRoot();
    }
    const results: TFolder[] = [];
    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          results.push(child);
          walk(child);
        }
      }
    };
    walk(root);
    results.sort((a, b) => a.path.localeCompare(b.path));
    return results;
  }

  private countAudioFiles(folder: TFolder): number {
    let count = 0;
    const walk = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && isAudioExtension(child.extension)) count++;
        else if (child instanceof TFolder) walk(child);
      }
    };
    walk(folder);
    return count;
  }
}

// ─── Folder Suggest (autocomplete for folder paths) ───────

/**
 * Inline autocomplete that suggests vault folders as the user types.
 */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  getSuggestions(query: string): TFolder[] {
    const lowerQuery = query.toLowerCase();
    const folders: TFolder[] = [];

    const walk = (folder: TFolder) => {
      // Skip root
      if (folder.path) folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) walk(child);
      }
    };
    walk(this.app.vault.getRoot());

    if (!query) return folders.slice(0, 50);

    return folders
      .filter(f =>
        f.path.toLowerCase().includes(lowerQuery) ||
        f.name.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.createDiv({ text: folder.name, cls: 'suggestion-title' }).style.fontWeight = '600';
    if (folder.path !== folder.name) {
      const pathDiv = el.createDiv({ text: folder.path, cls: 'suggestion-note' });
      pathDiv.style.fontSize = '0.85em';
      pathDiv.style.color = 'var(--text-muted)';
    }
  }

  selectSuggestion(folder: TFolder): void {
    this.inputEl.value = folder.path;
    this.inputEl.dispatchEvent(new Event('input'));
    this.close();
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
