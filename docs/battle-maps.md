# Battle maps

The battle map system provides a full-featured virtual tabletop inside Obsidian. Create maps from image files, overlay grids, place tokens, draw walls and lights for dynamic vision, manage fog of war, and project the player-facing view to a second screen for physical tabletop play.

## Quick start

1. **Create a template** — Run the command **Create Battlemap Template** (from the command palette or the DnD Hub). This opens the Map Creation modal. See the Map Manager workflow: [Map Manager & Views](map-manager.md).
2. **Select an image** — Pick a map image from `z_Assets/Maps/` or upload one from your computer.
3. **Configure the grid** — Choose square or hex, set the cell size, and adjust the offset until the grid aligns with your image.
4. **Save the template** — The template is stored as a note in `z_BattlemapTemplates/` with a `dnd-map` code block.
5. **Place a map in a session note** — Run **Insert Battlemap** to open the Template Picker. Select a template, and a new map instance is inserted into your note.
6. **Open the GM View** — Click into the rendered map. All tools are available in the floating toolbar on the left.
7. **Open the Player View** — Select the **Player View** tool (📺) and click the map to broadcast to a connected player display.

## Creating maps

All battle maps are based on **templates**. You cannot insert a map directly into a note — you first create a template, then instantiate it.

### Templates

A template is an Obsidian note in `z_BattlemapTemplates/` containing a `dnd-map` code block. Templates store the image reference, grid settings, and any pre-placed annotations (walls, fog, lights, tokens, environmental assets, etc.).

When you create a map from a template, ALL template data is deep-copied into the new instance, including:
- Walls, fog of war regions, light sources
- Drawings, tile elevations, difficult terrain
- Markers (with new unique instance IDs)
- Tunnels and environmental assets

**Creating a template:**
- Command palette → **Create Battlemap Template**
- Or via the **Map Manager** → **New Template** button

**Editing a template:**
- Open the **Map Manager**, find the template, and click **Edit** to reopen the Map Creation modal.

### Image requirements

Map images are stored in `z_Assets/Maps/` inside your vault. Supported formats:

| Type | Formats |
|------|---------|
| Images | PNG, JPG, JPEG, WEBP, GIF, APNG, AVIF |
| Video | MP4, WebM |

The image selector displays a card-based browser with subfolder navigation, search, and the ability to upload images from your computer directly into the vault.

### Grid configuration

The map creation modal has a three-step flow:

1. **Select Image** — Browse or upload.
2. **Map Configuration** — Set the map name, type (battlemap / world / regional), and scale.
3. **Grid Configuration** — Choose grid type, cell size, and offset.

**Grid types:**
| Type | Description |
|------|-------------|
| Square | Standard square grid |
| Hex (Flat-Top) | Horizontal hexagons |
| Hex (Pointy-Top) | Vertical hexagons |
| None | No grid overlay |

**Grid cell size** determines how many image pixels equal one grid cell. You can set width and height independently (link/unlink with the 🔗 button) for stretched grids.

**Grid offset** (`gridOffsetX`, `gridOffsetY`) shifts the grid to align with the map image.

The system attempts **automatic grid detection** using heuristic analysis at 70px, 100px, and 140px intervals (matching the common VTT presets).

### Map presets

| Preset | Cell Size | Origin |
|--------|-----------|--------|
| Roll20 | 70 px | Roll20 standard |
| Foundry VTT | 100 px | Foundry default |
| High Resolution | 140 px | Print-quality |
| Custom | User-defined | — |

## The GM view

The GM View is the primary interactive map interface. It renders in a side leaf and provides the full toolbar, all drawing and annotation tools, and real-time synchronization with any connected Player Views.

### Toolbar overview

The floating toolbar sits on the left side of the map viewport and is collapsible (click the ▼ header to toggle). It is organized into sections:

| Section | Tools | Visibility |
|---------|-------|------------|
| **Common** | Pan, Select, Highlight, PoI, Marker, Draw, Ruler, Token Distance, AoE, Eraser | Always visible |
| **Hexcrawl** | Terrain Paint, Climate Paint, Set Start Hex, Hex Desc | Hex grid + world/regional maps only |
| **Vision** | Fog, Walls, Lights, Tile Elevation, Difficult Terrain, Env Assets + Background Edit View filter chips | Background layer only |
| **Token Vision** | Vision selector dropdown | Always (hidden on hexcrawl maps) |
| **Tunnels** | Clear Tunnels | Subterranean layer only |
| **Setup** | Move Grid, Calibrate, Measure | Hidden once annotations exist (to prevent misalignment) |
| **Player View** | Player View toggle + sub-menu | Always visible |

