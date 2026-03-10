import { App, TFile, TFolder } from "obsidian";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ColumnDef {
  header: string;
  render: (fm: Record<string, any>, file: TFile) => string | Node;
}

interface TableConfig {
  columns: ColumnDef[];
  sort: (a: FileResult, b: FileResult) => number;
}

interface FileResult {
  file: TFile;
  fm: Record<string, any>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function queryFiles(app: App, source: string, typeFilter: string, recursive = false): FileResult[] {
  const files = recursive ? getFilesRecursive(app, source) : getFilesInFolder(app, source);
  const results: FileResult[] = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) continue;
    if (typeFilter && !matchesType(fm.type, typeFilter)) continue;
    results.push({ file, fm });
  }
  return results;
}

function matchesType(actual: string | undefined, filter: string): boolean {
  if (!actual) return false;
  if (filter.startsWith("contains:")) {
    return actual.includes(filter.slice("contains:".length));
  }
  return actual === filter;
}

function fileLink(el: HTMLElement, file: TFile, displayName: string, app: App): HTMLAnchorElement {
  const a = el.createEl("a", {
    text: displayName,
    cls: "internal-link",
    href: file.path,
  });
  a.addEventListener("click", (e) => {
    e.preventDefault();
    app.workspace.openLinkText(file.path, "", false);
  });
  return a;
}

function val(fm: Record<string, any>, key: string, fallback = "—"): string {
  const v = fm[key];
  if (v === undefined || v === null || v === "") return fallback;
  return String(v);
}

function num(fm: Record<string, any>, key: string, fallback = 0): number {
  const v = fm[key];
  if (v === undefined || v === null || v === "") return fallback;
  return Number(v) || fallback;
}

// ─── Column Definitions per Entity Type ─────────────────────────────────────

function playerTableConfig(app: App): TableConfig {
  return {
    columns: [
      {
        header: "Name",
        render: (fm, file) => {
          const span = document.createElement("span");
          fileLink(span, file, fm.name || file.basename, app);
          return span;
        },
      },
      {
        header: "Class",
        render: (fm) => {
          const cls = val(fm, "class", "—");
          const sub = fm.subclass ? ` (${fm.subclass})` : "";
          return cls + sub;
        },
      },
      { header: "Level", render: (fm) => val(fm, "level", "—") },
      { header: "AC", render: (fm) => val(fm, "ac", "—") },
      {
        header: "HP",
        render: (fm) => {
          const hp = val(fm, "hp", "?");
          const max = val(fm, "hp_max", "?");
          const thp = num(fm, "thp");
          let s = `${hp}/${max}`;
          if (thp > 0) s += ` (+${thp} THP)`;
          return s;
        },
      },
      { header: "Initiative", render: (fm) => String(num(fm, "init_bonus")) },
      { header: "Speed", render: (fm) => String(num(fm, "speed", 30)) },
      { header: "PP", render: (fm) => val(fm, "passive_perception", "?") },
      {
        header: "D&D Beyond",
        render: (fm) => {
          if (!fm.readonlyUrl) return "—";
          const span = document.createElement("span");
          span.createEl("a", {
            text: "DDB",
            href: fm.readonlyUrl,
            cls: "external-link",
          });
          return span;
        },
      },
    ],
    sort: (a, b) => (a.fm.name || a.file.basename).localeCompare(b.fm.name || b.file.basename),
  };
}

function npcTableConfig(app: App): TableConfig {
  return {
    columns: [
      {
        header: "Name",
        render: (fm, file) => {
          const span = document.createElement("span");
          fileLink(span, file, fm.name || file.basename, app);
          return span;
        },
      },
      { header: "Race", render: (fm) => val(fm, "race") },
      { header: "Location", render: (fm) => val(fm, "location") },
      { header: "Faction", render: (fm) => val(fm, "faction") },
      { header: "Wants", render: (fm) => val(fm, "motivation") },
    ],
    sort: (a, b) => (a.fm.name || a.file.basename).localeCompare(b.fm.name || b.file.basename),
  };
}

