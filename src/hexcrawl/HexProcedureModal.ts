/**
 * Hex Procedure Modal
 * 
 * Step-by-step wizard that guides the GM through the per-hex exploration
 * procedure when entering a new hex during hexcrawl travel.
 * 
 * Steps:
 *   1. Terrain & Description — shows terrain info, GM adds narration
 *   2. Weather — roll or select weather, shows mechanical effects
 *   3. Exploration Checks — party skill checks for each assigned role
 *   4. Encounter Check — roll for random encounter
 *   5. Discovery — show PoI or roll random discovery
 *   6. Summary — recap of everything that happened
 */

import { App, Modal, Setting, Notice, TextAreaComponent } from 'obsidian';
import { HexcrawlTracker } from './HexcrawlTracker';
import {
  TerrainType,
  WeatherType,
  ExplorationRoleId,
  ExplorationCheckResult,
  TravelLogEntry,
  DescriptionLanguage,
  getTerrainDefinition,
  getClimateDefinition,
  TERRAIN_DEFINITIONS,
  EXPLORATION_ROLES,
  WEATHER_TABLE,
  HEXCRAWL_PACES,
  TRAVEL_METHODS,
} from './types';
import {
  getClimateTerrainDescription,
  getAllClimateTerrainDescriptions,
} from './ClimateDescriptions';
import { hLoc } from './HexcrawlLocale';

// ─── Types ────────────────────────────────────────────────────────────────

export interface HexProcedureResult {
  /** Whether the modal was completed (not cancelled) */
  completed: boolean;
  /** The built log entry */
  logEntry?: Omit<TravelLogEntry, 'timestamp'>;
}

type ProcedureStep = 'terrain' | 'weather' | 'checks' | 'encounter' | 'discovery' | 'summary';

const STEP_ORDER: ProcedureStep[] = ['terrain', 'weather', 'checks', 'encounter', 'discovery', 'summary'];

/** Step label keys map to HexcrawlLocale keys so they can be localised. */
const STEP_LABEL_KEYS: Record<ProcedureStep, string> = {
  terrain: 'stepTerrain',
  weather: 'stepWeather',
  checks: 'stepChecks',
  encounter: 'stepEncounter',
  discovery: 'stepDiscovery',
  summary: 'stepSummary',
};

// ─── Modal ────────────────────────────────────────────────────────────────

export class HexProcedureModal extends Modal {
  private tracker: HexcrawlTracker;
  private targetCol: number;
  private targetRow: number;
  private resolve: (result: HexProcedureResult) => void;
  private customTerrainDescriptions: Record<string, string[]>;

  // Step state
  private currentStep: ProcedureStep = 'terrain';
  private bodyEl!: HTMLElement;
  private stepIndicatorEl!: HTMLElement;

  // Collected data across steps
  private terrainNotes: string = '';
  private checkResults: ExplorationCheckResult[] = [];
  private encounterRolled: boolean = false;
  private encounterTriggered: boolean = false;
  private encounterDetails: string = '';
  private discoveryFound: boolean = false;
  private discoveryDetails: string = '';
  private hexNotes: string = '';
  
  // RAW D&D 5e mechanics
  private navigationFailed: boolean = false;
  private foodForaged: number = 0;
  private foragerWisMod: number = 0;

  constructor(
    app: App,
    tracker: HexcrawlTracker,
    targetCol: number,
    targetRow: number,
    resolve: (result: HexProcedureResult) => void,
    customTerrainDescriptions?: Record<string, string[]>,
  ) {
    super(app);
    this.tracker = tracker;
    this.targetCol = targetCol;
    this.targetRow = targetRow;
    this.resolve = resolve;
    this.customTerrainDescriptions = customTerrainDescriptions || {};
  }

  /** Shorthand for the active description language. */
  private get lang(): DescriptionLanguage {
    return this.tracker.state.descriptionLanguage || 'en';
  }

