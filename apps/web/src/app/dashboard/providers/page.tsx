"use client"

import { useQuery } from "@tanstack/react-query"
import { type ProviderDef, providersApi } from "../../../lib/api"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export default function ProvidersPage() {
  const { data: providers = [], isLoading } = useQuery<ProviderDef[]>({
    queryKey: ["providers"],
    queryFn: () => providersApi.list(),
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Providers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Available wearable device integrations. Connect users to these providers via OAuth.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      )}

      <div className="mt-10 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
        <h2 className="text-sm font-semibold text-gray-700">OAuth Authorization URL</h2>
        <p className="mt-1 text-sm text-gray-500">
          To connect a user to a provider, redirect their browser to:
        </p>
        <code className="mt-2 block rounded bg-gray-900 px-4 py-3 text-sm text-green-400 overflow-auto">
          {`GET ${API_URL}/v1/oauth/{providerId}/authorize?userId={userId}`}
        </code>
      </div>
    </div>
  )
}

function ProviderCard({ provider }: { provider: ProviderDef }) {
  const authBadgeColor =
    provider.authType === "oauth2" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{provider.name}</h3>
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{provider.description}</p>
        </div>
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${authBadgeColor}`}
        >
          {provider.authType.toUpperCase()}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {provider.capabilities.map((cap) => (
          <span
            key={cap}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 capitalize"
          >
            {cap.replace("_", " ")}
          </span>
        ))}
      </div>
    </div>
  )
}
