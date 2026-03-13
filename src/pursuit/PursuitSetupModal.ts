/**
 * PursuitSetupModal — Modal for setting up a chase / pursuit encounter.
 *
 * Can be opened standalone or pre-populated from an active CombatTracker state.
 * Lets the GM:
 *  - Name the chase
 *  - Configure the environment (cover, obscurement, crowd, etc.)
 *  - Add participants from vault notes (PCs, NPCs, creatures)
 *  - Assign roles (quarry / pursuer)
 *  - Review speeds, carry pairings, and stealth/perception stats
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
  private participants: Array<VaultEntity & { role: PursuitRole; initiative: number; hasCunningAction: boolean }> = [];

  // ── Pre-populated from combat? ──
  private fromCombat: CombatState | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin, combatState?: CombatState) {
    super(app);
    this.plugin = plugin;
    if (combatState) this.fromCombat = combatState;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-pursuit-setup-modal");

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
    const envDesc = contentEl.createEl("p", {
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

    // ── Participants ──
    contentEl.createEl("h3", { text: "Participants" });

    if (this.participants.length === 0) {
      contentEl.createEl("p", { text: "No participants yet. Add from vault or combat tracker.", cls: "setting-item-description" });
    } else {
      this.renderParticipantTable(contentEl);
    }

    // ── Add from vault ──
    const addRow = contentEl.createDiv({ cls: "dnd-pursuit-add-row" });
    const addBtn = addRow.createEl("button", { text: "➕ Add from Vault", cls: "dnd-pursuit-btn" });
    addBtn.addEventListener("click", () => this.showVaultPicker());

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

  // ── Participant Table ──────────────────────────────────────

  private renderParticipantTable(container: HTMLElement) {
    const table = container.createEl("table", { cls: "dnd-pursuit-table" });
    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    for (const h of ["Name", "Role", "Speed", "Init", "HP", "STR", "Stealth", "PPerc", "Cunning", "Actions"]) {
      hr.createEl("th", { text: h });
    }

    const tbody = table.createEl("tbody");
    for (const p of this.participants) {
      const tr = tbody.createEl("tr");
      tr.addClass(p.role === "quarry" ? "dnd-pursuit-quarry-row" : "dnd-pursuit-pursuer-row");

      // Name
      tr.createEl("td", { text: p.name });

      // Role toggle
      const roleTd = tr.createEl("td");
      const roleBtn = roleTd.createEl("button", {
        text: p.role === "quarry" ? "🏃 Quarry" : "🔍 Pursuer",
        cls: "dnd-pursuit-role-btn",
      });
      roleBtn.addEventListener("click", () => {
        p.role = p.role === "quarry" ? "pursuer" : "quarry";
        this.renderContent();
      });

      // Speed
      const speedTd = tr.createEl("td");
      const speedText = p.speed.map((s) => `${s.mode} ${s.feet}ft`).join(", ");
      speedTd.createEl("span", { text: speedText, cls: "dnd-pursuit-speed" });

      // Initiative
      const initTd = tr.createEl("td");
      const initInput = initTd.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-init-input",
        attr: { value: String(p.initiative), min: "1", max: "30" },
      });
      initInput.addEventListener("change", () => {
        p.initiative = parseInt(initInput.value, 10) || 0;
      });

      // HP
      tr.createEl("td", { text: `${p.currentHP}/${p.maxHP}` });

      // STR
      const strTd = tr.createEl("td");
      const strInput = strTd.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-str-input",
        attr: { value: String(p.strScore), min: "1", max: "30" },
      });
      strInput.addEventListener("change", () => {
        p.strScore = parseInt(strInput.value, 10) || 10;
      });

      // Stealth
      const stTd = tr.createEl("td");
      const stInput = stTd.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-stat-input",
        attr: { value: String(p.stealthModifier) },
      });
      stInput.addEventListener("change", () => {
        p.stealthModifier = parseInt(stInput.value, 10) || 0;
      });

      // Passive Perception
      const ppTd = tr.createEl("td");
      const ppInput = ppTd.createEl("input", {
        type: "number",
        cls: "dnd-pursuit-stat-input",
        attr: { value: String(p.passivePerception) },
      });
      ppInput.addEventListener("change", () => {
        p.passivePerception = parseInt(ppInput.value, 10) || 10;
      });

      // Cunning Action
      const caTd = tr.createEl("td");
      const caCheck = caTd.createEl("input", { type: "checkbox" });
      caCheck.checked = p.hasCunningAction;
      caCheck.addEventListener("change", () => {
        p.hasCunningAction = caCheck.checked;
      });

      // Remove button
      const actTd = tr.createEl("td");
      const removeBtn = actTd.createEl("button", { text: "✕", cls: "dnd-pursuit-remove-btn" });
      removeBtn.addEventListener("click", () => {
        this.participants = this.participants.filter((x) => x !== p);
        this.renderContent();
      });
    }
  }

  // ── Vault Picker ───────────────────────────────────────────

  private async showVaultPicker() {
    const entities = await this.loadVaultEntities();
    const modal = new VaultEntityPickerModal(this.app, entities, (picked) => {
      for (const e of picked) {
        // Avoid duplicates
        if (this.participants.some((p) => p.notePath === e.notePath)) continue;
        this.participants.push({
          ...e,
          role: "quarry",
          initiative: 0,
          hasCunningAction: false,
        });
      }
      this.renderContent();
    });
    modal.open();
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
      if (type !== "player" && type !== "pc" && type !== "npc" && type !== "creature") continue;

      const isPlayer = type === "player" || type === "pc";
      const isCreature = type === "creature";

      // Speed
      const rawSpeed = fm.speed;
      const speeds = parseSpeed(rawSpeed);

      // STR
      let strScore = 10;
      if (isCreature && Array.isArray(fm.stats) && fm.stats.length >= 1) {
        strScore = typeof fm.stats[0] === "number" ? fm.stats[0] : 10;
      }

      // CON modifier
      let conMod = 0;
      if (isCreature && Array.isArray(fm.stats) && fm.stats.length >= 3) {
        const con = typeof fm.stats[2] === "number" ? fm.stats[2] : 10;
        conMod = Math.floor((con - 10) / 2);
      }

      // DEX modifier (for stealth and initiative)
      let dexMod = 0;
      if (isPlayer && typeof fm.init_bonus === "number") {
        dexMod = fm.init_bonus;
      } else if (isCreature && Array.isArray(fm.stats) && fm.stats.length >= 2) {
        const dex = typeof fm.stats[1] === "number" ? fm.stats[1] : 10;
        dexMod = Math.floor((dex - 10) / 2);
      }

      // WIS modifier (for perception)
      let wisMod = 0;
      if (isCreature && Array.isArray(fm.stats) && fm.stats.length >= 5) {
        const wis = typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
        wisMod = Math.floor((wis - 10) / 2);
      }

      // Size → weight estimate
      let size = "medium";
      if (isCreature && typeof fm.size === "string") {
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
        strScore,
        conModifier: conMod,
        stealthModifier: dexMod, // Default to DEX mod; GM can override
        passivePerception: 10 + wisMod,
        perceptionModifier: wisMod,
        initBonus: dexMod,
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
      let wisMod = 0;
      let size = "medium";

      if (c.notePath) {
        const file = this.app.vault.getAbstractFileByPath(c.notePath);
        if (file instanceof TFile) {
          const cache = this.app.metadataCache.getFileCache(file);
          const fm = cache?.frontmatter;
          if (fm) {
            speeds = parseSpeed(fm.speed);
            if (Array.isArray(fm.stats) && fm.stats.length >= 6) {
              strScore = typeof fm.stats[0] === "number" ? fm.stats[0] : 10;
              const con = typeof fm.stats[2] === "number" ? fm.stats[2] : 10;
              conMod = Math.floor((con - 10) / 2);
              const wis = typeof fm.stats[4] === "number" ? fm.stats[4] : 10;
              wisMod = Math.floor((wis - 10) / 2);
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
        stealthModifier: dexMod,
        passivePerception: 10 + wisMod,
        perceptionModifier: wisMod,
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

// ── Vault Entity Picker (sub-modal) ──────────────────────────

class VaultEntityPickerModal extends Modal {
  private entities: VaultEntity[];
  private onPick: (entities: VaultEntity[]) => void;
  private selected: Set<string> = new Set();
  private searchQuery = "";

  constructor(app: App, entities: VaultEntity[], onPick: (entities: VaultEntity[]) => void) {
    super(app);
    this.entities = entities;
    this.onPick = onPick;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-pursuit-picker-modal");
    contentEl.createEl("h3", { text: "Add Participants" });

    // Search
    new Setting(contentEl)
      .setName("Search")
      .addText((text) =>
        text.setPlaceholder("Filter by name...").onChange((v) => {
          this.searchQuery = v.toLowerCase().trim();
          this.renderList(listEl);
        })
      );

    const listEl = contentEl.createDiv({ cls: "dnd-pursuit-picker-list" });
    this.renderList(listEl);

    // Confirm
    const footer = contentEl.createDiv({ cls: "dnd-pursuit-footer" });
    const confirmBtn = footer.createEl("button", { text: "✅ Add Selected", cls: "dnd-pursuit-btn dnd-pursuit-btn-primary" });
    confirmBtn.addEventListener("click", () => {
      const picked = this.entities.filter((e) => this.selected.has(e.notePath));
      this.onPick(picked);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private renderList(container: HTMLElement) {
    container.empty();

    const filtered = this.entities.filter((e) =>
      !this.searchQuery || e.name.toLowerCase().includes(this.searchQuery)
    );

    if (filtered.length === 0) {
      container.createEl("p", { text: "No matching entities found.", cls: "setting-item-description" });
      return;
    }

    for (const e of filtered) {
      const row = container.createDiv({ cls: "dnd-pursuit-picker-row" });
      const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = this.selected.has(e.notePath);
      cb.addEventListener("change", () => {
        if (cb.checked) this.selected.add(e.notePath);
        else this.selected.delete(e.notePath);
      });

      const typeIcon = e.type === "player" ? "👤" : e.type === "npc" ? "🎭" : "🐉";
      row.createEl("span", { text: `${typeIcon} ${e.name}`, cls: "dnd-pursuit-picker-name" });

      const speedText = e.speed.map((s) => `${s.feet}ft ${s.mode}`).join(", ");
      row.createEl("span", { text: speedText, cls: "dnd-pursuit-picker-speed" });
    }
  }
}
