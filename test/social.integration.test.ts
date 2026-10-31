import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';
import { UnauthorizedError } from '../src/shared/errors/app-error.js';
import type { SocialProfile, SocialTokenVerifier } from '../src/modules/users/application/ports/social-token-verifier.js';

/** Verificador falso: o "token" é um JSON com o perfil, ou "invalid". */
const fake = (provider: 'google' | 'facebook'): SocialTokenVerifier => ({
  provider,
  async verify(token) {
    if (token === 'invalid-token-xx') throw new UnauthorizedError('inválido');
    return JSON.parse(token) as SocialProfile;
  },
});
const tok = (p: SocialProfile) => JSON.stringify(p);

let app: FastifyInstance;
let conn: DatabaseConnection;
const run = Date.now();

beforeAll(async () => {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '10000', AUTH_RATE_LIMIT_MAX: '10000' });
  conn = createDatabase(env.DATABASE_URL, 5);
  app = await buildApp(env, conn.db, { socialVerifiers: { google: fake('google'), facebook: fake('facebook') } });
});
afterAll(async () => {
  await app.close();
  await conn.close();
});

const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
const social = (provider: string, token: string) => post('/v1/auth/social', { provider, token });

describe('dados do usuário (nome, e-mail, telefone, endereço)', () => {
  const email = `dados-${run}@example.com`;
  const address = { street: 'Rua A', number: '10', city: 'São Paulo', state: 'SP', zipCode: '01001-000' };

  it('cadastra com telefone mascarado e endereço, normalizando o telefone', async () => {
    const res = await post('/v1/auth/register', {
      name: 'Maria', email, password: 'senha-forte-123', phone: '(11) 99999-8888', address,
    });
    expect(res.statusCode).toBe(201);
    const { user, tokens } = res.json();
    expect(user.phone).toBe('11999998888');
    expect(user.address).toMatchObject({ ...address, country: 'BR' });
    expect(user.profileComplete).toBe(true);
    expect(tokens.accessToken).toBeTruthy();
  });

  it('rejeita telefone inválido', async () => {
    const res = await post('/v1/auth/register', { name: 'Maria', email: `x${run}@e.com`, password: 'senha-forte-123', phone: '123' });
    expect(res.statusCode).toBe(400);
  });

  it('atualiza e limpa telefone/endereço via PATCH /users/me', async () => {
    const login = (await post('/v1/auth/login', { email, password: 'senha-forte-123' })).json();
    const headers = { authorization: `Bearer ${login.tokens.accessToken}` };

    const upd = await app.inject({ method: 'PATCH', url: '/v1/users/me', headers, payload: { phone: '+5511988887777', name: 'Maria S.' } });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ name: 'Maria S.', phone: '+5511988887777' });

    const clr = await app.inject({ method: 'PATCH', url: '/v1/users/me', headers, payload: { address: null } });
    expect(clr.json().address).toBeNull();
    expect(clr.json().profileComplete).toBe(false);

    const empty = await app.inject({ method: 'PATCH', url: '/v1/users/me', headers, payload: {} });
    expect(empty.statusCode).toBe(400);
    const anon = await app.inject({ method: 'PATCH', url: '/v1/users/me', payload: { name: 'Zé' } });
    expect(anon.statusCode).toBe(401);
  });
});

describe('login social', () => {
  it('cria a conta no primeiro login (201) e apenas loga nos seguintes (200)', async () => {
    const p: SocialProfile = { provider: 'google', providerUserId: `g-${run}`, name: 'Ana', email: `ana-${run}@example.com`, emailVerified: true };
    const first = await social('google', tok(p));
    expect(first.statusCode).toBe(201);
    expect(first.json().isNewUser).toBe(true);
    expect(first.json().user).toMatchObject({ email: p.email, phone: null, profileComplete: false });

    const second = await social('google', tok(p));
    expect(second.statusCode).toBe(200);
    expect(second.json().isNewUser).toBe(false);
    expect(second.json().user.id).toBe(first.json().user.id);

    const me = await app.inject({ method: 'GET', url: '/v1/users/me', headers: { authorization: `Bearer ${second.json().tokens.accessToken}` } });
    expect(me.statusCode).toBe(200);
  });

  it('conta social não permite login por senha', async () => {
    const res = await post('/v1/auth/login', { email: `ana-${run}@example.com`, password: 'qualquer-senha' });
    expect(res.statusCode).toBe(401);
  });

  it('conta existente com mesmo e-mail: vincula e loga (sem duplicar), mesmo via outro provedor', async () => {
    const email = `bia-${run}@example.com`;
    const reg = (await post('/v1/auth/register', { name: 'Bia', email, password: 'senha-forte-123' })).json();

    const g = await social('google', tok({ provider: 'google', providerUserId: `gb-${run}`, name: 'Bia', email, emailVerified: true }));
    expect(g.statusCode).toBe(200);
    expect(g.json().user.id).toBe(reg.user.id);

    const f = await social('facebook', tok({ provider: 'facebook', providerUserId: `fb-${run}`, name: 'Bia', email, emailVerified: true }));
    expect(f.statusCode).toBe(200);
    expect(f.json().user.id).toBe(reg.user.id);
  });

  it('anti pre-hijacking: ao vincular, a senha antiga deixa de funcionar e sessões antigas caem', async () => {
    const email = `cris-${run}@example.com`;
    const reg = (await post('/v1/auth/register', { name: 'Cris', email, password: 'senha-do-atacante' })).json();

    await social('google', tok({ provider: 'google', providerUserId: `gc-${run}`, name: 'Cris', email, emailVerified: true }));

    expect((await post('/v1/auth/login', { email, password: 'senha-do-atacante' })).statusCode).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: reg.tokens.refreshToken })).statusCode).toBe(401);
  });

  it('rejeita e-mail não verificado, token inválido e provedor não configurado', async () => {
    const unverified = await social('google', tok({ provider: 'google', providerUserId: `gu-${run}`, name: 'U', email: `u-${run}@e.com`, emailVerified: false }));
    expect(unverified.statusCode).toBe(401);
    expect((await social('google', 'invalid-token-xx')).statusCode).toBe(401);
    expect((await social('twitter', 'invalid-token-xx')).statusCode).toBe(400);
  });

  it('primeiro login simultâneo cria uma única conta', async () => {
    const p: SocialProfile = { provider: 'google', providerUserId: `gr-${run}`, name: 'Race', email: `race-${run}@example.com`, emailVerified: true };
    const results = await Promise.all(Array.from({ length: 8 }, () => social('google', tok(p))));
    expect(results.every((r) => r.statusCode === 200 || r.statusCode === 201)).toBe(true);
    expect(new Set(results.map((r) => r.json().user.id)).size).toBe(1);
  });

  it('provedor sem credenciais configuradas responde 503', async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
    const bare = await buildApp(env, conn.db);
    const res = await bare.inject({ method: 'POST', url: '/v1/auth/social', payload: { provider: 'google', token: 'a'.repeat(20) } });
    expect(res.statusCode).toBe(503);
    await bare.close();
  });
});
