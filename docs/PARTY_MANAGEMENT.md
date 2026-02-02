# Party Management Integration

## Overview

D&D Campaign Hub now integrates with the Initiative Tracker plugin's party management system, allowing you to automatically register player characters and organize them into campaign-specific parties.

## Features

### Automatic PC Registration
When creating a PC in a GM campaign, you can choose to automatically register them in Initiative Tracker:
- ✅ **One-click registration** - No manual data entry in Initiative Tracker
- ✅ **Stat synchronization** - HP, AC, initiative modifier, and level automatically mapped
- ✅ **Note linking** - Tracker entries link back to PC vault notes
- ✅ **Party organization** - PCs grouped by campaign

### Campaign Parties
Each campaign automatically gets its own party in Initiative Tracker:
- **Auto-creation**: First PC creates the party `[Campaign Name] Party`
- **Auto-assignment**: All PCs added to campaign's party
- **Default party**: First campaign party becomes default tracker party

## How to Use

### Creating a PC with Tracker Integration

1. **Create New PC** (Ribbon Icon or Command)
   - Command: `D&D Campaign Hub: Create Player Character`

2. **Fill in PC Details**
   - Character Name (required)
   - Player Name
   - Classes, Level, HP, AC, Initiative Modifier, Speed
   - Character Sheet Links (optional)

3. **Enable Integration** (GM Campaigns Only)
   - ✅ Check **"Register in Initiative Tracker"**
   - This checkbox only appears for GM campaigns
   - Default: Checked (you can uncheck to skip registration)

4. **Create**
   - PC note is created in `[Campaign]/PCs/`
   - PC is added to Initiative Tracker's player list
   - PC is added to campaign's party
   - Confirmation notices appear

### Using PCs in Combat

1. **Open Initiative Tracker**
   - Command: `Initiative Tracker: Open Tracker View`
   - Or click tracker icon in sidebar

2. **Load Party**
   - In Initiative Tracker, click "Parties" section
   - Select your campaign's party (e.g., "Shore of Dreams Party")
   - Click "Add to Encounter"
   - All party members load into combat tracker

3. **Add Enemies**
   - Use Initiative Tracker's creature search
   - Or use D&D Campaign Hub's scene encounter builder

4. **Roll Initiative and Play!**

## Data Mapping

How PC note fields map to Initiative Tracker:

| PC Note Field | Initiative Tracker Field | Notes |
|---------------|-------------------------|-------|
| `name` | `name` | Character name |
| `hp` | `currentHP` | Current hit points |
| `hp_max` | `hp`, `currentMaxHP` | Maximum hit points |
| `ac` | `ac`, `currentAC` | Armor class |
| `init_bonus` | `modifier` | Initiative modifier (e.g., +2) |
| `level` | `level` | Character level |
| File path | `path` | Link back to PC note |
| `player` + `class` | `note` | Additional info display |
| - | `player: true` | Marks as PC (not NPC) |
| - | `friendly: true` | Marks as friendly |

## Examples

### Example 1: Creating First PC in Campaign

```
Campaign: Shore of Dreams
PC Name: Lyra Moonwhisper
Player: Alice
Class: Wizard
Level: 3
HP: 18/18
AC: 13
Init Bonus: +2
```

**Result:**
- ✅ PC note created at `Shore of Dreams/PCs/Lyra Moonwhisper.md`
- ✅ Player added to Initiative Tracker
- ✅ Party created: "Shore of Dreams Party"
- ✅ Lyra added to party
- ✅ Party set as default

### Example 2: Adding Second PC to Existing Campaign

```
Campaign: Shore of Dreams (party exists)
PC Name: Theron Ironforge
Player: Bob
Class: Fighter
Level: 3
```

**Result:**
- ✅ PC note created
- ✅ Player added to Initiative Tracker
- ✅ Theron added to existing "Shore of Dreams Party"
- ✅ Party now has 2 members

### Example 3: Multiple Campaigns

```
Campaign A: Shore of Dreams
- Lyra Moonwhisper
- Theron Ironforge

Campaign B: Frozen Sick
- Kira Frostborn
- Eldrin Shadowblade
```

**Result:**
- ✅ Two separate parties in Initiative Tracker
- ✅ "Shore of Dreams Party" (2 members)
- ✅ "Frozen Sick Party" (2 members)
- ✅ Easy to switch between campaign parties

## Benefits

