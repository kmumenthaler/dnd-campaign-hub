# Plugin Development Setup Guide

## Prerequisites

You'll need Node.js installed to build these plugins. If not already installed:

1. Download Node.js from https://nodejs.org/ (LTS version recommended)
2. Install it system-wide or use a portable version

## Initial Setup

### D&D Campaign Hub Plugin

```bash
cd Plugins/dnd-campaign-hub
npm install
npm run build
```

Output: `dist/main.js`

### D&D Session Transcription Plugin

```bash
cd Plugins/dnd-session-transcription
npm install
npm run build
```

Output: `dist/main.js` (or `main.js` if already built)

## Deploying to Obsidian

After building, copy the plugin to your vault:

### Windows PowerShell
```powershell
# D&D Campaign Hub
Copy-Item "Plugins\dnd-campaign-hub\dist\main.js" `
  -Destination "Path\To\Your\Vault\.obsidian\plugins\dnd-campaign-hub\" -Force

# D&D Session Transcription
Copy-Item "Plugins\dnd-session-transcription\dist\main.js" `
  -Destination "Path\To\Your\Vault\.obsidian\plugins\dnd-session-transcription\" -Force
```

Then reload Obsidian (Ctrl+R) to see changes.

## Development Workflow

1. Make changes to source files in `src/` or root TypeScript files
2. Run `npm run build` in the plugin directory
3. Copy `dist/main.js` to your test vault
4. Reload Obsidian
5. Test the changes
6. Repeat as needed

## Clean Build

If you encounter build issues:

```bash
# Remove node_modules and reinstall
Remove-Item node_modules -Recurse -Force
npm install
npm run build
```
