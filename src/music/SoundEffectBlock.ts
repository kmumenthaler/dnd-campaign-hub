/**
 * Sound Effect Code Block – `dnd-sfx`
 *
 * Provides:
 *  1.  SoundEffectModal      – opened via the "Insert Sound Effect" command to
 *                              let the user pick an audio file for inline playback.
 *  2.  renderSoundEffectBlock – registered as a Markdown code-block processor;
 *                              renders a compact card with a ▶ Play button that
 *                              plays the SFX overlaid on any current music.
 */
import { App, Modal, Setting, Notice, MarkdownPostProcessorContext, Editor, TFile, TFolder } from 'obsidian';
import { MusicPlayer } from './MusicPlayer';
import type { MusicSettings, SoundEffect } from './types';
import { AUDIO_EXTENSIONS, isAudioExtension } from './types';

// ─────────────────────────────────────────────────────────────────
//  SoundEffectConfig – stored as JSON inside the dnd-sfx codeblock
// ─────────────────────────────────────────────────────────────────

export interface SoundEffectConfig {
  /** Display name for the sound effect */
  name: string;
  /** Emoji icon for the button */
  icon: string;
  /** Vault path to the audio file */
  filePath: string;
  /** Volume override 0-100 (null = use master volume) */
  volume: number | null;
}

export const DEFAULT_SFX_CONFIG: SoundEffectConfig = {
  name: '',
  icon: '🔊',
  filePath: '',
  volume: null,
};

// ─────────────────────────────────────────────────────────────────
//  SoundEffectModal – form to configure the SFX before inserting
// ─────────────────────────────────────────────────────────────────

export class SoundEffectModal extends Modal {
  private settings: MusicSettings;
  private config: SoundEffectConfig;
  private onSubmit: (config: SoundEffectConfig) => void;

  constructor(
    app: App,
    settings: MusicSettings,
    existing: SoundEffectConfig | null,
    onSubmit: (config: SoundEffectConfig) => void,
  ) {
    super(app);
    this.settings = settings;
    this.config = existing ? { ...existing } : { ...DEFAULT_SFX_CONFIG };
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass('dnd-sfx-modal');
    this.titleEl.setText('🔊 Insert Sound Effect');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    // ── Source selection ───────────────────────────────────
    contentEl.createEl('h4', { text: '🎵 Audio Source' });

    // Option 1: Pick from configured soundboard effects
    if (this.settings.soundEffects.length > 0) {
      contentEl.createEl('p', {
        text: 'Pick from your configured soundboard:',
        cls: 'setting-item-description',
      });

      const grid = contentEl.createEl('div', { cls: 'dnd-sfx-picker-grid' });
      for (const sfx of this.settings.soundEffects) {
        if (!sfx.filePath) continue;
        const btn = grid.createEl('button', {
          cls: `dnd-sfx-picker-btn ${this.config.filePath === sfx.filePath ? 'selected' : ''}`,
        });
        btn.createEl('span', { text: sfx.icon, cls: 'dnd-sfx-picker-icon' });
        btn.createEl('span', { text: sfx.name, cls: 'dnd-sfx-picker-name' });

        btn.addEventListener('click', () => {
          this.config.name = sfx.name;
          this.config.icon = sfx.icon;
          this.config.filePath = sfx.filePath;
          this.config.volume = sfx.volume ?? null;
          this.render();
        });
      }

      contentEl.createEl('hr', { cls: 'dnd-sfx-divider' });
    }

    // Option 2: Pick any audio file from vault
    contentEl.createEl('p', {
      text: 'Or select any audio file from the vault:',
      cls: 'setting-item-description',
    });

    const fileRow = contentEl.createEl('div', { cls: 'dnd-sfx-file-row' });
    if (this.config.filePath) {
      const fileName = this.config.filePath.split('/').pop() || this.config.filePath;
      fileRow.createEl('span', { text: `📁 ${fileName}`, cls: 'dnd-sfx-file-name' });
    } else {
      fileRow.createEl('span', { text: 'No file selected', cls: 'dnd-sfx-file-name dnd-sfx-none' });
    }

    const browseBtn = fileRow.createEl('button', { text: 'Browse…', cls: 'mod-cta' });
    browseBtn.style.marginLeft = '8px';
    browseBtn.addEventListener('click', () => {
      this.openFilePicker();
    });

    // ── Name & Icon ───────────────────────────────────────
    contentEl.createEl('h4', { text: '⚙️ Display Settings' });

    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for the sound effect')
      .addText(t => {
        t.setValue(this.config.name);
        t.setPlaceholder('e.g. Thunder Crash');
        t.onChange(val => { this.config.name = val; });
      });

    new Setting(contentEl)
      .setName('Icon')
      .setDesc('Emoji icon displayed on the button')
      .addText(t => {
        t.setValue(this.config.icon);
        t.setPlaceholder('🔊');
        t.onChange(val => { this.config.icon = val || '🔊'; });
        t.inputEl.style.width = '60px';
      });

    new Setting(contentEl)
      .setName('Volume')
      .setDesc('Volume override (leave empty to use master volume)')
      .addSlider(s => {
        s.setLimits(0, 100, 1);
        s.setValue(this.config.volume ?? 70);
        s.setDynamicTooltip();
        s.onChange(val => { this.config.volume = val; });
      });

    // ── Actions ───────────────────────────────────────────
    const actions = contentEl.createEl('div', { cls: 'dnd-sfx-actions' });

    const insertBtn = actions.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.addEventListener('click', () => {
      if (!this.config.filePath) {
        new Notice('Please select an audio file');
        return;
      }
      if (!this.config.name) {
        // Auto-name from filename
        this.config.name = (this.config.filePath.split('/').pop() || 'Sound Effect')
          .replace(/\.[^.]+$/, '');
      }
      this.onSubmit(this.config);
      this.close();
    });

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  private openFilePicker() {
    // Inline audio file picker (similar to MusicSettingsModal's AudioFilePickerModal)
    const pickerModal = new Modal(this.app);
    pickerModal.modalEl.addClass('audio-file-picker-modal');
    pickerModal.titleEl.setText('🎵 Select Audio File');

    let filterText = '';
    const { contentEl } = pickerModal;

    const filterInput = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Filter files…',
      cls: 'audio-picker-filter',
    });

