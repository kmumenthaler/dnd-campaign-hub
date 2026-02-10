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
template_version: 1.0.0
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
template_version: 1.1.0
campaign: 
world: 
adventure: 
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

\`\`\`dataviewjs
// Get current session's adventure (if linked)
const sessionFile = dv.current();
let adventureLink = sessionFile.adventure;

// Parse wikilink if present: "[[path]]" -> path
if (adventureLink && typeof adventureLink === 'string') {
  const match = adventureLink.match(/\[\[(.+?)\]\]/);
  if (match) adventureLink = match[1];
}

if (adventureLink) {
  // Get the adventure file
  const adventurePage = dv.page(adventureLink);
  
  if (adventurePage) {
    const adventureName = adventurePage.name || adventurePage.file.name;
    const campaignFolder = adventurePage.campaign;
    const adventureFolder = adventurePage.file.folder;
    
    // Find scenes in both flat and folder structures
    let scenesFlat = dv.pages(\`"\${campaignFolder}/Adventures/\${adventureName} - Scenes"\`)
      .where(p => p.file.name.startsWith("Scene"));
    let scenesFolder = dv.pages(\`"\${adventureFolder}"\`)
      .where(p => p.file.name.startsWith("Scene"));
    
    let allScenes = [...scenesFlat, ...scenesFolder];
    
    if (allScenes.length > 0) {
      // Sort by scene number
      allScenes.sort((a, b) => {
        const aNum = parseInt(a.scene_number || a.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
        const bNum = parseInt(b.scene_number || b.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
        return aNum - bNum;
      });
      
      dv.header(4, "Adventure Scenes");
      for (const scene of allScenes) {
        const status = scene.status === "completed" ? "✅" : scene.status === "in-progress" ? "🎬" : "⬜";
        const duration = scene.duration || "?min";
        const type = scene.type || "?";
        dv.paragraph(\`\${status} \${dv.fileLink(scene.file.path, false, scene.file.name)} - \\\`\${duration} | \${type}\\\`\`);
      }
    }
  }
} else {
  dv.paragraph("*No adventure linked to this session.*");
  dv.paragraph("To link an adventure, add it to the frontmatter:");
  dv.paragraph(\`\\\`\\\`\\\`yaml\\nadventure: "[[Your Adventure Name]]"\\n\\\`\\\`\\\`\`);
  dv.paragraph("Or create a new adventure:");
  const createAdvBtn = dv.el('button', '🗺️ Create Adventure');
  createAdvBtn.className = 'mod-cta';
  createAdvBtn.style.marginTop = '10px';
  createAdvBtn.onclick = () => {
    app.commands.executeCommandById('dnd-campaign-hub:create-adventure');
  };
}
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
template_version: 1.1.0
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
template_version: 1.0.0
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
template_version: 1.0.0
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
template_version: 1.0.1
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

\`\`\`dataviewjs
const sceneButton = dv.el('button', '🎬 Create New Scene');
sceneButton.className = 'mod-cta';
sceneButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:create-scene');
};

const trapButton = dv.el('button', '🪤 Create New Trap', { cls: 'mod-cta' });
trapButton.style.marginLeft = '10px';
trapButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:create-trap');
};

const sessionButton = dv.el('button', '📜 Create Session for This Adventure', { cls: 'mod-cta' });
sessionButton.style.marginLeft = '10px';
sessionButton.onclick = async () => {
  const adventurePath = dv.current().file.path;
  const plugin = app.plugins.plugins['dnd-campaign-hub'];
  new plugin.SessionCreationModal(app, plugin, adventurePath).open();
};
\`\`\`

## The Problem

{{THE_PROBLEM}}

## The Hook

*How do the PCs learn about this and get involved?*

---

## Scenes

\`\`\`dataviewjs
// Get all scenes for this adventure
const adventureName = dv.current().name || dv.current().file.name;
const campaignFolder = dv.current().campaign;
const adventureFolder = dv.current().file.folder;

// Find scenes in both flat and folder structures
// Flat: Adventures/Adventure - Scenes/
// Folder: Adventures/Adventure/ (scenes directly or in Act subfolders)
let scenesFlat = dv.pages(\`"\${campaignFolder}/Adventures/\${adventureName} - Scenes"\`)
  .where(p => p.file.name.startsWith("Scene"));
let scenesFolder = dv.pages(\`"\${adventureFolder}"\`)
  .where(p => p.file.name.startsWith("Scene"));

let allScenes = [...scenesFlat, ...scenesFolder];

if (allScenes.length === 0) {
  dv.paragraph("*No scenes created yet. Use the button above to create your first scene.*");
} else {
  // Sort by scene number
  allScenes.sort((a, b) => {
    const aNum = parseInt(a.scene_number || a.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
    const bNum = parseInt(b.scene_number || b.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
    return aNum - bNum;
  });

  // Group by act if act numbers exist
  const hasActs = allScenes.some(s => s.act);
  
  if (hasActs) {
    // Display grouped by acts
    const acts = {1: [], 2: [], 3: []};
    allScenes.forEach(scene => {
      const act = scene.act || 1;
      if (acts[act]) acts[act].push(scene);
    });

    const actNames = {
      1: "Act 1: Setup & Inciting Incident",
      2: "Act 2: Rising Action & Confrontation",
      3: "Act 3: Climax & Resolution"
    };

    for (const [actNum, actScenes] of Object.entries(acts)) {
      if (actScenes.length > 0) {
        dv.header(3, actNames[actNum]);
        for (const scene of actScenes) {
          const status = scene.status === "completed" ? "✅" : scene.status === "in-progress" ? "🎬" : "⬜";
          const duration = scene.duration || "?min";
          const type = scene.type || "?";
          const difficulty = scene.difficulty || "?";
          dv.paragraph(\`\${status} **\${dv.fileLink(scene.file.path, false, scene.file.name)}**  \\n\\\`\${duration} | \${type} | \${difficulty}\\\`\`);
        }
      }
    }
  } else {
    // Display as simple list
    for (const scene of allScenes) {
      const status = scene.status === "completed" ? "✅" : scene.status === "in-progress" ? "🎬" : "⬜";
      const duration = scene.duration || "?min";
      const type = scene.type || "?";
      const difficulty = scene.difficulty || "?";
      dv.paragraph(\`\${status} **\${dv.fileLink(scene.file.path, false, scene.file.name)}**  \\n\\\`\${duration} | \${type} | \${difficulty}\\\`\`);
    }
  }
}
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

export const SCENE_TEMPLATE = `---
type: scene
template_version: 1.3.1
adventure: "{{ADVENTURE_NAME}}"
campaign: "{{CAMPAIGN}}"
world: "{{WORLD}}"
act: {{ACT_NUMBER}}
scene_number: {{SCENE_NUMBER}}
duration: {{DURATION}}
scene_type: {{TYPE}}
difficulty: {{DIFFICULTY}}
status: planned
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

