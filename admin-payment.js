"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — admin-payment.js
═══════════════════════════════════════════════ */

document.getElementById("payAdminFooterYear").textContent = new Date().getFullYear();

let allPaymentRows = [];
let currentFilter  = "pending";
let currentAction  = null; // { docId, memberName, memberUID, request }

// ── Auth guard ──
auth.onAuthStateChanged(user => {
  if (!user) { window.location.href = "admin.html"; return; }
  loadPaymentRequests();
});

// ── Load all payment requests ──
async function loadPaymentRequests() {
  try {
    const snap = await db.collection("registrations")
      .where("paymentRequests", "!=", null).get();

    allPaymentRows = [];
    const today = new Date().toDateString();
    let pendingCount = 0, confirmedToday = 0, rejectedToday = 0;

    snap.docs.forEach(doc => {
      const data = doc.data();
      const reqs = data.paymentRequests || [];
      reqs.forEach(req => {
        allPaymentRows.push({
          docId:      doc.id,
          memberName: (data.name || data.sectionA?.fullName || "—").toUpperCase(),
          memberUID:  data.uniqueID || "—",
          request:    req,
          paidYears:  data.paidYears || [],
          paymentHistory: data.paymentHistory || [],
        });

        if (req.status === "pending") pendingCount++;
        if (req.status === "confirmed" && new Date(req.confirmedAt).toDateString() === today) confirmedToday++;
        if (req.status === "rejected"  && new Date(req.rejectedAt).toDateString()  === today) rejectedToday++;
      });
    });

    // Sort — pending first, then by submittedAt desc
    allPaymentRows.sort((a, b) => {
      if (a.request.status === "pending" && b.request.status !== "pending") return -1;
      if (b.request.status === "pending" && a.request.status !== "pending") return 1;
      return new Date(b.request.submittedAt) - new Date(a.request.submittedAt);
    });

    document.getElementById("countPending").textContent   = pendingCount;
    document.getElementById("countConfirmed").textContent = confirmedToday;
    document.getElementById("countRejected").textContent  = rejectedToday;

    applyFilter();

  } catch(e) {
    console.error("Load error:", e);
  }
}

// ── Filter + Search ──
function applyFilter() {
  const q = document.getElementById("payAdminSearch").value.toLowerCase().trim();
  let rows = allPaymentRows.filter(r => {
    if (currentFilter !== "all" && r.request.status !== currentFilter) return false;
    if (q && !r.memberName.toLowerCase().includes(q) &&
             !r.memberUID.toLowerCase().includes(q)) return false;
    return true;
  });
  renderTable(rows);
}

document.getElementById("payAdminSearch").addEventListener("input", applyFilter);

document.querySelectorAll(".pay-filter-btn").forEach(btn => {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".pay-filter-btn").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    currentFilter = this.dataset.filter;
    applyFilter();
  });
});

// ── Render table ──
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
}

