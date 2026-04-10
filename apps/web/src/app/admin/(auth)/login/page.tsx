"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ShieldCheck, Mail, Lock, AlertTriangle } from "lucide-react"
import { setCookieAuthActive } from "../../../../lib/api"
import { Input } from "../../../../lib/components/ui/input"
import { Button } from "../../../../lib/components/ui/button"

const API = "/api"

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginInner />
    </Suspense>
  )
}

function AdminLoginInner() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  // Show error from query param (e.g. middleware redirect)
  useEffect(() => {
    if (errorParam === "not_admin") {
      setError("This portal is for administrators only")
    }
  }, [errorParam])

  // Trigger shake animation when error changes
  useEffect(() => {
    if (error) setShakeKey((k) => k + 1)
  }, [error])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        // Step 1: Login
        const loginRes = await fetch(`${API}/v1/auth/login`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })

        if (!loginRes.ok) {
          const body = await loginRes
            .json()
            .catch(() => ({ message: loginRes.statusText }))
          const msg = body?.message ?? `Login failed: ${loginRes.status}`
          // Map common error messages
          if (loginRes.status === 423 || msg.toLowerCase().includes("locked")) {
            throw new Error("This account has been locked. Contact a system administrator.")
          }
          throw new Error(msg)
        }

        const data: { mfaRequired?: boolean; mfaToken?: string } =
          await loginRes.json()

        if (data.mfaRequired) {
          // Admin login doesn't support MFA flow in this simplified page
          throw new Error("MFA is required but not supported in the admin login portal yet")
        }

        // Step 2: Verify admin role
        setCookieAuthActive(true)
        const meRes = await fetch(`${API}/v1/auth/me`, {
          credentials: "include",
        })

        if (!meRes.ok) {
          throw new Error("Failed to verify user identity")
        }

        const me: { role: string } = await meRes.json()

        if (me.role !== "admin") {
          // Logout since non-admin shouldn't have a session here
          await fetch(`${API}/v1/auth/logout`, {
            method: "POST",
            credentials: "include",
          }).catch(() => {})
          setCookieAuthActive(false)
          throw new Error("This portal is for administrators only")
        }

        // Step 3: Redirect to admin dashboard
        window.location.href = "/admin"
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed")
      } finally {
        setSubmitting(false)
      }
    },
    [email, password],
  )

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950 px-4">
      {/* ─── Animated Background ─── */}
      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(251,191,36,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.18) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Slow-moving spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 600px 600px at 30% 40%, rgba(251,191,36,0.06), transparent 70%)",
          animation: "spotlight 12s ease-in-out infinite",
          backgroundSize: "200% 200%",
        }}
      />
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-1/4 -top-1/4 h-[500px] w-[500px] animate-pulse rounded-full bg-amber-500/[0.04] blur-[120px]"
          style={{ animationDuration: "5s" }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] animate-pulse rounded-full bg-orange-500/[0.04] blur-[120px]"
          style={{ animationDuration: "7s" }}
        />
      </div>

      {/* ─── Card ─── */}
      <div
        key={shakeKey}
        className={`relative z-10 w-full max-w-md ${error ? "animate-shake" : ""}`}
        style={{
          animation: error && shakeKey > 0 ? undefined : "fadeInUp 0.5s ease-out",
        }}
      >
        {/* Amber border glow effect */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-transparent opacity-60" />

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] px-8 py-10 shadow-2xl shadow-amber-900/10 backdrop-blur-xl">
          {/* Shield icon with animated glow ring */}
          <div className="mb-8 flex flex-col items-center">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
                <ShieldCheck className="h-9 w-9 text-white" />
              </div>
              {/* Animated rings */}
              <div
                className="absolute -inset-2 animate-spin rounded-2xl border border-dashed border-amber-500/20"
                style={{ animationDuration: "12s" }}
              />
              <div
                className="absolute -inset-3.5 animate-spin rounded-2xl border border-dashed border-amber-500/10"
                style={{ animationDuration: "20s", animationDirection: "reverse" }}
              />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-gray-100">
              VitaSync Admin
            </h1>
            <p className="mt-1 text-sm font-medium uppercase tracking-widest text-amber-500/60">
              Command Center
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
              {error}
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="admin-email"
              label="Email"
              icon={Mail}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="border-white/[0.08] bg-white/[0.03] text-gray-100 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-amber-500/20"
            />
            <Input
              id="admin-password"
              label="Password"
              icon={Lock}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="border-white/[0.08] bg-white/[0.03] text-gray-100 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-amber-500/20"
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-500 hover:shadow-xl hover:shadow-amber-500/30 focus-visible:ring-amber-500/50"
            >
              {submitting ? "Authenticating…" : "Sign In"}
            </Button>
          </form>

          {/* Restricted access warning */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Restricted Access — All attempts are logged
          </div>
        </div>
      </div>
    </div>
  )
}
