import { describe, expect, it } from "vitest";
import { getAllMigrations } from "../../src/migration/registry";
import type { MigrationContext } from "../../src/migration/types";

const migration = getAllMigrations().find(step => step.id === "session-1.8.0")!;
const context = (content: string): MigrationContext => ({
  content, frontmatter: {}, body: "", filePath: "Campaign/Sessions/Session 1.md",
  app: {} as MigrationContext["app"], markerLibrary: {} as MigrationContext["markerLibrary"],
});

describe("session-1.8.0 migration", () => {
  it("adds planned status and advances the template version", async () => {
    const output = await migration.apply(context("---\ntype: session\ntemplate_version: 1.7.0\n---\n# Session"));
    expect(output).toContain("type: session\nstatus: planned");
    expect(output).toContain("template_version: 1.8.0");
  });

  it("preserves an existing lifecycle status and remains idempotent", async () => {
    const input = "---\ntype: session\nstatus: completed\ntemplate_version: 1.8.0\n---\n# Session";
    const once = await migration.apply(context(input));
    const twice = await migration.apply(context(once!));
    expect(twice).toBe(once);
    expect(twice?.match(/^status:/gm)).toHaveLength(1);
  });
});
