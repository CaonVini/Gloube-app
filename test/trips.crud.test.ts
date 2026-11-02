import { describe, expect, it } from 'vitest';
import { useTripApp } from './helpers/trip-kit.js';

const k = useTripApp();
const { call, newUser, today, paris, roma, complete, addDays } = k;

describe('autenticação e isolamento', () => {
  it('exige login', async () => {
    expect((await call(null, 'GET', '/trips')).statusCode).toBe(401);
    expect((await call(null, 'POST', '/trips', {})).statusCode).toBe(401);
  });

  it('um usuário não vê nem edita a viagem de outro (404), e a lista é só dele', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    expect((await call(b, 'GET', `/trips/${id}`)).statusCode).toBe(404);
    expect((await call(b, 'PATCH', `/trips/${id}`, { origin: 'X' })).statusCode).toBe(404);
    expect((await call(b, 'GET', '/trips')).json().items).toHaveLength(0);
    expect((await call(a, 'GET', `/trips/${id}`)).statusCode).toBe(200);
  });

  it('não aceita userId/status no corpo (mass assignment) nem DELETE da viagem', async () => {
    const a = await newUser();
    const res = await call(a, 'POST', '/trips', { origin: 'SP', status: 'concluida', userId: '00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(400);
    const id = (await call(a, 'POST', '/trips', {})).json().id;
    expect((await call(a, 'DELETE', `/trips/${id}`)).statusCode).toBe(404);
    expect((await call(a, 'GET', `/trips/${id}`)).statusCode).toBe(200);
    expect((await call(a, 'GET', '/trips/nao-e-uuid')).statusCode).toBe(400);
  });
});

describe('rascunho e validações', () => {
  it('aceita rascunho vazio e incompleto', async () => {
    const a = await newUser();
    const res = await call(a, 'POST', '/trips', {});
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'rascunho', destinations: [], budgetBrl: null, itinerary: null });
  });

  it('bloqueia datas antes de hoje, volta antes da ida e data inexistente', async () => {
    const a = await newUser();
    const mk = (period: object) => call(a, 'POST', '/trips', { period });
    expect((await mk({ mode: 'definidas', startDate: addDays(today, -1), endDate: null })).statusCode).toBe(400);
    expect((await mk({ mode: 'definidas', startDate: addDays(today, 5), endDate: addDays(today, 5) })).statusCode).toBe(400);
    expect((await mk({ mode: 'definidas', startDate: '2099-02-30', endDate: null })).statusCode).toBe(400);
    expect((await mk({ mode: 'mes', month: 1, year: 2000 })).statusCode).toBe(400);
    expect((await mk({ mode: 'definidas', startDate: today, endDate: null })).statusCode).toBe(201);
    expect((await mk({ mode: 'indefinido' })).statusCode).toBe(201);
  });

  it('limita a 10 destinos, sem repetidos, e lugar curtido só de destino da viagem', async () => {
    const a = await newUser();
    const many = Array.from({ length: 11 }, (_, i) => ({ ref: `c${i}`, city: `C${i}`, country: 'BR' }));
    expect((await call(a, 'POST', '/trips', { destinations: many })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/trips', { destinations: many.slice(0, 10) })).statusCode).toBe(201);
    expect((await call(a, 'POST', '/trips', { destinations: [paris, paris] })).statusCode).toBe(400);
    const bad = { ref: 'x:y', name: 'Y', kind: 'icone', destinationRef: 'roma' };
    expect((await call(a, 'POST', '/trips', { destinations: [paris], likedPlaces: [bad] })).statusCode).toBe(400);
  });

  it('orçamento: null = sem limite; não aceita negativo; sem limite de duração', async () => {
    const a = await newUser();
    expect((await call(a, 'POST', '/trips', { budgetBrl: -1 })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/trips', { budgetBrl: 1500.5 })).json().budgetBrl).toBe(1500.5);
    expect((await call(a, 'POST', '/trips', { budgetBrl: null })).json().budgetBrl).toBeNull();
    expect((await call(a, 'POST', '/trips', { days: 0 })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/trips', { days: 400 })).statusCode).toBe(201);
  });

  it('com ida e volta, a duração vem das datas', async () => {
    const a = await newUser();
    const res = await call(a, 'POST', '/trips', complete({ days: 99 }));
    expect(res.json().days).toBe(7);
  });

  it('rejeita campos desconhecidos e valores fora do conjunto do app', async () => {
    const a = await newUser();
    expect((await call(a, 'POST', '/trips', { companion: 'sozinho' })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/trips', { needs: ['pets', 'pets'] })).statusCode).toBe(400);
    expect((await call(a, 'POST', '/trips', { foo: 1 })).statusCode).toBe(400);
  });
});

describe('listar', () => {
  it('pagina por cursor, filtra por status e não devolve o roteiro completo', async () => {
    const a = await newUser();
    for (let i = 0; i < 5; i++) await call(a, 'POST', '/trips', complete({ origin: `Origem ${i}` }));
    const p1 = (await call(a, 'GET', '/trips?limit=2')).json();
    expect(p1.items).toHaveLength(2);
    expect(p1.items[0]).not.toHaveProperty('itinerary');
    const p2 = (await call(a, 'GET', `/trips?limit=2&cursor=${p1.nextCursor}`)).json();
    const p3 = (await call(a, 'GET', `/trips?limit=2&cursor=${p2.nextCursor}`)).json();
    const ids = [...p1.items, ...p2.items, ...p3.items].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
    expect((await call(a, 'GET', '/trips?status=planejada')).json().items).toHaveLength(0);
    expect((await call(a, 'GET', '/trips?cursor=lixolixolixo')).statusCode).toBe(400);
    expect((await call(a, 'GET', '/trips?limit=1000')).statusCode).toBe(400);
  });
});

describe('editar rascunho', () => {
  it('altera só os campos enviados e permite limpar com null', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete({ budgetBrl: 1000 }))).json().id;
    const res = await call(a, 'PATCH', `/trips/${id}`, { budgetBrl: null, needs: ['pets'] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ budgetBrl: null, needs: ['pets'], origin: 'São Paulo, Brasil', status: 'rascunho' });
  });
  it('valida de novo o que mudou (datas passadas, destinos demais)', async () => {
    const a = await newUser();
    const id = (await call(a, 'POST', '/trips', complete())).json().id;
    const past = { mode: 'definidas', startDate: k.addDays(today, -3), endDate: null };
    expect((await call(a, 'PATCH', `/trips/${id}`, { period: past })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', `/trips/${id}`, { destinations: [paris, paris] })).statusCode).toBe(400);
    expect((await call(a, 'PATCH', `/trips/${id}`, {})).statusCode).toBe(400);
  });
});
