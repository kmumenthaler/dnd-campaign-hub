# D&D Campaign Hub

Manage D&D and TTRPG campaigns inside Obsidian with interactive battle maps, encounter building, hexcrawl travel, session dashboards, a DM screen, and an ambient music player.

> **Project status: early preview.** Core workflows are under active development and may change without notice. Feedback and issue reports are welcome.

## Features

### Campaign management

- Create and switch between multiple campaigns in the same vault.
- Role-based access: GMs have full creation rights, players get read-only views.
- Supports D&D 5e, Pathfinder 2e, Call of Cthulhu, Savage Worlds, FATE, OSR, and custom systems.
- Fantasy calendar integration through the Calendarium plugin.
- Bundled templates for all campaign elements with safe migration on updates.

### Adventures and scenes

- Three-act adventure structure with nine auto-generated scenes (social, combat, exploration).
- Scene notes include read-aloud text, skill checks, encounters, NPCs, treasure, and post-session recaps.
- Flat or act-based folder layout per adventure.
- Full create, edit, and delete support with cascade deletion.
- `/dnd` slash commands for quick scene content insertion (15+ snippet types).

### Session tracking

- Auto-numbered, date-stamped session notes linked to adventures.
- **Session prep dashboard** — sidebar panel for pre-session planning with adventure and scene overview.
- **Session run dashboard** — live session panel with named timers, dice history, quick notes, and automatic DM Screen opening.

### Interactive battle maps

- Display maps with square, hex-horizontal, hex-vertical, or no grid overlay.
- Tools: pan, select, highlight, marker, freehand draw, ruler, area of effect, eraser, fog of war.
- Five annotation layers: Player, DM, Background, Elevated, Subterranean.
- Token library with creature size support (Tiny through Gargantuan), images, elevation tracking, and darkvision.
- Fog of war with brush, circle, rectangle, and polygon reveal and hide modes.
- Wall and light source placement with flicker effects and visibility caching.
- Area of effect shapes (circle, cone, square, line) with optional token anchoring.
- GM Map View for editing and Player Map View as a clean popout window with real-time sync.
- Tabletop miniature mode with physical monitor calibration for 25-32 mm miniature bases.
- Two-point grid calibration to align grids with pre-gridded map images.
- Animated map support for video backgrounds (MP4, WebM).
- Battlemap template system for reusable map setups.
- Environmental asset library with transform handles for resize, rotate, and pivot.

| Keyboard shortcut | Tool |
| --- | --- |
| `Q` | Pan |
| `W` | Select |
| `E` | Highlight |
| `R` | Marker |
| `D` | Draw |
| `Z` | Ruler |
| `X` | Area of effect |
| `C` | Eraser |
| `V` | Fog of war |

### Encounter builder

- Survival-ratio difficulty calculation with real-time feedback.
- Add creatures with count, HP, AC, and CR; supports friendly NPCs and hidden creatures.
- Trap integration: simple and complex traps contribute to encounter difficulty.
- Random encounter table generator filtered by environment and party level.
- Built-in Party Manager for party roster and encounter loading.
- D&D 5e SRD API integration for monster data.

### Hexcrawl wilderness travel

- Hex-by-hex travel tracker with day progression, movement budget, and terrain modifiers.
- 18+ terrain types including forests, mountains, swamps, deserts, arctic, underdark, and more.
- Climate zones, weather generation, survival meter, and ration tracking.
- Exploration roles and configurable travel paces.
- Step-by-step hex procedure modal.
- Terrain painter for drawing terrain directly on hex maps.
- English and German localization for terrain descriptions.

### DM Screen

Tabbed reference panel with eight quick-reference sections: conditions, actions, combat, skills, travel and rest, difficulty classes, damage types, and cover rules.

### Music player

- Dual-layer audio engine with a primary music track and an ambient layer.
- Soundboard for up to eight concurrent one-shot sound effects.
- Playlist management with mood tags, shuffle, repeat, crossfade, and fade controls.
- Audio ducking during sound effects.
- Scene music code blocks to link music to specific scenes.
- Freesound.org integration for searching, previewing, and downloading sound effects.
- Supported formats: MP3, WAV, OGG, M4A, FLAC, WebM, AAC.
- Status bar indicator with playback controls.

### Characters and creatures

