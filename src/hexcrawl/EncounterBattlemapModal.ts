/**
 * Encounter Battlemap Modal
 *
 * Opened after completing a hex procedure when an encounter was triggered.
 * Allows the GM to select a map image, then auto-creates:
 * - A battlemap with a dnd-map codeblock
 * - All rolled creatures placed as markers with distinguishing border colors
 * - An encounter note saved in the z_Encounters folder
 */

import { App, Modal, Notice, TFile, Setting, DropdownComponent } from 'obsidian';
import type DndCampaignHubPlugin from '../main';
import type { EncounterTableEntry, EncounterMonsterGroup } from '../encounter/EncounterGenerator';
import type { SRDMonster } from '../encounter/SRDApiClient';
import { SRDApiClient } from '../encounter/SRDApiClient';
import { MapManager } from '../map/MapManager';
import { MAP_MEDIA_EXTENSIONS, MAP_IMAGE_EXTENSIONS, MAP_VIDEO_EXTENSIONS, isVideoExtension, MAP_PRESETS } from '../map/types';
import type { CreatureSize, MarkerDefinition, MarkerReference } from '../marker/MarkerTypes';
import { CREATURE_SIZE_SQUARES } from '../marker/MarkerTypes';
import type { DescriptionLanguage, TerrainType } from './types';
import { getTerrainDefinition } from './types';
import { hLoc } from './HexcrawlLocale';

// ── Border color palette for differentiating duplicate creatures ────────

const BORDER_COLORS: { name: string; hex: string }[] = [
  { name: 'Red',     hex: '#ff0000' },
  { name: 'Blue',    hex: '#3399ff' },
  { name: 'Green',   hex: '#00cc44' },
  { name: 'Yellow',  hex: '#ffcc00' },
  { name: 'Purple',  hex: '#9933ff' },
  { name: 'Orange',  hex: '#ff6600' },
  { name: 'Pink',    hex: '#ff66cc' },
  { name: 'Cyan',    hex: '#00cccc' },
  { name: 'Magenta', hex: '#ff00ff' },
  { name: 'Lime',    hex: '#88ff00' },
  { name: 'Teal',    hex: '#009999' },
  { name: 'Gold',    hex: '#ffd700' },
];

// ── Creature-type emoji mapping ────────────────────────────────────────

function creatureIcon(monsterType: string): string {
  const t = (monsterType || '').toLowerCase();
  if (t.includes('dragon'))      return '🐉';
  if (t.includes('undead'))      return '💀';
  if (t.includes('fiend'))       return '👿';
  if (t.includes('celestial'))   return '👼';
  if (t.includes('elemental'))   return '🌪️';
  if (t.includes('construct'))   return '🤖';
  if (t.includes('aberration'))  return '👁️';
  if (t.includes('beast'))       return '🐺';
  if (t.includes('plant'))       return '🌿';
  if (t.includes('ooze'))        return '🟢';
  if (t.includes('fey'))         return '🧚';
  if (t.includes('giant'))       return '🗿';
  if (t.includes('monstrosity')) return '🦎';
  if (t.includes('humanoid'))    return '⚔️';
  return '👹';
}

// Mapping from SRD size strings to CreatureSize
function parseSRDSize(srdSize: string): CreatureSize {
  switch (srdSize?.toLowerCase()) {
    case 'tiny':       return 'tiny';
    case 'small':      return 'small';
    case 'medium':     return 'medium';
    case 'large':      return 'large';
    case 'huge':       return 'huge';
    case 'gargantuan': return 'gargantuan';
    default:           return 'medium';
  }
}

// ── Modal ──────────────────────────────────────────────────────────────

