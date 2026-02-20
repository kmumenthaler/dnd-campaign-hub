/**
 * MapTemplateTagModal
 *
 * Modal for editing the tags on a map template. Provides chip-based
 * selectors for terrain, climate, location, time-of-day, size, and
 * custom user-defined tags.
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import {
  MapTemplateTags,
  LOCATION_TYPES,
  createDefaultTemplateTags,
  TimeOfDayTag,
  MapSizeTag,
} from './types';
import { TERRAIN_DEFINITIONS, CLIMATE_DEFINITIONS } from '../hexcrawl/types';
import type { TerrainType, ClimateType } from '../hexcrawl/types';

export class MapTemplateTagModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private mapId: string;
  private mapName: string;
  private tags: MapTemplateTags;
  private onSave: (tags: MapTemplateTags) => Promise<void>;

  constructor(
    app: App,
    plugin: DndCampaignHubPlugin,
    mapId: string,
    mapName: string,
    existingTags: MapTemplateTags | undefined,
    onSave: (tags: MapTemplateTags) => Promise<void>,
  ) {
    super(app);
    this.plugin = plugin;
    this.mapId = mapId;
    this.mapName = mapName;
    this.tags = existingTags ? JSON.parse(JSON.stringify(existingTags)) : createDefaultTemplateTags();
    this.onSave = onSave;
  }

  onOpen() {
    this.render();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-template-tag-modal');

    contentEl.createEl('h2', { text: `🏷️ Template Tags — ${this.mapName}` });
    contentEl.createEl('p', {
      text: 'Select tags to describe what environments and settings this map is suited for. These tags are used to suggest matching templates during wilderness encounters.',
      cls: 'setting-item-description',
    });

    // ── Terrain Tags ──────────────────────────────────────────────
    this.renderChipSection(contentEl, {
      title: '🌍 Terrain',
      description: 'Which terrain types does this map work with?',
      items: TERRAIN_DEFINITIONS.map(t => ({
        id: t.id,
        label: `${t.icon} ${t.name}`,
      })),
      selected: this.tags.terrain as string[],
      onToggle: (id) => this.toggleArrayItem(this.tags.terrain as string[], id),
    });

    // ── Climate Tags ──────────────────────────────────────────────
    this.renderChipSection(contentEl, {
      title: '🌡️ Climate',
      description: 'Which climate zones does this map fit?',
      items: CLIMATE_DEFINITIONS.map(c => ({
        id: c.id,
        label: `${c.icon} ${c.name}`,
      })),
      selected: this.tags.climate as string[],
      onToggle: (id) => this.toggleArrayItem(this.tags.climate as string[], id),
    });

    // ── Location Tags ─────────────────────────────────────────────
    this.renderChipSection(contentEl, {
      title: '📍 Location Type',
      description: 'What kind of location does this map depict?',
      items: LOCATION_TYPES.map(l => ({
        id: l.id,
        label: `${l.icon} ${l.label}`,
      })),
      selected: this.tags.location,
      onToggle: (id) => this.toggleArrayItem(this.tags.location, id),
      allowCustom: true,
      customPlaceholder: 'Add custom location…',
      onAddCustom: (value) => {
        const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
        if (normalized && !this.tags.location.includes(normalized)) {
          this.tags.location.push(normalized);
          this.render();
        }
      },
    });

    // ── Time of Day ───────────────────────────────────────────────
    const timeOptions: Array<{ id: string; label: string }> = [
      { id: 'day',   label: '☀️ Day' },
      { id: 'night', label: '🌙 Night' },
      { id: 'any',   label: '🔄 Any' },
    ];
    this.renderChipSection(contentEl, {
      title: '🕐 Time of Day',
      description: 'When is this map most suitable?',
      items: timeOptions,
      selected: this.tags.timeOfDay as string[],
      onToggle: (id) => this.toggleArrayItem(this.tags.timeOfDay as string[], id),
    });

    // ── Map Size Category ─────────────────────────────────────────
    const sizeOptions: Array<{ id: string; label: string }> = [
      { id: 'small',  label: '📐 Small (< 30×30)' },
      { id: 'medium', label: '📏 Medium (30–60)' },
      { id: 'large',  label: '📐 Large (60+)' },
    ];
    this.renderChipSection(contentEl, {
      title: '📐 Map Size',
      description: 'General size category of this map.',
      items: sizeOptions,
      selected: this.tags.size as string[],
      onToggle: (id) => this.toggleArrayItem(this.tags.size as string[], id),
    });

    // ── Custom Tags ───────────────────────────────────────────────
    const customSection = contentEl.createDiv({ cls: 'dnd-tag-section' });
    customSection.createEl('h4', { text: '🏷️ Custom Tags' });
    customSection.createEl('p', {
      text: 'Add your own tags for additional categorization.',
      cls: 'setting-item-description',
    });

    const customChips = customSection.createDiv({ cls: 'dnd-tag-chips' });
    for (const tag of this.tags.custom) {
      const chip = customChips.createDiv({ cls: 'dnd-tag-chip selected removable' });
      chip.createSpan({ text: tag });
      const removeBtn = chip.createEl('button', { text: '×', cls: 'dnd-tag-chip-remove' });
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tags.custom = this.tags.custom.filter(t => t !== tag);
        this.render();
      });
    }

    // Add custom tag input
    const addRow = customSection.createDiv({ cls: 'dnd-tag-add-row' });
    const input = addRow.createEl('input', {
      type: 'text',
      placeholder: 'Add custom tag…',
      cls: 'dnd-tag-input',
    });
    const addBtn = addRow.createEl('button', { text: '+ Add', cls: 'dnd-tag-add-btn' });
    const addCustom = () => {
      const val = input.value.trim();
      if (val && !this.tags.custom.includes(val)) {
        this.tags.custom.push(val);
        this.render();
      }
    };
    addBtn.addEventListener('click', addCustom);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustom();
      }
    });

    // ── Summary ───────────────────────────────────────────────────
    const summarySection = contentEl.createDiv({ cls: 'dnd-tag-section' });
    summarySection.style.borderBottom = 'none';
    const totalTags =
      this.tags.terrain.length +
      this.tags.climate.length +
      this.tags.location.length +
      this.tags.timeOfDay.length +
      this.tags.size.length +
      this.tags.custom.length;
    summarySection.createEl('p', {
      text: `${totalTags} tag${totalTags !== 1 ? 's' : ''} selected`,
      cls: 'setting-item-description',
    });

    // ── Save / Cancel Buttons ─────────────────────────────────────
    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '16px';

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = btnRow.createEl('button', { text: '💾 Save Tags' });
    saveBtn.style.backgroundColor = 'var(--interactive-accent)';
    saveBtn.style.color = 'var(--text-on-accent)';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.padding = '8px 16px';
    saveBtn.addEventListener('click', async () => {
      await this.onSave(this.tags);
      new Notice(`✅ Tags saved for "${this.mapName}"`);
      this.close();
    });
  }

  /**
   * Render a chip-based multi-select section.
   */
  private renderChipSection(
    container: HTMLElement,
    opts: {
      title: string;
      description: string;
      items: Array<{ id: string; label: string }>;
      selected: string[];
      onToggle: (id: string) => void;
      allowCustom?: boolean;
      customPlaceholder?: string;
      onAddCustom?: (value: string) => void;
    },
  ) {
    const section = container.createDiv({ cls: 'dnd-tag-section' });
    section.createEl('h4', { text: opts.title });
    section.createEl('p', { text: opts.description, cls: 'setting-item-description' });

    const chips = section.createDiv({ cls: 'dnd-tag-chips' });
    for (const item of opts.items) {
      const isSelected = opts.selected.includes(item.id);
      const chip = chips.createDiv({
        cls: `dnd-tag-chip ${isSelected ? 'selected' : ''}`,
      });
      chip.setText(item.label);
      chip.addEventListener('click', () => {
        opts.onToggle(item.id);
        this.render();
      });
    }

    // Show any custom entries in the selected array that aren't in items
    const knownIds = new Set(opts.items.map(i => i.id));
    const customEntries = opts.selected.filter(s => !knownIds.has(s));
    for (const custom of customEntries) {
      const chip = chips.createDiv({ cls: 'dnd-tag-chip selected removable' });
      chip.createSpan({ text: custom });
      const removeBtn = chip.createEl('button', { text: '×', cls: 'dnd-tag-chip-remove' });
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = opts.selected.indexOf(custom);
        if (idx >= 0) opts.selected.splice(idx, 1);
        this.render();
      });
    }

    // Custom tag input (optional)
    if (opts.allowCustom && opts.onAddCustom) {
      const addRow = section.createDiv({ cls: 'dnd-tag-add-row' });
      const input = addRow.createEl('input', {
        type: 'text',
        placeholder: opts.customPlaceholder || 'Add custom…',
        cls: 'dnd-tag-input',
      });
      const addBtn = addRow.createEl('button', { text: '+ Add', cls: 'dnd-tag-add-btn' });
      const doAdd = () => {
        const val = input.value.trim();
        if (val) {
          opts.onAddCustom!(val);
          input.value = '';
        }
      };
      addBtn.addEventListener('click', doAdd);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doAdd();
        }
      });
    }
  }

  /**
   * Toggle an item in an array (add if missing, remove if present).
   */
  private toggleArrayItem(arr: string[], item: string) {
    const idx = arr.indexOf(item);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(item);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
