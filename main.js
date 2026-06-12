/* ═══════════════════════════════════════════════
   BEM On The Rock — main.js  v2.1
═══════════════════════════════════════════════ */

"use strict";

// ── DOM Ready ──────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  buildYearDropdown();
  buildBaptismYearPicker();
  setFooterYear();

  // Only restore draft for fresh registrations — never in edit mode
  // (edit mode loads from Firestore, not localStorage)
  if (!IS_EDIT_MODE) {
    loadDraft();
  }

  bindEvents();
  bindPhotoUpload();
  bindMaritalStatus();
  bindKomselValidation();
  initBehalfMode();
  initAffiliatedMode();
  initPartnerAddressModal();
  if (IS_EDIT_MODE) initEditMode();

  // In edit mode: clear drafts if user navigates away (tab close, back button etc.)
  if (IS_EDIT_MODE) {
    window.addEventListener("beforeunload", () => {
      ["bem_otr_draft_sectionA","bem_otr_draft_sectionB","bem_otr_draft_sectionC"]
        .forEach(k => localStorage.removeItem(k));
    });
  }

  // Affiliated autofill modal buttons
  document.getElementById("btnAffiliatedYes")?.addEventListener("click", () => {
    if (affiliatedFoundData) applyAffiliatedAutofill(affiliatedFoundData);
    document.getElementById("affiliatedAutofillModal").style.display = "none";
    affiliatedFoundData = null;
  });
  document.getElementById("btnAffiliatedNo")?.addEventListener("click", () => {
    document.getElementById("affiliatedAutofillModal").style.display = "none";
    affiliatedFoundData = null;
  });
  document.getElementById("closeAffiliatedModal")?.addEventListener("click", () => {
    document.getElementById("affiliatedAutofillModal").style.display = "none";
    affiliatedFoundData = null;
  });
});

// ═══════════════════════════════════════════════
// 1. YEAR DROPDOWN — 2001 to current year (descending)
// ═══════════════════════════════════════════════
function buildYearDropdown() {
  const select = document.getElementById("yearJoining");
  if (!select) return;
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= 2001; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  }
}

// ═══════════════════════════════════════════════
// 1b. BAPTISM YEAR — simple number input
// ═══════════════════════════════════════════════
function buildBaptismYearPicker() {
  // No picker needed — using plain number input now
  // Just auto-populate with current year as placeholder hint
}

// ═══════════════════════════════════════════════
// 1c. FOOTER YEAR
// ═══════════════════════════════════════════════
function setFooterYear() {
  const el = document.getElementById("footerYear");
  if (el) el.textContent = new Date().getFullYear();
}

// ═══════════════════════════════════════════════
// 1d. PHOTO UPLOAD
// ═══════════════════════════════════════════════
let photoDataURL = null;

// ── Client-side image compression: center crop + 60% JPEG quality ──
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Center crop to square
      const size = Math.min(img.width, img.height);
      const sx   = (img.width  - size) / 2;
      const sy   = (img.height - size) / 2;

      // Target output size (passport photo ratio 3:4 — scale to 300×400)
      const OUT_W = 300, OUT_H = 400;

      const canvas = document.createElement("canvas");
      canvas.width  = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d");
      // Draw center-cropped, scaled
      ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT_W, OUT_H);

      canvas.toBlob((blob) => {
        const compressedReader = new FileReader();
        compressedReader.onload = (ev) => callback(ev.target.result);
        compressedReader.readAsDataURL(blob);
      }, "image/jpeg", 0.6); // 60% quality
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function bindPhotoUpload() {
  const input      = document.getElementById("photoUpload");
  const preview    = document.getElementById("photoPreviewImg");
  const previewWrap= document.getElementById("photoPreviewWrap");
  const label      = document.getElementById("photoUploadLabel");
  const changeBtn  = document.getElementById("photoChangeBtn");
  const errEl      = document.getElementById("err-photo");
  if (!input) return;

  input.addEventListener("change", function() {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      errEl.textContent = "Saiz fail melebihi 4MB / File size exceeds 4MB";
      return;
    }
    errEl.textContent = "Memproses gambar... / Processing image...";
    compressImage(file, (dataURL) => {
      photoDataURL = dataURL;
      preview.src  = photoDataURL;
      previewWrap.classList.add("visible");
      label.style.display = "none";
      errEl.textContent = "";
      saveDraft();
    });
  });

  changeBtn?.addEventListener("click", () => {
    photoDataURL = null;
    preview.src  = "";
    previewWrap.classList.remove("visible");
    label.style.display = "";
    input.value = "";
  });
}

// ═══════════════════════════════════════════════
// 1e. MARITAL STATUS CONDITIONALS
// ═══════════════════════════════════════════════
function bindMaritalStatus() {
  const select = document.getElementById("maritalStatus");
  if (!select) return;
  select.addEventListener("change", function() {
    const partnerField     = document.getElementById("partnerNameField");
    const latePartnerField = document.getElementById("latePartnerNameField");
    const v = this.value;
    partnerField?.classList.toggle("visible",     v === "engaged" || v === "married");
    latePartnerField?.classList.toggle("visible", v === "widowed");
    if (v !== "engaged" && v !== "married") document.getElementById("partnerName").value = "";
    if (v !== "widowed") document.getElementById("latePartnerName").value = "";
    saveDraft();
    checkNextButton();
  });
}

// ═══════════════════════════════════════════════
// PARTNER AUTO-FILL SYSTEM
// When person B fills the form:
// 1. Scan registrations for a record whose partnerName matches person B's name or IC
// 2. If found, auto-fill marital status + partner name
// 3. When address field is focused, ask if they share the same address
// ═══════════════════════════════════════════════
let partnerFoundData  = null; // the partner's registration data
let partnerAddressPending = false;

async function checkPartnerMatch(type, value) {
  if (!value || value.length < 2) return;
  try {
    let snap;
    if (type === "name") {
      const upper = value.toUpperCase();
      snap = await db.collection("registrations")
        .where("sectionA.partnerName", "==", upper)
        .limit(1).get();
    } else {
      return; // IC approach handled via name blur
    }

    if (!snap || snap.empty) return;

    const doc = snap.docs[0];
    const reg = doc.data();
    const ms  = reg.sectionA?.maritalStatus;
    if (ms !== "engaged" && ms !== "married") return;

    // Include sectionC children from the matched partner
    const partnerChildren = (reg.sectionC?.children || []).filter(c => c.name?.trim() && c.gender);

    partnerFoundData = {
      ...reg.sectionA,
      docId:           doc.id,
      memberName:      reg.name,
      sectionCChildren: partnerChildren,
    };
    applyPartnerAutofill();
  } catch(e) { /* silent */ }
}

function applyPartnerAutofill() {
  if (!partnerFoundData) return;
  const ms = partnerFoundData.maritalStatus;
  if (ms !== "engaged" && ms !== "married") return;

  // Set marital status
  const msEl = document.getElementById("maritalStatus");
  if (msEl) {
    msEl.value = ms;
    msEl.dispatchEvent(new Event("change"));
  }

  // Set partner name (which is the person who already registered)
  const pnEl = document.getElementById("partnerName");
  if (pnEl) {
    pnEl.value = (partnerFoundData.fullName || partnerFoundData.memberName || "").toUpperCase();
  }

  // Pre-fill Section C children if partner has children and current draft is empty
  const existingDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionC") || "{}");
  const existingKids  = (existingDraft.children || []).filter(c => c.name?.trim() && c.gender);

  if (existingKids.length === 0 && partnerFoundData.sectionCChildren?.length > 0) {
    // Store in draft so Section C renders them when user navigates there
    const childDraft = { children: partnerFoundData.sectionCChildren };
    localStorage.setItem("bem_otr_draft_sectionC", JSON.stringify(childDraft));
    // If Section C is already rendered, re-render it
    if (typeof renderChildCards === "function") renderChildCards(partnerFoundData.sectionCChildren);
  }

  saveDraft();
  checkNextButton();
}

function showPartnerAddressModal() {
  if (!partnerFoundData) return;
  document.getElementById("partnerModalName").textContent =
    (partnerFoundData.fullName || partnerFoundData.memberName || "—").toUpperCase();
  document.getElementById("partnerModalAddress").textContent =
    partnerFoundData.currentAddress || "—";
  document.getElementById("partnerAddressModal").style.display = "flex";
}

function initPartnerAddressModal() {
  document.getElementById("btnPartnerAddressYes")?.addEventListener("click", () => {
    if (partnerFoundData?.currentAddress) {
      const addrEl = document.getElementById("currentAddress");
      if (addrEl) {
        addrEl.value = partnerFoundData.currentAddress;
        addrEl.dispatchEvent(new Event("input"));
      }
    }
    document.getElementById("partnerAddressModal").style.display = "none";
    partnerAddressPending = false;
    saveDraft();
    checkNextButton();
  });

  document.getElementById("btnPartnerAddressNo")?.addEventListener("click", () => {
    document.getElementById("partnerAddressModal").style.display = "none";
    partnerAddressPending = false;
  });

  document.getElementById("closePartnerAddressModal")?.addEventListener("click", () => {
    document.getElementById("partnerAddressModal").style.display = "none";
    partnerAddressPending = false;
  });

  // Show address modal when currentAddress is focused (only once after partner found)
  document.getElementById("currentAddress")?.addEventListener("focus", function() {
    if (partnerFoundData && !partnerAddressPending && !this.value.trim()) {
      partnerAddressPending = true;
      showPartnerAddressModal();
    }
  });
}

// ═══════════════════════════════════════════════
// 1f. VALID CELL GROUP CODES
// ═══════════════════════════════════════════════
const VALID_CELL_CODES = (() => {
  const codes = [];
  const add = (prefix, max) => {
    for (let i = 1; i <= max; i++) codes.push(prefix + i);
  };
  add("ZSN", 15); add("ZVA", 15); add("ZVB", 15); add("ZPA", 7); add("ZPB", 8);
  add("ZPC", 10); add("ZPD", 9); add("ZT", 15); add("ZSA", 10);
  add("ZSB", 15); add("ZC", 5); add("ZTC", 15); add("ZSC", 15); add("THECHAMPS");
  return codes;
})();

// ── Normalise a komsel code for comparison ──
// Strips spaces, hyphens, uppercases, and removes leading zeros from the number
// e.g. "ZT 06", "ZT-06", "ZT06", "zt6" all → "ZT6"
function normaliseKomsel(val) {
  // 1. Uppercase, remove spaces and hyphens
  const clean = val.toUpperCase().replace(/[\s\-]/g, "");
  // 2. Split into letter prefix and numeric suffix
  const match = clean.match(/^([A-Z]+)(\d+)$/);
  if (!match) return clean; // can't parse — return as-is
  let prefix = match[1];
  const num  = parseInt(match[2], 10); // parseInt strips leading zeros
  // 3. Auto-prepend Z if missing (e.g. SA1 → ZSA1, T6 → ZT6)
  if (!prefix.startsWith("Z")) prefix = "Z" + prefix;
  return prefix + num; // e.g. "ZT" + 6 = "ZT6"
}

function isValidKomsel(val) {
  const norm = normaliseKomsel(val);
  return VALID_CELL_CODES.some(c => normaliseKomsel(c) === norm);
}

function bindKomselValidation() {
  const input = document.getElementById("komselCode");
  const badge = document.getElementById("komselValidBadge");
  if (!input || !badge) return;
  input.addEventListener("input", function() {
    this.value = this.value.toUpperCase();
    const val  = this.value.trim();
    if (!val) { badge.className = "komsel-valid-badge"; return; }
    if (isValidKomsel(val)) {
      badge.className = "komsel-valid-badge valid";
      badge.textContent = "✓ Kod sah / Valid code";
    } else {
      badge.className = "komsel-valid-badge invalid";
      badge.textContent = "✗ Kod tidak sah / Invalid code";
    }
    saveDraft();
    checkNextButton();
  });
}

