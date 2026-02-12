import { App, Modal, Setting } from 'obsidian';
import { MarkerDefinition } from './MarkerTypes';
import { MarkerLibrary } from './MarkerLibrary';

export class MarkerLibraryModal extends Modal {
	private markerLibrary: MarkerLibrary;
	private marker: MarkerDefinition | null;
	private onSave: (marker: MarkerDefinition) => void;
	private previewEl!: HTMLElement;

	// Form values
	private name: string = '';
	private icon: string = '📍';
	private backgroundColor: string = '#ff0000';
	private borderColor: string = '';
	private size: number = 40;

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

		// If editing, load values
		if (marker) {
			this.name = marker.name;
			this.icon = marker.icon;
			this.backgroundColor = marker.backgroundColor;
			this.borderColor = marker.borderColor || '';
			this.size = marker.size;
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

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
				.onChange(value => {
					this.name = value;
				})
			);

		// Icon/Emoji
		new Setting(contentEl)
			.setName('Icon')
			.setDesc('Emoji or text to display on the marker')
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
			.setDesc('Hex color code (e.g., #ff0000)')
			.addText(text => text
				.setValue(this.backgroundColor)
				.onChange(value => {
					this.backgroundColor = value;
					this.updatePreview();
				})
			)
			.addColorPicker(color => color
				.setValue(this.backgroundColor)
				.onChange(value => {
					this.backgroundColor = value;
					// Update text input
					const textInput = contentEl.querySelector('.marker-bg-color-input') as HTMLInputElement;
					if (textInput) {
						textInput.value = value;
					}
					this.updatePreview();
				})
			);

		// Add class to the background color text input for reference
		const bgColorSetting = contentEl.querySelector('.setting-item:last-of-type input[type="text"]') as HTMLInputElement;
		if (bgColorSetting) {
			bgColorSetting.classList.add('marker-bg-color-input');
		}

		// Border Color (optional)
		new Setting(contentEl)
			.setName('Border Color')
			.setDesc('Optional border color (leave empty for no border)')
			.addText(text => text
				.setValue(this.borderColor)
				.setPlaceholder('#000000')
				.onChange(value => {
					this.borderColor = value;
					this.updatePreview();
				})
			)
			.addColorPicker(color => color
				.setValue(this.borderColor || '#000000')
				.onChange(value => {
					this.borderColor = value;
					// Update text input
					const textInput = contentEl.querySelector('.marker-border-color-input') as HTMLInputElement;
					if (textInput) {
						textInput.value = value;
					}
					this.updatePreview();
				})
			);

		// Add class to the border color text input for reference
		const borderColorSetting = contentEl.querySelector('.setting-item:last-of-type input[type="text"]') as HTMLInputElement;
		if (borderColorSetting) {
			borderColorSetting.classList.add('marker-border-color-input');
		}

		// Size
		new Setting(contentEl)
			.setName('Size')
			.setDesc('Marker diameter in pixels (20-100)')
			.addSlider(slider => slider
				.setLimits(20, 100, 5)
				.setValue(this.size)
				.setDynamicTooltip()
				.onChange(value => {
					this.size = value;
					this.updatePreview();
				})
			);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.save());

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	private updatePreview() {
		if (!this.previewEl) return;

		this.previewEl.empty();

		const marker = this.previewEl.createDiv({
			cls: 'marker-preview-item'
		});

		marker.style.width = `${this.size}px`;
		marker.style.height = `${this.size}px`;
		marker.style.borderRadius = '50%';
		marker.style.backgroundColor = this.backgroundColor;
		marker.style.display = 'flex';
		marker.style.alignItems = 'center';
		marker.style.justifyContent = 'center';
		marker.style.fontSize = `${this.size * 0.6}px`;

		if (this.borderColor) {
			marker.style.border = `3px solid ${this.borderColor}`;
		}

		marker.textContent = this.icon;
	}

	private async save() {
		// Validate
		if (!this.name.trim()) {
			// TODO: Show error
			return;
		}

		const now = Date.now();
		const marker: MarkerDefinition = {
			id: this.marker?.id || this.markerLibrary.generateId(),
			name: this.name.trim(),
			icon: this.icon || '📍',
			backgroundColor: this.backgroundColor,
			borderColor: this.borderColor || undefined,
			size: this.size,
			createdAt: this.marker?.createdAt || now,
			updatedAt: now
		};

		await this.markerLibrary.setMarker(marker);
		this.onSave(marker);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
