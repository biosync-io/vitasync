"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"
import { type User, usersApi } from "../../../lib/api"
import { Pagination } from "../../../lib/Pagination"

const PAGE_SIZE = 25

export default function UsersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ externalId: "", email: "", displayName: "" })
  const [error, setError] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["users", page],
    queryFn: () => usersApi.list({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  })

  const users: User[] = data?.data ?? []
  const total = data?.total ?? 0

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      setPage(1)
      setShowCreate(false)
      setForm({ externalId: "", email: "", displayName: "" })
      setError("")
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage end-users in this workspace and their provider connections.
            {total > 0 && <span className="ml-1 text-gray-400">({total.toLocaleString()} total)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 w-full sm:w-auto"
        >
          + Add User
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Create User</h2>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="user-external-id" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                External ID *
              </label>
              <input
                id="user-external-id"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                placeholder="user_123"
                value={form.externalId}
                onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="user-email" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <input
                id="user-email"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label
                htmlFor="user-display-name"
                className="block text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                Display Name
              </label>
              <input
                id="user-display-name"
                className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                placeholder="Jane Smith"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => createMutation.mutate(form)}
              disabled={!form.externalId || createMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setError("")
              }}
              className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton loader — items have no stable identity
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 py-16 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No users yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                {["External ID", "Email", "Name", "Created", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">{user.externalId}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.email ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.displayName ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <Link
                      href={`/dashboard/users/${user.id}` as Route<string>}
                      className="mr-3 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs font-medium"
                    >
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(user.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
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
          <div className="sm:hidden space-y-3">
            {users.map((user) => (
              <div
                key={`m-${user.id}`}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
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
                  <span>{new Date(user.createdAt).toLocaleDateString()}</span>
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
