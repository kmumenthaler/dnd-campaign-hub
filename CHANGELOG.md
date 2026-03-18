# Changelog

All notable changes to the D&D Campaign Hub plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2026-03-18

### Added

- **PC Quick Stats** — PC notes now display a live Quick Stats block (`dnd-hub-view`) showing HP, AC, level, class, and ability scores, replacing the old static callout. Stats update automatically when frontmatter changes.
- **Initiative Tracker → PC HP sync** — HP changes made in the Combat Tracker now write back to the PC vault note in real time.

### Fixed

- **D&D Beyond import HP calculation** — fixed incorrect max HP when importing characters with the Tough feat or similar per-level HP bonuses; also fixed reading HP values from the correct `body.data.character` path.
- **SRD creature frontmatter** — a series of migrations (creature 1.4.0–1.10.0) repair invalid YAML in previously imported SRD bestiary notes:
  - Added missing `plugin_type: creature` field so action buttons render correctly.
  - Replaced legacy `dataviewjs` button blocks with native `dnd-hub` code blocks.
  - Quoted frontmatter values containing YAML-special characters (speed, senses, languages, damage fields, CR).
  - Repaired broken lines where both field name and value were wrapped in a single double-quoted string.
  - Fixed bare `skillsaves:` null to `skillsaves: []`.
  - Converted multi-line double-quoted `desc` values (traits, actions, legendary actions) to `|` block scalars so line breaks are preserved.
- **SRD creature importer** — new creature imports now emit correct YAML from the start: `|` block scalars for multi-line descriptions, `skillsaves: []` fallback for creatures without skill proficiencies, and `template_version: 1.10.0`.
- **Scene music listener cleanup** — replaced `MutationObserver` with `MarkdownRenderChild` lifecycle for reliable teardown.

## [0.6.0] - 2026-03-15

### Added

#### D&D 5e RAW Pursuit / Chase System
- Full pursuit engine (`PursuitTracker`) with turn-based state management following DMG chase rules
- GM sidebar view (`PursuitTrackerView`) with action selectors, line-of-sight toggle, and carry controls
- Projectable 2D player view (`PursuitPlayerView`) with animated scatter layout — pursuers in the top band, quarries in the bottom band, with SVG range lines color-coded by distance
- Setup modal (`PursuitSetupModal`) with vault entity picker, party selector integration, combat import, and per-creature stat editing
- D&D 5e RAW mechanics: dash limits with CON saves, exhaustion tracking, stealth/escape checks, passive and active Perception
- D20 complication tables faithful to the DMG (Urban, Wilderness, Underground, Waterfront, Rooftop) — complications affect the *next* participant in initiative order
- Carry mechanic for downed or willing allies with STR-based capacity, D&D 5e RAW speed penalties (half speed grapple, 5 ft push/drag)
- Pickup vs grapple distinction — same-role willing pickup requires 0 ft distance; cross-role grapple is contested
- Multi-step movement: move → pickup → continue moving in a single turn
- Per-pursuer target selection with distance display
- Mid-chase "Add Participant" panel with inline vault search
- Environment zone overlays (cover, obscured, crowded, elevation, wide open)
- Attack and Create Obstacle actions with position-tracked obstacles that trigger when pursuers cross them
- Inline HP controls (damage/heal/temp HP) and condition badge management on all participants
- End-of-round escape checks: quarry with broken LoS makes Stealth vs highest pursuer passive Perception
- Hidden quarry escapes at end of round if not found; visual token overlay for hidden state
- Fully automated turn phase state machine: Complication → Action → Bonus → Movement → Turn End
- Snapshot-based undo stack (50 deep) — replaces the old limited `prevTurn()` rollback
- "Start Chase from Combat" button in the Combat Tracker toolbar, preserving initiative order and active combatant
- Bidirectional combat–pursuit sync bridge (`CombatPursuitSync`) — HP, temp HP, and conditions sync live between combat and chase

