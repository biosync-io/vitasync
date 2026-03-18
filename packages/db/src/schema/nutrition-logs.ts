import { sql } from "drizzle-orm"
import {
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
 * Nutrition and food logs.
 *
 * Tracks meals, macros, and micronutrients. Each entry represents a single
 * meal or snack with full macro breakdown.
 */
export const nutritionLogs = pgTable(
  "nutrition_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Meal type: breakfast, lunch, dinner, snack, supplement */
    mealType: varchar("meal_type", { length: 50 }).notNull(),
    /** Description of what was eaten */
    description: varchar("description", { length: 1000 }),
    /** Total calories (kcal) */
    calories: doublePrecision("calories"),
    /** Protein in grams */
    proteinGrams: doublePrecision("protein_grams"),
    /** Carbohydrates in grams */
    carbsGrams: doublePrecision("carbs_grams"),
    /** Fat in grams */
    fatGrams: doublePrecision("fat_grams"),
    /** Fiber in grams */
    fiberGrams: doublePrecision("fiber_grams"),
    /** Sugar in grams */
    sugarGrams: doublePrecision("sugar_grams"),
    /** Sodium in milligrams */
    sodiumMg: doublePrecision("sodium_mg"),
    /** Water intake in milliliters */
    waterMl: doublePrecision("water_ml"),
    /** Detailed micronutrients and food items */
    details: jsonb("details").$type<Record<string, unknown>>(),
    /** When the meal was consumed */
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_nutrition_logs_user_time").on(t.userId, t.consumedAt),
    index("idx_nutrition_logs_user_type").on(t.userId, t.mealType),
  ],
)

export type NutritionLogRow = typeof nutritionLogs.$inferSelect
export type NutritionLogInsert = typeof nutritionLogs.$inferInsert
