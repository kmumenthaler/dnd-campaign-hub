import { App, TFile, TFolder, Notice } from "obsidian";
import { MarkerLibrary } from "../marker/MarkerLibrary";
import { MigrationStep, MigrationContext, MigrationResult, MigrationScanResult, TEMPLATE_VERSIONS } from "./types";
import { MigrationRegistry } from "./registry";
import {
  parseFrontmatter,
  getTemplateVersion,
  getEntityType,
  setFrontmatterField,
  compareVersions,
} from "./frontmatter";

/**
 * Orchestrates the migration process: scanning, backing up, and applying
 * migration steps to vault files.
 *
 * Design guarantees:
 * - Each file is read once, all migrations applied in-memory, written once.
 * - If any migration step throws, the file is NOT written (atomic).
 * - A backup is created before each file is modified.
 */
export class MigrationRunner {
  private app: App;
  private registry: MigrationRegistry;
  private markerLibrary: MarkerLibrary;
  private backupFolder = ".dnd-hub-backups";

  constructor(app: App, registry: MigrationRegistry, markerLibrary: MarkerLibrary) {
    this.app = app;
    this.registry = registry;
    this.markerLibrary = markerLibrary;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Scan a campaign folder (and known shared folders) for files needing migration.
   */
  async scanForMigrations(campaignPath: string): Promise<MigrationScanResult[]> {
    const results: MigrationScanResult[] = [];
    const folder = this.app.vault.getAbstractFileByPath(campaignPath);
    if (folder instanceof TFolder) {
      await this.scanFolder(folder, results);
    }

    // Shared folders that may contain entity notes
    for (const sharedPath of ["z_Traps", "z_Beastiarity"]) {
      const shared = this.app.vault.getAbstractFileByPath(sharedPath);
      if (shared instanceof TFolder) {
        await this.scanFolder(shared, results);
      }
    }

    return results;
  }

  /**
   * Migrate a list of files. Returns per-file results.
   */
  async migrateFiles(
    files: MigrationScanResult[],
    onProgress?: (current: number, total: number, file: TFile) => void,
  ): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const total = files.length;

    for (let i = 0; i < files.length; i++) {
      const scan = files[i]!;
      onProgress?.(i + 1, total, scan.file);
      const result = await this.migrateFile(scan);
      results.push(result);
    }

    return results;
  }

