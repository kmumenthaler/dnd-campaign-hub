import { Modal } from "obsidian";
import type DndCampaignHubPlugin from "../main";

export class SetupWizardModal extends Modal {
  private plugin: DndCampaignHubPlugin;

  constructor(plugin: DndCampaignHubPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    this.modalEl.addClass("dnd-setup-wizard-modal");
    this.titleEl.setText("TTRPG Campaign Hub Setup");
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    const initialized = this.plugin.isVaultInitialized();
    const campaigns = this.plugin.getAllCampaigns();
    const hasAudioFolder = !!this.plugin.settings.musicSettings.audioFolderPath;

    const intro = contentEl.createDiv({ cls: "dnd-setup-intro" });
    intro.createEl("p", {
      text: "Use this checklist to get from an empty vault to a usable campaign workspace.",
    });

    this.renderStep(contentEl, {
      number: "1",
      title: "Initialize the vault",
      status: initialized ? "Done" : "Needed",
      description: initialized
        ? "The required folder structure is already present."
        : "Create the folder structure and bundled templates used by Campaign Hub.",
      actionLabel: initialized ? "Open Campaign Home" : "Initialize Vault",
      action: async () => {
        if (!initialized) {
          await this.plugin.initializeVault();
          this.render();
          return;
        }
        this.plugin.openCampaignHome();
      },
    });

    this.renderStep(contentEl, {
      number: "2",
      title: "Create or select a campaign",
      status: campaigns.length > 0 ? `${campaigns.length} found` : "Needed",
      description: "Campaigns are the root context for sessions, scenes, party data, encounters, and maps.",
      actionLabel: campaigns.length > 0 ? "Open Campaign Home" : "Create Campaign",
      action: () => {
        if (campaigns.length > 0) {
          this.plugin.openCampaignHome();
        } else {
          this.plugin.createCampaign();
        }
      },
    });

    this.renderStep(contentEl, {
      number: "3",
      title: "Configure optional systems",
      status: hasAudioFolder ? "Audio ready" : "Optional",
      description: "Open the tools for music, maps, and parties when your campaign needs them.",
      actionLabel: "Open GM Tools",
      action: () => this.plugin.openGMTools(),
      secondaryActions: [
        { label: "Music", action: () => this.plugin.ensureMusicPlayerOpen() },
        { label: "Maps", action: () => this.plugin.openMapManager() },
        { label: "Party", action: () => this.plugin.openPartyManager() },
      ],
    });

    const footer = contentEl.createDiv({ cls: "dnd-setup-footer" });
    const finish = footer.createEl("button", { text: "Finish Setup", cls: "mod-cta" });
    finish.addEventListener("click", async () => {
      await this.plugin.completeOnboardingSetup();
      this.close();
      this.plugin.openCampaignHome();
    });

    const later = footer.createEl("button", { text: "Remind Me Later" });
    later.addEventListener("click", () => this.close());
  }

  private renderStep(container: HTMLElement, opts: {
    number: string;
    title: string;
    status: string;
    description: string;
    actionLabel: string;
    action: () => void | Promise<void>;
    secondaryActions?: Array<{ label: string; action: () => void | Promise<void> }>;
  }) {
    const card = container.createDiv({ cls: "dnd-setup-step" });
    const index = card.createDiv({ cls: "dnd-setup-step-index" });
    index.setText(opts.number);

    const body = card.createDiv({ cls: "dnd-setup-step-body" });
    const header = body.createDiv({ cls: "dnd-setup-step-header" });
    header.createEl("h3", { text: opts.title });
    header.createEl("span", { text: opts.status, cls: "dnd-setup-step-status" });
    body.createEl("p", { text: opts.description });

    const actions = body.createDiv({ cls: "dnd-setup-step-actions" });
    const primary = actions.createEl("button", { text: opts.actionLabel, cls: "mod-cta" });
    primary.addEventListener("click", () => {
      void opts.action();
    });

    for (const action of opts.secondaryActions || []) {
      const button = actions.createEl("button", { text: action.label });
      button.addEventListener("click", () => {
        void action.action();
      });
    }
  }
}
