"use strict";
/* ═══════════════════════════════════════════════
   BEM On The Rock — payment.js
   Annual fee: RM10/year per active/inactive member
═══════════════════════════════════════════════ */

document.getElementById("payFooterYear").textContent = new Date().getFullYear();

const ANNUAL_FEE   = 10;
let memberDocId    = null;
let memberData      = null;
let pendingFees     = [];
let receiptBlob     = null; // compressed receipt image (Blob), required for bank transfer
let receiptPreviewURL = null; // local object URL for the thumbnail preview only

// ── Compress an image file down to a target size (default 600KB) ──
// Iteratively reduces JPEG quality, then dimensions, until under the target.
// Resolves with a Blob (for upload to Storage) rather than a data URL.
function compressReceiptImage(file, targetBytes = 600 * 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image-failed"));
      img.onload = () => {
        let width  = img.width;
        let height = img.height;
        const maxDim = 1600; // cap initial dimension for large photos
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width  = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        const ctx    = canvas.getContext("2d");

        function render(w, h) {
          canvas.width  = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
        }

        function tryQuality(quality, w, h, attemptsLeft) {
          render(w, h);
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error("compression-failed")); return; }
            if (blob.size <= targetBytes || attemptsLeft <= 0) {
              resolve(blob);
              return;
            }
            if (quality > 0.4) {
              tryQuality(quality - 0.1, w, h, attemptsLeft - 1);
            } else {
              // Quality floor reached — shrink dimensions instead
              tryQuality(0.7, Math.round(w * 0.8), Math.round(h * 0.8), attemptsLeft - 1);
            }
          }, "image/jpeg", quality);
        }

        tryQuality(0.85, width, height, 12);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Screen navigation ──
function showScreen(id) {
  ["screen-verify","screen-payment","screen-cash","screen-transfer"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("active", s === id);
  });
  window.scrollTo({ top:0, behavior:"smooth" });
}

// ── ID format helper ──
function formatIC(v) {
  const d = v.replace(/\D/g,"");
  let f = d;
  if (d.length > 6) f = d.substring(0,6) + "-" + d.substring(6);
  if (d.length > 8) f = f.substring(0,9) + "-" + d.substring(8);
  return f.substring(0,14);
}

document.getElementById("payID").addEventListener("input", function() {
  const type = document.getElementById("payIDType").value;
  if (type === "IC" || type === "MyTentera") this.value = formatIC(this.value);
});

document.getElementById("payIDType").addEventListener("change", function() {
  document.getElementById("payID").value = "";
  document.getElementById("err-payID").textContent = "";
  const placeholders = {
    IC:         "cth/e.g. 901231-14-5678",
    Passport:   "cth/e.g. A12345678",
    MyTentera:  "cth/e.g. 901231-14-5678",
  };
  document.getElementById("payID").placeholder = placeholders[this.value] || "";
});

// ── Verify ──
document.getElementById("btnCheckPayment").addEventListener("click", async () => {
  const idType = document.getElementById("payIDType").value;
  const rawVal = document.getElementById("payID").value.trim();
  const errEl  = document.getElementById("err-payID");
  const notice = document.getElementById("payNotice");
  errEl.textContent = "";

  // Validate
  if (idType === "IC" || idType === "MyTentera") {
    const digits = rawVal.replace(/-/g,"");
    if (digits.length !== 12 || isNaN(digits)) {
      errEl.textContent = "Sila masukkan No. KP/MyTentera yang sah (12 digit). / Please enter a valid 12-digit IC/MyTentera No.";
      return;
    }
  } else if (idType === "Passport") {
    if (rawVal.length < 4) {
      errEl.textContent = "Sila masukkan No. Passport yang sah. / Please enter a valid Passport No.";
      return;
    }
  }

  notice.textContent = "Menyemak... / Checking...";
  try {
    let snap;
    if (idType === "IC" || idType === "MyTentera") {
      const digits = rawVal.replace(/-/g,"");
      snap = await db.collection("registrations").where("icNo","==",digits).limit(1).get();
    } else {
      snap = await db.collection("registrations")
        .where("sectionA.foreignID","==",rawVal.toUpperCase()).limit(1).get();
    }

    if (snap.empty) {
      errEl.textContent = "Tiada rekod dijumpai. / No record found with this ID.";
      notice.textContent = "";
      return;
    }

    memberDocId = snap.docs[0].id;
    memberData  = snap.docs[0].data();
    notice.textContent = "";
    populatePaymentScreen();
    showScreen("screen-payment");

  } catch(e) {
    errEl.textContent = "Ralat sistem. / System error.";
    notice.textContent = "";
    console.error(e);
  }
});