  onOpen() {
    const { contentEl } = this;
    const L = this.lang;
    contentEl.empty();
    contentEl.addClass('hexcrawl-procedure-modal');
    this.modalEl.addClass('hexcrawl-procedure-modal-container');

    // Header
    const terrain = getTerrainDefinition(this.tracker.getTerrainAt(this.targetCol, this.targetRow));
    contentEl.createEl('h2', {
      text: hLoc(L, 'enteringHex', { col: this.targetCol, row: this.targetRow, icon: terrain.icon, name: hLoc(L, `terrain.${terrain.id}`) }),
    });

    // Day / movement info bar
    const infoBar = contentEl.createDiv({ cls: 'hexcrawl-procedure-info' });
    const pace = HEXCRAWL_PACES.find(p => p.id === this.tracker.state.pace) ?? HEXCRAWL_PACES[1]!;
    const method = TRAVEL_METHODS.find(m => m.id === this.tracker.state.travelMethod) ?? TRAVEL_METHODS[0]!;
    const cost = this.tracker.getMovementCostForHex(this.targetCol, this.targetRow);
    const remaining = this.tracker.getRemainingMovement();
    infoBar.createEl('span', { text: hLoc(L, 'dayN', { n: this.tracker.state.currentDay }) });
    infoBar.createEl('span', { text: `${method!.icon} ${method!.name}` });
    infoBar.createEl('span', { text: hLoc(L, `pace.${pace!.id}`) });
    infoBar.createEl('span', { text: hLoc(L, 'moveCost', { cost }) });
    infoBar.createEl('span', { text: hLoc(L, 'remaining', { remaining, max: this.tracker.getMaxHexesToday() }) });

    // Step indicator (progress dots)
    this.stepIndicatorEl = contentEl.createDiv({ cls: 'hexcrawl-step-indicator' });
    this.renderStepIndicator();

    // Body container for step content
    this.bodyEl = contentEl.createDiv({ cls: 'hexcrawl-procedure-body' });
    this.renderCurrentStep();

    // Navigation buttons
    const navBar = contentEl.createDiv({ cls: 'hexcrawl-procedure-nav' });

    const backBtn = navBar.createEl('button', { text: hLoc(L, 'back'), cls: 'hexcrawl-nav-btn' });
    backBtn.addEventListener('click', () => this.prevStep());

    const cancelBtn = navBar.createEl('button', { text: hLoc(L, 'cancel'), cls: 'hexcrawl-nav-btn hexcrawl-nav-cancel' });
    cancelBtn.addEventListener('click', () => {
      this.resolve({ completed: false });
      this.close();
    });

    const nextBtn = navBar.createEl('button', { text: hLoc(L, 'next'), cls: 'hexcrawl-nav-btn hexcrawl-nav-next' });
    nextBtn.addEventListener('click', () => this.nextStep());
  }

  onClose() {
    // If not explicitly resolved, treat as cancel
    this.resolve({ completed: false });
    const { contentEl } = this;
    contentEl.empty();
  }

  // ── Step Navigation ──────────────────────────────────────────────────

  private nextStep() {
    const idx = STEP_ORDER.indexOf(this.currentStep);
    if (idx < STEP_ORDER.length - 1) {
      this.currentStep = STEP_ORDER[idx + 1]!;
      this.renderStepIndicator();
      this.renderCurrentStep();
    } else {
      // Final step — complete the procedure
      this.completeProcedure();
    }
  }

  private prevStep() {
    const idx = STEP_ORDER.indexOf(this.currentStep);
    if (idx > 0) {
      this.currentStep = STEP_ORDER[idx - 1]!;
      this.renderStepIndicator();
      this.renderCurrentStep();
    }
  }

  // ── Step Indicator ───────────────────────────────────────────────────

  private renderStepIndicator() {
    this.stepIndicatorEl.empty();
    const currentIdx = STEP_ORDER.indexOf(this.currentStep);
    STEP_ORDER.forEach((step, i) => {
      const dot = this.stepIndicatorEl.createEl('button', {
        cls: `hexcrawl-step-dot ${i === currentIdx ? 'active' : ''} ${i < currentIdx ? 'completed' : ''}`,
        attr: { 'aria-label': hLoc(this.lang, STEP_LABEL_KEYS[step]) },
      });
      dot.createEl('span', { text: hLoc(this.lang, STEP_LABEL_KEYS[step]), cls: 'hexcrawl-step-dot-label' });
      dot.addEventListener('click', () => {
        // Allow clicking visited steps
        if (i <= currentIdx) {
          this.currentStep = STEP_ORDER[i]!;
          this.renderStepIndicator();
          this.renderCurrentStep();
        }
      });
    });
  }

  // ── Step Rendering ───────────────────────────────────────────────────

  private renderCurrentStep() {
    this.bodyEl.empty();
    switch (this.currentStep) {
      case 'terrain': this.renderTerrainStep(); break;
      case 'weather': this.renderWeatherStep(); break;
      case 'checks': this.renderChecksStep(); break;
      case 'encounter': this.renderEncounterStep(); break;
      case 'discovery': this.renderDiscoveryStep(); break;
      case 'summary': this.renderSummaryStep(); break;
    }
  }

  // ─── Step 1: Terrain ─────────────────────────────────────────────────

