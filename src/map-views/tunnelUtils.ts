/**
 * tunnelUtils.ts — Shared tunnel/burrowing helpers used by both
 * renderMapView (GM) and PlayerMapView (player).
 *
 * Extracted to eliminate code duplication and centralise magic numbers.
 */

import { CREATURE_SIZE_SQUARES, type CreatureSize, type TunnelSegment, type TunnelWall } from "../marker/MarkerTypes";

// ── Named constants ──────────────────────────────────────────────────

/** Extra squares added to creature-size when computing tunnel pixel width. */
export const TUNNEL_WIDTH_PADDING = 0.5;

/** Multiplier of gridSize used as proximity threshold for tunnel entrance/exit detection. */
export const TUNNEL_PROXIMITY_FACTOR = 1.5;

/** Minimum pixel distance between consecutive tunnel path points (avoids dense paths). */
export const TUNNEL_MIN_PATH_SPACING = 10;

/** Angle (radians) beyond which a direction change counts as a corner that blocks vision. 45°. */
export const TUNNEL_CORNER_BLOCK_ANGLE = Math.PI / 4;

// ── Tunnel width ─────────────────────────────────────────────────────

/**
 * Return the effective pixel width of a tunnel.
 * Uses the stored `tunnelWidth` when available, otherwise computes
 * from creature size + padding.
 */
export function getTunnelWidth(tunnel: TunnelSegment, gridSize: number): number {
	if (tunnel.tunnelWidth) return tunnel.tunnelWidth;
	const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize] || 1;
	return (squares + TUNNEL_WIDTH_PADDING) * gridSize;
}

/**
 * Compute the pixel width for a given creature size (used during tunnel creation
 * before there is a stored `tunnelWidth`).
 */
export function computeTunnelWidth(creatureSize: CreatureSize, gridSize: number): number {
	const squares = CREATURE_SIZE_SQUARES[creatureSize] || 1;
	return (squares + TUNNEL_WIDTH_PADDING) * gridSize;
}

// ── Lateral movement helpers ─────────────────────────────────────────

/**
 * Return the unit perpendicular vector at a given path index.
 * The perpendicular is rotated 90° clockwise from the tangent direction
 * so that positive dot-products map to the "right" side of the path.
 */
export function getPathPerpendicular(
	path: Array<{ x: number; y: number }>,
	index: number,
): { x: number; y: number } {
	let dx: number, dy: number;
	if (index < path.length - 1) {
		dx = path[index + 1].x - path[index].x;
		dy = path[index + 1].y - path[index].y;
	} else if (index > 0) {
		dx = path[index].x - path[index - 1].x;
		dy = path[index].y - path[index - 1].y;
	} else {
		return { x: 0, y: 0 };
	}
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len === 0) return { x: 0, y: 0 };
	// Perpendicular = rotate tangent 90° clockwise → (dy, -dx) normalised
	return { x: -dy / len, y: dx / len };
}

/**
 * Compute the maximum lateral offset (px) a token of `tokenSize` has
 * inside a tunnel built for `tunnelCreatureSize`.
 * Returns 0 when the token is the same size (or larger) than the tunnel.
 */
export function computeMaxLateral(
	tunnel: TunnelSegment,
	tokenSizeSquares: number,
	gridSize: number,
): number {
	const tunnelWidth = getTunnelWidth(tunnel, gridSize);
	const tokenWidth = tokenSizeSquares * gridSize;
	return Math.max(0, (tunnelWidth - tokenWidth) / 2);
}

// ── Tunnel wall generation ───────────────────────────────────────────

/**
 * Build parallel wall segments + end-caps from a tunnel centre-line path.
 * Used for line-of-sight checks inside tunnels.
 */
