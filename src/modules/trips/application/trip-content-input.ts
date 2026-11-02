import { ValidationError } from '../../../shared/errors/app-error.js';
import type { TripContent } from '../domain/trip.entity.js';
import { resolveDays, validatePeriod } from '../domain/trip-rules.js';
import { MAX_DESTINATIONS } from '../domain/trip.types.js';

/** Regras de negócio comuns a criar/editar (a forma dos dados já foi validada pelo zod na borda). */
export function assertValidContent(c: TripContent, today: string, opts: { checkPeriod?: boolean } = {}): TripContent {
  if (c.destinations.length > MAX_DESTINATIONS) throw new ValidationError(`No máximo ${MAX_DESTINATIONS} destinos`);
  const refs = new Set(c.destinations.map((d) => d.ref));
  if (refs.size !== c.destinations.length) throw new ValidationError('Destino repetido');
  if (c.likedPlaces.some((p) => !refs.has(p.destinationRef))) {
    throw new ValidationError('Lugar curtido pertence a um destino que não está na viagem');
  }
  if (c.dislikedPlaces.some((p) => !refs.has(p.destinationRef))) {
    throw new ValidationError('Lugar não curtido pertence a um destino que não está na viagem');
  }
  // Um card só pode ter UMA reação (curtir ou não curtir), nunca as duas
  const reacted = [...c.likedPlaces, ...c.dislikedPlaces].map((p) => p.ref);
  if (new Set(reacted).size !== reacted.length) throw new ValidationError('Lugar repetido ou com curtir e não curtir ao mesmo tempo');
  if (c.budgetUnlimited && c.budgetBrl !== null) throw new ValidationError('Orçamento "sem limite" não pode ter valor');
  if (c.period && opts.checkPeriod !== false) validatePeriod(c.period, today);
  // Com ida e volta, a duração é a do intervalo (como no app)
  const days = resolveDays(c.period, c.days);
  return { ...c, days };
}
