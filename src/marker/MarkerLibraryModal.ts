import { App, Modal, Setting, Notice, TFile, TFolder } from 'obsidian';
import { MarkerDefinition, MarkerType, CreatureSize } from './MarkerTypes';
import { MarkerLibrary } from './MarkerLibrary';

/** Predefined icon options for markers */
const MARKER_ICONS: { value: string; label: string }[] = [
	{ value: '', label: 'None' },
	{ value: '⚔️', label: '⚔️ Swords' },
	{ value: '🛡️', label: '🛡️ Shield' },
	{ value: '🗡️', label: '🗡️ Dagger' },
	{ value: '🏹', label: '🏹 Bow' },
	{ value: '🔮', label: '🔮 Crystal' },
	{ value: '💀', label: '💀 Skull' },
	{ value: '🐉', label: '🐉 Dragon' },
	{ value: '🧙', label: '🧙 Wizard' },
	{ value: '🧝', label: '🧝 Elf' },
	{ value: '🧟', label: '🧟 Zombie' },
	{ value: '👹', label: '👹 Ogre' },
	{ value: '👻', label: '👻 Ghost' },
	{ value: '🐺', label: '🐺 Wolf' },
	{ value: '🕷️', label: '🕷️ Spider' },
	{ value: '🦇', label: '🦇 Bat' },
	{ value: '🐻', label: '🐻 Bear' },
	{ value: '🐍', label: '🐍 Snake' },
	{ value: '🦎', label: '🦎 Lizard' },
	{ value: '👑', label: '👑 Crown' },
	{ value: '🔥', label: '🔥 Fire' },
	{ value: '❄️', label: '❄️ Ice' },
	{ value: '⚡', label: '⚡ Lightning' },
	{ value: '💎', label: '💎 Gem' },
	{ value: '🏰', label: '🏰 Castle' },
	{ value: '⛺', label: '⛺ Camp' },
	{ value: '🏠', label: '🏠 House' },
	{ value: '📍', label: '📍 Pin' },
	{ value: '⭐', label: '⭐ Star' },
	{ value: '❌', label: '❌ X Mark' },
	{ value: '❗', label: '❗ Alert' },
	{ value: '❓', label: '❓ Question' },
	{ value: '🚪', label: '🚪 Door' },
	{ value: '🔑', label: '🔑 Key' },
	{ value: '💰', label: '💰 Treasure' },
	{ value: '🧪', label: '🧪 Potion' },
	{ value: '📜', label: '📜 Scroll' },
	{ value: '🪦', label: '🪦 Grave' },
	{ value: '🌲', label: '🌲 Tree' },
	{ value: '⛰️', label: '⛰️ Mountain' },
	{ value: '🌊', label: '🌊 Water' },
];

export class MarkerLibraryModal extends Modal {
	private markerLibrary: MarkerLibrary;
	private marker: MarkerDefinition | null;
	private onSave: (marker: MarkerDefinition) => void;
	private previewEl!: HTMLElement;
	private creatureSizeSettingEl!: HTMLElement;
	private pixelSizeSettingEl!: HTMLElement;
	private darkvisionSettingEl!: HTMLElement;

	// Form values
	private name: string = '';
	private type: MarkerType = 'creature';
	private icon: string = '';
	private backgroundColor: string = '#ff0000';
	private imageFile: string = '';
	private creatureSize: CreatureSize = 'medium';
	private pixelSize: number = 40;
	private darkvision: number = 0;

