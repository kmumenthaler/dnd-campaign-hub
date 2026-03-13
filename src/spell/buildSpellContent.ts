import { SPELL_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration";

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\"/g, '\\"').replace(/\r?\n/g, " ");
}

function stringifyYaml(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return `"${escapeYamlString(String(value ?? ""))}"`;
}

export function buildSpellContent(spell: any): string {
  const templateVersion = TEMPLATE_VERSIONS.spell || "1.1.0";
  const components = Array.isArray(spell.components) ? spell.components.join(", ") : "";
  const classes = Array.isArray(spell.classes) && spell.classes.length > 0
    ? spell.classes.map((c: any) => c?.name).filter(Boolean).join(", ")
    : "N/A";

  const description = Array.isArray(spell.desc) && spell.desc.length > 0
    ? spell.desc.join("\n\n")
    : "Add spell description.";

  const higherLevel = Array.isArray(spell.higher_level) && spell.higher_level.length > 0
    ? spell.higher_level.join("\n\n")
    : "N/A";

  const frontmatter = `---
type: spell
template_version: ${templateVersion}
name: ${stringifyYaml(spell.name || "Spell")}
level: ${typeof spell.level === "number" ? spell.level : 1}
school: ${stringifyYaml(spell.school?.name || "")}
casting_time: ${stringifyYaml(spell.casting_time || "1 action")}
range: ${stringifyYaml(spell.range || "")}
components: ${stringifyYaml(components)}
duration: ${stringifyYaml(spell.duration || "")}
concentration: ${Boolean(spell.concentration)}
ritual: ${Boolean(spell.ritual)}
classes: ${stringifyYaml(classes)}
source: ${stringifyYaml(spell.source || "SRD")}
---`;

  let content = SPELL_TEMPLATE
    .replace(/^---\n[\s\S]*?\n---/, frontmatter)
    .replace(/^# Spell$/m, `# ${spell.name || "Spell"}`);

  content = content.replace(
    /## Description\n[\s\S]*?\n## At Higher Levels/m,
    `## Description\n${description}\n\n## At Higher Levels`
  );

  content = content.replace(
    /## At Higher Levels\n[\s\S]*$/m,
    `## At Higher Levels\n${higherLevel}\n\n## Classes\n${classes}`
  );

  return content;
}
