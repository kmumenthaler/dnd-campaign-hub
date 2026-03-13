/**
 * Template files for D&D Campaign Hub
 * These templates are bundled with the plugin and deployed during vault initialization
 */

export const WORLD_TEMPLATE = `---
world: 
campaign: 
status: active
role: player
system:
type: world
template_version: 1.3.0
fc-calendar: 
fc-date: 
  year: 
  month: 
  day: 
---
# The World of Your Campaign

\`\`\`dnd-hub
\`\`\`

## Player Characters

*Manage player characters in your campaign.*

\`\`\`dnd-hub-table
source: ttrpgs/{{CAMPAIGN_NAME}}/PCs
type: player
\`\`\`

## NPCs

*Track non-player characters, allies, enemies, and everyone in between.*

\`\`\`dnd-hub-table
source: ttrpgs/{{CAMPAIGN_NAME}}/NPCs
type: npc
\`\`\`

## Sessions

*Create new sessions using the command palette (Ctrl/Cmd+P → "Create New Session").*

\`\`\`dnd-hub-table
source: ttrpgs/{{CAMPAIGN_NAME}}
type: session
\`\`\`

## Truths about the campaign/world

*Write down some facts about this campaign or the world that the characters find themselves in.*

- 

## Factions

*Manage factions, organizations, and groups that shape your world.*

\`\`\`dnd-hub-table
source: ttrpgs/{{CAMPAIGN_NAME}}/Factions
type: faction
\`\`\`

## Adventures

*Track multi-session story arcs and adventures.*

\`\`\`dnd-hub-table
source: ttrpgs/{{CAMPAIGN_NAME}}/Adventures
type: adventure
\`\`\`

## Custom rules

- [[Character options]]
- [[House Rules|House Rules]]

## [[Safety Tools]]
`;

export const SESSION_GM_TEMPLATE = `---
type: session
template_version: 1.5.0
campaign: 
world: 
adventure: 
starting_scene: ""
ending_scene: ""
party_id: ""
sessionNum: 
location: 
date: 
fc-calendar: 
fc-date: 
  year: 
  month: 
  day: 
fc-end: 
  year: 
  month: 
  day: 
long_rest: false
short_rest: false
summary: ""
tags: inbox
art: ""
---
# Session 

## Session Summary

> [!tldr] 
>  ^summary

---

## Housekeeping

## Recap

## Strong start

> 

## Scenes

\`\`\`dnd-hub-view
scene-navigator
\`\`\`

## Secrets and Clues

- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 

## Loot

- [ ] 

---

## Log

`;

export const SESSION_PLAYER_TEMPLATE = `---
type: session
template_version: 1.2.1
campaign: 
world: 
sessionNum: 
location: 
date: 
fc-calendar: 
fc-date: 
  year: 
  month: 
  day: 
fc-end: 
  year: 
  month: 
  day: 
long_rest: false
short_rest: false
summary: ""
tags: inbox
art: ""
---
# Session

## Session Summary

 > [!tldr] 
>  ^summary

---

## Recap

---

## Log

`;

export const NPC_TEMPLATE = `---
type: npc
template_version: 1.4.0
name: 
world: 
campaign: 
date: 
tags: 
  - npc
  - inbox

# Core NPC Engine
motivation: 
pursuit: 
physical_detail: 
speech_pattern: 
active_problem: 

# Additional Details (fill in later)
age: 
race: 
gender: 
pronouns: 
faction: 
location: 
occupation: 
class: 
character_role: 
condition: alive
status: active

# Extended Information
appearance: 
personality: 
background: 
abilities: 
weaknesses: 
behavior: 
statblock: ""
notes: []
---

# {{name}}

\`\`\`dnd-hub
\`\`\`

> [!abstract]- Quick Reference
> **Motivation:** {{motivation}}  
> **Methods:** {{pursuit}}  
> **Problem:** {{active_problem}}

## 🎭 Core Engine

### What They Want
{{motivation}}

### How They Pursue It
{{pursuit}}

### Active Problem
{{active_problem}}

---

## 🎨 Character Details

### Physical Detail
{{physical_detail}}

### Speech Pattern
{{speech_pattern}}

---

## 📝 Extended Information

### Appearance
*Add detailed physical description here*

### Personality Traits
*Key personality characteristics*

- 
- 
- 

### Background
*History, origins, and formative experiences*



### Abilities & Strengths
- 
- 

### Weaknesses & Flaws
- 
- 

---

## 🎲 Game Information

### Stats & Combat
\`\`\`statblock
# Leave empty or add stat block here
\`\`\`

### Role in Story
*How does this NPC fit into the campaign?*



---

## 🔗 Relationships

### Allies & Friends
- 

### Enemies & Rivals
- 

### Faction Ties
- 

---

## 🗒️ Session Notes

### First Appearance


### Key Interactions


### Development Arc


---

## 📌 GM Notes

*Private notes, plot hooks, secrets*


`;

