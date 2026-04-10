/** Query type constants for health domain. */
export const HealthQueries = {
  GET_LATEST_SCORE: "health.get_latest_score",
  GET_DAILY_SUMMARY: "health.get_daily_summary",
  GET_READINESS: "health.get_readiness",
  GET_METRICS: "health.get_metrics",
} as const

export type HealthQueryType = (typeof HealthQueries)[keyof typeof HealthQueries]