// ═══════════════════════════════════════════════
// 1g. UNIQUE ID GENERATION
// Format: Initials-Last4IC-YearJoinedShort
// ═══════════════════════════════════════════════
function generateUniqueID(fullName, idType, icNo, yearJoining, foreignID) {
  const names    = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const initials = names.map(n => n[0].toUpperCase()).join("");
  const yr       = String(yearJoining || "").slice(-2);

  if (idType === "Passport") {
    // Unique ID format: AAA-XXXX-##
    // XXXX = first 4 alphanumeric chars of the passport number
    const passportNorm = String(foreignID || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const first4 = passportNorm.slice(0, 4).padEnd(4, "0");
    return `${initials}-${first4}-${yr}`;
  }

  // IC & MyTentera: preserve existing logic (last 4 chars approach)
  const ic = (icNo || "").replace(/-/g, "");
  // For non-citizens with no IC, use last 4 chars of foreignID instead
  const idSource = ic.length >= 4 ? ic : (foreignID || "").replace(/\s+/g, "");
  const last4    = idSource.length >= 4 ? idSource.slice(-4) : idSource.padStart(4, "0");
  return `${initials}-${last4}-${yr}`;
}

// ═══════════════════════════════════════════════
// 1h. BEHALF MODE — conditional rendering
// ═══════════════════════════════════════════════
const IS_BEHALF_MODE     = new URLSearchParams(window.location.search).get("mode") === "behalf";
const IS_AFFILIATED_MODE = new URLSearchParams(window.location.search).get("mode") === "affiliated";
const IS_EDIT_MODE       = new URLSearchParams(window.location.search).get("mode") === "edit";
const EDIT_DOC_ID        = new URLSearchParams(window.location.search).get("docId") || "";

// ═══════════════════════════════════════════════
// 1j. AFFILIATED MEMBER AUTOFILL (for main registration)
// ═══════════════════════════════════════════════
let affiliatedFoundData = null;

async function checkAffiliatedMatch(type, value) {
  if (IS_AFFILIATED_MODE) return; // don't check when already in affiliated mode
  try {
    let snap;
    if (type === "ic") {
      snap = await db.collection("affiliatedMembers").where("icNo","==",value).limit(1).get();
    } else {
      snap = await db.collection("affiliatedMembers")
        .where("name","==",value.toUpperCase()).limit(1).get();
    }
    if (snap && !snap.empty) {
      affiliatedFoundData = snap.docs[0].data();
      document.getElementById("affiliatedAutofillModal").style.display = "flex";
    }
  } catch(e) { /* silent */ }
}

function applyAffiliatedAutofill(data) {
  const a = data.sectionA || {};
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
  setVal("fullName",      a.fullName);
  setVal("icNo",          a.icNo ? a.icNo.replace(/(\d{6})(\d{2})(\d{4})/,"$1-$2-$3") : "");
  setVal("phoneNumber",   a.phoneNumber);
  setVal("occupation",    a.occupation);
  setVal("dob",           a.dob);
  setVal("race",          a.race);
  setVal("currentAddress",a.currentAddress);
  setVal("originalChurch",a.originalChurch);
  if (a.yearJoining) setVal("yearJoining", a.yearJoining);

  // Gender
  if (a.gender) {
    const gEl = document.querySelector(`input[name="gender"][value="${a.gender}"]`);
    if (gEl) gEl.checked = true;
  }
  // Marital status
  if (a.maritalStatus) {
    const msEl = document.getElementById("maritalStatus");
    if (msEl) { msEl.value = a.maritalStatus; msEl.dispatchEvent(new Event("change")); }
  }
  // Baptism
  if (a.baptismStatus) {
    const bEl = document.querySelector(`input[name="baptismStatus"][value="${a.baptismStatus}"]`);
    if (bEl) { bEl.checked = true; bEl.dispatchEvent(new Event("change")); }
    if (a.baptismYear) setVal("baptismYear", a.baptismYear);
  }
  // Citizenship
  if (a.citizenship) {
    const cEl = document.querySelector(`input[name="citizenship"][value="${a.citizenship}"]`);
    if (cEl) { cEl.checked = true; cEl.dispatchEvent(new Event("change")); }
  }
  // Photo
  if (data.photoURL) {
    photoDataURL = data.photoURL;
    const preview = document.getElementById("photoPreviewImg");
    const wrap    = document.getElementById("photoPreviewWrap");
    const label   = document.getElementById("photoUploadLabel");
    if (preview) preview.src = data.photoURL;
    if (wrap)    wrap.classList.add("visible");
    if (label)   label.style.display = "none";
  }
  saveDraft();
  checkNextButton();
}

function initBehalfMode() {
  if (!IS_BEHALF_MODE) return;

  const behalfSections = document.getElementById("behalfSections");
  if (behalfSections) behalfSections.style.display = "block";

  // Show registrant info
  const regIC   = sessionStorage.getItem("behalf_registrant_ic")   || "";
  const regName = sessionStorage.getItem("behalf_registrant_name") || "";
  const display = document.getElementById("behalfRegistrantDisplay");
  if (display) display.textContent = regName ? `${regName} (${regIC})` : regIC;

  // Change Full Name label
  const lbl = document.getElementById("fullNameLabel");
  if (lbl) lbl.innerHTML = `Nama Penuh Yang Ingin Didaftar <span class="label-en">/ Name Of The One To Be Registered</span>`;

  // Change header subtitle
  const subtitle = document.querySelector(".church-subtitle");
  if (subtitle) subtitle.textContent = "Pendaftaran Bagi Pihak Orang Lain / Registration On Others' Behalf";

  // Behalf reason — show/hide "other reason" field
  document.querySelectorAll('input[name="behalfReason"]').forEach(r => {
    r.addEventListener("change", function() {
      const otherField = document.getElementById("behalfOtherReasonField");
      if (this.value === "others") {
        otherField.classList.add("visible");
      } else {
        otherField.classList.remove("visible");
        const inp = document.getElementById("behalfOtherReason");
        if (inp) inp.value = "";
      }
    });
  });
}

// ═══════════════════════════════════════════════
// 1i. AFFILIATED MODE
// Sections A–C only, hide role/komsel fields,
// show alternate success message
// ═══════════════════════════════════════════════
function initAffiliatedMode() {
  if (!IS_AFFILIATED_MODE) return;

  // Update page subtitle
  const subtitle = document.querySelector(".church-subtitle");
  if (subtitle) subtitle.textContent = "Pendaftaran Jemaat Bersekutu / Affiliated Member Registration";

  // Hide member role (position) section
  const roleBox = document.querySelector(".member-role-box");
  if (roleBox) roleBox.style.display = "none";

  // Hide cell group code field
  const komselGroup = document.getElementById("komselCode")?.closest(".form-group");
  if (komselGroup) komselGroup.style.display = "none";
  const komselBadge = document.getElementById("komselValidBadge");
  if (komselBadge) komselBadge.style.display = "none";

  // Hide Sections D and E nav steps + sections
  const stepD = document.querySelector('.step[data-section="d"]');
  const stepE = document.querySelector('.step[data-section="e"]');
  if (stepD) stepD.style.display = "none";
  if (stepE) stepE.style.display = "none";

  const sectionD = document.getElementById("section-d");
  const sectionE = document.getElementById("section-e");
  if (sectionD) sectionD.style.display = "none";
  if (sectionE) sectionE.style.display = "none";

  // Update eligibility notice
  const eligBm = document.querySelector(".eligibility-bm strong");
  const eligEn = document.querySelector(".eligibility-en strong");
  if (eligBm) eligBm.textContent = "Nota: Borang ini adalah untuk Jemaat Bersekutu;";
  if (eligEn) eligEn.textContent = "Note: This form is for Affiliated Church Members;";

  // Update Next C → submit directly (skip D & E)
  const btnNextC = document.getElementById("btnNextC");
  if (btnNextC) {
    btnNextC.textContent = "Hantar / Submit →";
    btnNextC.onclick = async (e) => {
      e.preventDefault();
      await submitAffiliatedForm();
    };
  }
}

async function submitAffiliatedForm() {
  const btn = document.getElementById("btnNextC");
  if (btn) { btn.disabled = true; btn.textContent = "Menghantar... / Submitting..."; }

  try {
    const sectionADraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionA") || "{}");
    const sectionBDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionB") || "{}");
    const sectionCDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionC") || "{}");
    const inferIdType = (s) => {
      if (s.idType) return s.idType;
      if (s.citizenship === "citizen") return "IC";
      const fid = String(s.foreignID || "");
      if (/[A-Za-z]/.test(fid)) return "Passport";
      const digitsOnly = fid.replace(/\D/g, "");
      if (digitsOnly.length === 12) return "MyTentera";
      return "Passport";
    };
    const idType = inferIdType(sectionADraft);
    const isNonCitizen = idType !== "IC";
    const icVal = idType === "IC" ? (sectionADraft.icNo || "").replace(/-/g,"") : "";

    // Duplicate check by identifier type
    if (idType === "IC" && icVal) {
      const snap = await db.collection("affiliatedMembers").where("icNo","==",icVal).get();
      if (!snap.empty) {
        alert("No. KP ini sudah berdaftar. / This IC is already registered.");
        if (btn) { btn.disabled=false; btn.textContent="Hantar / Submit →"; }
        return;
      }
    } else if (isNonCitizen) {
      const foreignVal = idType === "MyTentera" ? formatMyTentera(sectionADraft.foreignID) :
                        idType === "Passport"  ? formatPassport(sectionADraft.foreignID) :
                        sectionADraft.foreignID;
      if (foreignVal) {
        const snapForeign = await db.collection("affiliatedMembers")
          .where("sectionA.foreignID","==",foreignVal).get();
        if (!snapForeign.empty) {
          alert("Identifier ini sudah wujud. / This identifier is already registered.");
          if (btn) { btn.disabled=false; btn.textContent="Hantar / Submit →"; }
          return;
        }
      }
    }

    const uid = generateUniqueID(sectionADraft.fullName, idType, icVal, sectionADraft.yearJoining, sectionADraft.foreignID);

    const data = {
      name:        (sectionADraft.fullName || "").toUpperCase(),
      icNo:        icVal,
      uniqueID:    uid,
      memberType:  "affiliated",
      photoURL:    photoDataURL || "",
      sectionA: {
        fullName:        (sectionADraft.fullName || "").toUpperCase(),
        icNo:            icVal,
        idType:          idType,
        gender:          sectionADraft.gender || "",
        dob:             sectionADraft.dob || "",
        race:            sectionADraft.race || "",
        maritalStatus:   sectionADraft.maritalStatus || "",
        partnerName:     sectionADraft.partnerName || "",
        latePartnerName: sectionADraft.latePartnerName || "",
        baptismStatus:   sectionADraft.baptismStatus || "",
        baptismYear:     sectionADraft.baptismYear || "",
        citizenship:     sectionADraft.citizenship || "",
        countryOfOrigin: sectionADraft.countryOfOrigin || "",
        foreignID:       sectionADraft.foreignID       || "",
        phoneNumber:     sectionADraft.phoneNumber || "",
        occupation:      sectionADraft.occupation || "",
        originalChurch:  sectionADraft.originalChurch || "",
        yearJoining:     sectionADraft.yearJoining || "",
        currentAddress:  sectionADraft.currentAddress || "",
      },
      sectionB: {
        services:          sectionBDraft.services || {},
        othersChecked:     sectionBDraft.othersChecked || false,
        othersServiceName: sectionBDraft.othersServiceName || "",
        othersInvolvement: sectionBDraft.othersInvolvement || "",
      },
      sectionC: { children: sectionCDraft.children || [] },
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("affiliatedMembers").add(data);

    // Clear drafts
    ["bem_otr_draft_sectionA","bem_otr_draft_sectionB","bem_otr_draft_sectionC"]
      .forEach(k => localStorage.removeItem(k));

    showAffiliatedSuccessPage();

  } catch(e) {
    alert("Ralat / Error: " + e.message);
    if (btn) { btn.disabled=false; btn.textContent="Hantar / Submit →"; }
  }
}

function showAffiliatedSuccessPage() {
  // Hide all sections
  document.querySelectorAll(".form-section").forEach(s => s.style.display="none");
  document.querySelector(".step-nav")?.style && (document.querySelector(".step-nav").style.display = "none");

  const successDiv = document.getElementById("successPage");
  if (successDiv) {
    successDiv.style.display = "block";
    // Replace title and message for affiliated
    const title = successDiv.querySelector(".success-title");
    const titleEn = successDiv.querySelector(".success-title-en");
    const msg    = successDiv.querySelector(".success-msg");
    const msgEn  = successDiv.querySelector(".success-msg-en");
    if (title)   title.textContent   = "Maklumat Berjaya Direkodkan!";
    if (titleEn) titleEn.textContent = "Successfully Recorded Your Information!";
    if (msg)     msg.textContent     = "Maklumat anda telah berjaya direkodkan dalam pangkalan data gereja.";
    if (msgEn)   msgEn.textContent   = "Your information has been successfully recorded into the church's database.";
    // Remove payment reminder for affiliated members
    const payReminder = successDiv.querySelector("div[style*='rgba(255,140,0']");
    if (payReminder) payReminder.remove();
  }
}


// ═══════════════════════════════════════════════
// EDIT MODE — load existing member data into form
// Activated via ?mode=edit&docId=XXX
// ═══════════════════════════════════════════════
let editOriginalData = null; // snapshot of data before edits
let editModeChildren = [];  // children pre-loaded from Firestore for edit mode

async function initEditMode() {
  if (!EDIT_DOC_ID) { console.warn("Edit mode: no docId"); return; }

  // ── Clear ALL localStorage drafts immediately ──
  // Edit mode loads from Firestore only. This prevents a previous user's
  // edit session from leaking into the next person's fresh registration.
  ["bem_otr_draft_sectionA","bem_otr_draft_sectionB","bem_otr_draft_sectionC"]
    .forEach(k => localStorage.removeItem(k));

  // Update UI for edit context
  const subtitle = document.querySelector(".church-subtitle");
  if (subtitle) subtitle.textContent = "Kemas Kini Maklumat / Update Information";

  // Hide eligibility notice (not relevant in edit mode)
  const eligNotice = document.querySelector(".eligibility-notice");
  if (eligNotice) eligNotice.style.display = "none";

  // Hide the back-to-home button, replace with back link
  const backBtn = document.querySelector(".back-home-btn");
  if (backBtn) {
    backBtn.textContent = "← Kembali / Back";
    backBtn.href = "javascript:history.back()";
  }

  // Replace submit button text
  const btnSubmit = document.getElementById("btnSubmit");
  if (btnSubmit) btnSubmit.textContent = "Semak Perubahan / Review Changes →";

  try {
    // Load member data from Firestore
    const doc = await db.collection("registrations").doc(EDIT_DOC_ID).get();
    if (!doc.exists) { alert("Rekod tidak dijumpai / Record not found."); return; }
    editOriginalData = doc.data();
    populateFormWithData(editOriginalData);
  } catch(e) {
    alert("Ralat memuatkan data / Error loading data: " + e.message);
  }
}

function populateFormWithData(data) {
  const a = data.sectionA || {};
  const b = data.sectionB || {};
  const c = data.sectionC || {};
  const d = data.sectionD || {};
  const e = data.sectionE || {};

  // ── Section A ──
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
  const setRadio = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) { el.checked = true; el.dispatchEvent(new Event("change")); } };
  const setCheck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

  setVal("fullName", a.fullName || data.name || "");
  const inferIdType = (sectionA) => {
    if (sectionA?.idType) return sectionA.idType;
    if (sectionA?.citizenship === "citizen") return "IC";
    const fid = String(sectionA?.foreignID || "");
    if (/[A-Za-z]/.test(fid)) return "Passport";
    const digitsOnly = fid.replace(/\D/g, "");
    if (digitsOnly.length === 12) return "MyTentera";
    return "Passport";
  };
  const idType = inferIdType(a);
  setVal("idType", idType);

  // IC / Identifier — format for UI based on type
  if (idType === "IC") {
    if (a.icNo) {
      const ic = a.icNo.replace(/(\d{6})(\d{2})(\d{4})/, "$1-$2-$3");
      setVal("icNo", ic);
    } else {
      setVal("icNo", "");
    }
    setVal("countryOfOrigin", "");
  } else if (idType === "MyTentera") {
    setVal("icNo", a.foreignID ? formatMyTentera(a.foreignID) : "");
    setVal("countryOfOrigin", a.countryOfOrigin || "");
  } else {
    // Passport
    setVal("icNo", a.foreignID ? formatPassport(a.foreignID) : "");
    setVal("countryOfOrigin", a.countryOfOrigin || "");
  }
  setVal("dob",            a.dob || "");
  setVal("race",           a.race || "");
  setVal("occupation",     a.occupation || "");
  setVal("phoneNumber",    a.phoneNumber || "");
  setVal("originalChurch", a.originalChurch || "");
  setVal("currentAddress", a.currentAddress || "");
  setVal("baptismYear",    a.baptismYear || "");

  // Year joining dropdown
  const yjEl = document.getElementById("yearJoining");
  if (yjEl && a.yearJoining) yjEl.value = a.yearJoining;

  // Gender
  if (a.gender) setRadio("gender", a.gender);

  // Baptism status
  if (a.baptismStatus) {
    setRadio("baptismStatus", a.baptismStatus);
    if (a.baptismStatus === "baptised") {
      const bf = document.getElementById("baptismDateField");
      if (bf) bf.style.display = "flex";
      const spacer = document.getElementById("baptismYearSpacer");
      if (spacer) spacer.style.display = "none";
    }
  }

  // Citizenship
  // idType change handler will sync citizenship + enable/disable fields
  document.getElementById("idType")?.dispatchEvent(new Event("change"));

  // Marital status
  if (a.maritalStatus) {
    setVal("maritalStatus", a.maritalStatus);
    document.getElementById("maritalStatus")?.dispatchEvent(new Event("change"));
    setVal("partnerName",     a.partnerName || "");
    setVal("latePartnerName", a.latePartnerName || "");
  }

  // Member role (komsel position)
  if (a.memberRole) setRadio("memberRole", a.memberRole);

  // Komsel code
  if (a.komselCode) setVal("komselCode", a.komselCode);

  // Photo
  if (data.photoURL) {
    photoDataURL = data.photoURL;
    const preview = document.getElementById("photoPreviewImg");
    const wrap    = document.getElementById("photoPreviewWrap");
    const label   = document.getElementById("photoUploadLabel");
    if (preview) preview.src = data.photoURL;
    if (wrap)    wrap.classList.add("visible");
    if (label)   label.style.display = "none";
  }

  // ── Section B — Services (index-based checkboxes) ──
  const svcs = b.services || {};
  SERVICES.forEach((_, i) => {
    const num    = i + 1;
    const key    = `svc_${num}`;
    const haveEl = document.getElementById(`svc-have-${num}`);
    const wantEl = document.getElementById(`svc-want-${num}`);
    if (haveEl && svcs[key]?.current) haveEl.checked = true;
    if (wantEl && svcs[key]?.join)    wantEl.checked = true;
  });

  // ── Section C — Children ──
  // Store in a module-level variable; Section C will read this when it renders
  // (can't use localStorage in edit mode since it gets cleared)
  const children = (c.children || []).filter(ch => ch.name?.trim() && ch.gender);
  editModeChildren = children;
  renderChildCards(editModeChildren);
  if (!editModeChildren.length) addChild();

  // ── Section D — make read-only (not editable) ──
  makeReadOnly("section-d");

  // Populate Section E fields with existing data
  if (e.komsel) setVal("confessionKomsel", e.komsel);
  if (e.since)  setVal("confessionSince",  e.since);
  if (e.leader) setVal("confessionLeader", e.leader);
  if (e.name)   setVal("confessionName",   e.name);
  if (e.date)   setVal("confessionDate",   e.date);

  // Populate Section D pledge checkboxes as checked + disabled
  if (d.pledgeAgreed) {
    document.querySelectorAll('#section-d input[type="checkbox"]').forEach(cb => {
      cb.checked = true; cb.disabled = true;
    });
  }

  // Navigate to section A to start editing
  navigateTo("a");
}

