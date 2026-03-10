import { App, Modal, Setting, TFile, TFolder, Notice, FuzzySuggestModal } from "obsidian";
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
  private selectedPartyId = "";
  private expandedMembers = new Set<string>();
  private settingsOpen = false;
  private dragSourceIndex = -1;
  private dragOverIndex = -1;

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
    contentEl.addClass("dnd-pm-modal");

    const parties = this.manager.getParties();
    const defaultParty = this.manager.getDefaultParty();

    // ── Header ──
    const header = contentEl.createDiv({ cls: "dnd-pm-header" });
    header.createEl("h2", { text: "Party Manager" });
    const headerActions = header.createDiv({ cls: "dnd-pm-header-actions" });

    const settingsToggle = headerActions.createEl("button", {
      cls: "dnd-pm-icon-btn",
      attr: { "aria-label": "Settings", title: "Settings" },
    });
    settingsToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    if (this.settingsOpen) settingsToggle.addClass("is-active");
    settingsToggle.addEventListener("click", () => {
      this.settingsOpen = !this.settingsOpen;
      this.render();
    });

    // ── Settings panel (collapsible) ──
    if (this.settingsOpen) {
      const settingsPanel = contentEl.createDiv({ cls: "dnd-pm-settings" });

      new Setting(settingsPanel)
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

      const utilRow = settingsPanel.createDiv({ cls: "dnd-pm-util-row" });
      const syncBtn = utilRow.createEl("button", { cls: "dnd-pm-util-btn", text: "Sync Names" });
      syncBtn.setAttribute("title", "Refresh display names from PC notes");
      syncBtn.addEventListener("click", async () => {
        await this.manager.syncAllMemberNames();
        new Notice("Party member names synced from vault");
        this.render();
      });

      const pruneBtn = utilRow.createEl("button", { cls: "dnd-pm-util-btn", text: "Prune Orphans" });
      pruneBtn.setAttribute("title", "Remove members whose notes no longer exist");
      pruneBtn.addEventListener("click", async () => {
        const removed = await this.manager.pruneOrphanedMembers();
        if (removed > 0) {
          new Notice(`Removed ${removed} orphaned member${removed !== 1 ? "s" : ""}`);
        } else {
          new Notice("No orphaned members found");
        }
        this.render();
      });
    }

    // ── Party tab bar ──
    const tabBar = contentEl.createDiv({ cls: "dnd-pm-tabs" });

    for (const party of parties) {
      const isActive = party.id === this.selectedPartyId ||
        (!this.selectedPartyId && party.id === (defaultParty?.id || parties[0]?.id));
      const isDefault = party.id === defaultParty?.id;

      const tab = tabBar.createDiv({
        cls: `dnd-pm-tab${isActive ? " is-active" : ""}`,
      });
      const tabLabel = tab.createSpan({ cls: "dnd-pm-tab-name" });
      tabLabel.setText(party.name);
      if (isDefault) {
        tab.createSpan({ text: "★", cls: "dnd-pm-tab-star" });
      }
      tab.createSpan({
        text: String(party.members.length),
        cls: "dnd-pm-tab-count",
      });
      tab.addEventListener("click", () => {
        this.selectedPartyId = party.id;
        this.render();
      });
    }

    // New party "+" tab
    const addTab = tabBar.createDiv({ cls: "dnd-pm-tab dnd-pm-tab-add" });
    addTab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addTab.setAttribute("title", "Create new party");
    addTab.addEventListener("click", () => {
      new PartyNameModal(this.app, "Create Party", "", async (name) => {
        const p = await this.manager.createParty(name);
        this.selectedPartyId = p.id;
        this.render();
      }).open();
    });

    // ── Resolve selected party ──
    if (!this.selectedPartyId || !parties.find((p) => p.id === this.selectedPartyId)) {
      this.selectedPartyId = defaultParty?.id || parties[0]?.id || "";
    }

    if (parties.length === 0) {
      const empty = contentEl.createDiv({ cls: "dnd-pm-empty" });
      empty.createEl("div", { text: "🗡️", cls: "dnd-pm-empty-icon" });
      empty.createEl("p", { text: "No parties yet" });
      empty.createEl("p", {
        text: "Create your first adventuring party to get started.",
        cls: "dnd-pm-empty-hint",
      });
      return;
    }

    const party = this.manager.getParty(this.selectedPartyId)!;
    await this.renderPartyDetail(contentEl, party, defaultParty);
  }

  /* ──────────────────────── Party Detail ──────────────────────── */

  private async renderPartyDetail(container: HTMLElement, party: Party, defaultParty: Party | undefined) {
    const detail = container.createDiv({ cls: "dnd-pm-detail" });

    // ── Party toolbar ──
    const toolbar = detail.createDiv({ cls: "dnd-pm-toolbar" });

    const renameBtn = toolbar.createEl("button", { cls: "dnd-pm-toolbar-btn", text: "Rename" });
    renameBtn.addEventListener("click", () => {
      new PartyNameModal(this.app, "Rename Party", party.name, async (name) => {
        await this.manager.renameParty(party.id, name);
        this.render();
      }).open();
    });

    if (party.id !== defaultParty?.id) {
      const defaultBtn = toolbar.createEl("button", { cls: "dnd-pm-toolbar-btn", text: "Set Default" });
      defaultBtn.addEventListener("click", async () => {
        await this.manager.setDefaultParty(party.id);
        new Notice(`"${party.name}" is now the default party`);
        this.render();
      });
    }

    // Spacer to push delete to the right
    toolbar.createDiv({ cls: "dnd-pm-toolbar-spacer" });

    const deleteBtn = toolbar.createEl("button", { cls: "dnd-pm-toolbar-btn dnd-pm-btn-danger", text: "Delete Party" });
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app);
        modal.contentEl.createEl("h3", { text: "Delete Party?" });
        modal.contentEl.createEl("p", {
          text: `Are you sure you want to delete "${party.name}" and remove all member assignments?`,
        });
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

    // ── Campaign link row ──
    await this.renderCampaignLink(detail, party);

    // ── Members section ──
    const members = await this.manager.resolveMembers(party.id);

    if (members.length === 0) {
      const emptyMembers = detail.createDiv({ cls: "dnd-pm-empty-members" });
      emptyMembers.createEl("div", { text: "👥", cls: "dnd-pm-empty-icon" });
      emptyMembers.createEl("p", { text: "No members in this party" });
      const emptyRow = emptyMembers.createDiv({ cls: "dnd-pm-add-row" });
      const addHint = emptyRow.createEl("button", {
        cls: "dnd-pm-add-btn",
        text: "Add a PC",
      });
      addHint.addEventListener("click", () => this.openPCSelectorForParty(party));
      const addCompHint = emptyRow.createEl("button", {
        cls: "dnd-pm-add-btn dnd-pm-add-companion-btn",
        text: "Add Companion",
      });
      addCompHint.addEventListener("click", () => this.openCompanionSelectorForParty(party));
      return;
    }

    // ── Summary bar ──
    this.renderSummaryBar(detail, members);

    // ── Member cards ──
    const cardsContainer = detail.createDiv({ cls: "dnd-pm-cards" });

    for (let i = 0; i < members.length; i++) {
      this.renderMemberCard(cardsContainer, party, members[i]!, i, members.length);
    }

    // ── Add member buttons at bottom ──
    const addRow = detail.createDiv({ cls: "dnd-pm-add-row" });
    const addBtn = addRow.createEl("button", { cls: "dnd-pm-add-btn" });
    addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add PC`;
    addBtn.addEventListener("click", () => this.openPCSelectorForParty(party));

    const addCompanionBtn = addRow.createEl("button", { cls: "dnd-pm-add-btn dnd-pm-add-companion-btn" });
    addCompanionBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Companion`;
    addCompanionBtn.addEventListener("click", () => this.openCompanionSelectorForParty(party));
  }

  /* ──────────────────────── Campaign Link ──────────────────────── */

  private async renderCampaignLink(container: HTMLElement, party: Party) {
    const row = container.createDiv({ cls: "dnd-pm-campaign-row" });

    if (party.campaignPath) {
      // Show linked campaign
      const campaignName = party.campaignPath.split("/").pop() || party.campaignPath;
      row.createSpan({ text: `📁 Campaign: ${campaignName}`, cls: "dnd-pm-campaign-label" });

      const importBtn = row.createEl("button", { cls: "dnd-pm-campaign-btn", text: "Import PCs" });
      importBtn.setAttribute("title", "Scan campaign folder for PCs and add them");
      importBtn.addEventListener("click", async () => {
        const count = await this.importCampaignPCs(party);
        if (count > 0) {
          new Notice(`Imported ${count} PC${count !== 1 ? "s" : ""} from campaign`);
          this.render();
        } else {
          new Notice("No new PCs found to import");
        }
      });

      const unlinkBtn = row.createEl("button", { cls: "dnd-pm-campaign-btn dnd-pm-btn-muted", text: "Unlink" });
      unlinkBtn.setAttribute("title", "Remove campaign binding (keeps members)");
      unlinkBtn.addEventListener("click", async () => {
        await this.manager.setCampaignPath(party.id, undefined);
        this.render();
      });
    } else {
      // Show link button
      const linkBtn = row.createEl("button", { cls: "dnd-pm-campaign-btn", text: "📁 Link Campaign" });
      linkBtn.setAttribute("title", "Bind this party to a campaign folder and auto-import PCs");
      linkBtn.addEventListener("click", () => {
        const folders = this.findCampaignFolders();
        if (folders.length === 0) {
          new Notice("No campaign folders found under ttrpgs/");
          return;
        }
        new CampaignFolderModal(this.app, folders, async (folder) => {
          await this.manager.setCampaignPath(party.id, folder.path);
          const count = await this.importCampaignPCs(party);
          if (count > 0) {
            new Notice(`Linked campaign and imported ${count} PC${count !== 1 ? "s" : ""}`);
          } else {
            new Notice("Campaign linked (no PCs found to import)");
          }
          this.render();
        }).open();
      });
    }
  }

  private findCampaignFolders(): TFolder[] {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    if (!(ttrpgsFolder instanceof TFolder)) return [];

    return ttrpgsFolder.children.filter((c): c is TFolder => c instanceof TFolder);
  }

  private async importCampaignPCs(party: Party): Promise<number> {
    if (!party.campaignPath) return 0;

    const pcsPath = `${party.campaignPath}/PCs`;
    const pcsFolder = this.app.vault.getAbstractFileByPath(pcsPath);
    if (!(pcsFolder instanceof TFolder)) return 0;

    const existingPaths = new Set(party.members.map((m) => m.notePath));
    let imported = 0;

    for (const child of pcsFolder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      if (existingPaths.has(child.path)) continue;

      const cache = this.app.metadataCache.getFileCache(child);
      const type = cache?.frontmatter?.type;
      if (type !== "player" && type !== "pc") continue;

      const name = cache?.frontmatter?.name || child.basename;
      await this.manager.addMember(party.id, child.path, name);
      imported++;
    }

    return imported;
  }

  /* ──────────────────────── Summary Bar ──────────────────────── */

  private renderSummaryBar(container: HTMLElement, members: ResolvedPartyMember[]) {
    const bar = container.createDiv({ cls: "dnd-pm-summary" });

    const pcs = members.filter((m) => m.role !== "companion");
    const companions = members.filter((m) => m.role === "companion");
    const totalHP = members.reduce((s, m) => s + m.hp, 0);
    const totalMaxHP = members.reduce((s, m) => s + m.maxHp, 0);
    const hpPct = totalMaxHP > 0 ? Math.round((totalHP / totalMaxHP) * 100) : 0;
    const avgAC = members.length > 0 ? Math.round(members.reduce((s, m) => s + m.ac, 0) / members.length) : 0;
    const avgLevel = pcs.length > 0 ? (pcs.reduce((s, m) => s + m.level, 0) / pcs.length) : 0;

    // Members count
    const stat = (icon: string, label: string, value: string) => {
      const s = bar.createDiv({ cls: "dnd-pm-stat" });
      s.createSpan({ text: icon, cls: "dnd-pm-stat-icon" });
      s.createSpan({ text: label, cls: "dnd-pm-stat-label" });
      s.createSpan({ text: value, cls: "dnd-pm-stat-value" });
      return s;
    };

    const memberStr = companions.length > 0
      ? `${pcs.length} PC${pcs.length !== 1 ? "s" : ""} + ${companions.length}`
      : String(members.length);
    stat("👥", "Members", memberStr);

    // Party HP with mini bar
    const hpStat = stat("❤️", "HP", `${totalHP}/${totalMaxHP}`);
    const miniBar = hpStat.createDiv({ cls: "dnd-pm-stat-bar" });
    const fill = miniBar.createDiv({ cls: "dnd-pm-stat-bar-fill" });
    fill.style.width = `${hpPct}%`;
    if (hpPct > 66) fill.addClass("hp-healthy");
    else if (hpPct > 33) fill.addClass("hp-wounded");
    else fill.addClass("hp-critical");

    stat("🛡️", "Avg AC", String(avgAC));
    stat("⚔️", "Avg Lvl", avgLevel % 1 === 0 ? String(avgLevel) : avgLevel.toFixed(1));
  }

  /* ──────────────────────── Member Card ──────────────────────── */

  private renderMemberCard(
    container: HTMLElement,
    party: Party,
    member: ResolvedPartyMember,
    index: number,
    total: number,
  ) {
    const isExpanded = this.expandedMembers.has(member.notePath);
    const isCompanion = member.role === "companion";

    // ── Outer wrapper: sidebar actions + card ──
    const row = container.createDiv({ cls: "dnd-pm-member-row" });

    // ── Left sidebar actions ──
    const sidebar = row.createDiv({ cls: "dnd-pm-sidebar-actions" });

    const upBtn = sidebar.createEl("button", { cls: "dnd-pm-icon-btn dnd-pm-move-btn" });
    upBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>`;
    upBtn.setAttribute("title", "Move up");
    if (index > 0) {
      upBtn.addEventListener("click", async () => {
        await this.manager.reorderMember(party.id, index, index - 1);
        this.render();
      });
    } else {
      upBtn.style.visibility = "hidden";
    }

    const removeBtn = sidebar.createEl("button", { cls: "dnd-pm-icon-btn dnd-pm-remove-btn" });
    removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    removeBtn.setAttribute("title", "Remove from party");
    removeBtn.addEventListener("click", async () => {
      await this.manager.removeMember(party.id, member.notePath);
      this.expandedMembers.delete(member.notePath);
      this.render();
    });

    const downBtn = sidebar.createEl("button", { cls: "dnd-pm-icon-btn dnd-pm-move-btn" });
    downBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    downBtn.setAttribute("title", "Move down");
    if (index < total - 1) {
      downBtn.addEventListener("click", async () => {
        await this.manager.reorderMember(party.id, index, index + 1);
        this.render();
      });
    } else {
      downBtn.style.visibility = "hidden";
    }

    // ── Card ──
    const card = row.createDiv({
      cls: `dnd-pm-card${isExpanded ? " is-expanded" : ""}${!member.enabled ? " is-disabled" : ""}${isCompanion ? " is-companion" : ""}`,
    });
    card.dataset.index = String(index);

    // ── Card click toggles expand ──
    card.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, .dnd-pm-drag-handle")) return;
      if (isExpanded) {
        // Animate closed, then re-render
        const panel = card.querySelector(".dnd-pm-detail-panel") as HTMLElement;
        if (panel) {
          // Reset overflow and pin max-height so transition has a start value
          panel.style.overflow = "hidden";
          panel.style.maxHeight = panel.scrollHeight + "px";
          // Force reflow so browser registers the starting value
          void panel.offsetHeight;
          panel.style.maxHeight = "0";
          panel.removeClass("is-open");
          panel.addEventListener("transitionend", () => {
            this.expandedMembers.delete(member.notePath);
            this.render();
          }, { once: true });
        } else {
          this.expandedMembers.delete(member.notePath);
          this.render();
        }
      } else {
        this.expandedMembers.add(member.notePath);
        this.render();
      }
    });

    // ── Drag handle ──
    const handle = card.createDiv({ cls: "dnd-pm-drag-handle" });
    handle.innerHTML = "⠿";
    handle.setAttribute("title", "Drag to reorder");
    handle.draggable = true;
    handle.addEventListener("dragstart", (e) => {
      this.dragSourceIndex = index;
      card.addClass("is-dragging");
      e.dataTransfer?.setData("text/plain", String(index));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      card.removeClass("is-dragging");
      container.querySelectorAll(".dnd-pm-card").forEach((c) => c.removeClass("drag-over"));
      this.dragSourceIndex = -1;
      this.dragOverIndex = -1;
    });

    // Card-level drop target
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (this.dragSourceIndex !== index) {
        container.querySelectorAll(".dnd-pm-card").forEach((c) => c.removeClass("drag-over"));
        card.addClass("drag-over");
        this.dragOverIndex = index;
      }
    });
    card.addEventListener("dragleave", () => {
      card.removeClass("drag-over");
    });
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.removeClass("drag-over");
      if (this.dragSourceIndex >= 0 && this.dragSourceIndex !== index) {
        await this.manager.reorderMember(party.id, this.dragSourceIndex, index);
        this.render();
      }
    });

    // ── Avatar ──
    const avatar = card.createDiv({ cls: "dnd-pm-avatar" });
    this.renderAvatar(avatar, member);

    // ── Info column ──
    const info = card.createDiv({ cls: "dnd-pm-info" });

    // Name row
    const nameRow = info.createDiv({ cls: "dnd-pm-name-row" });
    if (isCompanion) {
      nameRow.createSpan({ text: "Companion", cls: "dnd-pm-role-badge" });
    }
    const nameLink = nameRow.createEl("a", { text: member.name, cls: "dnd-pm-name" });
    nameLink.addEventListener("click", (e) => {
      e.preventDefault();
      const file = this.app.vault.getAbstractFileByPath(member.notePath);
      if (file instanceof TFile) {
        this.app.workspace.getLeaf(false).openFile(file);
      }
    });

    // Sub-text: class + race, or CR for creatures
    const subtitleParts = [member.class, member.race].filter(Boolean);
    if (isCompanion && member.cr) subtitleParts.push(`CR ${member.cr}`);
    const subtitle = subtitleParts.join(" · ");
    if (subtitle) {
      nameRow.createSpan({ text: subtitle, cls: "dnd-pm-subtitle" });
    }

    // Expand chevron indicator
    const expandIndicator = nameRow.createSpan({ cls: "dnd-pm-expand-indicator" });
    expandIndicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    // ── Stats row ──
    const statsRow = info.createDiv({ cls: "dnd-pm-stats-row" });

    // Level / CR badge
    const lvl = statsRow.createDiv({ cls: "dnd-pm-badge dnd-pm-level-badge" });
    if (isCompanion && member.cr) {
      lvl.createSpan({ text: "CR", cls: "dnd-pm-badge-label" });
      lvl.createSpan({ text: member.cr, cls: "dnd-pm-badge-value" });
    } else {
      lvl.createSpan({ text: "Lvl", cls: "dnd-pm-badge-label" });
      lvl.createSpan({ text: String(member.level), cls: "dnd-pm-badge-value" });
    }

    // HP
    const hpPct = member.maxHp > 0 ? Math.max(0, Math.min(100, (member.hp / member.maxHp) * 100)) : 0;
    const hpGroup = statsRow.createDiv({ cls: "dnd-pm-hp-group" });
    const hpText = hpGroup.createDiv({ cls: "dnd-pm-hp-text" });
    hpText.createSpan({ text: "❤️ ", cls: "dnd-pm-hp-icon" });
    hpText.createSpan({ text: `${member.hp}/${member.maxHp}` });
    if (member.thp > 0) {
      hpText.createSpan({ text: ` +${member.thp}`, cls: "dnd-pm-thp" });
    }
    const hpBar = hpGroup.createDiv({ cls: "dnd-pm-hp-bar" });
    const hpFill = hpBar.createDiv({ cls: "dnd-pm-hp-fill" });
    hpFill.style.width = `${hpPct}%`;
    if (hpPct > 66) hpFill.addClass("hp-healthy");
    else if (hpPct > 33) hpFill.addClass("hp-wounded");
    else hpFill.addClass("hp-critical");

    // AC badge
    const ac = statsRow.createDiv({ cls: "dnd-pm-badge dnd-pm-ac-badge" });
    ac.createSpan({ text: "🛡️", cls: "dnd-pm-badge-label" });
    ac.createSpan({ text: String(member.ac), cls: "dnd-pm-badge-value" });

    // Init badge
    const initVal = member.initBonus >= 0 ? `+${member.initBonus}` : String(member.initBonus);
    const init = statsRow.createDiv({ cls: "dnd-pm-badge dnd-pm-init-badge" });
    init.createSpan({ text: "⚡", cls: "dnd-pm-badge-label" });
    init.createSpan({ text: initVal, cls: "dnd-pm-badge-value" });

    // ── Detail panel (always rendered, animated via CSS) ──
    const detailPanel = card.createDiv({ cls: "dnd-pm-detail-panel" });
    const grid = detailPanel.createDiv({ cls: "dnd-pm-detail-grid" });

    const addDetail = (label: string, value: string | undefined) => {
      if (!value) return;
      const row = grid.createDiv({ cls: "dnd-pm-detail-row" });
      row.createSpan({ text: label, cls: "dnd-pm-detail-label" });
      row.createSpan({ text: value, cls: "dnd-pm-detail-value" });
    };

    addDetail("Player", member.player);
    addDetail("Race", member.race);
    addDetail("Class", member.class);
    addDetail("Level", member.level > 0 ? String(member.level) : undefined);
    addDetail("CR", member.cr);
    addDetail("Role", isCompanion ? "Companion" : "PC");
    addDetail("Temp HP", member.thp > 0 ? String(member.thp) : undefined);
    addDetail("Init Bonus", initVal);
    addDetail("Token", member.tokenId ? "Assigned" : "None");
    addDetail("Note", member.notePath.split("/").pop()?.replace(".md", ""));

    // Animate open after layout
    if (isExpanded) {
      requestAnimationFrame(() => {
        detailPanel.addClass("is-open");
        detailPanel.style.maxHeight = detailPanel.scrollHeight + "px";
        // After transition, remove max-height cap so content is never clipped
        detailPanel.addEventListener("transitionend", () => {
          if (detailPanel.hasClass("is-open")) {
            detailPanel.style.maxHeight = "none";
            detailPanel.style.overflow = "visible";
          }
        }, { once: true });
      });
    }
  }

  /* ──────────────────────── Avatar ──────────────────────── */

  private renderAvatar(container: HTMLElement, member: ResolvedPartyMember) {
    let imageFile: string | undefined;

    // Try token image from MarkerLibrary
    if (member.tokenId) {
      const marker = this.plugin.markerLibrary.getMarker(member.tokenId);
      if (marker?.imageFile) imageFile = marker.imageFile;
    }

    // Fallback: match by name
    if (!imageFile) {
      const matches = this.plugin.markerLibrary.findMarkersByName(member.name);
      const withImage = matches.find((m) => m.imageFile);
      if (withImage) imageFile = withImage.imageFile;
    }

    if (imageFile) {
      const img = container.createEl("img", { cls: "dnd-pm-avatar-img" });
      img.src = this.app.vault.adapter.getResourcePath(imageFile);
      img.alt = member.name;
    } else {
      // Colored initials fallback
      const initials = member.name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
      const fallback = container.createDiv({ cls: "dnd-pm-avatar-fallback" });
      // Deterministic color from name
      let hash = 0;
      for (const ch of member.name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
      const hue = ((hash % 360) + 360) % 360;
      fallback.style.backgroundColor = `hsl(${hue}, 45%, 45%)`;
      fallback.setText(initials);
    }
  }

  /* ──────────────────────── Helpers ──────────────────────── */

  private openPCSelectorForParty(party: Party) {
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
  }

  private openCompanionSelectorForParty(party: Party) {
    const existingPaths = new Set(party.members.map((m) => m.notePath));
    const companionFiles = this.app.vault.getFiles().filter((f) => {
      if (existingPaths.has(f.path)) return false;
      const cache = this.app.metadataCache.getFileCache(f);
      const fm = cache?.frontmatter;
      if (!fm) return false;
      // NPC notes use type: "npc", creature notes use statblock: true
      return fm.type === "npc" || fm.statblock === true;
    });

    if (companionFiles.length === 0) {
      new Notice("No NPC or creature notes found");
      return;
    }

    new CompanionSelectorModal(this.app, companionFiles, async (file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const name = cache?.frontmatter?.name || file.basename;
      await this.manager.addCompanion(party.id, file.path, name);
      this.render();
    }).open();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ──────────────────────── Sub-Modals ──────────────────────── */

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
    contentEl.addClass("dnd-pm-name-modal");
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
    const ok = btns.createEl("button", { text: "OK", cls: "mod-cta" });
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

/** Fuzzy-search modal to select a campaign folder. */
class CampaignFolderModal extends FuzzySuggestModal<TFolder> {
  private folders: TFolder[];
  private onChoose: (folder: TFolder) => void;

  constructor(app: App, folders: TFolder[], onChoose: (folder: TFolder) => void) {
    super(app);
    this.folders = folders;
    this.onChoose = onChoose;
    this.setPlaceholder("Search campaigns…");
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(item: TFolder): string {
    return item.name;
  }

  onChooseItem(item: TFolder): void {
    this.onChoose(item);
  }
}

/** Fuzzy-search modal to select an NPC or creature note as a companion. */
class CompanionSelectorModal extends FuzzySuggestModal<TFile> {
  private files: TFile[];
  private onChoose: (file: TFile) => void;

  constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.setPlaceholder("Search NPCs and creatures…");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    const cache = this.app.metadataCache.getFileCache(item);
    const fm = cache?.frontmatter;
    const name = fm?.name || item.basename;
    const isCreature = fm?.statblock === true;
    const type = isCreature ? "Creature" : "NPC";
    const extra = isCreature
      ? (fm?.cr ? ` CR ${fm.cr}` : "")
      : (fm?.occupation ? ` — ${fm.occupation}` : "");
    return `${name} (${type}${extra})`;
  }

  onChooseItem(item: TFile): void {
    this.onChoose(item);
  }
}