export function generateTunnelWalls(
	path: Array<{ x: number; y: number }>,
	tunnelWidth: number,
): TunnelWall[] {
	if (!path || path.length < 2) return [];

	const walls: TunnelWall[] = [];
	const halfWidth = tunnelWidth / 2;

	// Side walls for each segment
	for (let i = 0; i < path.length - 1; i++) {
		const p1 = path[i];
		const p2 = path[i + 1];
		if (!p1 || !p2) continue;

		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len === 0) continue;

		const perpX = -dy / len;
		const perpY = dx / len;

		walls.push(
			{ start: { x: p1.x + perpX * halfWidth, y: p1.y + perpY * halfWidth }, end: { x: p2.x + perpX * halfWidth, y: p2.y + perpY * halfWidth } },
			{ start: { x: p1.x - perpX * halfWidth, y: p1.y - perpY * halfWidth }, end: { x: p2.x - perpX * halfWidth, y: p2.y - perpY * halfWidth } },
		);
	}

	// End caps
	if (path.length >= 2) {
		_addEndCap(walls, path[0]!, path[1]!, halfWidth);
		_addEndCap(walls, path[path.length - 1]!, path[path.length - 2]!, halfWidth);
	}

	return walls;
}

/** Push a single perpendicular cap across `point` using direction from `other` → `point`. */
function _addEndCap(
	walls: TunnelWall[],
	point: { x: number; y: number },
	other: { x: number; y: number },
	halfWidth: number,
): void {
	const dx = point.x - other.x;
	const dy = point.y - other.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len === 0) return;
	const perpX = -dy / len;
	const perpY = dx / len;
	walls.push({
		start: { x: point.x + perpX * halfWidth, y: point.y + perpY * halfWidth },
		end:   { x: point.x - perpX * halfWidth, y: point.y - perpY * halfWidth },
	});
}

// ── Tunnel entrance / exit drawing ───────────────────────────────────

/**
 * Draw a tunnel portal (entrance or exit) on a canvas context.
 * Includes the dark hole, rocky border, radial gradient, and 🕳️ icon.
 */
export function drawTunnelPortal(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
): void {
	ctx.save();
	ctx.globalAlpha = 0.7;

	// Dark circle
	ctx.fillStyle = '#1a1a1a';
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fill();

	// Rocky border
	ctx.strokeStyle = '#654321';
	ctx.lineWidth = Math.max(3, radius * 0.15);
	ctx.stroke();

	// Inner shadow gradient
	const gradient = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius);
	gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
	gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = gradient;
	ctx.fill();

	// Emoji icon
	ctx.globalAlpha = 0.8;
	ctx.fillStyle = '#8B4513';
	ctx.font = `${Math.max(12, radius * 0.8)}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('🕳️', x, y);

	ctx.restore();
}

// ── Tunnel portal radius helper ──────────────────────────────────────

/** Compute the visual radius of a tunnel entrance/exit circle. */
export function getTunnelPortalRadius(creatureSize: CreatureSize, gridSize: number): number {
	const squares = CREATURE_SIZE_SQUARES[creatureSize] || 1;
	return (squares * gridSize) / 2.5;
}

// ── Zig-zag detection ────────────────────────────────────────────────

/**
 * Returns `true` if moving from the last path point to `candidate` would
 * reverse direction relative to the previous segment (dot product < 0).
 * When there are fewer than 2 existing points, always returns `false`.
 */
export function isZigZag(
	path: Array<{ x: number; y: number }>,
	candidateX: number,
	candidateY: number,
): boolean {
	if (path.length < 2) return false;
	const prev = path[path.length - 2]!;
	const last = path[path.length - 1]!;
	const prevDx = last.x - prev.x;
	const prevDy = last.y - prev.y;
	const newDx = candidateX - last.x;
	const newDy = candidateY - last.y;
	return prevDx * newDx + prevDy * newDy < 0;
}

// ── Tunnel creation ──────────────────────────────────────────────────

/**
 * Build a fresh `TunnelSegment` object for a newly-burrowing creature.
 */
export function createTunnelSegment(
	creatorMarkerId: string,
	snappedPos: { x: number; y: number },
	creatureSize: CreatureSize,
	depth: number,
	gridSize: number,
): TunnelSegment {
	const tunnelWidth = computeTunnelWidth(creatureSize, gridSize);
	return {
		id: `tunnel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		creatorMarkerId,
		entrancePosition: { x: snappedPos.x, y: snappedPos.y },
		path: [{ x: snappedPos.x, y: snappedPos.y, elevation: depth }],
		creatureSize,
		depth,
		createdAt: Date.now(),
		visible: true,
		active: true,
		tunnelWidth,
		walls: [],
	};
}