function makeReadOnly(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.querySelectorAll("input, textarea, select").forEach(el => {
    el.disabled = true;
    el.style.opacity = "0.6";
    el.style.cursor  = "not-allowed";
  });
}

// ── Override submit in edit mode — show diff modal instead ──
// (wired in submit handler below)

// ── EDIT MODE FIELD LABELS for diff ──
const EDIT_FIELD_LABELS = {
  fullName:"Nama Penuh", icNo:"No. KP", gender:"Jantina", dob:"Tarikh Lahir",
  race:"Bangsa", phoneNumber:"No. Telefon", occupation:"Pekerjaan",
  maritalStatus:"Status Perkahwinan", partnerName:"Nama Pasangan",
  latePartnerName:"Nama Allahyarham", baptismStatus:"Status Pembaptisan",
  baptismYear:"Tahun Pembaptisan", citizenship:"Warganegara",
  countryOfOrigin:"Negara Asal", foreignID:"Nombor ID",
  originalChurch:"Gereja Asal", yearJoining:"Tahun Menyertai",
  memberRole:"Jawatan Komsel", komselCode:"Kod Komsel", currentAddress:"Alamat",
};

function collectCurrentFormData() {
  // In edit mode, saveDraft() is disabled so localStorage is always empty.
  // Read directly from the live DOM instead.
  const oldA = editOriginalData?.sectionA || {};

  const getVal = (id) => document.getElementById(id)?.value?.trim() || "";
  const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";
  const idType = getVal("idType") || oldA.idType || "IC";

  const newA = {
    fullName:       (getVal("fullName") || oldA.fullName || "").toUpperCase(),
    idType,
    icNo:           idType === "IC"
                      ? (getVal("icNo") || "").replace(/-/g,"") || oldA.icNo || ""
                      : "",
    gender:         getRadio("gender")          || oldA.gender          || "",
    dob:            getVal("dob")               || oldA.dob             || "",
    race:           getVal("race")              || oldA.race            || "",
    phoneNumber:    getVal("phoneNumber")        || oldA.phoneNumber     || "",
    occupation:     getVal("occupation")         || oldA.occupation      || "",
    maritalStatus:  getVal("maritalStatus")      || oldA.maritalStatus   || "",
    partnerName:    (getVal("partnerName")       || oldA.partnerName     || "").toUpperCase(),
    latePartnerName:(getVal("latePartnerName")   || oldA.latePartnerName || "").toUpperCase(),
    baptismStatus:  getRadio("baptismStatus")   || oldA.baptismStatus   || "",
    baptismYear:    getVal("baptismYear")        || oldA.baptismYear     || "",
    citizenship:    idType === "IC" ? "citizen" : "nonCitizen",
    countryOfOrigin:idType === "IC" ? "" : (getVal("countryOfOrigin")   || oldA.countryOfOrigin || ""),
    foreignID:      idType === "IC"
                      ? ""
                      : (idType === "MyTentera"
                          ? (getVal("icNo") ? formatMyTentera(getVal("icNo")) : oldA.foreignID || "")
                          : (getVal("icNo") ? formatPassport(getVal("icNo")) : oldA.foreignID || "")),
    originalChurch: getVal("originalChurch")     || oldA.originalChurch  || "",
    yearJoining:    getVal("yearJoining")        || oldA.yearJoining     || "",
    memberRole:     getRadio("memberRole")       || oldA.memberRole      || "",
    komselCode:     (getVal("komselCode")        || oldA.komselCode      || "").toUpperCase(),
    currentAddress: document.getElementById("currentAddress")?.value?.trim() || oldA.currentAddress || "",
  };

  // Section B — read from live checkboxes using index-based IDs
  const newServices = JSON.parse(JSON.stringify((editOriginalData?.sectionB || {}).services || {}));
  SERVICES.forEach((_, i) => {
    const num     = i + 1;
    const haveEl  = document.getElementById(`svc-have-${num}`);
    const wantEl  = document.getElementById(`svc-want-${num}`);
    if (!haveEl && !wantEl) return;
    const key = `svc_${num}`;
    if (!newServices[key]) newServices[key] = {};
    if (haveEl) newServices[key].current = haveEl.checked;
    if (wantEl) newServices[key].join    = wantEl.checked;
  });

  // Section C — read from live child cards
  const newChildren = [];
  document.querySelectorAll(".child-card").forEach(card => {
    const num    = card.dataset.childNum;
    const name   = card.querySelector(`[id^="childName-"]`)?.value?.trim() || "";
    const gender = card.querySelector(`input[name="childGender-${num}"]:checked`)?.value || "";
    const myKid  = card.querySelector(`[id^="childMyKid-"]`)?.value || "";
    const ageEl  = card.querySelector(`[id^="childAge-"]`);
    const age    = ageEl ? parseInt(ageEl.value) || "" : "";
    if (name && gender) newChildren.push({ name, gender, myKid, age });
  });

  return { newA, newServices, newChildren };
}

async function submitEditMode() {
  const { newA, newServices, newChildren } = collectCurrentFormData();
  const oldA = editOriginalData?.sectionA || {};
  const oldB = editOriginalData?.sectionB || {};
  const oldC = editOriginalData?.sectionC || {};

  // Build diff
  const changes = [];
  Object.keys(EDIT_FIELD_LABELS).forEach(key => {
    const before = String(oldA[key] || "").trim();
    const after  = String(newA[key] || "").trim();
    if (before !== after) changes.push({ section:"A — Peribadi", field:EDIT_FIELD_LABELS[key], before:before||"—", after:after||"—" });
  });

  // Services diff
  const SERVICE_NAMES_EDIT = ["worship","prayer","multimedia","hospitality","children","youth",
    "evangelism","transport","music","ushering","sound","cleaning","finance","pastoral",
    "security","photography","decoration","it","catering","counselling","administration","drama","others"];
  const oldSvcs = oldB.services || {};
  const newSvcs = newServices;
  SERVICE_NAMES_EDIT.forEach(key => {
    const oc = !!(oldSvcs[key]?.current), nc = !!(newSvcs[key]?.current);
    const oj = !!(oldSvcs[key]?.join),    nj = !!(newSvcs[key]?.join);
    if (oc !== nc) changes.push({ section:"B — Pelayanan", field:`${key} (Terlibat)`, before:oc?"Ya":"Tidak", after:nc?"Ya":"Tidak" });
    if (oj !== nj) changes.push({ section:"B — Pelayanan", field:`${key} (Ingin Sertai)`, before:oj?"Ya":"Tidak", after:nj?"Ya":"Tidak" });
  });

  // Children diff
  const gMap = { male:"Lelaki", female:"Perempuan" };
  const oldKids = (oldC.children||[]).filter(k=>k.name?.trim()&&k.gender);
  const newKids = newChildren;
  if (JSON.stringify(oldKids.map(k=>({n:k.name,g:k.gender}))) !== JSON.stringify(newKids.map(k=>({n:k.name,g:k.gender})))) {
    const fmt = kids => kids.length ? kids.map(k=>`${k.name} (${gMap[k.gender]||"—"})`).join(", ") : "Tiada";
    changes.push({ section:"C — Kanak-kanak", field:"Senarai Anak", before:fmt(oldKids), after:fmt(newKids) });
  }

  // Photo change
  if (photoDataURL && photoDataURL !== editOriginalData?.photoURL) {
    changes.push({ section:"A — Peribadi", field:"Gambar / Photo", before:"(gambar lama)", after:"(gambar baru)" });
  }

  // Show diff modal
  showEditDiffModal(changes, newA, newSvcs, newKids);
}

