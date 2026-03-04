# Sessions

Session notes track what happens at each game table meeting. D&D Campaign Hub auto-numbers sessions, links them to adventures and scenes, and provides two sidebar dashboards for preparation and live play.

## Create a session

1. Open the Command Palette and run **Create New Session**.
2. Fill in the fields:
   - **Session Number** — auto-incremented based on existing sessions (read-only).
   - **Session Title** — for example, "The Goblin Ambush".
   - **Adventure** — select an adventure from the dropdown, or choose **None**.
   - **Starting Scene** — auto-populated from the selected adventure. Scenes that are in progress appear first, followed by scenes that have not started. Each entry shows its status label.
   - **Session Date** — the real-world date. Toggle the custom date option to enter a different date.
   - **In-Game Calendar** — when a Calendarium calendar is linked, the start date is auto-filled from the previous session's end date. Select **Pick End Date** to open the calendar date picker.
   - **Location** — where the session takes place in the game world.
3. Select **Create Session**.

After creation, the plugin optionally prompts you to update scene statuses — marking prior scenes as completed and the starting scene as in progress.

## End a session

1. Open an active session note.
2. Run **End Session Here** from the Command Palette.
3. Select the ending scene from the adventure.
4. The plugin records the ending scene in the session frontmatter and optionally updates scene statuses.

## Session Prep Dashboard

The Session Prep Dashboard is a sidebar panel for pre-session planning.

### Open the dashboard

Run **Open Session Prep Dashboard** from the Command Palette. The panel opens in the left sidebar.

### Sections

- **Adventure Progress** — shows adventure cards with status badges, progress bars (scenes completed out of total), the next upcoming scene with its duration, type, and difficulty, and a list of remaining scenes.
- **Quick Actions** — creation buttons for sessions, scenes, encounters, adventures, NPCs, PCs, creatures, factions, items, spells, and traps.
- **Party Overview** — PC cards with name, HP bars (color-coded green, orange, or red based on health percentage), and AC.
- **Recent NPCs** — the eight most recently modified NPCs as clickable links.
- **Last Session** — a link to the previous session with a summary excerpt.

The dashboard auto-refreshes every 30 seconds and when the Obsidian window regains focus. While the dashboard is active, open notes are switched to editing (source) mode for quick prep work.

## Session Run Dashboard

The Session Run Dashboard is a sidebar panel for live play.

### Open the dashboard

Run **Open Session Run Dashboard** from the Command Palette.

### Sections

- **Read-Only Toggle** — switch between read-only mode (locks all notes to preview) and editable mode.
- **Timers** — create named timers for tracking combat rounds, rest periods, or any timed event. Each timer shows hours, minutes, and seconds with resume, pause, and remove controls.
- **Dice Roller** — buttons for d4, d6, d8, d10, d12, d20, and d100. Results appear in a history list of the last ten rolls.
- **Scene Music** — auto-detects `dnd-music` code blocks in the open scene note. Shows the primary and ambient playlist names with load, play, and stop controls.
- **Quick Notes** — a text area that auto-saves every 30 seconds to the session note's "Quick Notes" section. Select **Save Now** to save immediately.
- **SRD Quick Search** — search across imported SRD data (spells, equipment, classes). Results appear as cards with a type badge, name, and preview text. Select a result to open it in a new tab.
- **Quick Actions** — the same creation buttons as the Prep Dashboard.
- **Setup Session Layout** — select this to auto-open the scene, adventure, and session notes in a split layout, open the Initiative Tracker, and collapse frontmatter properties for a clean workspace.