#### Pursuit Player View
- 2D scatter layout with role region labels and flex-column token stacking
- Carried/grappled sub-tokens rendered as attached clusters
- Flying tokens elevated with dashed border; burrowing tokens dotted and dimmed
- Movement plane badges and plane icons on tokens
- Dash counters and exhaustion pips shown only for PCs
- 3-level fallback for token image resolution (direct ID → frontmatter `token_id` → name match)

#### Pursuit Projection
- `pursuit` projection content type registered in `ProjectionManager`
- Projection conflict detection with occupied-screen switch menu
- Duplicate pursuit projection prevention

#### Map Distance Import
- "Import from Map" in pursuit setup auto-calculates starting distances from battle-map token positions
- Flee direction compass picker (N/NE/E/SE/S/SW/W/NW) to determine rearmost token
- Chase-axis projection algorithm maps 2D token positions to 1D chase-lane ordering
- Party members matched to map tokens in addition to creatures, with consumed-marker tracking to avoid duplicates

### Changed

- Pursuit setup modal rewritten to match Encounter Builder UI conventions (party checkboxes, vault search, count support, role selectors)
- Creature notes detected by `statblock: true` instead of `type: creature`, matching the main plugin pattern
- STR/Stealth/Passive Perception extracted from `skillsaves` array and `senses` string for all entity types (PCs, NPCs, creatures)
- Template creation modals (`CampaignCreationModal`, `AdventureCreationModal`, `FactionCreationModal`, `SessionCreationModal`) now use bundled template constants instead of reading from `z_Templates/` vault files; vault template files synced on plugin load

### Fixed

#### Encounter Difficulty
- NPCs no longer show "Level 0" — CR is mapped to an effective level via `estimateLevelFromCR()`
- Encounter builder displays "CR: X" instead of "Level: 0" for NPCs/creatures
- `parseStatblockStats` now accounts for recharge abilities (probability-weighted DPR), legendary actions (greedy cost-optimized budget), bonus actions, damage resistances/immunities (effective HP multiplier), Pack Tactics (advantage bonus only with allies), Reckless Attack, and Surprise Attack/Ambusher traits
- DRY refactor: modal delegates `parseStatblockStats`/`parseHP`/`parseAC` to `EncounterBuilder`

#### Projection System
- Reactive `onChange()` callback eliminates idle flash when switching projected content
- Periodic 3-second health check auto-prunes dead projections and verifies host window liveness
- `crossfadeOnLeaf()` utility for smooth fade-to-black transitions between content types
- Fixed race condition where `transitionToIdle()` was called without `await`
- Combat and pursuit toolbar buttons update instantly via `onChange` subscription
- Deterministic shutdown: session stops first, then standalone projections are cleaned up

#### Pursuit Bugs
- Active combatant preserved as starting turn when launching chase from combat
- Drop-out advances turn correctly when the active participant drops out
- Healing restores consciousness when healed above 0 HP
- All auto-rolling removed — GM must input all roll results for NPCs and PCs
- Token overlap resolved via multi-pass collision algorithm with increased minimum gaps
- Token images use `vault.adapter.getResourcePath` directly
- Grapple escape: quarry can break free via contested STR check
- End-of-round escape uses only passive perception (per DMG RAW)
- Modal width applied to `modalEl` instead of `contentEl`

#### Map Distance Import
- Edge-to-edge distance formula (matching Token Distance Tool) replaces Euclidean-from-reference-point
- Effective grid cell size (`gridSizeW`/`gridSizeH` average) used for pixel-to-feet conversion, fixing 4× distance errors after grid calibration
- Directional projection along pursuer→quarry axis prevents tokens in opposite directions from collapsing to the same distance

## [0.5.1] - 2026-03-13

### Added

