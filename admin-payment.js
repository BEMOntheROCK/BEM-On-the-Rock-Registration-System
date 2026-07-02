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
      : `<span style="font-size:0.78rem;color:var(--text-muted);">${formatDate(req.confirmedAt || req.rejectedAt)}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
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

  // Wire delete buttons
  document.querySelectorAll(".pay-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = allPaymentRows[parseInt(btn.dataset.idx)];
      openDeleteModal(row);
    });
  });
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

  const btn = document.getElementById("btnRejectPayment");
  btn.disabled = true; btn.textContent = "Menolak...";

  try {
    const docRef = db.collection("registrations").doc(currentAction.docId);
    const snap   = await docRef.get();
    const reqs   = snap.data().paymentRequests || [];
    const rejectedAt = new Date().toISOString();

    const updatedReqs = reqs.map(r =>
      r.id === currentAction.request.id
        ? { ...r, status:"rejected", rejectedAt, rejectedYears: selectedYears }
        : r
    );

    await docRef.update({ paymentRequests: updatedReqs });

    currentAction.request.status      = "rejected";
    currentAction.request.rejectedAt  = rejectedAt;

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