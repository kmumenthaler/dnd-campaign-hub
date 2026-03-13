import { describe, expect, it } from "vitest";
import { parseYamlFrontmatter, updateYamlFrontmatter } from "../../src/utils/YamlFrontmatter";

describe("utils/YamlFrontmatter", () => {
  it("parses YAML frontmatter arrays and nested objects", () => {
    const input = [
      "---",
      "type: encounter",
      "creatures:",
      "  - name: Goblin",
      "    count: 2",
      "difficulty:",
      "  rating: medium",
      "---",
      "",
      "# Encounter",
    ].join("\n");

    const parsed = parseYamlFrontmatter<{
      type: string;
      creatures: Array<{ name: string; count: number }>;
      difficulty: { rating: string };
    }>(input);

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter.creatures[0]).toEqual({ name: "Goblin", count: 2 });
    expect(parsed.frontmatter.difficulty).toEqual({ rating: "medium" });
    expect(parsed.body).toContain("# Encounter");
  });

  it("updates frontmatter with arrays and objects while keeping the body", () => {
    const input = [
      "---",
      "type: scene",
      "status: planned",
      "---",
      "",
      "# Scene",
      "Body text",
    ].join("\n");

    const updated = updateYamlFrontmatter(input, (frontmatter) => ({
      ...frontmatter,
      encounter_creatures: [
        { name: "Wolf", count: 2 },
        { name: "Bandit", count: 1 },
      ],
      encounter_difficulty: {
        rating: "hard",
        enemy_count: 3,
      },
      selected_party_id: "party-1",
    }));

    const reparsed = parseYamlFrontmatter<Record<string, any>>(updated);

    expect(reparsed.frontmatter.encounter_creatures).toEqual([
      { name: "Wolf", count: 2 },
      { name: "Bandit", count: 1 },
    ]);
    expect(reparsed.frontmatter.encounter_difficulty).toEqual({
      rating: "hard",
      enemy_count: 3,
    });
    expect(reparsed.frontmatter.selected_party_id).toBe("party-1");
    expect(reparsed.body).toContain("# Scene");
    expect(reparsed.body).toContain("Body text");
  });
});