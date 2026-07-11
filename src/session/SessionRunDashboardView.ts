import { App, ItemView, Notice, Setting, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SESSION_RUN_VIEW_TYPE } from "../constants";
import { TimerNameModal } from "./TimerNameModal";
import type { SceneMusicConfig } from '../music/types';
import type { SoundEffectConfig } from '../music/SoundEffectBlock';
import { parseSoundEffectCodeblockMarkdown } from '../music/SoundEffectBlock';
import type { HandoutContentType } from '../projection/types';
import { updateYamlFrontmatter } from '../utils/YamlFrontmatter';
import { selectCurrentSession } from './sessionLifecycle';
import { extractQuickNotes, updateQuickNotesSection } from './quickNotes';

type RunScene = {
  path: string;
  number: number;
  name: string;
  type: string;
  difficulty: string;
  status: string;
  mapLinked?: boolean;
  mapId?: string;
  mapName?: string;
  mapNotePath?: string;
  musicConfig?: SceneMusicConfig;
  encounterName?: string;
  encounterPath?: string;
  soundEffects?: SoundEffectConfig[];
  handouts?: Array<{ label: string; path: string; contentType: HandoutContentType }>;
  inlineHandoutCount?: number;
  partySummary?: string;
  partyId?: string;
};

export class SessionRunDashboardView extends ItemView {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  currentSessionFile: TFile | null = null;
  readOnlyMode: boolean = true;
  timers: Array<{id: string; name: string; startTime: number; paused: boolean; pausedAt: number; elapsed: number}> = [];
  diceHistory: Array<{roll: string; result: number; timestamp: number}> = [];
  quickNotesContent: string = "";
  autoSaveInterval: number | null = null;
  timerUpdateInterval: number | null = null;
  private readonly managedLeaves = new Set<WorkspaceLeaf>();
  private readonly priorLeafModes = new Map<WorkspaceLeaf, string>();

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.getActiveCampaignPath();
  }

  getViewType(): string {
    return SESSION_RUN_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Session Running";
  }

  getIcon(): string {
    return "play-circle";
  }

  setCampaign(campaignPath: string) {
    if (this.campaignPath === campaignPath) return;
    this.campaignPath = campaignPath;
    void this.detectCurrentSession().then(() => this.loadQuickNotes()).then(() => this.render());
  }

  async setSession(sessionPath: string | undefined) {
    if (!sessionPath) {
      await this.detectCurrentSession();
    } else {
      const file = this.app.vault.getAbstractFileByPath(sessionPath);
      this.currentSessionFile = file instanceof TFile ? file : null;
    }
    await this.loadQuickNotes();
    await this.render();
  }

  private renderCampaignPicker(container: HTMLElement) {
    const wrapper = container.createEl("div", { cls: "dashboard-campaign-picker" });
    wrapper.createEl("h2", { text: "🎮 Session Control" });
    wrapper.createEl("p", { text: "Select a campaign to run your session." });

    const campaigns = this.plugin.getAllCampaigns();
    if (campaigns.length === 0) {
      this.renderEmptyState(
        wrapper,
        "No campaigns found",
        "Create a campaign before using the live session controls.",
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

    const btn = wrapper.createEl("button", { text: "Start Session", cls: "mod-cta" });
    btn.addEventListener("click", async () => {
      this.campaignPath = select.value;
      await this.plugin.setActiveCampaignPath(select.value);
      await this.detectCurrentSession();
      this.render();
    });
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

  async onOpen() {
    this.campaignPath = this.plugin.getActiveCampaignPath();
    // Find current session file
    await this.detectCurrentSession();

    // Load existing quick notes from the session file
    await this.loadQuickNotes();
    
    await this.render();
    
    // Enable read-only mode after a short delay to ensure workspace is ready
    setTimeout(() => {
      if (this.readOnlyMode) {
        this.enableReadOnlyMode();
      }
    }, 300);

    // Start auto-save for quick notes
    this.startAutoSave();
  }

  async detectCurrentSession() {
    // First try Sessions subfolder
    const sessionsFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Sessions`);
    const sessionFiles: TFile[] = [];

    if (sessionsFolder instanceof TFolder) {
      // Sessions are in a subfolder
      for (const item of sessionsFolder.children) {
        if (item instanceof TFile && item.extension === "md") {
          sessionFiles.push(item);
        }
      }
    } else {
      // Sessions are at campaign root level (same level as world.md)
      const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
      if (campaignFolder instanceof TFolder) {
        for (const item of campaignFolder.children) {
          if (item instanceof TFile && item.extension === "md") {
            // Check frontmatter for type: session
            const cache = this.app.metadataCache.getFileCache(item);
            if (cache?.frontmatter?.type === "session") {
              sessionFiles.push(item);
            } else if (item.basename.match(/^Session\s+\d+/i) || 
                       item.basename.match(/^\d{3}_\d{8}$/)) {
              // Fallback to filename patterns: "Session X" or "001_20250521"
              sessionFiles.push(item);
            }
          }
        }
      }
    }

    this.currentSessionFile = selectCurrentSession(sessionFiles.map((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return {
        value: file,
        status: fm?.status,
        sessionNumber: Number(fm?.sessionNum) || this.extractSessionNumber(file.basename),
      };
    }));
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

  /** Detect whether a dashboard-managed markdown leaf is currently editable. */
  private detectActualEditMode(): boolean {
    for (const leaf of this.managedLeaves) {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (typeof view.getMode === 'function' && view.getMode() === 'source') {
          return true;
        }
      }
    }
    return false;
  }

  private manageLeaf(leaf: WorkspaceLeaf): void {
    this.managedLeaves.add(leaf);
  }

  enableReadOnlyMode() {
    this.readOnlyMode = true;
    for (const leaf of this.managedLeaves) {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (typeof view.getMode === 'function') {
          if (!this.priorLeafModes.has(leaf)) this.priorLeafModes.set(leaf, view.getMode());
        }
        if (typeof view.getMode === 'function' && view.getMode() !== 'preview') {
          const state = view.getState();
          view.setState({ ...state, mode: "preview" }, {});
        }
      }
    }
  }

  disableReadOnlyMode() {
    this.readOnlyMode = false;
    for (const [leaf, priorMode] of this.priorLeafModes) {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (typeof view.getMode === 'function' && view.getMode() !== priorMode) {
          const state = view.getState();
          view.setState({ ...state, mode: priorMode }, {});
        }
      }
    }
    this.priorLeafModes.clear();
  }

  startAutoSave() {
    if (this.autoSaveInterval) return;
    
    // Auto-save every 30 seconds
    this.autoSaveInterval = window.setInterval(() => {
      this.saveQuickNotes();
    }, 30000);
  }

  async saveQuickNotes() {
    if (!this.currentSessionFile) return;

    try {
      const content = await this.app.vault.read(this.currentSessionFile);
      
      const newContent = updateQuickNotesSection(content, this.quickNotesContent);
      if (newContent !== content) {
        await this.app.vault.modify(this.currentSessionFile, newContent);
      }
    } catch (error) {
      console.error("Error saving quick notes:", error);
    }
  }

  /** Load existing quick notes from the session file on startup. */
  async loadQuickNotes() {
    if (!this.currentSessionFile) return;

    try {
      const content = await this.app.vault.read(this.currentSessionFile);
      this.quickNotesContent = extractQuickNotes(content);
    } catch (error) {
      console.error("Error loading quick notes:", error);
    }
  }

  addTimer(name: string) {
    const timer = {
      id: `timer-${Date.now()}`,
      name: name,
      startTime: Date.now(),
      paused: false,
      pausedAt: 0,
      elapsed: 0
    };
    this.timers.push(timer);
    this.render();
  }

  removeTimer(id: string) {
    this.timers = this.timers.filter(t => t.id !== id);
    this.render();
  }

  toggleTimer(id: string) {
    const timer = this.timers.find(t => t.id === id);
    if (!timer) return;

    if (timer.paused) {
      // Resume
      timer.startTime = Date.now() - timer.elapsed;
      timer.paused = false;
    } else {
      // Pause
      timer.elapsed = Date.now() - timer.startTime;
      timer.pausedAt = Date.now();
      timer.paused = true;
    }
    this.render();
  }

  getTimerDisplay(timer: {startTime: number; paused: boolean; elapsed: number}): string {
    const totalMs = timer.paused ? timer.elapsed : Date.now() - timer.startTime;
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  rollDice(diceType: string) {
    // Built-in dice roller
    const sides = parseInt(diceType.substring(1)); // Remove 'd' prefix (e.g., "d20" -> 20)
    const result = Math.floor(Math.random() * sides) + 1;
    
    this.diceHistory.unshift({
      roll: diceType,
      result: result,
      timestamp: Date.now()
    });

    // Keep only last 20 rolls
    if (this.diceHistory.length > 20) {
      this.diceHistory = this.diceHistory.slice(0, 20);
    }

    this.render();
  }

  async render() {
    const container = this.containerEl.children[1];
    if (!container) return;
    
    container.empty();
    container.addClass("session-run-dashboard");
    container.addClass("session-run-compact");

    const activeCampaignPath = this.plugin.getActiveCampaignPath();
    if (activeCampaignPath && activeCampaignPath !== this.campaignPath) {
      this.campaignPath = activeCampaignPath;
      await this.detectCurrentSession();
      await this.loadQuickNotes();
    }

    // If no campaign resolved, show picker
    if (!this.campaignPath) {
      this.renderCampaignPicker(container as HTMLElement);
      return;
    }

    // Header with session info
    const header = container.createEl("div", { cls: "run-dashboard-header-compact" });
    const sessionName = this.currentSessionFile?.basename || "No Active Session";
    header.createEl("h3", { text: `🎮 Session Control` });

    const campaignName = this.campaignPath.split("/").pop() || "No campaign selected";
    const campaignRow = header.createEl("div", { cls: "session-active-campaign" });
    campaignRow.createEl("span", { text: campaignName });
    const homeBtn = campaignRow.createEl("button", { text: "Campaign Home" });
    homeBtn.addEventListener("click", () => {
      void this.plugin.openCampaignHome(this.campaignPath);
    });

    header.createEl("p", { 
      text: sessionName,
      cls: "session-name-compact"
    });

    // Read-only mode toggle — sync with actual workspace state
    const anyEditable = this.detectActualEditMode();
    if (anyEditable && this.readOnlyMode) {
      // Workspace drifted — a leaf was manually switched to edit mode
      this.readOnlyMode = false;
    }

    const modeToggle = header.createEl("div", { cls: "mode-toggle-compact" });
    const toggleBtn = modeToggle.createEl("button", {
      text: this.readOnlyMode ? "🔒 Read-Only" : "🔓 Editable",
      cls: this.readOnlyMode ? "mod-warning" : ""
    });
    toggleBtn.addEventListener("click", () => {
      if (this.readOnlyMode) {
        this.disableReadOnlyMode();
      } else {
        this.enableReadOnlyMode();
      }
      this.render();
    });

    // Compact single-column layout for control panel
    const controlPanel = container.createEl("div", { cls: "run-dashboard-controls" });

    // Timers section
    await this.renderTimers(controlPanel);
    
    // Dice roller section
    this.renderDiceRoller(controlPanel);

    await this.renderLiveSceneControl(controlPanel);

    // Scene music detection – scan active scene for dnd-music codeblock
    await this.renderSceneMusicDetector(controlPanel);
    
    // Quick notes section
    await this.renderQuickNotes(controlPanel);
    
    // SRD Quick Search section
    await this.renderSRDQuickSearch(controlPanel);
    
    // Quick actions section
    await this.renderQuickActions(controlPanel);

    // Setup Layout button
    const layoutSection = container.createEl("div", { cls: "dashboard-section" });
    const setupBtn = layoutSection.createEl("button", {
      text: "📐 Setup Session Layout",
      cls: "mod-cta"
    });
    setupBtn.style.width = "100%";
    setupBtn.addEventListener("click", () => {
      this.setupSessionLayout();
    });

    // Update timers display every second
    if (this.timerUpdateInterval) {
      window.clearInterval(this.timerUpdateInterval);
    }
    
    this.timerUpdateInterval = window.setInterval(() => {
      const timerDisplays = container.querySelectorAll('.timer-display');
      timerDisplays.forEach((display, index) => {
        if (this.timers[index]) {
          display.textContent = this.getTimerDisplay(this.timers[index]);
        }
      });
    }, 1000);
  }

  async setupSessionLayout() {
    
    // Get or create main workspace leaf
    let mainLeaf = this.app.workspace.getLeaf(false);
    
    if (!mainLeaf) {
      console.error("❌ No workspace leaf available");
      new Notice("Could not set up layout - no workspace available");
      return;
    }
    this.manageLeaf(mainLeaf);


    // Use the adventures explicitly linked to this session, in session order.
    const adventures = await this.getSessionAdventures();
    let adventure = adventures.length > 0 ? adventures[0] : null;
    const orderedScenes: Array<{ scene: RunScene; adventure: typeof adventure }> = [];
    for (const candidate of adventures) {
      const scenes = await this.getScenesForAdventure(candidate.path) as RunScene[];
      orderedScenes.push(...scenes.map(scene => ({ scene, adventure: candidate })));
    }
    const selected = orderedScenes.find(entry => entry.scene.status === "in-progress")
      || orderedScenes.find(entry => entry.scene.status === "not-started")
      || orderedScenes.find(entry => entry.scene.status !== "completed");
    const currentScene = selected?.scene;
    if (selected) {
      adventure = selected.adventure;
    }
    
    if (adventure) {
      if (currentScene) {
        // Open scene in main pane (largest view)
        const sceneFile = this.app.vault.getAbstractFileByPath(currentScene.path);
        if (sceneFile instanceof TFile) {
          await mainLeaf.openFile(sceneFile);
          // Collapse properties for scene
          await this.collapseProperties(mainLeaf);
        }
        
        // Split right for adventure
        const adventureLeaf = this.app.workspace.getLeaf('split', 'vertical');
        this.manageLeaf(adventureLeaf);
        const adventureFile = this.app.vault.getAbstractFileByPath(adventure.path);
        if (adventureFile instanceof TFile) {
          await adventureLeaf.openFile(adventureFile);
          // Collapse properties for adventure
          await this.collapseProperties(adventureLeaf);
        }
        
        // Split bottom of adventure pane for session notes
        if (this.currentSessionFile) {
          const sessionLeaf = this.app.workspace.getLeaf('split', 'horizontal');
          this.manageLeaf(sessionLeaf);
          await sessionLeaf.openFile(this.currentSessionFile);
          // Collapse properties for session
          await this.collapseProperties(sessionLeaf);
        }
      } else {
        // No scene available, open adventure in main
        const adventureFile = this.app.vault.getAbstractFileByPath(adventure.path);
        if (adventureFile instanceof TFile) {
          await mainLeaf.openFile(adventureFile);
          await this.collapseProperties(mainLeaf);
        }
        
        // Open session in split if available
        if (this.currentSessionFile) {
          const sessionLeaf = this.app.workspace.getLeaf('split', 'vertical');
          this.manageLeaf(sessionLeaf);
          await sessionLeaf.openFile(this.currentSessionFile);
          await this.collapseProperties(sessionLeaf);
        }
      }
    } else if (this.currentSessionFile) {
      // No adventure, just open session
      await mainLeaf.openFile(this.currentSessionFile);
      await this.collapseProperties(mainLeaf);
    }

    // Open our Combat Tracker
    setTimeout(() => {
      (this.app as any).commands?.executeCommandById("dnd-campaign-hub:open-combat-tracker");
    }, 500);

    // Enable read-only mode for the opened files
    setTimeout(() => {
      if (this.readOnlyMode) {
        this.enableReadOnlyMode();
      }
    }, 800);

    new Notice("Session layout configured!");
  }

  /**
   * Collapse the properties (frontmatter) panel in a leaf
   */
  async collapseProperties(leaf: WorkspaceLeaf) {
    // Wait for the file to fully load and metadata editor to be ready
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const view = leaf.view;
    if (view.getViewType() === "markdown") {
      try {
        // Access the metadata editor (properties panel) directly
        const metadataEditor = (view as any).metadataEditor;
        
        if (metadataEditor) {
          // Method 1: Try to collapse via the toggle method
          if (typeof metadataEditor.toggle === 'function') {
            // Close it if it's open
            if (!metadataEditor.collapsed) {
              metadataEditor.toggle();
            }
          }
          
          // Method 2: Set collapsed state directly
          if ('collapsed' in metadataEditor) {
            metadataEditor.collapsed = true;
          }
          
          // Method 3: Hide the container element
          if (metadataEditor.containerEl) {
            metadataEditor.containerEl.style.display = 'none';
          }
        }
        
        // Also try setting ephemeral state as fallback
        leaf.setEphemeralState({ showProperties: false });
      } catch (error) {
        console.error("Error collapsing properties:", error);
      }
    }
  }

  async renderTimers(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "⏱️ Timers" });

    if (this.timers.length === 0) {
      section.createEl("p", { text: "No active timers", cls: "empty-message" });
    }

    for (const timer of this.timers) {
      const timerCard = section.createEl("div", { cls: "timer-card" });
      
      const timerHeader = timerCard.createEl("div", { cls: "timer-header" });
      timerHeader.createEl("strong", { text: timer.name });
      
      const timerDisplay = timerCard.createEl("div", { 
        cls: "timer-display",
        text: this.getTimerDisplay(timer)
      });

      const timerControls = timerCard.createEl("div", { cls: "timer-controls" });
      
      const pauseBtn = timerControls.createEl("button", {
        text: timer.paused ? "▶️ Resume" : "⏸️ Pause"
      });
      pauseBtn.addEventListener("click", () => this.toggleTimer(timer.id));

      const removeBtn = timerControls.createEl("button", {
        text: "🗑️ Remove",
        cls: "mod-warning"
      });
      removeBtn.addEventListener("click", () => this.removeTimer(timer.id));
    }

    // Add timer button
    const addTimerBtn = section.createEl("button", {
      text: "+ Add Timer",
      cls: "mod-cta"
    });
    addTimerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      
      // Use modal instead of prompt (prompt() not supported in Electron)
      new Promise<string | null>((resolve) => {
        new TimerNameModal(this.app, "Session Timer", resolve).open();
      }).then((name) => {
        if (name) {
          this.addTimer(name);
        }
      });
    });
  }

  renderDiceRoller(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "🎲 Dice Roller" });

    const diceButtons = section.createEl("div", { cls: "dice-buttons" });
    const commonDice = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
    
    for (const dice of commonDice) {
      const btn = diceButtons.createEl("button", {
        text: dice,
        cls: "dice-button"
      });
      btn.addEventListener("click", () => this.rollDice(dice));
    }

    // Dice history
    if (this.diceHistory.length > 0) {
      const historyHeader = section.createEl("div", { cls: "dice-history-header" });
      historyHeader.createEl("h4", { text: "History" });
      const clearBtn = historyHeader.createEl("button", {
        text: "🗑️ Clear",
        cls: "dice-clear-button"
      });
      clearBtn.addEventListener("click", () => {
        this.diceHistory = [];
        this.render();
      });
      
      const history = section.createEl("div", { cls: "dice-history" });
      
      for (const roll of this.diceHistory.slice(0, 10)) {
        const rollItem = history.createEl("div", { cls: "dice-history-item" });
        rollItem.createEl("span", { 
          text: `${roll.roll}: `,
          cls: "dice-type"
        });
        rollItem.createEl("span", { 
          text: roll.result.toString(),
          cls: "dice-result"
        });
      }
    }
  }

  async renderLiveSceneControl(container: HTMLElement) {
    const context = await this.getLiveSceneContext();
    const section = container.createEl("div", { cls: "dashboard-section session-live-scene" });
    section.createEl("h3", { text: "🎬 Live Scene" });

    if (!context.current) {
      this.renderEmptyState(
        section,
        "No runnable scene found",
        "Create or prepare a scene to make the live dashboard useful during play.",
        [
          { label: "Add Scene", onClick: () => this.plugin.createScene(this.campaignPath), cta: true },
          { label: "Open Prep", onClick: () => this.plugin.openSessionPrepDashboard(this.campaignPath) },
        ]
      );
      return;
    }

    const current = context.current;
    const card = section.createEl("div", { cls: "session-live-scene-card" });
    const heading = card.createEl("div", { cls: "session-live-scene-heading" });
    heading.createEl("strong", { text: `Scene ${current.number || ""} ${current.name}`.trim() });
    heading.createEl("span", { text: `${current.status} · ${current.type} · ${current.difficulty}` });

    const nav = card.createEl("div", { cls: "session-live-scene-nav" });
    this.createSceneActionButton(nav, "Previous", () => this.openScene(context.previous?.path), false, !context.previous);
    this.createSceneActionButton(nav, "Open Scene", () => this.openScene(current.path), true);
    this.createSceneActionButton(nav, "Next", () => this.openScene(context.next?.path), false, !context.next);

    const links = card.createEl("div", { cls: "session-live-scene-links" });
    this.renderSceneStatusPill(links, "Map", current.mapName || (current.mapLinked ? "Linked" : "Missing"), !!current.mapLinked);
    this.renderSceneStatusPill(links, "Music", current.musicConfig ? "Linked" : "Missing", !!current.musicConfig);
    this.renderSceneStatusPill(links, "Encounter", current.encounterName || current.encounterPath ? "Linked" : "Missing", !!(current.encounterName || current.encounterPath));
    this.renderSceneStatusPill(links, "SFX", current.soundEffects?.length ? `${current.soundEffects.length}` : "None", !!current.soundEffects?.length);
    const handoutCount = (current.handouts?.length || 0) + (current.inlineHandoutCount || 0);
    this.renderSceneStatusPill(links, "Handouts", handoutCount ? `${handoutCount}` : "None", handoutCount > 0);
    this.renderSceneStatusPill(links, "Party", current.partySummary || "Missing", !!current.partySummary);

    const actions = card.createEl("div", { cls: "session-live-scene-actions" });
    this.createSceneActionButton(actions, "Start Scene", async () => {
      await this.updateSceneStatus(current.path, "in-progress");
      await this.openScene(current.path);
    }, current.status !== "in-progress");

    if (current.musicConfig) {
      this.createSceneActionButton(actions, "Play Music", async () => {
        this.plugin.ensureMusicPlayerOpen();
        await this.plugin.musicPlayer.loadSceneMusic(current.musicConfig!, current.musicConfig!.autoPlay);
      });
    }

    if (!current.mapLinked) {
      this.createSceneActionButton(actions, "Link Map", () => this.plugin.openMapManager());
    }

    if (current.encounterPath) {
      this.createSceneActionButton(actions, "Start Encounter", async () => {
        await this.openLinkedEncounter(current);
      });
    } else {
      this.createSceneActionButton(actions, "Add Encounter", () => this.plugin.createEncounter(this.campaignPath));
    }

    if (current.handouts?.length) {
      this.createSceneActionButton(actions, "Project Handout", () => this.projectHandout(current.handouts![0]!));
    } else if (current.inlineHandoutCount) {
      this.createSceneActionButton(actions, "Open Handouts", () => this.openScene(current.path));
    }

    if (current.soundEffects?.length) {
      this.createSceneActionButton(actions, "Play SFX", () => this.playSceneSoundEffect(current.soundEffects![0]!));
    }

    this.createSceneActionButton(actions, "Open Party", () => this.plugin.openPartyManager(this.campaignPath), false, !current.partyId);

    this.createSceneActionButton(actions, "Complete", () => this.markSceneComplete(current.path), false, current.status === "completed");

    const missing: string[] = [];
    if (!current.mapLinked) missing.push("map");
    if (!current.musicConfig) missing.push("music");
    if (!current.encounterName && !current.encounterPath) missing.push("encounter");
    if (!handoutCount) missing.push("handout");
    if (!current.partySummary) missing.push("party");
    if (missing.length > 0) {
      card.createEl("p", {
        cls: "session-live-scene-missing",
        text: `Missing: ${missing.join(", ")}.`,
      });
    }
  }

  private async getLiveSceneContext(): Promise<{ current: RunScene | null; previous: RunScene | null; next: RunScene | null }> {
    const adventures = await this.getSessionAdventures();
    const scenes: RunScene[] = [];
    for (const adventure of adventures) {
      scenes.push(...await this.getScenesForAdventure(adventure.path) as RunScene[]);
    }
    for (const scene of scenes) {
      await this.enrichRunScene(scene);
    }

    const current = scenes.find((scene) => scene.status === "in-progress")
      || scenes.find((scene) => scene.status === "not-started")
      || scenes.find((scene) => scene.status !== "completed")
      || scenes[0]
      || null;
    if (!current) return { current: null, previous: null, next: null };

    const index = scenes.findIndex((scene) => scene.path === current.path);
    return {
      current,
      previous: index > 0 ? scenes[index - 1] || null : null,
      next: index >= 0 && index < scenes.length - 1 ? scenes[index + 1] || null : null,
    };
  }

  private async enrichRunScene(scene: RunScene): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(scene.path);
    if (!(file instanceof TFile)) return;

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    scene.encounterName = fm.tracker_encounter || "";
    scene.encounterPath = this.extractLinkPath(fm.encounter_file || "");

    const content = await this.app.vault.cachedRead(file);
    const mapId = this.extractFirstMapId(content);
    scene.mapId = mapId || undefined;
    scene.mapLinked = !!mapId || content.includes("```dnd-map");
    scene.mapNotePath = scene.mapLinked ? scene.path : undefined;
    if (mapId) {
      const mapData = await this.plugin.loadMapAnnotations(mapId);
      scene.mapName = mapData?.name || mapId;
    } else {
      scene.mapName = undefined;
    }

    const musicMatch = content.match(/```dnd-music\s*\n([\s\S]*?)```/);
    if (musicMatch?.[1]) {
      try {
        scene.musicConfig = JSON.parse(musicMatch[1].trim()) as SceneMusicConfig;
      } catch {
        scene.musicConfig = undefined;
      }
    }

    scene.soundEffects = this.extractSceneSoundEffects(content);
    scene.handouts = this.extractSceneHandouts(content, fm);
    scene.inlineHandoutCount = this.countInlineHandouts(content);

    const party = this.plugin.partyManager.getParty(fm.selected_party_id || fm.party_id || "")
      || this.plugin.partyManager.getPartiesForCampaign(this.campaignPath)[0]
      || this.plugin.partyManager.resolveParty(undefined, this.campaignPath)
      || this.plugin.partyManager.resolvePartyForNote(scene.path);
    if (party) {
      const members = await this.plugin.partyManager.resolveMembers(party.id);
      const active = members.filter((member) => member.enabled && !member.absent).length;
      scene.partyId = party.id;
      scene.partySummary = `${party.name} (${active}/${members.length} active)`;
    } else {
      scene.partyId = undefined;
      scene.partySummary = undefined;
    }
  }

  private extractSceneSoundEffects(content: string): SoundEffectConfig[] {
    const effects: SoundEffectConfig[] = [];

    for (const match of content.matchAll(/```dnd-sfx\s*\n([\s\S]*?)```/g)) {
      const config = parseSoundEffectCodeblockMarkdown(match[1] || "");
      if (config) effects.push(config);
    }

    for (const match of content.matchAll(/data-dnd-sfx=(?:"([^"]+)"|'([^']+)')/g)) {
      const encoded = match[1] || match[2] || "";
      const config = this.parseInlineSoundEffectData(encoded);
      if (config) effects.push(config);
    }

    for (const match of content.matchAll(/\[[^\]]+\]\((dnd-sfx:[^)]+)\)/g)) {
      const config = this.parseInlineSoundEffectHref(match[1] || "");
      if (config) effects.push(config);
    }

    return effects;
  }

  private extractFirstMapId(content: string): string {
    for (const match of content.matchAll(/```dnd-map\s*\n([\s\S]*?)```/g)) {
      const source = match[1]?.trim();
      if (!source) continue;
      try {
        const parsed = JSON.parse(source) as { mapId?: unknown };
        if (typeof parsed.mapId === "string" && parsed.mapId.trim()) {
          return parsed.mapId.trim();
        }
      } catch {
        const fallback = source.match(/"mapId"\s*:\s*"([^"]+)"/);
        if (fallback?.[1]) return fallback[1].trim();
      }
    }
    return "";
  }

  private parseInlineSoundEffectData(data: string): SoundEffectConfig | null {
    try {
      const parsed = JSON.parse(decodeURIComponent(this.unescapeHtmlAttribute(data))) as Partial<SoundEffectConfig>;
      if (!parsed.filePath) return null;
      return {
        name: parsed.name || this.fileNameWithoutExtension(parsed.filePath) || "Sound Effect",
        icon: parsed.icon || "🔊",
        filePath: parsed.filePath,
        volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(100, parsed.volume)) : null,
      };
    } catch {
      return null;
    }
  }

  private parseInlineSoundEffectHref(href: string): SoundEffectConfig | null {
    if (!href.startsWith("dnd-sfx:")) return null;
    const rest = href.startsWith("dnd-sfx://") ? href.slice("dnd-sfx://".length) : href.slice("dnd-sfx:".length);
    const queryIndex = rest.indexOf("?");
    const encodedPath = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
    const query = queryIndex === -1 ? "" : rest.slice(queryIndex + 1);

    try {
      const filePath = decodeURIComponent(encodedPath);
      if (!filePath) return null;
      const params = new URLSearchParams(query);
      const name = params.get("name") || this.fileNameWithoutExtension(filePath) || "Sound Effect";
      const icon = params.get("icon") || "🔊";
      const parsedVolume = Number(params.get("volume"));
      return {
        name,
        icon,
        filePath,
        volume: Number.isFinite(parsedVolume) ? Math.max(0, Math.min(100, parsedVolume)) : null,
      };
    } catch {
      return null;
    }
  }

  private extractSceneHandouts(content: string, frontmatter: Record<string, any>): Array<{ label: string; path: string; contentType: HandoutContentType }> {
    const handouts: Array<{ label: string; path: string; contentType: HandoutContentType }> = [];
    const seen = new Set<string>();
    const candidates: string[] = [];

    for (const field of ["handout", "handouts", "handout_file", "handout_files", "player_handout", "player_handouts"]) {
      const value = frontmatter[field];
      if (Array.isArray(value)) {
        candidates.push(...value.map((item) => String(item)));
      } else if (typeof value === "string") {
        candidates.push(value);
      }
    }

    const handoutSection = content.match(/(?:^|\n)#{2,4}\s+.*handouts?.*\n([\s\S]*?)(?=\n#{1,4}\s+|$)/i);
    if (handoutSection?.[1]) {
      for (const match of handoutSection[1].matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)) {
        candidates.push(match[1] || "");
      }
      for (const match of handoutSection[1].matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        candidates.push(match[1] || "");
      }
    }

    for (const raw of candidates) {
      const path = this.extractLinkPath(raw);
      const file = path ? this.app.metadataCache.getFirstLinkpathDest(path, this.campaignPath) : null;
      const resolvedPath = file?.path || path;
      const contentType = this.detectHandoutContentType(resolvedPath);
      if (!resolvedPath || !contentType || seen.has(resolvedPath)) continue;
      seen.add(resolvedPath);
      handouts.push({
        label: resolvedPath.split("/").pop() || resolvedPath,
        path: resolvedPath,
        contentType,
      });
    }

    return handouts;
  }

  private countInlineHandouts(content: string): number {
    const quoteHandouts = content.match(/>\s*\[!(?:quote|note|info)\][^\n]*handout/gi)?.length || 0;
    const headingHandouts = content.match(/^#{2,5}\s+.*handouts?.*$/gim)?.length || 0;
    return quoteHandouts + headingHandouts;
  }

  private detectHandoutContentType(filePath: string): HandoutContentType | null {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!ext) return null;
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (ext === "md") return "note";
    return null;
  }

  private unescapeHtmlAttribute(value: string): string {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  private fileNameWithoutExtension(filePath: string): string {
    const fileName = filePath.split("/").pop() || filePath;
    return fileName.replace(/\.[^.]+$/, "");
  }

  private renderSceneStatusPill(container: HTMLElement, label: string, value: string, linked: boolean) {
    const pill = container.createEl("span", {
      cls: linked ? "session-live-scene-pill is-linked" : "session-live-scene-pill is-missing",
      text: `${label}: ${value}`,
    });
    return pill;
  }

  private createSceneActionButton(container: HTMLElement, label: string, action: () => void | Promise<void>, cta = false, disabled = false) {
    const button = container.createEl("button", {
      text: label,
      cls: cta ? "mod-cta" : undefined,
    });
    button.disabled = disabled;
    button.addEventListener("click", () => {
      if (disabled) return;
      void action();
    });
    return button;
  }

  private async openScene(scenePath?: string) {
    if (!scenePath) return;
    await this.app.workspace.openLinkText(scenePath, "", false);
  }

  private async updateSceneStatus(scenePath: string, status: string) {
    const file = this.app.vault.getAbstractFileByPath(scenePath);
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.read(file);
    const newContent = updateYamlFrontmatter(content, (fm) => ({
      ...fm,
      status,
    }));
    await this.app.vault.modify(file, newContent);
    await this.render();
  }

  private async openLinkedEncounter(scene: RunScene) {
    if (scene.encounterPath) {
      const encounterFile = this.app.metadataCache.getFirstLinkpathDest(scene.encounterPath, scene.path);
      if (encounterFile instanceof TFile) {
        await this.app.workspace.openLinkText(encounterFile.path, "", false);
      }
    }
    await this.plugin.openCombatTracker();
  }

  private async projectHandout(handout: { label: string; path: string; contentType: HandoutContentType }) {
    const spm = this.plugin.sessionProjectionManager;
    const pm = this.plugin.projectionManager;

    if (!spm?.isActive()) {
      this.plugin.openSessionProjectionHub();
      new Notice("Start a projection session, then project the handout.");
      return;
    }

    const state = spm.getAllScreenStates()[0];
    if (!state) {
      this.plugin.openSessionProjectionHub();
      new Notice("No projection screen is available for handouts.");
      return;
    }

    await pm.projectHandout(handout.path, handout.contentType, state.screen);
  }

  private playSceneSoundEffect(config: SoundEffectConfig) {
    this.plugin.ensureMusicPlayerOpen();
    this.plugin.musicPlayer.playSoundEffect({
      id: "live-scene-sfx",
      name: config.name || "Sound Effect",
      filePath: config.filePath,
      icon: config.icon || "🔊",
      volume: config.volume ?? undefined,
    });
  }

  private extractLinkPath(raw: unknown): string {
    if (raw && typeof raw === "object" && "path" in raw) {
      return String((raw as { path?: unknown }).path ?? "").trim();
    }
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    const wiki = trimmed.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
    if (wiki?.[1]) return wiki[1].trim();
    return trimmed.replace(/^["']|["']$/g, "");
  }

  async renderQuickNotes(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "📝 Quick Notes" });
    
    const textarea = section.createEl("textarea", {
      cls: "quick-notes-textarea",
      placeholder: "Jot down quick notes... (Auto-saves every 30s)"
    });
    textarea.value = this.quickNotesContent;
    textarea.addEventListener("input", (e) => {
      this.quickNotesContent = (e.target as HTMLTextAreaElement).value;
    });

    const saveBtn = section.createEl("button", {
      text: "💾 Save Now",
      cls: "mod-cta"
    });
    saveBtn.addEventListener("click", () => {
      this.saveQuickNotes();
      new Notice("Quick notes saved to session!");
    });
  }

  /**
   * Scan all open markdown files for a dnd-music codeblock and show
   * a compact Scene Music card in the dashboard with a Load & Play button.
   */
  async renderSceneMusicDetector(container: HTMLElement) {
    // Look through all open leaves for a scene note containing a dnd-music block
    const configs: Array<{ config: SceneMusicConfig; sceneName: string }> = [];

    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const file = (leaf.view as any).file as TFile | undefined;
      if (!file) continue;

      const content = await this.app.vault.read(file);
      const match = content.match(/```dnd-music\s*\n([\s\S]*?)```/);
      if (match && match[1]) {
        try {
          const config: SceneMusicConfig = JSON.parse(match[1].trim());
          configs.push({ config, sceneName: file.basename });
        } catch { /* ignore invalid JSON */ }
      }
    }

    if (configs.length === 0) return;

    const section = container.createEl('div', { cls: 'dashboard-section scene-music-detector' });
    section.createEl('h3', { text: '🎬 Scene Music' });

    for (const { config, sceneName } of configs) {
      const card = section.createEl('div', { cls: 'scene-music-detect-card' });

      card.createEl('strong', { text: sceneName, cls: 'scene-music-detect-name' });

      const details = card.createEl('div', { cls: 'scene-music-detect-details' });

      // Primary info
      if (config.primaryPlaylistId) {
        const pl = this.plugin.settings.musicSettings.playlists.find(
          (p: any) => p.id === config.primaryPlaylistId
        );
        details.createEl('span', {
          text: `🎵 ${pl ? pl.name : '(unknown)'}`,
          cls: 'scene-music-detect-tag',
        });
      }

      // Ambient info
      if (config.ambientPlaylistId) {
        const pl = this.plugin.settings.musicSettings.playlists.find(
          (p: any) => p.id === config.ambientPlaylistId
        );
        details.createEl('span', {
          text: `🌊 ${pl ? pl.name : '(unknown)'}`,
          cls: 'scene-music-detect-tag',
        });
      }

      const syncDashBtn = () => {
        const busy = this.plugin.musicPlayer.isTransitioning();
        const active = this.plugin.musicPlayer.isScenePlaying(config);
        playBtn.disabled = busy;
        playBtn.classList.toggle('is-disabled', busy);
        if (active) {
          playBtn.textContent = '⏹ Stop';
          playBtn.classList.remove('mod-cta');
          playBtn.classList.add('mod-warning');
        } else {
          playBtn.textContent = '▶ Load & Play';
          playBtn.classList.add('mod-cta');
          playBtn.classList.remove('mod-warning');
        }
      };

      const playBtn = card.createEl('button', {
        text: '▶ Load & Play',
        cls: 'mod-cta scene-music-detect-play',
      });
      playBtn.addEventListener('click', async () => {
        if (this.plugin.musicPlayer.isTransitioning()) return;
        try {
          if (this.plugin.musicPlayer.isScenePlaying(config)) {
            await this.plugin.musicPlayer.stopAll();
          } else {
            this.plugin.ensureMusicPlayerOpen();
            await this.plugin.musicPlayer.loadSceneMusic(config, config.autoPlay);
            new Notice(`🎵 Loaded scene music for "${sceneName}"`);
          }
        } finally {
          syncDashBtn();
        }
      });

      // Sync button state with actual player
      const unsubDash = this.plugin.musicPlayer.onSceneChange(() => syncDashBtn());
      syncDashBtn();

      // Clean up listener when the element is detached
      const dashObserver = new MutationObserver(() => {
        if (!card.isConnected) {
          unsubDash();
          dashObserver.disconnect();
        }
      });
      dashObserver.observe(card.parentElement || document.body, { childList: true, subtree: true });
    }
  }

  async renderSRDQuickSearch(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "🔍 SRD Quick Search" });
    
    // Search input
    const searchContainer = section.createEl("div", { cls: "srd-search-container" });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Search spells, equipment, classes...",
      cls: "srd-search-input"
    });

    // Results container
    const resultsContainer = section.createEl("div", { cls: "srd-search-results" });
    resultsContainer.style.display = "none";

    let searchTimeout: number | null = null;

    searchInput.addEventListener("input", async (e) => {
      const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
      
      // Clear previous timeout
      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }

      if (query.length < 2) {
        resultsContainer.style.display = "none";
        resultsContainer.empty();
        return;
      }

      // Debounce search
      searchTimeout = window.setTimeout(async () => {
        resultsContainer.empty();
        resultsContainer.style.display = "block";
        
        const loading = resultsContainer.createEl("div", {
          text: "Searching...",
          cls: "srd-search-loading"
        });

        try {
          const results = await this.searchSRDData(query);
          
          loading.remove();

          if (results.length === 0) {
            resultsContainer.createEl("div", {
              text: "No results found",
              cls: "srd-search-empty"
            });
            return;
          }

          // Show max 10 results
          const displayResults = results.slice(0, 10);
          
          for (const result of displayResults) {
            const resultCard = resultsContainer.createEl("div", { cls: "srd-search-result-card" });
            
            // Type badge
            const header = resultCard.createEl("div", { cls: "srd-result-header" });
            header.createEl("span", {
              text: result.type,
              cls: "srd-result-type"
            });
            
            // Name (as link)
            const nameLink = header.createEl("a", {
              text: result.name,
              cls: "srd-result-name"
            });
            nameLink.addEventListener("click", async (e) => {
              e.preventDefault();
              await this.app.workspace.openLinkText(result.path, "", true);
            });

            // Preview content
            if (result.preview) {
              resultCard.createEl("div", {
                text: result.preview,
                cls: "srd-result-preview"
              });
            }
          }

          if (results.length > 10) {
            resultsContainer.createEl("div", {
              text: `...and ${results.length - 10} more results`,
              cls: "srd-search-more"
            });
          }
        } catch (error) {
          loading.remove();
          resultsContainer.createEl("div", {
            text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            cls: "srd-search-error"
          });
        }
      }, 300);
    });

    // Clear search on focus out after a delay
    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        // Only hide if we're not clicking on a result link
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== "A" || !activeElement.classList.contains("srd-result-name")) {
          resultsContainer.style.display = "none";
        }
      }, 200);
    });

    searchInput.addEventListener("focus", () => {
      if (searchInput.value.trim().length >= 2) {
        resultsContainer.style.display = "block";
      }
    });
  }

  async searchSRDData(query: string): Promise<Array<{type: string; name: string; path: string; preview: string}>> {
    const results: Array<{type: string; name: string; path: string; preview: string; score: number}> = [];
    
    // Define SRD folders to search
    const srdFolders = [
      { path: "z_Spells", type: "Spell" },
      { path: "z_Equipment", type: "Equipment" },
      { path: "z_Classes", type: "Class" },
      { path: "z_Races", type: "Race" },
      { path: "z_Conditions", type: "Condition" },
      { path: "z_Features", type: "Feature" },
      { path: "z_Traits", type: "Trait" },
      { path: "z_AbilityScores", type: "Ability" },
      { path: "z_Skills", type: "Skill" },
      { path: "z_Languages", type: "Language" },
      { path: "z_DamageTypes", type: "Damage Type" },
      { path: "z_MagicSchools", type: "Magic School" },
      { path: "z_Proficiencies", type: "Proficiency" },
      { path: "z_Subclasses", type: "Subclass" },
      { path: "z_Subraces", type: "Subrace" },
      { path: "z_WeaponProperties", type: "Weapon Property" }
    ];

    for (const folder of srdFolders) {
      const srdFolder = this.app.vault.getAbstractFileByPath(folder.path);
      
      if (!(srdFolder instanceof TFolder)) continue;

      for (const file of srdFolder.children) {
        if (!(file instanceof TFile) || file.extension !== "md") continue;

        const fileName = file.basename.toLowerCase();
        
        // Calculate match score
        let score = 0;
        if (fileName === query) {
          score = 100; // Exact match
        } else if (fileName.startsWith(query)) {
          score = 50; // Starts with query
        } else if (fileName.includes(query)) {
          score = 25; // Contains query
        }

        if (score > 0) {
          try {
            const content = await this.app.vault.read(file);
            
            // Extract preview from content (first non-frontmatter paragraph)
            let preview = "";
            const lines = content.split("\n");
            let inFrontmatter = false;
            let foundContent = false;
            
            for (const line of lines) {
              if (line.trim() === "---") {
                if (!foundContent) {
                  inFrontmatter = !inFrontmatter;
                }
                continue;
              }
              
              if (!inFrontmatter && line.trim() && !line.startsWith("#")) {
                preview = line.trim();
                if (preview.length > 100) {
                  preview = preview.substring(0, 100) + "...";
                }
                break;
              }
            }

            results.push({
              type: folder.type,
              name: file.basename,
              path: file.path,
              preview: preview,
              score: score
            });
          } catch (error) {
            console.error(`Error reading file ${file.path}:`, error);
          }
        }
      }
    }

    // Sort by score (highest first) and then alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  async renderQuickActions(container: HTMLElement) {
    const section = container.createEl("div", { cls: "dashboard-section" });
    section.createEl("h3", { text: "⚡ Quick Actions" });
    
    const actions = section.createEl("div", { cls: "quick-actions-compact" });

    // Session Projection Hub
    const projectionBtn = actions.createEl("button", {
      text: "🎬 Projection Hub",
      cls: "quick-action-button"
    });
    projectionBtn.addEventListener("click", () => {
      (this.app as any).commands?.executeCommandById("dnd-campaign-hub:session-projection-hub");
    });

    // Combat Tracker
    const initiativeBtn = actions.createEl("button", {
      text: "⚔️ Open Combat Tracker",
      cls: "quick-action-button"
    });
    initiativeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      (this.app as any).commands?.executeCommandById("dnd-campaign-hub:open-combat-tracker");
    });

    // Create Encounter
    const encounterBtn = actions.createEl("button", {
      text: "⚔️ Create Encounter",
      cls: "quick-action-button"
    });
    encounterBtn.addEventListener("click", () => {
      (this.app as any).commands?.executeCommandById("dnd-campaign-hub:create-encounter");
    });

    // Open Session File
    if (this.currentSessionFile) {
      const sessionBtn = actions.createEl("button", {
        text: "📄 Open Session Note",
        cls: "quick-action-button"
      });
      sessionBtn.addEventListener("click", async () => {
        if (this.currentSessionFile) {
          await this.app.workspace.openLinkText(this.currentSessionFile.path, "", false);
        }
      });
    }
  }

  async getActiveAdventures() {
    const adventures: Array<{path: string; name: string; status: string}> = [];
    const adventuresFolder = this.app.vault.getAbstractFileByPath(`${this.campaignPath}/Adventures`);

    if (!(adventuresFolder instanceof TFolder)) {
      return adventures;
    }

    for (const item of adventuresFolder.children) {
      if (item instanceof TFile && item.extension === "md") {
        const cache = this.app.metadataCache.getFileCache(item);
        const status = cache?.frontmatter?.status || "planning";
        
        // Show active, in-progress, and planning adventures (not completed or on-hold)
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

  /** Resolve the current session's ordered adventures, deduplicated by vault path. */
  async getSessionAdventures(): Promise<Array<{ path: string; name: string; status: string }>> {
    if (!this.currentSessionFile) return this.getActiveAdventures();

    const fm = this.app.metadataCache.getFileCache(this.currentSessionFile)?.frontmatter;
    const raw = Array.isArray(fm?.adventures) && fm.adventures.length > 0
      ? fm.adventures
      : [fm?.adventure];
    const result: Array<{ path: string; name: string; status: string }> = [];
    const seen = new Set<string>();

    for (const value of raw) {
      const ref = this.extractLinkPath(value);
      if (!ref) continue;
      const file = this.resolveAdventureFile(ref);
      if (!file || seen.has(file.path)) continue;
      seen.add(file.path);
      result.push({
        path: file.path,
        name: file.basename,
        status: this.app.metadataCache.getFileCache(file)?.frontmatter?.status || "planning",
      });
    }

    // Sessions predating adventure links retain the old campaign-active fallback.
    return result.length > 0 ? result : this.getActiveAdventures();
  }

  private resolveAdventureFile(ref: string): TFile | null {
    const direct = this.app.vault.getAbstractFileByPath(ref);
    if (direct instanceof TFile) return direct;
    const withExtension = this.app.vault.getAbstractFileByPath(`${ref}.md`);
    if (withExtension instanceof TFile) return withExtension;
    const basename = ref.split('/').pop()?.replace(/\.md$/i, "") || ref;
    return this.app.vault.getMarkdownFiles().find(file => {
      if (file.basename !== basename) return false;
      return this.app.metadataCache.getFileCache(file)?.frontmatter?.type === "adventure";
    }) || null;
  }

  async getScenesForAdventure(adventurePath: string) {
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
        difficulty: fm.difficulty || "medium",
        status: fm.status || "not-started"
      });
    }

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

  async markSceneComplete(scenePath: string) {
    const file = this.app.vault.getAbstractFileByPath(scenePath);
    if (!(file instanceof TFile)) return;

    try {
      const content = await this.app.vault.read(file);
      const newContent = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        status: 'completed',
      }));
      await this.app.vault.modify(file, newContent);
      new Notice("Scene marked as completed!");
    } catch (error) {
      console.error("Error marking scene complete:", error);
      new Notice("Error updating scene status");
    }
  }

  async onClose() {
    // Stop auto-save
    if (this.autoSaveInterval) {
      window.clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    
    // Stop timer updates
    if (this.timerUpdateInterval) {
      window.clearInterval(this.timerUpdateInterval);
      this.timerUpdateInterval = null;
    }
    
    // Save any unsaved notes
    await this.saveQuickNotes();
    
    // Disable read-only mode
    this.disableReadOnlyMode();
    this.managedLeaves.clear();
  }
}
