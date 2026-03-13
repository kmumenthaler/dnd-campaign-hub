/**
 * PursuitSetupModal — Modal for setting up a chase / pursuit encounter.
 *
 * Can be opened standalone or pre-populated from an active CombatTracker state.
 * Lets the GM:
 *  - Name the chase
 *  - Configure the environment (cover, obscurement, crowd, etc.)
 *  - Add participants via inline search (like the encounter builder)
 *  - Assign roles (quarry / pursuer), review stats from statblocks
 *  - Initiate the chase
 */

import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { Combatant, CombatState } from "../combat/types";
import type {
  PursuitParticipant,
  PursuitRole,
  ChaseEnvironment,
  SpeedEntry,
} from "./types";
import { parseSpeed, SIZE_WEIGHT_ESTIMATE, computeCarryPenalty } from "./types";

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

/** Minimal data for a vault entity we can add to a chase. */
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
}

type Participant = VaultEntity & { role: PursuitRole; initiative: number; hasCunningAction: boolean };

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
    notes: "",
  };
  private hasRangerPursuer = false;

  // ── Participants ──
  private participants: Participant[] = [];

  // ── Vault entities cache ──
  private vaultEntities: VaultEntity[] = [];
  private vaultEntitiesLoaded = false;

  // ── Pre-populated from combat? ──
  private fromCombat: CombatState | null = null;

  // ── Participant list container (for partial re-renders) ──
  private participantListEl: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, combatState?: CombatState) {
    super(app);
    this.plugin = plugin;
    if (combatState) this.fromCombat = combatState;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-pursuit-setup-modal");

    // Pre-load vault entities
    this.vaultEntities = await this.loadVaultEntities();
    this.vaultEntitiesLoaded = true;

    // Pre-populate from combat if available
    if (this.fromCombat) {
      this.chaseName = `Chase — ${this.fromCombat.encounterName}`;
      await this.loadFromCombatState(this.fromCombat);
    }

    this.renderContent();
  }

  onClose() {
    this.contentEl.empty();
  }

  // ── Render ─────────────────────────────────────────────────

  private renderContent() {
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
      .setName("Ranger / Survival pursuer")
      .setDesc("At least one pursuer is a ranger or has proficiency in Survival (disadvantage)")
      .addToggle((t) =>
        t.setValue(this.hasRangerPursuer).onChange((v) => { this.hasRangerPursuer = v; })
      );

    // ── Add Participants (inline search) ──
    contentEl.createEl("h3", { text: "Participants" });
    this.renderAddParticipantSearch(contentEl);

    // ── Participant list ──
    this.participantListEl = contentEl.createDiv({ cls: "dnd-pursuit-participant-list" });
    this.renderParticipantList();

    // ── Start button ──
    contentEl.createEl("hr");
    const footer = contentEl.createDiv({ cls: "dnd-pursuit-footer" });

    const quarryCount = this.participants.filter((p) => p.role === "quarry").length;
    const pursuerCount = this.participants.filter((p) => p.role === "pursuer").length;
    footer.createEl("span", {
      text: `${quarryCount} quarry · ${pursuerCount} pursuers`,
      cls: "dnd-pursuit-summary",
    });

    const startBtn = footer.createEl("button", { text: "🏃 Start Chase", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    startBtn.disabled = quarryCount === 0 || pursuerCount === 0;
    startBtn.addEventListener("click", () => this.startChase());
  }

  // ── Inline search (encounter-builder style) ────────────────

  private renderAddParticipantSearch(container: HTMLElement) {
    const count = this.vaultEntitiesLoaded ? this.vaultEntities.length : 0;

    const setting = new Setting(container)
      .setName("Add from Vault")
      .setDesc(`Search PCs, NPCs, and creatures (${count} available)`);

    // Search input + dropdown
    const searchContainer = setting.controlEl.createDiv({ cls: "dnd-pursuit-search-container" });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search by name…",
      cls: "dnd-pursuit-search-input",
    });
    const resultsEl = searchContainer.createDiv({ cls: "dnd-pursuit-search-results" });
    resultsEl.style.display = "none";

    let selectedEntity: VaultEntity | null = null;
    let addRole: PursuitRole = "quarry";

    // Role selector
    const roleContainer = setting.controlEl.createDiv({ cls: "dnd-inline-checkbox" });
    roleContainer.style.display = "inline-flex";
    roleContainer.style.alignItems = "center";
    roleContainer.style.marginLeft = "8px";

    const roleSelect = roleContainer.createEl("select", { cls: "dropdown" });
    const quarryOpt = roleSelect.createEl("option", { text: "🏃 Quarry", attr: { value: "quarry" } });
    const pursuerOpt = roleSelect.createEl("option", { text: "🔍 Pursuer", attr: { value: "pursuer" } });
    roleSelect.addEventListener("change", () => {
      addRole = roleSelect.value as PursuitRole;
    });

    // Add button
    setting.addButton((btn) =>
      btn.setButtonText("Add").setCta().onClick(() => {
        this.addSelectedEntity(selectedEntity, addRole, searchInput);
        selectedEntity = null;
      })
    );

    // ── Search filtering ──
    const showResults = (query: string) => {
      if (!query || query.length < 1) {
        resultsEl.style.display = "none";
        return;
      }
      const q = query.toLowerCase().trim();
      const filtered = this.vaultEntities
        .filter((e) => e.name.toLowerCase().includes(q))
        .slice(0, 15);

      resultsEl.empty();

      if (filtered.length === 0) {
        resultsEl.createDiv({ text: "No matches found", cls: "dnd-pursuit-search-no-results" });
        resultsEl.style.display = "block";
        return;
      }

      for (const entity of filtered) {
        const row = resultsEl.createDiv({ cls: "dnd-pursuit-search-result" });

        // Name with type icon
        const typeIcon = entity.type === "player" ? "👤" : entity.type === "npc" ? "🎭" : "🐉";
        row.createDiv({ text: `${typeIcon} ${entity.name}`, cls: "dnd-pursuit-search-result-name" });

        // Stats row
        const speed = entity.speed.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
        const parts: string[] = [speed];
        parts.push(`STR ${entity.strScore}`);
        parts.push(`Stealth ${entity.stealthModifier >= 0 ? "+" : ""}${entity.stealthModifier}`);
        parts.push(`PPerc ${entity.passivePerception}`);
        if (entity.currentHP > 0) parts.push(`HP ${entity.currentHP}/${entity.maxHP}`);
        row.createDiv({ text: parts.join(" · "), cls: "dnd-pursuit-search-result-stats" });

        row.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectedEntity = entity;
          searchInput.value = entity.name;
          resultsEl.style.display = "none";
        });
      }

      resultsEl.style.display = "block";
    };

    searchInput.addEventListener("input", (e) => {
      selectedEntity = null;
      showResults((e.target as HTMLInputElement).value);
    });

    searchInput.addEventListener("focus", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v.length >= 1) showResults(v);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && selectedEntity) {
        e.preventDefault();
        this.addSelectedEntity(selectedEntity, addRole, searchInput);
        selectedEntity = null;
      }
    });

    searchInput.addEventListener("blur", () => {
      setTimeout(() => { resultsEl.style.display = "none"; }, 250);
    });
  }

  private addSelectedEntity(entity: VaultEntity | null, role: PursuitRole, searchInput: HTMLInputElement) {
    if (!entity) {
      new Notice("Search and select a participant first.");
      return;
    }
    // Allow duplicates for creatures (multiple of same type), prevent for PCs/NPCs
    if (entity.type !== "creature" && this.participants.some((p) => p.notePath === entity.notePath)) {
      new Notice(`${entity.name} is already in the chase.`);
      return;
    }

    this.participants.push({
      ...entity,
      role,
      initiative: 0,
      hasCunningAction: false,
    });

    new Notice(`Added ${entity.name} as ${role}`);
    searchInput.value = "";
    this.renderParticipantList();
    this.updateFooter();
  }

  // ── Participant List ───────────────────────────────────────

  private renderParticipantList() {
    const el = this.participantListEl;
    if (!el) return;
    el.empty();

    if (this.participants.length === 0) {
      el.createEl("p", { text: "No participants yet. Search above to add PCs, NPCs, or creatures.", cls: "setting-item-description" });
      return;
    }

    for (const p of this.participants) {
      const item = el.createDiv({
        cls: `dnd-pursuit-participant-item ${p.role === "quarry" ? "dnd-pursuit-quarry-row" : "dnd-pursuit-pursuer-row"}`,
      });

      // ── Top row: name + role + remove ──
      const topRow = item.createDiv({ cls: "dnd-pursuit-participant-top" });

      const typeIcon = p.type === "player" ? "👤" : p.type === "npc" ? "🎭" : "🐉";
      topRow.createSpan({ text: `${typeIcon} ${p.name}`, cls: "dnd-pursuit-participant-name" });

      const roleBtn = topRow.createEl("button", {
        text: p.role === "quarry" ? "🏃 Quarry" : "🔍 Pursuer",
        cls: "dnd-pursuit-role-btn",
      });
      roleBtn.addEventListener("click", () => {
        p.role = p.role === "quarry" ? "pursuer" : "quarry";
        this.renderParticipantList();
        this.updateFooter();
      });

      const removeBtn = topRow.createEl("button", { text: "✕", cls: "dnd-pursuit-remove-btn" });
      removeBtn.addEventListener("click", () => {
        this.participants = this.participants.filter((x) => x !== p);
        this.renderParticipantList();
        this.updateFooter();
      });

      // ── Stats row (read-only from statblock, editable overrides) ──
      const statsRow = item.createDiv({ cls: "dnd-pursuit-participant-stats" });

      // Speed
      const speedText = p.speed.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
      statsRow.createSpan({ text: `⚡ ${speedText}`, cls: "dnd-pursuit-stat-chip" });

      // HP
      statsRow.createSpan({ text: `❤️ ${p.currentHP}/${p.maxHP}`, cls: "dnd-pursuit-stat-chip" });

      // STR
      this.addEditableStatChip(statsRow, "STR", p.strScore, (v) => { p.strScore = v; });

      // Stealth
      this.addEditableStatChip(statsRow, "Stealth", p.stealthModifier, (v) => { p.stealthModifier = v; }, true);

      // Passive Perception
      this.addEditableStatChip(statsRow, "PPerc", p.passivePerception, (v) => { p.passivePerception = v; });

      // CON mod (for free dashes)
      const conLabel = p.conModifier >= 0 ? `+${p.conModifier}` : `${p.conModifier}`;
      statsRow.createSpan({ text: `CON ${conLabel}`, cls: "dnd-pursuit-stat-chip dnd-pursuit-stat-chip-muted" });

      // Cunning Action
      const caChip = statsRow.createSpan({ cls: `dnd-pursuit-stat-chip dnd-pursuit-stat-chip-toggle ${p.hasCunningAction ? "active" : ""}` });
      caChip.textContent = `🗡️ Cunning`;
      caChip.addEventListener("click", () => {
        p.hasCunningAction = !p.hasCunningAction;
        caChip.classList.toggle("active", p.hasCunningAction);
      });
    }
  }

  private addEditableStatChip(
    container: HTMLElement, label: string, value: number,
    onChange: (v: number) => void, showSign = false,
  ) {
    const chip = container.createSpan({ cls: "dnd-pursuit-stat-chip dnd-pursuit-stat-chip-editable" });
    const display = showSign ? (value >= 0 ? `+${value}` : `${value}`) : `${value}`;
    chip.createSpan({ text: `${label} ` });
    const input = chip.createEl("input", {
      type: "number",
      cls: "dnd-pursuit-stat-chip-input",
      attr: { value: String(value) },
    });
    input.addEventListener("change", () => {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) onChange(v);
    });
  }

  private updateFooter() {
    // Re-render footer counts without full re-render
    const footerEl = this.contentEl.querySelector(".dnd-pursuit-summary");
    if (footerEl) {
      const quarryCount = this.participants.filter((p) => p.role === "quarry").length;
      const pursuerCount = this.participants.filter((p) => p.role === "pursuer").length;
      footerEl.textContent = `${quarryCount} quarry · ${pursuerCount} pursuers`;
    }
    const startBtn = this.contentEl.querySelector(".dnd-pursuit-btn-primary") as HTMLButtonElement | null;
    if (startBtn) {
      const quarryCount = this.participants.filter((p) => p.role === "quarry").length;
      const pursuerCount = this.participants.filter((p) => p.role === "pursuer").length;
      startBtn.disabled = quarryCount === 0 || pursuerCount === 0;
    }
  }

  /** Load PCs, NPCs, and creatures from the vault. */
  private async loadVaultEntities(): Promise<VaultEntity[]> {
    const entities: VaultEntity[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;

      const type = fm.type;
      // Creatures don't have type:"creature" — they have statblock:true
      // and their type field is the monster type (e.g. "beast", "fiend").
      // PCs have type:"player"/"pc", NPCs have type:"npc".
      const isPlayer = type === "player" || type === "pc";
      const isNPC = type === "npc";
      const isCreature = !isPlayer && !isNPC && fm.statblock === true;
      if (!isPlayer && !isNPC && !isCreature) continue;

      // Speed
      const rawSpeed = fm.speed;
      const speeds = parseSpeed(rawSpeed);

      // ── Ability scores (all types can have stats[]) ──
      const hasStats = Array.isArray(fm.stats) && fm.stats.length >= 6;
      const str = hasStats && typeof fm.stats[0] === "number" ? fm.stats[0] : 10;
      const dex = hasStats && typeof fm.stats[1] === "number" ? fm.stats[1] : 10;
      const con = hasStats && typeof fm.stats[2] === "number" ? fm.stats[2] : 10;
      const wis = hasStats && typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
      const dexMod = Math.floor((dex - 10) / 2);
      const conMod = Math.floor((con - 10) / 2);
      const wisMod = Math.floor((wis - 10) / 2);

      // Initiative bonus: PCs may store a separate init_bonus
      const initBonus = isPlayer && typeof fm.init_bonus === "number" ? fm.init_bonus : dexMod;

      // ── Stealth: prefer skillsaves, fall back to DEX mod ──
      const stealthMod = extractSkillBonus(fm.skillsaves, "stealth") ?? dexMod;

      // ── Perception: prefer skillsaves, fall back to WIS mod ──
      const percMod = extractSkillBonus(fm.skillsaves, "perception") ?? wisMod;

      // ── Passive Perception: prefer senses string, else 10 + percMod ──
      const passivePerc = extractPassivePerception(fm.senses) ?? (10 + percMod);

      // Size → weight estimate
      let size = "medium";
      if (typeof fm.size === "string") {
        size = fm.size.toLowerCase();
      }

      // HP
      const hp = typeof fm.hp === "number" ? fm.hp : (typeof fm.hp_max === "number" ? fm.hp_max : 10);
      const maxHP = typeof fm.hp_max === "number" ? fm.hp_max : hp;

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
      });
    }

    return entities.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Load from Combat ───────────────────────────────────────

  private async loadFromCombatState(state: CombatState) {
    for (const c of state.combatants) {
      if (c.dead) continue;

      // Try to read full stats from vault note
      let speeds: SpeedEntry[] = [{ mode: "walk", feet: 30 }];
      let strScore = 10;
      let conMod = 0;
      let dexMod = c.modifier;
      let stealthMod = dexMod;
      let percMod = 0;
      let passivePerc = 10;
      let size = "medium";

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
              const wis = typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
              dexMod = Math.floor((dex - 10) / 2);
              conMod = Math.floor((con - 10) / 2);
              const wisMod = Math.floor((wis - 10) / 2);
              stealthMod = extractSkillBonus(fm.skillsaves, "stealth") ?? dexMod;
              percMod = extractSkillBonus(fm.skillsaves, "perception") ?? wisMod;
              passivePerc = extractPassivePerception(fm.senses) ?? (10 + percMod);
            }
            if (typeof fm.init_bonus === "number") dexMod = fm.init_bonus;
            if (typeof fm.size === "string") size = fm.size.toLowerCase();
          }
        }
      }

      this.participants.push({
        name: c.name,
        notePath: c.notePath ?? "",
        type: c.player ? "player" : "creature",
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
        tokenId: c.tokenId,
        role: c.player || c.friendly ? "quarry" : "pursuer",
        initiative: c.initiative,
        hasCunningAction: false,
      });
    }
  }

  // ── Start Chase ────────────────────────────────────────────

  private startChase() {
    const quarryCount = this.participants.filter((p) => p.role === "quarry").length;
    const pursuerCount = this.participants.filter((p) => p.role === "pursuer").length;

    if (quarryCount === 0 || pursuerCount === 0) {
      new Notice("Need at least one quarry and one pursuer.");
      return;
    }

    // Convert to PursuitParticipant[]
    const participants: PursuitParticipant[] = this.participants.map((p, i) => ({
      id: `pursuit_${Date.now()}_${i}`,
      name: p.name,
      display: p.name,
      role: p.role,
      initiative: p.initiative,
      initiativeModifier: p.initBonus,
      speeds: p.speed,
      activeSpeed: p.speed[0]?.mode ?? "walk",
      position: p.role === "quarry" ? 60 : 0, // Quarry starts 60ft ahead
      dashesUsed: 0,
      freeDashes: 3 + Math.max(0, p.conModifier),
      conModifier: p.conModifier,
      exhaustionLevel: 0,
      hasActed: false,
      hasCunningAction: p.hasCunningAction,
      strScore: p.strScore,
      estimatedWeight: SIZE_WEIGHT_ESTIMATE[p.size] ?? 150,
      stealthModifier: p.stealthModifier,
      passivePerception: p.passivePerception,
      perceptionModifier: p.perceptionModifier,
      lineOfSightBroken: false,
      targetIds: [],
      currentHP: p.currentHP,
      maxHP: p.maxHP,
      incapacitated: p.currentHP <= 0,
      conditions: [],
      escaped: false,
      droppedOut: false,
      player: p.type === "player",
      hidden: false,
      notePath: p.notePath || undefined,
      tokenId: p.tokenId,
    }));

    // Setup tracker
    this.plugin.pursuitTracker.setup(
      this.chaseName,
      participants,
      this.environment,
      this.hasRangerPursuer,
    );

    // If coming from combat with initiative already set, keep it
    if (this.fromCombat) {
      this.plugin.pursuitTracker.keepInitiativeFromCombat();
      this.plugin.pursuitTracker.startChase();
    }

    this.close();

    // Open the pursuit tracker view
    this.plugin.openPursuitTracker();
    new Notice(`🏃 Chase "${this.chaseName}" started!`);
  }
}
