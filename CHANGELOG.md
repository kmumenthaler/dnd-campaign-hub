# Changelog

All notable changes to the D&D Campaign Hub plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
