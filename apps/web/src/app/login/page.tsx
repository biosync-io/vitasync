"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "../../lib/auth-context"
import { ssoApi, mfaApi } from "../../lib/api"
import {
  Activity, Heart, Moon, Zap, Mail, Lock, User, Fingerprint,
  ArrowRight, AlertTriangle, CheckCircle2, ShieldCheck,
} from "lucide-react"
import { Input } from "../../lib/components/ui/input"
import { Button } from "../../lib/components/ui/button"

interface SsoProvider {
  id: string
  name: string
  slug: string
  protocol: string
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") ?? "/dashboard"
  const verified = searchParams.get("verified")
  const auth = useAuth()

  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaToken, setMfaToken] = useState("")
  const [totpCode, setTotpCode] = useState("")

  // SSO providers
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([])

  useEffect(() => {
    ssoApi.providers().then(setSsoProviders).catch(() => {})
  }, [])

  // Redirect if already authenticated
  useEffect(() => {
    if (auth.isAuthenticated && !auth.isLoading) {
      window.location.href = redirect
    }
  }, [auth.isAuthenticated, auth.isLoading, redirect])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        if (mode === "signup") {
          // Register — show verification message instead of auto-login
          const res = await fetch("/api/v1/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              externalId: email,
              email,
              password,
              ...(displayName ? { displayName } : {}),
            }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({ message: res.statusText }))
            throw new Error(body?.message ?? "Registration failed")
          }
          const data = await res.json()
          setSignupSuccess(true)
          setVerificationToken(data.verificationToken ?? null)
          setMode("login")
        } else {
          const result = await auth.login(email, password)
          if (result.mfaRequired && result.mfaToken) {
            setMfaRequired(true)
            setMfaToken(result.mfaToken)
          } else {
            window.location.href = redirect
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed")
      } finally {
        setSubmitting(false)
      }
    },
    [auth, email, password, displayName, redirect, mode],
  )

  const handleMfaSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setSubmitting(true)
      try {
        await mfaApi.validateTotp(mfaToken, totpCode)
        await auth.refresh()
        window.location.href = redirect
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid code")
      } finally {
        setSubmitting(false)
      }
    },
    [mfaToken, totpCode, auth, redirect],
  )

  const handleForgotPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotSubmitting(true)
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: forgotEmail }),
      })
      const data = await res.json()
      setForgotSuccess(true)
      if (data.resetToken) setResetToken(data.resetToken)
    } catch (err) {
      setForgotError("Failed to send reset link. Please try again.")
    } finally {
      setForgotSubmitting(false)
    }
  }, [forgotEmail])

  // Loading state while checking auth
  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600">
              <Activity className="h-7 w-7 text-white" />
            </div>
            <div className="absolute inset-0 h-12 w-12 animate-ping rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 opacity-20" />
          </div>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ─── Left Brand Panel ─── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950 px-16 py-16 lg:flex lg:w-[55%]">
        {/* Animated gradient mesh background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-1/4 -top-1/3 h-[600px] w-[600px] animate-pulse rounded-full bg-indigo-600/20 blur-[120px]" style={{ animationDuration: "6s" }} />
          <div className="absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] animate-pulse rounded-full bg-purple-600/15 blur-[100px]" style={{ animationDuration: "8s" }} />
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-indigo-500/10 blur-[80px]" style={{ animationDuration: "10s" }} />
        </div>

        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        {/* Top — Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              VitaSync
            </span>
          </div>
        </div>

        {/* Middle — Hero */}
        <div className="relative z-10 my-auto">
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
            Your health
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              intelligence platform
            </span>
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-indigo-200/60">
            Track, analyze, and optimize your health metrics with AI-powered
            insights.
          </p>

          {/* Floating glass stat cards */}
          <div className="mt-12 grid grid-cols-3 gap-4">
            {(
              [
                { icon: Heart, colorBg: "bg-emerald-500/10", colorText: "text-emerald-400", value: "94", label: "Health Score", delay: "0s" },
                { icon: Moon, colorBg: "bg-blue-500/10", colorText: "text-blue-400", value: "8.2h", label: "Sleep Quality", delay: "1s" },
                { icon: Zap, colorBg: "bg-amber-500/10", colorText: "text-amber-400", value: "96%", label: "Recovery", delay: "2s" },
              ] as const
            ).map(({ icon: Icon, colorBg, colorText, value, label, delay }) => (
              <div
                key={label}
                className="group rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-xl transition-all duration-500 hover:border-white/[0.15] hover:bg-white/[0.07]"
                style={{ animation: `float 6s ease-in-out infinite ${delay}` }}
              >
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${colorBg}`}>
                  <Icon className={`h-5 w-5 ${colorText}`} />
                </div>
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="mt-0.5 text-xs text-indigo-300/60">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — Trust badge */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-sm text-indigo-300/50">
            <div className="flex -space-x-2">
              {["A", "M", "S", "K"].map((letter) => (
                <div
                  key={letter}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-950 bg-gradient-to-br from-indigo-400 to-purple-500 text-[10px] font-bold text-white"
                >
                  {letter}
                </div>
              ))}
            </div>
            <span>
              Trusted by{" "}
              <span className="font-semibold text-indigo-300/70">10,000+</span>{" "}
              athletes worldwide
            </span>
          </div>
        </div>
      </div>

      {/* ─── Right Form Panel ─── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 dark:bg-gray-950 lg:px-16">
        <div
          className="w-full max-w-[420px]"
          style={{ animation: "fadeInUp 0.6s ease-out" }}
        >
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              VitaSync
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {mode === "signup"
              ? "Start your health intelligence journey"
              : "Sign in to your health dashboard"}
          </p>

          {/* Error */}
          {error && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-500/20">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              {error}
            </div>
          )}

          {/* Email verified banner */}
          {verified === "true" && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Email verified successfully! You can now sign in.
            </div>
          )}
          {verified === "false" && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Email verification failed. The link may have expired.
            </div>
          )}

          {/* Signup success — verify email prompt */}
          {signupSuccess && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Account created successfully!
              </p>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400/80">
                Please check your email for a verification link.
              </p>
              {verificationToken && (
                <a
                  href={`/api/v1/auth/verify-email?token=${verificationToken}`}
                  className="mt-2 inline-block text-xs font-medium text-emerald-600 underline dark:text-emerald-300"
                >
                  Dev mode: Click here to verify
                </a>
              )}
            </div>
          )}

          {!mfaRequired && !forgotMode ? (
            <>
              {/* Login / Signup form */}
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {mode === "signup" && (
                  <Input
                    id="displayName"
                    label="Full Name"
                    icon={User}
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Smith"
                  />
                )}
                <Input
                  id="email"
                  label="Email"
                  icon={Mail}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Input
                  id="password"
                  label="Password"
                  icon={Lock}
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                {mode === "login" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(true)
                        setForgotEmail(email)
                      }}
                      className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={submitting}
                  {...(!submitting && { icon: ArrowRight })}
                  className="w-full"
                >
                  {submitting
                    ? mode === "signup"
                      ? "Creating account…"
                      : "Signing in…"
                    : mode === "signup"
                      ? "Create Account"
                      : "Sign In"}
                </Button>
              </form>

              {/* Divider */}
              <div className="my-8 flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-gray-800" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-600">
                  or continue with
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-gray-800" />
              </div>

              {/* SSO + Passkey buttons */}
              <div className="space-y-3">
                {ssoProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      window.location.href = `/api/v1/sso/${provider.slug}/login`
                    }}
                  >
                    Sign in with {provider.name}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  icon={Fingerprint}
                  className="w-full"
                >
                  Sign in with Passkey
                </Button>
              </div>

              {/* Toggle Sign In / Sign Up */}
              <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {mode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login")
                        setError(null)
                      }}
                      className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup")
                        setError(null)
                      }}
                      className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Sign up
                    </button>
                  </>
                )}
              </p>
            </>
          ) : forgotMode ? (
            <>
              {!forgotSuccess ? (
                <form onSubmit={handleForgotPassword} className="mt-8 space-y-5">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                  {forgotError && (
                    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {forgotError}
                    </div>
                  )}
                  <Input
                    icon={Mail}
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={forgotSubmitting}
                    className="w-full"
                  >
                    {forgotSubmitting ? "Sending…" : "Send Reset Link"}
                  </Button>
                  <p className="text-center">
                    <button
                      type="button"
                      onClick={() => setForgotMode(false)}
                      className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      ← Back to sign in
                    </button>
                  </p>
                </form>
              ) : (
                <div className="mt-8 space-y-4 text-center">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">
                      Reset link sent!
                    </p>
                    <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400/80">
                      Check your email for a password reset link.
                    </p>
                  </div>
                  {resetToken && (
                    <a
                      href={`/login/reset-password?token=${resetToken}`}
                      className="inline-block text-xs font-medium text-emerald-600 underline dark:text-emerald-300"
                    >
                      Dev mode: Click here to reset password
                    </a>
                  )}
                  <p>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(false)
                        setForgotSuccess(false)
                      }}
                      className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      ← Back to sign in
                    </button>
                  </p>
                </div>
              )}
            </>
          ) : (
            /* MFA form */
            <form onSubmit={handleMfaSubmit} className="mt-8 space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10">
                  <ShieldCheck className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
              <Input
                id="totp"
                label="Verification Code"
                icon={ShieldCheck}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) =>
                  setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="text-center text-2xl font-mono tracking-[0.3em]"
                placeholder="000000"
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={submitting || totpCode.length !== 6}
                className="w-full"
              >
                {submitting ? "Verifying…" : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="w-full"
                onClick={() => {
                  setMfaRequired(false)
                  setMfaToken("")
                  setTotpCode("")
                  setError(null)
                }}
              >
                ← Back to login
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
