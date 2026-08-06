"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — deceased.js
═══════════════════════════════════════════════ */

document.getElementById("deceasedFooterYear").textContent = new Date().getFullYear();

// ── State ──
let heirMemberData     = null; // Firestore data if heir is a registered member
let deceasedMemberData = null; // Firestore data if deceased was a registered member
let deceasedDocId      = null; // doc ID if deceased found in DB

// ── Helpers ──
function formatIC(v) {
  const d = v.replace(/\D/g,"");
  let f = d;
  if (d.length>6) f = d.substring(0,6)+"-"+d.substring(6);
  if (d.length>8) f = f.substring(0,9)+"-"+d.substring(8);
  return f.substring(0,14);
}

function formatMyTentera(v) {
  // MyTentera uses ddmmyy-##-#### formatting (same dash pattern as IC)
  return formatIC(v);
}

function formatPassport(v) {
  // Passport: alphanumeric only, uppercase; no IC-style formatting
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0,20);
}

function formatPhone(v) {
  const d = v.replace(/\D/g,"");
  return d.length > 3 ? d.substring(0,3)+"-"+d.substring(3,10) : d;
}

function showSection(id) {
  ["section-a","section-b","section-c"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("active", s === id);
  });
  window.scrollTo({top:0, behavior:"smooth"});
}

// ══════════════════════════════════════════════
// SECTION A — Heir Status
// ══════════════════════════════════════════════
document.querySelectorAll('input[name="heirStatus"]').forEach(radio => {
  radio.addEventListener("change", function() {
    const v = this.value;
    document.getElementById("heirRegisteredFields").classList.toggle("visible", v === "registered");
    document.getElementById("heirManualFields").classList.toggle("visible",     v === "unregistered" || v === "outsider");
    document.getElementById("heirRelationshipField").classList.add("visible");
    // Clear previous lookups
    heirMemberData = null;
    document.getElementById("heirMemberBanner").style.display = "none";
    document.getElementById("heirLookupNotice").textContent = "";
  });
});

// Identifier auto-format (depends on dropdown selection)
document.getElementById("heirIC")?.addEventListener("input", function() {
  const idType = document.getElementById("heirIdType")?.value || "IC";
  if (idType === "Passport") this.value = formatPassport(this.value);
  else this.value = formatMyTentera(this.value); // IC & MyTentera share dash formatting
});
document.getElementById("heirManualIC")?.addEventListener("input", function() {
  const idType = document.getElementById("heirManualIdType")?.value || "IC";
  if (idType === "Passport") this.value = formatPassport(this.value);
  else this.value = formatMyTentera(this.value);
});

// Phone auto-format
document.getElementById("heirPhone")?.addEventListener("input", function() {
  this.value = formatPhone(this.value);
});
document.getElementById("conductorPhone")?.addEventListener("input", function() {
  this.value = formatPhone(this.value);
});
document.getElementById("witnessPhone")?.addEventListener("input", function() {
  this.value = formatPhone(this.value);
});

// Registered member IC lookup — search regardless of approval status
document.getElementById("heirIC")?.addEventListener("blur", async function() {
  const idType = document.getElementById("heirIdType")?.value || "IC";
  const raw    = this.value || "";
  const notice = document.getElementById("heirLookupNotice");
  notice.textContent = "Menyemak... / Checking...";
  try {
    let snap;
    if (idType === "IC") {
      const ic = raw.replace(/-/g,"");
      if (ic.length !== 12 || isNaN(ic)) return;
      snap = await db.collection("registrations").where("icNo","==",ic).limit(1).get();
    } else if (idType === "MyTentera") {
      const foreignVal = formatMyTentera(raw);
      const digitsOnly = foreignVal.replace(/-/g,"");
      if (digitsOnly.length !== 12 || isNaN(digitsOnly)) return;
      snap = await db.collection("registrations")
        .where("sectionA.foreignID","==",foreignVal).limit(1).get();
      if (snap.empty) {
        // backward compat: try digits-only match
        snap = await db.collection("registrations")
          .where("sectionA.foreignID","==",digitsOnly).limit(1).get();
      }
    } else {
      // Passport
      const passportNorm = formatPassport(raw);
      if (passportNorm.length < 4) return;
      snap = await db.collection("registrations")
        .where("sectionA.foreignID","==",passportNorm).limit(1).get();
    }

    if (!snap || snap.empty) {
      notice.textContent = "Tiada rekod dijumpai. / No record found.";
      heirMemberData = null;
      document.getElementById("heirMemberBanner").style.display = "none";
    } else {
      heirMemberData = snap.docs[0].data();
      notice.textContent = "";
      const banner = document.getElementById("heirMemberBanner");
      document.getElementById("heirMemberName").textContent =
        (heirMemberData.sectionA?.fullName || heirMemberData.name || "—").toUpperCase();
      document.getElementById("heirMemberUID").textContent =
        `ID: ${heirMemberData.uniqueID || "—"} | ${heirMemberData.approved ? "Ahli Aktif / Active" : "Tidak Aktif / Inactive"}`;
      banner.style.display = "block";
    }
  } catch(e) {
    notice.textContent = "Ralat / Error checking record.";
  }
});