function renderTable(rows) {
  const tbody = document.getElementById("payAdminTableBody");
  const empty = document.getElementById("payAdminEmpty");
  tbody.innerHTML = "";

  if (!rows.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  rows.forEach((row, i) => {
    const req    = row.request;
    const method = req.method === "cash"     ? "💵 Tunai / Cash"
                 : req.method === "transfer" ? "🏦 Pindahan Bank / Transfer"
                 : "—";
    const years  = (req.years || []).join(", ");
    const amount = `RM ${(req.amount || 0).toFixed(2)}`;
    const statusBadge =
      req.status === "pending"   ? `<span style="color:var(--marigold);font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.04em;">⏳ Menunggu / Pending</span>` :
      req.status === "confirmed" ? `<span style="color:#4CAF7D;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.04em;">✅ Disahkan / Confirmed</span>` :
      `<span style="color:#E05555;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.04em;">❌ Ditolak / Rejected</span>`;

    const actionBtn = req.status === "pending"
      ? `<div style="display:flex;gap:0.4rem;align-items:center;">
           <button class="btn-action-dots pay-action-btn"
             style="background:rgba(255,140,0,0.1);border:1px solid var(--marigold-dim);
             border-radius:var(--radius);padding:0.3rem 0.8rem;cursor:pointer;
             color:var(--marigold);font-family:var(--font-display);font-size:0.75rem;"
             data-idx="${allPaymentRows.indexOf(row)}">
             •••
           </button>
           <button class="pay-delete-btn"
             style="background:rgba(224,85,85,0.1);border:1px solid #E05555;
             border-radius:var(--radius);padding:0.3rem 0.7rem;cursor:pointer;
             color:#E05555;font-family:var(--font-display);font-size:0.75rem;"
             data-idx="${allPaymentRows.indexOf(row)}">
             🗑️
           </button>
         </div>`
      : `<div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
           <button class="pay-details-btn"
             style="background:rgba(100,160,255,0.1);border:1px solid rgba(100,160,255,0.3);
             border-radius:var(--radius);padding:0.3rem 0.7rem;cursor:pointer;
             color:#6495ED;font-family:var(--font-display);font-size:0.72rem;"
             data-idx="${allPaymentRows.indexOf(row)}">
             📄 Butiran
           </button>
           <button class="pay-delete-btn"
             style="background:rgba(224,85,85,0.1);border:1px solid #E05555;
             border-radius:var(--radius);padding:0.3rem 0.7rem;cursor:pointer;
             color:#E05555;font-family:var(--font-display);font-size:0.75rem;"
             data-idx="${allPaymentRows.indexOf(row)}">
             🗑️
           </button>
         </div>`;

    const checkboxCell = req.status === "pending"
      ? `<td style="text-align:center;">
           <input type="checkbox" class="pay-row-chk"
             style="accent-color:var(--marigold);width:15px;height:15px;cursor:pointer;"
             data-idx="${allPaymentRows.indexOf(row)}"/>
         </td>`
      : `<td></td>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      ${checkboxCell}
      <td class="col-num">${i+1}</td>
      <td style="font-weight:700;">${row.memberName}</td>
      <td style="color:var(--marigold);font-family:var(--font-display);font-size:0.82rem;">${row.memberUID}</td>
      <td>${method}</td>
      <td>${years}</td>
      <td style="text-align:right;font-weight:700;color:var(--marigold-bright);">${amount}</td>
      <td style="font-size:0.82rem;">${formatDate(req.submittedAt)}</td>
      <td style="text-align:center;">${statusBadge}</td>
      <td class="col-action">${actionBtn}</td>`;
    tbody.appendChild(tr);
  });

  // Wire action buttons
  document.querySelectorAll(".pay-action-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = allPaymentRows[parseInt(btn.dataset.idx)];
      openActionModal(row);
    });
  });

  // Wire details buttons (confirmed/rejected)
  document.querySelectorAll(".pay-details-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = allPaymentRows[parseInt(btn.dataset.idx)];
      openDetailsModal(row);
    });
  });

  // Wire delete buttons
  document.querySelectorAll(".pay-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = allPaymentRows[parseInt(btn.dataset.idx)];
      openDeleteModal(row);
    });
  });

  // Wire row checkboxes
  document.querySelectorAll(".pay-row-chk").forEach(chk => {
    chk.addEventListener("change", updateBulkBar);
  });

  // Select all
  const selectAll = document.getElementById("selectAllPending");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.addEventListener("change", function() {
      document.querySelectorAll(".pay-row-chk").forEach(chk => {
        chk.checked = this.checked;
      });
      updateBulkBar();
    });
  }
}

// ── Action modal ──
function openActionModal(row) {
  currentAction = row;
  const req = row.request;

  document.getElementById("payActionModalTitle").textContent =
    `Tindakan Bayaran / Payment Action`;
  document.getElementById("modalMemberName").textContent = row.memberName;
  document.getElementById("modalMemberUID").textContent  = row.memberUID;
  document.getElementById("modalPayMethod").textContent  =
    req.method === "cash" ? "💵 Tunai / Cash Payment"
    : "🏦 Pindahan Bank / Bank Transfer";

  // Year checkboxes
  const years = req.years || [];
  document.getElementById("modalYearCheckboxes").innerHTML = years.map(y => `
    <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer;
      padding:0.4rem 0.6rem;border-radius:var(--radius);
      background:rgba(255,255,255,0.03);border:1px solid var(--border-card);">
      <input type="checkbox" class="modal-year-chk" value="${y}" checked
        style="accent-color:var(--marigold);width:15px;height:15px;"/>
      <span style="font-weight:600;">${y} Yuran Tahunan / Annual Fee
        <span style="color:var(--text-muted);font-size:0.82rem;">(RM 10.00)</span>
      </span>
    </label>`).join("");

  document.getElementById("payActionStatus").textContent = "";
  document.getElementById("rejectReasonWrap").style.display = "none";
  document.getElementById("rejectReasonInput").value = "";
  document.getElementById("payActionModal").style.display = "flex";
}

document.getElementById("closePayActionModal")?.addEventListener("click", () => document.getElementById("payActionModal").style.display="none");

