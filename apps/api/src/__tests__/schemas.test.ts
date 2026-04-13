import { describe, it, expect } from "vitest"
import {
  paginationSchema,
  cursorPaginationSchema,
  uuidParam,
  idParamSchema,
  userIdParamSchema,
  sortOrderSchema,
  dateRangeSchema,
} from "../lib/schemas.js"

describe("paginationSchema", () => {
  it("parses valid pagination params", () => {
    const result = paginationSchema.parse({ limit: "25", offset: "10" })
    expect(result).toEqual({ limit: 25, offset: 10 })
  })

  it("applies defaults when omitted", () => {
    const result = paginationSchema.parse({})
    expect(result).toEqual({ limit: 50, offset: 0 })
  })

  it("coerces string numbers", () => {
    const result = paginationSchema.parse({ limit: "5", offset: "0" })
    expect(result.limit).toBe(5)
  })

  it("rejects limit > 100", () => {
    expect(() => paginationSchema.parse({ limit: 200 })).toThrow()
  })

  it("rejects limit < 1", () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow()
  })

  it("rejects negative offset", () => {
    expect(() => paginationSchema.parse({ offset: -1 })).toThrow()
  })
})

describe("cursorPaginationSchema", () => {
  it("parses with cursor", () => {
    const result = cursorPaginationSchema.parse({ cursor: "abc123", limit: "10" })
    expect(result).toEqual({ cursor: "abc123", limit: 10 })
  })

  it("cursor is optional", () => {
    const result = cursorPaginationSchema.parse({})
    expect(result.cursor).toBeUndefined()
    expect(result.limit).toBe(50)
  })
})

describe("uuidParam", () => {
  it("accepts valid UUID", () => {
    const result = uuidParam.parse("550e8400-e29b-41d4-a716-446655440000")
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000")
  })

  it("rejects non-UUID string", () => {
    expect(() => uuidParam.parse("not-a-uuid")).toThrow()
  })

  it("rejects empty string", () => {
    expect(() => uuidParam.parse("")).toThrow()
  })
})

describe("idParamSchema", () => {
  it("parses valid id object", () => {
    const result = idParamSchema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" })
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000")
  })

  it("rejects missing id", () => {
    expect(() => idParamSchema.parse({})).toThrow()
  })
})

describe("userIdParamSchema", () => {
  it("parses valid userId", () => {
    const result = userIdParamSchema.parse({ userId: "550e8400-e29b-41d4-a716-446655440000" })
    expect(result.userId).toBe("550e8400-e29b-41d4-a716-446655440000")
  })
})

describe("sortOrderSchema", () => {
  it("accepts asc", () => {
    expect(sortOrderSchema.parse("asc")).toBe("asc")
  })

  it("accepts desc", () => {
    expect(sortOrderSchema.parse("desc")).toBe("desc")
  })

  it("defaults to desc", () => {
    expect(sortOrderSchema.parse(undefined)).toBe("desc")
  })

  it("rejects invalid value", () => {
    expect(() => sortOrderSchema.parse("random")).toThrow()
  })
})

describe("dateRangeSchema", () => {
  it("parses date strings", () => {
    const result = dateRangeSchema.parse({ from: "2026-01-01", to: "2026-12-31" })
    expect(result.from).toBeInstanceOf(Date)
    expect(result.to).toBeInstanceOf(Date)
  })

  it("both fields are optional", () => {
    const result = dateRangeSchema.parse({})
    expect(result.from).toBeUndefined()
    expect(result.to).toBeUndefined()
  })

  it("allows only from", () => {
    const result = dateRangeSchema.parse({ from: "2026-06-01" })
    expect(result.from).toBeInstanceOf(Date)
    expect(result.to).toBeUndefined()
  })
})
