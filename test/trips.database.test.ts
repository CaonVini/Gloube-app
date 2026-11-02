import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { DrizzleUserRepository } from '../src/modules/users/infra/drizzle-user.repository.js';
import { User } from '../src/modules/users/domain/user.entity.js';
import { DrizzleTripRepository } from '../src/modules/trips/infra/drizzle-trip.repository.js';
import { Trip } from '../src/modules/trips/domain/trip.entity.js';
import { addDays, todayInBrazil } from '../src/modules/trips/domain/trip-rules.js';

/** Testa as garantias do PRÓPRIO banco (triggers, constraints, function e views), com SQL direto, ignorando a aplicação. */
let conn: DatabaseConnection;
let repo: DrizzleTripRepository;
let owner: string;
const today = todayInBrazil();

beforeAll(async () => {
  conn = createDatabase(loadEnv({ ...process.env, NODE_ENV: 'test' }).DATABASE_URL, 5);
  repo = new DrizzleTripRepository(conn.db);
  const u = User.create({ name: 'Dono Banco', email: `db-${Date.now()}-${Math.random()}@example.com`, passwordHash: null });
  await new DrizzleUserRepository(conn.db).create(u);
  owner = u.id;
});
afterAll(() => conn.close());

const exec = (q: ReturnType<typeof sql>) => conn.db.execute(q);
const mk = async (content: Parameters<typeof Trip.createDraft>[1] = {}) => {
  const t = Trip.createDraft(owner, content);
  await repo.create(t);
  return t.id;
};
const fails = async (q: ReturnType<typeof sql>, code: string) => {
  const err = await exec(q).then(() => null, (e: { cause?: { code?: string }; code?: string }) => e);
  expect(err, 'deveria falhar').not.toBeNull();
  expect(err?.cause?.code ?? err?.code).toBe(code);
};

describe('constraints', () => {
  it('recusam valores fora do conjunto do app e estruturas inválidas', async () => {
    const id = await mk();
    await fails(sql`update trips set climate = 'quente' where id = ${id}`, '23514');
    await fails(sql`update trips set companion = 'pet' where id = ${id}`, '23514');
    await fails(sql`update trips set experiences = ARRAY['praia','balada'] where id = ${id}`, '23514');
    await fails(sql`update trips set needs = ARRAY['x'] where id = ${id}`, '23514');
    await fails(sql`update trips set destinations = '{}'::jsonb where id = ${id}`, '23514');
    await fails(sql`update trips set itinerary = '[]'::jsonb where id = ${id}`, '23514');
  });

  it('recusam mais de 10 destinos e roteiro acima de 1 MB', async () => {
    const id = await mk();
    const eleven = JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ ref: `c${i}`, city: 'C', country: 'BR' })));
    await fails(sql`update trips set destinations = ${eleven}::jsonb where id = ${id}`, '23514');
    const huge = JSON.stringify({ days: [{ t: 'x'.repeat(1_200_000) }] });
    await fails(sql`update trips set itinerary = ${huge}::jsonb where id = ${id}`, '23514');
  });

  it('exigem coerência do período', async () => {
    const id = await mk();
    await fails(sql`update trips set period_mode = 'definidas' where id = ${id}`, '23514'); // sem start_date
    await fails(sql`update trips set period_mode = 'mes', period_month = 13, period_year = 2027 where id = ${id}`, '23514');
    await fails(sql`update trips set period_mode = 'definidas', start_date = ${addDays(today, 5)}::date, end_date = ${addDays(today, 5)}::date where id = ${id}`, '23514');
    await fails(sql`update trips set period_mode = 'indefinido', start_date = ${today}::date where id = ${id}`, '23514');
  });
});

describe('trigger de proteção', () => {
  it('impede reatribuir a viagem a outro usuário (id, user_id, created_at imutáveis)', async () => {
    const other = User.create({ name: 'Outro', email: `o-${Date.now()}-${Math.random()}@example.com`, passwordHash: null });
    await new DrizzleUserRepository(conn.db).create(other);
    const id = await mk();
    await fails(sql`update trips set user_id = ${other.id}::uuid where id = ${id}`, '42501');
    await fails(sql`update trips set created_at = now() - interval '1 year' where id = ${id}`, '42501');
    await fails(sql`update trips set id = gen_random_uuid() where id = ${id}`, '42501');
  });

  it('impõe o fluxo de status mesmo com SQL direto', async () => {
    const id = await mk();
    await fails(sql`update trips set status = 'concluida' where id = ${id}`, '23514');
    await exec(sql`update trips set status = 'planejada' where id = ${id}`);
    await fails(sql`update trips set status = 'rascunho' where id = ${id}`, '23514');
    await exec(sql`update trips set status = 'cancelada' where id = ${id}`);
    await fails(sql`update trips set status = 'planejada' where id = ${id}`, '23514');
  });

  it('viagem encerrada só aceita arquivar/desarquivar', async () => {
    const id = await mk({ origin: 'SP' });
    await exec(sql`update trips set status = 'cancelada' where id = ${id}`);
    await fails(sql`update trips set origin = 'Rio' where id = ${id}`, '23514');
    await fails(sql`update trips set itinerary = '{"days":[]}'::jsonb where id = ${id}`, '23514');
    await exec(sql`update trips set archived_at = now() where id = ${id}`);
    await exec(sql`update trips set archived_at = null where id = ${id}`);
  });
});

