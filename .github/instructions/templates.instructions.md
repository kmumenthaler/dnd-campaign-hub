---
applyTo: "src/templates.ts"
description: "Template authoring rules for the dnd-campaign-hub plugin. Use when editing or adding template constants."
---

# Template Rules

Every template constant (e.g. `PC_TEMPLATE`, `NPC_TEMPLATE`) follows these rules:

1. **Frontmatter must include `template_version`** — semver string that tracks the template's schema.
2. **When you change a template, increment `template_version`** — patch for cosmetic tweaks, minor for new sections/fields.
3. **After bumping the version here, update `TEMPLATE_VERSIONS`** in `src/migration/MigrationManager.ts` to match.
4. **If the change adds new content sections** (not just frontmatter), add a corresponding migration method in `MigrationManager.ts` so existing notes get updated.
5. **Never remove frontmatter fields** — existing user notes depend on them. Only add new fields with sensible defaults.
6. **Button blocks** use `dataviewjs` fenced code blocks that call `app.commands.executeCommandById(...)`.
