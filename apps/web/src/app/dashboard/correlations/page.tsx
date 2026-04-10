"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { correlationsApi, analyticsApi, type CorrelationData } from "../../../lib/api"
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts"
import { PageHeader, Badge, Card, CardHeader, CardContent, StatCard, StatSkeleton, CardSkeleton, TableSkeleton, EmptyState, Button, Select } from "../../../lib/components/ui"

const DAYS_OPTIONS = [30, 60, 90, 180] as const

const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 }
const GRID_PROPS = { strokeDasharray: "3 3" as const, stroke: "#6b7280", strokeOpacity: 0.18 }

function strengthColor(strength: string) {
  switch (strength) {
    case "strong": return "text-emerald-600 dark:text-emerald-400"
    case "moderate": return "text-yellow-600 dark:text-yellow-400"
    case "weak": return "text-gray-500"
    default: return "text-gray-500"
  }
}

function directionIcon(dir: string) {
  return dir === "positive" ? "↑↑" : dir === "negative" ? "↑↓" : "—"
}

function CorrelationBar({ coeff }: { coeff: number }) {
  const val = coeff ?? 0
  const abs = Math.abs(val)
  const pct = Math.round(abs * 100)
  const color = val >= 0 ? "bg-emerald-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-36 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-2.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{val.toFixed(3)}</span>
    </div>
  )
}

function coefficientColor(coeff: number): string {
  if (coeff >= 0.6) return "#10b981"
  if (coeff >= 0.3) return "#34d399"
  if (coeff >= 0) return "#6ee7b7"
  if (coeff >= -0.3) return "#fca5a5"
  if (coeff >= -0.6) return "#f87171"
  return "#ef4444"
}

function heatCellBg(coeff: number): string {
  const abs = Math.abs(coeff)
  if (coeff >= 0) {
    if (abs >= 0.7) return "bg-emerald-600/80 dark:bg-emerald-500/70"
    if (abs >= 0.5) return "bg-emerald-500/60 dark:bg-emerald-400/50"
    if (abs >= 0.3) return "bg-emerald-400/40 dark:bg-emerald-300/30"
    return "bg-emerald-300/20 dark:bg-emerald-200/15"
  }
  if (abs >= 0.7) return "bg-red-600/80 dark:bg-red-500/70"
  if (abs >= 0.5) return "bg-red-500/60 dark:bg-red-400/50"
  if (abs >= 0.3) return "bg-red-400/40 dark:bg-red-300/30"
  return "bg-red-300/20 dark:bg-red-200/15"
}

interface ScatterPoint {
  sampleSize: number
  coefficient: number
  label: string
  strength: string
}

function ScatterTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  const entry = active && payload ? payload[0] : undefined
  if (!entry) return null
  const d = entry.payload
  return (
    <div className="rounded-lg border border-gray-700/80 bg-gray-900/95 px-3 py-2 text-xs text-gray-100 backdrop-blur-sm shadow-lg">
      <p className="font-medium mb-1">{d.label}</p>
      <p>Coefficient: <span className="font-mono">{d.coefficient.toFixed(3)}</span></p>
      <p>Samples: {d.sampleSize}</p>
      <p className="capitalize">Strength: {d.strength}</p>
    </div>
  )
}

