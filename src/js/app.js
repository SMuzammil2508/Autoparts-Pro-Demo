// AutoParts Pro - Main Application Orchestrator & Controller
// Product-grade modular architecture for Enterprise Auto Parts Inventory & Counter Management

import { sound } from './core/audio.js';
import { StorageManager } from './core/storage.js';
import { getBrandBadgeHtml, getCategoryBadgeHtml } from './ui/emblems.js';
import { showToast } from './ui/toast.js';
import { SUB_CATEGORIES_CONFIG } from './config/subcategories.js';

import { BarcodeEngine } from './modules/barcode.js';
import { ScannerEngine } from './modules/scanner.js';
import { SpeechEngine } from './modules/speech.js';
import { ReturnsManager } from './modules/returns.js';
import { PriceRevisionManager } from './modules/priceRevision.js';
import { TaxonomyManager } from './modules/taxonomy.js';
import { SettingsManager } from './modules/settings.js';
import { InventoryManager } from './modules/inventory.js';
import { PriceBookManager } from './modules/priceBook.js';

class AutoPartsApp {
  constructor() {
    this.storage = StorageManager;
    this.sound = sound;

    // Active Workspace State ('counter' | 'outflow' | 'pricing' | 'claims')
    this.currentWorkspace = "counter";

    this.products = this.storage.getProducts();
    if (typeof window !== 'undefined' && window.location && window.location.search && window.location.search.includes('test_stock_cases=1')) {
      this.products = [
        {
          id: "part-case1",
          name: "Rear Shock Absorber Strut (Single Floor)",
          partNumber: "SA-REAR-01",
          barcode: "890100100001",
          brand: "Monroe",
          category: "Suspension",
          vehicleBrand: "Honda",
          compatibleModels: ["City 2016-2022", "Civic 2018-2023"],
          costPrice: 900.00,
          sellingPrice: 1600.00,
          stockGroundFloor: 0,
          stockFloor1: 0,
          stockFloor2: 1, // Case 1: 2F · 1
          rackLocation: "Floor 2 - Rack B-12",
          minStockAlert: 1,
          unit: "Piece"
        },
        {
          id: "part-case2",
          name: "Front Ceramic Brake Pads (Two Floors)",
          partNumber: "BP-FRONT-02",
          barcode: "890100100002",
          brand: "Bosch",
          category: "Brakes",
          vehicleBrand: "Toyota",
          compatibleModels: ["Corolla 2015-2022", "Yaris 2018-2023"],
          costPrice: 1100.00,
          sellingPrice: 1950.00,
          stockGroundFloor: 2, // Case 2: GF: 2 | 1F: 3
          stockFloor1: 3,
          stockFloor2: 0,
          rackLocation: "Floor 1 - Rack A-04",
          minStockAlert: 2,
          unit: "Set"
        },
        {
          id: "part-case3",
          name: "Engine Oil Filter Cartridge (All Floors)",
          partNumber: "OF-ALL-03",
          barcode: "890100100003",
          brand: "Mann-Filter",
          category: "Filters",
          vehicleBrand: "Suzuki / Maruti",
          compatibleModels: ["Swift 2015-2023", "Dzire 2017-2023"],
          costPrice: 250.00,
          sellingPrice: 480.00,
          stockGroundFloor: 2, // Case 3: GF: 2 | 1F: 3 | 2F: 1
          stockFloor1: 3,
          stockFloor2: 1,
          rackLocation: "Floor 1 - Rack F-02",
          minStockAlert: 3,
          unit: "Piece"
        },
        {
          id: "part-case4",
          name: "Alternator Ribbed V-Belt (Out of Stock)",
          partNumber: "VB-OUT-04",
          barcode: "890100100004",
          brand: "Continental",
          category: "Belts",
          vehicleBrand: "Hyundai",
          compatibleModels: ["i20 2016-2022", "Verna 2018-2023"],
          costPrice: 400.00,
          sellingPrice: 750.00,
          stockGroundFloor: 0, // Case 4: No Stock
          stockFloor1: 0,
          stockFloor2: 0,
          rackLocation: "Floor 1 - Rack C-01",
          minStockAlert: 1,
          unit: "Piece"
        }
      ];
    }
    this.vehicleBrands = this.storage.getVehicleBrands();
    this.categories = this.storage.getCategories();
    this.outflowLog = this.storage.getOutflows();
    this.defectiveReturns = this.storage.getDefectiveReturns();
    this.settings = this.storage.getSettings();

    // Filters State
    this.searchQuery = "";
    this.selectedBrand = "all";
    this.selectedCategory = "all";
    this.selectedSubCategory = "all";
    this.selectedStatusTab = "all";
    this.printingPart = null;

    // Batch Print Queue State (key: partId, value: { part, quantity })
    this.batchPrintQueue = new Map();

    // POS Cart Drawer & State (Phase 3 In-Memory Cart & Phase 5 POS Checkout)
    this.isCartDrawerOpen = false;
    this.cart = []; // In-memory cart array: { id, part, quantity, sellingPrice, itemTotal }
    this.lastScannedBarcode = '';
    this.lastScanTime = 0;
    this.selectedPaymentMethod = 'CASH';
    this.isProcessingCheckout = false;
    this.currentCheckoutId = null;
    this.pendingCheckoutRecord = null;

    // Cashier Authentication State (Phase 5 Supabase Auth)
    this.cashierSession = null;
    this.cashierUser = null;
    this.authInitPromise = null;

    // Helper functions on App instance for modules
    this.getBrandBadgeHtml = getBrandBadgeHtml;
    this.getCategoryBadgeHtml = getCategoryBadgeHtml;
    this.showToast = showToast;

    // Instantiate Sub-Engines & Modules
    this.barcodeEngine = new BarcodeEngine(this.settings);
    this.scannerEngine = new ScannerEngine((barcode, source) => this.handleBarcodeScanned(barcode, source), this);
    this.speechEngine = new SpeechEngine(
      (normalized, raw) => this.handleVoiceSearchResult(normalized, raw),
      (isListening, error) => this.handleVoiceSearchState(isListening, error)
    );
    this.returnsManager = new ReturnsManager(this);
    this.priceRevisionManager = new PriceRevisionManager(this);
    this.taxonomyManager = new TaxonomyManager(this);
    this.settingsManager = new SettingsManager(this);
    this.inventoryManager = new InventoryManager(this);
    this.priceBookManager = new PriceBookManager(this);
  }

  init() {
    this.settingsManager.applyTheme(this.settings.theme || 'midnight');
    this.sound.enabled = this.settings.soundEnabled !== false;

    // Render Initial UI
    this.renderBrandChips();
    this.renderCategoryChips();
    this.renderSubCategoryChips();
    this.renderProducts();
    this.updateHeaderStats();

    // Initialize Price Book (On-Order Catalog)
    this.priceBookManager.init();

    // Bind Event Listeners & Global Keyboard Shortcuts
    this.setupEventListeners();
    this.setupGlobalKeyboardShortcuts();

    // Initialize Supabase Live Cloud Sync & Realtime Multi-Device WebSockets
    this.storage.initCloudSync(this);

    // Initial Cart Drawer Render (Phase 3 In-Memory Cart)
    this.renderCartDrawer();

    // Safe Checkout Recovery (Phase 5 Pending / Uncertain Transaction Recovery)
    this.restorePendingCheckout();

    // Cashier Authentication Session Initialization (Phase 5 Supabase Auth)
    this.authInitPromise = this.initCashierAuth();

    if (window.lucide) lucide.createIcons();
    console.log("🚀 AutoParts Pro Engine initialized with 5-Workspace Navigation & Live Cloud Sync.");
  }

  saveProducts(affectedIds = null) {
    this.storage.saveProducts(this.products, affectedIds);
  }

  formatCurrency(num) {
    const symbol = this.settings.currencySymbol || "₹";
    const val = Number(num);
    const safeNum = (Number.isFinite(val) && !Number.isNaN(val)) ? val : 0;
    return `${symbol} ${safeNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Phase 4 Price & Quantity Integrity Validators
  validateSellingPrice(price) {
    if (price === null || price === undefined || price === '') {
      return { isValid: false, price: 0, reason: 'Price is missing' };
    }
    const num = Number(price);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      return { isValid: false, price: 0, reason: 'Price is not a valid number' };
    }
    if (num <= 0) {
      return { isValid: false, price: num, reason: num === 0 ? 'Selling price cannot be zero (₹0.00)' : 'Selling price cannot be negative' };
    }
    return { isValid: true, price: Math.round(num * 100) / 100, reason: '' };
  }

  sanitizeQuantity(qty) {
    const parsed = parseInt(qty, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
      return 1;
    }
    return parsed;
  }

  // 4-Workspace Switcher (Zero-Friction State Preservation)
  switchWorkspace(workspaceName = 'counter') {
    this.currentWorkspace = workspaceName;
    this.sound.playClick();

    // 1. Update Workspace Navigation Tabs
    const navTabs = document.querySelectorAll('.workspace-nav-tab');
    navTabs.forEach(tab => {
      const isTarget = tab.dataset.workspace === workspaceName;
      tab.classList.toggle('active', isTarget);
      if (isTarget) {
        tab.classList.remove('text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-900/60');
      } else {
        tab.classList.add('text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-900/60');
      }
    });

    // 2. Update Workspace View Visibility
    const views = document.querySelectorAll('.workspace-view');
    views.forEach(view => {
      const isTarget = view.id === `workspace-view-${workspaceName}`;
      view.classList.toggle('hidden', !isTarget);
      view.classList.toggle('active', isTarget);
    });

    // 3. Update Dynamic Contextual Action in Header
    const contextualContainer = document.getElementById('header-contextual-actions');
    if (contextualContainer) {
      if (workspaceName === 'counter') {
        contextualContainer.innerHTML = `
          <button 
            id="open-add-part-btn" 
            class="contextual-action btn-touch flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs md:text-sm transition-all shadow-md shadow-blue-600/30 shrink-0 cursor-pointer"
            title="Add a new auto part to the catalog"
          >
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Add Part</span>
          </button>
        `;
        document.getElementById('open-add-part-btn')?.addEventListener('click', () => this.inventoryManager.openAddPartModal());
      } else if (workspaceName === 'outflow') {
        contextualContainer.innerHTML = `
          <button 
            id="header-action-print-outflow" 
            class="contextual-action btn-touch flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs md:text-sm transition-all border border-slate-700 shrink-0 cursor-pointer"
            title="Print the Daily Sales Outflow Ledger"
          >
            <i data-lucide="printer" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Print Ledger</span>
          </button>
        `;
        document.getElementById('header-action-print-outflow')?.addEventListener('click', () => this.printOutflowLedger());
      } else if (workspaceName === 'pricing') {
        contextualContainer.innerHTML = `
          <button 
            id="header-action-add-brand" 
            class="contextual-action btn-touch flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs md:text-sm transition-all shadow-md shadow-purple-600/30 shrink-0 cursor-pointer"
            title="Manage Car Brands and Product Categories"
          >
            <i data-lucide="tags" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Manage Brands</span>
          </button>
        `;
        document.getElementById('header-action-add-brand')?.addEventListener('click', () => this.taxonomyManager.openTaxonomyModal('brands'));
      } else if (workspaceName === 'claims') {
        contextualContainer.innerHTML = `
          <button 
            id="header-action-print-claims" 
            class="contextual-action btn-touch flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs md:text-sm transition-all shadow-md shadow-rose-600/30 shrink-0 cursor-pointer"
            title="Print Distributor Return Claim Sheet"
          >
            <i data-lucide="printer" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Debit Note</span>
          </button>
        `;
        document.getElementById('header-action-print-claims')?.addEventListener('click', () => this.returnsManager.printWholesalerClaimSheet());
      } else if (workspaceName === 'on-order') {
        contextualContainer.innerHTML = `
          <button 
            id="header-action-add-on-order" 
            class="contextual-action btn-touch flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs md:text-sm transition-all shadow-md shadow-purple-600/30 shrink-0 cursor-pointer"
            title="Add a new on-order part to the Price Book"
          >
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Add On-Order Part</span>
          </button>
        `;
        document.getElementById('header-action-add-on-order')?.addEventListener('click', () => this.priceBookManager.openAddModal());
      }
    }

    // 4. Trigger target workspace data render
    if (workspaceName === 'outflow') {
      this.renderOutflowTableWithFilter('today');
    } else if (workspaceName === 'pricing') {
      this.priceRevisionManager.populatePriceRevisionDropdowns();
      this.priceRevisionManager.calculateBrandPriceRevisionPreview();
    } else if (workspaceName === 'claims') {
      this.returnsManager.renderDefectiveClaimsTable('pending');
    } else if (workspaceName === 'on-order') {
      this.priceBookManager.renderBrandFilterChips();
      this.priceBookManager.renderCatalog();
    }

    if (window.lucide) lucide.createIcons();
  }

  // Keyboard-First Shortcut Engine (/ and Ctrl+K)
  setupGlobalKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isEditable = document.activeElement && (document.activeElement.isContentEditable || activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');

      // Slash (/) or Ctrl+K / Cmd+K focuses search input
      if ((e.key === '/' && !isEditable) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (this.currentWorkspace !== 'counter') {
          this.switchWorkspace('counter');
        }
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Escape key clears search or closes modal / cart drawer
      if (e.key === 'Escape') {
        if (this.isCartDrawerOpen) {
          this.closeCartDrawer();
          return;
        }
        const searchInput = document.getElementById('search-input');
        if (document.activeElement === searchInput) {
          if (this.searchQuery) {
            this.searchQuery = '';
            searchInput.value = '';
            document.getElementById('clear-search-btn')?.classList.add('hidden');
            this.renderProducts();
          }
          searchInput.blur();
        }
      }
    });
  }

  // POS Cart Drawer UI Controls (Phase 3 In-Memory Cart)
  openCartDrawer() {
    this.sound.playClick();
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.add('cart-drawer-open');
      backdrop.classList.add('backdrop-active');
      this.isCartDrawerOpen = true;
      if (window.lucide) lucide.createIcons();
    }
  }

  closeCartDrawer() {
    this.sound.playClick();
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (drawer && backdrop) {
      drawer.classList.remove('cart-drawer-open');
      backdrop.classList.remove('backdrop-active');
      this.isCartDrawerOpen = false;
    }
  }

  toggleCartDrawer() {
    if (this.isCartDrawerOpen) {
      this.closeCartDrawer();
    } else {
      this.openCartDrawer();
    }
  }

  renderCartDrawer() {
    const headerCount = document.getElementById('header-cart-count');
    const itemsList = document.getElementById('cart-items-list');
    const emptyState = document.getElementById('cart-empty-state');
    const footerTotals = document.getElementById('cart-footer-totals');
    const totalUnitsText = document.getElementById('cart-total-units-text');
    const grandTotalAmount = document.getElementById('cart-grand-total-amount');

    const totalUnits = this.cart.reduce((sum, item) => sum + this.sanitizeQuantity(item.quantity), 0);
    const grandTotal = this.cart.reduce((sum, item) => {
      const qty = this.sanitizeQuantity(item.quantity);
      const priceVal = this.validateSellingPrice(item.sellingPrice);
      const price = priceVal.isValid ? priceVal.price : 0;
      return sum + (qty * price);
    }, 0);
    const cleanGrandTotal = Math.round(grandTotal * 100) / 100;

    // Update header cart count badge
    if (headerCount) {
      headerCount.textContent = totalUnits;
    }

    if (!itemsList || !emptyState) return;

    if (this.cart.length === 0) {
      emptyState.classList.remove('hidden');
      itemsList.classList.add('hidden');
      itemsList.innerHTML = '';
      if (footerTotals) footerTotals.classList.add('hidden');
      if (totalUnitsText) totalUnitsText.textContent = '0 parts (0 units)';
      if (grandTotalAmount) grandTotalAmount.textContent = this.formatCurrency(0);

      const completeSaleBtn = document.getElementById('btn-complete-sale');
      if (completeSaleBtn) {
        completeSaleBtn.disabled = true;
        completeSaleBtn.classList.add('cursor-not-allowed', 'opacity-60');
        completeSaleBtn.classList.remove('cursor-pointer', 'hover:bg-emerald-500', 'bg-emerald-600');
      }
      return;
    }

    emptyState.classList.add('hidden');
    itemsList.classList.remove('hidden');
    if (footerTotals) footerTotals.classList.remove('hidden');

    const completeSaleBtn = document.getElementById('btn-complete-sale');
    if (completeSaleBtn) {
      completeSaleBtn.disabled = false;
      completeSaleBtn.classList.remove('cursor-not-allowed', 'opacity-60', 'opacity-80');
      completeSaleBtn.classList.add('cursor-pointer', 'bg-emerald-600', 'hover:bg-emerald-500');
    }

    if (totalUnitsText) {
      totalUnitsText.textContent = `${this.cart.length} ${this.cart.length === 1 ? 'part' : 'parts'} (${totalUnits} ${totalUnits === 1 ? 'unit' : 'units'})`;
    }
    if (grandTotalAmount) {
      grandTotalAmount.textContent = this.formatCurrency(cleanGrandTotal);
    }

    // Render each cart item with validated fields
    itemsList.innerHTML = this.cart.map(item => {
      const part = item.part || {};
      const totalStock = Math.max(0, parseInt(this.inventoryManager.getTotalStock(part), 10) || 0);
      const partName = (part.name && String(part.name).trim()) || 'Unnamed Part';
      const partNumber = (part.partNumber && String(part.partNumber).trim()) || 'NO-SKU';
      const barcode = (part.barcode && String(part.barcode).trim()) || '';
      const oemBrand = (part.brand && String(part.brand).trim()) || 'Generic OEM';
      const vehicleBrand = (part.vehicleBrand && String(part.vehicleBrand).trim()) || 'Universal';
      const modelsText = (part.compatibleModels && Array.isArray(part.compatibleModels) && part.compatibleModels.length > 0)
        ? `Fits: ${part.compatibleModels.join(', ')}`
        : 'Universal Fitment';
      const rackLocation = (part.rackLocation && String(part.rackLocation).trim()) || 'Not Assigned';
      const qty = this.sanitizeQuantity(item.quantity);
      const priceVal = this.validateSellingPrice(item.sellingPrice);
      const unitPrice = priceVal.isValid ? priceVal.price : 0;
      const itemSubtotal = Math.round(qty * unitPrice * 100) / 100;
      const isAtStockLimit = qty >= totalStock;
      const isDecrementRemove = qty === 1;

      return `
        <div class="rounded-2xl p-3.5 sm:p-4 bg-slate-900/95 border-2 border-slate-800 hover:border-slate-700 transition-all shadow-md space-y-3 relative" data-part-id="${item.id}">
          <!-- Top Status & Identifiers Row -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <!-- Vehicle Brand Pill -->
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-slate-800 border border-slate-700 text-amber-400">
                <i data-lucide="car" class="w-3 h-3 text-amber-400"></i>
                <span>${vehicleBrand}</span>
              </span>

              <!-- OEM Brand Pill (Explicitly preserved from part.brand) -->
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-extrabold bg-blue-950/80 text-blue-300 border border-blue-700/60" title="OEM / Manufacturer Brand">
                <i data-lucide="shield" class="w-3 h-3 text-blue-400"></i>
                <span>OEM Brand: ${oemBrand}</span>
              </span>
            </div>

            <!-- Physical Available Stock Badge -->
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold ${totalStock <= 0 ? 'bg-rose-950/80 border-rose-700/60 text-rose-300' : 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'} shrink-0">
              <i data-lucide="${totalStock <= 0 ? 'alert-triangle' : 'check'}" class="w-3 h-3 ${totalStock <= 0 ? 'text-rose-400' : 'text-emerald-400'}"></i>
              <span>${totalStock} in stock</span>
            </span>
          </div>

          <!-- Part Title & SKU -->
          <div>
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800/40">
                ${partNumber}
              </span>
              ${barcode ? `
                <span class="text-[10px] font-mono text-slate-400">
                  BARCODE: ${barcode}
                </span>
              ` : ''}
            </div>
            <h3 class="text-xs sm:text-sm font-extrabold text-slate-100 leading-snug">
              ${partName}
            </h3>
            <p class="text-[11px] text-slate-400 mt-0.5">
              ${modelsText}
            </p>
          </div>

          <!-- Shelf Location Info -->
          <div class="text-[11px] text-slate-400 bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <span class="flex items-center gap-1">
              <span>📍 Shelf:</span>
              <b class="text-slate-200">${rackLocation}</b>
            </span>
            <span class="text-[10px] text-slate-500 font-mono">
              Ground: ${part.stockGroundFloor || 0} | Fl 1: ${part.stockFloor1 || 0} | Fl 2: ${part.stockFloor2 || 0}
            </span>
          </div>

          <!-- Price & Quantity Bar (Customer-Facing Selling Price ONLY) -->
          <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
            <!-- Selling Price -->
            <div>
              <div class="text-[10px] font-bold uppercase text-slate-400">Customer Price</div>
              <div class="text-sm sm:text-base font-black text-emerald-400 font-mono">
                ${priceVal.isValid ? this.formatCurrency(unitPrice) : '<span class="text-rose-400 text-xs">Invalid Price</span>'}
              </div>
            </div>

            <!-- Quantity Controls (+ and - and numeric display) -->
            <div class="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button 
                type="button" 
                class="cart-qty-btn cart-qty-dec w-7 h-7 rounded-lg ${isDecrementRemove ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/40' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'} flex items-center justify-center font-black transition-all cursor-pointer"
                data-part-id="${item.id}"
                title="${isDecrementRemove ? 'Remove item from cart' : 'Decrease quantity by 1'}"
                aria-label="${isDecrementRemove ? 'Remove item from cart' : 'Decrease quantity'}"
              >
                <i data-lucide="${isDecrementRemove ? 'trash-2' : 'minus'}" class="w-3.5 h-3.5"></i>
              </button>
              <input 
                type="text" 
                value="${qty}" 
                readonly 
                class="w-8 text-center bg-transparent text-slate-100 font-mono font-bold text-xs focus:outline-none cursor-default"
                aria-label="Cart Item Quantity"
              />
              <button 
                type="button" 
                class="cart-qty-btn cart-qty-inc w-7 h-7 rounded-lg ${isAtStockLimit ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer'} flex items-center justify-center font-black transition-all"
                data-part-id="${item.id}"
                ${isAtStockLimit ? 'disabled' : ''}
                title="${isAtStockLimit ? `Stock limit reached (${totalStock} available in inventory)` : 'Increase quantity by 1'}"
                aria-label="Increase Quantity"
              >
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              </button>
            </div>

            <!-- Line Subtotal & Remove Button -->
            <div class="flex items-center gap-2">
              <div class="text-right">
                <div class="text-[10px] font-bold uppercase text-slate-400">Subtotal</div>
                <div class="text-sm sm:text-base font-black text-amber-400 font-mono">
                  ${priceVal.isValid ? this.formatCurrency(itemSubtotal) : '<span class="text-rose-400 text-xs">₹ 0.00</span>'}
                </div>
              </div>
              <button 
                type="button" 
                class="cart-remove-item-btn w-7 h-7 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 flex items-center justify-center transition-all cursor-pointer"
                data-part-id="${item.id}"
                title="Remove item from cart"
                aria-label="Remove item"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  // --- CASHIER AUTHENTICATION (Phase 5 Supabase Auth) ---
  async initCashierAuth() {
    try {
      // 1. Listen for auth state changes
      if (this.storage && typeof this.storage.onAuthStateChange === 'function') {
        this.storage.onAuthStateChange((event, session) => {
          this.cashierSession = session || null;
          this.cashierUser = session ? session.user : null;
          this.updateCashierAuthUi();
        });
      }

      // 2. Restore active session
      if (this.storage && typeof this.storage.getSession === 'function') {
        const { data, error } = await this.storage.getSession();
        if (data && data.session) {
          this.cashierSession = data.session;
          this.cashierUser = data.session.user;
        } else {
          this.cashierSession = null;
          this.cashierUser = null;
        }
      }
    } catch (err) {
      console.warn("Cashier auth session restore notice:", err);
      this.cashierSession = null;
      this.cashierUser = null;
    } finally {
      this.updateCashierAuthUi();
    }
  }

  updateCashierAuthUi() {
    const badge = document.getElementById('cashier-auth-badge');
    const dot = document.getElementById('cashier-status-dot');
    const text = document.getElementById('cashier-status-text');
    const signedInView = document.getElementById('cashier-signed-in-view');
    const loginForm = document.getElementById('cashier-login-form');
    const sessionEmail = document.getElementById('cashier-session-email');
    const sessionUid = document.getElementById('cashier-session-uid');

    // Settings Modal Cashier Account Elements
    const sBadge = document.getElementById('settings-cashier-status-badge');
    const sDot = document.getElementById('settings-cashier-dot');
    const sLabel = document.getElementById('settings-cashier-label');
    const sSignedIn = document.getElementById('settings-cashier-signed-in');
    const sSignedOut = document.getElementById('settings-cashier-signed-out');
    const sEmail = document.getElementById('settings-cashier-email');
    const sUid = document.getElementById('settings-cashier-uid');

    if (this.cashierUser && this.cashierSession) {
      const email = this.cashierUser.email || 'Cashier';
      const shortEmail = email.length > 18 ? email.substring(0, 15) + '...' : email;
      if (badge) {
        badge.title = `Signed in as Cashier (${email}).`;
        badge.classList.remove('bg-slate-800/80', 'border-slate-700', 'text-slate-300');
        badge.classList.add('bg-emerald-950/60', 'border-emerald-500/40', 'text-emerald-300');
      }
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0';
      }
      if (text) {
        text.textContent = shortEmail;
      }
      if (signedInView) {
        signedInView.classList.remove('hidden');
      }
      if (loginForm) {
        loginForm.classList.add('hidden');
      }
      if (sessionEmail) {
        sessionEmail.textContent = email;
      }
      if (sessionUid) {
        sessionUid.textContent = this.cashierUser.id || 'N/A';
      }

      // Settings Cashier Account Active State
      if (sBadge) {
        sBadge.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/70 border border-emerald-500/40 text-emerald-300';
      }
      if (sDot) {
        sDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0';
      }
      if (sLabel) {
        sLabel.textContent = 'Active Session';
      }
      if (sSignedIn) sSignedIn.classList.remove('hidden');
      if (sSignedOut) sSignedOut.classList.add('hidden');
      if (sEmail) sEmail.textContent = email;
      if (sUid) sUid.textContent = this.cashierUser.id || 'N/A';
    } else {
      if (badge) {
        badge.title = 'Cashier Authentication';
        badge.classList.remove('bg-emerald-950/60', 'border-emerald-500/40', 'text-emerald-300');
        badge.classList.add('bg-slate-800/80', 'border-slate-700', 'text-slate-300');
      }
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-slate-500 shrink-0';
      }
      if (text) {
        text.textContent = 'Cashier Login';
      }
      if (signedInView) {
        signedInView.classList.add('hidden');
      }
      if (loginForm) {
        loginForm.classList.remove('hidden');
      }
      if (sessionEmail) sessionEmail.textContent = '';
      if (sessionUid) sessionUid.textContent = '';

      // Settings Cashier Account Signed Out State
      if (sBadge) {
        sBadge.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-400';
      }
      if (sDot) {
        sDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0';
      }
      if (sLabel) {
        sLabel.textContent = 'Signed Out';
      }
      if (sSignedIn) sSignedIn.classList.add('hidden');
      if (sSignedOut) sSignedOut.classList.remove('hidden');
      if (sEmail) sEmail.textContent = '';
      if (sUid) sUid.textContent = '';
    }
    if (window.lucide) lucide.createIcons();
  }

