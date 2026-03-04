# Music player

The music player provides a dual-layer audio system with playlists, a soundboard for one-shot effects, Freesound integration for downloading sounds, and scene-linked music blocks that auto-load when you navigate between scenes.

## Sidebar panel

Open the music player from the sidebar (it registers as a leaf view). The panel has two layer sections and a soundboard:

### Primary layer

The primary layer plays melodic or thematic music — battle themes, tavern songs, or exploration tracks. Controls:

- **Now Playing** — the current track title and playlist name.
- **Progress bar** — select anywhere on the bar to seek. Elapsed and total time are shown.
- **Transport** — Shuffle, Previous, Play/Pause, Stop, Next, and Repeat (three modes: off, repeat track, repeat playlist).
- **Volume** — a mute button, slider (0–100%), and percentage display.
- **Playlist selector** — dropdown showing all playlists.
- **Track list** — collapsible numbered list. Select a track to jump to it.

### Ambient layer

The ambient layer plays background sounds — rain, wind, forest ambiance, or dungeon echoes. It uses the same controls as the primary layer but the playlist dropdown only shows playlists marked as background/environment sounds.

### Soundboard

A grid of emoji buttons for one-shot sound effects. Select a button to play the effect immediately, overlaid on the current music. A visual pulse confirms playback.

Select **Stop All** below the layers to stop both layers and all sound effects at once.

## Music settings

Open the music settings from the Command Palette (**Open Music Settings**) or the sidebar panel. The modal has three tabs:

### Playlists tab

- Select **New Playlist** to create a playlist manually.
- Select **Import from Subfolders** to scan a folder and create playlists from each subfolder. Mood is auto-detected from folder names.
- Each playlist card has:
  - **Name** — editable text input.
  - **Mood** — dropdown with 10 options: Ambient, Combat, Exploration, Mysterious, Epic, Tavern, Horror, Calm, Dramatic, or Custom.
  - **Background / Environment sound** — toggle. When enabled, the playlist appears in the ambient layer dropdown.
  - **Track list** — drag-and-drop reordering with handles. Remove individual tracks.
  - **Add Tracks** — browse vault audio files with a filter.
  - **Scan Folder** — add all audio files from a folder.
  - **Search Freesound** — open the Freesound browser to download and add tracks.
  - **Delete** — remove the playlist.

### Soundboard tab

- Select **New Sound Effect** to add an effect manually.
- Select **Scan Folder for SFX** to auto-import audio files as effects with auto-detected names and emoji icons.
- Select **Search Freesound** to download effects.
- Select **Load Preset Names** to populate 12 D&D presets: Sword Clash, Fire, Fanfare, Horror, Death, Door, Thunder, Magic, Explosion, Arrow, Healing, and Coins.
- Each effect card has:
  - **Icon** — emoji (up to four characters).
  - **Name** — display name.
  - **File** — vault audio file picker.
  - **Volume** — slider for per-effect volume override.
  - **Delete** — remove the effect.

### General tab

| Setting | Description | Default |
| --- | --- | --- |
| Audio Folder | Root folder for audio files (with autocomplete) | — |
| Default Volume | Global playback volume | 70% |
| Ambient Layer Volume | Volume for the ambient layer | 50% |
| Crossfade Duration | Milliseconds to crossfade between playlists (0 to disable) | 2000 ms |
| Fade In/Out Duration | Milliseconds for play/stop fades | 1500 ms |
| Ducking Enabled | Auto-reduce music volume when SFX plays | On |
| Ducking Amount | How much to reduce music volume | 50% |
| Duck Fade Down | Milliseconds to fade music down when SFX starts | 100 ms |
| Duck Fade Up | Milliseconds to fade music back up when SFX ends | 400 ms |
| Freesound API Key | API key from freesound.org for searching and downloading sounds | — |

## Supported audio formats

mp3, wav, ogg, m4a, flac, webm, and aac.

## Scene music blocks

Embed a scene music block in any note to pre-configure music for that scene:

````
```dnd-music
{"primaryPlaylistId":"...","ambientPlaylistId":"...","autoPlay":true}
```
````

### Insert a scene music block

1. Open the Command Palette and run **Insert Scene Music**.
2. Select the primary playlist and optionally a starting track.
3. Select the ambient playlist (filtered to background sounds) and optionally a starting track.
4. Toggle **Auto-play** — when enabled, music starts automatically when the scene opens.
5. Select **Insert**.

The rendered card shows the primary and ambient playlist names, a **Load & Play** / **Stop** toggle button, and an auto-play badge if enabled. Select the edit button to change the configuration.

When you open a scene note with a `dnd-music` block during a session (for example, via the run dashboard), the music player automatically fades out the current music and loads the scene's playlists.

## Sound effect blocks

Embed a sound effect trigger in any note:

````
```dnd-sfx
{"name":"Thunder","icon":"⚡","filePath":"...","volume":80}
```
````

### Insert a sound effect block

1. Open the Command Palette and run **Insert Sound Effect**.
2. Select an effect from the configured soundboard grid, or browse a vault audio file.
3. Set the name, icon, and volume.
4. Select **Insert**.

The rendered card shows a large play button with the emoji icon and name. Selecting it plays the effect overlaid on current music without stopping playback.

## Freesound integration

The plugin can search and download sounds from [Freesound](https://freesound.org):

1. Enter your Freesound API key in the music settings (General tab). You can get a key at [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply).
2. Open the Freesound search from any playlist, soundboard, or SFX modal.
3. Search by keyword. Filter by duration (under 5s, 15s, 30s, 60s, or 1–5 min) and sort by relevance, rating, downloads, duration, or newest.
4. Results show name, duration, rating, download count, tags, author, and Creative Commons license badge.
5. Select the preview button to listen before downloading.
6. Select the download button to save an MP3 preview to `<Audio Folder>/Freesound/`.

The plugin automatically maintains a `freesound-credits.md` file with attribution for all downloaded sounds.

## Fade and ducking system

- **Crossfade** — when switching playlists, the current playlist fades out while the new one fades in, using the configured crossfade duration.
- **Play/stop fade** — starting and stopping playback uses a perceptual (exponential) easing curve for smooth transitions.
- **Ducking** — when a sound effect plays, both music layers duck (reduce volume) by the configured amount. The duck fades use independent timing for the down and up transitions.
