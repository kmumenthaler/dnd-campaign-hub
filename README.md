# D&D Campaign Hub

A comprehensive Obsidian plugin for managing D&D (or any TTRPG) campaigns with interactive battle maps, integrated calendars, session tracking, NPC management, and more.

> **⚠️ Project Status: Early Preview**
>
> The core workflows are still under active construction and may change without notice. Expect breaking changes, incomplete features, and missing polish while the project matures. Feedback and issue reports are very welcome during this incubation phase!

## Features

### 🗺️ Interactive Battle Maps
- **Full-Featured Map Viewer**: Display battle maps with adjustable grids (square, hex-horizontal, hex-vertical)
- **Annotation Tools**: Highlight cells, place markers, draw freehand, measure distances, add AoE effects, and erase
- **Marker Library**: Persistent token library for PCs, NPCs, creatures, and custom markers with image support
- **AoE Effects**: Circle, cone, square, and line area effects with optional token anchoring (moves with tokens)
- **Fog of War**: Reveal/hide areas dynamically with brush, circle, rectangle, and polygon tools
- **Layer System**: Organize annotations across Player, DM, and Background layers for better control
- **Player View**: Clean popout window for players with fullscreen support and automatic sync from GM view
- **Tabletop Miniature Mode**: Physical calibration mode to match on-screen grid to real 25-32mm miniatures on your monitor
- **Pan & Drag**: Free navigation in tabletop mode when maps exceed screen size
- **Grid Calibration**: Two-point calibration tool to perfectly align grids with pre-gridded map images
- **Real-time Sync**: GM annotations automatically update in the Player View window
- **Keyboard Shortcuts**: Q (pan), W (select), E (highlight), R (marker), D (draw), Z (ruler), X (AoE), C (eraser), V (fog), ⚙ (calibrate), ✥ (move grid)

### 🎲 Campaign Management
- **Initialize Campaign Structure**: Automatically create organized folders for NPCs, PCs, sessions, adventures, items, spells, and factions
- **Multiple Campaign Support**: Manage multiple campaigns in the same vault
- **Smart Templates**: Pre-configured templates for all campaign elements
- **Seamless Updates**: Template updates preserve your data while adding new features

### 📅 Session Tracking
- **Numbered Sessions**: Auto-incrementing session numbers with date stamps
- **GM & Player Views**: Different session templates for Game Masters and Players
- **Calendar Integration**: Track in-game dates with Calendarium support
- **Location Tracking**: Organize sessions by where they take place

### 👥 Character & NPC Management
- **NPC Templates**: Organized templates for tracking NPCs, motivations, and relationships
- **PC Templates**: Player character sheets with stats, backstory, and development
- **Faction System**: Track organizations, their goals, and relationships

### 🌍 World Building
- **Campaign Truths**: Define fundamental truths about your world
- **Adventure Tracking**: Organize story arcs and quests
- **Item Database**: Catalog magical items and equipment
- **Spell Repository**: Document spells and magical effects

### 🔄 Version Management
- **Automatic Updates**: Get notified when templates are updated
- **Safe Backups**: Automatic backups before applying template updates
- **Data Preservation**: Your content is preserved during updates

## Installation

### From Obsidian Community Plugins (Recommended)
1. Open Obsidian Settings
2. Go to **Community Plugins** → **Browse**
3. Search for "D&D Campaign Hub"
4. Click **Install**, then **Enable**

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/kevinmumenthaler/dnd-campaign-hub/releases)
2. Extract the files to `<vault>/.obsidian/plugins/dnd-campaign-hub/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

## Dependencies

D&D Campaign Hub works standalone for battle maps. For full campaign management functionality, these community plugins are recommended:

- **[Buttons](https://github.com/shabegom/buttons)** - Interactive buttons for creating campaign elements
- **[Dataview](https://github.com/blacksmithgu/obsidian-dataview)** - Dynamic tables and queries for organizing data
- **[Calendarium](https://github.com/javalent/calendarium)** - Fantasy calendar integration for tracking in-game dates
- **[Templater](https://github.com/SilentVoid13/Templater)** - Template engine for dynamic content in NPC and other files

The plugin will prompt you to install these dependencies if they're missing and you're using campaign management features.

## Quick Start

### 1. Initialize Your First Campaign

1. Open the Command Palette (`Ctrl/Cmd + P`)
2. Run: **Initialize D&D Campaign Hub**
3. Follow the prompts to create your campaign structure

### 2. Create a New Campaign

1. Use Command Palette: **Create New D&D Campaign**
2. Enter your campaign name
3. Choose your role (GM or Player)
4. Select or create a fantasy calendar

### 3. Set Up Your First Battle Map

1. Use Command Palette: **Create New Battle Map**
2. Select a map image from your vault
3. Choose grid type (square, hex-horizontal, hex-vertical, or none)
4. Set grid size and use the two-point calibration tool to align the grid perfectly
5. Embed the map in your notes with the provided code block

### 4. Use the Map in Play

1. Click on the embedded map to open the interactive viewer
2. Use toolbar buttons to switch between tools (highlight, marker, draw, ruler, AoE, fog of war)
3. Click **👁️ Player View** to open a clean window for your players
4. Annotations sync automatically between GM and Player View
5. For in-person games, click **🎲 Tabletop**, then **🎯 Calibrate** to match grid to physical miniatures

### 5. Start Your First Session

1. Navigate to your campaign's World.md file
2. Click the "Create New Session" button
3. Fill in session details (date, location, etc.)
4. Embed maps and start documenting your adventure!

## Commands

Access these via the Command Palette (`Ctrl/Cmd + P`):

### Campaign Management
- **Initialize D&D Campaign Hub** - Set up vault structure and templates
- **Create New D&D Campaign** - Start a new campaign
- **Switch D&D Campaign** - Switch between campaigns
- **Update D&D Hub Templates** - Apply template updates (with backup)
- **Check D&D Hub Dependencies** - Verify required community plugins are installed
- **Purge D&D Campaign Hub** - Remove all plugin data (use with caution)

### Battle Maps
- **Create New Battle Map** - Create and configure a new interactive map
- **Manage Battle Maps** - Browse, edit, and delete existing maps
- **Manage Marker Library** - Create and organize reusable tokens for PCs, NPCs, and creatures

## Template Structure

When you initialize a campaign, this folder structure is created:

```
ttrpgs/
  <Campaign Name>/
    World.md              # Campaign overview and quick actions
    NPCs/                 # Non-player characters
    PCs/                  # Player characters  
    Adventures/           # Story arcs and quests
    Factions/             # Organizations and groups
    Items/                # Equipment and magical items
    Spells/               # Spell descriptions
    001_YYYYMMDD.md      # Session notes (numbered)
    002_YYYYMMDD.md
    ...

