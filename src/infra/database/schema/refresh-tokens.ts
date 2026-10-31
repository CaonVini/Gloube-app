import { pgTable, uuid, char, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Guardamos apenas o SHA-256 do refresh token (nunca o token em claro):
 * um vazamento do banco não permite sequestrar sessões.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_unique').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
  ],
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
