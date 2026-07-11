import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SessionCreationModal } from './SessionCreationModal';
import { ConfirmModal } from '../utils/ConfirmModal';
import { updateYamlFrontmatter } from '../utils/YamlFrontmatter';

export class EndSessionModal extends Modal {
  plugin: DndCampaignHubPlugin;
  sessionFile: TFile;
  endingScenePath = "";
  scenes: Array<{ path: string; name: string; sceneNumber: number; status: string; adventurePath: string; adventureName: string }> = [];

  constructor(app: App, plugin: DndCampaignHubPlugin, sessionFile: TFile) {
    super(app);
    this.plugin = plugin;
    this.sessionFile = sessionFile;
  }

  private parseWikilink(val: unknown): string | null {
    if (!val) return null;
    // Obsidian metadata cache resolves wikilinks to {path, ...} objects
    if (typeof val === 'object' && val !== null && 'path' in val) {
      return (val as { path: string }).path || null;
    }
    const s = String(val);
    const m = s.match(/\[\[(.+?)\]\]/);
    return m ? (m[1] ?? null) : (s.trim() || null);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: '🏁 End Session Here' });

    const cache = this.app.metadataCache.getFileCache(this.sessionFile);
    const fm = cache?.frontmatter;
    const tmp = new SessionCreationModal(this.app, this.plugin);
    const rawAdventures = Array.isArray(fm?.adventures) && fm.adventures.length > 0
      ? fm.adventures
      : [fm?.adventure];
    const linkedAdventures: Array<{ path: string; name: string }> = [];
    const seen = new Set<string>();
    for (const value of rawAdventures) {
      const ref = this.parseWikilink(value);
      if (!ref) continue;
      const file = tmp.resolveAdventureFile(ref);
      if (!file || seen.has(file.path)) continue;
      seen.add(file.path);
      linkedAdventures.push({ path: file.path, name: file.basename });
    }

    if (linkedAdventures.length > 0) {
      await this.buildScenePicker(contentEl, linkedAdventures);
    } else {
      // No adventure linked — show adventure picker first
      contentEl.createEl('p', {
        text: 'This session has no adventure linked. Pick one to find its scenes:',
        cls: 'setting-item-description'
      });

      const campaignPath = this.sessionFile.parent?.path ?? '';
      const tmp = new SessionCreationModal(this.app, this.plugin);
      tmp.campaignPath = campaignPath;
      const adventures = await tmp.getAllAdventures();

      if (adventures.length === 0) {
        contentEl.createEl('p', { text: 'No adventures found.' });
        contentEl.createEl('button', { text: 'Close' }).onclick = () => this.close();
        return;
      }

      let pickedAdventurePath = adventures[0]?.path ?? '';
      new Setting(contentEl)
        .setName('Adventure')
        .addDropdown(dd => {
          adventures.forEach(a => dd.addOption(a.path, a.name));
          dd.setValue(pickedAdventurePath);
          dd.onChange(v => { pickedAdventurePath = v; });
        });

      const sceneArea = contentEl.createDiv();
      const loadBtn = contentEl.createEl('button', { text: 'Load Scenes →', cls: 'mod-cta' });
      loadBtn.style.margin = '8px 0';
      loadBtn.onclick = async () => {
        loadBtn.remove();
        sceneArea.empty();
        await this.buildScenePicker(sceneArea, [{
          path: pickedAdventurePath,
          name: adventures.find(a => a.path === pickedAdventurePath)?.name ?? pickedAdventurePath,
        }]);
      };
    }
  }

  /** Renders the scene picker and Save button into `container`. */
  private async buildScenePicker(container: HTMLElement, adventures: Array<{ path: string; name: string }>) {
    const modal = this;
    const tmp = new SessionCreationModal(this.app, this.plugin);
    this.scenes = [];
    const seenScenes = new Set<string>();
    for (const adventure of adventures) {
      const scenes = await tmp.getAllScenesForAdventure(adventure.path);
      for (const scene of scenes) {
        if (seenScenes.has(scene.path)) continue;
        seenScenes.add(scene.path);
        this.scenes.push({
          ...scene,
          adventurePath: adventure.path,
          adventureName: adventure.name,
        });
      }
    }

    if (this.scenes.length === 0) {
      container.createEl('p', { text: `No scenes found for this adventure. Check that scene notes have type: scene in their frontmatter.` });
      container.createEl('button', { text: 'Close' }).onclick = () => this.close();
      return;
    }

    const preferred = [...this.scenes].reverse().find(s => s.status === 'in-progress')
      ?? this.scenes[this.scenes.length - 1];
    this.endingScenePath = preferred?.path ?? '';

    container.createEl('p', { text: 'Record which scene the session ended at.', cls: 'setting-item-description' });

    new Setting(container)
      .setName('Ending Scene')
      .setDesc('Scene where the session stopped')
      .addDropdown(dd => {
        dd.addOption('', '-- None --');
        for (const sc of this.scenes) {
          dd.addOption(sc.path, `${sc.adventureName} — ${sc.name} [${sc.status}]`);
        }
        dd.setValue(this.endingScenePath);
        dd.onChange(v => { this.endingScenePath = v; });
      });

    const btns = container.createDiv({ cls: 'dnd-modal-buttons' });
    const cancel = btns.createEl('button', { text: 'Cancel' });
    cancel.onclick = () => this.close();
    const save = btns.createEl('button', { text: '🏁 Save Ending Scene', cls: 'mod-cta' });
    save.onclick = async () => {
      this.close();
      const selected = modal.scenes.find(scene => scene.path === modal.endingScenePath);
      if (selected) await modal.saveEndingScene(selected.adventurePath);
    };
  }

  async saveEndingScene(resolvedAdventurePath: string) {
    if (!this.endingScenePath) return;
    try {
      // Write ending_scene (and adventure if missing) to session frontmatter
      let content = await this.app.vault.read(this.sessionFile);
      const endingSceneWiki = `[[${this.endingScenePath}]]`;

      content = updateYamlFrontmatter(content, (fm) => {
        const updated: Record<string, unknown> = {
          ...fm,
          ending_scene: endingSceneWiki,
        };

        const existingAdventure = String(updated.adventure ?? '').trim();
        if (!existingAdventure.startsWith('[[') && resolvedAdventurePath) {
          updated.adventure = `[[${resolvedAdventurePath}]]`;
        }

        return updated;
      });

      await this.app.vault.modify(this.sessionFile, content);

      // Add session backlink to scene
      const tmp = new SessionCreationModal(this.app, this.plugin);
      tmp.adventurePath = resolvedAdventurePath;
      await tmp.addSessionBacklinkToScene(this.endingScenePath, this.sessionFile.path);

      // Optionally update scene statuses
      const endIdx = this.scenes.findIndex(s => s.path === this.endingScenePath);
      if (endIdx >= 0) {
        const endScene = this.scenes[endIdx];
        if (!endScene) return;
        const scenesBeforeCount = endIdx;
        const msgs: string[] = [];
        if (scenesBeforeCount > 0) msgs.push(`Mark ${scenesBeforeCount} scene(s) before "${endScene.name}" as completed.`);
        if (endScene.status !== 'in-progress') msgs.push(`Set "${endScene.name}" to in-progress.`);

        if (msgs.length > 0) {
          const confirmed = await new Promise<boolean>(resolve => {
            new ConfirmModal(this.app, 'Update Scene Statuses?', msgs.join('\n'), resolve).open();
          });
          if (confirmed) {
            await tmp.updateSceneStatusesFromStartingScene(this.scenes, endIdx);
          }
        }
      }

      new Notice('🏁 Ending scene recorded!');
    } catch (e) {
      new Notice(`❌ Could not save ending scene: ${e instanceof Error ? e.message : String(e)}`);
      console.error('EndSessionModal.saveEndingScene error:', e);
    }
  }

  onClose() { this.contentEl.empty(); }
}
