import { App, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";

/**
 * Renders the dnd-party code block.
 */

export async function renderPartyView(plugin: DndCampaignHubPlugin, source: string, el: HTMLElement, ctx: any) {
	try {
		// Get party members from Initiative Tracker plugin
		const initiativeTracker = (plugin.app as any).plugins?.plugins?.["initiative-tracker"];
		if (!initiativeTracker) {
			el.createEl('div', { 
				text: 'âš ï¸ Initiative Tracker plugin not found',
				cls: 'dnd-party-block-error'
			});
			return;
		}

		const allParties = initiativeTracker.data?.parties || [];
		if (allParties.length === 0) {
			el.createEl('div', { 
				text: 'âš ï¸ No parties found in Initiative Tracker',
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
			// If not JSON, check for YAML-style "party: PartyName" format
			if (trimmedSource.startsWith('party:')) {
				requestedPartyId = trimmedSource.substring(6).trim();
			} else if (trimmedSource.startsWith('partyId:')) {
				requestedPartyId = trimmedSource.substring(8).trim();
			} else {
				// Plain party name
				requestedPartyId = trimmedSource;
			}
		}
	}

	// Resolve party using campaign context
	let party = null;
	
	if (requestedPartyId) {
		// Find party by ID or name
		party = allParties.find((p: any) => 
			p.id === requestedPartyId || p.name === requestedPartyId
		);
		
		if (!party) {
			// Party not found - show helpful error with available parties
			const errorDiv = el.createDiv({ cls: 'dnd-party-block-error' });
			errorDiv.createEl('div', { text: `âš ï¸ Party "${requestedPartyId}" not found` });
			errorDiv.createEl('div', { 
				text: 'Available parties:', 
				cls: 'dnd-party-error-hint' 
			});
			const partyList = errorDiv.createEl('ul', { cls: 'dnd-party-list' });
			allParties.forEach((p: any) => {
				partyList.createEl('li', { text: `â€¢ ${p.name}` });
			});
			return;
		}
	} else {
		// No party specified - resolve from campaign context
		// Detect campaign from the note's folder path
		let campaignName = "";
		if (ctx.sourcePath) {
			// Parse path to find campaign folder under ttrpgs/
			// Example: "ttrpgs/Frozen Sick (SOLINA)/Sessions/note.md" -> "Frozen Sick (SOLINA)"
			const pathParts = ctx.sourcePath.split('/');
			const ttrpgsIndex = pathParts.indexOf('ttrpgs');
			if (ttrpgsIndex >= 0 && ttrpgsIndex < pathParts.length - 1) {
				campaignName = pathParts[ttrpgsIndex + 1];
			}
		}

		// Try to find party matching campaign
		if (campaignName) {
			const partyName = `${campaignName} Party`;
			party = allParties.find((p: any) => p.name === partyName);
			
			if (!party) {
			} else {
			}
		}

		// Fallback to default party or first available
		if (!party) {
			if (initiativeTracker.data?.defaultParty) {
				party = allParties.find((p: any) => p.id === initiativeTracker.data.defaultParty);
			}
			if (!party) {
				party = allParties[0];
			}
		}
	}

	if (!party) {
			el.createEl('div', { 
				text: 'âš ï¸ No party found',
				cls: 'dnd-party-block-error'
			});
			return;
		}

		// Get party members
		const members = [];
		if (party.players) {
			for (const playerName of party.players) {
				const player = initiativeTracker.data?.players?.find((p: any) => p.name === playerName);
				if (player) {
					members.push({
						name: player.display || player.name || "Unknown",
						level: player.level || 1,
						hp: player.currentHP ?? player.hp ?? player.currentMaxHP ?? 20,
						maxHp: player.currentMaxHP ?? player.hp ?? 20,
						ac: player.currentAC ?? player.ac ?? 14
					});
				}
			}
		}

		if (members.length === 0) {
			el.createEl('div', { 
				text: 'âš ï¸ No party members found',
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
		text: 'âŸ³',
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
		levelBadge.createEl('span', { text: 'âš”', cls: 'pc-level-icon' });
		levelBadge.createEl('span', { text: member.level.toString(), cls: 'pc-level-value' });
		
		// HP Bar with value
		const hpSection = row.createDiv({ cls: 'pc-hp-section' });
		const hpLabel = hpSection.createDiv({ cls: 'pc-hp-label' });
		hpLabel.createEl('span', { text: 'â¤', cls: 'pc-hp-icon' });
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
		acBadge.createEl('span', { text: 'ðŸ›¡', cls: 'pc-ac-icon' });
		acBadge.createEl('span', { text: member.ac.toString(), cls: 'pc-ac-value' });
	}

} catch (error) {
	console.error('Error rendering party block:', error);
	el.createEl('div', { 
		text: `âš ï¸ Error: ${(error as Error).message}`,
		cls: 'dnd-party-block-error'
	});
}
}
