import { App, Modal } from "obsidian";

/**
 * Grid Calibration Modal — allows users to set grid cell size,
 * fine-tune width/height independently, and use two-point measurement.
 */
export class GridCalibrationModal extends Modal {
  private config: any;
  private onApply: (gridSize: number, gridSizeW: number, gridSizeH: number) => void;
  private measuredDistance: number | null;

  constructor(
    app: App,
    config: any,
    onApply: (gridSize: number, gridSizeW: number, gridSizeH: number) => void,
    measuredDistance?: number,
  ) {
    super(app);
    this.config = config;
    this.onApply = onApply;
    this.measuredDistance = measuredDistance ?? null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-grid-calibration-modal');

    contentEl.createEl('h2', { text: '⚙️ Grid Calibration' });

    if (this.measuredDistance !== null) {
      const measuredDiv = contentEl.createDiv({ cls: 'dnd-grid-cal-measured' });
      measuredDiv.createEl('p', {
        text: `📏 Measured distance: ${Math.round(this.measuredDistance * 10) / 10} px`,
      });
      const applyMeasuredBtn = measuredDiv.createEl('button', {
        text: 'Apply as Grid Size',
        cls: 'mod-cta',
      });
      applyMeasuredBtn.style.marginBottom = '16px';
      applyMeasuredBtn.addEventListener('click', () => {
        const val = Math.round(this.measuredDistance! * 10) / 10;
        sizeInput.value = String(val);
        wInput.value = String(val);
        hInput.value = String(val);
      });
    }

    const uniformSection = contentEl.createDiv({ cls: 'dnd-grid-cal-section' });
    uniformSection.createEl('h4', { text: 'Grid Cell Size (uniform)' });
    uniformSection.createEl('p', {
      text: 'Sets both width and height to the same value.',
      cls: 'setting-item-description',
    });

    const currentSize = this.config.gridSize || 70;
    const currentW = this.config.gridSizeW || currentSize;
    const currentH = this.config.gridSizeH || currentSize;

    const sizeRow = uniformSection.createDiv({ cls: 'dnd-grid-cal-row' });
    sizeRow.createEl('label', { text: 'Size (px):' });
    const sizeInput = sizeRow.createEl('input', {
      type: 'number',
      attr: { min: '5', max: '500', step: '0.1', value: String(currentSize) },
      cls: 'dnd-grid-cal-input',
    });
    sizeInput.addEventListener('input', () => {
      if (linked) {
        wInput.value = sizeInput.value;
        hInput.value = sizeInput.value;
      }
    });

    const indepSection = contentEl.createDiv({ cls: 'dnd-grid-cal-section' });
    indepSection.createEl('h4', { text: 'Fine-Tune Width & Height' });
    indepSection.createEl('p', {
      text: 'Adjust width and height independently to match imperfect grids.',
      cls: 'setting-item-description',
    });

    let linked = (currentW === currentH);
    const linkRow = indepSection.createDiv({ cls: 'dnd-grid-cal-link-row' });
    const linkBtn = linkRow.createEl('button', {
      text: linked ? '🔗 Linked' : '🔓 Independent',
      cls: 'dnd-grid-cal-link-btn',
    });
    linkBtn.addEventListener('click', () => {
      linked = !linked;
      linkBtn.textContent = linked ? '🔗 Linked' : '🔓 Independent';
      if (linked) {
        hInput.value = wInput.value;
        sizeInput.value = wInput.value;
      }
    });

    const whRow = indepSection.createDiv({ cls: 'dnd-grid-cal-wh-row' });

    const wCol = whRow.createDiv({ cls: 'dnd-grid-cal-col' });
    wCol.createEl('label', { text: 'Width (px):' });
    const wInput = wCol.createEl('input', {
      type: 'number',
      attr: { min: '5', max: '500', step: '0.1', value: String(currentW) },
      cls: 'dnd-grid-cal-input',
    });
    wInput.addEventListener('input', () => {
      if (linked) {
        hInput.value = wInput.value;
        sizeInput.value = wInput.value;
      }
    });

    const hCol = whRow.createDiv({ cls: 'dnd-grid-cal-col' });
    hCol.createEl('label', { text: 'Height (px):' });
    const hInput = hCol.createEl('input', {
      type: 'number',
      attr: { min: '5', max: '500', step: '0.1', value: String(currentH) },
      cls: 'dnd-grid-cal-input',
    });
    hInput.addEventListener('input', () => {
      if (linked) {
        wInput.value = hInput.value;
        sizeInput.value = hInput.value;
      }
    });

    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '20px';

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const applyBtn = btnRow.createEl('button', { text: '✅ Apply', cls: 'mod-cta' });
    applyBtn.addEventListener('click', () => {
      const gs = parseFloat(sizeInput.value) || 70;
      const gw = parseFloat(wInput.value) || gs;
      const gh = parseFloat(hInput.value) || gs;
      this.onApply(gs, gw, gh);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
