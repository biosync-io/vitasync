"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { usersApi, getRuntimeDefaultKey } from "../../../lib/api"
import { type AccentTheme, ACCENT_THEMES, applyTheme, getStoredTheme } from "../../../lib/ThemeProvider"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { PageHeader, Card, CardHeader, CardContent, Toggle, CardSkeleton } from "../../../lib/components/ui"

const STORAGE_KEY = "vitasync_api_key"

// Static map used instead of inline styles to satisfy the no-inline-styles lint rule.
const THEME_SWATCH_BG: Record<string, string> = {
  indigo: "bg-[#4f46e5]",
  blue:   "bg-[#2563eb]",
  green:  "bg-[#16a34a]",
  purple: "bg-[#9333ea]",
  rose:   "bg-[#e11d48]",
  orange: "bg-[#ea580c]",
  teal:   "bg-[#0d9488]",
  amber:  "bg-[#d97706]",
  cyan:   "bg-[#0891b2]",
  pink:   "bg-[#ec4899]",
}

function SetupBanner({ activeKey }: { activeKey: string }) {
  const searchParams = useSearchParams()
  const needsSetup = searchParams.get("setup") === "1" && !activeKey
  if (!needsSetup) return null
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <strong>API key required.</strong> Paste your key below and click <strong>Save</strong> to
      start using the dashboard. Use the <strong>Bootstrap key</strong>{" "}
      (<code className="rounded bg-amber-100 dark:bg-amber-800/30 px-1 font-mono">vs_test_dev0…</code>) for local
      development, or create a new one below.
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // ── Active API key stored in localStorage ──────────────────────────────────
  const [activeKey, setActiveKey] = useState("")

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setActiveKey(stored)
    } else {
      // Fall back to the runtime-configured default key (injected by Helm in K8s
      // via DEFAULT_API_KEY, or baked in at build time via NEXT_PUBLIC_DEFAULT_API_KEY).
      // Auto-save it so subsequent API calls work without any manual step.
      getRuntimeDefaultKey().then((key) => {
        if (key) saveActiveKey(key)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function saveActiveKey(key: string) {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    setActiveKey(key)
    // Invalidate all cached queries so they re-run with the new key
    queryClient.invalidateQueries()
  }

  // ── Appearance settings ────────────────────────────────────────────────
  const [currentTheme, setCurrentTheme] = useState<AccentTheme>("indigo")
  const [autoSync, setAutoSync] = useState(true)

  useEffect(() => {
    setCurrentTheme(getStoredTheme())
    setAutoSync(localStorage.getItem("vitasync_auto_sync") !== "false")
  }, [])

  function toggleAutoSync() {
    const next = !autoSync
    setAutoSync(next)
    localStorage.setItem("vitasync_auto_sync", String(next))
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Settings" subtitle="Configure your workspace API access and preferences." />

      {/* ── Setup banner ─────────────────────────────────────────────────────── */}
      <Suspense>
        <SetupBanner activeKey={activeKey} />
      </Suspense>

      {/* ── User Profile — Gender Selection ──────────────────────────────── */}
      <UserProfileSection />

      {/* ── Appearance ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Appearance" subtitle="Customise the dashboard accent colour and sync behaviour." />
        <CardContent className="space-y-6">
          {/* Accent colour picker */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-3">Accent colour</p>
            <div className="flex flex-wrap gap-4">
              {ACCENT_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  title={theme.label}
                  onClick={() => {
                    applyTheme(theme.id)
                    setCurrentTheme(theme.id)
                  }}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${THEME_SWATCH_BG[theme.id] ?? ""} ${
                      currentTheme === theme.id
                        ? "border-gray-800 scale-110 shadow-md"
                        : "border-transparent hover:border-gray-300"
                    }`}
                  >
                    {currentTheme === theme.id && (
                      <span className="text-white text-xs font-bold">✓</span>
                    )}
                  </span>
                  <span
                    className={`text-xs ${
                      currentTheme === theme.id ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {theme.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Auto-sync toggle */}
          <Toggle
            label="Auto-sync on connect"
            description="Automatically trigger a data sync when a provider is connected via OAuth."
            checked={autoSync}
            onChange={toggleAutoSync}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ── User Profile Section ────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: "male", label: "Male", icon: "♂️", color: "from-blue-500 to-blue-600", description: "Male-optimized RHR/HRV baselines" },
  { value: "female", label: "Female", icon: "♀️", color: "from-pink-500 to-rose-500", description: "Female-adjusted cardio & sleep baselines" },
  { value: "other", label: "Other", icon: "⚧️", color: "from-purple-500 to-violet-500", description: "Default baselines applied" },
] as const

function UserProfileSection() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()

  const { data: selectedUser, isLoading: userLoading } = useQuery({
    queryKey: ["user", selectedUserId],
    queryFn: () => usersApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })

  const updateGenderMut = useMutation({
    mutationFn: (gender: string | null) => usersApi.update(selectedUserId, { gender }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", selectedUserId] })
    },
  })

  return (
    <Card>
      <CardHeader title="User Profile" subtitle="Set gender for personalized health baselines. This affects health scores, cardio assessment, sleep recommendations, and metabolic efficiency calculations." />
      <CardContent className="space-y-4">

        {userLoading && selectedUserId && <CardSkeleton count={1} />}
        {selectedUserId && !userLoading && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Gender</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GENDER_OPTIONS.map((opt) => {
                const isSelected = selectedUser?.gender === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={updateGenderMut.isPending}
                    onClick={() => updateGenderMut.mutate(opt.value)}
                    className={`relative rounded-2xl border-2 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-md shadow-indigo-500/10"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center">
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                    <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-white text-xl shadow-lg mb-2`}>
                      {opt.icon}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{opt.label}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
                  </button>
                )
              })}
            </div>
            {selectedUser?.gender && (
              <button
                type="button"
                onClick={() => updateGenderMut.mutate(null)}
                disabled={updateGenderMut.isPending}
                className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear gender setting
              </button>
            )}
            {updateGenderMut.isPending && <p className="text-xs text-indigo-500 mt-1">Saving…</p>}
            {updateGenderMut.isSuccess && <p className="text-xs text-emerald-500 mt-1">✓ Gender updated — health scores will use adjusted baselines</p>}
          </div>
        )}

        <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200/50 dark:border-blue-800/30 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">What gender affects</p>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <li>• <strong>Cardio Score:</strong> Female RHR baselines 55–85 bpm (vs male 50–80 bpm); HRV multiplier 1.8× (vs 1.5×)</li>
            <li>• <strong>Sleep Analysis:</strong> Female ideal sleep 8.5h (vs 8h); deep sleep baseline 18% (vs 20%)</li>
            <li>• <strong>Metabolic Efficiency:</strong> Gender-adjusted cardiac efficiency and energy efficiency thresholds</li>
            <li>• <strong>Health Insights:</strong> Women&apos;s health insights shown only for female users</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
