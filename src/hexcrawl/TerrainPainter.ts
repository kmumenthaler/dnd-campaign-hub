/**
 * Terrain Painting System
 * 
 * Provides the terrain type picker UI (a compact dropdown in the toolbar)
 * and helper functions for painting terrain onto hex cells.
 * Terrain data is stored as HexTerrain[] in the map annotation JSON
 * alongside highlights, PoIs, etc.
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import {
  TerrainType,
  TerrainDefinition,
  TERRAIN_DEFINITIONS,
  HexTerrain,
  getTerrainDefinition,
  ClimateType,
  ClimateDefinition,
  CLIMATE_DEFINITIONS,
  getClimateDefinition,
  HexClimate,
  DescriptionLanguage,
  DESCRIPTION_LANGUAGES,
} from './types';
import { hLoc } from './HexcrawlLocale';

// ─── Barrel Export ─────────────────────────────────────────────────────────

export { TerrainType, HexTerrain, TERRAIN_DEFINITIONS, getTerrainDefinition };
export { ClimateType, HexClimate, CLIMATE_DEFINITIONS, getClimateDefinition };

// ─── Terrain Picker (inline toolbar widget) ────────────────────────────────

/**
 * Build the terrain picker dropdown inside the map toolbar.
 * Returns an object with the container element and the currently selected terrain ID.
 */
export interface TerrainPickerState {
  container: HTMLElement;
  getSelected: () => TerrainType;
  setSelected: (id: TerrainType) => void;
}

export function buildTerrainPicker(
  parent: HTMLElement,
  initialTerrain: TerrainType = 'plains',
  onChange?: (terrain: TerrainType) => void,
  lang: DescriptionLanguage = 'en',
): TerrainPickerState {
  let selected: TerrainType = initialTerrain;

  const container = parent.createDiv({ cls: 'hexcrawl-terrain-picker' });
  container.createEl('div', { text: hLoc(lang, 'toolTerrainPaint'), cls: 'hexcrawl-picker-label' });

  const grid = container.createDiv({ cls: 'hexcrawl-terrain-grid' });

  const buttons: Map<TerrainType, HTMLButtonElement> = new Map();

  for (const def of TERRAIN_DEFINITIONS) {
    const tName = hLoc(lang, `terrain.${def.id}`);
    const btn = grid.createEl('button', {
      cls: `hexcrawl-terrain-btn ${def.id === selected ? 'active' : ''}`,
      attr: { 'aria-label': tName, title: `${tName} — Speed ×${def.travelModifier}` },
    });
    btn.createEl('span', { text: def.icon, cls: 'hexcrawl-terrain-btn-icon' });
    btn.createEl('span', { text: tName, cls: 'hexcrawl-terrain-btn-name' });

    btn.addEventListener('click', () => {
      // Deactivate all
      buttons.forEach((b) => b.removeClass('active'));
      btn.addClass('active');
      selected = def.id;
      if (onChange) onChange(selected);
    });

    buttons.set(def.id, btn);
  }

  return {
    container,
    getSelected: () => selected,
    setSelected: (id: TerrainType) => {
      selected = id;
      buttons.forEach((b, key) => {
        b.toggleClass('active', key === id);
      });
    },
  };
}

// ─── Terrain Data Management ───────────────────────────────────────────────

/**
 * Set terrain for a hex. Mutates the array in place.
 */
export function setHexTerrain(
  terrains: HexTerrain[],
  col: number,
  row: number,
  terrain: TerrainType,
): HexTerrain[] {
  const idx = terrains.findIndex(t => t.col === col && t.row === row);
  if (idx >= 0) {
    terrains[idx]!.terrain = terrain;
  } else {
    terrains.push({ col, row, terrain });
  }
  return terrains;
}

/**
 * Remove terrain assignment for a hex (revert to default/plains).
 */
export function clearHexTerrain(terrains: HexTerrain[], col: number, row: number): HexTerrain[] {
  return terrains.filter(t => !(t.col === col && t.row === row));
}

/**
 * Get terrain for a hex from the array.
 */
export function getHexTerrainAt(terrains: HexTerrain[], col: number, row: number): TerrainType {
  const entry = terrains.find(t => t.col === col && t.row === row);
  return entry?.terrain || 'plains';
}

// ─── Terrain Rendering Helpers ─────────────────────────────────────────────

/**
 * Draw filled terrain hex on a canvas context.
 * Uses the terrain definition's color with transparency.
 */
