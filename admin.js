"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — admin.js
═══════════════════════════════════════════════ */

document.getElementById("adminFooterYear").textContent = new Date().getFullYear();

// ── Password visibility toggle ──
document.getElementById("togglePassword")?.addEventListener("click", function() {
  const input = document.getElementById("adminPassword");
  const icon  = document.getElementById("togglePasswordIcon");
  if (input.type === "password") {
    input.type = "text";
    // Open eye (password visible)
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  } else {
    input.type = "password";
    // Closed eye (password hidden)
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  }
});

function generateAdminUniqueID(fullName, idType, icNo, yearJoining, foreignID) {
  const names    = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const initials = names.map(n => n[0].toUpperCase()).join("");
  const yr       = String(yearJoining || "").slice(-2);

  if (idType === "Passport") {
    const passportNorm = String(foreignID || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const first4 = passportNorm.slice(0, 4).padEnd(4, "0");
    return `${initials}-${first4}-${yr}`;
  }

  // IC & MyTentera: preserve existing last-4 approach
  const idSource = idType === "IC" ? icNo : foreignID;
  const idClean  = String(idSource || "")
    .replace(/-/g,"")
    .replace(/\s+/g,"");
  const last4    = idClean.length >= 4 ? idClean.slice(-4) : idClean.padStart(4,"0");
  return `${initials}-${last4}-${yr}`;
}

const SERVICE_NAMES = [
  "","Pastoral","Pekerja Sepenuh Masa (Gereja)","[Rock Wave] Penyanyi","[Rock Wave] Pemain Muzik",
  "[Rock Wave] Penari Kreatif","Multimedia","Pengendali Sistem Bunyi","Pengendali Pencahayaan",
  "Usher","Keselamatan & Parkir","Krew Pentas","Hospitaliti untuk Jemaat Baru","Hospitaliti untuk VIP",
  "Rock Essence","Rock Resource","Kaunter Maklumat","Pengangkutan","Pendoa Syafaat",
  "Kebajikan & Sosial","Adiwira","Pembantu Peribadi Pastor & Penceramah","Penginjilan","Tim Persembahan"
];

const genderMap  = { male:"Lelaki / Male", female:"Perempuan / Female" };
const maritalMap = {
  single:"Bujang / Single", engaged:"Bertunang / Engaged", married:"Berkahwin / Married",
  divorced:"Bercerai / Divorced", widowed:"Balu/Duda / Widowed"
};
const baptismMap = { baptised:"Sudah Dibaptis / Baptised", notBaptised:"Belum Dibaptis / Not Yet Baptised" };

// ── Normalise komsel code (auto-prepend Z if missing) ──
function normaliseAdminKomsel(val) {
  if (!val || !val.trim()) return "—";
  const clean = val.toUpperCase().replace(/[\s\-]/g, "");
  const match = clean.match(/^([A-Z]+)(\d+)$/);
  if (!match) return clean;
  let prefix = match[1];
  if (!prefix.startsWith("Z")) prefix = "Z" + prefix;
  return prefix + parseInt(match[2], 10);
}

let registrations   = [];
let pendingDeleteId = null;
let pendingActivateId = null;
let pendingDeactivateId = null;
let deactivateTimer   = null;
let currentSort       = { by:"date", order:"asc" };
let searchQuery       = "";

// ── Auth ──
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById("loginOverlay").style.display = "none";
    document.getElementById("adminPage").style.display    = "block";
    loadRegistrations();
  } else {
    document.getElementById("adminPage").style.display    = "none";
    document.getElementById("loginOverlay").style.display = "flex";
  }
});

// ── Login ──
document.getElementById("btnLogin").addEventListener("click", async () => {
  const email    = document.getElementById("adminUsername").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errEl    = document.getElementById("loginError");
  const btn      = document.getElementById("btnLogin");
  if (!email || !password) { errEl.textContent = "Sila isi emel dan kata laluan."; return; }
  btn.disabled = true; btn.textContent = "Log masuk...";
  errEl.textContent = "";
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(e) {
    errEl.textContent = "Emel atau kata laluan salah. / Incorrect email or password.";
    btn.disabled = false; btn.textContent = "Log Masuk / Login";
  }
});

["adminUsername","adminPassword"].forEach(id =>
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btnLogin").click();
  })
);

// ── Logout ──
document.getElementById("btnLogout").addEventListener("click", () => auth.signOut());

// ── Load ──
function loadRegistrations() {
  db.collection("registrations").orderBy("submittedAt","desc")
    .onSnapshot(snap => {
      registrations = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      renderTable();
    }, err => console.error("Firestore:", err));
}

// ── Search & Sort ──
document.getElementById("adminSearch").addEventListener("input", function() {
  searchQuery = this.value.trim().toLowerCase(); renderTable();
});
document.getElementById("sortBy").addEventListener("change",    function() { currentSort.by    = this.value; renderTable(); });
document.getElementById("sortOrder").addEventListener("change", function() { currentSort.order = this.value; renderTable(); });

function getSortedFiltered() {
  let data = [...registrations];
  if (searchQuery) {
    const q = searchQuery;
    const qDigits = q.replace(/[^0-9]/g, "");
    data = data.filter(r => {
      const nameMatch    = (r.name||"").toLowerCase().includes(q);
      const icDigits     = String(r.icNo || "").replace(/-/g,"").toLowerCase();
      const foreignRaw   = String(r.sectionA?.foreignID || "");
      const foreignNorm  = foreignRaw.replace(/-/g,"").toLowerCase();
      const foreignMatch = foreignNorm.includes(q) || foreignRaw.toLowerCase().includes(q);
      const uniqueMatch  = (r.uniqueID||"").toLowerCase().includes(q);
      const numericMatch = qDigits ? (icDigits.includes(qDigits) || foreignNorm.includes(qDigits)) : false;
      return nameMatch || uniqueMatch || foreignMatch || numericMatch;
    });
  }
  data.sort((a,b) => {
    let vA, vB;
    switch(currentSort.by) {
      case "name":   vA=(a.name||"").toLowerCase();   vB=(b.name||"").toLowerCase(); break;
      case "id":     vA=(a.uniqueID||"").toLowerCase();vB=(b.uniqueID||"").toLowerCase(); break;
      case "ic": {
        const pick = (reg) => (reg.sectionA?.citizenship === "nonCitizen"
          ? (reg.sectionA?.foreignID || "")
          : (reg.icNo || ""));
        vA = pick(a);
        vB = pick(b);
        break;
      }
      case "komsel": vA=normaliseAdminKomsel(a.sectionA?.komselCode||""); vB=normaliseAdminKomsel(b.sectionA?.komselCode||""); break;
      default:
        vA = a.submittedAt?.toDate ? a.submittedAt.toDate().toISOString() : (a.dateApplied||"");
        vB = b.submittedAt?.toDate ? b.submittedAt.toDate().toISOString() : (b.dateApplied||"");
    }
    if (vA < vB) return currentSort.order==="asc" ? -1 : 1;
    if (vA > vB) return currentSort.order==="asc" ?  1 :-1;
    return 0;
  });
  return data;
}

