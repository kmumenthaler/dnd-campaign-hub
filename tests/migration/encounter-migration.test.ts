import { describe, expect, it } from "vitest";
import {
  removeAllDataviewjsBlocks,
  setFrontmatterField,
  insertAfterTitle,
} from "../../src/migration/frontmatter";

/**
 * Simulates the encounter-1.2.0 migration logic against realistic note content.
 */
function applyEncounter120(content: string): string | null {
  const DND_HUB_BLOCK = "```dnd-hub\n```";
  let out = content;

  if (out.includes("```dnd-hub") && !out.includes("```dataviewjs")) return null;

  const stripped = removeAllDataviewjsBlocks(out);
  if (stripped) out = stripped;

  if (!out.includes("```dnd-hub")) {
    out = insertAfterTitle(out, DND_HUB_BLOCK);
  }

  if (!out.includes("encounter-difficulty")) {
    const diffHeader = /^(## .*Difficulty.*$)/m;
    if (diffHeader.test(out)) {
      out = out.replace(diffHeader, "$1\n\n```dnd-hub-view\nencounter-difficulty\n```");
    }
  }

  if (!out.includes("encounter-creatures")) {
    const creaturesHeader = /^(## .*Creatures.*$)/m;
    if (creaturesHeader.test(out)) {
      out = out.replace(creaturesHeader, "$1\n\n```dnd-hub-view\nencounter-creatures\n```");
    }
  }

  // Collapse runs of 3+ blank lines left by removed/inserted blocks
  out = out.replace(/\n{3,}/g, "\n\n");

  if (out === content) return null;
  return setFrontmatterField(out, "template_version", "1.2.0");
}

// Realistic old encounter note with three dataviewjs blocks and no template_version
const OLD_ENCOUNTER_NOTE = `---
type: encounter
name: Goblin Ambush
creatures:
  - name: Goblin
    count: 4
    hp: 7
    ac: 15
    cr: "1/4"
include_party: true
use_color_names: true
difficulty:
  rating: Medium
  color: orange
  party_count: 4
  party_avg_level: 3.0
  party_total_hp: 120
  party_avg_ac: 15.0
  party_total_dpr: 40.0
  party_hit_chance: 60
  party_effective_dpr: 24
  enemy_count: 4
  enemy_total_hp: 28
  enemy_avg_ac: 15.0
  enemy_total_dpr: 20.0
  enemy_hit_chance: 50
  enemy_effective_dpr: 10
  rounds_to_defeat: 2
  rounds_party_survives: 12
  survival_ratio: 6.00
date: 2025-12-01
---

# Goblin Ambush

\`\`\`dataviewjs
const buttonContainer = dv.container.createDiv({cls: "dnd-hub-buttons"});
const combatBtn = buttonContainer.createEl("button", {text: "⚔️ Open in Combat Tracker"});
combatBtn.addEventListener("click", () => app.commands.executeCommandById("dnd-campaign-hub:open-combat-tracker"));
const editBtn = buttonContainer.createEl("button", {text: "✏️ Edit Encounter"});
editBtn.addEventListener("click", () => app.commands.executeCommandById("dnd-campaign-hub:edit-encounter"));
const deleteBtn = buttonContainer.createEl("button", {text: "🗑️ Delete Encounter"});
deleteBtn.addEventListener("click", () => app.commands.executeCommandById("dnd-campaign-hub:delete-encounter"));
\`\`\`

---

## Difficulty Analysis

\`\`\`dataviewjs
const fm = dv.current().difficulty;
const rating = fm.rating;
dv.paragraph("**Rating:** " + rating);
dv.paragraph("Party: " + fm.party_count + " members, avg level " + fm.party_avg_level);
\`\`\`

---

## Creatures

\`\`\`dataviewjs
const creatures = dv.current().creatures;
dv.table(["Creature", "Count", "CR", "HP", "AC"],
  creatures.map(c => [c.name, c.count, c.cr, c.hp, c.ac]));
\`\`\`

---

## GM Notes

_Add notes about tactics, environment, or special conditions here._
`;

describe("encounter-1.2.0 migration", () => {
  it("replaces all dataviewjs blocks in old encounter notes", () => {
    const result = applyEncounter120(OLD_ENCOUNTER_NOTE);

    expect(result).not.toBeNull();
    expect(result).not.toContain("```dataviewjs");
    expect(result).toContain("```dnd-hub\n```");
    expect(result).toContain("```dnd-hub-view\nencounter-difficulty\n```");
    expect(result).toContain("```dnd-hub-view\nencounter-creatures\n```");
    expect(result).toContain("template_version: 1.2.0");
    // Preserves user content
    expect(result).toContain("# Goblin Ambush");
    expect(result).toContain("## GM Notes");
    expect(result).toContain("type: encounter");
  });

  it("is idempotent — returns null on already-migrated notes", () => {
    const first = applyEncounter120(OLD_ENCOUNTER_NOTE)!;
    expect(first).not.toBeNull();

    const second = applyEncounter120(first);
    expect(second).toBeNull();
  });

  it("handles notes that encounter-1.1.0 partially migrated (dnd-hub present, dataviewjs remaining)", () => {
    // Simulate: encounter-1.1.0 inserted dnd-hub block but failed to replace difficulty/creatures
    const partiallyMigrated = `---
type: encounter
template_version: 1.1.0
name: Goblin Ambush
creatures:
  - name: Goblin
    count: 4
difficulty:
  rating: Medium
  color: orange
date: 2025-12-01
---

# Goblin Ambush

\`\`\`dnd-hub
\`\`\`

---

## Difficulty Analysis

\`\`\`dataviewjs
const fm = dv.current().difficulty;
dv.paragraph("**Rating:** " + fm.rating);
\`\`\`

---

## Creatures

\`\`\`dataviewjs
const creatures = dv.current().creatures;
dv.table(["Creature", "Count"], creatures.map(c => [c.name, c.count]));
\`\`\`

---

## GM Notes
`;

    const result = applyEncounter120(partiallyMigrated);

    expect(result).not.toBeNull();
    expect(result).not.toContain("```dataviewjs");
    expect(result).toContain("```dnd-hub\n```");
    expect(result).toContain("encounter-difficulty");
    expect(result).toContain("encounter-creatures");
    expect(result).toContain("template_version: 1.2.0");
  });

  it("does not leave triple blank lines after removing blocks", () => {
    const result = applyEncounter120(OLD_ENCOUNTER_NOTE)!;
    expect(result).not.toMatch(/\n{3,}/);
  });
});
