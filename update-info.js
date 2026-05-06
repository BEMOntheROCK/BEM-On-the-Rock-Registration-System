"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — update-info.js (full rework)
═══════════════════════════════════════════════ */

document.getElementById("updateFooterYear").textContent = new Date().getFullYear();

let memberDocId     = null;
let memberData      = null;
let currentStep     = "a";
let newPhotoDataURL = null;

const STEPS = ["a","b","c","d","e"];

function formatIC(v) {
  const d = v.replace(/\D/g,"");
  let f = d;
  if (d.length>6) f = d.substring(0,6)+"-"+d.substring(6);
  if (d.length>8) f = f.substring(0,9)+"-"+d.substring(8);
  return f.substring(0,14);
}

function escHtml(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Format ISO date (YYYY-MM-DD) or Timestamp to DD/MM/YYYY for display ──
function formatDisplayDate(val) {
  if (!val) return "—";
  // Firestore Timestamp
  if (val?.toDate) return val.toDate().toLocaleDateString("en-GB"); // DD/MM/YYYY
  // ISO string or YYYY-MM-DD
  const d = new Date(val);
  if (isNaN(d)) return val; // return as-is if unparseable
  return d.toLocaleDateString("en-GB"); // DD/MM/YYYY
}
function showScreen(id) {
  document.getElementById("screen-verify").style.display = id==="screen-verify" ? "block" : "none";
  document.getElementById("screen-edit").style.display   = id==="screen-edit"   ? "block" : "none";
  window.scrollTo({top:0,behavior:"smooth"});
}

// ── Auto-verify from URL params (admin flow uses ?docId=, user flow uses ?ic=) ──
function tryAutoVerify() {
  const params  = new URLSearchParams(window.location.search);
  const docId   = params.get("docId");
  const icParam = params.get("ic");
  const isAdmin = params.get("admin") === "1";

  if (!docId && !icParam) return;

  const unsubscribe = auth.onAuthStateChanged(async () => {
    unsubscribe();
    try {
      let snap;
      if (docId) {
        // Admin flow — load by doc ID directly, skip IC verify screen
        const docSnap = await db.collection("registrations").doc(docId).get();
        if (docSnap.exists) {
          memberDocId = docSnap.id;
          memberData  = docSnap.data();
          if (isAdmin) {
            // Go straight to preview without showing IC screen at all
            try {
              showPreviewModal();
            } catch (previewErr) {
              console.error("Auto-verify preview render error:", previewErr);
            }
          } else {
            const icEl = document.getElementById("verifyIC");
            if (icEl) icEl.value = icParam || "";
            try {
              showPreviewModal();
            } catch (previewErr) {
              console.error("Auto-verify preview render error:", previewErr);
            }
          }
        }
      } else if (icParam) {
        // User flow — load by IC
        const ic = icParam.replace(/-/g,"");
        snap = await db.collection("registrations").where("icNo","==",ic).limit(1).get();
        if (!snap.empty) {
          memberDocId = snap.docs[0].id;
          memberData  = snap.docs[0].data();
          const icEl  = document.getElementById("verifyIC");
          if (icEl) icEl.value = icParam;
          try {
            showPreviewModal();
          } catch (previewErr) {
            console.error("Auto-verify preview render error:", previewErr);
          }
        }
      }
    } catch(e) {
      console.error("Auto-verify lookup error:", e);
    }
  });
}

// Wait for DOM + Firebase ready
document.addEventListener("DOMContentLoaded", () => {
  tryAutoVerify();
});

// ══════════════════════════════════════════════
// VERIFY — IC lookup
// ══════════════════════════════════════════════
document.getElementById("verifyIC").addEventListener("input", function() {
  this.value = formatIC(this.value);
});

document.getElementById("btnVerifyIC").addEventListener("click", async () => {
  const ic    = document.getElementById("verifyIC").value.replace(/-/g,"");
  const errEl = document.getElementById("err-verifyIC");
  const notice= document.getElementById("verifyNotice");
  errEl.textContent = "";

  if (ic.length !== 12) {
    errEl.textContent = "Sila masukkan No. KP yang sah / Please enter a valid IC No.";
    return;
  }

  notice.textContent = "Menyemak... / Checking...";
  try {
    const snap = await db.collection("registrations").where("icNo","==",ic).limit(1).get();
    if (snap.empty) {
      errEl.textContent = "Tiada rekod dijumpai / No record found.";
      notice.textContent = "";
      return;
    }
    memberDocId = snap.docs[0].id;
    memberData  = snap.docs[0].data();
    notice.textContent = "";
    try {
      showPreviewModal();
    } catch (previewErr) {
      console.error("Preview render error:", previewErr);
      errEl.textContent = "Rekod dijumpai, tetapi pratonton gagal dipaparkan / Record found, but preview failed to render.";
    }
  } catch(e) {
    console.error("IC verification error:", e);
    errEl.textContent = "Ralat sistem / System error.";
    notice.textContent = "";
  }
});

// ══════════════════════════════════════════════
// PREVIEW MODAL
// ══════════════════════════════════════════════
function vRow(label, value) {
  return `<div style="display:flex;flex-direction:column;gap:2px;padding:0.3rem 0;">
    <span style="font-family:var(--font-display);font-size:0.72rem;letter-spacing:0.07em;
      color:var(--marigold);font-style:italic;">${label}:</span>
    <span style="font-size:0.95rem;color:var(--text-primary);font-weight:600;">${value||"—"}</span>
  </div>`;
}

function sectionTitle(text) {
  return `<div style="font-family:var(--font-display);font-size:0.78rem;letter-spacing:0.08em;
    text-transform:uppercase;color:var(--marigold-bright);padding:0.8rem 0 0.4rem;
    border-bottom:1.5px solid var(--marigold-dim);margin-bottom:0.6rem;margin-top:1rem;">
    ${text}</div>`;
}

function vGrid(content) {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 1.5rem;
    margin-bottom:0.5rem;">${content}</div>`;
}

function showPreviewModal() {
  if (!memberData || typeof memberData !== "object") {
    throw new Error("Invalid member data for preview.");
  }
  const a = (memberData.sectionA && typeof memberData.sectionA === "object") ? memberData.sectionA : {};
  const b = (memberData.sectionB && typeof memberData.sectionB === "object") ? memberData.sectionB : {};
  const c = (memberData.sectionC && typeof memberData.sectionC === "object") ? memberData.sectionC : {};
  const d = (memberData.sectionD && typeof memberData.sectionD === "object") ? memberData.sectionD : {};
  const e = (memberData.sectionE && typeof memberData.sectionE === "object") ? memberData.sectionE : {};
  const gMap  = { male:"Lelaki / Male", female:"Perempuan / Female" };
  const msMap = { single:"Bujang / Single", engaged:"Bertunang / Engaged",
    married:"Berkahwin / Married", divorced:"Bercerai / Divorced", widowed:"Balu/Duda / Widowed" };
  const bMap  = { baptised:"Sudah Dibaptis / Baptised", notBaptised:"Belum Dibaptis / Not Baptised" };
  const rawChildren = Array.isArray(c.children) ? c.children : [];
  const kids = rawChildren.filter(k => k && typeof k === "object" && String(k.name || "").trim() && k.gender);
  const svcs = (b.services && typeof b.services === "object") ? b.services : {};
  const serviceLabels = Array.isArray(SERVICE_LIST) && SERVICE_LIST.length ? SERVICE_LIST : [];
  const pernah = serviceLabels
    .map((label, i) => ({ label, data: getServiceRowData(svcs, i + 1) }))
    .filter(({ data }) => data.have)
    .map(({ label }) => label)
    .join(", ") || "—";
  const ingin  = serviceLabels
    .map((label, i) => ({ label, data: getServiceRowData(svcs, i + 1) }))
    .filter(({ data }) => data.want)
    .map(({ label }) => label)
    .join(", ") || "—";
  const uid   = memberData.uniqueID || "—";
  const displayName = String(a.fullName || memberData.name || "—").toUpperCase();

  document.getElementById("previewModalName").innerHTML =
    `📋 <strong style="color:var(--marigold-bright)">${displayName}</strong>`;

  document.getElementById("previewModalBody").innerHTML = `
    ${memberData.photoURL ? `<div style="text-align:center;margin-bottom:1.2rem;">
      <img src="${memberData.photoURL}" style="width:80px;height:100px;object-fit:cover;
        border-radius:8px;border:2px solid var(--marigold);
        box-shadow:0 4px 16px rgba(255,140,0,0.3);"/></div>` : ""}

    ${sectionTitle("A. Maklumat Peribadi / Personal Information")}
    ${vGrid(`
      ${vRow("ID Unik / Unique ID", `<strong style="color:var(--marigold)">${uid}</strong>`)}
      ${vRow("Nama Penuh / Full Name", String(a.fullName || "—").toUpperCase())}
      ${vRow("No. KP / IC No.", a.citizenship==="nonCitizen"?(a.foreignID||"—"):(a.icNo||"—"))}
      ${vRow("Jantina / Gender", gMap[a.gender]||"—")}
      ${vRow("Tarikh Lahir / Date of Birth", formatDisplayDate(a.dob))}
      ${vRow("Bangsa / Race", a.race||"—")}
      ${vRow("Status Perkahwinan / Marital Status", msMap[a.maritalStatus]||"—")}
      ${a.partnerName ? vRow("Nama Pasangan / Partner's Name", a.partnerName) : ""}
      ${a.latePartnerName ? vRow("Nama Allahyarham", a.latePartnerName) : ""}
      ${vRow("Status Pembaptisan / Baptism", bMap[a.baptismStatus]||a.baptismStatus||"—")}
      ${a.baptismYear ? vRow("Tahun Pembaptisan / Year Baptised", a.baptismYear) : ""}
      ${vRow("Warganegara / Citizenship", a.citizenship==="nonCitizen"?"Bukan Warganegara / Non-Malaysian":"Warganegara Malaysia / Malaysian")}
      ${a.citizenship==="nonCitizen" ? vRow("Negara Asal / Country of Origin", a.countryOfOrigin||"—") : ""}
      ${vRow("No. Telefon / Phone", a.phoneNumber||"—")}
      ${vRow("Pekerjaan / Occupation", a.occupation||"—")}
      ${vRow("Gereja Asal / Original Church", a.originalChurch||"—")}
      ${vRow("Tahun Menyertai OTR / Year Joining", a.yearJoining||"—")}
      ${vRow("Jawatan Komsel / Cell Position", a.memberRole||"—")}
      ${vRow("Kod Komsel / Cell Code", a.komselCode||"—")}
    `)}
    <div style="grid-column:1/-1;">
      ${vRow("Alamat / Address", a.currentAddress||"—")}
    </div>

    ${sectionTitle("B. Pelayanan / Services")}
    ${vGrid(`
      ${vRow("Pernah Terlibat / Have Been Involved", pernah)}
      ${vRow("Ingin Sertai / Would Like to Be Involved", ingin)}
    `)}

    ${sectionTitle("C. Kanak-kanak / Children")}
    ${vGrid(kids.length
      ? kids.map((k,i)=>vRow(`Anak ${i+1} / Child ${i+1}`,`${k.name} (${gMap[k.gender]||"—"})`)).join("")
      : vRow("Kanak-kanak", "Tiada / None")
    )}

    ${sectionTitle("D &amp; E — Tidak boleh diedit / Not Editable")}
    ${vGrid(`
      ${vRow("Ikrar Dipersetujui / Pledge Agreed", d.pledgeAgreed ? "Ya / Yes" : "—")}
      ${vRow("Kod Komsel (E) / Cell Code", e.komsel||"—")}
      ${vRow("Ketua Komsel / Cell Leader", e.leader||"—")}
    `)}`;

  document.getElementById("previewModal").style.display = "flex";
}

document.getElementById("btnPreviewBack").addEventListener("click", () => {
  document.getElementById("previewModal").style.display = "none";
  document.getElementById("verifyIC").value = "";
  memberDocId = null; memberData = null;
});

document.getElementById("btnPreviewEdit").addEventListener("click", () => {
  if (!memberDocId) return;
  // Redirect to main registration page in edit mode — it handles all the form rendering
  window.location.href = `index.html?from=update&mode=edit&docId=${encodeURIComponent(memberDocId)}`;
});

// ══════════════════════════════════════════════
// STEP RENDERING
// ══════════════════════════════════════════════
function renderStep(step) {
  currentStep = step;
  const a=memberData.sectionA||{}, b=memberData.sectionB||{},
        c=memberData.sectionC||{}, d=memberData.sectionD||{}, e=memberData.sectionE||{};

  const wrap = document.getElementById("editSectionsWrap");
  if (step==="a") { wrap.innerHTML = buildSectionA(a); wireSectionAEvents(); }
  if (step==="b") { wrap.innerHTML = buildSectionB(b); }
  if (step==="c") { wrap.innerHTML = buildSectionC(c); wireSectionCEvents(); }
  if (step==="d") { wrap.innerHTML = buildSectionD(d); }
  if (step==="e") { wrap.innerHTML = buildSectionE(e); }

  const idx = STEPS.indexOf(step);
  document.getElementById("btnEditBack").textContent = idx===0 ? "↩ Lihat Semula / Preview" : "← Kembali / Back";
  document.getElementById("btnEditNext").textContent = idx===STEPS.length-1 ? "Semak Perubahan / Review →" : "Seterusnya / Next →";
  updateStepNav(step);
  window.scrollTo({top:0,behavior:"smooth"});
}

function updateStepNav(step) {
  document.querySelectorAll(".step[data-section]").forEach(el => {
    const s = el.dataset.section;
    el.classList.remove("active","completed");
    if (s===step) el.classList.add("active");
    else if (STEPS.indexOf(s)<STEPS.indexOf(step)) el.classList.add("completed");
  });
}

document.getElementById("btnEditBack").addEventListener("click", () => {
  const idx = STEPS.indexOf(currentStep);
  if (idx===0) {
    document.getElementById("screen-edit").style.display = "none";
    showPreviewModal();
  } else {
    renderStep(STEPS[idx-1]);
  }
});

document.getElementById("btnEditNext").addEventListener("click", () => {
  const idx = STEPS.indexOf(currentStep);
  if (idx===STEPS.length-1) { showChangesModal(); }
  else { renderStep(STEPS[idx+1]); }
});

// ══════════════════════════════════════════════
// SECTION A
// ══════════════════════════════════════════════
function buildSectionA(a) {
  const nc = a.citizenship==="nonCitizen";
  const icFmt = a.icNo?a.icNo.replace(/(\d{6})(\d{2})(\d{4})/,"$1-$2-$3"):"";
  const msOpts = ["single","engaged","married","divorced","widowed"]
    .map(v=>`<option value="${v}" ${a.maritalStatus===v?"selected":""}>${
      {single:"Bujang",engaged:"Bertunang",married:"Berkahwin",divorced:"Bercerai",widowed:"Balu/Duda"}[v]
    }</option>`).join("");

  return `<div class="section-header"><div class="section-badge">A</div>
    <div><h2 class="section-title">Maklumat Peribadi / Personal Information</h2></div></div>

  <div class="form-group full-width" style="margin-bottom:1rem;">
    <label class="form-label">Gambar / Photo</label>
    <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
      <div style="width:60px;height:75px;border-radius:6px;border:2px solid var(--marigold-dim);overflow:hidden;flex-shrink:0;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">
        ${memberData.photoURL?`<img src="${memberData.photoURL}" style="width:100%;height:100%;object-fit:cover;"/>`: "👤"}
      </div>
      <div>
        <label style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(255,140,0,0.08);
          border:1px solid var(--marigold-dim);border-radius:var(--radius);padding:0.4rem 1rem;
          font-family:var(--font-display);font-size:0.78rem;cursor:pointer;letter-spacing:0.04em;">
          <input type="file" id="editPhotoInput" accept=".jpg,.jpeg,.png,.webp" style="display:none;"/>
          📷 Tukar / Change
        </label>
        <div id="editPhotoPreviewWrap" style="display:none;margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem;">
          <img id="editPhotoPreviewImg" src="" style="width:60px;height:75px;object-fit:cover;border-radius:6px;border:2px solid var(--marigold);"/>
          <button type="button" id="editPhotoCancelBtn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;">✖</button>
        </div>
        <p class="field-hint" style="margin-top:0.3rem;">JPG/PNG/WEBP, maks 4MB</p>
        <span class="error-msg" id="err-editPhoto"></span>
      </div>
    </div>
  </div>

  <div class="form-grid">
    <div class="form-group full-width">
      <label class="form-label">Nama Penuh / Full Name <span class="required">*</span></label>
      <input type="text" id="ea-fullName" class="form-input" value="${escHtml(a.fullName||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">No. KP / IC No.</label>
      <input type="text" id="ea-icNo" class="form-input" value="${escHtml(icFmt)}" maxlength="14"
        ${nc?'disabled style="opacity:0.4;cursor:not-allowed;"':""}/>
      ${nc?`<span class="field-hint" style="font-style:italic;">Tidak berkaitan / Not applicable</span>`:""}
    </div>
    <div class="form-group">
      <label class="form-label">Jantina / Gender</label>
      <div class="checkbox-group">
        <label class="checkbox-label"><input type="radio" name="ea-gender" value="male" ${a.gender==="male"?"checked":""}/><span class="custom-radio"></span>Lelaki / Male</label>
        <label class="checkbox-label"><input type="radio" name="ea-gender" value="female" ${a.gender==="female"?"checked":""}/><span class="custom-radio"></span>Perempuan / Female</label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Tarikh Lahir / DOB</label>
      <input type="date" id="ea-dob" class="form-input" value="${escHtml(a.dob||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Bangsa / Race</label>
      <input type="text" id="ea-race" class="form-input" value="${escHtml(a.race||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">No. Telefon / Phone</label>
      <input type="tel" id="ea-phoneNumber" class="form-input" value="${escHtml(a.phoneNumber||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Pekerjaan / Occupation</label>
      <input type="text" id="ea-occupation" class="form-input" value="${escHtml(a.occupation||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Status Perkahwinan / Marital Status</label>
      <select id="ea-maritalStatus" class="form-input form-select">${msOpts}</select>
    </div>
    <div class="form-group" id="ea-partnerGroup" style="${(a.maritalStatus==="engaged"||a.maritalStatus==="married")?"":"display:none"}">
      <label class="form-label">Nama Pasangan / Partner Name</label>
      <input type="text" id="ea-partnerName" class="form-input" value="${escHtml(a.partnerName||"")}"/>
    </div>
    <div class="form-group" id="ea-latePartnerGroup" style="${a.maritalStatus==="widowed"?"":"display:none"}">
      <label class="form-label">Nama Allahyarham</label>
      <input type="text" id="ea-latePartnerName" class="form-input" value="${escHtml(a.latePartnerName||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Status Pembaptisan / Baptism</label>
      <div class="checkbox-group">
        <label class="checkbox-label"><input type="radio" name="ea-baptism" value="baptised" ${a.baptismStatus==="baptised"?"checked":""}/><span class="custom-radio"></span>Sudah Dibaptis</label>
        <label class="checkbox-label"><input type="radio" name="ea-baptism" value="notBaptised" ${a.baptismStatus==="notBaptised"?"checked":""}/><span class="custom-radio"></span>Belum Dibaptis</label>
      </div>
    </div>
    <div class="form-group" id="ea-baptismYrGroup" style="${a.baptismStatus==="baptised"?"":"display:none"}">
      <label class="form-label">Tahun Pembaptisan</label>
      <input type="number" id="ea-baptismYear" class="form-input" value="${escHtml(a.baptismYear||"")}" min="1920" max="2099" style="max-width:140px;" oninput="this.value=this.value.replace(/[^0-9]/g,'').substring(0,4)"/>
    </div>
    <div class="form-group">
      <label class="form-label">Warganegara / Citizenship</label>
      <div class="checkbox-group">
        <label class="checkbox-label"><input type="radio" name="ea-citizenship" value="citizen" ${!nc?"checked":""}/><span class="custom-radio"></span>Warganegara Malaysia</label>
        <label class="checkbox-label"><input type="radio" name="ea-citizenship" value="nonCitizen" ${nc?"checked":""}/><span class="custom-radio"></span>Bukan Warganegara</label>
      </div>
    </div>
    <div class="form-group" id="ea-countryGroup" style="${nc?"":"display:none"}">
      <label class="form-label">Negara Asal / Country of Origin</label>
      <input type="text" id="ea-countryOfOrigin" class="form-input" value="${escHtml(a.countryOfOrigin||"")}"/>
    </div>
    <div class="form-group" id="ea-foreignIDGroup" style="${nc?"":"display:none"}">
      <label class="form-label">Nombor ID / ID Number</label>
      <input type="text" id="ea-foreignID" class="form-input" value="${escHtml(a.foreignID||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Gereja Asal / Original Church</label>
      <input type="text" id="ea-originalChurch" class="form-input" value="${escHtml(a.originalChurch||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Tahun Menyertai OTR</label>
      <input type="text" id="ea-yearJoining" class="form-input" value="${escHtml(a.yearJoining||"")}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Jawatan Dalam Komsel</label>
      <div style="display:flex;flex-direction:column;gap:0.35rem;">
        ${["Pastoral","Ketua Zon","Ketua Komsel","Ahli Komsel"].map(r=>`
          <label class="checkbox-label"><input type="radio" name="ea-memberRole" value="${r}" ${a.memberRole===r?"checked":""}/>
          <span class="custom-radio"></span>${r}</label>`).join("")}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Kod Komsel / Cell Code</label>
      <input type="text" id="ea-komselCode" class="form-input" value="${escHtml(a.komselCode||"")}" style="text-transform:uppercase;"/>
    </div>
    <div class="form-group full-width">
      <label class="form-label">Alamat / Address</label>
      <textarea id="ea-currentAddress" class="form-input form-textarea" rows="3">${escHtml(a.currentAddress||"")}</textarea>
    </div>
  </div>`;
}

function wireSectionAEvents() {
  // Marital toggle
  document.getElementById("ea-maritalStatus")?.addEventListener("change", function() {
    const pg = document.getElementById("ea-partnerGroup");
    const lg = document.getElementById("ea-latePartnerGroup");
    if (pg) pg.style.display = (this.value==="engaged"||this.value==="married")?"":"none";
    if (lg) lg.style.display = this.value==="widowed"?"":"none";
  });
  // Baptism toggle
  document.querySelectorAll('input[name="ea-baptism"]').forEach(r =>
    r.addEventListener("change", function() {
      const bg = document.getElementById("ea-baptismYrGroup");
      if (bg) bg.style.display = this.value==="baptised"?"":"none";
    })
  );
  // Citizenship toggle
  document.querySelectorAll('input[name="ea-citizenship"]').forEach(r =>
    r.addEventListener("change", function() {
      const nc = this.value==="nonCitizen";
      const icEl = document.getElementById("ea-icNo");
      document.getElementById("ea-countryGroup").style.display  = nc?"":"none";
      document.getElementById("ea-foreignIDGroup").style.display= nc?"":"none";
      if (icEl) { icEl.disabled=nc; icEl.style.opacity=nc?"0.4":""; icEl.style.cursor=nc?"not-allowed":""; }
    })
  );
  // IC format
  document.getElementById("ea-icNo")?.addEventListener("input", function() { this.value=formatIC(this.value); });
  // Photo
  document.getElementById("editPhotoInput")?.addEventListener("change", function() {
    const file = this.files[0]; if (!file) return;
    const errEl = document.getElementById("err-editPhoto");
    if (file.size>4*1024*1024) { errEl.textContent="Saiz fail melebihi 4MB"; return; }
    errEl.textContent="Memproses...";
    compressImage(file, (dataURL) => {
      newPhotoDataURL = dataURL;
      document.getElementById("editPhotoPreviewImg").src = dataURL;
      document.getElementById("editPhotoPreviewWrap").style.display="flex";
      errEl.textContent="";
    });
  });
  document.getElementById("editPhotoCancelBtn")?.addEventListener("click", () => {
    newPhotoDataURL=null;
    document.getElementById("editPhotoPreviewWrap").style.display="none";
    document.getElementById("editPhotoInput").value="";
  });
}

// ══════════════════════════════════════════════
// SECTION B — Services
// ══════════════════════════════════════════════
const SERVICE_LIST = [
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

function getServiceRowData(services, index) {
  const numKey = String(index);
  const svcKey = `svc_${index}`;
  const row = services[numKey] || services[svcKey] || {};
  return {
    have: !!(row.have ?? row.current),
    want: !!(row.want ?? row.join),
  };
}

function buildSectionB(b) {
  const svcs = b.services||{};
  return `<div class="section-header"><div class="section-badge">B</div>
    <div><h2 class="section-title">Pelayanan / Services</h2></div></div>
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table style="width:100%;border-collapse:collapse;min-width:360px;">
      <thead><tr style="background:var(--bg-header);">
        <th style="padding:0.6rem 0.8rem;text-align:left;font-family:var(--font-display);font-size:0.75rem;color:var(--marigold-bright);">Pelayanan / Service</th>
        <th style="padding:0.6rem;text-align:center;font-family:var(--font-display);font-size:0.7rem;color:var(--marigold-bright);">Terlibat<br/><em>Involved</em></th>
        <th style="padding:0.6rem;text-align:center;font-family:var(--font-display);font-size:0.7rem;color:var(--marigold-bright);">Ingin Sertai<br/><em>Want to Join</em></th>
      </tr></thead>
      <tbody>${SERVICE_LIST.map((label, idx)=>{
        const num = idx + 1;
        const sv = getServiceRowData(svcs, num);
        return `<tr style="border-bottom:1px solid var(--border-card);">
          <td style="padding:0.5rem 0.8rem;font-size:0.9rem;color:var(--text-primary);">${label}</td>
          <td style="text-align:center;"><input type="checkbox" class="svc-have" data-key="${num}" ${sv.have?"checked":""}/></td>
          <td style="text-align:center;"><input type="checkbox" class="svc-want" data-key="${num}" ${sv.want?"checked":""}/></td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  </div>`;
}

// ══════════════════════════════════════════════
// SECTION C — Children
// ══════════════════════════════════════════════
function buildSectionC(c) {
  const kids = (c.children||[]).filter(k=>k.name?.trim()&&k.gender);
  return `<div class="section-header"><div class="section-badge">C</div>
    <div><h2 class="section-title">Kanak-kanak / Children (≤12 tahun)</h2></div></div>
  <div id="ec-childList" style="display:flex;flex-direction:column;gap:0.8rem;margin-bottom:1rem;">
    ${kids.map((k,i)=>childRowHTML(i,k)).join("")}
  </div>
  <button type="button" class="btn btn-secondary" id="ec-addChild" style="font-size:0.85rem;">+ Tambah Anak / Add Child</button>`;
}

function childRowHTML(i, k) {
  return `<div class="child-card" data-idx="${i}" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:var(--radius);padding:0.8rem;display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;">
    <input type="text" class="form-input ec-childName" data-idx="${i}" value="${escHtml(k?.name||"")}" placeholder="Nama anak / Child's name" style="flex:1;min-width:130px;"/>
    <div style="display:flex;gap:0.5rem;">
      <label class="checkbox-label"><input type="radio" name="ec-g-${i}" value="male" ${k?.gender==="male"?"checked":""}/><span class="custom-radio"></span>L</label>
      <label class="checkbox-label"><input type="radio" name="ec-g-${i}" value="female" ${k?.gender==="female"?"checked":""}/><span class="custom-radio"></span>P</label>
    </div>
    <button type="button" class="ec-remove" data-idx="${i}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;padding:0 0.2rem;">✖</button>
  </div>`;
}

function wireSectionCEvents() {
  const list = document.getElementById("ec-childList");
  document.getElementById("ec-addChild")?.addEventListener("click", () => {
    const idx = list.querySelectorAll(".child-card").length;
    list.insertAdjacentHTML("beforeend", childRowHTML(idx,{}));
    bindRemoveButtons();
  });
  bindRemoveButtons();

  function bindRemoveButtons() {
    document.querySelectorAll(".ec-remove").forEach(btn => {
      btn.onclick = () => { btn.closest(".child-card").remove(); reIndex(); };
    });
  }
  function reIndex() {
    document.querySelectorAll(".child-card").forEach((card,i) => {
      card.dataset.idx=i;
      card.querySelector(".ec-childName").dataset.idx=i;
      card.querySelector(".ec-remove").dataset.idx=i;
      card.querySelectorAll("input[type=radio]").forEach(r => r.name=`ec-g-${i}`);
    });
  }
}

// ══════════════════════════════════════════════
// SECTION D & E — View only
// ══════════════════════════════════════════════
function buildSectionD(d) {
  const pledges=["Saya menyokong visi gereja BEM On The Rock.","Saya mendokong & terlibat dalam pelayanan yang dipercayakan kepada saya.","Saya akan menghadiri ibadah secara konsisten.","Saya akan menyertai kumpulan sel (KOMSEL).","Saya akan mendukung gereja secara kewangan.","Saya akan hidup dalam kekudusan.","Saya akan menjadi saksi bagi Kristus.","Saya akan patuh kepada kepimpinan gereja."];
  return `<div class="section-header"><div class="section-badge">D</div>
    <div><h2 class="section-title">Ikrar / Pledge</h2>
    <p class="section-subtitle" style="color:var(--text-muted);font-style:italic;">Tidak boleh diedit / Not editable</p></div></div>
  <div style="background:rgba(255,140,0,0.04);border:1px solid rgba(255,140,0,0.15);border-radius:var(--radius);padding:1rem 1.2rem;opacity:0.75;">
    ${pledges.map((p,i)=>`<div style="display:flex;gap:0.6rem;margin-bottom:0.5rem;">
      <span style="color:var(--marigold);font-weight:700;min-width:18px;">${i+1}.</span>
      <span style="font-size:0.9rem;color:var(--text-primary);">${p}</span>
    </div>`).join("")}
    <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.8rem;font-style:italic;">Ikrar dipersetujui: ${d.pledgeAgreed?"Ya / Yes":"—"}</p>
  </div>`;
}

function buildSectionE(e) {
  return `<div class="section-header"><div class="section-badge">E</div>
    <div><h2 class="section-title">Pengakuan / Confession</h2>
    <p class="section-subtitle" style="color:var(--text-muted);font-style:italic;">Tidak boleh diedit / Not editable</p></div></div>
  <div style="background:rgba(255,140,0,0.04);border:1px solid rgba(255,140,0,0.15);border-radius:var(--radius);padding:1rem 1.2rem;opacity:0.75;">
    ${[["Kod Komsel",e.komsel],["Sejak",e.since],["Ketua Komsel",e.leader],["Nama",e.name],["Tarikh",e.date]]
      .map(([l,v])=>`<div style="display:flex;gap:0.6rem;margin-bottom:0.4rem;font-size:0.9rem;">
        <span style="color:var(--marigold);min-width:160px;">${l}:</span>
        <span style="color:var(--text-primary);">${v||"—"}</span>
      </div>`).join("")}
  </div>`;
}

// ══════════════════════════════════════════════
// COLLECT EDITS
// ══════════════════════════════════════════════
const FIELD_LABELS={
  fullName:"Nama Penuh",icNo:"No. KP",gender:"Jantina",dob:"Tarikh Lahir",
  race:"Bangsa",phoneNumber:"No. Telefon",occupation:"Pekerjaan",
  maritalStatus:"Status Perkahwinan",partnerName:"Nama Pasangan",
  latePartnerName:"Nama Allahyarham",baptismStatus:"Status Pembaptisan",
  baptismYear:"Tahun Pembaptisan",citizenship:"Warganegara",
  countryOfOrigin:"Negara Asal",foreignID:"Nombor ID",
  originalChurch:"Gereja Asal",yearJoining:"Tahun Menyertai",
  memberRole:"Jawatan Komsel",komselCode:"Kod Komsel",currentAddress:"Alamat",
};

function collectEdits() {
  const a = memberData.sectionA||{};
  const newA = {
    fullName:       (document.getElementById("ea-fullName")?.value||"").trim().toUpperCase()||a.fullName||"",
    icNo:           document.getElementById("ea-icNo")?.value?.replace(/-/g,"")||a.icNo||"",
    gender:         document.querySelector('input[name="ea-gender"]:checked')?.value||a.gender||"",
    dob:            document.getElementById("ea-dob")?.value||a.dob||"",
    race:           document.getElementById("ea-race")?.value||a.race||"",
    phoneNumber:    document.getElementById("ea-phoneNumber")?.value||a.phoneNumber||"",
    occupation:     document.getElementById("ea-occupation")?.value||a.occupation||"",
    maritalStatus:  document.getElementById("ea-maritalStatus")?.value||a.maritalStatus||"",
    partnerName:    (document.getElementById("ea-partnerName")?.value||"").toUpperCase()||a.partnerName||"",
    latePartnerName:(document.getElementById("ea-latePartnerName")?.value||"").toUpperCase()||a.latePartnerName||"",
    baptismStatus:  document.querySelector('input[name="ea-baptism"]:checked')?.value||a.baptismStatus||"",
    baptismYear:    document.getElementById("ea-baptismYear")?.value||a.baptismYear||"",
    citizenship:    document.querySelector('input[name="ea-citizenship"]:checked')?.value||a.citizenship||"",
    countryOfOrigin:document.getElementById("ea-countryOfOrigin")?.value||a.countryOfOrigin||"",
    foreignID:      document.getElementById("ea-foreignID")?.value||a.foreignID||"",
    originalChurch: document.getElementById("ea-originalChurch")?.value||a.originalChurch||"",
    yearJoining:    document.getElementById("ea-yearJoining")?.value||a.yearJoining||"",
    memberRole:     document.querySelector('input[name="ea-memberRole"]:checked')?.value||a.memberRole||"",
    komselCode:     (document.getElementById("ea-komselCode")?.value||"").toUpperCase()||a.komselCode||"",
    currentAddress: document.getElementById("ea-currentAddress")?.value||a.currentAddress||"",
  };

  const newServices = JSON.parse(JSON.stringify((memberData.sectionB||{}).services||{}));
  document.querySelectorAll(".svc-have").forEach(cb => {
    const k=cb.dataset.key; if(!newServices[k]) newServices[k]={};
    newServices[k].have=cb.checked;
  });
  document.querySelectorAll(".svc-want").forEach(cb => {
    const k=cb.dataset.key; if(!newServices[k]) newServices[k]={};
    newServices[k].want=cb.checked;
  });

  const newChildren=[];
  document.querySelectorAll(".child-card").forEach(card=>{
    const idx=card.dataset.idx;
    const name=(card.querySelector(".ec-childName")?.value||"").trim();
    const gender=card.querySelector(`input[name="ec-g-${idx}"]:checked`)?.value||"";
    if(name&&gender) newChildren.push({name,gender});
  });

  return { newA, newServices, newChildren };
}

// ══════════════════════════════════════════════
// CHANGES MODAL
// ══════════════════════════════════════════════
function showChangesModal() {
  const { newA, newServices, newChildren } = collectEdits();
  const oldA = memberData.sectionA||{};
  const rows = [];

  Object.keys(FIELD_LABELS).forEach(key => {
    const before=String(oldA[key]||"").trim();
    const after =String(newA[key]||"").trim();
    if(before!==after) rows.push({section:"A — Peribadi",field:FIELD_LABELS[key],before:before||"—",after:after||"—"});
  });

  const oldSvcs=(memberData.sectionB||{}).services||{};
  SERVICE_LIST.forEach((label, idx) => {
    const oldRow = getServiceRowData(oldSvcs, idx + 1);
    const newRow = getServiceRowData(newServices, idx + 1);
    const oc = oldRow.have, nc = newRow.have;
    const oj = oldRow.want, nj = newRow.want;
    if(oc!==nc) rows.push({section:"B — Pelayanan",field:`${label} (Terlibat)`,before:oc?"Ya":"Tidak",after:nc?"Ya":"Tidak"});
    if(oj!==nj) rows.push({section:"B — Pelayanan",field:`${label} (Ingin Sertai)`,before:oj?"Ya":"Tidak",after:nj?"Ya":"Tidak"});
  });

  const gMap={male:"Lelaki",female:"Perempuan"};
  const oldKids=(memberData.sectionC?.children||[]).filter(k=>k.name?.trim()&&k.gender);
  if(JSON.stringify(oldKids.map(k=>({n:k.name,g:k.gender})))!==JSON.stringify(newChildren.map(k=>({n:k.name,g:k.gender})))){
    const fmt=kids=>kids.length?kids.map(k=>`${k.name} (${gMap[k.gender]||"—"})`).join(", "):"Tiada";
    rows.push({section:"C — Kanak-kanak",field:"Senarai Anak",before:fmt(oldKids),after:fmt(newChildren)});
  }

  if(newPhotoDataURL) rows.push({section:"A — Peribadi",field:"Gambar / Photo",before:"(gambar lama)",after:"(gambar baru)"});

  const tbody=document.getElementById("changesTableBody");
  const noMsg=document.getElementById("noChangesMsg");
  const table=document.getElementById("changesTable");

  if(!rows.length){
    tbody.innerHTML=""; table.style.display="none"; noMsg.style.display="";
  } else {
    table.style.display=""; noMsg.style.display="none";
    tbody.innerHTML=rows.map(r=>`<tr style="border-bottom:1px solid var(--border-card);">
      <td style="padding:0.5rem 0.7rem;font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">${r.section}</td>
      <td style="padding:0.5rem 0.7rem;font-size:0.88rem;font-weight:600;color:var(--text-primary);">${r.field}</td>
      <td style="padding:0.5rem 0.7rem;font-size:0.85rem;color:#E05555;">${r.before}</td>
      <td style="padding:0.5rem 0.7rem;font-size:0.85rem;color:#4CAF7D;">${r.after}</td>
    </tr>`).join("");
  }

  window._pendingEdits = { newA, newServices, newChildren };
  document.getElementById("changesModal").style.display = "flex";
}

document.getElementById("btnBackToEdit").addEventListener("click", () => {
  document.getElementById("changesModal").style.display="none";
});

document.getElementById("btnSaveChanges").addEventListener("click", async () => {
  const btn=document.getElementById("btnSaveChanges");
  btn.disabled=true; btn.textContent="Menyimpan... / Saving...";
  try {
    const {newA,newServices,newChildren}=window._pendingEdits;
    const payload={
      name:              newA.fullName,
      sectionA:          newA,
      "sectionB.services": newServices,
      "sectionC.children": newChildren,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if(newPhotoDataURL) payload.photoURL=newPhotoDataURL;
    await db.collection("registrations").doc(memberDocId).update(payload);
    document.getElementById("changesModal").style.display="none";
    document.getElementById("screen-edit").style.display="none";
    document.getElementById("screen-success").style.display="block";
    window.scrollTo({top:0,behavior:"smooth"});
  } catch(e) {
    alert("Ralat menyimpan / Save error: "+e.message);
    btn.disabled=false; btn.textContent="💾 Simpan / Save";
  }
});

// ══════════════════════════════════════════════
// IMAGE COMPRESSION
// ══════════════════════════════════════════════
function compressImage(file, callback) {
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const size=Math.min(img.width,img.height);
      const sx=(img.width-size)/2, sy=(img.height-size)/2;
      const canvas=document.createElement("canvas");
      canvas.width=300; canvas.height=400;
      canvas.getContext("2d").drawImage(img,sx,sy,size,size,0,0,300,400);
      canvas.toBlob(blob=>{
        const r2=new FileReader();
        r2.onload=ev=>callback(ev.target.result);
        r2.readAsDataURL(blob);
      },"image/jpeg",0.6);
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}