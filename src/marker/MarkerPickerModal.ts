import { App, Modal, Notice } from 'obsidian';
import { MarkerLibrary } from './MarkerLibrary';
import { MarkerLibraryModal } from './MarkerLibraryModal';
import { MarkerDefinition, CreatureSize } from './MarkerTypes';

const SIZE_LABELS: Record<CreatureSize, string> = {
	tiny: 'Tiny', small: 'Small', medium: 'Medium',
	large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan'
};

const TYPE_LABELS: Record<string, string> = {
	player: '🛡️ Player Characters',
	npc: '👤 NPCs',
	creature: '🐉 Creatures',
	poi: '📍 Points of Interest',
	other: '📦 Other'
};

const TYPE_ORDER: string[] = ['player', 'npc', 'creature', 'poi', 'other'];

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
			// Search filter
			const searchContainer = contentEl.createDiv();
			searchContainer.style.marginBottom = '12px';
			const searchInput = searchContainer.createEl('input', { 
				type: 'text', 
				placeholder: 'Search markers...' 
			});
			searchInput.style.width = '100%';
			searchInput.style.padding = '8px';
			searchInput.style.borderRadius = '4px';
			searchInput.style.border = '1px solid var(--background-modifier-border)';
			searchInput.style.fontSize = '14px';

			const categoriesContainer = contentEl.createDiv({ cls: 'marker-categories-container' });

			// Helper to create a marker card
			const createMarkerCard = (marker: MarkerDefinition, container: HTMLElement) => {
				const card = container.createDiv({ cls: 'marker-picker-item' });
				card.style.position = 'relative';

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

				// Action buttons
				const actions = card.createDiv({ cls: 'marker-picker-actions' });
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
					new MarkerLibraryModal(this.app, this.markerLibrary, marker, () => {
						// Reopen picker after edit
						this.open();
					}).open();
				});

				const deleteBtn = actions.createEl('button', { text: '🗑️' });
				deleteBtn.style.fontSize = '11px';
				deleteBtn.style.padding = '2px 6px';
				deleteBtn.style.color = 'var(--text-error)';
				deleteBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					// Confirm deletion
					const confirmed = confirm(`Delete marker "${marker.name}"?`);
					if (confirmed) {
						await this.markerLibrary.deleteMarker(marker.id);
						new Notice(`Deleted marker: ${marker.name}`);
						// Refresh the modal
						this.onOpen();
					}
				});

				// Click on card to select
				card.addEventListener('click', () => {
					this.onSelect(marker.id);
					this.close();
				});
			};

			const renderMarkers = (filter: string) => {
				categoriesContainer.empty();
				
				// Filter markers based on search text
				const filteredMarkers = filter
					? markers.filter(m => 
						m.name.toLowerCase().includes(filter.toLowerCase()) ||
						m.type.toLowerCase().includes(filter.toLowerCase()) ||
						(m.creatureSize && SIZE_LABELS[m.creatureSize].toLowerCase().includes(filter.toLowerCase()))
					)
					: markers;

				if (filteredMarkers.length === 0) {
					categoriesContainer.createEl('p', { 
						text: 'No markers found.',
						cls: 'marker-picker-empty'
					});
					return;
				}

				// Group markers by type
				const markersByType: Record<string, MarkerDefinition[]> = {};
				for (const marker of filteredMarkers) {
					if (!markersByType[marker.type]) {
						markersByType[marker.type] = [];
					}
					markersByType[marker.type].push(marker);
				}

				// Render each type category
				for (const type of TYPE_ORDER) {
					const typeMarkers = markersByType[type];
					if (!typeMarkers || typeMarkers.length === 0) continue;

					// Category wrapper
					const categorySection = categoriesContainer.createDiv({ cls: 'marker-category-section' });

					// Category header (collapsible) - full width horizontal bar
					const categoryHeader = categorySection.createDiv({ cls: 'marker-category-header' });
					categoryHeader.style.display = 'flex';
					categoryHeader.style.alignItems = 'center';
					categoryHeader.style.justifyContent = 'space-between';
					categoryHeader.style.padding = '12px 16px';
					categoryHeader.style.marginTop = '4px';
					categoryHeader.style.marginBottom = '0';
					categoryHeader.style.cursor = 'pointer';
					categoryHeader.style.fontWeight = '600';
					categoryHeader.style.fontSize = '14px';
					categoryHeader.style.backgroundColor = 'var(--background-secondary)';
					categoryHeader.style.borderRadius = '6px';
					categoryHeader.style.userSelect = 'none';
					categoryHeader.style.transition = 'background-color 0.15s ease';

					const headerLeft = categoryHeader.createDiv();
					headerLeft.style.display = 'flex';
					headerLeft.style.alignItems = 'center';
					headerLeft.style.gap = '8px';

					const toggleIcon = headerLeft.createSpan({ text: '▼' });
					toggleIcon.style.fontSize = '10px';
					toggleIcon.style.transition = 'transform 0.2s ease';
					toggleIcon.style.display = 'inline-block';

					headerLeft.createSpan({ text: TYPE_LABELS[type] });

					const countBadge = categoryHeader.createSpan({ text: `${typeMarkers.length}` });
					countBadge.style.fontSize = '12px';
					countBadge.style.padding = '2px 8px';
					countBadge.style.borderRadius = '10px';
					countBadge.style.backgroundColor = 'var(--background-modifier-border)';
					countBadge.style.fontWeight = '500';

					// Category content container
					const categoryContent = categorySection.createDiv({ cls: 'marker-category-content' });
					categoryContent.style.display = 'grid';
					categoryContent.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
					categoryContent.style.gap = '10px';
					categoryContent.style.padding = '12px 8px';

					// Render markers in this category
					for (const marker of typeMarkers) {
						createMarkerCard(marker, categoryContent);
					}

					// Hover effect on header
					categoryHeader.addEventListener('mouseenter', () => {
						categoryHeader.style.backgroundColor = 'var(--background-modifier-hover)';
					});
					categoryHeader.addEventListener('mouseleave', () => {
						categoryHeader.style.backgroundColor = 'var(--background-secondary)';
					});

					// Toggle collapse on click
					let collapsed = false;
					categoryHeader.addEventListener('click', () => {
						collapsed = !collapsed;
						if (collapsed) {
							categoryContent.style.display = 'none';
							toggleIcon.style.transform = 'rotate(-90deg)';
						} else {
							categoryContent.style.display = 'grid';
							toggleIcon.style.transform = 'rotate(0deg)';
						}
					});
				}
			};

			// Initial render and search listener
			renderMarkers('');
			searchInput.addEventListener('input', () => renderMarkers(searchInput.value));
			// Focus the search input after a small delay to ensure modal is ready
			setTimeout(() => searchInput.focus(), 100);
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
