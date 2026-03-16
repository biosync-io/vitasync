#!/usr/bin/env node
/**
 * VitaSync MCP Server
 *
 * Exposes VitaSync health data to AI assistants via the Model Context Protocol.
 * Connects to the VitaSync PostgreSQL database in read-only mode.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node dist/index.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import postgres from "postgres"
import { z } from "zod"

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  process.stderr.write("ERROR: DATABASE_URL environment variable is required\n")
  process.exit(1)
}

const MAX_ROWS = Number(process.env.MCP_MAX_ROWS ?? 1000)
const QUERY_TIMEOUT_MS = Number(process.env.MCP_READ_TIMEOUT_MS ?? 10_000)

// ── Database ──────────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
  // Read-only: ensure no writes slip through
  connection: { default_transaction_read_only: "on" },
})

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "vitasync",
  version: "0.1.0",
})

// ── Tool: query_health_metrics ────────────────────────────────────────────────

server.tool(
  "query_health_metrics",
  "Query health metrics from VitaSync (steps, heart rate, sleep, weight, etc.) for a user within a time range.",
  {
    userId: z.string().uuid().describe("The VitaSync user ID to query metrics for"),
    metricType: z
      .string()
      .optional()
      .describe(
        "Filter by metric type, e.g. steps, heart_rate, resting_heart_rate, weight, sleep_score, calories, distance, floors, active_minutes, body_fat, blood_oxygen, heart_rate_variability",
      ),
    from: z
      .string()
      .datetime()
      .optional()
      .describe("Start of the time range (ISO 8601). Defaults to 30 days ago."),
    to: z
      .string()
      .datetime()
      .optional()
      .describe("End of the time range (ISO 8601). Defaults to now."),
    providerId: z
      .string()
      .optional()
      .describe("Filter by provider, e.g. fitbit, garmin, whoop, strava"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .default(100)
      .describe("Maximum number of rows to return"),
  },
  async ({ userId, metricType, from, to, providerId, limit }) => {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const toDate = to ? new Date(to) : new Date()

    const rows = await Promise.race([
      sql`
        SELECT
          id,
          provider_id,
          metric_type,
          recorded_at,
          value,
          unit,
          source,
          data
        FROM health_metrics
        WHERE user_id = ${userId}
          AND recorded_at >= ${fromDate}
          AND recorded_at <= ${toDate}
          ${metricType ? sql`AND metric_type = ${metricType}` : sql``}
          ${providerId ? sql`AND provider_id = ${providerId}` : sql``}
        ORDER BY recorded_at DESC
        LIMIT ${limit}
      `,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), QUERY_TIMEOUT_MS),
      ),
    ])

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: rows.length,
              metrics: rows,
              query: { userId, metricType, from: fromDate, to: toDate, providerId },
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

// ── Tool: list_users ──────────────────────────────────────────────────────────

server.tool(
  "list_users",
  "List users in the VitaSync workspace. Optionally search by email or external ID.",
  {
    workspaceId: z
      .string()
      .uuid()
      .optional()
      .describe("Filter by workspace ID (omit to return users across all workspaces)"),
    search: z
      .string()
      .optional()
      .describe("Search string matched against email and displayName (case-insensitive)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .default(50)
      .describe("Maximum number of users to return"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  },
  async ({ workspaceId, search, limit, offset }) => {
    const rows = await Promise.race([
      sql`
        SELECT
          id,
          workspace_id,
          external_id,
          email,
          display_name,
          created_at,
          updated_at
        FROM users
        WHERE TRUE
          ${workspaceId ? sql`AND workspace_id = ${workspaceId}` : sql``}
          ${
            search
              ? sql`AND (
                  email ILIKE ${`%${search}%`}
                  OR display_name ILIKE ${`%${search}%`}
                  OR external_id ILIKE ${`%${search}%`}
                )`
              : sql``
          }
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), QUERY_TIMEOUT_MS),
      ),
    ])

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ count: rows.length, users: rows }, null, 2),
        },
      ],
    }
  },
)

// ── Tool: list_connections ────────────────────────────────────────────────────

server.tool(
  "list_connections",
  "List provider connections for a user or across all users. Shows which wearable providers are connected and their sync status.",
  {
    userId: z.string().uuid().optional().describe("Filter connections for a specific user ID"),
    providerId: z
      .string()
      .optional()
      .describe("Filter by provider, e.g. fitbit, garmin, whoop, strava"),
    status: z
      .enum(["active", "error", "disconnected"])
      .optional()
      .describe("Filter by connection status"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .default(50)
      .describe("Maximum number of connections to return"),
  },
  async ({ userId, providerId, status, limit }) => {
    const rows = await Promise.race([
      sql`
        SELECT
          pc.id,
          pc.user_id,
          u.email,
          u.display_name,
          pc.provider_id,
          pc.status,
          pc.provider_user_id,
          pc.scopes,
          pc.last_synced_at,
          pc.created_at,
          pc.updated_at
        FROM provider_connections pc
        JOIN users u ON u.id = pc.user_id
        WHERE TRUE
          ${userId ? sql`AND pc.user_id = ${userId}` : sql``}
          ${providerId ? sql`AND pc.provider_id = ${providerId}` : sql``}
          ${status ? sql`AND pc.status = ${status}` : sql``}
        ORDER BY pc.last_synced_at DESC NULLS LAST
        LIMIT ${limit}
      `,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), QUERY_TIMEOUT_MS),
      ),
    ])

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ count: rows.length, connections: rows }, null, 2),
        },
      ],
    }
  },
)

// ── Tool: get_events ──────────────────────────────────────────────────────────

server.tool(
  "get_events",
  "Query workout, sleep, and activity events for a user. Events have rich structured data (duration, distance, calories, heart rate, sleep stages, etc.).",
  {
    userId: z.string().uuid().describe("The VitaSync user ID to query events for"),
    eventType: z
      .enum(["workout", "sleep", "activity"])
      .optional()
      .describe("Filter by event category: workout, sleep, or activity"),
    activityType: z
      .string()
      .optional()
      .describe("Filter by activity sub-type, e.g. running, cycling, yoga, pool_swimming"),
    from: z
      .string()
      .datetime()
      .optional()
      .describe("Start of the time range (ISO 8601). Defaults to 30 days ago."),
    to: z.string().datetime().optional().describe("End of the time range (ISO 8601)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ROWS)
      .default(50)
      .describe("Maximum number of events to return"),
  },
  async ({ userId, eventType, activityType, from, to, limit }) => {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const toDate = to ? new Date(to) : new Date()

    const rows = await Promise.race([
      sql`
        SELECT
          id,
          provider_id,
          event_type,
          activity_type,
          title,
          started_at,
          ended_at,
          duration_seconds,
          distance_meters,
          calories_kcal,
          avg_heart_rate,
          max_heart_rate,
          avg_speed_mps,
          elevation_gain_meters,
          notes,
          data
        FROM events
        WHERE user_id = ${userId}
          AND started_at >= ${fromDate}
          AND started_at <= ${toDate}
          ${eventType ? sql`AND event_type = ${eventType}` : sql``}
          ${activityType ? sql`AND activity_type = ${activityType}` : sql``}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), QUERY_TIMEOUT_MS),
      ),
    ])

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              count: rows.length,
              events: rows,
              query: { userId, eventType, activityType, from: fromDate, to: toDate },
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

// ── Tool: get_personal_records ────────────────────────────────────────────────

server.tool(
  "get_personal_records",
  "Retrieve all-time personal bests (records) for a user across all metric types, or filter by a specific metric type.",
  {
    userId: z.string().uuid().describe("The VitaSync user ID to get personal records for"),
    metricType: z
      .string()
      .optional()
      .describe(
        "Filter to a specific metric type, e.g. steps, distance, calories, heart_rate_variability, weight",
      ),
    category: z
      .string()
      .optional()
      .describe(
        "Filter by activity sub-category (e.g. running for a distance PR set during a run)",
      ),
  },
  async ({ userId, metricType, category }) => {
    const rows = await Promise.race([
      sql`
        SELECT
          id,
          metric_type,
          category,
          value,
          unit,
          recorded_at,
          provider_id,
          created_at,
          updated_at
        FROM personal_records
        WHERE user_id = ${userId}
          ${metricType ? sql`AND metric_type = ${metricType}` : sql``}
          ${category ? sql`AND category = ${category}` : sql``}
        ORDER BY metric_type, category
      `,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Query timeout")), QUERY_TIMEOUT_MS),
      ),
    ])

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ count: rows.length, personalRecords: rows }, null, 2),
        },
      ],
    }
  },
)

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write("VitaSync MCP server started (stdio)\n")
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
