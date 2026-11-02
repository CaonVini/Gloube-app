import { ValidationError } from '../../../shared/errors/app-error.js';
import type { TripContent } from './trip.entity.js';
import { resolveDays, validatePeriod } from './trip-rules.js';
import { MIN_RATED_CARDS_PER_DESTINATION } from './trip.types.js';

/**
 * Obrigatórios para sair de "rascunho" (virar "planejada").
 * Definido pelo Caon: tudo que o app pede é obrigatório, exceto cuidados (needs) e orçamento.
 *
 * O Planeje tem dois modos (`planMode`), com exigências próprias além da base:
 * - `destino_definido`: todos os cards de cada destino avaliados (curtir/não curtir), companhia, data e orçamento respondidos;
 * - `com_ajuda`: questionário inteiro (clima, alcance, companhia, experiências, período, orçamento); só os cuidados são opcionais.
 * "Orçamento respondido" = valor informado OU "sem limite" marcado (`budgetUnlimited`).
 * Viagens sem `planMode` (rascunhos antigos) seguem só a regra base.
 */
export function missingForPlanned(c: TripContent): { path: string; message: string }[] {
  const missing: { path: string; message: string }[] = [];
  const need = (ok: boolean, path: string, message: string) => { if (!ok) missing.push({ path, message }); };
  need(!!c.origin, 'origin', 'Informe a origem');
  need(c.destinations.length >= 1, 'destinations', 'Escolha ao menos um destino');
  need(c.companion !== null, 'companion', 'Informe com quem vai viajar');
  need(c.period !== null, 'period', 'Informe o período');
  if (c.period?.mode === 'definidas') need(c.period.startDate.length > 0, 'period.startDate', 'Informe a data de ida');
  const days = resolveDays(c.period, c.days);
  need(days !== null && days >= 1, 'days', 'Informe a duração em dias');

  const budgetAnswered = c.budgetBrl !== null || c.budgetUnlimited;
  if (c.planMode === 'destino_definido') {
    need(budgetAnswered, 'budgetBrl', 'Informe o orçamento ou marque "sem limite"');
    const rated = new Map<string, number>();
    for (const p of [...c.likedPlaces, ...c.dislikedPlaces]) rated.set(p.destinationRef, (rated.get(p.destinationRef) ?? 0) + 1);
    for (const d of c.destinations) {
      const n = rated.get(d.ref) ?? 0;
      need(n >= MIN_RATED_CARDS_PER_DESTINATION, 'likedPlaces',
        `Avalie todos os cards de ${d.city} (curtir ou não curtir): ${n} de ${MIN_RATED_CARDS_PER_DESTINATION}`);
    }
  } else if (c.planMode === 'com_ajuda') {
    need(c.climate !== null, 'climate', 'Informe o clima');
    need(c.reach !== null, 'reach', 'Informe o alcance da viagem');
    need(c.experiences.length >= 1, 'experiences', 'Escolha ao menos uma experiência');
    need(budgetAnswered, 'budgetBrl', 'Informe o orçamento ou marque "sem limite"');
  }
  return missing;
}

export function assertComplete(c: TripContent): void {
  const missing = missingForPlanned(c);
  if (missing.length > 0) throw new ValidationError('Faltam dados para planejar a viagem', missing);
}

/** Ao virar "planejada" as datas também precisam estar no futuro (rascunho antigo pode ter vencido). */
export function assertReadyToPlan(c: TripContent, today: string): void {
  assertComplete(c);
  if (c.period) validatePeriod(c.period, today);
}
