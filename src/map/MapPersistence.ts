import { Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { BATTLEMAP_TEMPLATE_FOLDER } from "./MapCreationModal";
import { normalizeMapAnnotations } from "./MapFactory";

const SAVE_DEBOUNCE_MS = 1000;

// ── Template index cache ──────────────────────────────────────────────
/** Lightweight entry cached in the template index. */
interface TemplateIndexEntry {
	mapId: string;
	name: string;
	imageFile: string;
	tags: any;
}

/** In-memory template index — built on first query, invalidated on save/delete. */
let _templateIndex: TemplateIndexEntry[] | null = null;

/** Force the next `queryMapTemplates` call to rebuild the index from disk. */
export function invalidateTemplateIndex(): void {
	_templateIndex = null;
}

/** Build (or return cached) template index by scanning annotation files once. */
async function _getTemplateIndex(plugin: DndCampaignHubPlugin): Promise<TemplateIndexEntry[]> {
	if (_templateIndex) return _templateIndex;

	const entries: TemplateIndexEntry[] = [];
	try {
		const annotationDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/map-annotations`;
		if (!(await plugin.app.vault.adapter.exists(annotationDir))) {
			_templateIndex = entries;
			return entries;
		}

		const listing = await plugin.app.vault.adapter.list(annotationDir);
		for (const filePath of listing.files) {
			if (!filePath.endsWith('.json')) continue;
			try {
				const raw = await plugin.app.vault.adapter.read(filePath);
				const data = JSON.parse(raw);
				if (!data.isTemplate || !data.templateTags) continue;
				entries.push({
					mapId: data.mapId,
					name: data.name || 'Unnamed Template',
					imageFile: data.imageFile,
					tags: data.templateTags,
				});
			} catch { /* skip corrupt */ }
		}
	} catch (err) {
		console.error('[MapPersistence] Error building template index:', err);
	}

	_templateIndex = entries;
	return entries;
}

/**
 * Map annotation persistence: save, load, query, and migration.
 * Extracted from DndCampaignHubPlugin.
 */

export function saveMapAnnotations(plugin: DndCampaignHubPlugin, config: any, el: HTMLElement) {
	// Sync to player view immediately (cheap, no I/O)
	const viewport = el.querySelector('.dnd-map-viewport') as any;
	if (viewport && viewport._syncPlayerView) {
		viewport._syncPlayerView();
	}

	if (!config.mapId) {
		console.error('Cannot save annotations: mapId missing');
		return;
	}

	const mapId = config.mapId as string;
	const existing = plugin._pendingSaves.get(mapId);
	if (existing) clearTimeout(existing.timer);

	const timer = setTimeout(() => {
		_flushMapSave(plugin, mapId);
	}, SAVE_DEBOUNCE_MS);

	plugin._pendingSaves.set(mapId, { config, el, timer });
}

/** Immediately write a pending save for `mapId` to disk. */
export async function _flushMapSave(plugin: DndCampaignHubPlugin, mapId: string) {
	const entry = plugin._pendingSaves.get(mapId);
	if (!entry) return;
	clearTimeout(entry.timer);

	const config = entry.config;
	try {
		// Normalise through the canonical schema so every field is present
		const mapData = normalizeMapAnnotations(config);
		mapData.lastModified = new Date().toISOString();

		// Ensure annotation directory exists
		const annotationDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/map-annotations`;
		const dirExists = await plugin.app.vault.adapter.exists(annotationDir);
		if (!dirExists) {
			await plugin.app.vault.adapter.mkdir(annotationDir);
		}

		// Save to dedicated file using adapter for config directory files
		const annotationPath = getMapAnnotationPath(plugin, config.mapId);
		const annotationJson = JSON.stringify(mapData, null, 2);

		await plugin.app.vault.adapter.write(annotationPath, annotationJson);

		// Only remove from pending saves AFTER successful write
		plugin._pendingSaves.delete(mapId);

		// Invalidate template index — the saved map may be a template
		invalidateTemplateIndex();
	} catch (error) {
		console.error('Error saving map annotations:', error);
		// Re-arm the debounce so the save is retried automatically
		entry.timer = setTimeout(() => {
			_flushMapSave(plugin, mapId);
		}, SAVE_DEBOUNCE_MS * 2);
		new Notice('⚠️ Map save failed — will retry automatically');
	}
}

/** Flush all pending debounced saves immediately (called on unload). */
export async function _flushAllPendingSaves(plugin: DndCampaignHubPlugin) {
	const ids = [...plugin._pendingSaves.keys()];
	for (const id of ids) {
		await _flushMapSave(plugin, id);
	}
}

/**
 * Get the file path for map annotations
 */
export function getMapAnnotationPath(plugin: DndCampaignHubPlugin, mapId: string): string {
	return `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/map-annotations/${mapId}.json`;
}

/**
 * Load map annotations from dedicated file
 */
export async function loadMapAnnotations(plugin: DndCampaignHubPlugin, mapId: string): Promise<any> {
	try {
		const annotationPath = getMapAnnotationPath(plugin, mapId);

		// Check if annotation file exists
		if (await plugin.app.vault.adapter.exists(annotationPath)) {
			const data = await plugin.app.vault.adapter.read(annotationPath);
			const parsedData = JSON.parse(data);
			// Normalise through canonical schema so missing fields get defaults
			return normalizeMapAnnotations(parsedData);
		} else {
			return {};
		}
	} catch (error) {
		console.error('Error loading map annotations:', error);
		return {};
	}
}

/**
 * Query map templates matching the given criteria.
 * Returns templates sorted by match score (best matches first).
 */
export async function queryMapTemplates(plugin: DndCampaignHubPlugin, criteria: { terrain?: string; climate?: string; location?: string; timeOfDay?: string; size?: string }): Promise<Array<{
	mapId: string;
	name: string;
	imageFile: string;
	tags: any;
	matchScore: number;
}>> {
	const index = await _getTemplateIndex(plugin);
	const results: Array<{
		mapId: string;
		name: string;
		imageFile: string;
		tags: any;
		matchScore: number;
	}> = [];

	for (const entry of index) {
		const tags = entry.tags;
		let score = 0;

		if (criteria.terrain && tags.terrain?.includes(criteria.terrain)) score += 3;
		if (criteria.climate && tags.climate?.includes(criteria.climate)) score += 2;
		if (criteria.location && tags.location?.includes(criteria.location)) score += 2;
		if (criteria.timeOfDay && tags.timeOfDay?.includes(criteria.timeOfDay)) score += 1;
		if (criteria.size && tags.size?.includes(criteria.size)) score += 1;

		const hasCriteria = criteria.terrain || criteria.climate || criteria.location;
		if (score > 0 || !hasCriteria) {
			results.push({ ...entry, matchScore: score });
		}
	}

	results.sort((a, b) => b.matchScore - a.matchScore);
	return results;
}

/**
 * One-time migration: find existing annotation JSONs with isTemplate === true
 * that don't yet have a corresponding note in z_BattlemapTemplates/,
 * and create one so the GM can open and configure them.
 */
export async function migrateExistingTemplatesToNotes(plugin: DndCampaignHubPlugin): Promise<void> {
	try {
		const annotationDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/map-annotations`;
		if (!(await plugin.app.vault.adapter.exists(annotationDir))) return;

		const listing = await plugin.app.vault.adapter.list(annotationDir);
		const templateMaps: Array<{ mapId: string; name: string }> = [];

		for (const filePath of listing.files) {
			if (!filePath.endsWith('.json')) continue;
			try {
				const raw = await plugin.app.vault.adapter.read(filePath);
				const data = JSON.parse(raw);
				if (data.isTemplate && data.mapId) {
					templateMaps.push({ mapId: data.mapId, name: data.name || 'Template' });
				}
			} catch { /* skip */ }
		}

		if (templateMaps.length === 0) return;

		const folder = BATTLEMAP_TEMPLATE_FOLDER;
		if (!(await plugin.app.vault.adapter.exists(folder))) {
			await plugin.app.vault.createFolder(folder);
		}

		// Collect existing template notes' mapIds
		const existingMapIds = new Set<string>();
		const mdFiles = plugin.app.vault.getMarkdownFiles().filter(f =>
			f.path.startsWith(folder + '/')
		);
		for (const file of mdFiles) {
			try {
				const content = await plugin.app.vault.read(file);
				const match = content.match(/"mapId"\s*:\s*"([^"]+)"/);
				if (match && match[1]) existingMapIds.add(match[1]);
			} catch { /* skip */ }
		}

		let migrated = 0;
		for (const tpl of templateMaps) {
			if (existingMapIds.has(tpl.mapId)) continue;

			const safeName = tpl.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Template';
			let notePath = `${folder}/${safeName}.md`;
			let counter = 1;
			while (await plugin.app.vault.adapter.exists(notePath)) {
				notePath = `${folder}/${safeName} (${counter}).md`;
				counter++;
			}

			const codeBlock = `\`\`\`dnd-map\n${JSON.stringify({ mapId: tpl.mapId }, null, 2)}\n\`\`\``;
			const content = `---\ntags:\n  - battlemap-template\ntemplate_name: "${tpl.name}"\n---\n# ${tpl.name}\n\n${codeBlock}\n`;
			await plugin.app.vault.create(notePath, content);
			migrated++;
		}

		if (migrated > 0) {
			new Notice(`🗺️ Migrated ${migrated} battlemap template${migrated > 1 ? 's' : ''} to ${folder}/`);
		}
	} catch (err) {
	}
}