  private renderTerrainStep() {
    const L = this.lang;
    const terrainType = this.tracker.getTerrainAt(this.targetCol, this.targetRow);
    const terrain = getTerrainDefinition(terrainType);
    const climate = this.tracker.getClimateAt(this.targetCol, this.targetRow);
    const climateDef = climate ? getClimateDefinition(climate) : null;

    const card = this.bodyEl.createDiv({ cls: 'hexcrawl-terrain-card' });
    card.createEl('div', { text: `${terrain.icon}`, cls: 'hexcrawl-terrain-icon' });

    // Show climate badge next to terrain name if set
    const nameRow = card.createDiv({ cls: 'hexcrawl-terrain-name-row' });
    nameRow.createEl('h3', { text: hLoc(L, `terrain.${terrain.id}`) });
    if (climateDef) {
      nameRow.createEl('span', {
        text: `${climateDef.icon} ${hLoc(L, `climate.${climateDef.id}`)}`,
        cls: 'hexcrawl-climate-badge',
      });
    }
    card.createEl('p', { text: hLoc(L, `terrainDesc.${terrain.id}`), cls: 'hexcrawl-terrain-desc' });

    // Stats grid
    const stats = card.createDiv({ cls: 'hexcrawl-terrain-stats' });
    stats.createEl('div', { text: hLoc(L, 'travelSpeed', { val: terrain.travelModifier === 1.0 ? hLoc(L, 'travelSpeedNormal') : `×${terrain.travelModifier}` }) });
    stats.createEl('div', { text: hLoc(L, 'difficultTerrain', { val: terrain.difficultTerrain ? hLoc(L, 'yes') : hLoc(L, 'no') }) });
    stats.createEl('div', { text: hLoc(L, 'forageDC', { dc: terrain.forageDC }) });
    stats.createEl('div', { text: hLoc(L, 'navigationDC', { dc: terrain.navigationDC }) });

    // ── Read-Aloud Description ─────────────────────────────────────────
    this.bodyEl.createEl('h4', { text: hLoc(L, 'readAloudDesc') });

    // Priority: per-tile custom → per-type custom → climate library
    const tileDesc = this.tracker.getCustomDescriptionAt(this.targetCol, this.targetRow);
    const customDescs = this.customTerrainDescriptions[terrainType] || [];
    const lang: DescriptionLanguage = this.tracker.state.descriptionLanguage || 'en';
    const climateDescs = getAllClimateTerrainDescriptions(climate, terrainType, lang);
    const allVariants = customDescs.length > 0 ? customDescs : climateDescs;

    if (!this.terrainNotes) {
      if (tileDesc) {
        // Per-tile description is highest priority
        this.terrainNotes = tileDesc;
      } else if (allVariants.length > 0) {
        // Pick a random variant and pre-fill
        this.terrainNotes = allVariants[Math.floor(Math.random() * allVariants.length)]!;
      }
    }

    // Show a badge if per-tile description is active
    if (tileDesc) {
      this.bodyEl.createEl('div', {
        text: hLoc(L, 'usingTileDesc'),
        cls: 'hexcrawl-tile-desc-badge',
      });
    }

    // Show the textarea with the auto-populated (or custom) text
    const ta = new TextAreaComponent(this.bodyEl);
    ta.setPlaceholder(
      climate
        ? hLoc(L, 'placeholderClimate', { climate: hLoc(L, `climate.${climateDef?.id ?? 'temperate'}`), terrain: hLoc(L, `terrain.${terrain.id}`).toLowerCase() })
        : hLoc(L, 'placeholderNoClimate'),
    );
    ta.setValue(this.terrainNotes);
    ta.inputEl.rows = 5;
    ta.inputEl.classList.add('hexcrawl-textarea');
    ta.onChange(v => this.terrainNotes = v);

    // Re-roll button (when multiple variants exist)
    if (allVariants.length > 1) {
      const rerollRow = this.bodyEl.createDiv({ cls: 'hexcrawl-description-actions' });
      const rerollBtn = rerollRow.createEl('button', {
        text: hLoc(L, 'rerollDesc'),
        cls: 'hexcrawl-action-btn',
      });
      rerollBtn.addEventListener('click', () => {
        const others = allVariants.filter(v => v !== this.terrainNotes);
        const pool = others.length > 0 ? others : allVariants;
        this.terrainNotes = pool[Math.floor(Math.random() * pool.length)]!;
        ta.setValue(this.terrainNotes);
      });
    }
  }

  // ─── Step 2: Weather ─────────────────────────────────────────────────