An **Undo/Redo bar** is shown at the top center of the viewport when actions are available.

### Layer system

Maps have five layers, selected from the **layer menu** below the toolbar:

| Layer | Icon | Purpose |
|-------|------|---------|
| **Player** | 👥 | Default layer for player-visible tokens |
| **Elevated** | 🦅 | Flying/elevated tokens (visible with height indicator) |
| **Subterranean** | 🕳️ | Underground/burrowed tokens; reveals Tunnels section |
| **DM** | 🎲 | GM-only tokens, hidden from Player View |
| **Background** | 🗺️ | Walls, fog, lights, tile elevation, env assets; reveals Vision section |

Click the active layer icon to expand or collapse the layer picker. Select another layer to switch. Vision tools (fog, walls, lights, elevation, difficult terrain, environmental assets) are only available on the **Background** layer.

## Tools

### Pan
**Icon:** ⬆ &nbsp; **Shortcut:** Default tool

Click and drag to pan the map. Mouse wheel to zoom.

### Select
**Icon:** 👆

Click a token to select it. Drag selected tokens to reposition. Click empty space to deselect.

### Highlight
**Icon:** ⬜ (square grid) / ⬡ (hex grid)

Click grid cells to highlight or un-highlight them. Useful for marking areas of interest, movement ranges, or zones.

### Point of interest
**Icon:** 📍

Place Points of Interest on hex maps. PoI types include: settlement, dungeon, landmark, danger, quest, and custom. Only visible on hexcrawl maps (hex grid + world/regional type).

### Marker (token placement)
**Icon:** 🎯

Opens the **Marker Picker** modal to select a token from your library, then click the map to place it. Tokens snap to the grid based on their creature size.

### Draw
**Icon:** ✏

Freehand drawing tool. Select a color from the color picker. Drawings are persisted and visible on the Player View.

### Ruler
**Icon:** 📏

Click and drag to measure distance between two points. Distance is calculated using the map's configured scale (feet, miles, or km per grid cell).

### Token distance
**Icon:** 📐

Click a token, then click a destination to measure the distance between them, accounting for grid geometry.

### AoE (area of effect)
**Icon:** 💥

Place Area of Effect templates. Click the button (or click again when active) to open the shape picker:

| Shape | Icon | Description |
|-------|------|-------------|
| Circle | ⭕ | Circular radius (e.g., Fireball) |
| Cone | 🔺 | Cone emanation (e.g., Burning Hands) |
| Square | ⬜ | Square area (e.g., Darkness) |
| Line | ➖ | Line effect (e.g., Lightning Bolt) |

Click to set the origin, move the mouse to set size/direction, click again to place. A third click removes the last placed AoE. AoE effects are anchored to tokens when cast from the token context menu.

> **Note:** AoE effects are **session-only** and are intentionally not persisted between sessions.

### Eraser
**Icon:** 🧹

Select drawings, highlights, or AoE effects to remove them.

## Vision and background tools

These tools are only available when the **Background** layer is active.

### Background edit views

Filter chips at the top of the Vision section let you focus on one system at a time:

| View | Icon | Shows |
|------|------|-------|
| All | 👁 | Everything |
| Walls | 🧱 | Wall segments only |
| Lights | 💡 | Light sources only |
| Fog | 🌫️ | Fog regions only |
| Elevation | ⛰️ | Tile elevation |
| Difficult Terrain | 🌿 | Difficult terrain tiles |
| Env Assets | 📦 | Environmental assets only |

### Fog of war
**Icon:** 🌫️

Cover the map in darkness and selectively reveal areas. Select the fog button to open the sub-menu:

**Mode toggle:**
- 👁️ **Reveal** — Reveals fog in the drawn area
- 🚫 **Hide** — Re-covers revealed areas

**Shapes:**
| Shape | Icon | Usage |
|-------|------|-------|
| Brush | 🖌️ | Click and drag to paint |
| Circle | ⭕ | Click center, drag radius |
| Rectangle | ⬜ | Click corner, drag opposite corner |
| Polygon | ⬠ | Click vertices, close to complete |

