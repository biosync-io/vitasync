import { NextResponse } from "next/server"

/**
 * GET /api/config
 *
 * Returns non-sensitive runtime configuration to the browser.
 * Server-side env vars are readable here even in a pre-built image,
 * solving the NEXT_PUBLIC_* build-time limitation in Kubernetes.
 */
export async function GET() {
  return NextResponse.json({
    // NEXT_PUBLIC_DEFAULT_API_KEY is baked in at build time (dev/CI).
    // DEFAULT_API_KEY is the runtime equivalent injected by Helm in K8s.
    // The server can read both; the browser bundle can only read the first.
    defaultApiKey:
      process.env.DEFAULT_API_KEY ?? process.env.NEXT_PUBLIC_DEFAULT_API_KEY ?? "",
  })
}
