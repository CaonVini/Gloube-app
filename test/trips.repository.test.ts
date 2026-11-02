import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { DrizzleUserRepository } from '../src/modules/users/infra/drizzle-user.repository.js';
import { User } from '../src/modules/users/domain/user.entity.js';
import { DrizzleTripRepository } from '../src/modules/trips/infra/drizzle-trip.repository.js';
import { Trip } from '../src/modules/trips/domain/trip.entity.js';
import { addDays, todayInBrazil } from '../src/modules/trips/domain/trip-rules.js';

/** Requer Postgres + migrations. Testa a persistência direto, sem HTTP. */
let conn: DatabaseConnection;
let repo: DrizzleTripRepository;
let owner: string;
let stranger: string;
const today = todayInBrazil();

async function newUserId() {
  const u = User.create({ name: 'Dono Teste', email: `repo-${Date.now()}-${Math.random()}@example.com`, passwordHash: null });
  await new DrizzleUserRepository(conn.db).create(u);
  return u.id;
}

beforeAll(async () => {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
  conn = createDatabase(env.DATABASE_URL, 5);
  repo = new DrizzleTripRepository(conn.db);
  owner = await newUserId();
  stranger = await newUserId();
});
afterAll(() => conn.close());

const paris = { ref: 'paris', city: 'Paris', country: 'França' };

describe('DrizzleTripRepository', () => {
  it('grava e lê todos os campos (período, orçamento, jsonb) sem perder nada', async () => {
    const trip = Trip.createDraft(owner, {
      origin: 'São Paulo', companion: 'casal', experiences: ['praia', 'cidade'], needs: ['pets'],
      destinations: [paris], likedPlaces: [{ ref: 'paris:louvre', name: 'Louvre', kind: 'museu', destinationRef: 'paris' }],
      period: { mode: 'definidas', startDate: addDays(today, 5), endDate: addDays(today, 9) }, days: 4, budgetBrl: 2500.5,
    });
    await repo.create(trip);
    const found = await repo.findById(trip.id, owner);
    expect(found?.toProps()).toMatchObject({ ...trip.toProps(), createdAt: expect.any(Date) });
    expect(found?.content.budgetBrl).toBe(2500.5);
  });

  it('isola por dono: outro usuário não encontra a viagem', async () => {
    const trip = Trip.createDraft(owner, {});
    await repo.create(trip);
    expect(await repo.findById(trip.id, stranger)).toBeNull();
    expect(await repo.transition(trip.id, stranger, 'rascunho', 'cancelada')).toBe(false);
    expect(await repo.setArchived(trip.id, stranger, true)).toBe(false);
    expect((await repo.list(stranger, { archived: false, limit: 50 })).map((t) => t.id)).not.toContain(trip.id);
  });

  it('o banco recusa orçamento negativo, dias < 1 e status inválido', async () => {
    const { trips } = await import('../src/infra/database/schema/index.js');
    const base = (): typeof trips.$inferInsert => ({ id: crypto.randomUUID(), userId: owner });
    await expect(conn.db.insert(trips).values({ ...base(), budgetBrl: '-1' })).rejects.toThrow();
    await expect(conn.db.insert(trips).values({ ...base(), days: 0 })).rejects.toThrow();
    await expect(conn.db.insert(trips).values({ ...base(), status: 'xyz' })).rejects.toThrow();
  });

  it('transição é condicionada ao status anterior (sem corrida)', async () => {
    const trip = Trip.createDraft(owner, {});
    await repo.create(trip);
    expect(await repo.transition(trip.id, owner, 'planejada', 'em_andamento')).toBe(false);
    expect(await repo.transition(trip.id, owner, 'rascunho', 'planejada')).toBe(true);
    expect(await repo.transition(trip.id, owner, 'rascunho', 'cancelada')).toBe(false);
  });

  it('saveContent só grava se o status ainda é o esperado e editável', async () => {
    const trip = Trip.createDraft(owner, {});
    await repo.create(trip);
    expect(await repo.saveContent(trip.withContent({ origin: 'Rio' }), 'rascunho')).toBe(true);
    await repo.transition(trip.id, owner, 'rascunho', 'cancelada');
    expect(await repo.saveContent(trip.withContent({ origin: 'Outro' }), 'cancelada')).toBe(false);
    expect((await repo.findById(trip.id, owner))?.content.origin).toBe('Rio');
  });

  it('saveItinerary usa revisão otimista', async () => {
    const trip = Trip.createDraft(owner, {});
    await repo.create(trip);
    const v1 = trip.withItinerary({ days: [] });
    expect(await repo.saveItinerary(v1, 0)).toBe(true);
    expect(await repo.saveItinerary(trip.withItinerary({ days: [] }), 0)).toBe(false); // revisão 0 já ficou para trás
    expect((await repo.findById(trip.id, owner))?.itineraryRevision).toBe(1);
  });

  it('sincroniza status por data apenas das viagens com datas exatas do próprio usuário', async () => {
    const mk = async (userId: string, period: Parameters<typeof Trip.createDraft>[1]['period'], status: 'planejada' | 'em_andamento') => {
      const t = Trip.createDraft(userId, { period, days: 3 });
      await repo.create(t);
      await repo.transition(t.id, userId, 'rascunho', 'planejada');
      if (status === 'em_andamento') await repo.transition(t.id, userId, 'planejada', 'em_andamento');
      return t.id;
    };
    // as datas são gravadas direto: a API não aceita datas passadas, mas o tempo passa
    const started = await mk(owner, { mode: 'definidas', startDate: addDays(today, -1), endDate: addDays(today, 4) }, 'planejada');
    const finished = await mk(owner, { mode: 'definidas', startDate: addDays(today, -9), endDate: addDays(today, -2) }, 'em_andamento');
    const noEndDays = await mk(owner, { mode: 'definidas', startDate: addDays(today, -5), endDate: null }, 'em_andamento');
    const monthOnly = await mk(owner, { mode: 'mes', month: 1, year: 2020 }, 'planejada');
    const others = await mk(stranger, { mode: 'definidas', startDate: addDays(today, -1), endDate: addDays(today, 4) }, 'planejada');

    await repo.syncStatusesByDate(owner, today);
    const status = async (id: string, uid: string) => (await repo.findById(id, uid))?.status;
    expect(await status(started, owner)).toBe('em_andamento');
    expect(await status(finished, owner)).toBe('concluida');
    expect(await status(noEndDays, owner)).toBe('concluida'); // ida + 3 dias já passou
    expect(await status(monthOnly, owner)).toBe('planejada'); // sem datas exatas não muda sozinho
    expect(await status(others, stranger)).toBe('planejada'); // só o usuário informado é sincronizado
  });

  it('lista com cursor sem repetir nem pular, e separa arquivadas', async () => {
    const who = await newUserId();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = Trip.createDraft(who, { origin: `O${i}` });
      await repo.create(t);
      ids.push(t.id);
    }
    await repo.setArchived(ids[0]!, who, true);
    const p1 = await repo.list(who, { archived: false, limit: 2 });
    const last = p1.at(-1)!;
    const p2 = await repo.list(who, { archived: false, limit: 10, cursor: { updatedAt: last.updatedAt, id: last.id } });
    const seen = [...p1, ...p2].map((t) => t.id);
    expect(new Set(seen).size).toBe(4);
    expect(seen).not.toContain(ids[0]);
    expect((await repo.list(who, { archived: true, limit: 10 })).map((t) => t.id)).toEqual([ids[0]]);
  });
});
