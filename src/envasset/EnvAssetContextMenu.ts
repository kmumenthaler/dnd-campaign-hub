import { App, Menu, Notice } from 'obsidian';
import {
	EnvAssetInstance,
	EnvAssetDefinition,
} from './EnvAssetTypes';
import { EnvAssetLibrary } from './EnvAssetLibrary';

/**
 * Shows a context menu for the given env-asset instance on the map.
 *
 * Actions:
 *  - Rotate (90° increments)
 *  - Lock / Unlock (prevent accidental edits)
 *  - Delete
 *  ── Scatter-specific ──
 *  - Toggle blocks-vision
 *  - Set wall height
 */
export function showEnvAssetContextMenu(
	app: App,
	event: MouseEvent,
	instance: EnvAssetInstance,
	definition: EnvAssetDefinition | undefined,
	assetLibrary: EnvAssetLibrary,
	callbacks: {
		onUpdate: (inst: EnvAssetInstance) => void;
		onDelete: (instId: string) => void;
		onDuplicate?: (inst: EnvAssetInstance) => void;
		onRedraw: () => void;
		onSave: () => void;
	}
) {
	const menu = new Menu();

	// ── Header ───────────────────────────────────────────────────────────────
	const label = definition?.name ?? 'Env Asset';
	menu.addItem(item => item
		.setTitle(`📦 ${label}`)
		.setDisabled(true)
	);

	menu.addSeparator();

	// ── Transform ────────────────────────────────────────────────────────────
	menu.addItem(item => item
		.setTitle('↻ Rotate 90° CW')
		.onClick(() => {
			instance.rotation = ((instance.rotation || 0) + 90) % 360;
			callbacks.onUpdate(instance);
			callbacks.onRedraw();
			callbacks.onSave();
		})
	);

	menu.addItem(item => item
		.setTitle('↺ Rotate 90° CCW')
		.onClick(() => {
			instance.rotation = ((instance.rotation || 0) - 90 + 360) % 360;
			callbacks.onUpdate(instance);
			callbacks.onRedraw();
			callbacks.onSave();
		})
	);

	menu.addItem(item => item
		.setTitle('🔄 Reset Rotation')
		.onClick(() => {
			instance.rotation = 0;
			callbacks.onUpdate(instance);
			callbacks.onRedraw();
			callbacks.onSave();
		})
	);

	menu.addSeparator();

	// ── Lock ─────────────────────────────────────────────────────────────────
	menu.addItem(item => item
		.setTitle(instance.locked ? '🔓 Unlock' : '🔒 Lock')
		.onClick(() => {
			instance.locked = !instance.locked;
			callbacks.onUpdate(instance);
			callbacks.onRedraw();
			new Notice(instance.locked ? `${label} locked` : `${label} unlocked`);
			callbacks.onSave();
		})
	);

	// ── Scatter-specific ─────────────────────────────────────────────────────
	if (definition?.category === 'scatter') {
		menu.addSeparator();

		if (!instance.scatterConfig) {
			instance.scatterConfig = { ...(definition.scatterConfig || { blocksVision: false }) };
		}
		const sc = instance.scatterConfig!;

		menu.addItem(item => item
			.setTitle(sc.blocksVision ? '👁️ Disable Vision Block' : '🚫 Enable Vision Block')
			.onClick(() => {
				sc.blocksVision = !sc.blocksVision;
				if (sc.blocksVision && !sc.wallHeight) sc.wallHeight = 5;
				callbacks.onUpdate(instance);
				callbacks.onRedraw();
				callbacks.onSave();
			})
		);

		if (sc.blocksVision) {
			for (const h of [5, 10, 15, 20]) {
				menu.addItem(item => item
					.setTitle(`${sc.wallHeight === h ? '● ' : '○ '}Wall Height: ${h} ft`)
					.onClick(() => {
						sc.wallHeight = h;
						callbacks.onUpdate(instance);
						callbacks.onRedraw();
						callbacks.onSave();
					})
				);
			}
		}
	}

	// ── Duplicate ───────────────────────────────────────────────────────────
	if (callbacks.onDuplicate) {
		menu.addItem(item => item
			.setTitle('📋 Duplicate')
			.onClick(() => {
				callbacks.onDuplicate!(instance);
			})
		);
	}

	// ── Delete ───────────────────────────────────────────────────────────────
	menu.addSeparator();
	menu.addItem(item => item
		.setTitle('🗑️ Delete')
		.onClick(() => {
			callbacks.onDelete(instance.id);
			callbacks.onRedraw();
			callbacks.onSave();
		})
	);

	menu.showAtMouseEvent(event);
}
