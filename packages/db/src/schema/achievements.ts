import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * Gamification achievements / badges.
 *
 * Unlocked automatically when users hit milestones (e.g., 100-day streak,
 * first marathon, 1M lifetime steps). Achievement definitions live in code;
 * this table tracks which user unlocked which achievement and when.
 */
export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stable achievement type ID (e.g., "steps-100k", "streak-30d") */
    achievementId: varchar("achievement_id", { length: 100 }).notNull(),
    /** Achievement category: milestone, streak, personal_record, social, special */
    category: varchar("category", { length: 50 }).notNull(),
    /** Display name */
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    /** Icon identifier or emoji */
    icon: varchar("icon", { length: 100 }),
    /** Tier: bronze, silver, gold, platinum, diamond */
    tier: varchar("tier", { length: 20 }),
    /** When the achievement was unlocked */
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull(),
    /** Context data (which metric triggered it, the value, etc.) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_achievements_user").on(t.userId),
    index("idx_achievements_user_type").on(t.userId, t.achievementId),
  ],
)

export type AchievementRow = typeof achievements.$inferSelect
export type AchievementInsert = typeof achievements.$inferInsert
