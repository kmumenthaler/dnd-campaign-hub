---
applyTo: "src/templates.ts"
description: "Template authoring rules for the dnd-campaign-hub plugin. Use when editing or adding template constants."
---

# Template Rules

Every template constant (e.g. `PC_TEMPLATE`, `NPC_TEMPLATE`) follows these rules:

1. **Frontmatter must include `template_version`** — semver string that tracks the template's schema.
2. **When you change a template, increment `template_version`** — patch for cosmetic tweaks, minor for new sections/fields.
3. **After bumping the version here, update `TEMPLATE_VERSIONS`** in `src/migration/types.ts` to match.
4. **If the change adds new content sections** (not just frontmatter), add a corresponding migration step in `src/migration/registry.ts` → `getAllMigrations()` so existing notes get updated.
5. **Never remove frontmatter fields** — existing user notes depend on them. Only add new fields with sensible defaults.
6. **Action buttons use `dnd-hub` code blocks** — a single ` ```dnd-hub\n``` ` block in each entity template. The plugin renders buttons dynamically based on the note's `type` via `renderNoteActions()` in `main.ts`. **Do NOT use inline dataviewjs button blocks for entity actions.**
7. **To add/change buttons**, edit `renderNoteActions()` in `main.ts` — no template or migration change is needed.
8. **Before build/deploy after template changes**, run `npm run check`, `npm run test`, then `npm run build`.
