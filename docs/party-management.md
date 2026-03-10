# Party management

The plugin includes a built-in Party Manager for organizing player characters into parties, tracking live stats, and feeding party data into encounters and combat.

## Open the Party Manager

Open the Command Palette and run **Party Manager**, or press the hotkey if configured.

The modal shows a tab bar with all parties. Select a party tab to view its members. Use the **+** tab to create a new party.

## Create a party automatically

When you create a new campaign, the plugin automatically creates a party named `<Campaign Name> Party` and links it to the campaign folder. PCs created in that campaign are registered in the party automatically.

## Link an existing campaign

If you have campaigns created before the Party Manager existed:

1. Open the Party Manager.
2. Select a party (or create one with the **+** tab).
3. Select **Link Campaign** and choose the campaign folder from the picker.
4. The plugin auto-imports all PC notes from `<Campaign>/PCs/`.

You can re-run **Import PCs** at any time to pick up newly created PCs. Select **Unlink** to remove the campaign binding without affecting members.

## Add or remove members

- Select **Add PC** to search all PC notes in the vault and add one to the party.
- Select the **✕** button on a member card to remove it from the party.
- Drag member cards by the handle to reorder them.

## Live stats

Member cards show live data resolved from PC note frontmatter on every render:

| Field | Source |
| --- | --- |
| Name | `name` or file basename |
| Level | `level` |
| HP / Max HP | `hp` / `hp_max` |
| Temp HP | `thp` |
| Armor Class | `ac` |
| Initiative Bonus | `init_bonus` |
| Token | `token_id` (links to marker library) |
| Player | `player` |
| Race / Class | `race` / `class` |

A summary bar above the member cards shows totals for members, HP, average AC, and average level.

## Vault sync

Party references stay current automatically:

- **File rename/move** — member paths and display names update when a PC note is renamed or moved.
- **File delete** — members are removed from all parties when their note is deleted.
- **Sync Names** (in Settings) — refreshes all display names from vault frontmatter.
- **Prune Orphans** (in Settings) — removes members whose notes no longer exist.

## Multiple campaigns

Each campaign can have its own party. Set one as the **default** using the toolbar button — this party is used when no specific context is available (for example, when opening the Encounter Builder outside a campaign folder).

## Settings

Open the settings panel with the gear icon in the Party Manager header:

| Setting | Options |
| --- | --- |
| Roll initiative for PCs | Don't roll (manual), Roll automatically, Let players roll |
| Sync Names | Refresh display names from PC notes |
| Prune Orphans | Remove members whose notes no longer exist |
