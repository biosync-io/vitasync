---
description: "FULL REFACTORING — Execute all 9 phases sequentially, no stopping, no waiting for approval"
---

# Full Refactoring — Autonomous Execution

## ⛔ READ THIS COMPLETELY BEFORE STARTING

You are executing a FULL codebase refactoring across 9 phases. The user is unavailable.
**Do NOT stop between phases. Do NOT ask for approval. Execute all 9 phases sequentially.**

**Branch:** `refactor/codebase-hardening` (create it from `main` if it doesn't exist)

## Rules for Autonomous Execution

```
1. Execute phases 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 IN ORDER
2. Do NOT skip a phase. Each phase depends on the previous one.
3. Do NOT ask for approval between phases. Just keep going.
4. After EACH phase, run the verification commands in that phase's acceptance
   criteria. If something fails, FIX IT before moving to the next phase.
5. If you hit an error you truly cannot resolve, document it in a
   BLOCKING_ISSUES.md file and continue with the next phase that isn't blocked.
6. Follow .github/copilot-instructions.md for EVERY phase.
7. Follow ENGINEERING_GUIDELINES.md for architecture decisions.
8. ⛔ NEVER gut pages — preserve ALL existing sections, charts, tables,
   and interactions. If a page shrinks by more than 10%, justify every removal.
```

## 📍 PROGRESS TRACKING — MANDATORY

**You MUST update the progress file after completing EACH phase and after EACH major task
within a phase. This is how the user knows where you stopped if the session ends.**

### At the START of the session

Create (or update if it exists) the file `REFACTORING_PROGRESS.md` in the repo root:

```markdown
# Refactoring Progress Tracker

> Auto-updated by the agent after each phase/task.
> If the session ends unexpectedly, this file shows exactly where to resume.

## Current Status
- **Active Phase:** 0
- **Active Task:** (starting)
- **Last Completed Phase:** None
- **Last Git Commit:** (none yet)
- **Timestamp:** (now)

## Phase Checklist

### Phase 0: Foundation & Error Standards
- [ ] Unified AppError class in packages/types
- [ ] Standardized error codes enum
- [ ] Config validation with Zod in all apps
- [ ] Shared logger factory
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 1: Service Layer Cleanup
- [ ] Service interface extraction
- [ ] Shared service base patterns
- [ ] DRY up duplicated logic across 41 services
- [ ] Consistent dependency injection
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 2: API Hardening
- [ ] Zod validation on every route
- [ ] Consistent response envelope
- [ ] Standardized error responses
- [ ] OpenAPI/Swagger generation
- [ ] Rate limiting review
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 3: CQRS Expansion
- [ ] Expand CQRS to provider sync domain
- [ ] Expand CQRS to user/auth domain
- [ ] Event store consistency checks
- [ ] Projection rebuild tooling
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 4: Worker & Queue Resilience
- [ ] Standardize processor patterns
- [ ] Improve saga coverage (export, onboarding)
- [ ] Dead letter queue handling
- [ ] Job retry policies review
- [ ] Circuit breaker tuning
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 5: Database Optimization
- [ ] Index audit and additions
- [ ] Query optimization (N+1, missing joins)
- [ ] Projection table cleanup
- [ ] Migration consolidation review
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 6: Frontend Consolidation
- [ ] Shared UI component library audit
- [ ] Consistent data fetching patterns
- [ ] Loading/error state standardization
- [ ] Dashboard section deduplication
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 7: Testing & Coverage
- [ ] Worker processor tests
- [ ] Integration test suite
- [ ] Package unit test gaps
- [ ] E2E critical path tests
- [ ] ✅ Verification passed
**Status:** NOT STARTED

### Phase 8: Observability & Documentation
- [ ] Structured logging audit
- [ ] Health check standardization
- [ ] API documentation generation
- [ ] Runbooks for operations
- [ ] ✅ Verification passed
**Status:** NOT STARTED
```

### Update rules

```
AFTER completing each task within a phase:
  1. Check the box: - [ ] → - [x]
  2. Update "Active Task" to the next task
  3. git add REFACTORING_PROGRESS.md && git commit -m "progress: completed {task}"

AFTER completing an entire phase:
  1. Check the "✅ Verification passed" box
  2. Update "Status" for that phase: NOT STARTED → ✅ COMPLETE
  3. Update "Last Completed Phase"
  4. Update "Active Phase" to the next phase
  5. git add -A && git commit -m "refactor: complete phase {N} — {phase name}"

AFTER completing a verification that FAILS:
  1. Update "Active Task" to: "FIXING: {what failed}"
  2. Fix the issue
  3. Re-run verification
  4. Then proceed normally
```

## Phase Execution Sequence

For each phase, read the corresponding prompt file, execute it fully, verify it, then move on:

### Phase 0: Foundation & Error Standards
Read and execute: `.github/prompts/phase-0-foundation.prompt.md`
- Verify: `pnpm typecheck && pnpm test --filter=@biosync-io/types`
- ✅ Move to Phase 1

### Phase 1: Service Layer Cleanup
Read and execute: `.github/prompts/phase-1-services.prompt.md`
- Verify: `pnpm typecheck --filter=@biosync-io/api && pnpm test --filter=@biosync-io/api`
- ✅ Move to Phase 2

### Phase 2: API Hardening
Read and execute: `.github/prompts/phase-2-api-hardening.prompt.md`
- Verify: `pnpm typecheck && pnpm test --filter=@biosync-io/api && pnpm exec biome ci .`
- ✅ Move to Phase 3

### Phase 3: CQRS Expansion
Read and execute: `.github/prompts/phase-3-cqrs-expansion.prompt.md`
- Verify: `pnpm typecheck && pnpm test --filter=@biosync-io/api --filter=@biosync-io/cqrs`
- ✅ Move to Phase 4

### Phase 4: Worker & Queue Resilience
Read and execute: `.github/prompts/phase-4-worker-resilience.prompt.md`
- Verify: `pnpm typecheck --filter=@biosync-io/worker && pnpm test`
- ✅ Move to Phase 5

### Phase 5: Database Optimization
Read and execute: `.github/prompts/phase-5-database.prompt.md`
- Verify: `pnpm typecheck --filter=@biosync-io/db && pnpm db:generate`
- ✅ Move to Phase 6

### Phase 6: Frontend Consolidation
Read and execute: `.github/prompts/phase-6-frontend.prompt.md`
- Verify: `pnpm typecheck --filter=@biosync-io/web && pnpm build --filter=@biosync-io/web`
- ✅ Move to Phase 7

### Phase 7: Testing & Coverage
Read and execute: `.github/prompts/phase-7-testing.prompt.md`
- Verify: `pnpm test -- --coverage`
- ✅ Move to Phase 8

### Phase 8: Observability & Documentation
Read and execute: `.github/prompts/phase-8-observability.prompt.md`
- Verify: `pnpm build && pnpm typecheck && pnpm exec biome ci .`
- Final: `docker compose build && docker compose up -d` — all services healthy

## After ALL Phases — Final Report

Write `REFACTORING_REPORT.md` in the repo root:

```markdown
# Refactoring Report

## Phase Results
| Phase | Status | Files Created | Files Modified | Tests |
|-------|--------|---------------|----------------|-------|
| 0 Foundation | ✅/❌/⚠️ | count | count | pass/fail |
| ... | ... | ... | ... | ... |

## Verification Results
[Paste final pnpm build, typecheck, test, biome output]

## Not Completed (if any)
- ❌ [item] — [reason]

## Known Issues
- ⚠️ [issue]
```

## Remember

- Read `.github/copilot-instructions.md` — it governs everything you do
- Read `ENGINEERING_GUIDELINES.md` for architecture decisions
- NO patchwork. NO shortcuts. NO fake "done" claims.
- Every phase has verification commands — RUN THEM and fix failures before moving on.
