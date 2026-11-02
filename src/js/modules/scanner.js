// Hardware USB Gun & Industrial Camera Barcode Scanner Engine
// Features: Hardware Laser gun buffering, Html5Qrcode camera video reader, Instant 1-tap simulator barcodes, and Live POS feedback card

export class ScannerEngine {
  constructor(onBarcodeScannedCallback, appContext) {
    this.onBarcodeScanned = onBarcodeScannedCallback;
    this.app = appContext;
    this.gunBuffer = '';
    this.lastGunKeystrokeTime = 0;
    this.isCameraActive = false;
    this.html5QrCode = null;
    this.availableVideoDevices = [];
    this.selectedCameraDeviceId = null;
    this.lastScanTime = 0;

    this.setupHardwareGunListener();
  }

  // 1. HARDWARE LASER SCANNER GUN LISTENER
  // Hardware USB/Bluetooth scanners type characters rapidly (< 40ms per keystroke) ending with Enter.
  setupHardwareGunListener() {
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      const now = Date.now();
      const timeDiff = now - this.lastGunKeystrokeTime;
      this.lastGunKeystrokeTime = now;

      // Reset buffer if delay between keystrokes exceeds 70ms (human typing)
      if (timeDiff > 70 && this.gunBuffer.length > 0 && e.key !== 'Enter') {
        this.gunBuffer = '';
      }

      if (e.key === 'Enter') {
        if (this.gunBuffer.length >= 3) {
          e.preventDefault();
          const scannedCode = this.gunBuffer.trim();
          this.gunBuffer = '';
          this.onBarcodeScanned(scannedCode, 'Hardware Laser Gun');
        } else {
          this.gunBuffer = '';
        }
        return;
      }

      // Collect printable alphanumeric & symbol keys
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isInput || timeDiff < 45) {
          this.gunBuffer += e.key;
        }
      }
    });
  }

  // 2. CAMERA BARCODE SCANNER ENGINE
  openScannerModal() {
    this.app.sound.playClick();
    const modal = document.getElementById('barcode-scanner-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    this.renderQuickTestBarcodes();
    this.initCameraStream();
    if (window.lucide) lucide.createIcons();
  }

  closeScannerModal() {
    this.stopCameraStream();
    const modal = document.getElementById('barcode-scanner-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  renderQuickTestBarcodes() {
    const container = document.getElementById('quick-test-barcodes-container');
    if (!container) return;

    const sampleProducts = (this.app.products || []).slice(0, 10);
    container.innerHTML = sampleProducts.map(p => `
      <button 
        type="button" 
        class="btn-simulate-barcode px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-950/80 text-slate-200 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/50 text-[11px] font-bold flex items-center gap-1 transition-all"
        data-barcode="${p.barcode || p.partNumber}"
        data-sku="${p.partNumber}"
      >
        <span class="text-amber-400 font-mono">${p.partNumber}</span>
        <span class="text-slate-400 font-normal truncate max-w-[110px]">(${p.name.split(' ')[0]})</span>
      </button>
    `).join('');

    container.querySelectorAll('.btn-simulate-barcode').forEach(btn => {
      btn.addEventListener('click', () => {
        const barcode = btn.dataset.barcode || btn.dataset.sku;
        if (barcode) {
          this.onBarcodeScanned(barcode, '1-Tap Simulator');
        }
      });
    });
  }

  showLastScannedFeedback(part, qty = 1, context = 'cart') {
    const card = document.getElementById('last-scanned-container');
    const nameEl = document.getElementById('last-scanned-name');
    const priceEl = document.getElementById('last-scanned-price');
    const detailsEl = document.getElementById('last-scanned-details');
    const timeEl = document.getElementById('last-scanned-time');

    if (!card || !part) return;

    if (nameEl) nameEl.textContent = part.name;
    const priceNum = Number(part.sellingPrice) || 0;
    if (priceEl) priceEl.textContent = this.app.formatCurrency ? this.app.formatCurrency(priceNum) : `₹ ${priceNum.toLocaleString('en-IN')}`;
    if (detailsEl) {
      if (context === 'cart') {
        detailsEl.textContent = `Added to Cart (${qty}x in cart) • Rack: ${part.rackLocation || 'Shelf'} • Available: ${this.app.inventoryManager.getTotalStock(part)} in stock.`;
      } else {
        detailsEl.textContent = `Auto-Deducted ${qty}x unit from ${part.rackLocation || 'Shelf'}. Remaining: ${this.app.inventoryManager.getTotalStock(part)} in stock.`;
      }
    }
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    card.classList.remove('hidden');
    card.classList.add('animate-pulse');
    setTimeout(() => card.classList.remove('animate-pulse'), 800);
  }

  async initCameraStream() {
    const cameraSelect = document.getElementById('scanner-camera-select');
    const readerElement = document.getElementById('html5-qr-reader');
    if (!readerElement) return;

    try {
      if (window.Html5Qrcode) {
        if (!this.html5QrCode) {
          this.html5QrCode = new window.Html5Qrcode("html5-qr-reader");
        }

        const devices = await window.Html5Qrcode.getCameras();
        this.availableVideoDevices = devices || [];

        if (cameraSelect && devices.length > 0) {
          cameraSelect.innerHTML = devices.map((d, i) => `
            <option value="${d.id}" ${i === 0 ? 'selected' : ''}>
              ${d.label || `Camera ${i + 1}`}
            </option>
          `).join('');
          this.selectedCameraDeviceId = devices[0].id;
        }

        const cameraId = this.selectedCameraDeviceId || (devices[0] ? devices[0].id : { facingMode: "environment" });

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 180 },
          aspectRatio: 1.333334
        };

        await this.html5QrCode.start(
          cameraId,
          config,
          (decodedText) => {
            const now = Date.now();
            if (now - this.lastScanTime > 1500) { // Debounce camera scans
              this.lastScanTime = now;
              this.onBarcodeScanned(decodedText, 'Camera Video Stream');
            }
          },
          (errorMessage) => {
            // Ignored frame parse errors
          }
        );

        this.isCameraActive = true;
      }
    } catch (err) {
      console.warn("Camera scanner notice:", err);
      if (cameraSelect) {
        cameraSelect.innerHTML = `<option value="">Camera unavailable / Laser scanner active</option>`;
      }
    }
  }

  stopCameraStream() {
    if (this.html5QrCode && this.isCameraActive) {
      try {
        this.html5QrCode.stop().then(() => {
          this.html5QrCode.clear();
        }).catch(e => console.warn(e));
      } catch (e) {}
    }
    this.isCameraActive = false;
  }

  restartCameraWithSelectedDevice() {
    const cameraSelect = document.getElementById('scanner-camera-select');
    if (cameraSelect && cameraSelect.value) {
      this.selectedCameraDeviceId = cameraSelect.value;
      this.stopCameraStream();
      setTimeout(() => this.initCameraStream(), 200);
    }
  }
}