  private renderWeatherStep() {
    const L = this.lang;
    const currentWeather = WEATHER_TABLE.find(w => w.type === this.tracker.state.currentWeather) ?? WEATHER_TABLE[0]!;

    this.bodyEl.createEl('h3', { text: hLoc(L, 'currentWeather', { icon: currentWeather!.icon, name: hLoc(L, `weather.${currentWeather!.type}`) }) });

    // Weather info card
    const card = this.bodyEl.createDiv({ cls: 'hexcrawl-weather-card' });
    card.createEl('div', { text: hLoc(L, 'severity', { val: hLoc(L, `severity.${currentWeather!.severity}`) }), cls: 'hexcrawl-weather-stat' });
    card.createEl('div', { text: hLoc(L, 'travelModifier', { val: currentWeather!.travelModifier }), cls: 'hexcrawl-weather-stat' });
    card.createEl('div', { text: hLoc(L, 'visibility', { val: hLoc(L, `weatherVis.${currentWeather!.type}`) }), cls: 'hexcrawl-weather-stat' });
    card.createEl('div', { text: hLoc(L, 'effects', { val: hLoc(L, `weatherFx.${currentWeather!.type}`) }), cls: 'hexcrawl-weather-stat hexcrawl-weather-effects' });

    // Roll weather button
    const rollRow = this.bodyEl.createDiv({ cls: 'hexcrawl-weather-actions' });
    const rollBtn = rollRow.createEl('button', { text: hLoc(L, 'rollNewWeather'), cls: 'hexcrawl-action-btn' });
    rollBtn.addEventListener('click', () => {
      this.tracker.rollWeather();
      this.renderCurrentStep(); // Re-render
      const rolledW = WEATHER_TABLE.find(w => w.type === this.tracker.state.currentWeather);
      new Notice(hLoc(L, 'weatherRolled', { name: rolledW ? hLoc(L, `weather.${rolledW.type}`) : '?' }));
    });

    // Manual weather selector
    new Setting(this.bodyEl)
      .setName(hLoc(L, 'setWeatherManually'))
      .addDropdown(dd => {
        WEATHER_TABLE.forEach(w => {
          dd.addOption(w.type, `${w.icon} ${hLoc(L, `weather.${w.type}`)}`);
        });
        dd.setValue(this.tracker.state.currentWeather);
        dd.onChange(v => {
          this.tracker.setWeather(v as WeatherType);
          this.renderCurrentStep();
        });
      });
  }

  // ─── Step 3: Exploration Checks ──────────────────────────────────────

