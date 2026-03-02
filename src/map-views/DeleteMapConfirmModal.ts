import { App, Modal, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";

export class DeleteMapConfirmModal extends Modal {
  private plugin: DndCampaignHubPlugin;
  private mapId: string;
  private mapName: string;
  private sourcePath: string;
  private onDeleted: () => void;

  constructor(
    app: App,
    plugin: DndCampaignHubPlugin,
    mapId: string,
    mapName: string,
    sourcePath: string,
    onDeleted: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.mapId = mapId;
    this.mapName = mapName;
    this.sourcePath = sourcePath;
    this.onDeleted = onDeleted;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '🗑️ Delete Map' });

    contentEl.createEl('p', {
      text: `Are you sure you want to delete "${this.mapName}"?`
    });

    contentEl.createEl('p', {
      text: 'This will remove all map data including markers, drawings, fog of war, walls, and other annotations. This cannot be undone.',
      cls: 'setting-item-description'
    });

    contentEl.createEl('p', {
      text: 'Note: The map image file will not be deleted from your vault.',
      cls: 'setting-item-description'
    });

    // Checkbox to also remove code block from note
    const removeCodeBlockContainer = contentEl.createDiv();
    removeCodeBlockContainer.style.marginTop = '12px';
    removeCodeBlockContainer.style.marginBottom = '12px';

    const checkbox = removeCodeBlockContainer.createEl('input', {
      type: 'checkbox',
      attr: { id: 'delete-map-remove-codeblock' }
    }) as HTMLInputElement;
    checkbox.checked = false;

    const label = removeCodeBlockContainer.createEl('label', {
      text: ' Also remove the map code block from this note',
      attr: { for: 'delete-map-remove-codeblock' }
    });
    label.style.marginLeft = '6px';

    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '16px';

    const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelButton.addEventListener('click', () => {
      this.close();
    });

    const deleteButton = buttonContainer.createEl('button', {
      text: 'Delete Map',
      cls: 'mod-warning'
    });
    deleteButton.style.backgroundColor = 'var(--background-modifier-error)';
    deleteButton.style.color = 'var(--text-on-accent)';
    deleteButton.style.borderRadius = '4px';

    deleteButton.addEventListener('click', async () => {
      await this.performDelete(checkbox.checked);
      this.close();
    });
  }

  private async performDelete(removeCodeBlock: boolean): Promise<void> {
    try {
      // Delete annotation JSON file
      const annotationPath = this.plugin.getMapAnnotationPath(this.mapId);
      if (await this.app.vault.adapter.exists(annotationPath)) {
        await this.app.vault.adapter.remove(annotationPath);
      }

      // Optionally remove the dnd-map code block from the note
      if (removeCodeBlock && this.sourcePath) {
        await this.removeCodeBlockFromNote();
      }

      new Notice(`✅ Map "${this.mapName}" deleted`);
      this.onDeleted();
    } catch (err) {
      console.error('[DeleteMap] Error deleting map:', err);
      new Notice('❌ Failed to delete map');
    }
  }

  private async removeCodeBlockFromNote(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
      if (!(file instanceof TFile)) return;

      const content = await this.app.vault.read(file);

      // Find and remove the dnd-map code block containing this mapId
      const escapedId = this.mapId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const codeBlockRegex = new RegExp(
        '```dnd-map\\s*\\n[\\s\\S]*?"mapId"\\s*:\\s*"' + escapedId + '"[\\s\\S]*?\\n```',
        'g'
      );

      const newContent = content.replace(codeBlockRegex, '');

      if (newContent !== content) {
        await this.app.vault.modify(file, newContent);
      }
    } catch (err) {
      console.error('[DeleteMap] Error removing code block:', err);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
