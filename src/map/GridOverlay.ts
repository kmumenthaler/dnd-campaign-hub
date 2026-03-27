import type { MapMediaElement } from "../constants";

/**
 * Grid overlay drawing utilities for square and hex grids.
 * Extracted from DndCampaignHubPlugin.
 */

export function drawGridOverlay(container: HTMLElement, img: MapMediaElement, config: any, offsetX: number = 0, offsetY: number = 0, reuseCanvas?: HTMLCanvasElement | null, canvasScale: number = 1): HTMLCanvasElement {
	let canvas: HTMLCanvasElement;
	if (reuseCanvas) {
		// Reuse existing canvas — skip DOM create/remove/append
		canvas = reuseCanvas;
		// Ensure dimensions still match (image may have been resized)
		const bw = img.naturalWidth * canvasScale;
		const bh = img.naturalHeight * canvasScale;
		if (canvas.width !== bw || canvas.height !== bh) {
			canvas.width = bw;
			canvas.height = bh;
		}
		canvas.style.width = `${img.width}px`;
		canvas.style.height = `${img.height}px`;
	} else {
		// Remove existing canvas if any
		const existingCanvas = container.querySelector('.dnd-map-grid-overlay');
		if (existingCanvas) {
			existingCanvas.remove();
		}
		canvas = document.createElement('canvas');
		canvas.classList.add('dnd-map-grid-overlay');
		canvas.width = img.naturalWidth * canvasScale;
		canvas.height = img.naturalHeight * canvasScale;
		canvas.style.position = 'absolute';
		canvas.style.top = '0';
		canvas.style.left = '0';
		canvas.style.width = `${img.width}px`;
		canvas.style.height = `${img.height}px`;
		canvas.style.pointerEvents = 'none';
	}

	const ctx = canvas.getContext('2d');
	if (!ctx) return canvas;

	// Clear at physical resolution, then switch to logical coords
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);

	// Logical dimensions for loop bounds
	const logicalW = img.naturalWidth;
	const logicalH = img.naturalHeight;

	// Style for grid lines
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
	ctx.lineWidth = 2;

	if (config.gridType === 'square') {
		const sizeW = config.gridSizeW || config.gridSize;
		const sizeH = config.gridSizeH || config.gridSize;
		// Normalize offset to stay within one grid cell
		const normalizedOffsetX = ((offsetX % sizeW) + sizeW) % sizeW;
		const normalizedOffsetY = ((offsetY % sizeH) + sizeH) % sizeH;
		
		// Batch all lines into a single path for one stroke call
		ctx.beginPath();
		for (let x = normalizedOffsetX; x <= logicalW; x += sizeW) {
			ctx.moveTo(x, 0);
			ctx.lineTo(x, logicalH);
		}
		for (let y = normalizedOffsetY; y <= logicalH; y += sizeH) {
			ctx.moveTo(0, y);
			ctx.lineTo(logicalW, y);
		}
		ctx.stroke();
	} else if (config.gridType === 'hex-horizontal') {
		// Flat-top hex grid (horizontal orientation)
		const horiz = config.gridSizeW || config.gridSize;
		const defaultSize = (2/3) * horiz;
		const defaultVert = Math.sqrt(3) * defaultSize;
		const vert = config.gridSizeH || defaultVert;
		const sizeX = horiz * (2/3);
		const sizeY = vert / Math.sqrt(3);
		
		const startCol = Math.floor(-offsetX / horiz) - 2;
		const endCol = Math.ceil((logicalW - offsetX) / horiz) + 2;
		const startRow = Math.floor(-offsetY / vert) - 2;
		const endRow = Math.ceil((logicalH - offsetY) / vert) + 2;
		
		// Batch all hexagons into a single path
		ctx.beginPath();
		for (let row = startRow; row < endRow; row++) {
			for (let col = startCol; col < endCol; col++) {
				const colOffsetY = (col & 1) ? vert / 2 : 0;
				const centerX = col * horiz + offsetX;
				const centerY = row * vert + colOffsetY + offsetY;
				_addHexFlatStretchedPath(ctx, centerX, centerY, sizeX, sizeY);
			}
		}
		ctx.stroke();
	} else if (config.gridType === 'hex-vertical') {
		// Pointy-top hex grid (vertical orientation)
		const vert = config.gridSizeH || config.gridSize;
		const defaultSize = (2/3) * vert;
		const defaultHoriz = Math.sqrt(3) * defaultSize;
		const horiz = config.gridSizeW || defaultHoriz;
		const sizeY = vert * (2/3);
		const sizeX = horiz / Math.sqrt(3);
		
		const startCol = Math.floor(-offsetX / horiz) - 2;
		const endCol = Math.ceil((logicalW - offsetX) / horiz) + 2;
		const startRow = Math.floor(-offsetY / vert) - 2;
		const endRow = Math.ceil((logicalH - offsetY) / vert) + 2;
		
		// Batch all hexagons into a single path
		ctx.beginPath();
		for (let row = startRow; row < endRow; row++) {
			for (let col = startCol; col < endCol; col++) {
				const rowOffsetX = (row & 1) ? horiz / 2 : 0;
				const centerX = col * horiz + rowOffsetX + offsetX;
				const centerY = row * vert + offsetY;
				_addHexPointyStretchedPath(ctx, centerX, centerY, sizeX, sizeY);
			}
		}
		ctx.stroke();
	}

	// Append canvas to container (only for newly created canvases)
	if (!reuseCanvas) {
		container.appendChild(canvas);
	}
	return canvas;
}