  private renderChecksStep() {
    const L = this.lang;
    const terrain = getTerrainDefinition(this.tracker.getTerrainAt(this.targetCol, this.targetRow));
    const weather = WEATHER_TABLE.find(w => w.type === this.tracker.state.currentWeather) ?? WEATHER_TABLE[0]!;

    this.bodyEl.createEl('h3', { text: hLoc(L, 'partyExplChecks') });
    this.bodyEl.createEl('p', {
      text: hLoc(L, 'checksHelpText'),
      cls: 'hexcrawl-step-desc',
    });

    const checksContainer = this.bodyEl.createDiv({ cls: 'hexcrawl-checks-grid' });

    for (const role of EXPLORATION_ROLES) {
      const assignedPlayer = this.tracker.state.roleAssignments[role.id] || '';
      const existingResult = this.checkResults.find(r => r.roleId === role.id);

      const row = checksContainer.createDiv({ cls: 'hexcrawl-check-row' });

      // Role info
      const roleInfo = row.createDiv({ cls: 'hexcrawl-check-role' });
      roleInfo.createEl('span', { text: `${role.icon} ${hLoc(L, `role.${role.id}`)}`, cls: 'hexcrawl-check-name' });
      roleInfo.createEl('span', { text: `${hLoc(L, `roleSkill.${role.id}`)} (${hLoc(L, `roleAbility.${role.id}`)})`, cls: 'hexcrawl-check-skill' });

      // Calculate DC based on terrain + weather adjustments
      let baseDC = 10;
      if (role.id === 'navigator') baseDC = terrain.navigationDC || 10;
      if (role.id === 'forager') baseDC = terrain.forageDC || 15;

      // Weather modifiers
      if (weather!.type === 'fog' && role.id === 'navigator') baseDC += 5;
      if (weather!.severity === 'severe' || weather!.severity === 'extreme') baseDC += 2;

      // DC display
      row.createEl('span', { text: hLoc(L, 'dcN', { dc: baseDC }), cls: 'hexcrawl-check-dc' });

      // Player name input
      const playerInput = row.createEl('input', {
        type: 'text',
        placeholder: assignedPlayer || hLoc(L, 'playerPlaceholder'),
        value: assignedPlayer,
        cls: 'hexcrawl-check-player',
      });
      playerInput.addEventListener('change', (e) => {
        const name = (e.target as HTMLInputElement).value;
        this.tracker.assignRole(role.id, name);
      });

      // Pass/Fail toggle
      const passed = existingResult?.passed ?? true;
      const toggleBtn = row.createEl('button', {
        text: passed ? hLoc(L, 'pass') : hLoc(L, 'fail'),
        cls: `hexcrawl-check-toggle ${passed ? 'pass' : 'fail'}`,
      });
      toggleBtn.addEventListener('click', () => {
        const newPassed = !passed;
        // Update or create result
        const idx = this.checkResults.findIndex(r => r.roleId === role.id);
        const result: ExplorationCheckResult = {
          roleId: role.id as ExplorationRoleId,
          playerName: playerInput.value || assignedPlayer,
          dc: baseDC,
          passed: newPassed,
        };
        if (idx >= 0) {
          this.checkResults[idx] = result;
        } else {
          this.checkResults.push(result);
        }
        
        // Update RAW mechanics state
        if (role.id === 'navigator') {
          this.navigationFailed = !newPassed;
        }
        
        // Re-render the checks step
        this.renderCurrentStep();
      });
      
      // RAW consequences for specific roles
      if (role.id === 'navigator') {
        const consequenceDiv = row.createDiv({ cls: 'hexcrawl-check-consequence' });
        if (passed) {
          consequenceDiv.createEl('span', { text: hLoc(L, 'navSuccess'), cls: 'hexcrawl-consequence-success' });
        } else {
          consequenceDiv.createEl('span', { text: hLoc(L, 'navFail'), cls: 'hexcrawl-consequence-fail' });
        }
      }
      
      if (role.id === 'forager') {
        const forageDiv = row.createDiv({ cls: 'hexcrawl-check-forage' });
        if (passed) {
          const forageControls = forageDiv.createDiv({ cls: 'hexcrawl-forage-controls' });
          
          // WIS modifier input
          forageControls.createEl('label', { text: hLoc(L, 'wisMod') });
          const wisInput = forageControls.createEl('input', {
            type: 'number',
            value: String(this.foragerWisMod),
            cls: 'hexcrawl-wis-input',
          });
          wisInput.addEventListener('change', (e) => {
            this.foragerWisMod = parseInt((e.target as HTMLInputElement).value) || 0;
          });
          
          // Roll button
          const rollBtn = forageControls.createEl('button', {
            text: hLoc(L, 'forageRoll'),
            cls: 'hexcrawl-action-btn',
          });
          const resultSpan = forageControls.createEl('span', { cls: 'hexcrawl-forage-result' });
          if (this.foodForaged > 0) {
            resultSpan.textContent = hLoc(L, 'foodFound', { lbs: this.foodForaged });
          }
          
          rollBtn.addEventListener('click', () => {
            const roll = Math.floor(Math.random() * 6) + 1;
            this.foodForaged = roll + this.foragerWisMod;
            resultSpan.textContent = hLoc(L, 'foodFound', { lbs: this.foodForaged });
          });
        } else {
          forageDiv.createEl('span', { text: hLoc(L, 'noFoodFound'), cls: 'hexcrawl-consequence-fail' });
          this.foodForaged = 0;
        }
      }
    }

    // RAW Consequences Summary
    const passCount = this.checkResults.filter(r => r.passed).length;
    const failCount = this.checkResults.filter(r => !r.passed).length;
    const summaryBox = this.bodyEl.createDiv({ cls: 'hexcrawl-checks-summary' });
    summaryBox.createEl('h4', { text: hLoc(L, 'checksConsequences') });
    summaryBox.createEl('span', { text: hLoc(L, 'passedN', { n: passCount }) });
    summaryBox.createEl('span', { text: hLoc(L, 'failedN', { n: failCount }) });
    
    // Show navigation status
    const navResult = this.checkResults.find(r => r.roleId === 'navigator');
    if (navResult) {
      const navStatus = navResult.passed ? hLoc(L, 'navSuccess') : hLoc(L, 'navFail');
      summaryBox.createEl('div', { text: navStatus, cls: navResult.passed ? 'hexcrawl-consequence-success' : 'hexcrawl-consequence-fail' });
    }
    
    // Show foraging status
    const forageResult = this.checkResults.find(r => r.roleId === 'forager');
    if (forageResult) {
      if (forageResult.passed && this.foodForaged > 0) {
        summaryBox.createEl('div', { text: hLoc(L, 'foodFound', { lbs: this.foodForaged }), cls: 'hexcrawl-consequence-success' });
      } else if (!forageResult.passed) {
        summaryBox.createEl('div', { text: hLoc(L, 'noFoodFound'), cls: 'hexcrawl-consequence-fail' });
      }
    }
  }

  // ─── Step 4: Encounter ───────────────────────────────────────────────

