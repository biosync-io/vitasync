"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Palette, X } from "lucide-react"
import {
  ACCENT_THEMES,
  APPEARANCE_MODES,
  type AccentTheme,
  type AppearanceMode,
  applyAppearance,
  applyTheme,
  getStoredAppearance,
  getStoredCustomColor,
  getStoredTheme,
} from "./ThemeProvider"

export function ThemeSettingsPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [appearance, setAppearance] = useState<AppearanceMode>("system")
  const [accent, setAccent] = useState<AccentTheme>("rose")
  const [customColor, setCustomColor] = useState("#ef4444")

  useEffect(() => {
    setAppearance(getStoredAppearance())
    setAccent(getStoredTheme())
    setCustomColor(getStoredCustomColor())
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  const handleAppearance = useCallback((mode: AppearanceMode) => {
    applyAppearance(mode)
    setAppearance(mode)
  }, [])

  const handleAccent = useCallback((id: AccentTheme) => {
    applyTheme(id)
    setAccent(id)
  }, [])

  const handleCustomColor = useCallback(
    (hex: string) => {
      setCustomColor(hex)
      applyTheme("custom", hex)
      setAccent("custom")
    },
    [],
  )

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl z-50 overflow-hidden animate-in"
      style={{ animation: "fadeInUp 0.2s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Theme Settings
        </h3>
        <button
          type="button"
          onClick={onClose}
          title="Close theme settings"
          className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Appearance modes */}
      <div className="px-4 pb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Appearance
        </p>
        <div className="grid grid-cols-1 gap-1">
          {APPEARANCE_MODES.map((mode) => {
            const active = appearance === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleAppearance(mode.id)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-accent-500 text-white"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <ModePreview mode={mode.id} active={active} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-tight">{mode.label}</div>
                  <div
                    className={`text-[11px] leading-tight ${
                      active
                        ? "text-white/70"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {mode.description}
                  </div>
                </div>
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Accent colors */}
      <div className="px-4 py-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Accent Color
        </p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_THEMES.map((theme) => {
            const active = accent === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleAccent(theme.id)}
                title={theme.label}
                className={`relative h-8 w-8 rounded-full transition-all ${
                  active
                    ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900 scale-110"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: theme.hex }}
              >
                {active && (
                  <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                )}
              </button>
            )
          })}

          {/* Custom color button */}
          <div className="relative">
            <button
              type="button"
              title="Custom color"
              className={`relative h-8 w-8 rounded-full border-2 border-dashed transition-all flex items-center justify-center ${
                accent === "custom"
                  ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900 scale-110 border-transparent"
                  : "border-gray-300 dark:border-gray-600 hover:scale-110"
              }`}
              style={
                accent === "custom" ? { backgroundColor: customColor } : undefined
              }
              onClick={() => {
                // Clicking opens native picker by triggering the hidden input
                const input = document.getElementById("vitasync-custom-color-input")
                if (input) input.click()
              }}
            >
              {accent === "custom" ? (
                <Check className="h-4 w-4 text-white drop-shadow" />
              ) : (
                <Palette className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              )}
            </button>
            <input
              id="vitasync-custom-color-input"
              type="color"
              value={customColor}
              onChange={(e) => handleCustomColor(e.target.value)}
              className="sr-only"
              aria-label="Pick a custom accent color"
            />
          </div>
        </div>

        {accent === "custom" && (
          <div className="mt-2 flex items-center gap-2">
            <div
              className="h-5 w-5 rounded-md border border-gray-200 dark:border-gray-700"
              style={{ backgroundColor: customColor }}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono uppercase">
              {customColor}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/* Mini preview icons for appearance modes */
function ModePreview({
  mode,
  active,
}: {
  mode: AppearanceMode
  active: boolean
}) {
  const base = "h-8 w-8 rounded-lg border shrink-0 flex items-center justify-center"

  const colors: Record<AppearanceMode, { bg: string; border: string; dot: string }> = {
    light: {
      bg: "bg-white",
      border: active ? "border-white/40" : "border-gray-200",
      dot: "bg-yellow-400",
    },
    dark: {
      bg: "bg-gray-800",
      border: active ? "border-white/40" : "border-gray-600",
      dot: "bg-blue-400",
    },
    system: {
      bg: "bg-gradient-to-br from-white to-gray-800",
      border: active ? "border-white/40" : "border-gray-300",
      dot: "bg-purple-400",
    },
    midnight: {
      bg: "bg-black",
      border: active ? "border-white/40" : "border-gray-700",
      dot: "bg-indigo-400",
    },
    dim: {
      bg: "bg-gray-700",
      border: active ? "border-white/40" : "border-gray-500",
      dot: "bg-teal-400",
    },
  }

  const c = colors[mode]
  return (
    <div className={`${base} ${c.bg} ${c.border}`}>
      <div className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
    </div>
  )
}
