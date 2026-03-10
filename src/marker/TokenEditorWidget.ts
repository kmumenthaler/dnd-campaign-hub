import { App, Setting, Notice, TFile } from 'obsidian';
import { CreatureSize, ImageFit } from './MarkerTypes';
import { MARKER_ICONS, ImageBrowserModal } from './MarkerLibraryModal';

/**
 * Token visual-appearance values managed by the widget.
 * These are the fields an embedding modal can read back after the user edits.
 */
export interface TokenAppearance {
	icon: string;
	backgroundColor: string;
	borderColor: string;
	imageFile: string;
	imageFit: ImageFit;
}

/**
 * Options passed when constructing the widget.
 */
export interface TokenEditorWidgetOptions {
	/** Initial appearance values (e.g. loaded from an existing MarkerDefinition). */
	initial?: Partial<TokenAppearance>;
	/** Creature size used for preview sizing. Default: 'medium'. */
	creatureSize?: CreatureSize;
	/** Default background colour when creating a brand-new token. */
	defaultBackgroundColor?: string;
	/** Default border colour. */
	defaultBorderColor?: string;
}

const SIZE_MULTIPLIER: Record<CreatureSize, number> = {
	tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4
};

/**
 * Reusable UI component that renders token-appearance settings
 * (image, icon, colours, image-fit) with a live circular preview.
 *
 * Embed in any creation / edit modal:
 *   const widget = new TokenEditorWidget(app, { initial, creatureSize });
 *   widget.render(container);
 *   // later …
 *   const values = widget.getValues();
 */
export class TokenEditorWidget {
	private app: App;

	// Current form values
	private icon: string;
	private backgroundColor: string;
	private borderColor: string;
	private imageFile: string;
	private imageFit: ImageFit;
	private creatureSize: CreatureSize;

	// DOM refs
	private previewEl: HTMLElement | null = null;
	private imageSetting: Setting | null = null;

	constructor(app: App, opts?: TokenEditorWidgetOptions) {
		this.app = app;
		this.icon = opts?.initial?.icon ?? '';
		this.backgroundColor = opts?.initial?.backgroundColor || opts?.defaultBackgroundColor || '#6b8e23';
		this.borderColor = opts?.initial?.borderColor || opts?.defaultBorderColor || '#ffffff';
		this.imageFile = opts?.initial?.imageFile ?? '';
		this.imageFit = opts?.initial?.imageFit ?? 'cover';
		this.creatureSize = opts?.creatureSize ?? 'medium';
	}

	/** Update creature size (e.g. when the parent modal's size dropdown changes). */
	setCreatureSize(size: CreatureSize): void {
		this.creatureSize = size;
		this.updatePreview();
	}

	/** Read current appearance values. */
	getValues(): TokenAppearance {
		return {
			icon: this.icon,
			backgroundColor: this.backgroundColor,
			borderColor: this.borderColor,
			imageFile: this.imageFile,
			imageFit: this.imageFit
		};
	}

	/** Render the widget into a container element. */
	render(container: HTMLElement): void {
		// ── Preview ──
		const previewContainer = container.createDiv({ cls: 'marker-preview-container' });
		previewContainer.style.marginBottom = '12px';
		previewContainer.createEl('span', { text: 'Preview', cls: 'setting-item-name' });
		this.previewEl = previewContainer.createDiv({ cls: 'marker-preview' });
		this.previewEl.style.marginTop = '6px';
		this.updatePreview();

		// ── Token Image ──
		this.imageSetting = new Setting(container)
			.setName('Token Image')
			.setDesc(this.imageFile ? `Selected: ${this.imageFile}` : 'Choose an image for the token background');

		this.imageSetting.addButton(btn => btn
			.setButtonText('Browse Vault')
			.onClick(() => this.browseVaultImages())
		);

		this.imageSetting.addButton(btn => btn
			.setButtonText('Import File')
			.onClick(() => this.importFileFromDisk())
		);

		if (this.imageFile) {
			this.imageSetting.addButton(btn => btn
				.setButtonText('Clear')
				.onClick(() => {
					this.imageFile = '';
					this.imageSetting?.setDesc('Choose an image for the token background');
					this.updatePreview();
				})
			);
		}

		// ── Image Fit ──
		new Setting(container)
			.setName('Image Fit')
			.setDesc('Cover fills the token (may crop). Contain shows the full image.')
			.addDropdown(dropdown => dropdown
				.addOption('cover', 'Cover (fill & crop)')
				.addOption('contain', 'Contain (full image)')
				.setValue(this.imageFit)
				.onChange(value => {
					this.imageFit = value as ImageFit;
					this.updatePreview();
				})
			);

		// ── Icon / Emoji ──
		new Setting(container)
			.setName('Icon')
			.setDesc('Emoji displayed on top of the token')
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

		// ── Background Colour ──
		new Setting(container)
			.setName('Background Color')
			.setDesc('Used when no image is set')
			.addColorPicker(color => color
				.setValue(this.backgroundColor)
				.onChange(value => {
					this.backgroundColor = value;
					this.updatePreview();
				})
			);

		// ── Border Colour ──
		new Setting(container)
			.setName('Border Color')
			.addColorPicker(color => color
				.setValue(this.borderColor)
				.onChange(value => {
					this.borderColor = value;
					this.updatePreview();
				})
			);
	}

	// ── Private helpers ──────────────────────────────────────────────

	private updatePreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();

		const displaySize = 50 * (SIZE_MULTIPLIER[this.creatureSize] || 1);

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
		el.style.border = `3px solid ${this.borderColor}`;

		if (this.imageFile) {
			try {
				const resourcePath = this.app.vault.adapter.getResourcePath(this.imageFile);
				el.style.backgroundImage = `url("${resourcePath}")`;
				if (this.imageFit === 'contain') {
					el.style.backgroundSize = 'contain';
					el.style.backgroundRepeat = 'no-repeat';
					el.style.backgroundColor = this.backgroundColor;
				} else {
					el.style.backgroundSize = 'cover';
				}
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

	private browseVaultImages(): void {
		const imageFiles = this.app.vault.getFiles().filter(f =>
			/^(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(f.extension)
		);
		imageFiles.sort((a, b) => {
			const aAsset = a.path.startsWith('z_Assets') ? 0 : 1;
			const bAsset = b.path.startsWith('z_Assets') ? 0 : 1;
			if (aAsset !== bAsset) return aAsset - bAsset;
			return a.path.localeCompare(b.path);
		});
		new ImageBrowserModal(this.app, imageFiles, (file: TFile) => {
			this.imageFile = file.path;
			this.imageSetting?.setDesc(`Selected: ${this.imageFile}`);
			this.updatePreview();
		}).open();
	}

	private importFileFromDisk(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.addEventListener('change', async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const buffer = await file.arrayBuffer();
				const assetsFolder = this.app.vault.getAbstractFileByPath('z_Assets');
				if (!assetsFolder) {
					await this.app.vault.createFolder('z_Assets');
				}
				const destPath = `z_Assets/${file.name}`;
				const existing = this.app.vault.getAbstractFileByPath(destPath);
				if (existing) {
					this.imageFile = destPath;
				} else {
					await this.app.vault.createBinary(destPath, buffer);
					this.imageFile = destPath;
				}
				this.imageSetting?.setDesc(`Selected: ${this.imageFile}`);
				this.updatePreview();
				new Notice(`Image saved to ${destPath}`);
			} catch (err) {
				new Notice('Failed to import image');
				console.error('Image import error:', err);
			}
		});
		input.click();
	}
}
