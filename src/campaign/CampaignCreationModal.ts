import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { WORLD_TEMPLATE } from "../templates";
import { CalendarDateInputModal } from './CalendarDateInputModal';

export class CampaignCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  campaignName = "";
  dmName = "";
  system = "D&D 5e";
  role = "GM";
  calendar = "";
  calendarName = "";
  startYear = "";
  startMonth = "";
  startDay = "";
  selectedCalendarData: any = null;
  calendarContainer: HTMLElement | null = null;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "🎲 Create New Campaign" });

    // Campaign Name
    new Setting(contentEl)
      .setName("Campaign Name")
      .setDesc("The name of your campaign")
      .addText((text) => {
        text
          .setPlaceholder("e.g., Lost Mines of Phandelver")
          .onChange((value) => {
            this.campaignName = value;
          });
        text.inputEl.focus();
      });

    // Role Selection
    new Setting(contentEl)
      .setName("Your Role")
      .setDesc("Are you the GM/DM or a player?")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("GM", "Game Master / DM")
          .addOption("player", "Player")
          .setValue(this.role)
          .onChange((value) => {
            this.role = value;
            this.updateDMField();
          });
      });

    // DM Name (shown only if player)
    const dmSetting = new Setting(contentEl)
      .setName("DM Name")
      .setDesc("Name of the Dungeon Master")
      .addText((text) =>
        text
          .setPlaceholder("e.g., John Smith")
          .onChange((value) => {
            this.dmName = value;
          })
      );

    // Hide DM field initially if GM
    if (this.role === "GM") {
      dmSetting.settingEl.style.display = "none";
    }

    // System Selection
    new Setting(contentEl)
      .setName("Game System")
      .setDesc("Which RPG system are you using?")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("D&D 5e", "Dungeons & Dragons 5th Edition")
          .addOption("Pathfinder 2e", "Pathfinder 2nd Edition")
          .addOption("Call of Cthulhu", "Call of Cthulhu")
          .addOption("Savage Worlds", "Savage Worlds")
          .addOption("FATE", "FATE Core")
          .addOption("OSR", "Old School Renaissance")
          .addOption("Other", "Other / Custom")
          .setValue(this.system)
          .onChange((value) => {
            this.system = value;
          });
      });

    contentEl.createEl("h3", { text: "📅 Calendar Settings" });

    // Calendar Selection
    const calendars = this.getAvailableCalendars();
    new Setting(contentEl)
      .setName("Fantasy Calendar")
      .setDesc("Select an existing calendar or create a new one")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "None");
        dropdown.addOption("__CREATE_NEW__", "➕ Create New Calendar");
        calendars.forEach(cal => {
          dropdown.addOption(cal.id, cal.name);
        });
        dropdown.setValue(this.calendar)
          .onChange((value) => {
            this.calendar = value;
            if (value === "__CREATE_NEW__") {
              this.showCreateCalendarUI();
            } else if (value) {
              this.selectedCalendarData = this.getCalendarData(value);
              this.calendarName = this.selectedCalendarData?.name || value;
              this.showDateSelectors();
            } else {
              this.hideDateSelectors();
            }
          });
      });

    // Container for calendar-specific UI
    this.calendarContainer = contentEl.createDiv({ cls: "dnd-calendar-container" });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const createButton = buttonContainer.createEl("button", {
      text: "Create Campaign",
      cls: "mod-cta",
    });

    createButton.addEventListener("click", async () => {
      if (!this.campaignName.trim()) {
        new Notice("Please enter a campaign name!");
        return;
      }

      this.close();
      await this.createCampaignStructure();
    });

    // Store DM setting reference for later
    this.updateDMField = () => {
      if (this.role === "GM") {
        dmSetting.settingEl.style.display = "none";
      } else {
        dmSetting.settingEl.style.display = "";
      }
    };
  }

  updateDMField() {
    // This will be set in onOpen
  }

  showDateSelectors() {
    if (!this.calendarContainer) return;
    this.calendarContainer.empty();

    if (!this.selectedCalendarData) return;

    // Initialize default values if not set
    if (!this.startYear) this.startYear = "1";
    if (!this.startMonth) this.startMonth = "1";
    if (!this.startDay) this.startDay = "1";

    // Campaign Start Date with date picker button
    const dateSetting = new Setting(this.calendarContainer)
      .setName("Campaign Start Date")
      .setDesc("When does the campaign begin in your world?");

    // Display current date
    const dateDisplay = this.calendarContainer.createEl("div", {
      cls: "dnd-date-display"
    });
    this.updateDateDisplay(dateDisplay);

    // Add button to open Calendarium's date picker
    dateSetting.addButton((button) => {
      button
        .setButtonText("📅 Pick Date")
        .setCta()
        .onClick(async () => {
          await this.openCalendariumDatePicker();
        });
    });
  }

  updateDateDisplay(container: HTMLElement) {
    const monthData = this.selectedCalendarData?.static?.months || [];
    const monthIndex = parseInt(this.startMonth || "1") - 1;
    const monthName = monthData[monthIndex]?.name || `Month ${this.startMonth}`;
    
    container.setText(`${monthName} ${this.startDay}, Year ${this.startYear}`);
  }

  async openCalendariumDatePicker() {
    // Use our custom date picker modal with calendar validation
    const modal = new CalendarDateInputModal(
      this.app,
      this.selectedCalendarData,
      this.startYear,
      this.startMonth,
      this.startDay,
      (year, month, day) => {
        this.startYear = year;
        this.startMonth = month;
        this.startDay = day;
        
        const dateDisplay = this.calendarContainer?.querySelector('.dnd-date-display');
        if (dateDisplay) {
          this.updateDateDisplay(dateDisplay as HTMLElement);
        }
      }
    );
    modal.open();
  }

  hideDateSelectors() {
    if (this.calendarContainer) {
      this.calendarContainer.empty();
    }
  }

  showCreateCalendarUI() {
    if (!this.calendarContainer) return;
    this.calendarContainer.empty();

    this.calendarContainer.createEl("p", {
      text: "Click below to open Calendarium's calendar creation interface.",
      cls: "setting-item-description"
    });

    const buttonContainer = this.calendarContainer.createDiv({ cls: "dnd-calendar-buttons" });

    // Quick Create button
    const quickButton = buttonContainer.createEl("button", {
      text: "⚡ Quick Create",
      cls: "mod-cta"
    });
    quickButton.addEventListener("click", async () => {
      await this.openCalendariumCreation("quick");
    });

    // Full Create button
    const fullButton = buttonContainer.createEl("button", {
      text: "🎨 Full Create"
    });
    fullButton.addEventListener("click", async () => {
      await this.openCalendariumCreation("full");
    });

    // Import button
    const importButton = buttonContainer.createEl("button", {
      text: "📥 Import"
    });
    importButton.addEventListener("click", async () => {
      await this.openCalendariumCreation("import");
    });

    this.calendarContainer.createEl("p", {
      text: "After creating your calendar, reopen this modal to select it.",
      cls: "setting-item-description mod-warning"
    });
  }

  async openCalendariumCreation(type: "quick" | "full" | "import") {
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (!calendariumPlugin) {
      new Notice("Calendarium plugin not found!");
      return;
    }

    // Close this modal temporarily
    this.close();

    // Open Calendarium settings to the calendar creation section
    // This uses Obsidian's settings API
    const settingTab = (this.app as any).setting;
    if (settingTab) {
      settingTab.open();
      settingTab.openTabById("calendarium");
    }

    // Try to trigger the appropriate calendar creation command
    const commands = {
      quick: "calendarium:open-quick-creator",
      full: "calendarium:open-creator",
      import: "calendarium:import-calendar"
    };

    const commandId = commands[type];

    setTimeout(() => {
      (this.app as any).commands?.executeCommandById(commandId);
    }, 100);

    new Notice("After creating your calendar, use 'Create Campaign' again to select it.");
  }

  getAvailableCalendars(): Array<{ id: string; name: string }> {
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (calendariumPlugin && calendariumPlugin.data?.calendars) {
      const calendars = calendariumPlugin.data.calendars as Record<string, { name?: string }>;
      return Object.keys(calendars).map((id) => ({
        id,
        name: calendars[id]?.name || id,
      }));
    }
    return [];
  }

  getCalendarData(calendarId: string): any {
    const calendariumPlugin = (this.app as any).plugins?.plugins?.calendarium;
    if (calendariumPlugin && calendariumPlugin.data?.calendars) {
      return calendariumPlugin.data.calendars[calendarId];
    }
    return null;
  }

  async createCampaignStructure() {
    const campaignName = this.campaignName.trim();
    const campaignPath = `ttrpgs/${campaignName}`;

    new Notice(`Creating campaign "${campaignName}"...`);

    try {
      const campaignFolders = [
        campaignPath,
        `${campaignPath}/NPCs`,
        `${campaignPath}/PCs`,
        `${campaignPath}/Adventures`,
        `${campaignPath}/Factions`,
        `${campaignPath}/Items`,
        `${campaignPath}/Modules`,
        `${campaignPath}/Plot`,
        `${campaignPath}/fc-calendar`,
      ];

      for (const folder of campaignFolders) {
        await this.plugin.ensureFolderExists(folder);
      }

      const worldTemplate = this.app.vault.getAbstractFileByPath("z_Templates/world.md");
      let worldContent: string;

      if (worldTemplate instanceof TFile) {
        worldContent = await this.app.vault.read(worldTemplate);
      } else {
        worldContent = WORLD_TEMPLATE;
      }

      worldContent = worldContent
        .replace(/world: $/m, `world: ${campaignName}`)
        .replace(/campaign: $/m, `campaign: ${campaignName}`)
        .replace(/role: player$/m, `role: ${this.role}`)
        .replace(/system:$/m, `system: ${this.system}`)
        .replace(/fc-calendar:\s*([^\r\n]\w*)$/m, `fc-calendar: ${this.calendarName}`)
        .replace(/fc-date:\s*\n\s*year:\s*([^\r\n]\w*)$/m, `fc-date:\n  year: ${this.startYear}`)
        .replace(/(fc-date:\s*\n\s*year:.+\n\s*)month:\s*([^\r\n]\w*)$/m, `$1month: ${this.startMonth}`)
        .replace(/(fc-date:\s*\n\s*year:.+\n\s*month:.+\n\s*)day:\s*([^\r\n]\w*)$/m, `$1day: ${this.startDay}`)
        .replace(/# The World of Your Campaign/g, `# The World of ${campaignName}`)
        .replace(/{{CAMPAIGN_NAME}}/g, campaignName);

      const worldFilePath = `${campaignPath}/World.md`;
      await this.app.vault.create(worldFilePath, worldContent);

      if (this.role === "GM") {
        const houseRulesContent = `---
type: rules
campaign: ${campaignName}
---

# House Rules

## Character Creation
- 

## Combat Rules
- 

## Homebrew Content
- 

## Table Etiquette
- 
`;
        await this.app.vault.create(`${campaignPath}/House Rules.md`, houseRulesContent);
      }

      // Auto-create a party for this campaign
      await this.plugin.partyManager.getOrCreateCampaignParty(campaignName, campaignPath);

      await this.app.workspace.openLinkText(worldFilePath, "", true);

      new Notice(`✅ Campaign "${campaignName}" created successfully!`);
    } catch (error) {
      new Notice(`❌ Error creating campaign: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Campaign creation error:", error);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