function showEditDiffModal(changes, newA, newSvcs, newKids) {
  // Create modal if not present
  let modal = document.getElementById("editDiffModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "editDiffModal";
    modal.className = "modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML = `
      <div class="modal-card modal-card--lg" style="max-height:90vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h3 class="modal-title">🔍 Semak Perubahan / Review Changes</h3>
        </div>
        <div class="modal-body" style="padding:1.2rem 1.5rem;overflow-y:auto;max-height:55vh;">
          <p style="font-size:0.88rem;color:var(--text-muted);font-style:italic;margin-bottom:1rem;line-height:1.6;">
            Berikut merupakan semua perubahan yang anda telah kemas kini, sila semak sebelum tekan butang 'Simpan' /
            The following are the changes you've made, please analyse carefully before pressing 'Save'.
          </p>
          <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
            <table id="editDiffTable" style="width:100%;border-collapse:collapse;min-width:480px;">
              <thead>
                <tr style="background:var(--bg-header);">
                  <th style="padding:0.6rem 0.8rem;text-align:left;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.05em;color:var(--marigold-bright);border-bottom:2px solid var(--marigold-dim);">Seksyen / Section</th>
                  <th style="padding:0.6rem 0.8rem;text-align:left;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.05em;color:var(--marigold-bright);border-bottom:2px solid var(--marigold-dim);">Ruangan / Field</th>
                  <th style="padding:0.6rem 0.8rem;text-align:left;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.05em;color:var(--marigold-bright);border-bottom:2px solid var(--marigold-dim);">Sebelum / Before</th>
                  <th style="padding:0.6rem 0.8rem;text-align:left;font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.05em;color:var(--marigold-bright);border-bottom:2px solid var(--marigold-dim);">Selepas / After</th>
                </tr>
              </thead>
              <tbody id="editDiffBody"></tbody>
            </table>
            <div id="editDiffNoChange" style="display:none;text-align:center;padding:1.5rem;color:var(--text-muted);font-style:italic;">Tiada perubahan dibuat. / No changes were made.</div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-secondary" id="btnEditDiffBack">✏️ Kembali Mengemas Kini / Back to Editing</button>
          <button class="btn btn-primary" id="btnEditDiffSave">💾 Simpan / Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  // Populate table
  const tbody = document.getElementById("editDiffBody");
  const noChg = document.getElementById("editDiffNoChange");
  const table = document.getElementById("editDiffTable");
  if (changes.length === 0) {
    table.style.display = "none"; noChg.style.display = "";
  } else {
    table.style.display = ""; noChg.style.display = "none";
    tbody.innerHTML = changes.map(r => `<tr style="border-bottom:1px solid var(--border-card);">
      <td style="padding:0.5rem 0.7rem;font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">${r.section}</td>
      <td style="padding:0.5rem 0.7rem;font-size:0.88rem;font-weight:600;color:var(--text-primary);">${r.field}</td>
      <td style="padding:0.5rem 0.7rem;font-size:0.85rem;color:#E05555;">${r.before}</td>
      <td style="padding:0.5rem 0.7rem;font-size:0.85rem;color:#4CAF7D;">${r.after}</td>
    </tr>`).join("");
  }

  // Wire buttons
  document.getElementById("btnEditDiffBack").onclick = () => { modal.style.display = "none"; };
  document.getElementById("btnEditDiffSave").onclick = async () => {
    const saveBtn = document.getElementById("btnEditDiffSave");
    saveBtn.disabled = true; saveBtn.textContent = "Menyimpan... / Saving...";
    try {
      const payload = {
        name:                (newA.fullName||"").toUpperCase(),
        sectionA:            { ...(editOriginalData?.sectionA||{}), ...newA },
        "sectionB.services": newSvcs,
        "sectionC.children": newKids,
        manualCity:          firebase.firestore.FieldValue.delete(),
        lastUpdated:         firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (photoDataURL && photoDataURL !== editOriginalData?.photoURL) {
        payload.photoURL = photoDataURL;
      }
      await db.collection("registrations").doc(EDIT_DOC_ID).update(payload);
      // Clear drafts
      ["bem_otr_draft_sectionA","bem_otr_draft_sectionB","bem_otr_draft_sectionC"]
        .forEach(k => localStorage.removeItem(k));
      modal.style.display = "none";
      // Show success
      document.querySelectorAll(".form-section").forEach(s => s.style.display="none");
      document.querySelector(".step-nav")?.style && (document.querySelector(".step-nav").style.display="none");
      const successDiv = document.getElementById("successPage");
      if (successDiv) {
        successDiv.style.display = "block";
        const title = successDiv.querySelector(".success-title");
        const titleEn = successDiv.querySelector(".success-title-en");
        const msg     = successDiv.querySelector(".success-msg");
        const msgEn   = successDiv.querySelector(".success-msg-en");
        if (title)   title.textContent   = "Maklumat Berjaya Dikemas Kini!";
        if (titleEn) titleEn.textContent = "Successfully Updated Your Information!";
        if (msg)     msg.textContent     = "";
        if (msgEn)   msgEn.textContent   = "";
        // Remove payment reminder
        const payReminder = successDiv.querySelector("div[style*='rgba(255,140,0']");
        if (payReminder) payReminder.remove();
      }
      window.scrollTo({top:0, behavior:"smooth"});
    } catch(err) {
      alert("Ralat menyimpan / Save error: " + err.message);
      saveBtn.disabled = false; saveBtn.textContent = "💾 Simpan / Save";
    }
  };
}

function parseICToDOB(ic) {
  // Remove dashes
  const clean = ic.replace(/-/g, "");
  if (clean.length < 6) return null;

  const yy = clean.substring(0, 2);
  const mm = clean.substring(2, 4);
  const dd = clean.substring(4, 6);

  // Determine century: if yy > current 2-digit year, assume 1900s
  const currentYY = new Date().getFullYear() % 100;
  const year = parseInt(yy) > currentYY ? `19${yy}` : `20${yy}`;

  // Validate month and day ranges
  const month = parseInt(mm);
  const day = parseInt(dd);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Return in YYYY-MM-DD format for <input type="date">
  return `${year}-${mm}-${dd}`;
}

// Auto-format IC as user types (adds dashes: XXXXXX-XX-XXXX)
function formatIC(value) {
  const digits = value.replace(/\D/g, "");
  let formatted = digits;
  if (digits.length > 6) formatted = digits.substring(0, 6) + "-" + digits.substring(6);
  if (digits.length > 8) formatted = formatted.substring(0, 9) + "-" + digits.substring(8);
  return formatted.substring(0, 14); // max 14 chars with dashes
}

function formatMyTentera(value) {
  // MyTentera uses the same ddmmyy-##-#### dash pattern as IC.
  return formatIC(value);
}

function formatPassport(value) {
  // Passport: alphanumeric only (no dashes/IC formatting)
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 20); // safety cap
}

// ═══════════════════════════════════════════════
// 3. BIND ALL EVENTS
// ═══════════════════════════════════════════════
function bindEvents() {

  const idTypeSelect = document.getElementById("idType");

  // ── Main identifier input: behaviour depends on Identifier Type (IC / Passport / MyTentera) ──
  const icInput = document.getElementById("icNo");
  if (icInput) {
    icInput.addEventListener("input", function () {
      const currentType = idTypeSelect?.value || "IC";

      // Passport: free-form alphanumeric, no DOB/gender inference
      if (currentType === "Passport") {
        const formattedPassport = formatPassport(this.value);
        this.value = formattedPassport;
        saveDraft();
        checkNextButton();
        return;
      }

      // IC & MyTentera: numeric ddmmyy-##-#### formatting + DOB/gender inference
      const formatted = formatMyTentera(this.value);
      this.value = formatted;

      // Auto-fill DOB
      const dob = parseICToDOB(formatted);
      const dobField = document.getElementById("dob");
      if (dob && dobField) dobField.value = dob;

      // Auto-detect gender from last digit (odd = male, even = female)
      const clean = formatted.replace(/-/g, "");
      if (clean.length === 12) {
        const lastDigit = parseInt(clean[11]);
        const genderMale   = document.getElementById("genderMale");
        const genderFemale = document.getElementById("genderFemale");
        if (genderMale && genderFemale && !genderMale.checked && !genderFemale.checked) {
          if (lastDigit % 2 !== 0) genderMale.checked   = true;
          else                      genderFemale.checked = true;
        }
        // Check affiliated members DB for IC-style identifiers
        checkAffiliatedMatch("ic", clean);
      }
      saveDraft();
      checkNextButton();
    });
  }

  // ── Full Name: check affiliated members + partner match on blur ──
  const nameInput = document.getElementById("fullName");
  if (nameInput) {
    nameInput.addEventListener("blur", function () {
      const val = this.value.trim();
      if (val.length > 2 && !IS_AFFILIATED_MODE) {
        checkAffiliatedMatch("name", val);
        checkPartnerMatch("name", val);
      }
    });
  }

  function applyIdTypeUI(selectedIdType) {
    const idType = selectedIdType || "IC";
    const icInput    = document.getElementById("icNo");
    const icRequired = document.getElementById("icNoRequired");
    const countryField = document.getElementById("countryField");

    // Sync citizenship radio based on ID type
    document.querySelectorAll('input[name="citizenship"]').forEach(r => {
      if (r.value === (idType === "IC" ? "citizen" : "nonCitizen")) r.checked = true;
    });

    const isNonCitizen = idType !== "IC";

    // IC / ID input stays enabled; just adjust placeholder and length
    if (icInput) {
      icInput.disabled = false;
      icInput.style.opacity = "";
      icInput.style.cursor  = "";

      if (idType === "IC") {
        icInput.maxLength   = 14;
        icInput.placeholder = "cth/e.g. 901231-14-5678";
      } else if (idType === "MyTentera") {
        icInput.maxLength   = 14;
        icInput.placeholder = "Masukkan nombor MyTentera anda (ddmmyy-##-####)";
      } else {
        // Passport
        icInput.maxLength   = 20;
        icInput.placeholder = "Masukkan nombor Passport anda (alphanumeric)";
      }
    }

    // Show/hide non-citizen section
    if (countryField) {
      if (isNonCitizen) countryField.classList.add("visible");
      else countryField.classList.remove("visible");
    }

    // Required marker for main ID input: always visible
    if (icRequired) icRequired.style.display = "";

    // Clear country field when switching to IC
    const countryOfOrigin = document.getElementById("countryOfOrigin");
    if (countryOfOrigin) {
      if (!isNonCitizen) countryOfOrigin.value = "";
    }
  }

  // ID type dropdown change
  idTypeSelect?.addEventListener("change", function() {
    applyIdTypeUI(this.value);
    saveDraft();
    checkNextButton();
  });

  // Citizenship radio change should keep dropdown in sync
  document.querySelectorAll('input[name="citizenship"]').forEach(radio => {
    radio.addEventListener("change", function() {
      if (this.value === "citizen") {
        if (idTypeSelect) { idTypeSelect.value = "IC"; idTypeSelect.dispatchEvent(new Event("change")); }
      } else {
        // nonCitizen selected — default to MyTentera (user can switch to Passport)
        if (idTypeSelect) { idTypeSelect.value = "MyTentera"; idTypeSelect.dispatchEvent(new Event("change")); }
      }
      saveDraft();
      checkNextButton();
    });
  });

  // Initial application on page load
  applyIdTypeUI(idTypeSelect?.value || "IC");
  const phoneInput = document.getElementById("phoneNumber");
  if (phoneInput) {
    phoneInput.addEventListener("input", function () {
      let digits = this.value.replace(/\D/g, "");
      if (digits.length > 3) digits = digits.substring(0, 3) + "-" + digits.substring(3);
      this.value = digits.substring(0, 12);
      saveDraft();
      checkNextButton();
    });
  }

  // ── Baptism Status: show/hide year input column ──
  const baptismRadios = document.querySelectorAll('input[name="baptismStatus"]');
  baptismRadios.forEach(radio => {
    radio.addEventListener("change", function () {
      const yearField   = document.getElementById("baptismDateField");
      const spacer      = document.getElementById("baptismYearSpacer");
      const citizenship = document.getElementById("citizenship-row"); // may not exist
      if (this.value === "baptised") {
        yearField.style.display = "flex"; // show year column
        if (spacer) spacer.style.display = "none";
      } else {
        yearField.style.display = "none";
        const yInput = document.getElementById("baptismYear");
        if (yInput) yInput.value = "";
        if (spacer) spacer.style.display = "";
        clearError("baptismDate");
      }
      saveDraft();
      checkNextButton();
    });
  });

  // ── Citizenship: show/hide country field ──
  // ── Auto-save on any section-a input ──
  const allInputs = document.querySelectorAll("#section-a input, #section-a select, #section-a textarea");
  allInputs.forEach(input => {
    input.addEventListener("change", () => { saveDraft(); checkNextButton(); });
    input.addEventListener("input",  () => checkNextButton());
  });

  // ── Next Button — Section A validation ──
  const btnNext = document.getElementById("btnNext");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (btnNext.dataset.ready !== "true") {
        scrollToFirstEmptySectionA();
        return;
      }
      saveDraft();
      navigateTo("b");
    });
  }

  // ── Step Navigator clicks ──
  const SECTION_ORDER = ["a", "b", "c", "d", "e"];
  document.querySelectorAll(".step").forEach(step => {
    step.addEventListener("click", function () {
      const target  = this.dataset.section;
      const current = document.querySelector(".form-section:not([style*='display:none'],[style*='display: none'])")?.id?.replace("section-", "") || "a";
      const currentIdx = SECTION_ORDER.indexOf(current);
      const targetIdx  = SECTION_ORDER.indexOf(target);

      // Going backward — always allow
      if (targetIdx <= currentIdx) { navigateTo(target); return; }

      // Going forward — check each gate in order up to the target
      for (let i = currentIdx; i < targetIdx; i++) {
        const from = SECTION_ORDER[i];

        if (from === "a") {
          if (!isSectionAComplete()) {
            navigateTo("a");
            setTimeout(() => scrollToFirstEmptySectionA(), 350);
            return;
          }
        }

        if (from === "c") {
          const partialChildren = [];
          document.querySelectorAll(".child-card").forEach((card, idx) => {
            const num    = card.dataset.childNum || (idx + 1);
            const name   = card.querySelector(`[id^="childName-"]`)?.value?.trim() || "";
            const gender = card.querySelector(`input[name^="childGender-"]:checked`)?.value || "";
            const myKid  = card.querySelector(`[id^="childMyKid-"]`)?.value?.trim() || "";
            const age    = card.querySelector(`[id^="childAge-"]`)?.value?.trim() || "";
            if (!name) return;
            const missing = [];
            if (!age)    missing.push("Umur / Age");
            if (!gender) missing.push("Jantina / Gender");
            if (missing.length) partialChildren.push({ num: parseInt(num), missing });
          });
          if (partialChildren.length > 0) {
            navigateTo("c");
            setTimeout(() => showPartialChildModal(partialChildren), 350);
            return;
          }
        }

        if (from === "d") {
          if (!document.getElementById("pledgeAgree")?.checked) {
            navigateTo("d");
            setTimeout(() => {
              const label = document.getElementById("pledgeAgreeLabel");
              if (label) {
                label.style.borderColor = "#E05555";
                label.style.boxShadow = "0 0 0 2px rgba(224,85,85,0.25)";
                label.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }, 350);
            return;
          }
        }

        if (from === "e") {
          if (!isSectionEComplete()) {
            navigateTo("e");
            setTimeout(() => showSectionEModal(), 350);
            return;
          }
        }
      }

      // All gates passed — allow navigation
      navigateTo(target);
    });
  });

  // Run once on load in case draft was restored
  checkNextButton();
}