- **PC creation** — name, player, class, subclass, level, HP, AC, initiative, speed, passive perception, D&D Beyond link.
- **NPC creation** — name, race, location, faction, motivation, personality.
- **Import PCs** from other campaigns.
- **Creature builder** — full stat block with ability scores, saves, skills, resistances, immunities, traits, actions, legendary actions, and more.
- Tokens auto-created for PCs, NPCs, and creatures with correct grid size.
- Fantasy Statblocks plugin integration for bestiary management.

### Items, spells, traps, and factions

- **Items** — standard and evolving homebrew items that grow with character level. Supports categories, rarity, and attunement.
- **Spells** — import from the D&D 5e SRD API with search, filter, and detail preview.
- **Traps** — simple and complex types with threat levels, multiple elements, countermeasures, and encounter difficulty contribution.
- **Factions** — type, alignment, goals, resources, territory, allied and enemy faction tracking.

### Points of interest

- PoI types: settlement, dungeon, landmark, danger, quest, custom.
- Properties include region, tags, danger level, and discovered/visited status.
- Embeddable `dnd-poi` code blocks and map integration with hex coordinates.

### SRD data import

Import all D&D 5e SRD content from the dnd5eapi.co API:

- 15 data categories: ability scores, classes, conditions, damage types, equipment, features, languages, magic schools, proficiencies, races, skills, subclasses, subraces, traits, weapon properties.
- Batch creature token import (334 SRD monsters) with stat block notes, artwork, and correctly sized battlemap tokens.

### Embeddable code blocks

| Code block | Purpose |
| --- | --- |
| `` ```dnd-map``` `` | Interactive map with tokens, grids, fog of war, walls, and lights |
| `` ```dnd-encounter``` `` | Encounter card with difficulty calculation |
| `` ```dnd-party``` `` | Party stat block with HP, AC, and levels |
| `` ```dnd-poi``` `` | Point of interest card |
| `` ```dnd-music``` `` | Scene music controls |
| `` ```dnd-sfx``` `` | Inline sound effect trigger |
| `` ```dnd-encounter-table``` `` | Random encounter table |

## Installation

### From community plugins (recommended)

1. Open **Settings** → **Community plugins** → **Browse**.
2. Search for "D&D Campaign Hub".
3. Select **Install**, then **Enable**.

### Manual installation

