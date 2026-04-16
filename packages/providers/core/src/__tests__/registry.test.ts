import type { ProviderDefinition } from "@biosync-io/types"
import { beforeEach, describe, expect, it } from "vitest"
import { providerRegistry } from "../registry.js"

const fakeDefinition: ProviderDefinition = {
  id: "test-provider",
  name: "Test Provider",
  description: "A fake provider for testing",
  capabilities: {
    supportedMetrics: [],
    supportsWebhooks: false,
    oauth2: true,
    oauth1: false,
  },
}

const anotherDefinition: ProviderDefinition = {
  id: "another-provider",
  name: "Another Provider",
  description: "Another fake provider",
  capabilities: {
    supportedMetrics: [],
    supportsWebhooks: true,
    oauth2: true,
    oauth1: false,
  },
}

// Minimal fake provider object (we only need it to verify factory calls)
const fakeProviderInstance = { definition: fakeDefinition } as ReturnType<
  typeof providerRegistry.resolve
>

describe("ProviderRegistry", () => {
  beforeEach(() => {
    providerRegistry.clear()
  })

  it("registers and resolves a provider", () => {
    const factory = () => fakeProviderInstance
    providerRegistry.register(fakeDefinition, factory)

    const resolved = providerRegistry.resolve("test-provider")
    expect(resolved).toBe(fakeProviderInstance)
  })

  it("throws when registering a duplicate provider id", () => {
    providerRegistry.register(fakeDefinition, () => fakeProviderInstance)

    expect(() => providerRegistry.register(fakeDefinition, () => fakeProviderInstance)).toThrow(
      'Provider "test-provider" is already registered.',
    )
  })

  it("throws when resolving an unregistered provider", () => {
    expect(() => providerRegistry.resolve("nonexistent")).toThrow(
      'Provider "nonexistent" is not registered.',
    )
  })

  it("lists error message with available provider ids", () => {
    providerRegistry.register(fakeDefinition, () => fakeProviderInstance)

    expect(() => providerRegistry.resolve("unknown")).toThrow("Available: [test-provider]")
  })

  it("calls factory on each resolve (lazy instantiation)", () => {
    let callCount = 0
    providerRegistry.register(fakeDefinition, () => {
      callCount++
      return fakeProviderInstance
    })

    providerRegistry.resolve("test-provider")
    providerRegistry.resolve("test-provider")
    expect(callCount).toBe(2)
  })

  describe("getDefinition", () => {
    it("returns definition for registered provider", () => {
      providerRegistry.register(fakeDefinition, () => fakeProviderInstance)
      expect(providerRegistry.getDefinition("test-provider")).toBe(fakeDefinition)
    })

    it("returns undefined for unregistered provider", () => {
      expect(providerRegistry.getDefinition("unknown")).toBeUndefined()
    })
  })

  describe("listDefinitions", () => {
    it("returns all registered definitions", () => {
      providerRegistry.register(fakeDefinition, () => fakeProviderInstance)
      providerRegistry.register(anotherDefinition, () => fakeProviderInstance)

      const defs = providerRegistry.listDefinitions()
      expect(defs).toHaveLength(2)
      expect(defs.map((d) => d.id)).toEqual(
        expect.arrayContaining(["test-provider", "another-provider"]),
      )
    })

    it("returns empty array when no providers registered", () => {
      expect(providerRegistry.listDefinitions()).toEqual([])
    })
  })

  describe("isRegistered", () => {
    it("returns true for registered provider", () => {
      providerRegistry.register(fakeDefinition, () => fakeProviderInstance)
      expect(providerRegistry.isRegistered("test-provider")).toBe(true)
    })

    it("returns false for unregistered provider", () => {
      expect(providerRegistry.isRegistered("unknown")).toBe(false)
    })
  })

  describe("clear", () => {
    it("removes all registered providers", () => {
      providerRegistry.register(fakeDefinition, () => fakeProviderInstance)
      providerRegistry.register(anotherDefinition, () => fakeProviderInstance)

      providerRegistry.clear()

      expect(providerRegistry.listDefinitions()).toEqual([])
      expect(providerRegistry.isRegistered("test-provider")).toBe(false)
    })
  })
})
