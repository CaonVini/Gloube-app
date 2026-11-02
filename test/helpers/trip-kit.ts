import { afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../../src/infra/database/client.js';
import { buildApp } from '../../src/app.js';
import { addDays, todayInBrazil } from '../../src/modules/trips/domain/trip-rules.js';

/** Sobe a API contra o Postgres de teste (requer migrations aplicadas) e expõe helpers das rotas de viagem. */
export function useTripApp() {
  let app: FastifyInstance;
  let conn: DatabaseConnection;

  beforeAll(async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '100000', AUTH_RATE_LIMIT_MAX: '100000' });
    conn = createDatabase(env.DATABASE_URL, 5);
    app = await buildApp(env, conn.db);
  });
  afterAll(async () => {
    await app.close();
    await conn.close();
  });

  const newUser = async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { name: 'Viajante Teste', email: `t-${Date.now()}-${Math.random()}@example.com`, password: 'senha-forte-123' },
    });
    return res.json().tokens.accessToken as string;
  };
  const call = (token: string | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: `/v1${url}`, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

  const today = todayInBrazil();
  const paris = { ref: 'paris', city: 'Paris', country: 'França' };
  const roma = { ref: 'roma', city: 'Roma', country: 'Itália' };
  /** Viagem com todos os campos obrigatórios para planejar. */
  const complete = (over: object = {}) => ({
    origin: 'São Paulo, Brasil',
    destinations: [paris],
    companion: 'casal',
    period: { mode: 'definidas', startDate: addDays(today, 30), endDate: addDays(today, 37) },
    ...over,
  });

  return { call, newUser, today, paris, roma, complete, addDays, get conn() { return conn; } };
}
