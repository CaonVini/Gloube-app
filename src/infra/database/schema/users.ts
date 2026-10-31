import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';

export interface AddressData {
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    // E-mail é sempre normalizado (trim + lowercase) antes de chegar aqui
    email: varchar('email', { length: 254 }).notNull(),
    // Telefone normalizado para E.164 (ex.: +5511999998888)
    phone: varchar('phone', { length: 20 }),
    address: jsonb('address').$type<AddressData>(),
    // Nulo para contas criadas só via Google/Facebook (sem senha)
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
