/**
 * MapController — clean API for external systems to query and manipulate
 * the active map instance without reaching into renderMapView's closure.
 *
 * Usage pattern:
 *   1. renderMapView registers a MapHandle when a map opens
 *   2. renderMapView unregisters when the map is torn down
 *   3. External code (CombatTracker, EncounterBuilder, etc.) calls
 *      plugin.mapController.placeToken(...) etc.
 *
 * This keeps the map system self-contained while providing a robust,
 * typed interface for integrations.
 */

import type DndCampaignHubPlugin from "../main";
import type { MarkerDefinition, MarkerReference, CreatureSize, Layer } from "../marker/MarkerTypes";
import { CREATURE_SIZE_SQUARES } from "../marker/MarkerTypes";
import { Notice, TFile } from "obsidian";

/* ── Types exposed to consumers ── */

/** Result of a placeToken call. */
export interface PlaceTokenResult {
	success: boolean;
	/** The placed MarkerReference instance id, if successful. */
	instanceId?: string;
	/** Human-readable reason when success=false. */
	reason?: string;
}

/**
 * Internal handle registered by renderMapView.
 * Not exported — only MapController touches this.
 */
export interface MapHandle {
	mapId: string;
	/** Live reference to the map's config object (markers, gridSize, etc.) */
	config: any;
	/** Re-draw all annotations on the canvas. */
	redrawAnnotations: () => void;
	/** Push current state onto undo stack. */
	saveToHistory: () => void;
	/** Sync the player-view projection (if active). */
	syncPlayerView: () => void;
	/** Persist config to disk (debounced). */
	save: () => void;
	/** The DOM element hosting this map (used by saveMapAnnotations). */
	el: HTMLElement;
}

export class MapController {
	private plugin: DndCampaignHubPlugin;
	/** Currently registered map handle (only one map active at a time). */
	private handle: MapHandle | null = null;

	constructor(plugin: DndCampaignHubPlugin) {
		this.plugin = plugin;
	}

	/* ═══════════════════════ Registration ═══════════════════════ */

	/**
	 * Called by renderMapView when a map becomes interactive.
	 * Returns an unregister callback for cleanup.
	 */
	register(handle: MapHandle): () => void {
		this.handle = handle;
		return () => {
			if (this.handle === handle) this.handle = null;
		};
	}

	/* ═══════════════════════ Queries ═══════════════════════ */

	/** Is a map currently rendered and interactive? */
	isMapActive(): boolean {
		return this.handle !== null;
	}

	/** The mapId of the currently active map, or null. */
	getMapId(): string | null {
		return this.handle?.mapId ?? null;
	}

	/** Grid size in pixels of the active map, or null. */
	getGridSize(): number | null {
		return this.handle?.config?.gridSize ?? null;
	}

	/** All currently placed marker references on the map. */
	getPlacedMarkers(): readonly MarkerReference[] {
		return this.handle?.config?.markers ?? [];
	}

	/**
	 * Check whether a marker definition is already placed on the map.
	 * Optionally narrow by border colour (for colour-coded duplicates).
	 */
	hasMarkerOnMap(markerId: string, borderColor?: string): boolean {
		const markers: MarkerReference[] = this.handle?.config?.markers ?? [];
		return markers.some((m) => {
			if (m.markerId !== markerId) return false;
			if (borderColor && (m as any).borderColor !== borderColor) return false;
			return true;
		});
	}

	/**
	 * Check whether a combatant already has a matching token placed.
	 * Considers both marker definition name and per-instance border color
	 * so that "Imp (Blue)" and "Imp (Red)" are treated as distinct.
	 */
	isCombatantOnMap(name: string, tokenId?: string, display?: string): boolean {
		if (!this.handle) return false;
		const markers: MarkerReference[] = this.handle.config.markers ?? [];
		const library = this.plugin.markerLibrary;
		const expectedColor = this.extractBorderColor(display);

		for (const m of markers) {
			const instanceColor = ((m as any).borderColor || "").toLowerCase();

			// Direct tokenId match — still check color to distinguish duplicates
			if (tokenId && m.markerId === tokenId) {
				if (!expectedColor) return true;
				if (instanceColor === expectedColor.toLowerCase()) return true;
				continue;
			}
			// Name-based match through library
			const def = library.getMarker(m.markerId);
			if (def && def.name.toLowerCase() === name.toLowerCase()) {
				if (!expectedColor && !instanceColor) return true;
				if (expectedColor && instanceColor === expectedColor.toLowerCase()) return true;
				if (!expectedColor && instanceColor) continue; // colored instance, but we have no color
			}
		}
		return false;
	}

