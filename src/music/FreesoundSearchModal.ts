/**
 * Freesound Search Modal - Search, preview, and download Creative Commons
 * sounds from Freesound.org directly into the vault.
 */
import { App, Modal, Notice, Setting } from 'obsidian';
import { FreesoundClient, FreesoundResult } from './FreesoundClient';

/** Duration filter presets */
const DURATION_FILTERS: Record<string, string> = {
  'Any': '',
  '< 5s': 'duration:[0 TO 5]',
  '< 15s': 'duration:[0 TO 15]',
  '< 30s': 'duration:[0 TO 30]',
  '< 60s': 'duration:[0 TO 60]',
  '1–5 min': 'duration:[60 TO 300]',
};

/** Sort options */
const SORT_OPTIONS: Record<string, string> = {
  'Relevance': 'score',
  'Rating ↓': 'rating_desc',
  'Downloads ↓': 'downloads_desc',
  'Duration ↑': 'duration_asc',
  'Duration ↓': 'duration_desc',
  'Newest': 'created_desc',
};

export type FreesoundPickCallback = (downloadedPaths: string[]) => void;

export class FreesoundSearchModal extends Modal {
  private client: FreesoundClient;
  private audioFolderPath: string;
  private onPick: FreesoundPickCallback;

  /* state */
  private query = '';
  private durationFilter = '';
  private sort = 'score';
  private results: FreesoundResult[] = [];
  private totalCount = 0;
  private currentPage = 1;
  private loading = false;
  private previewAudio: HTMLAudioElement | null = null;
  private previewingSoundId: number | null = null;
  private downloadedPaths: string[] = [];

  constructor(
    app: App,
    apiKey: string,
    audioFolderPath: string,
    onPick: FreesoundPickCallback,
  ) {
    super(app);
    this.client = new FreesoundClient(apiKey);
    this.audioFolderPath = audioFolderPath;
    this.onPick = onPick;
  }

  onOpen() {
    this.modalEl.addClass('freesound-search-modal');
    this.render();
  }

  onClose() {
    this.stopPreview();
    if (this.downloadedPaths.length > 0) {
      this.onPick(this.downloadedPaths);
    }
  }

  /* ─── Render ──────────────────────────────────────────────── */

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    /* Header */
    contentEl.createEl('h2', { text: '🔍 Freesound Search' });

