"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type ApiKey, apiKeysApi } from "../../../lib/api"

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
  { value: "read:users", label: "Read Users" },
  { value: "write:users", label: "Write Users" },
  { value: "read:health", label: "Read Health Data" },
  { value: "read:events", label: "Read Events" },
  { value: "read:providers", label: "Read Providers" },
  { value: "write:connections", label: "Write Connections" },
  { value: "admin", label: "Admin (all)" },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // ── Active API key stored in localStorage ──────────────────────────────────
  const [activeKey, setActiveKey] = useState("")
  const [showActiveKey, setShowActiveKey] = useState(false)

  useEffect(() => {
    setActiveKey(localStorage.getItem(STORAGE_KEY) ?? "")
  }, [])

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
  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: apiKeysApi.list,
  })

  // Create key form
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
    "read:users",
    "read:health",
    "read:events",
  ])
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
      setNewKeyScopes(["read:users", "read:health", "read:events"])
      setNewKeyExpiry("")
      queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  })

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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your workspace API access and preferences.
        </p>
      </div>

      {/* ── Active API key ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Active API Key</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Stored in <code className="rounded bg-gray-100 px-1">localStorage</code>. All dashboard
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
                className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-16 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">API Keys</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Manage credentials for programmatic access.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true)
              setCreatedRawKey(null)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <KeyIcon />
            New Key
          </button>
        </div>

        {/* Create form */}
        {createOpen && (
          <div className="border-b border-gray-100 bg-indigo-50/50 px-6 py-5 space-y-4">
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
                <h3 className="text-sm font-semibold text-gray-900">Create new API key</h3>
                <div>
                  <label
                    htmlFor="settings-key-name"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Name
                  </label>
                  <input
                    id="settings-key-name"
                    type="text"
                    placeholder="e.g. CI pipeline, Mobile app…"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <p className="mb-2 block text-xs font-medium text-gray-600">Scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SCOPES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleScope(value)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          newKeyScopes.includes(value)
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
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
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Expires (optional)
                  </label>
                  <input
                    id="settings-key-expires"
                    type="date"
                    value={newKeyExpiry}
                    onChange={(e) => setNewKeyExpiry(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
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
          <ul className="divide-y divide-gray-100">
            {keys.map((key) => (
              <li key={key.id} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{key.name}</span>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 font-mono">
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

      {/* ── API Reference link ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">API Reference</h2>
        <p className="text-xs text-gray-500 mb-3">
          Interactive Swagger docs are available on your API instance.
        </p>
        <a
          href="http://localhost:3001/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Open API docs ↗
        </a>
      </section>
    </div>
  )
}
