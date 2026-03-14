# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/providers/core/package.json ./packages/providers/core/
COPY packages/providers/fitbit/package.json ./packages/providers/fitbit/
COPY packages/providers/garmin/package.json ./packages/providers/garmin/
COPY packages/providers/strava/package.json ./packages/providers/strava/
COPY packages/providers/whoop/package.json ./packages/providers/whoop/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/providers/core ./packages/providers/core
COPY packages/providers/fitbit ./packages/providers/fitbit
COPY packages/providers/garmin ./packages/providers/garmin
COPY packages/providers/strava ./packages/providers/strava
COPY packages/providers/whoop ./packages/providers/whoop
COPY apps/api ./apps/api

# Build all workspace dependencies then the api
RUN pnpm --filter @vitasync/types build
RUN pnpm --filter @vitasync/db build
RUN pnpm --filter @vitasync/provider-core build
RUN pnpm --filter @vitasync/provider-fitbit build
RUN pnpm --filter @vitasync/provider-garmin build
RUN pnpm --filter @vitasync/provider-strava build
RUN pnpm --filter @vitasync/provider-whoop build
RUN pnpm --filter @vitasync/api build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

# Non-root user for security
RUN addgroup -S vitasync && adduser -S vitasync -G vitasync

WORKDIR /app

# Copy only production artifacts
COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/pnpm-lock.yaml* ./

COPY --from=builder /repo/apps/api/package.json ./apps/api/
COPY --from=builder /repo/packages/types/package.json ./packages/types/
COPY --from=builder /repo/packages/db/package.json ./packages/db/
COPY --from=builder /repo/packages/providers/core/package.json ./packages/providers/core/
COPY --from=builder /repo/packages/providers/fitbit/package.json ./packages/providers/fitbit/
COPY --from=builder /repo/packages/providers/garmin/package.json ./packages/providers/garmin/
COPY --from=builder /repo/packages/providers/strava/package.json ./packages/providers/strava/
COPY --from=builder /repo/packages/providers/whoop/package.json ./packages/providers/whoop/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/packages/types/dist ./packages/types/dist
COPY --from=builder /repo/packages/db/dist ./packages/db/dist
COPY --from=builder /repo/packages/providers/core/dist ./packages/providers/core/dist
COPY --from=builder /repo/packages/providers/fitbit/dist ./packages/providers/fitbit/dist
COPY --from=builder /repo/packages/providers/garmin/dist ./packages/providers/garmin/dist
COPY --from=builder /repo/packages/providers/strava/dist ./packages/providers/strava/dist
COPY --from=builder /repo/packages/providers/whoop/dist ./packages/providers/whoop/dist

USER vitasync

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
