"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — stats.js  (full rewrite)
═══════════════════════════════════════════════ */

document.getElementById("statsFooterYear").textContent = new Date().getFullYear();

// ── Colour palette ──
const MARIGOLD  = "#FF8C00";
const AGE_COLS  = ["#e74c3c","#3498db","#2ecc71","#9b59b6","#f39c12"];
const MARITAL_COLS_MALE   = "#3498db";
const MARITAL_COLS_FEMALE = "#e84393";

let allData  = [];
let allCharts = {};

// ── Chart text colour (re-read every render) ──
function chartText() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "#1A1208" : "#F5F5F0";
}

function chartGridColor() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)";
}

// ── Auth guard ──
auth.onAuthStateChanged(user => {
  if (!user) { window.location.href = "admin.html"; return; }
  loadStats();
});

async function loadStats() {
  document.getElementById("statsLoading").style.display = "block";
  try {
    const snap = await db.collection("registrations").get();
    allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSummary();
    renderGender();
    renderTime("month");
    renderRaceTable();
    renderAge();
    renderMarital();
    renderKomselTable();
    renderChildrenChart();
    renderCityTable();
  } catch(e) {
    console.error("Stats error:", e);
  }
  document.getElementById("statsLoading").style.display = "none";
}

// ══════════════════════════════════════════════
// SUMMARY CARDS
// ══════════════════════════════════════════════
function renderSummary() {
  const total      = allData.length;
  const active     = allData.filter(r => r.approved && !r.transferred && !r.deceased).length;
  const inactive   = allData.filter(r => !r.approved && !r.transferred && !r.deceased).length;
  const transferred= allData.filter(r => r.transferred).length;
  const baptised   = allData.filter(r => r.sectionA?.baptismStatus === "baptised").length;

  // ── Unique children count using couple deduplication ──
  const coupleGroups       = buildCoupleGroups(allData);
  const uniqueChildrenCount = coupleGroups.reduce((sum, g) => sum + g.total, 0);

  document.getElementById("totalMembers").textContent     = total;
  document.getElementById("activeMembers").textContent    = active;
  document.getElementById("inactiveMembers").textContent  = inactive;
  document.getElementById("transferredMembers").textContent = transferred;
  document.getElementById("baptisedMembers").textContent  = `${baptised} / ${total}`;
  document.getElementById("withChildren").textContent     = uniqueChildrenCount;
}

// ── Count only filled children (name + gender both required) ──
function countValidChildren(reg) {
  return (reg.sectionC?.children || []).filter(c => c.name?.trim() && c.gender).length;
}

// ══════════════════════════════════════════════
// GENDER — Doughnut (no Unknown legend)
// ══════════════════════════════════════════════
function renderGender() {
  const counts = { male:0, female:0 };
  allData.forEach(r => {
    const g = r.sectionA?.gender;
    if (g === "male") counts.male++;
    else if (g === "female") counts.female++;
    // Unknown silently omitted from chart
  });

  destroyChart("chartGender");
  const ctx = document.getElementById("chartGender")?.getContext("2d");
  if (!ctx) return;
  allCharts["chartGender"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Lelaki / Male", "Perempuan / Female"],
      datasets: [{ data: [counts.male, counts.female],
        backgroundColor: ["#3498db","#e84393"], borderWidth: 2, borderColor: "rgba(0,0,0,0.3)" }]
    },
    options: { ...pieOpts(), cutout: "55%" }
  });
}

// ══════════════════════════════════════════════
// REGISTRATIONS OVER TIME — Line chart
// ══════════════════════════════════════════════
function renderTime(mode) {
  const now = new Date();
  let labels = [], dataCounts = [];

  if (mode === "day") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    labels = Array.from({length: daysInMonth}, (_,i) => `${i+1}`);
    dataCounts = new Array(daysInMonth).fill(0);
    allData.forEach(r => {
      const d = getDate(r);
      if (d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        dataCounts[d.getDate()-1]++;
      }
    });
  } else if (mode === "month") {
    labels = ["Jan","Feb","Mac","Apr","Mei","Jun","Jul","Ogs","Sep","Okt","Nov","Dis"];
    dataCounts = new Array(12).fill(0);
    allData.forEach(r => {
      const d = getDate(r);
      if (d && d.getFullYear() === now.getFullYear()) dataCounts[d.getMonth()]++;
    });
  } else { // year
    const startYear = now.getFullYear() - 10;
    labels = Array.from({length:11}, (_,i) => String(startYear+i));
    dataCounts = new Array(11).fill(0);
    allData.forEach(r => {
      const d = getDate(r);
      if (d) { const idx = d.getFullYear() - startYear; if (idx>=0&&idx<=10) dataCounts[idx]++; }
    });
  }

  destroyChart("chartTime");
  const ctx = document.getElementById("chartTime")?.getContext("2d");
  if (!ctx) return;
  allCharts["chartTime"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Pendaftaran / Registrations",
        data: dataCounts,
        borderColor: MARIGOLD,
        backgroundColor: "rgba(255,140,0,0.15)",
        tension: 0.4, fill: true,
        pointBackgroundColor: MARIGOLD, pointRadius: 5
      }]
    },
    options: {
      ...barOpts(),
      scales: {
        x: { ticks: { color: chartText() }, grid: { color: chartGridColor() } },
        y: {
          ticks: { color: chartText(), stepSize: 1,
            callback: v => Number.isInteger(v) ? v : null
          },
          grid: { color: chartGridColor() },
          beginAtZero: true
        }
      }
    }
  });
}

function getDate(reg) {
  if (reg.submittedAt?.toDate) return reg.submittedAt.toDate();
  if (reg.dateApplied) return new Date(reg.dateApplied);
  return null;
}

// ── Time filter buttons ──
document.querySelectorAll(".time-filter-btn").forEach(btn => {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".time-filter-btn").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    renderTime(this.dataset.mode);
  });
});

// ── Normalise race string — extract first race before any separator ──
function normaliseRace(raw) {
  if (!raw || !raw.trim()) return "TIDAK DIKETAHUI / UNKNOWN";
  // Split on common mix-race separators/keywords
  let r = raw.toUpperCase().trim();
  r = r.split(/\s*[,\/&]\s*|\s+(?:MIX|AND|DAN|ATAU)\s+/)[0].trim();
  if (!r) return "TIDAK DIKETAHUI / UNKNOWN";
  return r;
}

function displayRace(raw) {
  if (!raw || !raw.trim()) return "TIDAK DIKETAHUI / UNKNOWN";
  let r = raw.toUpperCase().trim();
  r = r.split(/\s*[,\/&]\s*|\s+(?:MIX|AND|DAN|ATAU)\s+/)[0].trim();
  return r || "TIDAK DIKETAHUI / UNKNOWN";
}

// ══════════════════════════════════════════════
// RACE — Table with list modal
// ══════════════════════════════════════════════
function renderRaceTable() {
  const map = {}; // normalised race → members[]
  allData.forEach(r => {
    const raw  = r.sectionA?.race || "";
    const key  = normaliseRace(raw);
    if (!map[key]) map[key] = { members: [] };
    map[key].members.push({ name:(r.name||r.sectionA?.fullName||"—"), uid:r.uniqueID||"—" });
  });

  const sorted = Object.entries(map).sort((a,b) => b[1].members.length - a[1].members.length);
  const tbody  = document.getElementById("raceTableBody");
  if (!tbody) return;

  tbody.innerHTML = sorted.map(([key, {members}]) => `
    <tr>
      <td style="font-weight:700;">${key}</td>
      <td style="text-align:center;font-weight:700;color:var(--marigold-bright)">${members.length}</td>
      <td style="text-align:center">
        <button class="stats-view-btn" data-race="${encodeURIComponent(key)}">👁 Lihat / View</button>
      </td>
    </tr>`).join("");

  // Build lookup by key for modal
  const lookup = {};
  sorted.forEach(([key, val]) => { lookup[key] = val; });

  tbody.querySelectorAll(".stats-view-btn[data-race]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key   = decodeURIComponent(btn.dataset.race);
      const entry = lookup[key];
      if (!entry) return;
      openListModal(`Ahli Bangsa: ${key}`, buildMemberListTable(entry.members));
    });
  });
}

