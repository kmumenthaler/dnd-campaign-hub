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
  TRAVEL_METHODS,
  TRAVEL_METHOD_CATEGORIES,
  TravelMethodCategory,
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

    // ── Travel Method Selector ─────────────────────────────
    const methodSection = container.createDiv({ cls: 'hexcrawl-view-section' });
    methodSection.createEl('div', { text: hLoc(L, 'travelMethod'), cls: 'hexcrawl-view-label' });

    const currentMethod = TRAVEL_METHODS.find(m => m.id === hcState.travelMethod) ?? TRAVEL_METHODS[0]!;

    // Dropdown trigger button
    const methodDropdown = methodSection.createDiv({ cls: 'hexcrawl-method-dropdown' });
    const methodTrigger = methodDropdown.createEl('button', { cls: 'hexcrawl-method-trigger' });
    methodTrigger.createEl('span', { text: currentMethod!.icon, cls: 'hexcrawl-method-trigger-icon' });
    methodTrigger.createEl('span', { text: currentMethod!.name, cls: 'hexcrawl-method-trigger-name' });
    const methodHexes = Math.max(1, Math.floor(currentMethod!.hexesPerDay * (HEXCRAWL_PACES.find(p => p.id === hcState.pace) ?? HEXCRAWL_PACES[1]!).modifier));
    methodTrigger.createEl('span', { text: `${methodHexes} hex/d`, cls: 'hexcrawl-method-trigger-speed' });
    methodTrigger.createEl('span', { text: '▾', cls: 'hexcrawl-method-trigger-arrow' });

    // Dropdown panel (hidden by default)
    const methodPanel = methodDropdown.createDiv({ cls: 'hexcrawl-method-panel hidden' });
    const methodSearch = methodPanel.createEl('input', {
      type: 'search',
      placeholder: hLoc(L, 'searchMethods'),
      cls: 'hexcrawl-method-search',
    });
    const methodList = methodPanel.createDiv({ cls: 'hexcrawl-method-list' });

    const renderMethodList = (filter: string = '') => {
      methodList.empty();
      const lf = filter.toLowerCase();
      const categories: TravelMethodCategory[] = ['land', 'water', 'air', 'magic'];
      for (const cat of categories) {
        const methods = TRAVEL_METHODS.filter(m =>
          m.category === cat &&
          (lf === '' || m.name.toLowerCase().includes(lf) || m.category.includes(lf))
        );
        if (methods.length === 0) continue;
        const catMeta = TRAVEL_METHOD_CATEGORIES[cat];
        methodList.createEl('div', {
          text: `${catMeta.icon} ${hLoc(L, `methodCat.${cat}`)}`,
          cls: 'hexcrawl-method-cat-header',
        });
        for (const m of methods) {
          const paceMod = (HEXCRAWL_PACES.find(p => p.id === hcState.pace) ?? HEXCRAWL_PACES[1]!).modifier;
          const eff = Math.max(1, Math.floor(m.hexesPerDay * paceMod));
          const item = methodList.createDiv({
            cls: `hexcrawl-method-item ${m.id === hcState.travelMethod ? 'active' : ''}`,
          });
          item.createEl('span', { text: m.icon, cls: 'hexcrawl-method-item-icon' });
          item.createEl('span', { text: m.name, cls: 'hexcrawl-method-item-name' });
          item.createEl('span', { text: `${eff} hex/d`, cls: 'hexcrawl-method-item-speed' });
          item.addEventListener('click', () => {
            hcState.travelMethod = m.id;
            bridge.save();
            this.render();
          });
        }
      }
    };

    renderMethodList();

    methodSearch.addEventListener('input', () => renderMethodList(methodSearch.value));

    // Toggle panel on click
    methodTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = methodPanel.hasClass('hidden');
      methodPanel.toggleClass('hidden', !isHidden);
      if (isHidden) {
        methodSearch.value = '';
        renderMethodList();
        methodSearch.focus();
      }
    });

    // Close panel on outside click
    const closePanel = (e: MouseEvent) => {
      if (!methodDropdown.contains(e.target as Node)) {
        methodPanel.addClass('hidden');
        document.removeEventListener('click', closePanel);
      }
    };
    document.addEventListener('click', closePanel);

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

    // ── Effective Speed Display ──────────────────────────
    const effectiveHexes = tracker.getMaxHexesToday();
    const effectiveSection = paceSection.createDiv({ cls: 'hexcrawl-view-effective-speed' });
    effectiveSection.createEl('span', { text: `→ ${hLoc(L, 'effectiveSpeed', { hexes: effectiveHexes })}` });

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

    // ── Party Size ─────────────────────────────────────────
    const rationsSection = container.createDiv({ cls: 'hexcrawl-view-section' });
    rationsSection.createEl('div', { text: hLoc(L, 'partySizeLabel'), cls: 'hexcrawl-view-label' });

    // Ensure rations object exists on state
    if (!hcState.rations) {
      hcState.rations = { foodLbs: 0, waterGallons: 0, partySize: 4, daysWithoutFood: 0, daysWithoutWater: 0 };
    }

    const sizeRow = rationsSection.createDiv({ cls: 'hexcrawl-view-rations-row' });
    sizeRow.createEl('span', { text: `${hLoc(L, 'partySizeLabel')}: ${hcState.rations.partySize}`, cls: 'hexcrawl-view-ration-value' });
    const sizeDec = sizeRow.createEl('button', { text: '−', cls: 'hexcrawl-view-btn small' });
    sizeDec.addEventListener('click', () => {
      if (hcState.rations.partySize > 1) { hcState.rations.partySize -= 1; bridge.save(); this.render(); }
    });
    const sizeInc = sizeRow.createEl('button', { text: '+', cls: 'hexcrawl-view-btn small' });
    sizeInc.addEventListener('click', () => {
      hcState.rations.partySize += 1; bridge.save(); this.render();
    });

    // Starvation/dehydration warnings
    if (hcState.rations.daysWithoutFood >= 3) {
      rationsSection.createEl('div', { text: hLoc(L, 'starvationWarning', { days: hcState.rations.daysWithoutFood }), cls: 'hexcrawl-view-danger' });
    }
    if (hcState.rations.daysWithoutWater >= 1) {
      rationsSection.createEl('div', { text: hLoc(L, 'dehydrationWarning', { days: hcState.rations.daysWithoutWater }), cls: 'hexcrawl-view-danger' });
    }

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

    const resetTravelBtn = actionsSection.createEl('button', {
      text: hLoc(L, 'resetTravel'),
      cls: 'hexcrawl-view-action-btn danger',
    });
    resetTravelBtn.addEventListener('click', () => {
      if (!confirm(hLoc(L, 'resetTravelConfirm'))) return;
      const tr = new HexcrawlTracker(hcState, bridge.config.hexTerrains || []);
      tr.resetTravel();
      bridge.config.hexcrawlState = tr.toJSON();
      bridge.save();
      bridge.redraw();
      this.render();
      new Notice(hLoc(L, 'resetTravelDone'));
    });
  }

  // ── Settings helper ────────────────────────────────────────────────

  private openSettings(bridge: HexcrawlBridge) {
    const config = bridge.config;
    const hcState = config.hexcrawlState || createDefaultHexcrawlState(config.mapId);
    new HexcrawlSettingsModal(
      this.app,
      hcState.enabled,
      hcState.rations?.foodLbs ?? 10,
      hcState.rations?.waterGallons ?? 10,
      hcState.rations?.partySize ?? 4,
      hcState.descriptionLanguage || 'en',
      (result) => {
        if (!config.hexcrawlState) {
          config.hexcrawlState = createDefaultHexcrawlState(config.mapId);
        }
        config.hexcrawlState.enabled = result.enabled;
        config.hexcrawlState.rations.foodLbs = result.initialFood;
        config.hexcrawlState.rations.waterGallons = result.initialWater;
        config.hexcrawlState.rations.partySize = result.partySize;
        config.hexcrawlState.descriptionLanguage = result.descriptionLanguage;
        bridge.save();
        this.render();
        new Notice(result.enabled ? hLoc(this.lang, 'hexcrawlEnabled') : hLoc(this.lang, 'hexcrawlDisabled'));
      },
    ).open();
  }
}
