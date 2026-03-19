import { buildLLMContext } from "@biosync-io/analytics"
import { getDb, healthMetrics, events } from "@biosync-io/db"
import { and, eq, gte, desc, sql } from "drizzle-orm"

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
  timestamp: string
}

export interface ChatRequest {
  message: string
  history?: ChatMessage[] | undefined
}

export interface ChatResponse {
  reply: string
  context: {
    metricsUsed: string[]
    dataPoints: number
  }
}

/**
 * AI Chat Service — builds grounded health responses using the user's
 * biological context (baselines, trends, anomalies, correlations, scores).
 *
 * Architecture: The service fetches real health data via buildLLMContext
 * and the database, then constructs a prompt-grounded response. In MCP
 * mode, an external LLM calls VitaSync tools directly. Here, the API
 * provides a self-contained chat endpoint that gathers context and
 * produces structured markdown answers.
 */
export class ChatService {
  private get db() {
    return getDb()
  }

  async processMessage(
    userId: string,
    body: ChatRequest,
  ): Promise<ChatResponse> {
    const { message, history = [] } = body

    // 1. Build the full biological context for grounding
    const bioContext = await buildLLMContext(userId)

    // 2. Identify which data domains the question targets
    const queryLower = message.toLowerCase()
    const domains = this.classifyDomains(queryLower)

    // 3. Fetch targeted data based on the question
    const supplementary = await this.fetchSupplementaryData(userId, domains, queryLower)

    // 4. Build a grounded answer from real data
    const reply = this.buildGroundedResponse(message, bioContext, supplementary, domains, history)

    return {
      reply,
      context: {
        metricsUsed: domains,
        dataPoints: supplementary.totalDataPoints,
      },
    }
  }

