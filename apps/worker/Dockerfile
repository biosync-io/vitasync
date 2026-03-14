# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/providers/core/package.json ./packages/providers/core/
COPY packages/providers/fitbit/package.json ./packages/providers/fitbit/
COPY packages/providers/garmin/package.json ./packages/providers/garmin/
COPY packages/providers/strava/package.json ./packages/providers/strava/
COPY packages/providers/whoop/package.json ./packages/providers/whoop/

RUN pnpm install --frozen-lockfile

COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/providers/core ./packages/providers/core
COPY packages/providers/fitbit ./packages/providers/fitbit
COPY packages/providers/garmin ./packages/providers/garmin
COPY packages/providers/strava ./packages/providers/strava
COPY packages/providers/whoop ./packages/providers/whoop
COPY apps/worker ./apps/worker

RUN pnpm --filter @vitasync/types build
RUN pnpm --filter @vitasync/db build
RUN pnpm --filter @vitasync/provider-core build
RUN pnpm --filter @vitasync/provider-fitbit build
RUN pnpm --filter @vitasync/provider-garmin build
RUN pnpm --filter @vitasync/provider-strava build
RUN pnpm --filter @vitasync/provider-whoop build
RUN pnpm --filter @vitasync/worker build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -S vitasync && adduser -S vitasync -G vitasync

WORKDIR /app

COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/pnpm-lock.yaml* ./

COPY --from=builder /repo/apps/worker/package.json ./apps/worker/
COPY --from=builder /repo/packages/types/package.json ./packages/types/
COPY --from=builder /repo/packages/db/package.json ./packages/db/
COPY --from=builder /repo/packages/providers/core/package.json ./packages/providers/core/
COPY --from=builder /repo/packages/providers/fitbit/package.json ./packages/providers/fitbit/
COPY --from=builder /repo/packages/providers/garmin/package.json ./packages/providers/garmin/
COPY --from=builder /repo/packages/providers/strava/package.json ./packages/providers/strava/
COPY --from=builder /repo/packages/providers/whoop/package.json ./packages/providers/whoop/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /repo/apps/worker/dist ./apps/worker/dist
COPY --from=builder /repo/packages/types/dist ./packages/types/dist
COPY --from=builder /repo/packages/db/dist ./packages/db/dist
COPY --from=builder /repo/packages/providers/core/dist ./packages/providers/core/dist
COPY --from=builder /repo/packages/providers/fitbit/dist ./packages/providers/fitbit/dist
COPY --from=builder /repo/packages/providers/garmin/dist ./packages/providers/garmin/dist
COPY --from=builder /repo/packages/providers/strava/dist ./packages/providers/strava/dist
COPY --from=builder /repo/packages/providers/whoop/dist ./packages/providers/whoop/dist

USER vitasync

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
