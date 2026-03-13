import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { CalendarDateInputModal } from '../campaign/CalendarDateInputModal';
import { SESSION_GM_TEMPLATE, SESSION_PLAYER_TEMPLATE } from '../templates';
import { ConfirmModal } from '../utils/ConfirmModal';
import { PartySelector } from '../party/PartySelector';
import { updateYamlFrontmatter } from '../utils/YamlFrontmatter';

export class SessionCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  sessionTitle = "";
  sessionDate: string;
  location = "";
  adventurePath = "";
  startingScenePath = "";
  useCustomDate = false;
  calendar = "";
  startYear = "";
  startMonth = "";
  startDay = "";
  endYear = "";
  endMonth = "";
  endDay = "";
  selectedCalendarData: any = null;
  endDayDropdown: any = null;
  private selectedPartyId = "";
  private selectedPartyName = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, campaignPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaignPath = campaignPath || plugin.resolveCampaign();
    this.sessionDate = new Date().toISOString().split('T')[0] || "";
    if (adventurePath) {
      this.adventurePath = adventurePath;
    }
  }

  async getAllAdventures(): Promise<Array<{ path: string; name: string }>> {
    const adventures: Array<{ path: string; name: string }> = [];
    const campaignPath = this.campaignPath;
    
    const adventuresFolder = this.app.vault.getAbstractFileByPath(`${campaignPath}/Adventures`);
    
    if (adventuresFolder instanceof TFolder) {
      for (const item of adventuresFolder.children) {
        if (item instanceof TFile && item.extension === 'md') {
          // Adventure file directly in Adventures folder (flat structure)
          adventures.push({
            path: item.path,
            name: item.basename
          });
        } else if (item instanceof TFolder) {
          // Adventure folder with main note inside (folder structure)
          const mainFile = this.app.vault.getAbstractFileByPath(`${item.path}/${item.name}.md`);
          if (mainFile instanceof TFile) {
            adventures.push({
              path: mainFile.path,
              name: item.name
            });
          }
        }
      }
    }

    return adventures;
  }

  /**
   * Resolve an adventure reference to a TFile.
   * Handles full paths, wikilink paths, and bare names (e.g. "My Adventure").
   */
  resolveAdventureFile(adventureRef: string): TFile | null {
    // Try as a direct vault path first
    const direct = this.app.vault.getAbstractFileByPath(adventureRef);
    if (direct instanceof TFile) return direct;

    // Try appending .md
    const withMd = this.app.vault.getAbstractFileByPath(adventureRef + '.md');
    if (withMd instanceof TFile) return withMd;

    // Search the vault for a file matching this name with type: adventure
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.basename !== adventureRef) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.type === 'adventure') return file;
    }

    // Last resort: any file with that basename
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.basename === adventureRef) return file;
    }

    return null;
  }

  async getAllScenesForAdventure(adventurePath: string): Promise<Array<{ path: string; name: string; sceneNumber: number; status: string }>> {
    if (!adventurePath) return [];

    const advFile = this.resolveAdventureFile(adventurePath);
    if (!(advFile instanceof TFile)) return [];

    const advFolder = advFile.parent;
    if (!advFolder) return [];

    // Determine the folder prefix to search under.
    // If the adventure is stored as Folder/Folder.md, search that folder.
    // Otherwise search a sibling "Name - Scenes" folder, or fall back to the parent.
    const candidatePrefixes: string[] = [];

    // Case: Adventures/AdventureName/AdventureName.md  -> search Adventures/AdventureName/
    if (advFolder.name === advFile.basename) {
      candidatePrefixes.push(advFolder.path + '/');
    }

    // Case: Adventures/AdventureName.md -> search Adventures/AdventureName - Scenes/ or Adventures/AdventureName/
    candidatePrefixes.push(`${advFolder.path}/${advFile.basename} - Scenes/`);
    candidatePrefixes.push(`${advFolder.path}/${advFile.basename}/`);

    // Always also try the parent folder itself as a last resort
    candidatePrefixes.push(advFolder.path + '/');

    // Walk every markdown file in the vault and collect scenes under any prefix
    const seen = new Set<string>();
    const scenes: Array<{ path: string; name: string; sceneNumber: number; status: string }> = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (seen.has(file.path)) continue;
      const underAdventure = candidatePrefixes.some(prefix => file.path.startsWith(prefix));
      if (!underAdventure) continue;

      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || fm.type !== 'scene') continue;

      seen.add(file.path);
      const num = parseInt(
        fm.scene_number ?? file.name.match(/Scene\s+(\d+)/i)?.[1] ?? '0'
      ) || 0;
      scenes.push({ path: file.path, name: file.basename, sceneNumber: num, status: fm.status || 'not-started' });
    }

    scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
    return scenes;
  }

  async loadCalendarData() {
    // Get campaign World.md to fetch calendar and dates
    const campaignPath = this.campaignPath;
    const worldFile = this.app.vault.getAbstractFileByPath(`${campaignPath}/World.md`);
    
    if (worldFile instanceof TFile) {
      const worldContent = await this.app.vault.read(worldFile);
      const calendarMatch = worldContent.match(/fc-calendar:\s*([^\r\n]\w*)$/m);
      if (calendarMatch && calendarMatch[1]) {
        this.calendar = calendarMatch[1].trim();
        // Get calendar data from Calendarium - search by name
        const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
        if (calendariumPlugin && calendariumPlugin.data?.calendars) {
          // Find calendar by name (stored in fc-calendar field)
          const calendars = calendariumPlugin.data.calendars;
          for (const [id, calData] of Object.entries(calendars)) {
            if ((calData as any).name === this.calendar) {
              this.selectedCalendarData = calData;
              break;
            }
          }
        }
      }
    }

    // Try to get start date from previous session
    const previousSession = await this.getPreviousSession();
    if (previousSession) {
      // Use end date of previous session as start date of this session
      this.startYear = previousSession.endYear;
      this.startMonth = previousSession.endMonth;
      this.startDay = previousSession.endDay;
    } else {
      // No previous session, use campaign start date
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const yearMatch = worldContent.match(/fc-date:\s*\n\s*year:\s*([^\r\n]\w*)$/m);
        const monthMatch = worldContent.match(/fc-date:\s*\n\s*year:.*\n\s*month:\s*([^\r\n]\w*)$/m);
        const dayMatch = worldContent.match(/fc-date:\s*\n\s*year:.*\n\s*month:.*\n\s*day:\s*([^\r\n]\w*)$/m);
        
        if (yearMatch && yearMatch[1]) this.startYear = yearMatch[1].trim();
        if (monthMatch && monthMatch[1]) this.startMonth = monthMatch[1].trim();
        if (dayMatch && dayMatch[1]) this.startDay = dayMatch[1].trim();
      }
    }

    // Ensure defaults if still empty
    if (!this.startYear) this.startYear = "1";
    if (!this.startMonth) this.startMonth = "1";
    if (!this.startDay) this.startDay = "1";

    // Initialize end date same as start date
    this.endYear = this.startYear;
    this.endMonth = this.startMonth;
    this.endDay = this.startDay;
  }

  async getPreviousSession(): Promise<{endYear: string, endMonth: string, endDay: string} | null> {
    const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
    
    if (campaignFolder instanceof TFolder) {
      const files = campaignFolder.children.filter(
        f => f instanceof TFile && f.name.match(/^\d{3}_\d{8}\.md$/)
      );
      
      if (files.length === 0) return null;
      
      // Sort by session number and get the last one
      const sortedFiles = files.sort((a, b) => {
        const numA = parseInt((a as TFile).name.substring(0, 3));
        const numB = parseInt((b as TFile).name.substring(0, 3));
        return numB - numA;
      });
      
      const lastSession = sortedFiles[0] as TFile;
      const content = await this.app.vault.read(lastSession);
      
      const endYearMatch = content.match(/fc-end:\s*\n\s*year:\s*(.+)/);
      const endMonthMatch = content.match(/fc-end:\s*\n\s*year:.*\n\s*month:\s*(.+)/);
      const endDayMatch = content.match(/fc-end:\s*\n\s*year:.*\n\s*month:.*\n\s*day:\s*(.+)/);
      
      if (endYearMatch?.[1] && endMonthMatch?.[1] && endDayMatch?.[1]) {
        return {
          endYear: endYearMatch[1].trim(),
          endMonth: endMonthMatch[1].trim(),
          endDay: endDayMatch[1].trim()
        };
      }
    }
    
    return null;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "📜 Create New Session" });

    // Wait for calendar data to load
    await this.loadCalendarData();

    // Get campaign info
    const campaignPath = this.campaignPath;
    const campaignName = campaignPath?.split('/').pop() || "Unknown";
    
    contentEl.createEl("p", { 
      text: `Campaign: ${campaignName}`,
      cls: "setting-item-description"
    });

    // Calculate next session number
    const nextSessionNum = this.getNextSessionNumber();
    contentEl.createEl("p", { 
      text: `Session Number: ${nextSessionNum}`,
      cls: "setting-item-description"
    });

    // Session Title/Name
    new Setting(contentEl)
      .setName("Session Title")
      .setDesc("Optional descriptive title for this session")
      .addText((text) => {
        text
          .setPlaceholder("e.g., The Goblin Ambush")
          .onChange((value) => {
            this.sessionTitle = value;
          });
        text.inputEl.focus();
      });

    // Adventure Selection
    const adventures = await this.getAllAdventures();
    const scenePickerContainer = contentEl.createDiv();

    const refreshScenePicker = async (adventurePath: string) => {
      scenePickerContainer.empty();
      if (!adventurePath) return;
      const scenes = await this.getAllScenesForAdventure(adventurePath);
      if (scenes.length === 0) return;

      // Pre-select first in-progress, then first not-started, then first overall
      const preferred = scenes.find(s => s.status === 'in-progress')
        ?? scenes.find(s => s.status === 'not-started')
        ?? scenes[0];
      this.startingScenePath = preferred?.path ?? '';

      new Setting(scenePickerContainer)
        .setName("Starting Scene")
        .setDesc("Scene where this session begins (auto-populated from adventure progress)")
        .addDropdown(dd => {
          dd.addOption("", "-- None --");
          for (const sc of scenes) {
            const label = `${sc.name} [${sc.status}]`;
            dd.addOption(sc.path, label);
          }
          dd.setValue(this.startingScenePath);
          dd.onChange(value => { this.startingScenePath = value; });
        });
    };

    if (adventures.length > 0) {
      new Setting(contentEl)
        .setName("Adventure")
        .setDesc("Link this session to an adventure (optional)")
        .addDropdown(dropdown => {
          dropdown.addOption("", "-- None --");
          adventures.forEach(adv => {
            dropdown.addOption(adv.path, adv.name);
          });
          dropdown.setValue(this.adventurePath);
          dropdown.onChange(async value => {
            this.adventurePath = value;
            this.startingScenePath = "";
            await refreshScenePicker(value);
          });
        });
      await refreshScenePicker(this.adventurePath);
    }

    // Session Date (real world)
    new Setting(contentEl)
      .setName("Session Date")
      .setDesc("Date when this session was/will be played (real world)")
      .addText((text) =>
        text
          .setValue(this.sessionDate)
          .onChange((value) => {
            this.sessionDate = value;
          })
      )
      .addToggle((toggle) =>
        toggle
          .setTooltip("Use custom date")
          .setValue(this.useCustomDate)
          .onChange((value) => {
            this.useCustomDate = value;
            if (!value) {
              this.sessionDate = new Date().toISOString().split('T')[0] || "";
            }
          })
      );

    // Calendar section
    if (this.calendar && this.selectedCalendarData) {
      contentEl.createEl("h3", { text: `📅 In-Game Calendar: ${this.selectedCalendarData.name || this.calendar}` });

      const monthData = this.selectedCalendarData.static?.months || [];

      // Start Date (from previous session or campaign) - Read only display
      new Setting(contentEl)
        .setName("Start Date (In-Game)")
        .setDesc(`Starts: ${this.getDateDisplay(this.startYear, this.startMonth, this.startDay, monthData)}`);

      // End Date (user sets this)
      const endDateSetting = new Setting(contentEl)
        .setName("End Date (In-Game)")
        .setDesc("When does this session end in your world?");

      // Display current end date
      const endDateDisplay = contentEl.createEl("div", {
        cls: "dnd-date-display",
        text: this.getDateDisplay(this.endYear, this.endMonth, this.endDay, monthData)
      });

      // Add button to open date picker
      endDateSetting.addButton((button) => {
        button
          .setButtonText("📅 Pick End Date")
          .setCta()
          .onClick(async () => {
            await this.openSessionDatePicker(endDateDisplay, monthData);
          });
      });
    }

    // Location
    new Setting(contentEl)
      .setName("Location")
      .setDesc("Where does this session take place in your world?")
      .addText((text) =>
        text
          .setPlaceholder("e.g., Phandalin")
          .onChange((value) => {
            this.location = value;
          })
      );

    // Party selection (dropdown only, no member checkboxes)
    const partyContainer = contentEl.createDiv({ cls: "dnd-party-selection" });

    // Auto-resolve the campaign party as default
    const defaultParty = this.plugin.partyManager.resolveParty(undefined, campaignName);
    if (defaultParty) {
      this.selectedPartyId = defaultParty.id;
      this.selectedPartyName = defaultParty.name;
    }

    const parties = this.plugin.partyManager.getParties();
    if (parties.length > 0) {
      new Setting(partyContainer)
        .setName("Party")
        .setDesc("Which party is playing in this session?")
        .addDropdown((dd) => {
          for (const p of parties) {
            dd.addOption(p.id, p.name);
          }
          if (this.selectedPartyId) dd.setValue(this.selectedPartyId);
          dd.onChange((value) => {
            this.selectedPartyId = value;
            const match = parties.find((p) => p.id === value);
            this.selectedPartyName = match?.name || "";
          });
        });
    }

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create Session",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      this.close();
      await this.createSessionFile();
    });
  }

  getNextSessionNumber(): number {
    const campaignFolder = this.app.vault.getAbstractFileByPath(this.campaignPath);
    let nextNumber = 1;
    
    if (campaignFolder instanceof TFolder) {
      const files = campaignFolder.children.filter(
        f => f instanceof TFile && f.name.match(/^\d{3}_\d{8}\.md$/)
      );
      const numbers = files.map(f => parseInt((f as TFile).name.substring(0, 3)));
      if (numbers.length > 0) {
        nextNumber = Math.max(...numbers) + 1;
      }
    }
    
    return nextNumber;
  }

  getDateDisplay(year: string, month: string, day: string, monthData: any[]): string {
    const monthIndex = parseInt(month) - 1;
    const monthName = monthData[monthIndex]?.name || `Month ${month}`;
    return `${monthName} ${day}, Year ${year}`;
  }

  async openSessionDatePicker(displayElement: HTMLElement, monthData: any[]) {
    // Use our custom date picker modal with calendar validation
    const modal = new CalendarDateInputModal(
      this.app,
      this.selectedCalendarData,
      this.endYear,
      this.endMonth,
      this.endDay,
      (year, month, day) => {
        this.endYear = year;
        this.endMonth = month;
        this.endDay = day;
        displayElement.setText(this.getDateDisplay(this.endYear, this.endMonth, this.endDay, monthData));
      }
    );
    modal.open();
  }

  async createSessionFile() {
    const campaignPath = this.campaignPath;
    const campaignName = campaignPath?.split('/').pop() || "Unknown";
    const nextNumber = this.getNextSessionNumber();

    new Notice(`Creating session ${nextNumber}...`);

    try {
      // Determine which template to use based on campaign role
      const worldFile = this.app.vault.getAbstractFileByPath(`${campaignPath}/World.md`);
      let isGM = true; // Default to GM
      
      if (worldFile instanceof TFile) {
        const worldContent = await this.app.vault.read(worldFile);
        const roleMatch = worldContent.match(/role:\s*(GM|player)/i);
        if (roleMatch && roleMatch[1]) {
          isGM = roleMatch[1].toLowerCase() === 'gm';
        }
      }

      // Get appropriate template
      const templatePath = isGM ? "z_Templates/session-gm.md" : "z_Templates/session-player.md";
      const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      let sessionContent: string;

      if (templateFile instanceof TFile) {
        sessionContent = await this.app.vault.read(templateFile);
      } else {
        sessionContent = isGM ? SESSION_GM_TEMPLATE : SESSION_PLAYER_TEMPLATE;
      }

      // Create filename: 001_20260120.md format
      const dateStr = this.sessionDate.replace(/-/g, '');
      const fileName = `${nextNumber.toString().padStart(3, '0')}_${dateStr}.md`;
      const filePath = `${campaignPath}/${fileName}`;

      // Find previous session for recap
      let recapContent = "";
      if (nextNumber > 1) {
        const prevNumber = nextNumber - 1;
        const campaignFolder = this.app.vault.getAbstractFileByPath(campaignPath);
        
        if (campaignFolder instanceof TFolder) {
          // Find the previous session file (format: 001_20260120.md)
          const prevSessionFile = campaignFolder.children.find(
            f => f instanceof TFile && f.name.match(new RegExp(`^${prevNumber.toString().padStart(3, '0')}_\\d{8}\\.md$`))
          );
          
          if (prevSessionFile instanceof TFile) {
            // Get filename without extension
            const prevSessionName = prevSessionFile.basename;
            recapContent = `\n![[${prevSessionName}#^summary]]\n`;
          }
        }
      }

      // Replace the Recap section with previous session's summary (if available)
      if (recapContent) {
        sessionContent = sessionContent.replace(/## Recap\s*\n/m, `## Recap\n${recapContent}`);
      }

      const adventureLink = this.adventurePath ? `[[${this.adventurePath}]]` : "";
      const startingSceneLink = this.startingScenePath ? `[[${this.startingScenePath}]]` : "";

      sessionContent = updateYamlFrontmatter(sessionContent, (fm) => ({
        ...fm,
        campaign: campaignName,
        world: campaignName,
        adventure: adventureLink,
        starting_scene: startingSceneLink,
        ending_scene: "",
        party_id: this.selectedPartyId,
        sessionNum: nextNumber,
        location: this.location,
        date: this.sessionDate,
        "fc-calendar": this.calendar,
        "fc-date": {
          year: this.startYear,
          month: this.startMonth,
          day: this.startDay,
        },
        "fc-end": {
          year: this.endYear,
          month: this.endMonth,
          day: this.endDay,
        },
      }));

      // Update markdown heading title in body.
      sessionContent = sessionContent.replace(
        /^# Session.*$/m,
        `# Session ${nextNumber}${this.sessionTitle ? ' - ' + this.sessionTitle : ''}`
      );
      // Create the file
      await this.app.vault.create(filePath, sessionContent);

      // Link this session to the adventure's sessions[] frontmatter
      if (this.adventurePath) {
        await this.linkSessionToAdventure(this.adventurePath, filePath);
      }

      // Handle starting scene backlink + optional status update
      if (this.startingScenePath) {
        await this.handleStartingSceneUpdate(this.startingScenePath, filePath);
      }

      // Open the file
      await this.app.workspace.openLinkText(filePath, "", true);

      new Notice(`✅ Session ${nextNumber} created successfully!`);
    } catch (error) {
      new Notice(`❌ Error creating session: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Session creation error:", error);
    }
  }

  /** Append this session's wikilink to the adventure's sessions[] frontmatter array. */
  async linkSessionToAdventure(adventurePath: string, sessionFilePath: string) {
    const advFile = this.app.vault.getAbstractFileByPath(adventurePath);
    if (!(advFile instanceof TFile)) return;
    try {
      let content = await this.app.vault.read(advFile);

      // Parse existing sessions from metadata cache (reliable regardless of YAML format)
      const cache = this.app.metadataCache.getFileCache(advFile);
      const existingSessions: string[] = [];
      if (cache?.frontmatter?.sessions) {
        const raw = cache.frontmatter.sessions;
        if (Array.isArray(raw)) {
          for (const entry of raw) existingSessions.push(String(entry));
        } else {
          existingSessions.push(String(raw));
        }
      }

      // Add new session link if not already present
      const linkStr = `[[${sessionFilePath}]]`;
      if (!existingSessions.some(s => s.includes(sessionFilePath))) {
        existingSessions.push(linkStr);
      }

      // Canonicalize each entry as a wikilink and write via YAML helper.
      const normalizedSessions = existingSessions.map((s) =>
        s.startsWith('[[') ? s : `[[${s}]]`
      );
      content = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        sessions: normalizedSessions,
      }));

      await this.app.vault.modify(advFile, content);
    } catch (e) {
    }
  }

  /** Add session backlink to scene, then optionally update scene statuses. */
  async handleStartingSceneUpdate(startingScenePath: string, sessionFilePath: string) {
    await this.addSessionBacklinkToScene(startingScenePath, sessionFilePath);

    const scenes = await this.getAllScenesForAdventure(this.adventurePath);
    const startIdx = scenes.findIndex(s => s.path === startingScenePath);
    if (startIdx < 0) return;

    const startingScene = scenes[startIdx];
    if (!startingScene) return;
    const scenesBeforeCount = startIdx;

    if (scenesBeforeCount === 0 && startingScene.status === 'in-progress') return;

    const msgLines: string[] = [];
    if (scenesBeforeCount > 0)
      msgLines.push(`Mark ${scenesBeforeCount} scene(s) before "${startingScene.name}" as completed.`);
    if (startingScene.status !== 'in-progress')
      msgLines.push(`Set "${startingScene.name}" to in-progress.`);
    if (msgLines.length === 0) return;

    const confirmed = await new Promise<boolean>(resolve => {
      const modal = new ConfirmModal(this.app, "Update Scene Statuses?", msgLines.join('\n'), resolve);
      modal.open();
    });

    if (confirmed) {
      await this.updateSceneStatusesFromStartingScene(scenes, startIdx);
    }
  }

  /** Append session wikilink to a scene's sessions[] frontmatter. */
  async addSessionBacklinkToScene(scenePath: string, sessionFilePath: string) {
    const sceneFile = this.app.vault.getAbstractFileByPath(scenePath);
    if (!(sceneFile instanceof TFile)) return;
    try {
      let content = await this.app.vault.read(sceneFile);

      // Parse existing sessions from metadata cache (reliable regardless of YAML format)
      const cache = this.app.metadataCache.getFileCache(sceneFile);
      const existingSessions: string[] = [];
      if (cache?.frontmatter?.sessions) {
        const raw = cache.frontmatter.sessions;
        if (Array.isArray(raw)) {
          for (const entry of raw) existingSessions.push(String(entry));
        } else {
          existingSessions.push(String(raw));
        }
      }

      // Add new session link if not already present
      const linkStr = `[[${sessionFilePath}]]`;
      if (!existingSessions.some(s => s.includes(sessionFilePath))) {
        existingSessions.push(linkStr);
      }

      // Canonicalize each entry as a wikilink and write via YAML helper.
      const normalizedSessions = existingSessions.map((s) =>
        s.startsWith('[[') ? s : `[[${s}]]`
      );
      content = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        sessions: normalizedSessions,
      }));

      await this.app.vault.modify(sceneFile, content);
    } catch (e) {
    }
  }

  /** Set scenes before startIdx to 'completed', scene at startIdx to 'in-progress'. */
  async updateSceneStatusesFromStartingScene(
    scenes: Array<{ path: string; name: string; sceneNumber: number; status: string }>,
    startIdx: number
  ) {
    for (let i = 0; i < startIdx; i++) {
      const scene = scenes[i];
      if (!scene || scene.status === 'completed') continue;
      const file = this.app.vault.getAbstractFileByPath(scene.path);
      if (!(file instanceof TFile)) continue;
      try {
        const c = await this.app.vault.read(file);
        const updated = updateYamlFrontmatter(c, (fm) => ({
          ...fm,
          status: 'completed',
        }));
        await this.app.vault.modify(file, updated);
      } catch (_e) { /* skip */ }
    }
    const startScene = scenes[startIdx];
    if (startScene && startScene.status !== 'in-progress') {
      const file = this.app.vault.getAbstractFileByPath(startScene.path);
      if (file instanceof TFile) {
        try {
          const c = await this.app.vault.read(file);
          const updated = updateYamlFrontmatter(c, (fm) => ({
            ...fm,
            status: 'in-progress',
          }));
          await this.app.vault.modify(file, updated);
        } catch (_e) { /* skip */ }
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