function sessionTableConfig(app: App): TableConfig {
  return {
    columns: [
      {
        header: "Session",
        render: (fm, file) => {
          const span = document.createElement("span");
          fileLink(span, file, fm.name || file.basename, app);
          return span;
        },
      },
      { header: "Summary", render: (fm) => val(fm, "summary", "") },
    ],
    sort: (a, b) => num(a.fm, "sessionNum") - num(b.fm, "sessionNum"),
  };
}

function factionTableConfig(app: App): TableConfig {
  return {
    columns: [
      {
        header: "Name",
        render: (fm, file) => {
          const span = document.createElement("span");
          fileLink(span, file, fm.name || file.basename, app);
          return span;
        },
      },
      { header: "Main Goal", render: (fm) => val(fm, "main_goal") },
      { header: "Size", render: (fm) => val(fm, "size") },
      { header: "Reputation", render: (fm) => val(fm, "reputation") },
    ],
    sort: (a, b) => (a.fm.name || a.file.basename).localeCompare(b.fm.name || b.file.basename),
  };
}

function adventureTableConfig(app: App): TableConfig {
  return {
    columns: [
      {
        header: "Name",
        render: (fm, file) => {
          const span = document.createElement("span");
          fileLink(span, file, fm.name || file.basename, app);
          return span;
        },
      },
      { header: "Level", render: (fm) => val(fm, "level_range") },
      { header: "Status", render: (fm) => val(fm, "status") },
      {
        header: "Act",
        render: (fm) => {
          const act = val(fm, "current_act", "?");
          return `${act}/3`;
        },
      },
      {
        header: "Sessions",
        render: (fm) => {
          const sessions = fm.sessions;
          if (Array.isArray(sessions)) return String(sessions.length);
          return "0";
        },
      },
    ],
    sort: (a, b) => (b.file.stat.ctime ?? 0) - (a.file.stat.ctime ?? 0),
  };
}

// ─── Config Lookup ──────────────────────────────────────────────────────────

const CONFIG_MAP: Record<string, (app: App) => TableConfig> = {
  player: playerTableConfig,
  npc: npcTableConfig,
  session: sessionTableConfig,
  faction: factionTableConfig,
  adventure: adventureTableConfig,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse the code block content for a dnd-hub-table block.
 * Expected format (key: value pairs):
 *   source: ttrpgs/CampaignName/PCs
 *   type: player
 */
function parseConfig(source: string): { folder: string; type: string; recursive?: boolean } | null {
  const lines = source.trim().split("\n");
  const config: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    config[key] = value;
  }
  if (!config["source"] || !config["type"]) return null;
  return {
    folder: config["source"],
    type: config["type"],
    recursive: config["recursive"] === "true",
  };
}

/**
 * Render an entity table into the given container element.
 * Called by the `dnd-hub-table` code block processor.
 */
export function renderEntityTable(source: string, el: HTMLElement, app: App): void {
  const config = parseConfig(source);
  if (!config) {
    el.createEl("p", { text: "Invalid dnd-hub-table configuration. Expected source and type.", cls: "dnd-hub-error" });
    return;
  }

  const tableConfigFn = CONFIG_MAP[config.type];
  if (!tableConfigFn) {
    el.createEl("p", { text: `Unknown table type: ${config.type}`, cls: "dnd-hub-error" });
    return;
  }

  const tableConfig = tableConfigFn(app);
  const typeFilter = config.type === "session" ? "contains:session" : config.type;
  const results = queryFiles(app, config.folder, typeFilter, config.recursive);
  results.sort(tableConfig.sort);

  if (results.length === 0) {
    el.createEl("p", { text: "No entries found.", cls: "dnd-hub-empty" });
    return;
  }

  const table = el.createEl("table", { cls: "dnd-hub-table" });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const col of tableConfig.columns) {
    headerRow.createEl("th", { text: col.header });
  }

  const tbody = table.createEl("tbody");
  for (const result of results) {
    const row = tbody.createEl("tr");
    for (const col of tableConfig.columns) {
      const td = row.createEl("td");
      const rendered = col.render(result.fm, result.file);
      if (typeof rendered === "string") {
        td.textContent = rendered;
      } else {
        td.appendChild(rendered);
      }
    }
  }
}
