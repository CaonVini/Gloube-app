import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MAX_ITEMS_PER_DAY, type Itinerary } from '../../trips/domain/trip.types.js';

const outputSchema = z.object({
  days: z.array(
    z.object({
      title: z.string().trim().min(1).max(120),
      destinationRef: z.string().nullable().optional(),
      items: z.array(z.object({ text: z.string().trim().min(1).max(300), placeRef: z.string().nullable().optional() })).min(1).max(MAX_ITEMS_PER_DAY),
    }),
  ).min(1),
});

/**
 * Valida a saída da IA como entrada NÃO CONFIÁVEL: formato, tamanhos e contagem exata de dias.
 * Referências inventadas viram `null` (não quebram a edição depois). Ids são gerados aqui, nunca pela IA.
 * Devolve null se a saída for inutilizável.
 */
export function parseItineraryOutput(
  text: string,
  expected: { totalDays: number; destinationRefs: ReadonlySet<string>; placeRefs: ReadonlySet<string> },
): Itinerary | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success || parsed.data.days.length !== expected.totalDays) return null;

  return {
    days: parsed.data.days.map((d) => ({
      id: randomUUID(),
      title: d.title,
      destinationRef: d.destinationRef && expected.destinationRefs.has(d.destinationRef) ? d.destinationRef : null,
      items: d.items.map((i) => ({
        id: randomUUID(),
        text: i.text,
        placeRef: i.placeRef && expected.placeRefs.has(i.placeRef) ? i.placeRef : null,
      })),
    })),
  };
}
