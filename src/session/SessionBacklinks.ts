function extractBacklinkPath(value: unknown): string {
  if (typeof value === "object" && value !== null && "path" in value) {
    return String((value as { path?: unknown }).path || "").replace(/\.md$/i, "").trim();
  }
  const text = String(value || "").trim();
  const path = text.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/)?.[1] || text;
  return path.replace(/\.md$/i, "").trim();
}

function canonicalLink(path: string): string {
  return `[[${path.replace(/\.md$/i, "")}.md]]`;
}

/** Normalize legacy scalar/array backlink values while preserving order and removing duplicates. */
export function normalizeSessionBacklinks(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const path = extractBacklinkPath(value);
    if (!path || seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    normalized.push(canonicalLink(path));
  }
  return normalized;
}

export function addSessionBacklink(raw: unknown, sessionPath: string): string[] {
  const normalized = normalizeSessionBacklinks(raw);
  const target = extractBacklinkPath(sessionPath).toLowerCase();
  if (!normalized.some((value) => extractBacklinkPath(value).toLowerCase() === target)) {
    normalized.push(canonicalLink(sessionPath));
  }
  return normalized;
}

export function removeSessionBacklink(raw: unknown, sessionPath: string): string[] {
  const target = extractBacklinkPath(sessionPath).toLowerCase();
  return normalizeSessionBacklinks(raw)
    .filter((value) => extractBacklinkPath(value).toLowerCase() !== target);
}
