"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { symptomsApi, usersApi, type SymptomLogData, type SymptomPatterns } from "../../../lib/api"

const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Mild", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  2: { label: "Moderate", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  3: { label: "Severe", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  4: { label: "Very Severe", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  5: { label: "Extreme", color: "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200" },
}

export default function SymptomsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ symptom: "", severity: "2", bodyLocation: "", triggers: "", notes: "" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["symptoms", selectedUserId],
    queryFn: () => symptomsApi.list(selectedUserId, { limit: 50 }),
    enabled: !!selectedUserId,
  })
  const logs = logsResult?.data ?? []

  const { data: topResult } = useQuery({
    queryKey: ["symptoms-top", selectedUserId],
    queryFn: () => symptomsApi.top(selectedUserId),
    enabled: !!selectedUserId,
  })
  const topSymptoms = topResult?.data ?? []

  const { data: patterns } = useQuery({
    queryKey: ["symptoms-patterns", selectedUserId],
    queryFn: () => symptomsApi.patterns(selectedUserId),
    enabled: !!selectedUserId,
  })

  const createMut = useMutation({
    mutationFn: () =>
      symptomsApi.create(selectedUserId, {
        symptom: form.symptom,
        severity: Number(form.severity),
        bodyLocation: form.bodyLocation || null,
        triggers: form.triggers ? form.triggers.split(",").map((t) => t.trim()) : [],
        notes: form.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["symptoms", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["symptoms-top", selectedUserId] })
      queryClient.invalidateQueries({ queryKey: ["symptoms-patterns", selectedUserId] })
      setShowCreate(false)
      setForm({ symptom: "", severity: "2", bodyLocation: "", triggers: "", notes: "" })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Symptom Tracking</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Log symptoms, identify patterns, and track triggers over time.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "Log Symptom"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="sym-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="sym-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to view symptom data.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Log a Symptom</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Symptom *</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} placeholder="e.g. Headache" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Severity (1-5)</label>
              <input type="range" min="1" max="5" className="w-full" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} />
              <div className="text-center text-xs mt-1">{SEVERITY_LABELS[Number(form.severity)]?.label ?? form.severity}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Body Location</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.bodyLocation} onChange={(e) => setForm({ ...form, bodyLocation: e.target.value })} placeholder="e.g. Head, Neck" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Triggers (comma-sep)</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.triggers} onChange={(e) => setForm({ ...form, triggers: e.target.value })} placeholder="e.g. stress, poor sleep, dehydration" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Notes</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes…" />
            </div>
          </div>
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.symptom} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Saving…" : "Save Symptom"}
          </button>
        </div>
      )}

      {/* Patterns overview */}
      {selectedUserId && patterns && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Severity</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{patterns.avgSeverity.toFixed(1)}<span className="text-sm text-gray-400">/5</span></p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Trend</p>
            <p className={`text-2xl font-bold ${patterns.severityTrend === "improving" ? "text-emerald-600" : patterns.severityTrend === "worsening" ? "text-red-600" : "text-gray-500"}`}>
              {patterns.severityTrend === "improving" ? "↓ Improving" : patterns.severityTrend === "worsening" ? "↑ Worsening" : "→ Stable"}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top Triggers</p>
            {patterns.topTriggers.slice(0, 3).map((t) => (
              <div key={t.trigger} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span>{t.trigger}</span><span className="font-medium">{t.count}</span>
              </div>
            ))}
            {patterns.topTriggers.length === 0 && <p className="text-xs text-gray-400">None recorded</p>}
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Top Locations</p>
            {patterns.topLocations.slice(0, 3).map((l) => (
              <div key={l.location} className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                <span>{l.location}</span><span className="font-medium">{l.count}</span>
              </div>
            ))}
            {patterns.topLocations.length === 0 && <p className="text-xs text-gray-400">None recorded</p>}
          </div>
        </div>
      )}

      {/* Top symptoms bar */}
      {selectedUserId && topSymptoms.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Most Frequent Symptoms</h3>
          <div className="space-y-2">
            {topSymptoms.map((s) => {
              const maxCount = topSymptoms[0]?.count ?? 1
              const pct = Math.round((s.count / maxCount) * 100)
              return (
                <div key={s.symptom}>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>{s.symptom}</span><span>{s.count}×</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Log table */}
      {selectedUserId && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Symptom Log ({logs.length})</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center"><div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
          ) : logs.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No symptoms logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Symptom</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Triggers</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr></thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{l.symptom}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_LABELS[l.severity]?.color ?? ""}`}>
                          {SEVERITY_LABELS[l.severity]?.label ?? l.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{l.bodyLocation ?? "—"}</td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{l.triggers.length ? l.triggers.join(", ") : "—"}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(l.loggedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
