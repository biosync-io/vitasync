/** Command type constants for provider-sync domain. */
export const SyncCommands = {
  TRIGGER_SYNC: "sync.trigger",
  CANCEL_SYNC: "sync.cancel",
  REFRESH_TOKEN: "sync.refresh_token",
} as const

export type SyncCommandType = (typeof SyncCommands)[keyof typeof SyncCommands]
