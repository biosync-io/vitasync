import type { Job } from "bullmq"
import { getDb, smartReminders, reminderLogs, goals } from "@biosync-io/db"
import type { SmartReminderRow } from "@biosync-io/db"
import { and, eq, lte } from "drizzle-orm"
import { getNotificationQueue } from "../queues/notification.js"

/**
 * BullMQ processor for smart reminder evaluation and delivery.
 *
 * This processor handles two job types:
 *
 * 1. "reminder-sweep" — Scheduled sweep that finds all due reminders and
 *    enqueues individual "fire-reminder" jobs for each.
 *
 * 2. "fire-reminder" — Evaluates a single reminder, builds a context-aware
 *    notification body (including goal progress), and enqueues a notification
 *    delivery job.
 */

interface ReminderSweepData {
  type: "reminder-sweep"
}

interface FireReminderData {
  type: "fire-reminder"
  reminderId: string
  userId: string
}

type ReminderJobData = ReminderSweepData | FireReminderData

export async function processReminderJob(job: Job<ReminderJobData>): Promise<void> {
  if (job.data.type === "reminder-sweep") {
    await sweepDueReminders()
  } else if (job.data.type === "fire-reminder") {
    await fireReminder(job.data.reminderId, job.data.userId)
  }
}

/**
 * Sweep: find all reminders where nextTriggerAt <= now, not snoozed, and active.
 * Enqueue a "fire-reminder" job for each.
 */
async function sweepDueReminders(): Promise<void> {
  const db = getDb()
  const now = new Date()

  const due = await db
    .select()
    .from(smartReminders)
    .where(
      and(
        eq(smartReminders.isActive, true),
        lte(smartReminders.nextTriggerAt, now),
      ),
    )
    .limit(100)

  // Filter out snoozed reminders
  const ready = due.filter((r) => !r.snoozedUntil || r.snoozedUntil <= now)

  if (ready.length === 0) return

  const { getRemindersQueue } = await import("../queues/reminders.js")
  const remindersQueue = getRemindersQueue()

  await Promise.allSettled(
    ready.map((r) =>
      remindersQueue.add("fire-reminder", {
        type: "fire-reminder" as const,
        reminderId: r.id,
        userId: r.userId,
      }, {
        jobId: `fire-${r.id}-${Math.floor(Date.now() / 60000)}`,
      }),
    ),
  )

  console.info(`[reminders] Sweep: ${ready.length} reminder(s) due`)
}

/**
 * Fire a single reminder: build context-aware message, enqueue notification,
 * log the action, and advance the next trigger time.
 */
