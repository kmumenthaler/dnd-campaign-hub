# Codebase Audit — dnd-campaign-hub

**Date:** 2026-03-19
**Version:** 0.6.1
**Codebase:** ~120 TypeScript files, ~25,000+ total lines

---

## Issues Table (Most → Least Critical)

| # | Severity | Category | Issue | Details | Affected Files | Effort |
|---|----------|----------|-------|---------|----------------|--------|
| 1 | **CRITICAL** | Security | **innerHTML used without sanitization (XSS)** | 7+ files interpolate user-provided content (frontmatter, note titles, creature descriptions) directly into `innerHTML`. If a vault contains malicious markdown/frontmatter, arbitrary JS could execute. | `renderMapView.ts`, `ViewRenderer.ts`, `EncounterBuilderModal.ts`, `SceneCreationModal.ts`, `PartyManagerModal.ts`, `MapCreationModal.ts`, `EncounterBattlemapModal.ts` | Medium |
| 2 | **CRITICAL** | Architecture | **God file: `renderMapView.ts` — 12,392 lines** | Single file handles ALL map rendering logic: canvas drawing, token management, grid overlay, lighting, fog of war, wall collisions, drag/drop, zoom, etc. Nearly impossible to maintain, test, or review. 235 `any` types inside. | `src/map-views/renderMapView.ts` | Very High |
| 3 | **CRITICAL** | Architecture | **God file: `main.ts` — 3,025 lines, 207 methods** | Single plugin class handles 7+ distinct concerns: view registration, 60+ command registrations (~1,100 lines), code block processors, file event handlers, note action rendering, SRD imports, lifecycle management. Classic God Object. | `src/main.ts` | Very High |
| 4 | **CRITICAL** | Testing | **Near-zero test coverage** | Only 6 test files exist — all in migration/utility layer. Zero tests for: 46 modals, 3 API clients, map system, combat tracker, encounter builder, music player logic, session management, party manager. Any refactoring is high-risk without tests. | `tests/` (only 6 files) | Very High |
| 5 | **HIGH** | Robustness | **FreesoundClient: zero error handling on `search()`** | `search()` method makes a network request with NO try-catch. Any network failure will throw an unhandled exception and crash the calling code. No user notification on API errors. API token passed in URL params. | `src/music/FreesoundClient.ts:50-65` | Low |
| 6 | **HIGH** | Type Safety | **500 `any` type annotations across 45 files** | Defeats TypeScript's purpose. Worst offenders: `renderMapView.ts` (170+), `PlayerMapView.ts` (65+), `SRDImporter.ts` (41), `DndBeyondCharacterImport.ts` (36), `main.ts` (24). Many are untyped API responses and closure variables. | 45 files across codebase | High |
| 7 | **HIGH** | Robustness | **Silent error swallowing in critical paths** | Multiple catch blocks discard errors: `MapPersistence.ts` silently skips corrupt JSON, `main.ts` silently ignores cleanup failures, `SRDApiClient.ts` batch fetch silently skips failed monsters without notifying callers. | `MapPersistence.ts:50,73,86`, `main.ts:1562-1572`, `SRDApiClient.ts:152` | Medium |
| 8 | **HIGH** | Architecture | **Plugin class as service locator (57 direct imports)** | 57 files import the plugin class directly. It acts as a global service locator with no dependency injection contracts. Every subsystem reaches into the plugin for dependencies, creating tight coupling and making isolated testing impossible. | All subsystem files | Very High |
| 9 | **HIGH** | Maintainability | **`styles.css` — 12,837 lines, no splitting** | Single monolithic CSS file with no preprocessing, no CSS modules, no splitting by component. Makes it hard to find styles, creates specificity conflicts, and grows unboundedly. | `src/styles.css` | High |
| 10 | **HIGH** | Robustness | **DndBeyondCharacterImport: errors logged but never shown** | 23 `console.error` calls but zero user-facing error dialogs. Users see no feedback when imports fail. No rate limiting on API calls. | `src/character/DndBeyondCharacterImport.ts` | Low |
| 11 | **MEDIUM** | Architecture | **12 creation modals duplicate identical patterns** | All extend `Modal` directly with the same constructor → form rendering → frontmatter assembly → file creation pattern. A `BaseEntityCreationModal` would eliminate ~40% of boilerplate per modal. | `src/character/PCCreationModal.ts`, `NPCCreationModal.ts`, `CreatureCreationModal.ts`, `FactionCreationModal.ts`, `ItemCreationModal.ts`, `TrapCreationModal.ts`, `SceneCreationModal.ts`, `SessionCreationModal.ts`, `AdventureCreationModal.ts`, `MapCreationModal.ts`, `PoiModals.ts`, `CampaignCreationModal.ts` | Medium |
| 12 | **MEDIUM** | Robustness | **Input validation weak to nonexistent in modals** | Most creation modals accept user input without validation or sanitization. File names not validated before vault writes. No length limits on string fields. No bounds checking on numeric inputs. | All `*CreationModal.ts` files | Medium |
| 13 | **MEDIUM** | Data Safety | **Debounced saves can lose data on crash** | `main.ts` uses a `_pendingSaves` Map with debounced timers. If the plugin crashes or Obsidian force-closes before the debounce fires, recent map/state changes are lost. `_flushAllPendingSaves()` only runs on clean unload. | `src/main.ts:212` | Medium |
| 14 | **MEDIUM** | Robustness | **Migration backup folder grows indefinitely** | Backups are created before migrations but never automatically cleaned up. Over time the backup folder can grow to significant size. A cleanup option exists but isn't auto-called. | `src/migration/runner.ts:80-97,180` | Low |
| 15 | **MEDIUM** | Architecture | **60+ commands registered inline in main.ts (~1,100 lines)** | Command definitions are inline lambda functions, not delegated to subsystem managers. This is the single biggest contributor to main.ts size. Each entity type repeats the same CRUD command pattern. | `src/main.ts` | High |
| 16 | **MEDIUM** | Robustness | **Scene creation: `Promise.all` with no partial recovery** | If any creature load fails in `SceneCreationModal`, the entire scene creation fails. No partial recovery or error reporting per-creature. | `src/scene/SceneCreationModal.ts:106` | Low |
| 17 | **MEDIUM** | Build | **`obsidian` dependency pinned to `"latest"`** | Using `"latest"` means builds are non-reproducible. A breaking change in the Obsidian API could silently break the plugin on any `npm install`. Should be pinned to a specific version. | `package.json` | Trivial |
| 18 | **MEDIUM** | Build | **esbuild uses deprecated `onRebuild` watch API** | The `onRebuild` callback in the esbuild config is deprecated. Should migrate to the current watch API. | `esbuild.config.mjs` | Low |
| 19 | **LOW** | Code Quality | **Magic numbers without named constants** | Debounce timers (100ms, 200ms, 2000ms), Notice durations (5000ms, 8000ms, 10000ms), volume multipliers, and other numeric literals scattered without constants. Inconsistent Notice durations across the codebase. | `main.ts:1114,1234,2675,1612,2951,2953` | Low |
| 20 | **LOW** | Code Quality | **58 `new Notice` calls in main.ts alone (606 total)** | While most are contextual user feedback, the sheer volume suggests some could be consolidated or made configurable. Some have inconsistent duration values. | `src/main.ts` + many others | Low |
| 21 | **LOW** | Robustness | **`addEventListener` without guaranteed cleanup** | 2 instances in `main.ts` use raw `addEventListener` on DOM elements (button click line 1648, status bar line 2614). Cleanup depends on callbacks being invoked rather than Obsidian's `registerDomEvent()` pattern. | `src/main.ts:1648,2614` | Trivial |
| 22 | **LOW** | Architecture | **No settings schema versioning** | Templates have migration versioning, but plugin settings have none. If settings shape changes, existing user settings could break or silently lose values. | `src/settings/SettingsTab.ts` | Medium |
| 23 | **LOW** | Code Quality | **No ESLint or linting configuration** | No `.eslintrc`, `eslint.config.*`, or similar found. Consistent code style relies entirely on developer discipline. A linter would catch many of the `any` types, unused variables, and unsafe patterns automatically. | Project root | Medium |
| 24 | **LOW** | Robustness | **Migration runner: folder creation swallows all exceptions** | Line 237-240 catches "Folder already exists" but the catch block swallows ALL vault errors, not just the expected one. | `src/migration/runner.ts:237-240` | Trivial |

---

## Summary by Severity

| Severity | Count | Key Theme |
|----------|-------|-----------|
| **CRITICAL** | 4 | XSS vulnerability, god files (2), no test coverage |
| **HIGH** | 6 | Type safety (500 `any`), silent errors, tight coupling, CSS monolith, unhandled API errors |
| **MEDIUM** | 8 | Duplicated patterns, missing validation, data loss risk, build config issues |
| **LOW** | 6 | Magic numbers, Notice volume, lint config, settings versioning |

## Recommended Attack Order

1. **Security first** — Sanitize all innerHTML usage (issue #1)
2. **Add tests before refactoring** — You cannot safely refactor god files without test coverage (issue #4)
3. **Fix unhandled errors** — FreesoundClient crash, DndBeyond silent failures (issues #5, #7, #10)
4. **Pin obsidian dependency** — Trivial effort, prevents surprise breakage (issue #17)
5. **Extract command registration** from main.ts — Biggest bang-for-buck refactor (issue #15)
6. **Decompose renderMapView.ts** — Largest/most complex file in the codebase (issue #2)
7. **Type the `any`s** — Start with API response types for SRD/DndBeyond/Freesound (issue #6)
8. **Add ESLint** — Catches future issues automatically (issue #23)