  openCashierLoginModal() {
    const modal = document.getElementById('cashier-login-modal');
    const alertBox = document.getElementById('cashier-auth-alert');
    if (alertBox) {
      alertBox.className = 'hidden text-xs p-2.5 rounded-xl border';
      alertBox.textContent = '';
    }
    this.updateCashierAuthUi();
    if (modal) modal.classList.remove('hidden');
    const emailInput = document.getElementById('cashier-email-input');
    if (emailInput && !this.cashierUser) {
      setTimeout(() => emailInput.focus(), 50);
    }
  }

  closeCashierLoginModal() {
    const modal = document.getElementById('cashier-login-modal');
    if (modal) modal.classList.add('hidden');
    const passwordInput = document.getElementById('cashier-password-input');
    if (passwordInput) passwordInput.value = '';
    const alertBox = document.getElementById('cashier-auth-alert');
    if (alertBox) {
      alertBox.className = 'hidden text-xs p-2.5 rounded-xl border';
      alertBox.textContent = '';
    }
  }

  async handleCashierSignIn(e) {
    if (e && e.preventDefault) e.preventDefault();
    const emailInput = document.getElementById('cashier-email-input');
    const passwordInput = document.getElementById('cashier-password-input');
    const alertBox = document.getElementById('cashier-auth-alert');
    const submitBtn = document.getElementById('btn-cashier-sign-in');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      if (alertBox) {
        alertBox.className = 'text-xs p-2.5 rounded-xl border bg-amber-950/60 border-amber-500/50 text-amber-300 block';
        alertBox.textContent = 'Please enter both email and password.';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Signing in...</span>';
      if (window.lucide) lucide.createIcons();
    }

    try {
      const { data, error } = await this.storage.signIn(email, password);

      if (error) {
        if (alertBox) {
          alertBox.className = 'text-xs p-2.5 rounded-xl border bg-rose-950/60 border-rose-500/50 text-rose-300 block';
          alertBox.textContent = error.message || 'Authentication failed.';
        }
        this.showToast(error.message || 'Authentication failed', 'error');
        return;
      }

      if (data && data.session) {
        this.cashierSession = data.session;
        this.cashierUser = data.session.user;
        this.updateCashierAuthUi();
        this.showToast(`Signed in as ${this.cashierUser.email}`, 'success');
        if (passwordInput) passwordInput.value = '';

        // If checkout modal was waiting on cashier sign-in, update confirm button text
        const confirmBtn = document.getElementById('btn-confirm-pos-checkout');
        if (confirmBtn && confirmBtn.innerHTML.includes('Sign In to Complete Sale')) {
          confirmBtn.innerHTML = `
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>Confirm & Complete Sale</span>
          `;
          if (window.lucide) lucide.createIcons();
        }

        setTimeout(() => this.closeCashierLoginModal(), 400);
      } else {
        if (alertBox) {
          alertBox.className = 'text-xs p-2.5 rounded-xl border bg-amber-950/60 border-amber-500/50 text-amber-300 block';
          alertBox.textContent = 'Sign-in completed without an active session.';
        }
      }
    } catch (err) {
      if (alertBox) {
        alertBox.className = 'text-xs p-2.5 rounded-xl border bg-rose-950/60 border-rose-500/50 text-rose-300 block';
        alertBox.textContent = err.message || 'An unexpected error occurred during sign-in.';
      }
      this.showToast(err.message || 'Sign in error', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="log-in" class="w-4 h-4"></i><span>Sign In</span>';
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  async handleCashierSignOut() {
    const alertBox = document.getElementById('cashier-auth-alert');
    const signOutBtn = document.getElementById('btn-cashier-sign-out');

    if (signOutBtn) {
      signOutBtn.disabled = true;
      signOutBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Signing out...</span>';
      if (window.lucide) lucide.createIcons();
    }

    try {
      const { error } = await this.storage.signOut();
      if (error) {
        console.warn("Supabase auth signOut error:", error);
        // Do not blindly clear local state while leaving an active SDK session behind.
        // Re-check the actual SDK session to make the UI accurately reflect the resulting session state.
        try {
          const { data } = await this.storage.getSession();
          this.cashierSession = data && data.session ? data.session : null;
          this.cashierUser = this.cashierSession ? this.cashierSession.user : null;
        } catch (sessErr) {
          console.warn("Failed to re-check session after signOut error:", sessErr);
        }
        this.updateCashierAuthUi();

        const errMsg = error.message || 'Sign out encountered a network or server error.';
        if (alertBox) {
          alertBox.className = 'text-xs p-2.5 rounded-xl border bg-rose-950/60 border-rose-500/50 text-rose-300 block';
          alertBox.textContent = `Sign out failed: ${errMsg}`;
        }
        this.showToast(`Sign out failed: ${errMsg}`, 'error');
        return;
      }

      this.cashierSession = null;
      this.cashierUser = null;
      this.updateCashierAuthUi();
      this.showToast('Cashier signed out successfully', 'info');
      setTimeout(() => this.closeCashierLoginModal(), 300);
    } catch (err) {
      console.warn("Unexpected exception during cashier sign out:", err);
      try {
        const { data } = await this.storage.getSession();
        this.cashierSession = data && data.session ? data.session : null;
        this.cashierUser = this.cashierSession ? this.cashierSession.user : null;
      } catch (sessErr) {}
      this.updateCashierAuthUi();

      const errMsg = err.message || 'An unexpected error occurred during sign out.';
      if (alertBox) {
        alertBox.className = 'text-xs p-2.5 rounded-xl border bg-rose-950/60 border-rose-500/50 text-rose-300 block';
        alertBox.textContent = `Sign out failed: ${errMsg}`;
      }
      this.showToast(errMsg, 'error');
    } finally {
      if (signOutBtn) {
        signOutBtn.disabled = false;
        signOutBtn.innerHTML = '<i data-lucide="log-out" class="w-4 h-4"></i><span>Sign Out Cashier</span>';
        if (window.lucide) lucide.createIcons();
      }
    }
  }

  canModifyCart() {
    if (this.pendingCheckoutRecord && (this.pendingCheckoutRecord.transactionStatus === 'uncertain' || this.pendingCheckoutRecord.transactionStatus === 'pending')) {
      this.sound.playWarningBeep();
      this.showToast(`Cannot modify cart: Checkout "${this.pendingCheckoutRecord.checkoutId}" is pending server confirmation. Please retry or resolve it first.`, "warning");
      return false;
    }
    return true;
  }

  restorePendingCheckout() {
    try {
      const raw = localStorage.getItem('autoparts_active_checkout_v1');
      const lastReceipt = this.storage.getLastCompletedReceipt ? this.storage.getLastCompletedReceipt() : null;

      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || !pending.checkoutId) return;

      // Safe recovery: If this pending checkout was actually already completed and stored as the last receipt,
      // recover it directly and prevent accidental double checkout prompts!
      if (lastReceipt && lastReceipt.checkoutId === pending.checkoutId) {
        console.log(`✅ Pending checkout ${pending.checkoutId} was already completed. Restoring receipt.`);
        try {
          localStorage.removeItem('autoparts_active_checkout_v1');
        } catch (e) {}
        this.pendingCheckoutRecord = null;
        this.currentCheckoutId = null;
        this.cart = [];
        this.renderCartDrawer();
        this.openReceiptModal(lastReceipt);
        this.showToast("Restored completed sale voucher.", "success");
        return;
      }

      if (pending.transactionStatus === 'uncertain' || pending.transactionStatus === 'pending') {
        this.currentCheckoutId = pending.checkoutId;
        this.selectedPaymentMethod = pending.paymentMethod || 'CASH';
        this.pendingCheckoutRecord = pending;

        // If the in-memory cart was reset (e.g. on page reload/browser crash),
        // restore items from the immutable items of the pending payload
        if ((!this.cart || this.cart.length === 0) && Array.isArray(pending.immutableItems) && pending.immutableItems.length > 0) {
          this.cart = pending.immutableItems.map(item => {
            const matched = (this.products || []).find(p => p.id === item.partId);
            return {
              id: item.partId,
              part: matched || { name: item.name || 'Auto Part', partNumber: item.partNumber || 'SKU' },
              quantity: item.quantity,
              sellingPrice: item.sellingPrice,
              itemTotal: item.lineTotal || Math.round(item.quantity * item.sellingPrice * 100) / 100
            };
          });
          this.renderCartDrawer();
        }

        console.warn(`⚠️ Unresolved checkout restored: ${pending.checkoutId} (Status: ${pending.transactionStatus})`);
        this.showToast(`Unresolved checkout ${pending.checkoutId} restored. Click "Complete Sale" to retry safely.`, "warning");
      }
    } catch (e) {
      console.error("Error restoring pending checkout:", e);
    }
  }

  openLastReceipt() {
    const receipt = this.storage.getLastCompletedReceipt ? this.storage.getLastCompletedReceipt() : null;
    if (!receipt) {
      this.sound.playClick();
      this.showToast("No recent receipt found in this session.", "info");
      return;
    }
    this.openReceiptModal(receipt);
    this.sound.playClick();
  }

  updateCartItemQuantity(partId, delta) {
    if (!this.canModifyCart()) return;
    const itemIndex = this.cart.findIndex(i => i.id === partId);
    if (itemIndex === -1) return;

    const item = this.cart[itemIndex];
    if (!item || !item.part) {
      this.removeFromCart(partId);
      return;
    }

    const totalStock = Math.max(0, parseInt(this.inventoryManager.getTotalStock(item.part), 10) || 0);
    const currentQty = this.sanitizeQuantity(item.quantity);
    const step = parseInt(delta, 10);
    if (Number.isNaN(step) || step === 0) return;

    const newQty = currentQty + step;

    // Decrementing from 1 removes the item from the cart safely and clearly
    if (newQty <= 0) {
      this.removeFromCart(partId);
      return;
    }

    if (newQty > totalStock) {
      this.sound.playWarningBeep();
      this.showToast(`Stock limit reached! Cannot add more "${item.part.name || 'item'}" (Only ${totalStock} available across all floors).`, "warning");
      return;
    }

    // Validate selling price integrity
    const priceVal = this.validateSellingPrice(item.sellingPrice);
    if (!priceVal.isValid) {
      this.sound.playWarningBeep();
      this.showToast(`Cannot update quantity: Invalid selling price on "${item.part.name || 'item'}" (${priceVal.reason}).`, "error");
      return;
    }

    item.quantity = newQty;
    item.sellingPrice = priceVal.price;
    item.itemTotal = Math.round(newQty * priceVal.price * 100) / 100;
    this.renderCartDrawer();
    this.sound.playClick();
  }

  removeFromCart(partId) {
    if (!this.canModifyCart()) return;
    const removedItem = this.cart.find(i => i.id === partId);
    const itemName = removedItem && removedItem.part && removedItem.part.name ? removedItem.part.name : 'Item';
    this.cart = this.cart.filter(i => i.id !== partId);
    this.renderCartDrawer();
    this.sound.playClick();
    this.showToast(`Removed "${itemName}" from cart`, "info");
  }

  clearCart() {
    if (!this.canModifyCart()) return;
    if (this.cart.length === 0) return;
    this.cart = [];
    this.renderCartDrawer();
    this.sound.playClick();
    this.showToast("Sales cart cleared", "info");
  }

  // --- POS CHECKOUT & DIGITAL RECEIPT (PHASE 5) ---
  openCheckoutModal() {
    if (!this.cart || this.cart.length === 0) {
      this.sound.playWarningBeep();
      this.showToast("Cannot checkout: Cart is empty", "warning");
      return;
    }

    // Preserve existing pending / uncertain checkout identity
    if (this.pendingCheckoutRecord && (this.pendingCheckoutRecord.transactionStatus === 'uncertain' || this.pendingCheckoutRecord.transactionStatus === 'pending')) {
      this.currentCheckoutId = this.pendingCheckoutRecord.checkoutId;
      this.selectedPaymentMethod = this.pendingCheckoutRecord.paymentMethod || 'CASH';
    } else {
      this.selectedPaymentMethod = this.selectedPaymentMethod || 'CASH';
      if (!this.currentCheckoutId) {
        this.currentCheckoutId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
    }

    const modal = document.getElementById('pos-checkout-modal');
    const itemsSummary = document.getElementById('checkout-items-summary');
    const grandTotalEl = document.getElementById('checkout-grand-total');
    const totalUnitsEl = document.getElementById('checkout-total-units');
    const errorBanner = document.getElementById('checkout-error-banner');
    const confirmBtn = document.getElementById('btn-confirm-pos-checkout');
    const cancelBtn = document.getElementById('btn-cancel-checkout');

    if (errorBanner) errorBanner.classList.add('hidden');
    if (cancelBtn) cancelBtn.disabled = false;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `
        <i data-lucide="check" class="w-4 h-4"></i>
        <span>Confirm Sale & Print Receipt</span>
      `;
    }

    const totalUnits = this.cart.reduce((sum, item) => sum + this.sanitizeQuantity(item.quantity), 0);
    const grandTotal = this.cart.reduce((sum, item) => {
      const qty = this.sanitizeQuantity(item.quantity);
      const priceVal = this.validateSellingPrice(item.sellingPrice);
      return sum + (qty * (priceVal.isValid ? priceVal.price : 0));
    }, 0);
    const cleanGrandTotal = Math.round(grandTotal * 100) / 100;

    if (grandTotalEl) grandTotalEl.textContent = this.formatCurrency(cleanGrandTotal);
    if (totalUnitsEl) totalUnitsEl.textContent = `${this.cart.length} distinct parts (${totalUnits} total units)`;

    if (itemsSummary) {
      itemsSummary.innerHTML = this.cart.map(item => {
        const qty = this.sanitizeQuantity(item.quantity);
        const priceVal = this.validateSellingPrice(item.sellingPrice);
        const price = priceVal.isValid ? priceVal.price : 0;
        const lineTotal = Math.round(qty * price * 100) / 100;
        return `
          <div class="flex items-center justify-between text-xs py-2 border-b border-slate-800/60 last:border-0">
            <div class="flex-1 min-w-0 pr-2">
              <div class="font-bold text-slate-100 truncate">${item.part ? item.part.name : 'Auto Part'}</div>
              <div class="text-[10px] font-mono text-slate-400">${item.part ? item.part.partNumber : ''} &bull; ${qty}x @ ${this.formatCurrency(price)}</div>
            </div>
            <div class="font-mono font-bold text-emerald-400 shrink-0">
              ${this.formatCurrency(lineTotal)}
            </div>
          </div>
        `;
      }).join('');
    }

    this.updatePaymentMethodUi();

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    this.sound.playClick();
    if (window.lucide) lucide.createIcons();
  }

  selectPaymentMethod(method) {
    if (this.isProcessingCheckout) return;
    this.selectedPaymentMethod = (method === 'UPI') ? 'UPI' : 'CASH';
    this.updatePaymentMethodUi();
    this.sound.playClick();
  }

  updatePaymentMethodUi() {
    const cashBtn = document.getElementById('btn-pay-cash');
    const upiBtn = document.getElementById('btn-pay-upi');
    if (!cashBtn || !upiBtn) return;

    if (this.selectedPaymentMethod === 'CASH') {
      cashBtn.className = "flex-1 p-3 rounded-xl border-2 border-emerald-500 bg-emerald-950/60 text-emerald-200 flex flex-col items-center gap-1 transition-all shadow-md shadow-emerald-950/40 cursor-pointer";
      upiBtn.className = "flex-1 p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 text-slate-400 flex flex-col items-center gap-1 transition-all cursor-pointer";
    } else {
      upiBtn.className = "flex-1 p-3 rounded-xl border-2 border-blue-500 bg-blue-950/60 text-blue-200 flex flex-col items-center gap-1 transition-all shadow-md shadow-blue-950/40 cursor-pointer";
      cashBtn.className = "flex-1 p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 text-slate-400 flex flex-col items-center gap-1 transition-all cursor-pointer";
    }
  }

  closeCheckoutModal(force = false) {
    if (this.isProcessingCheckout && !force) {
      this.showToast("Checkout in progress, please wait...", "warning");
      return;
    }
    const modal = document.getElementById('pos-checkout-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    // Only clear unsubmitted checkout ID. Closing the modal alone must NOT discard an uncertain transaction!
    if (!this.pendingCheckoutRecord || (this.pendingCheckoutRecord.transactionStatus !== 'uncertain' && this.pendingCheckoutRecord.transactionStatus !== 'pending')) {
      this.currentCheckoutId = null;
    }
  }

  async executeCheckout() {
    if (this.isProcessingCheckout) return;

    // Session restoration race guard: wait for auth initialization to complete before checkout begins
    if (this.authInitPromise) {
      try {
        await this.authInitPromise;
      } catch (authErr) {
        console.warn("Notice: Cashier auth initialization encountered an error:", authErr);
      }
    }

    if (!this.cart || this.cart.length === 0) {
      this.showToast("Cannot checkout an empty cart.", "error");
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-pos-checkout');
    const cancelBtn = document.getElementById('btn-cancel-checkout');
    const errorBanner = document.getElementById('checkout-error-banner');
    const errorText = document.getElementById('checkout-error-text');

    this.isProcessingCheckout = true;
    if (errorBanner) errorBanner.classList.add('hidden');

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `
        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        <span>Processing Sale...</span>
      `;
    }
    if (cancelBtn) cancelBtn.disabled = true;

    // Use or preserve exact deterministic checkoutId and payload
    let payload;
    let immutableItems;

    if (this.pendingCheckoutRecord && (this.pendingCheckoutRecord.transactionStatus === 'uncertain' || this.pendingCheckoutRecord.transactionStatus === 'pending') && this.pendingCheckoutRecord.payload) {
      // EXACT immutable payload retry
      payload = this.pendingCheckoutRecord.payload;
      immutableItems = this.pendingCheckoutRecord.immutableItems || [];
      this.currentCheckoutId = this.pendingCheckoutRecord.checkoutId;
      this.selectedPaymentMethod = this.pendingCheckoutRecord.paymentMethod || this.selectedPaymentMethod;
    } else {
      if (!this.currentCheckoutId) {
        this.currentCheckoutId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      immutableItems = this.cart.map(item => ({
        partId: item.id,
        name: item.part ? item.part.name : 'Auto Part',
        partNumber: item.part ? item.part.partNumber : 'SKU',
        quantity: this.sanitizeQuantity(item.quantity),
        sellingPrice: this.validateSellingPrice(item.sellingPrice).price,
        lineTotal: Math.round(this.sanitizeQuantity(item.quantity) * this.validateSellingPrice(item.sellingPrice).price * 100) / 100
      }));

      payload = {
        checkoutId: this.currentCheckoutId,
        paymentMethod: this.selectedPaymentMethod,
        dateStr: new Date().toLocaleDateString('en-IN'),
        timeStr: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: immutableItems.map(item => ({
          partId: item.partId,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice
        }))
      };

      const payloadHash = this.storage.computePayloadHash ? this.storage.computePayloadHash(payload) : JSON.stringify(payload);
      const pendingRecord = {
        checkoutId: this.currentCheckoutId,
        paymentMethod: this.selectedPaymentMethod,
        payload,
        immutableItems,
        payloadHash,
        creationTimestamp: Date.now(),
        transactionStatus: 'pending'
      };

      try {
        localStorage.setItem('autoparts_active_checkout_v1', JSON.stringify(pendingRecord));
        this.pendingCheckoutRecord = pendingRecord;
      } catch (e) {}
    }

    try {
      const result = await this.storage.processCheckout(payload, this);

      if (result.success) {
        // Build receipt data
        const receiptData = result.receipt || {};
        receiptData.paymentMethod = receiptData.paymentMethod || this.selectedPaymentMethod;
        receiptData.storeName = this.settings.storeName || "Decent Motor Accessories";
        receiptData.checkoutId = receiptData.checkoutId || this.currentCheckoutId;
        receiptData.dateStr = receiptData.dateStr || payload.dateStr;
        receiptData.timeStr = receiptData.timeStr || payload.timeStr;

        // Enrich receipt items from immutableItems (never trust current cart!)
        if (!receiptData.items || receiptData.items.length === 0) {
          receiptData.items = immutableItems.map(item => ({
            partId: item.partId,
            name: item.name,
            partNumber: item.partNumber,
            quantity: item.quantity,
            unitPrice: item.sellingPrice,
            lineTotal: item.lineTotal
          }));
        }

        // Store completed receipt durably for receipt recovery
        try {
          localStorage.setItem('autoparts_last_completed_receipt_v1', JSON.stringify(receiptData));
        } catch (e) {}

        // Clear pending checkout record only after verified successful receipt
        try {
          localStorage.removeItem('autoparts_active_checkout_v1');
        } catch (e) {}
        this.pendingCheckoutRecord = null;
        this.currentCheckoutId = null;

        // Clear in-memory cart only upon verified database commit
        this.cart = [];
        this.renderCartDrawer();
        this.closeCartDrawer();
        this.closeCheckoutModal(true);

        // Open Digital Receipt
        try {
          this.openReceiptModal(receiptData);
        } catch (receiptRenderErr) {
          console.error("Receipt rendering warning:", receiptRenderErr);
        }
        this.sound.playSaleChime();
        this.showToast(`Sale completed successfully! (${receiptData.paymentMethod})`, "success");

        this.renderProducts();
        this.updateHeaderStats();
        // If Daily Outflow ledger workspace is active or modal is open, refresh it immediately
        if (this.workspace === 'outflow' || (document.getElementById('daily-outflow-modal') && !document.getElementById('daily-outflow-modal').classList.contains('hidden'))) {
          this.renderOutflowTableWithFilter(this.currentOutflowFilter || 'today');
        }
      } else {
        // Check if error is network / timeout / uncertain
        if (result.isNetwork || result.code === 'NETWORK_ERROR') {
          if (this.pendingCheckoutRecord) {
            this.pendingCheckoutRecord.transactionStatus = 'uncertain';
            try {
              localStorage.setItem('autoparts_active_checkout_v1', JSON.stringify(this.pendingCheckoutRecord));
            } catch (e) {}
          }
          console.warn("Uncertain checkout outcome:", result);
          if (errorBanner && errorText) {
            errorText.textContent = "Transaction unconfirmed due to network timeout. Click 'Retry Sale' to safely verify status using the same checkout ID.";
            errorBanner.classList.remove('hidden');
          }
          this.sound.playWarningBeep();
          this.showToast("Network timeout. Please retry with the same checkout ID.", "warning");

          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `
              <i data-lucide="rotate-cw" class="w-4 h-4"></i>
              <span>Retry Sale</span>
            `;
            if (window.lucide) lucide.createIcons();
          }
          if (cancelBtn) cancelBtn.disabled = false;
        } else if (result.code === 'UNAUTHORIZED' || result.code === '42501') {
          // Authentication failure: Cashier is not signed in or session expired
          // Safely preserve pending checkout ID and payload for retry after sign-in!
          console.warn("Cashier unauthenticated during checkout:", result);
          this.cashierSession = null;
          this.cashierUser = null;
          this.updateCashierAuthUi();

          if (errorBanner && errorText) {
            errorText.textContent = result.error || "Cashier authentication required. Please sign in to complete sale.";
            errorBanner.classList.remove('hidden');
          }
          this.sound.playWarningBeep();
          this.showToast(result.error || "Cashier sign-in required", "warning");

          // Do NOT show misleading generic "Retry Sale" action
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `
              <i data-lucide="log-in" class="w-4 h-4"></i>
              <span>Sign In to Complete Sale</span>
            `;
            if (window.lucide) lucide.createIcons();
          }
          if (cancelBtn) cancelBtn.disabled = false;

          // Automatically prompt sign-in by opening login modal
          this.openCashierLoginModal();
        } else if (result.code === 'FORBIDDEN') {
          // Inactive cashier or account not authorized in cashiers table
          console.warn("Cashier account forbidden from checkout:", result);
          if (errorBanner && errorText) {
            errorText.textContent = result.error || "Your account is not authorized as an active cashier. Please contact store management.";
            errorBanner.classList.remove('hidden');
          }
          this.sound.playWarningBeep();
          this.showToast(result.error || "Account not authorized for counter checkout", "error");

          // Do NOT show misleading "Retry Sale" action
          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `
              <i data-lucide="shield-alert" class="w-4 h-4"></i>
              <span>Unauthorized Cashier</span>
            `;
            if (window.lucide) lucide.createIcons();
          }
          if (cancelBtn) cancelBtn.disabled = false;
        } else {
          // Definitively rejected (e.g. INSUFFICIENT_STOCK, PRICE_DRIFT, IDEMPOTENCY_PAYLOAD_MISMATCH):
          // transaction rolled back before commit on server.
          // Clear pending record and reset currentCheckoutId so user can fix cart and get fresh checkout ID.
          try {
            localStorage.removeItem('autoparts_active_checkout_v1');
          } catch (e) {}
          this.pendingCheckoutRecord = null;
          this.currentCheckoutId = null;

          console.warn("Checkout definitively rejected:", result);
          if (errorBanner && errorText) {
            errorText.textContent = result.error || "Sale failed. Please verify stock and prices.";
            errorBanner.classList.remove('hidden');
          }
          this.sound.playWarningBeep();
          this.showToast(result.error || "Checkout could not be processed.", "error");

          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `
              <i data-lucide="rotate-cw" class="w-4 h-4"></i>
              <span>Retry Sale</span>
            `;
            if (window.lucide) lucide.createIcons();
          }
          if (cancelBtn) cancelBtn.disabled = false;
        }
      }
    } catch (err) {
      console.error("Unexpected checkout exception:", err);
      if (this.pendingCheckoutRecord) {
        this.pendingCheckoutRecord.transactionStatus = 'uncertain';
        try {
          localStorage.setItem('autoparts_active_checkout_v1', JSON.stringify(this.pendingCheckoutRecord));
        } catch (e) {}
      }
      if (errorBanner && errorText) {
        errorText.textContent = "Unexpected connection error. Please click Retry to verify.";
        errorBanner.classList.remove('hidden');
      }
      this.sound.playWarningBeep();
      this.showToast("Network/execution error during checkout.", "error");

      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
          <i data-lucide="rotate-cw" class="w-4 h-4"></i>
          <span>Retry Sale</span>
        `;
        if (window.lucide) lucide.createIcons();
      }
      if (cancelBtn) cancelBtn.disabled = false;
    } finally {
      this.isProcessingCheckout = false;
      if (confirmBtn) {
        confirmBtn.disabled = false;
        if (!errorBanner || errorBanner.classList.contains('hidden')) {
          confirmBtn.innerHTML = `
            <i data-lucide="check" class="w-4 h-4"></i>
            <span>Confirm Sale & Print Receipt</span>
          `;
          if (window.lucide) lucide.createIcons();
        }
      }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  openReceiptModal(receiptData) {
    const modal = document.getElementById('pos-receipt-modal');
    if (!modal) return;

    const storeNameEl = document.getElementById('receipt-store-name');
    const idEl = document.getElementById('receipt-id');
    const datetimeEl = document.getElementById('receipt-datetime');
    const paymentBadgeEl = document.getElementById('receipt-payment-badge');
    const itemsTableBody = document.getElementById('receipt-items-tbody');
    const totalUnitsEl = document.getElementById('receipt-total-units');
    const grandTotalEl = document.getElementById('receipt-grand-total');

    if (storeNameEl) storeNameEl.textContent = receiptData.storeName || this.settings.storeName || "Decent Motor Accessories";
    if (idEl) idEl.textContent = receiptData.checkoutId || "RCP-" + Date.now();
    
    const formattedDate = receiptData.dateStr || new Date().toLocaleDateString('en-IN');
    const formattedTime = receiptData.timeStr || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (datetimeEl) datetimeEl.textContent = `${formattedDate} • ${formattedTime}`;

    if (paymentBadgeEl) {
      const pm = (receiptData.paymentMethod || 'CASH').toUpperCase();
      paymentBadgeEl.textContent = pm === 'UPI' ? 'PAID VIA UPI' : 'PAID IN CASH';
      paymentBadgeEl.className = pm === 'UPI' 
        ? 'px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-900/60 text-blue-300 border border-blue-500/50'
        : 'px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-900/60 text-emerald-300 border border-emerald-500/50';
    }

    if (itemsTableBody && receiptData.items) {
      itemsTableBody.innerHTML = receiptData.items.map(item => `
        <tr class="border-b border-slate-800/80">
          <td class="py-2 text-left">
            <div class="font-bold text-slate-100 text-xs">${item.name || item.partName || 'Auto Part'}</div>
            <div class="font-mono text-[10px] text-slate-400">${item.partNumber || ''}</div>
          </td>
          <td class="py-2 text-center font-mono text-xs">${item.quantity}</td>
          <td class="py-2 text-right font-mono text-xs">${this.formatCurrency(item.unitPrice || item.sellingPrice || 0)}</td>
          <td class="py-2 text-right font-mono font-bold text-xs text-emerald-400">${this.formatCurrency(item.lineTotal || (item.quantity * (item.unitPrice || item.sellingPrice || 0)))}</td>
        </tr>
      `).join('');
    }

    const calculatedTotalUnits = receiptData.itemsCount !== undefined
      ? receiptData.itemsCount
      : (receiptData.items ? receiptData.items.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 0), 0) : 0);
    const calculatedGrandTotal = receiptData.totalAmount !== undefined
      ? receiptData.totalAmount
      : (receiptData.items ? receiptData.items.reduce((sum, i) => sum + (parseFloat(i.lineTotal) || ((parseInt(i.quantity, 10) || 0) * (parseFloat(i.unitPrice || i.sellingPrice) || 0))), 0) : 0);

    if (totalUnitsEl) totalUnitsEl.textContent = `${calculatedTotalUnits} units`;
    if (grandTotalEl) grandTotalEl.textContent = this.formatCurrency(calculatedGrandTotal);

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    try {
      if (window.lucide) lucide.createIcons();
    } catch (e) {}
  }

  closeReceiptModal() {
    const modal = document.getElementById('pos-receipt-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.currentCheckoutId = null;
    this.renderProducts();
    this.updateHeaderStats();
  }

  printReceipt() {
    window.print();
  }

  // Check if a part is designated for Upstairs storage (Floor 1 / Floor 2) vs Ground Floor
  isUpstairsPart(part) {
    if (!part) return false;
    const rack = (part.rackLocation || '').trim().toLowerCase();

    // Explicit Ground Floor / Counter indicators
    if (
      rack.includes('ground') ||
      rack.includes('counter') ||
      rack.includes('floor 0') ||
      rack.startsWith('gf') ||
      rack.includes('g-floor') ||
      rack.includes('g-0')
    ) {
      return false;
    }

    // Explicit Upstairs indicators (Floor 1, Floor 2, 1st, 2nd, Upstairs)
    if (
      rack.includes('floor 1') ||
      rack.includes('floor 2') ||
      rack.includes('1st') ||
      rack.includes('2nd') ||
      rack.includes('upstairs') ||
      rack.includes('f-1') ||
      rack.includes('f-2')
    ) {
      return true;
    }

    // If stock is allocated upstairs on Floor 1 or Floor 2
    if ((Number(part.stockFloor1) || 0) > 0 || (Number(part.stockFloor2) || 0) > 0) {
      return true;
    }

    // Default shelf naming like "Rack A-01" without ground is an upstairs warehouse rack
    if (rack.includes('rack') || rack.includes('shelf')) {
      return true;
    }

    return false;
  }

  // Boodmo Part Fitment Deep-Link
  // Opens boodmo.com pre-searched with the typed part number so the user can verify car compatibility
  openBoodmoLookup() {
    const partNumberInput = document.getElementById('form-part-number');
    const partNumber = partNumberInput ? partNumberInput.value.trim() : '';
    if (!partNumber || partNumber.length < 3) {
      this.showToast('Type a Part Number first to look it up on Boodmo.', 'info');
      return;
    }
    // Use Google site search since Boodmo's Angular router blocks/redirects direct search queries
    const boodmoUrl = `https://www.google.com/search?q=site:boodmo.com+${encodeURIComponent(partNumber)}`;
    window.open(boodmoUrl, '_blank', 'noopener,noreferrer');
    this.showToast(`Looking up "${partNumber}" on Boodmo via Google — check car fitment and come back to fill in Compatible Models.`, 'info');
    this.sound.playClick();
  }

  // Header Counters & Statistics
  updateHeaderStats() {
    const totalParts = this.products.length;
    const totalUnits = this.products.reduce((acc, p) => acc + this.inventoryManager.getTotalStock(p), 0);
    // Only count ground stock for UPSTAIRS parts (actual returned items sitting on counter)
    const totalGroundStash = this.products.reduce((acc, p) => {
      return this.isUpstairsPart(p) ? acc + (Number(p.stockGroundFloor) || 0) : acc;
    }, 0);
    const inStockCount = this.products.filter(p => this.inventoryManager.getTotalStock(p) > 0).length;
    const lowStockCount = this.products.filter(p => {
      const s = this.inventoryManager.getTotalStock(p);
      const minAlert = (p.minStockAlert !== undefined && p.minStockAlert !== null) ? Number(p.minStockAlert) : 1;
      return s > 0 && s <= minAlert;
    }).length;
    const outOfStockCount = this.products.filter(p => this.inventoryManager.getTotalStock(p) === 0).length;

    const pendingDefectiveClaims = this.storage.getDefectiveReturns().filter(c => c.status === 'pending_wholesaler');
    const pendingClaimsCount = pendingDefectiveClaims.reduce((acc, c) => acc + (c.quantity || 1), 0);

    // Header Counter Stash Badge
    const headerStashBadge = document.getElementById('ground-stash-header-badge');
    const elGroundStash = document.getElementById('ground-stash-count-num') || document.getElementById('header-ground-stash-count');
    const elClaimsBadge = document.getElementById('defective-pending-count') || document.getElementById('header-defective-claims-count');

    if (headerStashBadge) {
      if (totalGroundStash > 0) {
        headerStashBadge.classList.remove('hidden');
        headerStashBadge.classList.add('flex');
      } else {
        headerStashBadge.classList.add('hidden');
        headerStashBadge.classList.remove('flex');
      }
    }

    if (elGroundStash) elGroundStash.textContent = totalGroundStash;
    if (elClaimsBadge) elClaimsBadge.textContent = pendingClaimsCount;

    // Navigation Tab Badges
    const navClaimsBadge = document.getElementById('nav-defective-pending-count');
    if (navClaimsBadge) {
      navClaimsBadge.textContent = pendingClaimsCount;
      if (pendingClaimsCount > 0) {
        navClaimsBadge.classList.remove('hidden');
        navClaimsBadge.classList.add('inline-block');
      } else {
        navClaimsBadge.classList.add('hidden');
        navClaimsBadge.classList.remove('inline-block');
      }
    }

    // Status Filter Tab Counters
    const tabAllCount = document.getElementById('tab-count-all');
    const tabGroundCount = document.getElementById('tab-count-stash') || document.getElementById('tab-count-ground-stash');
    const tabDefectiveCount = document.getElementById('tab-count-defective');
    const tabInStockCount = document.getElementById('tab-count-in');
    const tabLowStockCount = document.getElementById('tab-count-low') || document.getElementById('tab-count-low-stock');
    const tabOutStockCount = document.getElementById('tab-count-out') || document.getElementById('tab-count-out-stock');

    if (tabAllCount) tabAllCount.textContent = totalParts;
    if (tabGroundCount) tabGroundCount.textContent = totalGroundStash;
    if (tabDefectiveCount) tabDefectiveCount.textContent = pendingClaimsCount;
    if (tabInStockCount) tabInStockCount.textContent = inStockCount;
    if (tabLowStockCount) tabLowStockCount.textContent = lowStockCount;
    if (tabOutStockCount) tabOutStockCount.textContent = outOfStockCount;

    // Today's Sales Counter (Robust Timezone-Aware Matching)
    const today = new Date();
    const todaySales = this.outflowLog.filter(s => this.isMatchingOutflowDate(s.dateStr || s.timestamp, today));
    const todayTotalRevenue = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
    const todayItemCount = todaySales.reduce((acc, s) => acc + (s.quantity || 0), 0);

    const elTodaySales = document.getElementById('header-today-sales-count');
    const elTodayRev = document.getElementById('header-today-revenue');
    const navTodayRev = document.getElementById('nav-today-revenue');

    if (elTodaySales) elTodaySales.textContent = `${todayItemCount} pcs sold today`;
    if (elTodayRev) elTodayRev.textContent = this.formatCurrency(todayTotalRevenue);
    if (navTodayRev) navTodayRev.textContent = this.formatCurrency(todayTotalRevenue);
  }

  // Robust locale-agnostic and timezone-aware calendar date comparison
  isMatchingOutflowDate(recordDateStr, targetDate = new Date()) {
    if (!recordDateStr) return false;
    const str = String(recordDateStr).trim();
    if (!str) return false;

    // 1. Direct locale matches
    if (str === targetDate.toLocaleDateString()) return true;
    if (str === targetDate.toLocaleDateString('en-IN')) return true;
    if (str === targetDate.toLocaleDateString('en-GB')) return true;
    if (str === targetDate.toLocaleDateString('en-US')) return true;

    const timeZone = 'Asia/Kolkata';
    let targetYMD;
    try {
      targetYMD = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(targetDate);
    } catch (e) {
      targetYMD = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    }
    const [tY, tM, tD] = targetYMD.split('-').map(Number);

    // 2. ISO format YYYY-MM-DD or full timestamp
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      if (str.includes('T')) {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          try {
            const recYMD = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
            return recYMD === targetYMD;
          } catch (e) {}
        }
      }
      return Number(isoMatch[1]) === tY && Number(isoMatch[2]) === tM && Number(isoMatch[3]) === tD;
    }

