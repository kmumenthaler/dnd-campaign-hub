import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, Modal, AbstractInputSuggest } from 'obsidian';

interface Character {
	id: string;
	name: string;
	race: string;
	class: string;
	note?: string;
}

interface Party {
	id: string;
	name: string;
	characters: Character[];
}

interface DnDTranscriptionSettings {
	apiKey: string;
	targetFolder: string;
	promptTemplate: string;
	includeYamlFrontmatter: boolean;
	autoSeparateLanguages: boolean;
	parties: Party[];
}

const DEFAULT_SETTINGS: DnDTranscriptionSettings = {
	apiKey: '',
	targetFolder: 'DnD Sessions',
	promptTemplate: `Analysiere das folgende D&D-Session-Transkript und erstelle eine strukturierte Zusammenfassung mit folgenden Abschnitten:

# Session-Zusammenfassung

## Überblick
[Kurze Zusammenfassung der wichtigsten Ereignisse]

## Ereignisse
[Chronologische Liste der wichtigsten Ereignisse]

## NPCs
[Liste der NPCs mit kurzer Beschreibung ihrer Rolle]

## Items & Schätze
[Gefundene oder erhaltene Items]

## Hooks & Plotpunkte
[Offene Story-Threads und Hooks für zukünftige Sessions]

## Notizen
[Zusätzliche wichtige Notizen]

TRANSKRIPT:
`,
	includeYamlFrontmatter: true,
	autoSeparateLanguages: false,
	parties: []
}

export default class DnDTranscriptionPlugin extends Plugin {
	settings: DnDTranscriptionSettings;
	progressBar: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		// Command: Transcribe Audio File
		this.addCommand({
			id: 'transcribe-audio',
			name: 'Transcribe D&D Session Audio',
			callback: () => {
				this.transcribeAudio();
			}
		});

		// Settings tab
		this.addSettingTab(new DnDTranscriptionSettingTab(this.app, this));

