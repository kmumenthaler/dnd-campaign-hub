# Handout Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add handout projection (images, notes, PDFs) as a temporary overlay layer on managed projection screens, with context menu integration throughout Obsidian.

**Architecture:** Two-tier model — primary content (maps, combat, pursuit, idle) persists; handouts overlay temporarily and revert to primary on stop. Single `HandoutProjectionView` handles all three content types. Context menus registered via Obsidian's `file-menu`, `editor-menu`, and DOM events.

**Tech Stack:** TypeScript, Obsidian API (ItemView, Menu, workspace events), esbuild

**Spec:** `docs/superpowers/specs/2026-03-26-handout-projection-design.md`

---

### Task 1: Add Types and Constants

**Files:**
- Modify: `src/projection/types.ts`
- Modify: `src/constants.ts`
- Modify: `src/projection/index.ts`

- [ ] **Step 1: Add HandoutContentType and HandoutProjectionState to types.ts**

Add after the `ManagedScreenStatus` type (line 49):

```ts
/** Content types that can be projected as handouts. */
export type HandoutContentType = 'image' | 'note' | 'pdf';

/** State for a handout projection overlay. */
export interface HandoutProjectionState {
  /** Vault-relative file path. */
  filePath: string;
  /** What kind of content this is. */
  contentType: HandoutContentType;
}
```

- [ ] **Step 2: Add 'handout' to ManagedScreenStatus**

Change:
```ts
export type ManagedScreenStatus = 'idle' | 'map' | 'combat' | 'pursuit' | 'media';
```
To:
```ts
export type ManagedScreenStatus = 'idle' | 'map' | 'combat' | 'pursuit' | 'media' | 'handout';
```

- [ ] **Step 3: Add activeHandout to ManagedScreenState**

Add `activeHandout` field to the `ManagedScreenState` interface:
```ts
export interface ManagedScreenState {
  screen: ScreenInfo;
  config: ManagedScreenConfig;
  status: ManagedScreenStatus;
  mediaPath?: string;
  /** Active handout overlay, null when no handout is showing. */
  activeHandout?: HandoutProjectionState | null;
}
```

- [ ] **Step 4: Add HANDOUT_PROJECTION_VIEW_TYPE to constants.ts**

Add after `MEDIA_PROJECTION_VIEW_TYPE`:
```ts
export const HANDOUT_PROJECTION_VIEW_TYPE = "dnd-handout-projection-view";
```

- [ ] **Step 5: Update index.ts exports**

Add to the type exports:
```ts
export type { HandoutContentType, HandoutProjectionState } from './types';
```

And later add the view export (after Task 2):
```ts
export { HandoutProjectionView } from './HandoutProjectionView';
```

- [ ] **Step 6: Run `npm run check` and fix any errors**

- [ ] **Step 7: Commit**
```bash
git add src/projection/types.ts src/constants.ts src/projection/index.ts
git commit -m "feat: add handout projection types and constants"
```

---

### Task 2: Create HandoutProjectionView

**Files:**
- Create: `src/projection/HandoutProjectionView.ts`
- Modify: `src/projection/index.ts` (add export)

- [ ] **Step 1: Create HandoutProjectionView.ts**

Follow the `IdleScreenView` pattern exactly. The view should:
- Extend `ItemView`
- Use `HANDOUT_PROJECTION_VIEW_TYPE` from `../constants`
- Accept `HandoutProjectionState` via `setState()`
- Store `filePath` and `contentType` as instance fields
- Implement `renderContent()` that switches on `contentType`:
  - `'image'`: Create `<img>` with `this.app.vault.adapter.getResourcePath(filePath)`, class `handout-image`, `object-fit: contain`, black background
  - `'pdf'`: Create `<embed>` with resource path, type `application/pdf`, fills container. Add fallback text div if embed fails to load.
  - `'note'`: Read file content via `this.app.vault.adapter.read(filePath)`, render with `MarkdownRenderer.render(this.app, content, container, filePath, this)`. Style with larger font, scrollable.
- Implement `hideObsidianChrome()` — copy the exact CSS injection pattern from `IdleScreenView` but use id `'dnd-handout-chrome-hide'`
- Register `vault.on('modify')` and `vault.on('delete')` listeners in `onOpen()`, scoped to `this.filePath`:
  - On modify (for notes only): re-render
  - On delete: stop the handout via `plugin.projectionManager.stopHandout(screenKey)` — the view needs to find its own screenKey by checking `plugin.projectionManager` state
