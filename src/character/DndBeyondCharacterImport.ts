import { requestUrl, TFile, TFolder, type App } from "obsidian";

export interface StatblockEntry {
  name: string;
  desc: string;
}

export interface DndBeyondPcImportData {
  characterId: string;
  name: string;
  playerName: string;
  classes: string[];
  level: string;
  hpCurrent: string;
  hpMax: string;
  ac?: string;
  initBonus: string;
  speed: string;
  readonlyUrl: string;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  senses: string;
  languages: string;
  skillsaves: Array<Record<string, string>>;
  traits: StatblockEntry[];
  actions: StatblockEntry[];
  bonusActions: StatblockEntry[];
  reactions: StatblockEntry[];
  spells: string[];
}

type LinkKind = "spell" | "feat" | "skill" | "feature" | "trait" | "class" | "race";

type LinkResolver = (name: string, kinds: LinkKind[]) => string;

interface ImportOptions {
  linkResolver?: LinkResolver;
}

interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

interface ImportContext {
  abilities: AbilityScores;
  totalLevel: number;
  scaleValue?: number;
}

const ABILITY_NAMES: Record<number, string> = {
  1: "Strength",
  2: "Dexterity",
  3: "Constitution",
  4: "Intelligence",
  5: "Wisdom",
  6: "Charisma",
};

interface DndBeyondResponse {
  success?: boolean;
  data?: any;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function parseCharacterId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.match(/^\d+$/);
  if (digitsOnly) return digitsOnly[0] ?? null;

  const endpointMatch = trimmed.match(/character\/v\d+\/character\/(\d+)/i);
  if (endpointMatch?.[1]) return endpointMatch[1];

  const urlMatch = trimmed.match(/\/characters\/(\d+)/i);
  if (urlMatch?.[1]) return urlMatch[1];

  return null;
}

function buildReadonlyUrl(characterId: string, fallback?: string): string {
  if (fallback && fallback.trim().length > 0) return fallback;
  return `https://www.dndbeyond.com/characters/${characterId}`;
}

function resolveAbilityScore(data: any, statId: number): number {
  const base = asNumber(data?.stats?.find((s: any) => asNumber(s?.id) === statId)?.value);
  const bonus = asNumber(data?.bonusStats?.find((s: any) => asNumber(s?.id) === statId)?.value);
  const overrideRaw = data?.overrideStats?.find((s: any) => asNumber(s?.id) === statId)?.value;
  const override = asNumber(overrideRaw);

  if (override > 0) return override;
  return base + bonus;
}

function resolveArmorClass(data: any): string | undefined {
  // Try direct AC fields (legacy API)
  const directCandidates = [
    data?.armorClass,
    data?.baseArmorClass,
    data?.currentArmorClass,
    data?.overrideArmorClass,
  ];

  for (const candidate of directCandidates) {
    const ac = asNumber(candidate);
    if (ac > 0) return String(ac);
  }

  // 2024+ API: compute AC from equipped armor + DEX + modifiers
  const dexMod = abilityModifier(resolveAbilityScore(data, 2) || 10);
  let baseAc = 10 + dexMod; // unarmored default

  const inventory = Array.isArray(data?.inventory) ? data.inventory : [];
  for (const item of inventory) {
    if (!item?.equipped) continue;
    const def = item?.definition;
    if (!def) continue;
    const filterType = String(def.filterType || "").toLowerCase();
    if (filterType !== "armor") continue;
    const armorTypeId = asNumber(def.armorTypeId);
    const armorAc = asNumber(def.armorClass);
    if (armorAc <= 0) continue;

    if (armorTypeId === 1) {
      // Light armor: AC + full DEX
      baseAc = armorAc + dexMod;
    } else if (armorTypeId === 2) {
      // Medium armor: AC + DEX (max 2)
      baseAc = armorAc + Math.min(dexMod, 2);
    } else if (armorTypeId === 3) {
      // Heavy armor: AC only
      baseAc = armorAc;
    }
  }

  // Add shield bonus
  for (const item of inventory) {
    if (!item?.equipped) continue;
    const def = item?.definition;
    if (!def) continue;
    const filterType = String(def.filterType || "").toLowerCase();
    if (filterType !== "armor") continue;
    const armorTypeId = asNumber(def.armorTypeId);
    if (armorTypeId === 4) {
      // Shield
      baseAc += asNumber(def.armorClass) || 2;
    }
  }

  // Add AC bonuses from modifiers (magic items, feats, etc.)
  const modifiers = collectModifiers(data);
  for (const mod of modifiers) {
    const type = String(mod?.type || "").toLowerCase();
    const subType = String(mod?.subType || "").toLowerCase();
    if (type === "bonus" && subType === "armor-class") {
      baseAc += asNumber(mod.value);
    }
  }

  return String(baseAc);
}

function resolveWalkSpeed(data: any): string {
  const walk =
    asNumber(data?.race?.weightSpeeds?.normal?.walk) ||
    asNumber(data?.race?.weightSpeeds?.encumbered?.walk) ||
    asNumber(data?.race?.weightSpeeds?.heavilyEncumbered?.walk);

  return String(walk > 0 ? walk : 30);
}

