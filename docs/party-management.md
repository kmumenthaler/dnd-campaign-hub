# Party management

The plugin integrates with Initiative Tracker's party system. When you create a player character in a GM campaign, the plugin can automatically register it in Initiative Tracker and assign it to a campaign party.

## Create a PC with tracker integration

1. Open the Command Palette and run **Create Player Character**.
2. Fill in the PC details — name, player, classes, level, HP, AC, initiative modifier, and speed.
3. Enable **Register in Initiative Tracker** (GM campaigns only, enabled by default).
4. Select **Create**.

The plugin:

- Creates the PC note in `<Campaign>/PCs/`.
- Adds the PC to Initiative Tracker's player list with mapped stats.
- Creates a campaign party named `<Campaign Name> Party` if one does not exist.
- Assigns the PC to the campaign party.

### Stat mapping

| PC note field | Initiative Tracker field | Notes |
| --- | --- | --- |
| `name` | `name` | Character name |
| `hp` | `currentHP` | Current hit points |
| `hp_max` | `hp`, `currentMaxHP` | Maximum hit points |
| `ac` | `ac`, `currentAC` | Armor class |
| `init_bonus` | `modifier` | Initiative modifier |
| `level` | `level` | Character level |
| File path | `path` | Link back to PC note |
| `player` + `class` | `note` | Additional info display |

All registered PCs are marked as `player: true` and `friendly: true` in Initiative Tracker.

## Use party members in combat

1. Open Initiative Tracker and select the **Parties** section.
2. Select your campaign party (for example, "Shore of Dreams Party").
3. Select **Add to Encounter** to load all party members into the combat tracker.
4. Add enemies using Initiative Tracker's creature search or the plugin's scene encounter builder.

## Multiple campaigns

Each campaign gets its own party. The first campaign party created becomes Initiative Tracker's default party. You can switch between campaign parties in the tracker at any time.

## Limitations

- **One-way sync** — PC stats are sent to Initiative Tracker on creation only. Changes to the PC note are not automatically reflected in the tracker.
- **GM campaigns only** — the Register in Initiative Tracker toggle appears only when the campaign role is Game Master.
- Initiative Tracker must be installed and enabled for party registration to work. If it is missing, the PC note is still created normally.
