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
 * Symptom logs for health diary / medical journaling.
 *
 * Users track symptoms with severity, duration, and context.
 * Supports correlation analysis with health metrics and medication adherence.
 */
export const symptomLogs = pgTable(
  "symptom_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Symptom name: headache, fatigue, nausea, muscle_pain, insomnia, etc. */
    symptom: varchar("symptom", { length: 100 }).notNull(),
    /** Severity 1–10 */
    severity: doublePrecision("severity").notNull(),
    /** Duration in minutes (null if ongoing) */
    durationMinutes: doublePrecision("duration_minutes"),
    /** Body location: head, chest, back, legs, stomach, etc. */
    bodyLocation: varchar("body_location", { length: 50 }),
    /** Trigger factors */
    triggers: jsonb("triggers").$type<string[]>(),
    /** Relief measures taken */
    reliefMeasures: jsonb("relief_measures").$type<string[]>(),
    notes: varchar("notes", { length: 2000 }),
    /** When the symptom started */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** When it resolved (null if ongoing) */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_symptom_logs_user_time").on(t.userId, t.startedAt),
    index("idx_symptom_logs_user_symptom").on(t.userId, t.symptom),
  ],
)

export type SymptomLogRow = typeof symptomLogs.$inferSelect
export type SymptomLogInsert = typeof symptomLogs.$inferInsert