1. Download the latest release from [GitHub Releases](https://github.com/kmumenthaler/dnd-campaign-hub/releases).
2. Extract the files to your vault's `.obsidian/plugins/dnd-campaign-hub/` folder.
3. Reload Obsidian.
4. Enable the plugin in **Settings** → **Community plugins**.

## Dependencies

Battle maps work standalone. For full campaign management, these community plugins are recommended:

- [Buttons](https://github.com/shabegom/buttons) — interactive buttons in campaign notes.
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — dynamic tables and queries.
- [Calendarium](https://github.com/javalent/calendarium) — fantasy calendar integration.
- [Templater](https://github.com/SilentVoid13/Templater) — template engine for dynamic content.
- [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) — creature and trap stat block rendering.

The plugin prompts you to install missing dependencies when needed.

## Quick start

1. Open the Command Palette (`Ctrl+P` on Windows/Linux or `Command+P` on macOS).
2. Run **Initialize D&D Campaign Hub** to create the vault folder structure.
3. Run **Create New Campaign**, enter a name, choose your role, and optionally link a calendar.
4. Open the campaign hub with `Ctrl+Shift+M` (Windows/Linux) or `Command+Shift+M` (macOS) to access all creation tools.
5. Run **Create Battle Map** to set up your first interactive map, then embed it in a note with a `dnd-map` code block.

## Commands

Access all commands through the Command Palette.

### Core

| Command | Description |
| --- | --- |
| Open D&D Campaign Hub | Open the main hub modal |
| Initialize D&D Campaign Hub | Create vault folder structure and templates |
| Migrate D&D Hub Files | Apply safe file migrations after updates |
| Purge D&D Campaign Hub Data | Remove all plugin data |

### Campaigns and sessions

| Command | Description |
| --- | --- |
| Create New Campaign | Start a new campaign with folder generation |
| Create New Session | Add an auto-numbered session note |
| End Session Here | Record the ending scene for the active session |
| Open Session Prep Dashboard | Open the pre-session planning sidebar |
| Open Session Run Dashboard | Open the live session sidebar |

### Adventures, scenes, and encounters

| Command | Description |
| --- | --- |
| Create New Adventure | Create a three-act adventure with scenes |
| Create New Scene | Add a scene to an existing adventure |
| Create New Encounter | Build an encounter with difficulty calculation |
| Insert Encounter Widget | Embed an encounter card in a note |
| Create Random Encounter Table | Generate an environment-based encounter table |
| Roll Random Encounter | Roll on an existing encounter table |

### Characters and creatures

| Command | Description |
| --- | --- |
| Create New PC | Create a player character note |
| Import Existing PC | Import a PC from another campaign |
| Create New NPC | Create a non-player character note |
| Create New Creature | Build a creature with a full stat block |

### Items, spells, traps, and factions

| Command | Description |
| --- | --- |
| Create New Item | Create a standard or evolving item |
| Create New Spell | Import a spell from the SRD |
| Create New Trap | Build a simple or complex trap |
| Create New Faction | Create a faction with goals and territory |

### Maps and markers

| Command | Description |
| --- | --- |
| Create Battle Map | Create a new interactive map |
| Create Battlemap Template | Save a reusable map template |
| Map Manager | Browse, edit, and delete maps |

### Music

| Command | Description |
| --- | --- |
| Open Music Player | Open the music player sidebar |
| Toggle Music Play/Pause | Start or pause playback |
| Next Track / Previous Track | Skip between tracks |
| Stop All Music | Stop all audio layers |
| Search Freesound | Search and download sounds from Freesound.org |

All campaign entities (adventures, scenes, encounters, PCs, NPCs, creatures, items, traps, factions, PoIs) also have **Edit** and **Delete** commands.

## Vault structure

When you initialize the plugin, this folder structure is created:

```
ttrpgs/
  <Campaign>/
    <Campaign>.md         Campaign dashboard
    World.md              World info and GM role tracking
    Adventures/           Adventures with scene subfolders
    Factions/             Organizations and groups
    Sessions/             Session notes

z_Templates/              Reusable note templates
z_Assets/                 Images and assets
z_Beastiarity/            Creature stat blocks and images
z_BattlemapTemplates/     Reusable battlemap setups
z_Spells/                 Imported SRD spell notes
z_Backups/                Timestamped backups from migrations
```

Additional SRD data folders (ability scores, classes, conditions, equipment, and more) are created when you import SRD content from the settings tab.

## Development

### Build from source

```bash
npm install
npm run build
npm run dev
```

### Project structure

```
src/
  main.ts               Plugin entry point and command registration
  templates.ts          Bundled note templates
  types.ts              Shared type definitions
  constants.ts          Plugin constants
  styles.css            Plugin styles
  adventure/            Adventure creation modal
  campaign/             Campaign creation and calendar modals
  character/            PC, NPC, and import modals
  creature/             Creature builder modal
  dm-screen/            DM Screen reference view
  encounter/            Encounter builder, generator, SRD API client
  envasset/             Environmental asset library
  faction/              Faction creation modal
  hexcrawl/             Hexcrawl tracker, terrain painter, climate system
  hub/                  Main hub modal and purge confirmation
  item/                 Item creation modal
  map/                  Map manager, grid overlay, wall tools, persistence
  map-views/            GM and Player map views, tabletop calibration
  marker/               Marker library and picker modals
  migration/            Version migration manager
  music/                Music player, playlists, Freesound integration
  party/                Party management
  poi/                  Point of interest editing and rendering
  scene/                Scene creation and slash command snippets
  session/              Session dashboards (prep and run)
  settings/             Settings tab with SRD import
  spell/                Spell import and detail modals
  srd/                  SRD data import utilities
  trap/                 Trap creation modal
  utils/                Shared utility functions
```

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Submit a pull request.

## Support

- [GitHub Issues](https://github.com/kmumenthaler/dnd-campaign-hub/issues)
- [GitHub Discussions](https://github.com/kmumenthaler/dnd-campaign-hub/discussions)

## Credits

Special thanks to the creators of [Buttons](https://github.com/shabegom/buttons), [Dataview](https://github.com/blacksmithgu/obsidian-dataview), [Calendarium](https://github.com/javalent/calendarium), and [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks).

## License

MIT License. See [LICENSE](LICENSE) for details.
