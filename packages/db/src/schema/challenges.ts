import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"
import { workspaces } from "./workspaces"

/**
 * Social health challenges between users within a workspace.
 *
 * Challenges have a duration, metric to compete on, and support
 * leaderboard-style ranking among participants.
 */
export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** User who created the challenge */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 2000 }),
    /** Challenge type: step_count, distance, calories, active_minutes, sleep_score, custom */
    challengeType: varchar("challenge_type", { length: 50 }).notNull(),
    /** The metric being competed on */
    metricType: varchar("metric_type", { length: 50 }).notNull(),
    /** Aggregation: sum, avg, max, min, count */
    aggregation: varchar("aggregation", { length: 20 }).notNull().default("sum"),
    /** Optional target value to beat */
    targetValue: doublePrecision("target_value"),
    unit: varchar("unit", { length: 20 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Status: draft, active, completed, cancelled */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    /** Maximum number of participants (null = unlimited) */
    maxParticipants: integer("max_participants"),
    /** Whether the challenge is visible to all workspace users */
    isPublic: boolean("is_public").notNull().default(true),
    /** Extra rules and configuration */
    rules: jsonb("rules").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_challenges_workspace").on(t.workspaceId),
    index("idx_challenges_status").on(t.status),
  ],
)

export type ChallengeRow = typeof challenges.$inferSelect
export type ChallengeInsert = typeof challenges.$inferInsert

/**
 * Challenge participation and scores.
 */
export const challengeParticipants = pgTable(
  "challenge_participants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Current accumulated score */
    score: doublePrecision("score").notNull().default(0),
    /** Current rank in the challenge */
    rank: integer("rank"),
    /** Daily breakdown of scores */
    dailyScores: jsonb("daily_scores").$type<Record<string, number>>().default({}),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_challenge_participants_challenge").on(t.challengeId),
    index("idx_challenge_participants_user").on(t.userId),
  ],
)

export type ChallengeParticipantRow = typeof challengeParticipants.$inferSelect
export type ChallengeParticipantInsert = typeof challengeParticipants.$inferInsert
