# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# Build date: 2026-03-17
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
COPY packages/analytics/package.json ./packages/analytics/
COPY packages/notifications/core/package.json ./packages/notifications/core/
COPY packages/notifications/discord/package.json ./packages/notifications/discord/
COPY packages/notifications/slack/package.json ./packages/notifications/slack/
COPY packages/notifications/teams/package.json ./packages/notifications/teams/
COPY packages/notifications/email/package.json ./packages/notifications/email/
COPY packages/notifications/push/package.json ./packages/notifications/push/
COPY packages/notifications/ntfy/package.json ./packages/notifications/ntfy/
COPY packages/notifications/webhook/package.json ./packages/notifications/webhook/

RUN pnpm install --frozen-lockfile

COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/providers/core ./packages/providers/core
COPY packages/providers/fitbit ./packages/providers/fitbit
COPY packages/providers/garmin ./packages/providers/garmin
COPY packages/providers/strava ./packages/providers/strava
COPY packages/providers/whoop ./packages/providers/whoop
COPY packages/analytics ./packages/analytics
COPY packages/notifications/core ./packages/notifications/core
COPY packages/notifications/discord ./packages/notifications/discord
COPY packages/notifications/slack ./packages/notifications/slack
COPY packages/notifications/teams ./packages/notifications/teams
COPY packages/notifications/email ./packages/notifications/email
COPY packages/notifications/push ./packages/notifications/push
COPY packages/notifications/ntfy ./packages/notifications/ntfy
COPY packages/notifications/webhook ./packages/notifications/webhook
COPY apps/worker ./apps/worker

RUN pnpm --filter @biosync-io/types build
RUN pnpm --filter @biosync-io/db build
RUN pnpm --filter @biosync-io/provider-core build
RUN pnpm --filter @biosync-io/provider-fitbit build
RUN pnpm --filter @biosync-io/provider-garmin build
RUN pnpm --filter @biosync-io/provider-strava build
RUN pnpm --filter @biosync-io/provider-whoop build
RUN pnpm --filter @biosync-io/analytics build
RUN pnpm --filter @biosync-io/notification-core build
RUN pnpm --filter @biosync-io/notification-discord build
RUN pnpm --filter @biosync-io/notification-slack build
RUN pnpm --filter @biosync-io/notification-teams build
RUN pnpm --filter @biosync-io/notification-email build
RUN pnpm --filter @biosync-io/notification-push build
RUN pnpm --filter @biosync-io/notification-ntfy build
RUN pnpm --filter @biosync-io/notification-webhook build
RUN pnpm --filter @biosync-io/worker build

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
COPY --from=builder /repo/packages/analytics/package.json ./packages/analytics/
COPY --from=builder /repo/packages/notifications/core/package.json ./packages/notifications/core/
COPY --from=builder /repo/packages/notifications/discord/package.json ./packages/notifications/discord/
COPY --from=builder /repo/packages/notifications/slack/package.json ./packages/notifications/slack/
COPY --from=builder /repo/packages/notifications/teams/package.json ./packages/notifications/teams/
COPY --from=builder /repo/packages/notifications/email/package.json ./packages/notifications/email/
COPY --from=builder /repo/packages/notifications/push/package.json ./packages/notifications/push/
COPY --from=builder /repo/packages/notifications/ntfy/package.json ./packages/notifications/ntfy/
COPY --from=builder /repo/packages/notifications/webhook/package.json ./packages/notifications/webhook/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /repo/apps/worker/dist ./apps/worker/dist
COPY --from=builder /repo/packages/types/dist ./packages/types/dist
COPY --from=builder /repo/packages/db/dist ./packages/db/dist
COPY --from=builder /repo/packages/providers/core/dist ./packages/providers/core/dist
COPY --from=builder /repo/packages/providers/fitbit/dist ./packages/providers/fitbit/dist
COPY --from=builder /repo/packages/providers/garmin/dist ./packages/providers/garmin/dist
COPY --from=builder /repo/packages/providers/strava/dist ./packages/providers/strava/dist
COPY --from=builder /repo/packages/providers/whoop/dist ./packages/providers/whoop/dist
COPY --from=builder /repo/packages/analytics/dist ./packages/analytics/dist
COPY --from=builder /repo/packages/notifications/core/dist ./packages/notifications/core/dist
COPY --from=builder /repo/packages/notifications/discord/dist ./packages/notifications/discord/dist
COPY --from=builder /repo/packages/notifications/slack/dist ./packages/notifications/slack/dist
COPY --from=builder /repo/packages/notifications/teams/dist ./packages/notifications/teams/dist
COPY --from=builder /repo/packages/notifications/email/dist ./packages/notifications/email/dist
COPY --from=builder /repo/packages/notifications/push/dist ./packages/notifications/push/dist
COPY --from=builder /repo/packages/notifications/ntfy/dist ./packages/notifications/ntfy/dist
COPY --from=builder /repo/packages/notifications/webhook/dist ./packages/notifications/webhook/dist

USER vitasync

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/index.js"]
