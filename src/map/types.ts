/**
 * Map Manager Type Definitions
 */

import type { HexTerrain, HexClimate, HexcrawlState } from '../hexcrawl/types';

export type MapTool = 'pan' | 'select' | 'draw' | 'ruler' | 'target-distance' | 'poi';

export type PoiType = 'settlement' | 'dungeon' | 'landmark' | 'danger' | 'quest' | 'custom';

export interface PoiReference {
  id: string; // Unique reference ID
  poiFile: string; // Path to PoI note in vault
  col: number; // Hex column coordinate
  row: number; // Hex row coordinate
  layer: 'DM' | 'Player'; // Visibility layer
  addedAt: number; // Timestamp
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
  hexTerrains?: HexTerrain[]; // Per-hex terrain assignments for hexcrawl
  hexClimates?: HexClimate[]; // Per-hex climate zone assignments for hexcrawl
  customTerrainDescriptions?: Record<string, string[]>; // GM custom read-aloud descriptions per terrain type
  hexcrawlState?: HexcrawlState; // Hexcrawl travel tracker state
  rulerCalibration?: number; // pixels per unit (for ruler accuracy)
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

