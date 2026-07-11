import { describe, expect, it } from "vitest";
import { getAllMigrations } from "../../src/migration/registry";
import type { MigrationContext } from "../../src/migration/types";

const migration = getAllMigrations().find(step => step.id === "session-1.7.0")!;

function context(content: string): MigrationContext {
  return {
    content,
    frontmatter: {},
    body: "",
    filePath: "Campaign/001_20260711.md",
    app: {} as MigrationContext["app"],
    markerLibrary: {} as MigrationContext["markerLibrary"],
  };
}

describe("session-1.7.0 migration", () => {
  it("preserves the legacy primary adventure and adds it to adventures", async () => {
    const input = `---\ntype: session\ntemplate_version: 1.6.1\nadventure: "[[Campaign/Adventures/Old/Old.md]]"\n---\n# Session`;
    const output = await migration.apply(context(input));

    expect(output).toContain('adventure: "[[Campaign/Adventures/Old/Old.md]]"');
    expect(output).toContain('adventures:\n  - "[[Campaign/Adventures/Old/Old.md]]"');
    expect(output).toContain("template_version: 1.7.0");
  });

  it("adds an empty list when the session has no adventure", async () => {
    const input = `---\ntype: session\ntemplate_version: 1.6.1\nadventure: \n---\n# Session`;
    const output = await migration.apply(context(input));

    expect(output).toContain("adventures: []");
  });

  it("does not duplicate an existing adventures field", async () => {
    const input = `---\ntype: session\ntemplate_version: 1.6.1\nadventure: "[[Old]]"\nadventures:\n  - "[[Old]]"\n  - "[[New]]"\n---\n# Session`;
    const output = await migration.apply(context(input));

    expect(output?.match(/^adventures:/gm)).toHaveLength(1);
    expect(output).toContain('- "[[New]]"');
  });
});
