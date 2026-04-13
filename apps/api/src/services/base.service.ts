import { getDb } from "@biosync-io/db"
import { AppError } from "@biosync-io/types"
import { and, eq } from "drizzle-orm"
import type { PgTableWithColumns } from "drizzle-orm/pg-core"

/**
 * Base class for data services that interact with the database.
 *
 * Provides:
 * - Shared `db` accessor (eliminating `private get db()` in every service)
 * - Common `getOrThrow` helper for not-found checking
 * - Common `deleteOrThrow` helper
 */
export abstract class BaseService {
  protected get db() {
    return getDb()
  }

  /**
   * Fetch a single row by id + userId, throw AppError.notFound if missing.
   */
  protected async getOrThrow<T>(
    table: PgTableWithColumns<any>,
    idCol: any,
    userIdCol: any,
    id: string,
    userId: string,
    resourceName: string,
  ): Promise<T> {
    const [row] = await this.db
      .select()
      .from(table)
      .where(and(eq(idCol, id), eq(userIdCol, userId)))
      .limit(1)

    if (!row) throw AppError.notFound(resourceName, id)
    return row as T
  }

  /**
   * Delete a single row by id + userId, throw AppError.notFound if missing.
   */
  protected async deleteOrThrow(
    table: PgTableWithColumns<any>,
    idCol: any,
    userIdCol: any,
    id: string,
    userId: string,
    resourceName: string,
  ): Promise<void> {
    const result = await this.db
      .delete(table)
      .where(and(eq(idCol, id), eq(userIdCol, userId)))
      .returning({ id: idCol })

    if (result.length === 0) throw AppError.notFound(resourceName, id)
  }
}
