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
}

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
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

function resolveDescription(item: any): string {
  const raw = String(item?.definition?.description || item?.definition?.snippet || item?.snippet || "").trim();
  return raw ? stripHtml(raw) : "No description provided.";
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

function collectSkillSaves(data: any, abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number }): Array<Record<string, string>> {
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
  const proficiencyBonus = Math.max(2, Math.ceil((asNumber(data?.classes?.reduce?.((sum: number, c: any) => sum + asNumber(c?.level), 0)) || 1) / 4) + 1);
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

function collectSpellTrait(data: any): StatblockEntry[] {
  const candidates = [
    ...(Array.isArray(data?.spells) ? data.spells : []),
    ...((Array.isArray(data?.classSpells) ? data.classSpells : []).flatMap((c: any) => Array.isArray(c?.spells) ? c.spells : [])),
  ];

  const names = new Set<string>();
  for (const spell of candidates) {
    const spellName = String(spell?.definition?.name || spell?.name || "").trim();
    if (spellName) names.add(spellName);
  }

  if (names.size === 0) return [];
  const linked = Array.from(names).sort((a, b) => a.localeCompare(b)).map((name) => withDdbLink(name, "spells"));
  return [
    {
      name: "Spellcasting",
      desc: `Known spells: ${linked.join(", ")}`,
    },
  ];
}

function collectFeatTraits(data: any): StatblockEntry[] {
  const feats = Array.isArray(data?.feats) ? data.feats : [];
  const out: StatblockEntry[] = [];
  for (const feat of feats) {
    const name = String(feat?.definition?.name || feat?.name || "").trim();
    if (!name) continue;
    out.push({
      name,
      desc: `${withDdbLink(name, "feats")}: ${resolveDescription(feat)}`,
    });
  }
  return out;
}

function collectActionEntries(data: any): { actions: StatblockEntry[]; bonusActions: StatblockEntry[]; reactions: StatblockEntry[] } {
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
    const desc = resolveDescription(item);
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

  const totalLevel = Array.isArray(data.classes)
    ? data.classes.reduce((sum: number, c: any) => sum + asNumber(c?.level), 0)
    : 0;

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

  const spellTrait = collectSpellTrait(data);
  const featTraits = collectFeatTraits(data);
  const actionEntries = collectActionEntries(data);

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
    skillsaves: collectSkillSaves(data, abilities),
    traits: [...spellTrait, ...featTraits],
    actions: actionEntries.actions,
    bonusActions: actionEntries.bonusActions,
    reactions: actionEntries.reactions,
  };
}
