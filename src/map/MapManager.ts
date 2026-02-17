import { App, TFile, Notice } from 'obsidian';
import { MapData, GridDetection, MAP_PRESETS, TravelPace, DND_TRAVEL_PACE_PRESETS, TravelCategory, isVideoExtension } from './types';

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

      let width: number;
      let height: number;

      if (isVideoExtension(file.extension)) {
        const video = await this.loadVideo(blob);
        width = video.videoWidth;
        height = video.videoHeight;
      } else {
        const img = await this.loadImage(blob);
        width = img.width;
        height = img.height;
      }

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
   * Load video from blob and get its dimensions
   */
  private loadVideo(blob: Blob): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve(video);
      video.onerror = reject;
      video.src = URL.createObjectURL(blob);
    });
  }

  /**
   * Get media dimensions from file (supports both images and videos)
   */
  async getImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer]);

      if (isVideoExtension(file.extension)) {
        const video = await this.loadVideo(blob);
        return { width: video.videoWidth, height: video.videoHeight };
      }

      const img = await this.loadImage(blob);
      return { width: img.width, height: img.height };
    } catch (error) {
      console.error('Error getting media dimensions:', error);
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
    const fileIsVideo = isVideoExtension(file.extension);

    const mapData: MapData = {
      id: this.generateMapId(),
      name,
      imageFile,
      isVideo: fileIsVideo || undefined,
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
    // Minimal code block - only mapId needed, everything else lives in the JSON file
    const config = {
      mapId: mapData.id
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

  /**
   * Initialize default travel paces for a hexcrawl map
   * Returns recommended paces based on common D&D travel methods
   */
  initializeDefaultTravelPaces(): TravelPace[] {
    // Select a subset of most commonly used paces
    const defaultPaceNames = [
      'Walking (Normal)',
      'Walking (Fast)', 
      'Walking (Slow)',
      'Horse (Riding)',
      'Sailing Ship',
      'Griffon'
    ];

    const paces: TravelPace[] = [];
    let idCounter = 1;

    for (const preset of DND_TRAVEL_PACE_PRESETS) {
      const isDefault = defaultPaceNames.includes(preset.name);
      paces.push({
        ...preset,
        id: `pace_${idCounter++}`,
        enabled: isDefault,
        visible: isDefault && preset.name === 'Walking (Normal)', // Only normal walking visible by default
      });
    }

    return paces;
  }

  /**
   * Create a custom travel pace
   */
  createCustomPace(
    name: string,
    category: TravelCategory,
    milesPerDay: number,
    color: string,
    icon?: string
  ): TravelPace {
    return {
      id: `pace_custom_${Date.now()}`,
      name,
      category,
      milesPerDay,
      color,
      icon,
      enabled: true,
      visible: true,
      isCustom: true
    };
  }

  /**
   * Calculate hex size (grid spacing) for a given pace relative to base calibration
   * @param basePaceMilesPerDay - The miles/day of the base/reference pace
   * @param baseGridSize - The grid size (pixels) of the base pace
   * @param targetPaceMilesPerDay - The miles/day of the target pace
   * @returns The calculated grid size for the target pace
   */
  calculateHexSizeForPace(
    basePaceMilesPerDay: number,
    baseGridSize: number,
    targetPaceMilesPerDay: number
  ): number {
    // Hex size scales linearly with travel distance
    // If normal = 24 mi/day at 100px, then fast = 30 mi/day should be 125px
    return (targetPaceMilesPerDay / basePaceMilesPerDay) * baseGridSize;
  }

  /**
   * Calculate base calibration (pixels per mile) from a reference pace
   */
  calculateBaseCalibration(gridSize: number, milesPerDay: number): number {
    // Each hex represents one day of travel at the given pace
    // So pixels per mile = gridSize / milesPerDay
    return gridSize / milesPerDay;
  }
}