// ── Confirm ──
document.getElementById("btnConfirmPayment")?.addEventListener("click", async () => {
  if (!currentAction) return;
  const selectedYears = [...document.querySelectorAll(".modal-year-chk:checked")]
    .map(c => parseInt(c.value));
  if (!selectedYears.length) {
    document.getElementById("payActionStatus").style.color = "#E05555";
    document.getElementById("payActionStatus").textContent = "Sila pilih sekurang-kurangnya 1 tahun. / Please select at least 1 year.";
    return;
  }

  const btn = document.getElementById("btnConfirmPayment");
  btn.disabled = true; btn.textContent = "Mengesahkan...";

  try {
    const docRef = db.collection("registrations").doc(currentAction.docId);
    const snap   = await docRef.get();
    const data   = snap.data();
    const reqs   = data.paymentRequests || [];
    const paidYears     = data.paidYears || [];
    const paymentHistory = data.paymentHistory || [];
    const confirmedAt   = new Date().toISOString();

    // Update the request status
    const updatedReqs = reqs.map(r =>
      r.id === currentAction.request.id
        ? { ...r, status:"confirmed", confirmedAt, confirmedYears: selectedYears }
        : r
    );

    // Add years to paidYears
    const newPaidYears = [...new Set([...paidYears, ...selectedYears])];

    // Add to payment history
    const newHistory = [
      ...paymentHistory,
      ...selectedYears.map(y => ({
        year:        y,
        method:      currentAction.request.method,
        confirmedAt,
      }))
    ];

    await docRef.update({
      paymentRequests: updatedReqs,
      paidYears:       newPaidYears,
      paymentHistory:  newHistory,
    });

    // Update in-memory
    currentAction.request.status       = "confirmed";
    currentAction.request.confirmedAt  = confirmedAt;
    currentAction.request.confirmedYears = selectedYears;

    document.getElementById("payActionStatus").style.color = "#4CAF7D";
    document.getElementById("payActionStatus").textContent =
      `✅ Disahkan untuk tahun ${selectedYears.join(", ")}. / Confirmed for year(s) ${selectedYears.join(", ")}.`;

    setTimeout(() => {
      document.getElementById("payActionModal").style.display = "none";
      loadPaymentRequests();
    }, 1500);

  } catch(e) {
    console.error(e);
    document.getElementById("payActionStatus").style.color = "#E05555";
    document.getElementById("payActionStatus").textContent = "Ralat. / Error.";
  }
  btn.disabled = false; btn.textContent = "✅ Sahkan / Confirm";
});

// ── Reject ──
document.getElementById("btnRejectPayment")?.addEventListener("click", async () => {
  if (!currentAction) return;
  const selectedYears = [...document.querySelectorAll(".modal-year-chk:checked")]
    .map(c => parseInt(c.value));
  if (!selectedYears.length) {
    document.getElementById("payActionStatus").style.color = "#E05555";
    document.getElementById("payActionStatus").textContent = "Sila pilih sekurang-kurangnya 1 tahun. / Please select at least 1 year.";
    return;
  }

  const reasonWrap = document.getElementById("rejectReasonWrap");
  const reasonInput = document.getElementById("rejectReasonInput");

  // First click — reveal the reason field, don't submit yet
  if (reasonWrap.style.display === "none") {
    reasonWrap.style.display = "block";
    document.getElementById("payActionStatus").style.color = "var(--marigold)";
    document.getElementById("payActionStatus").textContent = "Sila nyatakan sebab penolakan di bawah, kemudian tekan Tolak sekali lagi. / Please state the reason below, then click Reject again.";
    reasonInput.focus();
    return;
  }

  const reason = reasonInput.value.trim();
  if (!reason) {
    document.getElementById("payActionStatus").style.color = "#E05555";
    document.getElementById("payActionStatus").textContent = "Sila nyatakan sebab penolakan. / Please state a reason for rejection.";
    reasonInput.focus();
    return;
  }

  const btn = document.getElementById("btnRejectPayment");
  btn.disabled = true; btn.textContent = "Menolak...";

  try {
    const docRef = db.collection("registrations").doc(currentAction.docId);
    const snap   = await docRef.get();
    const reqs   = snap.data().paymentRequests || [];
    const rejectedAt = new Date().toISOString();

    const updatedReqs = reqs.map(r =>
      r.id === currentAction.request.id
        ? { ...r, status:"rejected", rejectedAt, rejectedYears: selectedYears, rejectionReason: reason }
        : r
    );

    await docRef.update({ paymentRequests: updatedReqs });

    currentAction.request.status          = "rejected";
    currentAction.request.rejectedAt      = rejectedAt;
    currentAction.request.rejectionReason = reason;

    document.getElementById("payActionStatus").style.color = "#E05555";
    document.getElementById("payActionStatus").textContent =
      `❌ Ditolak untuk tahun ${selectedYears.join(", ")}. / Rejected for year(s) ${selectedYears.join(", ")}.`;

    setTimeout(() => {
      document.getElementById("payActionModal").style.display = "none";
      loadPaymentRequests();
    }, 1500);

  } catch(e) {
    console.error(e);
    document.getElementById("payActionStatus").style.color = "#E05555";
    document.getElementById("payActionStatus").textContent = "Ralat. / Error.";
  }
  btn.disabled = false; btn.textContent = "❌ Tolak / Reject";
});
// ── Delete payment request ──
let pendingDelete = null;

