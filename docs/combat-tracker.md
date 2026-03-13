
# Combat Tracker

The Combat Tracker manages initiative order, combatant state, and integration with battle map tokens. It provides a full GM sidebar view and a read-only Player view for projection to external screens.

## Open the Combat Tracker

Run **Open Combat Tracker** from the Command Palette. The tracker opens as a sidebar panel.

## GM view

The GM sidebar shows:

- **Initiative order** — combatants sorted by initiative roll with round counter.
- **Combatant rows** — each row displays name, HP (current / max), AC, and active status effects. Rows are expandable for detailed editing.
- **HP tracking** — current, temporary, and max HP. Death save successes and failures for PCs at 0 HP.
- **Status effects** — add named effects with duration in rounds and optional GM notes.
- **PC statblocks** — click a PC name to open their Fantasy Statblocks statblock in a split pane. If Fantasy Statblocks is not installed, the PC note opens instead.

## Player view

The Player view is a fullscreen projection window designed for an external monitor or projector:

- HP bar animations with color-coded health.
- Dynamic font sizing based on combatant count.
- Hidden combatants and sensitive GM data (exact HP values, notes) are not shown.

The session projection system can automatically display the Player view during active combat. See [Sessions — Session Projection](sessions.md#session-projection).

## Running combat

1. Select **Start Combat** to begin a new encounter.
2. Add combatants manually or import from an encounter note.
3. Select **Roll Initiative** to roll for all combatants with automatic sorting.
4. Use **Next Turn** and **Previous Turn** to advance through the initiative order.
5. Select **End Combat** when the encounter is resolved.

## Map integration

- Combatants linked to a `token_id` are highlighted on the active battle map.
- **Auto-pan** (optional) — the player map view centers on the active combatant's token each turn.
- **Vision selector** — switch between individual token perspective or combined party view.
- **Darkvision override** — set per-combatant darkvision range (0–300 ft in 5 ft increments).
- **Elevation** — flying and burrowing states are tracked and shown on map tokens.
- **Carried light sources** — tokens with light sources affect the vision system on the map.

## Commands

| Command | Description |
| --- | --- |
| Open Combat Tracker | Open the combat tracker sidebar |
| Next Turn | Advance to the next combatant |
| Previous Turn | Go back to the previous combatant |
| Roll Initiative | Roll initiative for all combatants |
| Save Combat State | Persist the current combat state |
| End Combat | End the active encounter |

## Related docs

- [Marker system](marker-system.md)
- [Map Manager](map-manager.md)
- [Encounter system](encounter-system.md)
- [Encounter builder](encounter-builder.md)

