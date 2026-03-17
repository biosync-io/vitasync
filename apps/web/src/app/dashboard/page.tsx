"use client"

import { useQuery } from "@tanstack/react-query"
import { apiKeysApi, providersApi, usersApi, webhooksApi } from "../../lib/api"

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: providersApi.list })
  const { data: usersResult } = useQuery({
    queryKey: ["users", 0],
    queryFn: () => usersApi.list({ limit: 1 }),
  })
  const { data: keys = [] } = useQuery({ queryKey: ["api-keys"], queryFn: apiKeysApi.list })
  const { data: webhooks = [] } = useQuery({ queryKey: ["webhooks"], queryFn: webhooksApi.list })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Your VitaSync workspace at a glance.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-10">
        <StatCard label="Registered Providers" value={providers.length} sub="OAuth integrations" />
        <StatCard label="Users" value={usersResult?.total != null && usersResult.total > 0 ? "—" : 0} sub="Tracked individuals" />
        <StatCard label="API Keys" value={keys.length} sub="Active credentials" />
        <StatCard label="Webhooks" value={webhooks.length} sub="Event subscriptions" />
      </div>

      {/* Provider overview */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Available Providers</h2>
        {providers.length === 0 ? (
          <p className="text-sm text-gray-400">
            No providers registered. Set provider credentials in your environment.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 uppercase">
                  {p.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{p.authType}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Quick Start</h2>
        <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
          <li>
            Create a <span className="font-medium text-gray-900">User</span> with an external ID
            from your system.
          </li>
          <li>
            Start an <span className="font-medium text-gray-900">OAuth flow</span> via{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              GET /v1/oauth/:provider/authorize?userId=&lt;id&gt;
            </code>
          </li>
          <li>
            Trigger a <span className="font-medium text-gray-900">sync</span> or wait for the
            scheduled worker to pull data.
          </li>
          <li>
            Query <span className="font-medium text-gray-900">health metrics</span> via{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              GET /v1/users/:id/health
            </code>
          </li>
        </ol>
      </div>
    </div>
  )
}
