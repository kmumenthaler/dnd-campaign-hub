import { App, Editor, ItemView, MarkdownView, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, TextComponent, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import {
  WORLD_TEMPLATE,
  SESSION_GM_TEMPLATE,
  SESSION_PLAYER_TEMPLATE,
  NPC_TEMPLATE,
  PC_TEMPLATE,
  ADVENTURE_TEMPLATE,
  SCENE_TEMPLATE,
  TRAP_TEMPLATE,
  FACTION_TEMPLATE,
  ITEM_TEMPLATE,
  SPELL_TEMPLATE,
  CAMPAIGN_TEMPLATE,
  SESSION_DEFAULT_TEMPLATE
} from "./templates";
import { MapManager } from "./map/MapManager";
import { MapController } from "./map/MapController";
import { MapCreationModal, BATTLEMAP_TEMPLATE_FOLDER } from "./map/MapCreationModal";
import { MapManagerModal } from "./map/MapManagerModal";
import { TemplatePickerModal } from "./map/TemplatePickerModal";
import { magicWandDetect } from "./map/MagicWandWallModal";
import { MarkerLibrary } from "./marker/MarkerLibrary";
import { MarkerReference, MarkerDefinition, MarkerType, CREATURE_SIZE_SQUARES, CreatureSize, Layer } from "./marker/MarkerTypes";
import { MigrationRunner, MigrationModal, TEMPLATE_VERSIONS, createMigrationRegistry } from "./migration";
import type { MigrationRegistry } from "./migration";
import { MusicPlayer } from "./music/MusicPlayer";
import { MusicSettingsModal } from "./music/MusicSettingsModal";
import { FreesoundSearchModal } from "./music/FreesoundSearchModal";
import { DEFAULT_PLAYBACK_STATE } from "./music/types";
import type { MusicSettings, SceneMusicConfig, MusicPlaybackState } from "./music/types";
import { DEFAULT_MUSIC_SETTINGS, AUDIO_EXTENSIONS } from "./music/types";
import { MusicPlayerLeafView, MUSIC_PLAYER_VIEW_TYPE } from "./music/MusicPlayerView";
import { SceneMusicModal, renderSceneMusicBlock, buildSceneMusicCodeblock } from "./music/SceneMusicBlock";
import { SoundEffectModal, renderSoundEffectBlock, buildSoundEffectCodeblock } from "./music/SoundEffectBlock";
import { SceneSnippetSuggest } from "./scene/SceneSnippets";
import { RandomEncounterTableModal } from "./encounter/RandomEncounterTableModal";
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
  HexcrawlView,
  HEXCRAWL_VIEW_TYPE,
  CLIMATE_DEFINITIONS,
  getClimateDefinition,
  drawClimateHexBorder,
  getHexClimateAt,
  hLoc,
  EncounterBattlemapModal,
} from './hexcrawl';
import { EnvAssetLibrary } from './envasset/EnvAssetLibrary';
import { showEnvAssetContextMenu } from './envasset/EnvAssetContextMenu';
import type {
  EnvAssetInstance,
  EnvAssetDefinition,
  TransformHandle,
} from './envasset/EnvAssetTypes';
import {
  TRANSFORM_HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
} from './envasset/EnvAssetTypes';
import type {
  TerrainType,
  HexTerrain,
  HexcrawlState,
  TerrainPickerState,
  HexcrawlBridge,
  ClimateType,
  HexClimate,
} from './hexcrawl';

//  Extracted types & constants 
import type { DndCampaignHubSettings, TabletopCalibration } from './types';
import { DEFAULT_SETTINGS } from './types';
import {
  SESSION_PREP_VIEW_TYPE,
  SESSION_RUN_VIEW_TYPE,
  DM_SCREEN_VIEW_TYPE,
  PLAYER_MAP_VIEW_TYPE,
  GM_MAP_VIEW_TYPE,
  COMBAT_TRACKER_VIEW_TYPE,
  COMBAT_PLAYER_VIEW_TYPE,
  IDLE_SCREEN_VIEW_TYPE,
  PURSUIT_TRACKER_VIEW_TYPE,
  PURSUIT_PLAYER_VIEW_TYPE,
  HANDOUT_PROJECTION_VIEW_TYPE,
} from './constants';
import type { MapMediaElement } from './constants';

//  Extracted utilities (aliased to match original names used in plugin class) 
import { canvasPool as _canvasPool } from './utils/CanvasPool';
import { getWallsHash as _getWallsHash, visCacheKey as _visCacheKey, visCacheMap as _visCacheMap, VIS_CACHE_MAX as _VIS_CACHE_MAX } from './utils/VisibilityCache';
import { computeLightFlicker, computeNeonBuzz, hexToRgb, getFlickerSeedForKey, FLICKER_LIGHT_TYPES_SET, BUZZ_LIGHT_TYPES_SET } from './utils/LightFlicker';
import { parseYamlFrontmatter, updateYamlFrontmatter } from './utils/YamlFrontmatter';

//  Extracted modals & views 
import { GridCalibrationModal } from './utils/GridCalibrationModal';
import { CreatureSelectorModal, MultiCreatureSelectorModal, RenameCreatureModal } from './utils/CreatureModals';
import { ConfirmModal, NamePromptModal, ClearDrawingsConfirmModal } from './utils/ConfirmModal';
import { PDFFileSuggest, PDFBrowserModal } from './utils/PDFBrowser';
import { EncounterBuilderModal } from './encounter/EncounterBuilderModal';
import { EncounterBuilder } from './encounter/EncounterBuilder';
import { CombatTracker } from './combat/CombatTracker';
import { CombatTrackerView } from './combat/CombatTrackerView';
import { PartyManager } from './party/PartyManager';
import { PartyManagerModal } from './party/PartyManagerModal';
import { CombatPlayerView } from './combat/CombatPlayerView';
import { PCCreationModal } from './character/PCCreationModal';
import { ImportPCModal } from './character/ImportPCModal';
import { NPCCreationModal } from './character/NPCCreationModal';
import { SessionPrepDashboardView } from './session/SessionPrepDashboardView';
import { TimerNameModal } from './session/TimerNameModal';
import { SessionRunDashboardView } from './session/SessionRunDashboardView';
import { SessionCreationModal } from './session/SessionCreationModal';
import { EndSessionModal } from './session/EndSessionModal';
import { DMScreenView } from './dm-screen/DMScreenView';
import { CampaignCreationModal } from './campaign/CampaignCreationModal';
import { renderEntityTable } from './rendering/TableRenderer';
import { renderView } from './rendering/ViewRenderer';

import { CalendarDateInputModal } from './campaign/CalendarDateInputModal';
import { AdventureCreationModal } from './adventure/AdventureCreationModal';
import { SceneCreationModal } from './scene/SceneCreationModal';
import { TrapCreationModal } from './trap/TrapCreationModal';
import { ItemCreationModal } from './item/ItemCreationModal';
import { CreatureCreationModal } from './creature/CreatureCreationModal';
import { FactionCreationModal } from './faction/FactionCreationModal';
import { SpellImportModal } from './spell/SpellImportModal';
import { SpellDetailsModal } from './spell/SpellDetailsModal';
import { DndCampaignHubSettingTab } from './settings/SettingsTab';
import { DndHubModal } from './hub/DndHubModal';
import { PurgeConfirmModal } from './hub/PurgeConfirmModal';
import { DeleteMapConfirmModal } from './map-views/DeleteMapConfirmModal';
import { TabletopCalibrationModal } from './map-views/TabletopCalibrationModal';
import { GmMapView } from './map-views/GmMapView';
import { PlayerMapView } from './map-views/PlayerMapView';
import { ProjectionManager } from './projection/ProjectionManager';
import { SessionProjectionManager, IdleScreenView, SessionProjectionHubModal, HandoutProjectionView } from './projection';
import type { HandoutContentType } from './projection/types';
import { PursuitTracker } from './pursuit/PursuitTracker';
import { PursuitTrackerView } from './pursuit/PursuitTrackerView';
import { PursuitPlayerView } from './pursuit/PursuitPlayerView';
import { PursuitSetupModal } from './pursuit/PursuitSetupModal';
import { CombatPursuitSync } from './pursuit/CombatPursuitSync';

// ── Extracted function modules ──
import { renderMapView as renderMapViewFn } from './map-views/renderMapView';
import { renderEncounterView as renderEncounterViewFn } from './encounter/renderEncounterView';
import { renderPoiView as renderPoiViewFn } from './poi/renderPoiView';
import { renderPartyView as renderPartyViewFn } from './party/renderPartyView';
import {
  saveMapAnnotations as saveMapAnnotationsFn,
  _flushMapSave as _flushMapSaveFn,
  _flushAllPendingSaves as _flushAllPendingSavesFn,
  getMapAnnotationPath as getMapAnnotationPathFn,
  loadMapAnnotations as loadMapAnnotationsFn,
  queryMapTemplates as queryMapTemplatesFn,
  migrateExistingTemplatesToNotes as migrateExistingTemplatesToNotesFn,
  enrichTokenCampaigns as enrichTokenCampaignsFn,
} from './map/MapPersistence';
import {
  drawGridOverlay as drawGridOverlayFn,
  drawFilledHexFlatStretched as drawFilledHexFlatStretchedFn,
  drawFilledHexPointyStretched as drawFilledHexPointyStretchedFn,
} from './map/GridOverlay';
import {
  importAllSRDData as importAllSRDDataFn,
  importSRDCreatureTokens as importSRDCreatureTokensFn,
  importSRDCategory as importSRDCategoryFn,
} from './srd/SRDImporter';

// Re-export types that other modules import from main
export type { DndCampaignHubSettings, TabletopCalibration };
export { DEFAULT_SETTINGS };

// ── Handout projection helpers ─────────────────────────────────────────

/**
 * Detect the handout content type from a file extension.
 * Returns null for unsupported file types.
 */
function detectHandoutContentType(filePath: string): HandoutContentType | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md') return 'note';
  return null;
}

/**
 * Add "Project to..." and "Stop handout on..." menu items for handout projection.
 * Adds one item per active managed screen plus stop-items for screens with active handouts.
 */
function addHandoutProjectionItems(
  plugin: DndCampaignHubPlugin,
  menu: Menu,
  filePath: string,
  contentType: HandoutContentType,
): void {
  const spm = plugin.sessionProjectionManager;
  const pm = plugin.projectionManager;
  if (!spm?.isActive()) return;

  for (const state of spm.getAllScreenStates()) {
    const label = state.config.screenLabel;
    menu.addItem((item) =>
      item
        .setTitle(`Project to ${label}`)
        .setIcon('monitor')
        .onClick(async () => {
          await pm.projectHandout(filePath, contentType, state.screen);
        })
    );
  }

  // Stop-handout items for screens that currently have a handout active
  let addedSeparator = false;
  for (const state of spm.getAllScreenStates()) {
    if (state.activeHandout) {
      if (!addedSeparator) {
        menu.addSeparator();
        addedSeparator = true;
      }
      const sKey = state.config.screenKey;
      menu.addItem((item) =>
        item
          .setTitle(`Stop handout on ${state.config.screenLabel}`)
          .setIcon('x')
          .onClick(async () => {
            await pm.stopHandout(sKey);
          })
      );
    }
  }
}


