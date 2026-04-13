---
name: audit-violations
description: >
  Run a comprehensive engineering guideline violations audit on VitaSync code.
  Use this skill when asked to audit, check, or validate code quality, or when
  checking for `any` types, console.log, missing validation, or other violations.
allowed-tools: shell
---

# Audit Violations Skill

Run the `audit.sh` script from this skill's directory to perform a full violations scan.

## Usage

When asked to audit code for violations, run the audit script:

```bash
bash .github/skills/audit-violations/audit.sh [path]
```

- If no path is given, it audits all app source files (`apps/`)
- If a path is given, it audits that specific file or directory

## What It Checks

The audit covers these categories:

1. **`any` type usage** — explicit `any` in TypeScript files
2. **console.log** — direct console usage in API/worker code
3. **Non-null assertions** — `!.` usage outside test files
4. **Missing Zod validation** — route handlers without schema parsing
5. **Raw SQL** — `db.execute(sql` patterns instead of Drizzle query builder
6. **Hardcoded secrets** — potential credential patterns
7. **TypeScript** — `pnpm typecheck` pass/fail
8. **Biome** — `pnpm exec biome ci .` pass/fail

## Interpreting Results

- **0 violations** = file is clean
- Each violation shows: file, line number, rule ID, matched code
- Test files (`*.test.ts`, `*.spec.ts`) are excluded from some checks
- Config files and migration files are excluded from all checks
