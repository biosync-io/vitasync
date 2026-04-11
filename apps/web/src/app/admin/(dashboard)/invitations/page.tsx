"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Copy, Check, Mail, UserPlus, XCircle } from "lucide-react"
import { adminInvitationsApi } from "../../../../lib/api"
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  Button,
  Input,
  Badge,
  DataTable,
  CardSkeleton,
  EmptyState,
  type DataTableColumn,
} from "../../../../lib/components/ui"

interface Invitation {
  id: string
  email: string
  status: "pending" | "accepted" | "expired"
  invitedBy: string
  invitedByEmail: string
  token?: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

/* ── Status badge helpers ── */

const statusVariant: Record<string, "warning" | "success" | "default"> = {
  pending: "warning",
  accepted: "success",
  expired: "default",
}

const statusLabel: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
}

/* ── Component ── */

export default function InvitationsPage() {
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => adminInvitationsApi.list(),
  })

  const invitations = data?.data ?? []
  const pending = invitations.filter((i) => i.status === "pending")
  const accepted = invitations.filter((i) => i.status === "accepted")

  const createMut = useMutation({
    mutationFn: (inviteEmail: string) => adminInvitationsApi.create(inviteEmail),
    onSuccess: (result) => {
      setCreatedToken(result.token)
      setEmail("")
      qc.invalidateQueries({ queryKey: ["admin-invitations"] })
    },
  })

  const revokeMut = useMutation({
    mutationFn: (id: string) => adminInvitationsApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-invitations"] }),
  })

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inviteLink = createdToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/admin/register?token=${createdToken}`
    : null

  /* ── Table columns ── */

  const pendingColumns: DataTableColumn<Invitation>[] = [
    { key: "email", header: "Email" },
    {
      key: "invitedByEmail",
      header: "Invited By",
      render: (row) => (
        <span className="text-gray-400">{row.invitedByEmail}</span>
      ),
    },
    {
      key: "expiresAt",
      header: "Expires",
      render: (row) => (
        <span className="text-gray-400">
          {new Date(row.expiresAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={statusVariant[row.status] ?? "default"} dot>
          {statusLabel[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <Button
          variant="danger"
          size="sm"
          icon={XCircle}
          loading={revokeMut.isPending}
          onClick={() => revokeMut.mutate(row.id)}
        >
          Revoke
        </Button>
      ),
    },
  ]

  const acceptedColumns: DataTableColumn<Invitation>[] = [
    { key: "email", header: "Email" },
    {
      key: "acceptedAt",
      header: "Accepted",
      render: (row) => (
        <span className="text-gray-400">
          {row.acceptedAt ? new Date(row.acceptedAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "invitedByEmail",
      header: "Invited By",
      render: (row) => (
        <span className="text-gray-400">{row.invitedByEmail}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: () => (
        <Badge variant="success" dot>
          Accepted
        </Badge>
      ),
    },
  ]

  const pendingCols = pendingColumns as unknown as DataTableColumn<Record<string, unknown>>[]
  const acceptedCols = acceptedColumns as unknown as DataTableColumn<Record<string, unknown>>[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Invitations"
        subtitle="Invite new administrators to the platform"
      />

      {/* ── Invite New Admin ── */}
      <Card>
        <CardHeader
          title="Invite New Admin"
          subtitle="Send an invitation link to a new administrator"
          icon={<UserPlus className="h-5 w-5" />}
        />
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Email address"
                icon={Mail}
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                {...(createMut.isError ? { error: createMut.error.message } : {})}
              />
            </div>
            <Button
              icon={UserPlus}
              loading={createMut.isPending}
              disabled={!email || createMut.isPending}
              onClick={() => {
                setCreatedToken(null)
                createMut.mutate(email)
              }}
            >
              Send Invitation
            </Button>
          </div>

          {/* Token display (shown once after creation) */}
          {inviteLink && (
            <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
              <p className="text-sm font-medium text-green-400">
                ✓ Invitation created! Share this link with the new admin:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-gray-900/60 border border-white/[0.06] px-4 py-2.5 text-sm font-mono text-gray-200 overflow-x-auto select-all">
                  {inviteLink}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copied ? Check : Copy}
                  onClick={() => handleCopy(inviteLink)}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                This link will only be shown once. It expires in 48 hours.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pending Invitations ── */}
      {isLoading ? (
        <CardSkeleton count={1} className="grid-cols-1" />
      ) : (
        <Card>
          <CardHeader
            title="Pending Invitations"
            subtitle={`${pending.length} invitation${pending.length !== 1 ? "s" : ""} awaiting acceptance`}
          />
          <CardContent className="px-0 py-0">
            <DataTable
              columns={pendingCols}
              data={pending as unknown as Record<string, unknown>[]}
              emptyMessage="No pending invitations"
              emptyIcon={Mail}
              rowKey={(row) => (row as unknown as Invitation).id}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Accepted Invitations ── */}
      {isLoading ? (
        <CardSkeleton count={1} className="grid-cols-1" />
      ) : (
        <Card>
          <CardHeader
            title="Accepted Invitations"
            subtitle={`${accepted.length} invitation${accepted.length !== 1 ? "s" : ""} accepted`}
          />
          <CardContent className="px-0 py-0">
            <DataTable
              columns={acceptedCols}
              data={accepted as unknown as Record<string, unknown>[]}
              emptyMessage="No accepted invitations yet"
              emptyIcon={UserPlus}
              rowKey={(row) => (row as unknown as Invitation).id}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