	/* ═══════════════════════ Mutations ═══════════════════════ */

	/** Map of common color names to hex values for border color extraction. */
	private static readonly COLOR_NAME_TO_HEX: Record<string, string> = {
		red: "#ff0000", blue: "#3399ff", green: "#00cc44", yellow: "#ffcc00",
		purple: "#9933ff", orange: "#ff6600", pink: "#ff66cc", cyan: "#00cccc",
		magenta: "#ff00ff", lime: "#88ff00", teal: "#009999", gold: "#ffd700",
		brown: "#8B4513", black: "#333333", white: "#ffffff", gray: "#808080",
		grey: "#808080", indigo: "#4b0082", violet: "#ee82ee", silver: "#c0c0c0",
		bronze: "#cd7f32", crimson: "#dc143c", coral: "#ff7f50", maroon: "#800000",
	};

	/**
	 * Extract a border color hex from a display name like "Goblin (Blue)".
	 * Returns undefined if no color suffix is found.
	 */
	private extractBorderColor(display?: string): string | undefined {
		if (!display) return undefined;
		const match = display.match(/\((\w+)\)\s*$/);
		if (!match) return undefined;
		return MapController.COLOR_NAME_TO_HEX[match[1]!.toLowerCase()];
	}

	/**
	 * Place a token on the active map.
	 *
	 * Resolves the marker definition from:
	 *   1. Explicit tokenId
	 *   2. Creature note frontmatter (token_id)
	 *   3. Name-based lookup in marker library
	 *   4. Auto-creates a new marker definition if none found
	 *
	 * Snaps to grid and avoids placing on top of existing tokens.
	 */
	async placeToken(opts: {
		name: string;
		display?: string;
		tokenId?: string;
		notePath?: string;
		player?: boolean;
		friendly?: boolean;
	}): Promise<PlaceTokenResult> {
		if (!this.handle) {
			return { success: false, reason: "No active map" };
		}

		const { config, redrawAnnotations, saveToHistory, syncPlayerView, save } = this.handle;
		const library = this.plugin.markerLibrary;

		// ── Resolve MarkerDefinition ──
		let markerDef: MarkerDefinition | undefined;

		// 1. Direct tokenId
		if (opts.tokenId) {
			markerDef = library.getMarker(opts.tokenId);
		}

		// 2. Creature note frontmatter
		if (!markerDef && opts.notePath) {
			const file = this.plugin.app.vault.getAbstractFileByPath(opts.notePath);
			if (file instanceof TFile) {
				const cache = this.plugin.app.metadataCache.getFileCache(file);
				const noteTokenId = cache?.frontmatter?.token_id;
				if (noteTokenId) {
					markerDef = library.getMarker(noteTokenId);
				}
			}
		}

		// 3. Name-based lookup
		if (!markerDef) {
			const matches = library.findMarkersByName(opts.name);
			if (matches.length > 0) markerDef = matches[0];
		}

		// 4. Auto-create
		if (!markerDef) {
			const isPlayer = opts.player ?? false;
			const isFriendly = opts.friendly ?? false;
			const id = library.generateId();
			const now = Date.now();
			markerDef = {
				id,
				name: opts.name,
				type: isPlayer ? "player" : isFriendly ? "npc" : "creature",
				icon: isPlayer ? "🛡️" : isFriendly ? "🧑" : "👹",
				backgroundColor: isPlayer ? "#2563eb" : isFriendly ? "#16a34a" : "#dc2626",
				borderColor: "#ffffff",
				creatureSize: "medium" as CreatureSize,
				createdAt: now,
				updatedAt: now,
			} as MarkerDefinition;
			await library.setMarker(markerDef);
		}

		// ── Extract border color from display name (e.g. "Goblin (Blue)") ──
		const borderColor = this.extractBorderColor(opts.display);

		// ── Duplicate check (same markerId + same borderColor) ──
		if (this.hasMarkerOnMap(markerDef.id, borderColor)) {
			return { success: false, reason: `"${opts.display ?? opts.name}" is already on the map` };
		}

		// ── Compute position (find empty grid cell) ──
		const gs = config.gridSize || 70;
		const squares = CREATURE_SIZE_SQUARES[(markerDef.creatureSize as CreatureSize) || "medium"] || 1;
		const position = this.findOpenPosition(config, gs, squares);

		// ── Determine layer ──
		const isAlly = opts.player || opts.friendly;
		const layer: Layer = isAlly ? "Player" : "DM";

		// ── Create MarkerReference ──
		const markerRef: any = {
			id: `marker_inst_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
			markerId: markerDef.id,
			position,
			placedAt: Date.now(),
			layer,
		};

		// Apply per-instance border color from display name
		if (borderColor) {
			markerRef.borderColor = borderColor;
		}

		// ── Apply to map ──
		saveToHistory();
		config.markers.push(markerRef);
		redrawAnnotations();
		syncPlayerView();
		save();

		return { success: true, instanceId: markerRef.id };
	}

	/**
	 * Remove a placed token by its instance id.
	 */
	removeToken(instanceId: string): boolean {
		if (!this.handle) return false;
		const { config, redrawAnnotations, saveToHistory, syncPlayerView, save } = this.handle;
		const markers: MarkerReference[] = config.markers;
		const idx = markers.findIndex((m) => m.id === instanceId);
		if (idx < 0) return false;

		saveToHistory();
		markers.splice(idx, 1);
		redrawAnnotations();
		syncPlayerView();
		save();
		return true;
	}

	/**
	 * Remove all placed tokens whose MarkerDefinition.id matches.
	 */
	removeTokenByMarkerId(markerId: string): number {
		if (!this.handle) return 0;
		const { config, redrawAnnotations, saveToHistory, syncPlayerView, save } = this.handle;
		const markers: MarkerReference[] = config.markers;
		const toRemove = markers.filter((m) => m.markerId === markerId);
		if (toRemove.length === 0) return 0;

		saveToHistory();
		config.markers = markers.filter((m) => m.markerId !== markerId);
		redrawAnnotations();
		syncPlayerView();
		save();
		return toRemove.length;
	}

	/* ═══════════════════════ Helpers ═══════════════════════ */

	/**
	 * Find an open grid position for a new token.
	 * Starts near the map centre and spirals outward.
	 */
	private findOpenPosition(config: any, gridSize: number, sizeSquares: number): { x: number; y: number } {
		const ox = config.gridOffsetX || 0;
		const oy = config.gridOffsetY || 0;
		const w = config.dimensions?.width || 2000;
		const h = config.dimensions?.height || 2000;
		const halfToken = (sizeSquares * gridSize) / 2;
		const step = sizeSquares < 1 ? gridSize * sizeSquares : gridSize;
		const markers: MarkerReference[] = config.markers || [];

		// Centre of map in grid coords
		const centreCol = Math.round((w / 2 - ox - halfToken) / step);
		const centreRow = Math.round((h / 2 - oy - halfToken) / step);

		// Check if a grid cell is occupied
		const isOccupied = (col: number, row: number): boolean => {
			const cx = ox + col * step + halfToken;
			const cy = oy + row * step + halfToken;
			const threshold = gridSize * 0.4;
			return markers.some((m) => {
				const dx = m.position.x - cx;
				const dy = m.position.y - cy;
				return Math.sqrt(dx * dx + dy * dy) < threshold;
			});
		};

		// Spiral outward from centre
		for (let ring = 0; ring < 30; ring++) {
			for (let dc = -ring; dc <= ring; dc++) {
				for (let dr = -ring; dr <= ring; dr++) {
					if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue; // perimeter only
					const col = centreCol + dc;
					const row = centreRow + dr;
					if (!isOccupied(col, row)) {
						return {
							x: ox + col * step + halfToken,
							y: oy + row * step + halfToken,
						};
					}
				}
			}
		}

		// Fallback: offset from centre
		return { x: w / 2 + markers.length * gridSize, y: h / 2 };
	}
}
