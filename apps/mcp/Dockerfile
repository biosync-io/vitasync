# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /repo

# Copy manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY apps/mcp/package.json ./apps/mcp/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY apps/mcp ./apps/mcp

# Build dependencies then the mcp server
RUN pnpm --filter @biosync-io/types build
RUN pnpm --filter @biosync-io/mcp build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -S vitasync && adduser -S vitasync -G vitasync

WORKDIR /app

# Copy only production artifacts
COPY --from=builder /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/pnpm-lock.yaml* ./

COPY --from=builder /repo/apps/mcp/package.json ./apps/mcp/
COPY --from=builder /repo/packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /repo/apps/mcp/dist ./apps/mcp/dist
COPY --from=builder /repo/packages/types/dist ./packages/types/dist

USER vitasync

ENV NODE_ENV=production

CMD ["node", "apps/mcp/dist/index.js"]
