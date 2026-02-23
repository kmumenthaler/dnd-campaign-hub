/**
 * Scene Snippets – quick-insert content blocks for scene & adventure authoring.
 *
 * Triggered by typing `/dnd` in the editor, presents a filterable list of
 * commonly used GM content blocks (read-aloud text, skill checks, NPC dialogue,
 * enemy stat blocks, etc.) and inserts them at the cursor position.
 */
import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from 'obsidian';

/* ─── Snippet definition ─────────────────────────────────── */

export interface SceneSnippet {
  /** Unique id */
  id: string;
  /** Display label in the suggestion list */
  label: string;
  /** Emoji icon shown before the label */
  icon: string;
  /** Short description shown in the suggestion list */
  description: string;
  /** Category for grouping */
  category: 'narrative' | 'mechanics' | 'combat' | 'planning' | 'reference';
  /** The markdown text to insert. `{{CURSOR}}` marks where the cursor should land. */
  body: string;
}

/* ─── Built-in snippets ──────────────────────────────────── */

export const SCENE_SNIPPETS: SceneSnippet[] = [
  /* ── Narrative ─────────────────────────────────────────── */
  {
    id: 'read-aloud',
    label: 'Read-Aloud Text',
    icon: '📖',
    description: 'Boxed text to read directly to your players',
    category: 'narrative',
    body: `> **Read-Aloud:**  
> *{{CURSOR}}*
`,
  },
  {
    id: 'gm-note',
    label: 'GM Note',
    icon: '📝',
    description: 'Private GM note (collapsible callout)',
    category: 'narrative',
    body: `> [!note]- GM Note
> {{CURSOR}}
`,
  },
  {
    id: 'npc-dialogue',
    label: 'NPC Dialogue',
    icon: '💬',
    description: 'NPC entry with attitude, wants, and knowledge tiers',
    category: 'narrative',
    body: `### 💬 NPC Name

**Role:** Quest Giver / Ally / Antagonist  
**Attitude:** Friendly / Neutral / Hostile  
**Wants:** *What does the NPC want from this interaction?*

**Conversation:**
- **Freely gives:** {{CURSOR}}
- **If asked:** 
- **If pressed (DC 15):** 
- **Won't tell:** 
`,
  },
  {
    id: 'pacing-marker',
    label: 'Pacing Marker',
    icon: '⏱️',
    description: 'Visual divider with timing cue for session pacing',
    category: 'narrative',
    body: `---
> ⏱️ **~{{CURSOR}} min** · *Transition / Beat / Break*
---
`,
  },

  /* ── Mechanics ─────────────────────────────────────────── */
  {
    id: 'skill-check',
    label: 'Skill Check',
    icon: '🎯',
    description: 'Structured DC check with success/failure outcomes',
    category: 'mechanics',
    body: `#### 🎯 Skill Check — {{CURSOR}}

**DC:** 

| Result | Outcome |
| ------ | ------- |
| ✅ Success | |
| ❌ Failure | |
| 🎲 Nat 20 | |
`,
  },
  {
    id: 'secret-hidden',
    label: 'Secret / Hidden Element',
    icon: '🔍',
    description: 'Perception or Investigation DC with hidden info',
    category: 'mechanics',
    body: `> [!tip]- 🔍 Hidden — {{CURSOR}}
> **Passive Perception DC:** 
> **Active Search DC:** 
> 
> **If found:** 
> **If missed:** 
`,
  },
  {
    id: 'branching-outcome',
    label: 'Branching Outcome',
    icon: '🔀',
    description: 'Success / Partial / Failure outcome structure',
    category: 'mechanics',
    body: `#### 🔀 Outcomes — {{CURSOR}}

- ✅ **Success:** 
- ⚖️ **Partial:** 
- ❌ **Failure:** 
`,
  },
  {
    id: 'random-table',
    label: 'Random Table',
    icon: '🎲',
    description: 'Quick d6 roll table',
    category: 'mechanics',
    body: `#### 🎲 {{CURSOR}} (d6)

| d6  | Result |
| --- | ------ |
| 1   |        |
| 2   |        |
| 3   |        |
| 4   |        |
| 5   |        |
| 6   |        |
`,
  },

  /* ── Combat ────────────────────────────────────────────── */
  {
    id: 'quick-enemy',
    label: 'Quick Enemy Stats',
    icon: '⚔️',
    description: 'Inline stat block for improvised combats',
    category: 'combat',
    body: `> [!danger] ⚔️ {{CURSOR}}
> **AC** · **HP**  · **Speed** 30 ft.
> 
> | STR | DEX | CON | INT | WIS | CHA |
> |-----|-----|-----|-----|-----|-----|
> |  10 |  10 |  10 |  10 |  10 |  10 |
> 
> **Attack:** *+X to hit*, reach 5 ft., one target. *Hit:* X (XdX + X) damage.
> **Abilities:** 
`,
  },
  {
    id: 'terrain-hazard',
    label: 'Terrain / Hazard',
    icon: '🏔️',
    description: 'Environmental feature with save DC and effects',
    category: 'combat',
    body: `#### 🏔️ {{CURSOR}}

**Type:** Difficult terrain / Hazard / Cover  
**Effect:** 
**Save:** DC  · *Type*  
**Damage:** 
**Duration:** 
`,
  },
  {
    id: 'loot-treasure',
    label: 'Loot / Treasure',
    icon: '🪙',
    description: 'Reward checklist with XP, gold, and items',
    category: 'combat',
    body: `#### 🪙 Loot — {{CURSOR}}

- [ ] **XP:** 
- [ ] **Gold:** 
- [ ] **Items:** 
- [ ] **Information / Clues:** 
`,
  },

  /* ── Planning ──────────────────────────────────────────── */
  {
    id: 'clue-secret',
    label: 'Clue / Secret',
    icon: '🕵️',
    description: 'A clue that links to a larger mystery',
    category: 'planning',
    body: `- [ ] 🕵️ **Clue:** {{CURSOR}}  
  *Leads to:* [[]]  
  *Found via:* 
`,
  },
  {
    id: 'condition-reminder',
    label: 'Condition Reminder',
    icon: '⚠️',
    description: 'Quick reference for a status condition',
    category: 'planning',
    body: `> [!warning] ⚠️ Condition — {{CURSOR}}
> **Effect:** 
> **Ends:** 
> **Save:** DC  · *Type* (end of turn)
`,
  },

  /* ── Exploration & Dungeon ─────────────────────────────── */
  {
    id: 'trap',
    label: 'Trap',
    icon: '🪤',
    description: 'Trigger, DC, damage, and countermeasures',
    category: 'combat',
    body: `#### 🪤 Trap — {{CURSOR}}

**Trigger:** 
**Detection:** Perception DC  
**Disarm:** Thieves' tools DC  

**Effect:**  
- **Save:** DC  · *DEX / CON / WIS*
- **Damage:** Xd6 (half on save)

**Countermeasures:**
- 
`,
  },
  {
    id: 'room-area',
    label: 'Room / Area',
    icon: '🗺️',
    description: 'Structured location with sensory details',
    category: 'narrative',
    body: `### 🗺️ {{CURSOR}}

> **You see:** 
> **You hear:** 
> **You smell:** 

**Dimensions:** × ft. · **Lighting:** 

**Contents:**
- 
- 

**Exits:**
- 
`,
  },
  {
    id: 'handout-letter',
    label: 'Handout / Letter',
    icon: '📜',
    description: 'In-world document styled as a player handout',
    category: 'narrative',
    body: `> [!quote] 📜 {{CURSOR}}
> *Dear …,*
> 
> 
> 
> *— Signed,*
`,
  },
  {
    id: 'rumor-table',
    label: 'Rumor Table',
    icon: '🗣️',
    description: 'D6 table of rumors, tagged true or false',
    category: 'mechanics',
    body: `#### 🗣️ Rumors — {{CURSOR}}

| d6  | Rumor | True? |
| --- | ----- | ----- |
| 1   |       | ✅     |
| 2   |       | ❌     |
| 3   |       | ✅     |
| 4   |       | ❌     |
| 5   |       | ✅     |
| 6   |       | ❌     |
`,
  },
  {
    id: 'shop-merchant',
    label: 'Shop / Merchant',
    icon: '🏪',
    description: 'Merchant with inventory table and prices',
    category: 'narrative',
    body: `### 🏪 {{CURSOR}}

**Shopkeep:** [[NPC Name]] · **Attitude:** Friendly  
**Specialty:** General Goods / Weapons / Magic / Potions

| Item | Price | Qty | Notes |
| ---- | ----- | --- | ----- |
|      |       |     |       |
|      |       |     |       |
|      |       |     |       |

**Buys at:** 50% value  
**Special deal if:** 
`,
  },
  {
    id: 'quest-hook',
    label: 'Quest Hook',
    icon: '🗝️',
    description: 'Patron, objective, reward, urgency, complication',
    category: 'planning',
    body: `#### 🗝️ Quest — {{CURSOR}}

**Patron:** [[NPC Name]]  
**Objective:** 
**Reward:** 
**Urgency:** Low / Medium / High  
**Complication:** 
**What happens if ignored:** 
`,
  },
  {
    id: 'boss-abilities',
    label: 'Boss Abilities',
    icon: '⚡',
    description: 'Legendary actions, lair actions, phase transitions',
    category: 'combat',
    body: `#### ⚡ Boss — {{CURSOR}}

**Legendary Actions (3/round):**
1. **Attack** — 
2. **Move** — Move up to half speed without provoking.
3. **Special (2 actions)** — 

**Lair Actions (Init 20):**
- 
- 

**Phase Transition (at 50% HP):**
*Description of change:* 
*New ability:* 
`,
  },
  {
    id: 'scene-transition',
    label: 'Scene Transition',
    icon: '🔗',
    description: 'Connect current scene to the next with triggers',
    category: 'planning',
    body: `---

> 🔗 **Transition → {{CURSOR}}**
> **Trigger:** *When the party…*
> **Next scene:** [[]]
> **Travel time:** 
> **What changes:** 

---
`,
  },
  {
    id: 'skill-challenge',
    label: 'Skill Challenge',
    icon: '📊',
    description: 'Multi-round successes-before-failures framework',
    category: 'mechanics',
    body: `#### 📊 Skill Challenge — {{CURSOR}}

**Goal:** 
**Complexity:**  successes before 3 failures

**Suggested Skills & DCs:**
- **Skill** DC  — *describes approach*
- **Skill** DC  — *describes approach*
- **Skill** DC  — *describes approach*

**Progress:**
- After 2 successes: 
- After 4 successes: 

**On Success:** 
**On Failure:** 
`,
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    icon: '🌤️',
    description: 'Weather, lighting, sounds, smells for mood-setting',
    category: 'narrative',
    body: `> [!example]- 🌤️ Atmosphere — {{CURSOR}}
> **Weather:** 
> **Lighting:** 
> **Sounds:** 
> **Smells:** 
> **Mood:** 
`,
  },
  {
    id: 'recap',
    label: 'Recap',
    icon: '⏮️',
    description: '"Last time…" block for session start',
    category: 'narrative',
    body: `> [!abstract] ⏮️ Recap
> *Last time, the party {{CURSOR}}…*
> 
> 
`,
  },
  {
    id: 'npc-voice',
    label: 'NPC Voice / Quirk',
    icon: '🎭',
    description: 'Quick personality, voice, mannerism, catchphrase',
    category: 'narrative',
    body: `#### 🎭 {{CURSOR}} — Voice & Quirks

**Voice:** *Accent / pitch / speed*  
**Mannerism:** 
**Catchphrase:** *" "*  
**Personality:** 
**Secret:** 
`,
  },

  /* ── Exploration & Dungeon (batch 3) ───────────────────── */
  {
    id: 'puzzle-riddle',
    label: 'Puzzle / Riddle',
    icon: '🧩',
    description: 'Riddle text, hints, solution, and failure consequence',
    category: 'mechanics',
    body: `#### 🧩 Puzzle — {{CURSOR}}

> *"Riddle or puzzle description…"*

**Hints:**
1. (free) 
2. (Investigation DC 12) 
3. (Arcana DC 15) 

**Solution:** 

**If solved:** 
**If failed:** 
**Time limit:** 
`,
  },
  {
    id: 'building-structure',
    label: 'Building / Structure',
    icon: '🏠',
    description: 'Exterior, floors, inhabitants, defenses',
    category: 'narrative',
    body: `### 🏠 {{CURSOR}}

**Exterior:** 
**Floors:** 
**Inhabitants:** 
**Defenses:** 

**Ground Floor:**
- 

**Upper Floor(s):**
- 

**Notable Features:**
- 
`,
  },
  {
    id: 'rest-stop',
    label: 'Rest Stop',
    icon: '⛺',
    description: 'Short/long rest — encounter chance, recovery, downtime',
    category: 'mechanics',
    body: `#### ⛺ Rest — {{CURSOR}}

**Type:** Short Rest / Long Rest  
**Location:** 
**Safety:** Safe / Risky / Dangerous

**Random Encounter:** d6 — encounter on 1–2  
**Watch Order:**
1. 
2. 
3. 

**Downtime Options:**
- [ ] Craft / Repair
- [ ] Study / Identify
- [ ] Forage / Hunt
- [ ] Socialize / RP

**Interruption:** 
`,
  },
  {
    id: 'event-festival',
    label: 'Event / Festival',
    icon: '🎪',
    description: 'Activities, competitions, NPCs, prizes',
    category: 'narrative',
    body: `### 🎪 {{CURSOR}}

**When:** 
**Where:** 
**Why:** *What's being celebrated?*

**Activities:**
| Activity | Skill Check | Prize |
| -------- | ----------- | ----- |
|          | DC          |       |
|          | DC          |       |
|          | DC          |       |

**Key NPCs:**
- 

**Complications:**
- 
`,
  },
  {
    id: 'death-save-tracker',
    label: 'Death Save Tracker',
    icon: '💀',
    description: 'Visual tracker for dramatic death saves',
    category: 'combat',
    body: `#### 💀 Death Saves — {{CURSOR}}

| Round | Roll | Result |
| ----- | ---- | ------ |
| 1     |      | ⬜ Success / ⬜ Failure |
| 2     |      | ⬜ Success / ⬜ Failure |
| 3     |      | ⬜ Success / ⬜ Failure |

**Successes:** ⬜ ⬜ ⬜ · **Failures:** ⬜ ⬜ ⬜  
**Nat 20:** Regains 1 HP · **Nat 1:** 2 failures  
**Stabilized:** ⬜ · **Healed by:** 
`,
  },
  {
    id: 'container-chest',
    label: 'Container / Chest',
    icon: '📦',
    description: 'Locked/trapped container with contents',
    category: 'mechanics',
    body: `#### 📦 {{CURSOR}}

**Locked:** Yes / No · **Lock DC:** 
**Trapped:** Yes / No · **Trap DC:**  (see 🪤 Trap)

**Contents:**
- [ ] 
- [ ] 
- [ ] 

**Mimic?** 🐛 No
`,
  },
  {
    id: 'portal-teleport',
    label: 'Portal / Teleport',
    icon: '🌀',
    description: 'Destination, activation method, side effects',
    category: 'mechanics',
    body: `#### 🌀 Portal — {{CURSOR}}

**Destination:** 
**Activation:** *Command word / Item / Ritual*  
**Appearance:** 

**Side Effects:**
- 

**Duration:** Permanent / X rounds  
**One-way:** Yes / No  
**Can be dispelled:** DC 
`,
  },
  {
    id: 'travel-leg',
    label: 'Travel Leg',
    icon: '🐎',
    description: 'Distance, pace, terrain, encounter chance, events',
    category: 'planning',
    body: `#### 🐎 Travel — {{CURSOR}} → 

**Distance:**  miles · **Terrain:** 
**Pace:** Normal (24 mi/day) / Slow / Fast  
**Travel Time:** 
**Encounter Chance:** d6 per day — encounter on 1–2

**Day 1:**
- Morning: 
- Afternoon: 
- Evening: 

**Landmarks Along the Way:**
- 
`,
  },
  {
    id: 'faction-reaction',
    label: 'Faction Reaction',
    icon: '👥',
    description: 'How a faction responds to party actions',
    category: 'planning',
    body: `#### 👥 Faction — {{CURSOR}}

**Current Disposition:** Hostile / Unfriendly / Neutral / Friendly / Allied  
**Reputation:** 

**If the party did X:**
- Disposition shifts to: 
- They will: 
- Consequences: 

**If the party did Y:**
- Disposition shifts to: 
- They will: 
- Consequences: 
`,
  },
  {
    id: 'player-objectives',
    label: 'Player Objective Board',
    icon: '📋',
    description: 'Current quests and tasks visible to players',
    category: 'planning',
    body: `#### 📋 Active Quests

**Main Quest:**
- [ ] {{CURSOR}}

**Side Quests:**
- [ ] 
- [ ] 

**Rumors to Investigate:**
- [ ] 

**Personal Goals:**
- [ ] 
`,
  },
  {
    id: 'chase-sequence',
    label: 'Chase Sequence',
    icon: '🛡️',
    description: 'Complication table, DC progression, escape/capture',
    category: 'combat',
    body: `#### 🛡️ Chase — {{CURSOR}}

**Quarry:** · **Pursuers:**  
**Starting Distance:**  ft. · **Max Rounds:** 10  
**Dash Limit:** 3 + CON mod dashes before exhaustion

**Complications (d6 each round):**

| d6  | Complication |
| --- | ------------ |
| 1   | Clear path — no complication |
| 2   | DEX DC 12 or fall prone |
| 3   | Obstacle — Athletics/Acrobatics DC 13 |
| 4   | Crowd — Stealth DC 12 to slip away |
| 5   | Hazard — take 1d6 damage or dodge DC 14 |
| 6   | Dead end — must backtrack or Athletics DC 15 |

**Escape:** Quarry gains  ft. lead → escaped  
**Capture:** Pursuers close to 0 ft. → caught  
`,
  },
  {
    id: 'doom-clock',
    label: 'Consequences Tracker',
    icon: '🔔',
    description: 'Time-sensitive events that escalate if players delay',
    category: 'planning',
    body: `#### 🔔 Doom Clock — {{CURSOR}}

**Threat:** 
**Deadline:** 

| Stage | Trigger | What Happens |
| ----- | ------- | ------------ |
| 1     | Day 1   |              |
| 2     | Day 3   |              |
| 3     | Day 5   |              |
| 4     | Day 7   | **Point of no return** |

**Current Stage:** 1  
**Can be stopped by:** 
**If ignored:** 
`,
  },

  /* ── 5e RAW Reference Cards ───────────────────────────── */
  {
    id: 'dc-scale',
    label: 'DC Scale',
    icon: '🎯',
    description: 'DMG difficulty class scale (5–30)',
    category: 'reference',
    body: `#### 🎯 Difficulty Class Scale (DMG p.238)

| DC  | Difficulty       |
| --- | ---------------- |
| 5   | Very Easy        |
| 10  | Easy             |
| 15  | Medium           |
| 20  | Hard             |
| 25  | Very Hard        |
| 30  | Nearly Impossible|
`,
  },
  {
    id: 'actions-in-combat',
    label: 'Actions in Combat',
    icon: '⚔️',
    description: 'All standard actions available on your turn',
    category: 'reference',
    body: `#### ⚔️ Actions in Combat (PHB p.192)

| Action | Description |
| ------ | ----------- |
| **Attack** | Melee or ranged attack (Extra Attack = multiple) |
| **Cast a Spell** | Cast time of 1 action |
| **Dash** | Double movement for the turn |
| **Disengage** | Movement doesn't provoke opportunity attacks |
| **Dodge** | Attacks against you have disadvantage; DEX saves have advantage |
| **Help** | Give an ally advantage on their next check or attack |
| **Hide** | DEX (Stealth) check to become hidden |
| **Ready** | Prepare an action with a trigger (uses reaction) |
| **Search** | WIS (Perception) or INT (Investigation) check |
| **Use an Object** | Interact with a second object or use a special item |

**Bonus Action:** Only if a feature grants one  
**Reaction:** Opportunity attack, readied action, or special feature (1/round)
`,
  },
  {
    id: 'cover-rules',
    label: 'Cover Rules',
    icon: '🛡️',
    description: 'Half, three-quarters, and total cover',
    category: 'reference',
    body: `#### 🛡️ Cover (PHB p.196)

| Cover | AC / DEX Save Bonus | Example |
| ----- | ------------------- | ------- |
| **Half** | +2 | Low wall, furniture, creature |
| **Three-quarters** | +5 | Arrow slit, thick tree |
| **Total** | Can't be targeted directly | Fully enclosed |

*A target with total cover can't be targeted by attacks or spells directly, unless the spell can reach around corners.*
`,
  },
  {
    id: 'light-vision',
    label: 'Light & Vision',
    icon: '👁️',
    description: 'Bright light, dim light, darkness, darkvision',
    category: 'reference',
    body: `#### 👁️ Light & Vision (PHB p.183)

| Light Level | Effect |
| ----------- | ------ |
| **Bright light** | Normal vision |
| **Dim light** | Lightly obscured → disadvantage on Perception (sight) |
| **Darkness** | Heavily obscured → effectively blinded |

**Darkvision:** Treat darkness as dim light (within range). Can't discern color. Dim light → normal.  
**Blindsight:** Perceive surroundings without sight (within range).  
**Truesight:** See in darkness, invisible creatures, shapechangers, into Ethereal (within range).  
**Torch:** Bright 20 ft., dim +20 ft. (1 hour)  
**Candle:** Bright 5 ft., dim +5 ft.  
**Lantern:** Bright 30 ft., dim +30 ft.
`,
  },
  {
    id: 'exhaustion-levels',
    label: 'Exhaustion Levels',
    icon: '😵',
    description: 'All 6 exhaustion levels with effects',
    category: 'reference',
    body: `#### 😵 Exhaustion (PHB p.291)

| Level | Effect |
| ----- | ------ |
| 1 | Disadvantage on ability checks |
| 2 | Speed halved |
| 3 | Disadvantage on attack rolls and saving throws |
| 4 | Hit point maximum halved |
| 5 | Speed reduced to 0 |
| 6 | **Death** |

*Effects are cumulative. Finishing a long rest with food & water reduces by 1 level.*
`,
  },
  {
    id: 'grapple-shove',
    label: 'Grapple & Shove',
    icon: '🤼',
    description: 'Contested checks and conditions applied',
    category: 'reference',
    body: `#### 🤼 Grapple & Shove (PHB p.195)

**Grapple** (replaces one Attack action attack):  
- **Attacker:** Athletics check  
- **Target:** Athletics or Acrobatics (target's choice)  
- **On success:** Target is *grappled* (speed = 0)  
- **Escape:** Action → contested Athletics or Acrobatics  
- **Requires:** Free hand, target no more than one size larger

**Shove** (replaces one Attack action attack):  
- **Attacker:** Athletics check  
- **Target:** Athletics or Acrobatics (target's choice)  
- **On success:** Target knocked *prone* or pushed 5 ft. away  
- **Requires:** Target no more than one size larger
`,
  },
  {
    id: 'falling-suffocation',
    label: 'Falling & Suffocation',
    icon: '💨',
    description: 'Fall damage and breath holding rules',
    category: 'reference',
    body: `#### 💨 Falling & Suffocation (PHB p.183)

**Falling:**  
- 1d6 bludgeoning per 10 ft. fallen  
- Maximum 20d6 (200 ft.)  
- Land prone if you take damage

**Suffocation:**  
- Can hold breath for **1 + CON modifier** minutes (minimum 30 seconds)  
- When out of breath: survive **CON modifier** rounds (minimum 1)  
- At start of next turn after that: drop to 0 HP and dying  
- Can't be stabilized or regain HP until you can breathe
`,
  },
  {
    id: 'surprise',
    label: 'Surprise',
    icon: '🎪',
    description: 'Stealth vs. passive Perception, surprised condition',
    category: 'reference',
    body: `#### 🎪 Surprise (PHB p.189)

1. **DM determines** who is hiding → DEX (Stealth) check  
2. Compare each Stealth result to each enemy's **passive Perception**  
3. Any creature that **doesn't notice a threat** is **surprised**  
4. Roll initiative for everyone (including surprised creatures)  
5. Surprised creatures **can't move or take actions** on their first turn  
6. Surprised creatures **can't take reactions** until their first turn ends  

*After your first turn ends, you are no longer surprised — even if you couldn't act.*
`,
  },
  {
    id: 'travel-pace',
    label: 'Travel Pace',
    icon: '📏',
    description: 'Fast, normal, slow pace with exact distances',
    category: 'reference',
    body: `#### 📏 Travel Pace (PHB p.182)

| Pace | Per Minute | Per Hour | Per Day | Effect |
| ---- | ---------- | -------- | ------- | ------ |
| **Fast** | 400 ft. | 4 miles | 30 miles | −5 passive Perception |
| **Normal** | 300 ft. | 3 miles | 24 miles | — |
| **Slow** | 200 ft. | 2 miles | 18 miles | Can stealth |

**Forced March:** After 8 hours, CON save each hour (DC 10 + hours past 8). Fail = 1 level exhaustion.  
**Difficult Terrain:** Halves travel distance.  
**Mounted:** Gallop = double fast pace for 1 hour, then mount needs short rest.
`,
  },
  {
    id: 'concentration',
    label: 'Concentration',
    icon: '🔥',
    description: 'CON save rules, triggers, one-spell limit',
    category: 'reference',
    body: `#### 🔥 Concentration (PHB p.203)

**Rules:**  
- Only **one** concentration spell at a time  
- Casting another concentration spell **ends the first**  
- Lasts up to the spell's duration unless broken

**Concentration Check (CON save):**  
- **Trigger:** Taking damage while concentrating  
- **DC:** 10 or **half the damage taken**, whichever is higher  
- Each source of damage = separate save

**Concentration also ends if:**  
- Incapacitated or killed  
- DM rules environmental interference (e.g., wave crashes over you)
`,
  },
  {
    id: 'encounter-xp-thresholds',
    label: 'Encounter XP Thresholds',
    icon: '📊',
    description: 'Easy/Medium/Hard/Deadly XP per level',
    category: 'reference',
    body: `#### 📊 Encounter Difficulty XP Thresholds (DMG p.82)

| Level | Easy | Medium | Hard | Deadly |
| ----- | ---- | ------ | ---- | ------ |
| 1 | 25 | 50 | 75 | 100 |
| 2 | 50 | 100 | 150 | 200 |
| 3 | 75 | 150 | 225 | 400 |
| 4 | 125 | 250 | 375 | 500 |
| 5 | 250 | 500 | 750 | 1,100 |
| 6 | 300 | 600 | 900 | 1,400 |
| 7 | 350 | 750 | 1,100 | 1,700 |
| 8 | 450 | 900 | 1,400 | 2,100 |
| 9 | 550 | 1,100 | 1,600 | 2,400 |
| 10 | 600 | 1,200 | 1,900 | 2,800 |

*Multiply total monster XP by: ×1 (1 monster), ×1.5 (2), ×2 (3–6), ×2.5 (7–10), ×3 (11–14), ×4 (15+)*
`,
  },
  {
    id: 'object-ac-hp',
    label: 'Object AC & HP',
    icon: '🏗️',
    description: 'DMG table for material AC and size HP',
    category: 'reference',
    body: `#### 🏗️ Object AC & HP (DMG p.246)

**Armor Class by Material:**

| Material | AC |
| -------- | -- |
| Cloth, paper, rope | 11 |
| Crystal, glass, ice | 13 |
| Wood, bone | 15 |
| Stone | 17 |
| Iron, steel | 19 |
| Mithral | 21 |
| Adamantine | 23 |

**Hit Points by Size:**

| Size | Fragile | Resilient |
| ---- | ------- | --------- |
| Tiny (bottle, lock) | 2 (1d4) | 5 (2d4) |
| Small (chest, lute) | 3 (1d6) | 10 (3d6) |
| Medium (barrel, chandelier) | 4 (1d8) | 18 (4d8) |
| Large (cart, window 10ft.) | 5 (1d10) | 27 (5d10) |

*Objects are immune to poison and psychic damage.*
`,
  },
  {
    id: 'conditions-reference',
    label: 'Conditions Reference',
    icon: '⚡',
    description: 'All 15 conditions with exact RAW effects',
    category: 'reference',
    body: `#### ⚡ Conditions (PHB p.290)

| Condition | Key Effects |
| --------- | ----------- |
| **Blinded** | Auto-fail sight checks. Attacks have disadvantage. Attacks against have advantage. |
| **Charmed** | Can't attack charmer. Charmer has advantage on social checks. |
| **Deafened** | Auto-fail hearing checks. |
| **Frightened** | Disadvantage on checks/attacks while source in sight. Can't willingly approach. |
| **Grappled** | Speed = 0. Ends if grappler incapacitated or forced apart. |
| **Incapacitated** | Can't take actions or reactions. |
| **Invisible** | Heavily obscured. Advantage on attacks. Attacks against have disadvantage. |
| **Paralyzed** | Incapacitated, can't move/speak. Auto-fail STR/DEX saves. Attacks have advantage. Melee hits within 5 ft. = auto-crit. |
| **Petrified** | Weight ×10. Incapacitated. Resistance to all damage. Immune to poison/disease. |
| **Poisoned** | Disadvantage on attacks and ability checks. |
| **Prone** | Disadvantage on attacks. Melee within 5 ft. has advantage. Ranged has disadvantage. Costs half speed to stand. |
| **Restrained** | Speed = 0. Attacks have disadvantage. Attacks against have advantage. Disadvantage on DEX saves. |
| **Stunned** | Incapacitated, can't move, faltering speech. Auto-fail STR/DEX saves. Attacks have advantage. |
| **Unconscious** | Incapacitated, drop items, fall prone. Auto-fail STR/DEX saves. Attacks have advantage. Melee within 5 ft. = auto-crit. |
`,
  },
  {
    id: 'rest-recovery',
    label: 'Rest Recovery',
    icon: '🛏️',
    description: 'Short rest and long rest recovery rules',
    category: 'reference',
    body: `#### 🛏️ Rest Recovery (PHB p.186)

**Short Rest** (≥ 1 hour):  
- Spend **Hit Dice** to heal (roll + CON mod each)  
- Some features recharge (e.g., Fighter Action Surge, Warlock spell slots)

**Long Rest** (≥ 8 hours, max 2 hours watch):  
- Regain **all lost HP**  
- Regain up to **half total Hit Dice** (minimum 1)  
- Regain all **spell slots**  
- Reset all long-rest features  
- Must have at least 1 HP to benefit  
- **Only one long rest per 24 hours**  
- Reduce **exhaustion** by 1 level (if food & water available)
`,
  },
  {
    id: 'instant-death',
    label: 'Instant Death',
    icon: '💀',
    description: 'Massive damage and instant death rules',
    category: 'reference',
    body: `#### 💀 Instant Death (PHB p.197)

**Massive Damage:**  
When damage reduces you to 0 HP and there is **remaining damage**, you die instantly if the remaining damage **≥ your hit point maximum**.

*Example: A wizard with 12 max HP and 6 current HP takes 18 damage. Reduced to 0 with 12 remaining damage — equals max HP → instant death.*

**Death Saving Throws:**  
- Start of each turn at 0 HP → d20  
- **10+** = success, **9 or less** = failure  
- **3 successes** = stabilized  
- **3 failures** = death  
- **Nat 20** = regain 1 HP  
- **Nat 1** = 2 failures  
- **Damage at 0 HP** = 1 death save failure (crit = 2)  
- **Stable** = regain 1 HP in 1d4 hours
`,
  },
];

