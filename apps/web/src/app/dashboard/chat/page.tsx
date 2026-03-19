"use client"

import { useMutation } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { chatApi, usersApi, type ChatMessage, type ChatResponse } from "../../../lib/api"
import {
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  Bot,
  User,
  Trash2,
  Heart,
  Moon,
  Footprints,
  Activity,
  Brain,
  AlertTriangle,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"

/* ── Suggested quick prompts ───────────────────────────────────────── */

const QUICK_PROMPTS = [
  { icon: Heart, label: "Heart health overview", prompt: "How is my heart health? Show my heart rate trends and any anomalies.", color: "text-rose-500", bg: "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20" },
  { icon: Moon, label: "Sleep analysis", prompt: "Analyze my sleep patterns. Am I getting enough quality sleep?", color: "text-indigo-500", bg: "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20" },
  { icon: Footprints, label: "Activity summary", prompt: "Summarize my recent activity and exercise performance.", color: "text-orange-500", bg: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20" },
  { icon: TrendingUp, label: "Health trends", prompt: "What are the key trends in my health data over the past week?", color: "text-emerald-500", bg: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20" },
  { icon: AlertTriangle, label: "Active anomalies", prompt: "Are there any anomalies or unusual patterns in my health data?", color: "text-amber-500", bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20" },
  { icon: Zap, label: "Overall health score", prompt: "What is my current health score breakdown? How can I improve?", color: "text-purple-500", bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20" },
]

/* ── Local message type for UI ─────────────────────────────────────── */

interface UIMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  context?: ChatResponse["context"]
}

/* ── Main Component ────────────────────────────────────────────────── */

export default function ChatPage() {
  const { selectedUserId } = useSelectedUser()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Fetch user info for display
  const { data: user } = useQuery({
    queryKey: ["user", selectedUserId],
    queryFn: () => (selectedUserId ? usersApi.get(selectedUserId) : null),
    enabled: !!selectedUserId,
  })

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Build conversation history for context
  const buildHistory = useCallback((): ChatMessage[] => {
    return messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }))
  }, [messages])

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedUserId) throw new Error("No user selected")
      return chatApi.send(selectedUserId, {
        message,
        history: buildHistory(),
      })
    },
    onSuccess: (data) => {
      const assistantMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.data.reply,
        timestamp: new Date().toISOString(),
        context: data.data.context,
      }
      setMessages((prev) => [...prev, assistantMsg])
    },
    onError: (err) => {
      const errorMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMsg])
    },
  })

  const handleSend = useCallback(
    (text?: string) => {
      const message = (text ?? input).trim()
      if (!message || chatMutation.isPending) return

      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput("")
      chatMutation.mutate(message)
    },
    [input, chatMutation],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  /* ── No user selected ────────────────────────────────────────── */

  if (!selectedUserId) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-green-500/20 blur-xl animate-pulse" />
          <div className="relative p-6 rounded-full bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
            <MessageSquare className="h-12 w-12 text-green-500" />
          </div>
        </div>
        <h2 className="text-xl font-semibold text-white/90">AI Health Chat</h2>
        <p className="text-sm text-white/50 text-center max-w-md">
          Select a user from the dropdown above to start asking questions about their health data.
        </p>
      </div>
    )
  }

  /* ── Chat UI ─────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-green-500/20 blur-md" />
            <div className="relative p-2 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
              <Bot className="h-5 w-5 text-green-400" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white/90 flex items-center gap-2">
              AI Health Assistant
              <Sparkles className="h-4 w-4 text-green-400" />
            </h1>
            <p className="text-xs text-white/40">
              Powered by your health data
              {user?.displayName ? ` · ${user.displayName}` : ""}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] border border-white/[0.06] transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
        {messages.length === 0 ? (
          /* Empty state with quick prompts */
          <div className="flex flex-col items-center justify-center h-full gap-8">
            <div className="text-center space-y-3">
              <div className="relative inline-block">
                <div className="absolute inset-0 rounded-full bg-green-500/15 blur-2xl" />
                <div className="relative p-5 rounded-full bg-gradient-to-br from-green-500/[0.08] to-emerald-500/[0.08] border border-green-500/15">
                  <Brain className="h-10 w-10 text-green-400" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-white/80 mt-4">
                Ask me anything about your health
              </h2>
              <p className="text-sm text-white/40 max-w-md">
                I analyze your health metrics, detect patterns, and provide personalized insights grounded in your real data.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => handleSend(qp.prompt)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${qp.bg}`}
                >
                  <qp.icon className={`h-5 w-5 shrink-0 ${qp.color}`} />
                  <span className="text-sm text-white/70">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 mt-1">
                  <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <Bot className="h-4 w-4 text-green-400" />
                  </div>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-green-500/15 border border-green-500/20 text-white/90"
                    : "bg-white/[0.03] border border-white/[0.06] text-white/80"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white/90 [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white/80 [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_li]:text-sm [&_table]:text-xs [&_th]:text-white/60 [&_td]:text-white/70 [&_strong]:text-white/90 [&_code]:text-green-400 [&_code]:bg-green-500/10 [&_code]:px-1 [&_code]:rounded">
                    <MarkdownContent content={msg.content} />
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
                {msg.context && (
                  <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center gap-3 text-[10px] text-white/30">
                    <span>{msg.context.dataPoints} data points analyzed</span>
                    <span>·</span>
                    <span>{msg.context.metricsUsed.length} metric{msg.context.metricsUsed.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 mt-1">
                  <div className="p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.06]">
                    <User className="h-4 w-4 text-white/50" />
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {chatMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="shrink-0 mt-1">
              <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <Bot className="h-4 w-4 text-green-400" />
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-green-400 animate-spin" />
                <span className="text-sm text-white/40">Analyzing your health data...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                // Auto-resize
                e.target.style.height = "auto"
                e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your health data..."
              className="w-full resize-none rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.12] focus:border-green-500/30 focus:ring-1 focus:ring-green-500/20 px-4 py-3 pr-12 text-sm text-white/90 placeholder:text-white/30 outline-none transition-all"
            />
            <button
              type="button"
              title="Send message"
              onClick={() => handleSend()}
              disabled={!input.trim() || chatMutation.isPending}
              className="absolute right-2 bottom-2 p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-white/25 text-center mt-2">
          Responses are generated from your actual health data using VitaSync&apos;s analytics engine
        </p>
      </div>
    </div>
  )
}

/* ── Simple Markdown renderer ──────────────────────────────────────── */

function MarkdownContent({ content }: { content: string }) {
  // Sanitize: strip any HTML tags from the source content first
  const sanitized = content.replace(/<[^>]*>/g, "")

  // Convert markdown to simple HTML for rendering
  const html = sanitized
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Tables — convert markdown table rows
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map((c: string) => c.trim())
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return '' // skip separator
      return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join('')}</tr>`
    })
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Paragraphs (lines that aren't already HTML)
    .replace(/^(?!<[hltd]|$)(.+)$/gm, '<p>$1</p>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Wrap consecutive <tr> in <table>
    .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table>${match}</table>`)

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
