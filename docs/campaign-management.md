# Campaign management

D&D Campaign Hub supports multiple campaigns in the same vault. Each campaign has its own folder, dashboard, and world note.

## Create a campaign

1. Open the Command Palette and run **Create New Campaign**, or select **New Campaign** from the hub (`Ctrl+Shift+M`).
2. Fill in the campaign details:
   - **Campaign Name** — the display name and folder name.
   - **Your Role** — Game Master / DM or Player.
   - **DM Name** — visible only when the role is set to Player.
   - **Game System** — D&D 5e, Pathfinder 2e, Call of Cthulhu, Savage Worlds, FATE Core, OSR, or Other/Custom.
   - **Fantasy Calendar** — link an existing Calendarium calendar, create a new one (quick, full, or import), or select None.
   - **Campaign Start Date** — optionally pick a starting in-game date from the linked calendar.
3. Select **Create Campaign**.

The plugin creates:

```
ttrpgs/
  <Campaign Name>/
    <Campaign Name>.md    Campaign dashboard
    World.md              World info and GM role tracking
    Adventures/
    Factions/
    Sessions/
```

## Switch between campaigns

The plugin auto-detects the active campaign from the note you have open. If Obsidian cannot determine the campaign from the current file, the plugin prompts you to choose one.

You can also set a default campaign in **Settings** → **D&D Campaign Hub** → **Campaign Settings**.

## Roles

The role is stored in `World.md` as a `role` frontmatter field.

- **Game Master / DM** — full access to all creation commands (adventures, scenes, encounters, factions, NPCs, and more).
- **Player** — read-only access. Creation commands are hidden or filtered to prevent accidental changes.

Most creation modals filter the campaign dropdown to show only campaigns where you are the GM.

## Campaign Hub modal

Press `Ctrl+Shift+M` (Windows/Linux) or `Command+Shift+M` (macOS) to open the hub modal.

### Quick actions

The hub shows a grid of creation buttons:

- New Campaign, New NPC, New PC, New Faction, New Adventure, New Encounter, New Trap, New Item, New Creature.

### Browse vault

Below the quick actions, a browse section lets you navigate to:

- Campaigns, NPCs, PCs, Adventures, Sessions, Items, Spells, Factions.

Selecting an entry opens the corresponding note in the editor.

## Purge campaign data

To remove all plugin data from the vault:

1. Open the Command Palette and run **Purge D&D Campaign Hub Data**.
2. Confirm in the dialog.

This deletes the `ttrpgs/`, `z_Templates/`, `z_Assets/`, and all other plugin-created folders. Use with caution.

## Migrate files after updates

When the plugin is updated, templates and notes may need migration to add new features.

1. Open the Command Palette and run **Migrate D&D Hub Files**.
2. The migration modal shows which files will be updated.
3. Select **Migrate** to apply changes.

Migrations preserve your content and create timestamped backups in `z_Backups/` before making changes.
