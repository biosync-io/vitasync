"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageSquare, Send, Bot, Sparkles, ChevronDown, Settings, AlertCircle } from "lucide-react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { aiProvidersApi, getRuntimeDefaultKey, type AiProviderConfig } from "../../../lib/api"
import { PageHeader, Card, CardContent, Button, EmptyState, CardSkeleton } from "../../../lib/components/ui"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

const SESSION_KEY = "vitasync-chatbot-messages"
const PROVIDER_KEY = "vitasync-chatbot-provider"

const SUGGESTED_QUESTIONS = [
  "How was my sleep last week?",
  "What's my average heart rate?",
  "Analyze my HRV trends",
  "Am I overtraining?",
  "Summarize my health this month",
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs))
  } catch { /* quota exceeded – ignore */ }
}

/** Render markdown-like formatting: bold, italic, inline code, bullet lists */
function renderMarkdown(text: string) {
  const lines = text.split("\n")
  return lines.map((line, i) => {
    const isBullet = /^[\s]*[-*]\s/.test(line)
    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs font-mono">$1</code>')

    if (isBullet) {
      const content = formatted.replace(/^[\s]*[-*]\s/, "")
      return (
        <li key={i} className="ml-4 list-disc text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
      )
    }
    return (
      <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />
    )
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ChatbotPage() {
  const { selectedUserId, currentUserId } = useSelectedUser()

  // Providers
  const [providers, setProviders] = useState<AiProviderConfig[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Load providers
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await aiProvidersApi.list()
        if (cancelled) return
        const list = res.data ?? []
        setProviders(list)
        const stored = sessionStorage.getItem(PROVIDER_KEY)
        const match = list.find((p) => p.id === stored)
        const def = list.find((p) => p.isDefault)
        setSelectedProviderId(match?.id ?? def?.id ?? list[0]?.id ?? "")
      } catch {
        if (!cancelled) setProviders([])
      } finally {
        if (!cancelled) setProvidersLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Hydrate messages from sessionStorage
  useEffect(() => {
    setMessages(loadMessages())
  }, [])

  // Persist messages
  useEffect(() => {
    if (messages.length) saveMessages(messages)
  }, [messages])

  // Persist selected provider
  useEffect(() => {
    if (selectedProviderId) sessionStorage.setItem(PROVIDER_KEY, selectedProviderId)
  }, [selectedProviderId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streaming])

  // Close provider dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-provider-dropdown]")) {
        setProviderDropdownOpen(false)
      }
    }
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [])

  // ----- Send message -----
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming || !selectedProviderId) return

    const userId = selectedUserId || currentUserId || "me"

    const userMsg: ChatMessage = { id: generateId(), role: "user", content: trimmed, timestamp: Date.now() }
    const assistantMsg: ChatMessage = { id: generateId(), role: "assistant", content: "", timestamp: Date.now() }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput("")
    setStreaming(true)

    const history = messages.map((m) => ({ role: m.role, content: m.content }))

    try {
      const localKey = typeof window !== "undefined" ? localStorage.getItem("vitasync_api_key") : null
      const apiKey = localKey ?? (await getRuntimeDefaultKey())

      const controller = new AbortController()
      abortRef.current = controller

      const res = await fetch(`/api/v1/users/${userId}/chatbot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ message: trimmed, providerId: selectedProviderId, history }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }))
        throw new Error(errBody?.message ?? `API error: ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response stream")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine.startsWith("data: ")) continue
          const payload = trimmedLine.slice(6)
          if (payload === "[DONE]") continue

          try {
            const parsed = JSON.parse(payload)
            const token =
              parsed.choices?.[0]?.delta?.content ??
              parsed.content ??
              parsed.token ??
              parsed.text ??
              ""
            if (token) {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + token }
                }
                return updated
              })
            }
          } catch {
            // non-JSON data line – ignore
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: `⚠️ ${(err as Error).message || "Something went wrong. Please try again."}`,
          }
        }
        return updated
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [streaming, selectedProviderId, selectedUserId, messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const hasMessages = messages.length > 0
  const noProviders = !providersLoading && providers.length === 0

  // ----- Render -----
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col space-y-8">
      {/* Header */}
      <PageHeader
        title="AI Assistant"
        subtitle="Health insights powered by AI"
        actions={
          providers.length > 0 ? (
            <div className="relative" data-provider-dropdown>
              <button
                onClick={() => setProviderDropdownOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                {selectedProvider?.name ?? "Select provider"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${providerDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {providerDropdownOpen && (
                <div className="absolute right-0 z-50 mt-1 min-w-[200px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProviderId(p.id)
                        setProviderDropdownOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        p.id === selectedProviderId ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-auto text-[10px] text-gray-400">{p.model}</span>
                      {p.isDefault && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">default</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Chat area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto">
          {/* Loading providers */}
          {providersLoading && (
            <div className="flex h-full items-center justify-center p-8">
              <CardSkeleton count={1} />
            </div>
          )}

          {/* No providers state */}
          {noProviders && (
            <div className="flex h-full items-center justify-center">
              <Card className="max-w-sm">
                <EmptyState
                  icon={AlertCircle}
                  title="No AI Providers Configured"
                  description="Set up an AI provider in settings to start chatting with your health assistant."
                  action={{ label: "Go to Settings", href: "/dashboard/settings#ai-providers", icon: Settings }}
                />
              </Card>
            </div>
          )}

          {/* Empty state with suggestions */}
          {!providersLoading && !noProviders && !hasMessages && (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
                <MessageSquare className="h-8 w-8 text-white" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                What can I help you with?
              </h2>
              <p className="mb-6 max-w-md text-center text-sm text-gray-500 dark:text-gray-400">
                Ask me anything about your health data. I can analyze trends, spot patterns, and provide insights.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-xl border border-gray-200 bg-white/80 px-3.5 py-2 text-xs font-medium text-gray-700 backdrop-blur-xl transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
                  >
                    <Sparkles className="mr-1.5 inline h-3 w-3 text-indigo-400" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {hasMessages && (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                      <Bot className="h-4 w-4 text-indigo-500" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                        : "border border-gray-200 bg-white text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                    ) : msg.content ? (
                      <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                    ) : streaming && msg.id === messages[messages.length - 1]?.id ? (
                      /* Typing indicator */
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]" />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </CardContent>

        {/* Input bar */}
        {!noProviders && (
          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-6">
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={streaming ? "AI is thinking…" : "Ask about your health data…"}
                disabled={streaming}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-indigo-500"
              />
              <Button type="submit" icon={Send} disabled={streaming || !input.trim()} />
            </form>
          </div>
        )}
      </Card>
    </div>
  )
}