// ── Tunnel entrance / exit proximity ─────────────────────────────────

/**
 * Find the nearest tunnel whose **entrance** is within proximity of `position`.
 * Returns `null` if nothing is close enough.
 */
export function findNearTunnelEntrance(
	tunnels: TunnelSegment[] | undefined,
	position: { x: number; y: number },
	gridSize: number,
): { tunnel: TunnelSegment; distance: number } | null {
	if (!tunnels || tunnels.length === 0) return null;

	const threshold = gridSize * TUNNEL_PROXIMITY_FACTOR;
	let nearest: { tunnel: TunnelSegment; distance: number } | null = null;

	for (const tunnel of tunnels) {
		const entrance = tunnel.entrancePosition;
		const dist = Math.sqrt(
			(position.x - entrance.x) ** 2 + (position.y - entrance.y) ** 2,
		);
		if (dist <= threshold && (!nearest || dist < nearest.distance)) {
			nearest = { tunnel, distance: dist };
		}
	}
	return nearest;
}

/**
 * Find the nearest tunnel whose **exit** (last path point) is within proximity.
 * Returns `null` if nothing is close enough.
 */
export function findNearTunnelExit(
	tunnels: TunnelSegment[] | undefined,
	position: { x: number; y: number },
	gridSize: number,
): { tunnel: TunnelSegment; distance: number } | null {
	if (!tunnels || tunnels.length === 0) return null;

	const threshold = gridSize * TUNNEL_PROXIMITY_FACTOR;
	let nearest: { tunnel: TunnelSegment; distance: number } | null = null;

	for (const tunnel of tunnels) {
		if (tunnel.path.length === 0) continue;
		const exit = tunnel.path[tunnel.path.length - 1]!;
		const dist = Math.sqrt(
			(position.x - exit.x) ** 2 + (position.y - exit.y) ** 2,
		);
		if (dist <= threshold && (!nearest || dist < nearest.distance)) {
			nearest = { tunnel, distance: dist };
		}
	}
	return nearest;
}

// ── Tunnel cleanup helpers ───────────────────────────────────────────

/**
 * Remove `tunnelState` and tunnel-related elevation from every marker
 * whose `tunnelState.tunnelId` references one of the given IDs.
 * Returns the number of markers cleaned up.
 */
export function ejectTokensFromTunnels(
	markers: any[],
	tunnelIds: Set<string>,
): number {
	let count = 0;
	for (const m of markers) {
		if (m.tunnelState && tunnelIds.has(m.tunnelState.tunnelId)) {
			delete m.tunnelState;
			// Clear tunnel-assigned depth but keep any manual depth
			if (m.elevation?._tunnelDepth) {
				delete m.elevation.depth;
				delete m.elevation._tunnelDepth;
				delete m.elevation.isBurrowing;
				delete m.elevation.leaveTunnel;
			}
			// Return to Player layer
			m.layer = 'Player';
			count++;
		}
	}
	return count;
}

/**
 * Deactivate all tunnels created by a specific marker and eject tokens inside.
 * Called when a burrowing token is deleted.
 */
export function deactivateTunnelsForMarker(
	tunnels: TunnelSegment[] | undefined,
	markers: any[],
	markerId: string,
): void {
	if (!tunnels) return;
	const affectedIds = new Set<string>();
	for (const t of tunnels) {
		if (t.creatorMarkerId === markerId && t.active) {
			t.active = false;
			affectedIds.add(t.id);
		}
	}
	if (affectedIds.size > 0) {
		ejectTokensFromTunnels(markers, affectedIds);
	}
}

/**
 * Ensure every tunnel has `walls` populated (regenerate if missing).
 * Called on map load to handle save files that pre-date wall persistence.
 */
export function ensureTunnelWalls(tunnels: TunnelSegment[] | undefined, gridSize: number): void {
	if (!tunnels) return;
	for (const tunnel of tunnels) {
		if ((!tunnel.walls || tunnel.walls.length === 0) && tunnel.path && tunnel.path.length >= 2) {
			const width = getTunnelWidth(tunnel, gridSize);
			tunnel.walls = generateTunnelWalls(tunnel.path, width);
		}
	}
}