### For Game Masters
- **Save Time**: No duplicate data entry between vault and tracker
- **Stay Organized**: PCs automatically grouped by campaign
- **Quick Combat**: Load entire party with one click
- **Linked Data**: Jump from tracker to PC notes instantly

### For Players
- **Automatic Setup**: GM registers your PC, you're ready to play
- **Consistent Stats**: Same stats in notes and tracker
- **Easy Updates**: Changes to PC notes can sync to tracker (future feature)

### For Both
- **Seamless Workflow**: Create PC → Ready for Combat
- **No Manual Tracking**: Plugin handles party management
- **Campaign Separation**: Each campaign has isolated party
- **Initiative Tracker Power**: Use all tracker features with your PCs

## Troubleshooting

### "Register in Initiative Tracker" checkbox not showing
- **Cause**: You're in a Player campaign, not GM campaign
- **Solution**: This feature is GM-only. Players don't manage tracker data
- **Check**: Campaign's `World.md` should have `role: GM`

### PC created but not in Initiative Tracker
- **Cause**: Initiative Tracker plugin not installed or enabled
- **Solution**: Install and enable Initiative Tracker plugin
- **Fallback**: PC note still created, you can manually add to tracker

### Can't find party in Initiative Tracker
- **Location**: Open Initiative Tracker → "Parties" section
- **Name**: Look for `[Campaign Name] Party`
- **Check**: Make sure at least one PC has been registered

### PC stats changed, not updated in tracker
- **Current**: Manual sync required
- **Update**: Open Initiative Tracker, edit player stats manually
- **Future**: Auto-sync feature planned for Phase 2

### Multiple PCs with same name
- **No Conflict**: Each PC gets unique ID in tracker
- **Display**: Both show same name but have different IDs
- **Recommendation**: Use unique names or add distinguisher (e.g., "Lyra (Alice)")

## Limitations (Current Version)

- ✅ One-way sync: PC → Tracker (creation only)
- ❌ No auto-update when PC note changes (planned for Phase 2)
- ❌ No bulk import of existing PCs (planned for Phase 2)
- ❌ No PC import from tracker to notes (planned for Phase 2)
- ✅ GM campaigns only (by design)

## Upcoming Features (Phase 2 & 3)

### Phase 2: Sync & Updates
- [ ] Bidirectional sync between PC notes and tracker
- [ ] Command: "Sync PC to Initiative Tracker"
- [ ] Command: "Sync All PCs to Initiative Tracker"
- [ ] Command: "Import PCs from Initiative Tracker"
- [ ] Automatic detection of PC stat changes

### Phase 3: Enhanced Party Features
- [ ] Party Dashboard note with all member stats
- [ ] Quick "Load Party" button in scenes
- [ ] Session attendance tracking
- [ ] Party XP and treasure distribution
- [ ] Party inventory management

## Technical Details

### Initiative Tracker Data Structure

PCs are stored in Initiative Tracker's `data.json`:

```json
{
  "players": [
    {
      "name": "Lyra Moonwhisper",
      "id": "ID_abc123def456",
      "initiative": 0,
      "modifier": 2,
      "hp": 18,
      "currentMaxHP": 18,
      "currentHP": 18,
      "tempHP": 0,
      "ac": 13,
      "currentAC": 13,
      "level": 3,
      "path": "Shore of Dreams/PCs/Lyra Moonwhisper.md",
      "note": "Wizard - Player: Alice",
      "player": true,
      "marker": "default",
      "status": [],
      "enabled": true,
      "active": false,
      "hidden": false,
      "friendly": true
    }
  ],
  "parties": [
    {
      "name": "Shore of Dreams Party",
      "id": "ID_789xyz012abc",
      "players": ["ID_abc123def456", "ID_def456ghi789"]
    }
  ],
  "defaultParty": "ID_789xyz012abc"
}
```

### ID Generation
- Format: `ID_` followed by 12 random hexadecimal characters
- Example: `ID_a3f7b2c8d9e1`
- Ensures uniqueness across players and parties

### Party Naming Convention
- Format: `[Campaign Name] Party`
- Example: "Shore of Dreams Party"
- Prevents conflicts between campaigns

## See Also

- [PC Creation Guide](./PC_CREATION.md)
- [Initiative Tracker Integration](./INITIATIVE_TRACKER.md)
- [Scene Encounter Builder](./SCENE_ENCOUNTERS.md)

---

**Plugin Version:** 0.2.0  
**Feature:** Party Management Integration  
**Phase:** 1 (Auto-registration)  
**Status:** ✅ Implemented
