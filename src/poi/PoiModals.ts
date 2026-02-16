import { App, Modal, Notice, TFile, Setting, Editor } from 'obsidian';
import { POI_TYPES, PoiType } from '../map/types';
import { POI_TEMPLATE } from '../templates';

/**
 * Modal for editing an existing PoI
 */
export class PoiEditModal extends Modal {
	private filePath: string;
	private name: string = '';
	private poiType: PoiType = 'settlement';
	private icon: string = '🏛️';
	private region: string = '';
	private tags: string = '';
	private discovered: boolean = false;
	private visited: boolean = false;
	private questRelated: boolean = false;
	private dangerLevel: string = '';

	constructor(app: App, filePath: string) {
		super(app);
		this.filePath = filePath;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('poi-creation-modal');

		contentEl.createEl('h2', { text: '✏️ Edit Point of Interest' });

		// Load existing data
		const file = this.app.vault.getAbstractFileByPath(this.filePath);
		if (!(file instanceof TFile)) {
			new Notice('PoI file not found');
			this.close();
			return;
		}

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			new Notice('Invalid PoI file: missing frontmatter');
			this.close();
			return;
		}

		// Load current values
		this.name = cache.frontmatter.name || '';
		this.poiType = cache.frontmatter['poi-type'] || 'settlement';
		this.icon = cache.frontmatter.icon || '🏰';
		this.region = cache.frontmatter.region || '';
		this.discovered = cache.frontmatter.discovered || false;
		this.visited = cache.frontmatter.visited || false;
		this.questRelated = cache.frontmatter['quest-related'] || false;
		this.dangerLevel = cache.frontmatter['danger-level'] || '';
		
		// Parse tags
		const tagsArray = cache.frontmatter.tags || [];
		this.tags = Array.isArray(tagsArray) ? tagsArray.join(', ') : '';

		// Name
		new Setting(contentEl)
			.setName('Name')
			.setDesc('Name of this location')
			.addText(text => text
				.setPlaceholder('Waterdeep')
				.setValue(this.name)
				.onChange(value => this.name = value)
			);

		// Type (icon is automatically set based on type)
		new Setting(contentEl)
			.setName('Type')
			.setDesc('Category of this point of interest (icon will be set automatically)')
			.addDropdown(dropdown => {
				POI_TYPES.forEach(type => {
					dropdown.addOption(type.value, `${type.icon} ${type.label}`);
				});
				dropdown.setValue(this.poiType);
				dropdown.onChange(value => {
					this.poiType = value as PoiType;
					// Auto-update icon based on type
					const selectedType = POI_TYPES.find(t => t.value === value);
					if (selectedType) {
						this.icon = selectedType.icon;
					}
				});
			});

		// Region
		new Setting(contentEl)
			.setName('Region')
			.setDesc('Geographic region or area')
			.addText(text => text
				.setPlaceholder('Sword Coast')
				.setValue(this.region)
				.onChange(value => this.region = value)
			);

		// Discovery Status
		new Setting(contentEl)
			.setName('Discovery Status')
			.setDesc('Has the party discovered this location?')
			.addToggle(toggle => toggle
				.setValue(this.discovered)
				.onChange(value => this.discovered = value)
			);

		// Visited Status
		new Setting(contentEl)
			.setName('Visited')
			.setDesc('Has the party visited this location?')
			.addToggle(toggle => toggle
				.setValue(this.visited)
				.onChange(value => this.visited = value)
			);

		// Quest Related
		new Setting(contentEl)
			.setName('Quest Related')
			.setDesc('Is this location related to an active quest?')
			.addToggle(toggle => toggle
				.setValue(this.questRelated)
				.onChange(value => this.questRelated = value)
			);

		// Danger Level
		new Setting(contentEl)
			.setName('Danger Level')
			.setDesc('Threat level or difficulty rating')
			.addText(text => text
				.setPlaceholder('Low, Medium, High, Deadly')
				.setValue(this.dangerLevel)
				.onChange(value => this.dangerLevel = value)
			);