function stripHtml(value: string): string {
  const withStructure = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-");

  const normalized = withStructure
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
  return value.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function stripMdExtension(path: string): string {
  return path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
}

function escapeWikiAlias(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function defaultLinkResolver(name: string): string {
  return name;
}

function withResolvedLink(name: string, kinds: LinkKind[], resolver?: LinkResolver): string {
  const normalized = name.trim();
  if (!normalized) return "";
  return (resolver || defaultLinkResolver)(normalized, kinds);
}

export function createVaultSrdLinkResolver(app: App): LinkResolver {
  const kindToFolders: Record<LinkKind, string[]> = {
    spell: ["z_Spells"],
    feat: ["z_Features", "z_Traits"],
    skill: ["z_Skills"],
    feature: ["z_Features", "z_Traits"],
    trait: ["z_Traits", "z_Features"],
    class: ["z_Classes", "z_Subclasses"],
    race: ["z_Races", "z_Subraces"],
  };

  const folderIndexes = new Map<string, Map<string, string>>();

  const normalizeKey = (value: string): string => slugify(value).replace(/-/g, "");

  const getFolderIndex = (folderPath: string): Map<string, string> => {
    const cached = folderIndexes.get(folderPath);
    if (cached) return cached;

    const index = new Map<string, string>();
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (folder && folder instanceof TFolder) {
      for (const child of folder.children) {
        if (!(child instanceof TFile)) continue;
        const childPath = child.path;
        const childName = child.basename;
        if (!childPath.toLowerCase().endsWith(".md")) continue;
        const key = normalizeKey(childName);
        if (key) index.set(key, stripMdExtension(childPath));
      }
    }

    folderIndexes.set(folderPath, index);
    return index;
  };

  return (name: string, kinds: LinkKind[]): string => {
    const key = normalizeKey(name);
    if (!key) return name;

    const candidateFolders = new Set<string>();
    for (const kind of kinds) {
      for (const folder of kindToFolders[kind] || []) {
        candidateFolders.add(folder);
      }
    }

    for (const folder of candidateFolders) {
      const index = getFolderIndex(folder);
      const matchPath = index.get(key);
      if (matchPath) {
        return `[[${matchPath}|${escapeWikiAlias(name)}]]`;
      }
    }

    return name;
  };
}

function resolveTemplateToken(tokenRaw: string, ctx: ImportContext): string {
  const token = tokenRaw.trim().toLowerCase();

  const modMatch = token.match(/^modifier:(str|dex|con|int|wis|cha)(?:@min:(-?\d+))?(#unsigned)?$/);
  if (modMatch) {
    const ability = modMatch[1] as keyof AbilityScores;
    const minValue = modMatch[2] !== undefined ? asNumber(modMatch[2]) : null;
    const unsigned = !!modMatch[3];
    let value = abilityModifier(ctx.abilities[ability] || 10);
    if (minValue !== null) value = Math.max(value, minValue);
    if (unsigned) return String(Math.max(0, value));
    return String(value);
  }

  if (token === "classlevel") {
    return String(Math.max(1, ctx.totalLevel));
  }

  const classLevelMath = token.match(/^\(?classlevel\s*([\/+\-*])\s*(\d+)\)?(?:@rounddown)?$/);
  if (classLevelMath) {
    const op = classLevelMath[1];
    const num = Math.max(1, asNumber(classLevelMath[2]));
    let value = ctx.totalLevel;
    if (op === "/") value = Math.floor(value / num);
    if (op === "*") value = value * num;
    if (op === "+") value = value + num;
    if (op === "-") value = value - num;
    return String(Math.max(0, value));
  }

  if (token === "scalevalue" && ctx.scaleValue !== undefined) {
    return String(ctx.scaleValue);
  }

  return "";
}

function resolveDdbTemplateExpressions(value: string, ctx: ImportContext): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_match, token) => resolveTemplateToken(String(token), ctx));
}

function resolveDescription(item: any, ctx: ImportContext): string {
  const raw = String(item?.definition?.description || item?.definition?.snippet || item?.snippet || "").trim();
  if (!raw) return "No description provided.";
  return stripHtml(resolveDdbTemplateExpressions(raw, ctx));
}

function summarizeDescription(value: string, maxLen: number = 320): string {
  const text = stripHtml(value);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}...`;
}

function shouldSkipNonStatblockTrait(name: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return true;
  const blocked = new Set([
    "age",
    "alignment",
    "size",
    "speed",
    "languages",
    "language",
    "darkvision",
    "creature type",
    "ability score increase",
    "ability score increases",
  ]);
  if (blocked.has(key)) return true;
  if (/^core\s+.+\s+traits$/i.test(name)) return true;
  if (/^spellcasting$/i.test(name)) return true;
  return false;
}

function getScaleValue(feature: any): number | undefined {
  const scale = feature?.levelScale;
  const direct = asNumber(scale?.fixedValue ?? scale?.value);
  if (direct > 0) return direct;

  const uses = asNumber(feature?.definition?.limitedUse?.[0]?.uses);
  if (uses > 0) return uses;

  return undefined;
}

function collectModifiers(data: any): any[] {
  return [
    ...(Array.isArray(data?.modifiers?.race) ? data.modifiers.race : []),
    ...(Array.isArray(data?.modifiers?.class) ? data.modifiers.class : []),
    ...(Array.isArray(data?.modifiers?.background) ? data.modifiers.background : []),
    ...(Array.isArray(data?.modifiers?.feat) ? data.modifiers.feat : []),
    ...(Array.isArray(data?.modifiers?.item) ? data.modifiers.item : []),
    ...(Array.isArray(data?.modifiers?.condition) ? data.modifiers.condition : []),
  ];
}

function collectLanguages(data: any): string {
  const modifiers = collectModifiers(data);
  const names = new Set<string>();
  for (const mod of modifiers) {
    const type = String(mod?.type || "").toLowerCase();
    if (type !== "language") continue;
    const name = String(mod?.friendlySubtypeName || mod?.subType || "").trim();
    if (name) names.add(name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b)).join(", ");
}

function collectSenses(data: any): string {
  const modifiers = collectModifiers(data);
  const parts = new Set<string>();
  for (const mod of modifiers) {
    const subType = String(mod?.subType || "").toLowerCase();
    const type = String(mod?.type || "").toLowerCase();
    if (!subType.includes("vision") && !subType.includes("darkvision") && type !== "set-base") continue;
    const name = String(mod?.friendlySubtypeName || mod?.subType || "").replace(/-/g, " ").trim();
    const distance = asNumber(mod?.value);
    if (!name) continue;
    parts.add(distance > 0 ? `${name} ${distance} ft.` : name);
  }

  if (asNumber(data?.passivePerception) > 0) {
    parts.add(`passive Perception ${asNumber(data.passivePerception)}`);
  }

  return Array.from(parts).join(", ");
}

function getTotalLevel(data: any): number {
  return Array.isArray(data?.classes)
    ? data.classes.reduce((sum: number, c: any) => sum + asNumber(c?.level), 0)
    : 0;
}

function getProficiencyBonus(level: number): number {
  return Math.max(2, Math.ceil(Math.max(level, 1) / 4) + 1);
}

function collectSkillSaves(data: any, abilities: AbilityScores, totalLevel: number): Array<Record<string, string>> {
  const skillAbilities: Record<string, number> = {
    athletics: 0,
    acrobatics: 1,
    sleightofhand: 1,
    stealth: 1,
    arcana: 3,
    history: 3,
    investigation: 3,
    nature: 3,
    religion: 3,
    animalhandling: 4,
    insight: 4,
    medicine: 4,
    perception: 4,
    survival: 4,
    deception: 5,
    intimidation: 5,
    performance: 5,
    persuasion: 5,
  };

  const statByIndex = [abilities.str, abilities.dex, abilities.con, abilities.int, abilities.wis, abilities.cha];
  const proficiencyBonus = getProficiencyBonus(totalLevel);
  const modifiers = collectModifiers(data);
  const results: Array<Record<string, string>> = [];

  for (const mod of modifiers) {
    if (String(mod?.type || "").toLowerCase() !== "proficiency") continue;
    const subType = String(mod?.subType || "").toLowerCase().replace(/-/g, "");
    const abilityIndex = skillAbilities[subType];
    if (abilityIndex === undefined) continue;
    const abilityMod = abilityModifier(statByIndex[abilityIndex] || 10);
    const total = abilityMod + proficiencyBonus;
    results.push({ [subType]: String(total) });
  }

  const dedup = new Map<string, string>();
  for (const entry of results) {
    const key = Object.keys(entry)[0];
    if (!key) continue;
    dedup.set(key, entry[key] || "0");
  }

  return Array.from(dedup.entries()).map(([key, value]) => ({ [key]: value }));
}

function collectScopedSkillTraits(data: any, abilities: AbilityScores, totalLevel: number): StatblockEntry[] {
  const proficiencyBonus = getProficiencyBonus(totalLevel);
  const skillAbilities: Record<string, number> = {
    athletics: 0,
    acrobatics: 1,
    sleightofhand: 1,
    stealth: 1,
    arcana: 3,
    history: 3,
    investigation: 3,
    nature: 3,
    religion: 3,
    animalhandling: 4,
    insight: 4,
    medicine: 4,
    perception: 4,
    survival: 4,
    deception: 5,
    intimidation: 5,
    performance: 5,
    persuasion: 5,
  };

  const scores = [abilities.str, abilities.dex, abilities.con, abilities.int, abilities.wis, abilities.cha];
  const buckets: Array<{ name: string; list: any[] }> = [
    { name: "Class Skills", list: Array.isArray(data?.modifiers?.class) ? data.modifiers.class : [] },
    { name: "Species Skills", list: Array.isArray(data?.modifiers?.race) ? data.modifiers.race : [] },
  ];

  const out: StatblockEntry[] = [];
  for (const bucket of buckets) {
    const items: string[] = [];
    for (const mod of bucket.list) {
      if (String(mod?.type || "").toLowerCase() !== "proficiency") continue;
      const key = String(mod?.subType || "").toLowerCase().replace(/-/g, "");
      const abilityIndex = skillAbilities[key];
      if (abilityIndex === undefined) continue;
      const display = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
      const bonus = abilityModifier(scores[abilityIndex] || 10) + proficiencyBonus;
      const signed = bonus >= 0 ? `+${bonus}` : String(bonus);
      items.push(`${display} ${signed}`);
    }
    if (items.length > 0) {
      const unique = Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
      out.push({ name: bucket.name, desc: unique.join(", ") });
    }
  }

  return out;
}

function ordinal(num: number): string {
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod10 === 1 && mod100 !== 11) return `${num}st`;
  if (mod10 === 2 && mod100 !== 12) return `${num}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${num}rd`;
  return `${num}th`;
}

function collectSpellLines(data: any, abilities: AbilityScores, totalLevel: number): string[] {
  const classSpells = Array.isArray(data?.classSpells) ? data.classSpells : [];
  const allSpells: any[] = classSpells.flatMap((c: any) => Array.isArray(c?.spells) ? c.spells : []);
  if (allSpells.length === 0) return [];

  const casterClass = Array.isArray(data?.classes) && data.classes.length > 0 ? data.classes[0] : null;
  const spellcastingAbilityId = asNumber(casterClass?.definition?.spellCastingAbilityId);
  const abilityName = ABILITY_NAMES[spellcastingAbilityId] || "Wisdom";
  const abilityScore = spellcastingAbilityId > 0
    ? resolveAbilityScore(data, spellcastingAbilityId)
    : abilities.wis;
  const abilityMod = abilityModifier(abilityScore || 10);
  const proficiencyBonus = getProficiencyBonus(totalLevel);
  const spellSaveDc = 8 + proficiencyBonus + abilityMod;
  const spellAttack = abilityMod + proficiencyBonus;
  const spellAttackText = spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack);

  const header = `The character is a ${ordinal(Math.max(totalLevel, 1))}-level spellcaster. Spellcasting ability is ${abilityName} (spell save DC ${spellSaveDc}, ${spellAttackText} to hit with spell attacks).`;

  const grouped = new Map<number, Set<string>>();
  for (const spell of allSpells) {
    const name = String(spell?.definition?.name || "").trim();
    if (!name) continue;

    const isPrepared = !!spell?.prepared || !!spell?.alwaysPrepared || !!spell?.countsAsKnownSpell;
    if (!isPrepared) continue;

    const level = asNumber(spell?.definition?.level);
    if (!grouped.has(level)) grouped.set(level, new Set<string>());
    grouped.get(level)!.add(name);
  }

  const lines: string[] = [header];

  const cantrips = grouped.get(0);
  if (cantrips && cantrips.size > 0) {
    lines.push(`Cantrips (at will): ${Array.from(cantrips).sort((a, b) => a.localeCompare(b)).join(", ")}`);
  }

  const slotMap = new Map<number, number>();
  const slots = Array.isArray(data?.spellSlots) ? data.spellSlots : [];
  for (const slot of slots) {
    const level = asNumber(slot?.level);
    const available = asNumber(slot?.available);
    const used = asNumber(slot?.used);
    const total = available + used;
    if (level > 0 && total > 0) slotMap.set(level, total);
  }

  for (let level = 1; level <= 9; level++) {
    const names = grouped.get(level);
    if (!names || names.size === 0) continue;
    const slotText = slotMap.has(level) ? ` (${slotMap.get(level)} slots)` : "";
    lines.push(`${level}${level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th"} level${slotText}: ${Array.from(names).sort((a, b) => a.localeCompare(b)).join(", ")}`);
  }

  return lines;
}

