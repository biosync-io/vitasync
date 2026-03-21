/**
 * VitaSync API client — thin wrapper around fetch.
 * All requests go through this client so the API URL and auth header
 * are set in one place.
 */

// Relative prefix — browser calls /api/v1/... which the Next.js route handler
// proxies to INTERNAL_API_URL (vitasync-api:3001 in K8s, localhost:3001 in dev).
const API_URL = "/api"

// Cache for the runtime default key fetched from /api/config.
// NEXT_PUBLIC_* vars are baked in at build time; the /api/config route
// exposes the runtime DEFAULT_API_KEY env var injected by Helm in K8s.
let _runtimeDefaultKey: string | null = null

export async function getRuntimeDefaultKey(): Promise<string> {
  // Fast path: build-time NEXT_PUBLIC_ var (works in dev / CI)
  if (process.env.NEXT_PUBLIC_DEFAULT_API_KEY) return process.env.NEXT_PUBLIC_DEFAULT_API_KEY
  // Cache after first fetch so every request doesn't hit /api/config
  if (_runtimeDefaultKey !== null) return _runtimeDefaultKey
  try {
    const res = await fetch("/api/config")
    const data = await res.json()
    _runtimeDefaultKey = (data as { defaultApiKey?: string }).defaultApiKey ?? ""
  } catch {
    _runtimeDefaultKey = ""
  }
  return _runtimeDefaultKey
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const localKey =
    typeof window !== "undefined" ? localStorage.getItem("vitasync_api_key") : null
  const apiKey = localKey ?? (await getRuntimeDefaultKey())

  if (!apiKey) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/dashboard/settings")) {
      window.location.href = "/dashboard/settings?setup=1"
    }
    throw new Error("No API key configured.")
  }

  const hasBody = init?.body != null
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(body?.message ?? `API error: ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---- Providers ----
export const providersApi = {
  list: () => request<ProviderDef[]>("/v1/providers"),
}

// ---- Users ----
export const usersApi = {
  list: (opts?: { limit?: number; offset?: number }) =>
    request<{ data: User[]; total: number }>(
      `/v1/users?limit=${opts?.limit ?? 50}&offset=${opts?.offset ?? 0}`,
    ),
  get: (id: string) => request<User>(`/v1/users/${id}`),
  create: (body: { externalId: string; email?: string; displayName?: string; gender?: string }) =>
    request<User>("/v1/users", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { email?: string; displayName?: string; gender?: string | null }) =>
    request<User>(`/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/v1/users/${id}`, { method: "DELETE" }),
}

// ---- Connections ----
export const connectionsApi = {
  list: (userId: string) => request<Connection[]>(`/v1/users/${userId}/connections`),
  sync: (userId: string, connectionId: string) =>
    request<{ message: string }>(`/v1/users/${userId}/connections/${connectionId}/sync`, {
      method: "POST",
    }),
  disconnect: (userId: string, connectionId: string) =>
    request<void>(`/v1/users/${userId}/connections/${connectionId}`, { method: "DELETE" }),
}

// ---- Health data ----
export const healthApi = {
  query: (
    userId: string,
    opts?: { metricType?: string; from?: string; to?: string; limit?: number; offset?: number },
  ) => {
    const params = new URLSearchParams()
    if (opts?.metricType) params.set("metricType", opts.metricType)
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    if (opts?.offset) params.set("offset", String(opts.offset))
    return request<{ data: HealthMetric[]; count: number }>(`/v1/users/${userId}/health?${params}`)
  },
  summary: (userId: string) => request<HealthSummary[]>(`/v1/users/${userId}/health/summary`),
}

// ---- API Keys ----
export const apiKeysApi = {
  list: () => request<ApiKey[]>("/v1/api-keys"),
  create: (body: { name: string; scopes: string[]; expiresAt?: string }) =>
    request<ApiKey & { rawKey: string }>("/v1/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revoke: (id: string) => request<void>(`/v1/api-keys/${id}`, { method: "DELETE" }),
}

// ---- Sync Jobs ----
export const syncJobsApi = {
  list: () => request<{ jobs: SyncJob[] }>("/v1/sync-jobs"),
}

// ---- Webhooks ----
export const webhooksApi = {  list: () => request<Webhook[]>("/v1/webhooks"),
  create: (body: { url: string; secret: string; events: string[]; description?: string }) =>
    request<Webhook>("/v1/webhooks", { method: "POST", body: JSON.stringify(body) }),
  toggle: (id: string, isActive: boolean) =>
    request<Webhook>(`/v1/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  delete: (id: string) => request<void>(`/v1/webhooks/${id}`, { method: "DELETE" }),
  deliveries: (id: string) => request<WebhookDelivery[]>(`/v1/webhooks/${id}/deliveries`),
}

