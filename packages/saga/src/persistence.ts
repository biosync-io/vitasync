import type { SagaExecution } from './types.js'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Persistence contract for saga executions.
 *
 * Implementations store and retrieve saga state so that long-running sagas
 * can survive process restarts and be inspected via admin APIs.
 */
export interface SagaPersistence {
  /** Upsert an execution (insert on first call, update thereafter). */
  save(execution: SagaExecution): Promise<void>

  /** Load an execution by its unique ID. Returns null if not found. */
  load(executionId: string): Promise<SagaExecution | null>

  /** List executions filtered by status (e.g. "running", "failed"). */
  listByStatus(status: string, limit?: number): Promise<SagaExecution[]>

  /** List executions for a specific saga definition name. */
  listBySaga(sagaName: string, limit?: number): Promise<SagaExecution[]>
}

// ---------------------------------------------------------------------------
// PostgreSQL implementation
// ---------------------------------------------------------------------------

/**
 * Minimal interface for a Drizzle-like SQL client.
 * We accept anything that exposes an `execute(sql)` method so the persistence
 * layer is not tightly coupled to a concrete Drizzle import.
 */
export interface SqlClient {
  execute(query: { sql: string; params: unknown[] }): Promise<{ rows: unknown[] }>
}

/**
 * PostgreSQL-backed persistence using raw SQL via a Drizzle sql client.
 *
 * The table schema is expected to already exist (see the accompanying
 * migration file `0011_add_saga_executions.sql`).
 */
export class PostgresSagaPersistence implements SagaPersistence {
  constructor(private readonly db: SqlClient) {}

  async save(execution: SagaExecution): Promise<void> {
    await this.db.execute({
      sql: `
        INSERT INTO saga_executions (
          id, saga_name, status, context, current_step,
          step_results, started_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          status       = EXCLUDED.status,
          context      = EXCLUDED.context,
          current_step = EXCLUDED.current_step,
          step_results = EXCLUDED.step_results,
          completed_at = EXCLUDED.completed_at,
          updated_at   = now()
      `,
      params: [
        execution.id,
        execution.sagaName,
        execution.status,
        JSON.stringify(execution.context),
        execution.currentStep,
        JSON.stringify(execution.stepResults),
        execution.startedAt,
        execution.completedAt ?? null,
      ],
    })
  }

  async load(executionId: string): Promise<SagaExecution | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM saga_executions WHERE id = $1 LIMIT 1`,
      params: [executionId],
    })

    const row = result.rows[0] as Record<string, unknown> | undefined
    if (!row) return null
    return rowToExecution(row)
  }

  async listByStatus(status: string, limit = 50): Promise<SagaExecution[]> {
    const result = await this.db.execute({
      sql: `SELECT * FROM saga_executions WHERE status = $1 ORDER BY started_at DESC LIMIT $2`,
      params: [status, limit],
    })

    return (result.rows as Record<string, unknown>[]).map(rowToExecution)
  }

  async listBySaga(sagaName: string, limit = 50): Promise<SagaExecution[]> {
    const result = await this.db.execute({
      sql: `SELECT * FROM saga_executions WHERE saga_name = $1 ORDER BY started_at DESC LIMIT $2`,
      params: [sagaName, limit],
    })

    return (result.rows as Record<string, unknown>[]).map(rowToExecution)
  }
}

// ---------------------------------------------------------------------------
// Row → domain mapper
// ---------------------------------------------------------------------------

function rowToExecution(row: Record<string, unknown>): SagaExecution {
  const completedAt = (row.completed_at ?? row.completedAt) as string | null | undefined
  const execution: SagaExecution = {
    id: row.id as string,
    sagaName: (row.saga_name ?? row.sagaName) as string,
    status: row.status as SagaExecution['status'],
    context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context,
    currentStep: Number(row.current_step ?? row.currentStep ?? 0),
    stepResults:
      typeof row.step_results === 'string'
        ? JSON.parse(row.step_results)
        : (row.step_results ?? row.stepResults ?? []),
    startedAt: (row.started_at ?? row.startedAt) as string,
  }
  if (completedAt != null) {
    execution.completedAt = completedAt
  }
  return execution
}
