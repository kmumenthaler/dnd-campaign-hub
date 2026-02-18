/**
 * Encounter Table Codeblock Renderer
 *
 * Renders a `dnd-encounter-table` codeblock as an interactive card.
 * The codeblock source is a wikilink or path to an encounter-table note.
 *
 * Usage in markdown:
 * ```dnd-encounter-table
 * [[ttrpgs/My Campaign/Encounter Tables/Forest Encounters Level 3]]
 * ```
 */

import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";

interface EncounterRow {
	roll: number;
	encounter: string;
	difficulty: string;
	xp: string;
}

export function renderEncounterTableBlock(
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	app: App,
	plugin: DndCampaignHubPlugin
) {
	// Wrap in async IIFE so we can use await
	(async () => {
		try {
			const trimmedSource = source.trim();
			let tableFile: TFile | null = null;

			if (trimmedSource) {
				let filePath = trimmedSource;
				const wikiMatch = trimmedSource.match(/^\[\[(.+?)\]\]$/);
				if (wikiMatch && wikiMatch[1]) {
					filePath = wikiMatch[1];
				}
				if (!filePath.endsWith(".md")) {
					filePath += ".md";
				}

				tableFile = app.vault.getAbstractFileByPath(filePath) as TFile;
				if (!tableFile) {
					const resolved = app.metadataCache.getFirstLinkpathDest(
						filePath.replace(".md", ""),
						ctx.sourcePath
					);
					if (resolved instanceof TFile) {
						tableFile = resolved;
					}
				}
			} else {
				tableFile = app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile;
			}

			if (!tableFile) {
				el.createEl("div", {
					text: "⚠️ Encounter table file not found",
					cls: "dnd-encounter-table-block-error",
				});
				return;
			}

			const cache = app.metadataCache.getFileCache(tableFile);
			const fm = cache?.frontmatter;

			if (!fm || fm.type !== "encounter-table") {
				el.createEl("div", {
					text: "⚠️ Not a valid encounter table note",
					cls: "dnd-encounter-table-block-error",
				});
				return;
			}

			// Parse the table rows from the note content
			const content = await app.vault.read(tableFile);
			const rows = parseEncounterTable(content);

			// Build the card
			const container = el.createDiv({ cls: "dnd-encounter-table-block" });

			// ── Header ──
			const header = container.createDiv({ cls: "dnd-encounter-table-block-header" });
			const nameLink = header.createEl("a", {
				text: `🎲 ${fm.name || tableFile.basename}`,
				cls: "dnd-encounter-table-block-name",
			});
			nameLink.addEventListener("click", (e) => {
				e.preventDefault();
				app.workspace.openLinkText(tableFile!.path, ctx.sourcePath);
			});

			// Environment badge
			if (fm.environment) {
				header.createEl("span", {
					text: fm.environment,
					cls: "dnd-encounter-table-block-env",
				});
			}

			// ── Stats row ──
			const statsRow = container.createDiv({ cls: "dnd-encounter-table-block-stats" });
			if (fm.party_level) {
				statsRow.createEl("span", {
					text: `📊 Level ${fm.party_level}`,
					cls: "dnd-encounter-stat",
				});
			}
			if (fm.party_size) {
				statsRow.createEl("span", {
					text: `👥 ${fm.party_size} PCs`,
					cls: "dnd-encounter-stat",
				});
			}
			if (fm.entries) {
				statsRow.createEl("span", {
					text: `🎯 d${fm.entries} table`,
					cls: "dnd-encounter-stat",
				});
			}

			// ── Table ──
			if (rows.length > 0) {
				const tableEl = container.createEl("table", { cls: "dnd-encounter-table-block-table" });

				const thead = tableEl.createEl("thead");
				const headerRow = thead.createEl("tr");
				headerRow.createEl("th", { text: "Roll" });
				headerRow.createEl("th", { text: "Encounter" });
				headerRow.createEl("th", { text: "Diff." });
				headerRow.createEl("th", { text: "XP" });

				const tbody = tableEl.createEl("tbody");
				for (const row of rows) {
					const tr = tbody.createEl("tr");
					tr.createEl("td", { text: row.roll.toString() });
					tr.createEl("td", { text: row.encounter });

					const diffCell = tr.createEl("td", { text: row.difficulty });
					diffCell.addClass(
						`encounter-difficulty-${row.difficulty.toLowerCase().replace(/\s+/g, "-")}`
					);

					tr.createEl("td", { text: row.xp });
				}
			}

			// ── Actions ──
			const actions = container.createDiv({ cls: "dnd-encounter-table-block-actions" });

			const rollBtn = actions.createEl("button", {
				text: "🎲 Roll Encounter",
				cls: "dnd-encounter-btn mod-cta",
			});
			rollBtn.addEventListener("click", () => {
				const entries = fm.entries || rows.length || 6;
				const roll = Math.floor(Math.random() * entries) + 1;
				const matchedRow = rows.find((r) => r.roll === roll);

				// Show result inline
				let resultEl = container.querySelector(".dnd-encounter-table-roll-result") as HTMLElement;
				if (!resultEl) {
					resultEl = container.createDiv({ cls: "dnd-encounter-table-roll-result" });
				}
				resultEl.empty();

				if (matchedRow) {
					resultEl.createEl("strong", { text: `🎲 Rolled ${roll} on d${entries}: ` });
					resultEl.createEl("span", { text: matchedRow.encounter });
					resultEl.createEl("span", {
						text: ` — ${matchedRow.difficulty}`,
						cls: `encounter-difficulty-${matchedRow.difficulty.toLowerCase().replace(/\s+/g, "-")}`,
					});
				} else {
					resultEl.createEl("strong", { text: `🎲 Rolled ${roll} on d${entries}` });
				}

				// Highlight the rolled row in the table
				const tableRows = container.querySelectorAll("tbody tr");
				tableRows.forEach((tr) => tr.removeClass("dnd-encounter-table-row-active"));
				if (matchedRow && roll - 1 < tableRows.length) {
					tableRows[roll - 1]?.addClass("dnd-encounter-table-row-active");
				}
			});

			const openBtn = actions.createEl("button", {
				text: "📄 Open Note",
				cls: "dnd-encounter-btn",
			});
			openBtn.addEventListener("click", () => {
				app.workspace.openLinkText(tableFile!.path, ctx.sourcePath);
			});
		} catch (error) {
			console.error("[EncounterTableBlock] Render error:", error);
			el.createEl("div", {
				text: "❌ Error rendering encounter table",
				cls: "dnd-encounter-table-block-error",
			});
		}
	})();
}

