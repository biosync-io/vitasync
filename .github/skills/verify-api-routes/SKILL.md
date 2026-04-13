---
name: verify-api-routes
description: >
  Cross-reference API route definitions against service layer and frontend usage to find
  mismatches. Use this skill when debugging 404/400 errors, when adding new routes, or
  when auditing the API layer for broken endpoints.
allowed-tools: shell
---

# Verify API Routes Skill

Cross-references API route definitions against the service layer and frontend API proxy
to find mismatches and missing implementations.

## Usage

Run the verification script:

```bash
bash .github/skills/verify-api-routes/verify.sh
```

## How It Works

1. Extracts all route registrations from `apps/api/src/routes/v1/`
2. Checks that each route has corresponding service layer logic
3. Checks for Zod validation on each route
4. Reports: OK (complete), MISSING_VALIDATION, MISSING_SERVICE

## Key Context

- Routes are Fastify plugins in `apps/api/src/routes/v1/`
- Web app proxies `/api/v1/*` to `INTERNAL_API_URL` via route handler
- Zod validation required on all inputs (body, query, params)
- Service layer in `apps/api/src/services/`

## After Running

If issues are found:
1. Add missing Zod validation schemas
2. Create missing service layer functions
3. Verify the frontend proxy route handles the path correctly