	constructor(
		app: App,
		markerLibrary: MarkerLibrary,
		marker: MarkerDefinition | null,
		onSave: (marker: MarkerDefinition) => void
	) {
		super(app);
		this.markerLibrary = markerLibrary;
		this.marker = marker;
		this.onSave = onSave;

		if (marker) {
			this.name = marker.name;
			this.type = marker.type || 'other';
			this.icon = marker.icon;
			this.backgroundColor = marker.backgroundColor;
			this.imageFile = marker.imageFile || '';
			this.creatureSize = marker.creatureSize || 'medium';
			this.pixelSize = marker.pixelSize || 40;
			this.darkvision = marker.darkvision || 0;
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('marker-library-modal');

		contentEl.createEl('h2', { text: this.marker ? 'Edit Marker' : 'Create Marker' });

		// Preview
		const previewContainer = contentEl.createDiv({ cls: 'marker-preview-container' });
		previewContainer.createEl('h3', { text: 'Preview' });
		this.previewEl = previewContainer.createDiv({ cls: 'marker-preview' });
		this.updatePreview();

		// Name
		const nameSetting = new Setting(contentEl)
			.setName('Name')
			.setDesc('A descriptive name for this marker')
			.addText(text => {
				text
					.setValue(this.name)
					.onChange(value => { this.name = value; })
					.setPlaceholder('Enter marker name');
			});

		// Marker Type
		new Setting(contentEl)
			.setName('Marker Type')
			.setDesc('Player/NPC/Creature use D&D sizes; POI/Other use pixel size')
			.addDropdown(dropdown => dropdown
				.addOption('player', 'Player Character')
				.addOption('npc', 'NPC')
				.addOption('creature', 'Creature / Monster')
				.addOption('poi', 'Point of Interest')
				.addOption('other', 'Other')
				.setValue(this.type)
				.onChange(value => {
					this.type = value as MarkerType;
					this.toggleSizeControls();
					this.updatePreview();
				})
			);

		// Creature Size (shown for player/npc/creature)
		const creatureSizeSetting = new Setting(contentEl)
			.setName('Creature Size')
			.setDesc('D&D size category — determines how many grid squares the token covers')
			.addDropdown(dropdown => dropdown
				.addOption('tiny', 'Tiny (shares 1×1)')
				.addOption('small', 'Small (1×1)')
				.addOption('medium', 'Medium (1×1)')
				.addOption('large', 'Large (2×2)')
				.addOption('huge', 'Huge (3×3)')
				.addOption('gargantuan', 'Gargantuan (4×4)')
				.setValue(this.creatureSize)
				.onChange(value => {
					this.creatureSize = value as CreatureSize;
					this.updatePreview();
				})
			);
		this.creatureSizeSettingEl = creatureSizeSetting.settingEl;

		// Darkvision (shown for player/npc/creature)
		const darkvisionSetting = new Setting(contentEl)
			.setName('Darkvision')
			.setDesc('Default darkvision range in feet (0-300)')
			.addText(text => text
				.setValue(this.darkvision > 0 ? this.darkvision.toString() : '')
				.setPlaceholder('0')
				.onChange(value => {
					const num = parseInt(value) || 0;
					this.darkvision = Math.max(0, Math.min(300, num));
				})
			);
		this.darkvisionSettingEl = darkvisionSetting.settingEl;

		// Pixel Size (shown for poi/other)
		const pixelSizeSetting = new Setting(contentEl)
			.setName('Size (pixels)')
			.setDesc('Marker diameter in pixels (20–100)')
			.addSlider(slider => slider
				.setLimits(20, 100, 5)
				.setValue(this.pixelSize)
				.setDynamicTooltip()
				.onChange(value => {
					this.pixelSize = value;
					this.updatePreview();
				})
			);
		this.pixelSizeSettingEl = pixelSizeSetting.settingEl;

		// Custom Image
		const imageSetting = new Setting(contentEl)
			.setName('Token Image')
			.setDesc(this.imageFile ? `Selected: ${this.imageFile}` : 'Choose an image for the marker background');

		imageSetting.addButton(btn => btn
			.setButtonText('Browse Vault')
			.onClick(() => {
				// Get all image files from the vault
				const imageFiles = this.app.vault.getFiles().filter(f =>
					/^(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(f.extension)
				);
				// Sort z_Assets files first, then by path
				imageFiles.sort((a, b) => {
					const aAsset = a.path.startsWith('z_Assets') ? 0 : 1;
					const bAsset = b.path.startsWith('z_Assets') ? 0 : 1;
					if (aAsset !== bAsset) return aAsset - bAsset;
					return a.path.localeCompare(b.path);
				});
				new ImageBrowserModal(this.app, imageFiles, (file: TFile) => {
					this.imageFile = file.path;
					imageSetting.setDesc(`Selected: ${this.imageFile}`);
					this.updatePreview();
				}).open();
			})
		);

		imageSetting.addButton(btn => btn
			.setButtonText('Import File')
			.onClick(() => {
				// Use hidden file input to pick from OS file system
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = 'image/*';
				input.addEventListener('change', async () => {
					const file = input.files?.[0];
					if (!file) return;
					try {
						const buffer = await file.arrayBuffer();
						// Ensure z_Assets folder exists
						const assetsFolder = this.app.vault.getAbstractFileByPath('z_Assets');
						if (!assetsFolder) {
							await this.app.vault.createFolder('z_Assets');
						}
						// Save to z_Assets with original filename
						const destPath = `z_Assets/${file.name}`;
						const existing = this.app.vault.getAbstractFileByPath(destPath);
						if (existing) {
							// File already exists, just use it
							this.imageFile = destPath;
						} else {
							await this.app.vault.createBinary(destPath, buffer);
							this.imageFile = destPath;
						}
						imageSetting.setDesc(`Selected: ${this.imageFile}`);
						this.updatePreview();
						new Notice(`Image saved to ${destPath}`);
					} catch (err) {
						new Notice('Failed to import image');
						console.error('Image import error:', err);
					}
				});
				input.click();
			})
		);

		if (this.imageFile) {
			imageSetting.addButton(btn => btn
				.setButtonText('Clear')
				.onClick(() => {
					this.imageFile = '';
					imageSetting.setDesc('Choose an image for the marker background');
					this.updatePreview();
				})
			);
		}

		// Icon/Emoji
		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Displayed on top of the marker background')
			.addDropdown(dropdown => {
				for (const opt of MARKER_ICONS) {
					dropdown.addOption(opt.value, opt.label);
				}
				dropdown.setValue(this.icon);
				dropdown.onChange(value => {
					this.icon = value;
					this.updatePreview();
				});
			});

		// Background Color
		new Setting(contentEl)
			.setName('Background Color')
			.setDesc('Used when no image is set')
			.addColorPicker(color => color
				.setValue(this.backgroundColor)
				.onChange(value => {
					this.backgroundColor = value;
					this.updatePreview();
				})
			);

		this.toggleSizeControls();

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.save());
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	private toggleSizeControls() {
		const isCreature = ['player', 'npc', 'creature'].includes(this.type);
		this.creatureSizeSettingEl.style.display = isCreature ? '' : 'none';
		this.darkvisionSettingEl.style.display = isCreature ? '' : 'none';
		this.pixelSizeSettingEl.style.display = isCreature ? 'none' : '';
	}

	private updatePreview() {
		if (!this.previewEl) return;
		this.previewEl.empty();

		let displaySize = 60;
		if (['player', 'npc', 'creature'].includes(this.type)) {
			const mult: Record<CreatureSize, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
			displaySize = 50 * (mult[this.creatureSize] || 1);
		} else {
			displaySize = this.pixelSize;
		}

		const el = this.previewEl.createDiv({ cls: 'marker-preview-item' });
		el.style.width = `${displaySize}px`;
		el.style.height = `${displaySize}px`;
		el.style.borderRadius = '50%';
		el.style.display = 'flex';
		el.style.alignItems = 'center';
		el.style.justifyContent = 'center';
		el.style.fontSize = `${Math.max(12, displaySize * 0.5)}px`;
		el.style.overflow = 'hidden';
		el.style.position = 'relative';

		if (this.imageFile) {
			try {
				const resourcePath = this.app.vault.adapter.getResourcePath(this.imageFile);
				el.style.backgroundImage = `url("${resourcePath}")`;
				el.style.backgroundSize = 'cover';
				el.style.backgroundPosition = 'center';
			} catch {
				el.style.backgroundColor = this.backgroundColor;
			}
		} else {
			el.style.backgroundColor = this.backgroundColor;
		}

		if (this.icon) {
			const iconEl = el.createSpan();
			iconEl.textContent = this.icon;
			iconEl.style.position = 'relative';
			iconEl.style.zIndex = '1';
		}
	}

	private async save() {
		if (!this.name.trim()) {
			new Notice('Please enter a name for the marker');
			return;
		}

		const now = Date.now();
		const def: MarkerDefinition = {
			id: this.marker?.id || this.markerLibrary.generateId(),
			name: this.name.trim(),
			type: this.type,
			icon: this.icon,
			backgroundColor: this.backgroundColor,
			imageFile: this.imageFile || undefined,
			createdAt: this.marker?.createdAt || now,
			updatedAt: now
		};

		if (['player', 'npc', 'creature'].includes(this.type)) {
			def.creatureSize = this.creatureSize;
			if (this.darkvision > 0) {
				def.darkvision = this.darkvision;
			}
		} else {
			def.pixelSize = this.pixelSize;
		}

		await this.markerLibrary.setMarker(def);
		this.onSave(def);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Modal for browsing vault image files with preview
 */
class ImageBrowserModal extends Modal {
	private files: TFile[];
	private onSelect: (file: TFile) => void;
	private filterText: string = '';

	constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Select Token Image' });

		// Search filter
		const searchContainer = contentEl.createDiv();
		searchContainer.style.marginBottom = '10px';
		const searchInput = searchContainer.createEl('input', { type: 'text', placeholder: 'Filter images...' });
		searchInput.style.width = '100%';
		searchInput.style.padding = '8px';
		searchInput.style.borderRadius = '4px';
		searchInput.style.border = '1px solid var(--background-modifier-border)';

		const listContainer = contentEl.createDiv({ cls: 'image-browser-list' });
		listContainer.style.maxHeight = '400px';
		listContainer.style.overflowY = 'auto';
		listContainer.style.display = 'grid';
		listContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
		listContainer.style.gap = '10px';
		listContainer.style.padding = '10px';

		const renderFiles = (filter: string) => {
			listContainer.empty();
			const filtered = filter
				? this.files.filter(f => f.path.toLowerCase().includes(filter.toLowerCase()))
				: this.files;

			for (const file of filtered) {
				const card = listContainer.createDiv();
				card.style.display = 'flex';
				card.style.flexDirection = 'column';
				card.style.alignItems = 'center';
				card.style.padding = '8px';
				card.style.border = '1px solid var(--background-modifier-border)';
				card.style.borderRadius = '8px';
				card.style.cursor = 'pointer';
				card.style.transition = 'all 0.15s ease';

				// Image preview
				const img = card.createEl('img');
				img.src = this.app.vault.adapter.getResourcePath(file.path);
				img.style.width = '80px';
				img.style.height = '80px';
				img.style.objectFit = 'cover';
				img.style.borderRadius = '50%';
				img.style.marginBottom = '6px';

				// Filename
				card.createEl('span', {
					text: file.name,
					cls: 'image-browser-name'
				}).style.fontSize = '11px';

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
				listContainer.createEl('p', { text: 'No images found.', cls: 'marker-picker-empty' });
			}
		};

		renderFiles('');
		searchInput.addEventListener('input', () => renderFiles(searchInput.value));
		// Focus the search input after a small delay to ensure modal is ready
		setTimeout(() => searchInput.focus(), 100);
	}

	onClose() {
		this.contentEl.empty();
	}
}
