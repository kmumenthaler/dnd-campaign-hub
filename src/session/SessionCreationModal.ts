import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { CalendarDateInputModal } from '../campaign/CalendarDateInputModal';
import { SESSION_GM_TEMPLATE, SESSION_PLAYER_TEMPLATE } from '../templates';
import { ConfirmModal } from '../utils/ConfirmModal';
import { PartySelector } from '../party/PartySelector';
import { updateYamlFrontmatter } from '../utils/YamlFrontmatter';
import { addSessionBacklink, removeSessionBacklink } from './SessionBacklinks';

export class SessionCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  sessionTitle = "";
  sessionDate: string;
  location = "";
  adventurePath = "";
  adventurePaths: string[] = [];
  plannedScenePaths: string[] = [];
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
  isEdit = false;
  originalSessionPath = "";
  private originalAdventurePaths: string[] = [];
  private originalStartingScenePath = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, campaignPath?: string, sessionPath?: string) {
    super(app);
    this.plugin = plugin;
    this.campaignPath = campaignPath || plugin.resolveCampaign();
    this.sessionDate = new Date().toISOString().split('T')[0] || "";
    if (adventurePath) {
      this.adventurePath = adventurePath;
      this.adventurePaths = [adventurePath];
    }
    if (sessionPath) {
      this.isEdit = true;
      this.originalSessionPath = sessionPath;
      const sessionFile = this.app.vault.getAbstractFileByPath(sessionPath);
      if (sessionFile instanceof TFile && sessionFile.parent) this.campaignPath = sessionFile.parent.path;
    }
  }

  private parseFrontmatterLink(value: unknown): string {
    if (!value) return "";
    if (typeof value === "object" && value !== null && "path" in value) {
      return String((value as { path?: unknown }).path ?? "");
    }
    const text = String(value).trim();
    return text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)?.[1] ?? text;
  }

  async loadSessionData() {
    const file = this.app.vault.getAbstractFileByPath(this.originalSessionPath);
    if (!(file instanceof TFile)) {
      new Notice("Session file not found!");
      return;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) {
      new Notice("Could not read session data!");
      return;
    }

    const allAdventureValues = Array.isArray(fm.adventures) ? fm.adventures : [];
    this.adventurePaths = allAdventureValues.map((value: unknown) => this.parseFrontmatterLink(value)).filter(Boolean);
    this.adventurePath = this.parseFrontmatterLink(fm.adventure);
    if (this.adventurePath && !this.adventurePaths.includes(this.adventurePath)) this.adventurePaths.unshift(this.adventurePath);
    this.originalAdventurePaths = [...this.adventurePaths];
    this.startingScenePath = this.parseFrontmatterLink(fm.starting_scene);
    this.plannedScenePaths = (Array.isArray(fm.planned_scenes) ? fm.planned_scenes : [])
      .map((value: unknown) => this.parseFrontmatterLink(value)).filter(Boolean)
      .filter((path: string, index: number, paths: string[]) => paths.indexOf(path) === index);
    this.originalStartingScenePath = this.startingScenePath;
    this.location = String(fm.location ?? "");
    this.sessionDate = String(fm.date ?? this.sessionDate);
    this.calendar = String(fm["fc-calendar"] ?? this.calendar);
    this.startYear = String(fm["fc-date"]?.year ?? this.startYear);
    this.startMonth = String(fm["fc-date"]?.month ?? this.startMonth);
    this.startDay = String(fm["fc-date"]?.day ?? this.startDay);
    this.endYear = String(fm["fc-end"]?.year ?? this.endYear);
    this.endMonth = String(fm["fc-end"]?.month ?? this.endMonth);
    this.endDay = String(fm["fc-end"]?.day ?? this.endDay);
    this.selectedPartyId = String(fm.party_id ?? "");

    const content = await this.app.vault.read(file);
    this.sessionTitle = content.match(/^# Session(?:\s+\d+)?(?:\s+-\s+(.+))?$/m)?.[1]?.trim() ?? "";
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

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Session" : "📜 Create New Session" });

    // Wait for calendar data to load
    await this.loadCalendarData();
    if (this.isEdit) await this.loadSessionData();

    // Get campaign info
    const campaignPath = this.campaignPath;
    const campaignName = campaignPath?.split('/').pop() || "Unknown";
    
    contentEl.createEl("p", { 
      text: `Campaign: ${campaignName}`,
      cls: "setting-item-description"
    });

    // Calculate next session number
    const nextSessionNum = this.isEdit
      ? Number(this.app.metadataCache.getFileCache(this.app.vault.getAbstractFileByPath(this.originalSessionPath) as TFile)?.frontmatter?.sessionNum) || this.getNextSessionNumber()
      : this.getNextSessionNumber();
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
          .setValue(this.sessionTitle)
          .onChange((value) => {
            this.sessionTitle = value;
          });
        if (!this.isEdit) text.inputEl.focus();
      });

    // Adventure Selection
    const adventures = await this.getAllAdventures();
    const adventureSelectionContainer = contentEl.createDiv({ cls: "dnd-session-adventure-selection" });
    const primaryAdventureContainer = contentEl.createDiv();
    const scenePickerContainer = contentEl.createDiv();
    const scenePlanContainer = contentEl.createDiv({ cls: "dnd-session-scene-plan" });

    const renderScenePlan = async () => {
      scenePlanContainer.empty();
      scenePlanContainer.createEl("h3", { text: "Session Scene Plan" });
      scenePlanContainer.createEl("p", { text: "Choose the scenes you expect to run. Selected scenes are used in this order by prep and live-session tools.", cls: "setting-item-description" });
      const available = (await Promise.all(this.adventurePaths.map(async adventure => ({ adventure, scenes: await this.getAllScenesForAdventure(adventure) }))));
      const valid = new Set(available.flatMap(group => group.scenes.map(scene => scene.path)));
      this.plannedScenePaths = this.plannedScenePaths.filter(path => valid.has(path));
      for (const group of available) {
        const adventure = adventures.find(item => item.path === group.adventure);
        scenePlanContainer.createEl("h4", { text: adventure?.name ?? group.adventure });
        for (const scene of group.scenes) {
          const setting = new Setting(scenePlanContainer).setName(scene.name).setDesc(scene.status);
          const selectedIndex = this.plannedScenePaths.indexOf(scene.path);
          if (selectedIndex >= 0) {
            setting.addButton(button => button.setIcon("arrow-up").setTooltip("Move earlier").setDisabled(selectedIndex === 0).onClick(() => {
              [this.plannedScenePaths[selectedIndex - 1], this.plannedScenePaths[selectedIndex]] = [this.plannedScenePaths[selectedIndex]!, this.plannedScenePaths[selectedIndex - 1]!]; void renderScenePlan();
            }));
            setting.addButton(button => button.setIcon("arrow-down").setTooltip("Move later").setDisabled(selectedIndex === this.plannedScenePaths.length - 1).onClick(() => {
              [this.plannedScenePaths[selectedIndex], this.plannedScenePaths[selectedIndex + 1]] = [this.plannedScenePaths[selectedIndex + 1]!, this.plannedScenePaths[selectedIndex]!]; void renderScenePlan();
            }));
          }
          setting.addToggle(toggle => toggle.setValue(selectedIndex >= 0).onChange(value => {
            if (value && !this.plannedScenePaths.includes(scene.path)) this.plannedScenePaths.push(scene.path);
            if (!value) this.plannedScenePaths = this.plannedScenePaths.filter(path => path !== scene.path);
            void renderScenePlan();
          }));
        }
      }
    };

    const refreshScenePicker = async (_adventurePath: string) => {
      scenePickerContainer.empty();
      if (this.adventurePaths.length === 0) return;
      const scenes = (await Promise.all(this.adventurePaths.map(path => this.getAllScenesForAdventure(path))))
        .flat().filter((scene, index, all) => all.findIndex(candidate => candidate.path === scene.path) === index);
      if (scenes.length === 0) return;

      // Pre-select first in-progress, then first not-started, then first overall
      const preferred = scenes.find(s => s.path === this.startingScenePath)
        ?? scenes.find(s => s.status === 'in-progress')
        ?? scenes.find(s => s.status === 'not-started')
        ?? scenes[0];
      this.startingScenePath = preferred?.path ?? '';

      new Setting(scenePickerContainer)
        .setName("Starting Scene")
        .setDesc("Scene where this session begins, from any linked adventure")
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
      const renderPrimaryAdventurePicker = () => {
        primaryAdventureContainer.empty();
        if (this.adventurePaths.length === 0) {
          this.adventurePath = "";
          this.startingScenePath = "";
          scenePickerContainer.empty();
          return;
        }
        if (!this.adventurePaths.includes(this.adventurePath)) {
          this.adventurePath = this.adventurePaths[0] ?? "";
        }
        new Setting(primaryAdventureContainer)
          .setName("Primary Adventure")
          .setDesc("Used to choose the starting scene for this session")
          .addDropdown(dropdown => {
            for (const path of this.adventurePaths) {
              const adventure = adventures.find(candidate => candidate.path === path);
              if (adventure) dropdown.addOption(adventure.path, adventure.name);
            }
            dropdown.setValue(this.adventurePath);
            dropdown.onChange(async value => {
              this.adventurePath = value;
              this.startingScenePath = "";
              await refreshScenePicker(value);
            });
          });
        void refreshScenePicker(this.adventurePath);
      };

      adventureSelectionContainer.createEl("h3", { text: "Adventures" });
      adventureSelectionContainer.createEl("p", {
        text: "Link this session to one or more adventures.",
        cls: "setting-item-description",
      });
      for (const adventure of adventures) {
        new Setting(adventureSelectionContainer)
          .setName(adventure.name)
          .setDesc("Include this adventure in the session")
          .addToggle(toggle => toggle
          .setTooltip(`Link ${adventure.name}`)
          .setValue(this.adventurePaths.includes(adventure.path))
          .onChange(value => {
            if (value && !this.adventurePaths.includes(adventure.path)) {
              this.adventurePaths.push(adventure.path);
            } else if (!value) {
              this.adventurePaths = this.adventurePaths.filter(path => path !== adventure.path);
            }
            renderPrimaryAdventurePicker();
            void renderScenePlan();
          }));
      }
      renderPrimaryAdventurePicker();
      await refreshScenePicker(this.adventurePath);
      await renderScenePlan();
    }

    const advancedDetails = contentEl.createEl("details", { cls: "dnd-advanced-section" });
    advancedDetails.createEl("summary", { text: "Advanced session details" });
    const advancedContainer = advancedDetails.createDiv({ cls: "dnd-advanced-section-body" });

    // Session Date (real world)
    new Setting(advancedContainer)
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
      advancedContainer.createEl("h3", { text: `📅 In-Game Calendar: ${this.selectedCalendarData.name || this.calendar}` });

      const monthData = this.selectedCalendarData.static?.months || [];

      // Start Date (from previous session or campaign) - Read only display
      new Setting(advancedContainer)
        .setName("Start Date (In-Game)")
        .setDesc(`Starts: ${this.getDateDisplay(this.startYear, this.startMonth, this.startDay, monthData)}`);

      // End Date (user sets this)
      const endDateSetting = new Setting(advancedContainer)
        .setName("End Date (In-Game)")
        .setDesc("When does this session end in your world?");

      // Display current end date
      const endDateDisplay = advancedContainer.createEl("div", {
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
    new Setting(advancedContainer)
      .setName("Location")
      .setDesc("Where does this session take place in your world?")
      .addText((text) =>
        text
          .setPlaceholder("e.g., Phandalin")
          .setValue(this.location)
          .onChange((value) => {
            this.location = value;
          })
      );

    // Party selection (dropdown only, no member checkboxes)
    const partyContainer = advancedContainer.createDiv({ cls: "dnd-party-selection" });

    // Auto-resolve the campaign party as default
    const defaultParty = this.plugin.partyManager.resolveParty(undefined, campaignName);
    if (defaultParty && !this.selectedPartyId) {
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
      text: this.isEdit ? "Save Changes" : "Create Session",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      this.close();
      if (this.isEdit) await this.updateSessionFile();
      else await this.createSessionFile();
    });
  }

  async updateSessionFile() {
    const file = this.app.vault.getAbstractFileByPath(this.originalSessionPath);
    if (!(file instanceof TFile)) {
      new Notice("❌ Session file not found!");
      return;
    }
    try {
      const existing = await this.app.vault.read(file);
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const sessionNumber = Number(fm?.sessionNum ?? fm?.session_number) || this.getSessionNumberFromFile(file);
      const adventureLinks = this.adventurePaths.map(path => `[[${path}]]`);
      let updated = updateYamlFrontmatter(existing, current => ({
        ...current,
        adventure: this.adventurePath ? `[[${this.adventurePath}]]` : "",
        adventures: adventureLinks,
        planned_scenes: this.plannedScenePaths.map(path => `[[${path}]]`),
        starting_scene: this.startingScenePath ? `[[${this.startingScenePath}]]` : "",
        party_id: this.selectedPartyId,
        location: this.location,
        date: this.sessionDate,
        "fc-calendar": this.calendar,
        "fc-date": { year: this.startYear, month: this.startMonth, day: this.startDay },
        "fc-end": { year: this.endYear, month: this.endMonth, day: this.endDay },
      }));
      updated = updated.replace(
        /^# Session.*$/m,
        `# Session ${sessionNumber}${this.sessionTitle ? ` - ${this.sessionTitle}` : ""}`,
      );
      await this.app.vault.modify(file, updated);

      for (const path of this.adventurePaths) await this.linkSessionToAdventure(path, file.path);
      for (const path of this.originalAdventurePaths.filter(oldPath => !this.adventurePaths.includes(oldPath))) {
        await this.unlinkSessionFromAdventure(path, file.path);
      }
      await this.reconcileStartingSceneBacklink(file.path);
      new Notice(`✅ Session ${sessionNumber} updated!`);
    } catch (error) {
      new Notice(`❌ Error updating session: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Session update error:", error);
    }
  }

  private getSessionNumberFromFile(file: TFile): number {
    return Number(file.basename.match(/^(\d{3})_/)?.[1] ?? 0);
  }

  async unlinkSessionFromAdventure(adventurePath: string, sessionFilePath: string) {
    const adventureFile = this.resolveAdventureFile(adventurePath);
    if (!(adventureFile instanceof TFile)) return;
    const content = await this.app.vault.read(adventureFile);
    const raw = this.app.metadataCache.getFileCache(adventureFile)?.frontmatter?.sessions;
    const updated = updateYamlFrontmatter(content, fm => ({
      ...fm,
      sessions: removeSessionBacklink(raw, sessionFilePath),
    }));
    await this.app.vault.modify(adventureFile, updated);
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

      let sessionContent = isGM ? SESSION_GM_TEMPLATE : SESSION_PLAYER_TEMPLATE;

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
      const adventureLinks = this.adventurePaths.map(path => `[[${path}]]`);
      const startingSceneLink = this.startingScenePath ? `[[${this.startingScenePath}]]` : "";

      sessionContent = updateYamlFrontmatter(sessionContent, (fm) => ({
        ...fm,
        campaign: campaignName,
        world: campaignName,
        adventure: adventureLink,
        adventures: adventureLinks,
        planned_scenes: this.plannedScenePaths.map(path => `[[${path}]]`),
        starting_scene: startingSceneLink,
        ending_scene: "",
        party_id: this.selectedPartyId,
        sessionNum: nextNumber,
        status: "planned",
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
      for (const adventurePath of this.adventurePaths) {
        await this.linkSessionToAdventure(adventurePath, filePath);
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
    const advFile = this.resolveAdventureFile(adventurePath);
    if (!(advFile instanceof TFile)) return;
    try {
      let content = await this.app.vault.read(advFile);

      const cache = this.app.metadataCache.getFileCache(advFile);
      content = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        sessions: addSessionBacklink(cache?.frontmatter?.sessions, sessionFilePath),
      }));

      await this.app.vault.modify(advFile, content);
    } catch (error) {
      console.error("Could not add session backlink to adventure:", error);
      throw error;
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
    const sceneFile = this.resolveSceneFile(scenePath, sessionFilePath);
    if (!(sceneFile instanceof TFile)) return;
    try {
      let content = await this.app.vault.read(sceneFile);

      const cache = this.app.metadataCache.getFileCache(sceneFile);
      content = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        sessions: addSessionBacklink(cache?.frontmatter?.sessions, sessionFilePath),
      }));

      await this.app.vault.modify(sceneFile, content);
    } catch (error) {
      console.error("Could not add session backlink to scene:", error);
      throw error;
    }
  }

  async removeSessionBacklinkFromScene(scenePath: string, sessionFilePath: string) {
    const sceneFile = this.resolveSceneFile(scenePath, sessionFilePath);
    if (!(sceneFile instanceof TFile)) return;
    const content = await this.app.vault.read(sceneFile);
    const raw = this.app.metadataCache.getFileCache(sceneFile)?.frontmatter?.sessions;
    const updated = updateYamlFrontmatter(content, fm => ({
      ...fm,
      sessions: removeSessionBacklink(raw, sessionFilePath),
    }));
    await this.app.vault.modify(sceneFile, updated);
  }

  private resolveSceneFile(scenePath: string, sourcePath: string): TFile | null {
    const direct = this.app.vault.getAbstractFileByPath(scenePath);
    if (direct instanceof TFile) return direct;
    const withExtension = this.app.vault.getAbstractFileByPath(`${scenePath}.md`);
    if (withExtension instanceof TFile) return withExtension;
    return this.app.metadataCache.getFirstLinkpathDest(scenePath.replace(/\.md$/i, ""), sourcePath);
  }

  private async reconcileStartingSceneBacklink(sessionFilePath: string): Promise<void> {
    // Establish the new relationship before removing the old one, so a failed write
    // cannot leave the edited session without any scene backlink.
    if (this.startingScenePath) {
      await this.addSessionBacklinkToScene(this.startingScenePath, sessionFilePath);
    }
    if (this.originalStartingScenePath && this.originalStartingScenePath !== this.startingScenePath) {
      await this.removeSessionBacklinkFromScene(this.originalStartingScenePath, sessionFilePath);
    }
    this.originalStartingScenePath = this.startingScenePath;
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
