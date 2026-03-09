
# Env Assets

Overview

Environment assets are reusable images or objects (props, scenery) that can be placed into maps or scene notes. The system provides a library, picker, and context menu integration.

Key files

- Library & modal: [src/envasset/EnvAssetLibrary.ts](src/envasset/EnvAssetLibrary.ts) and [src/envasset/EnvAssetLibraryModal.ts](src/envasset/EnvAssetLibraryModal.ts)
- Picker: [src/envasset/EnvAssetPickerModal.ts](src/envasset/EnvAssetPickerModal.ts)
- Types & behaviors: [src/envasset/EnvAssetTypes.ts](src/envasset/EnvAssetTypes.ts) and [src/envasset/EnvAssetContextMenu.ts](src/envasset/EnvAssetContextMenu.ts)

User workflows

- Add asset: Save image to `z_Assets/` or upload through the Asset Library modal. Provide tags and usage metadata.
- Place asset on a map: Open the Env Asset picker from the Map Manager or right-click on a map and choose **Place Asset**.
- Context menu: Right-click an asset in the library for quick actions (preview, rename, delete).

Developer notes

- Provide lightweight metadata only — heavy assets should remain in `z_Assets/` and referenced by path.
- Picker modal is the single entrypoint for placement logic; reuse it when adding new placement UIs.

Related docs

- Map Manager & Views: [docs/map-manager.md](docs/map-manager.md)
 - Battle maps: [docs/battle-maps.md](docs/battle-maps.md)

