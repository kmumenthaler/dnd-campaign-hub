import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import { MapManager } from './MapManager';
import { MAP_PRESETS } from './types';
import type DndCampaignHubPlugin from '../main';

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
  private editMode: boolean = false;
  private editConfig: any = null;
  private editElement: HTMLElement | null = null;
  private importMode: boolean = false;
  private selectedExistingMapId: string | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, mapManager: MapManager, editConfig?: any, editElement?: HTMLElement) {
    super(app);
    this.plugin = plugin;
    this.mapManager = mapManager;
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
    } else if (this.importMode) {
      // Import mode: show form pre-filled
      contentEl.createEl('h2', { text: '🗺️ Import Existing Map' });
      this.buildMapForm(contentEl);
    } else {
      // Initial mode: show choice
      contentEl.createEl('h2', { text: '🗺️ Add Map' });
      this.buildModeChooser(contentEl);
    }
  }

  /**
   * Build the mode chooser (new vs import)
   */
  private async buildModeChooser(container: HTMLElement) {
    const desc = container.createEl('p', { 
      text: 'Create a new map or import an existing one into this note.',
      cls: 'setting-item-description' 
    });
    desc.style.marginBottom = '20px';

    // Load existing maps
    const existingMaps = await this.loadExistingMaps();

    const choiceContainer = container.createDiv();
    choiceContainer.style.display = 'flex';
    choiceContainer.style.flexDirection = 'column';
    choiceContainer.style.gap = '12px';

    // New map button
    const newMapBtn = choiceContainer.createEl('button', { text: '➕ Create New Map' });
    newMapBtn.style.padding = '16px';
    newMapBtn.style.fontSize = '16px';
    newMapBtn.style.cursor = 'pointer';
    newMapBtn.style.borderRadius = '8px';
    newMapBtn.style.border = '1px solid var(--background-modifier-border)';
    newMapBtn.style.backgroundColor = 'var(--interactive-accent)';
    newMapBtn.style.color = 'var(--text-on-accent)';
    newMapBtn.addEventListener('click', () => {
      this.importMode = false;
      // Clear and rebuild with form
      const { contentEl } = this;
      contentEl.empty();
      contentEl.addClass('dnd-map-creation-modal');
      contentEl.createEl('h2', { text: '🗺️ Create Battle Map' });
      this.buildMapForm(contentEl);
    });

    if (existingMaps.length > 0) {
      const separator = choiceContainer.createDiv();
      separator.style.textAlign = 'center';
      separator.style.color = 'var(--text-muted)';
      separator.style.margin = '4px 0';
      separator.setText('— or —');

      const importSection = choiceContainer.createDiv();
      importSection.createEl('h3', { text: '📥 Import Existing Map' });
      importSection.style.marginBottom = '8px';

      const mapList = importSection.createDiv();
      mapList.style.maxHeight = '300px';
      mapList.style.overflowY = 'auto';
      mapList.style.border = '1px solid var(--background-modifier-border)';
      mapList.style.borderRadius = '8px';

      existingMaps.forEach((mapInfo: any) => {
        const item = mapList.createDiv();
        item.style.padding = '10px 14px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid var(--background-modifier-border)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        const left = item.createDiv();
        const typeEmoji = mapInfo.type === 'battlemap' ? '⚔️' : mapInfo.type === 'world' ? '🌎' : '🗺️';
        left.createEl('strong', { text: `${typeEmoji} ${mapInfo.name || 'Unnamed Map'}` });
        const details = left.createDiv();
        details.style.fontSize = '12px';
        details.style.color = 'var(--text-muted)';
        details.setText(`${mapInfo.gridType || 'no grid'} • ${mapInfo.imageFile || 'no image'}`);

        const importBtn = item.createEl('button', { text: 'Import' });
        importBtn.style.padding = '4px 12px';
        importBtn.style.fontSize = '12px';

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--background-modifier-hover)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });

        importBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.importExistingMap(mapInfo);
        });

        item.addEventListener('click', async () => {
          await this.importExistingMap(mapInfo);
        });
      });
    }

    // Cancel
    const cancelContainer = container.createDiv();
    cancelContainer.style.display = 'flex';
    cancelContainer.style.justifyContent = 'flex-end';
    cancelContainer.style.marginTop = '20px';
    const cancelBtn = cancelContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
  }

  /**
   * Load existing map JSON files from plugin config directory
   */
  private async loadExistingMaps(): Promise<any[]> {
    const maps: any[] = [];
    try {
      const annotationDir = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/map-annotations`;
      if (await this.app.vault.adapter.exists(annotationDir)) {
        const listing = await this.app.vault.adapter.list(annotationDir);
        for (const filePath of listing.files) {
          if (filePath.endsWith('.json')) {
            try {
              const content = await this.app.vault.adapter.read(filePath);
              const data = JSON.parse(content);
              if (data.mapId) {
                maps.push(data);
              }
            } catch (e) {
              console.log('Failed to read map file:', filePath, e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading existing maps:', error);
    }
    return maps;
  }

  /**
   * Import an existing map into the current note
   */
  private async importExistingMap(mapInfo: any) {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice('No active file to insert map into');
        return;
      }

      const editor = this.app.workspace.activeEditor?.editor;
      if (!editor) {
        new Notice('No active editor');
        return;
      }

      // Build a minimal code block that references the mapId
      // The renderMapView will load full config from the JSON
      const config = {
        mapId: mapInfo.mapId
      };

      const codeBlock = `\`\`\`dnd-map\n${JSON.stringify(config, null, 2)}\n\`\`\``;
      editor.replaceSelection(`\n${codeBlock}\n`);
      
      new Notice(`✅ Map "${mapInfo.name || 'Unnamed'}" imported into note`);
      this.close();
    } catch (error) {
      console.error('Error importing map:', error);
      new Notice('Failed to import map');
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
      .setDesc('Choose an image file from your vault (PNG, JPG, WEBP)')
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

  private async selectImageFromVault() {
    // Get all image files from vault
    const imageFiles = this.app.vault.getFiles().filter(file => {
      const ext = file.extension.toLowerCase();
      return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
    });

    if (imageFiles.length === 0) {
      new Notice('No image files found in vault');
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
    section.createEl('h3', { text: 'Step 2: Map Configuration' });

    new Setting(section)
      .setName('Map name')
      .setDesc('Name for this map')
      .addText(text => {
        text
          .setPlaceholder('Tavern Brawl')
          .setValue(this.mapName)
          .onChange(value => {
            this.mapName = value;
          });
        text.inputEl.name = 'mapName';
      });

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
    this.previewContainer.setText('Select an image to see preview');
  }

  private createButtons(container: HTMLElement) {
    const buttonContainer = container.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const createBtn = buttonContainer.createEl('button', { text: this.editMode ? 'Save Changes' : 'Create Map' });
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

      // Save full config to JSON file immediately
      const fullConfig = {
        mapId: mapData.id,
        name: mapData.name,
        imageFile: mapData.imageFile,
        type: mapData.type,
        dimensions: mapData.dimensions,
        gridType: mapData.gridType,
        gridSize: mapData.gridSize,
        scale: mapData.scale,
        highlights: [],
        markers: [],
        drawings: []
      };
      // Use a dummy element since we don't have a rendered map yet
      await this.plugin.saveMapAnnotations(fullConfig, document.createElement('div'));

      if (this.editMode && this.editConfig) {
        // Edit mode: code block already has mapId, just update the JSON
        new Notice(`✅ Map "${this.mapName}" updated`);
      } else {
        // Create mode: insert minimal code block with just mapId
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const editor = this.app.workspace.activeEditor?.editor;
          if (editor) {
            const codeBlock = this.mapManager.generateMapCodeBlock(mapData);
            editor.replaceSelection(`\n${codeBlock}\n`);
            new Notice(`✅ Map "${this.mapName}" inserted into note`);
          }
        }
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
    const title = this.editMode ? 'Edit Battle Map' : 'Create Battle Map';
    contentEl.createEl('h2', { text: `🗺️ ${title}` });
    this.buildMapForm(contentEl);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Simple modal for selecting an image file
 */
class ImageSelectorModal extends Modal {
  private files: TFile[];
  private onSelect: (file: TFile) => void;

  constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Select Map Image' });

    const listContainer = contentEl.createDiv({ cls: 'image-file-list' });
    listContainer.style.maxHeight = '400px';
    listContainer.style.overflowY = 'auto';

    this.files.forEach(file => {
      const item = listContainer.createDiv({ cls: 'image-file-item' });
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';
      item.style.borderBottom = '1px solid var(--background-modifier-border)';
      
      item.createSpan({ text: `📄 ${file.path}` });
      
      item.onClickEvent(() => {
        this.onSelect(file);
        this.close();
      });

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--background-modifier-hover)';
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
