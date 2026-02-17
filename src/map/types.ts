/**
 * Map Manager Type Definitions
 */

export type MapTool = 'pan' | 'select' | 'draw' | 'ruler' | 'target-distance' | 'poi';

export type TravelCategory = 'land' | 'water' | 'air' | 'magic' | 'custom';

export type PoiType = 'settlement' | 'dungeon' | 'landmark' | 'danger' | 'quest' | 'custom';

export interface PoiReference {
  id: string; // Unique reference ID
  poiFile: string; // Path to PoI note in vault
  col: number; // Hex column coordinate
  row: number; // Hex row coordinate
  paceId?: string; // Optional: for multi-pace maps
  layer: 'DM' | 'Player'; // Visibility layer
  addedAt: number; // Timestamp
}

export interface TravelPace {
  id: string;
  name: string;
  category: TravelCategory;
  milesPerDay: number;
  color: string;
  icon?: string;
  enabled: boolean;
  visible: boolean; // Show overlay on map
  isCustom: boolean;
  // Future extensibility:
  terrainModifiers?: Record<string, number>; // e.g., {"difficult": 0.5}
  weatherEffects?: Record<string, number>;
  exhaustionPenalty?: number;
  metadata?: Record<string, any>; // catch-all for future features
}

/**
 * Supported image extensions for map backgrounds
 */
export const MAP_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'apng', 'avif'];

/**
 * Supported video extensions for animated map backgrounds
 */
export const MAP_VIDEO_EXTENSIONS = ['mp4', 'webm'];

/**
 * All supported media extensions for map backgrounds
 */
export const MAP_MEDIA_EXTENSIONS = [...MAP_IMAGE_EXTENSIONS, ...MAP_VIDEO_EXTENSIONS];

/**
 * Check if a file extension is a video format
 */
export function isVideoExtension(ext: string): boolean {
  return MAP_VIDEO_EXTENSIONS.includes(ext.toLowerCase());
}

/**
 * Check if a file extension is a supported map media format
 */
export function isMapMediaExtension(ext: string): boolean {
  return MAP_MEDIA_EXTENSIONS.includes(ext.toLowerCase());
}

