/**
 * Migration module for D&D Campaign Hub
 *
 * Architecture:
 * - types.ts       — Interfaces, TEMPLATE_VERSIONS constant
 * - frontmatter.ts — Content parsing / manipulation utilities
 * - registry.ts    — MigrationRegistry + all migration step definitions
 * - runner.ts      — MigrationRunner (scan, backup, apply, write)
 * - MigrationModal.ts — User-facing migration UI
 */

export { TEMPLATE_VERSIONS } from "./types";
export type { MigrationStep, MigrationContext, MigrationResult, MigrationScanResult } from "./types";
export { MigrationRegistry, createMigrationRegistry } from "./registry";
export { MigrationRunner } from "./runner";
export { MigrationModal } from "./MigrationModal";
export type { MigrationPluginContext } from "./MigrationModal";
export { compareVersions, parseFrontmatter, getTemplateVersion, getEntityType } from "./frontmatter";
