import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
  date,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Habit definitions — the habits a user wants to track.
 *
 * Each habit has a name, optional target frequency, and active status.
 */
export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Habit name (e.g., "Meditate", "Read 30 min", "Exercise") */
    name: varchar("name", { length: 100 }).notNull(),
    /** Emoji icon for the habit */
    icon: varchar("icon", { length: 10 }).default("✅"),
    /** Color for UI display */
    color: varchar("color", { length: 20 }).default("blue"),
    /** Target frequency: daily, weekdays, custom */
    frequency: varchar("frequency", { length: 20 }).notNull().default("daily"),
    /** Target days of the week (0=Sun, 6=Sat) for custom frequency */
    targetDays: jsonb("target_days").$type<number[]>().default([0, 1, 2, 3, 4, 5, 6]),
    /** Whether the habit is currently active */
    active: boolean("active").notNull().default(true),
    /** Current streak count */
    currentStreak: integer("current_streak").notNull().default(0),
    /** Best streak ever */
    longestStreak: integer("longest_streak").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_habits_user").on(t.userId),
  ],
)

/**
 * Habit completion logs — one entry per habit per day when completed.
 */
export const habitLogs = pgTable(
  "habit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The date the habit was completed */
    completedDate: date("completed_date").notNull(),
    /** Optional note */
    note: varchar("note", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_habit_logs_habit_date").on(t.habitId, t.completedDate),
    index("idx_habit_logs_user_date").on(t.userId, t.completedDate),
  ],
)

export type HabitRow = typeof habits.$inferSelect
export type HabitInsert = typeof habits.$inferInsert
export type HabitLogRow = typeof habitLogs.$inferSelect
export type HabitLogInsert = typeof habitLogs.$inferInsert