// ═══════════════════════════════════════════════
// 3b. CHECK IF REQUIRED FIELDS ARE FILLED
// Dims the Next button until all Section A required fields are met.
// Section B has no restrictions.
// ═══════════════════════════════════════════════
function checkNextButton() {
  const btn = document.getElementById("btnNext");
  if (!btn) return;

  const allMet = isSectionAComplete();
  btn.disabled = false; // never truly disable — we need click events to fire
  btn.dataset.ready = allMet ? "true" : "false";
  btn.style.opacity = allMet ? "" : "0.45";
  btn.style.cursor  = allMet ? "" : "not-allowed";

  if (allMet) {
    document.querySelectorAll(".sectionA-req-msg").forEach(el => el.remove());
  }
}

// Scroll to first unfilled required field in Section A when dimmed Next is clicked
function scrollToFirstEmptySectionA() {
  const getVal    = id => (document.getElementById(id)?.value || "").trim();
  const getRadio  = name => document.querySelector(`input[name="${name}"]:checked`)?.value || "";
  const isChecked = name => !!document.querySelector(`input[name="${name}"]:checked`);
  const idType    = getVal("idType") || "IC";
  const isNonCitizen = idType !== "IC";
  const isBaptised   = getRadio("baptismStatus") === "baptised";
  const ms = getVal("maritalStatus");

  // Clear any previous inline error messages
  document.querySelectorAll(".sectionA-req-msg").forEach(el => el.remove());

  const MSG_BM = "Sila isi maklumat berikut";
  const MSG_EN = "Please input this field";
  const requiredMsg = `<span class="sectionA-req-msg error-msg" style="display:block;margin-top:0.35rem;color:#E05555;font-size:0.82rem;">
    ${MSG_BM} / ${MSG_EN}</span>`;

  const showError = (id, insertAfter) => {
    const anchor = insertAfter ? document.getElementById(insertAfter) : document.getElementById(id);
    if (!anchor) return;
    const msg = document.createElement("span");
    msg.className = "sectionA-req-msg error-msg";
    msg.style.cssText = "display:block;margin-top:0.35rem;color:#E05555;font-size:0.82rem;";
    msg.textContent = `${MSG_BM} / ${MSG_EN}`;
    anchor.parentNode.insertBefore(msg, anchor.nextSibling);
    anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    anchor.focus?.();
  };

  // Radio group helper — insert after the checkbox-group wrapper
  const showRadioError = (groupName, firstRadioId) => {
    const firstRadio = document.getElementById(firstRadioId);
    if (!firstRadio) return;
    const group = firstRadio.closest(".checkbox-group") || firstRadio.closest(".form-group") || firstRadio.parentNode;
    const msg = document.createElement("span");
    msg.className = "sectionA-req-msg error-msg";
    msg.style.cssText = "display:block;margin-top:0.35rem;color:#E05555;font-size:0.82rem;";
    msg.textContent = `${MSG_BM} / ${MSG_EN}`;
    group.parentNode.insertBefore(msg, group.nextSibling);
    group.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!IS_AFFILIATED_MODE && !isChecked("memberRole")) { showRadioError("memberRole", "rolePastoral"); return; }
  if (!getVal("fullName"))    { showError("fullName"); return; }
  const idRaw = getVal("icNo");
  if (!idRaw) { showError("icNo"); return; }
  if (idType === "IC" || idType === "MyTentera") {
    const d = idRaw.replace(/-/g,"");
    if (d.length !== 12 || isNaN(d)) { showError("icNo"); return; }
  } else if (idType === "Passport") {
    if (idRaw.toUpperCase().replace(/[^A-Z0-9]/g,"").length < 4) { showError("icNo"); return; }
  }
  if (!isChecked("gender"))        { showRadioError("gender", "genderMale"); return; }
  if (!getVal("phoneNumber"))      { showError("phoneNumber"); return; }
  if (!getVal("dob"))              { showError("dob"); return; }
  if (!getVal("race"))             { showError("race"); return; }
  if (!getVal("maritalStatus"))    { showError("maritalStatus"); return; }
  if ((ms === "married" || ms === "engaged") && !getVal("partnerName"))  { showError("partnerName"); return; }
  if (ms === "widowed" && !getVal("latePartnerName"))                    { showError("latePartnerName"); return; }
  if (!isChecked("baptismStatus")) { showRadioError("baptismStatus", "baptised"); return; }
  if (isBaptised && !getVal("baptismYear")) { showError("baptismYear"); return; }
  if (isNonCitizen && !getVal("countryOfOrigin")) { showError("countryOfOrigin"); return; }
  if (!getVal("yearJoining"))      { showError("yearJoining"); return; }
  if (!IS_AFFILIATED_MODE && (!getVal("komselCode") || !isValidKomsel(getVal("komselCode")))) { showError("komselCode"); return; }
  if (!getVal("currentAddress"))   { showError("currentAddress"); return; }
}

function isSectionAComplete() {
  const getVal    = id => (document.getElementById(id)?.value || "").trim();
  const getRadio  = name => document.querySelector(`input[name="${name}"]:checked`)?.value || "";
  const isChecked = name => !!document.querySelector(`input[name="${name}"]:checked`);

  const idType = getVal("idType") || "IC";
  const isNonCitizen = idType !== "IC";
  const isBaptised   = getRadio("baptismStatus") === "baptised";

  // 1. Position within Cell Group (skip in affiliated mode — field is hidden)
  if (!IS_AFFILIATED_MODE && !isChecked("memberRole")) return false;

  // 2. Full Name
  if (!getVal("fullName")) return false;

  // 3. Identifier — IC / Passport / MyTentera (always from main ID field)
  const idRaw = getVal("icNo");
  if (!idRaw) return false;
  if (idType === "IC" || idType === "MyTentera") {
    const digitsOnly = idRaw.replace(/-/g, "");
    if (digitsOnly.length !== 12 || isNaN(digitsOnly)) return false;
  } else if (idType === "Passport") {
    const passNorm = idRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (passNorm.length < 4) return false;
  }

  // 4. Gender
  if (!isChecked("gender")) return false;

  // 5. Telephone Number — must have digits entered
  if (!getVal("phoneNumber")) return false;

  // 6. Date of Birth
  if (!getVal("dob")) return false;

  // 7. Race
  if (!getVal("race")) return false;

  // 8. Marital Status
  if (!getVal("maritalStatus")) return false;

  // 9. Baptism Status (+ year if baptised)
  if (!isChecked("baptismStatus")) return false;
  if (isBaptised && !getVal("baptismYear")) return false;

  // 10. Citizenship (+ country if non-citizen)
  if (!isChecked("citizenship")) return false;
  if (isNonCitizen) {
    if (!getVal("countryOfOrigin")) return false;
  }

  // 11. Year Joining On The Rock
  if (!getVal("yearJoining")) return false;

  // 12. Cell Group Code — must be a valid komsel (skip in affiliated mode)
  if (!IS_AFFILIATED_MODE) {
    const komsel = getVal("komselCode");
    if (!komsel || !isValidKomsel(komsel)) return false;
  }

  // 13. Current Address
  if (!getVal("currentAddress")) return false;

  return true;
}

// ═══════════════════════════════════════════════
// 4. LOCALSTORAGE DRAFT SAVING & LOADING
// ═══════════════════════════════════════════════
const DRAFT_KEY = "bem_otr_draft_sectionA";

function collectSectionAData() {
  const idType = document.getElementById("idType")?.value || "IC";
  const mainIdRaw = document.getElementById("icNo")?.value || "";
  let foreignID = "";
  if (idType === "MyTentera") {
    foreignID = formatMyTentera(mainIdRaw);
  } else if (idType === "Passport") {
    foreignID = formatPassport(mainIdRaw);
  }
  const countryOfOrigin = idType !== "IC" ? (document.getElementById("countryOfOrigin")?.value || "") : "";
  return {
    fullName:        document.getElementById("fullName")?.value || "",
    idType,
    icNo:            idType === "IC" ? (document.getElementById("icNo")?.value || "") : "",
    gender:          document.querySelector('input[name="gender"]:checked')?.value || "",
    dob:             document.getElementById("dob")?.value || "",
    race:            document.getElementById("race")?.value || "",
    maritalStatus:   document.getElementById("maritalStatus")?.value || "",
    partnerName:     (document.getElementById("partnerName")?.value || "").toUpperCase(),
    latePartnerName: (document.getElementById("latePartnerName")?.value || "").toUpperCase(),
    baptismStatus:   document.querySelector('input[name="baptismStatus"]:checked')?.value || "",
    baptismYear:     document.getElementById("baptismYear")?.value || "",
    citizenship:     idType === "IC" ? "citizen" : "nonCitizen",
    countryOfOrigin,
    foreignID,
    originalChurch:  document.getElementById("originalChurch")?.value || "",
    yearJoining:     document.getElementById("yearJoining")?.value || "",
    komselCode:      document.getElementById("komselCode")?.value || "",
    occupation:      document.getElementById("occupation")?.value || "",
    phoneNumber:     document.getElementById("phoneNumber")?.value || "",
    currentAddress:  document.getElementById("currentAddress")?.value || "",
    memberRole:      document.querySelector('input[name="memberRole"]:checked')?.value || "",
    savedAt:         new Date().toISOString(),
  };
}

