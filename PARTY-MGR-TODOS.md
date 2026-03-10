# Party Manager — Outstanding Work

_Created: 2026-03-10_

## Critical — Data Integrity

- [x] **Vault rename sync** — Wire `PartyManager.updateMemberPath(oldPath, newPath)` into the `app.vault.on("rename")` handler in `src/main.ts`. Without this, renaming or moving a PC note silently breaks its party reference.

- [x] **Vault delete sync** — Wire `PartyManager.removeMemberByPath(path)` (or prune) into the `app.vault.on("delete")` handler in `src/main.ts`. Without this, deleting a PC note leaves an orphaned member in the party.

## Medium — Documentation / Accuracy

- [ ] **Update docs to remove IT plugin references** — `README.md`, `docs/getting-started.md`, and `docs/battle-maps.md` still list the Initiative Tracker plugin as an optional dependency and credit it for party sync. Now that PartyManager owns party management, update these docs to reflect the new system.

## Nice to Have — Feature Gaps

- [ ] **Combat Tracker: quick-start from party** — The Combat Tracker only reads `rollPlayerInitiatives` from PartyManager. It doesn't use PartyManager to *load* members into combat. Currently members are passed in through `startFromEncounter()`. A "Start combat from party" shortcut (bypassing Encounter Builder) could be useful.

- [ ] **Hexcrawl party awareness** — `HexcrawlTracker` manages party position on the hex grid but doesn't know *who* is in the party. Could integrate PartyManager for travel pace (based on encumbrance/speed), ration tracking, random encounter scaling by party level, etc.

- [ ] **DM Screen party widget** — The DM Screen is a pure rules reference. Could add an optional party summary panel showing live HP, AC, and status for quick reference during play.

- [ ] **NPC companion/hireling tracking** — NPCs are not registered in PartyManager. If NPC companions or hirelings become a feature, they could be added as a special member type.