		console.log('D&D Transcription Plugin loaded');
	}

	onunload() {
		console.log('D&D Transcription Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	createProgressBar(): void {
		this.progressBar = this.addStatusBarItem();
		this.progressBar.addClass('dnd-transcription-progress');
		this.updateProgress(0, 0, 'Initialisiere...');
	}

	updateProgress(current: number, total: number, message: string): void {
		if (!this.progressBar) return;
		
		const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
		const filledBlocks = Math.floor(percentage / 5);
		const emptyBlocks = 20 - filledBlocks;
		
		const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
		this.progressBar.setText(`🎲 ${progressBar} ${percentage}% | ${message}`);
	}

	removeProgressBar(): void {
		if (this.progressBar) {
			this.progressBar.remove();
			this.progressBar = null;
		}
	}

	showPartySelectionModal(): Promise<Party | null> {
		return new Promise((resolve) => {
			const modal = document.createElement('div');
			modal.className = 'modal';
			modal.style.cssText = 'display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;';

			const content = document.createElement('div');
			content.className = 'modal-content';
			content.style.cssText = 'background: var(--background-primary); padding: 20px; border-radius: 8px; max-width: 500px; width: 90%;';

			const title = content.createEl('h2', { text: '🎲 Party auswählen' });
			title.style.marginTop = '0';

			const description = content.createEl('p', { text: 'Wähle die Party aus, die an dieser Session teilnimmt:' });
			description.style.cssText = 'color: var(--text-muted); margin-bottom: 20px;';

			this.settings.parties.forEach(party => {
				const button = content.createEl('button');
				button.className = 'mod-cta';
				button.style.cssText = 'width: 100%; margin-bottom: 10px; padding: 15px; text-align: left; overflow: hidden;';
				
				const partyName = button.createEl('div');
				partyName.textContent = `🎲 ${party.name}`;
				partyName.style.cssText = 'font-weight: bold; margin-bottom: 5px; font-size: 1.1em;';
				
				const characterCount = button.createEl('div');
				const count = party.characters.length;
				characterCount.textContent = count > 0 ? `${count} Charakter${count !== 1 ? 'e' : ''}` : 'Keine Charaktere';
				characterCount.style.cssText = 'font-size: 0.9em; color: var(--text-muted);';

				button.addEventListener('click', () => {
					document.body.removeChild(modal);
					resolve(party);
				});
			});

			const cancelButton = content.createEl('button', { text: 'Abbrechen' });
			cancelButton.style.cssText = 'width: 100%; margin-top: 10px;';
			cancelButton.addEventListener('click', () => {
				document.body.removeChild(modal);
				resolve(null);
			});

			modal.appendChild(content);
			document.body.appendChild(modal);
		});
	}

	async transcribeAudio() {
		console.log('🎲 DEBUG: transcribeAudio() gestartet');
		if (!this.settings.apiKey) {
			console.log('🎲 DEBUG: Kein API-Key konfiguriert');
			new Notice('Bitte konfiguriere den API-Key in den Plugin-Einstellungen');
			return;
		}
		console.log('🎲 DEBUG: API-Key vorhanden');

		// Create file input element
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/mp3,audio/mpeg,.mp3';
		input.multiple = true; // Allow multiple file selection
		
		input.onchange = async (e: Event) => {
			console.log('🎲 DEBUG: onchange Event ausgelöst');
			const target = e.target as HTMLInputElement;
			const files = target.files;
			
			if (!files || files.length === 0) {
				console.log('🎲 DEBUG: Keine Dateien ausgewählt');
				return;
			}
			console.log('🎲 DEBUG: Dateien ausgewählt:', files.length);

			// Party selection if parties exist
			let selectedParty: Party | null = null;
			if (this.settings.parties.length > 0) {
				selectedParty = await this.showPartySelectionModal();
				if (!selectedParty) {
					new Notice('❌ Keine Party ausgewählt - Transkription abgebrochen');
					return;
				}
				console.log('🎲 DEBUG: Party ausgewählt:', selectedParty.name);
			}

			// Convert FileList to Array
			const fileArray = Array.from(files);

			// Validate all files
			for (const file of fileArray) {
				if (!file.name.toLowerCase().endsWith('.mp3')) {
					new Notice(`❌ Ungültige Datei: ${file.name}\nNur MP3-Dateien werden unterstützt.`);
					return;
				}

				// Check file size (Whisper API limit is 25 MB)
				const maxSize = 25 * 1024 * 1024; // 25 MB in bytes
				if (file.size > maxSize) {
					const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
					new Notice(`❌ Datei zu groß: ${file.name} (${sizeMB} MB)\n\nWhisper API Limit: 25 MB\n\nLösung:\n1. Komprimiere die Audio-Datei\n2. Nutze niedrigere Bitrate (z.B. 64kbps)\n3. Teile lange Sessions in kürzere Abschnitte\n\nEmpfohlen: Audacity oder Online-Converter`, 15000);
					return;
				}
			}

			// Show processing notice and create progress bar
			const fileCount = fileArray.length;
			new Notice(`🎙️ Starte Transkription von ${fileCount} Datei(en)...`, 3000);
			
			// Calculate total steps: transcription + part summaries + final summary + save
			const totalSteps = fileCount + fileCount + 2;
			let currentStep = 0;

			this.createProgressBar();

			try {
				// Step 1: Transcribe all audio files
				const transcripts: string[] = [];
				
				for (let i = 0; i < fileArray.length; i++) {
					const file = fileArray[i];
					currentStep++;
					this.updateProgress(currentStep, totalSteps, `Transkribiere ${i + 1}/${fileCount}`);
					new Notice(`🎙️ Transkribiere Datei ${i + 1}/${fileCount}\n${file.name}\n(Dies kann mehrere Minuten dauern...)`, 5000);
					console.log(`🎲 DEBUG: Starte Transkription ${i + 1}/${fileCount} - ${file.name}`);
					
					const transcript = await this.transcribeWithWhisper(file, selectedParty);
					console.log(`🎲 DEBUG: Transkription ${i + 1}/${fileCount} abgeschlossen - Länge: ${transcript.length} Zeichen`);
					new Notice(`✅ Transkription ${i + 1}/${fileCount} abgeschlossen!`, 2000);
					transcripts.push(transcript);
				}

				// Step 2: Generate individual summaries for each part (avoids token limits)
				const partSummaries: string[] = [];
				
				for (let i = 0; i < transcripts.length; i++) {
					currentStep++;
					this.updateProgress(currentStep, totalSteps, `Zusammenfassung ${i + 1}/${fileCount}`);
					new Notice(`📝 Erstelle Zusammenfassung ${i + 1}/${fileCount}...`, 3000);
					console.log(`🎲 DEBUG: Erstelle Part Summary ${i + 1}/${fileCount}`);
					
					const partSummary = await this.generatePartSummary(transcripts[i], i + 1, fileArray[i].name, selectedParty);
					console.log(`🎲 DEBUG: Part Summary ${i + 1}/${fileCount} abgeschlossen`);
					new Notice(`✅ Zusammenfassung ${i + 1}/${fileCount} fertig!`, 2000);
					partSummaries.push(partSummary);
				}

				// Step 3: Combine all part summaries into final summary
				currentStep++;
				this.updateProgress(currentStep, totalSteps, 'Kombiniere Zusammenfassungen...');
				new Notice('🔄 Kombiniere alle Zusammenfassungen zur finalen Session-Übersicht...', 3000);
				const combinedSummaries = partSummaries.join('\n\n---\n\n');
				const summary = await this.generateFinalSummary(combinedSummaries, fileCount, selectedParty);
				
				// Step 4: Save as markdown
				currentStep++;
				this.updateProgress(currentStep, totalSteps, 'Speichere Datei...');
				new Notice('💾 Speichere Session-Zusammenfassung...', 2000);
				const sourceFiles = fileArray.map(f => f.name).join(', ');
				await this.saveAsMarkdown(summary, sourceFiles);
				
				// Complete
				this.updateProgress(totalSteps, totalSteps, 'Fertig!');
				new Notice(`✅ Session-Zusammenfassung erfolgreich erstellt!\n\n${fileCount} Dateien verarbeitet.`, 5000);
				
				// Remove progress bar after 2 seconds
				setTimeout(() => this.removeProgressBar(), 2000);
			} catch (error) {
				console.error('Transcription error:', error);
				this.removeProgressBar();
				new Notice(`❌ Fehler: ${error.message}`, 10000);
			}
		};

		input.click();
	}

async transcribeWithWhisper(file: File, party: Party | null = null): Promise<string> {
	console.log('🎲 DEBUG: transcribeWithWhisper() gestartet für:', file.name, 'Größe:', (file.size / (1024*1024)).toFixed(2), 'MB');
	const formData = new FormData();
	formData.append('file', file);
	formData.append('model', 'whisper-1');
	
	// Füge Kontext-Prompt für bessere Transkription hinzu
	if (party && party.characters.length > 0) {
		const characterNames = party.characters.map(c => c.name).join(', ');
		const whisperPrompt = `Dies ist eine D&D-Session. Charaktere: ${characterNames}. Achte auf Namen, Gegenstände, Orte und Kampfdetails.`;
		formData.append('prompt', whisperPrompt);
	}
		
		if (this.settings.autoSeparateLanguages) {
			formData.append('language', 'de');
		}

		console.log('🎲 DEBUG: Sende Request an Whisper API... (dies kann mehrere Minuten dauern)');
		const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.settings.apiKey}`
			},
			body: formData
		});

		console.log('🎲 DEBUG: Whisper API Response erhalten - Status:', response.status);
		if (!response.ok) {
			const error = await response.json();
			console.error('🎲 DEBUG: Whisper API Error:', error);
			throw new Error(`Whisper API Error: ${error.error?.message || response.statusText}`);
		}

		console.log('🎲 DEBUG: Parse Whisper Response JSON...');
		const data = await response.json();
		console.log('🎲 DEBUG: Whisper Response erfolgreich - Text Länge:', data.text.length);
		return data.text;
	}

	async generatePartSummary(transcript: string, partNumber: number, filename: string, party: Party | null): Promise<string> {
		console.log(`🎲 DEBUG: generatePartSummary() gestartet für Part ${partNumber}:`, filename, '- Transkript Länge:', transcript.length);
		
		let characterContext = '';
		if (party && party.characters.length > 0) {
			characterContext = `\n\nSPIELERCHARAKTERE (Party: ${party.name}):\n` + 
				party.characters.map(c => `- ${c.name}: ${c.race} ${c.class}`).join('\n') +
				'\n\nAchte darauf, die korrekten Namen der Spielercharaktere zu verwenden. Falls Namen im Transkript unklar sind, nutze die obige Liste.';
		
		// Füge Anweisung für Wiki-Links hinzu, wenn Notizen vorhanden sind
		const charsWithNotes = party.characters.filter(c => c.note);
		if (charsWithNotes.length > 0) {
			characterContext += '\n\nWICHTIG: Wenn du folgende Charaktere in der Zusammenfassung erwähnst, verwende Wiki-Links:\n' +
				charsWithNotes.map(c => `- "${c.name}" → [[${c.note}|${c.name}]]`).join('\n');
		}	}

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {				'Authorization': `Bearer ${this.settings.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{
						role: 'system',
						content: `Du bist ein Experte für D&D-Session-Dokumentation. Deine Aufgabe ist es, ALLE wichtigen Details zu erfassen:

- **Gegenstände/Items**: Liste JEDEN gefundenen, erhaltenen, gekauften oder benutzten Gegenstand auf
- **Ereignisse**: Dokumentiere alle Kampf-, Interaktions- und Story-Momente chronologisch
- **NPCs**: Erfasse Namen, Rollen und Beziehungen zu den Charakteren
- **Orte**: Notiere besuchte Locations und wichtige Örtlichkeiten
- **Entscheidungen**: Halte Charakterentscheidungen und deren Konsequenzen fest
- **Zahlen**: Würfelergebnisse, Schaden, Gold, XP - wenn erwähnt

Sei DETAILLIERT. Es ist besser zu viel als zu wenig zu dokumentieren. Spieler wollen später nachschlagen können, was sie gefunden haben.`
					},
					{
						role: 'user',
						content: `Analysiere folgenden Teil einer D&D-Session und erstelle eine DETAILLIERTE Zusammenfassung:${characterContext}\n\nTEIL ${partNumber} (${filename})\n\n${transcript}\n\n---\n\nErstelle eine strukturierte Zusammenfassung mit folgenden Abschnitten:\n\n### Ereignisse\n- Chronologische Liste aller wichtigen Momente\n- Kampf-Highlights mit Ergebnissen\n- Story-Entwicklungen\n\n### Items & Gegenstände\n- **Gefunden**: Alle entdeckten Items\n- **Erhalten**: Geschenkte/gekaufte Gegenstände\n- **Benutzt**: Eingesetzte Items mit Effekt\n- **Verloren**: Was ging verloren/wurde benutzt\n\n### NPCs & Charaktere\n- Neue NPCs mit Namen und Rolle\n- Wichtige Interaktionen\n- Beziehungen und Meinungen\n\n### Orte & Locations\n- Besuchte Orte\n- Wichtige Beschreibungen\n\n### Story-Hooks & Quests\n- Offene Plotpunkte\n- Neue Questziele\n- Mysterien\n\nSei SEHR detailliert bei Items - liste wirklich ALLES auf!`
					}
				],
			temperature: 0.5,
			max_tokens: 2500
		})
	});

	if (!response.ok) {
		const error = await response.json();
		}

		const data = await response.json();
		return `## Teil ${partNumber}: ${filename}\n\n${data.choices[0].message.content}`;
	}

	async generateFinalSummary(combinedSummaries: string, partCount: number, party: Party | null): Promise<string> {
		let characterContext = '';
		if (party && party.characters.length > 0) {
			characterContext = `\n\nSPIELERCHARAKTERE (Party: ${party.name}):\n` + 
				party.characters.map(c => `- ${c.name}: ${c.race} ${c.class}`).join('\n') +
				'\n\nAchte darauf, die korrekten Namen und Klassen der Spielercharaktere in der Zusammenfassung zu verwenden.';
		
		// Füge Anweisung für Wiki-Links hinzu, wenn Notizen vorhanden sind
		const charsWithNotes = party.characters.filter(c => c.note);
		if (charsWithNotes.length > 0) {
			characterContext += '\n\nWICHTIG: Wenn du folgende Charaktere in der finalen Zusammenfassung erwähnst, verwende Wiki-Links:\n' +
				charsWithNotes.map(c => `- "${c.name}" → [[${c.note}|${c.name}]]`).join('\n');
		}
	}

	const prompt = `Erstelle aus den folgenden ${partCount} Teil-Zusammenfassungen einer D&D-Session eine finale, strukturierte Gesamtzusammenfassung:${characterContext}\n\n${combinedSummaries}\n\n${this.settings.promptTemplate}`;

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.settings.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{
						role: 'system',
					content: 'Du bist ein Experte für D&D-Session-Dokumentation. Du fasst ALLE Details aus mehreren Teil-Zusammenfassungen zu einer finalen Zusammenfassung zusammen. Behalte ALLE Informationen bei - eliminiere keine Details, sondern strukturiere sie nur besser.'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			temperature: 0.5,
			max_tokens: 4000
		})
	});

		const data = await response.json();
		return data.choices[0].message.content;
	}

	async saveAsMarkdown(content: string, originalFilename: string): Promise<void> {
		// Ensure target folder exists
		const folderPath = this.settings.targetFolder;
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}

		// Generate filename with timestamp
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
		const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
		const filename = `DnD-Session-${dateStr}-${timeStr}.md`;
		const filepath = `${folderPath}/${filename}`;

		// Add YAML frontmatter if enabled
		let finalContent = content;
		if (this.settings.includeYamlFrontmatter) {
			const frontmatter = `---
date: ${now.toISOString()}
type: dnd-session
source: ${originalFilename}
tags: [dnd, session]
---

`;
			finalContent = frontmatter + content;
		}

		// Create the file
		await this.app.vault.create(filepath, finalContent);
		
		// Open the file
		const file = this.app.vault.getAbstractFileByPath(filepath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}
}

