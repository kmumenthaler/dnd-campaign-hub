import { App, Modal, Setting, TFile, TFolder, Notice } from 'obsidian';
import { MapManager } from './MapManager';
import { MAP_PRESETS, MAP_MEDIA_EXTENSIONS, isVideoExtension, isMapMediaExtension, createDefaultTemplateTags } from './types';
import type DndCampaignHubPlugin from '../main';
import { CREATURE_SIZE_SQUARES } from '../marker/MarkerTypes';
import type { MarkerDefinition } from '../marker/MarkerTypes';

/** Folder where battlemap template notes are stored */
export const BATTLEMAP_TEMPLATE_FOLDER = 'z_BattlemapTemplates';

/**
 * Modal for creating or editing a map
 */
export class MapCreationModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private mapManager: MapManager;
  private selectedFile: TFile | null = null;
  private mapName: string = '';
  private mapType: 'battlemap' | 'world' | 'regional' = 'battlemap';
  private gridType: 'square' | 'hex-horizontal' | 'hex-vertical' | 'none' = 'square';
  private gridSize: number = 70;
  private scaleValue: number = 5;
  private scaleUnit: 'feet' | 'miles' | 'km' = 'feet';
  private previewContainer: HTMLElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewMediaEl: HTMLImageElement | HTMLVideoElement | null = null;
  private previewNaturalW = 0;
  private previewNaturalH = 0;
  private markerImageCache: Map<string, HTMLImageElement> = new Map();
  private editMode: boolean = false;
  private editConfig: any = null;
  private editElement: HTMLElement | null = null;
  private insertCodeBlock: boolean = true;
  /** When true the modal creates a battlemap template note in z_BattlemapTemplates/ */
  private templateMode: boolean = false;

  constructor(app: App, plugin: DndCampaignHubPlugin, mapManager: MapManager, editConfig?: any, editElement?: HTMLElement, insertCodeBlock: boolean = true, templateMode: boolean = false) {
    super(app);
    this.plugin = plugin;
    this.mapManager = mapManager;
    this.insertCodeBlock = insertCodeBlock;
    this.templateMode = templateMode;
    if (editConfig) {
      this.editMode = true;
      // Normalize editConfig to match MapData interface (mapId -> id)
      this.editConfig = {
        ...editConfig,
        id: editConfig.mapId || editConfig.id
      };
      this.editElement = editElement || null;
      // Load existing config
      this.mapName = editConfig.name || '';
      this.mapType = editConfig.type || 'battlemap';
      this.gridType = editConfig.gridType || 'square';
      this.gridSize = editConfig.gridSize || 70;
      this.scaleValue = editConfig.scale?.value || 5;
      this.scaleUnit = editConfig.scale?.unit || 'feet';
      // Load image file
      const file = this.app.vault.getAbstractFileByPath(editConfig.imageFile);
      if (file instanceof TFile) {
        this.selectedFile = file;
      }
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-map-creation-modal');

    if (this.editMode) {
      // Edit mode: go directly to form
      contentEl.createEl('h2', { text: '🗺️ Edit Battle Map' });
      this.buildMapForm(contentEl);
    } else if (this.templateMode) {
      // Template creation mode: go straight to form
      contentEl.createEl('h2', { text: '🏗️ Create Battlemap Template' });
      this.mapType = 'battlemap';
      this.buildMapForm(contentEl);
    } else {
      // Direct map creation: image → grid config → insert map
      contentEl.createEl('h2', { text: '🗺️ Create Battle Map' });
      this.buildMapForm(contentEl);
    }
  }

  /**
   * Build the map creation/edit form
   */
  private buildMapForm(container: HTMLElement) {
    // Step 1: Select Image
    this.createImageSelector(container);

    // Step 2: Map Configuration
    this.createConfigSection(container);

    // Step 3: Grid Configuration
    this.createGridSection(container);

    // Preview
    this.createPreviewSection(container);

    // Buttons
    this.createButtons(container);
  }

  private createImageSelector(container: HTMLElement) {
    const section = container.createDiv({ cls: 'dnd-map-section' });
    section.createEl('h3', { text: 'Step 1: Select Map Image' });

    new Setting(section)
      .setName('Map image')
      .setDesc('Choose an image file from your vault (PNG, JPG, WEBP, GIF, APNG, AVIF, MP4, WebM)')
      .addButton(button => {
        button
          .setButtonText('Choose Image')
          .onClick(async () => {
            await this.selectImageFromVault();
          });
      });

    // Selected file display
    const fileDisplay = section.createDiv({ cls: 'selected-file-display' });
    fileDisplay.style.marginTop = '10px';
    fileDisplay.style.padding = '10px';
    fileDisplay.style.backgroundColor = 'var(--background-secondary)';
    fileDisplay.style.borderRadius = '4px';
    
    if (this.selectedFile) {
      fileDisplay.style.display = 'block';
      fileDisplay.setText(`📄 ${this.selectedFile.path}`);
    } else {
      fileDisplay.style.display = 'none';
      fileDisplay.setText('No file selected');
    }
  }

  private static readonly MAP_ASSET_FOLDER = 'z_Assets/Maps';

  private async selectImageFromVault() {
    // Get image/video files exclusively from z_Assets/Maps
    const imageFiles = this.app.vault.getFiles().filter(file => {
      const ext = file.extension.toLowerCase();
      return file.path.startsWith(MapCreationModal.MAP_ASSET_FOLDER + '/') && MAP_MEDIA_EXTENSIONS.includes(ext);
    });

    if (imageFiles.length === 0) {
      new Notice('No map files found in z_Assets/Maps');
      return;
    }

    // Simple file selector (in a real implementation, you'd want a better UI)
    const fileNames = imageFiles.map(f => f.path);
    
    // For now, we'll use a simple modal to select
    new ImageSelectorModal(this.app, imageFiles, async (file) => {
      this.selectedFile = file;
      this.mapName = file.basename;
      
      // Update display
      const display = this.contentEl.querySelector('.selected-file-display') as HTMLElement;
      if (display) {
        display.style.display = 'block';
        display.setText(`📄 ${file.path}`);
      }

      // Update preview
      this.updatePreview();

      // Auto-detect grid
      const detection = await this.mapManager.analyzeImage(file);
      this.gridSize = detection.suggestedSize;
      
      // Update grid size input
      const gridInput = this.contentEl.querySelector('input[name="gridSize"]') as HTMLInputElement;
      if (gridInput) {
        gridInput.value = String(this.gridSize);
      }

      // Update map name input
      const nameInput = this.contentEl.querySelector('input[name="mapName"]') as HTMLInputElement;
      if (nameInput) {
        nameInput.value = this.mapName;
      }

      new Notice(`Grid size auto-detected: ${this.gridSize}px (${detection.confidence} confidence)`);
    }).open();
  }

  private createConfigSection(container: HTMLElement) {
    const section = container.createDiv({ cls: 'dnd-map-section' });
    section.createEl('h3', { text: this.templateMode ? 'Step 2: Template Configuration' : 'Step 2: Map Configuration' });

    new Setting(section)
      .setName(this.templateMode ? 'Template name' : 'Map name')
      .setDesc(this.templateMode ? 'Descriptive name for this template' : 'Name for this map')
      .addText(text => {
        text
          .setPlaceholder(this.templateMode ? 'Forest Clearing (Day)' : 'Tavern Brawl')
          .setValue(this.mapName)
          .onChange(value => {
            this.mapName = value;
          });
        text.inputEl.name = 'mapName';
      });

    // Hide map type in template mode – always battlemap
    if (!this.templateMode) {
      new Setting(section)
        .setName('Map type')
        .setDesc('Type of map')
        .addDropdown(dropdown => {
          dropdown
            .addOption('battlemap', '⚔️ Battle Map (tactical combat)')
            .addOption('world', '🌍 World Map (exploration)')
            .addOption('regional', '🗺️ Regional Map (travel)')
            .setValue(this.mapType)
            .onChange(value => {
              this.mapType = value as 'battlemap' | 'world' | 'regional';
              
              // Update scale defaults based on type
              if (this.mapType === 'battlemap') {
                this.scaleValue = 5;
                this.scaleUnit = 'feet';
                this.gridType = 'square';
              } else {
                this.scaleValue = 6;
                this.scaleUnit = 'miles';
                this.gridType = 'hex-horizontal';
              }
              
              this.refresh();
            });
        });
    }
  }

  private createGridSection(container: HTMLElement) {
    const section = container.createDiv({ cls: 'dnd-map-section' });
    section.createEl('h3', { text: 'Step 3: Grid Configuration' });

    new Setting(section)
      .setName('Grid type')
      .setDesc('Type of grid overlay')
      .addDropdown(dropdown => {
        dropdown
          .addOption('square', '⬛ Square Grid')
          .addOption('hex-horizontal', '⬡ Hex Grid (Horizontal)')
          .addOption('hex-vertical', '⬢ Hex Grid (Vertical)')
          .addOption('none', '❌ No Grid')
          .setValue(this.gridType)
          .onChange(value => {
            this.gridType = value as any;
            this.redrawPreviewOverlay();
          });
      });

    new Setting(section)
      .setName('Grid size (pixels)')
      .setDesc('Size of each grid cell in pixels')
      .addText(text => {
        text
          .setPlaceholder('70')
          .setValue(String(this.gridSize))
          .onChange(value => {
            const parsed = parseInt(value);
            if (!isNaN(parsed) && parsed > 0) {
              this.gridSize = parsed;
              this.redrawPreviewOverlay();
            }
          });
        text.inputEl.name = 'gridSize';
        text.inputEl.type = 'number';
      });

    // Presets
    const presetContainer = section.createDiv({ cls: 'grid-presets' });
    presetContainer.createEl('p', { text: 'Quick presets:', cls: 'setting-item-description' });
    
    const presetButtons = presetContainer.createDiv({ cls: 'preset-buttons' });
    presetButtons.style.display = 'flex';
    presetButtons.style.gap = '8px';
    presetButtons.style.marginTop = '8px';

    MAP_PRESETS.forEach(preset => {
      const btn = presetButtons.createEl('button', { text: preset.name });
      btn.style.padding = '6px 12px';
      btn.style.fontSize = '12px';
      btn.onclick = () => {
        this.gridSize = preset.gridSize;
        const input = section.querySelector('input[name="gridSize"]') as HTMLInputElement;
        if (input) {
          input.value = String(this.gridSize);
        }
        this.redrawPreviewOverlay();
        new Notice(`Grid size set to ${preset.gridSize}px`);
      };
    });

    // Scale
    new Setting(section)
      .setName('Scale')
      .setDesc('Real-world distance per grid square')
      .addText(text => {
        text
          .setPlaceholder('5')
          .setValue(String(this.scaleValue))
          .onChange(value => {
            const parsed = parseInt(value);
            if (!isNaN(parsed) && parsed > 0) {
              this.scaleValue = parsed;
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.style.width = '80px';
      })
      .addDropdown(dropdown => {
        dropdown
          .addOption('feet', 'feet')
          .addOption('miles', 'miles')
          .addOption('km', 'km')
          .setValue(this.scaleUnit)
          .onChange(value => {
            this.scaleUnit = value as 'feet' | 'miles' | 'km';
          });
      });
  }

  private createPreviewSection(container: HTMLElement) {
    const section = container.createDiv({ cls: 'dnd-map-section' });
    section.createEl('h3', { text: 'Preview' });
    
    this.previewContainer = section.createDiv({ cls: 'map-preview' });
    this.previewContainer.style.minHeight = '200px';
    this.previewContainer.style.backgroundColor = 'var(--background-secondary)';
    this.previewContainer.style.borderRadius = '4px';
    this.previewContainer.style.display = 'flex';
    this.previewContainer.style.alignItems = 'center';
    this.previewContainer.style.justifyContent = 'center';
    this.previewContainer.style.color = 'var(--text-muted)';

    if (this.selectedFile) {
      // File already selected (edit mode) – render preview immediately
      this.updatePreview();
    } else {
      this.previewContainer.setText('Select an image to see preview');
    }
  }

  /**
   * Render the selected image / video into the preview container.
   */
  private updatePreview(): void {
    if (!this.previewContainer || !this.selectedFile) return;

    this.previewContainer.empty();
    this.previewCanvas = null;
    this.previewMediaEl = null;
    this.previewContainer.style.display = 'block';
    this.previewContainer.style.position = 'relative';
    this.previewContainer.style.overflow = 'hidden';

    const resourcePath = this.app.vault.getResourcePath(this.selectedFile);
    const isVideo = isVideoExtension(this.selectedFile.extension);

    // Wrapper keeps the media and canvas aligned
    const wrapper = this.previewContainer.createDiv({ cls: 'map-preview-wrapper' });
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.width = '100%';

    if (isVideo) {
      const video = wrapper.createEl('video', {
        attr: { src: resourcePath, muted: '' },
      });
      video.style.width = '100%';
      video.style.maxHeight = '350px';
      video.style.objectFit = 'contain';
      video.style.borderRadius = '4px';
      video.style.display = 'block';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      this.previewMediaEl = video;
      video.addEventListener('loadedmetadata', () => {
        this.previewNaturalW = video.videoWidth;
        this.previewNaturalH = video.videoHeight;
        this.redrawPreviewOverlay();
      });
    } else {
      const img = wrapper.createEl('img', {
        attr: { src: resourcePath, alt: this.mapName || 'Map preview' },
      });
      img.style.width = '100%';
      img.style.maxHeight = '350px';
      img.style.objectFit = 'contain';
      img.style.borderRadius = '4px';
      img.style.display = 'block';
      this.previewMediaEl = img;
      img.addEventListener('load', () => {
        this.previewNaturalW = img.naturalWidth;
        this.previewNaturalH = img.naturalHeight;
        this.redrawPreviewOverlay();
      });
    }

    // Caption
    const caption = this.previewContainer.createDiv();
    caption.style.textAlign = 'center';
    caption.style.fontSize = '12px';
    caption.style.color = 'var(--text-muted)';
    caption.style.marginTop = '6px';
    caption.setText(this.selectedFile.name);

    // Annotation legend (edit mode)
    if (this.editMode && this.editConfig) {
      const counts = this.getAnnotationCounts();
      if (counts.length > 0) {
        const legend = this.previewContainer.createDiv({ cls: 'map-preview-legend' });
        legend.style.textAlign = 'center';
        legend.style.fontSize = '11px';
        legend.style.color = 'var(--text-muted)';
        legend.style.marginTop = '4px';
        legend.setText(counts.join(' • '));
      }
    }
  }

  /** Count existing annotations for the legend line */
  private getAnnotationCounts(): string[] {
    if (!this.editConfig) return [];
    const parts: string[] = [];
    const m = (this.editConfig.markers || []).length;
    const w = (this.editConfig.walls || []).length;
    const d = (this.editConfig.drawings || []).length;
    const l = (this.editConfig.lightSources || []).length;
    const h = (this.editConfig.highlights || []).length;
    if (m) parts.push(`${m} token${m !== 1 ? 's' : ''}`);
    if (w) parts.push(`${w} wall${w !== 1 ? 's' : ''}`);
    if (d) parts.push(`${d} drawing${d !== 1 ? 's' : ''}`);
    if (l) parts.push(`${l} light${l !== 1 ? 's' : ''}`);
    if (h) parts.push(`${h} highlight${h !== 1 ? 's' : ''}`);
    return parts;
  }

  // ── Live preview overlay ─────────────────────────────────────────

  /**
   * Redraw the grid + annotation overlay on the preview.
   * Called whenever grid type, grid size, or image changes.
   */
  private redrawPreviewOverlay(): void {
    if (!this.previewContainer || !this.previewMediaEl) return;
    if (this.previewNaturalW === 0 || this.previewNaturalH === 0) return;

    const wrapper = this.previewContainer.querySelector('.map-preview-wrapper') as HTMLElement;
    if (!wrapper) return;

    // Remove old canvas
    if (this.previewCanvas) {
      this.previewCanvas.remove();
      this.previewCanvas = null;
    }

    // Compute the displayed size of the media (object-fit:contain)
    const media = this.previewMediaEl;
    const containerW = media.clientWidth;
    const containerH = media.clientHeight;
    if (containerW === 0 || containerH === 0) return;

    const natW = this.previewNaturalW;
    const natH = this.previewNaturalH;
    const displayScale = Math.min(containerW / natW, containerH / natH);
    const drawW = natW * displayScale;
    const drawH = natH * displayScale;
    // Offset caused by object-fit:contain centring
    const offsetX = (containerW - drawW) / 2;
    const offsetY = (containerH - drawH) / 2;

    // Create overlay canvas matching the displayed image area
    const canvas = document.createElement('canvas');
    canvas.width = drawW;
    canvas.height = drawH;
    canvas.style.position = 'absolute';
    canvas.style.left = `${offsetX}px`;
    canvas.style.top = `${offsetY}px`;
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;
    canvas.style.pointerEvents = 'none';
    canvas.style.borderRadius = '4px';
    wrapper.appendChild(canvas);
    this.previewCanvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale factor: canvas-pixel / natural-pixel
    const s = displayScale;

    // ─── Grid ──────────────────────────────────────────────────
    this.drawPreviewGrid(ctx, natW, natH, s);

    // ─── Annotations (edit mode only) ──────────────────────────
    if (this.editMode && this.editConfig) {
      this.drawPreviewAnnotations(ctx, s);
    }
  }

  // ── Grid drawing (mirrors plugin.drawGridOverlay logic) ──────

  private drawPreviewGrid(ctx: CanvasRenderingContext2D, natW: number, natH: number, s: number): void {
    if (this.gridType === 'none') return;

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = Math.max(1, 1.5 * s);

    const gs = this.gridSize; // in natural pixels

    if (this.gridType === 'square') {
      for (let x = 0; x <= natW; x += gs) {
        ctx.beginPath();
        ctx.moveTo(x * s, 0);
        ctx.lineTo(x * s, natH * s);
        ctx.stroke();
      }
      for (let y = 0; y <= natH; y += gs) {
        ctx.beginPath();
        ctx.moveTo(0, y * s);
        ctx.lineTo(natW * s, y * s);
        ctx.stroke();
      }
    } else if (this.gridType === 'hex-horizontal') {
      const horiz = gs;
      const size = (2 / 3) * horiz;
      const vert = Math.sqrt(3) * size;
      const startCol = -2;
      const endCol = Math.ceil(natW / horiz) + 2;
      const startRow = -2;
      const endRow = Math.ceil(natH / vert) + 2;
      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const colOff = (col & 1) ? vert / 2 : 0;
          const cx = col * horiz;
          const cy = row * vert + colOff;
          this.drawHexFlat(ctx, cx * s, cy * s, size * s);
        }
      }
    } else if (this.gridType === 'hex-vertical') {
      const vert = gs;
      const size = (2 / 3) * vert;
      const horiz = Math.sqrt(3) * size;
      const startCol = -2;
      const endCol = Math.ceil(natW / horiz) + 2;
      const startRow = -2;
      const endRow = Math.ceil(natH / vert) + 2;
      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const rowOff = (row & 1) ? horiz / 2 : 0;
          const cx = col * horiz + rowOff;
          const cy = row * vert;
          this.drawHexPointy(ctx, cx * s, cy * s, size * s);
        }
      }
    }
  }

  private drawHexFlat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private drawHexPointy(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 6) + (Math.PI / 3) * i;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // ── Annotation drawing (tokens, walls, drawings, lights) ─────

  private drawPreviewAnnotations(ctx: CanvasRenderingContext2D, s: number): void {
    const cfg = this.editConfig;
    if (!cfg) return;

    // Drawings
    for (const drawing of (cfg.drawings || [])) {
      if (!drawing.points || drawing.points.length === 0) continue;
      ctx.strokeStyle = drawing.color || '#ffffff';
      ctx.lineWidth = Math.max(1, (drawing.strokeWidth || 2) * s);
      ctx.beginPath();
      ctx.moveTo(drawing.points[0].x * s, drawing.points[0].y * s);
      for (let i = 1; i < drawing.points.length; i++) {
        ctx.lineTo(drawing.points[i].x * s, drawing.points[i].y * s);
      }
      ctx.stroke();
    }

    // Hex highlights
    for (const hl of (cfg.highlights || [])) {
      if (!hl.position) continue;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = hl.color || '#ffff00';
      const r = (this.gridSize / 2) * s;
      ctx.beginPath();
      ctx.arc(hl.position.x * s, hl.position.y * s, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Walls
    const WALL_COLORS: Record<string, string> = {
      wall: '#ff4500', door: '#8B4513', window: '#87CEEB',
      secret: '#666666', invisible: '#cccccc', terrain: '#8B7355',
    };
    for (const wall of (cfg.walls || [])) {
      if (!wall.start || !wall.end) continue;
      ctx.save();
      ctx.strokeStyle = WALL_COLORS[wall.type] || '#ff4500';
      ctx.lineWidth = Math.max(2, 3 * s);
      ctx.lineCap = 'round';
      if (wall.type === 'secret' || wall.type === 'invisible') {
        ctx.setLineDash([6 * s, 4 * s]);
      }
      ctx.beginPath();
      ctx.moveTo(wall.start.x * s, wall.start.y * s);
      ctx.lineTo(wall.end.x * s, wall.end.y * s);
      ctx.stroke();
      ctx.setLineDash([]);
      // Door indicator
      if (wall.type === 'door') {
        const mx = ((wall.start.x + wall.end.x) / 2) * s;
        const my = ((wall.start.y + wall.end.y) / 2) * s;
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.arc(mx, my, 4 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Light sources
    for (const light of (cfg.lightSources || [])) {
      if (!light.position) continue;
      ctx.save();
      const lx = light.position.x * s;
      const ly = light.position.y * s;
      // Draw a glow circle
      const brightR = ((light.brightRadius || 20) / this.scaleValue) * this.gridSize * s;
      const dimR = ((light.dimRadius || 40) / this.scaleValue) * this.gridSize * s;
      const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, dimR);
      grad.addColorStop(0, 'rgba(255, 200, 50, 0.4)');
      grad.addColorStop(brightR / dimR, 'rgba(255, 200, 50, 0.15)');
      grad.addColorStop(1, 'rgba(255, 200, 50, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lx, ly, dimR, 0, Math.PI * 2);
      ctx.fill();
      // Center dot
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(lx, ly, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Tokens / markers – draw last so they're on top
    for (const marker of (cfg.markers || [])) {
      if (!marker.position) continue;
      const px = marker.position.x * s;
      const py = marker.position.y * s;

      // Determine radius from marker definition
      let radius = 15 * s; // fallback
      let bgColor = '#ff0000';
      let borderColor = (marker as any).borderColor || '#ffffff';
      let icon = '';
      let markerDef: MarkerDefinition | null = null;

      if (marker.markerId && this.plugin.markerLibrary) {
        markerDef = this.plugin.markerLibrary.getMarker(marker.markerId) || null;
      }

      if (markerDef) {
        if (['player', 'npc', 'creature'].includes(markerDef.type) && markerDef.creatureSize && this.gridSize) {
          const sq = CREATURE_SIZE_SQUARES[markerDef.creatureSize] || 1;
          radius = (sq * this.gridSize / 2) * s;
        } else {
          radius = ((markerDef.pixelSize || 30) / 2) * s;
        }
        bgColor = markerDef.backgroundColor || bgColor;
        borderColor = (marker as any).borderColor || markerDef.borderColor || '#ffffff';
        icon = markerDef.icon || '';
      }

      ctx.save();

      // Try to draw image
      let imageDrawn = false;
      if (markerDef?.imageFile) {
        const cached = this.loadPreviewMarkerImage(markerDef.imageFile);
        if (cached && cached.complete && cached.naturalWidth > 0) {
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          const tokenSize = radius * 2;
          const fit = markerDef.imageFit || 'cover';
          const imgW = cached.naturalWidth;
          const imgH = cached.naturalHeight;
          if (fit === 'contain') {
            ctx.fillStyle = bgColor;
            ctx.fill();
            const sc = Math.min(tokenSize / imgW, tokenSize / imgH);
            const dw = imgW * sc;
            const dh = imgH * sc;
            ctx.drawImage(cached, px - dw / 2, py - dh / 2, dw, dh);
          } else {
            const sc = Math.max(tokenSize / imgW, tokenSize / imgH);
            const dw = imgW * sc;
            const dh = imgH * sc;
            ctx.drawImage(cached, px - dw / 2, py - dh / 2, dw, dh);
          }
          imageDrawn = true;
        }
      }

      ctx.restore();
      ctx.save();

      if (!imageDrawn) {
        // Solid coloured circle
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Border
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = Math.max(1.5, radius * 0.1);
      ctx.stroke();

      // Icon / label
      if (icon && !imageDrawn) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(8, radius * 1.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, px, py);
      }

      ctx.restore();
    }
  }

  /** Cache + load a marker image, triggering redraw on load */
  private loadPreviewMarkerImage(path: string): HTMLImageElement | null {
    if (this.markerImageCache.has(path)) {
      return this.markerImageCache.get(path) || null;
    }
    const img = new Image();
    this.markerImageCache.set(path, img);
    try {
      img.src = this.app.vault.adapter.getResourcePath(path);
      img.onload = () => this.redrawPreviewOverlay();
    } catch { /* skip */ }
    return null;
  }

  private createButtons(container: HTMLElement) {
    const buttonContainer = container.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const createBtn = buttonContainer.createEl('button', { text: this.editMode ? 'Save Changes' : this.templateMode ? '🏗️ Create Template' : 'Create Map' });
    createBtn.style.backgroundColor = 'var(--interactive-accent)';
    createBtn.style.color = 'var(--text-on-accent)';
    createBtn.onclick = async () => {
      await this.createMap();
    };
  }

  private async createMap() {
    if (!this.selectedFile) {
      new Notice('Please select an image file');
      return;
    }

    if (!this.mapName.trim()) {
      new Notice('Please enter a map name');
      return;
    }

    try {
      let mapData = await this.mapManager.createMap(
        this.mapName,
        this.selectedFile.path,
        this.mapType,
        this.gridType,
        this.gridSize,
        this.scaleValue,
        this.scaleUnit
      );

      if (this.editMode && this.editConfig) {
        // Edit mode: preserve original ID and creation date
        mapData.id = this.editConfig.id;
        mapData.createdDate = this.editConfig.createdDate || mapData.createdDate;
        mapData.lastModified = new Date().toISOString();
      }

      // Build the config to save
      let fullConfig: any;

      if (this.editMode && this.editConfig) {
        // Edit mode: load existing annotation data so tokens, walls,
        // drawings, fog-of-war, light sources, etc. are NOT wiped
        const existing = await this.plugin.loadMapAnnotations(mapData.id);

        fullConfig = {
          ...existing,            // preserve ALL existing annotation data
          // overwrite only the map-settings fields the user can edit
          mapId: mapData.id,
          name: mapData.name,
          imageFile: mapData.imageFile,
          isVideo: mapData.isVideo || false,
          type: mapData.type,
          dimensions: mapData.dimensions,
          gridType: mapData.gridType,
          gridSize: mapData.gridSize,
          scale: mapData.scale,
        };
      } else if (this.templateMode) {
        // Template mode: create with isTemplate flag and default tags
        fullConfig = {
          mapId: mapData.id,
          name: mapData.name,
          imageFile: mapData.imageFile,
          isVideo: mapData.isVideo || false,
          type: 'battlemap',
          dimensions: mapData.dimensions,
          gridType: mapData.gridType,
          gridSize: mapData.gridSize,
          scale: mapData.scale,
          highlights: [],
          markers: [],
          drawings: [],
          walls: [],
          lightSources: [],
          fogOfWar: { enabled: false, regions: [] },
          tileElevations: {},
          tunnels: [],
          isTemplate: true,
          templateTags: createDefaultTemplateTags(),
        };
      } else {
        // Direct map creation: new map with blank annotations
        fullConfig = {
          mapId: mapData.id,
          name: mapData.name,
          imageFile: mapData.imageFile,
          isVideo: mapData.isVideo || false,
          type: mapData.type,
          dimensions: mapData.dimensions,
          gridType: mapData.gridType,
          gridSize: mapData.gridSize,
          gridOffsetX: 0,
          gridOffsetY: 0,
          gridVisible: true,
          scale: mapData.scale,
          highlights: [],
          markers: [],
          drawings: [],
          walls: [],
          lightSources: [],
          fogOfWar: { enabled: false, regions: [] },
          tileElevations: {},
          difficultTerrain: {},
          tunnels: [],
          envAssets: [],
          poiReferences: [],
          isTemplate: false,
          activeLayer: 'Player',
        };
      }

      // Use a dummy element since we don't have a rendered map yet
      await this.plugin.saveMapAnnotations(fullConfig, document.createElement('div'));

      if (this.templateMode) {
        // Template mode: create a note in z_BattlemapTemplates/ with a dnd-map code block
        await this.createTemplateNote(mapData);
      } else if (this.editMode && this.editConfig) {
        // Edit mode: code block already has mapId, just update the JSON
        new Notice(`✅ Map "${this.mapName}" updated`);
      } else if (this.insertCodeBlock) {
        // Create mode via command: insert minimal code block with just mapId
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const editor = this.app.workspace.activeEditor?.editor;
          if (editor) {
            const codeBlock = this.mapManager.generateMapCodeBlock(mapData);
            editor.replaceSelection(`\n${codeBlock}\n`);
            new Notice(`✅ Map "${this.mapName}" inserted into note`);
          }
        }
      } else {
        // Create mode via Map Manager: just save, don't insert code block
        new Notice(`✅ Map "${this.mapName}" created`);
      }

      this.close();
    } catch (error) {
      console.error('Error creating map:', error);
      new Notice('Failed to create map');
    }
  }

  private refresh() {
    // When refreshing (e.g. map type changed), rebuild the form directly
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-map-creation-modal');
    if (this.templateMode) {
      contentEl.createEl('h2', { text: '🏗️ Create Battlemap Template' });
    } else {
      const title = this.editMode ? 'Edit Battle Map' : 'Create Battle Map';
      contentEl.createEl('h2', { text: `🗺️ ${title}` });
    }
    this.buildMapForm(contentEl);
  }

  /**
   * Create a template note in z_BattlemapTemplates/ with a dnd-map code block
   * and open it so the GM can configure walls, fog, etc.
   */
  private async createTemplateNote(mapData: any): Promise<void> {
    const folder = BATTLEMAP_TEMPLATE_FOLDER;

    // Ensure folder exists
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }

    // Build a safe filename
    const safeName = this.mapName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Template';
    let notePath = `${folder}/${safeName}.md`;
    let counter = 1;
    while (await this.app.vault.adapter.exists(notePath)) {
      notePath = `${folder}/${safeName} (${counter}).md`;
      counter++;
    }

    // Build the note content
    const codeBlock = this.mapManager.generateMapCodeBlock(mapData);
    const content = `---\ntags:\n  - battlemap-template\ntemplate_name: "${this.mapName}"\n---\n# ${this.mapName}\n\n${codeBlock}\n`;

    // Create the note
    const file = await this.app.vault.create(notePath, content);

    new Notice(`✅ Template "${this.mapName}" created — opening for configuration…`);

    // Open the note so the GM can configure walls, fog, lights, etc.
    await this.app.workspace.getLeaf(false).openFile(file);

    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal for selecting an image file with search and upload support
 */
class ImageSelectorModal extends Modal {
  private files: TFile[];
  private onSelect: (file: TFile) => void;
  private listContainer: HTMLElement | null = null;
  private searchQuery: string = '';
  private resultCountEl: HTMLElement | null = null;
  /** All unique subfolder paths (relative to z_Assets/Maps) */
  private folderPaths: string[] = [];
  /** Currently selected folder filter (empty string = all) */
  private selectedFolder: string = '';
  private folderChipsContainer: HTMLElement | null = null;

  constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onSelect = onSelect;
    // Build unique subfolder list relative to root map folder
    this.buildFolderList();
  }

  /** Collect every unique sub-folder path relative to z_Assets/Maps. */
  private buildFolderList() {
    const root = 'z_Assets/Maps';
    const folderSet = new Set<string>();
    for (const f of this.files) {
      const parentPath = f.parent?.path || '';
      if (parentPath === root) {
        // Files directly in root — no subfolder
        continue;
      }
      // Get relative subfolder path
      if (parentPath.startsWith(root + '/')) {
        const rel = parentPath.slice(root.length + 1);
        // Add this folder and every ancestor
        const parts = rel.split('/');
        for (let i = 1; i <= parts.length; i++) {
          folderSet.add(parts.slice(0, i).join('/'));
        }
      }
    }
    this.folderPaths = Array.from(folderSet).sort((a, b) => a.localeCompare(b));
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('image-selector-modal');

    contentEl.createEl('h2', { text: 'Select Map Image' });

    // ── Two-column layout: folders | images ──
    const body = contentEl.createDiv({ cls: 'image-selector-body' });

    // ── LEFT: Folder sidebar ──
    const sidebar = body.createDiv({ cls: 'image-selector-sidebar' });

    sidebar.createEl('span', { text: 'Folders', cls: 'image-selector-sidebar-label' });

    const folderSearchInput = sidebar.createEl('input', {
      cls: 'image-selector-search-input image-selector-folder-search',
      attr: { type: 'text', placeholder: '🔍 Filter folders…', spellcheck: 'false' }
    });

    this.folderChipsContainer = sidebar.createDiv({ cls: 'image-selector-folder-list' });
    this.renderFolderChips();

    folderSearchInput.addEventListener('input', () => {
      this.renderFolderChips(folderSearchInput.value.trim().toLowerCase());
    });

    // ── RIGHT: Image panel ──
    const mainPanel = body.createDiv({ cls: 'image-selector-main' });

    // Top bar: image search + upload
    const topBar = mainPanel.createDiv({ cls: 'image-selector-top-bar' });
    const searchContainer = topBar.createDiv({ cls: 'image-selector-search' });
    const searchInput = searchContainer.createEl('input', {
      cls: 'image-selector-search-input',
      attr: {
        type: 'text',
        placeholder: '🔍 Search images…',
        spellcheck: 'false'
      }
    });

    const uploadBtn = topBar.createEl('button', {
      cls: 'image-selector-upload-btn',
      attr: { title: 'Upload an image from your computer' }
    });
    uploadBtn.innerHTML = '📁 Upload';
    uploadBtn.addEventListener('click', () => this.uploadFromExplorer());

    // Result count
    this.resultCountEl = mainPanel.createDiv({ cls: 'image-selector-result-count' });

    // File grid (card layout with previews)
    this.listContainer = mainPanel.createDiv({ cls: 'image-file-grid' });

    // Render initial list
    this.filterAndRender();

    // Wire up image search
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.filterAndRender();
    });

    // Focus image search input after modal opens
    setTimeout(() => searchInput.focus(), 50);
  }

  /** Render the folder list in the sidebar. Optionally filter by query. */
  private renderFolderChips(filterQuery?: string) {
    if (!this.folderChipsContainer) return;
    this.folderChipsContainer.empty();

    // "All" item
    const allItem = this.folderChipsContainer.createDiv({
      cls: `image-selector-folder-item${this.selectedFolder === '' ? ' is-active' : ''}`,
    });
    allItem.createSpan({ text: '📂  All Maps' });
    allItem.addEventListener('click', () => {
      this.selectedFolder = '';
      this.renderFolderChips(filterQuery);
      this.filterAndRender();
    });

    // Filtered folder list
    const folders = filterQuery
      ? this.folderPaths.filter(f => f.toLowerCase().includes(filterQuery))
      : this.folderPaths;

    for (const folder of folders) {
      const label = folder.split('/').pop() || folder;
      const depth = folder.split('/').length;
      const item = this.folderChipsContainer.createDiv({
        cls: `image-selector-folder-item${this.selectedFolder === folder ? ' is-active' : ''}`,
      });
      item.style.paddingLeft = `${8 + (depth - 1) * 14}px`;
      item.createSpan({ text: `📁  ${label}` });
      item.dataset.folder = folder;
      item.addEventListener('click', () => {
        this.selectedFolder = folder;
        this.renderFolderChips(filterQuery);
        this.filterAndRender();
      });
    }

    if (folders.length === 0 && filterQuery) {
      const empty = this.folderChipsContainer.createDiv({ cls: 'image-selector-folder-empty' });
      empty.setText('No matching folders');
    }
  }

  private filterAndRender() {
    const root = 'z_Assets/Maps';
    let filtered = this.files;

    // Apply folder filter
    if (this.selectedFolder) {
      const folderPrefix = `${root}/${this.selectedFolder}/`;
      filtered = filtered.filter(f => f.path.startsWith(folderPrefix));
    }

    // Apply search filter
    if (this.searchQuery) {
      const terms = this.searchQuery.split(/\s+/);
      filtered = filtered.filter(file => {
        const haystack = file.path.toLowerCase();
        return terms.every(term => haystack.includes(term));
      });
    }

    this.renderFileList(filtered);
  }

  private renderFileList(files: TFile[]) {
    if (!this.listContainer) return;
    this.listContainer.empty();

    // Update result count
    if (this.resultCountEl) {
      if (this.searchQuery || this.selectedFolder) {
        this.resultCountEl.setText(`${files.length} of ${this.files.length} maps`);
      } else {
        this.resultCountEl.setText(`${files.length} maps`);
      }
      this.resultCountEl.style.display = 'block';
    }

    if (files.length === 0) {
      const empty = this.listContainer.createDiv({ cls: 'image-file-list-empty' });
      empty.setText(this.searchQuery || this.selectedFolder ? 'No maps match your filters' : 'No map files found in z_Assets/Maps');
      return;
    }

    files.forEach(file => {
      const card = this.listContainer!.createDiv({ cls: 'image-file-card' });

      // Thumbnail preview
      const thumb = card.createDiv({ cls: 'image-file-card-thumb' });
      const ext = file.extension.toLowerCase();
      const isVideo = ['mp4', 'webm'].includes(ext);
      try {
        const resourcePath = this.app.vault.adapter.getResourcePath(file.path);
        if (isVideo) {
          const video = thumb.createEl('video', { attr: { src: resourcePath, muted: 'true', preload: 'metadata' } });
          video.addEventListener('loadeddata', () => {
            // Seek to first frame for thumbnail
            video.currentTime = 0.1;
          });
        } else {
          thumb.createEl('img', { attr: { src: resourcePath, loading: 'lazy', alt: file.name } });
        }
      } catch {
        // Fallback icon when resource cannot be resolved
        thumb.createDiv({ cls: 'image-file-card-thumb-fallback', text: isVideo ? '🎬' : '🖼️' });
      }

      // Info bar below thumb
      const info = card.createDiv({ cls: 'image-file-card-info' });
      info.createDiv({ cls: 'image-file-card-name', text: file.basename });
      // Show subfolder relative to z_Assets/Maps
      const relFolder = (file.parent?.path || '').replace(/^z_Assets\/Maps\/?/, '') || '/';
      info.createDiv({ cls: 'image-file-card-folder', text: `📁 ${relFolder}` });

      card.addEventListener('click', () => {
        this.onSelect(file);
        this.close();
      });
    });
  }

  /**
   * Open a system file dialog to upload an image into the vault
   */
  private async uploadFromExplorer() {
    // Create a hidden file input
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
        // Read the file as an ArrayBuffer
        const buffer = await file.arrayBuffer();

        // Always upload to z_Assets/Maps
        const destFolder = 'z_Assets/Maps';
        if (!(await this.app.vault.adapter.exists(destFolder))) {
          await this.app.vault.createFolder(destFolder);
        }

        // Build a safe path, deduplicating if needed
        let destPath = `${destFolder}/${file.name}`;
        let counter = 1;
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const ext = file.name.replace(/^.*\./, '.');
        while (await this.app.vault.adapter.exists(destPath)) {
          destPath = `${destFolder}/${baseName} (${counter})${ext}`;
          counter++;
        }

        // Write the file into the vault
        const created = await this.app.vault.createBinary(destPath, buffer);

        new Notice(`✅ Uploaded "${file.name}" to ${destPath}`);

        // Add to our file list, rebuild folder index, select it, and close
        this.files.unshift(created);
        this.buildFolderList();
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
    const { contentEl } = this;
    contentEl.empty();
  }
}
