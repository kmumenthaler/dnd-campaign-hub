
# Combat Tracker

Overview

The Combat Tracker manages initiative, combatant state, and integration with map tokens. It provides a full GM view and a limited Player view for remote participants.

Key files

- Core: [src/combat/CombatTracker.ts](src/combat/CombatTracker.ts)
- Views: [src/combat/CombatTrackerView.ts](src/combat/CombatTrackerView.ts) and [src/combat/CombatPlayerView.ts](src/combat/CombatPlayerView.ts)
- Types: [src/combat/types.ts](src/combat/types.ts)

Basic usage

- Start combat: Open the Combat Tracker UI from the hub and click **Start Combat**. Add combatants manually or import from an encounter.
- Add combatant: Use **Add Combatant** and select a creature, NPC, or PC; supplying a `token_id` will allow the tracker to link the combatant to a map token.
- Advance turn: Use **Next Turn** or hotkeys provided by the view.

Commands / API

- Start combat programmatically: `this.plugin.combatTracker.startCombat()`
- Add a combatant: `this.plugin.combatTracker.addCombatant({ name, hp, token_id, sourcePath })`
- End combat: `this.plugin.combatTracker.endCombat()`

Integration notes

- When adding combatants with `token_id`, the map controller will attempt to place or highlight the corresponding token on the active map.
- The Player view intentionally hides sensitive fields (HP, hidden status) depending on settings; use `CombatPlayerView` when broadcasting minimal info.

Developer notes

- Keep combat state mutations inside `CombatTracker` so UI views can remain thin and subscribe to state changes.
- If you need to persist combat logs, use the session logging helpers to write to `z_Log/` or the active session note.

Related docs

- Marker system: [docs/marker-system.md](docs/marker-system.md)
- Map Manager & Views: [docs/map-manager.md](docs/map-manager.md)
 - Encounter System: [docs/encounter-system.md](docs/encounter-system.md)
 - Encounter builder: [docs/encounter-builder.md](docs/encounter-builder.md)

