# D&D Campaign Hub

A comprehensive Obsidian plugin for managing D&D (or any TTRPG) campaigns with integrated calendars, session tracking, NPC management, and more.

> **⚠️ Project Status: Early Preview**
>
> The plugin is still in active incubation. Expect breaking changes, incomplete features, and rapid iteration until the first stable release ships. Issues and suggestions are very welcome!

## Features (Preview)

### ✅ Available Today
- **Vault Initialization**: Creates the entire hub structure (ttrpgs/, z_* folders) and installs required community plugins so you can hit the ground running.
- **Campaign Creator**: Guided modal for spinning up a new campaign, including optional calendar linkage for future session tracking.
- **Session Creator**: Generates numbered session notes with real-world and in-world dates, pulling continuity data from your last session or campaign start.

### 🔭 Coming Soon
- NPC, PC, faction, item, spell, and adventure creators.
- Browse view for jumping directly to folders from the hub.
- Template update assistant and dependency health checks.
- Vault purge utilities and advanced automation.

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

D&D Campaign Hub requires these community plugins for full functionality:

- **[Buttons](https://github.com/shabegom/buttons)** - Interactive buttons for creating campaign elements
- **[Dataview](https://github.com/blacksmithgu/obsidian-dataview)** - Dynamic tables and queries for organizing data
- **[Calendarium](https://github.com/javalent/calendarium)** - Fantasy calendar integration for tracking in-game dates

The plugin will prompt you to install these dependencies if they're missing.

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

### 3. Start Your First Session

1. Navigate to your campaign's World.md file
2. Click the "Create New Session" button
3. Fill in session details (date, location, etc.)
4. Start documenting your adventure!

## Commands

Access these via the Command Palette (`Ctrl/Cmd + P`):

- **Open D&D Campaign Hub** – Launch the modal dashboard
- **Initialize D&D Campaign Hub** – Create the folder structure and install required plugins
- **Create New D&D Campaign** – Start a new campaign workspace
- **Create New Session** – Generate the next numbered session note

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
  main.ts          # Main plugin logic
  templates.ts     # Template definitions
  styles.css       # Plugin styles
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

## Tips & Best Practices

1. **Use Buttons**: Click buttons in World.md instead of creating files manually
2. **Tag Consistently**: Use tags in frontmatter for easy filtering
3. **Link Liberally**: Use `[[wikilinks]]` to connect NPCs, locations, and events
4. **Review Backups**: Check `z_Backups/` if you need to restore content
5. **Update Regularly**: Apply template updates to get new features

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
