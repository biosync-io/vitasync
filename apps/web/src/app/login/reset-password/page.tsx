"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
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

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? "Reset failed")
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed")
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
            <p className="text-sm text-red-500">Invalid reset link. No token provided.</p>
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reset your password</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Enter your new password below</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center">
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
              Password reset successfully!
            </div>
            <a
              href="/login"
              className="inline-block rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/25"
            >
              Sign in
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-600 hover:to-purple-700 disabled:opacity-60"
            >
              {submitting ? "Resetting…" : "Reset Password"}
            </button>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              <a href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">Back to sign in</a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