function openDeleteModal(row) {
  pendingDelete = row;
  document.getElementById("deletePayMemberName").textContent = row.memberName;
  document.getElementById("deletePayMemberUID").textContent  = row.memberUID;
  document.getElementById("deletePayYears").textContent      = (row.request.years || []).join(", ");
  document.getElementById("deletePayMethod").textContent     =
    row.request.method === "cash" ? "💵 Tunai / Cash" : "🏦 Pindahan Bank / Transfer";
  document.getElementById("deletePayStatus").textContent     = "";
  document.getElementById("payDeleteModal").style.display    = "flex";
}

document.getElementById("closePayDeleteModal")?.addEventListener("click",    () => document.getElementById("payDeleteModal").style.display = "none");
document.getElementById("closePayDeleteModalBtn")?.addEventListener("click", () => document.getElementById("payDeleteModal").style.display = "none");

document.getElementById("btnConfirmDelete")?.addEventListener("click", async () => {
  if (!pendingDelete) return;
  const btn    = document.getElementById("btnConfirmDelete");
  const status = document.getElementById("deletePayStatus");
  btn.disabled = true;
  btn.textContent = "Memadam... / Deleting...";

  try {
    const docRef = db.collection("registrations").doc(pendingDelete.docId);
    const snap   = await docRef.get();
    const reqs   = snap.data().paymentRequests || [];

    const updatedReqs = reqs.filter(r => r.id !== pendingDelete.request.id);
    await docRef.update({ paymentRequests: updatedReqs });

    status.style.color   = "#4CAF7D";
    status.textContent   = "✅ Rekod berjaya dipadam. / Record successfully deleted.";

    setTimeout(() => {
      document.getElementById("payDeleteModal").style.display = "none";
      pendingDelete = null;
      loadPaymentRequests();
    }, 1200);

  } catch(e) {
    console.error(e);
    status.style.color   = "#E05555";
    status.textContent   = "Ralat semasa memadam. / Error while deleting.";
  }

  btn.disabled    = false;
  btn.textContent = "🗑️ Padam / Delete";
});

// ══════════════════════════════════════════════
// BULK ACTION
// ══════════════════════════════════════════════
let bulkMode = null; // "approve" or "reject"

function getSelectedRows() {
  return [...document.querySelectorAll(".pay-row-chk:checked")]
    .map(chk => allPaymentRows[parseInt(chk.dataset.idx)])
    .filter(Boolean);
}

function updateBulkBar() {
  const selected = getSelectedRows();
  const bar      = document.getElementById("bulkActionBar");
  const countEl  = document.getElementById("bulkSelectedCount");
  if (selected.length > 0) {
    bar.style.display    = "block";
    countEl.textContent  = selected.length;
  } else {
    bar.style.display    = "none";
  }
}

// Cancel bulk
document.getElementById("btnBulkCancel")?.addEventListener("click", () => {
  document.querySelectorAll(".pay-row-chk").forEach(chk => chk.checked = false);
  const selectAll = document.getElementById("selectAllPending");
  if (selectAll) selectAll.checked = false;
  updateBulkBar();
});

// Open bulk approve modal
document.getElementById("btnBulkApprove")?.addEventListener("click", () => {
  bulkMode = "approve";
  openBulkModal();
});

// Open bulk reject modal
document.getElementById("btnBulkReject")?.addEventListener("click", () => {
  bulkMode = "reject";
  openBulkModal();
});

