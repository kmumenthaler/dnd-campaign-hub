/**
 * Environmental Asset Types for Battlemap System
 *
 * Environmental assets are PNG-based objects placed on the Background layer
 * of a battlemap. They represent scatter objects (rocks, foliage, custom
 * images, GIFs/animations, etc.) that can be resized, rotated, and
 * configured with special behaviours like vision-blocking.
 */

// ─── Core Asset Category ─────────────────────────────────────────────────────

/**
 * Top-level category for environmental assets.
 * - scatter: Custom images/animations (rocks, foliage, debris, GIFs) — optionally block vision
 */
export type EnvAssetCategory = 'scatter';

// ─── Scatter Sub-Type Config ─────────────────────────────────────────────────

/**
 * Scatter-specific configuration.
 */
export interface ScatterConfig {
	/** Whether this scatter asset blocks vision (line-of-sight) */
	blocksVision: boolean;
	/** If blocksVision is true, the effective wall height in feet (for partial cover) */
	wallHeight?: number;
}

// ─── Asset Definition (Library Entry) ────────────────────────────────────────

/**
 * An environmental-asset definition stored in the global asset library.
 * Analogous to `MarkerDefinition` for tokens.
 */
export interface EnvAssetDefinition {
	id: string;
	name: string;
	category: EnvAssetCategory;
	/** Vault path to the PNG image file */
	imageFile: string;
	/** Default width in pixels (as authored) */
	defaultWidth: number;
	/** Default height in pixels (as authored) */
	defaultHeight: number;
	/** Category-specific configuration */
	scatterConfig?: ScatterConfig;
	/** Optional campaign scope */
	campaign?: string;
	createdAt: number;
	updatedAt: number;
}

// ─── Asset Instance (Placed on Map) ──────────────────────────────────────────

/**
 * A placed instance of an environmental asset on a specific map.
 * Stored in the map annotation JSON alongside markers, walls, etc.
 */
export interface EnvAssetInstance {
	/** Unique instance ID */
	id: string;
	/** Reference to EnvAssetDefinition.id */
	assetId: string;
	/** Center position on the map in pixels */
	position: { x: number; y: number };
	/** Display width in pixels (after user resize) */
	width: number;
	/** Display height in pixels (after user resize) */
	height: number;
	/** Rotation in degrees (clockwise) */
	rotation: number;
	/** Z-order within the background layer (higher = on top) */
	zIndex: number;
	/** Instance-level overrides for scatter config */
	scatterConfig?: ScatterConfig;
	/** Whether this asset is locked (prevents accidental move/resize) */
	locked?: boolean;
	/** Timestamp */
	placedAt: number;
}

// ─── Library Data Wrapper ────────────────────────────────────────────────────

/**
 * Persisted library data for env assets (analogous to MarkerLibraryData).
 */
export interface EnvAssetLibraryData {
	assets: EnvAssetDefinition[];
	version: string;
}

// ─── Transform Handle Geometry ───────────────────────────────────────────────

/**
 * Handle positions for the selection / transform frame drawn around a
 * selected asset. Matches standard image-editor conventions.
 */
export type TransformHandle =
	| 'top-left' | 'top' | 'top-right'
	| 'right' | 'bottom-right' | 'bottom' | 'bottom-left'
	| 'left'
	| 'rotate'
	| 'pivot';

/**
 * Size of transform handles in CSS pixels.
 */
export const TRANSFORM_HANDLE_SIZE = 8;

/**
 * Distance of the rotation handle above the asset bounding box (in CSS pixels).
 */
export const ROTATION_HANDLE_OFFSET = 24;

// ─── Category Metadata ───────────────────────────────────────────────────────

export const ENV_ASSET_CATEGORIES: Array<{
	value: EnvAssetCategory;
	label: string;
	icon: string;
	description: string;
}> = [
	{ value: 'scatter', label: 'Scatter', icon: '🪨', description: 'Custom images, animations, rocks, foliage, debris…' },
];