- Clean up listeners in `onClose()`

Key imports: `ItemView`, `WorkspaceLeaf`, `MarkdownRenderer` from `'obsidian'`

- [ ] **Step 2: Add export to index.ts**

```ts
export { HandoutProjectionView } from './HandoutProjectionView';
```

- [ ] **Step 3: Run `npm run check` and fix any errors**

- [ ] **Step 4: Commit**
```bash
git add src/projection/HandoutProjectionView.ts src/projection/index.ts
git commit -m "feat: create HandoutProjectionView for images, notes, and PDFs"
```

---

### Task 3: Add Handout Styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add handout projection styles**

Add these styles to `src/styles.css`:

```css
/* ── Handout Projection ─────────────────────────────────── */
.dnd-handout-root {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: #000;
  overflow: hidden;
}

.dnd-handout-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.dnd-handout-content .handout-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.dnd-handout-content .handout-pdf {
  width: 100%;
  height: 100%;
  border: none;
}

.dnd-handout-content .handout-note {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 2rem 4rem;
  font-size: 1.4em;
  line-height: 1.6;
  max-width: 900px;
  margin: 0 auto;
  color: #e0e0e0;
  background: #1a1a1a;
}

.dnd-handout-content .handout-fallback {
  color: #888;
  font-size: 1.2em;
  text-align: center;
  padding: 2rem;
}
```

- [ ] **Step 2: Commit**
```bash
git add src/styles.css
git commit -m "style: add handout projection view styles"
```

---

### Task 4: Extend ProjectionManager with Handout Methods

**Files:**
- Modify: `src/projection/ProjectionManager.ts`

- [ ] **Step 1: Add handoutLeaves map and imports**

Add import for `HANDOUT_PROJECTION_VIEW_TYPE` from `../constants` and `HandoutProjectionState` from `./types`.

Add a new property to the class:
```ts
/** Tracks handout popout leaves for unmanaged screens. */
private handoutLeaves: Map<string, WorkspaceLeaf> = new Map();
```

- [ ] **Step 2: Add projectHandout method**

Add after the existing `projectPursuitView` method:

```ts
/**
 * Project a handout (image, note, or PDF) onto a screen.
 * On managed screens, overlays on top of primary content.
 * On unmanaged screens, opens a new popout.
 */
async projectHandout(
  filePath: string,
  contentType: HandoutContentType,
  screen: ScreenInfo,
): Promise<void> {
  const sKey = screenKey(screen);
  const spm = this.plugin.sessionProjectionManager;
  const isManaged = !!(spm?.isActive() && spm.isManagedScreen(sKey));

  const handoutState: HandoutProjectionState = { filePath, contentType };

  if (isManaged) {
    const leaf = spm.getManagedLeaf(sKey);
    if (!leaf) {
      new Notice('Managed screen not available');
      return;
    }
    spm.setHandoutStatus(sKey, handoutState);
    await this.crossfadeOnLeaf(leaf, HANDOUT_PROJECTION_VIEW_TYPE, handoutState);
  } else {
    // Clean up any existing unmanaged handout on this screen
    const existingLeaf = this.handoutLeaves.get(sKey);
    if (existingLeaf) {
      try { existingLeaf.detach(); } catch { /* already gone */ }
      this.handoutLeaves.delete(sKey);
    }

    const popoutLeaf = this.plugin.app.workspace.openPopoutLeaf({
      size: { width: screen.width, height: screen.height },
    });
    await popoutLeaf.setViewState({
      type: HANDOUT_PROJECTION_VIEW_TYPE,
      active: true,
      state: handoutState,
    });
    this.handoutLeaves.set(sKey, popoutLeaf);

    setTimeout(async () => {
      await this.positionAndFullscreen(popoutLeaf, screen);
    }, 300);
  }

  this._notifyChange();
  const fileName = filePath.split('/').pop() || filePath;
  new Notice(`Projecting: ${fileName}`);
}
```

- [ ] **Step 3: Add stopHandout method**

