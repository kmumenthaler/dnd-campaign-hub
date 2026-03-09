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

\`\`\`button
name Import Existing PC
type command
action D&D Campaign Hub: Import Existing PC from Another Campaign
\`\`\`
^button-import-pc

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
template_version: 1.3.0
campaign: 
world: 
adventure: 
starting_scene: ""
ending_scene: ""
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

\`\`\`dataviewjs
// Session Scene Navigator
const sessionFile = dv.current();
let adventureLink = sessionFile.adventure;
const startingScene = sessionFile.starting_scene;
const endingScene   = sessionFile.ending_scene;

// Parse "[[path]]" -> path
const parseLink = (val) => {
  if (!val || val === '""' || val === '') return null;
  if (typeof val === 'string') {
    const m = val.match(/\[\[(.+?)\]\]/);
    return m ? m[1] : null;
  }
  return val?.path || null;
};

adventureLink = parseLink(adventureLink) || adventureLink;
const startPath = parseLink(startingScene);
const endPath   = parseLink(endingScene);

if (!adventureLink) {
  dv.paragraph("*No adventure linked to this session.*");
  const createBtn = dv.el('button', '🗺️ Create Adventure');
  createBtn.className = 'mod-cta';
  createBtn.style.marginTop = '10px';
  createBtn.onclick = () => app.commands.executeCommandById('dnd-campaign-hub:create-adventure');
} else {
  const adventurePage = dv.page(adventureLink);
  if (!adventurePage) {
    dv.paragraph("*Adventure note not found: " + adventureLink + "*");
  } else {
    const adventureName = adventurePage.name || adventurePage.file.name;
    const adventureFolder = adventurePage.file.folder;
    const campaignFolder = adventurePage.campaign;

    // Collect scenes from all folder structures (new Scenes/, flat, legacy)
    let raw = [
      ...dv.pages(\`"\${adventureFolder}/Scenes"\`).where(p => p.type === 'scene'),
      ...dv.pages(\`"\${campaignFolder}/Adventures/\${adventureName} - Scenes"\`).where(p => p.file.name.startsWith('Scene')),
      ...dv.pages(\`"\${adventureFolder}"\`).where(p => p.type === 'scene'),
    ];

    // Deduplicate and sort by scene number
    const seen = new Set();
    let allScenes = raw.filter(s => {
      if (seen.has(s.file.path)) return false;
      seen.add(s.file.path);
      return true;
    });
    allScenes.sort((a, b) => {
      const n = s => parseInt(s.scene_number || s.file.name.match(/Scene\\s+(\\d+)/)?.[1] || 0);
      return n(a) - n(b);
    });

    if (allScenes.length === 0) {
      dv.paragraph("*No scenes found for this adventure. Create a scene from the adventure note.*");
    } else {
      const idxOf = (path) => !path ? -1 : allScenes.findIndex(s =>
        s.file.path === path || s.file.name === path ||
        s.file.path.endsWith('/' + path + '.md') || s.file.path.endsWith('/' + path)
      );
      const startIdx = idxOf(startPath);
      const endIdx   = idxOf(endPath);

      // Starting scene callout
      if (startIdx >= 0) {
        const c = dv.el('div', '');
        c.style.cssText = 'background:rgba(0,180,0,0.08);border-left:4px solid #00aa44;padding:8px 12px;border-radius:4px;margin-bottom:8px;';
        c.innerHTML = '<strong>🎬 Session starts at:</strong> ';
        const a = c.createEl('a', { text: allScenes[startIdx].file.name, href: '#' });
        a.onclick = (e) => { e.preventDefault(); app.workspace.openLinkText(allScenes[startIdx].file.path, '', false); };
      }

      // Ending scene callout
      if (endIdx >= 0) {
        const c = dv.el('div', '');
        c.style.cssText = 'background:rgba(255,140,0,0.08);border-left:4px solid #ff8800;padding:8px 12px;border-radius:4px;margin-bottom:8px;';
        c.innerHTML = '<strong>🏁 Session ended at:</strong> ';
        const a = c.createEl('a', { text: allScenes[endIdx].file.name, href: '#' });
        a.onclick = (e) => { e.preventDefault(); app.workspace.openLinkText(allScenes[endIdx].file.path, '', false); };
      }

      // "End Session Here" button (only if not yet recorded)
      if (!endPath) {
        const btnRow = dv.el('div', '');
        btnRow.style.cssText = 'margin-bottom:12px;';
        const endBtn = btnRow.createEl('button', { text: '🏁 End Session Here' });
        endBtn.style.cssText = 'padding:5px 12px;cursor:pointer;border-radius:4px;';
        endBtn.onclick = () => app.commands.executeCommandById('dnd-campaign-hub:end-session-here');
      }

      // Scene list
      dv.header(4, 'Adventure Scenes');
      for (let i = 0; i < allScenes.length; i++) {
        const scene = allScenes[i];
        const isStart = i === startIdx;
        const isEnd   = i === endIdx;
        const status  = scene.status || 'not-started';
        const icon    = status === 'completed' ? '✅' : status === 'in-progress' ? '🎬' : '⬜';

        const row = dv.el('div', '');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;' + (isStart ? 'font-weight:600;' : '');

        // Status toggle button
        const togBtn = row.createEl('button', { text: icon });
        togBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;font-size:1.1em;padding:0;width:22px;';
        togBtn.title = 'Click to cycle: not-started → in-progress → completed';
        togBtn.onclick = async () => {
          const next = { 'not-started': 'in-progress', 'in-progress': 'completed', 'completed': 'not-started' };
          const f = app.vault.getAbstractFileByPath(scene.file.path);
          if (f) {
            const c = await app.vault.read(f);
            await app.vault.modify(f, c.replace(/^status:\s*.+$/m, \`status: \${next[status] || 'not-started'}\`));
          }
        };

        // Scene name link
        const nameEl = row.createEl('span');
        const link = nameEl.createEl('a', { text: scene.file.name, href: '#' });
        link.onclick = (e) => { e.preventDefault(); app.workspace.openLinkText(scene.file.path, '', false); };

        // Meta info
        const meta = row.createEl('span', { text: \` — \${scene.duration || '?'} | \${scene.scene_type || '?'}\` });
        meta.style.cssText = 'opacity:0.55;font-size:0.82em;';

        if (isStart) { const b = row.createEl('span', { text: ' 📍' }); b.title = 'Session start'; }
        if (isEnd)   { const b = row.createEl('span', { text: ' 🏁' }); b.title = 'Session end'; }
      }
    }
  }
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
template_version: 1.3.0
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

\`\`\`dataviewjs
// Action buttons for NPC management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit NPC button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit NPC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-npc");
});

// Delete NPC button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete NPC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-npc");
});

// Manage Statblock button
const statblockBtn = buttonContainer.createEl("button", { 
  text: "⚔️ Manage Statblock",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
statblockBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-npc");
});
\`\`\`

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
template_version: 1.2.0
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

\`\`\`dataviewjs
// Action buttons for PC management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit PC button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit PC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-pc");
});

// Delete PC button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete PC",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-pc");
});
\`\`\`

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
template_version: 1.2.0
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
const adventurePath = dv.current().file.path;
const plugin = app.plugins.plugins['dnd-campaign-hub'];

const sceneButton = dv.el('button', '🎬 Create New Scene');
sceneButton.className = 'mod-cta';
sceneButton.onclick = () => {
  new plugin.SceneCreationModal(app, plugin, adventurePath).open();
};

const trapButton = dv.el('button', '🪤 Create New Trap', { cls: 'mod-cta' });
trapButton.style.marginLeft = '10px';
trapButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:create-trap');
};

const sessionButton = dv.el('button', '📜 Create Session', { cls: 'mod-cta' });
sessionButton.style.marginLeft = '10px';
sessionButton.onclick = async () => {
  new plugin.SessionCreationModal(app, plugin, adventurePath).open();
};

const editButton = dv.el('button', '✏️ Edit Adventure');
editButton.style.marginLeft = '10px';
editButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:edit-adventure');
};

const deleteButton = dv.el('button', '🗑️ Delete Adventure');
deleteButton.style.marginLeft = '10px';
deleteButton.onclick = () => {
  app.commands.executeCommandById('dnd-campaign-hub:delete-adventure');
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
          
          // Create clickable status button
          const sceneDiv = dv.el('div', '', { cls: 'scene-item' });
          const statusBtn = dv.el('button', status, { container: sceneDiv });
          statusBtn.style.border = 'none';
          statusBtn.style.background = 'transparent';
          statusBtn.style.cursor = 'pointer';
          statusBtn.style.fontSize = '1.2em';
          statusBtn.title = 'Click to change status';
          statusBtn.onclick = async () => {
            const file = app.vault.getAbstractFileByPath(scene.file.path);
            if (file) {
              const content = await app.vault.read(file);
              const currentStatus = scene.status || 'not-started';
              const nextStatus = currentStatus === 'not-started' ? 'in-progress' : 
                                 currentStatus === 'in-progress' ? 'completed' : 'not-started';
              const newContent = content.replace(
                /^status:\\s*.+$/m,
                \`status: \${nextStatus}\`
              );
              await app.vault.modify(file, newContent);
            }
          };
          dv.span(' **', { container: sceneDiv });
          dv.span(dv.fileLink(scene.file.path, false, scene.file.name), { container: sceneDiv });
          dv.span(\`**  \\n\\\`\${duration} | \${type} | \${difficulty}\\\`\`, { container: sceneDiv });
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
      
      // Create clickable status button
      const sceneDiv = dv.el('div', '', { cls: 'scene-item' });
      const statusBtn = dv.el('button', status, { container: sceneDiv });
      statusBtn.style.border = 'none';
      statusBtn.style.background = 'transparent';
      statusBtn.style.cursor = 'pointer';
      statusBtn.style.fontSize = '1.2em';
      statusBtn.title = 'Click to change status';
      statusBtn.onclick = async () => {
        const file = app.vault.getAbstractFileByPath(scene.file.path);
        if (file) {
          const content = await app.vault.read(file);
          const currentStatus = scene.status || 'not-started';
          const nextStatus = currentStatus === 'not-started' ? 'in-progress' : 
                             currentStatus === 'in-progress' ? 'completed' : 'not-started';
          const newContent = content.replace(
            /^status:\\s*.+$/m,
            \`status: \${nextStatus}\`
          );
          await app.vault.modify(file, newContent);
        }
      };
      dv.span(' **', { container: sceneDiv });
      dv.span(dv.fileLink(scene.file.path, false, scene.file.name), { container: sceneDiv });
      dv.span(\`**  \\n\\\`\${duration} | \${type} | \${difficulty}\\\`\`, { container: sceneDiv });
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

// ============================================================================
// SCENE TEMPLATE
// ============================================================================

export const SCENE_TEMPLATE = `---
type: scene
template_version: 2.2.0
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
\`\`\`

---
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

export const POI_TEMPLATE = `---
type: point-of-interest
template_version: 1.0.0
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

