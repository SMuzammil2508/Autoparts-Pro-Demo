// Enterprise Supabase Cloud PostgreSQL & Offline-Resilient Storage Manager
// Features: Real-time Multi-Device WebSockets, Auto-Cloud Seeding, Offline Fallback Cache, and Schema Migrations

import { INITIAL_PARTS_DATA, SAMPLE_DEMO_PARTS, DEFAULT_VEHICLE_BRANDS, DEFAULT_CATEGORIES } from '../config/data.js';

export const SUPABASE_CONFIG = {
  projectRef: "nvtekxnitwrakunfjayi",
  url: "https://nvtekxnitwrakunfjayi.supabase.co",
  anonKey: "sb_publishable_S7emYPQL5knfxMG-j-hm4Q_W1Aq-CqQ"
};

export const STORAGE_KEYS = {
  PRODUCTS: 'autoparts_products_v1',
  OUTFLOW_LOG: 'autoparts_outflow_log_v1',
  SETTINGS: 'autoparts_settings_v1',
  VEHICLE_BRANDS: 'autoparts_vehicle_brands_v1',
  CATEGORIES: 'autoparts_categories_v1',
  DEFECTIVE_RETURNS: 'autoparts_defective_v1',
  PRICE_HISTORY: 'autoparts_price_history_v1',
  VEHICLE_ALIASES: 'autoparts_vehicle_aliases_v1',
  PRICE_CATALOG: 'autoparts_price_catalog_v1',
  POS_CHECKOUTS_LOCAL: 'autoparts_pos_checkouts_local_v1',
  PENDING_CHECKOUT: 'autoparts_active_checkout_v1',
  LAST_RECEIPT: 'autoparts_last_completed_receipt_v1'
};

export const DEFAULT_VEHICLE_ALIASES = {
  "wr": "Wagon-R",
  "wg-r": "Wagon-R",
  "w/r": "Wagon-R",
  "w-r": "Wagon-R",
  "wagonr": "Wagon-R",
  "sw": "Swift",
  "swft": "Swift",
  "sw-dzr": "Swift Dzire",
  "dzr": "Swift Dzire",
  "dzire": "Swift Dzire",
  "alt": "Alto 800",
  "a800": "Alto 800",
  "k10": "Alto K10",
  "bln": "Baleno",
  "baleno": "Baleno",
  "ert": "Ertiga",
  "vtr": "Vitara Brezza",
  "brz": "Brezza",
  "cel": "Celerio",
  "ign": "Ignis",
  "v fludic": "Verna Fluidic",
  "verna f": "Verna Fluidic",
  "ver flu": "Verna Fluidic",
  "vrn-fl": "Verna Fluidic",
  "vrn": "Verna",
  "i20": "Elite i20",
  "i-20": "Elite i20",
  "elt i20": "Elite i20",
  "i10": "Grand i10",
  "i-10": "Grand i10",
  "grd i10": "Grand i10",
  "crt": "Creta",
  "crta": "Creta",
  "vnu": "Venue",
  "snt": "Santro",
  "scp": "Scorpio",
  "scorp": "Scorpio",
  "sc-n": "Scorpio-N",
  "sc-crde": "Scorpio CRDe",
  "blr": "Bolero",
  "bol": "Bolero",
  "thr": "Thar",
  "xuv7": "XUV700",
  "x700": "XUV700",
  "xuv700": "XUV700",
  "xuv5": "XUV500",
  "xuv3": "XUV300",
  "nxn": "Nexon",
  "pnch": "Punch",
  "tgr": "Tigor",
  "tag": "Tiago",
  "hrr": "Harrier",
  "sfr": "Safari",
  "altroz": "Altroz",
  "altz": "Altroz",
  "inn": "Innova",
  "crysta": "Innova Crysta",
  "inn crys": "Innova Crysta",
  "inv-cr": "Innova Crysta",
  "ftn": "Fortuner",
  "fort": "Fortuner",
  "4tuner": "Fortuner",
  "crl": "Corolla Altis",
  "glz": "Glanza",
  "hycross": "Innova Hycross",
  "cty": "City",
  "hc": "City",
  "city ivtec": "City i-VTEC",
  "amz": "Amaze",
  "wrv": "WR-V",
  "crv": "CR-V",
  "cvc": "Civic"
};

export const DEFAULT_SETTINGS = {
  storeName: "Decent Motor Accessories",
  currencySymbol: "₹",
  currencyCode: "INR",
  cipherKeyword: "SANYODELHI",
  stickerFormat: "dynamic_code",
  soundEnabled: true,
  theme: "midnight"
};

export const isLocalEnvironment = () => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  const protocol = window.location.protocol || '';
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host.endsWith('.local') ||
    host === '' ||
    protocol === 'file:'
  );
};

// ============================================================================
// SECURITY & ENVIRONMENT GUARDS
// ============================================================================

export const ALLOWED_TEST_PROJECT_REF = 'nvtekxnitwrakunfjayi';
export const ALLOWED_DEMO_HOSTS = ['smuzammil2508.github.io', 'localhost', '127.0.0.1'];

let isCircuitBroken = false;
let isSessionLockedOffline = false;
let currentSessionGeneration = 1;
let supabaseClient = null;
let cachedConfigUrl = null;
let cachedConfigKey = null;
let activeRealtimeChannel = null;

function tripCircuitBreaker(reason) {
  if (isCircuitBroken) {
    return; // Already tripped: do not emit duplicate transitions or re-increment generation
  }
  isCircuitBroken = true;
  currentSessionGeneration++;

  if (activeRealtimeChannel) {
    try { activeRealtimeChannel.unsubscribe(); } catch (e) {}
    activeRealtimeChannel = null;
  }
  if (supabaseClient && supabaseClient.realtime) {
    try { supabaseClient.realtime.disconnect(); } catch (e) {}
  }
  supabaseClient = null;
  cachedConfigUrl = null;
  cachedConfigKey = null;

  console.error("❌ [Supabase Security] " + reason + " Cloud sync permanently locked. Reload required.");
}

