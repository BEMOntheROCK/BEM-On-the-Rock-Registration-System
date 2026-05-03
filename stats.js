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

// ── Normalise race string for grouping ──
function normaliseRace(raw) {
  if (!raw || !raw.trim()) return "TIDAK DIKETAHUI / UNKNOWN";
  // Take only the part before any slash (mixed race → first race only)
  let r = raw.split("/")[0].trim();
  // Remove all spaces for comparison key, uppercase
  r = r.toUpperCase().replace(/\s+/g, "");
  return r;
}

function displayRace(raw) {
  if (!raw || !raw.trim()) return "TIDAK DIKETAHUI / UNKNOWN";
  return raw.split("/")[0].trim().toUpperCase();
}

// ══════════════════════════════════════════════
// RACE — Table with list modal
// ══════════════════════════════════════════════
function renderRaceTable() {
  const map = {}; // normalised key → { display, members[] }
  allData.forEach(r => {
    const raw  = r.sectionA?.race || "";
    const key  = normaliseRace(raw);
    const disp = displayRace(raw);
    if (!map[key]) map[key] = { display: disp, members: [] };
    map[key].members.push({ name:(r.name||r.sectionA?.fullName||"—"), uid:r.uniqueID||"—" });
  });

  const sorted = Object.entries(map).sort((a,b) => b[1].members.length - a[1].members.length);
  const tbody  = document.getElementById("raceTableBody");
  if (!tbody) return;

  tbody.innerHTML = sorted.map(([key, {display, members}]) => `
    <tr>
      <td style="font-weight:700;">${display}</td>
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
      const key  = decodeURIComponent(btn.dataset.race);
      const entry = lookup[key];
      if (!entry) return;
      openListModal(`Ahli Bangsa ${entry.display}`, buildMemberListTable(entry.members));
    });
  });
}

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

  const sorted = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
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
// GO-TO NAV DROPDOWN
// ══════════════════════════════════════════════
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