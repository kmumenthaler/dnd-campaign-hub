import { App, ItemView, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SESSION_PREP_VIEW_TYPE } from "../constants";
import { SessionCreationModal } from "./SessionCreationModal";

export class SessionPrepDashboardView extends ItemView {
  private static readonly AUTO_REFRESH_MS = 30000;

  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  private refreshInterval: number | null = null;
  private freshnessTickInterval: number | null = null;
  private refreshDebounceTimeout: number | null = null;
  private expandedSections: Set<string> = new Set();
  private isRendering = false;
  private pendingRefreshReason: string | null = null;
  private lastRenderedAt = 0;
  private lastRefreshReason = "initial";
  private sceneFilter: "session" | "all" = "session";
  private targetSessionPath = "";

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.getActiveCampaignPath();
  }

  getViewType(): string {
    return SESSION_PREP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Session Prep Dashboard";
  }

  getIcon(): string {
    return "clipboard-list";
  }

  setCampaign(campaignPath: string) {
    this.campaignPath = campaignPath;
    this.targetSessionPath = "";
    void this.plugin.setActiveCampaignPath(campaignPath);
    this.requestRefresh("campaign changed", 0);
  }

  setSession(sessionPath: string | undefined): void {
    this.targetSessionPath = sessionPath ?? "";
    this.requestRefresh("session changed", 0);
  }

  private isPathInCampaign(path: string): boolean {
    if (!path || !this.campaignPath) return false;
    return path === this.campaignPath || path.startsWith(`${this.campaignPath}/`);
  }

  private isRelevantFile(file: TAbstractFile | null | undefined): boolean {
    return !!file && this.isPathInCampaign(file.path);
  }

  private requestRefresh(reason: string, delayMs = 200): void {
    if (this.isRendering) {
      this.pendingRefreshReason = reason;
      return;
    }

    if (this.refreshDebounceTimeout !== null) {
      window.clearTimeout(this.refreshDebounceTimeout);
    }

    this.refreshDebounceTimeout = window.setTimeout(() => {
      this.refreshDebounceTimeout = null;
      void this.render(reason);
    }, delayMs);
  }

  private updateFreshnessDisplay(): void {
    const freshness = this.containerEl.querySelector(".dashboard-freshness") as HTMLElement | null;
    const freshnessValue = this.containerEl.querySelector(".dashboard-freshness-value") as HTMLElement | null;

    if (!freshness || !freshnessValue) return;

    if (!this.lastRenderedAt) {
      freshnessValue.textContent = "Updating...";
      freshness.classList.remove("is-stale");
      return;
    }

    const ageMs = Date.now() - this.lastRenderedAt;
    const ageSeconds = Math.max(0, Math.floor(ageMs / 1000));
    const nextAutoRefreshMs = Math.max(0, SessionPrepDashboardView.AUTO_REFRESH_MS - (ageMs % SessionPrepDashboardView.AUTO_REFRESH_MS));
    const nextAutoRefreshSeconds = Math.ceil(nextAutoRefreshMs / 1000);
    const ageLabel = ageSeconds < 2 ? "just now" : `${ageSeconds}s ago`;

    freshnessValue.textContent = `Updated ${ageLabel} | next auto refresh in ${nextAutoRefreshSeconds}s`;
    freshnessValue.title = `Last refresh reason: ${this.lastRefreshReason}`;
    freshness.classList.toggle("is-stale", ageSeconds >= 45);
  }

  private registerDataChangeListeners(): void {
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view === this) {
        this.requestRefresh("view focused", 0);
        this.enableEditMode();
      }
    }));

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (this.isRelevantFile(file)) this.requestRefresh("note created");
    }));

    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (this.isRelevantFile(file)) this.requestRefresh("note modified");
    }));

    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this.isRelevantFile(file)) this.requestRefresh("note deleted");
    }));

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.isRelevantFile(file) || this.isPathInCampaign(oldPath)) {
        this.requestRefresh("note renamed");
      }
    }));

    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (this.isRelevantFile(file)) this.requestRefresh("frontmatter updated");
    }));
  }

  private finalizeRender(): void {
    this.lastRenderedAt = Date.now();
    this.updateFreshnessDisplay();
    this.isRendering = false;

    if (this.pendingRefreshReason) {
      const queuedReason = this.pendingRefreshReason;
      this.pendingRefreshReason = null;
      this.requestRefresh(queuedReason, 0);
    }
  }

  private renderCampaignPicker(container: HTMLElement) {
    const wrapper = container.createEl("div", { cls: "dashboard-campaign-picker" });
    wrapper.createEl("h2", { text: "📋 Session Prep" });
    wrapper.createEl("p", { text: "Select a campaign to start preparing your session." });

    const campaigns = this.plugin.getAllCampaigns();
    if (campaigns.length === 0) {
      this.renderEmptyState(
        wrapper,
        "No campaigns found",
        "Create a campaign to unlock prep, sessions, scenes, party tools, maps, and audio.",
        [{ label: "Create Campaign", onClick: () => this.plugin.createCampaign(), cta: true }]
      );
      return;
    }

    const select = wrapper.createEl("select", { cls: "dashboard-campaign-select" });
    for (const c of campaigns) {
      const name = typeof c === "string" ? c : c.name;
      const path = typeof c === "string" ? c : c.path;
      select.createEl("option", { text: name, value: path });
    }

    const btn = wrapper.createEl("button", { text: "Open Dashboard", cls: "mod-cta" });
    btn.addEventListener("click", () => {
      this.setCampaign(select.value);
    });
  }

  async onOpen() {
    this.campaignPath = this.plugin.getActiveCampaignPath();
    // Ensure the view container takes full width of the leaf
    this.containerEl.style.width = "100%";
    this.containerEl.style.minWidth = "0";
    this.containerEl.style.maxWidth = "none";
    
    await this.render("initial load");

    // Force all open notes into editing (source) mode for prep work
    setTimeout(() => {
      this.enableEditMode();
    }, 300);

    // Set up auto-refresh every 30 seconds
    this.refreshInterval = window.setInterval(() => {
      this.requestRefresh("auto refresh", 0);
    }, SessionPrepDashboardView.AUTO_REFRESH_MS);

    this.freshnessTickInterval = window.setInterval(() => {
      this.updateFreshnessDisplay();
    }, 1000);

    this.registerDataChangeListeners();
  }

  enableEditMode() {
    // Set all markdown views to source/editing mode for session prep
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (view.getMode && view.getMode() === "preview") {
          const state = view.getState();
          view.setState({ ...state, mode: "source" }, {});
        }
      }
    });
  }

  async render(reason = "manual") {
    if (this.isRendering) {
      this.pendingRefreshReason = reason;
      return;
    }

    this.isRendering = true;
    this.lastRefreshReason = reason;

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("session-prep-dashboard");

    const activeCampaignPath = this.plugin.getActiveCampaignPath();
    if (activeCampaignPath && activeCampaignPath !== this.campaignPath) {
      this.campaignPath = activeCampaignPath;
    }

    // If no campaign resolved, show picker
    if (!this.campaignPath) {
      this.renderCampaignPicker(container);
      this.finalizeRender();
      return;
    }

    try {
      // Compact Header
      const header = container.createEl("div", { cls: "dashboard-header" });
      const headerTitle = header.createEl("div", { cls: "dashboard-header-title" });
      headerTitle.createEl("span", { text: "📋 Session Prep", cls: "dashboard-title" });

      const freshness = header.createEl("div", { cls: "dashboard-freshness" });
      freshness.createEl("span", { cls: "dashboard-freshness-dot" });
      freshness.createEl("span", { cls: "dashboard-freshness-value", text: "Updating..." });

      // Campaign selector dropdown in header
      const campaigns = this.plugin.getAllCampaigns();
      if (campaigns.length > 1) {
        const select = headerTitle.createEl("select", { cls: "dashboard-campaign-select" });
        for (const c of campaigns) {
          const name = typeof c === "string" ? c : c.name;
          const path = typeof c === "string" ? c : c.path;
          const opt = select.createEl("option", { text: name, value: path });
          if (path === this.campaignPath) opt.selected = true;
        }
        select.addEventListener("change", () => {
          this.setCampaign(select.value);
        });
      } else {
        const campaignName = this.campaignPath.split('/').pop() || "Unknown";
        headerTitle.createEl("span", {
          text: campaignName,
          cls: "dashboard-campaign-name"
        });
      }

      await this.renderSessionPicker(headerTitle);

      // Main action button
      const mainAction = container.createEl("button", {
        text: "📝 New Session",
        cls: "dashboard-main-action mod-cta"
      });
      mainAction.addEventListener("click", () => {
        this.plugin.createSession(this.campaignPath);
      });

      await this.renderReadinessCard(container);

      // Adventures & Next Scene (Primary focus)
      await this.renderAdventuresAndScenes(container);

      // Quick Actions (Collapsible)
      await this.renderQuickActions(container);

      // Party Overview (Collapsible)
      await this.renderPartyStats(container);

      // Recent NPCs (Collapsible)
      await this.renderRecentNPCsSection(container);

      // Last Session Recap (Collapsible)
      await this.renderLastSessionRecap(container);
    } finally {
      this.finalizeRender();
    }

  }

  private getSessionFiles(): TFile[] {
    const sessionFiles: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isPathInCampaign(file.path)) continue;
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "session") {
        sessionFiles.push(file);
      }
    }
    return sessionFiles;
  }

  private getSessionStatus(file: TFile): string {
    return String(this.app.metadataCache.getFileCache(file)?.frontmatter?.status || "").toLowerCase();
  }

  private getSessionNumber(file: TFile): number {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return Number(fm?.sessionNum ?? fm?.session_number ?? file.basename.match(/^(\d+)/)?.[1] ?? 0);
  }

  private getOrderedSessions(): TFile[] {
    return this.getSessionFiles().sort((a, b) => {
      const preferred = (file: TFile) => ["in-progress", "active", "planned", "planning"].indexOf(this.getSessionStatus(file));
      const aRank = preferred(a);
      const bRank = preferred(b);
      if (aRank >= 0 || bRank >= 0) {
        if (aRank < 0) return 1;
        if (bRank < 0) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }
      return this.getSessionNumber(b) - this.getSessionNumber(a) || b.stat.mtime - a.stat.mtime;
    });
  }

  private getTargetSession(): TFile | null {
    const sessions = this.getOrderedSessions();
    const selected = sessions.find((file) => file.path === this.targetSessionPath);
    const target = selected || sessions[0] || null;
    this.targetSessionPath = target?.path || "";
    return target;
  }

  private async renderSessionPicker(container: HTMLElement): Promise<void> {
    const sessions = this.getOrderedSessions();
    if (sessions.length === 0) {
      container.createEl("span", { cls: "dashboard-session-name", text: "No session selected" });
      return;
    }
    const target = this.getTargetSession();
    const select = container.createEl("select", { cls: "dashboard-session-select" });
    select.setAttribute("aria-label", "Session to prepare");
    for (const session of sessions) {
      const status = this.getSessionStatus(session);
      const option = select.createEl("option", {
        value: session.path,
        text: `Prepare: ${session.basename}${status ? ` (${status})` : ""}`,
      });
      option.selected = session.path === target?.path;
    }
    select.addEventListener("change", () => {
      this.targetSessionPath = select.value;
      this.requestRefresh("target session changed", 0);
    });
  }

  private extractLinkPath(raw: unknown): string {
    const match = String(raw || "").match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/);
    return (match?.[1] || String(raw || "")).replace(/\.md$/i, "").trim();
  }

  private getTargetSessionAdventures(): Array<{ path: string; name: string; status: string }> {
    const session = this.getTargetSession();
    if (!session) return [];
    const fm = this.app.metadataCache.getFileCache(session)?.frontmatter;
    const rawValues = Array.isArray(fm?.adventures) && fm.adventures.length > 0
      ? fm.adventures
      : (fm?.adventure ? [fm.adventure] : []);
    const seen = new Set<string>();
    const adventures: Array<{ path: string; name: string; status: string }> = [];
    for (const raw of rawValues) {
      const linkpath = this.extractLinkPath(raw);
      const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, session.path);
      if (!(file instanceof TFile) || seen.has(file.path)) continue;
      seen.add(file.path);
      const adventureFm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      adventures.push({ path: file.path, name: file.basename, status: adventureFm?.status || "planning" });
    }
    return adventures;
  }

  private getTargetPlannedScenePaths(): string[] {
    const session = this.getTargetSession();
    if (!session) return [];
    const fm = this.app.metadataCache.getFileCache(session)?.frontmatter;
    if (!Array.isArray(fm?.planned_scenes)) return [];
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const raw of fm.planned_scenes) {
      const ref = this.extractLinkPath(raw);
      const file = this.app.metadataCache.getFirstLinkpathDest(ref, session.path);
      if (!(file instanceof TFile) || seen.has(file.path)) continue;
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.type !== "scene") continue;
      seen.add(file.path);
      paths.push(file.path);
    }
    return paths;
  }

  private getNpcCount(): number {
    const npcsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/NPCs`);
    if (!(npcsFolder instanceof TFolder)) return 0;
    return npcsFolder.children.filter((item) => item instanceof TFile && item.extension === "md").length;
  }

  private async getReadinessData(): Promise<{
    score: number;
    hasAdventure: boolean;
    hasParty: boolean;
    hasSession: boolean;
    hasScenes: boolean;
    nextSceneHasGoal: boolean;
    nextScenePath: string;
    details: string;
  }> {
    const targetSession = this.getTargetSession();
    const adventures = this.getTargetSessionAdventures();
    const hasAdventure = adventures.length > 0;

    let nextSceneHasGoal = false;
    let hasScenes = false;
    let nextScenePath = "";
    let sessionScenes = (await Promise.all(adventures.map((adventure) => this.getScenesForAdventure(adventure.path)))).flat();
    const plannedPaths = this.getTargetPlannedScenePaths();
    if (plannedPaths.length > 0) {
      const byPath = new Map(sessionScenes.map(scene => [scene.path, scene]));
      sessionScenes = plannedPaths.map(path => byPath.get(path)).filter((scene): scene is NonNullable<typeof scene> => Boolean(scene));
    }
    hasScenes = sessionScenes.length > 0;
    const nextScene = sessionScenes.find((s) => s.status !== "completed") || sessionScenes[0];
    nextScenePath = nextScene?.path || "";
    nextSceneHasGoal = !!nextScene?.goal?.trim();

    const campaignName = this.campaignPath?.split("/").pop() || "";
    const sessionPartyId = targetSession
      ? String(this.app.metadataCache.getFileCache(targetSession)?.frontmatter?.party_id || "")
      : "";
    const party = this.plugin.partyManager.resolveParty(sessionPartyId || undefined, campaignName);
    let hasParty = false;
    if (party?.id) {
      const members = await this.plugin.partyManager.resolveMembers(party.id);
      hasParty = members.some((m) => m.enabled && !m.absent);
    }

    const hasSession = !!targetSession;

    let score = 0;
    if (hasSession) score += 15;
    if (hasAdventure) score += 25;
    if (hasScenes) score += 25;
    if (hasParty) score += 15;
    if (nextSceneHasGoal) score += 20;

    const details = hasAdventure
      ? (nextSceneHasGoal ? "The selected session has a clear next scene goal." : "Add a goal to the selected session's next scene for a smoother run.")
      : (hasSession ? "Link an adventure to this session to begin focused prep." : "Create a session to begin focused prep.");

    return {
      score,
      hasAdventure,
      hasParty,
      hasSession,
      hasScenes,
      nextSceneHasGoal,
      nextScenePath,
      details
    };
  }

  private runCommand(commandId: string): void {
    const commands = (this.app as any).commands;
    commands?.executeCommandById(`dnd-campaign-hub:${commandId}`);
  }

  private renderEmptyState(
    container: HTMLElement,
    title: string,
    description: string,
    actions: Array<{ label: string; onClick: () => void | Promise<void>; cta?: boolean }> = []
  ): HTMLElement {
    const empty = container.createEl("div", { cls: "dashboard-empty-state" });
    empty.createEl("strong", { text: title });
    empty.createEl("p", { text: description });
    if (actions.length > 0) {
      const actionRow = empty.createEl("div", { cls: "dashboard-empty-actions" });
      for (const action of actions) {
        const button = actionRow.createEl("button", {
          text: action.label,
          cls: action.cta ? "mod-cta" : "",
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void action.onClick();
        });
      }
    }
    return empty;
  }

  async renderReadinessCard(container: HTMLElement) {
    const readiness = await this.getReadinessData();
    const section = container.createEl("div", { cls: "dashboard-section" });
    const card = section.createEl("div", { cls: "dashboard-readiness-card" });

    const titleRow = card.createEl("div", { cls: "dashboard-readiness-title-row" });
    titleRow.createEl("strong", { text: "Session Readiness" });
    titleRow.createEl("span", {
      cls: "dashboard-readiness-score",
      text: `${readiness.score}/100`
    });

    const bar = card.createEl("div", { cls: "dashboard-readiness-bar" });
    const fill = bar.createEl("div", { cls: "dashboard-readiness-fill" });
    fill.style.width = `${readiness.score}%`;

    card.createEl("p", {
      cls: "dashboard-readiness-note",
      text: readiness.details
    });

    const checklist = card.createEl("div", { cls: "dashboard-readiness-checklist" });
    const items: Array<{
      ok: boolean;
      label: string;
      actionLabel: string;
      runAction: () => void;
    }> = [
      {
        ok: readiness.hasSession,
        label: "Session selected for prep",
        actionLabel: "Create",
        runAction: () => this.runCommand("create-session")
      },
      {
        ok: readiness.hasAdventure,
        label: "Adventure linked to this session",
        actionLabel: readiness.hasSession ? "Edit Session" : "Create",
        runAction: () => {
          const session = this.getTargetSession();
          if (session) {
            new SessionCreationModal(this.app, this.plugin, undefined, this.campaignPath, session.path).open();
            return;
          }
          this.runCommand("create-session");
        }
      },
      {
        ok: readiness.hasScenes,
        label: "Linked adventure has scenes",
        actionLabel: "Create",
        runAction: () => this.runCommand("create-scene")
      },
      {
        ok: readiness.hasParty,
        label: "Session party members available",
        actionLabel: "Manage",
        runAction: () => this.runCommand("manage-parties")
      },
      {
        ok: readiness.nextSceneHasGoal,
        label: "Next scene goal defined",
        actionLabel: readiness.nextScenePath ? "Open" : "Create",
        runAction: () => {
          if (readiness.nextScenePath) {
            void this.app.workspace.openLinkText(readiness.nextScenePath, "", false);
            return;
          }
          this.runCommand("create-scene");
        }
      }
    ];

    for (const item of items) {
      const row = checklist.createEl("div", { cls: "dashboard-readiness-item" });
      row.createEl("span", {
        cls: item.ok ? "dashboard-readiness-ok" : "dashboard-readiness-missing",
        text: item.ok ? "OK" : "TODO"
      });
      row.createEl("span", { text: item.label });

      if (!item.ok) {
        const action = row.createEl("button", {
          cls: "dashboard-readiness-action",
          text: item.actionLabel
        });
        action.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          item.runAction();
        });
      }
    }
  }

  async renderQuickActions(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section collapsible" });
    const header = section.createEl("div", { cls: "section-header" });
    const toggle = header.createEl("span", { text: "▶", cls: "toggle-icon" });
    header.createEl("span", { text: "⚡ Quick Actions" });
    
    const sectionKey = "quick-actions";
    const isExpanded = this.expandedSections.has(sectionKey);
    const content = section.createEl("div", { cls: "section-content" });
    content.style.display = isExpanded ? "block" : "none";
    toggle.textContent = isExpanded ? "▼" : "▶";
    
    const actionsGrid = content.createEl("div", { cls: "actions-grid" });
    const allActions = [
      { text: "📝 Session", cmd: "dnd-campaign-hub:create-session" },
      { text: "🎬 Scene", cmd: "dnd-campaign-hub:create-scene" },
      { text: "⚔️ Encounter", cmd: "dnd-campaign-hub:create-encounter" },
      { text: "🗺️ Adventure", cmd: "dnd-campaign-hub:create-adventure" },
      { text: "👤 NPC", cmd: "dnd-campaign-hub:create-npc" },
      { text: "🎭 PC", cmd: "dnd-campaign-hub:create-pc" },
      { text: "🐉 Creature", cmd: "dnd-campaign-hub:create-creature" },
      { text: "🏛️ Faction", cmd: "dnd-campaign-hub:create-faction" },
      { text: "⚔️ Item", cmd: "dnd-campaign-hub:create-item" },
      { text: "✨ Spell", cmd: "dnd-campaign-hub:create-spell" },
      { text: "🪤 Trap", cmd: "dnd-campaign-hub:create-trap" }
    ];

    for (const action of allActions) {
      const btn = actionsGrid.createEl("button", {
        text: action.text,
        cls: "action-btn"
      });
      btn.addEventListener("click", () => {
        (this.app as any).commands?.executeCommandById(action.cmd);
      });
    }

    header.addEventListener("click", () => {
      if (this.expandedSections.has(sectionKey)) {
        this.expandedSections.delete(sectionKey);
      } else {
        this.expandedSections.add(sectionKey);
      }
      content.style.display = this.expandedSections.has(sectionKey) ? "block" : "none";
      toggle.textContent = this.expandedSections.has(sectionKey) ? "▼" : "▶";
    });
  }

  async renderRecentNPCsSection(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section collapsible" });
    const header = section.createEl("div", { cls: "section-header" });
    const toggle = header.createEl("span", { text: "▶", cls: "toggle-icon" });
    header.createEl("span", { text: "👥 Recent NPCs" });
    
    const sectionKey = "recent-npcs";
    const isExpanded = this.expandedSections.has(sectionKey);
    const content = section.createEl("div", { cls: "section-content" });
    content.style.display = isExpanded ? "block" : "none";
    toggle.textContent = isExpanded ? "▼" : "▶";

    // Get NPCs from the campaign
    const npcsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/NPCs`);
    
    if (!(npcsFolder instanceof TFolder)) {
      this.renderEmptyState(
        content,
        "No NPCs found",
        "NPCs give the prep dashboard quick access to recurring characters.",
        [{ label: "Create NPC", onClick: () => this.plugin.createNpc(this.campaignPath), cta: true }]
      );
    } else {
      const npcFiles: TFile[] = [];
      for (const item of npcsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          npcFiles.push(item);
        }
      }

      npcFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
      const recentNPCs = npcFiles.slice(0, 8);

      if (recentNPCs.length === 0) {
        this.renderEmptyState(
          content,
          "No NPCs yet",
          "Create important NPCs here so they are easy to pull up while preparing.",
          [{ label: "Create NPC", onClick: () => this.plugin.createNpc(this.campaignPath), cta: true }]
        );
      } else {
        const npcGrid = content.createEl("div", { cls: "npc-grid" });
        for (const npc of recentNPCs) {
          const npcLink = npcGrid.createEl("a", { 
            href: npc.path,
            cls: "npc-tag"
          });
          npcLink.textContent = npc.basename;
          npcLink.addEventListener("click", async (e) => {
            e.preventDefault();
            await this.app.workspace.openLinkText(npc.path, "", false);
          });
        }
      }
    }

    header.addEventListener("click", () => {
      if (this.expandedSections.has(sectionKey)) {
        this.expandedSections.delete(sectionKey);
      } else {
        this.expandedSections.add(sectionKey);
      }
      content.style.display = this.expandedSections.has(sectionKey) ? "block" : "none";
      toggle.textContent = this.expandedSections.has(sectionKey) ? "▼" : "▶";
    });
  }

  async renderAdventuresAndScenes(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    const titleRow = section.createEl("div", { cls: "dashboard-section-title-row" });
    titleRow.createEl("h3", { text: "🗺️ Adventure Progress", cls: "section-title" });

    const filterRow = titleRow.createEl("div", { cls: "dashboard-filter-chips" });
    const sessionChip = filterRow.createEl("button", {
      cls: this.sceneFilter === "session" ? "dashboard-filter-chip is-active" : "dashboard-filter-chip",
      text: "Only This Session"
    });
    const allChip = filterRow.createEl("button", {
      cls: this.sceneFilter === "all" ? "dashboard-filter-chip is-active" : "dashboard-filter-chip",
      text: "All Scenes"
    });

    sessionChip.addEventListener("click", () => {
      if (this.sceneFilter === "session") return;
      this.sceneFilter = "session";
      this.requestRefresh("scene filter changed", 0);
    });

    allChip.addEventListener("click", () => {
      if (this.sceneFilter === "all") return;
      this.sceneFilter = "all";
      this.requestRefresh("scene filter changed", 0);
    });

    // Only adventures linked to the selected session belong in focused prep.
    const adventures = this.getTargetSessionAdventures();

    if (adventures.length === 0) {
      this.renderEmptyState(
        section,
        this.getTargetSession() ? "No adventures linked to this session" : "No session selected",
        this.getTargetSession()
          ? "Edit the selected session and link the adventures you intend to run."
          : "Create a session note to focus readiness, adventures, and scenes on the game you are preparing.",
        [
          ...(this.getTargetSession()
            ? [{ label: "Edit Session", onClick: () => new SessionCreationModal(this.app, this.plugin, undefined, this.campaignPath, this.getTargetSession()!.path).open(), cta: true }]
            : [{ label: "New Session", onClick: () => this.plugin.createSession(this.campaignPath), cta: true }]),
          { label: "Create Adventure", onClick: () => this.plugin.createAdventure(this.campaignPath) },
        ]
      );
      return;
    }

    for (const adventure of adventures) {
      const adventureCard = container.createEl("div", { cls: "dashboard-adventure-card" });
      
      // Adventure header
      const adventureHeader = adventureCard.createEl("div", { cls: "adventure-header" });
      const adventureLink = adventureHeader.createEl("a", {
        cls: "adventure-title",
        href: adventure.path
      });
      adventureLink.textContent = `${adventure.name}`;
      adventureLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.app.workspace.openLinkText(adventure.path, "", false);
      });

      const statusBadge = adventureHeader.createEl("span", {
        cls: `status-badge status-${adventure.status}`,
        text: adventure.status
      });

      // Get scenes for this adventure
      let scenes = await this.getScenesForAdventure(adventure.path);
      const plannedPaths = this.getTargetPlannedScenePaths();
      if (plannedPaths.length > 0) {
        const order = new Map(plannedPaths.map((path, index) => [path, index]));
        scenes = scenes.filter(scene => order.has(scene.path)).sort((a, b) => order.get(a.path)! - order.get(b.path)!);
      }
      
      if (scenes.length === 0) {
        this.renderEmptyState(
          adventureCard,
          "No scenes yet",
          "Scenes are the moments you can prepare, run, and connect to maps, music, and encounters.",
          [{ label: "Add Scene", onClick: () => this.plugin.createScene(this.campaignPath), cta: true }]
        );
        continue;
      }

      // Find next scene (first not-completed)
      const nextScene = scenes.find(s => s.status !== "completed") || scenes[0];
      const completedCount = scenes.filter(s => s.status === "completed").length;

      // Progress bar
      const progressContainer = adventureCard.createEl("div", { cls: "progress-container" });
      progressContainer.createEl("span", { 
        text: `Progress: ${completedCount}/${scenes.length} scenes completed`
      });
      const progressBar = progressContainer.createEl("div", { cls: "progress-bar" });
      const progressFill = progressBar.createEl("div", { cls: "progress-fill" });
      progressFill.style.width = `${(completedCount / scenes.length) * 100}%`;

      // Next scene card
      if (nextScene) {
        const nextSceneCard = adventureCard.createEl("div", { cls: "next-scene-card" });
        nextSceneCard.createEl("strong", { text: "🎬 Next Up:" });
        
        const sceneLink = nextSceneCard.createEl("a", {
          cls: "scene-link",
          href: nextScene.path
        });
        sceneLink.textContent = `Scene ${nextScene.number}: ${nextScene.name}`;
        sceneLink.addEventListener("click", async (e) => {
          e.preventDefault();
          await this.app.workspace.openLinkText(nextScene.path, "", false);
        });

        // Scene preview
        const scenePreview = nextSceneCard.createEl("div", { cls: "scene-preview" });
        scenePreview.createEl("span", { 
          text: `⏱️ ${nextScene.duration} | ${this.getSceneIcon(nextScene.type)} ${nextScene.type} | 🎲 ${nextScene.difficulty}`
        });

        // Quick scene details if available
        if (nextScene.goal) {
          scenePreview.createEl("p", { 
            text: `Goal: ${nextScene.goal}`,
            cls: "scene-goal"
          });
        }

        // Open scene button
        const openBtn = nextSceneCard.createEl("button", {
          text: "Open Scene",
          cls: "mod-cta"
        });
        openBtn.addEventListener("click", async () => {
          await this.app.workspace.openLinkText(nextScene.path, "", false);
        });
      }

      // Upcoming scenes (collapsed by default)
      if (scenes.length > 1) {
        const visibleScenes = this.sceneFilter === "session"
          ? scenes.filter((scene) => scene.status !== "completed")
          : scenes;

        const otherVisibleScenes = visibleScenes.filter((scene) => scene.path !== nextScene?.path);
        if (otherVisibleScenes.length === 0) {
          continue;
        }

        const sectionKey = `upcoming-scenes-${adventure.name}`;
        let upcomingExpanded = this.expandedSections.has(sectionKey);
        const upcomingHeader = adventureCard.createEl("div", { cls: "upcoming-header" });
        const toggleBtn = upcomingHeader.createEl("button", {
          text: upcomingExpanded
            ? `▼ Hide scenes`
            : `▶ Show ${otherVisibleScenes.length} more scenes`,
          cls: "upcoming-toggle"
        });

        const upcomingList = adventureCard.createEl("div", { cls: "upcoming-scenes-list" });
        upcomingList.style.display = upcomingExpanded ? "block" : "none";

        for (const scene of otherVisibleScenes) {

          const sceneItem = upcomingList.createEl("div", { cls: "scene-list-item" });
          const statusIcon = scene.status === "completed" ? "✅" : "⬜";
          const sceneItemLink = sceneItem.createEl("a", { href: scene.path });
          sceneItemLink.textContent = `${statusIcon} Scene ${scene.number}: ${scene.name}`;
          sceneItemLink.addEventListener("click", async (e) => {
            e.preventDefault();
            await this.app.workspace.openLinkText(scene.path, "", false);
          });

          sceneItem.createEl("span", {
            text: ` - ${this.getSceneIcon(scene.type)} ${scene.type}`,
            cls: "scene-type"
          });
        }

        toggleBtn.addEventListener("click", () => {
          if (this.expandedSections.has(sectionKey)) {
            this.expandedSections.delete(sectionKey);
          } else {
            this.expandedSections.add(sectionKey);
          }
          const expanded = this.expandedSections.has(sectionKey);
          upcomingList.style.display = expanded ? "block" : "none";
          toggleBtn.textContent = expanded 
            ? `▼ Hide scenes` 
            : `▶ Show ${otherVisibleScenes.length} more scenes`;
        });
      }
    }
  }

  async renderQuickReference(container: HTMLElement) {
    container.createEl("h3", { text: "🔖 Quick Reference" });

    // Recent NPCs
    const npcsSection = container.createEl("div", { cls: "quick-ref-section" });
    npcsSection.createEl("h4", { text: "👥 Recent NPCs" });
    await this.renderRecentNPCs(npcsSection);

    // Quick Actions - Compact single grid
    const actionsSection = container.createEl("div", { cls: "quick-ref-section" });
    actionsSection.createEl("h4", { text: "⚡ Quick Actions" });
    
    // All actions in one compact grid
    const allActions = [
      { text: "📝 Session", cmd: "dnd-campaign-hub:create-session" },
      { text: "🎬 Scene", cmd: "dnd-campaign-hub:create-scene" },
      { text: "⚔️ Encounter", cmd: "dnd-campaign-hub:create-encounter" },
      { text: "🗺️ Adventure", cmd: "dnd-campaign-hub:create-adventure" },
      { text: "👤 NPC", cmd: "dnd-campaign-hub:create-npc" },
      { text: "🎭 PC", cmd: "dnd-campaign-hub:create-pc" },
      { text: "🐉 Creature", cmd: "dnd-campaign-hub:create-creature" },
      { text: "🏛️ Faction", cmd: "dnd-campaign-hub:create-faction" },
      { text: "⚔️ Item", cmd: "dnd-campaign-hub:create-item" },
      { text: "✨ Spell", cmd: "dnd-campaign-hub:create-spell" },
      { text: "🪤 Trap", cmd: "dnd-campaign-hub:create-trap" }
    ];
    this.renderActionButtons(actionsSection, allActions);
  }

  renderActionButtons(container: HTMLElement, actions: Array<{text: string, cmd: string}>) {
    const buttonsWrapper = container.createEl("div", { cls: "action-buttons" });
    for (const action of actions) {
      const btn = buttonsWrapper.createEl("button", {
        text: action.text,
        cls: "quick-action-btn"
      });
      btn.addEventListener("click", () => {
        (this.app as any).commands?.executeCommandById(action.cmd);
      });
    }
  }

  async renderRecentNPCs(container: HTMLElement) {
    // Get NPCs from the campaign
    const npcsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/NPCs`);
    
    if (!(npcsFolder instanceof TFolder)) {
      container.createEl("p", { text: "No NPCs found" });
      return;
    }

    const npcFiles: TFile[] = [];
    for (const item of npcsFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        npcFiles.push(item);
      }
    }

    // Sort by modification time (most recent first)
    npcFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

    // Show top 5
    const recentNPCs = npcFiles.slice(0, 5);

    if (recentNPCs.length === 0) {
      container.createEl("p", { text: "No NPCs yet" });
      return;
    }

    const npcList = container.createEl("div", { cls: "npc-list" });
    for (const npc of recentNPCs) {
      const npcItem = npcList.createEl("div", { cls: "npc-item" });
      const npcLink = npcItem.createEl("a", { href: npc.path });
      npcLink.textContent = `👤 ${npc.basename}`;
      npcLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.app.workspace.openLinkText(npc.path, "", false);
      });
    }
  }

  async renderPartyStats(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section collapsible" });
    const header = section.createEl("div", { cls: "section-header" });
    const toggle = header.createEl("span", { text: "▶", cls: "toggle-icon" });
    header.createEl("span", { text: "🎭 Party Overview" });
    
    const sectionKey = "party-overview";
    let isExpanded = this.expandedSections.has(sectionKey);
    const content = section.createEl("div", { cls: "section-content" });
    content.style.display = isExpanded ? "block" : "none";
    toggle.textContent = isExpanded ? "▼" : "▶";

    // Resolve party via PartyManager using campaign context
    const campaignName = this.campaignPath?.split("/").pop() || "";
    const party = this.plugin.partyManager.resolveParty(undefined, campaignName);

    if (!party || party.members.length === 0) {
      this.renderEmptyState(
        content,
        "No party members found",
        "Link a party to this campaign so encounters and session prep use the right characters.",
        [{ label: "Open Party Manager", onClick: () => this.plugin.openPartyManager(this.campaignPath), cta: true }]
      );
    } else {
      const resolved = await this.plugin.partyManager.resolveMembers(party.id);
      const presentMembers = resolved.filter((m) => m.enabled && !m.absent);

      if (presentMembers.length === 0) {
        this.renderEmptyState(
          content,
          resolved.length === 0 ? "No PCs yet" : "No present PCs",
          resolved.length === 0
            ? "Add PCs to the party before building encounters around them."
            : "Mark at least one party member present before using party readiness.",
          [{ label: "Open Party Manager", onClick: () => this.plugin.openPartyManager(this.campaignPath), cta: true }]
        );
      } else {
        presentMembers.sort((a, b) => a.name.localeCompare(b.name));

        const partyGrid = content.createEl("div", { cls: "party-grid" });
        
        for (const pc of presentMembers) {
          const pcCard = partyGrid.createEl("div", { cls: "party-card" });
          
          const pcLink = pcCard.createEl("a", { 
            href: pc.notePath,
            cls: "pc-name"
          });
          pcLink.textContent = pc.name;
          pcLink.addEventListener("click", async (e) => {
            e.preventDefault();
            await this.app.workspace.openLinkText(pc.notePath, "", false);
          });

          // HP bar
          const hpPercent = pc.maxHp > 0 ? (pc.hp / pc.maxHp) * 100 : 0;
          const hpBar = pcCard.createEl("div", { cls: "pc-hp-bar" });
          const hpFill = hpBar.createEl("div", { cls: "pc-hp-fill" });
          hpFill.style.width = `${hpPercent}%`;
          if (hpPercent < 25) hpFill.style.backgroundColor = "#cc0000";
          else if (hpPercent < 50) hpFill.style.backgroundColor = "#cc6600";
          
          pcCard.createEl("div", { 
            cls: "pc-stats",
            text: `❤️ ${pc.hp}/${pc.maxHp} • AC ${pc.ac}`
          });
        }
      }
    }

    header.addEventListener("click", () => {
      if (this.expandedSections.has(sectionKey)) {
        this.expandedSections.delete(sectionKey);
      } else {
        this.expandedSections.add(sectionKey);
      }
      isExpanded = this.expandedSections.has(sectionKey);
      content.style.display = isExpanded ? "block" : "none";
      toggle.textContent = isExpanded ? "▼" : "▶";
    });
  }

  async renderSessionNotes(container: HTMLElement) {
    container.createEl("h3", { text: "📓 Session Notes" });

    // Get recent sessions
    const sessionsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Sessions`);
    const sessionFiles: TFile[] = [];

    if (sessionsFolder instanceof TFolder) {
      // Sessions in subfolder
      for (const item of sessionsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          sessionFiles.push(item);
        }
      }
    } else {
      // Sessions at campaign root
      const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
      if (campaignFolder instanceof TFolder) {
        for (const item of campaignFolder.children) {
          if (item instanceof TFile && item.extension === "md") {
            const cache = this.app.metadataCache.getFileCache(item);
            if (cache?.frontmatter?.type === "session") {
              sessionFiles.push(item);
            }
          }
        }
      }
    }

    // Sort by session number (descending)
    sessionFiles.sort((a, b) => {
      const cacheA = this.app.metadataCache.getFileCache(a);
      const cacheB = this.app.metadataCache.getFileCache(b);
      
      const aNum = cacheA?.frontmatter?.sessionNum || this.extractSessionNumber(a.basename);
      const bNum = cacheB?.frontmatter?.sessionNum || this.extractSessionNumber(b.basename);
      
      return bNum - aNum;
    });

    const targeted = this.targetSessionPath
      ? this.app.vault.getAbstractFileByPath(this.targetSessionPath)
      : null;
    const lastSession = targeted instanceof TFile ? targeted : sessionFiles[0];
    if (!lastSession) {
      this.renderEmptyState(
        container,
        "No sessions yet",
        "Create your first session note to track prep, recap, scenes, and follow-up.",
        [{ label: "New Session", onClick: () => this.plugin.createSession(this.campaignPath), cta: true }]
      );
      return;
    }

    // Show last session summary
    const sessionCard = container.createEl("div", { cls: "session-card" });
    const sessionLink = sessionCard.createEl("a", { href: lastSession.path });
    sessionLink.textContent = this.targetSessionPath
      ? `Preparing: ${lastSession.basename}`
      : `Last Session: ${lastSession.basename}`;
    sessionLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.app.workspace.openLinkText(lastSession.path, "", false);
    });

    // Try to extract summary from last session
    try {
      const content = await this.app.vault.read(lastSession);
      const summaryMatch = content.match(/##\s*Summary\s*\n\n([\s\S]*?)(?=\n##|$)/);
      if (summaryMatch && summaryMatch[1]) {
        const summary = summaryMatch[1].trim().substring(0, 200);
        sessionCard.createEl("p", {
          text: summary + (summaryMatch[1].length > 200 ? "..." : ""),
          cls: "session-summary"
        });
      }
    } catch (error) {
      console.error("Error reading session file:", error);
    }
  }

  async getActiveAdventures(): Promise<Array<{
    path: string;
    name: string;
    status: string;
  }>> {
    const adventures: Array<{ path: string; name: string; status: string }> = [];
    const adventuresFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Adventures`);

    if (!(adventuresFolder instanceof TFolder)) {
      return adventures;
    }

    for (const item of adventuresFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        const cache = this.app.metadataCache.getFileCache(item);
        const status = cache?.frontmatter?.status || "planning";
        
        // Only show active adventures (not completed or on-hold)
        if (status === "active" || status === "in-progress" || status === "planning") {
          adventures.push({
            path: item.path,
            name: item.basename,
            status: status
          });
        }
      } else if (item instanceof TFolder) {
        // Check for adventure in folder structure
        const adventureFile = this.app.vault.getAbstractFileByPath(`${item.path}/${item.name}.md`);
        if (adventureFile instanceof TFile) {
          const cache = this.app.metadataCache.getFileCache(adventureFile);
          const status = cache?.frontmatter?.status || "planning";
          
          if (status === "active" || status === "in-progress" || status === "planning") {
            adventures.push({
              path: adventureFile.path,
              name: item.name,
              status: status
            });
          }
        }
      }
    }

    return adventures;
  }

  async getScenesForAdventure(adventurePath: string): Promise<Array<{
    path: string;
    number: number;
    name: string;
    type: string;
    duration: string;
    difficulty: string;
    status: string;
    goal: string;
  }>> {
    const scenes: Array<any> = [];
    const adventureFile = this.app.vault.getAbstractFileByPath(adventurePath);

    if (!(adventureFile instanceof TFile)) return scenes;

    const adventureName = adventureFile.basename;

    // Search all markdown files by frontmatter: type=scene + adventure matches
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || fm.type !== "scene") continue;

      // Match by adventure frontmatter field (basename of the adventure)
      if (fm.adventure !== adventureName) continue;

      const sceneNum = parseInt(
        fm.scene_number ?? file.basename.match(/Scene\s+(\d+)/i)?.[1] ?? "0"
      ) || 0;

      // Extract scene name from frontmatter or filename
      let sceneName = fm.name || "";
      if (!sceneName) {
        const nameMatch = file.basename.match(/^Scene\s+\d+\s+-\s+(.+)$/);
        sceneName = nameMatch ? nameMatch[1] : file.basename;
      }

      scenes.push({
        path: file.path,
        number: sceneNum,
        name: sceneName,
        type: fm.scene_type || "exploration",
        duration: fm.duration || "?",
        difficulty: fm.difficulty || "medium",
        status: fm.status || "not-started",
        goal: fm.goal || ""
      });
    }

    // Sort by scene number
    scenes.sort((a, b) => a.number - b.number);
    return scenes;
  }

  getSceneIcon(type: string): string {
    const icons: Record<string, string> = {
      social: "🗣️",
      combat: "⚔️",
      exploration: "🔍",
      puzzle: "🧩",
      montage: "🎬"
    };
    return icons[type] || "📝";
  }

  async renderLastSessionRecap(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section collapsible" });
    const header = section.createEl("div", { cls: "section-header" });
    const toggle = header.createEl("span", { text: "▶", cls: "toggle-icon" });
    header.createEl("span", { text: "📖 Last Session" });
    
    const sectionKey = "last-session";
    let isExpanded = this.expandedSections.has(sectionKey);
    const content = section.createEl("div", { cls: "section-content" });
    content.style.display = isExpanded ? "block" : "none";
    toggle.textContent = isExpanded ? "▼" : "▶";

    const sessionFiles = this.getSessionFiles();

    if (sessionFiles.length === 0) {
      this.renderEmptyState(
        content,
        "No previous sessions yet",
        "Create a session note now; future prep will show the latest recap here.",
        [{ label: "New Session", onClick: () => this.plugin.createSession(this.campaignPath), cta: true }]
      );
    } else {
      // Sort by session number (descending)
      sessionFiles.sort((a, b) => {
        const cacheA = this.app.metadataCache.getFileCache(a);
        const cacheB = this.app.metadataCache.getFileCache(b);
        
        const aNum = cacheA?.frontmatter?.sessionNum || this.extractSessionNumber(a.basename);
        const bNum = cacheB?.frontmatter?.sessionNum || this.extractSessionNumber(b.basename);
        
        return bNum - aNum;
      });

      const lastSession = sessionFiles[0];
      if (lastSession) {
        const sessionLink = content.createEl("a", { 
          href: lastSession.path,
          cls: "session-link"
        });
        sessionLink.textContent = lastSession.basename;
        sessionLink.addEventListener("click", async (e) => {
          e.preventDefault();
          await this.app.workspace.openLinkText(lastSession.path, "", false);
        });

        // Try to extract summary
        try {
          const fileContent = await this.app.vault.read(lastSession);
          const summaryMatch = fileContent.match(/##\s*(?:Summary|Highlights?)\s*\n([\s\S]*?)(?=\n##|$)/i);
          if (summaryMatch && summaryMatch[1]) {
            const summary = summaryMatch[1].trim().substring(0, 150);
            content.createEl("p", {
              text: summary + (summaryMatch[1].length > 150 ? "..." : ""),
              cls: "session-summary"
            });
          }
        } catch (error) {
          // Ignore read errors
        }
      }
    }

    header.addEventListener("click", () => {
      if (this.expandedSections.has(sectionKey)) {
        this.expandedSections.delete(sectionKey);
      } else {
        this.expandedSections.add(sectionKey);
      }
      isExpanded = this.expandedSections.has(sectionKey);
      content.style.display = isExpanded ? "block" : "none";
      toggle.textContent = isExpanded ? "▼" : "▶";
    });
  }

  extractSessionNumber(filename: string): number {
    // Try "Session X" format
    let match = filename.match(/Session\s+(\d+)/i);
    if (match && match[1]) return parseInt(match[1]);
    
    // Try "001_20250521" format
    match = filename.match(/^(\d{3})_\d{8}$/);
    if (match && match[1]) return parseInt(match[1]);
    
    return 0;
  }

  async onClose() {
    // Clear auto-refresh interval
    if (this.refreshInterval !== null) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.freshnessTickInterval !== null) {
      window.clearInterval(this.freshnessTickInterval);
      this.freshnessTickInterval = null;
    }

    if (this.refreshDebounceTimeout !== null) {
      window.clearTimeout(this.refreshDebounceTimeout);
      this.refreshDebounceTimeout = null;
    }
  }
}