  private renderEncounterStep() {
    const L = this.lang;
    this.bodyEl.createEl('h3', { text: hLoc(L, 'randomEncounterCheck') });

    const terrain = getTerrainDefinition(this.tracker.getTerrainAt(this.targetCol, this.targetRow));

    // Progressive encounter DC: base DC - (2 × hexes since last encounter), min 2
    const hexesSince = this.tracker.state.hexesSinceEncounter ?? 0;
    const effectiveDC = Math.max(2, terrain.encounterDC - (hexesSince * 2));

    this.bodyEl.createEl('p', {
      text: hLoc(L, 'encounterHelpText'),
      cls: 'hexcrawl-step-desc',
    });

    // Show DC info
    const dcInfo = this.bodyEl.createDiv({ cls: 'hexcrawl-encounter-dc-info' });
    dcInfo.createEl('span', { text: hLoc(L, 'encounterBaseDC', { dc: terrain.encounterDC }), cls: 'hexcrawl-encounter-dc' });
    dcInfo.createEl('span', { text: hLoc(L, 'hexesSinceEncounter', { n: hexesSince }), cls: 'hexcrawl-encounter-dc' });
    dcInfo.createEl('span', { text: hLoc(L, 'effectiveEncounterDC', { dc: effectiveDC, chance: Math.min(95, (21 - effectiveDC) * 5) }), cls: 'hexcrawl-encounter-dc effective' });

    // Encounter roll
    const rollRow = this.bodyEl.createDiv({ cls: 'hexcrawl-encounter-actions' });

    const rollBtn = rollRow.createEl('button', { text: hLoc(L, 'rollD20'), cls: 'hexcrawl-action-btn' });
    const resultEl = rollRow.createEl('span', { cls: 'hexcrawl-encounter-result' });

    if (this.encounterRolled) {
      resultEl.textContent = this.encounterTriggered
        ? hLoc(L, 'encounterTriggered')
        : hLoc(L, 'noEncounter');
      resultEl.toggleClass('encounter-triggered', this.encounterTriggered);
    }

    rollBtn.addEventListener('click', () => {
      const roll = Math.floor(Math.random() * 20) + 1;
      this.encounterRolled = true;
      this.encounterTriggered = roll >= effectiveDC;
      resultEl.textContent = hLoc(L, 'rolledResult', { roll, result: this.encounterTriggered ? hLoc(L, 'encounterBang') : hLoc(L, 'safe') });
      resultEl.toggleClass('encounter-triggered', this.encounterTriggered);
    });

    // Manual override
    const overrideRow = this.bodyEl.createDiv({ cls: 'hexcrawl-encounter-override' });
    const triggerBtn = overrideRow.createEl('button', {
      text: this.encounterTriggered ? hLoc(L, 'encounterActive') : hLoc(L, 'forceEncounter'),
      cls: `hexcrawl-action-btn ${this.encounterTriggered ? 'active' : 'secondary'}`,
    });
    triggerBtn.addEventListener('click', () => {
      this.encounterRolled = true;
      this.encounterTriggered = !this.encounterTriggered;
      this.renderCurrentStep();
    });

    // Encounter details
    if (this.encounterTriggered) {
      this.bodyEl.createEl('h4', { text: hLoc(L, 'encounterDetails') });
      const ta = new TextAreaComponent(this.bodyEl);
      ta.setPlaceholder(hLoc(L, 'encounterPlaceholder'));
      ta.setValue(this.encounterDetails);
      ta.inputEl.rows = 4;
      ta.inputEl.classList.add('hexcrawl-textarea');
      ta.onChange(v => this.encounterDetails = v);
    }
  }

  // ─── Step 5: Discovery ───────────────────────────────────────────────