		// Tags
		new Setting(contentEl)
			.setName('Tags')
			.setDesc('Comma-separated tags for organization')
			.addText(text => text
				.setPlaceholder('city, waterdeep, port')
				.setValue(this.tags)
				.onChange(value => this.tags = value)
			);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonContainer.createEl('button', { text: 'Save Changes', cls: 'mod-cta' });
		saveBtn.addEventListener('click', () => this.savePoi());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async savePoi() {
		if (!this.name) {
			new Notice('Please enter a name for the Point of Interest');
			return;
		}

		try {
			const file = this.app.vault.getAbstractFileByPath(this.filePath);
			if (!(file instanceof TFile)) {
				new Notice('PoI file not found');
				return;
			}

			// Read current content
			let content = await this.app.vault.read(file);

			// Parse tags
			const tagArray = this.tags
				.split(',')
				.map(t => t.trim())
				.filter(t => t.length > 0);

			// Update frontmatter
			content = content.replace(
				/name:.*$/m,
				`name: ${this.name}`
			);
			content = content.replace(
				/poi-type:.*$/m,
				`poi-type: ${this.poiType}`
			);
			content = content.replace(
				/icon:.*$/m,
				`icon: ${this.icon}`
			);
			content = content.replace(
				/region:.*$/m,
				`region: ${this.region}`
			);
			content = content.replace(
				/discovered:.*$/m,
				`discovered: ${this.discovered}`
			);
			content = content.replace(
				/visited:.*$/m,
				`visited: ${this.visited}`
			);
			content = content.replace(
				/quest-related:.*$/m,
				`quest-related: ${this.questRelated}`
			);
			content = content.replace(
				/danger-level:.*$/m,
				`danger-level: ${this.dangerLevel}`
			);
			content = content.replace(
				/tags:.*$/m,
				`tags: [${tagArray.join(', ')}]`
			);

			// Update heading
			content = content.replace(
				/^# .* .*$/m,
				`# ${this.icon} ${this.name}`
			);

			// Update Quick Info section
			const statusText = this.discovered ? (this.visited ? 'Visited' : 'Discovered') : 'Undiscovered';
			content = content.replace(
				/\*\*Type:\*\* .*/,
				`**Type:** ${this.poiType}`
			);
			content = content.replace(
				/\*\*Region:\*\* .*/,
				`**Region:** ${this.region || 'Unknown'}`
			);
			content = content.replace(
				/\*\*Status:\*\* .*/,
				`**Status:** ${statusText}`
			);

			// Save the file
			await this.app.vault.modify(file, content);

			new Notice(`Updated Point of Interest: ${this.name}`);
			this.close();

		} catch (error) {
			console.error('Error updating PoI:', error);
			new Notice('Failed to update Point of Interest');
		}
	}
}

/**
 * Modal for picking an existing PoI or creating a new one
 */
export class PoiPickerModal extends Modal {
	private campaignFolder: string;
	private hexCoords: { col: number; row: number };
	private paceId: string | undefined;
	private onSelect: (poiFile: string) => void;

