import { ValidationError } from '../../../shared/errors/app-error.js';
import type { TripContent } from './trip.entity.js';
import { resolveDays, validatePeriod } from './trip-rules.js';

/**
 * Obrigatórios para sair de "rascunho" (virar "planejada").
 * Definido pelo Caon: tudo que o app pede é obrigatório, exceto cuidados (needs) e orçamento.
 * Pendente de confirmação: clima, alcance e experiências são do questionário "Descubra" e hoje NÃO são exigidos
 * (no fluxo "Planeje" o destino já vem escolhido). Para exigir, adicione-os aqui.
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
