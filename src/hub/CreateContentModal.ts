import { Modal } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { CreationNextStepKind } from "./CreationNextStepsModal";
import { renderActionableEmptyState } from "../utils/ActionableEmptyState";

type CreateAction = {
  label: string;
  description: string;
  nextStepKind?: CreationNextStepKind;
  action: () => void | Promise<void>;
};

type CreateGroup = {
  title: string;
  description: string;
  actions: CreateAction[];
};

export class CreateContentModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private campaignPath: string;

  constructor(plugin: DndCampaignHubPlugin, campaignPath?: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.campaignPath = campaignPath || plugin.getActiveCampaignPath();
  }

  onOpen() {
    this.modalEl.addClass("dnd-create-content-modal");
    this.titleEl.setText("Create Campaign Content");
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    const campaignPath = this.campaignPath || this.plugin.getActiveCampaignPath();
    if (!campaignPath) {
      renderActionableEmptyState(
        contentEl,
        "No campaign selected",
        "Create or select a campaign before adding sessions, characters, encounters, or reference material.",
        [{ label: "Create Campaign", onClick: () => { this.close(); this.plugin.createCampaign(); }, cta: true }],
      );
      return;
    }
    const campaignName = campaignPath.split("/").pop() || "No campaign selected";

    const intro = contentEl.createDiv({ cls: "dnd-create-content-intro" });
    intro.createEl("p", { text: `Current campaign: ${campaignName}` });

    const referenceActions: CreateAction[] = [
      { label: "Item", description: "Create an item note.", nextStepKind: "item", action: () => this.plugin.createItem(campaignPath) },
      { label: "Spell", description: "Import or create a spell note.", nextStepKind: "spell", action: () => this.plugin.createSpell(campaignPath) },
    ];
    if (this.plugin.isHowToBeAHeroCampaign(campaignPath)) {
      referenceActions.unshift({
        label: "Evidence",
        description: "Create an investigation clue for this How to be a Hero campaign.",
        action: () => this.plugin.createEvidence(campaignPath),
      });
    }

    const groups: CreateGroup[] = [
      {
        title: "Session Flow",
        description: "Prepare or continue the playable structure of your campaign.",
        actions: [
          { label: "Session", description: "Create the next session note.", nextStepKind: "session", action: () => this.plugin.createSession(campaignPath) },
          { label: "Scene", description: "Create a scene for prep or live play.", nextStepKind: "scene", action: () => this.plugin.createScene(campaignPath) },
          { label: "Adventure", description: "Create a multi-scene story arc.", nextStepKind: "adventure", action: () => this.plugin.createAdventure(campaignPath) },
        ],
      },
      {
        title: "Characters",
        description: "Add player characters, NPCs, and factions.",
        actions: [
          { label: "Player Character", description: "Create a PC note and register it with party tools.", nextStepKind: "pc", action: () => this.plugin.createPc(campaignPath) },
          { label: "Import PC", description: "Bring a PC in from another campaign.", nextStepKind: "pc", action: () => this.plugin.importPc(campaignPath) },
          { label: "NPC", description: "Create a non-player character.", nextStepKind: "npc", action: () => this.plugin.createNpc(campaignPath) },
          { label: "Faction", description: "Create an organization or group.", nextStepKind: "faction", action: () => this.plugin.createFaction(campaignPath) },
        ],
      },
      {
        title: "Encounter Prep",
        description: "Build the tactical and rules pieces for play.",
        actions: [
          { label: "Encounter", description: "Open the Encounter Builder with this campaign's party.", nextStepKind: "encounter", action: () => this.plugin.createEncounter(campaignPath) },
          { label: "Creature", description: "Create a reusable creature/statblock note.", nextStepKind: "creature", action: () => this.plugin.createCreature(campaignPath) },
          { label: "Trap", description: "Create a trap or hazard.", nextStepKind: "trap", action: () => this.plugin.createTrap(undefined, undefined, campaignPath) },
          { label: "Random Encounter Table", description: "Generate a rollable encounter table.", action: () => (this.app as any).commands?.executeCommandById(`${this.plugin.manifest.id}:create-random-encounter-table`) },
        ],
      },
      {
        title: "Maps and Assets",
        description: "Create battle maps and reusable map templates.",
        actions: [
          { label: "Battle Map", description: "Create a map from a template.", action: () => this.plugin.createMap(campaignPath) },
          { label: "Battle Map from Image", description: "Create a quick one-off map from media.", action: () => this.plugin.createMapDirect(campaignPath) },
          { label: "Battlemap Template", description: "Create a reusable map template.", action: () => this.plugin.createBattlemapTemplate() },
          { label: "Map Manager", description: "Review saved maps and templates.", action: () => this.plugin.openMapManager() },
        ],
      },
      {
        title: "Reference",
        description: "Add reusable campaign reference material.",
        actions: referenceActions,
      },
    ];

    for (const group of groups) {
      this.renderGroup(contentEl, group);
    }
  }

  private renderGroup(container: HTMLElement, group: CreateGroup) {
    const section = container.createDiv({ cls: "dnd-create-content-group" });
    section.createEl("h3", { text: group.title });
    section.createEl("p", { text: group.description, cls: "dnd-create-content-group-desc" });

    const grid = section.createDiv({ cls: "dnd-create-content-grid" });
    for (const action of group.actions) {
      const button = grid.createEl("button", { cls: "dnd-create-content-action" });
      button.createEl("strong", { text: action.label });
      button.createEl("span", { text: action.description });
      button.addEventListener("click", () => {
        this.close();
        if (action.nextStepKind) {
          this.plugin.armCreationNextSteps(action.nextStepKind, this.campaignPath);
        }
        void action.action();
      });
    }
  }
}
