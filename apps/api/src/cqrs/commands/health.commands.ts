/** Command type constants for health domain. */
export const HealthCommands = {
  RECORD_METRIC: "health.record_metric",
  BATCH_INGEST: "health.batch_ingest",
  COMPUTE_SCORE: "health.compute_score",
} as const

export type HealthCommandType = (typeof HealthCommands)[keyof typeof HealthCommands]