/* ─── EditorSuggest implementation ───────────────────────── */

const TRIGGER = '/dnd';

export class SceneSnippetSuggest extends EditorSuggest<SceneSnippet> {
  constructor(app: App) {
    super(app);
    this.limit = 55;

    this.setInstructions([
      { command: '↑↓', purpose: 'navigate' },
      { command: '↵',  purpose: 'insert' },
      { command: 'esc', purpose: 'dismiss' },
    ]);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const textBefore = line.slice(0, cursor.ch);

    // Match /dnd optionally followed by a filter query
    const match = textBefore.match(/\/dnd(\s+(.*))?$/i);
    if (!match) return null;

    return {
      start: { line: cursor.line, ch: cursor.ch - match[0].length },
      end: cursor,
      query: (match[2] ?? '').trim().toLowerCase(),
    };
  }

  getSuggestions(context: EditorSuggestContext): SceneSnippet[] {
    const q = context.query;
    if (!q) return SCENE_SNIPPETS;

    return SCENE_SNIPPETS.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.includes(q) ||
      s.id.includes(q) ||
      s.icon.includes(q)
    );
  }

  renderSuggestion(snippet: SceneSnippet, el: HTMLElement): void {
    el.addClass('dnd-snippet-suggestion');

    const row = el.createEl('div', { cls: 'dnd-snippet-row' });
    row.createEl('span', { text: snippet.icon, cls: 'dnd-snippet-icon' });

    const text = row.createEl('div', { cls: 'dnd-snippet-text' });
    text.createEl('span', { text: snippet.label, cls: 'dnd-snippet-label' });
    text.createEl('span', { text: snippet.description, cls: 'dnd-snippet-desc' });

    const badge = row.createEl('span', {
      text: snippet.category,
      cls: `dnd-snippet-badge dnd-snippet-badge--${snippet.category}`,
    });
  }

  selectSuggestion(snippet: SceneSnippet, _evt: MouseEvent | KeyboardEvent): void {
    const ctx = this.context;
    if (!ctx) return;

    const { editor, start, end } = ctx;

    // Remove the trigger text
    editor.replaceRange('', start, end);

    // Find cursor placeholder position
    const body = snippet.body;
    const cursorMarker = '{{CURSOR}}';
    const markerIdx = body.indexOf(cursorMarker);
    const cleanBody = body.replace(cursorMarker, '');

    // Insert the snippet
    editor.replaceRange(cleanBody, start);

    // Move cursor to the marker position
    if (markerIdx >= 0) {
      const beforeMarker = body.slice(0, markerIdx);
      const lines = beforeMarker.split('\n');
      const cursorLine = start.line + lines.length - 1;
      const cursorCh = lines.length === 1
        ? start.ch + (lines[0]?.length ?? 0)
        : (lines[lines.length - 1]?.length ?? 0);
      editor.setCursor({ line: cursorLine, ch: cursorCh });
    }
  }
}