function saveDraft() {
  // Never write to localStorage in edit mode — Firestore is the source of truth
  // This prevents edit session data from leaking into the next fresh registration
  if (IS_EDIT_MODE) return;
  const data = collectSectionAData();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    // Simple text/select fields
    const fieldMap = [
      "fullName", "icNo", "dob", "race",
      "maritalStatus", "baptismDate", "countryOfOrigin",
      "idType",
      "originalChurch", "yearJoining", "komselCode",
      "occupation", "phoneNumber", "currentAddress"
    ];
    fieldMap.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id]) el.value = data[id];
    });

    // Radio: Gender
    if (data.gender) {
      const radio = document.querySelector(`input[name="gender"][value="${data.gender}"]`);
      if (radio) radio.checked = true;
    }

    // Radio: Member Role
    if (data.memberRole) {
      const radio = document.querySelector(`input[name="memberRole"][value="${data.memberRole}"]`);
      if (radio) radio.checked = true;
    }

    // Radio: Baptism Status
    if (data.baptismStatus) {
      const radio = document.querySelector(`input[name="baptismStatus"][value="${data.baptismStatus}"]`);
      if (radio) {
        radio.checked = true;
        const yearField = document.getElementById("baptismDateField");
        const spacer    = document.getElementById("baptismYearSpacer");
        if (data.baptismStatus === "baptised") {
          yearField.style.display = "flex";
          if (spacer) spacer.style.display = "none";
        }
      }
    }

    // Radio: Citizenship
    if (data.citizenship) {
      const radio = document.querySelector(`input[name="citizenship"][value="${data.citizenship}"]`);
      if (radio) {
        radio.checked = true;
      }
    }

    // Sync identifier type (IC / Passport / MyTentera) and dependent fields
    const idTypeEl = document.getElementById("idType");
    if (idTypeEl) {
      const dt = data.idType || (data.citizenship === "nonCitizen" ? "MyTentera" : "IC");
      idTypeEl.value = dt;
      // Trigger idType handler to enable/disable correct fields
      idTypeEl.dispatchEvent(new Event("change"));
    }

    if (data.savedAt) {
      const d = new Date(data.savedAt);
      showDraftNotice(`📄 Draf dimuat semula / Draft restored (${d.toLocaleDateString()})`);
    }

  } catch (e) {
    console.warn("Could not load draft:", e);
  }
}

function showDraftNotice(msg) {
  const notice = document.getElementById("draftNotice");
  notice.textContent = msg;
  setTimeout(() => { notice.textContent = ""; }, 4000);
}

