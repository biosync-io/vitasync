import { sql } from "drizzle-orm"
import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"

/**
 * AI provider configurations.
 *
 * Users can configure multiple LLM providers (OpenAI, Anthropic, Ollama, etc.)
 * and switch between them in the chat interface. API keys are stored encrypted
 * using AES-256-GCM via the application-layer encrypt()/decrypt() helpers.
 */
export const aiProviders = pgTable("ai_providers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  /** Human-friendly label, e.g. "GPT-4o Production" */
  name: varchar("name", { length: 255 }).notNull(),
  /** Provider type: openai, anthropic, ollama, azure-openai, custom */
  providerType: varchar("provider_type", { length: 50 }).notNull(),
  /** Model identifier, e.g. "gpt-4o", "claude-sonnet-4-20250514", "llama3" */
  model: varchar("model", { length: 100 }).notNull(),
  /** AES-256-GCM encrypted API key (null for Ollama / keyless providers) */
  encryptedApiKey: text("encrypted_api_key"),
  /** Base URL override — required for Ollama, optional for others */
  baseUrl: varchar("base_url", { length: 500 }),
  /** Whether this provider is the current default */
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type AiProvider = typeof aiProviders.$inferSelect
export type AiProviderInsert = typeof aiProviders.$inferInsert
