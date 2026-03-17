"use client"

import { useEffect } from "react"

export const ACCENT_THEMES = [
  { id: "indigo", label: "Indigo", hex: "#4f46e5" },
  { id: "blue",   label: "Blue",   hex: "#2563eb" },
  { id: "green",  label: "Green",  hex: "#16a34a" },
  { id: "purple", label: "Purple", hex: "#9333ea" },
  { id: "rose",   label: "Rose",   hex: "#e11d48" },
] as const

export type AccentTheme = (typeof ACCENT_THEMES)[number]["id"]

export const THEME_KEY = "vitasync_accent"
export const AUTO_SYNC_KEY = "vitasync_auto_sync"
export const DARK_MODE_KEY = "vitasync_dark_mode"

export type DarkModePreference = "light" | "dark" | "system"

export function getStoredTheme(): AccentTheme {
  if (typeof window === "undefined") return "indigo"
  return (localStorage.getItem(THEME_KEY) as AccentTheme) ?? "indigo"
}

export function applyTheme(theme: AccentTheme) {
  document.documentElement.dataset.accent = theme
  localStorage.setItem(THEME_KEY, theme)
}

export function getStoredDarkMode(): DarkModePreference {
  if (typeof window === "undefined") return "system"
  return (localStorage.getItem(DARK_MODE_KEY) as DarkModePreference) ?? "system"
}

export function applyDarkMode(pref: DarkModePreference) {
  const isDark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", isDark)
  localStorage.setItem(DARK_MODE_KEY, pref)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.accent = getStoredTheme()
    applyDarkMode(getStoredDarkMode())

    // Keep "system" preference in sync with OS changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (getStoredDarkMode() === "system") applyDarkMode("system")
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return <>{children}</>
}
