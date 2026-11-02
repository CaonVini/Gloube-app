import { z } from 'zod';
import {
  CLIMATES, COMPANIONS, EXPERIENCES, MAX_DESTINATIONS, NEEDS, PLACE_KINDS, REACHES, TRIP_STATUSES,
} from '../domain/trip.types.js';

const text = (max: number) => z.string().trim().min(1).max(max);

const destinationSchema = z.object({ ref: text(100), city: text(100), country: text(100) }).strict();
const likedPlaceSchema = z
  .object({ ref: text(150), name: text(150), kind: z.enum(PLACE_KINDS), destinationRef: text(100) })
  .strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');

const periodSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('indefinido') }).strict(),
  z.object({ mode: z.literal('mes'), month: z.number().int().min(1).max(12), year: z.number().int().min(2000).max(9999) }).strict(),
  z.object({ mode: z.literal('definidas'), startDate: isoDate, endDate: isoDate.nullable().default(null) }).strict(),
]);

const uniqueArray = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max).refine((a) => new Set(a).size === a.length, 'Itens repetidos');

/** Todos opcionais: rascunho pode estar incompleto. `strict` rejeita campos desconhecidos (ex.: tentar mandar `status`/`userId`). */
export const tripContentShape = {
  origin: text(120).nullable(),
  climate: z.enum(CLIMATES).nullable(),
  reach: z.enum(REACHES).nullable(),
  companion: z.enum(COMPANIONS).nullable(),
  experiences: uniqueArray(z.enum(EXPERIENCES), EXPERIENCES.length),
  needs: uniqueArray(z.enum(NEEDS), NEEDS.length),
  destinations: z.array(destinationSchema).max(MAX_DESTINATIONS, `No máximo ${MAX_DESTINATIONS} destinos`),
  likedPlaces: z.array(likedPlaceSchema).max(MAX_DESTINATIONS * 50),
  period: periodSchema.nullable(),
  // Sem limite de negócio; só inteiro positivo dentro do int4 do banco
  days: z.number().int().min(1).max(2_147_483_647).nullable(),
  // Reais por pessoa, 2 casas; null = sem limite definido. Teto = capacidade da coluna numeric(12,2)
  budgetBrl: z.number().min(0).max(9_999_999_999).multipleOf(0.01).nullable(),
};

export const createTripBodySchema = z.object(tripContentShape).partial().strict();
export const updateTripBodySchema = createTripBodySchema;

export const tripIdParamsSchema = z.object({ id: z.uuid() });

export const listTripsQuerySchema = z.object({
  status: z.enum(TRIP_STATUSES).optional(),
  archived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(10).max(200).optional(),
});