// ══════════════════════════════════════════════
// MERGE RACE — Modal with full manual control
// ══════════════════════════════════════════════
let mergeRaceSelected = new Set();

function openMergeRaceModal() {
  mergeRaceSelected.clear();
  document.getElementById("mergeRaceOutput").value = "";
  document.getElementById("mergeRaceStatus").textContent = "";
  document.getElementById("mergeRaceSearch").value = "";
  renderMergeRaceList("");
  document.getElementById("mergeRaceModal").style.display = "flex";
}

function getAllUniqueRaces() {
  const races = new Set();
  allData.forEach(r => {
    const norm = normaliseRace(r.sectionA?.race || "");
    races.add(norm);
  });
  return Array.from(races).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function renderMergeRaceList(filter) {
  const all    = getAllUniqueRaces();
  const f      = filter.toUpperCase().trim();
  const shown  = f ? all.filter(r => r.includes(f)) : all;
  const list   = document.getElementById("mergeRaceList");
  const countEl = document.getElementById("mergeRaceSelCount");

  list.innerHTML = shown.map(race => {
    const count   = allData.filter(r => normaliseRace(r.sectionA?.race || "") === race).length;
    const checked = mergeRaceSelected.has(race);
    return `
      <label class="merge-race-item ${checked ? "merge-race-item--selected" : ""}"
        style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.75rem;
          border-radius:var(--radius);cursor:pointer;margin-bottom:0.3rem;
          background:${checked ? "rgba(255,140,0,0.12)" : "rgba(255,255,255,0.02)"};
          border:1px solid ${checked ? "var(--marigold)" : "var(--border-card)"};
          transition:all 0.15s ease;">
        <input type="checkbox" class="merge-race-chk" data-race="${encodeURIComponent(race)}"
          ${checked ? "checked" : ""} style="accent-color:var(--marigold);width:16px;height:16px;flex-shrink:0;"/>
        <span style="flex:1;font-weight:600;font-size:0.9rem;">${race}</span>
        <span style="font-size:0.8rem;color:var(--text-muted);">${count} ahli</span>
      </label>`;
  }).join("") || `<p style="color:var(--text-muted);font-style:italic;text-align:center;padding:1rem;">
    Tiada bangsa dijumpai / No races found</p>`;

  list.querySelectorAll(".merge-race-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      const race = decodeURIComponent(chk.dataset.race);
      if (chk.checked) mergeRaceSelected.add(race);
      else mergeRaceSelected.delete(race);
      renderMergeRaceList(document.getElementById("mergeRaceSearch").value);
      countEl.textContent = `${mergeRaceSelected.size} dipilih / selected`;
      // Auto-fill output if only one selected
      const outEl = document.getElementById("mergeRaceOutput");
      if (mergeRaceSelected.size === 1 && !outEl.value.trim()) {
        outEl.value = Array.from(mergeRaceSelected)[0];
      }
    });
  });

  countEl.textContent = `${mergeRaceSelected.size} dipilih / selected`;
}

document.getElementById("btnMergeRace")?.addEventListener("click", openMergeRaceModal);
document.getElementById("closeMergeModal")?.addEventListener("click", () => {
  document.getElementById("mergeRaceModal").style.display = "none";
});
document.getElementById("mergeRaceSearch")?.addEventListener("input", function() {
  renderMergeRaceList(this.value);
});
document.getElementById("btnMergeClearSel")?.addEventListener("click", () => {
  mergeRaceSelected.clear();
  renderMergeRaceList(document.getElementById("mergeRaceSearch").value);
});

document.getElementById("btnMergeConfirm")?.addEventListener("click", async () => {
  const output  = document.getElementById("mergeRaceOutput").value.trim().toUpperCase();
  const statusEl = document.getElementById("mergeRaceStatus");

  if (mergeRaceSelected.size < 2) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila pilih sekurang-kurangnya 2 bangsa. / Please select at least 2 races.";
    return;
  }
  if (!output) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila masukkan nama output. / Please enter an output name.";
    return;
  }

  const btn = document.getElementById("btnMergeConfirm");
  btn.disabled = true;
  btn.textContent = "⏳ Mengemaskini...";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "Mengemaskini rekod... / Updating records...";

  try {
    // Find all members whose normalised race is in the selected set
    const batch = db.batch();
    let count = 0;
    allData.forEach(reg => {
      const norm = normaliseRace(reg.sectionA?.race || "");
      if (mergeRaceSelected.has(norm)) {
        const ref = db.collection("registrations").doc(reg.id);
        batch.update(ref, { "sectionA.race": output });
        count++;
      }
    });

    await batch.commit();

    // Update allData in memory
    allData.forEach(reg => {
      const norm = normaliseRace(reg.sectionA?.race || "");
      if (mergeRaceSelected.has(norm)) {
        if (reg.sectionA) reg.sectionA.race = output;
      }
    });

    // Refresh race table
    renderRaceTable();

    statusEl.style.color = "#4CAF7D";
    statusEl.textContent = `✅ Berjaya dikemaskini ${count} rekod. / Successfully updated ${count} records.`;
    mergeRaceSelected.clear();
    document.getElementById("mergeRaceOutput").value = "";
    renderMergeRaceList(document.getElementById("mergeRaceSearch").value);

  } catch(e) {
    console.error(e);
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Ralat semasa mengemaskini. / Error while updating.";
  }

  btn.disabled = false;
  btn.textContent = "✅ Gabung / Merge";
});

// ══════════════════════════════════════════════
// AGE GROUP — Doughnut
// ══════════════════════════════════════════════
function getAgeGroup(dob) {
  if (!dob) return "Tidak Diketahui / Unknown";
  const birth = new Date(dob);
  if (isNaN(birth)) return "Tidak Diketahui / Unknown";
  const age = Math.floor((new Date()-birth)/(365.25*24*3600*1000));
  if (age<=17) return "Remaja / Teen (13–17)";
  if (age<=29) return "Dewasa Muda / Young Adult (18–29)";
  if (age<=59) return "Dewasa / Adult (30–59)";
  return "Warga Emas / Senior (60+)";
}

function renderAge() {
  const ORDER = [
    "Remaja / Teen (13–17)",
    "Dewasa Muda / Young Adult (18–29)",
    "Dewasa / Adult (30–59)",
    "Warga Emas / Senior (60+)",
    "Tidak Diketahui / Unknown"
  ];
  const COLS = ["#36A2EB","#FFCE56","#4BC0C0","#9966FF","#aaaaaa"];
  const counts = {};
  ORDER.forEach(k => counts[k]=0);
  allData.forEach(r => {
    const g = getAgeGroup(r.sectionA?.dob);
    counts[g] = (counts[g]||0)+1;
  });

  destroyChart("chartAge");
  const ctx = document.getElementById("chartAge")?.getContext("2d");
  if (!ctx) return;
  allCharts["chartAge"] = new Chart(ctx, {
    type: "doughnut",
    data: { labels: ORDER, datasets: [{ data: ORDER.map(k=>counts[k]), backgroundColor: COLS, borderWidth:2, borderColor:"rgba(0,0,0,0.3)" }] },
    options: {
      cutout: "50%",
      plugins: {
        legend: {
          display: true, position: "right",
          labels: { color: chartText(), font:{ family:"Crimson Pro, serif", size:13 }, padding:14, filter:()=>true }
        }
      }
    }
  });
}

