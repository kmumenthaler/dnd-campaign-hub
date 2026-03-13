import { App, TFile, TFolder } from "obsidian";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FileMeta {
  file: TFile;
  fm: Record<string, any>;
}

function getFilesInFolder(app: App, folderPath: string): TFile[] {
  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (!(folder instanceof TFolder)) return [];
  const files: TFile[] = [];
  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === "md") {
      files.push(child);
    }
  }
  return files;
}

function getFilesRecursive(app: App, folderPath: string): TFile[] {
  const folder = app.vault.getAbstractFileByPath(folderPath);
  if (!(folder instanceof TFolder)) return [];
  const files: TFile[] = [];
  const walk = (f: TFolder) => {
    for (const child of f.children) {
      if (child instanceof TFile && child.extension === "md") {
        files.push(child);
      } else if (child instanceof TFolder) {
        walk(child);
      }
    }
  };
  walk(folder);
  return files;
}

function queryFolder(app: App, folderPath: string, typeFilter?: string, recursive = false): FileMeta[] {
  const files = recursive ? getFilesRecursive(app, folderPath) : getFilesInFolder(app, folderPath);
  const results: FileMeta[] = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) continue;
    if (typeFilter && fm.type !== typeFilter) continue;
    results.push({ file, fm });
  }
  return results;
}

function openNote(app: App, path: string): void {
  app.workspace.openLinkText(path, "", false);
}

function parseLink(val: any): string | null {
  if (!val || val === '""' || val === "") return null;
  if (typeof val === "string") {
    const m = val.match(/\[\[(.+?)\]\]/);
    return m ? m[1]! : val;
  }
  return val?.path || null;
}

function sceneNum(fm: Record<string, any>, fileName: string): number {
  return parseInt(fm.scene_number || fileName.match(/Scene\s+(\d+)/)?.[1] || "0");
}

const STATUS_ICON: Record<string, string> = { completed: "✅", "in-progress": "🎬", "not-started": "⬜" };
const STATUS_NEXT: Record<string, string> = { "not-started": "in-progress", "in-progress": "completed", completed: "not-started" };

// ─── View Dispatcher ────────────────────────────────────────────────────────

/**
 * Parse the code block content and dispatch to the correct view renderer.
 * Expected format: a single view identifier on the first line, optionally
 * followed by key: value config pairs.
 */
export function renderView(source: string, el: HTMLElement, app: App, sourcePath: string): void {
  const lines = source.trim().split("\n");
  const viewId = lines[0]?.trim();

  const renderers: Record<string, () => void> = {
    "scene-navigator": () => renderSceneNavigator(el, app, sourcePath),
    "adventure-scenes": () => renderAdventureScenes(el, app, sourcePath),
    "trap-elements": () => renderTrapElements(el, app, sourcePath),
    "trap-countermeasures": () => renderTrapCountermeasures(el, app, sourcePath),
    "encounter-difficulty": () => renderEncounterDifficulty(el, app, sourcePath),
    "encounter-creatures": () => renderEncounterCreatures(el, app, sourcePath),
  };

  const renderer = viewId ? renderers[viewId] : undefined;
  if (!renderer) {
    el.createEl("p", { text: `Unknown dnd-hub-view: ${viewId}`, cls: "dnd-hub-error" });
    return;
  }
  renderer();
}

// ─── Scene Navigator (Session GM template) ──────────────────────────────────