```ts
/**
 * Stop a handout on a specific screen, reverting to primary content or idle.
 */
async stopHandout(sKey: string): Promise<void> {
  const spm = this.plugin.sessionProjectionManager;
  const isManaged = !!(spm?.isActive() && spm.isManagedScreen(sKey));

  if (isManaged) {
    // Check if there's active primary content to restore
    const primaryProj = this.activeProjections.get(sKey);
    spm.clearHandout(sKey);

    if (primaryProj) {
      // Restore primary content view
      const leaf = spm.getManagedLeaf(sKey);
      if (leaf) {
        const viewType = primaryProj.contentType === 'map'
          ? PLAYER_MAP_VIEW_TYPE
          : primaryProj.contentType === 'combat'
          ? COMBAT_PLAYER_VIEW_TYPE
          : PURSUIT_PLAYER_VIEW_TYPE;
        await this.crossfadeOnLeaf(leaf, viewType, {});
        // Re-setup the primary view state after crossfade
      }
    } else {
      await spm.transitionToIdle(sKey);
    }
  } else {
    const leaf = this.handoutLeaves.get(sKey);
    if (leaf) {
      try { leaf.detach(); } catch { /* already gone */ }
      this.handoutLeaves.delete(sKey);
    }
  }

  this._notifyChange();
  new Notice('Handout stopped');
}

/**
 * Check if a screen has an active handout.
 */
hasActiveHandout(sKey: string): boolean {
  const spm = this.plugin.sessionProjectionManager;
  if (spm?.isActive() && spm.isManagedScreen(sKey)) {
    return spm.hasActiveHandout(sKey);
  }
  return this.handoutLeaves.has(sKey);
}
```

- [ ] **Step 4: Update destroy() to clean up handoutLeaves**

In the `destroy()` method, add cleanup:
```ts
for (const [, leaf] of this.handoutLeaves) {
  try { leaf.detach(); } catch { /* already gone */ }
}
this.handoutLeaves.clear();
```

- [ ] **Step 5: Add handoutLeaves to pruneDeadProjections()**

Add handout leaf pruning alongside existing projection pruning.

- [ ] **Step 6: Run `npm run check` and fix any errors**

- [ ] **Step 7: Commit**
```bash
git add src/projection/ProjectionManager.ts
git commit -m "feat: add projectHandout and stopHandout to ProjectionManager"
```

---

### Task 5: Extend SessionProjectionManager with Handout State

**Files:**
- Modify: `src/projection/SessionProjectionManager.ts`

- [ ] **Step 1: Add imports**

Import `HandoutProjectionState` from `./types`.

- [ ] **Step 2: Add setHandoutStatus method**

Add after `setScreenStatus`:
```ts
/**
 * Track a handout overlay on a managed screen.
 * Called by ProjectionManager.projectHandout().
 */
setHandoutStatus(sKey: string, handout: HandoutProjectionState): void {
  const state = this.screenStates.get(sKey);
  if (!state) return;
  state.status = 'handout';
  state.activeHandout = handout;
  this._notifyChange();
}

/**
 * Clear the handout overlay from a managed screen.
 * Resets status based on what primary content is active.
 */
clearHandout(sKey: string): void {
  const state = this.screenStates.get(sKey);
  if (!state) return;
  state.activeHandout = null;

  // Determine what the status should revert to
  const primaryProj = this.plugin.projectionManager.activeProjections.get(sKey);
  if (primaryProj) {
    state.status = primaryProj.contentType as ManagedScreenStatus;
  } else {
    state.status = 'idle';
  }
  this._notifyChange();
}

/**
 * Check if a managed screen has an active handout overlay.
 */
hasActiveHandout(sKey: string): boolean {
  const state = this.screenStates.get(sKey);
  return !!(state?.activeHandout);
}
```

- [ ] **Step 3: Update transitionToIdle to clear handouts**

In `transitionToIdle()`, add before the crossfade:
```ts
// Clear any active handout
if (state.activeHandout) {
  state.activeHandout = null;
}
```

- [ ] **Step 4: Update stopSession to clear handouts**

In `stopSession()`, the existing `screenStates.clear()` already handles this since it wipes all state.

- [ ] **Step 5: Run `npm run check` and fix any errors**

- [ ] **Step 6: Commit**
```bash
git add src/projection/SessionProjectionManager.ts
git commit -m "feat: add handout state tracking to SessionProjectionManager"
```

---

### Task 6: Register View and Context Menus in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add imports**

Add imports for `HANDOUT_PROJECTION_VIEW_TYPE` from constants and `HandoutProjectionView` from projection.

- [ ] **Step 2: Register the HandoutProjectionView**

Add after the `PURSUIT_PLAYER_VIEW_TYPE` registration (~line 293):
```ts
this.registerView(
  HANDOUT_PROJECTION_VIEW_TYPE,
  (leaf) => new HandoutProjectionView(leaf, this),
);
```

- [ ] **Step 3: Add content type detection helper**

