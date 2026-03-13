import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import type { StatblockEntry } from "./DndBeyondCharacterImport";

/* ------------------------------------------------------------------ */
/*  Public result type                                                 */
/* ------------------------------------------------------------------ */

export interface PDFPcImportData {
  name: string;
  playerName: string;
  classes: string[];
  level: string;
  hpCurrent: string;
  hpMax: string;
  ac: string;
  initBonus: string;
  speed: string;
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
  spells: string[];
  /** Which profile matched (for debugging / user info) */
  profileUsed: string;
}

/* ------------------------------------------------------------------ */
/*  Field-mapping profiles                                             */
/* ------------------------------------------------------------------ */

/** Maps a logical field name to one or more PDF form-field names. */
interface FieldProfile {
  name: string;
  fields: Record<string, string[]>;
}

/**
 * Each profile lists candidate PDF field names for every logical key.
 * During matching we score each profile by how many of its candidates
 * actually exist in the document.
 */
const PROFILES: FieldProfile[] = [
  /* ───── WotC Official 5e Character Sheet ───── */
  {
    name: "WotC Official 5e",
    fields: {
      characterName: ["CharacterName", "CharacterName 2"],
      classLevel: ["ClassLevel", "Class and Level"],
      playerName: ["PlayerName", "Player Name"],
      race: ["Race "],
      background: ["Background"],
      hpMax: ["HPMax", "HPMaximum"],
      hpCurrent: ["HPCurrent"],
      hpTemp: ["HPTemp"],
      ac: ["AC"],
      initiative: ["Initiative"],
      speed: ["Speed"],
      profBonus: ["ProfBonus", "Prof. Bonus"],
      str: ["STR"],
      dex: ["DEX"],
      con: ["CON"],
      int: ["INT"],
      wis: ["WIS"],
      cha: ["CHA"],
      strMod: ["STRmod"],
      dexMod: ["DEXmod"],
      conMod: ["CONmod"],
      intMod: ["INTmod"],
      wisMod: ["WISmod"],
      chaMod: ["CHAmod"],
      passivePerception: ["Passive"],
      featuresTraits: ["Features and Traits", "Feat+Traits"],
      equipment: ["Equipment"],
      attacksSpellcasting: ["AttacksSpellcasting", "Attacks and Spellcasting"],
      personalityTraits: ["PersonalityTraits"],
    },
  },
  /* ───── D&D Beyond PDF Export ───── */
  {
    name: "D&D Beyond PDF",
    fields: {
      characterName: ["Character Name", "name"],
      classLevel: ["Class & Level", "Class and Level", "Class"],
      playerName: ["Player Name"],
      race: ["Race", "Species"],
      background: ["Background"],
      hpMax: ["Max Hit Points", "HP Maximum", "HPMaximum"],
      hpCurrent: ["Current Hit Points", "HPCurrent"],
      hpTemp: ["Temporary Hit Points"],
      ac: ["Armor Class", "AC"],
      initiative: ["Initiative"],
      speed: ["Speed"],
      profBonus: ["Proficiency Bonus"],
      str: ["Strength", "STR"],
      dex: ["Dexterity", "DEX"],
      con: ["Constitution", "CON"],
      int: ["Intelligence", "INT"],
      wis: ["Wisdom", "WIS"],
      cha: ["Charisma", "CHA"],
      strMod: ["Strength Modifier", "STRmod"],
      dexMod: ["Dexterity Modifier", "DEXmod"],
      conMod: ["Constitution Modifier", "CONmod"],
      intMod: ["Intelligence Modifier", "INTmod"],
      wisMod: ["Wisdom Modifier", "WISmod"],
      chaMod: ["Charisma Modifier", "CHAmod"],
      passivePerception: ["Passive Perception", "Passive"],
      featuresTraits: ["Features & Traits", "Features and Traits"],
      equipment: ["Equipment"],
      attacksSpellcasting: ["Attacks & Spellcasting"],
      personalityTraits: ["Personality Traits"],
    },
  },
  /* ───── MPMB (MorePurpleMoreBetter) ───── */
  {
    name: "MPMB Automated Sheet",
    fields: {
      characterName: ["Player Name", "Character Name"],
      classLevel: ["Class and Levels", "Class and Level"],
      playerName: ["DCI"],
      race: ["Race"],
      background: ["Background"],
      hpMax: ["HP Max"],
      hpCurrent: ["HP Current"],
      hpTemp: ["HP Temp"],
      ac: ["AC"],
      initiative: ["Init"],
      speed: ["Speed"],
      profBonus: ["Proficiency Bonus"],
      str: ["Str"],
      dex: ["Dex"],
      con: ["Con"],
      int: ["Int"],
      wis: ["Wis"],
      cha: ["Cha"],
      strMod: ["Str Mod"],
      dexMod: ["Dex Mod"],
      conMod: ["Con Mod"],
      intMod: ["Int Mod"],
      wisMod: ["Wis Mod"],
      chaMod: ["Cha Mod"],
      passivePerception: ["Passive Perception"],
      featuresTraits: ["Extra.Features and Traits", "Class Features"],
      equipment: ["Equipment"],
      attacksSpellcasting: ["Attacks"],
      personalityTraits: ["Personality Traits"],
    },
  },
  /* ───── German (Deutsch) 5e Character Sheet ───── */
  {
    name: "German 5e (Deutsch)",
    fields: {
      characterName: ["Charaktername_page1", "Charaktername_page2"],
      classLevel: ["KlasseUndStufe", "Klasse und Stufe"],
      playerName: ["Spielername"],
      race: ["Volk", "Rasse"],
      background: ["Hintergrund"],
      hpMax: ["TrefferpunkteMaximum", "Trefferpunkte Maximum"],
      hpCurrent: ["AktTrefferpunkte", "Aktuelle Trefferpunkte"],
      hpTemp: ["TempTrefferpunkte"],
      ac: ["Rüstungsklasse", "RK"],
      initiative: ["Initiative"],
      speed: ["Bewegungsrate"],
      profBonus: ["Übungsbonus", "Kompetenzbonus"],
      str: ["Str"],
      dex: ["Ges"],
      con: ["Kon"],
      int: ["Int"],
      wis: ["Wei"],
      cha: ["Cha"],
      strMod: ["StrMod"],
      dexMod: ["GesMod"],
      conMod: ["KonMod"],
      intMod: ["IntMod"],
      wisMod: ["WeiMod"],
      chaMod: ["ChaMod"],
      passivePerception: ["PassiveWeisheit", "Passive Weisheit"],
      featuresTraits: ["Klassenmerkmale1", "Klassenmerkmale2", "Rassenmerkmale"],
      equipment: ["Equipment"],
      attacksSpellcasting: [""],
      personalityTraits: ["Persönlichkeitsmerkmale"],
      senses: ["Sinne"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Skill-save mapping for 5e                                          */
/* ------------------------------------------------------------------ */

/** Mapping from known skill-field-name fragments to canonical skill names. */
const SKILL_FIELD_MAP: Record<string, string> = {
  // English
  acrobatics: "Acrobatics",
  "animal handling": "Animal Handling",
  "animal": "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  "sleight of hand": "Sleight of Hand",
  "sleight": "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
  // German (Deutsch)
  "akrobatik": "Acrobatics",
  "arkanekunde": "Arcana",
  "athletik": "Athletics",
  "auftreten": "Performance",
  "einschüchtern": "Intimidation",
  "fingerfertigkeit": "Sleight of Hand",
  "geschichte": "History",
  "heilkunde": "Medicine",
  "heimlichkeit": "Stealth",
  "mittierenumgehen": "Animal Handling",
  "motiverkennen": "Insight",
  "nachforschungen": "Investigation",
  "naturkunde": "Nature",
  "täuschen": "Deception",
  "überlebenskunst": "Survival",
  "überzeugen": "Persuasion",
  "wahrnehmung": "Perception",
};

const SAVE_FIELD_MAP: Record<string, string> = {
  str: "Str",
  strength: "Str",
  dex: "Dex",
  dexterity: "Dex",
  con: "Con",
  constitution: "Con",
  int: "Int",
  intelligence: "Int",
  wis: "Wis",
  wisdom: "Wis",
  cha: "Cha",
  charisma: "Cha",
};

/** German save-field suffixes → canonical save key. */
const DE_SAVE_FIELD_MAP: Record<string, string> = {
  strrw: "Str Save",
  gesrw: "Dex Save",
  konrw: "Con Save",
  intrw: "Int Save",
  weirw: "Wis Save",
  charw: "Cha Save",
};

/* ------------------------------------------------------------------ */
/*  Core parsing logic                                                 */
/* ------------------------------------------------------------------ */

/**
 * Parse a fillable PDF character sheet and extract as much PC data
 * as possible.  Returns an object whose fields are populated best-effort.
 */
export async function parsePDFCharacterSheet(
  data: ArrayBuffer,
): Promise<PDFPcImportData> {
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const form = pdf.getForm();
  const allFields = form.getFields();

  // Build a lookup: lowercase field name → text value
  const fieldMap = new Map<string, string>();
  for (const field of allFields) {
    const key = field.getName();
    if (field instanceof PDFTextField) {
      fieldMap.set(key.toLowerCase().trim(), field.getText() ?? "");
    } else if (field instanceof PDFCheckBox) {
      fieldMap.set(key.toLowerCase().trim(), field.isChecked() ? "true" : "false");
    }
  }

  // Score each profile and pick the best match
  const profile = pickBestProfile(fieldMap);

  // Helper: resolve first matching field
  const get = (logicalKey: string): string => {
    const candidates = profile.fields[logicalKey];
    if (!candidates) return "";
    for (const c of candidates) {
      const val = fieldMap.get(c.toLowerCase().trim());
      if (val) return val.trim();
    }
    return "";
  };

  const isGerman = profile.name.startsWith("German");

  // ── Core stats ──
  const rawClassLevel = get("classLevel");
  const { classes, level } = parseClassLevel(rawClassLevel);

  const abilities = parseAbilities(get, fieldMap);

  // ── Skills & saves ──
  const skillsaves = extractSkillsAndSaves(fieldMap, isGerman);

  // ── Traits / features ──
  const traitTexts: string[] = [];
  if (isGerman) {
    // German sheets store class features and racial traits separately
    for (const key of ["klassenmerkmale1", "klassenmerkmale2", "rassenmerkmale"]) {
      const v = fieldMap.get(key);
      if (v?.trim()) traitTexts.push(v.trim());
    }
  }
  const traits = traitTexts.length > 0
    ? parseTextBlock(traitTexts.join("\n\n"))
    : parseTextBlock(get("featuresTraits"));

  // ── Actions ──
  const attackActions = extractNumberedAttacks(fieldMap);
  const textActions = parseTextBlock(get("attacksSpellcasting"));
  const actions = attackActions.length > 0 ? attackActions : textActions;

  // ── Spells (extracted from spell fields or text blocks) ──
  const spells = extractSpells(fieldMap);

  // ── Senses / languages ──
  const senses = resolveTextField(fieldMap, [
    "sinne", "senses", "passive perception", "passive",
  ]);
  const numberedLangs = extractNumberedValues(fieldMap, "sprache");
  const languages = numberedLangs.length > 0
    ? numberedLangs.join(", ")
    : resolveTextField(fieldMap, [
        "languages", "other proficiencies and languages",
        "proficiencies", "proficiencies & languages",
      ]);

  // ── Speed: German sheets use meters; convert to feet ──
  let speed = get("speed").replace(/\s*ft\.?$/i, "").replace(/\s*m$/i, "");
  if (isGerman && speed) {
    const metres = parseFloat(speed);
    if (!isNaN(metres) && metres < 20) {
      // Likely metres – convert to feet (round to nearest 5)
      speed = String(Math.round((metres * 3.28084) / 5) * 5);
    }
  }

  return {
    name: get("characterName"),
    playerName: get("playerName"),
    classes,
    level,
    hpCurrent: get("hpCurrent") || get("hpMax"),
    hpMax: get("hpMax"),
    ac: get("ac"),
    initBonus: get("initiative"),
    speed,
    abilities,
    senses,
    languages,
    skillsaves,
    traits,
    actions,
    spells,
    profileUsed: profile.name,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Pick the profile whose field names match the most keys in the PDF. */
function pickBestProfile(
  fieldMap: Map<string, string>,
): FieldProfile {
  let best: FieldProfile = PROFILES[0]!;
  let bestScore = -1;

  for (const profile of PROFILES) {
    let score = 0;
    for (const candidates of Object.values(profile.fields)) {
      for (const c of candidates) {
        if (fieldMap.has(c.toLowerCase().trim())) {
          score++;
          break; // only count each logical key once
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = profile;
    }
  }
  return best;
}

/**
 * Parse class/level strings in various formats:
 *  - "Fighter 5 / Wizard 3"  (English)
 *  - "Ranger 7"
 *  - "Kriegsmagier (3)"      (German parenthesised level)
 */
function parseClassLevel(raw: string): { classes: string[]; level: string } {
  if (!raw) return { classes: [], level: "1" };

  // Try "Class (Level)" format first (covers German sheets)
  const parenMatch = raw.match(/^(.+?)\s*\((\d+)\)$/);
  if (parenMatch?.[1] && parenMatch[2]) {
    return {
      classes: [parenMatch[1].trim()],
      level: parenMatch[2],
    };
  }

  // Try "Class Level / Class Level" format
  const parts = raw.split(/\s*\/\s*/);
  const classes: string[] = [];
  let totalLevel = 0;

  for (const part of parts) {
    const m = part.match(/^(.+?)\s+(\d+)$/);
    if (m && m[1] && m[2]) {
      classes.push(m[1].trim());
      totalLevel += parseInt(m[2], 10);
    } else {
      // Might be just a class name without level
      const trimmed = part.trim();
      if (trimmed) {
        classes.push(trimmed);
      }
    }
  }

  // If no level found, try extracting a standalone number
  if (totalLevel === 0) {
    const levelMatch = raw.match(/\b(\d{1,2})\b/);
    totalLevel = levelMatch?.[1] ? parseInt(levelMatch[1], 10) : 1;
  }

  return { classes, level: String(totalLevel) };
}

/**
 * Extract ability scores, preferring score fields over modifier fields.
 */
function parseAbilities(
  get: (key: string) => string,
  _fieldMap: Map<string, string>,
): PDFPcImportData["abilities"] {
  const parse = (scoreKey: string, modKey: string): number => {
    const raw = get(scoreKey);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1 && n <= 30) return n;

    // Fall back: derive from modifier  =>  score = mod * 2 + 10
    const mod = parseInt(get(modKey), 10);
    if (!isNaN(mod)) return mod * 2 + 10;

    return 10;
  };

  return {
    str: parse("str", "strMod"),
    dex: parse("dex", "dexMod"),
    con: parse("con", "conMod"),
    int: parse("int", "intMod"),
    wis: parse("wis", "wisMod"),
    cha: parse("cha", "chaMod"),
  };
}

/**
 * Walk the field map looking for skill bonus / save bonus fields.
 * Returns Fantasy-Statblocks-compatible `skillsaves` entries.
 */
function extractSkillsAndSaves(
  fieldMap: Map<string, string>,
  isGerman = false,
): Array<Record<string, string>> {
  const result: Array<Record<string, string>> = [];
  const seen = new Set<string>();

  for (const [key, val] of fieldMap) {
    if (!val || val === "0" || val === "+0") continue;

    // Skip proficiency/expertise checkboxes — only want bonus values
    if (key.endsWith("prof") || key.endsWith("exp")) continue;

    // Check skills
    for (const [fragment, canonical] of Object.entries(SKILL_FIELD_MAP)) {
      if (key.includes(fragment) && !key.includes("check") && !key.includes("prof") && !key.includes("exp") && !seen.has(canonical)) {
        const bonus = normalizeBonus(val);
        if (bonus) {
          result.push({ [canonical]: bonus });
          seen.add(canonical);
        }
      }
    }

    // Check saving throws (English)
    for (const [fragment, canonical] of Object.entries(SAVE_FIELD_MAP)) {
      const saveKey = `${canonical} Save`;
      if (
        (key.includes(`${fragment} save`) || key.includes(`st ${fragment}`) || key.includes(`saving throw ${fragment}`)) &&
        !seen.has(saveKey)
      ) {
        const bonus = normalizeBonus(val);
        if (bonus) {
          result.push({ [saveKey]: bonus });
          seen.add(saveKey);
        }
      }
    }

    // Check German saving throws (e.g. "strrw", "gesrw")
    if (isGerman) {
      for (const [fieldSuffix, saveKey] of Object.entries(DE_SAVE_FIELD_MAP)) {
        if (key === fieldSuffix && !seen.has(saveKey)) {
          const bonus = normalizeBonus(val);
          if (bonus) {
            result.push({ [saveKey]: bonus });
            seen.add(saveKey);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Extract spells from form fields.
 * Handles English ("Spells1001") and German ("Zaubertrick1", "Zauber1_1") patterns.
 */
function extractSpells(fieldMap: Map<string, string>): string[] {
  const spells: string[] = [];
  const seen = new Set<string>();

  const add = (val: string) => {
    const name = val.trim();
    const lc = name.toLowerCase();
    if (name && !seen.has(lc) && name.length > 1) {
      spells.push(name);
      seen.add(lc);
    }
  };

  for (const [key, val] of fieldMap) {
    if (!val) continue;

    // English: "Spells1001", "Spell Name 1", etc.
    if (/spell/i.test(key) && !/slot|level|dc|attack|mod|save|bonus|casting/i.test(key)) {
      add(val);
      continue;
    }

    // German: "Zaubertrick1"–"Zaubertrick8" (cantrips)
    if (/^zaubertrick\d+$/i.test(key)) {
      add(val);
      continue;
    }

    // German: "Zauber1_1", "Zauber2_3", etc. (levelled spells)
    // Exclude slot/consumed/active fields
    if (/^zauber\d+_\d+$/i.test(key)) {
      add(val);
    }
  }

  return spells;
}

/**
 * Parse a multiline text block (features, attacks, etc.) into
 * StatblockEntry[] by splitting on double-newlines or bold headers.
 */
function parseTextBlock(text: string): StatblockEntry[] {
  if (!text.trim()) return [];

  const entries: StatblockEntry[] = [];

  // Split on patterns like "Feature Name." or "Feature Name:" followed by description
  const sections = text.split(/\n{2,}/).filter(s => s.trim());

  for (const section of sections) {
    const trimmed = section.trim();
    // Try to extract "Name. Description" or "Name: Description" pattern
    const headerMatch = trimmed.match(/^([A-Z][^.:\n]{1,60})[.:]\s*(.*)$/s);
    if (headerMatch?.[1]) {
      entries.push({
        name: headerMatch[1].trim(),
        desc: headerMatch[2]?.trim() || trimmed,
      });
    } else {
      // Use first line as name, rest as description
      const lines = trimmed.split("\n");
      const name = (lines[0] ?? "").trim();
      const desc = lines.slice(1).join("\n").trim();
      if (name) {
        entries.push({ name, desc: desc || name });
      }
    }
  }

  return entries;
}

/**
 * Extract actions from numbered attack fields (e.g. Angriff1–5, Schaden1–5).
 * Common in German and some custom sheets.
 */
function extractNumberedAttacks(
  fieldMap: Map<string, string>,
): StatblockEntry[] {
  const actions: StatblockEntry[] = [];

  for (let i = 1; i <= 10; i++) {
    // Try English patterns first, then German
    const name =
      fieldMap.get(`attack${i}`) ||
      fieldMap.get(`angriff${i}`) ||
      "";
    if (!name.trim()) continue;

    const damage = fieldMap.get(`schaden${i}`) || fieldMap.get(`damage${i}`) || "";
    const damageType = fieldMap.get(`schadentyp${i}`) || fieldMap.get(`damagetype${i}`) || "";
    const range = fieldMap.get(`reichweite${i}`) || fieldMap.get(`range${i}`) || "";
    const bonus = fieldMap.get(`bonus${i}`) || "";
    const desc = fieldMap.get(`beschreibung${i}`) || fieldMap.get(`description${i}`) || "";

    const parts: string[] = [];
    if (bonus) parts.push(`+${bonus.replace(/^\+/, "")} to hit`);
    if (range) parts.push(`range ${range}`);
    if (damage) {
      let dmgStr = damage;
      if (damageType) dmgStr += ` ${damageType}`;
      parts.push(dmgStr);
    }
    if (desc) parts.push(desc);

    actions.push({
      name: name.trim(),
      desc: parts.join(". ") || name.trim(),
    });
  }

  return actions;
}

/**
 * Collect values from numbered form fields like Sprache1, Sprache2, etc.
 */
function extractNumberedValues(
  fieldMap: Map<string, string>,
  prefix: string,
): string[] {
  const values: string[] = [];
  const lowerPrefix = prefix.toLowerCase();

  for (let i = 1; i <= 20; i++) {
    const val = fieldMap.get(`${lowerPrefix}${i}`);
    if (val?.trim()) values.push(val.trim());
  }

  return values;
}

/** Resolve first non-empty value from a list of candidate field names. */
function resolveTextField(
  fieldMap: Map<string, string>,
  candidates: string[],
): string {
  for (const c of candidates) {
    const val = fieldMap.get(c.toLowerCase().trim());
    if (val?.trim()) return val.trim();
  }
  return "";
}

/** Normalise a bonus string: ensure it has a +/- prefix. */
function normalizeBonus(val: string): string {
  const trimmed = val.trim();
  const n = parseInt(trimmed, 10);
  if (isNaN(n)) return "";
  if (n >= 0) return `+${n}`;
  return String(n);
}

/* ------------------------------------------------------------------ */
/*  Diagnostic: dump all form fields (useful for adding new profiles)  */
/* ------------------------------------------------------------------ */

/**
 * Return all form field names and values from a PDF.
 * Useful for building new field-mapping profiles.
 */
export async function dumpPDFFields(
  data: ArrayBuffer,
): Promise<Array<{ name: string; type: string; value: string }>> {
  const pdf = await PDFDocument.load(data, { ignoreEncryption: true });
  const form = pdf.getForm();
  const result: Array<{ name: string; type: string; value: string }> = [];

  for (const field of form.getFields()) {
    const name = field.getName();
    let type = field.constructor.name;
    let value = "";

    if (field instanceof PDFTextField) {
      type = "text";
      value = field.getText() ?? "";
    } else if (field instanceof PDFCheckBox) {
      type = "checkbox";
      value = field.isChecked() ? "✓" : "☐";
    } else {
      type = "other";
    }

    result.push({ name, type, value });
  }

  return result;
}
