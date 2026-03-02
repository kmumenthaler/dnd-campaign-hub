import { App, Modal, Notice, Setting } from "obsidian";
import type DndCampaignHubPlugin from '../main';
import type { TabletopCalibration } from "../types";

export class TabletopCalibrationModal extends Modal {
  plugin: DndCampaignHubPlugin;
  private onDone: (calibration: TabletopCalibration) => void;
  private win: Window;

  constructor(app: App, plugin: DndCampaignHubPlugin, popoutWin: Window, onDone: (cal: TabletopCalibration) => void) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.win = popoutWin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dnd-tabletop-calibration-modal');

    contentEl.createEl('h2', { text: '🎯 Tabletop Calibration' });
    contentEl.createEl('p', {
      text: 'Configure your monitor so the grid matches physical miniature bases.',
      cls: 'setting-item-description'
    });

    // Get screen info for the popout window
    const screen = this.win.screen;
    const screenW = screen.width * (this.win.devicePixelRatio || 1);
    const screenH = screen.height * (this.win.devicePixelRatio || 1);

    const existing = this.plugin.settings.tabletopCalibration;

    // --- Step 1: Monitor Size ---
    contentEl.createEl('h3', { text: '📐 Monitor Size' });
    const monitorInfo = contentEl.createDiv({ cls: 'dnd-calibration-info' });
    monitorInfo.setText(`Screen resolution: ${screenW} × ${screenH} px`);

    const diagonalSetting = contentEl.createDiv({ cls: 'dnd-map-calibration-input' });
    diagonalSetting.createEl('label', { text: 'Monitor diagonal (inches):' });
    const diagonalInput = diagonalSetting.createEl('input', {
      type: 'number',
      attr: { min: '10', max: '100', step: '0.1', placeholder: '27' }
    }) as HTMLInputElement;
    diagonalInput.value = existing?.monitorDiagonalInch?.toString() || '';

    // Computed PPI display
    const ppiDisplay = contentEl.createDiv({ cls: 'dnd-calibration-info' });
    ppiDisplay.style.marginTop = '8px';

    const computePPMM = () => {
      const diag = parseFloat(diagonalInput.value);
      if (!diag || diag <= 0) {
        ppiDisplay.setText('Enter monitor diagonal to compute pixel density.');
        return 0;
      }
      const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
      const ppi = diagPx / diag;
      const ppmm = ppi / 25.4;
      ppiDisplay.setText(`Computed: ${ppi.toFixed(1)} PPI → ${ppmm.toFixed(2)} px/mm`);
      return ppmm;
    };
    diagonalInput.addEventListener('input', computePPMM);
    computePPMM();

    // --- Step 2: Mini Base Size ---
    contentEl.createEl('h3', { text: '🧍 Miniature Base Size' });
    contentEl.createEl('p', {
      text: 'The physical size each grid cell should be. Standard D&D bases: 25mm (1"), large: 50mm (2").',
      cls: 'setting-item-description'
    });

    const baseSetting = contentEl.createDiv({ cls: 'dnd-map-calibration-input' });
    baseSetting.createEl('label', { text: 'Grid cell size (mm):' });
    const baseInput = baseSetting.createEl('input', {
      type: 'number',
      attr: { min: '10', max: '100', step: '1', placeholder: '25' }
    }) as HTMLInputElement;
    baseInput.value = (existing?.miniBaseMm || 25).toString();

    // --- Step 3: Fine-tune with on-screen ruler ---
    contentEl.createEl('h3', { text: '📏 Fine-Tune (Optional)' });
    contentEl.createEl('p', {
      text: 'Adjust the slider until the bar below matches a known physical measurement (e.g., a credit card is 85.6mm wide).',
      cls: 'setting-item-description'
    });

    const rulerContainer = contentEl.createDiv({ cls: 'dnd-calibration-ruler-container' });

    // The ruler bar
    const rulerBar = rulerContainer.createDiv({ cls: 'dnd-calibration-ruler-bar' });
    const rulerLabel = rulerContainer.createDiv({ cls: 'dnd-calibration-ruler-label' });
    rulerLabel.setText('85.6 mm');
    const targetMm = 85.6; // credit card width

    // Fine-tune slider (adjustment factor: 0.8 to 1.2)
    const sliderRow = contentEl.createDiv({ cls: 'dnd-map-calibration-input' });
    sliderRow.createEl('label', { text: 'Fine-tune adjustment:' });
    const slider = sliderRow.createEl('input', {
      type: 'range',
      attr: { min: '0.80', max: '1.20', step: '0.005', value: '1.00' }
    }) as HTMLInputElement;
    const sliderValue = sliderRow.createEl('span');
    sliderValue.setText('1.00×');

    const updateRuler = () => {
      const ppmm = computePPMM();
      const adj = parseFloat(slider.value);
      sliderValue.setText(`${adj.toFixed(3)}×`);
      if (ppmm > 0) {
        const rulerPx = targetMm * ppmm * adj;
        rulerBar.style.width = rulerPx + 'px';
      }
    };
    slider.addEventListener('input', updateRuler);
    diagonalInput.addEventListener('input', updateRuler);
    updateRuler();

    // --- Buttons ---
    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = btnRow.createEl('button', { text: 'Save & Apply', cls: 'mod-cta' });
    saveBtn.addEventListener('click', async () => {
      const diag = parseFloat(diagonalInput.value);
      if (!diag || diag <= 0) {
        new Notice('Please enter your monitor diagonal size.');
        return;
      }
      const baseMm = parseFloat(baseInput.value) || 25;
      const adj = parseFloat(slider.value) || 1.0;
      const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
      const ppi = diagPx / diag;
      const ppmm = (ppi / 25.4) * adj;

      const calibration: TabletopCalibration = {
        monitorDiagonalInch: diag,
        pixelsPerMm: ppmm,
        miniBaseMm: baseMm
      };
      this.plugin.settings.tabletopCalibration = calibration;
      await this.plugin.saveSettings();
      this.onDone(calibration);
      this.close();
      new Notice(`Tabletop calibrated: ${ppmm.toFixed(2)} px/mm, grid = ${baseMm}mm`);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
