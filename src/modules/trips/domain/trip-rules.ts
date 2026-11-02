import { ValidationError } from '../../../shared/errors/app-error.js';
import type { Period, TripStatus } from './trip.types.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** "Hoje" do usuário no Brasil (a viagem é planejada no fuso de Brasília, não no UTC do servidor). */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Data ISO real do calendário (rejeita 2027-02-30). */
export function isRealIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function nightsBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Regras do período. Nada antes de hoje; volta (se houver) depois da ida. */
export function validatePeriod(period: Period, today: string): void {
  const issues: { path: string; message: string }[] = [];
  if (period.mode === 'mes') {
    const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    if (period.year * 12 + period.month < ty * 12 + tm) issues.push({ path: 'period', message: 'O mês não pode ser anterior ao mês atual' });
  } else if (period.mode === 'definidas') {
    if (!isRealIsoDate(period.startDate)) issues.push({ path: 'period.startDate', message: 'Data de ida inválida' });
    else if (period.startDate < today) issues.push({ path: 'period.startDate', message: 'A data de ida não pode ser anterior a hoje' });
    if (period.endDate !== null) {
      if (!isRealIsoDate(period.endDate)) issues.push({ path: 'period.endDate', message: 'Data de volta inválida' });
      else if (isRealIsoDate(period.startDate) && period.endDate <= period.startDate) {
        issues.push({ path: 'period.endDate', message: 'A volta deve ser depois da ida' });
      }
    }
  }
  if (issues.length > 0) throw new ValidationError('Período inválido', issues);
}

/** Com ida e volta, os dias vêm do intervalo (igual ao app); senão valem os dias informados. */
export function resolveDays(period: Period | null, days: number | null): number | null {
  if (period?.mode === 'definidas' && period.endDate && isRealIsoDate(period.startDate) && isRealIsoDate(period.endDate)) {
    const n = nightsBetween(period.startDate, period.endDate);
    return n > 0 ? n : days;
  }
  return days;
}

/** Última data da viagem (para concluir automaticamente); null sem datas exatas. */
export function lastTripDate(period: Period | null, days: number | null): string | null {
  if (period?.mode !== 'definidas') return null;
  if (period.endDate) return period.endDate;
  return days ? addDays(period.startDate, days) : period.startDate;
}

const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  rascunho: ['planejada', 'cancelada'],
  planejada: ['em_andamento', 'cancelada'],
  em_andamento: ['concluida', 'cancelada'],
  concluida: [],
  cancelada: [],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Status em que o conteúdo (campos e roteiro) pode ser editado. */
export const EDITABLE_STATUSES: readonly TripStatus[] = ['rascunho', 'planejada', 'em_andamento'];