/**
 * Enrich existing marker/token definitions with campaign metadata.
 * Scans all PC and NPC vault notes for token_id + campaign fields,
 * then updates the corresponding MarkerDefinition if its campaign is missing.
 * Also backfills token_id into notes that have a matching token by name but no token_id.
 * Runs on every plugin load; skips markers that already have a campaign set.
 */
export async function enrichTokenCampaigns(plugin: DndCampaignHubPlugin): Promise<void> {
	try {
		// Wait for metadata cache to be ready
		await new Promise<void>((resolve) => {
			if (plugin.app.metadataCache.resolvedLinks) {
				resolve();
			} else {
				const ref = plugin.app.metadataCache.on('resolved', () => {
					plugin.app.metadataCache.offref(ref);
					resolve();
				});
			}
		});

		const allFiles = plugin.app.vault.getMarkdownFiles();
		let enriched = 0;
		let backfilled = 0;

		for (const file of allFiles) {
			const cache = plugin.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter) continue;

			const fm = cache.frontmatter;
			const fmType = fm.type;
			if (fmType !== 'player' && fmType !== 'npc') continue;

			const campaign = fm.campaign;
			if (!campaign) continue;

			let tokenId = fm.token_id;

			// If note has no token_id, try to find a matching token by name
			if (!tokenId) {
				const name = fm.name || file.basename;
				const markerType = fmType === 'player' ? 'player' : 'npc';
				const allMarkers = plugin.markerLibrary.getAllMarkers();
				const match = allMarkers.find(
					(m) => m.name === name && m.type === markerType && !m.campaign
				);
				if (match) {
					tokenId = match.id;
					// Backfill token_id into the note's frontmatter
					try {
						await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
							frontmatter.token_id = tokenId;
						});
						backfilled++;
					} catch (e) {
					}
				}
			}

			if (!tokenId) continue;

			const marker = plugin.markerLibrary.getMarker(tokenId);
			if (!marker) continue;

			// Skip if campaign is already set
			if (marker.campaign) continue;

			// Enrich the marker with the campaign from the note
			marker.campaign = campaign;
			marker.updatedAt = Date.now();
			await plugin.markerLibrary.setMarker(marker);
			enriched++;
		}

		if (enriched > 0 || backfilled > 0) {
		}
	} catch (err) {
	}
}

