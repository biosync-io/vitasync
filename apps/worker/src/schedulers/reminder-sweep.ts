import type { Queue } from "bullmq"
import type { Redis } from "ioredis"

/**
 * Periodic reminder scheduler — sweeps for due reminders every minute.
 *
 * Uses the same belt-and-suspenders approach as the sync scheduler:
 * a BullMQ repeatable job plus an in-process setInterval fallback.
 */

const REMINDER_SWEEP_INTERVAL_MS = 60_000 // 1 minute

async function ensureRepeatableJob(remindersQueue: Queue): Promise<void> {
  try {
    await remindersQueue.removeRepeatable(
      "reminder-sweep",
      { every: REMINDER_SWEEP_INTERVAL_MS },
      "periodic-reminder-sweep",
    )
  } catch {
    // No existing repeatable to remove
  }

  await remindersQueue.add(
    "reminder-sweep",
    { type: "reminder-sweep" },
    {
      repeat: { every: REMINDER_SWEEP_INTERVAL_MS },
      jobId: "periodic-reminder-sweep",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  )
}

export async function startReminderScheduler(
  remindersQueue: Queue,
  connection: Redis,
): Promise<() => Promise<void>> {
  await ensureRepeatableJob(remindersQueue)

  console.info(`[scheduler] Reminder sweep enabled — interval: ${REMINDER_SWEEP_INTERVAL_MS / 1000}s`)

  const timer = setInterval(() => {
    remindersQueue
      .add("reminder-sweep", { type: "reminder-sweep" }, {
        jobId: `reminder-sweep-${Math.floor(Date.now() / REMINDER_SWEEP_INTERVAL_MS)}`,
      })
      .catch((err) => {
        console.error("[scheduler] Reminder sweep enqueue error:", err)
      })
  }, REMINDER_SWEEP_INTERVAL_MS)

  const onReconnect = () => {
    console.info("[scheduler] Redis reconnected — re-registering reminder sweep")
    ensureRepeatableJob(remindersQueue).catch((err) => {
      console.error("[scheduler] Failed to re-register reminder sweep after reconnect:", err)
    })
  }

  connection.on("ready", onReconnect)

  return async () => {
    clearInterval(timer)
    connection.off("ready", onReconnect)
    try {
      await remindersQueue.removeRepeatable(
        "reminder-sweep",
        { every: REMINDER_SWEEP_INTERVAL_MS },
        "periodic-reminder-sweep",
      )
    } catch {
      // Queue may already be closed
    }
  }
}
