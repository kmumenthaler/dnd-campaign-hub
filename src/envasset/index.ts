/**
 * Environment Assets Module
 *
 * Re-exports all public types, the library class, the modals, and the
 * context-menu helper for use in main.ts and elsewhere.
 */
export {
	// Types
	type EnvAssetCategory,
	type DoorBehaviour,
	type DoorPivotEdge,
	type DoorConfig,
	type ScatterConfig,
	type TrapConfig,
	type EnvAssetDefinition,
	type EnvAssetInstance,
	type EnvAssetLibraryData,
	type TransformHandle,
	TRANSFORM_HANDLE_SIZE,
	ROTATION_HANDLE_OFFSET,
	PIVOT_HANDLE_SIZE,
	ENV_ASSET_CATEGORIES,
	DOOR_BEHAVIOURS,
} from './EnvAssetTypes';

export { EnvAssetLibrary } from './EnvAssetLibrary';
export { EnvAssetLibraryModal } from './EnvAssetLibraryModal';
export { EnvAssetPickerModal } from './EnvAssetPickerModal';
export { showEnvAssetContextMenu } from './EnvAssetContextMenu';
