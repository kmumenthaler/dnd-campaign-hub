# Handout Projection System Design

**Date:** 2026-03-26
**Status:** Approved

## Summary

Upgrade the projection system to allow the GM to project images, notes, and PDFs to external monitors. Handouts are a temporary overlay layer on top of primary content (battle maps, combat tracker, pursuit tracker). Stopping a handout reverts to the active primary content, or idle if no primary is active. Context menus provide projection options throughout the Obsidian UI.

## Two-Tier Projection Model

### Primary Content (persistent, owns the screen)
- Battle Map
- Combat/Initiative Tracker
- Pursuit Tracker
- Idle Screen
- Media

These transition between each other as they do today. No changes to existing behavior.

### Handout Content (temporary overlay)
- Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`)
- PDFs (`.pdf`)
- Notes (`.md`)

Projected on top of primary content. Stopping a handout reverts to primary. Projecting a new handout replaces the current one (no stacking).

## Data Model

### New Types (`src/projection/types.ts`)

```ts
type HandoutContentType = 'image' | 'note' | 'pdf';

interface HandoutProjectionState {
  filePath: string;          // vault-relative path
  contentType: HandoutContentType;
}
```

Note: `displayName` is not stored — it is computed from `filePath` via `basename()` at render time to avoid sync issues.

### Extended `ManagedScreenStatus`

Add `'handout'` to the existing union type:

```ts
type ManagedScreenStatus = 'idle' | 'map' | 'combat' | 'pursuit' | 'media' | 'handout';
```

### Extended `ManagedScreenState`

```ts
interface ManagedScreenState {
  // ... existing fields
  activeHandout?: HandoutProjectionState | null;
}
```

### No `primarySnapshot` — Read Live State Instead

When stopping a handout, the system reads the current primary state directly from `ProjectionManager.activeProjections.get(sKey)` rather than maintaining a parallel snapshot. This avoids stale-state bugs when primary content changes while a handout is showing.

The `activeProjections` entry for a screen is **not removed** when a handout is projected — it remains as the "underlying" primary record. Only the leaf's view is swapped via `crossfadeOnLeaf`. This means `activeProjections` always reflects the primary content, and the handout is tracked separately via `ManagedScreenState.activeHandout`.

### Content Type Detection

By file extension:
- `image`: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`
- `pdf`: `.pdf`
- `note`: `.md`

### New View Type Constant (`src/constants.ts`)

```ts
export const HANDOUT_PROJECTION_VIEW_TYPE = "dnd-handout-projection-view";
```

Follows the established convention — all `VIEW_TYPE` constants live in `src/constants.ts`.

## HandoutProjectionView

**New file:** `src/projection/HandoutProjectionView.ts`

An Obsidian `ItemView` registered via `this.registerView()` in `main.ts` `onload()`, following the same pattern as `IdleScreenView` and all other plugin views.

### Image Rendering
- Fullscreen-fitted `<img>` element via `vault.adapter.getResourcePath(filePath)`
- CSS: `object-fit: contain`, centered, black background
- Same approach as `IdleScreenView` image mode

### PDF Rendering
- `<embed>` element pointing to the `app://` resource URI from `vault.adapter.getResourcePath()`
- Fills the container entirely
- Fallback styled message if rendering fails
- **Risk note:** Obsidian's CSP in Electron should allow `app://` URIs in `<embed>`, but this has no codebase precedent for PDFs. Must be tested early as a potential blocker. If CSP blocks it, fallback to opening the PDF in a standard Obsidian leaf within the popout.

### Note Rendering
- Obsidian's `MarkdownRenderer.render()` in read-only preview mode
- Scrollable container with presentation-friendly styling (larger font ~1.4em, padded, dark background)
- Re-renders on file change via `vault.on('modify')` listener — **scoped to only re-render when the modified file matches `this.state.filePath`**

### Common Behavior
- `setState()` / `getState()` for `HandoutProjectionState` (calls `super.setState()`)
- `hideObsidianChrome()` — same CSS injection pattern as `IdleScreenView`
- `onClose()` cleans up event listeners and DOM elements

## ProjectionManager Changes

### New: `handoutLeaves: Map<string, WorkspaceLeaf>`

Tracks handout leaves for **unmanaged screens** (no active session). Keyed by `screenKey`. This allows `stopHandout` to find and detach the leaf when there is no `SessionProjectionManager` managing it.

For managed screens, the handout reuses the managed leaf (same as how `project()` reuses managed leaves today), so no additional tracking is needed.

### New Method: `projectHandout(filePath, contentType, screen)`