  /**
   * Clean up old backup files.
   */
  async cleanupBackups(): Promise<number> {
    const folder = this.app.vault.getAbstractFileByPath(this.backupFolder);
    if (!(folder instanceof TFolder)) return 0;

    let count = 0;
    const files = this.collectFiles(folder);
    for (const file of files) {
      await this.app.vault.delete(file);
      count++;
    }

    // Remove the backup folder itself
    const emptyFolder = this.app.vault.getAbstractFileByPath(this.backupFolder);
    if (emptyFolder instanceof TFolder) {
      await this.app.vault.delete(emptyFolder, true);
    }

    return count;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async scanFolder(folder: TFolder, results: MigrationScanResult[]): Promise<void> {
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        const scan = await this.checkFile(child);
        if (scan) results.push(scan);
      } else if (child instanceof TFolder) {
        await this.scanFolder(child, results);
      }
    }
  }

  private async checkFile(file: TFile): Promise<MigrationScanResult | null> {
    const content = await this.app.vault.read(file);
    const entityType = getEntityType(content);
    if (!entityType) return null;

    // Must be a known entity type
    const targetVersion = TEMPLATE_VERSIONS[entityType];
    if (!targetVersion) return null;

    const currentVersion = getTemplateVersion(content) ?? "0.0.0";

    // Check version-based migrations
    const pending = this.registry.getApplicable(entityType, currentVersion);
    if (pending.length > 0) {
      return {
        file,
        fileType: entityType,
        currentVersion,
        targetVersion,
        pendingMigrations: pending,
      };
    }

    // Integrity check: verify the dnd-hub render block exists for types that should have it
    if (this.shouldHaveRenderBlock(entityType) && !content.includes("```dnd-hub")) {
      // Re-run the render block migration even if version matches
      const renderMigrations = this.registry.getApplicable(entityType, "0.0.0")
        .filter(m => m.id.endsWith(targetVersion));
      if (renderMigrations.length > 0) {
        return {
          file,
          fileType: entityType,
          currentVersion,
          targetVersion,
          pendingMigrations: renderMigrations,
        };
      }
    }

    return null;
  }

  /**
   * Apply all pending migrations to a single file.
   *
   * 1. Read file content once.
   * 2. Create a backup.
   * 3. Apply each migration step in order (in-memory).
   * 4. Update template_version.
   * 5. Write the file once.
   *
   * If any step throws, the file is not written.
   */
  private async migrateFile(scan: MigrationScanResult): Promise<MigrationResult> {
    const { file, fileType, currentVersion, pendingMigrations } = scan;
    const baseResult: Omit<MigrationResult, "success"> = {
      file,
      fromVersion: currentVersion,
      toVersion: currentVersion,
    };

    try {
      // 1. Read
      const originalContent = await this.app.vault.read(file);
      let content = originalContent;

      // 2. Backup
      await this.createBackup(file, originalContent);

      // 3. Apply migrations
      let lastVersion = currentVersion;

      for (const migration of pendingMigrations) {
        console.log(`[Migration] Applying ${migration.id} to ${file.path}`);
        const parsed = parseFrontmatter(content);
        const ctx: MigrationContext = {
          content,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          filePath: file.path,
          app: this.app,
          markerLibrary: this.markerLibrary,
        };

        const result = await migration.apply(ctx);
        if (result !== null) {
          content = result;
        }
        lastVersion = migration.targetVersion;
        console.log(`[Migration] ${migration.id} applied to ${file.path}`);
      }

      // 4. Stamp final version
      content = setFrontmatterField(content, "template_version", lastVersion);

      // 5. Write once (only if content changed)
      if (content !== originalContent) {
        await this.app.vault.modify(file, content);
      }

      return { ...baseResult, success: true, toVersion: lastVersion };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Migration] Failed on ${file.path}:`, error);
      return { ...baseResult, success: false, error: msg };
    }
  }

  private async createBackup(file: TFile, content: string): Promise<void> {
    const backupPath = `${this.backupFolder}/${file.path}`;

    // Ensure parent directories exist.
    // Note: getAbstractFileByPath may not reflect folders created moments ago
    // (Obsidian vault cache lag), so we catch "Folder already exists" errors.
    const parts = backupPath.split("/");
    parts.pop(); // Remove filename
    let dirPath = "";
    for (const part of parts) {
      dirPath = dirPath ? `${dirPath}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(dirPath);
      if (!existing) {
        try {
          await this.app.vault.createFolder(dirPath);
        } catch (e) {
          // Ignore "Folder already exists" — race with vault cache
          if (!(e instanceof Error && e.message.includes("Folder already exists"))) {
            throw e;
          }
        }
      }
    }

    // Write backup (overwrite if exists)
    const existingBackup = this.app.vault.getAbstractFileByPath(backupPath);
    if (existingBackup instanceof TFile) {
      await this.app.vault.modify(existingBackup, content);
    } else {
      try {
        await this.app.vault.create(backupPath, content);
      } catch (e) {
        // Vault cache may not reflect the file yet — fall back to adapter
        if (e instanceof Error && e.message.includes("File already exists")) {
          await this.app.vault.adapter.write(backupPath, content);
        } else {
          throw e;
        }
      }
    }
  }

  private shouldHaveRenderBlock(entityType: string): boolean {
    const typesWithRenderBlock = [
      "player", "pc", "npc", "creature", "scene", "adventure",
      "trap", "item", "spell", "faction", "encounter-table", "point-of-interest",
    ];
    return typesWithRenderBlock.includes(entityType);
  }

  private collectFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile) {
        files.push(child);
      } else if (child instanceof TFolder) {
        files.push(...this.collectFiles(child));
      }
    }
    return files;
  }
}
