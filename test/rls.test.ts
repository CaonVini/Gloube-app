import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';
import { useTripApp } from './helpers/trip-kit.js';

describe('Row Level Security (o banco barra mesmo se a aplicação errar)', () => {
  const k = useTripApp();

  /** Roda SQL "como o usuário X", exatamente como a aplicação faz, mas SEM filtrar por dono. */
  const asUserSql = async <T>(userId: string | null, fn: (q: (sql: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>) => Promise<T>) => {
    const c = await k.conn.pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('role','aurora_app',true)`);
      if (userId) await c.query(`select set_config('app.user_id',$1,true)`, [userId]);
      return await fn(async (s, p) => {
        await c.query('savepoint sp');
        try { return await c.query(s, p); } catch (e) { await c.query('rollback to savepoint sp'); throw e; }
      });
    } finally {
      await c.query('rollback');
      c.release();
    }
  };
  const userIdOf = async (t: string) => (await k.call(t, 'GET', '/users/me')).json().id as string;
  const mkTrip = async (t: string) => (await k.call(t, 'POST', '/trips', k.complete())).json().id as string;

  it('sem dono definido nenhuma linha é visível (fail-closed)', async () => {
    const t = await k.newUser(); await mkTrip(t);
    const rows = await asUserSql(null, (q) => q('select id from trips'));
    expect(rows.rows).toHaveLength(0);
  });

  it('usuário B não lê, não altera e não insere em nome do usuário A, nem com SQL sem filtro', async () => {
    const a = await k.newUser(); const b = await k.newUser();
    const tripA = await mkTrip(a);
    const idA = await userIdOf(a); const idB = await userIdOf(b);

    await asUserSql(idB, async (q) => {
      expect((await q('select id from trips where id = $1', [tripA])).rows).toHaveLength(0);
      expect((await q(`update trips set origin = 'hack' where id = $1`, [tripA])).rowCount).toBe(0);
      expect((await q('select * from trip_summaries where id = $1', [tripA])).rows).toHaveLength(0);
      await expect(q(`insert into trips(id, user_id) values (gen_random_uuid(), $1)`, [idA])).rejects.toThrow(/row-level security/);
    });
    // O dono continua enxergando
    await asUserSql(idA, async (q) => expect((await q('select id from trips where id = $1', [tripA])).rows).toHaveLength(1));
    // Dados do A intactos
    expect((await k.call(a, 'GET', `/trips/${tripA}`)).json().origin).toBe('São Paulo, Brasil');
  });

  it('o papel da aplicação não consegue apagar viagens nem tocar tabelas de outros módulos', async () => {
    const a = await k.newUser(); const idA = await userIdOf(a); await mkTrip(a);
    await asUserSql(idA, async (q) => {
      await expect(q('delete from trips')).rejects.toThrow(/permission denied/);
      await expect(q('select * from users')).rejects.toThrow(/permission denied/);
      await expect(q('select * from refresh_tokens')).rejects.toThrow(/permission denied/);
    });
  });

  it('histórico de status e gerações de IA também são isolados por dono', async () => {
    const a = await k.newUser(); const b = await k.newUser();
    await mkTrip(a);
    const idA = await userIdOf(a); const idB = await userIdOf(b);
    await asUserSql(idA, async (q) => expect((await q('select count(*)::int n from trip_status_history')).rows[0].n).toBeGreaterThan(0));
    await asUserSql(idB, async (q) => {
      expect((await q('select count(*)::int n from trip_status_history where user_id = $1', [idA])).rows[0].n).toBe(0);
      expect((await q('select count(*)::int n from ai_generations where user_id = $1', [idA])).rows[0].n).toBe(0);
    });
  });

  it('o worker só enxerga a fila: sem acesso a viagens e usuários', async () => {
    const c = await k.conn.pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('role','aurora_worker',true)`);
      await c.query('select count(*) from ai_generations');
      await expect(c.query('select * from trips')).rejects.toThrow(/permission denied/);
    } finally { await c.query('rollback'); c.release(); }
  });

  it('o papel e o dono do contexto não vazam entre requisições que reaproveitam a conexão (pool de 1)', async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '100000', AUTH_RATE_LIMIT_MAX: '100000' });
    const one = createDatabase(env.DATABASE_URL, 1);
    const app = await buildApp(env, one.db);
    const reg = async (n: string) => (await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { name: 'Pool Teste', email: `${n}-${Date.now()}-${Math.random()}@example.com`, password: 'senha-forte-123' } })).json().tokens.accessToken as string;
    const [a, b] = [await reg('pa'), await reg('pb')];
    const h = (t: string) => ({ authorization: `Bearer ${t}` });
    const created = await app.inject({ method: 'POST', url: '/v1/trips', headers: h(a), payload: k.complete() });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: `/v1/trips/${created.json().id}`, headers: h(b) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/v1/trips/${created.json().id}`, headers: h(a) })).statusCode).toBe(200);
    const role = await one.pool.query('show role');
    expect(role.rows[0].role).toBe('none');
    await app.close(); await one.close();
  });
});

describe('rate limit por usuário', () => {
  it('estoura por conta (429 + retry-after) sem bloquear outra conta no mesmo IP', async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '100000', AUTH_RATE_LIMIT_MAX: '100000', USER_RATE_LIMIT_MAX: '5' });
    const conn = createDatabase(env.DATABASE_URL, 3);
    const app = await buildApp(env, conn.db);
    const reg = async () => (await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { name: 'Limite Teste', email: `rl-${Date.now()}-${Math.random()}@example.com`, password: 'senha-forte-123' } })).json().tokens.accessToken as string;
    const [a, b] = [await reg(), await reg()];
    const get = (t: string) => app.inject({ method: 'GET', url: '/v1/users/me', headers: { authorization: `Bearer ${t}` } });
    for (let i = 0; i < 5; i++) expect((await get(a)).statusCode).toBe(200);
    const blocked = await get(a);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect((await get(b)).statusCode).toBe(200);
    await app.close(); await conn.close();
  });
});
