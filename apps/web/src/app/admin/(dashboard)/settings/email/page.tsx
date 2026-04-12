"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  Toggle,
  Button,
  Badge,
  StatusDot,
  CardSkeleton,
} from "../../../../../lib/components/ui"
import { Mail, Server, Eye, EyeOff, Send, Plug, Save, Lock } from "lucide-react"

// ── SMTP Settings API ───────────────────────────────────────────────────────

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  fromName: string
  fromEmail: string
  configured: boolean
}

const smtpApi = {
  get: (): Promise<{ source: string; config: Record<string, unknown> | null }> =>
    fetch("/api/v1/admin/settings/smtp", { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Failed to load SMTP settings")
      return r.json()
    }),
  update: (data: Record<string, unknown>): Promise<Record<string, unknown>> =>
    fetch("/api/v1/admin/settings/smtp", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => {
      if (!r.ok) throw new Error("Failed to save SMTP settings")
      return r.json()
    }),
  test: (data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    fetch("/api/v1/admin/settings/smtp/test", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  testSend: (data: Record<string, unknown>): Promise<{ success: boolean; message?: string; error?: string }> =>
    fetch("/api/v1/admin/settings/smtp/test-send", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  const queryClient = useQueryClient()

  const [host, setHost] = useState("")
  const [port, setPort] = useState("587")
  const [secure, setSecure] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [fromName, setFromName] = useState("")
  const [fromEmail, setFromEmail] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showTestSend, setShowTestSend] = useState(false)
  const [testEmail, setTestEmail] = useState("")

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  const { data: config, isLoading } = useQuery({
    queryKey: ["smtp-settings"],
    queryFn: smtpApi.get,
  })

  useEffect(() => {
    if (config?.config) {
      const c = config.config as Record<string, unknown>
      setHost((c.host as string) ?? "")
      setPort(String(c.port ?? 587))
      setSecure(c.secure === true)
      setUsername((c.user as string) ?? "")
      setFromName((c.fromName as string) ?? "")
      setFromEmail((c.fromEmail as string) ?? "")
      // Don't populate password — it's masked as "••••••••" from the API
    }
  }, [config])

  function getFormData() {
    return {
      host,
      port: Number(port) || 587,
      secure,
      user: username,
      pass: password,
      fromName,
      fromEmail,
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => smtpApi.update(getFormData()),
    onSuccess: () => {
      setSaveResult({ success: true, message: "SMTP settings saved successfully" })
      setTestResult(null)
      setSendResult(null)
      queryClient.invalidateQueries({ queryKey: ["smtp-settings"] })
    },
    onError: (err: Error) => {
      setSaveResult({ success: false, message: err.message })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => smtpApi.test(getFormData()),
    onSuccess: (data) => {
      setTestResult(data)
      setSaveResult(null)
      setSendResult(null)
    },
    onError: (err: Error) => {
      setTestResult({ success: false, message: err.message })
    },
  })

  const sendMutation = useMutation({
    mutationFn: () => smtpApi.testSend({ ...getFormData(), testEmail }),
    onSuccess: (data) => {
      setSendResult(data)
      setSaveResult(null)
      setTestResult(null)
    },
    onError: (err: Error) => {
      setSendResult({ success: false, message: err.message })
    },
  })

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-8">
        <PageHeader
          title="Email Configuration"
          subtitle="Configure SMTP for transactional emails"
          breadcrumbs={[
            { label: "Settings", href: "/admin/settings" },
            { label: "Email" },
          ]}
        />
        <CardSkeleton count={1} className="grid-cols-1 lg:grid-cols-1 sm:grid-cols-1" />
      </div>
    )
  }

  const isConfigured = config?.source !== "none" && config?.config !== null

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="Email Configuration"
        subtitle="Configure SMTP for transactional emails"
        breadcrumbs={[
          { label: "Settings", href: "/admin/settings" },
          { label: "Email" },
        ]}
        badge={
          <Badge variant={isConfigured ? "success" : "danger"} dot pulse={isConfigured}>
            {isConfigured ? "Configured" : "Not Configured"}
          </Badge>
        }
      />

      {/* ── SMTP Server ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="SMTP Server"
          subtitle="Connection settings for your mail server"
          icon={<Server className="h-5 w-5" />}
          action={
            <StatusDot
              status={isConfigured ? "success" : "danger"}
              label={isConfigured ? "Connected" : "Not Connected"}
              pulse={isConfigured}
            />
          }
        />
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="SMTP Host"
              placeholder="smtp.gmail.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              icon={Server}
            />
            <Input
              label="SMTP Port"
              placeholder="587"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              hint="Common ports: 587 (TLS), 465 (SSL), 25 (unencrypted)"
            />
          </div>

          <Toggle
            label="Secure (TLS)"
            description="Enable TLS encryption for SMTP connections"
            checked={secure}
            onChange={setSecure}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Username"
              placeholder="Optional"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              hint="SMTP authentication username"
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Optional"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border bg-white dark:bg-white/[0.03] px-4 py-2.5 pr-11 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 border-gray-200/60 dark:border-white/[0.08] focus:ring-brand-500/30 focus:border-brand-400 dark:focus:border-brand-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                SMTP authentication password
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Sender ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Sender"
          subtitle="Display name and address for outgoing emails"
          icon={<Mail className="h-5 w-5" />}
        />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="From Name"
              placeholder="VitaSync"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              hint="Display name for outgoing emails"
            />
            <Input
              label="From Email"
              placeholder="noreply@vitasync.io"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              icon={Mail}
              hint="Sender email address"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Actions"
          subtitle="Save settings, test connectivity, or send a test message"
        />
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              icon={Save}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save Settings
            </Button>
            <Button
              variant="secondary"
              icon={Plug}
              loading={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              Test Connection
            </Button>
            <Button
              variant="secondary"
              icon={Send}
              onClick={() => setShowTestSend((v) => !v)}
            >
              Send Test Email
            </Button>
          </div>

          {showTestSend && (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Recipient Email"
                  placeholder="you@example.com"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  icon={Mail}
                />
              </div>
              <Button
                variant="primary"
                size="md"
                icon={Send}
                loading={sendMutation.isPending}
                disabled={!testEmail}
                onClick={() => sendMutation.mutate()}
              >
                Send
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {saveResult && (
              <Badge variant={saveResult.success ? "success" : "danger"} dot>
                {saveResult.message}
              </Badge>
            )}
            {testResult && (
              <Badge variant={testResult.success ? "success" : "danger"} dot>
                {testResult.message}
              </Badge>
            )}
            {sendResult && (
              <Badge variant={sendResult.success ? "success" : "danger"} dot>
                {sendResult.message}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Email Preview ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Email Preview"
          subtitle="Preview of the verification email template"
          icon={<Mail className="h-5 w-5" />}
        />
        <CardContent>
          <div className="rounded-xl border border-gray-200/60 dark:border-white/[0.08] overflow-hidden">
            <div className="bg-gray-50 dark:bg-white/[0.02] px-6 py-3 border-b border-gray-200/60 dark:border-white/[0.06] space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">From:</span>
                {fromName || "VitaSync"} &lt;{fromEmail || "noreply@vitasync.io"}&gt;
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">To:</span>
                user@example.com
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">Subject:</span>
                <span className="text-gray-700 dark:text-gray-200">Verify your VitaSync account</span>
              </div>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                  <Lock className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  {fromName || "VitaSync"}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Hi there,</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Please verify your email address by clicking the button below. This link will expire in 24 hours.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm">
                  Verify Email Address
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-4 border-t border-gray-100 dark:border-white/[0.04]">
                If you didn&apos;t create a {fromName || "VitaSync"} account, you can safely ignore this email.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
