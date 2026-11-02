// Bulk Brand Price Revision & Wholesaler CSV Importer Engine
// Features: Percentage/flat revisions, Smart retail rounding (₹10/₹50), CSV distributor sheet matching, and 1-Click Rollback

export class PriceRevisionManager {
  constructor(appContext) {
    this.app = appContext;
    this.csvMatchedResults = null;
  }

  openPriceRevisionModal(tab = 'brand') {
    this.app.sound.playClick();
    const modal = document.getElementById('price-revision-modal');
    if (!modal) return;

    this.populatePriceRevisionDropdowns();
    this.switchPriceRevisionTab(tab);
    this.calculateBrandPriceRevisionPreview();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closePriceRevisionModal() {
    const modal = document.getElementById('price-revision-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  populatePriceRevisionDropdowns() {
    const brandSelect = document.getElementById('revision-brand-select');
    const catSelect = document.getElementById('revision-category-select');

    if (brandSelect) {
      const uniqueMfrs = [...new Set(this.app.products.map(p => p.brand).filter(Boolean))].sort();
      brandSelect.innerHTML = `<option value="ALL">★ All Manufacturer Brands (${uniqueMfrs.length} Brands)</option>` +
        uniqueMfrs.map(b => `<option value="${b}">${b}</option>`).join('');
    }

    if (catSelect) {
      const uniqueCats = [...new Set(this.app.products.map(p => p.category).filter(Boolean))].sort();
      catSelect.innerHTML = `<option value="ALL">★ All Categories (${uniqueCats.length} Categories)</option>` +
        uniqueCats.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  }

  switchPriceRevisionTab(tabName) {
    const btnBrand = document.getElementById('btn-tab-revision-brand');
    const btnCsv = document.getElementById('btn-tab-revision-csv');
    const btnHist = document.getElementById('btn-tab-revision-history');

    const secBrand = document.getElementById('revision-brand-section');
    const secCsv = document.getElementById('revision-csv-section');
    const secHist = document.getElementById('revision-history-section');

    const activeClass = "px-4 py-2 rounded-t-xl bg-purple-600 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm";
    const inactiveClass = "px-4 py-2 rounded-t-xl bg-slate-800 text-slate-400 text-xs font-bold transition-all flex items-center gap-1.5";

    if (btnBrand) btnBrand.className = tabName === 'brand' ? activeClass : inactiveClass;
    if (btnCsv) btnCsv.className = tabName === 'csv' ? activeClass : inactiveClass;
    if (btnHist) btnHist.className = tabName === 'history' ? activeClass : inactiveClass;

    if (secBrand) secBrand.classList.toggle('hidden', tabName !== 'brand');
    if (secCsv) secCsv.classList.toggle('hidden', tabName !== 'csv');
    if (secHist) secHist.classList.toggle('hidden', tabName !== 'history');

    if (tabName === 'brand') {
      this.calculateBrandPriceRevisionPreview();
    } else if (tabName === 'history') {
      this.renderPriceRevisionHistoryTable();
    }
  }

  calculateBrandPriceRevisionPreview() {
    const targetBrand = document.getElementById('revision-brand-select')?.value || 'ALL';
    const targetCat = document.getElementById('revision-category-select')?.value || 'ALL';
    const typeEl = document.getElementById('revision-type-select') || document.getElementById('revision-type');
    const valueEl = document.getElementById('revision-value-input') || document.getElementById('revision-value');
    const applyToEl = document.getElementById('revision-apply-to') || document.getElementById('revision-apply-to-select');
    const roundingEl = document.getElementById('revision-round-select') || document.getElementById('revision-rounding');

    const type = typeEl?.value || 'percent_inc';
    const value = parseFloat(valueEl?.value || 0) || 0;
    const applyTo = applyToEl?.value || 'selling_and_cost';
    const rounding = roundingEl?.value || '10';

    const countBadge = document.getElementById('revision-affected-count');
    const tbody = document.getElementById('revision-preview-tbody');
    if (!tbody) return;

    const matchingParts = this.app.products.filter(p => {
      const matchB = (targetBrand === 'ALL' || (p.brand || '').toLowerCase() === targetBrand.toLowerCase() || targetBrand === 'all');
      const matchC = (targetCat === 'ALL' || (p.category || '').toLowerCase() === targetCat.toLowerCase() || targetCat === 'all');
      return matchB && matchC;
    });

    if (countBadge) countBadge.textContent = `${matchingParts.length} parts match`;

    if (matchingParts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="p-6 text-center text-slate-400 text-xs">
            No parts match the selected Brand and Category filter.
          </td>
        </tr>
      `;
      return;
    }

    const roundNum = (num, mode) => {
      if (mode === '10') return Math.round(num / 10) * 10;
      if (mode === '50') return Math.round(num / 50) * 50;
      if (mode === '100') return Math.round(num / 100) * 100;
      if (mode === 'none' || mode === '1') return Math.round(num);
      return Math.round(num);
    };

    const calcNewPrice = (oldPrice, costPrice = 0) => {
      let res = oldPrice;
      if (type === 'percent_inc') res = oldPrice * (1 + value / 100);
      else if (type === 'percent_dec') res = oldPrice * (1 - value / 100);
      else if (type === 'flat_inc') res = oldPrice + value;
      else if (type === 'flat_dec') res = Math.max(0, oldPrice - value);
      else if (type === 'cost_margin') res = (costPrice || oldPrice) * (1 + value / 100);
      return roundNum(res, rounding);
    };

    tbody.innerHTML = matchingParts.slice(0, 15).map(p => {
      const oldSelling = p.sellingPrice || 0;
      const oldCost = p.costPrice || 0;
      const newSelling = (applyTo === 'selling_only' || applyTo === 'selling_and_cost' || type === 'cost_margin') ? calcNewPrice(oldSelling, oldCost) : oldSelling;
      const newCost = (applyTo === 'cost_only' || applyTo === 'selling_and_cost') && type !== 'cost_margin' ? calcNewPrice(oldCost, oldCost) : oldCost;

      const sellingDiff = newSelling - oldSelling;
      const costDiff = newCost - oldCost;

      return `
        <tr class="hover:bg-slate-800/50">
          <td class="p-2.5">
            <div class="font-bold text-slate-200">${p.name}</div>
            <div class="text-[10px] text-slate-400 font-mono">${p.partNumber} • ${p.brand}</div>
          </td>
          <td class="p-2.5 font-mono text-slate-300">
            ${this.app.formatCurrency(oldCost)}
          </td>
          <td class="p-2.5 font-mono font-bold ${costDiff > 0 ? 'text-amber-400' : (costDiff < 0 ? 'text-emerald-400' : 'text-slate-300')}">
            ${this.app.formatCurrency(newCost)}
            ${costDiff !== 0 ? `<span class="text-[9px] block ${costDiff > 0 ? 'text-amber-400' : 'text-emerald-400'}">(${costDiff > 0 ? '+' : ''}${costDiff})</span>` : ''}
          </td>
          <td class="p-2.5 font-mono text-slate-300">
            ${this.app.formatCurrency(oldSelling)}
          </td>
          <td class="p-2.5 font-mono font-bold ${sellingDiff > 0 ? 'text-emerald-400' : (sellingDiff < 0 ? 'text-rose-400' : 'text-slate-300')}">
            ${this.app.formatCurrency(newSelling)}
            ${sellingDiff !== 0 ? `<span class="text-[9px] block ${sellingDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}">(${sellingDiff > 0 ? '+' : ''}${sellingDiff})</span>` : ''}
          </td>
        </tr>
      `;
    }).join('') + (matchingParts.length > 15 ? `
      <tr>
        <td colspan="5" class="p-2 text-center text-xs text-purple-300 bg-purple-950/30">
          + and ${matchingParts.length - 15} more parts will be updated simultaneously!
        </td>
      </tr>
    ` : '');
  }

  applyBrandPriceRevision() {
    const targetBrand = document.getElementById('revision-brand-select')?.value || 'ALL';
    const targetCat = document.getElementById('revision-category-select')?.value || 'ALL';
    const typeEl = document.getElementById('revision-type-select') || document.getElementById('revision-type');
    const valueEl = document.getElementById('revision-value-input') || document.getElementById('revision-value');
    const applyToEl = document.getElementById('revision-apply-to') || document.getElementById('revision-apply-to-select');
    const roundingEl = document.getElementById('revision-round-select') || document.getElementById('revision-rounding');

    const type = typeEl?.value || 'percent_inc';
    const value = parseFloat(valueEl?.value || 0) || 0;
    const applyTo = applyToEl?.value || 'selling_and_cost';
    const rounding = roundingEl?.value || '10';

    if (value === 0) {
      this.app.showToast("Please enter a revision value greater than 0!", "error");
      return;
    }

    const roundNum = (num, mode) => {
      if (mode === '10') return Math.round(num / 10) * 10;
      if (mode === '50') return Math.round(num / 50) * 50;
      if (mode === '100') return Math.round(num / 100) * 100;
      if (mode === 'none' || mode === '1') return Math.round(num);
      return Math.round(num);
    };

    const calcNewPrice = (oldPrice, costPrice = 0) => {
      let res = oldPrice;
      if (type === 'percent_inc') res = oldPrice * (1 + value / 100);
      else if (type === 'percent_dec') res = oldPrice * (1 - value / 100);
      else if (type === 'flat_inc') res = oldPrice + value;
      else if (type === 'flat_dec') res = Math.max(0, oldPrice - value);
      else if (type === 'cost_margin') res = (costPrice || oldPrice) * (1 + value / 100);
      return roundNum(res, rounding);
    };

    let affectedCount = 0;
    const affectedPartIds = [];
    const desc = `Bulk Revision: ${targetBrand} (${targetCat}) ${type.includes('inc') ? '+' : '-'}${value}${type.includes('percent') ? '%' : '₹'}`;

    // Save snapshot before mutating
    this.app.storage.addPriceRevisionSnapshot(desc, this.app.products, 0);

    this.app.products.forEach(p => {
      const matchB = (targetBrand === 'ALL' || (p.brand || '').toLowerCase() === targetBrand.toLowerCase());
      const matchC = (targetCat === 'ALL' || (p.category || '').toLowerCase() === targetCat.toLowerCase());

      if (matchB && matchC) {
        if (applyTo === 'selling_only' || applyTo === 'selling_and_cost') {
          p.sellingPrice = calcNewPrice(p.sellingPrice || 0);
        }
        if (applyTo === 'cost_only' || applyTo === 'selling_and_cost') {
          p.costPrice = calcNewPrice(p.costPrice || 0);
        }
        p.lastPriceUpdated = new Date().toISOString();
        affectedPartIds.push(p.id);
        affectedCount++;
      }
    });

    this.app.saveProducts(affectedPartIds);
    this.app.sound.playSaleChime();
    this.app.showToast(`Successfully revised prices for ${affectedCount} parts! Backup snapshot saved.`, "success");

    this.closePriceRevisionModal();
    this.app.renderProducts();
    this.app.updateHeaderStats();
  }

  // Wholesaler Excel (.xlsx / .xls) & CSV Importer
  handleCSVFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel && window.XLSX) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Use Tab delimiter so commas inside descriptions (e.g. 1st, 2nd, & 3rd Gen) are NEVER split!
          const tsvContent = XLSX.utils.sheet_to_csv(worksheet, { FS: '\t' });

          const rawTextarea = document.getElementById('csv-raw-textarea') || document.getElementById('csv-paste-textarea');
          if (rawTextarea) rawTextarea.value = tsvContent;

          this.parseCSVAndMatch(tsvContent);
          this.app.showToast(`Excel Sheet "${file.name}" loaded successfully!`, "success");
        } catch (err) {
          console.error("Excel read error:", err);
          this.app.showToast("Failed to parse Excel file. Please try saving as CSV.", "error");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target.result;
        const rawTextarea = document.getElementById('csv-raw-textarea') || document.getElementById('csv-paste-textarea');
        if (rawTextarea) rawTextarea.value = content;
        this.parseCSVAndMatch(content);
        this.app.showToast(`CSV File "${file.name}" loaded successfully!`, "success");
      };
      reader.readAsText(file);
    }
  }

  // Bulletproof Delimiter Parser: Handles Tabs from Excel and Quotes with Commas (e.g. "1St, 2Nd, & 3Rd Gen")
  parseDelimitedLine(line) {
    if (!line) return [];
    
    // Case 1: Tab-Separated Values (Direct Excel copy-paste or SheetJS TSV)
    if (line.includes('\t')) {
      return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    }

    // Case 2: Comma/Semicolon-Separated CSV with Quotes
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else if (char === ';' && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  }

  // Helper: Find best vehicle match candidate from all known vehicle models in catalog
  findBestVehicleGuess(rawCode) {
    if (!rawCode) return "Universal / Multi-Brand";
    const clean = rawCode.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check learned aliases first
    if (this.vehicleAliases && this.vehicleAliases[rawCode.toLowerCase().trim()]) {
      return this.vehicleAliases[rawCode.toLowerCase().trim()];
    }

    const allModels = [
      "Maruti Suzuki Wagon-R", "Maruti Suzuki Swift", "Maruti Suzuki Swift Dzire", "Maruti Suzuki Alto 800",
      "Maruti Suzuki Alto K10", "Maruti Suzuki Baleno", "Maruti Suzuki Ertiga", "Maruti Suzuki Brezza",
      "Hyundai Verna Fluidic", "Hyundai Elite i20", "Hyundai Grand i10", "Hyundai Creta", "Hyundai Venue",
      "Mahindra Scorpio", "Mahindra Scorpio-N", "Mahindra Bolero", "Mahindra Thar", "Mahindra XUV700", "Mahindra XUV500",
      "Tata Nexon", "Tata Punch", "Tata Altroz", "Tata Tiago", "Tata Harrier", "Tata Safari",
      "Toyota Innova Crysta", "Toyota Fortuner", "Toyota Corolla Altis", "Toyota Glanza",
      "Honda City", "Honda Amaze", "Honda Civic", "Universal / Multi-Brand"
    ];

    // Check substring or initials match
    let bestMatch = "Universal / Multi-Brand";
    let highestScore = 0;

    for (const m of allModels) {
      const cleanM = m.toLowerCase().replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (cleanM.includes(clean)) score += 10;
      if (clean.includes(cleanM)) score += 8;

      // Initials match (e.g. "VF" -> Verna Fluidic)
      const initials = m.split(/[\s\-]+/).map(w => w[0].toLowerCase()).join('');
      if (initials.includes(clean) || clean.includes(initials)) score += 6;

      // Word matching
      const words = rawCode.toLowerCase().split(/[\s\-_]+/);
      for (const w of words) {
        if (w.length >= 2 && m.toLowerCase().includes(w)) score += 4;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = m;
      }
    }

    return bestMatch;
  }

  // STEP 1: Scan Excel/CSV Headers & Show Interactive Column Mapping Wizard
  scanSheetHeadersAndShowMapping(csvText = null) {
    const text = csvText || document.getElementById('csv-raw-textarea')?.value || document.getElementById('csv-paste-textarea')?.value || '';
    if (!text.trim()) {
      this.app.showToast("Please upload an Excel file or paste sheet text first!", "warning");
      return;
    }

    this.rawImportText = text;
    const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return;

    // Grab first 2 rows using quote-aware & tab-aware parser
    const firstRowCols = this.parseDelimitedLine(lines[0]);
    const secondRowCols = lines.length > 1 ? this.parseDelimitedLine(lines[1]) : firstRowCols;
    const colCount = Math.max(firstRowCols.length, secondRowCols.length);

    // Update UI elements
    const mappingBox = document.getElementById('csv-column-mapping-box');
    const colCountBadge = document.getElementById('csv-detected-col-count');
    const sampleRowPreview = document.getElementById('csv-sample-row-preview');

    if (colCountBadge) colCountBadge.textContent = `${colCount} Columns Detected`;
    if (sampleRowPreview) {
      sampleRowPreview.innerHTML = firstRowCols.map((c, i) => `
        <span class="inline-block px-2.5 py-1 mr-2 rounded bg-slate-900 border border-slate-800 text-xs">
          <b class="text-indigo-400">Col ${i + 1}:</b> <span class="text-slate-200">${c || '(empty)'}</span>
        </span>
      `).join('');
    }

    // Build column dropdown options
    const colOptions = [];
    for (let i = 0; i < colCount; i++) {
      const headerName = firstRowCols[i] || `Column ${i + 1}`;
      const sampleVal = (secondRowCols[i] || '').slice(0, 30);
      colOptions.push(`<option value="${i}">Column ${i + 1}: ${headerName} ${sampleVal ? '(' + sampleVal + ')' : ''}</option>`);
    }

    // Select elements
    const selectSku = document.getElementById('map-col-sku');
    const selectName = document.getElementById('map-col-name');
    const selectSelling = document.getElementById('map-col-selling');
    const selectCost = document.getElementById('map-col-cost');
    const selectVehBrand = document.getElementById('map-col-veh-brand');
    const selectCategory = document.getElementById('map-col-category');

    if (selectSku) {
      selectSku.innerHTML = colOptions.join('');
      // Auto-detect SKU col
      let autoSku = 0;
      firstRowCols.forEach((h, idx) => { if (/sku|part|code|item/i.test(h)) autoSku = idx; });
      selectSku.value = String(autoSku);
    }

    if (selectName) {
      selectName.innerHTML = colOptions.join('');
      // Auto-detect Description/Name col
      let autoName = colCount > 1 ? 1 : 0;
      firstRowCols.forEach((h, idx) => { if (/desc|name|title|suit|detail/i.test(h)) autoName = idx; });
      selectName.value = String(autoName);
    }

    if (selectSelling) {
      selectSelling.innerHTML = colOptions.join('');
      // Auto-detect Selling Price col
      let autoSelling = colCount - 1;
      firstRowCols.forEach((h, idx) => { if (/mrp|sell|retail|price|rate/i.test(h)) autoSelling = idx; });
      selectSelling.value = String(autoSelling);
    }

    if (selectCost) {
      selectCost.innerHTML = `<option value="__AUTO_70__">★ Auto-Calculate (70% of Selling Price)</option>` + colOptions.join('');
      let autoCost = "__AUTO_70__";
      firstRowCols.forEach((h, idx) => { if (/cost|buy|purchase|dist/i.test(h)) autoCost = String(idx); });
      selectCost.value = autoCost;
    }

    if (selectVehBrand) {
      selectVehBrand.innerHTML = `<option value="__AUTO_NLP__">★ Auto-Detect from Description</option>` + colOptions.join('');
      // Auto-detect Brand col if present
      firstRowCols.forEach((h, idx) => { if (/car|brand|make|veh|mfr/i.test(h)) selectVehBrand.value = String(idx); });
    }

    if (selectCategory) {
      selectCategory.innerHTML = `
        <option value="__AUTO_NLP__">★ Auto-Detect from Category Column or Description</option>
        <option value="Suspension">Suspension & Shockers (Dickey Shocker)</option>
        <option value="Drive Shaft & Axle">Drive Shaft & Axle</option>
        <option value="Filters">Filters</option>
        <option value="Brakes">Brakes</option>
        <option value="Clutch">Clutch</option>
        <option value="Cooling">Cooling</option>
        <option value="Ignition">Ignition</option>
        <option value="Electrical">Electrical</option>
        <option value="Body & Wipers">Body & Wipers</option>
        <option value="Belts">Belts</option>
      ` + colOptions.join('');
      // Auto-detect Category col if present
      firstRowCols.forEach((h, idx) => { if (/cat|group|type/i.test(h)) selectCategory.value = String(idx); });
    }

    if (mappingBox) {
      mappingBox.classList.remove('hidden');
      mappingBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    this.app.sound.playClick();
    this.app.showToast(`Excel analyzed into ${colCount} clean columns! Verify mappings below.`, "info");
    if (window.lucide) lucide.createIcons();
  }

  // STEP 2: Validate All Rows with User-Defined Column Mappings & Preview
  validateMappedSheetAndPreview() {
    if (!this.rawImportText) {
      this.rawImportText = document.getElementById('csv-raw-textarea')?.value || '';
    }
    if (!this.rawImportText.trim()) {
      this.app.showToast("No Excel data found to validate!", "warning");
      return;
    }

    const colSkuIdx = parseInt(document.getElementById('map-col-sku')?.value ?? 0, 10);
    const colNameIdx = parseInt(document.getElementById('map-col-name')?.value ?? 1, 10);
    const colSellingIdx = parseInt(document.getElementById('map-col-selling')?.value ?? 2, 10);
    const colCostVal = document.getElementById('map-col-cost')?.value ?? '__AUTO_70__';
    const colVehBrandVal = document.getElementById('map-col-veh-brand')?.value ?? '__AUTO_NLP__';
    const colCategoryVal = document.getElementById('map-col-category')?.value ?? '__AUTO_NLP__';

    const lines = this.rawImportText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return;

    // Check if first row is header
    const firstLine = lines[0].toLowerCase();
    const isHeader = /part|sku|mrp|cost|price|name|desc|suit|car|brand|category/i.test(firstLine);
    const startIndex = isHeader ? 1 : 0;

    const matched = [];
    const unmatched = [];
    let invalidRowCount = 0;

    for (let i = startIndex; i < lines.length; i++) {
      const cols = this.parseDelimitedLine(lines[i]);
      if (cols.length === 0) continue;

      const rawSku = cols[colSkuIdx] || '';
      const rawName = cols[colNameIdx] || rawSku;
      const rawSelling = parseFloat((cols[colSellingIdx] || '').replace(/[^0-9.]/g, '')) || 0;
      
      let rawCost = 0;
      if (colCostVal === '__AUTO_70__') {
        rawCost = rawSelling > 0 ? Math.round(rawSelling * 0.7) : 0;
      } else {
        const costColIdx = parseInt(colCostVal, 10);
        rawCost = parseFloat((cols[costColIdx] || '').replace(/[^0-9.]/g, '')) || Math.round(rawSelling * 0.7);
      }

      if (!rawSku || rawSelling <= 0) {
        invalidRowCount++;
        continue;
      }

      // Check if custom brand column was selected
      let customVehBrand = '';
      if (colVehBrandVal !== '__AUTO_NLP__') {
        const vehColIdx = parseInt(colVehBrandVal, 10);
        customVehBrand = cols[vehColIdx] || '';
      }

      // Check if custom category column was selected
      let customCategory = '';
      if (colCategoryVal !== '__AUTO_NLP__') {
        const catColIdx = parseInt(colCategoryVal, 10);
        customCategory = isNaN(catColIdx) ? colCategoryVal : (cols[catColIdx] || '');
      }

      // Extract Automotive entity details
      const autoInfo = this.extractAutomotiveDetails(
        rawName, 
        rawSku, 
        customCategory, 
        customVehBrand
      );

      // Check if product exists in current catalog
      const cleanSku = rawSku.replace(/[^a-z0-9]/g, '').toLowerCase();
      const existingPart = this.app.products.find(p =>
        (p.partNumber || '').toLowerCase() === rawSku.toLowerCase() ||
        (p.partNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanSku ||
        (p.barcode && p.barcode.toLowerCase() === rawSku.toLowerCase())
      );

      if (existingPart) {
        matched.push({
          part: existingPart,
          oldSelling: existingPart.sellingPrice,
          oldCost: existingPart.costPrice,
          newSelling: rawSelling,
          newCost: rawCost,
          autoInfo
        });
      } else {
        unmatched.push({
          rawSku,
          rawName: autoInfo.cleanName || rawName,
          rawSelling,
          rawCost,
          autoInfo
        });
      }
    }

    this.csvMatchedResults = { matched, unmatched, totalRows: lines.length - startIndex };

    // Update Results UI
    const resultsContainer = document.getElementById('csv-reconciliation-results');
    const matchedCountEl = document.getElementById('csv-matched-count');
    const unmatchedCountEl = document.getElementById('csv-unmatched-count');
    const totalCountEl = document.getElementById('csv-total-count');
    const tbody = document.getElementById('csv-preview-tbody');

    if (matchedCountEl) matchedCountEl.textContent = `${matched.length} Updates`;
    if (unmatchedCountEl) unmatchedCountEl.textContent = `${unmatched.length} New Parts`;
    if (totalCountEl) totalCountEl.textContent = `${lines.length - startIndex} Rows`;

    if (resultsContainer) {
      resultsContainer.classList.remove('hidden');
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (tbody) {
      const rowsHtml = [];

      // Existing Parts Updates
      matched.forEach(m => {
        rowsHtml.push(`
          <tr class="hover:bg-slate-800/40">
            <td class="p-2.5">
              <div class="font-bold text-slate-100">${m.part.partNumber}</div>
              <div class="text-[10px] text-amber-400 font-semibold">${m.autoInfo.vehicleBrand}</div>
            </td>
            <td class="p-2.5">
              <div class="text-slate-200 font-semibold text-xs">${m.part.name}</div>
              <div class="text-[10px] text-slate-400">${m.autoInfo.category}</div>
            </td>
            <td class="p-2.5 text-right font-mono text-slate-400">₹ ${m.oldSelling}</td>
            <td class="p-2.5 text-right font-mono font-bold text-emerald-400">₹ ${m.newSelling}</td>
            <td class="p-2.5 text-right font-mono font-bold text-amber-400">₹ ${m.newCost}</td>
            <td class="p-2.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800/60">Update Price</span>
            </td>
          </tr>
        `);
      });

      // New Parts Additions
      unmatched.forEach(u => {
        rowsHtml.push(`
          <tr class="hover:bg-slate-800/40 bg-emerald-950/10">
            <td class="p-2.5">
              <div class="font-bold text-emerald-300">${u.rawSku}</div>
              <div class="text-[10px] text-amber-400 font-semibold">${u.autoInfo.vehicleBrand}</div>
            </td>
            <td class="p-2.5">
              <div class="text-slate-100 font-semibold text-xs">${u.rawName}</div>
              <div class="text-[10px] text-emerald-400 font-medium">${u.autoInfo.category} • ${u.autoInfo.compatibleModels.join(', ')}</div>
            </td>
            <td class="p-2.5 text-right font-mono text-slate-500">—</td>
            <td class="p-2.5 text-right font-mono font-bold text-emerald-400">₹ ${u.rawSelling}</td>
            <td class="p-2.5 text-right font-mono font-bold text-amber-400">₹ ${u.rawCost}</td>
            <td class="p-2.5 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60">+ Add New</span>
            </td>
          </tr>
        `);
      });

      tbody.innerHTML = rowsHtml.join('');
    }

    this.app.sound.playClick();
    this.app.showToast(`Validation Complete: ${matched.length} price updates, ${unmatched.length} new parts ready to sync!`, "success");
    if (window.lucide) lucide.createIcons();
  }

  // 1-Click Rollback / Undo Last Import Batch
  rollbackLastImport() {
    const history = this.app.storage.getPriceRevisionHistory();
    if (history.length === 0) {
      // If no snapshot, check if there are newly added items to clean
      const driveShaftItems = this.app.products.filter(p => (p.partNumber || '').startsWith('TDSFT') || p.category === 'Drive Shaft & Axle');
      if (driveShaftItems.length > 0) {
        if (confirm(`Remove ${driveShaftItems.length} Drive Shaft parts added in the recent import?`)) {
          const removedIds = driveShaftItems.map(p => p.id);
          this.app.products = this.app.products.filter(p => !((p.partNumber || '').startsWith('TDSFT') || p.category === 'Drive Shaft & Axle'));
          // Persist updated local catalog without performing an unconstrained cloud upsert
          this.app.storage.saveProducts(this.app.products, []);
          // Delete removed parts from cloud individually
          removedIds.forEach(id => this.app.storage.deleteProduct(id));
          this.app.sound.playTrashSound ? this.app.sound.playTrashSound() : this.app.sound.playClick();
          this.app.showToast(`Removed ${driveShaftItems.length} imported Drive Shaft items from catalog.`, "success");
          this.app.renderProducts();
          this.app.updateHeaderStats();
          return;
        }
      }
      this.app.showToast("No previous import snapshot found to rollback!", "warning");
      return;
    }

    const latestSnap = history[0];
    if (confirm(`Undo and Rollback to state before "${latestSnap.description}" from ${latestSnap.dateStr}? This will remove all items added in that import.`)) {
      this.rollbackPriceSnapshot(latestSnap.id);
    }
  }

  // Wholesaler CSV Parsing, Vehicle Alias Recognition & Reconciliation Engine (Main Entry)
  parseCSVAndMatch(csvText = null) {
    this.scanSheetHeadersAndShowMapping(csvText);
  }

  confirmVehicleAliases() {
    const rows = document.querySelectorAll('.select-resolved-vehicle');
    let learnedCount = 0;

    rows.forEach(select => {
      const rawCode = select.dataset.rawCode;
      const canonicalName = select.value;
      const rememberCheckbox = document.querySelector(`.check-remember-alias[data-raw-code="${rawCode}"]`);

      if (rawCode && canonicalName && (!rememberCheckbox || rememberCheckbox.checked)) {
        this.vehicleAliases[rawCode.toLowerCase().trim()] = canonicalName;
        learnedCount++;
      }
    });

    if (learnedCount > 0) {
      this.app.storage.saveVehicleAliases(this.vehicleAliases);
      this.app.sound.playClick();
      this.app.showToast(`Learned and saved ${learnedCount} supplier vehicle codes permanently!`, "success");
    }

    const resolverBox = document.getElementById('csv-vehicle-alias-resolver-box');
    if (resolverBox) resolverBox.classList.add('hidden');
  }

  // Intelligent Automotive NLP Entity Extraction from Product Titles & SKUs
  extractAutomotiveDetails(rawTitle, rawSku = '', rawCategory = '', rawBrand = '') {
    const text = `${rawTitle} ${rawSku} ${rawCategory}`.toLowerCase();
    
    // 1. VEHICLE BRAND & COMPATIBLE MODELS
    let vehicleBrand = "Universal";
    let compatibleModels = [];
    
    // TOYOTA
    if (text.includes('toyota') || text.includes('fortuner') || text.includes('innova') || text.includes('crysta') || text.includes('corolla') || text.includes('etios') || text.includes('glanza') || text.includes('hycross') || text.includes('yaris') || text.includes('urban cruiser')) {
      vehicleBrand = "Toyota";
      if (text.includes('fortuner')) compatibleModels.push(text.includes('new') || text.includes('2015') || text.includes('2016') ? "Fortuner New Model (2015+)" : "Fortuner Type 1 / 2");
      if (text.includes('crysta') || text.includes('innova')) compatibleModels.push("Innova Crysta");
      if (text.includes('corolla') || text.includes('altis')) compatibleModels.push("Corolla Altis");
      if (text.includes('etios')) compatibleModels.push("Etios / Liva");
      if (text.includes('glanza')) compatibleModels.push("Glanza");
      if (text.includes('hycross')) compatibleModels.push("Innova Hycross");
    }
    // SUZUKI / MARUTI
    else if (text.includes('wagonr') || text.includes('wagon-r') || text.includes('wagon r') || text.includes('swift') || text.includes('dzire') || text.includes('alto') || text.includes('baleno') || text.includes('ertiga') || text.includes('brezza') || text.includes('celerio') || text.includes('omni') || text.includes('van') || text.includes('eeco') || text.includes('eco') || text.includes('zen') || text.includes('ritz') || text.includes('s-presso') || text.includes('maruti') || text.includes('suzuki') || text.includes('ignis') || text.includes('ciaz') || text.includes('800')) {
      vehicleBrand = "Suzuki / Maruti";
      if (text.includes('omni') || text.includes('van')) compatibleModels.push("Omni / Van");
      if (text.includes('800')) compatibleModels.push("Maruti 800");
      if (text.includes('zen estilo')) compatibleModels.push("Zen Estilo");
      else if (text.includes('zen')) compatibleModels.push("Zen Classic / Gen 1 & 2");
      if (text.includes('ritz')) compatibleModels.push("Ritz");
      if (text.includes('wagonr') || text.includes('wagon-r') || text.includes('wagon r')) {
        compatibleModels.push(text.includes('k-series') || text.includes('k series') || text.includes('2018') ? "Wagon-R K-Series (2018+)" : "Wagon-R Type 1/2/3");
      }
      if (text.includes('swift') || text.includes('dzire')) compatibleModels.push(text.includes('2007') || text.includes('2011') ? "Swift (2007-2011)" : "Swift / Dzire");
      if (text.includes('alto')) compatibleModels.push(text.includes('k10') ? "Alto K10" : "Alto 800 (2000-2012)");
      if (text.includes('baleno')) compatibleModels.push("Baleno");
      if (text.includes('ertiga')) compatibleModels.push("Ertiga 1st Gen");
      if (text.includes('brezza')) compatibleModels.push("Brezza");
      if (text.includes('celerio')) compatibleModels.push("Celerio");
      if (text.includes('eeco') || text.includes('eco')) compatibleModels.push("Eeco (2010+)");
    }
    // HYUNDAI
    else if (text.includes('i10') || text.includes('grand i10') || text.includes('xcent') || text.includes('verna') || text.includes('creta') || text.includes('venue') || text.includes('i20') || text.includes('santro') || text.includes('aura') || text.includes('elantra') || text.includes('tucson') || text.includes('alcazar') || text.includes('exter') || text.includes('hyundai')) {
      vehicleBrand = "Hyundai";
      if (text.includes('i10') || text.includes('xcent')) compatibleModels.push(text.includes('grand') ? "Grand i10 / Xcent" : "i10 Regular");
      if (text.includes('verna')) compatibleModels.push(text.includes('fluidic') ? "Verna Fluidic" : "Verna Next-Gen");
      if (text.includes('creta')) compatibleModels.push("Creta");
      if (text.includes('i20')) compatibleModels.push("Elite i20");
      if (text.includes('venue')) compatibleModels.push("Venue");
      if (text.includes('santro')) compatibleModels.push("Santro Xing / New");
      if (text.includes('aura')) compatibleModels.push("Aura");
    }
    // MAHINDRA
    else if (text.includes('scorpio') || text.includes('xuv700') || text.includes('xuv500') || text.includes('xuv300') || text.includes('bolero') || text.includes('thar') || text.includes('kuv100') || text.includes('marazzo') || text.includes('xylo') || text.includes('mahindra')) {
      vehicleBrand = "Mahindra";
      if (text.includes('scorpio')) compatibleModels.push(text.includes('scorpio-n') || text.includes('scorpio n') ? "Scorpio-N" : "Scorpio Classic / CRDe");
      if (text.includes('xuv700') || text.includes('x700')) compatibleModels.push("XUV700");
      if (text.includes('xuv500') || text.includes('x500')) compatibleModels.push("XUV500");
      if (text.includes('bolero')) compatibleModels.push("Bolero");
      if (text.includes('thar')) compatibleModels.push("Thar");
    }
    // TATA
    else if (text.includes('nexon') || text.includes('punch') || text.includes('altroz') || text.includes('tiago') || text.includes('tigor') || text.includes('harrier') || text.includes('safari') || text.includes('indica') || text.includes('indigo') || text.includes('hexa') || text.includes('tata')) {
      vehicleBrand = "Tata";
      if (text.includes('nexon')) compatibleModels.push("Nexon");
      if (text.includes('punch')) compatibleModels.push("Punch");
      if (text.includes('altroz')) compatibleModels.push("Altroz");
      if (text.includes('tiago') || text.includes('tigor')) compatibleModels.push("Tiago / Tigor");
      if (text.includes('harrier') || text.includes('safari')) compatibleModels.push("Harrier / Safari");
    }
    // HONDA
    else if (text.includes('city') || text.includes('amaze') || text.includes('civic') || text.includes('jazz') || text.includes('wr-v') || text.includes('cr-v') || text.includes('brio') || text.includes('elevate') || text.includes('honda')) {
      vehicleBrand = "Honda";
      if (text.includes('city')) compatibleModels.push("City i-VTEC / i-DTEC");
      if (text.includes('amaze')) compatibleModels.push("Amaze");
      if (text.includes('civic')) compatibleModels.push("Civic");
    }
    // VOLKSWAGEN
    else if (text.includes('polo') || text.includes('vento') || text.includes('taigun') || text.includes('virtus') || text.includes('volkswagen') || text.includes('vw')) {
      vehicleBrand = "Volkswagen";
      if (text.includes('polo')) compatibleModels.push("Polo");
      if (text.includes('vento')) compatibleModels.push("Vento");
      if (text.includes('taigun')) compatibleModels.push("Taigun");
    }
    // FORD
    else if (text.includes('ecosport') || text.includes('figo') || text.includes('endeavour') || text.includes('aspire') || text.includes('fiesta') || text.includes('ford')) {
      vehicleBrand = "Ford";
      if (text.includes('ecosport')) compatibleModels.push("EcoSport");
      if (text.includes('figo') || text.includes('aspire')) compatibleModels.push("Figo / Aspire");
      if (text.includes('endeavour')) compatibleModels.push("Endeavour");
    }
    // KIA
    else if (text.includes('seltos') || text.includes('sonet') || text.includes('carens') || text.includes('carnival') || text.includes('kia')) {
      vehicleBrand = "Kia";
      if (text.includes('seltos')) compatibleModels.push("Seltos");
      if (text.includes('sonet')) compatibleModels.push("Sonet");
      if (text.includes('carens')) compatibleModels.push("Carens");
    }

    if (compatibleModels.length === 0) {
      compatibleModels = [vehicleBrand === "Universal" ? "Universal / Multi-Brand" : vehicleBrand];
    }

    // 2. CATEGORY DETECTION
    let category = "Suspension";
    if (rawCategory && rawCategory.trim().length > 0 && rawCategory !== '__AUTO_NLP__') {
      category = rawCategory.trim();
    } else if (text.includes('dickey') || text.includes('dicky') || text.includes('tailgate') || text.includes('boot shocker') || text.includes('gas spring') || text.includes('tds9')) {
      category = "Dickey Shocker";
    } else if (text.includes('shaft') || text.includes('tdsft') || text.includes('axle') || text.includes('cv joint') || text.includes('half shaft') || text.includes('propeller')) {
      category = "Drive Shaft & Axle";
    } else if (text.includes('brake') || text.includes('pad') || text.includes('shoe') || text.includes('rotor') || text.includes('disc') || text.includes('caliper')) {
      category = "Brakes";
    } else if (text.includes('shock') || text.includes('strut') || text.includes('suspension') || text.includes('arm') || text.includes('link') || text.includes('bush') || text.includes('tie rod')) {
      category = "Suspension";
    } else if (text.includes('filter') || text.includes('oil filter') || text.includes('air filter') || text.includes('cabin')) {
      category = "Filters";
    } else if (text.includes('clutch') || text.includes('flywheel') || text.includes('plate') || text.includes('release bearing')) {
      category = "Clutch";
    } else if (text.includes('radiator') || text.includes('coolant') || text.includes('water pump') || text.includes('thermostat')) {
      category = "Cooling";
    } else if (text.includes('spark') || text.includes('ignition') || text.includes('plug') || text.includes('glow')) {
      category = "Ignition";
    } else if (text.includes('wiper') || text.includes('blade') || text.includes('door') || text.includes('mirror') || text.includes('bumper')) {
      category = "Body & Wipers";
    } else if (text.includes('belt') || text.includes('timing') || text.includes('tensioner') || text.includes('pulley')) {
      category = "Belts";
    }

    // 3. FAITHFUL PRODUCT NAME PRESERVATION (Keep exact user description from Excel)
    let cleanName = rawTitle.trim();
    if (rawCategory && rawCategory.trim().length > 0 && !cleanName.toLowerCase().includes(rawCategory.toLowerCase())) {
      cleanName = `${rawCategory.trim()} - ${cleanName}`;
    }

    return {
      vehicleBrand,
      compatibleModels,
      category,
      cleanName
    };
  }

  applyCSVSync() {
    if (!this.csvMatchedResults || (this.csvMatchedResults.matched.length === 0 && this.csvMatchedResults.unmatched.length === 0)) {
      this.app.showToast("No CSV data to sync!", "warning");
      return;
    }

    const { matched, unmatched } = this.csvMatchedResults;
    const desc = `Wholesaler Sheet Import (${matched.length} updated, ${unmatched.length} added)`;

    // Save snapshot before mutating
    this.app.storage.addPriceRevisionSnapshot(desc, this.app.products, matched.length + unmatched.length);

    // 1. Update matched
    matched.forEach(m => {
      m.part.sellingPrice = m.newSelling;
      m.part.costPrice = m.newCost;
      m.part.lastPriceUpdated = new Date().toISOString();
    });

    // 2. Insert new unmatched items with Automotive Title Intelligence NLP
    const newPartIds = [];
    if (unmatched.length > 0) {
      unmatched.forEach(u => {
        const autoDetails = this.extractAutomotiveDetails(u.rawName, u.rawSku, u.rawCategory, u.rawBrand);
        const sellingPrice = u.rawSelling || (u.rawCost ? Math.round(u.rawCost * 1.4) : 4500);
        const costPrice = u.rawCost || Math.round(sellingPrice * 0.7);

        const newPart = {
          id: "part-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
          name: autoDetails.cleanName || u.rawName || u.rawSku,
          partNumber: u.rawSku,
          barcode: this.app?.inventoryManager?.generateUniqueBarcode ? this.app.inventoryManager.generateUniqueBarcode() : ("890" + Math.floor(100000000 + Math.random() * 900000000)),
          brand: u.rawBrand || "OEM Quality",
          vehicleBrand: autoDetails.vehicleBrand,
          category: autoDetails.category,
          compatibleModels: autoDetails.compatibleModels,
          costPrice: costPrice,
          sellingPrice: sellingPrice,
          rackLocation: "Floor 1 - Rack D-02",
          stockFloor1: 5,
          stockFloor2: 0,
          stockGroundFloor: 0,
          minStockAlert: (sellingPrice >= 3000) ? 1 : 2,
          unit: 'Piece'
        };
        newPartIds.push(newPart.id);
        this.app.products.unshift(newPart);
      });
    }

    const affectedIds = [
      ...matched.map(m => m.part.id),
      ...newPartIds
    ];
    this.app.saveProducts(affectedIds);
    this.app.sound.playSaleChime();
    this.app.showToast(`Successfully synced ${matched.length} parts and added ${unmatched.length} parts with automotive AI recognition!`, "success");

    this.closePriceRevisionModal();
    this.app.renderProducts();
    this.app.updateHeaderStats();
    this.csvMatchedResults = null;
  }

  // Price Revision Snapshot History & Rollback Table
  renderPriceRevisionHistoryTable() {
    const tbody = document.getElementById('revision-history-tbody');
    if (!tbody) return;

    const history = this.app.storage.getPriceHistory();

    if (history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="p-8 text-center text-slate-400">
            <i data-lucide="history" class="w-10 h-10 mx-auto mb-2 text-slate-600"></i>
            <div class="text-sm font-bold text-slate-300">No Price Revisions Recorded Yet</div>
            <div class="text-xs text-slate-500 mt-0.5">Whenever you revise brand prices or import CSVs, snapshots are saved here for 1-click rollback.</div>
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    tbody.innerHTML = history.map(snap => `
      <tr class="hover:bg-slate-800/40">
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-200">${snap.dateStr}</div>
          <div class="text-[10px] text-slate-400">${snap.timeStr || ''}</div>
        </td>
        <td class="p-3 text-slate-300 font-medium">
          ${snap.description}
        </td>
        <td class="p-3 font-mono font-bold text-purple-400">
          ${snap.affectedCount} parts
        </td>
        <td class="p-3 text-right whitespace-nowrap">
          <button 
            class="btn-rollback-snapshot btn-touch px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/50 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-auto shadow-sm"
            data-snapshot-id="${snap.id}"
            title="Roll back prices to before this revision"
          >
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            <span>Undo / Revert</span>
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  rollbackPriceSnapshot(snapshotId) {
    const history = this.app.storage.getPriceHistory();
    const snap = history.find(s => s.id === snapshotId);
    if (!snap || !snap.previousProductsBackup) {
      this.app.showToast("Snapshot backup not found!", "error");
      return;
    }

    if (!confirm(`Are you sure you want to revert prices back to state before "${snap.description}"?`)) {
      return;
    }

    // Revert prices only for parts whose prices differed, preserving newer stock values!
    const changedIds = [];
    const backupMap = new Map(snap.previousProductsBackup.map(p => [p.id, p]));
    this.app.products.forEach(p => {
      const oldPart = backupMap.get(p.id);
      if (oldPart && (oldPart.sellingPrice !== p.sellingPrice || oldPart.costPrice !== p.costPrice)) {
        p.sellingPrice = oldPart.sellingPrice;
        p.costPrice = oldPart.costPrice;
        p.lastPriceUpdated = new Date().toISOString();
        changedIds.push(p.id);
      }
    });

    this.app.saveProducts(changedIds.length > 0 ? changedIds : null);
    this.app.sound.playTransferChime();

    this.app.showToast(`Prices rolled back successfully! Restored ${this.app.products.length} parts.`, "success");
    this.app.renderProducts();
    this.closePriceRevisionModal();
  }

  downloadSampleCSVTemplate() {
    const sampleRows = [
      "PartNumber,SellingPrice,CostPrice",
      "OF-TY-101,420,240",
      "SK-MN-602,1890,1480",
      "BP-TY-402,1650,1100",
      "SP-NGK-664,1950,1350",
      "WP-BS-2416,790,520"
    ].join('\n');

    const blob = new Blob([sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Wholesaler_Price_Update_Sample.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.app.showToast("Sample CSV template downloaded!", "success");
  }
}
