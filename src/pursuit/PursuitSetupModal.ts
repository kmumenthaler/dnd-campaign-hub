/**
 * PursuitSetupModal — Encounter-builder-style modal for setting up chases.
 *
 * Layout mirrors EncounterBuilderModal:
 *  - Chase Name input
 *  - Include Party toggle + PartySelector + member list (quarry)
 *  - Environment configuration
 *  - Creatures & NPCs section (vault search + manual entry + list with color-coded names)
 *  - Footer with participant counts + Start Chase button
 */

import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { CombatState } from "../combat/types";
import type {
  PursuitParticipant,
  PursuitRole,
  ChaseEnvironment,
  SpeedEntry,
} from "./types";
import { parseSpeed, SIZE_WEIGHT_ESTIMATE } from "./types";
import { COMPLICATION_TABLES } from "./complications";
import { PartySelector } from "../party/PartySelector";

// ── Color names for multiple creatures (same list as EncounterBuilder) ──
const CREATURE_COLORS = [
  "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
  "Pink", "Brown", "Black", "White", "Gray", "Cyan",
  "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold",
  "Silver", "Bronze",
];

/** Extract a numeric skill bonus from a skillsaves frontmatter array.
 *  skillsaves is stored as `[{stealth: 5}, {perception: 3}]`. */
function extractSkillBonus(skillsaves: unknown, skillName: string): number | null {
  if (!Array.isArray(skillsaves)) return null;
  const lower = skillName.toLowerCase();
  for (const entry of skillsaves) {
    if (typeof entry !== "object" || entry === null) continue;
    for (const [key, val] of Object.entries(entry as Record<string, unknown>)) {
      if (key.toLowerCase() === lower && typeof val === "number") return val;
    }
  }
  return null;
}

/** Extract Passive Perception from a senses string like "darkvision 60 ft., Passive Perception 14". */
function extractPassivePerception(senses: unknown): number | null {
  if (typeof senses !== "string") return null;
  const m = senses.match(/Passive Perception\s+(\d+)/i);
  return m ? parseInt(m[1]!, 10) : null;
}

/** Full stat block for a vault entity. */
interface VaultEntity {
  name: string;
  notePath: string;
  type: "player" | "npc" | "creature";
  speed: SpeedEntry[];
  strScore: number;
  conModifier: number;
  stealthModifier: number;
  passivePerception: number;
  perceptionModifier: number;
  initBonus: number;
  currentHP: number;
  maxHP: number;
  size: string;
  tokenId?: string;
  wisModifier: number;
  intModifier: number;
  chaModifier: number;
}

/** A creature/NPC entry in the creature list (supports count > 1). */
interface CreatureEntry {
  name: string;
  count: number;
  role: PursuitRole;
  speed: SpeedEntry[];
  strScore: number;
  conModifier: number;
  stealthModifier: number;
  passivePerception: number;
  perceptionModifier: number;
  initBonus: number;
  currentHP: number;
  maxHP: number;
  size: string;
  notePath?: string;
  entityType: "npc" | "creature";
  tokenId?: string;
  isCustom: boolean;
  hasCunningAction: boolean;
  wisModifier: number;
  intModifier: number;
  chaModifier: number;
  startPenalty: "none" | "halved" | "zero";
  startPosition?: number;
  hasTremorsense: boolean;
  combatInitiative?: number;
  isPlayer?: boolean;
}

export class PursuitSetupModal extends Modal {
  private plugin: DndCampaignHubPlugin;

  // ── Chase config ──
  private chaseName = "Chase";
  private environment: ChaseEnvironment = {
    name: "Default",
    hasCover: false,
    hasObscurement: false,
    wideOpen: false,
    hasElevation: false,
    crowdedOrNoisy: false,
    complicationTableId: "urban",
    notes: "",
  };
  private hasRangerPursuer = false;
  private maxDistance = 0;
  private maxRounds = 0;
  private quarryHeadStart = 60;
  private pursuerStart = 0;

  // ── Party (PCs) ──
  private includeParty = true;
  private selectedPartyId = "";
  private selectedPartyName = "";
  private selectedPartyMembers: string[] = [];
  private partySelector: PartySelector | null = null;

  // ── Creature / NPC entries (with count) ──
  private creatures: CreatureEntry[] = [];

  // ── Vault entities cache (NPCs + creatures only, for search) ──
  private searchableEntities: VaultEntity[] = [];

  // ── All vault entities (including PCs, for combat-state import) ──
  private allVaultEntities: VaultEntity[] = [];

  // ── Pre-populated from combat? ──
  private fromCombat: CombatState | null = null;