**Bulk actions:**
- ☀️ **Reveal All** — Clears all fog, revealing the entire map
- 🌑 **Hide All** — Covers the entire map in fog

### Walls
**Icon:** 🧱

Draw wall segments to block line of sight for dynamic vision. Click to start a wall chain, click to add vertices, press **Enter** to finish the chain. Press **Escape** to cancel.

Click the walls button when active to open the wall type picker:

| Type | Icon | Blocks Sight | Blocks Movement | Style |
|------|------|:---:|:---:|-------|
| Wall | 🧱 | ✅ | ✅ | Solid red-orange |
| Door | 🚪 | ✅ | ✅ | Solid brown |
| Window | 🪟 | ❌ | ✅ | Solid light blue |
| Secret Door | 🔒 | ✅ | ✅ | Dashed grey |
| Invisible Wall | 👻 | ✅ | ✅ | Dotted light grey |
| Terrain | 🪨 | ❌ | ✅ | Solid earth tone |

**Additional wall actions:**
- 🗑️ **Delete All Walls** — Removes every wall segment on the map

### Magic wand (auto-detect walls)
**Icon:** 🪄 (in the Walls sub-menu)

Automatically detect wall boundaries from the map image. Click on dark areas (e.g., dungeon walls) and the algorithm traces their contours to generate wall segments.

**Parameters (adjustable via sliders):**
| Parameter | Description | Range |
|-----------|-------------|-------|
| Threshold | Brightness cutoff for "dark" pixels | 10–200 |
| Tolerance | Color similarity tolerance for flood fill | 5–100 |
| Simplify | Ramer-Douglas-Peucker simplification (higher = fewer segments) | 1–20 |
| Invert | Select light areas instead of dark | Toggle |

The algorithm uses scanline flood fill → Moore neighborhood boundary tracing → RDP polyline simplification.

### Light sources
**Icon:** 💡

Place light sources for dynamic lighting. Click the lights button when active to choose a source type:

| Source | Icon | Bright | Dim | Notes |
|--------|------|--------|-----|-------|
| Candle | 🕯️ | 5 ft | 5 ft | Flickers |
| Torch | 🔥 | 20 ft | 20 ft | Flickers |
| Lantern | 🏮 | 30 ft | 30 ft | Steady |
| Bullseye Lantern | 🔦 | 60 ft | 60 ft | Cone-shaped |
| Light Spell | ✨ | 20 ft | 20 ft | Steady |
| Dancing Lights | 💫 | 0 ft | 10 ft | Flickers |
| Continual Flame | 🔥 | 20 ft | 20 ft | Flickers |
| Daylight Spell | ☀️ | 60 ft | 60 ft | Steady |
| Fluorescent | 💡 | 30 ft | 10 ft | Flickers (neon buzz) |

Click the map to place a light. Right-click a placed light to open a context menu for editing or deleting it.

**Additional actions:**
- 🌑 **Clear All Lights** — Removes all placed light sources

### Wall light
**Icon:** 📏 (in the Lights sub-menu)

A special light mode for strips of light along walls. Select two points to draw a light strip (15 ft bright + 15 ft dim).

### Tile elevation
**Icon:** ⛰️

Paint elevation values onto grid tiles. Open the sub-menu to set the elevation value (in feet, increments of 5 ft), then click tiles to paint. Set the value to 0 to act as an eraser. Elevation affects token layer assignment and movement.

### Difficult terrain
**Icon:** 🌿

Mark grid tiles as difficult terrain (halves movement speed). Toggle between the paint brush (🌿) and eraser (🗑️) from the sub-menu.

### Environmental assets
**Icon:** 📦

Opens the **Env Asset Picker** modal to select an asset from your library, then enter placement mode. Select a grid cell on the map to place it. See [Env Assets](envasset.md) for details.

## Token vision

### Vision selector

The **Token Vision** section provides a dropdown to select whose vision is shown in the Player View:

- **All Players (👥)** — Default. Union of all player token vision ranges.
- **Individual token** — Click a token entry to show only that token's field of view (respects darkvision and carried lights).

Only **player-type tokens** and tokens with **Show to Players** enabled appear in the selector.

### Combat vision

Use the **Vision Selector** dropdown in the Token Vision panel to manually switch token perspectives during combat:

- Select a **player token** to show only that token's field of view (respects darkvision and carried lights).
- Select **All Players** to show the combined vision of all player-type tokens.

## Token context menu

Right-click any token on the map to access:

### Layer assignment
Move the token to any of the five layers: Player, Elevated, Subterranean, DM, Background.

### Show to players
Toggle (for non-player tokens) whether the token is visible in the Player View. When enabled, the token also becomes available in the Vision Selector.

### AoE from token
For player, NPC, and creature tokens: choose an AoE shape (Circle, Cone, Square, Line) to cast from the token's position. The AoE anchors to the token and moves with it. Clicking the same shape again removes the AoE.

### Attached light
Attach a personal light source to the token. Quick options: Candle (5ft), Torch (20ft), Lantern (30ft), Light Spell (20ft), Daylight (60ft), Fluorescent (30ft), or ❌ Off.

When a light is attached, a **Light Colour** picker appears to customize the light's color (with a reset-to-default option).

### Darkvision override
Set per-instance darkvision range (0–300 ft, in 5 ft increments). Overrides the marker definition's default.

### Appearance (border color)
Customize the token's border color per-instance (with reset to default).

### Elevation (flying and burrowing)

- **Height** (0–500 ft): Sets the token as flying. Automatically moves to the **Elevated** layer.
- **Depth** (0–500 ft): Sets the token underground. Automatically moves to the **Subterranean** layer.
- **Burrowing** checkbox: When enabled together with a depth value, the token creates a **tunnel** — a tracked path visible on the Subterranean layer. Other creatures can enter tunnels if they fit (creature size must be ≤ the tunnel creator's size).

Setting either height or depth to 0 returns the token to its previous layer (Player, unless it was manually assigned to DM or Background).

### Tunnel navigation

When a token is near a tunnel entrance or exit:
- **Enter Tunnel** — Snaps the token into the tunnel and sets the appropriate depth. Navigate using **arrow keys**.
- **Exit Tunnel** — Returns the token to the surface (Player layer). Only available when at the entrance or exit of the tunnel.

While in a tunnel, a progress percentage is shown in notifications.

### Token auras

Add circular aura rings around a token:
- Click **➕ Add Aura** to create a new aura
- Set **Radius** (5–120 ft) and **Color** per aura
- Click **✕** to remove an aura
- Multiple auras can be stacked on a single token

### Delete
Remove the token from the map.

## Markers (token library)

Markers are reusable token definitions stored globally in your vault. For library and API details see [Marker system](marker-system.md).

### Creating markers

Open the **Marker Library** modal from the Marker tool button or the DnD Hub. Fields:

| Field | Description |
|-------|-------------|
| Name | Display name |
| Type | Player, NPC, Creature, POI, or Other |
| Creature Size | Tiny, Small, Medium, Large, Huge, Gargantuan (D&D 5e sizes) |
| Darkvision | Default darkvision range (0–300 ft) |
| Pixel Size | Size in pixels for POI/Other types (20–100) |
| Token Image | Browse vault images or import from computer |
| Image Fit | Cover (fills circle, may crop) or Contain (fits inside, may show background) |
| Icon | Over 40 predefined emoji icons |
| Background Color | Circle fill color |

A live preview circle shows how the token will appear on the map.

### Marker types and sizes

| Type | Icon | Visible to Players by Default |
|------|------|:---:|
| Player | 👤 | ✅ |
| NPC | 🧑 | ❌ |
| Creature | 👹 | ❌ |
| POI | 📍 | ❌ |
| Other | ⚙️ | ❌ |

**D&D Creature Sizes (grid squares occupied):**

| Size | Squares | Dimensions |
|------|---------|------------|
| Tiny | 0.5 × 0.5 | Half a cell |
| Small | 1 × 1 | 1 cell |
| Medium | 1 × 1 | 1 cell |
| Large | 2 × 2 | 4 cells |
| Huge | 3 × 3 | 9 cells |
| Gargantuan | 4 × 4 | 16 cells |

### Marker picker

When the Marker tool is activated, the Marker Picker modal opens, showing all markers grouped by type. Features:
- Search filter
- Preview circles with name, campaign, and size
- Quick edit and delete actions per marker
- Click to select for placement

## Environmental assets library

Environment assets are props placed on the Background layer — doors, scatter objects, and traps with physical properties.

### Asset categories

| Category | Icon | Description |
|----------|------|-------------|
| **Scatter** | 📦 | Decorative or functional objects (furniture, barrels, trees). Can optionally block vision with a configurable wall height. |
| **Door** | 🚪 | Openable doors with pivot or sliding behaviour. Toggle open/close, reverse direction. |
| **Trap** | ⚠️ | Trap mechanisms. Types: pit, spikes, dispenser, flamethrower, custom. Can be hidden from players. |

### Creating assets

Open the **Env Asset Library** modal. Fields:

| Field | Description |
|-------|-------------|
| Name | Display name |
| Category | Scatter, Door, or Trap |
| Asset Image | PNG image (browse vault or import to `z_Assets/EnvAssets/`) |
| Default Width / Height | Default placement size in pixels |

**Door-specific config:**
- **Behaviour:** Pivot (swings open around one edge) or Sliding (slides along its open path)

**Scatter-specific config:**
- **Blocks Vision:** Whether the object casts shadows / blocks line of sight
- **Wall Height:** Effective wall height for vision blocking (5–20 ft)

**Trap-specific config:**
- **Trap Type:** Pit, Spikes, Dispenser, Flamethrower, or Custom
- **Hidden:** Whether the trap is initially invisible to players

### Placing and transforming assets

1. Select the **Env Assets** tool (📦) on the Background layer.
2. Choose an asset from the picker.
3. Click on the map to place it.
4. Select the placed asset to see **transform handles**:
   - **8 corner/edge handles** for resizing
   - **Rotation handle** for free rotation
   - **Pivot handle** (doors) for setting the pivot point

### Asset context menu

Right-click a placed asset for:

| Action | Applies To | Description |
|--------|-----------|-------------|
| Rotate 90° CW/CCW | All | Quick rotation |
| Reset Rotation | All | Reset to 0° |
| Lock / Unlock | All | Prevent accidental moves |
| Open / Close | Doors | Toggle door state |
| Reverse Open Direction | Doors | Flip which way the door opens |
| Change Behaviour | Doors | Switch between pivot and sliding |
| Enable/Disable Vision Block | Scatter | Toggle vision obstruction |
| Wall Height (5/10/15/20 ft) | Scatter | Set effective wall height |
| Delete | All | Remove the asset |

## Setup tools

These tools are **hidden** once any annotations (highlights, markers, drawings, AoE effects) exist on the map, to prevent grid misalignment. On hexcrawl maps, they remain available because hex highlights use column and row coordinates.

### Move grid
**Icon:** ✥

Click and drag to reposition the grid overlay relative to the image.

### Calibrate (grid calibration)
**Icon:** ⚙

Opens the **Grid Calibration** modal for precise grid size and width/height adjustment.

### Measure
**Icon:** 📏

A two-point measurement mode. Click two points on the map to measure the pixel distance between them, useful for verifying grid alignment.

## Player View

### Opening the Player View

1. Activate the **Player View** tool (📺) in the GM toolbar.
2. A rectangular frame appears on the GM map — this is the **GM View Rectangle**. Drag it to select what the players see.
3. The **Player Map View** opens in a separate Obsidian leaf (typically popped out to a second monitor).

### Tabletop mode

The Player View always operates in **tabletop mode** — it cannot be panned or zoomed by the players. All positioning is controlled exclusively by the GM through the view rectangle.

Real-time synchronization keeps the Player View in lockstep with the GM's annotations: fog reveals, token movements, light changes, and more are reflected instantly.

### Rotation

While the Player View tool is active, rotate the view rectangle:

| Key | Action |
|-----|--------|
| **Q** or **[** | Rotate 90° counter-clockwise |
| **E** or **]** | Rotate 90° clockwise |

Rotation is broadcast to the Player View, which renders the map at the rotated angle. This is useful when projecting onto a table where the physical orientation doesn't match the digital map.

### Fullscreen

Click the Player View tool when active to open the sub-menu, then click **🖵 Fullscreen** to toggle fullscreen on the Player View. When fullscreen, Obsidian's UI chrome is hidden.

### Tabletop calibration

Select the **Calibrate** button in the Player View sub-menu to open the **Tabletop Calibration** modal. This ensures physical miniatures match the grid.

**Three-step calibration:**

1. **Monitor Size** — Enter the diagonal size of the player-facing monitor in inches. This determines pixels-per-millimetre (PPI).
2. **Mini Base Size** — Enter the base size of your physical miniatures in millimetres (default: 25mm for standard D&D minis).
3. **Fine-Tune** — A credit card–width reference ruler appears. Use the adjustment slider (0.80×–1.20×) to fine-tune until the on-screen ruler matches a real credit card (85.6mm width).

After calibration, the Player View automatically scales so that each grid cell matches the physical mini base size on screen.

## Map management

### Map manager

Open the **Map Manager** from the command palette or DnD Hub. It has two tabs:

| Tab | Contents |
|-----|----------|
| **Templates** | All saved battlemap templates |
| **Active Maps** | Maps currently placed in notes |

Both tabs feature:
- **Search** by name
- **Thumbnail previews** with metadata (grid type, grid size, scale, dimensions, last modified)
- Per-map actions:

| Action | Description |
|--------|-------------|
| ✏️ Edit | Reopen the Map Creation modal |
| 🏷️ Tags | Edit template tags (templates only) |
| 📋 Duplicate | Copy the template (strips tokens, keeps walls/lights/fog) |
| 🚫 Unmark | Remove the template flag (templates only) |
| 🗑️ Delete | Delete with confirmation (optionally removes code block from note) |

### Template tags

Templates can be tagged for easy filtering in the Template Picker. Tag categories:

| Category | Values |
|----------|--------|
| **Terrain** | From hexcrawl terrain definitions (forest, mountain, desert, etc.) |
| **Climate** | From hexcrawl climate definitions (tropical, temperate, arctic, etc.) |
| **Location** | 16 predefined types + custom (open-field, forest-clearing, cave, dungeon, ruins, tower, temple, tavern, village, castle, bridge, camp, ship, underground, shore, road-ambush) |
| **Time of Day** | Day, Night, Any |
| **Size** | Small, Medium, Large |
| **Custom** | Free-form tags added inline |

The Template Picker shows a browsable grid of templates with search by name or tag.

### Duplicating and deleting

- **Duplicate template:** Creates a copy with refreshed IDs. Tokens are stripped, but walls, lights, fog, and other structural annotations are preserved.
- **Delete map:** Opens a confirmation modal with an option to also remove the `dnd-map` code block from the source note.

## Undo and redo

Most annotation actions support undo/redo:

| Action | Shortcut |
|--------|----------|
| Undo | **Ctrl+Z** |
| Redo | **Ctrl+Y** |

The undo/redo bar appears at the top center of the viewport when actions are available.

Tracked operations include: marker placement/movement/deletion, wall drawing, fog changes, drawing, highlights, AoE placement, elevation/terrain paint, environmental asset changes, and burrowing/tunnel operations.

## Keyboard shortcuts

| Key | Context | Action |
|-----|---------|--------|
| **Ctrl+Z** | Any | Undo |
| **Ctrl+Y** | Any | Redo |
| **Enter** | Walls tool | Finish wall chain |
| **Escape** | Walls tool | Cancel wall drawing |
| **Q** / **[** | Player View tool | Rotate view 90° counter-clockwise |
| **E** / **]** | Player View tool | Rotate view 90° clockwise |
| **Arrow Up/Right** | Token in tunnel | Move forward along tunnel path |
| **Arrow Down/Left** | Token in tunnel | Move backward along tunnel path |
| **Mouse Wheel** | Any | Zoom in/out |

## Data storage

All map data is stored in your Obsidian vault:

| Data | Location |
|------|----------|
| Map annotations | `.obsidian/plugins/<pluginId>/map-annotations/<mapId>.json` |
| Marker library | `.obsidian/plugins/<pluginId>/markers.json` |
| Env asset library | `.obsidian/plugins/<pluginId>/env-assets.json` |
| Map images | `z_Assets/Maps/` |
| Env asset images | `z_Assets/EnvAssets/` |
| Template notes | `z_BattlemapTemplates/` |
| Tabletop calibration | Plugin settings |

The annotation JSON file contains the complete map state: grid settings, fog of war, walls, light sources, markers, drawings, tunnels, tile elevations, difficult terrain, environmental assets, template tags, and hexcrawl data. Annotations are saved with a 1-second debounce.

> **Note:** AoE effects are intentionally **not persisted** — they are session-only and will be cleared when the map is reloaded.
