# Task Plan — Codebase Health

> Full audit details: [tasks/codebase-audit.md](codebase-audit.md)

---

## Phase 1: Security & Stability (do first — user-facing risk)

- [ ] **Sanitize all innerHTML usage (XSS)** — 7+ files interpolate user content directly into `innerHTML` without escaping. Replace with `textContent`, `createEl()`, or a sanitizer. Files: `renderMapView.ts`, `ViewRenderer.ts`, `EncounterBuilderModal.ts`, `SceneCreationModal.ts`, `PartyManagerModal.ts`, `MapCreationModal.ts`, `EncounterBattlemapModal.ts`
- [ ] **Add error handling to FreesoundClient.search()** — `search()` has zero try-catch; network failure crashes the plugin. Add try-catch + user Notice. File: `src/music/FreesoundClient.ts:50-65`
- [ ] **Surface DndBeyond import errors to users** — 23 `console.error` calls but no user-facing feedback. Add Notice on failure. File: `src/character/DndBeyondCharacterImport.ts`
- [ ] **Fix silent error swallowing** — `MapPersistence.ts` silently skips corrupt JSON (lines 50,73,86), `SRDApiClient.ts` batch fetch silently drops failed monsters (line 152), `migration/runner.ts` swallows all folder-creation exceptions (lines 237-240). Add logging or user feedback.
- [ ] **Pin `obsidian` dependency version** — Currently `"latest"`, making builds non-reproducible. Pin to a specific version in `package.json`.

## Phase 2: Test Foundation (do before any refactoring)

- [ ] **Add tests for API clients** — `SRDApiClient`, `FreesoundClient`, `DndBeyondCharacterImport` have zero tests. Cover happy path + error/network failure cases.
- [ ] **Add tests for MapPersistence** — Save/load/corrupt-data paths are untested.
- [ ] **Add tests for CombatTracker core logic** — Only 1 test file exists; expand coverage for initiative, rounds, HP tracking.
- [ ] **Add tests for MusicPlayer** — Test file exists but needs expanded coverage for playback, layering, scene transitions.
- [ ] **Add tests for command handlers** — Extract and test the core logic behind the 60+ commands in `main.ts`.

## Phase 3: Quick Wins (low effort, high value)

- [ ] **Fix deprecated esbuild `onRebuild` watch API** — Migrate to current watch API in `esbuild.config.mjs`.
- [ ] **Extract magic numbers to named constants** — Debounce timers (100ms, 200ms, 2000ms), Notice durations (5000ms, 8000ms, 10000ms). File: `src/main.ts` + others.
- [ ] **Use `registerDomEvent()` instead of raw `addEventListener`** — 2 instances in `main.ts` (lines 1648, 2614) bypass Obsidian's auto-cleanup.
- [ ] **Add input validation to creation modals** — File name validation, string length limits, numeric bounds. All `*CreationModal.ts` files.
- [ ] **Add ESLint configuration** — No linter exists. Add ESLint with TypeScript plugin to catch `any` types, unused vars, and unsafe patterns automatically.

## Phase 4: Architecture — Decompose God Files

- [ ] **Extract command registration from main.ts** — Move 60+ inline command lambdas (~1,100 lines) into per-subsystem command modules (e.g. `src/commands/characterCommands.ts`). Biggest single reduction in main.ts size.
- [ ] **Extract note action rendering from main.ts** — Move `renderNoteActions()` and related button logic to a dedicated module.
- [ ] **Extract event handlers from main.ts** — Move vault-event listeners (file rename, delete, metadata change) to a dedicated event handler module.
- [ ] **Create BaseEntityCreationModal** — 12 creation modals repeat identical patterns. Extract a base class with constructor → form → frontmatter → file-creation flow.
- [ ] **Decompose renderMapView.ts (12,392 lines)** — Split into: canvas rendering, token management, grid/overlay, lighting/fog, wall collisions, drag-drop/interaction, zoom/pan. This is the largest file in the codebase.
- [ ] **Split styles.css (12,837 lines)** — Break into per-component CSS files or adopt CSS modules. Import from a central index.

## Phase 5: Type Safety & Coupling

- [ ] **Type API response interfaces** — Replace `any` with typed interfaces for SRD API, DndBeyond, and Freesound responses. Files: `SRDImporter.ts` (41 any), `DndBeyondCharacterImport.ts` (36 any), `FreesoundClient.ts`.
- [ ] **Type map system internals** — `renderMapView.ts` (170+ any) and `PlayerMapView.ts` (65+ any) are the worst offenders.
- [ ] **Reduce plugin-class coupling** — 57 files import the plugin directly. Introduce interface contracts or a lightweight DI pattern so subsystems depend on abstractions.
- [ ] **Add settings schema versioning** — Templates have migration versioning but settings don't. Add version tracking to prevent silent data loss on settings shape changes.

## Phase 6: Robustness Hardening

- [ ] **Add crash-safe save flushing** — Current debounced saves are lost if the plugin crashes before the timer fires. Consider `requestIdleCallback` or more frequent interim flushes.
- [ ] **Auto-cleanup migration backups** — Backup folder grows indefinitely. Add a retention policy (e.g. keep last 5 or auto-delete after 30 days).
- [ ] **Add partial recovery to scene creation** — `Promise.all` on creature loads means one failure kills the entire scene. Switch to `Promise.allSettled` with per-creature error reporting.
- [ ] **Prevent debounce timer leaks** — Verify `_pendingSaves` timers are all cleared during `onunload()`, including edge cases.

---

## Review
<!-- Fill in after completing phases -->
