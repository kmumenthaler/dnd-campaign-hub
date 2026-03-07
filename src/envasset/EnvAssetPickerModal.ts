import { App, Modal, Notice } from 'obsidian';
import { EnvAssetLibrary } from './EnvAssetLibrary';
import { EnvAssetLibraryModal } from './EnvAssetLibraryModal';
import { EnvAssetDefinition, ENV_ASSET_CATEGORIES } from './EnvAssetTypes';

const CATEGORY_LABELS: Record<string, string> = {
	scatter: '🪨 Scatter',
};

const CATEGORY_ORDER: string[] = ['scatter'];

/**
 * Modal for picking an environmental asset from the library.
 * Groups assets by category, offers search, edit and delete.
 *
 * Mirrors the UX conventions of `MarkerPickerModal`.
 */
export class EnvAssetPickerModal extends Modal {
	private assetLibrary: EnvAssetLibrary;
	private onSelect: (assetId: string) => void;

	constructor(
		app: App,
		assetLibrary: EnvAssetLibrary,
		onSelect: (assetId: string) => void
	) {
		super(app);
		this.assetLibrary = assetLibrary;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('env-asset-picker-modal');

		contentEl.createEl('h2', { text: 'Select Environment Asset' });

		const assets = this.assetLibrary.getAllAssets();

		if (assets.length === 0) {
			contentEl.createEl('p', {
				text: 'No environment assets yet. Create your first one!',
				cls: 'marker-picker-empty',
			});
		} else {
			// Search filter
			const searchWrap = contentEl.createDiv();
			searchWrap.style.marginBottom = '12px';
			const searchInput = searchWrap.createEl('input', {
				type: 'text',
				placeholder: 'Search assets…',
			});
			searchInput.style.width = '100%';
			searchInput.style.padding = '8px';
			searchInput.style.borderRadius = '4px';
			searchInput.style.border = '1px solid var(--background-modifier-border)';
			searchInput.style.fontSize = '14px';

			const categoriesWrap = contentEl.createDiv({ cls: 'env-asset-categories-container' });

			// Card builder
			const createCard = (asset: EnvAssetDefinition, container: HTMLElement) => {
				const card = container.createDiv({ cls: 'env-asset-picker-card' });
				card.style.position = 'relative';

				// Thumbnail
				const thumb = card.createDiv({ cls: 'env-asset-picker-thumb' });
				thumb.style.width = '80px';
				thumb.style.height = '80px';
				thumb.style.display = 'flex';
				thumb.style.alignItems = 'center';
				thumb.style.justifyContent = 'center';
				thumb.style.overflow = 'hidden';
				thumb.style.borderRadius = '6px';
				thumb.style.flexShrink = '0';
				thumb.style.background = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 12px 12px';

				if (asset.imageFile) {
					try {
						const rp = this.app.vault.adapter.getResourcePath(asset.imageFile);
						const img = thumb.createEl('img');
						img.src = rp;
						img.style.maxWidth = '100%';
						img.style.maxHeight = '100%';
						img.style.objectFit = 'contain';
					} catch {
						const catMeta = ENV_ASSET_CATEGORIES.find(c => c.value === asset.category);
						thumb.createEl('span', { text: catMeta?.icon || '❓' });
						thumb.style.fontSize = '32px';
					}
				}

				// Info
				const info = card.createDiv({ cls: 'env-asset-picker-info' });
				info.createEl('span', { text: asset.name, cls: 'env-asset-picker-name' });
				const catMeta = ENV_ASSET_CATEGORIES.find(c => c.value === asset.category);
				info.createEl('span', {
					text: catMeta ? `${catMeta.icon} ${catMeta.label}` : asset.category,
					cls: 'env-asset-picker-cat',
				});

				// Mini-config summary
				if (asset.category === 'scatter' && asset.scatterConfig) {
					info.createEl('span', {
						text: asset.scatterConfig.blocksVision
							? `Blocks vision (${asset.scatterConfig.wallHeight ?? 5} ft)`
							: 'No vision block',
						cls: 'env-asset-picker-detail',
					});
				}

				// Actions row
				const actions = card.createDiv({ cls: 'env-asset-picker-actions' });
				actions.style.display = 'flex';
				actions.style.gap = '4px';
				actions.style.marginTop = '6px';

				const editBtn = actions.createEl('button', { text: '✏️ Edit' });
				editBtn.style.fontSize = '11px';
				editBtn.style.padding = '2px 6px';
				editBtn.style.flex = '1';
				editBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.close();
					new EnvAssetLibraryModal(this.app, this.assetLibrary, asset, () => {
						this.open(); // Re-open picker after edit
					}).open();
				});

				const deleteBtn = actions.createEl('button', { text: '🗑️' });
				deleteBtn.style.fontSize = '11px';
				deleteBtn.style.padding = '2px 6px';
				deleteBtn.style.color = 'var(--text-error)';
				deleteBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					if (confirm(`Delete asset "${asset.name}"?`)) {
						await this.assetLibrary.deleteAsset(asset.id);
						new Notice(`Deleted asset: ${asset.name}`);
						this.onOpen(); // Refresh
					}
				});

				// Select on card click
				card.addEventListener('click', () => {
					this.onSelect(asset.id);
					this.close();
				});
			};

			const renderAssets = (filter: string) => {
				categoriesWrap.empty();
				const filtered = filter
					? assets.filter(a =>
						a.name.toLowerCase().includes(filter.toLowerCase()) ||
						a.category.toLowerCase().includes(filter.toLowerCase())
					)
					: assets;

				if (filtered.length === 0) {
					categoriesWrap.createEl('p', { text: 'No matching assets.', cls: 'marker-picker-empty' });
					return;
				}

				// Group by category
				const grouped: Record<string, EnvAssetDefinition[]> = {};
				for (const a of filtered) {
					(grouped[a.category] ??= []).push(a);
				}

				for (const cat of CATEGORY_ORDER) {
					const catAssets = grouped[cat];
					if (!catAssets || catAssets.length === 0) continue;

					const section = categoriesWrap.createDiv({ cls: 'env-asset-category-section' });

					// Header
					const header = section.createDiv({ cls: 'env-asset-category-header' });
					header.style.display = 'flex';
					header.style.alignItems = 'center';
					header.style.justifyContent = 'space-between';
					header.style.padding = '12px 16px';
					header.style.marginTop = '4px';
					header.style.cursor = 'pointer';
					header.style.fontWeight = '600';
					header.style.fontSize = '14px';
					header.style.backgroundColor = 'var(--background-secondary)';
					header.style.borderRadius = '6px';
					header.style.userSelect = 'none';
					header.style.transition = 'background-color 0.15s ease';

					const hLeft = header.createDiv();
					hLeft.style.display = 'flex';
					hLeft.style.alignItems = 'center';
					hLeft.style.gap = '8px';

					const toggle = hLeft.createSpan({ text: '▼' });
					toggle.style.fontSize = '10px';
					toggle.style.transition = 'transform 0.2s ease';
					toggle.style.display = 'inline-block';

					hLeft.createSpan({ text: CATEGORY_LABELS[cat] });

					const badge = header.createSpan({ text: `${catAssets.length}` });
					badge.style.fontSize = '12px';
					badge.style.padding = '2px 8px';
					badge.style.borderRadius = '10px';
					badge.style.backgroundColor = 'var(--background-modifier-border)';
					badge.style.fontWeight = '500';

					// Grid
					const grid = section.createDiv({ cls: 'env-asset-category-grid' });
					grid.style.display = 'grid';
					grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';
					grid.style.gap = '10px';
					grid.style.padding = '12px 8px';

					for (const a of catAssets) createCard(a, grid);

					// Collapse toggle
					header.addEventListener('mouseenter', () => { header.style.backgroundColor = 'var(--background-modifier-hover)'; });
					header.addEventListener('mouseleave', () => { header.style.backgroundColor = 'var(--background-secondary)'; });

					let collapsed = false;
					header.addEventListener('click', () => {
						collapsed = !collapsed;
						grid.style.display = collapsed ? 'none' : 'grid';
						toggle.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
					});
				}
			};

			renderAssets('');
			searchInput.addEventListener('input', () => renderAssets(searchInput.value));
			setTimeout(() => searchInput.focus(), 100);
		}

		// Buttons
		const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		const createBtn = btnContainer.createEl('button', { text: 'Create New Asset', cls: 'mod-cta' });
		createBtn.addEventListener('click', () => {
			this.close();
			new EnvAssetLibraryModal(this.app, this.assetLibrary, null, (asset) => {
				this.onSelect(asset.id);
			}).open();
		});
		const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