// ---- Events ----
export const eventsApi = {
  list: (
    userId: string,
    opts?: { eventType?: string; from?: string; to?: string; limit?: number; cursor?: string },
  ) => {
    const params = new URLSearchParams()
    if (opts?.eventType) params.set("eventType", opts.eventType)
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    if (opts?.cursor) params.set("cursor", opts.cursor)
    return request<{ data: WorkoutEvent[]; nextCursor?: string; hasMore: boolean }>(
      `/v1/users/${userId}/events?${params}`,
    )
  },
}

// ---- Personal Records ----
export const personalRecordsApi = {
  list: (userId: string) =>
    request<{ data: PersonalRecord[] }>(`/v1/users/${userId}/personal-records`),
}

// ---- Insights ----
export const insightsApi = {
  generate: (userId: string, opts?: { from?: string; to?: string }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    return request<{ data: Insight[]; total: number }>(
      `/v1/users/${userId}/insights?${params}`,
    )
  },
  algorithms: () =>
    request<{ data: InsightAlgorithm[]; total: number }>("/v1/insights/algorithms"),
}

// ---- Health Scores ----
export const healthScoresApi = {
  latest: (userId: string) => request<HealthScoreData>(`/v1/users/${userId}/health-scores/latest`),
  history: (userId: string, opts?: { from?: string; to?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: HealthScoreData[] }>(`/v1/users/${userId}/health-scores?${params}`)
  },
  compute: (userId: string) =>
    request<HealthScoreData>(`/v1/users/${userId}/health-scores/compute`, { method: "POST", body: JSON.stringify({}) }),
}

// ---- Readiness & Training Load ----
export const readinessApi = {
  get: (userId: string, date?: string) => {
    const params = date ? `?date=${date}` : ""
    return request<ReadinessData>(`/v1/users/${userId}/readiness${params}`)
  },
  trainingLoad: (userId: string, date?: string) => {
    const params = date ? `?date=${date}` : ""
    return request<TrainingLoadData>(`/v1/users/${userId}/training-load${params}`)
  },
  trainingLoadHistory: (userId: string, days?: number) =>
    request<{ data: TrainingLoadHistoryEntry[] }>(`/v1/users/${userId}/training-load/history?days=${days ?? 30}`),
}