export function drawTerrainHex(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  terrain: TerrainDefinition,
  gridType: 'hex-horizontal' | 'hex-vertical',
  alpha: number = 0.35,
) {
  ctx.save();
  ctx.fillStyle = terrain.color;
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  if (gridType === 'hex-horizontal') {
    // Flat-top hex
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    // Pointy-top hex
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (Math.PI / 3) * i;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();

  // Draw terrain icon in center
  ctx.globalAlpha = 0.7;
  ctx.font = `${radius * 0.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(terrain.icon, centerX, centerY);

  ctx.restore();
}

// ─── Hexcrawl Control Panel Modal ──────────────────────────────────────────

/**
 * Modal for managing hexcrawl settings on a map:
 * - Enable/disable hexcrawl tracking
 * - Set party starting position
 * - Configure survival meter max/threshold
 */
export class HexcrawlSettingsModal extends Modal {
  private onSave: (settings: HexcrawlSettingsResult) => void;
  private enabled: boolean;
  private meterMax: number;
  private meterThreshold: number;
  private descriptionLanguage: DescriptionLanguage;

  constructor(
    app: App,
    currentEnabled: boolean,
    currentMeterMax: number,
    currentMeterThreshold: number,
    currentLanguage: DescriptionLanguage,
    onSave: (settings: HexcrawlSettingsResult) => void,
  ) {
    super(app);
    this.enabled = currentEnabled;
    this.meterMax = currentMeterMax;
    this.meterThreshold = currentMeterThreshold;
    this.descriptionLanguage = currentLanguage || 'en';
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('hexcrawl-settings-modal');

    contentEl.createEl('h2', { text: hLoc(this.descriptionLanguage, 'settingsTitle') });

    new Setting(contentEl)
      .setName(hLoc(this.descriptionLanguage, 'enableHexcrawlTravel'))
      .setDesc(hLoc(this.descriptionLanguage, 'enableHexcrawlDesc'))
      .addToggle(toggle => {
        toggle.setValue(this.enabled);
        toggle.onChange(v => this.enabled = v);
      });

    new Setting(contentEl)
      .setName(hLoc(this.descriptionLanguage, 'survivalMeterMax'))
      .setDesc(hLoc(this.descriptionLanguage, 'survivalMeterMaxDesc'))
      .addSlider(slider => {
        slider.setLimits(4, 12, 1)
          .setValue(this.meterMax)
          .setDynamicTooltip()
          .onChange(v => this.meterMax = v);
      });

    new Setting(contentEl)
      .setName(hLoc(this.descriptionLanguage, 'dangerThreshold'))
      .setDesc(hLoc(this.descriptionLanguage, 'dangerThresholdDesc'))
      .addSlider(slider => {
        slider.setLimits(1, 4, 1)
          .setValue(this.meterThreshold)
          .setDynamicTooltip()
          .onChange(v => this.meterThreshold = v);
      });

    new Setting(contentEl)
      .setName(hLoc(this.descriptionLanguage, 'descLanguage'))
      .setDesc(hLoc(this.descriptionLanguage, 'descLanguageDesc'))
      .addDropdown(dropdown => {
        for (const lang of DESCRIPTION_LANGUAGES) {
          dropdown.addOption(lang.id, lang.name);
        }
        dropdown.setValue(this.descriptionLanguage);
        dropdown.onChange(v => this.descriptionLanguage = v as DescriptionLanguage);
      });

    // Save button
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText(hLoc(this.descriptionLanguage, 'saveSettings'))
          .setCta()
          .onClick(() => {
            this.onSave({
              enabled: this.enabled,
              meterMax: this.meterMax,
              meterThreshold: this.meterThreshold,
              descriptionLanguage: this.descriptionLanguage,
            });
            this.close();
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export interface HexcrawlSettingsResult {
  enabled: boolean;
  meterMax: number;
  meterThreshold: number;
  descriptionLanguage: DescriptionLanguage;
}

// ─── Climate Zone Data Management ──────────────────────────────────────────

/**
 * Set climate for a hex. Mutates the array in place.
 */
export function setHexClimate(
  climates: HexClimate[],
  col: number,
  row: number,
  climate: ClimateType,
): HexClimate[] {
  const idx = climates.findIndex(c => c.col === col && c.row === row);
  if (idx >= 0) {
    climates[idx]!.climate = climate;
  } else {
    climates.push({ col, row, climate });
  }
  return climates;
}

/**
 * Remove climate assignment for a hex.
 */
export function clearHexClimate(climates: HexClimate[], col: number, row: number): HexClimate[] {
  return climates.filter(c => !(c.col === col && c.row === row));
}

/**
 * Get climate for a hex from the array (undefined = no climate set).
 */
export function getHexClimateAt(climates: HexClimate[], col: number, row: number): ClimateType | undefined {
  const entry = climates.find(c => c.col === col && c.row === row);
  return entry?.climate;
}

// ─── Climate Zone Rendering ────────────────────────────────────────────────

/**
 * Draw a coloured border ring around a hex to indicate its climate zone.
 * Rendered on top of the terrain fill.
 */
export function drawClimateHexBorder(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  climate: ClimateDefinition,
  gridType: 'hex-horizontal' | 'hex-vertical',
  lineWidth: number = 3,
  alpha: number = 0.65,
) {
  ctx.save();
  ctx.strokeStyle = climate.color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  if (gridType === 'hex-horizontal') {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (Math.PI / 3) * i;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();

  // Draw small climate icon in bottom-right area of the hex
  ctx.globalAlpha = 0.6;
  ctx.font = `${radius * 0.3}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const offsetX = radius * 0.4;
  const offsetY = radius * 0.35;
  ctx.fillText(climate.icon, centerX + offsetX, centerY + offsetY);

  ctx.restore();
}

// ─── Hex Tile Description Edit Modal ───────────────────────────────────────

/**
 * Small modal for editing (or clearing) a single hex tile's custom
 * read-aloud description. Opens when the GM clicks a hex with the
 * "Hex Description" tool active.
 */
export class HexDescriptionEditModal extends Modal {
  private col: number;
  private row: number;
  private terrainLabel: string;
  private currentDescription: string;
  private onSave: (description: string | undefined) => void;
  private lang: DescriptionLanguage;

  constructor(
    app: App,
    col: number,
    row: number,
    terrainLabel: string,
    currentDescription: string | undefined,
    onSave: (description: string | undefined) => void,
    lang: DescriptionLanguage = 'en',
  ) {
    super(app);
    this.col = col;
    this.row = row;
    this.terrainLabel = terrainLabel;
    this.currentDescription = currentDescription || '';
    this.onSave = onSave;
    this.lang = lang;
  }

  onOpen() {
    const { contentEl } = this;
    const L = this.lang;
    contentEl.empty();
    contentEl.addClass('hex-tile-desc-modal');
    this.modalEl.addClass('hex-tile-desc-container');

    contentEl.createEl('h3', {
      text: hLoc(L, 'hexDescTitle', { col: this.col, row: this.row, terrain: this.terrainLabel }),
    });
    contentEl.createEl('p', {
      text: hLoc(L, 'hexDescHint'),
      cls: 'hex-tile-desc-hint',
    });

    const ta = contentEl.createEl('textarea', { cls: 'hex-tile-desc-textarea' });
    ta.value = this.currentDescription;
    ta.rows = 6;
    ta.placeholder = hLoc(L, 'hexDescPlaceholder');

    // Footer buttons
    const footer = contentEl.createDiv({ cls: 'hex-tile-desc-footer' });

    const clearBtn = footer.createEl('button', {
      text: hLoc(L, 'clearBtn'),
      cls: 'hex-tile-desc-clear-btn',
    });
    clearBtn.addEventListener('click', () => {
      this.onSave(undefined);
      this.close();
    });

    const saveBtn = footer.createEl('button', {
      text: hLoc(L, 'saveBtn'),
      cls: 'mod-cta hex-tile-desc-save-btn',
    });
    saveBtn.addEventListener('click', () => {
      const val = ta.value.trim();
      this.onSave(val.length > 0 ? val : undefined);
      this.close();
    });

    // Auto-focus the textarea
    setTimeout(() => ta.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ─── Hex Description Settings Modal ────────────────────────────────────────

/**
 * Modal for managing custom per-terrain-type read-aloud descriptions.
 * The GM can add, edit, and remove descriptions for each terrain type.
 * These take priority over the auto-generated climate × terrain descriptions
 * in the hex procedure modal.
 */
export class HexDescriptionSettingsModal extends Modal {
  private descriptions: Record<string, string[]>;
  private onSave: (descriptions: Record<string, string[]>) => void;
  private lang: DescriptionLanguage;

  constructor(
    app: App,
    currentDescriptions: Record<string, string[]>,
    onSave: (descriptions: Record<string, string[]>) => void,
    lang: DescriptionLanguage = 'en',
  ) {
    super(app);
    // Deep clone so edits don't mutate until Save
    this.descriptions = JSON.parse(JSON.stringify(currentDescriptions || {}));
    this.onSave = onSave;
    this.lang = lang;
  }

  onOpen() {
    const { contentEl } = this;
    const L = this.lang;
    contentEl.empty();
    contentEl.addClass('hex-description-settings-modal');
    this.modalEl.addClass('hex-description-settings-container');

    contentEl.createEl('h2', { text: hLoc(L, 'customTerrainDescs') });
    contentEl.createEl('p', {
      text: hLoc(L, 'customTerrainDescsHint'),
      cls: 'hex-desc-settings-subtitle',
    });

    this.renderTerrainList(contentEl);

    // Save button
    const footer = contentEl.createDiv({ cls: 'hex-desc-settings-footer' });
    const saveBtn = footer.createEl('button', {
      text: hLoc(L, 'saveDescriptions'),
      cls: 'mod-cta hex-desc-save-btn',
    });
    saveBtn.addEventListener('click', () => {
      // Remove empty arrays
      const cleaned: Record<string, string[]> = {};
      for (const [key, arr] of Object.entries(this.descriptions)) {
        const filtered = arr.filter(s => s.trim().length > 0);
        if (filtered.length > 0) cleaned[key] = filtered;
      }
      this.onSave(cleaned);
      this.close();
    });
  }

  private renderTerrainList(container: HTMLElement) {
    const listEl = container.createDiv({ cls: 'hex-desc-terrain-list' });
    const L = this.lang;

    for (const def of TERRAIN_DEFINITIONS) {
      const section = listEl.createDiv({ cls: 'hex-desc-terrain-section' });

      // Header row with terrain icon, name, and add button
      const header = section.createDiv({ cls: 'hex-desc-terrain-header' });
      header.createEl('span', { text: `${def.icon} ${hLoc(L, `terrain.${def.id}`)}`, cls: 'hex-desc-terrain-name' });

      const descs = this.descriptions[def.id] || [];
      const countBadge = header.createEl('span', {
        text: `${descs.length}`,
        cls: 'hex-desc-count-badge',
      });

      const addBtn = header.createEl('button', {
        text: hLoc(L, 'addBtn'),
        cls: 'hex-desc-add-btn',
      });

      // Entries container (collapsible)
      const entriesEl = section.createDiv({ cls: 'hex-desc-entries' });
      let expanded = descs.length > 0;
      entriesEl.toggleClass('hidden', !expanded);

      header.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.hex-desc-add-btn')) return;
        expanded = !expanded;
        entriesEl.toggleClass('hidden', !expanded);
      });

      const renderEntries = () => {
        entriesEl.empty();
        const currentDescs = this.descriptions[def.id] || [];
        countBadge.textContent = `${currentDescs.length}`;

        if (currentDescs.length === 0) {
          entriesEl.createEl('div', {
            text: hLoc(L, 'noCustomDescs'),
            cls: 'hex-desc-empty',
          });
          return;
        }

        currentDescs.forEach((desc, idx) => {
          const row = entriesEl.createDiv({ cls: 'hex-desc-entry' });

          const ta = row.createEl('textarea', { cls: 'hex-desc-textarea' });
          ta.value = desc;
          ta.rows = 3;
          ta.placeholder = hLoc(L, 'describePartySees');
          ta.addEventListener('input', () => {
            if (!this.descriptions[def.id]) this.descriptions[def.id] = [];
            this.descriptions[def.id]![idx] = ta.value;
          });

          const deleteBtn = row.createEl('button', {
            text: '🗑️',
            cls: 'hex-desc-delete-btn',
            attr: { title: hLoc(L, 'removeDesc') },
          });
          deleteBtn.addEventListener('click', () => {
            if (!this.descriptions[def.id]) return;
            this.descriptions[def.id]!.splice(idx, 1);
            if (this.descriptions[def.id]!.length === 0) delete this.descriptions[def.id];
            renderEntries();
          });
        });
      };

      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.descriptions[def.id]) this.descriptions[def.id] = [];
        this.descriptions[def.id]!.push('');
        expanded = true;
        entriesEl.removeClass('hidden');
        renderEntries();
        // Focus the new textarea
        const textareas = entriesEl.querySelectorAll('textarea');
        if (textareas.length > 0) {
          (textareas[textareas.length - 1] as HTMLTextAreaElement).focus();
        }
      });

      renderEntries();
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
