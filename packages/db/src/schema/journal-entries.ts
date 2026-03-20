import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  doublePrecision,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Daily journal entries for reflective wellness tracking.
 *
 * Users can write free-form journal entries with optional mood tagging,
 * gratitude lists, and contextual tags. Supports full-text search on
 * title and body content.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Short title or headline for the entry */
    title: varchar("title", { length: 200 }),
    /** Main body text (markdown-friendly) */
    body: text("body").notNull(),
    /** Overall mood score 1–5 at the time of writing */
    moodScore: doublePrecision("mood_score"),
    /** Mood label: happy, calm, anxious, sad, energized, tired, grateful, reflective */
    moodLabel: varchar("mood_label", { length: 50 }),
    /** Gratitude items — things the user is grateful for */
    gratitude: jsonb("gratitude").$type<string[]>().default([]),
    /** Free-form tags for categorization */
    tags: jsonb("tags").$type<string[]>().default([]),
    /** Whether this is a private entry (future use) */
    isPrivate: varchar("is_private", { length: 5 }).default("true"),
    /** When the journal entry is for (may differ from createdAt) */
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_journal_entries_user_date").on(t.userId, t.entryDate),
  ],
)

export type JournalEntryRow = typeof journalEntries.$inferSelect
export type JournalEntryInsert = typeof journalEntries.$inferInsert