# <% tp.frontmatter.icon %> <% tp.frontmatter.name %>

\`\`\`dataviewjs
// Action buttons for PoI management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit PoI button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit PoI",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-poi");
});

// Delete PoI button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete PoI",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--background-modifier-error); color: var(--text-error);" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-poi");
});
\`\`\`

> [!info] Quick Info
> **Type:** <% tp.frontmatter["poi-type"] %>  
> **Region:** <% tp.frontmatter.region || "Unknown" %>  
> **Status:** <% tp.frontmatter.discovered ? (tp.frontmatter.visited ? "Visited" : "Discovered") : "Undiscovered" %>

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
template_version: 1.0.0
name: 
environment: 
party_level: 3
party_size: 4
entries: 6
campaign: 
date_created: 
---

# 🎲 Random Encounter Table

\`\`\`dataviewjs
// Action buttons for Encounter Table
const buttonContainer = dv.el("div", "", {
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" }
});

// Roll Encounter button
const rollBtn = buttonContainer.createEl("button", {
  text: "🎲 Roll Encounter",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
rollBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:roll-random-encounter");
});

// Regenerate Table button
const regenBtn = buttonContainer.createEl("button", {
  text: "🔄 Regenerate Table",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
regenBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:create-random-encounter-table");
});
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
