import { App, TFile } from "obsidian";
import { MarkerLibrary } from "../marker/MarkerLibrary";

/**
 * Context passed to each migration step's apply() function.
 * Contains the file content (in-memory), parsed frontmatter, and
 * references needed for side effects (token creation, etc.).
 */
export interface MigrationContext {
  /** Full file content (frontmatter + body) */
  content: string;
  /** Parsed frontmatter key-value pairs (re-parsed before each step) */
  frontmatter: Record<string, string>;
  /** File body (everything after the frontmatter block) */
  body: string;
  /** Vault path of the file being migrated */
  filePath: string;
  /** Obsidian App reference for side effects */
  app: App;
  /** MarkerLibrary for token creation */
  markerLibrary: MarkerLibrary;
}

/**
 * A single migration step that brings one or more entity types
 * from their previous version to `targetVersion`.
 *
 * Migrations run in ascending targetVersion order.
 * Each step receives the cumulative content from prior steps.
 */
export interface MigrationStep {
  /** Unique identifier, e.g. "player-1.1.0" */
  id: string;
  /** Entity types this migration applies to (frontmatter `type` values) */
  entityTypes: string[];
  /** The version the file will be at after this migration */
  targetVersion: string;
  /** Human-readable description shown in the migration modal */
  description: string;
  /**
   * Apply the migration to the file content.
   * Return the modified content string, or `null` if no content changes are needed.
   * Side effects (token creation, etc.) may be performed within this function.
   */
  apply(ctx: MigrationContext): Promise<string | null>;
}

/** Result of migrating a single file */
export interface MigrationResult {
  file: TFile;
  success: boolean;
  fromVersion: string;
  toVersion: string;
  error?: string;
}

/** Information about a file that needs migration (used by the UI) */
export interface MigrationScanResult {
  file: TFile;
  fileType: string;
  currentVersion: string;
  targetVersion: string;
  pendingMigrations: MigrationStep[];
}

/** Current target versions for all entity types */
export const TEMPLATE_VERSIONS: Record<string, string> = {
  world: "1.3.0",
  session: "1.5.0",
  npc: "1.4.0",
  pc: "1.5.0",
  player: "1.5.0",
  adventure: "1.4.0",
  scene: "2.3.0",
  faction: "1.2.0",
  item: "1.2.0",
  spell: "1.2.0",
  campaign: "1.1.0",
  trap: "1.3.1",
  creature: "1.9.0",
  encounter: "1.2.0",
  "encounter-table": "1.3.0",
  "point-of-interest": "1.2.0",
};