// ---- Goals ----
export const goalsApi = {
  list: (userId: string, opts?: { status?: string }) => {
    const params = new URLSearchParams()
    if (opts?.status) params.set("status", opts.status)
    return request<{ data: GoalData[] }>(`/v1/users/${userId}/goals?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<GoalData>(`/v1/users/${userId}/goals`, { method: "POST", body: JSON.stringify(body) }),
  evaluate: (userId: string, goalId: string) =>
    request<unknown>(`/v1/users/${userId}/goals/${goalId}/evaluate`, { method: "POST" }),
  delete: (userId: string, goalId: string) =>
    request<void>(`/v1/users/${userId}/goals/${goalId}`, { method: "DELETE" }),
}

// ---- Achievements ----
export const achievementsApi = {
  list: (userId: string) => request<{ data: AchievementData[] }>(`/v1/users/${userId}/achievements`),
  definitions: () => request<{ data: AchievementDefData[] }>("/v1/achievements/definitions"),
  check: (userId: string) =>
    request<{ data: AchievementData[]; count: number }>(`/v1/users/${userId}/achievements/check`, { method: "POST" }),
}

// ---- Challenges ----
export const challengesApi = {
  list: (opts?: { status?: string }) => {
    const params = new URLSearchParams()
    if (opts?.status) params.set("status", opts.status)
    return request<{ data: ChallengeData[] }>(`/v1/challenges?${params}`)
  },
  create: (body: Record<string, unknown>) =>
    request<ChallengeData>("/v1/challenges", { method: "POST", body: JSON.stringify(body) }),
  leaderboard: (challengeId: string) =>
    request<{ data: LeaderboardEntry[] }>(`/v1/challenges/${challengeId}/leaderboard`),
  join: (challengeId: string, userId: string) =>
    request<unknown>(`/v1/challenges/${challengeId}/join`, { method: "POST", body: JSON.stringify({ userId }) }),
}

// ---- Mood ----
export const moodApi = {
  list: (userId: string, opts?: { from?: string; to?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: MoodLogData[] }>(`/v1/users/${userId}/mood?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<MoodLogData>(`/v1/users/${userId}/mood`, { method: "POST", body: JSON.stringify(body) }),
  stats: (userId: string, days?: number) =>
    request<MoodStats>(`/v1/users/${userId}/mood/stats?days=${days ?? 30}`),
}

// ---- Nutrition ----
export const nutritionApi = {
  list: (userId: string, opts?: { from?: string; to?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: NutritionLogData[] }>(`/v1/users/${userId}/nutrition?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<NutritionLogData>(`/v1/users/${userId}/nutrition`, { method: "POST", body: JSON.stringify(body) }),
  dailySummary: (userId: string) =>
    request<NutritionSummary>(`/v1/users/${userId}/nutrition/summary/daily`),
  weeklyAvg: (userId: string) =>
    request<NutritionWeeklyAvg>(`/v1/users/${userId}/nutrition/summary/weekly`),
}

// ---- Medications ----
export const medicationsApi = {
  list: (userId: string) => request<{ data: MedicationData[] }>(`/v1/users/${userId}/medications`),
  create: (userId: string, body: Record<string, unknown>) =>
    request<MedicationData>(`/v1/users/${userId}/medications`, { method: "POST", body: JSON.stringify(body) }),
  log: (userId: string, medId: string, body: Record<string, unknown>) =>
    request<unknown>(`/v1/users/${userId}/medications/${medId}/log`, { method: "POST", body: JSON.stringify(body) }),
  stats: (userId: string, medId: string) =>
    request<MedicationStats>(`/v1/users/${userId}/medications/${medId}/stats`),
}

// ---- Anomalies ----
export const anomaliesApi = {
  list: (userId: string, opts?: { severity?: string }) => {
    const params = new URLSearchParams()
    if (opts?.severity) params.set("severity", opts.severity)
    return request<{ data: AnomalyData[] }>(`/v1/users/${userId}/anomalies?${params}`)
  },
  detect: (userId: string) =>
    request<{ data: AnomalyData[]; count: number }>(`/v1/users/${userId}/anomalies/detect`, { method: "POST" }),
  acknowledge: (userId: string, anomalyId: string) =>
    request<AnomalyData>(`/v1/users/${userId}/anomalies/${anomalyId}/acknowledge`, { method: "POST" }),
}

// ---- Correlations ----
export const correlationsApi = {
  list: (userId: string) => request<{ data: CorrelationData[] }>(`/v1/users/${userId}/correlations`),
  compute: (userId: string) =>
    request<{ data: CorrelationData[]; count: number }>(`/v1/users/${userId}/correlations/compute`, { method: "POST" }),
}

// ---- Reports ----
export const reportsApi = {
  list: (userId: string) => request<{ data: ReportData[] }>(`/v1/users/${userId}/reports`),
  get: (userId: string, reportId: string) => request<ReportData>(`/v1/users/${userId}/reports/${reportId}`),
  generate: (userId: string, body: Record<string, unknown>) =>
    request<ReportData>(`/v1/users/${userId}/reports/generate`, { method: "POST", body: JSON.stringify(body) }),
}

// ---- Exports ----
export const exportsApi = {
  list: (userId: string) => request<{ data: ExportData[] }>(`/v1/users/${userId}/exports`),
  create: (userId: string, body: Record<string, unknown>) =>
    request<ExportData>(`/v1/users/${userId}/exports`, { method: "POST", body: JSON.stringify(body) }),
}

// ---- Training Plans ----
export const trainingPlansApi = {
  list: (userId: string) => request<{ data: TrainingPlanData[] }>(`/v1/users/${userId}/training-plans`),
  generate: (userId: string, body: Record<string, unknown>) =>
    request<TrainingPlanData>(`/v1/users/${userId}/training-plans/generate`, { method: "POST", body: JSON.stringify(body) }),
}

// ---- Symptoms ----
export const symptomsApi = {
  list: (userId: string, opts?: { from?: string; to?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: SymptomLogData[] }>(`/v1/users/${userId}/symptoms?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<SymptomLogData>(`/v1/users/${userId}/symptoms`, { method: "POST", body: JSON.stringify(body) }),
  top: (userId: string) => request<{ data: { symptom: string; count: number }[] }>(`/v1/users/${userId}/symptoms/top`),
  patterns: (userId: string) => request<SymptomPatterns>(`/v1/users/${userId}/symptoms/patterns`),
}

// ---- Sleep Analysis ----
export const sleepAnalysisApi = {
  debt: (userId: string, days?: number) =>
    request<SleepDebtData>(`/v1/users/${userId}/sleep-analysis/debt?days=${days ?? 14}`),
  quality: (userId: string, days?: number) =>
    request<SleepQualityData>(`/v1/users/${userId}/sleep-analysis/quality?days=${days ?? 30}`),
}

// ---- Snapshots ----
export const snapshotsApi = {
  list: (userId: string) => request<{ data: SnapshotData[] }>(`/v1/users/${userId}/snapshots`),
}

// ---- Baselines ----
export const baselinesApi = {
  list: (userId: string) => request<{ data: BaselineData[] }>(`/v1/users/${userId}/baselines`),
  compute: (userId: string) =>
    request<{ data: BaselineData[]; count: number }>(`/v1/users/${userId}/baselines/compute`, { method: "POST" }),
}

// ---- Shared types (local to client, not re-exported from @biosync-io/types to avoid SSR issues) ----
export interface ProviderDef {
  id: string
  name: string
  description: string
  authType: "oauth2" | "oauth1"
  capabilities: string[]
  logoUrl: string | null
}

export interface User {
  id: string
  externalId: string
  email: string | null
  displayName: string | null
  gender: string | null
  createdAt: string
}

export interface Connection {
  id: string
  userId: string
  providerId: string
  status: string
  connectedAt: string
  lastSyncedAt: string | null
}

export interface HealthMetric {
  id: string
  metricType: string
  recordedAt: string
  value: number
  unit: string | null
  source: string | null
  providerId: string
}

export interface HealthSummary {
  metricType: string
  count: number
  earliest: string
  latest: string
}

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  isActive: boolean
  description: string | null
  createdAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventType: string
  status: string
  attempts: number
  lastAttemptedAt: string | null
  deliveredAt: string | null
  responseStatus: number | null
  createdAt: string
}

export interface WorkoutEvent {
  id: string
  userId: string
  connectionId: string
  providerId: string
  eventType: "workout" | "sleep" | "activity"
  activityType: string | null
  title: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  distanceMeters: number | null
  caloriesKcal: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  avgSpeedMps: number | null
  elevationGainMeters: number | null
  notes: string | null
  createdAt: string
}

export interface PersonalRecord {
  id: string
  userId: string
  metricType: string
  category: string | null
  value: number
  unit: string | null
  recordedAt: string
  providerId: string
  updatedAt: string
}

export interface SyncJob {
  id: string | undefined
  state: "active" | "waiting" | "delayed" | "completed" | "failed"
  name: string
  data: { connectionId?: string; userId?: string; workspaceId?: string; type?: string }
  progress: number | object
  attemptsMade: number
  failedReason: string | null
  processedOn: number | null
  finishedOn: number | null
  timestamp: number
}

export type InsightSeverity = "info" | "positive" | "warning" | "critical"
export type InsightCategory =
  | "cardio"
  | "sleep"
  | "activity"
  | "body"
  | "recovery"
  | "respiratory"
  | "metabolic"
  | "workout"
  | "trend"
  | "anomaly"
  | "longevity"
  | "immune"
  | "cognitive"
  | "hormonal"
  | "womens_health"
  | "performance"

export interface Insight {
  id: string
  algorithmId: string
  title: string
  description: string
  category: InsightCategory
  severity: InsightSeverity
  value: number | null
  unit: string | null
  referenceRange: { low: number; high: number } | null
  metadata: Record<string, unknown>
}

export interface InsightAlgorithm {
  id: string
  name: string
  description: string
  category: InsightCategory
  requiredMetrics: string[]
}

// ---- New Feature Types ----

export interface HealthScoreData {
  id: string
  userId: string
  date: string
  overallScore: number
  grade: string
  sleepScore: number | null
  activityScore: number | null
  cardioScore: number | null
  recoveryScore: number | null
  bodyScore: number | null
  weeklyAvg: number | null
  createdAt: string
}

export interface ReadinessData {
  score: number
  recommendation: "train_hard" | "train_light" | "active_recovery" | "rest"
  recommendationText: string
  signals: {
    hrv: { score: number; weight: number; contribution: number } | null
    sleep: { score: number; weight: number; contribution: number } | null
    restingHr: { score: number; weight: number; contribution: number } | null
    strain: { score: number; weight: number; contribution: number } | null
    physiological: { score: number; weight: number; contribution: number } | null
  }
  confidence: number
  date: string
}

export interface TrainingLoadData {
  atl: number
  ctl: number
  tsb: number
  fitness: number
  fatigue: number
  status: "peaked" | "fresh" | "neutral" | "fatigued" | "overreached"
  dailyStrain: { date: string; strain: number; workoutCount: number; totalDurationMin: number; totalCalories: number }[]
  date: string
}

export interface TrainingLoadHistoryEntry {
  date: string
  dailyStrain: number
  atl: number
  ctl: number
  tsb: number
  status: string
}

export interface GoalData {
  id: string
  userId: string
  name: string
  metric: string
  targetValue: number
  currentValue: number | null
  unit: string | null
  goalType: string
  status: string
  startDate: string
  endDate: string | null
  streak: number
  createdAt: string
}

export interface AchievementData {
  id: string
  userId: string
  achievementId: string
  name: string
  description: string | null
  icon: string | null
  tier: string
  category: string
  unlockedAt: string
}

export interface AchievementDefData {
  id: string
  name: string
  description: string
  icon: string
  tier: string
  category: string
  criteria: Record<string, unknown>
}

export interface ChallengeData {
  id: string
  name: string
  description: string | null
  metric: string
  targetValue: number
  challengeType: string
  status: string
  startDate: string
  endDate: string
  participantCount: number
  createdAt: string
}

export interface LeaderboardEntry {
  userId: string
  userName: string | null
  score: number
  rank: number
}

export interface MoodLogData {
  id: string
  userId: string
  mood: number
  energy: number | null
  stress: number | null
  tags: string[]
  factors: string[]
  notes: string | null
  loggedAt: string
}

export interface MoodStats {
  avgScore: number
  avgEnergy: number
  avgStress: number
  totalEntries: number
  moodDistribution: Record<string, number>
  trend: "improving" | "declining" | "stable"
  topFactors: string[]
}

export interface NutritionLogData {
  id: string
  userId: string
  mealType: string
  name: string
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sugarG: number | null
  sodiumMg: number | null
  waterMl: number | null
  loggedAt: string
}

export interface NutritionSummary {
  date: string
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  totalWater: number
  mealCount: number
}

export interface NutritionWeeklyAvg {
  avgCalories: number
  avgProtein: number
  avgCarbs: number
  avgFat: number
  avgWater: number
  days: number
}

export interface MedicationData {
  id: string
  userId: string
  name: string
  dosage: string | null
  frequency: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  createdAt: string
}

export interface MedicationStats {
  totalLogs: number
  takenCount: number
  missedCount: number
  skippedCount: number
  adherenceRate: number
}

export interface AnomalyData {
  id: string
  userId: string
  metric: string
  value: number
  expectedValue: number
  zScore: number
  severity: string
  status: string
  detectionMethod: string
  detectedAt: string
}

export interface CorrelationData {
  id: string
  userId: string
  metricA: string
  metricB: string
  coefficient: number
  strength: string
  direction: string
  sampleSize: number
  description: string | null
  computedAt: string
}

export interface ReportData {
  id: string
  userId: string
  reportType: string
  periodStart: string
  periodEnd: string
  highlights: string[]
  recommendations: string[]
  status: string
  createdAt: string
}

export interface ExportData {
  id: string
  userId: string
  format: string
  status: string
  fileUrl: string | null
  requestedAt: string
  completedAt: string | null
}

export interface TrainingPlanData {
  id: string
  userId: string
  name: string
  goal: string
  fitnessLevel: string
  weeklySchedule: Record<string, unknown>
  durationWeeks: number
  status: string
  createdAt: string
}

export interface SymptomLogData {
  id: string
  userId: string
  symptom: string
  severity: number
  bodyLocation: string | null
  triggers: string[]
  notes: string | null
  loggedAt: string
}

export interface SymptomPatterns {
  topSymptoms: { symptom: string; count: number }[]
  topTriggers: { trigger: string; count: number }[]
  topLocations: { location: string; count: number }[]
  avgSeverity: number
  severityTrend: string
}

export interface SleepDebtData {
  totalDebtHours: number
  dailyTarget: number
  avgActualHours: number
  days: number
  trend: string
}

export interface SleepQualityData {
  avgSleepScore: number
  avgDeepSleepPercent: number
  avgRemSleepPercent: number
  avgLightSleepPercent: number
  avgAwakePercent: number
  avgEfficiency: number
  consistencyScore: number
  weekdayVsWeekend: { weekday: number; weekend: number }
  trend: string
  recommendations: string[]
}

export interface SnapshotData {
  id: string
  userId: string
  periodType: string
  periodStart: string
  periodEnd: string
  metrics: Record<string, unknown>
  createdAt: string
}

export interface BaselineData {
  id: string
  userId: string
  metric: string
  mean: number
  stddev: number
  min: number
  max: number
  p25: number | null
  p50: number | null
  p75: number | null
  sampleSize: number
  computedAt: string
}

// ---- Notification Types ----

export type ChannelType = "discord" | "slack" | "teams" | "email" | "push" | "ntfy" | "webhook"
export type NotificationSeverity = "info" | "warning" | "critical"
export type NotificationCategory = "anomaly" | "goal" | "achievement" | "sync" | "report" | "system" | "insight"

export interface NotificationChannel {
  id: string
  userId: string
  channelType: ChannelType
  label: string
  config: Record<string, unknown>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface NotificationRule {
  id: string
  userId: string
  name: string
  categories: NotificationCategory[]
  minSeverity: NotificationSeverity
  channelIds: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface NotificationLog {
  id: string
  userId: string
  channelId: string
  channelType: ChannelType
  title: string
  payload: Record<string, unknown>
  status: "pending" | "delivered" | "failed"
  attempts: number
  error: string | null
  deliveredAt: string | null
  createdAt: string
}

// ---- Notification API ----

export const notificationsApi = {
  // Channels
  listChannels: (userId: string) =>
    request<{ data: NotificationChannel[] }>(`/v1/users/${userId}/notifications/channels`),
  createChannel: (userId: string, body: { channelType: ChannelType; label: string; config: Record<string, unknown>; enabled?: boolean }) =>
    request<{ data: NotificationChannel }>(`/v1/users/${userId}/notifications/channels`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateChannel: (userId: string, channelId: string, body: { label?: string; config?: Record<string, unknown>; enabled?: boolean }) =>
    request<{ data: NotificationChannel }>(`/v1/users/${userId}/notifications/channels/${channelId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteChannel: (userId: string, channelId: string) =>
    request<void>(`/v1/users/${userId}/notifications/channels/${channelId}`, { method: "DELETE" }),
  testChannel: (userId: string, channelId: string) =>
    request<{ message: string }>(`/v1/users/${userId}/notifications/channels/${channelId}/test`, { method: "POST" }),

  // Rules
  listRules: (userId: string) =>
    request<{ data: NotificationRule[] }>(`/v1/users/${userId}/notifications/rules`),
  createRule: (userId: string, body: { name: string; categories: NotificationCategory[]; minSeverity: NotificationSeverity; channelIds: string[]; enabled?: boolean }) =>
    request<{ data: NotificationRule }>(`/v1/users/${userId}/notifications/rules`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateRule: (userId: string, ruleId: string, body: { name?: string; categories?: NotificationCategory[]; minSeverity?: NotificationSeverity; channelIds?: string[]; enabled?: boolean }) =>
    request<{ data: NotificationRule }>(`/v1/users/${userId}/notifications/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteRule: (userId: string, ruleId: string) =>
    request<void>(`/v1/users/${userId}/notifications/rules/${ruleId}`, { method: "DELETE" }),

  // Logs
  listLogs: (userId: string, opts?: { limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: NotificationLog[] }>(`/v1/users/${userId}/notifications/logs?${params}`)
  },
}

// ---- Journal ----
export interface JournalEntry {
  id: string
  userId: string
  title: string | null
  body: string
  moodScore: number | null
  moodLabel: string | null
  gratitude: string[]
  tags: string[]
  entryDate: string
  createdAt: string
  updatedAt: string
}

export interface JournalStats {
  totalEntries: number
  avgMoodScore: number
  streak: number
  topTags: string[]
  moodDistribution: Record<string, number>
}

export const journalApi = {
  list: (userId: string, opts?: { from?: string; to?: string; search?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.search) params.set("search", opts.search)
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: JournalEntry[] }>(`/v1/users/${userId}/journal?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<JournalEntry>(`/v1/users/${userId}/journal`, { method: "POST", body: JSON.stringify(body) }),
  update: (userId: string, entryId: string, body: Record<string, unknown>) =>
    request<JournalEntry>(`/v1/users/${userId}/journal/${entryId}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (userId: string, entryId: string) =>
    request<void>(`/v1/users/${userId}/journal/${entryId}`, { method: "DELETE" }),
  stats: (userId: string, days?: number) =>
    request<JournalStats>(`/v1/users/${userId}/journal/stats?days=${days ?? 30}`),
}

// ---- Water Intake ----
export interface WaterIntakeData {
  id: string
  userId: string
  amountMl: number
  beverageType: string
  note: string | null
  dailyGoalMl: number
  loggedAt: string
  createdAt: string
}

export interface WaterDailySummary {
  totalMl: number
  goalMl: number
  progressPct: number
  logCount: number
  byBeverage: Record<string, number>
}

export interface WaterWeeklyStats {
  days: Array<{ date: string; totalMl: number; goalMl: number }>
  avgDailyMl: number
  goalMetDays: number
}

export const waterApi = {
  list: (userId: string, opts?: { from?: string; to?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.from) params.set("from", opts.from)
    if (opts?.to) params.set("to", opts.to)
    if (opts?.limit) params.set("limit", String(opts.limit))
    return request<{ data: WaterIntakeData[] }>(`/v1/users/${userId}/water?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<WaterIntakeData>(`/v1/users/${userId}/water`, { method: "POST", body: JSON.stringify(body) }),
  delete: (userId: string, logId: string) =>
    request<void>(`/v1/users/${userId}/water/${logId}`, { method: "DELETE" }),
  today: (userId: string) =>
    request<WaterDailySummary>(`/v1/users/${userId}/water/today`),
  weekly: (userId: string) =>
    request<WaterWeeklyStats>(`/v1/users/${userId}/water/weekly`),
}

// ---- Habits ----
export interface HabitData {
  id: string
  userId: string
  name: string
  icon: string
  color: string
  frequency: string
  targetDays: number[]
  active: boolean
  currentStreak: number
  longestStreak: number
  createdAt: string
  updatedAt: string
}

export interface HabitLogData {
  id: string
  habitId: string
  userId: string
  completedDate: string
  note: string | null
  createdAt: string
}

export interface HabitsSummary {
  totalHabits: number
  completedToday: number
  completionRate: number
  habits: Array<{ id: string; name: string; icon: string; completed: boolean; currentStreak: number; longestStreak: number }>
}

export const habitsApi = {
  list: (userId: string, opts?: { active?: boolean }) => {
    const params = new URLSearchParams()
    if (opts?.active !== undefined) params.set("active", String(opts.active))
    return request<{ data: HabitData[] }>(`/v1/users/${userId}/habits?${params}`)
  },
  create: (userId: string, body: Record<string, unknown>) =>
    request<HabitData>(`/v1/users/${userId}/habits`, { method: "POST", body: JSON.stringify(body) }),
  update: (userId: string, habitId: string, body: Record<string, unknown>) =>
    request<HabitData>(`/v1/users/${userId}/habits/${habitId}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (userId: string, habitId: string) =>
    request<void>(`/v1/users/${userId}/habits/${habitId}`, { method: "DELETE" }),
  complete: (userId: string, habitId: string, body?: { date?: string; note?: string }) =>
    request<HabitLogData>(`/v1/users/${userId}/habits/${habitId}/complete`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  uncomplete: (userId: string, habitId: string, date: string) =>
    request<void>(`/v1/users/${userId}/habits/${habitId}/complete/${date}`, { method: "DELETE" }),
  summary: (userId: string, date?: string) => {
    const params = new URLSearchParams()
    if (date) params.set("date", date)
    return request<HabitsSummary>(`/v1/users/${userId}/habits/summary?${params}`)
  },
}
