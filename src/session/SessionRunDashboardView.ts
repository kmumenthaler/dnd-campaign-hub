import { App, ItemView, Notice, Setting, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SESSION_RUN_VIEW_TYPE } from "../constants";
import { TimerNameModal } from "./TimerNameModal";
import type { SceneMusicConfig } from '../music/types';

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

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.campaignPath = plugin.resolveCampaign();
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
    this.campaignPath = campaignPath;
    this.render();
  }

  private renderCampaignPicker(container: HTMLElement) {
    const wrapper = container.createEl("div", { cls: "dashboard-campaign-picker" });
    wrapper.createEl("h2", { text: "🎮 Session Control" });
    wrapper.createEl("p", { text: "Select a campaign to run your session." });

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

    const btn = wrapper.createEl("button", { text: "Start Session", cls: "mod-cta" });
    btn.addEventListener("click", async () => {
      this.campaignPath = select.value;
      await this.detectCurrentSession();
      this.render();
    });
  }

  async onOpen() {
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

    // Get the most recent session
    sessionFiles.sort((a, b) => {
      // Try to get session number from frontmatter first
      const cacheA = this.app.metadataCache.getFileCache(a);
      const cacheB = this.app.metadataCache.getFileCache(b);
      
      const aNum = cacheA?.frontmatter?.sessionNum || this.extractSessionNumber(a.basename);
      const bNum = cacheB?.frontmatter?.sessionNum || this.extractSessionNumber(b.basename);
      
      return bNum - aNum;
    });

    this.currentSessionFile = sessionFiles[0] || null;
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

  /** Detect whether any open markdown leaves are currently in source/edit mode. */
  private detectActualEditMode(): boolean {
    let anyEditable = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (typeof view.getMode === 'function' && view.getMode() === 'source') {
          anyEditable = true;
        }
      }
    });
    return anyEditable;
  }

  enableReadOnlyMode() {
    this.readOnlyMode = true;
    // Set all markdown views to read/preview mode
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (typeof view.getMode === 'function' && view.getMode() === 'source') {
          const state = view.getState();
          view.setState({ ...state, mode: "preview" }, {});
        }
      }
    });
  }

  disableReadOnlyMode() {
    this.readOnlyMode = false;
    // Switch all markdown views back to source/edit mode
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const view = leaf.view as any;
        if (typeof view.getMode === 'function' && view.getMode() === 'preview') {
          const state = view.getState();
          view.setState({ ...state, mode: "source" }, {});
        }
      }
    });
  }

  startAutoSave() {
    if (this.autoSaveInterval) return;
    
    // Auto-save every 30 seconds
    this.autoSaveInterval = window.setInterval(() => {
      this.saveQuickNotes();
    }, 30000);
  }

  async saveQuickNotes() {
    if (!this.currentSessionFile || !this.quickNotesContent.trim()) return;

    try {
      const content = await this.app.vault.read(this.currentSessionFile);
      
      // Check if Quick Notes section exists
      const quickNotesMarker = "## Quick Notes (During Session)";
      
      if (content.includes(quickNotesMarker)) {
        // Update existing section — match until next heading or end of file
        const regex = /(## Quick Notes \(During Session\)\s*\n)[\s\S]*?(?=\n## |$)/;
        const newContent = content.replace(
          regex,
          `## Quick Notes (During Session)\n\n${this.quickNotesContent}\n`
        );
        await this.app.vault.modify(this.currentSessionFile, newContent);
      } else {
        // Add new section at the end
        const newContent = content.trimEnd() + `\n\n${quickNotesMarker}\n\n${this.quickNotesContent}\n`;
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
      const marker = "## Quick Notes (During Session)";
      const idx = content.indexOf(marker);
      if (idx === -1) return;

      // Extract text between the marker and the next heading or end of file
      const afterMarker = content.slice(idx + marker.length);
      const nextHeading = afterMarker.search(/\n## /);
      const section = nextHeading === -1 ? afterMarker : afterMarker.slice(0, nextHeading);
      this.quickNotesContent = section.trim();
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

    // If no campaign resolved, show picker
    if (!this.campaignPath) {
      this.renderCampaignPicker(container as HTMLElement);
      return;
    }

    // Header with session info
    const header = container.createEl("div", { cls: "run-dashboard-header-compact" });
    const sessionName = this.currentSessionFile?.basename || "No Active Session";
    header.createEl("h3", { text: `🎮 Session Control` });

    // Campaign selector if multiple campaigns
    const campaigns = this.plugin.getAllCampaigns();
    if (campaigns.length > 1) {
      const select = header.createEl("select", { cls: "dashboard-campaign-select" });
      for (const c of campaigns) {
        const name = typeof c === "string" ? c : c.name;
        const path = typeof c === "string" ? c : c.path;
        const opt = select.createEl("option", { text: name, value: path });
        if (path === this.campaignPath) opt.selected = true;
      }
      select.addEventListener("change", async () => {
        this.setCampaign(select.value);
        await this.detectCurrentSession();
        this.render();
      });
    }

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


    // Get active adventure and scene
    const adventures = await this.getActiveAdventures();
    const adventure = adventures.length > 0 ? adventures[0] : null;
    
    if (adventure) {
      const scenes = await this.getScenesForAdventure(adventure.path);
      const currentScene = scenes.find(s => s.status === "in-progress") || 
                          scenes.find(s => s.status === "not-started");
      
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
        const adventureFile = this.app.vault.getAbstractFileByPath(adventure.path);
        if (adventureFile instanceof TFile) {
          await adventureLeaf.openFile(adventureFile);
          // Collapse properties for adventure
          await this.collapseProperties(adventureLeaf);
        }
        
        // Split bottom of adventure pane for session notes
        if (this.currentSessionFile) {
          const sessionLeaf = this.app.workspace.getLeaf('split', 'horizontal');
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
      const newContent = content.replace(
        /status:\s*[^\n]+/,
        'status: completed'
      );
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
    if (this.readOnlyMode) {
      this.disableReadOnlyMode();
    }
  }
}
