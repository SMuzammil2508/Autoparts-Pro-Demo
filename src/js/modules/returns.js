// Customer Returns & Wholesaler Claims Engine
// Features: Ground floor unused vs defective quarantine, Wholesaler Debit Notes, Credit Note reconciliation, and Auto-Stocking Replacements

export class ReturnsManager {
  constructor(appContext) {
    this.app = appContext;
    this.activeReturnPartId = null;
    this.activeSettleClaimId = null;
  }

  // Open Customer Return Question Dialog
  openCustomerReturnModal(partId) {
    this.activeReturnPartId = partId;
    const part = this.app.products.find(p => p.id === partId);
    if (!part) return;

    const modal = document.getElementById('customer-return-modal');
    const partNameEl = document.getElementById('return-modal-part-name') || document.getElementById('return-part-name');
    const partMetaEl = document.getElementById('return-modal-part-meta') || document.getElementById('return-part-sku');
    const partPriceEl = document.getElementById('return-modal-part-price');
    const defectInput = document.getElementById('return-defect-reason');

    if (partNameEl) partNameEl.textContent = part.name;
    if (partMetaEl) partMetaEl.textContent = `${part.partNumber} • ${part.brand} • ${part.rackLocation || 'Rack A-01'} (${part.vehicleBrand})`;
    if (partPriceEl) partPriceEl.textContent = this.app.formatCurrency ? this.app.formatCurrency(part.sellingPrice) : `₹ ${part.sellingPrice}`;
    if (defectInput) defectInput.value = '';

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    if (window.lucide) lucide.createIcons();
  }