/** Add a flat-top stretched hex outline to the current path (no stroke). */
function _addHexFlatStretchedPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, sizeX: number, sizeY: number) {
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i;
		const x = cx + sizeX * Math.cos(angle);
		const y = cy + sizeY * Math.sin(angle);
		if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.closePath();
}

/** Add a pointy-top stretched hex outline to the current path (no stroke). */
function _addHexPointyStretchedPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, sizeX: number, sizeY: number) {
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 6) + (Math.PI / 3) * i;
		const x = cx + sizeX * Math.cos(angle);
		const y = cy + sizeY * Math.sin(angle);
		if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
	}
	ctx.closePath();
}

/**
 * Draw a flat-top hexagon (horizontal orientation)
 */
export function drawHexFlat(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i; // 60 degree increments
		const x = centerX + radius * Math.cos(angle);
		const y = centerY + radius * Math.sin(angle);
		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.closePath();
	ctx.stroke();
}

/**
 * Draw a pointy-top hexagon (vertical orientation)
 */
export function drawHexPointy(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 6) + (Math.PI / 3) * i; // Start at 30 degrees, 60 degree increments
		const x = centerX + radius * Math.cos(angle);
		const y = centerY + radius * Math.sin(angle);
		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.closePath();
	ctx.stroke();
}

/**
 * Draw a filled flat-top hexagon (horizontal orientation)
 */
export function drawFilledHexFlat(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i;
		const x = centerX + radius * Math.cos(angle);
		const y = centerY + radius * Math.sin(angle);
		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

/**
 * Draw a filled pointy-top hexagon (vertical orientation)
 */
export function drawFilledHexPointy(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 6) + (Math.PI / 3) * i;
		const x = centerX + radius * Math.cos(angle);
		const y = centerY + radius * Math.sin(angle);
		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

/**
 * Draw a flat-top hexagon with independent X/Y radii (stretched)
 */
export function drawHexFlatStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const a = (Math.PI / 3) * i;
		const x = cx + rx * Math.cos(a);
		const y = cy + ry * Math.sin(a);
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.stroke();
}

/**
 * Draw a pointy-top hexagon with independent X/Y radii (stretched)
 */
export function drawHexPointyStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const a = (Math.PI / 6) + (Math.PI / 3) * i;
		const x = cx + rx * Math.cos(a);
		const y = cy + ry * Math.sin(a);
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.stroke();
}

/**
 * Draw a filled flat-top hexagon with independent X/Y radii (stretched)
 */
export function drawFilledHexFlatStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const a = (Math.PI / 3) * i;
		const x = cx + rx * Math.cos(a);
		const y = cy + ry * Math.sin(a);
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

/**
 * Draw a filled pointy-top hexagon with independent X/Y radii (stretched)
 */
export function drawFilledHexPointyStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const a = (Math.PI / 6) + (Math.PI / 3) * i;
		const x = cx + rx * Math.cos(a);
		const y = cy + ry * Math.sin(a);
		i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}
