/**
 * Hexcrawl Localisation (i18n)
 *
 * All user-facing strings in the hexcrawl wilderness travel system,
 * with English (en) and German (de) translations.
 *
 * Usage:
 *   import { hLoc } from './HexcrawlLocale';
 *   const lang = tracker.state.descriptionLanguage || 'en';
 *   hLoc(lang, 'stepTerrain')          // → '🗺️ Gelände'
 *   hLoc(lang, 'dayN', { n: 3 })       // → 'Tag 3'
 */

import type { DescriptionLanguage } from './types';

// ─── Locale Map Type ──────────────────────────────────────────────────

type LocaleMap = Record<string, string>;

// ─── English ──────────────────────────────────────────────────────────

const EN: LocaleMap = {
  // ── Step labels ────────────────────────────────────────
  stepTerrain:        '🗺️ Terrain',
  stepWeather:        '🌤️ Weather',
  stepChecks:         '🎲 Exploration Checks',
  stepEncounter:      '⚔️ Encounter',
  stepDiscovery:      '🔍 Discovery',
  stepSurvival:       '❤️ Survival',
  stepSummary:        '📋 Summary',

  // ── Procedure modal header / info bar ──────────────────
  enteringHex:        'Entering Hex ({col}, {row}) — {icon} {name}',
  dayN:               'Day {n}',
  moveCost:           'Move Cost: {cost}',
  remaining:          'Remaining: {remaining}/{max}',

  // ── Navigation buttons ─────────────────────────────────
  back:               '← Back',
  cancel:             'Cancel',
  next:               'Next →',

  // ── Step 1: Terrain ────────────────────────────────────
  travelSpeed:        'Travel Speed: {val}',
  travelSpeedNormal:  'Normal',
  difficultTerrain:   'Difficult Terrain: {val}',
  yes:                'Yes',
  no:                 'No',
  forageDC:           'Forage DC: {dc}',
  navigationDC:       'Navigation DC: {dc}',
  readAloudDesc:      '📜 Read-Aloud Description',
  usingTileDesc:      '📌 Using tile-specific description',
  placeholderClimate: 'Describe what the party sees in this {climate} {terrain} hex…',
  placeholderNoClimate: 'Set a climate zone for this hex to auto-generate read-aloud text, or type your own below…',
  rerollDesc:         '🎲 Re-roll Description',

  // ── Step 2: Weather ────────────────────────────────────
  currentWeather:     'Current Weather: {icon} {name}',
  severity:           'Severity: {val}',
  travelModifier:     'Travel Modifier: ×{val}',
  visibility:         'Visibility: {val}',
  effects:            'Effects: {val}',
  rollNewWeather:     '🎲 Roll New Weather',
  weatherRolled:      'Weather rolled: {name}',
  setWeatherManually: 'Set Weather Manually',

  // ── Step 3: Exploration Checks ─────────────────────────
  partyExplChecks:    'Party Exploration Checks',
  checksHelpText:     'Each player takes an exploration role and makes a skill check. Toggle passed/failed and the survival meter will adjust automatically.',
  dcN:                'DC {dc}',
  playerPlaceholder:  'Player',
  pass:               '✅ Pass',
  fail:               '❌ Fail',
  passedN:            '✅ {n} passed',
  failedN:            '❌ {n} failed',
  survivalMeterPenalty: 'Survival Meter: −{n}',

  // ── Step 4: Encounter ──────────────────────────────────
  randomEncounterCheck:  'Random Encounter Check',
  encounterHelpText:     'Roll a d20. An encounter occurs on an 18+ (adjust based on terrain danger).',
  rollD20:               '🎲 Roll d20',
  encounterTriggered:    '⚔️ Encounter triggered!',
  noEncounter:           '✅ No encounter.',
  rolledResult:          'Rolled: {roll} — {result}',
  encounterBang:         '⚔️ Encounter!',
  safe:                  '✅ Safe',
  encounterActive:       '⚔️ Encounter Active',
  forceEncounter:        'Force Encounter',
  encounterDetails:      'Encounter Details',
  encounterPlaceholder:  'Describe the encounter or paste from your encounter table...',

  // ── Step 5: Discovery ──────────────────────────────────
  hexDiscovery:          'Hex Discovery',
  discoveryHelpText:     'Was anything discovered in this hex? A PoI, landmark, clue, or random discovery.',
  discoveryFound:        '🔍 Discovery Found!',
  noDiscovery:           'No Discovery',
  rollDiscovery:         '🎲 Roll Discovery',
  discoveryDetails:      'Discovery Details',
  discoveryPlaceholder:  'What did the party discover?',

  // Random discoveries
  disc1:  'Abandoned campsite with cold ashes and torn supplies',
  disc2:  'Ancient standing stones inscribed with faded runes',
  disc3:  'A crystal-clear spring with unusually warm water',
  disc4:  'Tracks of a large predator heading the same direction',
  disc5:  'Overgrown ruins of a small watchtower',
  disc6:  'A merchant\'s cart overturned on a barely-visible trail',
  disc7:  'Strange mushroom circle emitting faint phosphorescence',
  disc8:  'Bones of a massive creature, picked completely clean',
  disc9:  'A shrine to a forgotten deity, offerings still fresh',
  disc10: 'Peculiar rock formation that resembles a face in profile',
  disc11: 'Dying campfire with fresh supplies — recently abandoned',
  disc12: 'A hidden cache of supplies, carefully wrapped in oilcloth',
  discNone: 'Nothing of note',

  // ── Step 6: Survival Meter ─────────────────────────────
  survivalMeterUpdate:     'Survival Meter Update',
  failedChecksPenalty:     'Failed checks: −{n}',
  successfulForage:        ' | Successful forage: +1',
  additionalAdjustment:    'Additional adjustment:',
  minus1:                  '−1',
  plus1:                   '+1',
  netChange:               'Net change: {change} → Meter will be {projected}/{max}',
  dangerThresholdWarning:  '⚠️ Survival meter at danger threshold! Consider a survival encounter.',
  meterDepletedWarning:    '💀 Survival meter depleted! Party gains exhaustion.',

  // ── Step 7: Summary ────────────────────────────────────
  hexSummary:           '📋 Hex Summary',
  terrainWeatherRow:    '{tIcon} {tName} | {wIcon} {wName}',
  dayHex:               'Day {day}, Hex {hex}',
  explorationChecks:    'Exploration Checks:',
  checkResultLine:      '{icon} {name}: {result} (DC {dc})',
  checkResultPlayer:    '{icon} {name}: {result} (DC {dc}) — {player}',
  encounterYes:         '⚔️ Encounter: {details}',
  encounterYesFallback: 'Yes',
  noEncounterSummary:   '✅ No encounter',
  discoveryLine:        '🔍 Discovery: {details}',
  discoveryYesFallback: 'Yes',
  survivalMeterSummary: '❤️ Survival Meter: {current} → {projected}/{max} ({change})',
  notesHeading:         '📝 Notes',
  notesPlaceholder:     'Any additional notes for this hex...',
  completeEnterHex:     '✅ Complete & Enter Hex',

  // ── Notices (procedure complete) ───────────────────────
  exhaustionNotice:       '💀 Party gains 1 level of exhaustion! (Level {level})',
  thresholdNotice:        '⚠️ Survival meter at danger threshold! Consider a survival encounter.',

  // ── HexcrawlView ──────────────────────────────────────
  hexcrawlTabTitle:      '🏕️ Hexcrawl',
  noHexMapActive:        'No hex map active',
  openHexMapHint:        'Open a hex-grid map note to connect.',
  trackingDisabled:      'Hexcrawl tracking is disabled',
  enableHexcrawl:        '⚙️ Enable Hexcrawl',
  hexcrawlTravel:        '🏕️ Hexcrawl Travel',
  hexcrawlSettings:      'Hexcrawl Settings',
  movementDisplay:       'Movement: {moved} / {max} hexes',
  travelPace:            'Travel Pace',
  weather:               'Weather',
  travelMod:             'Travel ×{val}',
  rollWeather:           '🎲 Roll Weather',
  weatherNotice:         'Weather: {icon} {name}',
  survivalMeter:         'Survival Meter',
  danger:                ' ⚠️ Danger!',
  resetLabel:            '↻ Reset',
  meterReset:            'Survival meter reset',
  exhaustionLevel:       '⚠️ Exhaustion Level {level}',
  positionDisplay:       '📍 Position: ({col}, {row}) — {icon} {name}',
  explorationRoles:      'Exploration Roles',
  playerNamePlaceholder: 'Player name…',
  travelLog:             'Travel Log',
  logEntry:              'Day {day} — {icon} ({col}, {row})',
  travelToHex:           '🥾 Travel to Hex',
  clickToTravel:         'Click a hex on the map to travel there',
  setStartingHex:        '📌 Set Starting Hex',
  clickToSetStart:       'Click a hex on the map to set the party\'s starting position',
  endDay:                '🌙 End Day',
  newDayNotice:          'Day {day} begins. Safe travels!',
  hexcrawlEnabled:       '🏕️ Hexcrawl travel enabled!',
  hexcrawlDisabled:      'Hexcrawl travel disabled',

  // ── Settings Modal ─────────────────────────────────────
  settingsTitle:         '🏕️ Hexcrawl Settings',
  enableHexcrawlTravel:  'Enable Hexcrawl Travel',
  enableHexcrawlDesc:    'Activate the wilderness travel tracking system for this map',
  survivalMeterMax:      'Survival Meter Maximum',
  survivalMeterMaxDesc:  'Starting value of the survival meter (recommended 6-8)',
  dangerThreshold:       'Danger Threshold',
  dangerThresholdDesc:   'When meter reaches this value, survival encounters trigger',
  descLanguage:          'Description Language',
  descLanguageDesc:      'Language for auto-generated read-aloud terrain descriptions',
  saveSettings:          'Save Settings',

  // ── Hex Description Edit Modal ─────────────────────────
  hexDescTitle:          '📜 Hex ({col}, {row}) — {terrain}',
  hexDescHint:           'Write a custom read-aloud description for this specific tile. This overrides terrain-type and climate descriptions in the procedure modal.',
  hexDescPlaceholder:    'Describe what the party sees when entering this hex…',
  clearBtn:              '🗑️ Clear',
  saveBtn:               '💾 Save',

  // ── Hex Description Settings Modal ─────────────────────
  customTerrainDescs:    '📜 Custom Terrain Descriptions',
  customTerrainDescsHint:'Add custom read-aloud descriptions for each terrain type. These appear in the hex procedure modal and override the auto-generated climate descriptions.',
  saveDescriptions:      '💾 Save Descriptions',
  addBtn:                '+ Add',
  noCustomDescs:         'No custom descriptions — climate auto-descriptions will be used.',
  describePartySees:     'Describe what the party sees…',
  removeDesc:            'Remove this description',

  // ── Toolbar / main.ts ─────────────────────────────────
  toolbarHexcrawl:       '🏕️ Hexcrawl',
  toolTerrainPaint:      'Terrain Paint',
  toolClimatePaint:      'Climate Paint',
  toolSetStartHex:       'Set Starting Hex',
  toolHexDesc:           'Hex Description',
  toolOpenPanel:         'Open Hexcrawl Panel',
  clearAllTerrain:       'Clear All Terrain',
  clearAllClimate:       'Clear All Climate Zones',
  customTerrainDescsTooltip: 'Custom Terrain Descriptions',
  allTerrainCleared:     'All terrain cleared',
  customDescsSaved:      'Custom descriptions saved',
  allClimateCleared:     'All climate zones cleared',
  clickHexTravel:        'Hexcrawl: Click a hex to travel there',
  clickHexSetStart:      'Click a hex to set the party\'s starting position',
  clickHexEditDesc:      'Click a hex to add or edit its custom description',
  poiAssigned:           'Point of Interest assigned to hex',
  poiRemoved:            '📍 Removed "{name}" from this hex',
  startPositionSet:      '📌 Party starting position set to ({col}, {row}) — {icon} {name}',
  descSaved:             '📜 Description saved for ({col}, {row})',
  descCleared:           '🗑️ Description cleared for ({col}, {row})',
  enableHexcrawlFirst:   '⚠️ Enable hexcrawl tracking in Hexcrawl Settings first',
  noMovementBudget:      '⚠️ No movement budget remaining today. End the day first.',
  traveledToHex:         'Traveled to hex ({col}, {row})',

  // ── Terrain data ───────────────────────────────────────
  'terrain.road':        'Road',
  'terrain.plains':      'Plains',
  'terrain.coastal':     'Coastal',
  'terrain.forest':      'Forest',
  'terrain.hills':       'Hills',
  'terrain.jungle':      'Jungle',
  'terrain.swamp':       'Swamp',
  'terrain.desert':      'Desert',
  'terrain.mountains':   'Mountains',
  'terrain.arctic':      'Arctic',
  'terrain.underdark':   'Underdark',
  'terrain.water':       'Water',
  'terrainDesc.road':       'Maintained path or trade route — fast, safe travel',
  'terrainDesc.plains':     'Open grasslands, meadows, and prairies',
  'terrainDesc.coastal':    'Shorelines, beaches, and tidal flats',
  'terrainDesc.forest':     'Dense woodlands and thick canopy',
  'terrainDesc.hills':      'Rolling highlands and rocky outcrops',
  'terrainDesc.jungle':     'Tropical jungle with extreme undergrowth',
  'terrainDesc.swamp':      'Marshes, bogs, and wetlands',
  'terrainDesc.desert':     'Arid wastelands and sand dunes',
  'terrainDesc.mountains':  'Steep peaks and alpine passes',
  'terrainDesc.arctic':     'Frozen tundra, glaciers, and icy wastes',
  'terrainDesc.underdark':  'Subterranean tunnels and caverns',
  'terrainDesc.water':      'Open water — requires a vessel to cross',

  // ── Climate data ───────────────────────────────────────
  'climate.temperate':    'Temperate',
  'climate.arctic':       'Arctic',
  'climate.tropical':     'Tropical',
  'climate.arid':         'Arid',
  'climate.volcanic':     'Volcanic',
  'climate.maritime':     'Maritime',
  'climateDesc.temperate': 'Mild seasons, deciduous forests, rolling farmlands (Sword Coast heartlands)',
  'climateDesc.arctic':    'Frozen tundra, permafrost, howling winds (Icewind Dale, Eiselcross)',
  'climateDesc.tropical':  'Hot, humid jungles, monsoon rains, dense canopy (Chult)',
  'climateDesc.arid':      'Scorching deserts, sandstorms, oases (Anauroch, Calimshan)',
  'climateDesc.volcanic':  'Ash-choked wastelands, lava flows, geothermal vents (Inferno River)',
  'climateDesc.maritime':  'Fog-shrouded coasts, salt marshes, briny air (Sword Coast shoreline)',

  // ── Exploration roles ──────────────────────────────────
  'role.navigator':       'Navigator',
  'role.scout':           'Scout',
  'role.forager':         'Forager',
  'roleSkill.navigator':  'Survival',
  'roleSkill.scout':      'Perception',
  'roleSkill.forager':    'Survival',
  'roleAbility.navigator':'WIS',
  'roleAbility.scout':    'WIS',
  'roleAbility.forager':  'WIS',
  'roleDesc.navigator':   'Avoid getting lost — Survival check to set the course (DMG Ch.5)',
  'roleDesc.scout':       'Spot threats ahead — passive Perception detects dangers (DMG Ch.5)',
  'roleDesc.forager':     'Find food & water — Survival check DC varies by terrain (DMG Ch.5)',

  // ── Weather data ───────────────────────────────────────
  'weather.clear':        'Clear Skies',
  'weather.overcast':     'Overcast',
  'weather.fog':          'Dense Fog',
  'weather.rain':         'Light Rain',
  'weather.heavy-rain':   'Heavy Rain',
  'weather.thunderstorm': 'Thunderstorm',
  'weather.snow':         'Snowfall',
  'weather.blizzard':     'Blizzard',
  'weather.hail':         'Hailstorm',
  'weather.sandstorm':    'Sandstorm',
  'weather.extreme-heat': 'Extreme Heat',
  'weather.extreme-cold': 'Extreme Cold',
  'weatherVis.clear':        'None',
  'weatherVis.overcast':     'Slightly reduced',
  'weatherVis.fog':          'Heavily obscured beyond 30 ft',
  'weatherVis.rain':         'Lightly obscured',
  'weatherVis.heavy-rain':   'Lightly obscured',
  'weatherVis.thunderstorm': 'Heavily obscured',
  'weatherVis.snow':         'Lightly obscured',
  'weatherVis.blizzard':     'Heavily obscured beyond 10 ft',
  'weatherVis.hail':         'Lightly obscured',
  'weatherVis.sandstorm':    'Heavily obscured beyond 10 ft',
  'weatherVis.extreme-heat': 'Shimmer/mirage',
  'weatherVis.extreme-cold': 'None',
  'weatherFx.clear':         'No effects',
  'weatherFx.overcast':      'No effects',
  'weatherFx.fog':           'Disadvantage on Perception (sight). Navigation DC +5',
  'weatherFx.rain':          'Disadvantage on Perception (hearing)',
  'weatherFx.heavy-rain':    'Disadvantage on Perception. Open flames extinguished',
  'weatherFx.thunderstorm':  'Disadvantage on Perception. Navigation DC +5. Risk of lightning',
  'weatherFx.snow':          'Terrain becomes difficult. Disadvantage on tracking',
  'weatherFx.blizzard':      'Terrain very difficult. CON save DC 10/hr or 1 exhaustion',
  'weatherFx.hail':          '1d4 bludgeoning/hr without cover. Terrain becomes difficult',
  'weatherFx.sandstorm':     '1d4 slashing/hr without cover. CON save DC 10 or blinded',
  'weatherFx.extreme-heat':  'CON save DC 10/hr or 1 exhaustion. Water consumption doubled',
  'weatherFx.extreme-cold':  'CON save DC 10/hr or 1 exhaustion. Cold resistance negates',

  // ── Pace data ──────────────────────────────────────────
  'pace.slow':           'Slow Pace',
  'pace.normal':         'Normal Pace',
  'pace.fast':           'Fast Pace',
  'paceDesc.slow':       'Able to use stealth. 18 mi/day (3 hexes)',
  'paceDesc.normal':     'Standard travel. 24 mi/day (4 hexes)',
  'paceDesc.fast':       '-5 passive Perception. 30 mi/day (5 hexes)',

  // ── Exhaustion effects ─────────────────────────────────
  'exhaustion.0':        'None',
  'exhaustion.1':        'Disadvantage on ability checks',
  'exhaustion.2':        'Speed halved',
  'exhaustion.3':        'Disadvantage on attacks and saves',
  'exhaustion.4':        'HP maximum halved',
  'exhaustion.5':        'Speed reduced to 0',
  'exhaustion.6':        'Death',

  // ── Weather severity ───────────────────────────────────
  'severity.clear':      'clear',
  'severity.light':      'light',
  'severity.moderate':   'moderate',
  'severity.severe':     'severe',
  'severity.extreme':    'extreme',
};