  closeCustomerReturnModal() {
    const modal = document.getElementById('customer-return-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.activeReturnPartId = null;
  }

  // Process Unused Return (Adds directly to Ground Floor Counter for fast resale)
  confirmUnusedReturn() {
    if (!this.activeReturnPartId) return;
    const part = this.app.products.find(p => p.id === this.activeReturnPartId);
    if (!part) return;

    part.stockGroundFloor = (Number(part.stockGroundFloor) || 0) + 1;
    this.app.saveProducts([part.id]);
    this.app.sound.playTransferChime();

    const isUpstairs = this.app.isUpstairsPart ? this.app.isUpstairsPart(part) : true;
    this.closeCustomerReturnModal();
    if (isUpstairs) {
      this.app.showToast(
        `Accepted unused return for "${part.name}". Stored on Ground Floor Counter until racked up to ${part.rackLocation || 'upstairs'}.`,
        "warning"
      );
    } else {
      this.app.showToast(
        `Accepted return for "${part.name}". Restocked on Ground Floor (${part.rackLocation || 'Ground Floor'}).`,
        "success"
      );
    }

    this.app.renderProducts();
    this.app.updateHeaderStats();
  }

  // Process Defective Return (Quarantines in Defective Bin - DOES NOT add to sellable stock!)
  confirmDefectiveReturn() {
    if (!this.activeReturnPartId) return;
    const part = this.app.products.find(p => p.id === this.activeReturnPartId);
    if (!part) return;

    const reasonInput = document.getElementById('return-defect-reason');
    const defectReason = (reasonInput && reasonInput.value.trim()) ? reasonInput.value.trim() : "Manufacturing defect / customer fault report";

    this.app.storage.addDefectiveReturn({
      partId: part.id,
      partName: part.name,
      partNumber: part.partNumber,
      brand: part.brand,
      vehicleBrand: part.vehicleBrand,
      quantity: 1,
      costPrice: part.costPrice,
      sellingPrice: part.sellingPrice,
      defectReason: defectReason
    });

    this.app.defectiveReturns = this.app.storage.getDefectiveReturns();
    this.app.sound.playWarningBeep();

    this.closeCustomerReturnModal();
    this.app.showToast(
      `Quarantined defective "${part.name}" in Defective Bin. Logged for Wholesaler Return Claim!`,
      "error"
    );

    this.app.renderProducts();
    this.app.updateHeaderStats();
  }

  // Defective Claims Register Modal
  openDefectiveClaimsModal(filter = 'pending') {
    this.app.sound.playClick();
    this.app.defectiveReturns = this.app.storage.getDefectiveReturns();
    const modal = document.getElementById('defective-claims-modal');
    if (!modal) return;

    this.setDefectiveClaimsTab(filter);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeDefectiveClaimsModal() {
    const modal = document.getElementById('defective-claims-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  setDefectiveClaimsTab(filterName) {
    const btnPending = document.getElementById('btn-claims-tab-pending') || document.getElementById('btn-tab-claims-pending');
    const btnSettled = document.getElementById('btn-claims-tab-all') || document.getElementById('btn-tab-claims-settled');

    if (btnPending) {
      btnPending.className = filterName === 'pending'
        ? "px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold transition-all"
        : "px-4 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-bold transition-all";
    }

    if (btnSettled) {
      btnSettled.className = filterName === 'settled' || filterName === 'all'
        ? "px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold transition-all"
        : "px-4 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-bold transition-all";
    }

    this.renderDefectiveClaimsTable(filterName);
  }

  renderDefectiveClaimsTable(filter = 'pending') {
    const tbody = document.getElementById('defective-claims-tbody');
    const totalClaimsCostEl = document.getElementById('modal-total-defective-claim-cost');
    const statPendingEl = document.getElementById('claims-stat-pending');
    const statValueEl = document.getElementById('claims-stat-value');
    const statSettledEl = document.getElementById('claims-stat-settled');
    if (!tbody) return;

    const allClaims = this.app.storage.getDefectiveReturns();
    const pendingClaims = allClaims.filter(c => c.status === 'pending_wholesaler');
    const settledClaims = allClaims.filter(c => c.status === 'returned_to_wholesaler');

    const totalPendingUnits = pendingClaims.reduce((acc, c) => acc + (c.quantity || 1), 0);
    const totalPendingCost = pendingClaims.reduce((acc, c) => acc + ((c.costPrice || 0) * (c.quantity || 1)), 0);
    const totalSettledUnits = settledClaims.reduce((acc, c) => acc + (c.quantity || 1), 0);

    if (totalClaimsCostEl) totalClaimsCostEl.textContent = this.app.formatCurrency(totalPendingCost);
    if (statPendingEl) statPendingEl.textContent = `${totalPendingUnits} pcs`;
    if (statValueEl) statValueEl.textContent = this.app.formatCurrency(totalPendingCost);
    if (statSettledEl) statSettledEl.textContent = `${totalSettledUnits} pcs`;

    const listToRender = (filter === 'settled' || filter === 'all') ? allClaims : pendingClaims;

    if (listToRender.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-slate-400">
            <i data-lucide="package-check" class="w-10 h-10 mx-auto mb-2 text-slate-600"></i>
            <div class="text-sm font-bold text-slate-300">No ${filter === 'pending' ? 'Pending' : 'Recorded'} Defective Returns</div>
            <div class="text-xs text-slate-500 mt-0.5">${filter === 'pending' ? 'All defective parts have been returned to wholesalers.' : 'No returned parts history yet.'}</div>
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    tbody.innerHTML = listToRender.map(item => `
      <tr class="hover:bg-slate-800/40">
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-200">${item.dateStr}</div>
          <div class="text-[10px] text-slate-400">${item.timeStr || ''}</div>
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-100">${item.partName}</div>
          <div class="text-xs text-slate-400 font-mono">${item.partNumber} • <span class="text-amber-400 font-semibold">${item.brand}</span> (${item.vehicleBrand})</div>
        </td>
        <td class="p-3 font-semibold text-slate-300">
          ${item.brand}
        </td>
        <td class="p-3 text-xs text-rose-300 max-w-xs">
          ${item.defectReason}
        </td>
        <td class="p-3 font-mono font-bold text-amber-400 whitespace-nowrap">
          ${this.app.formatCurrency((item.costPrice || 0) * (item.quantity || 1))}
        </td>
        <td class="p-3">
          ${item.status === 'pending_wholesaler' 
            ? '<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">Pending Pick-up</span>'
            : '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">Returned / Settled</span>'
          }
        </td>
        <td class="p-3 text-right whitespace-nowrap">
          ${item.status === 'pending_wholesaler' ? `
            <button 
              class="btn-open-settle-modal btn-touch px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-auto shadow-sm"
              data-claim-id="${item.id}"
            >
              <i data-lucide="truck" class="w-3.5 h-3.5"></i>
              <span>Return to Wholesaler</span>
            </button>
          ` : `
            <div class="text-xs text-emerald-400 font-bold flex items-center gap-1 justify-end">
              <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
              <span>${item.creditNoteRef || 'Settled'}</span>
            </div>
            <div class="text-[10px] text-slate-500">${item.returnedDateStr || ''}</div>
          `}
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  printWholesalerClaimSheet() {
    const claims = this.app.storage.getDefectiveReturns().filter(c => c.status === 'pending_wholesaler');
    if (claims.length === 0) {
      this.app.showToast("No pending defective parts to print on claim sheet!", "warning");
      return;
    }

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      window.print();
      return;
    }

    const storeName = this.app.settings.storeName || "City Auto Parts & Spares";
    const dateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

    let rowsHtml = claims.map((c, i) => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 8px;">${i + 1}</td>
        <td style="padding: 8px; font-weight: bold;">${c.partName}<br><small style="color: #666; font-family: monospace;">${c.partNumber}</small></td>
        <td style="padding: 8px;">${c.brand}</td>
        <td style="padding: 8px; text-align: center;">${c.quantity || 1}</td>
        <td style="padding: 8px; color: #b91c1c;">${c.defectReason}</td>
        <td style="padding: 8px; text-align: right; font-family: monospace;">${this.app.formatCurrency(c.costPrice)}</td>
        <td style="padding: 8px; text-align: right; font-family: monospace; font-weight: bold;">${this.app.formatCurrency((c.costPrice || 0) * (c.quantity || 1))}</td>
        <td style="padding: 8px; border: 1px dashed #ccc;"></td>
      </tr>
    `).join('');

    const totalCost = claims.reduce((acc, c) => acc + ((c.costPrice || 0) * (c.quantity || 1)), 0);

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Defective Returns & Wholesaler Debit Note - ${storeName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th { background: #f3f4f6; padding: 10px 8px; text-align: left; border-bottom: 2px solid #333; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 12px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
          .sig-box { width: 45%; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; text-align: center; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 style="margin: 0; font-size: 20px;">${storeName}</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">WHOLESALER DEFECTIVE RETURN & DEBIT NOTE SHEET</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-weight: bold;">Date: ${dateStr}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #666;">Total Items: ${claims.length} pcs</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Part Name & SKU</th>
              <th>Brand / Wholesaler</th>
              <th style="text-align: center;">Qty</th>
              <th>Defect / Fault Description</th>
              <th style="text-align: right;">Cost Rate</th>
              <th style="text-align: right;">Claim Total</th>
              <th style="width: 110px;">Distributor Van Ack / CN #</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="border-top: 2px solid #111; font-weight: bold; background: #fafafa;">
              <td colspan="6" style="padding: 10px 8px; text-align: right;">TOTAL CLAIM AMOUNT:</td>
              <td style="padding: 10px 8px; text-align: right; font-family: monospace; font-size: 14px;">${this.app.formatCurrency(totalCost)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div class="signatures">
          <div class="sig-box">Store Manager Signature & Stamp</div>
          <div class="sig-box">Distributor Delivery Van Driver / Agent Signature</div>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <button onclick="window.print()" style="padding: 8px 18px; font-size: 14px; background: #111; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Print Debit Note Sheet</button>
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  // Modal 12: Settle Wholesaler Return & Credit Note
  openSettleWholesalerModal(claimId) {
    this.activeSettleClaimId = claimId;
    const claims = this.app.storage.getDefectiveReturns();
    const claim = claims.find(c => c.id === claimId);
    if (!claim) return;

    const modal = document.getElementById('settle-wholesaler-modal');
    if (!modal) return;

    document.getElementById('settle-claim-id').value = claim.id;
    document.getElementById('settle-part-name').textContent = claim.partName;
    document.getElementById('settle-part-sku').textContent = `${claim.partNumber} • ${claim.brand} (${claim.vehicleBrand})`;
    document.getElementById('settle-part-cost').textContent = `₹ ${((claim.costPrice || 0) * (claim.quantity || 1)).toLocaleString('en-IN')}`;
    document.getElementById('settle-part-defect').textContent = `Reported Defect: ${claim.defectReason}`;

    const creditInput = document.getElementById('settle-credit-note-input');
    if (creditInput) creditInput.value = `CN-${Math.floor(1000 + Math.random() * 9000)}`;

    const handoverInput = document.getElementById('settle-handover-note-input');
    if (handoverInput) handoverInput.value = '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }

  closeSettleWholesalerModal() {
    const modal = document.getElementById('settle-wholesaler-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.activeSettleClaimId = null;
  }

  confirmSettleWholesalerForm(e) {
    if (e) e.preventDefault();
    const claimId = document.getElementById('settle-claim-id').value;
    const creditNoteRef = (document.getElementById('settle-credit-note-input').value || '').trim();
    const handoverNote = (document.getElementById('settle-handover-note-input').value || '').trim();
    const settleType = document.querySelector('input[name="settle-type"]:checked')?.value || 'credit_note';

    const claims = this.app.storage.getDefectiveReturns();
    const claimRecord = claims.find(r => r.id === claimId);
    let notePrefix = settleType === 'replacement_unit' ? '[Replacement Unit Received] ' : '';
    const fullRef = (notePrefix + (creditNoteRef || 'Settled') + (handoverNote ? ` - ${handoverNote}` : '')).trim();

    this.app.storage.markDefectiveReturnedToWholesaler(claimId, fullRef);

    // If fresh replacement unit received, automatically add back to Floor 1 stock
    if (settleType === 'replacement_unit' && claimRecord) {
      const part = this.app.products.find(p => p.id === claimRecord.partId || p.partNumber === claimRecord.partNumber);
      if (part) {
        part.stockFloor1 = (Number(part.stockFloor1) || 0) + (Number(claimRecord.quantity) || 1);
        this.app.saveProducts([part.id]);
        this.app.showToast(`Claim settled & added ${claimRecord.quantity || 1}x fresh replacement into Floor 1 stock!`, "success");
      }
    } else {
      this.app.showToast(`Defective claim settled with wholesaler! Ref: ${creditNoteRef || 'Recorded'}`, "success");
    }

    this.app.sound.playSaleChime();
    this.closeSettleWholesalerModal();
    this.renderDefectiveClaimsTable();
    this.app.updateHeaderStats();
    this.app.renderProducts();
  }

  // Transfer returned item from Ground Floor Stash to Upstairs Rack
  transferToUpstairs(partId) {
    const part = this.app.products.find(p => p.id === partId);
    if (!part || (part.stockGroundFloor || 0) <= 0) {
      this.app.showToast("No ground floor units to transfer!", "error");
      return;
    }

    const isUpstairs = this.app.isUpstairsPart ? this.app.isUpstairsPart(part) : true;
    if (!isUpstairs) {
      this.app.showToast(`"${part.name}" is designated for Ground Floor storage. No need to rack up!`, "info");
      return;
    }

    part.stockGroundFloor = (Number(part.stockGroundFloor) || 0) - 1;
    const isFloor2 = (part.rackLocation || '').toLowerCase().includes('floor 2') || (part.rackLocation || '').toLowerCase().includes('2nd');
    if (isFloor2) {
      part.stockFloor2 = (Number(part.stockFloor2) || 0) + 1;
    } else {
      part.stockFloor1 = (Number(part.stockFloor1) || 0) + 1;
    }

    this.app.saveProducts([part.id]);
    this.app.sound.playTransferChime();
    this.app.showToast(`Restocked 1 unit of "${part.name}" to ${part.rackLocation || (isFloor2 ? 'Floor 2' : 'Floor 1')}`, "success");
    this.app.renderProducts();
    this.app.updateHeaderStats();
  }
}
