"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type AiProviderConfig, aiProvidersApi } from "../../../../../lib/api"
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  Select,
  Toggle,
  Button,
  Badge,
  CardSkeleton,
  EmptyState,
} from "../../../../../lib/components/ui"
import { Brain, Plus, Pencil, Trash2, FlaskConical, Cpu, Globe } from "lucide-react"

// ── Provider metadata ───────────────────────────────────────────────────────

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { value: "anthropic", label: "Anthropic", models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"] },
  { value: "ollama", label: "Ollama (Local)", models: ["llama3", "llama3:70b", "mistral", "mixtral", "codellama", "phi3"] },
] as const

// ── Page ────────────────────────────────────────────────────────────────────

export default function AiProvidersPage() {
  const queryClient = useQueryClient()

  const { data: providersResult, isLoading } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: aiProvidersApi.list,
  })
  const providers: AiProviderConfig[] = providersResult?.data ?? []

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [providerType, setProviderType] = useState("openai")
  const [model, setModel] = useState("gpt-4o")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string } | null>>({})

  function resetForm() {
    setName("")
    setProviderType("openai")
    setModel("gpt-4o")
    setApiKey("")
    setBaseUrl("")
    setIsDefault(false)
    setEditingId(null)
    setFormOpen(false)
  }

  function startEdit(p: AiProviderConfig) {
    setEditingId(p.id)
    setName(p.name)
    setProviderType(p.providerType)
    setModel(p.model)
    setApiKey("")
    setBaseUrl(p.baseUrl ?? "")
    setIsDefault(p.isDefault)
    setFormOpen(true)
  }

  const selectedType = PROVIDER_TYPES.find((t) => t.value === providerType)
  const modelOptions = (selectedType?.models ?? []).map((m) => ({ value: m, label: m }))

  const createMut = useMutation({
    mutationFn: () =>
      aiProvidersApi.create({
        name,
        providerType,
        model,
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        isDefault,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] })
      resetForm()
    },
  })

  const updateMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name, providerType, model, isDefault }
      if (apiKey) body.apiKey = apiKey
      if (baseUrl) body.baseUrl = baseUrl
      return aiProvidersApi.update(editingId!, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] })
      resetForm()
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => aiProvidersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-providers"] }),
  })

  async function handleTest(id: string) {
    setTestResult((prev) => ({ ...prev, [id]: null }))
    try {
      const res = await aiProvidersApi.test(id)
      setTestResult((prev) => ({ ...prev, [id]: res }))
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: { success: false, message: "Connection failed" } }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingId) {
      updateMut.mutate()
    } else {
      createMut.mutate()
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="AI Providers"
        subtitle="Configure AI models for health insights and analysis"
        breadcrumbs={[
          { label: "Settings", href: "/admin/settings" },
          { label: "AI Providers" },
        ]}
        actions={
          !formOpen ? (
            <Button
              icon={Plus}
              onClick={() => {
                resetForm()
                setFormOpen(true)
                setIsDefault(providers.length === 0)
              }}
            >
              Add Provider
            </Button>
          ) : undefined
        }
      />

      {/* ── Add / Edit Form ──────────────────────────────────────────────── */}
      {formOpen && (
        <Card>
          <CardHeader
            title={editingId ? "Edit Provider" : "Add Provider"}
            subtitle={editingId ? "Update provider configuration" : "Connect a new AI provider"}
            icon={<Cpu className="h-5 w-5" />}
          />
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Name"
                  placeholder="e.g. GPT-4o Production"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Select
                  label="Provider"
                  options={PROVIDER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  value={providerType}
                  onChange={(e) => {
                    setProviderType(e.target.value)
                    const newType = PROVIDER_TYPES.find((t) => t.value === e.target.value)
                    if (newType) setModel(newType.models[0])
                  }}
                />
                <Select
                  label="Model"
                  options={modelOptions}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
                <Input
                  label={`API Key${providerType === "ollama" ? " (optional)" : ""}`}
                  type="password"
                  placeholder={
                    editingId
                      ? "Leave blank to keep existing"
                      : providerType === "ollama"
                        ? "Not required for local Ollama"
                        : "sk-..."
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>

              {providerType === "ollama" && (
                <Input
                  label="Base URL"
                  type="url"
                  placeholder="http://localhost:11434"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  icon={Globe}
                />
              )}

              <Toggle
                label="Default provider"
                description="Use this provider by default for AI features"
                checked={isDefault}
                onChange={setIsDefault}
              />
            </CardContent>

            <CardFooter className="flex items-center gap-2">
              <Button
                type="submit"
                loading={createMut.isPending || updateMut.isPending}
              >
                {editingId ? "Update Provider" : "Add Provider"}
              </Button>
              <Button variant="secondary" type="button" onClick={resetForm}>
                Cancel
              </Button>
              {(createMut.isError || updateMut.isError) && (
                <Badge variant="danger" dot>
                  Failed to save provider. Check your inputs and try again.
                </Badge>
              )}
            </CardFooter>
          </form>
        </Card>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <CardSkeleton count={2} className="grid-cols-1 lg:grid-cols-1 sm:grid-cols-1" />
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!isLoading && providers.length === 0 && !formOpen && (
        <EmptyState
          title="No AI providers configured"
          description="Add a provider to start using the AI health assistant."
          action={{
            label: "Add Provider",
            onClick: () => {
              resetForm()
              setFormOpen(true)
              setIsDefault(true)
            },
          }}
        />
      )}

      {/* ── Provider Cards ───────────────────────────────────────────────── */}
      {providers.map((p) => (
        <Card key={p.id}>
          <CardHeader
            title={p.name}
            icon={<Brain className="h-5 w-5" />}
            action={
              <div className="flex items-center gap-2">
                <Badge variant="default">{p.providerType}</Badge>
                <Badge variant="info">{p.model}</Badge>
                {p.isDefault && (
                  <Badge variant="success" dot pulse>
                    default
                  </Badge>
                )}
              </div>
            }
          />
          <CardContent className="space-y-2">
            {p.apiKeyMasked && (
              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                {p.apiKeyMasked}
              </p>
            )}
            {p.baseUrl && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Base URL: {p.baseUrl}
              </p>
            )}
            {testResult[p.id] && (
              <Badge
                variant={testResult[p.id]!.success ? "success" : "danger"}
                dot
              >
                {testResult[p.id]!.success ? "✓ " : "✗ "}
                {testResult[p.id]!.message}
              </Badge>
            )}
          </CardContent>
          <CardFooter className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={FlaskConical}
              onClick={() => handleTest(p.id)}
            >
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Pencil}
              onClick={() => startEdit(p)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              onClick={() => {
                if (confirm("Delete this AI provider?")) deleteMut.mutate(p.id)
              }}
              disabled={deleteMut.isPending}
            >
              Delete
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
