# Architecture Analysis — dnd-campaign-hub

## 1. God File Problem: `src/main.ts` (3,025 lines)

The plugin class `DndCampaignHubPlugin` is a monolith containing at least **7 distinct responsibilities**:

| Responsibility | Approx. Lines | Description |
|---|---|---|
| **View registration** | L215–290 | Registers 10+ Obsidian views (session, combat, map, music, hexcrawl, DM screen, pursuit, idle screen) |
| **Code block processors** | L370–410 | Registers `dnd-hub`, `scene-music`, `sound-effect`, `encounter-table`, `dnd-entity-table`, `dnd-view` processors |
| **Command registration** | L415–1540 | ~60+ commands covering every entity CRUD operation, map commands, combat, music, encounters, SRD import, projection — this is the largest block |
| **File event handlers** | L1100–1230 | `vault.on('rename')`, `vault.on('delete')` for syncing marker library with file renames/deletions |
| **renderNoteActions()** | L1634–1740+ | Giant switch statement rendering entity-specific action buttons for every `type` |
| **SRD import methods** | Scattered | `importAllSRDData()`, `importSRDCategory()`, `importSRDCreatureTokens()` |
| **Settings/lifecycle** | L1576–1630 | `loadSettings()`, `saveSettings()`, `checkForUpdates()`, `migrateTemplates()` |

**Recommended extractions:**
- `CommandRegistry` — all `this.addCommand()` calls (~1,100 lines)
- `NoteActionRenderer` — the `renderNoteActions()` switch block
- `FileEventHandler` — vault rename/delete sync logic
- `SRDImportService` — SRD import orchestration (already partially in `src/srd/SRDImporter.ts`)

## 2. Second God File: `src/map-views/renderMapView.ts` (12,392 lines)

This is the true monster — **4x larger than main.ts**. It renders the entire battle map canvas. Likely contains:
- Canvas drawing/rendering logic
- Token drag-and-drop
- Wall/door editing
- Fog of war / dynamic lighting
- Context menus
- Grid overlay math

This file alone warrants decomposition into 5-8 smaller modules (renderer, interaction handlers, lighting engine, wall editor, etc.).

## 3. Other Large Files

| File | Lines | Concern |
|---|---|---|
| `src/map-views/PlayerMapView.ts` | 5,256 | Player-facing map projection |
| `src/main.ts` | 3,025 | Plugin core (see above) |
| `src/scene/SceneCreationModal.ts` | 2,277 | Scene creation form |
| `src/encounter/EncounterBuilderModal.ts` | 1,947 | Encounter builder UI |
| `src/encounter/EncounterBuilder.ts` | 1,641 | Encounter logic |
| `src/trap/TrapCreationModal.ts` | 1,583 | Trap creation form |
| `src/combat/CombatTrackerView.ts` | 1,398 | Combat tracker UI |
| `src/character/NPCCreationModal.ts` | 1,362 | NPC creation form |
| `src/character/DndBeyondCharacterImport.ts` | 1,262 | D&D Beyond import parser |
| `src/session/SessionRunDashboardView.ts` | 1,163 | Session run dashboard |
| `src/hexcrawl/HexProcedureModal.ts` | 1,009 | Hexcrawl procedure |
| `src/projection/ProjectionManager.ts` | 994 | Multi-monitor projection |

## 4. Module Coupling

**57 files** import `type DndCampaignHubPlugin from "../main"` — nearly every module depends on the plugin class. This creates a hub-and-spoke dependency where `main.ts` is the central God Object.

**Cross-module dependencies observed:**
- `hexcrawl/` depends on `encounter/`, `map/`, `marker/` — hexcrawl orchestrates encounters + battlemaps
- `combat/` depends on `encounter/` (EncounterCreature type)
- `character/` depends on `marker/` (token definitions), `utils/` (PDF browser)
- `map/` depends on `marker/`, `constants`
- `map-views/` depends on `map/`, `marker/`, `envasset/`, `utils/`, `encounter/`, `combat/`
- Nearly all creation modals depend on `templates`, `migration`, `utils/YamlFrontmatter`

**The plugin object is used as a service locator** — modules reach through it to access `mapManager`, `markerLibrary`, `combatTracker`, `musicPlayer`, etc. This is implicit dependency injection without contracts.

## 5. Type Safety — 500 `: any` Occurrences Across 45 Files

Worst offenders (by count):
| File | `: any` count |
|---|---|
| `map-views/renderMapView.ts` | 126 |
| `map-views/PlayerMapView.ts` | 109 |
| `srd/SRDImporter.ts` | 41 |
| `character/DndBeyondCharacterImport.ts` | 36 |
| `main.ts` | 18 |
| `character/NPCCreationModal.ts` | 15 |
| `trap/TrapCreationModal.ts` | 16 |
| `encounter/EncounterBuilderModal.ts` | 11 |
| `encounter/EncounterBuilder.ts` | 9 |
| `projection/ProjectionManager.ts` | 8 |
| `scene/SceneCreationModal.ts` | 8 |
| `spell/SpellImportModal.ts` | 7 |
| `utils/CreatureModals.ts` | 7 |
| `combat/CombatTrackerView.ts` | 6 |
| `rendering/ViewRenderer.ts` | 6 |