    // 3. Delimited D/M/Y or M/D/Y (e.g. 2/11/2026, 02/11/2026, 11/2/2026)
    const slashMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slashMatch) {
      const p1 = Number(slashMatch[1]);
      const p2 = Number(slashMatch[2]);
      const pYear = Number(slashMatch[3]);
      if (pYear !== tY) return false;
      // D/M/Y (Indian standard: p1=day, p2=month)
      if (p1 === tD && p2 === tM) return true;
      // M/D/Y (US locale standard: p1=month, p2=day)
      if (p1 === tM && p2 === tD) return true;
    }

    // 4. Fallback timestamp attempt
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      try {
        const recYMD = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
        return recYMD === targetYMD;
      } catch (e) {}
    }
    return false;
  }

  // Compact Single-Row Horizontal Brand Chips Ribbon
  renderBrandChips() {
    const container = document.getElementById('brand-chips-container');
    if (!container) return;

    const chipsHtml = this.vehicleBrands.map(brand => {
      const isSelected = this.selectedBrand.toLowerCase() === brand.id.toLowerCase();
      const badgeHtml = this.getBrandBadgeHtml(brand, isSelected);
      return `
        <button 
          data-brand-id="${brand.id}" 
          class="brand-chip btn-touch flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 cursor-pointer ${
            isSelected 
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20' 
              : 'bg-slate-900/80 text-slate-300 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
          }"
        >
          ${badgeHtml}
          <span>${brand.name}</span>
        </button>
      `;
    }).join('');

    const addBtnHtml = `
      <button 
        id="btn-quick-manage-brands" 
        class="btn-touch flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-dashed border-amber-500/50 bg-amber-950/20 hover:bg-amber-950/50 text-amber-300 shadow-sm shrink-0 cursor-pointer"
        title="Add new car brand / manufacturer (e.g. Mahindra, Tata, Kia)"
      >
        <i data-lucide="plus" class="w-3.5 h-3.5 text-amber-400"></i>
        <span class="hidden sm:inline">Add Brand</span>
      </button>
    `;

    container.innerHTML = chipsHtml + addBtnHtml;
    if (window.lucide) lucide.createIcons();
  }

  // Compact Single-Row Horizontal Category Chips Ribbon
  renderCategoryChips() {
    const container = document.getElementById('category-chips-container');
    if (!container) return;

    const chipsHtml = this.categories.map(cat => {
      const isSelected = this.selectedCategory.toLowerCase() === cat.id.toLowerCase();
      const iconHtml = this.getCategoryBadgeHtml(cat, isSelected);
      return `
        <button 
          data-cat-id="${cat.id}" 
          class="cat-chip btn-touch flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border shrink-0 cursor-pointer ${
            isSelected 
              ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20' 
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
          }"
        >
          ${iconHtml}
          <span>${cat.name}</span>
        </button>
      `;
    }).join('');

    const addBtnHtml = `
      <button 
        id="btn-quick-manage-categories" 
        class="btn-touch flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-dashed border-blue-500/50 bg-blue-950/20 hover:bg-blue-950/50 text-blue-300 shadow-sm shrink-0 cursor-pointer"
        title="Add new auto part category (e.g. Engine Oils, Sensors, AC)"
      >
        <i data-lucide="plus" class="w-3.5 h-3.5 text-blue-400"></i>
        <span class="hidden sm:inline">Add Category</span>
      </button>
    `;

    container.innerHTML = chipsHtml + addBtnHtml;
    if (window.lucide) lucide.createIcons();
  }

  // Sub-Category Quick-Pills Ribbon
  renderSubCategoryChips() {
    const wrapper = document.getElementById('subcategory-wrapper');
    const container = document.getElementById('subcategory-chips-container');
    const breadcrumb = document.getElementById('active-drilldown-breadcrumb');
    if (!wrapper || !container || !breadcrumb) return;

    if (this.selectedCategory === 'all') {
      wrapper.classList.add('hidden');
      wrapper.classList.remove('flex');
      return;
    }

    const catKey = this.selectedCategory.toLowerCase();
    const subList = SUB_CATEGORIES_CONFIG[catKey];
    if (!subList || subList.length === 0) {
      wrapper.classList.add('hidden');
      wrapper.classList.remove('flex');
      return;
    }

    wrapper.classList.remove('hidden');
    wrapper.classList.add('flex');

    const brandObj = this.vehicleBrands.find(b => b.id.toLowerCase() === this.selectedBrand.toLowerCase());
    const brandName = brandObj ? brandObj.name : "All Brands";
    const catObj = this.categories.find(c => c.id.toLowerCase() === this.selectedCategory.toLowerCase());
    const catName = catObj ? catObj.name : this.selectedCategory;

    let subCatName = "All Types";
    if (this.selectedSubCategory !== 'all') {
      const subObj = subList.find(s => s.id === this.selectedSubCategory);
      if (subObj) subCatName = subObj.name;
    }

    // Breadcrumb HTML
    breadcrumb.innerHTML = `
      <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-bold">${brandName}</span>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-500"></i>
      <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-blue-300 font-bold">${catName}</span>
      <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-500"></i>
      <span class="px-2 py-0.5 rounded ${this.selectedSubCategory !== 'all' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black' : 'bg-slate-900 text-slate-400 font-semibold'}">
        ${subCatName}
      </span>
      ${this.selectedSubCategory !== 'all' ? `
        <button id="btn-clear-subcategory" class="ml-1 text-slate-400 hover:text-rose-400 text-xs flex items-center gap-0.5" title="Clear specific type">
          <i data-lucide="x-circle" class="w-3.5 h-3.5"></i>
          <span>Clear</span>
        </button>
      ` : ''}
    `;

    // Wrapped Multi-Line Chips
    const allIsSelected = this.selectedSubCategory === 'all';
    let chipsHtml = `
      <button 
        data-subcat-id="all" 
        class="subcat-chip btn-touch flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
          allIsSelected 
            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm' 
            : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
        }"
      >
        <span>All ${catName}</span>
      </button>
    `;

    chipsHtml += subList.map(sub => {
      const isSelected = this.selectedSubCategory === sub.id;
      return `
        <button 
          data-subcat-id="${sub.id}" 
          class="subcat-chip btn-touch flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
            isSelected 
              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md shadow-amber-500/20' 
              : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-amber-300'
          }"
        >
          <i data-lucide="${sub.icon || 'tag'}" class="w-3 h-3 ${isSelected ? 'text-slate-950' : 'text-amber-400'}"></i>
          <span>${sub.name}</span>
        </button>
      `;
    }).join('');

    container.innerHTML = chipsHtml;
    if (window.lucide) lucide.createIcons();
  }

  // Sub-Category Question Drilldown Modal
  openSubcategoryModal(catId = null) {
    const targetCatId = catId || this.selectedCategory;
    if (!targetCatId || targetCatId === 'all') return;

    const catKey = targetCatId.toLowerCase();
    const subList = SUB_CATEGORIES_CONFIG[catKey];
    if (!subList || subList.length === 0) return;

    const modal = document.getElementById('subcategory-modal');
    const modalTitle = document.getElementById('subcategory-modal-title');
    const brandTag = document.getElementById('subcategory-modal-brand-tag');
    const badgeEl = document.getElementById('subcategory-modal-badge');
    const gridEl = document.getElementById('subcategory-modal-options-grid');
    if (!modal || !gridEl) return;

    const brandObj = this.vehicleBrands.find(b => b.id.toLowerCase() === this.selectedBrand.toLowerCase());
    const brandName = brandObj ? brandObj.name : "All Brands";
    const catObj = this.categories.find(c => c.id.toLowerCase() === targetCatId.toLowerCase());
    const catName = catObj ? catObj.name : targetCatId;

    if (modalTitle) modalTitle.textContent = `Which ${catName}?`;
    if (brandTag) brandTag.textContent = brandName;
    if (badgeEl && catObj) {
      badgeEl.innerHTML = this.getCategoryBadgeHtml(catObj, true);
    }

    gridEl.innerHTML = subList.map(sub => {
      const matchingProducts = this.products.filter(p => {
        // 1. Filter by target Category
        const partCat = (p.category || '').toLowerCase();
        const catKey = targetCatId.toLowerCase();
        const catObj = this.categories.find(c => c.id.toLowerCase() === catKey);
        const catName = catObj ? catObj.name.toLowerCase() : catKey;
        if (partCat !== catName && !partCat.includes(catName) && !catName.includes(partCat)) {
          return false;
        }

        // 2. Filter by Vehicle Brand (if selected)
        if (this.selectedBrand !== 'all') {
          const pBrand = (p.vehicleBrand || '').toLowerCase();
          const bName = brandName.toLowerCase();
          if (pBrand !== bName && !pBrand.includes(bName) && !bName.includes(pBrand) && pBrand !== 'universal') {
            return false;
          }
        }

        // 3. Match Sub-Category
        const matchesSubId = (p.subCategory || '').toLowerCase() === sub.id.toLowerCase();
        const targetText = `${p.name} ${p.partNumber} ${p.category} ${(p.compatibleModels || []).join(' ')}`.toLowerCase();
        const matchesKeywords = (sub.keywords || []).some(kw => targetText.includes(kw.toLowerCase()));
        return matchesSubId || matchesKeywords;
      });

      const productCount = matchingProducts.length;
      const totalUnits = matchingProducts.reduce((acc, p) => acc + this.inventoryManager.getTotalStock(p), 0);

      const badgeHtml = productCount === 0
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-950 text-slate-500 border border-slate-800">0 Available</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/40">${productCount} ${productCount === 1 ? 'Product' : 'Products'} (${totalUnits} pcs)</span>`;

      return `
        <button 
          class="btn-select-subcat-option btn-touch p-3.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700/80 hover:border-amber-400 text-left transition-all flex items-center justify-between group shadow-md"
          data-subcat-id="${sub.id}"
        >
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i data-lucide="${sub.icon || 'tag'}" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="font-black text-slate-100 text-sm group-hover:text-amber-300">${sub.name}</div>
              <div class="text-[11px] text-slate-400 leading-tight">${sub.desc || ''}</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            ${badgeHtml}
          </div>
        </button>
      `;
    }).join('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeSubcategoryModal() {
    const modal = document.getElementById('subcategory-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  selectSubCategory(subCatId) {
    this.sound.playClick();
    this.selectedSubCategory = subCatId;
    this.closeSubcategoryModal();
    this.renderSubCategoryChips();
    this.renderProducts();

    const catKey = this.selectedCategory.toLowerCase();
    const subList = SUB_CATEGORIES_CONFIG[catKey] || [];
    const subObj = subList.find(s => s.id === subCatId);
    if (subObj) {
      this.showToast(`Filtered by: ${subObj.name}`, "success");
    }
  }

  // Clear Filters Controller
  updateClearFilterButtonsVisibility() {
    const topClearBtn = document.getElementById('clear-all-filters-top-btn');
    if (!topClearBtn) return;

    const hasActiveFilters = Boolean(
      this.searchQuery.trim().length > 0 ||
      this.selectedBrand !== "all" ||
      this.selectedCategory !== "all" ||
      this.selectedSubCategory !== "all" ||
      this.selectedStatusTab !== "all"
    );

    if (hasActiveFilters) {
      topClearBtn.classList.remove('hidden');
      topClearBtn.classList.add('flex');
    } else {
      topClearBtn.classList.add('hidden');
      topClearBtn.classList.remove('flex');
    }
  }

  clearAllFilters() {
    this.sound.playClick();
    this.searchQuery = "";
    this.selectedBrand = "all";
    this.selectedCategory = "all";
    this.selectedSubCategory = "all";
    this.selectedStatusTab = "all";

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = "";

    const statusTabs = document.querySelectorAll('.status-tab-btn');
    statusTabs.forEach(t => {
      if (t.dataset.tab === 'all') {
        t.classList.add('active', 'border-amber-400', 'text-amber-400', 'bg-amber-950/40');
        t.classList.remove('text-slate-400', 'border-transparent');
      } else {
        t.classList.remove('active', 'border-amber-400', 'text-amber-400', 'bg-amber-950/40');
        t.classList.add('text-slate-400', 'border-transparent');
      }
    });

    this.renderBrandChips();
    this.renderCategoryChips();
    this.renderSubCategoryChips();
    this.renderProducts();
    this.updateHeaderStats();
    this.updateClearFilterButtonsVisibility();
    this.showToast("All filters reset — showing full inventory", "success");
  }

  renderProducts() {
    this.inventoryManager.renderProducts();
  }

  // Barcode Scan Handler (Phase 4: With Strict Price & Quantity Integrity)
  handleBarcodeScanned(barcode, source = 'Scanner') {
    if (!this.canModifyCart()) return;
    if (!barcode) return;
    const cleanCode = barcode.trim();
    if (!cleanCode) return;

    // Prevent accidental hardware scanner debounce / double-event bounces (< 250ms)
    const now = Date.now();
    if (this.lastScannedBarcode === cleanCode && (now - this.lastScanTime < 250)) {
      console.warn(`[Scanner] Ignored bounce duplicate scan for "${cleanCode}" within ${now - this.lastScanTime}ms`);
      return;
    }
    this.lastScannedBarcode = cleanCode;
    this.lastScanTime = now;

    // 1. Identify product from catalog by barcode or part number (case-insensitive)
    const matchedPart = this.products.find(p =>
      (p.barcode && p.barcode.toLowerCase() === cleanCode.toLowerCase()) ||
      (p.partNumber && p.partNumber.toLowerCase() === cleanCode.toLowerCase())
    );

    // 2. Product not found: show clear error message, play warning beep, do NOT add to cart
    if (!matchedPart) {
      this.sound.playWarningBeep();
      this.showToast(`Unrecognized Barcode "${cleanCode}". Part not found in catalog!`, "error");
      return;
    }

    // 3. Check physical stock across all floors: if zero available stock, reject with clear message
    const totalStock = Math.max(0, parseInt(this.inventoryManager.getTotalStock(matchedPart), 10) || 0);
    if (totalStock <= 0) {
      this.sound.playWarningBeep();
      this.showToast(`Out of Stock! "${matchedPart.name}" has 0 units available across all floors.`, "warning");
      return;
    }

    // 4. Validate Selling-Price Integrity (Task 3: Reject missing, null, empty, non-numeric, <= 0 prices)
    const priceVal = this.validateSellingPrice(matchedPart.sellingPrice);
    if (!priceVal.isValid) {
      this.sound.playWarningBeep();
      this.showToast(`Cannot add "${matchedPart.name}" to cart: Invalid selling price (${priceVal.reason}). Please set valid price in catalog.`, "error");
      return;
    }
    const validPrice = priceVal.price;

    // 5. In-Memory Cart Addition: repeated scans increase quantity rather than creating duplicate rows
    const existingItemIndex = this.cart.findIndex(i => i.id === matchedPart.id);
    const currentQtyInCart = existingItemIndex >= 0 ? this.sanitizeQuantity(this.cart[existingItemIndex].quantity) : 0;

    if (currentQtyInCart + 1 > totalStock) {
      this.sound.playWarningBeep();
      this.showToast(`Stock limit reached! Cannot add more "${matchedPart.name}" (Available: ${totalStock}, In Cart: ${currentQtyInCart}).`, "warning");
      this.openCartDrawer();
      return;
    }

    if (existingItemIndex >= 0) {
      const newQty = currentQtyInCart + 1;
      this.cart[existingItemIndex].quantity = newQty;
      this.cart[existingItemIndex].sellingPrice = validPrice;
      this.cart[existingItemIndex].itemTotal = Math.round(newQty * validPrice * 100) / 100;
    } else {
      this.cart.push({
        id: matchedPart.id,
        part: matchedPart,
        quantity: 1,
        sellingPrice: validPrice,
        itemTotal: validPrice
      });
    }

    // 6. Update and display cart drawer immediately
    this.renderCartDrawer();
    this.openCartDrawer();
    this.sound.playClick();

    // 7. Provide clear, non-intrusive feedback
    const updatedItem = this.cart.find(i => i.id === matchedPart.id);
    const qtyInCart = updatedItem ? updatedItem.quantity : 1;

    if (this.scannerEngine && this.scannerEngine.showLastScannedFeedback) {
      this.scannerEngine.showLastScannedFeedback(matchedPart, qtyInCart, 'cart');
    }
    this.showToast(`[${source}] Added to Cart: ${matchedPart.name} (${qtyInCart}x in cart)`, "success");
  }

  // Voice Search Handler
  handleVoiceSearchResult(normalizedText, rawTranscript) {
    this.searchQuery = normalizedText;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = normalizedText;
    this.sound.playSaleChime();
    this.showToast(`Voice Search: "${normalizedText}"`, "info");
    this.renderProducts();
  }

  handleVoiceSearchState(isListening, error) {
    const voiceBtn = document.getElementById('voice-search-btn');
    if (!voiceBtn) return;

    if (isListening) {
      voiceBtn.classList.add('bg-rose-600', 'text-white', 'animate-pulse');
      voiceBtn.classList.remove('bg-slate-800', 'text-slate-300');
    } else {
      voiceBtn.classList.remove('bg-rose-600', 'text-white', 'animate-pulse');
      voiceBtn.classList.add('bg-slate-800', 'text-slate-300');
      if (error && error !== 'no-speech') {
        this.showToast(`Voice error: ${error}`, "warning");
      }
    }
  }

  // Print Barcode Modal
  openBarcodePrintModal(partId, initialQty = 1) {
    this.sound.playClick();
    const part = this.products.find(p => p.id === partId);
    if (!part) return;

    this.printingPart = part;
    const modal = document.getElementById('print-barcode-modal');
    if (!modal) return;

    const qtyInput = document.getElementById('print-label-qty');
    if (qtyInput) qtyInput.value = initialQty || 1;

    this.barcodeEngine.renderStickersPreview(this.printingPart);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeBarcodePrintModal() {
    const modal = document.getElementById('print-barcode-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.printingPart = null;
  }

  // ================= BATCH PRINTING ENGINE & QUEUE CONTROLLER =================
  isPartInBatch(partId) {
    return this.batchPrintQueue.has(partId);
  }

  getBatchItemsList() {
    return Array.from(this.batchPrintQueue.values());
  }

  getBatchTotalStickersCount() {
    let total = 0;
    for (let item of this.batchPrintQueue.values()) {
      total += Math.max(1, parseInt(item.quantity, 10) || 1);
    }
    return total;
  }

  toggleBatchSelectPart(partId, initialQty = 1) {
    const part = this.products.find(p => p.id === partId);
    if (!part) return;

    if (this.batchPrintQueue.has(partId)) {
      this.batchPrintQueue.delete(partId);
      this.sound.playClick();
      this.showToast(`Removed "${part.name}" from Batch Print queue`, "info");
    } else {
      this.batchPrintQueue.set(partId, { part, quantity: initialQty || 1 });
      this.sound.playClick();
      this.showToast(`Added "${part.name}" to Batch Print queue (${this.batchPrintQueue.size} in batch)`, "success");
    }

    this.updateBatchFloatingBar();
    this.renderProducts();

    const batchModal = document.getElementById('batch-print-modal');
    if (batchModal && !batchModal.classList.contains('hidden')) {
      this.renderBatchModalList();
      this.renderBatchStickersPreview();
    }
  }

  addToBatchPrint(partId, qty = 1) {
    const part = this.products.find(p => p.id === partId);
    if (!part) return;

    const existing = this.batchPrintQueue.get(partId);
    const newQty = existing ? existing.quantity + qty : qty;
    this.batchPrintQueue.set(partId, { part, quantity: newQty });
    this.sound.playClick();
    this.showToast(`Added "${part.name}" (${newQty} stickers) to Batch Queue`, "success");

    this.updateBatchFloatingBar();
    this.renderProducts();

    const batchModal = document.getElementById('batch-print-modal');
    if (batchModal && !batchModal.classList.contains('hidden')) {
      this.renderBatchModalList();
      this.renderBatchStickersPreview();
    }
  }

  removeFromBatchPrint(partId) {
    const item = this.batchPrintQueue.get(partId);
    const name = item ? item.part.name : 'Product';
    this.batchPrintQueue.delete(partId);
    this.sound.playClick();
    this.showToast(`Removed "${name}" from Batch Queue`, "info");

    this.updateBatchFloatingBar();
    this.renderProducts();

    const batchModal = document.getElementById('batch-print-modal');
    if (batchModal && !batchModal.classList.contains('hidden')) {
      this.renderBatchModalList();
      this.renderBatchStickersPreview();
    }
  }

  updateBatchPrintQty(partId, qty) {
    const item = this.batchPrintQueue.get(partId);
    if (!item) return;

    item.quantity = Math.max(1, parseInt(qty, 10) || 1);
    this.updateBatchFloatingBar();
    this.renderBatchStickersPreview();
  }

  setAllBatchQuantities(qty) {
    const targetQty = Math.max(1, parseInt(qty, 10) || 1);
    for (let item of this.batchPrintQueue.values()) {
      item.quantity = targetQty;
    }
    this.sound.playClick();
    this.showToast(`Set all batch items to ${targetQty} sticker(s) each`, "info");
    this.updateBatchFloatingBar();
    this.renderBatchModalList();
    this.renderBatchStickersPreview();
  }

  selectAllFilteredParts() {
    const filtered = this.inventoryManager.getFilteredProducts();
    if (filtered.length === 0) {
      this.showToast("No visible parts to select!", "warning");
      return;
    }

    filtered.forEach(part => {
      if (!this.batchPrintQueue.has(part.id)) {
        this.batchPrintQueue.set(part.id, { part, quantity: 1 });
      }
    });

    this.sound.playSaleChime();
    this.showToast(`Selected ${filtered.length} parts for Batch Printing (${this.batchPrintQueue.size} in batch)!`, "success");
    this.updateBatchFloatingBar();
    this.renderProducts();

    const batchModal = document.getElementById('batch-print-modal');
    if (batchModal && !batchModal.classList.contains('hidden')) {
      this.renderBatchModalList();
      this.renderBatchStickersPreview();
    }
  }

  clearBatchPrintQueue() {
    this.batchPrintQueue.clear();
    this.sound.playClick();
    this.showToast("Batch Print Queue cleared", "info");
    this.updateBatchFloatingBar();
    this.renderProducts();

    const batchModal = document.getElementById('batch-print-modal');
    if (batchModal && !batchModal.classList.contains('hidden')) {
      this.renderBatchModalList();
      this.renderBatchStickersPreview();
    }
  }

  updateBatchFloatingBar() {
    const count = this.batchPrintQueue.size;
    const totalStickers = this.getBatchTotalStickersCount();

    const dock = document.getElementById('batch-action-bar');
    const headerCountBadge = document.getElementById('header-batch-print-count');
    const dockSelectedCount = document.getElementById('batch-dock-selected-count');
    const dockStickersCount = document.getElementById('batch-dock-stickers-count');
    const dockPrintText = document.getElementById('btn-dock-print-text');

    if (headerCountBadge) {
      headerCountBadge.textContent = count;
      if (count > 0) {
        headerCountBadge.classList.remove('bg-slate-700');
        headerCountBadge.classList.add('bg-blue-600', 'animate-pulse');
      } else {
        headerCountBadge.classList.add('bg-slate-700');
        headerCountBadge.classList.remove('bg-blue-600', 'animate-pulse');
      }
    }

    if (dock) {
      if (count > 0) {
        dock.classList.remove('hidden');
        dock.classList.add('flex');
      } else {
        dock.classList.add('hidden');
        dock.classList.remove('flex');
      }
    }

    if (dockSelectedCount) {
      dockSelectedCount.textContent = `${count} Part${count === 1 ? '' : 's'} Selected`;
    }

    if (dockStickersCount) {
      dockStickersCount.textContent = `${totalStickers} Sticker${totalStickers === 1 ? '' : 's'}`;
    }

    if (dockPrintText) {
      dockPrintText.textContent = `Review & Print Batch (${count})`;
    }
  }

  openBatchPrintModal() {
    this.sound.playClick();
    const modal = document.getElementById('batch-print-modal');
    if (!modal) return;

    this.renderBatchModalList();
    this.renderBatchStickersPreview();

    // Reset in-modal search input
    const searchInput = document.getElementById('batch-search-add-input');
    const suggestions = document.getElementById('batch-search-suggestions');
    if (searchInput) searchInput.value = '';
    if (suggestions) {
      suggestions.innerHTML = '';
      suggestions.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeBatchPrintModal() {
    const modal = document.getElementById('batch-print-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  renderBatchModalList() {
    const container = document.getElementById('batch-queue-items-list');
    const countLabel = document.getElementById('batch-items-count-label');
    const headerBadge = document.getElementById('batch-modal-header-badge');
    const totalCount = this.batchPrintQueue.size;
    const totalStickers = this.getBatchTotalStickersCount();

    if (countLabel) countLabel.textContent = `Queue (${totalCount} Products • ${totalStickers} Stickers)`;
    if (headerBadge) headerBadge.textContent = `${totalCount} Products (${totalStickers} Box Stickers)`;

    if (!container) return;

    if (totalCount === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 bg-slate-900/60 rounded-xl border border-slate-800">
          <i data-lucide="layers" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
          <div class="text-sm font-bold text-slate-200">Your Batch Print Queue is Empty</div>
          <p class="text-xs text-slate-400 mt-1">Use the search bar above or check products on cards to add items.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const items = this.getBatchItemsList();
    container.innerHTML = items.map(item => {
      const part = item.part;
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const cipherCode = this.barcodeEngine.encodeCostToCipher(part.costPrice);
      const brandObj = this.vehicleBrands.find(b => b.name.toLowerCase() === (part.vehicleBrand || '').toLowerCase() || b.id.toLowerCase() === (part.vehicleBrand || '').toLowerCase()) || { id: part.vehicleBrand, name: part.vehicleBrand };
      const brandLogoHtml = this.getBrandBadgeHtml(brandObj, false, 'xs');

      return `
        <div class="batch-queue-row p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 flex items-center justify-between gap-3 transition-all" data-part-id="${part.id}">
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-amber-300 border border-slate-700">
                ${brandLogoHtml}
                <span>${part.vehicleBrand}</span>
              </span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-950/70 text-blue-300 border border-blue-800/40">
                ${part.partNumber}
              </span>
              <span class="text-[10px] text-slate-400 font-bold">📍 ${part.rackLocation || 'Rack A-01'}</span>
            </div>

            <div class="font-black text-slate-100 text-xs md:text-sm truncate mt-1">
              ${part.name}
            </div>

            <div class="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
              <span class="text-emerald-400 font-bold">₹ ${(part.sellingPrice || 0).toLocaleString('en-IN')}</span>
              <span>•</span>
              <span class="text-slate-500">Cipher: [ ${cipherCode} ]</span>
            </div>
          </div>

          <!-- Quantity Stepper & Remove Action -->
          <div class="flex items-center gap-2 shrink-0">
            <div class="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
              <button class="btn-batch-qty-minus w-7 h-7 flex items-center justify-center text-slate-300 hover:bg-slate-800 font-bold text-xs" data-part-id="${part.id}">-</button>
              <input type="number" class="batch-qty-input w-10 text-center font-bold font-mono bg-transparent text-slate-100 text-xs focus:outline-none" value="${qty}" min="1" max="100" data-part-id="${part.id}" />
              <button class="btn-batch-qty-plus w-7 h-7 flex items-center justify-center text-slate-300 hover:bg-slate-800 font-bold text-xs" data-part-id="${part.id}">+</button>
            </div>

            <button class="btn-batch-remove-item p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/80 text-rose-400 hover:text-rose-200 border border-rose-800/40 transition-all" data-part-id="${part.id}" title="Remove from batch">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  renderBatchStickersPreview() {
    const items = this.getBatchItemsList();
    this.barcodeEngine.renderBatchStickersPreview(items, 'batch-stickers-render-area');

    const printBtnText = document.getElementById('btn-trigger-batch-print-text');
    const totalStickers = this.getBatchTotalStickersCount();
    if (printBtnText) {
      printBtnText.textContent = `PRINT ALL ${totalStickers} STICKER${totalStickers === 1 ? '' : 'S'} IN ONE GO`;
    }
  }

  printBatchDirectly() {
    const items = this.getBatchItemsList();
    if (items.length === 0) {
      this.sound.playWarningBeep();
      this.showToast("Cannot print empty batch! Please select parts first.", "warning");
      return;
    }

    const totalStickers = this.getBatchTotalStickersCount();
    this.barcodeEngine.printBatchStickersDirectly(items, 'batch-label');
    this.sound.playSaleChime();
    this.showToast(`🖨️ Streaming ${totalStickers} box stickers for ${items.length} products to printer!`, "success");
  }

  // Ground Floor Counter Stash Modal (Problem 2)
  openGroundStashModal() {
    this.sound.playClick();
    const modal = document.getElementById('ground-stash-modal');
    const container = document.getElementById('ground-stash-items-list') || document.getElementById('ground-stash-tbody');
    const totalEl = document.getElementById('ground-stash-modal-total');
    if (!modal) return;

    const stashParts = this.products.filter(p => this.isUpstairsPart(p) && (Number(p.stockGroundFloor) || 0) > 0);
    const totalUnits = stashParts.reduce((acc, p) => acc + (Number(p.stockGroundFloor) || 0), 0);

    if (totalEl) totalEl.textContent = `${totalUnits} Returned Items Waiting on Counter`;

    if (container) {
      if (stashParts.length === 0) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
            <i data-lucide="check-circle" class="w-10 h-10 mx-auto mb-2 text-emerald-400"></i>
            <div class="text-sm font-bold text-slate-200">Ground Floor Counter is Clean!</div>
            <div class="text-xs text-slate-500 mt-0.5">No customer-returned parts waiting on ground floor.</div>
          </div>
        `;
      } else {
        container.innerHTML = stashParts.map(p => `
          <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-3 transition-all">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-black text-slate-100 text-sm truncate">${p.name}</span>
                <span class="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs shrink-0">
                  ${p.stockGroundFloor} pcs on counter
                </span>
              </div>
              <div class="text-xs text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                <span>SKU: ${p.partNumber}</span>
                <span>•</span>
                <span class="text-amber-400 font-bold">Rack: ${p.rackLocation || 'Floor 1 - Rack A-01'}</span>
                <span>•</span>
                <span class="text-emerald-400 font-bold">${this.formatCurrency(p.sellingPrice)}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button 
                class="btn-stash-sell btn-touch px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-md flex items-center gap-1"
                data-part-id="${p.id}"
              >
                <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                <span>Sell Now</span>
              </button>
              <button 
                class="btn-stash-transfer btn-touch px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                data-part-id="${p.id}"
                title="Carry item back upstairs to its designated rack"
              >
                <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
                <span>Carry Upstairs</span>
              </button>
            </div>
          </div>
        `).join('');

        container.querySelectorAll('.btn-stash-sell').forEach(btn => {
          btn.addEventListener('click', () => {
            this.inventoryManager.sellPart(btn.dataset.partId, 1);
            this.openGroundStashModal();
          });
        });

        container.querySelectorAll('.btn-stash-transfer').forEach(btn => {
          btn.addEventListener('click', () => {
            this.returnsManager.transferToUpstairs(btn.dataset.partId);
            this.openGroundStashModal();
          });
        });
      }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeGroundStashModal() {
    const modal = document.getElementById('ground-stash-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  transferAllStashUpstairs() {
    const stashParts = this.products.filter(p => this.isUpstairsPart(p) && (Number(p.stockGroundFloor) || 0) > 0);
    if (stashParts.length === 0) {
      this.showToast("No upstairs returned items currently waiting on ground floor counter.", "info");
      return;
    }

    let movedCount = 0;
    stashParts.forEach(p => {
      const qty = Number(p.stockGroundFloor) || 0;
      const isFloor2 = (p.rackLocation || '').toLowerCase().includes('floor 2') || (p.rackLocation || '').toLowerCase().includes('2nd');
      if (isFloor2) {
        p.stockFloor2 = (Number(p.stockFloor2) || 0) + qty;
      } else {
        p.stockFloor1 = (Number(p.stockFloor1) || 0) + qty;
      }
      p.stockGroundFloor = 0;
      movedCount += qty;
    });

    const affectedIds = groundParts.map(p => p.id);
    this.saveProducts(affectedIds.length > 0 ? affectedIds : null);
    this.sound.playTransferChime();
    this.showToast(`Restocked all ${movedCount} returned items from ground counter to their upstairs racks!`, "success");
    this.renderProducts();
    this.updateHeaderStats();
    this.openGroundStashModal();
  }

  // Daily Outflow Ledger Modal (Problem 1)
  openDailyOutflowModal(dateFilter = 'today') {
    this.sound.playClick();
    const modal = document.getElementById('daily-outflow-modal');
    if (!modal) return;

    this.renderOutflowTableWithFilter(dateFilter);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeDailyOutflowModal() {
    const modal = document.getElementById('daily-outflow-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  renderOutflowTableWithFilter(dateFilter = 'today') {
    this.currentOutflowFilter = dateFilter;
    const tbody = document.getElementById('outflow-log-tbody');
    const totalEl = document.getElementById('modal-outflow-total-rev') || document.getElementById('modal-today-revenue');
    const totalItemsEl = document.getElementById('modal-outflow-total-items') || document.getElementById('modal-today-units');
    const totalCountEl = document.getElementById('modal-outflow-total-count');

    this.outflowLog = this.storage.getOutflows();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    let filtered = this.outflowLog;
    if (dateFilter === 'today') {
      filtered = this.outflowLog.filter(l => this.isMatchingOutflowDate(l.dateStr || l.timestamp, today));
    } else if (dateFilter === 'yesterday') {
      filtered = this.outflowLog.filter(l => this.isMatchingOutflowDate(l.dateStr || l.timestamp, yesterday));
    }

    const totalRevenue = filtered.reduce((acc, l) => acc + (Number(l.totalAmount) || 0), 0);
    const totalUnits = filtered.reduce((acc, l) => acc + (Number(l.quantity) || 1), 0);

    if (totalEl) totalEl.textContent = this.formatCurrency(totalRevenue);
    if (totalItemsEl) totalItemsEl.textContent = `${totalUnits} pcs`;
    if (totalCountEl) totalCountEl.textContent = `${filtered.length} sales`;

    // Highlight active filter button
    document.querySelectorAll('.outflow-date-filter-btn').forEach(btn => {
      if (btn.dataset.filter === dateFilter) {
        btn.className = "outflow-date-filter-btn px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs";
      } else {
        btn.className = "outflow-date-filter-btn px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs";
      }
    });

    if (tbody) {
      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="p-8 text-center text-slate-400">
              <i data-lucide="book-open" class="w-10 h-10 mx-auto mb-2 text-slate-600"></i>
              <div class="text-sm font-bold text-slate-200">No Sales Logged for ${dateFilter.toUpperCase()}</div>
              <div class="text-xs text-slate-500 mt-0.5">Sales made via Quick Sell or Barcode Scan appear here instantly.</div>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = filtered.map(l => `
          <tr class="hover:bg-slate-800/40 font-mono text-xs border-b border-slate-800/60">
            <td class="p-2.5 text-slate-400 whitespace-nowrap">${l.timeStr || l.dateStr}</td>
            <td class="p-2.5 font-bold text-slate-100 font-sans">
              <div>${l.partName}</div>
              <div class="text-[10px] text-slate-400 font-mono">${l.partNumber || ''} • ${l.brand || ''}</div>
            </td>
            <td class="p-2.5 text-center font-bold text-amber-400">${l.quantity}x</td>
            <td class="p-2.5 text-right text-slate-300 font-mono">${this.formatCurrency(l.unitPrice || (l.totalAmount / (l.quantity || 1)))}</td>
            <td class="p-2.5 text-right font-bold text-emerald-400 font-mono">${this.formatCurrency(l.totalAmount || 0)}</td>
            <td class="p-2.5 text-[11px] text-slate-400 font-sans">${l.notes || 'Counter Sale'}</td>
            <td class="p-2.5 text-center no-print">
              <button 
                class="btn-open-return-from-log btn-touch px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold"
                data-part-id="${l.partId}"
                title="Customer returning this sold part"
              >
                Return
              </button>
            </td>
          </tr>
        `).join('');

        tbody.querySelectorAll('.btn-open-return-from-log').forEach(btn => {
          btn.addEventListener('click', () => {
            this.closeDailyOutflowModal();
            this.returnsManager.openCustomerReturnModal(btn.dataset.partId);
          });
        });
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  exportOutflowCSV() {
    this.outflowLog = this.storage.getOutflows();
    if (this.outflowLog.length === 0) {
      this.showToast("No sales records to export!", "warning");
      return;
    }

    const headers = ["Transaction ID", "Date", "Time", "Part Name", "Part Number", "Brand", "Quantity", "Unit Price", "Total Amount", "Source / Rack Location"];
    const rows = this.outflowLog.map(l => [
      l.id,
      l.dateStr,
      l.timeStr,
      `"${(l.partName || '').replace(/"/g, '""')}"`,
      `"${(l.partNumber || '').replace(/"/g, '""')}"`,
      `"${(l.brand || '').replace(/"/g, '""')}"`,
      l.quantity,
      l.unitPrice,
      l.totalAmount,
      `"${(l.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `daily_sales_outflow_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast("Daily Sales Outflow CSV downloaded!", "success");
  }

  printOutflowLedger() {
    window.print();
  }

  // Event Listeners Binding
  setupEventListeners() {
    // 4-Workspace Navigation Tabs Switcher
    const workspaceNav = document.getElementById('workspace-nav');
    if (workspaceNav) {
      workspaceNav.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.workspace-nav-tab');
        if (tabBtn && tabBtn.dataset.workspace) {
          this.switchWorkspace(tabBtn.dataset.workspace);
        }
      });
    }

    // Search input typing
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.classList.toggle('hidden', this.searchQuery.length === 0);
        }
        this.renderProducts();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        this.renderProducts();
      });
    }

    // Clear All Filters Buttons
    const topClearAllBtn = document.getElementById('clear-all-filters-top-btn');
    if (topClearAllBtn) {
      topClearAllBtn.addEventListener('click', () => this.clearAllFilters());
    }

    // Voice Search
    const voiceBtn = document.getElementById('voice-search-btn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => this.speechEngine.toggle());
    }

    // Brand Chips
    const brandContainer = document.getElementById('brand-chips-container');
    if (brandContainer) {
      brandContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('#btn-quick-manage-brands');
        if (addBtn) {
          this.taxonomyManager.openTaxonomyModal('brands');
          return;
        }

        const chip = e.target.closest('.brand-chip');
        if (!chip) return;
        this.sound.playClick();
        this.selectedBrand = chip.dataset.brandId;
        this.renderBrandChips();
        this.renderSubCategoryChips();
        this.renderProducts();
      });
    }

    // Category Chips
    const catContainer = document.getElementById('category-chips-container');
    if (catContainer) {
      catContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('#btn-quick-manage-categories');
        if (addBtn) {
          this.taxonomyManager.openTaxonomyModal('categories');
          return;
        }

        const chip = e.target.closest('.cat-chip');
        if (!chip) return;
        this.sound.playClick();
        const catId = chip.dataset.catId;
        this.selectedCategory = catId;
        this.selectedSubCategory = "all";
        this.renderCategoryChips();
        this.renderSubCategoryChips();
        this.renderProducts();

        if (catId !== 'all' && SUB_CATEGORIES_CONFIG[catId.toLowerCase()]) {
          this.openSubcategoryModal(catId);
        }
      });
    }

    // Subcategory Ribbon & Modal
    const subcatWrapper = document.getElementById('subcategory-wrapper');
    if (subcatWrapper) {
      subcatWrapper.addEventListener('click', (e) => {
        const chip = e.target.closest('.subcat-chip');
        if (chip) {
          this.selectSubCategory(chip.dataset.subcatId);
          return;
        }

        const clearBtn = e.target.closest('#btn-clear-subcategory');
        if (clearBtn) {
          this.selectSubCategory('all');
          return;
        }
      });
    }

    const reopenSubcatBtn = document.getElementById('btn-reopen-subcategory-modal');
    if (reopenSubcatBtn) {
      reopenSubcatBtn.addEventListener('click', () => {
        this.sound.playClick();
        this.openSubcategoryModal();
      });
    }

    const closeSubcatBtn = document.getElementById('close-subcategory-modal-btn');
    if (closeSubcatBtn) {
      closeSubcatBtn.addEventListener('click', () => this.closeSubcategoryModal());
    }

    const subcatOptionsGrid = document.getElementById('subcategory-modal-options-grid');
    if (subcatOptionsGrid) {
      subcatOptionsGrid.addEventListener('click', (e) => {
        const optionBtn = e.target.closest('.btn-select-subcat-option');
        if (optionBtn) {
          this.selectSubCategory(optionBtn.dataset.subcatId);
        }
      });
    }

    // Status Filter Tabs
    const statusTabs = document.querySelectorAll('.status-tab-btn');
    statusTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.sound.playClick();
        statusTabs.forEach(t => {
          t.classList.remove('active', 'border-amber-400', 'text-amber-400', 'bg-amber-950/40');
          t.classList.add('text-slate-400', 'border-transparent');
        });
        tab.classList.add('active', 'border-amber-400', 'text-amber-400', 'bg-amber-950/40');
        tab.classList.remove('text-slate-400', 'border-transparent');

        this.selectedStatusTab = tab.dataset.tab;
        this.renderProducts();
      });
    });

    // Product Cards Action Delegation
    const productsGrid = document.getElementById('products-grid');
    if (productsGrid) {
      productsGrid.addEventListener('click', (e) => {
        const batchToggleBtn = e.target.closest('.btn-toggle-batch-select');
        if (batchToggleBtn) {
          const partId = batchToggleBtn.dataset.partId;
          this.toggleBatchSelectPart(partId);
          return;
        }

        const quickSellBtn = e.target.closest('.btn-quick-sell');
        if (quickSellBtn) {
          const partId = quickSellBtn.dataset.partId;
          this.inventoryManager.sellPart(partId, 1);
          return;
        }

        const customerReturnBtn = e.target.closest('.btn-customer-return');
        if (customerReturnBtn) {
          const partId = customerReturnBtn.dataset.partId;
          this.returnsManager.openCustomerReturnModal(partId);
          return;
        }

        const printLabelBtn = e.target.closest('.btn-print-part-label');
        if (printLabelBtn) {
          const partId = printLabelBtn.dataset.partId;
          this.openBarcodePrintModal(partId);
          return;
        }

        const editBtn = e.target.closest('.btn-edit-part');
        if (editBtn) {
          const partId = editBtn.dataset.partId;
          this.inventoryManager.openAddPartModal(partId);
          return;
        }

        const deleteBtn = e.target.closest('.btn-delete-part');
        if (deleteBtn) {
          const partId = deleteBtn.dataset.partId;
          this.inventoryManager.confirmDeletePart(partId);
          return;
        }

        const transferUpstairsBtn = e.target.closest('.btn-transfer-upstairs');
        if (transferUpstairsBtn) {
          const partId = transferUpstairsBtn.dataset.partId;
          this.returnsManager.transferToUpstairs(partId);
          return;
        }

        const openClaimsBtn = e.target.closest('.btn-open-claims-modal');
        if (openClaimsBtn) {
          this.returnsManager.openDefectiveClaimsModal('pending');
          return;
        }

        const clearEmptyBtn = e.target.closest('#clear-all-filters-empty-btn');
        if (clearEmptyBtn) {
          this.clearAllFilters();
          return;
        }
      });
    }

    // Theme Toggle Button in Header
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => this.settingsManager.toggleThemeMode());
    }

    // Ground Stash & Daily Outflow Header Buttons
    const openStashBtn = document.getElementById('ground-stash-header-badge');
    if (openStashBtn) {
      openStashBtn.addEventListener('click', () => this.openGroundStashModal());
    }

    const closeStashBtn = document.getElementById('close-stash-modal-btn');
    if (closeStashBtn) {
      closeStashBtn.addEventListener('click', () => this.closeGroundStashModal());
    }

    const transferAllStashBtn = document.getElementById('transfer-all-stash-btn');
    if (transferAllStashBtn) {
      transferAllStashBtn.addEventListener('click', () => this.transferAllStashUpstairs());
    }

    const openOutflowBtn = document.getElementById('open-outflow-modal-btn');
    if (openOutflowBtn) {
      openOutflowBtn.addEventListener('click', () => this.openDailyOutflowModal('today'));
    }

    const closeOutflowBtn = document.getElementById('close-outflow-modal-btn');
    if (closeOutflowBtn) {
      closeOutflowBtn.addEventListener('click', () => this.closeDailyOutflowModal());
    }

    document.querySelectorAll('.outflow-date-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.playClick();
        this.openDailyOutflowModal(btn.dataset.filter || 'today');
      });
    });

    const printOutflowBtn = document.getElementById('print-outflow-ledger-btn');
    if (printOutflowBtn) {
      printOutflowBtn.addEventListener('click', () => this.printOutflowLedger());
    }

    const exportOutflowCsvBtn = document.getElementById('export-outflow-csv-btn');
    if (exportOutflowCsvBtn) {
      exportOutflowCsvBtn.addEventListener('click', () => this.exportOutflowCSV());
    }

    // Add Part Modal
    const openAddPartBtn = document.getElementById('open-add-part-btn') || document.getElementById('open-add-part-modal-btn');
    if (openAddPartBtn) {
      openAddPartBtn.addEventListener('click', () => this.inventoryManager.openAddPartModal());
    }

    const closeAddPartBtn = document.getElementById('close-add-part-btn');
    if (closeAddPartBtn) {
      closeAddPartBtn.addEventListener('click', () => this.inventoryManager.closeAddPartModal());
    }

    const addPartForm = document.getElementById('add-part-form');
    if (addPartForm) {
      addPartForm.addEventListener('submit', (e) => this.inventoryManager.savePartFromForm(e));
    }

    // Boodmo Lookup Button — toggles live as user types the Part Number
    const partNumberInput = document.getElementById('form-part-number');
    if (partNumberInput) {
      partNumberInput.addEventListener('input', () => {
        const btn = document.getElementById('btn-boodmo-lookup');
        const btnText = document.getElementById('btn-boodmo-lookup-text');
        const val = partNumberInput.value.trim();
        if (!btn) return;
        if (val.length >= 3) {
          // Active state — teal/cyan themed to signal "ready to lookup"
          btn.disabled = false;
          btn.classList.remove('bg-slate-800/60', 'border-slate-700/60', 'text-slate-500', 'cursor-not-allowed', 'opacity-50');
          btn.classList.add('bg-cyan-950/60', 'border-cyan-500/50', 'text-cyan-300', 'hover:bg-cyan-900/60', 'hover:border-cyan-400', 'cursor-pointer', 'shadow-sm', 'shadow-cyan-500/10');
          if (btnText) btnText.textContent = `Verify fitment for "${val}" on Boodmo →`;
        } else {
          // Disabled state
          btn.disabled = true;
          btn.classList.add('bg-slate-800/60', 'border-slate-700/60', 'text-slate-500', 'cursor-not-allowed', 'opacity-50');
          btn.classList.remove('bg-cyan-950/60', 'border-cyan-500/50', 'text-cyan-300', 'hover:bg-cyan-900/60', 'hover:border-cyan-400', 'cursor-pointer', 'shadow-sm', 'shadow-cyan-500/10');
          if (btnText) btnText.textContent = 'Enter Part No. to verify fitment on Boodmo';
        }
      });
    }


    const btnGenerateBarcode = document.getElementById('btn-generate-part-barcode');
    if (btnGenerateBarcode) {
      btnGenerateBarcode.addEventListener('click', () => {
        const uniqueBarcode = this.inventoryManager.generateUniqueBarcode();
        const barcodeInput = document.getElementById('form-part-barcode');
        if (barcodeInput) {
          barcodeInput.value = uniqueBarcode;
          barcodeInput.classList.add('border-emerald-400', 'bg-emerald-950/40');
          setTimeout(() => {
            barcodeInput.classList.remove('border-emerald-400', 'bg-emerald-950/40');
          }, 800);
        }
        this.sound.playClick();
        this.showToast(`✨ Generated unique barcode: ${uniqueBarcode}`, "success");
      });
    }

    const deleteCurrentPartBtn = document.getElementById('btn-delete-current-part');
    if (deleteCurrentPartBtn) {
      deleteCurrentPartBtn.addEventListener('click', (e) => {
        const partId = e.currentTarget.dataset.partId || document.getElementById('form-part-id').value;
        if (partId) {
          this.inventoryManager.confirmDeletePart(partId);
        }
      });
    }

    const formVehBrandSelect = document.getElementById('form-vehicle-brand');
    if (formVehBrandSelect) {
      formVehBrandSelect.addEventListener('change', (e) => {
        if (e.target.value === '__NEW_BRAND__') {
          this.taxonomyManager.openTaxonomyModal('brands');
        }
      });
    }

    const formCatSelect = document.getElementById('form-category');
    if (formCatSelect) {
      formCatSelect.addEventListener('change', (e) => {
        if (e.target.value === '__NEW_CATEGORY__') {
          this.taxonomyManager.openTaxonomyModal('categories');
        }
      });
    }

    // Barcode Sticker Print Modal Controls
    const closePrintModalBtn = document.getElementById('close-print-barcode-modal-btn');
    if (closePrintModalBtn) {
      closePrintModalBtn.addEventListener('click', () => this.closeBarcodePrintModal());
    }

    const qtyInput = document.getElementById('print-label-qty');
    const qtyPlusBtn = document.getElementById('btn-label-qty-plus');
    const qtyMinusBtn = document.getElementById('btn-label-qty-minus');
    const labelSizeSelect = document.getElementById('print-label-size');
    const labelStyleSelect = document.getElementById('print-label-style');
    const headerStyleSelect = document.getElementById('print-header-style');
    const customWidthInput = document.getElementById('custom-sticker-width');
    const customHeightInput = document.getElementById('custom-sticker-height');
    const triggerPrintBtn = document.getElementById('btn-trigger-print-labels');

    if (qtyPlusBtn && qtyInput) {
      qtyPlusBtn.addEventListener('click', () => {
        qtyInput.value = Math.min(100, (parseInt(qtyInput.value, 10) || 1) + 1);
        if (this.printingPart) this.barcodeEngine.renderStickersPreview(this.printingPart);
      });
    }

    if (qtyMinusBtn && qtyInput) {
      qtyMinusBtn.addEventListener('click', () => {
        qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
        if (this.printingPart) this.barcodeEngine.renderStickersPreview(this.printingPart);
      });
    }

    const labelMarginSelect = document.getElementById('print-label-margin');

    [qtyInput, labelSizeSelect, labelMarginSelect, labelStyleSelect, headerStyleSelect, customWidthInput, customHeightInput].forEach(el => {
      if (el) {
        el.addEventListener('input', () => {
          if (this.printingPart) this.barcodeEngine.renderStickersPreview(this.printingPart);
        });
        el.addEventListener('change', () => {
          if (this.printingPart) this.barcodeEngine.renderStickersPreview(this.printingPart);
        });
      }
    });

    if (triggerPrintBtn) {
      triggerPrintBtn.addEventListener('click', () => {
        if (this.printingPart) this.barcodeEngine.printStickersDirectly(this.printingPart);
      });
    }

    // Single Barcode Print Modal: Add to Batch Button
    const btnAddCurrentToBatch = document.getElementById('btn-add-current-to-batch');
    if (btnAddCurrentToBatch) {
      btnAddCurrentToBatch.addEventListener('click', () => {
        if (!this.printingPart) return;
        const qty = parseInt(qtyInput?.value || 1, 10) || 1;
        this.addToBatchPrint(this.printingPart.id, qty);
        this.closeBarcodePrintModal();
      });
    }

    // Header Batch Print Button
    const headerBatchBtn = document.getElementById('open-batch-print-btn');
    if (headerBatchBtn) {
      headerBatchBtn.addEventListener('click', () => this.openBatchPrintModal());
    }

    // Search Bar: Select All Visible / Filtered Button
    const btnSelectAllFiltered = document.getElementById('btn-select-all-filtered');
    if (btnSelectAllFiltered) {
      btnSelectAllFiltered.addEventListener('click', () => this.selectAllFilteredParts());
    }

    // Floating Batch Dock Buttons
    const dockOpenBatchModalBtn = document.getElementById('btn-dock-open-batch-modal');
    if (dockOpenBatchModalBtn) {
      dockOpenBatchModalBtn.addEventListener('click', () => this.openBatchPrintModal());
    }

    const dockClearBatchBtn = document.getElementById('btn-dock-clear-batch');
    if (dockClearBatchBtn) {
      dockClearBatchBtn.addEventListener('click', () => this.clearBatchPrintQueue());
    }

    document.querySelectorAll('.btn-dock-quick-qty').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qty = parseInt(e.currentTarget.dataset.qty, 10) || 1;
        this.setAllBatchQuantities(qty);
      });
    });

    // ================= BATCH PRINT MODAL CONTROLS & LISTENERS =================
    const closeBatchModalBtn = document.getElementById('close-batch-print-modal-btn');
    if (closeBatchModalBtn) {
      closeBatchModalBtn.addEventListener('click', () => this.closeBatchPrintModal());
    }

    const batchClearAllBtn = document.getElementById('btn-batch-modal-clear-all');
    if (batchClearAllBtn) {
      batchClearAllBtn.addEventListener('click', () => this.clearBatchPrintQueue());
    }

    const triggerBatchPrintBtn = document.getElementById('btn-trigger-batch-print-labels');
    if (triggerBatchPrintBtn) {
      triggerBatchPrintBtn.addEventListener('click', () => this.printBatchDirectly());
    }

    document.querySelectorAll('.btn-batch-bulk-qty').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const qty = parseInt(e.currentTarget.dataset.qty, 10) || 1;
        this.setAllBatchQuantities(qty);
      });
    });

    const batchSizeSelect = document.getElementById('batch-label-size');
    const batchMarginSelect = document.getElementById('batch-label-margin');
    const batchStyleSelect = document.getElementById('batch-print-style');
    const batchHeaderStyleSelect = document.getElementById('batch-print-header-style');
    const customBatchWidthInput = document.getElementById('custom-batch-sticker-width');
    const customBatchHeightInput = document.getElementById('custom-batch-sticker-height');

    [batchSizeSelect, batchMarginSelect, batchStyleSelect, batchHeaderStyleSelect, customBatchWidthInput, customBatchHeightInput].forEach(el => {
      if (el) {
        el.addEventListener('input', () => this.renderBatchStickersPreview());
        el.addEventListener('change', () => this.renderBatchStickersPreview());
      }
    });

    // Batch Queue Items List Delegation (Quantity steppers & remove)
    const batchQueueContainer = document.getElementById('batch-queue-items-list');
    if (batchQueueContainer) {
      batchQueueContainer.addEventListener('click', (e) => {
        const plusBtn = e.target.closest('.btn-batch-qty-plus');
        if (plusBtn) {
          const partId = plusBtn.dataset.partId;
          const currentItem = this.batchPrintQueue.get(partId);
          if (currentItem) {
            this.updateBatchPrintQty(partId, (currentItem.quantity || 1) + 1);
            this.renderBatchModalList();
          }
          return;
        }

        const minusBtn = e.target.closest('.btn-batch-qty-minus');
        if (minusBtn) {
          const partId = minusBtn.dataset.partId;
          const currentItem = this.batchPrintQueue.get(partId);
          if (currentItem) {
            this.updateBatchPrintQty(partId, Math.max(1, (currentItem.quantity || 1) - 1));
            this.renderBatchModalList();
          }
          return;
        }

        const removeBtn = e.target.closest('.btn-batch-remove-item');
        if (removeBtn) {
          const partId = removeBtn.dataset.partId;
          this.removeFromBatchPrint(partId);
          return;
        }
      });

      batchQueueContainer.addEventListener('change', (e) => {
        const qtyInput = e.target.closest('.batch-qty-input');
        if (qtyInput) {
          const partId = qtyInput.dataset.partId;
          const val = Math.max(1, parseInt(qtyInput.value, 10) || 1);
          qtyInput.value = val;
          this.updateBatchPrintQty(partId, val);
          this.renderBatchModalList();
        }
      });
    }

    // In-Modal Live Search & Fast Add
    const batchSearchInput = document.getElementById('batch-search-add-input');
    const batchSearchSuggestions = document.getElementById('batch-search-suggestions');
    const batchClearSearchBtn = document.getElementById('batch-clear-search-btn');

    if (batchSearchInput && batchSearchSuggestions) {
      batchSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (batchClearSearchBtn) {
          batchClearSearchBtn.classList.toggle('hidden', query.length === 0);
        }

        if (query.length < 1) {
          batchSearchSuggestions.innerHTML = '';
          batchSearchSuggestions.classList.add('hidden');
          return;
        }

        const matches = this.products.filter(p => {
          const text = `${p.name} ${p.partNumber} ${p.brand} ${p.vehicleBrand} ${(p.compatibleModels || []).join(' ')} ${p.barcode || ''}`.toLowerCase();
          return text.includes(query);
        }).slice(0, 8);

        if (matches.length === 0) {
          batchSearchSuggestions.innerHTML = `
            <div class="p-3 text-xs text-slate-400 text-center">
              No parts found matching "${e.target.value}".
            </div>
          `;
          batchSearchSuggestions.classList.remove('hidden');
          return;
        }

        batchSearchSuggestions.innerHTML = matches.map(p => {
          const inBatch = this.isPartInBatch(p.id);
          return `
            <div class="p-2.5 hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer btn-add-suggested-part" data-part-id="${p.id}">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-black text-xs text-slate-200 truncate">${p.name}</span>
                  <span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800/40">${p.partNumber}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span class="text-amber-400 font-semibold">${p.vehicleBrand}</span>
                  <span>•</span>
                  <span class="text-emerald-400 font-bold">₹ ${(p.sellingPrice || 0).toLocaleString('en-IN')}</span>
                  <span>•</span>
                  <span>📍 ${p.rackLocation || 'RACK'}</span>
                </div>
              </div>
              <button class="btn-touch px-2.5 py-1 rounded-lg ${inBatch ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' : 'bg-blue-600 hover:bg-blue-500 text-white'} text-[11px] font-bold shrink-0 shadow-sm flex items-center gap-1">
                <i data-lucide="${inBatch ? 'check' : 'plus'}" class="w-3 h-3"></i>
                <span>${inBatch ? 'Added' : '+ Add'}</span>
              </button>
            </div>
          `;
        }).join('');

        batchSearchSuggestions.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
      });

      batchSearchSuggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.btn-add-suggested-part');
        if (item) {
          const partId = item.dataset.partId;
          this.addToBatchPrint(partId, 1);
          batchSearchInput.value = '';
          batchSearchSuggestions.innerHTML = '';
          batchSearchSuggestions.classList.add('hidden');
          if (batchClearSearchBtn) batchClearSearchBtn.classList.add('hidden');
        }
      });
    }

    if (batchClearSearchBtn && batchSearchInput && batchSearchSuggestions) {
      batchClearSearchBtn.addEventListener('click', () => {
        batchSearchInput.value = '';
        batchSearchSuggestions.innerHTML = '';
        batchSearchSuggestions.classList.add('hidden');
        batchClearSearchBtn.classList.add('hidden');
      });
    }

    // Customer Return Modal Choices
    const btnUnused = document.getElementById('btn-confirm-unused-return') || document.getElementById('btn-return-unused');
    const btnDefective = document.getElementById('btn-confirm-defective-return') || document.getElementById('btn-return-defective');
    const closeReturnModalBtn = document.getElementById('close-customer-return-modal-btn');
    const cancelReturnBtn = document.getElementById('btn-cancel-customer-return');

    if (btnUnused) {
      btnUnused.addEventListener('click', () => this.returnsManager.confirmUnusedReturn());
    }

    if (btnDefective) {
      btnDefective.addEventListener('click', () => this.returnsManager.confirmDefectiveReturn());
    }

    if (closeReturnModalBtn) {
      closeReturnModalBtn.addEventListener('click', () => this.returnsManager.closeCustomerReturnModal());
    }

    if (cancelReturnBtn) {
      cancelReturnBtn.addEventListener('click', () => this.returnsManager.closeCustomerReturnModal());
    }

    // Wholesaler Claims Modal
    const headerClaimsBadge = document.getElementById('open-defective-claims-btn') || document.getElementById('defective-claims-header-badge');
    if (headerClaimsBadge) {
      headerClaimsBadge.addEventListener('click', () => this.returnsManager.openDefectiveClaimsModal('pending'));
    }

    const closeClaimsBtn = document.getElementById('close-defective-claims-modal-btn');
    if (closeClaimsBtn) {
      closeClaimsBtn.addEventListener('click', () => this.returnsManager.closeDefectiveClaimsModal());
    }

    const tabClaimsPending = document.getElementById('btn-claims-tab-pending') || document.getElementById('btn-tab-claims-pending');
    const tabClaimsSettled = document.getElementById('btn-claims-tab-all') || document.getElementById('btn-tab-claims-settled');
    if (tabClaimsPending) {
      tabClaimsPending.addEventListener('click', () => this.returnsManager.setDefectiveClaimsTab('pending'));
    }
    if (tabClaimsSettled) {
      tabClaimsSettled.addEventListener('click', () => this.returnsManager.setDefectiveClaimsTab('all'));
    }

    const printClaimsSheetBtn = document.getElementById('btn-print-wholesaler-claim-sheet');
    if (printClaimsSheetBtn) {
      printClaimsSheetBtn.addEventListener('click', () => this.returnsManager.printWholesalerClaimSheet());
    }

    const claimsTbody = document.getElementById('defective-claims-tbody');
    if (claimsTbody) {
      claimsTbody.addEventListener('click', (e) => {
        const settleBtn = e.target.closest('.btn-open-settle-modal');
        if (settleBtn) {
          const claimId = settleBtn.dataset.claimId;
          this.returnsManager.openSettleWholesalerModal(claimId);
        }
      });
    }

    // Modal 12: Settle Wholesaler Claim Modal
    const closeSettleModalBtn = document.getElementById('close-settle-wholesaler-modal-btn');
    if (closeSettleModalBtn) {
      closeSettleModalBtn.addEventListener('click', () => this.returnsManager.closeSettleWholesalerModal());
    }

    const settleForm = document.getElementById('settle-wholesaler-form');
    if (settleForm) {
      settleForm.addEventListener('submit', (e) => this.returnsManager.confirmSettleWholesalerForm(e));
    }

    // Price Revision Wizard Modal
    const openPriceRevBtn = document.getElementById('open-price-revision-btn');
    if (openPriceRevBtn) {
      openPriceRevBtn.addEventListener('click', () => this.priceRevisionManager.openPriceRevisionModal('brand'));
    }

    const closePriceRevBtn = document.getElementById('close-price-revision-modal-btn');
    if (closePriceRevBtn) {
      closePriceRevBtn.addEventListener('click', () => this.priceRevisionManager.closePriceRevisionModal());
    }

    const btnTabRevBrand = document.getElementById('btn-tab-revision-brand');
    const btnTabRevCsv = document.getElementById('btn-tab-revision-csv');
    const btnTabRevHist = document.getElementById('btn-tab-revision-history');

    if (btnTabRevBrand) btnTabRevBrand.addEventListener('click', () => this.priceRevisionManager.switchPriceRevisionTab('brand'));
    if (btnTabRevCsv) btnTabRevCsv.addEventListener('click', () => this.priceRevisionManager.switchPriceRevisionTab('csv'));
    if (btnTabRevHist) btnTabRevHist.addEventListener('click', () => this.priceRevisionManager.switchPriceRevisionTab('history'));

    const revBrandSelect = document.getElementById('revision-brand-select');
    const revCatSelect = document.getElementById('revision-category-select');
    const revType = document.getElementById('revision-type-select') || document.getElementById('revision-type');
    const revValue = document.getElementById('revision-value-input') || document.getElementById('revision-value');
    const revApplyTo = document.getElementById('revision-apply-to') || document.getElementById('revision-apply-to-select');
    const revRounding = document.getElementById('revision-round-select') || document.getElementById('revision-rounding');

    [revBrandSelect, revCatSelect, revType, revValue, revApplyTo, revRounding].forEach(el => {
      if (el) {
        el.addEventListener('input', () => this.priceRevisionManager.calculateBrandPriceRevisionPreview());
        el.addEventListener('change', () => this.priceRevisionManager.calculateBrandPriceRevisionPreview());
      }
    });

    const btnApplyBrandRev = document.getElementById('btn-apply-brand-revision');
    if (btnApplyBrandRev) {
      btnApplyBrandRev.addEventListener('click', () => this.priceRevisionManager.applyBrandPriceRevision());
    }

    const csvFileInput = document.getElementById('csv-file-input');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', (e) => this.priceRevisionManager.handleCSVFileUpload(e));
    }

    const csvDropZone = document.getElementById('csv-drop-zone');
    if (csvDropZone && csvFileInput) {
      csvDropZone.addEventListener('click', () => csvFileInput.click());
    }

    const btnParseCsv = document.getElementById('btn-parse-csv-preview') || document.getElementById('btn-parse-pasted-csv');
    if (btnParseCsv) {
      btnParseCsv.addEventListener('click', () => this.priceRevisionManager.parseCSVAndMatch());
    }

    const btnValidateMapped = document.getElementById('btn-validate-mapped-sheet');
    if (btnValidateMapped) {
      btnValidateMapped.addEventListener('click', () => this.priceRevisionManager.validateMappedSheetAndPreview());
    }

    const btnQuickRollback = document.getElementById('btn-quick-rollback-last-import');
    if (btnQuickRollback) {
      btnQuickRollback.addEventListener('click', () => this.priceRevisionManager.rollbackLastImport());
    }

    const btnConfirmAliases = document.getElementById('btn-confirm-vehicle-aliases');
    if (btnConfirmAliases) {
      btnConfirmAliases.addEventListener('click', () => this.priceRevisionManager.confirmVehicleAliases());
    }

    const btnApplyCsvSync = document.getElementById('btn-apply-csv-sync');
    if (btnApplyCsvSync) {
      btnApplyCsvSync.addEventListener('click', () => this.priceRevisionManager.applyCSVSync());
    }

    const btnDownloadSampleCsv = document.getElementById('btn-download-sample-csv');
    if (btnDownloadSampleCsv) {
      btnDownloadSampleCsv.addEventListener('click', () => this.priceRevisionManager.downloadSampleCSVTemplate());
    }

    const revHistTbody = document.getElementById('revision-history-tbody');
    if (revHistTbody) {
      revHistTbody.addEventListener('click', (e) => {
        const rollbackBtn = e.target.closest('.btn-rollback-snapshot');
        if (rollbackBtn) {
          const snapId = rollbackBtn.dataset.snapshotId;
          this.priceRevisionManager.rollbackPriceSnapshot(snapId);
        }
      });
    }

    // POS Cart Drawer Controls (Phase 2 Visual Prototype Shell)
    const openCartBtn = document.getElementById('open-cart-drawer-btn');
    if (openCartBtn) {
      openCartBtn.addEventListener('click', () => this.toggleCartDrawer());
    }

    const closeCartBtn = document.getElementById('close-cart-drawer-btn');
    if (closeCartBtn) {
      closeCartBtn.addEventListener('click', () => this.closeCartDrawer());
    }

    const cartBackdrop = document.getElementById('cart-drawer-backdrop');
    if (cartBackdrop) {
      cartBackdrop.addEventListener('click', () => this.closeCartDrawer());
    }

    // Cart Drawer Clear Button (Phase 3 In-Memory Cart)
    const clearCartBtn = document.getElementById('btn-clear-cart');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', () => this.clearCart());
    }

    // POS Complete Sale Checkout Trigger Button
    const completeSaleBtn = document.getElementById('btn-complete-sale');
    if (completeSaleBtn) {
      completeSaleBtn.addEventListener('click', () => this.openCheckoutModal());
    }

    // Checkout Confirmation Modal Controls
    const closeCheckoutBtn = document.getElementById('close-checkout-modal-btn');
    if (closeCheckoutBtn) {
      closeCheckoutBtn.addEventListener('click', () => this.closeCheckoutModal());
    }

    const cancelCheckoutBtn = document.getElementById('btn-cancel-checkout');
    if (cancelCheckoutBtn) {
      cancelCheckoutBtn.addEventListener('click', () => this.closeCheckoutModal());
    }

    const payCashBtn = document.getElementById('btn-pay-cash');
    if (payCashBtn) {
      payCashBtn.addEventListener('click', () => this.selectPaymentMethod('CASH'));
    }

    const payUpiBtn = document.getElementById('btn-pay-upi');
    if (payUpiBtn) {
      payUpiBtn.addEventListener('click', () => this.selectPaymentMethod('UPI'));
    }

    const confirmCheckoutBtn = document.getElementById('btn-confirm-pos-checkout');
    if (confirmCheckoutBtn) {
      confirmCheckoutBtn.addEventListener('click', () => this.executeCheckout());
    }

    // Digital Receipt Modal Controls
    const closeReceiptBtn = document.getElementById('btn-close-receipt');
    if (closeReceiptBtn) {
      closeReceiptBtn.addEventListener('click', () => this.closeReceiptModal());
    }

    const printReceiptBtn = document.getElementById('btn-print-receipt');
    if (printReceiptBtn) {
      printReceiptBtn.addEventListener('click', () => this.printReceipt());
    }

    const viewLastReceiptBtn = document.getElementById('btn-view-last-receipt');
    if (viewLastReceiptBtn) {
      viewLastReceiptBtn.addEventListener('click', () => this.openLastReceipt());
    }

    // Cashier Authentication Modal Controls
    const cashierAuthBadge = document.getElementById('cashier-auth-badge');
    if (cashierAuthBadge) {
      cashierAuthBadge.addEventListener('click', () => this.openCashierLoginModal());
    }

    const closeCashierModalBtn = document.getElementById('close-cashier-modal-btn');
    if (closeCashierModalBtn) {
      closeCashierModalBtn.addEventListener('click', () => this.closeCashierLoginModal());
    }

    const cancelCashierModalBtn = document.getElementById('btn-cancel-cashier-modal');
    if (cancelCashierModalBtn) {
      cancelCashierModalBtn.addEventListener('click', () => this.closeCashierLoginModal());
    }

    const cashierLoginForm = document.getElementById('cashier-login-form');
    if (cashierLoginForm) {
      cashierLoginForm.addEventListener('submit', (e) => this.handleCashierSignIn(e));
    }

    const cashierSignOutBtn = document.getElementById('btn-cashier-sign-out');
    if (cashierSignOutBtn) {
      cashierSignOutBtn.addEventListener('click', () => this.handleCashierSignOut());
    }

    // Settings Modal Cashier Account Controls
    const settingsCashierLoginBtn = document.getElementById('btn-settings-cashier-login');
    if (settingsCashierLoginBtn) {
      settingsCashierLoginBtn.addEventListener('click', () => {
        if (this.settingsManager) {
          this.settingsManager.closeSettingsModal();
        }
        this.openCashierLoginModal();
      });
    }

    const settingsCashierSignOutBtn = document.getElementById('btn-settings-cashier-signout');
    if (settingsCashierSignOutBtn) {
      settingsCashierSignOutBtn.addEventListener('click', () => this.handleCashierSignOut());
    }

    // Cart Items Container Event Delegation for Quantity +/- and Remove Buttons
    const cartItemsContainer = document.getElementById('cart-items-container');
    if (cartItemsContainer) {
      cartItemsContainer.addEventListener('click', (e) => {
        const decBtn = e.target.closest('.cart-qty-dec');
        if (decBtn && decBtn.dataset.partId) {
          this.updateCartItemQuantity(decBtn.dataset.partId, -1);
          return;
        }

        const incBtn = e.target.closest('.cart-qty-inc');
        if (incBtn && incBtn.dataset.partId) {
          this.updateCartItemQuantity(incBtn.dataset.partId, 1);
          return;
        }

        const removeBtn = e.target.closest('.cart-remove-item-btn');
        if (removeBtn && removeBtn.dataset.partId) {
          this.removeFromCart(removeBtn.dataset.partId);
          return;
        }
      });
    }

    // Barcode Scanner Modal
    const openScannerBtn = document.getElementById('open-barcode-scanner-btn');
    if (openScannerBtn) {
      openScannerBtn.addEventListener('click', () => this.scannerEngine.openScannerModal());
    }

    const closeScannerBtn = document.getElementById('close-barcode-scanner-btn');
    if (closeScannerBtn) {
      closeScannerBtn.addEventListener('click', () => this.scannerEngine.closeScannerModal());
    }

    const cameraSelect = document.getElementById('scanner-camera-select');
    if (cameraSelect) {
      cameraSelect.addEventListener('change', () => this.scannerEngine.restartCameraWithSelectedDevice());
    }

    const toggleCameraBtn = document.getElementById('toggle-camera-facing-btn');
    if (toggleCameraBtn) {
      toggleCameraBtn.addEventListener('click', () => this.scannerEngine.restartCameraWithSelectedDevice());
    }

    // Manual Barcode input in scanner modal
    const manualBarcodeInput = document.getElementById('manual-barcode-input');
    const submitManualBarcodeBtn = document.getElementById('btn-submit-manual-barcode');

    if (submitManualBarcodeBtn && manualBarcodeInput) {
      submitManualBarcodeBtn.addEventListener('click', () => {
        const code = manualBarcodeInput.value.trim();
        if (code) {
          this.handleBarcodeScanned(code, 'Manual Keypad');
          manualBarcodeInput.value = '';
        }
      });

      manualBarcodeInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          const code = manualBarcodeInput.value.trim();
          if (code) {
            this.handleBarcodeScanned(code, 'Manual Keypad');
            manualBarcodeInput.value = '';
          }
        }
      });
    }

    // Settings Modal
    const openSettingsBtn = document.getElementById('open-settings-btn');
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => this.settingsManager.openSettingsModal());
    }

    const closeSettingsBtn = document.getElementById('close-settings-btn');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => this.settingsManager.closeSettingsModal());
    }

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => this.settingsManager.saveSettingsFromForm(e));
    }

    const cipherKeywordInput = document.getElementById('setting-cipher-keyword');
    if (cipherKeywordInput) {
      cipherKeywordInput.addEventListener('input', (e) => {
        this.settingsManager.updateCipherLivePreview(e.target.value);
      });
    }

    const btnOpenManageTaxonomy = document.getElementById('btn-open-manage-taxonomy');
    if (btnOpenManageTaxonomy) {
      btnOpenManageTaxonomy.addEventListener('click', () => {
        this.settingsManager.closeSettingsModal();
        this.taxonomyManager.openTaxonomyModal('brands');
      });
    }

    const exportBackupBtn = document.getElementById('btn-export-backup-json');
    if (exportBackupBtn) {
      exportBackupBtn.addEventListener('click', () => this.settingsManager.exportDataBackup());
    }

    const importBackupInput = document.getElementById('import-backup-file-input');
    if (importBackupInput) {
      importBackupInput.addEventListener('change', (e) => this.settingsManager.importDataBackup(e.target.files[0]));
    }

    const resetDemoBtn = document.getElementById('btn-reset-demo-data');
    if (resetDemoBtn) {
      resetDemoBtn.addEventListener('click', () => {
        if (confirm("Restore the 30 sample demo auto parts, sample sales, and claim records?")) {
          this.settingsManager.executeReloadDemoData();
        }
      });
    }

    // Start Fresh Security Modal Controls
    const openStartFreshBtn = document.getElementById('btn-open-start-fresh-modal');
    if (openStartFreshBtn) {
      openStartFreshBtn.addEventListener('click', () => this.settingsManager.openStartFreshModal());
    }

    const closeStartFreshBtn = document.getElementById('btn-close-start-fresh-modal');
    if (closeStartFreshBtn) {
      closeStartFreshBtn.addEventListener('click', () => this.settingsManager.closeStartFreshModal());
    }

    const cancelStartFreshBtn = document.getElementById('btn-cancel-start-fresh');
    if (cancelStartFreshBtn) {
      cancelStartFreshBtn.addEventListener('click', () => this.settingsManager.closeStartFreshModal());
    }

    const securityPhraseInput = document.getElementById('input-security-wipe-phrase');
    if (securityPhraseInput) {
      securityPhraseInput.addEventListener('input', (e) => {
        this.settingsManager.handleSecurityPhraseInput(e.target.value);
      });
    }

    const confirmFactoryWipeBtn = document.getElementById('btn-confirm-factory-wipe');
    if (confirmFactoryWipeBtn) {
      confirmFactoryWipeBtn.addEventListener('click', () => {
        this.settingsManager.executeFactoryStartFresh();
      });
    }

    // Subcategory Modal "Show All" Button
    const btnSubcatShowAll = document.getElementById('btn-subcategory-show-all');
    if (btnSubcatShowAll) {
      btnSubcatShowAll.addEventListener('click', () => {
        this.selectSubCategory('all');
        this.closeSubcategoryModal();
      });
    }

    // Taxonomy Manager Modal
    const closeTaxonomyBtn = document.getElementById('close-taxonomy-modal-btn');
    if (closeTaxonomyBtn) {
      closeTaxonomyBtn.addEventListener('click', () => this.taxonomyManager.closeTaxonomyModal());
    }

    const tabBtnBrands = document.getElementById('tab-btn-brands');
    const tabBtnCats = document.getElementById('tab-btn-categories');
    if (tabBtnBrands) tabBtnBrands.addEventListener('click', () => this.taxonomyManager.switchTaxonomyTab('brands'));
    if (tabBtnCats) tabBtnCats.addEventListener('click', () => this.taxonomyManager.switchTaxonomyTab('categories'));

    const addBrandForm = document.getElementById('add-brand-form');
    if (addBrandForm) {
      addBrandForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-brand-name') || document.getElementById('new-brand-name-input');
        if (input && input.value && input.value.trim()) {
          this.taxonomyManager.addNewVehicleBrand(input.value.trim());
          input.value = '';
        }
      });
    }

    const addCatForm = document.getElementById('add-category-form');
    if (addCatForm) {
      addCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-category-name') || document.getElementById('new-category-name-input');
        if (input && input.value && input.value.trim()) {
          this.taxonomyManager.addNewCategory(input.value.trim());
          input.value = '';
        }
      });
    }

    const brandsList = document.getElementById('brands-manager-list');
    if (brandsList) {
      brandsList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-delete-brand');
        if (delBtn) {
          this.taxonomyManager.deleteVehicleBrand(delBtn.dataset.brandId);
        }
      });
    }

    const catsList = document.getElementById('categories-manager-list');
    if (catsList) {
      catsList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-delete-category');
        if (delBtn) {
          this.taxonomyManager.deleteCategory(delBtn.dataset.catId);
        }
      });
    }
  }
}

// Instantiate and attach global instance
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AutoPartsApp();
  window.app.init();
});

export default AutoPartsApp;