function openBulkModal() {
  const selected = getSelectedRows();
  const isApprove = bulkMode === "approve";

  document.getElementById("bulkActionModalTitle").textContent = isApprove
    ? "✅ Luluskan Pembayaran Berganda / Bulk Approve Payments"
    : "❌ Tolak Pembayaran Berganda / Bulk Reject Payments";

  document.getElementById("bulkActionDesc").textContent = isApprove
    ? `Semak dan pilih tahun untuk diluluskan bagi setiap ahli berikut. / Review and select years to approve for each member below.`
    : `Semak dan pilih tahun untuk ditolak bagi setiap ahli berikut. / Review and select years to reject for each member below.`;

  const confirmBtn = document.getElementById("btnBulkConfirm");
  confirmBtn.textContent = isApprove ? "✅ Luluskan Semua / Approve All" : "❌ Tolak Semua / Reject All";
  confirmBtn.style.background   = isApprove ? "" : "rgba(224,85,85,0.15)";
  confirmBtn.style.border       = isApprove ? "" : "1px solid #E05555";
  confirmBtn.style.color        = isApprove ? "" : "#E05555";
  confirmBtn.className          = isApprove ? "btn btn-primary" : "btn";

  // Build list of members with year checkboxes
  const list = document.getElementById("bulkRequestList");
  list.innerHTML = selected.map((row, i) => {
    const req    = row.request;
    const years  = req.years || [];
    const method = req.method === "cash" ? "💵 Tunai / Cash" : "🏦 Pindahan Bank / Transfer";
    return `
      <div style="background:rgba(255,140,0,0.05);border:1px solid var(--border-card);
        border-radius:var(--radius);padding:0.9rem 1rem;">
        <div style="font-weight:700;font-size:0.9rem;margin-bottom:0.2rem;">${row.memberName}</div>
        <div style="font-size:0.78rem;color:var(--marigold);font-family:var(--font-display);">${row.memberUID}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.6rem;">${method}</div>
        <div style="display:flex;flex-direction:column;gap:0.3rem;">
          ${years.map(y => `
            <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer;
              padding:0.35rem 0.6rem;border-radius:var(--radius);
              background:rgba(255,255,255,0.03);border:1px solid var(--border-card);">
              <input type="checkbox" class="bulk-year-chk"
                data-row-idx="${allPaymentRows.indexOf(row)}" data-year="${y}" checked
                style="accent-color:var(--marigold);width:14px;height:14px;"/>
              <span style="font-size:0.85rem;font-weight:600;">${y} Yuran Tahunan / Annual Fee
                <span style="color:var(--text-muted);font-size:0.78rem;">(RM 10.00)</span>
              </span>
            </label>`).join("")}
        </div>
      </div>`;
  }).join("");

  document.getElementById("bulkActionStatus").textContent = "";

  // Shared rejection reason field for bulk reject
  let reasonWrap = document.getElementById("bulkRejectReasonWrap");
  if (!reasonWrap) {
    reasonWrap = document.createElement("div");
    reasonWrap.id = "bulkRejectReasonWrap";
    reasonWrap.style.marginTop = "1rem";
    reasonWrap.innerHTML = `
      <label style="font-family:var(--font-display);font-size:0.82rem;color:#E05555;
        display:block;margin-bottom:0.5rem;">
        Sebab Penolakan (dikenakan pada semua rekod dipilih) / Reason for Rejection (applied to all selected) <span style="color:#E05555;">*</span>
      </label>
      <textarea id="bulkRejectReasonInput" class="form-input" rows="3"
        placeholder="cth/e.g. Resit tidak jelas / Jumlah tidak sepadan..."
        style="width:100%;resize:vertical;"></textarea>`;
    document.getElementById("bulkActionStatus").insertAdjacentElement("beforebegin", reasonWrap);
  }
  reasonWrap.style.display = isApprove ? "none" : "block";
  const bulkReasonInputEl = document.getElementById("bulkRejectReasonInput");
  if (bulkReasonInputEl) bulkReasonInputEl.value = "";

  document.getElementById("bulkActionModal").style.display = "flex";
}

document.getElementById("closeBulkActionModal")?.addEventListener("click",    () => document.getElementById("bulkActionModal").style.display = "none");
document.getElementById("closeBulkActionModalBtn")?.addEventListener("click", () => document.getElementById("bulkActionModal").style.display = "none");

