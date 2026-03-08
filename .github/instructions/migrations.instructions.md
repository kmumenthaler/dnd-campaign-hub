---
applyTo: "src/migration/**"
description: "Migration authoring rules for dnd-campaign-hub template migrations. Use when writing or editing migration logic."
---

# Migration Rules

1. **Never lose user data** — migrations only add content, never remove or overwrite existing sections.
2. **Check before inserting** — always verify the new content doesn't already exist in the file before inserting it (use `content.includes(...)` guards).
3. **Update version last** — only call `updateTemplateVersion(file, "x.y.z")` after the migration logic succeeds.
4. **Incremental upgrades** — migrations must work step-by-step from any prior version (e.g. 1.0.0 → 1.1.0 → 1.2.0). Never skip intermediate steps.
5. **Wire up in `migrateFile()`** — every new migration method must be called from `migrateFile()` with a `compareVersions(currentVersion, "x.y.z") < 0` guard.
6. **`TEMPLATE_VERSIONS`** — keep this map in sync with the `template_version` values in `src/templates.ts`.
7. **Log progress** — use `console.log(...)` at the start and end of each migration method for debuggability.
