# Adventures and scenes

Adventures organize your story arcs into a three-act structure. Scenes are individual planning notes that you create inside an adventure — one per encounter, social interaction, or exploration beat.

## Create an adventure

1. Open the Command Palette and run **Create New Adventure**.
2. Fill in the fields:
   - **Adventure Name** — the title of the story arc.
   - **Campaign** — the dropdown shows only campaigns where you are the Game Master.
   - **The Problem** — describe the core conflict or hook that drives the adventure.
   - **Target Level Range** — the starting and ending character levels.
   - **Expected Sessions** — how many sessions you expect the adventure to span.
3. Select **Create Adventure**.

The plugin creates an adventure folder with a dashboard note and an empty `Scenes/` subfolder. No scene notes are generated automatically — you add scenes yourself as you plan the adventure.

### Adventure dashboard

The adventure dashboard includes:

- Frontmatter with name, campaign, status, level range, current act, and expected sessions.
- A **Create New Scene** button that opens the scene creation modal pre-filled with this adventure.
- A scene progress checklist grouped by act with interactive checkboxes (populated as you add scenes).
- The problem description.
- Act summaries for setup, rising action, and climax.
- Campaign planning notes and general planning areas.

### Adventure folder structure

```
ttrpgs/<Campaign>/Adventures/<Adventure Name>/
├── <Adventure Name>.md      ← dashboard note
└── Scenes/                  ← scene notes go here
```

## Edit or delete an adventure

- Run **Edit Adventure** from the Command Palette while viewing an adventure note. The modal pre-fills all fields and preserves the adventure status, linked sessions, and current act.
- Run **Delete Adventure** to remove the adventure folder and all its scene notes.

## Create a scene

You can create scenes in two ways:

- Select the **Create New Scene** button on the adventure dashboard.
- Open the Command Palette and run **Create New Scene**.

Fill in the fields:

1. **Adventure** — select the parent adventure from the dropdown.
2. **Scene Name** — the scene title.
3. **Act** — Act 1 (Setup), Act 2 (Rising Action), or Act 3 (Climax).
4. **Scene Number** — auto-suggested as the next available number. You can enter a different number and the plugin renumbers existing scenes to make room.
5. **Duration** — 15, 20, 30, 40, 45, or 60 minutes.
6. **Type** — Social, Combat, Exploration, Puzzle, or Montage.
7. **Difficulty** — Easy, Medium, Hard, or Deadly.

For **Combat** scenes, an embedded encounter builder appears below the scene fields:

- Toggle **Create Initiative Tracker Encounter** to save the encounter to Initiative Tracker.
- Toggle **Use Color Names** to assign color suffixes (for example, "Goblin (Red)") instead of numbers to duplicate creatures.
- Toggle **Include Party Members** and select a party from Initiative Tracker for live difficulty calculation.
- Add creatures from the vault bestiary or enter custom creatures with HP, AC, and CR.
- Each creature has **Friendly** and **Hidden** toggles.
- A live difficulty card shows the rating (Trivial through TPK Risk), estimated rounds, and stat comparison.

Select **Create Scene** when finished. See [Encounter builder](encounter-builder.md) for full details on difficulty calculation.

### Scene note structure

Each scene note includes the following sections:

- **Frontmatter** — name, adventure, act, scene number, duration, type, difficulty, and status.
- **What Happens** — pre-session planning notes.
- **Read-Aloud Text** — descriptions to read to players verbatim.
- **Skill Checks and Traps** — DCs, consequences, and trap details.
- **Encounters** — monster stats, tactics, and treasure.
- **NPCs** — personalities and motivations for NPCs in this scene.
- **Clues and Discoveries** — plot progression elements.
- **Treasure and Rewards** — loot and XP.
- **What Actually Happened** — post-session recap written after the game.
- **DM Notes** — private observations and adjustments.

## Edit or delete a scene

- Run **Edit Scene** while viewing a scene note. The modal pre-fills all fields including encounter creatures and party selections.
- Run **Delete Scene** to remove the scene note.

## Scene snippets

Type `/dnd` in any note to open a searchable popup of quick-insert content templates. Snippets are organized into categories:

### Narrative

- Read-Aloud Text, GM Note, NPC Dialogue, Pacing Marker, NPC Voice/Quirk, Scene Transition, Atmosphere.

### Mechanics

- Skill Check, Secret/Hidden Element, Branching Outcome, Random Table, Condition Reminder, Skill Challenge, Puzzle/Riddle.

### Combat

- Quick Enemy Stats, Terrain/Hazard, Loot/Treasure, Trap, Boss Abilities.

### Planning

- Room/Area, Handout/Letter, Rumor Table, Shop/Merchant, Quest Hook, Building/Structure, Rest Stop, Recap.

### Reference

- Clue/Secret.

Each snippet inserts a Markdown template with the cursor placed at the primary editing point. Some snippets — such as Trap, Encounter Widget, and PoI — open a picker modal instead of inserting text directly.

## Scene status tracking

Scenes have a status stored in frontmatter: `not-started`, `in-progress`, or `completed`. When you create or end a session with a linked adventure, the plugin offers to update scene statuses automatically:

- Scenes before the current scene are marked as completed.
- The starting scene is marked as in progress.

The adventure dashboard shows interactive checkboxes that reflect these statuses.
