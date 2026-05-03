"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — membership-card.js
   Shared membership card rendering + download
   Used by: membership-card.html and admin.js (modal)
═══════════════════════════════════════════════ */

// ── Helpers ──────────────────────────────────
function formatDateFull(dateVal) {
  if (!dateVal) return "—";
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB"); // DD/MM/YYYY
}

function addYears(dateVal, n) {
  const d = dateVal?.toDate ? new Date(dateVal.toDate()) : new Date(dateVal);
  if (isNaN(d)) return null;
  d.setFullYear(d.getFullYear() + n);
  return d;
}

// ── Populate a card DOM element with member data ──
// cardEl:  the #membershipCard div (or equivalent inside modal)
function populateMembershipCard(cardEl, reg) {
  const a          = reg.sectionA || {};
  const approvedAt = reg.approvedAt;
  const validFrom  = approvedAt ? formatDateFull(approvedAt) : "Belum Diluluskan";
  const validUntil = approvedAt ? formatDateFull(addYears(approvedAt, 3)) : "—";
  const uid        = reg.uniqueID || "—";
  const name       = (a.fullName || reg.name || "—").toUpperCase();
  const gender     = a.gender === "male" ? "L" : a.gender === "female" ? "P" : "—";

  // Fill text fields
  cardEl.querySelector("#mcName")       && (cardEl.querySelector("#mcName").textContent       = name);
  cardEl.querySelector("#mcUID")        && (cardEl.querySelector("#mcUID").textContent        = uid);
  cardEl.querySelector("#mcGender")     && (cardEl.querySelector("#mcGender").textContent     = gender);
  cardEl.querySelector("#mcValidFrom")  && (cardEl.querySelector("#mcValidFrom").textContent  = validFrom);
  cardEl.querySelector("#mcValidUntil") && (cardEl.querySelector("#mcValidUntil").textContent = validUntil);

  // Status badge
  const badge = cardEl.querySelector("#mcStatusBadge");
  if (badge) {
    if (reg.deceased) {
      badge.textContent = "Meninggal / Deceased";
      badge.style.background = "linear-gradient(135deg,#333,#555)";
    } else if (reg.transferred) {
      badge.textContent = "Berpindah / Transferred";
      badge.style.background = "linear-gradient(135deg,#1565C0,#1976D2)";
    } else if (reg.approved) {
      badge.textContent = "Aktif / Active";
      badge.style.background = "linear-gradient(135deg,#2E7D32,#388E3C)";
    } else {
      badge.textContent = "Tidak Aktif / Inactive";
      badge.style.background = "linear-gradient(135deg,#B71C1C,#C62828)";
    }
  }

  // Photo
  const photoArea = cardEl.querySelector("#mcPhotoArea");
  if (photoArea) {
    if (reg.photoURL) {
      const img = document.createElement("img");
      img.src       = reg.photoURL;
      img.className = "mc-photo";
      img.alt       = "Photo";
      img.crossOrigin = "anonymous";
      photoArea.innerHTML = "";
      photoArea.appendChild(img);
    } else {
      photoArea.innerHTML = `<div class="mc-photo-placeholder">👤</div>`;
    }
  }
}

// ── Download card as PNG ──
async function downloadCardPNG(cardEl, filename) {
  const canvas = await html2canvas(cardEl, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });
  const link = document.createElement("a");
  link.download = filename + ".png";
  link.href     = canvas.toDataURL("image/png");
  link.click();
}

// ── Download card as PDF ──
async function downloadCardPDF(cardEl, filename) {
  const canvas = await html2canvas(cardEl, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });
  const { jsPDF } = window.jspdf;
  const imgData   = canvas.toDataURL("image/png");
  // Card is landscape credit-card ratio
  const pdf = new jsPDF({ orientation:"landscape", unit:"mm", format:[85.6, 54] });
  pdf.addImage(imgData, "PNG", 0, 0, 85.6, 54);
  pdf.save(filename + ".pdf");
}

// ══════════════════════════════════════════════
// MEMBER-FACING PAGE LOGIC
// (only runs if #screenVerify exists i.e. membership-card.html)
// ══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("screenVerify")) return; // not on this page

  document.getElementById("mcFooterYear").textContent = new Date().getFullYear();

  function formatIC(v) {
    const d = v.replace(/\D/g,"");
    let f = d;
    if (d.length>6) f = d.substring(0,6)+"-"+d.substring(6);
    if (d.length>8) f = f.substring(0,9)+"-"+d.substring(8);
    return f.substring(0,14);
  }

  document.getElementById("mcVerifyIC").addEventListener("input", function() {
    this.value = formatIC(this.value);
  });

  document.getElementById("btnVerifyMC").addEventListener("click", async () => {
    const ic     = document.getElementById("mcVerifyIC").value.replace(/-/g,"");
    const errEl  = document.getElementById("err-mcVerifyIC");
    const notice = document.getElementById("mcVerifyNotice");
    errEl.textContent = "";

    if (ic.length !== 12) {
      errEl.textContent = "Sila masukkan No. KP yang sah / Please enter a valid IC No.";
      return;
    }

    notice.textContent = "Menyemak... / Checking...";
    try {
      const snap = await db.collection("registrations")
        .where("icNo","==",ic)
        .where("approved","==",true)
        .get();

      if (snap.empty) {
        errEl.textContent = "Tiada rekod ahli aktif dengan No. KP ini / No active member found.";
        notice.textContent = "";
        return;
      }

      const reg = snap.docs[0].data();
      notice.textContent = "";
      const cardEl = document.getElementById("membershipCard");
      populateMembershipCard(cardEl, reg);

      // Show card, hide verify
      document.getElementById("screenVerify").style.display      = "none";
      document.getElementById("membershipCardWrap").style.display = "flex";
      window.scrollTo({ top:0, behavior:"smooth" });

      // Wire download buttons
      const safeName = (reg.sectionA?.fullName || "member").replace(/\s+/g,"-").toLowerCase();
      document.getElementById("btnDLPNG").onclick = () => downloadCardPNG(cardEl, `kad-keanggotaan-${safeName}`);
      document.getElementById("btnDLPDF").onclick = () => downloadCardPDF(cardEl, `kad-keanggotaan-${safeName}`);

    } catch(e) {
      errEl.textContent = "Ralat sistem / System error. Please try again.";
      notice.textContent = "";
    }
  });

  document.getElementById("btnBackToVerify").addEventListener("click", () => {
    document.getElementById("membershipCardWrap").style.display = "none";
    document.getElementById("screenVerify").style.display      = "block";
    document.getElementById("mcVerifyIC").value = "";
  });
});