# Obsidian Plugins Development

This folder contains Obsidian plugin projects under active development.

## Structure

```
Plugins/
├── dnd-campaign-hub/          # D&D Campaign Hub Plugin
│   ├── src/                   # TypeScript source files
│   ├── manifest.json          # Plugin manifest
│   ├── package.json           # Dependencies
│   └── tsconfig.json          # TypeScript config
│
└── dnd-session-transcription/ # D&D Session Transcription Plugin
    ├── src/ (if exists)       # TypeScript source files
    ├── manifest.json          # Plugin manifest
    ├── package.json           # Dependencies
    └── tsconfig.json          # TypeScript config
```

## Building Plugins

### Quick Build (Both Plugins)
```powershell
.\build-all.ps1
```

### Individual Plugin Build

**D&D Campaign Hub**
```powershell
cd dnd-campaign-hub
..\nodejs\npm run build
```
Output: `dist\main.js`

**D&D Session Transcription**
```powershell
cd dnd-session-transcription
..\nodejs\npm run build
```
Output: `main.js`

> **Note**: Node.js is included in the `nodejs\` folder. Dependencies are already installed.

## Development

- Each plugin has its own `node_modules`, `dist`, and build configuration
- Build outputs go to `dist/main.js` in each plugin folder
- Copy `dist/main.js` to your Obsidian vault's `.obsidian/plugins/<plugin-id>/` folder for testing

## Notes

- Git repositories can be initialized independently in each plugin folder
- Shared dependencies should be managed per-plugin to avoid version conflicts
