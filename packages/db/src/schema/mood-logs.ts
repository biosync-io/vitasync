import { sql } from "drizzle-orm"
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Mood and mental wellness logs.
 *
 * Users or API consumers log mood entries with a numeric score (1–10),
 * optional categorical tags (anxious, energized, etc.), and free-text notes.
 * Supports correlation analysis with physical health metrics.
 */
export const moodLogs = pgTable(
  "mood_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Mood score 1–10 (1 = very low, 10 = excellent) */
    score: doublePrecision("score").notNull(),
    /** Energy level 1–10 */
    energyLevel: doublePrecision("energy_level"),
    /** Stress level 1–10 */
    stressLevel: doublePrecision("stress_level"),
    /** Primary mood category: happy, calm, anxious, sad, angry, neutral, energized, tired */
    mood: varchar("mood", { length: 50 }).notNull(),
    /** Tags for granular categorization */
    tags: jsonb("tags").$type<string[]>().default([]),
    /** Free-text journal entry */
    notes: varchar("notes", { length: 5000 }),
    /** Context factors (e.g., weather, social, work, exercise) */
    factors: jsonb("factors").$type<string[]>().default([]),
    /** When the mood was recorded */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_mood_logs_user_time").on(t.userId, t.recordedAt),
  ],
)

export type MoodLogRow = typeof moodLogs.$inferSelect
export type MoodLogInsert = typeof moodLogs.$inferInsert
