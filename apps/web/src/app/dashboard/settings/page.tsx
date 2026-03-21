"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { type ApiKey, apiKeysApi, usersApi, getRuntimeDefaultKey } from "../../../lib/api"
import { type AccentTheme, ACCENT_THEMES, applyTheme, getStoredTheme } from "../../../lib/ThemeProvider"
import { useSelectedUser } from "../../../lib/user-selection-context"

const STORAGE_KEY = "vitasync_api_key"

function KeyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"
      />
    </svg>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

function ScopeTag({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    read: "bg-green-50 text-green-700",
    write: "bg-amber-50 text-amber-700",
    admin: "bg-red-50 text-red-700",
  }
  const base = scope.split(":")[0] ?? scope
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[base] ?? "bg-gray-100 text-gray-600"}`}
    >
      {scope}
    </span>
  )
}

const ALL_SCOPES = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "admin", label: "Admin (all)" },
]

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
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <strong>API key required.</strong> Paste your key below and click <strong>Save</strong> to
      start using the dashboard. Use the <strong>Bootstrap key</strong>{" "}
      (<code className="rounded bg-amber-100 px-1 font-mono">vs_test_dev0…</code>) for local
      development, or create a new one below.
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // ── Active API key stored in localStorage ──────────────────────────────────
  const [activeKey, setActiveKey] = useState("")
  const [showActiveKey, setShowActiveKey] = useState(false)

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

  // ── API Keys management ────────────────────────────────────────────────────
  // Guard: only fetch once an active key is available to authenticate the request.
  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: apiKeysApi.list,
    enabled: !!activeKey,
  })

  // Create key form
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read", "write"])
  const [newKeyExpiry, setNewKeyExpiry] = useState("")
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      apiKeysApi.create({
        name: newKeyName,
        scopes: newKeyScopes,
        ...(newKeyExpiry ? { expiresAt: new Date(newKeyExpiry).toISOString() } : {}),
      }),
    onSuccess: (data) => {
      setCreatedRawKey(data.rawKey)
      setNewKeyName("")
      setNewKeyScopes(["read", "write"])
      setNewKeyExpiry("")
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  })

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

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  function isExpired(key: ApiKey): boolean {
    if (!key.expiresAt) return false
    return new Date(key.expiresAt) < new Date()
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure your workspace API access and preferences.
        </p>
      </div>

      {/* ── Setup banner ─────────────────────────────────────────────────────── */}
      <Suspense>
        <SetupBanner activeKey={activeKey} />
      </Suspense>

      {/* ── User Profile — Gender Selection ──────────────────────────────── */}
      <UserProfileSection />
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Active API Key</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Stored in <code className="rounded bg-gray-100 dark:bg-gray-800 px-1">localStorage</code>. All dashboard
            requests are authenticated with this key.
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showActiveKey ? "text" : "password"}
                value={activeKey}
                onChange={(e) => setActiveKey(e.target.value)}
                placeholder="vs_live_xxxxxxxxxxxx…"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 pr-16 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowActiveKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                {showActiveKey ? "Hide" : "Show"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => saveActiveKey(activeKey)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save
            </button>
            {activeKey && (
              <button
                type="button"
                onClick={() => saveActiveKey("")}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Clear
              </button>
            )}
          </div>
          {activeKey && (
            <p className="text-xs text-green-600 font-medium">
              ✓ Key active — dashboard requests will include this credential.
            </p>
          )}
          {!activeKey && (
            <p className="text-xs text-amber-600">
              No key set — unauthenticated requests may be rejected depending on your API
              configuration.
            </p>
          )}
        </div>
      </section>

      {/* ── API Keys list ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">API Keys</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Manage credentials for programmatic access.
            </p>
          </div>
          <button
            type="button"
            disabled={!activeKey}
            onClick={() => {
              setCreateOpen(true)
              setCreatedRawKey(null)
            }}
            title={!activeKey ? "Save an active API key first" : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <KeyIcon />
            New Key
          </button>
        </div>

        {/* Create form */}
        {createOpen && (
          <div className="border-b border-gray-100 dark:border-gray-800 bg-indigo-50/50 dark:bg-indigo-950/20 px-6 py-5 space-y-4">
            {createdRawKey ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-800 mb-2">
                  ✓ Key created — copy it now, it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2 rounded bg-white border border-green-200 px-3 py-2">
                  <code className="flex-1 break-all font-mono text-xs text-gray-900">
                    {createdRawKey}
                  </code>
                  <CopyButton text={createdRawKey} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      saveActiveKey(createdRawKey)
                      setCreatedRawKey(null)
                      setCreateOpen(false)
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Use as active key
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedRawKey(null)
                      setCreateOpen(false)
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create new API key</h3>
                <div>
                  <label
                    htmlFor="settings-key-name"
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Name
                  </label>
                  <input
                    id="settings-key-name"
                    type="text"
                    placeholder="e.g. CI pipeline, Mobile app…"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <p className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-400">Scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SCOPES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleScope(value)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          newKeyScopes.includes(value)
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-indigo-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="settings-key-expires"
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Expires (optional)
                  </label>
                  <input
                    id="settings-key-expires"
                    type="date"
                    value={newKeyExpiry}
                    onChange={(e) => setNewKeyExpiry(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={!newKeyName || newKeyScopes.length === 0 || createMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Creating…" : "Create key"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  {createMutation.isError && (
                    <p className="text-xs text-red-600">
                      {(createMutation.error as Error).message}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Key list */}
        {keysLoading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-400">No API keys yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Create one above to start making authenticated requests.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {keys.map((key) => (
              <li key={key.id} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{key.name}</span>
                    <code className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {key.keyPrefix}…
                    </code>
                    {isExpired(key) && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Expired
                      </span>
                    )}
                    {key.expiresAt && !isExpired(key) && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Expires {new Date(key.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {key.scopes.map((s) => (
                      <ScopeTag key={s} scope={s} />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsedAt &&
                      ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeMutation.mutate(key.id)}
                  disabled={revokeMutation.isPending}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Appearance ───────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Customise the dashboard accent colour and sync behaviour.
          </p>
        </div>
        <div className="px-6 py-5 space-y-6">
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Auto-sync on connect</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Automatically trigger a data sync when a provider is connected via OAuth.
              </p>
            </div>
            <button
              type="button"
              aria-label={autoSync ? "Auto-sync is on — click to disable" : "Auto-sync is off — click to enable"}
              onClick={toggleAutoSync}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                autoSync ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  autoSync ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* ── API Reference link ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">API Reference</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Interactive Swagger docs are available on your API instance.
        </p>
        <a
          href="http://localhost:3001/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Open API docs ↗
        </a>
      </section>
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
  const { selectedUserId, setSelectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []
  const selectedUser = users.find((u) => u.id === selectedUserId)

  const updateGenderMut = useMutation({
    mutationFn: (gender: string | null) => usersApi.update(selectedUserId, { gender }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  return (
    <section className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">User Profile</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Set gender for personalized health baselines. This affects health scores, cardio assessment, sleep recommendations, and metabolic efficiency calculations.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label htmlFor="profile-user" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">Select User</label>
          <select id="profile-user" className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/40 transition-all" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.externalId}{u.gender ? ` (${u.gender})` : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedUserId && (
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

        {!selectedUserId && (
          <p className="text-sm text-gray-400 italic py-4">Select a user above to configure their profile.</p>
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
      </div>
    </section>
  )
}
