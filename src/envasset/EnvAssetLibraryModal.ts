import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import {
	EnvAssetDefinition,
	EnvAssetCategory,
	DoorBehaviour,
	DoorConfig,
	ScatterConfig,
	ENV_ASSET_CATEGORIES,
	DOOR_BEHAVIOURS,
} from './EnvAssetTypes';
import { EnvAssetLibrary } from './EnvAssetLibrary';

/**
 * Modal for creating or editing an environmental-asset definition.
 * Follows the same patterns as `MarkerLibraryModal`.
 */
export class EnvAssetLibraryModal extends Modal {
	private assetLibrary: EnvAssetLibrary;
	private asset: EnvAssetDefinition | null;
	private onSave: (asset: EnvAssetDefinition) => void;
	private previewEl!: HTMLElement;

	// ── Door config UI elements (toggled by category) ────────────────────────
	private doorConfigEl!: HTMLElement;
	private doorSlideEl!: HTMLElement;
	// ── Scatter config UI elements ───────────────────────────────────────────
	private scatterConfigEl!: HTMLElement;
	private scatterHeightEl!: HTMLElement;

	// ── Form state ───────────────────────────────────────────────────────────
	private name = '';
	private category: EnvAssetCategory = 'scatter';
	private imageFile = '';
	private defaultWidth = 70;
	private defaultHeight = 70;

	// Door form values
	private doorBehaviour: DoorBehaviour = 'pivot';

	// Scatter form values
	private scatterBlocksVision = false;
	private scatterWallHeight = 5;

