"use client"

import { useEffect } from "react"

/* ── Accent themes ─────────────────────────────────────────────────── */

export const ACCENT_THEMES = [
  { id: "rose",    label: "Coral",   hex: "#ef4444" },
  { id: "indigo",  label: "Indigo",  hex: "#4f46e5" },
  { id: "blue",    label: "Blue",    hex: "#2563eb" },
  { id: "green",   label: "Green",   hex: "#16a34a" },
  { id: "purple",  label: "Purple",  hex: "#9333ea" },
  { id: "orange",  label: "Orange",  hex: "#ea580c" },
  { id: "teal",    label: "Teal",    hex: "#0d9488" },
  { id: "amber",   label: "Amber",   hex: "#d97706" },
  { id: "cyan",    label: "Cyan",    hex: "#0891b2" },
  { id: "pink",    label: "Pink",    hex: "#ec4899" },
] as const

export type AccentTheme = (typeof ACCENT_THEMES)[number]["id"] | "custom"

export const THEME_KEY = "vitasync_accent"
export const CUSTOM_COLOR_KEY = "vitasync_custom_color"
export const AUTO_SYNC_KEY = "vitasync_auto_sync"
export const DARK_MODE_KEY = "vitasync_dark_mode"

/* ── Appearance modes ──────────────────────────────────────────────── */

export type AppearanceMode = "light" | "dark" | "system" | "midnight" | "dim"

export const APPEARANCE_MODES: Array<{
  id: AppearanceMode
  label: string
  description: string
}> = [
  { id: "system",   label: "System",   description: "Follows your OS preference" },
  { id: "light",    label: "Light",    description: "Clean & bright" },
  { id: "dark",     label: "Dark",     description: "Easy on the eyes" },
  { id: "midnight", label: "Midnight", description: "AMOLED pure black" },
  { id: "dim",      label: "Dim",      description: "Softer, muted dark" },
]

/* ── Accent helpers ────────────────────────────────────────────────── */

export function getStoredTheme(): AccentTheme {
  if (typeof window === "undefined") return "rose"
  return (localStorage.getItem(THEME_KEY) as AccentTheme) ?? "rose"
}

export function getStoredCustomColor(): string {
  if (typeof window === "undefined") return "#ef4444"
  return localStorage.getItem(CUSTOM_COLOR_KEY) ?? "#ef4444"
}

/**
 * Convert a hex color to an object with r, g, b (0–255).
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace("#", ""), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * Attempt to lighten / darken a hex color by an amount (-255…255).
 */
function adjustColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0")
  return `#${toHex(r + amount)}${toHex(g + amount)}${toHex(b + amount)}`
}

/**
 * Generate a full set of accent CSS variables from a single hex color.
 */
function generateCustomAccentVars(hex: string) {
  const shades: Record<string, string> = {
    "50":  adjustColor(hex, 110),
    "100": adjustColor(hex, 90),
    "200": adjustColor(hex, 65),
    "300": adjustColor(hex, 40),
    "400": adjustColor(hex, 15),
    "500": hex,
    "600": adjustColor(hex, -25),
    "700": adjustColor(hex, -50),
    "800": adjustColor(hex, -75),
    "900": adjustColor(hex, -100),
  }

  const el = document.documentElement
  for (const [shade, color] of Object.entries(shades)) {
    const { r, g, b } = hexToRgb(color)
    el.style.setProperty(`--ai-${shade}`, `${r} ${g} ${b}`)
    el.style.setProperty(`--accent-${shade}`, color)
  }
}

function clearCustomAccentVars() {
  const el = document.documentElement
  for (const shade of ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"]) {
    el.style.removeProperty(`--ai-${shade}`)
    el.style.removeProperty(`--accent-${shade}`)
  }
}

export function applyTheme(theme: AccentTheme, customHex?: string) {
  if (theme === "custom") {
    document.documentElement.dataset.accent = "custom"
    generateCustomAccentVars(customHex ?? getStoredCustomColor())
  } else {
    clearCustomAccentVars()
    document.documentElement.dataset.accent = theme
  }
  localStorage.setItem(THEME_KEY, theme)
  if (customHex) localStorage.setItem(CUSTOM_COLOR_KEY, customHex)
}

/* ── Appearance helpers ────────────────────────────────────────────── */

export function getStoredAppearance(): AppearanceMode {
  if (typeof window === "undefined") return "system"
  return (localStorage.getItem(DARK_MODE_KEY) as AppearanceMode) ?? "system"
}

/** Kept for backwards compat — alias for getStoredAppearance */
export const getStoredDarkMode = getStoredAppearance

function resolveIsDark(pref: AppearanceMode): boolean {
  switch (pref) {
    case "light":
      return false
    case "dark":
    case "midnight":
    case "dim":
      return true
    case "system":
    default:
      return window.matchMedia("(prefers-color-scheme: dark)").matches
  }
}

export function applyAppearance(pref: AppearanceMode) {
  const el = document.documentElement
  const isDark = resolveIsDark(pref)
  el.classList.toggle("dark", isDark)
  el.classList.toggle("midnight", pref === "midnight")
  el.classList.toggle("dim", pref === "dim")
  localStorage.setItem(DARK_MODE_KEY, pref)
}

/** Kept for backwards compat */
export const applyDarkMode = applyAppearance

/* ── Provider ──────────────────────────────────────────────────────── */

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Apply accent
    const accent = getStoredTheme()
    if (accent === "custom") {
      applyTheme("custom", getStoredCustomColor())
    } else {
      document.documentElement.dataset.accent = accent
    }

    // Apply appearance
    applyAppearance(getStoredAppearance())

    // Keep "system" preference in sync with OS changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (getStoredAppearance() === "system") applyAppearance("system")
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return <>{children}</>
}
