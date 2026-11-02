// Shop Settings & Catalog Backup/Restore Engine
// Features: Theme switcher, Secret cipher keyword preferences, and full JSON catalog backup/restore

export class SettingsManager {
  constructor(appContext) {
    this.app = appContext;
  }

  openSettingsModal() {
    this.app.sound.playClick();
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    document.getElementById('setting-store-name').value = this.app.settings.storeName || "City Auto Parts & Spares";
    document.getElementById('setting-currency').value = this.app.settings.currencySymbol || "₹";
    document.getElementById('setting-sound').checked = this.app.settings.soundEnabled !== false;

    const themeSelect = document.getElementById('setting-theme-select');
    if (themeSelect) {
      themeSelect.value = this.app.settings.theme || 'midnight';
    }

    const cipherInput = document.getElementById('setting-cipher-keyword');
    if (cipherInput) {
      cipherInput.value = this.app.settings.cipherKeyword || 'SANYODELHI';
    }

    const stickerFormatSelect = document.getElementById('setting-sticker-format');
    if (stickerFormatSelect) {
      stickerFormatSelect.value = this.app.settings.stickerFormat || 'dynamic_code';
    }

    if (this.app && typeof this.app.updateCashierAuthUi === 'function') {
      this.app.updateCashierAuthUi();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  saveSettingsFromForm(e) {
    if (e) e.preventDefault();
    const storeName = document.getElementById('setting-store-name').value.trim() || "City Auto Parts";
    const currencySymbol = document.getElementById('setting-currency').value;
    const soundEnabled = document.getElementById('setting-sound').checked;
    const theme = document.getElementById('setting-theme-select').value || 'midnight';
    const cipherKeyword = (document.getElementById('setting-cipher-keyword').value || 'SANYODELHI').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
    const stickerFormat = document.getElementById('setting-sticker-format').value || 'dynamic_code';

    this.app.settings = {
      ...this.app.settings,
      storeName,
      currencySymbol,
      soundEnabled,
      theme,
      cipherKeyword: cipherKeyword.length === 10 ? cipherKeyword : "SANYODELHI",
      stickerFormat
    };

    this.app.sound.enabled = soundEnabled;
    this.app.barcodeEngine.updateSettings(this.app.settings);
    this.app.storage.saveSettings(this.app.settings);
    this.applyTheme(theme);

    const storeTitleEl = document.getElementById('store-brand-title');
    if (storeTitleEl) storeTitleEl.textContent = storeName;

    this.closeSettingsModal();
    this.app.showToast("Settings and Cipher updated successfully!", "success");
    this.app.renderProducts();
    this.app.updateHeaderStats();
  }

  applyTheme(theme = 'midnight') {
    const body = document.body;
    const doc = document.documentElement;
    body.classList.remove('theme-midnight', 'theme-slate', 'theme-amber-dark', 'theme-emerald-dark', 'theme-high-contrast', 'theme-light', 'theme-titanium', 'theme-sapphire');
    body.classList.add(`theme-${theme}`);

    if (theme === 'light') {
      doc.setAttribute('data-theme', 'light');
      doc.classList.remove('dark');
      const themeIcon = document.getElementById('theme-toggle-icon');
      if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
    } else {
      doc.setAttribute('data-theme', 'dark');
      doc.classList.add('dark');
      const themeIcon = document.getElementById('theme-toggle-icon');
      if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
    }
    if (window.lucide) lucide.createIcons();
  }

  toggleThemeMode() {
    this.app.sound.playClick();
    const current = this.app.settings.theme || 'midnight';
    const newTheme = current === 'light' ? 'midnight' : 'light';
    this.app.settings.theme = newTheme;
    this.app.storage.saveSettings(this.app.settings);
    this.applyTheme(newTheme);
    this.app.showToast(`Switched to ${newTheme === 'light' ? 'Light Modern' : 'Midnight Dark'} Mode`, 'info');
  }

  updateCipherLivePreview(rawKeyword) {
    const previewEl = document.getElementById('cipher-live-demo-preview');
    if (!previewEl) return;
    const key = (rawKeyword || 'SANYODELHI').toUpperCase().replace(/[^A-Z]/g, '').padEnd(10, 'X').slice(0, 10);
    const letters = key.split('');
    // 1 to 9, then 0
    const mapStr = letters.map((letter, i) => `${letter}=${i === 9 ? 0 : i + 1}`).join(', ');
    previewEl.textContent = `${mapStr} (e.g. ₹1,200 = ${letters[0]}-${letters[1]}-${letters[9]}-${letters[9]}-R • with 1 random decoy letter at end)`;
  }

  exportDataBackup() {
    const backupObj = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      storeName: this.app.settings.storeName,
      products: this.app.products,
      vehicleBrands: this.app.vehicleBrands,
      categories: this.app.categories,
      outflowLog: this.app.outflowLog,
      defectiveReturns: this.app.defectiveReturns,
      settings: this.app.settings
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `autoparts_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    this.app.showToast("Catalog backup JSON exported successfully!", "success");
  }

  importDataBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.products && Array.isArray(data.products)) {
          this.app.products = data.products;
          // Intentional Full-Catalog Restore: User is manually importing a complete database backup JSON file.
          // In this specific administrative operation, all restored items are intentionally saved.
          this.app.storage.saveProducts(this.app.products, null);
        }
        if (data.vehicleBrands && Array.isArray(data.vehicleBrands)) {
          this.app.vehicleBrands = data.vehicleBrands;
          this.app.storage.saveVehicleBrands(this.app.vehicleBrands);
        }
        if (data.categories && Array.isArray(data.categories)) {
          this.app.categories = data.categories;
          this.app.storage.saveCategories(this.app.categories);
        }
        if (data.outflowLog && Array.isArray(data.outflowLog)) {
          this.app.outflowLog = data.outflowLog;
          this.app.storage.saveOutflows(this.app.outflowLog);
        }
        if (data.defectiveReturns && Array.isArray(data.defectiveReturns)) {
          this.app.defectiveReturns = data.defectiveReturns;
          this.app.storage.saveDefectiveReturns(this.app.defectiveReturns);
        }
        if (data.settings) {
          this.app.settings = data.settings;
          this.app.storage.saveSettings(this.app.settings);
        }

        this.app.renderBrandChips();
        this.app.renderCategoryChips();
        this.app.renderProducts();
        this.app.updateHeaderStats();
        this.closeSettingsModal();
        this.app.showToast("Catalog & Data Restored Successfully!", "success");
      } catch (err) {
        this.app.showToast("Failed to parse JSON backup file. Ensure it is a valid backup.", "error");
      }
    };
    reader.readAsText(file);
  }

  openStartFreshModal() {
    this.app.sound.playClick();
    const modal = document.getElementById('modal-start-fresh-security');
    if (!modal) return;

    const inputPhrase = document.getElementById('input-security-wipe-phrase');
    const confirmBtn = document.getElementById('btn-confirm-factory-wipe');
    if (inputPhrase) inputPhrase.value = '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.className = "btn-touch flex-1 py-3 bg-rose-700/50 text-white/60 font-black rounded-xl text-sm transition-all opacity-50 cursor-not-allowed";
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeStartFreshModal() {
    const modal = document.getElementById('modal-start-fresh-security');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  handleSecurityPhraseInput(val) {
    const confirmBtn = document.getElementById('btn-confirm-factory-wipe');
    if (!confirmBtn) return;
    const clean = (val || '').trim().toUpperCase();
    if (clean === 'CLEAR DEMO DATA' || clean === 'START FRESH') {
      confirmBtn.disabled = false;
      confirmBtn.className = "btn-touch flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-rose-600/30 cursor-pointer animate-pulse";
    } else {
      confirmBtn.disabled = true;
      confirmBtn.className = "btn-touch flex-1 py-3 bg-rose-700/50 text-white/60 font-black rounded-xl text-sm transition-all opacity-50 cursor-not-allowed";
    }
  }

  executeFactoryStartFresh() {
    // 1. Auto-download safety backup first!
    this.exportDataBackup();

    // 2. Read taxonomy preference checkbox
    const keepTaxonomyCheck = document.getElementById('check-keep-taxonomy-on-reset');
    const keepTaxonomy = keepTaxonomyCheck ? keepTaxonomyCheck.checked !== false : true;

    // 3. Clear data
    const freshState = this.app.storage.startFreshProductionData({ keepTaxonomy });
    this.app.products = freshState.products;
    this.app.outflowLog = freshState.outflowLog;
    this.app.defectiveReturns = freshState.defectiveReturns;
    this.app.vehicleBrands = freshState.vehicleBrands;
    this.app.categories = freshState.categories;

    // 4. Update UI
    this.closeStartFreshModal();
    this.closeSettingsModal();
    this.app.renderBrandChips();
    this.app.renderCategoryChips();
    this.app.renderSubCategoryChips();
    this.app.renderProducts();
    this.app.updateHeaderStats();

    this.app.sound.playSaleChime();
    this.app.showToast("✅ Store initialized fresh! Ready to enter your shop's inventory.", "success");
  }

  executeReloadDemoData() {
    this.app.sound.playClick();
    const freshState = this.app.storage.resetToDemoData();
    this.app.products = freshState.products;
    this.app.outflowLog = freshState.outflowLog;
    this.app.defectiveReturns = freshState.defectiveReturns;
    this.app.vehicleBrands = freshState.vehicleBrands;
    this.app.categories = freshState.categories;
    this.app.settings = freshState.settings;

    this.closeSettingsModal();
    this.app.renderBrandChips();
    this.app.renderCategoryChips();
    this.app.renderSubCategoryChips();
    this.app.renderProducts();
    this.app.updateHeaderStats();

    this.app.showToast("Demo catalog & sample records restored!", "info");
  }
}
