"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type ApiKey, apiKeysApi, getRuntimeDefaultKey } from "../../../../lib/api"
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Button,
  Badge,
  FeatureCard,
  CardSkeleton,
  EmptyState,
} from "../../../../lib/components/ui"
import { Mail, Brain, Key, ExternalLink } from "lucide-react"

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
      className="rounded px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

function ScopeTag({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    read: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300",
    write: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
    admin: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
  }
  const base = scope.split(":")[0] ?? scope
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[base] ?? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
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

export default function AdminSettingsPage() {
  const queryClient = useQueryClient()

  // ── Active API key stored in localStorage ──────────────────────────────────
  const [activeKey, setActiveKey] = useState("")
  const [showActiveKey, setShowActiveKey] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setActiveKey(stored)
    } else {
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
    queryClient.invalidateQueries()
  }

  // ── API Keys management ────────────────────────────────────────────────────
  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: apiKeysApi.list,
    enabled: !!activeKey,
  })

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
      <PageHeader
        title="General Settings"
        subtitle="Platform configuration and quick access to settings"
      />

      {/* ── Platform Info ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Platform Info"
          subtitle="VitaSync workspace details"
        />
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400 text-xs font-medium">Platform</dt>
              <dd className="mt-1 text-gray-900 dark:text-gray-50 font-semibold">VitaSync</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400 text-xs font-medium">Environment</dt>
              <dd className="mt-1">
                <Badge variant="info">
                  {process.env.NODE_ENV ?? "production"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400 text-xs font-medium">Admin API</dt>
              <dd className="mt-1">
                <Badge variant={activeKey ? "success" : "warning"} dot>
                  {activeKey ? "Connected" : "No key set"}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* ── Quick Links ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FeatureCard
          icon={Mail}
          title="Email Configuration"
          description="Configure SMTP settings for transactional emails, test connectivity, and preview templates."
          href="/admin/settings/email"
        />
        <FeatureCard
          icon={Brain}
          title="AI Providers"
          description="Manage AI models for health insights, configure API keys, and test provider connections."
          href="/admin/settings/ai"
        />
      </div>

      {/* ── Active API Key ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Active API Key">
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Stored in <code className="rounded bg-gray-100 dark:bg-gray-800 px-1">localStorage</code>. All admin requests are authenticated with this key.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <Button onClick={() => saveActiveKey(activeKey)}>Save</Button>
            {activeKey && (
              <Button variant="danger" onClick={() => saveActiveKey("")}>Clear</Button>
            )}
          </div>
          {activeKey && (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
              ✓ Key active — admin requests will include this credential.
            </p>
          )}
          {!activeKey && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No key set — unauthenticated requests may be rejected.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── API Keys list ────────────────────────────────────────────────────── */}
      {keysLoading ? (
        <CardSkeleton count={1} className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1" />
      ) : (
        <Card>
          <CardHeader
            title="API Keys"
            subtitle="Manage credentials for programmatic access."
            action={
              <Button
                size="sm"
                icon={Key}
                disabled={!activeKey}
                onClick={() => {
                  setCreateOpen(true)
                  setCreatedRawKey(null)
                }}
              >
                New Key
              </Button>
            }
          />

        {/* Create form */}
        {createOpen && (
          <div className="border-b border-gray-100 dark:border-gray-800 bg-indigo-50/50 dark:bg-indigo-950/20 px-6 py-5 space-y-4">
            {createdRawKey ? (
              <div className="rounded-lg border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-900/20 p-4">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
                  ✓ Key created — copy it now, it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2 rounded bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800/40 px-3 py-2">
                  <code className="flex-1 break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                    {createdRawKey}
                  </code>
                  <CopyButton text={createdRawKey} />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={() => {
                      saveActiveKey(createdRawKey)
                      setCreatedRawKey(null)
                      setCreateOpen(false)
                    }}
                  >
                    Use as active key
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCreatedRawKey(null)
                      setCreateOpen(false)
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create new API key</h3>
                <div>
                  <label
                    htmlFor="admin-key-name"
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Name
                  </label>
                  <input
                    id="admin-key-name"
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
                    htmlFor="admin-key-expires"
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    Expires (optional)
                  </label>
                  <input
                    id="admin-key-expires"
                    type="date"
                    value={newKeyExpiry}
                    onChange={(e) => setNewKeyExpiry(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!newKeyName || newKeyScopes.length === 0 || createMutation.isPending}
                    loading={createMutation.isPending}
                  >
                    Create key
                  </Button>
                  <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                  {createMutation.isError && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {(createMutation.error as Error).message}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Key list */}
        {keys.length === 0 ? (
          <CardContent>
            <EmptyState icon={Key} title="No API keys yet" description="Create one above to start making authenticated requests." />
          </CardContent>
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
                      <Badge variant="danger" size="sm">Expired</Badge>
                    )}
                    {key.expiresAt && !isExpired(key) && (
                      <Badge variant="warning" size="sm">Expires {new Date(key.expiresAt).toLocaleDateString()}</Badge>
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
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => revokeMutation.mutate(key.id)}
                  loading={revokeMutation.isPending}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        </Card>
      )}

      {/* ── API Reference link ────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="API Reference"
          subtitle="Interactive Swagger docs are available on your API instance"
          icon={<ExternalLink className="h-5 w-5" />}
        />
        <CardFooter>
          <a href="/api/docs" target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" icon={ExternalLink}>
              Open API docs
            </Button>
          </a>
        </CardFooter>
      </Card>
    </div>
  )
}