\`\`\`dataviewjs
// Action buttons for scene management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Scene button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Scene",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-scene");
});

// Delete Scene button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Scene",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-scene");
});

// Open Tracker button (if combat scene with encounter)
const trackerEncounter = dv.current().tracker_encounter;
if (trackerEncounter && trackerEncounter !== "") {
  const openTrackerBtn = buttonContainer.createEl("button", { 
    text: "⚔️ Open & Load in Tracker",
    attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--interactive-accent); color: var(--text-on-accent);" }
  });
  openTrackerBtn.addEventListener("click", async () => {
    const initiativeTracker = app.plugins?.plugins?.["initiative-tracker"];
    
    if (!initiativeTracker) {
      new Notice("Initiative Tracker plugin not found");
      return;
    }
    
    const encounter = initiativeTracker.data?.encounters?.[trackerEncounter];
    if (!encounter) {
      new Notice("Encounter \\"" + trackerEncounter + "\\" not found. Try recreating it.");
      return;
    }
    
    // Ensure all creatures have proper status array
    if (encounter.creatures) {
      for (const creature of encounter.creatures) {
        if (!creature.status) {
          creature.status = [];
        }
      }
    }
    
    // Use Initiative Tracker's internal tracker API to load the encounter
    try {
      if (initiativeTracker.tracker?.new) {
        initiativeTracker.tracker.new(initiativeTracker, encounter);
        new Notice("✅ Loaded encounter: " + trackerEncounter);
      } else {
        new Notice("⚠️ Could not load encounter. Try using Load Encounter from Initiative Tracker menu.");
      }
    } catch (e) {
      console.error("Error loading encounter:", e);
      new Notice("⚠️ Could not load encounter: " + e.message);
    }
    
    // Open Initiative Tracker view
    app.commands.executeCommandById("initiative-tracker:open-tracker");
  });
}
\`\`\`

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

\`\`\`dataviewjs
const trackerEncounter = dv.current().tracker_encounter;
const encounterCreatures = dv.current().encounter_creatures;
const encounterDifficulty = dv.current().encounter_difficulty;

// Display calculated difficulty if available
if (encounterDifficulty && encounterDifficulty.difficulty) {
  const diffColors = {
    "Trivial": "#888888",
    "Easy": "#00aa00",
    "Medium": "#aaaa00",
    "Hard": "#ff8800",
    "Deadly": "#ff0000",
    "TPK Risk": "#880000"
  };
  const color = diffColors[encounterDifficulty.difficulty] || "#888888";
  
  const diffCard = dv.el('div', '');
  diffCard.style.cssText = 'background: var(--background-secondary); border-radius: 8px; padding: 12px; margin-bottom: 15px; border-left: 4px solid ' + color;
  
  // Header with badge
  const header = dv.el('div', '', { container: diffCard });
  header.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 10px;';
  
  const badge = dv.el('span', encounterDifficulty.difficulty, { container: header });
  badge.style.cssText = 'background: ' + color + '; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 14px;';
  
  const rounds = dv.el('span', '~' + encounterDifficulty.roundsToDefeat + ' rounds', { container: header });
  rounds.style.cssText = 'opacity: 0.8;';
  
  // Stats grid
  const grid = dv.el('div', '', { container: diffCard });
  grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 12px;';
  
  // Party column
  const partyCol = dv.el('div', '', { container: grid });
  dv.el('strong', '⚔️ Party', { container: partyCol });
  dv.el('div', 'HP Pool: ' + encounterDifficulty.partyHP, { container: partyCol });
  dv.el('div', 'Effective DPR: ' + encounterDifficulty.partyEffectiveDPR, { container: partyCol });
  
  // Enemy column
  const enemyCol = dv.el('div', '', { container: grid });
  dv.el('strong', '👹 Enemies (' + encounterDifficulty.enemyCount + ')', { container: enemyCol });
  dv.el('div', 'HP Pool: ' + encounterDifficulty.enemyHP, { container: enemyCol });
  dv.el('div', 'Effective DPR: ' + encounterDifficulty.enemyEffectiveDPR, { container: enemyCol });
}

if (trackerEncounter && trackerEncounter !== "") {
  dv.header(4, "⚔️ " + trackerEncounter);
  
  // Display creature list
  if (encounterCreatures && Array.isArray(encounterCreatures) && encounterCreatures.length > 0) {
    dv.paragraph("**Enemies:**");
    const list = dv.el('ul', "");
    for (const creature of encounterCreatures) {
      const stats = [];
      if (creature.cr) stats.push(\`CR \${creature.cr}\`);
      if (creature.hp) stats.push(\`HP \${creature.hp}\`);
      if (creature.ac) stats.push(\`AC \${creature.ac}\`);
      const statsStr = stats.length > 0 ? \` (\${stats.join(", ")})\` : "";
      
      // Create wiki-link if path is available for statblock plugin recognition
      const nameDisplay = creature.path 
        ? \`[[\${creature.path}|\${creature.name}]]\`
        : creature.name;
      
      dv.el('li', \`\${nameDisplay}\${statsStr} x\${creature.count}\`, { container: list });
    }
  }
  
  // Open Initiative Tracker button
  dv.paragraph("");
  const openBtn = dv.el('button', '⚔️ Open Initiative Tracker');
  openBtn.className = 'mod-cta';
  openBtn.style.marginRight = '10px';
  openBtn.onclick = async () => {
    const initiativePlugin = app.plugins?.plugins?.['initiative-tracker'];
    
    // Try to find and reveal existing tracker view
    const trackerViewType = 'initiative-tracker-view';
    let foundView = false;
    
    app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view?.getViewType() === trackerViewType) {
        // Found the tracker view, reveal it
        app.workspace.revealLeaf(leaf);
        foundView = true;
        new Notice('✅ Initiative Tracker opened');
        return true; // Stop iterating
      }
    });
    
    // If view wasn't found, try to open it with command
    if (!foundView) {
      const commandId = 'initiative-tracker:open-tracker';
      try {
        const success = app.commands.executeCommandById(commandId);
        if (success) {
          new Notice('✅ Opening Initiative Tracker...');
        } else {
          new Notice('⚠️ Could not open Initiative Tracker. Please open it manually from the command palette.');
        }
      } catch (e) {
        console.error('Error opening Initiative Tracker:', e);
        new Notice('⚠️ Could not open Initiative Tracker. Please open it manually from the command palette.');
      }
    }
  };
  
  // Load encounter button
  const loadBtn = dv.el('button', '📋 Load Encounter');
  loadBtn.className = 'mod-warning';
  loadBtn.onclick = async () => {
    const initiativePlugin = app.plugins?.plugins?.['initiative-tracker'];
    if (!initiativePlugin) {
      new Notice('❌ Initiative Tracker plugin not found!');
      return;
    }
    
    // Check if the encounter exists in saved encounters
    if (!initiativePlugin.data?.encounters?.[trackerEncounter]) {
      new Notice(\`❌ Encounter "\${trackerEncounter}" not found in Initiative Tracker!\`);
      return;
    }
    
    // Use Initiative Tracker's internal tracker API to load the encounter
    const encounterData = initiativePlugin.data.encounters[trackerEncounter];
    
    try {
      // Access the tracker store (he.new is the method used by Initiative Tracker)
      if (initiativePlugin.tracker?.new) {
        initiativePlugin.tracker.new(initiativePlugin, encounterData);
        new Notice(\`✅ Loaded encounter: \${trackerEncounter}\`);
      } else if (typeof initiativePlugin.tracker === 'object') {
        // Alternative: Try to call the tracker's new method directly
        const tracker = initiativePlugin.tracker;
        if (typeof tracker.new === 'function') {
          tracker.new(initiativePlugin, encounterData);
          new Notice(\`✅ Loaded encounter: \${trackerEncounter}\`);
        } else {
          new Notice('⚠️ Could not load encounter. Try using "Load Encounter" from Initiative Tracker menu.');
        }
      } else {
        new Notice('⚠️ Could not load encounter. Try using "Load Encounter" from Initiative Tracker menu.');
      }
    } catch (e) {
      console.error('Error loading encounter:', e);
      new Notice(\`⚠️ Could not load encounter: \${e.message}\`);
    }
  };
} else if (encounterCreatures && Array.isArray(encounterCreatures) && encounterCreatures.length > 0) {
  // Creatures defined but no tracker encounter name
  dv.paragraph("**Enemies:**");
  const list = dv.el('ul', "");
  for (const creature of encounterCreatures) {
    const stats = [];
    if (creature.cr) stats.push(\`CR \${creature.cr}\`);
    if (creature.hp) stats.push(\`HP \${creature.hp}\`);
    if (creature.ac) stats.push(\`AC \${creature.ac}\`);
    const statsStr = stats.length > 0 ? \` (\${stats.join(", ")})\` : "";
    
    // Create wiki-link if path is available for statblock plugin recognition
    const nameDisplay = creature.path 
      ? \`[[\${creature.path}|\${creature.name}]]\`
      : creature.name;
    
    dv.el('li', \`\${nameDisplay}\${statsStr} x\${creature.count}\`, { container: list });
  }
  dv.paragraph("");
  dv.paragraph("*💡 Create this encounter in Initiative Tracker to manage combat*");
} else {
  dv.paragraph("*No combat encounter created. Add creatures to the \`encounter_creatures\` frontmatter field.*");
}
\`\`\`

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

export const TRAP_TEMPLATE = `---
type: trap
template_version: 1.1.0
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

