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
    defaultApiKey:
      process.env.DEFAULT_API_KEY ?? process.env.NEXT_PUBLIC_DEFAULT_API_KEY ?? "",
    appVersion:
      process.env.APP_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "0.2.0",
  })
}
