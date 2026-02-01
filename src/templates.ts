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
fc-calendar: 
fc-date: 
  year: 
  month: 
  day: 
---
# The World of Your Campaign

## Player Characters

*Manage player characters in your campaign.*

\`\`\`button
name Create New PC
type command
action D&D Campaign Hub: Create New PC
\`\`\`
^button-new-pc

\`\`\`dataview
TABLE WITHOUT ID
  link(file.path, name) AS "Name",
  class + choice(subclass, " (" + subclass + ")", "") AS "Class",
  level AS "Level",
  number(ac) AS "AC",
  (hp + "/" + default(hp_max, "?")) + choice(default(thp, 0) > 0, " (+" + thp + " THP)", "") AS "HP",
  default(init_bonus, 0) AS "Initiative",
  default(speed, 30) AS "Speed",
  default(passive_perception, "?") AS "PP",
  choice(readonlyUrl, "[DDB](" + readonlyUrl + ")", "—") AS "D&D Beyond"
FROM "ttrpgs/{{CAMPAIGN_NAME}}/PCs"
WHERE type = "player"
SORT name ASC
\`\`\`

## NPCs

*Track non-player characters, allies, enemies, and everyone in between.*

\`\`\`button
name Create New NPC
type command
action D&D Campaign Hub: Create New NPC
\`\`\`
^button-new-npc

\`\`\`dataview
TABLE WITHOUT ID
  link(file.path, name) AS "Name",
  default(race, "—") AS "Race",
  default(location, "—") AS "Location",
  default(faction, "—") AS "Faction",
  default(motivation, "—") AS "Wants"
FROM "ttrpgs/{{CAMPAIGN_NAME}}/NPCs"
WHERE type = "npc"
SORT name ASC
\`\`\`

## Sessions

*Create new sessions using the button below or the command palette (Ctrl/Cmd+P → "Create New Session").*

\`\`\`button
name Create New Session
type command
action D&D Campaign Hub: Create New Session
\`\`\`
^button-new-session

\`\`\`dataview
table summary as "Summary" from "ttrpgs/{{CAMPAIGN_NAME}}"
where contains(type,"session")
SORT sessionNum ASC
\`\`\`

## Truths about the campaign/world

*Write down some facts about this campaign or the world that the characters find themselves in.*

- 

## Factions

*Manage factions, organizations, and groups that shape your world.*

\`\`\`button
name Create New Faction
type command
action D&D Campaign Hub: Create New Faction
\`\`\`
^button-new-faction

\`\`\`dataview
TABLE WITHOUT ID
  link(file.path, name) AS "Name",
  default(main_goal, "—") AS "Main Goal",
  default(size, "—") AS "Size",
  default(reputation, "—") AS "Reputation"
FROM "ttrpgs/{{CAMPAIGN_NAME}}/Factions"
WHERE type = "faction"
SORT name ASC
\`\`\`

## Adventures

*Track multi-session story arcs and adventures.*

\`\`\`button
name Create New Adventure
type command
action D&D Campaign Hub: Create New Adventure
\`\`\`
^button-new-adventure

\`\`\`dataview
TABLE WITHOUT ID
  link(file.path, name) AS "Name",
  level_range AS "Level",
  status AS "Status",
  current_act + "/3" AS "Act",
  length(sessions) AS "Sessions"
FROM "ttrpgs/{{CAMPAIGN_NAME}}/Adventures"
WHERE type = "adventure"
SORT file.ctime DESC
\`\`\`

## Custom rules

- [[Character options]]
- [[House Rules|House Rules]]

## [[Safety Tools]]
`;