export default class DndCampaignHubPlugin extends Plugin {
  settings!: DndCampaignHubSettings;
  SessionCreationModal = SessionCreationModal;
  SceneCreationModal = SceneCreationModal;
  AdventureCreationModal = AdventureCreationModal;
  migrationRunner!: MigrationRunner;
  migrationRegistry!: MigrationRegistry;
  encounterBuilder!: EncounterBuilder;
  combatTracker!: CombatTracker;
  pursuitTracker!: PursuitTracker;
  combatPursuitSync: CombatPursuitSync | null = null;
  partyManager!: PartyManager;
  mapManager!: MapManager;
  mapController!: MapController;
  markerLibrary!: MarkerLibrary;
  envAssetLibrary!: EnvAssetLibrary;
  musicPlayer!: MusicPlayer;
  projectionManager!: ProjectionManager;
  sessionProjectionManager!: SessionProjectionManager;
  private _musicStatusBarEl: HTMLElement | null = null;
  private _musicStatusBarCleanup: (() => void) | null = null;
  _playerMapViews: Set<PlayerMapView> = new Set();
  _gmMapViews: Set<GmMapView> = new Set();
  _hexcrawlBridge: HexcrawlBridge | null = null;
  /** Debounced save state: per-mapId pending config + timer */
  _pendingSaves = new Map<string, { config: any; el: HTMLElement; timer: ReturnType<typeof setTimeout> }>();
  static readonly SAVE_DEBOUNCE_MS = 1000;

  async onload() {
    await this.loadSettings();

    // Register the Session Prep Dashboard view
    this.registerView(
      SESSION_PREP_VIEW_TYPE,
      (leaf) => new SessionPrepDashboardView(leaf, this)
    );

    // Register the Session Run Dashboard view
    this.registerView(
      SESSION_RUN_VIEW_TYPE,
      (leaf) => new SessionRunDashboardView(leaf, this)
    );

    // Register the DM Screen view
    this.registerView(
      DM_SCREEN_VIEW_TYPE,
      (leaf) => new DMScreenView(leaf, this)
    );

    // Register the Player Map View (for popout player view)
    this.registerView(
      PLAYER_MAP_VIEW_TYPE,
      (leaf) => {
        const view = new PlayerMapView(leaf, this);
        this._playerMapViews.add(view);
        return view;
      }
    );

    // Register the Hexcrawl View (right sidebar panel)
    this.registerView(
      HEXCRAWL_VIEW_TYPE,
      (leaf) => new HexcrawlView(leaf, this)
    );

    // Register the Music Player View (standalone left sidebar panel)
    this.registerView(
      MUSIC_PLAYER_VIEW_TYPE,
      (leaf) => new MusicPlayerLeafView(leaf, this)
    );

    // Register the GM Map View (side panel for interactive map editing)
    this.registerView(
      GM_MAP_VIEW_TYPE,
      (leaf) => {
        const view = new GmMapView(leaf, this);
        this._gmMapViews.add(view);
        return view;
      }
    );

    // Register the Combat Tracker View (right sidebar)
    this.registerView(
      COMBAT_TRACKER_VIEW_TYPE,
      (leaf) => new CombatTrackerView(leaf, this)
    );

    // Register the Combat Player View (projection popout)
    this.registerView(
      COMBAT_PLAYER_VIEW_TYPE,
      (leaf) => new CombatPlayerView(leaf, this)
    );

    // Register the Idle Screen View (session projection)
    this.registerView(
      IDLE_SCREEN_VIEW_TYPE,
      (leaf) => new IdleScreenView(leaf, this)
    );

    // Register the Pursuit Tracker View (GM sidebar)
    this.registerView(
      PURSUIT_TRACKER_VIEW_TYPE,
      (leaf) => new PursuitTrackerView(leaf, this)
    );

    // Register the Pursuit Player View (projection popout)
    this.registerView(
      PURSUIT_PLAYER_VIEW_TYPE,
      (leaf) => new PursuitPlayerView(leaf, this)
    );

    // Register the Handout Projection View (temporary overlay on player screens)
    this.registerView(
      HANDOUT_PROJECTION_VIEW_TYPE,
      (leaf) => new HandoutProjectionView(leaf, this)
    );

    // Initialize the encounter builder
    this.encounterBuilder = new EncounterBuilder(this.app, this);

    // Initialize the combat tracker engine
    this.combatTracker = new CombatTracker(this.app, this);

    // Initialize the pursuit tracker engine
    this.pursuitTracker = new PursuitTracker(this.app, this);

    // Initialize the party manager
    this.partyManager = new PartyManager(this.app, this.manifest.id);
    await this.partyManager.load();

    // Initialize the map manager
    this.mapManager = new MapManager(this.app);

    // Initialize the map controller (external API for map manipulation)
    this.mapController = new MapController(this);

    // Initialize the marker library
    this.markerLibrary = new MarkerLibrary(this.app, this.manifest.id);
    await this.markerLibrary.load();

    // Initialize the environment asset library
    this.envAssetLibrary = new EnvAssetLibrary(this.app, this.manifest.id);
    await this.envAssetLibrary.load();

    // Initialize the migration system (registry + runner)
    this.migrationRegistry = createMigrationRegistry();
    this.migrationRunner = new MigrationRunner(this.app, this.migrationRegistry, this.markerLibrary);

    // Migrate existing isTemplate maps to z_BattlemapTemplates notes (one-time)
    migrateExistingTemplatesToNotesFn(this);

    // Enrich existing tokens with campaign metadata from vault notes
    enrichTokenCampaignsFn(this);

    // Initialize the music player
    this.musicPlayer = new MusicPlayer(this.app, this.settings.musicSettings);

    // Initialize the projection manager (OBS-style project-to-monitor)
    this.projectionManager = new ProjectionManager(this);

    // Initialize the session projection manager (persistent player screens)
    this.sessionProjectionManager = new SessionProjectionManager(this);

    // Register context menus for handout projection
    this.registerHandoutProjectionMenus();

    // Auto-pan player view to active PC's token on turn change
    this.registerCombatAutoPan();

    // Restore persisted playback state (volumes, playlists, etc.)
    this.restoreMusicPlaybackState();

    // Set up "Now Playing" status bar indicator
    this.initMusicStatusBar();

    // Register markdown code block processor for rendering maps
    this.registerMarkdownCodeBlockProcessor('dnd-map', (source, el, ctx) => {
      this.renderMapView(source, el, ctx);
    });

    // Register markdown code block processor for rendering encounter cards
    this.registerMarkdownCodeBlockProcessor('dnd-encounter', async (source, el, ctx) => {
      await this.renderEncounterView(source, el, ctx);
    });

    // Register markdown code block processor for rendering party stats
    this.registerMarkdownCodeBlockProcessor('dnd-party', async (source, el, ctx) => {
      await this.renderPartyView(source, el, ctx);
    });

    // Register markdown code block processor for rendering PoI cards
    this.registerMarkdownCodeBlockProcessor('dnd-poi', async (source, el, ctx) => {
      await this.renderPoiView(source, el, ctx);
    });

    // Register markdown code block processor for scene music cards
    this.registerMarkdownCodeBlockProcessor('dnd-music', (source, el, ctx) => {
      renderSceneMusicBlock(source, el, ctx, this.musicPlayer, this.settings.musicSettings, () => this.ensureMusicPlayerOpen(), this.app);
    });

    // Register markdown code block processor for inline sound effect buttons
    this.registerMarkdownCodeBlockProcessor('dnd-sfx', (source, el, ctx) => {
      renderSoundEffectBlock(source, el, ctx, this.musicPlayer, this.settings.musicSettings, () => this.ensureMusicPlayerOpen(), this.app);
    });

    // Register markdown code block processor for encounter table cards
    this.registerMarkdownCodeBlockProcessor('dnd-encounter-table', (source, el, ctx) => {
      import('./encounter/EncounterTableBlock').then(({ renderEncounterTableBlock }) => {
        renderEncounterTableBlock(source, el, ctx, this.app, this);
      });
    });

    // Register dnd-hub code block processor — renders entity action buttons
    // dynamically based on the note's frontmatter type. This replaces the old
    // inline dataviewjs button blocks. Button logic now lives in plugin code
    // and never needs per-note migration again.
    this.registerMarkdownCodeBlockProcessor('dnd-hub', (source, el, ctx) => {
      this.renderNoteActions(el, ctx);
    });

    // Register dnd-hub-table code block processor — renders entity tables
    // using metadataCache (replaces former Dataview TABLE queries).
    this.registerMarkdownCodeBlockProcessor('dnd-hub-table', (source, el, ctx) => {
      renderEntityTable(source, el, this.app);
    });

    // Register dnd-hub-view code block processor — renders interactive widgets
    // (scene navigators, trap elements, encounter cards) using metadataCache.
    this.registerMarkdownCodeBlockProcessor('dnd-hub-view', (source, el, ctx) => {
      renderView(source, el, this.app, ctx.sourcePath);
    });

    // Register /dnd slash-command snippets for quick scene authoring
    this.registerEditorSuggest(new SceneSnippetSuggest(this.app, this));


    // Check for version updates
    await this.checkForUpdates();

    // Focus recovery command — workaround for Obsidian/Electron focus bug
    this.addCommand({
      id: "reset-focus",
      name: "Reset Focus (fix stuck input fields)",
      callback: () => {
        // Blur whatever currently has focus (may be an invisible/orphaned element)
        if (document.activeElement && document.activeElement !== document.body) {
          (document.activeElement as HTMLElement).blur();
        }
        // Focus the active editor leaf to restore normal editing
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf) {
          this.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
          // Also try to focus the editor within the leaf
          const editor = (activeLeaf.view as any)?.editor;
          if (editor) {
            editor.focus();
          }
        }
        new Notice('Focus reset');
      },
    });

    // Add the main command with configurable hotkey
    this.addCommand({
      id: "open-dnd-hub",
      name: "Open D&D Campaign Hub",
      callback: () => {
        new DndHubModal(this.app, this).open();
      },
      hotkeys: [
        {
          modifiers: ["Ctrl", "Shift"],
          key: "M",
        },
      ],
    });

    this.addCommand({
      id: "initialize-dnd-hub",
      name: "Initialize D&D Campaign Hub",
      callback: async () => {
        if (this.isVaultInitialized()) {
          new Notice("D&D Campaign Hub is already initialized in this vault.");
          return;
        }
        await this.initializeVault();
      },
    });

    this.addCommand({
      id: "update-dnd-hub-templates",
      name: "Migrate D&D Hub Files",
      callback: () => {
        if (!this.isVaultInitialized()) {
          new Notice("Initialize D&D Campaign Hub before migrating files.");
          return;
        }
        this.migrateTemplates();
      },
    });

    // Add commands for the features available in the preview release
    this.addCommand({
      id: "create-campaign",
      name: "Create New Campaign",
      callback: () => this.createCampaign(),
    });

    this.addCommand({
      id: "create-session",
      name: "Create New Session",
      callback: () => this.createSession(),
    });

