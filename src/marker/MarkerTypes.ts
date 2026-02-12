/**
 * Marker types for different use cases
 */
export type MarkerType = 'player' | 'npc' | 'creature' | 'poi' | 'other';

/**
 * D&D creature size categories with grid coverage
 * Tiny = shares a square with another, Small/Medium = 1×1, Large = 2×2, Huge = 3×3, Gargantuan = 4×4
 */
export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

/**
 * Grid squares covered per creature size
 */
export const CREATURE_SIZE_SQUARES: Record<CreatureSize, number> = {
	'tiny': 1,
	'small': 1,
	'medium': 1,
	'large': 2,
	'huge': 3,
	'gargantuan': 4
};

/**
 * A marker definition stored in the global marker library
 */
export interface MarkerDefinition {
	id: string;
	name: string;
	type: MarkerType;
	icon: string; // Emoji or text
	backgroundColor: string; // Hex color
	borderColor?: string; // Optional border hex color
	imageFile?: string; // Optional vault path to image for marker background
	// For player/npc/creature: size is driven by creatureSize
	creatureSize?: CreatureSize;
	// For poi/other: size is in pixels
	pixelSize?: number;
	createdAt: number;
	updatedAt: number;
}

/**
 * A marker reference placed on a map
 */
export interface MarkerReference {
	id: string; // Unique instance ID
	markerId: string; // Reference to MarkerDefinition.id
	position: {
		x: number;
		y: number;
	};
	placedAt: number;
}

/**
 * The marker library data structure
 */
export interface MarkerLibraryData {
	markers: MarkerDefinition[];
	version: string;
}
