import { App, ItemView, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { GM_MAP_VIEW_TYPE } from "../constants";

export class GmMapView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private mapId: string = '';
  private notePath: string = '';
  private sourceConfig: string = '';
  private mapContainer: HTMLElement | null = null;
  private _gmRendered: boolean = false; // Guard against double renderMap (setState + onOpen race)

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return GM_MAP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return `GM Map${this.mapId ? ` — ${this.mapId}` : ''}`;
  }

  getIcon(): string {
    return "map";
  }

  getMapId(): string {
    return this.mapId;
  }

  async setState(state: any, result: any) {
    if (state.mapId) this.mapId = state.mapId;
    if (state.notePath) this.notePath = state.notePath;
    if (state.sourceConfig) this.sourceConfig = state.sourceConfig;
    await super.setState(state, result);
    if (this.mapId && this.sourceConfig && !this._gmRendered && this.mapContainer) {
      this._gmRendered = true;
      await this.renderMap();
    }
  }

  getState() {
    return {
      mapId: this.mapId,
      notePath: this.notePath,
      sourceConfig: this.sourceConfig
    };
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('dnd-gm-map-container');
    this.mapContainer = container;

    if (this.mapId && this.sourceConfig && !this._gmRendered) {
      this._gmRendered = true;
      await this.renderMap();
    }
  }

  private async renderMap() {
    if (!this.mapContainer) return;
    this.mapContainer.empty();

    // Build a minimal MarkdownPostProcessorContext shim
    const ctx = {
      sourcePath: this.notePath || '',
      getSectionInfo: () => null,
      addChild: (_child: any) => {},
      frontmatter: undefined
    };

    // Render the full interactive GM map into this leaf's container
    await this.plugin.renderMapView(this.sourceConfig, this.mapContainer, ctx as any);

    // Mark this container for side-leaf-specific CSS tweaks
    this.mapContainer.addClass('dnd-map-side-leaf');

    // Try to get a friendlier display name from the rendered map config
    try {
      const parsed = JSON.parse(this.sourceConfig);
      if (parsed.mapId) {
        const savedData = await this.plugin.loadMapAnnotations(parsed.mapId);
        if (savedData?.name) {
          this.mapId = parsed.mapId;
          // Update the leaf header title
          (this.leaf as any).tabHeaderInnerTitleEl?.setText?.(`GM Map — ${savedData.name}`);
        }
      }
    } catch { /* ignore */ }
  }

  async onClose() {
    // Remove from tracking set
    if (this.plugin._gmMapViews) {
      this.plugin._gmMapViews.delete(this);
    }
    this.mapContainer = null;
  }
}
