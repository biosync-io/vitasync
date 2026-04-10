import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      // The @biosync-io/db package doesn't export ./lib/field-encryption yet;
      // map the deep import to the source file so Vite can resolve it in tests.
      "@biosync-io/db/lib/field-encryption": path.resolve(
        __dirname,
        "../../packages/db/src/lib/field-encryption.ts",
      ),
    },
  },
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
