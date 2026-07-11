export const QUICK_NOTES_HEADING = "## Quick Notes (During Session)";

export function extractQuickNotes(content: string): string {
  const start = content.indexOf(QUICK_NOTES_HEADING);
  if (start < 0) return "";
  const bodyStart = start + QUICK_NOTES_HEADING.length;
  const remainder = content.slice(bodyStart);
  const nextHeading = remainder.search(/\r?\n##\s/);
  return (nextHeading < 0 ? remainder : remainder.slice(0, nextHeading)).trim();
}

export function updateQuickNotesSection(content: string, notes: string): string {
  const start = content.indexOf(QUICK_NOTES_HEADING);
  const normalizedNotes = notes.trim();

  if (start < 0) {
    if (!normalizedNotes) return content;
    return `${content.trimEnd()}\n\n${QUICK_NOTES_HEADING}\n\n${normalizedNotes}\n`;
  }

  const bodyStart = start + QUICK_NOTES_HEADING.length;
  const remainder = content.slice(bodyStart);
  const nextHeadingOffset = remainder.search(/\r?\n##\s/);
  const sectionEnd = nextHeadingOffset < 0 ? content.length : bodyStart + nextHeadingOffset;
  const suffix = content.slice(sectionEnd);
  return `${content.slice(0, bodyStart)}\n\n${normalizedNotes}${normalizedNotes ? "\n" : ""}${suffix}`;
}
