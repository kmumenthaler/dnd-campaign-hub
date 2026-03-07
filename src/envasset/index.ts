/**
 * Environment Assets Module
 *
 * Re-exports all public types, the library class, the modals, and the
 * context-menu helper for use in main.ts and elsewhere.
 */
export {
	// Types
	type EnvAssetCategory,
	type ScatterConfig,
	type EnvAssetDefinition,
	type EnvAssetInstance,
	type EnvAssetLibraryData,
	type TransformHandle,
	TRANSFORM_HANDLE_SIZE,
	ROTATION_HANDLE_OFFSET,
	ENV_ASSET_CATEGORIES,
} from './EnvAssetTypes';

export { EnvAssetLibrary } from './EnvAssetLibrary';
export { EnvAssetLibraryModal } from './EnvAssetLibraryModal';
export { EnvAssetPickerModal } from './EnvAssetPickerModal';
export { showEnvAssetContextMenu } from './EnvAssetContextMenu';
