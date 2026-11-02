import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../shared/errors/app-error.js';
import type { TripContent } from './trip.entity.js';
import { resolveDays } from './trip-rules.js';
import {
  MAX_ITINERARY_DAYS, type Experience, type Itinerary, type ItineraryDay, type LikedPlace,
} from './trip.types.js';

/** Port de `buildDays`/`distributePlaces` do app (determinístico, sem IA e sem rede). */
const ACTIVITIES: Record<Experience, readonly string[]> = {
  praia: ['Manhã na praia mais tranquila da região', 'Passeio de barco no fim da tarde', 'Dia de descanso e culinária local'],
  montanha: ['Trilha leve até um mirante', 'Visita a um vilarejo de altitude', 'Café da tarde com vista panorâmica'],
  cidade: ['Centro histórico a pé', 'Museus, mercados e cafés', 'Jantar típico e passeio noturno'],
  natureza: ['Cachoeiras e áreas verdes', 'Caminhada guiada pela natureza', 'Dia ao ar livre, sem pressa'],
  neve: ['Primeiro contato com a neve e as paisagens', 'Atividade na neve para o seu ritmo', 'Tarde de refúgio com chocolate quente'],
};
const FALLBACK_EXPERIENCE: Experience = 'cidade';

function distributePlaces(places: readonly LikedPlace[], totalDays: number): LikedPlace[][] {
  const out: LikedPlace[][] = Array.from({ length: totalDays }, () => []);
  if (places.length === 0) return out;
  // Chegada e volta ficam livres; com 1 ou 2 dias usa-se tudo o que existe
  const slots = totalDays === 1 ? [0] : totalDays === 2 ? [0, 1] : Array.from({ length: totalDays - 2 }, (_, i) => i + 1);
  places.forEach((p, i) => out[slots[Math.floor((i * slots.length) / places.length)]!]!.push(p));
  return out;
}

function placeTitle(ps: readonly LikedPlace[]): string {
  if (ps.length === 1) return ps[0]!.name;
  if (ps.length === 2) return `${ps[0]!.name} e ${ps[1]!.name}`;
  return `${ps[0]!.name} e mais ${ps.length - 1}`;
}

const item = (text: string, placeRef: string | null = null) => ({ id: randomUUID(), text, placeRef });

function buildBlock(total: number, exps: readonly Experience[], places: readonly LikedPlace[], destinationRef: string): ItineraryDay[] {
  const perDay = distributePlaces(places, total);
  const base = exps.length > 0 ? exps : [FALLBACK_EXPERIENCE];
  return Array.from({ length: total }, (_, i) => {
    const day = i + 1;
    const mine = perDay[i]!.map((p) => item(`Visita: ${p.name}`, p.ref));
    const mk = (title: string, items: ItineraryDay['items']): ItineraryDay => ({ id: randomUUID(), title, destinationRef, items });
    if (day === 1) return mk('Chegada e primeiras impressões', [item('Check-in e descanso da viagem'), ...(mine.length ? mine : [item('Caminhada leve para conhecer os arredores')])]);
    if (day === total) return mk('Últimos passeios e volta', [...mine, item('Manhã livre para lembranças e compras'), item('Traslado e voo de volta')]);
    if (mine.length > 0) return mk(placeTitle(perDay[i]!), mine);
    const exp = base[(day - 2) % base.length]!;
    const list = ACTIVITIES[exp];
    const first = list[(day - 2) % list.length]!;
    const second = list[(day - 1) % list.length]!;
    return mk(`Dia de ${exp}`, first === second ? [item(first)] : [item(first), item(second)]);
  });
}

/**
 * Gera o roteiro inicial. Com vários destinos, os dias são divididos igualmente na ordem escolhida
 * (o resto vai para os primeiros) e cada trecho recebe os lugares curtidos do próprio destino.
 * É só um ponto de partida: o usuário pode editar tudo depois.
 */
export function generateItinerary(c: TripContent): Itinerary {
  const total = resolveDays(c.period, c.days);
  if (!total || total < 1) throw new ValidationError('Informe a duração da viagem para gerar o roteiro');
  if (total > MAX_ITINERARY_DAYS) {
    throw new ValidationError(`O roteiro automático suporta até ${MAX_ITINERARY_DAYS} dias`);
  }
  if (c.destinations.length === 0) throw new ValidationError('Escolha ao menos um destino para gerar o roteiro');
  if (c.destinations.length > total) {
    throw new ValidationError('Há mais destinos do que dias de viagem. Aumente a duração ou remova destinos.');
  }

  const n = c.destinations.length;
  const base = Math.floor(total / n);
  const extra = total % n;
  const days = c.destinations.flatMap((d, i) =>
    buildBlock(base + (i < extra ? 1 : 0), c.experiences, c.likedPlaces.filter((p) => p.destinationRef === d.ref), d.ref),
  );
  return { days };
}
