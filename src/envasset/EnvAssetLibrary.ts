import { App } from 'obsidian';
import { EnvAssetDefinition, EnvAssetLibraryData } from './EnvAssetTypes';

/**
 * Manages the global library of environmental-asset definitions.
 * Persists to `<configDir>/plugins/<pluginId>/env-assets.json`.
 *
 * Follows the same pattern as `MarkerLibrary`.
 */
export class EnvAssetLibrary {
	private app: App;
	private pluginId: string;
	private assets: Map<string, EnvAssetDefinition>;
	private filePath: string;

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginId = pluginId;
		this.assets = new Map();
		this.filePath = `.obsidian/plugins/${pluginId}/env-assets.json`;
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	/** Load definitions from disk. */
	async load(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(this.filePath)) {
				const content = await adapter.read(this.filePath);
				const data: EnvAssetLibraryData = JSON.parse(content);
				this.assets.clear();
				for (const asset of data.assets) {
					this.assets.set(asset.id, asset);
				}
			} else {
				await this.save();
			}
		} catch (error) {
			console.error('Failed to load env-asset library:', error);
			this.assets.clear();
		}
	}

	/** Persist current state to disk. */
	async save(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const data: EnvAssetLibraryData = {
				assets: Array.from(this.assets.values()),
				version: '1.0.0',
			};
			await adapter.write(this.filePath, JSON.stringify(data, null, 2));
		} catch (error) {
			console.error('Failed to save env-asset library:', error);
		}
	}

	// ── CRUD ─────────────────────────────────────────────────────────────────

	getAsset(id: string): EnvAssetDefinition | undefined {
		return this.assets.get(id);
	}

	getAllAssets(): EnvAssetDefinition[] {
		return Array.from(this.assets.values());
	}

	async setAsset(asset: EnvAssetDefinition): Promise<void> {
		const now = Date.now();
		if (this.assets.has(asset.id)) {
			asset.updatedAt = now;
		} else {
			asset.createdAt = asset.createdAt || now;
			asset.updatedAt = asset.updatedAt || now;
		}
		this.assets.set(asset.id, asset);
		await this.save();
	}

	async deleteAsset(id: string): Promise<void> {
		this.assets.delete(id);
		await this.save();
	}

	hasAsset(id: string): boolean {
		return this.assets.has(id);
	}

	/** Search by name (case-insensitive), optionally filtered by category & campaign. */
	findAssetsByName(
		name: string,
		opts?: { category?: string; campaign?: string }
	): EnvAssetDefinition[] {
		const results: EnvAssetDefinition[] = [];
		const lower = name.toLowerCase();
		for (const asset of this.assets.values()) {
			if (asset.name.toLowerCase() !== lower) continue;
			if (opts?.category && asset.category !== opts.category) continue;
			if (opts?.campaign && asset.campaign && asset.campaign !== opts.campaign) continue;
			results.push(asset);
		}
		results.sort((a, b) => {
			if (opts?.campaign) {
				const aM = a.campaign === opts.campaign ? 1 : 0;
				const bM = b.campaign === opts.campaign ? 1 : 0;
				if (aM !== bM) return bM - aM;
			}
			return (b.updatedAt || 0) - (a.updatedAt || 0);
		});
		return results;
	}

	/** Generate a unique asset ID. */
	generateId(): string {
		return `envasset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
