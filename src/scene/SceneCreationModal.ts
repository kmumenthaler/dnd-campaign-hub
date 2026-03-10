import { App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { EncounterBuilder, EncounterCreature, TrapElement, TrapCountermeasure } from "../encounter/EncounterBuilder";
import { RenameCreatureModal } from "../utils/CreatureModals";
import { MarkerDefinition } from "../marker/MarkerTypes";
import { SCENE_TEMPLATE } from '../templates';
import { PartySelector } from '../party/PartySelector';

export class SceneCreationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  encounterBuilder: EncounterBuilder;
  adventurePath = "";
  campaignPath = "";  // Track campaign for party resolution
  sceneName = "";
  act = "1";
  sceneNumber = "1";
  duration = "30min";
  type = "exploration";
  difficulty = "medium";
  
  // Encounter builder properties
  createEncounter = false;
  encounterName = "";
  useColorNames = false;
  includeParty = true;  // Include party members in encounter
  selectedPartyMembers: string[] = [];  // Selected party member names
  selectedPartyId = "";
  selectedPartyName = "";
  creatures: Array<{
    name: string;
    count: number;
    hp?: number;
    ac?: number;
    cr?: string;
    source?: string;
    path?: string;  // Path to creature file for statblock plugin
    isFriendly?: boolean;
    isHidden?: boolean;
  }> = [];
  
  // UI state
  encounterSection: HTMLElement | null = null;
  difficultyContainer: HTMLElement | null = null;
  creatureListContainer: HTMLElement | null = null;
  partySelectionContainer: HTMLElement | null = null;
  partyMemberListContainer: HTMLElement | null = null;
  private partySelector: PartySelector | null = null;
  
  // For editing existing scenes
  isEdit = false;
  originalScenePath = "";

  constructor(app: App, plugin: DndCampaignHubPlugin, adventurePath?: string, scenePath?: string) {
    super(app);
    this.plugin = plugin;
    this.encounterBuilder = new EncounterBuilder(app, plugin);
    if (adventurePath) {
      this.adventurePath = adventurePath;
    }
    if (scenePath) {
      this.isEdit = true;
      this.originalScenePath = scenePath;
    }
  }

  async loadSceneData() {
    try {
      const sceneFile = this.app.vault.getAbstractFileByPath(this.originalScenePath);
      if (!(sceneFile instanceof TFile)) {
        new Notice("Scene file not found!");
        return;
      }

      const cache = this.app.metadataCache.getFileCache(sceneFile);
      const frontmatter = cache?.frontmatter;

      if (!frontmatter) {
        new Notice("Could not read scene data!");
        return;
      }

      // Load basic scene properties
      // Extract scene name from filename (remove "Scene X - " prefix)
      let extractedName = sceneFile.basename;
      const nameMatch = sceneFile.basename.match(/^Scene\s+\d+\s+-\s+(.+)$/);
      if (nameMatch && nameMatch[1]) {
        extractedName = nameMatch[1];
      }
      
      this.sceneName = frontmatter.name || extractedName;
      this.act = String(frontmatter.act || "1");
      this.sceneNumber = String(frontmatter.scene_number || "1");
      this.duration = frontmatter.duration || "30min";
      this.type = frontmatter.scene_type || frontmatter.type || "exploration";
      this.difficulty = frontmatter.difficulty || "medium";

      // Load encounter properties if combat scene
      if (this.type === "combat") {
        this.createEncounter = !!frontmatter.tracker_encounter;
        this.encounterName = frontmatter.tracker_encounter || "";
        
        // Load creatures from encounter_creatures or YAML field
        const creaturesData = frontmatter.encounter_creatures;
        if (creaturesData && Array.isArray(creaturesData)) {
          this.creatures = await Promise.all(creaturesData.map(async (c: any) => {
            const creature: any = {
              name: c.name || "Unknown",
              count: c.count || 1,
              hp: c.hp,
              ac: c.ac,
              cr: c.cr,
              source: c.source || "vault",
              path: c.path,
              isTrap: c.is_trap || false,
              isFriendly: c.is_friendly === true || c.is_friendly === "true",
              isHidden: c.is_hidden === true || c.is_hidden === "true"
            };
            
            // If it's a trap, load the trap data from the trap file
            if (creature.isTrap && c.trap_path) {
              try {
                const trapFile = this.app.vault.getAbstractFileByPath(c.trap_path);
                if (trapFile instanceof TFile) {
                  const trapContent = await this.app.vault.read(trapFile);
                  const trapCache = this.app.metadataCache.getFileCache(trapFile);
                  if (trapCache?.frontmatter) {
                    const fm = trapCache.frontmatter;
                    creature.trapData = {
                      traptrapType: fm.trap_type || "simple",
                      threatLevel: fm.threat_level || "dangerous",
                      elements: fm.elements || []
                    };
                  }
                }
              } catch (error) {
                console.error(`Error loading trap data for ${creature.name}:`, error);
              }
            }
            
            return creature;
          }));
        }
        
        // Load party selection
        this.selectedPartyId = frontmatter.selected_party_id || "";
        if (frontmatter.selected_party_members && Array.isArray(frontmatter.selected_party_members)) {
          this.selectedPartyMembers = [...frontmatter.selected_party_members];
        }
        
      }

      // Extract adventure path from scene path
      // Path format: adventures/Adventure Name/Act 1 - Setup/Scene 1 - Name.md
      // or: adventures/Adventure Name - Scenes/Scene 1 - Name.md
      const pathParts = this.originalScenePath.split('/');
      let adventureIndex = -1;
      
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i] === "Adventures" || pathParts[i] === "adventures") {
          adventureIndex = i;
          break;
        }
      }
      
      if (adventureIndex >= 0 && pathParts.length > adventureIndex + 1) {
        const adventureName = pathParts[adventureIndex + 1]!.replace(/ - Scenes$/, '');
        // Try to find the adventure file
        const possiblePaths = [
          `${pathParts.slice(0, adventureIndex + 2).join('/')}/${adventureName}.md`,
          `${pathParts.slice(0, adventureIndex + 1).join('/')}/${adventureName}.md`
        ];
        
        for (const path of possiblePaths) {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            this.adventurePath = path;
            
            // Load campaignPath from adventure frontmatter
            try {
              const adventureContent = await this.app.vault.read(file);
              const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
              const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');
              this.campaignPath = `ttrpgs/${campaignName}`;
            } catch (err) {
              console.error("Error loading campaign from adventure:", err);
            }
            
            break;
          }
        }
      }

    } catch (error) {
      console.error("Error loading scene data:", error);
      new Notice("Error loading scene data");
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Load existing scene data if editing
    if (this.isEdit) {
      await this.loadSceneData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "✏️ Edit Scene" : "🎬 Create New Scene" });

    // Get all adventures from GM campaigns
    const allAdventures = await this.getAllAdventures();

    if (allAdventures.length === 0) {
      contentEl.createEl("p", {
        text: "⚠️ No adventures found. Create an adventure first.",
        cls: "mod-warning"
      });
      
      const closeBtn = contentEl.createEl("button", { text: "Close" });
      closeBtn.addEventListener("click", () => this.close());
      return;
    }

    // Set default adventure if provided, otherwise first one
    if (!this.adventurePath && allAdventures.length > 0 && allAdventures[0]) {
      this.adventurePath = allAdventures[0].path;
    }

    contentEl.createEl("p", {
      text: "Add a new scene to your adventure. The scene will be inserted at the specified number.",
      cls: "setting-item-description"
    });

    // Adventure Selection
    new Setting(contentEl)
      .setName("Adventure")
      .setDesc("Select the adventure to add this scene to")
      .addDropdown(dropdown => {
        allAdventures.forEach(adv => {
          dropdown.addOption(adv.path, adv.name);
        });
        dropdown.setValue(this.adventurePath);
        dropdown.onChange(value => {
          this.adventurePath = value;
          // Update suggested scene number based on existing scenes
          this.updateSceneNumberSuggestion();
        });
      });

    // Scene Name
    new Setting(contentEl)
      .setName("Scene Name")
      .setDesc("Give this scene a descriptive name")
      .addText(text => text
        .setPlaceholder("e.g., Tavern Ambush")
        .setValue(this.sceneName)
        .onChange(value => this.sceneName = value));

    // Act Selection
    new Setting(contentEl)
      .setName("Act")
      .setDesc("Which act does this scene belong to?")
      .addDropdown(dropdown => dropdown
        .addOption("1", "Act 1 - Setup")
        .addOption("2", "Act 2 - Rising Action")
        .addOption("3", "Act 3 - Climax")
        .setValue(this.act)
        .onChange(value => this.act = value));

    // Scene Number
    const sceneNumberSetting = new Setting(contentEl)
      .setName("Scene Number")
      .setDesc("Position in the adventure (existing scenes will be renumbered if needed)")
      .addText(text => text
        .setPlaceholder("e.g., 5")
        .setValue(this.sceneNumber)
        .onChange(value => this.sceneNumber = value));

    // Duration
    new Setting(contentEl)
      .setName("Duration")
      .setDesc("Estimated scene duration")
      .addDropdown(dropdown => dropdown
        .addOption("15min", "15 minutes")
        .addOption("20min", "20 minutes")
        .addOption("30min", "30 minutes")
        .addOption("40min", "40 minutes")
        .addOption("45min", "45 minutes")
        .addOption("60min", "60 minutes")
        .setValue(this.duration)
        .onChange(value => this.duration = value));

    // Type
    new Setting(contentEl)
      .setName("Type")
      .setDesc("Primary scene type")
      .addDropdown(dropdown => dropdown
        .addOption("social", "🗣️ Social - NPC interactions")
        .addOption("combat", "⚔️ Combat - Fighting enemies")
        .addOption("exploration", "🔍 Exploration - Discovery & investigation")
        .addOption("puzzle", "🧩 Puzzle - Riddles & challenges")
        .addOption("montage", "🎬 Montage - Skill challenge")
        .setValue(this.type)
        .onChange(value => {
          this.type = value;
          this.showEncounterBuilderIfCombat();
        }));

    // Difficulty
    new Setting(contentEl)
      .setName("Difficulty")
      .setDesc("Challenge level")
      .addDropdown(dropdown => dropdown
        .addOption("easy", "Easy")
        .addOption("medium", "Medium")
        .addOption("hard", "Hard")
        .addOption("deadly", "Deadly")
        .setValue(this.difficulty)
        .onChange(value => this.difficulty = value));

    // Encounter Builder Section (only for combat scenes)
    this.encounterSection = contentEl.createDiv({ cls: "dnd-encounter-section" });
    this.showEncounterBuilderIfCombat();

    // Create/Update button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText(this.isEdit ? "Save Changes" : "Create Scene")
        .setCta()
        .onClick(async () => {
          if (!this.sceneName) {
            new Notice("Please enter a scene name!");
            return;
          }

          this.close();
          await this.createSceneFile();
        }));
  }

  async updateSceneNumberSuggestion() {
    const existingScenes = await this.getExistingScenes(this.adventurePath);
    const nextNumber = existingScenes.length + 1;
    this.sceneNumber = nextNumber.toString();
  }

  async getAllAdventures(): Promise<Array<{ path: string; name: string }>> {
    const adventures: Array<{ path: string; name: string }> = [];
    const gmCampaigns = await this.getAllGMCampaigns();

    for (const campaign of gmCampaigns) {
      const adventuresFolder = this.app.vault.getAbstractFileByPath(`${campaign.path}/Adventures`);
      
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
    }

    return adventures;
  }

  async getAllGMCampaigns(): Promise<Array<{ path: string; name: string }>> {
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    const gmCampaigns: Array<{ path: string; name: string }> = [];

    if (ttrpgsFolder instanceof TFolder) {
      for (const child of ttrpgsFolder.children) {
        if (child instanceof TFolder) {
          const worldFile = this.app.vault.getAbstractFileByPath(`${child.path}/World.md`);
          if (worldFile instanceof TFile) {
            const worldContent = await this.app.vault.read(worldFile);
            const roleMatch = worldContent.match(/^role:\s*([^\r\n]\w*)$/m);
            if (roleMatch && roleMatch[1] && roleMatch[1].toLowerCase() === 'gm') {
              gmCampaigns.push({
                path: child.path,
                name: child.name
              });
            }
          }
        }
      }
    }

    return gmCampaigns;
  }

  async getExistingScenes(adventurePath: string): Promise<Array<{ path: string; number: number; name: string }>> {
    const scenes: Array<{ path: string; number: number; name: string }> = [];
    const adventureFile = this.app.vault.getAbstractFileByPath(adventurePath);
    
    if (!(adventureFile instanceof TFile)) return scenes;

    // Determine base path for scenes
    const adventureFolder = adventureFile.parent;
    if (!adventureFolder) return scenes;

    let sceneFolders: TFolder[] = [];

    const isFolderStructure = adventureFolder.name === adventureFile.basename;

    if (isFolderStructure) {
      // Folder structure: Adventures/Adventure Name/
      // Check for new Scenes folder
      const scenesFolder = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Scenes`);
      if (scenesFolder instanceof TFolder) {
        sceneFolders.push(scenesFolder);
      }
      // Also check legacy Act folders
      for (const child of adventureFolder.children) {
        if (child instanceof TFolder && child.name.startsWith("Act ")) {
          sceneFolders.push(child);
        }
      }
      // If no Scenes or Act folders, check the main folder itself
      if (sceneFolders.length === 0) {
        sceneFolders.push(adventureFolder);
      }
    } else {
      // Legacy flat structure: Adventures/Adventure Name - Scenes/
      const flatScenesFolder = this.app.vault.getAbstractFileByPath(
        `${adventureFolder.path}/${adventureFile.basename} - Scenes`
      );
      if (flatScenesFolder instanceof TFolder) {
        sceneFolders.push(flatScenesFolder);
      }
    }

    // Scan all scene folders for scene files
    for (const folder of sceneFolders) {
      for (const item of folder.children) {
        if (item instanceof TFile && item.extension === 'md') {
          // Extract scene number from filename: "Scene X - Name.md"
          const match = item.basename.match(/^Scene\s+(\d+)\s+-\s+(.+)$/);
          if (match && match[1] && match[2]) {
            scenes.push({
              path: item.path,
              number: parseInt(match[1]),
              name: match[2]
            });
          }
        }
      }
    }

    // Sort by scene number
    scenes.sort((a, b) => a.number - b.number);
    return scenes;
  }

  async createSceneFile() {
    try {
      const sceneNum = parseInt(this.sceneNumber);
      if (isNaN(sceneNum) || sceneNum < 1) {
        new Notice("Scene number must be a positive number!");
        return;
      }

      // Get adventure info
      const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
      if (!(adventureFile instanceof TFile)) {
        new Notice("❌ Adventure file not found!");
        return;
      }

      const adventureContent = await this.app.vault.read(adventureFile);
      const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
      const worldMatch = adventureContent.match(/^world:\s*([^\r\n]+)$/m);
      const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');
      const worldName = (worldMatch?.[1]?.trim() || campaignName).replace(/^["']|["']$/g, '');
      
      // Set campaignPath for party resolution
      this.campaignPath = `ttrpgs/${campaignName}`;

      // ====================
      // EDIT MODE: Update existing scene
      // ====================
      if (this.isEdit && this.originalScenePath) {
        new Notice(`Updating scene "${this.sceneName}"...`);
        
        const originalFile = this.app.vault.getAbstractFileByPath(this.originalScenePath);
        if (!(originalFile instanceof TFile)) {
          new Notice("❌ Original scene file not found!");
          return;
        }

        // Get original scene number from filename or frontmatter
        const originalBasename = originalFile.basename;
        const originalNumberMatch = originalBasename.match(/^Scene\s+(\d+)\s+-/);
        const originalSceneNum = (originalNumberMatch && originalNumberMatch[1]) ? parseInt(originalNumberMatch[1]) : sceneNum;

        // Check if scene number changed
        const numberChanged = originalSceneNum !== sceneNum;

        // Determine the target path
        const adventureFolder = adventureFile.parent;
        if (!adventureFolder) {
          new Notice("❌ Adventure folder not found!");
          return;
        }

        let targetPath: string;
        
        if (numberChanged) {
          // Scene number changed - determine new path using the scene's current folder
          // Scenes stay in their current folder (Scenes/, legacy Act folders, or legacy flat structure)
          const parentPath = originalFile.parent?.path || "";
          targetPath = `${parentPath}/Scene ${sceneNum} - ${this.sceneName}.md`;

          // Check if new number conflicts with existing scenes (excluding the current scene)
          const existingScenes = await this.getExistingScenes(this.adventurePath);
          const conflictingScenes = existingScenes.filter(s => 
            s.number === sceneNum && s.path !== this.originalScenePath
          );

          if (conflictingScenes.length > 0) {
            // Renumber conflicting scenes
            const scenesToRenumber = existingScenes.filter(s => 
              s.number >= sceneNum && s.path !== this.originalScenePath
            );
            await this.renumberScenes(scenesToRenumber, sceneNum);
          }
        } else {
          // Scene number didn't change - update in place, but handle name/act changes
          const parentPath = originalFile.parent?.path || "";
          targetPath = `${parentPath}/Scene ${sceneNum} - ${this.sceneName}.md`;
        }

        // Handle encounter file
        let encounterFilePath = "";
        if (this.createEncounter && this.creatures.length > 0) {
          const savedPath = await this.saveEncounterFile();
          if (savedPath) {
            encounterFilePath = savedPath;
          }
        }

        // Preserve existing scene body content while updating frontmatter + header
        const existingContent = await this.app.vault.read(originalFile);

        // Build updated frontmatter
        const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
        const trackerEncounter = this.encounterName || "";
        const encounterFile = encounterFilePath ? `"[[${encounterFilePath}]]"` : '""';
        const encounterCreaturesJson = this.creatures.length > 0 
          ? JSON.stringify(this.creatures) 
          : "[]";
        
        let encounterDifficultyJson = "null";
        if (this.creatures.length > 0) {
          const diffResult = await this.calculateEncounterDifficulty();
          encounterDifficultyJson = JSON.stringify({
            difficulty: diffResult.analysis.difficulty,
            roundsToDefeat: diffResult.analysis.roundsToDefeatEnemies,
            survivalRatio: Math.round(diffResult.analysis.survivalRatio * 100) / 100,
            partyHP: diffResult.partyStats.totalHP,
            partyEffectiveDPR: Math.round(diffResult.analysis.partyEffectiveDPR),
            enemyHP: diffResult.enemyStats.totalHP,
            enemyEffectiveDPR: Math.round(diffResult.analysis.enemyEffectiveDPR),
            enemyCount: diffResult.enemyStats.creatureCount,
            partyCount: diffResult.partyStats.memberCount
          });
        }

        const existingFm = this.app.metadataCache.getFileCache(originalFile)?.frontmatter;
        const existingStatus = existingFm?.status || 'not-started';
        const existingSessions = (() => {
          const raw = existingFm?.sessions;
          if (!raw) return '[]';
          const arr: string[] = Array.isArray(raw) ? raw.map(String) : [String(raw)];
          return `[${arr.map(s => { const n = s.startsWith('[[') ? s : `[[${s}]]`; return `"${n}"`; }).join(', ')}]`;
        })();
        const existingTemplateVersion = existingFm?.template_version || '2.2.0';

        const updatedFrontmatter = `---
type: scene
template_version: ${existingTemplateVersion}
adventure: "${adventureFile.basename}"
campaign: "${campaignName}"
world: "${worldName}"
act: ${this.act}
scene_number: ${sceneNum}
duration: ${this.duration}
scene_type: ${this.type}
difficulty: ${this.difficulty}
status: ${existingStatus}
sessions: ${existingSessions}
tracker_encounter: ${trackerEncounter}
encounter_file: ${encounterFile}
encounter_creatures: ${encounterCreaturesJson}
encounter_difficulty: ${encounterDifficultyJson}
selected_party_id: "${this.selectedPartyId || ''}"
selected_party_members: ${JSON.stringify(this.selectedPartyMembers)}
date: ${currentDate}
---`;

        // Extract body content (everything after frontmatter)
        // Find the end of frontmatter
        const fmEndMatch = existingContent.match(/^---\n[\s\S]*?\n---\n?/);
        let bodyContent = "";
        if (fmEndMatch) {
          bodyContent = existingContent.substring(fmEndMatch[0].length);
        } else {
          bodyContent = existingContent;
        }

        // Update the header line in body content if scene name/number changed
        bodyContent = bodyContent.replace(
          /^# Scene\s+\d+:\s+.+$/m,
          `# Scene ${sceneNum}: ${this.sceneName}`
        );

        // Update the metadata line if present
        bodyContent = bodyContent.replace(
          /^\*\*Duration:\*\*.*\|.*\*\*Difficulty:\*\*.*$/m,
          `**Duration:** ${this.duration} | **Type:** ${this.type.charAt(0).toUpperCase() + this.type.slice(1)} | **Difficulty:** ${this.difficulty}`
        );
        bodyContent = bodyContent.replace(
          /^\*\*Act:\*\*.*\|.*\*\*Adventure:\*\*.*$/m,
          `**Act:** ${this.act} | **Adventure:** [[${adventureFile.basename}]]`
        );

        const updatedContent = updatedFrontmatter + "\n" + bodyContent;

        if (originalFile.path === targetPath) {
          // Same path - just update content
          await this.app.vault.modify(originalFile, updatedContent);
        } else {
          // Path changed - create new and delete old
          await this.app.vault.create(targetPath, updatedContent);
          await this.app.vault.delete(originalFile);
        }

        // Save encounter via PartyManager
        if (this.createEncounter && this.creatures.length > 0) {
          await this.saveEncounterData(targetPath);
        }

        // Open the updated scene
        await this.app.workspace.openLinkText(targetPath, "", true);

        new Notice(`✅ Scene "${this.sceneName}" updated!`);
        return;
      }

      // ====================
      // CREATE MODE: Create new scene
      // ====================
      new Notice(`Creating scene "${this.sceneName}"...`);

      // Determine folder structure
      const adventureFolder = adventureFile.parent;
      if (!adventureFolder) {
        new Notice("❌ Adventure folder not found!");
        return;
      }

      // Determine scenes folder path
      // New structure: Adventures/Adventure Name/Scenes/
      // Legacy support: Adventures/Adventure Name - Scenes/ or Adventures/Adventure Name/Act X/
      const isFolderStructure = adventureFolder.name === adventureFile.basename;
      
      let scenePath: string;
      let scenesFolder: string;

      if (isFolderStructure) {
        // Folder structure: Adventures/Adventure Name/
        const newScenesFolder = `${adventureFolder.path}/Scenes`;
        const newScenesExists = this.app.vault.getAbstractFileByPath(newScenesFolder) instanceof TFolder;
        
        if (newScenesExists) {
          // New structure: Adventures/Adventure Name/Scenes/
          scenesFolder = newScenesFolder;
        } else {
          // Legacy: check for Act folders
          const act1Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 1 - Setup`) instanceof TFolder;
          const act2Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 2 - Rising Action`) instanceof TFolder;
          const act3Exists = this.app.vault.getAbstractFileByPath(`${adventureFolder.path}/Act 3 - Climax`) instanceof TFolder;
          
          if (act1Exists || act2Exists || act3Exists) {
            // Legacy act-based - put new scenes in Scenes folder going forward
            scenesFolder = newScenesFolder;
            await this.plugin.ensureFolderExists(scenesFolder);
          } else {
            // No Scenes or Act folders - create Scenes folder
            scenesFolder = newScenesFolder;
            await this.plugin.ensureFolderExists(scenesFolder);
          }
        }
        scenePath = `${scenesFolder}/Scene ${sceneNum} - ${this.sceneName}.md`;
      } else {
        // Legacy flat structure: Adventures/Adventure Name - Scenes/
        const flatScenesFolder = `${adventureFolder.path}/${adventureFile.basename} - Scenes`;
        const flatExists = this.app.vault.getAbstractFileByPath(flatScenesFolder) instanceof TFolder;
        
        if (flatExists) {
          scenesFolder = flatScenesFolder;
        } else {
          // Create new Scenes folder inside adventure folder
          // Need to create the adventure folder first
          const advFolder = `${adventureFolder.path}/${adventureFile.basename}`;
          await this.plugin.ensureFolderExists(advFolder);
          scenesFolder = `${advFolder}/Scenes`;
          await this.plugin.ensureFolderExists(scenesFolder);
        }
        scenePath = `${scenesFolder}/Scene ${sceneNum} - ${this.sceneName}.md`;
      }

      // Check if we need to renumber existing scenes
      const existingScenes = await this.getExistingScenes(this.adventurePath);
      const scenesAtOrAfter = existingScenes.filter(s => s.number >= sceneNum);

      if (scenesAtOrAfter.length > 0) {
        // Renumber scenes
        await this.renumberScenes(scenesAtOrAfter, sceneNum);
      }

      // Ensure parent folder exists
      const parentPath = scenePath.substring(0, scenePath.lastIndexOf('/'));
      await this.plugin.ensureFolderExists(parentPath);

      // Create the scene file
      const currentDate: string = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
      
      const sceneData = {
        act: parseInt(this.act),
        num: sceneNum,
        name: this.sceneName,
        duration: this.duration,
        type: this.type,
        difficulty: this.difficulty
      };

      // Create Initiative Tracker encounter and save encounter file if requested
      let encounterFilePath = "";
      if (this.createEncounter && this.creatures.length > 0) {
        const savedPath = await this.saveEncounterFile();
        if (savedPath) {
          encounterFilePath = savedPath;
        }
      }

      await this.createSceneNote(scenePath, sceneData, campaignName, worldName, adventureFile.basename, currentDate, encounterFilePath);

      // Save encounter via PartyManager after scene is created
      if (this.createEncounter && this.creatures.length > 0) {
        await this.saveEncounterData(scenePath);
      }

      // Open the new scene
      await this.app.workspace.openLinkText(scenePath, "", true);

      new Notice(`✅ Scene "${this.sceneName}" created!`);
    } catch (error) {
      new Notice(`❌ Error creating scene: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Scene creation error:", error);
    }
  }

  async renumberScenes(scenes: Array<{ path: string; number: number; name: string }>, insertAt: number) {
    // Renumber scenes from highest to lowest to avoid conflicts during rename
    const sorted = [...scenes].sort((a, b) => b.number - a.number);
    
    for (const scene of sorted) {
      const oldFile = this.app.vault.getAbstractFileByPath(scene.path);
      if (!(oldFile instanceof TFile)) continue;

      const newNumber = scene.number + 1;
      
      // Construct new filename preserving exact scene name
      const oldFilename = oldFile.basename; // e.g., "Scene 5 - Tavern Fight"
      const sceneNameMatch = oldFilename.match(/^Scene\s+\d+\s+-\s+(.+)$/);
      const sceneName = sceneNameMatch?.[1] || scene.name;
      const newFilename = `Scene ${newNumber} - ${sceneName}`;
      
      // Build new path
      const parentPath = oldFile.parent?.path || "";
      const newPath = `${parentPath}/${newFilename}.md`;

      // Skip if source and destination are the same (shouldn't happen, but safety check)
      if (oldFile.path === newPath) {
        continue;
      }

      // Read and update content
      let content = await this.app.vault.read(oldFile);
      
      // Update scene_number in frontmatter
      content = content.replace(
        /^scene_number:\s*\d+$/m,
        `scene_number: ${newNumber}`
      );
      
      // Update the h1 header if it exists
      content = content.replace(
        /^# Scene\s+\d+:/m,
        `# Scene ${newNumber}:`
      );

      try {
        // Create new file with updated content
        await this.app.vault.create(newPath, content);
        
        // Delete old file only after successful creation
        await this.app.vault.delete(oldFile);
        
      } catch (error) {
        console.error(`Error renumbering scene ${oldFile.path}:`, error);
        new Notice(`⚠️ Could not renumber ${oldFilename}`);
      }
    }
  }

  async createSceneNote(
    filePath: string,
    scene: any,
    campaignName: string,
    worldName: string,
    adventureName: string,
    currentDate: string,
    encounterFilePath = ""
  ) {
    // Prepare encounter data for frontmatter
    const trackerEncounter = this.encounterName || "";
    const encounterFile = encounterFilePath ? `"[[${encounterFilePath}]]"` : '""';
    const encounterCreaturesJson = this.creatures.length > 0 
      ? JSON.stringify(this.creatures) 
      : "[]";
    
    // Calculate encounter difficulty if creatures exist
    let encounterDifficultyJson = "null";
    if (this.creatures.length > 0) {
      const diffResult = await this.calculateEncounterDifficulty();
      encounterDifficultyJson = JSON.stringify({
        difficulty: diffResult.analysis.difficulty,
        roundsToDefeat: diffResult.analysis.roundsToDefeatEnemies,
        survivalRatio: Math.round(diffResult.analysis.survivalRatio * 100) / 100,
        partyHP: diffResult.partyStats.totalHP,
        partyEffectiveDPR: Math.round(diffResult.analysis.partyEffectiveDPR),
        enemyHP: diffResult.enemyStats.totalHP,
        enemyEffectiveDPR: Math.round(diffResult.analysis.enemyEffectiveDPR),
        enemyCount: diffResult.enemyStats.creatureCount,
        partyCount: diffResult.partyStats.memberCount
      });
    }
    
    // Use generic scene template
    const sceneContent = SCENE_TEMPLATE
      .replace(/{{SCENE_NUMBER}}/g, scene.num.toString())
      .replace(/{{SCENE_NAME}}/g, scene.name)
      .replace(/{{ADVENTURE_NAME}}/g, adventureName)
      .replace(/{{ACT_NUMBER}}/g, scene.act.toString())
      .replace(/{{DURATION}}/g, scene.duration)
      .replace(/{{TYPE}}/g, scene.type)
      .replace(/{{DIFFICULTY}}/g, scene.difficulty)
      .replace(/{{CAMPAIGN}}/g, campaignName)
      .replace(/{{WORLD}}/g, worldName)
      .replace(/{{DATE}}/g, currentDate)
      .replace(/{{TRACKER_ENCOUNTER}}/g, trackerEncounter)
      .replace(/{{ENCOUNTER_FILE}}/g, encounterFile)
      .replace(/{{ENCOUNTER_CREATURES}}/g, encounterCreaturesJson)
      .replace(/{{ENCOUNTER_DIFFICULTY}}/g, encounterDifficultyJson)
      .replace(/{{SELECTED_PARTY_ID}}/g, this.selectedPartyId || "")
      .replace(/{{SELECTED_PARTY_MEMBERS}}/g, JSON.stringify(this.selectedPartyMembers));

    await this.app.vault.create(filePath, sceneContent);
  }

  syncEncounterBuilder() {
    this.encounterBuilder.encounterName = this.encounterName;
    this.encounterBuilder.creatures = [...this.creatures];
    this.encounterBuilder.includeParty = this.includeParty;
    this.encounterBuilder.useColorNames = this.useColorNames;
    this.encounterBuilder.selectedPartyMembers = [...this.selectedPartyMembers];
    this.encounterBuilder.selectedPartyId = this.selectedPartyId || "";
    this.encounterBuilder.adventurePath = this.adventurePath;
    this.encounterBuilder.campaignPath = this.campaignPath;
  }

  /**
   * Show/hide encounter builder section based on scene type
   */
  showEncounterBuilderIfCombat() {
    if (!this.encounterSection) return;
    
    this.encounterSection.empty();
    
    if (this.type !== "combat") {
      this.encounterSection.style.display = "none";
      return;
    }
    
    this.encounterSection.style.display = "block";
    
    // Header
    this.encounterSection.createEl("h3", { text: "⚔️ Combat Encounter" });
    
    // Toggle to create encounter
    new Setting(this.encounterSection)
      .setName("Create Initiative Tracker Encounter")
      .setDesc("Build an encounter that will be ready to use in Initiative Tracker")
      .addToggle(toggle => toggle
        .setValue(this.createEncounter)
        .onChange(value => {
          this.createEncounter = value;
          // Re-render entire section to show/hide color option
          this.showEncounterBuilderIfCombat();
        }));
    
    // Color naming option (only show when encounter creation is enabled)
    if (this.createEncounter) {
      new Setting(this.encounterSection)
        .setName("Use Color Names")
        .setDesc("Name duplicate creatures with colors (Red Goblin, Blue Goblin) instead of numbers (Goblin 1, Goblin 2)")
        .addToggle(toggle => toggle
          .setValue(this.useColorNames)
          .onChange(value => {
            this.useColorNames = value;
          }));
      
      new Setting(this.encounterSection)
        .setName("Include Party Members")
        .setDesc("Add party members to this encounter for difficulty calculation")
        .addToggle(toggle => toggle
          .setValue(this.includeParty)
          .onChange(async (value) => {
            this.includeParty = value;
            await this.renderPartySelection();
            await this.renderPartyMemberList();
            this.updateDifficultyDisplay();
          }));
      
      // Party selection container
      this.partySelectionContainer = this.encounterSection.createDiv({ cls: "dnd-party-selection" });
      this.renderPartySelection();
      
      // Party member list container
      this.partyMemberListContainer = this.encounterSection.createDiv({ cls: "dnd-party-member-list" });
      this.renderPartyMemberList();
      
      // Show the builder fields
      this.showEncounterBuilderFields();
    }
  }

  /**
   * Show encounter builder input fields
   */
  async showEncounterBuilderFields() {
    if (!this.encounterSection) return;
    
    // Remove existing builder fields
    const existingBuilder = this.encounterSection.querySelector(".dnd-encounter-builder");
    if (existingBuilder) {
      existingBuilder.remove();
    }
    
    if (!this.createEncounter) return;
    
    const builderContainer = this.encounterSection.createDiv({ cls: "dnd-encounter-builder" });
    
    // Auto-fill encounter name based on scene name
    if (!this.encounterName && this.sceneName) {
      this.encounterName = `${this.sceneName} - Encounter`;
    }
    
    // Encounter Name
    new Setting(builderContainer)
      .setName("Encounter Name")
      .setDesc("Name for this encounter in Initiative Tracker")
      .addText(text => text
        .setPlaceholder("e.g., Goblin Ambush")
        .setValue(this.encounterName)
        .onChange(value => this.encounterName = value));
    
    // Creature management section
    builderContainer.createEl("h4", { text: "Creatures" });
    
    // Creature list container
    this.creatureListContainer = builderContainer.createDiv({ cls: "dnd-creature-list" });
    this.renderCreatureList();
    
    // === VAULT CREATURE SELECTION ===
    const vaultCreatureSection = builderContainer.createDiv({ cls: "dnd-add-creature-vault" });
    
    let selectedCreature: { name: string; path: string; hp: number; ac: number; cr?: string } | null = null;
    let vaultCreatureCount = "1";
    let searchResults: HTMLElement | null = null;
    
    // Load creatures from vault
    this.syncEncounterBuilder();
    const vaultCreatures = await this.encounterBuilder.loadAllCreatures();
    
    
    if (vaultCreatures.length > 0) {
      const vaultCreatureSetting = new Setting(vaultCreatureSection)
        .setName("Add from Vault")
        .setDesc(`Search and select creatures from your vault (${vaultCreatures.length} available)`);
      
      // Create search input container
      const searchContainer = vaultCreatureSetting.controlEl.createDiv({ cls: "dnd-creature-search-container" });
      
      const searchInput = searchContainer.createEl("input", {
        type: "text",
        placeholder: "Search creatures...",
        cls: "dnd-creature-search-input"
      });
      
      // Search results container
      searchResults = searchContainer.createDiv({ cls: "dnd-creature-search-results" });
      searchResults.style.display = "none";
      
      // Filter and display results
      const showSearchResults = (query: string) => {
        if (!searchResults) {
          return;
        }
        
        if (!query || query.length < 1) {
          searchResults.style.display = "none";
          return;
        }
        
        const queryLower = query.toLowerCase().trim();
        
        const filtered = vaultCreatures.filter(c => {
          const matches = c.name.toLowerCase().includes(queryLower);
          if (queryLower.length <= 3 && matches) {
          }
          return matches;
        }).slice(0, 10); // Limit to 10 results
        
        if (filtered.length > 0) {
        }
        
        searchResults.empty();
        
        if (filtered.length === 0) {
          searchResults.createEl("div", {
            text: "No creatures found",
            cls: "dnd-creature-search-no-results"
          });
          searchResults.style.display = "block";
          return;
        }
        
        filtered.forEach(creature => {
          const resultEl = searchResults!.createDiv({ cls: "dnd-creature-search-result" });
          
          const nameEl = resultEl.createDiv({ cls: "dnd-creature-search-result-name" });
          nameEl.setText(creature.name);
          
          const statsEl = resultEl.createDiv({ cls: "dnd-creature-search-result-stats" });
          const statsParts: string[] = [];
          if (creature.cr) statsParts.push(`CR ${creature.cr}`);
          statsParts.push(`HP ${creature.hp}`);
          statsParts.push(`AC ${creature.ac}`);
          statsEl.setText(statsParts.join(" | "));
          
          resultEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedCreature = creature;
            searchInput.value = creature.name;
            if (searchResults) {
              searchResults.style.display = "none";
            }
          });
        });
        
        searchResults.style.display = "block";
      };
      
      // Search input events
      searchInput.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        showSearchResults(target.value);
      });
      
      searchInput.addEventListener("focus", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value.length >= 2) {
          showSearchResults(target.value);
        }
      });
      
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && selectedCreature) {
          e.preventDefault();
          // Trigger add button
        }
      });
      
      // Close search results when clicking outside
      searchInput.addEventListener("blur", () => {
        setTimeout(() => {
          if (searchResults) {
            searchResults.style.display = "none";
          }
        }, 250); // Increased timeout to ensure click registers
      });
      
      // Count input
      vaultCreatureSetting.addText(text => {
        text.setPlaceholder("Count")
          .setValue("1")
          .onChange(value => vaultCreatureCount = value);
        text.inputEl.type = "number";
        text.inputEl.style.width = "60px";
      });
      
      // Add button
      vaultCreatureSetting.addButton(btn => btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => {
          if (!selectedCreature) {
            new Notice("Please search and select a creature first!");
            return;
          }
          
          this.addCreature({
            name: selectedCreature.name,
            count: parseInt(vaultCreatureCount) || 1,
            hp: selectedCreature.hp,
            ac: selectedCreature.ac,
            cr: selectedCreature.cr,
            source: "vault",
            path: selectedCreature.path  // Include path for statblock plugin
          });
          
          new Notice(`Added ${vaultCreatureCount}x ${selectedCreature.name}`);
          
          // Clear search
          searchInput.value = "";
          selectedCreature = null;
        }));
    } else {
      vaultCreatureSection.createEl("p", {
        text: "⚠️ No creatures found in z_Beastiarity folder. Use manual entry below.",
        cls: "setting-item-description mod-warning"
      });
    }
    
    // === MANUAL CREATURE ENTRY ===
    const addCreatureSection = builderContainer.createDiv({ cls: "dnd-add-creature-manual" });
    
    let newCreatureName = "";
    let newCreatureCount = "1";
    let newCreatureHP = "";
    let newCreatureAC = "";
    let newCreatureCR = "";
    
    const addCreatureSetting = new Setting(addCreatureSection)
      .setName("Add Custom Creature")
      .setDesc("Enter creature details manually for custom or homebrew enemies");
    
    // Creature name input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Name (e.g., Goblin)")
        .onChange(value => newCreatureName = value);
      text.inputEl.style.width = "120px";
    });
    
    // Count input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("Count")
        .setValue("1")
        .onChange(value => newCreatureCount = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // HP input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("HP")
        .onChange(value => newCreatureHP = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // AC input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("AC")
        .onChange(value => newCreatureAC = value);
      text.inputEl.type = "number";
      text.inputEl.style.width = "60px";
    });
    
    // CR input
    addCreatureSetting.addText(text => {
      text.setPlaceholder("CR")
        .onChange(value => newCreatureCR = value);
      text.inputEl.style.width = "60px";
    });
    
    // Add button
    addCreatureSetting.addButton(btn => btn
      .setButtonText("Add")
      .setCta()
      .onClick(() => {
        if (!newCreatureName.trim()) {
          new Notice("Please enter a creature name!");
          return;
        }
        
        this.addCreature({
          name: newCreatureName.trim(),
          count: parseInt(newCreatureCount) || 1,
          hp: newCreatureHP ? parseInt(newCreatureHP) : undefined,
          ac: newCreatureAC ? parseInt(newCreatureAC) : undefined,
          cr: newCreatureCR || undefined,
          source: "manual"
        });
        
        new Notice(`Added ${newCreatureCount}x ${newCreatureName}`);
        
        // Clear inputs
        newCreatureName = "";
        newCreatureCount = "1";
        newCreatureHP = "";
        newCreatureAC = "";
        newCreatureCR = "";
        
        // Re-render to clear fields
        this.showEncounterBuilderFields();
      }));
    
    // === ENCOUNTER DIFFICULTY CALCULATOR ===
    builderContainer.createEl("h4", { text: "⚔️ Encounter Difficulty" });
    this.difficultyContainer = builderContainer.createDiv({ cls: "dnd-difficulty-container" });
    await this.updateDifficultyCalculation();
    
    // Info text
    builderContainer.createEl("p", {
      text: "💡 Tip: Select creatures from your vault or add custom enemies on the fly. You can edit stats later in Initiative Tracker.",
      cls: "setting-item-description"
    });
  }

  /**
   * Add a creature to the encounter
   */
  addCreature(creature: { name: string; count: number; hp?: number; ac?: number; cr?: string; source?: string; path?: string }) {
    this.creatures.push(creature);
    this.renderCreatureList();
  }

  /**
   * Remove a creature from the encounter
   */
  removeCreature(index: number) {
    this.creatures.splice(index, 1);
    this.renderCreatureList();
  }

  /**
   * Rename a creature by creating a copy of its vault note (and map token) under a new name.
   * Mirrors EncounterBuilderModal.renameCreature().
   */
  async renameCreature(index: number) {
    const creature = this.creatures[index];
    if (!creature) return;

    const modal = new RenameCreatureModal(this.app, creature.name, async (newName: string) => {
      try {
        const possiblePaths = ["z_Beastiarity", "My Vault/z_Beastiarity"];
        let beastiaryPath = "z_Beastiarity";
        for (const p of possiblePaths) {
          if (this.app.vault.getAbstractFileByPath(p) instanceof TFolder) {
            beastiaryPath = p;
            break;
          }
        }

        const newFilePath = `${beastiaryPath}/${newName}.md`;

        if (await this.app.vault.adapter.exists(newFilePath)) {
          new Notice(`A creature named "${newName}" already exists! Using existing file.`);
          const existingFile = this.app.vault.getAbstractFileByPath(newFilePath);
          if (existingFile instanceof TFile) {
            const cache = this.app.metadataCache.getFileCache(existingFile);
            creature.name = newName;
            creature.path = newFilePath;
            creature.source = "vault";
            if (cache?.frontmatter) {
              if (cache.frontmatter.hp) creature.hp = parseInt(cache.frontmatter.hp) || creature.hp;
              if (cache.frontmatter.ac) creature.ac = parseInt(cache.frontmatter.ac) || creature.ac;
              if (cache.frontmatter.cr) creature.cr = cache.frontmatter.cr?.toString() || creature.cr;
            }
          }
          this.renderCreatureList();
          return;
        }

        let newContent: string | null = null;
        let sourceTokenId: string | undefined;

        if (creature.path && creature.path !== "[SRD]") {
          const originalFile = this.app.vault.getAbstractFileByPath(creature.path);
          if (originalFile instanceof TFile) {
            const fileContent = await this.app.vault.read(originalFile);
            const cache = this.app.metadataCache.getFileCache(originalFile);
            sourceTokenId = cache?.frontmatter?.token_id;
            newContent = fileContent
              .replace(/^name:\s*.+$/m, `name: ${newName}`)
              .replace(/^creature:\s*.+$/m, `creature: ${newName}`);
          }
        }

        if (!newContent && creature.path === "[SRD]") {
          const statblocksPlugin = (this.app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
          let monsterData: any = null;
          if (statblocksPlugin) {
            if (statblocksPlugin.api?.getBestiaryCreatures) {
              const all = statblocksPlugin.api.getBestiaryCreatures();
              if (Array.isArray(all)) {
                monsterData = all.find((m: any) => m.name === creature.name);
              }
            }
            if (!monsterData) {
              const src = statblocksPlugin.data?.bestiary || statblocksPlugin.data?.monsters;
              if (Array.isArray(src)) {
                monsterData = src.find((m: any) => m.name === creature.name);
              }
            }
          }
          if (monsterData) {
            newContent = this.buildCreatureFileFromStatblock(newName, monsterData);
          }
        }

        if (!newContent) {
          newContent = this.buildMinimalCreatureFile(newName, creature);
        }

        const newTokenId = this.plugin.markerLibrary.generateId();
        let existingMarker: MarkerDefinition | undefined;
        if (sourceTokenId) {
          existingMarker = this.plugin.markerLibrary.getMarker(sourceTokenId);
        }
        if (!existingMarker) {
          existingMarker = this.plugin.markerLibrary.getAllMarkers().find(
            (m: MarkerDefinition) => m.name.toLowerCase() === creature.name.toLowerCase() && m.type === 'creature'
          );
        }

        const now = Date.now();
        const tokenDef: MarkerDefinition = {
          ...(existingMarker ? { ...existingMarker } : {}),
          id: newTokenId,
          name: newName,
          type: existingMarker?.type || 'creature',
          icon: existingMarker?.icon || '',
          backgroundColor: existingMarker?.backgroundColor || '#8b0000',
          borderColor: existingMarker?.borderColor || '#ffffff',
          creatureSize: existingMarker?.creatureSize || 'medium',
          createdAt: now,
          updatedAt: now
        };
        await this.plugin.markerLibrary.setMarker(tokenDef);

        if (newContent.includes("token_id:")) {
          newContent = newContent.replace(/^token_id:\s*.+$/m, `token_id: ${newTokenId}`);
        } else {
          newContent = newContent.replace(/\n---\s*\n/, `\ntoken_id: ${newTokenId}\n---\n`);
        }

        await this.app.vault.create(newFilePath, newContent);

        const originalName = creature.name;
        creature.name = newName;
        creature.path = newFilePath;
        creature.source = "vault";

        // Read stats back from the newly created file to ensure hp/ac/cr are set
        const createdFile = this.app.vault.getAbstractFileByPath(newFilePath);
        if (createdFile instanceof TFile) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const cache = this.app.metadataCache.getFileCache(createdFile);
          if (cache?.frontmatter) {
            const fm = cache.frontmatter;
            creature.hp = parseInt(fm.hp) || creature.hp;
            creature.ac = parseInt(fm.ac) || creature.ac;
            creature.cr = fm.cr?.toString() || creature.cr;
          }
        }

        this.renderCreatureList();
        new Notice(`✅ Renamed "${originalName}" → "${newName}" — creature note and map token created.`);
      } catch (error) {
        console.error("[Rename] Error renaming creature:", error);
        new Notice(`❌ Failed to rename creature: ${error}`);
      }
    });
    modal.open();
  }

  /**
   * Build a creature markdown file from Fantasy Statblocks bestiary data.
   */
  private buildCreatureFileFromStatblock(newName: string, monster: any): string {
    const stats = monster.stats || [10, 10, 10, 10, 10, 10];
    const calcMod = (score: number) => Math.floor((score - 10) / 2);

    let fm = `---\nstatblock: true\nlayout: Basic 5e Layout\nname: ${newName}\n`;
    fm += `size: ${monster.size || "Medium"}\ntype: ${monster.type || "humanoid"}\n`;
    if (monster.subtype) fm += `subtype: ${monster.subtype}\n`;
    fm += `alignment: ${monster.alignment || ""}\nac: ${monster.ac ?? 10}\nhp: ${monster.hp ?? 1}\n`;
    if (monster.hit_dice) fm += `hit_dice: ${monster.hit_dice}\n`;
    fm += `speed: ${monster.speed || "30 ft."}\nstats:\n`;
    for (const s of stats) fm += `  - ${s}\n`;
    fm += `fage_stats:\n`;
    for (const s of stats) fm += `  - ${calcMod(s)}\n`;
    if (Array.isArray(monster.saves) && monster.saves.length > 0) {
      fm += `saves:\n`;
      for (const save of monster.saves) { if (typeof save === 'object') { const key = Object.keys(save)[0]; if (key) fm += `  - ${key}: ${save[key]}\n`; } }
    } else { fm += `saves:\n`; }
    if (Array.isArray(monster.skillsaves) && monster.skillsaves.length > 0) {
      fm += `skillsaves:\n`;
      for (const skill of monster.skillsaves) { if (typeof skill === 'object') { const key = Object.keys(skill)[0]; if (key) fm += `  - ${key}: ${skill[key]}\n`; } }
    } else { fm += `skillsaves:\n`; }
    fm += `damage_vulnerabilities: ${monster.damage_vulnerabilities || ""}\ndamage_resistances: ${monster.damage_resistances || ""}\n`;
    fm += `damage_immunities: ${monster.damage_immunities || ""}\ncondition_immunities: ${monster.condition_immunities || ""}\n`;
    fm += `senses: ${monster.senses || ""}\nlanguages: ${monster.languages || ""}\ncr: ${monster.cr ?? "0"}\nspells:\n`;
    if (Array.isArray(monster.traits) && monster.traits.length > 0) {
      fm += `traits:\n`;
      for (const t of monster.traits) { if (t.name && t.desc) fm += `  - name: ${t.name}\n    desc: "${String(t.desc).replace(/"/g, '\\"')}"\n`; }
    } else { fm += `traits:\n`; }
    if (Array.isArray(monster.actions) && monster.actions.length > 0) {
      fm += `actions:\n`;
      for (const a of monster.actions) { if (a.name && a.desc) fm += `  - name: ${a.name}\n    desc: "${String(a.desc).replace(/"/g, '\\"')}"\n`; }
    } else { fm += `actions:\n`; }
    fm += `legendary_actions:\nbonus_actions:\nreactions:\ntoken_id: PLACEHOLDER\n---\n\n`;
    fm += `${newName} creature description.\n\n\`\`\`statblock\ncreature: ${newName}\n\`\`\`\n`;
    return fm;
  }

  /**
   * Build a minimal creature markdown file from encounter stats (fallback).
   */
  private buildMinimalCreatureFile(newName: string, creature: { hp?: number; ac?: number; cr?: string }): string {
    let fm = `---\nstatblock: true\nlayout: Basic 5e Layout\nname: ${newName}\n`;
    fm += `size: Medium\ntype: humanoid\nalignment: ""\nac: ${creature.ac ?? 10}\nhp: ${creature.hp ?? 1}\n`;
    fm += `speed: 30 ft.\nstats:\n  - 10\n  - 10\n  - 10\n  - 10\n  - 10\n  - 10\n`;
    fm += `fage_stats:\n  - 0\n  - 0\n  - 0\n  - 0\n  - 0\n  - 0\n`;
    fm += `saves:\nskillsaves:\ndamage_vulnerabilities: ""\ndamage_resistances: ""\n`;
    fm += `damage_immunities: ""\ncondition_immunities: ""\nsenses: ""\nlanguages: ""\n`;
    fm += `cr: ${creature.cr || "0"}\nspells:\ntraits:\nactions:\nlegendary_actions:\nbonus_actions:\nreactions:\n`;
    fm += `token_id: PLACEHOLDER\n---\n\n${newName} creature description.\n\n\`\`\`statblock\ncreature: ${newName}\n\`\`\`\n`;
    return fm;
  }

  /**
   * Render the list of creatures in the encounter
   */
  renderCreatureList() {
    if (!this.creatureListContainer) return;
    
    this.creatureListContainer.empty();
    
    if (this.creatures.length === 0) {
      this.creatureListContainer.createEl("p", {
        text: "No creatures added yet. Add creatures below.",
        cls: "setting-item-description"
      });
      return;
    }
    
    this.creatures.forEach((creature, index) => {
      const creatureItem = this.creatureListContainer!.createDiv({ 
        cls: `dnd-creature-item${creature.isFriendly ? ' friendly' : ''}` 
      });
      
      const nameEl = creatureItem.createSpan({ cls: "dnd-creature-name" });
      const friendlyIndicator = creature.isFriendly ? "🤝 " : "";
      const hiddenIndicator = creature.isHidden ? "👁️‍🗨️ " : "";
      nameEl.setText(`${friendlyIndicator}${hiddenIndicator}${creature.name} x${creature.count}`);
      
      const statsEl = creatureItem.createSpan({ cls: "dnd-creature-stats" });
      const stats: string[] = [];
      if (creature.hp) stats.push(`HP: ${creature.hp}`);
      if (creature.ac) stats.push(`AC: ${creature.ac}`);
      if (creature.cr) stats.push(`CR: ${creature.cr}`);
      if (creature.isFriendly) stats.push("🤝 Friendly");
      if (creature.isHidden) stats.push("👁️‍🗨️ Hidden");
      statsEl.setText(stats.length > 0 ? ` | ${stats.join(" | ")}` : "");
      
      // Friendly toggle button
      const friendlyBtn = creatureItem.createEl("button", {
        text: "Friendly",
        cls: `dnd-creature-friendly-toggle${creature.isFriendly ? ' active' : ''}`
      });
      friendlyBtn.addEventListener("click", () => {
        creature.isFriendly = !creature.isFriendly;
        this.renderCreatureList();
      });
      
      // Hidden toggle button
      const hiddenBtn = creatureItem.createEl("button", {
        text: "Hidden",
        cls: `dnd-creature-hidden-toggle${creature.isHidden ? ' active' : ''}`
      });
      hiddenBtn.addEventListener("click", () => {
        creature.isHidden = !creature.isHidden;
        this.renderCreatureList();
      });
      
      // Rename button — copy creature with a new name
      const renameBtn = creatureItem.createEl("button", {
        text: "✏️",
        cls: "dnd-creature-rename",
        attr: { title: "Rename (copy with new name)" }
      });
      renameBtn.addEventListener("click", () => {
        this.renameCreature(index);
      });
      
      const removeBtn = creatureItem.createEl("button", {
        text: "Remove",
        cls: "dnd-creature-remove"
      });
      removeBtn.addEventListener("click", () => {
        this.removeCreature(index);
      });
    });
    
    // Update difficulty calculation after creature list changes
    this.updateDifficultyCalculation();
  }

  /**
   * CR to combat stats mapping (D&D 5e approximations)
   * Returns: { dpr, attackBonus, ac, hp }
   */
  getCRStats(cr: string | undefined): { dpr: number; attackBonus: number; ac: number; hp: number } {
    this.syncEncounterBuilder();
    const stats = this.encounterBuilder.getCRStats(cr);
    return {
      dpr: stats.dpr,
      attackBonus: stats.attackBonus,
      ac: stats.ac,
      hp: stats.hp
    };
  }

  /**
   * Player level to combat stats mapping (D&D 5e approximations)
   * Returns: { dpr, attackBonus, ac, hp }
   */
  getLevelStats(level: number): { dpr: number; attackBonus: number; ac: number; hp: number } {
    this.syncEncounterBuilder();
    const stats = this.encounterBuilder.getLevelStats(level);
    return {
      dpr: stats.dpr,
      attackBonus: stats.attackBonus,
      ac: stats.ac,
      hp: stats.hp
    };
  }

  /**
   * Parse CR string to numeric value
   */
  parseCR(cr: string | undefined): number {
    if (!cr) return 0;
    
    const crStr = cr.toString().trim().toLowerCase();
    
    // Handle fractions
    if (crStr === "1/8") return 0.125;
    if (crStr === "1/4") return 0.25;
    if (crStr === "1/2") return 0.5;
    
    const parsed = parseFloat(crStr);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Calculate hit probability (bounded between 5% and 95%)
   */
  calculateHitChance(attackBonus: number, targetAC: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateHitChance(attackBonus, targetAC);
  }

  /**
   * Calculate expected damage per round considering hit chance
   */
  calculateEffectiveDPR(baseDPR: number, hitChance: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateEffectiveDPR(baseDPR, hitChance);
  }

  /**
   * Calculate rounds to defeat a group (HP pool / effective DPR)
   */
  calculateRoundsToDefeat(totalHP: number, effectiveDPR: number): number {
    this.syncEncounterBuilder();
    return this.encounterBuilder.calculateRoundsToDefeat(totalHP, effectiveDPR);
  }

  async renderPartySelection() {
    if (!this.partySelectionContainer) return;
    this.partySelectionContainer.empty();

    if (!this.includeParty) return;

    // Derive campaign hint from campaignPath
    const campaignHint = this.campaignPath
      ? this.campaignPath.split("/").pop() || ""
      : "";

    this.partySelector = new PartySelector({
      partyManager: this.plugin.partyManager,
      container: this.partySelectionContainer,
      campaignHint,
      initialPartyId: this.selectedPartyId,
      initialMembers: this.selectedPartyMembers,
      onChange: (partyId, partyName, members) => {
        this.selectedPartyId = partyId;
        this.selectedPartyName = partyName;
        this.selectedPartyMembers = members;
        this.renderPartyMemberList();
        this.updateDifficultyDisplay();
      },
    });
    await this.partySelector.render();
  }

  async renderPartyMemberList() {
    if (!this.partyMemberListContainer) return;
    this.partyMemberListContainer.empty();

    if (!this.includeParty || this.selectedPartyMembers.length === 0) {
      return;
    }

    try {
      const partyMembers = await this.encounterBuilder.getAvailablePartyMembers();
      const memberByName = new Map(partyMembers.map(m => [m.name, m]));

      const headerDiv = this.partyMemberListContainer.createDiv({ cls: "dnd-party-member-header" });
      headerDiv.style.marginBottom = "10px";
      headerDiv.style.fontWeight = "600";
      headerDiv.setText(`Selected Party Members (${this.selectedPartyMembers.length})`);

      for (const memberName of this.selectedPartyMembers) {
        const memberData = memberByName.get(memberName);
        if (!memberData) continue;

        const memberItem = this.partyMemberListContainer.createDiv({ cls: "dnd-creature-item" });
        
        const nameEl = memberItem.createSpan({ cls: "dnd-creature-name" });
        nameEl.setText(memberName);
        
        const statsEl = memberItem.createSpan({ cls: "dnd-creature-stats" });
        const stats: string[] = [];
        stats.push(`Level: ${memberData.level}`);
        stats.push(`HP: ${memberData.hp}`);
        stats.push(`AC: ${memberData.ac}`);
        statsEl.setText(` | ${stats.join(" | ")}`);
        
        const removeBtn = memberItem.createEl("button", {
          text: "Remove",
          cls: "dnd-creature-remove"
        });
        removeBtn.addEventListener("click", () => {
          this.removePartyMember(memberName);
        });
      }
    } catch (error) {
      console.error("Error rendering party member list:", error);
    }
  }

  removePartyMember(memberName: string) {
    this.selectedPartyMembers = this.selectedPartyMembers.filter(n => n !== memberName);
    this.renderPartySelection();
    this.renderPartyMemberList();
    this.updateDifficultyDisplay();
  }

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getAvailablePartyMembers();
  }

  /**
   * Get party members from Initiative Tracker for difficulty calculation
   */
  async getPartyForDifficulty(): Promise<Array<{ name: string; hp: number; ac: number; level: number }>> {
    this.syncEncounterBuilder();
    const members = await this.encounterBuilder.getAvailablePartyMembers();
    return members.map(member => ({
      name: member.name,
      hp: member.hp,
      ac: member.ac,
      level: member.level
    }));
  }

  /**
   * Calculate comprehensive encounter difficulty
   */
  async calculateEncounterDifficulty(): Promise<{
    enemyStats: {
      totalHP: number;
      avgAC: number;
      totalDPR: number;
      avgAttackBonus: number;
      creatureCount: number;
    };
    partyStats: {
      totalHP: number;
      avgAC: number;
      totalDPR: number;
      avgAttackBonus: number;
      memberCount: number;
      avgLevel: number;
    };
    analysis: {
      partyHitChance: number;
      enemyHitChance: number;
      partyEffectiveDPR: number;
      enemyEffectiveDPR: number;
      roundsToDefeatEnemies: number;
      roundsToDefeatParty: number;
      survivalRatio: number;
      difficulty: "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly" | "TPK Risk";
      difficultyColor: string;
      summary: string;
    };
  }> {
    // Calculate enemy stats
    let enemyTotalHP = 0;
    let enemyTotalAC = 0;
    let enemyTotalDPR = 0;
    let enemyTotalAttackBonus = 0;
    let enemyCount = 0;
    
    for (const creature of this.creatures) {
      const crStats = this.getCRStats(creature.cr);
      const count = creature.count || 1;
      
      // Use actual HP/AC if provided, otherwise use CR-based estimates
      const hp = creature.hp || crStats.hp;
      const ac = creature.ac || crStats.ac;
      
      enemyTotalHP += hp * count;
      enemyTotalAC += ac * count;
      enemyTotalDPR += crStats.dpr * count;
      enemyTotalAttackBonus += crStats.attackBonus * count;
      enemyCount += count;
    }
    
    const avgEnemyAC = enemyCount > 0 ? enemyTotalAC / enemyCount : 13;
    const avgEnemyAttackBonus = enemyCount > 0 ? enemyTotalAttackBonus / enemyCount : 3;
    
    // Get party stats
    const partyMembers = await this.getPartyForDifficulty();
    
    let partyTotalHP = 0;
    let partyTotalAC = 0;
    let partyTotalDPR = 0;
    let partyTotalAttackBonus = 0;
    let totalLevel = 0;
    
    for (const member of partyMembers) {
      const levelStats = this.getLevelStats(member.level);
      
      // Use actual HP/AC if available, otherwise use level-based estimates
      // Ensure numeric conversion to prevent string concatenation bugs
      const memberHP = Number(member.hp) || 0;
      const memberAC = Number(member.ac) || 0;
      
      partyTotalHP += memberHP > 0 ? memberHP : levelStats.hp;
      partyTotalAC += memberAC > 0 ? memberAC : levelStats.ac;
      partyTotalDPR += levelStats.dpr;
      partyTotalAttackBonus += levelStats.attackBonus;
      totalLevel += member.level;
    }
    
    const memberCount = partyMembers.length;
    
    // Calculate averages with proper fallbacks
    let avgPartyAC: number;
    let avgPartyAttackBonus: number;
    let avgLevel: number;
    
    if (memberCount > 0) {
      avgPartyAC = partyTotalAC / memberCount;
      avgPartyAttackBonus = partyTotalAttackBonus / memberCount;
      avgLevel = totalLevel / memberCount;
    } else {
      // Use defaults for a level 3 party of 4
      const defaultStats = this.getLevelStats(3);
      partyTotalHP = defaultStats.hp * 4;
      partyTotalDPR = defaultStats.dpr * 4;
      avgPartyAC = defaultStats.ac;
      avgPartyAttackBonus = defaultStats.attackBonus;
      avgLevel = 3;
    }
    
    // Calculate hit chances
    const partyHitChance = this.calculateHitChance(avgPartyAttackBonus, avgEnemyAC);
    const enemyHitChance = this.calculateHitChance(avgEnemyAttackBonus, avgPartyAC);
    
    // Calculate effective DPR (considering hit chance)
    const partyEffectiveDPR = this.calculateEffectiveDPR(partyTotalDPR, partyHitChance);
    const enemyEffectiveDPR = this.calculateEffectiveDPR(enemyTotalDPR, enemyHitChance);
    
    // Calculate rounds to defeat
    const roundsToDefeatEnemies = this.calculateRoundsToDefeat(enemyTotalHP, partyEffectiveDPR);
    const roundsToDefeatParty = this.calculateRoundsToDefeat(partyTotalHP, enemyEffectiveDPR);
    
    // Survival ratio: how many more rounds the party can survive vs enemies
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;
    
    // Determine difficulty based on survival ratio and rounds
    let difficulty: "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly" | "TPK Risk";
    let difficultyColor: string;
    
    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) {
      difficulty = "Trivial";
      difficultyColor = "#888888";
    } else if (survivalRatio >= 2.5) {
      difficulty = "Easy";
      difficultyColor = "#00aa00";
    } else if (survivalRatio >= 1.5) {
      difficulty = "Medium";
      difficultyColor = "#aaaa00";
    } else if (survivalRatio >= 1.0) {
      difficulty = "Hard";
      difficultyColor = "#ff8800";
    } else if (survivalRatio >= 0.6) {
      difficulty = "Deadly";
      difficultyColor = "#ff0000";
    } else {
      difficulty = "TPK Risk";
      difficultyColor = "#880000";
    }
    
    // Generate summary
    let summary = "";
    if (enemyCount === 0) {
      summary = "Add creatures to calculate difficulty.";
    } else if (partyMembers.length === 0) {
      summary = `⚠️ No party found. Using default 4-player party (Level 3).\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
    } else {
      summary = `Party of ${memberCount} (Avg Lvl ${avgLevel.toFixed(1)}) vs ${enemyCount} creature${enemyCount !== 1 ? 's' : ''}.\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
      
      if (difficulty === "TPK Risk") {
        summary += "\n⚠️ HIGH RISK: Party may not survive this encounter!";
      } else if (difficulty === "Deadly") {
        summary += "\n⚠️ Deadly encounter - expect possible character deaths.";
      }
    }
    
    return {
      enemyStats: {
        totalHP: enemyTotalHP,
        avgAC: avgEnemyAC,
        totalDPR: enemyTotalDPR,
        avgAttackBonus: avgEnemyAttackBonus,
        creatureCount: enemyCount
      },
      partyStats: {
        totalHP: partyTotalHP,
        avgAC: avgPartyAC,
        totalDPR: partyTotalDPR,
        avgAttackBonus: avgPartyAttackBonus,
        memberCount: memberCount,
        avgLevel: avgLevel
      },
      analysis: {
        partyHitChance,
        enemyHitChance,
        partyEffectiveDPR,
        enemyEffectiveDPR,
        roundsToDefeatEnemies,
        roundsToDefeatParty,
        survivalRatio,
        difficulty,
        difficultyColor,
        summary
      }
    };
  }

  /**
   * Update and render the difficulty calculation display
   */
  async updateDifficultyCalculation() {
    if (!this.difficultyContainer) return;
    
    this.difficultyContainer.empty();
    
    if (this.creatures.length === 0) {
      this.difficultyContainer.createEl("p", {
        text: "Add creatures to see encounter difficulty analysis.",
        cls: "setting-item-description"
      });
      return;
    }
    
    // Show loading
    const loadingEl = this.difficultyContainer.createEl("p", { text: "Calculating difficulty..." });
    
    this.syncEncounterBuilder();
    const result = await this.encounterBuilder.calculateEncounterDifficulty();
    
    loadingEl.remove();
    
    // Create difficulty display
    const difficultyCard = this.difficultyContainer.createDiv({ cls: "dnd-difficulty-card" });
    
    // Header with difficulty rating
    const header = difficultyCard.createDiv({ cls: "dnd-difficulty-header" });
    
    const difficultyBadge = header.createEl("span", {
      text: result.analysis.difficulty,
      cls: "dnd-difficulty-badge"
    });
    difficultyBadge.style.backgroundColor = result.analysis.difficultyColor;
    difficultyBadge.style.color = "#ffffff";
    difficultyBadge.style.padding = "4px 12px";
    difficultyBadge.style.borderRadius = "12px";
    difficultyBadge.style.fontWeight = "bold";
    difficultyBadge.style.fontSize = "14px";
    
    const roundsEstimate = header.createEl("span", {
      text: ` ~${result.analysis.roundsToDefeatEnemies} round${result.analysis.roundsToDefeatEnemies !== 1 ? 's' : ''}`,
      cls: "dnd-rounds-estimate"
    });
    roundsEstimate.style.marginLeft = "10px";
    roundsEstimate.style.opacity = "0.8";
    
    // Stats comparison grid
    const statsGrid = difficultyCard.createDiv({ cls: "dnd-difficulty-stats-grid" });
    statsGrid.style.display = "grid";
    statsGrid.style.gridTemplateColumns = "1fr 1fr";
    statsGrid.style.gap = "15px";
    statsGrid.style.marginTop = "15px";
    
    // Party stats
    const partyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    partyCol.createEl("h5", { text: `⚔️ Party (${result.partyStats.memberCount})` });
    const partyStats = partyCol.createDiv();
    partyStats.innerHTML = `
      <div>HP Pool: <strong>${result.partyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.partyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.partyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.partyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.partyEffectiveDPR.toFixed(0)}</strong></div>
    `;
    
    // Enemy stats
    const enemyCol = statsGrid.createDiv({ cls: "dnd-stats-column" });
    enemyCol.createEl("h5", { text: `👹 Enemies (${result.enemyStats.creatureCount})` });
    const enemyStats = enemyCol.createDiv();
    enemyStats.innerHTML = `
      <div>HP Pool: <strong>${result.enemyStats.totalHP}</strong></div>
      <div>Avg AC: <strong>${result.enemyStats.avgAC.toFixed(0)}</strong></div>
      <div>Total DPR: <strong>${result.enemyStats.totalDPR.toFixed(0)}</strong></div>
      <div>Hit Chance: <strong>${(result.analysis.enemyHitChance * 100).toFixed(0)}%</strong></div>
      <div>Effective DPR: <strong>${result.analysis.enemyEffectiveDPR.toFixed(0)}</strong></div>
    `;
    
    // Analysis summary
    const analysisSummary = difficultyCard.createDiv({ cls: "dnd-difficulty-analysis" });
    analysisSummary.style.marginTop = "15px";
    analysisSummary.style.padding = "10px";
    analysisSummary.style.backgroundColor = "var(--background-secondary)";
    analysisSummary.style.borderRadius = "6px";
    analysisSummary.style.fontSize = "12px";
    
    // Calculate damage over 3 rounds
    const partyDamage3Rounds = result.analysis.partyEffectiveDPR * 3;
    const enemyDamage3Rounds = result.analysis.enemyEffectiveDPR * 3;
    const partyHPAfter3 = Math.max(0, result.partyStats.totalHP - enemyDamage3Rounds);
    const enemyHPAfter3 = Math.max(0, result.enemyStats.totalHP - partyDamage3Rounds);
    
    analysisSummary.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
      <div>Party deals: <strong>${partyDamage3Rounds.toFixed(0)}</strong> damage → Enemies at <strong>${enemyHPAfter3.toFixed(0)}</strong> HP (${((enemyHPAfter3 / result.enemyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div>Enemies deal: <strong>${enemyDamage3Rounds.toFixed(0)}</strong> damage → Party at <strong>${partyHPAfter3.toFixed(0)}</strong> HP (${((partyHPAfter3 / result.partyStats.totalHP) * 100).toFixed(0)}%)</div>
      <div style="margin-top: 8px; opacity: 0.8;">
        Survival Ratio: ${result.analysis.survivalRatio.toFixed(2)} 
        (Party can survive ${result.analysis.roundsToDefeatParty} rounds, enemies survive ${result.analysis.roundsToDefeatEnemies} rounds)
      </div>
    `;
    
    // Warning for no party
    if (result.partyStats.memberCount === 0 || (await this.getPartyForDifficulty()).length === 0) {
      const warningEl = difficultyCard.createDiv({ cls: "dnd-difficulty-warning" });
      warningEl.style.marginTop = "10px";
      warningEl.style.padding = "8px";
      warningEl.style.backgroundColor = "#ff880033";
      warningEl.style.borderRadius = "4px";
      warningEl.style.fontSize = "12px";
      warningEl.innerHTML = `⚠️ <strong>No party registered!</strong> Using default estimates for 4 Level-3 PCs. 
        <br>Register PCs via "Create PC" to get accurate calculations.`;
    }
  }

  /**
   * Alias for updateDifficultyCalculation to match EncounterBuilderModal interface
   */
  async updateDifficultyDisplay() {
    return this.updateDifficultyCalculation();
  }

  /**
   * Search vault for creature files in z_Beastiarity
   * Parses creature statblocks from frontmatter
   */
  async searchVaultCreatures(query: string): Promise<Array<{
    name: string;
    path: string;
    hp: number;
    ac: number;
    cr?: string;
  }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.searchVaultCreatures(query);
  }
  
  /**
   * Load all creatures from vault for dropdown
   */
  async loadAllCreatures(): Promise<Array<{
    name: string;
    path: string;
    hp: number;
    ac: number;
    cr?: string;
  }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.loadAllCreatures();
  }
  
  /**
   * Get creatures from the 5e Statblocks plugin (includes SRD monsters)
   */
  async getStatblocksPluginCreatures(): Promise<Array<{
    name: string;
    path: string;
    hp: number;
    ac: number;
    cr?: string;
  }>> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getStatblocksPluginCreatures();
  }

  /**
   * Save encounter via PartyManager and link to scene
   * Note: The encounter file is saved earlier in createSceneFile
   */
  async saveEncounterData(scenePath: string) {
    if (!this.createEncounter || this.creatures.length === 0) return;

    this.syncEncounterBuilder();
    
    await this.encounterBuilder.createEncounter(scenePath);
  }

  /**
   * Save encounter file to z_Encounters folder
   * Uses the same proven approach as EncounterBuilderModal.saveEncounter()
   */
  async saveEncounterFile() {
    if (!this.encounterName || this.creatures.length === 0) {
      return null;
    }

    if (!this.campaignPath) {
      console.error("[SceneCreation - saveEncounterFile] No campaignPath set!");
      new Notice("⚠️ Cannot save encounter: campaign path not found");
      return null;
    }

    try {
      // Use vault's root z_Encounters folder (same as EncounterBuilderModal)
      const encounterFolder = "z_Encounters";
      
      
      // Create folder if it doesn't exist
      const folderExists = this.app.vault.getAbstractFileByPath(encounterFolder);
      if (!folderExists) {
        await this.app.vault.createFolder(encounterFolder);
      }

      // Generate encounter file content (same as EncounterBuilderModal)
      this.syncEncounterBuilder();
      const diffResult = await this.encounterBuilder.calculateEncounterDifficulty();
      const encounterContent = await this.generateEncounterContent(diffResult);

      // Save encounter file
      const fileName = `${this.encounterName}.md`;
      const encounterPath = `${encounterFolder}/${fileName}`;
      

      const existingFile = this.app.vault.getAbstractFileByPath(encounterPath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, encounterContent);
      } else {
        await this.app.vault.create(encounterPath, encounterContent);
      }

      new Notice(`✅ Encounter "${this.encounterName}" saved to z_Encounters`);
      
      return encounterPath;
    } catch (error) {
      console.error("[SceneCreation - saveEncounterFile] ERROR:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      new Notice(`⚠️ Could not save encounter file: ${errorMsg}`);
      return null;
    }
  }

  escapeYamlString(str: string): string {
    if (!str) return '""';
    // Use single quotes for YAML strings - only need to escape single quotes within
    // Single quotes are safer as they don't interpret escape sequences
    if (str.includes("'")) {
      // If string contains single quotes, double them (YAML escaping for single quotes)
      return "'" + str.replace(/'/g, "''") + "'";
    }
    // If no single quotes, just wrap in single quotes
    return "'" + str + "'";
  }


  /**
   * Generate encounter file content using the EXACT same format as EncounterBuilderModal
   */
  async generateEncounterContent(diffResult: any): Promise<string> {
    const currentDate = window.moment().format("YYYY-MM-DD");

    let frontmatter = `---
type: encounter
name: ${this.escapeYamlString(this.encounterName)}
creatures:`;

    for (const creature of this.creatures) {
      frontmatter += `\n  - name: ${this.escapeYamlString(creature.name)}
    count: ${creature.count}`;
      if (creature.hp) frontmatter += `\n    hp: ${creature.hp}`;
      if (creature.ac) frontmatter += `\n    ac: ${creature.ac}`;
      if (creature.cr) frontmatter += `\n    cr: ${this.escapeYamlString(creature.cr)}`;
      if (creature.source) frontmatter += `\n    source: ${this.escapeYamlString(creature.source)}`;
      if (creature.path) frontmatter += `\n    path: ${this.escapeYamlString(creature.path)}`;
      if (creature.isFriendly) frontmatter += `\n    is_friendly: ${creature.isFriendly}`;
      if (creature.isHidden) frontmatter += `\n    is_hidden: ${creature.isHidden}`;
    }

    frontmatter += `
include_party: ${this.includeParty}
use_color_names: ${this.useColorNames}`;

    if (this.selectedPartyId) frontmatter += `\nselected_party_id: ${this.escapeYamlString(this.selectedPartyId)}`;
    if (this.selectedPartyMembers.length > 0) {
      const selectedPartyName = this.selectedPartyMembers.join(", ");
      frontmatter += `\nselected_party_name: ${this.escapeYamlString(selectedPartyName)}`;
    }

    if (this.adventurePath) frontmatter += `\nadventure_path: ${this.escapeYamlString(this.adventurePath)}`;
    if (this.campaignPath) frontmatter += `\ncampaign_path: ${this.escapeYamlString(this.campaignPath)}`;

    frontmatter += `
difficulty:
  rating: ${this.escapeYamlString(diffResult.analysis.difficulty)}
  color: ${this.escapeYamlString(diffResult.analysis.difficultyColor)}
  party_count: ${diffResult.partyStats.memberCount}
  party_avg_level: ${diffResult.partyStats.avgLevel.toFixed(1)}
  party_total_hp: ${diffResult.partyStats.totalHP}
  party_avg_ac: ${diffResult.partyStats.avgAC.toFixed(1)}
  party_total_dpr: ${diffResult.partyStats.totalDPR.toFixed(1)}
  party_hit_chance: ${(diffResult.analysis.partyHitChance * 100).toFixed(0)}
  party_effective_dpr: ${diffResult.analysis.partyEffectiveDPR.toFixed(0)}
  enemy_count: ${diffResult.enemyStats.creatureCount}
  enemy_total_hp: ${diffResult.enemyStats.totalHP}
  enemy_avg_ac: ${diffResult.enemyStats.avgAC.toFixed(1)}
  enemy_total_dpr: ${diffResult.enemyStats.totalDPR.toFixed(1)}
  enemy_hit_chance: ${(diffResult.analysis.enemyHitChance * 100).toFixed(0)}
  enemy_effective_dpr: ${diffResult.analysis.enemyEffectiveDPR.toFixed(0)}
  rounds_to_defeat: ${diffResult.analysis.roundsToDefeatEnemies}
  rounds_party_survives: ${diffResult.analysis.roundsToDefeatParty}
  survival_ratio: ${diffResult.analysis.survivalRatio.toFixed(2)}
date: ${currentDate}
---`;

    // Use EXACT same content structure as EncounterBuilderModal
    const content = `${frontmatter}

# ${this.encounterName}

\`\`\`dataviewjs
// Create action buttons
const buttonContainer = dv.el("div", "", { 
  attr: { style: "display: flex; gap: 10px; margin: 10px 0;" } 
});

// Open Combat Tracker and load encounter button
const openTrackerBtn = buttonContainer.createEl("button", { 
  text: "⚔️ Load in Combat Tracker",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px; background-color: var(--interactive-accent); color: var(--text-on-accent);" }
});
openTrackerBtn.addEventListener("click", async () => {
  app.commands.executeCommandById("dnd-campaign-hub:open-combat-tracker");
});

// Edit button
const editBtn = buttonContainer.createEl("button", { 
  text: "✏️ Edit",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
editBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:edit-encounter");
});

// Delete button  
const deleteBtn = buttonContainer.createEl("button", { 
  text: "🗑️ Delete",
  attr: { style: "padding: 8px 16px; cursor: pointer; border-radius: 4px;" }
});
deleteBtn.addEventListener("click", () => {
  app.commands.executeCommandById("dnd-campaign-hub:delete-encounter");
});
\`\`\`

---

## Difficulty Analysis

\`\`\`dataviewjs
const diff = dv.current().difficulty;
if (!diff) {
  dv.paragraph("*No difficulty data available.*");
} else {
  // Create difficulty card
  const card = dv.el("div", "", { cls: "dnd-difficulty-card" });
  
  // Header with difficulty badge and rounds
  const header = dv.el("div", "", { cls: "dnd-difficulty-header", container: card });
  const badge = dv.el("span", diff.rating, { cls: "dnd-difficulty-badge", container: header });
  badge.style.backgroundColor = diff.color;
  dv.el("span", \` ~\${diff.rounds_to_defeat} round\${diff.rounds_to_defeat !== 1 ? 's' : ''}\`, { cls: "dnd-rounds-estimate", container: header });
  
  // Stats grid
  const grid = dv.el("div", "", { cls: "dnd-difficulty-stats-grid", container: card });
  
  // Party column
  const partyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`⚔️ Party (\${diff.party_count})\`, { container: partyCol });
  const partyStats = dv.el("div", "", { container: partyCol });
  partyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.party_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.party_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.party_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.party_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.party_effective_dpr}</strong></div>
  \`;
  
  // Enemy column
  const enemyCol = dv.el("div", "", { cls: "dnd-stats-column", container: grid });
  dv.el("h5", \`👹 Enemies (\${diff.enemy_count})\`, { container: enemyCol });
  const enemyStats = dv.el("div", "", { container: enemyCol });
  enemyStats.innerHTML = \`
    <div>HP Pool: <strong>\${diff.enemy_total_hp}</strong></div>
    <div>Avg AC: <strong>\${Math.round(diff.enemy_avg_ac)}</strong></div>
    <div>Total DPR: <strong>\${Math.round(diff.enemy_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>\${diff.enemy_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>\${diff.enemy_effective_dpr}</strong></div>
  \`;
  
  // 3-round analysis
  const analysis = dv.el("div", "", { cls: "dnd-difficulty-analysis", container: card });
  const partyDamage3 = diff.party_effective_dpr * 3;
  const enemyDamage3 = diff.enemy_effective_dpr * 3;
  const partyHPAfter3 = Math.max(0, diff.party_total_hp - enemyDamage3);
  const enemyHPAfter3 = Math.max(0, diff.enemy_total_hp - partyDamage3);
  const partyHPPercent = Math.round((partyHPAfter3 / diff.party_total_hp) * 100);
  const enemyHPPercent = Math.round((enemyHPAfter3 / diff.enemy_total_hp) * 100);
  
  analysis.innerHTML = \`
    <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
    <div>Party deals: <strong>\${Math.round(partyDamage3)}</strong> damage → Enemies at <strong>\${Math.round(enemyHPAfter3)}</strong> HP (\${enemyHPPercent}%)</div>
    <div>Enemies deal: <strong>\${Math.round(enemyDamage3)}</strong> damage → Party at <strong>\${Math.round(partyHPAfter3)}</strong> HP (\${partyHPPercent}%)</div>
    <div style="margin-top: 8px; opacity: 0.8;">
      Survival Ratio: \${diff.survival_ratio}
      (Party can survive \${diff.rounds_party_survives} rounds, enemies survive \${diff.rounds_to_defeat} rounds)
    </div>
  \`;
}
\`\`\`

---

## Creatures

\`\`\`dataviewjs
const creatures = dv.current().creatures || [];

if (creatures.length === 0) {
  dv.paragraph("*No creatures in this encounter.*");
} else {
  const table = creatures.map(c => {
    return [
      c.name,
      c.count || 1,
      c.cr || "?",
      c.hp || "?",
      c.ac || "?"
    ];
  });
  
  dv.table(["Creature", "Count", "CR", "HP", "AC"], table);
}
\`\`\`

---

## GM Notes

_Add notes about tactics, environment, or special conditions here._
`;

    return content;
  }

  /**
   * Get party member creatures for the current campaign
   */
  async getCampaignPartyCreatures(): Promise<import("../party/PartyTypes").StoredEncounterCreature[]> {
    this.syncEncounterBuilder();
    return this.encounterBuilder.getCampaignPartyCreatures();
  }

  /**
   * Link encounter to scene by updating tracker_encounter frontmatter field
   */
  async linkEncounterToScene(scenePath: string) {
    this.syncEncounterBuilder();
    return this.encounterBuilder.linkEncounterToScene(scenePath);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}