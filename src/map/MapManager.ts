import { App, TFile, Notice } from 'obsidian';
import { MapData, GridDetection, MAP_PRESETS } from './types';

/**
 * Manages map creation, storage, and retrieval
 */
export class MapManager {
  private app: App;
  private maps: Map<string, MapData>;

  constructor(app: App) {
    this.app = app;
    this.maps = new Map();
  }

  /**
   * Generate unique ID for maps
   */
  generateMapId(): string {
    return `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Analyze image and suggest grid size
   */
  async analyzeImage(file: TFile): Promise<GridDetection> {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer]);
      const img = await this.loadImage(blob);

      const width = img.width;
      const height = img.height;

      // Heuristic: common map resolutions
      // Roll20: multiples of 70px
      // Foundry: multiples of 100px
      // High-res: multiples of 140px

      const sizes = [70, 100, 140];
      let bestMatch = 70;
      let bestScore = 0;

      for (const size of sizes) {
        const cols = width / size;
        const rows = height / size;
        
        // Check if divisions are close to whole numbers
        const colScore = 1 - Math.abs(cols - Math.round(cols));
        const rowScore = 1 - Math.abs(rows - Math.round(rows));
        const score = (colScore + rowScore) / 2;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = size;
        }
      }

      const confidence = bestScore > 0.9 ? 'high' : bestScore > 0.7 ? 'medium' : 'low';
      const preset = bestMatch === 70 ? 'roll20' : bestMatch === 100 ? 'foundry' : bestMatch === 140 ? 'high-res' : undefined;

      return {
        suggestedSize: bestMatch,
        confidence,
        preset
      };
    } catch (error) {
      console.error('Error analyzing image:', error);
      return {
        suggestedSize: 70,
        confidence: 'low'
      };
    }
  }

  /**
   * Load image from blob
   */
  private loadImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * Get image dimensions from file
   */
  async getImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer]);
      const img = await this.loadImage(blob);
      return { width: img.width, height: img.height };
    } catch (error) {
      console.error('Error getting image dimensions:', error);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Create a new map
   */
  async createMap(
    name: string,
    imageFile: string,
    type: 'battlemap' | 'world' | 'regional',
    gridType: 'square' | 'hex-horizontal' | 'hex-vertical' | 'none',
    gridSize: number,
    scaleValue: number,
    scaleUnit: 'feet' | 'miles' | 'km'
  ): Promise<MapData> {
    const file = this.app.vault.getAbstractFileByPath(imageFile);
    if (!file || !(file instanceof TFile)) {
      throw new Error('Image file not found');
    }

    const dimensions = await this.getImageDimensions(file);
    const now = new Date().toISOString();

    const mapData: MapData = {
      id: this.generateMapId(),
      name,
      imageFile,
      type,
      gridType,
      gridSize,
      scale: { value: scaleValue, unit: scaleUnit },
      dimensions,
      tokens: [],
      createdDate: now,
      lastModified: now
    };

    this.maps.set(mapData.id, mapData);
    return mapData;
  }

  /**
   * Get map by ID
   */
  getMap(id: string): MapData | undefined {
    return this.maps.get(id);
  }

  /**
   * Update map
   */
  updateMap(id: string, updates: Partial<MapData>): void {
    const map = this.maps.get(id);
    if (map) {
      Object.assign(map, updates, { lastModified: new Date().toISOString() });
    }
  }

  /**
   * Delete map
   */
  deleteMap(id: string): void {
    this.maps.delete(id);
  }

  /**
   * Generate markdown code block for map
   */
  generateMapCodeBlock(mapData: MapData): string {
    const config = {
      mapId: mapData.id,
      name: mapData.name,
      imageFile: mapData.imageFile,
      type: mapData.type,
      gridType: mapData.gridType,
      gridSize: mapData.gridSize,
      scale: mapData.scale,
      dimensions: mapData.dimensions
    };

    return `\`\`\`dnd-map
${JSON.stringify(config, null, 2)}
\`\`\``;
  }

  /**
   * Parse map code block from markdown
   */
  parseMapCodeBlock(content: string): MapData | null {
    try {
      const match = content.match(/```dnd-map\n([\s\S]*?)\n```/);
      if (match && match[1]) {
        const config = JSON.parse(match[1]);
        return {
          ...config,
          tokens: [],
          createdDate: config.createdDate || new Date().toISOString(),
          lastModified: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('Error parsing map code block:', error);
    }
    return null;
  }
}