function linkSpellDisplayLines(lines: string[], resolver?: LinkResolver): string[] {
  return lines.map((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) return line;

    const prefix = line.slice(0, colonIndex + 1);
    const body = line.slice(colonIndex + 1).trim();
    if (!body) return line;

    const linked = body
      .split(",")
      .map((part) => {
        const name = part.trim();
        if (!name) return part;
        return withResolvedLink(name, ["spell"], resolver);
      })
      .join(", ");

    return `${prefix} ${linked}`.trim();
  });
}

function collectFeatTraits(data: any, ctx: ImportContext, resolver?: LinkResolver): StatblockEntry[] {
  const feats = Array.isArray(data?.feats) ? data.feats : [];
  const out: StatblockEntry[] = [];
  for (const feat of feats) {
    const name = String(feat?.definition?.name || feat?.name || "").trim();
    if (!name) continue;
    out.push({
      name,
      desc: `${withResolvedLink(name, ["feat", "feature", "trait"], resolver)}: ${resolveDescription(feat, ctx)}`,
    });
  }
  return out;
}

function collectOptionTraits(data: any, ctx: ImportContext, resolver?: LinkResolver): StatblockEntry[] {
  const options = Array.isArray(data?.options?.class) ? data.options.class : [];
  const out: StatblockEntry[] = [];
  for (const opt of options) {
    const name = String(opt?.definition?.name || "").trim();
    if (!name) continue;
    const requiredLevel = asNumber(opt?.definition?.requiredLevel);
    if (requiredLevel > 0 && requiredLevel > ctx.totalLevel) continue;
    const desc = resolveDescription(opt, ctx);
    out.push({ name, desc: `${withResolvedLink(name, ["feature", "trait", "class"], resolver)}: ${desc}` });
  }
  return out;
}

