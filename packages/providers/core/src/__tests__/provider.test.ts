import type {
  OAuth1Tokens,
  OAuthTokens,
  ProviderDefinition,
  SyncDataPoint,
  SyncOptions,
} from "@biosync-io/types"
import { describe, expect, it } from "vitest"
import type { AnyProvider } from "../provider.js"
import { OAuth1Provider, OAuth2Provider } from "../provider.js"

// ── Fake Implementations ─────────────────────────────────────

const fakeOAuth2Definition: ProviderDefinition = {
  id: "fake-oauth2",
  name: "Fake OAuth2",
  description: "Fake OAuth2 provider for testing",
  capabilities: {
    supportedMetrics: [],
    supportsWebhooks: false,
    oauth2: true,
    oauth1: false,
  },
}

class FakeOAuth2Provider extends OAuth2Provider {
  readonly definition = fakeOAuth2Definition

  getAuthorizationUrl(state: string): URL {
    return new URL(`https://auth.fake.com/authorize?state=${state}`)
  }

  async exchangeCode(_code: string): Promise<OAuthTokens> {
    return { accessToken: "fake-access", refreshToken: "fake-refresh" }
  }

  async refreshTokens(_tokens: OAuthTokens): Promise<OAuthTokens> {
    return { accessToken: "refreshed-access" }
  }

  async *syncData(
    _tokens: OAuthTokens,
    _options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined> {
    yield {
      providerId: "fake-oauth2",
      metricType: "steps",
      recordedAt: new Date("2024-01-01"),
      value: 10000,
    }
  }
}

const fakeOAuth1Definition: ProviderDefinition = {
  id: "fake-oauth1",
  name: "Fake OAuth1",
  description: "Fake OAuth1 provider for testing",
  capabilities: {
    supportedMetrics: [],
    supportsWebhooks: false,
    oauth2: false,
    oauth1: true,
  },
}

class FakeOAuth1Provider extends OAuth1Provider {
  readonly definition = fakeOAuth1Definition

  async getRequestToken() {
    return { requestToken: "req-token", requestTokenSecret: "req-secret" }
  }

  getAuthorizationUrl(requestToken: string): URL {
    return new URL(`https://auth.fake.com/authorize?oauth_token=${requestToken}`)
  }

  async exchangeVerifier(
    _requestToken: string,
    _requestTokenSecret: string,
    _verifier: string,
  ): Promise<OAuth1Tokens> {
    return { token: "access-token", tokenSecret: "token-secret" }
  }

  async *syncData(
    _tokens: OAuth1Tokens,
    _options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined> {
    yield {
      providerId: "fake-oauth1",
      metricType: "heart_rate",
      recordedAt: new Date("2024-01-01"),
      value: 72,
    }
  }
}

// ── Tests ────────────────────────────────────────────────────

describe("OAuth2Provider", () => {
  it("can be instantiated with config", () => {
    const provider = new FakeOAuth2Provider({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    expect(provider.definition.id).toBe("fake-oauth2")
  })

  it("returns an authorization URL", () => {
    const provider = new FakeOAuth2Provider({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    const url = provider.getAuthorizationUrl("state-123")
    expect(url.searchParams.get("state")).toBe("state-123")
  })

  it("syncData yields data points via async generator", async () => {
    const provider = new FakeOAuth2Provider({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    const points: SyncDataPoint[] = []
    for await (const point of provider.syncData({ accessToken: "token" })) {
      points.push(point)
    }

    expect(points).toHaveLength(1)
    expect(points[0]?.metricType).toBe("steps")
    expect(points[0]?.value).toBe(10000)
  })
})

describe("OAuth1Provider", () => {
  it("can be instantiated with config", () => {
    const provider = new FakeOAuth1Provider({
      consumerKey: "key",
      consumerSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    expect(provider.definition.id).toBe("fake-oauth1")
  })

  it("syncData yields data points via async generator", async () => {
    const provider = new FakeOAuth1Provider({
      consumerKey: "key",
      consumerSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    const points: SyncDataPoint[] = []
    for await (const point of provider.syncData({ token: "t", tokenSecret: "ts" })) {
      points.push(point)
    }

    expect(points).toHaveLength(1)
    expect(points[0]?.metricType).toBe("heart_rate")
  })
})

describe("AnyProvider type", () => {
  it("accepts both OAuth2 and OAuth1 providers", () => {
    const oauth2: AnyProvider = new FakeOAuth2Provider({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    const oauth1: AnyProvider = new FakeOAuth1Provider({
      consumerKey: "key",
      consumerSecret: "secret",
      redirectUri: "https://app.example.com/callback",
    })

    expect(oauth2.definition.id).toBe("fake-oauth2")
    expect(oauth1.definition.id).toBe("fake-oauth1")
  })
})