    const listContainer = contentEl.createEl('div', { cls: 'audio-picker-list' });

    const getAudioFiles = (): TFile[] => {
      const audioFolderPath = this.settings.audioFolderPath;
      let root: TFolder;
      if (audioFolderPath) {
        const folder = this.app.vault.getAbstractFileByPath(audioFolderPath);
        if (folder instanceof TFolder) {
          root = folder;
        } else {
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
    };

    const renderList = () => {
      listContainer.empty();
      const audioFiles = getAudioFiles();
      const filtered = filterText
        ? audioFiles.filter(f => f.path.toLowerCase().includes(filterText.toLowerCase()))
        : audioFiles;

      if (filtered.length === 0) {
        listContainer.createEl('p', { text: 'No audio files found.', cls: 'empty-message' });
        return;
      }

      for (const file of filtered) {
        const row = listContainer.createEl('div', { cls: 'audio-picker-row' });
        row.createEl('span', { text: file.name, cls: 'audio-picker-name' });
        row.createEl('span', { text: file.path, cls: 'audio-picker-path' });
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          this.config.filePath = file.path;
          // Auto-fill name from filename if empty
          if (!this.config.name) {
            this.config.name = file.name.replace(/\.[^.]+$/, '');
          }
          pickerModal.close();
          this.render();
        });
      }
    };

    filterInput.addEventListener('input', () => {
      filterText = filterInput.value;
      renderList();
    });

    renderList();
    filterInput.focus();
    pickerModal.open();
  }
}

// ─────────────────────────────────────────────────────────────────
//  Code-block renderer  –  ```dnd-sfx
// ─────────────────────────────────────────────────────────────────

/**
 * Render function registered via `registerMarkdownCodeBlockProcessor('dnd-sfx', …)`.
 *
 * The code-block body is a JSON-encoded SoundEffectConfig.
 * Plays the SFX **overlaid** on any currently playing music — it does NOT stop music.
 */
export function renderSoundEffectBlock(
  source: string,
  el: HTMLElement,
  _ctx: MarkdownPostProcessorContext,
  musicPlayer: MusicPlayer,
  settings: MusicSettings,
) {
  // ── Parse config ────────────────────────────────────────
  let config: SoundEffectConfig;
  try {
    config = JSON.parse(source.trim());
  } catch {
    el.createEl('div', {
      text: '⚠️ Invalid sound effect configuration',
      cls: 'dnd-sfx-block-error',
    });
    return;
  }

  if (!config.filePath) {
    el.createEl('div', {
      text: '⚠️ No audio file specified',
      cls: 'dnd-sfx-block-error',
    });
    return;
  }

  const container = el.createEl('div', { cls: 'dnd-sfx-block' });

  // ── Play button (large, prominent) ──────────────────────
  const playBtn = container.createEl('button', { cls: 'dnd-sfx-play-btn' });
  playBtn.createEl('span', { text: config.icon || '🔊', cls: 'dnd-sfx-play-icon' });

  // ── Info section ────────────────────────────────────────
  const info = container.createEl('div', { cls: 'dnd-sfx-info' });
  info.createEl('span', { text: config.name || 'Sound Effect', cls: 'dnd-sfx-name' });

  const fileName = config.filePath.split('/').pop() || config.filePath;
  info.createEl('span', { text: fileName, cls: 'dnd-sfx-file' });

  // ── Click handler — plays SFX without stopping music ───
  playBtn.addEventListener('click', () => {
    const sfx: SoundEffect = {
      id: 'inline-sfx',
      name: config.name || 'Sound Effect',
      filePath: config.filePath,
      icon: config.icon || '🔊',
      volume: config.volume ?? undefined,
    };
    musicPlayer.playSoundEffect(sfx);

    // Visual feedback
    playBtn.classList.add('playing');
    setTimeout(() => playBtn.classList.remove('playing'), 400);
  });
}

// ─────────────────────────────────────────────────────────────────
//  Helper – build code-block string for insertion into the editor
// ─────────────────────────────────────────────────────────────────

export function buildSoundEffectCodeblock(config: SoundEffectConfig): string {
  return '```dnd-sfx\n' + JSON.stringify(config, null, 2) + '\n```';
}
