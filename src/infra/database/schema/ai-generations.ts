import { bigint, boolean, index, integer, jsonb, numeric, pgTable, pgView, smallint, timestamp, date, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { trips } from './trips.js';

/**
 * Fila + livro-caixa de custo da IA. Constraints, trigger (histórico imutável), índice único
 * "uma geração ativa por viagem" e views vivem na migration 0004 (SQL à mão).
 */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 12 }).notNull().default('queued'),
    model: varchar('model', { length: 80 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 40 }).notNull(),
    input: jsonb('input').notNull(),
    result: jsonb('result'),
    applied: boolean('applied').notNull().default(false),
    attempts: smallint('attempts').notNull().default(0),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    durationMs: integer('duration_ms'),
    errorCode: varchar('error_code', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('ai_generations_user_idx').on(t.userId, t.createdAt.desc())],
);

export type AiGenerationRow = typeof aiGenerations.$inferSelect;

export const aiCostDaily = pgView('ai_cost_daily', {
  day: date('day', { mode: 'string' }).notNull(),
  model: varchar('model').notNull(),
  promptVersion: varchar('prompt_version').notNull(),
  generations: integer('generations').notNull(),
  succeeded: integer('succeeded').notNull(),
  failed: integer('failed').notNull(),
  inputTokens: bigint('input_tokens', { mode: 'number' }).notNull(),
  outputTokens: bigint('output_tokens', { mode: 'number' }).notNull(),
  costUsd: numeric('cost_usd').notNull(),
  avgDurationMs: integer('avg_duration_ms').notNull(),
}).existing();

export const aiCostByUser = pgView('ai_cost_by_user', {
  userId: uuid('user_id').notNull(),
  generations: integer('generations').notNull(),
  inputTokens: bigint('input_tokens', { mode: 'number' }).notNull(),
  outputTokens: bigint('output_tokens', { mode: 'number' }).notNull(),
  costUsd: numeric('cost_usd').notNull(),
  lastGenerationAt: timestamp('last_generation_at', { withTimezone: true }),
}).existing();
