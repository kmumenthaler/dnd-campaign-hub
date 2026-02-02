# D&D Campaign Hub - Feature Planning & Architecture

## Overview
Obsidian plugin for managing D&D campaigns with a comprehensive hub system that organizes campaigns, worlds, adventures, factions, and sessions.

## Current Version
**v0.2.0** - Adventure Creation with Scene-Based Workflow

---

## Core Architecture

### Hub System
- **Campaign Hub Modal**: Central interface accessed via ribbon icon or command palette
- **Role-Based Access**: GMs have full creation rights, Players have read-only access
- **Template System**: Supports both bundled templates and custom vault templates from `z_Templates/`

### Data Structure
```
Campaigns/
├── Campaign Name/
│   ├── Campaign Name.md (main dashboard)
│   ├── World.md (world info, GM role tracking)
│   ├── Adventures/
│   │   ├── Adventure Name.md (dashboard)
│   │   └── Adventure Name - Scenes/
│   │       ├── Scene 1 - Opening Hook.md
│   │       └── Scene 2 - Investigation.md
│   ├── Factions/
│   │   └── Faction Name.md
│   └── Sessions/
│       └── Session YYYY-MM-DD.md
```

### Role System
- **GM Role**: Defined in World.md frontmatter as `role: gm`
- **Filtering**: `getAllGMCampaigns()` filters campaigns where user is GM
- **Access Control**: Only GMs can create adventures, factions, and sessions

---

## Implemented Features (v0.1.0 - v0.2.0)

### ✅ Campaign Management
- **Create Campaign**: Name + description → generates folder structure
- **Campaign Dashboard**: Central hub with stats, quick links, recent sessions
- **World.md**: World info, homebrew rules, GM role tracking
- **Template Support**: Custom templates from vault or bundled fallbacks

### ✅ Faction System
- **Create Faction Modal**: Name, type (government/guild/religious/criminal/other), alignment, goals, resources, territory
- **Faction Template**: Comprehensive structure with leadership, members, relationships, plot hooks
- **Hub Integration**: "New Faction" button in Campaign Hub
- **World Template Button**: Dataview button in World.md for quick faction creation
- **Template Population**: Proper Templater placeholder replacement with `<% tp.frontmatter.field %>`

### ✅ Adventure Creation (v0.2.0 - Feature Branch)
**Branch**: `feature/adventure-creation`

**Design Philosophy**: 
- Adventures are broken into **scene notes** (working GM documents), not checklists
- **3-Act Structure**: Setup (3 scenes) → Rising Action (3 scenes) → Climax (3 scenes)
- **Scene Metadata**: Duration, type (social/combat/exploration), difficulty
- **GM Workflow**: Each scene is a full markdown document for planning, notes, and post-session recap

**Modal Fields**:
- Adventure Name
- Campaign Selection (filtered to GM campaigns only)
- The Problem/Hook (core conflict)
- Level Range (from-to)
- Expected Sessions
- Folder Structure Toggle:
  - **Flat**: `Adventure.md` + `Adventure - Scenes/` folder
  - **Act-Based**: `Adventure/` → Act folders → Scene files

**Auto-Generated Scenes** (9 total):
1. Act 1 - Setup:
   - Scene 1: Opening Hook (15min, social, easy)
   - Scene 2: Investigation (30min, exploration, medium)
   - Scene 3: First Confrontation (45min, combat, medium)
2. Act 2 - Rising Action:
   - Scene 4: Complication Arises (20min, social, medium)
   - Scene 5: Major Challenge (40min, combat, hard)
   - Scene 6: Critical Choice (30min, social, hard)
3. Act 3 - Climax:
   - Scene 7: Preparation (20min, exploration, medium)
   - Scene 8: Climactic Battle (60min, combat, deadly)
   - Scene 9: Resolution (10min, social, easy)

**Scene Template Sections**:
- Frontmatter: name, adventure, act, scene_number, duration, type, difficulty, status
- What Happens: Planning section
- Read-Aloud Text: Pre-written descriptions
- Skill Checks & Traps: DC, consequences
- Encounters: Monster stats, tactics, treasure
- NPCs: Personalities, motivations
- Clues & Discoveries: Plot progression
- Treasure & Rewards: Loot, XP
- What Actually Happened: Post-session recap
- DM Notes: Session-specific observations