export const SESSION_GM_TEMPLATE = `---
type: session
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

## Housekeeping

## Recap

## Strong start

> 

## Scenes

- [ ] 
- [ ] 
- [ ] 
- [ ] 

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

# <% tp.frontmatter.name %>

> [!abstract]- Quick Reference
> **Motivation:** <% tp.frontmatter.motivation %>  
> **Methods:** <% tp.frontmatter.pursuit %>  
> **Problem:** <% tp.frontmatter.active_problem %>

## 🎭 Core Engine

### What They Want
<% tp.frontmatter.motivation %>

### How They Pursue It
<% tp.frontmatter.pursuit %>

### Active Problem
<% tp.frontmatter.active_problem %>

---

## 🎨 Character Details

### Physical Detail
<% tp.frontmatter.physical_detail %>

### Speech Pattern
<% tp.frontmatter.speech_pattern %>

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

# <% tp.frontmatter.name %>

> [!info] Quick Stats
> **Class:** <% tp.frontmatter.class %> <% tp.frontmatter.level %>  
> **HP:** <% tp.frontmatter.hp %>/<% tp.frontmatter.hp_max %>  
> **AC:** <% tp.frontmatter.ac %> | **Initiative:** +<% tp.frontmatter.init_bonus %> | **Speed:** <% tp.frontmatter.speed %> ft.

## Character Sheet Links

<% tp.frontmatter.readonlyUrl ? "[Digital Character Sheet](" + tp.frontmatter.readonlyUrl + ")" : "_No digital sheet linked_" %>

<% tp.frontmatter.characterSheetPdf ? "[[" + tp.frontmatter.characterSheetPdf + "|Character Sheet PDF]]" : "_No PDF uploaded_" %>

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

# <% tp.frontmatter.name %>

**Status:** 🎬 Planning  
**Level:** {{LEVEL_RANGE}} | **Current Act:** 1 of 3  
**Expected Sessions:** {{EXPECTED_SESSIONS}}  
**Sessions Played:** 

## The Problem

{{THE_PROBLEM}}

## The Hook

*How do the PCs learn about this and get involved?*

---

## Scene Checklist

### Act 1: Setup & Inciting Incident
**Goal:** Introduce the problem and get PCs invested

- [ ] [[Scene 1 - Opening Hook]]  
  \`15min | social | easy\`
- [ ] [[Scene 2 - Investigation]]  
  \`30min | exploration | medium\`
- [ ] [[Scene 3 - First Confrontation]]  
  \`45min | combat | medium\`

### Act 2: Rising Action & Confrontation
**Goal:** PCs face obstacles, stakes escalate

- [ ] [[Scene 4 - Complication Arises]]  
  \`20min | social | medium\`
- [ ] [[Scene 5 - Major Challenge]]  
  \`40min | combat | hard\`
- [ ] [[Scene 6 - Critical Choice]]  
  \`30min | social | hard\`

### Act 3: Climax & Resolution
**Goal:** Final confrontation and aftermath

- [ ] [[Scene 7 - Preparation]]  
  \`20min | exploration | medium\`
- [ ] [[Scene 8 - Climactic Battle]]  
  \`60min | combat | deadly\`
- [ ] [[Scene 9 - Resolution]]  
  \`10min | social | easy\`

---

## Act 1: Setup & Inciting Incident

**Goal:** Introduce the problem and get PCs invested  
**Expected Duration:** ~90 minutes

### Scenes

- [ ] **Scene 1:** Opening Hook  
  \`duration: 15min\` \`type: social\` \`difficulty: easy\`
  
- [ ] **Scene 2:** Investigation/Discovery  
  \`duration: 30min\` \`type: exploration\` \`difficulty: medium\`
  
- [ ] **Scene 3:** First Confrontation  
  \`duration: 45min\` \`type: combat\` \`difficulty: medium\`

**Sessions:**   
**What Happened:**
- 

---

## Act 2: Rising Action & Confrontation

**Goal:** PCs face obstacles, stakes escalate  
**Expected Duration:** ~90 minutes

### Scenes

- [ ] **Scene 4:** Complication Arises  
  \`duration: 20min\` \`type: social\` \`difficulty: medium\`
  
- [ ] **Scene 5:** Major Challenge  
  \`duration: 40min\` \`type: combat\` \`difficulty: hard\`
  
- [ ] **Scene 6:** Critical Choice  
  \`duration: 30min\` \`type: social\` \`difficulty: hard\`

**Sessions:**   
**What Happened:**
- 

---

## Act 3: Climax & Resolution

**Goal:** Final confrontation and aftermath  
**Expected Duration:** ~90 minutes

### Scenes

- [ ] **Scene 7:** Preparation for Finale  
  \`duration: 20min\` \`type: exploration\` \`difficulty: medium\`
  
- [ ] **Scene 8:** Climactic Battle  
  \`duration: 60min\` \`type: combat\` \`difficulty: deadly\`
  
- [ ] **Scene 9:** Resolution & Aftermath  
  \`duration: 10min\` \`type: social\` \`difficulty: easy\`

**Sessions:**   
**What Happened:**
- 

---

## Encounters & Creatures

**For Initiative Tracker Plugin:**  
Link creatures from \`z_Beastiarity/\` folder

### Act 1 Encounters

- [ ] Scene 3: [Encounter Name] - CR ?, [# creatures]
  - Link: 

### Act 2 Encounters

- [ ] Scene 5: [Encounter Name] - CR ?, [# creatures]
  - Link: 

### Act 3 Encounters

- [ ] Scene 8: [Climactic Battle] - CR ?, [# creatures]
  - Link: 

---

## Key NPCs

\`\`\`button
name Create New NPC for Adventure
type command
action D&D Campaign Hub: Create New NPC
\`\`\`

\`\`\`dataview
TABLE WITHOUT ID
  link(file.path, name) AS "Name",
  motivation AS "Wants",
  location AS "Location"
FROM "ttrpgs/{{CAMPAIGN_NAME}}/NPCs"
WHERE contains(file.outlinks, this.file.link)
SORT name ASC
\`\`\`

---

## Locations & Maps

**Primary Locations:**

1. **Location Name**
   - Description
   - Key features
   - Map: ![[map-image.jpg|400]] or [[Canvas Map]]

---

## Treasure & Rewards

**By Act:**
- Act 1: 
- Act 2: 
- Act 3: 

**XP Milestones:**
- Total XP: 
- Level up at: 

---

## GM Prep Notes

### Session Pacing
- Act 1: Session 1 (scenes 1-3)
- Act 2: Session 2 (scenes 4-6)  
- Act 3: Session 3 (scenes 7-9)

### Backup Plans
What if PCs go off-script?

### Secrets & Clues
- [ ] Clue 1
- [ ] Clue 2
- [ ] Clue 3
- [ ] Clue 4
- [ ] Clue 5
- [ ] Secret 1
- [ ] Secret 2
- [ ] Secret 3

### Resolution Options
**Success:** What happens if PCs succeed?

**Failure:** What happens if they fail or give up?
`;