// Bulk confirm
document.getElementById("btnBulkConfirm")?.addEventListener("click", async () => {
  const btn    = document.getElementById("btnBulkConfirm");
  const status = document.getElementById("bulkActionStatus");
  btn.disabled = true;
  btn.textContent = "Memproses... / Processing...";
  status.textContent = "";

  try {
    // Gather selected years per row
    const rowYearMap = new Map();
    document.querySelectorAll(".bulk-year-chk:checked").forEach(chk => {
      const rowIdx = parseInt(chk.dataset.rowIdx);
      const year   = parseInt(chk.dataset.year);
      if (!rowYearMap.has(rowIdx)) rowYearMap.set(rowIdx, []);
      rowYearMap.get(rowIdx).push(year);
    });

    if (rowYearMap.size === 0) {
      status.style.color   = "#E05555";
      status.textContent   = "Sila pilih sekurang-kurangnya 1 tahun. / Please select at least 1 year.";
      btn.disabled = false;
      btn.textContent = bulkMode === "approve" ? "✅ Luluskan Semua / Approve All" : "❌ Tolak Semua / Reject All";
      return;
    }

    // Require rejection reason for bulk reject
    let bulkReason = "";
    if (bulkMode === "reject") {
      const reasonInput = document.getElementById("bulkRejectReasonInput");
      bulkReason = (reasonInput?.value || "").trim();
      if (!bulkReason) {
        status.style.color   = "#E05555";
        status.textContent   = "Sila nyatakan sebab penolakan. / Please state a reason for rejection.";
        btn.disabled = false;
        btn.textContent = "❌ Tolak Semua / Reject All";
        reasonInput?.focus();
        return;
      }
    }

    const now = new Date().toISOString();
    const promises = [];

    rowYearMap.forEach((selectedYears, rowIdx) => {
      const row    = allPaymentRows[rowIdx];
      if (!row) return;
      const docRef = db.collection("registrations").doc(row.docId);

      promises.push((async () => {
        const snap = await docRef.get();
        const data = snap.data();
        const reqs = data.paymentRequests || [];

        if (bulkMode === "approve") {
          const paidYears      = data.paidYears || [];
          const paymentHistory = data.paymentHistory || [];
          const updatedReqs    = reqs.map(r =>
            r.id === row.request.id
              ? { ...r, status:"confirmed", confirmedAt:now, confirmedYears:selectedYears }
              : r
          );
          const newPaidYears = [...new Set([...paidYears, ...selectedYears])];
          const newHistory   = [
            ...paymentHistory,
            ...selectedYears.map(y => ({ year:y, method:row.request.method, confirmedAt:now }))
          ];
          await docRef.update({
            paymentRequests: updatedReqs,
            paidYears:       newPaidYears,
            paymentHistory:  newHistory,
          });
        } else {
          const updatedReqs = reqs.map(r =>
            r.id === row.request.id
              ? { ...r, status:"rejected", rejectedAt:now, rejectedYears:selectedYears, rejectionReason:bulkReason }
              : r
          );
          await docRef.update({ paymentRequests: updatedReqs });
        }
      })());
    });

    await Promise.all(promises);

    const actionWord = bulkMode === "approve" ? "diluluskan / approved" : "ditolak / rejected";
    status.style.color   = bulkMode === "approve" ? "#4CAF7D" : "#E05555";
    status.textContent   = `✅ ${rowYearMap.size} permohonan berjaya ${actionWord}. / ${rowYearMap.size} request(s) successfully ${actionWord}.`;

    // Deselect all and refresh
    setTimeout(() => {
      document.getElementById("bulkActionModal").style.display = "none";
      document.querySelectorAll(".pay-row-chk").forEach(chk => chk.checked = false);
      const selectAll = document.getElementById("selectAllPending");
      if (selectAll) selectAll.checked = false;
      updateBulkBar();
      loadPaymentRequests();
    }, 1500);

  } catch(e) {
    console.error(e);
    status.style.color   = "#E05555";
    status.textContent   = "Ralat semasa memproses. / Error during processing.";
  }

  btn.disabled    = false;
  btn.textContent = bulkMode === "approve" ? "✅ Luluskan Semua / Approve All" : "❌ Tolak Semua / Reject All";
});
// ══════════════════════════════════════════════
// EXPORT PDF
// ══════════════════════════════════════════════
document.getElementById("btnOpenExportPDF")?.addEventListener("click", () => {
  document.getElementById("exportPDFStatusMsg").textContent = "";
  document.getElementById("exportPDFModal").style.display = "flex";
});
document.getElementById("closeExportPDFModal")?.addEventListener("click",    () => document.getElementById("exportPDFModal").style.display = "none");
document.getElementById("closeExportPDFModalBtn")?.addEventListener("click", () => document.getElementById("exportPDFModal").style.display = "none");

