"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Plus, Webhook as WebhookIcon } from "lucide-react"
import { type Webhook, webhooksApi } from "../../../../lib/api"
import { Pagination } from "../../../../lib/Pagination"
import { PageHeader, Card, CardHeader, CardContent, Button, Badge, Input, EmptyState, CardSkeleton } from "../../../../lib/components/ui"

const ALL_EVENTS = [
  "sync.completed",
  "sync.failed",
  "connection.created",
  "connection.disconnected",
  "user.created",
  "user.deleted",
]

const PAGE_SIZE = 10

export default function WebhooksPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    url: "",
    secret: "",
    events: ["sync.completed"] as string[],
    description: "",
  })

  const { data: hooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ["webhooks"],
    queryFn: webhooksApi.list,
  })

  const pagedHooks = hooks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const createMutation = useMutation({
    mutationFn: webhooksApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] })
      setShowCreate(false)
    },
    onError: (e: Error) => setError(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      webhooksApi.toggle(id, isActive),
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
      <PageHeader
        title="Webhooks"
        subtitle="Receive HTTP POST events signed with HMAC-SHA256 when VitaSync data changes."
        actions={
          <Button onClick={() => setShowCreate(true)} icon={Plus}>
            Add Webhook
          </Button>
        }
      />

      {showCreate && (
        <Card className="mt-6">
          <CardHeader title="New Webhook" />
          <CardContent>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="space-y-3">
              <Input
                label="Endpoint URL *"
                placeholder="https://your-server.com/vitasync/webhook"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
              <Input
                label="Secret (min 16 chars) *"
                type="password"
                placeholder="A random secret to verify delivery signatures"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              />
              <div>
                <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Events *</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map((ev) => (
                    <Button
                      key={ev}
                      variant={form.events.includes(ev) ? "primary" : "outline"}
                      size="sm"
                      onClick={() => toggleEvent(ev)}
                    >
                      {ev}
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                label="Description"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => createMutation.mutate(form)}
                  disabled={createMutation.isPending}
                  loading={createMutation.isPending}
                >
                  Create Webhook
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        {isLoading ? (
          <CardSkeleton count={3} className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1" />
        ) : hooks.length === 0 ? (
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks"
            description="Add a webhook to receive event notifications."
            action={{ label: "Add Webhook", onClick: () => setShowCreate(true), icon: Plus }}
          />
        ) : (
          <>
            <div className="space-y-3">
              {pagedHooks.map((hook) => (
              <Card key={hook.id}>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">{hook.url}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(hook.events as string[]).map((ev) => (
                          <Badge key={ev} variant="default" size="sm">{ev}</Badge>
                        ))}
                      </div>
                      {hook.description && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hook.description}</p>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-2 flex-shrink-0">
                      <Badge variant={hook.isActive ? "success" : "default"} dot>
                        {hook.isActive ? "active" : "paused"}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ id: hook.id, isActive: !hook.isActive })}
                      >
                        {hook.isActive ? "Pause" : "Enable"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteMutation.mutate(hook.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={hooks.length} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