function collectClassAndSpeciesTraits(data: any, ctx: ImportContext, resolver?: LinkResolver): { classTraits: StatblockEntry[]; speciesTraits: StatblockEntry[] } {
  const classTraits: StatblockEntry[] = [];
  const speciesTraits: StatblockEntry[] = [];
  const seenClass = new Set<string>();
  const seenSpecies = new Set<string>();

  const pushTrait = (nameRaw: string, descRaw: string, bucket: "class" | "species") => {
    const name = nameRaw.trim();
    if (!name) return;
    if (shouldSkipNonStatblockTrait(name)) return;
    const seen = bucket === "class" ? seenClass : seenSpecies;
    if (seen.has(name.toLowerCase())) return;

    const desc = summarizeDescription(resolveDdbTemplateExpressions(descRaw || "", ctx));
    if (!desc) return;

    const kinds: LinkKind[] = bucket === "class" ? ["feature", "class", "trait"] : ["trait", "race", "feature"];
    const trait = {
      name,
      desc: `${withResolvedLink(name, kinds, resolver)}: ${desc}`,
    };
    if (bucket === "class") classTraits.push(trait);
    else speciesTraits.push(trait);
    seen.add(name.toLowerCase());
  };

  const classes = Array.isArray(data?.classes) ? data.classes : [];
  for (const cls of classes) {
    const classFeatures = Array.isArray(cls?.classFeatures) ? cls.classFeatures : [];
    const classLevel = asNumber(cls?.level);
    for (const feature of classFeatures) {
      const def = feature?.definition;
      if (!def) continue;
      if (def.hideInSheet === true) continue;
      const requiredLevel = asNumber(def.requiredLevel);
      if (requiredLevel > 0 && requiredLevel > classLevel) continue;
      const name = String(def.name || "");
      const desc = String(def.snippet || def.description || "");
      const localCtx: ImportContext = { ...ctx, scaleValue: getScaleValue(feature) };
      pushTrait(name, resolveDdbTemplateExpressions(desc, localCtx), "class");
    }

    const subclassDef = cls?.subclassDefinition;
    if (subclassDef) {
      const subName = String(subclassDef?.name || "").trim();
      const subDesc = String(subclassDef?.description || subclassDef?.snippet || "");
      if (subName && subDesc) {
        pushTrait(subName, subDesc, "class");
      }
    }
  }

  const racialTraits = Array.isArray(data?.race?.racialTraits) ? data.race.racialTraits : [];
  for (const trait of racialTraits) {
    const def = trait?.definition;
    if (!def) continue;
    const requiredLevel = asNumber(def.requiredLevel);
    if (requiredLevel > 0 && requiredLevel > ctx.totalLevel) continue;
    const name = String(def.name || "");
    const desc = String(def.snippet || def.description || "");
    const localCtx: ImportContext = { ...ctx, scaleValue: getScaleValue(trait) };
    pushTrait(name, resolveDdbTemplateExpressions(desc, localCtx), "species");
  }

  return { classTraits, speciesTraits };
}