	constructor(
		app: App,
		campaignFolder: string,
		hexCoords: { col: number; row: number },
		paceId: string | undefined,
		onSelect: (poiFile: string) => void
	) {
		super(app);
		this.campaignFolder = campaignFolder;
		this.hexCoords = hexCoords;
		this.paceId = paceId;
		this.onSelect = onSelect;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('poi-picker-modal');

		contentEl.createEl('h2', { text: '📍 Assign Point of Interest' });
		
		const infoEl = contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: `Hex: (${this.hexCoords.col}, ${this.hexCoords.row})`
		});

		// Search input
		const searchContainer = contentEl.createDiv({ cls: 'poi-search-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'search',
			placeholder: 'Search existing Points of Interest...',
			cls: 'poi-search-input'
		});

		// PoI list
		const poiListContainer = contentEl.createDiv({ cls: 'poi-list-container' });
		
		// Load existing PoI notes
		const existingPois = await this.findExistingPois();

		const renderPoiList = (filter: string = '') => {
			poiListContainer.empty();
			
			const filteredPois = existingPois.filter(poi => 
				poi.name.toLowerCase().includes(filter.toLowerCase()) ||
				poi.type.toLowerCase().includes(filter.toLowerCase())
			);

			if (filteredPois.length === 0) {
				poiListContainer.createEl('div', {
					text: filter ? 'No matching Points of Interest found' : 'No Points of Interest in this campaign yet',
					cls: 'poi-empty-state'
				});
			} else {
				filteredPois.forEach(poi => {
					const poiCard = poiListContainer.createDiv({ cls: 'poi-card' });
					
					const iconEl = poiCard.createEl('span', {
						text: poi.icon,
						cls: 'poi-card-icon'
					});
					
					const infoDiv = poiCard.createDiv({ cls: 'poi-card-info' });
					infoDiv.createEl('strong', { text: poi.name, cls: 'poi-card-name' });
					infoDiv.createEl('span', { text: poi.type, cls: 'poi-card-type' });
					
					poiCard.addEventListener('click', () => {
						this.onSelect(poi.path);
						this.close();
					});
				});
			}
		};

		searchInput.addEventListener('input', () => {
			renderPoiList(searchInput.value);
		});

		renderPoiList();

		// Create new PoI button
		const createContainer = contentEl.createDiv({ cls: 'poi-create-container' });
		const createBtn = createContainer.createEl('button', {
			text: '➕ Create New Point of Interest',
			cls: 'mod-cta'
		});

		createBtn.addEventListener('click', () => {
			this.close();
			new PoiCreationModal(
				this.app,
				this.campaignFolder,
				this.hexCoords,
				this.paceId,
				this.onSelect
			).open();
		});

		// Cancel button
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async findExistingPois(): Promise<Array<{name: string; type: string; icon: string; path: string}>> {
		const locationsFolder = `${this.campaignFolder}/locations`;
		const pois: Array<{name: string; type: string; icon: string; path: string}> = [];

		const files = this.app.vault.getMarkdownFiles();
		
		for (const file of files) {
			// Check if file is in locations folder
			if (file.path.startsWith(locationsFolder)) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.type === 'point-of-interest') {
					pois.push({
						name: cache.frontmatter.name || file.basename,
						type: cache.frontmatter['poi-type'] || 'custom',
						icon: cache.frontmatter.icon || '📍',
						path: file.path
					});
				}
			}
		}

		return pois;
	}
}

/**
 * Modal for creating a new PoI
 */
export class PoiCreationModal extends Modal {
	private campaignFolder: string;
	private hexCoords: { col: number; row: number };
	private paceId: string | undefined;
	private onSelect: (poiFile: string) => void;

	private name: string = '';
	private poiType: PoiType = 'settlement';
	private icon: string = '�️';
	private region: string = '';
	private tags: string = '';

