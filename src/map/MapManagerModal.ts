import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import { MapManager } from './MapManager';
import { MapCreationModal, BATTLEMAP_TEMPLATE_FOLDER } from './MapCreationModal';
import { MapTemplateTagModal } from './MapTemplateTagModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { getTemplateSyncChangedFields, syncMapFromTemplate as syncMapDataFromTemplate, type TemplateStructuralField } from './MapFactory';
import { _flushMapSave, invalidateTemplateIndex } from './MapPersistence';
import { MapTemplateTags, createDefaultTemplateTags } from './types';
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
  isTemplate?: boolean;
  templateTags?: MapTemplateTags;
  templateSourceId?: string;
  templateSourceName?: string;
  templateSyncedAt?: string;
}

const TEMPLATE_SYNC_FIELD_LABELS: Record<TemplateStructuralField, string> = {
  imageFile: 'image',
  isVideo: 'media type',
  type: 'map type',
  dimensions: 'dimensions',
  gridType: 'grid type',
  gridSize: 'grid size',
  gridOffsetX: 'grid offset',
  gridOffsetY: 'grid offset',
  gridSizeW: 'grid width',
  gridSizeH: 'grid height',
  gridVisible: 'grid visibility',
  scale: 'scale',
  fogOfWar: 'fog',
  walls: 'walls',
  lightSources: 'lights',
  tunnels: 'tunnels',
  tileElevations: 'elevations',
  difficultTerrain: 'difficult terrain',
  envAssets: 'environment assets',
  hexTerrains: 'terrain',
  hexClimates: 'climate',
  customTerrainDescriptions: 'terrain descriptions',
  hexcrawlState: 'hexcrawl state',
};

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
  private filterMode: 'templates' | 'active' = 'templates';

  constructor(app: App, plugin: DndCampaignHubPlugin, mapManager: MapManager) {
    super(app);
    this.plugin = plugin;
    this.mapManager = mapManager;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-map-manager-modal');
    this.modalEl.addClass('dnd-map-manager-modal');

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

    // ── Filter tabs ─────────────────────────────────────────────────
    const tabBar = topBar.createDiv({ cls: 'dnd-map-manager-tabs' });
    tabBar.style.display = 'flex';
    tabBar.style.gap = '4px';

    const tabs: Array<{ id: 'templates' | 'active'; label: string; icon: string }> = [
      { id: 'templates', label: 'Templates', icon: '🏗️' },
      { id: 'active',    label: 'Active',    icon: '⚔️' },
    ];

    tabs.forEach(tab => {
      const btn = tabBar.createEl('button', {
        text: `${tab.icon} ${tab.label}`,
        cls: `dnd-map-tab ${this.filterMode === tab.id ? 'active' : ''}`,
      });
      btn.style.padding = '6px 12px';
      btn.style.borderRadius = '4px';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '12px';
      btn.style.border = this.filterMode === tab.id
        ? '1px solid var(--interactive-accent)'
        : '1px solid var(--background-modifier-border)';
      btn.style.backgroundColor = this.filterMode === tab.id
        ? 'var(--interactive-accent)'
        : 'var(--background-secondary)';
      btn.style.color = this.filterMode === tab.id
        ? 'var(--text-on-accent)'
        : 'var(--text-normal)';

      btn.addEventListener('click', () => {
        this.filterMode = tab.id;
        tabBar.querySelectorAll('.dnd-map-tab').forEach((t, idx) => {
          const isActive = tabs[idx]?.id === this.filterMode;
          (t as HTMLElement).style.border = isActive
            ? '1px solid var(--interactive-accent)'
            : '1px solid var(--background-modifier-border)';
          (t as HTMLElement).style.backgroundColor = isActive
            ? 'var(--interactive-accent)'
            : 'var(--background-secondary)';
          (t as HTMLElement).style.color = isActive
            ? 'var(--text-on-accent)'
            : 'var(--text-normal)';
        });
        this.renderMapList();
      });
    });

    const createBtn = topBar.createEl('button', { text: '🏗️ New Template' });
    createBtn.style.padding = '8px 16px';
    createBtn.style.backgroundColor = 'var(--interactive-accent)';
    createBtn.style.color = 'var(--text-on-accent)';
    createBtn.style.borderRadius = '6px';
    createBtn.style.cursor = 'pointer';
    createBtn.style.whiteSpace = 'nowrap';
    createBtn.addEventListener('click', () => {
      this.close();
      new MapCreationModal(this.app, this.plugin, this.mapManager, undefined, undefined, false, true).open();
    });

    const newMapBtn = topBar.createEl('button', { text: '⚔️ New Map' });
    newMapBtn.style.padding = '8px 16px';
    newMapBtn.style.borderRadius = '6px';
    newMapBtn.style.cursor = 'pointer';
    newMapBtn.style.whiteSpace = 'nowrap';
    newMapBtn.style.border = '1px solid var(--background-modifier-border)';
    newMapBtn.addEventListener('click', () => {
      this.close();
      new TemplatePickerModal(this.app, this.plugin, this.mapManager, false).open();
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

    let filtered = this.maps;

    // Apply tab filter
    if (this.filterMode === 'templates') {
      filtered = filtered.filter(m => m.isTemplate === true);
    } else if (this.filterMode === 'active') {
      filtered = filtered.filter(m => !m.isTemplate);
    }

    // Apply search filter
    if (this.searchQuery) {
      filtered = filtered.filter(m => {
        const haystack = `${m.name} ${m.type} ${m.imageFile} ${m.gridType}`.toLowerCase();
        if (haystack.includes(this.searchQuery)) return true;
        // Also search template tags
        if (m.templateTags) {
          const tagStr = [
            ...m.templateTags.terrain,
            ...m.templateTags.climate,
            ...m.templateTags.location,
            ...m.templateTags.custom,
          ].join(' ').toLowerCase();
          return tagStr.includes(this.searchQuery);
        }
        return false;
      });
    }

    if (filtered.length === 0) {
      const emptyEl = this.listContainer.createDiv({ cls: 'dnd-map-manager-empty' });
      if (this.filterMode === 'templates') {
        emptyEl.createEl('p', {
          text: this.searchQuery ? 'No templates match your search.' : 'No map templates yet.',
        });
        emptyEl.createEl('p', {
          text: this.searchQuery
            ? 'Try a different search term or clear the filter.'
            : 'Templates let you reuse walls, lighting, fog, terrain, and grid setup.',
          cls: 'dnd-map-manager-empty-hint',
        });
        if (!this.searchQuery) {
          const action = emptyEl.createEl('button', { text: 'Create Template', cls: 'mod-cta' });
          action.addEventListener('click', () => {
            this.close();
            new MapCreationModal(this.app, this.plugin, this.mapManager, undefined, undefined, false, true).open();
          });
        }
      } else {
        emptyEl.createEl('p', {
          text: this.searchQuery ? 'No maps match your search.' : 'No active maps yet.',
        });
        emptyEl.createEl('p', {
          text: this.searchQuery
            ? 'Try a different search term or clear the filter.'
            : 'Create a map from a template or image so scenes and encounters can reference it.',
          cls: 'dnd-map-manager-empty-hint',
        });
        if (!this.searchQuery) {
          const action = emptyEl.createEl('button', { text: 'Create Map', cls: 'mod-cta' });
          action.addEventListener('click', () => {
            this.close();
            new TemplatePickerModal(this.app, this.plugin, this.mapManager, false).open();
          });
        }
      }
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

    // Template badge
    if (map.isTemplate) {
      const badge = nameEl.createSpan({ cls: 'dnd-template-badge' });
      badge.setText('🏗️ TEMPLATE');
      badge.style.marginLeft = '8px';
      badge.style.fontSize = '10px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '4px';
      badge.style.backgroundColor = 'var(--interactive-accent)';
      badge.style.color = 'var(--text-on-accent)';
    }

    // Template tags preview
    if (map.isTemplate && map.templateTags) {
      const tagPreview = info.createDiv({ cls: 'dnd-map-manager-tags' });
      tagPreview.style.fontSize = '11px';
      tagPreview.style.color = 'var(--text-muted)';
      tagPreview.style.marginTop = '2px';
      const allTags = [
        ...map.templateTags.terrain.slice(0, 2),
        ...map.templateTags.climate.slice(0, 2),
        ...map.templateTags.location.slice(0, 2),
      ];
      if (allTags.length > 0) {
        tagPreview.setText(`Tags: ${allTags.join(', ')}${allTags.length >= 6 ? '…' : ''}`);
      }
    }

    if (!map.isTemplate && map.templateSourceId) {
      const sourceEl = info.createDiv({ cls: 'dnd-map-manager-template-source' });
      sourceEl.style.fontSize = '11px';
      sourceEl.style.color = 'var(--text-faint)';
      sourceEl.style.marginTop = '2px';
      sourceEl.setText(`Template: ${map.templateSourceName || map.templateSourceId}`);
    }

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

    // Template-specific actions
    if (map.isTemplate) {
      const tagBtn = actions.createEl('button', { text: '🏷️ Tags', attr: { title: 'Edit template tags' } });
      tagBtn.style.padding = '4px 10px';
      tagBtn.style.fontSize = '12px';
      tagBtn.style.borderRadius = '4px';
      tagBtn.style.cursor = 'pointer';
      tagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // If tags are missing, add defaults first then open editor
        if (!map.templateTags) {
          this.addMissingTags(map);
        } else {
          this.editTemplateTags(map);
        }
      });

      const unmarkBtn = actions.createEl('button', { text: '❌ Unmark', attr: { title: 'Remove template status' } });
      unmarkBtn.style.padding = '4px 10px';
      unmarkBtn.style.fontSize = '12px';
      unmarkBtn.style.borderRadius = '4px';
      unmarkBtn.style.cursor = 'pointer';
      unmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.unmarkAsTemplate(map);
      });
    }

    if (!map.isTemplate && map.templateSourceId) {
      const syncBtn = actions.createEl('button', {
        text: '🔄 Sync',
        attr: { title: 'Update walls, lighting, fog, terrain, and grid from the source template' },
      });
      syncBtn.style.padding = '4px 10px';
      syncBtn.style.fontSize = '12px';
      syncBtn.style.borderRadius = '4px';
      syncBtn.style.cursor = 'pointer';
      syncBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmSyncFromTemplate(map);
      });
    }

    if (!map.isTemplate && !map.templateSourceId) {
      const linkBtn = actions.createEl('button', {
        text: '🔗 Template',
        attr: { title: 'Link this map to a source template' },
      });
      linkBtn.style.padding = '4px 10px';
      linkBtn.style.fontSize = '12px';
      linkBtn.style.borderRadius = '4px';
      linkBtn.style.cursor = 'pointer';
      linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openLinkTemplateModal(map);
      });
    }

    // Duplicate button (for both)
    const dupBtn = actions.createEl('button', { text: '📄 Duplicate', attr: { title: 'Create a copy' } });
    dupBtn.style.padding = '4px 10px';
    dupBtn.style.fontSize = '12px';
    dupBtn.style.borderRadius = '4px';
    dupBtn.style.cursor = 'pointer';
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.duplicateMap(map, !!map.isTemplate);
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
      ...map,
      ...fullData,              // carry all stored fields as the source of truth
      mapId: fullData.mapId || map.mapId,
      id: fullData.mapId || map.mapId,
      name: fullData.name || map.name,
      imageFile: fullData.imageFile || map.imageFile,
      isVideo: fullData.isVideo ?? map.isVideo,
      type: fullData.type || map.type,
      gridType: fullData.gridType || map.gridType,
      gridSize: fullData.gridSize ?? map.gridSize,
      scale: fullData.scale || map.scale,
      dimensions: fullData.dimensions || map.dimensions,
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

      // Invalidate template index cache
      invalidateTemplateIndex();

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

  /**
   * Add missing default tags to a template that doesn't have them yet,
   * then open the tag editor.
   */
  private async addMissingTags(map: StoredMapInfo): Promise<void> {
    const fullData = await this.plugin.loadMapAnnotations(map.mapId);

    fullData.templateTags = createDefaultTemplateTags();

    await this.plugin.saveMapAnnotations(fullData, document.createElement('div'));

    map.templateTags = fullData.templateTags;

    new Notice(`✅ Default tags added to "${map.name}"`);

    // Open tag editor immediately
    this.editTemplateTags(map);
  }

  /**
   * Ensure a template note exists in z_BattlemapTemplates/ for this map.
   */
  private async ensureTemplateNote(map: StoredMapInfo): Promise<void> {
    const folder = BATTLEMAP_TEMPLATE_FOLDER;

    // Check if a note already references this mapId
    const existingNote = await this.findTemplateNote(map.mapId);
    if (existingNote) return; // Already has a note

    // Ensure folder exists
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }

    const safeName = (map.name || 'Template').replace(/[\\/:*?"<>|]/g, '_').trim();
    let notePath = `${folder}/${safeName}.md`;
    let counter = 1;
    while (await this.app.vault.adapter.exists(notePath)) {
      notePath = `${folder}/${safeName} (${counter}).md`;
      counter++;
    }

    const codeBlock = `\`\`\`dnd-map\n${JSON.stringify({ mapId: map.mapId }, null, 2)}\n\`\`\``;
    const content = `---\ntags:\n  - battlemap-template\ntemplate_name: "${map.name || 'Template'}"\n---\n# ${map.name || 'Template'}\n\n${codeBlock}\n`;
    await this.app.vault.create(notePath, content);
  }

  /**
   * Find an existing template note that references the given mapId.
   */
  private async findTemplateNote(mapId: string): Promise<TFile | null> {
    const folder = BATTLEMAP_TEMPLATE_FOLDER;
    if (!(await this.app.vault.adapter.exists(folder))) return null;

    const files = this.app.vault.getMarkdownFiles().filter(f =>
      f.path.startsWith(folder + '/')
    );

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        if (content.includes(`"mapId": "${mapId}"`)) {
          return file;
        }
      } catch { /* skip */ }
    }
    return null;
  }

  /**
   * Remove template status from a map.
   */
  private async unmarkAsTemplate(map: StoredMapInfo): Promise<void> {
    const fullData = await this.plugin.loadMapAnnotations(map.mapId);

    fullData.isTemplate = false;
    delete fullData.templateTags;

    await this.plugin.saveMapAnnotations(fullData, document.createElement('div'));

    map.isTemplate = false;
    delete map.templateTags;

    new Notice(`✅ "${map.name}" is no longer a template`);
    this.renderMapList();
  }

  /**
   * Confirm and then sync the active map from its source template.
   */
  private confirmSyncFromTemplate(map: StoredMapInfo): void {
    const confirmModal = new Modal(this.app);
    confirmModal.onOpen = () => {
      const { contentEl } = confirmModal;
      contentEl.empty();

      contentEl.createEl('h2', { text: '🔄 Sync from Template' });
      contentEl.createEl('p', {
        text: `Apply the latest template structure from "${map.templateSourceName || map.templateSourceId}" to "${map.name || 'Unnamed Map'}"?`,
      });
      contentEl.createEl('p', {
        text: 'This adds or updates template walls, lighting, fog of war, terrain, elevations, tunnels, and environment assets. Battlemap-added tokens, components, drawings, labels, highlights, POIs, and scene/encounter links stay on this map.',
        cls: 'setting-item-description',
      });

      const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
      btnContainer.style.display = 'flex';
      btnContainer.style.justifyContent = 'flex-end';
      btnContainer.style.gap = '10px';
      btnContainer.style.marginTop = '16px';

      const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
      cancelBtn.addEventListener('click', () => confirmModal.close());

      const syncBtn = btnContainer.createEl('button', { text: 'Sync Template Changes' });
      syncBtn.style.backgroundColor = 'var(--interactive-accent)';
      syncBtn.style.color = 'var(--text-on-accent)';
      syncBtn.style.borderRadius = '4px';
      syncBtn.addEventListener('click', async () => {
        await this.syncFromTemplate(map);
        confirmModal.close();
      });
    };
    confirmModal.open();
  }

  /**
   * Pull template-owned structural fields into an active map while preserving
   * instance-specific encounter content.
   */
  private async syncFromTemplate(map: StoredMapInfo): Promise<void> {
    if (!map.templateSourceId) {
      new Notice('This map is not linked to a template');
      return;
    }

    try {
      const [currentData, templateData] = await Promise.all([
        this.plugin.loadMapAnnotations(map.mapId),
        this.plugin.loadMapAnnotations(map.templateSourceId),
      ]);

      if (!templateData || !templateData.mapId || !templateData.isTemplate) {
        new Notice('Source template not found. The map may have been created before template sync was available.');
        return;
      }

      const changedFields = getTemplateSyncChangedFields(currentData, templateData);
      const syncedData = syncMapDataFromTemplate(currentData, templateData);
      await this.plugin.saveMapAnnotations(syncedData, document.createElement('div'));
      await _flushMapSave(this.plugin, syncedData.mapId);

      map.imageFile = syncedData.imageFile;
      map.isVideo = syncedData.isVideo;
      map.type = syncedData.type;
      map.gridType = syncedData.gridType;
      map.gridSize = syncedData.gridSize;
      map.scale = syncedData.scale;
      map.dimensions = syncedData.dimensions;
      map.lastModified = syncedData.lastModified;
      map.templateSourceName = syncedData.templateSourceName;
      map.templateSyncedAt = syncedData.templateSyncedAt;

      this.renderMapList();
      const refreshedViews = await this.refreshOpenMapViews(syncedData.mapId);
      if (changedFields.length === 0) {
        new Notice(`"${map.name || 'Map'}" is already up to date for template-owned fields. Tokens, drawings, labels, highlights, and POIs are preserved.`);
      } else {
        const summary = this.formatSyncFieldSummary(changedFields);
        new Notice(`✅ "${map.name || 'Map'}" synced: ${summary}${refreshedViews > 0 ? ` (${refreshedViews} open view${refreshedViews === 1 ? '' : 's'} refreshed)` : ''}`);
      }
    } catch (err) {
      console.error('[MapManager] Error syncing map from template:', err);
      new Notice('❌ Failed to sync map from template');
    }
  }

  private formatSyncFieldSummary(fields: TemplateStructuralField[]): string {
    const labels = Array.from(new Set(fields.map((field) => TEMPLATE_SYNC_FIELD_LABELS[field] || field)));
    if (labels.length <= 3) return labels.join(', ');
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`;
  }

  private async refreshOpenMapViews(mapId: string): Promise<number> {
    let refreshed = 0;
    const tasks: Promise<void>[] = [];

    for (const view of Array.from(this.plugin._gmMapViews || [])) {
      const gmView = view as any;
      if (gmView.getMapId?.() !== mapId || typeof gmView.reloadMapFromDisk !== 'function') continue;
      tasks.push(Promise.resolve(gmView.reloadMapFromDisk()).then(() => {
        refreshed++;
      }));
    }

    for (const view of Array.from(this.plugin._playerMapViews || [])) {
      const playerView = view as any;
      if (playerView.getMapId?.() !== mapId || typeof playerView.reloadMapDataFromDisk !== 'function') continue;
      tasks.push(Promise.resolve(playerView.reloadMapDataFromDisk()).then(() => {
        refreshed++;
      }));
    }

    if (tasks.length === 0) return 0;
    await Promise.allSettled(tasks);
    return refreshed;
  }

  /**
   * Let older active maps choose their source template so they can use sync.
   */
  private async openLinkTemplateModal(map: StoredMapInfo): Promise<void> {
    const templates = await this.plugin.queryMapTemplates({});
    if (templates.length === 0) {
      new Notice('No battlemap templates found');
      return;
    }

    let selectedTemplateId = templates[0]?.mapId || '';
    const linkModal = new Modal(this.app);
    linkModal.onOpen = () => {
      const { contentEl } = linkModal;
      contentEl.empty();

      contentEl.createEl('h2', { text: '🔗 Link Template' });
      contentEl.createEl('p', {
        text: `Choose the source template for "${map.name || 'Unnamed Map'}".`,
      });

      new Setting(contentEl)
        .setName('Source template')
        .setDesc('After linking, this map can sync future template changes.')
        .addDropdown(dropdown => {
          for (const tpl of templates) {
            dropdown.addOption(tpl.mapId, tpl.name || tpl.mapId);
          }
          dropdown
            .setValue(selectedTemplateId)
            .onChange(value => {
              selectedTemplateId = value;
            });
        });

      const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
      btnContainer.style.display = 'flex';
      btnContainer.style.justifyContent = 'flex-end';
      btnContainer.style.gap = '10px';
      btnContainer.style.marginTop = '16px';

      const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
      cancelBtn.addEventListener('click', () => linkModal.close());

      const linkOnlyBtn = btnContainer.createEl('button', { text: 'Link Only' });
      linkOnlyBtn.addEventListener('click', async () => {
        await this.linkMapToTemplate(map, selectedTemplateId, false);
        linkModal.close();
      });

      const linkAndSyncBtn = btnContainer.createEl('button', { text: 'Link and Sync' });
      linkAndSyncBtn.style.backgroundColor = 'var(--interactive-accent)';
      linkAndSyncBtn.style.color = 'var(--text-on-accent)';
      linkAndSyncBtn.style.borderRadius = '4px';
      linkAndSyncBtn.addEventListener('click', async () => {
        await this.linkMapToTemplate(map, selectedTemplateId, true);
        linkModal.close();
      });
    };
    linkModal.open();
  }

  /**
   * Store source-template metadata on an active map, optionally applying the
   * current template structure immediately.
   */
  private async linkMapToTemplate(map: StoredMapInfo, templateId: string, syncNow: boolean): Promise<void> {
    try {
      const [currentData, templateData] = await Promise.all([
        this.plugin.loadMapAnnotations(map.mapId),
        this.plugin.loadMapAnnotations(templateId),
      ]);

      if (!templateData || !templateData.mapId || !templateData.isTemplate) {
        new Notice('Selected template could not be loaded');
        return;
      }

      const changedFields = syncNow ? getTemplateSyncChangedFields(currentData, templateData) : [];
      const nextData = syncNow
        ? syncMapDataFromTemplate(currentData, templateData)
        : {
            ...currentData,
            templateSourceId: templateData.mapId,
            templateSourceName: templateData.name || '',
            templateSyncedAt: '',
            lastModified: new Date().toISOString(),
          };

      await this.plugin.saveMapAnnotations(nextData, document.createElement('div'));
      await _flushMapSave(this.plugin, nextData.mapId);

      map.templateSourceId = nextData.templateSourceId;
      map.templateSourceName = nextData.templateSourceName;
      map.templateSyncedAt = nextData.templateSyncedAt;
      map.lastModified = nextData.lastModified;
      if (syncNow) {
        map.imageFile = nextData.imageFile;
        map.isVideo = nextData.isVideo;
        map.type = nextData.type;
        map.gridType = nextData.gridType;
        map.gridSize = nextData.gridSize;
        map.scale = nextData.scale;
        map.dimensions = nextData.dimensions;
      }

      this.renderMapList();
      const refreshedViews = await this.refreshOpenMapViews(nextData.mapId);
      new Notice(syncNow
        ? `✅ "${map.name || 'Map'}" linked and synced${changedFields.length > 0 ? `: ${this.formatSyncFieldSummary(changedFields)}` : ''}${refreshedViews > 0 ? ` (${refreshedViews} open view${refreshedViews === 1 ? '' : 's'} refreshed)` : ''}`
        : `✅ "${map.name || 'Map'}" linked to template${refreshedViews > 0 ? ` (${refreshedViews} open view${refreshedViews === 1 ? '' : 's'} refreshed)` : ''}`);
    } catch (err) {
      console.error('[MapManager] Error linking map to template:', err);
      new Notice('❌ Failed to link template');
    }
  }

  /**
   * Open the template tag editor modal.
   */
  private editTemplateTags(map: StoredMapInfo): void {
    new MapTemplateTagModal(
      this.app,
      this.plugin,
      map.mapId,
      map.name,
      map.templateTags,
      async (newTags) => {
        const fullData = await this.plugin.loadMapAnnotations(map.mapId);
        fullData.templateTags = newTags;
        await this.plugin.saveMapAnnotations(fullData, document.createElement('div'));

        map.templateTags = newTags;
        this.renderMapList();
      },
    ).open();
  }

  /**
   * Duplicate a map. If duplicating a template, strips tokens/markers
   * but preserves walls, lights, fog of war — creating a clean copy.
   */
  private async duplicateMap(map: StoredMapInfo, asCleanTemplate: boolean): Promise<void> {
    try {
      const fullData = await this.plugin.loadMapAnnotations(map.mapId);

      const newId = this.mapManager.generateMapId();
      const newName = `${map.name} (Copy)`;

      const newData = {
        ...fullData,
        mapId: newId,
        name: newName,
        lastModified: new Date().toISOString(),
      };

      // If duplicating a template, strip tokens but keep structural elements
      if (asCleanTemplate) {
        newData.markers = [];
        newData.isTemplate = true;
        newData.templateTags = fullData.templateTags || createDefaultTemplateTags();
      }

      await this.plugin.saveMapAnnotations(newData, document.createElement('div'));

      // Reload and refresh
      await this.loadMaps();
      this.renderMapList();

      new Notice(`✅ Duplicated as "${newName}"`);
    } catch (err) {
      console.error('[MapManager] Error duplicating map:', err);
      new Notice('❌ Failed to duplicate map');
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
