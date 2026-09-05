export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("pmng_theme", next); } catch (e) { /* ignore */ }
  return next;
}

export function initTheme() {
  let stored = "light";
  try { stored = localStorage.getItem("pmng_theme") || "light"; } catch (e) { /* ignore */ }
  return applyTheme(stored);
}

export function readTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}