    /* Search row */
    const searchRow = contentEl.createEl('div', { cls: 'freesound-search-row' });
    const searchInput = searchRow.createEl('input', {
      type: 'text',
      placeholder: 'Search sounds…',
      cls: 'freesound-search-input',
    });
    searchInput.value = this.query;
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.query = searchInput.value.trim();
        this.currentPage = 1;
        this.doSearch();
      }
    });

    const searchBtn = searchRow.createEl('button', { text: 'Search', cls: 'mod-cta' });
    searchBtn.addEventListener('click', () => {
      this.query = searchInput.value.trim();
      this.currentPage = 1;
      this.doSearch();
    });

    /* Filters row */
    const filterRow = contentEl.createEl('div', { cls: 'freesound-filter-row' });

    // Duration filter
    const durSetting = new Setting(filterRow)
      .setName('Duration')
      .addDropdown(dd => {
        for (const [label, value] of Object.entries(DURATION_FILTERS)) {
          dd.addOption(value, label);
        }
        dd.setValue(this.durationFilter);
        dd.onChange(val => { this.durationFilter = val; });
      });
    durSetting.settingEl.addClass('freesound-filter-item');

    // Sort
    const sortSetting = new Setting(filterRow)
      .setName('Sort')
      .addDropdown(dd => {
        for (const [label, value] of Object.entries(SORT_OPTIONS)) {
          dd.addOption(value, label);
        }
        dd.setValue(this.sort);
        dd.onChange(val => { this.sort = val; });
      });
    sortSetting.settingEl.addClass('freesound-filter-item');

    /* Results */
    const resultsContainer = contentEl.createEl('div', { cls: 'freesound-results' });

    if (this.loading) {
      resultsContainer.createEl('p', { text: 'Searching…', cls: 'freesound-loading' });
      return;
    }

    if (this.results.length === 0 && this.query) {
      resultsContainer.createEl('p', { text: 'No results found.', cls: 'freesound-empty' });
      return;
    }

    for (const sound of this.results) {
      this.renderResultCard(resultsContainer, sound);
    }

    /* Pagination */
    if (this.totalCount > 15) {
      const totalPages = Math.ceil(this.totalCount / 15);
      const pagRow = contentEl.createEl('div', { cls: 'freesound-pagination' });

      if (this.currentPage > 1) {
        const prevBtn = pagRow.createEl('button', { text: '← Previous' });
        prevBtn.addEventListener('click', () => {
          this.currentPage--;
          this.doSearch();
        });
      }

      pagRow.createEl('span', {
        text: `Page ${this.currentPage} of ${totalPages} (${this.totalCount} results)`,
        cls: 'freesound-page-info',
      });

      if (this.currentPage < totalPages) {
        const nextBtn = pagRow.createEl('button', { text: 'Next →' });
        nextBtn.addEventListener('click', () => {
          this.currentPage++;
          this.doSearch();
        });
      }
    }

    // Focus the search input
    searchInput.focus();
  }

  /* ─── Result card ─────────────────────────────────────────── */

  private renderResultCard(container: HTMLElement, sound: FreesoundResult) {
    const card = container.createEl('div', { cls: 'freesound-card' });

    /* Top row: name + meta */
    const topRow = card.createEl('div', { cls: 'freesound-card-top' });

    const nameEl = topRow.createEl('span', { text: sound.name, cls: 'freesound-card-name' });

    const metaEl = topRow.createEl('span', { cls: 'freesound-card-meta' });
    metaEl.createEl('span', { text: `${sound.duration.toFixed(1)}s` });
    if (sound.rating !== undefined) {
      metaEl.createEl('span', { text: ` · ⭐ ${sound.rating.toFixed(1)}` });
    }
    if (sound.num_downloads !== undefined) {
      metaEl.createEl('span', { text: ` · ⬇ ${sound.num_downloads}` });
    }

    /* Tags */
    if (sound.tags.length > 0) {
      const tagRow = card.createEl('div', { cls: 'freesound-card-tags' });
      for (const tag of sound.tags.slice(0, 8)) {
        tagRow.createEl('span', { text: tag, cls: 'freesound-tag' });
      }
    }

    /* Bottom row: author, license, actions */
    const bottomRow = card.createEl('div', { cls: 'freesound-card-bottom' });

    bottomRow.createEl('span', {
      text: `by ${sound.username}`,
      cls: 'freesound-card-author',
    });

    const licenseName = this.shortLicense(sound.license);
    bottomRow.createEl('span', {
      text: licenseName,
      cls: 'freesound-card-license',
    });

    /* Actions */
    const actions = bottomRow.createEl('span', { cls: 'freesound-card-actions' });

    // Preview
    const isPreviewing = this.previewingSoundId === sound.id;
    const previewBtn = actions.createEl('button', {
      text: isPreviewing ? '⏹ Stop' : '▶ Preview',
      cls: 'freesound-preview-btn',
    });
    if (isPreviewing) previewBtn.addClass('is-active');
    previewBtn.addEventListener('click', () => {
      if (isPreviewing) {
        this.stopPreview();
      } else {
        this.playPreview(sound);
      }
    });

    // Download
    const dlBtn = actions.createEl('button', {
      text: '⬇ Download',
      cls: 'freesound-download-btn',
    });
    dlBtn.addEventListener('click', async () => {
      dlBtn.textContent = '⏳…';
      dlBtn.setAttribute('disabled', 'true');
      try {
        const path = await this.client.downloadPreviewToVault(
          this.app.vault,
          sound,
          this.audioFolderPath,
        );
        await this.client.appendCredit(this.app.vault, sound);
        this.downloadedPaths.push(path);
        dlBtn.textContent = '✅ Done';
        new Notice(`Downloaded: ${sound.name}`);
      } catch (err) {
        dlBtn.textContent = '❌ Error';
        dlBtn.removeAttribute('disabled');
        console.error('Freesound download error', err);
        new Notice(`Download failed: ${(err as Error).message}`);
      }
    });
  }

  /* ─── Search ──────────────────────────────────────────────── */

  private async doSearch() {
    if (!this.query) return;
    this.loading = true;
    this.render();

    try {
      const resp = await this.client.search({
        query: this.query,
        filter: this.durationFilter || undefined,
        sort: this.sort,
        pageSize: 15,
        page: this.currentPage,
      });
      this.results = resp.results;
      this.totalCount = resp.count;
    } catch (err) {
      console.error('Freesound search error', err);
      new Notice(`Search failed: ${(err as Error).message}`);
      this.results = [];
      this.totalCount = 0;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  /* ─── Preview playback ───────────────────────────────────── */

  private playPreview(sound: FreesoundResult) {
    this.stopPreview();
    const url = sound.previews['preview-hq-mp3'];
    if (!url) {
      new Notice('No preview available');
      return;
    }
    this.previewAudio = new Audio(url);
    this.previewingSoundId = sound.id;
    this.previewAudio.volume = 0.6;
    this.previewAudio.play().catch(err => {
      console.error('Preview playback error', err);
      new Notice('Could not play preview');
    });
    this.previewAudio.addEventListener('ended', () => {
      this.previewingSoundId = null;
      this.render();
    });
    this.render();
  }

  private stopPreview() {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.src = '';
      this.previewAudio = null;
    }
    this.previewingSoundId = null;
  }

  /* ─── Helpers ─────────────────────────────────────────────── */

  /** Shorten Creative Commons license URL to a readable label */
  private shortLicense(license: string): string {
    if (license.includes('zero')) return 'CC0';
    if (license.includes('by-nc')) return 'CC BY-NC';
    if (license.includes('by-sa')) return 'CC BY-SA';
    if (license.includes('/by/')) return 'CC BY';
    if (license.includes('sampling')) return 'Sampling+';
    return 'CC';
  }
}
