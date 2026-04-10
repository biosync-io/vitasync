"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  Shield,
  Key,
  Smartphone,
  Monitor,
  Copy,
  Download,
  Trash2,
  Plus,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  Fingerprint,
} from "lucide-react"
import { authApi, mfaApi, passkeysApi, type Passkey } from "../../../lib/api"
import { useAuth } from "../../../lib/auth-context"
import { PageHeader, Card, CardHeader, CardContent, Button, Badge, Input, EmptyState, CardSkeleton } from "../../../lib/components/ui"

// ── Password Change ──────────────────────────────────────────────────────

function PasswordChangeSection() {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirm: "" })
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setSuccess(true)
      setForm({ oldPassword: "", newPassword: "", confirm: "" })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  const canSubmit = form.oldPassword && form.newPassword && form.newPassword === form.confirm && form.newPassword.length >= 8

  return (
    <Card>
      <CardHeader
        title="Change Password"
        subtitle="Update your account password"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50"><Key className="h-5 w-5 text-indigo-500" /></div>}
      />
      <CardContent>
        <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Current Password</label>
          <div className="relative">
            <input
              type={showOld ? "text" : "password"}
              value={form.oldPassword}
              onChange={(e) => setForm((f) => ({ ...f, oldPassword: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Password</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              placeholder="Minimum 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.newPassword && form.newPassword.length < 8 && (
            <p className="mt-1 text-xs text-amber-500">Password must be at least 8 characters</p>
          )}
        </div>

        <Input
          label="Confirm New Password"
          type="password"
          value={form.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          placeholder="Confirm new password"
          {...(form.confirm && form.newPassword !== form.confirm ? { error: "Passwords do not match" } : {})}
        />

        {mutation.isError && (
          <p className="text-sm text-red-500">{(mutation.error as Error).message}</p>
        )}
        {success && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Password changed successfully
          </p>
        )}

        <Button loading={mutation.isPending} disabled={!canSubmit} onClick={() => mutation.mutate()}>
          Change Password
        </Button>
      </div>
    </CardContent>
    </Card>
  )
}

// ── Two-Factor Authentication ────────────────────────────────────────────

function TwoFactorSection() {
  const qc = useQueryClient()
  const [enrollData, setEnrollData] = useState<{ secret: string; uri: string; recoveryCodes: string[] } | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [verified, setVerified] = useState(false)

  const statusQuery = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => mfaApi.status(),
  })

  const enrollMutation = useMutation({
    mutationFn: () => mfaApi.enrollTotp(),
    onSuccess: (data) => {
      setEnrollData(data)
      setVerified(false)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: () => mfaApi.verifyTotp(verifyCode),
    onSuccess: () => {
      setVerified(true)
      setVerifyCode("")
      qc.invalidateQueries({ queryKey: ["mfa-status"] })
    },
  })

  const disableMutation = useMutation({
    mutationFn: () => mfaApi.disable(),
    onSuccess: () => {
      setEnrollData(null)
      setVerified(false)
      qc.invalidateQueries({ queryKey: ["mfa-status"] })
    },
  })

  const enrolled = statusQuery.data?.enrolled ?? false

  function copyRecoveryCodes() {
    if (enrollData?.recoveryCodes) {
      navigator.clipboard.writeText(enrollData.recoveryCodes.join("\n"))
    }
  }

  function downloadRecoveryCodes() {
    if (!enrollData?.recoveryCodes) return
    const blob = new Blob([enrollData.recoveryCodes.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "vitasync-recovery-codes.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader
        title="Two-Factor Authentication"
        subtitle="Add an extra layer of security to your account"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/50"><Smartphone className="h-5 w-5 text-purple-500" /></div>}
        action={enrolled ? <Badge variant="success" dot>2FA Enabled</Badge> : undefined}
      />
      <CardContent>
      {statusQuery.isLoading ? (
        <CardSkeleton count={1} />
      ) : enrolled && !enrollData ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Two-factor authentication is currently enabled on your account.
          </p>
          <Button variant="danger" loading={disableMutation.isPending} onClick={() => disableMutation.mutate()}>
            Disable 2FA
          </Button>
        </div>
      ) : !enrollData ? (
        <Button loading={enrollMutation.isPending} onClick={() => enrollMutation.mutate()}>
          Enable 2FA
        </Button>
      ) : !verified ? (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Scan this QR code with your authenticator app:
            </p>
            <div className="inline-block rounded-2xl bg-white p-4 shadow-md">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(enrollData.uri)}&size=200x200`}
                alt="TOTP QR Code"
                width={200}
                height={200}
              />
            </div>
          </div>

          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Verification Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm text-center font-mono tracking-widest text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
              <Button loading={verifyMutation.isPending} disabled={verifyCode.length !== 6} onClick={() => verifyMutation.mutate()}>
                Verify
              </Button>
            </div>
            {verifyMutation.isError && (
              <p className="mt-1.5 text-xs text-red-500">{(verifyMutation.error as Error).message}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" /> Two-factor authentication verified successfully!
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recovery Codes</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Save these codes in a secure place. You can use them to access your account if you lose your authenticator device.
            </p>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
              <div className="grid grid-cols-2 gap-2">
                {enrollData.recoveryCodes.map((code) => (
                  <code key={code} className="text-sm font-mono text-gray-700 dark:text-gray-300">
                    {code}
                  </code>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" size="sm" icon={Copy} onClick={copyRecoveryCodes}>
                Copy
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadRecoveryCodes}>
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </CardContent>
    </Card>
  )
}

// ── Passkeys─────────────────────────────────────────────────────────────

function PasskeysSection() {
  const qc = useQueryClient()

  const { data: passkeys = [], isLoading } = useQuery<Passkey[]>({
    queryKey: ["passkeys"],
    queryFn: () => passkeysApi.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => passkeysApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passkeys"] }),
  })

  function handleAddPasskey() {
    // Placeholder — WebAuthn browser API integration requires navigator.credentials.create()
    alert("WebAuthn passkey registration will be implemented with the browser Credentials API.")
  }

  return (
    <Card>
      <CardHeader
        title="Passkeys"
        subtitle="Passwordless sign-in with biometrics or security keys"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50"><Fingerprint className="h-5 w-5 text-amber-500" /></div>}
        action={<Button icon={Plus} onClick={handleAddPasskey}>Add Passkey</Button>}
      />
      <CardContent>
      {isLoading ? (
        <CardSkeleton count={1} />
      ) : passkeys.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="No passkeys registered yet"
          description="Add a passkey for faster, passwordless sign-in"
        />
      ) : (
        <div className="space-y-2">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Fingerprint className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{pk.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {pk.type} · Last used {pk.lastUsedAt ? new Date(pk.lastUsedAt).toLocaleDateString() : "Never"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(pk.id)}
                disabled={deleteMutation.isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 transition-all"
                title="Remove passkey"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </CardContent>
    </Card>
  )
}

// ── Active Sessions──────────────────────────────────────────────────────

function ActiveSessionsSection() {
  const [confirmed, setConfirmed] = useState(false)

  const logoutAllMutation = useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => {
      setConfirmed(false)
      window.location.href = "/login"
    },
  })

  return (
    <Card>
      <CardHeader
        title="Active Sessions"
        subtitle="Manage devices signed in to your account"
        icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-950/50"><Monitor className="h-5 w-5 text-sky-500" /></div>}
      />
      <CardContent>

      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 p-4 mb-4">
        <div className="flex items-center gap-3">
          <Monitor className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Current Session</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">This device · Active now</p>
          </div>
          <span className="ml-auto inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </div>
      </div>

      {!confirmed ? (
        <Button variant="danger" icon={LogOut} onClick={() => setConfirmed(true)}>
          Sign Out of All Devices
        </Button>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">Are you sure?</span>
          <Button variant="danger" loading={logoutAllMutation.isPending} onClick={() => logoutAllMutation.mutate()}>
            Yes, Sign Out Everywhere
          </Button>
          <Button variant="outline" onClick={() => setConfirmed(false)}>
            Cancel
          </Button>
        </div>
      )}
    </CardContent>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      <PageHeader title="Security" subtitle="Manage your account security settings, two-factor authentication, and passkeys" />

      <PasswordChangeSection />
      <TwoFactorSection />
      <PasskeysSection />
      <ActiveSessionsSection />
    </div>
  )
}
