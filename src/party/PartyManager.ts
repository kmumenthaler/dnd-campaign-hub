import { App, TFile, Notice } from "obsidian";
import type {
  Party,
  PartyMemberRef,
  ResolvedPartyMember,
  StoredEncounter,
  StoredEncounterCreature,
  PartyManagerData,
  PartyChangeListener,
} from "./PartyTypes";

/**
 * Self-contained party and encounter management engine.
 * Persists data in `parties.json` inside the plugin folder.
 * PC note frontmatter is the source of truth for stats —
 * the manager resolves live values on every query.
 */
export class PartyManager {
  private app: App;
  private pluginId: string;
  private filePath: string;
  private data: PartyManagerData;
  private listeners = new Set<PartyChangeListener>();

  constructor(app: App, pluginId: string) {
    this.app = app;
    this.pluginId = pluginId;
    this.filePath = `.obsidian/plugins/${pluginId}/parties.json`;
    this.data = PartyManager.emptyData();
  }

  private static emptyData(): PartyManagerData {
    return {
      version: "1.0.0",
      parties: [],
      encounters: {},
      defaultPartyId: "",
      rollPlayerInitiatives: 0,
    };
  }

  /* ────────────────── Persistence ────────────────── */

  async load(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.filePath)) {
        const content = await adapter.read(this.filePath);
        const raw = JSON.parse(content) as PartyManagerData;
        this.data = {
          ...PartyManager.emptyData(),
          ...raw,
        };
      } else {
        await this.save();
      }
    } catch (error) {
      console.error("[PartyManager] Failed to load:", error);
      this.data = PartyManager.emptyData();
    }
  }

  async save(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      await adapter.write(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("[PartyManager] Failed to save:", error);
    }
  }

  /* ────────────────── Listeners ────────────────── */

  onChange(fn: PartyChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try { fn(); } catch (e) { console.error("[PartyManager] Listener error:", e); }
    }
  }

  /* ────────────────── ID Generation ────────────────── */

  generateId(): string {
    const chars = "0123456789abcdef";
    let id = "ID_";
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  /* ────────────────── Party CRUD ────────────────── */

  getParties(): Party[] {
    return [...this.data.parties];
  }

  getParty(id: string): Party | undefined {
    return this.data.parties.find((p) => p.id === id);
  }

  getPartyByName(name: string): Party | undefined {
    return this.data.parties.find((p) => p.name === name);
  }

  getDefaultParty(): Party | undefined {
    if (this.data.defaultPartyId) {
      const p = this.getParty(this.data.defaultPartyId);
      if (p) return p;
    }
    return this.data.parties[0];
  }

  async createParty(name: string, campaignPath?: string): Promise<Party> {
    const party: Party = {
      id: this.generateId(),
      name,
      members: [],
      createdAt: new Date().toISOString(),
      ...(campaignPath ? { campaignPath } : {}),
    };
    this.data.parties.push(party);

    // Set as default if it's the first party
    if (this.data.parties.length === 1) {
      this.data.defaultPartyId = party.id;
    }

    await this.save();
    this.emit();
    return party;
  }

  async deleteParty(id: string): Promise<boolean> {
    const idx = this.data.parties.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    this.data.parties.splice(idx, 1);

    if (this.data.defaultPartyId === id) {
      this.data.defaultPartyId = this.data.parties[0]?.id || "";
    }

    await this.save();
    this.emit();
    return true;
  }

  async renameParty(id: string, newName: string): Promise<boolean> {
    const party = this.getParty(id);
    if (!party) return false;
    party.name = newName;
    await this.save();
    this.emit();
    return true;
  }

  async setDefaultParty(id: string): Promise<void> {
    this.data.defaultPartyId = id;
    await this.save();
    this.emit();
  }

  /* ────────────────── Member Management ────────────────── */

  async addMember(partyId: string, notePath: string, name: string): Promise<boolean> {
    const party = this.getParty(partyId);
    if (!party) return false;

    // Prevent duplicates
    if (party.members.some((m) => m.notePath === notePath)) return false;

    party.members.push({ notePath, name });
    await this.save();
    this.emit();
    return true;
  }

  async removeMember(partyId: string, notePath: string): Promise<boolean> {
    const party = this.getParty(partyId);
    if (!party) return false;

    const idx = party.members.findIndex((m) => m.notePath === notePath);
    if (idx < 0) return false;

    party.members.splice(idx, 1);
    await this.save();
    this.emit();
    return true;
  }

  /** Update the cached display name for a member (e.g. after a rename). */
  async updateMemberName(notePath: string, newName: string): Promise<void> {
    let changed = false;
    for (const party of this.data.parties) {
      const member = party.members.find((m) => m.notePath === notePath);
      if (member && member.name !== newName) {
        member.name = newName;
        changed = true;
      }
    }
    if (changed) {
      await this.save();
      this.emit();
    }
  }

  /** Reorder a member within a party (move from one index to another). */
  async reorderMember(partyId: string, fromIndex: number, toIndex: number): Promise<boolean> {
    const party = this.getParty(partyId);
    if (!party) return false;
    if (fromIndex < 0 || fromIndex >= party.members.length) return false;
    if (toIndex < 0 || toIndex >= party.members.length) return false;
    if (fromIndex === toIndex) return false;

    const [member] = party.members.splice(fromIndex, 1);
    party.members.splice(toIndex, 0, member!);
    await this.save();
    this.emit();
    return true;
  }

  /** Update stored note path when a PC note is renamed / moved. */
  async updateMemberPath(oldPath: string, newPath: string): Promise<void> {
    let changed = false;
    for (const party of this.data.parties) {
      const member = party.members.find((m) => m.notePath === oldPath);
      if (member) {
        member.notePath = newPath;
        changed = true;
      }
    }
    if (changed) {
      await this.save();
      this.emit();
    }
  }

  /* ────────────────── Smart Party Resolution ────────────────── */

  /**
   * Resolve the "best" party given optional context.
   * Priority: explicit ID → campaignPath match → campaign-name convention → default → first.
   */
  resolveParty(partyIdOrName?: string, campaignName?: string): Party | undefined {
    const parties = this.data.parties;
    if (parties.length === 0) return undefined;

    // 1. Explicit match by ID or name
    if (partyIdOrName) {
      const match = parties.find(
        (p) => p.id === partyIdOrName || p.name === partyIdOrName,
      );
      if (match) return match;
    }

    if (campaignName) {
      // 2a. Match by campaignPath (e.g. "ttrpgs/Frozen Sick")
      const byPath = parties.find((p) => p.campaignPath === campaignName);
      if (byPath) return byPath;

      // 2b. Match by campaignPath ending with the campaign name
      const byPathEnd = parties.find((p) =>
        p.campaignPath && p.campaignPath.split("/").pop() === campaignName,
      );
      if (byPathEnd) return byPathEnd;

      // 2c. Convention: "<CampaignName> Party"
      const partyName = `${campaignName} Party`;
      const match = parties.find((p) => p.name === partyName);
      if (match) return match;
    }

    // 3. Default
    return this.getDefaultParty();
  }

  /**
   * Resolve party from a vault file path by extracting the campaign name.
   * Looks for "ttrpgs/<CampaignName>/..." in the path.
   */
  resolvePartyFromPath(filePath: string, partyIdOverride?: string): Party | undefined {
    let campaignName = "";
    const pathParts = filePath.split("/");
    const ttrpgsIndex = pathParts.indexOf("ttrpgs");
    if (ttrpgsIndex >= 0 && ttrpgsIndex < pathParts.length - 1) {
      campaignName = pathParts[ttrpgsIndex + 1] || "";
    }
    return this.resolveParty(partyIdOverride, campaignName);
  }

  /**
   * Cascading party resolution from a note's context.
   * Walks: note frontmatter (party_id / selected_party_id) →
   *        campaign folder path → default party.
   */
  resolvePartyForNote(notePath: string): Party | undefined {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (file instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm) {
        // Check note-level party_id or selected_party_id
        const notePartyId = fm.party_id || fm.selected_party_id;
        if (notePartyId) {
          const match = this.getParty(notePartyId) ||
            this.data.parties.find((p) => p.name === notePartyId);
          if (match) return match;
        }

        // Check campaign_path frontmatter
        if (fm.campaign_path) {
          const match = this.resolveParty(undefined, fm.campaign_path);
          if (match) return match;
        }

        // Check campaign frontmatter (bare name)
        if (fm.campaign) {
          const match = this.resolveParty(undefined, fm.campaign);
          if (match) return match;
        }
      }
    }

    // Fall back to path-based resolution
    return this.resolvePartyFromPath(notePath);
  }

  /** Get all parties bound to a specific campaign path. */
  getPartiesForCampaign(campaignPath: string): Party[] {
    const normalised = campaignPath.replace(/\\/g, "/");
    return this.data.parties.filter((p) => p.campaignPath === normalised);
  }

  /** Set (or clear) the campaign path on a party. */
  async setCampaignPath(partyId: string, campaignPath: string | undefined): Promise<boolean> {
    const party = this.getParty(partyId);
    if (!party) return false;
    if (campaignPath) {
      party.campaignPath = campaignPath.replace(/\\/g, "/");
    } else {
      delete party.campaignPath;
    }
    await this.save();
    this.emit();
    return true;
  }

  /* ────────────────── Live Stats Resolution ────────────────── */

  /**
   * Resolve live stats for all members of a party from vault frontmatter.
   * This is the canonical way to get party member data — never use stale caches.
   */
  async resolveMembers(partyId: string): Promise<ResolvedPartyMember[]> {
    const party = this.getParty(partyId);
    if (!party) return [];

    const results: ResolvedPartyMember[] = [];
    for (const ref of party.members) {
      const resolved = await this.resolveMemberFromNote(ref.notePath);
      if (resolved) {
        results.push(resolved);
      }
    }
    return results;
  }

  /**
   * Resolve a single PC's stats from their vault note frontmatter.
   */
  async resolveMemberFromNote(notePath: string): Promise<ResolvedPartyMember | null> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return null;

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) return null;

    return {
      name: fm.name || file.basename,
      notePath,
      level: parseInt(fm.level) || 1,
      hp: parseInt(fm.hp) || parseInt(fm.hp_max) || 1,
      maxHp: parseInt(fm.hp_max) || parseInt(fm.hp) || 1,
      thp: parseInt(fm.thp) || 0,
      ac: parseInt(fm.ac) || 10,
      initBonus: parseInt(String(fm.init_bonus || "0").replace(/[^-\d]/g, "")) || 0,
      tokenId: fm.token_id || undefined,
      player: fm.player || undefined,
      race: fm.race || undefined,
      class: fm.class || undefined,
      enabled: fm.enabled !== false,
    };
  }

  /**
   * Get or create a campaign party (convention: "<CampaignName> Party").
   * Used by PC creation / import flows and campaign creation.
   */
  async getOrCreateCampaignParty(campaignName: string, campaignPath?: string): Promise<Party> {
    const partyName = `${campaignName} Party`;
    const existing = this.getPartyByName(partyName);
    if (existing) {
      // Backfill campaignPath if it was created before this feature
      if (campaignPath && !existing.campaignPath) {
        await this.setCampaignPath(existing.id, campaignPath);
      }
      return existing;
    }
    return this.createParty(partyName, campaignPath);
  }

  /**
   * Register a PC into the appropriate campaign party.
   * Creates the party if it doesn't exist.
   */
  async registerPC(
    pcName: string,
    pcNotePath: string,
    campaignName: string,
  ): Promise<void> {
    // Derive campaignPath from pcNotePath: "ttrpgs/CampaignName/PCs/Foo.md" → "ttrpgs/CampaignName"
    let campaignPath: string | undefined;
    const parts = pcNotePath.split("/");
    const ttrpgsIdx = parts.indexOf("ttrpgs");
    if (ttrpgsIdx >= 0 && ttrpgsIdx + 1 < parts.length) {
      campaignPath = parts.slice(0, ttrpgsIdx + 2).join("/");
    }

    const party = await this.getOrCreateCampaignParty(campaignName, campaignPath);

    // Check for duplicate
    if (party.members.some((m) => m.notePath === pcNotePath || m.name === pcName)) {
      return;
    }

    await this.addMember(party.id, pcNotePath, pcName);
  }

  /* ────────────────── Encounter Storage ────────────────── */

  getEncounter(name: string): StoredEncounter | undefined {
    return this.data.encounters[name];
  }

  getAllEncounters(): Record<string, StoredEncounter> {
    return { ...this.data.encounters };
  }

  async saveEncounter(name: string, encounter: StoredEncounter): Promise<void> {
    this.data.encounters[name] = encounter;
    await this.save();
    this.emit();
  }

  async deleteEncounter(name: string): Promise<boolean> {
    if (!this.data.encounters[name]) return false;
    delete this.data.encounters[name];
    await this.save();
    this.emit();
    return true;
  }

  /**
   * Build a StoredEncounter from creature and party member data.
   * Convenience method used by the EncounterBuilder.
   */
  buildEncounter(
    name: string,
    creatures: StoredEncounterCreature[],
    notePath?: string,
  ): StoredEncounter {
    return {
      name,
      notePath,
      creatures,
      started: false,
      round: 1,
    };
  }

  /**
   * Format a resolved party member as a StoredEncounterCreature for encounter storage.
   */
  memberToEncounterCreature(member: ResolvedPartyMember): StoredEncounterCreature {
    return {
      name: member.name,
      display: member.name,
      hp: member.maxHp,
      maxHP: member.maxHp,
      currentHP: member.hp,
      tempHP: member.thp,
      ac: member.ac,
      currentAC: member.ac,
      initiative: 0,
      modifier: member.initBonus,
      level: member.level,
      player: true,
      friendly: false,
      hidden: false,
      enabled: true,
      notePath: member.notePath,
      tokenId: member.tokenId,
      id: this.generateId(),
      statuses: [],
    };
  }

  /* ────────────────── Settings ────────────────── */

  /** Whether to auto-roll initiative for PCs (0=no, 1=yes, 2=let players). */
  get rollPlayerInitiatives(): 0 | 1 | 2 {
    return this.data.rollPlayerInitiatives;
  }

  async setRollPlayerInitiatives(value: 0 | 1 | 2): Promise<void> {
    this.data.rollPlayerInitiatives = value;
    await this.save();
  }

  /* ────────────────── Sync Utilities ────────────────── */

  /**
   * Sync all member display names from vault frontmatter.
   * Call this on plugin load or when notes are renamed.
   */
  async syncAllMemberNames(): Promise<void> {
    let changed = false;
    for (const party of this.data.parties) {
      for (const member of party.members) {
        const file = this.app.vault.getAbstractFileByPath(member.notePath);
        if (file instanceof TFile) {
          const cache = this.app.metadataCache.getFileCache(file);
          const name = cache?.frontmatter?.name || file.basename;
          if (member.name !== name) {
            member.name = name;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      await this.save();
      this.emit();
    }
  }

  /**
   * Remove members whose notes no longer exist in the vault.
   * Returns the number of orphaned members removed.
   */
  async pruneOrphanedMembers(): Promise<number> {
    let removed = 0;
    for (const party of this.data.parties) {
      const before = party.members.length;
      party.members = party.members.filter((m) => {
        const file = this.app.vault.getAbstractFileByPath(m.notePath);
        return file instanceof TFile;
      });
      removed += before - party.members.length;
    }
    if (removed > 0) {
      await this.save();
      this.emit();
    }
    return removed;
  }

  /**
   * Check if a PC note path exists in any party.
   */
  isRegistered(notePath: string): boolean {
    return this.data.parties.some((p) =>
      p.members.some((m) => m.notePath === notePath),
    );
  }

  /**
   * Find which parties a PC belongs to.
   */
  getPartiesForMember(notePath: string): Party[] {
    return this.data.parties.filter((p) =>
      p.members.some((m) => m.notePath === notePath),
    );
  }
}