    this.addCommand({
      id: "end-session-here",
      name: "End Session Here (record ending scene)",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) { new Notice("No active file."); return; }
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type !== 'session') {
          new Notice("Open a session note first.");
          return;
        }
        new EndSessionModal(this.app, this, file).open();
      },
    });

    this.addCommand({
      id: "session-prep-dashboard",
      name: "Open Session Prep Dashboard",
      callback: () => this.openSessionPrepDashboard(),
    });

    this.addCommand({
      id: "session-run-dashboard",
      name: "Open Session Run Dashboard",
      callback: () => this.openSessionRunDashboard(),
    });

    this.addCommand({
      id: "create-npc",
      name: "Create New NPC",
      callback: () => this.createNpc(),
    });

    this.addCommand({
      id: "edit-npc",
      name: "Edit NPC",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "npc") {
            this.editNpc(file.path);
          } else {
            new Notice("This is not an NPC note");
          }
        } else {
          new Notice("Please open an NPC note first");
        }
      },
    });

    this.addCommand({
      id: "delete-npc",
      name: "Delete NPC",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "npc") {
            const npcName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete the map token if it exists
              const tokenId = cache.frontmatter.token_id;
              if (tokenId) {
                await this.markerLibrary.deleteMarker(tokenId);
              }
              
              // Delete from vault
              await this.app.vault.delete(file);
              
              new Notice(`✔ NPC "${npcName}" deleted`);
            }
          } else {
            new Notice("This is not an NPC note");
          }
        } else {
          new Notice("Please open an NPC note first");
        }
      },
    });

    this.addCommand({
      id: "create-pc",
      name: "Create New PC",
      callback: () => this.createPc(),
    });

    this.addCommand({
      id: "import-pc",
      name: "Import Existing PC from Another Campaign",
      callback: () => this.importPc(),
    });

    this.addCommand({
      id: "edit-pc",
      name: "Edit PC",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "player") {
            this.editPc(file.path);
          } else {
            new Notice("This is not a PC note");
          }
        } else {
          new Notice("Please open a PC note first");
        }
      },
    });

    this.addCommand({
      id: "delete-pc",
      name: "Delete PC",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "player") {
            const pcName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete the map token if it exists
              const tokenId = cache.frontmatter.token_id;
              if (tokenId) {
                await this.markerLibrary.deleteMarker(tokenId);
              }
              
              // Delete from vault
              await this.app.vault.delete(file);
              
              new Notice(`✔ PC "${pcName}" deleted`);
            }
          } else {
            new Notice("This is not a PC note");
          }
        } else {
          new Notice("Please open a PC note first");
        }
      },
    });

    this.addCommand({
      id: "create-faction",
      name: "Create New Faction",
      callback: () => this.createFaction(),
    });

    this.addCommand({
      id: "edit-poi",
      name: "Edit Point of Interest",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "point-of-interest") {
            // Open edit modal
            import('./poi/PoiModals').then(({ PoiEditModal }) => {
              new PoiEditModal(this.app, file.path).open();
            });
          } else {
            new Notice("This is not a PoI note");
          }
        } else {
          new Notice("Please open a PoI note first");
        }
      },
    });

    this.addCommand({
      id: "delete-poi",
      name: "Delete Point of Interest",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "point-of-interest") {
            const poiName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Remove all references to this PoI from maps
              // This would require iterating through all map annotations
              // For now, just delete the note and references will be broken
              
              // Delete from vault
              await this.app.vault.delete(file);
              
              new Notice(`✔ Point of Interest "${poiName}" deleted`);
            }
          } else {
            new Notice("This is not a PoI note");
          }
        } else {
          new Notice("Please open a PoI note first");
        }
      },
    });

    this.addCommand({
      id: "insert-poi-codeblock",
      name: "📍 Insert PoI Code Block",
      editorCallback: (editor, view) => {
        // Detect campaign from current file path
        let campaignName = "";
        const file = view.file;
        if (file) {
          const pathParts = file.path.split('/');
          const ttrpgsIndex = pathParts.indexOf('ttrpgs');
          if (ttrpgsIndex >= 0 && ttrpgsIndex < pathParts.length - 1) {
            campaignName = pathParts[ttrpgsIndex + 1] || "";
          }
        }
        
        // Open multi-select modal
        import('./poi/PoiModals').then(({ PoiPickerMultiModal }) => {
          new PoiPickerMultiModal(this.app, editor, campaignName).open();
        });
      },
    });

    this.addCommand({
      id: "update-poi-icons",
      name: "🔄 Update PoI Icons",
      callback: async () => {
        await this.updatePoiIcons();
      },
    });

    this.addCommand({
      id: "create-adventure",
      name: "Create New Adventure",
      callback: () => this.createAdventure(),
    });

    this.addCommand({
      id: "edit-adventure",
      name: "Edit Adventure",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editAdventure(file.path);
        } else {
          new Notice("Please open an adventure note first");
        }
      },
    });

    this.addCommand({
      id: "delete-adventure",
      name: "Delete Adventure",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "adventure") {
            await this.deleteAdventure(file);
          } else {
            new Notice("Please open an adventure note first");
          }
        } else {
          new Notice("Please open an adventure note first");
        }
      },
    });

    this.addCommand({
      id: "create-spell",
      name: "Create New Spell",
      callback: () => this.createSpell(),
    });

    this.addCommand({
      id: "insert-battlemap",
      name: "🗺️ Insert Battle Map (from image)",
      callback: () => this.createMapDirect(),
    });

    this.addCommand({
      id: "create-map",
      name: "🗺️ Create Battle Map (from template)",
      callback: () => this.createMap(),
    });

    this.addCommand({
      id: "create-battlemap-template",
      name: "🏗️ Create Battlemap Template",
      callback: () => this.createBattlemapTemplate(),
    });

    this.addCommand({
      id: "manage-maps",
      name: "🗺️ Map Manager",
      callback: () => new MapManagerModal(this.app, this, this.mapManager).open(),
    });

    this.addCommand({
      id: "manage-parties",
      name: "⚔️ Party Manager",
      callback: () => new PartyManagerModal(this.app, this).open(),
    });

    this.addCommand({
      id: "create-scene",
      name: "Create New Scene",
      callback: () => this.createScene(),
    });

    this.addCommand({
      id: "edit-scene",
      name: "Edit Scene",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editScene(file.path);
        } else {
          new Notice("Please open a scene note first");
        }
      },
    });

    this.addCommand({
      id: "delete-scene",
      name: "Delete Scene",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "scene") {
            const sceneName = cache.frontmatter.name || file.basename;
            const encounterName = cache.frontmatter.tracker_encounter;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              
              // Remove encounter from Party Manager if it exists
              if (encounterName) {
                await this.partyManager.deleteEncounter(encounterName);
                new Notice(`✔ Scene "${sceneName}" and its encounter deleted`);
              } else {
                new Notice(`✔ Scene "${sceneName}" deleted from vault`);
              }
            }
          } else {
            new Notice("This is not a scene note");
          }
        } else {
          new Notice("Please open a scene note first");
        }
      },
    });

    this.addCommand({
      id: "create-trap",
      name: "Create New Trap",
      callback: () => this.createTrap(),
    });

    this.addCommand({
      id: "edit-trap",
      name: "Edit Trap",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editTrap(file.path);
        } else {
          new Notice("Please open a trap note first");
        }
      },
    });

    this.addCommand({
      id: "delete-trap",
      name: "Delete Trap",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "trap") {
            const trapName = cache.frontmatter.trap_name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete trap statblocks from Fantasy Statblocks first
              await this.deleteTrapStatblocks(trapName);
              
              // Delete from vault
              await this.app.vault.delete(file);
              
              new Notice(`✔ Trap "${trapName}" deleted`);
            }
          } else {
            new Notice("This is not a trap note");
          }
        } else {
          new Notice("Please open a trap note first");
        }
      },
    });

    this.addCommand({
      id: "create-item",
      name: "⚔️ Create New Item",
      callback: () => this.createItem(),
    });

    this.addCommand({
      id: "edit-item",
      name: "Edit Item",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editItem(file.path);
        } else {
          new Notice("Please open an item note first");
        }
      },
    });

    this.addCommand({
      id: "delete-item",
      name: "Delete Item",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "item") {
            const itemName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              
              new Notice(`✔ Item "${itemName}" deleted`);
            }
          } else {
            new Notice("This is not an item note");
          }
        } else {
          new Notice("Please open an item note first");
        }
      },
    });

    this.addCommand({
      id: "create-creature",
      name: "🐉 Create New Creature",
      callback: () => this.createCreature(),
    });

    this.addCommand({
      id: "edit-creature",
      name: "Edit Creature",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editCreature(file.path);
        } else {
          new Notice("Please open a creature note first");
        }
      },
    });

    this.addCommand({
      id: "delete-creature",
      name: "Delete Creature",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.statblock === true) {
            const creatureName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              
              // Delete from Fantasy Statblocks plugin
              await this.deleteCreatureStatblock(creatureName);
              
              new Notice(`✔ Creature "${creatureName}" deleted`);
            }
          } else {
            new Notice("This is not a creature note");
          }
        } else {
          new Notice("Please open a creature note first");
        }
      },
    });

    this.addCommand({
      id: "create-encounter",
      name: "Create New Encounter",
      callback: () => this.createEncounter(),
    });

    this.addCommand({
      id: "insert-encounter-widget",
      name: "⚔️ Insert Encounter Widget",
      editorCallback: (editor) => {
        import('./encounter/InsertEncounterWidgetModal').then(({ InsertEncounterWidgetModal }) => {
          new InsertEncounterWidgetModal(this.app, this, (codeblock) => {
            editor.replaceSelection(codeblock + '\n');
          }).open();
        });
      },
    });

    this.addCommand({
      id: "edit-encounter",
      name: "Edit Encounter",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          this.editEncounter(file.path);
        } else {
          new Notice("Please open an encounter note first");
        }
      },
    });

    this.addCommand({
      id: "save-combat-state",
      name: "💾 Save Combat State",
      callback: () => this.combatTracker.saveCombat(),
    });

    this.addCommand({
      id: "load-combat-state",
      name: "🔄 Resume Saved Combat",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "encounter") {
            const name = cache.frontmatter.name || file.basename;
            this.combatTracker.resumeCombat(name);
          } else {
            new Notice("Please open an encounter note first");
          }
        }
      },
    });

    this.addCommand({
      id: "clear-combat-state",
      name: "🗑️ Clear Saved Combat State",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "encounter") {
            const name = cache.frontmatter.name || file.basename;
            new ConfirmModal(
              this.app,
              'Clear Saved Combat State',
              `Are you sure you want to clear the saved combat state for "${name}"?\nThis action cannot be undone.`,
              async (confirmed) => {
                if (confirmed) {
                  await this.combatTracker.clearSavedState(name);
                  new Notice(`Saved combat state for "${name}" cleared.`);
                }
              }
            ).open();
          } else {
            new Notice("Please open an encounter note first");
          }
        }
      },
    });

    this.addCommand({
      id: "open-combat-tracker",
      name: "⚔️ Open Combat Tracker",
      callback: () => this.openCombatTracker(),
    });

    this.addCommand({
      id: "next-turn",
      name: "⏩ Next Turn",
      callback: () => this.combatTracker.nextTurn(),
    });

    this.addCommand({
      id: "prev-turn",
      name: "⏪ Previous Turn",
      callback: () => this.combatTracker.prevTurn(),
    });

    this.addCommand({
      id: "start-pursuit",
      name: "🏃 Start Pursuit / Chase",
      callback: () => this.startPursuitSetup(),
    });

    this.addCommand({
      id: "open-pursuit-tracker",
      name: "🏃 Open Pursuit Tracker",
      callback: () => this.openPursuitTracker(),
    });

    this.addCommand({
      id: "end-pursuit",
      name: "🛑 End Pursuit",
      callback: () => {
        if (this.combatPursuitSync) {
          this.combatPursuitSync.teardown();
          this.combatPursuitSync = null;
        }
        this.pursuitTracker.endChase("gm-ended");
        new Notice("Pursuit ended.");
      },
    });

    // Register file watcher for encounter modifications
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file instanceof TFile && file.path.startsWith('z_Encounters/')) {
          // Wait for metadata cache to update
          setTimeout(async () => {
            await this.syncEncounterToScenes(file);
          }, 100);
        }
      })
    );

    // ── Token auto-sync: keep marker library in sync when notes are edited ──

    // Sync token name/size when PC, NPC or Creature frontmatter is modified
    this.registerEvent(
      this.app.metadataCache.on('changed', async (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm || !fm.token_id) return;

        const tokenId: string = fm.token_id;
        const existing = this.markerLibrary.getMarker(tokenId);
        if (!existing) return;

        // Determine entity type & new name from frontmatter
        let entityType: 'player' | 'npc' | 'creature' | null = null;
        if (fm.type === 'player') entityType = 'player';
        else if (fm.type === 'npc') entityType = 'npc';
        else if (fm.statblock === true) entityType = 'creature';
        if (!entityType) return;

        const newName: string = fm.name || file.basename;

        // For creatures, also detect size changes
        let newSize = existing.creatureSize;
        if (entityType === 'creature' && fm.size) {
          const sizeMap: Record<string, CreatureSize> = {
            'Tiny': 'tiny', 'Small': 'small', 'Medium': 'medium',
            'Large': 'large', 'Huge': 'huge', 'Gargantuan': 'gargantuan'
          };
          newSize = sizeMap[fm.size] || existing.creatureSize;
        }

        // Only update if something actually changed
        if (existing.name === newName && existing.creatureSize === newSize) return;

        const updated: MarkerDefinition = {
          ...existing,
          name: newName,
          creatureSize: newSize,
          updatedAt: Date.now()
        };
        await this.markerLibrary.setMarker(updated);
      })
    );

    // Clean up orphan tokens when a note with a token_id is deleted
    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        // We can't read the file anymore, so scan marker library for tokens
        // whose name matches the deleted basename (best-effort cleanup)
        // The metadata cache is no longer available for deleted files, so we
        // rely on the fact that the file was just removed and check if any
        // token carries the same name and is no longer referenced by another note.
        // Remove from any party references
        await this.partyManager.removeMemberByPath(file.path);

        const basename = file.basename;
        const allMarkers = this.markerLibrary.getAllMarkers();
        for (const marker of allMarkers) {
          if (marker.name !== basename) continue;

          // Verify no other note still references this token_id
          const allFiles = this.app.vault.getMarkdownFiles();
          let stillReferenced = false;
          for (const f of allFiles) {
            const c = this.app.metadataCache.getFileCache(f);
            if (c?.frontmatter?.token_id === marker.id) {
              stillReferenced = true;
              break;
            }
          }

          if (!stillReferenced) {
            await this.markerLibrary.deleteMarker(marker.id);
          }
        }
      })
    );

    // Sync token name when a note file is renamed
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        // Update party member paths
        await this.partyManager.updateMemberPath(oldPath, file.path);

        // Wait briefly for metadata cache to update after rename
        setTimeout(async () => {
          const cache = this.app.metadataCache.getFileCache(file);
          const fm = cache?.frontmatter;
          if (!fm) return;

          // Sync member display name
          const newName = fm.name || file.basename;
          await this.partyManager.updateMemberName(file.path, newName);

          if (!fm.token_id) return;

          const tokenId: string = fm.token_id;
          const existing = this.markerLibrary.getMarker(tokenId);
          if (!existing) return;

          if (existing.name === newName) return;

          const updated: MarkerDefinition = {
            ...existing,
            name: newName,
            updatedAt: Date.now()
          };
          await this.markerLibrary.setMarker(updated);
        }, 200);
      })
    );

    this.addCommand({
      id: "delete-encounter",
      name: "Delete Encounter",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const cache = this.app.metadataCache.getFileCache(file);
          if (cache?.frontmatter?.type === "encounter") {
            const encounterName = cache.frontmatter.name || file.basename;
            const confirmed = await this.confirmDelete(file.name);
            if (confirmed) {
              // Delete from vault
              await this.app.vault.delete(file);
              
              // Remove from Party Manager
              await this.partyManager.deleteEncounter(encounterName);
              new Notice(`✔ Encounter "${encounterName}" deleted`);
            }
          } else {
            new Notice("This is not an encounter note");
          }
        } else {
          new Notice("Please open an encounter note first");
        }
      },
    });

    // ─── Music Player Commands ──────────────────────────────

    this.addCommand({
      id: "open-music-player",
      name: "🎵 Open Music Player",
      callback: () => {
        this.ensureMusicPlayerOpen();
      },
    });

    this.addCommand({
      id: "toggle-music-playback",
      name: "Toggle Music Play / Pause",
      callback: () => {
        this.musicPlayer.togglePlayPause();
      },
    });

    this.addCommand({
      id: "next-track",
      name: "Next Track",
      callback: () => {
        this.musicPlayer.next();
      },
    });

    this.addCommand({
      id: "previous-track",
      name: "Previous Track",
      callback: () => {
        this.musicPlayer.previous();
      },
    });

    this.addCommand({
      id: "stop-music",
      name: "Stop All Music",
      callback: () => {
        this.musicPlayer.stopAll();
      },
    });

    this.addCommand({
      id: "insert-scene-music",
      name: "🎵 Insert Scene Music Block",
      editorCallback: (editor: Editor) => {
        new SceneMusicModal(
          this.app,
          this.settings.musicSettings,
          null,
          (config) => {
            const codeblock = buildSceneMusicCodeblock(config);
            editor.replaceSelection(codeblock + '\n');
            new Notice('Scene music block inserted');
          }
        ).open();
      },
    });

    this.addCommand({
      id: "insert-sound-effect",
      name: "🔊 Insert Sound Effect Block",
      editorCallback: (editor: Editor) => {
        new SoundEffectModal(
          this.app,
          this.settings.musicSettings,
          null,
          (config) => {
            const codeblock = buildSoundEffectCodeblock(config);
            editor.replaceSelection(codeblock + '\n');
            new Notice('Sound effect block inserted');
          }
        ).open();
      },
    });

    this.addCommand({
      id: "music-volume-up",
      name: "🔊 Volume Up (+10)",
      callback: () => {
        const vol = Math.min(100, this.musicPlayer.primary.state.volume + 10);
        this.musicPlayer.primary.setVolume(vol);
        new Notice(`🔊 Volume: ${vol}%`);
      },
    });

    this.addCommand({
      id: "music-volume-down",
      name: "🔉 Volume Down (-10)",
      callback: () => {
        const vol = Math.max(0, this.musicPlayer.primary.state.volume - 10);
        this.musicPlayer.primary.setVolume(vol);
        new Notice(`🔉 Volume: ${vol}%`);
      },
    });

    this.addCommand({
      id: "toggle-music-mute",
      name: "🔇 Toggle Mute",
      callback: () => {
        this.musicPlayer.primary.toggleMute();
        this.musicPlayer.ambient.toggleMute();
        const muted = this.musicPlayer.primary.state.isMuted;
        new Notice(muted ? '🔇 Muted' : '🔊 Unmuted');
      },
    });

    this.addCommand({
      id: "open-music-settings",
      name: "Open Music Settings",
      callback: () => {
        new MusicSettingsModal(this.app, this.settings.musicSettings, async (updated: MusicSettings) => {
          this.settings.musicSettings = updated;
          this.musicPlayer.reloadSettings(updated);
          await this.saveSettings();
          new Notice("Music settings saved");
        }).open();
      },
    });

    this.addCommand({
      id: "search-freesound",
      name: "🔍 Search Freesound",
      callback: () => {
        const key = this.settings.musicSettings.freesoundApiKey;
        if (!key) {
          new Notice("Set a Freesound API Key in Music Settings → General first");
          return;
        }
        new FreesoundSearchModal(
          this.app,
          key,
          this.settings.musicSettings.audioFolderPath,
          (_paths) => { /* standalone mode — no auto-import */ },
        ).open();
      },
    });

    this.addCommand({
      id: "purge-vault",
      name: "Purge D&D Campaign Hub Data",
      callback: () => {
        new PurgeConfirmModal(this.app, this).open();
      },
    });

    // ── Session Projection commands ──
    this.addCommand({
      id: "session-projection-hub",
      name: "🎬 Session Projection",
      callback: () => {
        new SessionProjectionHubModal(this).open();
      },
    });

    this.addCommand({
      id: "start-session-projection",
      name: "▶ Start Projection Session",
      callback: async () => {
        const spm = this.sessionProjectionManager;
        if (spm.isActive()) {
          new Notice('Session is already active');
          return;
        }
        const configs = this.settings.sessionProjection.managedScreens;
        if (configs.length === 0) {
          new SessionProjectionHubModal(this).open();
          return;
        }
        const { enumerateScreens } = await import('./utils/ScreenEnumeration');
        const screens = await enumerateScreens();
        await spm.startSession(screens, configs);
      },
    });

    this.addCommand({
      id: "stop-session-projection",
      name: "⏹ Stop Projection Session",
      callback: () => {
        this.sessionProjectionManager.stopSession();
      },
    });

    // ── Random Encounter Table commands ──
    this.addCommand({
      id: "create-random-encounter-table",
      name: "Create Random Encounter Table",
      callback: () => {
        new RandomEncounterTableModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "roll-random-encounter",
      name: "Roll Random Encounter",
      callback: async () => {
        await this.rollRandomEncounter();
      },
    });

    this.addCommand({
      id: "insert-encounter-table-codeblock",
      name: "🎲 Insert Encounter Table Code Block",
      editorCallback: (editor) => {
        import('./encounter/InsertEncounterTableModal').then(({ InsertEncounterTableModal }) => {
          new InsertEncounterTableModal(this.app, this, (codeblock) => {
            editor.replaceSelection(codeblock + '\n');
          }).open();
        });
      },
    });

    this.addCommand({
      id: "reroll-encounter-table-entry",
      name: "🔄 Reroll Encounter Table Entry",
      callback: () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice("Open an encounter table note first.");
          return;
        }
        const cache = this.app.metadataCache.getFileCache(activeFile);
        if (cache?.frontmatter?.type !== "encounter-table") {
          new Notice("⚠️ This is not an encounter table note.");
          return;
        }
        import('./encounter/RerollEncounterModal').then(({ RerollEncounterModal }) => {
          new RerollEncounterModal(this.app, this, activeFile).open();
        });
      },
    });

    this.addCommand({
      id: "edit-encounter-table",
      name: "✏️ Edit Encounter Table",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("Please open an encounter table note first");
          return;
        }
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type !== "encounter-table") {
          new Notice("This is not an encounter table note");
          return;
        }
        import('./encounter/RerollEncounterModal').then(({ RerollEncounterModal }) => {
          new RerollEncounterModal(this.app, this, file).open();
        });
      },
    });

    this.addCommand({
      id: "delete-encounter-table",
      name: "🗑️ Delete Encounter Table",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("Please open an encounter table note first");
          return;
        }
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type !== "encounter-table") {
          new Notice("This is not an encounter table note");
          return;
        }
        const tableName = cache.frontmatter.name || file.basename;
        const confirmed = await this.confirmDelete(file.name);
        if (confirmed) {
          await this.app.vault.delete(file);
          new Notice(`✔ Encounter table "${tableName}" deleted`);
        }
      },
    });

    this.addSettingTab(new DndCampaignHubSettingTab(this.app, this));

    // Keep z_Templates in sync with bundled template constants
    if (this.isVaultInitialized()) {
      await this.createTemplateFiles();
    }
  }

  onunload() {
    // Flush any debounced map saves before shutdown
    this._flushAllPendingSaves();
    // Persist playback state before shutdown
    this.saveMusicPlaybackState();
    if (this._musicStatusBarCleanup) this._musicStatusBarCleanup();
    this.musicPlayer?.destroy();
    // Stop active session projection first (closes managed popouts cleanly)
    this.sessionProjectionManager?.stopSession();
    // Stop any remaining standalone projections and clean up timers
    this.projectionManager?.stopAllProjections();
    this.projectionManager?.destroy();
    // Close all player-view popout windows to prevent orphaned Electron windows
    if (this._playerMapViews) {
      this._playerMapViews.forEach((pv: any) => {
        try { pv.leaf?.detach(); } catch (e) { /* ignore */ }
      });
      this._playerMapViews.clear();
    }
    // Close all GM map side leaves
    if (this._gmMapViews) {
      this._gmMapViews.forEach((gv: any) => {
        try { gv.leaf?.detach(); } catch (e) { /* ignore */ }
      });
      this._gmMapViews.clear();
    }
  }

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
		// Deep-merge musicSettings so new default fields are present for existing users
		if (saved?.musicSettings) {
			this.settings.musicSettings = Object.assign(
				{},
				DEFAULT_MUSIC_SETTINGS,
				saved.musicSettings
			);
		}
		// Deep-merge playback state
		if (saved?.musicPlaybackState) {
			this.settings.musicPlaybackState = Object.assign(
				{},
				DEFAULT_PLAYBACK_STATE,
				saved.musicPlaybackState
			);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Check if plugin has been updated and notify user
	 */
	async checkForUpdates() {
		const manifest = this.manifest;
		const currentVersion = manifest.version;
		const savedVersion = this.settings.pluginVersion;

		if (savedVersion !== currentVersion) {
			// Plugin was updated
			if (savedVersion !== "0.0.0") {
				new Notice(`D&D Campaign Hub updated to v${currentVersion}! Use "Migrate D&D Hub Files" to safely update your existing files.`, 10000);
			}
			
			// Update saved version
			this.settings.pluginVersion = currentVersion;
			await this.saveSettings();
		}
	}

	/**
	 * Migrate template files safely without data loss
	 */
	async migrateTemplates() {
		// Show migration modal
		new MigrationModal(this.app, this).open();
	}

	/**
	 * Render entity action buttons inside a `dnd-hub` code block.
	 * Reads the note's frontmatter type and creates appropriate buttons.
	 * This replaces the old per-note dataviewjs button blocks.
	 */
	renderNoteActions(el: HTMLElement, ctx: { sourcePath: string }): void {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const cache = this.app.metadataCache.getFileCache(file);
		// plugin_type takes precedence over type (used by SRD creature notes where
		// `type` holds the D&D monster category rather than the plugin entity type).
		const type = (cache?.frontmatter?.plugin_type ?? cache?.frontmatter?.type) as string | undefined;
		if (!type) return;

		const container = el.createDiv({ cls: "dnd-hub-actions" });

		const createBtn = (text: string, cls: string, handler: () => void) => {
			const btn = container.createEl("button", { text, cls: `dnd-hub-btn ${cls}` });
			btn.addEventListener("click", handler);
			return btn;
		};

		const cmd = (id: string) => () => {
			(this.app as any).commands.executeCommandById(`dnd-campaign-hub:${id}`);
		};

		switch (type) {
			case "world":
				createBtn("🛡️ Create New PC", "dnd-hub-btn-create", cmd("create-pc"));
				createBtn("📥 Import PC", "dnd-hub-btn-create", cmd("import-pc"));
				createBtn("👤 Create New NPC", "dnd-hub-btn-create", cmd("create-npc"));
				createBtn("📜 Create New Session", "dnd-hub-btn-create", cmd("create-session"));
				createBtn("🏛️ Create New Faction", "dnd-hub-btn-create", cmd("create-faction"));
				createBtn("🗺️ Create New Adventure", "dnd-hub-btn-create", cmd("create-adventure"));
				break;

			case "player":
			case "pc":
				createBtn("✏️ Edit PC", "dnd-hub-btn-edit", cmd("edit-pc"));
				createBtn("🗑️ Delete PC", "dnd-hub-btn-delete", cmd("delete-pc"));
				break;

			case "npc":
				createBtn("✏️ Edit NPC", "dnd-hub-btn-edit", cmd("edit-npc"));
				createBtn("🗑️ Delete NPC", "dnd-hub-btn-delete", cmd("delete-npc"));
				createBtn("⚔️ Manage Statblock", "dnd-hub-btn-extra", cmd("edit-npc"));
				break;

			case "creature":
				createBtn("✏️ Edit Creature", "dnd-hub-btn-edit", cmd("edit-creature"));
				createBtn("🗑️ Delete Creature", "dnd-hub-btn-delete", cmd("delete-creature"));
				break;

			case "scene":
				createBtn("✏️ Edit Scene", "dnd-hub-btn-edit", cmd("edit-scene"));
				createBtn("🗑️ Delete Scene", "dnd-hub-btn-delete", cmd("delete-scene"));
				break;

			case "adventure": {
				const adventurePath = ctx.sourcePath;
				createBtn("🎬 Create New Scene", "dnd-hub-btn-create", () => {
					new SceneCreationModal(this.app, this, adventurePath).open();
				});
				createBtn("🪤 Create New Trap", "dnd-hub-btn-create", cmd("create-trap"));
				createBtn("📜 Create Session", "dnd-hub-btn-create", () => {
					new SessionCreationModal(this.app, this, adventurePath).open();
				});
				createBtn("✏️ Edit Adventure", "dnd-hub-btn-edit", cmd("edit-adventure"));
				createBtn("🗑️ Delete Adventure", "dnd-hub-btn-delete", cmd("delete-adventure"));
				break;
			}

			case "trap":
				createBtn("✏️ Edit Trap", "dnd-hub-btn-edit", cmd("edit-trap"));
				createBtn("🗑️ Delete Trap", "dnd-hub-btn-delete", cmd("delete-trap"));
				break;

			case "item":
				createBtn("✏️ Edit Item", "dnd-hub-btn-edit", cmd("edit-item"));
				createBtn("🗑️ Delete Item", "dnd-hub-btn-delete", cmd("delete-item"));
				break;

			case "spell":
				createBtn("✏️ Edit Spell", "dnd-hub-btn-edit", cmd("edit-spell"));
				createBtn("🗑️ Delete Spell", "dnd-hub-btn-delete", cmd("delete-spell"));
				break;

			case "faction":
				createBtn("✏️ Edit Faction", "dnd-hub-btn-edit", cmd("edit-faction"));
				createBtn("🗑️ Delete Faction", "dnd-hub-btn-delete", cmd("delete-faction"));
				break;

			case "encounter":
				createBtn("⚔️ Load in Combat Tracker", "dnd-hub-btn-extra", cmd("open-combat-tracker"));
				createBtn("✏️ Edit", "dnd-hub-btn-edit", cmd("edit-encounter"));
				createBtn("💾 Save Combat", "dnd-hub-btn-extra", cmd("save-combat-state"));
				createBtn("🔄 Resume Combat", "dnd-hub-btn-extra", cmd("load-combat-state"));
				createBtn("🗑️ Clear Saved State", "dnd-hub-btn-delete", cmd("clear-combat-state"));
				createBtn("🗑️ Delete Encounter", "dnd-hub-btn-delete", cmd("delete-encounter"));
				break;

			case "encounter-table":
				createBtn("🎲 Roll Encounter", "dnd-hub-btn-extra", cmd("roll-random-encounter"));
				createBtn("🔄 Regenerate Table", "dnd-hub-btn-extra", cmd("create-random-encounter-table"));
				createBtn("✏️ Edit Table", "dnd-hub-btn-edit", cmd("edit-encounter-table"));
				createBtn("🗑️ Delete Table", "dnd-hub-btn-delete", cmd("delete-encounter-table"));
				break;

			case "point-of-interest":
				createBtn("✏️ Edit PoI", "dnd-hub-btn-edit", cmd("edit-poi"));
				createBtn("🗑️ Delete PoI", "dnd-hub-btn-delete", cmd("delete-poi"));
				break;

			default:
				break;
		}
	}

	/**
	 * Update all existing PoI icons based on their type
	 */
	async updatePoiIcons() {
		const { POI_TYPES } = await import('./map/types');
		
		try {
			const allFiles = this.app.vault.getMarkdownFiles();
			const poiFiles = allFiles.filter(file => file.path.includes('/locations/'));
			
			let updated = 0;
			let skipped = 0;
			
			for (const file of poiFiles) {
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				
				if (fm?.type !== 'point-of-interest') {
					continue;
				}
				
				// Get the correct icon for this PoI type
				const poiType = fm['poi-type'] || 'custom';
				const typeDefinition = POI_TYPES.find(t => t.value === poiType);
				
				if (!typeDefinition) {
					skipped++;
					continue;
				}
				
				const correctIcon = typeDefinition.icon;
				const currentIcon = fm.icon || '📍';
				
				// Skip if already correct
				if (currentIcon === correctIcon) {
					skipped++;
					continue;
				}
				
				// Update the file
				let content = await this.app.vault.read(file);

        content = updateYamlFrontmatter(content, (frontmatter) => ({
          ...frontmatter,
          icon: correctIcon,
        }));
				
				// Update heading icon (first heading after frontmatter)
				const headingRegex = /^(---\n[\s\S]*?\n---\n\n)# (.+?) (.+)$/m;
				const headingMatch = content.match(headingRegex);
				if (headingMatch) {
					content = content.replace(headingRegex, `$1# ${correctIcon} $3`);
				}
				
				await this.app.vault.modify(file, content);
				updated++;
			}
			
			new Notice(`✅ Updated ${updated} PoI icons (${skipped} already correct)`);
			
		} catch (error) {
			console.error('Error updating PoI icons:', error);
			new Notice('❌ Failed to update PoI icons');
		}
	}

	/**
	 * Check if the vault has been initialized with the required folder structure
	 */
	isVaultInitialized(): boolean {
		const requiredFolders = [
			"z_Templates",
			"z_Assets",
			"z_Beastiarity",
			"z_Databases",
			"z_Dataviews",
			"z_Daten",
			"z_Decks",
			"z_Log",
			"z_Scripts",
			"z_SessionTranscripts",
			"z_Tables",
			"ttrpgs"
		];

		return requiredFolders.every(folder => {
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			return folderExists instanceof TFolder;
		});
	}

  /**
   * Purge all D&D Campaign Hub files and folders from the vault
   */
  async purgeVault() {
		const foldersToRemove = [
			"z_Templates",
			"z_Assets",
			"z_Beastiarity",
			"z_Databases",
			"z_Dataviews",
			"z_Daten",
			"z_Decks",
			"z_Log",
			"z_Scripts",
			"z_SessionTranscripts",
			"z_Tables",
			"z_Spells",
			"z_AbilityScores",
			"z_Classes",
			"z_Conditions",
			"z_DamageTypes",
			"z_Equipment",
			"z_Features",
			"z_Languages",
			"z_MagicSchools",
			"z_Proficiencies",
			"z_Races",
			"z_Skills",
			"z_Subclasses",
			"z_Subraces",
			"z_Traits",
			"z_WeaponProperties",
			"ttrpgs"
		];

		let removedCount = 0;
		let errors: string[] = [];

		for (const folderPath of foldersToRemove) {
			try {
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (folder instanceof TFolder) {
					await this.app.vault.delete(folder, true); // true = recursive delete
					removedCount++;
				}
			} catch (error) {
				errors.push(`${folderPath}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		if (errors.length > 0) {
			new Notice(`Purge completed with errors. Removed ${removedCount} folders. Errors: ${errors.join(", ")}`);
		} else {
			new Notice(`Successfully purged ${removedCount} D&D Campaign Hub folders.`);
		}
	}



	/**
	 * Initialize the vault with the required folder structure and templates
	 */
  async initializeVault() {
    new Notice("Initializing D&D Campaign Hub vault structure...");

		// Create all required folders
		const foldersToCreate = [
			"z_Templates",
			"z_Assets",
			"z_Beastiarity", 
			"z_Databases",
			"z_Dataviews",
			"z_Daten",
			"z_Decks",
			"z_Log",
			"z_Scripts",
			"z_SessionTranscripts",
			"z_Tables",
			"z_Backups",
			"ttrpgs"
		];

		for (const folder of foldersToCreate) {
			try {
				await this.app.vault.createFolder(folder);
			} catch (error) {
				// Folder might already exist
			}
		}

		// Create template files
		await this.createTemplateFiles();

		new Notice("Vault initialized successfully!");
	}

	/**
	 * Create template files in z_Templates folder
	 */
	async createTemplateFiles() {
		const templates = {
			"z_Templates/world.md": WORLD_TEMPLATE,
			"z_Templates/session-gm.md": SESSION_GM_TEMPLATE,
			"z_Templates/session-player.md": SESSION_PLAYER_TEMPLATE,
			"z_Templates/Frontmatter - NPC.md": NPC_TEMPLATE,
			"z_Templates/Frontmatter - Player Character.md": PC_TEMPLATE,
			"z_Templates/Frontmatter - Adventure.md": ADVENTURE_TEMPLATE,
			"z_Templates/Frontmatter - Faction.md": FACTION_TEMPLATE,
			"z_Templates/Frontmatter - Item.md": ITEM_TEMPLATE,
			"z_Templates/Frontmatter - Spell.md": SPELL_TEMPLATE,
		};

		for (const [path, content] of Object.entries(templates)) {
			try {
				// Check if file already exists
				const existingFile = this.app.vault.getAbstractFileByPath(path);
				if (existingFile instanceof TFile) {
					// Update existing template
					await this.app.vault.modify(existingFile, content);
				} else {
					// Create new template
					await this.app.vault.create(path, content);
				}
			} catch (error) {
				console.error(`Failed to create/update template ${path}:`, error);
			}
		}
	}


	async createCampaign() {
		// Open campaign creation modal instead of simple name prompt
		new CampaignCreationModal(this.app, this).open();
	}

	async createNpc() {
		// Open NPC creation modal instead of simple name prompt
		new NPCCreationModal(this.app, this).open();
	}

	async editNpc(npcPath: string) {
		// Open NPC creation modal in edit mode
		new NPCCreationModal(this.app, this, npcPath).open();
	}

	async createPc() {
		// Open PC creation modal
		new PCCreationModal(this.app, this).open();
	}

	async importPc() {
		// Open import PC modal for cross-campaign import
		new ImportPCModal(this.app, this).open();
	}

	async editPc(pcPath: string) {
		// Open PC creation modal in edit mode
		new PCCreationModal(this.app, this, pcPath).open();
	}

	async createAdventure() {
		// Open Adventure creation modal
		new AdventureCreationModal(this.app, this).open();
	}

	async editAdventure(adventurePath: string) {
		// Open Adventure creation modal in edit mode
		new AdventureCreationModal(this.app, this, adventurePath).open();
	}

	async deleteAdventure(file: TFile) {
		const adventureName = this.app.metadataCache.getFileCache(file)?.frontmatter?.name || file.basename;
		const adventureFolder = file.parent;

		const confirmed = await this.confirmDelete(`adventure "${adventureName}" and all its scenes`);
		if (!confirmed) return;

		try {
			if (adventureFolder && adventureFolder.name === file.basename) {
				// Folder structure: delete the entire adventure folder
				const children = [...adventureFolder.children];
				for (const child of children) {
					if (child instanceof TFolder) {
						// Recursively delete subfolders (Scenes, Act folders, etc.)
						const subChildren = [...child.children];
						for (const subChild of subChildren) {
							if (subChild instanceof TFile) {
								await this.app.vault.delete(subChild);
							}
						}
						await this.app.vault.delete(child);
					} else if (child instanceof TFile) {
						await this.app.vault.delete(child);
					}
				}
				await this.app.vault.delete(adventureFolder);
			} else {
				// Flat structure: delete the adventure file and its scenes folder
				const scenesFolder = this.app.vault.getAbstractFileByPath(
					`${file.parent?.path}/${file.basename} - Scenes`
				);
				if (scenesFolder instanceof TFolder) {
					const children = [...scenesFolder.children];
					for (const child of children) {
						if (child instanceof TFile) {
							await this.app.vault.delete(child);
						}
					}
					await this.app.vault.delete(scenesFolder);
				}
				await this.app.vault.delete(file);
			}
			new Notice(`✅ Adventure "${adventureName}" deleted!`);
		} catch (error) {
			new Notice(`❌ Error deleting adventure: ${error instanceof Error ? error.message : String(error)}`);
			console.error("Adventure deletion error:", error);
		}
	}

	async createScene() {
		// Open Scene creation modal
		new SceneCreationModal(this.app, this).open();
	}

	async createTrap() {
		// Open Trap creation modal
		new TrapCreationModal(this.app, this).open();
	}

	async editTrap(trapPath: string) {
		// Open Trap creation modal in edit mode
		new TrapCreationModal(this.app, this, undefined, undefined, trapPath).open();
	}

	async createItem() {
		// Open Item creation modal
		new ItemCreationModal(this.app, this).open();
	}

	async editItem(itemPath: string) {
		// Open Item creation modal in edit mode
		new ItemCreationModal(this.app, this, itemPath).open();
	}

	async createCreature() {
		// Open Creature creation modal
		new CreatureCreationModal(this.app, this).open();
	}

	async editCreature(creaturePath: string) {
		// Open Creature creation modal in edit mode
		new CreatureCreationModal(this.app, this, creaturePath).open();
	}

	async deleteCreatureStatblock(creatureName: string) {
		try {
			const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
			if (!statblocksPlugin) {
				return;
			}

			// Delete from bestiary
			const bestiary = statblocksPlugin.data?.bestiary || [];
			const index = bestiary.findIndex((c: any) => c.name === creatureName);
			
			if (index !== -1) {
				bestiary.splice(index, 1);
				await statblocksPlugin.saveSettings();
			}
		} catch (error) {
			console.error("Error deleting creature statblock:", error);
		}
	}

	async deleteTrapStatblocks(trapName: string) {
		try {
			const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
			if (!statblocksPlugin) {
				return;
			}

			const homebrewSource = `Trap: ${trapName}`;
			let deletedCount = 0;

			// Try to delete from data.monsters
			if (statblocksPlugin.data?.monsters && Array.isArray(statblocksPlugin.data.monsters)) {
				const originalLength = statblocksPlugin.data.monsters.length;
				
				// Remove all statblocks with matching source (includes all elements for complex traps)
				statblocksPlugin.data.monsters = statblocksPlugin.data.monsters.filter(
					(m: any) => m.source !== homebrewSource
				);
				
				deletedCount = originalLength - statblocksPlugin.data.monsters.length;
				
				if (deletedCount > 0) {
					// Save plugin data
					await statblocksPlugin.saveData(statblocksPlugin.data);
				}
			}
		} catch (error) {
			console.error("Error deleting trap statblocks:", error);
		}
	}

	async createEncounter() {
		// Open Encounter Builder modal
		new EncounterBuilderModal(this.app, this).open();
	}

	async editEncounter(encounterPath: string) {
		// Open Encounter Builder modal in edit mode
		new EncounterBuilderModal(this.app, this, encounterPath).open();
	}

	async editScene(scenePath: string) {
		// Open Scene creation modal in edit mode
		new SceneCreationModal(this.app, this, undefined, scenePath).open();
	}

	async confirmDelete(fileName: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText("Confirm Delete");
			modal.contentEl.createEl("p", { text: `Are you sure you want to delete "${fileName}"?` });
			modal.contentEl.createEl("p", { 
				text: "This action cannot be undone.", 
				attr: { style: "color: var(--text-error); font-weight: bold;" }
			});

			const buttonContainer = modal.contentEl.createDiv({ cls: "modal-button-container" });
			buttonContainer.style.display = "flex";
			buttonContainer.style.gap = "10px";
			buttonContainer.style.justifyContent = "flex-end";
			buttonContainer.style.marginTop = "20px";

			const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
			cancelBtn.onclick = () => {
				resolve(false);
				modal.close();
			};

			const deleteBtn = buttonContainer.createEl("button", { text: "Delete" });
			deleteBtn.style.backgroundColor = "var(--interactive-accent)";
			deleteBtn.style.color = "var(--text-on-accent)";
			deleteBtn.onclick = () => {
				resolve(true);
				modal.close();
			};

			modal.open();
		});
	}

	/**
	 * Sync encounter modifications back to linked scenes and Initiative Tracker
	 * Called when an encounter file is modified in z_Encounters folder
	 */
	async syncEncounterToScenes(encounterFile: TFile) {
		try {
			// Read the file directly so the sync uses the newest saved content.
			const content = await this.app.vault.read(encounterFile);
			const parsed = parseYamlFrontmatter<Record<string, unknown>>(content);

			if (!parsed.hasFrontmatter) {
				return;
			}

			const encounterName = typeof parsed.frontmatter.name === 'string' && parsed.frontmatter.name.length > 0
				? parsed.frontmatter.name
				: encounterFile.basename;

			const rawCreatures = Array.isArray(parsed.frontmatter.creatures)
				? parsed.frontmatter.creatures
				: [];
			const encounterCreatures = rawCreatures
				.filter((creature): creature is Record<string, unknown> => !!creature && typeof creature === 'object' && !Array.isArray(creature))
				.map((creature) => ({
					name: typeof creature.name === 'string' ? creature.name : 'Unknown',
					count: typeof creature.count === 'number' ? creature.count : 1,
					hp: typeof creature.hp === 'number' ? creature.hp : null,
					ac: typeof creature.ac === 'number' ? creature.ac : null,
					cr: typeof creature.cr === 'string' ? creature.cr : null,
					path: typeof creature.path === 'string' ? creature.path : null,
					source: typeof creature.source === 'string' ? creature.source : null,
					is_trap: creature.is_trap === true,
					trap_path: typeof creature.trap_path === 'string' ? creature.trap_path : null,
					is_friendly: creature.is_friendly === true,
					is_hidden: creature.is_hidden === true,
				}));

			const encounterDifficulty = parsed.frontmatter.difficulty ?? null;
			const selectedPartyId = typeof parsed.frontmatter.selected_party_id === 'string' && parsed.frontmatter.selected_party_id.length > 0
				? parsed.frontmatter.selected_party_id
				: null;
			const useColorNames = parsed.frontmatter.use_color_names === true;


			// Find all scenes that link to this encounter
			const encounterWikiLink = `[[${encounterFile.path}]]`;
			const scenesLinking: TFile[] = [];

			// Search through all scene files
			for (const file of this.app.vault.getMarkdownFiles()) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.type === 'scene') {
					const sceneEncounterFile = cache.frontmatter.encounter_file;
					if (sceneEncounterFile && 
						(sceneEncounterFile === encounterWikiLink || 
						 sceneEncounterFile === encounterFile.path ||
						 sceneEncounterFile.includes(encounterFile.basename))) {
						scenesLinking.push(file);
					}
				}
			}


			// Update each scene's frontmatter
			for (const sceneFile of scenesLinking) {
				await this.updateSceneFrontmatter(sceneFile, {
					encounter_creatures: encounterCreatures,
					encounter_difficulty: encounterDifficulty,
					selected_party_id: selectedPartyId ?? ""
				});
			}

			// Update Initiative Tracker encounter
			await this.updateEncounterData(encounterName, encounterCreatures, selectedPartyId, useColorNames);

			if (scenesLinking.length > 0) {
				new Notice(`✅ Encounter "${encounterName}" synced to ${scenesLinking.length} scene(s)`);
			}
		} catch (error) {
			console.error('[SyncEncounter] Error:', error);
			new Notice('⚠️ Error syncing encounter to scenes');
		}
	}

	/**
	 * Update a scene's frontmatter fields
	 */
	async updateSceneFrontmatter(sceneFile: TFile, updates: Record<string, any>) {
		const content = await this.app.vault.read(sceneFile);
		const parsed = parseYamlFrontmatter(content);

		if (!parsed.hasFrontmatter) {
			console.error(`No frontmatter found in ${sceneFile.path}`);
			return;
		}

		const newContent = updateYamlFrontmatter(content, (frontmatter) => ({
			...frontmatter,
			...updates,
		}));

		await this.app.vault.modify(sceneFile, newContent);
	}

	/**
	 * Update encounter data in PartyManager
	 */
	async updateEncounterData(encounterName: string, creatures: any[], selectedPartyId: string | null, useColorNames: boolean = false) {
		try {
			const pm = this.partyManager;
			const existing = pm.getEncounter(encounterName);
			if (!existing) return;

			// Get party members if a party is selected
			const partyCreatures: import("./party/PartyTypes").StoredEncounterCreature[] = [];
			if (selectedPartyId) {
				const party = pm.getParty(selectedPartyId);
				if (party) {
					const resolved = await pm.resolveMembers(party.id);
					for (const m of resolved) {
						if (m.enabled) {
							partyCreatures.push(pm.memberToEncounterCreature(m));
						}
					}
				}
			}

			// Convert creatures to StoredEncounterCreature format
			const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Pink', 'Brown'];
			
			const enemyCreatures: import("./party/PartyTypes").StoredEncounterCreature[] = [];
			for (const c of creatures) {
				const count = c.count || 1;
				for (let i = 0; i < count; i++) {
					let creatureName = c.name;
					let displayName = c.name;

					if (count > 1 && useColorNames) {
						const colorIndex = i % colors.length;
						creatureName = `${c.name} (${colors[colorIndex]})`;
						displayName = creatureName;
					}

					enemyCreatures.push({
						name: creatureName,
						display: displayName,
						initiative: 0,
						modifier: 0,
						hp: c.hp || 1,
						maxHP: c.hp || 1,
						currentHP: c.hp || 1,
						tempHP: 0,
						cr: c.cr || undefined,
						ac: c.ac || 10,
						currentAC: c.ac || 10,
						id: pm.generateId(),
						enabled: true,
						hidden: c.isHidden || false,
						friendly: c.isFriendly || false,
						player: false,
						notePath: c.path || undefined,
						statuses: [],
					});
				}
			}

			const allCombatants = [...partyCreatures, ...enemyCreatures];

			const updated: import("./party/PartyTypes").StoredEncounter = {
				...existing,
				creatures: allCombatants,
			};

			await pm.saveEncounter(encounterName, updated);
			new Notice(`✅ Encounter data updated`);
		} catch (error) {
			console.error('[UpdateEncounter] Error updating encounter:', error);
		}
	}

	async createSession() {
		const campaignPath = this.resolveCampaign();
		// Open session creation modal
		new SessionCreationModal(this.app, this, undefined, campaignPath).open();
	}

	async openSessionPrepDashboard() {
		const campaignPath = this.resolveCampaign();
		
		// Check if view is already open
		const existing = this.app.workspace.getLeavesOfType(SESSION_PREP_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			// Reveal existing view and update campaign
			this.app.workspace.revealLeaf(existing[0]);
			const view = existing[0].view as SessionPrepDashboardView;
			view.setCampaign(campaignPath);
			return;
		}

		// Open in left pane
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: SESSION_PREP_VIEW_TYPE,
				active: true,
			});
			const view = leaf.view as SessionPrepDashboardView;
			view.setCampaign(campaignPath);
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async openSessionRunDashboard() {
		const campaignPath = this.resolveCampaign();
		
		// Check if dashboard view is already open
		const existing = this.app.workspace.getLeavesOfType(SESSION_RUN_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			const view = existing[0].view as SessionRunDashboardView;
			view.setCampaign(campaignPath);
			// Setup the session layout even if already open
			await view.setupSessionLayout();
			
			// Also open DM Screen if not already open
			await this.openDMScreen();
			return;
		}

		// Open dashboard control panel in left sidebar
		const dashboardLeaf = this.app.workspace.getLeftLeaf(false);
		if (dashboardLeaf) {
			await dashboardLeaf.setViewState({
				type: SESSION_RUN_VIEW_TYPE,
				active: true,
			});
			const view = dashboardLeaf.view as SessionRunDashboardView;
			view.setCampaign(campaignPath);
			this.app.workspace.revealLeaf(dashboardLeaf);
			
			// Setup the session layout with multiple panes
			await view.setupSessionLayout();
			
			// Open DM Screen in right sidebar
			await this.openDMScreen();
		}
	}

	async openDMScreen() {
		// Check if DM Screen is already open
		const existing = this.app.workspace.getLeavesOfType(DM_SCREEN_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// Open DM Screen in right sidebar
		const dmScreenLeaf = this.app.workspace.getRightLeaf(false);
		if (dmScreenLeaf) {
			await dmScreenLeaf.setViewState({
				type: DM_SCREEN_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(dmScreenLeaf);
		}
	}

	async openCombatTracker() {
		const existing = this.app.workspace.getLeavesOfType(COMBAT_TRACKER_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: COMBAT_TRACKER_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async openPursuitTracker() {
		const existing = this.app.workspace.getLeavesOfType(PURSUIT_TRACKER_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: PURSUIT_TRACKER_VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	startPursuitSetup() {
		new PursuitSetupModal(this.app, this).open();
	}

	startPursuitFromCombat() {
		const combatState = this.combatTracker.getState();
		if (!combatState) {
			new Notice("No active combat to start a chase from.");
			return;
		}
		new PursuitSetupModal(this.app, this, combatState).open();
	}

	/**
	 * Register a combat tracker listener that smoothly pans any projected
	 * player map view to center on the active combatant's token whenever
	 * the turn changes. Only active when the `combatAutoPan` setting is on.
	 */
	private registerCombatAutoPan(): void {
		let prevTurnIndex = -1;
		let prevRound = -1;

		const unsubscribe = this.combatTracker.onChange((state) => {
			if (!this.settings.combatAutoPan) return;
			if (!state || !state.started) {
				prevTurnIndex = -1;
				prevRound = -1;
				return;
			}
			// Only act when the turn actually changed
			if (state.turnIndex === prevTurnIndex && state.round === prevRound) return;
			prevTurnIndex = state.turnIndex;
			prevRound = state.round;

			const combatant = state.combatants[state.turnIndex];
			if (!combatant) return;

			// Smooth-pan all live projections (battle & free) to the active combatant's token.
			// Only consider vision-eligible tokens (player tokens + "Show to Players")
			// matching the "View as" dropdown filter.
			const projections = this.projectionManager.getLiveProjections();
			for (const proj of projections) {
				const view = proj.leaf.view as PlayerMapView;
				const mapCfg = view.getMapConfig?.();
				if (!mapCfg?.markers) continue;

				// Filter to vision-eligible markers (same criteria as the View-as list)
				const visionMarkers = (mapCfg.markers as any[]).filter((m: any) => {
					const def = m.markerId ? this.markerLibrary.getMarker(m.markerId) : null;
					if (!def) return false;
					return def.type === 'player' || m.visibleToPlayers;
				});

				let marker: any = null;

				// 1. Direct tokenId match
				if (combatant.tokenId) {
					marker = visionMarkers.find((m: any) => m.markerId === combatant.tokenId);
				}

				// 2. Vault note token_id fallback
				if (!marker && combatant.notePath) {
					const noteFile = this.app.vault.getAbstractFileByPath(combatant.notePath);
					if (noteFile && (noteFile as any).extension) {
						const noteCache = this.app.metadataCache.getFileCache(noteFile as any);
						const noteTokenId = noteCache?.frontmatter?.token_id;
						if (noteTokenId) {
							marker = visionMarkers.find((m: any) => m.markerId === noteTokenId);
						}
					}
				}

				// 3. Name-based fallback
				if (!marker) {
					marker = visionMarkers.find((m: any) => {
						const def = m.markerId ? this.markerLibrary.getMarker(m.markerId) : null;
						if (!def) return false;
						const mn = def.name.toLowerCase();
						const dn = (combatant.display || '').toLowerCase();
						const bn = (combatant.name || '').toLowerCase();
						return dn === mn || bn === mn || dn.startsWith(mn);
					});
				}

				if (marker?.position) {
					view.smoothPanToImageCoords(marker.position.x, marker.position.y);
					break;
				}
			}
		});

		this.register(() => unsubscribe());
	}

	/**
	 * Register context menus for handout projection.
	 * Adds "Project to..." items to file explorer, editor, and inline image menus
	 * when a projection session is active.
	 */
	private registerHandoutProjectionMenus(): void {
		// File explorer + tab header right-click
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile)) return;
				const contentType = detectHandoutContentType(file.path);
				if (!contentType) return;
				if (!this.sessionProjectionManager?.isActive()) return;

				menu.addSeparator();
				addHandoutProjectionItems(this, menu, file.path, contentType);
			})
		);

		// Editor right-click (always treats the open file as a note)
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, _editor, view) => {
				const file = (view as any).file as TFile | null;
				if (!file) return;
				if (!this.sessionProjectionManager?.isActive()) return;

				menu.addSeparator();
				addHandoutProjectionItems(this, menu, file.path, 'note');
			})
		);

		// Inline image right-click inside markdown preview
		this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			if (!(target instanceof HTMLImageElement)) return;
			const previewContainer = target.closest('.markdown-preview-view, .markdown-reading-view');
			if (!previewContainer) return;
			if (!this.sessionProjectionManager?.isActive()) return;

			const src = target.getAttribute('src') ?? '';
			const imageFile = this.app.vault.getFiles().find((f) => {
				const ext = f.extension.toLowerCase();
				if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return false;
				const resourcePath = this.app.vault.adapter.getResourcePath(f.path);
				return src.includes(f.path) || src === resourcePath;
			});
			if (!imageFile) return;

			evt.preventDefault();
			const menu = new Menu();
			addHandoutProjectionItems(this, menu, imageFile.path, 'image');
			menu.showAtMouseEvent(evt);
		});
	}

	/**
	 * Ensure the standalone Music Player leaf is open in the left sidebar.
	 * Creates a split below any existing left-sidebar leaf (bottom-left).
	 * If already open, just reveals it.
	 */
	async ensureMusicPlayerOpen(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(MUSIC_PLAYER_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// getLeftLeaf(true) creates a new split in the left sidebar
		const leaf = this.app.workspace.getLeftLeaf(true);
		if (leaf) {
			await leaf.setViewState({
				type: MUSIC_PLAYER_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// ─── Music: Status Bar ────────────────────────────────────

	/**
	 * Create a status bar item that shows the currently playing track.
	 * Clicking it toggles the music player leaf.
	 */
	private initMusicStatusBar() {
		this._musicStatusBarEl = this.addStatusBarItem();
		this._musicStatusBarEl.addClass('dnd-music-status-bar');
		this._musicStatusBarEl.setText('');
		this._musicStatusBarEl.style.cursor = 'pointer';
		this._musicStatusBarEl.addEventListener('click', () => {
			const existing = this.app.workspace.getLeavesOfType(MUSIC_PLAYER_VIEW_TYPE);
			if (existing.length > 0 && existing[0]) {
				// Already open → close it
				existing[0].detach();
			} else {
				this.ensureMusicPlayerOpen();
			}
		});

		// Listen to track & state changes on primary layer
		const origPrimaryTrackCb = this.musicPlayer.primary.onTrackChange;
		const origPrimaryStateCb = this.musicPlayer.primary.onStateChange;

		const updateStatusBar = () => {
			if (!this._musicStatusBarEl) return;
			const track = this.musicPlayer.primary.getCurrentTrack();
			const playing = this.musicPlayer.primary.state.isPlaying;
			if (playing && track) {
				this._musicStatusBarEl.setText(`🎵 ${track.title}`);
			} else if (track && !playing) {
				this._musicStatusBarEl.setText(`⏸ ${track.title}`);
			} else {
				this._musicStatusBarEl.setText('');
			}
		};

		this.musicPlayer.primary.onTrackChange = (track) => {
			origPrimaryTrackCb?.(track);
			updateStatusBar();
		};
		this.musicPlayer.primary.onStateChange = (state) => {
			origPrimaryStateCb?.(state);
			updateStatusBar();
			// Debounced persistence save on state changes
			this.debouncedSaveMusicState();
		};

		// Also hook ambient layer for persistence
		const origAmbientStateCb = this.musicPlayer.ambient.onStateChange;
		this.musicPlayer.ambient.onStateChange = (state) => {
			origAmbientStateCb?.(state);
			this.debouncedSaveMusicState();
		};

		this._musicStatusBarCleanup = () => {
			this.musicPlayer.primary.onTrackChange = origPrimaryTrackCb;
			this.musicPlayer.primary.onStateChange = origPrimaryStateCb;
			this.musicPlayer.ambient.onStateChange = origAmbientStateCb;
		};
	}

	// ─── Music: Playback Persistence ──────────────────────────

	private _saveMusicStateTimer: ReturnType<typeof setTimeout> | null = null;

	/** Debounce state saves — don't write data.json on every 500ms progress tick */
	private debouncedSaveMusicState() {
		if (this._saveMusicStateTimer) clearTimeout(this._saveMusicStateTimer);
		this._saveMusicStateTimer = setTimeout(() => {
			this.saveMusicPlaybackState();
		}, 2000);
	}

	/** Snapshot current playback state and persist to data.json */
	private async saveMusicPlaybackState() {
		const p = this.musicPlayer.primary.state;
		const a = this.musicPlayer.ambient.state;
		this.settings.musicPlaybackState = {
			primaryVolume: p.volume,
			ambientVolume: a.volume,
			primaryMuted: p.isMuted,
			ambientMuted: a.isMuted,
			primaryPlaylistId: p.currentPlaylistId,
			ambientPlaylistId: a.currentPlaylistId,
			primaryShuffled: p.isShuffled,
			ambientShuffled: a.isShuffled,
			primaryRepeatMode: p.repeatMode,
			ambientRepeatMode: a.repeatMode,
		};
		await this.saveSettings();
	}

	/** Restore volumes, playlists, shuffle/repeat from the persisted state */
	private restoreMusicPlaybackState() {
		const s = this.settings.musicPlaybackState;
		if (!s) return;

		// Restore volumes
		this.musicPlayer.primary.setVolume(s.primaryVolume ?? 70);
		this.musicPlayer.ambient.setVolume(s.ambientVolume ?? 50);

		// Restore mute
		if (s.primaryMuted) this.musicPlayer.primary.toggleMute();
		if (s.ambientMuted) this.musicPlayer.ambient.toggleMute();

		// Restore shuffle
		if (s.primaryShuffled) this.musicPlayer.primary.toggleShuffle();
		if (s.ambientShuffled) this.musicPlayer.ambient.toggleShuffle();

		// Restore repeat mode
		if (s.primaryRepeatMode) {
			while (this.musicPlayer.primary.state.repeatMode !== s.primaryRepeatMode) {
				this.musicPlayer.primary.cycleRepeatMode();
			}
		}
		if (s.ambientRepeatMode) {
			while (this.musicPlayer.ambient.state.repeatMode !== s.ambientRepeatMode) {
				this.musicPlayer.ambient.cycleRepeatMode();
			}
		}

		// Restore loaded playlists (without auto-playing)
		if (s.primaryPlaylistId) {
			const pl = this.settings.musicSettings.playlists.find(p => p.id === s.primaryPlaylistId);
			if (pl) this.musicPlayer.primary.loadPlaylist(pl);
		}
		if (s.ambientPlaylistId) {
			const pl = this.settings.musicSettings.playlists.find(p => p.id === s.ambientPlaylistId);
			if (pl) this.musicPlayer.ambient.loadPlaylist(pl);
		}
	}

	/**
	 * Open the Hexcrawl panel in the bottom-right split.
	 * If already open, just reveal it.
	 */
	async openHexcrawlPanel() {
		const existing = this.app.workspace.getLeavesOfType(HEXCRAWL_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// Open in the right sidebar — use createLeafInParent to split bottom
		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: HEXCRAWL_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(rightLeaf);
		}
	}

	/**
	 * Refresh any open HexcrawlView leaves (called after map state changes).
	 */
	refreshHexcrawlView() {
		const leaves = this.app.workspace.getLeavesOfType(HEXCRAWL_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as HexcrawlView;
			if (view && typeof view.refresh === 'function') {
				view.refresh();
			}
		}
	}

	/**
	 * Detect campaign path from the currently active file
	 */
	detectCampaignFromActiveFile(): string | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return null;
		
		// Check if file is in a campaign folder (ttrpgs/CampaignName/...)
		const pathMatch = activeFile.path.match(/^ttrpgs\/([^\/]+)/);
		if (pathMatch && pathMatch[1]) {
			return `ttrpgs/${pathMatch[1]}`;
		}
		
		return null;
	}

	/**
	 * Resolve the best campaign path for the current context.
	 * 1. Detect from active file path
	 * 2. Fall back to the first campaign found in ttrpgs/
	 * Returns empty string if no campaigns exist.
	 */
	resolveCampaign(): string {
		return this.detectCampaignFromActiveFile()
			|| this.getAllCampaigns()[0]?.path
			|| "";
	}

	async createSpell() {
		// Open Spell Import/Creation modal with SRD API integration
		new SpellImportModal(this.app, this).open();
	}

	async createMap() {
		// Open Template Picker — battlemaps created from templates
		new TemplatePickerModal(this.app, this, this.mapManager).open();
	}

	/**
	 * Open the MapCreationModal in direct mode — image → grid config → insert map.
	 * Bypasses the template workflow for quick one-off maps.
	 */
	async createMapDirect() {
		new MapCreationModal(this.app, this, this.mapManager).open();
	}

	/**
	 * Open the MapCreationModal in template mode to create a new battlemap template.
	 * Creates a note in z_BattlemapTemplates/ with a dnd-map code block
	 * that the GM can then configure (walls, fog, lights, etc.).
	 */
	async createBattlemapTemplate() {
		new MapCreationModal(this.app, this, this.mapManager, undefined, undefined, false, true).open();
	}


	/**
	 * Render map view from dnd-map code block.
	 * Delegated to map-views/renderMapView.
	 */
	async renderMapView(source: string, el: HTMLElement, ctx: any) {
		return renderMapViewFn(this, source, el, ctx);
	}

	/**
	 * Render encounter view from dnd-encounter code block.
	 */
	async renderEncounterView(source: string, el: HTMLElement, ctx: any) {
		return renderEncounterViewFn(this, source, el, ctx);
	}

	/**
	 * Render PoI view from dnd-poi code block.
	 */
	async renderPoiView(source: string, el: HTMLElement, ctx: any) {
		return renderPoiViewFn(this, source, el, ctx);
	}

	/**
	 * Render party view from dnd-party code block.
	 */
	async renderPartyView(source: string, el: HTMLElement, ctx: any) {
		return renderPartyViewFn(this, source, el, ctx);
	}

	//  Map Persistence (delegated to map/MapPersistence) 

	saveMapAnnotations(config: any, el: HTMLElement) {
		return saveMapAnnotationsFn(this, config, el);
	}

	private async _flushMapSave(mapId: string) {
		return _flushMapSaveFn(this, mapId);
	}

	private async _flushAllPendingSaves() {
		return _flushAllPendingSavesFn(this);
	}

	getMapAnnotationPath(mapId: string): string {
		return getMapAnnotationPathFn(this, mapId);
	}

	async loadMapAnnotations(mapId: string): Promise<any> {
		return loadMapAnnotationsFn(this, mapId);
	}

	async queryMapTemplates(criteria: { terrain?: string; climate?: string; location?: string; timeOfDay?: string; size?: string }): Promise<Array<{
		mapId: string; name: string; imageFile: string; tags: any; matchScore: number;
	}>> {
		return queryMapTemplatesFn(this, criteria);
	}

	//  Grid Drawing (delegated to map/GridOverlay) 

	drawGridOverlay(container: HTMLElement, img: MapMediaElement, config: any, offsetX: number = 0, offsetY: number = 0, reuseCanvas?: HTMLCanvasElement | null, canvasScale: number = 1): HTMLCanvasElement {
		return drawGridOverlayFn(container, img, config, offsetX, offsetY, reuseCanvas, canvasScale);
	}

	drawFilledHexFlatStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
		return drawFilledHexFlatStretchedFn(ctx, cx, cy, rx, ry);
	}

	drawFilledHexPointyStretched(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
		return drawFilledHexPointyStretchedFn(ctx, cx, cy, rx, ry);
	}

	async createFaction() {
		// Open Faction creation modal
		new FactionCreationModal(this.app, this).open();
	}

	async importAllSRDData() {
		return importAllSRDDataFn(this);
	}

	async importSRDCreatureTokens(): Promise<{ imported: number; errors: number }> {
		return importSRDCreatureTokensFn(this);
	}

	async importSRDCategory(categoryKey: string, folderName: string, categoryName: string, isBulkImport?: boolean): Promise<{success: number, errors: number}> {
		return importSRDCategoryFn(this, categoryKey, folderName, categoryName, isBulkImport);
	}

	async promptForName(type: string): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new NamePromptModal(this.app, type, resolve);
			modal.open();
		});
	}

	/**
	 * Roll on the encounter table of the currently active note.
	 * Reads frontmatter to verify the note is an encounter-table and picks a random entry.
	 */
	async rollRandomEncounter() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Open an encounter table note first.");
			return;
		}

		const cache = this.app.metadataCache.getFileCache(activeFile);
		if (cache?.frontmatter?.type !== "encounter-table") {
			new Notice("⚠️ This is not an encounter table note.");
			return;
		}

		const entries = cache.frontmatter.entries || 6;
		const roll = Math.floor(Math.random() * entries) + 1;

		// Try to find the matching row in the table
		const content = await this.app.vault.read(activeFile);
		const tableRowRegex = new RegExp(`^\\|\\s*${roll}\\s*\\|(.+?)\\|(.+?)\\|(.+?)\\|`, "m");
		const match = content.match(tableRowRegex);

		if (match) {
			const encounter = match[1]?.trim() ?? "Unknown";
			const difficulty = match[2]?.trim() ?? "";
			new Notice(`🎲 Rolled ${roll} on d${entries}:\n${encounter}\nDifficulty: ${difficulty}`, 8000);
		} else {
			new Notice(`🎲 Rolled ${roll} on d${entries}!`, 5000);
		}
	}

	async ensureFolderExists(path: string) {
		const folders = path.split("/");
		let currentPath = "";

		for (const folder of folders) {
			currentPath += (currentPath ? "/" : "") + folder;
			try {
				await this.app.vault.createFolder(currentPath);
			} catch (error) {
				// Folder might already exist, continue
			}
		}
	}

	getDefaultCampaignTemplate(): string {
		return CAMPAIGN_TEMPLATE;
	}

	getDefaultNpcTemplate(): string {
		return NPC_TEMPLATE;
	}

	getDefaultPcTemplate(): string {
		return PC_TEMPLATE;
	}

	getDefaultAdventureTemplate(): string {
		return ADVENTURE_TEMPLATE;
	}

	getDefaultSessionTemplate(): string {
		return SESSION_DEFAULT_TEMPLATE;
	}

	getDefaultItemTemplate(): string {
		return ITEM_TEMPLATE;
	}

	getDefaultSpellTemplate(): string {
		return SPELL_TEMPLATE;
	}

	getDefaultFactionTemplate(): string {
		return FACTION_TEMPLATE;
	}

	getFileNameFromPath(): string {
		// This is a placeholder - in actual use, this would be the filename
		return "New Entity";
	}

	getAllCampaigns(): Array<{ path: string; name: string }> {
		const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
		const campaigns: Array<{ path: string; name: string }> = [];

		if (ttrpgsFolder instanceof TFolder) {
			ttrpgsFolder.children.forEach((child) => {
				if (child instanceof TFolder) {
					campaigns.push({
						path: child.path,
						name: child.name
					});
				}
			});
		}

		return campaigns;
	}
}
