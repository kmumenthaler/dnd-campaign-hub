import { parseYaml, stringifyYaml } from "obsidian";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface ParsedYamlFrontmatter<T extends Record<string, unknown>> {
  frontmatter: T;
  body: string;
  hasFrontmatter: boolean;
}

export function parseYamlFrontmatter<T extends Record<string, unknown> = Record<string, unknown>>(
  content: string,
): ParsedYamlFrontmatter<T> {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match || match[1] === undefined) {
    return { frontmatter: {} as T, body: content, hasFrontmatter: false };
  }

  const parsed = parseYaml(match[1]);
  const frontmatter = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as T)
    : ({} as T);

  return {
    frontmatter,
    body: content.slice(match[0].length),
    hasFrontmatter: true,
  };
}

export function updateYamlFrontmatter(
  content: string,
  updater: (frontmatter: Record<string, unknown>) => Record<string, unknown>,
): string {
  const parsed = parseYamlFrontmatter(content);
  if (!parsed.hasFrontmatter) return content;

  const updated = updater(structuredClone(parsed.frontmatter));
  const yamlText = stringifyYaml(updated).trimEnd();
  const suffix = parsed.body.length > 0 ? `\n${parsed.body}` : "\n";

  return `---\n${yamlText}\n---${suffix}`;
}