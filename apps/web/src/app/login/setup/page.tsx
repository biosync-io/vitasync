"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Lock, CheckCircle2 } from "lucide-react"
import { Input } from "../../../lib/components/ui/input"
import { Button } from "../../../lib/components/ui/button"

export default function SetupPasswordPage() {
  return (
    <Suspense>
      <SetupPasswordInner />
    </Suspense>
  )
}

function SetupPasswordInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/v1/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? "Setup failed")
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/70 p-8 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/70">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/25">
              <svg className="h-9 w-9" viewBox="0 0 32 32" fill="none">
                <path d="M6 18h4l3-8 4 16 3-12 2 4h4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-sm text-red-500">Invalid setup link. No token provided.</p>
            <a href="/login" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/70 p-8 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/70">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/25">
            <svg className="h-9 w-9" viewBox="0 0 32 32" fill="none">
              <path d="M6 18h4l3-8 4 16 3-12 2 4h4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Set Up Your Password</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Welcome to VitaSync! Set a password to access your health dashboard.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center">
            <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Password set successfully! You can now sign in.
            </div>
            <a
              href="/login"
              className="inline-block rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-purple-700"
            >
              Sign In
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="New Password"
              icon={Lock}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="Confirm Password"
              icon={Lock}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting}
              className="w-full"
            >
              Set Password & Continue
            </Button>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
              <a href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                Sign in
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
