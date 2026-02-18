/**
 * Hexcrawl View
 *
 * An Obsidian leaf view that provides the full hexcrawl travel management panel.
 * Opens in the bottom-right split of the workspace. Reads/writes the active
 * map's hexcrawl state via a bridge stored on the plugin instance.
 */

import { ItemView, WorkspaceLeaf, Notice, Setting } from 'obsidian';
import { HexcrawlTracker } from './HexcrawlTracker';
import { HexcrawlSettingsModal } from './TerrainPainter';
import { hLoc } from './HexcrawlLocale';
import {
  TerrainType,
  HexcrawlState,
  HexTerrain,
  HexcrawlPace,
  WeatherType,
  ExplorationRoleId,
  createDefaultHexcrawlState,
  getTerrainDefinition,
  TERRAIN_DEFINITIONS,
  EXPLORATION_ROLES,
  HEXCRAWL_PACES,
  WEATHER_TABLE,
} from './types';

export const HEXCRAWL_VIEW_TYPE = 'dnd-hexcrawl-view';

// ─── Bridge interface ─────────────────────────────────────────────────

/** Stored on the plugin so the view can talk to the active map. */
export interface HexcrawlBridge {
  /** Current map config (mutable reference). */
  config: any;
  /** Element for saveMapAnnotations. */
  el: HTMLElement;
  /** Call to persist data. */
  save: () => void;
  /** Call to repaint the annotation canvas. */
  redraw: () => void;
  /** Call to set the active tool on the map. */
  setActiveTool: (tool: string) => void;
}

// ─── View ─────────────────────────────────────────────────────────────

