/** Command type constants for user domain. */
export const UserCommands = {
  UPDATE_PROFILE: "user.update_profile",
  ROTATE_API_KEY: "user.rotate_api_key",
  UPDATE_PREFERENCES: "user.update_preferences",
  DELETE_USER_DATA: "user.delete_data",
} as const

export type UserCommandType = (typeof UserCommands)[keyof typeof UserCommands]
