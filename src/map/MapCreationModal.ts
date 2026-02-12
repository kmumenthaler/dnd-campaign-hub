import { App, Modal, Setting, TFile, Notice, MarkdownView } from 'obsidian';
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

    contentEl.createEl('h2', { text: this.editMode ? '🗺️ Edit Battle Map' : '🗺️ Create Battle Map' });

    // Step 1: Select Image
    this.createImageSelector(contentEl);

    // Step 2: Map Configuration
    this.createConfigSection(contentEl);

    // Step 3: Grid Configuration
    this.createGridSection(contentEl);

    // Preview
    this.createPreviewSection(contentEl);

    // Buttons
    this.createButtons(contentEl);
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
        
        // Replace the existing code block in the editor
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          const editor = activeView.editor;
          const content = editor.getValue();
          
          // Generate old and new code blocks
          const oldCodeBlock = this.mapManager.generateMapCodeBlock(this.editConfig);
          const newCodeBlock = this.mapManager.generateMapCodeBlock(mapData);
          
          // Try to replace - if not found, search for the map ID specifically
          let newContent = content.replace(oldCodeBlock, newCodeBlock);
          if (newContent === content) {
            // Fallback: search for any code block with this mapId
            const mapIdPattern = new RegExp(`\`\`\`dnd-map\\s*\\n[^\`]*"mapId"\\s*:\\s*"${mapData.id}"[^\`]*\`\`\``, 's');
            newContent = content.replace(mapIdPattern, newCodeBlock);
          }
          
          editor.setValue(newContent);
        }
        
        new Notice(`✅ Map "${this.mapName}" updated`);
      } else {
        // Create mode: insert new code block
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
    this.onOpen();
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
