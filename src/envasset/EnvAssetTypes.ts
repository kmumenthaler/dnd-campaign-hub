/**
 * Environmental Asset Types for Battlemap System
 *
 * Environmental assets are PNG-based objects placed on the Background layer
 * of a battlemap. They represent scatter (rocks, foliage), doors/walls,
 * traps, and other environmental features that can be resized, rotated,
 * and configured with special behaviours.
 */

// ─── Core Asset Category ─────────────────────────────────────────────────────

/**
 * Top-level category for environmental assets.
 * - scatter: Decorative objects (rocks, foliage, debris) — optionally block vision
 * - door:    Openable barriers with pivot/slide mechanics — always block vision when closed
 * - trap:    Hazardous features (pit, spikes, etc.) — future expansion
 */
export type EnvAssetCategory = 'scatter' | 'door' | 'trap';

// ─── Door Sub-Types ──────────────────────────────────────────────────────────

/**
 * Specific door behaviour.
 * - normal:       Pivots on left or right edge (configurable)
 * - custom-pivot: Pivots on an arbitrary point set by the user
 * - sliding:      Slides along a user-defined path (animated in player view)
 */
export type DoorBehaviour = 'normal' | 'custom-pivot' | 'sliding';

/**
 * Which edge the door pivots on (for 'normal' doors).
 */
export type DoorPivotEdge = 'left' | 'right';

/**
 * Door-specific configuration stored per-definition and overridable per-instance.
 */
export interface DoorConfig {
	behaviour: DoorBehaviour;
	/** For normal doors: which edge to pivot on */
	pivotEdge?: DoorPivotEdge;
	/** For custom-pivot doors: normalised pivot point relative to asset bounds (0–1) */
	customPivot?: { x: number; y: number };
	/** For sliding doors: path waypoints in local (pixel) coordinates */
	slidePath?: Array<{ x: number; y: number }>;
	/** Current open-angle in degrees (0 = closed). Persisted per-instance. */
	openAngle?: number;
	/** Whether the door is currently open */
	isOpen?: boolean;
	/** Slide position (0 = start, 1 = end of slidePath). Persisted per-instance. */
	slidePosition?: number;
}

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

// ─── Trap Sub-Type Config (Stub for future) ──────────────────────────────────

/**
 * Trap-specific configuration — placeholder for future implementation.
 */
export interface TrapConfig {
	trapType?: 'pit' | 'spikes' | 'dispenser' | 'flamethrower' | 'custom';
	/** Whether the trap is visible to players or hidden */
	hidden?: boolean;
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
	doorConfig?: DoorConfig;
	scatterConfig?: ScatterConfig;
	trapConfig?: TrapConfig;
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
	/** Instance-level overrides for door/scatter/trap config */
	doorConfig?: DoorConfig;
	scatterConfig?: ScatterConfig;
	trapConfig?: TrapConfig;
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
	| 'rotate';

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
	{ value: 'scatter', label: 'Scatter', icon: '🪨', description: 'Rocks, foliage, debris, barrels, crates…' },
	{ value: 'door',    label: 'Door',    icon: '🚪', description: 'Doors, gates, portcullises — pivot or slide' },
	{ value: 'trap',    label: 'Trap',    icon: '⚠️', description: 'Pit traps, spike plates, flame vents…' },
];

export const DOOR_BEHAVIOURS: Array<{
	value: DoorBehaviour;
	label: string;
	icon: string;
	description: string;
}> = [
	{ value: 'normal',       label: 'Normal Door',  icon: '🚪', description: 'Pivots on left or right edge' },
	{ value: 'custom-pivot', label: 'Custom Pivot',  icon: '📌', description: 'Pivots on a user-defined point' },
	{ value: 'sliding',      label: 'Sliding Door',  icon: '↔️',  description: 'Slides along a defined path' },
];