function collectFeatureActionEntries(data: any, ctx: ImportContext, resolver?: LinkResolver): { actions: StatblockEntry[]; bonusActions: StatblockEntry[]; reactions: StatblockEntry[] } {
  const actions: StatblockEntry[] = [];
  const bonusActions: StatblockEntry[] = [];
  const reactions: StatblockEntry[] = [];
  const seen = new Set<string>();

  const addFromDef = (feature: any, currentLevel: number) => {
    const def = feature?.definition;
    if (!def) return;
    if (def.hideInSheet === true) return;
    const requiredLevel = asNumber(def.requiredLevel);
    if (requiredLevel > 0 && requiredLevel > currentLevel) return;

    const name = String(def.name || "").trim();
    if (!name) return;

    const activationType = asNumber(def?.activation?.activationType);
    if (activationType !== 1 && activationType !== 3 && activationType !== 4) return;

    const localCtx: ImportContext = { ...ctx, scaleValue: getScaleValue(feature) };
    const desc = summarizeDescription(resolveDdbTemplateExpressions(String(def.snippet || def.description || ""), localCtx));
    if (!desc) return;

    const key = `${name.toLowerCase()}::${activationType}`;
    if (seen.has(key)) return;
    seen.add(key);

    const item: StatblockEntry = { name: withResolvedLink(name, ["feature", "trait", "class", "race"], resolver), desc };
    if (activationType === 3) bonusActions.push(item);
    else if (activationType === 4) reactions.push(item);
    else actions.push(item);
  };

  const classes = Array.isArray(data?.classes) ? data.classes : [];
  for (const cls of classes) {
    const currentLevel = asNumber(cls?.level);
    const classFeatures = Array.isArray(cls?.classFeatures) ? cls.classFeatures : [];
    for (const feature of classFeatures) {
      addFromDef(feature, currentLevel);
    }
  }

  const racialTraits = Array.isArray(data?.race?.racialTraits) ? data.race.racialTraits : [];
  for (const trait of racialTraits) {
    addFromDef(trait, ctx.totalLevel);
  }

  return { actions, bonusActions, reactions };
}