- **SRD Reference browser** — the Campaign Hub browse section now includes all 15 SRD categories (Equipment, Classes, Races, Conditions, Skills, etc.) under a dedicated "SRD Reference" header, with search and filtering. The section appears automatically after importing SRD data.

### Docs

- Added D&D Beyond import and PDF character sheet import to characters documentation
- Added session projection system with profiles and idle screen media picker
- Added session prep readiness checklist with scoring and action buttons
- Added PC statblock viewing in combat tracker documentation
- Added `dnd-hub` code block and projection commands to reference
- Removed Buttons and Dataview from dependencies (replaced by native `dnd-hub` blocks)
- Added all SRD folders to vault structure reference
- Expanded combat tracker docs from developer stub to full user guide

## [0.5.0] - 2026-03-13

### Added

#### PC Statblock System
- Fantasy Statblock integration for player characters — PCs now get full rendered statblocks like creatures
- PC statblock template with `statblock: true` frontmatter and Fantasy Statblock code fence
- D&D Beyond character import — fetch core stats, abilities, spells, traits, actions, and equipment from the D&D Beyond API
- Rich statblock content: weapon attacks, spell attacks, feature actions, bonus actions, reactions, class features, species traits, feats, and skill proficiencies
- Section dividers with labeled groups (Weapon Attacks, Spell Attacks, Feature Actions, Class Features, Species Traits, Skills, Feats, Options) and empty-section suppression
- Spell list import with slot counts, spell save DC, and spell attack modifier
- Local SRD vault link resolver — automatically links spells, feats, features, traits, classes, and races to matching vault notes
- PDF character sheet import via `pdf-lib` with fillable form field extraction
- Four PDF profiles: WotC Official 5e, D&D Beyond PDF, MPMB Automated Sheet, and German 5e (Deutsch)
- German PDF profile with full field mappings for abilities, skills, saves, attacks, spells, and languages
- Unarmed Strike auto-generated in weapon actions

#### Combat Tracker
- Clicking a PC name in the combat tracker now opens a Fantasy Statblock preview (same as creatures)
- Statblock preview leaf tab context menu restricted to "Close" only
- Falls back to full note view if Fantasy Statblocks plugin is not installed

#### Session Prep Dashboard
- Actionable session readiness checklist with clickable items
- Session prep readiness indicators and focus filters
- Improved dashboard auto-refresh behavior

### Changed
- Refactored frontmatter manipulation across all entity types to use centralized YAML helper (`updateYamlFrontmatter`)
- Hardened YAML frontmatter handling in encounter, session, NPC, PC, adventure, world, faction, and PoI flows
- Template version alignment for sessions, encounters, PCs, traps, spells, adventures, worlds, and factions
- D&D Beyond import now title-cases character names (API returns lowercase)
- AC computation for 2024+ D&D Beyond API — calculates from equipped armor, shield, DEX, and modifier bonuses
- D&D Beyond `data.actions` handled as keyed object (2024+ API format) in addition to legacy array format
- Statblock deduplication improved — traits already present as actions are excluded
- Statblock formatting: proper level-gating, ordering, and wide-clipping prevention

### Fixed
- Hub browse discovery for sessions, creatures, and traps
- Trap template and migration target alignment
- D&D Beyond max HP import (now includes CON modifier × level)
- Unicode NFC normalization for German PDF field matching (umlauts)
- Case-only PC renames no longer blocked on case-insensitive file systems
- Music player scene load/stop state transition hardening
- Manual encounter YAML parsing replaced with safe helper

### Docs
- Updated agent instructions to require `npm run check` and `npm run test` before build/deploy

## [0.4.0] - 2026-03-12

### Added

#### Session Projection System
- Persistent managed player screens with configurable idle content (black, solid color, image/GIF, looping video)
- Session Projection Hub modal for GM setup — enumerate monitors, select player-facing screens, configure idle content, start/stop sessions
- Visual Media Picker with lazy-loading thumbnail grid, search filter, and OS file upload to vault
- Projection profiles — save, load, rename, and delete named screen configurations for different campaigns
- Idle Screen View with automatic chrome-hiding for distraction-free player displays

