import { App, Notice, TFile } from "obsidian";
import { ConfirmModal } from "../utils/ConfirmModal";
import type DndCampaignHubPlugin from "../main";

/** Format a relative "time ago" string from an ISO date. */
function formatTimeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

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
		const encounterName = fm.name || encounterFile!.basename;

		// Run Encounter → feeds into our Combat Tracker
		const loadBtn = buttonRow.createEl('button', {
			text: '\u2694\ufe0f Run Encounter',
			cls: 'dnd-encounter-btn mod-cta'
		});
		loadBtn.addEventListener('click', async () => {
			const tracker = plugin.combatTracker;

			// Map YAML creatures (snake_case → camelCase for EncounterCreature)
			const mappedCreatures = (fm.creatures || []).map((c: any) => ({
				name: c.name,
				count: c.count ?? 1,
				hp: c.hp,
				ac: c.ac,
				cr: c.cr,
				source: c.source,
				path: c.path && c.path !== "[SRD]" ? c.path : undefined,
				isFriendly: c.isFriendly ?? c.is_friendly ?? false,
				isHidden: c.isHidden ?? c.is_hidden ?? false,
			}));

			// Build party — prefer frontmatter party_members, fall back to PartyManager
			const partyMembers: Array<{ name: string; level: number; hp: number; maxHp: number; ac: number; notePath?: string; tokenId?: string; initBonus?: number; thp?: number }> = [];

			const fmParty: any[] | undefined = fm.party_members;
			if (Array.isArray(fmParty) && fmParty.length > 0) {
				for (const m of fmParty) {
					if (!m || !m.name) continue;
					const maxHp = typeof m.hp_max === "number" ? m.hp_max : (typeof m.hp === "number" ? m.hp : 10);
					partyMembers.push({
						name: m.name,
						level: typeof m.level === "number" ? m.level : 1,
						hp: typeof m.hp === "number" ? m.hp : maxHp,
						maxHp,
						ac: typeof m.ac === "number" ? m.ac : 10,
						notePath: m.note_path || undefined,
						tokenId: m.token_id || undefined,
						initBonus: typeof m.init_bonus === "number" ? m.init_bonus : 0,
						thp: typeof m.thp === "number" ? m.thp : 0,
					});
				}
			} else {
				// Resolve party from PartyManager using encounter note context
				const resolvedParty = encounterFile
					? plugin.partyManager.resolvePartyForNote(encounterFile.path)
					: plugin.partyManager.getDefaultParty();
				if (resolvedParty) {
					const resolved = await plugin.partyManager.resolveMembers(resolvedParty.id);
					for (const m of resolved) {
						partyMembers.push({
							name: m.name,
							level: m.level,
							hp: m.hp,
							maxHp: m.maxHp,
							ac: m.ac,
							notePath: m.notePath,
							tokenId: m.tokenId,
							initBonus: m.initBonus,
							thp: m.thp,
						});
					}
				}
			}

			await tracker.startFromEncounter(
				encounterName,
				mappedCreatures,
				partyMembers,
				fm.use_color_names ?? true,
				encounterFile!.path,
			);

			// Open the Combat Tracker sidebar
			await plugin.openCombatTracker();
		});

		// Save Combat button
		const saveBtn = buttonRow.createEl('button', {
			text: '\ud83d\udcbe Save Combat',
			cls: 'dnd-encounter-btn'
		});
		saveBtn.addEventListener('click', async () => {
			await plugin.combatTracker.saveCombat();
			renderSavedStateInfo();
		});

		// Resume Combat button (shown only when saved state exists)
		const resumeBtn = buttonRow.createEl('button', {
			text: '\ud83d\udd04 Resume Combat',
			cls: 'dnd-encounter-btn mod-cta'
		});
		resumeBtn.addEventListener('click', async () => {
			plugin.combatTracker.resumeCombat(encounterName);
			await plugin.openCombatTracker();
		});

		// Edit button (secondary / less prominent)
		const editBtn = buttonRow.createEl('button', {
			text: '\u270f\ufe0f Edit',
			cls: 'dnd-encounter-btn mod-muted'
		});
		editBtn.addEventListener('click', () => {
			plugin.editEncounter(encounterFile!.path);
		});

		// Saved state info bar + clear button
		const stateInfoEl = container.createDiv({ cls: 'dnd-combat-state-info' });

		const renderSavedStateInfo = () => {
			stateInfoEl.empty();
			const info = plugin.combatTracker.getSavedStateInfo(encounterName);
			if (info) {
				resumeBtn.style.display = '';
				stateInfoEl.style.display = '';
				stateInfoEl.createEl('span', {
					text: `\ud83d\udcbe Paused at Round ${info.round}, ${info.combatantCount} combatants (${formatTimeAgo(info.savedAt)})`,
				});
				const clearBtn = stateInfoEl.createEl('button', {
					text: '\u2716 Clear',
					cls: 'dnd-encounter-btn mod-muted',
				});
				clearBtn.addEventListener('click', () => {
					new ConfirmModal(
						plugin.app,
						'Clear Saved Combat State',
						`Are you sure you want to clear the saved combat state for "${encounterName}"?\nThis action cannot be undone.`,
						async (confirmed) => {
							if (confirmed) {
								await plugin.combatTracker.clearSavedState(encounterName);
								renderSavedStateInfo();
							}
						}
					).open();
				});
			} else {
				resumeBtn.style.display = 'none';
				stateInfoEl.style.display = 'none';
			}
		};
		renderSavedStateInfo();

	} catch (error) {
		console.error('Error rendering encounter block:', error);
		el.createEl('div', {
			text: `\u26a0\ufe0f Error: ${(error as Error).message}`,
			cls: 'dnd-encounter-block-error'
		});
	}
}
