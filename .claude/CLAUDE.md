# dnd-campaign-hub

An Obsidian plugin for D&D campaign management. TypeScript codebase built with esbuild. All plugin logic lives in `src/main.ts` (~25,000 lines); templates in `src/templates.ts`; migration system in `src/migration/`.

## Commands

```bash
npm run check   # TypeScript strict typecheck — run first
npm run test    # Vitest unit tests
npm run build   # esbuild → dist/main.js
```

Deploy to test vault (PowerShell):
```powershell
$dest = "C:\Users\kevin\SynologyDrive\Obsidian Vault\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub"
Copy-Item -Path "dist\main.js" -Destination $dest -Force
Copy-Item -Path "manifest.json" -Destination $dest -Force
Copy-Item -Path "src\styles.css" -Destination $dest -Force
```

After deploy, reload in Obsidian: Ctrl+P → "Reload app without saving".

## Development Workflow

For every feature or fix, follow this sequence — do not skip steps:

1. **Plan** — Identify affected files, design the approach.
2. **Implement** — Write maintainable, future-proof code.
3. **Validate** — `npm run check` — fix all TypeScript errors.
4. **Test** — `npm run test` — fix all failing tests.
5. **Build** — `npm run build`.
6. **Deploy** — Copy artifacts to test vault (see above).
7. **Commit** — Conventional commit message (see below).
8. **Inform** — Tell the user what changed and how to test it in Obsidian.

## Commit Format

```
feat: short description

- Bullet point details
- Another detail
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`, `test`.

## Template System Rules

Templates are constants in `src/templates.ts` (e.g. `NPC_TEMPLATE`, `PC_TEMPLATE`). Each has a `template_version` frontmatter field.

When modifying a template, you must update **three places**:

1. **`src/templates.ts`** — Increment `template_version` (patch for cosmetic, minor for new sections/fields).
2. **`src/migration/types.ts`** — Update `TEMPLATE_VERSIONS` to match the new version.
3. **`src/migration/registry.ts`** — Add a `MigrationStep` in `getAllMigrations()` if the change adds new content sections (not needed for button changes).

Never remove frontmatter fields — existing user notes depend on them. Only add new fields with sensible defaults.

**Entity action buttons** use `dnd-hub` code blocks, not inline dataviewjs:
```markdown
```dnd-hub
```
```
The plugin's `renderNoteActions()` in `main.ts` renders buttons dynamically by `type` frontmatter. To add/change buttons, edit only `renderNoteActions()` — no template or migration change needed.

## Migration System Rules

File layout in `src/migration/`:
- `types.ts` — `MigrationStep` interface, `TEMPLATE_VERSIONS` constant
- `frontmatter.ts` — Pure content parsing/manipulation utilities
- `registry.ts` — `MigrationRegistry` + all `MigrationStep` definitions in `getAllMigrations()`
- `runner.ts` — `MigrationRunner` (scan, backup, apply, write)
- `MigrationModal.ts` — User-facing migration UI

`MigrationStep.apply()` contract:
- Receives full file content as string, returns modified string or `null` to skip (no-op).
- Must be **idempotent**: check if the change already exists before applying.
- Must call `setFrontmatterField(content, "template_version", targetVersion)` as the last step.
- Use helpers from `frontmatter.ts` — never use the Obsidian API inside a migration step.
- Never call `vault.modify()` inside a step — the runner handles all file I/O.
- Migrations run in ascending `targetVersion` order; each step receives the output of the previous.

Rules:
1. **Never lose user data** — only add content, never remove or overwrite user sections.
2. **Idempotent** — guard with `content.includes(...)` before inserting.
3. **Return null for no-op** — if nothing needs to change, return `null`.

## Cross-System Integration

When a feature requires one system to read or manipulate another system's data, do not reach directly into that system's internals or create ad-hoc workarounds. Instead:

1. **Design a Controller/API layer** — a typed class that owns the interface (e.g. `MapController`).
2. **Use a registration pattern** — the owning system registers a handle when active, unregisters on teardown. Consumers never hold direct references to closure-scoped variables.
3. **Keep side-effects inside the API layer** — not in the caller.
4. **Attach the controller to the plugin** — as a property on `DndCampaignHubPlugin` so any system can access it through the plugin reference.

Existing controllers:
- `MapController` (`src/map/MapController.ts`) — query and manipulate the active battle map.

## Code Hygiene

When you encounter deprecated or duplicated code, analyze context to confirm it is safe to remove, then clean it up.

## Constraints

- Do NOT skip `npm run check`, `npm run test`, or `npm run build` before deploying.
- Do NOT deploy untested code.
- Do NOT remove user data during migrations.
- Do NOT commit without a meaningful conventional commit message.
- Do NOT use `vault.modify()` inside migration steps.
- Do NOT use inline dataviewjs blocks for entity action buttons.