// Next A → B
document.getElementById("btnNextA").addEventListener("click", () => {
  const status = document.querySelector('input[name="heirStatus"]:checked')?.value;
  let valid = true;
  document.getElementById("err-heirStatus").textContent = "";

  if (!status) {
    document.getElementById("err-heirStatus").textContent = "Sila pilih satu pilihan / Please select an option.";
    valid = false;
  }

  if (status === "registered") {
    const idType = document.getElementById("heirIdType")?.value || "IC";
    const raw = document.getElementById("heirIC").value || "";
    if (idType === "IC") {
      const ic = raw.replace(/-/g,"");
      if (ic.length !== 12 || isNaN(ic)) {
        document.getElementById("err-heirIC").textContent = "Sila masukkan No. KP yang sah / Enter valid IC No.";
        valid = false;
      }
    } else if (idType === "MyTentera") {
      const foreignVal = formatMyTentera(raw);
      const digitsOnly = foreignVal.replace(/-/g,"");
      if (digitsOnly.length !== 12 || isNaN(digitsOnly)) {
        document.getElementById("err-heirIC").textContent = "Sila masukkan MyTentera yang sah / Please enter a valid MyTentera number.";
        valid = false;
      }
    } else {
      const passportNorm = formatPassport(raw);
      if (passportNorm.length < 4) {
        document.getElementById("err-heirIC").textContent = "Sila masukkan nombor Passport yang sah / Please enter a valid Passport number.";
        valid = false;
      }
    }
  } else if (status === "unregistered" || status === "outsider") {
    if (!document.getElementById("heirFullName").value.trim()) {
      document.getElementById("err-heirFullName").textContent = "Diperlukan / Required";
      valid = false;
    }
    const idType = document.getElementById("heirManualIdType")?.value || "IC";
    const raw = document.getElementById("heirManualIC").value || "";
    if (idType === "IC") {
      const ic = raw.replace(/-/g,"");
      if (ic.length !== 12 || isNaN(ic)) {
        document.getElementById("err-heirManualIC").textContent = "No. KP tidak sah / Invalid IC";
        valid = false;
      }
    } else if (idType === "MyTentera") {
      const foreignVal = formatMyTentera(raw);
      const digitsOnly = foreignVal.replace(/-/g,"");
      if (digitsOnly.length !== 12 || isNaN(digitsOnly)) {
        document.getElementById("err-heirManualIC").textContent = "MyTentera tidak sah / Invalid MyTentera";
        valid = false;
      }
    } else {
      const passportNorm = formatPassport(raw);
      if (passportNorm.length < 4) {
        document.getElementById("err-heirManualIC").textContent = "Passport tidak sah / Invalid Passport";
        valid = false;
      }
    }
    if (!document.getElementById("heirPhone").value.trim()) {
      document.getElementById("err-heirPhone").textContent = "Diperlukan / Required";
      valid = false;
    }
    if (!document.getElementById("heirAddress").value.trim()) {
      document.getElementById("err-heirAddress").textContent = "Diperlukan / Required";
      valid = false;
    }
  }

  if (!document.getElementById("heirRelationship").value.trim()) {
    document.getElementById("err-heirRelationship").textContent = "Sila isi hubungan / Please state relationship.";
    valid = false;
  }

  if (valid) showSection("section-b");
});

