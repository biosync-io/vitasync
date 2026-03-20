import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Required for pnpm workspaces: tells Next.js to trace files from the
  // monorepo root so that the standalone output mirrors the workspace
  // directory structure (server.js ends up at apps/web/server.js).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    typedRoutes: true,
    // Next.js 16: enable React compiler for automatic memoization
    reactCompiler: true,
  },
}

export default nextConfig
