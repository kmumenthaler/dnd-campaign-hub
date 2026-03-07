/**
 * Template Picker Modal
 *
 * Opened when the GM wants to create a new battlemap.
 * Shows all available templates (isTemplate === true) in a browsable grid.
 * The GM selects a template and provides a map name, then a full copy of
 * the template's annotation data is created as a new active battlemap.
 *
 * ALL data is copied from the template – walls, fog, drawings, markers
 * (furniture/traps), light sources, tile elevations, tunnels, etc.
 */

import { App, Modal, Notice, TFile, Setting } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import { MapManager } from './MapManager';
import { cloneTemplateToMap } from './MapFactory';
import type { MapTemplateTags } from './types';
import { LOCATION_TYPES } from './types';
import { TERRAIN_DEFINITIONS, CLIMATE_DEFINITIONS } from '../hexcrawl/types';
import { invalidateTemplateIndex } from './MapPersistence';

/** Lightweight info about a template returned by queryMapTemplates */
interface TemplateInfo {
  mapId: string;
  name: string;
  imageFile: string;
  tags: MapTemplateTags;
  matchScore: number;
}

/**
 * Modal that lists all battlemap templates and lets the GM create
 * a new battlemap by fully copying a template.
 */
export class TemplatePickerModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private mapManager: MapManager;
  /** If true the resulting code block is inserted at the cursor in the active note */
  private insertCodeBlock: boolean;

  // UI state
  private templates: TemplateInfo[] = [];
  private selectedTemplateId: string | null = null;
  private mapName = '';
  private searchQuery = '';
  private loading = true;
  private listContainer: HTMLElement | null = null;
  private filterBarContainer: HTMLElement | null = null;
  private activeFilters: { terrain: Set<string>; climate: Set<string>; location: Set<string> } = {
    terrain: new Set(), climate: new Set(), location: new Set(),
  };

  constructor(
    app: App,
    plugin: DndCampaignHubPlugin,
    mapManager: MapManager,
    insertCodeBlock = true,
  ) {
    super(app);
    this.plugin = plugin;
    this.mapManager = mapManager;
    this.insertCodeBlock = insertCodeBlock;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-template-picker-modal');
    this.modalEl.style.width = '720px';
    this.modalEl.style.maxWidth = '90vw';

    contentEl.createEl('h2', { text: '🏗️ Create Battle Map from Template' });

    // Search
    const topBar = contentEl.createDiv({ cls: 'dnd-tp-topbar' });
    topBar.style.display = 'flex';
    topBar.style.gap = '10px';
    topBar.style.alignItems = 'center';
    topBar.style.marginBottom = '14px';

    const searchInput = topBar.createEl('input', {
      type: 'text',
      placeholder: '🔍 Search templates by name or tag…',
    });
    searchInput.style.flex = '1';
    searchInput.style.padding = '8px 12px';
    searchInput.style.borderRadius = '6px';
    searchInput.style.border = '1px solid var(--background-modifier-border)';
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderTemplateGrid();
    });

    // Create template shortcut
    const newTplBtn = topBar.createEl('button', { text: '➕ New Template' });
    newTplBtn.style.padding = '8px 14px';
    newTplBtn.style.borderRadius = '6px';
    newTplBtn.style.cursor = 'pointer';
    newTplBtn.style.whiteSpace = 'nowrap';
    newTplBtn.style.border = '1px solid var(--background-modifier-border)';
    newTplBtn.addEventListener('click', () => {
      this.close();
      // Trigger the create-template command
      (this.app as any).commands.executeCommandById(`${this.plugin.manifest.id}:create-battlemap-template`);
    });

    // Refresh button – forces a rebuild of the template index
    const refreshBtn = topBar.createEl('button', { text: '🔄' });
    refreshBtn.title = 'Refresh template list';
    refreshBtn.style.padding = '8px 10px';
    refreshBtn.style.borderRadius = '6px';
    refreshBtn.style.cursor = 'pointer';
    refreshBtn.style.border = '1px solid var(--background-modifier-border)';
    refreshBtn.addEventListener('click', async () => {
      invalidateTemplateIndex();
      await this.loadTemplates();
      this.renderFilterBar();
      this.renderTemplateGrid();
      new Notice('Template list refreshed');
    });

    // Tag filter bar (populated after templates load)
    this.filterBarContainer = contentEl.createDiv({ cls: 'dnd-tp-filter-bar' });
    this.filterBarContainer.style.marginBottom = '10px';

    // Template grid container
    this.listContainer = contentEl.createDiv({ cls: 'dnd-tp-grid-container' });
    this.listContainer.style.maxHeight = '400px';
    this.listContainer.style.overflowY = 'auto';
    this.listContainer.style.border = '1px solid var(--background-modifier-border)';
    this.listContainer.style.borderRadius = '8px';
    this.listContainer.style.padding = '12px';

    // Map name
    const nameSection = contentEl.createDiv({ cls: 'dnd-tp-name-section' });
    nameSection.style.marginTop = '16px';
    new Setting(nameSection)
      .setName('Battle map name')
      .setDesc('Name for the new battlemap instance')
      .addText(text => {
        text
          .setPlaceholder('Tavern Brawl at Hex 3,4')
          .setValue(this.mapName)
          .onChange(v => { this.mapName = v; });
        text.inputEl.style.width = '100%';
      });

    // Buttons
    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '16px';

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const createBtn = btnRow.createEl('button', { text: '⚔️ Create Battle Map' });
    createBtn.style.backgroundColor = 'var(--interactive-accent)';
    createBtn.style.color = 'var(--text-on-accent)';
    createBtn.style.borderRadius = '6px';
    createBtn.onclick = () => this.createBattlemapFromTemplate();

    // Load templates
    await this.loadTemplates();
    this.renderFilterBar();
    this.renderTemplateGrid();
    setTimeout(() => searchInput.focus(), 50);
  }

  // ── Data loading ───────────────────────────────────────────────────

  private async loadTemplates(): Promise<void> {
    this.loading = true;
    try {
      // Load ALL templates (no criteria filter – show everything)
      this.templates = await this.plugin.queryMapTemplates({});
    } catch {
      this.templates = [];
    }
    this.loading = false;
  }

  // ── Filter bar ──────────────────────────────────────────────────────

  /**
   * Collect the distinct tags actually used by loaded templates, then
   * render one row of toggle-chips per category (terrain / climate / location).
   * Clicking a chip toggles it in `activeFilters` and re-renders the grid.
   */
  private renderFilterBar(): void {
    if (!this.filterBarContainer) return;
    this.filterBarContainer.empty();

    // Collect unique tag IDs actually present in the loaded templates
    const usedTerrain = new Set<string>();
    const usedClimate = new Set<string>();
    const usedLocation = new Set<string>();
    for (const t of this.templates) {
      if (!t.tags) continue;
      for (const v of t.tags.terrain ?? []) usedTerrain.add(v);
      for (const v of t.tags.climate ?? []) usedClimate.add(v);
      for (const v of t.tags.location ?? []) usedLocation.add(v);
    }

    // Nothing to filter
    if (usedTerrain.size + usedClimate.size + usedLocation.size === 0) return;

    // Lookup helpers
    const terrainLookup = new Map(TERRAIN_DEFINITIONS.map(d => [d.id, d]));
    const climateLookup = new Map(CLIMATE_DEFINITIONS.map(d => [d.id, d]));
    const locationLookup = new Map(LOCATION_TYPES.map(d => [d.id, d]));

    const totalActive =
      this.activeFilters.terrain.size +
      this.activeFilters.climate.size +
      this.activeFilters.location.size;

    // Header row with "Clear" button
    if (totalActive > 0) {
      const headerRow = this.filterBarContainer.createDiv({ cls: 'dnd-tp-filter-header' });
      headerRow.style.display = 'flex';
      headerRow.style.justifyContent = 'space-between';
      headerRow.style.alignItems = 'center';
      headerRow.style.marginBottom = '4px';

      const badge = headerRow.createSpan();
      badge.style.fontSize = '11px';
      badge.style.color = 'var(--text-muted)';
      badge.setText(`${totalActive} filter${totalActive > 1 ? 's' : ''} active`);

      const clearBtn = headerRow.createEl('button', { text: '✕ Clear filters' });
      clearBtn.style.fontSize = '11px';
      clearBtn.style.padding = '2px 8px';
      clearBtn.style.borderRadius = '4px';
      clearBtn.style.cursor = 'pointer';
      clearBtn.style.border = '1px solid var(--background-modifier-border)';
      clearBtn.style.background = 'transparent';
      clearBtn.style.color = 'var(--text-muted)';
      clearBtn.addEventListener('click', () => {
        this.activeFilters.terrain.clear();
        this.activeFilters.climate.clear();
        this.activeFilters.location.clear();
        this.renderFilterBar();
        this.renderTemplateGrid();
      });
    }

    // Render a row of chips for a single category
    const renderCategory = (
      label: string,
      ids: Set<string>,
      lookup: Map<string, { id: string; name?: string; label?: string; icon: string }>,
      activeSet: Set<string>,
    ) => {
      if (ids.size === 0) return;
      const row = this.filterBarContainer!.createDiv({ cls: 'dnd-tp-filter-row' });
      row.style.display = 'flex';
      row.style.flexWrap = 'wrap';
      row.style.gap = '4px';
      row.style.alignItems = 'center';
      row.style.marginBottom = '4px';

      const rowLabel = row.createSpan({ cls: 'dnd-tp-filter-label' });
      rowLabel.style.fontSize = '11px';
      rowLabel.style.fontWeight = '600';
      rowLabel.style.color = 'var(--text-muted)';
      rowLabel.style.marginRight = '4px';
      rowLabel.style.whiteSpace = 'nowrap';
      rowLabel.setText(label);

      // Sort chips alphabetically by display name
      const sorted = [...ids].sort((a, b) => {
        const la = lookup.get(a);
        const lb = lookup.get(b);
        return ((la?.name ?? la?.label ?? a).localeCompare(lb?.name ?? lb?.label ?? b));
      });

      for (const id of sorted) {
        const def = lookup.get(id);
        const displayName = def ? (def.name ?? (def as any).label ?? id) : id;
        const icon = def?.icon ?? '';
        const active = activeSet.has(id);

        const chip = row.createEl('button', { cls: 'dnd-tp-filter-chip' });
        chip.setText(`${icon} ${displayName}`);
        chip.style.fontSize = '11px';
        chip.style.padding = '2px 8px';
        chip.style.borderRadius = '12px';
        chip.style.cursor = 'pointer';
        chip.style.border = active
          ? '1px solid var(--interactive-accent)'
          : '1px solid var(--background-modifier-border)';
        chip.style.background = active
          ? 'var(--interactive-accent)'
          : 'var(--background-secondary)';
        chip.style.color = active
          ? 'var(--text-on-accent)'
          : 'var(--text-normal)';
        chip.style.transition = 'all 0.12s';

        chip.addEventListener('click', () => {
          if (activeSet.has(id)) activeSet.delete(id);
          else activeSet.add(id);
          this.renderFilterBar();
          this.renderTemplateGrid();
        });
      }
    };

    renderCategory('Terrain', usedTerrain, terrainLookup as any, this.activeFilters.terrain);
    renderCategory('Climate', usedClimate, climateLookup as any, this.activeFilters.climate);
    renderCategory('Location', usedLocation, locationLookup as any, this.activeFilters.location);
  }

  // ── Rendering ──────────────────────────────────────────────────────

  private renderTemplateGrid(): void {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.loading) {
      this.listContainer.createDiv({ text: '⌛ Loading templates…' });
      return;
    }

    // Filter by text search
    let filtered = this.templates;
    if (this.searchQuery) {
      const terms = this.searchQuery.split(/\s+/);
      filtered = filtered.filter(t => {
        const haystack = [
          t.name,
          ...(t.tags?.terrain || []),
          ...(t.tags?.climate || []),
          ...(t.tags?.location || []),
          ...(t.tags?.custom || []),
        ].join(' ').toLowerCase();
        return terms.every(term => haystack.includes(term));
      });
    }

    // Filter by active tag chips (OR within category, AND across categories)
    const { terrain, climate, location } = this.activeFilters;
    if (terrain.size > 0) {
      filtered = filtered.filter(t =>
        (t.tags?.terrain ?? []).some(v => terrain.has(v)),
      );
    }
    if (climate.size > 0) {
      filtered = filtered.filter(t =>
        (t.tags?.climate ?? []).some(v => climate.has(v)),
      );
    }
    if (location.size > 0) {
      filtered = filtered.filter(t =>
        (t.tags?.location ?? []).some(v => location.has(v)),
      );
    }

    if (filtered.length === 0) {
      const emptyEl = this.listContainer.createDiv();
      emptyEl.style.padding = '32px';
      emptyEl.style.textAlign = 'center';
      emptyEl.style.color = 'var(--text-muted)';
      if (this.templates.length === 0) {
        emptyEl.setText('No templates found. Create a template first using the ➕ New Template button or the "Create Battlemap Template" command.');
      } else {
        emptyEl.setText('No templates match your search / filters.');
      }
      return;
    }

    // Result count badge
    if (filtered.length < this.templates.length) {
      const countBadge = this.listContainer.createDiv();
      countBadge.style.fontSize = '11px';
      countBadge.style.color = 'var(--text-muted)';
      countBadge.style.marginBottom = '8px';
      countBadge.setText(`Showing ${filtered.length} of ${this.templates.length} templates`);
    }

    // Grid
    const grid = this.listContainer.createDiv({ cls: 'dnd-tp-grid' });
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    grid.style.gap = '12px';

    for (const tpl of filtered) {
      this.renderTemplateCard(grid, tpl);
    }
  }

  private renderTemplateCard(container: HTMLElement, tpl: TemplateInfo): void {
    const isSelected = this.selectedTemplateId === tpl.mapId;
    const card = container.createDiv({ cls: 'dnd-tp-card' });
    card.style.border = isSelected
      ? '2px solid var(--interactive-accent)'
      : '1px solid var(--background-modifier-border)';
    card.style.borderRadius = '8px';
    card.style.overflow = 'hidden';
    card.style.cursor = 'pointer';
    card.style.transition = 'border-color 0.15s, box-shadow 0.15s';
    if (isSelected) {
      card.style.boxShadow = '0 0 0 2px var(--interactive-accent-hover)';
    }

    // Thumbnail
    const thumb = card.createDiv({ cls: 'dnd-tp-thumb' });
    thumb.style.height = '120px';
    thumb.style.backgroundColor = 'var(--background-secondary)';
    thumb.style.display = 'flex';
    thumb.style.alignItems = 'center';
    thumb.style.justifyContent = 'center';
    thumb.style.overflow = 'hidden';

    const imgFile = this.app.vault.getAbstractFileByPath(tpl.imageFile);
    if (imgFile instanceof TFile) {
      const img = thumb.createEl('img');
      img.src = this.app.vault.getResourcePath(imgFile);
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
    } else {
      thumb.createSpan({ text: '🗺️' });
      thumb.style.fontSize = '32px';
    }

    // Info
    const info = card.createDiv({ cls: 'dnd-tp-info' });
    info.style.padding = '8px 10px';

    const nameEl = info.createDiv({ cls: 'dnd-tp-name' });
    nameEl.style.fontWeight = '600';
    nameEl.style.fontSize = '13px';
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.setText(tpl.name || 'Unnamed Template');

    // Tags preview
    if (tpl.tags) {
      const tagEl = info.createDiv({ cls: 'dnd-tp-tags' });
      tagEl.style.fontSize = '11px';
      tagEl.style.color = 'var(--text-muted)';
      tagEl.style.marginTop = '2px';
      const allTags = [
        ...(tpl.tags.terrain || []).slice(0, 2),
        ...(tpl.tags.climate || []).slice(0, 2),
        ...(tpl.tags.location || []).slice(0, 2),
      ];
      if (allTags.length > 0) {
        tagEl.setText(allTags.join(', '));
      }
    }

    // Click to select
    card.addEventListener('click', () => {
      this.selectedTemplateId = tpl.mapId;
      // Auto-fill map name from template name if empty
      if (!this.mapName.trim()) {
        this.mapName = `${tpl.name}`;
        const nameInput = this.contentEl.querySelector('input[type="text"]') as HTMLInputElement;
        if (nameInput) nameInput.value = this.mapName;
      }
      this.renderTemplateGrid();
    });

    // Hover
    card.addEventListener('mouseenter', () => {
      if (!isSelected) card.style.borderColor = 'var(--interactive-accent-hover)';
    });
    card.addEventListener('mouseleave', () => {
      if (!isSelected) card.style.borderColor = 'var(--background-modifier-border)';
    });
  }

  // ── Creation ───────────────────────────────────────────────────────

  private async createBattlemapFromTemplate(): Promise<void> {
    if (!this.selectedTemplateId) {
      new Notice('Please select a template');
      return;
    }
    if (!this.mapName.trim()) {
      new Notice('Please enter a map name');
      return;
    }

    try {
      // Load the full template data
      const templateData = await this.plugin.loadMapAnnotations(this.selectedTemplateId);
      if (!templateData || !templateData.mapId) {
        new Notice('Failed to load template data');
        return;
      }

      const newId = this.mapManager.generateMapId();

      // Deep-clone template into a new active battlemap
      const fullConfig = cloneTemplateToMap(templateData, newId, this.mapName.trim());

      // Save the new map
      await this.plugin.saveMapAnnotations(fullConfig, document.createElement('div'));

      // Insert code block into active note if requested
      if (this.insertCodeBlock) {
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
          const codeBlock = this.mapManager.generateMapCodeBlock({
            id: newId,
            name: this.mapName.trim(),
            imageFile: fullConfig.imageFile,
            type: 'battlemap',
            gridType: fullConfig.gridType,
            gridSize: fullConfig.gridSize,
            scale: fullConfig.scale,
            dimensions: fullConfig.dimensions,
            tokens: [],
            createdDate: new Date().toISOString(),
            lastModified: new Date().toISOString(),
          });
          editor.replaceSelection(`\n${codeBlock}\n`);
          new Notice(`✅ Battle map "${this.mapName}" created from template`);
        } else {
          new Notice(`✅ Map "${this.mapName}" created (open a note to insert the code block)`);
        }
      } else {
        new Notice(`✅ Battle map "${this.mapName}" created from template`);
      }

      this.close();
    } catch (err) {
      console.error('[TemplatePickerModal] Error creating battlemap from template:', err);
      new Notice('❌ Failed to create battlemap from template');
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
