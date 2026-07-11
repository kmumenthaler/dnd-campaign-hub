import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { CAMPAIGN_HOME_VIEW_TYPE } from "../constants";
import { renderActionableEmptyState } from "../utils/ActionableEmptyState";

type HomeNote = {
  file: TFile;
  name: string;
  type: string;
  mtime: number;
  sessionNumber: number;
  sessionDate: string;
};

type HomeMap = {
  id: string;
  name: string;
  detail: string;
  lastModified: number;
};

type HomeData = {
  campaignName: string;
  campaignPath: string;
  sessions: HomeNote[];
  scenes: HomeNote[];
  encounters: number;
  mapNotes: HomeNote[];
  recentMaps: HomeMap[];
  maps: number;
};

export class CampaignHomeView extends ItemView {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.getActiveCampaignPath();
  }

  getViewType(): string {
    return CAMPAIGN_HOME_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Campaign Home";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  setCampaign(campaignPath: string) {
    this.campaignPath = campaignPath;
    void this.plugin.setActiveCampaignPath(campaignPath);
    void this.render();
  }

  async onOpen() {
    this.containerEl.style.width = "100%";
    this.registerEvent(this.app.metadataCache.on("changed", () => {
      void this.render();
    }));
    this.registerEvent(this.app.vault.on("create", () => {
      void this.render();
    }));
    this.registerEvent(this.app.vault.on("delete", () => {
      void this.render();
    }));
    this.registerEvent(this.app.vault.on("rename", () => {
      void this.render();
    }));
    await this.render();
  }

  private async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("campaign-home-view");

    const campaigns = this.plugin.getAllCampaigns();
    if (!this.campaignPath && campaigns[0]) {
      this.campaignPath = campaigns[0].path;
      void this.plugin.setActiveCampaignPath(this.campaignPath);
    }

    if (!this.campaignPath) {
      this.renderNoCampaign(container);
      return;
    }

    const data = await this.collectHomeData(this.campaignPath);
    this.renderHeader(container, data, campaigns);
    this.renderPrimaryActions(container);
    this.renderSessionFocus(container, data);
    this.renderOverview(container, data);
    this.renderNextSteps(container, data);
    this.renderRecentNotes(container, "Recent Scenes", data.scenes, "No scenes yet.", () => this.plugin.createScene(data.campaignPath));
    this.renderRecentMaps(container, data.recentMaps, data.mapNotes, data.campaignPath);
  }

  private renderNoCampaign(container: HTMLElement) {
    const empty = container.createDiv({ cls: "campaign-home-empty" });
    empty.createEl("h2", { text: "Campaign Home" });
    renderActionableEmptyState(
      empty,
      "No campaign found",
      "Create a campaign to unlock sessions, scenes, maps, party tools, and audio workflows.",
      [{ label: "Create Campaign", onClick: () => this.plugin.createCampaign(), cta: true }],
    );
  }

  private renderHeader(container: HTMLElement, data: HomeData, campaigns: Array<{ path: string; name: string }>) {
    const header = container.createDiv({ cls: "campaign-home-header" });
    const title = header.createDiv({ cls: "campaign-home-title" });
    title.createEl("span", { text: "Campaign Home", cls: "campaign-home-kicker" });
    title.createEl("h2", { text: data.campaignName });
    title.createEl("p", { text: data.campaignPath, cls: "campaign-home-path" });
    title.createEl("p", { text: this.plugin.getCampaignSystemLabel(data.campaignPath), cls: "campaign-home-path" });

    if (campaigns.length > 1) {
      const select = header.createEl("select", { cls: "campaign-home-campaign-select" });
      for (const campaign of campaigns) {
        select.createEl("option", {
          text: campaign.name,
          value: campaign.path,
        });
      }
      select.value = data.campaignPath;
      select.addEventListener("change", () => this.setCampaign(select.value));
    }
  }

  private renderPrimaryActions(container: HTMLElement) {
    const actions = container.createDiv({ cls: "campaign-home-primary-actions" });
    this.createActionButton(actions, "New Session", "mod-cta", () => this.plugin.createSession(this.campaignPath));
    this.createActionButton(actions, "Find Campaign Content", "", () => this.plugin.openCampaignContentSearch(this.campaignPath));
    this.createActionButton(actions, "Continue Last Session", "", () => this.plugin.continueLastSession(this.campaignPath));
    this.createActionButton(actions, "Create Content", "", () => this.plugin.openCreateContent(this.campaignPath));
    this.createActionButton(actions, "Add Scene", "", () => this.plugin.createScene(this.campaignPath));
    this.createActionButton(actions, "Open Party", "", () => this.plugin.openPartyManager(this.campaignPath));
    this.createActionButton(actions, "Open Music", "", () => this.plugin.ensureMusicPlayerOpen());
    this.createActionButton(actions, "Open Map Manager", "", () => this.plugin.openMapManager());
  }

  private renderSessionFocus(container: HTMLElement, data: HomeData) {
    const section = container.createDiv({ cls: "campaign-home-session-focus" });
    const copy = section.createDiv({ cls: "campaign-home-session-copy" });
    copy.createEl("span", { text: "Session Focus", cls: "campaign-home-kicker" });

    const latestSession = data.sessions[0];
    if (latestSession) {
      copy.createEl("h3", { text: latestSession.name });
      copy.createEl("p", { text: "Continue from the latest session note or open the live dashboard when play starts." });
      const actions = section.createDiv({ cls: "campaign-home-session-actions" });
      this.createActionButton(actions, "Open Note", "", () => this.app.workspace.getLeaf(false).openFile(latestSession.file));
      this.createActionButton(actions, "Run Session", "mod-cta", () => this.plugin.openSessionRunDashboard(data.campaignPath));
      this.createActionButton(actions, "Prep Dashboard", "", () => this.plugin.openSessionPrepDashboard(data.campaignPath));
      return;
    }

    copy.createEl("h3", { text: "No session yet" });
    copy.createEl("p", { text: "Create a first session note to anchor prep, scenes, encounters, and live play." });
    const actions = section.createDiv({ cls: "campaign-home-session-actions" });
    this.createActionButton(actions, "Create Session", "mod-cta", () => this.plugin.createSession(data.campaignPath));
  }

  private renderOverview(container: HTMLElement, data: HomeData) {
    const grid = container.createDiv({ cls: "campaign-home-overview" });
    this.renderMetric(grid, "Sessions", data.sessions.length.toString(), data.sessions[0]?.name || "Create your first session");
    this.renderMetric(grid, "Scenes", data.scenes.length.toString(), data.scenes[0]?.name || "Add scenes as prep anchors");
    this.renderMetric(grid, "Encounters", data.encounters.toString(), data.encounters > 0 ? "Saved in Encounter Builder" : "Build combat when needed");
    this.renderMetric(grid, "Maps", data.maps.toString(), data.maps > 0 ? "Saved map configurations" : "Create or link maps to scenes");

    const party = this.plugin.partyManager.getPartiesForCampaign(data.campaignPath)[0]
      || this.plugin.partyManager.resolveParty(undefined, data.campaignName);
    this.renderMetric(
      grid,
      "Party",
      party ? party.members.length.toString() : "0",
      party ? party.name : "Open Party Manager to create one",
    );

    const music = this.plugin.settings.musicSettings;
    const musicStatus = music.audioFolderPath
      ? `${music.playlists.length} playlists, ${music.soundEffects.length} SFX`
      : "Choose an audio folder";
    this.renderMetric(grid, "Audio", music.audioFolderPath ? "Ready" : "Setup", musicStatus);
  }

  private renderNextSteps(container: HTMLElement, data: HomeData) {
    const section = container.createDiv({ cls: "campaign-home-section" });
    section.createEl("h3", { text: "Suggested Next Steps" });
    const list = section.createDiv({ cls: "campaign-home-next-steps" });

    if (data.sessions.length === 0) {
      this.renderNextStep(list, "Create your first session", "Sessions become the main container for prep and live play.", () => this.plugin.createSession(data.campaignPath));
    }
    if (data.scenes.length === 0) {
      this.renderNextStep(list, "Add a scene", "Scenes connect notes, encounters, maps, and music into a runnable moment.", () => this.plugin.createScene(data.campaignPath));
    }
    if (!this.plugin.partyManager.getPartiesForCampaign(data.campaignPath)[0]) {
      this.renderNextStep(list, "Set up the party", "Party data powers encounter building and combat loading.", () => this.plugin.openPartyManager(data.campaignPath));
    }
    if (!this.plugin.settings.musicSettings.audioFolderPath) {
      this.renderNextStep(list, "Configure music", "Choose an audio folder before using playlists or inline SFX.", () => this.plugin.ensureMusicPlayerOpen());
    }
    if (data.mapNotes.length === 0) {
      this.renderNextStep(list, "Create or link a map", "Maps make scenes and encounters easier to run from one place.", () => this.plugin.openMapManager());
    }

    if (!list.children.length) {
      list.createEl("p", { text: "Your core campaign setup looks ready. Continue prep or start the session from the actions above.", cls: "campaign-home-muted" });
    }
  }

  private renderRecentNotes(
    container: HTMLElement,
    title: string,
    notes: HomeNote[],
    emptyText: string,
    onCreate: () => void,
  ) {
    const section = container.createDiv({ cls: "campaign-home-section" });
    const header = section.createDiv({ cls: "campaign-home-section-header" });
    header.createEl("h3", { text: title });
    this.createActionButton(header, "Create", "", onCreate);

    if (notes.length === 0) {
      section.createEl("p", { text: emptyText, cls: "campaign-home-muted" });
      return;
    }

    const list = section.createDiv({ cls: "campaign-home-note-list" });
    for (const note of notes.slice(0, 5)) {
      const row = list.createDiv({ cls: "campaign-home-note-row" });
      const link = row.createEl("a", { text: note.name, href: note.file.path });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(note.file);
      });
      row.createEl("span", { text: note.file.parent?.path || "", cls: "campaign-home-note-path" });
    }
  }

  private renderRecentMaps(container: HTMLElement, maps: HomeMap[], fallbackNotes: HomeNote[], campaignPath: string) {
    const section = container.createDiv({ cls: "campaign-home-section" });
    const header = section.createDiv({ cls: "campaign-home-section-header" });
    header.createEl("h3", { text: "Recent Maps" });
    this.createActionButton(header, "Open Manager", "", () => this.plugin.openMapManager());

    if (maps.length > 0) {
      const list = section.createDiv({ cls: "campaign-home-note-list" });
      for (const map of maps.slice(0, 5)) {
        const row = list.createDiv({ cls: "campaign-home-note-row campaign-home-map-row" });
        row.createEl("span", { text: map.name, cls: "campaign-home-map-name" });
        row.createEl("span", { text: map.detail, cls: "campaign-home-note-path" });
        row.addEventListener("click", () => this.plugin.openMapManager());
      }
      return;
    }

    if (fallbackNotes.length > 0) {
      this.renderRecentNotes(container, "Map Notes", fallbackNotes, "No map notes yet.", () => this.plugin.createMap(campaignPath));
      return;
    }

    section.createEl("p", { text: "No saved maps yet. Create a map or open Map Manager to review templates.", cls: "campaign-home-muted" });
  }

  private renderMetric(container: HTMLElement, label: string, value: string, detail: string) {
    const card = container.createDiv({ cls: "campaign-home-metric" });
    card.createEl("span", { text: label, cls: "campaign-home-metric-label" });
    card.createEl("strong", { text: value, cls: "campaign-home-metric-value" });
    card.createEl("span", { text: detail, cls: "campaign-home-metric-detail" });
  }

  private renderNextStep(container: HTMLElement, title: string, description: string, onClick: () => void) {
    const row = container.createDiv({ cls: "campaign-home-next-step" });
    const copy = row.createDiv({ cls: "campaign-home-next-step-copy" });
    copy.createEl("strong", { text: title });
    copy.createEl("span", { text: description });
    this.createActionButton(row, "Start", "mod-cta", onClick);
  }

  private createActionButton(container: HTMLElement, label: string, cls: string, onClick: () => void | Promise<void>) {
    const button = container.createEl("button", { text: label, cls: cls || undefined });
    button.addEventListener("click", () => {
      try {
        void onClick();
      } catch (error) {
        console.error("[CampaignHome] Action failed:", error);
        new Notice("Action failed. Check the console for details.");
      }
    });
    return button;
  }

  private async collectHomeData(campaignPath: string): Promise<HomeData> {
    const campaignName = campaignPath.split("/").pop() || "Campaign";
    const notes: HomeNote[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isInCampaign(file.path, campaignPath)) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const type = String(cache?.frontmatter?.type || "");
      if (!type && !(await this.fileContainsMapBlock(file))) continue;

      const fm = cache?.frontmatter;
      const name = String(fm?.name || file.basename);
      const noteType = type || "map";
      notes.push({
        file,
        name,
        type: noteType,
        mtime: file.stat.mtime,
        sessionNumber: this.getSessionNumber(file, fm),
        sessionDate: String(fm?.date || ""),
      });
    }

    const byRecent = (a: HomeNote, b: HomeNote) => b.mtime - a.mtime;
    const bySessionOrder = (a: HomeNote, b: HomeNote) => {
      if (a.sessionNumber !== b.sessionNumber) return b.sessionNumber - a.sessionNumber;
      const aDate = Date.parse(a.sessionDate);
      const bDate = Date.parse(b.sessionDate);
      if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) return bDate - aDate;
      return b.mtime - a.mtime;
    };

    const sessions = notes.filter((note) => note.type === "session").sort(bySessionOrder);
    const scenes = notes.filter((note) => note.type === "scene").sort(byRecent);
    const mapNotes = notes.filter((note) => note.type === "map").sort(byRecent);
    const encounters = this.countEncountersForCampaign(campaignPath);
    const recentMaps = await this.loadRecentPersistedMaps();
    const maps = Math.max(mapNotes.length, recentMaps.length);

    return { campaignName, campaignPath, sessions, scenes, encounters, mapNotes, recentMaps, maps };
  }

  private isInCampaign(path: string, campaignPath: string): boolean {
    return path === campaignPath || path.startsWith(`${campaignPath}/`);
  }

  private async fileContainsMapBlock(file: TFile): Promise<boolean> {
    try {
      const content = await this.app.vault.cachedRead(file);
      return content.includes("```dnd-map");
    } catch {
      return false;
    }
  }

  private countEncountersForCampaign(campaignPath: string): number {
    const encounters = Object.values(this.plugin.partyManager.getAllEncounters());
    return encounters.filter((encounter) => {
      if (!encounter.notePath) return true;
      return this.isInCampaign(encounter.notePath, campaignPath);
    }).length;
  }

  private async loadRecentPersistedMaps(): Promise<HomeMap[]> {
    const maps: HomeMap[] = [];
    try {
      const annotationDir = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/map-annotations`;
      if (!(await this.plugin.app.vault.adapter.exists(annotationDir))) return maps;
      const listing = await this.plugin.app.vault.adapter.list(annotationDir);
      for (const path of listing.files) {
        if (!path.endsWith(".json")) continue;
        try {
          const raw = await this.plugin.app.vault.adapter.read(path);
          const data = JSON.parse(raw);
          if (!data.mapId) continue;

          const modified = Date.parse(String(data.lastModified || data.createdDate || ""));
          const type = data.isTemplate ? "Template" : data.type || "Map";
          const image = data.imageFile ? data.imageFile.split("/").pop() : "";
          maps.push({
            id: String(data.mapId),
            name: String(data.name || data.mapId),
            detail: image ? `${type} - ${image}` : type,
            lastModified: Number.isFinite(modified) ? modified : 0,
          });
        } catch {
          // skip corrupt map annotation files
        }
      }
    } catch {
      return maps;
    }

    return maps.sort((a, b) => b.lastModified - a.lastModified);
  }

  private getSessionNumber(file: TFile, frontmatter: any): number {
    const rawNumber = frontmatter?.sessionNum ?? frontmatter?.session_number;
    const parsed = Number(rawNumber);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return this.extractSessionNumber(file.basename);
  }

  private extractSessionNumber(filename: string): number {
    let match = filename.match(/Session\s+(\d+)/i);
    if (match?.[1]) return parseInt(match[1], 10);

    match = filename.match(/^(\d{3})_\d{8}$/);
    if (match?.[1]) return parseInt(match[1], 10);

    return 0;
  }
}