1. Determine `screenKey` from screen
2. If managed screen (session active): `crossfadeOnLeaf()` to `HANDOUT_PROJECTION_VIEW_TYPE` with `HandoutProjectionState`
3. If unmanaged screen: open new popout leaf, set view state, position and fullscreen. Store leaf in `handoutLeaves`.
4. Call `sessionProjectionManager.setHandoutStatus(sKey, handoutState)` (updates status to `'handout'`, stores `activeHandout`)

### New Method: `stopHandout(screenKey)`

1. Check if managed screen:
   - **Managed:** Read primary state from `this.activeProjections.get(sKey)`
     - If active primary exists (map, combat, pursuit, media): `crossfadeOnLeaf()` back to that primary's view type and state
     - If no active primary: `sessionProjectionManager.transitionToIdle(sKey)`
   - **Unmanaged:** Detach the leaf from `handoutLeaves` and remove the entry
2. Call `sessionProjectionManager.clearHandout(sKey)` (resets status, clears `activeHandout`)

### No Changes to Existing Methods

`project()`, `projectCombatView()`, `projectPursuitView()`, `stopProjectionOnScreen()` remain as-is. The handout layer is parallel, not interleaved.

## SessionProjectionManager Changes

### New Methods

- `setHandoutStatus(sKey, handoutState)` — sets `status` to `'handout'`, sets `activeHandout` on the screen state, fires `_notifyChange()`. Uses the existing `setScreenStatus()` channel — does **not** bypass it.
- `clearHandout(sKey)` — clears `activeHandout`, resets `status` to the value matching the current `activeProjections` entry (or `'idle'`), fires `_notifyChange()`
- `hasActiveHandout(sKey): boolean` — convenience check for UI/menu state

### Existing Method Impact

- `transitionToIdle(sKey)` — clears active handout first if present
- `stopSession()` — clears all handouts during teardown
- `onChange()` now includes handout state for `SessionProjectionHubModal` awareness

### Key Invariant

Primary content is tracked via `ProjectionManager.activeProjections` and is never modified by handout operations. The handout layer only changes the leaf's visible view — the primary record stays intact for restoration.

## Context Menu Integration

Registered in `src/main.ts` `onload()`:

### 1. File Explorer Context Menu
`this.registerEvent(this.app.workspace.on('file-menu', ...))`
- Checks file extension for supported types (image/pdf/md)
- Adds "Project to..." with screen picker submenu
- Also fires for tab header right-clicks — Obsidian passes the `TFile`

### 2. Editor Context Menu
`this.registerEvent(this.app.workspace.on('editor-menu', ...))`
- Adds "Project this note..." with screen picker submenu

### 3. Inline Image Context Menu
DOM `contextmenu` event registered on workspace container:
- Checks if click target is an `<img>` element inside a `.markdown-preview-view` or `.markdown-reading-view`
- **Path resolution:** Extract the `src` attribute (an `app://` resource URI). Match it against vault files by comparing `vault.adapter.getResourcePath(file.path)` output for image files. Cache the mapping on first build and invalidate on vault file create/delete events for performance.
- Shows `new Menu()` with screen picker submenu

### Menu Structure
```
Project to →
  ├── Screen 1 (LG Monitor)
  ├── Screen 2 (TV)
  └── ─────────────────────
  └── Stop Handout on Screen 1  (only when handout active on that screen)
  └── Stop Handout on Screen 2  (only when handout active on that screen)
```

## Styling (`src/styles.css`)

- `.handout-projection-container` — fullscreen black background, flex centered
- `.handout-image` — `object-fit: contain`, `max-width/max-height: 100%`
- `.handout-pdf` — `width: 100%`, `height: 100%`, no border
- `.handout-note` — padded, ~1.4em font, max-width for readability, scrollable, dark background

## Edge Cases

1. **File deleted while projected** — `vault.on('delete')` listener checks if deleted file matches active handout's `filePath`, auto-stops handout, reverts to primary/idle
2. **Session stopped while handout active** — `stopSession()` clears handouts first, then tears down leaves
3. **Handout on screen with no session** — works as unmanaged popout via `handoutLeaves` map, stopping detaches leaf
4. **New handout replaces active handout** — crossfade replacement, `activeProjections` entry untouched (primary preserved)
5. **Primary content changes while handout showing** — `activeProjections` is updated by the normal `project()`/`projectCombatView()` flow. Handout stays visible. When stopped, restoration reads the now-current `activeProjections` entry, getting the latest primary.
6. **Note with `dnd-hub` blocks** — rendered in preview mode, action buttons won't be interactive (acceptable for display-only projection)
7. **Media status restoration** — `stopHandout` checks all primary statuses including `'media'`, not just map/combat/pursuit