// ══════════════════════════════════════════════
// SECTION B — Deceased Info + Auto-fill
// ══════════════════════════════════════════════
document.getElementById("btnBackB").addEventListener("click", () => showSection("section-a"));

// Check deceased name/IC against DB
async function checkDeceasedInDB(nameOrIC, isIC, idType = "IC") {
  try {
    let snap;
    if (isIC) {
      if (idType === "IC") {
        const clean = String(nameOrIC).replace(/-/g,"");
        if (clean.length !== 12 || isNaN(clean)) return;
        snap = await db.collection("registrations").where("icNo","==",clean).limit(1).get();
      } else if (idType === "MyTentera") {
        const foreignVal = formatMyTentera(nameOrIC);
        const digitsOnly = foreignVal.replace(/-/g,"");
        if (digitsOnly.length !== 12 || isNaN(digitsOnly)) return;
        snap = await db.collection("registrations")
          .where("sectionA.foreignID","==",foreignVal).limit(1).get();
        if (snap.empty) {
          snap = await db.collection("registrations")
            .where("sectionA.foreignID","==",digitsOnly).limit(1).get();
        }
      } else {
        // Passport
        const passportNorm = formatPassport(nameOrIC);
        if (passportNorm.length < 4) return;
        snap = await db.collection("registrations")
          .where("sectionA.foreignID","==",passportNorm).limit(1).get();
      }
    } else {
      const upper = nameOrIC.toUpperCase();
      snap = await db.collection("registrations").where("name","==",upper).limit(1).get();
    }
    if (!snap || snap.empty) { deceasedMemberData = null; deceasedDocId = null; return; }
    deceasedDocId   = snap.docs[0].id;
    deceasedMemberData = snap.docs[0].data();
    document.getElementById("autoFillNotice").style.display = "block";
  } catch(e) { /* silent */ }
}

document.getElementById("deceasedFullName").addEventListener("blur", function() {
  if (this.value.trim().length > 2) checkDeceasedInDB(this.value.trim(), false);
});

document.getElementById("deceasedIC").addEventListener("input", function() {
  const idType = document.getElementById("deceasedIdType")?.value || "IC";
  if (idType === "Passport") this.value = formatPassport(this.value);
  else this.value = formatMyTentera(this.value);
});

document.getElementById("deceasedIC").addEventListener("blur", function() {
  const idType = document.getElementById("deceasedIdType")?.value || "IC";
  const raw = this.value || "";
  if (!raw.trim()) return;
  checkDeceasedInDB(raw, true, idType);
});

document.getElementById("btnAutoFillYes").addEventListener("click", () => {
  if (!deceasedMemberData) return;
  const a = deceasedMemberData.sectionA || {};
  document.getElementById("deceasedFullName").value  = a.fullName  || deceasedMemberData.name || "";

  const inferIdType = (sectionA) => {
    if (sectionA?.idType) return sectionA.idType;
    if (sectionA?.citizenship === "citizen") return "IC";
    const fid = String(sectionA?.foreignID || "");
    if (/[A-Za-z]/.test(fid)) return "Passport";
    return "MyTentera";
  };
  const idType = inferIdType(a);
  const idTypeEl = document.getElementById("deceasedIdType");
  if (idTypeEl) idTypeEl.value = idType;

  if (idType === "IC") {
    const rawIc = a.icNo || deceasedMemberData.icNo || "";
    document.getElementById("deceasedIC").value = formatIC(rawIc);
  } else if (idType === "MyTentera") {
    document.getElementById("deceasedIC").value = formatMyTentera(a.foreignID || "");
  } else {
    document.getElementById("deceasedIC").value = formatPassport(a.foreignID || "");
  }
  document.getElementById("deceasedRace").value      = a.race      || "";
  document.getElementById("deceasedAddress").value   = a.currentAddress || "";
  // Gender
  if (a.gender) {
    const g = document.querySelector(`input[name="deceasedGender"][value="${a.gender}"]`);
    if (g) g.checked = true;
  }
  document.getElementById("autoFillNotice").style.display = "none";
});

