import { App, Menu, Notice } from 'obsidian';
import {
	EnvAssetInstance,
	EnvAssetDefinition,
	DOOR_BEHAVIOURS,
} from './EnvAssetTypes';
import { EnvAssetLibrary } from './EnvAssetLibrary';

/**
 * Shows a context menu for the given env-asset instance on the map.
 *
 * Actions:
 *  - Rotate (90° increments)
 *  - Lock / Unlock (prevent accidental edits)
 *  - Delete
 *  ── Door-specific ──
 *  - Toggle open / closed
 *  - Change door behaviour
 *  - Change pivot edge
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

	// ── Door-specific ────────────────────────────────────────────────────────
	if (definition?.category === 'door') {
		menu.addSeparator();

		// Ensure instance has a doorConfig (inherit from definition)
		if (!instance.doorConfig) {
			instance.doorConfig = { ...(definition.doorConfig || { behaviour: 'pivot' }) };
		}
		// Migrate legacy behaviours
		const dc = instance.doorConfig!;
		if (dc.behaviour === 'normal' || dc.behaviour === 'custom-pivot') {
			if (dc.behaviour === 'normal') {
				// Convert pivotEdge to customPivot
				dc.customPivot = dc.pivotEdge === 'right' ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
			}
			dc.behaviour = 'pivot';
		}
		if (dc.behaviour !== 'sliding' && !dc.customPivot) {
			dc.customPivot = { x: 0, y: 0.5 };
		}

		// Open / Close toggle
		menu.addItem(item => item
			.setTitle(dc.isOpen ? '🚪 Close Door' : '🚪 Open Door')
			.onClick(() => {
				dc.isOpen = !dc.isOpen;
				if (!dc.isOpen) {
					dc.openAngle = 0;
					if (dc.behaviour === 'sliding') dc.slidePosition = 0;
				} else {
					if (dc.behaviour !== 'sliding') {
						const dir = dc.openDirection || 1;
						dc.openAngle = dir * 90;
					}
					if (dc.behaviour === 'sliding') dc.slidePosition = 1;
				}
				callbacks.onUpdate(instance);
				callbacks.onRedraw();
				callbacks.onSave();
			})
		);

		// Open to the other side (reverse swing direction)
		if (dc.behaviour !== 'sliding') {
			menu.addItem(item => item
				.setTitle('↔️ Reverse Open Direction')
				.onClick(() => {
					// Flip the persisted direction
					dc.openDirection = (dc.openDirection || 1) * -1;
					dc.openAngle = dc.openDirection * 90;
					if (!dc.isOpen) {
						dc.isOpen = true;
					}
					callbacks.onUpdate(instance);
					callbacks.onRedraw();
					callbacks.onSave();
				})
			);
		}

		// Behaviour submenu
		for (const b of DOOR_BEHAVIOURS) {
			menu.addItem(item => item
				.setTitle(`${dc.behaviour === b.value ? '● ' : '○ '}${b.icon} ${b.label}`)
				.onClick(() => {
					dc.behaviour = b.value;
					if (b.value !== 'sliding' && !dc.customPivot) {
						dc.customPivot = { x: 0, y: 0.5 };
					}
					callbacks.onUpdate(instance);
					callbacks.onRedraw();
					callbacks.onSave();
				})
			);
		}
	}

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
