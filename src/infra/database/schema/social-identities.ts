import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** Vínculo entre um usuário e sua conta em um provedor externo (Google/Facebook). */
export const socialIdentities = pgTable(
  'social_identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerUserId: varchar('provider_user_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Uma conta do provedor só pode estar ligada a UM usuário
    uniqueIndex('social_identities_provider_uid_unique').on(t.provider, t.providerUserId),
    index('social_identities_user_id_idx').on(t.userId),
  ],
);