#### Campaign Hub
- Redesigned browse section with inline expandable entity browser
- Multi-campaign browsing with campaign origin indicators
- Projection Hub quick-action button in Session Running dashboard

#### Session Running Dashboard
- Quick Notes now load existing content from the session file on dashboard open
- Read-Only toggle syncs with actual workspace edit state (detects manual mode switches)

### Changed
- Moved ProjectionManager to centralized `src/projection/` module
- Removed Dataview dependency — replaced all dataview/dataviewjs blocks with native renderers
- Overhauled migration system with registry pattern and `dnd-hub` code blocks
- Removed third-party plugin dependencies (Dataview, Buttons, Templater fallbacks)
- Removed `currentCampaign` global setting in favor of per-view campaign pickers
- Reworked settings page with collapsible categories

### Fixed
- Graceful degradation when Fantasy Statblocks plugin is missing
- Scene status toggles not updating after click
- Vault cache lag when overwriting backup files during migration
- `Folder already exists` race condition in migration backup
- Leftover `^button-*` block IDs cleaned up in world migration
- Grey border eliminated on idle screen, map, and combat tracker projections
- Session projection modal width and content clipping
- Strict-null TypeScript errors in DndHubModal and MediaPickerModal
- Quick Notes save regex to correctly match section boundaries
- Read-Only mode now actively switches leaves back to source mode on disable

### Docs
- Rewrote README with accurate feature documentation

## [0.3.0] - 2026-03-10

### Added

#### Combat Tracker
- Redesigned Combat Tracker with Initiative Tracker-style UI and player view projection
- D&D 5e death saving throw rules for PCs
- Unconscious condition auto-managed on HP changes
- Animated HP changes with bar transitions, ghost bars, damage numbers, and shield break effects
- Auto-pan player view to active combatant token on turn change
- Combatant portraits in Combat Player View with smooth auto-scroll
- Color-coded allies and enemies in Player View
- Condition labels and color-coded HP for enemies in Player View
- Combat Projection with fullscreen mode and active combatant glow
- Visible stop encounter button in combat toolbar
- Statblock rendering in split leaf with dice roller support
- Confirmation prompt before clearing saved combat state
- Vault creature search in Add Creature modal
- AC displayed inside shield shape

#### Party Management
- Built-in Party Manager replacing external Initiative Tracker dependency
- Card-based Party Manager modal with drag-and-drop reordering
- NPC and creature companion/hireling tracking with role badges
- Campaign linking for existing campaigns with auto PC import
- Holistic party-campaign integration across all note types (sessions, scenes, encounters, etc.)
- Party selector widget for encounters, combat, and session dashboards
- Collapsible detail panels with smooth expand/collapse animation
- Compact card layout with left sidebar move buttons and right-side remove button
- Party tabs redesigned as wrapping chip/pill buttons

#### Battle Maps
- MapController API for cross-system map manipulation
- "Place on Map" context menu for combat tracker tokens
- Color-coded duplicate detection when placing tokens
- Token appearance editing widget (inline)
- Collapsible folder tree in map image browser
- Canvas-based thumbnail downscaling for map browser performance

#### NPCs & Creatures
- Optional statblock support for NPCs
- Searchable creature dropdown replacing static select
- Allow overwriting and removing NPC statblocks

### Fixed
- Party member vault rename/delete event sync
- Companion selector finds creatures by `statblock` field instead of `type`
- Non-PC combatants fall unconscious at 0 HP instead of dying
- Combat player view overflow and sizing issues
- Auto-pan restricted to vision-eligible tokens only
- Token placement resolves via fallback chain for all combatants
- Smooth pan animation using CSS transitions
- Various map image browser fixes (lazy loading, thumbnail sizing, large folder handling)

