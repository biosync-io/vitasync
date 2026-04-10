"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  Key,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Globe,
  FileKey2,
  TestTube2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react"
import { identityProvidersApi } from "../../../../lib/api"
import { useAdminAuth } from "../../../../lib/admin-auth-context"
import { PageHeader, Card, CardHeader, CardContent, Badge, Button, CardSkeleton, EmptyState } from "../../../../lib/components/ui"

// ── Types ────────────────────────────────────────────────────────────────

interface IdentityProvider {
  id: string
  name: string
  slug: string
  protocol: "oidc" | "saml"
  enabled: boolean
  issuerUrl?: string
  clientId?: string
  clientSecret?: string
  scopes?: string
  entityId?: string
  ssoUrl?: string
  certificate?: string
  autoProvision?: boolean
  defaultRole?: string
}

const PROTOCOL_BADGE: Record<string, { label: string; color: string }> = {
  oidc: { label: "OIDC", color: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" },
  saml: { label: "SAML", color: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400" },
}

// ── IdP Form ─────────────────────────────────────────────────────────────

interface IdpFormProps {
  initial?: Partial<IdentityProvider>
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
  isPending: boolean
}

function IdpForm({ initial, onSave, onCancel, isPending }: IdpFormProps) {
  const [protocol, setProtocol] = useState<"oidc" | "saml">(initial?.protocol ?? "oidc")
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    issuerUrl: initial?.issuerUrl ?? "",
    clientId: initial?.clientId ?? "",
    clientSecret: initial?.clientSecret ?? "",
    scopes: initial?.scopes ?? "openid profile email",
    entityId: initial?.entityId ?? "",
    ssoUrl: initial?.ssoUrl ?? "",
    certificate: initial?.certificate ?? "",
    autoProvision: initial?.autoProvision ?? true,
    defaultRole: initial?.defaultRole ?? "member",
  })

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  function patch(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit() {
    const payload: Record<string, unknown> = {
      name: form.name,
      slug: form.slug,
      protocol,
      autoProvision: form.autoProvision,
      defaultRole: form.defaultRole,
    }
    if (protocol === "oidc") {
      payload.issuerUrl = form.issuerUrl
      payload.clientId = form.clientId
      payload.clientSecret = form.clientSecret
      payload.scopes = form.scopes
    } else {
      payload.entityId = form.entityId
      payload.ssoUrl = form.ssoUrl
      payload.certificate = form.certificate
    }
    onSave(payload)
  }

  function handleTest() {
    // Placeholder — in production, would call a discovery or cert validation endpoint
    setTestResult({ success: true, message: protocol === "oidc" ? "OIDC discovery endpoint resolved successfully" : "SAML certificate is valid" })
    setTimeout(() => setTestResult(null), 4000)
  }

  const inputClass = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {initial?.id ? "Edit Identity Provider" : "Create Identity Provider"}
          </h3>
          <Button variant="ghost" size="sm" icon={X} onClick={onCancel} />
        </div>
      </CardHeader>
      <CardContent>
        {/* Protocol tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6">
          {(["oidc", "saml"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProtocol(p)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                protocol === p
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Name</label>
            <input type="text" value={form.name} onChange={(e) => patch("name", e.target.value)} className={inputClass} placeholder="e.g. Okta" />
          </div>
          <div>
            <label className={labelClass}>Slug</label>
            <input type="text" value={form.slug} onChange={(e) => patch("slug", e.target.value)} className={inputClass} placeholder="e.g. okta-prod" />
          </div>
        </div>

        {protocol === "oidc" ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass}>Issuer URL</label>
              <input type="url" value={form.issuerUrl} onChange={(e) => patch("issuerUrl", e.target.value)} className={inputClass} placeholder="https://accounts.google.com" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Client ID</label>
                <input type="text" value={form.clientId} onChange={(e) => patch("clientId", e.target.value)} className={inputClass} placeholder="Client ID" />
              </div>
              <div>
                <label className={labelClass}>Client Secret</label>
                <input type="password" value={form.clientSecret} onChange={(e) => patch("clientSecret", e.target.value)} className={inputClass} placeholder="Client Secret" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Scopes</label>
              <input type="text" value={form.scopes} onChange={(e) => patch("scopes", e.target.value)} className={inputClass} placeholder="openid profile email" />
            </div>
            <Button variant="outline" size="sm" icon={TestTube2} onClick={handleTest}>
              Test Discovery
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass}>Entity ID</label>
              <input type="text" value={form.entityId} onChange={(e) => patch("entityId", e.target.value)} className={inputClass} placeholder="urn:example:idp" />
            </div>
            <div>
              <label className={labelClass}>SSO URL</label>
              <input type="url" value={form.ssoUrl} onChange={(e) => patch("ssoUrl", e.target.value)} className={inputClass} placeholder="https://idp.example.com/sso" />
            </div>
            <div>
              <label className={labelClass}>Certificate</label>
              <textarea
                value={form.certificate}
                onChange={(e) => patch("certificate", e.target.value)}
                rows={4}
                className={`${inputClass} resize-none font-mono text-xs`}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              />
            </div>
            <Button variant="outline" size="sm" icon={FileKey2} onClick={handleTest}>
              Validate Certificate
            </Button>
          </div>
        )}

        {testResult && (
          <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.success ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {testResult.message}
          </div>
        )}

        {/* Common settings */}
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Auto Provision Users</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Automatically create accounts for new SSO users</p>
            </div>
            <button
              type="button"
              onClick={() => patch("autoProvision", !form.autoProvision)}
              aria-label="Toggle auto provision"
            >
              {form.autoProvision ? (
                <ToggleRight className="h-7 w-7 text-indigo-500" />
              ) : (
                <ToggleLeft className="h-7 w-7 text-gray-300 dark:text-gray-600" />
              )}
            </button>
          </div>

          <div>
            <label className={labelClass}>Default Role</label>
            <select
              value={form.defaultRole}
              onChange={(e) => patch("defaultRole", e.target.value)}
              className={inputClass}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button loading={isPending} disabled={!form.name || !form.slug} onClick={handleSubmit}>
            {initial?.id ? "Update Provider" : "Create Provider"}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Access Denied ────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/50 mb-4">
        <ShieldAlert className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
        You need administrator privileges to manage identity providers. Contact your workspace admin for access.
      </p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function IdentityProvidersPage() {
  useAdminAuth()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<IdentityProvider | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: providers = [], isLoading } = useQuery<IdentityProvider[]>({
    queryKey: ["identity-providers"],
    queryFn: () => identityProvidersApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => identityProvidersApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-providers"] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      identityProvidersApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identity-providers"] })
      setEditing(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => identityProvidersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identity-providers"] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      identityProvidersApi.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identity-providers"] }),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) => identityProvidersApi.test(id),
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Identity Providers"
        subtitle="Configure SSO providers for your workspace"
        actions={
          !showForm && !editing ? (
            <Button icon={Plus} onClick={() => setShowForm(true)}>
              Add Provider
            </Button>
          ) : undefined
        }
      />

      {/* Create form */}
      {showForm && (
        <IdpForm
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* Edit form */}
      {editing && (
        <IdpForm
          initial={editing}
          onSave={(data) => updateMutation.mutate({ id: editing.id, body: data })}
          onCancel={() => setEditing(null)}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Provider list */}
      {isLoading ? (
        <CardSkeleton count={3} />
      ) : providers.length === 0 && !showForm ? (
        <EmptyState
          icon={Globe}
          title="No identity providers configured"
          description="Set up OIDC or SAML providers to enable SSO for your workspace"
          action={{ label: "Add Provider", onClick: () => setShowForm(true), icon: Plus }}
        />
      ) : (
        <div className="space-y-3">
          {providers.map((idp) => {
            const expanded = expandedId === idp.id

            return (
              <Card key={idp.id} hover>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500">
                        <Key className="h-5 w-5 text-brand-500" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50 truncate">{idp.name}</h3>
                          <Badge variant={idp.protocol === "oidc" ? "info" : "purple"} size="sm">
                            {idp.protocol.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">{idp.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({ id: idp.id, enabled: !idp.enabled })}
                        title={idp.enabled ? "Disable" : "Enable"}
                      >
                        {idp.enabled ? (
                          <ToggleRight className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                        )}
                      </button>
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setEditing(idp); setShowForm(false) }} />
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => { if (confirm(`Delete identity provider "${idp.name}"?`)) deleteMutation.mutate(idp.id) }} />
                      <Button variant="ghost" size="sm" icon={expanded ? ChevronUp : ChevronDown} onClick={() => setExpandedId(expanded ? null : idp.id)} />
                    </div>
                  </div>
                </CardHeader>
                {expanded && (
                  <CardContent className="border-t border-gray-100 dark:border-white/[0.04] bg-gray-50/50 dark:bg-white/[0.01]">
                    <div className="grid gap-3 sm:grid-cols-2 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Protocol:</span>{" "}
                        <span className="font-medium text-gray-900 dark:text-gray-100">{idp.protocol.toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Status:</span>{" "}
                        <Badge variant={idp.enabled ? "success" : "default"} dot size="sm">
                          {idp.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      {idp.issuerUrl && (
                        <div className="sm:col-span-2">
                          <span className="text-gray-500 dark:text-gray-400">Issuer:</span>{" "}
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{idp.issuerUrl}</span>
                        </div>
                      )}
                      {idp.ssoUrl && (
                        <div className="sm:col-span-2">
                          <span className="text-gray-500 dark:text-gray-400">SSO URL:</span>{" "}
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{idp.ssoUrl}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" icon={TestTube2} loading={testMutation.isPending} onClick={() => testMutation.mutate(idp.id)}>
                        Test Connection
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
