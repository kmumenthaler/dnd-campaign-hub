import { describe, expect, it } from "vitest";
import { getAllMigrations } from "../../src/migration/registry";
import type { MigrationContext } from "../../src/migration/types";

const migration = getAllMigrations().find(step => step.id === "session-1.9.0")!;
const context = (content: string): MigrationContext => ({
  content, frontmatter: {}, body: "", filePath: "Campaign/Sessions/Session 1.md",
  app: {} as MigrationContext["app"], markerLibrary: {} as MigrationContext["markerLibrary"],
});

describe("session-1.9.0 migration", () => {
  it("adds an empty ordered scene plan without changing existing session data", async () => {
    const input = "---\ntype: session\nadventures:\n  - [[Adventure]]\nstarting_scene: [[Scene 2]]\ntemplate_version: 1.8.0\n---\n# Session\nUser notes";
    const output = await migration.apply(context(input));
    expect(output).toContain("planned_scenes: []");
    expect(output).toContain("adventures:\n  - [[Adventure]]");
    expect(output).toContain("starting_scene: [[Scene 2]]");
    expect(output).toContain("User notes");
    expect(output).toContain("template_version: 1.9.0");
  });

  it("preserves an existing plan and is idempotent", async () => {
    const input = "---\ntype: session\nplanned_scenes:\n  - [[Scene 2]]\n  - [[Scene 4]]\ntemplate_version: 1.9.0\n---\n# Session";
    const once = await migration.apply(context(input));
    const twice = await migration.apply(context(once!));
    expect(twice).toBe(once);
    expect(twice?.match(/^planned_scenes:/gm)).toHaveLength(1);
  });
});