// ── Calculate pending fees ──
function calculatePendingFees(reg) {
  const currentYear  = new Date().getFullYear();
  const approvedAt   = reg.approvedAt?.toDate ? reg.approvedAt.toDate() : null;
  const paidYears    = reg.paidYears || [];
  const rejectedReqs = (reg.paymentRequests || []).filter(r => r.status === "rejected");
  const rejectedYears = rejectedReqs.flatMap(r => r.years || []);

  const startYear = approvedAt ? approvedAt.getFullYear() : currentYear;
  const fees = [];
  for (let y = startYear; y <= currentYear; y++) {
    if (!paidYears.includes(y)) {
      const matchingReject = rejectedReqs
        .slice()
        .reverse()
        .find(r => (r.years || []).includes(y));
      fees.push({
        year:     y,
        label:    `${y} Yuran Tahunan / Annual Fee`,
        amount:   ANNUAL_FEE,
        rejected: rejectedYears.includes(y),
        rejectionReason: matchingReject?.rejectionReason || "",
      });
    }
  }
  return fees;
}

// ── Populate payment screen ──
function populatePaymentScreen() {
  const a = memberData.sectionA || {};

  // Photo
  const photoEl = document.getElementById("payMemberPhoto");
  photoEl.innerHTML = memberData.photoURL
    ? `<img src="${memberData.photoURL}" style="width:52px;height:65px;object-fit:cover;border-radius:4px;border:1.5px solid var(--marigold-dim);" alt="Photo"/>`
    : `<div style="width:52px;height:65px;background:var(--bg-input);border-radius:4px;border:1.5px solid var(--border-input);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">👤</div>`;

  document.getElementById("payMemberName").textContent =
    (a.fullName || memberData.name || "—").toUpperCase();
  document.getElementById("payMemberUID").textContent =
    `ID: ${memberData.uniqueID || "—"}`;

  const statusText  = memberData.approved    ? "✔ Aktif / Active"
                    : memberData.transferred ? "↗ Berpindah / Transferred"
                    : "✖ Tidak Aktif / Inactive";
  const statusColor = memberData.approved    ? "#4CAF7D"
                    : memberData.transferred ? "#3B9EE8"
                    : "#E05555";
  document.getElementById("payMemberStatus").innerHTML =
    `<span style="color:${statusColor};font-weight:700;font-size:0.85rem;">${statusText}</span>`;

  // Pending fees
  pendingFees = calculatePendingFees(memberData);
  const tbody = document.getElementById("paymentTableBody");
  tbody.innerHTML = "";

  if (pendingFees.length === 0) {
    document.getElementById("payActionArea").style.display = "none";
    document.getElementById("allPaidMsg").style.display    = "block";
    document.getElementById("payTotalAmount").textContent  = "RM 0.00";
  } else {
    document.getElementById("payActionArea").style.display = "block";
    document.getElementById("allPaidMsg").style.display    = "none";

    pendingFees.forEach((fee, i) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid var(--border-card)";
      if (i % 2 !== 0) tr.style.background = "rgba(255,255,255,0.02)";
      const rejectedBanner = fee.rejected ? `
        <div style="margin-top:0.4rem;font-size:0.78rem;color:#E05555;line-height:1.5;">
          ⚠️ Permohonan bayaran anda telah ditolak. / Your payment request was rejected.<br/>
          ${fee.rejectionReason ? `
          <strong>Sebab / Reason:</strong> ${fee.rejectionReason}<br/>` : ""}
          <em style="color:var(--text-muted);">Jika anda berpendapat bahawa ini adalah salah, sila maklumkan
          kepada mana-mana staf gereja. / If you think this is false, please inform any of the church staff.</em>
        </div>` : "";
      tr.innerHTML = `
        <td style="padding:0.7rem 1rem;color:var(--text-muted);font-size:0.85rem;">${i+1}</td>
        <td style="padding:0.7rem 1rem;color:var(--text-primary);">${fee.label}${rejectedBanner}</td>
        <td style="padding:0.7rem 1rem;text-align:right;font-weight:700;color:var(--marigold-bright);">
          RM ${fee.amount.toFixed(2)}
        </td>
        <td style="padding:0.7rem 1rem;text-align:center;">
          <span style="color:#E05555;font-size:0.78rem;font-family:var(--font-display);letter-spacing:0.05em;">
            Belum Dibayar / Unpaid
          </span>
        </td>`;
      tbody.appendChild(tr);
    });

    const total = pendingFees.reduce((sum, f) => sum + f.amount, 0);
    document.getElementById("payTotalAmount").textContent = `RM ${total.toFixed(2)}`;
    document.getElementById("transferAmountDisplay").textContent = `RM ${total.toFixed(2)}`;
  }

  // Payment history
  const paidYears      = memberData.paidYears || [];
  const paymentHistory = memberData.paymentHistory || [];
  const historyWrap    = document.getElementById("payHistoryWrap");
  const historyBody    = document.getElementById("payHistoryBody");

  if (paidYears.length > 0) {
    historyWrap.style.display = "block";
    historyBody.innerHTML = [...paidYears].sort((a,b) => b - a).map((year, i) => {
      const record = paymentHistory.find(h => h.year === year);
      const method = record?.method === "cash"     ? "💵 Tunai / Cash"
                   : record?.method === "transfer" ? "🏦 Pindahan Bank / Bank Transfer"
                   : "—";
      const date   = record?.confirmedAt
        ? new Date(record.confirmedAt).toLocaleDateString("en-GB")
        : "—";
      const rowBg  = i % 2 !== 0 ? "background:rgba(255,255,255,0.02);" : "";
      return `<tr style="border-bottom:1px solid var(--border-card);${rowBg}">
        <td style="padding:0.7rem 1rem;font-weight:700;color:var(--text-primary);">${year}</td>
        <td style="padding:0.7rem 1rem;text-align:center;color:var(--text-primary);">${method}</td>
        <td style="padding:0.7rem 1rem;text-align:center;color:var(--text-muted);">${date}</td>
      </tr>`;
    }).join("");
  } else {
    historyWrap.style.display = "none";
  }
}

