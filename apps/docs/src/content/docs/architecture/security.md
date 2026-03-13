---
title: Security
description: How VitaSync protects OAuth tokens, API keys, and user data.
---

import { Aside } from '@astrojs/starlight/components';

## OAuth Token Encryption

Provider OAuth tokens (access + refresh) are encrypted at rest using **AES-256-GCM** before being written to the database.

- The encryption key is 256-bit (64 hex chars) stored in the `ENCRYPTION_KEY` environment variable.
- Each token is encrypted with a unique random 96-bit IV.
- The IV and auth tag are stored alongside the ciphertext so decryption is self-contained.
- The raw key is **never** stored in the database — only the encrypted ciphertext.

```
Stored value = base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
```

## API Key Storage

API keys are stored as **SHA-256 hashes only**. The raw key is shown to the user exactly once at creation time and is never persisted in plain text.

When a request arrives, VitaSync hashes the `Bearer` token and compares it to the stored hash using a constant-time comparison to prevent timing attacks.

## Authentication Flow

```
Request: Authorization: Bearer vs_live_<key>
    │
    ▼
authPlugin.preHandler
    ├─ SHA-256 hash the raw key
    ├─ Lookup api_keys WHERE key_hash = $1 AND workspace_id = $2
    ├─ Constant-time comparison
    └─ Attach workspaceId to request context
```

All routes (except `GET /health`, `GET /docs`, and `/v1/oauth/*` callbacks) require a valid API key.

## Environment Variable Requirements

| Variable | Minimum strength |
|----------|-----------------|
| `JWT_SECRET` | 32+ characters |
| `ENCRYPTION_KEY` | 64 hex chars (256 bits) — `openssl rand -hex 32` |

<Aside type="caution">
Never commit `.env` to version control. Use a secrets manager (e.g. Kubernetes Secrets, AWS Secrets Manager, or HashiCorp Vault) in production.
</Aside>

## Transport Security

- Always run the API behind TLS in production (the Helm chart provisions a TLS ingress by default).
- Set `CORS_ORIGINS` to your exact frontend origin(s) — wildcards are not recommended for production.

## Rate Limiting

API endpoints are rate-limited per IP using `@fastify/rate-limit`:

| Variable | Default |
|----------|---------|
| `RATE_LIMIT_MAX` | 100 requests |
| `RATE_LIMIT_WINDOW_MS` | 60 000 ms (1 minute) |

Responses over the limit receive `429 Too Many Requests` with a `Retry-After` header.