function renderSceneNavigator(el: HTMLElement, app: App, sourcePath: string): void {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return;

  const adventureLink = parseLink(fm.adventure);
  const startPath = parseLink(fm.starting_scene);
  const endPath = parseLink(fm.ending_scene);

  if (!adventureLink) {
    el.createEl("p", { text: "No adventure linked to this session.", cls: "dnd-hub-empty" });
    const createBtn = el.createEl("button", { text: "🗺️ Create Adventure", cls: "mod-cta" });
    createBtn.style.marginTop = "10px";
    createBtn.addEventListener("click", () => {
      (app as any).commands.executeCommandById("dnd-campaign-hub:create-adventure");
    });
    return;
  }

  // Find the adventure note
  const adventureFile = resolveFile(app, adventureLink);
  if (!adventureFile) {
    el.createEl("p", { text: `Adventure note not found: ${adventureLink}`, cls: "dnd-hub-empty" });
    return;
  }

  const adventureCache = app.metadataCache.getFileCache(adventureFile);
  const adventureFm = adventureCache?.frontmatter;
  const adventureName = adventureFm?.name || adventureFile.basename;
  const adventureFolder = adventureFile.parent?.path || "";
  const campaignFolder = adventureFm?.campaign || "";

  // Collect scenes from all folder structures
  const allScenes = collectScenes(app, adventureFolder, campaignFolder, adventureName);

  if (allScenes.length === 0) {
    el.createEl("p", { text: "No scenes found for this adventure. Create a scene from the adventure note.", cls: "dnd-hub-empty" });
    return;
  }

  const idxOf = (path: string | null): number => {
    if (!path) return -1;
    return allScenes.findIndex(
      (s) =>
        s.file.path === path ||
        s.file.basename === path ||
        s.file.path.endsWith("/" + path + ".md") ||
        s.file.path.endsWith("/" + path),
    );
  };
  const startIdx = idxOf(startPath);
  const endIdx = idxOf(endPath);

  // Starting scene callout
  if (startIdx >= 0) {
    const c = el.createDiv({ cls: "dnd-hub-scene-callout dnd-hub-scene-start" });
    c.createEl("strong", { text: "🎬 Session starts at: " });
    const a = c.createEl("a", { text: allScenes[startIdx]!.file.basename, cls: "internal-link" });
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openNote(app, allScenes[startIdx]!.file.path);
    });
  }

  // Ending scene callout
  if (endIdx >= 0) {
    const c = el.createDiv({ cls: "dnd-hub-scene-callout dnd-hub-scene-end" });
    c.createEl("strong", { text: "🏁 Session ended at: " });
    const a = c.createEl("a", { text: allScenes[endIdx]!.file.basename, cls: "internal-link" });
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openNote(app, allScenes[endIdx]!.file.path);
    });
  }

  // "End Session Here" button
  if (!endPath) {
    const btnRow = el.createDiv({ cls: "dnd-hub-btn-row" });
    const endBtn = btnRow.createEl("button", { text: "🏁 End Session Here", cls: "dnd-hub-btn" });
    endBtn.addEventListener("click", () => {
      (app as any).commands.executeCommandById("dnd-campaign-hub:end-session-here");
    });
  }

  // Scene list
  el.createEl("h4", { text: "Adventure Scenes" });
  for (let i = 0; i < allScenes.length; i++) {
    const scene = allScenes[i]!;
    const isStart = i === startIdx;
    const isEnd = i === endIdx;
    let currentStatus = scene.fm.status || "not-started";

    const row = el.createDiv({ cls: "dnd-hub-scene-row" + (isStart ? " dnd-hub-scene-active" : "") });

    // Status toggle button
    const togBtn = row.createEl("button", { text: STATUS_ICON[currentStatus] || "⬜", cls: "dnd-hub-scene-toggle" });
    togBtn.title = "Click to cycle: not-started → in-progress → completed";
    togBtn.addEventListener("click", async () => {
      const newStatus = STATUS_NEXT[currentStatus] || "not-started";
      const f = app.vault.getAbstractFileByPath(scene.file.path);
      if (f instanceof TFile) {
        const c = await app.vault.read(f);
        const updated = updateYamlFrontmatter(c, (fm) => ({
          ...fm,
          status: newStatus,
        }));
        await app.vault.modify(f, updated);
        currentStatus = newStatus;
        togBtn.textContent = STATUS_ICON[newStatus] || "⬜";
      }
    });

    // Scene name link
    const nameEl = row.createEl("span", { cls: "dnd-hub-scene-name" });
    const link = nameEl.createEl("a", { text: scene.file.basename, cls: "internal-link" });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openNote(app, scene.file.path);
    });

    // Meta info
    const duration = scene.fm.duration || "?";
    const sceneType = scene.fm.scene_type || "?";
    row.createEl("span", { text: ` — ${duration} | ${sceneType}`, cls: "dnd-hub-scene-meta" });

    if (isStart) row.createEl("span", { text: " 📍", attr: { title: "Session start" } });
    if (isEnd) row.createEl("span", { text: " 🏁", attr: { title: "Session end" } });
  }
}

// ─── Adventure Scenes (Adventure template) ──────────────────────────────────