  /**
   * Classify which health domains the user question targets.
   */
  private classifyDomains(query: string): string[] {
    const domainKeywords: Record<string, string[]> = {
      sleep: ["sleep", "rest", "nap", "bedtime", "wake", "rem", "deep sleep", "insomnia"],
      heart_rate: ["heart rate", "hr", "bpm", "pulse", "resting heart", "cardio"],
      steps: ["step", "walk", "walking", "movement", "pedometer"],
      weight: ["weight", "body weight", "mass", "bmi", "body fat"],
      calories: ["calorie", "kcal", "energy", "burn", "intake"],
      activity: ["activity", "exercise", "workout", "training", "run", "running", "cycling", "swim"],
      blood_oxygen: ["spo2", "oxygen", "blood oxygen", "saturation"],
      heart_rate_variability: ["hrv", "heart rate variability", "variability"],
      mood: ["mood", "feeling", "emotion", "stress", "anxiety", "happy"],
      nutrition: ["nutrition", "food", "diet", "protein", "carb", "fat", "meal"],
      recovery: ["recovery", "strain", "readiness", "fatigue"],
      anomaly: ["anomaly", "anomalies", "unusual", "abnormal", "spike", "drop", "alert"],
      correlation: ["correlation", "correlate", "relationship", "linked", "affect", "impact"],
      score: ["score", "health score", "overall", "rating"],
      trend: ["trend", "trending", "change", "improving", "worsening", "over time"],
    }

    const matched = new Set<string>()
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((kw) => query.includes(kw))) {
        matched.add(domain)
      }
    }

    // General health question — provide overview
    if (matched.size === 0) {
      matched.add("score")
      matched.add("trend")
    }

    return Array.from(matched)
  }

  /**
   * Fetch supplementary data from the database for specific domains.
   */
  private async fetchSupplementaryData(
    userId: string,
    domains: string[],
    _query: string,
  ): Promise<{ records: Record<string, unknown[]>; totalDataPoints: number }> {
    const records: Record<string, unknown[]> = {}
    let totalDataPoints = 0
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Fetch recent metrics for relevant domains
    const metricDomains = domains.filter((d) =>
      ["sleep", "heart_rate", "steps", "weight", "calories", "blood_oxygen", "heart_rate_variability"].includes(d),
    )

    if (metricDomains.length > 0) {
      for (const domain of metricDomains) {
        const rows = await this.db
          .select({
            metricType: healthMetrics.metricType,
            value: healthMetrics.value,
            unit: healthMetrics.unit,
            recordedAt: healthMetrics.recordedAt,
          })
          .from(healthMetrics)
          .where(
            and(
              eq(healthMetrics.userId, userId),
              eq(healthMetrics.metricType, domain),
              gte(healthMetrics.recordedAt, sevenDaysAgo),
            ),
          )
          .orderBy(desc(healthMetrics.recordedAt))
          .limit(50)

        records[domain] = rows
        totalDataPoints += rows.length
      }
    }

    // Fetch recent events for activity-related queries
    if (domains.includes("activity")) {
      const rows = await this.db
        .select({
          eventType: events.eventType,
          activityType: events.activityType,
          title: events.title,
          startedAt: events.startedAt,
          durationSeconds: events.durationSeconds,
          caloriesKcal: events.caloriesKcal,
          avgHeartRate: events.avgHeartRate,
        })
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            gte(events.startedAt, sevenDaysAgo),
          ),
        )
        .orderBy(desc(events.startedAt))
        .limit(20)

      records.events = rows
      totalDataPoints += rows.length
    }

    return { records, totalDataPoints }
  }

  /**
   * Build a data-grounded response using the biological context and
   * supplementary data. This produces a structured markdown answer
   * with real numbers from the user's health data.
   */
  private buildGroundedResponse(
    question: string,
    bioContext: Awaited<ReturnType<typeof buildLLMContext>>,
    supplementary: { records: Record<string, unknown[]>; totalDataPoints: number },
    domains: string[],
    _history: ChatMessage[],
  ): string {
    const parts: string[] = []

    // Health score overview
    if (domains.includes("score") && bioContext.healthScore) {
      const hs = bioContext.healthScore
      parts.push(
        `## Health Score Overview\n` +
        `Your current overall health score is **${hs.overall}/100**.\n` +
        `| Category | Score |\n|----------|-------|\n` +
        `| Sleep | ${hs.sleep ?? "N/A"} |\n` +
        `| Activity | ${hs.activity ?? "N/A"} |\n` +
        `| Cardio | ${hs.cardio ?? "N/A"} |\n` +
        `| Recovery | ${hs.recovery ?? "N/A"} |`,
      )
    }

    // Baselines for requested metrics
    for (const domain of domains) {
      const baseline = bioContext.baselines[domain]
      if (baseline) {
        parts.push(
          `### ${domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (30-day baseline)\n` +
          `- **Average**: ${baseline.mean} ${baseline.unit}\n` +
          `- **Std. Deviation**: ±${baseline.stddev} ${baseline.unit}\n` +
          `- **Data points**: ${baseline.samples}`,
        )
      }
    }

    // Trends
    for (const domain of domains) {
      const trend = bioContext.recentTrends[domain]
      if (trend) {
        const arrow = trend.direction === "rising" ? "📈" : trend.direction === "falling" ? "📉" : "➡️"
        parts.push(
          `### ${domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Trend\n` +
          `${arrow} **${trend.direction}** (${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}% week-over-week)`,
        )
      }
    }

    // Anomalies
    if (domains.includes("anomaly") && bioContext.activeAnomalies.length > 0) {
      const items = bioContext.activeAnomalies.slice(0, 5).map(
        (a) => `- **${a.severity.toUpperCase()}**: ${a.title} (${a.metricType}, detected ${new Date(a.detectedAt).toLocaleDateString()})`,
      )
      parts.push(`### Active Anomalies\n${items.join("\n")}`)
    }

    // Correlations
    if (domains.includes("correlation") && bioContext.topCorrelations.length > 0) {
      const items = bioContext.topCorrelations.slice(0, 5).map(
        (c) => `- **${c.metricA} ↔ ${c.metricB}**: r=${c.pearsonR.toFixed(2)} — ${c.description}`,
      )
      parts.push(`### Metric Correlations\n${items.join("\n")}`)
    }

    // Recent data points
    for (const domain of domains) {
      const data = supplementary.records[domain]
      if (Array.isArray(data) && data.length > 0) {
        const recentValues = data.slice(0, 7) as Array<{ value: number; unit: string; recordedAt: Date }>
        const vals = recentValues
          .filter((r) => r.value != null)
          .map((r) => `${r.value} ${r.unit ?? ""}`.trim())
        if (vals.length > 0) {
          parts.push(
            `### Recent ${domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Readings\n` +
            `Last ${vals.length} values: ${vals.join(", ")}`,
          )
        }
      }
    }

    // Recent activity events
    const eventRecords = supplementary.records.events as Array<{
      title: string; activityType: string; durationSeconds: number; caloriesKcal: number; startedAt: Date
    }> | undefined
    if (eventRecords && eventRecords.length > 0) {
      const items = eventRecords.slice(0, 5).map((e) => {
        const dur = e.durationSeconds ? `${Math.round(e.durationSeconds / 60)} min` : ""
        const cal = e.caloriesKcal ? `${Math.round(e.caloriesKcal)} kcal` : ""
        return `- **${e.title || e.activityType}** — ${[dur, cal].filter(Boolean).join(", ")} (${new Date(e.startedAt).toLocaleDateString()})`
      })
      parts.push(`### Recent Activity\n${items.join("\n")}`)
    }

    // Summary from context if available
    if ("naturalLanguageSummary" in bioContext && bioContext.naturalLanguageSummary) {
      parts.push(`### AI Summary\n${String(bioContext.naturalLanguageSummary)}`)
    }

    if (parts.length === 0) {
      return (
        "I don't have enough data to answer that question specifically. " +
        "Try asking about your **sleep patterns**, **heart rate trends**, " +
        "**activity levels**, **health scores**, or any **anomalies** detected in your data."
      )
    }

    return `Based on your health data, here's what I found for your question: *"${question}"*\n\n${parts.join("\n\n")}`
  }
}
