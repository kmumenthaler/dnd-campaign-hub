import { App } from 'obsidian';
import { MarkerDefinition, MarkerLibraryData } from './MarkerTypes';

export class MarkerLibrary {
	private app: App;
	private pluginId: string;
	private markers: Map<string, MarkerDefinition>;
	private filePath: string;

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginId = pluginId;
		this.markers = new Map();
		this.filePath = `.obsidian/plugins/${pluginId}/markers.json`;
	}

	/**
	 * Load markers from the markers.json file
	 */
	async load(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(this.filePath)) {
				const content = await adapter.read(this.filePath);
				const data: MarkerLibraryData = JSON.parse(content);
				
				this.markers.clear();
				for (const marker of data.markers) {
					this.markers.set(marker.id, marker);
				}
			} else {
				// Initialize with empty library
				await this.save();
			}
		} catch (error) {
			console.error('Failed to load marker library:', error);
			this.markers.clear();
		}
	}

	/**
	 * Save markers to the markers.json file
	 */
	async save(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const data: MarkerLibraryData = {
				markers: Array.from(this.markers.values()),
				version: '1.0.0'
			};
			
			await adapter.write(this.filePath, JSON.stringify(data, null, 2));
		} catch (error) {
			console.error('Failed to save marker library:', error);
		}
	}

	/**
	 * Get a marker by ID
	 */
	getMarker(id: string): MarkerDefinition | undefined {
		return this.markers.get(id);
	}

	/**
	 * Get all markers
	 */
	getAllMarkers(): MarkerDefinition[] {
		return Array.from(this.markers.values());
	}

	/**
	 * Add or update a marker
	 */
	async setMarker(marker: MarkerDefinition): Promise<void> {
		const now = Date.now();
		if (this.markers.has(marker.id)) {
			marker.updatedAt = now;
		} else {
			marker.createdAt = marker.createdAt || now;
			marker.updatedAt = marker.updatedAt || now;
		}
		
		this.markers.set(marker.id, marker);
		await this.save();
	}

	/**
	 * Delete a marker
	 */
	async deleteMarker(id: string): Promise<void> {
		this.markers.delete(id);
		await this.save();
	}

	/**
	 * Check if a marker exists
	 */
	hasMarker(id: string): boolean {
		return this.markers.has(id);
	}

	/**
	 * Generate a unique marker ID
	 */
	generateId(): string {
		return `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
