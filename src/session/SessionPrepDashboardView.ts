import { App, ItemView, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SESSION_PREP_VIEW_TYPE } from "../constants";

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

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.resolveCampaign();
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
    this.requestRefresh("campaign changed", 0);
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
      wrapper.createEl("p", { text: "No campaigns found. Create a campaign first.", cls: "empty-msg" });
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

      // Main action button
      const mainAction = container.createEl("button", {
        text: "📝 New Session",
        cls: "dashboard-main-action mod-cta"
      });
      mainAction.addEventListener("click", () => {
        this.plugin.createSession();
      });

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
      content.createEl("p", { text: "No NPCs found", cls: "empty-msg" });
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
        content.createEl("p", { text: "No NPCs yet", cls: "empty-msg" });
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
    section.createEl("h3", { text: "🗺️ Adventure Progress", cls: "section-title" });

    // Get all adventures in this campaign
    const adventures = await this.getActiveAdventures();

    if (adventures.length === 0) {
      container.createEl("p", { text: "No active adventures found." });
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
      const scenes = await this.getScenesForAdventure(adventure.path);
      
      if (scenes.length === 0) {
        adventureCard.createEl("p", { text: "No scenes yet" });
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
        const sectionKey = `upcoming-scenes-${adventure.name}`;
        let upcomingExpanded = this.expandedSections.has(sectionKey);
        const upcomingHeader = adventureCard.createEl("div", { cls: "upcoming-header" });
        const toggleBtn = upcomingHeader.createEl("button", {
          text: upcomingExpanded ? `▼ Hide scenes` : `▶ Show ${scenes.length - 1} more scenes`,
          cls: "upcoming-toggle"
        });

        const upcomingList = adventureCard.createEl("div", { cls: "upcoming-scenes-list" });
        upcomingList.style.display = upcomingExpanded ? "block" : "none";

        for (const scene of scenes) {
          if (scene.path === nextScene?.path) continue; // Skip the next scene

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
            : `▶ Show ${scenes.length - 1} more scenes`;
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
      content.createEl("p", { text: "No party members found", cls: "empty-msg" });
    } else {
      const resolved = await this.plugin.partyManager.resolveMembers(party.id);

      if (resolved.length === 0) {
        content.createEl("p", { text: "No PCs yet", cls: "empty-msg" });
      } else {
        resolved.sort((a, b) => a.name.localeCompare(b.name));

        const partyGrid = content.createEl("div", { cls: "party-grid" });
        
        for (const pc of resolved) {
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

    const lastSession = sessionFiles[0];
    if (!lastSession) {
      container.createEl("p", { text: "No sessions yet" });
      return;
    }

    // Show last session summary
    const sessionCard = container.createEl("div", { cls: "session-card" });
    const sessionLink = sessionCard.createEl("a", { href: lastSession.path });
    sessionLink.textContent = `Last Session: ${lastSession.basename}`;
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

    // Get recent sessions
    const sessionsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Sessions`);
    const sessionFiles: TFile[] = [];

    if (sessionsFolder instanceof TFolder) {
      for (const item of sessionsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          sessionFiles.push(item);
        }
      }
    } else {
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

    if (sessionFiles.length === 0) {
      content.createEl("p", { 
        text: "No previous sessions yet.",
        cls: "empty-msg"
      });
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