export const getActiveSupabaseConfig = () => {
  if (typeof window === 'undefined') {
    return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'no_window' };
  }

  if (isCircuitBroken) {
    return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'circuit_broken' };
  }

  const currentHost = (window.location.hostname || '').toLowerCase();

  // Hard guard: Only 'nvtekxnitwrakunfjayi' project ref is permitted in Supabase URLs
  const checkUrlSafety = (urlStr) => {
    if (!urlStr) return true;
    try {
      const parsed = new URL(urlStr);
      const hostParts = parsed.hostname.toLowerCase().split('.');
      const isSupabaseDomain = hostParts.length === 3 && hostParts[1] === 'supabase' && hostParts[2] === 'co';
      const projectRef = isSupabaseDomain ? hostParts[0] : '';
      if (projectRef !== ALLOWED_TEST_PROJECT_REF) {
        tripCircuitBreaker("Blocked: Only test project 'nvtekxnitwrakunfjayi' is permitted.");
        return false;
      }
    } catch {
      return false;
    }
    return true;
  };

  if (!checkUrlSafety(SUPABASE_CONFIG.url)) {
    return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'production_ref_blocked' };
  }

  if (isLocalEnvironment()) {
    // If the session started offline with no credentials, it must stay offline for the entire session
    if (isSessionLockedOffline) {
      const hasOverrideNow = Boolean(localStorage.getItem('autoparts_test_supabase_url') || localStorage.getItem('autoparts_test_supabase_anon_key'));
      if (hasOverrideNow) {
        tripCircuitBreaker("Test credentials added to an offline session. Mid-session connection prohibited.");
      }
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'session_locked_offline' };
    }

    const rawUrl = localStorage.getItem('autoparts_test_supabase_url') || SUPABASE_CONFIG.url;
    const rawKey = localStorage.getItem('autoparts_test_supabase_anon_key') || SUPABASE_CONFIG.anonKey;
    const testUrl = (rawUrl || '').trim();
    const testKey = (rawKey || '').trim();

    const hasAnyOverride = Boolean(rawUrl || rawKey);

    if (!hasAnyOverride || !testKey) {
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'local_default_offline' };
    }

    if (!checkUrlSafety(testUrl)) {
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'production_ref_blocked' };
    }

    let parsed;
    try {
      parsed = new URL(testUrl);
    } catch {
      tripCircuitBreaker("Malformed test URL.");
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'malformed_url' };
    }

    const hostParts = parsed.hostname.toLowerCase().split('.');
    const isSupabaseDomain = hostParts.length === 3 && hostParts[1] === 'supabase' && hostParts[2] === 'co';
    const projectRef = isSupabaseDomain ? hostParts[0] : '';
    const hasValidPath = parsed.pathname === '/' || parsed.pathname === '';
    const hasNoExtras = !parsed.port && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;

    if (parsed.protocol !== 'https:' || !isSupabaseDomain || !hasValidPath || !hasNoExtras || !/^[a-z0-9_-]+$/.test(projectRef)) {
      tripCircuitBreaker("Invalid test URL structure.");
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'invalid_url_structure' };
    }

    if (projectRef !== ALLOWED_TEST_PROJECT_REF) {
      tripCircuitBreaker("Blocked: Unallowlisted test project ref ('" + projectRef + "'). Only 'nvtekxnitwrakunfjayi' allowed.");
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'unallowlisted_ref_blocked' };
    }

    if (!testKey || testKey.length < 20 || /\s/.test(testKey)) {
      tripCircuitBreaker("Invalid test anon key.");
      return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'invalid_anon_key' };
    }

    return { url: 'https://' + parsed.hostname.toLowerCase(), anonKey: testKey, isTest: true, enabled: true, projectRef: projectRef, reason: 'test_override_active' };
  }

  // Deployed GitHub Pages / Demo Environment (smuzammil2508.github.io/Autoparts-Pro-Demo/)
  if (!ALLOWED_DEMO_HOSTS.includes(currentHost)) {
    console.error("❌ [Supabase Security] Hostname '" + currentHost + "' not in demo allowlist. Failing closed.");
    return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: null, reason: 'unapproved_demo_host_blocked' };
  }

  const demoUrl = (SUPABASE_CONFIG.url || '').trim();
  const demoKey = (SUPABASE_CONFIG.anonKey || '').trim();

  if (!demoUrl || !demoKey || demoKey.length < 20) {
    console.log("🧪 Demo running in Offline Test Mode: Test Supabase anon key pending.");
    return { url: null, anonKey: null, isTest: true, enabled: false, projectRef: ALLOWED_TEST_PROJECT_REF, reason: 'missing_test_key' };
  }

  return { url: demoUrl, anonKey: demoKey, isTest: true, enabled: true, projectRef: ALLOWED_TEST_PROJECT_REF, reason: 'demo_test_active' };
};

export const isCloudSyncEnabled = () => {
  if (isCircuitBroken || isSessionLockedOffline) return false;
  return getActiveSupabaseConfig().enabled;
};

try {
  const activeConfig = getActiveSupabaseConfig();
  if (isLocalEnvironment() && !activeConfig.enabled) {
    isSessionLockedOffline = true;
    console.log("🧪 Running in Local Test Mode: Supabase Cloud Sync is disabled to protect deployed production data.");
  } else if (activeConfig.enabled && window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(activeConfig.url, activeConfig.anonKey);
    cachedConfigUrl = activeConfig.url;
    cachedConfigKey = activeConfig.anonKey;
    if (activeConfig.isTest) {
      console.log("🧪 [Supabase Test Client] Connected to test project ref: " + activeConfig.projectRef);
    }
  }
} catch (err) {
  console.warn("Supabase client init warning:", err);
}

export class StorageManager {
  static getClient() {
    if (isCircuitBroken) {
      return null;
    }
    const activeConfig = getActiveSupabaseConfig();

    // Detect configuration change or removal after client initialization
    if (supabaseClient && (!activeConfig.enabled || cachedConfigUrl !== activeConfig.url || cachedConfigKey !== activeConfig.anonKey)) {
      tripCircuitBreaker("Configuration change or removal detected after initialization.");
      return null;
    }

    if (isSessionLockedOffline || !activeConfig.enabled) {
      return null;
    }

    if (!supabaseClient && window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(activeConfig.url, activeConfig.anonKey);
      cachedConfigUrl = activeConfig.url;
      cachedConfigKey = activeConfig.anonKey;
    }
    return supabaseClient;
  }

  static isCloudSyncEnabled() {
    return isCloudSyncEnabled();
  }

  // --- CASHIER AUTHENTICATION (Phase 5 Supabase Auth) ---
  static async signIn(email, password) {
    const client = this.getClient();
    if (!client) {
      return {
        data: { user: null, session: null },
        error: new Error("Supabase client is not connected (Offline / Local Test Mode).")
      };
    }
    return await client.auth.signInWithPassword({ email, password });
  }

  static async signOut() {
    const client = this.getClient();
    if (!client) {
      return { error: null };
    }
    return await client.auth.signOut();
  }

  static async getSession() {
    const client = this.getClient();
    if (!client) {
      return { data: { session: null }, error: null };
    }
    return await client.auth.getSession();
  }