	constructor(
		app: App,
		assetLibrary: EnvAssetLibrary,
		asset: EnvAssetDefinition | null,
		onSave: (asset: EnvAssetDefinition) => void
	) {
		super(app);
		this.assetLibrary = assetLibrary;
		this.asset = asset;
		this.onSave = onSave;

		if (asset) {
			this.name = asset.name;
			this.category = asset.category;
			this.imageFile = asset.imageFile;
			this.defaultWidth = asset.defaultWidth;
			this.defaultHeight = asset.defaultHeight;

			if (asset.doorConfig) {
				// Migrate legacy 'normal'/'custom-pivot' to 'pivot'
				const b = asset.doorConfig.behaviour;
				this.doorBehaviour = (b === 'normal' || b === 'custom-pivot') ? 'pivot' : b;
			}
			if (asset.scatterConfig) {
				this.scatterBlocksVision = asset.scatterConfig.blocksVision;
				this.scatterWallHeight = asset.scatterConfig.wallHeight ?? 5;
			}
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('env-asset-library-modal');

		contentEl.createEl('h2', { text: this.asset ? 'Edit Environment Asset' : 'Create Environment Asset' });

		// ── Preview ──────────────────────────────────────────────────────────
		const previewWrap = contentEl.createDiv({ cls: 'env-asset-preview-container' });
		previewWrap.createEl('h3', { text: 'Preview' });
		this.previewEl = previewWrap.createDiv({ cls: 'env-asset-preview' });
		this.updatePreview();

		// ── Name ─────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Name')
			.setDesc('A descriptive name for this asset')
			.addText(text => text
				.setValue(this.name)
				.setPlaceholder('e.g. Wooden Door, Boulder, …')
				.onChange(v => { this.name = v; })
			);

		// ── Category ─────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Category')
			.setDesc('Determines available configuration options')
			.addDropdown(dd => {
				for (const cat of ENV_ASSET_CATEGORIES) {
					dd.addOption(cat.value, `${cat.icon} ${cat.label}`);
				}
				dd.setValue(this.category);
				dd.onChange(v => {
					this.category = v as EnvAssetCategory;
					this.toggleCategoryControls();
					this.updatePreview();
				});
			});

		// ── Image ────────────────────────────────────────────────────────────
		const imgSetting = new Setting(contentEl)
			.setName('Asset Image (PNG)')
			.setDesc(this.imageFile ? `Selected: ${this.imageFile}` : 'Choose a PNG with transparency');

		imgSetting.addButton(btn => btn
			.setButtonText('Browse Vault')
			.onClick(() => {
				const pngFiles = this.app.vault.getFiles().filter(f =>
					/^png$/i.test(f.extension)
				);
				pngFiles.sort((a, b) => {
					const aA = a.path.startsWith('z_Assets') ? 0 : 1;
					const bA = b.path.startsWith('z_Assets') ? 0 : 1;
					if (aA !== bA) return aA - bA;
					return a.path.localeCompare(b.path);
				});
				new EnvAssetImageBrowser(this.app, pngFiles, (file: TFile) => {
					this.imageFile = file.path;
					imgSetting.setDesc(`Selected: ${this.imageFile}`);
					// Try to read natural dimensions
					this.readImageDimensions(file.path);
					this.updatePreview();
				}).open();
			})
		);

		imgSetting.addButton(btn => btn
			.setButtonText('Import File')
			.onClick(() => {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.png';
				input.addEventListener('change', async () => {
					const file = input.files?.[0];
					if (!file) return;
					try {
						const buffer = await file.arrayBuffer();
						const folder = 'z_Assets/EnvAssets';
						if (!this.app.vault.getAbstractFileByPath('z_Assets')) {
							await this.app.vault.createFolder('z_Assets');
						}
						if (!this.app.vault.getAbstractFileByPath(folder)) {
							await this.app.vault.createFolder(folder);
						}
						const dest = `${folder}/${file.name}`;
						const existing = this.app.vault.getAbstractFileByPath(dest);
						if (!existing) {
							await this.app.vault.createBinary(dest, buffer);
						}
						this.imageFile = dest;
						imgSetting.setDesc(`Selected: ${this.imageFile}`);
						this.readImageDimensions(dest);
						this.updatePreview();
						new Notice(`Image saved to ${dest}`);
					} catch (err) {
						new Notice('Failed to import image');
						console.error(err);
					}
				});
				input.click();
			})
		);

		if (this.imageFile) {
			imgSetting.addButton(btn => btn
				.setButtonText('Clear')
				.onClick(() => {
					this.imageFile = '';
					imgSetting.setDesc('Choose a PNG with transparency');
					this.updatePreview();
				})
			);
		}

		// ── Default Size ─────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Default Width (px)')
			.setDesc('Initial width when placed on the map')
			.addText(text => text
				.setValue(String(this.defaultWidth))
				.setPlaceholder('70')
				.onChange(v => { this.defaultWidth = Math.max(10, parseInt(v) || 70); })
			);

		new Setting(contentEl)
			.setName('Default Height (px)')
			.setDesc('Initial height when placed on the map')
			.addText(text => text
				.setValue(String(this.defaultHeight))
				.setPlaceholder('70')
				.onChange(v => { this.defaultHeight = Math.max(10, parseInt(v) || 70); })
			);

		// ── Door Configuration ───────────────────────────────────────────────
		this.doorConfigEl = contentEl.createDiv({ cls: 'env-asset-door-config' });
		this.doorConfigEl.createEl('h3', { text: '🚪 Door Configuration' });

		new Setting(this.doorConfigEl)
			.setName('Door Behaviour')
			.setDesc('How the door opens')
			.addDropdown(dd => {
				for (const b of DOOR_BEHAVIOURS) {
					dd.addOption(b.value, `${b.icon} ${b.label}`);
				}
				dd.setValue(this.doorBehaviour);
				dd.onChange(v => {
					this.doorBehaviour = v as DoorBehaviour;
					this.toggleDoorSubControls();
				});
			});

		// Pivot info (pivot door)
		const pivotInfoEl = this.doorConfigEl.createDiv();
		pivotInfoEl.createEl('p', {
			text: 'Pivot point is set on the map — select the door and drag the yellow handle.',
			cls: 'setting-item-description'
		});

		// Sliding path info (set on the map later)
		this.doorSlideEl = this.doorConfigEl.createDiv();
		this.doorSlideEl.createEl('p', {
			text: 'Sliding path is configured on the map after placement.',
			cls: 'setting-item-description'
		});

		// ── Scatter Configuration ────────────────────────────────────────────
		this.scatterConfigEl = contentEl.createDiv({ cls: 'env-asset-scatter-config' });
		this.scatterConfigEl.createEl('h3', { text: '🪨 Scatter Configuration' });

		new Setting(this.scatterConfigEl)
			.setName('Blocks Vision')
			.setDesc('If enabled, a wall segment is generated along the bounding box')
			.addToggle(toggle => toggle
				.setValue(this.scatterBlocksVision)
				.onChange(v => {
					this.scatterBlocksVision = v;
					this.toggleScatterHeightControl();
				})
			);

		this.scatterHeightEl = this.scatterConfigEl.createDiv();
		new Setting(this.scatterHeightEl)
			.setName('Wall Height (ft)')
			.setDesc('Effective height of the scatter for partial cover (5 = normal wall)')
			.addText(t => t
				.setValue(String(this.scatterWallHeight))
				.setPlaceholder('5')
				.onChange(v => { this.scatterWallHeight = Math.max(0, parseInt(v) || 5); })
			);

		// ── Initialize visibility ────────────────────────────────────────────
		this.toggleCategoryControls();
		this.toggleDoorSubControls();
		this.toggleScatterHeightControl();

		// ── Buttons ──────────────────────────────────────────────────────────
		const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		const saveBtn = btnContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.save());
		const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	// ── Visibility helpers ───────────────────────────────────────────────────

	private toggleCategoryControls() {
		this.doorConfigEl.style.display = this.category === 'door' ? '' : 'none';
		this.scatterConfigEl.style.display = this.category === 'scatter' ? '' : 'none';
	}

	private toggleDoorSubControls() {
		this.doorSlideEl.style.display = this.doorBehaviour === 'sliding' ? '' : 'none';
	}

	private toggleScatterHeightControl() {
		this.scatterHeightEl.style.display = this.scatterBlocksVision ? '' : 'none';
	}

	// ── Preview ──────────────────────────────────────────────────────────────

	private updatePreview() {
		if (!this.previewEl) return;
		this.previewEl.empty();

		const wrap = this.previewEl.createDiv({ cls: 'env-asset-preview-item' });
		wrap.style.width = '120px';
		wrap.style.height = '120px';
		wrap.style.display = 'flex';
		wrap.style.alignItems = 'center';
		wrap.style.justifyContent = 'center';
		wrap.style.position = 'relative';
		wrap.style.border = '2px dashed var(--background-modifier-border)';
		wrap.style.borderRadius = '6px';
		wrap.style.overflow = 'hidden';

		if (this.imageFile) {
			try {
				const rp = this.app.vault.adapter.getResourcePath(this.imageFile);
				const img = wrap.createEl('img');
				img.src = rp;
				img.style.maxWidth = '100%';
				img.style.maxHeight = '100%';
				img.style.objectFit = 'contain';
			} catch {
				wrap.createEl('span', { text: 'Image not found' });
			}
		} else {
			const catMeta = ENV_ASSET_CATEGORIES.find(c => c.value === this.category);
			wrap.createEl('span', { text: catMeta?.icon || '❓' });
			wrap.style.fontSize = '48px';
		}
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private async readImageDimensions(path: string) {
		try {
			const rp = this.app.vault.adapter.getResourcePath(path);
			const img = new Image();
			img.src = rp;
			await new Promise<void>((res, rej) => {
				img.onload = () => res();
				img.onerror = () => rej();
			});
			this.defaultWidth = img.naturalWidth;
			this.defaultHeight = img.naturalHeight;
		} catch { /* ignore – keep manually entered values */ }
	}

	private async save() {
		if (!this.name.trim()) {
			new Notice('Enter a name for the asset');
			return;
		}
		if (!this.imageFile) {
			new Notice('Select an image for the asset');
			return;
		}

		const now = Date.now();
		const def: EnvAssetDefinition = {
			id: this.asset?.id || this.assetLibrary.generateId(),
			name: this.name.trim(),
			category: this.category,
			imageFile: this.imageFile,
			defaultWidth: this.defaultWidth,
			defaultHeight: this.defaultHeight,
			createdAt: this.asset?.createdAt || now,
			updatedAt: now,
		};

		if (this.category === 'door') {
			const dc: DoorConfig = { behaviour: this.doorBehaviour };
			if (this.doorBehaviour !== 'sliding') {
				// Default pivot: left edge center
				dc.customPivot = { x: 0, y: 0.5 };
			}
			def.doorConfig = dc;
		} else if (this.category === 'scatter') {
			const sc: ScatterConfig = { blocksVision: this.scatterBlocksVision };
			if (this.scatterBlocksVision) {
				sc.wallHeight = this.scatterWallHeight;
			}
			def.scatterConfig = sc;
		}

		await this.assetLibrary.setAsset(def);
		this.onSave(def);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ─── Image browser (PNG-only) ────────────────────────────────────────────────

class EnvAssetImageBrowser extends Modal {
	private files: TFile[];
	private onSelect: (file: TFile) => void;

	constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Select Asset Image (PNG)' });

		const searchWrap = contentEl.createDiv();
		searchWrap.style.marginBottom = '10px';
		const searchInput = searchWrap.createEl('input', { type: 'text', placeholder: 'Filter images…' });
		searchInput.style.width = '100%';
		searchInput.style.padding = '8px';
		searchInput.style.borderRadius = '4px';
		searchInput.style.border = '1px solid var(--background-modifier-border)';

		const list = contentEl.createDiv({ cls: 'env-asset-image-browser-list' });
		list.style.maxHeight = '400px';
		list.style.overflowY = 'auto';
		list.style.display = 'grid';
		list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
		list.style.gap = '10px';
		list.style.padding = '10px';

		const render = (filter: string) => {
			list.empty();
			const filtered = filter
				? this.files.filter(f => f.path.toLowerCase().includes(filter.toLowerCase()))
				: this.files;

			for (const file of filtered) {
				const card = list.createDiv();
				card.style.display = 'flex';
				card.style.flexDirection = 'column';
				card.style.alignItems = 'center';
				card.style.padding = '8px';
				card.style.border = '1px solid var(--background-modifier-border)';
				card.style.borderRadius = '8px';
				card.style.cursor = 'pointer';
				card.style.transition = 'all 0.15s ease';

				const img = card.createEl('img');
				img.src = this.app.vault.adapter.getResourcePath(file.path);
				img.style.width = '80px';
				img.style.height = '80px';
				img.style.objectFit = 'contain';
				img.style.marginBottom = '6px';
				img.style.background = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 12px 12px';

				card.createEl('span', { text: file.name }).style.fontSize = '11px';

				card.addEventListener('mouseenter', () => {
					card.style.borderColor = 'var(--interactive-accent)';
					card.style.backgroundColor = 'var(--background-modifier-hover)';
				});
				card.addEventListener('mouseleave', () => {
					card.style.borderColor = 'var(--background-modifier-border)';
					card.style.backgroundColor = '';
				});
				card.addEventListener('click', () => {
					this.onSelect(file);
					this.close();
				});
			}

			if (filtered.length === 0) {
				list.createEl('p', { text: 'No PNG files found.' });
			}
		};

		render('');
		searchInput.addEventListener('input', () => render(searchInput.value));
		setTimeout(() => searchInput.focus(), 100);
	}

	onClose() {
		this.contentEl.empty();
	}
}
