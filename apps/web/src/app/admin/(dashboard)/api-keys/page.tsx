"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Plus, KeyRound } from "lucide-react"
import { type ApiKey, apiKeysApi } from "../../../../lib/api"
import { Pagination } from "../../../../lib/Pagination"
import { PageHeader, Card, CardHeader, CardContent, Button, Badge, Input, EmptyState, TableSkeleton } from "../../../../lib/components/ui"

const SCOPES = ["read", "write", "admin"] as const
const PAGE_SIZE = 25

export default function ApiKeysPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", scopes: ["read"] as string[], expiresAt: "" })
  const [error, setError] = useState("")

  const { data: allKeys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list(),
  })

  const keys = allKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
      <PageHeader
        title="API Keys"
        subtitle="Keys are hashed and stored securely. The raw key is shown only once at creation."
        actions={
          <Button
            onClick={() => {
              setShowCreate(true)
              setNewKey(null)
            }}
            icon={Plus}
          >
            New Key
          </Button>
        }
      />

      {newKey && (
        <Card className="mt-6 border-green-300 dark:border-green-800/40 bg-green-50 dark:bg-green-900/20">
          <CardContent>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
              ✓ Key created — copy it now, it will not be shown again.
            </p>
            <code className="block rounded bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800/40 px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
              {newKey}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="mt-2 text-xs text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-200 underline"
            >
              Copy to clipboard
            </button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card className="mt-6">
          <CardHeader title="Create API Key" />
          <CardContent>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="space-y-3">
              <Input
                label="Name *"
                placeholder="Production backend"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div>
                <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scopes *</p>
                <div className="flex gap-2">
                  {SCOPES.map((scope) => (
                    <Button
                      key={scope}
                      variant={form.scopes.includes(scope) ? "primary" : "outline"}
                      size="sm"
                      onClick={() => toggleScope(scope)}
                    >
                      {scope}
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                label="Expires At (optional)"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => {
                  const expiresAt = form.expiresAt
                    ? new Date(form.expiresAt).toISOString()
                    : undefined
                  createMutation.mutate({
                    name: form.name,
                    scopes: form.scopes,
                    ...(expiresAt !== undefined ? { expiresAt } : {}),
                  })
                }}
                disabled={!form.name || form.scopes.length === 0 || createMutation.isPending}
                loading={createMutation.isPending}
              >
                Create
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreate(false)
                  setError("")
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        {isLoading ? (
          <TableSkeleton rows={3} cols={6} />
        ) : allKeys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys"
            description="Create an API key to get started."
            action={{ label: "New Key", onClick: () => setShowCreate(true), icon: Plus }}
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden sm:block">
              <CardContent className="px-0 py-0">
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/60">
                    <tr>
                      {["Name", "Prefix", "Scopes", "Last Used", "Expires", ""].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {keys.map((key) => (
                      <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{key.name}</td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400">{key.keyPrefix}…</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {key.scopes.map((s) => (
                              <Badge key={s} variant="default" size="sm">{s}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "Never"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => revokeMutation.mutate(key.id)}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </CardContent>
            </Card>

            {/* Mobile card view */}
            <div className="sm:hidden space-y-3">
              {keys.map((key) => (
                <Card key={`m-${key.id}`}>
                  <CardContent>
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{key.name}</p>
                        <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{key.keyPrefix}…</p>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => revokeMutation.mutate(key.id)}
                        className="ml-2"
                      >
                        Revoke
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {key.scopes.map((s) => (
                        <Badge key={s} variant="default" size="sm">{s}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                      <span>Used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</span>
                      <span>Expires: {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "Never"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Pagination page={page} pageSize={PAGE_SIZE} total={allKeys.length} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
