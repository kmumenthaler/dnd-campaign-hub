
# Marker system

Overview

The Marker system stores token images and metadata used by maps, the combat tracker, and encounter placement. Tokens are persisted in the plugin data and referenced from entity frontmatter via `token_id`.

Key files

- Library: [src/marker/MarkerLibrary.ts](src/marker/MarkerLibrary.ts)
- Types: [src/marker/MarkerTypes.ts](src/marker/MarkerTypes.ts)

User workflows

- Add a token: Open the Marker Library modal from the hub or Map Manager, upload an image and set size/metadata.
- Assign to an entity: add `token_id` to a creature/NPC frontmatter so the map and combat systems can resolve the token automatically.

Example frontmatter

---
type: creature
name: Goblin
token_id: goblin_small_01
size: small
---

Common commands & UI

- Open Marker Library: Command Palette → **Open Marker Library**
- Add/Delete markers: Use the modal buttons; deleting prompts when markers are referenced.

Developer notes / API

- Access the library via the plugin instance: `const marker = this.plugin.markerLibrary.get(tokenId)`.
- When deleting a marker, `MarkerLibrary` emits events; listeners (maps, entities) should handle missing tokens gracefully (fallback icons).
- Token sizing matters for grid placement. Keep `size` in sync with `MarkerTypes` when adding new marker kinds.

Related docs

- Map Manager & Views: [docs/map-manager.md](docs/map-manager.md)
- Combat Tracker: [docs/combat-tracker.md](docs/combat-tracker.md)
 - Items, Spells, Traps: [docs/items-spells-traps.md](docs/items-spells-traps.md)
 - Battle maps: [docs/battle-maps.md](docs/battle-maps.md)

