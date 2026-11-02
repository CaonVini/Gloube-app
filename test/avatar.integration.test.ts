import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';
import type { AvatarStorage } from '../src/modules/users/application/ports/avatar-storage.js';

/** Requer Postgres + migrations. O S3 é trocado por um storage em memória. */
class MemoryStorage implements AvatarStorage {
  objects = new Map<string, { data: Buffer; contentType: string }>();
  async put(key: string, data: Buffer, contentType: string) { this.objects.set(key, { data, contentType }); }
  async delete(key: string) { this.objects.delete(key); }
  async signedUrl(key: string) { return `https://s3.test/${key}?sig=abc`; }
}

let app: FastifyInstance;
let conn: DatabaseConnection;
const storage = new MemoryStorage();

beforeAll(async () => {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '10000', AUTH_RATE_LIMIT_MAX: '10000', UPLOAD_RATE_LIMIT_MAX: '10000' });
  conn = createDatabase(env.DATABASE_URL, 5);
  app = await buildApp(env, conn.db, { avatarStorage: storage });
});
afterAll(async () => {
  await app.close();
  await conn.close();
});

async function register() {
  const res = await app.inject({
    method: 'POST', url: '/v1/auth/register',
    payload: { name: 'Maria Souza', email: `av-${Date.now()}-${Math.random()}@example.com`, password: 'senha-forte-123' },
  });
  return res.json().tokens.accessToken as string;
}

function multipartBody(content: Buffer, opts: { field?: string; filename?: string; type?: string } = {}) {
  const boundary = '----gloube' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${opts.field ?? 'file'}"; filename="${opts.filename ?? 'foto.jpg'}"\r\nContent-Type: ${opts.type ?? 'image/jpeg'}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, content, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const upload = (token: string | null, content: Buffer, opts = {}) => {
  const { payload, headers } = multipartBody(content, opts);
  return app.inject({
    method: 'PUT', url: '/v1/users/me/avatar', payload,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
};

const jpegWithExif = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: '#1B7F8C' } })
    .withExif({ IFD0: { Copyright: 'segredo-gps', ImageDescription: 'privado' } })
    .jpeg().toBuffer();

describe('avatar do perfil', () => {
  it('exige autenticação', async () => {
    expect((await upload(null, await jpegWithExif())).statusCode).toBe(401);
  });

  it('recodifica para WebP 512x512 sem EXIF e devolve URL assinada', async () => {
    const token = await register();
    const res = await upload(token, await jpegWithExif());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.avatarUrl).toMatch(/^https:\/\/s3\.test\/avatars\/.+\.webp\?sig=/);
    expect(body).not.toHaveProperty('avatarKey');

    const key = new URL(body.avatarUrl).pathname.slice(1);
    const stored = storage.objects.get(key)!;
    expect(stored.contentType).toBe('image/webp');
    const meta = await sharp(stored.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
    expect(meta.exif).toBeUndefined();
    expect(stored.data.includes(Buffer.from('segredo-gps'))).toBe(false);

    const me = await app.inject({ method: 'GET', url: '/v1/users/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.json().avatarUrl).toBe(body.avatarUrl);
  });

  it('troca a foto apagando a anterior (sem objetos órfãos)', async () => {
    const token = await register();
    const first = (await upload(token, await jpegWithExif())).json().avatarUrl as string;
    const second = (await upload(token, await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer())).json().avatarUrl as string;
    expect(second).not.toBe(first);
    expect(storage.objects.has(new URL(first).pathname.slice(1))).toBe(false);
    expect(storage.objects.has(new URL(second).pathname.slice(1))).toBe(true);
  });

  it('valida pelo conteúdo, não pelo Content-Type/extensão', async () => {
    const token = await register();
    const fakeJpg = await upload(token, Buffer.from('<?php echo 1; ?>'), { filename: 'x.jpg', type: 'image/jpeg' });
    expect(fakeJpg.statusCode).toBe(400);
    expect(fakeJpg.json().error.code).toBe('VALIDATION_ERROR');

    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    const res = await upload(token, gif, { filename: 'a.jpg', type: 'image/jpeg' });
    expect(res.statusCode).toBe(400);
  });

  it('rejeita arquivo maior que 5 MB e arquivo vazio', async () => {
    const token = await register();
    const big = await upload(token, Buffer.alloc(5 * 1024 * 1024 + 10, 1));
    expect(big.statusCode).toBe(413);
    expect((await upload(token, Buffer.alloc(0))).statusCode).toBe(400);
  });

  it('rejeita campo com nome errado', async () => {
    const token = await register();
    expect((await upload(token, await jpegWithExif(), { field: 'avatar' })).statusCode).toBe(400);
  });

  it('remove a foto e é idempotente; um usuário não afeta a foto do outro', async () => {
    const a = await register();
    const b = await register();
    const aUrl = (await upload(a, await jpegWithExif())).json().avatarUrl as string;
    const bUrl = (await upload(b, await jpegWithExif())).json().avatarUrl as string;
    expect(new URL(aUrl).pathname).not.toBe(new URL(bUrl).pathname);

    const del = await app.inject({ method: 'DELETE', url: '/v1/users/me/avatar', headers: { authorization: `Bearer ${a}` } });
    expect(del.statusCode).toBe(200);
    expect(del.json().avatarUrl).toBeNull();
    expect(storage.objects.has(new URL(aUrl).pathname.slice(1))).toBe(false);
    expect(storage.objects.has(new URL(bUrl).pathname.slice(1))).toBe(true);
    const again = await app.inject({ method: 'DELETE', url: '/v1/users/me/avatar', headers: { authorization: `Bearer ${a}` } });
    expect(again.statusCode).toBe(200);
  });
});

describe('nome do perfil (mesma regra do app)', () => {
  it('rejeita dígitos/símbolos e aceita acentos', async () => {
    const token = await register();
    const bad = await app.inject({ method: 'PATCH', url: '/v1/users/me', headers: { authorization: `Bearer ${token}` }, payload: { name: 'Ana123' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PATCH', url: '/v1/users/me', headers: { authorization: `Bearer ${token}` }, payload: { name: "  José   D'Ávila-Lima " } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe("José D'Ávila-Lima");
  });
});

describe('sem S3 configurado', () => {
  it('responde 503', async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', S3_BUCKET: '' });
    const local = await buildApp(env, conn.db);
    const reg = await local.inject({ method: 'POST', url: '/v1/auth/register', payload: { name: 'Sem Bucket', email: `nb-${Date.now()}@example.com`, password: 'senha-forte-123' } });
    const token = reg.json().tokens.accessToken;
    const del = await local.inject({ method: 'DELETE', url: '/v1/users/me/avatar', headers: { authorization: `Bearer ${token}` } });
    expect(del.statusCode).toBe(503);
    await local.close();
  });
});

describe('rate limit de upload', () => {
  it('bloqueia rajadas com 429', async () => {
    const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_MAX: '10000', UPLOAD_RATE_LIMIT_MAX: '2' });
    const local = await buildApp(env, conn.db, { avatarStorage: storage });
    const reg = await local.inject({ method: 'POST', url: '/v1/auth/register', payload: { name: 'Rajada Teste', email: `rl-${Date.now()}@example.com`, password: 'senha-forte-123' } });
    const token = reg.json().tokens.accessToken;
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      codes.push((await local.inject({ method: 'DELETE', url: '/v1/users/me/avatar', headers: { authorization: `Bearer ${token}` } })).statusCode);
    }
    expect(codes).toEqual([200, 200, 429]);
    await local.close();
  });
});
