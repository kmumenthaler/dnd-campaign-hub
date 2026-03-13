# Settings and reference

## Plugin settings

Open **Settings > D&D Campaign Hub** to configure the plugin. The settings page has the following sections:

### Plugin dependencies

Shows the installation status of each optional plugin. A green check indicates the plugin is installed and enabled; a yellow warning means it is missing. Select **Install** to open the Obsidian plugin browser for any missing plugin.

| Plugin | Purpose |
| --- | --- |
| Calendarium | In-game calendar and date tracking |
| Templater | Template processing for note creation |
| Fantasy Statblocks | Creature and PC stat block rendering |

### Campaign settings

- **Active Campaign** — auto-detected from the currently open note. Use the campaign picker in creation modals to target a different campaign.

### Map management

- **Open Map Manager** — opens the map manager modal to browse, edit, duplicate, and delete map templates and active maps.

### SRD data import

Import official D&D 5e System Reference Document data into your vault. Each button downloads data from the D&D 5e API and creates notes in the corresponding `z_*` folder.

| Category | Target folder |
| --- | --- |
| Ability Scores | `z_AbilityScores/` |
| Classes | `z_Classes/` |
| Conditions | `z_Conditions/` |
| Damage Types | `z_DamageTypes/` |
| Equipment | `z_Equipment/` |
| Features | `z_Features/` |
| Languages | `z_Languages/` |
| Magic Schools | `z_MagicSchools/` |
| Proficiencies | `z_Proficiencies/` |
| Races | `z_Races/` |
| Skills | `z_Skills/` |
| Subclasses | `z_Subclasses/` |
| Subraces | `z_Subraces/` |
| Traits | `z_Traits/` |
| Weapon Properties | `z_WeaponProperties/` |

Select **Import All SRD Data** to download every category at once.

### SRD creature token import

Select **Import SRD Creatures** to download all 334 SRD monsters with artwork. The plugin creates notes in `z_Beastiarity/` with full stat blocks and registers matching map marker tokens with correct creature sizes and darkvision values. A progress indicator tracks the import.

### About

- **Version** — the current plugin version.
- **Migrate Files** — runs template migration to update existing notes with new features introduced in plugin updates. Backups are saved to `z_Backups/`.

### Danger zone

- **Purge Vault** — deletes all plugin-created folders (`ttrpgs/`, `z_Templates/`, `z_Assets/`, and others). A confirmation modal requires explicit confirmation before proceeding.

## Command reference

All commands are available from the Command Palette (`Ctrl+P` on Windows/Linux, `Cmd+P` on macOS). Search for "D&D" to filter.

### General

| Command | Description |
| --- | --- |
| Open D&D Campaign Hub | Open the hub modal with quick-create buttons and vault browser |
| Initialize D&D Campaign Hub | Create the vault folder structure and templates |
| Migrate D&D Hub Files | Run template migration after plugin updates |
| Purge D&D Campaign Hub Data | Delete all plugin-created data (with confirmation) |
| Reset Focus | Fix stuck input fields in modals |

### Campaigns and sessions

| Command | Description |
| --- | --- |
| Create New Campaign | Open the campaign creation modal |
| Create New Session | Open the session creation modal |
| End Session Here | Record the ending scene for the current session |
| Open Session Prep Dashboard | Open the pre-session preparation panel |
| Open Session Run Dashboard | Open the in-session management panel |
| Session Projection | Open the projection setup modal for managed player screens |
| Start Projection Session | Launch configured projection screens |
| Stop Projection Session | Close all managed projection screens |

### Adventures and scenes

| Command | Description |
| --- | --- |
| Create New Adventure | Open the adventure creation modal |
| Edit Adventure | Edit the adventure in the current note |
| Delete Adventure | Delete the adventure and its scenes |
| Create New Scene | Open the scene creation modal |
| Edit Scene | Edit the scene in the current note |
| Delete Scene | Delete the current scene note |

### Characters and creatures

| Command | Description |
| --- | --- |
| Create New PC | Open the PC creation modal |
| Edit PC | Edit the PC in the current note |
| Delete PC | Delete the current PC note |
| Import Existing PC from Another Campaign | Clone or link a PC across campaigns |
| Create New NPC | Open the NPC creation modal |
| Edit NPC | Edit the NPC in the current note |
| Delete NPC | Delete the current NPC note |
| Create New Creature | Open the creature creation modal |
| Edit Creature | Edit the creature in the current note |
| Delete Creature | Delete the current creature note |

### Items, spells, traps, and factions

| Command | Description |
| --- | --- |
| Create New Item | Open the item creation modal |
| Edit Item | Edit the item in the current note |
| Delete Item | Delete the current item note |
| Create New Spell | Open the spell import/creation modal |
| Create New Trap | Open the trap creation modal |
| Edit Trap | Edit the trap in the current note |
| Delete Trap | Delete the current trap note |
| Create New Faction | Open the faction creation modal |

### Points of interest

| Command | Description |
| --- | --- |
| Edit Point of Interest | Edit the PoI in the current note |
| Delete Point of Interest | Delete the current PoI note |
| Insert PoI Code Block | Insert a `dnd-poi` code block with a multi-select picker |
| Update PoI Icons | Refresh map icons for all PoIs |

