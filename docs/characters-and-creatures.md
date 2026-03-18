# Characters and creatures

The plugin provides creation modals for player characters, NPCs, and full creature stat blocks. Each type generates a structured Markdown note and a matching map marker token.

## Player characters

### Create a PC

1. Open the Command Palette and run **Create Player Character**.
2. Fill in the fields:
   - **Campaign** — select the target campaign.
   - **Character Name** — required.
   - **Player Name** — the real-world player.
3. In GM campaigns, additional stat fields appear:
   - **Class** — supports multiclassing. Select the **+** button to add another class.
   - **Level** — default 1.
   - **Hit Points** — current and maximum as two inline inputs.
   - **Armor Class** — default 10.
   - **Initiative Modifier** — accepts formats like `+2` or `2`.
   - **Speed** — default 30 ft.
4. Optionally link a character sheet:
   - **Digital Character Sheet Link** — URL to D&D Beyond, Roll20, or another service.
   - **Character Sheet PDF** — browse the vault or import a PDF from your computer. The file is saved to `z_Assets/`.
5. In GM campaigns, toggle **Register in Party Manager** (enabled by default) to add the PC to the campaign party automatically. See [Party management](party-management.md) for details.
6. Select **Create**.

The note is saved to `<Campaign>/PCs/<Character Name>.md` with `type: player` frontmatter. A blue shield marker token is created for the battle map.

### Import from D&D Beyond

From the PC creation modal, paste a D&D Beyond character URL or character ID and select **Import from D&D Beyond**. The plugin pulls:

- Name, player name, classes, and level.
- Hit points (current and max), armor class (computed from equipped armor, shields, and magic items), initiative bonus, and speed.
- All six ability scores with modifiers.
- Skills and saving throw proficiencies.
- Senses, languages, and traits.
- Actions, bonus actions, reactions, and spell list.
- A Fantasy Statblocks–compatible statblock embedded in the note for quick viewing in the combat tracker.

The character's read-only D&D Beyond URL is stored in frontmatter for reference.

### PC Quick Stats

Each PC note includes a live Quick Stats block that displays HP, AC, level, class, and ability scores at a glance. The block updates automatically whenever the note's frontmatter changes — for example, when the Combat Tracker syncs HP back to the vault note.

### Import from PDF character sheet

From the PC creation modal, select a PDF file from the vault or upload one from your computer. The plugin auto-detects the best matching profile and fills in all fields. Four profiles are supported:

| Profile | Description |
| --- | --- |
| WotC Official 5e | Standard Wizards of the Coast character sheet PDF |
| D&D Beyond PDF Export | Character sheets exported from D&D Beyond |
| MPMB Automated Sheet | MorePurpleMoreBetter automated character sheets |
| German 5e (Deutsch) | Full German-language field support with bilingual mappings |

Extracted data includes name, class, level, player, race, background, HP, AC, initiative, speed, ability scores, skills, saving throws, features, equipment, and personality traits.

### Edit a PC

Run **Edit PC** while viewing a PC note. All fields are pre-filled from frontmatter. Renaming updates the file name and marker.

### Import a PC

Run **Import PC** to copy or link a player character from one campaign to another:

1. Select the **Target Campaign**.
2. Select the **Import Mode**:
   - **Clone** — creates an independent copy with its own stats and map token.
   - **Link** — creates a lightweight reference note with a transclusion embed pointing to the original. Stats are shared.
3. Select PCs from the list. The modal shows name, class, level, campaign, and player. PCs already in the target campaign are flagged with a warning.
4. Select **Import**.

Both modes auto-register the PC in the Party Manager if the target campaign has a GM role.

## NPCs

### Create an NPC

1. Open the Command Palette and run **Create NPC**.
2. Fill in the fields:
   - **NPC Name** — required.
   - **Campaign** — select the target campaign.
   - **What do they want?** — the NPC's core motivation.
   - **How do they pursue it?** — methods and tactics.
   - **Physical Detail** — memorable appearance.
   - **Speech Pattern** — mannerisms, accent, or quirks.
   - **Active Problem** — the NPC's current conflict.
3. Select **Create**.

The note is saved to `<Campaign>/NPCs/<NPC Name>.md` with `type: npc` frontmatter. An olive-green person marker token is created for the battle map.

### Edit an NPC

Run **Edit NPC** while viewing an NPC note. All fields are pre-filled.

## Creatures

### Create a creature

1. Open the Command Palette and run **Create Creature**.
2. Optionally paste a complete statblock into the **Parse Statblock** text area and select **Parse**. The plugin supports both 2014 (D&D Beyond classic) and 2024 (new Monster Manual) formats and auto-fills all fields.
3. Fill in or adjust the fields:
   - **Basic info** — Creature Name (required), Size (Tiny through Gargantuan), Type, Subtype/Tags, Alignment.
   - **Combat statistics** — Armor Class, Hit Points, Hit Dice, Speed.
   - **Ability scores** — STR, DEX, CON, INT, WIS, CHA (1–30). Live modifier calculation is shown next to each score.
   - **Additional statistics** — Saving Throws, Skills, Damage Vulnerabilities, Damage Resistances, Damage Immunities, Condition Immunities, Senses, Languages, Challenge Rating.
   - **Traits and features** — a dynamic list of name/description pairs. Select **Add Trait** to add more.
   - **Actions** — a dynamic list of name/description pairs. Select **Add Action** to add more.
   - **Description** — lore, appearance, and behavior.
4. Select **Create**.

The note is saved to `z_Beastiarity/<Creature Name>.md` with `statblock: true` and `layout: Basic 5e Layout` frontmatter, compatible with the Fantasy Statblocks plugin. A `statblock` code block is included for rendering. A dark-red dragon marker token is created with the correct D&D size.

Bonus actions, reactions, and legendary actions parsed from the statblock import are stored in frontmatter and rendered by Fantasy Statblocks.

### Edit a creature

Run **Edit Creature** while viewing a creature note. All fields are pre-filled from frontmatter, including traits, actions, and ability scores. Renaming updates the file, statblock registration, and marker.

### Fantasy Statblocks integration

When the Fantasy Statblocks plugin is installed, newly created and edited creatures are automatically registered in its bestiary. This makes them available for inline `statblock` rendering and for the encounter builder's vault search.

## SRD creature import

Open **Settings** and select **Import SRD Creatures** under the SRD Creature Token Import section. The plugin downloads all 334 SRD monsters with artwork from the D&D 5e API, creates notes in `z_Beastiarity/` with full stat blocks, and registers matching map marker tokens in the marker library with correct creature sizes and darkvision values. A progress indicator shows the import status.

Creature frontmatter is compatible with the Fantasy Statblocks plugin. Multi-line descriptions (traits, actions, legendary actions) use YAML `|` block scalars so line breaks are preserved. Empty list fields (`skillsaves`, `saves`, `spells`, etc.) default to `[]`.

### Migrating existing creature notes

If you imported SRD creatures with a previous plugin version, run the migration from **Settings → Migrate Notes** to repair frontmatter. The migration adds the `plugin_type: creature` field, replaces old `dataviewjs` button blocks with native `dnd-hub` blocks, quotes special-character values, and converts multi-line descriptions to block scalars.
