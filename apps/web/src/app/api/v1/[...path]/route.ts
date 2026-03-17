/**
 * Runtime reverse-proxy for all /api/v1/* requests.
 *
 * The browser always calls relative URLs (/api/v1/...) so this works
 * regardless of deployment URL. The Next.js server proxies requests to
 * INTERNAL_API_URL (set via ConfigMap / docker-compose env) at runtime —
 * no build-time knowledge of the API hostname is needed.
 */

import { type NextRequest, NextResponse } from "next/server"

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function proxy(req: NextRequest, params: Promise<{ path: string[] }>) {
  const { path } = await params
  const upstream = `${INTERNAL_API_URL}/v1/${path.join("/")}${req.nextUrl.search}`

  const headers = new Headers(req.headers)
  // Strip Next.js internal / hop-by-hop headers before forwarding.
  headers.delete("host")
  headers.delete("connection")
  headers.delete("transfer-encoding")

  // Determine whether there is a real body to forward.
  // A POST/PATCH with content-length: 0 has no body — forwarding it as a
  // stream causes Fastify's JSON body parser to receive an empty string and
  // return 400. We strip content-type/content-length in this case so the
  // upstream doesn't attempt JSON parsing on an empty body.
  const hasBody =
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.headers.get("content-length") !== "0" &&
    req.body !== null

  const body = hasBody ? req.body : undefined

  if (!hasBody) {
    headers.delete("content-type")
    headers.delete("content-length")
  }

  let res: Response
  try {
    res = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      // @ts-expect-error — Node 18+ fetch supports duplex
      duplex: body ? "half" : undefined,
    })
  } catch (err) {
    console.error("[api-proxy] upstream error:", err)
    return NextResponse.json({ message: "API unreachable" }, { status: 502 })
  }

  const responseHeaders = new Headers(res.headers)
  responseHeaders.delete("transfer-encoding")

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  })
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx.params)
export const POST = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx.params)
export const PUT = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx.params)
export const PATCH = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx.params)
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx.params)