export class HexcrawlView extends ItemView {
  plugin: any; // DndCampaignHubPlugin — avoids circular import
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: any) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return HEXCRAWL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '🏕️ Hexcrawl';
  }

  getIcon(): string {
    return 'map';
  }

  async onOpen() {
    this.render();
    // Auto-refresh every 2 s to pick up changes from the map (terrain paint, etc.)
    // Skip refresh if a text input inside this view is focused to avoid interrupting typing
    this.refreshTimer = setInterval(() => {
      const container = this.containerEl.children[1] as HTMLElement;
      if (container && container.contains(document.activeElement) &&
          (document.activeElement instanceof HTMLInputElement ||
           document.activeElement instanceof HTMLTextAreaElement ||
           document.activeElement instanceof HTMLSelectElement)) {
        return; // Don't re-render while user is interacting with an input
      }
      this.render();
    }, 2000);
  }

  async onClose() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  // ── Public: force immediate re-render (called from the map side) ────
  refresh() {
    this.render();
  }

  // ── Render ──────────────────────────────────────────────────────────

  private render() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;

    // Preserve scroll position
    const scrollTop = container.scrollTop;
    container.empty();
    container.addClass('hexcrawl-view');

    const bridge: HexcrawlBridge | null = (this.plugin as any)._hexcrawlBridge ?? null;

    if (!bridge) {
      this.renderNoMap(container);
      container.scrollTop = scrollTop;
      return;
    }

    const config = bridge.config;
    const hcState: HexcrawlState | undefined = config.hexcrawlState;

    if (!hcState || !hcState.enabled) {
      this.renderDisabled(container, bridge);
      container.scrollTop = scrollTop;
      return;
    }

    this.renderEnabled(container, bridge, hcState);
    container.scrollTop = scrollTop;
  }

  // ── No map connected ───────────────────────────────────────────────

  /** Resolve the current description language from the bridge or default to 'en'. */
  private get lang() {
    const bridge: HexcrawlBridge | null = (this.plugin as any)._hexcrawlBridge ?? null;
    return (bridge?.config?.hexcrawlState?.descriptionLanguage as 'en' | 'de') || 'en';
  }

  private renderNoMap(container: HTMLElement) {
    const L = this.lang;
    const empty = container.createDiv({ cls: 'hexcrawl-view-empty' });
    empty.createEl('div', { text: '🏕️', cls: 'hexcrawl-view-empty-icon' });
    empty.createEl('div', { text: hLoc(L, 'noHexMapActive'), cls: 'hexcrawl-view-empty-text' });
    empty.createEl('div', {
      text: hLoc(L, 'openHexMapHint'),
      cls: 'hexcrawl-view-empty-hint',
    });
  }

  // ── Disabled state ─────────────────────────────────────────────────

  private renderDisabled(container: HTMLElement, bridge: HexcrawlBridge) {
    const L = this.lang;
    const empty = container.createDiv({ cls: 'hexcrawl-view-empty' });
    empty.createEl('div', { text: '🏕️', cls: 'hexcrawl-view-empty-icon' });
    empty.createEl('div', { text: hLoc(L, 'trackingDisabled'), cls: 'hexcrawl-view-empty-text' });

    const enableBtn = empty.createEl('button', {
      text: hLoc(L, 'enableHexcrawl'),
      cls: 'hexcrawl-view-enable-btn',
    });
    enableBtn.addEventListener('click', () => {
      this.openSettings(bridge);
    });
  }

  // ── Enabled — full panel ───────────────────────────────────────────

  private renderEnabled(container: HTMLElement, bridge: HexcrawlBridge, hcState: HexcrawlState) {
    const tracker = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
    const L = hcState.descriptionLanguage || 'en';

    // ── Header ───────────────────────────────────────────
    const header = container.createDiv({ cls: 'hexcrawl-view-header' });
    header.createEl('h4', { text: hLoc(L, 'hexcrawlTravel') });
    const settingsBtn = header.createEl('button', {
      text: '⚙️',
      cls: 'hexcrawl-view-settings-btn',
      attr: { title: hLoc(L, 'hexcrawlSettings') },
    });
    settingsBtn.addEventListener('click', () => this.openSettings(bridge));

    // ── Day & Movement ───────────────────────────────────
    const daySection = container.createDiv({ cls: 'hexcrawl-view-section' });
    daySection.createEl('div', { text: hLoc(L, 'dayN', { n: hcState.currentDay }), cls: 'hexcrawl-view-day' });
    const maxHex = tracker.getMaxHexesToday();
    const moved = hcState.hexesMovedToday;
    daySection.createEl('div', {
      text: hLoc(L, 'movementDisplay', { moved, max: maxHex }),
      cls: 'hexcrawl-view-movement',
    });

    // Movement progress bar
    const movBar = daySection.createDiv({ cls: 'hexcrawl-view-progress' });
    const movFill = movBar.createDiv({ cls: 'hexcrawl-view-progress-fill' });
    movFill.style.width = `${Math.min(100, (moved / Math.max(1, maxHex)) * 100)}%`;

    // ── Pace Selector ────────────────────────────────────
    const paceSection = container.createDiv({ cls: 'hexcrawl-view-section' });
    paceSection.createEl('div', { text: hLoc(L, 'travelPace'), cls: 'hexcrawl-view-label' });
    const paceRow = paceSection.createDiv({ cls: 'hexcrawl-view-pace-row' });
    for (const p of HEXCRAWL_PACES) {
      const icon = p.id === 'slow' ? '🐢' : p.id === 'normal' ? '🚶' : '🏃';
      const pBtn = paceRow.createEl('button', {
        cls: `hexcrawl-view-pace-btn ${p.id === hcState.pace ? 'active' : ''}`,
        attr: { title: hLoc(L, `paceDesc.${p.id}`) },
      });
      pBtn.createEl('span', { text: icon, cls: 'hexcrawl-view-pace-icon' });
      pBtn.createEl('span', { text: hLoc(L, `pace.${p.id}`), cls: 'hexcrawl-view-pace-name' });
      pBtn.addEventListener('click', () => {
        hcState.pace = p.id;
        bridge.save();
        this.render();
      });
    }

    // ── Weather ──────────────────────────────────────────
    const weatherSection = container.createDiv({ cls: 'hexcrawl-view-section' });
    weatherSection.createEl('div', { text: hLoc(L, 'weather'), cls: 'hexcrawl-view-label' });
    const currentWeather = WEATHER_TABLE.find(w => w.type === hcState.currentWeather) ?? WEATHER_TABLE[0]!;
    const weatherCard = weatherSection.createDiv({ cls: 'hexcrawl-view-weather-card' });
    weatherCard.createEl('span', { text: currentWeather!.icon, cls: 'hexcrawl-view-weather-icon' });
    const weatherInfo = weatherCard.createDiv({ cls: 'hexcrawl-view-weather-info' });
    weatherInfo.createEl('div', { text: hLoc(L, `weather.${currentWeather!.type}`), cls: 'hexcrawl-view-weather-name' });
    weatherInfo.createEl('div', {
      text: hLoc(L, `weatherFx.${currentWeather!.type}`),
      cls: 'hexcrawl-view-weather-effect',
    });
    if (currentWeather!.travelModifier !== 1.0) {
      weatherInfo.createEl('div', {
        text: hLoc(L, 'travelMod', { val: currentWeather!.travelModifier }),
        cls: 'hexcrawl-view-weather-mod',
      });
    }

    // Weather actions
    const weatherActions = weatherSection.createDiv({ cls: 'hexcrawl-view-row' });
    const rollWeatherBtn = weatherActions.createEl('button', {
      text: hLoc(L, 'rollWeather'),
      cls: 'hexcrawl-view-btn',
    });
    rollWeatherBtn.addEventListener('click', () => {
      const tr = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
      const result = tr.rollWeather();
      bridge.config.hexcrawlState = tr.toJSON();
      bridge.save();
      const w = WEATHER_TABLE.find(x => x.type === result);
      new Notice(hLoc(L, 'weatherNotice', { icon: w?.icon || '', name: hLoc(L, `weather.${result}`) }));
      this.render();
    });

    // Manual weather selector
    const weatherSelect = weatherActions.createEl('select', { cls: 'hexcrawl-view-select' });
    for (const w of WEATHER_TABLE) {
      const opt = weatherSelect.createEl('option', {
        text: `${w.icon} ${hLoc(L, `weather.${w.type}`)}`,
        value: w.type,
      });
      if (w.type === hcState.currentWeather) opt.selected = true;
    }
    weatherSelect.addEventListener('change', () => {
      hcState.currentWeather = weatherSelect.value as WeatherType;
      bridge.save();
      this.render();
    });

    // ── Survival Meter ───────────────────────────────────
    const meterSection = container.createDiv({ cls: 'hexcrawl-view-section' });
    meterSection.createEl('div', { text: hLoc(L, 'survivalMeter'), cls: 'hexcrawl-view-label' });

    const meterBar = meterSection.createDiv({ cls: 'hexcrawl-view-meter' });
    for (let i = 0; i < hcState.survivalMeter.max; i++) {
      const seg = meterBar.createDiv({ cls: 'hexcrawl-view-meter-seg' });
      if (i < hcState.survivalMeter.current) {
        seg.addClass('filled');
        if (i < hcState.survivalMeter.threshold) seg.addClass('danger');
      }
    }

    const meterLabel = meterSection.createDiv({ cls: 'hexcrawl-view-meter-label' });
    meterLabel.createEl('span', {
      text: `${hcState.survivalMeter.current} / ${hcState.survivalMeter.max}`,
    });
    if (hcState.survivalMeter.current <= hcState.survivalMeter.threshold) {
      meterLabel.createEl('span', { text: hLoc(L, 'danger'), cls: 'hexcrawl-view-danger' });
    }

    // Meter adjust buttons
    const meterActions = meterSection.createDiv({ cls: 'hexcrawl-view-row' });
    const decBtn = meterActions.createEl('button', { text: hLoc(L, 'minus1'), cls: 'hexcrawl-view-btn small' });
    decBtn.addEventListener('click', () => {
      const tr = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
      tr.decrementMeter();
      bridge.config.hexcrawlState = tr.toJSON();
      bridge.save();
      this.render();
    });
    const incBtn = meterActions.createEl('button', { text: hLoc(L, 'plus1'), cls: 'hexcrawl-view-btn small' });
    incBtn.addEventListener('click', () => {
      const tr = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
      tr.incrementMeter();
      bridge.config.hexcrawlState = tr.toJSON();
      bridge.save();
      this.render();
    });
    const resetBtn = meterActions.createEl('button', { text: hLoc(L, 'resetLabel'), cls: 'hexcrawl-view-btn small' });
    resetBtn.addEventListener('click', () => {
      const tr = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
      tr.resetMeter();
      bridge.config.hexcrawlState = tr.toJSON();
      bridge.save();
      this.render();
      new Notice(hLoc(L, 'meterReset'));
    });

    // ── Exhaustion ───────────────────────────────────────
    if (hcState.exhaustionLevel > 0) {
      const exSection = container.createDiv({ cls: 'hexcrawl-view-section hexcrawl-view-exhaustion' });
      exSection.createEl('div', {
        text: hLoc(L, 'exhaustionLevel', { level: hcState.exhaustionLevel }),
        cls: 'hexcrawl-view-exhaustion-title',
      });
      exSection.createEl('div', {
        text: hLoc(L, `exhaustion.${hcState.exhaustionLevel}`),
        cls: 'hexcrawl-view-exhaustion-effect',
      });
    }

    // ── Party Position ───────────────────────────────────
    if (hcState.partyPosition) {
      const posSection = container.createDiv({ cls: 'hexcrawl-view-section' });
      const terrain = getTerrainDefinition(
        new HexcrawlTracker(hcState, bridge.config.hexTerrains || []).getTerrainAt(
          hcState.partyPosition.col,
          hcState.partyPosition.row,
        ),
      );
      posSection.createEl('div', {
        text: hLoc(L, 'positionDisplay', { col: hcState.partyPosition.col, row: hcState.partyPosition.row, icon: terrain.icon, name: hLoc(L, `terrain.${terrain.id}`) }),
        cls: 'hexcrawl-view-position',
      });
    }

    // ── Exploration Roles ────────────────────────────────
    const rolesSection = container.createDiv({ cls: 'hexcrawl-view-section' });
    rolesSection.createEl('div', { text: hLoc(L, 'explorationRoles'), cls: 'hexcrawl-view-label' });
    const rolesGrid = rolesSection.createDiv({ cls: 'hexcrawl-view-roles-grid' });
    for (const role of EXPLORATION_ROLES) {
      const row = rolesGrid.createDiv({ cls: 'hexcrawl-view-role-row' });
      row.createEl('span', { text: `${role.icon} ${hLoc(L, `role.${role.id}`)}`, cls: 'hexcrawl-view-role-name' });
      const input = row.createEl('input', {
        type: 'text',
        cls: 'hexcrawl-view-role-input',
        attr: { placeholder: hLoc(L, 'playerNamePlaceholder') },
        value: hcState.roleAssignments[role.id] || '',
      });
      input.addEventListener('change', () => {
        hcState.roleAssignments[role.id] = input.value;
        bridge.save();
      });
    }

    // ── Travel Log (last 5 entries) ──────────────────────
    if (hcState.travelLog && hcState.travelLog.length > 0) {
      const logSection = container.createDiv({ cls: 'hexcrawl-view-section' });
      logSection.createEl('div', { text: hLoc(L, 'travelLog'), cls: 'hexcrawl-view-label' });
      const entries = hcState.travelLog.slice(-5).reverse();
      for (const entry of entries) {
        const logEntry = logSection.createDiv({ cls: 'hexcrawl-view-log-entry' });
        const terrainDef = getTerrainDefinition(entry.terrain);
        logEntry.createEl('span', {
          text: hLoc(L, 'logEntry', { day: entry.day, icon: terrainDef.icon, col: entry.col, row: entry.row }),
          cls: 'hexcrawl-view-log-text',
        });
        if (entry.encounterTriggered) {
          logEntry.createEl('span', { text: '⚔️', cls: 'hexcrawl-view-log-badge' });
        }
      }
    }

    // ── Actions ──────────────────────────────────────────
    const actionsSection = container.createDiv({ cls: 'hexcrawl-view-actions' });

    const travelBtn = actionsSection.createEl('button', {
      text: hLoc(L, 'travelToHex'),
      cls: 'hexcrawl-view-action-btn primary',
    });
    travelBtn.addEventListener('click', () => {
      if (bridge.setActiveTool) {
        bridge.setActiveTool('hexcrawl-move');
        new Notice(hLoc(L, 'clickToTravel'));
      }
    });

    const setStartBtn = actionsSection.createEl('button', {
      text: hLoc(L, 'setStartingHex'),
      cls: 'hexcrawl-view-action-btn',
    });
    setStartBtn.addEventListener('click', () => {
      if (bridge.setActiveTool) {
        bridge.setActiveTool('set-start-hex');
        new Notice(hLoc(L, 'clickToSetStart'));
      }
    });

    const endDayBtn = actionsSection.createEl('button', {
      text: hLoc(L, 'endDay'),
      cls: 'hexcrawl-view-action-btn',
    });
    endDayBtn.addEventListener('click', () => {
      const tr = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
      tr.endDay();
      bridge.config.hexcrawlState = tr.toJSON();
      bridge.save();
      this.render();
      new Notice(hLoc(L, 'newDayNotice', { day: hcState.currentDay }));
    });
  }

  // ── Settings helper ────────────────────────────────────────────────

  private openSettings(bridge: HexcrawlBridge) {
    const config = bridge.config;
    const hcState = config.hexcrawlState || createDefaultHexcrawlState(config.mapId);
    new HexcrawlSettingsModal(
      this.app,
      hcState.enabled,
      hcState.survivalMeter.max,
      hcState.survivalMeter.threshold,
      hcState.descriptionLanguage || 'en',
      (result) => {
        if (!config.hexcrawlState) {
          config.hexcrawlState = createDefaultHexcrawlState(config.mapId);
        }
        config.hexcrawlState.enabled = result.enabled;
        config.hexcrawlState.survivalMeter.max = result.meterMax;
        config.hexcrawlState.survivalMeter.threshold = result.meterThreshold;
        config.hexcrawlState.descriptionLanguage = result.descriptionLanguage;
        if (config.hexcrawlState.survivalMeter.current > result.meterMax) {
          config.hexcrawlState.survivalMeter.current = result.meterMax;
        }
        bridge.save();
        this.render();
        new Notice(result.enabled ? hLoc(this.lang, 'hexcrawlEnabled') : hLoc(this.lang, 'hexcrawlDisabled'));
      },
    ).open();
  }
}
