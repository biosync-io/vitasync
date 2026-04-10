"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  ShieldCheck,
  Download,
  Trash2,
  AlertTriangle,
  Clock,
  Save,
  CheckCircle2,
  FileJson,
  FileSpreadsheet,
} from "lucide-react"
import { useAuth } from "../../../lib/auth-context"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { PageHeader, Card, CardHeader, CardContent, Toggle, Button, EmptyState } from "../../../lib/components/ui"

// ── Consent types ────────────────────────────────────────────────────────

interface ConsentItem {
  id: string
  label: string
  description: string
  granted: boolean
}

const DEFAULT_CONSENTS: ConsentItem[] = [
  { id: "data-processing", label: "Data Processing", description: "Allow processing of your health data for personalized insights", granted: true },
  { id: "health-data-sharing", label: "Health Data Sharing", description: "Share anonymized health data with research partners", granted: false },
  { id: "analytics", label: "Analytics", description: "Help improve VitaSync by sharing usage analytics", granted: true },
  { id: "marketing", label: "Marketing", description: "Receive product updates and health tips via email", granted: false },
]

// ── Consents Section ─────────────────────────────────────────────────────

function ConsentsSection() {
  const [consents, setConsents] = useState<ConsentItem[]>(DEFAULT_CONSENTS)
  const [saved, setSaved] = useState(false)

  function toggle(id: string) {
    setConsents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, granted: !c.granted } : c)),
    )
    setSaved(false)
  }

  function handleSave() {
    // Placeholder — would call a consent API endpoint
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Card>
      <CardHeader
        title="Your Consents"
        subtitle="Manage how your data is used"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50"><ShieldCheck className="h-5 w-5 text-indigo-500" /></div>}
      />
      <CardContent>
        <div className="space-y-3">
          {consents.length === 0 && (
            <EmptyState
              icon={ShieldCheck}
              title="No consent preferences"
              description="Your consent preferences will appear here once configured."
            />
          )}
          {consents.map((consent) => (
            <div
              key={consent.id}
              className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 px-4 py-3"
            >
              <Toggle
                label={consent.label}
                description={consent.description}
                checked={consent.granted}
                onChange={() => toggle(consent.id)}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button icon={Save} onClick={handleSave}>Save Preferences</Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Data Retention (admin only) ──────────────────────────────────────────

interface RetentionRow {
  dataType: string
  days: number
  saved: boolean
}

const DEFAULT_RETENTION: RetentionRow[] = [
  { dataType: "Health Metrics", days: 365, saved: true },
  { dataType: "Activity Logs", days: 180, saved: true },
  { dataType: "API Logs", days: 90, saved: true },
  { dataType: "Notification History", days: 60, saved: true },
  { dataType: "Sync Job Records", days: 30, saved: true },
]

function DataRetentionSection() {
  const [rows, setRows] = useState<RetentionRow[]>(DEFAULT_RETENTION)

  function updateDays(idx: number, days: number) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, days, saved: false } : r)))
  }

  function saveRow(idx: number) {
    // Placeholder — would call a retention policy API
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saved: true } : r)))
  }

  return (
    <Card>
      <CardHeader
        title="Data Retention"
        subtitle="Configure how long each data type is retained"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50"><Clock className="h-5 w-5 text-amber-500" /></div>}
      />
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Data Type</th>
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Retention (days)</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.dataType} className="border-b border-gray-50 dark:border-gray-800/50">
                  <td className="py-3 px-3 font-medium text-gray-900 dark:text-gray-100">{row.dataType}</td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      min={1}
                      value={row.days}
                      onChange={(e) => updateDays(idx, parseInt(e.target.value) || 1)}
                      className="w-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    />
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Button variant="ghost" size="sm" icon={row.saved ? CheckCircle2 : Save} disabled={row.saved} onClick={() => saveRow(idx)}>
                      {row.saved ? "Saved" : "Save"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Data Export ───────────────────────────────────────────────────────────

function DataExportSection() {
  const { selectedUserId } = useSelectedUser()

  return (
    <Card>
      <CardHeader
        title="Data Export"
        subtitle="Download a copy of your personal data"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/50"><Download className="h-5 w-5 text-sky-500" /></div>}
      />
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" icon={FileJson} onClick={() => { window.location.href = `/dashboard/exports?format=json&userId=${selectedUserId}` }}>
            Export as JSON
          </Button>
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => { window.location.href = `/dashboard/exports?format=csv&userId=${selectedUserId}` }}>
            Export as CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Delete Account ───────────────────────────────────────────────────────

function DeleteAccountSection() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState("")

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Placeholder — would call an account deletion API
      throw new Error("Account deletion requires contacting support.")
    },
  })

  return (
    <Card className="border-2 border-red-200 dark:border-red-900/50">
      <CardHeader
        title="Delete My Account"
        subtitle="Permanently remove your account and all data"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/50"><AlertTriangle className="h-5 w-5 text-red-500" /></div>}
      />
      <CardContent>
        <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4 mb-4">
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>Warning:</strong> This action is irreversible. All your health data, settings, and account information will be permanently deleted.
          </p>
        </div>

        {!showConfirm ? (
          <Button variant="danger" icon={Trash2} onClick={() => setShowConfirm(true)}>
            Request Account Deletion
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-red-200 dark:border-red-800 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                placeholder="DELETE"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="danger" disabled={confirmText !== "DELETE"} loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                Permanently Delete Account
              </Button>
              <Button variant="outline" onClick={() => { setShowConfirm(false); setConfirmText("") }}>
                Cancel
              </Button>
            </div>
            {deleteMutation.isError && (
              <p className="text-sm text-red-500">{(deleteMutation.error as Error).message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const { isAdmin } = useAuth()

  return (
    <div className="space-y-8">
      <PageHeader title="Privacy" subtitle="Manage your consent preferences, data exports, and account" />

      <ConsentsSection />
      {isAdmin && <DataRetentionSection />}
      <DataExportSection />
      <DeleteAccountSection />
    </div>
  )
}
