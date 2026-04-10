import { NextResponse, type NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  const publicPaths = [
    "/login",
    "/admin/login",
    "/api/",
    "/_next/",
    "/offline",
    "/icons/",
    "/manifest.json",
    "/icon.svg",
    "/sw.js",
  ]
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check for auth cookies
  const accessToken = request.cookies.get("vs_access")?.value
  const refreshToken = request.cookies.get("vs_refresh")?.value

  if (!accessToken && !refreshToken) {
    // No auth — redirect to appropriate login
    if (pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/admin/login", request.url))
    }
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Decode JWT payload (base64, no verification — verification happens server-side)
  if (accessToken) {
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1]!))
      const role = payload.role

      // Admin routes require admin role
      if (pathname.startsWith("/admin") && role !== "admin") {
        return NextResponse.redirect(
          new URL("/admin/login?error=not_admin", request.url),
        )
      }

      // Dashboard routes reject admin role — redirect to admin portal
      if (pathname.startsWith("/dashboard") && role === "admin") {
        return NextResponse.redirect(new URL("/admin", request.url))
      }
    } catch {
      // Invalid JWT — let server-side handle it
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
