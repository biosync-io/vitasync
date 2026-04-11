"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"
import { type User, usersApi, adminUsersApi, migrationApi } from "../../../../lib/api"
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, PageHeader, TableSkeleton } from "../../../../lib/components/ui"
import { Pagination } from "../../../../lib/Pagination"
import { Mail, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react"

type UserWithRole = User & { role?: string; hasPassword?: boolean }

const PAGE_SIZE = 25

const GENDER_OPTIONS = [
  { value: "", label: "Not set", icon: "👤" },
  { value: "male", label: "Male", icon: "♂️" },
  { value: "female", label: "Female", icon: "♀️" },
  { value: "other", label: "Other", icon: "⚧️" },
]

const GENDER_BADGE: Record<string, { label: string; color: string; icon: string }> = {
  male: { label: "Male", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: "♂️" },
  female: { label: "Female", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", icon: "♀️" },
  other: { label: "Other", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: "⚧️" },
}

export default function UsersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ externalId: "", email: "", displayName: "", gender: "" })
  const [error, setError] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["users", page],
    queryFn: () => usersApi.list({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

  const users: UserWithRole[] = data?.data ?? []
  const total = data?.total ?? 0

  const promoteMutation = useMutation({
    mutationFn: (userId: string) => adminUsersApi.promote(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  })

  const demoteMutation = useMutation({
    mutationFn: (userId: string) => adminUsersApi.demote(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  })

  const handleDemote = (userId: string) => {
    if (window.confirm("Are you sure you want to demote this admin to a regular user?")) {
      demoteMutation.mutate(userId)
    }
  }

  const createMutation = useMutation({
    mutationFn: () => usersApi.create({
      externalId: form.externalId,
      ...(form.email ? { email: form.email } : {}),
      ...(form.displayName ? { displayName: form.displayName } : {}),
      ...(form.gender ? { gender: form.gender } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      setPage(1)
      setShowCreate(false)
      setForm({ externalId: "", email: "", displayName: "", gender: "" })
      setError("")
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  })

  /* ── Migration ── */

  const { data: migrationStatus } = useQuery({
    queryKey: ["migration-status"],
    queryFn: () => migrationApi.status(),
  })

  const [bulkInviteMsg, setBulkInviteMsg] = useState<string | null>(null)

  const bulkInviteMutation = useMutation({
    mutationFn: () => migrationApi.bulkInvite(),
    onSuccess: (data) => {
      setBulkInviteMsg(`Sent ${data.sent ?? data.total ?? "all"} invitations`)
      qc.invalidateQueries({ queryKey: ["migration-status"] })
    },
    onError: (err: Error) => setBulkInviteMsg(`Error: ${err.message}`),
  })

  const inviteMutation = useMutation({
    mutationFn: (userId: string) => migrationApi.invite(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      qc.invalidateQueries({ queryKey: ["migration-status"] })
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users Management"
        subtitle={`Manage end-users in this workspace and their provider connections.${total > 0 ? ` (${total.toLocaleString()} total)` : ""}`}
        actions={<Button icon={UserPlus} onClick={() => setShowCreate(true)}>Add User</Button>}
      />

      {/* ── Migration Status Card ── */}
      {migrationStatus && (
        <Card>
          <CardHeader title="User Migration" subtitle="Invite migrated users to set up their login credentials" />
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success" dot>{migrationStatus.withLogin} users with login</Badge>
              <Badge variant="default" dot>{migrationStatus.withoutLogin} users without login</Badge>
              <Button
                variant="primary"
                size="sm"
                icon={Mail}
                loading={bulkInviteMutation.isPending}
                onClick={() => bulkInviteMutation.mutate()}
                disabled={bulkInviteMutation.isPending || migrationStatus.withoutLogin === 0}
              >
                Invite All
              </Button>
              {bulkInviteMsg && (
                <span className={`text-sm ${bulkInviteMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                  {bulkInviteMsg}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardHeader title="Create User" />
          <CardContent>
            {error && <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                label="External ID *"
                placeholder="user_123"
                value={form.externalId}
                onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
              />
              <Input
                label="Email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="Display Name"
                placeholder="Jane Smith"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
              <div>
                <label htmlFor="user-gender" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  Gender
                </label>
                <div className="flex gap-1.5">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, gender: opt.value }))}
                      className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium transition-all duration-200 ${
                        form.gender === opt.value
                          ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md"
                          : "bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300"
                      }`}
                    >
                      <span className="block text-sm">{opt.icon}</span>
                      <span className="block mt-0.5">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreate(false)
                  setError("")
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                disabled={!form.externalId || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create User"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} cols={7} />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users yet" description="Create one to get started." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-hidden">
            <Card>
              <CardContent className="px-0 py-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                    <thead className="bg-gray-50/80 dark:bg-gray-800/50">
                      <tr>
                        {["External ID", "Email", "Name", "Gender", "Role", "Login Status", "Created", "Actions"].map((h) => (
                          <th
                            key={h}
                            className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {users.map((user) => (
                        <tr key={user.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="px-5 py-3.5 text-sm font-mono text-gray-900 dark:text-gray-100">{user.externalId}</td>
                          <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{user.email ?? "—"}</td>
                          <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{user.displayName ?? "—"}</td>
                          <td className="px-5 py-3.5 text-sm">
                            <GenderPicker userId={user.id} currentGender={user.gender} />
                          </td>
                          <td className="px-5 py-3.5 text-sm">
                            <Badge variant={user.role === "admin" ? "warning" : "info"}>
                              {user.role === "admin" ? "Admin" : "User"}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-sm">
                            {user.hasPassword ? (
                              <Badge variant="success" dot>Login Enabled</Badge>
                            ) : (
                              <Badge variant="default" dot>No Login</Badge>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5 text-right text-sm">
                            <div className="flex items-center justify-end gap-2">
                              {!user.hasPassword && user.email && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon={Mail}
                                  loading={inviteMutation.isPending}
                                  onClick={() => inviteMutation.mutate(user.id)}
                                >
                                  Send Invite
                                </Button>
                              )}
                              {user.role === "admin" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon={UserCog}
                                  loading={demoteMutation.isPending}
                                  onClick={() => handleDemote(user.id)}
                                >
                                  Demote to User
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={ShieldCheck}
                                  loading={promoteMutation.isPending}
                                  onClick={() => promoteMutation.mutate(user.id)}
                                >
                                  Promote to Admin
                                </Button>
                              )}
                              <Link
                                href={`/admin/users/${user.id}` as Route<string>}
                                className="mr-3 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs font-medium"
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                onClick={() => deleteMutation.mutate(user.id)}
                                className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-all"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile card view */}
          <div className="sm:hidden space-y-3 stagger-list">
            {users.map((user) => (
              <Card key={`m-${user.id}`} hover>
                <CardContent>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {user.displayName ?? user.externalId}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user.email ?? "No email"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <Badge variant={user.role === "admin" ? "warning" : "info"} size="sm">
                        {user.role === "admin" ? "Admin" : "User"}
                      </Badge>
                      {user.hasPassword ? (
                        <Badge variant="success" size="sm" dot>Login</Badge>
                      ) : (
                        <Badge variant="default" size="sm" dot>No Login</Badge>
                      )}
                      <Link
                        href={`/admin/users/${user.id}` as Route<string>}
                        className="text-indigo-600 dark:text-indigo-400 text-xs font-medium"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(user.id)}
                        className="text-red-500 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mb-2">
                    <span className="font-mono truncate">{user.externalId}</span>
                    <div className="flex items-center gap-2">
                      <GenderPicker userId={user.id} currentGender={user.gender} />
                      <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    {!user.hasPassword && user.email && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Mail}
                        loading={inviteMutation.isPending}
                        onClick={() => inviteMutation.mutate(user.id)}
                        className="w-full"
                      >
                        Send Invite
                      </Button>
                    )}
                    {user.role === "admin" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={UserCog}
                        loading={demoteMutation.isPending}
                        onClick={() => handleDemote(user.id)}
                        className="w-full"
                      >
                        Demote to User
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={ShieldCheck}
                        loading={promoteMutation.isPending}
                        onClick={() => promoteMutation.mutate(user.id)}
                        className="w-full"
                      >
                        Promote to Admin
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  )
}

function GenderPicker({ userId, currentGender }: { userId: string; currentGender: string | null }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const updateMut = useMutation({
    mutationFn: (gender: string | null) => usersApi.update(userId, { gender }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      setOpen(false)
    },
  })

  const badge = currentGender ? GENDER_BADGE[currentGender] : null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
      >
        {badge ? (
          <span className={badge.color}>
            {badge.icon} {badge.label}
          </span>
        ) : (
          <span className="text-gray-400 hover:text-indigo-500">+ Set gender</span>
        )}
      </button>
      {open && (
        <div className="absolute z-20 top-8 left-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2 min-w-[140px] animate-fade-in">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate(opt.value)}
              className={`w-full text-left rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                currentGender === opt.value ? "bg-indigo-50 dark:bg-indigo-900/30 font-semibold" : ""
              }`}
            >
              <span>{opt.icon}</span> {opt.label}
            </button>
          ))}
          {currentGender && (
            <button
              type="button"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate(null)}
              className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 mt-1 border-t border-gray-100 dark:border-gray-800 pt-1.5"
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
