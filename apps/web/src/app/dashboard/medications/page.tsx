"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { medicationsApi, type MedicationData, type MedicationStats } from "../../../lib/api"
import { Card, CardHeader, CardContent, PageHeader, Badge, StatCard, Button, EmptyState, TableSkeleton } from "../../../lib/components/ui"

export default function MedicationsPage() {
  const { selectedUserId } = useSelectedUser()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", dosage: "", frequency: "daily", startDate: "" })
  const queryClient = useQueryClient()


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
      name: form.name,
      dosage: form.dosage || undefined,
      frequency: form.frequency,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
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
    <div className="space-y-8">
      <PageHeader
        title="Medications"
        subtitle="Track medications, dosages, and adherence rates."
        actions={selectedUserId ? (
          <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "Add Medication"}
          </Button>
        ) : undefined}
      />

      {/* Create form */}
      {showCreate && selectedUserId && (
        <Card glow="brand">
          <CardHeader title="Add Medication" />
          <CardContent>
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
            <Button className="mt-3" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name} loading={createMut.isPending}>
              {createMut.isPending ? "Saving…" : "Save Medication"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats panel */}
      {stats && selectedMedId && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard label="Adherence" value={(stats.adherenceRate * 100).toFixed(0) + "%"} color={stats.adherenceRate >= 0.9 ? "vitality" : stats.adherenceRate >= 0.7 ? "default" : "accent"} />
          <StatCard label="Total Logs" value={stats.totalLogs} />
          <StatCard label="Taken" value={stats.takenCount} color="vitality" />
          <StatCard label="Missed" value={stats.missedCount} color="accent" />
          <StatCard label="Skipped" value={stats.skippedCount} />
        </div>
      )}

      {/* Loading state */}
      {selectedUserId && isLoading && <TableSkeleton rows={5} cols={6} />}

      {/* Medications list */}
      {selectedUserId && !isLoading && (
        <Card>
          <CardContent className="p-0">
            {meds.length === 0 ? (
              <EmptyState title="No medications found" description="Add your first medication to start tracking." />
            ) : (
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
                  {meds.map((m) => (
                    <tr key={m.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 ${selectedMedId === m.id ? "bg-indigo-50 dark:bg-indigo-950/20" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{m.name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.dosage ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 capitalize">{m.frequency?.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={m.isActive ? "success" : "default"}>{m.isActive ? "Active" : "Ended"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.startDate ? new Date(m.startDate).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedMedId(m.id === selectedMedId ? null : m.id)}>
                          {selectedMedId === m.id ? "Hide Stats" : "Stats"}
                        </Button>
                        {m.isActive && (
                          <Button variant="ghost" size="sm" onClick={() => logMut.mutate(m.id)} disabled={logMut.isPending}>
                            Log Taken
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