function renderAdventureScenes(el: HTMLElement, app: App, sourcePath: string): void {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return;

  const adventureName = fm.name || file.basename;
  const adventureFolder = file.parent?.path || "";
  const campaignFolder = fm.campaign || "";

  const allScenes = collectScenes(app, adventureFolder, campaignFolder, adventureName);

  if (allScenes.length === 0) {
    el.createEl("p", { text: "No scenes created yet. Use the button above to create your first scene.", cls: "dnd-hub-empty" });
    return;
  }

  // Check if any scenes have act numbers
  const hasActs = allScenes.some((s) => s.fm.act);

  if (hasActs) {
    const acts: Record<number, FileMeta[]> = { 1: [], 2: [], 3: [] };
    for (const scene of allScenes) {
      const act = Number(scene.fm.act) || 1;
      if (!acts[act]) acts[act] = [];
      acts[act]!.push(scene);
    }

    const actNames: Record<number, string> = {
      1: "Act 1: Setup & Inciting Incident",
      2: "Act 2: Rising Action & Confrontation",
      3: "Act 3: Climax & Resolution",
    };

    for (const [actNum, actScenes] of Object.entries(acts)) {
      if (actScenes.length > 0) {
        el.createEl("h3", { text: actNames[Number(actNum)] || `Act ${actNum}` });
        renderSceneItems(el, app, actScenes);
      }
    }
  } else {
    renderSceneItems(el, app, allScenes);
  }
}

function renderSceneItems(container: HTMLElement, app: App, scenes: FileMeta[]): void {
  for (const scene of scenes) {
    let currentStatus = scene.fm.status || "not-started";
    const duration = scene.fm.duration || "?min";
    const type = scene.fm.scene_type || scene.fm.type || "?";
    const difficulty = scene.fm.difficulty || "?";

    const sceneDiv = container.createDiv({ cls: "dnd-hub-scene-item" });

    // Status toggle button
    const statusBtn = sceneDiv.createEl("button", { text: STATUS_ICON[currentStatus] || "⬜", cls: "dnd-hub-scene-toggle" });
    statusBtn.title = "Click to change status";
    statusBtn.addEventListener("click", async () => {
      const newStatus = STATUS_NEXT[currentStatus] || "not-started";
      const f = app.vault.getAbstractFileByPath(scene.file.path);
      if (f instanceof TFile) {
        const content = await app.vault.read(f);
        const updated = updateYamlFrontmatter(content, (fm) => ({
          ...fm,
          status: newStatus,
        }));
        await app.vault.modify(f, updated);
        currentStatus = newStatus;
        statusBtn.textContent = STATUS_ICON[newStatus] || "⬜";
      }
    });

    // Scene name link
    const nameSpan = sceneDiv.createEl("span", { cls: "dnd-hub-scene-name" });
    const link = nameSpan.createEl("a", { text: scene.file.basename, cls: "internal-link" });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openNote(app, scene.file.path);
    });

    // Meta
    sceneDiv.createEl("span", { text: ` ${duration} | ${type} | ${difficulty}`, cls: "dnd-hub-scene-meta" });
  }
}

// ─── Trap Elements (Trap template) ──────────────────────────────────────────

function renderTrapElements(el: HTMLElement, app: App, sourcePath: string): void {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return;

  const elements: any[] = fm.elements || [];
  const trapType = fm.trap_type || "simple";

  if (elements.length === 0) {
    el.createEl("p", {
      text: "No trap elements defined. Add elements to the elements frontmatter field.",
      cls: "dnd-hub-empty",
    });
    return;
  }

  if (trapType === "simple") {
    for (const element of elements) {
      el.createEl("h4", { text: element.name || "Effect" });
      if (element.attack_bonus !== undefined) el.createEl("p", { text: `Attack: +${element.attack_bonus} to hit` });
      if (element.save_dc !== undefined) el.createEl("p", { text: `Save: DC ${element.save_dc} ${element.save_ability || "DEX"}` });
      if (element.damage) el.createEl("p", { text: `Damage: ${element.damage}` });
      if (element.effect) el.createEl("p", { text: `Effect: ${element.effect}` });
    }
  } else {
    // Complex trap — organize by initiative
    const byInitiative = new Map<number, any[]>();
    const constant: any[] = [];
    const dynamic: any[] = [];

    for (const element of elements) {
      if (element.element_type === "constant") {
        constant.push(element);
      } else if (element.element_type === "dynamic") {
        dynamic.push(element);
      } else if (element.initiative !== undefined) {
        const init = Number(element.initiative);
        if (!byInitiative.has(init)) byInitiative.set(init, []);
        byInitiative.get(init)!.push(element);
      }
    }

    if (byInitiative.size > 0) {
      el.createEl("h3", { text: "Initiative Actions" });
      const sortedInit = Array.from(byInitiative.keys()).sort((a, b) => b - a);
      for (const init of sortedInit) {
        el.createEl("h4", { text: `Initiative ${init}` });
        for (const element of byInitiative.get(init)!) {
          el.createEl("p").createEl("strong", { text: element.name || "Effect" });
          if (element.attack_bonus !== undefined) el.createEl("p", { text: `  Attack: +${element.attack_bonus} to hit` });
          if (element.save_dc !== undefined) el.createEl("p", { text: `  Save: DC ${element.save_dc} ${element.save_ability || "DEX"}` });
          if (element.damage) el.createEl("p", { text: `  Damage: ${element.damage}` });
          if (element.effect) el.createEl("p", { text: `  Effect: ${element.effect}` });
        }
      }
    }

    if (dynamic.length > 0) {
      el.createEl("h3", { text: "Dynamic Elements" });
      for (const element of dynamic) {
        el.createEl("p").createEl("strong", { text: element.name || "Dynamic Effect" });
        if (element.condition) el.createEl("p", { text: `  Condition: ${element.condition}` });
        if (element.effect) el.createEl("p", { text: `  Effect: ${element.effect}` });
      }
    }

    if (constant.length > 0) {
      el.createEl("h3", { text: "Constant Effects" });
      for (const element of constant) {
        el.createEl("p").createEl("strong", { text: element.name || "Constant Effect" });
        if (element.effect) el.createEl("p", { text: `  ${element.effect}` });
      }
    }
  }
}

