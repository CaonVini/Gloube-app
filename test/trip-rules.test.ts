import { describe, expect, it } from 'vitest';
import { addDays, canTransition, isRealIsoDate, lastTripDate, nightsBetween, resolveDays, todayInBrazil, validatePeriod } from '../src/modules/trips/domain/trip-rules.js';

describe('regras puras de viagem', () => {
  it('"hoje" usa o fuso de Brasília, não o UTC', () => {
    // 01:30 UTC de 2 de nov ainda é 22:30 de 1º de nov em Brasília
    expect(todayInBrazil(new Date('2026-11-02T01:30:00Z'))).toBe('2026-11-01');
    expect(todayInBrazil(new Date('2026-11-02T12:00:00Z'))).toBe('2026-11-02');
  });

  it('valida datas reais do calendário', () => {
    expect(isRealIsoDate('2028-02-29')).toBe(true);
    expect(isRealIsoDate('2027-02-29')).toBe(false);
    expect(isRealIsoDate('2027-13-01')).toBe(false);
    expect(isRealIsoDate('01/02/2027')).toBe(false);
  });

  it('período: nada antes de hoje; volta depois da ida', () => {
    const today = '2026-11-02';
    expect(() => validatePeriod({ mode: 'definidas', startDate: '2026-11-01', endDate: null }, today)).toThrow();
    expect(() => validatePeriod({ mode: 'definidas', startDate: '2026-11-02', endDate: null }, today)).not.toThrow();
    expect(() => validatePeriod({ mode: 'definidas', startDate: '2026-11-05', endDate: '2026-11-05' }, today)).toThrow();
    expect(() => validatePeriod({ mode: 'mes', month: 10, year: 2026 }, today)).toThrow();
    expect(() => validatePeriod({ mode: 'mes', month: 11, year: 2026 }, today)).not.toThrow();
    expect(() => validatePeriod({ mode: 'indefinido' }, today)).not.toThrow();
  });

  it('dias vêm do intervalo quando há ida e volta; senão valem os informados (sem limite máximo)', () => {
    expect(nightsBetween('2026-12-28', '2027-01-03')).toBe(6);
    expect(resolveDays({ mode: 'definidas', startDate: '2026-12-28', endDate: '2027-01-03' }, 99)).toBe(6);
    expect(resolveDays({ mode: 'definidas', startDate: '2026-12-28', endDate: null }, 10)).toBe(10);
    expect(resolveDays({ mode: 'indefinido' }, 5000)).toBe(5000);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(lastTripDate({ mode: 'definidas', startDate: '2026-12-28', endDate: null }, 3)).toBe('2026-12-31');
    expect(lastTripDate({ mode: 'mes', month: 1, year: 2027 }, 3)).toBeNull();
  });

  it('máquina de status', () => {
    expect(canTransition('rascunho', 'planejada')).toBe(true);
    expect(canTransition('rascunho', 'concluida')).toBe(false);
    expect(canTransition('planejada', 'em_andamento')).toBe(true);
    expect(canTransition('em_andamento', 'cancelada')).toBe(true);
    expect(canTransition('concluida', 'cancelada')).toBe(false);
    expect(canTransition('cancelada', 'rascunho')).toBe(false);
  });
});
