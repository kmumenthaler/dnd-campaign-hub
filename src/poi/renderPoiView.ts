import { App, Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

/**
 * Renders the dnd-poi code block.
 */

export async function renderPoiView(plugin: DndCampaignHubPlugin, source: string, el: HTMLElement, ctx: any) {
	try {
		// Parse source to extract PoI names (support multiple)
		const lines = source.trim().split('\n');
		const poiNames: string[] = [];

		for (const line of lines) {
			// Support "name: PoI Name" format
			const nameMatch = line.match(/^name:\s*["']?(.+?)["']?$/);
			if (nameMatch && nameMatch[1]) {
				poiNames.push(nameMatch[1].trim());
				continue;
			}

			// Support "- PoI Name" list format
			const listMatch = line.match(/^-\s+["']?(.+?)["']?$/);
			if (listMatch && listMatch[1]) {
				poiNames.push(listMatch[1].trim());
			}
		}

		if (poiNames.length === 0) {
			el.createEl('div', {
				text: '\u26a0\ufe0f No PoI names specified. Use:\nname: "PoI Name"\nor\n- PoI Name',
				cls: 'dnd-poi-block-error'
			});
			return;
		}

		// Search for all PoI files
		const allFiles = plugin.app.vault.getMarkdownFiles();
		const poiFiles: TFile[] = [];
		const notFoundNames: string[] = [];

		for (const poiName of poiNames) {
			let found = false;
			for (const file of allFiles) {
				if (file.path.includes('/locations/')) {
					const cache = plugin.app.metadataCache.getFileCache(file);
					const fm = cache?.frontmatter;

					if (fm?.type === 'point-of-interest' && fm.name === poiName) {
						poiFiles.push(file);
						found = true;
						break;
					}
				}
			}
			if (!found) {
				notFoundNames.push(poiName);
			}
		}

		// Show errors for not found PoIs
		if (notFoundNames.length > 0) {
			const errorDiv = el.createEl('div', {
				text: `\u26a0\ufe0f PoI not found: ${notFoundNames.join(', ')}`,
				cls: 'dnd-poi-block-error'
			});
			errorDiv.style.marginBottom = '8px';
		}

		if (poiFiles.length === 0) {
			return; // All not found, error already shown
		}

		// Render each PoI
		for (const poiFile of poiFiles) {
			// Get frontmatter and content
			const cache = plugin.app.metadataCache.getFileCache(poiFile);
			const fm = cache?.frontmatter;

			if (!fm || fm.type !== 'point-of-interest') {
				el.createEl('div', {
					text: `\u26a0\ufe0f ${poiFile.basename} is not a valid PoI note`,
					cls: 'dnd-poi-block-error'
				});
				continue;
			}

			// Create container
			const container = el.createDiv({ cls: 'dnd-poi-block' });

			// Header with icon, name, and type
			const header = container.createDiv({ cls: 'dnd-poi-block-header' });

			// Icon and name as clickable link
			const nameLink = header.createEl('a', {
				text: `${fm.icon || '\ud83d\udccd'} ${fm.name || poiFile.basename}`,
				cls: 'dnd-poi-block-name'
			});
			nameLink.addEventListener('click', (e) => {
				e.preventDefault();
				plugin.app.workspace.openLinkText(poiFile.path, ctx.sourcePath, true);
			});

			// Type badge
			const poiType = fm['poi-type'];
			if (poiType) {
				const typeColors: Record<string, string> = {
					'settlement': '#4a9eff',
					'dungeon': '#8b0000',
					'landmark': '#2e7d32',
					'danger': '#d32f2f',
					'quest': '#f57c00',
					'custom': '#757575'
				};
				const badge = header.createEl('span', {
					text: poiType,
					cls: 'dnd-poi-type-badge'
				});
				badge.style.backgroundColor = typeColors[poiType] || '#888888';
			}

			// Info row with region and status
			const infoRow = container.createDiv({ cls: 'dnd-poi-block-info' });

			if (fm.region) {
				infoRow.createEl('span', {
					text: `\ud83d\udccd ${fm.region}`,
					cls: 'dnd-poi-info-item'
				});
			}

			// Status indicator
			const visited = fm.visited || false;
			const discovered = fm.discovered || false;
			let statusText = 'Undiscovered';
			let statusIcon = '\u2753';

			if (visited) {
				statusText = 'Visited';
				statusIcon = '\u2705';
			} else if (discovered) {
				statusText = 'Discovered';
				statusIcon = '\ud83d\udc41\ufe0f';
			}

			infoRow.createEl('span', {
				text: `${statusIcon} ${statusText}`,
				cls: 'dnd-poi-info-item'
			});

			// Quest indicator
			if (fm['quest-related']) {
				infoRow.createEl('span', {
					text: '\ud83d\udcdc Quest',
					cls: 'dnd-poi-info-item dnd-poi-quest'
				});
			}

			// Danger level
			if (fm['danger-level']) {
				infoRow.createEl('span', {
					text: `\u2620\ufe0f ${fm['danger-level']}`,
					cls: 'dnd-poi-info-item dnd-poi-danger'
				});
			}

			// Description excerpt (first paragraph)
			const content = await plugin.app.vault.read(poiFile);
			const contentMatch = content.match(/## Description\s*\n\s*([^\n]+)/);
			if (contentMatch && contentMatch[1]) {
				const description = container.createDiv({ cls: 'dnd-poi-block-description' });
				description.createEl('p', { text: contentMatch[1] });
			}

			// Action buttons
			const buttonRow = container.createDiv({ cls: 'dnd-poi-block-actions' });

			// Open button
			const openBtn = buttonRow.createEl('button', {
				text: '\ud83d\udcc4 Open',
				cls: 'dnd-poi-btn mod-cta'
			});
			openBtn.addEventListener('click', () => {
				plugin.app.workspace.openLinkText(poiFile.path, ctx.sourcePath, true);
			});

			// Edit button
			const editBtn = buttonRow.createEl('button', {
				text: '\u270f\ufe0f Edit',
				cls: 'dnd-poi-btn'
			});
			editBtn.addEventListener('click', () => {
				import('../poi/PoiModals').then(({ PoiEditModal }) => {
					new PoiEditModal(plugin.app, poiFile.path).open();
				});
			});
		}

	} catch (error) {
		console.error('Error rendering PoI block:', error);
		el.createEl('div', {
			text: `\u26a0\ufe0f Error: ${(error as Error).message}`,
			cls: 'dnd-poi-block-error'
		});
	}
}
