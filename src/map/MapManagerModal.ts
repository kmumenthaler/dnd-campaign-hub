import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import { MapManager } from './MapManager';
import { MapCreationModal } from './MapCreationModal';
import type DndCampaignHubPlugin from '../main';

/**
 * Stored map data as persisted in the annotation JSON files.
 */
interface StoredMapInfo {
  mapId: string;
  name: string;
  imageFile: string;
  isVideo?: boolean;
  type: string;
  gridType: string;
  gridSize: number;
  scale: { value: number; unit: string };
  dimensions: { width: number; height: number };
  lastModified?: string;
}

/**
 * Modal for managing all maps – list, create, edit, delete.
 * Accessible from the plugin settings and via a command.
 */
export class MapManagerModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private mapManager: MapManager;
  private maps: StoredMapInfo[] = [];
  private listContainer: HTMLElement | null = null;
  private searchQuery = '';

  constructor(app: App, plugin: DndCampaignHubPlugin, mapManager: MapManager) {
    super(app);
    this.plugin = plugin;
    this.mapManager = mapManager;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-map-manager-modal');

    contentEl.createEl('h2', { text: '🗺️ Map Manager' });

    // ── Top bar: search + create ────────────────────────────────────
    const topBar = contentEl.createDiv({ cls: 'dnd-map-manager-topbar' });
    topBar.style.display = 'flex';
    topBar.style.gap = '10px';
    topBar.style.alignItems = 'center';
    topBar.style.marginBottom = '16px';

    const searchInput = topBar.createEl('input', {
      type: 'text',
      placeholder: '🔍 Search maps…',
      cls: 'dnd-map-manager-search',
    });
    searchInput.style.flex = '1';
    searchInput.style.padding = '8px 12px';
    searchInput.style.borderRadius = '6px';
    searchInput.style.border = '1px solid var(--background-modifier-border)';
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderMapList();
    });

    const createBtn = topBar.createEl('button', { text: '➕ New Map' });
    createBtn.style.padding = '8px 16px';
    createBtn.style.backgroundColor = 'var(--interactive-accent)';
    createBtn.style.color = 'var(--text-on-accent)';
    createBtn.style.borderRadius = '6px';
    createBtn.style.cursor = 'pointer';
    createBtn.style.whiteSpace = 'nowrap';
    createBtn.addEventListener('click', () => {
      this.close();
      new MapCreationModal(this.app, this.plugin, this.mapManager).open();
    });

    // ── Summary line ────────────────────────────────────────────────
    const summaryEl = contentEl.createDiv({ cls: 'dnd-map-manager-summary' });
    summaryEl.style.marginBottom = '12px';
    summaryEl.style.color = 'var(--text-muted)';
    summaryEl.style.fontSize = '13px';

    // ── Map list ────────────────────────────────────────────────────
    this.listContainer = contentEl.createDiv({ cls: 'dnd-map-manager-list' });
    this.listContainer.style.maxHeight = '500px';
    this.listContainer.style.overflowY = 'auto';
    this.listContainer.style.border = '1px solid var(--background-modifier-border)';
    this.listContainer.style.borderRadius = '8px';

    // ── Load data & render ──────────────────────────────────────────
    await this.loadMaps();

    summaryEl.setText(`${this.maps.length} map${this.maps.length !== 1 ? 's' : ''} found`);

    this.renderMapList();

    setTimeout(() => searchInput.focus(), 50);
  }

  /**
   * Load all saved map JSON files from the annotations directory.
   */
  private async loadMaps(): Promise<void> {
    this.maps = [];
    try {
      const annotationDir = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/map-annotations`;
      if (!(await this.app.vault.adapter.exists(annotationDir))) return;

      const listing = await this.app.vault.adapter.list(annotationDir);
      for (const filePath of listing.files) {
        if (!filePath.endsWith('.json')) continue;
        try {
          const raw = await this.app.vault.adapter.read(filePath);
          const data = JSON.parse(raw);
          if (data.mapId) {
            this.maps.push(data as StoredMapInfo);
          }
        } catch {
          // skip corrupt files
        }
      }

      // Sort alphabetically by name, then by last modified
      this.maps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (err) {
      console.error('[MapManager] Error loading maps:', err);
    }
  }

  /**
   * Render the (filtered) list of maps.
   */
  private renderMapList(): void {
    if (!this.listContainer) return;
    this.listContainer.empty();

    const filtered = this.searchQuery
      ? this.maps.filter(m => {
          const haystack = `${m.name} ${m.type} ${m.imageFile} ${m.gridType}`.toLowerCase();
          return haystack.includes(this.searchQuery);
        })
      : this.maps;

    if (filtered.length === 0) {
      const emptyEl = this.listContainer.createDiv({ cls: 'dnd-map-manager-empty' });
      emptyEl.style.padding = '32px';
      emptyEl.style.textAlign = 'center';
      emptyEl.style.color = 'var(--text-muted)';
      emptyEl.setText(this.searchQuery ? 'No maps match your search.' : 'No maps created yet. Click "New Map" to get started.');
      return;
    }

    for (const map of filtered) {
      this.renderMapRow(map);
    }
  }

  /**
   * Render a single map entry row.
   */
  private renderMapRow(map: StoredMapInfo): void {
    if (!this.listContainer) return;

    const row = this.listContainer.createDiv({ cls: 'dnd-map-manager-row' });
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.padding = '12px 14px';
    row.style.borderBottom = '1px solid var(--background-modifier-border)';
    row.style.gap = '12px';

    // ── Thumbnail ─────────────────────────────────────────────────
    const thumb = row.createDiv({ cls: 'dnd-map-manager-thumb' });
    thumb.style.width = '60px';
    thumb.style.height = '60px';
    thumb.style.borderRadius = '6px';
    thumb.style.overflow = 'hidden';
    thumb.style.flexShrink = '0';
    thumb.style.backgroundColor = 'var(--background-secondary)';
    thumb.style.display = 'flex';
    thumb.style.alignItems = 'center';
    thumb.style.justifyContent = 'center';

    if (map.imageFile) {
      const imgFile = this.app.vault.getAbstractFileByPath(map.imageFile);
      if (imgFile instanceof TFile) {
        const resourcePath = this.app.vault.getResourcePath(imgFile);
        if (map.isVideo) {
          const video = thumb.createEl('video');
          video.src = resourcePath;
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          video.muted = true;
          video.autoplay = false;
        } else {
          const img = thumb.createEl('img');
          img.src = resourcePath;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
        }
      } else {
        thumb.setText('🗺️');
        thumb.style.fontSize = '24px';
      }
    } else {
      thumb.setText('🗺️');
      thumb.style.fontSize = '24px';
    }

    // ── Info column ───────────────────────────────────────────────
    const info = row.createDiv({ cls: 'dnd-map-manager-info' });
    info.style.flex = '1';
    info.style.minWidth = '0';

    const typeEmoji = map.type === 'battlemap' ? '⚔️' : map.type === 'world' ? '🌍' : '🗺️';
    const nameEl = info.createDiv({ cls: 'dnd-map-manager-name' });
    nameEl.style.fontWeight = '600';
    nameEl.style.fontSize = '14px';
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.setText(`${typeEmoji} ${map.name || 'Unnamed Map'}`);

    const meta = info.createDiv({ cls: 'dnd-map-manager-meta' });
    meta.style.fontSize = '12px';
    meta.style.color = 'var(--text-muted)';
    meta.style.marginTop = '2px';

    const gridLabel = map.gridType === 'square' ? 'Square' :
                      map.gridType === 'hex-horizontal' ? 'Hex-H' :
                      map.gridType === 'hex-vertical' ? 'Hex-V' : 'No grid';
    const scaleLabel = map.scale ? `${map.scale.value} ${map.scale.unit}/cell` : '';
    const dimLabel = map.dimensions ? `${map.dimensions.width}×${map.dimensions.height}` : '';
    const parts = [gridLabel, `${map.gridSize}px`, scaleLabel, dimLabel].filter(Boolean);
    meta.setText(parts.join(' • '));

    if (map.lastModified) {
      const dateEl = info.createDiv();
      dateEl.style.fontSize = '11px';
      dateEl.style.color = 'var(--text-faint)';
      dateEl.style.marginTop = '2px';
      const d = new Date(map.lastModified);
      dateEl.setText(`Last modified: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    }

    // ── Action buttons ────────────────────────────────────────────
    const actions = row.createDiv({ cls: 'dnd-map-manager-actions' });
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    actions.style.flexShrink = '0';

    const editBtn = actions.createEl('button', { text: '✏️ Edit', attr: { title: 'Edit map settings' } });
    editBtn.style.padding = '4px 10px';
    editBtn.style.fontSize = '12px';
    editBtn.style.borderRadius = '4px';
    editBtn.style.cursor = 'pointer';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editMap(map);
    });

    const deleteBtn = actions.createEl('button', { text: '🗑️ Delete', attr: { title: 'Delete map' } });
    deleteBtn.style.padding = '4px 10px';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.style.borderRadius = '4px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.color = 'var(--text-error)';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmDeleteMap(map);
    });

    // Hover effect
    row.addEventListener('mouseenter', () => {
      row.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.backgroundColor = 'transparent';
    });
  }

  /**
   * Open the MapCreationModal in edit mode for the selected map.
   */
  private async editMap(map: StoredMapInfo): Promise<void> {
    this.close();

    // Load the full annotation data so the edit config has everything
    const fullData = await this.plugin.loadMapAnnotations(map.mapId);

    const editConfig = {
      ...fullData,              // carry all stored fields
      mapId: map.mapId,
      id: map.mapId,
      name: map.name,
      imageFile: map.imageFile,
      isVideo: map.isVideo,
      type: map.type,
      gridType: map.gridType,
      gridSize: map.gridSize,
      scale: map.scale,
      dimensions: map.dimensions,
      createdDate: (fullData as any).createdDate || (map as any).createdDate,
    };
    new MapCreationModal(this.app, this.plugin, this.mapManager, editConfig).open();
  }

  /**
   * Show a confirmation dialog before deleting a map.
   */
  private confirmDeleteMap(map: StoredMapInfo): void {
    const confirmModal = new Modal(this.app);
    confirmModal.onOpen = () => {
      const { contentEl } = confirmModal;
      contentEl.empty();

      contentEl.createEl('h2', { text: '🗑️ Delete Map' });
      contentEl.createEl('p', {
        text: `Are you sure you want to delete "${map.name || 'Unnamed Map'}"? This will remove all map data including markers, drawings, fog of war, and other annotations. This cannot be undone.`,
      });
      contentEl.createEl('p', {
        text: 'Note: The map image file will not be deleted from your vault.',
        cls: 'setting-item-description',
      });

      const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
      btnContainer.style.display = 'flex';
      btnContainer.style.justifyContent = 'flex-end';
      btnContainer.style.gap = '10px';
      btnContainer.style.marginTop = '16px';

      const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
      cancelBtn.addEventListener('click', () => confirmModal.close());

      const deleteBtn = btnContainer.createEl('button', { text: 'Delete Map' });
      deleteBtn.style.backgroundColor = 'var(--background-modifier-error)';
      deleteBtn.style.color = 'var(--text-on-accent)';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.addEventListener('click', async () => {
        await this.deleteMap(map);
        confirmModal.close();
      });
    };
    confirmModal.open();
  }

  /**
   * Delete a map's annotation JSON file and refresh the list.
   */
  private async deleteMap(map: StoredMapInfo): Promise<void> {
    try {
      const annotationPath = this.plugin.getMapAnnotationPath(map.mapId);
      if (await this.app.vault.adapter.exists(annotationPath)) {
        await this.app.vault.adapter.remove(annotationPath);
      }

      // Remove from in-memory list
      this.maps = this.maps.filter(m => m.mapId !== map.mapId);

      // Update summary
      const summary = this.contentEl.querySelector('.dnd-map-manager-summary');
      if (summary) {
        summary.setText(`${this.maps.length} map${this.maps.length !== 1 ? 's' : ''} found`);
      }

      this.renderMapList();
      new Notice(`✅ Map "${map.name || 'Unnamed'}" deleted`);
    } catch (err) {
      console.error('[MapManager] Error deleting map:', err);
      new Notice('❌ Failed to delete map');
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