// ── Back button ──
document.getElementById("btnBackPayment").addEventListener("click", () => showScreen("screen-verify"));

// ── Cash flow ──
document.getElementById("btnPayCash").addEventListener("click", () => {
  document.getElementById("cashNotice").textContent = "";
  document.getElementById("cashPendingNotice").style.display = "none";
  showScreen("screen-cash");
});
document.getElementById("btnBackFromCash").addEventListener("click", () => showScreen("screen-payment"));

document.getElementById("btnConfirmCash").addEventListener("click", async () => {
  const btn     = document.getElementById("btnConfirmCash");
  const notice  = document.getElementById("cashNotice");
  const pending = document.getElementById("cashPendingNotice");
  btn.disabled  = true;
  btn.textContent = "Menghantar... / Submitting...";
  notice.textContent = "";

  try {
    const years    = pendingFees.map(f => f.year);
    const existing = memberData.paymentRequests || [];

    // Duplicate guard — block if a pending request already covers any of the same years
    const hasDuplicate = existing.some(r =>
      r.status === "pending" && (r.years || []).some(y => years.includes(y))
    );
    if (hasDuplicate) {
      notice.style.color   = "#E05555";
      notice.textContent   = "⚠️ Anda sudah menghantar permohonan yang sedang menunggu pengesahan. Sila tunggu pentadbir mengesahkan atau menolak permohonan anda terlebih dahulu. / You already have a pending request for these year(s). Please wait for admin to confirm or reject it first.";
      btn.disabled   = false;
      btn.textContent = "✅ Saya Sudah Membayar / I Have Paid";
      return;
    }

    const req = {
      id:        db.collection("_").doc().id,
      method:    "cash",
      status:    "pending",
      years,
      amount:    pendingFees.reduce((s,f) => s+f.amount, 0),
      submittedAt: new Date().toISOString(),
    };
    await db.collection("registrations").doc(memberDocId).update({
      paymentRequests: [...existing, req],
    });
    memberData.paymentRequests = [...existing, req];
    pending.style.display = "block";
    notice.style.color    = "#4CAF7D";
    notice.textContent    = "✅ Permohonan dihantar. Sila tunggu pengesahan pentadbir. / Request submitted. Please await admin confirmation.";
  } catch(e) {
    console.error(e);
    notice.style.color    = "#E05555";
    notice.textContent    = "Ralat semasa menghantar. / Error while submitting.";
  }
  btn.disabled    = false;
  btn.textContent = "✅ Saya Sudah Membayar / I Have Paid";
});

