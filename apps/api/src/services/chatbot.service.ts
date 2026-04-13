import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"
import { aiProviders } from "@biosync-io/db"
import { BaseService } from "./base.service.js"
import { AppError } from "@biosync-io/types"
import { decrypt } from "../lib/crypto.js"
import { eq } from "drizzle-orm"
import { HealthDataService } from "./health-data.service.js"
import { HealthScoreService } from "./health-score.service.js"
import { SleepAnalysisService } from "./sleep-analysis.service.js"

const encryptionKey = process.env.ENCRYPTION_KEY ?? ""

const healthDataService = new HealthDataService()
const healthScoreService = new HealthScoreService()
const sleepAnalysisService = new SleepAnalysisService()

function buildSystemPrompt(
  healthSummary: unknown,
  healthScores: unknown,
  sleepAnalysis: unknown,
): string {
  return `You are VitaSync Health AI, a knowledgeable health data analyst. You have access to the user's health data and can answer questions about their sleep, activity, heart rate, HRV, body metrics, and more.

Here is the user's current health data summary:
${JSON.stringify(healthSummary, null, 2)}

Recent health scores:
${JSON.stringify(healthScores, null, 2)}

Recent sleep analysis:
${JSON.stringify(sleepAnalysis, null, 2)}

Answer questions clearly and concisely. Reference specific data points when available. Provide actionable insights. If you don't have enough data to answer, say so.`
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export class ChatbotService extends BaseService {
  async *streamChat(params: {
    providerId: string
    userId: string
    message: string
    history?: ChatMessage[]
  }): AsyncGenerator<string> {
    // 1. Load provider config
    const [provider] = await this.db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, params.providerId))
      .limit(1)

    if (!provider) {
      throw AppError.notFound("AI provider")
    }

    let apiKey: string | null = null
    if (provider.encryptedApiKey) {
      apiKey = decrypt(provider.encryptedApiKey, encryptionKey)
    }

    // 2. Fetch user health context
    const [healthSummary, recentScores, sleepAnalysis] = await Promise.all([
      healthDataService.summary(params.userId),
      healthScoreService.getHistory(params.userId, { limit: 7 }),
      sleepAnalysisService.getSleepQualityReport(params.userId, 14).catch(() => null),
    ])

    // 3. Build system prompt
    const systemPrompt = buildSystemPrompt(healthSummary, recentScores, sleepAnalysis)

    // 4. Build message history
    const history: ChatMessage[] = params.history ?? []
    const messages: ChatMessage[] = [...history, { role: "user" as const, content: params.message }]

    // 5. Stream based on provider type
    switch (provider.providerType) {
      case "openai":
        yield* this.streamOpenAI(apiKey!, provider.baseUrl, provider.model, systemPrompt, messages)
        break
      case "anthropic":
        yield* this.streamAnthropic(apiKey!, provider.model, systemPrompt, messages)
        break
      case "ollama":
        yield* this.streamOllama(
          provider.baseUrl ?? "http://localhost:11434",
          provider.model,
          systemPrompt,
          messages,
        )
        break
      default:
        throw AppError.unsupported(`Unsupported provider type: ${provider.providerType}`)
    }
  }

  private async *streamOpenAI(
    apiKey: string,
    baseUrl: string | null,
    model: string,
    systemPrompt: string,
    messages: ChatMessage[],
  ): AsyncGenerator<string> {
    const openai = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    })

    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  }

  private async *streamAnthropic(
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: ChatMessage[],
  ): AsyncGenerator<string> {
    const anthropic = new Anthropic({ apiKey })

    const stream = anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text
      }
    }
  }

  private async *streamOllama(
    baseUrl: string,
    model: string,
    systemPrompt: string,
    messages: ChatMessage[],
  ): AsyncGenerator<string> {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    })

    if (!response.ok) {
      throw AppError.providerError(`Ollama returned ${response.status}: ${response.statusText}`)
    }

    if (!response.body) {
      throw AppError.providerError("No response body from Ollama")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
          if (parsed.message?.content) {
            yield parsed.message.content
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer) as { message?: { content?: string } }
        if (parsed.message?.content) {
          yield parsed.message.content
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
}
