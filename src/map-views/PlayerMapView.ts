import { App, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PLAYER_MAP_VIEW_TYPE } from "../constants";
import type { MapMediaElement } from "../constants";
import { computeLightFlicker, computeNeonBuzz, hexToRgb, getFlickerSeedForKey, FLICKER_LIGHT_TYPES_SET, BUZZ_LIGHT_TYPES_SET } from "../utils/LightFlicker";
import { getWallsHash as _getWallsHash, visCacheKey as _visCacheKey, visCacheMap as _visCacheMap, VIS_CACHE_MAX as _VIS_CACHE_MAX } from "../utils/VisibilityCache";
import { canvasPool as _canvasPool } from "../utils/CanvasPool";
import type { MarkerReference, MarkerDefinition } from "../marker/MarkerTypes";
import { CREATURE_SIZE_SQUARES } from "../marker/MarkerTypes";
import type { CreatureSize, Layer } from "../marker/MarkerTypes";
import type { EnvAssetInstance } from '../envasset/EnvAssetTypes';
import { HexcrawlTracker } from '../hexcrawl';

export class PlayerMapView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private mapConfig: any = null;
  private imageResourcePath: string = '';
  private mapId: string = ''; // Unique identifier for the associated GM map
  private canvas: HTMLCanvasElement | null = null;
  private mapImage: MapMediaElement | null = null;
  private markerImageCache: Map<string, HTMLImageElement> = new Map();
  // Tabletop mode state
  private tabletopMode: boolean = true;
  private tabletopPanX: number = 0;
  private tabletopPanY: number = 0;
  private tabletopScale: number = 1;
  private tabletopRotation: number = 0; // degrees, clockwise
  private tabletopTargetX: number | null = null; // desired image top-left X (natural px)
  private tabletopTargetY: number | null = null; // desired image top-left Y (natural px)
  private mapContainer: HTMLDivElement | null = null;
  private syncCanvasToImage: (() => void) | null = null;
  private isFullscreen: boolean = false; // Track fullscreen state
  private _pvFlickerFrameId: number | null = null; // Flicker animation loop for player view
  private _pvFlickerWin: Window | null = null; // Window context for flicker animation (popout-safe)
  private _pvRendered: boolean = false; // Guard against double renderPlayerView (setState + onOpen race)

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return PLAYER_MAP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Player View";
  }

  getIcon(): string {
    return "eye";
  }

  async setState(state: any, result: any) {
    if (state.mapConfig) {
      this.mapConfig = state.mapConfig;
    }
    if (state.imageResourcePath) {
      this.imageResourcePath = state.imageResourcePath;
    }
    if (state.mapId) {
      this.mapId = state.mapId;
    } else {
    }
    await super.setState(state, result);
    // Render only if onOpen has already fired (container exists) and we
    // haven't rendered yet.  If onOpen hasn't run, it will trigger the
    // render itself, avoiding a double image load.
    if (this.mapConfig && !this._pvRendered && this.containerEl.children[1]) {
      this._pvRendered = true;
      this.renderPlayerView();
    }
  }

  getState() {
    return {
      mapConfig: this.mapConfig,
      imageResourcePath: this.imageResourcePath,
      mapId: this.mapId
    };
  }

  /**
   * Called by the GM view to push real-time updates.
   * Only redraws annotations â€” the expensive layout sync (canvas sizing,
   * CSS style writes, getBoundingClientRect) is handled independently by
   * ResizeObserver, image onload, and tabletop-mode change handlers.
   */
  updateMapData(config: any) {
    // Extract travel animation data before storing config
    const hexcrawlTravel = config.hexcrawlTravel;
    if (hexcrawlTravel) {
      delete config.hexcrawlTravel; // Don't persist animation trigger
    }
    this.mapConfig = config;
    // Redraw annotations only â€” skip the full syncCanvasToImage() which
    // recalculates CSS layout every call.  Layout is kept in sync by
    // ResizeObserver, image/video onload, and tabletop mode toggles.
    this.redrawAnnotations();
    // Trigger hexcrawl travel animation if present
    if (hexcrawlTravel) {
      this.animateHexcrawlTravel(hexcrawlTravel.fromCol, hexcrawlTravel.fromRow, hexcrawlTravel.toCol, hexcrawlTravel.toRow);
    }
  }

  /**
   * Set tabletop pan to show given image coordinates at top-left of viewport.
   * Called by GM when dragging the player-view region rectangle.
   * @param x - Image x coordinate (natural pixels)
   * @param y - Image y coordinate (natural pixels)
   */
  /**
   * Set viewport to show a specific image coordinate at the center of the screen.
   * This is the simplified approach: we always center the view on the given point.
   * @param centerX - Image X coordinate to center on
   * @param centerY - Image Y coordinate to center on
   */
  setTabletopPanFromImageCoords(centerX: number, centerY: number) {
    
    // Store the desired center point
    this.tabletopTargetX = centerX;
    this.tabletopTargetY = centerY;

    // Apply transform which will center this point in the viewport
    this.applyTabletopTransform();
  }

  /**
   * Set tabletop rotation.
   * Called by GM when using Q/E keys to rotate the player view.
   * @param rotation - Rotation in degrees (0, 90, 180, 270)
   */
  setTabletopRotation(rotation: number) {
    this.tabletopRotation = ((rotation % 360) + 360) % 360;

    // Use centralized transform application so rotation does not wipe out pan
    this.applyTabletopTransform();
  }

  /**
   * Set tabletop scale (uniform). Called by GM to project a GM indicator
   * rectangle exactly into the player viewport.
   */
  setTabletopScale(scale: number) {
    this.tabletopScale = scale || 1;
    this.applyTabletopTransform();
  }

  /**
   * Enable/disable tabletop mode programmatically (called from GM view)
   */
  setTabletopMode(on: boolean) {
    // Tabletop mode is always enforced on the player view. Ignore requests
    // to disable; keep behavior idempotent for callers.
    this.tabletopMode = true;
    this.syncGmViewRectVisibility();
    if (this.syncCanvasToImage) this.syncCanvasToImage();
    this.applyTabletopTransform();
  }

  /**
   * Toggle fullscreen for the player view window (popout leaf document)
   */
  toggleFullscreen() {
    try {
      const win = (this.containerEl as any).win || this.containerEl.ownerDocument?.defaultView || window;
      const doc = win.document;
      
      if (!this.isFullscreen) {
        // Enter fullscreen
        this.isFullscreen = true;
        this.hideObsidianChrome();
        doc.documentElement.requestFullscreen().catch((e: any) => {
        });
      } else {
        // Exit fullscreen
        this.isFullscreen = false;
        this.showObsidianChrome();
        if (doc.fullscreenElement) {
          doc.exitFullscreen().catch((e: any) => {
          });
        }
      }
    } catch (e) { console.warn('toggleFullscreen failed', e); }
  }

  private applyTabletopTransform() {
    if (!this.mapContainer || !this.mapImage) return;
    const sled = this.mapContainer.querySelector('.dnd-player-map-sled') as HTMLElement;
    if (!sled) return;

    const s = this.tabletopScale || 1;
    const deg = this.tabletopRotation || 0;
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const sn = Math.sin(rad);

    // Get viewport dimensions
    const viewportRect = this.mapContainer.getBoundingClientRect();
    const vcx = viewportRect.width / 2;
    const vcy = viewportRect.height / 2;

    // If GM requested a specific image center, compute pan to center it in viewport
    if (this.tabletopTargetX !== null && this.tabletopTargetY !== null) {
      const cx = this.tabletopTargetX;
      const cy = this.tabletopTargetY;

      // Transform: translate(panX, panY) rotate(deg) scale(s)
      // Applied right-to-left: scale first, then rotate, then translate
      // After scale: (cx*s, cy*s)
      // After rotate by +deg around origin: (cx*s*cos - cy*s*sin, cx*s*sin + cy*s*cos)  
      // After translate: add panX, panY
      // Want result at viewport center (vcx, vcy):
      this.tabletopPanX = vcx - s * (c * cx - sn * cy);
      this.tabletopPanY = vcy - s * (sn * cx + c * cy);

    }

    // Clamp based on rotated bbox in SCREEN space
    this.clampTabletopPan();

    sled.style.transformOrigin = '0 0';
    sled.style.left = '0px';
    sled.style.top = '0px';

    // Apply scale in the transform along with rotation and translation
    sled.style.transform = `translate(${this.tabletopPanX}px, ${this.tabletopPanY}px) rotate(${deg}deg) scale(${s})`;
  }

  private clampTabletopPan() {
    const img = this.mapImage;
    const wrap = this.mapContainer;
    if (!img || !wrap) return;

    const s = this.tabletopScale || 1;
    const deg = this.tabletopRotation || 0;
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const sn = Math.sin(rad);

    const W = img.naturalWidth * s;
    const H = img.naturalHeight * s;

    // Rotated corners in SCREEN space (before pan)
    const pts = [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: 0, y: H },
      { x: W, y: H }
    ].map(p => ({ x: c * p.x - sn * p.y, y: sn * p.x + c * p.y }));

    const minX0 = Math.min(...pts.map(p => p.x));
    const maxX0 = Math.max(...pts.map(p => p.x));
    const minY0 = Math.min(...pts.map(p => p.y));
    const maxY0 = Math.max(...pts.map(p => p.y));

    const r = wrap.getBoundingClientRect();
    const vw = r.width;
    const vh = r.height;

    // Debug: log computed bbox and viewport sizes to diagnose width clipping

    // Compute the strict pan ranges that would keep the rotated bbox
    // fully covering the viewport. For large rotated bboxes this enforces
    // that no empty area appears; for our UX we want the player to be
    // able to freely pan the map, so we only CENTER when the rotated
    // bbox is smaller than the viewport and otherwise allow free panning.
    const panMinX = vw - maxX0;
    const panMaxX = -minX0;
    const panMinY = vh - maxY0;
    const panMaxY = -minY0;

    // If the rotated bbox is smaller than the viewport, center it.
    if (panMinX > panMaxX) {
      const centerX = (vw - (maxX0 - minX0)) / 2;
      this.tabletopPanX = centerX - minX0;
    } else {
      // Otherwise: allow free horizontal panning (do not hard-clamp here).
      // Leave `this.tabletopPanX` unchanged so the user can explore fully.
    }

    if (panMinY > panMaxY) {
      const centerY = (vh - (maxY0 - minY0)) / 2;
      this.tabletopPanY = centerY - minY0;
    } else {
      // Allow free vertical panning as well.
    }

  }

  /**
   * Sync GM view rect visibility based on tabletop mode state.
   * Shows rect when this player view is in tabletop mode, hides when exiting.
   */
  syncGmViewRectVisibility() {
    try {
      // Find GM map viewport(s) and trigger redraw
      const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
      leaves.forEach((leaf: any) => {
        try {
          const viewportEl = leaf.view?.containerEl?.querySelector('.dnd-map-viewport');
          if (viewportEl) {
            const gmRect = (this.plugin as any)._gmViewRect;
            if (this.tabletopMode) {
              // Entering tabletop mode - ensure rect exists and is visible
              if (!gmRect || !gmRect.w || !gmRect.h) {
                // Create initial rect if none exists
                const rect = {
                  x: 0,
                  y: 0,
                  w: 800,
                  h: 600
                };
                try { (viewportEl as any)._gmViewRect = rect; } catch (e) { }
                try { (this.plugin as any)._gmViewRect = rect; } catch (e) { }
              }
            } else {
              // Exiting tabletop mode - check if any other player views are still in tabletop mode
              let anyTabletopActive = false;
              if ((this.plugin as any)._playerMapViews) {
                (this.plugin as any)._playerMapViews.forEach((pv: any) => {
                  if (pv !== this && pv.tabletopMode) {
                    anyTabletopActive = true;
                  }
                });
              }
              // If no other views in tabletop mode, hide the rect
              if (!anyTabletopActive && gmRect) {
                try { delete (viewportEl as any)._gmViewRect; } catch (e) { }
                try { delete (this.plugin as any)._gmViewRect; } catch (e) { }
              }
            }
            // Trigger redraw
            viewportEl.dispatchEvent(new CustomEvent('gm-rect-updated'));
          }
        } catch (e) { }
      });
    } catch (e) { }
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('dnd-player-map-container');

    // Don't hide chrome by default - let fullscreen toggle handle it

    if (this.mapConfig && !this._pvRendered) {
      this._pvRendered = true;
      this.renderPlayerView();
    }
  }

  /**
   * Hide the Obsidian view header and tab bar.
   * Injects CSS into the popout window's document to hide all chrome.
   */
  private hideObsidianChrome() {
    // Get the window that owns this view (popout window, not main window)
    const win = (this.containerEl as any).win || this.containerEl.ownerDocument?.defaultView;
    if (!win || win === window) {
      // Don't apply to main window, only to popout windows
      return;
    }
    const doc = win.document;

    // Remove any existing style first
    const existingStyle = doc.getElementById('dnd-player-view-chrome-hide');
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = doc.createElement('style');
    style.id = 'dnd-player-view-chrome-hide';
    style.textContent = `
      /* Hide the tab header bar completely */
      .workspace-tab-header-container {
        display: none !important;
      }

      /* Hide the view header (title bar) completely */
      .view-header {
        display: none !important;
      }

      /* Hide titlebar / window decorations */
      .titlebar {
        display: none !important;
      }

      /* Hide sidebar toggles if any */
      .sidebar-toggle-button {
        display: none !important;
      }

      /* Hide status bar */
      .status-bar {
        display: none !important;
      }

      /* Ensure content fills the full window from the very top */
      .mod-root {
        top: 0 !important;
      }

      .workspace-leaf-content {
        position: relative !important;
      }

      /* Remove any hover trigger zones */
      .workspace-leaf-content::before {
        display: none !important;
      }
    `;
    doc.head.appendChild(style);
  }

  /**
   * Show the Obsidian chrome by removing the hide styles.
   */
  private showObsidianChrome() {
    const win = (this.containerEl as any).win || this.containerEl.ownerDocument?.defaultView;
    if (!win || win === window) {
      return;
    }
    const doc = win.document;
    const style = doc.getElementById('dnd-player-view-chrome-hide');
    if (style) {
      style.remove();
    }
  }

  private renderPlayerView() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('dnd-player-map-container');

    // Button toolbar (top-right corner)
    const toolbar = container.createDiv({ cls: 'dnd-player-toolbar' });

    // Fullscreen button
    const fullscreenBtn = toolbar.createEl('button', {
      cls: 'dnd-player-toolbar-btn',
      text: 'ðŸ–µ Fullscreen'
    });
    fullscreenBtn.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    // Listen for fullscreen state changes (e.g., user presses ESC)
    const win = (this.containerEl as any).win || window;
    const doc = win.document;
    const handleFullscreenChange = () => {
      if (!doc.fullscreenElement && this.isFullscreen) {
        // Exited fullscreen via ESC or other means
        this.isFullscreen = false;
        this.showObsidianChrome();
      }
    };
    doc.addEventListener('fullscreenchange', handleFullscreenChange);
    // Store reference for cleanup if needed
    (this as any)._fullscreenChangeHandler = handleFullscreenChange;

    // Tabletop mode button
    const tabletopBtn = toolbar.createEl('button', {
      cls: 'dnd-player-toolbar-btn',
      text: this.tabletopMode ? 'ðŸŽ² Tabletop: ON' : 'ðŸŽ² Tabletop: OFF'
    });

    // Calibrate button
    const calibrateBtn = toolbar.createEl('button', {
      cls: 'dnd-player-toolbar-btn',
      text: 'ðŸŽ¯ Calibrate'
    });

    // Hide player-side calibrate UI: calibration is managed from the GM map view
    calibrateBtn.style.display = 'none';

    // Mini size display
    const miniSizeLabel = toolbar.createEl('span', {
      cls: 'dnd-player-toolbar-label'
    });
    const updateMiniLabel = () => {
      const cal = this.plugin.settings.tabletopCalibration;
      if (cal) {
        miniSizeLabel.setText(`Grid: ${cal.miniBaseMm}mm`);
        miniSizeLabel.style.display = '';
      } else {
        miniSizeLabel.style.display = 'none';
      }
    };
    updateMiniLabel();

    // Rotate controls for tabletop mode
    const rotateLeftBtn = toolbar.createEl('button', { cls: 'dnd-player-toolbar-btn', text: 'â¤º' });
    const rotateResetBtn = toolbar.createEl('button', { cls: 'dnd-player-toolbar-btn', text: '0Â°' });
    const rotateRightBtn = toolbar.createEl('button', { cls: 'dnd-player-toolbar-btn', text: 'â¤»' });

    // Hide player-side controls: GM map view will provide these controls instead
    fullscreenBtn.style.display = 'none';
    tabletopBtn.style.display = 'none';
    rotateLeftBtn.style.display = 'none';
    rotateResetBtn.style.display = 'none';
    rotateRightBtn.style.display = 'none';


    // Map container
    const mapContainer = container.createDiv({ cls: 'dnd-player-map-wrapper' });
    this.mapContainer = mapContainer;

    // Inner sled wraps image + canvas, pans together in tabletop mode
    const sled = mapContainer.createDiv({ cls: 'dnd-player-map-sled' });

    // Image or video background
    const isVideo = this.mapConfig?.isVideo || /\.(mp4|webm)$/i.test(this.imageResourcePath);
    let img: MapMediaElement;
    if (isVideo) {
      const video = sled.createEl('video', {
        cls: 'dnd-player-map-image dnd-player-map-video',
        attr: {
          src: this.imageResourcePath,
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
      img = sled.createEl('img', {
        cls: 'dnd-player-map-image',
        attr: {
          src: this.imageResourcePath,
          alt: this.mapConfig?.name || 'Battle Map'
        }
      });
    }
    this.mapImage = img;

    // Annotation canvas
    const canvas = sled.createEl('canvas', {
      cls: 'dnd-player-map-canvas'
    });
    this.canvas = canvas;

    // Helper to sync canvas CSS size and position to match displayed image exactly
    const syncCanvasToImage = () => {
      if (img.complete && img.naturalWidth > 0) {
        // Ensure buffer matches natural image size
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }

        if (this.tabletopMode) {
          // In tabletop mode: image is sized by natural dimensions (no scale applied via CSS size)
          // The scale is applied via CSS transform instead
          if (this.tabletopScale && this.mapConfig?.gridSize > 0) {
            const s = this.tabletopScale;

            // Image uses natural size
            img.style.maxWidth = 'none';
            img.style.maxHeight = 'none';
            img.style.objectFit = 'none';
            img.style.width = img.naturalWidth + 'px';
            img.style.height = img.naturalHeight + 'px';

            // Sled wraps at natural size
            sled.style.width = img.naturalWidth + 'px';
            sled.style.height = img.naturalHeight + 'px';
            sled.style.position = 'absolute';
            sled.style.transformOrigin = '0 0';
            sled.style.left = '0px';
            sled.style.top = '0px';
            // Note: applyTabletopTransform will set the transform with scale
            // Don't call it here - it will be called after scale is set

            mapContainer.style.overflow = 'hidden';

            // Canvas exactly overlays image at (0,0) within the sled
            canvas.style.left = '0px';
            canvas.style.top = '0px';
            canvas.style.width = img.naturalWidth + 'px';
            canvas.style.height = img.naturalHeight + 'px';
          }

          // Expose sync helper so GM-side code can ask the player view to refresh layout
          try { this.syncCanvasToImage = syncCanvasToImage; } catch (e) { }

            // If a GM-side view rect exists on the plugin, update its scaled pixel bounds so redrawAnnotations can draw it
            try {
              const gmRect = (this.plugin as any)._gmViewRect;
              if (gmRect) {
                (gmRect as any).__scaledW = img.naturalWidth * this.tabletopScale;
                (gmRect as any).__scaledH = img.naturalHeight * this.tabletopScale;
              }
            } catch {}
        } else {
          // Normal mode: fit to screen
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.objectFit = 'contain';
          img.style.width = '';
          img.style.height = '';
            sled.style.width = '';
          sled.style.height = '';
          sled.style.position = '';
          sled.style.left = '';
          sled.style.top = '';
          mapContainer.style.overflow = 'hidden';

          // Use getBoundingClientRect for accurate post-layout dimensions
          const imgRect = img.getBoundingClientRect();
          const sledRect = sled.getBoundingClientRect();
          canvas.style.left = (imgRect.left - sledRect.left) + 'px';
          canvas.style.top = (imgRect.top - sledRect.top) + 'px';
          canvas.style.width = imgRect.width + 'px';
          canvas.style.height = imgRect.height + 'px';
        }

        this.redrawAnnotations();
      }
    };
    this.syncCanvasToImage = syncCanvasToImage;

    // --- Tabletop mode: pan/drag (moves the sled) ---
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    mapContainer.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.tabletopMode) return;
      isPanning = true;
      // If GM previously requested a specific image top-left, clear it - manual pan takes precedence
      this.tabletopTargetX = null;
      this.tabletopTargetY = null;

      panStartX = e.clientX - this.tabletopPanX;
      panStartY = e.clientY - this.tabletopPanY;
      mapContainer.style.cursor = 'grabbing';
      e.preventDefault();
    });

    mapContainer.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isPanning || !this.tabletopMode) return;
      this.tabletopPanX = e.clientX - panStartX;
      this.tabletopPanY = e.clientY - panStartY;

      // Clamp using rotation-aware bbox and apply transform
      this.clampTabletopPan();
      this.applyTabletopTransform();
    });

    

    const stopPan = () => {
      if (isPanning) {
        isPanning = false;
        mapContainer.style.cursor = this.tabletopMode ? 'grab' : '';
        
        // Bidirectional sync: report current top-left image coords back to GM
        if (this.tabletopMode && this.tabletopScale > 0) {
          // Convert current pan back to image coords accounting for rotation
          const s = this.tabletopScale || 1;
          const deg = this.tabletopRotation || 0;
          const t = (deg * Math.PI) / 180;
          const c = Math.cos(t);
          const sn = Math.sin(t);

          // v = -pan
          const vx = -this.tabletopPanX;
          const vy = -this.tabletopPanY;

          // [x;y] = R^-1 * v / s  where R^-1 = [ c  sn; -sn  c ]
          const imageX = Math.round((c * vx + sn * vy) / s);
          const imageY = Math.round((-sn * vx + c * vy) / s);
          
          // Update GM rect position and trigger redraw
          try {
            const gmRect = (this.plugin as any)._gmViewRect;
            if (gmRect) {
              gmRect.x = Math.max(0, imageX);
              gmRect.y = Math.max(0, imageY);
              
              // Find GM map view and trigger its redraw
              const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
              leaves.forEach((leaf: any) => {
                try {
                  const viewportEl = leaf.view?.containerEl?.querySelector('.dnd-map-viewport');
                  if (viewportEl && (viewportEl as any)._syncPlayerView) {
                    // Find the annotation canvas and redraw
                    const canvas = viewportEl.querySelector('.dnd-map-annotation-canvas') as HTMLCanvasElement;
                    if (canvas) {
                      // Trigger redraw by dispatching a custom event
                      viewportEl.dispatchEvent(new CustomEvent('gm-rect-updated'));
                    }
                  }
                } catch (e) { }
              });
            }
          } catch (e) { }
        }
      }
    };
    mapContainer.addEventListener('mouseup', stopPan);
    mapContainer.addEventListener('mouseleave', stopPan);

    // Rotation handlers (rotate 15Â° steps)
    rotateLeftBtn.addEventListener('click', () => {
      this.tabletopRotation = (this.tabletopRotation - 15 + 360) % 360;
      this.applyTabletopTransform();
    });
    rotateRightBtn.addEventListener('click', () => {
      this.tabletopRotation = (this.tabletopRotation + 15) % 360;
      this.applyTabletopTransform();
    });
    rotateResetBtn.addEventListener('click', () => {
      this.tabletopRotation = 0;
      this.applyTabletopTransform();
    });

    // --- Tabletop button handlers ---
    const applyTabletopMode = () => {
      tabletopBtn.setText(this.tabletopMode ? 'ðŸŽ² Tabletop: ON' : 'ðŸŽ² Tabletop: OFF');
      tabletopBtn.toggleClass('active', this.tabletopMode);
      mapContainer.style.cursor = this.tabletopMode ? 'grab' : '';
      if (!this.tabletopMode) {
        this.tabletopPanX = 0;
        this.tabletopPanY = 0;
      }
      // Sync GM view rect visibility based on tabletop mode state
      this.syncGmViewRectVisibility();
      // Call sync immediately for tabletop mode (dimensions are explicit),
      // then defer for normal mode where layout needs to settle
      syncCanvasToImage();
      requestAnimationFrame(syncCanvasToImage);
    };

    tabletopBtn.addEventListener('click', () => {
      // Tabletop mode is enforced on the player view (GM is authoritative).
      // Ignore user clicks that attempt to disable it; refresh UI instead.
      this.tabletopMode = true;
      applyTabletopMode();
    });

    // Player-side calibration removed; calibration should be performed from GM view.

    // Size canvas when media loads
    const onPlayerMediaReady = () => {
      canvas.width = (img as any).naturalWidth;
      canvas.height = (img as any).naturalHeight;
      // Defer one frame so media has been laid out, then sync position
      requestAnimationFrame(syncCanvasToImage);
    };
    if (isVideo) {
      img.addEventListener('loadeddata', onPlayerMediaReady, { once: true });
      if ((img as any).readyState >= 2) onPlayerMediaReady();
    } else {
      img.addEventListener('load', onPlayerMediaReady);
    }

    // Handle window resize â€” defer one frame to ensure layout is settled
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncCanvasToImage);
    });
    resizeObserver.observe(mapContainer);
    this.register(() => resizeObserver.disconnect());

    // Handle fullscreen transitions (F11 / button)
    // Use multiple deferred frames since browsers need time to settle after fullscreen reflow
    const onFullscreenChange = () => {
      // Fire at multiple intervals to catch the layout settling
      requestAnimationFrame(syncCanvasToImage);
      requestAnimationFrame(() => requestAnimationFrame(syncCanvasToImage));
      setTimeout(syncCanvasToImage, 100);
      setTimeout(syncCanvasToImage, 300);
    };
    win.document.addEventListener('fullscreenchange', onFullscreenChange);
    this.register(() => win.document.removeEventListener('fullscreenchange', onFullscreenChange));

    // Also listen for window resize events directly (catches F11 without fullscreen API)
    const onWinResize = () => {
      requestAnimationFrame(syncCanvasToImage);
      setTimeout(syncCanvasToImage, 100);
    };
    win.addEventListener('resize', onWinResize);
    this.register(() => win.removeEventListener('resize', onWinResize));

    // If image already loaded
    if (img.complete && img.naturalWidth > 0) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      requestAnimationFrame(syncCanvasToImage);
    }
    
    // â”€â”€ Player-View Flicker Animation Loop â”€â”€
    // Continuously redraws at ~14fps when flickering lights are present.
    const PV_FLICKER_INTERVAL = 1000 / 14;
    let pvLastFlickerRedraw = 0;
    const pvHasFlickeringLights = (): boolean => {
      const cfg = this.mapConfig;
      if (!cfg) return false;
      if (cfg.lightSources) {
        for (const l of cfg.lightSources) {
          if (l.active !== false && FLICKER_LIGHT_TYPES_SET.has(l.type)) return true;
        }
      }
      if (cfg.markers) {
        for (const m of cfg.markers as any[]) {
          if (m.light && FLICKER_LIGHT_TYPES_SET.has(m.light.type)) return true;
        }
      }
      return false;
    };
    // Use the correct window context (popout windows have their own rAF)
    const flickerWin: Window = (this.containerEl as any).win || window;
    this._pvFlickerWin = flickerWin;
    const pvFlickerLoop = (timestamp: number) => {
      if (!this.canvas || !this.containerEl.isConnected) {
        this._pvFlickerFrameId = null;
        return;
      }
      if (timestamp - pvLastFlickerRedraw >= PV_FLICKER_INTERVAL) {
        pvLastFlickerRedraw = timestamp;
        if (pvHasFlickeringLights()) {
          this.redrawAnnotations();
        }
      }
      this._pvFlickerFrameId = flickerWin.requestAnimationFrame(pvFlickerLoop);
    };
    // Start the flicker loop
    if (this._pvFlickerFrameId !== null) {
      (this._pvFlickerWin || window).cancelAnimationFrame(this._pvFlickerFrameId);
    }
    this._pvFlickerFrameId = flickerWin.requestAnimationFrame(pvFlickerLoop);
  }

  private loadMarkerImage(path: string): HTMLImageElement | null {
    if (this.markerImageCache.has(path)) {
      const cached = this.markerImageCache.get(path)!;
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    const img = new Image();
    this.markerImageCache.set(path, img);
    try {
      img.src = this.plugin.app.vault.adapter.getResourcePath(path);
      img.onload = () => this.redrawAnnotations();
    } catch {
      // invalid path
    }
    return null;
  }

  private redrawAnnotations() {
    if (!this.canvas || !this.mapConfig) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const config = this.mapConfig;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid overlay if active and visible
    if (config.gridType && config.gridType !== 'none' && config.gridSize > 0 && config.gridVisible !== false) {
      this.drawGrid(ctx, config);
    }

    // â”€â”€ Hexcrawl rendering (terrain, visited trail, party marker) â”€â”€â”€â”€â”€â”€
    const isHexcrawlMap = (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') && (config.type === 'world' || config.type === 'regional');
    if (isHexcrawlMap) {
      this.drawHexcrawlLayer(ctx, config);
    }

    // Filter to Player, Elevated, and Subterranean layers (exclude DM and Background)
    // Player tokens are always visible regardless of layer
    const visibleLayers = ['Player', 'Elevated', 'Subterranean'];
    const playerMarkers = (config.markers || []).filter((m: any) => {
      const markerLayer = m.layer || 'Player';
      const markerDef = m.markerId ? this.plugin.markerLibrary.getMarker(m.markerId) : null;
      
      // Debug: log each marker being filtered
      
      // Always show player-type tokens (or tokens marked visible to players), even if on DM layer (for tunneling)
      if (markerDef && (markerDef.type === 'player' || m.visibleToPlayers)) {
        return true; // Always show player tokens and tokens visible to players
      }
      // Also show burrowing tokens (they may be visible to players in tunnels)
      if (m.elevation?.isBurrowing) {
        return true;
      }
      const included = visibleLayers.includes(markerLayer);
      return included;
    });
    const playerDrawings = (config.drawings || []).filter((d: any) => visibleLayers.includes(d.layer || 'Player'));
    const playerHighlights = (config.highlights || []).filter((h: any) => visibleLayers.includes(h.layer || 'Player'));
    const playerPoiRefs = (config.poiReferences || []).filter((p: any) => (p.layer || 'DM') === 'Player');

    // Draw difficult terrain tiles (visible to players as subtle overlay)
    if (config.difficultTerrain && Object.keys(config.difficultTerrain).length > 0) {
      const gs = config.gridSize || 70;
      const ox = config.gridOffsetX || 0;
      const oy = config.gridOffsetY || 0;
      ctx.save();
      ctx.globalAlpha = 0.2;
      for (const key of Object.keys(config.difficultTerrain)) {
        const parts = key.split(',');
        const col = parseInt(parts[0] ?? '0');
        const row = parseInt(parts[1] ?? '0');
        const cellX = col * gs + ox;
        const cellY = row * gs + oy;
        ctx.fillStyle = 'rgba(139, 90, 43, 0.25)';
        ctx.fillRect(cellX, cellY, gs, gs);
        ctx.strokeStyle = 'rgba(139, 90, 43, 0.4)';
        ctx.lineWidth = 1;
        const step = gs / 4;
        ctx.beginPath();
        for (let d = -gs; d <= gs; d += step) {
          ctx.moveTo(cellX + Math.max(0, d), cellY + Math.max(0, -d));
          ctx.lineTo(cellX + Math.min(gs, d + gs), cellY + Math.min(gs, gs - d));
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(139, 90, 43, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cellX + 0.5, cellY + 0.5, gs - 1, gs - 1);
      }
      ctx.restore();
    }

    // Draw highlights
    playerHighlights.forEach((h: any) => this.drawHighlight(ctx, h));

    // Draw PoI icons (player layer only) - hidden entirely for hexcrawl/exploration maps
    if (!isHexcrawlMap) {
      playerPoiRefs.forEach((p: any) => this.drawPoiIcon(ctx, p, config));
    }

    // Draw drawings
    playerDrawings.forEach((d: any) => this.drawDrawing(ctx, d));

    // Separate player tokens from other markers - player tokens should always be visible
    // visibleToPlayers ("Show to Players") tokens are treated as player tokens:
    // they contribute to vision, are drawn on top of fog, and act as vision sources.
    const playerTokens: any[] = [];
    const otherMarkers: any[] = [];
    playerMarkers.forEach((m: any) => {
      if (m.markerId) {
        const markerDef = this.plugin.markerLibrary.getMarker(m.markerId);
        if (markerDef && (markerDef.type === 'player' || m.visibleToPlayers)) {
          playerTokens.push(m);
        } else {
          otherMarkers.push(m);
        }
      } else {
        otherMarkers.push(m);
      }
    });
    

    // Track players who are in tunnels - used for drawing tunnel above fog
    const tunnelPlayersInMarkers = playerTokens.filter((m: any) => m.tunnelState);

    // Draw tunnel entrances and exits (always visible on surface - these are physical holes)
    if (config.tunnels && config.tunnels.length > 0) {
      
      config.tunnels.forEach((tunnel: any) => {
        if (!tunnel.visible) return;
        
        const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize as CreatureSize] || 1;
        const radius = (squares * config.gridSize) / 2.5;
        
        // Draw entrance (always visible - it's a physical hole on the surface)
        const entrance = tunnel.entrancePosition;
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
        ctx.fillText('ðŸ•³ï¸', entrance.x, entrance.y);
        
        ctx.restore();
        
        // Draw exit if tunnel is inactive (completed) and has a different exit position
        if (!tunnel.active && tunnel.path && tunnel.path.length > 1) {
          const exit = tunnel.path[tunnel.path.length - 1];
          // Only draw exit if it's different from entrance
          if (Math.abs(exit.x - tunnel.entrancePosition.x) > 5 || Math.abs(exit.y - tunnel.entrancePosition.y) > 5) {
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
            ctx.fillText('ðŸ•³ï¸', exit.x, exit.y);
            
            ctx.restore();
          }
        }
      });
    }

    // NOTE: Tunnel path pre-fog rendering was removed.
    // Tunnel paths are underground and invisible from the surface.
    // Surface tokens can only see tunnel entrances/exits (drawn above, occluded by fog normally).
    // The actual visible tunnel rendering happens ON TOP of fog (second pass below).

    // Calculate pixelsPerFoot for vision range calculations
    const pixelsPerFootForVision = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;

    // Determine which player tokens are vision-relevant for tunnel visibility checks.
    // When a specific vision token is selected, ONLY that token can "see" into tunnels.
    // A surface token should never see underground tokens, and vice versa.
    const selectedVisionToken = config.selectedVisionTokenId
      ? playerTokens.find((m: any) => m.id === config.selectedVisionTokenId)
      : null;
    const selectedVisionIsInTunnel = !!(selectedVisionToken && selectedVisionToken.tunnelState);
    const visionRelevantTokens: any[] = config.selectedVisionTokenId
      ? (selectedVisionToken ? [selectedVisionToken] : [])
      : playerTokens; // Default: all player tokens (incl. visibleToPlayers) contribute to vision

    // Draw non-player markers (these will be obscured by fog)
    // Filter out burrowed tokens unless they're marked as visible to players OR visible to a player in the same tunnel
    
    otherMarkers.forEach((m: any) => {
      // Check if burrowed token OR token in tunnel should be visible
      // Tokens can be in tunnels either by burrowing (isBurrowing=true) or by entering (tunnelState set)
      if ((m.elevation?.isBurrowing || m.tunnelState) && !m.visibleToPlayers) {
        
        // Check if any player token that is underground (in tunnel or burrowing) can see this burrowed token
        let visibleToPlayerInTunnel = false;
        
        // Helper to calculate vision range for a player
        const getVisionRange = (marker: any): number => {
          let visionRange = 0;
          if (marker.darkvision && marker.darkvision > 0) {
            visionRange = Math.max(visionRange, marker.darkvision);
          }
          
          // Check for light as nested object or direct properties
          let lightBright = 0;
          let lightDim = 0;
          if (marker.light) {
            lightBright = marker.light.bright || 0;
            lightDim = marker.light.dim || 0;
          } else if (marker.lightBright !== undefined || marker.lightDim !== undefined) {
            lightBright = marker.lightBright || 0;
            lightDim = marker.lightDim || 0;
          }
          
          if (lightBright > 0 || lightDim > 0) {
            const totalLightRange = lightBright + lightDim;
            visionRange = Math.max(visionRange, totalLightRange);
          }
          
          const visionRangePx = visionRange * pixelsPerFootForVision;
          
          return visionRangePx;
        };
        
        // If a specific vision token is selected and it's NOT in a tunnel,
        // underground tokens are NEVER visible (surface can't see underground)
        if (config.selectedVisionTokenId && !selectedVisionIsInTunnel) {
          m._visibleToTunnelPlayer = false;
          return;
        }

        if (visionRelevantTokens.length > 0) {
          // Case 1: Burrowed token is in an explicit tunnel with a player
          if (m.tunnelState && config.tunnels) {
            const tunnel = config.tunnels.find((t: any) => t.id === m.tunnelState.tunnelId);
            
            
            if (tunnel && tunnel.path) {
            // Check each vision-relevant player token in the same tunnel
            for (const playerMarker of visionRelevantTokens) {
              
              if (playerMarker.tunnelState?.tunnelId === m.tunnelState.tunnelId) {
                // Both tokens are in the same tunnel - use raycasting with tunnel walls
                const visionRangePx = getVisionRange(playerMarker);
                
                if (visionRangePx > 0) {
                  // Calculate 3D distance (accounting for elevation/depth differences)
                  const directDx = m.position.x - playerMarker.position.x;
                  const directDy = m.position.y - playerMarker.position.y;
                  const horizontalDistSq = directDx * directDx + directDy * directDy;
                  
                  // Include elevation difference in distance calculation
                  const mElev = (m.elevation?.height || 0) - (m.elevation?.depth || 0);
                  const pElev = (playerMarker.elevation?.height || 0) - (playerMarker.elevation?.depth || 0);
                  const verticalFeet = Math.abs(mElev - pElev);
                  const verticalPx = verticalFeet * pixelsPerFootForVision;
                  
                  const directDistance = Math.sqrt(horizontalDistSq + verticalPx * verticalPx);
                  
                  // Check if within vision range (3D distance)
                  if (directDistance <= visionRangePx) {
                    // Use raycasting to check if tunnel walls block line of sight
                    let isBlocked = false;
                    
                    if (tunnel.walls && tunnel.walls.length > 0) {
                      // Check if any tunnel wall intersects the line of sight
                      // EXCLUDE end caps (last 2 walls) when checking sight between tokens in same tunnel
                      // End caps are at entrance/exit and shouldn't block intra-tunnel vision
                      const sideWalls = tunnel.walls.length > 2 ? tunnel.walls.slice(0, -2) : tunnel.walls;
                      isBlocked = !this.hasLineOfSight(
                        playerMarker.position.x,
                        playerMarker.position.y,
                        m.position.x,
                        m.position.y,
                        sideWalls
                      );
                    }
                    
                    
                    if (!isBlocked) {
                      visibleToPlayerInTunnel = true;
                      break;
                    }
                  }
                }
              }
            }
          }
          }
          
          // Case 2: Burrowed token is NOT in an explicit tunnel - check tunnel path-based visibility
          // If a player is in a tunnel, check path distance along that tunnel to the burrowing token
          if (!visibleToPlayerInTunnel && !m.tunnelState) {
            
            for (const playerMarker of visionRelevantTokens) {
              // Check if player is in a tunnel
              const playerTunnelId = playerMarker.tunnelState?.tunnelId;
              
              
              if (playerTunnelId && config.tunnels) {
                // Player is in a tunnel - find the tunnel and check path distance
                const tunnel = config.tunnels.find((t: any) => t.id === playerTunnelId);
                
                if (tunnel && tunnel.path && tunnel.path.length > 0) {
                  const visionRangePx = getVisionRange(playerMarker);
                  
                  if (visionRangePx > 0) {
                    const playerPathIdx = playerMarker.tunnelState.pathIndex || 0;
                    
                    // Calculate direct distance for logging, but DO NOT use it to bypass corner checks
                    const directDx = m.position.x - playerMarker.position.x;
                    const directDy = m.position.y - playerMarker.position.y;
                    const directDistance = Math.sqrt(directDx * directDx + directDy * directDy);
                    
                    
                    // NOTE: We do NOT use direct distance to determine visibility in tunnels
                    // because there may be corners between the player and the burrowed token.
                    // Instead, we always use path-based distance with corner detection.
                    
                    // For the burrowing token that owns/created this tunnel, it's at the dig head (end of path)
                    // Check if the burrowing token is close to the last point of the tunnel
                    const lastPathPoint = tunnel.path[tunnel.path.length - 1];
                    const distToEnd = Math.sqrt(
                      Math.pow(lastPathPoint.x - m.position.x, 2) + 
                      Math.pow(lastPathPoint.y - m.position.y, 2)
                    );
                    
                    // If the burrowing token is within 50px of the tunnel end, assume it's the owner at dig head
                    const isAtDigHead = distToEnd < 50;
                    const burrowingPathIdx = isAtDigHead ? tunnel.path.length - 1 : (() => {
                      // Find closest point on tunnel path to the burrowing token
                      let closestPathIdx = 0;
                      let closestDist = Infinity;
                      for (let i = 0; i < tunnel.path.length; i++) {
                        const dx = tunnel.path[i].x - m.position.x;
                        const dy = tunnel.path[i].y - m.position.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < closestDist) {
                          closestDist = dist;
                          closestPathIdx = i;
                        }
                      }
                      return closestPathIdx;
                    })();
                    
                    
                    // Check path distance between player and burrower with corner detection
                    // This works for both cases: player ahead of or behind the burrowing token
                    let pathDistance = 0;
                    let cornerBlocked = false;
                    let lastDirection: { dx: number, dy: number } | null = null;
                    
                    const startIdx = Math.min(playerPathIdx, burrowingPathIdx);
                    const endIdx = Math.max(playerPathIdx, burrowingPathIdx);
                    
                    for (let i = startIdx; i < endIdx; i++) {
                      if (i + 1 < tunnel.path.length) {
                        const dx = tunnel.path[i + 1].x - tunnel.path[i].x;
                        const dy = tunnel.path[i + 1].y - tunnel.path[i].y;
                        const segmentDist = Math.sqrt(dx * dx + dy * dy);
                        
                        // Check for corner blocking vision (45Â° threshold)
                        if (lastDirection && segmentDist > 1) {
                          const prevLen = Math.sqrt(lastDirection.dx * lastDirection.dx + lastDirection.dy * lastDirection.dy);
                          const currLen = segmentDist;
                          if (prevLen > 0 && currLen > 0) {
                            const dotProduct = (lastDirection.dx * dx + lastDirection.dy * dy) / (prevLen * currLen);
                            const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
                            if (angle > Math.PI / 4) { // 45Â° threshold
                              cornerBlocked = true;
                              break;
                            }
                          }
                        }
                        
                        pathDistance += segmentDist;
                        lastDirection = { dx, dy };
                      }
                    }
                    
                    
                    // If no corner blocks vision, use DIRECT distance for visibility
                    // (path distance is only used for corner detection, not range)
                    if (!cornerBlocked && directDistance <= visionRangePx) {
                      visibleToPlayerInTunnel = true;
                      break;
                    }
                  }
                }
              } else if (playerMarker.elevation?.isBurrowing) {
                // Player is burrowing (not in explicit tunnel) - use 3D distance
                const visionRangePx = getVisionRange(playerMarker);
                
                if (visionRangePx > 0) {
                  const dx = m.position.x - playerMarker.position.x;
                  const dy = m.position.y - playerMarker.position.y;
                  const horizontalDistSq = dx * dx + dy * dy;
                  
                  // Include elevation difference in distance calculation
                  const mElev = (m.elevation?.height || 0) - (m.elevation?.depth || 0);
                  const pElev = (playerMarker.elevation?.height || 0) - (playerMarker.elevation?.depth || 0);
                  const verticalFeet = Math.abs(mElev - pElev);
                  const verticalPx = verticalFeet * pixelsPerFootForVision;
                  
                  const distance = Math.sqrt(horizontalDistSq + verticalPx * verticalPx);
                  
                  
                  if (distance <= visionRangePx) {
                    visibleToPlayerInTunnel = true;
                    break;
                  }
                }
              }
            }
          }
        }
        
        
        // Update visibility flag for burrowed tokens - MUST set to false if not visible
        m._visibleToTunnelPlayer = visibleToPlayerInTunnel;
        
        // Always skip rendering burrowed tokens here - they'll be drawn on top of fog later if visible
        return;
      }
      // Underground vision cannot see surface tokens â€” earth blocks all vision.
      // When viewing through a tunnel token, ALL non-underground markers are invisible.
      if (config.selectedVisionTokenId && selectedVisionIsInTunnel) {
        return;
      }

      // 3D elevation-aware visibility check for surface tokens (D&D 5e RAW)
      // Only applies when fog of war is enabled (darkness).  In daylight (no fog),
      // all tokens are visible regardless of elevation â€” you can always see a
      // flying creature in broad daylight, no matter how high.
      // When fog IS enabled, a token flying at 80ft directly above a player with
      // 60ft darkvision should NOT be visible because the true 3D distance (80ft)
      // exceeds the vision range (60ft).
      const hasFog = config.fogOfWar && config.fogOfWar.enabled;
      if (hasFog && m.elevation && (m.elevation.height > 0 || m.elevation.depth > 0) && playerTokens.length > 0) {
        const tokenElev = (m.elevation.height || 0) - (m.elevation.depth || 0);
        const pixelsPerFootLocal = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
        
        let visibleToAnyPlayer = false;
        for (const playerMarker of playerTokens) {
          // Get this player's max vision range in feet
          let playerVisionFeet = 0;
          if (playerMarker.darkvision && playerMarker.darkvision > 0) {
            playerVisionFeet = Math.max(playerVisionFeet, playerMarker.darkvision);
          }
          if (playerMarker.light) {
            const totalLight = (playerMarker.light.bright || 0) + (playerMarker.light.dim || 0);
            playerVisionFeet = Math.max(playerVisionFeet, totalLight);
          }
          
          if (playerVisionFeet <= 0) continue;
          
          const playerElev = playerMarker.elevation ? ((playerMarker.elevation.height || 0) - (playerMarker.elevation.depth || 0)) : 0;
          const verticalFeet = Math.abs(tokenElev - playerElev);
          
          // If vertical distance alone exceeds vision range, this player can't see it
          if (verticalFeet > playerVisionFeet) continue;
          
          // Calculate 3D distance in feet
          const dx = m.position.x - playerMarker.position.x;
          const dy = m.position.y - playerMarker.position.y;
          const horizontalPx = Math.sqrt(dx * dx + dy * dy);
          const horizontalFeet = horizontalPx / pixelsPerFootLocal;
          const totalDistFeet = Math.sqrt(horizontalFeet * horizontalFeet + verticalFeet * verticalFeet);
          
          if (totalDistFeet <= playerVisionFeet) {
            visibleToAnyPlayer = true;
            break;
          }
        }
        
        if (!visibleToAnyPlayer) {
          return; // Skip rendering this token
        }
      }

      // Wall-occlusion check: walls always block vision regardless of fog.
      // In daylight (no fog) you can see far, but not through solid walls.
      // When fog IS enabled the fog-of-war polygon already handles this, so
      // we only need the explicit check when fog is OFF.
      // Filter walls the same way drawFogOfWar does: open doors, windows,
      // and terrain don't block line of sight.
      if (!hasFog && ((config.walls && config.walls.length > 0) || (config.envAssets && config.envAssets.length > 0)) && visionRelevantTokens.length > 0) {
        const sightBlockingWalls = (config.walls || []).filter((wall: any) => {
          const type = wall.type || 'wall';
          if ((type === 'door' || type === 'secret') && wall.open) return false;
          if (type === 'window') return false;
          if (type === 'terrain') return false;
          return true;
        });
        // Add env asset vision-blocking walls
        if (config.envAssets && config.envAssets.length > 0) {
          for (const inst of config.envAssets as EnvAssetInstance[]) {
            // â”€â”€ Doors: single wall segment across the door width â”€â”€
            if (inst.doorConfig) {
              const def = this.plugin.envAssetLibrary.getAsset(inst.assetId);
              if (def && def.category === 'door') {
                // Open sliding doors don't block â€“ the doorway is clear
                if (inst.doorConfig.isOpen && inst.doorConfig.behaviour === 'sliding') continue;
                const pad = 2;
                const useW = inst.width >= inst.height;
                const halfSpan = (useW ? inst.width : inst.height) / 2 - pad;
                let p1x = useW ? -halfSpan : 0, p1y = useW ? 0 : -halfSpan, p2x = useW ? halfSpan : 0, p2y = useW ? 0 : halfSpan;
                const dc = inst.doorConfig;
                // Apply door open transform (pivot rotation or slide offset)
                if (dc.isOpen) {
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
                sightBlockingWalls.push({
                  type: 'wall',
                  start: { x: inst.position.x + p1x * cosR - p1y * sinR, y: inst.position.y + p1x * sinR + p1y * cosR },
                  end:   { x: inst.position.x + p2x * cosR - p2y * sinR, y: inst.position.y + p2x * sinR + p2y * cosR },
                  open: false,
                });
                continue;
              }
            }
            // â”€â”€ Scatter: 4-edge bounding box â”€â”€
            if (inst.scatterConfig && inst.scatterConfig.blocksVision) {
              const cx = inst.position.x;
              const cy = inst.position.y;
              const hw = inst.width / 2;
              const hh = inst.height / 2;
              const rad = (inst.rotation || 0) * Math.PI / 180;
              const cosR = Math.cos(rad);
              const sinR = Math.sin(rad);
              const corners = [
                { x: cx + (-hw) * cosR - (-hh) * sinR, y: cy + (-hw) * sinR + (-hh) * cosR },
                { x: cx + ( hw) * cosR - (-hh) * sinR, y: cy + ( hw) * sinR + (-hh) * cosR },
                { x: cx + ( hw) * cosR - ( hh) * sinR, y: cy + ( hw) * sinR + ( hh) * cosR },
                { x: cx + (-hw) * cosR - ( hh) * sinR, y: cy + (-hw) * sinR + ( hh) * cosR },
              ];
              for (let ei = 0; ei < 4; ei++) {
                const s = corners[ei]!;
                const e = corners[(ei + 1) % 4]!;
                sightBlockingWalls.push({ type: 'wall', start: s, end: e, open: false });
              }
            }
          }
        }
        if (sightBlockingWalls.length > 0) {
          let canBeSeenByAnyPlayer = false;
          for (const pt of visionRelevantTokens) {
            if (this.hasLineOfSight(
              pt.position.x, pt.position.y,
              m.position.x, m.position.y,
              sightBlockingWalls,
              (pt.elevation?.height || 0) - (pt.elevation?.depth || 0),
              (m.elevation?.height || 0) - (m.elevation?.depth || 0)
            )) {
              canBeSeenByAnyPlayer = true;
              break;
            }
          }
          if (!canBeSeenByAnyPlayer) {
            return; // Wall blocks line of sight from every player token
          }
        }
      }
      
      this.drawMarker(ctx, m);
    });

    // Draw drag ruler (distance indicator) if a marker is being moved
    // In the Player View, only show the drag ruler for player tokens or
    // tokens explicitly marked as "Show to Players".
    if (config.dragRuler) {
      const dragMarkerDef = config.dragRuler.markerId
        ? this.plugin.markerLibrary.getMarker(config.dragRuler.markerId)
        : null;
      const isPlayerToken = dragMarkerDef && dragMarkerDef.type === 'player';
      const isVisibleToPlayers = !!config.dragRuler.visibleToPlayers;
      if (isPlayerToken || isVisibleToPlayers) {
        this.drawDragRuler(ctx, config);
      }
    }

    // Draw Fog of War (Player view: fully opaque black with light source revelation)
    // Fog must be enabled for darkness to appear - lights reveal areas within the fog
    const hasFogGlobal = config.fogOfWar && config.fogOfWar.enabled;
    if (hasFogGlobal) {
      this.drawFogOfWar(ctx, this.canvas!.width, this.canvas!.height, config);
    } else if (((config.walls && config.walls.length > 0) || (config.envAssets && config.envAssets.some((a: any) => (a.doorConfig && (!a.doorConfig.isOpen || a.doorConfig.behaviour !== 'sliding')) || (a.scatterConfig && a.scatterConfig.blocksVision)))) && visionRelevantTokens.length > 0) {
      // No fog of war, but walls exist â€” draw wall-occlusion overlay.
      // In daylight, players can see infinitely far EXCEPT through walls.
      // Areas behind walls are darkened so the DM's hidden content stays hidden.
      this.drawWallOcclusion(ctx, this.canvas!.width, this.canvas!.height, config, visionRelevantTokens);
    }

    // Redraw tunnel paths ON TOP of fog for underground players
    // This allows them to see the tunnel while surface is covered in fog
    // Only render when viewing through a tunnel token's vision (or default all-players mode with tunnel players)
    const tunnelPlayersForVision = config.selectedVisionTokenId
      ? tunnelPlayersInMarkers.filter((m: any) => m.id === config.selectedVisionTokenId)
      : tunnelPlayersInMarkers;
    if (config.tunnels && config.tunnels.length > 0 && tunnelPlayersForVision.length > 0) {
      const pixelsPerFootTunnel = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
      
      for (const tunnel of config.tunnels) {
        if (!tunnel.visible || !tunnel.active || !tunnel.path || tunnel.path.length < 2) continue;
        
        // Check if any tunnel player (respecting vision selection) is in this tunnel
        const playersInThisTunnel = tunnelPlayersForVision.filter((p: any) => 
          p.tunnelState?.tunnelId === tunnel.id
        );
        
        if (playersInThisTunnel.length === 0) continue;
        
        // Use stored tunnel width or calculate based on creature size
        const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize as CreatureSize] || 1;
        const tunnelWidth = tunnel.tunnelWidth || (squares + 0.5) * config.gridSize;
        
        for (const playerMarker of playersInThisTunnel) {
          const pathIdx = playerMarker.tunnelState?.pathIndex || 0;
          
          // Calculate vision range
          let visionRange = 0;
          if (playerMarker.darkvision && playerMarker.darkvision > 0) {
            visionRange = Math.max(visionRange, playerMarker.darkvision);
          }
          if (playerMarker.lightBright !== undefined) {
            const totalLight = (playerMarker.lightBright || 0) + (playerMarker.lightDim || 0);
            visionRange = Math.max(visionRange, totalLight);
          }
          const visionRangePx = visionRange * pixelsPerFootTunnel;
          
          // Draw the visible portion of tunnel
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Draw background (dirt) - more transparent
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = '#3d2817';
          ctx.lineWidth = tunnelWidth + 8;
          ctx.beginPath();
          
          // Collect points within vision (forward and backward from player position)
          const visiblePoints: { x: number, y: number }[] = [];
          
          // Go backward from player position
          let backwardDist = 0;
          let lastDir: { dx: number, dy: number } | null = null;
          for (let i = pathIdx; i >= 0 && backwardDist < visionRangePx; i--) {
            if (i < tunnel.path.length) {
              if (i > 0) {
                const dx = tunnel.path[i].x - tunnel.path[i-1].x;
                const dy = tunnel.path[i].y - tunnel.path[i-1].y;
                const segDist = Math.sqrt(dx*dx + dy*dy);
                
                if (lastDir && segDist > 1) {
                  const prevLen = Math.sqrt(lastDir.dx*lastDir.dx + lastDir.dy*lastDir.dy);
                  const dot = (lastDir.dx*dx + lastDir.dy*dy) / (prevLen * segDist);
                  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                  if (angle > Math.PI / 4) break; // Corner blocks (45Â°)
                }
                backwardDist += segDist;
                lastDir = { dx, dy };
              }
              visiblePoints.unshift(tunnel.path[i]);
            }
          }
          
          // Go forward from player position
          let forwardDist = 0;
          lastDir = null;
          for (let i = pathIdx + 1; i < tunnel.path.length && forwardDist < visionRangePx; i++) {
            const dx = tunnel.path[i].x - tunnel.path[i-1].x;
            const dy = tunnel.path[i].y - tunnel.path[i-1].y;
            const segDist = Math.sqrt(dx*dx + dy*dy);
            
            if (lastDir && segDist > 1) {
              const prevLen = Math.sqrt(lastDir.dx*lastDir.dx + lastDir.dy*lastDir.dy);
              const dot = (lastDir.dx*dx + lastDir.dy*dy) / (prevLen * segDist);
              const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
              if (angle > Math.PI / 4) break; // Corner blocks (45Â°)
            }
            forwardDist += segDist;
            lastDir = { dx, dy };
            visiblePoints.push(tunnel.path[i]);
          }
          
          // Draw the visible path
          if (visiblePoints.length >= 2 && visiblePoints[0] && visiblePoints[1]) {
            ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
            for (let i = 1; i < visiblePoints.length; i++) {
              const pt = visiblePoints[i];
              if (pt) ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            
            // Draw border
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#654321';
            ctx.lineWidth = tunnelWidth + 4;
            ctx.beginPath();
            ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
            for (let i = 1; i < visiblePoints.length; i++) {
              const pt = visiblePoints[i];
              if (pt) ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            
            // Draw inner path
            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = tunnelWidth * 0.7;
            ctx.beginPath();
            ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
            for (let i = 1; i < visiblePoints.length; i++) {
              const pt = visiblePoints[i];
              if (pt) ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
          }
          
          ctx.restore();
        }
      }
    }

    // Draw player tokens on top of fog - they should always be visible
    // Separate tunnel players to draw them on top of tunnel paths
    const tunnelPlayerTokens = playerTokens.filter((m: any) => m.tunnelState);
    const surfacePlayerTokens = playerTokens.filter((m: any) => !m.tunnelState);
    
    // Draw surface players first â€” but NOT when viewing from underground
    // A token in a tunnel cannot see through the earth to the surface
    if (!config.selectedVisionTokenId || !selectedVisionIsInTunnel) {
      surfacePlayerTokens.forEach((m: any) => this.drawMarker(ctx, m));
    }
    
    // Draw tunnel players on top (after tunnel paths are rendered)
    // BUT: if a specific vision token is selected and it's NOT in a tunnel,
    // don't draw tunnel players â€” surface vision can't see underground
    // When viewing through a specific tunnel token's vision, other tunnel tokens
    // are only visible if they're in the same tunnel, within darkvision/light range,
    // and have unobstructed line of sight through tunnel walls.
    if (!config.selectedVisionTokenId || selectedVisionIsInTunnel) {
      tunnelPlayerTokens.forEach((m: any) => {
        // Always draw the selected vision token itself
        if (config.selectedVisionTokenId && m.id === config.selectedVisionTokenId) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          this.drawMarker(ctx, m);
          ctx.restore();
          return;
        }

        // When a specific tunnel vision token is selected, check if this other
        // tunnel token is actually visible to it (range + line of sight)
        if (config.selectedVisionTokenId && selectedVisionToken) {
          // Must be in the same tunnel
          if (m.tunnelState?.tunnelId !== selectedVisionToken.tunnelState?.tunnelId) {
            return;
          }

          // Calculate vision range (darkvision + light sources)
          let visionRange = 0;
          if (selectedVisionToken.darkvision && selectedVisionToken.darkvision > 0) {
            visionRange = Math.max(visionRange, selectedVisionToken.darkvision);
          }
          let lightBright = 0;
          let lightDim = 0;
          if (selectedVisionToken.light) {
            lightBright = selectedVisionToken.light.bright || 0;
            lightDim = selectedVisionToken.light.dim || 0;
          } else if (selectedVisionToken.lightBright !== undefined || selectedVisionToken.lightDim !== undefined) {
            lightBright = selectedVisionToken.lightBright || 0;
            lightDim = selectedVisionToken.lightDim || 0;
          }
          if (lightBright > 0 || lightDim > 0) {
            visionRange = Math.max(visionRange, lightBright + lightDim);
          }
          const visionRangePx = visionRange * pixelsPerFootForVision;

          if (visionRangePx <= 0) {
            return; // No darkvision or light = can't see anything
          }

          // 3D distance check
          const dx = m.position.x - selectedVisionToken.position.x;
          const dy = m.position.y - selectedVisionToken.position.y;
          const horizontalDistSq = dx * dx + dy * dy;
          const mElev = (m.elevation?.height || 0) - (m.elevation?.depth || 0);
          const pElev = (selectedVisionToken.elevation?.height || 0) - (selectedVisionToken.elevation?.depth || 0);
          const verticalPx = Math.abs(mElev - pElev) * pixelsPerFootForVision;
          const distance = Math.sqrt(horizontalDistSq + verticalPx * verticalPx);

          if (distance > visionRangePx) {
            return;
          }

          // Line of sight check through tunnel walls
          const tunnel = config.tunnels?.find((t: any) => t.id === m.tunnelState?.tunnelId);
          if (tunnel && tunnel.walls && tunnel.walls.length > 0) {
            // Exclude end-cap walls (last 2) for intra-tunnel vision
            const sideWalls = tunnel.walls.length > 2 ? tunnel.walls.slice(0, -2) : tunnel.walls;
            const canSee = this.hasLineOfSight(
              selectedVisionToken.position.x, selectedVisionToken.position.y,
              m.position.x, m.position.y,
              sideWalls
            );
            if (!canSee) {
              return;
            }
          }

        }

        ctx.save();
        ctx.globalAlpha = 0.85; // Mostly visible but slightly transparent to show underground
        this.drawMarker(ctx, m);
        ctx.restore();
      });
    }

    // Draw visible burrowed tokens on top of fog (they were marked visible earlier)
    // These are creature/NPC tokens that were determined visible to tunnel players
    // Includes both burrowing tokens (isBurrowing) and tokens that entered tunnels (tunnelState)
    otherMarkers.forEach((m: any) => {
      if ((m.elevation?.isBurrowing || m.tunnelState) && m._visibleToTunnelPlayer) {
        ctx.save();
        ctx.globalAlpha = 0.5; // Semi-transparent to show underground
        this.drawMarker(ctx, m);
        ctx.restore();
      }
    });

    // Draw auras on top of fog (for all player layer markers)
    const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
    playerMarkers.forEach((marker: any) => {
      if (marker.auras && marker.auras.length > 0) {
        marker.auras.forEach((aura: any) => {
          const radiusPx = (aura.radius || 0) * pixelsPerFoot;
          if (radiusPx > 0) {
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

    // Draw AoE effects on top of fog (Player layer only)
    const playerAoeEffects = (config.aoeEffects || []).filter((a: any) => (a.layer || 'Player') === 'Player');
    playerAoeEffects.forEach((aoe: any) => this.drawAoeEffect(ctx, aoe, config));

    // Draw measure ruler if active
    if (config.measureRuler) {
      this.drawMeasureRuler(ctx, config);
    }

    // Draw target distance ruler if active
    if (config.targetDistRuler) {
      this.drawTargetDistanceRuler(ctx, config);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, config: any) {
    const w = this.canvas!.width;
    const h = this.canvas!.height;
    const offsetX = config.gridOffsetX || 0;
    const offsetY = config.gridOffsetY || 0;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;

    if (config.gridType === 'square') {
      const sizeW = config.gridSizeW || config.gridSize;
      const sizeH = config.gridSizeH || config.gridSize;
      const normalizedOffsetX = ((offsetX % sizeW) + sizeW) % sizeW;
      const normalizedOffsetY = ((offsetY % sizeH) + sizeH) % sizeH;

      // Batch all square grid lines into a single path
      ctx.beginPath();
      for (let x = normalizedOffsetX; x <= w; x += sizeW) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = normalizedOffsetY; y <= h; y += sizeH) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    } else if (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') {
      const geo = this.getPlayerHexGeometry(config);
      
      // Batch all hexagons into a single path â€” one stroke() call
      ctx.beginPath();
      if (config.gridType === 'hex-horizontal') {
        const startCol = Math.floor(-offsetX / geo.horiz) - 2;
        const endCol = Math.ceil((w - offsetX) / geo.horiz) + 2;
        const startRow = Math.floor(-offsetY / geo.vert) - 2;
        const endRow = Math.ceil((h - offsetY) / geo.vert) + 2;

        for (let row = startRow; row < endRow; row++) {
          for (let col = startCol; col < endCol; col++) {
            const colOffsetY = (col & 1) ? geo.vert / 2 : 0;
            const centerX = col * geo.horiz + offsetX;
            const centerY = row * geo.vert + colOffsetY + offsetY;
            this._addHexFlatPath(ctx, centerX, centerY, geo.sizeX, geo.sizeY);
          }
        }
      } else if (config.gridType === 'hex-vertical') {
        const startCol = Math.floor(-offsetX / geo.horiz) - 2;
        const endCol = Math.ceil((w - offsetX) / geo.horiz) + 2;
        const startRow = Math.floor(-offsetY / geo.vert) - 2;
        const endRow = Math.ceil((h - offsetY) / geo.vert) + 2;

        for (let row = startRow; row < endRow; row++) {
          for (let col = startCol; col < endCol; col++) {
            const rowOffsetX = (row & 1) ? geo.horiz / 2 : 0;
            const centerX = col * geo.horiz + rowOffsetX + offsetX;
            const centerY = row * geo.vert + offsetY;
            this._addHexPointyPath(ctx, centerX, centerY, geo.sizeX, geo.sizeY);
          }
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Add flat-top hex outline to current path (no stroke). */
  private _addHexFlatPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /** Add pointy-top hex outline to current path (no stroke). */
  private _addHexPointyPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 6) + (Math.PI / 3) * i;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private drawHexFlatOutline(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private drawHexPointyOutline(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (Math.PI / 3) * i;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private drawHexFlatOutlineStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
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

  private drawHexPointyOutlineStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
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

  // â”€â”€ Hexcrawl helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Calculate effective grid size (fixed single grid â€” no pace scaling). */
  private getPlayerEffectiveGridSize(config: any): number {
    return config.gridSize;
  }

  /** Get W/H-aware hex geometry for the player view */
  private getPlayerHexGeometry(config: any): { horiz: number; vert: number; sizeX: number; sizeY: number } {
    if (config.gridType === 'hex-horizontal') {
      const horiz = config.gridSizeW || config.gridSize;
      const defaultSize = (2 / 3) * horiz;
      const defaultVert = Math.sqrt(3) * defaultSize;
      const vert = config.gridSizeH || defaultVert;
      const sizeX = horiz * (2 / 3);
      const sizeY = vert / Math.sqrt(3);
      return { horiz, vert, sizeX, sizeY };
    } else if (config.gridType === 'hex-vertical') {
      const vert = config.gridSizeH || config.gridSize;
      const defaultSize = (2 / 3) * vert;
      const defaultHoriz = Math.sqrt(3) * defaultSize;
      const horiz = config.gridSizeW || defaultHoriz;
      const sizeY = vert * (2 / 3);
      const sizeX = horiz / Math.sqrt(3);
      return { horiz, vert, sizeX, sizeY };
    } else {
      const s = config.gridSize;
      return { horiz: s, vert: s, sizeX: s, sizeY: s };
    }
  }

  /** Convert hex col/row â†’ pixel centre, matching the GM coordinate system (W/H-aware). */
  private hexToPixel(col: number, row: number, config: any): { x: number; y: number } {
    const ox = config.gridOffsetX || 0;
    const oy = config.gridOffsetY || 0;

    if (config.gridType === 'hex-horizontal') {
      const horiz = config.gridSizeW || config.gridSize;
      const defaultSize = (2 / 3) * horiz;
      const defaultVert = Math.sqrt(3) * defaultSize;
      const vert = config.gridSizeH || defaultVert;
      const colOffsetY = (col & 1) ? vert / 2 : 0;
      return { x: col * horiz + ox, y: row * vert + colOffsetY + oy };
    } else {
      // hex-vertical
      const vert = config.gridSizeH || config.gridSize;
      const defaultSize = (2 / 3) * vert;
      const defaultHoriz = Math.sqrt(3) * defaultSize;
      const horiz = config.gridSizeW || defaultHoriz;
      const rowOffsetX = (row & 1) ? horiz / 2 : 0;
      return { x: col * horiz + rowOffsetX + ox, y: row * vert + oy };
    }
  }

  /**
   * Hex distance for offset-coordinate grids (cube coordinate conversion).
   */
  private hexDistance(c1: number, r1: number, c2: number, r2: number, gridType: string): number {
    if (gridType === 'hex-horizontal') {
      const x1 = c1, z1 = r1 - (c1 - (c1 & 1)) / 2, y1 = -x1 - z1;
      const x2 = c2, z2 = r2 - (c2 - (c2 & 1)) / 2, y2 = -x2 - z2;
      return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
    } else {
      const x1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1, y1 = -x1 - z1;
      const x2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2, y2 = -x2 - z2;
      return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
    }
  }

  /**
   * Render the full hexcrawl layer: terrain fills, climate borders,
   * visited-hex trail, and the pulsing party position marker.
   */
  private drawHexcrawlLayer(ctx: CanvasRenderingContext2D, config: any) {
    const effectiveGridSz = this.getPlayerEffectiveGridSize(config);
    // Get W/H-aware hex geometry
    const playerGeo = this.getPlayerHexGeometry(config);

    // NOTE: Terrain fills and climate borders are intentionally omitted from
    // the player view â€” players only see the map image, the visited trail,
    // and their current party location.

    // â”€â”€ 1. Visited-hex trail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const hcState = config.hexcrawlState;
    if (hcState && hcState.visitedHexes && hcState.visitedHexes.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#c8a85c';
      ctx.lineWidth = Math.max(3, effectiveGridSz * 0.06);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([effectiveGridSz * 0.10, effectiveGridSz * 0.08]);

      ctx.beginPath();
      const first = this.hexToPixel(hcState.visitedHexes[0].col, hcState.visitedHexes[0].row, config);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < hcState.visitedHexes.length; i++) {
        const pt = this.hexToPixel(hcState.visitedHexes[i].col, hcState.visitedHexes[i].row, config);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Draw small dots at each visited hex center
      ctx.setLineDash([]);
      ctx.fillStyle = '#c8a85c';
      hcState.visitedHexes.forEach((vh: any) => {
        const pt = this.hexToPixel(vh.col, vh.row, config);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(3, effectiveGridSz * 0.04), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // â”€â”€ 4. Party position marker (pulsing campfire icon) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (hcState && hcState.enabled && hcState.partyPosition) {
      const pp = this.hexToPixel(hcState.partyPosition.col, hcState.partyPosition.row, config);
      const hexSize = Math.min(playerGeo.sizeX, playerGeo.sizeY);
      const iconRadius = hexSize * 0.65;

      // Outer glow ring (large, warm pulse)
      ctx.save();
      ctx.globalAlpha = 1.0;
      const glow = ctx.createRadialGradient(pp.x, pp.y, iconRadius * 0.3, pp.x, pp.y, iconRadius * 1.6);
      glow.addColorStop(0, 'rgba(255, 180, 50, 0.7)');
      glow.addColorStop(0.6, 'rgba(255, 140, 30, 0.3)');
      glow.addColorStop(1, 'rgba(255, 180, 50, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, iconRadius * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Solid circle background
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'rgba(40, 30, 15, 0.95)';
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c8a85c';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Campfire emoji (large)
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.font = `${Math.round(iconRadius * 1.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ðŸ•ï¸', pp.x, pp.y);
      ctx.restore();
    }

    // â”€â”€ 5. Travel range overlay (synced from GM hexcrawl-move tool) â”€
    const overlay = config.hexcrawlRangeOverlay;
    if (overlay && overlay.active && hcState && hcState.enabled && hcState.partyPosition &&
        (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical')) {
      const partyPos = hcState.partyPosition;
      const tracker = new HexcrawlTracker(hcState, config.hexTerrains || [], config.hexClimates || []);
      const remaining = tracker.getRemainingMovement();

      // Green fill for adjacent affordable hexes (travel is one hex at a time)
      ctx.save();
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = partyPos.col + dc;
          const r = partyPos.row + dr;
          if (c < 0 || r < 0) continue;
          if (c === partyPos.col && r === partyPos.row) continue;
          const dist = this.hexDistance(partyPos.col, partyPos.row, c, r, config.gridType);
          if (dist !== 1) continue;
          const hexCost = tracker.getMovementCostForHex(c, r);
          if (hexCost <= remaining) {
            const center = this.hexToPixel(c, r, config);
            ctx.fillStyle = 'rgba(0, 200, 80, 0.18)';
            ctx.strokeStyle = 'rgba(0, 200, 80, 0.35)';
            ctx.lineWidth = 1.5;
            if (config.gridType === 'hex-horizontal') {
              this.drawFilledHexFlatStretched(ctx, center.x, center.y, playerGeo.sizeX, playerGeo.sizeY);
            } else {
              this.drawFilledHexPointyStretched(ctx, center.x, center.y, playerGeo.sizeX, playerGeo.sizeY);
            }
          }
        }
      }
      ctx.restore();

      // Hover highlight: green if adjacent + affordable, red if not
      const hoverHex = overlay.hoverHex;
      if (hoverHex && !(hoverHex.col === partyPos.col && hoverHex.row === partyPos.row)) {
        const dist = this.hexDistance(partyPos.col, partyPos.row, hoverHex.col, hoverHex.row, config.gridType);
        const hexCost = tracker.getMovementCostForHex(hoverHex.col, hoverHex.row);
        const canMove = dist === 1 && hexCost <= remaining;
        const center = this.hexToPixel(hoverHex.col, hoverHex.row, config);
        ctx.save();
        ctx.fillStyle = canMove ? 'rgba(0, 220, 80, 0.38)' : 'rgba(220, 40, 30, 0.35)';
        ctx.strokeStyle = canMove ? 'rgba(0, 220, 80, 0.7)' : 'rgba(220, 40, 30, 0.65)';
        ctx.lineWidth = 2.5;
        if (config.gridType === 'hex-horizontal') {
          this.drawFilledHexFlatStretched(ctx, center.x, center.y, playerGeo.sizeX, playerGeo.sizeY);
        } else {
          this.drawFilledHexPointyStretched(ctx, center.x, center.y, playerGeo.sizeX, playerGeo.sizeY);
        }
        ctx.restore();
      }
    }
  }

  // â”€â”€ Hexcrawl travel animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Currently running travel animation frame id (for cancellation). */
  private _hexTravelAnimFrame: number = 0;

  /**
   * Animate the party marker moving from one hex to another.
   * Uses requestAnimationFrame for a smooth ~1.5 s transition, then redraws
   * the static scene at the end.
   */
  private animateHexcrawlTravel(fromCol: number, fromRow: number, toCol: number, toRow: number) {
    if (!this.canvas || !this.mapConfig) return;
    const config = this.mapConfig;
    const playerGeo = this.getPlayerHexGeometry(config);
    const hexSize = Math.min(playerGeo.sizeX, playerGeo.sizeY);
    const from = this.hexToPixel(fromCol, fromRow, config);
    const to = this.hexToPixel(toCol, toRow, config);
    const duration = 1400; // ms
    const startTime = performance.now();

    // Cancel any running animation
    if (this._hexTravelAnimFrame) cancelAnimationFrame(this._hexTravelAnimFrame);

    const animFrame = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      // Ease-in-out cubic
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Full redraw (static scene without the old party marker at destination)
      this.redrawAnnotations();
      const ctx = this.canvas?.getContext('2d');
      if (!ctx) return;

      const cx = from.x + (to.x - from.x) * ease;
      const cy = from.y + (to.y - from.y) * ease;
      const iconRadius = hexSize * 0.38;

      // Animated marker glow
      ctx.save();
      const glow = ctx.createRadialGradient(cx, cy, iconRadius * 0.3, cx, cy, iconRadius * 1.8);
      glow.addColorStop(0, `rgba(255, 200, 60, ${0.6 - 0.2 * ease})`);
      glow.addColorStop(1, 'rgba(255, 200, 60, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, iconRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Animated circle
      ctx.save();
      ctx.fillStyle = 'rgba(40, 30, 15, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f0c050';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // Moving icon
      ctx.save();
      ctx.font = `${Math.round(iconRadius * 1.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ðŸ§­', cx, cy);
      ctx.restore();

      // Trail line behind the moving marker
      ctx.save();
      ctx.globalAlpha = 0.4 * (1 - ease * 0.5);
      ctx.strokeStyle = '#f0c050';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();

      if (t < 1) {
        this._hexTravelAnimFrame = requestAnimationFrame(animFrame);
      } else {
        this._hexTravelAnimFrame = 0;
        // Final static redraw at destination
        this.redrawAnnotations();
      }
    };

    this._hexTravelAnimFrame = requestAnimationFrame(animFrame);
  }

  private drawMeasureRuler(ctx: CanvasRenderingContext2D, config: any) {
    if (!config.measureRuler) return;

    const { start, end } = config.measureRuler;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate distance in grid units (feet)
    const gridSize = config.gridSize || 70;
    const scale = config.scale?.value || 5;
    const distanceInFeet = (distance / gridSize) * scale;

    // Draw the ruler line
    ctx.save();
    ctx.strokeStyle = '#ffff00'; // Yellow
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw distance text at midpoint
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const text = `${Math.round(distanceInFeet)}ft`;

    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw text outline for better visibility
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, midX, midY);
    
    // Draw text fill
    ctx.fillStyle = '#ffff00';
    ctx.fillText(text, midX, midY);

    ctx.restore();
  }

  private drawTargetDistanceRuler(ctx: CanvasRenderingContext2D, config: any) {
    if (!config.targetDistRuler) return;

    const { origin, target } = config.targetDistRuler;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const horizontalPixelDist = Math.sqrt(dx * dx + dy * dy);

    const gridSize = config.gridSize || 70;
    const scaleValue = config.scale?.value || 5;
    const scaleUnit = config.scale?.unit || 'feet';
    const horizontalFeet = (horizontalPixelDist / gridSize) * scaleValue;

    // 3D distance with elevation
    const verticalFeet = Math.abs((target.elevation || 0) - (origin.elevation || 0));
    const totalFeetRaw = Math.sqrt(horizontalFeet * horizontalFeet + verticalFeet * verticalFeet);
    const totalFeet = Math.max(scaleValue, Math.round(totalFeetRaw / scaleValue) * scaleValue);

    ctx.save();

    // Draw measurement line (cyan, dashed with glow)
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 5]);
    ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Draw arrowhead at target
    const angle = Math.atan2(dy, dx);
    const arrowLen = 12;
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(target.x - arrowLen * Math.cos(angle - Math.PI / 6), target.y - arrowLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(target.x - arrowLen * Math.cos(angle + Math.PI / 6), target.y - arrowLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Draw distance label at midpoint
    const midX = (origin.x + target.x) / 2;
    const midY = (origin.y + target.y) / 2 - 14;
    let distText = `${totalFeet} ${scaleUnit}`;
    if (verticalFeet > 0) {
      distText += ` (â†•${verticalFeet}ft)`;
    }

    // Background pill for readability
    ctx.font = 'bold 20px Arial';
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

    // Text outline
    ctx.strokeStyle = '#003333';
    ctx.lineWidth = 3;
    ctx.strokeText(distText, midX, midY);

    // Text fill (cyan)
    ctx.fillStyle = '#00ffff';
    ctx.fillText(distText, midX, midY);

    ctx.restore();
  }

  private drawDragRuler(ctx: CanvasRenderingContext2D, config: any) {
    const origin = config.dragRuler.origin;
    const current = config.dragRuler.current;
    const gs = config.gridSize || 70;
    const ox = config.gridOffsetX || 0;
    const oy = config.gridOffsetY || 0;
    const scaleUnit = config.scale?.unit || 'feet';
    const scaleVal = config.scale?.value || 5;

    // Use pre-computed path data from sync payload, or compute locally
    let pathCells: { col: number; row: number; dist: number }[] = config.dragRuler.pathCells || [];
    let totalDist: number = config.dragRuler.totalDist ?? 0;
    let climbDist: number = config.dragRuler.climbDist ?? 0;

    // If no pre-computed path, compute locally (fallback)
    if (pathCells.length === 0 && (origin.x !== current.x || origin.y !== current.y)) {
      const scaleVal = config.scale?.value || 5;
      const startCol = Math.floor((origin.x - ox) / gs);
      const startRow = Math.floor((origin.y - oy) / gs);
      const endCol = Math.floor((current.x - ox) / gs);
      const endRow = Math.floor((current.y - oy) / gs);
      if (startCol !== endCol || startRow !== endRow) {
        let c = startCol, r = startRow;
        const dc = endCol - startCol, dr = endRow - startRow;
        const absDc = Math.abs(dc), absDr = Math.abs(dr);
        const stepC = dc > 0 ? 1 : -1, stepR = dr > 0 ? 1 : -1;
        let diagCount = 0;
        if (absDc >= absDr) {
          let err = absDc / 2;
          for (let i = 0; i < absDc; i++) {
            err -= absDr;
            let movedDiag = false;
            if (err < 0) { r += stepR; err += absDc; movedDiag = true; }
            c += stepC;
            let stepCost: number;
            if (movedDiag) { diagCount++; stepCost = (diagCount % 2 === 1) ? scaleVal : scaleVal * 2; }
            else { stepCost = scaleVal; }
            if (config.difficultTerrain && config.difficultTerrain[`${c},${r}`]) { stepCost *= 2; }
            totalDist += stepCost;
            pathCells.push({ col: c, row: r, dist: totalDist });
          }
        } else {
          let err = absDr / 2;
          for (let i = 0; i < absDr; i++) {
            err -= absDc;
            let movedDiag = false;
            if (err < 0) { c += stepC; err += absDr; movedDiag = true; }
            r += stepR;
            let stepCost: number;
            if (movedDiag) { diagCount++; stepCost = (diagCount % 2 === 1) ? scaleVal : scaleVal * 2; }
            else { stepCost = scaleVal; }
            if (config.difficultTerrain && config.difficultTerrain[`${c},${r}`]) { stepCost *= 2; }
            totalDist += stepCost;
            pathCells.push({ col: c, row: r, dist: totalDist });
          }
        }
      }
    }

    if (pathCells.length === 0) return;

    ctx.save();

    // Highlight traversed cells
    ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.35)';
    ctx.lineWidth = 1.5;
    for (const cell of pathCells) {
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
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Distance label â€” big pill above current position, with 3D elevation awareness
    let displayDist: number;
    if (climbDist > 0) {
      const raw3D = Math.sqrt(totalDist * totalDist + climbDist * climbDist);
      displayDist = Math.max(scaleVal, Math.round(raw3D / scaleVal) * scaleVal);
    } else {
      displayDist = totalDist;
    }
    let labelText = `${displayDist} ${scaleUnit}`;
    if (climbDist > 0) {
      labelText += ` (â†•${climbDist}ft)`;
    }
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const labelX = current.x;
    const labelY = current.y - gs * 0.8;

    const metrics = ctx.measureText(labelText);
    const pillPadX = 10;
    const pillPadY = 5;
    const pillW = metrics.width + pillPadX * 2;
    const pillH = 24 + pillPadY * 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, 8);
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(labelText, labelX, labelY);

    ctx.fillStyle = '#ffff00';
    ctx.fillText(labelText, labelX, labelY);

    ctx.restore();
  }

  private drawAoeEffect(ctx: CanvasRenderingContext2D, aoe: any, config: any) {
    const gs = config.gridSize || 70;
    const origin = aoe.origin;
    const end = aoe.end;
    const dx = end.x - origin.x;
    const dy = end.y - origin.y;
    const rawDist = Math.sqrt(dx * dx + dy * dy);
    const snappedDist = Math.max(gs, Math.round(rawDist / gs) * gs);
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = aoe.color;
    ctx.strokeStyle = aoe.color;
    ctx.lineWidth = 3;

    if (aoe.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, snappedDist, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.stroke();
    } else if (aoe.shape === 'cone') {
      const halfAngle = (53 / 2) * (Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, snappedDist, angle - halfAngle, angle + halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.stroke();
    } else if (aoe.shape === 'square') {
      // Squares are always axis-aligned (no rotation per DMG rules)
      const half = snappedDist;
      ctx.fillRect(origin.x - half, origin.y - half, half * 2, half * 2);
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(origin.x - half, origin.y - half, half * 2, half * 2);
    } else if (aoe.shape === 'line') {
      const halfWidth = gs / 2;
      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(angle);
      ctx.fillRect(0, -halfWidth, snappedDist, halfWidth * 2);
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(0, -halfWidth, snappedDist, halfWidth * 2);
      ctx.restore();
    }

    // Highlight affected grid squares (â‰¥50% coverage per DMG rules)
    if (config.gridType === 'square') {
      ctx.restore(); // restore the AoE shape context first
      const gw = config.gridSizeW || gs;
      const gh = config.gridSizeH || gs;
      const gox = config.gridOffsetX || 0;
      const goy = config.gridOffsetY || 0;
      const reach = snappedDist + gs;
      const colStart = Math.floor((origin.x - reach - gox) / gw) - 1;
      const colEnd = Math.ceil((origin.x + reach * 2 - gox) / gw) + 1;
      const rowStart = Math.floor((origin.y - reach - goy) / gh) - 1;
      const rowEnd = Math.ceil((origin.y + reach * 2 - goy) / gh) + 1;
      const sampleRes = 8;
      const centered = !!aoe.anchorMarkerId;

      // Build AoE path on a tiny offscreen canvas for isPointInPath
      const osc = _canvasPool.acquire(1, 1);
      const oCtx = osc.getContext('2d');
      if (oCtx) {
        oCtx.beginPath();
        if (aoe.shape === 'circle') {
          oCtx.arc(origin.x, origin.y, snappedDist, 0, Math.PI * 2);
        } else if (aoe.shape === 'cone') {
          const ha = (53 / 2) * (Math.PI / 180);
          oCtx.moveTo(origin.x, origin.y);
          oCtx.arc(origin.x, origin.y, snappedDist, angle - ha, angle + ha);
          oCtx.closePath();
        } else if (aoe.shape === 'square') {
          // Squares are always axis-aligned (no rotation)
          const half = snappedDist;
          oCtx.rect(origin.x - half, origin.y - half, half * 2, half * 2);
        } else if (aoe.shape === 'line') {
          const hw = gs / 2;
          oCtx.save(); oCtx.translate(origin.x, origin.y); oCtx.rotate(angle);
          oCtx.rect(0, -hw, snappedDist, hw * 2);
          oCtx.restore();
        }

        ctx.save();
        for (let col = colStart; col <= colEnd; col++) {
          for (let row = rowStart; row <= rowEnd; row++) {
            const cellLeft = col * gw + gox;
            const cellTop = row * gh + goy;
            let hits = 0;
            const total = sampleRes * sampleRes;
            for (let sy = 0; sy < sampleRes; sy++) {
              for (let sx = 0; sx < sampleRes; sx++) {
                const px = cellLeft + (sx + 0.5) * (gw / sampleRes);
                const py = cellTop + (sy + 0.5) * (gh / sampleRes);
                if (oCtx.isPointInPath(px, py)) hits++;
              }
            }
            if (hits >= total * 0.5) {
              ctx.fillStyle = aoe.color;
              ctx.globalAlpha = 0.25;
              ctx.fillRect(cellLeft, cellTop, gw, gh);
              ctx.globalAlpha = 0.4;
              ctx.strokeStyle = aoe.color;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(cellLeft + 0.5, cellTop + 0.5, gw - 1, gh - 1);
            }
          }
        }
        ctx.restore();
      }
      _canvasPool.release(osc);
      ctx.save(); // re-open save for the label section below
    }

    // Size label
    ctx.globalAlpha = 1.0;
    const gridUnits = snappedDist / gs;
    const realSize = gridUnits * (config.scale?.value || 5);
    const unit = config.scale?.unit || 'feet';
    let labelText = '';
    if (aoe.shape === 'circle') labelText = `${realSize.toFixed(0)} ${unit} radius`;
    else if (aoe.shape === 'cone') labelText = `${realSize.toFixed(0)} ${unit} cone`;
    else if (aoe.shape === 'square') labelText = `${(realSize * 2).toFixed(0)} ${unit} cube`;
    else if (aoe.shape === 'line') labelText = `${realSize.toFixed(0)} ${unit} line`;

    let labelX: number, labelY: number;
    if (aoe.shape === 'circle') {
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
  }

  private drawHighlight(ctx: CanvasRenderingContext2D, highlight: any) {
    const config = this.mapConfig;
    ctx.fillStyle = highlight.color + '60';
    ctx.strokeStyle = highlight.color;
    ctx.lineWidth = 2;

    const geo = this.getPlayerHexGeometry(config);
    const center = this.hexToPixel(highlight.col, highlight.row, config);

    if (config.gridType === 'hex-horizontal') {
      this.drawFilledHexFlatStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
    } else if (config.gridType === 'hex-vertical') {
      this.drawFilledHexPointyStretched(ctx, center.x, center.y, geo.sizeX, geo.sizeY);
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
  }
  private drawPoiIcon(ctx: CanvasRenderingContext2D, poiRef: any, config: any) {
    // Skip rendering for hexcrawl/exploration maps - PoIs are GM-only hints
    const isHexcrawlMap = (config.gridType === 'hex-horizontal' || config.gridType === 'hex-vertical') && (config.type === 'world' || config.type === 'regional');
    if (isHexcrawlMap) return;
    ctx.globalAlpha = 0.9; // Slightly transparent for player view
    
    const ox = config.gridOffsetX || 0;
    const oy = config.gridOffsetY || 0;
    
    // Calculate hex center using W/H-aware geometry
    let centerX, centerY;
    if (config.gridType === 'hex-horizontal') {
      const horiz = config.gridSizeW || config.gridSize;
      const defaultSize = (2/3) * horiz;
      const defaultVert = Math.sqrt(3) * defaultSize;
      const vert = config.gridSizeH || defaultVert;
      const colOffsetY = (poiRef.col & 1) ? vert / 2 : 0;
      centerX = poiRef.col * horiz + ox;
      centerY = poiRef.row * vert + colOffsetY + oy;
    } else {
      const vert = config.gridSizeH || config.gridSize;
      const defaultSize = (2/3) * vert;
      const defaultHoriz = Math.sqrt(3) * defaultSize;
      const horiz = config.gridSizeW || defaultHoriz;
      const rowOffsetX = (poiRef.row & 1) ? horiz / 2 : 0;
      centerX = poiRef.col * horiz + rowOffsetX + ox;
      centerY = poiRef.row * vert + oy;
    }
    
    // Load icon from PoI file
    let icon = 'ðŸ“'; // Default icon
    try {
      const fileCache = this.plugin.app.metadataCache.getCache(poiRef.poiFile);
      if (fileCache?.frontmatter?.icon) {
        icon = fileCache.frontmatter.icon;
      }
    } catch (error) {
      console.error('Error loading PoI icon:', error);
    }
    
    // Draw background circle for visibility
    const iconRadius = 18;
    ctx.beginPath();
    ctx.arc(centerX, centerY, iconRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw icon (larger and more visible)
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(icon, centerX, centerY);
    
    // Reset globalAlpha
    ctx.globalAlpha = 1.0;
  }

  private drawFilledHexFlat(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawFilledHexPointy(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawFilledHexFlatStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
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

  private drawFilledHexPointyStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
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

  private drawDrawing(ctx: CanvasRenderingContext2D, drawing: any) {
    if (!drawing.points || drawing.points.length === 0) return;
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = drawing.strokeWidth || 2;
    ctx.beginPath();
    ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
    for (let i = 1; i < drawing.points.length; i++) {
      ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
    }
    ctx.stroke();
  }

  private drawMarker(ctx: CanvasRenderingContext2D, marker: any) {
    const pos = marker.position;
    let markerDef = marker.markerId ? this.plugin.markerLibrary.getMarker(marker.markerId) : null;
    const config = this.mapConfig;

    if (!markerDef) {
      // Fallback rendering for legacy or missing markers
      const radius = 15;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0000';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    const radius = this.getMarkerRadius(markerDef);
    const elevation = marker.elevation;
    const itemLayer = marker.layer || 'Player';

    ctx.save();
    
    // Apply transparency for burrowed tokens (underground)
    if (elevation && elevation.isBurrowing) {
      ctx.globalAlpha = 0.5; // ALL burrowed tokens are semi-transparent
    }
    // Apply transparency for Elevated/Subterranean layers
    else if (itemLayer === 'Elevated' || itemLayer === 'Subterranean') {
      ctx.globalAlpha = 0.6;
    }
    
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
      ctx.arc(pos.x, pos.y, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Reset to main alpha
      if (itemLayer === 'Elevated') {
        ctx.globalAlpha = 0.6;
      }
    }
    
    // Add colored glow for elevated/subterranean
    if (itemLayer === 'Elevated' || itemLayer === 'Subterranean') {
      ctx.save();
      ctx.shadowColor = itemLayer === 'Elevated' ? '#4DA6FF' : '#8B4513';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = itemLayer === 'Elevated' ? '#4DA6FF' : '#8B4513';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.closePath();

    // Try to draw image first
    let imageDrawn = false;
    if (markerDef.imageFile) {
      const cachedImg = this.loadMarkerImage(markerDef.imageFile);
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
          ctx.drawImage(cachedImg, pos.x - drawW / 2, pos.y - drawH / 2, drawW, drawH);
        } else {
          // Cover: fill the token, may crop edges, preserving aspect ratio
          const scale = Math.max(tokenSize / imgW, tokenSize / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          ctx.drawImage(cachedImg, pos.x - drawW / 2, pos.y - drawH / 2, drawW, drawH);
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
    const borderColor = (marker as any).borderColor || markerDef.borderColor || '#ffffff';
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.stroke();

    // Draw icon
    if (markerDef.icon) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '' + Math.max(10, radius * 1.2) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(markerDef.icon, pos.x, pos.y);
    }

    ctx.restore();
    
    // Draw elevation badge
    if (elevation && (elevation.height || elevation.depth)) {
      ctx.save();
      ctx.globalAlpha = 1.0;
      
      const elevationValue = elevation.height || elevation.depth || 0;
      const elevationIcon = elevation.height ? 'â†‘' : 'â†“';
      const elevationLabel = `${elevationIcon}${elevationValue}ft`;
      
      // Measure text to size the pill badge
      const fontSize = Math.max(9, radius * 0.35);
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textWidth = ctx.measureText(elevationLabel).width;
      const pillW = textWidth + 8;
      const pillH = fontSize + 6;
      const pillX = pos.x + radius - pillW + 2;  // Anchored at top-right
      const pillY = pos.y - radius - 2;
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
      const badgeX = pos.x - radius + badgeSize / 2;  // Left side
      const badgeY = pos.y - radius + badgeSize / 2;
      
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
      ctx.fillText('ðŸ”¦', badgeX, badgeY);
      
      ctx.restore();
      
      // Draw highlighted tunnel path for this player's own token
      const tunnel = config.tunnels?.find((t: any) => t.id === marker.tunnelState.tunnelId);
      if (tunnel && tunnel.path.length > 1) {
        ctx.save();
        ctx.globalAlpha = 0.25; // More transparent
        
        const squares = CREATURE_SIZE_SQUARES[tunnel.creatureSize as CreatureSize] || 1;
        const tunnelWidth = tunnel.tunnelWidth || (squares + 0.5) * config.gridSize;
        
        // Draw path up to current position in subtle earth tone color
        ctx.strokeStyle = '#8B7355';  // Muted brown/tan
        ctx.lineWidth = tunnelWidth + 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(tunnel.path[0].x, tunnel.path[0].y);
        for (let i = 1; i <= marker.tunnelState.pathIndex && i < tunnel.path.length; i++) {
          ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
        }
        ctx.stroke();
        
        // Draw remaining path in dimmer color (ONLY within vision range and line-of-sight)
        if (marker.tunnelState.pathIndex < tunnel.path.length - 1) {
          // Calculate vision range for this marker
          const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
          let visionRange = 0;
          if (marker.darkvision && marker.darkvision > 0) {
            visionRange = Math.max(visionRange, marker.darkvision);
          }
          if (marker.light && marker.light.bright !== undefined) {
            const totalLightRange = (marker.light.bright || 0) + (marker.light.dim || 0);
            visionRange = Math.max(visionRange, totalLightRange);
          }
          const visionRangePx = visionRange * pixelsPerFoot;
          
          // Only draw forward path segments within vision and before corners
          if (visionRangePx > 0) {
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = tunnelWidth;
            ctx.beginPath();
            ctx.moveTo(tunnel.path[marker.tunnelState.pathIndex].x, tunnel.path[marker.tunnelState.pathIndex].y);
            
            let forwardDistance = 0;
            let lastDirection: { dx: number, dy: number } | null = null;
            let drewAnySegment = false;
            
            for (let i = marker.tunnelState.pathIndex + 1; i < tunnel.path.length; i++) {
              const dx = tunnel.path[i].x - tunnel.path[i - 1].x;
              const dy = tunnel.path[i].y - tunnel.path[i - 1].y;
              const segmentDist = Math.sqrt(dx * dx + dy * dy);
              
              // Check for corner
              if (lastDirection && segmentDist > 1) {
                const prevLen = Math.sqrt(lastDirection.dx * lastDirection.dx + lastDirection.dy * lastDirection.dy);
                const currLen = segmentDist;
                if (prevLen > 0 && currLen > 0) {
                  const dotProduct = (lastDirection.dx * dx + lastDirection.dy * dy) / (prevLen * currLen);
                  const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
                  if (angle > Math.PI / 4) break; // 45Â° threshold
                }
              }
              
              forwardDistance += segmentDist;
              if (forwardDistance > visionRangePx) break;
              
              ctx.lineTo(tunnel.path[i].x, tunnel.path[i].y);
              lastDirection = { dx, dy };
              drewAnySegment = true;
            }
            
            if (drewAnySegment) {
              ctx.stroke();
            }
          }
        }
        
        ctx.restore();
      }
    }
  }

  private getMarkerRadius(markerDef: any): number {
    const config = this.mapConfig;
    if (['player', 'npc', 'creature'].includes(markerDef.type) && markerDef.creatureSize && config.gridSize) {
      const squares = CREATURE_SIZE_SQUARES[markerDef.creatureSize as CreatureSize] || 1;
      return (squares * config.gridSize) / 2;
    }
    return (markerDef.pixelSize || 30) / 2;
  }

  async onClose() {
    // Cancel flicker animation loop (use correct window context for popout windows)
    if (this._pvFlickerFrameId !== null) {
      (this._pvFlickerWin || window).cancelAnimationFrame(this._pvFlickerFrameId);
      this._pvFlickerFrameId = null;
      this._pvFlickerWin = null;
    }
    
    // Clean up the plugin reference to this view
    if (this.plugin._playerMapViews) {
      this.plugin._playerMapViews.delete(this as any);
    }
    
    // Clean up fullscreen event listener
    if ((this as any)._fullscreenChangeHandler) {
      const win = (this.containerEl as any).win || this.containerEl.ownerDocument?.defaultView;
      if (win) {
        const doc = win.document;
        doc.removeEventListener('fullscreenchange', (this as any)._fullscreenChangeHandler);
      }
    }
    
    this.canvas = null;
    this.mapImage = null;
    this.markerImageCache.clear();
    const container = this.containerEl.children[1];
    if (container) {
      (container as HTMLElement).empty();
    }
  }

  /**
   * Draw wall-occlusion overlay for daylight (no fog) mode.
   * Covers areas behind walls with opaque black so the player
   * cannot see through solid walls.  Uses the same visibility-polygon
   * algorithm as the full fog-of-war system but without darkvision /
   * light-source mechanics â€” in daylight vision is infinite, only
   * blocked by walls.
   */
  private drawWallOcclusion(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    config: any,
    visionTokens: any[]
  ) {
    const fogCanvas = _canvasPool.acquire(w, h);
    const fogCtx = fogCanvas.getContext('2d');
    if (!fogCtx) { _canvasPool.release(fogCanvas); return; }

    // Start fully black (everything is hidden)
    fogCtx.fillStyle = '#000000';
    fogCtx.fillRect(0, 0, w, h);

    // Filter walls: open doors, windows, and terrain don't block vision
    const walls = (config.walls || []).filter((wall: any) => {
      const type = wall.type || 'wall';
      if ((type === 'door' || type === 'secret') && wall.open) return false;
      if (type === 'window') return false;
      if (type === 'terrain') return false;
      return true;
    });

    // Generate virtual walls from env-asset door/scatter instances
    const envAssetWalls: any[] = [];
    if (config.envAssets && config.envAssets.length > 0) {
      for (const inst of config.envAssets) {
        // â”€â”€ Doors: single wall segment across the door width (moves with open state) â”€â”€
        if (inst.doorConfig) {
          const def = this.plugin.envAssetLibrary.getAsset(inst.assetId);
          if (!def || def.category !== 'door') continue;

          // Open sliding doors don't block â€“ the doorway is clear
          if (inst.doorConfig.isOpen && inst.doorConfig.behaviour === 'sliding') continue;

          const pad = 2;
          const useW = inst.width >= inst.height;
          const halfSpan = (useW ? inst.width : inst.height) / 2 - pad;
          let p1x = useW ? -halfSpan : 0, p1y = useW ? 0 : -halfSpan;
          let p2x = useW ?  halfSpan : 0, p2y = useW ? 0 :  halfSpan;
          const dc = inst.doorConfig;

          // Apply door open transform (pivot rotation or slide offset)
          if (dc.isOpen) {
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
          envAssetWalls.push({
            id: `door_wall_${inst.id}`,
            type: 'wall',
            start: {
              x: inst.position.x + p1x * cosR - p1y * sinR,
              y: inst.position.y + p1x * sinR + p1y * cosR,
            },
            end: {
              x: inst.position.x + p2x * cosR - p2y * sinR,
              y: inst.position.y + p2x * sinR + p2y * cosR,
            },
            height: dc.wallHeight || 10,
            open: false,
          });
          continue;
        }

        // â”€â”€ Scatter: 4-edge bounding box (existing behaviour) â”€â”€
        if (inst.scatterConfig && inst.scatterConfig.blocksVision) {
          const wallHeight = inst.scatterConfig.wallHeight || 10;
          const cx = inst.position.x;
          const cy = inst.position.y;
          const hw = inst.width / 2;
          const hh = inst.height / 2;
          const rad = (inst.rotation || 0) * Math.PI / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);
          const corners = [
            { x: cx + (-hw) * cosR - (-hh) * sinR, y: cy + (-hw) * sinR + (-hh) * cosR },
            { x: cx + ( hw) * cosR - (-hh) * sinR, y: cy + ( hw) * sinR + (-hh) * cosR },
            { x: cx + ( hw) * cosR - ( hh) * sinR, y: cy + ( hw) * sinR + ( hh) * cosR },
            { x: cx + (-hw) * cosR - ( hh) * sinR, y: cy + (-hw) * sinR + ( hh) * cosR },
          ];
          for (let i = 0; i < 4; i++) {
            const s = corners[i]!;
            const e = corners[(i + 1) % 4]!;
            envAssetWalls.push({
              id: `env_wall_${inst.id}_${i}`,
              type: 'wall',
              start: { x: s.x, y: s.y },
              end: { x: e.x, y: e.y },
              height: wallHeight,
              open: false,
            });
          }
        }
      }
    }
    const allWalls = walls.concat(envAssetWalls);

    if (allWalls.length === 0) return; // Nothing to occlude

    // For each vision-relevant player token, compute visibility polygon
    // (infinite range â€” only limited by walls) and cut it out of the fog.
    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.fillStyle = 'white';

    for (const pt of visionTokens) {
      const viewerElev = (pt.elevation?.height || 0) - (pt.elevation?.depth || 0);
      const visPoly = this.computeVisibilityPolygon(
        pt.position.x, pt.position.y,
        10000, // effectively infinite range for daylight
        allWalls,
        viewerElev
      );

      if (visPoly.length >= 3) {
        fogCtx.beginPath();
        const first = visPoly[0];
        if (first) {
          fogCtx.moveTo(first.x, first.y);
          for (let i = 1; i < visPoly.length; i++) {
            const p = visPoly[i];
            if (p) fogCtx.lineTo(p.x, p.y);
          }
          fogCtx.closePath();
          fogCtx.fill();
        }
      }
    }

    // Also cut out light source visibility (torches on walls etc.
    // illuminate their side even when no player is nearby)
    const allLights: any[] = [];
    if (config.lightSources && config.lightSources.length > 0) {
      allLights.push(...config.lightSources.filter((l: any) => l.active !== false));
    }
    if (config.markers && config.markers.length > 0) {
      config.markers.forEach((marker: any) => {
        if (marker.light && marker.light.bright !== undefined && !marker.tunnelState) {
          allLights.push({
            x: marker.position.x,
            y: marker.position.y,
            bright: marker.light.bright,
            dim: marker.light.dim
          });
        }
      });
    }
    const pixelsPerFoot = config.gridSize && config.scale?.value
      ? config.gridSize / config.scale.value : 1;
    for (const light of allLights) {
      const totalRadius = ((light.bright || 0) + (light.dim || 0)) * pixelsPerFoot;
      if (totalRadius <= 0) continue;
      const visPoly = this.computeVisibilityPolygon(light.x, light.y, totalRadius, allWalls);
      if (visPoly.length >= 3) {
        fogCtx.beginPath();
        const first = visPoly[0];
        if (first) {
          fogCtx.moveTo(first.x, first.y);
          for (let i = 1; i < visPoly.length; i++) {
            const p = visPoly[i];
            if (p) fogCtx.lineTo(p.x, p.y);
          }
          fogCtx.closePath();
          fogCtx.fill();
        }
      }
    }

    // Composite the occlusion overlay onto the main canvas
    fogCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogCanvas, 0, 0);
    _canvasPool.release(fogCanvas);

  }

  private drawFogOfWar(ctx: CanvasRenderingContext2D, w: number, h: number, config: any) {
    const fogCanvas = _canvasPool.acquire(w, h);
    const fogCtx = fogCanvas.getContext('2d');
    if (!fogCtx) { _canvasPool.release(fogCanvas); return; }

    // Start fully black (darkness covers everything)
    fogCtx.fillStyle = '#000000';
    fogCtx.fillRect(0, 0, w, h);

    // In player view, IGNORE pre-revealed fog regions
    // Only player tokens (darkvision + lights) reveal areas
    // This implements "SchrÃ¶dinger's light" - light only exists when observed by a player

    // Light sources reveal fog in player view
    // Combine standalone lights and marker-attached lights
    const allLights: any[] = [];
    
    // Add standalone light sources (only active ones - default to active if not specified)
    if (config.lightSources && config.lightSources.length > 0) {
      const activeLights = config.lightSources.filter((light: any) => light.active !== false);
      allLights.push(...activeLights);
    }
    
    // Add lights attached to markers (follows marker position)
    // Note: Marker lights don't have an active property - they're always active
    // SKIP lights from tunnel tokens - they don't reveal above-ground fog
    // Lights are physical and illuminate the area regardless of whose vision is selected
    if (config.markers && config.markers.length > 0) {
      config.markers.forEach((marker: any) => {
        if (marker.light && marker.light.bright !== undefined) {
          // Skip lights from tokens in tunnels
          if (marker.tunnelState) {
            return;
          }
          allLights.push({
            x: marker.position.x,
            y: marker.position.y,
            bright: marker.light.bright,
            dim: marker.light.dim,
            type: marker.light.type || '',
            customColor: marker.light.customColor || undefined,
            name: marker.light.name || 'Token Light',
            attachedToMarker: marker.id,
            elevation: (marker.elevation?.height || 0) - (marker.elevation?.depth || 0)
          });
        }
      });
    }
    
    // Collect vision tokens - defines what's visible in the player view
    // If selectedVisionTokenId is set, use ONLY that token (any type: player, creature, NPC)
    // Otherwise, use all player-type tokens + visibleToPlayers tokens (default combined vision)
    // SKIP tokens in tunnels (underground) - they don't reveal above-ground fog
    const playerTokens: { x: number; y: number; darkvision: number; elevation: number }[] = [];
    if (config.markers && config.markers.length > 0) {
      config.markers.forEach((marker: any) => {
        if (!marker.markerId) return;
        
        // Skip tokens in tunnels (underground)
        if (marker.tunnelState) {
          return;
        }
        
        const markerDef = this.plugin.markerLibrary.getMarker(marker.markerId);
        if (!markerDef) return;
        
        // Determine if this token should contribute to vision
        let includeToken = false;
        if (config.selectedVisionTokenId) {
          // Single-token mode: only include the selected token (any type)
          includeToken = (marker.id === config.selectedVisionTokenId);
        } else {
          // Default mode: player tokens + visibleToPlayers tokens contribute to vision
          includeToken = (markerDef.type === 'player' || !!marker.visibleToPlayers);
        }
        
        if (includeToken) {
          playerTokens.push({
            x: marker.position.x,
            y: marker.position.y,
            darkvision: marker.darkvision || 0,
            elevation: (marker.elevation?.height || 0) - (marker.elevation?.depth || 0)
          });
        }
      });
    }
    
    const pixelsPerFoot = config.gridSize && config.scale?.value ? config.gridSize / config.scale.value : 1;
    // Filter walls to only include those that block sight
    // Open doors/windows allow light through, windows/terrain always allow light
    const walls = (config.walls || []).filter((wall: any) => {
      const type = wall.type || 'wall';
      // Open doors (and open secret doors) allow light through
      if ((type === 'door' || type === 'secret') && wall.open) {
        return false;
      }
      // Windows are transparent - always allow light through (even when closed)
      if (type === 'window') {
        return false;
      }
      // Terrain doesn't block sight
      if (type === 'terrain') {
        return false;
      }
      return true;
    });

    // Add door-wall segments from env-asset doors
    if (config.envAssets && config.envAssets.length > 0) {
      for (const inst of config.envAssets as EnvAssetInstance[]) {
        if (!inst.doorConfig) continue;
        const def = this.plugin.envAssetLibrary.getAsset(inst.assetId);
        if (!def || def.category !== 'door') continue;
        // Open sliding doors don't block â€“ the doorway is clear
        if (inst.doorConfig.isOpen && inst.doorConfig.behaviour === 'sliding') continue;
        const pad = 2;
        const useW = inst.width >= inst.height;
        const halfSpan = (useW ? inst.width : inst.height) / 2 - pad;
        let p1x = useW ? -halfSpan : 0, p1y = useW ? 0 : -halfSpan, p2x = useW ? halfSpan : 0, p2y = useW ? 0 : halfSpan;
        // Apply door open transform (pivot rotation or slide offset)
        const dc = inst.doorConfig;
        if (dc.isOpen) {
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
        walls.push({
          id: `door_wall_${inst.id}`,
          type: 'wall',
          start: { x: inst.position.x + p1x * cosR - p1y * sinR, y: inst.position.y + p1x * sinR + p1y * cosR },
          end:   { x: inst.position.x + p2x * cosR - p2y * sinR, y: inst.position.y + p2x * sinR + p2y * cosR },
          open: false,
        });
      }
    }
    
    // Create player NORMAL VISION mask - union of all player vision cones
    // Normal vision allows players to see lights from any distance (only blocked by walls)
    const playerVisionCanvas = _canvasPool.acquire(w, h);
    const playerVisionCtx = playerVisionCanvas.getContext('2d');
    
    if (playerVisionCtx && playerTokens.length > 0) {
      playerVisionCtx.fillStyle = 'white';
      playerTokens.forEach((pt: any) => {
        // Normal vision extends very far (simulate infinite by using large radius)
        const normalVisionRadius = 10000; // px, effectively infinite
        const visPoly = this.computeVisibilityPolygon(pt.x, pt.y, normalVisionRadius, walls, pt.elevation);
        if (visPoly.length >= 3) {
          playerVisionCtx.beginPath();
          const first = visPoly[0];
          if (first) {
            playerVisionCtx.moveTo(first.x, first.y);
            for (let i = 1; i < visPoly.length; i++) {
              const pt = visPoly[i];
              if (pt) playerVisionCtx.lineTo(pt.x, pt.y);
            }
            playerVisionCtx.closePath();
            playerVisionCtx.fill();
          }
        }
      });
    }
    
    // Create player DARKVISION mask (for grayscale overlay later)
    const playerDarkvisionCanvas = _canvasPool.acquire(w, h);
    const playerDarkvisionCtx = playerDarkvisionCanvas.getContext('2d');
    
    if (playerDarkvisionCtx && playerTokens.length > 0) {
      playerDarkvisionCtx.fillStyle = 'white';
      playerTokens.forEach((pt: any) => {
        if (pt.darkvision > 0) {
          const radiusPx = pt.darkvision * pixelsPerFoot;
          const visPoly = this.computeVisibilityPolygon(pt.x, pt.y, radiusPx, walls, pt.elevation);
          if (visPoly.length >= 3) {
            playerDarkvisionCtx.beginPath();
            const first = visPoly[0];
            if (first) {
              playerDarkvisionCtx.moveTo(first.x, first.y);
              for (let i = 1; i < visPoly.length; i++) {
                const pt = visPoly[i];
                if (pt) playerDarkvisionCtx.lineTo(pt.x, pt.y);
              }
              playerDarkvisionCtx.closePath();
              playerDarkvisionCtx.fill();
            }
          }
        }
      });
    }
    
    // Draw lights - intersect each light with player vision cones
    if (allLights.length > 0 && playerVisionCtx) {
      
      allLights.forEach((light: any, i: number) => {
        // Apply flicker/buzz modulation for lights
        const pvFlickerKey = `pv_light_${light.attachedToMarker || i}`;
        const pvIsBuzz = BUZZ_LIGHT_TYPES_SET.has(light.type);
        const pvShouldFlicker = FLICKER_LIGHT_TYPES_SET.has(light.type);
        const pvFlickerTime = performance.now() / 1000;
        const pvFlicker = pvShouldFlicker
          ? (pvIsBuzz
            ? computeNeonBuzz(getFlickerSeedForKey(pvFlickerKey), pvFlickerTime)
            : computeLightFlicker(getFlickerSeedForKey(pvFlickerKey), pvFlickerTime, 'high'))
          : { radius: 1, alpha: 1 };
        
        const brightRadiusPx = light.bright * pixelsPerFoot * pvFlicker.radius;
        const dimRadiusPx = light.dim * pixelsPerFoot * pvFlicker.radius;
        const totalRadiusPx = brightRadiusPx + dimRadiusPx;
        
        if (totalRadiusPx <= 0) {
          return;
        }
        
        
        // Create temp canvas for this light
        const lightCanvas = _canvasPool.acquire(w, h);
        const lightCtx = lightCanvas.getContext('2d');
        
        if (lightCtx) {
          if (light.start && light.end && light.type === 'walllight') {
            // --- Wall light: sample points along line ---
            const wlDx = light.end.x - light.start.x;
            const wlDy = light.end.y - light.start.y;
            const wlLen = Math.sqrt(wlDx * wlDx + wlDy * wlDy);
            const wlStep = Math.min(totalRadiusPx * 0.4, 20);
            const wlSamples = Math.max(Math.ceil(wlLen / wlStep), 2);

            for (let si = 0; si < wlSamples; si++) {
              const t = wlSamples <= 1 ? 0.5 : si / (wlSamples - 1);
              const sx = light.start.x + wlDx * t;
              const sy = light.start.y + wlDy * t;

              const vis = this.computeVisibilityPolygon(sx, sy, totalRadiusPx, walls, light.elevation || 0);
              if (vis.length < 3) continue;

              lightCtx.save();
              lightCtx.beginPath();
              lightCtx.moveTo(vis[0]!.x, vis[0]!.y);
              for (let vi = 1; vi < vis.length; vi++) lightCtx.lineTo(vis[vi]!.x, vis[vi]!.y);
              lightCtx.closePath();
              lightCtx.clip();

              const featherR = totalRadiusPx * 1.06;
              const g = lightCtx.createRadialGradient(sx, sy, 0, sx, sy, featherR);
              if (brightRadiusPx > 0 && dimRadiusPx > 0) {
                const bR = brightRadiusPx / featherR;
                g.addColorStop(0, 'rgba(255,255,255,1)');
                g.addColorStop(bR * 0.8, 'rgba(255,255,255,1)');
                g.addColorStop(bR, 'rgba(255,255,255,0.78)');
                g.addColorStop(bR + (1 - bR) * 0.45, 'rgba(255,255,255,0.45)');
                g.addColorStop(totalRadiusPx / featherR, 'rgba(255,255,255,0.18)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
              } else if (brightRadiusPx > 0) {
                g.addColorStop(0, 'rgba(255,255,255,1)');
                g.addColorStop(0.65, 'rgba(255,255,255,0.85)');
                g.addColorStop(totalRadiusPx / featherR, 'rgba(255,255,255,0.2)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
              } else {
                g.addColorStop(0, 'rgba(255,255,255,0.7)');
                g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
                g.addColorStop(totalRadiusPx / featherR, 'rgba(255,255,255,0.1)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
              }
              lightCtx.fillStyle = g;
              lightCtx.beginPath();
              lightCtx.arc(sx, sy, featherR, 0, Math.PI * 2);
              lightCtx.fill();
              lightCtx.restore();
            }
          } else {
          // Draw the light on transparent canvas (makes white areas)
          lightCtx.save();
          
          // Compute light visibility with wall occlusion
          const lightVisPoly = this.computeVisibilityPolygon(light.x, light.y, totalRadiusPx, walls, light.elevation || 0);
          
          if (lightVisPoly.length >= 3) {
            // Clip to light visibility
            lightCtx.beginPath();
            const firstPt = lightVisPoly[0];
            if (firstPt) {
              lightCtx.moveTo(firstPt.x, firstPt.y);
              for (let j = 1; j < lightVisPoly.length; j++) {
                const pt = lightVisPoly[j];
                if (pt) lightCtx.lineTo(pt.x, pt.y);
              }
              lightCtx.closePath();
              lightCtx.clip();
            }
            
            // Draw light with smooth radial gradient (bright â†’ dim â†’ fade)
            const featherR = totalRadiusPx * 1.06;
            const lightGrad = lightCtx.createRadialGradient(
              light.x, light.y, 0,
              light.x, light.y, featherR
            );
            if (brightRadiusPx > 0 && dimRadiusPx > 0) {
              const bR = brightRadiusPx / featherR;
              lightGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
              lightGrad.addColorStop(bR * 0.8, 'rgba(255, 255, 255, 1.0)');
              lightGrad.addColorStop(bR, 'rgba(255, 255, 255, 0.78)');
              lightGrad.addColorStop(bR + (1 - bR) * 0.45, 'rgba(255, 255, 255, 0.45)');
              lightGrad.addColorStop(totalRadiusPx / featherR, 'rgba(255, 255, 255, 0.18)');
              lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else if (brightRadiusPx > 0) {
              lightGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
              lightGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.85)');
              lightGrad.addColorStop(totalRadiusPx / featherR, 'rgba(255, 255, 255, 0.2)');
              lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else {
              lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
              lightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
              lightGrad.addColorStop(totalRadiusPx / featherR, 'rgba(255, 255, 255, 0.1)');
              lightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            }
            lightCtx.fillStyle = lightGrad;
            lightCtx.beginPath();
            lightCtx.arc(light.x, light.y, featherR, 0, Math.PI * 2);
            lightCtx.fill();
          }
          
          lightCtx.restore();
          } // end else (point light fog-punch)
          
          // Now intersect with player vision - only show where light rays AND player vision overlap
          lightCtx.globalCompositeOperation = 'destination-in';
          lightCtx.drawImage(playerVisionCanvas, 0, 0);
          
          // Apply to fog canvas (remove fog where light is)
          fogCtx.globalCompositeOperation = 'destination-out';
          fogCtx.drawImage(lightCanvas, 0, 0);
          fogCtx.globalCompositeOperation = 'source-over';
          
          _canvasPool.release(lightCanvas);
        }
      });
    }
    
    // Darkvision reveals fog but shows grayscale
    // Collect markers with darkvision for fog reveal
    // Respects selectedVisionTokenId: single-token mode uses only the selected token (any type)
    // Default mode uses all player-type tokens + visibleToPlayers tokens
    const darkvisionMarkers: any[] = [];
    if (config.markers && config.markers.length > 0) {
      config.markers.forEach((marker: any) => {
        if (!marker.markerId || !marker.darkvision || marker.darkvision <= 0) return;
        
        // Skip tokens in tunnels - they don't reveal surface fog
        if (marker.tunnelState) {
          return;
        }
        
        const markerDef = this.plugin.markerLibrary.getMarker(marker.markerId);
        if (!markerDef) return;
        
        // Determine if this token should contribute to darkvision
        let includeToken = false;
        if (config.selectedVisionTokenId) {
          // Single-token mode: only include the selected token (any type)
          includeToken = (marker.id === config.selectedVisionTokenId);
        } else {
          // Default mode: player tokens + visibleToPlayers tokens contribute
          includeToken = (markerDef.type === 'player' || !!marker.visibleToPlayers);
        }
        
        if (includeToken) {
          darkvisionMarkers.push({
            x: marker.position.x,
            y: marker.position.y,
            range: marker.darkvision,
            elevation: (marker.elevation?.height || 0) - (marker.elevation?.depth || 0)
          });
        }
      });
    }
    
    
    // Create grayscale overlay canvas (for darkvision-only areas)
    const grayscaleCanvas = _canvasPool.acquire(w, h);
    const grayCtx = grayscaleCanvas.getContext('2d');
    
    if (darkvisionMarkers.length > 0 && grayCtx) {
      
      // First, draw darkvision to reveal fog (cuts holes in fog canvas)
      darkvisionMarkers.forEach((dv: any, i: number) => {
        const radiusPx = dv.range * pixelsPerFoot;
        if (radiusPx > 0) {
          // Darkvision reveals fog with wall occlusion (pass elevation so elevated tokens see over low walls)
          this.drawLightWithShadows(fogCtx, dv.x, dv.y, radiusPx, 0, walls, dv.elevation || 0);
        }
      });
      
      // Build grayscale overlay: areas where darkvision reveals but no actual light
      // Start with dark gray overlay
      grayCtx.fillStyle = 'rgba(60, 60, 80, 0.6)';
      grayCtx.fillRect(0, 0, w, h);
      
      // FIRST: Clip grayscale to ONLY darkvision areas (before cutting out lights)
      grayCtx.globalCompositeOperation = 'destination-in';
      if (playerDarkvisionCtx) {
        grayCtx.drawImage(playerDarkvisionCanvas, 0, 0);
      }
      
      // SECOND: Cut out areas where actual lights are visible to players - those should be full color
      grayCtx.globalCompositeOperation = 'destination-out';
      if (allLights.length > 0 && playerVisionCtx) {
        allLights.forEach((light: any, li: number) => {
          // Apply flicker/buzz modulation for lights (grayscale cutout)
          const gsFlickerKey = `pv_light_${light.attachedToMarker || li}`;
          const gsIsBuzz = BUZZ_LIGHT_TYPES_SET.has(light.type);
          const gsShouldFlicker = FLICKER_LIGHT_TYPES_SET.has(light.type);
          const gsFlickerTime = performance.now() / 1000;
          const gsFlicker = gsShouldFlicker
            ? (gsIsBuzz
              ? computeNeonBuzz(getFlickerSeedForKey(gsFlickerKey), gsFlickerTime)
              : computeLightFlicker(getFlickerSeedForKey(gsFlickerKey), gsFlickerTime, 'high'))
            : { radius: 1, alpha: 1 };
          
          const brightRadiusPx = light.bright * pixelsPerFoot * gsFlicker.radius;
          const dimRadiusPx = light.dim * pixelsPerFoot * gsFlicker.radius;
          const totalRadiusPx = brightRadiusPx + dimRadiusPx;
          
          if (totalRadiusPx <= 0) return;
          
          // Create temp canvas for this light's illuminated area
          const lightCanvas = _canvasPool.acquire(w, h);
          const lightCtx = lightCanvas.getContext('2d');
          
          if (lightCtx) {
            if (light.start && light.end && light.type === 'walllight') {
              // --- Wall light grayscale cutout: sample along line ---
              const wlDx = light.end.x - light.start.x;
              const wlDy = light.end.y - light.start.y;
              const wlLen = Math.sqrt(wlDx * wlDx + wlDy * wlDy);
              const wlStep = Math.min(totalRadiusPx * 0.4, 20);
              const wlSamples = Math.max(Math.ceil(wlLen / wlStep), 2);

              for (let si = 0; si < wlSamples; si++) {
                const t = wlSamples <= 1 ? 0.5 : si / (wlSamples - 1);
                const sx = light.start.x + wlDx * t;
                const sy = light.start.y + wlDy * t;

                const vis = this.computeVisibilityPolygon(sx, sy, totalRadiusPx, walls, light.elevation || 0);
                if (vis.length < 3) continue;

                lightCtx.save();
                lightCtx.beginPath();
                lightCtx.moveTo(vis[0]!.x, vis[0]!.y);
                for (let vi = 1; vi < vis.length; vi++) lightCtx.lineTo(vis[vi]!.x, vis[vi]!.y);
                lightCtx.closePath();
                lightCtx.clip();

                const gFeatherR = totalRadiusPx * 1.06;
                const gGrad = lightCtx.createRadialGradient(sx, sy, 0, sx, sy, gFeatherR);
                if (brightRadiusPx > 0 && dimRadiusPx > 0) {
                  const gBR = brightRadiusPx / gFeatherR;
                  gGrad.addColorStop(0, 'rgba(255,255,255,1)');
                  gGrad.addColorStop(gBR * 0.8, 'rgba(255,255,255,1)');
                  gGrad.addColorStop(gBR, 'rgba(255,255,255,0.78)');
                  gGrad.addColorStop(gBR + (1 - gBR) * 0.45, 'rgba(255,255,255,0.45)');
                  gGrad.addColorStop(totalRadiusPx / gFeatherR, 'rgba(255,255,255,0.18)');
                  gGrad.addColorStop(1, 'rgba(255,255,255,0)');
                } else if (brightRadiusPx > 0) {
                  gGrad.addColorStop(0, 'rgba(255,255,255,1)');
                  gGrad.addColorStop(0.65, 'rgba(255,255,255,0.85)');
                  gGrad.addColorStop(totalRadiusPx / gFeatherR, 'rgba(255,255,255,0.2)');
                  gGrad.addColorStop(1, 'rgba(255,255,255,0)');
                } else {
                  gGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
                  gGrad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
                  gGrad.addColorStop(totalRadiusPx / gFeatherR, 'rgba(255,255,255,0.1)');
                  gGrad.addColorStop(1, 'rgba(255,255,255,0)');
                }
                lightCtx.fillStyle = gGrad;
                lightCtx.beginPath();
                lightCtx.arc(sx, sy, gFeatherR, 0, Math.PI * 2);
                lightCtx.fill();
                lightCtx.restore();
              }

              // Clip to player vision
              lightCtx.globalCompositeOperation = 'destination-in';
              lightCtx.drawImage(playerVisionCanvas, 0, 0);

              // Remove from grayscale
              grayCtx.drawImage(lightCanvas, 0, 0);
            } else {
            // Compute light visibility with wall occlusion
            const lightVisPoly = this.computeVisibilityPolygon(light.x, light.y, totalRadiusPx, walls, light.elevation || 0);
            
            if (lightVisPoly.length >= 3) {
              lightCtx.save();
              
              // Clip to light visibility
              lightCtx.beginPath();
              const firstPt = lightVisPoly[0];
              if (firstPt) {
                lightCtx.moveTo(firstPt.x, firstPt.y);
                for (let j = 1; j < lightVisPoly.length; j++) {
                  const pt = lightVisPoly[j];
                  if (pt) lightCtx.lineTo(pt.x, pt.y);
                }
                lightCtx.closePath();
                lightCtx.clip();
              }
              
              // Draw light with smooth gradient (where light IS present)
              const gFeatherR = totalRadiusPx * 1.06;
              const gGrad = lightCtx.createRadialGradient(
                light.x, light.y, 0,
                light.x, light.y, gFeatherR
              );
              if (brightRadiusPx > 0 && dimRadiusPx > 0) {
                const gBR = brightRadiusPx / gFeatherR;
                gGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
                gGrad.addColorStop(gBR * 0.8, 'rgba(255, 255, 255, 1.0)');
                gGrad.addColorStop(gBR, 'rgba(255, 255, 255, 0.78)');
                gGrad.addColorStop(gBR + (1 - gBR) * 0.45, 'rgba(255, 255, 255, 0.45)');
                gGrad.addColorStop(totalRadiusPx / gFeatherR, 'rgba(255, 255, 255, 0.18)');
                gGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
              } else if (brightRadiusPx > 0) {
                gGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
                gGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.85)');
                gGrad.addColorStop(totalRadiusPx / gFeatherR, 'rgba(255, 255, 255, 0.2)');
                gGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
              } else {
                gGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
                gGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
                gGrad.addColorStop(totalRadiusPx / gFeatherR, 'rgba(255, 255, 255, 0.1)');
                gGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
              }
              lightCtx.fillStyle = gGrad;
              lightCtx.beginPath();
              lightCtx.arc(light.x, light.y, gFeatherR, 0, Math.PI * 2);
              lightCtx.fill();
              
              lightCtx.restore();
              
              // Clip to player vision (only parts players can see)
              lightCtx.globalCompositeOperation = 'destination-in';
              lightCtx.drawImage(playerVisionCanvas, 0, 0);
              
              // Remove from grayscale (make these lit areas full color)
              grayCtx.drawImage(lightCanvas, 0, 0);
            }
            } // end else (point light grayscale cutout)
          }
          _canvasPool.release(lightCanvas);
        });
      }
    }

    // Draw fully opaque fog for player view
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.restore();
    _canvasPool.release(fogCanvas);
    
    // Draw coloured light glow overlay (visible through revealed fog areas)
    if (allLights.length > 0 && playerVisionCtx) {
      const lightColorCanvas = _canvasPool.acquire(w, h);
      const lcCtx = lightColorCanvas.getContext('2d');
      if (lcCtx) {
        allLights.forEach((light: any, li: number) => {
          // Resolve colour â€“ default warm yellow for normal lights, cyan for fluorescent
          const defaultHex = light.type === 'fluorescent' ? '#00ffff' : '#ffff88';
          const colHex = light.customColor || defaultHex;
          const col = hexToRgb(colHex);
          const colDim = { r: Math.floor(col.r * 0.67), g: Math.floor(col.g * 0.67), b: Math.floor(col.b * 0.48) };

          // Flicker / buzz
          const lcFlickerKey = `pv_light_${light.attachedToMarker || li}`;
          const lcIsBuzz = BUZZ_LIGHT_TYPES_SET.has(light.type);
          const lcShouldFlicker = FLICKER_LIGHT_TYPES_SET.has(light.type);
          const lcTime = performance.now() / 1000;
          const lcFlicker = lcShouldFlicker
            ? (lcIsBuzz
              ? computeNeonBuzz(getFlickerSeedForKey(lcFlickerKey), lcTime)
              : computeLightFlicker(getFlickerSeedForKey(lcFlickerKey), lcTime, 'high'))
            : { radius: 1, alpha: 1 };

          const brightPx = light.bright * pixelsPerFoot * lcFlicker.radius;
          const dimPx = light.dim * pixelsPerFoot * lcFlicker.radius;
          const totalPx = brightPx + dimPx;
          if (totalPx <= 0) return;

          // Temp canvas for this single light glow
          const singleCanvas = _canvasPool.acquire(w, h);
          const sCtx = singleCanvas.getContext('2d');
          if (!sCtx) { _canvasPool.release(singleCanvas); return; }

          if (light.start && light.end && light.type === 'walllight') {
            // --- Wall light colour overlay: sample along line ---
            const wlDx = light.end.x - light.start.x;
            const wlDy = light.end.y - light.start.y;
            const wlLen = Math.sqrt(wlDx * wlDx + wlDy * wlDy);
            const wlStep = Math.min(totalPx * 0.4, 20);
            const wlSamples = Math.max(Math.ceil(wlLen / wlStep), 2);

            for (let si = 0; si < wlSamples; si++) {
              const t = wlSamples <= 1 ? 0.5 : si / (wlSamples - 1);
              const sx = light.start.x + wlDx * t;
              const sy = light.start.y + wlDy * t;

              const vis = this.computeVisibilityPolygon(sx, sy, totalPx, walls, light.elevation || 0);
              if (vis.length < 3) continue;

              sCtx.save();
              sCtx.beginPath();
              sCtx.moveTo(vis[0]!.x, vis[0]!.y);
              for (let vi = 1; vi < vis.length; vi++) sCtx.lineTo(vis[vi]!.x, vis[vi]!.y);
              sCtx.closePath();
              sCtx.clip();

              const grad = sCtx.createRadialGradient(sx, sy, 0, sx, sy, totalPx);
              if (brightPx > 0 && dimPx > 0) {
                const bR = brightPx / totalPx;
                grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.18)`);
                grad.addColorStop(bR * 0.75, `rgba(${col.r},${col.g},${col.b},0.14)`);
                grad.addColorStop(bR, `rgba(${colDim.r},${colDim.g},${colDim.b},0.09)`);
                grad.addColorStop(Math.min(bR + (1 - bR) * 0.5, 0.95), `rgba(${colDim.r},${colDim.g},${colDim.b},0.04)`);
                grad.addColorStop(1, `rgba(${colDim.r},${colDim.g},${colDim.b},0)`);
              } else if (brightPx > 0) {
                grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.18)`);
                grad.addColorStop(0.7, `rgba(${col.r},${col.g},${col.b},0.10)`);
                grad.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
              } else {
                grad.addColorStop(0, `rgba(${colDim.r},${colDim.g},${colDim.b},0.10)`);
                grad.addColorStop(0.6, `rgba(${colDim.r},${colDim.g},${colDim.b},0.05)`);
                grad.addColorStop(1, `rgba(${colDim.r},${colDim.g},${colDim.b},0)`);
              }
              sCtx.globalAlpha = lcFlicker.alpha;
              sCtx.fillStyle = grad;
              sCtx.beginPath();
              sCtx.arc(sx, sy, totalPx, 0, Math.PI * 2);
              sCtx.fill();
              sCtx.restore();
            }
          } else {
          // Compute wall-occluded visibility
          const visPoly = this.computeVisibilityPolygon(light.x, light.y, totalPx, walls, light.elevation || 0);
          if (visPoly.length < 3) return;

          sCtx.save();
          // Clip to visibility polygon
          sCtx.beginPath();
          const fp = visPoly[0];
          if (fp) {
            sCtx.moveTo(fp.x, fp.y);
            for (let j = 1; j < visPoly.length; j++) {
              const vp = visPoly[j];
              if (vp) sCtx.lineTo(vp.x, vp.y);
            }
            sCtx.closePath();
            sCtx.clip();
          }

          // Draw coloured radial gradient
          const grad = sCtx.createRadialGradient(light.x, light.y, 0, light.x, light.y, totalPx);
          if (brightPx > 0 && dimPx > 0) {
            const bR = brightPx / totalPx;
            grad.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, 0.18)`);
            grad.addColorStop(bR * 0.75, `rgba(${col.r}, ${col.g}, ${col.b}, 0.14)`);
            grad.addColorStop(bR, `rgba(${colDim.r}, ${colDim.g}, ${colDim.b}, 0.09)`);
            grad.addColorStop(Math.min(bR + (1 - bR) * 0.5, 0.95), `rgba(${colDim.r}, ${colDim.g}, ${colDim.b}, 0.04)`);
            grad.addColorStop(1, `rgba(${colDim.r}, ${colDim.g}, ${colDim.b}, 0)`);
          } else if (brightPx > 0) {
            grad.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, 0.18)`);
            grad.addColorStop(0.7, `rgba(${col.r}, ${col.g}, ${col.b}, 0.10)`);
            grad.addColorStop(1, `rgba(${col.r}, ${col.g}, ${col.b}, 0)`);
          } else {
            grad.addColorStop(0, `rgba(${colDim.r}, ${colDim.g}, ${colDim.b}, 0.10)`);
            grad.addColorStop(0.6, `rgba(${colDim.r}, ${colDim.g}, ${colDim.b}, 0.05)`);
            grad.addColorStop(1, `rgba(${colDim.r}, ${colDim.g}, ${colDim.b}, 0)`);
          }
          sCtx.globalAlpha = lcFlicker.alpha;
          sCtx.fillStyle = grad;
          sCtx.beginPath();
          sCtx.arc(light.x, light.y, totalPx, 0, Math.PI * 2);
          sCtx.fill();
          sCtx.restore();
          } // end else (point light colour overlay)

          // Clip to player vision
          sCtx.globalCompositeOperation = 'destination-in';
          sCtx.drawImage(playerVisionCanvas, 0, 0);

          // Accumulate onto shared light-color canvas
          lcCtx.drawImage(singleCanvas, 0, 0);
          _canvasPool.release(singleCanvas);
        });

        // Composite colour overlay onto the main canvas (over fog)
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(lightColorCanvas, 0, 0);
        ctx.restore();
        _canvasPool.release(lightColorCanvas);
      }
    }
    
    // Apply grayscale overlay on top (darkvision tint)
    if (darkvisionMarkers.length > 0 && grayCtx) {
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(grayscaleCanvas, 0, 0);
      ctx.restore();
    } else {
    }
    _canvasPool.releaseAll(playerVisionCanvas, playerDarkvisionCanvas, grayscaleCanvas);
  }

  /**
   * Draw light with wall occlusion using visibility polygon algorithm
   * Bright zone is fully revealed, dim zone is partially revealed (50% fog remains)
   */
  private drawLightWithShadows(
    fogCtx: CanvasRenderingContext2D,
    lightX: number,
    lightY: number,
    brightRadius: number,
    dimRadius: number,
    walls: any[],
    viewerElevation: number = 0
  ) {
    const totalRadius = brightRadius + dimRadius;
    if (totalRadius <= 0) return;

    // Compute visibility polygon using ray casting (pass elevation so elevated viewers see over low walls)
    const visibilityPoly = this.computeVisibilityPolygon(lightX, lightY, totalRadius, walls, viewerElevation);
    
    if (visibilityPoly.length < 3) {
      // No walls or no valid polygon - draw full circle with smooth gradient
      fogCtx.save();
      fogCtx.globalCompositeOperation = 'destination-out';
      
      const featherR = totalRadius * 1.06;
      const grad = fogCtx.createRadialGradient(
        lightX, lightY, 0,
        lightX, lightY, featherR
      );
      if (brightRadius > 0 && dimRadius > 0) {
        const bR = brightRadius / featherR;
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(bR * 0.8, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(bR, 'rgba(255, 255, 255, 0.78)');
        grad.addColorStop(bR + (1 - bR) * 0.45, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(totalRadius / featherR, 'rgba(255, 255, 255, 0.18)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else if (brightRadius > 0) {
        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
        grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.85)');
        grad.addColorStop(totalRadius / featherR, 'rgba(255, 255, 255, 0.2)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(totalRadius / featherR, 'rgba(255, 255, 255, 0.1)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      fogCtx.fillStyle = grad;
      fogCtx.beginPath();
      fogCtx.arc(lightX, lightY, featherR, 0, Math.PI * 2);
      fogCtx.fill();
      
      fogCtx.restore();
      return;
    }

    // Draw using visibility polygon as clip
    fogCtx.save();
    
    // Create clipping path from visibility polygon
    fogCtx.beginPath();
    const firstPt = visibilityPoly[0];
    if (!firstPt) return;
    fogCtx.moveTo(firstPt.x, firstPt.y);
    for (let i = 1; i < visibilityPoly.length; i++) {
      const pt = visibilityPoly[i];
      if (pt) fogCtx.lineTo(pt.x, pt.y);
    }
    fogCtx.closePath();
    fogCtx.clip();
    
    // Draw light within clipped area with smooth gradient
    fogCtx.globalCompositeOperation = 'destination-out';
    
    const featherRClip = totalRadius * 1.06;
    const gradClip = fogCtx.createRadialGradient(
      lightX, lightY, 0,
      lightX, lightY, featherRClip
    );
    if (brightRadius > 0 && dimRadius > 0) {
      const bR = brightRadius / featherRClip;
      gradClip.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      gradClip.addColorStop(bR * 0.8, 'rgba(255, 255, 255, 1.0)');
      gradClip.addColorStop(bR, 'rgba(255, 255, 255, 0.78)');
      gradClip.addColorStop(bR + (1 - bR) * 0.45, 'rgba(255, 255, 255, 0.45)');
      gradClip.addColorStop(totalRadius / featherRClip, 'rgba(255, 255, 255, 0.18)');
      gradClip.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else if (brightRadius > 0) {
      gradClip.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      gradClip.addColorStop(0.65, 'rgba(255, 255, 255, 0.85)');
      gradClip.addColorStop(totalRadius / featherRClip, 'rgba(255, 255, 255, 0.2)');
      gradClip.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
      gradClip.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      gradClip.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
      gradClip.addColorStop(totalRadius / featherRClip, 'rgba(255, 255, 255, 0.1)');
      gradClip.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }
    fogCtx.fillStyle = gradClip;
    fogCtx.beginPath();
    fogCtx.arc(lightX, lightY, featherRClip, 0, Math.PI * 2);
    fogCtx.fill();
    
    fogCtx.restore();
  }

  /**
   * Compute visibility polygon from a point using ray casting
   * Returns array of points forming the visible area boundary
   */
  /**
   * Check if there is a clear line of sight between two points (not blocked by walls)
   */
  private hasLineOfSight(
    x1: number, y1: number,
    x2: number, y2: number,
    walls: any[],
    viewerElevation: number = 0,
    targetElevation: number = 0
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return true; // Same point
    
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    // Check if ray from (x1,y1) to (x2,y2) intersects any wall
    for (const wall of walls) {
      if (!wall.start || !wall.end) continue;
      
      // D&D wall height model: if EITHER the viewer OR the target is above the wall,
      // the wall doesn't block line of sight.
      // - Viewer above: looking down over the wall (flying creature sees ground targets)
      // - Target above: visible above the wall from below (ground creature sees flyer)
      // This matches computeVisibilityPolygon's simple model and D&D 5e expectations.
      if (wall.height !== undefined && wall.height !== null) {
        const maxElevation = Math.max(viewerElevation, targetElevation);
        if (maxElevation > wall.height) continue;
      }
      
      const t = this.raySegmentIntersection(
        x1, y1, dirX, dirY,
        wall.start.x, wall.start.y,
        wall.end.x, wall.end.y
      );
      
      // If intersection exists and is closer than target, line of sight is blocked
      if (t !== null && t > 0.1 && t < distance - 0.1) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Generate wall segments for a tunnel from its path
   * Creates parallel walls on both sides of the path
   */
  private generateTunnelWalls(
    path: Array<{x: number, y: number}>,
    tunnelWidth: number
  ): Array<{start: {x: number, y: number}, end: {x: number, y: number}}> {
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
  }

  private computeVisibilityPolygon(
    originX: number,
    originY: number,
    maxRadius: number,
    walls: any[],
    viewerElevation: number = 0
  ): { x: number; y: number }[] {
    // â”€â”€ Memoization: check cache before doing O(nÂ²) work â”€â”€
    const _wHash = _getWallsHash(walls);
    const _cKey  = _visCacheKey(originX, originY, maxRadius, viewerElevation, _wHash);
    const _cached = _visCacheMap.get(_cKey);
    if (_cached) return _cached;

    // Collect all wall segments within range
    const segments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
    
    // Add bounding circle as segments (approximated with many points)
    const circleSegments = 64;
    for (let i = 0; i < circleSegments; i++) {
      const angle1 = (i / circleSegments) * Math.PI * 2;
      const angle2 = ((i + 1) / circleSegments) * Math.PI * 2;
      segments.push({
        p1: { x: originX + Math.cos(angle1) * maxRadius, y: originY + Math.sin(angle1) * maxRadius },
        p2: { x: originX + Math.cos(angle2) * maxRadius, y: originY + Math.sin(angle2) * maxRadius }
      });
    }
    
    // Add wall segments
    walls.forEach((wall: any) => {
      if (!wall.start || !wall.end) return;
      
      // Wall height check: viewer above this wall can see over it
      if (wall.height !== undefined && wall.height !== null && viewerElevation > wall.height) return;
      
      // Only consider walls that might be within range
      const dx1 = wall.start.x - originX;
      const dy1 = wall.start.y - originY;
      const dx2 = wall.end.x - originX;
      const dy2 = wall.end.y - originY;
      const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      
      if (dist1 > maxRadius * 2 && dist2 > maxRadius * 2) return;
      
      segments.push({
        p1: { x: wall.start.x, y: wall.start.y },
        p2: { x: wall.end.x, y: wall.end.y }
      });
    });
    
    // --- Wall gap prevention: snap nearby endpoints + extend segments ---
    // This fixes light leaking through tiny gaps where walls don't perfectly meet.
    const wallSegStart = circleSegments; // first N segments are bounding circle
    
    // 1) Snap nearby wall endpoints together (< 4px apart) to close micro-gaps
    const snapDistSq = 4 * 4; // 4 pixels, squared for fast comparison
    const wepRefs: { x: number; y: number }[] = [];
    for (let wi = wallSegStart; wi < segments.length; wi++) {
      const s = segments[wi]!;
      wepRefs.push(s.p1, s.p2);
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
    
    // 2) Extend each wall segment 2px past its endpoints to seal junction gaps
    const extPx = 2;
    for (let wi = wallSegStart; wi < segments.length; wi++) {
      const seg = segments[wi]!;
      const edx = seg.p2.x - seg.p1.x;
      const edy = seg.p2.y - seg.p1.y;
      const eLen = Math.sqrt(edx * edx + edy * edy);
      if (eLen > 0) {
        const ux = edx / eLen;
        const uy = edy / eLen;
        seg.p1.x -= ux * extPx;
        seg.p1.y -= uy * extPx;
        seg.p2.x += ux * extPx;
        seg.p2.y += uy * extPx;
      }
    }
    
    // Collect all unique angles to wall endpoints
    const angles: number[] = [];
    const epsilon = 0.00001;
    
    segments.forEach(seg => {
      const dx1 = seg.p1.x - originX;
      const dy1 = seg.p1.y - originY;
      const dx2 = seg.p2.x - originX;
      const dy2 = seg.p2.y - originY;
      
      const angle1 = Math.atan2(dy1, dx1);
      const angle2 = Math.atan2(dy2, dx2);
      
      // Cast 3 rays per endpoint: one to the point, one slightly before, one slightly after
      angles.push(angle1 - epsilon, angle1, angle1 + epsilon);
      angles.push(angle2 - epsilon, angle2, angle2 + epsilon);
    });
    
    // Sort angles
    angles.sort((a, b) => a - b);
    
    // Cast rays and find intersection points
    const points: { x: number; y: number; angle: number }[] = [];
    
    for (const angle of angles) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      
      // Find closest intersection
      let closestT = maxRadius;
      
      for (const seg of segments) {
        const t = this.raySegmentIntersection(
          originX, originY, dx, dy,
          seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y
        );
        
        if (t !== null && t > 0 && t < closestT) {
          closestT = t;
        }
      }
      
      points.push({
        x: originX + dx * closestT,
        y: originY + dy * closestT,
        angle: angle
      });
    }
    
    // Remove duplicate points (very close together)
    const uniquePoints: { x: number; y: number }[] = [];
    for (const pt of points) {
      if (uniquePoints.length === 0) {
        uniquePoints.push({ x: pt.x, y: pt.y });
      } else {
        const last = uniquePoints[uniquePoints.length - 1];
        if (last) {
          const dist = Math.sqrt((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2);
          if (dist > 0.5) {
            uniquePoints.push({ x: pt.x, y: pt.y });
          }
        }
      }
    }
    
    // â”€â”€ Populate cache (cap size to prevent unbounded growth) â”€â”€
    if (_visCacheMap.size >= _VIS_CACHE_MAX) _visCacheMap.clear();
    _visCacheMap.set(_cKey, uniquePoints);
    return uniquePoints;
  }

  /**
   * Calculate intersection of ray with line segment
   * Returns distance t along ray, or null if no intersection
   */
  private raySegmentIntersection(
    rayX: number, rayY: number,
    rayDx: number, rayDy: number,
    segX1: number, segY1: number,
    segX2: number, segY2: number
  ): number | null {
    const segDx = segX2 - segX1;
    const segDy = segY2 - segY1;
    
    const denom = rayDx * segDy - rayDy * segDx;
    if (Math.abs(denom) < 0.00001) return null; // Parallel
    
    const t = ((segX1 - rayX) * segDy - (segY1 - rayY) * segDx) / denom;
    const u = ((segX1 - rayX) * rayDy - (segY1 - rayY) * rayDx) / denom;
    
    if (t > 0 && u >= 0 && u <= 1) {
      return t;
    }
    
    return null;
  }

  /**
   * Check if a point is inside a polygon using ray casting algorithm
   */
  private pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
    if (polygon.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      if (!pi || !pj) continue;
      
      const xi = pi.x, yi = pi.y;
      const xj = pj.x, yj = pj.y;
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * Draw light with wall occlusion, intersected with player visibility
   * Only reveals areas that both the light illuminates AND players can see
   */
  private drawLightWithPlayerVisibility(
    fogCtx: CanvasRenderingContext2D,
    lightX: number,
    lightY: number,
    brightRadius: number,
    dimRadius: number,
    walls: any[],
    playerVisCanvas: HTMLCanvasElement
  ) {
    const totalRadius = brightRadius + dimRadius;
    if (totalRadius <= 0) return;

    // Compute light's visibility polygon
    const lightVisPoly = this.computeVisibilityPolygon(lightX, lightY, totalRadius, walls);
    
    if (lightVisPoly.length < 3) {
      // No valid polygon - fallback
      return;
    }

    // Create a temporary canvas for the light
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = fogCtx.canvas.width;
    tempCanvas.height = fogCtx.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Draw the light's visibility polygon on temp canvas
    tempCtx.fillStyle = 'white';
    tempCtx.beginPath();
    const first = lightVisPoly[0];
    if (!first) return;
    tempCtx.moveTo(first.x, first.y);
    for (let i = 1; i < lightVisPoly.length; i++) {
      const pt = lightVisPoly[i];
      if (pt) tempCtx.lineTo(pt.x, pt.y);
    }
    tempCtx.closePath();
    tempCtx.fill();

    // Intersect with player visibility using destination-in
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(playerVisCanvas, 0, 0);
    
    // Now tempCanvas contains only the intersection of light and player visibility
    // Use this as a clip mask to draw the light effect on fog
    fogCtx.save();
    
    // Create clip from the intersection
    fogCtx.globalCompositeOperation = 'destination-out';
    
    // Draw bright zone
    if (brightRadius > 0) {
      // Create another temp canvas for bright zone clipped by intersection
      const brightCanvas = document.createElement('canvas');
      brightCanvas.width = fogCtx.canvas.width;
      brightCanvas.height = fogCtx.canvas.height;
      const brightCtx = brightCanvas.getContext('2d');
      if (brightCtx) {
        // Draw bright circle
        brightCtx.fillStyle = 'white';
        brightCtx.beginPath();
        brightCtx.arc(lightX, lightY, brightRadius, 0, Math.PI * 2);
        brightCtx.fill();
        
        // Intersect with light+player visibility
        brightCtx.globalCompositeOperation = 'destination-in';
        brightCtx.drawImage(tempCanvas, 0, 0);
        
        // Apply to fog with full opacity
        fogCtx.globalAlpha = 1.0;
        fogCtx.drawImage(brightCanvas, 0, 0);
      }
    }
    
    // Draw dim zone
    if (dimRadius > 0) {
      const dimCanvas = document.createElement('canvas');
      dimCanvas.width = fogCtx.canvas.width;
      dimCanvas.height = fogCtx.canvas.height;
      const dimCtx = dimCanvas.getContext('2d');
      if (dimCtx) {
        // Draw dim ring (total - bright)
        dimCtx.fillStyle = 'white';
        dimCtx.beginPath();
        dimCtx.arc(lightX, lightY, totalRadius, 0, Math.PI * 2);
        dimCtx.arc(lightX, lightY, brightRadius, 0, Math.PI * 2, true);
        dimCtx.fill();
        
        // Intersect with light+player visibility
        dimCtx.globalCompositeOperation = 'destination-in';
        dimCtx.drawImage(tempCanvas, 0, 0);
        
        // Apply to fog with partial opacity (dim light)
        fogCtx.globalAlpha = 0.7;
        fogCtx.drawImage(dimCanvas, 0, 0);
      }
    }
    
    fogCtx.restore();
  }
}