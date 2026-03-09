
# Map Manager & Views

Overview

The Map subsystem provides tools to create, persist, and present battle maps to GMs and players. It separates storage and business logic (`MapManager`, `MapPersistence`) from the runtime interface (`MapController`, `GmMapView`, `PlayerMapView`).

Key files

- Map controller & manager: [src/map/MapController.ts](src/map/MapController.ts) and [src/map/MapManager.ts](src/map/MapManager.ts)
- Persistence & templates: [src/map/MapFactory.ts](src/map/MapFactory.ts) and [src/map/MapPersistence.ts](src/map/MapPersistence.ts)
- Views: [src/map-views/GmMapView.ts](src/map-views/GmMapView.ts) and [src/map-views/PlayerMapView.ts](src/map-views/PlayerMapView.ts)

User workflows

- Create a map: Command Palette → **Create Map** or open the Map Manager modal from the hub. Fill metadata and import an image or tile set.
- Edit/duplicate: Open Map Manager, select a map, then choose **Edit** or **Duplicate**.
- Open map in GM/Player mode: From the map item, choose **Open (GM)** or **Open (Player)** depending on permissions.

Examples

- Placing tokens from an encounter: open the encounter, use the map placement button to push tokens to the active map view.
- Switching view: GMs may toggle fog-of-war and lighting; players see the sanitized `PlayerMapView`.

Developer notes

- Prefer `MapController` over direct DOM manipulation when placing or moving tokens programmatically.
- Keep side-effects (saving, undo) inside `MapManager` / `MapPersistence` so other systems can safely call controller methods.
- When adding features that affect tile layout or grid math, update `MapFactory` tests if present.

Related docs

- Battle maps: [docs/battle-maps.md](docs/battle-maps.md)
- Marker system: [docs/marker-system.md](docs/marker-system.md)
 - Combat Tracker: [docs/combat-tracker.md](docs/combat-tracker.md)
 - Encounter System: [docs/encounter-system.md](docs/encounter-system.md)
 - Env Assets: [docs/envasset.md](docs/envasset.md)

