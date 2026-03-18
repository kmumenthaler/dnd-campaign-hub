/**
 * Frontmatter parsing and manipulation utilities.
 *
 * These operate on raw content strings (no YAML library needed).
 * They are intentionally simple — designed for the flat key: value
 * frontmatter used by D&D Campaign Hub notes, not arbitrary YAML.
 */

export interface FrontmatterParseResult {
  /** Parsed key-value pairs (values are raw strings) */
  frontmatter: Record<string, string>;
  /** The raw frontmatter text between the --- fences */
  rawFrontmatter: string;
  /** Everything after the closing --- */
  body: string;
  /** Whether the content has a valid frontmatter block */
  hasFrontmatter: boolean;
}

const FM_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const FIELD_REGEX = /^([\w][\w-]*):\s*(.*)$/;

/**
 * Parse frontmatter from file content.
 * Returns flat key-value pairs and the body text.
 */
export function parseFrontmatter(content: string): FrontmatterParseResult {
  const match = content.match(FM_REGEX);
  if (!match || match[1] === undefined) {
    return { frontmatter: {}, rawFrontmatter: "", body: content, hasFrontmatter: false };
  }

  const rawFrontmatter = match[1];
  const body = match[2] ?? "";
  const frontmatter: Record<string, string> = {};

  for (const line of rawFrontmatter.split("\n")) {
    const m = line.match(FIELD_REGEX);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      frontmatter[m[1]] = m[2].trim();
    }
  }

  return { frontmatter, rawFrontmatter, body, hasFrontmatter: true };
}

/**
 * Get the template_version from file content.
 */
export function getTemplateVersion(content: string): string | null {
  const match = content.match(/^template_version:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * Get the entity type from file content.
 *
 * Resolution order:
 * 1. `plugin_type` field — explicit plugin entity type (used by SRD creature
 *    notes where `type` holds the D&D monster category, e.g. "humanoid").
 * 2. SRD bestiary fingerprint — notes with `statblock: true` and
 *    `source: D&D 5e SRD` are creature notes regardless of `type`.
 * 3. `type` field — the standard plugin entity type for all other notes.
 */
export function getEntityType(content: string): string | null {
  const pluginTypeMatch = content.match(/^plugin_type:\s*(.+)$/m);
  if (pluginTypeMatch?.[1]) return pluginTypeMatch[1].trim();

  // SRD bestiary fingerprint: statblock notes from the official SRD import
  if (/^statblock:\s*true$/m.test(content) && /^source:\s*D&D 5e SRD$/m.test(content)) {
    return "creature";
  }

  const match = content.match(/^type:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * Set (or add) a frontmatter field. If the field exists, its value is updated.
 * If it doesn't exist, it is inserted after `type:` (or at the end of frontmatter).
 */
export function setFrontmatterField(content: string, field: string, value: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || match[1] === undefined) return content;

  let fm = match[1];
  const fieldRegex = new RegExp(`^${escapeRegex(field)}:\\s*.*$`, "m");

  if (fieldRegex.test(fm)) {
    fm = fm.replace(fieldRegex, `${field}: ${value}`);
  } else {
    // Insert after type: if present, otherwise append
    if (/^type:/m.test(fm)) {
      fm = fm.replace(/^(type:\s*.+)$/m, `$1\n${field}: ${value}`);
    } else {
      fm = `${fm}\n${field}: ${value}`;
    }
  }

  return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
}

/**
 * Add a frontmatter field only if it doesn't already exist.
 */
export function addFrontmatterField(content: string, field: string, value: string): string {
  const { frontmatter } = parseFrontmatter(content);
  if (field in frontmatter) return content;
  return setFrontmatterField(content, field, value);
}

/**
 * Check if a frontmatter field exists.
 */
export function hasFrontmatterField(content: string, field: string): boolean {
  const { frontmatter } = parseFrontmatter(content);
  return field in frontmatter;
}

/**
 * Insert a frontmatter field after a specific existing field.
 */
export function addFrontmatterFieldAfter(
  content: string,
  field: string,
  value: string,
  afterField: string,
): string {
  const { frontmatter } = parseFrontmatter(content);
  if (field in frontmatter) return content;

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || match[1] === undefined) return content;

  let fm = match[1];
  const afterRegex = new RegExp(`^(${escapeRegex(afterField)}:\\s*.*)$`, "m");

  if (afterRegex.test(fm)) {
    fm = fm.replace(afterRegex, `$1\n${field}: ${value}`);
  } else {
    fm = `${fm}\n${field}: ${value}`;
  }

  return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
}

/**
 * Compare two semver strings. Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

/**
 * Remove ALL dataviewjs code blocks from content.
 * Returns the modified content, or null if no blocks were found.
 */
export function removeAllDataviewjsBlocks(content: string): string | null {
  const blockRegex = /```dataviewjs\n[\s\S]*?```/g;
  if (!blockRegex.test(content)) return null;
  const cleaned = content.replace(/```dataviewjs\n[\s\S]*?```/g, "");
  return cleaned;
}

/**
 * Find and replace a dataviewjs code block that contains a specific marker string.
 * Returns the modified content, or null if no matching block was found.
 */
export function replaceDataviewjsBlock(
  content: string,
  markerText: string,
  replacement: string,
): string | null {
  const blockRegex = /```dataviewjs\n[\s\S]*?```/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    if (match[0].includes(markerText)) {
      return content.replace(match[0], replacement);
    }
  }
  return null;
}

/**
 * Replace all ```dataview ... ``` TABLE blocks with dnd-hub-table blocks.
 * Extracts the folder path from FROM and the entity type from WHERE.
 * Returns modified content, or null if no changes were made.
 */
export function replaceDataviewTableBlocks(content: string): string | null {
  const dvBlockRegex = /```dataview\n([\s\S]*?)```/g;
  let out = content;
  let changed = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = dvBlockRegex.exec(out);
    if (!match) break;
    const body = match[1]!;

    const fromMatch = body.match(/[Ff][Rr][Oo][Mm]\s+"([^"]+)"/);
    if (!fromMatch) continue;

    let type = "unknown";
    if (/type\s*=\s*"player"/i.test(body)) type = "player";
    else if (/type\s*=\s*"npc"/i.test(body)) type = "npc";
    else if (/contains\s*\(\s*type\s*,\s*"session"\s*\)/i.test(body)) type = "session";
    else if (/type\s*=\s*"faction"/i.test(body)) type = "faction";
    else if (/type\s*=\s*"adventure"/i.test(body)) type = "adventure";

    const replacement = "```dnd-hub-table\nsource: " + fromMatch[1] + "\ntype: " + type + "\n```";
    out = out.replace(match[0], replacement);
    dvBlockRegex.lastIndex = 0; // Reset since string changed
    changed = true;
  }

  return changed ? out : null;
}

/**
 * Insert a block of text after the first heading (# Title) in a note.
 * If no heading is found, inserts after the frontmatter.
 */
export function insertAfterTitle(content: string, block: string): string {
  // Try: after frontmatter + title heading
  const titleMatch = content.match(/^(---\n[\s\S]*?\n---\n\n?)(#\s+.+\n)/m);
  if (titleMatch) {
    return content.replace(
      titleMatch[0],
      `${titleMatch[1]}${titleMatch[2]}\n${block}\n\n`,
    );
  }
  // Fallback: after frontmatter
  return content.replace(
    /^(---\n[\s\S]*?\n---\n)/,
    `$1\n${block}\n\n`,
  );
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