Add a private method or top-level function:
```ts
function detectHandoutContentType(filePath: string): HandoutContentType | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
  const pdfExts = ['pdf'];

  if (imageExts.includes(ext)) return 'image';
  if (pdfExts.includes(ext)) return 'pdf';
  if (ext === 'md') return 'note';
  return null;
}
```

- [ ] **Step 4: Add buildProjectionSubmenu helper**

Create a helper that builds the screen picker submenu for any menu:
```ts
function addProjectionMenuItems(
  plugin: DndCampaignHubPlugin,
  menu: Menu,
  filePath: string,
  contentType: HandoutContentType,
): void {
  const spm = plugin.sessionProjectionManager;
  const pm = plugin.projectionManager;

  if (spm?.isActive()) {
    // Add managed screens
    for (const state of spm.getAllScreenStates()) {
      const sKey = state.config.screenKey;
      const label = state.config.screenLabel;

      menu.addItem((item) =>
        item
          .setTitle(`Project to ${label}`)
          .setIcon('monitor')
          .onClick(async () => {
            await pm.projectHandout(filePath, contentType, state.screen);
          })
      );
    }

    // Add separator + stop items for screens with active handouts
    let hasHandouts = false;
    for (const state of spm.getAllScreenStates()) {
      if (state.activeHandout) {
        if (!hasHandouts) {
          menu.addSeparator();
          hasHandouts = true;
        }
        const sKey = state.config.screenKey;
        menu.addItem((item) =>
          item
            .setTitle(`Stop handout on ${state.config.screenLabel}`)
            .setIcon('x')
            .onClick(async () => {
              await pm.stopHandout(sKey);
            })
        );
      }
    }
  }
}
```

- [ ] **Step 5: Register file-menu event (file explorer + tab headers)**

In `onload()`, add:
```ts
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    if (!(file instanceof TFile)) return;
    const contentType = detectHandoutContentType(file.path);
    if (!contentType) return;
    if (!this.sessionProjectionManager?.isActive()) return;

    menu.addSeparator();
    addProjectionMenuItems(this, menu, file.path, contentType);
  })
);
```

- [ ] **Step 6: Register editor-menu event**

```ts
this.registerEvent(
  this.app.workspace.on('editor-menu', (menu, editor, view) => {
    const file = view.file;
    if (!file) return;
    if (!this.sessionProjectionManager?.isActive()) return;

    menu.addSeparator();
    addProjectionMenuItems(this, menu, file.path, 'note');
  })
);
```

- [ ] **Step 7: Register inline image context menu**

```ts
this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
  const target = evt.target as HTMLElement;
  if (!(target instanceof HTMLImageElement)) return;

  // Only handle images inside markdown preview
  const previewContainer = target.closest('.markdown-preview-view, .markdown-reading-view');
  if (!previewContainer) return;
  if (!this.sessionProjectionManager?.isActive()) return;

  // Extract vault file path from the image src
  const src = target.getAttribute('src') || '';
  // Try to find the vault file by matching resource paths
  const allFiles = this.app.vault.getFiles();
  const imageFile = allFiles.find(f => {
    const ext = f.extension.toLowerCase();
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return false;
    const resourcePath = this.app.vault.adapter.getResourcePath(f.path);
    return src.includes(f.path) || src === resourcePath;
  });

  if (!imageFile) return;

  evt.preventDefault();
  const menu = new Menu();
  addProjectionMenuItems(this, menu, imageFile.path, 'image');
  menu.showAtMouseEvent(evt);
});
```

- [ ] **Step 8: Run `npm run check` and fix any errors**

- [ ] **Step 9: Run `npm run test` and fix any failures**

- [ ] **Step 10: Run `npm run build`**

- [ ] **Step 11: Commit**
```bash
git add src/main.ts
git commit -m "feat: register HandoutProjectionView and context menus for handout projection"
```

---

### Task 7: Integration Testing and Deploy

**Files:**
- No new files

- [ ] **Step 1: Run full validation**
```bash
npm run check && npm run test && npm run build
```

- [ ] **Step 2: Deploy to test vault**
```powershell
$dest = "C:\Users\kevin\SynologyDrive\Obsidian Vault\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub"
Copy-Item -Path "dist\main.js" -Destination $dest -Force
Copy-Item -Path "manifest.json" -Destination $dest -Force
Copy-Item -Path "src\styles.css" -Destination $dest -Force
```

- [ ] **Step 3: Final commit if any fixes were needed**