// ══════════════════════════════════════════════
// MARITAL STATUS — Dual grouped bar (male/female)
// ══════════════════════════════════════════════
function renderMarital() {
  const CATS = ["single","engaged","married","divorced","widowed"];
  const LABELS = ["Bujang / Single","Bertunang / Engaged","Berkahwin / Married","Bercerai / Divorced","Balu/Duda / Widowed"];
  const male = new Array(5).fill(0), female = new Array(5).fill(0);

  allData.forEach(r => {
    const ms = r.sectionA?.maritalStatus;
    const g  = r.sectionA?.gender;
    const idx = CATS.indexOf(ms);
    if (idx<0) return;
    if (g==="male") male[idx]++;
    else if (g==="female") female[idx]++;
  });

  destroyChart("chartMarital");
  const ctx = document.getElementById("chartMarital")?.getContext("2d");
  if (!ctx) return;
  allCharts["chartMarital"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: LABELS,
      datasets: [
        { label:"Lelaki / Male",    data:male,   backgroundColor:MARITAL_COLS_MALE,   borderRadius:4 },
        { label:"Perempuan / Female",data:female, backgroundColor:MARITAL_COLS_FEMALE, borderRadius:4 }
      ]
    },
    options: {
      ...barOpts(),
      plugins: { ...barOpts().plugins, legend:{ labels:{ color:chartText() } } },
      scales: {
        x: { ticks:{ color:chartText() }, grid:{ color:chartGridColor() } },
        y: {
          ticks:{ color:chartText(), stepSize:1, callback: v=>Number.isInteger(v)?v:null },
          grid:{ color:chartGridColor() }, beginAtZero:true
        }
      }
    }
  });
}