  // ── UI containers ──
  private partySelectionContainer: HTMLElement | null = null;
  private partyMemberListContainer: HTMLElement | null = null;
  private creatureListContainer: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, combatState?: CombatState) {
    super(app);
    this.plugin = plugin;
    if (combatState) this.fromCombat = combatState;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("dnd-pursuit-setup-modal");

    // Pre-load vault entities
    this.allVaultEntities = await this.loadVaultEntities();
    this.searchableEntities = this.allVaultEntities.filter((e) => e.type !== "player");

    // Pre-populate from combat if available
    if (this.fromCombat) {
      this.chaseName = `Chase — ${this.fromCombat.encounterName}`;
      this.includeParty = false; // Combatants are added directly as creature entries
      await this.loadFromCombatState(this.fromCombat);
    }

    await this.renderContent();
  }

  onClose() {
    this.contentEl.empty();
  }

  // ── Render ─────────────────────────────────────────────────

  private async renderContent() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🏃 Setup Chase" });

    // ── Chase name ──
    new Setting(contentEl)
      .setName("Chase Name")
      .addText((text) =>
        text
          .setPlaceholder("e.g. Market Chase")
          .setValue(this.chaseName)
          .onChange((v) => { this.chaseName = v; })
      );

    // ── Include Party ──
    new Setting(contentEl)
      .setName("Include Party Members")
      .setDesc("Select party members to include as quarry in the chase")
      .addToggle((toggle) =>
        toggle
          .setValue(this.includeParty)
          .onChange(async (value) => {
            this.includeParty = value;
            await this.renderPartySelection();
            await this.renderPartyMemberList();
            this.updateFooter();
          })
      );

    // Party selection container
    this.partySelectionContainer = contentEl.createDiv();
    this.partySelectionContainer.style.marginBottom = "15px";
    await this.renderPartySelection();

    // Party member list container
    this.partyMemberListContainer = contentEl.createDiv({ cls: "dnd-party-member-list" });
    this.partyMemberListContainer.style.marginBottom = "15px";
    await this.renderPartyMemberList();

    // ── Environment ──
    contentEl.createEl("h3", { text: "Environment" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "These affect the stealth condition for quarry members at end of round.",
    });

    new Setting(contentEl)
      .setName("Environment Name")
      .addText((text) =>
        text
          .setPlaceholder("Crowded Market")
          .setValue(this.environment.name)
          .onChange((v) => { this.environment.name = v; })
      );

    new Setting(contentEl)
      .setName("Cover available")
      .setDesc("Stalls, carts, buildings, columns — things to hide behind")
      .addToggle((t) =>
        t.setValue(this.environment.hasCover).onChange((v) => { this.environment.hasCover = v; })
      );

    new Setting(contentEl)
      .setName("Heavily obscured areas")
      .setDesc("Fog, darkness, smoke, heavy rain")
      .addToggle((t) =>
        t.setValue(this.environment.hasObscurement).onChange((v) => { this.environment.hasObscurement = v; })
      );

    new Setting(contentEl)
      .setName("Crowded or noisy")
      .setDesc("Lots of bystanders, loud market hawkers")
      .addToggle((t) =>
        t.setValue(this.environment.crowdedOrNoisy).onChange((v) => { this.environment.crowdedOrNoisy = v; })
      );

    new Setting(contentEl)
      .setName("Wide open (few hiding spots)")
      .setDesc("Open field, long corridor — gives disadvantage on stealth")
      .addToggle((t) =>
        t.setValue(this.environment.wideOpen).onChange((v) => { this.environment.wideOpen = v; })
      );

    new Setting(contentEl)
      .setName("Elevation changes")
      .setDesc("Rooftops, balconies, sewer gratings")
      .addToggle((t) =>
        t.setValue(this.environment.hasElevation).onChange((v) => { this.environment.hasElevation = v; })
      );

    new Setting(contentEl)
      .setName("Complication Table")
      .setDesc("Environment-specific d20 complication table used each turn")
      .addDropdown((dd) => {
        for (const table of COMPLICATION_TABLES) {
          dd.addOption(table.id, `${table.icon} ${table.name}`);
        }
        dd.setValue(this.environment.complicationTableId);
        dd.onChange((v) => { this.environment.complicationTableId = v; });
      });

    new Setting(contentEl)
      .setName("Ranger / Survival pursuer")
      .setDesc("At least one pursuer is a ranger or has proficiency in Survival (disadvantage)")
      .addToggle((t) =>
        t.setValue(this.hasRangerPursuer).onChange((v) => { this.hasRangerPursuer = v; })
      );

    // ── Chase Rules ──
    contentEl.createEl("h3", { text: "Chase Rules" });

    new Setting(contentEl)
      .setName("Quarry head start (ft)")
      .setDesc("Starting position for quarry members (pursuers start at their own configured position)")
      .addText((text) => {
        text.setPlaceholder("60").setValue(String(this.quarryHeadStart)).onChange((v) => {
          this.quarryHeadStart = parseInt(v) || 60;
        });
        text.inputEl.type = "number";
        text.inputEl.style.width = "70px";
      });

    new Setting(contentEl)
      .setName("Pursuer start position (ft)")
      .setDesc("Default starting position for all pursuers")
      .addText((text) => {
        text.setPlaceholder("0").setValue(String(this.pursuerStart)).onChange((v) => {
          this.pursuerStart = parseInt(v) || 0;
        });
        text.inputEl.type = "number";
        text.inputEl.style.width = "70px";
      });

    new Setting(contentEl)
      .setName("Max escape distance (ft)")
      .setDesc("Quarry that reaches this distance auto-escapes. 0 = no limit.")
      .addText((text) => {
        text.setPlaceholder("0").setValue(String(this.maxDistance)).onChange((v) => {
          this.maxDistance = parseInt(v) || 0;
        });
        text.inputEl.type = "number";
        text.inputEl.style.width = "70px";
      });

    new Setting(contentEl)
      .setName("Max rounds")
      .setDesc("Chase auto-ends after this many rounds. 0 = no limit.")
      .addText((text) => {
        text.setPlaceholder("0").setValue(String(this.maxRounds)).onChange((v) => {
          this.maxRounds = parseInt(v) || 0;
        });
        text.inputEl.type = "number";
        text.inputEl.style.width = "70px";
      });

    // ── Creatures & NPCs ──
    contentEl.createEl("h3", { text: "Creatures & NPCs" });

    // Creature list container (rendered above the add forms)
    this.creatureListContainer = contentEl.createDiv({ cls: "dnd-creature-list" });
    this.renderCreatureList();

    // Creature input fields (vault search + manual entry)
    await this.showCreatureInputFields(contentEl);

    // ── Footer ──
    contentEl.createEl("hr");
    const footer = contentEl.createDiv({ cls: "dnd-pursuit-footer" });

    const { quarryCount, pursuerCount } = this.countRoles();
    footer.createEl("span", {
      text: `${quarryCount} quarry · ${pursuerCount} pursuers`,
      cls: "dnd-pursuit-summary",
    });

    const startBtn = footer.createEl("button", {
      text: "🏃 Start Chase",
      cls: "dnd-pursuit-btn dnd-pursuit-btn-primary",
    });
    startBtn.disabled = quarryCount === 0 || pursuerCount === 0;
    startBtn.addEventListener("click", () => this.startChase());
  }

  // ── Party Selection (PartySelector widget) ──────────────────

  private async renderPartySelection() {
    if (!this.partySelectionContainer) return;
    this.partySelectionContainer.empty();

    if (!this.includeParty) return;

    this.partySelector = new PartySelector({
      partyManager: this.plugin.partyManager,
      container: this.partySelectionContainer,
      initialPartyId: this.selectedPartyId,
      initialMembers: this.selectedPartyMembers,
      onChange: (partyId, partyName, members) => {
        this.selectedPartyId = partyId;
        this.selectedPartyName = partyName;
        this.selectedPartyMembers = members;
        this.renderPartyMemberList();
        this.updateFooter();
      },
    });
    await this.partySelector.render();
  }

  private async renderPartyMemberList() {
    if (!this.partyMemberListContainer) return;
    this.partyMemberListContainer.empty();

    if (!this.includeParty || this.selectedPartyMembers.length === 0) return;

    // Look up vault data for each selected member
    const memberByName = new Map(
      this.allVaultEntities
        .filter((e) => e.type === "player")
        .map((e) => [e.name, e]),
    );

    const headerDiv = this.partyMemberListContainer.createDiv({ cls: "dnd-party-member-header" });
    headerDiv.style.marginBottom = "10px";
    headerDiv.style.fontWeight = "600";
    headerDiv.setText(`Selected Party Members — Quarry (${this.selectedPartyMembers.length})`);

    for (const memberName of this.selectedPartyMembers) {
      const data = memberByName.get(memberName);

      const memberItem = this.partyMemberListContainer.createDiv({ cls: "dnd-creature-item" });

      const nameEl = memberItem.createSpan({ cls: "dnd-creature-name" });
      nameEl.setText(`👤 ${memberName}`);

      const statsEl = memberItem.createSpan({ cls: "dnd-creature-stats" });
      if (data) {
        const speed = data.speed.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
        const parts: string[] = [];
        parts.push(speed);
        parts.push(`STR ${data.strScore}`);
        parts.push(`Stealth ${data.stealthModifier >= 0 ? "+" : ""}${data.stealthModifier}`);
        parts.push(`PPerc ${data.passivePerception}`);
        parts.push(`HP ${data.currentHP}/${data.maxHP}`);
        statsEl.setText(` | ${parts.join(" | ")}`);
      }

      const removeBtn = memberItem.createEl("button", {
        text: "Remove",
        cls: "dnd-creature-remove",
      });
      removeBtn.addEventListener("click", () => {
        this.selectedPartyMembers = this.selectedPartyMembers.filter((n) => n !== memberName);
        this.renderPartySelection();
        this.renderPartyMemberList();
        this.updateFooter();
      });
    }
  }

  // ── Creature Input Fields (vault search + manual) ──────────

  private async showCreatureInputFields(container: HTMLElement) {
    // === VAULT CREATURE SEARCH ===
    const vaultSection = container.createDiv({ cls: "dnd-add-creature-vault" });

    let selectedEntity: VaultEntity | null = null;
    let creatureCount = "1";
    let creatureRole: PursuitRole = "pursuer";
    let searchResults: HTMLElement | null = null;

    if (this.searchableEntities.length > 0) {
      const vaultSetting = new Setting(vaultSection)
        .setName("Add from Vault")
        .setDesc(`Search NPCs and creatures (${this.searchableEntities.length} available)`);

      // Search input container
      const searchContainer = vaultSetting.controlEl.createDiv({ cls: "dnd-creature-search-container" });

      const searchInput = searchContainer.createEl("input", {
        type: "text",
        placeholder: "Search creatures…",
        cls: "dnd-creature-search-input",
      });

      searchResults = searchContainer.createDiv({ cls: "dnd-creature-search-results" });
      searchResults.style.display = "none";

      // Filter and display results
      const showSearchResults = (query: string) => {
        if (!searchResults) return;
        if (!query || query.length < 1) {
          searchResults.style.display = "none";
          return;
        }

        const q = query.toLowerCase().trim();
        const filtered = this.searchableEntities
          .filter((e) => e.name.toLowerCase().includes(q))
          .slice(0, 10);

        searchResults.empty();

        if (filtered.length === 0) {
          searchResults.createEl("div", {
            text: "No creatures found",
            cls: "dnd-creature-search-no-results",
          });
          searchResults.style.display = "block";
          return;
        }

        for (const entity of filtered) {
          const resultEl = searchResults.createDiv({ cls: "dnd-creature-search-result" });

          const typeIcon = entity.type === "npc" ? "🎭" : "🐉";
          resultEl.createDiv({
            text: `${typeIcon} ${entity.name}`,
            cls: "dnd-creature-search-result-name",
          });

          const speed = entity.speed.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
          const parts: string[] = [speed];
          parts.push(`STR ${entity.strScore}`);
          parts.push(`Stealth ${entity.stealthModifier >= 0 ? "+" : ""}${entity.stealthModifier}`);
          parts.push(`PPerc ${entity.passivePerception}`);
          resultEl.createDiv({ text: parts.join(" | "), cls: "dnd-creature-search-result-stats" });

          resultEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedEntity = entity;
            searchInput.value = entity.name;
            searchResults!.style.display = "none";
          });
        }

        searchResults.style.display = "block";
      };

      searchInput.addEventListener("input", (e) => {
        selectedEntity = null;
        showSearchResults((e.target as HTMLInputElement).value);
      });

      searchInput.addEventListener("focus", (e) => {
        const v = (e.target as HTMLInputElement).value;
        if (v.length >= 1) showSearchResults(v);
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && selectedEntity) {
          e.preventDefault();
          addVaultCreature();
        }
      });

      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (searchResults) searchResults.style.display = "none";
        }, 250);
      });

      // Count input
      vaultSetting.addText((text) => {
        text.setPlaceholder("Count").setValue("1").onChange((v) => { creatureCount = v; });
        text.inputEl.type = "number";
        text.inputEl.style.width = "60px";
      });

      // Role selector
      const roleContainer = vaultSetting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
      roleContainer.style.display = "inline-flex";
      roleContainer.style.alignItems = "center";
      roleContainer.style.marginLeft = "8px";

      const roleSelect = roleContainer.createEl("select", { cls: "dropdown" });
      roleSelect.createEl("option", { text: "🔍 Pursuer", attr: { value: "pursuer" } });
      roleSelect.createEl("option", { text: "🏃 Quarry", attr: { value: "quarry" } });
      roleSelect.addEventListener("change", () => {
        creatureRole = roleSelect.value as PursuitRole;
      });

      // Add button
      const addVaultCreature = () => {
        if (!selectedEntity) {
          new Notice("Please search and select a creature first!");
          return;
        }
        const count = parseInt(creatureCount) || 1;
        this.creatures.push({
          name: selectedEntity.name,
          count,
          role: creatureRole,
          speed: selectedEntity.speed,
          strScore: selectedEntity.strScore,
          conModifier: selectedEntity.conModifier,
          stealthModifier: selectedEntity.stealthModifier,
          passivePerception: selectedEntity.passivePerception,
          perceptionModifier: selectedEntity.perceptionModifier,
          initBonus: selectedEntity.initBonus,
          currentHP: selectedEntity.currentHP,
          maxHP: selectedEntity.maxHP,
          size: selectedEntity.size,
          notePath: selectedEntity.notePath,
          entityType: selectedEntity.type === "npc" ? "npc" : "creature",
          tokenId: selectedEntity.tokenId,
          isCustom: false,
          hasCunningAction: false,
          wisModifier: selectedEntity.wisModifier,
          intModifier: selectedEntity.intModifier,
          chaModifier: selectedEntity.chaModifier,
          startPenalty: "none",
          hasTremorsense: false,
        });
        this.renderCreatureList();
        this.updateFooter();
        new Notice(`Added ${count}x ${selectedEntity.name} as ${creatureRole}`);
        searchInput.value = "";
        selectedEntity = null;
      };

      vaultSetting.addButton((btn) =>
        btn.setButtonText("Add").setCta().onClick(addVaultCreature)
      );
    } else {
      vaultSection.createEl("p", {
        text: "⚠️ No creatures or NPCs found in your vault. Use manual entry below.",
        cls: "setting-item-description mod-warning",
      });
    }

    // === MANUAL CREATURE ENTRY ===
    const manualSection = container.createDiv({ cls: "dnd-add-creature-manual" });

    let manualName = "";
    let manualCount = "1";
    let manualSpeed = "30";
    let manualStr = "10";
    let manualCon = "10";
    let manualStealth = "0";
    let manualPPerc = "10";
    let manualRole: PursuitRole = "pursuer";

    const manualSetting = new Setting(manualSection)
      .setName("Add Custom Creature")
      .setDesc("Manually enter pursuit-relevant stats");

    manualSetting.addText((text) => {
      text.setPlaceholder("Name").onChange((v) => { manualName = v; });
      text.inputEl.style.width = "120px";
    });

    manualSetting.addText((text) => {
      text.setPlaceholder("Count").setValue("1").onChange((v) => { manualCount = v; });
      text.inputEl.type = "number";
      text.inputEl.style.width = "55px";
    });

    manualSetting.addText((text) => {
      text.setPlaceholder("Speed").setValue("30").onChange((v) => { manualSpeed = v; });
      text.inputEl.type = "number";
      text.inputEl.style.width = "55px";
    });

    manualSetting.addText((text) => {
      text.setPlaceholder("STR").setValue("10").onChange((v) => { manualStr = v; });
      text.inputEl.type = "number";
      text.inputEl.style.width = "50px";
    });

    manualSetting.addText((text) => {
      text.setPlaceholder("CON").setValue("10").onChange((v) => { manualCon = v; });
      text.inputEl.type = "number";
      text.inputEl.style.width = "50px";
    });

    manualSetting.addText((text) => {
      text.setPlaceholder("Stealth").setValue("0").onChange((v) => { manualStealth = v; });
      text.inputEl.type = "number";
      text.inputEl.style.width = "55px";
    });

    manualSetting.addText((text) => {
      text.setPlaceholder("PPerc").setValue("10").onChange((v) => { manualPPerc = v; });
      text.inputEl.type = "number";
      text.inputEl.style.width = "55px";
    });

    // Role selector
    const manualRoleContainer = manualSetting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
    manualRoleContainer.style.display = "inline-flex";
    manualRoleContainer.style.alignItems = "center";
    manualRoleContainer.style.marginLeft = "8px";

    const manualRoleSelect = manualRoleContainer.createEl("select", { cls: "dropdown" });
    manualRoleSelect.createEl("option", { text: "🔍 Pursuer", attr: { value: "pursuer" } });
    manualRoleSelect.createEl("option", { text: "🏃 Quarry", attr: { value: "quarry" } });
    manualRoleSelect.addEventListener("change", () => {
      manualRole = manualRoleSelect.value as PursuitRole;
    });

    manualSetting.addButton((btn) =>
      btn.setButtonText("Add").setCta().onClick(() => {
        if (!manualName.trim()) {
          new Notice("Please enter a creature name!");
          return;
        }
        const count = parseInt(manualCount) || 1;
        const conScore = parseInt(manualCon) || 10;
        this.creatures.push({
          name: manualName.trim(),
          count,
          role: manualRole,
          speed: [{ mode: "walk", feet: parseInt(manualSpeed) || 30 }],
          strScore: parseInt(manualStr) || 10,
          conModifier: Math.floor((conScore - 10) / 2),
          stealthModifier: parseInt(manualStealth) || 0,
          passivePerception: parseInt(manualPPerc) || 10,
          perceptionModifier: (parseInt(manualPPerc) || 10) - 10,
          initBonus: 0,
          currentHP: 10,
          maxHP: 10,
          size: "medium",
          entityType: "creature",
          isCustom: true,
          hasCunningAction: false,
          wisModifier: 0,
          intModifier: 0,
          chaModifier: 0,
          startPenalty: "none",
          hasTremorsense: false,
        });
        this.renderCreatureList();
        this.updateFooter();
        new Notice(`Added ${count}x ${manualName.trim()} as ${manualRole}`);
      })
    );

    container.createEl("p", {
      text: "💡 Tip: Creatures with count > 1 get color-coded names (e.g., Goblin Red, Goblin Blue).",
      cls: "setting-item-description",
    });
  }

  // ── Creature List ──────────────────────────────────────────

  private renderCreatureList() {
    if (!this.creatureListContainer) return;
    this.creatureListContainer.empty();

    if (this.creatures.length === 0) {
      this.creatureListContainer.createEl("p", {
        text: "No creatures added yet. Add creatures below.",
        cls: "setting-item-description",
      });
      return;
    }

    for (let i = 0; i < this.creatures.length; i++) {
      const creature = this.creatures[i]!;
      const creatureItem = this.creatureListContainer.createDiv({
        cls: `dnd-creature-item ${creature.role === "quarry" ? "dnd-pursuit-quarry-row" : "dnd-pursuit-pursuer-row"}`,
      });

      // Name with color-coded suffixes for count > 1
      const nameEl = creatureItem.createSpan({ cls: "dnd-creature-name" });
      const typeIcon = creature.entityType === "npc" ? "🎭" : "🐉";
      if (creature.count > 1) {
        const colorNames = CREATURE_COLORS.slice(0, creature.count).join(", ");
        nameEl.setText(`${typeIcon} ${creature.name} x${creature.count} (${colorNames})`);
      } else {
        nameEl.setText(`${typeIcon} ${creature.name}`);
      }

      // Stats
      const statsEl = creatureItem.createSpan({ cls: "dnd-creature-stats" });
      const speed = creature.speed.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
      const parts: string[] = [speed];
      parts.push(`STR ${creature.strScore}`);
      parts.push(`Stealth ${creature.stealthModifier >= 0 ? "+" : ""}${creature.stealthModifier}`);
      parts.push(`PPerc ${creature.passivePerception}`);
      const conLabel = creature.conModifier >= 0 ? `+${creature.conModifier}` : `${creature.conModifier}`;
      parts.push(`CON ${conLabel}`);
      statsEl.setText(` | ${parts.join(" | ")}`);

      // Role toggle
      const roleBtn = creatureItem.createEl("button", {
        text: creature.role === "quarry" ? "🏃 Quarry" : "🔍 Pursuer",
        cls: "dnd-pursuit-role-btn",
      });
      roleBtn.addEventListener("click", () => {
        creature.role = creature.role === "quarry" ? "pursuer" : "quarry";
        this.renderCreatureList();
        this.updateFooter();
      });

      // Cunning Action toggle
      const caBtn = creatureItem.createEl("button", {
        text: "🗡️ Cunning",
        cls: `dnd-creature-friendly-toggle${creature.hasCunningAction ? " active" : ""}`,
        attr: { title: "Cunning Action (rogue bonus dash)" },
      });
      caBtn.addEventListener("click", () => {
        creature.hasCunningAction = !creature.hasCunningAction;
        this.renderCreatureList();
      });

      // Start penalty selector
      const penaltySelect = creatureItem.createEl("select", {
        cls: "dropdown dnd-pursuit-penalty-select",
        attr: { title: "Start penalty (first turn only)" },
      });
      penaltySelect.createEl("option", { text: "No penalty", attr: { value: "none" } });
      penaltySelect.createEl("option", { text: "½ speed", attr: { value: "halved" } });
      penaltySelect.createEl("option", { text: "0 speed", attr: { value: "zero" } });
      penaltySelect.value = creature.startPenalty;
      penaltySelect.addEventListener("change", () => {
        creature.startPenalty = penaltySelect.value as "none" | "halved" | "zero";
      });

      // Tremorsense toggle
      if (creature.role === "pursuer") {
        const tsBtn = creatureItem.createEl("button", {
          text: "📡 Tremor",
          cls: `dnd-creature-friendly-toggle${creature.hasTremorsense ? " active" : ""}`,
          attr: { title: "Tremorsense (can detect burrowing quarry)" },
        });
        tsBtn.addEventListener("click", () => {
          creature.hasTremorsense = !creature.hasTremorsense;
          this.renderCreatureList();
        });
      }

      // Remove
      const removeBtn = creatureItem.createEl("button", {
        text: "Remove",
        cls: "dnd-creature-remove",
      });
      removeBtn.addEventListener("click", () => {
        this.creatures.splice(i, 1);
        this.renderCreatureList();
        this.updateFooter();
      });
    }
  }

  // ── Footer update ──────────────────────────────────────────

  private countRoles(): { quarryCount: number; pursuerCount: number } {
    // Party members count as quarry
    const partyQuarry = this.includeParty ? this.selectedPartyMembers.length : 0;
    // Creature entries contribute their count
    let creatureQuarry = 0;
    let creaturePursuer = 0;
    for (const c of this.creatures) {
      if (c.role === "quarry") creatureQuarry += c.count;
      else creaturePursuer += c.count;
    }
    return {
      quarryCount: partyQuarry + creatureQuarry,
      pursuerCount: creaturePursuer,
    };
  }

  private updateFooter() {
    const footerEl = this.contentEl.querySelector(".dnd-pursuit-summary");
    const startBtn = this.contentEl.querySelector(".dnd-pursuit-btn-primary") as HTMLButtonElement | null;
    const { quarryCount, pursuerCount } = this.countRoles();
    if (footerEl) footerEl.textContent = `${quarryCount} quarry · ${pursuerCount} pursuers`;
    if (startBtn) startBtn.disabled = quarryCount === 0 || pursuerCount === 0;
  }

  // ── Load Vault Entities ────────────────────────────────────

  private async loadVaultEntities(): Promise<VaultEntity[]> {
    const entities: VaultEntity[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      const type = fm.type;
      const isPlayer = type === "player" || type === "pc";
      const isNPC = type === "npc";
      const isCreature = !isPlayer && !isNPC && fm.statblock === true;
      if (!isPlayer && !isNPC && !isCreature) continue;

      const rawSpeed = fm.speed;
      const speeds = parseSpeed(rawSpeed);

      const hasStats = Array.isArray(fm.stats) && fm.stats.length >= 6;
      const str = hasStats && typeof fm.stats[0] === "number" ? fm.stats[0] : 10;
      const dex = hasStats && typeof fm.stats[1] === "number" ? fm.stats[1] : 10;
      const con = hasStats && typeof fm.stats[2] === "number" ? fm.stats[2] : 10;
      const wis = hasStats && typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
      const dexMod = Math.floor((dex - 10) / 2);
      const conMod = Math.floor((con - 10) / 2);
      const wisMod = Math.floor((wis - 10) / 2);

      const initBonus = isPlayer && typeof fm.init_bonus === "number" ? fm.init_bonus : dexMod;
      const stealthMod = extractSkillBonus(fm.skillsaves, "stealth") ?? dexMod;
      const percMod = extractSkillBonus(fm.skillsaves, "perception") ?? wisMod;
      const passivePerc = extractPassivePerception(fm.senses) ?? (10 + percMod);

      let size = "medium";
      if (typeof fm.size === "string") size = fm.size.toLowerCase();

      const hp = typeof fm.hp === "number" ? fm.hp : (typeof fm.hp_max === "number" ? fm.hp_max : 10);
      const maxHP = typeof fm.hp_max === "number" ? fm.hp_max : hp;

      const int = hasStats && typeof fm.stats[3] === "number" ? fm.stats[3] : 10;
      const cha = hasStats && typeof fm.stats[5] === "number" ? fm.stats[5] : 10;
      const intMod = Math.floor((int - 10) / 2);
      const chaMod = Math.floor((cha - 10) / 2);

      entities.push({
        name: fm.name || file.basename,
        notePath: file.path,
        type: isPlayer ? "player" : isCreature ? "creature" : "npc",
        speed: speeds,
        strScore: str,
        conModifier: conMod,
        stealthModifier: stealthMod,
        passivePerception: passivePerc,
        perceptionModifier: percMod,
        initBonus,
        currentHP: hp,
        maxHP,
        size,
        tokenId: fm.token_id,
        wisModifier: wisMod,
        intModifier: intMod,
        chaModifier: chaMod,
      });
    }

    return entities.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Load from Combat ───────────────────────────────────────

  private async loadFromCombatState(state: CombatState) {
    for (const c of state.combatants) {
      if (c.dead) continue;

      let speeds: SpeedEntry[] = [{ mode: "walk", feet: 30 }];
      let strScore = 10;
      let conMod = 0;
      let dexMod = c.modifier;
      let stealthMod = dexMod;
      let percMod = 0;
      let passivePerc = 10;
      let size = "medium";
      let tokenId = c.tokenId;

      let wisMod = 0;
      let intMod = 0;
      let chaMod = 0;

      if (c.notePath) {
        const file = this.app.vault.getAbstractFileByPath(c.notePath);
        if (file instanceof TFile) {
          const cache = this.app.metadataCache.getFileCache(file);
          const fm = cache?.frontmatter;
          if (fm) {
            speeds = parseSpeed(fm.speed);
            const hasStats = Array.isArray(fm.stats) && fm.stats.length >= 6;
            if (hasStats) {
              strScore = typeof fm.stats[0] === "number" ? fm.stats[0] : 10;
              const dex = typeof fm.stats[1] === "number" ? fm.stats[1] : 10;
              const con = typeof fm.stats[2] === "number" ? fm.stats[2] : 10;
              const int = typeof fm.stats[3] === "number" ? fm.stats[3] : 10;
              const wis = typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
              const cha = typeof fm.stats[5] === "number" ? fm.stats[5] : 10;
              dexMod = Math.floor((dex - 10) / 2);
              conMod = Math.floor((con - 10) / 2);
              wisMod = Math.floor((wis - 10) / 2);
              intMod = Math.floor((int - 10) / 2);
              chaMod = Math.floor((cha - 10) / 2);
              stealthMod = extractSkillBonus(fm.skillsaves, "stealth") ?? dexMod;
              percMod = extractSkillBonus(fm.skillsaves, "perception") ?? wisMod;
              passivePerc = extractPassivePerception(fm.senses) ?? (10 + percMod);
            }
            if (typeof fm.init_bonus === "number") dexMod = fm.init_bonus;
            if (typeof fm.size === "string") size = fm.size.toLowerCase();
            if (!tokenId && fm.token_id) tokenId = fm.token_id;
          }
        }
      }

      // Each combatant becomes a creature entry with count=1
      this.creatures.push({
        name: c.name,
        count: 1,
        role: c.player || c.friendly ? "quarry" : "pursuer",
        speed: speeds,
        strScore,
        conModifier: conMod,
        stealthModifier: stealthMod,
        passivePerception: passivePerc,
        perceptionModifier: percMod,
        initBonus: dexMod,
        currentHP: c.currentHP,
        maxHP: c.maxHP,
        size,
        notePath: c.notePath ?? undefined,
        entityType: c.player ? "npc" : "creature", // PCs from combat go into creature list
        tokenId,
        isCustom: false,
        hasCunningAction: false,
        wisModifier: wisMod,
        intModifier: intMod,
        chaModifier: chaMod,
        startPenalty: "none",
        hasTremorsense: false,
        combatInitiative: c.initiative,
        isPlayer: c.player === true,
      });
    }
  }

  // ── Start Chase ────────────────────────────────────────────

  private startChase() {
    const { quarryCount, pursuerCount } = this.countRoles();

    if (quarryCount === 0 || pursuerCount === 0) {
      new Notice("Need at least one quarry and one pursuer.");
      return;
    }

    const participants: PursuitParticipant[] = [];
    let idCounter = 0;
    const now = Date.now();

    // ── Party members → individual quarry participants ──
    if (this.includeParty) {
      const memberByName = new Map(
        this.allVaultEntities
          .filter((e) => e.type === "player")
          .map((e) => [e.name, e]),
      );

      for (const memberName of this.selectedPartyMembers) {
        const data = memberByName.get(memberName);
        const speed = data?.speed ?? [{ mode: "walk" as const, feet: 30 }];

        participants.push({
          id: `pursuit_${now}_${idCounter++}`,
          name: memberName,
          display: memberName,
          role: "quarry",
          initiative: 0,
          initiativeModifier: data?.initBonus ?? 0,
          speeds: speed,
          activeSpeed: speed[0]?.mode ?? "walk",
          position: this.quarryHeadStart,
          dashesUsed: 0,
          freeDashes: 3 + Math.max(0, data?.conModifier ?? 0),
          conModifier: data?.conModifier ?? 0,
          exhaustionLevel: 0,
          hasActed: false,
          hasCunningAction: false,
          hasMoved: false,
          feetMovedThisTurn: 0,
          pendingDashSave: false,
          strScore: data?.strScore ?? 10,
          estimatedWeight: SIZE_WEIGHT_ESTIMATE[data?.size ?? "medium"] ?? 150,
          stealthModifier: data?.stealthModifier ?? 0,
          passivePerception: data?.passivePerception ?? 10,
          perceptionModifier: data?.perceptionModifier ?? 0,
          lineOfSightBroken: false,
          targetIds: [],
          currentHP: data?.currentHP ?? 10,
          maxHP: data?.maxHP ?? 10,
          incapacitated: (data?.currentHP ?? 10) <= 0,
          conditions: [],
          escaped: false,
          droppedOut: false,
          player: true,
          hidden: false,
          isHidden: false,
          hiddenStealthRoll: undefined,
          movementPenalty: "none",
          complicationLoSBreak: false,
          notePath: data?.notePath,
          tokenId: data?.tokenId,
          wisModifier: data?.wisModifier ?? 0,
          intModifier: data?.intModifier ?? 0,
          chaModifier: data?.chaModifier ?? 0,
          wasOutOfSightThisRound: false,
          movementReductionFeet: 0,
          tempHP: 0,
          carrying: [],
          grappling: [],
          movementPlane: "ground",
          hasTremorsense: false,
          startPenalty: "none",
          startPenaltyApplied: false,
        });
      }
    }

    // ── Creature entries → expand by count with color-coded names ──
    for (const c of this.creatures) {
      for (let i = 0; i < c.count; i++) {
        const name = c.count > 1
          ? `${c.name} (${CREATURE_COLORS[i % CREATURE_COLORS.length]})`
          : c.name;

        participants.push({
          id: `pursuit_${now}_${idCounter++}`,
          name,
          display: name,
          role: c.role,
          initiative: c.combatInitiative ?? 0,
          initiativeModifier: c.initBonus,
          speeds: c.speed,
          activeSpeed: c.speed[0]?.mode ?? "walk",
          position: c.startPosition ?? (c.role === "quarry" ? this.quarryHeadStart : this.pursuerStart),
          dashesUsed: 0,
          freeDashes: 3 + Math.max(0, c.conModifier),
          conModifier: c.conModifier,
          exhaustionLevel: 0,
          hasActed: false,
          hasCunningAction: c.hasCunningAction,
          hasMoved: false,
          feetMovedThisTurn: 0,
          pendingDashSave: false,
          strScore: c.strScore,
          estimatedWeight: SIZE_WEIGHT_ESTIMATE[c.size] ?? 150,
          stealthModifier: c.stealthModifier,
          passivePerception: c.passivePerception,
          perceptionModifier: c.perceptionModifier,
          lineOfSightBroken: false,
          targetIds: [],
          currentHP: c.currentHP,
          maxHP: c.maxHP,
          incapacitated: c.currentHP <= 0,
          conditions: [],
          escaped: false,
          droppedOut: false,
          player: c.isPlayer === true,
          hidden: false,
          isHidden: false,
          hiddenStealthRoll: undefined,
          movementPenalty: "none",
          complicationLoSBreak: false,
          notePath: c.notePath,
          tokenId: c.tokenId,
          wisModifier: c.wisModifier,
          intModifier: c.intModifier,
          chaModifier: c.chaModifier,
          wasOutOfSightThisRound: false,
          movementReductionFeet: 0,
          tempHP: 0,
          carrying: [],
          grappling: [],
          movementPlane: "ground",
          hasTremorsense: c.hasTremorsense,
          startPenalty: c.startPenalty,
          startPenaltyApplied: false,
        });
      }
    }

    // Setup tracker
    this.plugin.pursuitTracker.setup(
      this.chaseName,
      participants,
      this.environment,
      this.hasRangerPursuer,
      this.maxDistance,
      this.maxRounds,
    );

    // If coming from combat with initiative already set, keep it
    if (this.fromCombat) {
      this.plugin.pursuitTracker.keepInitiativeFromCombat();
      // Start on the combatant whose turn it was in combat
      const activeCombatant = this.fromCombat.combatants[this.fromCombat.turnIndex];
      this.plugin.pursuitTracker.startChase(activeCombatant?.name);
    }

    this.close();

    // Open the pursuit tracker view
    this.plugin.openPursuitTracker();
    new Notice(`🏃 Chase "${this.chaseName}" started with ${participants.length} participants!`);
  }
}