export const PC_TEMPLATE = `---
type: player
template_version: 1.3.0
name: 
player: 
campaign: 
world: 
race: 
class: 
subclass: 
level: 1
hp: 0
hp_max: 0
thp: 0
ac: 10
init_bonus: 0
speed: 30
passive_perception: 10
background: 
alignment: 
experience: 0
readonlyUrl: 
characterSheetPdf: 
date: 
---

# {{name}}

\`\`\`dnd-hub
\`\`\`

> [!info] Quick Stats
> **Class:** {{class}} {{level}}  
> **HP:** {{hp}}/{{hp_max}}  
> **AC:** {{ac}} | **Initiative:** +{{init_bonus}} | **Speed:** {{speed}} ft.

## Character Sheet Links

{{characterSheetLink}}

{{characterSheetPdf}}

## Description

*Physical appearance and personality traits*



## Background

*Character history and backstory*



## Stats & Abilities

### Ability Scores
- **STR**:  ( + )
- **DEX**:  ( + )
- **CON**:  ( + )
- **INT**:  ( + )
- **WIS**:  ( + )
- **CHA**:  ( + )

### Proficiencies
**Saving Throws:** 
**Skills:** 
**Languages:** 
**Tools:** 

## Combat

### Attacks & Actions




### Spells




## Equipment & Inventory




## Features & Traits




## Notes & Development

### Character Goals


### Relationships


### Session Notes


`;

export const ADVENTURE_TEMPLATE = `---
type: adventure
template_version: 1.4.0
name: 
campaign: 
world: 
status: planning
level_range: 
current_act: 1
expected_sessions: 3
sessions: []
date: 
---

# {{name}}

**Status:** 🎬 Planning  
**Level:** {{LEVEL_RANGE}} | **Current Act:** 1 of 3  
**Expected Sessions:** {{EXPECTED_SESSIONS}}  
**Sessions Played:** 

\`\`\`dnd-hub
\`\`\`

## The Problem

{{THE_PROBLEM}}

## The Hook

*How do the PCs learn about this and get involved?*

---

## Scenes

\`\`\`dnd-hub-view
adventure-scenes
\`\`\`

---

## GM Prep Notes

### Session Pacing
*How do you plan to pace this adventure across sessions?*

### Backup Plans
*What if PCs go off-script?*

### Secrets & Clues
- [ ] Clue 1
- [ ] Clue 2
- [ ] Clue 3
- [ ] Secret 1
- [ ] Secret 2

### Resolution Options
**Success:** *What happens if PCs succeed?*

**Failure:** *What happens if they fail or give up?*

---

## Key NPCs

*Link important NPCs from your campaign*

---

## Treasure & Rewards

*Track loot and XP for this adventure*

**XP Milestones:**
- Total XP: 
- Level up at: 
`;

// ============================================================================
// SCENE TEMPLATE
// ============================================================================

export const SCENE_TEMPLATE = `---
type: scene
template_version: 2.3.0
adventure: "{{ADVENTURE_NAME}}"
campaign: "{{CAMPAIGN}}"
world: "{{WORLD}}"
act: {{ACT_NUMBER}}
scene_number: {{SCENE_NUMBER}}
duration: {{DURATION}}
scene_type: {{TYPE}}
difficulty: {{DIFFICULTY}}
status: not-started
sessions: []
tracker_encounter: {{TRACKER_ENCOUNTER}}
encounter_file: {{ENCOUNTER_FILE}}
encounter_creatures: {{ENCOUNTER_CREATURES}}
encounter_difficulty: {{ENCOUNTER_DIFFICULTY}}
selected_party_id: "{{SELECTED_PARTY_ID}}"
selected_party_members: {{SELECTED_PARTY_MEMBERS}}
date: {{DATE}}
---

# Scene {{SCENE_NUMBER}}: {{SCENE_NAME}}

**Duration:** {{DURATION}} | **Type:** {{TYPE}} | **Difficulty:** {{DIFFICULTY}}  
**Act:** {{ACT_NUMBER}} | **Adventure:** [[{{ADVENTURE_NAME}}]]

\`\`\`dnd-hub
\`\`\`

---
`;

