import { SPELL_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";

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

  let content = updateYamlFrontmatter(SPELL_TEMPLATE, (fm) => ({
    ...fm,
    type: "spell",
    template_version: templateVersion,
    name: spell.name || "Spell",
    level: typeof spell.level === "number" ? spell.level : 1,
    school: spell.school?.name || "",
    casting_time: spell.casting_time || "1 action",
    range: spell.range || "",
    components,
    duration: spell.duration || "",
    concentration: Boolean(spell.concentration),
    ritual: Boolean(spell.ritual),
    classes,
    source: spell.source || "SRD",
  }))
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
