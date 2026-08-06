"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — audit-log.js
═══════════════════════════════════════════════ */

document.getElementById("auditFooterYear").textContent = new Date().getFullYear();

let allLogs = [];

// ── Auth guard ──
auth.onAuthStateChanged(user => {
  if (!user) { window.location.href = "admin.html"; return; }
  loadAuditLogs();
});

// ── Load ──
async function loadAuditLogs() {
  try {
    const snap = await db.collection("auditLogs")
      .orderBy("timestamp", "desc")
      .limit(500)
      .get();

    allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById("auditLoading").style.display = "none";
    applyFilters();
  } catch(e) {
    console.error("Load error:", e);
    document.getElementById("auditLoading").textContent = "Ralat memuatkan data. / Error loading data.";
  }
}

// ── Filters ──
function applyFilters() {
  const q          = document.getElementById("auditSearch").value.toLowerCase().trim();
  const dateFrom   = document.getElementById("auditDateFrom").value;
  const dateTo     = document.getElementById("auditDateTo").value;
  const source     = document.getElementById("auditSourceFilter").value;

  const filtered = allLogs.filter(log => {
    if (q && !(log.memberName||"").toLowerCase().includes(q) &&
             !(log.memberUID||"").toLowerCase().includes(q)) return false;
    if (source !== "all" && log.source !== source) return false;
    const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
    if (dateFrom && ts < new Date(dateFrom)) return false;
    if (dateTo   && ts > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  document.getElementById("auditResultCount").textContent =
    `${filtered.length} rekod dijumpai / record(s) found`;

  renderTable(filtered);
}

["auditSearch","auditDateFrom","auditDateTo","auditSourceFilter"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", applyFilters);
  document.getElementById(id)?.addEventListener("change", applyFilters);
});

document.getElementById("btnAuditReset")?.addEventListener("click", () => {
  document.getElementById("auditSearch").value      = "";
  document.getElementById("auditDateFrom").value    = "";
  document.getElementById("auditDateTo").value      = "";
  document.getElementById("auditSourceFilter").value = "all";
  applyFilters();
});

// ── Format date ──
function formatDateTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB") + " " +
    d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

// ── Render table ──
function renderTable(logs) {
  const tbody = document.getElementById("auditTableBody");
  const empty = document.getElementById("auditEmpty");
  tbody.innerHTML = "";

  if (!logs.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  logs.forEach((log, i) => {
    const sourceBadge = log.source === "admin"
      ? `<span style="color:#6495ED;font-family:var(--font-display);font-size:0.75rem;
           letter-spacing:0.04em;">🔒 Admin</span>`
      : `<span style="color:#4CAF7D;font-family:var(--font-display);font-size:0.75rem;
           letter-spacing:0.04em;">👤 Ahli / Member</span>`;

    const changeCount = (log.changes||[]).length;
    const changeLabel = `<span style="font-family:var(--font-display);font-size:0.78rem;
      color:var(--marigold);">${changeCount} medan / field(s)</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-num">${i + 1}</td>
      <td style="font-weight:700;text-transform:uppercase;">${log.memberName || "—"}</td>
      <td style="color:var(--marigold);font-family:var(--font-display);font-size:0.82rem;">
        ${log.memberUID || "—"}
      </td>
      <td>${sourceBadge}</td>
      <td style="font-size:0.82rem;white-space:nowrap;">${formatDateTime(log.timestamp)}</td>
      <td>${changeLabel}</td>
      <td class="col-action">
        <button class="btn-action-dots audit-view-btn"
          style="background:rgba(100,160,255,0.1);border:1px solid rgba(100,160,255,0.3);
          border-radius:var(--radius);padding:0.3rem 0.8rem;cursor:pointer;
          color:#6495ED;font-family:var(--font-display);font-size:0.75rem;"
          data-id="${log.id}">
          📄 Lihat / View
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".audit-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const log = allLogs.find(l => l.id === btn.dataset.id);
      if (log) openDetailModal(log);
    });
  });
}

// ── Detail modal ──
function openDetailModal(log) {
  document.getElementById("auditDetailName").textContent =
    (log.memberName || "—").toUpperCase();
  document.getElementById("auditDetailUID").textContent =
    log.memberUID || "—";
  document.getElementById("auditDetailSource").innerHTML =
    log.source === "admin"
      ? `<span style="color:#6495ED;">🔒 Admin</span>`
      : `<span style="color:#4CAF7D;">👤 Ahli / Member</span>`;
  document.getElementById("auditDetailTime").textContent =
    formatDateTime(log.timestamp);

  const changes = log.changes || [];
  document.getElementById("auditDetailBody").innerHTML = changes.map((c, i) => `
    <tr style="border-bottom:1px solid var(--border-card);
      ${i % 2 !== 0 ? "background:rgba(255,255,255,0.02);" : ""}">
      <td style="padding:0.55rem 0.8rem;font-size:0.8rem;color:var(--text-muted);
        white-space:nowrap;">${c.section || "—"}</td>
      <td style="padding:0.55rem 0.8rem;font-size:0.88rem;font-weight:600;
        color:var(--text-primary);">${c.field || "—"}</td>
      <td style="padding:0.55rem 0.8rem;font-size:0.85rem;color:#E05555;">
        ${c.before || "—"}
      </td>
      <td style="padding:0.55rem 0.8rem;font-size:0.85rem;color:#4CAF7D;">
        ${c.after || "—"}
      </td>
    </tr>`).join("");

  document.getElementById("auditDetailModal").style.display = "flex";
}

document.getElementById("closeAuditDetailModal")?.addEventListener("click",
  () => document.getElementById("auditDetailModal").style.display = "none");
document.getElementById("closeAuditDetailModalBtn")?.addEventListener("click",
  () => document.getElementById("auditDetailModal").style.display = "none");