// ── Bank transfer flow ──
document.getElementById("btnPayTransfer").addEventListener("click", () => {
  document.getElementById("transferNotice").textContent = "";
  document.getElementById("transferPendingNotice").style.display = "none";
  resetReceiptState();
  showScreen("screen-transfer");
});
document.getElementById("btnBackFromTransfer").addEventListener("click", () => showScreen("screen-payment"));

function resetReceiptState() {
  receiptBlob = null;
  if (receiptPreviewURL) { URL.revokeObjectURL(receiptPreviewURL); receiptPreviewURL = null; }
  document.getElementById("transferReceiptInput").value = "";
  document.getElementById("receiptPreviewWrap").style.display = "none";
  document.getElementById("receiptCompressStatus").textContent = "";
  document.getElementById("err-transferReceipt").textContent = "";
  document.getElementById("btnConfirmTransfer").disabled = true;
}

document.getElementById("transferReceiptInput").addEventListener("change", async function() {
  const file      = this.files[0];
  const statusEl  = document.getElementById("receiptCompressStatus");
  const errEl     = document.getElementById("err-transferReceipt");
  const confirmBtn = document.getElementById("btnConfirmTransfer");
  errEl.textContent = "";
  receiptBlob = null;
  if (receiptPreviewURL) { URL.revokeObjectURL(receiptPreviewURL); receiptPreviewURL = null; }
  confirmBtn.disabled = true;
  document.getElementById("receiptPreviewWrap").style.display = "none";

  if (!file) { statusEl.textContent = ""; return; }

  if (!file.type.startsWith("image/")) {
    errEl.textContent = "Sila muat naik fail imej sahaja. / Please upload an image file only.";
    this.value = "";
    return;
  }

  statusEl.textContent = `Memampatkan imej... / Compressing image... (${(file.size/1024/1024).toFixed(1)} MB)`;
  try {
    const blob = await compressReceiptImage(file, 600 * 1024);
    receiptBlob = blob;
    receiptPreviewURL = URL.createObjectURL(blob);
    statusEl.textContent = `✅ Resit sedia (${(blob.size/1024).toFixed(0)} KB). / Receipt ready (${(blob.size/1024).toFixed(0)} KB).`;
    document.getElementById("receiptPreviewImg").src = receiptPreviewURL;
    document.getElementById("receiptPreviewWrap").style.display = "block";
    confirmBtn.disabled = false;
  } catch (e) {
    console.error(e);
    statusEl.textContent = "";
    errEl.textContent = "Gagal memproses imej. Sila cuba semula. / Failed to process image. Please try again.";
    this.value = "";
  }
});

