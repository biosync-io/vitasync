"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import {
  type PersonalRecord,
  type User,
  type WorkoutEvent,
  connectionsApi,
  eventsApi,
  healthApi,
  personalRecordsApi,
  usersApi,
} from "../../../../lib/api"
import type { HealthSummary } from "../../../../lib/api"

const METRIC_LABELS: Record<string, string> = {
  steps: "Steps",
  distance_meters: "Distance",
  calories: "Calories",
  heart_rate_bpm: "Heart Rate",
  sleep_duration_minutes: "Sleep",
  active_minutes: "Active Min",
  blood_pressure_systolic: "BP Systolic",
  blood_pressure_diastolic: "BP Diastolic",
  weight_kg: "Weight",
  spo2_percent: "SpO2",
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  disconnected: "bg-gray-100 text-gray-600",
  error: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ email: "", displayName: "" })
  const [editError, setEditError] = useState("")

  const { data: user, isLoading: loadingUser } = useQuery<User>({
    queryKey: ["user", id],
    queryFn: () => usersApi.get(id),
    enabled: !!id,
  })

  const { data: connections = [], isLoading: loadingConns } = useQuery({
    queryKey: ["connections", id],
    queryFn: () => connectionsApi.list(id),
    enabled: !!id,
  })

  const { data: summary = [] } = useQuery<HealthSummary[]>({
    queryKey: ["health-summary", id],
    queryFn: () => healthApi.summary(id),
    enabled: !!id,
  })

  const { data: eventsResult } = useQuery({
    queryKey: ["user-events", id],
    queryFn: () => eventsApi.list(id, { limit: 10 }),
    enabled: !!id,
  })
  const recentEvents: WorkoutEvent[] = eventsResult?.data ?? []

  const { data: prResult } = useQuery({
    queryKey: ["personal-records", id],
    queryFn: () => personalRecordsApi.list(id),
    enabled: !!id,
  })
  const prData: PersonalRecord[] = prResult?.data ?? []

  const updateMutation = useMutation({
    mutationFn: (body: { email?: string; displayName?: string }) => usersApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user", id] })
      qc.invalidateQueries({ queryKey: ["users"] })
      setEditing(false)
      setEditError("")
    },
    onError: (err: Error) => setEditError(err.message),
  })

  const syncMutation = useMutation({
    mutationFn: (connId: string) => connectionsApi.sync(id, connId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections", id] }),
  })

  const disconnectMutation = useMutation({
    mutationFn: (connId: string) => connectionsApi.disconnect(id, connId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections", id] })
      qc.invalidateQueries({ queryKey: ["health-summary", id] })
    },
  })

  if (loadingUser) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-gray-100 animate-pulse" />
        <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
        <p className="text-sm text-gray-500">User not found.</p>
        <Link
          href="/dashboard/users"
          className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-800"
        >
          ← Back to Users
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Link
        href="/dashboard/users"
        className="mb-6 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
      >
        ← Back to Users
      </Link>

      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {user.displayName ?? user.email ?? user.externalId}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Provider connections, health data, and account details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditForm({ email: user.email ?? "", displayName: user.displayName ?? "" })
            setEditing(true)
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Edit User</h2>
          {editError && <p className="mb-3 text-sm text-red-600">{editError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-user-email" className="block text-xs font-medium text-gray-700">
                Email
              </label>
              <input
                id="edit-user-email"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label
                htmlFor="edit-user-displayname"
                className="block text-xs font-medium text-gray-700"
              >
                Display Name
              </label>
              <input
                id="edit-user-displayname"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={editForm.displayName}
                onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const payload: { email?: string; displayName?: string } = {}
                if (editForm.email) payload.email = editForm.email
                if (editForm.displayName) payload.displayName = editForm.displayName
                updateMutation.mutate(payload)
              }}
              disabled={updateMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setEditError("")
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Profile</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Internal ID", value: user.id },
            { label: "External ID", value: user.externalId },
            { label: "Email", value: user.email ?? "—" },
            { label: "Display Name", value: user.displayName ?? "—" },
            { label: "Created", value: new Date(user.createdAt).toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="mt-1 text-sm font-mono text-gray-900 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Provider connections */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Provider Connections</h2>
        {loadingConns ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader — items have no stable identity
              <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <p className="text-sm text-gray-400">
            No providers connected yet. Use the OAuth authorize endpoint to connect one.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 uppercase">
                    {conn.providerId[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {conn.providerId}
                    </p>
                    <p className="text-xs text-gray-400">
                      {conn.lastSyncedAt
                        ? `Last sync: ${new Date(conn.lastSyncedAt).toLocaleString()}`
                        : `Connected: ${new Date(conn.connectedAt).toLocaleString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      STATUS_COLORS[conn.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {conn.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => syncMutation.mutate(conn.id)}
                    disabled={syncMutation.isPending}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {syncMutation.isPending ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    onClick={() => disconnectMutation.mutate(conn.id)}
                    disabled={disconnectMutation.isPending}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Health data summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Health Data Summary</h2>
          <Link
            href="/dashboard/health"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Browse all data →
          </Link>
        </div>
        {summary.length === 0 ? (
          <p className="text-sm text-gray-400">
            No health data synced yet. Trigger a sync on a connected provider above.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summary.map((s) => (
              <div key={s.metricType} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="truncate text-xs font-medium text-gray-500">
                  {METRIC_LABELS[s.metricType] ?? s.metricType}
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">{s.count.toLocaleString()}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Latest: {new Date(s.latest).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          <Link
            href="/dashboard/activity"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Browse all →
          </Link>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-gray-400">No activity events synced yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ev.eventType === "workout"
                        ? "bg-orange-100 text-orange-700"
                        : ev.eventType === "sleep"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {ev.eventType}
                  </span>
                  <div>
                    <p className="text-sm text-gray-900">
                      {ev.title ?? ev.activityType?.replace(/_/g, " ") ?? ev.eventType}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(ev.startedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500 tabular-nums space-x-2">
                  {ev.durationSeconds != null && (
                    <span>{Math.floor(ev.durationSeconds / 60)}m</span>
                  )}
                  {ev.caloriesKcal != null && <span>{Math.round(ev.caloriesKcal)} kcal</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Personal Records */}
      {prData.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Personal Records</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {prData.map((pr) => (
              <div key={pr.id} className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                <p className="truncate text-xs font-medium text-gray-500 capitalize">
                  {pr.metricType.replace(/_/g, " ")}
                  {pr.category && (
                    <span className="ml-1 text-gray-400">· {pr.category.replace(/_/g, " ")}</span>
                  )}
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900">
                  {pr.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {pr.unit && (
                    <span className="ml-1 text-sm font-normal text-gray-500">{pr.unit}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(pr.recordedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