  static onAuthStateChange(callback) {
    const client = this.getClient();
    if (!client) {
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      };
    }
    return client.auth.onAuthStateChange(callback);
  }

  // Aliases for explicit semantic clarity
  static async signInCashier(email, password) { return this.signIn(email, password); }
  static async signOutCashier() { return this.signOut(); }
  static async getCashierSession() { return this.getSession(); }
  static onCashierAuthStateChange(callback) { return this.onAuthStateChange(callback); }

  // --- PRODUCTS ---
  static getProducts() {
    // 1. Return local cache immediately for 0ms startup
    let cached = null;
    const local = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (local !== null) {
      try {
        cached = JSON.parse(local);
      } catch (e) {
        console.error("Error parsing local products:", e);
      }
    }

    if (cached === null) {
      cached = [];
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
      localStorage.setItem('autoparts_is_production_clean', 'true');
    }

    // 2. ALWAYS trigger async cloud synchronization in background if cloud sync is enabled!
    if (isCloudSyncEnabled()) {
      this.syncProductsFromCloud();
    } else {
      this.updateSyncBadge(false);
    }
    return cached;
  }

  static async initCloudSync(appContext) {
    this.app = appContext;
    
    if (!isCloudSyncEnabled()) {
      console.log("🧪 [Local Test Mode] Cloud sync & WebSockets are disabled. All changes are stored locally in this browser.");
      this.updateSyncBadge(false);
      return;
    }

    // Initial fetch from cloud for all modules
    await this.syncProductsFromCloud();
    await this.syncOutflowsFromCloud();
    await this.syncDefectiveReturnsFromCloud();
    await this.syncPriceCatalogFromCloud();

    // Set up Realtime WebSockets
    this.setupRealtimeSubscriptions(appContext);

    // Auto re-sync when tab becomes visible or internet reconnects
    window.addEventListener('online', () => {
      if (isCircuitBroken || !isCloudSyncEnabled()) return;
      console.log("🌐 Internet reconnected — syncing with Supabase cloud...");
      this.syncProductsFromCloud();
      this.syncOutflowsFromCloud();
      this.syncPriceCatalogFromCloud();
    });

    window.addEventListener('visibilitychange', () => {
      if (isCircuitBroken || !isCloudSyncEnabled()) return;
      if (document.visibilityState === 'visible') {
        this.syncProductsFromCloud();
        this.syncPriceCatalogFromCloud();
      }
    });
  }

  static updateSyncBadge(isLive, labelText = "Live Cloud Synced") {
    const badge = document.getElementById('cloud-sync-status-badge');
    const label = document.getElementById('cloud-sync-status-text');
    const dot = document.getElementById('cloud-sync-status-dot');
    if (!badge) return;

    if (!isCloudSyncEnabled()) {
      badge.classList.remove('hidden');
      badge.classList.add('flex');
      if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0";
      if (label) {
        label.textContent = "Local Test Mode";
        label.className = "hidden";
      }
      badge.className = "btn-touch flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-400 shadow-sm transition-all shrink-0 cursor-default";
      badge.title = "Running in Local Test Mode (Offline Sandbox): changes will not affect remote store.";
      return;
    }

    if (isLive) {
      badge.classList.remove('hidden');
      badge.classList.add('flex');
      if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0";
      if (label) {
        label.textContent = "Live Cloud Synced";
        label.className = "hidden";
      }
      badge.className = "btn-touch flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 shadow-sm transition-all shrink-0 cursor-default";
      badge.title = "Cloud Synced: Connected to Supabase PostgreSQL Database. Live updates active.";
    } else {
      badge.classList.remove('hidden');
      badge.classList.add('flex');
      if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0";
      if (label) {
        label.textContent = labelText || "Offline Cache";
        label.className = "hidden";
      }
      badge.className = "btn-touch flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400 shadow-sm transition-all shrink-0 cursor-default";
      badge.title = "Offline Cache: Cloud database is disconnected.";
    }
  }

  static setupRealtimeSubscriptions(appContext) {
    const client = this.getClient();
    if (!client) return;

    try {
      activeRealtimeChannel = client.channel('public:db_sync');
      activeRealtimeChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
          if (isCircuitBroken || !isCloudSyncEnabled()) return;
          console.log("⚡ [Realtime] Cloud product change detected:", payload);
          this.syncProductsFromCloud();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'outflow_logs' }, (payload) => {
          if (isCircuitBroken || !isCloudSyncEnabled()) return;
          console.log("⚡ [Realtime] Cloud sales outflow detected:", payload);
          this.syncOutflowsFromCloud();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'defective_returns' }, (payload) => {
          if (isCircuitBroken || !isCloudSyncEnabled()) return;
          console.log("⚡ [Realtime] Cloud claim update detected:", payload);
          this.syncDefectiveReturnsFromCloud();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'price_catalog' }, (payload) => {
          if (isCircuitBroken || !isCloudSyncEnabled()) return;
          console.log("⚡ [Realtime] Cloud price catalog change detected:", payload);
          this.syncPriceCatalogFromCloud();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log("⚡ Realtime Multi-Device Sync connected successfully!");
            this.updateSyncBadge(true, "Live Cloud Synced");
          }
        });
    } catch (err) {
      console.warn("Realtime subscription warning:", err);
    }
  }

  static async syncProductsFromCloud() {
    if (isCircuitBroken || !isCloudSyncEnabled()) {
      this.updateSyncBadge(false);
      return;
    }
    const client = this.getClient();
    if (!client || !navigator.onLine) {
      this.updateSyncBadge(false, "Offline Cache");
      return;
    }

    const requestGen = currentSessionGeneration;

    try {
      this.updateSyncBadge(true, "Syncing...");
      const { data, error } = await client.from('products').select('*');
      if (isCircuitBroken || requestGen !== currentSessionGeneration || !isCloudSyncEnabled()) return;
      if (!error && data) {
        if (data.length > 0) {
          // Map DB snake_case columns back to JS camelCase
          const mapped = data.map(p => ({
            id: p.id,
            name: p.name,
            partNumber: p.part_number,
            barcode: p.barcode,
            brand: p.brand,
            category: p.category,
            subCategory: p.sub_category,
            vehicleBrand: p.vehicle_brand,
            compatibleModels: Array.isArray(p.compatible_models) ? p.compatible_models : (typeof p.compatible_models === 'string' ? JSON.parse(p.compatible_models) : []),
            costPrice: parseFloat(p.cost_price) || 0,
            sellingPrice: parseFloat(p.selling_price) || 0,
            stockGroundFloor: parseInt(p.stock_ground_floor, 10) || 0,
            stockFloor1: parseInt(p.stock_floor1, 10) || 0,
            stockFloor2: parseInt(p.stock_floor2, 10) || 0,
            rackLocation: p.rack_location,
            minStockAlert: parseInt(p.min_stock_alert, 10) || 2,
            unit: p.unit || 'Piece',
            imageUrl: p.image_url,
            lastPriceUpdated: p.last_price_updated
          }));

          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(mapped));
          localStorage.setItem('autoparts_is_production_clean', 'true');
          
          if (window.app && window.app.products) {
            if (!(window.location && window.location.search && window.location.search.includes('test_stock_cases=1'))) {
              window.app.products = mapped;
              window.app.renderProducts();
              window.app.updateHeaderStats();
            }
          }
          this.updateSyncBadge(true, "Live Cloud Synced");
        } else {
          // Cloud table is empty: Keep production store clean without seeding demo parts
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
          localStorage.setItem('autoparts_is_production_clean', 'true');
          if (window.app && window.app.products) {
            if (!(window.location && window.location.search && window.location.search.includes('test_stock_cases=1'))) {
              window.app.products = [];
              window.app.renderProducts();
              window.app.updateHeaderStats();
            }
          }
          this.updateSyncBadge(true, "Live Cloud Synced");
        }
      }
    } catch (err) {
      console.warn("Cloud product sync error:", err);
      this.updateSyncBadge(false, "Offline Cache");
    }
  }

  static async seedProductsToCloud(partsList) {
    const client = this.getClient();
    if (!client) return;

    const dbRows = partsList.map(p => ({
      id: p.id,
      name: p.name,
      part_number: p.partNumber,
      barcode: p.barcode,
      brand: p.brand,
      category: p.category,
      sub_category: p.subCategory || null,
      vehicle_brand: p.vehicleBrand,
      compatible_models: p.compatibleModels || [],
      cost_price: p.costPrice || 0,
      selling_price: p.sellingPrice || 0,
      stock_ground_floor: p.stockGroundFloor || 0,
      stock_floor1: p.stockFloor1 || 0,
      stock_floor2: p.stockFloor2 || 0,
      rack_location: p.rackLocation,
      min_stock_alert: p.minStockAlert || 2,
      unit: p.unit || 'Piece',
      image_url: p.imageUrl || null
    }));

    try {
      await client.from('products').upsert(dbRows);
      console.log("✅ Successfully seeded 30 parts into Supabase database!");
    } catch (err) {
      console.error("Failed to seed parts to Supabase:", err);
    }
  }

  static saveProducts(products, affectedIds = null) {
    // 1. Instant local persistence (0ms delay)
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    } catch (e) {
      console.error("Local save failed", e);
    }

    // 2. Cloud upsert in background: ONLY upsert affected product rows to avoid full-catalog overwrites
    const client = this.getClient();
    if (client && navigator.onLine && isCloudSyncEnabled()) {
      let targetProducts = products;
      if (affectedIds) {
        const idSet = new Set(Array.isArray(affectedIds) ? affectedIds : [affectedIds]);
        targetProducts = products.filter(p => idSet.has(p.id));
      }
      if (targetProducts.length === 0) return;

      const dbRows = targetProducts.map(p => ({
        id: p.id,
        name: p.name,
        part_number: p.partNumber,
        barcode: p.barcode,
        brand: p.brand,
        category: p.category,
        sub_category: p.subCategory || null,
        vehicle_brand: p.vehicleBrand,
        compatible_models: p.compatibleModels || [],
        cost_price: p.costPrice || 0,
        selling_price: p.sellingPrice || 0,
        stock_ground_floor: p.stockGroundFloor || 0,
        stock_floor1: p.stockFloor1 || 0,
        stock_floor2: p.stockFloor2 || 0,
        rack_location: p.rackLocation,
        min_stock_alert: p.minStockAlert || 2,
        unit: p.unit || 'Piece',
        image_url: p.imageUrl || null,
        last_price_updated: p.lastPriceUpdated || null
      }));

      client.from('products').upsert(dbRows).then(({ error }) => {
        if (error) console.warn("Supabase products upsert warning:", error);
      });
    }
  }

  // --- LOCAL POS CHECKOUT IDEMPOTENCY REGISTRY ---
  static computePayloadHash(payload) {
    const normMethod = (payload.paymentMethod || '').trim().toUpperCase();
    const sortedItems = [...(payload.items || [])].sort((a, b) => (String(a.partId || '')).localeCompare(String(b.partId || '')));
    const canonical = {
      paymentMethod: normMethod,
      items: sortedItems.map(i => ({
        partId: String(i.partId).trim(),
        quantity: parseInt(i.quantity, 10),
        sellingPrice: parseFloat(i.sellingPrice || 0).toFixed(2)
      }))
    };
    return JSON.stringify(canonical);
  }

  static getLocalCheckouts() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.POS_CHECKOUTS_LOCAL);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  static saveLocalCheckout(checkoutId, record) {
    const map = this.getLocalCheckouts();
    map[checkoutId] = record;
    localStorage.setItem(STORAGE_KEYS.POS_CHECKOUTS_LOCAL, JSON.stringify(map));
  }

  static getLastCompletedReceipt() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LAST_RECEIPT);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  static saveLastCompletedReceipt(receipt) {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_RECEIPT, JSON.stringify(receipt));
    } catch (e) {}
  }

  // --- AUTOPARTS ERROR EXTRACTION ---
  static extractAutopartsError(error) {
    if (!error) return null;
    const msg = typeof error === 'string' ? error : (error.message || error.details || '');
    const markerIndex = msg.indexOf('AUTOPARTS_ERROR:');
    if (markerIndex === -1) return null;

    const startIndex = msg.indexOf('{', markerIndex);
    if (startIndex === -1) return null;

    let depth = 0;
    let endIndex = -1;
    for (let i = startIndex; i < msg.length; i++) {
      if (msg[i] === '{') depth++;
      else if (msg[i] === '}') {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex !== -1) {
      try {
        const jsonStr = msg.substring(startIndex, endIndex + 1);
        return JSON.parse(jsonStr);
      } catch (e) {}
    }
    return null;
  }

  // --- POS CART CHECKOUT ---
  static async processCheckout(payload, appContext) {
    const isCloud = this.isCloudSyncEnabled();
    const client = this.getClient();

    if (isCloud) {
      if (!client) {
        return {
          success: false,
          error: "Cloud sync is enabled but database client is unavailable.",
          code: "CLIENT_UNAVAILABLE"
        };
      }

      // Explicit authentication guard: Verify an active, valid authenticated cashier session exists
      let session = null;
      try {
        const { data } = await client.auth.getSession();
        session = data && data.session;
      } catch (sessErr) {
        console.warn("Failed to check auth session before checkout:", sessErr);
      }

      if (!session || !session.user) {
        return {
          success: false,
          error: "Cashier authentication required to process sale in cloud mode. Please sign in.",
          code: "UNAUTHORIZED"
        };
      }

      try {
        const { data, error } = await client.rpc('process_pos_checkout', {
          p_checkout_payload: payload
        });

        if (error) {
          console.error("Supabase RPC process_pos_checkout error:", error);
          let errorDetail = error.message || 'Checkout failed on database server.';
          const parsedErr = this.extractAutopartsError(error);
          if (parsedErr && parsedErr.code) {
            return {
              success: false,
              error: parsedErr.message || errorDetail,
              code: parsedErr.code,
              raw: error
            };
          }

          const isPermissionDenied = error.code === '42501' ||
            (error.message && /permission denied/i.test(error.message));
          if (isPermissionDenied) {
            return {
              success: false,
              error: "Database permission denied. Valid authenticated cashier session required.",
              code: "42501",
              raw: error
            };
          }

          return { success: false, error: errorDetail, code: error.code || 'RPC_ERROR', raw: error };
        }

        // On verified success from PostgreSQL
        if (data && appContext) {
          if (appContext.products) {
            payload.items.forEach(item => {
              const part = appContext.products.find(p => p.id === item.partId);
              if (part) {
                let rem = parseInt(item.quantity, 10) || 0;
                const gDeduct = Math.min(part.stockGroundFloor || 0, rem);
                part.stockGroundFloor = (part.stockGroundFloor || 0) - gDeduct;
                rem -= gDeduct;
                const f1Deduct = Math.min(part.stockFloor1 || 0, rem);
                part.stockFloor1 = (part.stockFloor1 || 0) - f1Deduct;
                rem -= f1Deduct;
                const f2Deduct = Math.min(part.stockFloor2 || 0, rem);
                part.stockFloor2 = (part.stockFloor2 || 0) - f2Deduct;
              }
            });
            localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(appContext.products));
          }

          // Durably record outflow entries into local memory and localStorage for instant Daily Outflow ledger visibility
          const now = new Date();
          const dateStr = payload.dateStr || now.toLocaleDateString('en-IN');
          const timeStr = payload.timeStr || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          const newOutflows = payload.items.map((item, idx) => {
            const part = (appContext.products || []).find(p => p.id === item.partId);
            const qty = parseInt(item.quantity, 10) || 1;
            const unitPrice = parseFloat(item.sellingPrice) || (part ? part.sellingPrice : 0);
            const lineTotal = Math.round(qty * unitPrice * 100) / 100;
            return {
              id: `${payload.checkoutId}:item:${idx + 1}`,
              partId: item.partId,
              partName: part ? part.name : (item.name || 'Auto Part'),
              partNumber: part ? part.partNumber : (item.partNumber || ''),
              brand: part ? part.brand : (item.brand || ''),
              quantity: qty,
              sellingPrice: unitPrice,
              unitPrice: unitPrice,
              totalAmount: lineTotal,
              dateStr: dateStr,
              timeStr: timeStr,
              notes: `Sold via ${payload.paymentMethod || 'CASH'}`
            };
          });

          if (!appContext.outflowLog) appContext.outflowLog = this.getOutflows();
          const existingIds = new Set(appContext.outflowLog.map(o => o.id));
          const fresh = newOutflows.filter(o => !existingIds.has(o.id));
          if (fresh.length > 0) {
            appContext.outflowLog.unshift(...fresh);
            localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, JSON.stringify(appContext.outflowLog));
          }
        }

        return { success: true, receipt: data, isCloud: true };
      } catch (networkErr) {
        console.error("Network error during process_pos_checkout:", networkErr);
        return {
          success: false,
          error: "Network timeout or connection error during checkout. Click 'Retry Sale' to retry with the same checkout ID without double-deduction.",
          code: 'NETWORK_ERROR',
          isNetwork: true
        };
      }
    }

    // Local Test Mode (Offline / Simulated Transactional Execution)
    return this.executeLocalCheckout(payload, appContext);
  }

  static executeLocalCheckout(payload, appContext) {
    // Note: Client-side simulated transaction and idempotency in JavaScript/localStorage.
    // Not an ACID database transaction.
    if (!appContext || !appContext.products) {
      return { success: false, error: "App catalog context not available." };
    }

    const { checkoutId, paymentMethod, items } = payload;
    if (!checkoutId || !/^[a-zA-Z0-9_\-]{8,64}$/.test(checkoutId)) {
      return { success: false, error: "Invalid checkoutId format.", code: "INVALID_CHECKOUT_ID" };
    }

    const normPaymentMethod = (paymentMethod || '').trim().toUpperCase();
    if (normPaymentMethod !== 'CASH' && normPaymentMethod !== 'UPI') {
      return { success: false, error: "Payment method must be CASH or UPI.", code: "INVALID_PAYMENT_METHOD" };
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: "Cart is empty.", code: "EMPTY_CART" };
    }

    // Check duplicate part IDs
    const partIds = items.map(i => i.partId);
    if (new Set(partIds).size !== partIds.length) {
      return { success: false, error: "Duplicate product ID in cart payload.", code: "DUPLICATE_CART_ITEM" };
    }

    // --- LOCAL IDEMPOTENCY CHECK ---
    const payloadHash = this.computePayloadHash(payload);
    const localCheckouts = this.getLocalCheckouts();
    const existing = localCheckouts[checkoutId];

    if (existing) {
      if (existing.payloadHash === payloadHash) {
        // Idempotent retry: Return cached receipt without modifying stock or outflows
        return {
          success: true,
          receipt: existing.receipt,
          isCloud: false,
          isCached: true
        };
      } else {
        // Reusing same checkoutId with altered payload
        return {
          success: false,
          error: "checkoutId was previously committed with a different cart.",
          code: "IDEMPOTENCY_PAYLOAD_MISMATCH"
        };
      }
    }

    // Snapshot pre-transaction state for safe rollback if local persistence fails
    const preTxProducts = JSON.stringify(appContext.products);
    const preTxOutflows = JSON.stringify(appContext.outflowLog || []);
    const preTxCheckouts = JSON.stringify(localCheckouts);

    // Verify all parts exist, prices match, stock suffices
    const affectedParts = [];
    const deductionPlans = [];
    let grandTotal = 0;
    let totalUnits = 0;

    for (const item of items) {
      const part = appContext.products.find(p => p.id === item.partId);
      if (!part) {
        return { success: false, error: `Part with ID "${item.partId}" not found in catalog.`, code: "PART_NOT_FOUND" };
      }

      const dbPrice = parseFloat(part.sellingPrice) || 0;
      if (dbPrice <= 0) {
        return { success: false, error: `Part "${part.name}" has no valid selling price.`, code: "INVALID_SERVER_PRICE" };
      }

      const clientPrice = parseFloat(item.sellingPrice) || 0;
      if (Math.abs(clientPrice - dbPrice) >= 0.01) {
        return {
          success: false,
          error: `Price changed for "${part.name}" (Catalog: ₹ ${dbPrice.toFixed(2)}, Cart: ₹ ${clientPrice.toFixed(2)}). Please refresh cart.`,
          code: "PRICE_DRIFT"
        };
      }

      const reqQty = parseInt(item.quantity, 10);
      if (!Number.isFinite(reqQty) || reqQty < 1 || reqQty > 10000) {
        return { success: false, error: `Invalid quantity for "${part.name}".`, code: "INVALID_QUANTITY" };
      }

      const totalStock = (part.stockGroundFloor || 0) + (part.stockFloor1 || 0) + (part.stockFloor2 || 0);
      if (totalStock < reqQty) {
        return {
          success: false,
          error: `Insufficient stock for "${part.name}". Requested: ${reqQty}, Available: ${totalStock}.`,
          code: "INSUFFICIENT_STOCK"
        };
      }

      const lineTotal = Math.round(reqQty * dbPrice * 100) / 100;
      grandTotal += lineTotal;
      totalUnits += reqQty;

      deductionPlans.push({
        part,
        reqQty,
        dbPrice,
        lineTotal
      });
      affectedParts.push(part.id);
    }

    grandTotal = Math.round(grandTotal * 100) / 100;

    // Execute atomic deduction in memory
    const newOutflows = [];
    const now = new Date();
    const dateStr = payload.dateStr || now.toLocaleDateString('en-IN');
    const timeStr = payload.timeStr || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    deductionPlans.forEach((plan, idx) => {
      const { part, reqQty, dbPrice, lineTotal } = plan;
      let rem = reqQty;
      const deductedFrom = [];

      // Ground Floor
      if ((part.stockGroundFloor || 0) > 0 && rem > 0) {
        const d = Math.min(part.stockGroundFloor, rem);
        part.stockGroundFloor -= d;
        rem -= d;
        deductedFrom.push(`${d} from Ground Floor Stash`);
      }
      // Floor 1
      if ((part.stockFloor1 || 0) > 0 && rem > 0) {
        const d = Math.min(part.stockFloor1, rem);
        part.stockFloor1 -= d;
        rem -= d;
        deductedFrom.push(`${d} from ${part.rackLocation || 'Floor 1'}`);
      }
      // Floor 2
      if ((part.stockFloor2 || 0) > 0 && rem > 0) {
        const d = Math.min(part.stockFloor2, rem);
        part.stockFloor2 -= d;
        rem -= d;
        deductedFrom.push(`${d} from 2nd Floor`);
      }

      const outflowId = `${checkoutId}:item:${idx + 1}`;
      newOutflows.push({
        id: outflowId,
        partId: part.id,
        partName: part.name,
        partNumber: part.partNumber,
        brand: part.brand,
        quantity: reqQty,
        sellingPrice: dbPrice,
        totalAmount: lineTotal,
        dateStr,
        timeStr,
        notes: `Sold via ${normPaymentMethod}: ${deductedFrom.join(', ')}`
      });
    });

    const receipt = {
      success: true,
      checkoutId,
      paymentMethod: normPaymentMethod,
      totalAmount: grandTotal,
      itemsCount: totalUnits,
      timestamp: now.toISOString(),
      dateStr,
      timeStr,
      items: deductionPlans.map(p => ({
        partId: p.part.id,
        name: p.part.name,
        partNumber: p.part.partNumber,
        quantity: p.reqQty,
        unitPrice: p.dbPrice,
        lineTotal: p.lineTotal
      }))
    };

    // Durable persistence with automatic rollback if storage fails partway through
    try {
      // 1. Save only affected products
      this.saveProducts(appContext.products, affectedParts);

      // 2. Save outflows
      if (!appContext.outflowLog) appContext.outflowLog = [];
      appContext.outflowLog.unshift(...newOutflows);
      this.saveOutflows(appContext.outflowLog);

      // 3. Save local checkout record for durable duplicate protection
      const checkoutRecord = {
        id: checkoutId,
        payloadHash,
        paymentMethod: normPaymentMethod,
        totalAmount: grandTotal,
        itemsCount: totalUnits,
        receipt,
        timestamp: now.toISOString(),
        status: 'completed'
      };
      this.saveLocalCheckout(checkoutId, checkoutRecord);

      // 4. Cache last completed receipt for robust receipt recovery
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_RECEIPT, JSON.stringify(receipt));
      } catch (e) {}

      return { success: true, receipt, isCloud: false };
    } catch (persistErr) {
      console.error("Local persistence error during checkout; rolling back in-memory state", persistErr);
      try {
        appContext.products = JSON.parse(preTxProducts);
        appContext.outflowLog = JSON.parse(preTxOutflows);
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, preTxProducts);
        localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, preTxOutflows);
        localStorage.setItem(STORAGE_KEYS.POS_CHECKOUTS_LOCAL, preTxCheckouts);
      } catch (rbErr) {
        console.error("Rollback error:", rbErr);
      }
      return {
        success: false,
        error: "Local storage persistence error. Transaction safely rolled back.",
        code: "LOCAL_PERSISTENCE_ERROR"
      };
    }
  }

  static async deleteProduct(id) {
    // 1. Update local storage
    const list = this.getProducts().filter(p => p.id !== id);
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(list));
    } catch (e) {
      console.error("Local delete failed", e);
    }

    // 2. Delete from Supabase Cloud Database
    const client = this.getClient();
    if (client && navigator.onLine) {
      try {
        const { error } = await client.from('products').delete().eq('id', id);
        if (error) console.warn("Supabase delete warning:", error);
        else console.log(`🗑️ Successfully deleted product ${id} from Supabase Cloud!`);
      } catch (err) {
        console.warn("Cloud delete error:", err);
      }
    }
  }

  // --- VEHICLE BRANDS ---
  static getVehicleBrands() {
    const data = localStorage.getItem(STORAGE_KEYS.VEHICLE_BRANDS);
    return data ? JSON.parse(data) : DEFAULT_VEHICLE_BRANDS;
  }

  static saveVehicleBrands(brands) {
    localStorage.setItem(STORAGE_KEYS.VEHICLE_BRANDS, JSON.stringify(brands));
    const client = this.getClient();
    if (client && navigator.onLine) {
      client.from('vehicle_brands').upsert(brands).then(() => {});
    }
  }

  // --- CATEGORIES ---
  static getCategories() {
    const data = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    return data ? JSON.parse(data) : DEFAULT_CATEGORIES;
  }

  static saveCategories(categories) {
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    const client = this.getClient();
    if (client && navigator.onLine) {
      client.from('categories').upsert(categories).then(() => {});
    }
  }

  // --- VEHICLE ALIASES (LEARNED SUPPLIER SHORT CODES) ---
  static getVehicleAliases() {
    const data = localStorage.getItem(STORAGE_KEYS.VEHICLE_ALIASES);
    return data ? { ...DEFAULT_VEHICLE_ALIASES, ...JSON.parse(data) } : DEFAULT_VEHICLE_ALIASES;
  }

  static saveVehicleAliases(aliases) {
    localStorage.setItem(STORAGE_KEYS.VEHICLE_ALIASES, JSON.stringify(aliases));
  }

  // --- OUTFLOWS / SALES ---
  static getOutflows() {
    const data = localStorage.getItem(STORAGE_KEYS.OUTFLOW_LOG);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, JSON.stringify([]));
      return [];
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  static async syncOutflowsFromCloud() {
    if (isCircuitBroken || !this.isCloudSyncEnabled()) return;
    const client = this.getClient();
    if (!client || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;

    const requestGen = currentSessionGeneration;

    try {
      const { data, error } = await client.from('outflow_logs').select('*');
      if (isCircuitBroken || requestGen !== currentSessionGeneration || !this.isCloudSyncEnabled()) return;
      if (!error && data && data.length > 0) {
        const mapped = data.map(s => ({
          id: s.id,
          partId: s.part_id,
          partName: s.part_name,
          partNumber: s.part_number,
          brand: s.brand,
          quantity: s.quantity,
          sellingPrice: parseFloat(s.selling_price) || 0,
          unitPrice: parseFloat(s.selling_price) || 0,
          totalAmount: parseFloat(s.total_amount) || 0,
          dateStr: s.date_str || (s.created_at ? s.created_at.slice(0, 10) : ''),
          timeStr: s.time_str || '',
          notes: s.notes || ''
        }));

        // Deduplicate and merge with local outflows so offline / local records are preserved
        const localList = this.getOutflows();
        const mergedMap = new Map();
        localList.forEach(item => { if (item && item.id) mergedMap.set(item.id, item); });
        mapped.forEach(item => {
          if (item && item.id) {
            const existing = mergedMap.get(item.id) || {};
            mergedMap.set(item.id, { ...existing, ...item });
          }
        });
        const finalLog = Array.from(mergedMap.values());
        localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, JSON.stringify(finalLog));
        if (window.app) {
          window.app.outflowLog = finalLog;
          window.app.updateHeaderStats();
          if (window.app.workspace === 'outflow' || (document.getElementById('daily-outflow-modal') && !document.getElementById('daily-outflow-modal').classList.contains('hidden'))) {
            window.app.renderOutflowTableWithFilter(window.app.currentOutflowFilter || 'today');
          }
        }
      }
    } catch (e) {
      console.warn("Outflow sync warning:", e);
    }
  }

  static saveOutflows(log) {
    localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, JSON.stringify(log));
    const client = this.getClient();
    if (client && typeof client.from === 'function' && navigator.onLine) {
      const dbRows = log.map(s => ({
        id: s.id,
        part_id: s.partId,
        part_name: s.partName,
        part_number: s.partNumber,
        brand: s.brand,
        quantity: s.quantity,
        selling_price: s.sellingPrice || s.unitPrice || 0,
        total_amount: s.totalAmount || 0,
        date_str: s.dateStr,
        time_str: s.timeStr,
        notes: s.notes || s.note || ''
      }));
      client.from('outflow_logs').upsert(dbRows).then(() => {});
    }
  }

  // --- DEFECTIVE RETURNS ---
  static getDefectiveReturns() {
    const data = localStorage.getItem(STORAGE_KEYS.DEFECTIVE_RETURNS);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.DEFECTIVE_RETURNS, JSON.stringify([]));
      return [];
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  static async syncDefectiveReturnsFromCloud() {
    if (isCircuitBroken || !isCloudSyncEnabled()) return;
    const client = this.getClient();
    if (!client || !navigator.onLine) return;

    const requestGen = currentSessionGeneration;

    try {
      const { data, error } = await client.from('defective_returns').select('*');
      if (isCircuitBroken || requestGen !== currentSessionGeneration || !isCloudSyncEnabled()) return;
      if (!error && data && data.length > 0) {
        const mapped = data.map(r => ({
          id: r.id,
          partId: r.part_id,
          partName: r.part_name,
          partNumber: r.part_number,
          brand: r.brand,
          vehicleBrand: r.vehicle_brand,
          quantity: r.quantity,
          costPrice: parseFloat(r.cost_price) || 0,
          sellingPrice: parseFloat(r.selling_price) || 0,
          defectReason: r.defect_reason,
          status: r.status,
          creditNoteRef: r.credit_note_ref || '',
          dateStr: r.date_str,
          timeStr: r.time_str,
          returnedDateStr: r.returned_date_str || null
        }));
        localStorage.setItem(STORAGE_KEYS.DEFECTIVE_RETURNS, JSON.stringify(mapped));
        if (window.app) {
          window.app.defectiveReturns = mapped;
          window.app.updateHeaderStats();
        }
      }
    } catch (e) {
      console.warn("Defective returns sync warning:", e);
    }
  }

  static saveDefectiveReturns(records) {
    localStorage.setItem(STORAGE_KEYS.DEFECTIVE_RETURNS, JSON.stringify(records));
    const client = this.getClient();
    if (client && navigator.onLine) {
      const dbRows = records.map(r => ({
        id: r.id,
        part_id: r.partId,
        part_name: r.partName,
        part_number: r.partNumber,
        brand: r.brand,
        vehicle_brand: r.vehicleBrand,
        quantity: r.quantity,
        cost_price: r.costPrice,
        selling_price: r.sellingPrice,
        defect_reason: r.defectReason,
        status: r.status,
        credit_note_ref: r.creditNoteRef || '',
        date_str: r.dateStr,
        time_str: r.timeStr,
        returned_date_str: r.returnedDateStr || null
      }));
      client.from('defective_returns').upsert(dbRows).then(() => {});
    }
  }

  static addDefectiveReturn(record) {
    const list = this.getDefectiveReturns();
    const newRecord = {
      id: "def-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      dateStr: new Date().toLocaleDateString(),
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: "pending_wholesaler",
      wholesalerReturnedAt: null,
      ...record
    };
    list.unshift(newRecord);
    this.saveDefectiveReturns(list);
    return newRecord;
  }

  static markDefectiveReturnedToWholesaler(recordId, creditNoteRef = "") {
    const list = this.getDefectiveReturns();
    const index = list.findIndex(r => r.id === recordId);
    if (index !== -1) {
      list[index].status = "returned_to_wholesaler";
      list[index].returnedDateStr = new Date().toLocaleDateString();
      list[index].wholesalerReturnedAt = new Date().toISOString();
      list[index].creditNoteRef = creditNoteRef;
      this.saveDefectiveReturns(list);
      return list[index];
    }
    return null;
  }

  // --- PRICE CATALOG / ON-ORDER ITEMS ---
  static getPriceCatalog() {
    let cached = null;
    const local = localStorage.getItem(STORAGE_KEYS.PRICE_CATALOG);
    if (local !== null) {
      try {
        cached = JSON.parse(local);
      } catch (e) {
        console.error("Error parsing price catalog:", e);
      }
    }
    if (cached === null) {
      cached = [];
      localStorage.setItem(STORAGE_KEYS.PRICE_CATALOG, JSON.stringify([]));
    }
    if (isCloudSyncEnabled()) {
      this.syncPriceCatalogFromCloud();
    }
    return cached;
  }

  static async syncPriceCatalogFromCloud() {
    if (isCircuitBroken || !isCloudSyncEnabled()) return;
    const client = this.getClient();
    if (!client || !navigator.onLine) return;

    const requestGen = currentSessionGeneration;

    try {
      const { data, error } = await client
        .from('price_catalog')
        .select('*')
        .order('name');

      if (isCircuitBroken || requestGen !== currentSessionGeneration || !isCloudSyncEnabled()) return;

      if (!error && data) {
        const mapped = data.map(item => ({
          id: item.id,
          name: item.name,
          partNumber: item.part_number,
          brand: item.brand || 'OEM',
          vehicleBrand: item.vehicle_brand || 'Universal',
          compatibleModels: Array.isArray(item.compatible_models) ? item.compatible_models : (item.compatible_models ? JSON.parse(item.compatible_models) : []),
          category: item.category || 'General',
          wholesalerName: item.wholesaler_name || '',
          wholesalerPhone: item.wholesaler_phone || '',
          costPrice: parseFloat(item.cost_price) || 0,
          sellingPrice: parseFloat(item.selling_price) || 0,
          leadTime: item.lead_time || 'Same Day',
          notes: item.notes || '',
          lastPriceUpdated: item.last_price_updated || item.created_at || new Date().toISOString()
        }));

        localStorage.setItem(STORAGE_KEYS.PRICE_CATALOG, JSON.stringify(mapped));
        if (window.app && window.app.priceBookManager) {
          window.app.priceBookManager.catalog = mapped;
          window.app.priceBookManager.renderCatalog();
        }
      }
    } catch (err) {
      console.warn("Price catalog cloud sync note:", err);
    }
  }

  static savePriceCatalog(catalog) {
    localStorage.setItem(STORAGE_KEYS.PRICE_CATALOG, JSON.stringify(catalog));
    const client = this.getClient();
    if (client && navigator.onLine && isCloudSyncEnabled()) {
      const dbRows = catalog.map(p => ({
        id: p.id,
        name: p.name,
        part_number: p.partNumber,
        brand: p.brand || 'OEM',
        vehicle_brand: p.vehicleBrand || 'Universal',
        compatible_models: p.compatibleModels || [],
        category: p.category || 'General',
        wholesaler_name: p.wholesalerName || '',
        wholesaler_phone: p.wholesalerPhone || '',
        cost_price: parseFloat(p.costPrice) || 0,
        selling_price: parseFloat(p.sellingPrice) || 0,
        lead_time: p.leadTime || 'Same Day',
        notes: p.notes || '',
        last_price_updated: p.lastPriceUpdated || new Date().toISOString()
      }));

      client.from('price_catalog').upsert(dbRows).then(({ error }) => {
        if (error) {
          console.warn("Could not upsert to price_catalog cloud table (local storage updated successfully):", error.message);
        }
      });
    }
  }

  static addPriceCatalogItem(item) {
    const list = this.getPriceCatalog();
    const newItem = {
      id: "ord-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      createdAt: new Date().toISOString(),
      lastPriceUpdated: new Date().toISOString(),
      ...item
    };
    list.unshift(newItem);
    this.savePriceCatalog(list);
    return newItem;
  }

  static updatePriceCatalogItem(id, updates) {
    const list = this.getPriceCatalog();
    const index = list.findIndex(p => p.id === id);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        ...updates,
        lastPriceUpdated: new Date().toISOString()
      };
      this.savePriceCatalog(list);
      return list[index];
    }
    return null;
  }

  static deletePriceCatalogItem(id) {
    const list = this.getPriceCatalog().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PRICE_CATALOG, JSON.stringify(list));
    const client = this.getClient();
    if (client && navigator.onLine && isCloudSyncEnabled()) {
      client.from('price_catalog').delete().eq('id', id).then(() => {});
    }
    return list;
  }

  static convertPriceCatalogItemToStock(catalogId, stockConfig = {}) {
    const catalogList = this.getPriceCatalog();
    const item = catalogList.find(p => p.id === catalogId);
    if (!item) return null;

    // Create physical product
    const newProduct = {
      id: "part-" + Date.now(),
      name: item.name,
      partNumber: item.partNumber || ("SKU-" + Date.now().toString().slice(-6)),
      barcode: item.partNumber || Date.now().toString().slice(-12),
      brand: item.brand || 'OEM',
      category: item.category || 'General',
      vehicleBrand: item.vehicleBrand || 'Universal',
      compatibleModels: item.compatibleModels || [],
      costPrice: parseFloat(item.costPrice) || 0,
      sellingPrice: parseFloat(item.sellingPrice) || 0,
      stockFloor1: parseInt(stockConfig.stockFloor1) || 0,
      stockFloor2: parseInt(stockConfig.stockFloor2) || 0,
      stockGroundFloor: parseInt(stockConfig.stockGroundFloor) || 0,
      rackLocation: stockConfig.rackLocation || 'Floor 1 - Rack A-01',
      minStockAlert: parseInt(stockConfig.minStockAlert) || 1,
      unit: stockConfig.unit || 'Piece',
      imageUrl: item.imageUrl || null
    };

    // Save to physical products
    this.saveProduct(newProduct);
    return newProduct;
  }

  // --- SETTINGS ---
  static getSettings() {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  }

  static saveSettings(settings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    const client = this.getClient();
    if (client && navigator.onLine) {
      client.from('shop_settings').upsert([{
        id: 'default',
        store_name: settings.storeName,
        currency_symbol: settings.currencySymbol,
        cipher_keyword: settings.cipherKeyword,
        sticker_format: settings.stickerFormat,
        sound_enabled: settings.soundEnabled,
        theme: settings.theme
      }]).then(() => {});
    }
  }

  // --- PRICE HISTORY ---
  static getPriceHistory() {
    const data = localStorage.getItem(STORAGE_KEYS.PRICE_HISTORY);
    return data ? JSON.parse(data) : [];
  }

  static savePriceHistory(history) {
    localStorage.setItem(STORAGE_KEYS.PRICE_HISTORY, JSON.stringify(history));
    const client = this.getClient();
    if (client && navigator.onLine) {
      const dbRows = history.map(h => ({
        id: h.id,
        description: h.description,
        affected_count: h.affectedCount,
        date_str: h.dateStr,
        time_str: h.timeStr,
        previous_products_backup: h.previousProductsBackup
      }));
      client.from('price_history').upsert(dbRows).then(() => {});
    }
  }

  static addPriceRevisionSnapshot(description, currentProducts, affectedCount = 0) {
    const list = this.getPriceHistory();
    const newEntry = {
      id: "prev-" + Date.now(),
      timestamp: new Date().toISOString(),
      dateStr: new Date().toLocaleDateString(),
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      description,
      affectedCount,
      previousProductsBackup: JSON.parse(JSON.stringify(currentProducts))
    };
    list.unshift(newEntry);
    if (list.length > 30) list.pop();
    this.savePriceHistory(list);
    return newEntry;
  }

  static startFreshProductionData(options = { keepTaxonomy: true }) {
    localStorage.setItem('autoparts_is_production_clean', 'true');
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.DEFECTIVE_RETURNS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PRICE_HISTORY, JSON.stringify([]));

    if (!options.keepTaxonomy) {
      localStorage.removeItem(STORAGE_KEYS.VEHICLE_BRANDS);
      localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
    }

    return {
      products: [],
      outflowLog: [],
      defectiveReturns: [],
      vehicleBrands: this.getVehicleBrands(),
      categories: this.getCategories(),
      settings: this.getSettings()
    };
  }

  static resetToDemoData() {
    const demoOutflows = this.createDemoSales();
    const demoReturns = this.createDemoDefectiveReturns();
    localStorage.setItem('autoparts_is_production_clean', 'false');
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(SAMPLE_DEMO_PARTS));
    localStorage.setItem(STORAGE_KEYS.OUTFLOW_LOG, JSON.stringify(demoOutflows));
    localStorage.setItem(STORAGE_KEYS.DEFECTIVE_RETURNS, JSON.stringify(demoReturns));
    return {
      products: SAMPLE_DEMO_PARTS,
      vehicleBrands: this.getVehicleBrands(),
      categories: this.getCategories(),
      outflowLog: demoOutflows,
      settings: this.getSettings(),
      defectiveReturns: demoReturns
    };
  }

  static createDemoDefectiveReturns() {
    const now = new Date();
    const time1 = new Date(now.getTime() - 4 * 3600000);
    return [
      {
        id: "def-demo-1",
        timestamp: time1.toISOString(),
        dateStr: time1.toLocaleDateString(),
        timeStr: time1.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        partId: "part-021",
        partName: "Front Wheel Bearing Hub Assembly",
        partNumber: "WB-SKF-550",
        brand: "SKF Bearings",
        vehicleBrand: "Volkswagen",
        quantity: 1,
        costPrice: 1400.00,
        sellingPrice: 2600.00,
        defectReason: "Customer reported humming bearing noise on installation (Defective race)",
        status: "pending_wholesaler",
        wholesalerReturnedAt: null,
        creditNoteRef: ""
      }
    ];
  }

  static createDemoSales() {
    const now = new Date();
    const time1 = new Date(now.getTime() - 25 * 60000);
    const time2 = new Date(now.getTime() - 95 * 60000);
    const time3 = new Date(now.getTime() - 180 * 60000);

    return [
      {
        id: "outflow-demo-1",
        timestamp: time1.toISOString(),
        dateStr: time1.toLocaleDateString(),
        timeStr: time1.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        partId: "part-006",
        partName: "Spin-On Engine Oil Filter",
        partNumber: "OF-TY-101",
        brand: "Denso Genuine",
        vehicleBrand: "Toyota",
        quantity: 2,
        sellingPrice: 380.00,
        totalAmount: 760.00,
        notes: "Sold from Floor 1 - Rack F-01"
      },
      {
        id: "outflow-demo-2",
        timestamp: time2.toISOString(),
        dateStr: time2.toLocaleDateString(),
        timeStr: time2.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        partId: "part-010",
        partName: "Iridium IX Spark Plug (Pack of 4)",
        partNumber: "SP-NGK-664",
        brand: "NGK",
        vehicleBrand: "Universal",
        quantity: 1,
        sellingPrice: 1850.00,
        totalAmount: 1850.00,
        notes: "Sold from Ground Floor Stash"
      },
      {
        id: "outflow-demo-3",
        timestamp: time3.toISOString(),
        dateStr: time3.toLocaleDateString(),
        timeStr: time3.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        partId: "part-020",
        partName: "Frameless Aero Wiper Blade 24\" + 16\" (Pair)",
        partNumber: "WP-BS-2416",
        brand: "Bosch ClearAdvantage",
        vehicleBrand: "Universal",
        quantity: 1,
        sellingPrice: 750.00,
        totalAmount: 750.00,
        notes: "Sold from Ground Floor Stash"
      }
    ];
  }

  static getActiveProjectInfo() {
    const config = getActiveSupabaseConfig();
    return {
      environment: isLocalEnvironment() ? 'local' : 'production',
      cloudSyncEnabled: config.enabled && !isCircuitBroken && !isSessionLockedOffline,
      isCircuitBroken: isCircuitBroken,
      isSessionLockedOffline: isSessionLockedOffline,
      sessionGeneration: currentSessionGeneration,
      isTestOverride: config.isTest,
      projectRef: config.projectRef || null,
      projectUrl: config.url || null
    };
  }
}

if (typeof window !== 'undefined' && isLocalEnvironment()) {
  window.StorageManager = StorageManager;
}
