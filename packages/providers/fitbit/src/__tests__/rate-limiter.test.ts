import { describe, expect, it } from "vitest"
import { RateLimitBudget } from "../rate-limiter.js"

describe("RateLimitBudget", () => {
  it("starts with full budget", () => {
    const budget = new RateLimitBudget()
    expect(budget.getRemaining()).toBe(150)
    expect(budget.canRequest()).toBe(true)
  })

  it("updates remaining from response headers", () => {
    const budget = new RateLimitBudget()
    budget.update({
      get: (name: string) => {
        if (name === "Fitbit-Rate-Limit-Remaining") return "42"
        if (name === "Fitbit-Rate-Limit-Reset") return "3600"
        return null
      },
    })
    expect(budget.getRemaining()).toBe(42)
  })

  it("decrements remaining when no header present", () => {
    const budget = new RateLimitBudget(10)
    budget.update({ get: () => null })
    expect(budget.getRemaining()).toBe(9)
  })

  it("reports canRequest false when at reserve threshold", () => {
    const budget = new RateLimitBudget(5) // reserve is 5
    expect(budget.canRequest()).toBe(false)
  })

  it("reports canRequest true when above reserve", () => {
    const budget = new RateLimitBudget(6)
    expect(budget.canRequest()).toBe(true)
  })

  it("waitIfNeeded resolves immediately when budget is available", async () => {
    const budget = new RateLimitBudget(100)
    const start = Date.now()
    await budget.waitIfNeeded()
    expect(Date.now() - start).toBeLessThan(50)
  })

  it("accepts custom initial budget", () => {
    const budget = new RateLimitBudget(50)
    expect(budget.getRemaining()).toBe(50)
  })
})