**Adventure Dashboard** (`ADVENTURE_TEMPLATE`):
- Frontmatter: name, campaign, world, status, level_range, current_act, expected_sessions, sessions[]
- Scene Progress Checklist: All 9 scenes with act grouping
- The Problem: Core conflict description
- Act Structure: Setup → Rising Action → Climax summaries
- Campaign Planning: Session breakdown, pacing notes
- Adventure Notes: General planning area

**Implementation Details**:
- `AdventureCreationModal`: Form with Setting components
- `getAllGMCampaigns()`: Async filter using World.md `role: gm` check
- `createAdventureFile()`: Orchestrates folder creation and file generation
- `createMainAdventureNote()`: Generates dashboard with populated frontmatter
- `createSceneNotes()`: Loops through 9 scenes, creates files with metadata
- `createSceneNote()`: Populates SCENE_TEMPLATE with placeholders

### ✅ Session Management
- **Create Session**: Auto-dated notes with adventure linking
- **Session Template**: Recap, notes, XP, treasure tracking

---

## TypeScript Best Practices

### Strict Null Checking
- Always use type guards for `TFile` checks: `if (file instanceof TFile)`
- Add fallbacks for `string | undefined`: `const safe: string = value || "Unknown"`
- Optional chaining for array access: `array[0]?.property`
- Explicit type annotations when TypeScript can't infer: `const date: string = ...`

### Async File Operations
```typescript
// Always check file existence
const file = this.app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
  const content = await this.app.vault.read(file);
}

// Ensure folders exist before creating files
await this.plugin.ensureFolderExists(folderPath);
await this.app.vault.create(filePath, content);
```

---

## Planned Features (Phase 2+)

### 🔄 Scene Creation UI (Next Iteration)
- **Manual Scene Addition**: Add individual scenes to existing adventures
- **Scene Modal**: Name, act, duration, type, difficulty
- **Numbered Insertion**: Insert between existing scenes
- **Template Selection**: Choose from scene type templates (social/combat/exploration)

### 🔄 Initiative Tracker Integration
- **Scene-Linked Tracker**: Open tracker from scene notes
- **Encounter Auto-Population**: Load monsters from scene frontmatter
- **Party Integration**: Pull party members from campaign data
- **Turn Tracking**: Rounds, conditions, HP management

### 🔄 Party & Encounter Balancing (Phase 2)
- **Party Management**: Level tracking, character sheets
- **CR Calculator**: Automatic encounter balancing based on party composition
- **XP Budgets**: Suggest monster combinations for target difficulty
- **Treasure Scaling**: Adjust loot based on party size/level

### 🔄 Map Integration Improvements
- **Scene-Map Linking**: Associate maps with scenes
- **Marker System**: Place NPCs, encounters, clues on maps
- **Reveal Mechanics**: Progressive map unveiling during sessions

### 🔄 NPC Database
- **Centralized NPCs**: Campaign-wide NPC repository
- **Relationship Mapping**: Faction affiliations, PC relationships
- **Quick Reference**: Link NPCs to scenes, sessions, adventures

### 🔄 Quest & Plot Thread Tracking
- **Quest Management**: Track active, completed, failed quests
- **Plot Threads**: Link quests to adventures, sessions, factions
- **Player Visibility**: GM notes vs. player-visible descriptions

### 🔄 Session Prep Assistant
- **Checklist Generation**: Auto-generate prep tasks from upcoming scenes
- **Material Preparation**: Maps, handouts, stat blocks needed
- **NPC Reminder**: List NPCs appearing in next session
- **Recap Generator**: Auto-summarize previous session from notes

---

## Design Decisions & Rationale

### Why Scene Notes Instead of Checklists?
**Problem**: Initial designs treated scenes as checkbox items in adventure notes.  
**Solution**: Each scene is a full markdown document.  
**Rationale**: GMs need working space for:
- Pre-session planning (read-aloud text, encounter prep)
- During-session notes (player actions, dice rolls)
- Post-session recap ("What Actually Happened")

### Why 9 Pre-Configured Scenes?
**Problem**: Empty adventures require too much planning overhead.  
**Solution**: 9 scenes with sensible defaults (names, durations, types, difficulties).  
**Rationale**: 
- Follows classic 3-act structure from theater/storytelling
- 9 scenes ≈ 3-4 sessions of gameplay (typical adventure length)
- GMs can rename/adjust but have solid foundation
- Matches advice from The Arcane Library's adventure design guide