export default function CorrelationsPage() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()
  const [days, setDays] = useState(90)


  const { data: correlationsResult, isLoading } = useQuery({
    queryKey: ["correlations", selectedUserId],
    queryFn: () => correlationsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const correlations = correlationsResult?.data ?? []

  const computeMut = useMutation({
    mutationFn: () => analyticsApi.correlations(selectedUserId, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["correlations", selectedUserId] })
    },
  })

  const strongCorrelations = correlations.filter((c) => c.strength === "strong")
  const avgCoeff = correlations.length > 0
    ? correlations.reduce((acc, c) => acc + Math.abs(c.coefficient ?? 0), 0) / correlations.length
    : 0

  const strongestPositive = correlations.length > 0
    ? correlations.reduce<CorrelationData | null>((best, c) => (!best || (c.coefficient ?? 0) > (best.coefficient ?? 0)) ? c : best, null)
    : null
  const strongestNegative = correlations.length > 0
    ? correlations.reduce<CorrelationData | null>((best, c) => (!best || (c.coefficient ?? 0) < (best.coefficient ?? 0)) ? c : best, null)
    : null

  const scatterData: ScatterPoint[] = correlations
    .slice()
    .sort((a, b) => Math.abs(b.coefficient ?? 0) - Math.abs(a.coefficient ?? 0))
    .slice(0, 20)
    .map((c) => ({
      sampleSize: c.sampleSize,
      coefficient: c.coefficient ?? 0,
      label: `${c.metricA} ↔ ${c.metricB}`,
      strength: c.strength,
    }))

  const heatmapData = correlations
    .slice()
    .sort((a, b) => Math.abs(b.coefficient ?? 0) - Math.abs(a.coefficient ?? 0))
    .slice(0, 10)

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        title="Correlations"
        subtitle="Discover relationships between your health metrics using statistical analysis."
        actions={
          selectedUserId ? (
            <Button onClick={() => computeMut.mutate()} loading={computeMut.isPending}>
              Compute ({days}d)
            </Button>
          ) : undefined
        }
      />

      {/* Date range filter */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
              <div className="flex gap-1.5">
                {DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                      days === d
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats — 4 cards */}
      {selectedUserId && correlations.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Correlations" value={correlations.length} />
          <StatCard
            label="Strongest Positive"
            value={
              strongestPositive && (strongestPositive.coefficient ?? 0) > 0
                ? `+${(strongestPositive.coefficient ?? 0).toFixed(3)}`
                : "—"
            }
            color="vitality"
          />
          <StatCard
            label="Strongest Negative"
            value={
              strongestNegative && (strongestNegative.coefficient ?? 0) < 0
                ? (strongestNegative.coefficient ?? 0).toFixed(3)
                : "—"
            }
            color="accent"
          />
          <StatCard label="Avg |Coefficient|" value={avgCoeff.toFixed(3)} />
        </div>
      )}

      {/* Scatter Plot + Heatmap row */}
      {selectedUserId && correlations.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Scatter Plot */}
          <Card>
            <CardHeader title="Correlation Scatter" />
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis
                      type="number"
                      dataKey="sampleSize"
                      name="Samples"
                      tick={TICK_STYLE}
                      label={{ value: "Sample Size", position: "insideBottom", offset: -8, style: { fill: "#9ca3af", fontSize: 10 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="coefficient"
                      name="Coefficient"
                      domain={[-1, 1]}
                      tick={TICK_STYLE}
                      label={{ value: "Coefficient", angle: -90, position: "insideLeft", offset: 10, style: { fill: "#9ca3af", fontSize: 10 } }}
                    />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Tooltip content={<ScatterTooltipContent />} cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={scatterData} fill="#8884d8">
                      {scatterData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={coefficientColor(entry.coefficient)} fillOpacity={0.85} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Heatmap-style summary */}
          <Card>
            <CardHeader title="Top 10 Correlations" />
            <CardContent>
              <div className="space-y-1.5">
                {heatmapData.map((c) => {
                  const coeff = c.coefficient ?? 0
                  return (
                    <div key={c.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${heatCellBg(coeff)} transition-colors`}>
                      <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate mr-2">
                        {c.metricA} <span className="text-gray-500 dark:text-gray-400 mx-1">↔</span> {c.metricB}
                      </span>
                      <span className={`text-xs font-mono font-bold whitespace-nowrap ${coeff >= 0 ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200"}`}>
                        {coeff > 0 ? "+" : ""}{coeff.toFixed(3)}
                      </span>
                    </div>
                  )
                })}
                {heatmapData.length === 0 && (
                  <EmptyState title="No data yet" description="Compute correlations to see the top results." />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Key Findings */}
      {selectedUserId && strongCorrelations.length > 0 && (
        <Card>
          <CardHeader title="Key Findings" />
          <CardContent>
            <div className="space-y-2">
              {strongCorrelations.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{c.metricA}</span>
                    <span className="mx-2 text-gray-400">{directionIcon(c.direction)}</span>
                    <span className="font-medium">{c.metricB}</span>
                  </span>
                  <span className={`font-mono font-medium ${(c.coefficient ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {(c.coefficient ?? 0) > 0 ? "+" : ""}{(c.coefficient ?? 0).toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Correlations Table */}
      {selectedUserId && (
        <Card>
          <CardHeader title="All Correlations" />
          {isLoading ? (
            <CardContent>
              <TableSkeleton rows={5} cols={7} />
            </CardContent>
          ) : correlations.length === 0 ? (
            <CardContent>
              <EmptyState
                title="No correlations computed"
                description="Click &quot;Compute&quot; to analyze your health metrics."
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">Metric A</th>
                    <th className="px-5 py-3 font-medium">Metric B</th>
                    <th className="px-5 py-3 font-medium">Coefficient</th>
                    <th className="px-5 py-3 font-medium">Strength</th>
                    <th className="px-5 py-3 font-medium">Direction</th>
                    <th className="px-5 py-3 font-medium">Samples</th>
                    <th className="px-5 py-3 font-medium">Computed</th>
                  </tr>
                </thead>
                <tbody>
                  {correlations.map((c, i) => (
                    <tr
                      key={c.id}
                      className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-100/60 dark:hover:bg-gray-800/40 transition-colors ${
                        i % 2 === 1 ? "bg-gray-50/50 dark:bg-gray-800/20" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{c.metricA}</td>
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{c.metricB}</td>
                      <td className="px-5 py-3.5"><CorrelationBar coeff={c.coefficient} /></td>
                      <td className="px-5 py-3.5"><span className={`font-medium ${strengthColor(c.strength)}`}>{c.strength}</span></td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400">{c.direction}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{c.sampleSize}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(c.computedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
