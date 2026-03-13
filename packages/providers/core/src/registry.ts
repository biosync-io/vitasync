import type { ProviderDefinition } from "@biosync-io/types"
import type { AnyProvider } from "./provider.js"

type ProviderFactory = () => AnyProvider

interface RegisteredProvider {
  definition: ProviderDefinition
  factory: ProviderFactory
}

/**
 * Central registry for all provider plugins.
 *
 * Providers self-register by calling `providerRegistry.register()`.
 * The API and worker services resolve providers through this registry.
 *
 * @example
 * ```ts
 * // In a provider package's index.ts:
 * providerRegistry.register(fitbitDefinition, () => new FitbitProvider({
 *   clientId: process.env.FITBIT_CLIENT_ID!,
 *   clientSecret: process.env.FITBIT_CLIENT_SECRET!,
 *   redirectUri: `${process.env.OAUTH_REDIRECT_BASE_URL}/v1/oauth/callback/fitbit`,
 * }))
 * ```
 */
class ProviderRegistry {
  private readonly providers = new Map<string, RegisteredProvider>()

  register(definition: ProviderDefinition, factory: ProviderFactory): void {
    if (this.providers.has(definition.id)) {
      throw new Error(`Provider "${definition.id}" is already registered.`)
    }
    this.providers.set(definition.id, { definition, factory })
  }

  resolve(id: string): AnyProvider {
    const entry = this.providers.get(id)
    if (!entry) {
      throw new Error(
        `Provider "${id}" is not registered. Available: [${[...this.providers.keys()].join(", ")}]`,
      )
    }
    return entry.factory()
  }

  getDefinition(id: string): ProviderDefinition | undefined {
    return this.providers.get(id)?.definition
  }

  listDefinitions(): ProviderDefinition[] {
    return [...this.providers.values()].map((p) => p.definition)
  }

  isRegistered(id: string): boolean {
    return this.providers.has(id)
  }

  /** Remove all registered providers (primarily for testing). */
  clear(): void {
    this.providers.clear()
  }
}

/** Singleton registry instance shared across the application. */
export const providerRegistry = new ProviderRegistry()