function mergeUniqueEntries(...groups: StatblockEntry[][]): StatblockEntry[] {
  const out: StatblockEntry[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const entry of group) {
      const key = stripLinkMarkup(entry.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

function stripLinkMarkup(value: string): string {
  return value
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

function isWeaponProficient(weapon: any, modifiers: any[]): boolean {
  const weaponName = String(weapon?.definition?.name || "").toLowerCase();
  const categoryId = asNumber(weapon?.definition?.categoryId);

  for (const mod of modifiers) {
    if (String(mod?.type || "").toLowerCase() !== "proficiency") continue;
    const subType = String(mod?.subType || "").toLowerCase();
    const friendly = String(mod?.friendlySubtypeName || "").toLowerCase();
    if (!subType && !friendly) continue;

    if (subType.includes(weaponName) || friendly.includes(weaponName)) return true;
    if (categoryId === 1 && (subType.includes("simple-weapons") || friendly.includes("simple weapons"))) return true;
    if (categoryId === 2 && (subType.includes("martial-weapons") || friendly.includes("martial weapons"))) return true;
  }

  return false;
}

function collectWeaponActions(data: any, abilities: AbilityScores, proficiencyBonus: number): StatblockEntry[] {
  const inventory = Array.isArray(data?.inventory) ? data.inventory : [];
  const modifiers = collectModifiers(data);

  const weapons = inventory.filter((item: any) => String(item?.definition?.filterType || "").toLowerCase() === "weapon");
  if (weapons.length === 0) return [];

  const out: StatblockEntry[] = [];

  for (const weapon of weapons) {
    const name = String(weapon?.definition?.name || "").trim();
    if (!name) continue;

    const properties = Array.isArray(weapon?.definition?.properties)
      ? weapon.definition.properties.map((p: any) => String(p?.name || "").toLowerCase())
      : [];

    const isRanged = asNumber(weapon?.definition?.attackType) === 2;
    const isFinesse = properties.includes("finesse");
    const attackAbility = isRanged ? abilities.dex : (isFinesse ? Math.max(abilities.str, abilities.dex) : abilities.str);
    const attackMod = abilityModifier(attackAbility || 10);
    const proficient = isWeaponProficient(weapon, modifiers);
    const toHit = attackMod + (proficient ? proficiencyBonus : 0);

    const dice = String(weapon?.definition?.damage?.diceString || "1").trim();
    const dmgType = String(weapon?.definition?.damageType || "bludgeoning").toLowerCase();
    const damageValue = attackMod;
    const signedDamage = damageValue >= 0 ? `+ ${damageValue}` : `- ${Math.abs(damageValue)}`;

    const range = asNumber(weapon?.definition?.range);
    const longRange = asNumber(weapon?.definition?.longRange);
    const rangeText = isRanged
      ? `${range > 0 ? range : 20}/${longRange > 0 ? longRange : 60} ft.`
      : `${range > 0 ? range : 5} ft.`;

    const prefix = isRanged ? "Ranged Weapon Attack" : "Melee Weapon Attack";
    const signedHit = toHit >= 0 ? `+${toHit}` : String(toHit);
    const propertiesText = properties.length > 0 ? ` Properties: ${properties.join(", ")}.` : "";
    const desc = `${prefix}: ${signedHit} to hit, range ${rangeText}, one target. Hit: ${dice} ${signedDamage} ${dmgType} damage.${propertiesText}`;

    out.push({ name, desc });
  }

  return out;
}

function collectActionEntries(data: any, ctx: ImportContext): { actions: StatblockEntry[]; bonusActions: StatblockEntry[]; reactions: StatblockEntry[] } {
  // data.actions can be an array (legacy) or an object keyed by source (2024+)
  let rawActions: any[];
  if (Array.isArray(data?.actions)) {
    rawActions = data.actions;
  } else if (data?.actions && typeof data.actions === "object") {
    rawActions = Object.values(data.actions).flat();
  } else {
    rawActions = [];
  }

  const items = [
    ...rawActions,
    ...(Array.isArray(data?.customActions) ? data.customActions : []),
  ];

  const actions: StatblockEntry[] = [];
  const bonusActions: StatblockEntry[] = [];
  const reactions: StatblockEntry[] = [];

  for (const item of items) {
    const name = String(item?.definition?.name || item?.name || "").trim();
    if (!name) continue;
    const desc = resolveDescription(item, ctx);
    const activationType = asNumber(item?.definition?.activation?.activationType ?? item?.activation?.activationType);
    if (activationType === 3) {
      bonusActions.push({ name, desc });
    } else if (activationType === 4) {
      reactions.push({ name, desc });
    } else {
      actions.push({ name, desc });
    }
  }

  return { actions, bonusActions, reactions };
}

function collectSpellAttackActions(
  data: any,
  abilities: AbilityScores,
  totalLevel: number,
  resolver?: LinkResolver,
): StatblockEntry[] {
  const classSpells = Array.isArray(data?.classSpells) ? data.classSpells : [];
  const allSpells: any[] = classSpells.flatMap((c: any) => (Array.isArray(c?.spells) ? c.spells : []));
  if (allSpells.length === 0) return [];

  const casterClass = Array.isArray(data?.classes) && data.classes.length > 0 ? data.classes[0] : null;
  const spellcastingAbilityId = asNumber(casterClass?.definition?.spellCastingAbilityId);
  const abilityScore = spellcastingAbilityId > 0
    ? resolveAbilityScore(data, spellcastingAbilityId)
    : abilities.wis;
  const abilityMod = abilityModifier(abilityScore || 10);
  const proficiencyBonus = getProficiencyBonus(totalLevel);
  const spellAttack = abilityMod + proficiencyBonus;
  const spellSaveDc = 8 + proficiencyBonus + abilityMod;
  const signedAttack = spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack);

  const out: StatblockEntry[] = [];
  const seen = new Set<string>();

  for (const spell of allSpells) {
    const def = spell?.definition;
    if (!def) continue;

    const isPrepared = !!spell?.prepared || !!spell?.alwaysPrepared || !!spell?.countsAsKnownSpell;
    if (!isPrepared) continue;

    const level = asNumber(def.level);
    const isCantrip = level === 0;
    const requiresSavingThrow = !!def.requiresSavingThrow;
    const requiresAttackRoll = !!def.requiresAttackRoll;
    if (!requiresAttackRoll && !requiresSavingThrow) continue;

    const name = String(def.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rangeValue = asNumber(def.range?.rangeValue);
    const rangeUnit = rangeValue > 0 ? `${rangeValue} ft.` : "Self";
    const school = String(def.school || "").trim();
    const tags: string[] = [];
    if (isCantrip) tags.push("cantrip");
    else tags.push(`${ordinal(level)}-level`);
    if (school) tags.push(school.toLowerCase());

    const damageParts: string[] = [];
    if (def.damage?.diceString) {
      const dmgType = String(def.damage?.damageType || "").toLowerCase();
      damageParts.push(`${def.damage.diceString}${dmgType ? ` ${dmgType}` : ""}`);
    }

    let hitText: string;
    if (requiresAttackRoll) {
      hitText = `Spell Attack: ${signedAttack} to hit, range ${rangeUnit}`;
    } else {
      const saveType = String(def.saveDcAbilityId ? ABILITY_NAMES[asNumber(def.saveDcAbilityId)] || "" : "").substring(0, 3).toUpperCase();
      hitText = `DC ${spellSaveDc}${saveType ? ` ${saveType}` : ""} save, range ${rangeUnit}`;
    }

    const damageText = damageParts.length > 0 ? ` Hit: ${damageParts.join(" + ")} damage.` : "";
    const tagText = tags.length > 0 ? ` (${tags.join(", ")})` : "";
    const linkedName = withResolvedLink(name, ["spell"], resolver);
    const desc = `${hitText}, one target.${damageText}${tagText}`;

    out.push({ name: linkedName, desc });
  }

  return out;
}

function deduplicateTraits(traits: StatblockEntry[], actionNames: Set<string>): StatblockEntry[] {
  const out: StatblockEntry[] = [];
  const seen = new Set<string>();
  for (const trait of traits) {
    const plainName = stripLinkMarkup(trait.name).toLowerCase();
    if (seen.has(plainName)) continue;
    if (actionNames.has(plainName)) continue;
    seen.add(plainName);
    out.push(trait);
  }
  return out;
}

function groupWithDividers(
  groups: Array<{ label: string; items: StatblockEntry[] }>,
  actionNames: Set<string>,
): StatblockEntry[] {
  const out: StatblockEntry[] = [];
  const globalSeen = new Set<string>();
  let first = true;

  for (const group of groups) {
    const filtered: StatblockEntry[] = [];
    for (const item of group.items) {
      const key = stripLinkMarkup(item.name).toLowerCase();
      if (globalSeen.has(key)) continue;
      if (actionNames.has(key)) continue;
      globalSeen.add(key);
      filtered.push(item);
    }
    if (filtered.length === 0) continue;

    if (!first) {
      out.push({ name: "___", desc: "" });
    }
    out.push({ name: `***${group.label}***`, desc: "" });
    out.push(...filtered);
    first = false;
  }

  return out;
}

function groupActionsByKind(
  weapons: StatblockEntry[],
  spellAttacks: StatblockEntry[],
  featureActions: StatblockEntry[],
  otherActions: StatblockEntry[],
): StatblockEntry[] {
  const groups: Array<{ label: string; items: StatblockEntry[] }> = [
    { label: "Weapon Attacks", items: weapons },
    { label: "Spell Attacks", items: spellAttacks },
    { label: "Feature Actions", items: featureActions },
    { label: "Other", items: otherActions },
  ];

  const out: StatblockEntry[] = [];
  const seen = new Set<string>();
  let first = true;

  for (const group of groups) {
    const filtered: StatblockEntry[] = [];
    for (const item of group.items) {
      const key = stripLinkMarkup(item.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(item);
    }
    if (filtered.length === 0) continue;

    if (!first) {
      out.push({ name: "___", desc: "" });
    }
    out.push({ name: `***${group.label}***`, desc: "" });
    out.push(...filtered);
    first = false;
  }

  return out;
}

export async function importFromDndBeyond(source: string, options?: ImportOptions): Promise<DndBeyondPcImportData> {
  const characterId = parseCharacterId(source);
  if (!characterId) {
    throw new Error("Could not parse D&D Beyond character ID from input.");
  }

  const url = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
  const response = await requestUrl({
    url,
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`D&D Beyond API returned HTTP ${response.status}`);
  }

  const body = (response.json ?? {}) as DndBeyondResponse;
  if (!body.success || !body.data) {
    throw new Error("D&D Beyond API returned an invalid character payload.");
  }

  const data = body.data;

  // ── Diagnostic: dump API response structure ──
  const diagKeys = (obj: any, label: string) => {
    if (!obj || typeof obj !== "object") {
      console.log(`[DDB Import] ${label}: ${obj === null ? "null" : typeof obj}`);
      return;
    }
    if (Array.isArray(obj)) {
      console.log(`[DDB Import] ${label}: Array(${obj.length})`);
      if (obj.length > 0) console.log(`[DDB Import]   ${label}[0] keys:`, Object.keys(obj[0]).join(", "));
    } else {
      console.log(`[DDB Import] ${label}: {${Object.keys(obj).join(", ")}}`);
    }
  };
  console.log("[DDB Import] ── Raw API response diagnostics ──");
  console.log("[DDB Import] Top-level keys:", Object.keys(data).join(", "));
  diagKeys(data.stats, "data.stats");
  diagKeys(data.bonusStats, "data.bonusStats");
  diagKeys(data.overrideStats, "data.overrideStats");
  diagKeys(data.classes, "data.classes");
  if (Array.isArray(data.classes) && data.classes.length > 0) {
    const cls0 = data.classes[0];
    console.log("[DDB Import]   classes[0] keys:", Object.keys(cls0).join(", "));
    diagKeys(cls0.classFeatures, "  classes[0].classFeatures");
    diagKeys(cls0.definition, "  classes[0].definition");
  }
  diagKeys(data.race, "data.race");
  if (data.race) {
    diagKeys(data.race.racialTraits, "  race.racialTraits");
    diagKeys(data.race.weightSpeeds, "  race.weightSpeeds");
  }
  diagKeys(data.modifiers, "data.modifiers");
  if (data.modifiers && typeof data.modifiers === "object" && !Array.isArray(data.modifiers)) {
    for (const key of Object.keys(data.modifiers)) {
      diagKeys(data.modifiers[key], `  modifiers.${key}`);
    }
  }
  diagKeys(data.inventory, "data.inventory");
  diagKeys(data.classSpells, "data.classSpells");
  if (Array.isArray(data.classSpells) && data.classSpells.length > 0) {
    diagKeys(data.classSpells[0].spells, "  classSpells[0].spells");
  }
  diagKeys(data.actions, "data.actions");
  diagKeys(data.customActions, "data.customActions");
  diagKeys(data.feats, "data.feats");
  diagKeys(data.options, "data.options");
  if (data.options) diagKeys(data.options.class, "  options.class");
  diagKeys(data.spellSlots, "data.spellSlots");
  console.log("[DDB Import] data.name:", data.name);
  console.log("[DDB Import] data.baseHitPoints:", data.baseHitPoints);
  console.log("[DDB Import] data.bonusHitPoints:", data.bonusHitPoints);
  console.log("[DDB Import] data.removedHitPoints:", data.removedHitPoints);
  console.log("[DDB Import] data.overrideHitPoints:", data.overrideHitPoints);
  console.log("[DDB Import] data.armorClass:", data.armorClass);
  console.log("[DDB Import] data.baseArmorClass:", data.baseArmorClass);
  console.log("[DDB Import] data.currentArmorClass:", data.currentArmorClass);
  console.log("[DDB Import] ── End diagnostics ──");

  const classes = Array.isArray(data.classes)
    ? data.classes
        .map((c: any) => c?.definition?.name)
        .filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0)
    : [];

  const totalLevel = getTotalLevel(data);

  const conScore = resolveAbilityScore(data, 3);
  const conModifier = abilityModifier(conScore || 10);
  const hpMaxBase =
    asNumber(data.overrideHitPoints) > 0
      ? asNumber(data.overrideHitPoints)
      : asNumber(data.baseHitPoints) + asNumber(data.bonusHitPoints) + conModifier * Math.max(0, totalLevel);
  const hpRemoved = asNumber(data.removedHitPoints);
  const hpCurrent = Math.max(0, hpMaxBase - hpRemoved);

  const dexScore = resolveAbilityScore(data, 2);
  const initBonusNum = abilityModifier(dexScore || 10);
  const initBonus = initBonusNum >= 0 ? `+${initBonusNum}` : String(initBonusNum);
  const abilities = {
    str: resolveAbilityScore(data, 1) || 10,
    dex: dexScore || 10,
    con: conScore || 10,
    int: resolveAbilityScore(data, 4) || 10,
    wis: resolveAbilityScore(data, 5) || 10,
    cha: resolveAbilityScore(data, 6) || 10,
  };

  const importCtx: ImportContext = { abilities, totalLevel };
  const linkResolver = options?.linkResolver;
  const featTraits = collectFeatTraits(data, importCtx, linkResolver);
  const optionTraits = collectOptionTraits(data, importCtx, linkResolver);
  const classSpeciesTraits = collectClassAndSpeciesTraits(data, importCtx, linkResolver);
  const proficiencyBonus = getProficiencyBonus(totalLevel);
  const skillsaves = collectSkillSaves(data, abilities, totalLevel);
  const scopedSkillTraits = collectScopedSkillTraits(data, abilities, totalLevel);
  const actionEntries = collectActionEntries(data, importCtx);
  const weaponActions = collectWeaponActions(data, abilities, proficiencyBonus);

  const strMod = abilityModifier(abilities.str);
  const unarmedDamage = Math.max(1, 1 + strMod);
  const unarmedHit = strMod + proficiencyBonus;
  const signedUnarmed = unarmedHit >= 0 ? `+${unarmedHit}` : String(unarmedHit);
  const unarmedAction: StatblockEntry = {
    name: "Unarmed Strike",
    desc: `Melee Weapon Attack: ${signedUnarmed} to hit, reach 5 ft., one target. Hit: ${unarmedDamage} bludgeoning damage.`,
  };

  const featureActions = collectFeatureActionEntries(data, importCtx, linkResolver);
  const spellAttackActions = collectSpellAttackActions(data, abilities, totalLevel, linkResolver);
  const spells = linkSpellDisplayLines(collectSpellLines(data, abilities, totalLevel), linkResolver);

  const allActions = groupActionsByKind(
    [...weaponActions, unarmedAction],
    spellAttackActions,
    featureActions.actions,
    actionEntries.actions,
  );
  const allBonusActions = mergeUniqueEntries(featureActions.bonusActions, actionEntries.bonusActions);
  const allReactions = mergeUniqueEntries(featureActions.reactions, actionEntries.reactions);

  const actionNames = new Set<string>();
  for (const a of [...allActions, ...allBonusActions, ...allReactions]) {
    actionNames.add(stripLinkMarkup(a.name).toLowerCase());
  }

  const traitGroups: Array<{ label: string; items: StatblockEntry[] }> = [
    { label: "Class Features", items: classSpeciesTraits.classTraits },
    { label: "Species Traits", items: classSpeciesTraits.speciesTraits },
    { label: "Skills", items: scopedSkillTraits },
    { label: "Feats", items: featTraits },
    { label: "Options", items: optionTraits },
  ];
  const dedupedTraits = groupWithDividers(traitGroups, actionNames);

  const result: DndBeyondPcImportData = {
    characterId,
    name: titleCase(String(data.name || "").trim()) || `Character ${characterId}`,
    playerName: String(data.username || "").trim(),
    classes,
    level: String(totalLevel > 0 ? totalLevel : 1),
    hpCurrent: String(hpCurrent),
    hpMax: String(hpMaxBase > 0 ? hpMaxBase : 1),
    ac: resolveArmorClass(data),
    initBonus,
    speed: resolveWalkSpeed(data),
    readonlyUrl: buildReadonlyUrl(characterId, String(data.readonlyUrl || "").trim()),
    abilities,
    senses: collectSenses(data),
    languages: collectLanguages(data),
    skillsaves,
    traits: dedupedTraits,
    actions: allActions,
    bonusActions: allBonusActions,
    reactions: allReactions,
    spells,
  };

  console.log("[DDB Import] ── Result summary ──");
  console.log("[DDB Import] name:", result.name, "| level:", result.level, "| classes:", result.classes);
  console.log("[DDB Import] hp:", result.hpCurrent, "/", result.hpMax, "| ac:", result.ac, "| speed:", result.speed);
  console.log("[DDB Import] abilities:", result.abilities);
  console.log("[DDB Import] skillsaves:", result.skillsaves.length, "| traits:", result.traits.length);
  console.log("[DDB Import] actions:", result.actions.length, "| bonusActions:", result.bonusActions.length, "| reactions:", result.reactions.length);
  console.log("[DDB Import] spells:", result.spells.length, "| languages:", result.languages, "| senses:", result.senses);

  return result;
}
