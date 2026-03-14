import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Ensure config.ts module-level validation passes in all test environments
    // (vitest fork workers don't inherit job-level env vars automatically)
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://vitasync:testpassword@localhost:5432/vitasync_test",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "test-jwt-secret-at-least-32-characters-long-xxxxxxxxx",
      ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
      OAUTH_REDIRECT_BASE_URL: "http://localhost:3001",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/__tests__/**"],
    },
  },
})
