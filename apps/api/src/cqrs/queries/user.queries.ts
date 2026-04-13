/** Query type constants for user domain. */
export const UserQueries = {
  GET_PROFILE: "user.get_profile",
  GET_ACTIVITY: "user.get_activity",
  GET_PREFERENCES: "user.get_preferences",
} as const

export type UserQueryType = (typeof UserQueries)[keyof typeof UserQueries]
