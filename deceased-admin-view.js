"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — deceased-admin-view.js
═══════════════════════════════════════════════ */

document.getElementById("deceasedAdminFooterYear").textContent = new Date().getFullYear();

let allRecords = [];

// ── Auth guard ──
auth.onAuthStateChanged(user => {
  if (!user) { window.location.href = "admin.html"; return; }
  loadDeceasedRecords();
});

async function loadDeceasedRecords() {
  try {
    const snap = await db.collection("deceased").orderBy("submittedAt","desc").get();
    allRecords = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable(allRecords);
  } catch(e) {
    console.error("Load error:", e);
  }
}

// ── Search ──
document.getElementById("deceasedSearch").addEventListener("input", function() {
  const q = this.value.trim().toLowerCase();
  const filtered = allRecords.filter(r =>
    (r.deceasedName || "").toLowerCase().includes(q)
  );
  renderTable(filtered);
});

function formatDate(v) {
  if (!v) return "—";
  if (v?.toDate) return v.toDate().toLocaleDateString("en-GB");
  if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y,m,d] = v.split("-"); return `${d}/${m}/${y}`;
  }
  const d = new Date(v);
  return isNaN(d) ? v : d.toLocaleDateString("en-GB");
}

function renderTable(data) {
  const tbody = document.getElementById("deceasedTableBody");
  const empty = document.getElementById("deceasedEmpty");
  tbody.innerHTML = "";

  if (!data.length) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  data.forEach((rec, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-num">${i + 1}</td>
      <td style="font-weight:700;text-transform:uppercase;">${rec.deceasedName || "—"}</td>
      <td>${formatDate(rec.burialDate)}</td>
      <td>${rec.graveLot || "—"}</td>
      <td class="col-action">
        <button class="btn-action-dots view-detail-btn" data-id="${rec.id}"
          style="background:rgba(255,140,0,0.1);border:1px solid var(--marigold-dim);
          border-radius:var(--radius);padding:0.3rem 0.8rem;cursor:pointer;
          color:var(--marigold);font-family:var(--font-display);font-size:0.75rem;
          letter-spacing:0.05em;">
          📄 Lihat / View
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".view-detail-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const rec = allRecords.find(r => r.id === btn.dataset.id);
      if (rec) openDetailModal(rec);
    });
  });
}

// ── Modal ──
function vRow(label, value) {
  return `<div class="vf-row">
    <span class="vf-label">${label}:</span>
    <span class="vf-value">${value || "—"}</span>
  </div>`;
}

function openDetailModal(rec) {
  const heir = rec.heirInfo || {};
  const heirTypeLabel = heir.type === "registered"   ? "Ahli Berdaftar / Registered Member" :
                        heir.type === "unregistered" ? "Tidak Berdaftar / Unregistered Churchgoer" :
                                                       "Orang Luar / Outsider";

  let heirSection = `
    <div class="vf-section-title">A. Maklumat Waris / Heir Information</div>
    <div class="vf-grid">
      ${vRow("Status Waris / Heir Status", heirTypeLabel)}
      ${vRow("Nama / Name", (heir.name||"—").toUpperCase())}
      ${vRow("No. KP / IC No.", heir.ic)}
      ${vRow("No. Telefon / Phone", heir.phone)}
      ${heir.uniqueID ? vRow("ID Unik / Unique ID", `<strong style="color:var(--marigold)">${heir.uniqueID}</strong>`) : ""}
      ${heir.address  ? vRow("Alamat / Address", heir.address) : ""}
      ${vRow("Hubungan / Relationship", heir.relationship)}
    </div>`;

  const body = `
    ${heirSection}

    <div class="vf-section-title">B1. Maklumat Peribadi Si Mati / Personal Information of the Deceased</div>
    <div class="vf-grid">
      ${vRow("Nama Penuh / Full Name", (rec.deceasedName||"—").toUpperCase())}
      ${vRow("No. KP / IC No.", rec.deceasedIC)}
      ${vRow("Jantina / Gender", rec.deceasedGender==="male"?"Lelaki / Male":rec.deceasedGender==="female"?"Perempuan / Female":"—")}
      ${vRow("Bangsa / Race", rec.deceasedRace)}
      ${vRow("Alamat / Address", rec.deceasedAddress)}
      ${vRow("Ahli Berdaftar / Was Registered Member", rec.wasRegisteredMember ? `Ya / Yes (ID: ${rec.registeredMemberUID||"—"})` : "Tidak / No")}
    </div>

    <div class="vf-section-title">B2. Maklumat Kematian / Death Information</div>
    <div class="vf-grid">
      ${vRow("Tarikh Meninggal / Date of Passing", formatDate(rec.dateOfPassing))}
      ${vRow("Punca Kematian / Cause of Death", rec.causeOfDeath)}
      ${vRow("Nombor Lot Kubur / Grave Lot No.", rec.graveLot)}
    </div>

    <div class="vf-section-title">C. Acara Pengebumian / Funeral Service</div>
    <div class="vf-grid">
      ${vRow("Tarikh Dikuburkan / Date of Burial", formatDate(rec.burialDate))}
      ${vRow("Dijalankan Oleh / Conducted By", rec.conductedBy)}
      ${vRow("No. Tel Pengendali / Conductor Phone", rec.conductorPhone)}
      ${vRow("Disaksikan Oleh / Witnessed By", rec.witnessBy)}
      ${vRow("No. Tel Saksi / Witness Phone", rec.witnessPhone)}
    </div>

    <div class="vf-section-title">Diisi Oleh / Filled By</div>
    <div class="vf-grid">
      ${vRow("Nama / Name", (heir.name||"—").toUpperCase())}
      ${vRow("No. KP / IC No.", heir.ic)}
      ${vRow("No. Telefon / Phone", heir.phone)}
      ${vRow("Status / Status", heirTypeLabel)}
      ${heir.uniqueID ? vRow("ID Unik / Unique ID", heir.uniqueID) : ""}
      ${vRow("Tarikh Dihantar / Submitted", formatDate(rec.submittedAt))}
    </div>`;

  document.getElementById("detailModalBody").innerHTML = body;
  document.getElementById("detailModal").style.display = "flex";
}

document.getElementById("closeDetailModal")?.addEventListener("click",    () => document.getElementById("detailModal").style.display="none");
document.getElementById("closeDetailModalBtn")?.addEventListener("click", () => document.getElementById("detailModal").style.display="none");