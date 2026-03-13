"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiKeysApi, type ApiKey } from "../../../lib/api"

const SCOPES = ["read", "write", "admin"] as const

export default function ApiKeysPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", scopes: ["read"] as string[], expiresAt: "" })
  const [error, setError] = useState("")

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] })
      setNewKey(data.rawKey)
      setShowCreate(false)
    },
    onError: (err: Error) => setError(err.message),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  })

  function toggleScope(scope: string) {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }))
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Keys are hashed and stored securely. The raw key is shown only once at creation.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setNewKey(null) }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Key
        </button>
      </div>

      {newKey && (
        <div className="mb-6 rounded-xl border border-green-300 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800 mb-2">
            ✓ Key created — copy it now, it will not be shown again.
          </p>
          <code className="block rounded bg-white border border-green-200 px-4 py-3 text-sm font-mono text-gray-900 break-all">
            {newKey}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(newKey)}
            className="mt-2 text-xs text-green-700 hover:text-green-900 underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Create API Key</h2>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Name *</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Production backend"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Scopes *</label>
              <div className="flex gap-2">
                {SCOPES.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                      form.scopes.includes(scope)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Expires At (optional)</label>
              <input
                type="datetime-local"
                className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => createMutation.mutate({
                name: form.name,
                scopes: form.scopes,
                expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
              })}
              disabled={!form.name || form.scopes.length === 0 || createMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setError("") }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Name", "Prefix", "Scopes", "Last Used", "Expires", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{key.name}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{key.keyPrefix}…</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {key.scopes.map((s) => (
                        <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => revokeMutation.mutate(key.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
