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
import type { MapTemplateTags } from './types';

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

  // ── Rendering ──────────────────────────────────────────────────────

  private renderTemplateGrid(): void {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.loading) {
      this.listContainer.createDiv({ text: '⌛ Loading templates…' });
      return;
    }

    // Filter
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

    if (filtered.length === 0) {
      const emptyEl = this.listContainer.createDiv();
      emptyEl.style.padding = '32px';
      emptyEl.style.textAlign = 'center';
      emptyEl.style.color = 'var(--text-muted)';
      if (this.templates.length === 0) {
        emptyEl.setText('No templates found. Create a template first using the ➕ New Template button or the "Create Battlemap Template" command.');
      } else {
        emptyEl.setText('No templates match your search.');
      }
      return;
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

      // Deep-copy ALL annotation data from the template
      const fullConfig: any = {
        // Map identity – new
        mapId: newId,
        name: this.mapName.trim(),

        // Map settings – from template
        imageFile: templateData.imageFile,
        isVideo: templateData.isVideo || false,
        type: 'battlemap',
        dimensions: templateData.dimensions || {},
        gridType: templateData.gridType || 'square',
        gridSize: templateData.gridSize || 70,
        gridOffsetX: templateData.gridOffsetX || 0,
        gridOffsetY: templateData.gridOffsetY || 0,
        gridSizeW: templateData.gridSizeW || undefined,
        gridSizeH: templateData.gridSizeH || undefined,
        gridVisible: templateData.gridVisible !== undefined ? templateData.gridVisible : true,
        scale: templateData.scale || { value: 5, unit: 'feet' },

        // Structural annotations – FULLY COPIED from template
        walls: JSON.parse(JSON.stringify(templateData.walls || [])),
        lightSources: JSON.parse(JSON.stringify(templateData.lightSources || [])),
        fogOfWar: JSON.parse(JSON.stringify(templateData.fogOfWar || { enabled: false, regions: [] })),
        drawings: JSON.parse(JSON.stringify(templateData.drawings || [])),
        tileElevations: JSON.parse(JSON.stringify(templateData.tileElevations || {})),
        tunnels: JSON.parse(JSON.stringify(templateData.tunnels || [])),

        // Markers (furniture, traps, etc.) – FULLY COPIED from template
        markers: JSON.parse(JSON.stringify(templateData.markers || [])),

        // Highlights – fresh (template highlights are for template use)
        highlights: [],

        // Not a template
        isTemplate: false,
        templateTags: undefined,

        // Empty for new map
        linkedEncounter: '',
        linkedScene: '',
        activeLayer: 'Player',

        lastModified: new Date().toISOString(),
      };

      // Re-generate marker instance IDs so they're unique
      for (const marker of fullConfig.markers) {
        marker.id = `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

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
