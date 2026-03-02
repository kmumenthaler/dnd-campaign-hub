import { App, Modal, Setting, Notice } from "obsidian";

export class CalendarDateInputModal extends Modal {
  calendarData: any;
  year: string;
  month: string;
  day: string;
  onSubmit: (year: string, month: string, day: string) => void;
  dayDropdown: any = null;

  constructor(
    app: App,
    calendarData: any,
    year: string,
    month: string,
    day: string,
    onSubmit: (year: string, month: string, day: string) => void
  ) {
    super(app);
    this.calendarData = calendarData;
    this.year = year || "1";
    this.month = month || "1";
    this.day = day || "1";
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: " Select Date" });

    const monthData = this.calendarData?.static?.months || [];

    const dateSetting = new Setting(contentEl)
      .setName("Date")
      .setDesc("Select year, month, and day");

    dateSetting.addText((text) => {
      text
        .setPlaceholder("Year")
        .setValue(this.year)
        .onChange((value) => {
          this.year = value;
        });
      text.inputEl.style.width = "80px";
    });

    dateSetting.addDropdown((dropdown) => {
      monthData.forEach((month: any, index: number) => {
        const monthName = month.name || `Month ${index + 1}`;
        dropdown.addOption((index + 1).toString(), monthName);
      });
      dropdown.setValue(this.month || "1")
        .onChange((value) => {
          this.month = value;
          this.updateDayDropdown();
        });
    });

    dateSetting.addDropdown((dropdown) => {
      this.dayDropdown = dropdown;
      this.updateDayDropdown();
      dropdown.setValue(this.day || "1")
        .onChange((value) => {
          this.day = value;
        });
    });

    const buttonContainer = contentEl.createDiv({ cls: "dnd-modal-buttons" });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const selectButton = buttonContainer.createEl("button", {
      text: "Select Date",
      cls: "mod-cta"
    });
    selectButton.addEventListener("click", () => {
      this.onSubmit(this.year, this.month, this.day);
      this.close();
    });
  }

  updateDayDropdown() {
    if (!this.dayDropdown) return;

    const monthData = this.calendarData?.static?.months || [];
    const monthIndex = parseInt(this.month || "1") - 1;
    const daysInMonth = monthData[monthIndex]?.length || 30;

    this.dayDropdown.selectEl.empty();
    for (let d = 1; d <= daysInMonth; d++) {
      this.dayDropdown.addOption(d.toString(), d.toString());
    }
    
    if (parseInt(this.day) > daysInMonth) {
      this.day = daysInMonth.toString();
      this.dayDropdown.setValue(this.day);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
