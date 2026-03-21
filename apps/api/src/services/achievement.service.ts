import { getDb, achievements, healthMetrics, personalRecords, goals, events } from "@biosync-io/db"
import type { AchievementInsert, AchievementRow } from "@biosync-io/db"
import { and, count, eq, gte, sql, sum } from "drizzle-orm"

/**
 * Achievements Service — Feature #4 (Gamification / Badge System)
 *
 * Defines achievement criteria and checks whether users have unlocked them.
 * Achievements are awarded automatically after syncs and goal evaluations.
 */

export interface AchievementDef {
  id: string
  name: string
  description: string
  category: string
  tier: string
  icon: string
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // Milestone achievements
  { id: "steps-100k", name: "Century Walker", description: "Accumulate 100,000 lifetime steps", category: "milestone", tier: "bronze", icon: "🚶" },
  { id: "steps-1m", name: "Million Stepper", description: "Accumulate 1,000,000 lifetime steps", category: "milestone", tier: "silver", icon: "🏃" },
  { id: "steps-10m", name: "Legendary Walker", description: "Accumulate 10,000,000 lifetime steps", category: "milestone", tier: "gold", icon: "⭐" },
  { id: "distance-marathon", name: "Marathon Distance", description: "Complete 42.2km in cumulative distance", category: "milestone", tier: "silver", icon: "🏅" },
  { id: "distance-100k", name: "Ultra Runner", description: "Complete 100km in cumulative distance", category: "milestone", tier: "gold", icon: "🏆" },
  { id: "workouts-10", name: "Getting Started", description: "Complete 10 workouts", category: "milestone", tier: "bronze", icon: "💪" },
  { id: "workouts-50", name: "Fitness Enthusiast", description: "Complete 50 workouts", category: "milestone", tier: "silver", icon: "🔥" },
  { id: "workouts-100", name: "Workout Warrior", description: "Complete 100 workouts", category: "milestone", tier: "gold", icon: "⚡" },
  { id: "workouts-500", name: "Iron Will", description: "Complete 500 workouts", category: "milestone", tier: "platinum", icon: "🎖️" },
  { id: "calories-100k", name: "Calorie Crusher", description: "Burn 100,000 kcal total", category: "milestone", tier: "silver", icon: "🔥" },

  // Streak achievements
  { id: "streak-7d", name: "Week Warrior", description: "Maintain a 7-day activity streak", category: "streak", tier: "bronze", icon: "📅" },
  { id: "streak-30d", name: "Monthly Master", description: "Maintain a 30-day activity streak", category: "streak", tier: "silver", icon: "📆" },
  { id: "streak-100d", name: "Century Streak", description: "Maintain a 100-day activity streak", category: "streak", tier: "gold", icon: "💯" },
  { id: "streak-365d", name: "Year-Round Athlete", description: "Maintain a 365-day activity streak", category: "streak", tier: "diamond", icon: "👑" },

  // Personal record achievements
  { id: "pr-first", name: "Personal Best", description: "Set your first personal record", category: "personal_record", tier: "bronze", icon: "🥇" },
  { id: "pr-10", name: "Record Breaker", description: "Set 10 personal records", category: "personal_record", tier: "silver", icon: "📊" },

  // Health score achievements
  { id: "score-90", name: "Elite Health", description: "Achieve a 90+ health score", category: "milestone", tier: "gold", icon: "💎" },
  { id: "score-80-7d", name: "Consistently Healthy", description: "Maintain 80+ health score for 7 days", category: "streak", tier: "silver", icon: "📈" },

  // Sleep achievements
  { id: "sleep-perfect-7d", name: "Sleep Champion", description: "7 consecutive nights of 7-9 hours sleep", category: "streak", tier: "silver", icon: "😴" },

  // Special achievements
  { id: "first-sync", name: "Connected", description: "Complete your first data sync", category: "special", tier: "bronze", icon: "🔗" },
  { id: "multi-provider", name: "Data Collector", description: "Connect 3 or more providers", category: "special", tier: "silver", icon: "📲" },
  { id: "first-goal", name: "Goal Setter", description: "Set your first health goal", category: "special", tier: "bronze", icon: "🎯" },
  { id: "first-mood", name: "Mindful", description: "Log your first mood entry", category: "special", tier: "bronze", icon: "🧠" },
]

export class AchievementService {
  private get db() {
    return getDb()
  }

  getDefinitions(): AchievementDef[] {
    return ACHIEVEMENT_DEFS
  }

  async listForUser(userId: string): Promise<AchievementRow[]> {
    return this.db
      .select()
      .from(achievements)
      .where(eq(achievements.userId, userId))
      .orderBy(achievements.unlockedAt)
  }

  async checkAndAward(userId: string): Promise<AchievementRow[]> {
    // Get existing achievements to avoid duplicates
    const existing = await this.listForUser(userId)
    const existingIds = new Set(existing.map((a) => a.achievementId))
    const awarded: AchievementRow[] = []

    for (const def of ACHIEVEMENT_DEFS) {
      if (existingIds.has(def.id)) continue

      const unlocked = await this.checkCondition(userId, def.id)
      if (!unlocked) continue

      const [row] = await this.db
        .insert(achievements)
        .values({
          userId,
          achievementId: def.id,
          category: def.category,
          name: def.name,
          description: def.description,
          icon: def.icon,
          tier: def.tier,
          unlockedAt: new Date(),
          metadata: {},
        })
        .returning()

      if (row) awarded.push(row)
    }

    return awarded
  }

  private async checkCondition(userId: string, achievementId: string): Promise<boolean> {
    switch (achievementId) {
      case "workouts-10":
      case "workouts-50":
      case "workouts-100":
      case "workouts-500": {
        const target = { "workouts-10": 10, "workouts-50": 50, "workouts-100": 100, "workouts-500": 500 }[achievementId]!
        const [result] = await this.db
          .select({ cnt: count() })
          .from(events)
          .where(and(eq(events.userId, userId), eq(events.eventType, "workout")))
        return (result?.cnt ?? 0) >= target
      }

      case "pr-first":
      case "pr-10": {
        const target = achievementId === "pr-first" ? 1 : 10
        const [result] = await this.db
          .select({ cnt: count() })
          .from(personalRecords)
          .where(eq(personalRecords.userId, userId))
        return (result?.cnt ?? 0) >= target
      }

      case "first-goal": {
        const [result] = await this.db
          .select({ cnt: count() })
          .from(goals)
          .where(eq(goals.userId, userId))
        return (result?.cnt ?? 0) >= 1
      }

      case "streak-7d":
      case "streak-30d":
      case "streak-100d":
      case "streak-365d": {
        const target = { "streak-7d": 7, "streak-30d": 30, "streak-100d": 100, "streak-365d": 365 }[achievementId]!
        const [goalRow] = await this.db
          .select({ longest: goals.longestStreak })
          .from(goals)
          .where(eq(goals.userId, userId))
          .orderBy(sql`longest_streak DESC NULLS LAST`)
          .limit(1)
        return (goalRow?.longest ?? 0) >= target
      }

      default:
        return false
    }
  }
}