describe('histórico de status (trigger)', () => {
  it('registra criação e cada mudança, e não deixa editar o histórico', async () => {
    const id = await mk();
    await exec(sql`update trips set status = 'planejada' where id = ${id}`);
    await exec(sql`update trips set status = 'em_andamento' where id = ${id}`);
    const rows = (await exec(sql`select from_status, to_status from trip_status_history where trip_id = ${id} order by id`)).rows;
    expect(rows).toEqual([
      { from_status: null, to_status: 'rascunho' },
      { from_status: 'rascunho', to_status: 'planejada' },
      { from_status: 'planejada', to_status: 'em_andamento' },
    ]);
    await fails(sql`update trip_status_history set to_status = 'concluida' where trip_id = ${id}`, '42501');
  });

  it('o histórico some junto com a viagem (cascade) sem ser bloqueado', async () => {
    const id = await mk();
    await exec(sql`delete from trips where id = ${id}`);
    expect((await exec(sql`select 1 from trip_status_history where trip_id = ${id}`)).rows).toHaveLength(0);
  });
});

describe('function trips_sync_statuses', () => {
  it('avança em uma chamada e devolve quantas mudaram', async () => {
    const mkPlanned = async (start: string, end: string | null, days: number | null) => {
      const id = await mk({ period: { mode: 'definidas', startDate: addDays(today, 10), endDate: addDays(today, 12) }, days: days ?? undefined });
      await exec(sql`update trips set status = 'planejada' where id = ${id}`);
      await exec(sql`update trips set start_date = ${start}::date, end_date = ${end}::date where id = ${id}`);
      return id;
    };
    const inProgress = await mkPlanned(addDays(today, -1), addDays(today, 3), null);
    const allPast = await mkPlanned(addDays(today, -9), addDays(today, -2), null);
    const future = await mkPlanned(addDays(today, 5), addDays(today, 9), null);
    const res = await exec(sql`select trips_sync_statuses(${owner}::uuid, ${today}::date) as n`);
    expect(res.rows[0]).toMatchObject({ n: 3 }); // 2 viagens começaram + 1 que já terminou
    const st = async (id: string) => (await repo.findById(id, owner))?.status;
    expect(await st(inProgress)).toBe('em_andamento');
    expect(await st(allPast)).toBe('concluida');
    expect(await st(future)).toBe('planejada');
  });
});

describe('views', () => {
  it('trip_summaries não carrega roteiro nem lugares curtidos', async () => {
    const id = await mk({ destinations: [{ ref: 'paris', city: 'Paris', country: 'França' }] });
    await exec(sql`update trips set itinerary = '{"days":[]}'::jsonb where id = ${id}`);
    const row = (await exec(sql`select * from trip_summaries where id = ${id}`)).rows[0]!;
    expect(row).not.toHaveProperty('itinerary');
    expect(row).not.toHaveProperty('liked_places');
    expect(row).toMatchObject({ has_itinerary: true, user_id: owner });
  });

  it('user_trip_stats conta só viagens concluídas: viagens, países e lugares distintos', async () => {
    const u = User.create({ name: 'Estatística', email: `st-${Date.now()}-${Math.random()}@example.com`, passwordHash: null });
    await new DrizzleUserRepository(conn.db).create(u);
    const done = async (dest: { ref: string; city: string; country: string }[], placeRefs: string[], finish = true) => {
      const t = Trip.createDraft(u.id, { destinations: dest });
      await repo.create(t);
      const itin = JSON.stringify({ days: [{ id: 'd', title: 't', destinationRef: null, items: placeRefs.map((r) => ({ id: r, text: 'x', placeRef: r })).concat([{ id: 'n', text: 'livre', placeRef: null as never }]) }] });
      await exec(sql`update trips set itinerary = ${itin}::jsonb where id = ${t.id}`);
      if (finish) {
        await exec(sql`update trips set status = 'planejada' where id = ${t.id}`);
        await exec(sql`update trips set status = 'em_andamento' where id = ${t.id}`);
        await exec(sql`update trips set status = 'concluida' where id = ${t.id}`);
      }
    };
    expect(await repo.statsForUser(u.id)).toEqual({ trips: 0, countries: 0, places: 0 });
    await done([{ ref: 'paris', city: 'Paris', country: 'França' }, { ref: 'roma', city: 'Roma', country: 'Itália' }], ['g:a', 'g:b']);
    await done([{ ref: 'lyon', city: 'Lyon', country: 'França' }], ['g:b', 'g:c']);
    await done([{ ref: 'tokyo', city: 'Tóquio', country: 'Japão' }], ['g:z'], false); // não concluída: não conta
    expect(await repo.statsForUser(u.id)).toEqual({ trips: 2, countries: 2, places: 3 });
  });
});