The map rendering files (235 combined `any`) are the primary type safety concern. `SRDImporter.ts` and `DndBeyondCharacterImport.ts` likely use `any` for untyped API responses.

Despite `tsconfig.json` having `"noImplicitAny": true` and `"strict": true`, explicit `: any` annotations bypass these checks.

## 6. Missing Abstractions / Repeated Patterns

### 6a. Creation Modal Pattern (12 modals, no base class)
All 12 `*CreationModal` classes extend `Modal` directly and repeat:
- Constructor accepting `(app, plugin)`
- Form field rendering with `Setting` API
- `onSubmit` creating a file via `vault.create()`
- Frontmatter assembly with `updateYamlFrontmatter()`
- Template version stamping via `TEMPLATE_VERSIONS`

A `BaseEntityCreationModal<T>` could eliminate ~30% of boilerplate per modal.

### 6b. Entity CRUD Commands
In `main.ts`, each entity type (NPC, PC, creature, scene, adventure, trap, item, spell, faction, encounter, poi) has near-identical command patterns:
- `create-X` → opens `XCreationModal`
- `edit-X` → reads frontmatter, opens modal with existing data
- `delete-X` → confirm dialog, delete file + cleanup tokens

This could be driven by a registry: `{ type: "npc", modal: NPCCreationModal, cleanup: [...] }`.

### 6c. renderNoteActions() Switch Statement
The `renderNoteActions()` method is a growing switch over entity `type` strings. Each case creates the same button pattern with different labels/commands. A data-driven approach (map of type -> button configs) would be more maintainable.

### 6d. Plugin-as-Service-Locator
Every module does `this.plugin.mapManager`, `this.plugin.combatTracker`, etc. A proper DI container or at least typed service interfaces would reduce coupling.

## 7. Settings Management

`src/settings/SettingsTab.ts` (241 lines) is clean and well-structured:
- Uses collapsible sections via `addSection()` helper
- Settings are defined in `src/types.ts` as `DndCampaignHubSettings` interface (19 fields)
- Default values in `DEFAULT_SETTINGS` constant
- Settings composed from sub-module defaults (`DEFAULT_MUSIC_SETTINGS`, `DEFAULT_PLAYBACK_STATE`, `DEFAULT_SESSION_PROJECTION_SETTINGS`)
- No validation layer — settings are trusted as-is after load
- Settings serialized directly to disk with `this.saveData()`

**Concern:** Settings grow organically. No schema versioning or migration for settings (only for templates). Adding a new setting field requires updating `DndCampaignHubSettings`, `DEFAULT_SETTINGS`, and `SettingsTab.display()` — but there is no compile-time check that all fields are rendered in the UI.

## 8. Build Configuration

### esbuild.config.mjs
- Single entry point: `src/main.ts`
- Target: `es2018`, CJS format (Obsidian requirement)
- Only `obsidian` is external — everything else is bundled
- Source maps enabled
- Watch mode uses deprecated `onRebuild` callback (esbuild v0.17+ uses `ctx.watch()`)

### tsconfig.json
- Strict mode enabled with good flags: `noImplicitAny`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`
- Missing `outDir` (acceptable since esbuild handles output)
- Missing `declaration: true` — no `.d.ts` generation (fine for a plugin)
- `skipLibCheck: true` — hides type errors in dependencies

### package.json
- Only runtime dependency: `pdf-lib` for PDF parsing
- `obsidian` typed as `"latest"` in devDeps — should be pinned to avoid breaking changes

## 9. CSS / Styling

- `src/styles.css`: **12,837 lines** — this is extremely large for a plugin
- Copied verbatim to `dist/styles.css` and `release/styles.css`
- No CSS modules, no preprocessor, no CSS-in-JS
- All styles are global with `dnd-` prefixed class names (good namespacing)
- The file likely contains styles for every subsystem (maps, combat, hexcrawl, music, settings, modals, etc.)
- Should be split into per-module CSS files and concatenated at build time

## 10. Summary of Top Priorities

1. **Split `renderMapView.ts` (12,392 lines)** — highest impact, worst maintainability risk
2. **Split `main.ts` command registration** — extract ~1,100 lines of commands into a registry
3. **Type the map layer** — 235 `any` annotations in map-views alone
4. **Create a base creation modal** — reduce boilerplate across 12 modal classes
5. **Split `styles.css` (12,837 lines)** — per-module CSS with build concatenation
6. **Type API responses** — `SRDImporter.ts` (41 any) and `DndBeyondCharacterImport.ts` (36 any)
7. **Pin `obsidian` dependency version** in package.json
8. **Update esbuild watch API** — `onRebuild` is deprecated
