import { describe, it, expect } from "vitest"
import { AppError, ErrorCode } from "../api.js"

describe("AppError", () => {
  describe("constructor", () => {
    it("creates error with all properties", () => {
      const err = new AppError("test", ErrorCode.NOT_FOUND, 404, { key: "value" })

      expect(err).toBeInstanceOf(Error)
      expect(err).toBeInstanceOf(AppError)
      expect(err.message).toBe("test")
      expect(err.code).toBe("NOT_FOUND")
      expect(err.statusCode).toBe(404)
      expect(err.details).toEqual({ key: "value" })
      expect(err.name).toBe("AppError")
    })

    it("defaults statusCode to 500", () => {
      const err = new AppError("test", ErrorCode.INTERNAL_ERROR)
      expect(err.statusCode).toBe(500)
    })
  })

  describe("static factories", () => {
    it("notFound — 404 with resource name", () => {
      const err = AppError.notFound("User", "abc-123")
      expect(err.statusCode).toBe(404)
      expect(err.code).toBe("NOT_FOUND")
      expect(err.message).toBe("User 'abc-123' not found")
    })

    it("notFound — without id", () => {
      const err = AppError.notFound("Connection")
      expect(err.message).toBe("Connection not found")
    })

    it("validation — 400 with details", () => {
      const err = AppError.validation("Bad input", { field: "email" })
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe("VALIDATION_ERROR")
      expect(err.details).toEqual({ field: "email" })
    })

    it("unauthorized — 401", () => {
      const err = AppError.unauthorized()
      expect(err.statusCode).toBe(401)
      expect(err.code).toBe("UNAUTHORIZED")
      expect(err.message).toBe("Authentication required")
    })

    it("unauthorized — custom message", () => {
      const err = AppError.unauthorized("Token expired")
      expect(err.message).toBe("Token expired")
    })

    it("forbidden — 403", () => {
      const err = AppError.forbidden()
      expect(err.statusCode).toBe(403)
      expect(err.code).toBe("FORBIDDEN")
    })

    it("conflict — 409", () => {
      const err = AppError.conflict("Already enrolled")
      expect(err.statusCode).toBe(409)
      expect(err.code).toBe("CONFLICT")
    })

    it("rateLimited — 429", () => {
      const err = AppError.rateLimited()
      expect(err.statusCode).toBe(429)
      expect(err.code).toBe("RATE_LIMITED")
    })

    it("accountLocked — 423", () => {
      const err = AppError.accountLocked()
      expect(err.statusCode).toBe(423)
      expect(err.code).toBe("ACCOUNT_LOCKED")
      expect(err.message).toContain("locked")
    })

    it("unsupported — 400", () => {
      const err = AppError.unsupported("OAuth1 not supported")
      expect(err.statusCode).toBe(400)
      expect(err.code).toBe("UNSUPPORTED")
    })

    it("providerError — 502 with details", () => {
      const err = AppError.providerError("Fitbit API down", { status: 503 })
      expect(err.statusCode).toBe(502)
      expect(err.code).toBe("PROVIDER_ERROR")
      expect(err.details).toEqual({ status: 503 })
    })

    it("internal — 500", () => {
      const err = AppError.internal()
      expect(err.statusCode).toBe(500)
      expect(err.code).toBe("INTERNAL_ERROR")
    })
  })

  describe("toJSON", () => {
    it("serializes without details when none provided", () => {
      const err = AppError.notFound("User")
      const json = err.toJSON()

      expect(json).toEqual({
        code: "NOT_FOUND",
        message: "User not found",
      })
      expect(json).not.toHaveProperty("details")
    })

    it("serializes with details when provided", () => {
      const err = AppError.validation("Invalid", { field: "name" })
      const json = err.toJSON()

      expect(json).toEqual({
        code: "VALIDATION_ERROR",
        message: "Invalid",
        details: { field: "name" },
      })
    })
  })

  describe("instanceof checks", () => {
    it("is catchable as Error", () => {
      try {
        throw AppError.notFound("X")
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        expect(e).toBeInstanceOf(AppError)
      }
    })
  })
})

describe("ErrorCode", () => {
  it("contains all expected client error codes", () => {
    expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED")
    expect(ErrorCode.FORBIDDEN).toBe("FORBIDDEN")
    expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND")
    expect(ErrorCode.CONFLICT).toBe("CONFLICT")
    expect(ErrorCode.ALREADY_EXISTS).toBe("ALREADY_EXISTS")
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR")
    expect(ErrorCode.RATE_LIMITED).toBe("RATE_LIMITED")
    expect(ErrorCode.ACCOUNT_LOCKED).toBe("ACCOUNT_LOCKED")
    expect(ErrorCode.UNSUPPORTED).toBe("UNSUPPORTED")
  })

  it("contains all expected provider error codes", () => {
    expect(ErrorCode.PROVIDER_ERROR).toBe("PROVIDER_ERROR")
    expect(ErrorCode.PROVIDER_AUTH_FAILED).toBe("PROVIDER_AUTH_FAILED")
    expect(ErrorCode.PROVIDER_RATE_LIMITED).toBe("PROVIDER_RATE_LIMITED")
    expect(ErrorCode.PROVIDER_UNAVAILABLE).toBe("PROVIDER_UNAVAILABLE")
    expect(ErrorCode.TOKEN_EXPIRED).toBe("TOKEN_EXPIRED")
    expect(ErrorCode.TOKEN_REFRESH_FAILED).toBe("TOKEN_REFRESH_FAILED")
  })

  it("contains all expected system error codes", () => {
    expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR")
    expect(ErrorCode.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE")
    expect(ErrorCode.DATABASE_ERROR).toBe("DATABASE_ERROR")
    expect(ErrorCode.QUEUE_ERROR).toBe("QUEUE_ERROR")
  })
})
