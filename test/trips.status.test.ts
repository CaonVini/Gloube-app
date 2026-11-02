import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { useTripApp } from './helpers/trip-kit.js';

const k = useTripApp();
const { call, newUser, today, paris, roma, complete, addDays } = k;

describe('isolamento de status e arquivo', () => {
  it('outro usuário não muda status nem arquiva (404)', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    expect((await call(b, 'POST', `/trips/${id}/status`, { status: 'cancelada' })).statusCode).toBe(404);
    expect((await call(b, 'POST', `/trips/${id}/archive`)).statusCode).toBe(404);
    expect((await call(a, 'GET', `/trips/${id}`)).json()).toMatchObject({ status: 'rascunho', archived: false });
  });
});

describe('status', () => {
  it('só vira planejada com tudo obrigatório; cuidados e orçamento são opcionais', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', { origin: 'SP' })).json().id;
    const fail = await call(a, 'POST', `/trips/${id}/status`, { status: 'planejada' });
    expect(fail.statusCode).toBe(400);
    expect(fail.json().error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['destinations', 'companion', 'period', 'days']),
    );
    await call(a, 'PATCH', `/trips/${id}`, complete());
    const ok = await call(a, 'POST', `/trips/${id}/status`, { status: 'planejada' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('planejada');
  });

  it('respeita as transições e estados finais', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    expect((await call(a, 'POST', `/trips/${id}/status`, { status: 'concluida' })).statusCode).toBe(409);
    await call(a, 'POST', `/trips/${id}/status`, { status: 'cancelada' });
    expect((await call(a, 'POST', `/trips/${id}/status`, { status: 'planejada' })).statusCode).toBe(409);
    expect((await call(a, 'PATCH', `/trips/${id}`, { origin: 'Rio' })).statusCode).toBe(409);
  });

  it('muda sozinho pelas datas: em andamento e concluída', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    await call(a, 'POST', `/trips/${id}/status`, { status: 'planejada' });
    // simula a passagem do tempo movendo as datas no banco (a API não permite datas passadas)
    await k.conn.db.execute(sql`update trips set start_date = ${addDays(today, -2)}::date, end_date = ${addDays(today, 3)}::date where id = ${id}`);
    expect((await call(a, 'GET', `/trips/${id}`)).json().status).toBe('em_andamento');
    // em andamento continua editável mesmo com a ida no passado
    expect((await call(a, 'PATCH', `/trips/${id}`, { budgetBrl: 3000 })).statusCode).toBe(200);
    await k.conn.db.execute(sql`update trips set start_date = ${addDays(today, -10)}::date, end_date = ${addDays(today, -3)}::date where id = ${id}`);
    expect((await call(a, 'GET', `/trips/${id}`)).json().status).toBe('concluida');
  });

  it('planejada não pode voltar a ficar incompleta', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    await call(a, 'POST', `/trips/${id}/status`, { status: 'planejada' });
    expect((await call(a, 'PATCH', `/trips/${id}`, { destinations: [] })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', `/trips/${id}`, { companion: null })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', `/trips/${id}`, { needs: ['pets'] })).statusCode).toBe(200);
  });
});

describe('arquivar e listar', () => {
  it('arquiva sem excluir, esconde da lista padrão e desarquiva (idempotente)', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    const arch = await call(a, 'POST', `/trips/${id}/archive`);
    expect(arch.json()).toMatchObject({ archived: true });
    expect((await call(a, 'POST', `/trips/${id}/archive`)).statusCode).toBe(200);
    expect((await call(a, 'GET', '/trips')).json().items).toHaveLength(0);
    expect((await call(a, 'GET', '/trips?archived=true')).json().items).toHaveLength(1);
    expect((await call(a, 'DELETE', `/trips/${id}/archive`)).json().archived).toBe(false);
    expect((await call(a, 'GET', '/trips')).json().items).toHaveLength(1);
  });
});

describe('estatísticas do perfil', () => {
  it('exige login e começa zerada', async () => {
    expect((await call(null, 'GET', '/users/me/stats')).statusCode).toBe(401);
    const a = await newUser();
    expect((await call(a, 'GET', '/users/me/stats')).json()).toEqual({ trips: 0, countries: 0, places: 0 });
  });
});
