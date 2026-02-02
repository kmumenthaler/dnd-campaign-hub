# Party Management Integration Plan

## Goal
Integrate PC creation with Initiative Tracker's party management system to enable:
1. Automatic registration of PCs as players in Initiative Tracker
2. Party grouping for campaigns
3. Quick loading of party members into combat encounters
4. Synchronization of PC stats between vault notes and Initiative Tracker

## Initiative Tracker Data Structure

From analyzing `data.json`:
```json
{
  "players": [
    {
      "name": "Character Name",
      "id": "unique-id",
      "initiative": 0,
      "modifier": 0,  // Initiative modifier
      "hp": 50,
      "currentMaxHP": 50,
      "currentHP": 50,
      "tempHP": 0,
      "ac": 15,
      "currentAC": 15,
      "level": 5,
      "path": "path/to/character/note.md",  // Link to character note
      "note": "optional note",
      "player": true,  // Distinguishes PCs from NPCs
      "marker": "default",  // Visual marker in tracker
      "status": []
    }
  ],
  "parties": [
    {
      "name": "Campaign Party Name",
      "id": "party-id",
      "players": ["player-id-1", "player-id-2", "player-id-3"]
    }
  ],
  "defaultParty": "party-id"  // Currently active party
}
```

## Implementation Strategy

### Phase 1: PC Creation Integration ✅ (This PR)
1. **Add "Register in Initiative Tracker" Option**
   - Add checkbox during PC creation: "Add to Initiative Tracker"
   - Default: checked for GM campaigns, unchecked for player campaigns

2. **Auto-register PCs**
   - When PC is created, if checkbox is checked:
     - Add player to `initiativePlugin.data.players`
     - Generate unique ID for the player
     - Map all stats from PC note to Initiative Tracker format
     - Save Initiative Tracker settings

3. **Party Management**
   - Detect existing party for the campaign
   - If no party exists for campaign, create one
   - Add the PC to the campaign's party
   - Link party to campaign in our plugin settings

### Phase 2: Sync & Updates (Future PR)
1. **Bidirectional Sync**
   - When PC note is updated, update Initiative Tracker data
   - Add command: "Sync PC to Initiative Tracker"
   - Add command: "Sync All PCs to Initiative Tracker"

2. **Bulk Operations**
   - Add command: "Import PCs from Initiative Tracker"
   - Add command: "Export All PCs to Initiative Tracker"

### Phase 3: Enhanced Party Features (Future PR)
1. **Party Dashboard**
   - Create Party.md file in campaign folder
   - Display all party members with stats
   - Quick buttons to load party into combat
   
2. **Session Integration**
   - Automatically add party members to session notes
   - Track which PCs attended which sessions

## Data Mapping

| PC Note Field | Initiative Tracker Field |
|---------------|-------------------------|
| `name` | `name` |
| `hp` | `currentHP` |
| `hp_max` | `hp`, `currentMaxHP` |
| `ac` | `ac`, `currentAC` |
| `init_bonus` | `modifier` |
| `level` | `level` |
| File path | `path` |
| - | `player: true` |

## Code Changes Needed

### 1. PCCreationModal
- Add `registerInTracker` checkbox
- Add method `registerPCInInitiativeTracker()`
- Call registration after PC file is created

### 2. Helper Functions
```typescript
async registerPCInInitiativeTracker(pcData: PCData): Promise<void>
async getOrCreateCampaignParty(campaignName: string): Promise<string>
generatePlayerId(): string
```

### 3. Settings
Add to plugin settings:
```typescript
interface CampaignPartyMapping {
  [campaignName: string]: string;  // Maps campaign name to party ID
}
```

## Testing Plan
1. Create PC with "Register in Initiative Tracker" checked
2. Verify PC appears in Initiative Tracker players list
3. Verify PC is added to campaign party
4. Verify party can be loaded in Initiative Tracker
5. Create second PC, verify both are in same party
6. Test with multiple campaigns

## Benefits
- **Seamless Workflow**: PCs automatically available in combat tracker
- **No Manual Entry**: Eliminate duplicate data entry
- **Party Management**: Easy to load entire party into encounters
- **Campaign Organization**: Each campaign has its own party
- **Flexibility**: Optional registration allows manual control

## Future Enhancements
- Sync PC stat changes back to notes
- Party composition tracking across sessions
- Quick "Load Party + Enemies" for encounters
- Party XP and treasure distribution