async function fireReminder(reminderId: string, userId: string): Promise<void> {
  const db = getDb()

  const [reminder] = await db
    .select()
    .from(smartReminders)
    .where(and(eq(smartReminders.id, reminderId), eq(smartReminders.isActive, true)))

  if (!reminder) {
    console.info(`[reminders] Reminder ${reminderId} no longer active — skipping`)
    return
  }

  // Double-check snooze
  if (reminder.snoozedUntil && reminder.snoozedUntil > new Date()) {
    console.info(`[reminders] Reminder ${reminderId} snoozed until ${reminder.snoozedUntil.toISOString()} — skipping`)
    return
  }

  // Build context-aware notification body
  const context = await buildReminderContext(reminder)

  // Enqueue notification delivery
  const notificationQueue = getNotificationQueue()
  await notificationQueue.add("smart-reminder", {
    userId: reminder.userId,
    workspaceId: "",
    title: context.title,
    body: context.body,
    severity: "info",
    category: "reminder",
    url: reminder.goalId ? `/dashboard/goals` : "/dashboard/reminders",
    metadata: {
      reminderId: reminder.id,
      reminderType: reminder.reminderType,
      goalId: reminder.goalId,
      ...(context.progressSnapshot ?? {}),
    },
  })

  // Log the sent action
  await db.insert(reminderLogs).values({
    reminderId: reminder.id,
    userId: reminder.userId,
    action: "sent",
    progressSnapshot: context.progressSnapshot,
  })

  // Advance next trigger
  const nextTriggerAt = computeNextTrigger(reminder)
  await db
    .update(smartReminders)
    .set({
      lastTriggeredAt: new Date(),
      nextTriggerAt,
      snoozedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(smartReminders.id, reminderId))

  console.info(`[reminders] Fired reminder ${reminderId} for user ${userId} — next at ${nextTriggerAt.toISOString()}`)
}

/**
 * Build a smart notification body by checking the linked goal's progress.
 */
async function buildReminderContext(reminder: SmartReminderRow): Promise<{
  title: string
  body: string
  progressSnapshot: Record<string, unknown> | null
}> {
  if (!reminder.goalId) {
    return {
      title: `⏰ ${reminder.name}`,
      body: reminder.description ?? "Time to check in on your health!",
      progressSnapshot: null,
    }
  }

  const db = getDb()
  const [goal] = await db
    .select()
    .from(goals)
    .where(eq(goals.id, reminder.goalId))

  if (!goal) {
    return {
      title: `⏰ ${reminder.name}`,
      body: reminder.description ?? "Time to check in on your health!",
      progressSnapshot: null,
    }
  }

  const pct = goal.targetValue > 0
    ? Math.round(((goal.currentValue ?? 0) / goal.targetValue) * 100)
    : 0

  const progressSnapshot = {
    goalName: goal.name,
    currentValue: goal.currentValue,
    targetValue: goal.targetValue,
    unit: goal.unit,
    percentComplete: pct,
    currentStreak: goal.currentStreak,
  }

  let body: string
  if (pct >= 100) {
    body = `🎉 Great job! You've already completed "${goal.name}" (${pct}%). Keep the momentum going!`
  } else if (pct >= 75) {
    body = `💪 Almost there! "${goal.name}" is at ${pct}%. Just a little more to reach your target of ${goal.targetValue} ${goal.unit ?? ""}.`
  } else if (pct >= 50) {
    body = `📊 You're halfway on "${goal.name}" (${pct}%). ${goal.targetValue - (goal.currentValue ?? 0)} ${goal.unit ?? ""} left to go!`
  } else if (pct > 0) {
    body = `🏃 "${goal.name}" is at ${pct}%. You've got ${goal.targetValue - (goal.currentValue ?? 0)} ${goal.unit ?? ""} remaining — you can do it!`
  } else {
    body = `⏰ Time to work on "${goal.name}"! Your target is ${goal.targetValue} ${goal.unit ?? ""} ${goal.cadence}.`
  }

  if ((goal.currentStreak ?? 0) > 0) {
    body += ` 🔥 ${goal.currentStreak}-day streak!`
  }

  return {
    title: `⏰ ${reminder.name}`,
    body,
    progressSnapshot,
  }
}

function computeNextTrigger(
  data: Pick<SmartReminderRow, "frequency" | "timeOfDay" | "dayOfWeek" | "dayOfMonth" | "timezone">,
): Date {
  const now = new Date()
  const [hours, minutes] = (data.timeOfDay ?? "09:00").split(":").map(Number)

  const next = new Date(now)
  next.setSeconds(0, 0)
  next.setHours(hours!, minutes!)

  switch (data.frequency) {
    case "daily":
      if (next <= now) next.setDate(next.getDate() + 1)
      break
    case "weekly": {
      const targetDay = data.dayOfWeek ?? 1
      const currentDay = next.getDay()
      let daysAhead = targetDay - currentDay
      if (daysAhead < 0 || (daysAhead === 0 && next <= now)) daysAhead += 7
      next.setDate(next.getDate() + daysAhead)
      break
    }
    case "monthly": {
      const targetDate = data.dayOfMonth ?? 1
      next.setDate(targetDate)
      if (next <= now) next.setMonth(next.getMonth() + 1)
      break
    }
    default:
      if (next <= now) next.setDate(next.getDate() + 1)
  }

  return next
}