export class EncounterBattlemapModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private encounter: EncounterTableEntry | null;
  private encounterDetailsText: string;
  private terrainType: TerrainType;
  private lang: DescriptionLanguage;
  private hexCol: number;
  private hexRow: number;

  // Form state
  private selectedFile: TFile | null = null;
  private mapName: string;
  private gridSize: number = 70;
  private scaleValue: number = 5;
  private scaleUnit: 'feet' | 'miles' | 'km' = 'feet';
  private gridType: 'square' | 'hex-horizontal' | 'hex-vertical' | 'none' = 'square';

  // Cached SRD monster data (for sizes)
  private monsterDataCache: Map<string, SRDMonster> = new Map();
  private srdClient: SRDApiClient;

  constructor(
    app: App,
    plugin: DndCampaignHubPlugin,
    encounter: EncounterTableEntry | null,
    encounterDetailsText: string,
    terrainType: TerrainType,
    hexCol: number,
    hexRow: number,
    lang: DescriptionLanguage,
  ) {
    super(app);
    this.plugin = plugin;
    this.encounter = encounter;
    this.encounterDetailsText = encounterDetailsText;
    this.terrainType = terrainType;
    this.hexCol = hexCol;
    this.hexRow = hexRow;
    this.lang = lang;
    this.srdClient = new SRDApiClient();

    // Build default map name from encounter
    const terrain = getTerrainDefinition(terrainType);
    if (encounter && encounter.monsters.length > 0) {
      const names = encounter.monsters.map(g => g.name).join(' & ');
      this.mapName = `${terrain.icon} ${names} (${hexCol},${hexRow})`;
    } else {
      const snippet = encounterDetailsText.slice(0, 40).replace(/[\n\r]/g, ' ').trim();
      this.mapName = `${terrain.icon} ${snippet || 'Encounter'} (${hexCol},${hexRow})`;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('encounter-battlemap-modal');

    // Fetch monster sizes in background
    if (this.encounter) {
      this.fetchMonsterData();
    }

    this.render();
  }

  private render() {
    const { contentEl } = this;
    const L = this.lang;
    contentEl.empty();
    contentEl.addClass('encounter-battlemap-modal');

    // ── Title ───────────────────────────────────────────
    contentEl.createEl('h2', { text: `⚔️ ${hLoc(L, 'encounterBattlemapTitle')}` });

    // ── Encounter creature summary ──────────────────────
    const creatureSection = contentEl.createDiv({ cls: 'ebm-creature-summary' });
    creatureSection.createEl('h4', { text: hLoc(L, 'encounterCreatures') });

    if (this.encounter && this.encounter.monsters.length > 0) {
      for (const group of this.encounter.monsters) {
        const row = creatureSection.createDiv({ cls: 'ebm-creature-row' });
        const srdData = this.monsterDataCache.get(group.index);
        const icon = srdData ? creatureIcon(srdData.type) : '👹';
        const sizeStr = srdData ? ` (${srdData.size})` : '';
        row.createSpan({ text: `${icon} ${group.count}× ${group.name}`, cls: 'ebm-creature-name' });
        row.createSpan({ text: ` CR ${group.cr}${sizeStr}`, cls: 'ebm-creature-cr' });
        if (group.count > 1) {
          const colors = BORDER_COLORS.slice(0, group.count).map(c => c.name).join(', ');
          row.createDiv({ text: `🎨 ${colors}`, cls: 'ebm-creature-colors' });
        }
      }

      // Difficulty badge
      const diffClass = `encounter-difficulty-${this.encounter.difficulty.toLowerCase().replace(/\s+/g, '-')}`;
      contentEl.createDiv({
        text: `${this.encounter.difficulty} — ${this.encounter.totalXP} XP`,
        cls: `ebm-difficulty-badge ${diffClass}`,
      });
    } else {
      // Manual encounter — just show the text
      creatureSection.createDiv({
        text: this.encounterDetailsText || hLoc(L, 'encounterYesFallback'),
        cls: 'ebm-creature-name',
      });
    }

    // ── Image selector ──────────────────────────────────
    contentEl.createEl('h4', { text: hLoc(L, 'selectMapImage') });
    const imageRow = contentEl.createDiv({ cls: 'ebm-image-row' });

    if (this.selectedFile) {
      const preview = imageRow.createDiv({ cls: 'ebm-image-preview' });
      preview.createEl('img', {
        attr: { src: this.app.vault.getResourcePath(this.selectedFile) },
      });
      const info = imageRow.createDiv({ cls: 'ebm-image-info' });
      info.createEl('div', { text: this.selectedFile.name, cls: 'ebm-image-name' });
      info.createEl('div', { text: this.selectedFile.parent?.path || '/', cls: 'ebm-image-path' });
      const changeBtn = info.createEl('button', {
        text: hLoc(L, 'changeImage'),
        cls: 'ebm-btn secondary',
      });
      changeBtn.addEventListener('click', () => this.selectImage());
    } else {
      const selectBtn = imageRow.createEl('button', {
        text: `🖼️ ${hLoc(L, 'selectMapImage')}`,
        cls: 'ebm-btn primary ebm-select-image-btn',
      });
      selectBtn.addEventListener('click', () => this.selectImage());
    }

    // ── Map name ────────────────────────────────────────
    new Setting(contentEl)
      .setName(hLoc(L, 'mapNameLabel'))
      .addText(text => {
        text.setValue(this.mapName)
          .setPlaceholder(hLoc(L, 'mapNamePlaceholder'))
          .onChange(v => this.mapName = v);
        text.inputEl.style.width = '100%';
      });

    // ── Grid config ─────────────────────────────────────
    const gridSection = contentEl.createDiv({ cls: 'ebm-grid-section' });
    gridSection.createEl('h4', { text: hLoc(L, 'gridConfig') });

    new Setting(gridSection)
      .setName(hLoc(L, 'gridPreset'))
      .addDropdown(dd => {
        for (const preset of MAP_PRESETS) {
          dd.addOption(String(preset.gridSize), `${preset.name} (${preset.gridSize}px)`);
        }
        dd.setValue(String(this.gridSize));
        dd.onChange(v => {
          this.gridSize = parseInt(v);
        });
      });

    new Setting(gridSection)
      .setName(hLoc(L, 'scaleLabel'))
      .setDesc(hLoc(L, 'scaleDesc'))
      .addText(text => {
        text.setValue(String(this.scaleValue))
          .onChange(v => {
            const n = parseInt(v);
            if (!isNaN(n) && n > 0) this.scaleValue = n;
          });
        text.inputEl.type = 'number';
        text.inputEl.style.width = '80px';
      })
      .addDropdown(dd => {
        dd.addOption('feet', 'feet')
          .addOption('miles', 'miles')
          .addOption('km', 'km')
          .setValue(this.scaleUnit)
          .onChange(v => this.scaleUnit = v as 'feet' | 'miles' | 'km');
      });

    // ── Buttons ─────────────────────────────────────────
    const btnRow = contentEl.createDiv({ cls: 'ebm-button-row' });

    const skipBtn = btnRow.createEl('button', {
      text: hLoc(L, 'skipBattlemap'),
      cls: 'ebm-btn secondary',
    });
    skipBtn.addEventListener('click', () => this.close());

    const createBtn = btnRow.createEl('button', {
      text: `⚔️ ${hLoc(L, 'createBattlemap')}`,
      cls: 'ebm-btn primary',
    });
    createBtn.addEventListener('click', () => this.createBattlemap());
  }

  // ── Image selection ────────────────────────────────────────────────

  private selectImage() {
    // Gather all image/video files from vault
    const allFiles = this.app.vault.getFiles();
    const mediaFiles = allFiles.filter(f =>
      MAP_MEDIA_EXTENSIONS.includes(f.extension.toLowerCase())
    );

    // Open image selector modal
    const selector = new ImageSelectorModal(this.app, mediaFiles, (file) => {
      this.selectedFile = file;
      this.render();
    });
    selector.open();
  }

  // ── Fetch SRD monster data for sizes ───────────────────────────────

  private async fetchMonsterData() {
    if (!this.encounter) return;
    const indices = this.encounter.monsters.map(g => g.index);
    try {
      const monsters = await this.srdClient.getMonsters(indices);
      for (const m of monsters) {
        this.monsterDataCache.set(m.index, m);
      }
      // Re-render to show sizes
      this.render();
    } catch (err) {
      console.warn('[EncounterBattlemapModal] Failed to fetch monster sizes:', err);
    }
  }

  // ── Create the battlemap ───────────────────────────────────────────

  private async createBattlemap() {
    if (!this.selectedFile) {
      new Notice(hLoc(this.lang, 'selectImageFirst'));
      return;
    }
    if (!this.mapName.trim()) {
      new Notice(hLoc(this.lang, 'enterMapName'));
      return;
    }

    try {
      // 1. Create map via MapManager
      const mapManager = this.plugin.mapManager;
      const mapData = await mapManager.createMap(
        this.mapName,
        this.selectedFile.path,
        'battlemap',
        this.gridType,
        this.gridSize,
        this.scaleValue,
        this.scaleUnit,
      );

      // 2. Create marker definitions & references for creatures
      const markerRefs = await this.buildCreatureMarkers(mapData.dimensions);

      // 3. Save map annotations with markers
      const fullConfig = {
        mapId: mapData.id,
        name: mapData.name,
        imageFile: mapData.imageFile,
        isVideo: mapData.isVideo || false,
        type: mapData.type,
        dimensions: mapData.dimensions,
        gridType: mapData.gridType,
        gridSize: mapData.gridSize,
        scale: mapData.scale,
        highlights: [],
        markers: markerRefs,
        drawings: [],
        linkedEncounter: '', // Will be updated after note is created
      };
      await this.plugin.saveMapAnnotations(fullConfig, document.createElement('div'));

      // 4. Create encounter note in z_Encounters
      const notePath = await this.createEncounterNote(mapData.id);

      // 5. Update linkedEncounter
      fullConfig.linkedEncounter = notePath;
      await this.plugin.saveMapAnnotations(fullConfig, document.createElement('div'));

      // 6. Open the encounter note
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (file && file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }

      new Notice(`⚔️ ${hLoc(this.lang, 'battlemapCreated')}`);
      this.close();
    } catch (err) {
      console.error('[EncounterBattlemapModal] Failed to create battlemap:', err);
      new Notice(`❌ ${hLoc(this.lang, 'battlemapFailed')}`);
    }
  }

  // ── Build creature markers ─────────────────────────────────────────

  private async buildCreatureMarkers(
    dimensions: { width: number; height: number },
  ): Promise<MarkerReference[]> {
    if (!this.encounter || this.encounter.monsters.length === 0) return [];

    const refs: MarkerReference[] = [];
    const gridPx = this.gridSize;

    // Calculate grid dimensions
    const gridCols = Math.floor(dimensions.width / gridPx);
    const gridRows = Math.floor(dimensions.height / gridPx);

    // Place creatures starting from the center-right area (typical enemy placement)
    // Offset from center to avoid overlapping with player side
    const startCol = Math.max(1, Math.floor(gridCols * 0.55));
    const startRow = Math.max(1, Math.floor(gridRows * 0.3));

    let placementCol = startCol;
    let placementRow = startRow;
    const maxCol = gridCols - 2;

    for (const group of this.encounter.monsters) {
      // Get SRD data for size/type
      const srdData = this.monsterDataCache.get(group.index);
      const creatureSize: CreatureSize = srdData ? parseSRDSize(srdData.size) : 'medium';
      const sizeSquares = CREATURE_SIZE_SQUARES[creatureSize] || 1;
      const monsterType = srdData?.type || '';

      // Create or reuse marker definition for this creature type
      const markerDef = await this.ensureMarkerDefinition(group, creatureSize, monsterType);

      // Place each instance
      for (let i = 0; i < group.count; i++) {
        const instanceId = `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Determine border color for instances of duplicates
        let borderColor: string | undefined;
        if (group.count > 1) {
          borderColor = BORDER_COLORS[i % BORDER_COLORS.length]!.hex;
        }

        // Calculate grid-snapped position
        const posX = placementCol * gridPx;
        const posY = placementRow * gridPx;

        const ref: any = {
          id: instanceId,
          markerId: markerDef.id,
          position: { x: posX, y: posY },
          placedAt: Date.now(),
          layer: 'Player',
        };

        // Set per-instance border color for duplicate differentiation
        if (borderColor) {
          ref.borderColor = borderColor;
        }

        refs.push(ref as MarkerReference);

        // Advance placement position
        placementCol += sizeSquares + 1; // gap of 1 square between creatures
        if (placementCol + sizeSquares > maxCol) {
          placementCol = startCol;
          placementRow += sizeSquares + 1;
        }
      }

      // After each group, add a small gap before next group
      placementRow += 1;
      placementCol = startCol;
    }

    return refs;
  }

  /**
   * Ensure a marker definition exists in the library for the given creature.
   * Creates one if it doesn't exist.
   */
  private async ensureMarkerDefinition(
    group: EncounterMonsterGroup,
    creatureSize: CreatureSize,
    monsterType: string,
  ): Promise<MarkerDefinition> {
    const library = this.plugin.markerLibrary;

    // Check if a marker with this creature name already exists
    const existing = library.getAllMarkers().find(
      m => m.name.toLowerCase() === group.name.toLowerCase() && m.type === 'creature'
    );
    if (existing) return existing;

    // Create a new marker definition
    const icon = creatureIcon(monsterType);
    const id = library.generateId();
    const now = Date.now();

    const def: MarkerDefinition = {
      id,
      name: group.name,
      type: 'creature',
      icon,
      backgroundColor: '#dc2626', // Red background for enemies
      borderColor: '#ffffff',
      creatureSize,
      createdAt: now,
      updatedAt: now,
    };

    await library.setMarker(def);
    return def;
  }

  // ── Create encounter note ──────────────────────────────────────────

  private async createEncounterNote(mapId: string): Promise<string> {
    // Always create in vault root z_Encounters folder
    const encounterFolder = 'z_Encounters';

    // Ensure folder exists
    if (!(await this.app.vault.adapter.exists(encounterFolder))) {
      await this.app.vault.createFolder(encounterFolder);
    }

    // Build note content
    const terrain = getTerrainDefinition(this.terrainType);
    const terrainName = hLoc(this.lang, `terrain.${terrain.id}`);
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Build creature YAML + summary table (only when auto-generated encounter exists)
    let creaturesYaml = '';
    let difficultyFrontmatter = '';
    let creatureSummary = '';
    let difficultyLine = '';

    if (this.encounter && this.encounter.monsters.length > 0) {
      creaturesYaml = this.encounter.monsters.map(g => {
        const lines = [
          `  - name: "${g.name}"`,
          `    count: ${g.count}`,
          `    cr: "${g.cr}"`,
          `    xp: ${g.xpEach}`,
        ];
        if (g.count > 1) {
          const colorNames = BORDER_COLORS.slice(0, g.count).map(c => c.name);
          lines.push(`    colors: [${colorNames.join(', ')}]`);
        }
        return lines.join('\n');
      }).join('\n');

      difficultyFrontmatter = `difficulty: "${this.encounter.difficulty}"\ntotalXP: ${this.encounter.totalXP}\n`;
      difficultyLine = `\n> **${hLoc(this.lang, 'difficultyLabel')}:** ${this.encounter.difficulty} — ${this.encounter.totalXP} XP`;

      creatureSummary = this.encounter.monsters.map(g => {
        const srdData = this.monsterDataCache.get(g.index);
        const icon = srdData ? creatureIcon(srdData.type) : '👹';
        const sizeStr = srdData ? srdData.size : 'Medium';
        let line = `| ${icon} ${g.name} | ${g.count} | ${g.cr} | ${sizeStr} | ${g.xpEach} |`;
        if (g.count > 1) {
          const colors = BORDER_COLORS.slice(0, g.count).map(c => c.name).join(', ');
          line = `| ${icon} ${g.name} | ${g.count} (${colors}) | ${g.cr} | ${sizeStr} | ${g.xpEach} |`;
        }
        return line;
      }).join('\n');
    }

    // Build the note
    const sanitizedName = this.mapName.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${dateStr} ${sanitizedName}`;
    let filePath = `${encounterFolder}/${fileName}.md`;

    // Deduplicate
    let counter = 1;
    while (await this.app.vault.adapter.exists(filePath)) {
      filePath = `${encounterFolder}/${fileName} (${counter}).md`;
      counter++;
    }

    // Compose YAML front matter
    let frontmatter = `---\ntype: encounter\nsource: hexcrawl\nterrain: "${this.terrainType}"\nterrainName: "${terrainName}"\nhex: [${this.hexCol}, ${this.hexRow}]\n${difficultyFrontmatter}date: ${dateStr}\n`;
    if (creaturesYaml) {
      frontmatter += `creatures:\n${creaturesYaml}\n`;
    }
    frontmatter += `---`;

    // Creature table section
    let creatureTableSection = '';
    if (creatureSummary) {
      creatureTableSection = `## ${hLoc(this.lang, 'creaturesHeading')}\n\n| ${hLoc(this.lang, 'creatureCol')} | ${hLoc(this.lang, 'countCol')} | CR | ${hLoc(this.lang, 'sizeCol')} | XP |\n|---|---|---|---|---|\n${creatureSummary}`;
    } else if (this.encounterDetailsText) {
      creatureTableSection = `## ${hLoc(this.lang, 'creaturesHeading')}\n\n${this.encounterDetailsText}`;
    }

    const content = `${frontmatter}

# ⚔️ ${this.mapName}

> **${hLoc(this.lang, 'encounterSourceHexcrawl')}** — ${terrain.icon} ${terrainName} (${this.hexCol}, ${this.hexRow})${difficultyLine}

${creatureTableSection}

## ${hLoc(this.lang, 'battlemapHeading')}

\`\`\`dnd-map
${JSON.stringify({ mapId }, null, 2)}
\`\`\`

## ${hLoc(this.lang, 'encounterNotesHeading')}

*${hLoc(this.lang, 'encounterNotesPlaceholder')}*
`;

    await this.app.vault.create(filePath, content);
    return filePath;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ─── Image Selector Modal (self-contained) ─────────────────────────────

/**
 * Simple file picker for selecting map images from the vault.
 * Mirrors the ImageSelectorModal from MapCreationModal but exported for reuse.
 */
class ImageSelectorModal extends Modal {
  private files: TFile[];
  private onSelect: (file: TFile) => void;
  private listContainer: HTMLElement | null = null;
  private searchQuery: string = '';
  private resultCountEl: HTMLElement | null = null;

  constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('image-selector-modal');

    contentEl.createEl('h2', { text: 'Select Map Image' });

    // Search bar
    const searchContainer = contentEl.createDiv({ cls: 'image-selector-search' });
    const searchInput = searchContainer.createEl('input', {
      cls: 'image-selector-search-input',
      attr: { type: 'text', placeholder: '🔍 Search by file name or path...', spellcheck: 'false' },
    });
    this.resultCountEl = searchContainer.createDiv({ cls: 'image-selector-result-count' });

    // Upload button
    const actionBar = contentEl.createDiv({ cls: 'image-selector-actions' });
    const uploadBtn = actionBar.createEl('button', {
      cls: 'image-selector-upload-btn',
      attr: { title: 'Upload an image from your computer' },
    });
    uploadBtn.innerHTML = '📁 Upload from Computer';
    uploadBtn.addEventListener('click', () => this.uploadFromExplorer());

    // File list
    this.listContainer = contentEl.createDiv({ cls: 'image-file-list' });
    this.renderFileList(this.files);

    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.filterAndRender();
    });

    setTimeout(() => searchInput.focus(), 50);
  }

  private filterAndRender() {
    if (!this.searchQuery) {
      this.renderFileList(this.files);
      return;
    }
    const terms = this.searchQuery.split(/\s+/);
    const filtered = this.files.filter(f => {
      const h = f.path.toLowerCase();
      return terms.every(t => h.includes(t));
    });
    this.renderFileList(filtered);
  }

  private renderFileList(files: TFile[]) {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.resultCountEl) {
      this.resultCountEl.setText(
        this.searchQuery
          ? `${files.length} of ${this.files.length} files`
          : `${files.length} files`,
      );
      this.resultCountEl.style.display = 'block';
    }

    if (files.length === 0) {
      const empty = this.listContainer.createDiv({ cls: 'image-file-list-empty' });
      empty.setText(this.searchQuery ? 'No files match your search' : 'No image files found in vault');
      return;
    }

    files.forEach(file => {
      const item = this.listContainer!.createDiv({ cls: 'image-file-item' });
      const ext = file.extension.toLowerCase();
      const isVideo = ['mp4', 'webm'].includes(ext);
      item.createSpan({ cls: 'image-file-icon', text: isVideo ? '🎬' : '🖼️' });
      const info = item.createDiv({ cls: 'image-file-info' });
      info.createDiv({ cls: 'image-file-name', text: file.name });
      info.createDiv({ cls: 'image-file-path', text: file.parent?.path || '/' });
      item.onClickEvent(() => {
        this.onSelect(file);
        this.close();
      });
    });
  }

  private async uploadFromExplorer() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MAP_MEDIA_EXTENSIONS.map(ext => `.${ext}`).join(',');
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        let destFolder = '';
        const attachmentSetting = (this.app.vault as any).getConfig?.('attachmentFolderPath');
        if (attachmentSetting && attachmentSetting !== '/' && attachmentSetting !== '.') {
          destFolder = attachmentSetting;
          if (!(await this.app.vault.adapter.exists(destFolder))) {
            await this.app.vault.createFolder(destFolder);
          }
        }

        let destPath = destFolder ? `${destFolder}/${file.name}` : file.name;
        let counter = 1;
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const ext = file.name.replace(/^.*\./, '.');
        while (await this.app.vault.adapter.exists(destPath)) {
          destPath = destFolder
            ? `${destFolder}/${baseName} (${counter})${ext}`
            : `${baseName} (${counter})${ext}`;
          counter++;
        }

        const created = await this.app.vault.createBinary(destPath, buffer);
        new Notice(`✅ Uploaded "${file.name}" to ${destPath}`);
        this.files.unshift(created);
        this.onSelect(created);
        this.close();
      } catch (err) {
        console.error('Failed to upload file:', err);
        new Notice('❌ Failed to upload file');
      }
    });

    input.click();
  }

  onClose() {
    this.contentEl.empty();
  }
}