/**
 * Parse the markdown table rows from an encounter table note.
 * Expects: | Roll | Encounter | Difficulty | XP |
 */
function parseEncounterTable(content: string): EncounterRow[] {
	const rows: EncounterRow[] = [];
	const lines = content.split("\n");

	// Find the table header row
	let inTable = false;
	for (const line of lines) {
		const trimmed = line.trim();

		// Detect header separator (---|---|---|---)
		if (/^\|[-\s|]+\|$/.test(trimmed)) {
			inTable = true;
			continue;
		}

		// Detect header row with "Roll" — skip it
		if (trimmed.includes("| Roll |")) {
			continue;
		}

		if (inTable && trimmed.startsWith("|") && trimmed.endsWith("|")) {
			const cells = trimmed
				.split("|")
				.map((c) => c.trim())
				.filter((c) => c.length > 0);

			if (cells.length >= 4) {
				const rollNum = parseInt(cells[0] ?? "0", 10);
				if (!isNaN(rollNum) && rollNum > 0) {
					rows.push({
						roll: rollNum,
						encounter: cells[1] ?? "",
						difficulty: cells[2] ?? "",
						xp: cells[3] ?? "",
					});
				}
			}
		} else if (inTable && !trimmed.startsWith("|")) {
			// End of table
			break;
		}
	}

	return rows;
}
