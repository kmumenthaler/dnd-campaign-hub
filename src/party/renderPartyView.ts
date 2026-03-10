import type DndCampaignHubPlugin from "../main";

/**
 * Renders the dnd-party code block.
 */

export async function renderPartyView(plugin: DndCampaignHubPlugin, source: string, el: HTMLElement, ctx: any) {
	try {
		const pm = plugin.partyManager;
		const allParties = pm.getParties();

		if (allParties.length === 0) {
			el.createEl('div', {
				text: '\u26a0\ufe0f No parties found. Use the "Manage Parties" command to create one.',
				cls: 'dnd-party-block-error'
			});
			return;
		}

		// Parse source for party selection (optional)
		const trimmedSource = source.trim();
		let requestedPartyId: string | null = null;
		if (trimmedSource) {
			try {
				const config = JSON.parse(trimmedSource);
				requestedPartyId = config.partyId || config.party;
			} catch {
				if (trimmedSource.startsWith('party:')) {
					requestedPartyId = trimmedSource.substring(6).trim();
				} else if (trimmedSource.startsWith('partyId:')) {
					requestedPartyId = trimmedSource.substring(8).trim();
				} else {
					requestedPartyId = trimmedSource;
				}
			}
		}

		// Resolve party
		let party = null;

		if (requestedPartyId) {
			party = pm.getParty(requestedPartyId) || pm.getPartyByName(requestedPartyId);

			if (!party) {
				const errorDiv = el.createDiv({ cls: 'dnd-party-block-error' });
				errorDiv.createEl('div', { text: `\u26a0\ufe0f Party "${requestedPartyId}" not found` });
				errorDiv.createEl('div', {
					text: 'Available parties:',
					cls: 'dnd-party-error-hint'
				});
				const partyList = errorDiv.createEl('ul', { cls: 'dnd-party-list' });
				allParties.forEach((p) => {
					partyList.createEl('li', { text: `\u2022 ${p.name}` });
				});
				return;
			}
		} else {
			// Resolve from campaign context
			let campaignName = "";
			if (ctx.sourcePath) {
				const pathParts = ctx.sourcePath.split('/');
				const ttrpgsIndex = pathParts.indexOf('ttrpgs');
				if (ttrpgsIndex >= 0 && ttrpgsIndex < pathParts.length - 1) {
					campaignName = pathParts[ttrpgsIndex + 1];
				}
			}

			party = pm.resolveParty(undefined, campaignName || undefined);
		}

		if (!party) {
			el.createEl('div', {
				text: '\u26a0\ufe0f No party found',
				cls: 'dnd-party-block-error'
			});
			return;
		}

		// Resolve live stats from PC notes
		const resolved = await pm.resolveMembers(party.id);
		const members = resolved.filter(m => m.enabled).map(m => ({
			name: m.name,
			level: m.level,
			hp: m.hp,
			maxHp: m.maxHp,
			ac: m.ac,
		}));

		if (members.length === 0) {
			el.createEl('div', {
				text: '\u26a0\ufe0f No party members found',
				cls: 'dnd-party-block-error'
			});
			return;
		}

		// Create ultra-compact container
		const container = el.createDiv({ cls: 'dnd-party-block' });

		// Minimal header
		const header = container.createDiv({ cls: 'dnd-party-header' });
		header.createEl('span', {
			text: `${party.name || "Party"} (${members.length})`,
			cls: 'dnd-party-title'
		});
		const refreshBtn = header.createEl('button', {
			text: '\ud83d\udd03',
			cls: 'dnd-party-refresh',
			attr: { 'aria-label': 'Refresh' }
		});
		refreshBtn.addEventListener('click', async () => {
			el.empty();
			await renderPartyView(plugin, source, el, ctx);
		});

		// Member rows with HP bars
		const membersList = container.createDiv({ cls: 'dnd-party-list' });

		for (const member of members) {
			const row = membersList.createDiv({ cls: 'dnd-party-member' });
			const hpPercentage = (member.hp / member.maxHp) * 100;

			// Name and Level
			const nameSection = row.createDiv({ cls: 'pc-name-section' });
			nameSection.createEl('span', { text: member.name, cls: 'pc-name' });
			const levelBadge = nameSection.createEl('span', { cls: 'pc-level-badge' });
			levelBadge.createEl('span', { text: '\u2694', cls: 'pc-level-icon' });
			levelBadge.createEl('span', { text: member.level.toString(), cls: 'pc-level-value' });

			// HP Bar with value
			const hpSection = row.createDiv({ cls: 'pc-hp-section' });
			const hpLabel = hpSection.createDiv({ cls: 'pc-hp-label' });
			hpLabel.createEl('span', { text: '\u2764', cls: 'pc-hp-icon' });
			hpLabel.createEl('span', { text: `${member.hp}/${member.maxHp}`, cls: 'pc-hp-text' });

			const hpBarContainer = hpSection.createDiv({ cls: 'pc-hp-bar-container' });
			const hpBar = hpBarContainer.createDiv({ cls: 'pc-hp-bar' });
			hpBar.style.width = `${Math.max(0, Math.min(100, hpPercentage))}%`;

			// HP bar color
			if (hpPercentage > 66) {
				hpBar.classList.add('hp-healthy');
			} else if (hpPercentage > 33) {
				hpBar.classList.add('hp-wounded');
			} else {
				hpBar.classList.add('hp-critical');
			}

			// AC Badge
			const acBadge = row.createDiv({ cls: 'pc-ac-badge' });
			acBadge.createEl('span', { text: '\ud83d\udee1', cls: 'pc-ac-icon' });
			acBadge.createEl('span', { text: member.ac.toString(), cls: 'pc-ac-value' });
		}

	} catch (error) {
		console.error('Error rendering party block:', error);
		el.createEl('div', {
			text: `\u26a0\ufe0f Error: ${(error as Error).message}`,
			cls: 'dnd-party-block-error'
		});
	}
}
