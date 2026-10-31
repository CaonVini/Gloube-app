import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';

/** Requer Postgres acessível em DATABASE_URL e migrations aplicadas (npm run db:migrate). */
let app: FastifyInstance;
let conn: DatabaseConnection;
const email = `user-${Date.now()}@example.com`;
const password = 'senha-forte-123';

beforeAll(async () => {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '10000' });
  conn = createDatabase(env.DATABASE_URL, 5);
  app = await buildApp(env, conn.db);
});

afterAll(async () => {
  await app.close();
  await conn.close();
});

const post = (url: string, payload: unknown, headers = {}) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers });

describe('fluxo de autenticação', () => {
  let tokens: { accessToken: string; refreshToken: string };

  it('rejeita entrada inválida com 400', async () => {
    const res = await post('/v1/auth/register', { name: 'A', email: 'x', password: '123' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('registra usuário sem expor o hash da senha', async () => {
    const res = await post('/v1/auth/register', { name: 'Fulano', email: email.toUpperCase(), password });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);
    tokens = body.tokens;
  });

  it('retorna 409 em e-mail duplicado, inclusive em cadastros concorrentes', async () => {
    const dup = await post('/v1/auth/register', { name: 'Fulano', email, password });
    expect(dup.statusCode).toBe(409);

    const e = `race-${Date.now()}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/v1/auth/register', { name: 'Race', email: e, password })),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
  });

  it('login com senha errada e e-mail inexistente dão a mesma resposta 401', async () => {
    const wrong = await post('/v1/auth/login', { email, password: 'errada-errada' });
    const missing = await post('/v1/auth/login', { email: 'nao@existe.com', password });
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json()).toEqual(missing.json());
  });

  it('acessa /users/me com JWT e bloqueia sem/com token inválido', async () => {
    const ok = await app.inject({ method: 'GET', url: '/v1/users/me', headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().email).toBe(email);

    expect((await app.inject({ method: 'GET', url: '/v1/users/me' })).statusCode).toBe(401);
    const bad = await app.inject({ method: 'GET', url: '/v1/users/me', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(bad.statusCode).toBe(401);
  });

  it('rotaciona refresh token e detecta reuso revogando a sessão', async () => {
    const first = await post('/v1/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(first.statusCode).toBe(200);
    const rotated = first.json();
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    // reuso do token antigo => 401 e revoga o token novo também
    const reuse = await post('/v1/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(reuse.statusCode).toBe(401);
    const afterReuse = await post('/v1/auth/refresh', { refreshToken: rotated.refreshToken });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('refresh concorrente com o mesmo token: no máximo um sucesso', async () => {
    const login = (await post('/v1/auth/login', { email, password })).json();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/v1/auth/refresh', { refreshToken: login.tokens.refreshToken })),
    );
    expect(results.filter((r) => r.statusCode === 200).length).toBeLessThanOrEqual(1);
  });

  it('logout é idempotente e invalida o refresh token', async () => {
    const login = (await post('/v1/auth/login', { email, password })).json();
    expect((await post('/v1/auth/logout', { refreshToken: login.tokens.refreshToken })).statusCode).toBe(204);
    expect((await post('/v1/auth/logout', { refreshToken: login.tokens.refreshToken })).statusCode).toBe(204);
    expect((await post('/v1/auth/refresh', { refreshToken: login.tokens.refreshToken })).statusCode).toBe(401);
  });

  it('health e 404 seguem o formato padrão', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
    expect((await app.inject({ method: 'GET', url: '/nada' })).json().error.code).toBe('NOT_FOUND');
  });
});