### Encounters

| Command | Description |
| --- | --- |
| Create New Encounter | Open the encounter builder modal |
| Edit Encounter | Edit the encounter in the current note |
| Delete Encounter | Delete the current encounter note |
| Insert Encounter Widget | Insert a `dnd-encounter` code block |
| Create Random Encounter Table | Generate a random encounter table |
| Roll Random Encounter | Roll on the encounter table in the current note |
| Insert Encounter Table Code Block | Insert a `dnd-encounter-table` code block |
| Reroll Encounter Table Entry | Reroll a single entry in the current table |
| Edit Encounter Table | Edit the encounter table in the current note |
| Delete Encounter Table | Delete the current encounter table |

### Battle maps

| Command | Description |
| --- | --- |
| Create Battle Map (from template) | Insert a map from an existing template |
| Create Battlemap Template | Open the map creation modal |
| Map Manager | Open the map manager |

### Music

| Command | Description |
| --- | --- |
| Open Music Player | Open the music player sidebar |
| Toggle Music Play / Pause | Play or pause the primary layer |
| Next Track | Skip to the next track |
| Previous Track | Go to the previous track |
| Stop All Music | Stop both layers and all sound effects |
| Volume Up (+10) | Increase primary layer volume by 10% |
| Volume Down (−10) | Decrease primary layer volume by 10% |
| Toggle Mute | Mute or unmute the primary layer |
| Insert Scene Music Block | Insert a `dnd-music` code block |
| Insert Sound Effect Block | Insert a `dnd-sfx` code block |
| Open Music Settings | Open the music configuration modal |
| Search Freesound | Open the Freesound search browser |

## Code block reference

The plugin registers seven custom code block types:

| Code block | Description | Documentation |
| --- | --- | --- |
| `dnd-map` | Renders an interactive battle map | [Battle maps](battle-maps.md) |
| `dnd-encounter` | Renders an encounter summary widget | [Encounter builder](encounter-builder.md) |
| `dnd-encounter-table` | Renders a random encounter table widget | [Encounter builder](encounter-builder.md) |
| `dnd-hub` | Renders entity action buttons (edit, delete) | Included automatically in all entity templates |
| `dnd-music` | Renders a scene music loader card | [Music player](music-player.md) |
| `dnd-sfx` | Renders a sound effect trigger button | [Music player](music-player.md) |
| `dnd-poi` | Renders a list of points of interest | [Items, spells, traps, and factions](items-spells-traps.md) |
| `dnd-hexcrawl` | Renders hexcrawl tracker state (internal) | [Hexcrawl tracker](hexcrawl.md) |

### Code block syntax

Each code block contains either a wiki-link to a note or a JSON configuration object:

````
```dnd-encounter
[[z_Encounters/Goblin Ambush.md]]
```
````

````
```dnd-music
{"primaryPlaylistId":"abc","ambientPlaylistId":"def","autoPlay":true}
```
````

## Slash commands

Type `/dnd` in any note to open a searchable popup of quick-insert content snippets. See [Adventures and scenes — Scene snippets](adventures-and-scenes.md#scene-snippets) for the full list.

## Keyboard shortcuts

### Global

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Open the Campaign Hub modal |

### Battle map

See [Battle maps — Keyboard shortcuts](battle-maps.md#keyboard-shortcuts) for the full list.

## Vault folder structure

After initialization, the plugin creates the following top-level folders:

| Folder | Purpose |
| --- | --- |
| `ttrpgs/` | Campaign data (one subfolder per campaign) |
| `z_Templates/` | Note templates for all entity types |
| `z_Assets/` | Images, maps, PDFs, and environmental assets |
| `z_BattlemapTemplates/` | Saved battle map templates |
| `z_Beastiarity/` | Creature stat blocks (SRD and custom) |
| `z_Encounters/` | Standalone encounter notes |
| `z_Traps/` | Trap notes |
| `z_Spells/` | SRD spell imports |
| `z_Databases/` | Campaign databases |
| `z_Tables/` | Random tables |
| `z_Log/` | Session logs |
| `z_Backups/` | Migration backups |

Additional SRD data folders are created when you import SRD content from the settings page:

| Folder | SRD Category |
| --- | --- |
| `z_AbilityScores/` | Ability Scores |
| `z_Classes/` | Classes |
| `z_Conditions/` | Conditions |
| `z_DamageTypes/` | Damage Types |
| `z_Equipment/` | Equipment |
| `z_Features/` | Features |
| `z_Languages/` | Languages |
| `z_MagicSchools/` | Magic Schools |
| `z_Proficiencies/` | Proficiencies |
| `z_Races/` | Races |
| `z_Skills/` | Skills |
| `z_Subclasses/` | Subclasses |
| `z_Subraces/` | Subraces |
| `z_Traits/` | Traits |
| `z_WeaponProperties/` | Weapon Properties |

Each campaign folder under `ttrpgs/` contains subfolders for Adventures, Sessions, NPCs, PCs, Factions, Items, Spells, and locations.
