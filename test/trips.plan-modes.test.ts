import { describe, expect, it } from 'vitest';
import { useTripApp } from './helpers/trip-kit.js';
import { MIN_RATED_CARDS_PER_DESTINATION } from '../src/modules/trips/domain/trip.types.js';

describe('modos do Planeje', () => {
  const k = useTripApp();
  const cards = (destinationRef: string, n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ ref: `${prefix}-${destinationRef}-${i}`, name: `Lugar ${i}`, kind: 'passeio', destinationRef }));
  const plan = async (t: string, id: string) => k.call(t, 'POST', `/trips/${id}/status`, { status: 'planejada' });
  const paths = (res: { json(): any }) => (res.json().error.details as { path: string }[]).map((d) => d.path);
  const create = async (t: string, body: object) => (await k.call(t, 'POST', '/trips', body)).json().id as string;

  it('destino definido: exige TODOS os cards avaliados e orçamento respondido', async () => {
    const t = await k.newUser();
    const id = await create(t, { ...k.complete(), planMode: 'destino_definido', likedPlaces: cards('paris', 3, 'l') });
    const res = await plan(t, id);
    expect(res.statusCode).toBe(400);
    expect(paths(res)).toEqual(expect.arrayContaining(['likedPlaces', 'budgetBrl']));
    expect(res.json().error.details.find((d: any) => d.path === 'likedPlaces').message).toContain(`3 de ${MIN_RATED_CARDS_PER_DESTINATION}`);
  });

  it('destino definido: curtir + não curtir somam; "sem limite" conta como orçamento respondido', async () => {
    const t = await k.newUser();
    const id = await create(t, {
      ...k.complete(), planMode: 'destino_definido', budgetUnlimited: true,
      likedPlaces: cards('paris', 5, 'l'), dislikedPlaces: cards('paris', MIN_RATED_CARDS_PER_DESTINATION - 5, 'd'),
    });
    const res = await plan(t, id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'planejada', planMode: 'destino_definido', budgetUnlimited: true, budgetBrl: null });
    expect(res.json().dislikedPlaces).toHaveLength(MIN_RATED_CARDS_PER_DESTINATION - 5);
  });

  it('com vários destinos, cada um precisa dos seus cards', async () => {
    const t = await k.newUser();
    const id = await create(t, {
      ...k.complete({ destinations: [k.paris, k.roma] }), planMode: 'destino_definido', budgetBrl: 3000,
      likedPlaces: cards('paris', MIN_RATED_CARDS_PER_DESTINATION, 'l'),
    });
    const res = await plan(t, id);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json().error.details)).toContain('Roma');
  });

  it('com ajuda: exige o questionário inteiro; só cuidados são opcionais; cards não são exigidos', async () => {
    const t = await k.newUser();
    const id = await create(t, { ...k.complete(), planMode: 'com_ajuda' });
    const res = await plan(t, id);
    expect(res.statusCode).toBe(400);
    expect(paths(res)).toEqual(expect.arrayContaining(['climate', 'reach', 'experiences', 'budgetBrl']));
    expect(paths(res)).not.toContain('needs');
    expect(paths(res)).not.toContain('likedPlaces');

    const ok = await k.call(t, 'PATCH', `/trips/${id}`, { climate: 'calor', reach: 'internacional', experiences: ['praia'], budgetBrl: 5000 });
    expect(ok.statusCode).toBe(200);
    expect((await plan(t, id)).json().status).toBe('planejada');
  });

  it('sem planMode (rascunho antigo) segue só a regra base', async () => {
    const t = await k.newUser();
    expect((await plan(t, await create(t, k.complete()))).statusCode).toBe(200);
  });

  it('depois de planejada o modo continua valendo na edição (não dá para esvaziar os cards)', async () => {
    const t = await k.newUser();
    const id = await create(t, { ...k.complete(), planMode: 'destino_definido', budgetBrl: 1000, likedPlaces: cards('paris', MIN_RATED_CARDS_PER_DESTINATION, 'l') });
    await plan(t, id);
    expect((await k.call(t, 'PATCH', `/trips/${id}`, { likedPlaces: [] })).statusCode).toBe(400);
  });

  it('validações: card com as duas reações, "sem limite" com valor, lugar de destino que não existe', async () => {
    const t = await k.newUser();
    const both = cards('paris', 1, 'x');
    expect((await k.call(t, 'POST', '/trips', { ...k.complete(), likedPlaces: both, dislikedPlaces: both })).statusCode).toBe(400);
    expect((await k.call(t, 'POST', '/trips', { budgetUnlimited: true, budgetBrl: 100 })).statusCode).toBe(400);
    expect((await k.call(t, 'POST', '/trips', { ...k.complete(), dislikedPlaces: cards('londres', 1, 'd') })).statusCode).toBe(400);
    expect((await k.call(t, 'POST', '/trips', { planMode: 'outro' })).statusCode).toBe(400);
  });

  it('banco barra "sem limite" com valor mesmo sem passar pela API', async () => {
    const t = await k.newUser();
    const id = await create(t, {});
    await expect(k.conn.pool.query(`update trips set budget_unlimited = true, budget_brl = 10 where id = $1`, [id])).rejects.toThrow(/trips_budget_unlimited_chk/);
  });
});
