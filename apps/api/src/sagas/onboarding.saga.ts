import { getDb, users, goals, inAppNotifications } from "@biosync-io/db"
import { SagaBuilder } from "@biosync-io/saga"
import * as argon2 from "argon2"
import { eq } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface OnboardingSagaContext {
  email: string
  password: string
  displayName?: string
  externalId: string
  workspaceId: string
  gender?: string

  /** Populated during execution */
  userId?: string
  verificationToken?: string
}

// ---------------------------------------------------------------------------
// Saga definition
// ---------------------------------------------------------------------------

export const onboardingSaga = new SagaBuilder<OnboardingSagaContext>("user-onboarding")

  // ── 1. Create user ────────────────────────────────────────────
  .step("create-user", {
    execute: async (ctx) => {
      const db = getDb()
      const passwordHash = await argon2.hash(ctx.password)

      const [user] = await db
        .insert(users)
        .values({
          workspaceId: ctx.workspaceId,
          externalId: ctx.externalId,
          email: ctx.email,
          passwordHash,
          displayName: ctx.displayName,
          gender: ctx.gender,
        })
        .returning()

      if (!user) throw new Error("Failed to create user")

      return { ...ctx, userId: user.id }
    },
    compensate: async (ctx) => {
      if (ctx.userId) {
        const db = getDb()
        await db.delete(users).where(eq(users.id, ctx.userId))
      }
      return ctx
    },
  })

  // ── 2. Send verification email ────────────────────────────────
  .step("send-verification-email", {
    execute: async (ctx) => {
      if (!ctx.userId) throw new Error("Missing userId")

      // Generate a verification token.
      // In production this would invoke the email notification channel;
      // here we prepare the token so the caller can deliver it.
      const jose = await import("jose")
      const jwtSecret = new TextEncoder().encode(
        process.env.JWT_SECRET ?? "dev-secret-do-not-use-in-production!!",
      )

      const token = await new jose.SignJWT({
        sub: ctx.userId,
        email: ctx.email,
        purpose: "email-verify",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("24h")
        .setIssuedAt()
        .sign(jwtSecret)

      return { ...ctx, verificationToken: token }
    },
    // Verification email is idempotent — no compensation needed
    retries: 2,
  })

  // ── 3. Set up default goals ───────────────────────────────────
  .step("setup-default-goals", {
    execute: async (ctx) => {
      if (!ctx.userId) throw new Error("Missing userId")

      const db = getDb()
      const defaultGoals = [
        {
          userId: ctx.userId,
          name: "Daily Steps",
          description: "Walk at least 10,000 steps per day",
          category: "activity",
          metricType: "steps",
          targetValue: 10_000,
          unit: "steps",
          cadence: "daily" as const,
          currentValue: 0,
          isActive: true,
        },
        {
          userId: ctx.userId,
          name: "Sleep Duration",
          description: "Get at least 7 hours of sleep per night",
          category: "sleep",
          metricType: "sleep_duration",
          targetValue: 420, // 7 hours in minutes
          unit: "minutes",
          cadence: "daily" as const,
          currentValue: 0,
          isActive: true,
        },
        {
          userId: ctx.userId,
          name: "Weekly Active Minutes",
          description: "Accumulate 150 minutes of moderate activity per week",
          category: "activity",
          metricType: "active_minutes",
          targetValue: 150,
          unit: "minutes",
          cadence: "weekly" as const,
          currentValue: 0,
          isActive: true,
        },
      ]

      await db.insert(goals).values(defaultGoals).onConflictDoNothing()

      return ctx
    },
    compensate: async (ctx) => {
      if (ctx.userId) {
        const db = getDb()
        await db.delete(goals).where(eq(goals.userId, ctx.userId))
      }
      return ctx
    },
  })

  // ── 4. Create welcome notification ────────────────────────────
  .step("create-welcome-notification", {
    execute: async (ctx) => {
      if (!ctx.userId) throw new Error("Missing userId")

      const db = getDb()
      const displayLabel = ctx.displayName ?? ctx.email.split("@")[0]

      await db.insert(inAppNotifications).values({
        userId: ctx.userId,
        title: "Welcome to VitaSync! 🎉",
        body: `Hey ${displayLabel}, connect a health provider to start syncing your data.`,
        severity: "info",
        category: "onboarding",
      })

      return ctx
    },
    // Welcome notification is non-critical — no compensation
  })

  // ── Lifecycle hooks ───────────────────────────────────────────
  .onComplete(async (ctx) => {
    console.info(`[onboarding-saga] User ${ctx.userId} onboarded successfully`)
  })

  .onFailed(async (ctx, err, step) => {
    console.error(
      `[onboarding-saga] Failed at step "${step}" for ${ctx.email}: ${err.message}`,
    )
  })

  .build()
