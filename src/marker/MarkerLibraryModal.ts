import { App, Modal, Setting, Notice } from 'obsidian';
import { MarkerDefinition, MarkerType, CreatureSize } from './MarkerTypes';
import { MarkerLibrary } from './MarkerLibrary';

export class MarkerLibraryModal extends Modal {
	private markerLibrary: MarkerLibrary;
	private marker: MarkerDefinition | null;
	private onSave: (marker: MarkerDefinition) => void;
	private previewEl!: HTMLElement;
	private creatureSizeSettingEl!: HTMLElement;
	private pixelSizeSettingEl!: HTMLElement;

	// Form values
	private name: string = '';
	private type: MarkerType = 'creature';
	private icon: string = '📍';
	private backgroundColor: string = '#ff0000';
	private borderColor: string = '';
	private imageFile: string = '';
	private creatureSize: CreatureSize = 'medium';
	private pixelSize: number = 40;

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
			this.borderColor = marker.borderColor || '';
			this.imageFile = marker.imageFile || '';
			this.creatureSize = marker.creatureSize || 'medium';
			this.pixelSize = marker.pixelSize || 40;
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
		new Setting(contentEl)
			.setName('Name')
			.setDesc('A descriptive name for this marker')
			.addText(text => text
				.setValue(this.name)
				.onChange(value => { this.name = value; })
			);

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
		new Setting(contentEl)
			.setName('Custom Image')
			.setDesc('Vault path to an image file (used as marker background)')
			.addText(text => text
				.setPlaceholder('path/to/image.png')
				.setValue(this.imageFile)
				.onChange(value => {
					this.imageFile = value;
					this.updatePreview();
				})
			);

		// Icon/Emoji
		new Setting(contentEl)
			.setName('Icon / Emoji')
			.setDesc('Displayed on top of the marker background')
			.addText(text => text
				.setValue(this.icon)
				.onChange(value => {
					this.icon = value;
					this.updatePreview();
				})
			);

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

		// Border Color
		new Setting(contentEl)
			.setName('Border Color')
			.setDesc('Leave default for white border')
			.addColorPicker(color => color
				.setValue(this.borderColor || '#ffffff')
				.onChange(value => {
					this.borderColor = value;
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

		if (this.borderColor) {
			el.style.border = `3px solid ${this.borderColor}`;
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
			icon: this.icon || '📍',
			backgroundColor: this.backgroundColor,
			borderColor: this.borderColor || undefined,
			imageFile: this.imageFile || undefined,
			createdAt: this.marker?.createdAt || now,
			updatedAt: now
		};

		if (['player', 'npc', 'creature'].includes(this.type)) {
			def.creatureSize = this.creatureSize;
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