document.getElementById("btnAutoFillNo").addEventListener("click", () => {
  document.getElementById("autoFillNotice").style.display = "none";
  deceasedMemberData = null;
  deceasedDocId      = null;
});

// Next B → C
document.getElementById("btnNextB").addEventListener("click", () => {
  let valid = true;
  ["err-deceasedFullName","err-deceasedIC","err-deceasedGender","err-dateOfPassing","err-declaration"]
    .forEach(id => { const el=document.getElementById(id); if(el) el.textContent=""; });

  if (!document.getElementById("deceasedFullName").value.trim()) {
    document.getElementById("err-deceasedFullName").textContent = "Diperlukan / Required"; valid = false;
  }
  const deceasedIdType = document.getElementById("deceasedIdType")?.value || "IC";
  const rawDeceasedID  = document.getElementById("deceasedIC").value || "";
  if (deceasedIdType === "IC") {
    const clean = rawDeceasedID.replace(/-/g,"");
    if (clean.length !== 12 || isNaN(clean)) {
      document.getElementById("err-deceasedIC").textContent = "No. KP tidak sah / Invalid IC"; valid = false;
    }
  } else if (deceasedIdType === "MyTentera") {
    const foreignVal = formatMyTentera(rawDeceasedID);
    const digitsOnly = foreignVal.replace(/-/g,"");
    if (digitsOnly.length !== 12 || isNaN(digitsOnly)) {
      document.getElementById("err-deceasedIC").textContent = "MyTentera tidak sah / Invalid MyTentera"; valid = false;
    }
  } else {
    const passportNorm = formatPassport(rawDeceasedID);
    if (passportNorm.length < 4) {
      document.getElementById("err-deceasedIC").textContent = "Passport tidak sah / Invalid Passport"; valid = false;
    }
  }
  if (!document.querySelector('input[name="deceasedGender"]:checked')) {
    document.getElementById("err-deceasedGender").textContent = "Sila pilih jantina / Select gender"; valid = false;
  }
  if (!document.getElementById("dateOfPassing").value) {
    document.getElementById("err-dateOfPassing").textContent = "Sila pilih tarikh / Select date"; valid = false;
  }
  if (!document.getElementById("declarationCheck").checked) {
    document.getElementById("err-declaration").textContent = "Sila tandakan pengakuan ini / Please tick this declaration"; valid = false;
  }

  if (valid) showSection("section-c");
});

// ══════════════════════════════════════════════
// SECTION C — Submit
// ══════════════════════════════════════════════
document.getElementById("btnBackC").addEventListener("click", () => showSection("section-b"));