  private renderDiscoveryStep() {
    const L = this.lang;
    this.bodyEl.createEl('h3', { text: hLoc(L, 'hexDiscovery') });

    this.bodyEl.createEl('p', {
      text: hLoc(L, 'discoveryHelpText'),
      cls: 'hexcrawl-step-desc',
    });

    // Discovery toggle
    const toggleRow = this.bodyEl.createDiv({ cls: 'hexcrawl-discovery-actions' });
    const discoveryBtn = toggleRow.createEl('button', {
      text: this.discoveryFound ? hLoc(L, 'discoveryFound') : hLoc(L, 'noDiscovery'),
      cls: `hexcrawl-action-btn ${this.discoveryFound ? 'active' : 'secondary'}`,
    });
    discoveryBtn.addEventListener('click', () => {
      this.discoveryFound = !this.discoveryFound;
      this.renderCurrentStep();
    });

    // Roll random discovery
    const rollBtn = toggleRow.createEl('button', { text: hLoc(L, 'rollDiscovery'), cls: 'hexcrawl-action-btn secondary' });
    rollBtn.addEventListener('click', () => {
      const discoveries = [
        hLoc(L, 'disc1'), hLoc(L, 'disc2'), hLoc(L, 'disc3'), hLoc(L, 'disc4'),
        hLoc(L, 'disc5'), hLoc(L, 'disc6'), hLoc(L, 'disc7'), hLoc(L, 'disc8'),
        hLoc(L, 'disc9'), hLoc(L, 'disc10'), hLoc(L, 'disc11'), hLoc(L, 'disc12'),
      ];
      this.discoveryFound = true;
      this.discoveryDetails = discoveries[Math.floor(Math.random() * discoveries.length)] ?? hLoc(L, 'discNone');
      this.renderCurrentStep();
    });

    // Discovery details
    if (this.discoveryFound) {
      this.bodyEl.createEl('h4', { text: hLoc(L, 'discoveryDetails') });
      const ta = new TextAreaComponent(this.bodyEl);
      ta.setPlaceholder(hLoc(L, 'discoveryPlaceholder'));
      ta.setValue(this.discoveryDetails);
      ta.inputEl.rows = 3;
      ta.inputEl.classList.add('hexcrawl-textarea');
      ta.onChange(v => this.discoveryDetails = v);
    }
  }

  // ─── Step 4: Summary ─────────────────────────────────────────────────

  private renderSummaryStep() {
    const L = this.lang;
    const terrain = getTerrainDefinition(this.tracker.getTerrainAt(this.targetCol, this.targetRow));
    const weather = WEATHER_TABLE.find(w => w.type === this.tracker.state.currentWeather) ?? WEATHER_TABLE[0]!;

    this.bodyEl.createEl('h3', { text: hLoc(L, 'hexSummary') });

    const summary = this.bodyEl.createDiv({ cls: 'hexcrawl-summary' });

    // Terrain & Weather
    summary.createEl('div', { text: hLoc(L, 'terrainWeatherRow', { tIcon: terrain.icon, tName: hLoc(L, `terrain.${terrain.id}`), wIcon: weather!.icon, wName: hLoc(L, `weather.${weather!.type}`) }), cls: 'hexcrawl-summary-row' });
    summary.createEl('div', { text: hLoc(L, 'dayHex', { day: this.tracker.state.currentDay, hex: this.tracker.state.hexesMovedToday + 1 }), cls: 'hexcrawl-summary-row' });

    // Checks
    if (this.checkResults.length > 0) {
      const checksDiv = summary.createDiv({ cls: 'hexcrawl-summary-section' });
      checksDiv.createEl('strong', { text: hLoc(L, 'explorationChecks') });
      for (const r of this.checkResults) {
        const role = EXPLORATION_ROLES.find(rl => rl.id === r.roleId);
        const resultText = r.passed ? hLoc(L, 'pass') : hLoc(L, 'fail');
        const line = r.playerName
          ? hLoc(L, 'checkResultPlayer', { icon: role?.icon || '?', name: hLoc(L, `role.${r.roleId}`), result: resultText, dc: r.dc, player: r.playerName })
          : hLoc(L, 'checkResultLine', { icon: role?.icon || '?', name: hLoc(L, `role.${r.roleId}`), result: resultText, dc: r.dc });
        checksDiv.createEl('div', { text: line });
      }
    }

    // RAW Navigation Result
    const navResult = this.checkResults.find(r => r.roleId === 'navigator');
    if (navResult) {
      const navDiv = summary.createDiv({ cls: 'hexcrawl-summary-section' });
      navDiv.createEl('strong', { text: hLoc(L, 'navigation') });
      const navText = this.navigationFailed ? hLoc(L, 'navFail') : hLoc(L, 'navSuccess');
      navDiv.createEl('div', { text: navText, cls: this.navigationFailed ? 'hexcrawl-consequence-fail' : 'hexcrawl-consequence-success' });
    }

    // RAW Foraging Result
    const forageResult = this.checkResults.find(r => r.roleId === 'forager');
    if (forageResult) {
      const forageDiv = summary.createDiv({ cls: 'hexcrawl-summary-section' });
      forageDiv.createEl('strong', { text: hLoc(L, 'foraging') });
      if (forageResult.passed && this.foodForaged > 0) {
        forageDiv.createEl('div', { text: hLoc(L, 'foodFound', { lbs: this.foodForaged }), cls: 'hexcrawl-consequence-success' });
      } else {
        forageDiv.createEl('div', { text: hLoc(L, 'noFoodFound'), cls: 'hexcrawl-consequence-fail' });
      }
    }

    // Encounter
    if (this.encounterRolled) {
      summary.createEl('div', {
        text: this.encounterTriggered
          ? hLoc(L, 'encounterYes', { details: this.encounterDetails || hLoc(L, 'encounterYesFallback') })
          : hLoc(L, 'noEncounterSummary'),
        cls: 'hexcrawl-summary-row',
      });
    }

    // Discovery
    if (this.discoveryFound) {
      summary.createEl('div', {
        text: hLoc(L, 'discoveryLine', { details: this.discoveryDetails || hLoc(L, 'discoveryYesFallback') }),
        cls: 'hexcrawl-summary-row',
      });
    }

    // Rations Status
    const rationsDiv = summary.createDiv({ cls: 'hexcrawl-summary-section' });
    rationsDiv.createEl('strong', { text: hLoc(L, 'rationsStatus') });
    const currentFood = this.tracker.state.rations?.foodLbs ?? 0;
    const currentWater = this.tracker.state.rations?.waterGallons ?? 0;
    const projectedFood = currentFood + this.foodForaged;
    rationsDiv.createEl('div', { text: hLoc(L, 'foodRations', { current: projectedFood }) });
    rationsDiv.createEl('div', { text: hLoc(L, 'waterRations', { current: currentWater }) });

    // Exhaustion warnings
    const daysWithoutFood = this.tracker.state.rations?.daysWithoutFood ?? 0;
    const daysWithoutWater = this.tracker.state.rations?.daysWithoutWater ?? 0;
    if (daysWithoutFood >= 3) {
      summary.createEl('div', {
        text: hLoc(L, 'starvationWarning', { days: daysWithoutFood }),
        cls: 'hexcrawl-meter-critical',
      });
    }
    if (daysWithoutWater >= 1) {
      summary.createEl('div', {
        text: hLoc(L, 'dehydrationWarning', { days: daysWithoutWater }),
        cls: 'hexcrawl-meter-critical',
      });
    }

    // GM notes
    this.bodyEl.createEl('h4', { text: hLoc(L, 'notesHeading') });
    const ta = new TextAreaComponent(this.bodyEl);
    ta.setPlaceholder(hLoc(L, 'notesPlaceholder'));
    ta.setValue(this.hexNotes);
    ta.inputEl.rows = 3;
    ta.inputEl.classList.add('hexcrawl-textarea');
    ta.onChange(v => this.hexNotes = v);

    // Complete button
    const completeBtn = this.bodyEl.createEl('button', {
      text: hLoc(L, 'completeEnterHex'),
      cls: 'hexcrawl-complete-btn',
    });
    completeBtn.addEventListener('click', () => this.completeProcedure());
  }

