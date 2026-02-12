/**
 * A marker definition stored in the global marker library
 */
export interface MarkerDefinition {
	id: string;
	name: string;
	icon: string; // Emoji or text
	backgroundColor: string; // Hex color
	borderColor?: string; // Optional border hex color
	size: number; // Diameter in pixels
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
