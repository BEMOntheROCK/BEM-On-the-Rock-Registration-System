"use strict";
document.getElementById("affFooterYear").textContent = new Date().getFullYear();

let allAff = [], currentAff = null;

auth.onAuthStateChanged(user => {
  if (!user) { window.location.href="admin.html"; return; }
  loadAffiliated();
});

async function loadAffiliated() {
  const snap = await db.collection("affiliatedMembers").get();
  allAff = snap.docs.map(d => ({id:d.id,...d.data()}));
  // Update total counter
  const countEl = document.getElementById("affTotalCount");
  if (countEl) countEl.textContent = allAff.length;
  renderTable(allAff);
}

function renderTable(data) {
  const tbody = document.getElementById("affTableBody");
  const empty = document.getElementById("affEmpty");
  tbody.innerHTML = "";
  if (!data.length) { empty.style.display="block"; return; }
  empty.style.display="none";
  data.forEach((m, i) => {
    const tr = document.createElement("tr");
    const phone = m.sectionA?.phoneNumber || "—";
    const idDisplay = m.sectionA?.citizenship === "nonCitizen"
      ? (m.sectionA?.foreignID || "—")
      : (m.icNo || "—");
    tr.innerHTML = `
      <td class="col-num">${i+1}</td>
      <td style="font-weight:700;text-transform:uppercase;">${m.name||"—"}</td>
      <td>${idDisplay}</td>
      <td>${phone}</td>
      <td class="col-action">
        <button class="btn-action-dots aff-action-btn" data-id="${m.id}">•••</button>
      </td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll(".aff-action-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentAff = allAff.find(m => m.id === btn.dataset.id);
      if (!currentAff) return;
      document.getElementById("affActionModalTitle").textContent =
        (currentAff.name||"—").toUpperCase();
      document.getElementById("affActionModal").style.display = "flex";
    });
  });
}

// Sort + Search
function applyFilters() {
  const q     = document.getElementById("affSearch").value.toLowerCase();
  const sort  = document.getElementById("affSort").value;
  const order = document.getElementById("affOrder").value;
  let data = allAff.filter(m =>
    (m.name||"").toLowerCase().includes(q) ||
    (String(m.icNo||"")||"").toLowerCase().includes(q) ||
    (String(m.sectionA?.foreignID||"")||"").toLowerCase().includes(q) ||
    (m.sectionA?.phoneNumber||"").includes(q)
  );
  data.sort((a,b) => {
    const va = sort==="name" ? (a.name||"") : (a.submittedAt?.seconds||0);
    const vb = sort==="name" ? (b.name||"") : (b.submittedAt?.seconds||0);
    if (va < vb) return order==="asc" ? -1 : 1;
    if (va > vb) return order==="asc" ? 1  : -1;
    return 0;
  });
  renderTable(data);
}
["affSearch","affSort","affOrder"].forEach(id =>
  document.getElementById(id).addEventListener("input", applyFilters)
);

// ── View ──
function vRow(label, value) {
  return `<div class="vf-row"><span class="vf-label">${label}:</span><span class="vf-value">${value||"—"}</span></div>`;
}
document.getElementById("affBtnView").addEventListener("click", () => {
  if (!currentAff) return;
  const a = currentAff.sectionA || {};
  const idDisplay = a.citizenship === "nonCitizen"
    ? (a.foreignID || "—")
    : (a.icNo || "—");
  const html = `
    <div class="vf-section-title">A. Maklumat Peribadi / Personal Information</div>
    <div class="vf-grid">
      ${vRow("Nama Penuh / Full Name", (a.fullName||currentAff.name||"").toUpperCase())}
      ${vRow("No. KP / IC No.", idDisplay)}
      ${vRow("ID Unik / Unique ID", currentAff.uniqueID)}
      ${vRow("Jantina / Gender", a.gender==="male"?"Lelaki":"Perempuan")}
      ${vRow("Tarikh Lahir / DOB", a.dob)}
      ${vRow("Bangsa / Race", a.race)}
      ${vRow("Status Perkahwinan / Marital Status", a.maritalStatus)}
      ${vRow("Status Pembaptisan / Baptism", a.baptismStatus)}
      ${vRow("Tahun Pembaptisan / Year Baptised", a.baptismYear)}
      ${vRow("Warganegara / Citizenship", a.citizenship)}
      ${vRow("No. Telefon / Phone", a.phoneNumber)}
      ${vRow("Pekerjaan / Occupation", a.occupation)}
      ${vRow("Gereja Asal / Original Church", a.originalChurch)}
      ${vRow("Tahun Menyertai / Year Joining", a.yearJoining)}
      ${vRow("Alamat / Address", a.currentAddress)}
    </div>`;
  document.getElementById("affViewBody").innerHTML = html;
  document.getElementById("affActionModal").style.display = "none";
  document.getElementById("affViewModal").style.display = "flex";
});

// ── Print ──
document.getElementById("affBtnPrint").addEventListener("click", () => {
  if (!currentAff) return;
  const a = currentAff.sectionA || {};
  const w = window.open("","_blank");
  w.document.write(`<html><head><title>${(a.fullName||"").toUpperCase()}</title>
  <style>body{font-family:Arial,sans-serif;padding:20px;}h2{color:#CC7000;}
  .row{display:flex;gap:8px;margin:4px 0;}.lbl{font-weight:bold;min-width:200px;}</style></head><body>
  <h2>BEM On The Rock — Jemaat Bersekutu</h2>
  <h3>${(a.fullName||"").toUpperCase()}</h3>
  <div class="row"><span class="lbl">No. KP:</span><span>${a.icNo||"—"}</span></div>
  <div class="row"><span class="lbl">No. Telefon:</span><span>${a.phoneNumber||"—"}</span></div>
  <div class="row"><span class="lbl">Jantina:</span><span>${a.gender||"—"}</span></div>
  <div class="row"><span class="lbl">Bangsa:</span><span>${a.race||"—"}</span></div>
  <div class="row"><span class="lbl">Alamat:</span><span>${a.currentAddress||"—"}</span></div>
  </body></html>`);
  w.print();
  document.getElementById("affActionModal").style.display = "none";
});

// ── Delete ──
document.getElementById("affBtnDelete").addEventListener("click", async () => {
  if (!currentAff) return;
  if (!confirm(`Padam rekod ${(currentAff.name||"").toUpperCase()}? / Delete this record?`)) return;
  await db.collection("affiliatedMembers").doc(currentAff.id).delete();
  document.getElementById("affActionModal").style.display = "none";
  allAff = allAff.filter(m => m.id !== currentAff.id);
  currentAff = null;
  applyFilters();
});