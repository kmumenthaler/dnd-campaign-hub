/**
 * MediaPickerModal — visual file browser for picking images/videos from the vault.
 *
 * Features:
 * - Thumbnail grid with lazy-loading (IntersectionObserver + canvas downscaling)
 * - Search/filter by filename
 * - Upload from OS file dialog
 * - Supports image (png, jpg, gif, webp, svg, avif) and video (mp4, webm) files
 */

import { App, Modal, Notice, TFile, TFolder } from 'obsidian';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];
const VIDEO_EXTENSIONS = ['mp4', 'webm'];
const ALL_MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

export type MediaPickerFilter = 'all' | 'image' | 'video';

export class MediaPickerModal extends Modal {
  private onSelect: (vaultPath: string) => void;
  private filter: MediaPickerFilter;
  private files: TFile[] = [];
  private listContainer: HTMLElement | null = null;
  private resultCountEl: HTMLElement | null = null;
  private searchQuery = '';

  // Lazy thumbnail loading
  private static readonly MAX_CONCURRENT_LOADS = 6;
  private static readonly THUMB_MAX_PX = 200;
  private thumbLoadQueue: HTMLElement[] = [];
  private activeLoads = 0;
  private thumbObserver: IntersectionObserver | null = null;
  private currentFiles: TFile[] = [];

  /**
   * @param app       Obsidian app instance
   * @param onSelect  Callback with the vault path of the selected file
   * @param filter    Which file types to show: 'all', 'image', or 'video'
   */
  constructor(app: App, onSelect: (vaultPath: string) => void, filter: MediaPickerFilter = 'all') {
    super(app);
    this.onSelect = onSelect;
    this.filter = filter;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('dnd-media-picker-modal');

    this.collectFiles();

    // Title
    const title = this.filter === 'video'
      ? 'Select Video'
      : this.filter === 'image'
        ? 'Select Image'
        : 'Select Media';
    contentEl.createEl('h2', { text: title });

    // Top bar: search + upload
    const topBar = contentEl.createDiv({ cls: 'dnd-media-picker-top-bar' });

    const searchInput = topBar.createEl('input', {
      cls: 'dnd-media-picker-search',
      attr: { type: 'text', placeholder: '🔍 Search files…', spellcheck: 'false' },
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.filterAndRender();
    });

    const uploadBtn = topBar.createEl('button', {
      cls: 'dnd-media-picker-upload-btn',
      text: '📁 Upload from computer',
    });
    uploadBtn.addEventListener('click', () => this.uploadFromOS());

    // Result count
    this.resultCountEl = contentEl.createDiv({ cls: 'dnd-media-picker-result-count' });

    // Grid
    this.listContainer = contentEl.createDiv({ cls: 'image-file-grid' });

    this.filterAndRender();
    setTimeout(() => searchInput.focus(), 50);
  }

  onClose(): void {
    if (this.thumbObserver) {
      this.thumbObserver.disconnect();
      this.thumbObserver = null;
    }
    this.contentEl.empty();
  }

  // ── File Collection ─────────────────────────────────────────────