export const SCENE_TEMPLATE = `---
type: scene
adventure: "{{ADVENTURE_NAME}}"
campaign: "{{CAMPAIGN_NAME}}"
world: "{{WORLD_NAME}}"
act: {{ACT_NUMBER}}
scene_number: {{SCENE_NUMBER}}
duration: {{DURATION}}
scene_type: {{SCENE_TYPE}}
difficulty: {{DIFFICULTY}}
status: planned
date: {{DATE}}
---

# Scene {{SCENE_NUMBER}}: {{SCENE_NAME}}

**Duration:** {{DURATION}} | **Type:** {{SCENE_TYPE}} | **Difficulty:** {{DIFFICULTY}}  
**Act:** {{ACT_NUMBER}} | **Adventure:** [[{{ADVENTURE_NAME}}]]

---

## Scene Goal

*What should happen in this scene?*



## Read-Aloud Text

> *Boxed text to read to players when the scene begins*



## Key Elements

- Important detail 1
- Important detail 2
- Important detail 3

---

## Encounters

### Social Encounter

**NPCs Present:**
- [[NPC Name]] - Role, motivation, what they want

**Skill Checks:**
- Persuasion DC 12: 
- Insight DC 15: 
- Investigation DC 13: 

**Possible Outcomes:**
- Success: 
- Failure: 

### Combat Encounter

**Enemies:** *Link to Initiative Tracker*
- Creature 1 (CR X) x2
- Creature 2 (CR Y) x1

**Tactics:**
- Round 1: 
- If bloodied: 
- Retreat condition: 

**Battlefield:**
- Map: ![[map.jpg]]
- Terrain features: 
- Hazards: 
- Cover: 

---

## What Players Might Do

- **Option 1:** If PCs do X → Y happens
- **Option 2:** If PCs do A → B happens
- **Option 3:** If PCs try Z → Result

---

## Treasure & Rewards

- [ ] Gold: 
- [ ] Item: 
- [ ] XP: 
- [ ] Information: 

---

## What Actually Happened

**Session:** [[Session X]]  
**Date:** 

*GM fills this during/after session*



`;

export const FACTION_TEMPLATE = `---
type: faction
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

# <% tp.frontmatter.name %>

## 🎯 Core Engine

### What do they want?
<% tp.frontmatter.main_goal %>

### How do they pursue it?
<% tp.frontmatter.pursuit_method %>

## 📋 Details

**Leader:** <% tp.frontmatter.leader %>

**Size & Influence:** <% tp.frontmatter.size %>

**Resources:**
<% tp.frontmatter.resources %>

**Reputation:**
<% tp.frontmatter.reputation %>

## 🗺️ Territories & Operations

<% tp.frontmatter.territories %>

## 🤝 Relationships

### Allies
<% tp.frontmatter.allies %>

### Enemies
<% tp.frontmatter.enemies %>

## ⚠️ Current Situation

**Active Problem:**
<% tp.frontmatter.active_problem %>

## Members & Key Figures

- 

## History & Origins

## Notes
`;

export const ITEM_TEMPLATE = `---
type: item
rarity: common
attunement: no
---

# Item

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
level: 1
school: 
casting_time: 1 action
range: 
components: V, S
duration: 
---

# Spell

## Description
Spell description and effects.

## At Higher Levels
How the spell scales with level.
`;

export const CAMPAIGN_TEMPLATE = `---
type: campaign
status: active
dm: 
players: []
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

export const SESSION_DEFAULT_TEMPLATE = `---
type: session
campaign: 
date: 
session_number: 
players_present: []
---

# Session

## Pre-Session Notes
- Objectives
- Plot points to cover
- Potential encounters

## Session Summary
What happened during the session.

## Key Events
- Event 1
- Event 2

## Player Actions
- Player 1: 
- Player 2: 

## Post-Session Notes
- Experience gained
- Treasure distributed
- Plot hooks for next session

## Next Session Prep
- 
`;
