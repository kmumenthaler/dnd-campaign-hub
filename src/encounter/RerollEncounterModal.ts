/**
 * Reroll Encounter Table Entry Modal
 *
 * Opens on an encounter-table note and lets the user reroll individual
 * entries that don't fit the scenario. The modal shows each row from the
 * table with a "Reroll" button. When clicked, the generator produces a
 * new encounter for that slot (excluding the current monster to guarantee
 * variety) and updates both the markdown table row and the encounter
 * detail section in the note.
 */

import { App, ButtonComponent, Modal, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { SRDApiClient } from "./SRDApiClient";
import {
	EncounterGenerator,
	EncounterTableEntry,
	EncounterDifficulty,
} from "./EncounterGenerator";

// ─── Parsed row from the markdown table ───────────────────────────────────

interface ParsedRow {
	roll: number;
	encounterText: string;
	difficulty: string;
	xp: string;
	/** SRD index names extracted from the encounter text (for exclusion) */
	monsterNames: string[];
}

// ─── Modal ────────────────────────────────────────────────────────────────

export class RerollEncounterModal extends Modal {
	private plugin: DndCampaignHubPlugin;
	private file: TFile;
	private apiClient: SRDApiClient;
	private generator: EncounterGenerator;

	private rows: ParsedRow[] = [];
	private environment = "";
	private partyLevel = 3;
	private partySize = 4;
	private entries = 6;

	private listContainer: HTMLElement | null = null;

	constructor(app: App, plugin: DndCampaignHubPlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.apiClient = new SRDApiClient();
		this.generator = new EncounterGenerator(this.apiClient, plugin.encounterBuilder);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("dnd-reroll-encounter-modal");

		contentEl.createEl("h2", { text: "🔄 Reroll Encounter Table Entries" });

		// Read frontmatter
		const cache = this.app.metadataCache.getFileCache(this.file);
		const fm = cache?.frontmatter;

		if (!fm || fm.type !== "encounter-table") {
			contentEl.createEl("p", { text: "⚠️ This is not a valid encounter table note." });
			return;
		}

		this.environment = fm.environment || "";
		this.partyLevel = fm.party_level || 3;
		this.partySize = fm.party_size || 4;
		this.entries = fm.entries || 6;

		contentEl.createDiv({ cls: "reroll-info" }).createEl("p", {
			text: `Environment: ${this.environment} | Party Level: ${this.partyLevel} | Party Size: ${this.partySize} | d${this.entries} table`,
		});

		// Parse existing table from note
		const content = await this.app.vault.read(this.file);
		this.rows = this.parseTableRows(content);

		if (this.rows.length === 0) {
			contentEl.createEl("p", { text: "⚠️ No encounter table rows found in this note." });
			return;
		}

		contentEl.createEl("p", {
			text: "Click 🔄 on any entry to reroll it with a different encounter.",
			cls: "reroll-hint",
		});

		// Build list
		this.listContainer = contentEl.createDiv({ cls: "reroll-entry-list" });
		this.renderEntryList();

		// Close button
		const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
		const closeBtn = btnRow.createEl("button", { text: "Done" });
		closeBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}

	// ── Render ──────────────────────────────────────────────────────────

	private renderEntryList() {
		if (!this.listContainer) return;
		this.listContainer.empty();

		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i]!;
			const item = this.listContainer.createDiv({ cls: "reroll-entry-item" });

			// Roll number
			item.createEl("span", {
				text: `${row.roll}.`,
				cls: "reroll-entry-roll",
			});

			// Encounter text
			const info = item.createDiv({ cls: "reroll-entry-info" });
			info.createEl("span", {
				text: row.encounterText,
				cls: "reroll-entry-encounter",
			});
			const meta = info.createDiv({ cls: "reroll-entry-meta" });
			const diffSpan = meta.createEl("span", { text: row.difficulty });
			diffSpan.addClass(
				`encounter-difficulty-${row.difficulty.toLowerCase().replace(/\s+/g, "-")}`
			);
			meta.createEl("span", { text: ` · ${row.xp} XP` });

			// Reroll button
			const btnContainer = item.createDiv({ cls: "reroll-entry-actions" });
			let rerollBtnComponent: ButtonComponent | null = null;
			new ButtonComponent(btnContainer)
				.setButtonText("🔄 Reroll")
				.onClick(async () => {
					await this.rerollEntry(i, btnContainer);
				})
				.then((btn) => {
					rerollBtnComponent = btn;
				});
		}
	}

	// ── Reroll logic ────────────────────────────────────────────────────

	private async rerollEntry(index: number, btnContainer: HTMLElement) {
		const row = this.rows[index];
		if (!row) return;

		// Disable the button during generation
		const button = btnContainer.querySelector("button");
		if (button) {
			button.disabled = true;
			button.textContent = "⏳…";
		}

		try {
			// Generate a single replacement, excluding current monsters
			const excludeIndices = this.guessMonsterIndices(row.monsterNames);
			const newEntry = await this.generator.generateSingleEntry(
				{
					environmentId: this.environment,
					partyLevel: this.partyLevel,
					partySize: this.partySize,
				},
				row.roll,
				excludeIndices,
				(row.difficulty as EncounterDifficulty) || "Medium",
			);

			if (!newEntry) {
				new Notice("⚠️ Could not generate a replacement. No monsters available for this environment/level.");
				return;
			}

			// Update the note content
			await this.updateNoteContent(row, newEntry);

			// Update local state
			const newEncounterText = newEntry.monsters
				.map((m) => `${m.count}× ${m.name} (CR ${m.cr})`)
				.join(", ");

			this.rows[index] = {
				roll: row.roll,
				encounterText: newEncounterText,
				difficulty: newEntry.difficulty,
				xp: newEntry.totalXP.toLocaleString(),
				monsterNames: newEntry.monsters.map((m) => m.name),
			};

			// Re-render list
			this.renderEntryList();
			new Notice(`✅ Rerolled entry ${row.roll}: ${newEncounterText}`);
		} catch (error) {
			console.error("[RerollEncounter] Error:", error);
			new Notice("❌ Error rerolling encounter. Check console for details.");
		} finally {
			if (button) {
				button.disabled = false;
				button.textContent = "🔄 Reroll";
			}
		}
	}

	// ── Note update ─────────────────────────────────────────────────────

	private async updateNoteContent(oldRow: ParsedRow, newEntry: EncounterTableEntry) {
		let content = await this.app.vault.read(this.file);

		// 1. Replace the table row
		const newEncounterText = newEntry.monsters
			.map((m) => `${m.count}× ${m.name} (CR ${m.cr})`)
			.join(", ");
		const newXP = newEntry.totalXP.toLocaleString();

		// Match the old row: | roll | encounter | difficulty | xp |
		const oldRowRegex = new RegExp(
			`^\\|\\s*${oldRow.roll}\\s*\\|[^|]+\\|[^|]+\\|[^|]+\\|`,
			"m"
		);
		const newRowText = `| ${oldRow.roll} | ${newEncounterText} | ${newEntry.difficulty} | ${newXP} |`;
		content = content.replace(oldRowRegex, newRowText);

		// 2. Replace the detail section for this entry
		// Section header: ### N. Monster Names
		const sectionHeaderRegex = new RegExp(
			`### ${oldRow.roll}\\.\\s+.+?\\n([\\s\\S]*?)(?=### \\d+\\.|## |$)`,
		);
		const sectionMatch = content.match(sectionHeaderRegex);

		if (sectionMatch) {
			const newTitle = newEntry.monsters.map((m) => m.name).join(" & ");
			const newSection = this.buildDetailSection(oldRow.roll, newTitle, newEntry);
			content = content.replace(sectionHeaderRegex, newSection);
		}

		await this.app.vault.modify(this.file, content);
	}

	private buildDetailSection(
		roll: number,
		title: string,
		entry: EncounterTableEntry,
	): string {
		const lines: string[] = [];
		lines.push(`### ${roll}. ${title}`);
		lines.push("");
		lines.push(
			`**Difficulty:** ${entry.difficulty} | **Total XP:** ${entry.totalXP.toLocaleString()}`
		);
		lines.push("");
		lines.push("**Monsters:**");
		for (const m of entry.monsters) {
			lines.push(
				`- ${m.count}× **${m.name}** — CR ${m.cr} (${m.xpEach.toLocaleString()} XP each)`
			);
		}
		lines.push("");
		lines.push("**Tactics:**");
		lines.push("*Add tactical notes here*");
		lines.push("");
		return lines.join("\n");
	}

	// ── Parsing ─────────────────────────────────────────────────────────

	private parseTableRows(content: string): ParsedRow[] {
		const rows: ParsedRow[] = [];
		const lines = content.split("\n");
		let inTable = false;

		for (const line of lines) {
			const trimmed = line.trim();

			// Detect header separator
			if (/^\|[-\s|]+\|$/.test(trimmed)) {
				inTable = true;
				continue;
			}
			// Skip header row
			if (trimmed.includes("| Roll |")) continue;

			if (inTable && trimmed.startsWith("|") && trimmed.endsWith("|")) {
				const cells = trimmed
					.split("|")
					.map((c) => c.trim())
					.filter((c) => c.length > 0);

				if (cells.length >= 4) {
					const rollNum = parseInt(cells[0] ?? "0", 10);
					if (!isNaN(rollNum) && rollNum > 0) {
						const encounterText = cells[1] ?? "";
						// Extract monster names from patterns like "2× Goblin (CR 1/4)"
						const monsterNames: string[] = [];
						const monsterPattern = /\d+×\s+(.+?)\s+\(CR/g;
						let nameMatch;
						while ((nameMatch = monsterPattern.exec(encounterText)) !== null) {
							if (nameMatch[1]) monsterNames.push(nameMatch[1]);
						}

						rows.push({
							roll: rollNum,
							encounterText,
							difficulty: cells[2] ?? "",
							xp: cells[3] ?? "",
							monsterNames,
						});
					}
				}
			} else if (inTable && !trimmed.startsWith("|")) {
				break;
			}
		}

		return rows;
	}

	/**
	 * Convert display names to approximate SRD index format for exclusion.
	 * E.g. "Killer Whale" → "killer-whale"
	 */
	private guessMonsterIndices(names: string[]): string[] {
		return names.map((n) =>
			n.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
		);
	}
}
