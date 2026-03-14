"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { usersApi, eventsApi, type WorkoutEvent } from "../../../lib/api"

const EVENT_TYPE_COLORS: Record<string, string> = {
  workout: "bg-orange-100 text-orange-700",
  sleep: "bg-blue-100 text-blue-700",
  activity: "bg-green-100 text-green-700",
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(meters: number | null): string {
  if (meters == null) return "—"
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

export default function ActivityPage() {
  const [selectedUserId, setSelectedUserId] = useState("")
  const [eventType, setEventType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [cursor, setCursor] = useState<string | undefined>()
  const [accumulatedEvents, setAccumulatedEvents] = useState<WorkoutEvent[]>([])

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list({ limit: 100 }),
  })

  const { data: eventsResult, isLoading } = useQuery({
    queryKey: ["activity", selectedUserId, eventType, from, to, cursor],
    queryFn: async () => {
      const params: Parameters<typeof eventsApi.list>[1] = { limit: 50 }
      if (eventType) params.eventType = eventType
      if (from) params.from = new Date(from).toISOString()
      if (to) params.to = new Date(to).toISOString()
      if (cursor) params.cursor = cursor
      const result = await eventsApi.list(selectedUserId, params)
      if (cursor) {
        setAccumulatedEvents((prev) => [...prev, ...result.data])
      } else {
        setAccumulatedEvents(result.data)
      }
      return result
    },
    enabled: !!selectedUserId,
  })

  const events = cursor ? accumulatedEvents : (eventsResult?.data ?? [])

  function resetFilters() {
    setCursor(undefined)
    setAccumulatedEvents([])
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse workouts, sleep sessions, and passive activities synced from wearables.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Filters</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">User</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value)
                resetFilters()
              }}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName ?? u.email ?? u.externalId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Event Type</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value)
                resetFilters()
              }}
              disabled={!selectedUserId}
            >
              <option value="">All types</option>
              <option value="workout">Workout</option>
              <option value="sleep">Sleep</option>
              <option value="activity">Activity</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">From</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetFilters()
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">To</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                resetFilters()
              }}
            />
          </div>
        </div>
      </div>

      {!selectedUserId ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <p className="text-sm text-gray-500">Select a user to browse their activity.</p>
        </div>
      ) : isLoading && !cursor ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-sm text-gray-500">No events found for the current filters.</p>
          <p className="mt-2 text-xs text-gray-400">
            Trigger a sync on the{" "}
            <a href="/dashboard/users" className="text-indigo-600 hover:underline">
              Users
            </a>{" "}
            page to pull data from connected providers.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">{events.length} events</p>
              {eventType && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_TYPE_COLORS[eventType] ?? "bg-gray-100 text-gray-600"}`}>
                  {eventType}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Type", "Activity", "Title", "Duration", "Distance", "Calories", "Avg HR", "Provider", "Date"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((ev) => (
                    <EventRow key={ev.id} event={ev} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {eventsResult?.hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setCursor(eventsResult.nextCursor)}
                disabled={isLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EventRow({ event: ev }: { event: WorkoutEvent }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            EVENT_TYPE_COLORS[ev.eventType] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {ev.eventType}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600 capitalize whitespace-nowrap">
        {ev.activityType?.replace(/_/g, " ") ?? "—"}
      </td>
      <td className="px-4 py-3 text-gray-900 max-w-[180px] truncate">
        {ev.title ?? "—"}
      </td>
      <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
        {formatDuration(ev.durationSeconds)}
      </td>
      <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
        {formatDistance(ev.distanceMeters)}
      </td>
      <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
        {ev.caloriesKcal != null ? `${Math.round(ev.caloriesKcal)} kcal` : "—"}
      </td>
      <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
        {ev.avgHeartRate != null ? `${ev.avgHeartRate} bpm` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400 capitalize">{ev.providerId}</td>
      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
        {new Date(ev.startedAt).toLocaleString()}
      </td>
    </tr>
  )
}