function formatDate(d) {
  if (!d) return "—";
  const date = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-GB"); // DD/MM/YYYY
}

// For plain YYYY-MM-DD strings stored as DOB
function formatDOB(dob) {
  if (!dob) return "—";
  const parts = dob.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dob;
}

// ── Render Table ──
function renderTable() {
  const tbody = document.getElementById("adminTableBody");
  const empty = document.getElementById("adminEmpty");
  tbody.innerHTML = "";
  const data = getSortedFiltered();
  if (!data.length) { empty.style.display="block"; return; }
  empty.style.display = "none";

  data.forEach((reg, i) => {
    const tr  = document.createElement("tr");
    const a = reg.sectionA || {};
    const inferredIdType =
      a.idType || (a.citizenship === "nonCitizen"
        ? (/[A-Za-z]/.test(String(a.foreignID || "")) ? "Passport" : "MyTentera")
        : "IC");
    const uid = reg.uniqueID || generateAdminUniqueID(reg.name, inferredIdType, reg.icNo, a.yearJoining, a.foreignID);
    const photoHTML = reg.photoURL
      ? `<img src="${reg.photoURL}" class="admin-photo-thumb" alt="Photo"/>`
      : `<div class="admin-photo-placeholder">👤</div>`;
    const isActive      = reg.approved === true;
    const isTransferred = reg.transferred === true;

    let statusHTML;
    if (isTransferred) {
      statusHTML = `<span class="membership-badge membership-badge--transferred">↗ Berpindah / Transferred</span>`;
    } else if (isActive) {
      statusHTML = `<span class="membership-badge membership-badge--active">✔ Aktif / Active</span>`;
    } else {
      statusHTML = `<span class="membership-badge membership-badge--inactive">✖ Tidak Aktif / Inactive</span>`;
    }

    // Action button logic
    let activateBtn;
    if (isTransferred) {
      activateBtn = `<button class="action-dropdown-item cancel-transfer-btn" data-id="${reg.id}" data-name="${reg.name||""}"><span class="action-icon">↩️</span> Batal Pindah / Cancel Transfer</button>`;
    } else if (isActive) {
      activateBtn = `<button class="action-dropdown-item deactivate-btn" data-id="${reg.id}" data-name="${reg.name||""}"><span class="action-icon">🔴</span> Nyahaktifkan / Deactivate</button>`;
    } else {
      activateBtn = `<button class="action-dropdown-item activate-btn" data-id="${reg.id}" data-name="${reg.name||""}"><span class="action-icon">🟢</span> Aktifkan / Activate</button>`;
    }

    tr.innerHTML = `
      <td class="row-checkbox-cell" style="display:none;text-align:center;width:36px;">
        <input type="checkbox" class="row-select-cb" data-id="${reg.id}"/>
      </td>
      <td class="col-photo">${photoHTML}</td>
      <td class="col-nameID">
        <div class="admin-name-bold">${(reg.name||"—")}</div>
        <div class="admin-uid-tag">${uid}</div>
      </td>
      <td>${reg.sectionA?.citizenship === "nonCitizen"
        ? (reg.sectionA?.foreignID || "—")
        : (reg.icNo || "—")}</td>
      <td>${normaliseAdminKomsel(reg.sectionA?.komselCode)}</td>
      <td>${formatDate(reg.submittedAt || reg.dateApplied)}</td>
      <td class="col-memberstatus">${statusHTML}</td>
      <td class="action-cell">
        <button class="btn-action-dots" data-id="${reg.id}">•••</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // If select mode is active, show checkbox cells and restore checked state
  if (isSelectMode) {
    document.querySelectorAll(".row-checkbox-cell").forEach(td => td.style.display = "");
    document.querySelectorAll(".row-select-cb").forEach(cb => {
      if (selectedIds.has(cb.dataset.id)) cb.checked = true;
      cb.addEventListener("change", function() {
        if (this.checked) selectedIds.add(this.dataset.id);
        else { selectedIds.delete(this.dataset.id); document.getElementById("selectAllCheckbox").checked = false; }
        updateBulkCount();
      });
    });
  }

  bindTableEvents();
}

// ── Table Events ──
let currentActionId = null;

function bindTableEvents() {
  // Row checkboxes
  document.querySelectorAll(".row-select-cb").forEach(cb => {
    cb.addEventListener("change", function() {
      if (this.checked) selectedIds.add(this.dataset.id);
      else { selectedIds.delete(this.dataset.id); document.getElementById("selectAllCheckbox").checked = false; }
      updateBulkCount();
    });
  });

  document.querySelectorAll(".btn-action-dots").forEach(btn => {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      currentActionId = this.dataset.id;
      const reg = registrations.find(r => r.id === currentActionId);
      if (!reg) return;

      // Set modal title to member name
      document.getElementById("actionModalName").textContent =
        (reg.name || reg.sectionA?.fullName || "—").toUpperCase();

      // Set status button label dynamically
      const statusBtn = document.getElementById("actionBtnStatus");
      if (reg.transferred) {
        statusBtn.innerHTML = `<span class="action-icon">↩️</span> Batal Pindah / Cancel Transfer`;
      } else if (reg.approved) {
        statusBtn.innerHTML = `<span class="action-icon">🔴</span> Nyahaktifkan / Deactivate`;
      } else {
        statusBtn.innerHTML = `<span class="action-icon">🟢</span> Aktifkan / Activate`;
      }

      document.getElementById("actionModal").style.display = "flex";
    });
  });
}

// Action modal button wiring
document.getElementById("closeActionModal")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none"; currentActionId = null;
});
document.getElementById("closeActionModalBtn")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none"; currentActionId = null;
});

document.getElementById("actionBtnView")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none";
  openViewModal(currentActionId);
});
document.getElementById("actionBtnPrint")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none";
  printRecord(currentActionId);
});
document.getElementById("actionBtnStatus")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none";
  const reg = registrations.find(r => r.id === currentActionId);
  if (!reg) return;
  if (reg.transferred) cancelTransfer(currentActionId, reg.name);
  else if (reg.approved) openDeactivateModal(currentActionId, reg.name);
  else openActivateModal(currentActionId, reg.name);
});
document.getElementById("actionBtnCard")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none";
  openMembershipCardModal(currentActionId);
});
document.getElementById("actionBtnDelete")?.addEventListener("click", () => {
  document.getElementById("actionModal").style.display = "none";
  pendingDeleteId = currentActionId;
  document.getElementById("deleteModal").style.display = "flex";
});

// ── XLSX Download ──
document.getElementById("btnDownloadXLSX")?.addEventListener("click", () => {
  const rows = registrations.map(reg => {
    const a = reg.sectionA || {};
    const b = reg.sectionB || {};
    const c = reg.sectionC || {};
    const services = b.services || {};
    const involved    = Object.entries(services).filter(([,v])=>v?.current).map(([k])=>k).join(", ");
    const wantToJoin  = Object.entries(services).filter(([,v])=>v?.join).map(([k])=>k).join(", ");
    const children    = (c.children||[]).filter(ch=>ch.name?.trim()&&ch.gender).length;
    return {
      "Nama / Name":              (a.fullName||reg.name||"").toUpperCase(),
      "ID Unik / Unique ID":      reg.uniqueID||"",
      "No. KP / IC No.":          a.icNo||reg.icNo||"",
      "No. Telefon / Phone":      a.phoneNumber||"",
      "Jantina / Gender":         a.gender||"",
      "Tarikh Lahir / DOB":       formatDOB(a.dob||""),
      "Bangsa / Race":             a.race||"",
      "Pekerjaan / Occupation":   a.occupation||"",
      "Status Perkahwinan / Marital": a.maritalStatus||"",
      "Status Pembaptisan / Baptism": a.baptismStatus||"",
      "Tahun Pembaptisan / Year Baptised": a.baptismYear||"",
      "Warganegara / Citizenship": a.citizenship||"",
      "Gereja Asal / Original Church": a.originalChurch||"",
      "Tahun Menyertai OTR / Year Joining": a.yearJoining||"",
      "Jawatan Komsel / Cell Role": a.memberRole||"",
      "Kod Komsel / Cell Code":    a.komselCode||"",
      "Alamat / Address":          a.currentAddress||"",
      "Perkhidmatan Semasa / Current Services": involved,
      "Ingin Sertai / Want To Join": wantToJoin,
      "Bilangan Anak / No. Children": children,
      "Status Keanggotaan / Status": reg.approved ? "Aktif" : reg.transferred ? "Berpindah" : "Tidak Aktif",
    };
  });
  const ws  = XLSX.utils.json_to_sheet(rows);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Senarai Ahli");
  XLSX.writeFile(wb, `BEM_OTR_Senarai_Ahli_${new Date().toISOString().split("T")[0]}.xlsx`);
});

// ── Overall Statistic XLSX Download ──
document.getElementById("btnDownloadOverallStatsXLSX")?.addEventListener("click", async () => {
  try {
    const affiliatedSnap = await db.collection("affiliatedMembers").get();
    const affiliatedMembers = affiliatedSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const registeredRows = registrations.map((reg, i) => {
      const a = reg.sectionA || {};
      return [
        i + 1,
        (a.fullName || reg.name || "—").toUpperCase(),
        a.icNo || reg.icNo || "—",
        a.phoneNumber || "—"
      ];
    });

    const affiliatedRows = affiliatedMembers.map((m, i) => {
      const a = m.sectionA || {};
      return [
        i + 1,
        (a.fullName || m.name || "—").toUpperCase(),
        a.icNo || m.icNo || "—",
        a.phoneNumber || "—"
      ];
    });

    const childrenRows = [];
    registrations.forEach(reg => {
      const a = reg.sectionA || {};
      const parentName = (a.fullName || reg.name || "").toUpperCase().trim();
      const parentPhone = a.phoneNumber || "—";
      const children = (reg.sectionC?.children || []).filter(c => c.name?.trim() && c.gender);
      children.forEach(child => {
        childrenRows.push([
          childrenRows.length + 1,
          child.name?.trim().toUpperCase() || "—",
          child.myKid || "—"
        ]);
      });
    });

    const wsData = [];
    const pushTitleRow = (title, cols = 4) => wsData.push([title, ...Array(cols - 1).fill("")]);
    const pushHeader = (col3Label = "IC", includePhone = true) =>
      includePhone
        ? wsData.push(["NUM", "NAME", col3Label, "PHONE NUM"])
        : wsData.push(["NUM", "NAME", col3Label]);

    pushTitleRow("REGISTERED USERS");
    pushHeader("IC");
    wsData.push(...registeredRows);
    wsData.push(["TOTAL REGISTERED USERS", "", "", registeredRows.length]);
    wsData.push(["", "", "", ""]);

    pushTitleRow("AFFILIATED MEMBERS");
    pushHeader("IC");
    wsData.push(...affiliatedRows);
    wsData.push(["TOTAL AFFILIATED MEMBER", "", "", affiliatedRows.length]);
    wsData.push(["", "", "", ""]);

    pushTitleRow("CHILDREN", 3);
    pushHeader("MyKID", false);
    wsData.push(...childrenRows);
    wsData.push(["TOTAL CHILDREN", "", childrenRows.length]);
    wsData.push(["", "", ""]);

    const overallTotal = registeredRows.length + affiliatedRows.length + childrenRows.length;
    wsData.push(["OVERALL TOTAL", "", "", overallTotal]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 8 },
      { wch: 34 },
      { wch: 24 },
      { wch: 20 }
    ];

    // Merge section titles and total labels across first 3 columns.
    ws["!merges"] = [
      XLSX.utils.decode_range("A1:C1"),
      XLSX.utils.decode_range(`A${registeredRows.length + 3}:C${registeredRows.length + 3}`),
      XLSX.utils.decode_range(`A${registeredRows.length + 5}:C${registeredRows.length + 5}`),
      XLSX.utils.decode_range(`A${registeredRows.length + affiliatedRows.length + 7}:C${registeredRows.length + affiliatedRows.length + 7}`),
      XLSX.utils.decode_range(`A${registeredRows.length + affiliatedRows.length + 9}:B${registeredRows.length + affiliatedRows.length + 9}`),
      XLSX.utils.decode_range(`A${registeredRows.length + affiliatedRows.length + childrenRows.length + 11}:B${registeredRows.length + affiliatedRows.length + childrenRows.length + 11}`),
      XLSX.utils.decode_range(`A${registeredRows.length + affiliatedRows.length + childrenRows.length + 13}:B${registeredRows.length + affiliatedRows.length + childrenRows.length + 13}`)
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overall Statistic");
    XLSX.writeFile(wb, `BEM_OTR_Overall_Statistic_${new Date().toISOString().split("T")[0]}.xlsx`);
  } catch (e) {
    console.error("Overall statistic export error:", e);
    alert("Gagal jana fail Overall Statistic .xlsx. / Failed to generate Overall Statistic .xlsx.");
  }
});

// ── Activate Modal ──
function openActivateModal(id, name) {
  pendingActivateId = id;
  document.getElementById("activateModalTitle").textContent = "Aktifkan Keanggotaan / Activate Membership";
  document.getElementById("activateModalText").innerHTML =
    `Aktifkan status keanggotaan <strong>${name}</strong>?<br/>
     <em style="color:var(--text-muted);font-size:0.9rem;">Activate <strong>${name}</strong>'s membership status?</em>`;
  // Pre-fill with today's date — editable by admin
  document.getElementById("activateDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("activateModal").style.display = "flex";
}

document.getElementById("cancelActivateBtn").addEventListener("click", () => {
  document.getElementById("activateModal").style.display = "none"; pendingActivateId = null;
});
document.getElementById("closeActivateModal").addEventListener("click", () => {
  document.getElementById("activateModal").style.display = "none"; pendingActivateId = null;
});
document.getElementById("confirmActivateBtn").addEventListener("click", async () => {
  if (!pendingActivateId) return;
  const reg = registrations.find(r => r.id === pendingActivateId);
  const chosenDate = document.getElementById("activateDate").value;
  const approvedAt = chosenDate ? new Date(chosenDate) : new Date();

  // ── Check for unpaid fees ──
  if (reg) {
    const pendingFees = calculateAdminPendingFees(reg, approvedAt);
    if (pendingFees > 0) {
      document.getElementById("activateModal").style.display = "none";
      // Show unpaid warning
      document.getElementById("unpaidWarningName").textContent =
        reg.name || reg.sectionA?.fullName || "—";
      document.getElementById("unpaidWarningAmount").textContent =
        `RM ${(pendingFees * 10).toFixed(2)}`;
      document.getElementById("unpaidWarningModal").style.display = "flex";
      return;
    }
  }

  await doActivate(pendingActivateId, approvedAt);
  document.getElementById("activateModal").style.display = "none";
  pendingActivateId = null;
});

function calculateAdminPendingFees(reg, approvedAt) {
  const currentYear = new Date().getFullYear();
  const approvedYear = approvedAt.getFullYear();
  const paidYears   = reg.paidYears || [];
  let unpaid = 0;
  for (let y = approvedYear; y <= currentYear; y++) {
    if (!paidYears.includes(y)) unpaid++;
  }
  return unpaid;
}

async function doActivate(id, approvedAt) {
  try {
    await db.collection("registrations").doc(id).update({
      approved:   true,
      approvedAt: firebase.firestore.Timestamp.fromDate(approvedAt)
    });
  } catch(e) { alert("Ralat / Error: " + e.message); }
}

// Unpaid warning — confirm anyway
document.getElementById("btnActivateAnyway")?.addEventListener("click", async () => {
  document.getElementById("unpaidWarningModal").style.display = "none";
  const chosenDate = document.getElementById("activateDate").value;
  const approvedAt = chosenDate ? new Date(chosenDate) : new Date();
  await doActivate(pendingActivateId, approvedAt);
  pendingActivateId = null;
});

document.getElementById("btnCancelUnpaid")?.addEventListener("click", () => {
  document.getElementById("unpaidWarningModal").style.display = "none";
  pendingActivateId = null;
});

// ── Deactivate Modal with 10s countdown ──
function openDeactivateModal(id, name) {
  pendingDeactivateId = id;
  document.getElementById("deactivateModalText").innerHTML =
    `Adakah anda pasti ingin nyahaktifkan status keanggotaan <strong>${name}</strong>?<br/>
     <em style="color:var(--text-muted);">Are you sure you would like to deactivate <strong>${name}</strong>'s membership status?</em>`;
  const btn = document.getElementById("confirmDeactivateBtn");
  btn.disabled = true;
  let count = 10;
  document.getElementById("deactivateCountdown").textContent = `(${count})`;
  document.getElementById("deactivateModal").style.display = "flex";
  if (deactivateTimer) clearInterval(deactivateTimer);
  deactivateTimer = setInterval(() => {
    count--;
    document.getElementById("deactivateCountdown").textContent = count > 0 ? `(${count})` : "";
    if (count <= 0) {
      clearInterval(deactivateTimer);
      btn.disabled = false;
    }
  }, 1000);
}

document.getElementById("cancelDeactivateBtn").addEventListener("click",  closeDeactivateModal);
document.getElementById("closeDeactivateModal").addEventListener("click", closeDeactivateModal);
function closeDeactivateModal() {
  document.getElementById("deactivateModal").style.display = "none";
  pendingDeactivateId = null;
  if (deactivateTimer) { clearInterval(deactivateTimer); deactivateTimer = null; }
  document.getElementById("confirmDeactivateBtn").disabled = true;
  document.getElementById("deactivateCountdown").textContent = "(10)";
}
document.getElementById("confirmDeactivateBtn").addEventListener("click", async () => {
  if (!pendingDeactivateId) return;
  try {
    await db.collection("registrations").doc(pendingDeactivateId).update({ approved: false });
  } catch(e) { alert("Ralat / Error: " + e.message); }
  closeDeactivateModal();
});

// ── Membership Card Modal ──
function openMembershipCardModal(id) {
  const reg = registrations.find(r => r.id === id);
  if (!reg) return;

  const cardEl = document.getElementById("adminMembershipCard");
  if (!cardEl) return;

  // Populate using shared helper from membership-card.js
  populateMembershipCard(cardEl, reg);

  // Wire download buttons
  const safeName = (reg.sectionA?.fullName || reg.name || "member").replace(/\s+/g,"-").toLowerCase();
  document.getElementById("adminBtnDLPNG").onclick = () => downloadCardPNG(cardEl, `kad-keanggotaan-${safeName}`);
  document.getElementById("adminBtnDLPDF").onclick = () => downloadCardPDF(cardEl, `kad-keanggotaan-${safeName}`);

  document.getElementById("membershipCardModal").style.display = "flex";
}

document.getElementById("closeMCModal")   ?.addEventListener("click", () => document.getElementById("membershipCardModal").style.display="none");
document.getElementById("closeMCModalBtn")?.addEventListener("click", () => document.getElementById("membershipCardModal").style.display="none");

// ── Membership Card button styles (inline for admin) ──
(function injectMCButtonStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .mc-dl-btn {
      display:inline-flex; align-items:center; gap:0.5rem;
      font-family:var(--font-display); font-size:0.78rem;
      letter-spacing:0.05em; font-weight:700;
      padding:0.5rem 1.2rem; border-radius:var(--radius);
      border:none; cursor:pointer; transition:all 0.2s ease;
    }
    .mc-dl-btn--pdf { background:linear-gradient(135deg,#CC3333,#E04444); color:#fff; }
    .mc-dl-btn--pdf:hover { transform:translateY(-2px); }
    .mc-dl-btn--png { background:linear-gradient(135deg,#1565C0,#1976D2); color:#fff; }
    .mc-dl-btn--png:hover { transform:translateY(-2px); }
  `;
  document.head.appendChild(style);
})();

// ── Edit button in view modal — goes straight to index.html in edit mode ──
document.getElementById("editModalBtn")?.addEventListener("click", () => {
  // currentActionId is set when action modal opened; fallback to finding from view modal
  const id = currentActionId;
  if (id) window.location.href = `index.html?from=admin&mode=edit&docId=${encodeURIComponent(id)}`;
});

// ══════════════════════════════════════════════
// MULTI-SELECT & BULK ACTIONS
// ══════════════════════════════════════════════
let isSelectMode = false;
let selectedIds  = new Set();

function enterSelectMode() {
  isSelectMode = true;
  selectedIds.clear();
  document.getElementById("bulkActionBar").style.display   = "flex";
  document.getElementById("btnToggleSelect").style.display = "none";
  document.getElementById("colCheckHeader").style.display  = "";
  document.querySelectorAll(".row-checkbox-cell").forEach(td => td.style.display = "");
  updateBulkCount();
}

function exitSelectMode() {
  isSelectMode = false;
  selectedIds.clear();
  document.getElementById("bulkActionBar").style.display   = "none";
  document.getElementById("btnToggleSelect").style.display = "";
  document.getElementById("colCheckHeader").style.display  = "none";
  document.querySelectorAll(".row-checkbox-cell").forEach(td => td.style.display = "none");
  document.querySelectorAll(".row-select-cb").forEach(cb => cb.checked = false);
  document.getElementById("selectAllCheckbox").checked = false;
  updateBulkCount();
}

function updateBulkCount() {
  document.getElementById("bulkSelectedCount").textContent =
    `${selectedIds.size} dipilih / selected`;
}

document.getElementById("btnToggleSelect").addEventListener("click", enterSelectMode);
document.getElementById("btnCancelSelect").addEventListener("click",  exitSelectMode);

document.getElementById("selectAllCheckbox").addEventListener("change", function() {
  document.querySelectorAll(".row-select-cb").forEach(cb => {
    cb.checked = this.checked;
    if (this.checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
  });
  updateBulkCount();
});

document.getElementById("btnSelectAll").addEventListener("click", () => {
  document.querySelectorAll(".row-select-cb").forEach(cb => {
    cb.checked = true; selectedIds.add(cb.dataset.id);
  });
  document.getElementById("selectAllCheckbox").checked = true;
  updateBulkCount();
});

document.getElementById("btnBulkActivate").addEventListener("click",   () => showBulkConfirm("activate"));
document.getElementById("btnBulkDeactivate").addEventListener("click", () => showBulkConfirm("deactivate"));
document.getElementById("btnBulkDelete").addEventListener("click",     () => showBulkConfirm("delete"));
document.getElementById("btnBulkNo").addEventListener("click", () => {
  document.getElementById("bulkConfirmModal").style.display = "none";
});

function showBulkConfirm(action) {
  if (selectedIds.size === 0) {
    alert("Sila pilih sekurang-kurangnya satu ahli / Please select at least one member.");
    return;
  }
  const n = selectedIds.size;
  const bm = { activate:"aktifkan", deactivate:"nyahaktifkan", delete:"padam" }[action];
  const en = { activate:"activate", deactivate:"deactivate",   delete:"delete" }[action];
  const titleMap = {
    activate:   "Aktifkan Keanggotaan / Activate Membership",
    deactivate: "Nyahaktifkan Keanggotaan / Deactivate Membership",
    delete:     "Padam Rekod / Delete Records",
  };
  document.getElementById("bulkConfirmTitle").textContent = titleMap[action];
  document.getElementById("bulkConfirmText").innerHTML =
    `Adakah anda pasti untuk <strong>${bm}</strong> kesemua
     <strong style="color:var(--marigold-bright)">${n}</strong> jemaat yang dipilih?<br/>
     <em style="color:var(--text-muted);font-size:0.88rem;">
       Are you sure to <strong>${en}</strong> all <strong>${n}</strong> selected members?
     </em>`;
  document.getElementById("bulkConfirmModal").style.display = "flex";
  document.getElementById("btnBulkYes").onclick = async () => {
    document.getElementById("bulkConfirmModal").style.display = "none";
    await executeBulkAction(action);
  };
}

async function executeBulkAction(action) {
  const ids = [...selectedIds];
  const now = firebase.firestore.Timestamp.fromDate(new Date());
  // Firestore batches support max 500 ops — chunk if needed
  const CHUNK = 450;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = db.batch();
    ids.slice(i, i + CHUNK).forEach(id => {
      const ref = db.collection("registrations").doc(id);
      if      (action === "activate")   batch.update(ref, { approved:true, approvedAt:now });
      else if (action === "deactivate") batch.update(ref, { approved:false });
      else if (action === "delete")     batch.delete(ref);
    });
    await batch.commit();
  }
  exitSelectMode();
}

async function cancelTransfer(id, name) {
  if (!confirm(`Batal pemindahan ${name}?\nCancel transfer for ${name}?`)) return;
  try {
    await db.collection("registrations").doc(id).update({
      transferred:    false,
      transferReason: firebase.firestore.FieldValue.delete(),
      transferDate:   firebase.firestore.FieldValue.delete(),
      transferTo:     firebase.firestore.FieldValue.delete(),
      transferAt:     firebase.firestore.FieldValue.delete(),
      approved:       false,
    });
  } catch(e) { alert("Ralat / Error: " + e.message); }
}

// ── VIEW MODAL — fixed label:value formatting ──
function vRow(label, value) {
  return `<div class="vf-row"><span class="vf-label">${label}:</span><span class="vf-value">${value||"—"}</span></div>`;
}

function buildViewHTML(reg) {
  const a = reg.sectionA || {};
  const servicesB = reg.sectionB?.services || {};
  const haveList = [], wantList = [];
  Object.entries(servicesB).forEach(([idx,val]) => {
    const n = SERVICE_NAMES[parseInt(idx)] || `Service ${idx}`;
    if (val.have) haveList.push(n);
    if (val.want) wantList.push(n);
  });
  const children = reg.sectionC?.children || [];
  const inferredIdType =
    a.idType || (a.citizenship === "nonCitizen"
      ? (/[A-Za-z]/.test(String(a.foreignID || "")) ? "Passport" : "MyTentera")
      : "IC");
  const uid = reg.uniqueID || generateAdminUniqueID(reg.name, inferredIdType, reg.icNo, a.yearJoining, a.foreignID);
  const e   = reg.sectionE || {};
  const photoSection = reg.photoURL
    ? `<div style="text-align:center;margin-bottom:1rem;"><img src="${reg.photoURL}" style="width:100px;height:125px;object-fit:cover;border-radius:8px;border:2px solid var(--marigold-dim);"/></div>`
    : "";

  const behalfSection = reg.behalfRegistration ? `
    <div class="vf-section-title" style="color:var(--marigold);">⚠️ Didaftar Oleh Orang Lain / Registered By Another Person</div>
    <div class="vf-grid">
      ${vRow("Didaftar Oleh / Registered By", `${reg.behalfRegistrantName||"—"} (${reg.behalfRegistrantIC||"—"})`)}
      ${vRow("Hubungan / Relationship", reg.behalfRelationship)}
      ${vRow("Sebab / Reason", reg.behalfReason === "oku" ? "Individu O.K.U / Disabled Individual" :
        reg.behalfReason === "elderly" ? "Warga Emas / Senior / Elderly" :
        reg.behalfReason === "others" ? `Lain-lain / Others: ${reg.behalfOtherReason||"—"}` : "—")}
    </div>` : "";

  const transferSection = reg.transferred ? `
    <div class="vf-section-title" style="color:#3B9EE8;">↗ Maklumat Pemindahan / Transfer Information</div>
    <div class="vf-grid">
      ${vRow("Tujuan Perpindahan / Reason For Transfer", reg.transferReason)}
      ${vRow("Tarikh Akan Berpindah / Date of Transfer",  reg.transferDate)}
      ${vRow("Pindah Ke Mana? / Transfer To Where?",      reg.transferTo)}
    </div>` : "";

  return `
    ${behalfSection}
    ${transferSection}
    ${photoSection}
    <div class="vf-section-title">A. Maklumat Peribadi / Personal Information</div>
    <div class="vf-grid">
      ${vRow("ID Unik / Unique ID", `<strong style="color:var(--marigold)">${uid}</strong>`)}
      ${vRow("Nama Penuh / Full Name", `<strong>${(a.fullName||"—")}</strong>`)}
      ${vRow("No. KP / IC No.", a.citizenship === "nonCitizen"
        ? "<em style='color:var(--text-muted);font-size:0.85rem;'>Tiada kaitan kerana anggota bukan warga Malaysia / Irrelevant since member is not Malaysian</em>"
        : (a.icNo || reg.icNo || "—"))}
      ${vRow("Jantina / Gender", genderMap[a.gender])}
      ${vRow("Tarikh Lahir / Date of Birth", formatDOB(a.dob))}
      ${vRow("Bangsa / Race", a.race)}
      ${vRow("Status Perkahwinan / Marital Status", maritalMap[a.maritalStatus])}
      ${a.partnerName     ? vRow("Nama Pasangan / Partner's Name", a.partnerName) : ""}
      ${a.latePartnerName ? vRow("Nama Pasangan Meninggal / Late Partner", a.latePartnerName) : ""}
      ${vRow("Status Pembaptisan / Baptism Status", baptismMap[a.baptismStatus])}
      ${a.baptismYear ? vRow("Tahun Pembaptisan / Year of Baptism", a.baptismYear) : ""}
      ${vRow("Warganegara / Citizenship", a.citizenship==="citizen" ? "Warganegara Malaysia / Malaysian" : "Bukan Warganegara / Non-Malaysian")}
      ${a.citizenship !== "citizen" ? vRow("Negara Asal / Country of Origin", a.countryOfOrigin) : ""}
      ${a.citizenship !== "citizen" ? vRow("Nombor ID / ID Number", a.foreignID || "—") : ""}
      ${vRow("Nombor Telefon / Telephone No.", a.phoneNumber)}
      ${vRow("Pekerjaan / Occupation", a.occupation || "Tiada Maklumat / No Information")}
      ${vRow("Gereja Asal / Original Church", a.originalChurch || "Tiada Maklumat / No Information")}
      ${vRow("Tahun Menyertai / Year Joined", a.yearJoining)}
      ${vRow("Kod Komsel / Cell Group Code", a.komselCode)}
      ${vRow("Alamat Terkini / Current Address", a.currentAddress)}
    </div>

    <div class="vf-section-title">B. Bidang Pelayanan / Field of Service</div>
    <div class="vf-grid">
      ${vRow("Pernah Terlibat / Have Been Involved",        haveList.length ? haveList.join(", ") : "—")}
      ${vRow("Ingin Terlibat / Would Like to Be Involved",  wantList.length ? wantList.join(", ") : "—")}
    </div>

    <div class="vf-section-title">C. Maklumat Kanak-kanak / Children Information
      ${reg.sectionC?.syncedFromPartner
        ? `<span style="font-size:0.72rem;font-family:var(--font-body);color:var(--marigold);
            background:rgba(255,140,0,0.1);border:1px solid rgba(255,140,0,0.25);
            border-radius:999px;padding:2px 8px;margin-left:8px;font-weight:400;letter-spacing:0.03em;">
            🔗 Disegerakkan dari pasangan / Synced from partner (${reg.sectionC?.syncedFromPartnerUID||"—"})
           </span>`
        : ""}
    </div>
    <div class="vf-grid">
      ${children.length
        ? children.map((c,i) => vRow(`Anak ${i+1} / Child ${i+1}`, `${c.name||"—"} (${genderMap[c.gender]||"—"}) — MyKid: ${c.myKid||"—"}`)).join("")
        : vRow("Kanak-kanak / Children", "Tiada Anak berumur 12 tahun ke bawah / No children aged 12 and below")
      }
    </div>

    <div class="vf-section-title">D. Ikrar Jemaat / Church Pledge</div>
    <div class="vf-grid">
      ${vRow("Ikrar / Pledge", reg.sectionD?.pledgeAgreed
        ? "✔ Saya bersetuju dengan ikrar-ikrar gereja / I agree with the church's pledge"
        : "✖ Tidak bersetuju / Not agreed")}
    </div>

    <div class="vf-section-title">E. Pengakuan Jemaat / Confession</div>
    <div class="vf-grid">
      ${vRow("Kod Komsel / Cell Group Code", e.komsel)}
      ${vRow("Sejak / Since",                e.since)}
      ${vRow("Pemimpin / Leader",            e.leader)}
      ${vRow("Nama / Name",                  e.name)}
      ${vRow("Tarikh / Date",                formatDate(e.date))}
    </div>`;
}

function openViewModal(id) {
  const reg = registrations.find(r => r.id === id);
  if (!reg) return;
  document.getElementById("viewModalBody").innerHTML = buildViewHTML(reg);

  // Wire Edit button — go straight to index.html in edit mode, no IC verify needed
  document.getElementById("editModalBtn").onclick = () => {
    window.location.href = `index.html?from=admin&mode=edit&docId=${encodeURIComponent(id)}`;
  };

  document.getElementById("viewModal").style.display = "flex";
}

document.getElementById("closeViewModal").addEventListener("click",    () => document.getElementById("viewModal").style.display = "none");
document.getElementById("closeViewModalBtn").addEventListener("click", () => document.getElementById("viewModal").style.display = "none");

// ── PRINT ──
function printRecord(id) {
  const reg = registrations.find(r => r.id === id);
  if (!reg) return;
  const a = reg.sectionA || {};
  const servicesB = reg.sectionB?.services || {};
  const haveList = [], wantList = [];
  Object.entries(servicesB).forEach(([idx,val]) => {
    const n = SERVICE_NAMES[parseInt(idx)] || `Service ${idx}`;
    if (val.have) haveList.push({ num:parseInt(idx), name:n });
    if (val.want) wantList.push({ num:parseInt(idx), name:n });
  });
  const allNums = [...new Set([...haveList.map(x=>x.num),...wantList.map(x=>x.num)])].sort((a,b)=>a-b);
  const serviceRows = allNums.length
    ? allNums.map((num,i) => {
        const h = haveList.find(x=>x.num===num) ? "✓" : "";
        const w = wantList.find(x=>x.num===num) ? "✓" : "";
        return `<tr><td>${i+1}</td><td>${SERVICE_NAMES[num]||"—"}</td><td style="text-align:center">${h}</td><td style="text-align:center">${w}</td></tr>`;
      }).join("")
    : "<tr><td colspan='4' style='text-align:center;font-style:italic'>—</td></tr>";
  const children = reg.sectionC?.children || [];
  const childrenPrint = children.length
    ? children.map((c,i) => `<p>${i+1}. ${c.name||"—"} (${genderMap[c.gender]||"—"}) — MyKid: ${c.myKid||"—"}</p>`).join("")
    : "<p>Tiada Anak berumur 12 tahun dan ke bawah / No Children aged 12 and below</p>";
  const e   = reg.sectionE || {};
  const inferredIdType =
    a.idType || (a.citizenship === "nonCitizen"
      ? (/[A-Za-z]/.test(String(a.foreignID || "")) ? "Passport" : "MyTentera")
      : "IC");
  const uid = reg.uniqueID || generateAdminUniqueID(reg.name, inferredIdType, reg.icNo, a.yearJoining, a.foreignID);
  const photoSection = reg.photoURL
    ? `<img src="${reg.photoURL}" style="float:right;width:90px;height:115px;object-fit:cover;border:1px solid #000;margin-left:12px;" alt="Photo"/>`
    : "";
  const pledgeItems = [
    "Saya menyokong penuh Visi, Misi, Nilai dan Struktur gereja ini memperluaskan kerajaan Syurga di Bumi.",
    "Saya siap untuk mendokong & terlibat dalam pelayanan yang dipercayakan.",
    "Saya siap untuk setia mendokong & terlibat dalam pelayanan gereja melalui Pemberian Persepuluhan & Sumbangan Kewangan.",
    "Saya komited untuk setia mendokong pelayanan gereja seperti Ibadah Raya, Komsel & Doa Korporat / Syafaat.",
    "Saya akan selalu menjaga kesaksian hidup saya baik didalam mahupun diluar gereja.",
    "Saya akan selalu menjaga hubungan baik diantara anggota gereja.",
    "Saya akan taat berdoa bagi pertumbuhan & perkembangan gereja.",
    "Saya siap untuk dibimbing, dinasihati & ditegur bila keadaan memerlukan demi kebaikan saya."
  ];

  const behalfPrint = reg.behalfRegistration ? `
  <h3 style="color:#b35a00;">⚠️ Didaftar Oleh Orang Lain / Registered By Another Person</h3>
  <div class="row"><span class="lbl">Didaftar Oleh / Registered By:</span><span>${reg.behalfRegistrantName||"—"} (${reg.behalfRegistrantIC||"—"})</span></div>
  <div class="row"><span class="lbl">Hubungan / Relationship:</span><span>${reg.behalfRelationship||"—"}</span></div>
  <div class="row"><span class="lbl">Sebab / Reason:</span><span>${
    reg.behalfReason === "oku"     ? "Individu O.K.U / Disabled Individual" :
    reg.behalfReason === "elderly" ? "Warga Emas / Senior / Elderly" :
    reg.behalfReason === "others"  ? `Lain-lain / Others: ${reg.behalfOtherReason||"—"}` : "—"
  }</span></div>` : "";

  const transferPrint = reg.transferred ? `
  <h3 style="color:#1a6ea8;">↗ Maklumat Pemindahan / Transfer Information</h3>
  <div class="row"><span class="lbl">Tujuan Perpindahan / Reason For Transfer:</span><span>${reg.transferReason||"—"}</span></div>
  <div class="row"><span class="lbl">Tarikh Akan Berpindah / Date of Transfer:</span><span>${reg.transferDate||"—"}</span></div>
  <div class="row"><span class="lbl">Pindah Ke Mana? / Transfer To Where?:</span><span>${reg.transferTo||"—"}</span></div>` : "";

  const printHTML = `<html><head><title>BEM On The Rock — ${(a.fullName||"Pendaftar").toUpperCase()}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:2cm}
    h1{text-align:center;font-size:14pt;margin-bottom:2px}
    h2{text-align:center;font-size:11pt;font-weight:normal;margin-bottom:4px}
    h2.uid{text-align:center;font-size:10pt;color:#666;margin-bottom:16px}
    h3{font-size:11pt;border-bottom:1px solid #000;padding-bottom:3px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.05em;clear:both}
    p{margin:3px 0;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{border:1px solid #000;padding:5px 8px;font-size:10pt;text-align:left}
    th{background:#f0f0f0;font-weight:bold}
    .row{display:flex;gap:20px;margin-bottom:5px}
    .lbl{font-weight:bold;min-width:200px}
    ol{margin:4px 0;padding-left:20px}
    ol li{margin-bottom:6px}
    .blank{display:inline-block;border-bottom:1px solid #000;min-width:120px}
    .sig-line{margin-top:40px;display:flex;gap:60px}
    .sig-block{flex:1}
    .sig-block p{border-top:1px solid #000;margin-top:30px;font-size:9pt}
    .office-box{border:1px solid #000;padding:12px;margin-top:8px}
    @media print{body{margin:1.5cm}}
  </style></head><body>
  <h1>BEM On The Rock</h1>
  <h2>Borang Pendaftaran Keanggotaan Gereja / Church Membership Registration Form</h2>
  <h2 class="uid">ID Unik / Unique ID: ${uid}</h2>
  ${behalfPrint}
  ${transferPrint}
  <h3>A. Maklumat Peribadi / Personal Information</h3>
  ${photoSection}
  <div class="row"><span class="lbl">Nama Penuh / Full Name:</span><span style="font-weight:bold;text-transform:uppercase">${a.fullName||"—"}</span></div>
  <div class="row"><span class="lbl">No. KP / IC No.:</span><span>${reg.sectionA?.citizenship === "nonCitizen" ? (reg.sectionA?.foreignID || "—") : (reg.icNo||"—")}</span></div>
  <div class="row"><span class="lbl">Jantina / Gender:</span><span>${genderMap[a.gender]||"—"}</span></div>
  <div class="row"><span class="lbl">Tarikh Lahir / Date of Birth:</span><span>${formatDOB(a.dob)||"—"}</span></div>
  <div class="row"><span class="lbl">Bangsa / Race:</span><span>${a.race||"—"}</span></div>
  <div class="row"><span class="lbl">Status Perkahwinan / Marital Status:</span><span>${maritalMap[a.maritalStatus]||"—"}${a.partnerName?" — "+a.partnerName:""}${a.latePartnerName?" — "+a.latePartnerName:""}</span></div>
  <div class="row"><span class="lbl">Status Pembaptisan / Baptism:</span><span>${baptismMap[a.baptismStatus]||"—"}${a.baptismYear?" ("+a.baptismYear+")":""}</span></div>
  <div class="row"><span class="lbl">Warganegara / Citizenship:</span><span>${a.citizenship==="citizen"?"Warganegara Malaysia / Malaysian":"Bukan Warganegara / Non-Malaysian"}</span></div>
  ${a.citizenship !== "citizen" ? `<div class="row"><span class="lbl">Negara Asal / Country of Origin:</span><span>${a.countryOfOrigin||"—"}</span></div>` : ""}
  ${a.citizenship !== "citizen" ? `<div class="row"><span class="lbl">Nombor ID / ID Number:</span><span>${a.foreignID||"—"}</span></div>` : ""}
  <div class="row"><span class="lbl">Nombor Telefon / Phone:</span><span>${a.phoneNumber||"—"}</span></div>
  <div class="row"><span class="lbl">Pekerjaan / Occupation:</span><span>${a.occupation||"Tiada Maklumat / No Information"}</span></div>
  <div class="row"><span class="lbl">Gereja Asal / Original Church:</span><span>${a.originalChurch||"Tiada Maklumat / No Information"}</span></div>
  <div class="row"><span class="lbl">Tahun Menyertai / Year Joined:</span><span>${a.yearJoining||"—"}</span></div>
  <div class="row"><span class="lbl">Kod Komsel / Cell Group Code:</span><span>${a.komselCode||"—"}</span></div>
  <div class="row"><span class="lbl">Alamat Terkini / Current Address:</span><span>${a.currentAddress||"—"}</span></div>
  <h3>B. Bidang Pelayanan / Field of Service</h3>
  <table><thead><tr><th>Bil.</th><th>Pelayanan / Service</th><th>Pernah Terlibat / Have Been Involved</th><th>Ingin Terlibat / Would Like to Be Involved</th></tr></thead>
  <tbody>${serviceRows}</tbody></table>
  <h3>C. Maklumat Kanak-kanak / Children Information</h3>
  ${childrenPrint}
  <h3>D. Ikrar Jemaat / Church Pledge</h3>
  <ol>${pledgeItems.map(p=>`<li>${p}</li>`).join("")}</ol>
  <p><strong>✔ Saya bersetuju dengan ikrar-ikrar gereja / I agree with the church's pledge: ${reg.sectionD?.pledgeAgreed?"Ya / Yes":"Tidak / No"}</strong></p>
  <h3>E. Pengakuan Jemaat / Confession</h3>
  <p>Saya mengaku bahawa saya telah menghadiri KOMSEL <strong>${e.komsel||"___"}</strong> sejak <strong>${e.since||"___"}</strong> dibawah pimpinan saudara/i <strong>${e.leader||"___"}</strong>.</p>
  <p>Saya, <strong>${e.name||"___"}</strong> akui bahawa maklumat di atas adalah benar.</p>
  <p>Tarikh / Date: <strong>${formatDate(e.date)}</strong></p>
  <h3>F. Pengakuan Pemimpin Komsel / Komsel Leader Confession</h3>
  <p>Saya, <span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> dengan nombor kad pengenalan <span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>, pemimpin bagi Kod Komsel <span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> dengan ini mengesahkan bahawa saudara/i <span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> telah menghadiri komsel sejak <span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>.</p>
  <p>Beliau telah menunjukkan komitmen dengan mematuhi peraturan dan ikrar di atas.</p>
  <div class="sig-line"><div class="sig-block"><p>Tarikh / Date</p></div><div class="sig-block"><p>Tandatangan / Signature</p></div></div>
  <h3>G. Untuk Kegunaan Pejabat / For Office Use</h3>
  <div class="office-box">
    <p>Borang diterima pada / Form received on: <span class="blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></p>
    <p>Jenis Keanggotaan / Membership Type: &nbsp;&nbsp; ☐ Tetap / Fixed &nbsp;&nbsp;&nbsp;&nbsp; ☐ Bersekutu / Associate</p>
  </div>
  </body></html>`;

  const win = window.open("","_blank");
  win.document.write(printHTML);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ── DELETE ──
document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  try { await db.collection("registrations").doc(pendingDeleteId).delete(); }
  catch(e) { alert("Ralat memadam / Delete error: " + e.message); }
  pendingDeleteId = null;
  document.getElementById("deleteModal").style.display = "none";
});
document.getElementById("cancelDeleteBtn").addEventListener("click",  () => { pendingDeleteId = null; document.getElementById("deleteModal").style.display = "none"; });
document.getElementById("closeDeleteModal").addEventListener("click", () => { pendingDeleteId = null; document.getElementById("deleteModal").style.display = "none"; });