### Changed
- Documentation updated to reference built-in Party Manager and Combat Tracker
- Combat Player View scaled and dynamically sized for projection readability
- HP bar enlarged and text embedded for player view clarity

## [0.2.0] - 2026-03-04

### Added

#### Interactive battle maps
- Interactive map viewer with square, hex-horizontal, hex-vertical, and no-grid overlays
- Map creation modal with live grid and annotation preview
- Map Manager interface for browsing, editing, and deleting maps
- GM Map side leaf for opening battlemaps in a persistent side panel
- Player View popout window with real-time annotation sync from GM view
- Support for multiple simultaneous Player View windows
- Auto-hide Obsidian chrome in Player View popout
- Five annotation layers: Player, DM, Background, Elevated, Subterranean
- Marker library system with reusable tokens, D&D creature sizes, grid snapping, and drag-move
- Marker edit, delete, and context menu with image browser and icon dropdown
- Token auras and undo/redo system
- Persistent token attributes and token browser UX improvements
- Token distance tool for token-to-token measurement
- Elevation-aware tokens with burrowing checkbox, tile elevation paint tool, and pill-shaped elevation badges
- Elevation-aware ruler and movement path
- Token vision toggle allowing the GM to select any token's vision for the Player View
- Per-instance `visibleToPlayers` toggle wired to Player View rendering
- Darkvision and light source interaction per token
- Highlight tool (split from select tool)
- Eraser tool for removing map annotations
- Freehand draw tool
- Ruler tool with drag-ruler style and real-time sync to Player View
- Area of effect tool with circle, cone, square, and line shapes
- AoE casting from token context menu with sticky anchoring
- Fog of war system with reveal/hide tools using brush, circle, rectangle, and polygon shapes
- Dynamic lighting with wall occlusion
- Wall height system with elevation-aware vision
- Movable doors and windows with Roll20-style rendering and light passthrough
- Door system overhaul with pivot handles, sliding door vision, and background edit views
- Light attachment to tokens
- Fluorescent light, wall light, and color picker for lights
- Smooth light gradients and flame flicker animation
- Player line-of-sight filtering for lights and darkvision
- Player vision system with light intersection
- Visibility caching for performance
- Tabletop miniature mode with physical monitor calibration and pan/drag
- Tabletop rotation controls in Player View
- Two-point grid calibration tool
- Grid sizing and positioning controls
- Animated image and video background support for battlemaps
- Battlemap template system with template-first workflow
- Environmental asset system (scatter, door, trap) with transform handles for resize, rotate, and pivot
- Image selector with preview thumbnails and folder filter
- Search filter and upload-from-computer in map image selector
- Magic wand wall detection tool
- Brush eraser, auto-collapse pickers
- Compact two-column toolbar with collapsible sections and floating tooltips
- Canvas pool to eliminate per-frame canvas allocation
- Keyboard shortcuts: Q (pan), W (select), E (highlight), R (marker), D (draw), Z (ruler), X (AoE), C (eraser), V (fog)

#### Encounter builder
- Standalone encounter builder with survival-ratio difficulty calculation
- Creature addition with count, HP, AC, CR, and color naming for duplicates
- Friendly and hidden creature flags with checkbox UI and Initiative Tracker sync
- Party selection UI with individual toggle and automatic party resolution
- Vault creature selection with search field and custom enemy entry
- Creature rename and copy button in encounter builder
- Trap difficulty integration with AoE detection
- Bidirectional encounter sync between notes, scenes, and Initiative Tracker
- `dnd-encounter` code block rendering for inline encounter cards
- Insert Encounter Widget command and `/dnd` slash snippet
- Random encounter table system with SRD API integration
- Random encounter table code block rendering