### Why GM-Only Filtering?
**Problem**: Players accidentally creating adventures in campaigns they play in.  
**Solution**: `getAllGMCampaigns()` filters by `role: gm` in World.md.  
**Rationale**: 
- Clear separation of GM and player responsibilities
- Prevents accidental spoilers from player exploration
- Maintains campaign data integrity

### Why Folder Structure Toggle?
**Problem**: Different GMs have different organizational preferences.  
**Solution**: Choice between flat (Adventure.md + Scenes folder) or hierarchical (Act folders).  
**Rationale**: 
- Flat structure: Fewer clicks, all scenes in one list
- Act-based: Clearer organization for long adventures
- Let GMs choose based on campaign complexity

---

## Template System Details

### Template Priority
1. **Custom Templates**: `z_Templates/Frontmatter - [Type].md` in vault
2. **Bundled Templates**: Fallback from `src/templates.ts`

### Template Placeholders
**Frontmatter**: Auto-populated from modal data, no placeholders needed  
**Body Content**: Use Templater syntax for frontmatter references
```markdown
# <% tp.frontmatter.name %>
Campaign: [[<% tp.frontmatter.campaign %>]]
World: [[<% tp.frontmatter.world %>]]
```

### Available Templates
- `CAMPAIGN_TEMPLATE`: Campaign dashboard
- `WORLD_TEMPLATE`: World info + GM role tracking
- `SESSION_TEMPLATE`: Session notes
- `FACTION_TEMPLATE`: Faction details
- `ADVENTURE_TEMPLATE`: Adventure dashboard with scene checklist
- `SCENE_TEMPLATE`: Scene working document

---

## Git Workflow

### Branch Strategy
- **main**: Stable production code
- **feature/[name]**: Feature development branches
- **Naming**: Descriptive feature names (e.g., `feature/adventure-creation`)

### Commit Messages
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation updates
- `refactor:` Code restructuring

### Current Branch
**feature/adventure-creation** (ready for testing)
- 6 commits: adventure modal, scene generation, GM filtering, TypeScript fixes

---

## Testing Checklist

### Before Merging to Main
- [ ] TypeScript compiles with no errors
- [ ] Build succeeds (esbuild)
- [ ] Deployed to Test Vault 2
- [ ] Campaign creation works
- [ ] Faction creation works (hub + world template button)
- [ ] Adventure creation works (GM campaigns only)
- [ ] Scene notes generated correctly (9 files, proper frontmatter)
- [ ] Folder structures (flat vs. act-based) work
- [ ] Templates populate correctly (no empty fields)
- [ ] No console errors in developer tools

---

## Known Issues & Limitations

### Current Limitations
- No scene editing UI (must edit markdown directly)
- No scene deletion/reordering tools
- No bulk operations (e.g., change all scenes to different act)
- No encounter balancing calculations

### TypeScript Gotchas
- Always type-guard `TFile` checks
- `split()[0]` can return `undefined` - use fallbacks
- Async operations need proper error handling
- Modal form values are strings - convert numbers explicitly

---

## Dependencies & Build

### Core Dependencies
- **obsidian**: `^1.5.0` (Obsidian API)
- **@types/node**: `^20.10.0`

### Dev Dependencies
- **esbuild**: `^0.19.10` (bundler)
- **typescript**: `^5.3.3`
- **builtin-modules**: `^3.3.0`

### Build Commands
```bash
npm run build    # Production build
npm run dev      # Watch mode
```

### Deployment
```powershell
Copy-Item -Path "dist\main.js" -Destination ".obsidian\plugins\dnd-campaign-hub\" -Force
```

---

## Future Architecture Considerations

### Database Integration
Consider structured data storage (JSON/SQLite) for:
- Party composition
- NPC relationships
- Quest states
- Encounter history

### API Design
Expose plugin API for other plugins:
- `getCampaigns()`
- `getActiveSessions()`
- `createEncounter()`

### Performance Optimization
- Lazy load campaign data
- Cache parsed frontmatter
- Debounce file operations

---

## Resources & References

### Obsidian API
- [Plugin Developer Guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [API Reference](https://docs.obsidian.md/Reference/TypeScript+API)

### Adventure Design
- [The Arcane Library - Adventure Creation Guide](https://thearcanelibrary.com)
- 3-Act Story Structure
- Scene-based planning methodology

---

**Last Updated**: February 1, 2026  
**Maintainer**: Kevin  
**Status**: Active Development (v0.2.0)
