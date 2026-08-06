/* ═══════════════════════════════════════════════
   BEM On The Rock — firebase-config.js
   Firebase CDN Compat Version
   (Works with plain HTML/JS — no bundler needed)
═══════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            "AIzaSyDQJ6-w0_ImxptJ3hzb8fFh7BSR0xt4JB8",
  authDomain:        "bemontherock-registration-form.firebaseapp.com",
  projectId:         "bemontherock-registration-form",
  storageBucket:     "bemontherock-registration-form.firebasestorage.app",
  messagingSenderId: "550906923157",
  appId:             "1:550906923157:web:b8852e078955760b4af39c",
  measurementId:     "G-4ZC5243E1W"
};

// Initialize Firebase (compat SDK — loaded via CDN script tags)
firebase.initializeApp(firebaseConfig);

// Export globals for use in main.js and admin.js
const db      = firebase.firestore();
const auth    = firebase.auth();
// Some pages do not load firebase-storage-compat.js.
// Guard this so Firestore/Auth pages still work without Storage SDK.
const storage = typeof firebase.storage === "function" ? firebase.storage() : null;