	constructor(
		app: App,
		campaignFolder: string,
		hexCoords: { col: number; row: number },
		paceId: string | undefined,
		onSelect: (poiFile: string) => void
	) {
		super(app);
		this.campaignFolder = campaignFolder;
		this.hexCoords = hexCoords;
		this.paceId = paceId;
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('poi-creation-modal');

		contentEl.createEl('h2', { text: '✨ Create Point of Interest' });

		// Name
		new Setting(contentEl)
			.setName('Name')
			.setDesc('Name of this location')
			.addText(text => text
				.setPlaceholder('Waterdeep')
				.setValue(this.name)
				.onChange(value => this.name = value)
			);

		// Type (icon is automatically set based on type)
		new Setting(contentEl)
			.setName('Type')
			.setDesc('Category of this point of interest (icon will be set automatically)')
			.addDropdown(dropdown => {
				POI_TYPES.forEach(type => {
					dropdown.addOption(type.value, `${type.icon} ${type.label}`);
				});
				dropdown.setValue(this.poiType);
				dropdown.onChange(value => {
					this.poiType = value as PoiType;
					// Auto-update icon based on type
					const selectedType = POI_TYPES.find(t => t.value === value);
					if (selectedType) {
						this.icon = selectedType.icon;
					}
				});
			});

		// Region
		new Setting(contentEl)
			.setName('Region')
			.setDesc('Geographic region or area')
			.addText(text => text
				.setPlaceholder('Sword Coast')
				.setValue(this.region)
				.onChange(value => this.region = value)
			);

		// Tags
		new Setting(contentEl)
			.setName('Tags')
			.setDesc('Comma-separated tags for organization')
			.addText(text => text
				.setPlaceholder('city, waterdeep, port')
				.setValue(this.tags)
				.onChange(value => this.tags = value)
			);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const createBtn = buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createBtn.addEventListener('click', () => this.createPoi());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async createPoi() {
		if (!this.name) {
			new Notice('Please enter a name for the Point of Interest');
			return;
		}

		try {
			// Ensure locations folder exists
			const locationsFolder = `${this.campaignFolder}/locations`;
			const folderExists = await this.app.vault.adapter.exists(locationsFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(locationsFolder);
			}

			// Generate filename (sanitize name)
			const sanitizedName = this.name.replace(/[\\/:*?"<>|]/g, '_');
			const filePath = `${locationsFolder}/${sanitizedName}.md`;

			// Check if file already exists
			if (await this.app.vault.adapter.exists(filePath)) {
				new Notice(`A Point of Interest named "${this.name}" already exists`);
				return;
			}

			// Extract campaign name from folder path
			const campaignName = this.campaignFolder.split('/').pop() || '';

			// Parse tags
			const tagArray = this.tags
				.split(',')
				.map(t => t.trim())
				.filter(t => t.length > 0);

			// Create file content from template
			// Replace all Templater syntax with actual values
			let content = POI_TEMPLATE;
			
			// Replace heading
			content = content.replace(
				'# <% tp.frontmatter.icon %> <% tp.frontmatter.name %>',
				`# ${this.icon} ${this.name}`
			);
			
			// Replace Quick Info section
			content = content.replace(
				'**Type:** <% tp.frontmatter["poi-type"] %>',
				`**Type:** ${this.poiType}`
			);
			content = content.replace(
				'**Region:** <% tp.frontmatter.region || "Unknown" %>',
				`**Region:** ${this.region || 'Unknown'}`
			);
			content = content.replace(
				'**Status:** <% tp.frontmatter.discovered ? (tp.frontmatter.visited ? "Visited" : "Discovered") : "Undiscovered" %>',
				'**Status:** Undiscovered'
			);

			// Update frontmatter
			content = content.replace('name: ', `name: ${this.name}`);
			content = content.replace('poi-type: settlement', `poi-type: ${this.poiType}`);
			content = content.replace('icon: 🏰', `icon: ${this.icon}`);
			content = content.replace('tags: []', `tags: [${tagArray.join(', ')}]`);
			content = content.replace('campaign: ', `campaign: ${campaignName}`);
			content = content.replace('region: ', `region: ${this.region}`);

			// Create the file
			const file = await this.app.vault.create(filePath, content);

			new Notice(`Created Point of Interest: ${this.name}`);

			// Call the onSelect callback with the file path
			this.onSelect(file.path);
			this.close();

		} catch (error) {
			console.error('Error creating PoI:', error);
			new Notice('Failed to create Point of Interest');
		}
	}
}

/**
 * Modal for selecting multiple PoIs to insert into a note
 */
export class PoiPickerMultiModal extends Modal {
	private editor: Editor;
	private campaignName: string;
	private availablePois: Array<{ file: TFile; name: string; icon: string; type: string }> = [];
	private selectedPois: Array<{ file: TFile; name: string; order: number }> = [];
	private selectionOrder: number = 0;

	constructor(app: App, editor: Editor, campaignName: string) {
		super(app);
		this.editor = editor;
		this.campaignName = campaignName;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('poi-picker-modal');

		contentEl.createEl('h2', { text: '📍 Select Points of Interest' });

		if (this.campaignName) {
			contentEl.createEl('p', { 
				text: `Campaign: ${this.campaignName}`,
				cls: 'poi-picker-campaign-info'
			});
		}

		// Load available PoIs
		await this.loadAvailablePois();

		if (this.availablePois.length === 0) {
			contentEl.createEl('p', { 
				text: '⚠️ No PoIs found in this campaign. Create some first!',
				cls: 'poi-picker-no-pois'
			});
			
			const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
			const closeBtn = buttonContainer.createEl('button', { text: 'Close' });
			closeBtn.addEventListener('click', () => this.close());
			return;
		}

		// Create scrollable list
		const listContainer = contentEl.createDiv({ cls: 'poi-picker-list' });

		for (const poi of this.availablePois) {
			const poiItem = listContainer.createDiv({ cls: 'poi-picker-item' });
			
			// Checkbox
			const checkbox = poiItem.createEl('input', { 
				type: 'checkbox',
				cls: 'poi-picker-checkbox'
			});
			
			// PoI info
			const poiInfo = poiItem.createDiv({ cls: 'poi-picker-info' });
			poiInfo.createEl('span', { 
				text: `${poi.icon} ${poi.name}`,
				cls: 'poi-picker-name'
			});
			poiInfo.createEl('span', { 
				text: poi.type,
				cls: 'poi-picker-type'
			});
			
			// Selection order badge (hidden by default)
			const orderBadge = poiItem.createEl('span', { 
				cls: 'poi-picker-order-badge',
				attr: { style: 'display: none;' }
			});
			
			// Handle checkbox change
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					// Add to selection
					this.selectionOrder++;
					this.selectedPois.push({ 
						file: poi.file, 
						name: poi.name,
						order: this.selectionOrder
					});
					orderBadge.textContent = `${this.selectionOrder}`;
					orderBadge.style.display = 'inline-block';
					poiItem.addClass('poi-picker-item-selected');
				} else {
					// Remove from selection
					const index = this.selectedPois.findIndex(p => p.file.path === poi.file.path);
					if (index >= 0 && this.selectedPois[index]) {
						const removedOrder = this.selectedPois[index].order;
						this.selectedPois.splice(index, 1);
						
						// Update order badges for items after the removed one
						this.selectedPois.forEach(sp => {
							if (sp.order > removedOrder) {
								sp.order--;
							}
						});
						
						// Recalculate selectionOrder
						this.selectionOrder = this.selectedPois.length;
						
						// Update all order badges in the UI
						this.updateOrderBadges(listContainer);
					}
					orderBadge.style.display = 'none';
					poiItem.removeClass('poi-picker-item-selected');
				}
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const insertBtn = buttonContainer.createEl('button', { text: 'Insert Code Block', cls: 'mod-cta' });
		insertBtn.addEventListener('click', () => this.insertCodeBlock());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Load all PoIs from the current campaign
	 */
	private async loadAvailablePois() {
		const allFiles = this.app.vault.getMarkdownFiles();
		
		for (const file of allFiles) {
			// Check if file is in a locations folder under the campaign
			if (file.path.includes('/locations/')) {
				// Check if it's in the right campaign
				const pathParts = file.path.split('/');
				const ttrpgsIndex = pathParts.indexOf('ttrpgs');
				if (ttrpgsIndex >= 0 && ttrpgsIndex < pathParts.length - 1) {
					const fileCampaign = pathParts[ttrpgsIndex + 1];
					
					// Only include PoIs from the current campaign (or all if no campaign detected)
					if (this.campaignName === '' || fileCampaign === this.campaignName) {
						const cache = this.app.metadataCache.getFileCache(file);
						const fm = cache?.frontmatter;
						
						if (fm?.type === 'point-of-interest') {
							// Get type label
							const poiTypeObj = POI_TYPES.find(t => t.value === fm['poi-type']);
							const typeLabel = poiTypeObj ? `${poiTypeObj.icon} ${poiTypeObj.label}` : fm['poi-type'];
							
							this.availablePois.push({
								file: file,
								name: fm.name || file.basename,
								icon: fm.icon || '📍',
								type: typeLabel
							});
						}
					}
				}
			}
		}
		
		// Sort by name
		this.availablePois.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Update all order badges in the UI after a removal
	 */
	private updateOrderBadges(listContainer: HTMLElement) {
		const items = listContainer.querySelectorAll('.poi-picker-item');
		items.forEach((item, index) => {
			const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement;
			const badge = item.querySelector('.poi-picker-order-badge') as HTMLElement;
			
			if (checkbox?.checked) {
				const poi = this.availablePois[index];
				if (poi) {
					const selected = this.selectedPois.find(sp => sp.file.path === poi.file.path);
					if (selected) {
						badge.textContent = `${selected.order}`;
					}
				}
			}
		});
	}

	/**
	 * Insert the dnd-poi code block at cursor position
	 */
	private insertCodeBlock() {
		if (this.selectedPois.length === 0) {
			new Notice('Please select at least one PoI');
			return;
		}

		// Sort by selection order
		const sortedPois = [...this.selectedPois].sort((a, b) => a.order - b.order);
		
		// Build code block content
		const lines = sortedPois.map(poi => `- ${poi.name}`);
		const codeBlock = '```dnd-poi\n' + lines.join('\n') + '\n```';
		
		// Insert at cursor
		this.editor.replaceSelection(codeBlock);
		
		new Notice(`✅ Inserted ${sortedPois.length} PoI${sortedPois.length > 1 ? 's' : ''}`);
		this.close();
	}
}
