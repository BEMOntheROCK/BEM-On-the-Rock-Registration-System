/* ═══════════════════════════════════════════════
   BEM On The Rock — theme.js
   Dark mode is the default. Saved preference overrides.
═══════════════════════════════════════════════ */

(function() {
  // Dark mode is default — only override if user has explicitly saved a preference
  const saved = localStorage.getItem("bem_theme");
  const isDark = saved ? saved === "dark" : true; // default: dark
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
})();

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("themeToggleWrap")) {
    const wrap = document.createElement("div");
    wrap.className = "theme-toggle-wrap";
    wrap.id = "themeToggleWrap";
    wrap.innerHTML = `
      <span class="theme-icon">☀️</span>
      <label class="theme-switch">
        <input type="checkbox" id="themeToggle"/>
        <span class="theme-slider"></span>
      </label>
      <span class="theme-icon">🌙</span>`;
    document.body.prepend(wrap);
  }

  const toggle = document.getElementById("themeToggle");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  toggle.checked = isDark;

  toggle.addEventListener("change", () => {
    const dark = toggle.checked;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("bem_theme", dark ? "dark" : "light");
  });
});