// ─── German ───────────────────────────────────────────────────────────

const DE: LocaleMap = {
  // ── Step labels ────────────────────────────────────────
  stepTerrain:        '🗺️ Gelände',
  stepWeather:        '🌤️ Wetter',
  stepChecks:         '🎲 Erkundungsproben',
  stepEncounter:      '⚔️ Begegnung',
  stepDiscovery:      '🔍 Entdeckung',
  stepSurvival:       '❤️ Überleben',
  stepSummary:        '📋 Zusammenfassung',

  // ── Procedure modal header / info bar ──────────────────
  enteringHex:        'Betreten von Hex ({col}, {row}) — {icon} {name}',
  dayN:               'Tag {n}',
  moveCost:           'Bewegungskosten: {cost}',
  remaining:          'Verbleibend: {remaining}/{max}',

  // ── Navigation buttons ─────────────────────────────────
  back:               '← Zurück',
  cancel:             'Abbrechen',
  next:               'Weiter →',

  // ── Step 1: Terrain ────────────────────────────────────
  travelSpeed:        'Reisegeschwindigkeit: {val}',
  travelSpeedNormal:  'Normal',
  difficultTerrain:   'Schwieriges Gelände: {val}',
  yes:                'Ja',
  no:                 'Nein',
  forageDC:           'Nahrungssuche SG: {dc}',
  navigationDC:       'Navigation SG: {dc}',
  readAloudDesc:      '📜 Vorlesetext',
  usingTileDesc:      '📌 Verwende Feld-spezifische Beschreibung',
  placeholderClimate: 'Beschreibe, was die Gruppe in diesem {climate} {terrain} Hex sieht…',
  placeholderNoClimate: 'Lege eine Klimazone für dieses Hex fest, um automatisch Vorlesetexte zu generieren, oder schreibe unten deinen eigenen…',
  rerollDesc:         '🎲 Neu würfeln',

  // ── Step 2: Weather ────────────────────────────────────
  currentWeather:     'Aktuelles Wetter: {icon} {name}',
  severity:           'Schweregrad: {val}',
  travelModifier:     'Reisemodifikator: ×{val}',
  visibility:         'Sicht: {val}',
  effects:            'Effekte: {val}',
  rollNewWeather:     '🎲 Wetter würfeln',
  weatherRolled:      'Wetter gewürfelt: {name}',
  setWeatherManually: 'Wetter manuell festlegen',

  // ── Step 3: Exploration Checks ─────────────────────────
  partyExplChecks:    'Erkundungsproben der Gruppe',
  checksHelpText:     'Jeder Spieler übernimmt eine Erkundungsrolle und legt eine Fertigkeitsprobe ab. Schalte zwischen bestanden/nicht bestanden um — der Überlebenszähler wird automatisch angepasst.',
  dcN:                'SG {dc}',
  playerPlaceholder:  'Spieler',
  pass:               '✅ Bestanden',
  fail:               '❌ Fehlgeschlagen',
  passedN:            '✅ {n} bestanden',
  failedN:            '❌ {n} fehlgeschlagen',
  survivalMeterPenalty: 'Überlebenszähler: −{n}',

  // ── Step 4: Encounter ──────────────────────────────────
  randomEncounterCheck:  'Zufällige Begegnungsprobe',
  encounterHelpText:     'Wirf einen W20. Eine Begegnung tritt bei 18+ ein (je nach Geländegefahr anpassen).',
  rollD20:               '🎲 W20 würfeln',
  encounterTriggered:    '⚔️ Begegnung ausgelöst!',
  noEncounter:           '✅ Keine Begegnung.',
  rolledResult:          'Gewürfelt: {roll} — {result}',
  encounterBang:         '⚔️ Begegnung!',
  safe:                  '✅ Sicher',
  encounterActive:       '⚔️ Begegnung aktiv',
  forceEncounter:        'Begegnung erzwingen',
  encounterDetails:      'Begegnungsdetails',
  encounterPlaceholder:  'Beschreibe die Begegnung oder füge sie aus deiner Begegnungstabelle ein…',

  // ── Step 5: Discovery ──────────────────────────────────
  hexDiscovery:          'Hex-Entdeckung',
  discoveryHelpText:     'Wurde etwas in diesem Hex entdeckt? Ein Ort, Wahrzeichen, Hinweis oder zufällige Entdeckung.',
  discoveryFound:        '🔍 Entdeckung gemacht!',
  noDiscovery:           'Keine Entdeckung',
  rollDiscovery:         '🎲 Entdeckung würfeln',
  discoveryDetails:      'Entdeckungsdetails',
  discoveryPlaceholder:  'Was hat die Gruppe entdeckt?',

  // Random discoveries
  disc1:  'Verlassenes Lager mit kalter Asche und zerrissenen Vorräten',
  disc2:  'Uralte Menhire mit verblassten Runen',
  disc3:  'Eine kristallklare Quelle mit ungewöhnlich warmem Wasser',
  disc4:  'Spuren eines großen Raubtiers, das in dieselbe Richtung zieht',
  disc5:  'Überwachsene Ruinen eines kleinen Wachturms',
  disc6:  'Ein umgestürzter Händlerkarren auf einem kaum sichtbaren Pfad',
  disc7:  'Seltsamer Pilzkreis mit schwachem Leuchten',
  disc8:  'Knochen einer gewaltigen Kreatur, vollständig abgenagt',
  disc9:  'Ein Schrein einer vergessenen Gottheit — die Opfergaben noch frisch',
  disc10: 'Merkwürdige Felsformation, die im Profil einem Gesicht gleicht',
  disc11: 'Erlöschendes Lagerfeuer mit frischen Vorräten — kürzlich verlassen',
  disc12: 'Ein verstecktes Vorratslager, sorgfältig in Öltuch eingewickelt',
  discNone: 'Nichts Besonderes',

  // ── Step 6: Survival Meter ─────────────────────────────
  survivalMeterUpdate:     'Überlebenszähler-Aktualisierung',
  failedChecksPenalty:     'Fehlgeschlagene Proben: −{n}',
  successfulForage:        ' | Erfolgreiche Nahrungssuche: +1',
  additionalAdjustment:    'Zusätzliche Anpassung:',
  minus1:                  '−1',
  plus1:                   '+1',
  netChange:               'Änderung: {change} → Zähler wird {projected}/{max}',
  dangerThresholdWarning:  '⚠️ Überlebenszähler am Gefahrenschwellenwert! Erwäge eine Überlebensbegegnung.',
  meterDepletedWarning:    '💀 Überlebenszähler aufgebraucht! Die Gruppe erhält Erschöpfung.',

  // ── Step 7: Summary ────────────────────────────────────
  hexSummary:           '📋 Hex-Zusammenfassung',
  terrainWeatherRow:    '{tIcon} {tName} | {wIcon} {wName}',
  dayHex:               'Tag {day}, Hex {hex}',
  explorationChecks:    'Erkundungsproben:',
  checkResultLine:      '{icon} {name}: {result} (SG {dc})',
  checkResultPlayer:    '{icon} {name}: {result} (SG {dc}) — {player}',
  encounterYes:         '⚔️ Begegnung: {details}',
  encounterYesFallback: 'Ja',
  noEncounterSummary:   '✅ Keine Begegnung',
  discoveryLine:        '🔍 Entdeckung: {details}',
  discoveryYesFallback: 'Ja',
  survivalMeterSummary: '❤️ Überlebenszähler: {current} → {projected}/{max} ({change})',
  notesHeading:         '📝 Notizen',
  notesPlaceholder:     'Zusätzliche Notizen für dieses Hex…',
  completeEnterHex:     '✅ Abschließen & Hex betreten',

  // ── Notices (procedure complete) ───────────────────────
  exhaustionNotice:       '💀 Die Gruppe erhält 1 Stufe Erschöpfung! (Stufe {level})',
  thresholdNotice:        '⚠️ Überlebenszähler am Gefahrenschwellenwert! Erwäge eine Überlebensbegegnung.',

  // ── HexcrawlView ──────────────────────────────────────
  hexcrawlTabTitle:      '🏕️ Hexcrawl',
  noHexMapActive:        'Keine Hex-Karte aktiv',
  openHexMapHint:        'Öffne eine Hex-Karten-Notiz zum Verbinden.',
  trackingDisabled:      'Hexcrawl-Tracking ist deaktiviert',
  enableHexcrawl:        '⚙️ Hexcrawl aktivieren',
  hexcrawlTravel:        '🏕️ Hexcrawl-Reise',
  hexcrawlSettings:      'Hexcrawl-Einstellungen',
  movementDisplay:       'Bewegung: {moved} / {max} Hexfelder',
  travelPace:            'Reisetempo',
  weather:               'Wetter',
  travelMod:             'Reise ×{val}',
  rollWeather:           '🎲 Wetter würfeln',
  weatherNotice:         'Wetter: {icon} {name}',
  survivalMeter:         'Überlebenszähler',
  danger:                ' ⚠️ Gefahr!',
  resetLabel:            '↻ Zurücksetzen',
  meterReset:            'Überlebenszähler zurückgesetzt',
  exhaustionLevel:       '⚠️ Erschöpfungsstufe {level}',
  positionDisplay:       '📍 Position: ({col}, {row}) — {icon} {name}',
  explorationRoles:      'Erkundungsrollen',
  playerNamePlaceholder: 'Spielername…',
  travelLog:             'Reisetagebuch',
  logEntry:              'Tag {day} — {icon} ({col}, {row})',
  travelToHex:           '🥾 Zu Hex reisen',
  clickToTravel:         'Klicke ein Hex auf der Karte, um dorthin zu reisen',
  setStartingHex:        '📌 Startfeld setzen',
  clickToSetStart:       'Klicke ein Hex auf der Karte, um die Startposition festzulegen',
  endDay:                '🌙 Tag beenden',
  newDayNotice:          'Tag {day} beginnt. Gute Reise!',
  hexcrawlEnabled:       '🏕️ Hexcrawl-Reise aktiviert!',
  hexcrawlDisabled:      'Hexcrawl-Reise deaktiviert',

  // ── Settings Modal ─────────────────────────────────────
  settingsTitle:         '🏕️ Hexcrawl-Einstellungen',
  enableHexcrawlTravel:  'Hexcrawl-Reise aktivieren',
  enableHexcrawlDesc:    'Wildnisreise-Tracking für diese Karte aktivieren',
  survivalMeterMax:      'Überlebenszähler-Maximum',
  survivalMeterMaxDesc:  'Startwert des Überlebenszählers (empfohlen 6–8)',
  dangerThreshold:       'Gefahrenschwellenwert',
  dangerThresholdDesc:   'Wenn der Zähler diesen Wert erreicht, werden Überlebensbegegnungen ausgelöst',
  descLanguage:          'Beschreibungssprache',
  descLanguageDesc:      'Sprache für automatisch generierte Vorlesetexte',
  saveSettings:          'Einstellungen speichern',

  // ── Hex Description Edit Modal ─────────────────────────
  hexDescTitle:          '📜 Hex ({col}, {row}) — {terrain}',
  hexDescHint:           'Schreibe eine eigene Vorlesebeschreibung für dieses Feld. Diese überschreibt Gelände- und Klimabeschreibungen im Verfahrensmodal.',
  hexDescPlaceholder:    'Beschreibe, was die Gruppe beim Betreten dieses Hexfeldes sieht…',
  clearBtn:              '🗑️ Löschen',
  saveBtn:               '💾 Speichern',

  // ── Hex Description Settings Modal ─────────────────────
  customTerrainDescs:    '📜 Eigene Geländebeschreibungen',
  customTerrainDescsHint:'Eigene Vorlesetexte pro Geländetyp hinzufügen. Diese erscheinen im Hex-Verfahrensmodal und überschreiben die automatischen Klimabeschreibungen.',
  saveDescriptions:      '💾 Beschreibungen speichern',
  addBtn:                '+ Hinzufügen',
  noCustomDescs:         'Keine eigenen Beschreibungen — automatische Klimabeschreibungen werden verwendet.',
  describePartySees:     'Beschreibe, was die Gruppe sieht…',
  removeDesc:            'Diese Beschreibung entfernen',

  // ── Toolbar / main.ts ─────────────────────────────────
  toolbarHexcrawl:       '🏕️ Hexcrawl',
  toolTerrainPaint:      'Gelände malen',
  toolClimatePaint:      'Klima malen',
  toolSetStartHex:       'Startfeld setzen',
  toolHexDesc:           'Hex-Beschreibung',
  toolOpenPanel:         'Hexcrawl-Panel öffnen',
  clearAllTerrain:       'Gesamtes Gelände löschen',
  clearAllClimate:       'Alle Klimazonen löschen',
  customTerrainDescsTooltip: 'Eigene Geländebeschreibungen',
  allTerrainCleared:     'Gesamtes Gelände gelöscht',
  customDescsSaved:      'Eigene Beschreibungen gespeichert',
  allClimateCleared:     'Alle Klimazonen gelöscht',
  clickHexTravel:        'Hexcrawl: Klicke ein Hex, um dorthin zu reisen',
  clickHexSetStart:      'Klicke ein Hex, um die Startposition festzulegen',
  clickHexEditDesc:      'Klicke ein Hex, um die Beschreibung zu bearbeiten',
  poiAssigned:           'Interessanter Ort dem Hex zugewiesen',
  poiRemoved:            '📍 „{name}" von diesem Hex entfernt',
  startPositionSet:      '📌 Startposition auf ({col}, {row}) gesetzt — {icon} {name}',
  descSaved:             '📜 Beschreibung für ({col}, {row}) gespeichert',
  descCleared:           '🗑️ Beschreibung für ({col}, {row}) gelöscht',
  enableHexcrawlFirst:   '⚠️ Aktiviere zuerst das Hexcrawl-Tracking in den Hexcrawl-Einstellungen',
  noMovementBudget:      '⚠️ Kein Bewegungsbudget mehr für heute. Beende zuerst den Tag.',
  traveledToHex:         'Zum Hex ({col}, {row}) gereist',

  // ── Terrain data ───────────────────────────────────────
  'terrain.road':        'Straße',
  'terrain.plains':      'Ebene',
  'terrain.coastal':     'Küste',
  'terrain.forest':      'Wald',
  'terrain.hills':       'Hügel',
  'terrain.jungle':      'Dschungel',
  'terrain.swamp':       'Sumpf',
  'terrain.desert':      'Wüste',
  'terrain.mountains':   'Gebirge',
  'terrain.arctic':      'Arktis',
  'terrain.underdark':   'Unterreich',
  'terrain.water':       'Wasser',
  'terrainDesc.road':       'Gepflegter Weg oder Handelsroute — schnelles, sicheres Reisen',
  'terrainDesc.plains':     'Offenes Grasland, Wiesen und Prärien',
  'terrainDesc.coastal':    'Küstenstreifen, Strände und Wattflächen',
  'terrainDesc.forest':     'Dichtes Waldgebiet mit geschlossenem Kronendach',
  'terrainDesc.hills':      'Hügeliges Hochland und felsige Vorsprünge',
  'terrainDesc.jungle':     'Tropischer Dschungel mit extremem Unterholz',
  'terrainDesc.swamp':      'Sümpfe, Moore und Feuchtgebiete',
  'terrainDesc.desert':     'Dürre Ödlande und Sanddünen',
  'terrainDesc.mountains':  'Steile Gipfel und Alpenpässe',
  'terrainDesc.arctic':     'Gefrorene Tundra, Gletscher und Eiswüsten',
  'terrainDesc.underdark':  'Unterirdische Tunnel und Höhlen',
  'terrainDesc.water':      'Offenes Gewässer — erfordert ein Wasserfahrzeug',

  // ── Climate data ───────────────────────────────────────
  'climate.temperate':    'Gemäßigt',
  'climate.arctic':       'Arktisch',
  'climate.tropical':     'Tropisch',
  'climate.arid':         'Trocken',
  'climate.volcanic':     'Vulkanisch',
  'climate.maritime':     'Maritim',
  'climateDesc.temperate': 'Milde Jahreszeiten, Laubwälder, weites Ackerland (Schwertküsten-Kernland)',
  'climateDesc.arctic':    'Gefrorene Tundra, Permafrost, heulende Winde (Eiswindtal, Eiselcross)',
  'climateDesc.tropical':  'Heiße, feuchte Dschungel, Monsunregen, dichtes Kronendach (Chult)',
  'climateDesc.arid':      'Sengende Wüsten, Sandstürme, Oasen (Anauroch, Calimshan)',
  'climateDesc.volcanic':  'Ascheverhangene Ödlande, Lavaströme, Thermalquellen (Inferno-Fluss)',
  'climateDesc.maritime':  'Nebelverhangene Küsten, Salzmarschen, salzige Luft (Schwertküsten-Ufer)',

  // ── Exploration roles ──────────────────────────────────
  'role.navigator':       'Navigator',
  'role.scout':           'Späher',
  'role.forager':         'Sammler',
  'roleSkill.navigator':  'Überlebenskunst',
  'roleSkill.scout':      'Wahrnehmung',
  'roleSkill.forager':    'Überlebenskunst',
  'roleAbility.navigator':'WEI',
  'roleAbility.scout':    'WEI',
  'roleAbility.forager':  'WEI',
  'roleDesc.navigator':   'Verhindert, dass die Gruppe sich verirrt — Überlebenskunst-Probe (SL-Handbuch Kap. 5)',
  'roleDesc.scout':       'Erkennt Gefahren voraus — passive Wahrnehmung entdeckt Bedrohungen (SL-Handbuch Kap. 5)',
  'roleDesc.forager':     'Findet Nahrung & Wasser — Überlebenskunst-Probe, SG je nach Gelände (SL-Handbuch Kap. 5)',

  // ── Weather data ───────────────────────────────────────
  'weather.clear':        'Klarer Himmel',
  'weather.overcast':     'Bewölkt',
  'weather.fog':          'Dichter Nebel',
  'weather.rain':         'Leichter Regen',
  'weather.heavy-rain':   'Starker Regen',
  'weather.thunderstorm': 'Gewitter',
  'weather.snow':         'Schneefall',
  'weather.blizzard':     'Schneesturm',
  'weather.hail':         'Hagelsturm',
  'weather.sandstorm':    'Sandsturm',
  'weather.extreme-heat': 'Extreme Hitze',
  'weather.extreme-cold': 'Extreme Kälte',
  'weatherVis.clear':        'Keine Einschränkung',
  'weatherVis.overcast':     'Leicht eingeschränkt',
  'weatherVis.fog':          'Stark eingeschränkt ab 9 m',
  'weatherVis.rain':         'Leicht eingeschränkt',
  'weatherVis.heavy-rain':   'Leicht eingeschränkt',
  'weatherVis.thunderstorm': 'Stark eingeschränkt',
  'weatherVis.snow':         'Leicht eingeschränkt',
  'weatherVis.blizzard':     'Stark eingeschränkt ab 3 m',
  'weatherVis.hail':         'Leicht eingeschränkt',
  'weatherVis.sandstorm':    'Stark eingeschränkt ab 3 m',
  'weatherVis.extreme-heat': 'Flimmern/Trugbild',
  'weatherVis.extreme-cold': 'Keine Einschränkung',
  'weatherFx.clear':         'Keine Effekte',
  'weatherFx.overcast':      'Keine Effekte',
  'weatherFx.fog':           'Nachteil auf Wahrnehmung (Sicht). Navigations-SG +5',
  'weatherFx.rain':          'Nachteil auf Wahrnehmung (Gehör)',
  'weatherFx.heavy-rain':    'Nachteil auf Wahrnehmung. Offene Flammen erlöschen',
  'weatherFx.thunderstorm':  'Nachteil auf Wahrnehmung. Navigations-SG +5. Blitzschlag-Gefahr',
  'weatherFx.snow':          'Gelände wird schwierig. Nachteil auf Fährtenlesen',
  'weatherFx.blizzard':      'Gelände sehr schwierig. KON-Rettungswurf SG 10/Std. oder 1 Erschöpfung',
  'weatherFx.hail':          '1W4 Wuchtschaden/Std. ohne Deckung. Gelände wird schwierig',
  'weatherFx.sandstorm':     '1W4 Hiebschaden/Std. ohne Deckung. KON-Rettungswurf SG 10 oder geblendet',
  'weatherFx.extreme-heat':  'KON-Rettungswurf SG 10/Std. oder 1 Erschöpfung. Wasserverbrauch verdoppelt',
  'weatherFx.extreme-cold':  'KON-Rettungswurf SG 10/Std. oder 1 Erschöpfung. Kälteresistenz verhindert',

  // ── Pace data ──────────────────────────────────────────
  'pace.slow':           'Langsames Tempo',
  'pace.normal':         'Normales Tempo',
  'pace.fast':           'Schnelles Tempo',
  'paceDesc.slow':       'Schleichen möglich. 29 km/Tag (3 Hexfelder)',
  'paceDesc.normal':     'Standardreise. 38 km/Tag (4 Hexfelder)',
  'paceDesc.fast':       '−5 passive Wahrnehmung. 48 km/Tag (5 Hexfelder)',

  // ── Exhaustion effects ─────────────────────────────────
  'exhaustion.0':        'Keine',
  'exhaustion.1':        'Nachteil auf Fertigkeitsproben',
  'exhaustion.2':        'Geschwindigkeit halbiert',
  'exhaustion.3':        'Nachteil auf Angriffe und Rettungswürfe',
  'exhaustion.4':        'TP-Maximum halbiert',
  'exhaustion.5':        'Geschwindigkeit auf 0 reduziert',
  'exhaustion.6':        'Tod',

  // ── Weather severity ───────────────────────────────────
  'severity.clear':      'klar',
  'severity.light':      'leicht',
  'severity.moderate':   'mäßig',
  'severity.severe':     'schwer',
  'severity.extreme':    'extrem',
};

// ─── Locale Registry ──────────────────────────────────────────────────

const LOCALES: Record<DescriptionLanguage, LocaleMap> = { en: EN, de: DE };

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Look up a hexcrawl locale string.
 *
 * @param lang   'en' | 'de'
 * @param key    Key into the locale map
 * @param params Optional named replacement tokens, e.g. `{ n: 3 }` → replaces `{n}`
 * @returns The localised string, falling back to English if the key is missing.
 */
export function hLoc(
  lang: DescriptionLanguage,
  key: string,
  params?: Record<string, string | number>,
): string {
  const map = LOCALES[lang] ?? EN;
  let text = map[key] ?? EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}
