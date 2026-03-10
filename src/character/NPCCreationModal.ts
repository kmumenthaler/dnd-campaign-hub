import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { PDFFileSuggest, PDFBrowserModal } from "../utils/PDFBrowser";
import { MarkerDefinition, CreatureSize } from '../marker/MarkerTypes';
import { TokenEditorWidget } from '../marker/TokenEditorWidget';
import { NPC_TEMPLATE } from '../templates';

export class NPCCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  npcName = "";
  campaign = "";
  motivation = "";
  pursuit = "";
  physicalDetail = "";
  speechPattern = "";
  activeProblem = "";

  // For editing existing NPCs
  isEdit = false;
  originalNPCPath = "";
  originalNPCName = "";
  private dataLoaded = false;

  // Statblock fields (optional combat stats)
  hasStatblock = false;
  size: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan' = 'Medium';
  ac = "";
  hp = "";
  hitDice = "";
  speed = "";
  str = 10;
  dex = 10;
  con = 10;
  int = 10;
  wis = 10;
  cha = 10;
  saves: string[] = [];
  skills: string[] = [];
  vulnerabilities = "";
  resistances = "";
  immunities = "";
  conditionImmunities = "";
  senses = "";
  languages = "";
  cr = "";
  traits: Array<{name: string, desc: string}> = [];
  actions: Array<{name: string, desc: string}> = [];
  bonusActions: Array<{name: string, desc: string}> = [];
  reactions: Array<{name: string, desc: string}> = [];
  legendaryActions: Array<{name: string, desc: string}> = [];

  // Token appearance widget
  private tokenEditor: TokenEditorWidget | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, npcPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaign = plugin.settings.currentCampaign;
    if (npcPath) {
      this.isEdit = true;
      this.originalNPCPath = npcPath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Load existing NPC data once on first open (not on refreshUI)
    if (this.isEdit && !this.dataLoaded) {
      await this.loadNPCData();
      this.dataLoaded = true;
    }

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit NPC" : "👤 Create New NPC" });

    contentEl.createEl("p", {
      text: "Build your NPC's core engine with these essential questions.",
      cls: "setting-item-description"
    });

    // NPC Name
    new Setting(contentEl)
      .setName("NPC Name")
      .setDesc("What is this character's name?")
      .addText((text) => {
        text
          .setPlaceholder("e.g., Gundren Rockseeker")
          .setValue(this.npcName)
          .onChange((value) => {
            this.npcName = value;
          });
        if (!this.isEdit) text.inputEl.focus();
      });

    // Campaign Selection
    const campaigns = this.getAllCampaigns();
    new Setting(contentEl)
      .setName("Campaign")
      .setDesc("Which campaign does this NPC belong to?")
      .addDropdown((dropdown) => {
        campaigns.forEach(campaign => {
          dropdown.addOption(campaign.path, campaign.name);
        });
        dropdown.setValue(this.campaign)
          .onChange((value) => {
            this.campaign = value;
          });
      });

    contentEl.createEl("h3", { text: "🎭 Core NPC Engine" });

    // Motivation: What do they want?
    new Setting(contentEl)
      .setName("What do they want?")
      .setDesc("The NPC's primary motivation or goal")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., To reclaim their family's mine from goblin invaders")
          .setValue(this.motivation)
          .onChange((value) => {
            this.motivation = value;
          });
        text.inputEl.rows = 3;
      });

    // Pursuit: How do they pursue it?
    new Setting(contentEl)
      .setName("How do they pursue it?")
      .setDesc("Their methods, approach, or behavior in achieving their goal")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., By hiring adventurers and offering generous rewards")
          .setValue(this.pursuit)
          .onChange((value) => {
            this.pursuit = value;
          });
        text.inputEl.rows = 3;
      });

    contentEl.createEl("h3", { text: "🎨 Character Details" });

    // Physical Detail
    new Setting(contentEl)
      .setName("Physical Detail")
      .setDesc("A memorable physical characteristic or appearance note")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Scarred hands from years of mining, always wears a bronze pendant")
          .setValue(this.physicalDetail)
          .onChange((value) => {
            this.physicalDetail = value;
          });
        text.inputEl.rows = 2;
      });

    // Speech Pattern
    new Setting(contentEl)
      .setName("Speech Pattern")
      .setDesc("How do they speak? Any quirks, accents, or mannerisms?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Gruff but warm, often uses mining metaphors")
          .setValue(this.speechPattern)
          .onChange((value) => {
            this.speechPattern = value;
          });
        text.inputEl.rows = 2;
      });

    contentEl.createEl("h3", { text: "⚠️ Current Situation" });

    // Active Problem
    new Setting(contentEl)
      .setName("Active Problem")
      .setDesc("What problem or conflict is this NPC currently facing?")
      .addTextArea((text) => {
        text
          .setPlaceholder("e.g., Captured by goblins while traveling to Phandalin")
          .setValue(this.activeProblem)
          .onChange((value) => {
            this.activeProblem = value;
          });
        text.inputEl.rows = 3;
      });

    // ── Token Appearance ──
    contentEl.createEl("h3", { text: "🎨 Token Appearance" });

    const tokenContainer = contentEl.createDiv();
    this.initTokenEditor(tokenContainer);

    // ── Combat Statistics (optional statblock) ──
    contentEl.createEl("h3", { text: "⚔️ Combat Statistics (Optional)" });

    new Setting(contentEl)
      .setName("Enable Combat Stats")
      .setDesc("Add a statblock so this NPC can be used in the Initiative Tracker and Encounter Builder")
      .addToggle((toggle) => {
        toggle
          .setValue(this.hasStatblock)
          .onChange((value) => {
            this.hasStatblock = value;
            this.refreshUI();
          });
      });

    if (this.hasStatblock) {
      this.renderStatblockFields(contentEl);
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: this.isEdit ? "Update NPC" : "Create NPC",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.npcName.trim()) {
        new Notice("Please enter an NPC name!");
        return;
      }

      this.close();
      await this.createNPCFile();
    });
  }

  async loadNPCData() {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.originalNPCPath) as TFile;
      if (!file) {
        new Notice("NPC file not found!");
        return;
      }

      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      
      if (cache?.frontmatter) {
        const fm = cache.frontmatter;
        this.npcName = fm.name || file.basename;
        this.originalNPCName = this.npcName;
        this.campaign = fm.campaign ? `ttrpgs/${fm.campaign}` : this.campaign;
        this.motivation = fm.motivation || "";
        this.pursuit = fm.pursuit || "";
        this.physicalDetail = fm.physical_detail || "";
        this.speechPattern = fm.speech_pattern || "";
        this.activeProblem = fm.active_problem || "";

        // Load statblock data if present
        if (fm.statblock === true) {
          this.hasStatblock = true;
          this.size = fm.size || 'Medium';
          this.ac = fm.ac?.toString() || "";
          this.hp = fm.hp?.toString() || "";
          this.hitDice = fm.hit_dice || "";
          this.speed = fm.speed || "";
          this.cr = fm.cr?.toString() || "";
          this.vulnerabilities = fm.damage_vulnerabilities || "";
          this.resistances = fm.damage_resistances || "";
          this.immunities = fm.damage_immunities || "";
          this.conditionImmunities = fm.condition_immunities || "";
          this.senses = fm.senses || "";
          this.languages = fm.languages || "";

          if (Array.isArray(fm.stats) && fm.stats.length >= 6) {
            [this.str, this.dex, this.con, this.int, this.wis, this.cha] = fm.stats;
          }
          if (fm.saves && typeof fm.saves === 'object' && !Array.isArray(fm.saves)) {
            this.saves = Object.entries(fm.saves).map(([key, val]) => `${key.toUpperCase()} ${val}`);
          } else if (Array.isArray(fm.saves)) {
            this.saves = fm.saves.map((s: any) => {
              if (typeof s === 'string') return s;
              const entries = Object.entries(s);
              return entries.length > 0 ? `${entries[0]![0].toUpperCase()} ${entries[0]![1]}` : '';
            }).filter((s: string) => s);
          }
          if (fm.skillsaves && typeof fm.skillsaves === 'object' && !Array.isArray(fm.skillsaves)) {
            this.skills = Object.entries(fm.skillsaves).map(([key, val]) => `${key} ${val}`);
          } else if (Array.isArray(fm.skillsaves)) {
            this.skills = fm.skillsaves.map((s: any) => {
              if (typeof s === 'string') return s;
              const entries = Object.entries(s);
              return entries.length > 0 ? `${entries[0]![0]} ${entries[0]![1]}` : '';
            }).filter((s: string) => s);
          }
          if (Array.isArray(fm.traits)) {
            this.traits = fm.traits.map((t: any) => ({ name: t.name || "", desc: t.desc || "" }));
          }
          if (Array.isArray(fm.actions)) {
            this.actions = fm.actions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
          }
          if (Array.isArray(fm.bonus_actions)) {
            this.bonusActions = fm.bonus_actions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
          }
          if (Array.isArray(fm.reactions)) {
            this.reactions = fm.reactions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
          }
          if (Array.isArray(fm.legendary_actions)) {
            this.legendaryActions = fm.legendary_actions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
          }
        }
      }

    } catch (error) {
      console.error("Error loading NPC data:", error);
      new Notice("Error loading NPC data. Check console for details.");
    }
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
      // Preserve user's in-progress edits across refreshUI()
      initial = this.tokenEditor.getValues();
    } else if (this.isEdit) {
      // First open in edit mode — read from existing marker
      const file = this.app.vault.getAbstractFileByPath(this.originalNPCPath) as TFile;
      if (file) {
        const cache = this.app.metadataCache.getFileCache(file);
        const tokenId = cache?.frontmatter?.token_id;
        if (tokenId) {
          const marker = this.plugin.markerLibrary.getMarker(tokenId);
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
      }
    }

    const creatureSizeMap: Record<string, CreatureSize> = {
      'Tiny': 'tiny', 'Small': 'small', 'Medium': 'medium',
      'Large': 'large', 'Huge': 'huge', 'Gargantuan': 'gargantuan'
    };

    this.tokenEditor = new TokenEditorWidget(this.app, {
      initial,
      creatureSize: this.hasStatblock ? (creatureSizeMap[this.size] || 'medium') : 'medium',
      defaultBackgroundColor: '#6b8e23',
      defaultBorderColor: '#ffffff'
    });
    this.tokenEditor.render(container);
  }

  renderStatblockFields(contentEl: HTMLElement) {
    // ── Import Section ──
    const importContainer = contentEl.createDiv({ cls: "npc-statblock-import" });
    importContainer.style.marginBottom = "15px";

    // Copy from existing creature (searchable)
    const copyRow = importContainer.createDiv({ attr: { style: "display: flex; gap: 10px; margin-bottom: 10px; align-items: center;" } });
    const searchWrapper = copyRow.createDiv({ cls: "dnd-creature-search-container", attr: { style: "flex: 1; position: relative;" } });
    const searchInput = searchWrapper.createEl("input", {
      type: "text",
      placeholder: "Search creatures to copy from...",
      cls: "dnd-creature-search-input",
      attr: { style: "width: 100%; padding: 6px;" }
    });
    const searchResults = searchWrapper.createDiv({ cls: "dnd-creature-search-results" });
    searchResults.style.display = "none";

    let selectedCreaturePath = "";
    let allCreatures: Array<{ name: string; path: string; hp: number; ac: number; cr?: string }> = [];

    // Load creatures async
    this.plugin.encounterBuilder.loadAllCreatures().then((creatures) => {
      allCreatures = creatures;
    });

    const showResults = (query: string) => {
      if (!query || query.length < 1) { searchResults.style.display = "none"; return; }
      const q = query.toLowerCase().trim();
      const filtered = allCreatures.filter(c => c.name.toLowerCase().includes(q)).slice(0, 10);
      searchResults.empty();
      if (filtered.length === 0) {
        searchResults.createEl("div", { text: "No creatures found", cls: "dnd-creature-search-no-results" });
      } else {
        for (const creature of filtered) {
          const row = searchResults.createDiv({ cls: "dnd-creature-search-result" });
          row.createDiv({ cls: "dnd-creature-search-result-name", text: creature.name });
          const parts: string[] = [];
          if (creature.cr) parts.push(`CR ${creature.cr}`);
          parts.push(`HP ${creature.hp}`, `AC ${creature.ac}`);
          row.createDiv({ cls: "dnd-creature-search-result-stats", text: parts.join(" | ") });
          row.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedCreaturePath = creature.path;
            searchInput.value = creature.name;
            searchResults.style.display = "none";
          });
        }
      }
      searchResults.style.display = "block";
    };

    searchInput.addEventListener("input", (e) => {
      selectedCreaturePath = "";
      showResults((e.target as HTMLInputElement).value);
    });
    searchInput.addEventListener("focus", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v.length >= 1) showResults(v);
    });
    searchInput.addEventListener("blur", () => setTimeout(() => { searchResults.style.display = "none"; }, 250));

    const copyBtn = copyRow.createEl("button", { text: "📋 Copy Stats" });
    copyBtn.addEventListener("click", async () => {
      if (!selectedCreaturePath) {
        new Notice("Search and select a creature to copy from");
        return;
      }
      await this.copyFromCreature(selectedCreaturePath);
      this.refreshUI();
      new Notice("Statblock copied! Review and adjust fields below.");
    });

    // Parse statblock text
    const importTextArea = importContainer.createEl("textarea", {
      placeholder: "Or paste a statblock here (supports 2014 & 2024 formats)...",
      attr: { rows: "6", style: "width: 100%; margin-bottom: 8px;" }
    });

    const parseBtn = importContainer.createEl("button", {
      text: "📥 Parse Statblock",
      cls: "mod-cta"
    });
    parseBtn.addEventListener("click", () => {
      this.parseStatblockText(importTextArea.value);
      this.refreshUI();
      new Notice("Statblock parsed! Review and adjust fields below.");
    });

    contentEl.createEl("hr");

    // ── Basic Combat Stats ──
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
          .onChange((value) => { this.size = value as any; })
      );

    new Setting(contentEl)
      .setName("Armor Class")
      .addText((text) =>
        text.setPlaceholder("15").setValue(this.ac).onChange((value) => { this.ac = value; })
      );

    new Setting(contentEl)
      .setName("Hit Points")
      .addText((text) =>
        text.setPlaceholder("52").setValue(this.hp).onChange((value) => { this.hp = value; })
      );

    new Setting(contentEl)
      .setName("Hit Dice")
      .setDesc("Format: XdY + Z (e.g., 8d8 + 16)")
      .addText((text) =>
        text.setPlaceholder("8d8 + 16").setValue(this.hitDice).onChange((value) => { this.hitDice = value; })
      );

    new Setting(contentEl)
      .setName("Speed")
      .addText((text) =>
        text.setPlaceholder("30 ft.").setValue(this.speed).onChange((value) => { this.speed = value; })
      );

    // ── Ability Scores ──
    contentEl.createEl("h4", { text: "Ability Scores" });
    const abilityGrid = contentEl.createDiv();
    abilityGrid.style.display = "grid";
    abilityGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
    abilityGrid.style.gap = "10px";

    this.createAbilityScore(abilityGrid, "STR", this.str, (val) => this.str = val);
    this.createAbilityScore(abilityGrid, "DEX", this.dex, (val) => this.dex = val);
    this.createAbilityScore(abilityGrid, "CON", this.con, (val) => this.con = val);
    this.createAbilityScore(abilityGrid, "INT", this.int, (val) => this.int = val);
    this.createAbilityScore(abilityGrid, "WIS", this.wis, (val) => this.wis = val);
    this.createAbilityScore(abilityGrid, "CHA", this.cha, (val) => this.cha = val);

    // ── Additional Stats ──
    contentEl.createEl("h4", { text: "Additional Statistics" });

    new Setting(contentEl)
      .setName("Challenge Rating")
      .addText((text) =>
        text.setPlaceholder("3").setValue(this.cr).onChange((value) => { this.cr = value; })
      );

    new Setting(contentEl)
      .setName("Saving Throws")
      .setDesc("Comma-separated (e.g., WIS +5, CON +4)")
      .addText((text) =>
        text.setPlaceholder("WIS +5").setValue(this.saves.join(", ")).onChange((value) => {
          this.saves = value ? value.split(",").map(s => s.trim()) : [];
        })
      );

    new Setting(contentEl)
      .setName("Skills")
      .setDesc("Comma-separated (e.g., Perception +5, Stealth +6)")
      .addText((text) =>
        text.setPlaceholder("Perception +5").setValue(this.skills.join(", ")).onChange((value) => {
          this.skills = value ? value.split(",").map(s => s.trim()) : [];
        })
      );

    new Setting(contentEl)
      .setName("Damage Vulnerabilities")
      .addText((text) =>
        text.setPlaceholder("Fire").setValue(this.vulnerabilities).onChange((value) => { this.vulnerabilities = value; })
      );

    new Setting(contentEl)
      .setName("Damage Resistances")
      .addText((text) =>
        text.setPlaceholder("Lightning, Poison").setValue(this.resistances).onChange((value) => { this.resistances = value; })
      );

    new Setting(contentEl)
      .setName("Damage Immunities")
      .addText((text) =>
        text.setPlaceholder("Poison, Cold").setValue(this.immunities).onChange((value) => { this.immunities = value; })
      );

    new Setting(contentEl)
      .setName("Condition Immunities")
      .addText((text) =>
        text.setPlaceholder("Poisoned").setValue(this.conditionImmunities).onChange((value) => { this.conditionImmunities = value; })
      );

    new Setting(contentEl)
      .setName("Senses")
      .addText((text) =>
        text.setPlaceholder("Darkvision 60 ft.").setValue(this.senses).onChange((value) => { this.senses = value; })
      );

    new Setting(contentEl)
      .setName("Languages")
      .addText((text) =>
        text.setPlaceholder("Common, Elvish").setValue(this.languages).onChange((value) => { this.languages = value; })
      );

    // ── Traits ──
    contentEl.createEl("h4", { text: "Traits & Features" });
    const traitsContainer = contentEl.createDiv();
    this.renderFeatureList(traitsContainer, this.traits, "Trait");
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("+ Add Trait").onClick(() => { this.traits.push({ name: "", desc: "" }); this.refreshUI(); })
    );

    // ── Actions ──
    contentEl.createEl("h4", { text: "Actions" });
    const actionsContainer = contentEl.createDiv();
    this.renderFeatureList(actionsContainer, this.actions, "Action");
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("+ Add Action").onClick(() => { this.actions.push({ name: "", desc: "" }); this.refreshUI(); })
    );
  }

  createAbilityScore(container: HTMLElement, ability: string, value: number, onChange: (val: number) => void) {
    const div = container.createDiv();
    div.createEl("label", { text: ability, attr: { style: "font-weight: bold;" } });
    const input = div.createEl("input", {
      type: "number",
      value: value.toString(),
      attr: { min: "1", max: "30", style: "width: 100%;" }
    });
    const mod = Math.floor((value - 10) / 2);
    const modText = div.createEl("span", {
      text: ` (${mod >= 0 ? '+' : ''}${mod})`,
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
      const div = container.createDiv({ attr: { style: "margin-bottom: 15px; padding: 10px; border: 1px solid #ccc; border-radius: 4px;" } });
      new Setting(div)
        .setName(`${type} Name`)
        .addText((text) => text.setPlaceholder("Feature name").setValue(feature.name).onChange((v) => { feature.name = v; }));
      new Setting(div)
        .setName(`${type} Description`)
        .addTextArea((text) => {
          text.setPlaceholder("Feature description...").setValue(feature.desc).onChange((v) => { feature.desc = v; });
          text.inputEl.rows = 3;
          text.inputEl.style.width = "100%";
        });
      new Setting(div).addButton((btn) =>
        btn.setButtonText("Remove").setWarning().onClick(() => { features.splice(index, 1); this.refreshUI(); })
      );
    });
  }

  async copyFromCreature(creaturePath: string) {
    try {
      const file = this.app.vault.getAbstractFileByPath(creaturePath);
      if (!(file instanceof TFile)) {
        new Notice("Creature file not found");
        return;
      }
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) {
        new Notice("Could not read creature data");
        return;
      }

      this.size = fm.size || 'Medium';
      this.ac = fm.ac?.toString() || "";
      this.hp = fm.hp?.toString() || "";
      this.hitDice = fm.hit_dice || "";
      this.speed = fm.speed || "";
      this.cr = fm.cr?.toString() || "";
      this.vulnerabilities = fm.damage_vulnerabilities || "";
      this.resistances = fm.damage_resistances || "";
      this.immunities = fm.damage_immunities || "";
      this.conditionImmunities = fm.condition_immunities || "";
      this.senses = fm.senses || "";
      this.languages = fm.languages || "";

      if (Array.isArray(fm.stats) && fm.stats.length >= 6) {
        [this.str, this.dex, this.con, this.int, this.wis, this.cha] = fm.stats;
      }
      if (fm.saves) {
        if (typeof fm.saves === 'object' && !Array.isArray(fm.saves)) {
          this.saves = Object.entries(fm.saves).map(([k, v]) => `${k.toUpperCase()} ${v}`);
        } else if (Array.isArray(fm.saves)) {
          this.saves = fm.saves.map((s: any) => {
            if (typeof s === 'string') return s;
            const e = Object.entries(s);
            return e.length > 0 ? `${e[0]![0].toUpperCase()} ${e[0]![1]}` : '';
          }).filter((s: string) => s);
        }
      }
      if (fm.skillsaves) {
        if (typeof fm.skillsaves === 'object' && !Array.isArray(fm.skillsaves)) {
          this.skills = Object.entries(fm.skillsaves).map(([k, v]) => `${k} ${v}`);
        } else if (Array.isArray(fm.skillsaves)) {
          this.skills = fm.skillsaves.map((s: any) => {
            if (typeof s === 'string') return s;
            const e = Object.entries(s);
            return e.length > 0 ? `${e[0]![0]} ${e[0]![1]}` : '';
          }).filter((s: string) => s);
        }
      }
      if (Array.isArray(fm.traits)) this.traits = fm.traits.map((t: any) => ({ name: t.name || "", desc: t.desc || "" }));
      if (Array.isArray(fm.actions)) this.actions = fm.actions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
      if (Array.isArray(fm.bonus_actions)) this.bonusActions = fm.bonus_actions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
      if (Array.isArray(fm.reactions)) this.reactions = fm.reactions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
      if (Array.isArray(fm.legendary_actions)) this.legendaryActions = fm.legendary_actions.map((a: any) => ({ name: a.name || "", desc: a.desc || "" }));
    } catch (error) {
      console.error("Error copying creature statblock:", error);
      new Notice("Error copying creature data.");
    }
  }

  parseStatblockText(text: string) {
    if (!text || text.trim().length === 0) {
      new Notice("Please paste a statblock first");
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const is2024 = /^AC\s+\d+/m.test(text) || /^HP\s+\d+/m.test(text) || /^CR\s+[\d/]+/m.test(text);

    if (is2024) {
      this.parse2024Statblock(text, lines);
    } else {
      this.parseLegacyStatblock(text, lines);
    }
  }

  parse2024Statblock(text: string, _lines: string[]) {
    // Size, type, alignment
    const sizeTypeLine = text.match(/^((?:(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\s*(?:Or\s+)?)+)\s+(.+?),\s*(.+)$/m);
    if (sizeTypeLine?.[1]) {
      const firstSize = sizeTypeLine[1].trim().match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)/);
      if (firstSize?.[1]) this.size = firstSize[1] as any;
    }

    const acMatch = text.match(/^AC\s+(\d+)/m);
    if (acMatch?.[1]) this.ac = acMatch[1];

    const hpMatch = text.match(/^HP\s+(\d+)/m);
    if (hpMatch?.[1]) this.hp = hpMatch[1];

    const hitDiceMatch = text.match(/^HP\s+\d+\s+\(([^)]+)\)/m);
    if (hitDiceMatch?.[1]) this.hitDice = hitDiceMatch[1];

    const speedMatch = text.match(/^Speed\s+(.+)$/m);
    if (speedMatch?.[1]) this.speed = speedMatch[1].trim();

    // Ability scores (2024 tabular)
    const abilityPattern = /^(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)\s+([+-]?\d+)\s+([+-]?\d+)/gm;
    const abilityMods: Record<string, number> = {};
    const abilitySaves: Record<string, number> = {};
    let am: RegExpExecArray | null;
    while ((am = abilityPattern.exec(text)) !== null) {
      const ability = am[1]?.toUpperCase();
      const score = parseInt(am[2] || '10');
      const mod = parseInt(am[3] || '0');
      const save = parseInt(am[4] || '0');
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

    this.saves = [];
    for (const [ability, save] of Object.entries(abilitySaves)) {
      const mod = abilityMods[ability] ?? 0;
      if (save !== mod) {
        const sign = save >= 0 ? '+' : '';
        this.saves.push(`${ability.charAt(0)}${ability.slice(1).toLowerCase()} ${sign}${save}`);
      }
    }

    const skillsMatch = text.match(/^Skills\s+(.+)$/m);
    if (skillsMatch?.[1]) this.skills = skillsMatch[1].trim().split(',').map(s => s.trim());

    const resistMatch = text.match(/^Resistances\s+(.+)$/m);
    if (resistMatch?.[1]) this.resistances = resistMatch[1].trim();

    const immuneMatch = text.match(/^Immunities\s+(.+)$/m);
    if (immuneMatch?.[1]) {
      const parts = immuneMatch[1].trim().split(';').map(s => s.trim());
      if (parts.length >= 2) {
        this.immunities = parts[0] || '';
        this.conditionImmunities = parts.slice(1).join('; ');
      } else {
        this.immunities = immuneMatch[1].trim();
      }
    }

    const vulnMatch = text.match(/^Vulnerabilities\s+(.+)$/m);
    if (vulnMatch?.[1]) this.vulnerabilities = vulnMatch[1].trim();

    const sensesMatch = text.match(/^Senses\s+(.+)$/m);
    if (sensesMatch?.[1]) this.senses = sensesMatch[1].trim();

    const langMatch = text.match(/^Languages\s+(.+)$/m);
    if (langMatch?.[1]) this.languages = langMatch[1].trim();

    const crMatch = text.match(/^CR\s+([\d/]+)/m);
    if (crMatch?.[1]) this.cr = crMatch[1];

    this.parseActionSections(text);
  }

  parseLegacyStatblock(text: string, _lines: string[]) {
    const sizeTypeLine = text.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.+?),\s*(.+)$/m);
    if (sizeTypeLine?.[1]) this.size = sizeTypeLine[1] as any;

    const acMatch = text.match(/Armor Class\s+(\d+)/i);
    if (acMatch?.[1]) this.ac = acMatch[1];

    const hpMatch = text.match(/Hit Points\s+(\d+)/i);
    if (hpMatch?.[1]) this.hp = hpMatch[1];

    const hitDiceMatch = text.match(/Hit Points\s+\d+\s+\(([^)]+)\)/i);
    if (hitDiceMatch?.[1]) this.hitDice = hitDiceMatch[1];

    const speedMatch = text.match(/Speed\s+(.+?)(?:\n|STR)/i);
    if (speedMatch?.[1]) this.speed = speedMatch[1].trim();

    const strMatch = text.match(/STR\s*\n?\s*(\d+)/i);
    const dexMatch = text.match(/DEX\s*\n?\s*(\d+)/i);
    const conMatch = text.match(/CON\s*\n?\s*(\d+)/i);
    const intMatch = text.match(/INT\s*\n?\s*(\d+)/i);
    const wisMatch = text.match(/WIS\s*\n?\s*(\d+)/i);
    const chaMatch = text.match(/CHA\s*\n?\s*(\d+)/i);

    if (strMatch?.[1]) this.str = parseInt(strMatch[1]);
    if (dexMatch?.[1]) this.dex = parseInt(dexMatch[1]);
    if (conMatch?.[1]) this.con = parseInt(conMatch[1]);
    if (intMatch?.[1]) this.int = parseInt(intMatch[1]);
    if (wisMatch?.[1]) this.wis = parseInt(wisMatch[1]);
    if (chaMatch?.[1]) this.cha = parseInt(chaMatch[1]);

    const savesMatch = text.match(/Saving Throws\s+(.+?)(?:\n|Damage|Skills|Senses)/i);
    if (savesMatch?.[1]) this.saves = savesMatch[1].trim().split(',').map(s => s.trim());

    const skillsMatch = text.match(/Skills\s+(.+?)(?:\n|Damage|Senses|Languages)/i);
    if (skillsMatch?.[1]) this.skills = skillsMatch[1].trim().split(',').map(s => s.trim());

    const vulnMatch = text.match(/Damage Vulnerabilities\s+(.+?)(?:\n|Damage|Condition|Senses)/i);
    if (vulnMatch?.[1]) this.vulnerabilities = vulnMatch[1].trim();

    const resistMatch = text.match(/Damage Resistances\s+(.+?)(?:\n|Damage|Condition|Senses)/i);
    if (resistMatch?.[1]) this.resistances = resistMatch[1].trim();

    const immuneMatch = text.match(/Damage Immunities\s+(.+?)(?:\n|Condition|Senses|Languages)/i);
    if (immuneMatch?.[1]) this.immunities = immuneMatch[1].trim();

    const condImmuneMatch = text.match(/Condition Immunities\s+(.+?)(?:\n|Senses|Languages|Challenge)/i);
    if (condImmuneMatch?.[1]) this.conditionImmunities = condImmuneMatch[1].trim();

    const sensesMatch = text.match(/Senses\s+(.+?)(?:\n|Languages|Challenge)/i);
    if (sensesMatch?.[1]) this.senses = sensesMatch[1].trim();

    const langMatch = text.match(/Languages\s+(.+?)(?:\n|Challenge|Proficiency)/i);
    if (langMatch?.[1]) this.languages = langMatch[1].trim();

    const crMatch = text.match(/Challenge\s+([\d/]+)/i);
    if (crMatch?.[1]) this.cr = crMatch[1];

    this.parseActionSections(text);
  }

  parseActionSections(text: string) {
    const sectionHeaders = ['Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions'];
    const sections: Array<{ name: string; start: number }> = [];
    for (const header of sectionHeaders) {
      const match = new RegExp(`^${header}\\s*$`, 'm').exec(text);
      if (match) sections.push({ name: header, start: match.index });
    }
    sections.sort((a, b) => a.start - b.start);

    const getSectionContent = (name: string): string => {
      const idx = sections.findIndex(s => s.name === name);
      if (idx < 0) return '';
      const start = sections[idx]!.start;
      const end = idx + 1 < sections.length ? sections[idx + 1]!.start : text.length;
      return text.substring(start, end).replace(new RegExp(`^${name}\\s*\\n`, 'i'), '').trim();
    };

    const parseEntries = (sectionText: string): Array<{ name: string; desc: string }> => {
      if (!sectionText) return [];
      const entries: Array<{ name: string; desc: string }> = [];
      const starts: Array<{ index: number; name: string; descStart: number }> = [];
      const pattern = /^([A-Z][^\n.]+?)\.\s+/gm;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(sectionText)) !== null) {
        starts.push({ index: m.index, name: m[1]!.trim(), descStart: m.index + m[0].length });
      }
      for (let i = 0; i < starts.length; i++) {
        const entry = starts[i]!;
        const end = i + 1 < starts.length ? starts[i + 1]!.index : sectionText.length;
        const desc = sectionText.substring(entry.descStart, end).trim().replace(/\n/g, ' ');
        if (entry.name && desc) entries.push({ name: entry.name, desc });
      }
      return entries;
    };

    // Traits
    this.traits = [];
    const traitsContent = getSectionContent('Traits');
    if (traitsContent) {
      this.traits = parseEntries(traitsContent);
    } else {
      const actionsIdx = sections.find(s => s.name === 'Actions')?.start ?? -1;
      const traitsSection = actionsIdx > 0 ? text.substring(0, actionsIdx) : text;
      const crIndex = text.search(/^(Challenge|CR)\s+/m);
      if (crIndex > 0) {
        const afterCR = text.indexOf('\n', crIndex);
        if (afterCR > 0) {
          const traitsText = traitsSection.substring(afterCR).trim();
          this.traits = parseEntries(traitsText).filter(
            t => !t.name.startsWith('Challenge') && !t.name.startsWith('Proficiency') && !t.name.startsWith('CR')
          );
        }
      }
    }

    this.actions = parseEntries(getSectionContent('Actions'));
    this.bonusActions = parseEntries(getSectionContent('Bonus Actions'));
    this.reactions = parseEntries(getSectionContent('Reactions'));
    this.legendaryActions = parseEntries(getSectionContent('Legendary Actions')).filter(
      a => !a.name.startsWith('Legendary Action Uses') && !a.name.toLowerCase().includes('legendary action')
    );
  }

  getAllCampaigns(): Array<{ path: string; name: string }> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const campaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      ttrpgsFolder.children.forEach((child) => {
        if (child instanceof TFolder) {
          campaigns.push({
            path: child.path,
            name: child.name
          });
        }
      });
    }

    return campaigns;
  }

  async createNPCFile() {
    const campaignName = this.campaign.split('/').pop() || "Unknown";
    const npcPath = `${this.campaign}/NPCs`;
    
    new Notice(this.isEdit ? `Updating NPC "${this.npcName}"...` : `Creating NPC "${this.npcName}"...`);

    try {
      await this.plugin.ensureFolderExists(npcPath);

      // Get world info from campaign World.md
      const worldFile = this.app.vault.getAbstractFileByPath(`${this.campaign}/World.md`);
      let worldName = campaignName;
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const worldMatch = worldContent.match(/^world:\s*(.+)$/m);
        if (worldMatch && worldMatch[1]) {
          worldName = worldMatch[1].trim();
        }
      }

      // Map size for token
      const creatureSizeMap: Record<string, CreatureSize> = {
        'Tiny': 'tiny', 'Small': 'small', 'Medium': 'medium',
        'Large': 'large', 'Huge': 'huge', 'Gargantuan': 'gargantuan'
      };
      const mappedSize = this.hasStatblock ? (creatureSizeMap[this.size] || 'medium') : 'medium';

      // Parse darkvision from senses
      let darkvision = 0;
      if (this.hasStatblock && this.senses) {
        const dvMatch = this.senses.match(/darkvision\s+(\d+)\s*ft/i);
        if (dvMatch?.[1]) darkvision = parseInt(dvMatch[1]);
      }

      let tokenId: string;
      let npcFile: TFile | null = null;
      let filePath: string;

      if (this.isEdit) {
        // Editing existing NPC
        npcFile = this.app.vault.getAbstractFileByPath(this.originalNPCPath) as TFile;
        if (!npcFile) {
          new Notice("Original NPC file not found!");
          return;
        }
        
        // Get existing token ID from frontmatter
        const cache = this.app.metadataCache.getFileCache(npcFile);
        tokenId = cache?.frontmatter?.token_id || this.plugin.markerLibrary.generateId();
        
        filePath = this.originalNPCPath;

        // If NPC name changed, rename the file
        if (this.npcName !== this.originalNPCName) {
          const folder = filePath.substring(0, filePath.lastIndexOf('/'));
          const newPath = `${folder}/${this.npcName}.md`;
          
          // Check if new name conflicts
          if (await this.app.vault.adapter.exists(newPath)) {
            new Notice(`An NPC named "${this.npcName}" already exists!`);
            return;
          }

          // Delete old statblock from Fantasy Statblocks plugin if name changed
          if (this.hasStatblock) {
            await this.plugin.deleteCreatureStatblock(this.originalNPCName);
          }
          
          await this.app.fileManager.renameFile(npcFile, newPath);
          filePath = newPath;
          npcFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        }
        
        // Update the map token using widget values + computed fields
        const now = Date.now();
        const existingMarker = this.plugin.markerLibrary.getMarker(tokenId);
        const tokenAppearance = this.tokenEditor?.getValues();
        const tokenDef: MarkerDefinition = {
          ...(existingMarker || {}),
          id: tokenId,
          name: this.npcName,
          type: 'npc',
          icon: tokenAppearance?.icon ?? existingMarker?.icon ?? '',
          backgroundColor: tokenAppearance?.backgroundColor ?? existingMarker?.backgroundColor ?? '#6b8e23',
          borderColor: tokenAppearance?.borderColor ?? existingMarker?.borderColor ?? '#ffffff',
          imageFile: tokenAppearance?.imageFile || undefined,
          imageFit: tokenAppearance?.imageFit !== 'cover' ? tokenAppearance?.imageFit : undefined,
          creatureSize: mappedSize,
          darkvision: darkvision || existingMarker?.darkvision || 0,
          campaign: campaignName,
          createdAt: existingMarker?.createdAt || now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);

        // Update frontmatter via processFrontMatter for statblock fields
        if (npcFile) {
          await this.app.fileManager.processFrontMatter(npcFile, (fm) => {
            fm.name = this.npcName;
            fm.motivation = this.motivation;
            fm.pursuit = this.pursuit;
            fm.physical_detail = this.physicalDetail;
            fm.speech_pattern = this.speechPattern;
            fm.active_problem = this.activeProblem;

            if (this.hasStatblock) {
              fm.statblock = true;
              fm.size = this.size;
              fm.ac = parseInt(this.ac) || 10;
              fm.hp = parseInt(this.hp) || 1;
              fm.hit_dice = this.hitDice;
              fm.speed = this.speed;
              fm.stats = [this.str, this.dex, this.con, this.int, this.wis, this.cha];
              fm.cr = this.cr;
              fm.damage_vulnerabilities = this.vulnerabilities;
              fm.damage_resistances = this.resistances;
              fm.damage_immunities = this.immunities;
              fm.condition_immunities = this.conditionImmunities;
              fm.senses = this.senses;
              fm.languages = this.languages;
              fm.saves = this.buildSavesObj();
              fm.skillsaves = this.buildSkillsObj();
              fm.traits = this.traits.filter(t => t.name && t.desc);
              fm.actions = this.actions.filter(a => a.name && a.desc);
              fm.bonus_actions = this.bonusActions.filter(a => a.name && a.desc);
              fm.reactions = this.reactions.filter(a => a.name && a.desc);
              fm.legendary_actions = this.legendaryActions.filter(a => a.name && a.desc);
            } else {
              fm.statblock = "";
              // Clean up statblock fields when removing
              delete fm.size;
              delete fm.ac;
              delete fm.hp;
              delete fm.hit_dice;
              delete fm.speed;
              delete fm.stats;
              delete fm.fage_stats;
              delete fm.cr;
              delete fm.damage_vulnerabilities;
              delete fm.damage_resistances;
              delete fm.damage_immunities;
              delete fm.condition_immunities;
              delete fm.senses;
              delete fm.languages;
              delete fm.saves;
              delete fm.skillsaves;
              delete fm.traits;
              delete fm.actions;
              delete fm.bonus_actions;
              delete fm.reactions;
              delete fm.legendary_actions;
            }
          });

          // Remove statblock render block if statblock was disabled
          if (!this.hasStatblock) {
            let content = await this.app.vault.read(npcFile);
            if (content.includes('```statblock\ncreature:')) {
              content = content.replace(
                /```statblock\ncreature: .+\n```/,
                '```statblock\n# Leave empty or add stat block here\n```'
              );
              await this.app.vault.modify(npcFile, content);
            }
            // Remove from Fantasy Statblocks plugin
            await this.plugin.deleteCreatureStatblock(this.npcName);
          }

          // Add or update statblock render block in body if statblock is enabled
          if (this.hasStatblock) {
            let content = await this.app.vault.read(npcFile);
            if (!content.includes('```statblock\ncreature:')) {
              // Replace the placeholder statblock section
              content = content.replace(
                /```statblock\n# Leave empty or add stat block here\n```/,
                `\`\`\`statblock\ncreature: ${this.npcName}\n\`\`\``
              );
              await this.app.vault.modify(npcFile, content);
            } else if (this.npcName !== this.originalNPCName) {
              // Update creature name in statblock render block
              content = content.replace(
                /```statblock\ncreature: .+\n```/,
                `\`\`\`statblock\ncreature: ${this.npcName}\n\`\`\``
              );
              await this.app.vault.modify(npcFile, content);
            }
          }
        }

        // Save to Fantasy Statblocks plugin
        if (this.hasStatblock) {
          await this.saveToStatblocks();
        }

        new Notice(`✅ NPC "${this.npcName}" updated successfully!`);
      } else {
        // Creating new NPC
        filePath = `${npcPath}/${this.npcName}.md`;

        // Check if NPC already exists BEFORE creating token
        if (await this.app.vault.adapter.exists(filePath)) {
          new Notice(`An NPC named "${this.npcName}" already exists!`);
          return;
        }

        // Create a map token for this NPC using widget values
        const now = Date.now();
        tokenId = this.plugin.markerLibrary.generateId();
        const tokenAppearance = this.tokenEditor?.getValues();
        const tokenDef: MarkerDefinition = {
          id: tokenId,
          name: this.npcName,
          type: 'npc',
          icon: tokenAppearance?.icon ?? '',
          backgroundColor: tokenAppearance?.backgroundColor ?? '#6b8e23',
          borderColor: tokenAppearance?.borderColor ?? '#ffffff',
          imageFile: tokenAppearance?.imageFile || undefined,
          imageFit: tokenAppearance?.imageFit !== 'cover' ? tokenAppearance?.imageFit : undefined,
          creatureSize: mappedSize,
          darkvision,
          campaign: campaignName,
          createdAt: now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);

        // Build NPC content from template
        let npcContent = NPC_TEMPLATE;

        // Get current date
        const currentDate = new Date().toISOString().split('T')[0];

        // Replace placeholders in template
        npcContent = npcContent
          .replace(/name: $/m, `name: ${this.npcName}`)
          .replace(/world: $/m, `world: ${worldName}`)
          .replace(/campaign: $/m, `campaign: ${campaignName}`)
          .replace(/date: $/m, `date: ${currentDate}\ntoken_id: ${tokenId}`)
          .replace(/motivation: $/m, `motivation: "${this.motivation}"`)
          .replace(/pursuit: $/m, `pursuit: "${this.pursuit}"`)
          .replace(/physical_detail: $/m, `physical_detail: "${this.physicalDetail}"`)
          .replace(/speech_pattern: $/m, `speech_pattern: "${this.speechPattern}"`)
          .replace(/active_problem: $/m, `active_problem: "${this.activeProblem}"`)
          .replace(/{{name}}/g, this.npcName)
          .replace(/{{motivation}}/g, this.motivation)
          .replace(/{{pursuit}}/g, this.pursuit)
          .replace(/{{active_problem}}/g, this.activeProblem)
          .replace(/{{physical_detail}}/g, this.physicalDetail)
          .replace(/{{speech_pattern}}/g, this.speechPattern);

        // If statblock is enabled, inject statblock frontmatter and render block
        if (this.hasStatblock) {
          npcContent = this.injectStatblockIntoContent(npcContent, tokenId);
        }

        await this.app.vault.create(filePath, npcContent);
        npcFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;

        // Save to Fantasy Statblocks plugin
        if (this.hasStatblock) {
          await this.saveToStatblocks();
        }

        new Notice(`✅ NPC "${this.npcName}" created successfully!`);
      }

      // Open the file
      if (npcFile) {
        await this.app.workspace.openLinkText(filePath, "", false);
      }
    } catch (error) {
      new Notice(`❌ Error ${this.isEdit ? 'updating' : 'creating'} NPC: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`NPC ${this.isEdit ? 'update' : 'creation'} error:`, error);
    }
  }

  /**
   * Inject statblock frontmatter fields and render block into new NPC content.
   */
  injectStatblockIntoContent(content: string, tokenId: string): string {
    const calcMod = (score: number) => Math.floor((score - 10) / 2);

    // Build statblock frontmatter lines to inject before the closing ---
    let statblockFm = `statblock: true\nsize: ${this.size}`;
    statblockFm += `\nac: ${parseInt(this.ac) || 10}`;
    statblockFm += `\nhp: ${parseInt(this.hp) || 1}`;
    statblockFm += `\nhit_dice: "${this.hitDice}"`;
    statblockFm += `\nspeed: "${this.speed}"`;
    statblockFm += `\nstats:\n  - ${this.str}\n  - ${this.dex}\n  - ${this.con}\n  - ${this.int}\n  - ${this.wis}\n  - ${this.cha}`;
    statblockFm += `\nfage_stats:\n  - ${calcMod(this.str)}\n  - ${calcMod(this.dex)}\n  - ${calcMod(this.con)}\n  - ${calcMod(this.int)}\n  - ${calcMod(this.wis)}\n  - ${calcMod(this.cha)}`;

    // Saves
    statblockFm += `\nsaves:`;
    if (this.saves.length > 0) {
      for (const save of this.saves) {
        const parts = save.trim().split(/\s+/);
        if (parts.length >= 2 && parts[0]) {
          statblockFm += `\n  - ${parts[0].toLowerCase().substring(0, 3)}: ${parts.slice(1).join('').replace(/\+/g, '')}`;
        }
      }
    }

    // Skills
    statblockFm += `\nskillsaves:`;
    if (this.skills.length > 0) {
      for (const skill of this.skills) {
        const { name: sName, bonus: sBonus } = this.parseSkillEntry(skill);
        if (sName && sBonus) {
          statblockFm += `\n  - ${sName}: ${sBonus}`;
        }
      }
    }

    statblockFm += `\ndamage_vulnerabilities: "${this.vulnerabilities}"`;
    statblockFm += `\ndamage_resistances: "${this.resistances}"`;
    statblockFm += `\ndamage_immunities: "${this.immunities}"`;
    statblockFm += `\ncondition_immunities: "${this.conditionImmunities}"`;
    statblockFm += `\nsenses: "${this.senses}"`;
    statblockFm += `\nlanguages: "${this.languages}"`;
    statblockFm += `\ncr: "${this.cr}"`;

    // Traits
    statblockFm += `\ntraits:`;
    for (const t of this.traits.filter(t => t.name && t.desc)) {
      statblockFm += `\n  - name: "${t.name}"`;
      statblockFm += `\n    desc: "${t.desc.replace(/"/g, '\\"')}"`;
    }

    // Actions
    statblockFm += `\nactions:`;
    for (const a of this.actions.filter(a => a.name && a.desc)) {
      statblockFm += `\n  - name: "${a.name}"`;
      statblockFm += `\n    desc: "${a.desc.replace(/"/g, '\\"')}"`;
    }

    statblockFm += `\nbonus_actions:`;
    for (const a of this.bonusActions.filter(a => a.name && a.desc)) {
      statblockFm += `\n  - name: "${a.name}"`;
      statblockFm += `\n    desc: "${a.desc.replace(/"/g, '\\"')}"`;
    }

    statblockFm += `\nreactions:`;
    for (const a of this.reactions.filter(a => a.name && a.desc)) {
      statblockFm += `\n  - name: "${a.name}"`;
      statblockFm += `\n    desc: "${a.desc.replace(/"/g, '\\"')}"`;
    }

    statblockFm += `\nlegendary_actions:`;
    for (const a of this.legendaryActions.filter(a => a.name && a.desc)) {
      statblockFm += `\n  - name: "${a.name}"`;
      statblockFm += `\n    desc: "${a.desc.replace(/"/g, '\\"')}"`;
    }

    // Replace `statblock: ""` with full statblock data in frontmatter
    content = content.replace(/^statblock: ""$/m, statblockFm);

    // Replace the placeholder statblock code block with the creature reference
    content = content.replace(
      /```statblock\n# Leave empty or add stat block here\n```/,
      `\`\`\`statblock\ncreature: ${this.npcName}\n\`\`\``
    );

    return content;
  }

  buildSavesObj(): Array<Record<string, string>> {
    const result: Array<Record<string, string>> = [];
    for (const save of this.saves) {
      const parts = save.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0]) {
        result.push({ [parts[0].toLowerCase().substring(0, 3)]: parts.slice(1).join('').replace(/\+/g, '') });
      }
    }
    return result;
  }

  buildSkillsObj(): Array<Record<string, string>> {
    const result: Array<Record<string, string>> = [];
    for (const skill of this.skills) {
      const { name, bonus } = this.parseSkillEntry(skill);
      if (name && bonus) {
        result.push({ [name]: bonus });
      }
    }
    return result;
  }

  parseSkillEntry(skill: string): { name: string; bonus: string } {
    const colonIndex = skill.indexOf(':');
    const plusIndex = skill.indexOf('+');
    const spaceIndex = skill.lastIndexOf(' ');
    let name = "";
    let bonus = "";
    if (colonIndex > 0) {
      name = skill.substring(0, colonIndex).trim();
      bonus = skill.substring(colonIndex + 1).trim().replace(/\+/g, '');
    } else if (plusIndex > 0) {
      name = skill.substring(0, plusIndex).trim();
      bonus = skill.substring(plusIndex).trim().replace(/\+/g, '');
    } else if (spaceIndex > 0) {
      name = skill.substring(0, spaceIndex).trim();
      bonus = skill.substring(spaceIndex).trim().replace(/\+/g, '');
    }
    if (name) name = name.toLowerCase().replace(/\s+/g, '');
    return { name, bonus };
  }

  async saveToStatblocks() {
    try {
      const statblocksPlugin = (this.app as any).plugins.getPlugin("obsidian-5e-statblocks");
      if (!statblocksPlugin) return;

      const statblock: any = {
        name: this.npcName,
        size: this.size,
        type: "humanoid",
        ac: parseInt(this.ac) || 10,
        hp: parseInt(this.hp) || 1,
        hit_dice: this.hitDice,
        speed: this.speed,
        stats: [this.str, this.dex, this.con, this.int, this.wis, this.cha],
        saves: this.buildSavesObj(),
        skillsaves: this.buildSkillsObj(),
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
        reactions: this.reactions.filter(a => a.name && a.desc),
        source: `NPC: ${this.npcName}`
      };

      if (statblocksPlugin.saveMonster) {
        await statblocksPlugin.saveMonster(statblock);
      }
    } catch (error) {
      console.error("Error saving NPC to statblocks plugin:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
