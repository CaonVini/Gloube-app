import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Viagem. Origem/destinos/lugares/roteiro ficam em jsonb: são sempre lidos e gravados junto com a viagem
 * (uma linha, sem JOIN) e a posição no array É a ordem escolhida pelo usuário.
 * Campos opcionais são nulos porque o rascunho pode estar incompleto.
 */
export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('rascunho'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    origin: varchar('origin', { length: 120 }),
    climate: varchar('climate', { length: 20 }),
    reach: varchar('reach', { length: 20 }),
    companion: varchar('companion', { length: 20 }),
    experiences: text('experiences').array().notNull().default(sql`'{}'::text[]`),
    needs: text('needs').array().notNull().default(sql`'{}'::text[]`),
    destinations: jsonb('destinations').notNull().default(sql`'[]'::jsonb`),
    likedPlaces: jsonb('liked_places').notNull().default(sql`'[]'::jsonb`),

    periodMode: varchar('period_mode', { length: 12 }),
    periodMonth: smallint('period_month'),
    periodYear: smallint('period_year'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    days: integer('days'),
    // Reais por pessoa. null = sem limite definido
    budgetBrl: numeric('budget_brl', { precision: 12, scale: 2 }),

    itinerary: jsonb('itinerary'),
    itineraryRevision: integer('itinerary_revision').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Listagem do usuário: filtra por dono e ordena por atividade recente (keyset: updated_at desc, id desc)
    index('trips_user_updated_idx').on(t.userId, t.updatedAt.desc(), t.id.desc()),
    // Sincronização automática de status por data só olha viagens em planejada/em andamento
    index('trips_user_active_status_idx').on(t.userId).where(sql`status in ('planejada','em_andamento')`),
    check('trips_status_chk', sql`${t.status} in ('rascunho','planejada','em_andamento','concluida','cancelada')`),
    check('trips_budget_chk', sql`${t.budgetBrl} is null or ${t.budgetBrl} >= 0`),
    check('trips_days_chk', sql`${t.days} is null or ${t.days} >= 1`),
  ],
);

export type TripRow = typeof trips.$inferSelect;
