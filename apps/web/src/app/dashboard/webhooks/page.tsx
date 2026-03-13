"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { webhooksApi, type Webhook } from "../../../lib/api"

const ALL_EVENTS = [
  "sync.completed",
  "sync.failed",
  "connection.created",
  "connection.disconnected",
  "user.created",
  "user.deleted",
]

export default function WebhooksPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ url: "", secret: "", events: ["sync.completed"] as string[], description: "" })

  const { data: hooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ["webhooks"],
    queryFn: webhooksApi.list,
  })

  const createMutation = useMutation({
    mutationFn: webhooksApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); setShowCreate(false) },
    onError: (e: Error) => setError(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => webhooksApi.toggle(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  })

  const deleteMutation = useMutation({
    mutationFn: webhooksApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  })

  function toggleEvent(e: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e],
    }))
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Receive HTTP POST events signed with HMAC-SHA256 when VitaSync data changes.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add Webhook
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">New Webhook</h2>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Endpoint URL *</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="https://your-server.com/vitasync/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Secret (min 16 chars) *
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="A random secret to verify delivery signatures"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Events *</label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                      form.events.includes(ev)
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-300 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">Description</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending ? "Saving…" : "Create Webhook"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : hooks.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-400">No webhooks yet. Add one to receive event notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hooks.map((hook) => (
            <div key={hook.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-gray-900 truncate">{hook.url}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(hook.events as string[]).map((ev) => (
                      <span key={ev} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {ev}
                      </span>
                    ))}
                  </div>
                  {hook.description && (
                    <p className="mt-1 text-xs text-gray-400">{hook.description}</p>
                  )}
                </div>
                <div className="ml-4 flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      hook.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {hook.isActive ? "active" : "paused"}
                  </span>
                  <button
                    onClick={() => toggleMutation.mutate({ id: hook.id, isActive: !hook.isActive })}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    {hook.isActive ? "Pause" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(hook.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
