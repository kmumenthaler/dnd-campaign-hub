
# Encounter System

Overview

The Encounter System provides tools for generating encounters (manual or random), balancing difficulty, and inserting encounter blocks into notes. It also integrates with the SRD client for importing creatures and spells.

Key files

- Builder & modals: [src/encounter/EncounterBuilder.ts](src/encounter/EncounterBuilder.ts) and [src/encounter/EncounterBuilderModal.ts](src/encounter/EncounterBuilderModal.ts)
- Tables & blocks: [src/encounter/EncounterTableBlock.ts](src/encounter/EncounterTableBlock.ts)
- SRD client: [src/encounter/SRDApiClient.ts](src/encounter/SRDApiClient.ts)

User workflows

- Create encounter: Open the Encounter Builder from the hub, add creatures/NPCs/PCs, adjust counts and difficulty, then insert into a session or adventure note.
- Random tables: Create encounter tables in the Encounter Builder or the Random Encounter Table modal, then roll directly from notes.
- Import SRD content: Use the SRD client to import creatures or spells to `z_Spells/` or `z_Beastiarity/` for use in encounters.

Examples

- Insert an encounter block: From the builder, choose **Insert into current note** — the plugin will add an `encounter` block that renders as an encounter table and has placement controls for maps.
- Use the encounter to spawn tokens: Click the map placement button inside an encounter block to push token placements to the active map.

Developer notes

- The `EncounterTableBlock` renders the encounter in-note and exposes a small API for re-rolling or spawning.
- SRD imports are asynchronous; ensure UI shows progress and errors are logged to the console for debugging.

Related docs

- Encounter builder: [docs/encounter-builder.md](docs/encounter-builder.md)
- Map Manager & Views: [docs/map-manager.md](docs/map-manager.md)

