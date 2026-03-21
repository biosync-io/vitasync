# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |
| < latest | ❌       |

We only provide security patches for the latest release. We recommend always running the latest version.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, please report vulnerabilities by emailing **security@vitasync.dev** (or your organization's security contact).

Include the following details:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 5 business days
- **Fix & disclosure:** coordinated with reporter, typically within 30 days

## Security Best Practices

When self-hosting VitaSync:

1. **Rotate secrets regularly** — `JWT_SECRET`, `ENCRYPTION_KEY`, and API keys
2. **Use TLS** — always run behind a reverse proxy with HTTPS
3. **Restrict database access** — PostgreSQL and Redis should not be publicly accessible
4. **Keep dependencies updated** — run `pnpm outdated` periodically
5. **Enable rate limiting** — configured by default, adjust `RATE_LIMIT_MAX` as needed
6. **Use Sealed Secrets** — in Kubernetes, use External Secrets Operator or Sealed Secrets for managing `ENCRYPTION_KEY` and `JWT_SECRET`

## Architecture Security

- **OAuth tokens:** encrypted at rest with AES-256-GCM
- **API keys:** stored as SHA-256 hashes only (never plaintext)
- **Auth validation:** constant-time comparison to prevent timing attacks
- **CORS:** configurable per deployment
- **Helmet:** security headers applied to all responses
- **Rate limiting:** per-workspace, configurable window and max requests