  // ── Complete Procedure ───────────────────────────────────────────────

  private completeProcedure() {
    const terrain = this.tracker.getTerrainAt(this.targetCol, this.targetRow);

    // Apply RAW foraging mechanics - add food to rations
    if (this.foodForaged > 0) {
      this.tracker.state.rations.foodLbs += this.foodForaged;
    }

    // Update progressive encounter counter
    if (this.encounterTriggered) {
      this.tracker.state.hexesSinceEncounter = 0;
    } else {
      this.tracker.state.hexesSinceEncounter = (this.tracker.state.hexesSinceEncounter ?? 0) + 1;
    }

    // Move party to this hex
    this.tracker.moveToHex(this.targetCol, this.targetRow);

    // Build log entry
    const logEntry: Omit<TravelLogEntry, 'timestamp'> = {
      day: this.tracker.state.currentDay,
      hexIndex: this.tracker.state.hexesMovedToday,
      col: this.targetCol,
      row: this.targetRow,
      terrain,
      weather: this.tracker.state.currentWeather,
      checks: this.checkResults,
      encounterRolled: this.encounterRolled,
      encounterTriggered: this.encounterTriggered,
      encounterDetails: this.encounterDetails || undefined,
      discoveryFound: this.discoveryFound,
      discoveryDetails: this.discoveryDetails || undefined,
      foodForaged: this.foodForaged,
      navigationFailed: this.navigationFailed ? true : undefined,
      notes: [this.terrainNotes, this.hexNotes].filter(Boolean).join('\n\n'),
    };

    // Add to log
    this.tracker.addLogEntry(logEntry);

    // Resolve and close
    this.resolve({ completed: true, logEntry });
    this.close();
  }
}

/**
 * Open the hex procedure modal as a Promise.
 */
export function openHexProcedureModal(
  app: App,
  tracker: HexcrawlTracker,
  targetCol: number,
  targetRow: number,
  customTerrainDescriptions?: Record<string, string[]>,
): Promise<HexProcedureResult> {
  return new Promise((resolve) => {
    const modal = new HexProcedureModal(app, tracker, targetCol, targetRow, resolve, customTerrainDescriptions);
    modal.open();
  });
}