#### Hexcrawl wilderness travel
- Hexcrawl wilderness travel system with full English and German localization
- Hex-by-hex travel tracker with day progression, movement budget, and terrain modifiers
- 18+ terrain types (plains, forest, hills, mountains, swamp, desert, arctic, and more)
- Multi-pace hexcrawl system with 30+ D&D 5e travel presets
- Climate zones and weather generation
- Terrain painter for drawing terrain on hex maps
- Hex procedure modal for step-by-step exploration
- SRD encounter generation and battlemap creation from travel log
- Encounter battlemap modal improvements
- Simplified calibration tool using fixed six-mile hexes

#### DM Screen
- Virtual DM Screen with eight tabbed reference sections (conditions, actions, combat, skills, travel and rest, difficulty classes, damage types, cover)
- SRD Quick Search in Run Dashboard

#### Music player
- Dual-layer music player with primary and ambient tracks
- Soundboard for up to eight concurrent one-shot sound effects
- Playlist management with mood tags, shuffle, repeat, crossfade, and fade controls
- Audio ducking during sound effects
- Scene music code blocks (`dnd-music`) with ambient playlist filtering
- Inline sound effect code blocks (`dnd-sfx`)
- Freesound.org API integration for sound search, preview, and download
- Status bar "Now Playing" indicator
- Smooth transitions for scene music

#### Session management
- Session Prep Dashboard as a side pane view with adventure overview, scene preview, NPC quick reference, party stats, and last session recap
- Session Run Dashboard with named timers, dice history, quick notes, and automatic DM Screen opening
- Auto-refresh for Session Prep Dashboard (30-second interval and on focus)
- End Session modal for recording ending scene
- Session-adventure linking with starting and ending scene tracking
- Auto-populated session recap from previous session summary
- `/dnd` slash-command snippets for scene authoring (15+ snippet types)

#### Adventures and scenes
- Adventure creation with three-act structure and nine auto-generated scenes
- Scene creation modal with scene type, act, duration, and difficulty
- Specialized scene templates with improved numbering
- Scene-encounter builder integration with automatic party resolution
- Interactive scene status checkboxes in sessions and adventures
- Dynamic Dataview queries replacing static scene checklists
- Migration logic for adventure and scene notes
- Session, scene, and adventure frontmatter linking and status automation

#### Characters, creatures, and party
- PC creation modal with role detection and multiclass support
- PC import modal for cross-campaign transfers
- NPC creation modal with race, location, faction, motivation, and personality
- Edit and delete functionality for PC and NPC notes
- Creature creation modal with full stat block, D&D Beyond parser, and 2024 stat block format support
- Fantasy Statblocks plugin integration for creature and trap bestiary management
- Token auto-creation for PCs, NPCs, and creatures with correct grid size
- Cross-campaign PC system with token disambiguation
- `dnd-party` code block rendering with party stats
- Campaign party detection and Initiative Tracker party sync

#### Items, spells, traps, and factions
- Item creation modal with standard and evolving homebrew items
- Spell import from D&D 5e SRD API with search, filter by level/school/class, caching, and detail preview
- Bulk spell import to vault
- Trap creation modal with simple and complex types, threat levels, multiple elements, and countermeasures
- Trap difficulty calculation with DPR and CR estimation
- Statblock parsing for accurate DPR calculation
- Faction creation modal with type, alignment, goals, resources, territory, and relationships

#### Points of interest
- PoI editing and multi-PoI code block support with picker modal
- Improved PoI icons for map visibility
- PoI icons hidden in Player View, semi-transparent in GM view for hexcrawl maps
- Batch PoI icon update command

#### SRD data import
- SRD API bulk import system for 15 data categories
- SRD creature token import (334 monsters) with stat blocks, artwork, and correctly sized tokens
- SRD data folders included in purge logic

#### Infrastructure
- Migration system for safe template updates with automatic backups
- Migration manager extracted to separate module
- Refactored monolithic `main.ts` (25,000+ lines) into 60+ modular source files
- Reset Focus command as workaround for Obsidian input field bug
- Purge command accessible from Command Palette

