# Item Creation Feature

## Overview
Added comprehensive item creation functionality to the D&D Campaign Hub plugin, supporting both simple D&D 5e items and complex evolving homebrew items.

## Features

### Item Types
1. **Simple D&D 5e Item**
   - Standard magical or mundane items
   - Fixed properties and abilities
   - Complete description

2. **Evolving Homebrew Item**
   - Items that grow with character level
   - Multiple evolution thresholds
   - Progressive power scaling
   - Inspired by items like Vestiges of Divergence

### Item Properties

#### Core Properties
- **Name**: Item name
- **Category**: weapon, armor, wondrous, potion, scroll, ring, rod, staff, wand, other
- **Rarity**: common, uncommon, rare, very rare, legendary, artifact
- **Attunement**: Toggle + optional requirement (e.g., "by a wizard")
- **Weight**: Optional (e.g., "3 lb.")
- **Value**: Optional (e.g., "500 gp")

#### Simple Items
- Full description of properties and abilities

#### Evolving Items
- Base description (dormant state)
- Multiple level thresholds (e.g., Level 5, 10, 15)
- Evolution descriptions for each threshold
- Automatic sorting by level

## Implementation

### Commands
- **⚔️ Create New Item**: Opens item creation modal

### Modal UI
- Item type selector (Simple/Evolving)
- Dynamic form that adapts based on item type
- Campaign selector to choose save location
- Level threshold manager for evolving items

### File Structure
Items are saved to: `{CampaignPath}/Items/{ItemName}.md`

Example: `ttrpgs/Frozen Sick (SOLINA)/Items/Sword of the Planes.md`

### Frontmatter
```yaml
---
type: item
name: 'Sword of the Planes'
item_type: evolving
category: weapon
rarity: legendary
requires_attunement: true
attunement_requirement: 'by a spellcaster'
weight: '6 lb.'
value: '25000 gp'
campaign: 'Frozen Sick (SOLINA)'
world: 'Exandria'
date: 2026-02-05
---
```

### Content Format

#### Simple Items
```markdown
# Item Name

*Rarity category (requires attunement)*

## Properties
- **Weight:** 3 lb.
- **Value:** 500 gp

## Description
Full description...

## Notes
Additional notes...
```

#### Evolving Items
```markdown
# Item Name

*Rarity category (requires attunement by a class)*

## Properties
- **Weight:** 6 lb.
- **Value:** 25000 gp

## Base Properties
Description of dormant/base state...

## Evolution

This item evolves as its attuned owner gains levels:

### Level 5
First evolution description...

### Level 10
Second evolution description...

### Level 15
Third evolution description...

## Notes
Additional notes...
```

## Code Structure

### New Classes
- `ItemCreationModal`: Main modal for item creation
  - Dynamic UI rendering based on item type
  - Level threshold management
  - Campaign selection
  - Validation

### Modified Plugin Methods
- `createItem()`: Opens ItemCreationModal
- Added command: `create-item`

## Usage

1. Open command palette
2. Select "⚔️ Create New Item"
3. Fill in item details:
   - Choose Simple or Evolving
   - Set rarity, category, attunement
   - Add description
   - For evolving items: Add level thresholds
4. Select campaign
5. Click "Create Item"

Item note is created and opened automatically.

## Future Enhancements

Potential additions:
- Item templates (weapon types, armor types)
- Spell/ability integration
- Item history/lore tracking
- Owner/location tracking
- Edit existing items functionality
- Bulk import from D&D sources
- Integration with character sheets

## Files Changed
- `src/main.ts`: 
  - Added ItemCreationModal class (~450 lines)
  - Added createItem() method
  - Added create-item command
  - Removed old simple createItem implementation
