import { getDb, providerConnections, users } from "@biosync-io/db"
import type { User } from "@biosync-io/types"
import { and, eq } from "drizzle-orm"

export class UserService {
  private get db() {
    return getDb()
  }

  async findOrCreate(params: {
    workspaceId: string
    externalId: string
    email?: string
    displayName?: string
    metadata?: Record<string, unknown>
  }): Promise<User> {
    const existing = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.workspaceId, params.workspaceId), eq(users.externalId, params.externalId)),
      )
      .limit(1)

    if (existing[0]) return existing[0] as User

    const [created] = await this.db
      .insert(users)
      .values({
        workspaceId: params.workspaceId,
        externalId: params.externalId,
        email: params.email ?? null,
        displayName: params.displayName ?? null,
        metadata: params.metadata ?? {},
      })
      .returning()

    return created as User
  }

  async findById(id: string, workspaceId: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.workspaceId, workspaceId)))
      .limit(1)

    return (user as User) ?? null
  }

  async list(workspaceId: string, opts: { limit: number; offset: number }): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.workspaceId, workspaceId))
      .limit(opts.limit)
      .offset(opts.offset)
      .orderBy(users.createdAt)

    return rows as User[]
  }

  async update(
    id: string,
    workspaceId: string,
    patch: { email?: string; displayName?: string; metadata?: Record<string, unknown> },
  ): Promise<User | null> {
    const [updated] = await this.db
      .update(users)
      .set({
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.metadata !== undefined && { metadata: patch.metadata }),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.workspaceId, workspaceId)))
      .returning()

    return (updated as User) ?? null
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.workspaceId, workspaceId)))
      .returning({ id: users.id })

    return result.length > 0
  }
}
