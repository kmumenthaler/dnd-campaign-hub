import { requestUrl } from "obsidian";

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

  return undefined;
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

function withDdbLink(name: string, section: "spells" | "feats"): string {
  const slug = slugify(name);
  return slug ? `[${name}](https://www.dndbeyond.com/${section}/${slug})` : name;
}

function withSearchLink(name: string): string {
  const query = encodeURIComponent(name);
  return `[${name}](https://www.dndbeyond.com/search?q=${query})`;
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
      items.push(`${withSearchLink(display)} ${signed}`);
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
    grouped.get(level)!.add(withDdbLink(name, "spells"));
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

function collectFeatTraits(data: any, ctx: ImportContext): StatblockEntry[] {
  const feats = Array.isArray(data?.feats) ? data.feats : [];
  const out: StatblockEntry[] = [];
  for (const feat of feats) {
    const name = String(feat?.definition?.name || feat?.name || "").trim();
    if (!name) continue;
    out.push({
      name,
      desc: `${withDdbLink(name, "feats")}: ${resolveDescription(feat, ctx)}`,
    });
  }
  return out;
}

function collectOptionTraits(data: any, ctx: ImportContext): StatblockEntry[] {
  const options = Array.isArray(data?.options?.class) ? data.options.class : [];
  const out: StatblockEntry[] = [];
  for (const opt of options) {
    const name = String(opt?.definition?.name || "").trim();
    if (!name) continue;
    const requiredLevel = asNumber(opt?.definition?.requiredLevel);
    if (requiredLevel > 0 && requiredLevel > ctx.totalLevel) continue;
    const desc = resolveDescription(opt, ctx);
    out.push({ name, desc: `${withSearchLink(name)}: ${desc}` });
  }
  return out;
}

function collectClassAndSpeciesTraits(data: any, ctx: ImportContext): { classTraits: StatblockEntry[]; speciesTraits: StatblockEntry[] } {
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

    const trait = {
      name,
      desc: `${withSearchLink(name)}: ${desc}`,
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

function collectFeatureActionEntries(data: any, ctx: ImportContext): { actions: StatblockEntry[]; bonusActions: StatblockEntry[]; reactions: StatblockEntry[] } {
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

    const item: StatblockEntry = { name: withSearchLink(name), desc };
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
      const key = `${entry.name.toLowerCase()}::${entry.desc.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
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

  const selected = weapons.filter((w: any) => w?.equipped === true);
  const source = selected.length > 0 ? selected : weapons;
  const out: StatblockEntry[] = [];

  for (const weapon of source) {
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

    out.push({ name: withSearchLink(name), desc });
  }

  return out;
}

function collectActionEntries(data: any, ctx: ImportContext): { actions: StatblockEntry[]; bonusActions: StatblockEntry[]; reactions: StatblockEntry[] } {
  const items = [
    ...(Array.isArray(data?.actions) ? data.actions : []),
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

export async function importFromDndBeyond(source: string): Promise<DndBeyondPcImportData> {
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
  const featTraits = collectFeatTraits(data, importCtx);
  const optionTraits = collectOptionTraits(data, importCtx);
  const classSpeciesTraits = collectClassAndSpeciesTraits(data, importCtx);
  const proficiencyBonus = getProficiencyBonus(totalLevel);
  const skillsaves = collectSkillSaves(data, abilities, totalLevel);
  const scopedSkillTraits = collectScopedSkillTraits(data, abilities, totalLevel);
  const actionEntries = collectActionEntries(data, importCtx);
  const weaponActions = collectWeaponActions(data, abilities, proficiencyBonus);
  const featureActions = collectFeatureActionEntries(data, importCtx);
  const spells = collectSpellLines(data, abilities, totalLevel);

  return {
    characterId,
    name: String(data.name || "").trim() || `Character ${characterId}`,
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
    traits: [
      ...classSpeciesTraits.classTraits,
      ...classSpeciesTraits.speciesTraits,
      ...scopedSkillTraits,
      ...featTraits,
      ...optionTraits,
    ],
    actions: mergeUniqueEntries(weaponActions, featureActions.actions, actionEntries.actions),
    bonusActions: mergeUniqueEntries(featureActions.bonusActions, actionEntries.bonusActions),
    reactions: mergeUniqueEntries(featureActions.reactions, actionEntries.reactions),
    spells,
  };
}
