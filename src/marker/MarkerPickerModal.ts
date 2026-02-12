import { App, Modal } from 'obsidian';
import { MarkerLibrary } from './MarkerLibrary';
import { MarkerLibraryModal } from './MarkerLibraryModal';
import { MarkerDefinition } from './MarkerTypes';

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
				text: 'No markers available. Create your first marker!',
				cls: 'marker-picker-empty'
			});
		} else {
			const markerGrid = contentEl.createDiv({ cls: 'marker-picker-grid' });

			markers.forEach(marker => {
				const markerItem = markerGrid.createDiv({ cls: 'marker-picker-item' });
				
				// Preview
				const preview = markerItem.createDiv({ cls: 'marker-picker-preview' });
				preview.style.width = `${marker.size}px`;
				preview.style.height = `${marker.size}px`;
				preview.style.borderRadius = '50%';
				preview.style.backgroundColor = marker.backgroundColor;
				preview.style.display = 'flex';
				preview.style.alignItems = 'center';
				preview.style.justifyContent = 'center';
				preview.style.fontSize = `${marker.size * 0.6}px`;
				
				if (marker.borderColor) {
					preview.style.border = `3px solid ${marker.borderColor}`;
				}
				
				preview.textContent = marker.icon;
				
				// Name
				markerItem.createEl('span', { 
					text: marker.name, 
					cls: 'marker-picker-name' 
				});
				
				// Click to select
				markerItem.addEventListener('click', () => {
					this.onSelect(marker.id);
					this.close();
				});
			});
		}

		// Create new marker button
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const createBtn = buttonContainer.createEl('button', { 
			text: 'Create New Marker', 
			cls: 'mod-cta' 
		});
		
		createBtn.addEventListener('click', () => {
			this.close();
			new MarkerLibraryModal(
				this.app,
				this.markerLibrary,
				null,
				(marker: MarkerDefinition) => {
					// After creating, automatically select it
					this.onSelect(marker.id);
				}
			).open();
		});

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
