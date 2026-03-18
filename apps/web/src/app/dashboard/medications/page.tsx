"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { medicationsApi, usersApi, type MedicationData, type MedicationStats } from "../../../lib/api"

export default function MedicationsPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", dosage: "", frequency: "daily", startDate: "" })
  const queryClient = useQueryClient()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: medsResult, isLoading } = useQuery({
    queryKey: ["medications", selectedUserId],
    queryFn: () => medicationsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const meds = medsResult?.data ?? []

  const { data: stats } = useQuery({
    queryKey: ["medication-stats", selectedUserId, selectedMedId],
    queryFn: () => medicationsApi.stats(selectedUserId, selectedMedId!),
    enabled: !!selectedUserId && !!selectedMedId,
  })

  const createMut = useMutation({
    mutationFn: () => medicationsApi.create(selectedUserId, {
      name: form.name, dosage: form.dosage || null, frequency: form.frequency, startDate: form.startDate || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications", selectedUserId] })
      setShowCreate(false)
      setForm({ name: "", dosage: "", frequency: "daily", startDate: "" })
    },
  })

  const logMut = useMutation({
    mutationFn: (medId: string) => medicationsApi.log(selectedUserId, medId, { status: "taken", takenAt: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medication-stats", selectedUserId, selectedMedId] })
    },
  })

  function adherenceColor(rate: number) {
    if (rate >= 0.9) return "text-emerald-600"
    if (rate >= 0.7) return "text-yellow-600"
    return "text-red-600"
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Medications</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track medications, dosages, and adherence rates.</p>
        </div>
        {selectedUserId && (
          <button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {showCreate ? "Cancel" : "Add Medication"}
          </button>
        )}
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="meds-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select id="meds-user" className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100" value={selectedUserId} onChange={(e) => { setSelectedUserId(e.target.value); setSelectedMedId(null) }}>
          <option value="">Select a user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>)}
        </select>
      </div>

      {!selectedUserId && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Select a user to manage medications.</p>}

      {/* Create form */}
      {showCreate && selectedUserId && (
        <div className="mb-6 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Add Medication</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name *</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lisinopril" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Dosage</label>
              <input className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="e.g. 10mg" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Frequency</label>
              <select className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="daily">Daily</option>
                <option value="twice_daily">Twice Daily</option>
                <option value="weekly">Weekly</option>
                <option value="as_needed">As Needed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Start Date</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {createMut.isPending ? "Saving…" : "Save Medication"}
          </button>
        </div>
      )}

      {/* Stats panel */}
      {stats && selectedMedId && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Adherence</p>
            <p className={`text-2xl font-bold ${adherenceColor(stats.adherenceRate)}`}>{(stats.adherenceRate * 100).toFixed(0)}%</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Logs</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalLogs}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Taken</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.takenCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Missed</p>
            <p className="text-2xl font-bold text-red-600">{stats.missedCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.skippedCount}</p>
          </div>
        </div>
      )}

      {/* Medications list */}
      {selectedUserId && isLoading && <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading…</p>}
      {selectedUserId && !isLoading && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Name</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Dosage</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Frequency</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Since</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {meds.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No medications found.</td></tr>
              )}
              {meds.map((m) => (
                <tr key={m.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 ${selectedMedId === m.id ? "bg-indigo-50 dark:bg-indigo-950/20" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.dosage ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{m.frequency?.replace("_", " ") ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m.isActive ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                      {m.isActive ? "Active" : "Ended"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.startDate ? new Date(m.startDate).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button type="button" onClick={() => setSelectedMedId(m.id === selectedMedId ? null : m.id)} className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                      {selectedMedId === m.id ? "Hide Stats" : "Stats"}
                    </button>
                    {m.isActive && (
                      <button type="button" onClick={() => logMut.mutate(m.id)} disabled={logMut.isPending} className="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 disabled:opacity-50">
                        Log Taken
                      </button>
                    )}
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
