import type {
  OAuthTokens,
  OAuth1Tokens,
  ProviderDefinition,
  SyncOptions,
  SyncDataPoint,
} from "@biosync-io/types"

// ── OAuth 2.0 Provider ────────────────────────────────────────

export interface OAuth2Config {
  /** Authorization endpoint URL */
  authorizationUrl: string
  /** Token exchange endpoint URL */
  tokenUrl: string
  /** Token refresh endpoint URL (defaults to tokenUrl) */
  refreshUrl?: string
  /** Required OAuth scopes */
  scopes: string[]
}

export abstract class OAuth2Provider {
  abstract readonly definition: ProviderDefinition

  constructor(protected readonly config: {
    clientId: string
    clientSecret: string
    redirectUri: string
  }) {}

  /**
   * Build the authorization URL to redirect the user to.
   * @param state - CSRF protection state value (store in session)
   */
  abstract getAuthorizationUrl(state: string): URL

  /**
   * Exchange an authorization code for tokens.
   */
  abstract exchangeCode(code: string): Promise<OAuthTokens>

  /**
   * Refresh an expired access token.
   */
  abstract refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens>

  /**
   * Fetch and yield normalized health data points.
   * Using AsyncGenerator allows streaming large datasets without buffering.
   */
  abstract syncData(
    tokens: OAuthTokens,
    options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined>

  /**
   * Revoke a token (sign the user out of the provider).
   * Optional — not all providers support token revocation.
   */
  revokeTokens?(tokens: OAuthTokens): Promise<void>

  /**
   * Verify an inbound provider webhook signature.
   * Implement if the provider pushes data via webhooks.
   */
  verifyWebhookSignature?(payload: Buffer, signature: string, secret: string): boolean

  /**
   * Process a verified incoming webhook payload into data points.
   */
  processWebhook?(payload: unknown): Promise<SyncDataPoint[]>
}

// ── OAuth 1.0a Provider ───────────────────────────────────────

export abstract class OAuth1Provider {
  abstract readonly definition: ProviderDefinition

  constructor(protected readonly config: {
    consumerKey: string
    consumerSecret: string
    redirectUri: string
  }) {}

  abstract getRequestToken(): Promise<{ requestToken: string; requestTokenSecret: string }>
  abstract getAuthorizationUrl(requestToken: string): URL
  abstract exchangeVerifier(
    requestToken: string,
    requestTokenSecret: string,
    verifier: string,
  ): Promise<OAuth1Tokens>

  abstract syncData(
    tokens: OAuth1Tokens,
    options?: SyncOptions,
  ): AsyncGenerator<SyncDataPoint, void, undefined>
}

// ── Union type ────────────────────────────────────────────────

export type AnyProvider = OAuth2Provider | OAuth1Provider
