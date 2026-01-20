# D&D Campaign Hub

A comprehensive Obsidian plugin that serves as a central hub for managing Dungeons & Dragons campaigns, characters, and adventures.

## Features

- **Configurable Hotkey**: Open the hub with Ctrl+Shift+M (customizable)
- **Quick Create**: Instantly create new campaigns, NPCs, PCs, adventures, and sessions
- **Vault Browser**: Navigate to different sections of your D&D vault
- **Templates**: Customizable templates for all D&D content types
- **Settings**: Configure vault path and default templates

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the plugin:
   ```bash
   npm run build
   ```

3. During development, watch for changes:
   ```bash
   npm run dev
   ```

## Installation in Obsidian

1. Copy the `dist/` folder contents to your Obsidian vault's `.obsidian/plugins/dnd-campaign-hub/` folder
2. Reload Obsidian and enable the "D&D Campaign Hub" plugin in Settings → Community plugins
3. Configure the vault path in plugin settings (default: "C:\Users\kevin\SynologyDrive\My Vault")

## Usage

- Press `Ctrl+Shift+M` to open the D&D Campaign Hub
- Use "Quick Create" buttons to instantly create new content
- Use "Browse Vault" to navigate to different sections
- Customize templates in plugin settings

## Content Types Supported

- **Campaigns**: Main campaign files with overview, players, and key elements
- **NPCs**: Non-player characters with stats, background, and relationships
- **PCs**: Player characters with full stat blocks and equipment
- **Adventures**: Adventure modules with locations, encounters, and plot hooks
- **Sessions**: Individual session notes with summaries and next steps
- **Items, Spells, Factions**: Additional content types (expandable)

## Development

Built with:
- TypeScript
- esbuild for bundling
- Obsidian API

## Notes

- Update `manifest.json` with your plugin details before release
- The plugin assumes a specific vault structure but can be adapted
- Templates are fully customizable in the plugin settings
