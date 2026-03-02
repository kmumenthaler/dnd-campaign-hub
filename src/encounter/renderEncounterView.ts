import { App, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";

/**
 * Renders the dnd-encounter code block.
 */

export async function renderEncounterView(plugin: DndCampaignHubPlugin, source: string, el: HTMLElement, ctx: any) {
	try {
		// Parse source - either a wikilink to encounter file, or empty to use current file
		const trimmedSource = source.trim();
		let encounterFile: TFile | null = null;

		if (trimmedSource) {
			// Source contains a path to encounter file
			// Handle wikilink format: [[path/to/encounter]] or plain path
			let filePath = trimmedSource;
			const wikiMatch = trimmedSource.match(/^\[\[(.+?)\]\]$/);
			if (wikiMatch && wikiMatch[1]) {
				filePath = wikiMatch[1];
			}

			// Add .md extension if not present
			if (!filePath.endsWith('.md')) {
				filePath += '.md';
			}

			// Find the file
			encounterFile = plugin.app.vault.getAbstractFileByPath(filePath) as TFile;
			if (!encounterFile) {
				// Try to resolve as wikilink
				const resolved = plugin.app.metadataCache.getFirstLinkpathDest(filePath.replace('.md', ''), ctx.sourcePath);
				if (resolved instanceof TFile) {
					encounterFile = resolved;
				}
			}
		} else {
			// Use current file
			encounterFile = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile;
		}

		if (!encounterFile) {
			el.createEl('div', {
				text: '\u26a0\ufe0f Encounter file not found',
				cls: 'dnd-encounter-block-error'
			});
			return;
		}

		// Get frontmatter
		const cache = plugin.app.metadataCache.getFileCache(encounterFile);
		const fm = cache?.frontmatter;

		if (!fm || fm.type !== 'encounter') {
			el.createEl('div', {
				text: '\u26a0\ufe0f Not a valid encounter note',
				cls: 'dnd-encounter-block-error'
			});
			return;
		}

		// Create container
		const container = el.createDiv({ cls: 'dnd-encounter-block' });

		// Header with name and link
		const header = container.createDiv({ cls: 'dnd-encounter-block-header' });
		const nameLink = header.createEl('a', {
			text: `\u2694\ufe0f ${fm.name || encounterFile.basename}`,
			cls: 'dnd-encounter-block-name'
		});
		nameLink.addEventListener('click', (e) => {
			e.preventDefault();
			plugin.app.workspace.openLinkText(encounterFile!.path, ctx.sourcePath);
		});

		// Difficulty badge
		const diff = fm.difficulty;
		if (diff) {
			const badge = header.createEl('span', {
				text: diff.rating,
				cls: 'dnd-difficulty-badge'
			});
			badge.style.backgroundColor = diff.color || '#888888';
		}

		// Stats row
		if (diff) {
			const statsRow = container.createDiv({ cls: 'dnd-encounter-block-stats' });

			// Party info
			statsRow.createEl('span', {
				text: `\ud83d\udc65 ${diff.party_count} PCs (Lvl ~${Math.round(diff.party_avg_level || 0)})`,
				cls: 'dnd-encounter-stat'
			});

			// Enemy info
			statsRow.createEl('span', {
				text: `\ud83d\udc79 ${diff.enemy_count} enemies`,
				cls: 'dnd-encounter-stat'
			});

			// Rounds estimate
			statsRow.createEl('span', {
				text: `\u23f1\ufe0f ~${diff.rounds_to_defeat} rounds`,
				cls: 'dnd-encounter-stat'
			});
		}

		// Creature summary (collapsed by default)
		const creatures = fm.creatures || [];
		if (creatures.length > 0) {
			const creatureSection = container.createDiv({ cls: 'dnd-encounter-block-creatures' });
			const creatureList = creatures.map((c: any) =>
				`${c.count || 1}\u00d7 ${c.name}${c.cr ? ` (CR ${c.cr})` : ''}`
			).join(', ');
			creatureSection.createEl('span', {
				text: creatureList,
				cls: 'dnd-encounter-creature-list'
			});
		}

		// Action buttons
		const buttonRow = container.createDiv({ cls: 'dnd-encounter-block-actions' });

		// Load in Initiative Tracker button (primary CTA)
		const loadBtn = buttonRow.createEl('button', {
			text: '\u2694\ufe0f Run Encounter',
			cls: 'dnd-encounter-btn mod-cta'
		});
		loadBtn.addEventListener('click', async () => {
			const initiativeTracker = (plugin.app as any).plugins?.plugins?.["initiative-tracker"];
			if (!initiativeTracker) {
				new Notice("Initiative Tracker plugin not found");
				return;
			}

			const encounterName = fm.name || encounterFile!.basename;
			const encounter = initiativeTracker.data?.encounters?.[encounterName];
			if (!encounter) {
				new Notice(`Encounter "${encounterName}" not found in Initiative Tracker. Try re-saving the encounter.`);
				return;
			}

			try {
				if (initiativeTracker.tracker?.new) {
					initiativeTracker.tracker.new(initiativeTracker, encounter);
					new Notice(`\u2705 Loaded: ${encounterName}`);
				}
				(plugin.app as any).commands?.executeCommandById("initiative-tracker:open-tracker");
			} catch (e) {
				new Notice(`\u26a0\ufe0f Could not load encounter: ${(e as Error).message}`);
			}
		});

		// Edit button (secondary / less prominent)
		const editBtn = buttonRow.createEl('button', {
			text: '\u270f\ufe0f Edit',
			cls: 'dnd-encounter-btn mod-muted'
		});
		editBtn.addEventListener('click', () => {
			plugin.editEncounter(encounterFile!.path);
		});

	} catch (error) {
		console.error('Error rendering encounter block:', error);
		el.createEl('div', {
			text: `\u26a0\ufe0f Error: ${(error as Error).message}`,
			cls: 'dnd-encounter-block-error'
		});
	}
}
