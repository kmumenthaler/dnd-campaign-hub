import { App, AbstractInputSuggest, Modal, TFile } from "obsidian";

/**
 * File suggest component for PDF files in the vault.
 */
export class PDFFileSuggest extends AbstractInputSuggest<TFile> {
  private inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
  }

  getSuggestions(query: string): TFile[] {
    const allFiles = this.app.vault.getFiles();
    const pdfFiles = allFiles.filter(f => f.extension === 'pdf');
    const lowerQuery = query.toLowerCase();
    
    if (!query) {
      return pdfFiles.slice(0, 50);
    }
    
    return pdfFiles
      .filter(file => 
        file.path.toLowerCase().includes(lowerQuery) ||
        file.basename.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 50);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    const div = el.createDiv({ cls: 'suggestion-item' });
    
    const titleDiv = div.createDiv({ cls: 'suggestion-title' });
    titleDiv.setText(file.basename);
    titleDiv.style.fontWeight = '600';
    
    if (file.path !== file.basename + '.pdf') {
      const pathDiv = div.createDiv({ cls: 'suggestion-note' });
      pathDiv.setText(file.path);
      pathDiv.style.fontSize = '0.85em';
      pathDiv.style.color = 'var(--text-muted)';
    }
  }

  selectSuggestion(file: TFile): void {
    this.inputEl.value = file.path;
    this.inputEl.dispatchEvent(new Event('input'));
    this.close();
  }
}

/**
 * Modal for browsing and selecting PDF files from the vault.
 */
export class PDFBrowserModal extends Modal {
  private files: TFile[];
  private onSelect: (file: TFile) => void;

  constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Select PDF File' });

    const searchContainer = contentEl.createDiv();
    searchContainer.style.marginBottom = '10px';
    const searchInput = searchContainer.createEl('input', { 
      type: 'text', 
      placeholder: 'Filter PDFs...' 
    });
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px';
    searchInput.style.borderRadius = '4px';
    searchInput.style.border = '1px solid var(--background-modifier-border)';

    const listContainer = contentEl.createDiv({ cls: 'pdf-browser-list' });
    listContainer.style.maxHeight = '400px';
    listContainer.style.overflowY = 'auto';
    listContainer.style.padding = '10px';

    const renderFiles = (filter: string) => {
      listContainer.empty();
      const filtered = filter
        ? this.files.filter(f => f.path.toLowerCase().includes(filter.toLowerCase()))
        : this.files;

      if (filtered.length === 0) {
        listContainer.createEl('p', { 
          text: 'No PDF files found.',
          cls: 'setting-item-description'
        });
        return;
      }

      for (const file of filtered) {
        const item = listContainer.createDiv();
        item.style.padding = '8px';
        item.style.border = '1px solid var(--background-modifier-border)';
        item.style.borderRadius = '4px';
        item.style.marginBottom = '6px';
        item.style.cursor = 'pointer';
        item.style.transition = 'all 0.15s ease';

        const nameEl = item.createEl('div', { text: file.basename });
        nameEl.style.fontWeight = '600';
        nameEl.style.marginBottom = '2px';

        const pathEl = item.createEl('div', { text: file.path });
        pathEl.style.fontSize = '0.85em';
        pathEl.style.color = 'var(--text-muted)';

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--background-modifier-hover)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = '';
        });

        item.addEventListener('click', () => {
          this.onSelect(file);
          this.close();
        });
      }
    };

    searchInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      renderFiles(target.value);
    });

    renderFiles('');
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