  private collectFiles(): void {
    const exts = this.getAllowedExtensions();
    const results: TFile[] = [];

    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && exts.includes(child.extension.toLowerCase())) {
          results.push(child);
        } else if (child instanceof TFolder) {
          walk(child);
        }
      }
    };
    walk(this.app.vault.getRoot());

    // Sort alphabetically
    results.sort((a, b) => a.basename.localeCompare(b.basename));
    this.files = results;
  }

  private getAllowedExtensions(): string[] {
    switch (this.filter) {
      case 'image': return IMAGE_EXTENSIONS;
      case 'video': return VIDEO_EXTENSIONS;
      default: return ALL_MEDIA_EXTENSIONS;
    }
  }

  // ── Filter & Render ─────────────────────────────────────────────

  private filterAndRender(): void {
    let filtered = this.files;

    if (this.searchQuery) {
      const terms = this.searchQuery.split(/\s+/);
      filtered = filtered.filter(f => {
        const haystack = f.path.toLowerCase();
        return terms.every(t => haystack.includes(t));
      });
    }

    this.renderFileList(filtered);
  }

  private renderFileList(files: TFile[]): void {
    if (!this.listContainer) return;
    this.listContainer.empty();
    this.currentFiles = files;

    // Tear down previous observer
    if (this.thumbObserver) {
      this.thumbObserver.disconnect();
      this.thumbObserver = null;
    }

    // Result count
    if (this.resultCountEl) {
      this.resultCountEl.setText(
        this.searchQuery
          ? `${files.length} of ${this.files.length} files`
          : `${files.length} files`,
      );
    }

    if (files.length === 0) {
      this.listContainer.createDiv({
        cls: 'image-file-list-empty',
        text: this.searchQuery ? 'No files match your search' : 'No media files found in vault',
      });
      return;
    }

    // Reset load queue
    this.thumbLoadQueue = [];
    this.activeLoads = 0;

    // Lazy-load observer
    this.thumbObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this.thumbObserver?.unobserve(entry.target);
          this.thumbLoadQueue.push(entry.target as HTMLElement);
        }
        this.drainThumbQueue();
      },
      { root: this.listContainer, rootMargin: '200px' },
    );

    // Render skeleton cards
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const card = createDiv({ cls: 'image-file-card' });
      card.dataset.filePath = file.path;
      card.dataset.fileIndex = String(i);

      card.createDiv({ cls: 'image-file-card-thumb image-file-card-skeleton' });

      const info = card.createDiv({ cls: 'image-file-card-info' });
      info.createDiv({ cls: 'image-file-card-name', text: file.basename });
      const relPath = file.parent?.path || '';
      info.createDiv({ cls: 'image-file-card-folder', text: `📁 ${relPath || '/'}` });

      card.addEventListener('click', () => {
        this.onSelect(file.path);
        this.close();
      });

      fragment.appendChild(card);
      this.thumbObserver.observe(card);
    }
    this.listContainer.appendChild(fragment);
  }

  // ── Lazy Thumbnail Loading ──────────────────────────────────────

  private drainThumbQueue(): void {
    while (this.activeLoads < MediaPickerModal.MAX_CONCURRENT_LOADS && this.thumbLoadQueue.length > 0) {
      this.activeLoads++;
      this.loadCardThumbnail(this.thumbLoadQueue.shift()!);
    }
  }

  private onThumbLoadComplete(): void {
    this.activeLoads--;
    this.drainThumbQueue();
  }

  private loadCardThumbnail(card: HTMLElement): void {
    const filePath = card.dataset.filePath;
    const idx = Number(card.dataset.fileIndex);
    if (!filePath || isNaN(idx)) { this.onThumbLoadComplete(); return; }

    const file = this.currentFiles[idx];
    if (!file) { this.onThumbLoadComplete(); return; }

    const thumb = card.querySelector('.image-file-card-thumb') as HTMLElement;
    if (!thumb) { this.onThumbLoadComplete(); return; }

    const ext = file.extension.toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(ext);

    try {
      const resourcePath = this.app.vault.adapter.getResourcePath(file.path);

      if (isVideo) {
        const video = thumb.createEl('video', {
          attr: { src: resourcePath, muted: 'true', preload: 'metadata' },
        });
        video.addEventListener('loadeddata', () => {
          video.currentTime = 0.1;
          this.onThumbLoadComplete();
        });
        video.addEventListener('error', () => {
          this.showThumbFallback(thumb, '🎬');
          this.onThumbLoadComplete();
        });
        thumb.removeClass('image-file-card-skeleton');
      } else {
        const src = new Image();
        src.src = resourcePath;
        src.addEventListener('load', () => {
          const max = MediaPickerModal.THUMB_MAX_PX;
          let w = src.naturalWidth;
          let h = src.naturalHeight;
          if (w > max || h > max) {
            const scale = max / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(src, 0, 0, w, h);
            const smallImg = thumb.createEl('img', { attr: { alt: file.name } });
            smallImg.src = canvas.toDataURL('image/jpeg', 0.7);
          }
          thumb.removeClass('image-file-card-skeleton');
          this.onThumbLoadComplete();
        });
        src.addEventListener('error', () => {
          this.showThumbFallback(thumb, '🖼️');
          this.onThumbLoadComplete();
        });
        return; // Don't remove skeleton until load completes
      }
    } catch {
      this.showThumbFallback(thumb, isVideo ? '🎬' : '🖼️');
      this.onThumbLoadComplete();
    }
  }

  private showThumbFallback(thumb: HTMLElement, icon: string): void {
    thumb.empty();
    thumb.createDiv({ cls: 'image-file-card-thumb-fallback', text: icon });
    thumb.removeClass('image-file-card-skeleton');
  }

  // ── OS File Upload ──────────────────────────────────────────────

  private async uploadFromOS(): Promise<void> {
    const exts = this.getAllowedExtensions();
    const accept = exts.map(e => `.${e}`).join(',');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const osFile = input.files?.[0];
      document.body.removeChild(input);
      if (!osFile) return;

      try {
        const buffer = await osFile.arrayBuffer();

        const destFolder = 'z_Assets/Media';
        if (!(await this.app.vault.adapter.exists(destFolder))) {
          await this.app.vault.createFolder(destFolder);
        }

        // Deduplicate filename
        let destPath = `${destFolder}/${osFile.name}`;
        let counter = 1;
        const baseName = osFile.name.replace(/\.[^.]+$/, '');
        const ext = osFile.name.replace(/^.*\./, '.');
        while (await this.app.vault.adapter.exists(destPath)) {
          destPath = `${destFolder}/${baseName} (${counter})${ext}`;
          counter++;
        }

        await this.app.vault.createBinary(destPath, buffer);
        new Notice(`✅ Uploaded "${osFile.name}" to ${destPath}`);

        // Select the newly uploaded file
        this.onSelect(destPath);
        this.close();
      } catch (err) {
        console.error('MediaPickerModal: upload failed', err);
        new Notice('❌ Failed to upload file');
      }
    });

    input.click();
  }
}
