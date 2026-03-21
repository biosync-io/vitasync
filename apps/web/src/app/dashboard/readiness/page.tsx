"use client"

import { useQuery } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts"
import {
  readinessApi,
  usersApi,
  type ReadinessData,
  type TrainingLoadData,
  type TrainingLoadHistoryEntry,
} from "../../../lib/api"

// ── Style constants ─────────────────────────────────────────────

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3", stroke: "#6b7280", strokeOpacity: 0.18 }
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f3f4f6",
  },
  itemStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#9ca3af", marginBottom: "4px" },
}

const REC_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  train_hard: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-300", label: "Train Hard" },
  train_light: { bg: "bg-lime-100 dark:bg-lime-900/40", text: "text-lime-800 dark:text-lime-300", label: "Train Light" },
  active_recovery: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-800 dark:text-yellow-300", label: "Active Recovery" },
  rest: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-300", label: "Rest" },
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  peaked: { color: "text-emerald-500", label: "Peaked" },
  fresh: { color: "text-green-500", label: "Fresh" },
  neutral: { color: "text-gray-500", label: "Neutral" },
  fatigued: { color: "text-orange-500", label: "Fatigued" },
  overreached: { color: "text-red-500", label: "Overreached" },
}

// ── Helpers ─────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-500"
  if (score >= 60) return "text-yellow-500"
  if (score >= 40) return "text-orange-500"
  return "text-red-500"
}

function arcColor(score: number) {
  if (score >= 80) return "#10b981"
  if (score >= 60) return "#eab308"
  if (score >= 40) return "#f97316"
  return "#ef4444"
}

function ScoreGauge({ score, size = 160 }: { score: number; size?: number }) {
  const r = (size - 16) / 2
  const c = size / 2
  const circumference = Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = arcColor(score)

  return (
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      <path
        d={`M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}`}
        fill="none"
        stroke="#374151"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d={`M ${c - r} ${c} A ${r} ${r} 0 0 1 ${c + r} ${c}`}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <text x={c} y={c - 8} textAnchor="middle" className="fill-gray-100 text-3xl font-bold">
        {score}
      </text>
      <text x={c} y={c + 12} textAnchor="middle" className="fill-gray-400 text-xs">
        / 100
      </text>
    </svg>
  )
}

function SignalBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  const color = v >= 70 ? "bg-emerald-500" : v >= 50 ? "bg-yellow-500" : v >= 30 ? "bg-orange-500" : "bg-red-500"
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span>{v.toFixed(0)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────

export default function ReadinessPage() {
  const { selectedUserId, setSelectedUserId } = useSelectedUser()

  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 200, offset: 0 }),
  })
  const users = usersResult?.data ?? []

  const { data: readiness, isLoading: loadingReadiness } = useQuery({
    queryKey: ["readiness", selectedUserId],
    queryFn: () => readinessApi.get(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: trainingLoad, isLoading: loadingLoad } = useQuery({
    queryKey: ["training-load", selectedUserId],
    queryFn: () => readinessApi.trainingLoad(selectedUserId),
    enabled: !!selectedUserId,
  })

  const { data: historyResult } = useQuery({
    queryKey: ["training-load-history", selectedUserId],
    queryFn: () => readinessApi.trainingLoadHistory(selectedUserId, 30),
    enabled: !!selectedUserId,
  })
  const history = (historyResult?.data ?? []).slice().reverse()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 animate-fade-in-down">Readiness & Training Load</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Proprietary readiness score, recovery recommendation, and Training Stress Balance.
        </p>
      </div>

      {/* User select */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <label htmlFor="rd-user" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
        <select
          id="rd-user"
          className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Select a user...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.displayName || u.externalId}</option>
          ))}
        </select>
      </div>

      {!selectedUserId && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">
          Select a user to view readiness and training load.
        </p>
      )}

      {selectedUserId && (loadingReadiness || loadingLoad) && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-16">Loading...</p>
      )}

      {selectedUserId && readiness && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 stagger-grid">
          {/* Readiness Score Card */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Readiness Score</h2>
            <div className="flex flex-col items-center mb-4">
              <ScoreGauge score={readiness.score} />
              {(() => {
                const rec = REC_STYLES[readiness.recommendation] ?? REC_STYLES.rest!
                return (
                  <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${rec.bg} ${rec.text}`}>
                    {rec.label}
                  </span>
                )
              })()}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center max-w-xs">
                {readiness.recommendationText}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Confidence: {(readiness.confidence * 100).toFixed(0)}%
              </p>
            </div>

            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Signal Breakdown</h3>
            <div className="space-y-3">
              <SignalBar label="HRV" value={readiness.signals.hrv?.score ?? null} />
              <SignalBar label="Sleep" value={readiness.signals.sleep?.score ?? null} />
              <SignalBar label="Resting HR" value={readiness.signals.restingHr?.score ?? null} />
              <SignalBar label="Strain Recovery" value={readiness.signals.strain?.score ?? null} />
              <SignalBar label="Physiological" value={readiness.signals.physiological?.score ?? null} />
            </div>
          </div>

          {/* Training Load Card */}
          {trainingLoad && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Training Load</h2>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fitness (CTL)</p>
                  <p className="text-2xl font-bold text-blue-500">{trainingLoad.ctl}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fatigue (ATL)</p>
                  <p className="text-2xl font-bold text-orange-500">{trainingLoad.atl}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Form (TSB)</p>
                  <p className={`text-2xl font-bold ${trainingLoad.tsb >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {trainingLoad.tsb > 0 ? "+" : ""}{trainingLoad.tsb}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center mb-6">
                {(() => {
                  const st = STATUS_STYLES[trainingLoad.status] ?? STATUS_STYLES.neutral!
                  return (
                    <span className={`text-sm font-medium ${st.color}`}>
                      Status: {st.label}
                    </span>
                  )
                })()}
              </div>

              {/* Daily Strain Chart */}
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Daily Strain</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={trainingLoad.dailyStrain}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={TICK_STYLE} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={TICK_STYLE} width={35} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="strain" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Training Load History Chart */}
          {history.length > 0 && (
            <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Training Load Trend (30 days)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={history}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={TICK_STYLE} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={TICK_STYLE} width={40} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <ReferenceLine y={0} stroke="#6b7280" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="dailyStrain" name="Daily Strain" fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
