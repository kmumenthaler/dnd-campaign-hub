import { App, Menu, Notice, TFile, TFolder, WorkspaceLeaf, requestUrl } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { MapMediaElement } from "../constants";
import { PLAYER_MAP_VIEW_TYPE, GM_MAP_VIEW_TYPE } from "../constants";
import { GmMapView } from "./GmMapView";
import { MapManager } from "../map/MapManager";
import { MapCreationModal, BATTLEMAP_TEMPLATE_FOLDER } from "../map/MapCreationModal";
import { MapManagerModal } from "../map/MapManagerModal";
import { TemplatePickerModal } from "../map/TemplatePickerModal";
import { magicWandDetect } from "../map/MagicWandWallModal";
import { MarkerLibrary } from "../marker/MarkerLibrary";
import { MarkerReference, MarkerDefinition, MarkerType, CREATURE_SIZE_SQUARES, CreatureSize, Layer } from "../marker/MarkerTypes";
import { MarkerPickerModal } from "../marker/MarkerPickerModal";
import { GridCalibrationModal } from "../utils/GridCalibrationModal";
import { CreatureSelectorModal, MultiCreatureSelectorModal, RenameCreatureModal } from "../utils/CreatureModals";
import { ClearDrawingsConfirmModal, ClearTokensConfirmModal } from "../utils/ConfirmModal";
import { DeleteMapConfirmModal } from "../map-views/DeleteMapConfirmModal";
import { TabletopCalibrationModal } from "../map-views/TabletopCalibrationModal";
import { canvasPool as _canvasPool } from "../utils/CanvasPool";
import { getWallsHash as _getWallsHash, visCacheKey as _visCacheKey, visCacheMap as _visCacheMap, VIS_CACHE_MAX as _VIS_CACHE_MAX } from "../utils/VisibilityCache";
import { computeLightFlicker, computeNeonBuzz, hexToRgb, getFlickerSeedForKey, FLICKER_LIGHT_TYPES_SET, BUZZ_LIGHT_TYPES_SET } from "../utils/LightFlicker";
import { LIGHT_SOURCES, PLACEABLE_LIGHT_TYPES, getDefaultLightColor } from "../map/LightTypes";
import type { LightSourceType } from "../map/LightTypes";
import { EnvAssetLibrary } from "../envasset/EnvAssetLibrary";
import { showEnvAssetContextMenu } from "../envasset/EnvAssetContextMenu";
import { EnvAssetPickerModal } from "../envasset/EnvAssetPickerModal";
import type { EnvAssetInstance, EnvAssetDefinition, TransformHandle } from "../envasset/EnvAssetTypes";
import { TRANSFORM_HANDLE_SIZE, ROTATION_HANDLE_OFFSET, PIVOT_HANDLE_SIZE } from "../envasset/EnvAssetTypes";
import {
  HexcrawlTracker,
  HexProcedureModal,
  openHexProcedureModal,
  buildTerrainPicker,
  setHexTerrain,
  getHexTerrainAt,
  drawTerrainHex,
  getTerrainDefinition,
  HexcrawlSettingsModal,
  HexDescriptionSettingsModal,
  HexDescriptionEditModal,
  TERRAIN_DEFINITIONS,
  HEXCRAWL_PACES,
  WEATHER_TABLE,
  createDefaultHexcrawlState,
  CLIMATE_DEFINITIONS,
  getClimateDefinition,
  drawClimateHexBorder,
  getHexClimateAt,
  hLoc,
  EncounterBattlemapModal,
} from "../hexcrawl";
import type { TerrainType, HexTerrain, HexcrawlState, TerrainPickerState, HexcrawlBridge, ClimateType, HexClimate } from "../hexcrawl";

/**
 * Renders the GM map view for a dnd-map code block.
 * Extracted from DndCampaignHubPlugin.renderMapView to reduce main.ts size.
 */
export async function renderMapView(plugin: DndCampaignHubPlugin, source: string, el: HTMLElement, ctx: any) {
		try {
			// Parse the map configuration (code block only needs mapId)
			const config = JSON.parse(source);
			
			// Ensure mapId exists
			if (!config.mapId) {
				el.createEl('div', { 
					text: '⚠️ Map configuration missing mapId',
					cls: 'dnd-map-error'
				});
				return;
			}

			// Load full map data from JSON file (source of truth for all settings + annotations)
			const savedData = await plugin.loadMapAnnotations(config.mapId);
			
			// Merge saved settings into config (JSON overrides code block)
			if (savedData.imageFile) config.imageFile = savedData.imageFile;
			if (savedData.name) config.name = savedData.name;
			if (savedData.type) config.type = savedData.type;
			if (savedData.gridType) config.gridType = savedData.gridType;
			if (savedData.gridSize) config.gridSize = savedData.gridSize;
			if (savedData.scale) config.scale = savedData.scale;
			if (savedData.dimensions) config.dimensions = savedData.dimensions;
			if (savedData.gridOffsetX !== undefined) config.gridOffsetX = savedData.gridOffsetX;
			if (savedData.gridOffsetY !== undefined) config.gridOffsetY = savedData.gridOffsetY;
			if (savedData.gridSizeW !== undefined) config.gridSizeW = savedData.gridSizeW;
			if (savedData.gridSizeH !== undefined) config.gridSizeH = savedData.gridSizeH;
			if (savedData.gridVisible !== undefined) config.gridVisible = savedData.gridVisible;
			if (savedData.isVideo !== undefined) config.isVideo = savedData.isVideo;

			// Load template system fields
			if (savedData.isTemplate !== undefined) config.isTemplate = savedData.isTemplate;
			if (savedData.templateTags) config.templateTags = savedData.templateTags;
			
			// Ensure grid offset defaults
			if (config.gridOffsetX === undefined) config.gridOffsetX = 0;
			if (config.gridOffsetY === undefined) config.gridOffsetY = 0;
			
			// Load annotations
			config.highlights = savedData.highlights || [];
			config.markers = savedData.markers || [];
			config.drawings = savedData.drawings || [];
			config.aoeEffects = []; // AoE effects are session-only, never persisted
			config.tunnels = savedData.tunnels || [];
			config.poiReferences = savedData.poiReferences || [];
			
			// Load hexcrawl terrain, climate, and state data
			config.hexTerrains = savedData.hexTerrains || [];
			config.hexClimates = savedData.hexClimates || [];
			config.customTerrainDescriptions = savedData.customTerrainDescriptions || {};
			config.hexcrawlState = savedData.hexcrawlState || null;
			
			// Load fog of war data
			config.fogOfWar = savedData.fogOfWar || { enabled: true, regions: [] };
			
			// Load dynamic lighting walls (Background layer only)
			config.walls = savedData.walls || [];
			
			// Load light sources (Background layer only)
			config.lightSources = savedData.lightSources || [];
			
			// Load tile elevations (Background layer only)
			config.tileElevations = savedData.tileElevations || {};

			// Load difficult terrain tiles (Background layer)
			config.difficultTerrain = savedData.difficultTerrain || {};

			// Load environment assets (Background layer)
			config.envAssets = savedData.envAssets || [];

			// Load active layer (defaults to Player)
			config.activeLayer = savedData.activeLayer || 'Player';

			// Store the source note path for campaign detection
			const notePath = ctx?.sourcePath || '';
			
			// Validate imageFile (must come from JSON or code block)
			if (!config.imageFile) {
				el.createEl('div', { 
					text: '⚠️ Map data not found. Please recreate the map.',
					cls: 'dnd-map-error'
				});
				return;
			}

			// Get the image file from vault
			const imageFile = plugin.app.vault.getAbstractFileByPath(config.imageFile);
			if (!imageFile || !(imageFile instanceof TFile)) {
				el.createEl('div', { 
					text: `⚠️ Image file not found: ${config.imageFile}`,
					cls: 'dnd-map-error'
				});
				return;
			}

			// Auto-detect video files from extension if not already set
			const videoExtensions = ['mp4', 'webm'];
			if (config.isVideo === undefined) {
				config.isVideo = videoExtensions.includes(imageFile.extension.toLowerCase());
			}

			// Create container for the map
			const mapContainer = el.createDiv({ cls: 'dnd-map-viewer' });
			
			// Add map title if available
			if (config.name) {
				const titleBar = mapContainer.createDiv({ cls: 'dnd-map-title' });
				titleBar.createEl('h4', { text: config.name });
				
				// Add map info
				const info = titleBar.createEl('span', { cls: 'dnd-map-info' });
				const typeEmoji = config.type === 'battlemap' ? '⚔️' : config.type === 'world' ? '🌎' : '🗺️';
				info.textContent = `${typeEmoji} ${config.type} • ${config.dimensions.width}×${config.dimensions.height}px`;
				
				if (config.scale) {
					const scale = titleBar.createEl('span', { cls: 'dnd-map-scale' });
					scale.textContent = `📏 ${config.scale.value} ${config.scale.unit} per square`;
				}
			}

			// Tool state
    let activeTool: 'pan' | 'select' | 'highlight' | 'draw' | 'ruler' | 'target-distance' | 'eraser' | 'move-grid' | 'marker' | 'aoe' | 'fog' | 'walls' | 'lights' | 'walllight-draw' | 'elevation-paint' | 'difficult-terrain' | 'player-view' | 'poi' | 'terrain-paint' | 'climate-paint' | 'hexcrawl-move' | 'set-start-hex' | 'hex-desc' | 'magic-wand' | 'env-asset' = 'pan';
		// Background editing view — controls which element type is prominent and interactable
		type BackgroundEditView = 'all' | 'walls' | 'lights' | 'fog' | 'elevation' | 'difficult-terrain' | 'env-assets';
		let backgroundEditView: BackgroundEditView = 'all';
		let selectedColor = '#ff0000';
      // GM player-view rect drag state
      let gmDragStart: { x: number; y: number } | null = null;
      let gmDragCurrent: { x: number; y: number } | null = null;
      let isDraggingGmRect = false;
      let isMovingGmRect = false; // True when dragging existing rect to move it
		let selectedMarkerId: string | null = null; // Currently selected marker from library
		let draggingMarkerIndex = -1; // Index of marker being dragged (-1 = none)
		let dragOffsetX = 0;
		let dragOffsetY = 0;
		let markerDragOrigin: { x: number; y: number } | null = null; // Original position when dragging a marker

		// ── Environment Asset state ──────────────────────────────────────────
		let selectedEnvAssetId: string | null = null; // Library definition id selected for placement
		let selectedEnvAssetInstanceId: string | null = null; // Currently selected instance on the map
		let envAssetDragOffset: { x: number; y: number } | null = null;
		let envAssetDragOrigin: { x: number; y: number } | null = null;
		let envAssetTransformHandle: TransformHandle | null = null; // Currently grabbed handle
		let envAssetTransformStart: { x: number; y: number; w: number; h: number; rot: number } | null = null;
		let envAssetRotateStart: number | null = null;
		// Image cache for env assets
		const envAssetImageCache: Map<string, HTMLImageElement> = new Map();
		// Helper to get/load image
		const getEnvAssetImage = (path: string): HTMLImageElement | null => {
			if (envAssetImageCache.has(path)) {
				const img = envAssetImageCache.get(path)!;
				return img.complete && img.naturalWidth > 0 ? img : null;
			}
			try {
				const rp = plugin.app.vault.adapter.getResourcePath(path);
				const img = new Image();
				img.src = rp;
				envAssetImageCache.set(path, img);
				img.onload = () => redrawAnnotations();
				return null; // Will show on next redraw after onload fires
			} catch {
				return null;
			}
		};
		// Initialise config.envAssets if missing
		if (!config.envAssets) config.envAssets = [];

		// Light dragging state
		let draggingLightIndex = -1; // Index of light being dragged (-1 = none)
		let lightDragOffsetX = 0;
		let lightDragOffsetY = 0;
		let lightDragOrigin: { x: number; y: number } | null = null;
			let rulerStart: { x: number; y: number } | null = null;
			let rulerEnd: { x: number; y: number } | null = null;
			let rulerComplete = false; // Track if ruler endpoint was set by click (not just mousemove preview)
			// Target Distance tool state
			let targetDistOriginIdx = -1; // Index of origin marker
			let targetDistTargetIdx = -1; // Index of target marker
			let targetDistState: 'selecting-origin' | 'selecting-target' | 'showing' = 'selecting-origin';
			let isDrawing = false;
			let currentPath: { x: number; y: number }[] = [];
			// Eraser brush state
			let isErasing = false;
			let eraserCursorPos: { x: number; y: number } | null = null;
			let eraserHadRemoval = false;
			// AoE tool state
			let selectedAoeShape: 'circle' | 'cone' | 'square' | 'line' = 'circle';
			let aoeOrigin: { x: number; y: number } | null = null;
			let aoePreviewEnd: { x: number; y: number } | null = null;
			let pendingAoeAnchorMarkerId: string | null = null; // Set when AoE is cast from token context menu
			let lastPlacedAoeId: string | null = null; // Track last placed AoE for 3rd-click removal
			// Elevation paint tool state
			let elevationPaintValue: number = 0;
			let isPaintingElevation = false;
			// Difficult terrain paint tool state
			let isDifficultTerrainEraser = false;
			let isPaintingDifficultTerrain = false;
			let hexcrawlMoveHoverHex: { col: number; row: number } | null = null;

			// Hex distance helper for offset-coordinate hex grids (used for movement range)
			const hexDistance = (c1: number, r1: number, c2: number, r2: number): number => {
				if (config.gridType === 'hex-horizontal') {
					// Offset (odd-col) hex grid → convert to cube coordinates
					const x1 = c1;
					const z1 = r1 - (c1 - (c1 & 1)) / 2;
					const y1 = -x1 - z1;
					const x2 = c2;
					const z2 = r2 - (c2 - (c2 & 1)) / 2;
					const y2 = -x2 - z2;
					return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
				} else {
					// hex-vertical → offset (odd-row) hex grid → convert to cube coordinates
					const x1 = c1 - (r1 - (r1 & 1)) / 2;
					const z1 = r1;
					const y1 = -x1 - z1;
					const x2 = c2 - (r2 - (r2 & 1)) / 2;
					const z2 = r2;
					const y2 = -x2 - z2;
					return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
				}
			};

			// Ensure aoeEffects array exists on config
			if (!config.aoeEffects) config.aoeEffects = [];
			
			// ── Light Flicker Animation System ──
			// Delegates to module-level computeLightFlicker() and getFlickerSeedForKey().
			// The closure only manages the animation loop lifecycle.
			const FLICKER_LIGHT_TYPES = FLICKER_LIGHT_TYPES_SET;
			const BUZZ_LIGHT_TYPES = BUZZ_LIGHT_TYPES_SET;
			const getFlickerSeed = getFlickerSeedForKey;
			const computeFlicker = computeLightFlicker;
			const computeBuzz = computeNeonBuzz;
			
			// Flicker animation state
			let flickerAnimFrameId: number | null = null;
			let lastFlickerRedraw = 0;
			const FLICKER_FPS = 14; // ~14 fps for flickering — smooth enough without being expensive
			const FLICKER_INTERVAL = 1000 / FLICKER_FPS;
			
			// Check if any flickering lights exist (standalone or marker-attached)
			const hasFlickeringLights = (): boolean => {
				if (config.lightSources) {
					for (const light of config.lightSources) {
						if (light.active !== false && FLICKER_LIGHT_TYPES.has(light.type)) return true;
					}
				}
				if (config.markers) {
					for (const marker of config.markers as any[]) {
						if (marker.light && FLICKER_LIGHT_TYPES.has(marker.light.type)) return true;
					}
				}
				return false;
			};
			
			// Animation loop — only runs when flickering lights are present
			const flickerAnimLoop = (timestamp: number) => {
				if (!el.isConnected) {
					flickerAnimFrameId = null;
					return; // Map view removed from DOM, stop
				}
				if (timestamp - lastFlickerRedraw >= FLICKER_INTERVAL) {
					lastFlickerRedraw = timestamp;
					redrawAnnotations();
				}
				flickerAnimFrameId = requestAnimationFrame(flickerAnimLoop);
			};
			
			// Start/stop flicker animation based on whether flickering lights exist
			const updateFlickerAnimation = () => {
				if (hasFlickeringLights()) {
					if (flickerAnimFrameId === null) {
						flickerAnimFrameId = requestAnimationFrame(flickerAnimLoop);
					}
				} else {
					if (flickerAnimFrameId !== null) {
						cancelAnimationFrame(flickerAnimFrameId);
						flickerAnimFrameId = null;
					}
				}
			};
			// Fog of War tool state
			let selectedFogShape: 'circle' | 'rect' | 'polygon' | 'brush' = 'brush';
			let fogMode: 'reveal' | 'hide' | 'magic-darkness' = 'reveal'; // Whether fog tool reveals, hides, or creates impenetrable magic darkness
			let fogDragStart: { x: number; y: number } | null = null;
			let fogDragEnd: { x: number; y: number } | null = null;
			let fogPolygonPoints: { x: number; y: number }[] = [];
			if (!config.fogOfWar) config.fogOfWar = { enabled: true, regions: [] };
			// Dynamic Lighting walls state (pivot/chain drawing)
			let wallPoints: { x: number; y: number }[] = [];
			let wallPreviewPos: { x: number; y: number } | null = null;
			if (!config.walls) config.walls = [];
			// Wall light drawing state
			let wallLightPoints: { x: number; y: number }[] = [];
			let wallLightPreviewPos: { x: number; y: number } | null = null;
			// Magic Wand tool state
			let mwThreshold = 60;           // Brightness cutoff (0-255)
			let mwTolerance = 35;           // Flood-fill tolerance
			let mwSimplifyEps = 4;          // RDP simplification epsilon
			let mwMinSegLen = 8;            // Minimum wall segment length
			let mwInvert = false;           // Swap light/dark detection
			let mwMask: Uint8Array | null = null;  // Last flood-fill mask for overlay
			let mwMaskW = 0;
			let mwMaskH = 0;
			let mwImageDataCache: ImageData | null = null; // Cached image pixel data
			// Vision token selection state (for player view)
			// null = show all player tokens' vision (current default behavior)
			// string = marker id - show only that specific token's vision
			let selectedVisionTokenId: string | null = null;
			// Wall drag state
			let draggingWallIndex = -1; // Index of wall being dragged (-1 = none)
			let wallDragOffsetStartX = 0;
			let wallDragOffsetStartY = 0;
			let wallDragOffsetEndX = 0;
			let wallDragOffsetEndY = 0;
			// Wall selection rectangle state (for bulk wall height assignment)
			let wallSelectionRect: { startX: number; startY: number; endX: number; endY: number } | null = null;
			let selectedWallIndices: number[] = [];
			let wallClickStartPos: { x: number; y: number } | null = null; // For detecting click vs drag on walls

			// ── Grid-proportional snap helpers ───────────────────────────
			// All thresholds scale with gridSize so snapping feels consistent
			// regardless of the grid resolution.  The base fraction (0.12)
			// means 12 % of one cell width, clamped to [4, 20] map-pixels
			// to keep behaviour sensible at tiny and huge grid sizes.
			const WALL_SNAP_FRACTION = 0.12;
			const WALL_SNAP_MIN_PX = 4;
			const WALL_SNAP_MAX_PX = 20;
			/** Compute wall-snap threshold in map pixels. */
			const getWallSnapThreshold = (): number => {
				const gs = config.gridSize || 70;
				return Math.max(WALL_SNAP_MIN_PX, Math.min(WALL_SNAP_MAX_PX, gs * WALL_SNAP_FRACTION));
			};
			
			// Find all walls connected to a starting wall via shared endpoints
			const findConnectedWalls = (startIdx: number, walls: any[]): number[] => {
				const EPSILON = getWallSnapThreshold() * 0.25; // ~3 % of grid
				const visited = new Set<number>();
				const queue = [startIdx];
				visited.add(startIdx);
				while (queue.length > 0) {
					const idx = queue.shift()!;
					const w = walls[idx];
					for (let i = 0; i < walls.length; i++) {
						if (visited.has(i)) continue;
						const other = walls[i];
						// Check if any endpoint of 'other' is near any endpoint of 'w'
						const points = [
							[w.start, other.start], [w.start, other.end],
							[w.end, other.start], [w.end, other.end]
						];
						for (const [a, b] of points) {
							if (Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON) {
								visited.add(i);
								queue.push(i);
								break;
							}
						}
					}
				}
				return Array.from(visited);
			};
			
			// Helper to build the current height summary for selected walls
			const getWallHeightSummary = (indices: number[], walls: any[]): string => {
				const heightMap = new Map<string, number>();
				for (const wi of indices) {
					const w = walls[wi];
					if (!w) continue;
					const key = w.height !== undefined && w.height !== null ? `${w.height} ft` : '∞ (infinite)';
					heightMap.set(key, (heightMap.get(key) || 0) + 1);
				}
				if (heightMap.size === 0) return 'No walls';
				if (heightMap.size === 1) {
					const entry = [...heightMap.entries()][0]!;
					const label = entry[0];
					const count = entry[1];
					return `All ${count} wall${count > 1 ? 's' : ''}: ${label}`;
				}
				// Mixed heights
				const parts: string[] = [];
				for (const [label, count] of heightMap.entries()) {
					parts.push(`${count}× ${label}`);
				}
				return `Mixed: ${parts.join(', ')}`;
			};
			
			// Shared popup for wall height assignment (used by rect-select, click-select-segment)
			const showWallHeightPopup = (indices: number[]) => {
				selectedWallIndices = indices;
				redrawAnnotations();
				
				const popup = document.createElement('div');
				popup.addClass('dnd-map-context-menu');
				popup.style.position = 'fixed';
				popup.style.zIndex = '10000';
				
				const header = popup.createDiv({ cls: 'dnd-map-context-menu-header' });
				header.textContent = `↕️ Set Height for ${indices.length} Wall${indices.length > 1 ? 's' : ''}`;
				
				// Current height indicator
				const currentRow = popup.createDiv({ cls: 'dnd-map-context-menu-item' });
				currentRow.style.padding = '4px 8px';
				currentRow.style.fontSize = '11px';
				currentRow.style.opacity = '0.8';
				currentRow.style.fontStyle = 'italic';
				currentRow.textContent = `Current: ${getWallHeightSummary(indices, config.walls)}`;
				
				const heightRow = popup.createDiv({ cls: 'dnd-map-context-menu-item' });
				heightRow.style.display = 'flex';
				heightRow.style.alignItems = 'center';
				heightRow.style.gap = '6px';
				heightRow.style.padding = '6px 8px';
				
				const hInput = heightRow.createEl('input', {
					attr: { type: 'number', min: '0', max: '500', step: '5', placeholder: '∞ (infinite)' }
				});
				hInput.style.width = '100px';
				hInput.style.textAlign = 'center';
				hInput.addClass('dnd-map-darkvision-input');
				// Pre-fill with current uniform height if all walls share the same finite height
				const heights = indices.map(wi => config.walls[wi]?.height).filter((h: any) => h !== undefined && h !== null);
				if (heights.length > 0 && heights.every((h: any) => h === heights[0])) {
					hInput.value = String(heights[0]);
				}
				heightRow.createEl('span', { text: 'ft' });
				
				const btnRow = popup.createDiv({ cls: 'dnd-map-context-menu-item' });
				btnRow.style.display = 'flex';
				btnRow.style.gap = '6px';
				btnRow.style.padding = '4px 8px';
				
				const applyBtn = btnRow.createEl('button', { text: 'Apply', cls: 'mod-cta' });
				const infiniteBtn = btnRow.createEl('button', { text: '∞ Infinite' });
				const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
				
				const closePopup = () => {
					if (popup.parentNode) document.body.removeChild(popup);
					wallSelectionRect = null;
					selectedWallIndices = [];
					wallClickStartPos = null;
					viewport.style.cursor = 'default';
					redrawAnnotations();
				};
				
				applyBtn.addEventListener('click', () => {
					const val = parseInt(hInput.value);
					if (!isNaN(val) && val > 0) {
						saveToHistory();
						indices.forEach(wi => {
							if (config.walls[wi]) config.walls[wi].height = val;
						});
						new Notice(`Set ${indices.length} wall${indices.length > 1 ? 's' : ''} to ${val} ft`);
						plugin.saveMapAnnotations(config, el);
						if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					} else {
						new Notice('Enter a valid height in feet');
						return;
					}
					closePopup();
				});
				
				infiniteBtn.addEventListener('click', () => {
					saveToHistory();
					indices.forEach(wi => {
						if (config.walls[wi]) delete config.walls[wi].height;
					});
					new Notice(`Set ${indices.length} wall${indices.length > 1 ? 's' : ''} to infinite height`);
					plugin.saveMapAnnotations(config, el);
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					closePopup();
				});
				
				cancelBtn.addEventListener('click', closePopup);
				hInput.addEventListener('click', (ev) => ev.stopPropagation());
				hInput.addEventListener('keydown', (ev: KeyboardEvent) => {
					if (ev.key === 'Enter') applyBtn.click();
					if (ev.key === 'Escape') closePopup();
				});
				
				document.body.appendChild(popup);
				// Center the popup
				const popupRect = popup.getBoundingClientRect();
				popup.style.left = `${Math.max(10, (window.innerWidth - popupRect.width) / 2)}px`;
				popup.style.top = `${Math.max(10, (window.innerHeight - popupRect.height) / 2)}px`;
				
				// Auto-focus input
				setTimeout(() => hInput.focus(), 50);
				
				// Close on outside click
				setTimeout(() => {
					const outsideClick = (ev: MouseEvent) => {
						if (!popup.contains(ev.target as Node)) {
							closePopup();
							document.removeEventListener('click', outsideClick);
						}
					};
					document.addEventListener('click', outsideClick);
				}, 50);
			};
			// Wall types for dynamic lighting
			const WALL_TYPES = {
				wall: { name: 'Wall', icon: '🧱', color: '#ff4500', style: 'solid', blocksSight: true, blocksMovement: true },
				door: { name: 'Door', icon: '🚪', color: '#8B4513', style: 'door', blocksSight: true, blocksMovement: true },
				window: { name: 'Window', icon: '🪟', color: '#87CEEB', style: 'window', blocksSight: false, blocksMovement: true },
				secret: { name: 'Secret Door', icon: '🔒', color: '#666666', style: 'dashed', blocksSight: true, blocksMovement: true },
				invisible: { name: 'Invisible Wall', icon: '👻', color: '#cccccc', style: 'dotted', blocksSight: true, blocksMovement: true },
				terrain: { name: 'Terrain', icon: '🪨', color: '#8B7355', style: 'solid', blocksSight: false, blocksMovement: true },
			} as const;
			type WallType = keyof typeof WALL_TYPES;
			let selectedWallType: WallType = 'wall';
			
			// Helper function to calculate bounding size of rotated rectangle
			const getRotatedRectBoundingSize = (rect: any): { w: number; h: number } => {
				const deg = (rect.rotation || 0);
				const t = (deg * Math.PI) / 180;
				const ca = Math.abs(Math.cos(t));
				const sa = Math.abs(Math.sin(t));
				const w = ca * rect.w + sa * rect.h;
				const h = sa * rect.w + ca * rect.h;
				return { w, h };
			};
			// Dynamic Lighting sources state
			let selectedLightSource: LightSourceType = 'torch';
			if (!config.lightSources) config.lightSources = [];
			let isCalibrating = false;
			let calibrationPoint1: { x: number; y: number } | null = null;
			let calibrationPoint2: { x: number; y: number } | null = null;
			
			// Undo/Redo history stack
			interface HistoryState {
				// Annotation arrays
				markers: any[];
				walls: any[];
				lightSources: any[];
				drawings: any[];
				fogOfWar: any;
				highlights: any[];
				aoeEffects: any[];
				tunnels: any[];
				envAssets: any[];
				// Grid configuration
				gridSize: number;
				gridSizeW?: number;
				gridSizeH?: number;
				gridOffsetX: number;
				gridOffsetY: number;
				gridVisible?: boolean;
				// Hexcrawl data
				hexTerrains: any[];
				hexClimates: any[];
				customTerrainDescriptions: any;
				hexcrawlState: any;
				// Tile data
				tileElevations: any;
				difficultTerrain: any;
				// References
				poiReferences: any[];
			}
			const undoStack: HistoryState[] = [];
			const redoStack: HistoryState[] = [];
			const MAX_HISTORY = 50;

			// Placeholder for button visibility function (assigned after buttons are created)
			let updateUndoRedoButtons: () => void = () => {};

			/** Snapshot current annotation arrays using structuredClone (no JSON round-trip). */
			const _snapshotState = (): HistoryState => ({
				markers: structuredClone(config.markers || []),
				walls: structuredClone(config.walls || []),
				lightSources: structuredClone(config.lightSources || []),
				drawings: structuredClone(config.drawings || []),
				fogOfWar: structuredClone(config.fogOfWar || { enabled: true, regions: [] }),
				highlights: structuredClone(config.highlights || []),
				aoeEffects: structuredClone(config.aoeEffects || []),
				tunnels: structuredClone(config.tunnels || []),
				envAssets: structuredClone(config.envAssets || []),
				gridSize: config.gridSize,
				gridSizeW: config.gridSizeW,
				gridSizeH: config.gridSizeH,
				gridOffsetX: config.gridOffsetX ?? 0,
				gridOffsetY: config.gridOffsetY ?? 0,
				gridVisible: config.gridVisible,
				hexTerrains: structuredClone(config.hexTerrains || []),
				hexClimates: structuredClone(config.hexClimates || []),
				customTerrainDescriptions: structuredClone(config.customTerrainDescriptions || {}),
				hexcrawlState: structuredClone(config.hexcrawlState || null),
				tileElevations: structuredClone(config.tileElevations || {}),
				difficultTerrain: structuredClone(config.difficultTerrain || {}),
				poiReferences: structuredClone(config.poiReferences || []),
			});

			/** Restore a snapshot onto the live config. */
			const _restoreState = (s: HistoryState) => {
				config.markers = s.markers;
				config.walls = s.walls;
				config.lightSources = s.lightSources;
				config.drawings = s.drawings;
				config.fogOfWar = s.fogOfWar;
				config.highlights = s.highlights;
				config.aoeEffects = s.aoeEffects;
				config.tunnels = s.tunnels;
				config.envAssets = s.envAssets || [];
				config.gridSize = s.gridSize;
				config.gridSizeW = s.gridSizeW;
				config.gridSizeH = s.gridSizeH;
				config.gridOffsetX = s.gridOffsetX;
				config.gridOffsetY = s.gridOffsetY;
				if (s.gridVisible !== undefined) config.gridVisible = s.gridVisible;
				config.hexTerrains = s.hexTerrains;
				config.hexClimates = s.hexClimates;
				config.customTerrainDescriptions = s.customTerrainDescriptions;
				config.hexcrawlState = s.hexcrawlState;
				config.tileElevations = s.tileElevations;
				config.difficultTerrain = s.difficultTerrain;
				config.poiReferences = s.poiReferences;
			};

			// Save current state to undo stack
			const saveToHistory = () => {
				undoStack.push(_snapshotState());
				if (undoStack.length > MAX_HISTORY) undoStack.shift();
				// Clear redo stack when new action is taken
				redoStack.length = 0;
				updateUndoRedoButtons();
			};

			// Undo function
			const undo = () => {
				if (undoStack.length === 0) {
					new Notice('Nothing to undo');
					return;
				}
				// Save current state to redo before restoring
				redoStack.push(_snapshotState());

				// Restore previous state
				_restoreState(undoStack.pop()!);

				redrawAnnotations();
				plugin.saveMapAnnotations(config, el);
				if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				updateUndoRedoButtons();
				new Notice('Undo');
			};

			// Redo function
			const redo = () => {
				if (redoStack.length === 0) {
					new Notice('Nothing to redo');
					return;
				}
				// Save current state to undo before restoring
				undoStack.push(_snapshotState());

				// Restore redo state
				_restoreState(redoStack.pop()!);

				redrawAnnotations();
				plugin.saveMapAnnotations(config, el);
				if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				updateUndoRedoButtons();
				new Notice('Redo');
			};


		// Create scrollable viewport
		const viewport = mapContainer.createDiv({ cls: 'dnd-map-viewport' });
		viewport.setAttribute('tabindex', '0'); // Make viewport focusable for keyboard events
		
		// Create wrapper that will be transformed (zoom + pan)
		const mapWrapper = viewport.createDiv({ cls: 'dnd-map-wrapper' });
		
		// Get the resource path for the image
		const resourcePath = plugin.app.vault.getResourcePath(imageFile);
		
		// Create the map background element (image or video)
		let img: MapMediaElement;
		if (config.isVideo) {
			const video = mapWrapper.createEl('video', {
				cls: 'dnd-map-image dnd-map-video',
				attr: {
					src: resourcePath,
					autoplay: '',
					loop: '',
					muted: '',
					playsinline: '',
				}
			});
			video.autoplay = true;
			video.loop = true;
			video.muted = true;
			video.playsInline = true;
			// Shim image-compatible properties so existing code works transparently
			Object.defineProperty(video, 'naturalWidth', { get: () => video.videoWidth, configurable: true });
			Object.defineProperty(video, 'naturalHeight', { get: () => video.videoHeight, configurable: true });
			Object.defineProperty(video, 'complete', { get: () => video.readyState >= 2, configurable: true });
			// Shim width/height to return rendered size (HTMLImageElement.width returns clientWidth)
			Object.defineProperty(video, 'width', { get: () => video.clientWidth || video.videoWidth, configurable: true });
			Object.defineProperty(video, 'height', { get: () => video.clientHeight || video.videoHeight, configurable: true });
			img = video as MapMediaElement;
		} else {
			img = mapWrapper.createEl('img', {
				cls: 'dnd-map-image',
				attr: {
					src: resourcePath,
					alt: config.name || 'Battle Map'
				}
			});
		}

		// Add floating toolbar wrapper (holds toolbar + layer menu)
		const toolbarWrapper = viewport.createDiv({ cls: 'dnd-map-toolbar-wrapper' });
		
		// Add undo/redo bar at top center
		const undoRedoBar = viewport.createDiv({ cls: 'dnd-map-undoredo-bar' });
		undoRedoBar.style.cssText = 'position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; gap: 4px; background: var(--background-secondary); border-radius: 6px; padding: 4px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
		// Prevent clicks on the bar from propagating to map tools
		undoRedoBar.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
		undoRedoBar.addEventListener('click', (e) => { e.stopPropagation(); });
		
		const undoBtn = undoRedoBar.createEl('button', { cls: 'dnd-map-undoredo-btn', attr: { title: 'Undo (Ctrl+Z)' } });
		undoBtn.innerHTML = '↶';
		undoBtn.style.cssText = 'background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: var(--text-normal);';
		undoBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); undo(); });
		undoBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
		undoBtn.addEventListener('mouseenter', () => undoBtn.style.background = 'var(--background-modifier-hover)');
		undoBtn.addEventListener('mouseleave', () => undoBtn.style.background = 'transparent');
		
		const redoBtn = undoRedoBar.createEl('button', { cls: 'dnd-map-undoredo-btn', attr: { title: 'Redo (Ctrl+Y)' } });
		redoBtn.innerHTML = '↷';
		redoBtn.style.cssText = 'background: transparent; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: var(--text-normal);';
		redoBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); redo(); });
		redoBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
		redoBtn.addEventListener('mouseenter', () => redoBtn.style.background = 'var(--background-modifier-hover)');
		redoBtn.addEventListener('mouseleave', () => redoBtn.style.background = 'transparent');
		
		// Update undo/redo button visibility based on stack state
		updateUndoRedoButtons = () => {
			undoBtn.style.display = undoStack.length > 0 ? '' : 'none';
			redoBtn.style.display = redoStack.length > 0 ? '' : 'none';
			// Hide the bar entirely if both are hidden
			undoRedoBar.style.display = (undoStack.length > 0 || redoStack.length > 0) ? 'flex' : 'none';
		};
		updateUndoRedoButtons(); // Initialize visibility

		// Add floating toolbar inside wrapper
		const toolbar = toolbarWrapper.createDiv({ cls: 'dnd-map-toolbar' });
		
		// Toolbar header with just collapse toggle icon
		const toolbarHeader = toolbar.createDiv({ cls: 'dnd-map-toolbar-header' });
		const toggleIcon = toolbarHeader.createEl('span', { 
			text: '▼', 
			cls: 'dnd-map-toolbar-toggle' 
		});
		
		// Toolbar content wrapper for collapse animation
		const toolbarContent = toolbar.createDiv({ cls: 'dnd-map-toolbar-content' });
		
		// === COMMON TOOLS (2-column grid, always visible) ===
		const commonToolGroup = toolbarContent.createDiv({ cls: 'dnd-map-tool-group' });
		
		// Wrapper to toggle a picker's visibility.
		// Positioning is handled purely via CSS (position:absolute on .dnd-map-aoe-picker).
		const togglePicker = (picker: HTMLElement, show: boolean) => {
			picker.toggleClass('hidden', !show);
		};

		// Helper to create icon-only buttons with hover labels
		const createToolBtn = (parent: HTMLElement, icon: string, label: string, isActive = false, fullWidth = false): HTMLButtonElement => {
			const btn = parent.createEl('button', { 
				cls: 'dnd-map-tool-btn' + (isActive ? ' active' : '') + (fullWidth ? ' full-width' : '')
			});
			btn.createEl('span', { text: icon, cls: 'dnd-map-tool-btn-icon' });
			btn.createEl('span', { text: label, cls: 'dnd-map-tool-btn-label' });
			// Tooltip positioning is handled via CSS (position:absolute on .dnd-map-tool-btn-label)
			return btn;
		};
		
		// Common navigation and editing tools (2 columns)
		const panBtn = createToolBtn(commonToolGroup, '⬆', 'Pan', true);
		const selectBtn = createToolBtn(commonToolGroup, '👆', 'Select');
		const highlightIcon = config.gridType === 'square' ? '⬜' : '⬡';
		const highlightBtn = createToolBtn(commonToolGroup, highlightIcon, 'Highlight');
		const poiBtn = createToolBtn(commonToolGroup, '📍', 'Point of Interest');
		const markerBtn = createToolBtn(commonToolGroup, '🎯', 'Marker');
		const drawBtn = createToolBtn(commonToolGroup, '✏', 'Draw');
		const rulerBtn = createToolBtn(commonToolGroup, '📏', 'Ruler');
		const targetDistBtn = createToolBtn(commonToolGroup, '📐', 'Token Distance');
		const aoeBtn = createToolBtn(commonToolGroup, '💥', 'AoE');
		const eraserBtn = createToolBtn(commonToolGroup, '🧹', 'Eraser');
		
		// === HEXCRAWL SECTION (expandable, hex maps on world/regional maps only) ===
		const isHexcrawlMap = (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') && (config.type === 'world' || config.type === 'regional');
		const hcLang = (config.hexcrawlState?.descriptionLanguage as 'en' | 'de') || 'en';
		const hexcrawlSectionHeader = toolbarContent.createDiv({ cls: 'dnd-map-section-header' });
		hexcrawlSectionHeader.createEl('span', { text: hLoc(hcLang, 'toolbarHexcrawl'), cls: 'dnd-map-section-title' });
		hexcrawlSectionHeader.createEl('span', { text: '▼', cls: 'dnd-map-section-toggle' });
		const hexcrawlContent = toolbarContent.createDiv({ cls: 'dnd-map-section-content' });
		
		// Hide hexcrawl section on non-hex maps
		hexcrawlSectionHeader.toggleClass('hidden', !isHexcrawlMap);
		hexcrawlContent.toggleClass('hidden', !isHexcrawlMap);
		
		const terrainPaintBtn = createToolBtn(hexcrawlContent, '🌍', hLoc(hcLang, 'toolTerrainPaint'));
		const climatePaintBtn = createToolBtn(hexcrawlContent, '🌡️', hLoc(hcLang, 'toolClimatePaint'));
		const setStartHexBtn = createToolBtn(hexcrawlContent, '📌', hLoc(hcLang, 'toolSetStartHex'));
		const hexDescBtn = createToolBtn(hexcrawlContent, '📝', hLoc(hcLang, 'toolHexDesc'));
		
		// Terrain picker sub-menu (shown when terrain-paint tool is active)
		let selectedTerrainType: TerrainType = 'forest';
		const terrainPicker = terrainPaintBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		for (const def of TERRAIN_DEFINITIONS) {
			const tName = hLoc(hcLang, `terrain.${def.id}`);
			const btn = terrainPicker.createEl('button', {
				cls: `dnd-map-aoe-shape-btn ${def.id === selectedTerrainType ? 'active' : ''}`,
				attr: { title: `${tName} — Speed ×${def.travelModifier}` },
			});
			btn.createEl('span', { text: def.icon });
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedTerrainType = def.id;
				terrainPicker.querySelectorAll('.dnd-map-aoe-shape-btn').forEach(b => b.removeClass('active'));
				btn.addClass('active');
				terrainPicker.addClass('hidden');
			});
		}
		// Clear terrain button
		terrainPicker.createDiv({ cls: 'dnd-fog-picker-sep' });
		const clearTerrainBtn = terrainPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: hLoc(hcLang, 'clearAllTerrain') },
		});
		clearTerrainBtn.createEl('span', { text: '🗑️' });
		clearTerrainBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			saveToHistory();
			config.hexTerrains = [];
			redrawTerrainLayer();
			redrawAnnotations();
			plugin.saveMapAnnotations(config, el);
			new Notice(hLoc(hcLang, 'allTerrainCleared'));
			plugin.refreshHexcrawlView();
		});
		// Description settings button
		terrainPicker.createDiv({ cls: 'dnd-fog-picker-sep' });
		const descSettingsBtn = terrainPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: hLoc(hcLang, 'customTerrainDescsTooltip') },
		});
		descSettingsBtn.createEl('span', { text: '⚙️' });
		descSettingsBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			terrainPicker.addClass('hidden');
			new HexDescriptionSettingsModal(
				plugin.app,
				config.customTerrainDescriptions || {},
				(updated) => {
					config.customTerrainDescriptions = updated;
					plugin.saveMapAnnotations(config, el);
					new Notice(hLoc(hcLang, 'customDescsSaved'));
				},
				hcLang,
			).open();
		});

		// Climate picker sub-menu (shown when climate-paint tool is active)
		let selectedClimateType: import('../hexcrawl/types').ClimateType = 'temperate';
		const climatePicker = climatePaintBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		for (const cdef of CLIMATE_DEFINITIONS) {
			const cName = hLoc(hcLang, `climate.${cdef.id}`);
			const cDesc = hLoc(hcLang, `climateDesc.${cdef.id}`);
			const btn = climatePicker.createEl('button', {
				cls: `dnd-map-aoe-shape-btn ${cdef.id === selectedClimateType ? 'active' : ''}`,
				attr: { title: `${cName} — ${cDesc}` },
			});
			btn.createEl('span', { text: cdef.icon });
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedClimateType = cdef.id;
				climatePicker.querySelectorAll('.dnd-map-aoe-shape-btn').forEach(b => b.removeClass('active'));
				btn.addClass('active');
				climatePicker.addClass('hidden');
			});
		}
		// Clear climate button
		climatePicker.createDiv({ cls: 'dnd-fog-picker-sep' });
		const clearClimateBtn = climatePicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: hLoc(hcLang, 'clearAllClimate') },
		});
		clearClimateBtn.createEl('span', { text: '🗑️' });
		clearClimateBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			saveToHistory();
			config.hexClimates = [];
			redrawTerrainLayer();
			redrawAnnotations();
			plugin.saveMapAnnotations(config, el);
			new Notice(hLoc(hcLang, 'allClimateCleared'));
			plugin.refreshHexcrawlView();
		});
		
		// Open Hexcrawl Panel button
		const openHexcrawlBtn = createToolBtn(hexcrawlContent, '📋', hLoc(hcLang, 'toolOpenPanel'));
		openHexcrawlBtn.addEventListener('click', async () => {
			await plugin.openHexcrawlPanel();
		});
		
		// Toggle hexcrawl section visibility
		let hexcrawlSectionOpen = true;
		hexcrawlSectionHeader.addEventListener('click', () => {
			hexcrawlSectionOpen = !hexcrawlSectionOpen;
			hexcrawlContent.toggleClass('hidden', !hexcrawlSectionOpen || !isHexcrawlMap);
			hexcrawlSectionHeader.querySelector('.dnd-map-section-toggle')!.textContent = hexcrawlSectionOpen ? '▼' : '▶';
		});

		// === VISION SECTION (expandable, Background layer only) ===
		const visionSectionHeader = toolbarContent.createDiv({ cls: 'dnd-map-section-header' });
		visionSectionHeader.createEl('span', { text: 'Vision', cls: 'dnd-map-section-title' });
		visionSectionHeader.createEl('span', { text: '▼', cls: 'dnd-map-section-toggle' });
		const visionContent = toolbarContent.createDiv({ cls: 'dnd-map-section-content' });

		// ── Background Edit-View filter chips ────────────────────────────────
		const bgViewRow = visionContent.createDiv({ cls: 'dnd-map-bg-view-row' });
		const bgViewChips: Record<string, HTMLButtonElement> = {};
		const bgViews: { key: BackgroundEditView; icon: string; tip: string }[] = [
			{ key: 'all',               icon: '👁',  tip: 'Show All' },
			{ key: 'walls',             icon: '🧱', tip: 'Walls' },
			{ key: 'lights',            icon: '💡', tip: 'Lights' },
			{ key: 'fog',               icon: '🌫️', tip: 'Fog' },
			{ key: 'elevation',         icon: '⛰️', tip: 'Elevation' },
			{ key: 'difficult-terrain', icon: '🌿', tip: 'Difficult Terrain' },
			{ key: 'env-assets',        icon: '📦', tip: 'Env Assets' },
		];
		const setBackgroundEditView = (view: BackgroundEditView) => {
			backgroundEditView = view;
			for (const [k, chip] of Object.entries(bgViewChips)) {
				chip.toggleClass('active', k === view);
			}
			// Deselect elements that are no longer interactable in the new view
			if (view !== 'all' && view !== 'env-assets') {
				selectedEnvAssetInstanceId = null;
				envAssetTransformHandle = null;
			}
			if (view !== 'all' && view !== 'walls') {
				selectedWallIndices = [];
				wallSelectionRect = null;
				draggingWallIndex = -1;
			}
			redrawAnnotations();
		};
		for (const v of bgViews) {
			const chip = bgViewRow.createEl('button', {
				cls: 'dnd-map-bg-view-chip' + (v.key === backgroundEditView ? ' active' : ''),
				attr: { title: v.tip },
			});
			chip.textContent = v.icon;
			chip.addEventListener('click', () => setBackgroundEditView(v.key));
			bgViewChips[v.key] = chip;
		}
		
		const fogBtn = createToolBtn(visionContent, '🌫️', 'Fog');
		const wallsBtn = createToolBtn(visionContent, '🧱', 'Walls');
		const lightsBtn = createToolBtn(visionContent, '💡', 'Lights');
		const elevationPaintBtn = createToolBtn(visionContent, '⛰️', 'Tile Elevation');
		const difficultTerrainBtn = createToolBtn(visionContent, '🌿', 'Difficult Terrain');
		const envAssetBtn = createToolBtn(visionContent, '📦', 'Env Assets');
		// Toggle vision section visibility based on layer (hidden entirely for hexcrawl maps)
		visionSectionHeader.toggleClass('hidden', config.activeLayer !== 'Background' || isHexcrawlMap);
		visionContent.toggleClass('hidden', config.activeLayer !== 'Background' || isHexcrawlMap);

		// === TOKEN VISION TOGGLE (always visible, all layers — hidden for hexcrawl) ===
		const tokenVisionSectionHeader = toolbarContent.createDiv({ cls: 'dnd-map-section-header' });
		tokenVisionSectionHeader.createEl('span', { text: 'Token Vision', cls: 'dnd-map-section-title' });
		tokenVisionSectionHeader.createEl('span', { text: '▼', cls: 'dnd-map-section-toggle' });
		const tokenVisionContent = toolbarContent.createDiv({ cls: 'dnd-map-section-content' });
		tokenVisionSectionHeader.toggleClass('hidden', isHexcrawlMap);
		tokenVisionContent.toggleClass('hidden', isHexcrawlMap);

		// Token Vision Selector - custom dropdown to pick which token's vision to show in Player View
		const visionSelectorRow = tokenVisionContent.createDiv({ cls: 'dnd-map-vision-selector' });
		visionSelectorRow.createEl('span', { text: 'View as:', cls: 'dnd-map-vision-label' });
		const visionDropdown = visionSelectorRow.createDiv({ cls: 'dnd-map-vision-dropdown' });
		const visionSelected = visionDropdown.createDiv({ cls: 'dnd-map-vision-selected' });
		visionSelected.setAttribute('title', 'Select which token\'s vision to show in Player View');
		const visionMenu = visionDropdown.createDiv({ cls: 'dnd-map-vision-menu' });

		// Toggle menu open/close
		visionSelected.addEventListener('click', (e) => {
			e.stopPropagation();
			visionMenu.toggleClass('open', !visionMenu.hasClass('open'));
		});
		// Close on outside click (use named fn so it can be removed)
		const closeVisionMenu = () => {
			visionMenu.removeClass('open');
		};
		document.addEventListener('click', closeVisionMenu);
		// Clean up when the element is detached from the DOM
		const visionMenuObserver = new MutationObserver(() => {
			if (!visionDropdown.isConnected) {
				document.removeEventListener('click', closeVisionMenu);
				visionMenuObserver.disconnect();
			}
		});
		visionMenuObserver.observe(visionDropdown.parentElement || document.body, { childList: true, subtree: true });

		// Helper to build an option item (used for both "All Players" and token entries)
		const buildVisionOption = (
			container: HTMLElement,
			icon: string,
			name: string,
			value: string,
			borderColor?: string
		) => {
			const item = container.createDiv({ cls: 'dnd-map-vision-item' });
			item.createEl('span', { text: icon, cls: 'dnd-map-vision-item-icon' });
			item.createEl('span', { text: name, cls: 'dnd-map-vision-item-name' });
			if (borderColor) {
				const dot = item.createEl('span', { cls: 'dnd-map-vision-color-dot' });
				dot.style.backgroundColor = borderColor;
			}
			item.dataset.value = value;
			if ((value === '' && selectedVisionTokenId === null) || value === selectedVisionTokenId) {
				item.addClass('active');
			}
			item.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedVisionTokenId = value === '' ? null : value;
				visionMenu.removeClass('open');
				refreshVisionSelector();
				if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				new Notice(selectedVisionTokenId ? `Vision: ${icon} ${name}` : 'Vision: All Players');
			});
			return item;
		};

		// Function to refresh the vision selector options based on current markers
		const refreshVisionSelector = () => {
			visionMenu.empty();

			// Collect tokens — only player tokens and tokens marked as "Show to Players"
			const visionTokens = (config.markers || []).filter((m: any) => {
				const markerDef = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
				if (!markerDef) return false;
				return markerDef.type === 'player' || m.visibleToPlayers;
			});

			// Count name occurrences to detect duplicates
			const nameCounts = new Map<string, number>();
			visionTokens.forEach((m: any) => {
				const markerDef = plugin.markerLibrary.getMarker(m.markerId);
				const name = markerDef?.name || m.id;
				nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
			});

			// "All Players" option
			buildVisionOption(visionMenu, '👥', 'All Players', '');

			// Token options
			visionTokens.forEach((m: any) => {
				const markerDef = plugin.markerLibrary.getMarker(m.markerId);
				const icon = markerDef?.type === 'player' ? '👤' : markerDef?.type === 'creature' ? '👹' : '🧑';
				let name = markerDef?.name || m.id;
				const isDupe = (nameCounts.get(name) || 0) > 1;
				// Append campaign name to disambiguate duplicate token names
				if (isDupe && markerDef?.campaign) {
					name = `${name} (${markerDef.campaign})`;
				}
				const borderColor = isDupe ? (m.borderColor || markerDef?.borderColor || '#ffffff') : undefined;
				buildVisionOption(visionMenu, icon, name, m.id, borderColor);
			});

			// Update selected display
			visionSelected.empty();
			if (selectedVisionTokenId === null) {
				visionSelected.createEl('span', { text: '👥', cls: 'dnd-map-vision-item-icon' });
				visionSelected.createEl('span', { text: 'All Players', cls: 'dnd-map-vision-item-name' });
			} else {
				const selMarker = visionTokens.find((m: any) => m.id === selectedVisionTokenId);
				if (selMarker) {
					const selDef = plugin.markerLibrary.getMarker(selMarker.markerId);
					const selIcon = selDef?.type === 'player' ? '👤' : selDef?.type === 'creature' ? '👹' : '🧑';
					const selName = selDef?.name || selMarker.id;
					const isDupe = (nameCounts.get(selName) || 0) > 1;
					visionSelected.createEl('span', { text: selIcon, cls: 'dnd-map-vision-item-icon' });
					visionSelected.createEl('span', { text: selName, cls: 'dnd-map-vision-item-name' });
					if (isDupe) {
						const selColor = selMarker.borderColor || selDef?.borderColor || '#ffffff';
						const dot = visionSelected.createEl('span', { cls: 'dnd-map-vision-color-dot' });
						dot.style.backgroundColor = selColor;
					}
				} else {
					// Selected token was removed, reset
					selectedVisionTokenId = null;
					visionSelected.createEl('span', { text: '👥', cls: 'dnd-map-vision-item-icon' });
					visionSelected.createEl('span', { text: 'All Players', cls: 'dnd-map-vision-item-name' });
				}
			}
			// Add dropdown arrow
			visionSelected.createEl('span', { text: '▾', cls: 'dnd-map-vision-arrow' });
		};

		// Initial population
		refreshVisionSelector();

		// === INITIATIVE TRACKER INTEGRATION ===
		// Sync vision token selection with Initiative Tracker's active combatant.
		// When the GM advances turns in Initiative Tracker, automatically toggle
		// the vision to the matching token if it's a player or has "Show to Players".
		// When the active creature has no eligible vision token, fall back to "All Players".
		
		// Use registerEvent for proper Obsidian lifecycle management.
		// The event listener lives as long as the plugin, but we guard with el.isConnected
		// to only act when this specific map view is still active.
		plugin.registerEvent(
			plugin.app.workspace.on('initiative-tracker:save-state' as any, (state: any) => {
				// Only process if this map view is still in the DOM
				if (!el.isConnected) return;
				
				if (!state || !Array.isArray(state.creatures)) return;
				
				// Find the active creature (whose turn it is)
				const activeCreature = state.creatures.find((c: any) => c.active);
				if (!activeCreature) return;
				
				// Collect vision-eligible tokens (player tokens + "Show to Players" tokens)
				const visionTokens = (config.markers || []).filter((m: any) => {
					const markerDef = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
					if (!markerDef) return false;
					return markerDef.type === 'player' || m.visibleToPlayers;
				});
				
				// Only attempt token matching for player or friendly creatures.
				// Enemy creatures will never match and vision falls to "All Players".
				let matchedMarker: any = null;
				if (activeCreature.player || activeCreature.friendly) {
					// First try precise token_id match via creature's vault note path
					const creaturePath = activeCreature.path || activeCreature.note;
					if (creaturePath && typeof creaturePath === 'string') {
						const noteFile = plugin.app.vault.getAbstractFileByPath(creaturePath);
						if (noteFile instanceof TFile) {
							const noteCache = plugin.app.metadataCache.getFileCache(noteFile);
							const noteTokenId = noteCache?.frontmatter?.token_id;
							if (noteTokenId) {
								matchedMarker = visionTokens.find((m: any) => m.markerId === noteTokenId);
							}
						}
					}

					// Fallback: name-based matching
					//   1. Exact match with IT creature's display name
					//   2. Exact match with IT creature's base name
					//   3. Display name starts with marker name (handles "Zombie (Red)" matching "Zombie")
					if (!matchedMarker) {
						matchedMarker = visionTokens.find((m: any) => {
							const markerDef = plugin.markerLibrary.getMarker(m.markerId);
							if (!markerDef) return false;
							const markerName = markerDef.name.toLowerCase();
							const displayName = (activeCreature.display || '').toLowerCase();
							const baseName = (activeCreature.name || '').toLowerCase();
							return displayName === markerName || baseName === markerName || displayName.startsWith(markerName);
						});
					}
				}
				
				if (matchedMarker && selectedVisionTokenId !== matchedMarker.id) {
					// Active creature matched a vision-eligible token → switch to it
					selectedVisionTokenId = matchedMarker.id;
					refreshVisionSelector();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					const markerDef = plugin.markerLibrary.getMarker(matchedMarker.markerId);
					const icon = markerDef?.type === 'player' ? '👤' : markerDef?.type === 'creature' ? '👹' : '🧑';
					new Notice(`Vision synced: ${icon} ${markerDef?.name || matchedMarker.id}`);
				} else if (!matchedMarker && selectedVisionTokenId !== null) {
					// No eligible token matched (enemy creature, or no map token) → "All Players"
					selectedVisionTokenId = null;
					refreshVisionSelector();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					new Notice('Vision synced: 👥 All Players');
				}
			})
		);

		// === TUNNELS SECTION (expandable) ===
		const tunnelsSectionHeader = toolbarContent.createDiv({ cls: 'dnd-map-section-header' });
		tunnelsSectionHeader.createEl('span', { text: 'Tunnels', cls: 'dnd-map-section-title' });
		tunnelsSectionHeader.createEl('span', { text: '▼', cls: 'dnd-map-section-toggle' });
		const tunnelsContent = toolbarContent.createDiv({ cls: 'dnd-map-section-content' });
		
		const clearTunnelsBtn = createToolBtn(tunnelsContent, '🧹', 'Clear Tunnels');
		
		// Toggle tunnels section visibility based on layer
		tunnelsSectionHeader.toggleClass('hidden', config.activeLayer !== 'Subterranean' || isHexcrawlMap);
		tunnelsContent.toggleClass('hidden', config.activeLayer !== 'Subterranean' || isHexcrawlMap);
		
		// === SETUP SECTION (expandable) ===
		const setupSectionHeader = toolbarContent.createDiv({ cls: 'dnd-map-section-header' });
		setupSectionHeader.createEl('span', { text: 'Setup', cls: 'dnd-map-section-title' });
		setupSectionHeader.createEl('span', { text: '▼', cls: 'dnd-map-section-toggle' });
		const setupContent = toolbarContent.createDiv({ cls: 'dnd-map-section-content' });
		
		const moveGridBtn = createToolBtn(setupContent, '✥', 'Move Grid');
		const calibrateBtn = createToolBtn(setupContent, '⚙', 'Calibrate');
		const measureBtn = createToolBtn(setupContent, '📏', 'Measure');
		
		// === PLAYER VIEW (full-width, prominent) ===
		const viewGroup = toolbarContent.createDiv({ cls: 'dnd-map-tool-group' });
		const viewBtn = createToolBtn(viewGroup, '📺', 'Player View', false, true);

		// Fog of War shape picker sub-menu (shown when fog tool is active)
		const fogPicker = fogBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		// Fog mode toggle (reveal/hide)
		const fogModeBtn = fogPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-mode-btn active',
			attr: { title: 'Mode: Reveal' }
		});
		fogModeBtn.createEl('span', { text: '👁️' });
		fogModeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			// Cycle: reveal → hide → magic-darkness → reveal
			if (fogMode === 'reveal') fogMode = 'hide';
			else if (fogMode === 'hide') fogMode = 'magic-darkness';
			else fogMode = 'reveal';
			const modeLabels: Record<string, string> = { 'reveal': 'Mode: Reveal', 'hide': 'Mode: Hide', 'magic-darkness': 'Mode: Magic Darkness (ignores light & darkvision)' };
			const modeIcons: Record<string, string> = { 'reveal': '👁️', 'hide': '🚫', 'magic-darkness': '🔮' };
			fogModeBtn.setAttribute('title', modeLabels[fogMode] || '');
			const iconEl = fogModeBtn.querySelector('span');
			if (iconEl) iconEl.textContent = modeIcons[fogMode] || '👁️';
			fogModeBtn.toggleClass('fog-hide-mode', fogMode === 'hide');
			fogModeBtn.toggleClass('fog-magic-darkness-mode', fogMode === 'magic-darkness');
		});
		// Separator in picker
		const fogSep = fogPicker.createDiv({ cls: 'dnd-fog-picker-sep' });
		// Shape picker buttons
		const fogShapes: { shape: 'brush' | 'circle' | 'rect' | 'polygon'; icon: string; label: string }[] = [
			{ shape: 'brush', icon: '🖌️', label: 'Brush (drag)' },
			{ shape: 'circle', icon: '⭕', label: 'Circle' },
			{ shape: 'rect', icon: '⬜', label: 'Rectangle' },
			{ shape: 'polygon', icon: '⬠', label: 'Polygon' },
		];
		const fogShapeButtons: Map<string, HTMLButtonElement> = new Map();
		fogShapes.forEach(({ shape, icon, label }) => {
			const btn = fogPicker.createEl('button', {
				cls: 'dnd-map-aoe-shape-btn' + (shape === selectedFogShape ? ' active' : ''),
				attr: { title: label }
			});
			btn.createEl('span', { text: icon });
			fogShapeButtons.set(shape, btn);
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedFogShape = shape;
				fogShapeButtons.forEach((b) => b.removeClass('active'));
				btn.addClass('active');
				fogPicker.addClass('hidden');
			});
		});
		// Reveal All / Hide All buttons
		const fogRevealAllBtn = fogPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: 'Reveal All' }
		});
		fogRevealAllBtn.createEl('span', { text: '☀️' });
		fogRevealAllBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			saveToHistory();
			config.fogOfWar.regions = [];
			config.fogOfWar.enabled = false;
			redrawAnnotations();
			plugin.saveMapAnnotations(config, el);
			// Sync to player view
			const viewport = el.querySelector('.dnd-map-viewport') as any;
			if (viewport && viewport._syncPlayerView) viewport._syncPlayerView();
			new Notice('Fog cleared — entire map revealed');
		});
		const fogHideAllBtn = fogPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: 'Hide All' }
		});
		fogHideAllBtn.createEl('span', { text: '🌑' });
		fogHideAllBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			saveToHistory();
			config.fogOfWar.regions = [];
			config.fogOfWar.enabled = true;
			redrawAnnotations();
			plugin.saveMapAnnotations(config, el);
			// Sync to player view
			const viewport = el.querySelector('.dnd-map-viewport') as any;
			if (viewport && viewport._syncPlayerView) viewport._syncPlayerView();
			new Notice('Entire map hidden by fog');
		});
		// Only show fog, walls, lights, and elevation buttons when on Background layer
		fogBtn.toggleClass('hidden', config.activeLayer !== 'Background');
		wallsBtn.toggleClass('hidden', config.activeLayer !== 'Background');
		lightsBtn.toggleClass('hidden', config.activeLayer !== 'Background');
		elevationPaintBtn.toggleClass('hidden', config.activeLayer !== 'Background');
		difficultTerrainBtn.toggleClass('hidden', config.activeLayer !== 'Background');
		envAssetBtn.toggleClass('hidden', config.activeLayer !== 'Background');

		// Wall type picker sub-menu (shown when walls tool is active)
		const wallsPicker = wallsBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		const wallTypeButtons: Map<string, HTMLButtonElement> = new Map();
		(Object.entries(WALL_TYPES) as [WallType, typeof WALL_TYPES[WallType]][]).forEach(([type, wallDef]) => {
			const btn = wallsPicker.createEl('button', {
				cls: 'dnd-map-aoe-shape-btn' + (type === selectedWallType ? ' active' : ''),
				attr: { title: wallDef.name }
			});
			btn.createEl('span', { text: wallDef.icon });
			wallTypeButtons.set(type, btn);
			btn.addEventListener('click', (e) => {
				e.stopPropagation(); // Prevent bubbling to wallsBtn which would re-show the picker
				selectedWallType = type;
				wallTypeButtons.forEach((b) => b.removeClass('active'));
				btn.addClass('active');
				// Collapse the picker after selecting a wall type so the map is not obstructed
				wallsPicker.addClass('hidden');
			});
		});
		// Separator
		wallsPicker.createDiv({ cls: 'dnd-fog-picker-sep' });
		// Magic Wand — auto-detect walls from image (interactive tool)
		const magicWandBtn = wallsPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: 'Magic Wand — Click dark areas to auto-detect walls' }
		});
		magicWandBtn.createEl('span', { text: '🪄' });
		magicWandBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			setActiveTool('magic-wand');
			// Collapse the picker after activating magic wand so the map is not obstructed
			wallsPicker.addClass('hidden');
		});

		// Magic Wand inline settings (shown when magic-wand tool is active)
		const mwSettingsDiv = wallsPicker.createDiv({ cls: 'dnd-mw-settings hidden' });
		mwSettingsDiv.style.cssText = 'padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; min-width: 180px;';
		mwSettingsDiv.addEventListener('click', (e) => e.stopPropagation()); // Prevent slider/checkbox clicks from bubbling to wallsBtn

		const mwInfo = mwSettingsDiv.createEl('div', { text: '🪄 Click dark areas on the map to generate walls', cls: 'setting-item-description' });
		mwInfo.style.cssText = 'margin: 0; padding: 0; font-size: 11px; line-height: 1.3;';

		// Threshold slider
		const mwThreshRow = mwSettingsDiv.createDiv({ cls: 'dnd-mw-row' });
		mwThreshRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';
		mwThreshRow.createEl('span', { text: 'Threshold' }).style.cssText = 'flex: 0 0 auto; font-size: 11px; color: var(--text-muted);';
		const mwThreshSlider = mwThreshRow.createEl('input', { attr: { type: 'range', min: '10', max: '200', value: String(mwThreshold) } });
		mwThreshSlider.style.cssText = 'flex: 1; height: 16px;';
		const mwThreshLabel = mwThreshRow.createEl('span', { text: String(mwThreshold) });
		mwThreshLabel.style.cssText = 'flex: 0 0 28px; text-align: right; font-size: 11px; color: var(--text-muted);';
		mwThreshSlider.addEventListener('input', () => { mwThreshold = Number(mwThreshSlider.value); mwThreshLabel.textContent = mwThreshSlider.value; });

		// Tolerance slider
		const mwTolRow = mwSettingsDiv.createDiv({ cls: 'dnd-mw-row' });
		mwTolRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';
		mwTolRow.createEl('span', { text: 'Tolerance' }).style.cssText = 'flex: 0 0 auto; font-size: 11px; color: var(--text-muted);';
		const mwTolSlider = mwTolRow.createEl('input', { attr: { type: 'range', min: '5', max: '100', value: String(mwTolerance) } });
		mwTolSlider.style.cssText = 'flex: 1; height: 16px;';
		const mwTolLabel = mwTolRow.createEl('span', { text: String(mwTolerance) });
		mwTolLabel.style.cssText = 'flex: 0 0 28px; text-align: right; font-size: 11px; color: var(--text-muted);';
		mwTolSlider.addEventListener('input', () => { mwTolerance = Number(mwTolSlider.value); mwTolLabel.textContent = mwTolSlider.value; });

		// Simplification slider
		const mwSimpRow = mwSettingsDiv.createDiv({ cls: 'dnd-mw-row' });
		mwSimpRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';
		mwSimpRow.createEl('span', { text: 'Simplify' }).style.cssText = 'flex: 0 0 auto; font-size: 11px; color: var(--text-muted);';
		const mwSimpSlider = mwSimpRow.createEl('input', { attr: { type: 'range', min: '1', max: '20', value: String(mwSimplifyEps) } });
		mwSimpSlider.style.cssText = 'flex: 1; height: 16px;';
		const mwSimpLabel = mwSimpRow.createEl('span', { text: String(mwSimplifyEps) });
		mwSimpLabel.style.cssText = 'flex: 0 0 28px; text-align: right; font-size: 11px; color: var(--text-muted);';
		mwSimpSlider.addEventListener('input', () => { mwSimplifyEps = Number(mwSimpSlider.value); mwSimpLabel.textContent = mwSimpSlider.value; });

		// Invert toggle
		const mwInvertRow = mwSettingsDiv.createDiv({ cls: 'dnd-mw-row' });
		mwInvertRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';
		const mwInvertCb = mwInvertRow.createEl('input', { attr: { type: 'checkbox' } });
		mwInvertCb.checked = mwInvert;
		mwInvertRow.createEl('span', { text: 'Invert (select light areas)' }).style.cssText = 'font-size: 11px; color: var(--text-muted);';
		mwInvertCb.addEventListener('change', () => { mwInvert = mwInvertCb.checked; });
		// Delete all walls button
		const clearWallsBtn = wallsPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: 'Delete All Walls' }
		});
		clearWallsBtn.createEl('span', { text: '🗑️' });
		clearWallsBtn.addEventListener('click', (e) => {
			e.stopPropagation(); // Prevent bubbling to wallsBtn
			if (config.walls && config.walls.length > 0) {
				saveToHistory();
				config.walls = [];
				redrawAnnotations();
				plugin.saveMapAnnotations(config, el);
				const viewport = el.querySelector('.dnd-map-viewport') as any;
				if (viewport && viewport._syncPlayerView) viewport._syncPlayerView();
				new Notice('All walls deleted');
			} else {
				new Notice('No walls to delete');
			}
		});

		// Light Sources picker sub-menu (shown when lights tool is active)
		const lightsPicker = lightsBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		const lightTypes = PLACEABLE_LIGHT_TYPES.map(type => ({ type, source: LIGHT_SOURCES[type] }));
		const lightTypeButtons: Map<string, HTMLButtonElement> = new Map();
		lightTypes.forEach(({ type, source }) => {
			const btn = lightsPicker.createEl('button', {
				cls: 'dnd-map-aoe-shape-btn' + (type === selectedLightSource ? ' active' : ''),
				attr: { title: `${source.name} (${source.bright}/${source.dim} ft)` }
			});
			btn.createEl('span', { text: source.icon });
			lightTypeButtons.set(type, btn);
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				selectedLightSource = type as LightSourceType;
				lightTypeButtons.forEach((b) => b.removeClass('active'));
				wallLightBtn.removeClass('active');
				btn.addClass('active');
				lightsPicker.addClass('hidden');
			});
		});
		// Wall Light button (special — switches to line-draw mode)
		const wallLightBtn = lightsPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn',
			attr: { title: 'Wall Light — Click two points to draw a light strip (15ft bright + 15ft dim)' }
		});
		wallLightBtn.createEl('span', { text: '📏' });
		wallLightBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			lightTypeButtons.forEach((b) => b.removeClass('active'));
			wallLightBtn.addClass('active');
			lightsPicker.addClass('hidden');
			setActiveTool('walllight-draw');
		});
		// Clear All Lights button
		const clearLightsBtn = lightsPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: 'Clear All Lights' }
		});
		clearLightsBtn.createEl('span', { text: '🌑' });
		clearLightsBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			saveToHistory();
			config.lightSources = [];
			redrawAnnotations();
			plugin.saveMapAnnotations(config, el);
			new Notice('All light sources removed');
		});

		// Elevation Paint picker sub-menu (shown when elevation-paint tool is active)
		const elevationPicker = elevationPaintBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		const elevationInputRow = elevationPicker.createDiv({ cls: 'dnd-map-aoe-row' });
		elevationInputRow.createEl('span', { text: 'Elevation:', cls: 'dnd-map-aoe-label' });
		const elevationInput = elevationInputRow.createEl('input', {
			cls: 'dnd-map-darkvision-input',
			attr: {
				type: 'number',
				step: '5',
				placeholder: '0',
				value: String(elevationPaintValue || 0)
			}
		});
		elevationInputRow.createEl('span', { text: 'ft' });
		elevationInput.addEventListener('change', (e) => {
			e.stopPropagation();
			elevationPaintValue = parseInt(elevationInput.value) || 0;
		});
		elevationInput.addEventListener('click', (e) => e.stopPropagation());
		// Clear button (acts as eraser)
		const clearElevationBtn = elevationPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn dnd-fog-action-btn',
			attr: { title: 'Clear tile elevation (eraser)' }
		});
		clearElevationBtn.createEl('span', { text: '🗑️' });
		clearElevationBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			elevationPaintValue = 0;
			elevationInput.value = '0';
			new Notice('Elevation eraser active (0 ft)');
		});

		// Difficult Terrain picker sub-menu (shown when difficult-terrain tool is active)
		const difficultTerrainPicker = difficultTerrainBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		const dtPaintBtn = difficultTerrainPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn active',
			attr: { title: 'Paint difficult terrain' }
		});
		dtPaintBtn.createEl('span', { text: '🌿' });
		const dtEraseBtn = difficultTerrainPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn',
			attr: { title: 'Erase difficult terrain' }
		});
		dtEraseBtn.createEl('span', { text: '🗑️' });
		dtPaintBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			isDifficultTerrainEraser = false;
			dtPaintBtn.addClass('active');
			dtEraseBtn.removeClass('active');
			new Notice('Difficult terrain brush active');
		});
		dtEraseBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			isDifficultTerrainEraser = true;
			dtEraseBtn.addClass('active');
			dtPaintBtn.removeClass('active');
			new Notice('Difficult terrain eraser active');
		});

		// Player View controls picker sub-menu (shown when player-view tool is active)
		const pvPicker = viewBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		const pvFullscreenBtn = pvPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn',
			attr: { title: 'Toggle Fullscreen on Player View' }
		});
		pvFullscreenBtn.createEl('span', { text: '🖵' });
		pvFullscreenBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			pvPicker.addClass('hidden');
			if ((plugin as any)._playerMapViews) {
				const mapId = config.mapId || resourcePath;
				(plugin as any)._playerMapViews.forEach((pv: any) => {
					if ((pv as any).mapId !== mapId) return;
					try { if (typeof pv.toggleFullscreen === 'function') pv.toggleFullscreen(); else (pv as any).toggleFullscreen?.(); } catch (e) {}
				});
			}
		});
		
		const pvCalibrateBtn = pvPicker.createEl('button', {
			cls: 'dnd-map-aoe-shape-btn',
			attr: { title: 'Calibrate Player View for Physical Miniatures' }
		});
		pvCalibrateBtn.createEl('span', { text: '🎯' });
		pvCalibrateBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			pvPicker.addClass('hidden');
			const popoutWin = window;
			new TabletopCalibrationModal(plugin.app, plugin, popoutWin, () => {
				// After calibration, compute and send scale to player views based on current gm rect
				try {
					const rect = (viewport as any)._gmViewRect || (plugin as any)._gmViewRect || null;
				if (!rect) return;
					if ((plugin as any)._playerMapViews) {
						const mapId = config.mapId || resourcePath;
						(plugin as any)._playerMapViews.forEach((pv: any) => {
							if ((pv as any).mapId !== mapId) return;
							try {
								// Prefer calibration-derived scale so each grid cell maps to the
								// configured physical miniature base size on the player's screen.
								const cal = plugin.settings.tabletopCalibration;
								const gridSize = config?.gridSize || 0;
								if (cal && gridSize > 0) {
									// scale such that (gridSize * scale) CSS px == (miniBaseMm * pixelsPerMm)
									const calibratedScale = (cal.pixelsPerMm * cal.miniBaseMm) / gridSize;
									const safeScale = Math.max(0.001, Math.min(100, calibratedScale));
									if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(safeScale as number);
									else pv.tabletopScale = safeScale;
									if (typeof pv.syncCanvasToImage === 'function') pv.syncCanvasToImage();
								} else {
									// Fallback: preserve previous behavior (fit GM view rect into PV viewport)
									const bounds = getRotatedRectBoundingSize(rect);
									const wrap = pv?.mapContainer as HTMLElement | undefined;
									if (wrap && bounds.w > 0 && bounds.h > 0) {
										const r = wrap.getBoundingClientRect();
										const desiredScale = Math.max(0.001, Math.min(100, Math.min(r.width / bounds.w, r.height / bounds.h)));
										if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(desiredScale as number);
										else pv.tabletopScale = desiredScale;
										if (typeof pv.syncCanvasToImage === 'function') pv.syncCanvasToImage();
									}
								}
							} catch (e) {}
						});
					}
				} catch (e) { console.warn('pvCalibrate callback error', e); }
			}).open();
		});

		// AoE shape picker sub-menu (shown when AoE tool is active, positioned right of button)
		const aoePicker = aoeBtn.createDiv({ cls: 'dnd-map-aoe-picker hidden' });
		const aoeShapes: { shape: 'circle' | 'cone' | 'square' | 'line'; icon: string; label: string }[] = [
			{ shape: 'circle', icon: '⭕', label: 'Circle' },
			{ shape: 'cone', icon: '🔺', label: 'Cone' },
			{ shape: 'square', icon: '⬜', label: 'Square' },
			{ shape: 'line', icon: '➖', label: 'Line' },
		];
		const aoeShapeButtons: Map<string, HTMLButtonElement> = new Map();
		aoeShapes.forEach(({ shape, icon, label }) => {
			const btn = aoePicker.createEl('button', {
				cls: 'dnd-map-aoe-shape-btn' + (shape === selectedAoeShape ? ' active' : ''),
				attr: { title: label }
			});
			btn.createEl('span', { text: icon });
			aoeShapeButtons.set(shape, btn);
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				// If there's a last-placed AoE, remove it when selecting any shape
				if (lastPlacedAoeId && config.aoeEffects) {
					const idx = config.aoeEffects.findIndex((a: any) => a.id === lastPlacedAoeId);
					if (idx >= 0) {
						saveToHistory();
						config.aoeEffects.splice(idx, 1);
						redrawAnnotations();
						plugin.saveMapAnnotations(config, el);
						updateGridToolsVisibility();
						new Notice('AoE effect removed');
					}
					lastPlacedAoeId = null;
				}
				selectedAoeShape = shape;
				aoeShapeButtons.forEach((b) => b.removeClass('active'));
				btn.addClass('active');
				aoePicker.addClass('hidden');
			});
		});
		
		// Helper: show/hide grid tools (calibrate, move-grid) based on whether annotations exist
		const updateGridToolsVisibility = () => {
			const hasAnnotations = (config.highlights?.length > 0) || (config.markers?.length > 0) || (config.drawings?.length > 0) || (config.aoeEffects?.length > 0);
			const isHexcrawl = (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical');
			
			// For hexcrawl maps, highlights are stored as col/row so grid can still be moved
			// For non-hexcrawl, hide tools once annotations exist to prevent misalignment
			const shouldHideGridTools = hasAnnotations && !isHexcrawl;
			
			calibrateBtn.toggleClass('hidden', shouldHideGridTools);
			moveGridBtn.toggleClass('hidden', shouldHideGridTools);
			measureBtn.toggleClass('hidden', shouldHideGridTools);
			
			// PoI button only visible for hexcrawl maps
			poiBtn.toggleClass('hidden', !isHexcrawl);
			
			// If calibration was active and annotations appeared (non-hexcrawl), cancel it
			if (shouldHideGridTools && isCalibrating) {
				isCalibrating = false;
				calibrationPoint1 = null;
				calibrationPoint2 = null;
				calibrateBtn.removeClass('active');
				measureBtn.removeClass('active');
			}
			// If move-grid tool was active and annotations appeared (non-hexcrawl), switch to pan
			if (shouldHideGridTools && activeTool === 'move-grid') {
				setActiveTool('pan');
			}
		};
		// Set initial visibility
		updateGridToolsVisibility();

		calibrateBtn.addEventListener('click', () => {
			// Open the grid calibration modal (no measurement)
			new GridCalibrationModal(
				plugin.app,
				config,
				async (gs, gw, gh, ox, oy) => {
					saveToHistory();
					config.gridSize = gs;
					config.gridSizeW = gw;
					config.gridSizeH = gh;
					config.gridOffsetX = ox;
					config.gridOffsetY = oy;
					// Update slider flyout label/value
					gridSlider.value = String(gs);
					gridSliderLabel.textContent = `${Math.round(gs * 10) / 10}px`;
					// Update W/H inputs
					gridWInput.value = String(Math.round((gw || gs) * 10) / 10);
					gridHInput.value = String(Math.round((gh || gs) * 10) / 10);
					gridWHLinked = !(gw && gh && gw !== gh);
					gridLinkBtn.textContent = gridWHLinked ? '🔗' : '🔓';
					gridLinkBtn.toggleClass('linked', gridWHLinked);
					redrawGridOverlays();
					redrawAnnotations();
					await plugin.saveMapAnnotations(config, el);
					new Notice('Grid calibration applied');
				},
			).open();
		});

		measureBtn.addEventListener('click', () => {
			if (isCalibrating) {
				// Cancel measurement
				isCalibrating = false;
				calibrationPoint1 = null;
				calibrationPoint2 = null;
				measureBtn.removeClass('active');
				setActiveTool('pan');
				redrawAnnotations();
				new Notice('Measurement cancelled');
			} else {
				// Start two-point measurement
				setActiveTool('pan');
				isCalibrating = true;
				calibrationPoint1 = null;
				calibrationPoint2 = null;
				measureBtn.addClass('active');
				viewport.style.cursor = 'crosshair';
				new Notice('Click two points on the map to measure distance');
			}
		});
		
		clearTunnelsBtn.addEventListener('click', () => {
			if (!config.tunnels || config.tunnels.length === 0) {
				new Notice('No tunnels to clear');
				return;
			}
			
			const tunnelCount = config.tunnels.length;
			saveToHistory();
			config.tunnels = [];
			plugin.saveMapAnnotations(config, el);
			redrawAnnotations();
			if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
			new Notice(`Cleared ${tunnelCount} tunnel${tunnelCount === 1 ? '' : 's'}`);
		});

		// Grid size slider (flyout on move-grid button, visible when grid is enabled)
		const hasGrid = config.gridType && config.gridType !== 'none';
		
		// Create the slider flyout attached to the move-grid button
		const gridSliderFlyout = moveGridBtn.createDiv({ cls: 'dnd-map-grid-slider-flyout' });
		const gridSliderLabel = gridSliderFlyout.createEl('span', { 
			text: `${Math.round(config.gridSize * 10) / 10}px`, 
			cls: 'dnd-map-grid-slider-label' 
		});
		
		// Click label to manually enter a value
		gridSliderLabel.addEventListener('click', (e) => {
			e.stopPropagation();
			const input = document.createElement('input');
			input.type = 'number';
			input.value = String(Math.round(config.gridSize * 10) / 10);
			input.min = '10';
			input.max = '300';
			input.step = '0.1';
			input.className = 'dnd-map-grid-size-input';
			gridSliderLabel.replaceWith(input);
			input.focus();
			input.select();
			
			const applyValue = () => {
				let val = parseFloat(input.value);
				if (isNaN(val) || val < 10) val = 10;
				if (val > 300) val = 300;
				config.gridSize = val;
				gridSlider.value = String(val);
				gridSliderLabel.textContent = `${Math.round(val * 10) / 10}px`;
				input.replaceWith(gridSliderLabel);
				// Redraw grid
				redrawGridOverlays();
				redrawAnnotations();
				plugin.saveMapAnnotations(config, el);
			};
			
			input.addEventListener('blur', applyValue);
			input.addEventListener('keydown', (ke) => {
				if (ke.key === 'Enter') { ke.preventDefault(); applyValue(); }
				if (ke.key === 'Escape') { input.replaceWith(gridSliderLabel); }
			});
			input.addEventListener('mousedown', (me) => me.stopPropagation());
		});
		
		const gridSlider = gridSliderFlyout.createEl('input', {
			type: 'range',
			cls: 'dnd-map-grid-slider-input',
			attr: { 
				min: '10', 
				max: '300', 
				value: String(config.gridSize),
				step: '0.0001'
			}
		});
		// Prevent slider interaction from triggering button click or map events
		gridSliderFlyout.addEventListener('mousedown', (e) => e.stopPropagation());
		gridSliderFlyout.addEventListener('click', (e) => e.stopPropagation());
		
		// --- Fine-tune W/H row ---
		const gridWHRow = gridSliderFlyout.createDiv({ cls: 'dnd-map-grid-wh-row' });
		let gridWHLinked = !(config.gridSizeW && config.gridSizeH && config.gridSizeW !== config.gridSizeH);
		
		const gridWLabel = gridWHRow.createEl('span', { text: 'W', cls: 'dnd-map-grid-wh-label' });
		const gridWInput = gridWHRow.createEl('input', {
			type: 'number',
			cls: 'dnd-map-grid-wh-input',
			attr: { min: '10', max: '600', step: '0.1', value: String(Math.round((config.gridSizeW || config.gridSize) * 10) / 10) }
		});
		
		const gridLinkBtn = gridWHRow.createEl('button', { 
			text: gridWHLinked ? '🔗' : '🔓', 
			cls: 'dnd-map-grid-link-btn' + (gridWHLinked ? ' linked' : '') 
		});
		
		const gridHLabel = gridWHRow.createEl('span', { text: 'H', cls: 'dnd-map-grid-wh-label' });
		const gridHInput = gridWHRow.createEl('input', {
			type: 'number',
			cls: 'dnd-map-grid-wh-input',
			attr: { min: '10', max: '600', step: '0.1', value: String(Math.round((config.gridSizeH || config.gridSize) * 10) / 10) }
		});
		
		// Prevent events from bubbling
		[gridWInput, gridHInput, gridLinkBtn].forEach(el2 => {
			el2.addEventListener('mousedown', (e) => e.stopPropagation());
			el2.addEventListener('click', (e) => e.stopPropagation());
		});
		
		const syncWHFromGridSize = (size: number) => {
			const rounded = Math.round(size * 10) / 10;
			gridWInput.value = String(rounded);
			gridHInput.value = String(rounded);
			config.gridSizeW = undefined as any;
			config.gridSizeH = undefined as any;
		};
		
		const applyWH = () => {
			const w = parseFloat(gridWInput.value);
			const h = parseFloat(gridHInput.value);
			if (!isNaN(w) && w >= 10) config.gridSizeW = w;
			if (!isNaN(h) && h >= 10) config.gridSizeH = h;
			redrawGridOverlays();
			redrawAnnotations();
			plugin.saveMapAnnotations(config, el);
		};
		
		let gridWHTimeout: ReturnType<typeof setTimeout> | null = null;
		const debouncedApplyWH = () => {
			if (gridWHTimeout) clearTimeout(gridWHTimeout);
			gridWHTimeout = setTimeout(applyWH, 300);
		};
		
		gridWInput.addEventListener('input', () => {
			if (gridWHLinked) {
				gridHInput.value = gridWInput.value;
			}
			debouncedApplyWH();
		});
		gridHInput.addEventListener('input', () => {
			if (gridWHLinked) {
				gridWInput.value = gridHInput.value;
			}
			debouncedApplyWH();
		});
		
		gridLinkBtn.addEventListener('click', () => {
			gridWHLinked = !gridWHLinked;
			gridLinkBtn.textContent = gridWHLinked ? '🔗' : '🔓';
			gridLinkBtn.toggleClass('linked', gridWHLinked);
			if (gridWHLinked) {
				// Sync H to match W
				gridHInput.value = gridWInput.value;
				const val = parseFloat(gridWInput.value);
				if (!isNaN(val) && val >= 10) {
					config.gridSize = val;
					config.gridSizeW = undefined as any;
					config.gridSizeH = undefined as any;
					gridSlider.value = String(val);
					gridSliderLabel.textContent = `${Math.round(val * 10) / 10}px`;
					redrawGridOverlays();
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				}
			}
		});
		
		let gridSliderTimeout: ReturnType<typeof setTimeout> | null = null;
		gridSlider.addEventListener('input', (e) => {
			const newSize = parseFloat((e.target as HTMLInputElement).value);
			config.gridSize = newSize;
			gridSliderLabel.textContent = `${Math.round(newSize * 10) / 10}px`;
			if (gridWHLinked) {
				syncWHFromGridSize(newSize);
			}
			// Redraw grid live
			redrawGridOverlays();
			redrawAnnotations();
			// Debounced save
			if (gridSliderTimeout) clearTimeout(gridSliderTimeout);
			gridSliderTimeout = setTimeout(() => {
				plugin.saveMapAnnotations(config, el);
			}, 500);
		});

		// Separator for color picker (hidden by default)
		const colorSeparator = toolbarContent.createDiv({ cls: 'dnd-map-tool-separator hidden' });

		// Color picker for highlights/drawings (hidden by default)
		const colorPicker = toolbarContent.createDiv({ cls: 'dnd-map-color-picker hidden' });
		const colorInput = colorPicker.createEl('input', { 
			type: 'color',
			cls: 'dnd-map-color-input',
			attr: { value: selectedColor }
		});
		colorInput.addEventListener('change', (e) => {
			selectedColor = (e.target as HTMLInputElement).value;
		});
		
		// Toolbar collapse/expand functionality
		toolbarHeader.addEventListener('click', () => {
			toolbar.toggleClass('collapsed', !toolbar.hasClass('collapsed'));
		});
		
		// Section header collapse/expand functionality
		visionSectionHeader.addEventListener('click', () => {
			const isCollapsed = visionSectionHeader.hasClass('collapsed');
			visionSectionHeader.toggleClass('collapsed', !isCollapsed);
			visionContent.toggleClass('collapsed', !isCollapsed);
		});

		tokenVisionSectionHeader.addEventListener('click', () => {
			const isCollapsed = tokenVisionSectionHeader.hasClass('collapsed');
			tokenVisionSectionHeader.toggleClass('collapsed', !isCollapsed);
			tokenVisionContent.toggleClass('collapsed', !isCollapsed);
		});
		
		setupSectionHeader.addEventListener('click', () => {
			const isCollapsed = setupSectionHeader.hasClass('collapsed');
			setupSectionHeader.toggleClass('collapsed', !isCollapsed);
			setupContent.toggleClass('collapsed', !isCollapsed);
		});

		// Add layer menu below toolbar - append to wrapper as sibling
		const layerMenu = toolbarWrapper.createDiv({ cls: 'dnd-map-layer-menu' });

		// Layer icons
		const layerIcons: Record<Layer, string> = {
			'Player': '👥',
			'Elevated': '🦅',
			'Subterranean': '🕳️',
			'DM': '🎲',
			'Background': '🗺️'
		};
		
		// Create layer buttons
		const layers: Layer[] = ['Player', 'Elevated', 'Subterranean', 'DM', 'Background'];
		const layerButtons: Record<Layer, HTMLButtonElement> = {} as any;
		
		layers.forEach(layer => {
			const btn = layerMenu.createEl('button', {
				cls: 'dnd-map-layer-btn' + (layer === config.activeLayer ? ' active' : ''),
				attr: { 'data-layer': layer, 'title': layer }
			});
			btn.createEl('span', { text: layerIcons[layer], cls: 'dnd-map-layer-icon' });
			layerButtons[layer] = btn;
			
			btn.addEventListener('click', () => {
				// Toggle menu expansion
				if (layer === config.activeLayer) {
					layerMenu.toggleClass('expanded', !layerMenu.hasClass('expanded'));
				} else {
					// Switch active layer
					config.activeLayer = layer;
					layers.forEach(l => layerButtons[l].removeClass('active'));
					btn.addClass('active');
					layerMenu.removeClass('expanded');
					// Show/hide Vision section based on layer (only available on Background, hidden for hexcrawl)
					if (layer !== 'Background' || isHexcrawlMap) {
						visionSectionHeader.addClass('hidden');
						visionContent.addClass('hidden');
						// Reset background edit view when leaving Background layer
						setBackgroundEditView('all');
					} else {
						visionSectionHeader.removeClass('hidden');
						visionContent.removeClass('hidden');
						// Ensure section is expanded when switching to Background layer
						visionSectionHeader.removeClass('collapsed');
						visionContent.removeClass('collapsed');
						// Show individual vision tool buttons
						fogBtn.removeClass('hidden');
						wallsBtn.removeClass('hidden');
						lightsBtn.removeClass('hidden');
						elevationPaintBtn.removeClass('hidden');
						difficultTerrainBtn.removeClass('hidden');
						envAssetBtn.removeClass('hidden');
					}
					// Show/hide Tunnels section based on layer (only available on Subterranean, hidden for hexcrawl)
					if (layer !== 'Subterranean' || isHexcrawlMap) {
						tunnelsSectionHeader.addClass('hidden');
						tunnelsContent.addClass('hidden');
					} else {
						tunnelsSectionHeader.removeClass('hidden');
						tunnelsContent.removeClass('hidden');
						// Ensure section is expanded when switching to Subterranean layer
						tunnelsSectionHeader.removeClass('collapsed');
						tunnelsContent.removeClass('collapsed');
					}
					if (layer !== 'Background' && (activeTool === 'fog' || activeTool === 'walls' || activeTool === 'lights' || activeTool === 'walllight-draw' || activeTool === 'elevation-paint' || activeTool === 'difficult-terrain' || activeTool === 'env-asset')) {
						setActiveTool('pan');
					}
					// Terrain/climate canvas follows Background layer visibility
					if (terrainCanvas) {
						terrainCanvas.style.opacity = layer === 'Background' ? '1' : '0.25';
					}
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					// Sync to player view on layer change (needed for fog/light visibility)
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				}
			});
		});

		// For hexcrawl maps, hide Elevated and Subterranean layers
		if (isHexcrawlMap) {
			layerButtons['Elevated']?.addClass('hidden');
			layerButtons['Subterranean']?.addClass('hidden');

			// Wire up the hexcrawl bridge so HexcrawlView can read/write state
			// NOTE: setActiveTool is patched in later once the function is defined
			plugin._hexcrawlBridge = {
				config,
				el,
				save: () => plugin.saveMapAnnotations(config, el),
				redraw: () => { redrawTerrainLayer(); redrawAnnotations(); },
				setActiveTool: () => {},
			};
			plugin.refreshHexcrawlView();
		}

		// Add Player View button (top right)
		const playerViewBtn = viewport.createEl('button', {
			cls: 'dnd-map-player-view-btn',
			attr: { title: 'Open Player View' }
		});
		playerViewBtn.innerHTML = '👁️ Player View';
		
		playerViewBtn.addEventListener('click', async () => {
            // Allow multiple player views; do not close existing player view windows
			
			// Open a popout window with the player map view
			const popoutLeaf = plugin.app.workspace.openPopoutLeaf({
				size: { width: 1920, height: 1080 }
			});
			
			await popoutLeaf.setViewState({
				type: PLAYER_MAP_VIEW_TYPE,
				active: true,
				state: {
					mapId: config.mapId || resourcePath,
					mapConfig: {
						markers: config.markers,
						drawings: config.drawings,
						highlights: config.highlights,
						aoeEffects: config.aoeEffects,
						fogOfWar: config.fogOfWar,
						walls: config.walls,
						lightSources: config.lightSources,
						tunnels: config.tunnels,
						poiReferences: config.poiReferences,
						gridType: config.gridType,
						gridSize: config.gridSize,
						gridOffsetX: config.gridOffsetX || 0,
						gridOffsetY: config.gridOffsetY || 0,
						scale: config.scale,
						name: config.name,
						isVideo: config.isVideo,
						type: config.type
					},
					imageResourcePath: resourcePath
				}
			});

      // After opening a player view, if we have a GM-side viewRect, push its position to the new view
      if ((viewport as any)._gmViewRect) {
        const rect = (viewport as any)._gmViewRect as any;
        // Delay a frame to allow player view to initialize
        setTimeout(() => {
          const pv = popoutLeaf.view as any;
          if (pv && typeof pv.setTabletopPanFromImageCoords === 'function') {
            try {
              // compute and set PV scale so GM indicator maps to PV viewport
              try {
                const bounds = getRotatedRectBoundingSize(rect);
                const wrap = (pv as any)?.mapContainer as HTMLElement | undefined;
                if (wrap && bounds.w > 0 && bounds.h > 0) {
                  const r = wrap.getBoundingClientRect();
                  const desiredScale = Math.max(0.001, Math.min(100, Math.min(r.width / bounds.w, r.height / bounds.h)));
                  if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(desiredScale as number);
                  else (pv as any).tabletopScale = desiredScale;
                }
              } catch (e) { }

              // Send rectangle center to player view (center-based approach)
              const centerX = rect.x + rect.w / 2;
              const centerY = rect.y + rect.h / 2;
              pv.setTabletopPanFromImageCoords(centerX, centerY);
            } catch (e) { }
          }
        }, 50);
      }
			
      // Store sync function that pushes updates to all open player views
      // (rAF-coalesced: many calls per frame → one actual sync at next paint)
      let _pvSyncScheduled = false;
      const _syncPlayerViewImmediate = () => {
        _pvSyncScheduled = false;
        if (plugin._playerMapViews && plugin._playerMapViews.size > 0) {
          // Build drag ruler data if a marker is being dragged
          let dragRuler: { origin: { x: number; y: number }; current: { x: number; y: number }; pathCells?: { col: number; row: number; dist: number }[]; totalDist?: number; climbDist?: number; markerId?: string; visibleToPlayers?: boolean } | null = null;
          if (markerDragOrigin && draggingMarkerIndex >= 0 && config.markers[draggingMarkerIndex]) {
            const draggedMarker = config.markers[draggingMarkerIndex];
            const currentPos = draggedMarker.position;
            const pathResult = computeGridMovePath(markerDragOrigin, currentPos);
            dragRuler = {
              origin: { x: markerDragOrigin.x, y: markerDragOrigin.y },
              current: { x: currentPos.x, y: currentPos.y },
              pathCells: pathResult.cells,
              totalDist: pathResult.totalDist,
              climbDist: pathResult.climbDist,
              markerId: draggedMarker.markerId,
              visibleToPlayers: !!draggedMarker.visibleToPlayers
            };
          }
          // Build measure ruler data if ruler is active
          let measureRuler: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
          if (rulerStart && rulerEnd && rulerComplete) {
            measureRuler = {
              start: { x: rulerStart.x, y: rulerStart.y },
              end: { x: rulerEnd.x, y: rulerEnd.y }
            };
          }
          // Build target distance ruler data if active
          let targetDistRuler: { origin: { x: number; y: number; elevation: number }; target: { x: number; y: number; elevation: number } } | null = null;
          if (targetDistOriginIdx >= 0 && targetDistTargetIdx >= 0 && config.markers[targetDistOriginIdx] && config.markers[targetDistTargetIdx]) {
            const oMarker = config.markers[targetDistOriginIdx];
            const tMarker = config.markers[targetDistTargetIdx];
            const oElev = (oMarker.elevation?.height || 0) - (oMarker.elevation?.depth || 0);
            const tElev = (tMarker.elevation?.height || 0) - (tMarker.elevation?.depth || 0);
            targetDistRuler = {
              origin: { x: oMarker.position.x, y: oMarker.position.y, elevation: oElev },
              target: { x: tMarker.position.x, y: tMarker.position.y, elevation: tElev }
            };
          }
          const payload: any = {
            markers: config.markers,
            drawings: config.drawings,
            highlights: config.highlights,
            aoeEffects: config.aoeEffects,
            fogOfWar: config.fogOfWar,
            walls: config.walls,
            lightSources: config.lightSources,
            tunnels: config.tunnels,
            poiReferences: config.poiReferences,
            gridType: config.gridType,
            gridSize: config.gridSize,
            gridSizeW: config.gridSizeW,
            gridSizeH: config.gridSizeH,
            gridVisible: config.gridVisible !== undefined ? config.gridVisible : true,
            gridOffsetX: config.gridOffsetX || 0,
            gridOffsetY: config.gridOffsetY || 0,
            scale: config.scale,
            name: config.name,
            type: config.type,
            dragRuler: dragRuler,
            measureRuler: measureRuler,
            targetDistRuler: targetDistRuler,
            selectedVisionTokenId: (() => {
              // Only pass vision selection to player view if the selected token
              // is a player-type or has visibleToPlayers ("Show to Players").
              // Creature/NPC tokens without visibleToPlayers are DM-only previews;
              // the player view should fall back to "All Players" combined vision.
              if (!selectedVisionTokenId) return null;
              const selMarker = (config.markers || []).find((m: any) => m.id === selectedVisionTokenId);
              if (!selMarker) return null;
              const selDef = selMarker.markerId ? plugin.markerLibrary.getMarker(selMarker.markerId) : null;
              if (selDef && selDef.type === 'player') return selectedVisionTokenId;
              if (selMarker.visibleToPlayers) return selectedVisionTokenId;
              return null; // creature/NPC without Show to Players → All Players for player view
            })(),
            hexTerrains: config.hexTerrains,
            hexClimates: config.hexClimates,
            tileElevations: config.tileElevations || {},
            difficultTerrain: config.difficultTerrain || {},
            envAssets: config.envAssets || [],
            hexcrawlState: config.hexcrawlState,
            hexcrawlRangeOverlay: (activeTool === 'hexcrawl-move' && config.hexcrawlState?.enabled && config.hexcrawlState?.partyPosition) ? {
              active: true,
              hoverHex: hexcrawlMoveHoverHex,
            } : null,
          };
          // Attach pending hexcrawl travel animation data (set by hexcrawl-move handler)
          if ((viewport as any)._pendingHexcrawlTravel) {
            payload.hexcrawlTravel = (viewport as any)._pendingHexcrawlTravel;
            (viewport as any)._pendingHexcrawlTravel = null;
          }
          const mapId = config.mapId || resourcePath;
          plugin._playerMapViews.forEach(view => {
            const viewMapId = (view as any).mapId;
            if (viewMapId === mapId) {
              try { 
                view.updateMapData(payload); 
              } catch (e) { 
                console.error('Failed to update player view', e); 
              }
            }
          });
        }
      };
      // rAF-coalesced wrapper: no matter how many times _syncPlayerView is
      // called within one frame (e.g. mousemove → redraw + sync), the actual
      // payload build + PV redraw only happens once at the next paint.
      (viewport as any)._syncPlayerView = () => {
        if (_pvSyncScheduled) return;
        _pvSyncScheduled = true;
        requestAnimationFrame(() => _syncPlayerViewImmediate());
      };
			
			// Initial sync after a short delay to ensure player view is ready
			setTimeout(() => {
				if ((viewport as any)._syncPlayerView) {
					(viewport as any)._syncPlayerView();
				}
			}, 200);
			
			new Notice('Player view opened');
		});

		// Add "Open in Side Panel" button (top right, left of Player View)
		const sidePanelBtn = viewport.createEl('button', {
			cls: 'dnd-map-side-panel-btn',
			attr: { title: 'Open Map in Side Panel' }
		});
		sidePanelBtn.innerHTML = '📌';

		sidePanelBtn.addEventListener('click', async () => {
			const mapId = config.mapId || resourcePath;
			const sourceConfig = JSON.stringify({ mapId: config.mapId });

			// Check if already open in a side panel
			const existingLeaves = plugin.app.workspace.getLeavesOfType(GM_MAP_VIEW_TYPE);
			const existingGmLeaf = existingLeaves.find((leaf: any) => {
				const view = leaf.view as GmMapView;
				return view.getMapId() === mapId;
			});

			if (existingGmLeaf) {
				// Already open — focus it
				plugin.app.workspace.setActiveLeaf(existingGmLeaf);
				new Notice('Map already open in side panel');
				return;
			}

			// Open in a right split leaf
			const rightLeaf = plugin.app.workspace.getLeaf('split', 'vertical');

			await rightLeaf.setViewState({
				type: GM_MAP_VIEW_TYPE,
				active: true,
				state: {
					mapId: mapId,
					notePath: ctx?.sourcePath || '',
					sourceConfig: sourceConfig
				}
			});

			// Update inline map with a compact placeholder
			const viewer = el.querySelector('.dnd-map-viewer') as HTMLElement;
			if (viewer) {
				// Store original children for restoration
				const originalChildren: Node[] = [];
				viewer.childNodes.forEach(n => originalChildren.push(n));

				// Clear and create placeholder
				viewer.empty();
				viewer.addClass('dnd-map-inline-placeholder-active');

				const placeholder = viewer.createDiv({ cls: 'dnd-map-inline-placeholder' });
				const content = placeholder.createDiv({ cls: 'dnd-map-placeholder-content' });
				content.createSpan({ cls: 'dnd-map-placeholder-icon', text: '📌' });
				content.createSpan({ cls: 'dnd-map-placeholder-text', text: `"${config.name || 'Map'}" is open in side panel` });

				const focusBtn = content.createEl('button', {
					cls: 'dnd-map-placeholder-focus-btn',
					text: 'Focus Map'
				});
				focusBtn.addEventListener('click', () => {
					const leaves = plugin.app.workspace.getLeavesOfType(GM_MAP_VIEW_TYPE);
					const targetLeaf = leaves.find((l: any) => (l.view as GmMapView).getMapId() === mapId);
					if (targetLeaf) plugin.app.workspace.setActiveLeaf(targetLeaf);
				});

				const restoreBtn = content.createEl('button', {
					cls: 'dnd-map-placeholder-restore-btn',
					text: 'Restore Inline'
				});
				restoreBtn.addEventListener('click', () => {
					// Close the side leaf
					const leaves = plugin.app.workspace.getLeavesOfType(GM_MAP_VIEW_TYPE);
					const targetLeaf = leaves.find((l: any) => (l.view as GmMapView).getMapId() === mapId);
					if (targetLeaf) targetLeaf.detach();
					// Restore original inline content
					viewer.empty();
					viewer.removeClass('dnd-map-inline-placeholder-active');
					originalChildren.forEach(n => viewer.appendChild(n));
				});
			}

			new Notice('Map opened in side panel');
		});

		// State for zoom and pan
		let scale = 1;
		let translateX = 0;
		let translateY = 0;
		let isDragging = false;
		let startX = 0;
		let startY = 0;
		// Middle mouse button temporary pan state
		let previousToolBeforePan: 'pan' | 'select' | 'highlight' | 'draw' | 'ruler' | 'target-distance' | 'eraser' | 'move-grid' | 'marker' | 'aoe' | 'fog' | 'walls' | 'lights' | 'walllight-draw' | 'elevation-paint' | 'difficult-terrain' | 'player-view' | 'poi' | 'terrain-paint' | 'climate-paint' | 'hexcrawl-move' | 'set-start-hex' | 'hex-desc' | 'magic-wand' | 'env-asset' | null = null;
		let isTemporaryPan = false;
		let gridCanvas: HTMLCanvasElement | null = null;
		let terrainCanvas: HTMLCanvasElement | null = null;
		let annotationCanvas: HTMLCanvasElement | null = null;

		// Function to update transform
		const updateTransform = () => {
			mapWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
		};

		// Function to convert screen coordinates to map coordinates (in natural image pixel space)
		const screenToMap = (screenX: number, screenY: number) => {
			const rect = viewport.getBoundingClientRect();
			// First get coordinates in displayed image space
			const displayX = (screenX - rect.left - translateX) / scale;
			const displayY = (screenY - rect.top - translateY) / scale;
			
			// Scale to natural image dimensions (for canvas drawing)
			const scaleX = img.naturalWidth / img.width;
			const scaleY = img.naturalHeight / img.height;
			const x = displayX * scaleX;
			const y = displayY * scaleY;
			
			return { x, y };
		};

		// Helper function to generate tunnel walls from path
		const generateTunnelWalls = (
			path: Array<{x: number, y: number}>,
			tunnelWidth: number
		): Array<{start: {x: number, y: number}, end: {x: number, y: number}}> => {
			if (!path || path.length < 2) return [];
			
			const walls: Array<{start: {x: number, y: number}, end: {x: number, y: number}}> = [];
			const halfWidth = tunnelWidth / 2;
			
			// Generate parallel walls along each segment of the path
			for (let i = 0; i < path.length - 1; i++) {
				const p1 = path[i];
				const p2 = path[i + 1];
				if (!p1 || !p2) continue;
				
				// Calculate perpendicular vector for this segment
				const dx = p2.x - p1.x;
				const dy = p2.y - p1.y;
				const len = Math.sqrt(dx * dx + dy * dy);
				
				if (len === 0) continue;
				
				// Normalized perpendicular vector (rotated 90 degrees)
				const perpX = -dy / len;
				const perpY = dx / len;
				
				// Calculate wall endpoints for this segment
				const leftStart = { x: p1.x + perpX * halfWidth, y: p1.y + perpY * halfWidth };
				const leftEnd = { x: p2.x + perpX * halfWidth, y: p2.y + perpY * halfWidth };
				const rightStart = { x: p1.x - perpX * halfWidth, y: p1.y - perpY * halfWidth };
				const rightEnd = { x: p2.x - perpX * halfWidth, y: p2.y - perpY * halfWidth };
				
				// Add left wall segment
				walls.push({ start: leftStart, end: leftEnd });
				
				// Add right wall segment
				walls.push({ start: rightStart, end: rightEnd });
			}
			
			// Add end caps to close the tunnel at entrance and exit
			if (path.length >= 2) {
				// Entrance cap
				const firstSegment = path[1];
				const firstPoint = path[0];
				if (firstSegment && firstPoint) {
					const dx = firstSegment.x - firstPoint.x;
					const dy = firstSegment.y - firstPoint.y;
					const len = Math.sqrt(dx * dx + dy * dy);
					if (len > 0) {
						const perpX = -dy / len;
						const perpY = dx / len;
						walls.push({
							start: { x: firstPoint.x + perpX * halfWidth, y: firstPoint.y + perpY * halfWidth },
							end: { x: firstPoint.x - perpX * halfWidth, y: firstPoint.y - perpY * halfWidth }
						});
					}
				}
				
				// Exit cap
				const lastIdx = path.length - 1;
				const lastPoint = path[lastIdx];
				const secondLastPoint = path[lastIdx - 1];
				if (lastPoint && secondLastPoint) {
					const dx = lastPoint.x - secondLastPoint.x;
					const dy = lastPoint.y - secondLastPoint.y;
					const len = Math.sqrt(dx * dx + dy * dy);
					if (len > 0) {
						const perpX = -dy / len;
						const perpY = dx / len;
						walls.push({
							start: { x: lastPoint.x + perpX * halfWidth, y: lastPoint.y + perpY * halfWidth },
							end: { x: lastPoint.x - perpX * halfWidth, y: lastPoint.y - perpY * halfWidth }
						});
					}
				}
			}
			
			return walls;
		};

		// Helper function to calculate distance from point to line segment
		const distanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
			const A = px - x1;
			const B = py - y1;
			const C = x2 - x1;
			const D = y2 - y1;
			
			const dot = A * C + B * D;
			const lenSq = C * C + D * D;
			let param = -1;
			
			if (lenSq !== 0) {
				param = dot / lenSq;
			}
			
			let xx, yy;
			
			if (param < 0) {
				xx = x1;
				yy = y1;
			} else if (param > 1) {
				xx = x2;
				yy = y2;
			} else {
				xx = x1 + param * C;
				yy = y1 + param * D;
			}
			
			const dx = px - xx;
			const dy = py - yy;
			return Math.sqrt(dx * dx + dy * dy);
		};

		// Erase all annotations within radius of a point. Returns true if anything was removed.
		const eraseAtPoint = (px: number, py: number): boolean => {
			const eraserRadius = 20; // pixels
			let removed = false;

			// Erase AoE effects near the point
			if (config.aoeEffects && config.aoeEffects.length > 0) {
				for (let i = config.aoeEffects.length - 1; i >= 0; i--) {
					const aoe = config.aoeEffects[i];
					const dist = Math.sqrt(
						Math.pow(aoe.origin.x - px, 2) +
						Math.pow(aoe.origin.y - py, 2)
					);
					if (dist < (config.gridSize || 70)) {
						config.aoeEffects.splice(i, 1);
						removed = true;
					}
				}
			}

			// Erase highlights at the hovered hex
			{
				const hex = pixelToHex(px, py);
				const highlightIndex = config.highlights.findIndex(
					(h: any) => h.col === hex.col && h.row === hex.row
				);
				if (highlightIndex >= 0) {
					config.highlights.splice(highlightIndex, 1);
					removed = true;
				}
			}

			// Erase PoI references at the hovered hex
			if ((config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') && config.poiReferences && config.poiReferences.length > 0) {
				const hex = pixelToHex(px, py);
				const poiIndex = config.poiReferences.findIndex(
					(ref: any) => ref.col === hex.col && ref.row === hex.row
				);
				if (poiIndex >= 0) {
					config.poiReferences.splice(poiIndex, 1);
					removed = true;
				}
			}

			// Erase drawings near the point
			if (config.drawings.length > 0) {
				for (let i = config.drawings.length - 1; i >= 0; i--) {
					const drawing = config.drawings[i];
					for (const point of drawing.points) {
						const dist = Math.sqrt(
							Math.pow(point.x - px, 2) +
							Math.pow(point.y - py, 2)
						);
						if (dist < eraserRadius) {
							config.drawings.splice(i, 1);
							removed = true;
							break;
						}
					}
				}
			}

			// Erase walls near the point
			if (config.walls && config.walls.length > 0) {
				for (let i = config.walls.length - 1; i >= 0; i--) {
					const wall = config.walls[i];
					const dist = distanceToLineSegment(
						px, py,
						wall.start.x, wall.start.y,
						wall.end.x, wall.end.y
					);
					if (dist < eraserRadius) {
						config.walls.splice(i, 1);
						removed = true;
					}
				}
			}

			// Erase light sources near the point
			if (config.lightSources && config.lightSources.length > 0) {
				for (let i = config.lightSources.length - 1; i >= 0; i--) {
					const light = config.lightSources[i];
					const dist = Math.sqrt(
						Math.pow(light.x - px, 2) +
						Math.pow(light.y - py, 2)
					);
					if (dist < eraserRadius) {
						config.lightSources.splice(i, 1);
						removed = true;
					}
				}
				updateFlickerAnimation();
			}

			// Erase markers near the point
			if (config.markers.length > 0) {
				for (let i = config.markers.length - 1; i >= 0; i--) {
					const marker = config.markers[i];
					const mDef = marker.markerId ? plugin.markerLibrary.getMarker(marker.markerId) : null;
					const mRadius = mDef ? getMarkerRadius(mDef) : 15;
					const dist = Math.sqrt(
						Math.pow(marker.position.x - px, 2) +
						Math.pow(marker.position.y - py, 2)
					);
					if (dist < mRadius) {
						config.markers.splice(i, 1);
						removed = true;
						refreshVisionSelector();
					}
				}
			}

			return removed;
		};

			// Helper: Get effective grid size (fixed single grid — no pace scaling)
			const getEffectiveGridSize = () => {
				return config.gridSize;
			};

			// Helper: Get hex geometry accounting for independent W/H overrides
			// Returns { horiz, vert, sizeX, sizeY } for center-to-center spacing and drawing radii
			const getHexGeometry = () => {
				if (config.gridType === 'hex-horizontal') {
					const horiz = config.gridSizeW || config.gridSize;
					const defaultSize = (2/3) * horiz;
					const defaultVert = Math.sqrt(3) * defaultSize;
					const vert = config.gridSizeH || defaultVert;
					const sizeX = horiz * (2/3);
					const sizeY = vert / Math.sqrt(3);
					return { horiz, vert, sizeX, sizeY };
				} else if (config.gridType === 'hex-vertical') {
					const vert = config.gridSizeH || config.gridSize;
					const defaultSize = (2/3) * vert;
					const defaultHoriz = Math.sqrt(3) * defaultSize;
					const horiz = config.gridSizeW || defaultHoriz;
					const sizeY = vert * (2/3);
					const sizeX = horiz / Math.sqrt(3);
					return { horiz, vert, sizeX, sizeY };
				} else {
					// Square fallback
					const s = config.gridSize;
					return { horiz: s, vert: s, sizeX: s, sizeY: s };
				}
			};

			// Helper: Convert hex col/row to pixel center using W/H-aware geometry
			const hexToPixel = (col: number, row: number): { x: number; y: number } => {
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const geo = getHexGeometry();
				if (config.gridType === 'hex-horizontal') {
					const colOffsetY = (col & 1) ? geo.vert / 2 : 0;
					return { x: col * geo.horiz + ox, y: row * geo.vert + colOffsetY + oy };
				} else if (config.gridType === 'hex-vertical') {
					const rowOffsetX = (row & 1) ? geo.horiz / 2 : 0;
					return { x: col * geo.horiz + rowOffsetX + ox, y: row * geo.vert + oy };
				} else {
					return { x: col * geo.horiz + ox, y: row * geo.vert + oy };
				}
			};

			// Function to get cell coordinates from pixel position (accounts for grid offset)
			const pixelToHex = (x: number, y: number) => {
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const geo = getHexGeometry();
				
				if (config.gridType === 'hex-horizontal') {
					const col = Math.round((x - ox) / geo.horiz);
					const row = Math.round(((y - oy) - ((col & 1) ? geo.vert / 2 : 0)) / geo.vert);
					return { col, row };
				} else if (config.gridType === 'hex-vertical') {
					const row = Math.round((y - oy) / geo.vert);
					const col = Math.round(((x - ox) - ((row & 1) ? geo.horiz / 2 : 0)) / geo.horiz);
					return { col, row };
				} else if (config.gridType === 'square') {
					const sizeW = config.gridSizeW || config.gridSize;
					const sizeH = config.gridSizeH || config.gridSize;
					const col = Math.floor((x - ox) / sizeW);
					const row = Math.floor((y - oy) / sizeH);
					return { col, row };
				}
				return { col: 0, row: 0 };
			};

			// Function to redraw grid overlays (single fixed grid)
			// Reuses the existing canvas element to avoid DOM churn.
			const redrawGridOverlays = () => {
				if (config.gridType && config.gridType !== 'none' && config.gridSize) {
					gridCanvas = plugin.drawGridOverlay(mapWrapper, img, config, config.gridOffsetX || 0, config.gridOffsetY || 0, gridCanvas);
				} else if (gridCanvas) {
					gridCanvas.remove();
					gridCanvas = null;
				}
			};

			// Function to redraw the terrain/climate background canvas
			const redrawTerrainLayer = () => {
				if (!terrainCanvas) return;
				const tctx = terrainCanvas.getContext('2d');
				if (!tctx) return;
				tctx.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height);

				// Draw terrain hexes
				if (config.hexTerrains && config.hexTerrains.length > 0 && config.gridSize) {
					const geo = getHexGeometry();
					config.hexTerrains.forEach((ht: HexTerrain) => {
						const def = TERRAIN_DEFINITIONS.find(d => d.id === ht.terrain);
						if (!def) return;
						const center = hexToPixel(ht.col, ht.row);
						const hexRadius = Math.min(geo.sizeX, geo.sizeY);
						if (config.gridType === 'hex-horizontal') {
							drawTerrainHex(tctx, center.x, center.y, hexRadius, def, 'hex-horizontal');
						} else if (config.gridType === 'hex-vertical') {
							drawTerrainHex(tctx, center.x, center.y, hexRadius, def, 'hex-vertical');
						}
					});
				}

				// Draw climate zone borders
				if (config.hexClimates && config.hexClimates.length > 0 && config.gridSize) {
					const geo = getHexGeometry();
					config.hexClimates.forEach((hc: any) => {
						const cdef = CLIMATE_DEFINITIONS.find(d => d.id === hc.climate);
						if (!cdef) return;
						const center = hexToPixel(hc.col, hc.row);
						const hexRadius = Math.min(geo.sizeX, geo.sizeY);
						if (config.gridType === 'hex-horizontal') {
							drawClimateHexBorder(tctx, center.x, center.y, hexRadius, cdef, 'hex-horizontal');
						} else if (config.gridType === 'hex-vertical') {
							drawClimateHexBorder(tctx, center.x, center.y, hexRadius, cdef, 'hex-vertical');
						}
					});
				}
			};

			// Helper function to get elevation color (height-map coloring)
			const getElevationColor = (elevation: number, alpha: number = 0.35): string => {
				if (elevation < 0) {
					// Underwater/underground: blue shades (deeper = darker)
					const depth = Math.min(Math.abs(elevation), 100);
					const t = depth / 100;
					const r = Math.round(0 + (1 - t) * 100);
					const g = Math.round(80 + (1 - t) * 100);
					const b = Math.round(139 + (1 - t) * 116);
					return `rgba(${r}, ${g}, ${b}, ${alpha})`;
				} else {
					// Above ground: green → yellow → orange → red
					const height = Math.min(elevation, 120);
					if (height <= 20) {
						// Green range
						const t = height / 20;
						return `rgba(${Math.round(100 + t * 100)}, ${Math.round(200 - t * 0)}, ${Math.round(100 - t * 50)}, ${alpha})`;
					} else if (height <= 50) {
						// Yellow → orange
						const t = (height - 20) / 30;
						return `rgba(${Math.round(200 + t * 30)}, ${Math.round(200 - t * 50)}, ${Math.round(50 - t * 20)}, ${alpha})`;
					} else {
						// Orange → red → dark red
						const t = (height - 50) / 70;
						return `rgba(${Math.round(230 - t * 91)}, ${Math.round(150 - t * 150)}, ${Math.round(30 - t * 30)}, ${alpha})`;
					}
				}
			};

			// ══════════════════════════════════════════════════════════════
			// ENV ASSET helpers (hit-testing, transform handles)
			// ══════════════════════════════════════════════════════════════

			/** Find the topmost env-asset instance whose bounding box contains the point. */
			const findEnvAssetAtPoint = (px: number, py: number): EnvAssetInstance | null => {
				if (!config.envAssets || config.envAssets.length === 0) return null;
				// Iterate reverse (top-most first by zIndex sorting rendered last)
				const sorted = [...config.envAssets].sort((a: EnvAssetInstance, b: EnvAssetInstance) => (b.zIndex || 0) - (a.zIndex || 0));
				for (const inst of sorted) {
					if (isPointInEnvAsset(px, py, inst)) return inst;
				}
				return null;
			};

			/** OBB point-in-rectangle test accounting for rotation. */
			const isPointInEnvAsset = (px: number, py: number, inst: EnvAssetInstance): boolean => {
				// Transform point into local (unrotated) space
				const dx = px - inst.position.x;
				const dy = py - inst.position.y;
				const rad = -(inst.rotation || 0) * Math.PI / 180;
				const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
				const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
				const hw = inst.width / 2;
				const hh = inst.height / 2;
				return lx >= -hw && lx <= hw && ly >= -hh && ly <= hh;
			};

			/** Determine which transform handle (if any) is at the given map-space point. */
			const hitTestTransformHandle = (px: number, py: number, inst: EnvAssetInstance): TransformHandle | null => {
				const dx = px - inst.position.x;
				const dy = py - inst.position.y;
				const rad = -(inst.rotation || 0) * Math.PI / 180;
				const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
				const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
				const hw = inst.width / 2;
				const hh = inst.height / 2;
				const hs = TRANSFORM_HANDLE_SIZE + 4; // tolerance

				// Rotation handle
				const rotY = -hh - ROTATION_HANDLE_OFFSET;
				if (Math.abs(lx) < hs && Math.abs(ly - rotY) < hs) return 'rotate';

				// Pivot handle (for non-sliding doors)
				const def = inst.assetId ? plugin.envAssetLibrary.getAsset(inst.assetId) : null;
				if (def?.category === 'door' && inst.doorConfig && inst.doorConfig.behaviour !== 'sliding') {
					const pivot = inst.doorConfig.customPivot || { x: 0, y: 0.5 };
					const pvX = (pivot.x - 0.5) * inst.width;
					const pvY = (pivot.y - 0.5) * inst.height;
					const pvTol = PIVOT_HANDLE_SIZE / 2 + 4;
					if (Math.abs(lx - pvX) < pvTol && Math.abs(ly - pvY) < pvTol) return 'pivot';
				}

				// Corner & edge handles
				const handles: { handle: TransformHandle; x: number; y: number }[] = [
					{ handle: 'top-left',    x: -hw, y: -hh },
					{ handle: 'top',         x: 0,   y: -hh },
					{ handle: 'top-right',   x: hw,  y: -hh },
					{ handle: 'right',       x: hw,  y: 0 },
					{ handle: 'bottom-right', x: hw,  y: hh },
					{ handle: 'bottom',       x: 0,   y: hh },
					{ handle: 'bottom-left',  x: -hw, y: hh },
					{ handle: 'left',         x: -hw, y: 0 },
				];
				for (const { handle, x, y } of handles) {
					if (Math.abs(lx - x) < hs && Math.abs(ly - y) < hs) return handle;
				}
				return null;
			};

			// Function to redraw annotations
			const redrawAnnotations = () => {
				if (!annotationCanvas) return;
				const ctx = annotationCanvas.getContext('2d');
				if (!ctx) return;
				
				// Ensure flicker animation runs when needed
				updateFlickerAnimation();
				
				ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

				// ── Viewport culling: compute visible rect in canvas coords ──
				// Elements entirely outside this rect are skipped to avoid
				// wasted canvas draw calls when the user is zoomed in.
				const _cullPad = 120; // px padding to avoid edge-pop artifacts
				const _srX = img.naturalWidth / (img.width || 1);
				const _srY = img.naturalHeight / (img.height || 1);
				const _viewL = (-translateX / scale) * _srX - _cullPad;
				const _viewT = (-translateY / scale) * _srY - _cullPad;
				const _viewR = _viewL + (viewport.clientWidth / scale) * _srX + _cullPad * 2;
				const _viewB = _viewT + (viewport.clientHeight / scale) * _srY + _cullPad * 2;
				// Fast AABB test: is rectangle (x,y,w,h) inside the view?
				const _inViewRect = (x: number, y: number, w: number, h: number) =>
					x + w > _viewL && x < _viewR && y + h > _viewT && y < _viewB;
				// Fast circle-vs-AABB test
				const _inViewCircle = (cx: number, cy: number, r: number) =>
					cx + r > _viewL && cx - r < _viewR && cy + r > _viewT && cy - r < _viewB;

				// Helper: determine opacity for a background element group based on active edit view
				const isOnBgLayer = config.activeLayer === 'Background';
				const bgViewDimAlpha = 0.12;
				const bgViewAlpha = (group: BackgroundEditView): number => {
					if (!isOnBgLayer) return 1; // non-bg layer: always full (or handled per-section)
					if (backgroundEditView === 'all') return 1;
					return backgroundEditView === group ? 1 : bgViewDimAlpha;
				};

				// ── Helper: compute door-wall segments for env-asset doors ──
				// Returns a single wall segment per door, spanning the width of the
				// door asset with a small inset, transformed by position, rotation,
				// and the door's open state (pivot / slide).
				const computeDoorWallSegments = (): { id: string; type: string; start: { x: number; y: number }; end: { x: number; y: number }; open: boolean; linkedDoorId: string }[] => {
					const result: { id: string; type: string; start: { x: number; y: number }; end: { x: number; y: number }; open: boolean; linkedDoorId: string }[] = [];
					if (!config.envAssets || config.envAssets.length === 0) return result;
					for (const inst of config.envAssets as EnvAssetInstance[]) {
						const def = plugin.envAssetLibrary.getAsset(inst.assetId);
						if (!def || def.category !== 'door') continue;
						const dc = inst.doorConfig;

						// Open sliding doors don't block – the doorway is clear
						if (dc && dc.isOpen && dc.behaviour === 'sliding') continue;

						const pad = 2; // inset padding in pixels
						// Span the largest dimension of the door asset
						const useWidth = inst.width >= inst.height;
						const halfSpan = (useWidth ? inst.width : inst.height) / 2 - pad;

						// Wall endpoints in local space along the longest axis
						let p1x = useWidth ? -halfSpan : 0, p1y = useWidth ? 0 : -halfSpan;
						let p2x = useWidth ?  halfSpan : 0, p2y = useWidth ? 0 :  halfSpan;

						// Apply door open transform (pivot rotation or slide offset)
						if (dc && dc.isOpen) {
							if (dc.behaviour !== 'sliding' && dc.openAngle) {
								const pivot = dc.customPivot || { x: 0, y: 0.5 };
								const pvX = (pivot.x - 0.5) * inst.width;
								const pvY = (pivot.y - 0.5) * inst.height;
								const a = (dc.openAngle || 0) * Math.PI / 180;
								const cosA = Math.cos(a), sinA = Math.sin(a);
								// Rotate p1 around pivot
								let rx = p1x - pvX, ry = p1y - pvY;
								p1x = pvX + rx * cosA - ry * sinA;
								p1y = pvY + rx * sinA + ry * cosA;
								// Rotate p2 around pivot
								rx = p2x - pvX; ry = p2y - pvY;
								p2x = pvX + rx * cosA - ry * sinA;
								p2y = pvY + rx * sinA + ry * cosA;
							}
							if (dc.behaviour === 'sliding' && dc.slidePosition && dc.slidePath && dc.slidePath.length >= 2) {
								const sp0 = dc.slidePath[0]!;
								const sp1 = dc.slidePath[dc.slidePath.length - 1]!;
								const t = dc.slidePosition;
								const sdx = (sp1.x - sp0.x) * t;
								const sdy = (sp1.y - sp0.y) * t;
								p1x += sdx; p1y += sdy;
								p2x += sdx; p2y += sdy;
							}
						}

						// Apply instance rotation + position to get world coordinates
						const rad = (inst.rotation || 0) * Math.PI / 180;
						const cosR = Math.cos(rad), sinR = Math.sin(rad);
						const worldP1 = {
							x: inst.position.x + p1x * cosR - p1y * sinR,
							y: inst.position.y + p1x * sinR + p1y * cosR,
						};
						const worldP2 = {
							x: inst.position.x + p2x * cosR - p2y * sinR,
							y: inst.position.y + p2x * sinR + p2y * cosR,
						};
						result.push({
							id: `door_wall_${inst.id}`,
							type: 'wall',
							start: worldP1,
							end: worldP2,
							open: !!(dc && dc.isOpen),
							linkedDoorId: inst.id,
						});
					}
					return result;
				};

				// Draw tile elevations (Background layer visualization)
				if (config.tileElevations && Object.keys(config.tileElevations).length > 0) {
					const gs = config.gridSize || 70;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					const isBackgroundLayer = config.activeLayer === 'Background';
					
					ctx.save();
					if (!isBackgroundLayer) {
						ctx.globalAlpha = 0.15; // Very subtle on other layers
					} else {
						ctx.globalAlpha = bgViewAlpha('elevation');
					}
					
					for (const [key, elevation] of Object.entries(config.tileElevations)) {
						const parts = key.split(',');
						const col = parseInt(parts[0] ?? '0');
						const row = parseInt(parts[1] ?? '0');
						const cellX = col * gs + ox;
						const cellY = row * gs + oy;
						if (!_inViewRect(cellX, cellY, gs, gs)) continue;
						const elev = elevation as number;
						
						// Fill tile with elevation color
						ctx.fillStyle = getElevationColor(elev);
						ctx.fillRect(cellX, cellY, gs, gs);
						
						// Draw border
						ctx.strokeStyle = getElevationColor(elev, 0.5);
						ctx.lineWidth = 1.5;
						ctx.strokeRect(cellX + 0.5, cellY + 0.5, gs - 1, gs - 1);
						
						// Draw elevation label at top-right (only on Background layer)
						if (isBackgroundLayer) {
							const label = elev > 0 ? `+${elev}` : `${elev}`;
							ctx.font = 'bold 10px sans-serif';
							ctx.textAlign = 'right';
							ctx.textBaseline = 'top';
							ctx.fillStyle = getElevationColor(elev, 1.0);
							ctx.fillText(label, cellX + gs - 3, cellY + 2);
						}
					}
					
					ctx.restore();
				}

				// Draw difficult terrain tiles
				if (config.difficultTerrain && Object.keys(config.difficultTerrain).length > 0) {
					const gs = config.gridSize || 70;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					const isBackgroundLayer = config.activeLayer === 'Background';
					
					ctx.save();
					if (!isBackgroundLayer) {
						ctx.globalAlpha = 0.15; // Very subtle on other layers
					} else {
						ctx.globalAlpha = bgViewAlpha('difficult-terrain');
					}
					
					for (const key of Object.keys(config.difficultTerrain)) {
						const parts = key.split(',');
						const col = parseInt(parts[0] ?? '0');
						const row = parseInt(parts[1] ?? '0');
						const cellX = col * gs + ox;
						const cellY = row * gs + oy;
						if (!_inViewRect(cellX, cellY, gs, gs)) continue;
						
						// Fill tile with semi-transparent brown/tan hatching pattern
						ctx.fillStyle = 'rgba(139, 90, 43, 0.25)';
						ctx.fillRect(cellX, cellY, gs, gs);
						
						// Draw diagonal hatching lines for visual texture
						ctx.strokeStyle = 'rgba(139, 90, 43, 0.4)';
						ctx.lineWidth = 1;
						const step = gs / 4;
						ctx.beginPath();
						for (let d = -gs; d <= gs; d += step) {
							ctx.moveTo(cellX + Math.max(0, d), cellY + Math.max(0, -d));
							ctx.lineTo(cellX + Math.min(gs, d + gs), cellY + Math.min(gs, gs - d));
						}
						ctx.stroke();
						
						// Draw border
						ctx.strokeStyle = 'rgba(139, 90, 43, 0.5)';
						ctx.lineWidth = 1.5;
						ctx.strokeRect(cellX + 0.5, cellY + 0.5, gs - 1, gs - 1);
						
						// Draw label (only on Background layer)
						if (isBackgroundLayer) {
							ctx.font = 'bold 9px sans-serif';
							ctx.textAlign = 'left';
							ctx.textBaseline = 'bottom';
							ctx.fillStyle = 'rgba(139, 90, 43, 0.9)';
							ctx.fillText('DT', cellX + 3, cellY + gs - 2);
						}
					}
					
					ctx.restore();
				}

				// Draw highlights
				if (config.highlights) {
					config.highlights.forEach((highlight: any) => {
						drawHighlight(ctx, highlight);
					});
				}

				// Draw PoI icons
				if (config.poiReferences) {
					config.poiReferences.forEach((poiRef: any) => {
						drawPoiIcon(ctx, poiRef);
					});
				}

				// Draw AoE effects
				if (config.aoeEffects) {
					config.aoeEffects.forEach((aoe: any) => {
						drawAoeEffect(ctx, aoe);
					});
				}
				
				// Draw light glow around markers that have lights attached
				if (config.markers) {
					const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
					config.markers.forEach((marker: any, mIdx: number) => {
						if (marker.light && marker.light.bright !== undefined) {
							const baseBrightPx = marker.light.bright * pixelsPerFoot;
							const baseDimPx = marker.light.dim * pixelsPerFoot;
							// Viewport cull: skip light glow entirely outside view
							const _maxLightR = (baseBrightPx + baseDimPx) * 1.15; // flicker margin
							if (!_inViewCircle(marker.position.x, marker.position.y, _maxLightR)) return;
							
							// Compute flicker/buzz for marker lights
							const flickerKey = `marker_${marker.id || mIdx}`;
							const isBuzz = BUZZ_LIGHT_TYPES.has(marker.light.type);
							const shouldFlicker = FLICKER_LIGHT_TYPES.has(marker.light.type);
							const flickerTime = performance.now() / 1000;
							const flicker = shouldFlicker
								? (isBuzz
									? computeBuzz(getFlickerSeed(flickerKey), flickerTime)
									: computeFlicker(getFlickerSeed(flickerKey), flickerTime, 'high'))
								: { radius: 1, alpha: 1 };
							
							const brightRadiusPx = baseBrightPx * flicker.radius;
							const dimRadiusPx = baseDimPx * flicker.radius;
							const totalRadiusPx = brightRadiusPx + dimRadiusPx;
							
							// Resolve light colour
							const mlc = hexToRgb(marker.light.customColor || getDefaultLightColor(marker.light.type));
							const mlcDim = { r: Math.floor(mlc.r * 0.7), g: Math.floor(mlc.g * 0.7), b: Math.floor(mlc.b * 0.7) };
							
							// Draw light glow behind marker with smooth gradient
							if (totalRadiusPx > 0) {
								ctx.globalAlpha = flicker.alpha;
								const grad = ctx.createRadialGradient(
									marker.position.x, marker.position.y, 0,
									marker.position.x, marker.position.y, totalRadiusPx
								);
								if (brightRadiusPx > 0 && dimRadiusPx > 0) {
									const bRatio = brightRadiusPx / totalRadiusPx;
									grad.addColorStop(0, `rgba(${mlc.r}, ${mlc.g}, ${mlc.b}, 0.25)`);
									grad.addColorStop(bRatio * 0.75, `rgba(${mlc.r}, ${mlc.g}, ${mlc.b}, 0.18)`);
									grad.addColorStop(bRatio, `rgba(${mlcDim.r}, ${mlcDim.g}, ${mlcDim.b}, 0.10)`);
									grad.addColorStop(Math.min(bRatio + (1 - bRatio) * 0.5, 0.95), `rgba(${mlcDim.r}, ${mlcDim.g}, ${mlcDim.b}, 0.04)`);
									grad.addColorStop(1, `rgba(${mlcDim.r}, ${mlcDim.g}, ${mlcDim.b}, 0)`);
								} else if (brightRadiusPx > 0) {
									grad.addColorStop(0, `rgba(${mlc.r}, ${mlc.g}, ${mlc.b}, 0.25)`);
									grad.addColorStop(0.7, `rgba(${mlc.r}, ${mlc.g}, ${mlc.b}, 0.12)`);
									grad.addColorStop(1, `rgba(${mlc.r}, ${mlc.g}, ${mlc.b}, 0)`);
								} else {
									grad.addColorStop(0, `rgba(${mlc.r}, ${mlc.g}, ${mlc.b}, 0.22)`);
									grad.addColorStop(0.5, `rgba(${mlcDim.r}, ${mlcDim.g}, ${mlcDim.b}, 0.10)`);
									grad.addColorStop(1, `rgba(${mlcDim.r}, ${mlcDim.g}, ${mlcDim.b}, 0)`);
								}
								ctx.fillStyle = grad;
								ctx.beginPath();
								ctx.arc(marker.position.x, marker.position.y, totalRadiusPx, 0, Math.PI * 2);
								ctx.fill();
								ctx.globalAlpha = 1.0;
							}
						}
					});
				}
				
				// Draw tunnel entrances and exits (below markers so tokens aren't covered)
				if (config.tunnels && config.tunnels.length > 0) {
					const CREATURE_SIZE_SQUARES: Record<string, number> = {
						'tiny': 0.5, 'small': 1, 'medium': 1, 'large': 2, 'huge': 3, 'gargantuan': 4
					};
					
					config.tunnels.forEach((tunnel: any) => {
						if (!tunnel.visible) return;
						
						const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize] || 1;
						const radius = (squares * config.gridSize) / 2.5;
						
						// Viewport cull: skip tunnel if both entrance & exit are off-screen
						const entrance = tunnel.entrancePosition;
						const _tunExit = tunnel.path && tunnel.path.length > 1 ? tunnel.path[tunnel.path.length - 1] : entrance;
						if (!_inViewCircle(entrance.x, entrance.y, radius) && !_inViewCircle(_tunExit.x, _tunExit.y, radius)) return;

						// Draw entrance
						ctx.save();
						ctx.globalAlpha = 0.7;
						
						// Draw dark circle for tunnel entrance
						ctx.fillStyle = '#1a1a1a';
						ctx.beginPath();
						ctx.arc(entrance.x, entrance.y, radius, 0, Math.PI * 2);
						ctx.fill();
						
						// Draw rocky border
						ctx.strokeStyle = '#654321';
						ctx.lineWidth = Math.max(3, radius * 0.15);
						ctx.stroke();
						
						// Add inner shadow effect
						const gradient = ctx.createRadialGradient(entrance.x, entrance.y, radius * 0.3, entrance.x, entrance.y, radius);
						gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
						gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
						ctx.fillStyle = gradient;
						ctx.fill();
						
						// Add tunnel entrance icon
						ctx.globalAlpha = 0.8;
						ctx.fillStyle = '#8B4513';
						ctx.font = `${Math.max(12, radius * 0.8)}px sans-serif`;
						ctx.textAlign = 'center';
						ctx.textBaseline = 'middle';
						ctx.fillText('🕳️', entrance.x, entrance.y);
						
						ctx.restore();
						
						// Draw exit if tunnel is inactive (completed) and has a different exit position
						if (!tunnel.active && tunnel.path && tunnel.path.length > 1) {
							const exit = tunnel.path[tunnel.path.length - 1];
							// Only draw exit if it's different from entrance
							if (Math.abs(exit.x - entrance.x) > 5 || Math.abs(exit.y - entrance.y) > 5) {
								ctx.save();
								ctx.globalAlpha = 0.7;
								
								// Draw dark circle for tunnel exit
								ctx.fillStyle = '#1a1a1a';
								ctx.beginPath();
								ctx.arc(exit.x, exit.y, radius, 0, Math.PI * 2);
								ctx.fill();
								
								// Draw rocky border
								ctx.strokeStyle = '#654321';
								ctx.lineWidth = Math.max(3, radius * 0.15);
								ctx.stroke();
								
								// Add inner shadow effect
								const exitGradient = ctx.createRadialGradient(exit.x, exit.y, radius * 0.3, exit.x, exit.y, radius);
								exitGradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
								exitGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
								ctx.fillStyle = exitGradient;
								ctx.fill();
								
								// Add tunnel exit icon
								ctx.globalAlpha = 0.8;
								ctx.fillStyle = '#8B4513';
								ctx.font = `${Math.max(12, radius * 0.8)}px sans-serif`;
								ctx.textAlign = 'center';
								ctx.textBaseline = 'middle';
								ctx.fillText('🕳️', exit.x, exit.y);
								
								ctx.restore();
							}
						}
					});
				}
				
				// Draw token auras (behind markers)

				// ══════════════════════════════════════════════════════════════
				// ENVIRONMENT ASSETS (Background layer objects)
				// ══════════════════════════════════════════════════════════════
				if (config.envAssets && config.envAssets.length > 0) {
					const envAlpha = bgViewAlpha('env-assets');
					// Sort by zIndex ascending (lower = drawn first = further back)
					const sorted = [...config.envAssets].sort((a: EnvAssetInstance, b: EnvAssetInstance) => (a.zIndex || 0) - (b.zIndex || 0));
					sorted.forEach((inst: EnvAssetInstance) => {
						// Viewport cull: use half-diagonal as conservative radius for rotated assets
						const _envR = (inst.width + inst.height) / 2;
						if (!_inViewCircle(inst.position.x, inst.position.y, _envR)) return;
						const def = plugin.envAssetLibrary.getAsset(inst.assetId);
						if (!def) return;
						const img = getEnvAssetImage(def.imageFile);

						ctx.save();
						ctx.globalAlpha = envAlpha;
						ctx.translate(inst.position.x, inst.position.y);
						ctx.rotate((inst.rotation || 0) * Math.PI / 180);

						const hw = inst.width / 2;
						const hh = inst.height / 2;

						// For doors: ensure doorConfig exists and apply open-angle or slide offset
						if (def.category === 'door') {
							if (!inst.doorConfig) {
								inst.doorConfig = { behaviour: 'pivot', customPivot: { x: 0, y: 0.5 } };
							}
							const dc = inst.doorConfig;
							// Runtime migration: convert legacy normal/custom-pivot to unified pivot
							if (dc.behaviour === 'normal' || dc.behaviour === 'custom-pivot') {
								if (dc.behaviour === 'normal' && !dc.customPivot) {
									dc.customPivot = (dc as any).pivotEdge === 'right' ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
								}
								dc.behaviour = 'pivot';
							}
							if (dc.behaviour !== 'sliding' && !dc.customPivot) {
								dc.customPivot = { x: 0, y: 0.5 };
							}
							if (dc.isOpen && dc.behaviour !== 'sliding' && dc.openAngle) {
								// Resolve pivot point from customPivot
								const pivotX = (dc.customPivot!.x - 0.5) * inst.width;
								const pivotY = (dc.customPivot!.y - 0.5) * inst.height;
								ctx.translate(pivotX, pivotY);
								ctx.rotate((dc.openAngle || 0) * Math.PI / 180);
								ctx.translate(-pivotX, -pivotY);
							}
							if (dc.isOpen && dc.behaviour === 'sliding' && dc.slidePosition && dc.slidePath && dc.slidePath.length >= 2) {
								// Slide offset along the path (linear interpolation between first two waypoints)
								const p0 = dc.slidePath[0]!;
								const p1 = dc.slidePath[dc.slidePath.length - 1]!;
								const t = dc.slidePosition;
								ctx.translate((p1.x - p0.x) * t, (p1.y - p0.y) * t);
							}
						}

						// Draw the image (or placeholder)
						if (img) {
							ctx.drawImage(img, -hw, -hh, inst.width, inst.height);
						} else {
							// Placeholder while loading
							ctx.fillStyle = 'rgba(100,100,100,0.3)';
							ctx.fillRect(-hw, -hh, inst.width, inst.height);
							ctx.strokeStyle = '#888';
							ctx.lineWidth = 1;
							ctx.setLineDash([4, 4]);
							ctx.strokeRect(-hw, -hh, inst.width, inst.height);
							ctx.setLineDash([]);
						}

						// Lock indicator
						if (inst.locked) {
							ctx.fillStyle = 'rgba(0,0,0,0.5)';
							ctx.font = '16px sans-serif';
							ctx.textAlign = 'center';
							ctx.textBaseline = 'middle';
							ctx.fillText('🔒', 0, 0);
						}

						ctx.restore();

						// ── Env-asset view highlight outline ──────────
						if (backgroundEditView === 'env-assets') {
							ctx.save();
							ctx.globalAlpha = 1;
							ctx.translate(inst.position.x, inst.position.y);
							ctx.rotate((inst.rotation || 0) * Math.PI / 180);
							const hlHw = inst.width / 2;
							const hlHh = inst.height / 2;
							const pad = 3; // padding outside the asset rect
							// Glow
							ctx.shadowColor = '#00ccff';
							ctx.shadowBlur = 10;
							ctx.strokeStyle = 'rgba(0,204,255,0.7)';
							ctx.lineWidth = 2;
							ctx.strokeRect(-hlHw - pad, -hlHh - pad, inst.width + pad * 2, inst.height + pad * 2);
							ctx.shadowBlur = 0;
							ctx.restore();
						}

						// ── Selection frame & transform handles ──────────
						if (selectedEnvAssetInstanceId === inst.id && (activeTool === 'env-asset' || activeTool === 'select') && envAlpha >= 1) {
							ctx.save();
							ctx.globalAlpha = 1;
							ctx.translate(inst.position.x, inst.position.y);
							ctx.rotate((inst.rotation || 0) * Math.PI / 180);

							const hw2 = inst.width / 2;
							const hh2 = inst.height / 2;

							// Dashed selection frame
							ctx.strokeStyle = '#00aaff';
							ctx.lineWidth = 2;
							ctx.setLineDash([6, 4]);
							ctx.strokeRect(-hw2, -hh2, inst.width, inst.height);
							ctx.setLineDash([]);

							// Resize handles (corners + edges)
							const hs = TRANSFORM_HANDLE_SIZE;
							const handles: { handle: TransformHandle; x: number; y: number }[] = [
								{ handle: 'top-left',     x: -hw2,  y: -hh2 },
								{ handle: 'top',          x: 0,     y: -hh2 },
								{ handle: 'top-right',    x: hw2,   y: -hh2 },
								{ handle: 'right',        x: hw2,   y: 0 },
								{ handle: 'bottom-right',  x: hw2,   y: hh2 },
								{ handle: 'bottom',        x: 0,     y: hh2 },
								{ handle: 'bottom-left',   x: -hw2,  y: hh2 },
								{ handle: 'left',          x: -hw2,  y: 0 },
							];
							handles.forEach(({ x, y }) => {
								ctx.fillStyle = '#ffffff';
								ctx.strokeStyle = '#00aaff';
								ctx.lineWidth = 2;
								ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
								ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
							});

							// Rotation handle (circle above the frame)
							const rotY = -hh2 - ROTATION_HANDLE_OFFSET;
							// Line from top-center to rotation handle
							ctx.strokeStyle = '#00aaff';
							ctx.lineWidth = 1;
							ctx.beginPath();
							ctx.moveTo(0, -hh2);
							ctx.lineTo(0, rotY);
							ctx.stroke();
							// Circle handle
							ctx.beginPath();
							ctx.arc(0, rotY, hs / 2 + 2, 0, Math.PI * 2);
							ctx.fillStyle = '#ffffff';
							ctx.fill();
							ctx.strokeStyle = '#00aaff';
							ctx.lineWidth = 2;
							ctx.stroke();
							// Rotation icon
							ctx.fillStyle = '#00aaff';
							ctx.font = 'bold 10px sans-serif';
							ctx.textAlign = 'center';
							ctx.textBaseline = 'middle';
							ctx.fillText('↻', 0, rotY);

							// ── Pivot handle (yellow dot for non-sliding doors) ──
							if (def.category === 'door' && inst.doorConfig && inst.doorConfig.behaviour !== 'sliding') {
								const pivot = inst.doorConfig.customPivot || { x: 0, y: 0.5 };
								const pvX = (pivot.x - 0.5) * inst.width;
								const pvY = (pivot.y - 0.5) * inst.height;
								const pvR = PIVOT_HANDLE_SIZE / 2;
								// Yellow filled circle with dark outline
								ctx.beginPath();
								ctx.arc(pvX, pvY, pvR, 0, Math.PI * 2);
								ctx.fillStyle = '#ffcc00';
								ctx.fill();
								ctx.strokeStyle = '#886600';
								ctx.lineWidth = 2;
								ctx.stroke();
								// Small cross-hair inside
								ctx.strokeStyle = '#886600';
								ctx.lineWidth = 1;
								ctx.beginPath();
								ctx.moveTo(pvX - pvR * 0.5, pvY);
								ctx.lineTo(pvX + pvR * 0.5, pvY);
								ctx.moveTo(pvX, pvY - pvR * 0.5);
								ctx.lineTo(pvX, pvY + pvR * 0.5);
								ctx.stroke();
							}

							ctx.restore();
						}
					});
				}
				// ══════════════════════════════════════════════════════════════

				if (config.markers) {
					const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
					config.markers.forEach((marker: any) => {
						if (marker.auras && marker.auras.length > 0) {
							marker.auras.forEach((aura: any) => {
								const radiusPx = (aura.radius || 0) * pixelsPerFoot;
								if (radiusPx > 0 && _inViewCircle(marker.position.x, marker.position.y, radiusPx)) {
									ctx.globalAlpha = aura.opacity || 0.25;
									ctx.fillStyle = aura.color || '#ffcc00';
									ctx.beginPath();
									ctx.arc(marker.position.x, marker.position.y, radiusPx, 0, Math.PI * 2);
									ctx.fill();
									// Draw aura border
									ctx.globalAlpha = Math.min((aura.opacity || 0.25) + 0.3, 0.8);
									ctx.strokeStyle = aura.color || '#ffcc00';
									ctx.lineWidth = 2;
									ctx.stroke();
									ctx.globalAlpha = 1.0;
								}
							});
						}
					});
				}
				
				// Draw markers
				if (config.markers) {
					const _CULL_SIZE_SQ: Record<string, number> = { 'tiny': 0.5, 'small': 1, 'medium': 1, 'large': 2, 'huge': 3, 'gargantuan': 4 };
					config.markers.forEach((marker: any) => {
						// Viewport cull: skip markers entirely outside the view
						const _mDef = marker.markerId ? plugin.markerLibrary.getMarker(marker.markerId) : null;
						const _mR = _mDef && _mDef.creatureSize ? ((_CULL_SIZE_SQ[_mDef.creatureSize] || 1) * (config.gridSize || 70)) / 2 : 30;
						if (!_inViewCircle(marker.position.x, marker.position.y, _mR)) return;
						drawMarker(ctx, marker);
					});
				}
				
				// Draw tunnel paths (GM view only - shows where burrowed creatures traveled)
				// Only visible on Subterranean layer to avoid visual clutter
				if (config.tunnels && config.tunnels.length > 0 && config.activeLayer === 'Subterranean') {
					const CREATURE_SIZE_SQUARES: Record<string, number> = {
						'tiny': 0.5, 'small': 1, 'medium': 1, 'large': 2, 'huge': 3, 'gargantuan': 4
					};
					
					config.tunnels.forEach((tunnel: any) => {
						if (!tunnel.path || tunnel.path.length < 2) return;
						
					// Use stored tunnel width, or calculate as (size + 0.5) * gridSize
					const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize] || 1;
					const tunnelWidth = tunnel.tunnelWidth || (squares + 0.5) * config.gridSize;
						ctx.strokeStyle = '#2a2a2a';
						ctx.lineWidth = tunnelWidth;
						ctx.lineCap = 'round';
						ctx.lineJoin = 'round';
						
						// Draw tunnel path as a thick line
						ctx.beginPath();
						ctx.moveTo(tunnel.path[0].x, tunnel.path[0].y);
						for (let i = 1; i < tunnel.path.length; i++) {
							ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
						}
						ctx.stroke();
						
						// Draw border for tunnel corridor
						ctx.globalAlpha = 0.7;
						ctx.strokeStyle = '#654321';
						ctx.lineWidth = tunnelWidth + 4;
						ctx.beginPath();
						ctx.moveTo(tunnel.path[0].x, tunnel.path[0].y);
						for (let i = 1; i < tunnel.path.length; i++) {
							ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
						}
						ctx.stroke();
						
						// Draw inner tunnel path (darker)
						ctx.globalAlpha = 0.8;
						ctx.strokeStyle = '#1a1a1a';
						ctx.lineWidth = tunnelWidth * 0.7;
						ctx.beginPath();
						ctx.moveTo(tunnel.path[0].x, tunnel.path[0].y);
						for (let i = 1; i < tunnel.path.length; i++) {
							ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
						}
						ctx.stroke();
						
						ctx.restore();
					});
				}
				
				// Draw drawings
				if (config.drawings) {
					config.drawings.forEach((drawing: any) => {
						drawDrawing(ctx, drawing);
					});
				}

				// Draw AoE preview (before sync so it doesn't show in player view until placed)
				if (activeTool === 'aoe' && aoeOrigin && aoePreviewEnd) {
					drawAoeShape(ctx, aoeOrigin, aoePreviewEnd, selectedAoeShape, selectedColor, true, !!pendingAoeAnchorMarkerId);
				}
				
				// NOTE: _syncPlayerView() is now only called when map data actually changes
				// (markers added/moved, fog updated, etc.), not on every redraw.
				// This prevents the infinite sync loop that was causing performance issues.

				// Draw Fog of War (GM view: semi-transparent)
				if (config.fogOfWar && config.fogOfWar.enabled) {
					const fogAlpha = bgViewAlpha('fog');
					if (fogAlpha < 1) ctx.globalAlpha = fogAlpha;
					drawFogOfWar(ctx, annotationCanvas.width, annotationCanvas.height, false);
					if (fogAlpha < 1) ctx.globalAlpha = 1;
				}
				// Draw fog preview during drag
				if (activeTool === 'fog') {
					if (fogDragStart && fogDragEnd) {
						drawFogPreview(ctx);
					}
					if (fogPolygonPoints.length > 0) {
						drawFogPolygonPreview(ctx);
					}
				}

				// Draw Dynamic Lighting Walls (only on Background layer)
				if (config.activeLayer === 'Background' && config.walls && config.walls.length > 0) {
					const wallAlpha = bgViewAlpha('walls');
					ctx.save();
					ctx.globalAlpha = wallAlpha;
					config.walls.forEach((wall: any) => {
						// Viewport cull: skip walls whose bounding box is entirely off-screen
						const _wMinX = Math.min(wall.start.x, wall.end.x);
						const _wMinY = Math.min(wall.start.y, wall.end.y);
						const _wW = Math.abs(wall.end.x - wall.start.x);
						const _wH = Math.abs(wall.end.y - wall.start.y);
						if (!_inViewRect(_wMinX, _wMinY, _wW, _wH)) return;

						const wallType = wall.type || 'wall';
						const wallDef = WALL_TYPES[wallType as WallType] || WALL_TYPES.wall;
						const isOpen = wall.open === true;
						
						ctx.strokeStyle = wallDef.color;
						ctx.lineWidth = 4;
						ctx.lineCap = 'round';
						
						// Set line dash based on style
						if (wallDef.style === 'dashed') {
							ctx.setLineDash([10, 6]);
						} else if (wallDef.style === 'dotted') {
							ctx.setLineDash([3, 6]);
						} else {
							ctx.setLineDash([]);
						}
						
						// Calculate wall segment properties
						const dx = wall.end.x - wall.start.x;
						const dy = wall.end.y - wall.start.y;
						const length = Math.sqrt(dx * dx + dy * dy);
						const angle = Math.atan2(dy, dx);
						const midX = (wall.start.x + wall.end.x) / 2;
						const midY = (wall.start.y + wall.end.y) / 2;
						const isDraggingThis = draggingWallIndex === config.walls.indexOf(wall);
						
						// Draw selection indicator if dragging
						if (isDraggingThis) {
							ctx.strokeStyle = '#00ff00';
							ctx.lineWidth = 2;
							ctx.setLineDash([4, 4]);
							const selPad = 12;
							ctx.strokeRect(
								Math.min(wall.start.x, wall.end.x) - selPad,
								Math.min(wall.start.y, wall.end.y) - selPad,
								Math.abs(dx) + selPad * 2,
								Math.abs(dy) + selPad * 2
							);
							ctx.setLineDash([]);
						}
						
						// Draw based on type
						if (wallDef.style === 'door') {
							// Roll20-style door: rectangular door frame with swing arc
							const doorWidth = Math.max(length, 20);
							const doorHeight = 8;
							
							ctx.save();
							ctx.translate(midX, midY);
							ctx.rotate(angle);
							
							if (isOpen) {
								// Open door: draw frame outline, door swung open
								// Frame (empty rectangle)
								ctx.strokeStyle = '#654321';
								ctx.lineWidth = 2;
								ctx.strokeRect(-doorWidth / 2, -doorHeight / 2, doorWidth, doorHeight);
								
								// Door panel swung open (perpendicular)
								ctx.fillStyle = '#8B6914';
								ctx.globalAlpha = 0.7;
								ctx.save();
								ctx.rotate(Math.PI / 2); // Rotate 90 degrees for open
								ctx.fillRect(-doorWidth / 2, -doorHeight / 2 - doorWidth / 2, doorWidth, doorHeight);
								ctx.strokeStyle = '#654321';
								ctx.strokeRect(-doorWidth / 2, -doorHeight / 2 - doorWidth / 2, doorWidth, doorHeight);
								ctx.restore();
								ctx.globalAlpha = 1.0;
								
								// Swing arc
								ctx.strokeStyle = '#888888';
								ctx.lineWidth = 1;
								ctx.setLineDash([4, 4]);
								ctx.beginPath();
								ctx.arc(-doorWidth / 2, 0, doorWidth, 0, -Math.PI / 2, true);
								ctx.stroke();
								ctx.setLineDash([]);
							} else {
								// Closed door: solid door panel in frame
								ctx.fillStyle = '#8B4513';
								ctx.fillRect(-doorWidth / 2, -doorHeight / 2, doorWidth, doorHeight);
								
								// Door frame
								ctx.strokeStyle = '#654321';
								ctx.lineWidth = 2;
								ctx.strokeRect(-doorWidth / 2, -doorHeight / 2, doorWidth, doorHeight);
								
								// Door handle
								ctx.fillStyle = '#FFD700';
								ctx.beginPath();
								ctx.arc(doorWidth / 2 - 6, 0, 3, 0, Math.PI * 2);
								ctx.fill();
								
								// Swing arc hint
								ctx.strokeStyle = '#888888';
								ctx.lineWidth = 1;
								ctx.setLineDash([4, 4]);
								ctx.globalAlpha = 0.4;
								ctx.beginPath();
								ctx.arc(-doorWidth / 2, 0, doorWidth, 0, -Math.PI / 2, true);
								ctx.stroke();
								ctx.setLineDash([]);
								ctx.globalAlpha = 1.0;
							}
							
							ctx.restore();
							
						} else if (wallDef.style === 'window') {
							// Roll20-style window: rectangular pane with cross-hatching
							const windowWidth = Math.max(length, 16);
							const windowHeight = 8;
							
							ctx.save();
							ctx.translate(midX, midY);
							ctx.rotate(angle);
							
							// Window frame (outer)
							ctx.fillStyle = '#4488aa';
							ctx.globalAlpha = 0.4;
							ctx.fillRect(-windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight);
							ctx.globalAlpha = 1.0;
							
							// Window frame border
							ctx.strokeStyle = '#336688';
							ctx.lineWidth = 2;
							ctx.strokeRect(-windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight);
							
							// Window panes (vertical dividers)
							ctx.strokeStyle = '#557799';
							ctx.lineWidth = 1;
							// Center divider
							ctx.beginPath();
							ctx.moveTo(0, -windowHeight / 2);
							ctx.lineTo(0, windowHeight / 2);
							ctx.stroke();
							
							// Cross pattern for glass effect
							ctx.strokeStyle = '#aaccdd';
							ctx.globalAlpha = 0.5;
							ctx.lineWidth = 0.5;
							const crossSize = 4;
							for (let cx = -windowWidth / 2 + crossSize; cx < windowWidth / 2; cx += crossSize * 2) {
								ctx.beginPath();
								ctx.moveTo(cx, -windowHeight / 2);
								ctx.lineTo(cx, windowHeight / 2);
								ctx.stroke();
							}
							ctx.globalAlpha = 1.0;
							
							ctx.restore();
							
						} else {
							// Standard wall/secret/invisible/terrain - just draw line
							ctx.beginPath();
							ctx.moveTo(wall.start.x, wall.start.y);
							ctx.lineTo(wall.end.x, wall.end.y);
							ctx.stroke();
						}
						
						// Show wall height label (DM view only) for walls with finite height
						if (wall.height !== undefined && wall.height !== null) {
							ctx.save();
							ctx.font = 'bold 9px sans-serif';
							ctx.textAlign = 'center';
							ctx.textBaseline = 'bottom';
							const heightLabel = `${wall.height}'`;
							// Draw with outline for readability
							ctx.strokeStyle = '#000000';
							ctx.lineWidth = 3;
							ctx.strokeText(heightLabel, midX, midY - 6);
							ctx.fillStyle = wallDef.color;
							ctx.fillText(heightLabel, midX, midY - 6);
							ctx.restore();
						}
						
						ctx.setLineDash([]);
					});
					ctx.restore();
				}

				// ── Draw door-wall segments from env-asset doors (visible in wall view) ──
				if (config.activeLayer === 'Background') {
					const doorWalls = computeDoorWallSegments();
					if (doorWalls.length > 0) {
						const wallAlpha = bgViewAlpha('walls');
						ctx.save();
						ctx.globalAlpha = wallAlpha;
						ctx.strokeStyle = '#ff4500'; // same red as regular wall
						ctx.lineWidth = 4;
						ctx.lineCap = 'round';
						ctx.setLineDash([]);
						for (const dw of doorWalls) {
							// Open doors: draw as dashed + semi-transparent
							if (dw.open) {
								ctx.save();
								ctx.globalAlpha = wallAlpha * 0.35;
								ctx.setLineDash([6, 4]);
								ctx.beginPath();
								ctx.moveTo(dw.start.x, dw.start.y);
								ctx.lineTo(dw.end.x, dw.end.y);
								ctx.stroke();
								ctx.restore();
							} else {
								ctx.beginPath();
								ctx.moveTo(dw.start.x, dw.start.y);
								ctx.lineTo(dw.end.x, dw.end.y);
								ctx.stroke();
							}
						}
						ctx.restore();
					}
				}

				// Draw selection rectangle overlay and highlight selected walls
				if (wallSelectionRect && activeTool === 'select') {
					const sr = wallSelectionRect;
					const srMinX = Math.min(sr.startX, sr.endX);
					const srMinY = Math.min(sr.startY, sr.endY);
					const srW = Math.abs(sr.endX - sr.startX);
					const srH = Math.abs(sr.endY - sr.startY);
					ctx.save();
					ctx.strokeStyle = '#4fc3f7';
					ctx.lineWidth = 2 / scale;
					ctx.setLineDash([6 / scale, 4 / scale]);
					ctx.strokeRect(srMinX, srMinY, srW, srH);
					ctx.fillStyle = 'rgba(79, 195, 247, 0.12)';
					ctx.fillRect(srMinX, srMinY, srW, srH);
					ctx.setLineDash([]);
					ctx.restore();
				}

				// Highlight selected walls (after rectangle selection completes)
				if (selectedWallIndices.length > 0 && config.walls) {
					ctx.save();
					selectedWallIndices.forEach(wi => {
						const sw = config.walls[wi];
						if (!sw) return;
						ctx.beginPath();
						ctx.moveTo(sw.start.x, sw.start.y);
						ctx.lineTo(sw.end.x, sw.end.y);
						ctx.strokeStyle = '#4fc3f7';
						ctx.lineWidth = 6;
						ctx.lineCap = 'round';
						ctx.stroke();
					});
					ctx.restore();
				}

				// Draw wall preview (chain drawing)
				if (activeTool === 'walls' && wallPoints.length > 0) {
					const previewWallDef = WALL_TYPES[selectedWallType];
					ctx.strokeStyle = previewWallDef.color;
					ctx.lineWidth = 4;
					ctx.lineCap = 'round';
					ctx.setLineDash([5, 5]);
					// Draw segments between points
					for (let i = 0; i < wallPoints.length - 1; i++) {
						ctx.beginPath();
						ctx.moveTo(wallPoints[i]!.x, wallPoints[i]!.y);
						ctx.lineTo(wallPoints[i + 1]!.x, wallPoints[i + 1]!.y);
						ctx.stroke();
					}
					// Draw preview line to cursor
					if (wallPreviewPos) {
						ctx.beginPath();
						ctx.moveTo(wallPoints[wallPoints.length - 1]!.x, wallPoints[wallPoints.length - 1]!.y);
						ctx.lineTo(wallPreviewPos.x, wallPreviewPos.y);
						ctx.stroke();
						// Draw snap indicator (bright ring when snapped to existing endpoint)
						if ((wallPreviewPos as any)._snapped) {
							ctx.save();
							ctx.strokeStyle = '#00ff88';
							ctx.lineWidth = 3;
							ctx.setLineDash([]);
							ctx.beginPath();
							ctx.arc(wallPreviewPos.x, wallPreviewPos.y, 8, 0, Math.PI * 2);
							ctx.stroke();
							ctx.restore();
						}
					}
					ctx.setLineDash([]);
					// Draw points
					ctx.fillStyle = previewWallDef.color;
					wallPoints.forEach((p: any) => {
						ctx.beginPath();
						ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
						ctx.fill();
					});
				}

				// Draw wall light preview (two-point line drawing)
				if (activeTool === 'walllight-draw' && wallLightPoints.length > 0) {
					ctx.save();
					ctx.strokeStyle = '#ffff88';
					ctx.lineWidth = 8;
					ctx.lineCap = 'round';
					ctx.setLineDash([10, 5]);
					ctx.globalAlpha = 0.6;
					ctx.beginPath();
					ctx.moveTo(wallLightPoints[0]!.x, wallLightPoints[0]!.y);
					if (wallLightPreviewPos) {
						ctx.lineTo(wallLightPreviewPos.x, wallLightPreviewPos.y);
					}
					ctx.stroke();
					ctx.setLineDash([]);
					// Draw start point marker
					ctx.globalAlpha = 0.9;
					ctx.fillStyle = '#ffff88';
					ctx.beginPath();
					ctx.arc(wallLightPoints[0]!.x, wallLightPoints[0]!.y, 6, 0, Math.PI * 2);
					ctx.fill();
					if (wallLightPreviewPos) {
						ctx.beginPath();
						ctx.arc(wallLightPreviewPos.x, wallLightPreviewPos.y, 6, 0, Math.PI * 2);
						ctx.fill();
					}
					ctx.restore();
				}

				// Draw Magic Wand selection overlay
				if (activeTool === 'magic-wand' && mwMask && mwMaskW > 0 && mwMaskH > 0) {
					// Draw a semi-transparent tint over the selected (flood-filled) region
					const overlayCanvas = _canvasPool.acquire(mwMaskW, mwMaskH);
					const oCtx = overlayCanvas.getContext('2d');
					if (oCtx) {
						const oData = oCtx.createImageData(mwMaskW, mwMaskH);
						for (let i = 0; i < mwMask.length; i++) {
							if (mwMask[i]) {
								oData.data[i * 4] = 0;       // R
								oData.data[i * 4 + 1] = 200; // G
								oData.data[i * 4 + 2] = 100; // B
								oData.data[i * 4 + 3] = 60;  // A — subtle tint
							}
						}
						oCtx.putImageData(oData, 0, 0);
						ctx.globalAlpha = 0.6;
						ctx.drawImage(overlayCanvas, 0, 0);
						ctx.globalAlpha = 1.0;
					}
					_canvasPool.release(overlayCanvas);
				}

				// Draw Eraser brush cursor
				if (activeTool === 'eraser' && eraserCursorPos) {
					const eraserRadius = 20;
					ctx.save();
					ctx.strokeStyle = isErasing ? 'rgba(255, 80, 80, 0.9)' : 'rgba(255, 255, 255, 0.7)';
					ctx.lineWidth = 2;
					ctx.setLineDash([4, 4]);
					ctx.beginPath();
					ctx.arc(eraserCursorPos.x, eraserCursorPos.y, eraserRadius, 0, Math.PI * 2);
					ctx.stroke();
					if (isErasing) {
						ctx.fillStyle = 'rgba(255, 80, 80, 0.15)';
						ctx.fill();
					}
					ctx.setLineDash([]);
					ctx.restore();
				}

				// ── Light Preview Overlay: show shadow-cast lighting when editing lights ──
				// Drawn BEFORE light source icons so icons remain visible on top.
				if (isOnBgLayer && backgroundEditView === 'lights' && annotationCanvas) {
					try {
						// Visibility cache keys include wall content, so no manual clear needed.
						drawLightPreviewOverlay(ctx, annotationCanvas.width, annotationCanvas.height);
					} catch (e) {
						// Fallback: simple semi-transparent dark overlay
						console.error('[DnD] Light preview overlay error:', e);
						ctx.save();
						ctx.globalAlpha = 0.7;
						ctx.fillStyle = '#000000';
						ctx.fillRect(0, 0, annotationCanvas.width, annotationCanvas.height);
						ctx.restore();
					}
				}

				// Draw Dynamic Lighting (only on Background layer)
				if (config.activeLayer === 'Background' && config.lightSources && config.lightSources.length > 0) {
					const lightAlpha = bgViewAlpha('lights');
					// Helper to scale any alpha value by the view dim factor
					const la = (a: number) => a * lightAlpha;
					// Calculate pixels per foot based on grid settings
					const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
					
					config.lightSources.forEach((light: any, idx: number) => {
						const isActive = light.active !== false; // Default to active
						const isDragging = draggingLightIndex === idx;
						
						// Convert feet to pixels
						const brightRadiusPx = light.bright * pixelsPerFoot;
						const dimRadiusPx = light.dim * pixelsPerFoot;
						// Viewport cull: skip lights entirely outside the view
						const _lR = (brightRadiusPx + dimRadiusPx) * 1.15;
						if (light.start && light.end) {
							// Wall light: use bounding box of the line + radius
							const _wlMinX = Math.min(light.start.x, light.end.x) - _lR;
							const _wlMinY = Math.min(light.start.y, light.end.y) - _lR;
							const _wlW = Math.abs(light.end.x - light.start.x) + _lR * 2;
							const _wlH = Math.abs(light.end.y - light.start.y) + _lR * 2;
							if (!_inViewRect(_wlMinX, _wlMinY, _wlW, _wlH)) return;
						} else {
							if (!_inViewCircle(light.x, light.y, _lR)) return;
						}
						
						// Only draw light radii if the light is active
						if (isActive) {
								// Compute flicker/buzz modulation
								const flickerKey = `standalone_${idx}`;
								const isBuzz = BUZZ_LIGHT_TYPES.has(light.type);
								const shouldFlicker = FLICKER_LIGHT_TYPES.has(light.type);
								const flickerTime = performance.now() / 1000;
								const flicker = shouldFlicker
									? (isBuzz
										? computeBuzz(getFlickerSeed(flickerKey), flickerTime)
										: computeFlicker(getFlickerSeed(flickerKey), flickerTime, 'high'))
									: { radius: 1, alpha: 1 };
								
								const flickBrightPx = brightRadiusPx * flicker.radius;
								const flickDimPx = dimRadiusPx * flicker.radius;
								const totalRadiusPx = flickBrightPx + flickDimPx;
								// Resolve light colour (custom for fluorescent/bioluminescent, warm yellow default)
								const lc = hexToRgb(light.customColor || getDefaultLightColor(light.type));
								const lcDim = { r: Math.floor(lc.r * 0.7), g: Math.floor(lc.g * 0.7), b: Math.floor(lc.b * 0.7) };

								// ── Wall Light (line source) ──
								if (light.start && light.end && light.type === 'walllight') {
									const dx = light.end.x - light.start.x;
									const dy = light.end.y - light.start.y;
									const length = Math.sqrt(dx * dx + dy * dy);
									const stepSize = Math.min(totalRadiusPx * 0.4, 20);
									const steps = Math.max(2, Math.ceil(length / stepSize));
									const stepAlpha = 1.0 / Math.sqrt(steps * 0.7);
									ctx.globalAlpha = la(flicker.alpha * Math.min(stepAlpha, 0.7));
									for (let s = 0; s <= steps; s++) {
										const t = s / steps;
										const px = light.start.x + dx * t;
										const py = light.start.y + dy * t;
										const grad = ctx.createRadialGradient(px, py, 0, px, py, totalRadiusPx);
										if (flickBrightPx > 0 && flickDimPx > 0) {
											const bRatio = flickBrightPx / totalRadiusPx;
											grad.addColorStop(0, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.18)`);
											grad.addColorStop(bRatio * 0.75, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.14)`);
											grad.addColorStop(bRatio, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0.09)`);
											grad.addColorStop(Math.min(bRatio + (1 - bRatio) * 0.5, 0.95), `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0.04)`);
											grad.addColorStop(1, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0)`);
										} else if (flickBrightPx > 0) {
											grad.addColorStop(0, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.18)`);
											grad.addColorStop(0.7, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.10)`);
											grad.addColorStop(1, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0)`);
										} else {
											grad.addColorStop(0, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.22)`);
											grad.addColorStop(0.5, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0.10)`);
											grad.addColorStop(1, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0)`);
										}
										ctx.fillStyle = grad;
										ctx.beginPath();
										ctx.arc(px, py, totalRadiusPx, 0, Math.PI * 2);
										ctx.fill();
									}
									// Draw the glowing strip line on top
									ctx.globalAlpha = la(0.7);
									ctx.strokeStyle = `rgb(${lc.r}, ${lc.g}, ${lc.b})`;
									ctx.lineWidth = 6;
									ctx.lineCap = 'round';
									ctx.shadowColor = `rgb(${lc.r}, ${lc.g}, ${lc.b})`;
									ctx.shadowBlur = 12;
									ctx.beginPath();
									ctx.moveTo(light.start.x, light.start.y);
									ctx.lineTo(light.end.x, light.end.y);
									ctx.stroke();
									ctx.shadowBlur = 0;
									ctx.globalAlpha = la(1.0);
								}
								// ── Point Light (standard) ──
								else if (totalRadiusPx > 0) {
									ctx.globalAlpha = la(flicker.alpha);
									const grad = ctx.createRadialGradient(
										light.x, light.y, 0,
										light.x, light.y, totalRadiusPx
									);
									if (flickBrightPx > 0 && flickDimPx > 0) {
										const bRatio = flickBrightPx / totalRadiusPx;
										grad.addColorStop(0, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.18)`);
										grad.addColorStop(bRatio * 0.75, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.14)`);
										grad.addColorStop(bRatio, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0.09)`);
										grad.addColorStop(Math.min(bRatio + (1 - bRatio) * 0.5, 0.95), `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0.04)`);
										grad.addColorStop(1, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0)`);
									} else if (flickBrightPx > 0) {
										grad.addColorStop(0, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.18)`);
										grad.addColorStop(0.7, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.10)`);
										grad.addColorStop(1, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0)`);
									} else {
										grad.addColorStop(0, `rgba(${lc.r}, ${lc.g}, ${lc.b}, 0.22)`);
										grad.addColorStop(0.5, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0.10)`);
										grad.addColorStop(1, `rgba(${lcDim.r}, ${lcDim.g}, ${lcDim.b}, 0)`);
									}
									ctx.fillStyle = grad;
									ctx.beginPath();
									ctx.arc(light.x, light.y, totalRadiusPx, 0, Math.PI * 2);
									ctx.fill();
									ctx.globalAlpha = la(1.0);
								}
							
							// Draw cone for bullseye lantern (showing direction) - subtle
							if (light.cone) {
								const direction = (light.direction || 0) * Math.PI / 180; // Convert degrees to radians
								const coneAngle = Math.PI / 6; // 30 degree half-angle (60 degree total cone)
								
								ctx.globalAlpha = la(0.1);
								ctx.fillStyle = '#ffffff';
								ctx.beginPath();
								ctx.moveTo(light.x, light.y);
								ctx.arc(light.x, light.y, brightRadiusPx, direction - coneAngle, direction + coneAngle);
								ctx.closePath();
								ctx.fill();
								ctx.globalAlpha = la(1.0);
							}
						}
						
// Draw dashed selection rectangle to show clickable area
							if (light.type === 'walllight' && light.start && light.end) {
								// Wall light: draw selection indicator along the line
								ctx.globalAlpha = la(0.5);
								ctx.strokeStyle = isDragging ? '#00ff00' : '#888888';
								ctx.lineWidth = 1;
								ctx.setLineDash([4, 4]);
								ctx.beginPath();
								ctx.moveTo(light.start.x, light.start.y);
								ctx.lineTo(light.end.x, light.end.y);
								ctx.stroke();
								ctx.setLineDash([]);
								// Draw endpoint circles
								ctx.fillStyle = isDragging ? '#00ff00' : '#ffdd44';
								ctx.globalAlpha = la(isActive ? 0.8 : 0.4);
								ctx.beginPath();
								ctx.arc(light.start.x, light.start.y, 5, 0, Math.PI * 2);
								ctx.fill();
								ctx.beginPath();
								ctx.arc(light.end.x, light.end.y, 5, 0, Math.PI * 2);
								ctx.fill();
								// Draw center icon (📏)
								ctx.font = '14px serif';
								ctx.textAlign = 'center';
								ctx.textBaseline = 'middle';
								ctx.globalAlpha = la(isActive ? 0.9 : 0.5);
								ctx.fillText('📏', light.x, light.y);
								ctx.globalAlpha = la(1.0);
							} else {
							const selectionPadding = 15; // Same as lightClickRadius
							ctx.globalAlpha = la(0.5);
							ctx.strokeStyle = isDragging ? '#00ff00' : '#888888';
							ctx.lineWidth = 1;
							ctx.setLineDash([4, 4]);
							ctx.strokeRect(
								light.x - selectionPadding,
								light.y - selectionPadding,
								selectionPadding * 2,
								selectionPadding * 2
							);
							ctx.setLineDash([]);
							ctx.globalAlpha = la(1.0);
							
							// Draw light source icon (subtle light bulb) - always visible for editing
						const iconRadius = 12;
						ctx.globalAlpha = la(isDragging ? 1.0 : (isActive ? 0.8 : 0.4));
						
						// Draw bulb body (circle)
						ctx.fillStyle = isActive ? '#ffdd44' : '#666666';
						ctx.strokeStyle = isDragging ? '#00ff00' : (isActive ? '#ff8800' : '#444444');
						ctx.lineWidth = isDragging ? 3 : 2;
						ctx.beginPath();
						ctx.arc(light.x, light.y - 2, iconRadius * 0.6, 0, Math.PI * 2);
						ctx.fill();
						ctx.stroke();
						
						// Draw bulb base (small rectangle)
						ctx.fillStyle = isActive ? '#ccaa33' : '#555555';
						ctx.fillRect(light.x - 4, light.y + 4, 8, 5);
						
						// Draw light rays or direction arrow if active
						if (isActive) {
							ctx.lineWidth = 1.5;
							const rayOffset = iconRadius * 0.8;
							
							// If cone light (bullseye), draw direction arrow instead of rays
							if (light.cone) {
								const direction = (light.direction || 0) * Math.PI / 180;
								const arrowLength = 18;
								const arrowHeadSize = 6;
								
								ctx.strokeStyle = '#ff6600';
								ctx.fillStyle = '#ff6600';
								ctx.lineWidth = 2;
								
								// Arrow shaft
								const startX = light.x + Math.cos(direction) * rayOffset;
								const startY = light.y - 2 + Math.sin(direction) * rayOffset;
								const endX = light.x + Math.cos(direction) * (rayOffset + arrowLength);
								const endY = light.y - 2 + Math.sin(direction) * (rayOffset + arrowLength);
								
								ctx.beginPath();
								ctx.moveTo(startX, startY);
								ctx.lineTo(endX, endY);
								ctx.stroke();
								
								// Arrow head
								ctx.beginPath();
								ctx.moveTo(endX, endY);
								ctx.lineTo(
									endX - Math.cos(direction - Math.PI / 6) * arrowHeadSize,
									endY - Math.sin(direction - Math.PI / 6) * arrowHeadSize
								);
								ctx.lineTo(
									endX - Math.cos(direction + Math.PI / 6) * arrowHeadSize,
									endY - Math.sin(direction + Math.PI / 6) * arrowHeadSize
								);
								ctx.closePath();
								ctx.fill();
							} else {
								// Regular rays for non-cone lights
								ctx.strokeStyle = '#ffff88';
								const rayLength = 6;
								for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
									ctx.beginPath();
									ctx.moveTo(
										light.x + Math.cos(angle) * rayOffset,
										light.y - 2 + Math.sin(angle) * rayOffset
									);
									ctx.lineTo(
										light.x + Math.cos(angle) * (rayOffset + rayLength),
										light.y - 2 + Math.sin(angle) * (rayOffset + rayLength)
									);
									ctx.stroke();
								}
							}
						}
						
						ctx.globalAlpha = la(1.0);
						} // end else (non-walllight icon)
					});
				}

        // Draw GM-side player view rectangle if present (rotated to match player orientation)
        try {
          const gmRect = (plugin as any)._gmViewRect || (viewport as any)._gmViewRect;
          if (gmRect && gmRect.w && gmRect.h) {
            ctx.save();
            
            const rotation = gmRect.rotation || 0;
            const centerX = gmRect.x + gmRect.w / 2;
            const centerY = gmRect.y + gmRect.h / 2;
            
            // Draw the indicator with rotation. The sign here determines visual alignment:
            // +rotation: rotates indicator same direction as player view (image rotation)
            // -rotation: rotates indicator opposite direction (viewport rotation)
            // Current: using +rotation - test to verify correct alignment with player viewport
            ctx.translate(centerX, centerY);
            ctx.rotate(((rotation || 0) * Math.PI) / 180);
            
            // Draw rotated rectangle (centered at origin)
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]);
            ctx.strokeRect(-gmRect.w / 2, -gmRect.h / 2, gmRect.w, gmRect.h);
            
            // Draw rotation indicator arrow (pointing to "up" direction of player view)
            const arrowLen = Math.min(gmRect.w, gmRect.h) * 0.12;
            ctx.strokeStyle = '#00ffff';
            ctx.fillStyle = '#00ffff';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            
            // Arrow shaft pointing up (this shows which way is "up" on the player screen)
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -arrowLen);
            ctx.stroke();
            
            // Arrow head
            ctx.beginPath();
            ctx.moveTo(0, -arrowLen);
            ctx.lineTo(-arrowLen * 0.3, -arrowLen * 0.7);
            ctx.lineTo(arrowLen * 0.3, -arrowLen * 0.7);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
          }
        } catch (e) { }
				
				// Draw hexcrawl party position marker (visible on Player layer for GM)
				if (config.hexcrawlState && config.hexcrawlState.enabled && config.hexcrawlState.partyPosition &&
					(config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') &&
					(config.type === 'world' || config.type === 'regional')) {
					const hcPos = config.hexcrawlState.partyPosition;
					const partyCenter = hexToPixel(hcPos.col, hcPos.row);
					const ppx = partyCenter.x;
					const ppy = partyCenter.y;
					const geo = getHexGeometry();
					const hexSz = Math.min(geo.sizeX, geo.sizeY);
					const ir = hexSz * 0.55;

					// Outer glow
					ctx.save();
					ctx.globalAlpha = 1.0;
					const gmGlow = ctx.createRadialGradient(ppx, ppy, ir * 0.3, ppx, ppy, ir * 1.6);
					gmGlow.addColorStop(0, 'rgba(255, 180, 50, 0.6)');
					gmGlow.addColorStop(0.6, 'rgba(255, 140, 30, 0.2)');
					gmGlow.addColorStop(1, 'rgba(255, 180, 50, 0)');
					ctx.fillStyle = gmGlow;
					ctx.beginPath();
					ctx.arc(ppx, ppy, ir * 1.6, 0, Math.PI * 2);
					ctx.fill();
					ctx.restore();

					// Solid circle background
					ctx.save();
					ctx.globalAlpha = 1.0;
					ctx.fillStyle = 'rgba(40, 30, 15, 0.92)';
					ctx.beginPath();
					ctx.arc(ppx, ppy, ir, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = '#c8a85c';
					ctx.lineWidth = 3;
					ctx.stroke();
					ctx.restore();

					// Campfire emoji
					ctx.save();
					ctx.globalAlpha = 1.0;
					ctx.font = `${Math.round(ir * 1.3)}px sans-serif`;
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText('🏕️', ppx, ppy);
					ctx.restore();
				}

				// Draw hexcrawl travel range overlay (when travel-to-hex tool is active)
				if (activeTool === 'hexcrawl-move' && config.hexcrawlState && config.hexcrawlState.enabled &&
					config.hexcrawlState.partyPosition &&
					(config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') &&
					(config.type === 'world' || config.type === 'regional')) {
					const hcState = config.hexcrawlState;
					const partyPos = hcState.partyPosition;
					const tracker = new HexcrawlTracker(hcState, config.hexTerrains || [], config.hexClimates || []);
					const remaining = tracker.getRemainingMovement();
					const geo = getHexGeometry();

					// Use hexToPixel for center computation (already W/H-aware)
					const hexCenter = (col: number, row: number) => hexToPixel(col, row);

					// Draw green fill for adjacent reachable hexes (you can only move one hex at a time)
					ctx.save();
					for (let dc = -1; dc <= 1; dc++) {
						for (let dr = -1; dr <= 1; dr++) {
							const c = partyPos.col + dc;
							const r = partyPos.row + dr;
							if (c < 0 || r < 0) continue;
							if (c === partyPos.col && r === partyPos.row) continue;
							const dist = hexDistance(partyPos.col, partyPos.row, c, r);
							if (dist !== 1) continue;
							const hexCost = tracker.getMovementCostForHex(c, r);
							if (hexCost <= remaining) {
								// Adjacent + affordable: green tint
								const center = hexCenter(c, r);
								ctx.fillStyle = 'rgba(0, 200, 80, 0.18)';
								ctx.strokeStyle = 'rgba(0, 200, 80, 0.35)';
								ctx.lineWidth = 1.5;
								if (config.gridType === 'hex-horizontal') {
									plugin.drawFilledHexFlatStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
								} else {
									plugin.drawFilledHexPointyStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
								}
							}
						}
					}
					ctx.restore();

					// Draw hover highlight: green if adjacent + affordable, red if not
					if (hexcrawlMoveHoverHex) {
						const hCol = hexcrawlMoveHoverHex.col;
						const hRow = hexcrawlMoveHoverHex.row;
						if (!(hCol === partyPos.col && hRow === partyPos.row)) {
							const dist = hexDistance(partyPos.col, partyPos.row, hCol, hRow);
							const hexCost = tracker.getMovementCostForHex(hCol, hRow);
							const canMove = dist === 1 && hexCost <= remaining;
							const center = hexCenter(hCol, hRow);
							ctx.save();
							ctx.fillStyle = canMove ? 'rgba(0, 220, 80, 0.38)' : 'rgba(220, 40, 30, 0.35)';
							ctx.strokeStyle = canMove ? 'rgba(0, 220, 80, 0.7)' : 'rgba(220, 40, 30, 0.65)';
							ctx.lineWidth = 2.5;
							if (config.gridType === 'hex-horizontal') {
								plugin.drawFilledHexFlatStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
							} else {
								plugin.drawFilledHexPointyStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
							}
							ctx.restore();
						}
					}
				}

				// Draw marker drag ruler
				if (markerDragOrigin && draggingMarkerIndex >= 0) {
					const draggedMarker = config.markers[draggingMarkerIndex];
					const currentPos = draggedMarker.position;
					
					// Draw tunnel preview if marker is actively burrowing
					if (draggedMarker.elevation?.isBurrowing && draggedMarker.elevation?.leaveTunnel && config.tunnels) {
						const activeTunnel = config.tunnels.find((t: any) => 
							t.creatorMarkerId === draggedMarker.id && t.active
						);
						if (activeTunnel && activeTunnel.path.length > 0) {
							const CREATURE_SIZE_SQUARES: Record<string, number> = {
								'tiny': 0.5, 'small': 1, 'medium': 1, 'large': 2, 'huge': 3, 'gargantuan': 4
							};
							const mDef = draggedMarker.markerId ? plugin.markerLibrary.getMarker(draggedMarker.markerId) : null;
							const squares = mDef?.creatureSize ? CREATURE_SIZE_SQUARES[mDef.creatureSize] || 1 : 1;
							const tunnelWidth = (squares * config.gridSize) / 2;
							
							ctx.save();
							ctx.globalAlpha = 0.6;
							ctx.strokeStyle = '#8B4513';
							ctx.lineWidth = tunnelWidth + 4;
							ctx.lineCap = 'round';
							ctx.lineJoin = 'round';
							ctx.setLineDash([10, 5]);
							
							// Draw preview line from last path point to current position
							const lastPoint = activeTunnel.path[activeTunnel.path.length - 1];
							ctx.beginPath();
							ctx.moveTo(lastPoint.x, lastPoint.y);
							ctx.lineTo(currentPos.x, currentPos.y);
							ctx.stroke();
							
							ctx.restore();
						}
					}
					
					// Draw grid-based movement path with D&D 5e distance
					drawMovementPath(ctx, markerDragOrigin, currentPos);
				}
				
				// Draw active ruler
				if (rulerStart && rulerEnd) {
					ctx.strokeStyle = '#ffff00';
					ctx.lineWidth = 4;
					ctx.setLineDash([8, 4]);
					ctx.beginPath();
					ctx.moveTo(rulerStart.x, rulerStart.y);
					ctx.lineTo(rulerEnd.x, rulerEnd.y);
					ctx.stroke();
					ctx.setLineDash([]);
					
					// Draw measurement with outline for visibility
					const distance = Math.sqrt(
						Math.pow(rulerEnd.x - rulerStart.x, 2) + 
						Math.pow(rulerEnd.y - rulerStart.y, 2)
					);
					const gridDistance = distance / config.gridSize;
					const horizontalFeet = gridDistance * config.scale.value;
					
					// Get tile elevation at start and end points for 3D distance
					const rulerStartElev = getTileElevationAt(rulerStart.x, rulerStart.y);
					const rulerEndElev = getTileElevationAt(rulerEnd.x, rulerEnd.y);
					const rulerVerticalFeet = Math.abs(rulerEndElev - rulerStartElev);
					const realDistance = rulerVerticalFeet > 0
						? Math.sqrt(horizontalFeet * horizontalFeet + rulerVerticalFeet * rulerVerticalFeet)
						: horizontalFeet;
					
					const textX = (rulerStart.x + rulerEnd.x) / 2;
					const textY = (rulerStart.y + rulerEnd.y) / 2 - 10;
					let text = `${realDistance.toFixed(1)} ${config.scale.unit}`;
					if (rulerVerticalFeet > 0) {
						const arrow = rulerEndElev > rulerStartElev ? '↑' : '↓';
						text += ` (${arrow}${rulerVerticalFeet}ft)`;
					}
					
					ctx.font = 'bold 18px sans-serif';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					
					// Draw text outline (black) for contrast
					ctx.strokeStyle = '#000000';
					ctx.lineWidth = 4;
					ctx.strokeText(text, textX, textY);
					
					// Draw text fill (yellow)
					ctx.fillStyle = '#ffff00';
					ctx.fillText(text, textX, textY);
				}
				
				// Draw target distance measurement between two tokens
				if (targetDistOriginIdx >= 0 && config.markers[targetDistOriginIdx]) {
					const originMarker = config.markers[targetDistOriginIdx];
					const originPos = originMarker.position;
					
					// Draw origin token highlight ring
					const originDef = originMarker.markerId ? plugin.markerLibrary.getMarker(originMarker.markerId) : null;
					const originRadius = originDef ? getMarkerRadius(originDef) : 15;
					ctx.save();
					ctx.strokeStyle = '#00ffff';
					ctx.lineWidth = 3;
					ctx.setLineDash([6, 3]);
					ctx.beginPath();
					ctx.arc(originPos.x, originPos.y, originRadius + 4, 0, Math.PI * 2);
					ctx.stroke();
					ctx.setLineDash([]);
					ctx.restore();
					
					if (targetDistTargetIdx >= 0 && config.markers[targetDistTargetIdx]) {
						const targetMarker = config.markers[targetDistTargetIdx];
						const targetPos = targetMarker.position;
						
						// Draw target token highlight ring
						const targetDef = targetMarker.markerId ? plugin.markerLibrary.getMarker(targetMarker.markerId) : null;
						const targetRadius = targetDef ? getMarkerRadius(targetDef) : 15;
						ctx.save();
						ctx.strokeStyle = '#00ffff';
						ctx.lineWidth = 3;
						ctx.setLineDash([6, 3]);
						ctx.beginPath();
						ctx.arc(targetPos.x, targetPos.y, targetRadius + 4, 0, Math.PI * 2);
						ctx.stroke();
						ctx.setLineDash([]);
						ctx.restore();
						
						// Calculate D&D 5e RAW distance (5ft increments) with elevation
						const dx = targetPos.x - originPos.x;
						const dy = targetPos.y - originPos.y;
						const horizontalPixelDist = Math.sqrt(dx * dx + dy * dy);
						const horizontalGridDist = horizontalPixelDist / config.gridSize;
						const horizontalFeet = horizontalGridDist * config.scale.value;
						
						// Get elevation difference in feet
						const originElevation = originMarker.elevation;
						const targetElevation = targetMarker.elevation;
						const originHeight = (originElevation?.height || 0) - (originElevation?.depth || 0);
						const targetHeight = (targetElevation?.height || 0) - (targetElevation?.depth || 0);
						const verticalFeet = Math.abs(targetHeight - originHeight);
						
						// 3D distance using Pythagorean theorem, rounded to nearest 5ft (D&D 5e)
						const totalFeetRaw = Math.sqrt(horizontalFeet * horizontalFeet + verticalFeet * verticalFeet);
						const totalFeet = Math.max(config.scale.value, Math.round(totalFeetRaw / config.scale.value) * config.scale.value);
						
						// Draw measurement line (cyan, dashed)
						ctx.save();
						ctx.strokeStyle = '#00ffff';
						ctx.lineWidth = 4;
						ctx.setLineDash([10, 5]);
						ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
						ctx.shadowBlur = 6;
						ctx.beginPath();
						ctx.moveTo(originPos.x, originPos.y);
						ctx.lineTo(targetPos.x, targetPos.y);
						ctx.stroke();
						ctx.setLineDash([]);
						ctx.shadowBlur = 0;
						
						// Draw arrowhead at target end
						const angle = Math.atan2(dy, dx);
						const arrowLen = 12;
						ctx.fillStyle = '#00ffff';
						ctx.beginPath();
						ctx.moveTo(targetPos.x, targetPos.y);
						ctx.lineTo(targetPos.x - arrowLen * Math.cos(angle - Math.PI / 6), targetPos.y - arrowLen * Math.sin(angle - Math.PI / 6));
						ctx.lineTo(targetPos.x - arrowLen * Math.cos(angle + Math.PI / 6), targetPos.y - arrowLen * Math.sin(angle + Math.PI / 6));
						ctx.closePath();
						ctx.fill();
						
						// Draw distance label at midpoint
						const midX = (originPos.x + targetPos.x) / 2;
						const midY = (originPos.y + targetPos.y) / 2 - 14;
						let distText = `${totalFeet} ${config.scale.unit}`;
						if (verticalFeet > 0) {
							distText += ` (↕${verticalFeet}ft)`;
						}
						
						// Background pill for readability
						ctx.font = 'bold 18px sans-serif';
						ctx.textAlign = 'center';
						ctx.textBaseline = 'middle';
						const textWidth = ctx.measureText(distText).width;
						const pillPadX = 8;
						const pillPadY = 4;
						ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
						const pillX = midX - textWidth / 2 - pillPadX;
						const pillY = midY - 10 - pillPadY;
						const pillW = textWidth + pillPadX * 2;
						const pillH = 20 + pillPadY * 2;
						ctx.beginPath();
						ctx.roundRect(pillX, pillY, pillW, pillH, 6);
						ctx.fill();
						
						// Text outline (dark) for contrast
						ctx.strokeStyle = '#003333';
						ctx.lineWidth = 3;
						ctx.strokeText(distText, midX, midY);
						
						// Text fill (cyan)
						ctx.fillStyle = '#00ffff';
						ctx.fillText(distText, midX, midY);
						
						ctx.restore();
					}
				}
				
				// Draw calibration measurement line
				if (calibrationPoint1) {
					ctx.strokeStyle = '#ff9900';
					ctx.lineWidth = 4;
					ctx.setLineDash([10, 5]);
					ctx.beginPath();
					ctx.moveTo(calibrationPoint1.x, calibrationPoint1.y);
					
					if (calibrationPoint2) {
						ctx.lineTo(calibrationPoint2.x, calibrationPoint2.y);
						ctx.stroke();
						ctx.setLineDash([]);
						
						// Draw distance in pixels
						const distance = Math.sqrt(
							Math.pow(calibrationPoint2.x - calibrationPoint1.x, 2) + 
							Math.pow(calibrationPoint2.y - calibrationPoint1.y, 2)
						);
						
						ctx.fillStyle = '#ff9900';
						ctx.font = 'bold 18px sans-serif';
						ctx.fillText(
							`${Math.round(distance)} pixels`,
							(calibrationPoint1.x + calibrationPoint2.x) / 2,
							(calibrationPoint1.y + calibrationPoint2.y) / 2 - 15
						);
					} else {
						// Just draw the first point as a circle
						ctx.setLineDash([]);
						ctx.beginPath();
						ctx.arc(calibrationPoint1.x, calibrationPoint1.y, 8, 0, 2 * Math.PI);
						ctx.fillStyle = '#ff9900';
						ctx.fill();
						ctx.stroke();
					}
				}
			};

			// Function to draw a hex highlight
			const drawHighlight = (ctx: CanvasRenderingContext2D, highlight: any) => {
				// Apply transparency if not on active layer
				const itemLayer = highlight.layer || 'Player';
				const isActiveLayer = itemLayer === config.activeLayer;
				ctx.globalAlpha = isActiveLayer ? 1.0 : 0.3;
				
				ctx.fillStyle = highlight.color + '60'; // Add alpha
				ctx.strokeStyle = highlight.color;
				ctx.lineWidth = 2;
				const geo = getHexGeometry();
				const center = hexToPixel(highlight.col, highlight.row);
				
				if (config.gridType === 'hex-horizontal') {
					plugin.drawFilledHexFlatStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
				} else if (config.gridType === 'hex-vertical') {
					plugin.drawFilledHexPointyStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
				} else if (config.gridType === 'square') {
					const sizeW = config.gridSizeW || config.gridSize;
					const sizeH = config.gridSizeH || config.gridSize;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					ctx.fillRect(
						highlight.col * sizeW + ox,
						highlight.row * sizeH + oy,
						sizeW,
						sizeH
					);
					ctx.strokeRect(
						highlight.col * sizeW + ox,
						highlight.row * sizeH + oy,
						sizeW,
						sizeH
					);
				}
				
				// Reset globalAlpha
				ctx.globalAlpha = 1.0;
			};

			// Function to draw a PoI icon on a hex
			const drawPoiIcon = async (ctx: CanvasRenderingContext2D, poiRef: any) => {
				// For hexcrawl/exploration maps, PoI icons are GM-only hints at 70% opacity
				// For other map types, use layer-based transparency
				const isHexcrawlMap = (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') && (config.type === 'world' || config.type === 'regional');
				let poiAlpha: number;
				if (isHexcrawlMap) {
					poiAlpha = 0.7;
				} else {
					const itemLayer = poiRef.layer || 'DM';
					const isActiveLayer = itemLayer === config.activeLayer;
					poiAlpha = isActiveLayer ? 0.8 : 0.2;
				}
				
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				
				// Calculate hex center using W/H-aware geometry
				const center = hexToPixel(poiRef.col, poiRef.row);
				const centerX = center.x;
				const centerY = center.y;
				
				// Load icon from PoI file
				let icon = '📍'; // Default icon
				try {
					const fileCache = plugin.app.metadataCache.getCache(poiRef.poiFile);
					if (fileCache?.frontmatter?.icon) {
						icon = fileCache.frontmatter.icon;
					}
				} catch (error) {
					console.error('Error loading PoI icon:', error);
				}
				
				// Draw icon onto a temporary canvas first, then composite with alpha
				// (emoji fillText doesn't always respect globalAlpha in Electron)
				const tmpSize = 48;
				const tmpCanvas = _canvasPool.acquire(tmpSize, tmpSize);
				const tmpCtx = tmpCanvas.getContext('2d');
				if (tmpCtx) {
					tmpCtx.font = '24px sans-serif';
					tmpCtx.textAlign = 'center';
					tmpCtx.textBaseline = 'middle';
					tmpCtx.fillText(icon, tmpSize / 2, tmpSize / 2);
				}
				
				ctx.save();
				ctx.globalAlpha = poiAlpha;
				ctx.drawImage(tmpCanvas, centerX - tmpSize / 2, centerY - tmpSize / 2);
				ctx.restore();
				_canvasPool.release(tmpCanvas);
			};

			// Helper: get marker pixel radius for a given marker definition
			const getMarkerRadius = (markerDef: MarkerDefinition): number => {
				if (['player', 'npc', 'creature'].includes(markerDef.type) && markerDef.creatureSize && config.gridSize) {
					const squares = CREATURE_SIZE_SQUARES[markerDef.creatureSize] || 1;
					return (squares * config.gridSize) / 2;
				}
				return (markerDef.pixelSize || 30) / 2;
			};

			/**
			 * Snap a position to the correct grid cell center for a given creature size.
			 * Tiny tokens (squares=0.5) snap to half-cell quadrants so 4 fit per tile.
			 * All other sizes snap to full-cell boundaries.
			 */
			const snapTokenToGrid = (posX: number, posY: number, sizeSquares: number): { x: number; y: number } => {
				const gs = config.gridSize || 70;
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				// For tiny tokens the snap step is half a cell; for everything else it's full cell widths
				const step = sizeSquares < 1 ? gs * sizeSquares : gs;
				const halfToken = (sizeSquares * gs) / 2;
				const col = Math.round((posX - ox - halfToken) / step);
				const row = Math.round((posY - oy - halfToken) / step);
				return { x: ox + col * step + halfToken, y: oy + row * step + halfToken };
			};

			// Image cache for marker token images
			const markerImageCache: Map<string, HTMLImageElement> = new Map();
			const loadMarkerImage = (path: string): HTMLImageElement | null => {
				if (markerImageCache.has(path)) {
					const img2 = markerImageCache.get(path)!;
					return img2.complete && img2.naturalWidth > 0 ? img2 : null;
				}
				const img2 = new Image();
				markerImageCache.set(path, img2);
				try {
					img2.src = plugin.app.vault.adapter.getResourcePath(path);
					img2.onload = () => redrawAnnotations();
				} catch {
					// invalid path
				}
				return null;
			};

			// Function to draw a marker
			const drawMarker = (ctx: CanvasRenderingContext2D, marker: any) => {
				// Apply transparency if not on active layer
				const itemLayer = marker.layer || 'Player';
				const isActiveLayer = itemLayer === config.activeLayer;
				
				// Special transparency for burrowed tokens (underground)
				if (marker.elevation && marker.elevation.isBurrowing) {
					ctx.globalAlpha = 0.5; // Burrowed tokens are semi-transparent
				}
				// Special transparency for Elevated/Subterranean layers
				else if (itemLayer === 'Elevated' || itemLayer === 'Subterranean') {
					ctx.globalAlpha = 0.6; // Semi-transparent even when active
				} else {
					ctx.globalAlpha = isActiveLayer ? 1.0 : 0.3;
				}
				
				let markerDef: MarkerDefinition | null | undefined = null;
				let position = marker.position;
				
				// Check if this is a MarkerReference (new format) or old format
				if (marker.markerId) {
					markerDef = plugin.markerLibrary.getMarker(marker.markerId);
					if (!markerDef) {
						return;
					}
				} else {
					// Old format: treat as poi with pixelSize
					markerDef = {
						id: marker.id || 'legacy',
						name: 'Legacy',
						type: 'poi',
						icon: marker.icon || '',
						backgroundColor: marker.color || '#ff0000',
						borderColor: '#ffffff',
						pixelSize: 30,
						createdAt: 0,
						updatedAt: 0
					};
				}
				
				const radius = getMarkerRadius(markerDef);
				const elevation = marker.elevation;
				
				ctx.save();
				
				// Draw drop shadow for flying tokens
				if (elevation && elevation.height && elevation.height > 0) {
					const shadowOffset = Math.min(10, elevation.height / 5);
					const shadowBlur = Math.min(15, elevation.height / 3);
					
					ctx.save();
					ctx.globalAlpha = 0.4;
					ctx.fillStyle = '#000000';
					ctx.shadowColor = '#000000';
					ctx.shadowBlur = shadowBlur;
					ctx.shadowOffsetX = shadowOffset;
					ctx.shadowOffsetY = shadowOffset;
					ctx.beginPath();
					ctx.arc(position.x, position.y, radius * 0.8, 0, Math.PI * 2);
					ctx.fill();
					ctx.restore();
					
					// Reset to main alpha
					if (itemLayer === 'Elevated') {
						ctx.globalAlpha = 0.6;
					} else {
						ctx.globalAlpha = isActiveLayer ? 1.0 : 0.3;
					}
				}
				
				// Add colored glow for elevated/subterranean
				if (itemLayer === 'Elevated' || itemLayer === 'Subterranean') {
					ctx.save();
					ctx.shadowColor = itemLayer === 'Elevated' ? '#4DA6FF' : '#8B4513';
					ctx.shadowBlur = 10;
					ctx.beginPath();
					ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
					ctx.strokeStyle = itemLayer === 'Elevated' ? '#4DA6FF' : '#8B4513';
					ctx.lineWidth = 3;
					ctx.stroke();
					ctx.restore();
				}
				
				// Clip to circle
				ctx.beginPath();
				ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
				ctx.closePath();
				
				// Try to draw image first
				let imageDrawn = false;
				if (markerDef.imageFile) {
					const cachedImg = loadMarkerImage(markerDef.imageFile);
					if (cachedImg) {
						ctx.clip();
						const fit = markerDef.imageFit || 'cover';
						const imgW = cachedImg.naturalWidth;
						const imgH = cachedImg.naturalHeight;
						const tokenSize = radius * 2;
						if (fit === 'contain') {
							// Show entire image inside the token, preserving aspect ratio
							ctx.fillStyle = markerDef.backgroundColor || '#333333';
							ctx.fill();
							const scale = Math.min(tokenSize / imgW, tokenSize / imgH);
							const drawW = imgW * scale;
							const drawH = imgH * scale;
							ctx.drawImage(cachedImg, position.x - drawW / 2, position.y - drawH / 2, drawW, drawH);
						} else {
							// Cover: fill the token, may crop edges, preserving aspect ratio
							const scale = Math.max(tokenSize / imgW, tokenSize / imgH);
							const drawW = imgW * scale;
							const drawH = imgH * scale;
							ctx.drawImage(cachedImg, position.x - drawW / 2, position.y - drawH / 2, drawW, drawH);
						}
						imageDrawn = true;
					}
				}
				
				// Fill background color only if no image was drawn
				if (!imageDrawn) {
					ctx.fillStyle = markerDef.backgroundColor;
					ctx.fill();
				}
				
				// Draw border (check marker instance first, then definition, then default to white)
				// Re-draw the arc path since clip consumed it
				const borderColor = (marker as any).borderColor || markerDef.borderColor || '#ffffff';
				ctx.restore();
				ctx.save();
				ctx.beginPath();
				ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
				ctx.strokeStyle = borderColor;
				ctx.lineWidth = Math.max(2, radius * 0.1);
				ctx.stroke();
				
				// Draw icon/label if present
				if (markerDef.icon) {
					ctx.fillStyle = '#ffffff';
					ctx.font = `${Math.max(10, radius * 1.2)}px sans-serif`;
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText(markerDef.icon, position.x, position.y);
				}
				
				ctx.restore();
				
				// Draw elevation badge
				if (elevation && (elevation.height || elevation.depth)) {
					ctx.save();
					ctx.globalAlpha = 1.0;
					
					const elevationValue = elevation.height || elevation.depth || 0;
					const elevationIcon = elevation.height ? '↑' : '↓';
					const elevationLabel = `${elevationIcon}${elevationValue}ft`;
					
					// Measure text to size the pill badge
					const fontSize = Math.max(9, radius * 0.35);
					ctx.font = `bold ${fontSize}px sans-serif`;
					const textWidth = ctx.measureText(elevationLabel).width;
					const pillW = textWidth + 8;
					const pillH = fontSize + 6;
					const pillX = position.x + radius - pillW + 2;  // Anchored at top-right
					const pillY = position.y - radius - 2;
					const pillR = pillH / 2; // Corner radius
					
					// Pill background
					ctx.fillStyle = elevation.height ? '#4DA6FF' : '#8B4513';
					ctx.beginPath();
					ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
					ctx.fill();
					
					// Pill border
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 1.5;
					ctx.stroke();
					
					// Badge text (arrow + value + ft)
					ctx.fillStyle = '#ffffff';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText(elevationLabel, pillX + pillW / 2, pillY + pillH / 2);
					
					ctx.restore();
				}
				
				// Draw tunnel mode badge
				if (marker.tunnelState) {
					ctx.save();
					ctx.globalAlpha = 1.0;
					
					const badgeSize = Math.max(16, radius * 0.5);
					const badgeX = position.x - radius + badgeSize / 2;  // Left side
					const badgeY = position.y - radius + badgeSize / 2;
					
					// Badge background (orange/amber for visibility)
					ctx.fillStyle = '#FF8C00';
					ctx.beginPath();
					ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
					ctx.fill();
					
					// Badge border
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 2;
					ctx.stroke();
					
					// Badge icon (flashlight/tunnel icon)
					ctx.fillStyle = '#ffffff';
					ctx.font = `bold ${Math.max(10, badgeSize * 0.6)}px sans-serif`;
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText('🔦', badgeX, badgeY);
					
					ctx.restore();
					
					// Draw highlighted tunnel path
					const tunnel = config.tunnels?.find((t: any) => t.id === marker.tunnelState.tunnelId);
					if (tunnel && tunnel.path.length > 1) {
						ctx.save();
						ctx.globalAlpha = 0.8;
						
						const CREATURE_SIZE_SQUARES: Record<string, number> = {
							'tiny': 0.5, 'small': 1, 'medium': 1, 'large': 2, 'huge': 3, 'gargantuan': 4
						};
						const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize] || 1;
						const tunnelWidth = (squares * config.gridSize) / 2;
						
						// Draw path up to current position in bright color
						ctx.strokeStyle = '#FFD700';  // Gold
						ctx.lineWidth = tunnelWidth + 2;
						ctx.lineCap = 'round';
						ctx.lineJoin = 'round';
						ctx.beginPath();
						ctx.moveTo(tunnel.path[0].x, tunnel.path[0].y);
						for (let i = 1; i <= marker.tunnelState.pathIndex && i < tunnel.path.length; i++) {
							ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
						}
						ctx.stroke();
						
						// Draw remaining path in dimmer color
						if (marker.tunnelState.pathIndex < tunnel.path.length - 1) {
							ctx.strokeStyle = '#666666';
							ctx.lineWidth = tunnelWidth;
							ctx.beginPath();
							ctx.moveTo(tunnel.path[marker.tunnelState.pathIndex].x, tunnel.path[marker.tunnelState.pathIndex].y);
							for (let i = marker.tunnelState.pathIndex + 1; i < tunnel.path.length; i++) {
								ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
							}
							ctx.stroke();
						}
						
						ctx.restore();
					}
				}
				
				// Reset globalAlpha
				ctx.globalAlpha = 1.0;
			};

			// Function to draw a drawing
			const drawDrawing = (ctx: CanvasRenderingContext2D, drawing: any) => {
				if (drawing.points.length === 0) return;
				
				// Apply transparency if not on active layer
				const itemLayer = drawing.layer || 'Player';
				const isActiveLayer = itemLayer === config.activeLayer;
				ctx.globalAlpha = isActiveLayer ? 1.0 : 0.3;
				
				ctx.strokeStyle = drawing.color;
				ctx.lineWidth = drawing.strokeWidth || 2;
				
				if (drawing.type === 'freehand') {
					ctx.beginPath();
					ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
					for (let i = 1; i < drawing.points.length; i++) {
						ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
					}
					ctx.stroke();
				}
				
				// Reset globalAlpha
				ctx.globalAlpha = 1.0;
			};

			// Helper: snap a point to the nearest grid intersection
			const snapToGridIntersection = (x: number, y: number): { x: number; y: number } => {
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const gs = config.gridSize || 70;
				if (config.gridType === 'square') {
					const snappedX = Math.round((x - ox) / gs) * gs + ox;
					const snappedY = Math.round((y - oy) / gs) * gs + oy;
					return { x: snappedX, y: snappedY };
				}
				// For hex grids, snap to nearest cell center
				const hex = pixelToHex(x, y);
				if (config.gridType === 'hex-horizontal') {
					const horiz = gs;
					const size = (2 / 3) * horiz;
					const vert = Math.sqrt(3) * size;
					const colOffsetY = (hex.col & 1) ? vert / 2 : 0;
					return { x: hex.col * horiz + ox, y: hex.row * vert + colOffsetY + oy };
				} else if (config.gridType === 'hex-vertical') {
					const vert = gs;
					const size = (2 / 3) * vert;
					const horiz = Math.sqrt(3) * size;
					const rowOffsetX = (hex.row & 1) ? horiz / 2 : 0;
					return { x: hex.col * horiz + rowOffsetX + ox, y: hex.row * vert + oy };
				}
				return { x, y };
			};

			// Helper: snap a point to the center of the nearest grid cell (2024 rules)
			const snapToGridCenter = (x: number, y: number): { x: number; y: number } => {
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const gs = config.gridSize || 70;
				if (config.gridType === 'square') {
					const snappedX = Math.floor((x - ox) / gs) * gs + ox + gs / 2;
					const snappedY = Math.floor((y - oy) / gs) * gs + oy + gs / 2;
					return { x: snappedX, y: snappedY };
				}
				// For hex grids, snap to nearest cell center (same as intersection helper)
				const hex = pixelToHex(x, y);
				if (config.gridType === 'hex-horizontal') {
					const horiz = gs;
					const size = (2 / 3) * horiz;
					const vert = Math.sqrt(3) * size;
					const colOffsetY = (hex.col & 1) ? vert / 2 : 0;
					return { x: hex.col * horiz + ox, y: hex.row * vert + colOffsetY + oy };
				} else if (config.gridType === 'hex-vertical') {
					const vert = gs;
					const size = (2 / 3) * vert;
					const horiz = Math.sqrt(3) * size;
					const rowOffsetX = (hex.row & 1) ? horiz / 2 : 0;
					return { x: hex.col * horiz + rowOffsetX + ox, y: hex.row * vert + oy };
				}
				return { x, y };
			};

			// Helper: get tile ground elevation (in feet) at a pixel position
			const getTileElevationAt = (x: number, y: number): number => {
				if (!config.tileElevations) return 0;
				const gs = config.gridSize || 70;
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const col = Math.floor((x - ox) / gs);
				const row = Math.floor((y - oy) / gs);
				const key = `${col},${row}`;
				return config.tileElevations[key] || 0;
			};

			// Helper: apply tile ground elevation to a marker (only if not flying/burrowing)
			const applyTileElevation = (marker: any) => {
				const tileElev = getTileElevationAt(marker.position.x, marker.position.y);
				// Skip if the token is flying (user-set height above ground) or burrowing
				if (marker.elevation?.isBurrowing) return;
				// If the token has user-set flying height (height > 0 but no tile induced it),
				// we consider it "flying" and don't override
				if (marker.elevation?.height && marker.elevation.height > 0 && !marker.elevation._groundHeight) return;

				if (!marker.elevation) marker.elevation = {};

				if (tileElev > 0) {
					marker.elevation.height = tileElev;
					marker.elevation._groundHeight = tileElev; // Track that this height came from ground
					delete marker.elevation.depth;
				} else if (tileElev < 0) {
					marker.elevation.depth = Math.abs(tileElev);
					marker.elevation._groundHeight = tileElev;
					delete marker.elevation.height;
				} else {
					// Ground level tile — clear ground-induced elevation
					if (marker.elevation._groundHeight) {
						delete marker.elevation.height;
						delete marker.elevation.depth;
						delete marker.elevation._groundHeight;
					}
				}

				// Update layer assignment based on elevation — only override
				// elevation-driven layers; preserve manually-assigned layers (DM, Background)
				const elevation = marker.elevation;
				if (!elevation || (!elevation.height && !elevation.depth)) {
					// Only reset to Player if the token was on an elevation-driven layer
					if (marker.layer === 'Elevated' || marker.layer === 'Subterranean') {
						marker.layer = 'Player';
					}
				} else if (elevation.depth && elevation.depth > 0) {
					if (elevation.isBurrowing) {
						marker.layer = 'DM';
					} else {
						marker.layer = 'Subterranean';
					}
				} else if (elevation.height && elevation.height > 0) {
					marker.layer = 'Elevated';
				}
			};

			// Helper: snap distance to grid multiples
			const snapDistanceToGrid = (pixelDist: number): number => {
				const gs = config.gridSize || 70;
				return Math.max(gs, Math.round(pixelDist / gs) * gs);
			};

			/**
			 * Compute grid-based movement path from pixelOrigin to pixelCurrent.
			 * Returns cell coords traversed + total D&D distance + cumulative climb distance.
			 * Uses optional 5/10/5/10 diagonal rule (Variant: Diagonals from DMG).
			 */
			const computeGridMovePath = (
				originPx: { x: number; y: number },
				currentPx: { x: number; y: number },
			): { cells: { col: number; row: number; dist: number }[]; totalDist: number; climbDist: number } => {
				const gs = config.gridSize || 70;
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const scaleVal = config.scale?.value || 5;

				// Convert pixel positions to grid coordinates
				const startCol = Math.floor((originPx.x - ox) / gs);
				const startRow = Math.floor((originPx.y - oy) / gs);
				const endCol = Math.floor((currentPx.x - ox) / gs);
				const endRow = Math.floor((currentPx.y - oy) / gs);

				if (startCol === endCol && startRow === endRow) {
					return { cells: [], totalDist: 0, climbDist: 0 };
				}

				// Track elevation along path for 3D distance
				let prevElevation = config.tileElevations ? (config.tileElevations[`${startCol},${startRow}`] || 0) : 0;
				let climbDist = 0;

				// Bresenham-like line through grid cells
				const cells: { col: number; row: number; dist: number }[] = [];
				let c = startCol;
				let r = startRow;
				const dc = endCol - startCol;
				const dr = endRow - startRow;
				const absDc = Math.abs(dc);
				const absDr = Math.abs(dr);
				const stepC = dc > 0 ? 1 : -1;
				const stepR = dr > 0 ? 1 : -1;

				let totalDist = 0;
				let diagCount = 0; // tracks diagonals for 5/10 alternation

				if (absDc >= absDr) {
					let err = absDc / 2;
					for (let i = 0; i < absDc; i++) {
						const prevC = c;
						const prevR = r;
						err -= absDr;
						let movedDiag = false;
						if (err < 0) {
							r += stepR;
							err += absDc;
							movedDiag = true;
						}
						c += stepC;
						{
							let stepCost: number;
							if (movedDiag) {
								diagCount++;
								stepCost = (diagCount % 2 === 1) ? scaleVal : scaleVal * 2;
							} else {
								stepCost = scaleVal;
							}
							// Double cost for difficult terrain (D&D 5e PHB)
							if (config.difficultTerrain && config.difficultTerrain[`${c},${r}`]) {
								stepCost *= 2;
							}
							totalDist += stepCost;
						}
						// Track elevation change
						const cellElev = config.tileElevations ? (config.tileElevations[`${c},${r}`] || 0) : 0;
						climbDist += Math.abs(cellElev - prevElevation);
						prevElevation = cellElev;
						cells.push({ col: c, row: r, dist: totalDist });
					}
				} else {
					let err = absDr / 2;
					for (let i = 0; i < absDr; i++) {
						const prevC = c;
						const prevR = r;
						err -= absDc;
						let movedDiag = false;
						if (err < 0) {
							c += stepC;
							err += absDr;
							movedDiag = true;
						}
						r += stepR;
						{
							let stepCost: number;
							if (movedDiag) {
								diagCount++;
								stepCost = (diagCount % 2 === 1) ? scaleVal : scaleVal * 2;
							} else {
								stepCost = scaleVal;
							}
							// Double cost for difficult terrain (D&D 5e PHB)
							if (config.difficultTerrain && config.difficultTerrain[`${c},${r}`]) {
								stepCost *= 2;
							}
							totalDist += stepCost;
						}
						// Track elevation change
						const cellElev = config.tileElevations ? (config.tileElevations[`${c},${r}`] || 0) : 0;
						climbDist += Math.abs(cellElev - prevElevation);
						prevElevation = cellElev;
						cells.push({ col: c, row: r, dist: totalDist });
					}
				}

				return { cells, totalDist, climbDist };
			};

			/**
			 * Draw movement path tile highlighting and distance label.
			 * Used by both GM view and (via sync) player view.
			 * Now includes elevation-aware 3D distance when tiles have elevation.
			 */
			const drawMovementPath = (
				ctx: CanvasRenderingContext2D,
				originPx: { x: number; y: number },
				currentPx: { x: number; y: number },
				pathData?: { cells: { col: number; row: number; dist: number }[]; totalDist: number; climbDist?: number },
			) => {
				const gs = config.gridSize || 70;
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const scaleUnit = config.scale?.unit || 'feet';
				const scaleVal = config.scale?.value || 5;

				const path = pathData || computeGridMovePath(originPx, currentPx);
				if (path.cells.length === 0) return;

				ctx.save();

				// Highlight traversed cells
				ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';
				ctx.strokeStyle = 'rgba(255, 255, 0, 0.35)';
				ctx.lineWidth = 1.5;
				for (const cell of path.cells) {
					const cellX = cell.col * gs + ox;
					const cellY = cell.row * gs + oy;
					ctx.fillRect(cellX, cellY, gs, gs);
					ctx.strokeRect(cellX + 0.5, cellY + 0.5, gs - 1, gs - 1);
				}

				// Dashed ruler line
				ctx.strokeStyle = '#ffff00';
				ctx.lineWidth = 3;
				ctx.setLineDash([8, 4]);
				ctx.beginPath();
				ctx.moveTo(originPx.x, originPx.y);
				ctx.lineTo(currentPx.x, currentPx.y);
				ctx.stroke();
				ctx.setLineDash([]);

				// Calculate 3D distance including climb
				const climbDist = path.climbDist || 0;
				let displayDist: number;
				if (climbDist > 0) {
					// 3D Pythagorean: sqrt(horizontal² + vertical²), rounded to nearest grid unit
					const raw3D = Math.sqrt(path.totalDist * path.totalDist + climbDist * climbDist);
					displayDist = Math.max(scaleVal, Math.round(raw3D / scaleVal) * scaleVal);
				} else {
					displayDist = path.totalDist;
				}

				// Distance label — big, near the current position
				let labelText = `${displayDist} ${scaleUnit}`;
				if (climbDist > 0) {
					labelText += ` (↕${climbDist}ft)`;
				}
				ctx.font = 'bold 22px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				// Position label above current token position
				const labelX = currentPx.x;
				const labelY = currentPx.y - gs * 0.8;

				// Background pill
				const metrics = ctx.measureText(labelText);
				const pillPadX = 10;
				const pillPadY = 5;
				const pillW = metrics.width + pillPadX * 2;
				const pillH = 24 + pillPadY * 2;
				ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
				ctx.beginPath();
				ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, 8);
				ctx.fill();

				// Text outline
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 4;
				ctx.strokeText(labelText, labelX, labelY);

				// Text fill
				ctx.fillStyle = '#ffff00';
				ctx.fillText(labelText, labelX, labelY);

				ctx.restore();
			};

			/**
			 * Highlight grid squares that are at least 50% covered by an AoE shape.
			 * Uses an offscreen canvas to render the AoE silhouette, then samples
			 * each candidate grid cell to measure pixel-level coverage.
			 * Only applies to square grids (hex grids skip this).
			 */
			const drawAoeAffectedSquares = (
				ctx: CanvasRenderingContext2D,
				origin: { x: number; y: number },
				snappedDist: number,
				angle: number,
				shape: string,
				color: string,
				isPreview: boolean,
				centered: boolean,
			) => {
				if (config.gridType !== 'square') return;
				const gs = config.gridSize || 70;
				const gw = config.gridSizeW || gs;
				const gh = config.gridSizeH || gs;
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;

				// Determine bounding box of the AoE in map-space (generous)
				const reach = snappedDist + gs;
				const minX = origin.x - reach;
				const minY = origin.y - reach;
				const maxX = origin.x + reach * 2;
				const maxY = origin.y + reach * 2;

				// Grid column/row range that could be affected
				const colStart = Math.floor((minX - ox) / gw) - 1;
				const colEnd = Math.ceil((maxX - ox) / gw) + 1;
				const rowStart = Math.floor((minY - oy) / gh) - 1;
				const rowEnd = Math.ceil((maxY - oy) / gh) + 1;

				// Create a small offscreen canvas just for the AoE silhouette.
				// We map the candidate grid region into a compact pixel buffer.
				const sampleRes = 8; // sample points per cell axis (8×8 = 64 samples per cell)

				// Build the AoE path in a reusable way
				const buildAoePath = (pctx: CanvasRenderingContext2D, ox2: number, oy2: number) => {
					pctx.beginPath();
					if (shape === 'circle') {
						pctx.arc(ox2, oy2, snappedDist, 0, Math.PI * 2);
					} else if (shape === 'cone') {
						const halfAngle = (53 / 2) * (Math.PI / 180);
						pctx.moveTo(ox2, oy2);
						pctx.arc(ox2, oy2, snappedDist, angle - halfAngle, angle + halfAngle);
						pctx.closePath();
					} else if (shape === 'square') {
						// Squares are always axis-aligned (no rotation)
						const half = snappedDist;
						pctx.rect(ox2 - half, oy2 - half, half * 2, half * 2);
					} else if (shape === 'line') {
						const halfWidth = gs / 2;
						pctx.save();
						pctx.translate(ox2, oy2);
						pctx.rotate(angle);
						pctx.rect(0, -halfWidth, snappedDist, halfWidth * 2);
						pctx.restore();
					}
				};

				// For each candidate grid cell, sample coverage using isPointInPath
				const osc = _canvasPool.acquire(1, 1);
				const oCtx = osc.getContext('2d');
				if (!oCtx) { _canvasPool.release(osc); return; }

				// Build path once on the offscreen context (we only need isPointInPath)
				buildAoePath(oCtx, origin.x, origin.y);

				ctx.save();
				const baseAlpha = isPreview ? 0.18 : 0.25;

				for (let col = colStart; col <= colEnd; col++) {
					for (let row = rowStart; row <= rowEnd; row++) {
						const cellLeft = col * gw + ox;
						const cellTop = row * gh + oy;

						// Sample grid of points inside this cell
						let hits = 0;
						const total = sampleRes * sampleRes;
						for (let sy = 0; sy < sampleRes; sy++) {
							for (let sx = 0; sx < sampleRes; sx++) {
								const px = cellLeft + (sx + 0.5) * (gw / sampleRes);
								const py = cellTop + (sy + 0.5) * (gh / sampleRes);
								if (oCtx.isPointInPath(px, py)) {
									hits++;
								}
							}
						}

						if (hits >= total * 0.5) {
							// This cell is at least 50% covered — highlight it
							ctx.fillStyle = color;
							ctx.globalAlpha = baseAlpha;
							ctx.fillRect(cellLeft, cellTop, gw, gh);

							// Draw a subtle border
							ctx.globalAlpha = baseAlpha + 0.15;
							ctx.strokeStyle = color;
							ctx.lineWidth = 1.5;
							ctx.strokeRect(cellLeft + 0.5, cellTop + 0.5, gw - 1, gh - 1);
						}
					}
				}

				ctx.restore();
				_canvasPool.release(osc);
			};

			// Draw an AoE shape (used for both preview and saved effects)
			const drawAoeShape = (ctx: CanvasRenderingContext2D, origin: { x: number; y: number }, end: { x: number; y: number }, shape: string, color: string, isPreview: boolean, centered: boolean = false) => {
				const gs = config.gridSize || 70;
				const dx = end.x - origin.x;
				const dy = end.y - origin.y;
				const rawDist = Math.sqrt(dx * dx + dy * dy);
				const snappedDist = snapDistanceToGrid(rawDist);
				const angle = Math.atan2(dy, dx);
				
				ctx.save();
				
				// Apply transparency for non-active layers
				const isActiveLayer = true; // AoE shapes drawn fresh are always on active layer context
				if (!isPreview) {
					ctx.globalAlpha = 0.5;
				} else {
					ctx.globalAlpha = 0.35;
				}
				
				ctx.fillStyle = color;
				ctx.strokeStyle = color;
				ctx.lineWidth = 3;
				
				if (shape === 'circle') {
					ctx.beginPath();
					ctx.arc(origin.x, origin.y, snappedDist, 0, Math.PI * 2);
					ctx.fill();
					ctx.globalAlpha = isPreview ? 0.7 : 0.8;
					ctx.stroke();
				} else if (shape === 'cone') {
					// 53-degree cone (standard D&D cone angle)
					const halfAngle = (53 / 2) * (Math.PI / 180);
					ctx.beginPath();
					ctx.moveTo(origin.x, origin.y);
					ctx.arc(origin.x, origin.y, snappedDist, angle - halfAngle, angle + halfAngle);
					ctx.closePath();
					ctx.fill();
					ctx.globalAlpha = isPreview ? 0.7 : 0.8;
					ctx.stroke();
				} else if (shape === 'square') {
					// Squares are always axis-aligned (no rotation per DMG rules)
					const half = snappedDist;
					if (centered) {
						// Token-centered: square centered on origin
						ctx.fillRect(origin.x - half, origin.y - half, half * 2, half * 2);
						ctx.globalAlpha = isPreview ? 0.7 : 0.8;
						ctx.strokeRect(origin.x - half, origin.y - half, half * 2, half * 2);
					} else {
						// Intersection-origin: square centered on origin
						ctx.fillRect(origin.x - half, origin.y - half, half * 2, half * 2);
						ctx.globalAlpha = isPreview ? 0.7 : 0.8;
						ctx.strokeRect(origin.x - half, origin.y - half, half * 2, half * 2);
					}
				} else if (shape === 'line') {
					// Line: 5ft (1 grid cell) wide, snappedDist long
					const halfWidth = gs / 2;
					ctx.save();
					ctx.translate(origin.x, origin.y);
					ctx.rotate(angle);
					ctx.fillRect(0, -halfWidth, snappedDist, halfWidth * 2);
					ctx.globalAlpha = isPreview ? 0.7 : 0.8;
					ctx.strokeRect(0, -halfWidth, snappedDist, halfWidth * 2);
					ctx.restore();
				}

				ctx.restore();

				// Highlight affected grid squares (≥50% coverage per DMG rules)
				drawAoeAffectedSquares(ctx, origin, snappedDist, angle, shape, color, isPreview, centered);
				
				// Draw size label
				ctx.save();
				ctx.globalAlpha = 1.0;
				const gridUnits = snappedDist / gs;
				const realSize = gridUnits * (config.scale?.value || 5);
				const unit = config.scale?.unit || 'feet';
				let labelText = '';
				if (shape === 'circle') {
					labelText = `${realSize.toFixed(0)} ${unit} radius`;
				} else if (shape === 'cone') {
					labelText = `${realSize.toFixed(0)} ${unit} cone`;
				} else if (shape === 'square') {
					labelText = `${(realSize * 2).toFixed(0)} ${unit} cube`;
				} else if (shape === 'line') {
					labelText = `${realSize.toFixed(0)} ${unit} line`;
				}
				
				// Position label
				let labelX: number, labelY: number;
				if (shape === 'circle') {
					labelX = origin.x;
					labelY = origin.y;
				} else {
					labelX = origin.x + Math.cos(angle) * snappedDist / 2;
					labelY = origin.y + Math.sin(angle) * snappedDist / 2;
				}
				
				ctx.font = 'bold 16px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 3;
				ctx.strokeText(labelText, labelX, labelY - 12);
				ctx.fillStyle = '#ffffff';
				ctx.fillText(labelText, labelX, labelY - 12);
				
				ctx.restore();
			};

			// Draw a saved AoE effect
			const drawAoeEffect = (ctx: CanvasRenderingContext2D, aoe: any) => {
				// Apply transparency if not on active layer
				const itemLayer = aoe.layer || 'Player';
				const isActiveLayer = itemLayer === config.activeLayer;
				if (!isActiveLayer) {
					ctx.save();
					ctx.globalAlpha = 0.3;
				}
				drawAoeShape(ctx, aoe.origin, aoe.end, aoe.shape, aoe.color, false, !!aoe.anchorMarkerId);
				if (!isActiveLayer) {
					ctx.restore();
				}
			};

			// ============ Fog of War Rendering ============
			
			// Helper: clip a fog region into a canvas path
			const clipFogRegion = (ctx: CanvasRenderingContext2D, region: any) => {
				if (region.shape === 'rect') {
					ctx.rect(region.x, region.y, region.width, region.height);
				} else if (region.shape === 'circle') {
					ctx.arc(region.cx, region.cy, region.radius, 0, Math.PI * 2);
				} else if (region.shape === 'polygon' && region.points && region.points.length >= 3) {
					ctx.moveTo(region.points[0].x, region.points[0].y);
					for (let i = 1; i < region.points.length; i++) {
						ctx.lineTo(region.points[i].x, region.points[i].y);
					}
					ctx.closePath();
				}
			};

			// ── Ray-segment intersection (used by light preview) ─────────
			const raySegmentIntersection = (
				rayX: number, rayY: number, rayDx: number, rayDy: number,
				segX1: number, segY1: number, segX2: number, segY2: number
			): number | null => {
				const sdx = segX2 - segX1;
				const sdy = segY2 - segY1;
				const denom = rayDx * sdy - rayDy * sdx;
				if (Math.abs(denom) < 1e-10) return null;
				const t = ((segX1 - rayX) * sdy - (segY1 - rayY) * sdx) / denom;
				const u = ((segX1 - rayX) * rayDy - (segY1 - rayY) * rayDx) / denom;
				if (t > 0 && u >= 0 && u <= 1) return t;
				return null;
			};

			// ── Compute visibility polygon (used by light preview) ───────
			const computeVisibilityPolygon = (
				originX: number, originY: number, maxRadius: number,
				walls: { start: { x: number; y: number }; end: { x: number; y: number }; height?: number; open?: boolean }[],
				viewerElevation: number = 0
			): { x: number; y: number }[] => {
				const _wHash = _getWallsHash(walls as any);
				const _cKey = _visCacheKey(originX, originY, maxRadius, viewerElevation, _wHash);
				const _cached = _visCacheMap.get(_cKey);
				if (_cached) return _cached;

				const segments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
				const circleSegments = 64;
				for (let i = 0; i < circleSegments; i++) {
					const a1 = (i / circleSegments) * Math.PI * 2;
					const a2 = ((i + 1) / circleSegments) * Math.PI * 2;
					segments.push({
						p1: { x: originX + Math.cos(a1) * maxRadius, y: originY + Math.sin(a1) * maxRadius },
						p2: { x: originX + Math.cos(a2) * maxRadius, y: originY + Math.sin(a2) * maxRadius },
					});
				}
				for (const wall of walls) {
					if (!wall.start || !wall.end) continue;
					if (wall.height !== undefined && wall.height !== null && viewerElevation > wall.height) continue;
					const dx1 = wall.start.x - originX, dy1 = wall.start.y - originY;
					const dx2 = wall.end.x - originX, dy2 = wall.end.y - originY;
					if (Math.sqrt(dx1 * dx1 + dy1 * dy1) > maxRadius * 2 &&
						Math.sqrt(dx2 * dx2 + dy2 * dy2) > maxRadius * 2) continue;
					segments.push({ p1: { x: wall.start.x, y: wall.start.y }, p2: { x: wall.end.x, y: wall.end.y } });
				}

				// Snap nearby wall endpoints + extend to seal gaps
				const wallSegStart = circleSegments;
				const _snapThr = getWallSnapThreshold();
				const snapDistSq = _snapThr * _snapThr;
				const wepRefs: { x: number; y: number }[] = [];
				for (let wi = wallSegStart; wi < segments.length; wi++) {
					wepRefs.push(segments[wi]!.p1, segments[wi]!.p2);
				}
				for (let wi = 0; wi < wepRefs.length; wi++) {
					for (let wj = wi + 1; wj < wepRefs.length; wj++) {
						const sdx = wepRefs[wi]!.x - wepRefs[wj]!.x;
						const sdy = wepRefs[wi]!.y - wepRefs[wj]!.y;
						const sd2 = sdx * sdx + sdy * sdy;
						if (sd2 > 0 && sd2 < snapDistSq) {
							const mx = (wepRefs[wi]!.x + wepRefs[wj]!.x) * 0.5;
							const my = (wepRefs[wi]!.y + wepRefs[wj]!.y) * 0.5;
							wepRefs[wi]!.x = mx; wepRefs[wi]!.y = my;
							wepRefs[wj]!.x = mx; wepRefs[wj]!.y = my;
						}
					}
				}
				const extPx = _snapThr * 0.25; // proportional wall extension
				for (let wi = wallSegStart; wi < segments.length; wi++) {
					const seg = segments[wi]!;
					const edx = seg.p2.x - seg.p1.x, edy = seg.p2.y - seg.p1.y;
					const eLen = Math.sqrt(edx * edx + edy * edy);
					if (eLen > 0) {
						const ux = edx / eLen, uy = edy / eLen;
						seg.p1.x -= ux * extPx; seg.p1.y -= uy * extPx;
						seg.p2.x += ux * extPx; seg.p2.y += uy * extPx;
					}
				}

				// Collect angles + cast rays
				const angles: number[] = [];
				const eps = 0.00001;
				for (const seg of segments) {
					const a1 = Math.atan2(seg.p1.y - originY, seg.p1.x - originX);
					const a2 = Math.atan2(seg.p2.y - originY, seg.p2.x - originX);
					angles.push(a1 - eps, a1, a1 + eps, a2 - eps, a2, a2 + eps);
				}
				angles.sort((a, b) => a - b);

				const points: { x: number; y: number; angle: number }[] = [];
				for (const angle of angles) {
					const dx = Math.cos(angle), dy = Math.sin(angle);
					let closestT = maxRadius;
					for (const seg of segments) {
						const t = raySegmentIntersection(originX, originY, dx, dy, seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y);
						if (t !== null && t > 0 && t < closestT) closestT = t;
					}
					points.push({ x: originX + dx * closestT, y: originY + dy * closestT, angle });
				}

				const uniquePoints: { x: number; y: number }[] = [];
				for (const pt of points) {
					if (uniquePoints.length === 0) { uniquePoints.push({ x: pt.x, y: pt.y }); continue; }
					const last = uniquePoints[uniquePoints.length - 1]!;
					if (Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2) > 0.5) {
						uniquePoints.push({ x: pt.x, y: pt.y });
					}
				}

				if (_visCacheMap.size >= _VIS_CACHE_MAX) _visCacheMap.clear();
				_visCacheMap.set(_cKey, uniquePoints);
				return uniquePoints;
			};

			// ── Light Preview Overlay (GM-side player-like fog+light) ────
			// Renders a simulation of what a player without darkvision would
			// see: full darkness with shadow-cast light holes punched through.
			const drawLightPreviewOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
				// Collect active light sources (standalone + marker-attached)
				const previewLights: any[] = [];
				if (config.lightSources) {
					for (const light of config.lightSources) {
						if (light.active !== false) previewLights.push(light);
					}
				}
				if (config.markers) {
					for (const marker of config.markers as any[]) {
						if (marker.light && marker.light.bright !== undefined && !marker.tunnelState) {
							previewLights.push({
								x: marker.position.x, y: marker.position.y,
								bright: marker.light.bright, dim: marker.light.dim,
								type: marker.light.type || '', customColor: marker.light.customColor,
								name: marker.light.name || 'Token Light',
								elevation: (marker.elevation?.height || 0) - (marker.elevation?.depth || 0),
							});
						}
					}
				}

				// Filter walls: open doors/windows/terrain pass light, add env-asset door walls
				const previewWalls = (config.walls || []).filter((wall: any) => {
					const t = wall.type || 'wall';
					if ((t === 'door' || t === 'secret') && wall.open) return false;
					if (t === 'window' || t === 'terrain') return false;
					return true;
				});
				// Inline env-asset door wall computation (same logic as computeDoorWallSegments)
				if (config.envAssets && config.envAssets.length > 0) {
					for (const inst of config.envAssets as EnvAssetInstance[]) {
						const def = plugin.envAssetLibrary.getAsset(inst.assetId);
						if (!def || def.category !== 'door') continue;
						const dc = inst.doorConfig;
						if (dc && dc.isOpen && dc.behaviour === 'sliding') continue;
						const pad = 2;
						const useWidth = inst.width >= inst.height;
						const halfSpan = (useWidth ? inst.width : inst.height) / 2 - pad;
						let p1x = useWidth ? -halfSpan : 0, p1y = useWidth ? 0 : -halfSpan;
						let p2x = useWidth ?  halfSpan : 0, p2y = useWidth ? 0 :  halfSpan;
						if (dc && dc.isOpen) {
							if (dc.behaviour !== 'sliding' && dc.openAngle) {
								const pivot = dc.customPivot || { x: 0, y: 0.5 };
								const pvX = (pivot.x - 0.5) * inst.width;
								const pvY = (pivot.y - 0.5) * inst.height;
								const a = (dc.openAngle || 0) * Math.PI / 180;
								const cosA = Math.cos(a), sinA = Math.sin(a);
								let rx = p1x - pvX, ry = p1y - pvY;
								p1x = pvX + rx * cosA - ry * sinA;
								p1y = pvY + rx * sinA + ry * cosA;
								rx = p2x - pvX; ry = p2y - pvY;
								p2x = pvX + rx * cosA - ry * sinA;
								p2y = pvY + rx * sinA + ry * cosA;
							}
							if (dc.behaviour === 'sliding' && dc.slidePosition && dc.slidePath && dc.slidePath.length >= 2) {
								const sp0 = dc.slidePath[0]!;
								const sp1 = dc.slidePath[dc.slidePath.length - 1]!;
								const t = dc.slidePosition;
								p1x += (sp1.x - sp0.x) * t; p1y += (sp1.y - sp0.y) * t;
								p2x += (sp1.x - sp0.x) * t; p2y += (sp1.y - sp0.y) * t;
							}
						}
						const rad = (inst.rotation || 0) * Math.PI / 180;
						const cosR = Math.cos(rad), sinR = Math.sin(rad);
						previewWalls.push({
							type: 'wall',
							start: { x: inst.position.x + p1x * cosR - p1y * sinR, y: inst.position.y + p1x * sinR + p1y * cosR },
							end:   { x: inst.position.x + p2x * cosR - p2y * sinR, y: inst.position.y + p2x * sinR + p2y * cosR },
							open: false,
						});
					}
				}

				const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;

				// --- Phase 1: Fog canvas (black with light holes) ---
				const fogCanvas = _canvasPool.acquire(w, h);
				const fogCtx = fogCanvas.getContext('2d');
				if (!fogCtx) { _canvasPool.release(fogCanvas); return; }
				fogCtx.fillStyle = '#000000';
				fogCtx.fillRect(0, 0, w, h);

				// --- Phase 2: Light colour overlay canvas ---
				const colorCanvas = _canvasPool.acquire(w, h);
				const colCtx = colorCanvas.getContext('2d');

				const flickerTime = performance.now() / 1000;

				try {
				for (let li = 0; li < previewLights.length; li++) {
					const light = previewLights[li]!;
					const flickerKey = `preview_${li}`;
					const isBuzz = BUZZ_LIGHT_TYPES.has(light.type);
					const shouldFlicker = FLICKER_LIGHT_TYPES.has(light.type);
					const flicker = shouldFlicker
						? (isBuzz
							? computeBuzz(getFlickerSeed(flickerKey), flickerTime)
							: computeFlicker(getFlickerSeed(flickerKey), flickerTime, 'high'))
						: { radius: 1, alpha: 1 };

					const brightPx = light.bright * pixelsPerFoot * flicker.radius;
					const dimPx = light.dim * pixelsPerFoot * flicker.radius;
					const totalPx = brightPx + dimPx;
					if (totalPx <= 0) continue;

					const featherR = totalPx * 1.06;

					// Resolve colour
					const defaultHex = getDefaultLightColor(light.type);
					const colHex = light.customColor || defaultHex;
					const col = hexToRgb(colHex);
					const colDim = { r: Math.floor(col.r * 0.7), g: Math.floor(col.g * 0.7), b: Math.floor(col.b * 0.7) };

					// Helper: draw one gradient hole at (cx,cy) clipped by vis polygon
					const punchLight = (cx: number, cy: number) => {
						const vis = computeVisibilityPolygon(cx, cy, totalPx, previewWalls, light.elevation || 0);
						if (vis.length < 3) return;

						// --- Punch fog ---
						const lightCanvas = _canvasPool.acquire(w, h);
						const lCtx = lightCanvas.getContext('2d');
						if (!lCtx) { _canvasPool.release(lightCanvas); return; }

						lCtx.save();
						lCtx.beginPath();
						lCtx.moveTo(vis[0]!.x, vis[0]!.y);
						for (let vi = 1; vi < vis.length; vi++) lCtx.lineTo(vis[vi]!.x, vis[vi]!.y);
						lCtx.closePath();
						lCtx.clip();

						const g = lCtx.createRadialGradient(cx, cy, 0, cx, cy, featherR);
						if (brightPx > 0 && dimPx > 0) {
							const bR = brightPx / featherR;
							g.addColorStop(0, 'rgba(255,255,255,1)');
							g.addColorStop(bR * 0.8, 'rgba(255,255,255,1)');
							g.addColorStop(bR, 'rgba(255,255,255,0.78)');
							g.addColorStop(bR + (1 - bR) * 0.45, 'rgba(255,255,255,0.45)');
							g.addColorStop(totalPx / featherR, 'rgba(255,255,255,0.18)');
							g.addColorStop(1, 'rgba(255,255,255,0)');
						} else if (brightPx > 0) {
							g.addColorStop(0, 'rgba(255,255,255,1)');
							g.addColorStop(0.65, 'rgba(255,255,255,0.85)');
							g.addColorStop(totalPx / featherR, 'rgba(255,255,255,0.2)');
							g.addColorStop(1, 'rgba(255,255,255,0)');
						} else {
							g.addColorStop(0, 'rgba(255,255,255,0.7)');
							g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
							g.addColorStop(totalPx / featherR, 'rgba(255,255,255,0.1)');
							g.addColorStop(1, 'rgba(255,255,255,0)');
						}
						lCtx.fillStyle = g;
						lCtx.beginPath();
						lCtx.arc(cx, cy, featherR, 0, Math.PI * 2);
						lCtx.fill();
						lCtx.restore();

						fogCtx.globalCompositeOperation = 'destination-out';
						fogCtx.drawImage(lightCanvas, 0, 0);
						fogCtx.globalCompositeOperation = 'source-over';
						_canvasPool.release(lightCanvas);

						// --- Colour overlay ---
						if (colCtx) {
							colCtx.save();
							colCtx.beginPath();
							colCtx.moveTo(vis[0]!.x, vis[0]!.y);
							for (let vi = 1; vi < vis.length; vi++) colCtx.lineTo(vis[vi]!.x, vis[vi]!.y);
							colCtx.closePath();
							colCtx.clip();
							colCtx.globalAlpha = flicker.alpha * 0.18;
							const cg = colCtx.createRadialGradient(cx, cy, 0, cx, cy, featherR);
							if (brightPx > 0 && dimPx > 0) {
								const bR = brightPx / featherR;
								cg.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.30)`);
								cg.addColorStop(bR, `rgba(${col.r},${col.g},${col.b},0.18)`);
								cg.addColorStop(1, `rgba(${colDim.r},${colDim.g},${colDim.b},0)`);
							} else {
								cg.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.35)`);
								cg.addColorStop(0.5, `rgba(${col.r},${col.g},${col.b},0.15)`);
								cg.addColorStop(1, `rgba(${colDim.r},${colDim.g},${colDim.b},0)`);
							}
							colCtx.fillStyle = cg;
							colCtx.beginPath();
							colCtx.arc(cx, cy, featherR, 0, Math.PI * 2);
							colCtx.fill();
							colCtx.restore();
						}
					};

					// Wall lights: sample along line
					if (light.start && light.end && light.type === 'walllight') {
						const dx = light.end.x - light.start.x;
						const dy = light.end.y - light.start.y;
						const len = Math.sqrt(dx * dx + dy * dy);
						const step = Math.min(totalPx * 0.4, 20);
						const samples = Math.max(Math.ceil(len / step), 2);
						for (let si = 0; si < samples; si++) {
							const t = samples <= 1 ? 0.5 : si / (samples - 1);
							punchLight(light.start.x + dx * t, light.start.y + dy * t);
						}
					} else {
						punchLight(light.x, light.y);
					}
				}
				} catch (e) { console.error('[DnD] Light preview punch error:', e); }

				// Composite fog at semi-transparent alpha so GM can still see the map
				ctx.save();
				ctx.globalAlpha = 0.72;
				ctx.drawImage(fogCanvas, 0, 0);
				ctx.restore();
				_canvasPool.release(fogCanvas);

				// Composite colour overlay
				if (colCtx) {
					ctx.save();
					ctx.globalAlpha = 0.65;
					ctx.drawImage(colorCanvas, 0, 0);
					ctx.restore();
				}
				_canvasPool.release(colorCanvas);
			};

			// Draw fog of war using an offscreen canvas
			const drawFogOfWar = (ctx: CanvasRenderingContext2D, w: number, h: number, isPlayerView: boolean) => {
				const fogAlpha = isPlayerView ? 1.0 : 0.45;
				
				// Create offscreen fog canvas (pooled)
				const fogCanvas = _canvasPool.acquire(w, h);
				const fogCtx = fogCanvas.getContext('2d');
				if (!fogCtx) { _canvasPool.release(fogCanvas); return; }
				
				// Start fully black
				fogCtx.fillStyle = '#000000';
				fogCtx.fillRect(0, 0, w, h);
				
				// Process regions in order: reveal cuts holes, hide/magic-darkness adds black
				config.fogOfWar.regions.forEach((region: any) => {
					if (region.type === 'reveal') {
						fogCtx.globalCompositeOperation = 'destination-out';
						fogCtx.fillStyle = '#ffffff';
					} else {
						// Both 'hide' and 'magic-darkness' add fog
						fogCtx.globalCompositeOperation = 'source-over';
						fogCtx.fillStyle = '#000000';
					}
					fogCtx.beginPath();
					clipFogRegion(fogCtx, region);
					fogCtx.fill();
				});
				
				// Light sources reveal fog (only in player view)
				if (isPlayerView && config.lightSources && config.lightSources.length > 0) {
					// Calculate pixels per foot based on grid settings
					const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
					
					fogCtx.globalCompositeOperation = 'destination-out';
					fogCtx.fillStyle = '#ffffff';
					
					config.lightSources.forEach((light: any, fogLightIdx: number) => {
						// Apply flicker/buzz for lights in GM fog view
						const fogFlickerKey = `fog_${fogLightIdx}`;
						const fogIsBuzz = BUZZ_LIGHT_TYPES.has(light.type);
						const fogShouldFlicker = FLICKER_LIGHT_TYPES.has(light.type);
						const fogFlickerTime = performance.now() / 1000;
						const fogFlicker = fogShouldFlicker
							? (fogIsBuzz
								? computeBuzz(getFlickerSeed(fogFlickerKey), fogFlickerTime)
								: computeFlicker(getFlickerSeed(fogFlickerKey), fogFlickerTime, 'high'))
							: { radius: 1, alpha: 1 };
						
						// Convert feet to pixels with flicker modulation
						const brightRadiusPx = light.bright * pixelsPerFoot * fogFlicker.radius;
						const dimRadiusPx = light.dim * pixelsPerFoot * fogFlicker.radius;
						const totalRadiusPx = brightRadiusPx + dimRadiusPx;
						
						// Reveal area with smooth gradient (bright + dim light)
						if (totalRadiusPx > 0) {
							// ── Wall Light: sample along line ──
							if (light.start && light.end && light.type === 'walllight') {
								const dx = light.end.x - light.start.x;
								const dy = light.end.y - light.start.y;
								const length = Math.sqrt(dx * dx + dy * dy);
								const stepSize = Math.min(totalRadiusPx * 0.4, 20);
								const steps = Math.max(2, Math.ceil(length / stepSize));
								for (let s = 0; s <= steps; s++) {
									const t = s / steps;
									const px = light.start.x + dx * t;
									const py = light.start.y + dy * t;
									const featherRadius = totalRadiusPx * 1.08;
									const gradient = fogCtx.createRadialGradient(px, py, 0, px, py, featherRadius);
									gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
									if (brightRadiusPx > 0 && dimRadiusPx > 0) {
										const bRatio = brightRadiusPx / featherRadius;
										gradient.addColorStop(bRatio * 0.85, 'rgba(255, 255, 255, 1.0)');
										gradient.addColorStop(bRatio, 'rgba(255, 255, 255, 0.82)');
										gradient.addColorStop(bRatio + (1 - bRatio) * 0.5, 'rgba(255, 255, 255, 0.4)');
										gradient.addColorStop(totalRadiusPx / featherRadius, 'rgba(255, 255, 255, 0.15)');
									} else if (brightRadiusPx > 0) {
										gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.85)');
										gradient.addColorStop(totalRadiusPx / featherRadius, 'rgba(255, 255, 255, 0.2)');
									} else {
										gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
										gradient.addColorStop(totalRadiusPx / featherRadius, 'rgba(255, 255, 255, 0.15)');
									}
									gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
									fogCtx.fillStyle = gradient;
									fogCtx.beginPath();
									fogCtx.arc(px, py, featherRadius, 0, Math.PI * 2);
									fogCtx.fill();
								}
							}
							// ── Point Light: single gradient ──
							else {
							// Use slightly oversized radius for soft outer edge
							const featherRadius = totalRadiusPx * 1.08;
							const gradient = fogCtx.createRadialGradient(
								light.x, light.y, 0,
								light.x, light.y, featherRadius
							);
							gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
							if (brightRadiusPx > 0 && dimRadiusPx > 0) {
								const bRatio = brightRadiusPx / featherRadius;
								gradient.addColorStop(bRatio * 0.85, 'rgba(255, 255, 255, 1.0)');
								gradient.addColorStop(bRatio, 'rgba(255, 255, 255, 0.82)');
								gradient.addColorStop(bRatio + (1 - bRatio) * 0.5, 'rgba(255, 255, 255, 0.4)');
								gradient.addColorStop(totalRadiusPx / featherRadius, 'rgba(255, 255, 255, 0.15)');
							} else if (brightRadiusPx > 0) {
								gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.85)');
								gradient.addColorStop(totalRadiusPx / featherRadius, 'rgba(255, 255, 255, 0.2)');
							} else {
								gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
								gradient.addColorStop(totalRadiusPx / featherRadius, 'rgba(255, 255, 255, 0.15)');
							}
							gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
							
							fogCtx.fillStyle = gradient;
							fogCtx.beginPath();
							fogCtx.arc(light.x, light.y, featherRadius, 0, Math.PI * 2);
							fogCtx.fill();
							}
						}
					});
				}

				// Build effective magic darkness mask: processes regions in order so that
				// reveal/hide drawn AFTER magic-darkness properly cancels it.
				// Mask is white where magic darkness is still active.
				let _gmHasMD = false;
				const _gmMdMask = _canvasPool.acquire(w, h);
				const _gmMdCtx = _gmMdMask.getContext('2d');
				if (_gmMdCtx) {
					for (const region of (config.fogOfWar.regions || [])) {
						if (region.type === 'magic-darkness') {
							_gmHasMD = true;
							_gmMdCtx.globalCompositeOperation = 'source-over';
							_gmMdCtx.fillStyle = '#ffffff';
							_gmMdCtx.beginPath();
							clipFogRegion(_gmMdCtx, region);
							_gmMdCtx.fill();
						} else if (_gmHasMD && (region.type === 'reveal' || region.type === 'hide')) {
							_gmMdCtx.globalCompositeOperation = 'destination-out';
							_gmMdCtx.fillStyle = '#ffffff';
							_gmMdCtx.beginPath();
							clipFogRegion(_gmMdCtx, region);
							_gmMdCtx.fill();
						}
					}
				}

				// Re-apply effective magic darkness after light-source reveals (player view only).
				// In GM view, the ordered region processing already handles this correctly.
				if (isPlayerView && _gmHasMD) {
					fogCtx.globalCompositeOperation = 'source-over';
					const mdBlack = _canvasPool.acquire(w, h);
					const mdBCtx = mdBlack.getContext('2d');
					if (mdBCtx) {
						mdBCtx.fillStyle = '#000000';
						mdBCtx.fillRect(0, 0, w, h);
						mdBCtx.globalCompositeOperation = 'destination-in';
						mdBCtx.drawImage(_gmMdMask, 0, 0);
						fogCtx.drawImage(mdBlack, 0, 0);
					}
					_canvasPool.release(mdBlack);
				}
				
				// Draw the fog canvas onto the main canvas
				ctx.save();
				ctx.globalAlpha = fogAlpha;
				ctx.drawImage(fogCanvas, 0, 0);
				ctx.restore();
				_canvasPool.release(fogCanvas);

				// Draw magic darkness overlay (GM view only): prominent purple tint + dashed border
				// Uses the effective mask so reveals/hides drawn after magic-darkness cancel it.
				if (!isPlayerView && _gmHasMD) {
					// Purple fill
					ctx.save();
					ctx.globalAlpha = 0.5;
					ctx.fillStyle = '#7b2fbe';
					ctx.globalCompositeOperation = 'source-over';
					const purpleCanvas = _canvasPool.acquire(w, h);
					const purpleCtx = purpleCanvas.getContext('2d');
					if (purpleCtx) {
						purpleCtx.fillStyle = '#7b2fbe';
						purpleCtx.fillRect(0, 0, w, h);
						purpleCtx.globalCompositeOperation = 'destination-in';
						purpleCtx.drawImage(_gmMdMask, 0, 0);
						ctx.drawImage(purpleCanvas, 0, 0);
					}
					_canvasPool.release(purpleCanvas);
					ctx.restore();
					// Dashed purple border on each active magic-darkness region
					// We still draw individual borders for visual clarity (cheap operation)
					ctx.save();
					ctx.globalAlpha = 0.8;
					ctx.strokeStyle = '#a855f7';
					ctx.lineWidth = 3;
					ctx.setLineDash([8, 6]);
					ctx.beginPath();
					// Only stroke regions that haven't been fully overridden
					config.fogOfWar.regions.forEach((region: any) => {
						if (region.type === 'magic-darkness') clipFogRegion(ctx, region);
					});
					ctx.stroke();
					ctx.restore();
				}
				_canvasPool.release(_gmMdMask);
			};

			// Draw fog preview while dragging
			const drawFogPreview = (ctx: CanvasRenderingContext2D) => {
				if (!fogDragStart || !fogDragEnd) return;
				ctx.save();
				ctx.globalAlpha = 0.3;
				ctx.fillStyle = fogMode === 'reveal' ? '#00ff00' : fogMode === 'magic-darkness' ? '#6a0dad' : '#000000';
				ctx.strokeStyle = fogMode === 'reveal' ? '#00ff00' : fogMode === 'magic-darkness' ? '#9b59b6' : '#ff0000';
				ctx.lineWidth = 2;
				ctx.setLineDash([6, 3]);
				
				if (selectedFogShape === 'brush' || selectedFogShape === 'rect') {
					const x = Math.min(fogDragStart.x, fogDragEnd.x);
					const y = Math.min(fogDragStart.y, fogDragEnd.y);
					const w = Math.abs(fogDragEnd.x - fogDragStart.x);
					const h = Math.abs(fogDragEnd.y - fogDragStart.y);
					ctx.fillRect(x, y, w, h);
					ctx.strokeRect(x, y, w, h);
				} else if (selectedFogShape === 'circle') {
					const dx = fogDragEnd.x - fogDragStart.x;
					const dy = fogDragEnd.y - fogDragStart.y;
					const r = Math.sqrt(dx * dx + dy * dy);
					ctx.beginPath();
					ctx.arc(fogDragStart.x, fogDragStart.y, r, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
				}
				
				ctx.restore();
			};

			// Draw polygon preview while placing points
			const drawFogPolygonPreview = (ctx: CanvasRenderingContext2D) => {
				if (fogPolygonPoints.length === 0) return;
				ctx.save();
				ctx.globalAlpha = 0.3;
				ctx.fillStyle = fogMode === 'reveal' ? '#00ff00' : fogMode === 'magic-darkness' ? '#6a0dad' : '#000000';
				ctx.strokeStyle = fogMode === 'reveal' ? '#00ff00' : fogMode === 'magic-darkness' ? '#9b59b6' : '#ff0000';
				ctx.lineWidth = 2;
				ctx.setLineDash([6, 3]);
				
				ctx.beginPath();
				ctx.moveTo(fogPolygonPoints[0]!.x, fogPolygonPoints[0]!.y);
				for (let i = 1; i < fogPolygonPoints.length; i++) {
					ctx.lineTo(fogPolygonPoints[i]!.x, fogPolygonPoints[i]!.y);
				}
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				
				// Draw dots at each point
				ctx.globalAlpha = 0.8;
				ctx.fillStyle = fogMode === 'reveal' ? '#00ff00' : fogMode === 'magic-darkness' ? '#9b59b6' : '#ff0000';
				fogPolygonPoints.forEach(pt => {
					ctx.beginPath();
					ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
					ctx.fill();
				});
				
				ctx.restore();
			};

			// Tool switching function
			const setActiveTool = (tool: typeof activeTool) => {
				activeTool = tool;

				// Auto-switch background edit view when picking a background tool
				const bgToolViewMap: Record<string, BackgroundEditView> = {
					'walls': 'walls', 'magic-wand': 'walls',
					'lights': 'lights', 'walllight-draw': 'lights', 'fog': 'fog',
					'elevation-paint': 'elevation',
					'difficult-terrain': 'difficult-terrain',
					'env-asset': 'env-assets',
				};
				if (bgToolViewMap[tool]) {
					setBackgroundEditView(bgToolViewMap[tool]);
				}

			[panBtn, selectBtn, highlightBtn, poiBtn, markerBtn, drawBtn, eraserBtn, rulerBtn, targetDistBtn, aoeBtn, viewBtn, fogBtn, wallsBtn, lightsBtn, elevationPaintBtn, moveGridBtn, terrainPaintBtn, climatePaintBtn, setStartHexBtn, hexDescBtn, envAssetBtn].forEach(btn => btn.removeClass('active'));

				// Cancel calibration when switching tools
				if (isCalibrating) {
					isCalibrating = false;
					calibrationPoint1 = null;
					calibrationPoint2 = null;
					calibrateBtn.removeClass('active');
					measureBtn.removeClass('active');
				}

				// Cancel AoE placement when switching away
				if (tool !== 'aoe') {
					aoeOrigin = null;
					aoePreviewEnd = null;
					lastPlacedAoeId = null;
				}

				// Cancel target distance measurement when switching away
				if (tool !== 'target-distance') {
					targetDistOriginIdx = -1;
					targetDistTargetIdx = -1;
					targetDistState = 'selecting-origin';
				}

				// Cancel fog placement when switching away
				if (tool !== 'fog') {
					fogDragStart = null;
					fogDragEnd = null;
					fogPolygonPoints = [];
				}

				// Cancel eraser brush when switching away
				if (tool !== 'eraser') {
					isErasing = false;
					eraserCursorPos = null;
					eraserHadRemoval = false;
				}
				
				// Cancel wall drawing when switching away
				if (tool !== 'walls' && tool !== 'magic-wand') {
					wallPoints = [];
					wallPreviewPos = null;
				}

				// Cancel wall light drawing when switching away
				if (tool !== 'walllight-draw') {
					wallLightPoints = [];
					wallLightPreviewPos = null;
				}

				// Clear magic wand overlay when switching away
				if (tool !== 'magic-wand') {
					mwMask = null;
					mwImageDataCache = null;
				}
				
				// Show/hide color picker based on tool (with animation)
				const showColorPicker = tool === 'highlight' || tool === 'draw' || tool === 'aoe';
				colorPicker.toggleClass('hidden', !showColorPicker);
				colorSeparator.toggleClass('hidden', !showColorPicker);

				// Show/hide AoE shape picker
				togglePicker(aoePicker, tool === 'aoe');
				// Show/hide Fog shape picker
				togglePicker(fogPicker, tool === 'fog');
				// Show/hide Walls type picker
				togglePicker(wallsPicker, tool === 'walls' || tool === 'magic-wand');
				// Show/hide Magic Wand settings inside walls picker
				mwSettingsDiv.toggleClass('hidden', tool !== 'magic-wand');
				// Show/hide Lights picker
				togglePicker(lightsPicker, tool === 'lights' || tool === 'walllight-draw');
				// Show/hide Elevation Paint picker
				togglePicker(elevationPicker, tool === 'elevation-paint');
				// Show/hide Difficult Terrain picker
				togglePicker(difficultTerrainPicker, tool === 'difficult-terrain');
				// Show/hide Player View controls picker
				togglePicker(pvPicker, tool === 'player-view');
				// Show/hide Terrain picker
				togglePicker(terrainPicker, tool === 'terrain-paint');
				// Show/hide Climate picker
				togglePicker(climatePicker, tool === 'climate-paint');


				
				if (tool === 'pan') {
					panBtn.addClass('active');
					viewport.style.cursor = 'grab';
				} else if (tool === 'select') {
					selectBtn.addClass('active');
					viewport.style.cursor = 'default';
				} else if (tool === 'highlight') {
					highlightBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
			} else if (tool === 'marker') {
				markerBtn.addClass('active');
				viewport.style.cursor = 'crosshair';
				} else if (tool === 'ruler') {
					rulerBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'target-distance') {
					targetDistBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					new Notice('Token Distance: Click origin token, then target token', 3000);
				} else if (tool === 'move-grid') {
					moveGridBtn.addClass('active');
					viewport.style.cursor = 'move';
        } else if (tool === 'aoe') {
					aoeBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
        } else if (tool === 'player-view') {
          viewBtn.addClass('active');
          viewport.style.cursor = 'crosshair';
          viewport.focus(); // Focus viewport so keyboard events work
          new Notice('Player View Mode: Drag to position, Q/E or [/] to rotate 90°', 4000);
        } else if (tool === 'eraser') {
					eraserBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					eraserCursorPos = null;
					new Notice('Eraser: Click or drag to erase annotations', 3000);
        } else if (tool === 'fog') {
					fogBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'walls') {
					wallsBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					viewport.focus();
					new Notice('Walls Mode: Click to add points, Double-click to finish, Escape to cancel', 4000);
				} else if (tool === 'magic-wand') {
					wallsBtn.addClass('active');
					magicWandBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					viewport.focus();
					new Notice('Magic Wand: Click on dark areas to auto-detect and create walls. Adjust threshold/tolerance in the picker.', 5000);
				} else if (tool === 'lights') {
					lightsBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					viewport.focus();
					new Notice('Lights Mode: Click to place light source, use picker to select type', 4000);
				} else if (tool === 'walllight-draw') {
					lightsBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					viewport.focus();
					new Notice('Wall Light: Click start point, then click end point to place light strip', 4000);
				} else if (tool === 'elevation-paint') {
					elevationPaintBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					new Notice('Elevation Paint: Click or drag to set tile elevation', 3000);
				} else if (tool === 'difficult-terrain') {
					difficultTerrainBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					new Notice('Difficult Terrain: Click or drag to mark tiles. Movement costs double.', 3000);
				} else if (tool === 'poi') {
					poiBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'terrain-paint') {
					terrainPaintBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'climate-paint') {
					climatePaintBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
				} else if (tool === 'hexcrawl-move') {
					viewport.style.cursor = 'crosshair';
					hexcrawlMoveHoverHex = null; // Reset hover on tool activation
					redrawAnnotations();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					new Notice(hLoc(hcLang, 'clickHexTravel'), 3000);
				} else if (tool === 'set-start-hex') {
					setStartHexBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					new Notice(hLoc(hcLang, 'clickHexSetStart'), 3000);
				} else if (tool === 'hex-desc') {
					hexDescBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					new Notice(hLoc(hcLang, 'clickHexEditDesc'), 3000);
				} else if (tool === 'env-asset') {
					envAssetBtn.addClass('active');
					viewport.style.cursor = 'crosshair';
					new Notice('Environment Assets: Click to place, click to select, right-click for options', 4000);
				}

				// Deselect env asset instance when switching to a tool that doesn't handle them
				if (tool !== 'env-asset' && tool !== 'select') {
					selectedEnvAssetInstanceId = null;
					envAssetTransformHandle = null;
				}
			
				// Clear ruler when switching tools
				if (tool !== 'ruler' && tool !== 'poi' && annotationCanvas) {
					rulerStart = null;
					rulerEnd = null;
					rulerComplete = false;
					redrawAnnotations();
				}

				// Clear target distance when switching tools
				if (tool !== 'target-distance' && annotationCanvas) {
					if (targetDistOriginIdx >= 0 || targetDistTargetIdx >= 0) {
						targetDistOriginIdx = -1;
						targetDistTargetIdx = -1;
						targetDistState = 'selecting-origin';
						redrawAnnotations();
						if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					}
				}

				// Clear hexcrawl move overlay when switching away
				if (tool !== 'hexcrawl-move' && hexcrawlMoveHoverHex !== null) {
					hexcrawlMoveHoverHex = null;
					redrawAnnotations();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				}
			};

			// Patch the hexcrawl bridge with the real setActiveTool now that it's defined
			if (plugin._hexcrawlBridge) {
				plugin._hexcrawlBridge.setActiveTool = (tool: string) => setActiveTool(tool as any);
			}

			// Wire up tool button handlers
			panBtn.addEventListener('click', () => {
				setActiveTool('pan');
			});
			selectBtn.addEventListener('click', () => {
				setActiveTool('select');
			});
			highlightBtn.addEventListener('click', () => {
				setActiveTool('highlight');
			});
			poiBtn.addEventListener('click', () => {
				setActiveTool('poi');
			});
			markerBtn.addEventListener('click', async () => {
				// Show marker picker to select or create marker
				const { MarkerPickerModal } = await import('../marker/MarkerPickerModal');
				new MarkerPickerModal(plugin.app, plugin.markerLibrary, (markerId: string) => {
					selectedMarkerId = markerId;
					setActiveTool('marker');
				}).open();
			});
			drawBtn.addEventListener('click', () => {
				setActiveTool('draw');
			});
			rulerBtn.addEventListener('click', () => {
				setActiveTool('ruler');
			});
			targetDistBtn.addEventListener('click', () => {
				setActiveTool('target-distance');
			});
			aoeBtn.addEventListener('click', () => {
				if (activeTool === 'aoe') {
					togglePicker(aoePicker, aoePicker.hasClass('hidden'));
				} else {
					setActiveTool('aoe');
				}
			});
			eraserBtn.addEventListener('click', () => {
				setActiveTool('eraser');
			});
			fogBtn.addEventListener('click', () => {
				if (activeTool === 'fog') {
					togglePicker(fogPicker, fogPicker.hasClass('hidden'));
				} else {
					setActiveTool('fog');
				}
			});
			wallsBtn.addEventListener('click', () => {
				if (activeTool === 'walls') {
					// Toggle picker visibility if walls tool is already active
					togglePicker(wallsPicker, wallsPicker.hasClass('hidden'));
				} else {
					setActiveTool('walls');
				}
			});
			lightsBtn.addEventListener('click', () => {
				if (activeTool === 'lights') {
					togglePicker(lightsPicker, lightsPicker.hasClass('hidden'));
				} else {
					setActiveTool('lights');
				}
			});
			moveGridBtn.addEventListener('click', () => {
				setActiveTool('move-grid');
			});
			terrainPaintBtn.addEventListener('click', () => {
				if (activeTool === 'terrain-paint') {
					togglePicker(terrainPicker, terrainPicker.hasClass('hidden'));
				} else {
					setActiveTool('terrain-paint');
				}
			});
			climatePaintBtn.addEventListener('click', () => {
				if (activeTool === 'climate-paint') {
					togglePicker(climatePicker, climatePicker.hasClass('hidden'));
				} else {
					setActiveTool('climate-paint');
				}
			});
			elevationPaintBtn.addEventListener('click', () => {
				if (activeTool === 'elevation-paint') {
					togglePicker(elevationPicker, elevationPicker.hasClass('hidden'));
				} else {
					setActiveTool('elevation-paint');
				}
			});
			difficultTerrainBtn.addEventListener('click', () => {
				if (activeTool === 'difficult-terrain') {
					togglePicker(difficultTerrainPicker, difficultTerrainPicker.hasClass('hidden'));
				} else {
					setActiveTool('difficult-terrain');
				}
			});
			envAssetBtn.addEventListener('click', async () => {
				// Show env asset picker to select or create asset, then enter placement mode
				const { EnvAssetPickerModal } = await import('../envasset/EnvAssetPickerModal');
				new EnvAssetPickerModal(plugin.app, plugin.envAssetLibrary, (assetId: string) => {
					selectedEnvAssetId = assetId;
					setActiveTool('env-asset');
				}).open();
			});
			setStartHexBtn.addEventListener('click', () => {
				setActiveTool('set-start-hex');
			});
			hexDescBtn.addEventListener('click', () => {
				setActiveTool('hex-desc');
			});

		viewBtn.addEventListener('click', () => {
			if (activeTool === 'player-view') {
				togglePicker(pvPicker, pvPicker.hasClass('hidden'));
			} else {
				setActiveTool('player-view');
			}
		});
			// Hide move-grid if no grid
			if (!hasGrid) moveGridBtn.addClass('hidden');

			// Add grid overlay when media is ready
			// For images, use 'load'; for videos, use 'loadeddata' (first frame available)
			const onMediaReady = () => {
				if (config.gridType && config.gridType !== 'none' && config.gridSize) {
					redrawGridOverlays();
				}
				
				// Create terrain/climate background canvas (sits between grid overlays and annotations)
				terrainCanvas = document.createElement('canvas');
				terrainCanvas.classList.add('dnd-map-terrain-layer');
				terrainCanvas.width = img.naturalWidth;
				terrainCanvas.height = img.naturalHeight;
				terrainCanvas.style.position = 'absolute';
				terrainCanvas.style.top = '0';
				terrainCanvas.style.left = '0';
				terrainCanvas.style.width = `${img.width}px`;
				terrainCanvas.style.height = `${img.height}px`;
				terrainCanvas.style.pointerEvents = 'none';
				// Terrain/climate is Background-layer content: dim when not on Background
				terrainCanvas.style.opacity = config.activeLayer === 'Background' ? '1' : '0.25';
				mapWrapper.appendChild(terrainCanvas);

				// Create annotation canvas
				annotationCanvas = document.createElement('canvas');
				annotationCanvas.classList.add('dnd-map-annotation-layer');
				annotationCanvas.width = img.naturalWidth;
				annotationCanvas.height = img.naturalHeight;
				annotationCanvas.style.position = 'absolute';
				annotationCanvas.style.top = '0';
				annotationCanvas.style.left = '0';
				annotationCanvas.style.width = `${img.width}px`;
				annotationCanvas.style.height = `${img.height}px`;
				mapWrapper.appendChild(annotationCanvas);

				redrawTerrainLayer();
				redrawAnnotations();
				
				// Add ResizeObserver to update canvas dimensions when img resizes
				// This prevents grid distortion when window resizes
				const resizeObserver = new ResizeObserver(() => {
					// Update terrain canvas display size
					if (terrainCanvas) {
						terrainCanvas.style.width = `${img.width}px`;
						terrainCanvas.style.height = `${img.height}px`;
						redrawTerrainLayer();
					}
					// Update annotation canvas display size
					if (annotationCanvas) {
						annotationCanvas.style.width = `${img.width}px`;
						annotationCanvas.style.height = `${img.height}px`;
						redrawAnnotations();
					}
					
					// Update grid overlay display size
					if (gridCanvas) {
						gridCanvas.style.width = `${img.width}px`;
						gridCanvas.style.height = `${img.height}px`;
					}
				});
				resizeObserver.observe(img);
			};
			// Attach the handler to the appropriate event
			if (config.isVideo) {
				img.addEventListener('loadeddata', onMediaReady, { once: true });
				// If already loaded (e.g., cached), fire immediately
				if ((img as any).readyState >= 2) onMediaReady();
			} else {
				(img as HTMLImageElement).onload = onMediaReady;
			}

			// Mouse wheel zoom (always active)
			viewport.addEventListener('wheel', (e: WheelEvent) => {
				e.preventDefault();
				
				const rect = viewport.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;
				
				// Calculate position in the map before zoom
				const pointX = (mouseX - translateX) / scale;
				const pointY = (mouseY - translateY) / scale;
				
				// Update scale
				const delta = e.deltaY > 0 ? 0.9 : 1.1;
				scale = Math.max(0.05, Math.min(20, scale * delta));
				
				// Adjust translation to keep the point under the mouse
				translateX = mouseX - pointX * scale;
				translateY = mouseY - pointY * scale;
				
				updateTransform();
				zoomReset.textContent = `${Math.round(scale * 100)}%`;
			});

      // Helper: get axis-aligned bounding box size of a rotated rect (image-space)
      // Used to compute scale that fits the rotated rectangle into the player viewport
			// Tool-aware mouse handlers
			viewport.addEventListener('mousedown', (e: MouseEvent) => {
				// Ignore clicks on UI panels (toolbar, layer menu, player view button, controls)
				const target = e.target as Node;
				if (toolbarWrapper.contains(target) || playerViewBtn.contains(target) || controls.contains(target)) {
					return;
				}
				
				// Middle mouse button - temporary pan mode
				if (e.button === 1) {
					e.preventDefault();
					if (activeTool !== 'pan') {
						previousToolBeforePan = activeTool;
						isTemporaryPan = true;
					}
					isDragging = true;
					startX = e.clientX - translateX;
					startY = e.clientY - translateY;
					viewport.style.cursor = 'grabbing';
					return;
				}
				
				if (e.button !== 0) return; // Only left mouse button
				
				const mapPos = screenToMap(e.clientX, e.clientY);
				
				// Handle calibration mode (two-point measurement via Measure button)
				if (isCalibrating) {
					if (!calibrationPoint1) {
						calibrationPoint1 = { x: mapPos.x, y: mapPos.y };
						new Notice('Click second point to complete measurement');
						redrawAnnotations();
					} else {
						calibrationPoint2 = { x: mapPos.x, y: mapPos.y };
						
						// Calculate pixel distance
						const pixelDistance = Math.sqrt(
							Math.pow(calibrationPoint2.x - calibrationPoint1.x, 2) +
							Math.pow(calibrationPoint2.y - calibrationPoint1.y, 2)
						);
						
						// Reset measurement state
						isCalibrating = false;
						calibrationPoint1 = null;
						calibrationPoint2 = null;
						measureBtn.removeClass('active');
						setActiveTool('pan');
						redrawAnnotations();
						
						// Open calibration modal with the measured distance pre-filled
						new GridCalibrationModal(
							plugin.app,
							config,
							async (gs, gw, gh) => {
								saveToHistory();
								config.gridSize = gs;
								config.gridSizeW = gw;
								config.gridSizeH = gh;
								gridSlider.value = String(gs);
								gridSliderLabel.textContent = `${Math.round(gs * 10) / 10}px`;
								// Update W/H inputs
								gridWInput.value = String(Math.round((gw || gs) * 10) / 10);
								gridHInput.value = String(Math.round((gh || gs) * 10) / 10);
								gridWHLinked = !(gw && gh && gw !== gh);
								gridLinkBtn.textContent = gridWHLinked ? '🔗' : '🔓';
								gridLinkBtn.toggleClass('linked', gridWHLinked);
								redrawGridOverlays();
								redrawAnnotations();
								await plugin.saveMapAnnotations(config, el);
								new Notice('Grid calibration applied');
							},
							pixelDistance,
						).open();
					}
					e.preventDefault();
					return;
				}
				
				if (activeTool === 'pan') {
					isDragging = true;
					startX = e.clientX - translateX;
					startY = e.clientY - translateY;
					viewport.style.cursor = 'grabbing';
				} else if (activeTool === 'move-grid') {
					saveToHistory();
					isDragging = true;
					startX = e.clientX;
					startY = e.clientY;
					viewport.style.cursor = 'grabbing';
				} else if (activeTool === 'select') {
					// Check if clicking on a PoI icon (hexcrawl maps)
					if ((config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') && config.poiReferences && config.poiReferences.length > 0) {
						const hex = pixelToHex(mapPos.x, mapPos.y);
						
						// Find PoI at this hex
						const poiRef = config.poiReferences.find((ref: any) => 
							ref.col === hex.col && ref.row === hex.row
						);
						
						if (poiRef) {
							// Open PoI note in new tab
							plugin.app.workspace.openLinkText(poiRef.poiFile, '', true);
							return; // Don't check for markers/lights/walls
						}
					}
					
					// Check if clicking on a marker for drag
					let foundMarker = false;
					for (let i = config.markers.length - 1; i >= 0; i--) {
						const m = config.markers[i];
						const mDef = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
						const r = mDef ? getMarkerRadius(mDef) : 15;
						const dist = Math.sqrt(Math.pow(m.position.x - mapPos.x, 2) + Math.pow(m.position.y - mapPos.y, 2));
						if (dist <= r) {
							saveToHistory();
							draggingMarkerIndex = i;
							dragOffsetX = m.position.x - mapPos.x;
							dragOffsetY = m.position.y - mapPos.y;
							markerDragOrigin = { x: m.position.x, y: m.position.y };
							viewport.style.cursor = 'grabbing';
							foundMarker = true;
							break;
						}
					}
					// Check if clicking on an env asset for select / drag / transform
					// (checked before walls & lights so visible objects take priority)
					// Only interactable when on Background layer with matching view
					const canInteractEnvAssets = config.activeLayer === 'Background' && (backgroundEditView === 'all' || backgroundEditView === 'env-assets');
					let foundEnvAsset = false;
					if (!foundMarker && canInteractEnvAssets) {
						// First, if an env asset is already selected, check transform handles
						if (selectedEnvAssetInstanceId) {
							const selInst = (config.envAssets || []).find((a: EnvAssetInstance) => a.id === selectedEnvAssetInstanceId);
							if (selInst && !selInst.locked) {
								const handle = hitTestTransformHandle(mapPos.x, mapPos.y, selInst);
								if (handle) {
									saveToHistory();
									envAssetTransformHandle = handle;
									envAssetTransformStart = {
										x: selInst.position.x,
										y: selInst.position.y,
										w: selInst.width,
										h: selInst.height,
										rot: selInst.rotation || 0
									};
									if (handle === 'rotate') {
										envAssetRotateStart = Math.atan2(mapPos.y - selInst.position.y, mapPos.x - selInst.position.x);
									}
									if (handle === 'pivot' && selInst.doorConfig) {
										if (!selInst.doorConfig.customPivot) selInst.doorConfig.customPivot = { x: 0, y: 0.5 };
									}
									viewport.style.cursor = handle === 'rotate' ? 'grab' : handle === 'pivot' ? 'move' : 'nwse-resize';
									foundEnvAsset = true;
									e.preventDefault();
								}
							}
						}
						// Then check if clicking on an env asset body
						if (!foundEnvAsset) {
							const hitInst = findEnvAssetAtPoint(mapPos.x, mapPos.y);
							if (hitInst) {
								selectedEnvAssetInstanceId = hitInst.id;
								foundEnvAsset = true;
								if (!hitInst.locked) {
									saveToHistory();
									envAssetDragOffset = {
										x: hitInst.position.x - mapPos.x,
										y: hitInst.position.y - mapPos.y
									};
									envAssetDragOrigin = { x: hitInst.position.x, y: hitInst.position.y };
									viewport.style.cursor = 'grabbing';
								}
								redrawAnnotations();
							} else {
								// Clicked empty space — deselect env asset
								if (selectedEnvAssetInstanceId) {
									selectedEnvAssetInstanceId = null;
									redrawAnnotations();
								}
							}
						}
					}
					// Check if clicking on a light for drag (only if no marker or env asset found)
					const canInteractLights = config.activeLayer === 'Background' && (backgroundEditView === 'all' || backgroundEditView === 'lights');
					if (!foundMarker && !foundEnvAsset && canInteractLights && config.lightSources && config.lightSources.length > 0) {
						const lightClickRadius = 15; // Radius for detecting light clicks
						for (let i = config.lightSources.length - 1; i >= 0; i--) {
							const light = config.lightSources[i];
							const dist = Math.sqrt(Math.pow(light.x - mapPos.x, 2) + Math.pow(light.y - mapPos.y, 2));
							if (dist <= lightClickRadius) {
								saveToHistory();
								draggingLightIndex = i;
								lightDragOffsetX = light.x - mapPos.x;
								lightDragOffsetY = light.y - mapPos.y;
								lightDragOrigin = { x: light.x, y: light.y };
								viewport.style.cursor = 'grabbing';
								redrawAnnotations();
								break;
							}
						}
					}
					// Check if clicking on a wall/door/window for drag (only if no marker, env asset, or light found)
					const canInteractWalls = config.activeLayer === 'Background' && (backgroundEditView === 'all' || backgroundEditView === 'walls');
					if (!foundMarker && !foundEnvAsset && draggingLightIndex < 0 && canInteractWalls && config.walls && config.walls.length > 0) {
						const wallClickRadius = 12; // Radius for detecting wall clicks
						for (let i = config.walls.length - 1; i >= 0; i--) {
							const wall = config.walls[i];
							// Check distance from point to center of wall segment
							const midX = (wall.start.x + wall.end.x) / 2;
							const midY = (wall.start.y + wall.end.y) / 2;
							const dist = Math.sqrt(Math.pow(midX - mapPos.x, 2) + Math.pow(midY - mapPos.y, 2));
							
							// Also check if click is on the line segment itself
							const dx = wall.end.x - wall.start.x;
							const dy = wall.end.y - wall.start.y;
							const lengthSq = dx * dx + dy * dy;
							let t = 0;
							if (lengthSq > 0) {
								t = Math.max(0, Math.min(1, ((mapPos.x - wall.start.x) * dx + (mapPos.y - wall.start.y) * dy) / lengthSq));
							}
							const nearestX = wall.start.x + t * dx;
							const nearestY = wall.start.y + t * dy;
							const lineDist = Math.sqrt(Math.pow(mapPos.x - nearestX, 2) + Math.pow(mapPos.y - nearestY, 2));
							
							if (dist <= wallClickRadius || lineDist <= wallClickRadius) {
								saveToHistory();
								draggingWallIndex = i;
								wallDragOffsetStartX = wall.start.x - mapPos.x;
								wallDragOffsetStartY = wall.start.y - mapPos.y;
								wallDragOffsetEndX = wall.end.x - mapPos.x;
								wallDragOffsetEndY = wall.end.y - mapPos.y;
								wallClickStartPos = { x: e.clientX, y: e.clientY };
								viewport.style.cursor = 'grabbing';
								redrawAnnotations();
								break;
							}
						}
					}
					// If nothing was clicked, start a wall selection rectangle (only in walls view)
					if (!foundMarker && !foundEnvAsset && draggingLightIndex < 0 && draggingWallIndex < 0 && canInteractWalls) {
						wallSelectionRect = { startX: mapPos.x, startY: mapPos.y, endX: mapPos.x, endY: mapPos.y };
						selectedWallIndices = [];
						viewport.style.cursor = 'crosshair';
					}
				} else if (activeTool === 'highlight') {
					// Toggle grid highlight on clicked tile
					const hex = pixelToHex(mapPos.x, mapPos.y);
					const existingIndex = config.highlights.findIndex(
						(h: any) => h.col === hex.col && h.row === hex.row
					);
					saveToHistory();
					if (existingIndex >= 0) {
						config.highlights.splice(existingIndex, 1);
					} else {
						const highlight: any = {
							id: `highlight_${Date.now()}`,
							col: hex.col,
							row: hex.row,
							color: selectedColor,
							layer: config.activeLayer || 'Player'
						};
						config.highlights.push(highlight);
					}
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					updateGridToolsVisibility();
				} else if (activeTool === 'poi') {
					// Assign PoI to clicked hex
					const hex = pixelToHex(mapPos.x, mapPos.y);
					
					// Extract campaign folder (prioritize note path, fallback to map path)
					let campaignFolder = null;
					
					// Try to extract from note path first
					if (notePath) {
						const notePathParts = notePath.split('/');
						const ttrpgsIdx = notePathParts.indexOf('ttrpgs');
						if (ttrpgsIdx !== -1 && ttrpgsIdx + 1 < notePathParts.length) {
							campaignFolder = `ttrpgs/${notePathParts[ttrpgsIdx + 1]}`;
						}
					}
					
					// Fallback to map image path
					if (!campaignFolder && config.imageFile) {
						const mapPathParts = config.imageFile.split('/');
						const ttrpgsIdx = mapPathParts.indexOf('ttrpgs');
						if (ttrpgsIdx !== -1 && ttrpgsIdx + 1 < mapPathParts.length) {
							campaignFolder = `ttrpgs/${mapPathParts[ttrpgsIdx + 1]}`;
						}
					}
					
					if (!campaignFolder) {
						new Notice('⚠️ Unable to determine campaign folder. Note or map must be in ttrpgs/[campaign-name]/ structure.');
						return;
					}
					
					// Open PoI picker modal
					import('../poi/PoiModals').then(({ PoiPickerModal }) => {
						new PoiPickerModal(
							plugin.app,
							campaignFolder,
							hex,
							(poiFile: string) => {
								// Add PoI reference to map
								if (!config.poiReferences) {
									config.poiReferences = [];
								}
								
								// Check if PoI already assigned to this hex
								const existingIndex = config.poiReferences.findIndex(
									(ref: any) => ref.col === hex.col && ref.row === hex.row
								);
								
								if (existingIndex >= 0) {
									// Update existing reference
									config.poiReferences[existingIndex].poiFile = poiFile;
									config.poiReferences[existingIndex].addedAt = Date.now();
								} else {
									// Add new reference
									config.poiReferences.push({
										id: `poi_ref_${Date.now()}`,
										poiFile,
										col: hex.col,
										row: hex.row,
										layer: config.activeLayer || 'DM',
										addedAt: Date.now()
									});
								}
								
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								new Notice(hLoc(hcLang, 'poiAssigned'));
							}
						).open();
					});
					
				} else if (activeTool === 'draw') {
					isDrawing = true;
					currentPath = [{ x: mapPos.x, y: mapPos.y }];
				} else if (activeTool === 'ruler') {
					if (!rulerStart) {
						rulerStart = { x: mapPos.x, y: mapPos.y };
						rulerComplete = false;
					} else if (!rulerComplete) {
						rulerEnd = { x: mapPos.x, y: mapPos.y };
						rulerComplete = true;
						redrawAnnotations();
            // Sync ruler to player view
            if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();					
          } else {
						// Third click - clear ruler
						rulerStart = null;
						rulerEnd = null;
						rulerComplete = false;
						redrawAnnotations();
            // Sync cleared ruler to player view
            if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();				
					}
        } else if (activeTool === 'target-distance') {
					// Token-to-token distance measurement tool
					if (targetDistState === 'selecting-origin') {
						// Find marker at click position
						let foundIdx = -1;
						for (let i = config.markers.length - 1; i >= 0; i--) {
							const m = config.markers[i];
							const mDef2 = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
							const r = mDef2 ? getMarkerRadius(mDef2) : 15;
							const dist = Math.sqrt(Math.pow(m.position.x - mapPos.x, 2) + Math.pow(m.position.y - mapPos.y, 2));
							if (dist <= r) {
								foundIdx = i;
								break;
							}
						}
						if (foundIdx >= 0) {
							targetDistOriginIdx = foundIdx;
							targetDistState = 'selecting-target';
							new Notice('Now click the target token', 2000);
							redrawAnnotations();
						} else {
							new Notice('Click on a token to set as origin', 2000);
						}
					} else if (targetDistState === 'selecting-target') {
						// Find marker at click position (different from origin)
						let foundIdx = -1;
						for (let i = config.markers.length - 1; i >= 0; i--) {
							if (i === targetDistOriginIdx) continue;
							const m = config.markers[i];
							const mDef2 = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
							const r = mDef2 ? getMarkerRadius(mDef2) : 15;
							const dist = Math.sqrt(Math.pow(m.position.x - mapPos.x, 2) + Math.pow(m.position.y - mapPos.y, 2));
							if (dist <= r) {
								foundIdx = i;
								break;
							}
						}
						if (foundIdx >= 0) {
							targetDistTargetIdx = foundIdx;
							targetDistState = 'showing';
							redrawAnnotations();
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
						} else {
							// Clicked empty space — clear measurement
							targetDistOriginIdx = -1;
							targetDistTargetIdx = -1;
							targetDistState = 'selecting-origin';
							redrawAnnotations();
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
						}
					} else if (targetDistState === 'showing') {
						// Third click — clear measurement
						targetDistOriginIdx = -1;
						targetDistTargetIdx = -1;
						targetDistState = 'selecting-origin';
						redrawAnnotations();
						if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					}
        } else if (activeTool === 'marker') {
					if (!selectedMarkerId) {
						new Notice('Please select a marker first');
						return;
					}
					
					// Snap position to grid center for creature-type markers
					let placeX = mapPos.x;
					let placeY = mapPos.y;
					const mDef = plugin.markerLibrary.getMarker(selectedMarkerId);
					if (mDef && ['player', 'npc', 'creature'].includes(mDef.type) && config.gridSize) {
						const squares = CREATURE_SIZE_SQUARES[mDef.creatureSize || 'medium'] || 1;
						const snapped = snapTokenToGrid(mapPos.x, mapPos.y, squares);
						placeX = snapped.x;
						placeY = snapped.y;
					}
					
					// Create a marker reference
					const markerRef: MarkerReference = {
						id: `marker_inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
						markerId: selectedMarkerId,
						position: { x: placeX, y: placeY },
						placedAt: Date.now(),
						layer: config.activeLayer || 'Player'
					};
					
					// Auto-apply darkvision from marker definition if it exists
					if (mDef && mDef.darkvision && mDef.darkvision > 0) {
						(markerRef as any).darkvision = mDef.darkvision;
					}
					
					// Auto-apply tile ground elevation (if token is a creature on an elevated tile)
					if (mDef && ['player', 'npc', 'creature'].includes(mDef.type)) {
						applyTileElevation(markerRef);
					}
					
					saveToHistory();
					config.markers.push(markerRef);
					redrawAnnotations();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					plugin.saveMapAnnotations(config, el);
					updateGridToolsVisibility();
					refreshVisionSelector();
					new Notice('Marker placed');
				} else if (activeTool === 'env-asset') {
					// ── Env Asset: click to place, select, drag, or transform ──
					// 1) If an instance is already selected, check for transform handle grab
					if (selectedEnvAssetInstanceId) {
						const selInst = (config.envAssets || []).find((a: EnvAssetInstance) => a.id === selectedEnvAssetInstanceId);
						if (selInst && !selInst.locked) {
							const handle = hitTestTransformHandle(mapPos.x, mapPos.y, selInst);
							if (handle) {
								// Start transform operation
								saveToHistory();
								envAssetTransformHandle = handle;
								envAssetTransformStart = {
									x: selInst.position.x,
									y: selInst.position.y,
									w: selInst.width,
									h: selInst.height,
									rot: selInst.rotation || 0
								};
								if (handle === 'rotate') {
									envAssetRotateStart = Math.atan2(mapPos.y - selInst.position.y, mapPos.x - selInst.position.x);
								}
								if (handle === 'pivot' && selInst.doorConfig) {
									if (!selInst.doorConfig.customPivot) selInst.doorConfig.customPivot = { x: 0, y: 0.5 };
								}
								viewport.style.cursor = handle === 'rotate' ? 'grab' : handle === 'pivot' ? 'move' : 'nwse-resize';
								e.preventDefault();
								return;
							}
						}
					}
					// 2) Check if clicking on an instance body → start drag or select
					const hitInst = findEnvAssetAtPoint(mapPos.x, mapPos.y);
					if (hitInst) {
						if (hitInst.id !== selectedEnvAssetInstanceId) {
							// Select this instance
							selectedEnvAssetInstanceId = hitInst.id;
							redrawAnnotations();
						}
						if (!hitInst.locked) {
							// Start drag
							saveToHistory();
							envAssetDragOffset = {
								x: hitInst.position.x - mapPos.x,
								y: hitInst.position.y - mapPos.y
							};
							envAssetDragOrigin = { x: hitInst.position.x, y: hitInst.position.y };
							viewport.style.cursor = 'grabbing';
						}
					} else if (selectedEnvAssetId) {
						// Place new instance
						const assetDef = plugin.envAssetLibrary.getAsset(selectedEnvAssetId);
						if (assetDef) {
							saveToHistory();
							const newInst: EnvAssetInstance = {
								id: `envai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
								assetId: selectedEnvAssetId,
								position: { x: mapPos.x, y: mapPos.y },
								width: assetDef.defaultWidth,
								height: assetDef.defaultHeight,
								rotation: 0,
								zIndex: (config.envAssets || []).length,
								placedAt: Date.now(),
							};
							// Inherit category-specific config from definition
							if (assetDef.category === 'door' && assetDef.doorConfig) {
								newInst.doorConfig = JSON.parse(JSON.stringify(assetDef.doorConfig));
								// Migrate legacy behaviours
								const dc = newInst.doorConfig!;
								if (dc.behaviour === 'normal' || dc.behaviour === 'custom-pivot') {
									if (dc.behaviour === 'normal' && !dc.customPivot) {
										dc.customPivot = dc.pivotEdge === 'right' ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
									}
									dc.behaviour = 'pivot';
								}
								if (dc.behaviour !== 'sliding' && !dc.customPivot) {
									dc.customPivot = { x: 0, y: 0.5 };
								}
							}
							if (assetDef.category === 'scatter' && assetDef.scatterConfig) {
								newInst.scatterConfig = JSON.parse(JSON.stringify(assetDef.scatterConfig));
							}
							if (assetDef.category === 'trap' && assetDef.trapConfig) {
								newInst.trapConfig = JSON.parse(JSON.stringify(assetDef.trapConfig));
							}
							config.envAssets.push(newInst);
							selectedEnvAssetInstanceId = newInst.id;
							redrawAnnotations();
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
							plugin.saveMapAnnotations(config, el);
							new Notice(`Placed: ${assetDef.name}`);
						}
					} else {
						// No asset selected — deselect
						selectedEnvAssetInstanceId = null;
						redrawAnnotations();
					}
				} else if (activeTool === 'aoe') {
					if (!aoeOrigin && lastPlacedAoeId) {
						// Third click: remove the last placed AoE
						const idx = config.aoeEffects.findIndex((a: any) => a.id === lastPlacedAoeId);
						if (idx >= 0) {
							saveToHistory();
							config.aoeEffects.splice(idx, 1);
							redrawAnnotations();
							plugin.saveMapAnnotations(config, el);
							updateGridToolsVisibility();
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
							new Notice('AoE effect removed');
						}
						lastPlacedAoeId = null;
					} else if (!aoeOrigin) {
						// First click: set origin snapped to grid intersection (DMG rules)
						aoeOrigin = snapToGridIntersection(mapPos.x, mapPos.y);
						aoePreviewEnd = aoeOrigin;
					} else {
						// Second click: place the AoE effect
						const end = { x: mapPos.x, y: mapPos.y };
						const aoeEffect: any = {
							id: `aoe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
							shape: selectedAoeShape,
							origin: { x: aoeOrigin.x, y: aoeOrigin.y },
							end: { x: end.x, y: end.y },
							color: selectedColor,
							layer: config.activeLayer || 'Player'
						};
						// If this AoE was cast from a token, anchor it so it moves with the token
						if (pendingAoeAnchorMarkerId) {
							aoeEffect.anchorMarkerId = pendingAoeAnchorMarkerId;
							pendingAoeAnchorMarkerId = null;
						}
						lastPlacedAoeId = aoeEffect.id;
						config.aoeEffects.push(aoeEffect);
						aoeOrigin = null;
						aoePreviewEnd = null;
						redrawAnnotations();
						plugin.saveMapAnnotations(config, el);
						updateGridToolsVisibility();
						new Notice('AoE effect placed (click again to remove)');
					}
				} else if (activeTool === 'eraser') {
					// Start brush-style erasing (click + drag)
					isErasing = true;
					eraserHadRemoval = false;
					saveToHistory();
					const removedHere = eraseAtPoint(mapPos.x, mapPos.y);
					if (removedHere) {
						eraserHadRemoval = true;
						redrawAnnotations();
					}
				} else if (activeTool === 'fog') {
					if (selectedFogShape === 'polygon') {
						// Polygon: accumulate points, double-click to finish
						fogPolygonPoints.push({ x: mapPos.x, y: mapPos.y });
						redrawAnnotations();
					} else if (selectedFogShape === 'brush' || selectedFogShape === 'rect' || selectedFogShape === 'circle') {
						// Start drag
						fogDragStart = { x: mapPos.x, y: mapPos.y };
						fogDragEnd = { x: mapPos.x, y: mapPos.y };
					}
	            } else if (activeTool === 'walls') {
					// Add point to wall chain — snap to existing wall endpoints
					let snapX = mapPos.x;
					let snapY = mapPos.y;
					const wallSnapThreshold = getWallSnapThreshold();
					let bestSnapDist = wallSnapThreshold;
					if (config.walls && config.walls.length > 0) {
						for (const w of config.walls) {
							if (w.start) {
								const d = Math.sqrt((w.start.x - mapPos.x) ** 2 + (w.start.y - mapPos.y) ** 2);
								if (d < bestSnapDist) { bestSnapDist = d; snapX = w.start.x; snapY = w.start.y; }
							}
							if (w.end) {
								const d = Math.sqrt((w.end.x - mapPos.x) ** 2 + (w.end.y - mapPos.y) ** 2);
								if (d < bestSnapDist) { bestSnapDist = d; snapX = w.end.x; snapY = w.end.y; }
							}
						}
					}
					// Also snap to existing points in the current chain
					for (const wp of wallPoints) {
						const d = Math.sqrt((wp.x - mapPos.x) ** 2 + (wp.y - mapPos.y) ** 2);
						if (d < bestSnapDist) { bestSnapDist = d; snapX = wp.x; snapY = wp.y; }
					}
					wallPoints.push({ x: snapX, y: snapY });
					wallPreviewPos = { x: snapX, y: snapY };
					redrawAnnotations();
				} else if (activeTool === 'magic-wand') {
					// Magic Wand: flood-fill from click, trace boundary, generate walls
					try {
						// Cache image data on first use (expensive to read every click)
						if (!mwImageDataCache) {
							const offCanvas = document.createElement('canvas');
							offCanvas.width = img.naturalWidth;
							offCanvas.height = img.naturalHeight;
							const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
							if (!offCtx) throw new Error('No 2D context');
							offCtx.drawImage(img as HTMLImageElement, 0, 0);
							mwImageDataCache = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
						}

						const result = magicWandDetect(
							mwImageDataCache,
							mapPos.x, mapPos.y,
							mwThreshold, mwTolerance, mwSimplifyEps, mwMinSegLen, mwInvert,
						);

						// Store mask for overlay preview
						mwMask = result.mask;
						mwMaskW = mwImageDataCache.width;
						mwMaskH = mwImageDataCache.height;

						if (result.walls.length > 0) {
							saveToHistory();
							if (!config.walls) config.walls = [];
							config.walls.push(...result.walls);
							plugin.saveMapAnnotations(config, el);
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
							new Notice(`🪄 ${result.walls.length} wall segments created`);
						} else {
							new Notice('No walls detected — try clicking a dark area or adjusting threshold');
						}
						redrawAnnotations();
					} catch (err) {
						console.error('[MagicWand] Detection failed:', err);
						new Notice('Magic wand detection failed — see console for details');
					}
				} else if (activeTool === 'lights') {
					// Place light source at clicked position
					if (selectedLightSource) {
						const light = {
							x: mapPos.x,
							y: mapPos.y,
							type: selectedLightSource,
							...LIGHT_SOURCES[selectedLightSource as LightSourceType]
						};
						saveToHistory();
						config.lightSources.push(light);
						updateFlickerAnimation();
						redrawAnnotations();
						plugin.saveMapAnnotations(config, el);
						
						// Sync to player views
						if ((viewport as any)._syncPlayerView) {
							(viewport as any)._syncPlayerView();
						}
						
						new Notice(`${light.name} placed`);
					} else {
						new Notice('Please select a light source type first');
					}
				} else if (activeTool === 'walllight-draw') {
					// Wall light: two-click line drawing
					wallLightPoints.push({ x: mapPos.x, y: mapPos.y });
					if (wallLightPoints.length >= 2) {
						// Create wall light from two points
						const wlStart = wallLightPoints[0]!;
						const wlEnd = wallLightPoints[1]!;
						const wallLight: any = {
							id: `walllight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
							type: 'walllight' as LightSourceType,
							name: 'Wall Light',
							x: (wlStart.x + wlEnd.x) / 2,
							y: (wlStart.y + wlEnd.y) / 2,
							start: { x: wlStart.x, y: wlStart.y },
							end: { x: wlEnd.x, y: wlEnd.y },
							bright: LIGHT_SOURCES.walllight.bright,
							dim: LIGHT_SOURCES.walllight.dim,
							icon: '📏',
							active: true
						};
						saveToHistory();
						config.lightSources.push(wallLight);
						wallLightPoints = [];
						wallLightPreviewPos = null;
						redrawAnnotations();
						plugin.saveMapAnnotations(config, el);
						if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
						new Notice('Wall light placed');
					} else {
						wallLightPreviewPos = { x: mapPos.x, y: mapPos.y };
						redrawAnnotations();
					}
				} else if (activeTool === 'terrain-paint') {
					// Paint terrain type onto clicked hex
					const hex = pixelToHex(mapPos.x, mapPos.y);
					if (!config.hexTerrains) config.hexTerrains = [];
					const idx = config.hexTerrains.findIndex((ht: HexTerrain) => ht.col === hex.col && ht.row === hex.row);
					saveToHistory();
					if (idx >= 0) {
						if (config.hexTerrains[idx].terrain === selectedTerrainType) {
							// Clicking same terrain again removes it
							config.hexTerrains.splice(idx, 1);
						} else {
							config.hexTerrains[idx].terrain = selectedTerrainType;
						}
					} else {
						config.hexTerrains.push({ col: hex.col, row: hex.row, terrain: selectedTerrainType });
					}
					redrawTerrainLayer();
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					plugin.refreshHexcrawlView();
				} else if (activeTool === 'climate-paint') {
					// Paint climate zone onto clicked hex
					const hex = pixelToHex(mapPos.x, mapPos.y);
					if (!config.hexClimates) config.hexClimates = [];
					const idx = config.hexClimates.findIndex((hc: any) => hc.col === hex.col && hc.row === hex.row);
					saveToHistory();
					if (idx >= 0) {
						if (config.hexClimates[idx].climate === selectedClimateType) {
							// Clicking same climate again removes it
							config.hexClimates.splice(idx, 1);
						} else {
							config.hexClimates[idx].climate = selectedClimateType;
						}
					} else {
						config.hexClimates.push({ col: hex.col, row: hex.row, climate: selectedClimateType });
					}
					redrawTerrainLayer();
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					plugin.refreshHexcrawlView();
				} else if (activeTool === 'set-start-hex') {
					// Set the party's starting hex position
					const hex = pixelToHex(mapPos.x, mapPos.y);
					if (!config.hexcrawlState) {
						config.hexcrawlState = createDefaultHexcrawlState(config.mapId);
					}
					config.hexcrawlState.partyPosition = { col: hex.col, row: hex.row };
					plugin.saveMapAnnotations(config, el);
					redrawAnnotations();
					plugin.refreshHexcrawlView();
					const terrain = getTerrainDefinition(
						new HexcrawlTracker(config.hexcrawlState, config.hexTerrains || [], config.hexClimates || []).getTerrainAt(hex.col, hex.row)
					);
					new Notice(hLoc(hcLang, 'startPositionSet', { col: hex.col, row: hex.row, icon: terrain.icon, name: hLoc(hcLang, `terrain.${terrain.id}`) }));
					// Switch back to pan after placing
					setActiveTool('pan');
				} else if (activeTool === 'hex-desc') {
					// Edit per-tile custom description
					const hex = pixelToHex(mapPos.x, mapPos.y);
					if (!config.hexTerrains) config.hexTerrains = [];
					const existing = config.hexTerrains.find((ht: HexTerrain) => ht.col === hex.col && ht.row === hex.row);
					const terrainDef = getTerrainDefinition(existing?.terrain || 'plains');
					const currentDesc = existing?.customDescription;
					new HexDescriptionEditModal(
						plugin.app,
						hex.col,
						hex.row,
						`${terrainDef.icon} ${hLoc(hcLang, `terrain.${terrainDef.id}`)}`,
						currentDesc,
						(newDesc) => {
							if (!config.hexTerrains) config.hexTerrains = [];
							const idx = config.hexTerrains.findIndex((ht: HexTerrain) => ht.col === hex.col && ht.row === hex.row);
							if (idx >= 0) {
								if (newDesc) {
									config.hexTerrains[idx].customDescription = newDesc;
								} else {
									delete config.hexTerrains[idx].customDescription;
								}
							} else if (newDesc) {
								// No terrain entry yet — create one with default 'plains'
								config.hexTerrains.push({ col: hex.col, row: hex.row, terrain: 'plains', customDescription: newDesc });
							}
							plugin.saveMapAnnotations(config, el);
							redrawTerrainLayer();
							new Notice(newDesc ? hLoc(hcLang, 'descSaved', { col: hex.col, row: hex.row }) : hLoc(hcLang, 'descCleared', { col: hex.col, row: hex.row }));
						},
						hcLang,
					).open();
				} else if (activeTool === 'elevation-paint') {
					// Paint tile elevation onto clicked grid square
					const gs = config.gridSize || 70;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					const col = Math.floor((mapPos.x - ox) / gs);
					const row = Math.floor((mapPos.y - oy) / gs);
					const key = `${col},${row}`;
					saveToHistory();
					if (!config.tileElevations) config.tileElevations = {};
					if (elevationPaintValue === 0) {
						// Eraser: remove tile elevation
						delete config.tileElevations[key];
					} else {
						config.tileElevations[key] = elevationPaintValue;
					}
					isPaintingElevation = true;
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'difficult-terrain') {
					// Paint or erase difficult terrain on clicked grid square
					const gs = config.gridSize || 70;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					const col = Math.floor((mapPos.x - ox) / gs);
					const row = Math.floor((mapPos.y - oy) / gs);
					const key = `${col},${row}`;
					saveToHistory();
					if (!config.difficultTerrain) config.difficultTerrain = {};
					if (isDifficultTerrainEraser) {
						delete config.difficultTerrain[key];
					} else {
						config.difficultTerrain[key] = true;
					}
					isPaintingDifficultTerrain = true;
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'hexcrawl-move') {
					// Travel to clicked hex using per-hex procedure
					const hex = pixelToHex(mapPos.x, mapPos.y);
					const hcState = config.hexcrawlState;
					if (!hcState || !hcState.enabled) {
						new Notice(hLoc(hcLang, 'enableHexcrawlFirst'));
						return;
					}
					// Only allow moving to an adjacent hex (distance === 1)
					if (hcState.partyPosition) {
						const dist = hexDistance(hcState.partyPosition.col, hcState.partyPosition.row, hex.col, hex.row);
						if (dist !== 1) {
							new Notice(hLoc(hcLang, 'mustMoveAdjacent'));
							return;
						}
					}
					// Capture party position BEFORE travel for animation
					const prevPartyPos = hcState.partyPosition ? { col: hcState.partyPosition.col, row: hcState.partyPosition.row } : null;
					const tracker = new HexcrawlTracker(hcState, config.hexTerrains || [], config.hexClimates || []);
					if (!tracker.canMoveToday()) {
						new Notice(hLoc(hcLang, 'noMovementBudget'));
						return;
					}
					openHexProcedureModal(plugin.app, plugin, tracker, hex.col, hex.row, config.customTerrainDescriptions).then((result) => {
						if (!result || !result.completed) return; // User cancelled
						// State is already mutated inside tracker by the modal
						config.hexcrawlState = tracker.toJSON();
						// Set pending travel animation for player view
						if (prevPartyPos) {
							(viewport as any)._pendingHexcrawlTravel = {
								fromCol: prevPartyPos.col, fromRow: prevPartyPos.row,
								toCol: hex.col, toRow: hex.row
							};
						}
						plugin.saveMapAnnotations(config, el);
						plugin.refreshHexcrawlView();
						redrawAnnotations();
						(viewport as any)._syncPlayerView();
						new Notice(hLoc(hcLang, 'traveledToHex', { col: hex.col, row: hex.row }));

						// Encounter battlemap creation is now handled via button in the travel log
					});
				}
        else if (activeTool === 'player-view') {
          // Check if clicking inside existing rect to move it (accounting for rotation)
          const existingRect = (plugin as any)._gmViewRect || (viewport as any)._gmViewRect;
          isMovingGmRect = false;
          if (existingRect && existingRect.w && existingRect.h) {
            // Transform click point to rect's local coordinate system
            const rotation = existingRect.rotation || 0;
            const centerX = existingRect.x + existingRect.w / 2;
            const centerY = existingRect.y + existingRect.h / 2;

            // Translate click to be relative to center
            const relX = mapPos.x - centerX;
            const relY = mapPos.y - centerY;

            // Rotate click point by negative rotation to get local coords
            const rad = (-rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const localX = relX * cos - relY * sin;
            const localY = relX * sin + relY * cos;

            // Check if local coords are inside rect bounds
            if (Math.abs(localX) <= existingRect.w / 2 && Math.abs(localY) <= existingRect.h / 2) {
              // Move existing rect - store offset in WORLD space (center-based)
              isMovingGmRect = true;
              // Keep gmDragCurrent for consistency
              gmDragCurrent = { x: mapPos.x, y: mapPos.y };
              isDraggingGmRect = true;
              viewport.style.cursor = 'grabbing';
              // Store world-space offset from mouse to rect center so movement is rotation-independent
              const centerX = existingRect.x + existingRect.w / 2;
              const centerY = existingRect.y + existingRect.h / 2;
              (plugin as any)._gmRectDragOffsetWorld = { x: mapPos.x - centerX, y: mapPos.y - centerY };
            }
          }

          if (!isMovingGmRect) {
            // Start GM view-rect drag (create new rect)
            gmDragStart = { x: mapPos.x, y: mapPos.y };
            gmDragCurrent = { x: mapPos.x, y: mapPos.y };
            isDraggingGmRect = true;
            viewport.style.cursor = 'grabbing';
            // Reset any stored drag offsets
            (plugin as any)._gmRectDragOffset = null;
            (plugin as any)._gmRectDragOffsetWorld = null;

            // Calculate rect size and position as an unrotated footprint + rotation
            let rectW = Math.round(img.naturalWidth * 0.3);
            let rectH = Math.round(img.naturalHeight * 0.3);
            let currentRotation = 0;
            let targetScale = 1.0; // Default scale, may be updated by calibration
            // Center the rect where the user clicked
            const centerX = mapPos.x;
            const centerY = mapPos.y;
            try {
              if ((plugin as any)._playerMapViews && (plugin as any)._playerMapViews.size > 0) {
                const firstView = Array.from((plugin as any)._playerMapViews)[0] as any;
                if (firstView && firstView.mapContainer) {
                  const viewRect = firstView.mapContainer.getBoundingClientRect();
                  
                  // Use calibrated scale if available, otherwise use a reasonable default
                  const cal = plugin.settings?.tabletopCalibration;
                  
                  if (cal && cal.pixelsPerMm && config.gridSize > 0) {
                    // Calculate scale that makes grid match calibrated miniature size
                    const miniBaseMm = cal.miniBaseMm || 25;
                    targetScale = (cal.pixelsPerMm * miniBaseMm) / config.gridSize;
                  } else {
                  }
                  
                  // Rectangle dimensions: viewport size divided by target scale
                  // This ensures the rectangle fits exactly what the player will see
                  rectW = Math.max(100, Math.round(viewRect.width / targetScale));
                  rectH = Math.max(100, Math.round(viewRect.height / targetScale));
                  currentRotation = 0; // Always start at 0°, GM can rotate with Q/E keys
                  
                }
              }
            } catch (e) { console.error('[GM] rect size calculation error', e); }

            const rect = {
              x: Math.round(centerX - rectW / 2),
              y: Math.round(centerY - rectH / 2),
              w: rectW,
              h: rectH,
              rotation: currentRotation,
              targetScale: targetScale  // Store the calibrated scale for consistent zoom across rotations
            };
            try { (viewport as any)._gmViewRect = rect; } catch (e) { }
            try { (plugin as any)._gmViewRect = rect; } catch (e) { }
            redrawAnnotations();

            // Broadcast to player views (center-based approach)
            try {
              if ((plugin as any)._playerMapViews) {
                const mapId = config.mapId || resourcePath;
                (plugin as any)._playerMapViews.forEach((pv: any) => {
                  if ((pv as any).mapId !== mapId) return; // Only update views for this map
                  try {
                    // Use stored targetScale from rectangle (calibrated scale that should remain constant)
                    try {
                      const desiredScale = (rect as any).targetScale || 1.0;
                      if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(desiredScale as number);
                      else (pv as any).tabletopScale = desiredScale;
                    } catch (e) { console.error('[GM] scale set error', e); }

                    // Send rectangle center to player view (center-based approach)
                    const centerX = rect.x + rect.w / 2;
                    const centerY = rect.y + rect.h / 2;
                    if (typeof pv.setTabletopRotation === 'function') pv.setTabletopRotation(rect.rotation);
                    if (typeof pv.setTabletopPanFromImageCoords === 'function') pv.setTabletopPanFromImageCoords(centerX, centerY);
                  } catch (e) { }
                });
              }
            } catch (e) { }
          }
        }

				e.preventDefault();
			});

			viewport.addEventListener('mousemove', (e: MouseEvent) => {
				const mapPos = screenToMap(e.clientX, e.clientY);
				
				// Handle temporary pan from middle mouse button
				if (isTemporaryPan && isDragging) {
					translateX = e.clientX - startX;
					translateY = e.clientY - startY;
					updateTransform();
					return;
				}
				
				if (activeTool === 'pan' && isDragging) {
					translateX = e.clientX - startX;
					translateY = e.clientY - startY;
					updateTransform();
				} else if (activeTool === 'move-grid' && isDragging) {
					// Calculate delta in image-space pixels
					const rect = viewport.getBoundingClientRect();
					const scaleX = img.naturalWidth / img.width;
					const dx = ((e.clientX - startX) / scale) * scaleX;
					const dy = ((e.clientY - startY) / scale) * scaleX;
					config.gridOffsetX = (config.gridOffsetX || 0) + dx;
					config.gridOffsetY = (config.gridOffsetY || 0) + dy;
					startX = e.clientX;
					startY = e.clientY;
					// Lightweight: reuse canvas, just clear + redraw lines
					redrawGridOverlays();
					redrawAnnotations();
				} else if (activeTool === 'select' && draggingMarkerIndex >= 0) {
					// Dragging a marker
					const draggedMarker = config.markers[draggingMarkerIndex];
					const prevX = draggedMarker.position.x;
					const prevY = draggedMarker.position.y;
					
					// Check if marker is in a tunnel (traversing)
					if (draggedMarker.tunnelState && config.tunnels) {
						const tunnel = config.tunnels.find((t: any) => t.id === draggedMarker.tunnelState.tunnelId);
						if (tunnel && tunnel.path && tunnel.path.length > 0) {
							// Constrain movement to tunnel path
							// Find closest point on the tunnel path to the desired position
							const desiredPos = {
								x: mapPos.x + dragOffsetX,
								y: mapPos.y + dragOffsetY
							};
							
							let closestIndex = draggedMarker.tunnelState.pathIndex;
							let closestDistance = Infinity;
							
							// Search entire tunnel path since grid-snapped points may be far apart
							const startIdx = 0;
							const endIdx = tunnel.path.length - 1;
							
							for (let i = startIdx; i <= endIdx; i++) {
								const pathPoint = tunnel.path[i];
								const dx = desiredPos.x - pathPoint.x;
								const dy = desiredPos.y - pathPoint.y;
								const dist = Math.sqrt(dx * dx + dy * dy);
								
								if (dist < closestDistance) {
									closestDistance = dist;
									closestIndex = i;
								}
							}
							
							// Update pathIndex and snap to that point
							draggedMarker.tunnelState.pathIndex = closestIndex;
							draggedMarker.position = {
								x: tunnel.path[closestIndex].x,
								y: tunnel.path[closestIndex].y
							};
							// Update elevation to match tunnel path at this point
							const pathElevation = tunnel.path[closestIndex].elevation;
							if (pathElevation !== undefined) {
								if (!draggedMarker.elevation) draggedMarker.elevation = {};
								draggedMarker.elevation.depth = pathElevation;
							}
						} else {
							// Tunnel not found, allow free movement
							draggedMarker.position = {
								x: mapPos.x + dragOffsetX,
								y: mapPos.y + dragOffsetY
							};
						}
					} else {
						// Normal free movement
						draggedMarker.position = {
							x: mapPos.x + dragOffsetX,
							y: mapPos.y + dragOffsetY
						};
					}
					
					// Track tunnel path if marker is actively burrowing (creating a tunnel)
					if (draggedMarker.elevation?.isBurrowing && draggedMarker.elevation?.leaveTunnel && config.tunnels) {
						const activeTunnel = config.tunnels.find((t: any) => 
							t.creatorMarkerId === draggedMarker.id && t.active
						);
						if (activeTunnel && activeTunnel.path.length > 0) {
							// Snap path points to grid tile centers (every tile the token walks on)
							const markerDef = draggedMarker.markerId ? plugin.markerLibrary.getMarker(draggedMarker.markerId) : null;
							const sizeInSquares = markerDef?.creatureSize ? (CREATURE_SIZE_SQUARES[markerDef.creatureSize] || 1) : 1;
							const snapped = snapTokenToGrid(draggedMarker.position.x, draggedMarker.position.y, sizeInSquares);
							const snappedX = snapped.x;
							const snappedY = snapped.y;
							
							const lastPoint = activeTunnel.path[activeTunnel.path.length - 1];
							
							// Only add if we moved to a different grid cell
							if (snappedX !== lastPoint.x || snappedY !== lastPoint.y) {
								let shouldAdd = true;
								
								// Check for zig-zag (direction reversal)
								if (activeTunnel.path.length >= 2) {
									const prevPoint = activeTunnel.path[activeTunnel.path.length - 2];
									const prevDx = lastPoint.x - prevPoint.x;
									const prevDy = lastPoint.y - prevPoint.y;
									const newDx = snappedX - lastPoint.x;
									const newDy = snappedY - lastPoint.y;
									
									// Dot product < 0 means moving backwards (angle > 90°)
									const dotProduct = prevDx * newDx + prevDy * newDy;
									if (dotProduct < 0) {
										// Moving backwards - update last point instead
										lastPoint.x = snappedX;
										lastPoint.y = snappedY;
										lastPoint.elevation = draggedMarker.elevation?.depth;
										shouldAdd = false;
										
										// Regenerate tunnel walls after updating last point
										if (activeTunnel.path.length >= 2) {
										const tunnelWidth = activeTunnel.tunnelWidth || (sizeInSquares + 0.5) * config.gridSize;
										activeTunnel.walls = generateTunnelWalls(activeTunnel.path, tunnelWidth);
									}
								}
							}
							
							if (shouldAdd) {
								activeTunnel.path.push({ 
									x: snappedX, 
									y: snappedY,
									elevation: draggedMarker.elevation?.depth
								});
							}
							
							// Regenerate tunnel walls after path update
							if (activeTunnel.path.length >= 2) {
								const tunnelWidth = activeTunnel.tunnelWidth || (sizeInSquares + 0.5) * config.gridSize;
								activeTunnel.walls = generateTunnelWalls(activeTunnel.path, tunnelWidth);
							}
						}
					}
				}
				
				// Move anchored AoE effects with the marker
				const dxAoe = draggedMarker.position.x - prevX;
				const dyAoe = draggedMarker.position.y - prevY;
					if (dxAoe !== 0 || dyAoe !== 0) {
						config.aoeEffects.forEach((aoe: any) => {
							if (aoe.anchorMarkerId === draggedMarker.id) {
								aoe.origin.x += dxAoe;
								aoe.origin.y += dyAoe;
								aoe.end.x += dxAoe;
								aoe.end.y += dyAoe;
							}
						});
					}
					redrawAnnotations();
					// Sync marker position + drag ruler to player view in real-time
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				} else if (activeTool === 'select' && draggingLightIndex >= 0) {
					// Dragging a light
					const draggedLight = config.lightSources[draggingLightIndex];
					draggedLight.x = mapPos.x + lightDragOffsetX;
					draggedLight.y = mapPos.y + lightDragOffsetY;
					redrawAnnotations();
				} else if (activeTool === 'select' && draggingWallIndex >= 0) {
					// Dragging a wall/door/window
					const draggedWall = config.walls[draggingWallIndex];
					draggedWall.start.x = mapPos.x + wallDragOffsetStartX;
					draggedWall.start.y = mapPos.y + wallDragOffsetStartY;
					draggedWall.end.x = mapPos.x + wallDragOffsetEndX;
					draggedWall.end.y = mapPos.y + wallDragOffsetEndY;
					redrawAnnotations();
				} else if ((activeTool === 'select' || activeTool === 'env-asset') && selectedEnvAssetInstanceId && (envAssetTransformHandle || envAssetDragOffset)) {
					// ── Env asset drag / transform in progress (select or env-asset tool) ──
					const inst = (config.envAssets || []).find((a: EnvAssetInstance) => a.id === selectedEnvAssetInstanceId);
					if (inst) {
						if (envAssetTransformHandle === 'rotate' && envAssetTransformStart && envAssetRotateStart !== null) {
							const angle = Math.atan2(mapPos.y - inst.position.y, mapPos.x - inst.position.x);
							const delta = (angle - envAssetRotateStart) * 180 / Math.PI;
							inst.rotation = ((envAssetTransformStart.rot + delta) % 360 + 360) % 360;
							redrawAnnotations();
						} else if (envAssetTransformHandle === 'pivot' && inst.doorConfig) {
							// Drag pivot handle: convert mouse to local normalised coords
							const dxP = mapPos.x - inst.position.x;
							const dyP = mapPos.y - inst.position.y;
							const radP = -(inst.rotation || 0) * Math.PI / 180;
							const localX = dxP * Math.cos(radP) - dyP * Math.sin(radP);
							const localY = dxP * Math.sin(radP) + dyP * Math.cos(radP);
							// Normalise to 0–1 and clamp within the asset bounds
							const nx = Math.max(0, Math.min(1, (localX / inst.width) + 0.5));
							const ny = Math.max(0, Math.min(1, (localY / inst.height) + 0.5));
							if (!inst.doorConfig.customPivot) inst.doorConfig.customPivot = { x: 0, y: 0.5 };
							inst.doorConfig.customPivot.x = nx;
							inst.doorConfig.customPivot.y = ny;
							redrawAnnotations();
						} else if (envAssetTransformHandle && envAssetTransformStart) {
							// Anchored-edge resize: the opposite edge stays fixed
							const s = envAssetTransformStart;
							const dx = mapPos.x - s.x;
							const dy = mapPos.y - s.y;
							const rad = -(s.rot || 0) * Math.PI / 180;
							const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
							const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
							const hw = s.w / 2;
							const hh = s.h / 2;
							const MIN_SZ = 4;
							let newW = s.w;
							let newH = s.h;
							let localOffX = 0;
							let localOffY = 0;

							switch (envAssetTransformHandle) {
								case 'right':
									newW = Math.max(MIN_SZ, lx + hw);
									localOffX = -hw + newW / 2;
									break;
								case 'left':
									newW = Math.max(MIN_SZ, hw - lx);
									localOffX = hw - newW / 2;
									break;
								case 'bottom':
									newH = Math.max(MIN_SZ, ly + hh);
									localOffY = -hh + newH / 2;
									break;
								case 'top':
									newH = Math.max(MIN_SZ, hh - ly);
									localOffY = hh - newH / 2;
									break;
								case 'bottom-right':
									newW = Math.max(MIN_SZ, lx + hw);
									newH = Math.max(MIN_SZ, ly + hh);
									localOffX = -hw + newW / 2;
									localOffY = -hh + newH / 2;
									break;
								case 'bottom-left':
									newW = Math.max(MIN_SZ, hw - lx);
									newH = Math.max(MIN_SZ, ly + hh);
									localOffX = hw - newW / 2;
									localOffY = -hh + newH / 2;
									break;
								case 'top-right':
									newW = Math.max(MIN_SZ, lx + hw);
									newH = Math.max(MIN_SZ, hh - ly);
									localOffX = -hw + newW / 2;
									localOffY = hh - newH / 2;
									break;
								case 'top-left':
									newW = Math.max(MIN_SZ, hw - lx);
									newH = Math.max(MIN_SZ, hh - ly);
									localOffX = hw - newW / 2;
									localOffY = hh - newH / 2;
									break;
							}

							// Convert local center offset back to world space
							const fwdRad = (s.rot || 0) * Math.PI / 180;
							const worldDx2 = localOffX * Math.cos(fwdRad) - localOffY * Math.sin(fwdRad);
							const worldDy2 = localOffX * Math.sin(fwdRad) + localOffY * Math.cos(fwdRad);

							inst.width = newW;
							inst.height = newH;
							inst.position.x = s.x + worldDx2;
							inst.position.y = s.y + worldDy2;
							redrawAnnotations();
						} else if (envAssetDragOffset) {
							inst.position.x = mapPos.x + envAssetDragOffset.x;
							inst.position.y = mapPos.y + envAssetDragOffset.y;
							redrawAnnotations();
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
						}
					}
				} else if (activeTool === 'select' && wallSelectionRect) {
					// Updating wall selection rectangle
					wallSelectionRect.endX = mapPos.x;
					wallSelectionRect.endY = mapPos.y;
					redrawAnnotations();
				} else if (activeTool === 'draw' && isDrawing) {
					currentPath.push({ x: mapPos.x, y: mapPos.y });
					redrawAnnotations();
					
					// Draw temporary path
					if (annotationCanvas && currentPath.length > 1) {
						const ctx = annotationCanvas.getContext('2d');
						if (ctx) {
							const last = currentPath[currentPath.length - 1];
							const prev = currentPath[currentPath.length - 2];
							if (last && prev) {
								ctx.strokeStyle = selectedColor;
								ctx.lineWidth = 3;
								ctx.beginPath();
								ctx.moveTo(prev.x, prev.y);
								ctx.lineTo(last.x, last.y);
								ctx.stroke();
							}
						}
					}
				} else if (activeTool === 'eraser' && isErasing) {
					// Brush-style eraser: continuously delete annotations under cursor while dragging
					eraserCursorPos = { x: mapPos.x, y: mapPos.y };
					const removedHere = eraseAtPoint(mapPos.x, mapPos.y);
					if (removedHere) eraserHadRemoval = true;
					redrawAnnotations();
				} else if (activeTool === 'eraser' && !isErasing) {
					// Show eraser cursor preview even when not dragging
					eraserCursorPos = { x: mapPos.x, y: mapPos.y };
					redrawAnnotations();
				} else if (activeTool === 'ruler' && rulerStart && !rulerComplete) {
					// Show temporary ruler line (preview)
					rulerEnd = { x: mapPos.x, y: mapPos.y };
					redrawAnnotations();
				} else if (activeTool === 'aoe' && aoeOrigin) {
					// Update AoE preview
					aoePreviewEnd = { x: mapPos.x, y: mapPos.y };
					redrawAnnotations();
				} else if (activeTool === 'fog' && fogDragStart) {
					// Update fog drag preview
					fogDragEnd = { x: mapPos.x, y: mapPos.y };
					redrawAnnotations();
				} else if (activeTool === 'elevation-paint' && isPaintingElevation) {
					// Drag-paint tile elevations
					const gs = config.gridSize || 70;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					const col = Math.floor((mapPos.x - ox) / gs);
					const row = Math.floor((mapPos.y - oy) / gs);
					const key = `${col},${row}`;
					if (!config.tileElevations) config.tileElevations = {};
					if (elevationPaintValue === 0) {
						if (config.tileElevations[key] !== undefined) {
							delete config.tileElevations[key];
							redrawAnnotations();
						}
					} else {
						if (config.tileElevations[key] !== elevationPaintValue) {
							config.tileElevations[key] = elevationPaintValue;
							redrawAnnotations();
						}
					}
				} else if (activeTool === 'difficult-terrain' && isPaintingDifficultTerrain) {
					// Drag-paint difficult terrain
					const gs = config.gridSize || 70;
					const ox = config.gridOffsetX || 0;
					const oy = config.gridOffsetY || 0;
					const col = Math.floor((mapPos.x - ox) / gs);
					const row = Math.floor((mapPos.y - oy) / gs);
					const key = `${col},${row}`;
					if (!config.difficultTerrain) config.difficultTerrain = {};
					if (isDifficultTerrainEraser) {
						if (config.difficultTerrain[key]) {
							delete config.difficultTerrain[key];
							redrawAnnotations();
						}
					} else {
						if (!config.difficultTerrain[key]) {
							config.difficultTerrain[key] = true;
							redrawAnnotations();
						}
					}
				} else if (activeTool === 'walls' && wallPoints.length > 0) {
					// Update wall preview position — snap to existing wall endpoints
					let wpSnapX = mapPos.x;
					let wpSnapY = mapPos.y;
					const wpSnapThreshold = getWallSnapThreshold();
					let wpBestDist = wpSnapThreshold;
					if (config.walls && config.walls.length > 0) {
						for (const w of config.walls) {
							if (w.start) {
								const d = Math.sqrt((w.start.x - mapPos.x) ** 2 + (w.start.y - mapPos.y) ** 2);
								if (d < wpBestDist) { wpBestDist = d; wpSnapX = w.start.x; wpSnapY = w.start.y; }
							}
							if (w.end) {
								const d = Math.sqrt((w.end.x - mapPos.x) ** 2 + (w.end.y - mapPos.y) ** 2);
								if (d < wpBestDist) { wpBestDist = d; wpSnapX = w.end.x; wpSnapY = w.end.y; }
							}
						}
					}
					for (const wp of wallPoints) {
						const d = Math.sqrt((wp.x - mapPos.x) ** 2 + (wp.y - mapPos.y) ** 2);
						if (d < wpBestDist) { wpBestDist = d; wpSnapX = wp.x; wpSnapY = wp.y; }
					}
					wallPreviewPos = { x: wpSnapX, y: wpSnapY };
					(wallPreviewPos as any)._snapped = (wpBestDist < wpSnapThreshold);
					redrawAnnotations();
				} else if (activeTool === 'walllight-draw' && wallLightPoints.length > 0) {
					// Update wall light preview position
					wallLightPreviewPos = { x: mapPos.x, y: mapPos.y };
					redrawAnnotations();
        } else if (activeTool === 'hexcrawl-move') {
					// Track hovered hex for travel range overlay
					const hex = pixelToHex(mapPos.x, mapPos.y);
					if (!hexcrawlMoveHoverHex || hexcrawlMoveHoverHex.col !== hex.col || hexcrawlMoveHoverHex.row !== hex.row) {
						hexcrawlMoveHoverHex = hex;
						redrawAnnotations();
						if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					}
        } else if (activeTool === 'player-view' && isDraggingGmRect && gmDragStart) {
          // Update GM view rect as mouse moves
          gmDragCurrent = { x: mapPos.x, y: mapPos.y };
          const existingRect = (plugin as any)._gmViewRect || (viewport as any)._gmViewRect;
          let rect: any;
          
          // Check if we're moving an existing rect or creating a new one
          if (isMovingGmRect && existingRect) {
            // Moving existing rect: use WORLD-space offset so movement does not depend on rect rotation
            const off = (plugin as any)._gmRectDragOffsetWorld || { x: 0, y: 0 };
            // Rect center follows mouse minus stored world offset
            const centerX = mapPos.x - off.x;
            const centerY = mapPos.y - off.y;
            rect = {
              x: centerX - existingRect.w / 2,
              y: centerY - existingRect.h / 2,
              w: existingRect.w,
              h: existingRect.h,
              rotation: existingRect.rotation || 0,
              targetScale: existingRect.targetScale // Preserve calibrated scale during drag
            };
          } else {
            // Creating new rect by dragging corners
            const x1 = Math.min(gmDragStart.x, gmDragCurrent.x);
            const y1 = Math.min(gmDragStart.y, gmDragCurrent.y);
            const x2 = Math.max(gmDragStart.x, gmDragCurrent.x);
            const y2 = Math.max(gmDragStart.y, gmDragCurrent.y);
            rect = {
              x: Math.round(x1),
              y: Math.round(y1),
              w: Math.max(1, Math.round(x2 - x1)),
              h: Math.max(1, Math.round(y2 - y1)),
              rotation: existingRect?.rotation || 0
            };
          }
          
          try { (viewport as any)._gmViewRect = rect; } catch (e) { }
          try { (plugin as any)._gmViewRect = rect; } catch (e) { }
          redrawAnnotations();
          // Broadcast to player views (center-based approach)
          try {
            if ((plugin as any)._playerMapViews) {
              const mapId = config.mapId || resourcePath;
              (plugin as any)._playerMapViews.forEach((pv: any) => {
                if ((pv as any).mapId !== mapId) return; // Only update views for this map
                try {
                  // Use stored targetScale from rectangle (remains constant during drag)
                  try {
                    const desiredScale = (rect as any).targetScale || 1.0;
                    if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(desiredScale as number);
                    else (pv as any).tabletopScale = desiredScale;
                  } catch (e) { }

                  // Send rectangle center to player view
                  const centerX = rect.x + rect.w / 2;
                  const centerY = rect.y + rect.h / 2;
                  try { if (typeof pv.setTabletopPanFromImageCoords === 'function') pv.setTabletopPanFromImageCoords(centerX, centerY); } catch (e) { }
                } catch (e) { }
              });
            }
          } catch (e) { }
				}
			});

// Double-click to finish polygon fog region or wall chain
		viewport.addEventListener('dblclick', (e: MouseEvent) => {
			// Ignore double-clicks on UI panels
			const target = e.target as Node;
			if (toolbarWrapper.contains(target) || playerViewBtn.contains(target) || controls.contains(target)) {
				return;
			}
			if (activeTool === 'fog' && selectedFogShape === 'polygon' && fogPolygonPoints.length >= 3) {
				const region = {
					id: `fog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
					shape: 'polygon' as const,
					type: fogMode,
					points: [...fogPolygonPoints]
				};
				saveToHistory();
				config.fogOfWar.enabled = true;
				config.fogOfWar.regions.push(region);
				fogPolygonPoints = [];
				redrawAnnotations();
				plugin.saveMapAnnotations(config, el);
				new Notice(`Fog polygon ${fogMode === 'reveal' ? 'revealed' : fogMode === 'magic-darkness' ? 'shrouded in magic darkness' : 'hidden'}`);
				e.preventDefault();
				e.stopPropagation();
			} else if (activeTool === 'walls' && wallPoints.length >= 2) {
				// Finish wall chain - create wall segments
				saveToHistory();
				const wallDef = WALL_TYPES[selectedWallType];
				for (let i = 0; i < wallPoints.length - 1; i++) {
					const wall = {
						id: `wall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
						type: selectedWallType,
						name: wallDef.name,
						start: { x: wallPoints[i]!.x, y: wallPoints[i]!.y },
						end: { x: wallPoints[i + 1]!.x, y: wallPoints[i + 1]!.y },
						open: false // For doors - starts closed
					};
					config.walls.push(wall);
				}
				wallPoints = [];
				wallPreviewPos = null;
				redrawAnnotations();
				plugin.saveMapAnnotations(config, el);
				new Notice(`${wallDef.name} chain saved (${config.walls.length} total segments)`);
					e.preventDefault();
					e.stopPropagation();
				}
			});

			viewport.addEventListener('mouseup', (e: MouseEvent) => {
				// Handle middle mouse button release - restore previous tool
				if (e.button === 1 && isTemporaryPan) {
					isDragging = false;
					isTemporaryPan = false;
					if (previousToolBeforePan) {
						setActiveTool(previousToolBeforePan);
						previousToolBeforePan = null;
					}
					return;
				}
				
				if (activeTool === 'pan' && isDragging) {
					isDragging = false;
					viewport.style.cursor = 'grab';
				} else if (activeTool === 'elevation-paint' && isPaintingElevation) {
					// Finalize elevation painting drag
					isPaintingElevation = false;
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'difficult-terrain' && isPaintingDifficultTerrain) {
					// Finalize difficult terrain painting drag
					isPaintingDifficultTerrain = false;
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'fog' && fogDragStart && fogDragEnd) {
					// Finalize fog region from drag
					const dx = fogDragEnd.x - fogDragStart.x;
					const dy = fogDragEnd.y - fogDragStart.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist > 5) {
						let region: any;
						if (selectedFogShape === 'brush' || selectedFogShape === 'rect') {
							region = {
								id: `fog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
								shape: 'rect',
								type: fogMode,
								x: Math.min(fogDragStart.x, fogDragEnd.x),
								y: Math.min(fogDragStart.y, fogDragEnd.y),
								width: Math.abs(fogDragEnd.x - fogDragStart.x),
								height: Math.abs(fogDragEnd.y - fogDragStart.y)
							};
						} else if (selectedFogShape === 'circle') {
							region = {
								id: `fog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
								shape: 'circle',
								type: fogMode,
								cx: fogDragStart.x,
								cy: fogDragStart.y,
								radius: dist
							};
						}
						if (region) {
							saveToHistory();
							config.fogOfWar.enabled = true;
							config.fogOfWar.regions.push(region);
							redrawAnnotations();
							plugin.saveMapAnnotations(config, el);
							new Notice(`Fog region ${fogMode === 'reveal' ? 'revealed' : fogMode === 'magic-darkness' ? 'shrouded in magic darkness' : 'hidden'}`);
						}
					}
					fogDragStart = null;
					fogDragEnd = null;
				} else if ((activeTool === 'env-asset' || activeTool === 'select') && selectedEnvAssetInstanceId && (envAssetTransformHandle || envAssetDragOffset)) {
					// ── Env Asset: finish drag or transform ──
					envAssetTransformHandle = null;
					envAssetTransformStart = null;
					envAssetRotateStart = null;
					envAssetDragOffset = null;
					envAssetDragOrigin = null;
					viewport.style.cursor = activeTool === 'env-asset' ? 'crosshair' : 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
				} else if (activeTool === 'select' && draggingMarkerIndex >= 0) {
					// Drop marker: snap creature types to grid
					const m = config.markers[draggingMarkerIndex];
					const mDef = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
					
					// First snap the token to grid (if applicable)
					if (mDef && ['player', 'npc', 'creature'].includes(mDef.type) && config.gridSize) {
						const squares = CREATURE_SIZE_SQUARES[mDef.creatureSize || 'medium'] || 1;
						const snapped = snapTokenToGrid(m.position.x, m.position.y, squares);
						const snapDx = snapped.x - m.position.x;
						const snapDy = snapped.y - m.position.y;
						m.position.x = snapped.x;
						m.position.y = snapped.y;
						
						// Update anchored AoE effects with snap delta
						if (snapDx !== 0 || snapDy !== 0) {
							config.aoeEffects.forEach((aoe: any) => {
								if (aoe.anchorMarkerId === m.id) {
									aoe.origin.x += snapDx;
									aoe.origin.y += snapDy;
									aoe.end.x += snapDx;
									aoe.end.y += snapDy;
								}
							});
						}
						
						// Auto-apply tile ground elevation after snap
						applyTileElevation(m);
					}
					
					// THEN finalize tunnel path AFTER token is snapped
					if (m.elevation?.isBurrowing && m.elevation?.leaveTunnel && config.tunnels) {
						const activeTunnel = config.tunnels.find((t: any) => 
							t.creatorMarkerId === m.id && t.active
						);
						if (activeTunnel && activeTunnel.path.length > 0) {
							// Snap final position to grid tile center (same logic as during movement)
							const sizeInSquares = mDef?.creatureSize ? (CREATURE_SIZE_SQUARES[mDef.creatureSize] || 1) : 1;
							const snapped = snapTokenToGrid(m.position.x, m.position.y, sizeInSquares);
							const snappedX = snapped.x;
							const snappedY = snapped.y;
							
							const lastPoint = activeTunnel.path[activeTunnel.path.length - 1];
							
							// Check if adding this point would create a zig-zag (direction reversal)
							if (snappedX !== lastPoint.x || snappedY !== lastPoint.y) {
								let shouldAdd = true;
								
								if (activeTunnel.path.length >= 2) {
									const prevPoint = activeTunnel.path[activeTunnel.path.length - 2];
									// Calculate previous direction
									const prevDx = lastPoint.x - prevPoint.x;
									const prevDy = lastPoint.y - prevPoint.y;
									// Calculate new direction
									const newDx = snappedX - lastPoint.x;
									const newDy = snappedY - lastPoint.y;
									
									// Check for direction reversal (moving backwards)
									// Dot product < 0 means angle > 90°, which is moving backwards
									const dotProduct = prevDx * newDx + prevDy * newDy;
									if (dotProduct < 0) {
										// This would create a zig-zag - update last point instead of adding
										lastPoint.x = snappedX;
										lastPoint.y = snappedY;
										lastPoint.elevation = m.elevation?.depth;
										shouldAdd = false;
									}
								}
								
								if (shouldAdd) {
									activeTunnel.path.push({ x: snappedX, y: snappedY, elevation: m.elevation?.depth });
								}
							}
						}
					}
					draggingMarkerIndex = -1;
					markerDragOrigin = null;
					viewport.style.cursor = 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					// Sync to player views (includes tunnel path updates)
					if ((viewport as any)._syncPlayerView) {
						(viewport as any)._syncPlayerView();
					}
				} else if (activeTool === 'select' && draggingLightIndex >= 0) {
					// Drop light: save position
					draggingLightIndex = -1;
					lightDragOrigin = null;
					viewport.style.cursor = 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					// Sync to player views
					if ((viewport as any)._syncPlayerView) {
						(viewport as any)._syncPlayerView();
					}
				} else if (activeTool === 'select' && draggingWallIndex >= 0) {
					// Wall mouseup: check if it was a click (no drag) or an actual drag
					const clickedIdx = draggingWallIndex;
					const wasDrag = wallClickStartPos ? (
						Math.abs(e.clientX - wallClickStartPos.x) > 5 || Math.abs(e.clientY - wallClickStartPos.y) > 5
					) : true;
					
					draggingWallIndex = -1;
					wallClickStartPos = null;
					viewport.style.cursor = 'default';
					
					if (!wasDrag && config.walls && config.walls.length > 0) {
						// Click on wall without drag → select connected segment
						const connected = findConnectedWalls(clickedIdx, config.walls);
						if (connected.length > 0) {
							showWallHeightPopup(connected);
						}
					} else {
						// Actual drag → save new wall position
						redrawAnnotations();
						plugin.saveMapAnnotations(config, el);
						if ((viewport as any)._syncPlayerView) {
							(viewport as any)._syncPlayerView();
						}
					}
				} else if (activeTool === 'select' && wallSelectionRect) {
					// Finish wall selection rectangle
					const rect = wallSelectionRect;
					const minX = Math.min(rect.startX, rect.endX);
					const maxX = Math.max(rect.startX, rect.endX);
					const minY = Math.min(rect.startY, rect.endY);
					const maxY = Math.max(rect.startY, rect.endY);
					const rectWidth = maxX - minX;
					const rectHeight = maxY - minY;
					
					// Only process if rectangle is large enough (not just a click)
					if (rectWidth > 5 && rectHeight > 5 && config.walls && config.walls.length > 0) {
						// Find walls that have any part inside the selection rectangle
						const foundIndices: number[] = [];
						for (let wi = 0; wi < config.walls.length; wi++) {
							const w = config.walls[wi];
							const startInside = w.start.x >= minX && w.start.x <= maxX && w.start.y >= minY && w.start.y <= maxY;
							const endInside = w.end.x >= minX && w.end.x <= maxX && w.end.y >= minY && w.end.y <= maxY;
							const midX = (w.start.x + w.end.x) / 2;
							const midY = (w.start.y + w.end.y) / 2;
							const midInside = midX >= minX && midX <= maxX && midY >= minY && midY <= maxY;
							if (startInside || endInside || midInside) {
								foundIndices.push(wi);
							}
						}
						
						if (foundIndices.length > 0) {
							wallSelectionRect = null;
							showWallHeightPopup(foundIndices);
						} else {
							wallSelectionRect = null;
							selectedWallIndices = [];
							viewport.style.cursor = 'default';
							redrawAnnotations();
						}
					} else {
						// Click was too small, just clear selection
						wallSelectionRect = null;
						selectedWallIndices = [];
						viewport.style.cursor = 'default';
						redrawAnnotations();
					}
				} else if (activeTool === 'move-grid' && isDragging) {
					isDragging = false;
					viewport.style.cursor = 'move';
					// Final authoritative redraw + save
					redrawGridOverlays();
					plugin.saveMapAnnotations(config, el);
        } else if (activeTool === 'player-view' && isDraggingGmRect) {
          // Finish GM rect drag
          isDraggingGmRect = false;
          isMovingGmRect = false;
          viewport.style.cursor = 'crosshair';
          // Ensure rect exists on plugin + viewport
          const rect = (viewport as any)._gmViewRect || (plugin as any)._gmViewRect || null;
          if (rect) {
            try { (plugin as any)._gmViewRect = rect; } catch (e) { }
            try { (viewport as any)._gmViewRect = rect; } catch (e) { }
            // Broadcast to player views (center-based approach)
            try {
              if ((plugin as any)._playerMapViews) {
                const mapId = config.mapId || resourcePath;
                (plugin as any)._playerMapViews.forEach((pv: any) => {
                  if ((pv as any).mapId !== mapId) return; // Only update views for this map
                  try {
                    // Send rectangle center to player view (center-based approach)
                    const centerX = rect.x + rect.w / 2;
                    const centerY = rect.y + rect.h / 2;
                    if (typeof pv.setTabletopRotation === 'function') pv.setTabletopRotation(rect.rotation);
                    if (typeof pv.setTabletopPanFromImageCoords === 'function') pv.setTabletopPanFromImageCoords(centerX, centerY);
                  } catch (e) { }
                });
              }
            } catch (e) { }
          }
				} else if (activeTool === 'draw' && isDrawing) {
					isDrawing = false;
					if (currentPath.length > 2) {
						saveToHistory();
						config.drawings.push({
							id: `drawing_${Date.now()}`,
							type: 'freehand',
							points: currentPath,
							color: selectedColor,
							strokeWidth: 3,
							layer: config.activeLayer || 'Player'
						});
						plugin.saveMapAnnotations(config, el);
						updateGridToolsVisibility();
					}
					currentPath = [];
					redrawAnnotations();
				} else if (activeTool === 'eraser' && isErasing) {
					// Finalize brush eraser drag
					isErasing = false;
					if (eraserHadRemoval) {
						plugin.saveMapAnnotations(config, el);
						updateGridToolsVisibility();
						new Notice('Annotations erased');
					}
					eraserHadRemoval = false;
				}
			});

			viewport.addEventListener('mouseleave', () => {
				if (activeTool === 'pan' && isDragging) {
					isDragging = false;
					viewport.style.cursor = 'grab';
				} else if (activeTool === 'select' && draggingMarkerIndex >= 0) {
					draggingMarkerIndex = -1;
					markerDragOrigin = null;
					viewport.style.cursor = 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'select' && draggingLightIndex >= 0) {
					draggingLightIndex = -1;
					lightDragOrigin = null;
					viewport.style.cursor = 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'select' && draggingWallIndex >= 0) {
					draggingWallIndex = -1;
					viewport.style.cursor = 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				} else if ((activeTool === 'env-asset' || activeTool === 'select') && (envAssetTransformHandle || envAssetDragOffset)) {
					// Finalize env-asset drag/transform on mouseleave
					envAssetTransformHandle = null;
					envAssetTransformStart = null;
					envAssetRotateStart = null;
					envAssetDragOffset = null;
					envAssetDragOrigin = null;
					viewport.style.cursor = activeTool === 'env-asset' ? 'crosshair' : 'default';
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'move-grid' && isDragging) {
					isDragging = false;
					viewport.style.cursor = 'move';
					plugin.saveMapAnnotations(config, el);
				} else if (activeTool === 'draw' && isDrawing) {
					isDrawing = false;
					currentPath = [];
					redrawAnnotations();
				} else if (activeTool === 'eraser' && isErasing) {
					// Finalize eraser on mouseleave
					isErasing = false;
					eraserCursorPos = null;
					if (eraserHadRemoval) {
						plugin.saveMapAnnotations(config, el);
						updateGridToolsVisibility();
					}
					eraserHadRemoval = false;
					redrawAnnotations();
				} else if (activeTool === 'ruler') {
					// Clear preview line on mouseup if ruler not complete
					if (rulerStart && !rulerComplete) {
						rulerEnd = null;
						redrawAnnotations();
					}
				}
			});

			// Listen for player view rect updates from player window panning
			viewport.addEventListener('gm-rect-updated', () => {
				redrawAnnotations();
			});

			// Keyboard shortcuts for player-view rotation
			viewport.addEventListener('keydown', (e: KeyboardEvent) => {
				// Tunnel traversal with arrow keys
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
					const selectedMarkerIdx = config.markers.findIndex((m: any) => m.tunnelState);
					if (selectedMarkerIdx >= 0) {
						const marker = config.markers[selectedMarkerIdx];
						const tunnel = config.tunnels?.find((t: any) => t.id === marker.tunnelState.tunnelId);
						
						if (tunnel && tunnel.path.length > 0) {
							e.preventDefault();
							saveToHistory();
							
							let newIndex = marker.tunnelState.pathIndex;
							
							// Arrow keys move forward/backward along path
							if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
								// Move forward in tunnel
								newIndex = Math.min(tunnel.path.length - 1, newIndex + 1);
							} else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
								// Move backward in tunnel
								newIndex = Math.max(0, newIndex - 1);
							}
							
							// Update position and path index
							if (newIndex !== marker.tunnelState.pathIndex) {
								marker.tunnelState.pathIndex = newIndex;
								const newPos = tunnel.path[newIndex];
								marker.position.x = newPos.x;
								marker.position.y = newPos.y;
								// Update elevation to match tunnel path at this point
								if (newPos.elevation !== undefined) {
									if (!marker.elevation) marker.elevation = {};
									marker.elevation.depth = newPos.elevation;
								}
								const progress = Math.round((newIndex / (tunnel.path.length - 1)) * 100);
								new Notice(`Tunnel progress: ${progress}%`, 1000);
							} else if (newIndex === tunnel.path.length - 1 && (e.key === 'ArrowUp' || e.key === 'ArrowRight')) {
								// Reached end of tunnel
								new Notice('Reached tunnel exit - right-click to exit tunnel');
							} else if (newIndex === 0 && (e.key === 'ArrowDown' || e.key === 'ArrowLeft')) {
								// Reached start of tunnel
								new Notice('Reached tunnel entrance - right-click to exit tunnel');
							}
						}
					}
				}
				
				// Walls tool: Enter to finish, Escape to cancel
				if (activeTool === 'walls') {
					if (e.key === 'Enter' && wallPoints.length >= 2) {
						// Finish wall chain - create wall segments
						e.preventDefault();
						saveToHistory();
						const wallDef = WALL_TYPES[selectedWallType];
						for (let i = 0; i < wallPoints.length - 1; i++) {
							const wall = {
								id: `wall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
								type: selectedWallType,
								name: wallDef.name,
								start: { x: wallPoints[i]!.x, y: wallPoints[i]!.y },
								end: { x: wallPoints[i + 1]!.x, y: wallPoints[i + 1]!.y },
								open: false
							};
							config.walls.push(wall);
						}
						wallPoints = [];
						wallPreviewPos = null;
						redrawAnnotations();
						plugin.saveMapAnnotations(config, el);
						new Notice(`${wallDef.name} chain added (${config.walls.length} segments total)`);
					} else if (e.key === 'Escape') {
						// Cancel wall drawing
						e.preventDefault();
						wallPoints = [];
						wallPreviewPos = null;
						redrawAnnotations();
						new Notice('Wall drawing cancelled');
					}
				}
				
				if (activeTool === 'player-view') {
					const gmRect = (plugin as any)._gmViewRect || (viewport as any)._gmViewRect;
					if (!gmRect) return;
					
					if (e.key === 'q' || e.key === 'Q' || e.key === '[') {
						// Rotate counterclockwise 90 degrees - keep center fixed
						e.preventDefault();
						
						// Calculate current center
						const oldCenterX = gmRect.x + gmRect.w / 2;
						const oldCenterY = gmRect.y + gmRect.h / 2;
						
						// Update rotation (w/h stay the same, canvas rotation handles visual)
						gmRect.rotation = ((gmRect.rotation || 0) - 90 + 360) % 360;
						
						// Keep center fixed, recalculate top-left (w/h unchanged)
						gmRect.x = Math.round(oldCenterX - gmRect.w / 2);
						gmRect.y = Math.round(oldCenterY - gmRect.h / 2);
						
						// Clear drag offset so it gets recalculated on next click
						(plugin as any)._gmRectDragOffsetWorld = null;
						
						redrawAnnotations();
						
						// Broadcast rotation and position to player views
						try {
							if ((plugin as any)._playerMapViews) {
                                const mapId = config.mapId || resourcePath;
                                const centerX = gmRect.x + gmRect.w / 2;
                                const centerY = gmRect.y + gmRect.h / 2;
                (plugin as any)._playerMapViews.forEach((pv: any) => {
                  if ((pv as any).mapId !== mapId) return; // Only update views for this map
                  try {
                    // set PV scale to project GM rect into PV viewport
                    try {
                      const bounds = getRotatedRectBoundingSize(gmRect);
                      const wrap = pv?.mapContainer as HTMLElement | undefined;
                      if (wrap && bounds.w > 0 && bounds.h > 0) {
                        const r = wrap.getBoundingClientRect();
                        const desiredScale = Math.max(0.001, Math.min(100, Math.min(r.width / bounds.w, r.height / bounds.h)));
                        if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(desiredScale as number);
                        else (pv as any).tabletopScale = desiredScale;
                      }
                    } catch (e) { }

                    if (typeof pv.setTabletopRotation === 'function') {
                      pv.setTabletopRotation(gmRect.rotation);
                    }
                    if (typeof pv.setTabletopPanFromImageCoords === 'function') {
                      pv.setTabletopPanFromImageCoords(centerX, centerY);
                    }
                  } catch (e) { }
                });
							}
						} catch (e) { }
					} else if (e.key === 'e' || e.key === 'E' || e.key === ']') {
						// Rotate clockwise 90 degrees - keep center fixed
						e.preventDefault();
						
						// Calculate current center
						const oldCenterX = gmRect.x + gmRect.w / 2;
						const oldCenterY = gmRect.y + gmRect.h / 2;
						
						// Update rotation (w/h stay the same, canvas rotation handles visual)
						gmRect.rotation = ((gmRect.rotation || 0) + 90) % 360;
						
						// Keep center fixed, recalculate top-left (w/h unchanged)
						gmRect.x = Math.round(oldCenterX - gmRect.w / 2);
						gmRect.y = Math.round(oldCenterY - gmRect.h / 2);
						
						// Clear drag offset so it gets recalculated on next click
						(plugin as any)._gmRectDragOffsetWorld = null;
						
						redrawAnnotations();
						
						// Broadcast rotation and position to player views
						try {
							if ((plugin as any)._playerMapViews) {
                                const mapId = config.mapId || resourcePath;
                                const centerX = gmRect.x + gmRect.w / 2;
                                const centerY = gmRect.y + gmRect.h / 2;
                (plugin as any)._playerMapViews.forEach((pv: any) => {
                  if ((pv as any).mapId !== mapId) return; // Only update views for this map
                  try {
                    // Use stored targetScale instead of recalculating from rotated bounds
                    // The scale represents image-pixels-per-screen-pixel and should remain constant across rotations
                    try {
                      const desiredScale = (gmRect as any).targetScale || 1.0;
                      if (typeof pv.setTabletopScale === 'function') pv.setTabletopScale(desiredScale as number);
                      else (pv as any).tabletopScale = desiredScale;
                    } catch (e) { }

                    if (typeof pv.setTabletopRotation === 'function') {
                      pv.setTabletopRotation(gmRect.rotation);
                    }
                    if (typeof pv.setTabletopPanFromImageCoords === 'function') {
                      pv.setTabletopPanFromImageCoords(centerX, centerY);
                    }
                  } catch (e) { }
                });
							}
						} catch (e) { }
					}
				}
			});

			// Right-click for marker context menu
			viewport.addEventListener('contextmenu', (e: MouseEvent) => {
				// Ignore right-clicks on UI panels
				const target = e.target as Node;
				if (toolbarWrapper.contains(target) || playerViewBtn.contains(target) || controls.contains(target)) {
					return;
				}
				const mapPos = screenToMap(e.clientX, e.clientY);
				
				// Helper functions for tunnel detection
				const isNearTunnelEntrance = (position: { x: number; y: number }, gridSize: number): { tunnel: any; distance: number } | null => {
					if (!config.tunnels || config.tunnels.length === 0) return null;
					
					const threshold = gridSize * 1.5; // Proximity threshold
					let nearest: { tunnel: any; distance: number } | null = null;
					
					for (const tunnel of config.tunnels) {
						const entrance = tunnel.entrancePosition;
						const dist = Math.sqrt(Math.pow(position.x - entrance.x, 2) + Math.pow(position.y - entrance.y, 2));
						if (dist <= threshold) {
							if (!nearest || dist < nearest.distance) {
								nearest = { tunnel, distance: dist };
							}
						}
					}
					return nearest;
				};
				
				const isNearTunnelExit = (position: { x: number; y: number }, gridSize: number): { tunnel: any; distance: number } | null => {
					if (!config.tunnels || config.tunnels.length === 0) return null;
					
					const threshold = gridSize * 1.5; // Proximity threshold
					let nearest: { tunnel: any; distance: number } | null = null;
					
					for (const tunnel of config.tunnels) {
						if (tunnel.path.length > 0) {
							const exit = tunnel.path[tunnel.path.length - 1];
							const dist = Math.sqrt(Math.pow(position.x - exit.x, 2) + Math.pow(position.y - exit.y, 2));
							if (dist <= threshold) {
								if (!nearest || dist < nearest.distance) {
									nearest = { tunnel, distance: dist };
								}
							}
						}
					}
					return nearest;
				};
				
				// ── Env Asset context menu (check before markers) ──
				// Only available on Background layer with matching view
				if ((activeTool === 'env-asset' || activeTool === 'select') &&
					config.activeLayer === 'Background' &&
					(backgroundEditView === 'all' || backgroundEditView === 'env-assets')) {
					const hitEnvAsset = findEnvAssetAtPoint(mapPos.x, mapPos.y);
					if (hitEnvAsset) {
						e.preventDefault();
						selectedEnvAssetInstanceId = hitEnvAsset.id;
						redrawAnnotations();
						import('../envasset/EnvAssetContextMenu').then(({ showEnvAssetContextMenu }) => {
							const assetDef = plugin.envAssetLibrary.getAsset(hitEnvAsset.assetId);
							showEnvAssetContextMenu(
								plugin.app,
								e,
								hitEnvAsset,
								assetDef ?? undefined,
								plugin.envAssetLibrary,
								{
									onUpdate: (_inst: any) => {
										// Instance is updated in-place via the context menu; just save & redraw
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									},
									onDelete: (instId: string) => {
										saveToHistory();
										const idx = config.envAssets.findIndex((a: EnvAssetInstance) => a.id === instId);
										if (idx >= 0) config.envAssets.splice(idx, 1);
										if (selectedEnvAssetInstanceId === instId) selectedEnvAssetInstanceId = null;
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									},
									onRedraw: () => redrawAnnotations(),
									onSave: () => {
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									}
								}
							);
						});
						return; // Don't fall through to marker menu
					}
				}

				// ── Door env-asset quick menu on ANY layer (open / close) ──
				// When the GM is NOT on the Background layer, allow a mini
				// right-click menu on door assets so they can toggle open/close
				// without switching layers.
				if (config.activeLayer !== 'Background') {
					const hitDoorAsset = findEnvAssetAtPoint(mapPos.x, mapPos.y);
					if (hitDoorAsset) {
						const doorDef = plugin.envAssetLibrary.getAsset(hitDoorAsset.assetId);
						if (doorDef && doorDef.category === 'door') {
							e.preventDefault();
							// Ensure doorConfig exists
							if (!hitDoorAsset.doorConfig) {
								hitDoorAsset.doorConfig = { ...(doorDef.doorConfig || { behaviour: 'pivot' }) };
							}
							const dc = hitDoorAsset.doorConfig;
							// Migrate legacy behaviours
							if (dc.behaviour === 'normal' || dc.behaviour === 'custom-pivot') {
								if (dc.behaviour === 'normal' && !dc.customPivot) {
									dc.customPivot = (dc as any).pivotEdge === 'right' ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
								}
								dc.behaviour = 'pivot';
							}
							if (dc.behaviour !== 'sliding' && !dc.customPivot) {
								dc.customPivot = { x: 0, y: 0.5 };
							}

							const menu = new Menu();
							const doorLabel = doorDef.name ?? 'Door';
							menu.addItem(item => item.setTitle(`🚪 ${doorLabel}`).setDisabled(true));
							menu.addSeparator();
							menu.addItem(item => item
								.setTitle(dc.isOpen ? '🚪 Close Door' : '🚪 Open Door')
								.onClick(() => {
									dc.isOpen = !dc.isOpen;
									if (!dc.isOpen) {
										dc.openAngle = 0;
										if (dc.behaviour === 'sliding') dc.slidePosition = 0;
									} else {
										if (dc.behaviour !== 'sliding') {
											const dir = dc.openDirection || 1;
											dc.openAngle = dir * 90;
										}
										if (dc.behaviour === 'sliding') dc.slidePosition = 1;
									}
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								})
							);
							if (dc.behaviour !== 'sliding') {
								menu.addItem(item => item
									.setTitle('↔️ Reverse Open Direction')
									.onClick(() => {
										dc.openDirection = (dc.openDirection || 1) * -1;
										dc.openAngle = dc.openDirection * 90;
										if (!dc.isOpen) dc.isOpen = true;
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									})
								);
							}
							menu.showAtMouseEvent(e);
							return; // Don't fall through to marker menu
						}
					}
				}
				
				for (let i = config.markers.length - 1; i >= 0; i--) {
					const m = config.markers[i];
					const mDef = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
					const r = mDef ? getMarkerRadius(mDef) : 15;
					const dist = Math.sqrt(Math.pow(m.position.x - mapPos.x, 2) + Math.pow(m.position.y - mapPos.y, 2));
					if (dist <= r) {
						e.preventDefault();
						
						// Create context menu
						const contextMenu = document.createElement('div');
						contextMenu.addClass('dnd-map-context-menu');
						contextMenu.style.position = 'fixed';
						contextMenu.style.left = `${e.clientX}px`;
						contextMenu.style.top = `${e.clientY}px`;
						
						// Layer submenu header
						const layerHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
						layerHeader.textContent = 'Move to Layer:';
						
						// Layer options
						const layers: Layer[] = ['Player', 'Elevated', 'Subterranean', 'DM', 'Background'];
						const currentLayer = m.layer || 'Player';
						layers.forEach(layer => {
							const option = contextMenu.createDiv({ 
								cls: 'dnd-map-context-menu-item' + (layer === currentLayer ? ' active' : '')
							});
							const layerIcons: Record<Layer, string> = { 
								'Player': '👥', 
								'Elevated': '🦅',
								'Subterranean': '🕳️',
								'DM': '🎲', 
								'Background': '🗺️'
							};
							option.innerHTML = `<span class="layer-icon">${layerIcons[layer]}</span> ${layer}`;
							option.addEventListener('click', () => {
								m.layer = layer;
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								document.body.removeChild(contextMenu);
								new Notice(`Marker moved to ${layer} layer`);
							});
						});
						
						// Separator
						contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
						
						// Show to Players toggle (for non-player tokens)
						if (mDef && mDef.type !== 'player') {
							const visibilityRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							visibilityRow.style.cursor = 'pointer';
							const visibilityLabel = visibilityRow.createEl('span', { 
								cls: 'dnd-map-context-aoe-label', 
								text: 'Show to Players:' 
							});
							const visibilityToggle = visibilityRow.createEl('input', {
								type: 'checkbox',
								cls: 'dnd-map-visibility-checkbox'
							});
							visibilityToggle.checked = m.visibleToPlayers || false;
							visibilityToggle.addEventListener('change', (e) => {
								e.stopPropagation();
								saveToHistory();
								m.visibleToPlayers = visibilityToggle.checked;
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								new Notice(m.visibleToPlayers ? 'Token visible to players' : 'Token hidden from players');
							});
							visibilityRow.addEventListener('click', (e) => {
								if (e.target !== visibilityToggle) {
									visibilityToggle.checked = !visibilityToggle.checked;
									visibilityToggle.dispatchEvent(new Event('change'));
								}
							});
						}
						
						// AoE compact picker for player/creature/npc tokens
						if (mDef && ['player', 'npc', 'creature'].includes(mDef.type)) {
							const aoeRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							const aoeLabel = aoeRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'AoE:' });
							// Find existing anchored AoE for this token
							const existingAoeIdx = config.aoeEffects.findIndex((a: any) => a.anchorMarkerId === m.id);
							const existingAoeShape = existingAoeIdx >= 0 ? config.aoeEffects[existingAoeIdx].shape : null;
							const aoeOptions: { shape: 'circle' | 'cone' | 'square' | 'line'; icon: string; label: string }[] = [
								{ shape: 'circle', icon: '⭕', label: 'Circle' },
								{ shape: 'cone', icon: '🔺', label: 'Cone' },
								{ shape: 'square', icon: '⬜', label: 'Square' },
								{ shape: 'line', icon: '➖', label: 'Line' },
							];
							aoeOptions.forEach(({ shape, icon, label }) => {
								const btn = aoeRow.createEl('button', {
									cls: 'dnd-map-aoe-shape-btn' + (shape === existingAoeShape ? ' active' : ''),
									attr: { title: label }
								});
								btn.createEl('span', { text: icon });
								btn.addEventListener('click', () => {
									// Remove any existing anchored AoE for this token
									const oldIdx = config.aoeEffects.findIndex((a: any) => a.anchorMarkerId === m.id);
									if (oldIdx >= 0) {
										saveToHistory();
										const oldShape = config.aoeEffects[oldIdx].shape;
										config.aoeEffects.splice(oldIdx, 1);
										// If same shape clicked, just remove (toggle off)
										if (oldShape === shape) {
											redrawAnnotations();
											plugin.saveMapAnnotations(config, el);
											updateGridToolsVisibility();
											document.body.removeChild(contextMenu);
											new Notice('AoE effect removed');
											return;
										}
									}
									// Start new AoE placement
									selectedAoeShape = shape;
									aoeShapeButtons.forEach((b) => b.removeClass('active'));
									const shapeBtn = aoeShapeButtons.get(shape);
									if (shapeBtn) shapeBtn.addClass('active');
									aoeOrigin = { x: m.position.x, y: m.position.y };
									aoePreviewEnd = aoeOrigin;
									pendingAoeAnchorMarkerId = m.id;
									setActiveTool('aoe');
									document.body.removeChild(contextMenu);
									new Notice(`Place ${label}: move mouse to set size, click to confirm`);
								});
							});
							
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
						}
						
						// Light source picker for player/creature/npc tokens
						if (mDef && ['player', 'npc', 'creature'].includes(mDef.type)) {
							const lightRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							lightRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'Light:' });
							
							// Check if marker has an attached light
							const currentLight = m.light?.type || null;
							
							// Common light options for quick access
							const MARKER_QUICK_TYPES: LightSourceType[] = ['candle', 'torch', 'lantern', 'light', 'daylight', 'fluorescent'];
							const lightOptions = MARKER_QUICK_TYPES.map(type => {
								const s = LIGHT_SOURCES[type];
								return { type, icon: s.icon, label: `${s.name} (${s.bright || s.dim}ft)` };
							});
							
							// Add "Off" button
							const offBtn = lightRow.createEl('button', {
								cls: 'dnd-map-aoe-shape-btn' + (currentLight === null ? ' active' : ''),
								attr: { title: 'No Light' }
							});
							offBtn.createEl('span', { text: '❌' });
							offBtn.addEventListener('click', () => {
								saveToHistory();
								delete m.light;
								updateFlickerAnimation();
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								refreshVisionSelector();
								document.body.removeChild(contextMenu);
								new Notice('Light removed from token');
							});
							
							lightOptions.forEach(({ type, icon, label }) => {
								const btn = lightRow.createEl('button', {
									cls: 'dnd-map-aoe-shape-btn' + (type === currentLight ? ' active' : ''),
									attr: { title: label }
								});
								btn.createEl('span', { text: icon });
								btn.addEventListener('click', () => {
									saveToHistory();
									// Attach light to marker
									const lightDef = LIGHT_SOURCES[type];
									m.light = {
										type: type,
										bright: lightDef.bright,
										dim: lightDef.dim,
										name: lightDef.name
									};
									updateFlickerAnimation();
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									refreshVisionSelector();
									document.body.removeChild(contextMenu);
									new Notice(`${lightDef.name} attached to token`);
								});
							});
							
							// Light colour picker for marker-attached lights
							if (m.light) {
								const markerLightDefault = getDefaultLightColor(m.light.type);
								const mlColorRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
								mlColorRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'Light Colour:' });
								const mlColorPicker = mlColorRow.createEl('input', {
									attr: { type: 'color', value: m.light.customColor || markerLightDefault }
								});
								mlColorPicker.style.width = '60px';
								mlColorPicker.style.height = '30px';
								mlColorPicker.addEventListener('input', (e) => {
									e.stopPropagation();
									if (!m.light.customColor) saveToHistory();
									m.light.customColor = (e.target as HTMLInputElement).value;
									redrawAnnotations();
								});
								mlColorPicker.addEventListener('change', () => {
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									new Notice('Light colour updated');
								});
								mlColorPicker.addEventListener('click', (e) => e.stopPropagation());
								const mlResetBtn = mlColorRow.createEl('button', { text: 'Reset' });
								mlResetBtn.style.padding = '4px 8px';
								mlResetBtn.style.fontSize = '11px';
								mlResetBtn.style.cursor = 'pointer';
								mlResetBtn.addEventListener('click', (e) => {
									e.stopPropagation();
									saveToHistory();
									delete m.light.customColor;
									mlColorPicker.value = markerLightDefault;
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									new Notice('Light colour reset to default');
								});
							}
							
							// Darkvision input
							const darkRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							darkRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'Darkvision:' });
							const darkInput = darkRow.createEl('input', {
								cls: 'dnd-map-darkvision-input',
								attr: { 
									type: 'number', 
									min: '0', 
									max: '300',
									step: '5',
									placeholder: '0',
									value: m.darkvision || ''
								}
							});
							darkRow.createEl('span', { text: 'ft' });
							
							darkInput.addEventListener('change', () => {
								saveToHistory();
								const value = parseInt(darkInput.value) || 0;
								if (value > 0) {
									m.darkvision = value;
								} else {
									delete m.darkvision;
								}
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								refreshVisionSelector();
								new Notice(value > 0 ? `Darkvision set to ${value} ft` : 'Darkvision removed');
							});
							
							darkInput.addEventListener('click', (e) => e.stopPropagation());
							darkInput.addEventListener('keydown', (e) => {
								if (e.key === 'Enter') {
									darkInput.blur();
								}
							});
							
							// Border Color control
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							const borderHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							borderHeader.innerHTML = '🎨 Appearance';
							
							const borderRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							borderRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'Border Color:' });
							
							const borderColorPicker = borderRow.createEl('input', {
								cls: 'dnd-map-border-color-picker',
								attr: {
									type: 'color',
									value: (m as any).borderColor || mDef?.borderColor || '#ffffff'
								}
							});
							borderColorPicker.style.width = '60px';
							borderColorPicker.style.height = '30px';
							borderColorPicker.style.border = 'none';
							borderColorPicker.style.cursor = 'pointer';
							
							borderColorPicker.addEventListener('change', () => {
								saveToHistory();
								(m as any).borderColor = borderColorPicker.value;
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								new Notice('Border color updated');
							});
							
							borderColorPicker.addEventListener('click', (e) => e.stopPropagation());
							
							const borderResetBtn = borderRow.createEl('button', {
								cls: 'dnd-map-context-reset-btn',
								text: 'Reset'
							});
							borderResetBtn.style.marginLeft = '8px';
							borderResetBtn.style.padding = '4px 8px';
							borderResetBtn.style.fontSize = '11px';
							borderResetBtn.addEventListener('click', () => {
								saveToHistory();
								delete (m as any).borderColor;
								borderColorPicker.value = mDef?.borderColor || '#ffffff';
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								new Notice('Border color reset to default');
							});
							
							// Elevation controls (height and depth)
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							const elevationHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							elevationHeader.innerHTML = '↕️ Elevation';
							
							
							// Helper function to update token layer based on elevation
							// Only overrides elevation-driven layers; preserves manually-assigned layers (DM, Background)
							const updateTokenLayer = (marker: any) => {
								const elevation = marker.elevation;
								
								if (!elevation || (!elevation.height && !elevation.depth)) {
									// Only reset to Player if the token was on an elevation-driven layer
									if (marker.layer === 'Elevated' || marker.layer === 'Subterranean') {
										marker.layer = 'Player';
									}
								} else if (elevation.depth && elevation.depth > 0) {
									if (elevation.isBurrowing) {
										marker.layer = 'DM';  // Hidden from players
									} else {
										marker.layer = 'Subterranean';  // Visible but marked
									}
								} else if (elevation.height && elevation.height > 0) {
									marker.layer = 'Elevated';  // Visible with indicator
								}
							};
							
							// Height input (flying)
							const heightRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							heightRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'Height:' });
							const heightInput = heightRow.createEl('input', {
								cls: 'dnd-map-darkvision-input',
								attr: { 
									type: 'number', 
									min: '0', 
									max: '500',
									step: '5',
									placeholder: '0',
									value: m.elevation?.height || ''
								}
							});
							heightRow.createEl('span', { text: 'ft' });
							
							heightInput.addEventListener('change', () => {
								saveToHistory();
								const value = parseInt(heightInput.value) || 0;
								if (!m.elevation) m.elevation = {};
								
								if (value > 0) {
									m.elevation.height = value;
									// Clear depth when setting height
									delete m.elevation.depth;
									delete m.elevation.isBurrowing;
									depthInput.value = '';
							} else {
								delete m.elevation.height;
							}
							
							// Auto-update layer based on elevation
							updateTokenLayer(m);
							redrawAnnotations();
							plugin.saveMapAnnotations(config, el);
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
							new Notice(value > 0 ? `Token flying at ${value} ft` : 'Token returned to ground');
						});

							heightInput.addEventListener('click', (e) => e.stopPropagation());
							heightInput.addEventListener('keydown', (e) => {
								if (e.key === 'Enter') {
									heightInput.blur();
								}
							});
							
							// Depth input (burrowing)
							const depthRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							depthRow.createEl('span', { cls: 'dnd-map-context-aoe-label', text: 'Depth:' });
							const depthInput = depthRow.createEl('input', {
								cls: 'dnd-map-darkvision-input',
								attr: { 
									type: 'number', 
									min: '0', 
									max: '500',
									step: '5',
									placeholder: '0',
									value: m.elevation?.depth || ''
								}
							});
							depthRow.createEl('span', { text: 'ft' });
							
							depthInput.addEventListener('change', () => {
								saveToHistory();
								const value = parseInt(depthInput.value) || 0;
								if (!m.elevation) m.elevation = {};
								
								if (value > 0) {
									m.elevation.depth = value;
								
								// Clear height when setting depth
								delete m.elevation.height;
								heightInput.value = '';
								
								// If burrowing checkbox is checked, create/update tunnel
								if (burrowCheckbox.checked) {
									m.elevation.isBurrowing = true;
									m.elevation.leaveTunnel = true;
									
									// Create tunnel entrance if one doesn't exist
									if (!config.tunnels) config.tunnels = [];
									let tunnel = config.tunnels.find((t: any) => t.creatorMarkerId === m.id && t.active);
									if (!tunnel) {
										const gridSize = config.gridSize || 70;
										const creatureSize = mDef.creatureSize || 'medium';
										const sizeInSquares = CREATURE_SIZE_SQUARES[creatureSize] || 1;
										const tunnelWidth = (sizeInSquares + 0.5) * gridSize;
										const snapped = snapTokenToGrid(m.position.x, m.position.y, sizeInSquares);
										tunnel = {
											id: `tunnel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
											creatorMarkerId: m.id,
											entrancePosition: { x: snapped.x, y: snapped.y },
											path: [{ x: snapped.x, y: snapped.y, elevation: value }],
											creatureSize: creatureSize,
											depth: value,
											createdAt: Date.now(),
											visible: true,
											active: true,
											tunnelWidth: tunnelWidth,
											walls: []
										};
										config.tunnels.push(tunnel);
									}
								}
							} else {
								// Depth set to 0 - surface automatically and mark exit
								delete m.elevation.depth;
								delete m.elevation.isBurrowing;
								delete m.elevation.leaveTunnel;
								burrowCheckbox.checked = false;
								
								// Mark exit position and deactivate tunnel
								if (config.tunnels) {
									// Snap exit to grid tile center
									const sizeInSquares = mDef?.creatureSize ? (CREATURE_SIZE_SQUARES[mDef.creatureSize] || 1) : 1;
									const snapped = snapTokenToGrid(m.position.x, m.position.y, sizeInSquares);
									
									config.tunnels.forEach((t: any) => {
										if (t.creatorMarkerId === m.id && t.active) {
											// Add current position as exit if not already in path
											const lastPos = t.path[t.path.length - 1];
											if (!lastPos || lastPos.x !== snapped.x || lastPos.y !== snapped.y) {
												t.path.push({ x: snapped.x, y: snapped.y, elevation: 0 }); // Exit is at surface
											}
											t.active = false;
										}
									});
								}
							}
							
							// Auto-update layer based on elevation
							updateTokenLayer(m);
							redrawAnnotations();
							plugin.saveMapAnnotations(config, el);
							if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
							new Notice(value > 0 ? `Token at ${value} ft depth` : 'Token surfaced');
						});
							
							depthInput.addEventListener('click', (e) => e.stopPropagation());
							depthInput.addEventListener('keydown', (e) => {
								if (e.key === 'Enter') {
									depthInput.blur();
								}
							});
							
							// Burrowing checkbox (must be checked to create tunnels)
							const burrowRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
							const burrowLabel = burrowRow.createEl('label', { cls: 'dnd-map-context-aoe-label' });
							burrowLabel.style.display = 'flex';
							burrowLabel.style.alignItems = 'center';
							burrowLabel.style.gap = '6px';
							burrowLabel.style.cursor = 'pointer';
							const burrowCheckbox = burrowLabel.createEl('input', {
								attr: {
									type: 'checkbox',
								}
							});
							burrowCheckbox.checked = !!m.elevation?.isBurrowing;
							burrowCheckbox.style.cursor = 'pointer';
							burrowLabel.createEl('span', { text: 'Burrowing (creates tunnels)' });
							
							burrowCheckbox.addEventListener('change', () => {
								saveToHistory();
								if (!m.elevation) m.elevation = {};
								const depthValue = m.elevation.depth || 0;
								
								if (burrowCheckbox.checked && depthValue > 0) {
									// Enable burrowing — create tunnel entrance
									m.elevation.isBurrowing = true;
									m.elevation.leaveTunnel = true;
									
									if (!config.tunnels) config.tunnels = [];
									let tunnel = config.tunnels.find((t: any) => t.creatorMarkerId === m.id && t.active);
									if (!tunnel) {
										const gridSize = config.gridSize || 70;
										const creatureSize = mDef.creatureSize || 'medium';
										const sizeInSquares = CREATURE_SIZE_SQUARES[creatureSize] || 1;
										const tunnelWidth = (sizeInSquares + 0.5) * gridSize;
										const snapped = snapTokenToGrid(m.position.x, m.position.y, sizeInSquares);
										tunnel = {
											id: `tunnel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
											creatorMarkerId: m.id,
											entrancePosition: { x: snapped.x, y: snapped.y },
											path: [{ x: snapped.x, y: snapped.y, elevation: depthValue }],
											creatureSize: creatureSize,
											depth: depthValue,
											createdAt: Date.now(),
											visible: true,
											active: true,
											tunnelWidth: tunnelWidth,
											walls: []
										};
										config.tunnels.push(tunnel);
									}
									
									updateTokenLayer(m);
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									new Notice('Burrowing enabled — tunnel path will be tracked');
								} else if (burrowCheckbox.checked && depthValue <= 0) {
									// Can't burrow without depth
									burrowCheckbox.checked = false;
									new Notice('Set depth first before enabling burrowing');
								} else {
									// Disable burrowing — deactivate tunnel but keep depth
									delete m.elevation.isBurrowing;
									delete m.elevation.leaveTunnel;
									
									// Deactivate active tunnel for this marker
									if (config.tunnels) {
										const sizeInSquares = mDef?.creatureSize ? (CREATURE_SIZE_SQUARES[mDef.creatureSize] || 1) : 1;
										const snapped = snapTokenToGrid(m.position.x, m.position.y, sizeInSquares);
										
										config.tunnels.forEach((t: any) => {
											if (t.creatorMarkerId === m.id && t.active) {
												const lastPos = t.path[t.path.length - 1];
												if (!lastPos || lastPos.x !== snapped.x || lastPos.y !== snapped.y) {
													t.path.push({ x: snapped.x, y: snapped.y, elevation: 0 });
												}
												t.active = false;
											}
										});
									}
									
									updateTokenLayer(m);
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									new Notice('Burrowing disabled — depth retained (diving/submerged)');
								}
							});
							burrowCheckbox.addEventListener('click', (e) => e.stopPropagation());
							
							// Tunnel Traversal section (for following existing tunnels)
							const nearEntrance = isNearTunnelEntrance(m.position, config.gridSize);
							const nearExit = isNearTunnelExit(m.position, config.gridSize);
							const isInTunnel = m.tunnelState !== undefined;
							const isNearTunnelAccess = nearEntrance || nearExit;
							
							// Only show tunnel traversal options if near a tunnel or in a tunnel
							if (isNearTunnelAccess || isInTunnel) {
								contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
								const tunnelTraverseHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
								tunnelTraverseHeader.innerHTML = '🔦 Tunnel Navigation';
								
								const tunnelActionsRow = contextMenu.createDiv({ cls: 'dnd-map-context-aoe-row' });
								
								if (!isInTunnel && isNearTunnelAccess) {
									// Show "Enter Tunnel" button
									const enterBtn = tunnelActionsRow.createEl('button', {
										cls: 'dnd-map-burrow-action-btn',
										text: '🚪 Enter Tunnel'
									});
									
									enterBtn.addEventListener('click', () => {
										saveToHistory();
										const nearestTunnel = nearEntrance || nearExit;
										if (nearestTunnel) {
											// Check if token is small enough to enter tunnel
											const CREATURE_SIZE_SQUARES: Record<string, number> = {
												'tiny': 0.5, 'small': 1, 'medium': 1, 'large': 2, 'huge': 3, 'gargantuan': 4
											};
											const tokenSize = CREATURE_SIZE_SQUARES[mDef.creatureSize || 'medium'] || 1;
											const tunnelCreatureSize = nearestTunnel.tunnel.creatureSize || 'medium';
											const tunnelSize = CREATURE_SIZE_SQUARES[tunnelCreatureSize] || 1;
											
											// Token must be <= tunnel creator size to enter
											if (tokenSize > tunnelSize) {
												new Notice(`This tunnel is too small! Created by ${tunnelCreatureSize} creature, token is ${mDef.creatureSize || 'medium'}`);
												document.body.removeChild(contextMenu);
												return;
											}
											
											// Set tunnel state
											m.tunnelState = {
												tunnelId: nearestTunnel.tunnel.id,
												pathIndex: nearEntrance ? 0 : nearestTunnel.tunnel.path.length - 1,
												enteredAt: Date.now()
											};
											
											// Snap token to tunnel entrance/exit
											const snapPoint = nearEntrance 
												? nearestTunnel.tunnel.entrancePosition 
												: nearestTunnel.tunnel.path[nearestTunnel.tunnel.path.length - 1];
											m.position.x = snapPoint.x;
											m.position.y = snapPoint.y;
											
											// Set depth to match tunnel depth (inherit from tunnel creator)
											if (!m.elevation) m.elevation = {};
											// Mark that this depth was set by tunnel (so we can clear it on exit)
											m.elevation._tunnelDepth = nearestTunnel.tunnel.depth || 10; // Default 10ft if not specified
											m.elevation.depth = m.elevation._tunnelDepth;
											
											// Move to Subterranean layer (visible but marked as underground)
											m.layer = 'Subterranean';
											
											redrawAnnotations();
											plugin.saveMapAnnotations(config, el);
											if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
											document.body.removeChild(contextMenu);
											new Notice('Entered tunnel - use arrow keys to navigate');
										}
									});
								}
								
								if (isInTunnel) {
									// Check if token is at entrance or exit of the tunnel
									const tunnel = config.tunnels?.find((t: any) => t.id === m.tunnelState.tunnelId);
									const isAtEntranceOrExit = tunnel && (
										m.tunnelState.pathIndex === 0 || 
										m.tunnelState.pathIndex === tunnel.path.length - 1
									);
									
									if (isAtEntranceOrExit) {
										// Show "Exit Tunnel" button
										const exitBtn = tunnelActionsRow.createEl('button', {
											cls: 'dnd-map-burrow-action-btn active',
											text: '🚪 Exit Tunnel'
										});
										
										exitBtn.addEventListener('click', () => {
											saveToHistory();
											delete m.tunnelState;
											
											// Clear tunnel-assigned depth (but keep manually set depth)
											if (m.elevation && m.elevation._tunnelDepth) {
												delete m.elevation.depth;
												delete m.elevation._tunnelDepth;
												// If no other elevation properties, remove elevation object
												if (!m.elevation.height && !m.elevation.isBurrowing) {
													delete m.elevation;
												}
											}
											
											m.layer = 'Player';
											
											redrawAnnotations();
											plugin.saveMapAnnotations(config, el);
											if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
											document.body.removeChild(contextMenu);
											new Notice('Exited tunnel');
										});
									} else {
										// Show disabled message
										const statusText = tunnelActionsRow.createEl('span', {
											cls: 'dnd-map-context-aoe-label',
											text: 'Move to entrance/exit to leave tunnel'
										});
										statusText.style.fontStyle = 'italic';
										statusText.style.color = '#888';
									}
								}
							}
							
							// Token Auras section
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							const auraHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							auraHeader.innerHTML = '🔵 Token Auras';
							
							// Initialize auras array if needed
							if (!m.auras) m.auras = [];
							
							// Render existing auras
							const aurasContainer = contextMenu.createDiv({ cls: 'dnd-map-auras-container' });
							
							const renderAurasList = () => {
								aurasContainer.empty();
								m.auras.forEach((aura: any, auraIdx: number) => {
									const auraRow = aurasContainer.createDiv({ cls: 'dnd-map-aura-row' });
									
									// Radius input
									const radiusInput = auraRow.createEl('input', {
										cls: 'dnd-map-aura-radius',
										attr: { type: 'number', min: '5', max: '120', step: '5', value: aura.radius || '10', title: 'Radius (ft)' }
									});
									auraRow.createEl('span', { text: 'ft' });
									
									// Color picker
									const colorInput = auraRow.createEl('input', {
										cls: 'dnd-map-aura-color',
										attr: { type: 'color', value: aura.color || '#ffcc00', title: 'Aura color' }
									});
									
									// Delete button
									const deleteBtn = auraRow.createEl('button', { cls: 'dnd-map-aura-delete', attr: { title: 'Remove aura' } });
									deleteBtn.textContent = '✕';
									
									// Event handlers
									radiusInput.addEventListener('change', () => {
										saveToHistory();
										aura.radius = parseInt(radiusInput.value) || 10;
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									});
									
									colorInput.addEventListener('change', () => {
										saveToHistory();
										aura.color = colorInput.value;
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									});
									
									deleteBtn.addEventListener('click', (e) => {
										e.stopPropagation();
										saveToHistory();
										m.auras.splice(auraIdx, 1);
										renderAurasList();
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									});
									
									// Prevent menu close on input click
									radiusInput.addEventListener('click', (e) => e.stopPropagation());
									colorInput.addEventListener('click', (e) => e.stopPropagation());
								});
							};
							renderAurasList();
							
							// Add aura button
							const addAuraBtn = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
							addAuraBtn.innerHTML = '<span>➕</span> Add Aura';
							addAuraBtn.addEventListener('click', (e) => {
								e.stopPropagation();
								saveToHistory();
								m.auras.push({ radius: 10, color: '#ffcc00', opacity: 0.25 });
								renderAurasList();
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
							});
							
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
						}
						
						// Delete option
						const deleteOption = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item delete' });
						deleteOption.innerHTML = `<span>🗑️</span> Delete`;
						deleteOption.addEventListener('click', () => {
							saveToHistory();
							config.markers.splice(i, 1);
							redrawAnnotations();
							plugin.saveMapAnnotations(config, el);
							updateGridToolsVisibility();
							refreshVisionSelector();
							document.body.removeChild(contextMenu);
							new Notice('Marker removed');
						});
						
						// Add to body and remove on outside click
						document.body.appendChild(contextMenu);

						// Center on viewport after appending (so we know menu dimensions)
						const menuRect = contextMenu.getBoundingClientRect();
						const viewportWidth = window.innerWidth;
						const viewportHeight = window.innerHeight;
						const centerLeft = Math.max(10, (viewportWidth - menuRect.width) / 2);
						const centerTop = Math.max(10, (viewportHeight - menuRect.height) / 2);
						contextMenu.style.left = `${centerLeft}px`;
						contextMenu.style.top = `${centerTop}px`;

						const removeMenu = (event: MouseEvent) => {
							if (!contextMenu.contains(event.target as Node)) {
								document.body.removeChild(contextMenu);
								document.removeEventListener('click', removeMenu);
							}
						};
						setTimeout(() => document.addEventListener('click', removeMenu), 10);
						
						return;
					}
				}
				
				// Check if right-clicking on a light source (only in lights view)
				if (config.activeLayer === 'Background' && (backgroundEditView === 'all' || backgroundEditView === 'lights') && config.lightSources && config.lightSources.length > 0) {
					const lightClickRadius = 15;
					for (let i = config.lightSources.length - 1; i >= 0; i--) {
						const light = config.lightSources[i];
						let hitLight = false;
						if (light.start && light.end && light.type === 'walllight') {
							// Wall light: check distance to line segment
							const lx = light.end.x - light.start.x;
							const ly = light.end.y - light.start.y;
							const lenSq = lx * lx + ly * ly;
							let t = lenSq === 0 ? 0 : ((mapPos.x - light.start.x) * lx + (mapPos.y - light.start.y) * ly) / lenSq;
							t = Math.max(0, Math.min(1, t));
							const px = light.start.x + t * lx;
							const py = light.start.y + t * ly;
							const lineDist = Math.sqrt(Math.pow(px - mapPos.x, 2) + Math.pow(py - mapPos.y, 2));
							hitLight = lineDist <= lightClickRadius;
						} else {
							const dist = Math.sqrt(Math.pow(light.x - mapPos.x, 2) + Math.pow(light.y - mapPos.y, 2));
							hitLight = dist <= lightClickRadius;
						}
						if (hitLight) {
							e.preventDefault();
							
							// Create light context menu
							const contextMenu = document.createElement('div');
							contextMenu.addClass('dnd-map-context-menu');
							contextMenu.style.position = 'fixed';
							contextMenu.style.left = `${e.clientX}px`;
							contextMenu.style.top = `${e.clientY}px`;
							
							// Light name header
							const header = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							header.textContent = light.name || 'Light Source';
							
							// Active/Inactive toggle
							const isActive = light.active !== false;
							const toggleOption = contextMenu.createDiv({ 
								cls: 'dnd-map-context-menu-item'
							});
							toggleOption.innerHTML = isActive 
								? `<span>🔆</span> Active (click to extinguish)`
								: `<span>💡</span> Inactive (click to ignite)`;
							toggleOption.addEventListener('click', () => {
								saveToHistory();
								light.active = !isActive;
								updateFlickerAnimation();
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								document.body.removeChild(contextMenu);
								new Notice(light.active ? `${light.name || 'Light'} lit` : `${light.name || 'Light'} extinguished`);
							});
							
							// Separator
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							
							if (light.type === 'walllight') {
								// Wall light: show bright/dim radius editors
								const radiusHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
								radiusHeader.textContent = 'Light Radius (ft):';
								
								// Bright radius
								const brightRow = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
								brightRow.style.display = 'flex';
								brightRow.style.alignItems = 'center';
								brightRow.style.gap = '8px';
								brightRow.style.padding = '8px';
								brightRow.createEl('span', { text: 'Bright:' }).style.fontSize = '12px';
								const brightInput = brightRow.createEl('input', {
									attr: { type: 'number', min: '0', max: '120', step: '5', value: String(light.bright || 15) }
								});
								brightInput.style.width = '60px';
								brightInput.style.textAlign = 'center';
								brightInput.addEventListener('click', (e) => e.stopPropagation());
								brightInput.addEventListener('change', () => {
									light.bright = Math.max(0, parseInt(brightInput.value) || 0);
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								});
								
								// Dim radius
								const dimRow = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
								dimRow.style.display = 'flex';
								dimRow.style.alignItems = 'center';
								dimRow.style.gap = '8px';
								dimRow.style.padding = '8px';
								dimRow.createEl('span', { text: 'Dim:' }).style.fontSize = '12px';
								const dimInput = dimRow.createEl('input', {
									attr: { type: 'number', min: '0', max: '120', step: '5', value: String(light.dim || 15) }
								});
								dimInput.style.width = '60px';
								dimInput.style.textAlign = 'center';
								dimInput.addEventListener('click', (e) => e.stopPropagation());
								dimInput.addEventListener('change', () => {
									light.dim = Math.max(0, parseInt(dimInput.value) || 0);
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								});
							} else {
							// Change light type header
							const typeHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							typeHeader.textContent = 'Change Type:';
							
							// Light type options (derived from canonical catalogue)
							const lightTypes = PLACEABLE_LIGHT_TYPES.map(type => {
								const s = LIGHT_SOURCES[type];
								const range = s.bright > 0 ? `${s.bright}ft` : `${s.dim}ft dim`;
								return { type, icon: s.icon, name: `${s.name} (${range})` };
							});
							
							lightTypes.forEach(({ type, icon, name }) => {
								const option = contextMenu.createDiv({ 
									cls: 'dnd-map-context-menu-item' + (light.type === type ? ' active' : '')
								});
								option.innerHTML = `<span>${icon}</span> ${name}`;
								option.addEventListener('click', () => {
									saveToHistory();
									const lightDef = LIGHT_SOURCES[type];
									light.type = type;
									light.bright = lightDef.bright;
									light.dim = lightDef.dim;
									light.name = lightDef.name;
									light.cone = 'cone' in lightDef ? lightDef.cone : false;
									updateFlickerAnimation();
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									document.body.removeChild(contextMenu);
									new Notice(`Changed to ${lightDef.name}`);
								});
							});
							
							// Direction control for cone lights (bullseye lantern)
							if (light.cone) {
								contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
								
								const dirHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
								dirHeader.textContent = 'Aim Direction:';
								
								// Direction preset buttons (compass directions)
								const dirPresets = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
								dirPresets.style.display = 'flex';
								dirPresets.style.justifyContent = 'space-around';
								dirPresets.style.padding = '8px 4px';
								
								const directions = [
									{ label: '↑', angle: -90, title: 'North' },
									{ label: '→', angle: 0, title: 'East' },
									{ label: '↓', angle: 90, title: 'South' },
									{ label: '←', angle: 180, title: 'West' },
								];
								
								directions.forEach(({ label, angle, title }) => {
									const btn = dirPresets.createEl('button', { text: label });
									btn.title = title;
									btn.style.width = '32px';
									btn.style.height = '32px';
									btn.style.fontSize = '16px';
									btn.style.cursor = 'pointer';
									btn.style.border = (light.direction || 0) === angle ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
									btn.style.borderRadius = '4px';
									btn.style.background = 'var(--background-secondary)';
									btn.addEventListener('click', (e) => {
										e.stopPropagation();
										light.direction = angle;
										redrawAnnotations();
										plugin.saveMapAnnotations(config, el);
										if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
										// Update button styles
										dirPresets.querySelectorAll('button').forEach((b: HTMLButtonElement) => {
											b.style.border = '1px solid var(--background-modifier-border)';
										});
										btn.style.border = '2px solid var(--interactive-accent)';
									});
								});
								
								// Fine rotation slider
								const sliderContainer = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
								sliderContainer.style.display = 'flex';
								sliderContainer.style.alignItems = 'center';
								sliderContainer.style.gap = '8px';
								sliderContainer.style.padding = '8px';
								
								const sliderLabel = sliderContainer.createEl('span', { text: '🔄' });
								sliderLabel.style.fontSize = '14px';
								
								const slider = sliderContainer.createEl('input');
								slider.type = 'range';
								slider.min = '-180';
								slider.max = '180';
								slider.value = String(light.direction || 0);
								slider.style.flex = '1';
								slider.style.cursor = 'pointer';
								
								const angleDisplay = sliderContainer.createEl('span', { text: `${light.direction || 0}°` });
								angleDisplay.style.minWidth = '40px';
								angleDisplay.style.textAlign = 'right';
								angleDisplay.style.fontSize = '12px';
								
								slider.addEventListener('input', (e) => {
									const angle = parseInt((e.target as HTMLInputElement).value);
									light.direction = angle;
									angleDisplay.textContent = `${angle}°`;
									redrawAnnotations();
								});
								
								slider.addEventListener('change', () => {
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								});
							}
							} // end else (non-walllight type picker)
							
// Custom colour picker for all light sources
										{
											const lightDefaultColor = getDefaultLightColor(light.type);
											contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
											const colorHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
											colorHeader.textContent = 'Light Colour:';
											const colorRow = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
											colorRow.style.display = 'flex';
											colorRow.style.alignItems = 'center';
											colorRow.style.gap = '8px';
											colorRow.style.padding = '8px';
											const colorPicker = colorRow.createEl('input', {
												attr: { type: 'color', value: light.customColor || lightDefaultColor }
											});
											colorPicker.style.width = '60px';
											colorPicker.style.height = '30px';
											colorPicker.style.border = 'none';
											colorPicker.style.cursor = 'pointer';
											colorPicker.addEventListener('input', (e) => {
												e.stopPropagation();
												if (!light.customColor) saveToHistory(); // snapshot before first change
												light.customColor = (e.target as HTMLInputElement).value;
												redrawAnnotations();
											});
											colorPicker.addEventListener('change', () => {
												plugin.saveMapAnnotations(config, el);
												if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
												new Notice(`Light colour set to ${light.customColor}`);
											});
											colorPicker.addEventListener('click', (e) => e.stopPropagation());
											const resetBtn = colorRow.createEl('button', { text: 'Reset' });
											resetBtn.style.padding = '4px 8px';
											resetBtn.style.fontSize = '11px';
											resetBtn.style.cursor = 'pointer';
											resetBtn.addEventListener('click', (e) => {
												e.stopPropagation();
												saveToHistory();
												delete light.customColor;
												colorPicker.value = lightDefaultColor;
												redrawAnnotations();
												plugin.saveMapAnnotations(config, el);
												if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
												new Notice('Light colour reset to default');
								});
							}
							
							// Separator
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							
							// Delete option
							const deleteOption = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item delete' });
							deleteOption.innerHTML = `<span>🗑️</span> Delete`;
							deleteOption.addEventListener('click', () => {
								saveToHistory();
								config.lightSources.splice(i, 1);
								updateFlickerAnimation();
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								document.body.removeChild(contextMenu);
								new Notice('Light removed');
							});
							
							// Add to body and remove on outside click
							document.body.appendChild(contextMenu);

							// Center on viewport after appending (so we know menu dimensions)
							const menuRect = contextMenu.getBoundingClientRect();
							const viewportWidth = window.innerWidth;
							const viewportHeight = window.innerHeight;
							const centerLeft = Math.max(10, (viewportWidth - menuRect.width) / 2);
							const centerTop = Math.max(10, (viewportHeight - menuRect.height) / 2);
							contextMenu.style.left = `${centerLeft}px`;
							contextMenu.style.top = `${centerTop}px`;

							const removeMenu = (event: MouseEvent) => {
								if (!contextMenu.contains(event.target as Node)) {
									document.body.removeChild(contextMenu);
									document.removeEventListener('click', removeMenu);
								}
							};
							setTimeout(() => document.addEventListener('click', removeMenu), 10);
							
							return;
						}
					}
				}
				
				// Check if right-clicking on a wall segment (only in walls view)
				if (config.activeLayer === 'Background' && (backgroundEditView === 'all' || backgroundEditView === 'walls') && config.walls && config.walls.length > 0) {
					const wallClickRadius = 10;
					for (let i = config.walls.length - 1; i >= 0; i--) {
						const wall = config.walls[i];
						// Check distance from point to line segment
						const dx = wall.end.x - wall.start.x;
						const dy = wall.end.y - wall.start.y;
						const lengthSq = dx * dx + dy * dy;
						
						let t = 0;
						if (lengthSq > 0) {
							t = Math.max(0, Math.min(1, ((mapPos.x - wall.start.x) * dx + (mapPos.y - wall.start.y) * dy) / lengthSq));
						}
						
						const nearestX = wall.start.x + t * dx;
						const nearestY = wall.start.y + t * dy;
						const dist = Math.sqrt(Math.pow(mapPos.x - nearestX, 2) + Math.pow(mapPos.y - nearestY, 2));
						
						if (dist <= wallClickRadius) {
							e.preventDefault();
							
							const wallType = wall.type || 'wall';
							const wallDef = WALL_TYPES[wallType as WallType] || WALL_TYPES.wall;
							
							// Create wall context menu
							const contextMenu = document.createElement('div');
							contextMenu.addClass('dnd-map-context-menu');
							contextMenu.style.position = 'fixed';
							contextMenu.style.left = `${e.clientX}px`;
							contextMenu.style.top = `${e.clientY}px`;
							
							// Wall name header
							const header = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							header.textContent = wall.name || wallDef.name;
							
							// Door open/close toggle (only for doors)
							if (wallType === 'door') {
								const isOpen = wall.open === true;
								const toggleOption = contextMenu.createDiv({ 
									cls: 'dnd-map-context-menu-item'
								});
								toggleOption.innerHTML = isOpen 
									? `<span>🚪</span> Close Door`
									: `<span>🚪</span> Open Door`;
								toggleOption.addEventListener('click', () => {
									saveToHistory();
									wall.open = !isOpen;
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									document.body.removeChild(contextMenu);
									new Notice(wall.open ? 'Door opened' : 'Door closed');
								});
								
								contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							}
							
							// Wall height setting
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							const heightHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							heightHeader.textContent = '↕️ Wall Height';
							
							const heightRow = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item' });
							heightRow.style.display = 'flex';
							heightRow.style.alignItems = 'center';
							heightRow.style.gap = '6px';
							heightRow.style.padding = '4px 8px';
							
							const heightInput = heightRow.createEl('input', {
								attr: { 
									type: 'number', 
									min: '0', 
									max: '500',
									step: '5',
									placeholder: '∞ (infinite)',
									value: wall.height !== undefined && wall.height !== null ? String(wall.height) : ''
								}
							});
							heightInput.style.width = '80px';
							heightInput.style.textAlign = 'center';
							heightInput.addClass('dnd-map-darkvision-input');
							
							heightRow.createEl('span', { text: 'ft' });
							
							const infiniteBtn = heightRow.createEl('button', { text: '∞', cls: 'mod-cta' });
							infiniteBtn.style.padding = '2px 8px';
							infiniteBtn.style.fontSize = '14px';
							infiniteBtn.title = 'Set to infinite height (default)';
							
							heightInput.addEventListener('change', () => {
								saveToHistory();
								const val = parseInt(heightInput.value);
								if (!isNaN(val) && val > 0) {
									wall.height = val;
								} else {
									delete wall.height;
									heightInput.value = '';
								}
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								new Notice(wall.height ? `Wall height: ${wall.height} ft` : 'Wall height: infinite');
							});
							
							infiniteBtn.addEventListener('click', () => {
								saveToHistory();
								delete wall.height;
								heightInput.value = '';
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								new Notice('Wall height: infinite');
							});
							
							heightInput.addEventListener('click', (e) => e.stopPropagation());
							
							// Change wall type header
							const typeHeader = contextMenu.createDiv({ cls: 'dnd-map-context-menu-header' });
							typeHeader.textContent = 'Change Type:';
							
							// Wall type options
							(Object.entries(WALL_TYPES) as [WallType, typeof WALL_TYPES[WallType]][]).forEach(([type, def]) => {
								const option = contextMenu.createDiv({ 
									cls: 'dnd-map-context-menu-item' + (wallType === type ? ' active' : '')
								});
								option.innerHTML = `<span>${def.icon}</span> ${def.name}`;
								option.addEventListener('click', () => {
									saveToHistory();
									wall.type = type;
									wall.name = def.name;
									// Reset open state when changing away from door
									if (type !== 'door') {
										wall.open = false;
									}
									redrawAnnotations();
									plugin.saveMapAnnotations(config, el);
									if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
									document.body.removeChild(contextMenu);
									new Notice(`Changed to ${def.name}`);
								});
							});
							
							// Separator
							contextMenu.createDiv({ cls: 'dnd-map-context-menu-separator' });
							
							// Delete option
							const deleteOption = contextMenu.createDiv({ cls: 'dnd-map-context-menu-item delete' });
							deleteOption.innerHTML = `<span>🗑️</span> Delete`;
							deleteOption.addEventListener('click', () => {
								saveToHistory();
								config.walls.splice(i, 1);
								redrawAnnotations();
								plugin.saveMapAnnotations(config, el);
								if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
								document.body.removeChild(contextMenu);
								new Notice('Wall removed');
							});
							
							// Add to body and remove on outside click
							document.body.appendChild(contextMenu);

							// Center on viewport after appending (so we know menu dimensions)
							const menuRect = contextMenu.getBoundingClientRect();
							const viewportWidth = window.innerWidth;
							const viewportHeight = window.innerHeight;
							const centerLeft = Math.max(10, (viewportWidth - menuRect.width) / 2);
							const centerTop = Math.max(10, (viewportHeight - menuRect.height) / 2);
							contextMenu.style.left = `${centerLeft}px`;
							contextMenu.style.top = `${centerTop}px`;

							const removeMenu = (event: MouseEvent) => {
								if (!contextMenu.contains(event.target as Node)) {
									document.body.removeChild(contextMenu);
									document.removeEventListener('click', removeMenu);
								}
							};
							setTimeout(() => document.addEventListener('click', removeMenu), 10);
							
							return;
						}
					}
				}
			});

			// Add controls
			const controls = mapContainer.createDiv({ cls: 'dnd-map-controls' });
			
			// Zoom controls
			const zoomContainer = controls.createDiv({ cls: 'dnd-map-zoom-controls' });
			zoomContainer.createEl('span', { text: 'Zoom: ', cls: 'dnd-map-zoom-label' });
			
			const zoomOut = zoomContainer.createEl('button', { text: '−', cls: 'dnd-map-zoom-btn' });
			const zoomReset = zoomContainer.createEl('button', { text: '100%', cls: 'dnd-map-zoom-btn' });
			const zoomIn = zoomContainer.createEl('button', { text: '+', cls: 'dnd-map-zoom-btn' });
			
			zoomIn.addEventListener('click', () => {
				scale = Math.min(scale * 1.25, 20);
				updateTransform();
				zoomReset.textContent = `${Math.round(scale * 100)}%`;
			});
			
			zoomOut.addEventListener('click', () => {
				scale = Math.max(scale * 0.8, 0.05);
				updateTransform();
				zoomReset.textContent = `${Math.round(scale * 100)}%`;
			});
			
			zoomReset.addEventListener('click', () => {
				scale = 1;
				translateX = 0;
				translateY = 0;
				updateTransform();
				zoomReset.textContent = '100%';
			});

			// Grid toggle
			if (config.gridType && config.gridType !== 'none') {
				const gridToggle = controls.createDiv({ cls: 'dnd-map-grid-toggle' });
				const toggleBtn = gridToggle.createEl('button', { 
					text: '🔲 Toggle Grid', 
					cls: 'dnd-map-toggle-btn' 
				});
				
				// Initialize from saved state
				if (config.gridVisible === undefined) config.gridVisible = true;
				if ((gridCanvas as any) && !config.gridVisible) {
					(gridCanvas as any).style.display = 'none';
				}
				toggleBtn.addEventListener('click', () => {
					config.gridVisible = !config.gridVisible;
					if ((gridCanvas as any)) {
						(gridCanvas as any).style.display = config.gridVisible ? 'block' : 'none';
					}
					// Sync to player view
					if ((viewport as any)._syncPlayerView) {
						(viewport as any)._syncPlayerView();
					}
					// Persist
					plugin.saveMapAnnotations(config, el);
				});
			}

			// Import tokens from Initiative Tracker encounter
			const itImportBtn = controls.createEl('button', {
				text: '⚔️ Import Encounter Tokens',
				cls: 'dnd-map-toggle-btn'
			});
			itImportBtn.addEventListener('click', async () => {
				// Color name → hex mapping for border colors
				const COLOR_NAME_TO_HEX: Record<string, string> = {
					'red': '#ff0000', 'blue': '#3399ff', 'green': '#00cc44', 'yellow': '#ffcc00',
					'purple': '#9933ff', 'orange': '#ff6600', 'pink': '#ff66cc', 'cyan': '#00cccc',
					'magenta': '#ff00ff', 'lime': '#88ff00', 'teal': '#009999', 'gold': '#ffd700',
					'brown': '#8B4513', 'black': '#333333', 'white': '#ffffff', 'gray': '#808080',
					'grey': '#808080', 'indigo': '#4b0082', 'violet': '#ee82ee', 'silver': '#c0c0c0',
					'bronze': '#cd7f32', 'crimson': '#dc143c', 'coral': '#ff7f50', 'maroon': '#800000',
				};
				// Auto-assign border colors for duplicate creatures (same order as encounter builder)
				const AUTO_BORDER_COLORS = [
					'#ff0000', '#3399ff', '#00cc44', '#ffcc00', '#9933ff', '#ff6600',
					'#ff66cc', '#00cccc', '#ff00ff', '#88ff00', '#009999', '#ffd700',
				];

				const initiativeTracker = (plugin.app as any).plugins?.plugins?.["initiative-tracker"];
				if (!initiativeTracker) {
					new Notice('⚠️ Initiative Tracker plugin not found');
					return;
				}

				// Get the current encounter state from IT
				const itState = initiativeTracker.data?.state;
				if (!itState || !Array.isArray(itState.creatures) || itState.creatures.length === 0) {
					new Notice('⚠️ No encounter loaded in Initiative Tracker');
					return;
				}

				const creatures: any[] = itState.creatures;

				// Get existing markers on the map to check for duplicates
				const existingMarkers = config.markers || [];
				const existingMarkerNames = new Set<string>();
				existingMarkers.forEach((m: any) => {
					const markerDef = m.markerId ? plugin.markerLibrary.getMarker(m.markerId) : null;
					if (markerDef) {
						// Track both name and borderColor for exact duplicate detection
						const key = `${markerDef.name.toLowerCase()}|${(m.borderColor || '').toLowerCase()}`;
						existingMarkerNames.add(key);
					}
				});

				// Group IT creatures by base name to detect duplicates
				const creaturesByName = new Map<string, any[]>();
				for (const c of creatures) {
					const baseName = c.name || c.display || 'Unknown';
					if (!creaturesByName.has(baseName)) {
						creaturesByName.set(baseName, []);
					}
					creaturesByName.get(baseName)!.push(c);
				}

				// Calculate grid placement — uses a compact layout that stays within map bounds
				const gridPx = config.gridSize || 70;
				const ox = config.gridOffsetX || 0;
				const oy = config.gridOffsetY || 0;
				const mapW = config.dimensions?.width || 1000;
				const mapH = config.dimensions?.height || 800;
				const totalCols = Math.floor(mapW / gridPx);
				const totalRows = Math.floor(mapH / gridPx);
				// Start from row 1, column 1 (leaving a 1-cell margin)
				let placementCol = 1;
				let placementRow = 1;
				const maxCol = Math.max(2, totalCols - 1);
				const maxRow = Math.max(2, totalRows - 1);

				let addedCount = 0;
				let skippedCount = 0;
				let errorCount = 0;
				saveToHistory();

				console.log(`[DnD-Map] Import Encounter Tokens: ${creatures.length} creatures in IT state, map=${mapW}x${mapH}, grid=${gridPx}px (${totalCols}x${totalRows} cells)`);
				for (const [name, insts] of creaturesByName) {
					console.log(`[DnD-Map]   Group "${name}": ${insts.length} instance(s)`);
				}

				for (const [baseName, instances] of creaturesByName) {
					const isMultiple = instances.length > 1;

					for (let i = 0; i < instances.length; i++) {
					  try {
						const creature = instances[i];
						const displayName = creature.display || creature.name || 'Unknown';
						const isPlayer = creature.player === true;
						const isFriendly = creature.friendly === true;

						// Determine border color:
						// 1. If creature display has "(ColorName)" → use that color
						// 2. If multiple of same creature → auto-assign from color palette
						let borderColor: string | undefined;
						const colorMatch = displayName.match(/\((\w+)\)\s*$/);
						if (colorMatch) {
							const colorName = colorMatch[1].toLowerCase();
							borderColor = COLOR_NAME_TO_HEX[colorName] || undefined;
						}
						if (!borderColor && isMultiple) {
							borderColor = AUTO_BORDER_COLORS[i % AUTO_BORDER_COLORS.length];
						}

						// Check for duplicate: same base name + same border color already on map
						const dupeKey = `${baseName.toLowerCase()}|${(borderColor || '').toLowerCase()}`;
						if (existingMarkerNames.has(dupeKey)) {
							console.log(`[DnD-Map]   SKIP duplicate "${displayName}" (key=${dupeKey})`);
							skippedCount++;
							continue;
						}

						// Find or create a marker definition in the library
						// For PCs/NPCs with a vault path, resolve via token_id for exact match
						const markerType: MarkerType = isPlayer ? 'player' : (isFriendly ? 'npc' : 'creature');
						let markerDef: MarkerDefinition | undefined;

						// Try to resolve creature vault path from IT state data
						const creaturePath = creature.path || creature.note;
						let resolvedNoteFile: TFile | null = null;
						if (creaturePath && typeof creaturePath === 'string') {
							const noteFile = plugin.app.vault.getAbstractFileByPath(creaturePath);
							if (noteFile instanceof TFile) {
								resolvedNoteFile = noteFile;
								const noteCache = plugin.app.metadataCache.getFileCache(noteFile);
								const noteTokenId = noteCache?.frontmatter?.token_id;
								if (noteTokenId) {
									markerDef = plugin.markerLibrary.getMarker(noteTokenId);
								}
							}
						}

						// Fallback: name-based lookup (for creatures without vault notes)
						if (!markerDef) {
							markerDef = plugin.markerLibrary.getAllMarkers().find(
								(m: MarkerDefinition) => m.name.toLowerCase() === baseName.toLowerCase() && m.type === markerType
							);
						}
						// Also try matching against any type (player/npc/creature)
						if (!markerDef) {
							markerDef = plugin.markerLibrary.getAllMarkers().find(
								(m: MarkerDefinition) => m.name.toLowerCase() === baseName.toLowerCase()
									&& ['player', 'npc', 'creature'].includes(m.type)
							);
						}
						if (!markerDef) {
							// Create a new marker definition — resolve creature size from vault note or IT data
							let creatureSize: CreatureSize = 'medium';
							// Try reading size from the creature's vault note frontmatter
							if (resolvedNoteFile) {
								const noteCache = plugin.app.metadataCache.getFileCache(resolvedNoteFile);
								const fmSize = noteCache?.frontmatter?.size;
								if (fmSize && typeof fmSize === 'string') {
									const normalised = fmSize.toLowerCase().trim();
									if (normalised in CREATURE_SIZE_SQUARES) {
										creatureSize = normalised as CreatureSize;
									}
								}
							}
							// Also check IT creature data (some IT versions expose size)
							if (creatureSize === 'medium' && creature.size && typeof creature.size === 'string') {
								const normalised = creature.size.toLowerCase().trim();
								if (normalised in CREATURE_SIZE_SQUARES) {
									creatureSize = normalised as CreatureSize;
								}
							}

							const icon = isPlayer ? '🛡️' : (isFriendly ? '🧑' : '👹');
							const bgColor = isPlayer ? '#2563eb' : (isFriendly ? '#16a34a' : '#dc2626');
							const id = plugin.markerLibrary.generateId();
							const now = Date.now();
							markerDef = {
								id,
								name: baseName,
								type: markerType,
								icon,
								backgroundColor: bgColor,
								borderColor: '#ffffff',
								creatureSize,
								createdAt: now,
								updatedAt: now,
							} as MarkerDefinition;
							await plugin.markerLibrary.setMarker(markerDef);
							console.log(`[DnD-Map]   Created new marker def "${baseName}" (size=${creatureSize})`);
						}

						// Calculate grid-snapped position
						const sizeSquares = CREATURE_SIZE_SQUARES[markerDef.creatureSize || 'medium'] || 1;
						const halfToken = (sizeSquares * gridPx) / 2;
						// Use integer column steps (ceil to 1) to keep placement grid-aligned
						const colAdvance = Math.max(1, Math.ceil(sizeSquares)) + 1;
						const posX = ox + placementCol * gridPx + halfToken;
						const posY = oy + placementRow * gridPx + halfToken;

						// Create marker reference
						// Enemy creatures go to DM layer (hidden from players), players/friendlies to Player layer
						const tokenLayer = (!isPlayer && !isFriendly) ? 'DM' : 'Player';
						const markerRef: any = {
							id: `marker_inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
							markerId: markerDef.id,
							position: { x: posX, y: posY },
							placedAt: Date.now(),
							layer: tokenLayer,
						};

						// Set per-instance border color
						if (borderColor) {
							markerRef.borderColor = borderColor;
						}

						// Auto-apply darkvision from marker definition
						if (markerDef.darkvision && markerDef.darkvision > 0) {
							markerRef.darkvision = markerDef.darkvision;
						}

						config.markers.push(markerRef);
						existingMarkerNames.add(dupeKey); // Prevent duplicates within this batch
						addedCount++;
						console.log(`[DnD-Map]   ADD "${displayName}" → layer=${tokenLayer}, size=${markerDef.creatureSize}, pos=(${posX.toFixed(0)},${posY.toFixed(0)})`);

						// Advance grid placement position (integer steps to stay grid-aligned)
						const rowSize = Math.max(1, Math.ceil(sizeSquares));
						placementCol += colAdvance;
						if (placementCol + rowSize > maxCol) {
							placementCol = 1;
							placementRow += rowSize + 1;
							// If we've run out of vertical space, wrap back to top
							if (placementRow + rowSize > maxRow) {
								placementRow = 1;
							}
						}
					  } catch (creatureError) {
						console.error(`[DnD-Map]   ERROR importing "${baseName}" instance ${i}:`, creatureError);
						errorCount++;
					  }
					}
				}

				if (addedCount > 0) {
					redrawAnnotations();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					plugin.saveMapAnnotations(config, el);
					updateGridToolsVisibility();
					refreshVisionSelector();
				}

				const parts: string[] = [];
				if (addedCount > 0) parts.push(`✅ Added ${addedCount} token${addedCount > 1 ? 's' : ''} from encounter`);
				if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
				if (errorCount > 0) parts.push(`${errorCount} failed`);
				const msg = addedCount > 0
					? parts[0]! + (parts.length > 1 ? ` (${parts.slice(1).join(', ')})` : '')
					: `ℹ️ All encounter tokens already on the map` + (parts.length > 0 ? ` (${parts.join(', ')})` : '');
				new Notice(msg);
				console.log(`[DnD-Map] Import complete: added=${addedCount}, skipped=${skippedCount}, errors=${errorCount}`);
			});

			// Clear drawings button
			const clearBtn = controls.createEl('button', {
				text: '🗑️ Clear Drawings',
				cls: 'dnd-map-toggle-btn'
			});
			clearBtn.addEventListener('click', () => {
				new ClearDrawingsConfirmModal(plugin.app, () => {
					saveToHistory();
					config.drawings = [];
					redrawAnnotations();
					plugin.saveMapAnnotations(config, el);
					updateGridToolsVisibility();
					new Notice('Drawings cleared');
				}).open();
			});

			// Clear all tokens button
			const clearTokensBtn = controls.createEl('button', {
				text: '🗑️ Clear Tokens',
				cls: 'dnd-map-toggle-btn'
			});
			clearTokensBtn.addEventListener('click', () => {
				const tokenCount = (config.markers || []).length;
				if (tokenCount === 0) {
					new Notice('No tokens on the map');
					return;
				}
				new ClearTokensConfirmModal(plugin.app, () => {
					saveToHistory();
					config.markers = [];
					redrawAnnotations();
					if ((viewport as any)._syncPlayerView) (viewport as any)._syncPlayerView();
					plugin.saveMapAnnotations(config, el);
					updateGridToolsVisibility();
					refreshVisionSelector();
					new Notice(`${tokenCount} token${tokenCount > 1 ? 's' : ''} cleared`);
				}).open();
			});

			// Edit button
			const editButton = controls.createDiv({ cls: 'dnd-map-edit-btn-container' });
			const editBtn = editButton.createEl('button', {
				text: '⚙️ Edit Map',
				cls: 'dnd-map-toggle-btn'
			});
			editBtn.addEventListener('click', () => {
				new MapCreationModal(plugin.app, plugin, plugin.mapManager, config, el).open();
			});

			// Delete button
			const deleteButton = controls.createDiv({ cls: 'dnd-map-delete-btn-container' });
			const deleteBtn = deleteButton.createEl('button', {
				text: '🗑️ Delete Map',
				cls: 'dnd-map-toggle-btn'
			});
			deleteBtn.style.color = 'var(--text-error)';
			deleteBtn.addEventListener('click', () => {
				new DeleteMapConfirmModal(
					plugin.app,
					plugin,
					config.mapId,
					config.name || 'Unnamed Map',
					notePath,
					() => {
						el.empty();
						el.createEl('div', {
							text: '🗑️ Map has been deleted.',
							cls: 'dnd-map-deleted-notice'
						});
					}
				).open();
			});

		} catch (error) {
			console.error('Error rendering dnd-map:', error);
			el.createEl('div', { 
				text: `⚠️ Error rendering map: ${error instanceof Error ? error.message : String(error)}`,
				cls: 'dnd-map-error'
			});
		}
	}