# <% tp.frontmatter.trap_name || "Unnamed Trap" %>

\`\`\`dataviewjs
// Action buttons for trap management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Trap button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Trap",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-trap");
});

// Delete Trap button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Trap",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-trap");
});
\`\`\`

## Trap Details

**Type:** <% tp.frontmatter.trap_type.charAt(0).toUpperCase() + tp.frontmatter.trap_type.slice(1) %> Trap  
**Threat Level:** <% tp.frontmatter.threat_level.charAt(0).toUpperCase() + tp.frontmatter.threat_level.slice(1) %>  
**Level Range:** <% tp.frontmatter.min_level %>-<% tp.frontmatter.max_level %>

### Trigger Condition
<% tp.frontmatter.trigger || "Not specified" %>

---

## Trap Elements & Effects

\`\`\`dataviewjs
const elements = dv.current().elements || [];
const trapType = dv.current().trap_type || 'simple';

if (elements.length === 0) {
  dv.paragraph("*No trap elements defined. Add elements to the \`elements\` frontmatter field.*");
} else {
  if (trapType === 'simple') {
    // Simple trap - just show effects
    for (const element of elements) {
      dv.header(4, element.name || "Effect");
      if (element.attack_bonus !== undefined) {
        dv.paragraph(\`**Attack:** +\${element.attack_bonus} to hit\`);
      }
      if (element.save_dc !== undefined) {
        dv.paragraph(\`**Save:** DC \${element.save_dc} \${element.save_ability || "DEX"}\`);
      }
      if (element.damage) {
        dv.paragraph(\`**Damage:** \${element.damage}\`);
      }
      if (element.effect) {
        dv.paragraph(\`**Effect:** \${element.effect}\`);
      }
      dv.paragraph("");
    }
  } else {
    // Complex trap - organize by initiative
    const byInitiative = new Map();
    const constant = [];
    const dynamic = [];
    
    for (const element of elements) {
      if (element.element_type === 'constant') {
        constant.push(element);
      } else if (element.element_type === 'dynamic') {
        dynamic.push(element);
      } else if (element.initiative !== undefined) {
        if (!byInitiative.has(element.initiative)) {
          byInitiative.set(element.initiative, []);
        }
        byInitiative.get(element.initiative).push(element);
      }
    }
    
    // Show initiative-based elements
    if (byInitiative.size > 0) {
      dv.header(3, "Initiative Actions");
      const sortedInit = Array.from(byInitiative.keys()).sort((a, b) => b - a);
      for (const init of sortedInit) {
        dv.header(4, \`Initiative \${init}\`);
        for (const element of byInitiative.get(init)) {
          dv.paragraph(\`**\${element.name || "Effect"}**\`);
          if (element.attack_bonus !== undefined) {
            dv.paragraph(\`  Attack: +\${element.attack_bonus} to hit\`);
          }
          if (element.save_dc !== undefined) {
            dv.paragraph(\`  Save: DC \${element.save_dc} \${element.save_ability || "DEX"}\`);
          }
          if (element.damage) {
            dv.paragraph(\`  Damage: \${element.damage}\`);
          }
          if (element.effect) {
            dv.paragraph(\`  Effect: \${element.effect}\`);
          }
          dv.paragraph("");
        }
      }
    }
    
    // Show dynamic elements
    if (dynamic.length > 0) {
      dv.header(3, "Dynamic Elements");
      for (const element of dynamic) {
        dv.paragraph(\`**\${element.name || "Dynamic Effect"}**\`);
        if (element.condition) {
          dv.paragraph(\`  Condition: \${element.condition}\`);
        }
        if (element.effect) {
          dv.paragraph(\`  Effect: \${element.effect}\`);
        }
        dv.paragraph("");
      }
    }
    
    // Show constant elements
    if (constant.length > 0) {
      dv.header(3, "Constant Effects");
      for (const element of constant) {
        dv.paragraph(\`**\${element.name || "Constant Effect"}**\`);
        if (element.effect) {
          dv.paragraph(\`  \${element.effect}\`);
        }
        dv.paragraph("");
      }
    }
  }
}
\`\`\`

---

## Countermeasures

\`\`\`dataviewjs
const countermeasures = dv.current().countermeasures || [];

if (countermeasures.length === 0) {
  dv.paragraph("*No countermeasures defined. Add countermeasures to the \`countermeasures\` frontmatter field.*");
} else {
  for (const cm of countermeasures) {
    dv.header(4, cm.method || "Countermeasure");
    
    if (cm.dc !== undefined) {
      dv.paragraph(\`**DC:** \${cm.dc}\`);
    }
    if (cm.checks_needed !== undefined && cm.checks_needed > 1) {
      dv.paragraph(\`**Checks Needed:** \${cm.checks_needed}\`);
    }
    if (cm.description) {
      dv.paragraph(\`**Description:** \${cm.description}\`);
    }
    if (cm.effect) {
      dv.paragraph(\`**Effect on Success:** \${cm.effect}\`);
    }
    dv.paragraph("");
  }
}
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

**Created:** <% tp.date.now("YYYY-MM-DD") %>

*Record when this trap was encountered and what happened*
5

`;

export const FACTION_TEMPLATE = `---
type: faction
template_version: 1.0.0
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
template_version: 1.0.0
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
template_version: 1.0.0
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
template_version: 1.0.0
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
template_version: 1.0.0
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
