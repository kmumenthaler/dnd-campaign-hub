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

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake from recurring
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `tasks/lessons.md` at session start for relevant lessons

### 4. Verification Before Done
Use the `superpowers:verification-before-completion` skill before claiming any task is complete.
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

### BLOCKED commands — do NOT attempt these

#### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

#### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

#### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

### REDIRECTED tools — use sandbox equivalents

#### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

#### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

#### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

### Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

### Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

### Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

### ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
