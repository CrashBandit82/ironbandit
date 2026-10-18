// Theme handling. The source of truth once logged in is the user's server-stored
// `theme`; before login we fall back to the last locally-remembered choice, then
// to the device's system preference. `applyTheme` is also called by an inline
// script in index.html before React mounts, so there is no flash of the wrong theme.

const STORAGE_KEY = "ironbandit_theme"

export function systemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark"
}

export function storedTheme() {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === "light" || v === "dark" ? v : null
}

export function resolveInitialTheme() {
  return storedTheme() || systemTheme()
}

export function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark"
  document.documentElement.setAttribute("data-theme", t)
  return t
}

export function persistThemeLocal(theme) {
  localStorage.setItem(STORAGE_KEY, theme === "light" ? "light" : "dark")
}
