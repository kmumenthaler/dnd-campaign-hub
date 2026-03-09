# Get started

This guide walks you through installing D&D Campaign Hub and setting up your first campaign.

## Install the plugin

### From community plugins (recommended)

1. Open **Settings** → **Community plugins** → **Browse**.
2. Search for **D&D Campaign Hub**.
3. Select **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/kmumenthaler/dnd-campaign-hub/releases).
2. Create a folder called `dnd-campaign-hub` inside your vault's `.obsidian/plugins/` folder.
3. Copy the three files into that folder.
4. Reload Obsidian.
5. Open **Settings** → **Community plugins** and enable **D&D Campaign Hub**.

## Install recommended plugins

Battle maps work standalone. For the full campaign management experience, the following community plugins are recommended:

| Plugin | Purpose |
| --- | --- |
| [Buttons](https://github.com/shabegom/buttons) | Interactive buttons in campaign notes |
| [Dataview](https://github.com/blacksmithgu/obsidian-dataview) | Dynamic tables and queries |
| [Calendarium](https://github.com/javalent/calendarium) | Fantasy calendar integration |
| [Templater](https://github.com/SilentVoid13/Templater) | Template engine for dynamic content |
| [Initiative Tracker](https://github.com/javalent/initiative-tracker) | Encounter and party sync |
| [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) | Creature and trap stat block rendering |

The plugin checks for missing dependencies and prompts you to install them when needed. You can also check manually in **Settings** → **D&D Campaign Hub** → **Plugin Dependencies**.

## Initialize the vault

Before creating campaigns, set up the vault folder structure.

1. Open the Command Palette (`Ctrl+P` on Windows/Linux, `Command+P` on macOS).
2. Run **Initialize D&D Campaign Hub**.
3. The plugin creates the following folders:

| Folder | Purpose |
| --- | --- |
| `ttrpgs/` | Campaign root folder |
| `z_Templates/` | Reusable note templates |
| `z_Assets/` | Images and media files |
| `z_Beastiarity/` | Creature stat blocks and images |
| `z_BattlemapTemplates/` | Reusable battlemap setups |
| `z_Spells/` | Imported SRD spell notes |
| `z_Backups/` | Timestamped backups from migrations |
| `z_Databases/` | Campaign databases |
| `z_Tables/` | Random tables |
| `z_Log/` | Session logs |

## Create your first campaign

1. Open the Command Palette and run **Create New Campaign**, or open the hub with `Ctrl+Shift+M` (Windows/Linux) or `Command+Shift+M` (macOS) and select **New Campaign**.
2. Fill in the fields:
   - **Campaign Name** — for example, "Lost Mines of Phandelver".
   - **Your Role** — select **Game Master / DM** or **Player**. GMs get full access to all creation tools. Players get read-only views.
   - **Game System** — choose from D&D 5e, Pathfinder 2e, Call of Cthulhu, Savage Worlds, FATE Core, OSR, or Other/Custom.
   - **Fantasy Calendar** — optionally link a Calendarium calendar for in-game date tracking.
3. Select **Create Campaign**.

The plugin creates a campaign folder under `ttrpgs/` with a campaign dashboard note and a `World.md` file.

## Open the Campaign Hub

Press `Ctrl+Shift+M` (Windows/Linux) or `Command+Shift+M` (macOS) to open the hub modal at any time. It provides quick access to create sessions, NPCs, PCs, adventures, encounters, items, spells, traps, factions, and creatures, and to browse existing campaign content.

## Next steps

- [Campaign management](campaign-management.md) — manage multiple campaigns and roles.
- [Sessions](sessions.md) — create session notes and use the prep and run dashboards.
- [Adventures and scenes](adventures-and-scenes.md) — structure your adventures with acts and scenes.
- [Characters and creatures](characters-and-creatures.md) — create PCs, NPCs, and full creature stat blocks.
- [Items, spells, traps, and factions](items-spells-traps.md) — create game entities and points of interest.
- [Battle maps](battle-maps.md) — create interactive maps with tokens, fog of war, and lighting.
- [Encounter builder](encounter-builder.md) — build balanced encounters with difficulty calculation.
- [Hexcrawl tracker](hexcrawl.md) — overland travel with terrain, weather, and random encounters.
- [Music player](music-player.md) — dual-layer audio, soundboard, and scene-linked music.
- [Party management](party-management.md) — Initiative Tracker party integration.
- [DM screen](dm-screen.md) — quick-reference rules panel.
- [Settings and reference](settings-and-reference.md) — plugin settings, commands, code blocks, and vault structure.
 - [Map Manager & Views](map-manager.md) — organize battle maps, map views, and GM/Player map workflows.
 - [Marker system](marker-system.md) — token/marker library, token sizing, and marker placement API.
 - [Templates & Migration](templates.md) — templates, `template_version` rules, and migration guidelines.
 - [Env Assets](envasset.md) — environment asset library, picking, and context menus.
 - [Combat Tracker](combat-tracker.md) — combat tracker overview, player view, and integration points.
 - [Encounter System](encounter-system.md) — encounter generation, SRD client, and encounter tables.
