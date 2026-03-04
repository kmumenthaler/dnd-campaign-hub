# Encounter builder

The encounter builder helps you create balanced combat encounters with live difficulty calculation. You can use it as a standalone tool, embed it inside a scene, or generate random encounter tables for hexcrawl and overland travel.

## Create an encounter

1. Open the Command Palette and run **Create New Encounter**.
2. Fill in the fields:
   - **Encounter Name** — a descriptive title.
   - **Include Party Members** — toggle this to factor party stats into difficulty.
   - **Party** — select a party from Initiative Tracker. Individual members can be toggled with checkboxes.
   - **Use Color Names** — when enabled, duplicate creatures get color suffixes (for example, "Goblin (Red)") instead of numbers.

### Add creatures

Use one of two methods to populate the encounter:

- **Add from Vault** — search the bestiary (`z_Beastiarity/` folder and Fantasy Statblocks plugin). Set the count and select **Add**.
- **Add Custom Creature** — enter a name, count, HP, AC, and CR manually.

Each creature in the list shows its stats and has toggles for **Friendly** (adds it to the party side) and **Hidden** (hidden from players in Initiative Tracker). Select the rename button to create a copy of the creature note and map token under a new name.

### Difficulty display

A live-updating card shows:

- **Difficulty badge** — color-coded rating from Trivial to TPK Risk.
- **Estimated rounds** to resolve the encounter.
- **Stats grid** — party versus enemy HP pool, average AC, total DPR, hit chance, and effective DPR.
- **Three-round analysis** — projected HP remaining after three rounds of combat.
- **Action economy adjustment** — DPR modifier when creature counts are heavily skewed.
- **Survival ratio** — the core metric comparing how many rounds the party survives versus how many rounds the enemies survive.

3. Select **Create Encounter**.

The plugin creates an encounter note in `z_Encounters/` (or the campaign encounters folder) with YAML frontmatter, action buttons, a difficulty widget, a creature table, and a GM Notes section. The encounter is also saved to Initiative Tracker.

## Difficulty calculation

The builder uses a survival-ratio system rather than XP thresholds:

| Rating | Survival ratio | Meaning |
| --- | --- | --- |
| Trivial | 4.0 or higher | Enemies fall in one round |
| Easy | 2.5–4.0 | Party wins comfortably |
| Medium | 1.5–2.5 | Fair challenge |
| Hard | 1.0–1.5 | Party may take significant damage |
| Deadly | 0.6–1.0 | Risk of party member death |
| TPK Risk | Below 0.6 | Total party kill likely |

### Stat sources

The builder resolves creature stats in priority order:

1. **Manual overrides** from the modal fields.
2. **Statblock parsing** from vault notes — reads frontmatter `hp`, `ac`, and `actions` arrays. Parses attack bonuses, damage dice, and multiattack text.
3. **CR-based table** from the DMG (CR 0–30) as a fallback.

Party stats come from Initiative Tracker when available. Otherwise the builder uses a level-based model: base HP = 8 + 5 per level, base AC = 12 with increases every four levels, base DPR = 8 + 2.5 per level.

### Action economy

When one side outnumbers the other by more than 2:1, the builder adjusts DPR by ±25% to account for action economy advantages.

### Trap integration

Traps contribute DPR and AC (but not HP) to the enemy side. Threat level modifiers scale trap damage: setback ×0.75, dangerous ×1.25, deadly ×1.5.

## Encounter code block

Embed an encounter widget in any note using the `dnd-encounter` code block:

````
```dnd-encounter
[[path/to/Encounter.md]]
```
````

The widget shows the encounter name with a difficulty badge, a stats row (party count, level, enemy count, estimated rounds), and a creature summary. Two buttons appear:

- **Run Encounter** — loads the encounter into Initiative Tracker.
- **Edit** — opens the encounter builder modal.

## Edit or delete an encounter

- Run **Edit Encounter** from the Command Palette while viewing an encounter note. The modal pre-fills all fields including creatures, party selections, and difficulty data.
- Run **Delete Encounter** to remove the encounter note. A confirmation modal appears.

## Random encounter tables

Random encounter tables let you generate level-appropriate encounters by environment for hexcrawl travel or overland exploration.

### Create a table

1. Open the Command Palette and run **Create Random Encounter Table**.
2. Fill in the fields:
   - **Campaign** — auto-detected from the current note.
   - **Table Name** — a descriptive title.
   - **Environment** — select from 11 types: Arctic, Coastal, Desert, Forest, Grassland, Hill, Mountain, Swamp, Underdark, Underwater, or Urban.
   - **Party Level** — slider from 1 to 20.
   - **Party Size** — slider from 1 to 8.
   - **Table Entries** — the die to roll: d4, d6, d8, d10, d12, or d20.
3. Select **Create**.

The plugin fetches SRD monsters filtered by environment and CR range, then generates entries with a weighted difficulty distribution (Easy, Medium, Hard, Deadly).

### Encounter table code block

Embed a table widget in any note using the `dnd-encounter-table` code block:

````
```dnd-encounter-table
[[path/to/Table.md]]
```
````

The widget renders the table name, environment badge, stats row, a markdown table of roll results, and a **Roll Encounter** button that randomly selects and highlights a result.

### Reroll individual entries

Run **Reroll Encounter Table Entry** to open a modal that shows each table row with a reroll button. The plugin generates a replacement encounter excluding the current monsters and updates the table.

## SRD API

The encounter system uses the D&D 5e API (`dnd5eapi.co`) to fetch monster data. Results are cached in memory during the session. The environment mapping covers approximately 330 SRD monsters across 11 environments.
