# Trap Difficulty Integration

## Overview
This document explains how traps are integrated into the encounter difficulty calculation system.

## Feature Branch
- **Branch**: `feature/trap-difficulty-calculation`
- **Status**: Implementation complete, ready for testing

## Changes Made

### 1. EncounterCreature Interface Enhancement
Added trap support to the creature interface:
```typescript
interface EncounterCreature {
  name: string;
  path?: string;
  cr?: string;
  count?: number;
  hp?: number;
  ac?: number;
  isTrap?: boolean;  // NEW: Flag to identify traps
  trapData?: {       // NEW: Trap-specific data structure
    type: "simple" | "complex";
    threat: "setback" | "dangerous" | "deadly";
    elements: Array<{
      name: string;
      initiative?: number;
      disableDC?: number;
      disableCheck?: string;
      damage?: string;
      damageType?: string;
      attackBonus?: string;
      saveDC?: number;
      saveAbility?: string;
      effect?: string;
    }>;
  };
}
```

### 2. Trap Statistics Calculation Methods
Added five new methods to `EncounterBuilder` class:

#### `calculateTrapStats(trapData)`
Main method that converts trap data into combat statistics:
- **HP**: 20-50 based on complexity and threat level
- **AC**: 15-20 based on complexity and threat level
- **DPR**: Calculated from damage dice/values with threat modifiers
- **Attack Bonus**: Extracted from attack bonus or save DC
- **Effective CR**: Estimated from DPR/DC using DMG tables

**Threat Level Modifiers**:
- **Setback**: DPR ×0.75 (minor inconvenience)
- **Dangerous**: DPR ×1.25 (significant threat)
- **Deadly**: DPR ×1.5 (potentially fatal)

**Complex Trap Handling**:
- Averages damage across all initiative elements
- Considers multi-action economy

#### `parseTrapDamage(damageStr)`
Parses damage strings in various formats:
- Dice notation: `"4d10"` → 22 average
- Dice + modifier: `"2d6+3"` → 10 average
- Direct value: `"45"` → 45

#### `estimateCRFromDPR(dpr)`
Maps damage per round to CR using DMG tables:
- CR 0: 1 DPR
- CR 1: 8 DPR
- CR 5: 33 DPR
- CR 10: 63 DPR
- CR 20: 123 DPR

#### `estimateCRFromDC(dc)`
Maps save DC or attack difficulty to CR:
- DC 13: CR 0-3
- DC 15: CR 5
- DC 17: CR 11
- DC 20: CR 21

#### `formatCR(cr)`
Formats fractional CRs properly:
- 0.125 → "1/8"
- 0.25 → "1/4"
- 0.5 → "1/2"

### 3. Encounter Difficulty Integration
Modified `EncounterBuilderModal.calculateEncounterDifficulty()`:

**Before**:
```typescript
for (const creature of this.creatures) {
  // Get stats from statblock or CR table
  const realStats = await this.parseStatblockStats(creature.path);
  const crStats = this.getCRStats(creature.cr);
  // Use stats for difficulty calculation
}
```

**After**:
```typescript
for (const creature of this.creatures) {
  // Check if it's a trap
  if (creature.isTrap && creature.trapData) {
    // Use trap-specific calculation
    const trapStats = await this.plugin.encounterBuilder.calculateTrapStats(creature.trapData);
    // Include trap stats in encounter totals
    continue;
  }
  
  // Regular creature handling (unchanged)
  const realStats = await this.parseStatblockStats(creature.path);
  const crStats = this.getCRStats(creature.cr);
}
```

## How It Works

### Example: Simple Trap
```yaml
trap_type: simple
trap_threat: dangerous
trap_elements:
  - name: "Thundering Squall Activation"
    damage: "4d10"
    damageType: "thunder"
    saveDC: 15
    saveAbility: "Constitution"
```

**Calculation**:
1. Parse damage: `4d10` → 22 average
2. Apply threat modifier: 22 × 1.25 (dangerous) = 27.5 DPR
3. Estimate CR from DPR: 27.5 DPR ≈ CR 4
4. Assign stats: HP=30 (simple), AC=17 (dangerous), Attack=+5 (DC 15)
5. Add to encounter as enemy creature with those stats

### Example: Complex Trap
```yaml
trap_type: complex
trap_threat: deadly
trap_elements:
  - name: "Lightning Strike"
    initiative: 20
    damage: "6d6"
  - name: "Thunder Wave"
    initiative: 15
    damage: "4d8"
  - name: "Wind Blast"
    initiative: 10
    damage: "3d10"
```

**Calculation**:
1. Parse each element's damage: 21 + 18 + 16.5 = 55.5 total
2. Average across initiatives: 55.5 / 3 = 18.5 DPR per round
3. Apply threat modifier: 18.5 × 1.5 (deadly) = 27.75 DPR
4. Estimate CR: 27.75 DPR ≈ CR 4
5. Higher stats for complexity: HP=50, AC=20, Attack=+7
6. Add to encounter as single entity (represents overall trap threat)

## Benefits

1. **Accurate Threat Assessment**: Traps now contribute meaningfully to encounter difficulty
2. **Threat Level Recognition**: Setback/Dangerous/Deadly modifiers reflect actual risk
3. **Complex Trap Handling**: Multi-element traps properly averaged across initiative
4. **CR Estimation**: Automatic CR calculation from damage/DC values
5. **Consistent Integration**: Traps use same difficulty calculation pipeline as creatures

## Testing Scenarios

### Scenario 1: Setback Trap
- **Trap**: Arrow trap, 2d6 damage, DC 12
- **Expected**: Low DPR (~5), CR ~0.5, minimal difficulty contribution
- **Result**: Should allow 1-2 CR higher main encounter

### Scenario 2: Dangerous Trap
- **Trap**: Fire jet, 4d10 damage, DC 15
- **Expected**: Medium DPR (~27), CR ~4, significant contribution
- **Result**: Equivalent to adding a CR 4 creature

### Scenario 3: Deadly Complex Trap
- **Trap**: Thundering Squall, 30 elements, avg 20 damage per round
- **Expected**: High DPR (~30), CR ~5, major contribution
- **Result**: Increases encounter difficulty by 1-2 categories

## Next Steps

1. **UI Integration**: Add trap selector to encounter builder modal
2. **Visual Feedback**: Display trap difficulty breakdown in encounter summary
3. **Testing**: Validate with real trap data from campaign
4. **Documentation**: Update user guide with trap encounter building
5. **Refinement**: Adjust modifiers based on actual play experience

## Notes

- Traps with ongoing effects may need additional consideration
- Save-or-die effects not currently modeled in DPR
- Trap disabling mechanics not factored into difficulty
- HP represents durability/coverage, not literal hit points
- AC represents detection/disable difficulty, not armor