// ══════════════════════════════════════════════
// SHARED: member list table builder
// ══════════════════════════════════════════════
function buildMemberListTable(members) {
  return `<table class="stats-modal-table">
    <thead><tr><th>Nama / Name</th><th>ID Unik / Unique ID</th></tr></thead>
    <tbody>${members.map(m=>`
      <tr>
        <td>${(m.name||"—").toUpperCase()}</td>
        <td style="color:var(--marigold);font-family:var(--font-display);font-size:0.85rem">${m.uid||"—"}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

// ── Normalise komsel code for stats grouping (mirrors main.js logic) ──
function normaliseKomselCode(val) {
  if (!val) return "—";
  const clean = val.toUpperCase().replace(/[\s\-]/g, "");
  const match = clean.match(/^([A-Z]+)(\d+)$/);
  if (!match) return clean;
  let prefix = match[1];
  if (!prefix.startsWith("Z")) prefix = "Z" + prefix;
  return prefix + parseInt(match[2], 10);
}

// ══════════════════════════════════════════════
// KOMSEL TABLE — 3 columns with modal
// ══════════════════════════════════════════════
function renderKomselTable() {
  const map = {};
  allData.forEach(r => {
    const raw  = (r.sectionA?.komselCode || "").trim();
    const code = raw ? normaliseKomselCode(raw) : "—";
    if (!map[code]) map[code] = [];
    map[code].push({ name:(r.name||r.sectionA?.fullName||"—"), uid:r.uniqueID||"—" });
  });

  const sorted = Object.entries(map).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" })
  );
  const tbody  = document.getElementById("komselTableBody");
  if (!tbody) return;

  tbody.innerHTML = sorted.map(([code,members]) => `
    <tr>
      <td style="font-weight:700;color:var(--marigold-bright)">${code}</td>
      <td style="text-align:center">${members.length}</td>
      <td style="text-align:center">
        <button class="stats-view-btn" data-code="${encodeURIComponent(code)}">👁 Lihat / View</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll(".stats-view-btn[data-code]").forEach(btn => {
    btn.addEventListener("click", () => {
      const code    = decodeURIComponent(btn.dataset.code);
      const members = map[code];
      openListModal(`Ahli Komsel ${code} / Cell Group ${code} Members`, buildMemberListTable(members));
    });
  });
}

// ══════════════════════════════════════════════
// MERGE KOMSEL
// ══════════════════════════════════════════════
let mergeKomselSelected = new Set();

function getAllUniqueKomsel() {
  const codes = new Set();
  allData.forEach(r => {
    const raw  = (r.sectionA?.komselCode || "").trim();
    codes.add(raw ? normaliseKomselCode(raw) : "—");
  });
  return Array.from(codes).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function renderMergeKomselList(filter) {
  const all     = getAllUniqueKomsel();
  const f       = filter.toUpperCase().trim();
  const shown   = f ? all.filter(c => c.includes(f)) : all;
  const list    = document.getElementById("mergeKomselList");
  const countEl = document.getElementById("mergeKomselSelCount");

  list.innerHTML = shown.map(code => {
    const count   = allData.filter(r => {
      const raw = (r.sectionA?.komselCode || "").trim();
      return (raw ? normaliseKomselCode(raw) : "—") === code;
    }).length;
    const checked = mergeKomselSelected.has(code);
    return `
      <label style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.75rem;
        border-radius:var(--radius);cursor:pointer;margin-bottom:0.3rem;
        background:${checked ? "rgba(255,140,0,0.12)" : "rgba(255,255,255,0.02)"};
        border:1px solid ${checked ? "var(--marigold)" : "var(--border-card)"};
        transition:all 0.15s ease;">
        <input type="checkbox" class="merge-komsel-chk" data-code="${encodeURIComponent(code)}"
          ${checked ? "checked" : ""} style="accent-color:var(--marigold);width:16px;height:16px;flex-shrink:0;"/>
        <span style="flex:1;font-weight:600;font-size:0.9rem;">${code}</span>
        <span style="font-size:0.8rem;color:var(--text-muted);">${count} ahli</span>
      </label>`;
  }).join("") || `<p style="color:var(--text-muted);font-style:italic;text-align:center;padding:1rem;">Tiada KOMSEL dijumpai.</p>`;

  list.querySelectorAll(".merge-komsel-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      const code = decodeURIComponent(chk.dataset.code);
      if (chk.checked) mergeKomselSelected.add(code);
      else mergeKomselSelected.delete(code);
      renderMergeKomselList(document.getElementById("mergeKomselSearch").value);
      countEl.textContent = `${mergeKomselSelected.size} dipilih / selected`;
      const outEl = document.getElementById("mergeKomselOutput");
      if (mergeKomselSelected.size === 1 && !outEl.value.trim()) {
        outEl.value = Array.from(mergeKomselSelected)[0];
      }
    });
  });
  countEl.textContent = `${mergeKomselSelected.size} dipilih / selected`;
}

document.getElementById("btnMergeKomsel")?.addEventListener("click", () => {
  mergeKomselSelected.clear();
  document.getElementById("mergeKomselOutput").value = "";
  document.getElementById("mergeKomselStatus").textContent = "";
  document.getElementById("mergeKomselSearch").value = "";
  renderMergeKomselList("");
  document.getElementById("mergeKomselModal").style.display = "flex";
});
document.getElementById("closeMergeKomselModal")?.addEventListener("click", () => {
  document.getElementById("mergeKomselModal").style.display = "none";
});
document.getElementById("mergeKomselSearch")?.addEventListener("input", function() {
  renderMergeKomselList(this.value);
});
document.getElementById("btnMergeKomselClear")?.addEventListener("click", () => {
  mergeKomselSelected.clear();
  renderMergeKomselList(document.getElementById("mergeKomselSearch").value);
});

document.getElementById("btnMergeKomselConfirm")?.addEventListener("click", async () => {
  const output   = document.getElementById("mergeKomselOutput").value.trim().toUpperCase();
  const statusEl = document.getElementById("mergeKomselStatus");

  if (mergeKomselSelected.size < 2) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila pilih sekurang-kurangnya 2 KOMSEL. / Please select at least 2 cell groups.";
    return;
  }
  if (!output) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila masukkan nama output. / Please enter an output name.";
    return;
  }

  const btn = document.getElementById("btnMergeKomselConfirm");
  btn.disabled = true;
  btn.textContent = "⏳ Mengemaskini...";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "Mengemaskini rekod... / Updating records...";

  try {
    const batch = db.batch();
    let count = 0;
    allData.forEach(reg => {
      const raw  = (reg.sectionA?.komselCode || "").trim();
      const code = raw ? normaliseKomselCode(raw) : "—";
      if (mergeKomselSelected.has(code)) {
        batch.update(db.collection("registrations").doc(reg.id), { "sectionA.komselCode": output });
        count++;
      }
    });
    await batch.commit();

    allData.forEach(reg => {
      const raw  = (reg.sectionA?.komselCode || "").trim();
      const code = raw ? normaliseKomselCode(raw) : "—";
      if (mergeKomselSelected.has(code) && reg.sectionA) reg.sectionA.komselCode = output;
    });

    renderKomselTable();
    statusEl.style.color = "#4CAF7D";
    statusEl.textContent = `✅ Berjaya dikemaskini ${count} rekod. / Successfully updated ${count} records.`;
    mergeKomselSelected.clear();
    document.getElementById("mergeKomselOutput").value = "";
    renderMergeKomselList(document.getElementById("mergeKomselSearch").value);
  } catch(e) {
    console.error(e);
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Ralat semasa mengemaskini. / Error while updating.";
  }

  btn.disabled = false;
  btn.textContent = "✅ Gabung / Merge";
});

// ══════════════════════════════════════════════
// UNMERGE / SPLIT KOMSEL
// ══════════════════════════════════════════════
let unmergeSelectedKomsel   = null;
let unmergeSelectedMembers  = new Set();

function renderUnmergeKomselPickList(filter) {
  const all   = getAllUniqueKomsel();
  const f     = filter.toUpperCase().trim();
  const shown = f ? all.filter(c => c.includes(f)) : all;
  const list  = document.getElementById("unmergeKomselPickList");

  list.innerHTML = shown.map(code => {
    const count = allData.filter(r => {
      const raw = (r.sectionA?.komselCode || "").trim();
      return (raw ? normaliseKomselCode(raw) : "—") === code;
    }).length;
    return `
      <div class="unmerge-komsel-pick" data-code="${encodeURIComponent(code)}"
        style="display:flex;align-items:center;justify-content:space-between;
          padding:0.6rem 0.9rem;border-radius:var(--radius);cursor:pointer;
          margin-bottom:0.3rem;border:1px solid var(--border-card);
          background:rgba(255,255,255,0.02);transition:all 0.15s ease;">
        <span style="font-weight:600;">${code}</span>
        <span style="font-size:0.8rem;color:var(--text-muted);">${count} ahli → </span>
      </div>`;
  }).join("") || `<p style="color:var(--text-muted);font-style:italic;text-align:center;padding:1rem;">Tiada KOMSEL dijumpai.</p>`;

  list.querySelectorAll(".unmerge-komsel-pick").forEach(el => {
    el.addEventListener("mouseenter", () => el.style.background = "rgba(255,140,0,0.08)");
    el.addEventListener("mouseleave", () => el.style.background = "rgba(255,255,255,0.02)");
    el.addEventListener("click", () => {
      unmergeSelectedKomsel  = decodeURIComponent(el.dataset.code);
      unmergeSelectedMembers = new Set();
      document.getElementById("unmergeSelectedKomselLabel").textContent =
        `KOMSEL: ${unmergeSelectedKomsel}`;
      renderUnmergeMemberList();
      document.getElementById("unmergeStep1").style.display = "none";
      document.getElementById("unmergeStep2").style.display = "flex";
    });
  });
}

function renderUnmergeMemberList() {
  const members = allData.filter(r => {
    const raw  = (r.sectionA?.komselCode || "").trim();
    return (raw ? normaliseKomselCode(raw) : "—") === unmergeSelectedKomsel;
  });
  const list    = document.getElementById("unmergeMemberList");
  const countEl = document.getElementById("unmergeMemberSelCount");

  list.innerHTML = members.map(r => {
    const id      = r.id;
    const name    = (r.name || r.sectionA?.fullName || "—").toUpperCase();
    const uid     = r.uniqueID || "—";
    const checked = unmergeSelectedMembers.has(id);
    return `
      <label style="display:flex;align-items:center;gap:0.75rem;padding:0.55rem 0.75rem;
        border-radius:var(--radius);cursor:pointer;margin-bottom:0.3rem;
        background:${checked ? "rgba(255,140,0,0.12)" : "rgba(255,255,255,0.02)"};
        border:1px solid ${checked ? "var(--marigold)" : "var(--border-card)"};
        transition:all 0.15s ease;">
        <input type="checkbox" class="unmerge-member-chk" data-id="${id}"
          ${checked ? "checked" : ""} style="accent-color:var(--marigold);width:16px;height:16px;flex-shrink:0;"/>
        <span style="flex:1;font-weight:600;font-size:0.88rem;">${name}</span>
        <span style="font-size:0.78rem;color:var(--text-muted);">${uid}</span>
      </label>`;
  }).join("") || `<p style="color:var(--text-muted);font-style:italic;text-align:center;padding:1rem;">Tiada ahli.</p>`;

  list.querySelectorAll(".unmerge-member-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      if (chk.checked) unmergeSelectedMembers.add(chk.dataset.id);
      else unmergeSelectedMembers.delete(chk.dataset.id);
      renderUnmergeMemberList();
      countEl.textContent = `${unmergeSelectedMembers.size} dipilih / selected`;
    });
  });
  countEl.textContent = `${unmergeSelectedMembers.size} dipilih / selected`;
}

document.getElementById("btnUnmergeKomsel")?.addEventListener("click", () => {
  unmergeSelectedKomsel  = null;
  unmergeSelectedMembers = new Set();
  document.getElementById("unmergeKomselSearch").value = "";
  document.getElementById("unmergeNewKomsel").value    = "";
  document.getElementById("unmergeStatus").textContent = "";
  document.getElementById("unmergeStep1").style.display = "flex";
  document.getElementById("unmergeStep2").style.display = "none";
  renderUnmergeKomselPickList("");
  document.getElementById("unmergeKomselModal").style.display = "flex";
});
document.getElementById("closeUnmergeKomselModal")?.addEventListener("click", () => {
  document.getElementById("unmergeKomselModal").style.display = "none";
});
document.getElementById("unmergeKomselSearch")?.addEventListener("input", function() {
  renderUnmergeKomselPickList(this.value);
});
document.getElementById("btnUnmergeBack")?.addEventListener("click", () => {
  unmergeSelectedMembers = new Set();
  document.getElementById("unmergeStep2").style.display = "none";
  document.getElementById("unmergeStep1").style.display = "flex";
});
document.getElementById("btnUnmergeClearSel")?.addEventListener("click", () => {
  unmergeSelectedMembers = new Set();
  renderUnmergeMemberList();
});

document.getElementById("btnUnmergeConfirm")?.addEventListener("click", async () => {
  const newCode  = document.getElementById("unmergeNewKomsel").value.trim().toUpperCase();
  const statusEl = document.getElementById("unmergeStatus");

  if (unmergeSelectedMembers.size === 0) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila pilih sekurang-kurangnya 1 ahli. / Please select at least 1 member.";
    return;
  }
  if (!newCode) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila masukkan nama KOMSEL baharu. / Please enter a new cell group name.";
    return;
  }

  const btn = document.getElementById("btnUnmergeConfirm");
  btn.disabled = true;
  btn.textContent = "⏳ Memindahkan...";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "Mengemaskini rekod... / Updating records...";

  try {
    const batch = db.batch();
    unmergeSelectedMembers.forEach(id => {
      batch.update(db.collection("registrations").doc(id), { "sectionA.komselCode": newCode });
    });
    await batch.commit();

    allData.forEach(reg => {
      if (unmergeSelectedMembers.has(reg.id) && reg.sectionA) {
        reg.sectionA.komselCode = newCode;
      }
    });

    renderKomselTable();
    statusEl.style.color = "#4CAF7D";
    statusEl.textContent = `✅ Berjaya dipindahkan ${unmergeSelectedMembers.size} ahli ke ${newCode}. / Successfully moved ${unmergeSelectedMembers.size} members to ${newCode}.`;
    unmergeSelectedMembers = new Set();
    document.getElementById("unmergeNewKomsel").value = "";
    renderUnmergeMemberList();
  } catch(e) {
    console.error(e);
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Ralat semasa memindahkan. / Error while moving.";
  }

  btn.disabled = false;
  btn.textContent = "✅ Pindah / Move";
});

// ══════════════════════════════════════════════
// CHILDREN CHART + LIST MODAL
// ══════════════════════════════════════════════

// Build couple groups — deduplicate children across married/engaged partners
function buildCoupleGroups(data) {
  const processed = new Set();
  const groups    = [];

  data.forEach(reg => {
    if (processed.has(reg.id)) return;
    const kids = (reg.sectionC?.children || []).filter(c => c.name?.trim() && c.gender);
    if (kids.length === 0) { processed.add(reg.id); return; }

    const myName      = (reg.sectionA?.fullName || reg.name || "").toUpperCase().trim();
    const partnerName = (reg.sectionA?.partnerName || "").toUpperCase().trim();
    const ms          = reg.sectionA?.maritalStatus || "";
    const isDeceased  = !!reg.deceased;

    let partnerReg = null;
    if ((ms === "married" || ms === "engaged" || ms === "widowed") && partnerName) {
      partnerReg = data.find(r =>
        r.id !== reg.id &&
        !processed.has(r.id) &&
        (r.sectionA?.fullName || r.name || "").toUpperCase().trim() === partnerName
      );
    }

    const group = {
      parents:  [{ name: myName, deceased: isDeceased, uid: reg.uniqueID || "—" }],
      status:   ms,
      children: kids,
      boys:     kids.filter(c => c.gender === "male").length,
      girls:    kids.filter(c => c.gender === "female").length,
      total:    kids.length,
    };

    processed.add(reg.id);

    if (partnerReg) {
      group.parents.push({
        name:     (partnerReg.sectionA?.fullName || partnerReg.name || "").toUpperCase().trim(),
        deceased: !!partnerReg.deceased,
        uid:      partnerReg.uniqueID || "—",
      });
      const partnerKids = (partnerReg.sectionC?.children || []).filter(c => c.name?.trim() && c.gender);
      if (partnerKids.length > kids.length) {
        group.children = partnerKids;
        group.boys     = partnerKids.filter(c => c.gender === "male").length;
        group.girls    = partnerKids.filter(c => c.gender === "female").length;
        group.total    = partnerKids.length;
      }
      processed.add(partnerReg.id);
    }

    groups.push(group);
  });

  return groups;
}

function renderChildrenChart() {
  const groups = buildCoupleGroups(allData);

  const buckets = {0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  groups.forEach(g => {
    const n = g.total;
    buckets[Math.min(n,8)]++;
  });
  const singleNoKids = allData.filter(r => {
    const kids = (r.sectionC?.children||[]).filter(c=>c.name?.trim()&&c.gender);
    return kids.length === 0;
  }).length;
  buckets[0] = singleNoKids;

  const labels = ["Tiada anak","1 anak","2 anak","3 anak","4 anak","5 anak","6 anak","7 anak","8+ anak"];

  destroyChart("chartChildren");
  const ctx = document.getElementById("chartChildren")?.getContext("2d");
  if (!ctx) return;
  allCharts["chartChildren"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label:"Bilangan Keluarga / Families", data: Object.values(buckets), backgroundColor: MARIGOLD, borderRadius:6 }]
    },
    options: {
      ...barOpts(),
      plugins: { ...barOpts().plugins, legend:{ display:false } },
      scales: {
        x: { ticks:{ color:chartText() }, grid:{ color:chartGridColor() } },
        y: { ticks:{ color:chartText(), stepSize:1, callback:v=>Number.isInteger(v)?v:null }, grid:{ color:chartGridColor() }, beginAtZero:true }
      }
    }
  });

  const oldBtn = document.getElementById("btnChildrenList");
  if (oldBtn) {
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.addEventListener("click", () => showChildrenListModal(groups));
  }
}

function showChildrenListModal(groups) {
  const msMap = {
    married:"Berkahwin / Married", engaged:"Bertunang / Engaged",
    divorced:"Bercerai / Divorced", widowed:"Duda/Balu / Widowed", single:"Bujang / Single"
  };

  const sorted = [...groups].sort((a,b) => b.total - a.total);
  let totalChildren = 0;

  const rows = sorted.map(g => {
    totalChildren += g.total;
    const parentCells = g.parents.map(p =>
      `${p.name}${p.deceased
        ? ' <span style="color:#E05555;font-size:0.7rem;font-family:var(--font-display);background:rgba(224,85,85,0.1);border:1px solid rgba(224,85,85,0.3);border-radius:999px;padding:1px 6px;">✝ Meninggal/Deceased</span>'
        : ""}`
    ).join("<br/>");

    return `<tr style="border-bottom:1px solid var(--border-card);">
      <td style="padding:0.6rem 0.8rem;vertical-align:middle;">${parentCells}</td>
      <td style="padding:0.6rem 0.8rem;text-align:center;vertical-align:middle;white-space:nowrap;">${msMap[g.status]||g.status||"—"}</td>
      <td style="padding:0.6rem 0.8rem;text-align:center;vertical-align:middle;">${g.boys}</td>
      <td style="padding:0.6rem 0.8rem;text-align:center;vertical-align:middle;">${g.girls}</td>
      <td style="padding:0.6rem 0.8rem;text-align:center;vertical-align:middle;font-weight:700;color:var(--marigold-bright);">${g.total}</td>
    </tr>`;
  }).join("");

  const tableHTML = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table class="stats-modal-table" style="min-width:520px;">
      <thead><tr>
        <th style="padding:0.65rem 0.8rem;text-align:left;">Ibu Bapa / Parent(s)</th>
        <th style="padding:0.65rem 0.8rem;text-align:center;white-space:nowrap;">Status</th>
        <th style="padding:0.65rem 0.8rem;text-align:center;">Anak Lelaki<br/><em style="font-weight:400;">Boy(s)</em></th>
        <th style="padding:0.65rem 0.8rem;text-align:center;">Anak Perempuan<br/><em style="font-weight:400;">Girl(s)</em></th>
        <th style="padding:0.65rem 0.8rem;text-align:center;">Jumlah<br/><em style="font-weight:400;">Total</em></th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:rgba(255,140,0,0.07);">
        <td colspan="4" style="padding:0.65rem 0.8rem;font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.05em;color:var(--marigold-bright);">
          Jumlah Keseluruhan / Total Children
        </td>
        <td style="padding:0.65rem 0.8rem;text-align:center;font-weight:700;font-size:1.1rem;color:var(--marigold-bright);">${totalChildren}</td>
      </tr></tfoot>
    </table>
  </div>`;

  openListModal("Senarai Anggota yang Mempunyai Anak / Members with Children", tableHTML);
}

// ══════════════════════════════════════════════
// CITY TABLE — 3 columns with modal
// ══════════════════════════════════════════════
// ── Malaysia postcode → city lookup ──
// Postcodes grouped by first 2–3 digits for efficiency
const MY_POSTCODE_CITIES = {
  // Sarawak
  93: "Kuching", 94: "Kuching", 95: "Kuching", 96: "Kuching",
  97: "Bintulu", 98: "Miri",
  91: "Tawau",   // actually Sabah but near border — leave as Tawau
  99: "Keningau",
  // Miri area
  981: "Miri", 982: "Miri", 983: "Miri",
  // Bintulu area
  971: "Bintulu", 972: "Bintulu",
  // Sibu area
  961: "Sibu", 962: "Sibu", 963: "Sibu",
  // Sri Aman
  951: "Sri Aman", 952: "Sri Aman",
  // Sarikei
  941: "Sarikei", 942: "Sarikei",
  // Kapit
  964: "Kapit",
  // Betong
  953: "Betong",
  // Limbang
  984: "Limbang",
  // Lawas
  985: "Lawas",
  // Mukah
  966: "Mukah",
  // Serian
  931: "Serian",
  // Kota Samarahan
  942: "Kota Samarahan",
  // Sabah
  88: "Kota Kinabalu", 89: "Kota Kinabalu", 90: "Sandakan",
  // Peninsular
  10: "Pulau Pinang", 11: "Pulau Pinang",
  41: "Kuala Lumpur", 50: "Kuala Lumpur", 51: "Kuala Lumpur",
  52: "Kuala Lumpur", 53: "Kuala Lumpur", 54: "Kuala Lumpur",
  55: "Kuala Lumpur", 56: "Kuala Lumpur", 57: "Kuala Lumpur",
  58: "Kuala Lumpur", 59: "Kuala Lumpur",
  68: "Ampang",       70: "Seremban",
  80: "Johor Bahru",  81: "Johor Bahru",  83: "Batu Pahat",
};

function getCityFromAddress(reg) {
  // Non-citizen → Luar Negara
  if (reg.sectionA?.citizenship === "nonCitizen") return "__abroad__";

  const addr = reg.sectionA?.currentAddress || "";

  // Extract postcode — look for 5 consecutive digits
  const postcodeMatch = addr.match(/\b(\d{5})\b/);
  if (postcodeMatch) {
    const pc  = postcodeMatch[1];
    const pc3 = parseInt(pc.substring(0,3), 10);
    const pc2 = parseInt(pc.substring(0,2), 10);
    if (MY_POSTCODE_CITIES[pc3]) return MY_POSTCODE_CITIES[pc3];
    if (MY_POSTCODE_CITIES[pc2]) return MY_POSTCODE_CITIES[pc2];
  }

  // Fallback: keyword scan
  const lower = addr.toLowerCase();
  const keywords = [
    ["Kuching","kuching"],["Miri","miri"],["Sibu","sibu"],["Bintulu","bintulu"],
    ["Kota Samarahan","samarahan"],["Serian","serian"],["Sri Aman","sri aman"],
    ["Betong","betong"],["Sarikei","sarikei"],["Kapit","kapit"],["Limbang","limbang"],
    ["Lawas","lawas"],["Mukah","mukah"],["Kota Kinabalu","kinabalu"],
    ["Kuala Lumpur","kuala lumpur"],["Johor Bahru","johor bahru"],
    ["Penang","penang"],["Pulau Pinang","pulau pinang"],
  ];
  for (const [name, key] of keywords) {
    if (lower.includes(key)) return name;
  }
  return "Lain-lain / Others";
}

function renderCityTable() {
  const map = {}; // city → [ {name,uid,country?} ]
  allData.forEach(r => {
    const city = getCityFromAddress(r);
    if (!map[city]) map[city] = [];
    map[city].push({
      name:    (r.name || r.sectionA?.fullName || "—"),
      uid:     r.uniqueID || "—",
      country: r.sectionA?.countryOfOrigin || "—",
    });
  });

  // Sort cities by count descending, put Abroad and Others last
  const sorted = Object.entries(map).sort((a,b) => {
    if (a[0]==="__abroad__") return 1;
    if (b[0]==="__abroad__") return -1;
    if (a[0]==="Lain-lain / Others") return 1;
    if (b[0]==="Lain-lain / Others") return -1;
    return b[1].length - a[1].length;
  });

  const tbody = document.getElementById("cityTableBody");
  if (!tbody) return;

  tbody.innerHTML = sorted.map(([city, members]) => {
    const displayCity = city === "__abroad__" ? "Luar Negara / Abroad" : city;
    return `<tr>
      <td style="font-weight:700;">${displayCity}</td>
      <td style="text-align:center;">${members.length}</td>
      <td style="text-align:center;">
        <button class="stats-view-btn"
          data-city="${encodeURIComponent(city)}"
          data-abroad="${city==="__abroad__" ? "1" : "0"}">
          👁 Lihat / View
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".stats-view-btn[data-city]").forEach(btn => {
    btn.addEventListener("click", () => {
      const city    = decodeURIComponent(btn.dataset.city);
      const members = map[city];
      const isAbroad = btn.dataset.abroad === "1";

      if (isAbroad) {
        // Show Name | Unique ID | Country of Origin table
        const tableHTML = `<table class="stats-modal-table">
          <thead><tr>
            <th>Nama / Name</th>
            <th>ID Unik / Unique ID</th>
            <th>Negara Asal / Country of Origin</th>
          </tr></thead>
          <tbody>${members.map(m => `
            <tr>
              <td>${(m.name||"—").toUpperCase()}</td>
              <td style="color:var(--marigold);font-family:var(--font-display);font-size:0.85rem;">${m.uid||"—"}</td>
              <td>${m.country||"—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>`;
        openListModal("Luar Negara / Abroad", tableHTML);
      } else {
        openListModal(
          `Ahli dari ${city === "__abroad__" ? "Luar Negara" : city}`,
          buildMemberListTable(members)
        );
      }
    });
  });
}

