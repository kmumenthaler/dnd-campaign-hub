import { App, ItemView, Notice, Setting, TFile, TFolder, WorkspaceLeaf, MarkdownView } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { DM_SCREEN_VIEW_TYPE } from "../constants";

export class DMScreenView extends ItemView {
  plugin: DndCampaignHubPlugin;
  activeTab: string = "conditions";

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DM_SCREEN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "DM Screen";
  }

  getIcon(): string {
    return "shield";
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    if (!container) return;
    
    container.empty();
    container.addClass("dm-screen-view");

    // Header
    const header = container.createEl("div", { cls: "dm-screen-header" });
    header.createEl("h3", { text: "📜 DM Screen" });

    // Tab navigation
    const tabNav = container.createEl("div", { cls: "dm-screen-tabs" });
    const tabs = [
      { id: "conditions", label: "Conditions", icon: "⚠️" },
      { id: "actions", label: "Actions", icon: "⚔️" },
      { id: "combat", label: "Combat", icon: "🎯" },
      { id: "skills", label: "Skills", icon: "🎲" },
      { id: "travel", label: "Travel & Rest", icon: "🏕️" },
      { id: "dcs", label: "DCs", icon: "📊" },
      { id: "damage", label: "Damage", icon: "💥" },
      { id: "cover", label: "Cover", icon: "🛡️" }
    ];

    for (const tab of tabs) {
      const tabBtn = tabNav.createEl("button", {
        text: `${tab.icon} ${tab.label}`,
        cls: `dm-screen-tab ${this.activeTab === tab.id ? "active" : ""}`
      });
      tabBtn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.render();
      });
    }

    // Content area
    const content = container.createEl("div", { cls: "dm-screen-content" });

    switch (this.activeTab) {
      case "conditions":
        await this.renderConditionsTab(content);
        break;
      case "actions":
        this.renderActionsTab(content);
        break;
      case "combat":
        this.renderCombatTab(content);
        break;
      case "skills":
        this.renderSkillsTab(content);
        break;
      case "travel":
        this.renderTravelTab(content);
        break;
      case "dcs":
        this.renderDCsTab(content);
        break;
      case "damage":
        await this.renderDamageTab(content);
        break;
      case "cover":
        this.renderCoverTab(content);
        break;
    }
  }

  async renderConditionsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Conditions" });

    // Try to load from SRD data first
    const conditionsFolder = this.app.vault.getAbstractFileByPath("z_Conditions");
    
    if (conditionsFolder instanceof TFolder && conditionsFolder.children.length > 0) {
      const conditionsGrid = container.createEl("div", { cls: "dm-screen-conditions-grid" });
      
      for (const file of conditionsFolder.children) {
        if (file instanceof TFile && file.extension === "md") {
          const conditionCard = conditionsGrid.createEl("div", { cls: "dm-condition-card" });
          const conditionName = conditionCard.createEl("strong", { text: file.basename });
          conditionName.addClass("dm-condition-link");
          conditionName.addEventListener("click", async () => {
            await this.app.workspace.openLinkText(file.path, "", true);
          });
          
          // Read file to get description
          try {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            let description = "";
            let inFrontmatter = false;
            
            for (const line of lines) {
              if (line.trim() === "---") {
                inFrontmatter = !inFrontmatter;
                continue;
              }
              if (!inFrontmatter && line.trim() && !line.startsWith("#")) {
                description = line.trim();
                break;
              }
            }
            
            if (description) {
              conditionCard.createEl("p", { text: description.substring(0, 150) + (description.length > 150 ? "..." : "") });
            }
          } catch (error) {
            // Ignore read errors
          }
        }
      }
    } else {
      // Fallback to hardcoded conditions
      const conditions = [
        { name: "Blinded", desc: "Can't see. Auto-fail sight checks. Attack rolls have disadvantage; attacks against have advantage." },
        { name: "Charmed", desc: "Can't attack charmer. Charmer has advantage on social checks." },
        { name: "Deafened", desc: "Can't hear. Auto-fail hearing checks." },
        { name: "Frightened", desc: "Disadvantage on checks/attacks while source is visible. Can't willingly move closer." },
        { name: "Grappled", desc: "Speed becomes 0. Ends if grappler is incapacitated or forcefully separated." },
        { name: "Incapacitated", desc: "Can't take actions or reactions." },
        { name: "Invisible", desc: "Impossible to see without magic. Attacks have advantage; attacks against have disadvantage." },
        { name: "Paralyzed", desc: "Incapacitated, can't move or speak. Auto-fail STR/DEX saves. Attacks have advantage; melee crits." },
        { name: "Petrified", desc: "Transformed to stone. Weight x10. Incapacitated, unaware. Resistance to all damage." },
        { name: "Poisoned", desc: "Disadvantage on attack rolls and ability checks." },
        { name: "Prone", desc: "Can only crawl (half speed). Disadvantage on attacks. Melee attacks have advantage; ranged disadvantage." },
        { name: "Restrained", desc: "Speed 0. Attacks have disadvantage; attacks against have advantage. Disadvantage on DEX saves." },
        { name: "Stunned", desc: "Incapacitated, can't move, can speak only falteringly. Auto-fail STR/DEX saves. Attacks have advantage." },
        { name: "Unconscious", desc: "Incapacitated, can't move or speak, unaware. Drop what held, fall prone. Auto-fail STR/DEX. Attacks have advantage; melee crits." },
        { name: "Exhaustion", desc: "1: Disadv on checks. 2: Speed halved. 3: Disadv attacks/saves. 4: HP max halved. 5: Speed 0. 6: Death." }
      ];

      const conditionsGrid = container.createEl("div", { cls: "dm-screen-conditions-grid" });
      
      for (const condition of conditions) {
        const card = conditionsGrid.createEl("div", { cls: "dm-condition-card" });
        card.createEl("strong", { text: condition.name });
        card.createEl("p", { text: condition.desc });
      }
    }
  }

  renderActionsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Actions in Combat" });

    const actionsData = [
      {
        category: "Actions",
        items: [
          { name: "Attack", desc: "Make one melee or ranged attack. Some features allow multiple attacks." },
          { name: "Cast a Spell", desc: "Cast a spell with a casting time of 1 action." },
          { name: "Dash", desc: "Gain extra movement equal to your speed for the turn." },
          { name: "Disengage", desc: "Your movement doesn't provoke opportunity attacks for the turn." },
          { name: "Dodge", desc: "Attacks against you have disadvantage; DEX saves have advantage (if you can see)." },
          { name: "Help", desc: "Give an ally advantage on their next ability check or attack roll." },
          { name: "Hide", desc: "Make a Dexterity (Stealth) check to hide." },
          { name: "Ready", desc: "Prepare an action to trigger on a specific condition (uses reaction)." },
          { name: "Search", desc: "Make a Wisdom (Perception) or Intelligence (Investigation) check." },
          { name: "Use an Object", desc: "Interact with an object that requires an action." },
          { name: "Grapple", desc: "STR (Athletics) vs STR (Athletics) or DEX (Acrobatics). Target at most one size larger." },
          { name: "Shove", desc: "STR (Athletics) vs STR (Athletics) or DEX (Acrobatics). Push 5ft or knock prone." }
        ]
      },
      {
        category: "Bonus Actions",
        items: [
          { name: "Two-Weapon Fighting", desc: "Attack with light melee weapon in off hand (no ability mod to damage)." },
          { name: "Class Features", desc: "Cunning Action (Rogue), Rage (Barbarian), etc." },
          { name: "Spells", desc: "Cast spells with bonus action casting time." }
        ]
      },
      {
        category: "Reactions",
        items: [
          { name: "Opportunity Attack", desc: "Melee attack when hostile creature leaves your reach." },
          { name: "Readied Action", desc: "Use your prepared action when trigger occurs." },
          { name: "Spells", desc: "Shield, Counterspell, etc." }
        ]
      },
      {
        category: "Movement",
        items: [
          { name: "Move", desc: "Move up to your speed. Can split before/after actions." },
          { name: "Stand Up", desc: "Costs half your movement to stand from prone." },
          { name: "Climb/Swim", desc: "Each foot costs 2 feet of movement (unless you have a climb/swim speed)." },
          { name: "Difficult Terrain", desc: "Each foot costs 2 feet of movement." },
          { name: "Jump", desc: "Long: STR score in feet (running). High: 3 + STR mod feet (running)." }
        ]
      },
      {
        category: "Free Actions",
        items: [
          { name: "Object Interaction", desc: "One free object interaction per turn (draw weapon, open door)." },
          { name: "Communicate", desc: "Brief utterances and gestures during your turn." },
          { name: "Drop Item", desc: "Drop something you're holding." },
          { name: "Drop Prone", desc: "Fall prone (standing costs movement)." }
        ]
      }
    ];

    for (const section of actionsData) {
      const sectionEl = container.createEl("div", { cls: "dm-screen-section" });
      sectionEl.createEl("h5", { text: section.category });
      
      const tableEl = sectionEl.createEl("table", { cls: "dm-screen-table" });
      const tbody = tableEl.createEl("tbody");
      
      for (const item of section.items) {
        const row = tbody.createEl("tr");
        row.createEl("td", { text: item.name, cls: "dm-table-name" });
        row.createEl("td", { text: item.desc });
      }
    }
  }

  renderCombatTab(container: HTMLElement) {
    container.createEl("h4", { text: "Combat Rules Quick Reference" });

    // Attack Roll
    const attackSection = container.createEl("div", { cls: "dm-screen-section" });
    attackSection.createEl("h5", { text: "Attack Roll" });
    attackSection.createEl("p", { text: "d20 + ability modifier + proficiency bonus (if proficient)" });
    attackSection.createEl("p", { text: "• Melee: Strength modifier (or Dex with Finesse weapons)" });
    attackSection.createEl("p", { text: "• Ranged: Dexterity modifier" });
    attackSection.createEl("p", { text: "• Spell: Spellcasting ability modifier" });

    // Critical Hits
    const critSection = container.createEl("div", { cls: "dm-screen-section" });
    critSection.createEl("h5", { text: "Critical Hits" });
    critSection.createEl("p", { text: "Natural 20: Roll damage dice twice, then add modifiers." });
    critSection.createEl("p", { text: "Natural 1: Automatic miss regardless of modifiers." });

    // Advantage/Disadvantage
    const advSection = container.createEl("div", { cls: "dm-screen-section" });
    advSection.createEl("h5", { text: "Advantage & Disadvantage" });
    advSection.createEl("p", { text: "Advantage: Roll 2d20, use higher result" });
    advSection.createEl("p", { text: "Disadvantage: Roll 2d20, use lower result" });
    advSection.createEl("p", { text: "Multiple sources don't stack. If both apply, they cancel out." });

    // Death Saves
    const deathSection = container.createEl("div", { cls: "dm-screen-section" });
    deathSection.createEl("h5", { text: "Death Saving Throws" });
    deathSection.createEl("p", { text: "At 0 HP, roll d20 at start of each turn:" });
    deathSection.createEl("p", { text: "• 10+: Success | <10: Failure" });
    deathSection.createEl("p", { text: "• Natural 1: 2 failures | Natural 20: Regain 1 HP" });
    deathSection.createEl("p", { text: "• 3 successes: Stabilize | 3 failures: Death" });

    // Concentration
    const concentrationSection = container.createEl("div", { cls: "dm-screen-section" });
    concentrationSection.createEl("h5", { text: "Concentration" });
    concentrationSection.createEl("p", { text: "When damaged: CON save DC = 10 or half damage (whichever is higher)" });
    concentrationSection.createEl("p", { text: "Broken by: Incapacitation, death, or casting another concentration spell" });

    // Initiative
    const initSection = container.createEl("div", { cls: "dm-screen-section" });
    initSection.createEl("h5", { text: "Initiative" });
    initSection.createEl("p", { text: "d20 + Dexterity modifier" });
    initSection.createEl("p", { text: "Ties: DM decides (often higher Dex goes first, or simultaneous)" });

    // Surprise
    const surpriseSection = container.createEl("div", { cls: "dm-screen-section" });
    surpriseSection.createEl("h5", { text: "Surprise" });
    surpriseSection.createEl("p", { text: "Surprised creatures can't move or take actions on their first turn." });
    surpriseSection.createEl("p", { text: "Can't take reactions until that turn ends." });
  }

  renderSkillsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Skills by Ability" });

    const skills = {
      "Strength (STR)": ["Athletics"],
      "Dexterity (DEX)": ["Acrobatics", "Sleight of Hand", "Stealth"],
      "Constitution (CON)": ["(No skills, but concentration and HP)"],
      "Intelligence (INT)": ["Arcana", "History", "Investigation", "Nature", "Religion"],
      "Wisdom (WIS)": ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
      "Charisma (CHA)": ["Deception", "Intimidation", "Performance", "Persuasion"]
    };

    for (const [ability, skillList] of Object.entries(skills)) {
      const section = container.createEl("div", { cls: "dm-screen-section" });
      section.createEl("h5", { text: ability });
      const list = section.createEl("ul");
      for (const skill of skillList) {
        list.createEl("li", { text: skill });
      }
    }

    // Passive Scores
    const passiveSection = container.createEl("div", { cls: "dm-screen-section" });
    passiveSection.createEl("h5", { text: "Passive Scores" });
    passiveSection.createEl("p", { text: "Passive Score = 10 + all modifiers that apply" });
    passiveSection.createEl("p", { text: "Advantage: +5 | Disadvantage: -5" });
    passiveSection.createEl("p", { text: "Common: Passive Perception, Passive Investigation, Passive Insight" });
  }

  renderTravelTab(container: HTMLElement) {
    container.createEl("h4", { text: "Travel & Rest" });

    // Travel Pace
    const travelSection = container.createEl("div", { cls: "dm-screen-section" });
    travelSection.createEl("h5", { text: "Travel Pace" });
    const travelTable = travelSection.createEl("table", { cls: "dm-screen-table" });
    const travelBody = travelTable.createEl("tbody");
    
    const paces = [
      { pace: "Fast", perMin: "400 ft", perHour: "4 miles", perDay: "30 miles", effect: "-5 passive Perception" },
      { pace: "Normal", perMin: "300 ft", perHour: "3 miles", perDay: "24 miles", effect: "—" },
      { pace: "Slow", perMin: "200 ft", perHour: "2 miles", perDay: "18 miles", effect: "Can use Stealth" }
    ];

    const header = travelBody.createEl("tr");
    header.createEl("th", { text: "Pace" });
    header.createEl("th", { text: "/Minute" });
    header.createEl("th", { text: "/Hour" });
    header.createEl("th", { text: "/Day" });
    header.createEl("th", { text: "Effect" });

    for (const pace of paces) {
      const row = travelBody.createEl("tr");
      row.createEl("td", { text: pace.pace });
      row.createEl("td", { text: pace.perMin });
      row.createEl("td", { text: pace.perHour });
      row.createEl("td", { text: pace.perDay });
      row.createEl("td", { text: pace.effect });
    }

    // Short Rest
    const shortRestSection = container.createEl("div", { cls: "dm-screen-section" });
    shortRestSection.createEl("h5", { text: "Short Rest (1+ hour)" });
    shortRestSection.createEl("p", { text: "• Spend Hit Dice to recover HP (roll + CON mod each)" });
    shortRestSection.createEl("p", { text: "• Some class features recharge" });
    shortRestSection.createEl("p", { text: "• Light activity: eating, reading, keeping watch" });

    // Long Rest
    const longRestSection = container.createEl("div", { cls: "dm-screen-section" });
    longRestSection.createEl("h5", { text: "Long Rest (8+ hours, 6 hours sleep)" });
    longRestSection.createEl("p", { text: "• Regain all HP" });
    longRestSection.createEl("p", { text: "• Regain half your total Hit Dice (minimum 1)" });
    longRestSection.createEl("p", { text: "• Regain all spell slots" });
    longRestSection.createEl("p", { text: "• Remove 1 level of Exhaustion" });
    longRestSection.createEl("p", { text: "• Can only benefit from one long rest per 24 hours" });

    // Carrying Capacity
    const carrySection = container.createEl("div", { cls: "dm-screen-section" });
    carrySection.createEl("h5", { text: "Carrying Capacity" });
    carrySection.createEl("p", { text: "Carry: STR × 15 lbs" });
    carrySection.createEl("p", { text: "Push/Drag/Lift: STR × 30 lbs (speed = 5 ft)" });
    carrySection.createEl("p", { text: "Encumbered (variant): > STR × 5 lbs = -10 speed" });
    carrySection.createEl("p", { text: "Heavily Encumbered (variant): > STR × 10 lbs = -20 speed, disadvantage on attacks/checks/saves" });
  }

  renderDCsTab(container: HTMLElement) {
    container.createEl("h4", { text: "Difficulty Classes" });

    // Standard DCs
    const dcSection = container.createEl("div", { cls: "dm-screen-section" });
    dcSection.createEl("h5", { text: "Typical Difficulty Classes" });
    const dcTable = dcSection.createEl("table", { cls: "dm-screen-table" });
    const dcBody = dcTable.createEl("tbody");
    
    const dcs = [
      { difficulty: "Very Easy", dc: "5" },
      { difficulty: "Easy", dc: "10" },
      { difficulty: "Medium", dc: "15" },
      { difficulty: "Hard", dc: "20" },
      { difficulty: "Very Hard", dc: "25" },
      { difficulty: "Nearly Impossible", dc: "30" }
    ];

    for (const dc of dcs) {
      const row = dcBody.createEl("tr");
      row.createEl("td", { text: dc.difficulty });
      row.createEl("td", { text: `DC ${dc.dc}`, cls: "dm-table-highlight" });
    }

    // Spell Save DC
    const spellDcSection = container.createEl("div", { cls: "dm-screen-section" });
    spellDcSection.createEl("h5", { text: "Spell Save DC" });
    spellDcSection.createEl("p", { text: "8 + proficiency bonus + spellcasting ability modifier" });

    // Spell Attack
    const spellAttackSection = container.createEl("div", { cls: "dm-screen-section" });
    spellAttackSection.createEl("h5", { text: "Spell Attack Modifier" });
    spellAttackSection.createEl("p", { text: "Proficiency bonus + spellcasting ability modifier" });

    // AC Calculation
    const acSection = container.createEl("div", { cls: "dm-screen-section" });
    acSection.createEl("h5", { text: "Armor Class" });
    acSection.createEl("p", { text: "No Armor: 10 + DEX mod" });
    acSection.createEl("p", { text: "Light Armor: Armor AC + DEX mod" });
    acSection.createEl("p", { text: "Medium Armor: Armor AC + DEX mod (max +2)" });
    acSection.createEl("p", { text: "Heavy Armor: Armor AC (no DEX)" });
    acSection.createEl("p", { text: "Shield: +2 AC" });
  }

  async renderDamageTab(container: HTMLElement) {
    container.createEl("h4", { text: "Damage Types" });

    // Try to load from SRD data
    const damageFolder = this.app.vault.getAbstractFileByPath("z_DamageTypes");
    
    if (damageFolder instanceof TFolder && damageFolder.children.length > 0) {
      const damageGrid = container.createEl("div", { cls: "dm-screen-damage-grid" });
      
      for (const file of damageFolder.children) {
        if (file instanceof TFile && file.extension === "md") {
          const card = damageGrid.createEl("div", { cls: "dm-damage-card" });
          const nameEl = card.createEl("strong", { text: file.basename });
          nameEl.addClass("dm-damage-link");
          nameEl.addEventListener("click", async () => {
            await this.app.workspace.openLinkText(file.path, "", true);
          });
          
          // Read description
          try {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            let description = "";
            let inFrontmatter = false;
            
            for (const line of lines) {
              if (line.trim() === "---") {
                inFrontmatter = !inFrontmatter;
                continue;
              }
              if (!inFrontmatter && line.trim() && !line.startsWith("#")) {
                description = line.trim();
                break;
              }
            }
            
            if (description) {
              card.createEl("p", { text: description.substring(0, 100) + (description.length > 100 ? "..." : "") });
            }
          } catch (error) {
            // Ignore
          }
        }
      }
    } else {
      // Fallback
      const damageTypes = [
        { name: "Acid", desc: "Corrosive spray or digestive enzymes.", example: "Black dragon breath" },
        { name: "Bludgeoning", desc: "Blunt force attacks.", example: "Clubs, falling, constriction" },
        { name: "Cold", desc: "Infernal chill.", example: "White dragon breath, cone of cold" },
        { name: "Fire", desc: "Flames and heat.", example: "Red dragon breath, fireball" },
        { name: "Force", desc: "Pure magical energy.", example: "Magic missile, spiritual weapon" },
        { name: "Lightning", desc: "Electrical discharge.", example: "Blue dragon breath, lightning bolt" },
        { name: "Necrotic", desc: "Life-draining energy.", example: "Chill touch, harm" },
        { name: "Piercing", desc: "Puncturing and stabbing.", example: "Arrows, spears, teeth" },
        { name: "Poison", desc: "Toxins and venom.", example: "Green dragon breath, poison spray" },
        { name: "Psychic", desc: "Mental assault.", example: "Mind flayer attacks, vicious mockery" },
        { name: "Radiant", desc: "Divine and celestial.", example: "Guiding bolt, sacred flame" },
        { name: "Slashing", desc: "Cutting attacks.", example: "Swords, axes, claws" },
        { name: "Thunder", desc: "Concussive sound.", example: "Thunderwave, shatter" }
      ];

      const damageGrid = container.createEl("div", { cls: "dm-screen-damage-grid" });
      
      for (const type of damageTypes) {
        const card = damageGrid.createEl("div", { cls: "dm-damage-card" });
        card.createEl("strong", { text: type.name });
        card.createEl("p", { text: type.desc });
        card.createEl("p", { text: `(${type.example})`, cls: "dm-damage-example" });
      }
    }

    // Resistances and Immunities
    const resistSection = container.createEl("div", { cls: "dm-screen-section" });
    resistSection.createEl("h5", { text: "Resistance & Immunity" });
    resistSection.createEl("p", { text: "Resistance: Take half damage (round down)" });
    resistSection.createEl("p", { text: "Vulnerability: Take double damage" });
    resistSection.createEl("p", { text: "Immunity: Take no damage" });
    resistSection.createEl("p", { text: "Multiple resistances/vulnerabilities don't stack." });
  }

  renderCoverTab(container: HTMLElement) {
    container.createEl("h4", { text: "Cover" });

    const coverSection = container.createEl("div", { cls: "dm-screen-section" });
    const coverTable = coverSection.createEl("table", { cls: "dm-screen-table" });
    const coverBody = coverTable.createEl("tbody");
    
    const header = coverBody.createEl("tr");
    header.createEl("th", { text: "Cover" });
    header.createEl("th", { text: "AC/DEX Bonus" });
    header.createEl("th", { text: "Example" });

    const covers = [
      { type: "Half Cover", bonus: "+2", example: "Low wall, furniture, another creature" },
      { type: "Three-Quarters", bonus: "+5", example: "Arrow slit, tree trunk" },
      { type: "Total Cover", bonus: "Can't be targeted", example: "Completely concealed" }
    ];

    for (const cover of covers) {
      const row = coverBody.createEl("tr");
      row.createEl("td", { text: cover.type });
      row.createEl("td", { text: cover.bonus, cls: "dm-table-highlight" });
      row.createEl("td", { text: cover.example });
    }

    // Obscurement
    const obscureSection = container.createEl("div", { cls: "dm-screen-section" });
    obscureSection.createEl("h5", { text: "Obscurement" });
    
    const obscureTable = obscureSection.createEl("table", { cls: "dm-screen-table" });
    const obscureBody = obscureTable.createEl("tbody");
    
    const obscureHeader = obscureBody.createEl("tr");
    obscureHeader.createEl("th", { text: "Type" });
    obscureHeader.createEl("th", { text: "Effect" });
    obscureHeader.createEl("th", { text: "Example" });

    const obscures = [
      { type: "Lightly Obscured", effect: "Disadvantage on Perception", example: "Dim light, patchy fog, moderate foliage" },
      { type: "Heavily Obscured", effect: "Effectively blinded", example: "Darkness, opaque fog, dense foliage" }
    ];

    for (const obs of obscures) {
      const row = obscureBody.createEl("tr");
      row.createEl("td", { text: obs.type });
      row.createEl("td", { text: obs.effect });
      row.createEl("td", { text: obs.example });
    }

    // Light
    const lightSection = container.createEl("div", { cls: "dm-screen-section" });
    lightSection.createEl("h5", { text: "Light" });
    lightSection.createEl("p", { text: "Bright Light: Normal vision" });
    lightSection.createEl("p", { text: "Dim Light: Lightly obscured, disadvantage on Perception" });
    lightSection.createEl("p", { text: "Darkness: Heavily obscured, effectively blinded" });

    // Vision Types
    const visionSection = container.createEl("div", { cls: "dm-screen-section" });
    visionSection.createEl("h5", { text: "Special Vision" });
    visionSection.createEl("p", { text: "Darkvision: See dim light as bright, darkness as dim (no color). Common range: 60 ft." });
    visionSection.createEl("p", { text: "Blindsight: Perceive surroundings without sight. Common range: 10-60 ft." });
    visionSection.createEl("p", { text: "Truesight: See in darkness, invisible creatures, illusions, shapechangers, ethereal plane." });
    visionSection.createEl("p", { text: "Tremorsense: Detect vibrations through the ground." });
  }

  async onClose() {
    const container = this.containerEl.children[1];
    if (container) {
      container.empty();
    }
  }
}
