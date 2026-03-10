import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { MarkerDefinition, CreatureSize, CREATURE_SIZE_SQUARES } from "../marker/MarkerTypes";
import { TokenEditorWidget } from '../marker/TokenEditorWidget';

export class CreatureCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  
  // For editing existing creatures
  isEdit = false;
  originalCreaturePath = "";
  originalCreatureName = "";
  
  // Token ID for map markers
  tokenId = "";
  
  // Creature properties
  creatureName = "";
  size: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan' = 'Medium';
  type = "";
  subtype = "";
  alignment = "";
  ac = "";
  hp = "";
  hitDice = "";
  speed = "";
  
  // Ability scores
  str = 10;
  dex = 10;
  con = 10;
  int = 10;
  wis = 10;
  cha = 10;
  
  // Optional fields
  saves: string[] = [];
  skills: string[] = [];
  vulnerabilities = "";
  resistances = "";
  immunities = "";
  conditionImmunities = "";
  senses = "";
  languages = "";
  cr = "";
  
  // Features and actions
  traits: Array<{name: string, desc: string}> = [];
  actions: Array<{name: string, desc: string}> = [];
  bonusActions: Array<{name: string, desc: string}> = [];
  reactions: Array<{name: string, desc: string}> = [];
  legendaryActions: Array<{name: string, desc: string}> = [];
  
  // Description
  description = "";

  // Token appearance widget
  private tokenEditor: TokenEditorWidget | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, creaturePath?: string) {
    super(app);
    this.plugin = plugin;
    if (creaturePath) {
      this.isEdit = true;
      this.originalCreaturePath = creaturePath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("creature-creation-modal");
    
    // Load existing creature data if editing
    if (this.isEdit) {
      await this.loadCreatureData();
    }
    
    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Creature" : "🐉 Create New Creature" });

    // Import section
    contentEl.createEl("h3", { text: "Import from Text" });
    contentEl.createEl("p", { 
      text: "Paste a statblock below to auto-fill the form. Supports both 2014 (D&D Beyond classic) and 2024 (new Monster Manual) formats:",
      cls: "setting-item-description"
    });

    const importContainer = contentEl.createDiv({ cls: "creature-import-container" });
    const importTextArea = importContainer.createEl("textarea", {
      placeholder: "Paste creature statblock here (supports 2014 & 2024 formats)...",
      attr: { rows: "8", style: "width: 100%; margin-bottom: 10px;" }
    });

    const importButton = importContainer.createEl("button", {
      text: "📥 Parse Statblock",
      cls: "mod-cta"
    });

    importButton.addEventListener("click", () => {
      this.parseStatblockText(importTextArea.value);
      this.refreshUI();
      new Notice("Statblock parsed! Review and adjust fields below.");
    });

    contentEl.createEl("hr");
    contentEl.createEl("h3", { text: "Creature Details" });

    // Basic Info
    new Setting(contentEl)
      .setName("Creature Name")
      .setDesc("Name of the creature")
      .addText((text) =>
        text
          .setPlaceholder("Frost Giant Zombie")
          .setValue(this.creatureName)
          .onChange((value) => {
            this.creatureName = value;
          })
      );

    new Setting(contentEl)
      .setName("Size")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Tiny", "Tiny")
          .addOption("Small", "Small")
          .addOption("Medium", "Medium")
          .addOption("Large", "Large")
          .addOption("Huge", "Huge")
          .addOption("Gargantuan", "Gargantuan")
          .setValue(this.size)
          .onChange((value) => {
            this.size = value as any;
          })
      );

    new Setting(contentEl)
      .setName("Type")
      .setDesc("Creature type (e.g., undead, elemental, humanoid)")
      .addText((text) =>
        text
          .setPlaceholder("undead")
          .setValue(this.type)
          .onChange((value) => {
            this.type = value;
          })
      );

    new Setting(contentEl)
      .setName("Subtype/Tags")
      .setDesc("Optional subtype or tags (e.g., goblinoid, shapechanger)")
      .addText((text) =>
        text
          .setPlaceholder("giant")
          .setValue(this.subtype)
          .onChange((value) => {
            this.subtype = value;
          })
      );

    new Setting(contentEl)
      .setName("Alignment")
      .addText((text) =>
        text
          .setPlaceholder("neutral evil")
          .setValue(this.alignment)
          .onChange((value) => {
            this.alignment = value;
          })
      );

    // Combat Stats
    contentEl.createEl("h3", { text: "Combat Statistics" });

    new Setting(contentEl)
      .setName("Armor Class")
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(this.ac)
          .onChange((value) => {
            this.ac = value;
          })
      );

    new Setting(contentEl)
      .setName("Hit Points")
      .addText((text) =>
        text
          .setPlaceholder("138")
          .setValue(this.hp)
          .onChange((value) => {
            this.hp = value;
          })
      );

    new Setting(contentEl)
      .setName("Hit Dice")
      .setDesc("Format: XdY + Z (e.g., 12d12 + 60)")
      .addText((text) =>
        text
          .setPlaceholder("12d12 + 60")
          .setValue(this.hitDice)
          .onChange((value) => {
            this.hitDice = value;
          })
      );

    new Setting(contentEl)
      .setName("Speed")
      .setDesc("All movement speeds (e.g., 40 ft., fly 30 ft.)")
      .addText((text) =>
        text
          .setPlaceholder("40 ft.")
          .setValue(this.speed)
          .onChange((value) => {
            this.speed = value;
          })
      );

    // Ability Scores
    contentEl.createEl("h3", { text: "Ability Scores" });
    
    const abilityScoresContainer = contentEl.createDiv({ cls: "ability-scores-grid" });
    abilityScoresContainer.style.display = "grid";
    abilityScoresContainer.style.gridTemplateColumns = "repeat(3, 1fr)";
    abilityScoresContainer.style.gap = "10px";

    this.createAbilityScore(abilityScoresContainer, "STR", this.str, (val) => this.str = val);
    this.createAbilityScore(abilityScoresContainer, "DEX", this.dex, (val) => this.dex = val);
    this.createAbilityScore(abilityScoresContainer, "CON", this.con, (val) => this.con = val);
    this.createAbilityScore(abilityScoresContainer, "INT", this.int, (val) => this.int = val);
    this.createAbilityScore(abilityScoresContainer, "WIS", this.wis, (val) => this.wis = val);
    this.createAbilityScore(abilityScoresContainer, "CHA", this.cha, (val) => this.cha = val);

    // Additional Stats
    contentEl.createEl("h3", { text: "Additional Statistics" });

    new Setting(contentEl)
      .setName("Saving Throws")
      .setDesc("Comma-separated (e.g., WIS +2, CON +5)")
      .addText((text) =>
        text
          .setPlaceholder("WIS +2")
          .setValue(this.saves.join(", "))
          .onChange((value) => {
            this.saves = value ? value.split(",").map(s => s.trim()) : [];
          })
      );

    new Setting(contentEl)
      .setName("Skills")
      .setDesc("Comma-separated (e.g., Perception +4, Stealth +6)")
      .addText((text) =>
        text
          .setPlaceholder("Perception +4")
          .setValue(this.skills.join(", "))
          .onChange((value) => {
            this.skills = value ? value.split(",").map(s => s.trim()) : [];
          })
      );

    new Setting(contentEl)
      .setName("Damage Vulnerabilities")
      .addText((text) =>
        text
          .setPlaceholder("Fire")
          .setValue(this.vulnerabilities)
          .onChange((value) => {
            this.vulnerabilities = value;
          })
      );

    new Setting(contentEl)
      .setName("Damage Resistances")
      .addText((text) =>
        text
          .setPlaceholder("Lightning, Poison")
          .setValue(this.resistances)
          .onChange((value) => {
            this.resistances = value;
          })
      );

    new Setting(contentEl)
      .setName("Damage Immunities")
      .addText((text) =>
        text
          .setPlaceholder("Poison, Cold")
          .setValue(this.immunities)
          .onChange((value) => {
            this.immunities = value;
          })
      );

    new Setting(contentEl)
      .setName("Condition Immunities")
      .addText((text) =>
        text
          .setPlaceholder("Poisoned")
          .setValue(this.conditionImmunities)
          .onChange((value) => {
            this.conditionImmunities = value;
          })
      );

    new Setting(contentEl)
      .setName("Senses")
      .addText((text) =>
        text
          .setPlaceholder("Darkvision 60 ft.")
          .setValue(this.senses)
          .onChange((value) => {
            this.senses = value;
          })
      );

    new Setting(contentEl)
      .setName("Languages")
      .addText((text) =>
        text
          .setPlaceholder("understands Giant but can't speak")
          .setValue(this.languages)
          .onChange((value) => {
            this.languages = value;
          })
      );

    new Setting(contentEl)
      .setName("Challenge Rating")
      .addText((text) =>
        text
          .setPlaceholder("9")
          .setValue(this.cr)
          .onChange((value) => {
            this.cr = value;
          })
      );

    // Traits
    contentEl.createEl("h3", { text: "Traits & Features" });
    contentEl.createEl("p", { 
      text: "Passive abilities and special features",
      cls: "setting-item-description"
    });

    const traitsContainer = contentEl.createDiv({ cls: "creature-features-container" });
    this.renderFeatureList(traitsContainer, this.traits, "Trait");

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Trait")
          .onClick(() => {
            this.traits.push({ name: "", desc: "" });
            this.refreshUI();
          })
      );

    // Actions
    contentEl.createEl("h3", { text: "Actions" });
    const actionsContainer = contentEl.createDiv({ cls: "creature-features-container" });
    this.renderFeatureList(actionsContainer, this.actions, "Action");

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("+ Add Action")
          .onClick(() => {
            this.actions.push({ name: "", desc: "" });
            this.refreshUI();
          })
      );

    // Description
    contentEl.createEl("h3", { text: "Description" });
    new Setting(contentEl)
      .setName("Creature Description")
      .setDesc("Lore, appearance, and behavior")
      .addTextArea((text) => {
        text
          .setPlaceholder("Describe the creature...")
          .setValue(this.description)
          .onChange((value) => {
            this.description = value;
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
      });

    // ── Token Appearance ──
    contentEl.createEl("h3", { text: "🎨 Token Appearance" });
    const tokenContainer = contentEl.createDiv();
    this.initTokenEditor(tokenContainer);

    // Create/Update Button
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(this.isEdit ? "Update Creature" : "Create Creature")
          .setCta()
          .onClick(async () => {
            await this.saveCreature();
          })
      );
  }

  createAbilityScore(container: HTMLElement, ability: string, value: number, onChange: (val: number) => void) {
    const abilityDiv = container.createDiv({ cls: "ability-score" });
    abilityDiv.createEl("label", { text: ability, attr: { style: "font-weight: bold;" } });
    const input = abilityDiv.createEl("input", {
      type: "number",
      value: value.toString(),
      attr: { min: "1", max: "30", style: "width: 100%;" }
    });
    
    const modifier = Math.floor((value - 10) / 2);
    const modText = abilityDiv.createEl("span", { 
      text: ` (${modifier >= 0 ? '+' : ''}${modifier})`,
      attr: { style: "font-size: 0.9em; color: #888;" }
    });

    input.addEventListener("change", () => {
      const val = parseInt(input.value);
      if (!isNaN(val) && val >= 1 && val <= 30) {
        onChange(val);
        const newMod = Math.floor((val - 10) / 2);
        modText.textContent = ` (${newMod >= 0 ? '+' : ''}${newMod})`;
      }
    });
  }

  renderFeatureList(container: HTMLElement, features: Array<{name: string, desc: string}>, type: string) {
    container.empty();
    
    features.forEach((feature, index) => {
      const featureDiv = container.createDiv({ cls: "creature-feature-item" });
      featureDiv.style.marginBottom = "15px";
      featureDiv.style.padding = "10px";
      featureDiv.style.border = "1px solid #ccc";
      featureDiv.style.borderRadius = "4px";

      new Setting(featureDiv)
        .setName(`${type} Name`)
        .addText((text) =>
          text
            .setPlaceholder("Feature name")
            .setValue(feature.name)
            .onChange((value) => {
              feature.name = value;
            })
        );

      new Setting(featureDiv)
        .setName(`${type} Description`)
        .addTextArea((text) => {
          text
            .setPlaceholder("Feature description...")
            .setValue(feature.desc)
            .onChange((value) => {
              feature.desc = value;
            });
          text.inputEl.rows = 3;
          text.inputEl.style.width = "100%";
        });

      new Setting(featureDiv)
        .addButton((button) =>
          button
            .setButtonText("Remove")
            .setWarning()
            .onClick(() => {
              features.splice(index, 1);
              this.refreshUI();
            })
        );
    });
  }

  parseStatblockText(text: string) {
    if (!text || text.trim().length === 0) {
      new Notice("Please paste a statblock first");
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // ── Detect 2024 vs legacy format ──
    // 2024 uses "AC <num>" and "HP <num>" instead of "Armor Class <num>" and "Hit Points <num>"
    const is2024 = /^AC\s+\d+/m.test(text) || /^HP\s+\d+/m.test(text) || /^CR\s+[\d/]+/m.test(text);

    if (is2024) {
      this.parse2024Statblock(text, lines);
    } else {
      this.parseLegacyStatblock(text, lines);
    }

  }

  /**
   * Parse 2024-style statblock (e.g. 2024 Monster Manual / D&D Beyond 2024).
   *
   * Example format:
   *   Poltergeist
   *   Medium Or Small Undead, Chaotic Neutral
   *   AC 12    Initiative +2 (12)
   *   HP 22 (5d8)
   *   Speed 5 ft., fly 50 ft. (hover)
   *   Mod	Save
   *   STR	1	-5	-5
   *   DEX	14	+2	+2
   *   ...
   *   Resistances Acid, Cold, Fire, ...
   *   Immunities Necrotic, Poison; Charmed, Exhaustion, ...
   *   Senses Darkvision 60 ft., Passive Perception 10
   *   Languages Common
   *   CR 2 (XP 450; PB +2)
   *   Traits
   *   Incorporeal Movement. The poltergeist can move ...
   *   Actions
   *   Multiattack. ...
   *   Bonus Actions
   *   Vanish. ...
   */
  parse2024Statblock(text: string, lines: string[]) {
    // ── Creature name (first line) ──
    if (lines.length > 0 && lines[0]) {
      this.creatureName = lines[0];
    }

    // ── Size, type, alignment ──
    // 2024 may have multi-size like "Medium Or Small Undead, Chaotic Neutral"
    const sizeTypeLine = text.match(/^((?:(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\s*(?:Or\s+)?)+)\s+(.+?),\s*(.+)$/m);
    if (sizeTypeLine && sizeTypeLine[1] && sizeTypeLine[2] && sizeTypeLine[3]) {
      // Take the first listed size for the field (e.g. "Medium Or Small" → "Medium")
      const sizeStr = sizeTypeLine[1].trim();
      const firstSize = sizeStr.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)/);
      if (firstSize && firstSize[1]) this.size = firstSize[1] as any;
      this.type = sizeTypeLine[2].trim();
      this.alignment = sizeTypeLine[3].trim();
    }

    // ── AC (+ optional Initiative) ──
    const acMatch = text.match(/^AC\s+(\d+)/m);
    if (acMatch && acMatch[1]) this.ac = acMatch[1];

    // ── HP and Hit Dice ──
    const hpMatch = text.match(/^HP\s+(\d+)/m);
    if (hpMatch && hpMatch[1]) this.hp = hpMatch[1];

    const hitDiceMatch = text.match(/^HP\s+\d+\s+\(([^)]+)\)/m);
    if (hitDiceMatch && hitDiceMatch[1]) this.hitDice = hitDiceMatch[1];

    // ── Speed ──
    const speedMatch = text.match(/^Speed\s+(.+)$/m);
    if (speedMatch && speedMatch[1]) this.speed = speedMatch[1].trim();

    // ── Ability scores & saves (2024 tabular format) ──
    // Format: STR	1	-5	-5  (score, mod, save)
    // or:     STR	10	+0	+0
    const abilityPattern = /^(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)\s+([+-]?\d+)\s+([+-]?\d+)/gm;
    const abilityMods: Record<string, number> = {};
    const abilitySaves: Record<string, number> = {};
    let abilityMatch: RegExpExecArray | null;
    while ((abilityMatch = abilityPattern.exec(text)) !== null) {
      const ability = abilityMatch[1]?.toUpperCase();
      const score = parseInt(abilityMatch[2] || '10');
      const mod = parseInt(abilityMatch[3] || '0');
      const save = parseInt(abilityMatch[4] || '0');
      if (ability) {
        switch (ability) {
          case 'STR': this.str = score; break;
          case 'DEX': this.dex = score; break;
          case 'CON': this.con = score; break;
          case 'INT': this.int = score; break;
          case 'WIS': this.wis = score; break;
          case 'CHA': this.cha = score; break;
        }
        abilityMods[ability] = mod;
        abilitySaves[ability] = save;
      }
    }

    // Derive saving throw proficiencies: save differs from mod → proficient
    this.saves = [];
    for (const [ability, save] of Object.entries(abilitySaves)) {
      const mod = abilityMods[ability] ?? 0;
      if (save !== mod) {
        const sign = save >= 0 ? '+' : '';
        this.saves.push(`${ability.charAt(0)}${ability.slice(1).toLowerCase()} ${sign}${save}`);
      }
    }

    // ── Skills (2024 keeps same format as legacy) ──
    const skillsMatch2024 = text.match(/^Skills\s+(.+)$/m);
    if (skillsMatch2024 && skillsMatch2024[1]) {
      this.skills = skillsMatch2024[1].trim().split(',').map(s => s.trim());
    }

    // ── Resistances (2024 uses "Resistances" without "Damage" prefix) ──
    const resistMatch2024 = text.match(/^Resistances\s+(.+)$/m);
    if (resistMatch2024 && resistMatch2024[1]) this.resistances = resistMatch2024[1].trim();

    // ── Immunities (2024 combines damage & condition with semicolons) ──
    // e.g. "Immunities Necrotic, Poison; Charmed, Exhaustion, Grappled, ..."
    const immuneMatch2024 = text.match(/^Immunities\s+(.+)$/m);
    if (immuneMatch2024 && immuneMatch2024[1]) {
      const immuneStr = immuneMatch2024[1].trim();
      const semiParts = immuneStr.split(';').map(s => s.trim());
      if (semiParts.length >= 2) {
        // First part = damage immunities, second part = condition immunities
        this.immunities = semiParts[0] || '';
        this.conditionImmunities = semiParts.slice(1).join('; ');
      } else {
        // No semicolons — try to heuristically split damage vs condition
        this.immunities = immuneStr;
      }
    }

    // ── Vulnerabilities ──
    const vulnMatch2024 = text.match(/^Vulnerabilities\s+(.+)$/m);
    if (vulnMatch2024 && vulnMatch2024[1]) this.vulnerabilities = vulnMatch2024[1].trim();

    // ── Senses ──
    const sensesMatch = text.match(/^Senses\s+(.+)$/m);
    if (sensesMatch && sensesMatch[1]) this.senses = sensesMatch[1].trim();

    // ── Languages ──
    const langMatch = text.match(/^Languages\s+(.+)$/m);
    if (langMatch && langMatch[1]) this.languages = langMatch[1].trim();

    // ── CR (2024: "CR 2 (XP 450; PB +2)") ──
    const crMatch = text.match(/^CR\s+([\d/]+)/m);
    if (crMatch && crMatch[1]) this.cr = crMatch[1];

    // ── Extract sections by header keywords ──
    this.parseActionSections(text);
  }

  /**
   * Parse legacy (2014 / D&D Beyond classic) statblock format.
   */
  parseLegacyStatblock(text: string, lines: string[]) {
    // Extract creature name (first line)
    if (lines.length > 0 && lines[0]) {
      this.creatureName = lines[0];
    }

    // Extract size, type, alignment
    const sizeTypeLine = text.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.+?),\s*(.+)$/m);
    if (sizeTypeLine && sizeTypeLine[1] && sizeTypeLine[2] && sizeTypeLine[3]) {
      this.size = sizeTypeLine[1] as any;
      this.type = sizeTypeLine[2].trim();
      this.alignment = sizeTypeLine[3].trim();
    }

    // Extract AC
    const acMatch = text.match(/Armor Class\s+(\d+)/i);
    if (acMatch && acMatch[1]) this.ac = acMatch[1];

    // Extract HP
    const hpMatch = text.match(/Hit Points\s+(\d+)/i);
    if (hpMatch && hpMatch[1]) this.hp = hpMatch[1];

    // Extract Hit Dice
    const hitDiceMatch = text.match(/Hit Points\s+\d+\s+\(([^)]+)\)/i);
    if (hitDiceMatch && hitDiceMatch[1]) this.hitDice = hitDiceMatch[1];

    // Extract Speed
    const speedMatch = text.match(/Speed\s+(.+?)(?:\n|STR)/i);
    if (speedMatch && speedMatch[1]) this.speed = speedMatch[1].trim();

    // Extract ability scores
    const strMatch = text.match(/STR\s*\n?\s*(\d+)/i);
    const dexMatch = text.match(/DEX\s*\n?\s*(\d+)/i);
    const conMatch = text.match(/CON\s*\n?\s*(\d+)/i);
    const intMatch = text.match(/INT\s*\n?\s*(\d+)/i);
    const wisMatch = text.match(/WIS\s*\n?\s*(\d+)/i);
    const chaMatch = text.match(/CHA\s*\n?\s*(\d+)/i);

    if (strMatch && strMatch[1]) this.str = parseInt(strMatch[1]);
    if (dexMatch && dexMatch[1]) this.dex = parseInt(dexMatch[1]);
    if (conMatch && conMatch[1]) this.con = parseInt(conMatch[1]);
    if (intMatch && intMatch[1]) this.int = parseInt(intMatch[1]);
    if (wisMatch && wisMatch[1]) this.wis = parseInt(wisMatch[1]);
    if (chaMatch && chaMatch[1]) this.cha = parseInt(chaMatch[1]);

    // Extract saving throws
    const savesMatch = text.match(/Saving Throws\s+(.+?)(?:\n|Damage|Skills|Senses)/i);
    if (savesMatch && savesMatch[1]) {
      this.saves = savesMatch[1].trim().split(',').map(s => s.trim());
    }

    // Extract skills
    const skillsMatch = text.match(/Skills\s+(.+?)(?:\n|Damage|Senses|Languages)/i);
    if (skillsMatch && skillsMatch[1]) {
      this.skills = skillsMatch[1].trim().split(',').map(s => s.trim());
    }

    // Extract vulnerabilities
    const vulnMatch = text.match(/Damage Vulnerabilities\s+(.+?)(?:\n|Damage|Condition|Senses)/i);
    if (vulnMatch && vulnMatch[1]) this.vulnerabilities = vulnMatch[1].trim();

    // Extract resistances
    const resistMatch = text.match(/Damage Resistances\s+(.+?)(?:\n|Damage|Condition|Senses)/i);
    if (resistMatch && resistMatch[1]) this.resistances = resistMatch[1].trim();

    // Extract immunities
    const immuneMatch = text.match(/Damage Immunities\s+(.+?)(?:\n|Condition|Senses|Languages)/i);
    if (immuneMatch && immuneMatch[1]) this.immunities = immuneMatch[1].trim();

    // Extract condition immunities
    const condImmuneMatch = text.match(/Condition Immunities\s+(.+?)(?:\n|Senses|Languages|Challenge)/i);
    if (condImmuneMatch && condImmuneMatch[1]) this.conditionImmunities = condImmuneMatch[1].trim();

    // Extract senses
    const sensesMatch = text.match(/Senses\s+(.+?)(?:\n|Languages|Challenge)/i);
    if (sensesMatch && sensesMatch[1]) this.senses = sensesMatch[1].trim();

    // Extract languages
    const langMatch = text.match(/Languages\s+(.+?)(?:\n|Challenge|Proficiency)/i);
    if (langMatch && langMatch[1]) this.languages = langMatch[1].trim();

    // Extract CR
    const crMatch = text.match(/Challenge\s+([\d/]+)/i);
    if (crMatch && crMatch[1]) this.cr = crMatch[1];

    // Extract traits and actions using shared section parser
    this.parseActionSections(text);
  }

  /**
   * Shared parser for traits, actions, bonus actions, reactions, and legendary actions.
   * Works with both 2024 ("Traits" header) and legacy (traits after CR line) formats.
   */
  parseActionSections(text: string) {
    // Define section headers (order matters — we split text by these)
    const sectionHeaders = ['Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions'];
    
    // Build a map of section start indices
    const sections: Array<{ name: string; start: number }> = [];
    for (const header of sectionHeaders) {
      // Match header at start of a line (exact word boundary)
      const headerRegex = new RegExp(`^${header}\\s*$`, 'm');
      const match = headerRegex.exec(text);
      if (match) {
        sections.push({ name: header, start: match.index });
      }
    }
    // Sort by position in text
    sections.sort((a, b) => a.start - b.start);

    // Extract each section's content
    const getSectionContent = (sectionName: string): string => {
      const idx = sections.findIndex(s => s.name === sectionName);
      if (idx < 0) return '';
      const sectionStart = sections[idx]!.start;
      const sectionEnd = idx + 1 < sections.length ? sections[idx + 1]!.start : text.length;
      // Strip the header line itself
      return text.substring(sectionStart, sectionEnd).replace(new RegExp(`^${sectionName}\\s*\\n`, 'i'), '').trim();
    };

    // Helper: parse "Name. Description..." patterns from a section.
    // Uses a two-pass approach: first find all entry start positions, then
    // extract each entry's description up to the next entry (or end of section).
    const parseEntries = (sectionText: string): Array<{ name: string; desc: string }> => {
      if (!sectionText) return [];
      const entries: Array<{ name: string; desc: string }> = [];

      // Find all entry start positions: "Name. " at start of line
      const entryStarts: Array<{ index: number; name: string; descStart: number }> = [];
      const startPattern = /^([A-Z][^\n.]+?)\.\s+/gm;
      let sm: RegExpExecArray | null;
      while ((sm = startPattern.exec(sectionText)) !== null) {
        entryStarts.push({ index: sm.index, name: sm[1]!.trim(), descStart: sm.index + sm[0].length });
      }

      for (let i = 0; i < entryStarts.length; i++) {
        const entry = entryStarts[i]!;
        const end = i + 1 < entryStarts.length ? entryStarts[i + 1]!.index : sectionText.length;
        const desc = sectionText.substring(entry.descStart, end).trim().replace(/\n/g, ' ');
        if (entry.name && desc) {
          entries.push({ name: entry.name, desc });
        }
      }
      return entries;
    };

    // ── Traits ──
    this.traits = [];
    const traitsContent = getSectionContent('Traits');
    if (traitsContent) {
      // 2024 format: explicit "Traits" section header
      this.traits = parseEntries(traitsContent);
    } else {
      // Legacy format: traits appear between CR line and Actions header
      const actionsIdx = sections.find(s => s.name === 'Actions')?.start ?? -1;
      const traitsSection = actionsIdx > 0 ? text.substring(0, actionsIdx) : text;
      const crIndex = text.search(/^(Challenge|CR)\s+/m);
      if (crIndex > 0) {
        // Find the end of the CR line
        const afterCR = text.indexOf('\n', crIndex);
        if (afterCR > 0) {
          const traitsText = traitsSection.substring(afterCR).trim();
          this.traits = parseEntries(traitsText).filter(
            t => !t.name.startsWith('Challenge') && !t.name.startsWith('Proficiency') && !t.name.startsWith('CR')
          );
        }
      }
    }

    // ── Actions ──
    this.actions = parseEntries(getSectionContent('Actions'));

    // ── Bonus Actions ──
    this.bonusActions = parseEntries(getSectionContent('Bonus Actions'));

    // ── Reactions ──
    this.reactions = parseEntries(getSectionContent('Reactions'));

    // ── Legendary Actions ──
    // Filter out preamble text that matches the Name. Desc pattern:
    // 2024: "Legendary Action Uses: 3 (4 in Lair). Immediately after..."
    // Legacy: "The lich can take 3 legendary actions, choosing from..."
    this.legendaryActions = parseEntries(getSectionContent('Legendary Actions')).filter(
      a => !a.name.startsWith('Legendary Action Uses')
        && !a.name.toLowerCase().includes('legendary action')
    );
  }

  refreshUI() {
    this.onOpen();
  }

  /**
   * Initialise (or re-render) the token appearance widget.
   * On edit, loads values from the existing MarkerDefinition.
   */
  private initTokenEditor(container: HTMLElement): void {
    let initial: Partial<{ icon: string; backgroundColor: string; borderColor: string; imageFile: string; imageFit: 'cover' | 'contain' }> | undefined;

    if (this.tokenEditor) {
      initial = this.tokenEditor.getValues();
    } else if (this.isEdit && this.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(this.tokenId);
      if (marker) {
        initial = {
          icon: marker.icon,
          backgroundColor: marker.backgroundColor,
          borderColor: marker.borderColor,
          imageFile: marker.imageFile,
          imageFit: marker.imageFit
        };
      }
    }

    const creatureSizeMap: Record<string, CreatureSize> = {
      'Tiny': 'tiny', 'Small': 'small', 'Medium': 'medium',
      'Large': 'large', 'Huge': 'huge', 'Gargantuan': 'gargantuan'
    };

    this.tokenEditor = new TokenEditorWidget(this.app, {
      initial,
      creatureSize: creatureSizeMap[this.size] || 'medium',
      defaultBackgroundColor: '#8b0000',
      defaultBorderColor: '#ffffff'
    });
    this.tokenEditor.render(container);
  }

  async loadCreatureData() {
    try {
      const creatureFile = this.app.vault.getAbstractFileByPath(this.originalCreaturePath);
      if (!(creatureFile instanceof TFile)) {
        new Notice("Creature file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(creatureFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read creature data!");
        return;
      }

      // Load basic properties
      this.creatureName = frontmatter.name || creatureFile.basename;
      this.originalCreatureName = this.creatureName;
      this.size = frontmatter.size || 'Medium';
      this.type = frontmatter.type || "";
      this.subtype = frontmatter.subtype || "";
      this.alignment = frontmatter.alignment || "";
      this.ac = frontmatter.ac?.toString() || "";
      this.hp = frontmatter.hp?.toString() || "";
      this.hitDice = frontmatter.hit_dice || "";
      this.speed = frontmatter.speed || "";

      // Load ability scores
      if (frontmatter.stats && Array.isArray(frontmatter.stats)) {
        [this.str, this.dex, this.con, this.int, this.wis, this.cha] = frontmatter.stats;
      }

      // Load optional fields
      this.vulnerabilities = frontmatter.damage_vulnerabilities || "";
      this.resistances = frontmatter.damage_resistances || "";
      this.immunities = frontmatter.damage_immunities || "";
      this.conditionImmunities = frontmatter.condition_immunities || "";
      this.senses = frontmatter.senses || "";
      this.languages = frontmatter.languages || "";
      this.cr = frontmatter.cr?.toString() || "";
      
      // Load token ID if exists
      this.tokenId = frontmatter.token_id || "";

      // Load saves
      if (frontmatter.saves) {
        this.saves = Object.entries(frontmatter.saves).map(([key, val]) => `${key.toUpperCase()} ${val}`);
      }

      // Load skills
      if (frontmatter.skillsaves) {
        this.skills = Object.entries(frontmatter.skillsaves).map(([key, val]) => `${key} ${val}`);
      }

      // Load traits
      if (frontmatter.traits && Array.isArray(frontmatter.traits)) {
        this.traits = frontmatter.traits.map((t: any) => ({
          name: t.name || "",
          desc: t.desc || ""
        }));
      }

      // Load actions
      if (frontmatter.actions && Array.isArray(frontmatter.actions)) {
        this.actions = frontmatter.actions.map((a: any) => ({
          name: a.name || "",
          desc: a.desc || ""
        }));
      }

      // Load description from content
      const content = await this.app.vault.read(creatureFile);
      const descMatch = content.match(/---\n\n([\s\S]*?)(?:\n```statblock|$)/);
      if (descMatch && descMatch[1]) {
        this.description = descMatch[1].trim();
      }

    } catch (error) {
      console.error("Error loading creature data:", error);
      new Notice("Error loading creature data. Check console for details.");
    }
  }

  async saveCreature() {
    if (!this.creatureName.trim()) {
      new Notice("Please enter a creature name");
      return;
    }

    try {
      const beastiaryPath = "z_Beastiarity";
      
      // Ensure beastiary folder exists
      if (!(await this.app.vault.adapter.exists(beastiaryPath))) {
        new Notice(`Beastiary folder not found at ${beastiaryPath}`);
        return;
      }

      let creaturePath: string;
      let creatureFile: TFile | null = null;

      if (this.isEdit) {
        // Editing existing creature
        creatureFile = this.app.vault.getAbstractFileByPath(this.originalCreaturePath) as TFile;
        if (!creatureFile) {
          new Notice("Original creature file not found!");
          return;
        }
        creaturePath = this.originalCreaturePath;

        // If creature name changed, rename the file
        if (this.creatureName !== this.originalCreatureName) {
          const folder = creaturePath.substring(0, creaturePath.lastIndexOf('/'));
          const newPath = `${folder}/${this.creatureName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`A creature named "${this.creatureName}" already exists!`);
            return;
          }
          
          // Delete old statblock
          await this.plugin.deleteCreatureStatblock(this.originalCreatureName);
          
          await this.app.fileManager.renameFile(creatureFile, newPath);
          creaturePath = newPath;
          creatureFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        } else {
          // Same name - delete old statblock and we'll recreate
          await this.plugin.deleteCreatureStatblock(this.originalCreatureName);
        }
      } else {
        // Creating new creature
        creaturePath = `${beastiaryPath}/${this.creatureName}.md`;

        // Check if creature already exists
        if (await this.app.vault.adapter.exists(creaturePath)) {
          new Notice(`A creature named "${this.creatureName}" already exists!`);
          return;
        }
      }

      // Create or update map token for this creature
      const now = Date.now();
      // Map creature size to CreatureSize type
      const creatureSizeMap: Record<string, CreatureSize> = {
        'Tiny': 'tiny',
        'Small': 'small',
        'Medium': 'medium',
        'Large': 'large',
        'Huge': 'huge',
        'Gargantuan': 'gargantuan'
      };
      const mappedSize = creatureSizeMap[this.size] || 'medium';
      
      if (!this.tokenId) {
        // Generate new token ID for new creatures
        this.tokenId = this.plugin.markerLibrary.generateId();
      }
      
      // Preserve existing marker fields on edit
      const existingMarker = this.plugin.markerLibrary.getMarker(this.tokenId);

      // Extract darkvision range from senses (e.g. "Darkvision 60 ft." → 60)
      let parsedDarkvision = existingMarker?.darkvision || 0;
      if (this.senses) {
        const dvMatch = this.senses.match(/darkvision\s+(\d+)\s*ft/i);
        if (dvMatch && dvMatch[1]) {
          parsedDarkvision = parseInt(dvMatch[1]);
        }
      }

      const tokenAppearance = this.tokenEditor?.getValues();
      const tokenDef: MarkerDefinition = {
        ...(existingMarker || {}),
        id: this.tokenId,
        name: this.creatureName,
        type: 'creature',
        icon: tokenAppearance?.icon ?? existingMarker?.icon ?? '',
        backgroundColor: tokenAppearance?.backgroundColor ?? existingMarker?.backgroundColor ?? '#8b0000',
        borderColor: tokenAppearance?.borderColor ?? existingMarker?.borderColor ?? '#ffffff',
        imageFile: tokenAppearance?.imageFile || undefined,
        imageFit: tokenAppearance?.imageFit !== 'cover' ? tokenAppearance?.imageFit : undefined,
        creatureSize: mappedSize,
        darkvision: parsedDarkvision,
        createdAt: existingMarker?.createdAt || now,
        updatedAt: now
      };
      await this.plugin.markerLibrary.setMarker(tokenDef);

      // Create creature content
      const creatureContent = this.createCreatureContent();

      // Create or update the file
      if (this.isEdit && creatureFile) {
        await this.app.vault.modify(creatureFile, creatureContent);
        new Notice(`Creature "${this.creatureName}" updated!`);
      } else {
        await this.app.vault.create(creaturePath, creatureContent);
        new Notice(`Creature "${this.creatureName}" created!`);
        creatureFile = this.app.vault.getAbstractFileByPath(creaturePath) as TFile;
      }

      // Save to Fantasy Statblocks plugin
      await this.saveToStatblocks();

      this.close();

      // Open the creature file
      if (creatureFile) {
        await this.app.workspace.openLinkText(creaturePath, "", false);
      }
    } catch (error) {
      console.error("Error creating/editing creature:", error);
      new Notice("Failed to save creature. Check console for details.");
    }
  }

  createCreatureContent(): string {
    // Calculate ability modifiers
    const calcMod = (score: number) => Math.floor((score - 10) / 2);
    const fageStats = [
      calcMod(this.str),
      calcMod(this.dex),
      calcMod(this.con),
      calcMod(this.int),
      calcMod(this.wis),
      calcMod(this.cha)
    ];

    // Build frontmatter
    let frontmatter = `---
statblock: true
layout: Basic 5e Layout
name: ${this.creatureName}
size: ${this.size}
type: ${this.type}`;

    if (this.subtype) {
      frontmatter += `\nsubtype: ${this.subtype}`;
    }

    frontmatter += `\nalignment: ${this.alignment}
ac: ${this.ac}
hp: ${this.hp}
hit_dice: ${this.hitDice}
speed: ${this.speed}
stats:
  - ${this.str}
  - ${this.dex}
  - ${this.con}
  - ${this.int}
  - ${this.wis}
  - ${this.cha}
fage_stats:
  - ${fageStats[0]}
  - ${fageStats[1]}
  - ${fageStats[2]}
  - ${fageStats[3]}
  - ${fageStats[4]}
  - ${fageStats[5]}`;

    // Add saves
    if (this.saves.length > 0) {
      frontmatter += `\nsaves:`;
      this.saves.forEach(save => {
        const parts = save.trim().split(/\s+/);
        if (parts.length >= 2 && parts[0]) {
          const ability = parts[0].toLowerCase().substring(0, 3);
          const bonus = parts.slice(1).join('').replace(/\+/g, '');
          frontmatter += `\n  - ${ability}: ${bonus}`;
        }
      });
    } else {
      frontmatter += `\nsaves:`;
    }

    // Add skills
    if (this.skills.length > 0) {
      frontmatter += `\nskillsaves:`;
      this.skills.forEach(skill => {
        const colonIndex = skill.indexOf(':');
        const plusIndex = skill.indexOf('+');
        const spaceIndex = skill.lastIndexOf(' ');
        
        let skillName = "";
        let bonus = "";
        
        if (colonIndex > 0) {
          skillName = skill.substring(0, colonIndex).trim();
          bonus = skill.substring(colonIndex + 1).trim().replace(/\+/g, '');
        } else if (plusIndex > 0) {
          skillName = skill.substring(0, plusIndex).trim();
          bonus = skill.substring(plusIndex).trim().replace(/\+/g, '');
        } else if (spaceIndex > 0) {
          skillName = skill.substring(0, spaceIndex).trim();
          bonus = skill.substring(spaceIndex).trim().replace(/\+/g, '');
        }
        
        if (skillName && bonus) {
          skillName = skillName.toLowerCase().replace(/\s+/g, '');
          frontmatter += `\n  - ${skillName}: ${bonus}`;
        }
      });
    } else {
      frontmatter += `\nskillsaves:`;
    }

    frontmatter += `\ndamage_vulnerabilities: ${this.vulnerabilities}`;
    frontmatter += `\ndamage_resistances: ${this.resistances}`;
    frontmatter += `\ndamage_immunities: ${this.immunities}`;
    frontmatter += `\ncondition_immunities: ${this.conditionImmunities}`;
    frontmatter += `\nsenses: ${this.senses}`;
    frontmatter += `\nlanguages: ${this.languages}`;
    frontmatter += `\ncr: ${this.cr}`;
    frontmatter += `\nspells:`;

    // Add traits
    if (this.traits.length > 0) {
      frontmatter += `\ntraits:`;
      this.traits.forEach(trait => {
        if (trait.name && trait.desc) {
          frontmatter += `\n  - name: ${trait.name}`;
          frontmatter += `\n    desc: "${trait.desc.replace(/"/g, '\\"')}"`;
        }
      });
    } else {
      frontmatter += `\ntraits:`;
    }

    // Add actions
    if (this.actions.length > 0) {
      frontmatter += `\nactions:`;
      this.actions.forEach(action => {
        if (action.name && action.desc) {
          frontmatter += `\n  - name: ${action.name}`;
          frontmatter += `\n    desc: "${action.desc.replace(/"/g, '\\"')}"`;
        }
      });
    } else {
      frontmatter += `\nactions:`;
    }

    frontmatter += `\nlegendary_actions:`;
    if (this.legendaryActions.length > 0) {
      this.legendaryActions.forEach(la => {
        if (la.name && la.desc) {
          frontmatter += `\n  - name: ${la.name}`;
          frontmatter += `\n    desc: "${la.desc.replace(/"/g, '\\"')}"`;
        }
      });
    }
    frontmatter += `\nbonus_actions:`;
    if (this.bonusActions.length > 0) {
      this.bonusActions.forEach(ba => {
        if (ba.name && ba.desc) {
          frontmatter += `\n  - name: ${ba.name}`;
          frontmatter += `\n    desc: "${ba.desc.replace(/"/g, '\\"')}"`;
        }
      });
    }
    frontmatter += `\nreactions:`;
    if (this.reactions.length > 0) {
      this.reactions.forEach(r => {
        if (r.name && r.desc) {
          frontmatter += `\n  - name: ${r.name}`;
          frontmatter += `\n    desc: "${r.desc.replace(/"/g, '\\"')}"`;
        }
      });
    }
    frontmatter += `\ntoken_id: ${this.tokenId}`;
    frontmatter += `\n---\n\n`;

    // Add description
    let content = this.description || `${this.creatureName} creature description.\n`;
    
    // Add edit/delete buttons
    content += `\n\`\`\`dataviewjs
// Action buttons for creature management
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Edit Creature button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit Creature",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-creature");
});

// Delete Creature button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete Creature",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-creature");
});
\`\`\`

`;
    
    // Add statblock
    content += `\`\`\`statblock\ncreature: ${this.creatureName}\n\`\`\`\n`;

    return frontmatter + content;
  }

  async saveToStatblocks() {
    try {
      const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
      if (!statblocksPlugin) {
        return;
      }

      // Create statblock object
      const statblock: any = {
        name: this.creatureName,
        size: this.size,
        type: this.type,
        subtype: this.subtype || undefined,
        alignment: this.alignment,
        ac: parseInt(this.ac) || 10,
        hp: parseInt(this.hp) || 1,
        hit_dice: this.hitDice,
        speed: this.speed,
        stats: [this.str, this.dex, this.con, this.int, this.wis, this.cha],
        saves: [],
        skillsaves: [],
        damage_vulnerabilities: this.vulnerabilities,
        damage_resistances: this.resistances,
        damage_immunities: this.immunities,
        condition_immunities: this.conditionImmunities,
        senses: this.senses,
        languages: this.languages,
        cr: this.cr,
        traits: this.traits.filter(t => t.name && t.desc),
        actions: this.actions.filter(a => a.name && a.desc),
        legendary_actions: this.legendaryActions.filter(a => a.name && a.desc),
        bonus_actions: this.bonusActions.filter(a => a.name && a.desc),
        reactions: this.reactions.filter(a => a.name && a.desc)
      };

      // Parse saves
      if (this.saves.length > 0) {
        this.saves.forEach(save => {
          const parts = save.split(' ');
          if (parts.length >= 2 && parts[0]) {
            const ability = parts[0].toLowerCase().substring(0, 3);
            const bonus = parts.slice(1).join(' ');
            statblock.saves.push({ [ability]: bonus });
          }
        });
      }

      // Parse skills
      if (this.skills.length > 0) {
        this.skills.forEach(skill => {
          const colonIndex = skill.indexOf(':');
          const plusIndex = skill.indexOf('+');
          const spaceIndex = skill.lastIndexOf(' ');
          
          let skillName = "";
          let bonus = "";
          
          if (colonIndex > 0) {
            skillName = skill.substring(0, colonIndex).trim();
            bonus = skill.substring(colonIndex + 1).trim();
          } else if (plusIndex > 0) {
            skillName = skill.substring(0, plusIndex).trim();
            bonus = skill.substring(plusIndex).trim();
          } else if (spaceIndex > 0) {
            skillName = skill.substring(0, spaceIndex).trim();
            bonus = skill.substring(spaceIndex).trim();
          }
          
          if (skillName && bonus) {
            skillName = skillName.toLowerCase().replace(/\s+/g, '');
            statblock.skillsaves.push({ [skillName]: bonus });
          }
        });
      }

      // Add to bestiary
      if (!statblocksPlugin.data.bestiary) {
        statblocksPlugin.data.bestiary = [];
      }

      // Remove existing entry if editing
      const existingIndex = statblocksPlugin.data.bestiary.findIndex((c: any) => c.name === this.creatureName);
      if (existingIndex !== -1) {
        statblocksPlugin.data.bestiary[existingIndex] = statblock;
      } else {
        statblocksPlugin.data.bestiary.push(statblock);
      }

      await statblocksPlugin.saveSettings();
    } catch (error) {
      console.error("Error saving to Fantasy Statblocks:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}