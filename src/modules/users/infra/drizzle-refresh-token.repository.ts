import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../../infra/database/client.js';
import { refreshTokens } from '../../../infra/database/schema/index.js';
import { RefreshToken } from '../domain/refresh-token.entity.js';
import type { RefreshTokenRepository } from '../domain/refresh-token.repository.js';

export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: Database) {}

  async create(token: RefreshToken): Promise<void> {
    await this.db.insert(refreshTokens).values({
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      createdAt: token.createdAt,
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row ? RefreshToken.restore(row) : null;
  }

  async revoke(id: string): Promise<boolean> {
    // UPDATE ... WHERE revoked_at IS NULL é atômico no Postgres:
    // só uma transação concorrente consegue afetar a linha.
    const updated = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return updated.length > 0;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
