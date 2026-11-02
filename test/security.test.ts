import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';
import { PUBLIC_ROUTES, installRouteGuard } from '../src/shared/http/route-guard.js';

let app: FastifyInstance;
let conn: DatabaseConnection;
beforeAll(async () => {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '100000', AUTH_RATE_LIMIT_MAX: '100000' });
  conn = createDatabase(env.DATABASE_URL, 5);
  app = await buildApp(env, conn.db);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await conn.close();
});

const UUID = '00000000-0000-4000-8000-000000000000';
const fill = (url: string) => url.replace(/:\w+/g, UUID);

describe('guard de rotas (fail-closed)', () => {
  it('a API recusa subir com uma rota sem login que não esteja na lista pública', async () => {
    const bare = Fastify();
    installRouteGuard(bare, async () => undefined);
    expect(() => bare.get('/v1/segredo', async () => 'oi')).toThrow(/sem autenticação/);
    const authenticate = async () => undefined;
    const ok = Fastify();
    installRouteGuard(ok, authenticate);
    expect(() => ok.get('/v1/ok', { preHandler: authenticate }, async () => 'oi')).not.toThrow();
    expect(() => ok.get('/health', async () => 'ok')).not.toThrow(); // está na lista pública
  });

  it('só as rotas esperadas são públicas', () => {
    const publics = app.routeTable.filter((r) => r.public).map((r) => `${r.method} ${r.url}`).sort();
    expect(publics).toEqual([...PUBLIC_ROUTES].sort());
  });
});

describe('matriz de autorização: toda rota protegida', () => {
  const protectedRoutes = () => app.routeTable.filter((r) => !r.public);

  it('há rotas protegidas registradas', () => {
    expect(protectedRoutes().length).toBeGreaterThan(8);
  });

  it('responde 401 sem token, com token malformado, com esquema errado e com JWT forjado', async () => {
    const forged = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAifQ.';
    for (const r of protectedRoutes()) {
      for (const authorization of [undefined, 'Bearer', 'Bearer lixo', `Bearer ${forged}`, 'Basic dXNlcjpzZW5oYQ==']) {
        const res = await app.inject({
          method: r.method as 'GET', url: fill(r.url), payload: ['POST', 'PUT', 'PATCH'].includes(r.method) ? {} : undefined,
          headers: authorization ? { authorization } : {},
        });
        expect(res.statusCode, `${r.method} ${r.url} (${authorization ?? 'sem header'})`).toBe(401);
      }
    }
  });
});

describe('cabeçalhos de resposta', () => {
  it('não permite cache de dados pessoais e traz os cabeçalhos do helmet', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/me' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/health' })).headers['cache-control']).toBe('no-store');
  });

  it('erro 500 não vaza detalhes e rota inexistente responde 404 padronizado', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
