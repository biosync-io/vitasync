"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"
import { type User, usersApi } from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"

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

  const users: User[] = data?.data ?? []
  const total = data?.total ?? 0

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Users</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage end-users in this workspace and their provider connections.
            {total > 0 && <span className="ml-1 font-medium text-gray-600 dark:text-gray-300">({total.toLocaleString()} total)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200 w-full sm:w-auto"
        >
          + Add User
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-950/40 dark:to-purple-950/20 backdrop-blur-xl p-6 shadow-lg shadow-indigo-500/5 animate-fade-in-up">
          <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm shadow-lg shadow-indigo-500/30">+</span>
            Create User
          </h2>
          {error && <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="user-external-id" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                External ID *
              </label>
              <input
                id="user-external-id"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/40 transition-all"
                placeholder="user_123"
                value={form.externalId}
                onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="user-email" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                Email
              </label>
              <input
                id="user-email"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/40 transition-all"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="user-display-name" className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                Display Name
              </label>
              <input
                id="user-display-name"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/40 transition-all"
                placeholder="Jane Smith"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
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
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setError("")
              }}
              className="rounded-xl border border-gray-300 dark:border-gray-700 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!form.externalId || createMutation.isPending}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all duration-200 hover:-translate-y-0.5"
            >
              {createMutation.isPending ? "Creating…" : "Create User"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader — items have no stable identity
            <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
          <span className="text-5xl mb-3 animate-float">👥</span>
          <p className="text-sm text-gray-500 dark:text-gray-400">No users yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50/80 dark:bg-gray-800/50">
              <tr>
                {["External ID", "Email", "Name", "Gender", "Created", ""].map((h) => (
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
                    {user.gender && GENDER_BADGE[user.gender] ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${GENDER_BADGE[user.gender]!.color}`}>
                        {GENDER_BADGE[user.gender]!.icon} {GENDER_BADGE[user.gender]!.label}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm">
                    <Link
                      href={`/dashboard/users/${user.id}` as Route<string>}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="sm:hidden space-y-3 stagger-list">
            {users.map((user) => (
              <div
                key={`m-${user.id}`}
                className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-4 shadow-card hover:shadow-card-hover transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {user.displayName ?? user.externalId}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email ?? "No email"}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    <Link
                      href={`/dashboard/users/${user.id}` as Route<string>}
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
                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span className="font-mono truncate">{user.externalId}</span>
                  <div className="flex items-center gap-2">
                    {user.gender && GENDER_BADGE[user.gender] && (
                      <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${GENDER_BADGE[user.gender]!.color}`}>
                        {GENDER_BADGE[user.gender]!.icon} {GENDER_BADGE[user.gender]!.label}
                      </span>
                    )}
                    <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  )
}