### Changed
- Faction creation uses a comprehensive modal form instead of a simple name prompt
- Clear Annotations renamed to Clear Drawings with confirmation dialog
- Map config saved as JSON on creation with minimal code block (mapId only)
- Template update command renamed to Migrate D&D Hub Files
- Toolbar modernized with floating tooltips and animated color picker

### Fixed
- Token vision dropdown and Initiative Tracker sync for non-player tokens
- Tiny tokens render at correct quarter-tile size per D&D 5e rules
- Encounter token import for Tiny creatures
- Battlemap tool submenu positioning and click handling
- Garbled emoji encoding in commands and view renderers
- Double image load in GM and Player Map Views
- Blob URL leaks in MapManager image and video loading
- Walls block vision even when fog of war is disabled
- `visibleToPlayers` tokens no longer act as vision sources
- Creature and NPC vision selection stays DM-only in Player View
- Tunnel vision toggle enforces underground/surface isolation
- Session, scene, and adventure frontmatter linking bugs
- Session prep dashboard width adapts to window size
- Session template fields now replaced correctly
- EndSessionModal falls back to adventure picker when no adventure is linked
- Cross-campaign PC token disambiguation and import modal fixes
- Scene music stop button
- Fullscreen toggle, rotation, and scale issues in Player View
- Player View isolation per map
- Token layer preserved when moving on battlemap
- Env assets (doors) copied when creating battlemap from template
- Smooth anchored-edge env asset resize with lower minimum size
- Token image browser, undo/redo button click-through, and context menu centering
- Click-through prevention on map UI panels
- Light ray visibility and grayscale overlay corrections
- Viewport indicator dragging and arrow size
- Creature stats read back from file after rename
- Creature names with quotes display correctly in YAML
- Party AC calculation avoids string concatenation
- Session detection at campaign root level and multiple naming formats
- Regex patterns for frontmatter field extraction, session dates, and calendar defaults
- Leaked document listeners and popout window cleanup
- Numerous TypeScript strict null check fixes

### Performance
- Viewport culling in GM `redrawAnnotations`
- Skip layout recalculation in Player View `updateMapData`
- Batch Player View grid drawing into single `stroke()` call
- Reuse grid canvas and batch hex draw calls
- Replace JSON round-trip with `structuredClone` in undo/redo
- Strip 484 `console.log`/`warn`/`debug`/`info` calls
- Debounce `saveMapAnnotations` with one-second trailing edge
- Coalesce Player View sync via `requestAnimationFrame`
- Memoize `computeVisibilityPolygon` with quantized cache
- Canvas pool to eliminate per-frame allocation

## [0.1.1] - 2026-02-01

### Added
- Comprehensive PC creation modal with role detection and multiclass support

### Fixed
- Regex patterns for campaign creation and frontmatter fields
- Session frontmatter YAML construction and field replacements
- Trailing spaces in template field replacements
- Calendar date and end-date field replacements
- TypeScript null checks for regex matches and `arrayBuffer` usage
- Placeholder replacements in session and campaign creation templates

### Changed
- Added command to update D&D Hub templates with improved session creation instructions

## [0.1.0] - 2026-01-31

### Added
- Initial release
- Campaign initialization with organized vault folder structure
- NPC creation with guided modal form
- Session creation with Calendarium calendar integration
- Template system for campaigns, NPCs, PCs, and sessions
- Template update mechanism with automatic timestamped backups
- Dependency checking for Dataview, Calendarium, Buttons, and Templater
- Campaign Hub modal for quick actions
- Multiple campaign support within a single vault
- Automatic plugin installation during vault initialization

[0.2.0]: https://github.com/kmumenthaler/dnd-campaign-hub/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kmumenthaler/dnd-campaign-hub/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kmumenthaler/dnd-campaign-hub/releases/tag/v0.1.0