// ═══════════════════════════════════════════════
// 5. VALIDATION
// ═══════════════════════════════════════════════
function validateSectionA() {
  let isValid = true;

  // Clear all errors first
  document.querySelectorAll(".error-msg").forEach(el => el.textContent = "");
  document.querySelectorAll(".form-input").forEach(el => el.classList.remove("error-state"));

  // Member Role
  if (!document.querySelector('input[name="memberRole"]:checked')) {
    showError("memberRole", STRINGS.requiredField);
    isValid = false;
  }

  // Full Name
  const fullName = document.getElementById("fullName");
  if (!fullName.value.trim()) {
    showError("fullName", STRINGS.requiredField);
    isValid = false;
  }

  // Identifier — validate according to selected type
  const icNo = document.getElementById("icNo");
  const idTypeForValidate = document.getElementById("idType")?.value || "IC";
  const rawId = icNo.value.trim();
  if (!rawId) {
    showError("icNo", STRINGS.requiredField);
    isValid = false;
  } else if (idTypeForValidate === "IC" || idTypeForValidate === "MyTentera") {
    const digitsOnly = rawId.replace(/-/g, "");
    if (digitsOnly.length !== 12 || isNaN(digitsOnly)) {
      showError("icNo", STRINGS.invalidIC);
      isValid = false;
    }
  } else if (idTypeForValidate === "Passport") {
    const passNorm = rawId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (passNorm.length < 4) {
      showError("icNo", STRINGS.invalidPassport || STRINGS.invalidIC);
      isValid = false;
    }
  }

  // Gender
  if (!document.querySelector('input[name="gender"]:checked')) {
    showError("gender", STRINGS.selectGender);
    isValid = false;
  }

  // DOB
  const dob = document.getElementById("dob");
  if (!dob.value) {
    showError("dob", STRINGS.requiredField);
    isValid = false;
  }

  // Race
  const race = document.getElementById("race");
  if (!race.value.trim()) {
    showError("race", STRINGS.requiredField);
    isValid = false;
  }

  // Marital Status
  const marital = document.getElementById("maritalStatus");
  if (!marital.value) {
    showError("maritalStatus", STRINGS.requiredField);
    isValid = false;
  }

  // Baptism Status
  if (!document.querySelector('input[name="baptismStatus"]:checked')) {
    showError("baptismStatus", STRINGS.selectBaptism);
    isValid = false;
  } else if (document.querySelector('input[name="baptismStatus"]:checked').value === "baptised") {
    const bd = document.getElementById("baptismDate");
    if (!bd.value) {
      showError("baptismDate", STRINGS.requiredField);
      isValid = false;
    }
  }

  // Citizenship
  if (!document.querySelector('input[name="citizenship"]:checked')) {
    showError("citizenship", STRINGS.selectCitizenship);
    isValid = false;
  } else if (document.querySelector('input[name="citizenship"]:checked').value === "nonCitizen") {
    const country = document.getElementById("countryOfOrigin");
    if (!country.value.trim()) {
      showError("countryOfOrigin", STRINGS.requiredField);
      isValid = false;
    }
  }

  // Year Joining
  const year = document.getElementById("yearJoining");
  if (!year.value) {
    showError("yearJoining", STRINGS.requiredField);
    isValid = false;
  }

  // Phone Number
  const phone = document.getElementById("phoneNumber");
  if (!phone.value.trim()) {
    showError("phoneNumber", STRINGS.requiredField);
    isValid = false;
  }

  // Current Address
  const address = document.getElementById("currentAddress");
  if (!address.value.trim()) {
    showError("currentAddress", STRINGS.requiredField);
    isValid = false;
  }

  // Scroll to first error
  if (!isValid) {
    const firstError = document.querySelector(".error-state, .error-msg:not(:empty)");
    if (firstError) firstError.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return isValid;
}

function showError(fieldId, message) {
  const errEl = document.getElementById(`err-${fieldId}`);
  if (errEl) errEl.textContent = message;
  const inputEl = document.getElementById(fieldId);
  if (inputEl) inputEl.classList.add("error-state");
}

function clearError(fieldId) {
  const errEl = document.getElementById(`err-${fieldId}`);
  if (errEl) errEl.textContent = "";
  const inputEl = document.getElementById(fieldId);
  if (inputEl) inputEl.classList.remove("error-state");
}

// ═══════════════════════════════════════════════
// 6. SECTION NAVIGATION
// ═══════════════════════════════════════════════
function navigateTo(sectionId) {
  document.querySelectorAll(".form-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));

  const targetSection = document.getElementById(`section-${sectionId}`);
  const targetStep    = document.getElementById(`step-${sectionId}`);

  if (targetSection) targetSection.classList.add("active");
  if (targetStep)    targetStep.classList.add("active");

  // Sync Section E readonly fields whenever user navigates to E
  if (sectionId === "e") {
    const komselCode = document.getElementById("komselCode");
    const confKomsel = document.getElementById("confessionKomsel");
    if (komselCode && confKomsel) confKomsel.value = komselCode.value;

    const fullName = document.getElementById("fullName");
    const confName = document.getElementById("confessionName");
    if (fullName && confName) confName.value = fullName.value;

    syncConfessionRefs();
    checkSectionESubmit();
  }

  if (sectionId === "d") checkSectionDNext();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ═══════════════════════════════════════════════
// 7. SECTION B — SERVICE TABLE
// ═══════════════════════════════════════════════

const SERVICES = [
  "Pastoral / Pastoral",
  "Pekerja Sepenuh Masa (Gereja) / Full Time Staff (Church)",
  "[Rock Wave] Penyanyi / Singer",
  "[Rock Wave] Pemain Muzik / Musician",
  "[Rock Wave] Penari Kreatif / Creative Dancer",
  "Multimedia / Multimedia",
  "Pengendali Sistem Bunyi / Sound System Handler",
  "Pengendali Pencahayaan / Lighting Handler",
  "Usher / Usher",
  "Keselamatan & Parkir / Security & Parking",
  "Krew Pentas / Stage Crew",
  "Hospitaliti untuk Jemaat Baru / Hospitality for Newcomers",
  "Hospitaliti untuk VIP / Hospitality for VIP",
  "Rock Essence / Rock Essence",
  "Rock Resource / Rock Resource",
  "Kaunter Maklumat / Information Counter",
  "Pengangkutan / Transportation",
  "Pendoa Syafaat / Intercessor",
  "Kebajikan & Sosial / Welfare & Social",
  "Adiwira / Adiwira",
  "Pembantu Peribadi Pastor & Penceramah / Pastoral Personal Assistant & Speaker",
  "Penginjilan / Evangelism",
  "Tim Persembahan / Offering Team",
];

function buildServiceTable() {
  const tbody = document.getElementById("serviceTableBody");
  if (!tbody) return;

  SERVICES.forEach((service, index) => {
    const row = document.createElement("tr");
    const num = index + 1;

    row.innerHTML = `
      <td class="col-num">${num}</td>
      <td class="col-service">${service}</td>
      <td class="col-check">
        <div class="service-check-wrap">
          <input type="checkbox" class="service-checkbox"
            id="svc-have-${num}" name="svc-have-${num}"
            data-index="${num}" data-type="have" />
        </div>
      </td>
      <td class="col-check">
        <div class="service-check-wrap">
          <input type="checkbox" class="service-checkbox"
            id="svc-want-${num}" name="svc-want-${num}"
            data-index="${num}" data-type="want" />
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Enforce mutual exclusivity: can't tick both columns on same row
  tbody.addEventListener("change", function (e) {
    const cb = e.target;
    if (!cb.classList.contains("service-checkbox")) return;
    const idx = cb.dataset.index;
    const type = cb.dataset.type;

    if (cb.checked) {
      const otherType = type === "have" ? "want" : "have";
      const other = document.getElementById(`svc-${otherType}-${idx}`);
      if (other) other.checked = false;
    }

    saveSectionBDraft();
  });
}

// ── Others toggle ──
function bindSectionBEvents() {
  const othersCheck = document.getElementById("othersCheck");
  const othersFields = document.getElementById("othersFields");

  if (othersCheck) {
    othersCheck.addEventListener("change", function () {
      if (this.checked) {
        othersFields.classList.add("visible");
      } else {
        othersFields.classList.remove("visible");
        document.getElementById("othersServiceName").value = "";
        const radios = document.querySelectorAll('input[name="othersInvolvement"]');
        radios.forEach(r => r.checked = false);
        clearError("othersServiceName");
        clearError("othersInvolvement");
      }
      saveSectionBDraft();
    });
  }

  // Back button
  const btnBackB = document.getElementById("btnBackB");
  if (btnBackB) btnBackB.addEventListener("click", () => navigateTo("a"));

  // Next button — no content validation, but dim if "Others" is checked with incomplete fields
  const btnNextB = document.getElementById("btnNextB");
  if (btnNextB) {
    btnNextB.addEventListener("click", () => {
      saveSectionBDraft();
      navigateTo("c");
    });
  }

  // Auto-save on others fields
  const othersName = document.getElementById("othersServiceName");
  if (othersName) othersName.addEventListener("input", saveSectionBDraft);

  const othersRadios = document.querySelectorAll('input[name="othersInvolvement"]');
  othersRadios.forEach(r => r.addEventListener("change", saveSectionBDraft));
}

// ── Draft: save Section B ──
const DRAFT_KEY_B = "bem_otr_draft_sectionB";

function collectSectionBData() {
  const services = {};
  SERVICES.forEach((_, i) => {
    const num = i + 1;
    services[num] = {
      have: document.getElementById(`svc-have-${num}`)?.checked || false,
      want: document.getElementById(`svc-want-${num}`)?.checked || false,
    };
  });
  return {
    services,
    othersChecked:     document.getElementById("othersCheck")?.checked || false,
    othersServiceName: document.getElementById("othersServiceName")?.value || "",
    othersInvolvement: document.querySelector('input[name="othersInvolvement"]:checked')?.value || "",
    savedAt: new Date().toISOString(),
  };
}

function saveSectionBDraft() {
  localStorage.setItem(DRAFT_KEY_B, JSON.stringify(collectSectionBData()));
}

function loadSectionBDraft() {
  const raw = localStorage.getItem(DRAFT_KEY_B);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);

    // Restore service checkboxes
    if (data.services) {
      Object.entries(data.services).forEach(([num, val]) => {
        const haveEl = document.getElementById(`svc-have-${num}`);
        const wantEl = document.getElementById(`svc-want-${num}`);
        if (haveEl) haveEl.checked = val.have;
        if (wantEl) wantEl.checked = val.want;
      });
    }

    // Restore others
    const othersCheck = document.getElementById("othersCheck");
    if (othersCheck && data.othersChecked) {
      othersCheck.checked = true;
      document.getElementById("othersFields").classList.add("visible");
    }
    const othersName = document.getElementById("othersServiceName");
    if (othersName && data.othersServiceName) othersName.value = data.othersServiceName;
    if (data.othersInvolvement) {
      const radio = document.querySelector(`input[name="othersInvolvement"][value="${data.othersInvolvement}"]`);
      if (radio) radio.checked = true;
    }
  } catch (e) {
    console.warn("Could not load Section B draft:", e);
  }
}

// ── Init Section B ──
document.addEventListener("DOMContentLoaded", () => {
  buildServiceTable();
  loadSectionBDraft();
  bindSectionBEvents();
});

// ═══════════════════════════════════════════════
// 8. SECTION C — CHILDREN INFORMATION
// ═══════════════════════════════════════════════

let childCount = 0;
const DRAFT_KEY_C = "bem_otr_draft_sectionC";

// Re-render Section C child cards from an array (used by partner autofill)
function renderChildCards(children) {
  const list = document.getElementById("childrenList");
  if (!list) return;
  // Clear existing cards and rebuild from scratch
  list.innerHTML = "";
  childCount = 0;

  if (!children || !children.length) return;
  children.forEach(child => {
    if (child.name?.trim() && child.gender) addChild({ ...child });
  });
  // Update count display if present
  const countEl = document.getElementById("childCount");
  if (countEl) countEl.textContent = childCount;
}

function createChildCard(num, data = {}) {
  const card = document.createElement("div");
  card.className = "child-card";
  card.dataset.childNum = num;

  const genderMaleChecked   = data.gender === "male"   ? "checked" : "";
  const genderFemaleChecked = data.gender === "female" ? "checked" : "";

  // Pre-compute age from myKid if available
  let detectedAge = "";
  let ageFromMyKid = false;
  if (data.myKid) {
    const a = getAgeFromMyKid(data.myKid);
    if (a !== null) { detectedAge = a; ageFromMyKid = true; }
  }
  const ageValue   = data.age !== undefined ? data.age : detectedAge;
  const ageReadOnly = ageFromMyKid && !data.age ? 'readonly style="opacity:0.7;cursor:not-allowed;"' : '';

  card.innerHTML = `
    <div class="child-card-header">
      <span class="child-card-title">Anak Ke-${num} &nbsp;/&nbsp; Child No. ${num}</span>
      <button type="button" class="btn-remove-child" data-child="${num}">✕ Padam / Remove</button>
    </div>

    <div class="form-grid">
      <!-- Full Name -->
      <div class="form-group full-width">
        <label class="form-label" for="childName-${num}">
          Nama Penuh Anak <span class="label-en">/ Child's Full Name</span>
        </label>
        <input type="text" id="childName-${num}" name="childName-${num}"
          class="form-input child-field"
          placeholder="Masukkan nama penuh / Enter full name"
          value="${data.name || ''}"/>
      </div>

      <!-- Gender -->
      <div class="form-group">
        <label class="form-label">Jantina <span class="label-en">/ Gender</span></label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="radio" name="childGender-${num}" value="male" ${genderMaleChecked}/>
            <span class="custom-radio"></span>Lelaki <em>/ Boy</em>
          </label>
          <label class="checkbox-label">
            <input type="radio" name="childGender-${num}" value="female" ${genderFemaleChecked}/>
            <span class="custom-radio"></span>Perempuan <em>/ Girl</em>
          </label>
        </div>
      </div>

      <!-- Age -->
      <div class="form-group">
        <label class="form-label" for="childAge-${num}">
          Umur Anak <span class="label-en">/ Child's Age</span>
        </label>
        <input type="number" id="childAge-${num}" name="childAge-${num}"
          class="form-input child-field child-age-field"
          placeholder="Umur / Age" min="0" max="12"
          value="${ageValue !== "" ? ageValue : ''}"
          ${ageReadOnly}
          style="max-width:100px;"/>
        ${ageFromMyKid && !data.age
          ? `<span class="field-hint">Diisi automatik dari MyKid / Auto-filled from MyKid</span>` : ""}
        <span class="error-msg" id="err-childAge-${num}"></span>
      </div>

      <!-- MyKid -->
      <div class="form-group">
        <label class="form-label" for="childMyKid-${num}">
          MyKid <span class="label-en">/ MyKid No.</span>
        </label>
        <input type="text" id="childMyKid-${num}" name="childMyKid-${num}"
          class="form-input child-field"
          placeholder="cth/e.g. 120131-14-1234"
          value="${data.myKid || ''}"/>
      </div>
    </div>
  `;

  // Auto-fill age from MyKid when typed
  const myKidInput = card.querySelector(`#childMyKid-${num}`);
  const ageInput   = card.querySelector(`#childAge-${num}`);
  myKidInput.addEventListener("input", function() {
    const age = getAgeFromMyKid(this.value);
    if (age !== null) {
      ageInput.value    = age;
      ageInput.readOnly = true;
      ageInput.style.opacity = "0.7";
      ageInput.style.cursor  = "not-allowed";
    } else {
      ageInput.readOnly = false;
      ageInput.style.opacity = "";
      ageInput.style.cursor  = "";
    }
    saveSectionCDraft();
  });

  // Remove button
  card.querySelector(".btn-remove-child").addEventListener("click", function() {
    card.remove();
    renumberChildren();
    saveSectionCDraft();
  });

  // Auto-save
  card.querySelectorAll("input").forEach(input => {
    input.addEventListener("input",  saveSectionCDraft);
    input.addEventListener("change", saveSectionCDraft);
  });

  return card;
}

// Extract age from MyKid number (first 6 digits = YYMMDD)
function getAgeFromMyKid(myKid) {
  const clean = (myKid || "").replace(/\D/g, "");
  if (clean.length < 6) return null;
  const yy = parseInt(clean.substring(0, 2), 10);
  const mm = parseInt(clean.substring(2, 4), 10);
  const dd = parseInt(clean.substring(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const fullYear = yy + (yy <= new Date().getFullYear() % 100 ? 2000 : 1900);
  const dob = new Date(fullYear, mm - 1, dd);
  if (isNaN(dob)) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  if (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) age--;
  return age;
}

function renumberChildren() {
  const cards = document.querySelectorAll(".child-card");
  childCount = cards.length;
  cards.forEach((card, i) => {
    const num = i + 1;
    card.dataset.childNum = num;
    const title = card.querySelector(".child-card-title");
    if (title) title.innerHTML = `Anak Ke-${num} &nbsp;/&nbsp; Child No. ${num}`;
    card.querySelector(".btn-remove-child").dataset.child = num;
  });
}

function addChild(data = {}) {
  const list = document.getElementById("childrenList");
  if (!list) return;
  childCount++;
  const card = createChildCard(childCount, data);
  list.appendChild(card);
  saveSectionCDraft();
}

function bindSectionCEvents() {
  document.getElementById("btnAddChild").addEventListener("click", () => {
    addChild();
  });

  document.getElementById("btnBackC").addEventListener("click", () => {
    navigateTo("b");
  });

  document.getElementById("btnNextC").addEventListener("click", () => {
    saveSectionCDraft();

    // ── Check for partially filled child cards ──
    const partialChildren = [];
    document.querySelectorAll(".child-card").forEach((card, idx) => {
      const num    = card.dataset.childNum || (idx + 1);
      const name   = card.querySelector(`[id^="childName-"]`)?.value?.trim() || "";
      const gender = card.querySelector(`input[name^="childGender-"]:checked`)?.value || "";
      const myKid  = card.querySelector(`[id^="childMyKid-"]`)?.value?.trim() || "";
      const ageEl  = card.querySelector(`[id^="childAge-"]`);
      const age    = ageEl ? ageEl.value.trim() : "";
      if (!name) return; // completely empty card — skip
      const missing = [];
      if (!age)     missing.push("Umur / Age");
      if (!gender)  missing.push("Jantina / Gender");
      if (missing.length) partialChildren.push({ num: parseInt(num), missing });
    });

    if (partialChildren.length > 0) {
      showPartialChildModal(partialChildren);
      return;
    }

    navigateTo("d");
  });
}

// ── Partial child fill modal ──
function showPartialChildModal(partialList) {
  let modal = document.getElementById("partialChildModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "partialChildModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card modal-card--sm">
        <div class="modal-header">
          <h3 class="modal-title" style="color:#E8A000;">⚠️ Maklumat Anak Tidak Lengkap / Incomplete Child Info</h3>
        </div>
        <div class="modal-body" style="padding:1.2rem 1.5rem;">
          <div id="partialChildList"></div>
        </div>
        <div class="modal-footer" style="justify-content:center;">
          <button class="btn btn-primary" id="btnPartialChildOk">Saya Faham / I Understand</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById("btnPartialChildOk").addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  const list = document.getElementById("partialChildList");
  list.innerHTML = partialList.map(c => `
    <div style="background:rgba(232,160,0,0.08);border:1px solid rgba(232,160,0,0.25);
      border-radius:var(--radius);padding:0.75rem 1rem;margin-bottom:0.6rem;font-size:0.9rem;">
      <strong style="color:var(--text-primary);">
        ${c.missing.join(", ")} anak ke-${c.num} tidak diisi, sila isi sebelum meneruskan.
      </strong><br/>
      <span style="color:var(--text-muted);font-style:italic;font-size:0.83rem;">
        The ${c.missing.join(", ")} of Child ${c.num} is yet to be filled, please fill them to proceed.
      </span>
    </div>`).join("");

  modal.style.display = "flex";
}

// ── Draft ──
function collectSectionCData() {
  const children = [];
  document.querySelectorAll(".child-card").forEach((card) => {
    const genderEl = card.querySelector(`input[name^="childGender-"]:checked`);
    const name     = card.querySelector(`[id^="childName-"]`)?.value?.trim() || "";
    const gender   = genderEl?.value || "";
    const myKid    = card.querySelector(`[id^="childMyKid-"]`)?.value || "";
    const ageEl    = card.querySelector(`[id^="childAge-"]`);
    const age      = ageEl ? parseInt(ageEl.value) || "" : "";
    if (name && gender) {
      children.push({ name, gender, myKid, age });
    }
  });
  return { children, savedAt: new Date().toISOString() };
}

function saveSectionCDraft() {
  localStorage.setItem(DRAFT_KEY_C, JSON.stringify(collectSectionCData()));
}

function loadSectionCDraft() {
  // In edit mode, use the pre-loaded children from Firestore
  if (IS_EDIT_MODE) {
    renderChildCards(editModeChildren || []);
    return;
  }
  // Normal registration: load from localStorage
  const raw = localStorage.getItem(DRAFT_KEY_C);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.children && data.children.length > 0) {
      data.children.forEach(child => addChild(child));
    }
  } catch (e) {
    console.warn("Could not load Section C draft:", e);
  }
}

// ═══════════════════════════════════════════════
// 9. SECTION D — CHURCH PLEDGE
// ═══════════════════════════════════════════════

const DRAFT_KEY_D = "bem_otr_draft_sectionD";

function bindSectionDEvents() {
  // Save pledge agreement to draft on change
  const pledgeAgree = document.getElementById("pledgeAgree");
  if (pledgeAgree) {
    pledgeAgree.addEventListener("change", () => {
      saveSectionDDraft();
      const label = document.getElementById("pledgeAgreeLabel");
      if (pledgeAgree.checked) {
        label.style.borderColor = "var(--marigold)";
        label.style.boxShadow = "";
      }
      checkSectionDNext();
    });
  }

  // Back button
  document.getElementById("btnBackD")?.addEventListener("click", () => navigateTo("c"));

  // Next button — requires pledge tick
  const btnNextD = document.getElementById("btnNextD");
  if (btnNextD) {
    checkSectionDNext();
    btnNextD.addEventListener("click", () => {
      const pledge = document.getElementById("pledgeAgree");
      if (btnNextD.dataset.ready !== "true") {
        const label = document.getElementById("pledgeAgreeLabel");
        if (label) {
          label.style.borderColor = "#E05555";
          label.style.boxShadow = "0 0 0 2px rgba(224,85,85,0.25)";
          label.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      saveSectionDDraft();
      navigateTo("e");
    });
  }
}

function checkSectionDNext() {
  const btn = document.getElementById("btnNextD");
  if (!btn) return;
  const checked = !!document.getElementById("pledgeAgree")?.checked;
  btn.disabled = false;
  btn.dataset.ready = checked ? "true" : "false";
  btn.style.opacity = checked ? "" : "0.45";
  btn.style.cursor  = checked ? "" : "not-allowed";
}

function saveSectionDDraft() {
  const data = {
    pledgeAgreed: document.getElementById("pledgeAgree")?.checked || false,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY_D, JSON.stringify(data));
}

function loadSectionDDraft() {
  const raw = localStorage.getItem(DRAFT_KEY_D);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const pledgeAgree = document.getElementById("pledgeAgree");
    if (pledgeAgree && data.pledgeAgreed) {
      pledgeAgree.checked = true;
    }
  } catch (e) {
    console.warn("Could not load Section D draft:", e);
  }
}

// ── Init Section D ──
document.addEventListener("DOMContentLoaded", () => {
  loadSectionDDraft();
  bindSectionDEvents();
});

pledgeAgree.addEventListener("change", () => {
  saveSectionDDraft();
  const label = document.getElementById("pledgeAgreeLabel");
  if (pledgeAgree.checked) {
    label.style.borderColor = "var(--marigold)";
    label.style.boxShadow = "";
  } else {
    label.style.borderColor = "";
    label.style.boxShadow = "";
  }
});

// ── Init Section C ──
document.addEventListener("DOMContentLoaded", () => {
  bindSectionCEvents();
  if (IS_EDIT_MODE) {
    // Edit mode data arrives asynchronously via initEditMode()/populateFormWithData().
    // Do not pre-create an empty card here.
    return;
  }
  const draft = localStorage.getItem(DRAFT_KEY_C);
  let draftLoaded = false;
  if (draft) {
    try {
      const data = JSON.parse(draft);
      if (data.children && data.children.length > 0) {
        loadSectionCDraft();
        draftLoaded = true;
      }
    } catch (e) {}
  }
  if (!draftLoaded) addChild();
});

// ═══════════════════════════════════════════════
// 10. SECTION E — CONFESSION
// ═══════════════════════════════════════════════

const DRAFT_KEY_E = "bem_otr_draft_sectionE";

function initSectionE() {
  // Auto-fill Komsel code from Section A
  const komselInput = document.getElementById("komselCode");
  const confKomsel  = document.getElementById("confessionKomsel");
  if (komselInput && confKomsel) {
    confKomsel.value = komselInput.value;
    // Keep in sync if user edits Section A komsel later
    komselInput.addEventListener("input", () => {
      confKomsel.value = komselInput.value;
      saveSectionEDraft();
    });
  }

  // Auto-fill Full Name from Section A (readonly)
  const fullNameInput = document.getElementById("fullName");
  const confName      = document.getElementById("confessionName");
  if (fullNameInput && confName) {
    confName.value = fullNameInput.value;
    fullNameInput.addEventListener("input", () => {
      confName.value = fullNameInput.value;
      saveSectionEDraft();
    });
  }

  // Auto-fill today's date
  const confDate = document.getElementById("confessionDate");
  if (confDate) {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, "0");
    const dd    = String(today.getDate()).padStart(2, "0");
    confDate.value = `${yyyy}-${mm}-${dd}`;
  }

  // Load saved draft (overwrites auto-fills if user had saved values)
  loadSectionEDraft();
  // Sync English refs after loading
  syncConfessionRefs();

  // Auto-save and sync English refs on input
  ["confessionSince", "confessionLeader", "confessionDate"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => {
      saveSectionEDraft();
      syncConfessionRefs();
      checkSectionESubmit();
    });
    document.getElementById(id)?.addEventListener("change", () => {
      saveSectionEDraft();
      syncConfessionRefs();
      checkSectionESubmit();
    });
  });

  checkSectionESubmit();

  // Back button
  document.getElementById("btnBackE")?.addEventListener("click", () => navigateTo("d"));

  // Submit button — Firestore integration
  document.getElementById("btnSubmit")?.addEventListener("click", async () => {
    if (IS_EDIT_MODE) {
      if (document.getElementById("btnSubmit").dataset.ready !== "true") { showSectionEModal(); return; }
      saveDraft();
      await submitEditMode();
      return;
    }
    if (document.getElementById("btnSubmit").dataset.ready !== "true") { showSectionEModal(); return; }

    const btn = document.getElementById("btnSubmit");
    let icVal = "";

    // Disable button to prevent double submission
    btn.disabled = true;
    btn.textContent = "Menyemak... / Checking...";

    try {
      const sectionADraftPre = JSON.parse(localStorage.getItem("bem_otr_draft_sectionA") || "{}");
      const inferIdType = (s) => {
        if (s.idType) return s.idType;
        if (s.citizenship === "citizen") return "IC";
        const fid = String(s.foreignID || "");
        if (/[A-Za-z]/.test(fid)) return "Passport";
        const digitsOnly = fid.replace(/\D/g, "");
        if (digitsOnly.length === 12) return "MyTentera";
        // fallback: if it's non-numeric, treat as Passport
        return "Passport";
      };
      const idType = inferIdType(sectionADraftPre);
      const isNonCitizen = idType !== "IC";

      if (idType === "IC") icVal = (sectionADraftPre.icNo || "").replace(/-/g, "");

      // ── Duplicate Check ──
      if (idType === "IC") {
        // Malaysian citizen: check IC duplicate as normal
        const snapshot = await db.collection("registrations")
          .where("icNo", "==", icVal)
          .get();
        if (!snapshot.empty) {
          document.getElementById("duplicateModal").style.display = "flex";
          btn.disabled = false;
          btn.innerHTML = "Hantar / Submit &rarr;";
          return;
        }
      } else {
        // Non-citizen: check foreignID uniqueness instead of IC
        let foreignIDVal = (sectionADraftPre.foreignID || "").trim();
        foreignIDVal = idType === "MyTentera" ? formatMyTentera(foreignIDVal) :
                        idType === "Passport"  ? formatPassport(foreignIDVal)  :
                        foreignIDVal;
        if (foreignIDVal) {
          const snapForeign = await db.collection("registrations")
            .where("sectionA.foreignID", "==", foreignIDVal)
            .get();
          if (!snapForeign.empty) {
            document.getElementById("duplicateModal").style.display = "flex";
            btn.disabled = false;
            btn.innerHTML = "Hantar / Submit &rarr;";
            return;
          }
        }
        icVal = ""; // store empty IC for non-citizens
      }

      // ── Collect all section data ──
      btn.textContent = "Menghantar... / Submitting...";
      saveSectionEDraft();

      const sectionADraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionA") || "{}");
      const sectionBDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionB") || "{}");
      const sectionCDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionC") || "{}");
      const sectionDDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionD") || "{}");
      const sectionEDraft = JSON.parse(localStorage.getItem("bem_otr_draft_sectionE") || "{}");

      const registrationData = {
        name:        (sectionADraft.fullName || "").toUpperCase(),
        icNo:        icVal,
        dateApplied: new Date().toISOString().split("T")[0],
        approved:    true,
        approvedAt:  firebase.firestore.Timestamp.fromDate(new Date()),
        idType:      sectionADraft.idType || idType,
        uniqueID:    generateUniqueID(
          sectionADraft.fullName,
          sectionADraft.idType || idType,
          icVal,
          sectionADraft.yearJoining,
          sectionADraft.foreignID
        ),
        memberRole:  sectionADraft.memberRole || "",
        photoURL:    photoDataURL || "",

        // Behalf registration data (only if in behalf mode)
        ...(IS_BEHALF_MODE && {
          behalfRegistration: true,
          behalfRegistrantIC:   sessionStorage.getItem("behalf_registrant_ic") || "",
          behalfRegistrantName: sessionStorage.getItem("behalf_registrant_name") || "",
          behalfRelationship:   document.getElementById("behalfRelationship")?.value || "",
          behalfReason:         document.querySelector('input[name="behalfReason"]:checked')?.value || "",
          behalfOtherReason:    document.getElementById("behalfOtherReason")?.value || "",
        }),

        sectionA: {
          fullName:        (sectionADraft.fullName || "").toUpperCase(),
          icNo:            icVal,
          idType:          sectionADraft.idType || idType,
          gender:          sectionADraft.gender          || "",
          dob:             sectionADraft.dob             || "",
          race:            sectionADraft.race            || "",
          maritalStatus:   sectionADraft.maritalStatus   || "",
          partnerName:     sectionADraft.partnerName     || "",
          latePartnerName: sectionADraft.latePartnerName || "",
          baptismStatus:   sectionADraft.baptismStatus   || "",
          baptismYear:     sectionADraft.baptismYear     || "",
          citizenship:     sectionADraft.citizenship     || "",
          countryOfOrigin: sectionADraft.countryOfOrigin || "",
          foreignID:       sectionADraft.foreignID       || "",
          phoneNumber:     sectionADraft.phoneNumber     || "",
          occupation:      sectionADraft.occupation      || "",
          originalChurch:  sectionADraft.originalChurch  || "",
          yearJoining:     sectionADraft.yearJoining     || "",
          komselCode:      sectionADraft.komselCode      || "",
          currentAddress:  sectionADraft.currentAddress  || "",
        },
        sectionB: {
          services:         sectionBDraft.services         || {},
          othersChecked:    sectionBDraft.othersChecked     || false,
          othersServiceName:sectionBDraft.othersServiceName || "",
          othersInvolvement:sectionBDraft.othersInvolvement || "",
        },
        sectionC: { children: sectionCDraft.children || [] },
        sectionD: { pledgeAgreed: sectionDDraft.pledgeAgreed || false },
        sectionE: {
          komsel: document.getElementById("confessionKomsel")?.value || "",
          since:  document.getElementById("confessionSince")?.value  || "",
          leader: document.getElementById("confessionLeader")?.value || "",
          name:   document.getElementById("confessionName")?.value   || "",
          date:   document.getElementById("confessionDate")?.value   || "",
        },
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      // ── Save to Firestore ──
      const newDocRef = await db.collection("registrations").add(registrationData);

      // ── Sync children to partner's record if partner was matched ──
      if (partnerFoundData?.docId) {
        const children = sectionCDraft.children || [];
        const validChildren = children.filter(c => c.name?.trim() && c.gender);
        if (validChildren.length > 0) {
          try {
            // Fetch partner's current record
            const partnerDoc = await db.collection("registrations").doc(partnerFoundData.docId).get();
            if (partnerDoc.exists) {
              const partnerCurrentChildren = partnerDoc.data().sectionC?.children || [];
              const partnerValidChildren   = partnerCurrentChildren.filter(c => c.name?.trim() && c.gender);
              // Only update if partner has no children recorded yet
              if (partnerValidChildren.length === 0) {
                await db.collection("registrations").doc(partnerFoundData.docId).update({
                  "sectionC.children": validChildren,
                  "sectionC.syncedFromPartner": true,
                  "sectionC.syncedFromPartnerUID": registrationData.uniqueID || "",
                  lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                });
              }
            }
          } catch(syncErr) {
            console.warn("Partner children sync failed (non-critical):", syncErr.message);
            // Non-critical — don't block the main submission
          }
        }
      }

      // ── Clear local drafts ──
      ["bem_otr_draft_sectionA","bem_otr_draft_sectionB","bem_otr_draft_sectionC",
       "bem_otr_draft_sectionD","bem_otr_draft_sectionE"].forEach(k => localStorage.removeItem(k));

      showSuccessPage();

    } catch (err) {
      console.error("Submission error:", err);
      alert("Ralat semasa menghantar borang. Sila cuba lagi.\nError submitting form. Please try again.\n\n" + err.message);
      btn.disabled = false;
      btn.innerHTML = "Hantar / Submit &rarr;";
    }
  });

  // Close duplicate modal
  document.getElementById("closeDuplicateModal")?.addEventListener("click", () => {
    document.getElementById("duplicateModal").style.display = "none";
  });

  // Success page back button
  document.getElementById("btnSuccessBack")?.addEventListener("click", () => {
    location.reload();
  });
}

function isSectionEComplete() {
  const since  = (document.getElementById("confessionSince")?.value  || "").trim();
  const leader = (document.getElementById("confessionLeader")?.value || "").trim();
  return !!since && !!leader;
}

function checkSectionESubmit() {
  const btn = document.getElementById("btnSubmit");
  if (!btn) return;
  const ok = isSectionEComplete();
  btn.disabled = false;
  btn.dataset.ready = ok ? "true" : "false";
  btn.style.opacity = ok ? "" : "0.45";
  btn.style.cursor  = ok ? "" : "not-allowed";
}

function showSectionEModal() {
  let modal = document.getElementById("sectionEValidModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "sectionEValidModal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card modal-card--sm">
        <div class="modal-header">
          <h3 class="modal-title" style="color:#E8A000;">⚠️ Maklumat Tidak Lengkap / Incomplete Info</h3>
        </div>
        <div class="modal-body" style="padding:1.2rem 1.5rem;text-align:center;">
          <p style="font-size:0.95rem;color:var(--text-primary);line-height:1.7;margin-bottom:0.5rem;">
            Sila masukkan maklumat <strong>'Menyertai sejak tahun bila'</strong> dan <strong>'nama ketua KOMSEL'</strong> anda sebelum meneruskan.
          </p>
          <p style="font-size:0.83rem;color:var(--text-muted);font-style:italic;line-height:1.6;">
            Please enter the <strong>'year since you joined the cell group'</strong> and <strong>'Under whose leadership'</strong> field before proceeding.
          </p>
        </div>
        <div class="modal-footer" style="justify-content:center;">
          <button class="btn btn-primary" id="btnSectionEModalOk">OK</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById("btnSectionEModalOk").addEventListener("click", () => {
      modal.style.display = "none";
      document.getElementById("confessionSince")?.focus();
    });
  }
  modal.style.display = "flex";
}

function syncConfessionRefs() {
  const map = {
    confessionKomsel: "syncKomsel",
    confessionSince:  "syncSince",
    confessionLeader: "syncLeader",
    confessionName:   "syncName",
  };
  Object.entries(map).forEach(([inputId, refId]) => {
    const input = document.getElementById(inputId);
    const ref   = document.getElementById(refId);
    if (!input || !ref) return;
    ref.textContent = input.value.trim() || "___";
  });
}

function showSuccessPage() {
  document.getElementById("registrationForm").style.display = "none";
  document.getElementById("successPage").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveSectionEDraft() {
  const data = {
    since:   document.getElementById("confessionSince")?.value  || "",
    leader:  document.getElementById("confessionLeader")?.value || "",
    date:    document.getElementById("confessionDate")?.value   || "",
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY_E, JSON.stringify(data));
}

function loadSectionEDraft() {
  const raw = localStorage.getItem(DRAFT_KEY_E);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.since)  document.getElementById("confessionSince").value  = data.since;
    if (data.leader) document.getElementById("confessionLeader").value = data.leader;
    if (data.date)   document.getElementById("confessionDate").value   = data.date;
  } catch (e) {
    console.warn("Could not load Section E draft:", e);
  }
}

// ── Init Section E ──
document.addEventListener("DOMContentLoaded", () => {
  initSectionE();
});