import { App, TFile } from 'obsidian';
import { MapData, GridDetection, isVideoExtension } from './types';

/**
 * Stateless utilities for map creation, image analysis, and code-block generation.
 * Persistence is handled entirely by MapPersistence.
 */
export class MapManager {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Generate unique ID for maps
   */
  generateMapId(): string {
    return `map_${crypto.randomUUID()}`;
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
      const url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  /**
   * Load video from blob and get its dimensions
   */
  private loadVideo(blob: Blob): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const url = URL.createObjectURL(blob);
      video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video); };
      video.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      video.src = url;
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

    return mapData;
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

}
