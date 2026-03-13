---
applyTo: "src/migration/**"
description: "Migration authoring rules for dnd-campaign-hub template migrations. Use when writing or editing migration logic."
---

# Migration System Architecture

The migration system uses a **registry pattern**. Each migration is a self-contained `MigrationStep` object registered in `src/migration/registry.ts`.

## File Layout

- `types.ts` — `MigrationStep` interface, `TEMPLATE_VERSIONS` constant
- `frontmatter.ts` — Content parsing/manipulation utilities (pure functions)
- `registry.ts` — `MigrationRegistry` class + all migration step definitions in `getAllMigrations()`
- `runner.ts` — `MigrationRunner` (scan, backup, apply, write)
- `MigrationModal.ts` — User-facing migration UI

## Adding a New Migration

1. Open `src/migration/registry.ts` → `getAllMigrations()`.
2. Add a new `MigrationStep` object in the correct entity-type section, sorted by version.
3. Update `TEMPLATE_VERSIONS` in `src/migration/types.ts` to the new target version.
4. Update `template_version` in the template constant in `src/templates.ts` to match.
5. Validate and verify in this order: `npm run check`, `npm run test`, then `npm run build`.

## MigrationStep Contract

```typescript
{
  id: "entity-type-x.y.z",       // Unique ID
  entityTypes: ["npc"],           // Frontmatter type values this applies to
  targetVersion: "x.y.z",        // Version AFTER this migration
  description: "Human-readable",  // Shown in the migration modal
  async apply(ctx) {              // Return modified content, or null for no changes
    // ctx.content    — full file content
    // ctx.frontmatter — parsed key-value pairs
    // ctx.app / ctx.markerLibrary — for side effects
  }
}
```

## Rules

1. **Never lose user data** — migrations only add content, never remove or overwrite existing user sections.
2. **Idempotent** — always check if the change already exists before applying (`content.includes(...)` guards).
3. **Return null for no-op** — if the migration detects nothing needs to change, return `null`.
4. **Pure content transforms** — modify the `ctx.content` string and return the new version. Side effects (token creation) are allowed but should be idempotent.
5. **Single write** — the runner reads the file once, applies all migrations in-memory, writes once. Never call `vault.modify()` inside a migration step.
6. **Incremental** — migrations run in ascending `targetVersion` order. Each step receives the output of the previous one.
7. **`TEMPLATE_VERSIONS`** — keep `src/migration/types.ts` in sync with `template_version` values in `src/templates.ts`.
8. **Use frontmatter utilities** — import helpers from `./frontmatter.ts` (`addFrontmatterField`, `setFrontmatterField`, `replaceDataviewjsBlock`, `insertAfterTitle`).

## dnd-hub Code Blocks

Entity action buttons are rendered by the `dnd-hub` code block processor in the plugin, not by inline dataviewjs. Templates include:

```markdown
\`\`\`dnd-hub
\`\`\`
```

The plugin reads the note's `type` from frontmatter and renders the appropriate buttons at runtime. **No migration is ever needed for button changes** — just update the `renderNoteActions()` method in `main.ts`.