document.getElementById("btnConfirmExportPDF")?.addEventListener("click", () => {
  const btn    = document.getElementById("btnConfirmExportPDF");
  const status = document.getElementById("exportPDFStatusMsg");
  const filter = document.getElementById("exportPDFStatus").value;

  const rows = allPaymentRows.filter(r => filter === "all" || r.request.status === filter);

  if (!rows.length) {
    status.style.color = "#E05555";
    status.textContent = "Tiada rekod untuk dieksport. / No records to export.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Menjana... / Generating...";

  try {
    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PAGE_W = 297, PAGE_H = 210, MARGIN = 12;
    const CW     = PAGE_W - MARGIN * 2;

    const BLACK  = [0, 0, 0];
    const MUTED  = [110, 110, 110];
    const BORDER = [180, 180, 180];

    const STATUS_LABELS = {
      pending:   "Menunggu Pengesahan / Pending Confirmation",
      confirmed: "Disahkan / Confirmed",
      rejected:  "Ditolak / Rejected",
      all:       "Semua Status / All Status",
    };

    // Columns: No. | Nama Ahli | ID Unik | Kaedah | Tahun | Jumlah | Tarikh Dihantar | Status
    const COLS   = [10, 55, 28, 30, 22, 22, 38, 45];
    const HEAD_H = 9;
    const ROW_H  = 8;

    let y = MARGIN;
    const now = new Date();

    function drawFooter() {
      const p = doc.getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.setDrawColor(...MUTED);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, PAGE_H - 10, PAGE_W - MARGIN, PAGE_H - 10);
      doc.text("BEM On The Rock — Pengurusan Bayaran / Payment Management", MARGIN, PAGE_H - 5);
      doc.text(String(p), PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });
    }

    function drawTableHeader() {
      const headers = ["Bil.\nNo.", "Nama Ahli\nMember Name", "ID Unik\nUnique ID", "Kaedah\nMethod",
        "Tahun\nYear(s)", "Jumlah\nAmount", "Tarikh Dihantar\nSubmitted", "Status"];
      doc.setFillColor(210, 210, 210);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN, y, CW, HEAD_H, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLACK);
      let x = MARGIN;
      headers.forEach((h, i) => {
        const lines = h.split("\n");
        if (lines.length > 1) {
          doc.text(lines[0], x + 2, y + 3.5);
          doc.text(lines[1], x + 2, y + 7);
        } else {
          doc.text(lines[0], x + 2, y + 5.5);
        }
        if (i < headers.length - 1) doc.line(x + COLS[i], y, x + COLS[i], y + HEAD_H);
        x += COLS[i];
      });
      y += HEAD_H;
    }

    function checkPage(neededH = ROW_H) {
      if (y + neededH > PAGE_H - 14) {
        drawFooter();
        doc.addPage();
        y = MARGIN + 6;
        drawTableHeader();
      }
    }

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("BEM On The Rock  |  Sistem Keanggotaan / Membership System", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...BLACK);
    doc.text("Senarai Pengurusan Bayaran", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(`Payment Management List — ${STATUS_LABELS[filter]}`, MARGIN, y);
    y += 4;
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `Dijana pada / Generated on: ${now.toLocaleDateString("ms-MY", { day:"2-digit", month:"long", year:"numeric" })}, ${now.toLocaleTimeString("ms-MY", { hour:"2-digit", minute:"2-digit" })}`,
      MARGIN, y
    );
    y += 8;

    drawTableHeader();

    rows.forEach((row, i) => {
      const req    = row.request;
      const isRejected = req.status === "rejected" && req.rejectionReason;
      let reasonLines = [];
      if (isRejected) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        reasonLines = doc.splitTextToSize(`Sebab / Reason: ${req.rejectionReason}`, CW - 6);
      }
      const extraH = isRejected ? reasonLines.length * 3.2 + 2 : 0;

      checkPage(ROW_H + extraH);
      const method = req.method === "cash" ? "Tunai / Cash" : "Pindahan Bank / Transfer";
      const years  = (req.years || []).join(", ");
      const amount = `RM ${(req.amount || 0).toFixed(2)}`;
      const statusText = req.status === "pending"   ? "Menunggu / Pending"
                        : req.status === "confirmed" ? "Disahkan / Confirmed"
                        : "Ditolak / Rejected";

      doc.setFillColor(i % 2 === 0 ? 255 : 245, i % 2 === 0 ? 255 : 245, i % 2 === 0 ? 255 : 245);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.rect(MARGIN, y, CW, ROW_H + extraH, "FD");
      let x = MARGIN;
      [0,1,2,3,4,5,6].forEach(ci => { doc.line(x + COLS[ci], y, x + COLS[ci], y + ROW_H); x += COLS[ci]; });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BLACK);
      x = MARGIN;
      const cells = [String(i+1), row.memberName, row.memberUID, method, years, amount, formatDate(req.submittedAt), statusText];
      cells.forEach((val, ci) => {
        doc.text(String(val), x + 2, y + 5.3, { maxWidth: COLS[ci] - 3 });
        x += COLS[ci];
      });

      if (isRejected) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(200, 60, 60);
        reasonLines.forEach((line, li) => {
          doc.text(line, MARGIN + 3, y + ROW_H + 3 + li * 3.2);
        });
      }

      y += ROW_H + extraH;
    });

    y += 6;
    if (y + 8 > PAGE_H - 14) { drawFooter(); doc.addPage(); y = MARGIN + 6; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(`Jumlah Rekod / Total Records: ${rows.length}`, MARGIN, y);

    drawFooter();

    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    doc.save(`BEM_OTR_Payment_${filter}_${dateStr}.pdf`);

    document.getElementById("exportPDFModal").style.display = "none";

  } catch(e) {
    console.error(e);
    status.style.color = "#E05555";
    status.textContent = "Ralat semasa menjana PDF. / Error generating PDF.";
  }

  btn.disabled = false;
  btn.textContent = "📄 Eksport / Export";
});

// ══════════════════════════════════════════════
// DETAILS MODAL (confirmed / rejected rows)
// ══════════════════════════════════════════════
let currentDetailsRow = null;

