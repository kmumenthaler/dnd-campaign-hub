# Hexcrawl tracker

The hexcrawl tracker turns any hex-grid map into a full overland travel system with terrain, weather, navigation checks, foraging, random encounters, and a travel log — all following D&D 5e rules.

## Enable hexcrawl

1. Create or open a battle map that uses a hex grid and a world or regional map type.
2. Open the hexcrawl sidebar panel (it appears automatically for eligible maps).
3. Select the settings button and enable hexcrawl for this map.
4. Configure initial supplies — food (pounds), water (gallons), party size, and description language (English or Deutsch).

## Sidebar panel

The hexcrawl sidebar refreshes automatically and shows the current travel state:

- **Day and movement** — the current travel day and a movement budget progress bar.
- **Travel method** — a searchable dropdown with 27 methods across four categories (land, water, air, magic). Each method has a base speed in hexes per day.
- **Pace** — three buttons: Slow (×0.75, stealth possible), Normal (×1.0), or Fast (×1.25, −5 passive Perception).
- **Effective speed** — the combined result of method, pace, and weather modifiers.
- **Weather** — the current weather card with a **Roll Weather** button and a manual override dropdown.
- **Party size and level** — adjustable controls used for encounter generation and ration tracking.
- **Ration warnings** — alerts when food or water supplies are running low or depleted.
- **Exhaustion** — the current exhaustion level (D&D 5e six-level system) caused by starvation or dehydration.
- **Party position** — the current hex coordinates and terrain type.
- **Exploration roles** — text inputs for the navigator and forager names.
- **Travel log** — the last five travel entries with encounter badges. Encounter entries have a **Create Battlemap** button.

### Action buttons

| Button | Description |
| --- | --- |
| Travel to Hex | Activates the hex-move tool on the map. Select a destination hex to begin the travel procedure. |
| Set Starting Hex | Places the party token on the selected hex. |
| End Day | Consumes daily rations, advances the day counter, and resets movement. |
| Reset Travel | Clears the travel log, visited hexes, day counter, weather, and exhaustion (with confirmation). |

## Terrain types

The tracker supports 18 terrain types, each with a speed modifier, difficult terrain flag, foraging DC, navigation DC, and encounter DC:

| Terrain | Speed modifier | Forage DC | Navigation DC |
| --- | --- | --- | --- |
| Road | ×1.5 | 20 | 5 |
| Plains | ×1.0 | 15 | 10 |
| Forest | ×0.75 | 10 | 15 |
| Hills | ×0.75 | 15 | 12 |
| Mountains | ×0.5 | 20 | 15 |
| Swamp | ×0.5 | 10 | 18 |
| Desert | ×0.75 | 20 | 12 |
| Arctic | ×0.75 | 20 | 15 |
| Coastal | ×1.0 | 10 | 10 |
| Jungle | ×0.5 | 10 | 18 |
| Underdark | ×0.5 | 20 | 18 |
| Water | ×1.0 | 20 | 10 |
| River | ×0.75 | 15 | 10 |
| Riverside | ×1.0 | 10 | 10 |
| River Crossing | ×0.5 | 15 | 12 |

Three additional inferno terrain variants exist for volcanic environments.

### Paint terrain

Select the **Terrain Paint** tool from the hexcrawl toolbar section. A grid of terrain buttons appears. Select a terrain type, then select hexes on the map to paint them. Each hex shows its terrain color and icon.

### Climate zones

Select the **Climate Paint** tool to assign one of six climate zones to hexes: Temperate, Arctic, Tropical, Arid, Volcanic, or Maritime. Climate affects weather tables and encounter monster selection. Climate zones display as colored border rings on the hex.

## Weather

The tracker includes 12 weather types with severity levels, travel modifiers, visibility conditions, and mechanical effects:

| Weather | Severity | Travel modifier |
| --- | --- | --- |
| Clear | None | ×1.0 |
| Overcast | None | ×1.0 |
| Fog | Low | ×0.75 |
| Rain | Low | ×0.9 |
| Heavy Rain | Medium | ×0.75 |
| Thunderstorm | High | ×0.5 |
| Snow | Medium | ×0.75 |
| Blizzard | High | ×0.5 |
| Hail | Medium | ×0.75 |
| Sandstorm | High | ×0.5 |
| Extreme Heat | Medium | ×0.75 |
| Extreme Cold | Medium | ×0.75 |

Select **Roll Weather** to generate weather from a weighted d12 table, or override manually from the dropdown.

## Travel procedure

When you select **Travel to Hex** and choose a destination, a six-step wizard guides you through the travel procedure:

### Step 1 — Terrain

Shows the destination terrain card with icon, name, description, and stats (speed modifier, difficult terrain, forage DC, navigation DC). If a climate zone is set, a climate badge appears. A read-aloud description is auto-populated from custom descriptions or the climate library (available in English and German). You can reroll or edit the description.

### Step 2 — Weather

Shows the current weather card with severity, travel modifier, visibility, and mechanical effects. Select **Roll New Weather** to reroll or use the manual dropdown.

### Step 3 — Checks

- **Navigator check** — DC is the terrain navigation DC adjusted for weather. Enter the player name and toggle Pass or Fail. A failed check means the party gets lost.
- **Forager check** — DC is the terrain forage DC adjusted for weather. On success, roll 1d6 + WIS modifier for food collected (in pounds). Enter the WIS modifier.

### Step 4 — Encounter

Uses a progressive DC system: the base encounter DC decreases by 2 for each hex traveled since the last encounter (minimum DC 2). Shows the terrain-to-environment mapping for monster selection.

Roll a d20. If the roll meets the DC, an encounter is generated using SRD monsters filtered by terrain environment and party level. A **Force Encounter** toggle lets you trigger an encounter regardless of the roll. The encounter card shows monsters, difficulty badge, and XP. A manual notes area is available for custom encounters.

You can reroll the encounter if the generated one does not fit your story.

### Step 5 — Discovery

Toggle whether the party discovers something at this hex. Select **Roll Discovery** to generate one of 12 random discovery types. A details text area lets you describe the discovery.

### Step 6 — Summary

A full recap of the travel step: terrain, weather, check results, encounter, discovery, rations consumed, and exhaustion changes. A GM notes area lets you record additional details.

Select **Complete & Enter Hex** to apply the results — foraging adds food, the encounter counter updates, the party token moves, and a travel log entry is created.

## Encounter battlemaps

When an encounter occurs during hexcrawl travel (or from the travel log), select **Create Battlemap** to open the encounter battlemap modal:

1. A creature summary with difficulty badge shows the encounter details.
2. A template selection grid displays terrain-matched and climate-matched templates scored by relevance. The best match is highlighted.
3. Set the map name and grid configuration.
4. Toggle **Include Party Tokens** to auto-place party members.
5. Select **Create Battlemap**.

The plugin deep-copies the template annotations (walls, lights, fog, terrain, assets) and auto-places creature tokens on the right side of the map and party tokens on the left. Token sizes and darkvision values are pulled from SRD data.

## Custom hex descriptions

### Per-terrain descriptions

Open the hexcrawl settings and select **Manage Descriptions** to add, edit, or delete read-aloud descriptions for each terrain type. When the party enters a hex of that terrain, one description is randomly selected for the travel procedure.

### Per-hex descriptions

Right-click a painted hex and select **Edit Description** to write a custom description for that specific hex. Per-hex descriptions take priority over per-terrain descriptions.

## Ration tracking

The tracker consumes 1 pound of food and 1 gallon of water per party member per day when you select **End Day**. If supplies are insufficient, warnings appear and exhaustion increases following D&D 5e starvation and dehydration rules.