document.getElementById("btnSubmitDeceased").addEventListener("click", async () => {
  const btn    = document.getElementById("btnSubmitDeceased");
  const notice = document.getElementById("submitNotice");
  btn.disabled = true;
  btn.textContent = "Menghantar... / Submitting...";

  try {
    const heirStatus = document.querySelector('input[name="heirStatus"]:checked')?.value;

    // Build heir info
    let heirInfo = { type: heirStatus, relationship: document.getElementById("heirRelationship").value.trim() };
    if (heirStatus === "registered" && heirMemberData) {
      const heirIdType = document.getElementById("heirIdType")?.value || "IC";
      const heirIdentifier =
        heirIdType === "IC"
          ? (heirMemberData.icNo || heirMemberData.sectionA?.icNo || "")
          : (heirMemberData.sectionA?.foreignID || "");
      heirInfo = {
        ...heirInfo,
        name:     (heirMemberData.sectionA?.fullName || heirMemberData.name || "").toUpperCase(),
        ic:       heirIdentifier,
        idType:   heirIdType,
        phone:    heirMemberData.sectionA?.phoneNumber || "",
        uniqueID: heirMemberData.uniqueID || "",
        approved: heirMemberData.approved || false,
      };
    } else {
      const heirManualIdType = document.getElementById("heirManualIdType")?.value || "IC";
      const rawHeirManualIC  = document.getElementById("heirManualIC").value || "";
      const heirIdentifier =
        heirManualIdType === "IC"
          ? rawHeirManualIC.replace(/-/g,"")
          : heirManualIdType === "MyTentera"
            ? formatMyTentera(rawHeirManualIC)
            : formatPassport(rawHeirManualIC);
      heirInfo = {
        ...heirInfo,
        name:    document.getElementById("heirFullName").value.trim().toUpperCase(),
        ic:      heirIdentifier,
        idType:  heirManualIdType,
        phone:   document.getElementById("heirPhone").value.trim(),
        address: document.getElementById("heirAddress").value.trim(),
      };
    }

    const deceasedIdType = document.getElementById("deceasedIdType")?.value || "IC";
    const rawDeceasedID  = document.getElementById("deceasedIC").value || "";
    const deceasedIC =
      deceasedIdType === "IC"
        ? rawDeceasedID.replace(/-/g,"")
        : deceasedIdType === "MyTentera"
          ? formatMyTentera(rawDeceasedID)
          : formatPassport(rawDeceasedID);
    const deceasedRecord = {
      // Section A — Heir
      heirInfo,

      // Section B — Deceased Personal
      deceasedName:    document.getElementById("deceasedFullName").value.trim().toUpperCase(),
      deceasedIC:      deceasedIC,
      deceasedGender:  document.querySelector('input[name="deceasedGender"]:checked')?.value || "",
      deceasedRace:    document.getElementById("deceasedRace").value.trim(),
      deceasedAddress: document.getElementById("deceasedAddress").value.trim(),
      wasRegisteredMember: !!deceasedDocId,
      registeredMemberUID: deceasedMemberData?.uniqueID || "",

      // Section B — Death
      dateOfPassing: document.getElementById("dateOfPassing").value,
      causeOfDeath:  document.getElementById("causeOfDeath").value.trim(),
      graveLot:      document.getElementById("graveLot").value.trim(),

      // Section C — Funeral
      burialDate:     document.getElementById("burialDate").value,
      conductedBy:    document.getElementById("conductedBy").value.trim(),
      conductorPhone: document.getElementById("conductorPhone").value.trim(),
      witnessBy:      document.getElementById("witnessBy").value.trim(),
      witnessPhone:   document.getElementById("witnessPhone").value.trim(),

      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Save to dedicated 'deceased' collection
    await db.collection("deceased").add(deceasedRecord);

    // If deceased was a registered member, also mark them in registrations
    if (deceasedDocId) {
      await db.collection("registrations").doc(deceasedDocId).update({
        deceased:          true,
        deceasedDate:      deceasedRecord.dateOfPassing,
        deceasedGraveLot:  deceasedRecord.graveLot,
        deceasedDeclaredBy: heirInfo.ic || "",
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Show success
    document.getElementById("section-c").style.display = "none";
    document.getElementById("deceasedSuccess").style.display  = "block";
    window.scrollTo({top:0, behavior:"smooth"});

  } catch(e) {
    notice.textContent = "Ralat semasa menghantar / Submission error: " + e.message;
    btn.disabled = false;
    btn.textContent = "Hantar / Submit →";
  }
});
// ══════════════════════════════════════════════
// CHECK DECEASED RECORD — Collapsible card
// ══════════════════════════════════════════════

// Toggle collapse
document.getElementById("btnToggleCheck")?.addEventListener("click", () => {
  const body    = document.getElementById("checkCardBody");
  const chevron = document.getElementById("checkCardChevron");
  const isOpen  = body.style.display !== "none";
  body.style.display    = isOpen ? "none" : "block";
  chevron.style.transform = isOpen ? "" : "rotate(180deg)";
});

// Check button
document.getElementById("btnCheckDeceased")?.addEventListener("click", async () => {
  const query    = document.getElementById("checkDeceasedInput").value.trim();
  const statusEl = document.getElementById("checkDeceasedStatus");
  const resultEl = document.getElementById("checkDeceasedResult");
  const bodyEl   = document.getElementById("checkDeceasedResultBody");

  if (!query) {
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Sila masukkan nama atau No. ID. / Please enter a name or ID number.";
    resultEl.style.display = "none";
    return;
  }

  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "Menyemak... / Checking...";
  resultEl.style.display = "none";

  try {
    const results = [];

    // Detect if input looks like an ID (contains digits, dashes, letters typical of IC/Passport)
    const isIdLike = /\d/.test(query);

    if (isIdLike) {
      // Search by IC (digits only)
      const icClean = query.replace(/[-\s]/g, "");
      if (/^\d{12}$/.test(icClean)) {
        const snap = await db.collection("deceased")
          .where("deceasedIC", "==", icClean).get();
        snap.docs.forEach(d => results.push({ id: d.id, ...d.data() }));
      }
      // Search by foreign ID / Passport (original and cleaned)
      if (!results.length) {
        const snapF = await db.collection("deceased")
          .where("deceasedIC", "==", query.toUpperCase()).get();
        snapF.docs.forEach(d => results.push({ id: d.id, ...d.data() }));
      }
    }

    // Always also search by name (case-insensitive via uppercase)
    if (!results.length) {
      const nameUpper = query.toUpperCase();
      const snapN = await db.collection("deceased")
        .where("deceasedName", "==", nameUpper).get();
      snapN.docs.forEach(d => {
        if (!results.find(r => r.id === d.id)) results.push({ id: d.id, ...d.data() });
      });

      // Partial name fallback — get all and filter client-side
      if (!snapN.docs.length) {
        const snapAll = await db.collection("deceased").get();
        snapAll.docs.forEach(d => {
          const rec = { id: d.id, ...d.data() };
          if ((rec.deceasedName || "").includes(nameUpper) &&
              !results.find(r => r.id === rec.id)) {
            results.push(rec);
          }
        });
      }
    }

    if (!results.length) {
      statusEl.style.color = "var(--text-muted)";
      statusEl.textContent = "Tiada rekod dijumpai. / No record found.";
      resultEl.style.display = "none";
      return;
    }

    // Show result(s)
    statusEl.textContent = "";
    bodyEl.innerHTML = results.map(rec => {
      const heir = rec.heirInfo || {};
      const heirLabel =
        heir.type === "registered"   ? "Ahli Berdaftar / Registered Member" :
        heir.type === "unregistered" ? "Tidak Berdaftar / Unregistered" :
                                       "Orang Luar / Outsider";
      return `
        <div style="${results.length > 1 ? "border-bottom:1px solid var(--border-card);padding-bottom:1rem;margin-bottom:1rem;" : ""}">
          <div style="display:grid;gap:0.4rem;">
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Nama si Mati / Deceased Name:</span>
              <span style="font-weight:700;font-size:0.9rem;">${(rec.deceasedName || "—").toUpperCase()}</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Tarikh Meninggal / Date of Passing:</span>
              <span style="font-size:0.9rem;">${formatDate(rec.dateOfPassing)}</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Tarikh Dikuburkan / Burial Date:</span>
              <span style="font-size:0.9rem;">${formatDate(rec.burialDate)}</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Nombor Lot Kubur / Grave Lot:</span>
              <span style="font-size:0.9rem;">${rec.graveLot || "—"}</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Waris / Heir:</span>
              <span style="font-size:0.9rem;">${(heir.name || "—").toUpperCase()} (${heirLabel})</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Hubungan / Relationship:</span>
              <span style="font-size:0.9rem;">${heir.relationship || "—"}</span>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <span style="font-size:0.82rem;color:var(--text-muted);min-width:160px;">Tarikh Dihantar / Submitted:</span>
              <span style="font-size:0.9rem;">${formatDate(rec.submittedAt)}</span>
            </div>
          </div>
        </div>`;
    }).join("");

    resultEl.style.display = "block";

    if (results.length > 1) {
      statusEl.style.color = "var(--marigold)";
      statusEl.textContent = `${results.length} rekod dijumpai / ${results.length} records found.`;
    }

  } catch(e) {
    console.error(e);
    statusEl.style.color = "#E05555";
    statusEl.textContent = "Ralat semasa menyemak. / Error while checking.";
  }
});

// Allow pressing Enter in the search field
document.getElementById("checkDeceasedInput")?.addEventListener("keydown", function(e) {
  if (e.key === "Enter") document.getElementById("btnCheckDeceased")?.click();
});