/**
 * Marker types for different use cases
 */
export type MarkerType = 'player' | 'npc' | 'creature' | 'poi' | 'other';

/**
 * Layer types for organizing map content
 * - Player: Ground level, visible to all
 * - Elevated: Flying creatures, visible to all with transparency
 * - Subterranean: Underground but visible, shown with transparency
 * - DM: Hidden from players (actively burrowing creatures)
 * - Background: Map features
 */
export type Layer = 'Player' | 'DM' | 'Background' | 'Elevated' | 'Subterranean';

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
 * Elevation data for tokens (flight and burrowing)
 */
export interface TokenElevation {
	height?: number;      // feet above ground (flying)
	depth?: number;       // feet below ground (burrowing)
	isBurrowing?: boolean; // actively burrowed (affects visibility)
	leaveTunnel?: boolean; // creature leaves tunnel behind
}

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
	// Darkvision range in feet (for player/npc/creature tokens)
	darkvision?: number;
	createdAt: number;
	updatedAt: number;
}

/**
 * Tunnel traversal state for tokens inside tunnels
 */
export interface TunnelState {
	tunnelId: string;      // Which tunnel the token is in
	pathIndex: number;     // Current position along the tunnel path
	enteredAt: number;     // Timestamp when token entered
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
	layer?: Layer; // Which layer this marker belongs to (defaults to 'Player')
	elevation?: TokenElevation; // Elevation data for flight/burrowing
	tunnelState?: TunnelState; // Tunnel traversal state (when token is in a tunnel)
}

/**
 * The marker library data structure
 */
export interface MarkerLibraryData {
	markers: MarkerDefinition[];
	version: string;
}

/**
 * Represents a tunnel segment left behind by a burrowing creature
 */
export interface TunnelSegment {
	id: string;                        // Unique tunnel ID
	creatorMarkerId: string;           // ID of the marker that created this tunnel
	entrancePosition: { x: number; y: number }; // Where the creature first burrowed
	path: { x: number; y: number; elevation?: number }[];  // Positions traveled while burrowed (elevation in feet)
	creatureSize: CreatureSize;        // Determines tunnel width/visibility
	depth: number;                     // Depth in feet (inherited by tokens entering tunnel)
	createdAt: number;                 // Timestamp
	visible: boolean;                  // Whether entrance is visible to players
	active: boolean;                   // Whether tunnel is currently being extended
}