class PartyModal extends Modal {
	onSubmit: (name: string) => void;
	partyName = '';

	constructor(app: App, onSubmit: (name: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Neue Party erstellen' });

		new Setting(contentEl)
			.setName('Party Name')
			.addText(text => {
				text.inputEl.focus();
				text.onChange(value => {
					this.partyName = value;
					console.log('🎲 DEBUG PartyModal: Party Name geändert zu:', value, 'Länge:', value.length);
				});
				text.inputEl.addEventListener('keypress', (e) => {
					if (e.key === 'Enter' && this.partyName) {
						console.log('🎲 DEBUG PartyModal: Enter gedrückt, erstelle Party:', this.partyName);
						this.onSubmit(this.partyName);
						this.close();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Erstellen')
				.setCta()
				.onClick(() => {
					if (this.partyName) {
						console.log('🎲 DEBUG PartyModal: Button geklickt, erstelle Party:', this.partyName);
						this.onSubmit(this.partyName);
						this.close();
					} else {
						new Notice('Bitte gib einen Party-Namen ein');
					}
				}))
			.addButton(btn => btn
				.setButtonText('Abbrechen')
				.onClick(() => this.close()));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class FileSuggest extends AbstractInputSuggest<TFile> {
	app: App;
	inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.app = app;
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const lowerQuery = query.toLowerCase();
		
		if (!query) {
			return files.slice(0, 50); // Zeige erste 50 Dateien wenn keine Eingabe
		}
		
		return files
			.filter(file => 
				file.path.toLowerCase().includes(lowerQuery) ||
				file.basename.toLowerCase().includes(lowerQuery)
			)
			.slice(0, 50); // Maximal 50 Vorschläge
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		const div = el.createDiv({ cls: 'suggestion-item' });
		
		// Dateiname fett
		const titleDiv = div.createDiv({ cls: 'suggestion-title' });
		titleDiv.setText(file.basename);
		titleDiv.style.fontWeight = '600';
		
		// Pfad in grau darunter
		if (file.path !== file.basename + '.md') {
			const pathDiv = div.createDiv({ cls: 'suggestion-note' });
			pathDiv.setText(file.path.substring(0, file.path.length - 3)); // ohne .md
			pathDiv.style.fontSize = '0.85em';
			pathDiv.style.color = 'var(--text-muted)';
		}
	}

	selectSuggestion(file: TFile): void {
		// Setze den Pfad ohne .md Extension
		const path = file.path.substring(0, file.path.length - 3);
		this.inputEl.value = path;
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

class CharacterModal extends Modal {
	onSubmit: (name: string, race: string, className: string, note: string) => void;
	name = '';
	race = '';
	className = '';
	note = '';

	constructor(app: App, onSubmit: (name: string, race: string, className: string, note: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Neuen Charakter erstellen' });

		new Setting(contentEl)
			.setName('Charakter Name')
			.addText(text => {
				text.inputEl.focus();
				text.onChange(value => this.name = value);
			});

		new Setting(contentEl)
			.setName('Rasse')
			.setDesc('z.B. Mensch, Elf, Zwerg, Tiefling')
			.addText(text => {
				text.onChange(value => this.race = value);
			});

		new Setting(contentEl)
			.setName('Klasse')
			.setDesc('z.B. Kämpfer, Magier, Schurke, Kleriker')
			.addText(text => {
				text.onChange(value => this.className = value);
			});

		new Setting(contentEl)		.setName('Notiz (Optional)')
		.setDesc('Name der verlinkten Markdown-Notiz (ohne .md), z.B. "Characters/Aldric"')
		.addText(text => {
			text.setPlaceholder('Characters/CharakterName');
			text.onChange(value => this.note = value);
			
			// Aktiviere File Suggest
			new FileSuggest(this.app, text.inputEl);
		});

	new Setting(contentEl)			.addButton(btn => btn
				.setButtonText('Erstellen')
				.setCta()
				.onClick(() => {
					if (this.name && this.race && this.className) {
					this.onSubmit(this.name, this.race, this.className, this.note);
						this.close();
					} else {
						new Notice('Bitte fülle alle Felder aus');
					}
				}))
			.addButton(btn => btn
				.setButtonText('Abbrechen')
				.onClick(() => this.close()));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class RenamePartyModal extends Modal {
	onSubmit: (name: string) => void;
	partyName: string;

	constructor(app: App, currentName: string, onSubmit: (name: string) => void) {
		super(app);
		this.partyName = currentName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Party umbenennen' });

		new Setting(contentEl)
			.setName('Party Name')
			.addText(text => {
				text.setValue(this.partyName);
				text.inputEl.focus();
				text.inputEl.select();
				text.onChange(value => {
					this.partyName = value;
				});
				text.inputEl.addEventListener('keypress', (e) => {
					if (e.key === 'Enter' && this.partyName) {
						this.onSubmit(this.partyName);
						this.close();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Speichern')
				.setCta()
				.onClick(() => {
					if (this.partyName) {
						this.onSubmit(this.partyName);
						this.close();
					} else {
						new Notice('Bitte gib einen Party-Namen ein');
					}
				}))
			.addButton(btn => btn
				.setButtonText('Abbrechen')
				.onClick(() => this.close()));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class EditCharacterModal extends Modal {
	onSubmit: (name: string, race: string, className: string, note: string) => void;
	name: string;
	race: string;
	className: string;
	note: string;

	constructor(app: App, character: Character, onSubmit: (name: string, race: string, className: string, note: string) => void) {
		super(app);
		this.name = character.name;
		this.race = character.race;
		this.className = character.class;
		this.note = character.note || '';
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Charakter bearbeiten' });

		new Setting(contentEl)
			.setName('Charakter Name')
			.addText(text => {
				text.setValue(this.name);
				text.inputEl.focus();
				text.inputEl.select();
				text.onChange(value => this.name = value);
			});

		new Setting(contentEl)
			.setName('Rasse')
			.setDesc('z.B. Mensch, Elf, Zwerg, Tiefling')
			.addText(text => {
				text.setValue(this.race);
				text.onChange(value => this.race = value);
			});

		new Setting(contentEl)
			.setName('Klasse')
			.setDesc('z.B. Kämpfer, Magier, Schurke, Kleriker')
			.addText(text => {
				text.setValue(this.className);
				text.onChange(value => this.className = value);
			});

		new Setting(contentEl)		.setName('Notiz (Optional)')
		.setDesc('Name der verlinkten Markdown-Notiz (ohne .md), z.B. "Characters/Aldric"')
		.addText(text => {
			text.setValue(this.note);
			text.setPlaceholder('Characters/CharakterName');
			text.onChange(value => this.note = value);
			
			// Aktiviere File Suggest
			new FileSuggest(this.app, text.inputEl);
		});

	new Setting(contentEl)			.addButton(btn => btn
				.setButtonText('Speichern')
				.setCta()
				.onClick(() => {
					if (this.name && this.race && this.className) {
					this.onSubmit(this.name, this.race, this.className, this.note);
						this.close();
					} else {
						new Notice('Bitte fülle alle Felder aus');
					}
				}))
			.addButton(btn => btn
				.setButtonText('Abbrechen')
				.onClick(() => this.close()));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class DnDTranscriptionSettingTab extends PluginSettingTab {
	plugin: DnDTranscriptionPlugin;

	constructor(app: App, plugin: DnDTranscriptionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'D&D Session Transcription Settings' });

		// API Key
		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Dein OpenAI API Key für Whisper und GPT-4')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		// Target Folder
		new Setting(containerEl)
			.setName('Zielordner')
			.setDesc('Ordner im Vault, in dem die Session-Zusammenfassungen gespeichert werden')
			.addText(text => text
				.setPlaceholder('DnD Sessions')
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async (value) => {
					this.plugin.settings.targetFolder = value;
					await this.plugin.saveSettings();
				}));

		// YAML Frontmatter
		new Setting(containerEl)
			.setName('YAML Frontmatter')
			.setDesc('Füge YAML Frontmatter mit Metadaten hinzu')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeYamlFrontmatter)
				.onChange(async (value) => {
					this.plugin.settings.includeYamlFrontmatter = value;
					await this.plugin.saveSettings();
				}));

		// Auto Separate Languages
		new Setting(containerEl)
			.setName('Sprachtrennung (Optional)')
			.setDesc('Versuche Schweizerdeutsch und Hochdeutsch zu trennen (experimentell)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSeparateLanguages)
				.onChange(async (value) => {
					this.plugin.settings.autoSeparateLanguages = value;
					await this.plugin.saveSettings();
				}));

		// Party Management
		containerEl.createEl('h3', { text: 'Party Management' });
		containerEl.createEl('p', { 
			text: 'Verwalte deine D&D Parties und Charaktere. Beim Start der Transkription kannst du die relevante Party auswählen.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Neue Party erstellen')
			.setDesc('Erstelle eine neue Party mit Charakteren')
			.addButton(button => button
				.setButtonText('Party hinzufügen')
				.setCta()
				.onClick(() => this.addParty()));

		this.displayParties(containerEl);

		// Prompt Template
		containerEl.createEl('h3', { text: 'Prompt Template' });
		containerEl.createEl('p', { 
			text: 'Passe das Prompt-Template an, um die Struktur der Zusammenfassung zu ändern',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Prompt Template')
			.setDesc('Das Template für die GPT-Anfrage (das Transkript wird automatisch angehängt)')
			.addTextArea(text => {
				text
					.setPlaceholder('Prompt Template...')
					.setValue(this.plugin.settings.promptTemplate)
					.onChange(async (value) => {
						this.plugin.settings.promptTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 15;
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'monospace';
			});
	}

	addParty(): void {
		new PartyModal(this.app, (name) => {
			console.log('🎲 DEBUG addParty: Empfangener Party-Name:', name, 'Länge:', name.length);
			const newParty: Party = {
				id: Date.now().toString(),
				name: name,
				characters: []
			};
			console.log('🎲 DEBUG addParty: Erstellte Party:', JSON.stringify(newParty));

			this.plugin.settings.parties.push(newParty);
			this.plugin.saveSettings();
			this.display();
			new Notice(`✅ Party "${name}" erstellt`);
		}).open();
	}

	renameParty(party: Party): void {
		new RenamePartyModal(this.app, party.name, (newName) => {
			const oldName = party.name;
			party.name = newName;
			this.plugin.saveSettings();
			this.display();
			new Notice(`✅ Party "${oldName}" umbenannt zu "${newName}"`);
		}).open();
	}

	addCharacter(party: Party): void {
		new CharacterModal(this.app, (name, race, className, note) => {
			const newCharacter: Character = {
				id: Date.now().toString(),
				name,
				race,
				class: className,
				note: note || undefined
			};

			party.characters.push(newCharacter);
			this.plugin.saveSettings();
			this.display();
			new Notice(`✅ Charakter "${name}" zu "${party.name}" hinzugefügt`);
		}).open();
	}
	editCharacter(party: Party, character: Character): void {
		new EditCharacterModal(this.app, character, (name, race, className, note) => {
			character.name = name;
			character.race = race;
			character.class = className;
			character.note = note || undefined;
			this.plugin.saveSettings();
			this.display();
			new Notice(`✅ Charakter "${name}" aktualisiert`);
		}).open();
	}

	deleteParty(partyId: string): void {
		if (!confirm('Party wirklich löschen?')) return;

		this.plugin.settings.parties = this.plugin.settings.parties.filter(p => p.id !== partyId);
		this.plugin.saveSettings();
		this.display();
	}

	deleteCharacter(party: Party, characterId: string): void {
		if (!confirm('Charakter wirklich löschen?')) return;

		party.characters = party.characters.filter(c => c.id !== characterId);
		this.plugin.saveSettings();
		this.display();
	}

	displayParties(containerEl: HTMLElement): void {
		if (this.plugin.settings.parties.length === 0) {
			containerEl.createEl('p', { 
				text: 'Noch keine Parties erstellt. Klicke auf "Party hinzufügen" um zu starten.',
				cls: 'setting-item-description'
			});
			return;
		}

		this.plugin.settings.parties.forEach(party => {
			const partyContainer = containerEl.createDiv();
			partyContainer.style.cssText = 'border: 2px solid var(--background-modifier-border); padding: 15px; margin: 15px 0; border-radius: 8px; background: var(--background-primary);';

			// Party Header
			const partyHeader = partyContainer.createDiv();
			partyHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);';

			const partyInfo = partyHeader.createDiv();
			const partyTitle = partyInfo.createEl('div');
			partyTitle.innerText = `🎲 ${party.name}`;
			partyTitle.style.cssText = 'font-size: 1.2em; font-weight: 600; margin-bottom: 4px;';
			
			const partyCount = partyInfo.createEl('div');
			partyCount.innerText = `${party.characters.length} Charakter${party.characters.length !== 1 ? 'e' : ''}`;
			partyCount.style.cssText = 'font-size: 0.9em; color: var(--text-muted);';

			const partyButtons = partyHeader.createDiv();
			partyButtons.style.cssText = 'display: flex; gap: 8px;';

			const renameBtn = partyButtons.createEl('button', { text: '✏️ Umbenennen' });
			renameBtn.style.cssText = 'padding: 4px 12px;';
			renameBtn.addEventListener('click', () => this.renameParty(party));

			const addCharBtn = partyButtons.createEl('button', { text: '+ Charakter' });
			addCharBtn.className = 'mod-cta';
			addCharBtn.style.cssText = 'padding: 4px 12px;';
			addCharBtn.addEventListener('click', () => this.addCharacter(party));

			const deletePartyBtn = partyButtons.createEl('button', { text: '🗑️ Party löschen' });
			deletePartyBtn.className = 'mod-warning';
			deletePartyBtn.style.cssText = 'padding: 4px 12px;';
			deletePartyBtn.addEventListener('click', () => this.deleteParty(party.id));

			// Characters List
			if (party.characters.length === 0) {
				const emptyMsg = partyContainer.createEl('p', { 
					text: '📝 Noch keine Charaktere - klicke "+ Charakter" um den ersten hinzuzufügen',
					cls: 'setting-item-description'
				});
				emptyMsg.style.cssText = 'text-align: center; padding: 20px; color: var(--text-muted); font-style: italic;';
			} else {
				const charList = partyContainer.createDiv();
				charList.style.cssText = 'display: grid; gap: 8px;';

				party.characters.forEach(char => {
					const charCard = charList.createDiv();
					charCard.style.cssText = 'display: grid; grid-template-columns: auto 1fr auto auto; gap: 12px; align-items: center; padding: 12px; background: var(--background-secondary); border-radius: 6px; border: 1px solid var(--background-modifier-border);';

					// Character Icon
					const iconDiv = charCard.createDiv({ text: '⚔️' });
					iconDiv.style.cssText = 'font-size: 1.5em;';

					// Character Info
					const infoDiv = charCard.createDiv();
					const nameDiv = infoDiv.createEl('div', { text: char.name });
					nameDiv.style.cssText = 'font-weight: 600; font-size: 1em; margin-bottom: 2px;';
					
					const detailsDiv = infoDiv.createEl('div', { text: `${char.race} • ${char.class}` });
					detailsDiv.style.cssText = 'font-size: 0.9em; color: var(--text-muted);';

					// Edit Button
					const editBtn = charCard.createEl('button', { text: '✏️' });
					editBtn.style.cssText = 'padding: 4px 10px; font-size: 0.9em; opacity: 0.7; transition: opacity 0.2s;';
					editBtn.addEventListener('mouseenter', () => editBtn.style.opacity = '1');
					editBtn.addEventListener('mouseleave', () => editBtn.style.opacity = '0.7');
					editBtn.addEventListener('click', () => this.editCharacter(party, char));

					// Delete Button
					const deleteBtn = charCard.createEl('button', { text: '🗑️' });
					deleteBtn.className = 'mod-warning';
					deleteBtn.style.cssText = 'padding: 4px 10px; font-size: 0.9em; opacity: 0.7; transition: opacity 0.2s;';
					deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.opacity = '1');
					deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.opacity = '0.7');
					deleteBtn.addEventListener('click', () => this.deleteCharacter(party, char.id));
				});
			}
		});
	}
}