// ══════════════════════════════════════════════
// LIST MODAL — shared
// ══════════════════════════════════════════════
function openListModal(title, bodyHTML) {
  document.getElementById("listModalTitle").textContent = title;
  document.getElementById("listModalBody").innerHTML = bodyHTML;
  document.getElementById("listModal").style.display = "flex";
}
document.getElementById("closeListModal")?.addEventListener("click",    () => document.getElementById("listModal").style.display="none");
document.getElementById("closeListModalBtn")?.addEventListener("click", () => document.getElementById("listModal").style.display="none");

// ══════════════════════════════════════════════
// EXPORT PDF
// ══════════════════════════════════════════════
document.getElementById("btnExportPDF")?.addEventListener("click", exportStatsPDF);

async function exportStatsPDF() {
  const btn = document.getElementById("btnExportPDF");
  btn.disabled = true;
  btn.textContent = "⏳ Menjana PDF...";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PAGE_W = 210, PAGE_H = 297, MARGIN = 20;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const BLACK  = [0, 0, 0];
  const MUTED  = [120, 120, 120];
  const BORDER = [0, 0, 0];

  // ── Footer on current page ──
  function drawFooter() {
    const p = doc.getNumberOfPages();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("BEM On The Rock — Statistik Keanggotaan / Membership Statistics", MARGIN, PAGE_H - 8);
    doc.text(String(p), PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, PAGE_H - 11, PAGE_W - MARGIN, PAGE_H - 11);
  }

  // ── New page ──
  function newPage() {
    drawFooter();
    doc.addPage();
    y = MARGIN;
  }

  // ── Check space, new page if needed ──
  function checkPage(needed) {
    if (y + needed > PAGE_H - 18) newPage();
  }

  // ── Section heading: "BM bold  EN italic" ──
  function sectionHeading(bm, en) {
    checkPage(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    const bmWidth = doc.getTextWidth(bm + " ");
    doc.text(bm, MARGIN, y);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text(en, MARGIN + bmWidth, y);
    y += 6;
  }

  // ── Summary row: label left cell, value right cell ──
  function summaryRow(bmLabel, enLabel, value) {
    const ROW_H = 14;
    const COL1  = CONTENT_W * 0.55;
    const COL2  = CONTENT_W * 0.45;
    checkPage(ROW_H + 3);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, COL1, ROW_H, "S");
    doc.rect(MARGIN + COL1, y, COL2, ROW_H, "S");
    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(bmLabel, MARGIN + 3, y + 5);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(enLabel, MARGIN + 3, y + 10);
    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BLACK);
    doc.text(String(value), MARGIN + COL1 + COL2 / 2, y + 9, { align: "center" });
    y += ROW_H + 3;
  }

  // ── Plain table (no shading) ──
  function drawTable(headers, rows, colWidths) {
    const ROW_H  = 7;
    const HEAD_H = 8;
    const tableW = colWidths.reduce((a, b) => a + b, 0);

    checkPage(HEAD_H + 4);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, tableW, HEAD_H, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    let x = MARGIN;
    headers.forEach((h, i) => {
      // Split BM bold / EN italic inline
      const parts = h.split(" / ");
      if (parts.length === 2) {
        const bmW = doc.getTextWidth(parts[0] + " / ");
        doc.setFont("helvetica", "bold");
        doc.text(parts[0] + " /", x + 3, y + 5.5);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.text(" " + parts[1], x + 3 + bmW, y + 5.5);
        doc.setFontSize(9);
      } else {
        doc.setFont("helvetica", "bold");
        doc.text(h, x + 3, y + 5.5);
      }
      if (i < headers.length - 1) doc.line(x + colWidths[i], y, x + colWidths[i], y + HEAD_H);
      x += colWidths[i];
    });
    y += HEAD_H;

    rows.forEach((row, ri) => {
      checkPage(ROW_H + 1);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.rect(MARGIN, y, tableW, ROW_H, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLACK);
      x = MARGIN;
      row.forEach((cell, i) => {
        doc.text(String(cell ?? "—"), x + 3, y + 5, { maxWidth: colWidths[i] - 5 });
        if (i < row.length - 1) doc.line(x + colWidths[i], y, x + colWidths[i], y + ROW_H);
        x += colWidths[i];
      });
      y += ROW_H;
    });
    y += 8;
  }

  // ── Add chart image with dark-text override for legible legends ──
  const CHART_HEIGHTS = {
    chartGender:   85,
    chartAge:      90,
    chartTime:     65,
    chartMarital:  70,
    chartChildren: 65,
  };
  // Pie/donut charts render better constrained to a square-ish width
  const CHART_WIDTHS = {
    chartGender:   100,
    chartAge:      170,
    chartTime:     CONTENT_W,
    chartMarital:  CONTENT_W,
    chartChildren: CONTENT_W,
  };

  async function addChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // ── Override chart colours to dark for PDF capture ──
    const chart = allCharts[canvasId];
    if (chart) {
      chart.options.plugins.legend.labels.color = "#000000";
      if (chart.options.scales) {
        ["x","y"].forEach(axis => {
          if (chart.options.scales[axis]) {
            chart.options.scales[axis].ticks = { ...chart.options.scales[axis].ticks, color: "#111111" };
            chart.options.scales[axis].grid  = { ...chart.options.scales[axis].grid,  color: "#cccccc" };
          }
        });
      }
      chart.update("none");
    }

    const imgData = canvas.toDataURL("image/png", 1.0);

    // ── Restore original dark-mode colours ──
    if (chart) {
      const tc = chartText();
      const gc = chartGridColor();
      chart.options.plugins.legend.labels.color = tc;
      if (chart.options.scales) {
        ["x","y"].forEach(axis => {
          if (chart.options.scales[axis]) {
            chart.options.scales[axis].ticks = { ...chart.options.scales[axis].ticks, color: tc };
            chart.options.scales[axis].grid  = { ...chart.options.scales[axis].grid,  color: gc };
          }
        });
      }
      chart.update("none");
    }

    const imgH = CHART_HEIGHTS[canvasId] || 70;
    const imgW = CHART_WIDTHS[canvasId]  || CONTENT_W;
    const imgX = MARGIN + (CONTENT_W - imgW) / 2; // centre if narrower

    checkPage(imgH + 4);
    doc.addImage(imgData, "PNG", imgX, y, imgW, imgH);
    y += imgH + 6;
  }

  // ── Section heading that checks space for both itself AND the chart ──
  function sectionHeadingWithChart(bm, en, canvasId) {
    const chartH = CHART_HEIGHTS[canvasId] || 70;
    const totalNeeded = 6 + chartH + 12;
    if (y + totalNeeded > PAGE_H - 18) newPage();
    sectionHeading(bm, en);
  }

  // ── Small count table drawn under a chart ──
  function drawCountTable(headers, rows, colWidths) {
    const ROW_H  = 6.5;
    const HEAD_H = 7.5;
    const tableW = colWidths.reduce((a, b) => a + b, 0);
    const tableX = MARGIN + (CONTENT_W - tableW) / 2;

    checkPage(HEAD_H + rows.length * ROW_H + 6);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.rect(tableX, y, tableW, HEAD_H, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    let x = tableX;
    headers.forEach((h, i) => {
      doc.text(h, x + 3, y + 5);
      if (i < headers.length - 1) doc.line(x + colWidths[i], y, x + colWidths[i], y + HEAD_H);
      x += colWidths[i];
    });
    y += HEAD_H;

    rows.forEach((row) => {
      checkPage(ROW_H + 1);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.rect(tableX, y, tableW, ROW_H, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BLACK);
      x = tableX;
      row.forEach((cell, i) => {
        doc.text(String(cell ?? "—"), x + 3, y + 4.5);
        if (i < row.length - 1) doc.line(x + colWidths[i], y, x + colWidths[i], y + ROW_H);
        x += colWidths[i];
      });
      y += ROW_H;
    });
    y += 8;
  }

  // ════════════════════════════
  // HEADER (page 1 only)
  // ════════════════════════════
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const bmSub = "Sistem Keanggotaan ";
  const bmSubW = doc.getTextWidth(bmSub);
  doc.text(bmSub, MARGIN, y);
  doc.setFont("helvetica", "italic");
  doc.text("Registration system", MARGIN + bmSubW, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BLACK);
  doc.text("BEM On The ROCK", MARGIN, y);
  y += 5;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  const now = new Date();
  const dateStr = now.toLocaleDateString("ms-MY", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Dijana pada / Generated on: ${dateStr}, ${timeStr}`, MARGIN, y);
  y += 8;

  // ════════════════════════════
  // SUMMARY
  // ════════════════════════════
  sectionHeading("Ringkasan Data", "Data Summary");
  y += 2;

  const totalReg      = allData.length;
  const coupleGroups  = buildCoupleGroups(allData);
  const totalChildren = coupleGroups.reduce((sum, g) => sum + g.total, 0);

  // Fetch affiliated count
  let totalAffiliated = 0;
  try {
    const affSnap = await db.collection("affiliatedMembers").get();
    totalAffiliated = affSnap.size;
  } catch(e) { console.warn("Could not fetch affiliated count", e); }

  summaryRow("Jumlah Jemaat Berdaftar", "Total Registered Members", totalReg);
  summaryRow("Jumlah Jemaat Bersekutu", "Total Associated Members", totalAffiliated);
  summaryRow(
    "Jumlah Kanak-Kanak (Berdaftar Di Bawah Jemaat Berdaftar)",
    "Total Children (Registered under Registered Members)",
    totalChildren
  );
  y += 4;

  // ════════════════════════════
  // 1. GENDER
  // ════════════════════════════
  sectionHeadingWithChart("Statistik Jantina", "Gender's Statistics", "chartGender");
  await addChart("chartGender");
  // Count table
  const genderCounts = { male:0, female:0 };
  allData.forEach(r => {
    const g = r.sectionA?.gender;
    if (g === "male") genderCounts.male++;
    else if (g === "female") genderCounts.female++;
  });
  drawCountTable(
    ["Jantina / Gender", "Jumlah / Total"],
    [
      ["Lelaki / Male",       genderCounts.male],
      ["Perempuan / Female",  genderCounts.female],
    ],
    [100, 50]
  );

  // ════════════════════════════
  // 2. REGISTRATIONS OVER TIME
  // ════════════════════════════
  sectionHeadingWithChart("Jumlah Pendaftaran dari Semasa ke Semasa", "Registrations Over Time", "chartTime");
  await addChart("chartTime");

  // ════════════════════════════
  // 3. RACE TABLE
  // ════════════════════════════
  sectionHeading("Statistik Bangsa", "Race Statistics");
  const raceRows = [];
  document.querySelectorAll("#raceTableBody tr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 2) raceRows.push([cells[0].textContent.trim(), cells[1].textContent.trim()]);
  });
  drawTable(["Bangsa / Race", "Jumlah / Total"], raceRows, [CONTENT_W - 40, 40]);

  // ════════════════════════════
  // 4. AGE GROUP
  // ════════════════════════════
  sectionHeadingWithChart("Statistik Kumpulan Umur", "Age Group Statistics", "chartAge");
  await addChart("chartAge");
  // Count table
  const AGE_ORDER = [
    "Remaja / Teen (13–17)",
    "Dewasa Muda / Young Adult (18–29)",
    "Dewasa / Adult (30–59)",
    "Warga Emas / Senior (60+)",
    "Tidak Diketahui / Unknown"
  ];
  const ageCounts = {};
  AGE_ORDER.forEach(k => ageCounts[k] = 0);
  allData.forEach(r => {
    const g = getAgeGroup(r.sectionA?.dob);
    ageCounts[g] = (ageCounts[g] || 0) + 1;
  });
  drawCountTable(
    ["Kumpulan Umur / Age Group", "Jumlah / Total"],
    [...AGE_ORDER.map(k => [k, ageCounts[k]]), ["Jumlah / Total", allData.length]],
    [130, 40]
  );

  // ════════════════════════════
  // 5. MARITAL STATUS
  // ════════════════════════════
  sectionHeadingWithChart("Statistik Status Perkahwinan", "Marital Status Statistics", "chartMarital");
  await addChart("chartMarital");
  // Count table
  const MCATS   = ["single","engaged","married","divorced","widowed"];
  const MLABELS = ["Bujang / Single","Bertunang / Engaged","Berkahwin / Married","Bercerai / Divorced","Balu/Duda / Widowed"];
  const mMale   = new Array(5).fill(0), mFemale = new Array(5).fill(0);
  allData.forEach(r => {
    const ms = r.sectionA?.maritalStatus;
    const g  = r.sectionA?.gender;
    const idx = MCATS.indexOf(ms);
    if (idx < 0) return;
    if (g === "male") mMale[idx]++;
    else if (g === "female") mFemale[idx]++;
  });
  drawCountTable(
    ["Status / Status", "Lelaki / Male", "Perempuan / Female", "Jumlah / Total"],
    [
      ...MLABELS.map((l, i) => [l, mMale[i], mFemale[i], mMale[i] + mFemale[i]]),
      ["Jumlah / Total", mMale.reduce((a,b)=>a+b,0), mFemale.reduce((a,b)=>a+b,0), allData.length]
    ],
    [80, 32, 42, 32]
  );

  // ════════════════════════════
  // 6. KOMSEL TABLE
  // ════════════════════════════
  sectionHeading("Bilangan Ahli dalam KOMSEL", "Members by Cell Group");
  const komselRows = [];
  document.querySelectorAll("#komselTableBody tr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 2) komselRows.push([cells[0].textContent.trim(), cells[1].textContent.trim()]);
  });
  drawTable(["KOMSEL / Cell Group", "Jumlah Ahli / Total Members"], komselRows, [CONTENT_W - 40, 40]);

  // ════════════════════════════
  // 7. CHILDREN CHART
  // ════════════════════════════
  sectionHeadingWithChart("Statistik Anggota dengan Anak", "Members with Children", "chartChildren");
  await addChart("chartChildren");
  // Count table
  const childGroups  = buildCoupleGroups(allData);
  const childBuckets = {0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  childGroups.forEach(g => { childBuckets[Math.min(g.total,8)]++; });
  const singleNoKids = allData.filter(r => {
    const kids = (r.sectionC?.children||[]).filter(c=>c.name?.trim()&&c.gender);
    return kids.length === 0;
  }).length;
  childBuckets[0] = singleNoKids;
  const childLabels = ["Tiada anak","1 anak","2 anak","3 anak","4 anak","5 anak","6 anak","7 anak","8+ anak"];
  drawCountTable(
    ["Bilangan Anak / No. of Children", "Bilangan Keluarga / Families"],
    [
      ...childLabels.map((l, i) => [l, childBuckets[i]]),
      ["Jumlah / Total", Object.values(childBuckets).reduce((a,b)=>a+b,0)]
    ],
    [120, 50]
  );

  // ════════════════════════════
  // 8. CITY TABLE
  // ════════════════════════════
  sectionHeading("Bilangan Anggota Mengikut Bandar", "Members by City");
  const cityRows = [];
  document.querySelectorAll("#cityTableBody tr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 2) cityRows.push([cells[0].textContent.trim(), cells[1].textContent.trim()]);
  });
  drawTable(["Bandar / City", "Jumlah Ahli / Total Members"], cityRows, [CONTENT_W - 40, 40]);

  // ── Footer on last page ──
  drawFooter();

  // ── Save ──
  const filename = `BEM_OTR_Statistics_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}.pdf`;
  doc.save(filename);

  btn.disabled = false;
  btn.textContent = "📄 Eksport PDF / Export PDF";
}
document.getElementById("gotoSelect")?.addEventListener("change", function() {
  const id = this.value;
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
  this.value = "";
});

// Scroll-to-top button
document.getElementById("btnScrollTop")?.addEventListener("click", () => {
  window.scrollTo({ top:0, behavior:"smooth" });
});

// ══════════════════════════════════════════════
// CHART HELPERS
// ══════════════════════════════════════════════
function destroyChart(id) {
  if (allCharts[id]) { allCharts[id].destroy(); delete allCharts[id]; }
}

function pieOpts() {
  return {
    plugins: {
      legend: { labels: { color: chartText(), font:{ family:"Crimson Pro, serif", size:13 }, padding:16 } }
    }
  };
}

function barOpts() {
  return {
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { ticks:{ color:chartText() }, grid:{ color:chartGridColor() } },
      y: { ticks:{ color:chartText() }, grid:{ color:chartGridColor() }, beginAtZero:true }
    }
  };
}