export const TRAP_TEMPLATE = `---
type: trap
template_version: 1.3.1
campaign: 
adventure: 
world: 
scene: 
trap_name: 
trap_type: simple
threat_level: setback
min_level: 1
max_level: 20
trigger: 
elements: []
countermeasures: []
date: 
---

# {{trap_name}}

\`\`\`dnd-hub
\`\`\`

## Trap Details

**Type:** {{trap_type}} Trap  
**Threat Level:** {{threat_level}}  
**Level Range:** {{min_level}}-{{max_level}}

### Trigger Condition
{{trigger}}

---

## Trap Elements & Effects

\`\`\`dnd-hub-view
trap-elements
\`\`\`

---

## Countermeasures

\`\`\`dnd-hub-view
trap-countermeasures
\`\`\`

---

## GM Notes

### Setup
*How to describe and introduce this trap*

### Running the Trap
*Tips for managing the trap in combat*

### Disabling
*Additional notes on countermeasures and player creativity*

---

## Session History

**Created:** {{DATE}}

*Record when this trap was encountered and what happened*

`;

export const FACTION_TEMPLATE = `---
type: faction
template_version: 1.1.0
name: 
campaign: 
world: 
main_goal: ""
pursuit_method: ""
leader: 
size: 
resources: ""
reputation: ""
territories: ""
allies: ""
enemies: ""
active_problem: ""
date: 
---

# {{name}}

\`\`\`dnd-hub
\`\`\`

## 🎯 Core Engine

### What do they want?
{{main_goal}}

### How do they pursue it?
{{pursuit_method}}

## 📋 Details

**Leader:** {{leader}}

**Size & Influence:** {{size}}

**Resources:**
{{resources}}

**Reputation:**
{{reputation}}

## 🗺️ Territories & Operations

{{territories}}

## 🤝 Relationships

### Allies
{{allies}}

### Enemies
{{enemies}}

## ⚠️ Current Situation

**Active Problem:**
{{active_problem}}

## Members & Key Figures

- 

## History & Origins

## Notes
`;

export const ITEM_TEMPLATE = `---
type: item
template_version: 1.1.0
rarity: common
attunement: no
---

# Item

\`\`\`dnd-hub
\`\`\`

## Description
Item description and appearance.

## Properties
- Property 1
- Property 2

## History
Item's background and origins.

## Current Location
Where the item is currently located.
`;

export const SPELL_TEMPLATE = `---
type: spell
template_version: 1.1.0
level: 1
school: 
casting_time: 1 action
range: 
components: V, S
duration: 
---

# Spell

\`\`\`dnd-hub
\`\`\`

## Description
Spell description and effects.

## At Higher Levels
How the spell scales with level.
`;

export const CAMPAIGN_TEMPLATE = `---
type: campaign
template_version: 1.1.0
status: active
dm: 
players: []
party_id: ""
start_date: 
current_session: 
---

# Campaign

## Overview
Brief description of the campaign.

## Players
- Player 1
- Player 2

## Key NPCs
- [[NPC Name]]

## Adventures
- [[Adventure Name]]

## Sessions
- [[Session 1]]
`;

// Keep one canonical session schema to prevent frontmatter/version drift.
export const SESSION_DEFAULT_TEMPLATE = SESSION_GM_TEMPLATE;

export const POI_TEMPLATE = `---
type: point-of-interest
template_version: 1.1.0
name: 
poi-type: settlement
icon: 🏰
tags: []
campaign: 
region: 
discovered: false
visited: false
quest-related: false
danger-level: 
---

# {{icon}} {{name}}

\`\`\`dnd-hub
\`\`\`

> [!info] Quick Info
> **Type:** {{poi-type}}  
> **Region:** {{region}}  
> **Status:** {{status}}

## Description

*What the players see when they arrive at this location.*



## Features

*Notable features, buildings, or characteristics.*

- 


## GM Notes

*Secret information, plot hooks, and encounter details.*



## NPCs

*Important characters at this location.*



## Quests & Hooks

*Active quests, rumors, and adventure hooks.*



## Resources & Services

*Available goods, services, or resources.*



## Dangers & Challenges

*Threats, hazards, or obstacles.*



## History & Lore

*Background information and historical context.*



## Connections

*Links to other locations, factions, or plot threads.*

**Related Locations:** 

**Factions:** 

**Ongoing Plots:** 


## Session Notes

*Track what happened when players visited.*


`;

export const ENCOUNTER_TABLE_TEMPLATE = `---
type: encounter-table
template_version: 1.3.0
name: 
environment: 
party_level: 3
party_size: 4
entries: 6
campaign: 
date_created: 
---

# 🎲 Random Encounter Table

\`\`\`dnd-hub
\`\`\`

> [!info] Table Info
> **Environment:**  
> **Party Level:**  | **Party Size:** 
> **Roll:** 1d6

## Encounter Table

| Roll | Encounter | Difficulty | XP |
|------|-----------|------------|-----|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |
| 4 |  |  |  |
| 5 |  |  |  |
| 6 |  |  |  |

## Encounter Details

*Add details for each encounter here.*

## GM Notes

*Add environmental details, encounter triggers, or narrative hooks here.*
`;
