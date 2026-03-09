# Items, spells, traps, and factions

The plugin provides creation modals for game items, spells, traps, factions, and points of interest. Each generates a structured Markdown note with YAML frontmatter and action buttons.

## Items

### Create an item

1. Open the Command Palette and run **Create New Item**.
2. Fill in the fields:
   - **Item Name** — required.
   - **Item Type** — select **Simple D&D 5e Item** or **Evolving Homebrew Item**.
   - **Category** — Weapon, Armor, Wondrous Item, Potion, Scroll, Ring, Rod, Staff, Wand, or Other.
   - **Rarity** — Common, Uncommon, Rare, Very Rare, Legendary, or Artifact.
   - **Requires Attunement** — toggle. When enabled, an **Attunement Requirement** text field appears (for example, "by a wizard").
   - **Weight** — for example, "3 lb."
   - **Value** — for example, "500 gp".
   - **Description** — the item's properties and lore.
   - **Campaign** — select the target campaign.
3. For **Evolving Homebrew Items**, an evolution threshold builder appears below the description:
   - Select **Add Threshold** to define a level milestone.
   - Set the **Character Level** (1–20) and describe the **Evolution** — what changes at that level.
   - Add as many thresholds as needed.
4. Select **Create**.

The note is saved to `<Campaign>/Items/<Item Name>.md` with `type: item` frontmatter.

### Edit an item

Run **Edit Item** while viewing an item note. All fields are pre-filled, including evolution thresholds for evolving items. Renaming updates the file name.

## Spells

### Browse and import SRD spells

1. Open the Command Palette and run **Import Spells**.
2. The **SRD Spells** tab shows a searchable, filterable list of all SRD spells:
   - **Search** — filter by spell name.
   - **Level Filter** — multi-select from Cantrip through 9th level.
   - **School Filter** — multi-select from eight schools of magic.
   - **Class Filter** — checkboxes for Bard, Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, and Wizard.
3. Select a spell to view its full details, then select **Import Spell** to save it to `<Campaign>/Spells/<Spell Name>.md`.
4. Select **Import All** to bulk-import every SRD spell to `z_Spells/`.
5. Select **Refresh from API** to re-fetch the spell list from the D&D 5e API.

Spell data is cached locally for seven days.

See [Templates & Migration](templates.md) for how imported or custom spells are generated from templates, and [Encounter System](encounter-system.md) for SRD client details.

### Create a custom spell

1. In the spell import modal, switch to the **Custom Spell** tab.
2. Enter the spell name.
3. Select **Create**.

The plugin creates a spell note from the default template at `<Campaign>/Spells/<Spell Name>.md` with `type: spell` frontmatter. You can then edit the note directly to fill in level, school, casting time, range, components, duration, and description.

## Traps

### Create a trap

1. Open the Command Palette and run **Create Trap**.
2. Fill in the fields:
   - **Trap Name** — required.
   - **Trap Type** — **Simple** or **Complex**.
   - **Threat Level** — Setback, Dangerous, or Deadly.
   - **Level Range** — minimum and maximum character levels (1–20).
   - **Trigger** — what activates the trap.
3. Add at least one **Trap Element** using the inline builder:
   - **Name** — the element's label.
   - **Element Type** (complex traps only) — Active (acts on initiative), Dynamic (triggers conditionally), or Constant (ongoing effect).
   - **Initiative** (complex + active only) — the element's initiative count.
   - **Condition** (complex + dynamic only) — what triggers this element.
   - **Attack Bonus** — optional, for example "+8".
   - **Range** — optional, for example "60 ft."
   - **Save DC** — optional. When set, a **Save Ability** dropdown appears (DEX, STR, CON, INT, WIS, CHA) along with **On Successful Save** and **On Failed Save** text areas.
   - **Damage** — for example "4d10 thunder".
   - **Additional Damage** — optional secondary damage.
   - **Effect** — narrative description of the element's effect.
4. Add **Countermeasures** using a second inline builder:
   - **Method** — how to counter the trap.
   - **DC** — the check DC.
   - **Checks Needed** — how many successful checks are required (default 1).
   - **Description** — how the countermeasure works.
   - **Effect on Success** — what happens when the trap is countered.
5. Select **Create**.

The note is saved to `z_Traps/<Trap Name>.md` with full trap metadata, elements array, and countermeasures array in frontmatter. Traps are also registered with Fantasy Statblocks if installed.

### Edit a trap

Run **Edit Trap** while viewing a trap note. All fields are pre-filled, including elements and countermeasures.

### Trap integration with encounters

Traps can be included in encounter difficulty calculations. The encounter builder reads trap elements to compute DPR contributions. See [Encounter builder](encounter-builder.md) and [Encounter System](encounter-system.md) for details on SRD imports and encounter spawning.

## Factions

### Create a faction

1. Open the Command Palette and run **Create New Faction**.
2. Fill in the fields:
   - **Faction Name** — required.
   - **Campaign** — select the target campaign.
   - **What is their main goal?** — the faction's primary objective.
   - **How do they pursue it?** — methods and tactics.
   - **Leader** — optional.
   - **Size & Influence** — for example, "Regional, hundreds of members".
   - **Resources** — what the faction controls.
   - **Reputation** — how they are perceived.
   - **Territories** — where they operate.
   - **Allies** — allied factions or groups.
   - **Enemies** — rival factions or groups.
   - **Active Problem** — the faction's current conflict.
3. Select **Create**.

The note is saved to `<Campaign>/Factions/<Faction Name>.md` with `type: faction` frontmatter.

## Points of interest

Points of interest (PoIs) are map markers linked to vault notes. They are primarily used with hexcrawl maps but can be placed on any hex-grid map.

### Create a PoI

1. Select the **Point of Interest** tool on the map toolbar.
2. Select a hex on the map.
3. Fill in the fields:
   - **Name** — required.
   - **Type** — Settlement, Dungeon, Landmark, Danger, Quest, or Custom. The map icon is set automatically based on the type.
   - **Region** — the geographic region.
   - **Tags** — comma-separated tags.
4. Select **Create**.

The note is saved to `<Campaign>/locations/<Name>.md` with `type: point-of-interest` frontmatter.

Points of interest are linked to map markers — see [Marker system](marker-system.md) — and are primarily used with hexcrawl maps; see [Map Manager & Views](map-manager.md) for hexcrawl workflows.

### Edit a PoI

Right-click an existing PoI marker on the map and select **Edit**. Additional fields appear in edit mode:

- **Discovery Status** — whether the party has discovered this location.
- **Visited** — whether the party has visited.
- **Quest Related** — whether this PoI is connected to an active quest.
- **Danger Level** — Low, Medium, High, or Deadly.

### PoI code blocks

Use the `/dnd` slash command to insert a `dnd-poi` code block that renders a list of selected points of interest. The multi-select PoI picker lets you choose which locations to include and their display order.
