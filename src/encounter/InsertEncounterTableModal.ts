/**
 * Insert Encounter Table Modal
 *
 * A modal that lets the user either:
 *  1. Select an existing encounter-table note to insert as a codeblock, or
 *  2. Create a new one via RandomEncounterTableModal
 *
 * On selection, inserts:
 * ```dnd-encounter-table
 * [[path/to/encounter-table]]
 * ```
 */

import { App, Modal, Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

interface EncounterTableEntry {
	file: TFile;
	name: string;
	environment: string;
	partyLevel: number;
	entries: number;
}

export class InsertEncounterTableModal extends Modal {
	private plugin: DndCampaignHubPlugin;
	private onSelect: (codeblock: string) => void;
	private availableTables: EncounterTableEntry[] = [];
	private filteredTables: EncounterTableEntry[] = [];
	private listContainer: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: DndCampaignHubPlugin,
		onSelect: (codeblock: string) => void
	) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("dnd-insert-encounter-table-modal");

		contentEl.createEl("h2", { text: "🎲 Insert Encounter Table" });

		// Search bar
		const searchContainer = contentEl.createDiv({ cls: "encounter-table-search" });
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search encounter tables…",
			cls: "encounter-table-search-input",
		});
		searchInput.addEventListener("input", () => {
			this.filterTables(searchInput.value);
		});

		// Loading spinner
		const loadingEl = contentEl.createDiv({ cls: "encounter-table-loading" });
		loadingEl.createEl("p", { text: "Loading encounter tables…" });

		// List container
		this.listContainer = contentEl.createDiv({ cls: "encounter-table-list" });

		// Load tables
		await this.loadAvailableTables();

		// Remove loading
		loadingEl.remove();

		if (this.availableTables.length === 0) {
			this.renderEmptyState();
		} else {
			this.filteredTables = [...this.availableTables];
			this.renderTableList();
		}

		// Bottom buttons
		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });

		const createNewBtn = buttonRow.createEl("button", {
			text: "🎲 Create New Table",
			cls: "mod-cta",
		});
		createNewBtn.addEventListener("click", () => {
			this.close();
			// Dynamic import to avoid circular dependency
			import("./RandomEncounterTableModal").then(
				({ RandomEncounterTableModal }) => {
					new RandomEncounterTableModal(this.app, this.plugin).open();
				}
			);
		});

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		// Focus the search input
		searchInput.focus();
	}

	onClose() {
		this.contentEl.empty();
	}

	private async loadAvailableTables() {
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;

			if (fm?.type === "encounter-table") {
				this.availableTables.push({
					file,
					name: fm.name || file.basename,
					environment: fm.environment || "Unknown",
					partyLevel: fm.party_level || 0,
					entries: fm.entries || 0,
				});
			}
		}

		// Sort by name
		this.availableTables.sort((a, b) => a.name.localeCompare(b.name));
	}

	private filterTables(query: string) {
		const lowerQuery = query.toLowerCase();
		this.filteredTables = this.availableTables.filter(
			(t) =>
				t.name.toLowerCase().includes(lowerQuery) ||
				t.environment.toLowerCase().includes(lowerQuery)
		);
		this.renderTableList();
	}

	private renderTableList() {
		if (!this.listContainer) return;
		this.listContainer.empty();

		if (this.filteredTables.length === 0) {
			this.listContainer.createEl("p", {
				text: "No matching encounter tables found.",
				cls: "encounter-table-list-empty",
			});
			return;
		}

		for (const table of this.filteredTables) {
			const item = this.listContainer.createDiv({ cls: "encounter-table-list-item" });

			const info = item.createDiv({ cls: "encounter-table-list-info" });
			info.createEl("span", {
				text: `🎲 ${table.name}`,
				cls: "encounter-table-list-name",
			});

			const meta = info.createDiv({ cls: "encounter-table-list-meta" });
			meta.createEl("span", { text: `🌍 ${table.environment}` });
			if (table.partyLevel) {
				meta.createEl("span", { text: `📊 Lvl ${table.partyLevel}` });
			}
			if (table.entries) {
				meta.createEl("span", { text: `🎯 d${table.entries}` });
			}

			// Click to select
			item.addEventListener("click", () => {
				this.insertTable(table);
			});
		}
	}

	private renderEmptyState() {
		if (!this.listContainer) return;
		this.listContainer.empty();

		const emptyEl = this.listContainer.createDiv({ cls: "encounter-table-list-empty-state" });
		emptyEl.createEl("p", { text: "📭 No encounter tables found in your vault." });
		emptyEl.createEl("p", {
			text: 'Click "Create New Table" below to generate one!',
			cls: "encounter-table-list-hint",
		});
	}

	private insertTable(table: EncounterTableEntry) {
		// Build the wikilink-based path (strip .md)
		const linkPath = table.file.path.replace(/\.md$/, "");
		const codeblock = "```dnd-encounter-table\n[[" + linkPath + "]]\n```";

		this.onSelect(codeblock);
		new Notice(`✅ Inserted encounter table: ${table.name}`);
		this.close();
	}
}
