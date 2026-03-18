import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Medication definitions (what the user takes).
 */
export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Dosage amount and unit (e.g., "500 mg") */
    dosage: varchar("dosage", { length: 100 }),
    /** Frequency: once_daily, twice_daily, weekly, as_needed */
    frequency: varchar("frequency", { length: 50 }).notNull(),
    /** Time of day: morning, afternoon, evening, bedtime */
    timeOfDay: jsonb("time_of_day").$type<string[]>().default([]),
    /** Category: prescription, supplement, vitamin, otc */
    category: varchar("category", { length: 50 }),
    /** Purpose / reason for taking */
    purpose: varchar("purpose", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    /** Side effects or interaction notes */
    notes: varchar("notes", { length: 2000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_medications_user").on(t.userId)],
)

export type MedicationRow = typeof medications.$inferSelect
export type MedicationInsert = typeof medications.$inferInsert

/**
 * Medication adherence log — one entry per dose taken/missed.
 */
export const medicationLogs = pgTable(
  "medication_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Status: taken, missed, skipped, delayed */
    status: varchar("status", { length: 20 }).notNull(),
    /** When the dose was actually taken */
    takenAt: timestamp("taken_at", { withTimezone: true }),
    /** When the dose was scheduled */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** Optional side effects reported after this dose */
    sideEffects: jsonb("side_effects").$type<string[]>(),
    notes: varchar("notes", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_medication_logs_med").on(t.medicationId),
    index("idx_medication_logs_user_time").on(t.userId, t.scheduledAt),
  ],
)

export type MedicationLogRow = typeof medicationLogs.$inferSelect
export type MedicationLogInsert = typeof medicationLogs.$inferInsert