// Copy account number
document.getElementById("btnCopyAcc").addEventListener("click", () => {
  const num = document.getElementById("bankAccNum").textContent.replace(/\s/g,"");
  navigator.clipboard.writeText(num).then(() => {
    const btn = document.getElementById("btnCopyAcc");
    btn.textContent = "✅ Disalin!";
    setTimeout(() => { btn.textContent = "📋 Salin / Copy"; }, 2000);
  });
});

document.getElementById("btnConfirmTransfer").addEventListener("click", async () => {
  const btn     = document.getElementById("btnConfirmTransfer");
  const notice  = document.getElementById("transferNotice");
  const pending = document.getElementById("transferPendingNotice");
  const errEl   = document.getElementById("err-transferReceipt");

  if (!receiptBlob) {
    errEl.textContent = "Sila muat naik resit pembayaran anda terlebih dahulu. / Please upload your payment receipt first.";
    return;
  }
  errEl.textContent = "";

  btn.disabled  = true;
  btn.textContent = "Menghantar... / Submitting...";
  notice.textContent = "";

  try {
    const years    = pendingFees.map(f => f.year);
    const existing = memberData.paymentRequests || [];

    // Duplicate guard — block if a pending request already covers any of the same years
    const hasDuplicate = existing.some(r =>
      r.status === "pending" && (r.years || []).some(y => years.includes(y))
    );
    if (hasDuplicate) {
      notice.style.color   = "#E05555";
      notice.textContent   = "⚠️ Anda sudah menghantar permohonan yang sedang menunggu pengesahan. Sila tunggu pentadbir mengesahkan atau menolak permohonan anda terlebih dahulu. / You already have a pending request for these year(s). Please wait for admin to confirm or reject it first.";
      btn.disabled    = false;
      btn.textContent = "✅ Saya Sudah Membuat Pindahan / I Have Transferred";
      return;
    }

    const reqId = db.collection("_").doc().id;

    // Upload the compressed receipt to Firebase Storage (not Firestore —
    // keeps the registration document well under the 1MB Firestore limit).
    // We store the Storage PATH here, not a getDownloadURL() result — that
    // URL carries an access token that bypasses Storage rules once it
    // exists, and this document is publicly readable in Firestore, so
    // persisting the URL here would defeat the admin-only read rule.
    // admin-payment.js generates a fresh download URL on demand instead.
    statusUploadNotice(notice, "Memuat naik resit... / Uploading receipt...");
    const receiptPath = `receipts/${memberDocId}/${reqId}.jpg`;
    await storage.ref().child(receiptPath).put(receiptBlob, { contentType: "image/jpeg" });

    const req = {
      id:          reqId,
      method:      "transfer",
      status:      "pending",
      years,
      amount:      pendingFees.reduce((s,f) => s+f.amount, 0),
      submittedAt: new Date().toISOString(),
      receiptPath, // Storage path only — admin generates the download URL on demand
    };
    await db.collection("registrations").doc(memberDocId).update({
      paymentRequests: [...existing, req],
    });
    memberData.paymentRequests = [...existing, req];
    pending.style.display = "block";
    notice.style.color    = "#4CAF7D";
    notice.textContent    = "✅ Permohonan dihantar. Sila tunggu pengesahan pentadbir. / Request submitted. Please await admin confirmation.";
    resetReceiptState();
    btn.textContent = "✅ Saya Sudah Membuat Pindahan / I Have Transferred";
    return; // keep confirm button disabled until a new receipt is attached
  } catch(e) {
    console.error(e);
    notice.style.color    = "#E05555";
    notice.textContent    = "Ralat semasa menghantar. / Error while submitting.";
  }
  btn.disabled    = false;
  btn.textContent = "✅ Saya Sudah Membuat Pindahan / I Have Transferred";
});

function statusUploadNotice(el, text) {
  el.style.color   = "var(--text-muted)";
  el.textContent   = text;
}