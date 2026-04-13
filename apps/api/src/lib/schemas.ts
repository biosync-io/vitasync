import { z } from "zod"

// ── Pagination ────────────────────────────────────────────────

/** Standard offset-based pagination query params */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type PaginationQuery = z.infer<typeof paginationSchema>

/** Cursor-based pagination query params */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type CursorPaginationQuery = z.infer<typeof cursorPaginationSchema>

// ── Common params ─────────────────────────────────────────────

/** UUID path param — use for :id, :userId, :connectionId etc. */
export const uuidParam = z.string().uuid()

/** UUID object param schema — e.g. { connectionId: z.string().uuid() } */
export const idParamSchema = z.object({
  id: z.string().uuid(),
})

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
})

// ── Sort / filter ─────────────────────────────────────────────

export const sortOrderSchema = z.enum(["asc", "desc"]).default("desc")

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