z_Templates/            # Reusable templates
  world.md
  session-gm.md
  session-player.md
  npc.md
  pc.md
  adventure.md
  faction.md
  item.md
  spell.md

z_Backups/              # Automatic backups from updates
  YYYY-MM-DDTHH-MM-SS/
```

## Updating Templates

When the plugin is updated, you'll see a notification. To apply template updates:

1. Run command: **Update D&D Hub Templates**
2. Review what will be updated
3. Click **Update Templates**
4. Your data is preserved, backups are created automatically

Template updates:
- ✅ Preserve all frontmatter (metadata)
- ✅ Preserve user-written content
- ✅ Create timestamped backups
- ✅ Update template structure and features
- ✅ Replace placeholders with your campaign data

## Development

### Build from Source

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Watch mode for development
npm run dev
```

### Project Structure

```
src/
  main.ts                      # Main plugin logic and map viewer
  templates.ts                 # Template definitions
  styles.css                   # Plugin styles
  map/
    MapManager.ts              # Map creation and configuration
    MapCreationModal.ts        # Map setup dialog
    types.ts                   # Map type definitions
  marker/
    MarkerLibrary.ts           # Token library manager
    MarkerLibraryModal.ts      # Marker library UI
    MarkerPickerModal.ts       # Marker selection dialog
    MarkerTypes.ts             # Marker type definitions
```

## Customization

### Templates
Templates are stored in `z_Templates/` and can be customized to fit your campaign style. Changes to templates in this folder won't affect updates.

### Frontmatter
Each file includes YAML frontmatter for organization:

```yaml
---
type: npc
campaign: My Campaign
tags: [npc, ally, merchant]
---
```

This enables powerful Dataview queries across your campaign.

## Battle Map Usage

### Creating a Map

1. Run **Create New Battle Map** from Command Palette
2. Select your map image (stored in your vault)
3. Configure:
   - **Grid Type**: Square, Hex-Horizontal, Hex-Vertical, or None
   - **Grid Size**: Pixel size of one grid cell
   - **Scale**: Real-world distance per grid cell (e.g., 5 feet per square)
   - **Calibration**: Use the two-point tool to align grid with pre-gridded images

### Embedding Maps

Maps are embedded using code blocks:

````markdown
```dnd-map
{"mapId": "unique-map-id"}
```
````

Click the embedded map to open the interactive viewer.

### Annotation Tools

- **Pan (Q)**: Navigate the map (drag with mouse)
- **Select (W)**: Select and move annotations
- **Highlight (E)**: Highlight grid cells with colors
- **Marker (R)**: Place tokens from your marker library
- **Draw (D)**: Freehand drawing on the map
- **Ruler (Z)**: Measure distances between points
- **AoE (X)**: Place area effects (circle, cone, square, line)
- **Eraser (C)**: Remove annotations
- **Fog (V)**: Reveal or hide areas (Background layer only)
- **Calibrate (⚙)**: Two-point calibration for grid alignment
- **Move Grid (✥)**: Adjust grid offsets with arrow keys

### Layers

- **Player Layer**: Visible to players in Player View
- **DM Layer**: Only visible to the GM (for secret info, enemy positions)
- **Background Layer**: Base layer for fog of war and map features

### Player View

