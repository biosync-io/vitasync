"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "../../lib/auth-context"
import { ssoApi, mfaApi } from "../../lib/api"

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

  // Loading state while checking auth
  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-white/20 bg-white/70 p-8 shadow-lg shadow-indigo-500/10 backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/70 dark:shadow-indigo-500/25">
          {/* Logo & heading */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/25">
              <svg className="h-9 w-9" viewBox="0 0 32 32" fill="none">
                <path d="M6 18h4l3-8 4 16 3-12 2 4h4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {mode === "signup" ? "Create your account" : "Sign in to VitaSync"}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your health data platform
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Email verified banner */}
          {verified === "true" && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
              Email verified successfully! You can now sign in.
            </div>
          )}
          {verified === "false" && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              Email verification failed. The link may have expired. Please request a new one.
            </div>
          )}

          {/* Signup success — verify email prompt */}
          {signupSuccess && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
              <p className="font-medium">Account created successfully!</p>
              <p className="mt-1">Please check your email for a verification link.</p>
              {verificationToken && (
                <a
                  href={`/api/v1/auth/verify-email?token=${verificationToken}`}
                  className="mt-2 inline-block text-xs font-medium text-green-600 underline dark:text-green-300"
                >
                  Dev mode: Click here to verify
                </a>
              )}
            </div>
          )}

          {!mfaRequired ? (
            <>
              {/* Login / Signup form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div>
                    <label
                      htmlFor="displayName"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Full Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400"
                      placeholder="Jane Smith"
                    />
                  </div>
                )}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {mode === "signup" ? "Creating account…" : "Signing in…"}
                    </span>
                  ) : (
                    mode === "signup" ? "Create Account" : "Sign In"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  or
                </span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              </div>

              {/* SSO buttons */}
              <div className="space-y-2">
                {ssoProviders.map((provider) => (
                  <a
                    key={provider.id}
                    href={`/api/v1/sso/${provider.slug}/login`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
                  >
                    Sign in with {provider.name}
                  </a>
                ))}

                {/* Passkey */}
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                  Sign in with Passkey
                </button>
              </div>

              {/* Footer — toggle between login and signup */}
              <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {mode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setError(null) }}
                      className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("signup"); setError(null) }}
                      className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Sign up
                    </button>
                  </>
                )}
              </p>
            </>
          ) : (
            /* MFA form */
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                Enter the 6-digit code from your authenticator app.
              </p>
              <div>
                <label
                  htmlFor="totp"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Verification Code
                </label>
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-2xl font-mono tracking-[0.3em] text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-400"
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || totpCode.length !== 6}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Verifying…
                  </span>
                ) : (
                  "Verify"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaRequired(false)
                  setMfaToken("")
                  setTotpCode("")
                  setError(null)
                }}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