export interface MapData {
  id: string;
  name: string;
  imageFile: string; // Path to image/video in vault
  isVideo?: boolean; // True if the map background is a video file (mp4, webm)
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
  highlights?: HexHighlight[];
  drawings?: Drawing[];
  markers?: Marker[];
  poiReferences?: PoiReference[]; // Points of Interest on hexcrawl maps
  rulerCalibration?: number; // pixels per unit (for ruler accuracy)
  travelPaces?: TravelPace[]; // Available travel paces for hexcrawl maps
  activePaceId?: string; // Currently active pace (synced to player view)
  baseCalibration?: number; // pixels per mile for calculating relative hex sizes
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

export interface HexHighlight {
  id: string;
  col: number;
  row: number;
  color: string;
  label?: string;
}

export interface Drawing {
  id: string;
  type: 'line' | 'rectangle' | 'circle' | 'polygon' | 'freehand';
  points: Point[];
  color: string;
  strokeWidth: number;
  filled?: boolean;
  label?: string;
}

export interface Marker {
  id: string;
  position: Point;
  icon: string;
  label?: string;
  color?: string;
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

/**
 * D&D 5e Travel Pace Presets
 * Based on Player's Handbook travel speeds
 */
export const DND_TRAVEL_PACE_PRESETS: Omit<TravelPace, 'id' | 'enabled' | 'visible'>[] = [
  // Land Travel - Walking
  { name: 'Walking (Slow)', category: 'land', milesPerDay: 18, color: '#8B4513', icon: '🚶', isCustom: false },
  { name: 'Walking (Normal)', category: 'land', milesPerDay: 24, color: '#A0522D', icon: '🚶', isCustom: false },
  { name: 'Walking (Fast)', category: 'land', milesPerDay: 30, color: '#D2691E', icon: '🏃', isCustom: false },
  
  // Land Travel - Mounted
  { name: 'Horse (Riding)', category: 'land', milesPerDay: 48, color: '#8B6914', icon: '🐴', isCustom: false },
  { name: 'Horse (Draft)', category: 'land', milesPerDay: 40, color: '#9A7518', icon: '🐴', isCustom: false },
  { name: 'Pony', category: 'land', milesPerDay: 32, color: '#A68019', icon: '🐎', isCustom: false },
  { name: 'Camel', category: 'land', milesPerDay: 40, color: '#C19A6B', icon: '🐪', isCustom: false },
  { name: 'Elephant', category: 'land', milesPerDay: 32, color: '#808080', icon: '🐘', isCustom: false },
  
  // Land Travel - Vehicles
  { name: 'Cart/Wagon', category: 'land', milesPerDay: 16, color: '#654321', icon: '🛒', isCustom: false },
  { name: 'Carriage', category: 'land', milesPerDay: 32, color: '#704214', icon: '🎠', isCustom: false },
  
  // Water Travel
  { name: 'Rowboat', category: 'water', milesPerDay: 15, color: '#4682B4', icon: '🚣', isCustom: false },
  { name: 'Keelboat', category: 'water', milesPerDay: 12, color: '#5F9EA0', icon: '⛵', isCustom: false },
  { name: 'Longship', category: 'water', milesPerDay: 36, color: '#4169E1', icon: '⛵', isCustom: false },
  { name: 'Sailing Ship', category: 'water', milesPerDay: 48, color: '#1E90FF', icon: '⛵', isCustom: false },
  { name: 'Galley', category: 'water', milesPerDay: 60, color: '#00BFFF', icon: '🚢', isCustom: false },
  { name: 'Warship', category: 'water', milesPerDay: 30, color: '#191970', icon: '⚓', isCustom: false },
  
  // Air Travel - Mounts
  { name: 'Griffon', category: 'air', milesPerDay: 64, color: '#DAA520', icon: '🦅', isCustom: false },
  { name: 'Hippogriff', category: 'air', milesPerDay: 64, color: '#B8860B', icon: '🦅', isCustom: false },
  { name: 'Pegasus', category: 'air', milesPerDay: 72, color: '#FFD700', icon: '🦄', isCustom: false },
  { name: 'Wyvern', category: 'air', milesPerDay: 64, color: '#8B0000', icon: '🐉', isCustom: false },
  { name: 'Giant Eagle', category: 'air', milesPerDay: 64, color: '#CD853F', icon: '🦅', isCustom: false },
  
  // Air Travel - Magic Items
  { name: 'Broom of Flying', category: 'air', milesPerDay: 72, color: '#9370DB', icon: '🧹', isCustom: false },
  { name: 'Carpet of Flying', category: 'air', milesPerDay: 64, color: '#BA55D3', icon: '🧵', isCustom: false },
  { name: 'Phantom Steed', category: 'magic', milesPerDay: 104, color: '#8A2BE2', icon: '✨', isCustom: false },
  
  // Air Travel - Dragons (by age category)
  { name: 'Dragon (Young)', category: 'air', milesPerDay: 80, color: '#DC143C', icon: '🐉', isCustom: false },
  { name: 'Dragon (Adult)', category: 'air', milesPerDay: 80, color: '#B22222', icon: '🐉', isCustom: false },
  { name: 'Dragon (Ancient)', category: 'air', milesPerDay: 80, color: '#8B0000', icon: '🐉', isCustom: false },
];

/**
 * Point of Interest Types for Hexcrawl Maps
 */
export const POI_TYPES: Array<{ value: PoiType; label: string; icon: string; color: string; description: string }> = [
  { value: 'settlement', label: 'Settlement', icon: '�️', color: '#3b82f6', description: 'Towns, cities, villages, outposts' },
  { value: 'dungeon', label: 'Dungeon', icon: '⚔️', color: '#ef4444', description: 'Dungeons, ruins, lairs' },
  { value: 'landmark', label: 'Landmark', icon: '⛰️', color: '#10b981', description: 'Natural features and notable locations' },
  { value: 'danger', label: 'Danger', icon: '⚠️', color: '#dc2626', description: 'Threats and hazards' },
  { value: 'quest', label: 'Quest', icon: '⭐', color: '#8b5cf6', description: 'Story-driven locations' },
  { value: 'custom', label: 'Custom', icon: '⬤', color: '#6b7280', description: 'Custom point of interest' },
];

