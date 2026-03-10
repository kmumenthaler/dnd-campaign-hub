import { Setting } from "obsidian";
import type { PartyManager } from "./PartyManager";
import type { Party } from "./PartyTypes";

export interface PartySelectorOptions {
  /** The PartyManager instance. */
  partyManager: PartyManager;
  /** Container element to render into. */
  container: HTMLElement;
  /** Campaign path or name for smart default resolution. */
  campaignHint?: string;
  /** Pre-selected party ID (e.g. from frontmatter). */
  initialPartyId?: string;
  /** Pre-selected member names. */
  initialMembers?: string[];
  /** Called when the selected party or members change. */
  onChange?: (partyId: string, partyName: string, selectedMembers: string[]) => void;
  /** If true show member checkboxes (default true). */
  showMembers?: boolean;
}

/**
 * Reusable party-selection widget.
 * Renders a party dropdown + optional member checkboxes with Select All / Deselect All / Refresh.
 */
export class PartySelector {
  private opts: Required<PartySelectorOptions>;
  private selectedPartyId = "";
  private selectedPartyName = "";
  private selectedMembers: string[] = [];
  private parties: Array<{ id: string; name: string; memberCount: number; avgLevel: number }> = [];

  constructor(opts: PartySelectorOptions) {
    this.opts = {
      showMembers: true,
      campaignHint: "",
      initialPartyId: "",
      initialMembers: [],
      onChange: () => {},
      ...opts,
    };
    this.selectedPartyId = this.opts.initialPartyId;
    this.selectedMembers = [...this.opts.initialMembers];
  }

  /* ── Public API ───────────────────────────────── */

  getSelectedPartyId(): string { return this.selectedPartyId; }
  getSelectedPartyName(): string { return this.selectedPartyName; }
  getSelectedMembers(): string[] { return [...this.selectedMembers]; }

  async render(): Promise<void> {
    const { container, partyManager } = this.opts;
    container.empty();

    // Build enriched party list
    const allParties = partyManager.getParties();
    this.parties = [];
    for (const p of allParties) {
      const members = await partyManager.resolveMembers(p.id);
      const avgLevel = members.length > 0
        ? Math.round(members.reduce((s, m) => s + m.level, 0) / members.length)
        : 0;
      this.parties.push({ id: p.id, name: p.name, memberCount: members.length, avgLevel });
    }

    if (this.parties.length === 0) {
      container.createEl("p", {
        text: "⚠️ No parties found — create one in Party Manager first.",
        attr: { style: "color: var(--text-warning); font-style: italic; margin: 10px 0;" },
      });
      return;
    }

    // Resolve default if no explicit selection
    if (!this.selectedPartyId) {
      const resolved = partyManager.resolveParty(undefined, this.opts.campaignHint);
      if (resolved) {
        this.selectedPartyId = resolved.id;
        this.selectedPartyName = resolved.name;
      } else {
        this.selectedPartyId = this.parties[0]!.id;
        this.selectedPartyName = this.parties[0]!.name;
      }
    } else {
      const match = this.parties.find((p) => p.id === this.selectedPartyId);
      this.selectedPartyName = match?.name || "";
    }

    // ── Party dropdown ──
    const partySetting = new Setting(container)
      .setName("Party")
      .setDesc("Choose which party to use");

    partySetting.addDropdown((dd) => {
      for (const p of this.parties) {
        const label = p.memberCount > 0
          ? `${p.name} (${p.memberCount} members, avg lvl ${p.avgLevel})`
          : `${p.name} (empty)`;
        dd.addOption(p.id, label);
      }
      dd.setValue(this.selectedPartyId);
      dd.onChange(async (value) => {
        this.selectedPartyId = value;
        const match = this.parties.find((p) => p.id === value);
        this.selectedPartyName = match?.name || "";
        this.selectedMembers = [];
        await this.renderMembers();
        this.emitChange();
      });
    });

    // ── Member checkboxes ──
    if (this.opts.showMembers) {
      await this.renderMembers();
    }
  }

  /* ── Private ──────────────────────────────────── */

  private async renderMembers(): Promise<void> {
    const { container, partyManager } = this.opts;

    // Remove existing member section if re-rendering
    container.querySelector(".dnd-ps-members")?.remove();

    const members = await partyManager.resolveMembers(this.selectedPartyId);
    if (members.length === 0) return;

    const wrapper = container.createDiv({ cls: "dnd-ps-members" });
    wrapper.style.border = "1px solid var(--background-modifier-border)";
    wrapper.style.padding = "10px";
    wrapper.style.borderRadius = "5px";
    wrapper.style.marginBottom = "10px";

    wrapper.createEl("h4", { text: "Select Party Members", attr: { style: "margin-top: 0;" } });

    // If no selection yet, default to all
    if (this.selectedMembers.length === 0) {
      this.selectedMembers = members.map((m) => m.name);
    }

    for (const member of members) {
      const row = wrapper.createDiv();
      row.style.marginBottom = "5px";

      const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = this.selectedMembers.includes(member.name);
      cb.style.marginRight = "10px";
      cb.onchange = () => {
        if (cb.checked) {
          if (!this.selectedMembers.includes(member.name)) this.selectedMembers.push(member.name);
        } else {
          this.selectedMembers = this.selectedMembers.filter((n) => n !== member.name);
        }
        this.emitChange();
      };

      const label = row.createEl("span", {
        text: `${member.name} (Level ${member.level}, HP: ${member.maxHp}, AC: ${member.ac})`,
      });
      label.style.cursor = "pointer";
      label.onclick = () => {
        cb.checked = !cb.checked;
        cb.onchange?.(new Event("change"));
      };
    }

    // Buttons row
    const btns = wrapper.createDiv();
    btns.style.marginTop = "10px";
    btns.style.display = "flex";
    btns.style.gap = "10px";

    const selectAll = btns.createEl("button", { text: "Select All" });
    selectAll.style.fontSize = "0.85em";
    selectAll.onclick = () => {
      this.selectedMembers = members.map((m) => m.name);
      this.renderMembers();
      this.emitChange();
    };

    const deselectAll = btns.createEl("button", { text: "Deselect All" });
    deselectAll.style.fontSize = "0.85em";
    deselectAll.onclick = () => {
      this.selectedMembers = [];
      this.renderMembers();
      this.emitChange();
    };

    const refreshBtn = btns.createEl("button", { text: "🔄 Refresh Stats" });
    refreshBtn.style.fontSize = "0.85em";
    refreshBtn.title = "Reload party stats from vault notes";
    refreshBtn.onclick = async () => {
      await partyManager.syncAllMemberNames();
      await this.renderMembers();
      this.emitChange();
    };
  }

  private emitChange(): void {
    this.opts.onChange(this.selectedPartyId, this.selectedPartyName, [...this.selectedMembers]);
  }
}