// ─── Trap Countermeasures (Trap template) ───────────────────────────────────

function renderTrapCountermeasures(el: HTMLElement, app: App, sourcePath: string): void {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return;

  const countermeasures: any[] = fm.countermeasures || [];

  if (countermeasures.length === 0) {
    el.createEl("p", {
      text: "No countermeasures defined. Add countermeasures to the countermeasures frontmatter field.",
      cls: "dnd-hub-empty",
    });
    return;
  }

  for (const cm of countermeasures) {
    el.createEl("h4", { text: cm.method || "Countermeasure" });
    if (cm.dc !== undefined) el.createEl("p", { text: `DC: ${cm.dc}` });
    if (cm.checks_needed !== undefined && cm.checks_needed > 1) el.createEl("p", { text: `Checks Needed: ${cm.checks_needed}` });
    if (cm.description) el.createEl("p", { text: `Description: ${cm.description}` });
    if (cm.effect) el.createEl("p", { text: `Effect on Success: ${cm.effect}` });
  }
}

// ─── Encounter Difficulty Card ──────────────────────────────────────────────

function renderEncounterDifficulty(el: HTMLElement, app: App, sourcePath: string): void {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return;

  const diff = fm.difficulty;
  if (!diff) {
    el.createEl("p", { text: "No difficulty data available.", cls: "dnd-hub-empty" });
    return;
  }

  const card = el.createDiv({ cls: "dnd-difficulty-card" });

  // Header with difficulty badge and rounds
  const header = card.createDiv({ cls: "dnd-difficulty-header" });
  const badge = header.createEl("span", { text: diff.rating, cls: "dnd-difficulty-badge" });
  badge.style.backgroundColor = diff.color;
  header.createEl("span", {
    text: ` ~${diff.rounds_to_defeat} round${diff.rounds_to_defeat !== 1 ? "s" : ""}`,
    cls: "dnd-rounds-estimate",
  });

  // Stats grid
  const grid = card.createDiv({ cls: "dnd-difficulty-stats-grid" });

  // Party column
  const partyCol = grid.createDiv({ cls: "dnd-stats-column" });
  partyCol.createEl("h5", { text: `⚔️ Party (${diff.party_count})` });
  const partyStats = partyCol.createDiv();
  partyStats.innerHTML = `
    <div>HP Pool: <strong>${diff.party_total_hp}</strong></div>
    <div>Avg AC: <strong>${Math.round(diff.party_avg_ac)}</strong></div>
    <div>Total DPR: <strong>${Math.round(diff.party_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>${diff.party_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>${diff.party_effective_dpr}</strong></div>
  `;

  // Enemy column
  const enemyCol = grid.createDiv({ cls: "dnd-stats-column" });
  enemyCol.createEl("h5", { text: `👹 Enemies (${diff.enemy_count})` });
  const enemyStats = enemyCol.createDiv();
  enemyStats.innerHTML = `
    <div>HP Pool: <strong>${diff.enemy_total_hp}</strong></div>
    <div>Avg AC: <strong>${Math.round(diff.enemy_avg_ac)}</strong></div>
    <div>Total DPR: <strong>${Math.round(diff.enemy_total_dpr)}</strong></div>
    <div>Hit Chance: <strong>${diff.enemy_hit_chance}%</strong></div>
    <div>Effective DPR: <strong>${diff.enemy_effective_dpr}</strong></div>
  `;

  // 3-round analysis
  const analysis = card.createDiv({ cls: "dnd-difficulty-analysis" });
  const partyDamage3 = diff.party_effective_dpr * 3;
  const enemyDamage3 = diff.enemy_effective_dpr * 3;
  const partyHPAfter3 = Math.max(0, diff.party_total_hp - enemyDamage3);
  const enemyHPAfter3 = Math.max(0, diff.enemy_total_hp - partyDamage3);
  const partyHPPercent = Math.round((partyHPAfter3 / diff.party_total_hp) * 100);
  const enemyHPPercent = Math.round((enemyHPAfter3 / diff.enemy_total_hp) * 100);

  analysis.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>📊 3-Round Analysis:</strong></div>
    <div>Party deals: <strong>${Math.round(partyDamage3)}</strong> damage → Enemies at <strong>${Math.round(enemyHPAfter3)}</strong> HP (${enemyHPPercent}%)</div>
    <div>Enemies deal: <strong>${Math.round(enemyDamage3)}</strong> damage → Party at <strong>${Math.round(partyHPAfter3)}</strong> HP (${partyHPPercent}%)</div>
    <div style="margin-top: 8px; opacity: 0.8;">
      Survival Ratio: ${diff.survival_ratio}
      (Party can survive ${diff.rounds_party_survives} rounds, enemies survive ${diff.rounds_to_defeat} rounds)
    </div>
  `;
}

// ─── Encounter Creatures Table ──────────────────────────────────────────────

function renderEncounterCreatures(el: HTMLElement, app: App, sourcePath: string): void {
  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  if (!fm) return;

  const creatures: any[] = fm.creatures || [];

  if (creatures.length === 0) {
    el.createEl("p", { text: "No creatures in this encounter.", cls: "dnd-hub-empty" });
    return;
  }

  const table = el.createEl("table", { cls: "dnd-hub-table" });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const h of ["Creature", "Count", "CR", "HP", "AC"]) {
    headerRow.createEl("th", { text: h });
  }

  const tbody = table.createEl("tbody");
  for (const c of creatures) {
    const row = tbody.createEl("tr");
    row.createEl("td", { text: c.name || "?" });
    row.createEl("td", { text: String(c.count || 1) });
    row.createEl("td", { text: String(c.cr || "?") });
    row.createEl("td", { text: String(c.hp || "?") });
    row.createEl("td", { text: String(c.ac || "?") });
  }
}

// ─── Shared: Collect Scenes ─────────────────────────────────────────────────

function collectScenes(app: App, adventureFolder: string, campaignFolder: string, adventureName: string): FileMeta[] {
  const scenePaths = new Set<string>();
  const raw: FileMeta[] = [];

  const addFrom = (folder: string, filter?: (fm: Record<string, any>, file: TFile) => boolean) => {
    const files = getFilesRecursive(app, folder);
    for (const file of files) {
      if (scenePaths.has(file.path)) continue;
      const cache = app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm) continue;
      if (filter && !filter(fm, file)) continue;
      scenePaths.add(file.path);
      raw.push({ file, fm });
    }
  };

  // New structure: Adventures/AdventureName/Scenes/
  addFrom(`${adventureFolder}/Scenes`, (fm) => fm.type === "scene");

  // Legacy flat structure: Adventures/AdventureName - Scenes/
  if (campaignFolder) {
    addFrom(`${campaignFolder}/Adventures/${adventureName} - Scenes`, (_fm, file) => file.basename.startsWith("Scene"));
  }

  // Scenes directly in adventure folder
  addFrom(adventureFolder, (fm) => fm.type === "scene");

  // Sort by scene number
  raw.sort((a, b) => sceneNum(a.fm, a.file.basename) - sceneNum(b.fm, b.file.basename));
  return raw;
}

function resolveFile(app: App, linkTarget: string): TFile | null {
  // Try direct path first
  let file = app.vault.getAbstractFileByPath(linkTarget);
  if (file instanceof TFile) return file;

  // Try with .md extension
  file = app.vault.getAbstractFileByPath(linkTarget + ".md");
  if (file instanceof TFile) return file;

  // Search by basename
  const allFiles = app.vault.getMarkdownFiles();
  return allFiles.find((f) => f.basename === linkTarget || f.path === linkTarget) || null;
}
