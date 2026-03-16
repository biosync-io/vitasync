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
  },
  async rewrites() {
    // In production, API calls go through this rewrite so the web container
    // can call the API container on the internal Docker network.
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://api:3001"}/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
