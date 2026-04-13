/** Query type constants for provider-sync domain. */
export const SyncQueries = {
  GET_SYNC_STATUS: "sync.get_status",
  GET_SYNC_HISTORY: "sync.get_history",
  GET_CONNECTION_HEALTH: "sync.get_connection_health",
} as const

export type SyncQueryType = (typeof SyncQueries)[keyof typeof SyncQueries]