1. Click **👁️ Player View** button in map viewer
2. A clean popout window opens (can be moved to a second monitor/projector)
3. All Obsidian UI chrome is hidden for immersive display
4. Annotations sync automatically from GM view
5. Only Player layer annotations are shown (DM layer is hidden)
6. Fullscreen support with **🖵 Fullscreen** button

### Tabletop Miniature Mode

For in-person games with physical miniatures:

1. Open Player View and click **🎲 Tabletop**
2. Click **🎯 Calibrate**
3. Enter your monitor diagonal size (in inches)
4. Set miniature base size (usually 25mm or 32mm)
5. Fine-tune with the on-screen ruler (use a credit card as 85.6mm reference)
6. Grid cells now match physical miniature size
7. Pan/drag oversized maps to move around the battlefield

### Marker Library

Create reusable tokens:

1. Run **Manage Marker Library** from Command Palette
2. Click **Create New Marker**
3. Configure:
   - **Type**: Player, NPC, Creature, Location, Object, Custom
   - **Image**: Optional token image from vault
   - **Size**: For creatures, select size (Tiny, Small, Medium, Large, Huge, Gargantuan)
   - **Colors**: Background and border colors
   - **Icon**: Emoji or text icon overlay
4. Use **R** tool to place markers from library
5. Right-click markers on map to:
   - Delete marker
   - Cast AoE from this position (anchors to token)
   - Move marker (shows distance ruler)

### AoE Effects

1. Select **AoE (X)** tool
2. Choose shape: Circle (burst), Cone, Square (cube), Line
3. Click origin point, drag to set size
4. Distance snaps to grid increments
5. AoE effects can anchor to tokens (right-click token → Cast AoE)
6. Anchored effects move automatically when the token moves

### Fog of War

1. Switch to **Background Layer**
2. Select **Fog (V)** tool
3. Choose mode: Reveal (👁️) or Hide (🌑)
4. Choose shape: Brush (drag), Circle, Rectangle, Polygon (click points)
5. Click **☀️ Reveal All** or **🌑 Hide All** for quick reset
6. Fog updates sync to Player View in real-time

## Tips & Best Practices

1. **Use Buttons**: Click buttons in World.md instead of creating files manually
2. **Tag Consistently**: Use tags in frontmatter for easy filtering
3. **Link Liberally**: Use `[[wikilinks]]` to connect NPCs, locations, and events
4. **Review Backups**: Check `z_Backups/` if you need to restore content
5. **Update Regularly**: Apply template updates to get new features
6. **Separate Player View**: Move Player View to a second monitor or projector for in-person games
7. **Use Layers**: Keep secret information on DM layer so it doesn't show in Player View
8. **Calibrate Once**: Save tabletop calibration settings and reuse across all maps
9. **Anchor AoE to Tokens**: Cast AoE from token context menu to auto-update positions
10. **Pre-create Markers**: Build your marker library before the session for faster setup

## Troubleshooting

### Dependencies Missing
If you see a dependency warning:
1. Open Settings → Community Plugins
2. Click "Browse"
3. Search for and install the missing plugins
4. Enable each plugin
5. Return to D&D Campaign Hub

### Templates Not Updating
- Ensure you ran "Update D&D Hub Templates" command
- Check `z_Backups/` for your content before updates
- Verify your frontmatter includes a `type:` field

### Calendar Not Working
- Ensure Calendarium plugin is installed and enabled
- Create a calendar in Calendarium settings
- Re-run "Create New D&D Campaign" to link the calendar

### Map Grid Not Aligned
- Use the **Calibrate (⚙)** tool to set two reference points
- Click first point on a grid intersection, then another intersection
- Enter the real number of grid cells between the points
- Adjust grid offset with **Move Grid (✥)** tool and arrow keys

### Player View Not Syncing
- Ensure Player View window is still open
- Check that annotations are on the Player layer (not DM layer)
- Try closing and reopening Player View
- Verify map annotations were saved (they auto-save on change)

### Tabletop Mode Sizing Wrong
- Re-calibrate with correct monitor diagonal size
- Check that miniature base size matches your physical minis (25mm or 32mm)
- Use fine-tune slider with a physical ruler or credit card (85.6mm)
- Verify browser zoom is at 100% (Ctrl+0)

### Markers Not Appearing
- Check that marker has a valid image path or background color
- Ensure marker is on the active layer (switch layers to check)
- Run **Manage Marker Library** to verify marker exists
- Try recreating the marker in the library

### Performance Issues with Large Maps
- Close other Obsidian panes to free memory
- Reduce map image resolution (4k+ images can be slow)
- Clear fog of war regions if you have hundreds (Reveal All → recreate)
- Disable grid overlay if not needed (set grid type to "none")

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/kevinmumenthaler/dnd-campaign-hub/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kevinmumenthaler/dnd-campaign-hub/discussions)

## Credits

Created for the Obsidian community of D&D enthusiasts.

Special thanks to the creators of:
- [Buttons](https://github.com/shabegom/buttons) by shabegom
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) by blacksmithgu
- [Calendarium](https://github.com/javalent/calendarium) by Javalent

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made with ❤️ for the D&D and Obsidian communities**
