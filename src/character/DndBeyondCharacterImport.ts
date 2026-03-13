import { requestUrl } from "obsidian";

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

function dexModifier(score: number): number {
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

  const hpMaxBase =
    asNumber(data.overrideHitPoints) > 0
      ? asNumber(data.overrideHitPoints)
      : asNumber(data.baseHitPoints) + asNumber(data.bonusHitPoints);
  const hpRemoved = asNumber(data.removedHitPoints);
  const hpCurrent = Math.max(0, hpMaxBase - hpRemoved);

  const dexScore = resolveAbilityScore(data, 2);
  const initBonusNum = dexModifier(dexScore || 10);
  const initBonus = initBonusNum >= 0 ? `+${initBonusNum}` : String(initBonusNum);

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
  };
}
