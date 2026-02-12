import { App, Modal } from 'obsidian';
import { MarkerLibrary } from './MarkerLibrary';
import { MarkerLibraryModal } from './MarkerLibraryModal';
import { MarkerDefinition, CreatureSize } from './MarkerTypes';

const SIZE_LABELS: Record<CreatureSize, string> = {
	tiny: 'Tiny', small: 'Small', medium: 'Medium',
	large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan'
};

export class MarkerPickerModal extends Modal {
	private markerLibrary: MarkerLibrary;
	private onSelect: (markerId: string) => void;

	constructor(
		app: App,
		markerLibrary: MarkerLibrary,
		onSelect: (markerId: string) => void
	) {
		super(app);
		this.markerLibrary = markerLibrary;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Select Marker' });

		const markers = this.markerLibrary.getAllMarkers();

		if (markers.length === 0) {
			contentEl.createEl('p', { 
				text: 'No markers yet. Create your first one!',
				cls: 'marker-picker-empty'
			});
		} else {
			const markerGrid = contentEl.createDiv({ cls: 'marker-picker-grid' });

			for (const marker of markers) {
				const card = markerGrid.createDiv({ cls: 'marker-picker-item' });

				// Calculate display size for preview
				let displaySize = 50;
				if (['player', 'npc', 'creature'].includes(marker.type) && marker.creatureSize) {
					const mult: Record<CreatureSize, number> = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
					displaySize = Math.min(40 * (mult[marker.creatureSize] || 1), 80);
				} else if (marker.pixelSize) {
					displaySize = Math.min(marker.pixelSize, 60);
				}

				// Preview circle
				const preview = card.createDiv({ cls: 'marker-picker-preview' });
				preview.style.width = `${displaySize}px`;
				preview.style.height = `${displaySize}px`;
				preview.style.borderRadius = '50%';
				preview.style.display = 'flex';
				preview.style.alignItems = 'center';
				preview.style.justifyContent = 'center';
				preview.style.fontSize = `${Math.max(12, displaySize * 0.5)}px`;
				preview.style.overflow = 'hidden';
				preview.style.position = 'relative';
				preview.style.flexShrink = '0';

				if (marker.imageFile) {
					try {
						const rp = this.app.vault.adapter.getResourcePath(marker.imageFile);
						preview.style.backgroundImage = `url("${rp}")`;
						preview.style.backgroundSize = 'cover';
						preview.style.backgroundPosition = 'center';
					} catch {
						preview.style.backgroundColor = marker.backgroundColor;
					}
				} else {
					preview.style.backgroundColor = marker.backgroundColor;
				}

				if (marker.borderColor) {
					preview.style.border = `3px solid ${marker.borderColor}`;
				}

				if (marker.icon) {
					const iconSpan = preview.createSpan();
					iconSpan.textContent = marker.icon;
					iconSpan.style.position = 'relative';
					iconSpan.style.zIndex = '1';
				}

				// Info
				const info = card.createDiv({ cls: 'marker-picker-info' });
				info.createEl('span', { text: marker.name, cls: 'marker-picker-name' });

				if (['player', 'npc', 'creature'].includes(marker.type) && marker.creatureSize) {
					info.createEl('span', {
						text: SIZE_LABELS[marker.creatureSize],
						cls: 'marker-picker-size'
					});
				}

				card.addEventListener('click', () => {
					this.onSelect(marker.id);
					this.close();
				});
			}
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const createBtn = buttonContainer.createEl('button', { text: 'Create New Marker', cls: 'mod-cta' });
		createBtn.addEventListener('click', () => {
			this.close();
			new MarkerLibraryModal(this.app, this.markerLibrary, null, (marker: MarkerDefinition) => {
				this.onSelect(marker.id);
			}).open();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
