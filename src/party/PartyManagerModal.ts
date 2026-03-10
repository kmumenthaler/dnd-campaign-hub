import { App, Modal, Setting, TFile, Notice, FuzzySuggestModal } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { PartyManager } from "./PartyManager";
import type { Party, ResolvedPartyMember } from "./PartyTypes";

/**
 * Modal for managing parties: create, rename, delete parties
 * and add/remove PC members with live stat display.
 */
export class PartyManagerModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private manager: PartyManager;
  private selectedPartyId: string = "";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
    this.manager = plugin.partyManager;
  }

  onOpen() {
    this.render();
  }

  private async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-party-manager-modal");

    contentEl.createEl("h2", { text: "⚔️ Party Manager" });

    const parties = this.manager.getParties();
    const defaultParty = this.manager.getDefaultParty();

    // ── Top bar: create party + settings ──
    const topBar = contentEl.createDiv({ cls: "dnd-party-manager-topbar" });

    const createBtn = topBar.createEl("button", { text: "➕ New Party" });
    createBtn.addEventListener("click", async () => {
      new PartyNameModal(this.app, "Create Party", "", async (name) => {
        const party = await this.manager.createParty(name);
        this.selectedPartyId = party.id;
        this.render();
      }).open();
    });

    const syncBtn = topBar.createEl("button", { text: "🔄 Sync Names" });
    syncBtn.setAttribute("title", "Refresh display names from PC notes");
    syncBtn.addEventListener("click", async () => {
      await this.manager.syncAllMemberNames();
      new Notice("✅ Party member names synced from vault");
      this.render();
    });

    const pruneBtn = topBar.createEl("button", { text: "🧹 Prune Orphans" });
    pruneBtn.setAttribute("title", "Remove members whose notes no longer exist");
    pruneBtn.addEventListener("click", async () => {
      const removed = await this.manager.pruneOrphanedMembers();
      if (removed > 0) {
        new Notice(`🧹 Removed ${removed} orphaned member${removed !== 1 ? "s" : ""}`);
      } else {
        new Notice("✅ No orphaned members found");
      }
      this.render();
    });

    // ── Roll Player Initiatives setting ──
    const settingsSection = contentEl.createDiv({ cls: "dnd-party-manager-settings" });
    new Setting(settingsSection)
      .setName("Roll initiative for PCs")
      .setDesc("When rolling all initiative in combat, auto-roll for PCs too?")
      .addDropdown((d) => {
        d.addOption("0", "Don't roll (manual)");
        d.addOption("1", "Roll automatically");
        d.addOption("2", "Let players roll");
        d.setValue(String(this.manager.rollPlayerInitiatives));
        d.onChange(async (v) => {
          await this.manager.setRollPlayerInitiatives(parseInt(v) as 0 | 1 | 2);
        });
      });

    if (parties.length === 0) {
      contentEl.createEl("p", {
        text: "No parties yet. Create one to get started!",
        cls: "dnd-party-manager-empty",
      });
      return;
    }

    // ── Party selector tabs ──
    if (!this.selectedPartyId || !parties.find((p) => p.id === this.selectedPartyId)) {
      this.selectedPartyId = defaultParty?.id || parties[0]!.id;
    }

    const tabBar = contentEl.createDiv({ cls: "dnd-party-manager-tabs" });
    for (const party of parties) {
      const tab = tabBar.createEl("button", {
        text: party.name + (party.id === defaultParty?.id ? " ⭐" : ""),
        cls: `dnd-party-tab${party.id === this.selectedPartyId ? " is-active" : ""}`,
      });
      tab.addEventListener("click", () => {
        this.selectedPartyId = party.id;
        this.render();
      });
    }

    // ── Selected party detail ──
    const party = this.manager.getParty(this.selectedPartyId)!;
    await this.renderPartyDetail(contentEl, party, defaultParty);
  }

  private async renderPartyDetail(container: HTMLElement, party: Party, defaultParty: Party | undefined) {
    const section = container.createDiv({ cls: "dnd-party-detail" });

    // ── Party actions ──
    const actions = section.createDiv({ cls: "dnd-party-actions" });

    const renameBtn = actions.createEl("button", { text: "✏️ Rename" });
    renameBtn.addEventListener("click", () => {
      new PartyNameModal(this.app, "Rename Party", party.name, async (name) => {
        await this.manager.renameParty(party.id, name);
        this.render();
      }).open();
    });

    if (party.id !== defaultParty?.id) {
      const defaultBtn = actions.createEl("button", { text: "⭐ Set Default" });
      defaultBtn.addEventListener("click", async () => {
        await this.manager.setDefaultParty(party.id);
        new Notice(`⭐ "${party.name}" is now the default party`);
        this.render();
      });
    }

    const deleteBtn = actions.createEl("button", { text: "🗑️ Delete", cls: "mod-warning" });
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app);
        modal.contentEl.createEl("h3", { text: "Delete Party?" });
        modal.contentEl.createEl("p", { text: `Delete "${party.name}" and all its member assignments?` });
        const btns = modal.contentEl.createDiv({ cls: "modal-button-container" });
        btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => { modal.close(); resolve(false); });
        const del = btns.createEl("button", { text: "Delete", cls: "mod-warning" });
        del.addEventListener("click", () => { modal.close(); resolve(true); });
        modal.open();
      });
      if (confirmed) {
        await this.manager.deleteParty(party.id);
        this.selectedPartyId = "";
        this.render();
      }
    });

    // ── Add member button ──
    const addBar = section.createDiv({ cls: "dnd-party-add-bar" });
    const addBtn = addBar.createEl("button", { text: "➕ Add PC" });
    addBtn.addEventListener("click", () => {
      // Find all PC notes not already in this party
      const existingPaths = new Set(party.members.map((m) => m.notePath));
      const pcFiles = this.app.vault.getFiles().filter((f) => {
        if (existingPaths.has(f.path)) return false;
        const cache = this.app.metadataCache.getFileCache(f);
        return cache?.frontmatter?.type === "player";
      });

      if (pcFiles.length === 0) {
        new Notice("No unassigned PC notes found");
        return;
      }

      new PCSelectorModal(this.app, pcFiles, async (file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        const name = cache?.frontmatter?.name || file.basename;
        await this.manager.addMember(party.id, file.path, name);
        this.render();
      }).open();
    });

    // ── Member list with live stats ──
    const members = await this.manager.resolveMembers(party.id);

    if (members.length === 0) {
      section.createEl("p", {
        text: "No members in this party. Add PCs using the button above.",
        cls: "dnd-party-empty-members",
      });
      return;
    }

    const table = section.createEl("table", { cls: "dnd-party-member-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const h of ["Name", "Lvl", "HP", "AC", "Init", ""]) {
      headerRow.createEl("th", { text: h });
    }

    const tbody = table.createEl("tbody");
    for (const member of members) {
      const row = tbody.createEl("tr");
      // Name (clickable → open note)
      const nameCell = row.createEl("td");
      const nameLink = nameCell.createEl("a", { text: member.name, cls: "dnd-party-member-link" });
      nameLink.addEventListener("click", (e) => {
        e.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(member.notePath);
        if (file instanceof TFile) {
          this.app.workspace.getLeaf(false).openFile(file);
        }
      });
      if (member.class) {
        nameCell.createEl("span", { text: ` (${member.class})`, cls: "dnd-party-member-class" });
      }

      // Level
      row.createEl("td", { text: String(member.level) });

      // HP with bar
      const hpCell = row.createEl("td");
      const hpPct = Math.max(0, Math.min(100, (member.hp / member.maxHp) * 100));
      hpCell.createEl("span", { text: `${member.hp}/${member.maxHp}` });
      const hpBar = hpCell.createDiv({ cls: "dnd-party-hp-bar-bg" });
      const hpFill = hpBar.createDiv({ cls: "dnd-party-hp-bar-fill" });
      hpFill.style.width = `${hpPct}%`;
      if (hpPct > 66) hpFill.addClass("hp-healthy");
      else if (hpPct > 33) hpFill.addClass("hp-wounded");
      else hpFill.addClass("hp-critical");

      // AC
      row.createEl("td", { text: String(member.ac) });

      // Init bonus
      const initText = member.initBonus >= 0 ? `+${member.initBonus}` : String(member.initBonus);
      row.createEl("td", { text: initText });

      // Remove button
      const actionCell = row.createEl("td");
      const removeBtn = actionCell.createEl("button", { text: "✕", cls: "dnd-party-remove-btn" });
      removeBtn.setAttribute("title", "Remove from party");
      removeBtn.addEventListener("click", async () => {
        await this.manager.removeMember(party.id, member.notePath);
        this.render();
      });
    }

    // ── Summary row ──
    const summary = section.createDiv({ cls: "dnd-party-summary" });
    const totalHP = members.reduce((s, m) => s + m.hp, 0);
    const totalMaxHP = members.reduce((s, m) => s + m.maxHp, 0);
    const avgAC = members.length > 0 ? Math.round(members.reduce((s, m) => s + m.ac, 0) / members.length) : 0;
    const avgLevel = members.length > 0 ? (members.reduce((s, m) => s + m.level, 0) / members.length).toFixed(1) : "0";
    summary.setText(
      `${members.length} members • Total HP: ${totalHP}/${totalMaxHP} • Avg AC: ${avgAC} • Avg Level: ${avgLevel}`,
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Simple modal to enter/edit a party name. */
class PartyNameModal extends Modal {
  private callback: (name: string) => void;
  private value: string;
  private title: string;

  constructor(app: App, title: string, initial: string, callback: (name: string) => void) {
    super(app);
    this.title = title;
    this.value = initial;
    this.callback = callback;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });

    new Setting(contentEl).setName("Party name").addText((text) => {
      text
        .setPlaceholder("e.g. Dragon Heist Party")
        .setValue(this.value)
        .onChange((v) => { this.value = v; });
      text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") { this.submit(); }
      });
      setTimeout(() => text.inputEl.focus(), 50);
    });

    const btns = contentEl.createDiv({ cls: "modal-button-container" });
    btns.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const ok = btns.createEl("button", { text: "OK" });
    ok.style.backgroundColor = "var(--interactive-accent)";
    ok.style.color = "var(--text-on-accent)";
    ok.addEventListener("click", () => this.submit());
  }

  private submit() {
    const name = this.value.trim();
    if (!name) {
      new Notice("Party name cannot be empty");
      return;
    }
    this.callback(name);
    this.close();
  }

  onClose() { this.contentEl.empty(); }
}

/** Fuzzy-search modal to select a PC note. */
class PCSelectorModal extends FuzzySuggestModal<TFile> {
  private files: TFile[];
  private onChoose: (file: TFile) => void;

  constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.setPlaceholder("Search PC notes…");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    const cache = this.app.metadataCache.getFileCache(item);
    const name = cache?.frontmatter?.name || item.basename;
    const cls = cache?.frontmatter?.class || "";
    const lvl = cache?.frontmatter?.level || "";
    return `${name}${cls ? ` (${cls}` + (lvl ? ` ${lvl}` : "") + ")" : ""}`;
  }

  onChooseItem(item: TFile): void {
    this.onChoose(item);
  }
}
