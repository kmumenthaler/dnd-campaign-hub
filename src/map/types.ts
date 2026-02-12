/**
 * Map Manager Type Definitions
 */

export interface MapData {
  id: string;
  name: string;
  imageFile: string; // Path to image in vault
  type: 'battlemap' | 'world' | 'regional';
  gridType: 'square' | 'hex-horizontal' | 'hex-vertical' | 'none';
  gridSize: number; // pixels per grid cell
  scale: {
    value: number; // e.g., 5
    unit: 'feet' | 'miles' | 'km';
  };
  dimensions: {
    width: number;
    height: number;
  };
  tokens: Token[];
  linkedScene?: string; // Link to scene note
  linkedEncounter?: string; // Link to encounter file
  createdDate: string;
  lastModified: string;
}

export interface Token {
  id: string;
  name: string;
  icon: string; // emoji or icon path
  position: { x: number; y: number }; // grid coordinates
  size: number; // grid cells (1 for medium, 2 for large, etc.)
  color?: string;
  creatureData?: any; // Link to creature statblock
}

export interface GridDetection {
  suggestedSize: number;
  confidence: 'high' | 'medium' | 'low';
  preset?: 'roll20' | 'foundry' | 'high-res';
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface MapPreset {
  name: string;
  gridSize: number;
  description: string;
}

export const MAP_PRESETS: MapPreset[] = [
  { name: 'Roll20 Standard', gridSize: 70, description: 'Standard Roll20 export (70px/square)' },
  { name: 'Foundry VTT', gridSize: 100, description: 'Foundry VTT default (100px/square)' },
  { name: 'High Resolution', gridSize: 140, description: 'High-res battle maps (140px/square)' },
  { name: 'Custom', gridSize: 50, description: 'Custom grid size' }
];