function openDetailsModal(row) {
  currentDetailsRow = row;
  const req = row.request;

  document.getElementById("detailsMemberName").textContent = row.memberName;
  document.getElementById("detailsMemberUID").textContent  = row.memberUID;
  document.getElementById("detailsPayMethod").textContent  =
    req.method === "cash" ? "💵 Tunai / Cash Payment" : "🏦 Pindahan Bank / Bank Transfer";
  document.getElementById("detailsYears").textContent = (req.years || []).join(", ");

  const statusLine = document.getElementById("detailsStatusLine");
  const reasonWrap = document.getElementById("detailsReasonWrap");
  const reasonText = document.getElementById("detailsReasonText");

  if (req.status === "confirmed") {
    statusLine.innerHTML = `<span style="color:#4CAF7D;">✅ Disahkan pada ${formatDate(req.confirmedAt)} / Confirmed on ${formatDate(req.confirmedAt)}</span>`;
    reasonWrap.style.display = "none";
  } else if (req.status === "rejected") {
    statusLine.innerHTML = `<span style="color:#E05555;">❌ Ditolak pada ${formatDate(req.rejectedAt)} / Rejected on ${formatDate(req.rejectedAt)}</span>`;
    reasonWrap.style.display = "block";
    reasonText.textContent = req.rejectionReason || "Tiada sebab dinyatakan. / No reason stated.";
  }

  document.getElementById("payDetailsModal").style.display = "flex";
}

document.getElementById("closePayDetailsModal")?.addEventListener("click",    () => document.getElementById("payDetailsModal").style.display = "none");
document.getElementById("closePayDetailsModalBtn")?.addEventListener("click", () => document.getElementById("payDetailsModal").style.display = "none");

document.getElementById("btnDetailsRevert")?.addEventListener("click", () => {
  if (!currentDetailsRow) return;
  document.getElementById("payDetailsModal").style.display = "none";
  openRevertModal(currentDetailsRow);
});

// ══════════════════════════════════════════════
// REVERT TO PENDING
// ══════════════════════════════════════════════
let pendingRevert = null;

function openRevertModal(row) {
  pendingRevert = row;
  document.getElementById("revertMemberName").textContent = row.memberName;
  document.getElementById("revertMemberUID").textContent  = row.memberUID;
  document.getElementById("revertYears").textContent      = (row.request.years || []).join(", ");
  document.getElementById("revertStatus").textContent     = "";
  document.getElementById("payRevertModal").style.display = "flex";
}

document.getElementById("closePayRevertModal")?.addEventListener("click",    () => document.getElementById("payRevertModal").style.display = "none");
document.getElementById("closePayRevertModalBtn")?.addEventListener("click", () => document.getElementById("payRevertModal").style.display = "none");

document.getElementById("btnConfirmRevert")?.addEventListener("click", async () => {
  if (!pendingRevert) return;
  const btn    = document.getElementById("btnConfirmRevert");
  const status = document.getElementById("revertStatus");
  btn.disabled = true;
  btn.textContent = "Memproses... / Processing...";

  try {
    const docRef = db.collection("registrations").doc(pendingRevert.docId);
    const snap   = await docRef.get();
    const data   = snap.data();
    const reqs   = data.paymentRequests || [];
    const req    = pendingRevert.request;

    // Revert the request itself back to pending, stripping confirm/reject fields
    const updatedReqs = reqs.map(r => {
      if (r.id !== req.id) return r;
      const { status, confirmedAt, confirmedYears, rejectedAt, rejectedYears, rejectionReason, ...rest } = r;
      return { ...rest, status: "pending" };
    });

    const updatePayload = { paymentRequests: updatedReqs };

    // If it was confirmed, roll back paidYears and paymentHistory for the affected years
    if (req.status === "confirmed") {
      const yearsToRevert = req.confirmedYears || req.years || [];
      const paidYears      = data.paidYears || [];
      const paymentHistory = data.paymentHistory || [];

      updatePayload.paidYears = paidYears.filter(y => !yearsToRevert.includes(y));
      // Remove matching history entries (same year + method, most recent match)
      const newHistory = [...paymentHistory];
      yearsToRevert.forEach(y => {
        const idx = newHistory.findIndex(h => h.year === y && h.method === req.method);
        if (idx !== -1) newHistory.splice(idx, 1);
      });
      updatePayload.paymentHistory = newHistory;
    }

    await docRef.update(updatePayload);

    // Update in-memory
    req.status = "pending";
    delete req.confirmedAt; delete req.confirmedYears;
    delete req.rejectedAt;  delete req.rejectedYears; delete req.rejectionReason;

    status.style.color   = "#3B9EE8";
    status.textContent   = "✅ Status dikembalikan ke Menunggu. / Status reverted to Pending.";

    setTimeout(() => {
      document.getElementById("payRevertModal").style.display = "none";
      pendingRevert = null;
      loadPaymentRequests();
    }, 1200);

  } catch(e) {
    console.error(e);
    status.style.color = "#E05555";
    status.textContent = "Ralat semasa mengembalikan status. / Error while reverting status.";
  }

  btn.disabled = false;
  btn.textContent = "↺ Kembalikan / Revert";
});