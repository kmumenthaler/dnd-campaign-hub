# D&D Session Transcription Plugin

Ein Obsidian-Plugin zur automatischen Transkription und Zusammenfassung von D&D-Sessions.

## Features

- 🎙️ **Audio-Transkription**: Nutzt OpenAI Whisper zur Transkription von MP3-Dateien
- 🤖 **KI-Zusammenfassung**: Generiert strukturierte Session-Zusammenfassungen mit GPT-4
- 📝 **Markdown-Export**: Speichert Sessions automatisch als Markdown-Dateien
- ⚙️ **Konfigurierbar**: API-Key, Zielordner und Prompt-Template anpassbar
- 🏷️ **YAML Frontmatter**: Optional mit Metadaten
- 🕐 **Auto-Dateinamen**: Automatische Benennung mit Datum/Zeit

## Installation

### Entwicklungsumgebung einrichten

1. Klone dieses Repository in den `.obsidian/plugins` Ordner deines Vaults
2. Installiere Dependencies:
   ```bash
   npm install
   ```
3. Baue das Plugin:
   ```bash
   npm run dev
   ```

### Für Produktion

```bash
npm run build
```

## Verwendung

1. **API-Key konfigurieren**: Öffne die Plugin-Einstellungen und trage deinen OpenAI API-Key ein
2. **Zielordner festlegen**: Wähle den Ordner für Session-Zusammenfassungen
3. **Audio transkribieren**: 
   - Öffne die Command-Palette (`Ctrl/Cmd + P`)
   - Suche nach "Transcribe D&D Session Audio"
   - Wähle eine MP3-Datei aus
   - Das Plugin transkribiert die Datei und erstellt eine strukturierte Zusammenfassung

## Einstellungen

- **OpenAI API Key**: Dein API-Key für Whisper und GPT-4
- **Zielordner**: Speicherort für Session-Zusammenfassungen
- **YAML Frontmatter**: Fügt Metadaten am Anfang hinzu
- **Sprachtrennung**: Experimentelle Funktion zur Trennung von Schweizerdeutsch und Hochdeutsch
- **Prompt Template**: Anpassbares Template für die Zusammenfassungsstruktur

## Standard-Ausgabeformat

```markdown
---
date: 2026-01-08T12:00:00.000Z
type: dnd-session
source: session-recording.mp3
tags: [dnd, session]
---

# Session-Zusammenfassung

## Überblick
[Kurze Zusammenfassung]

## Ereignisse
[Chronologische Ereignisse]

## NPCs
[Aufgetretene NPCs]

## Items & Schätze
[Gefundene Items]

## Hooks & Plotpunkte
[Offene Story-Threads]

## Notizen
[Zusätzliche Notizen]
```

## API-Kosten

Beachte, dass die Verwendung von OpenAI Whisper und GPT-4 Kosten verursacht:
- **Whisper**: ~$0.006 pro Minute Audio
- **GPT-4**: Abhängig von der Token-Anzahl

## Technologie

- TypeScript
- Obsidian API
- OpenAI Whisper API
- OpenAI GPT-4 API
- esbuild

## Lizenz

MIT

## Autor

[Dein Name]
