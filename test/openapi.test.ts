import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseConnection } from '../src/infra/database/client.js';
import { buildApp } from '../src/app.js';
import { buildOpenApiDocument, toFastifyPath } from '../src/docs/openapi.js';

let conn: DatabaseConnection;
let app: FastifyInstance;
const envFor = (over: Record<string, string>) => loadEnv({ ...process.env, NODE_ENV: 'test', ...over });

beforeAll(async () => {
  conn = createDatabase(envFor({}).DATABASE_URL, 5);
  app = await buildApp(envFor({}), conn.db);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await conn.close();
});

describe('documentação OpenAPI', () => {
  it('o documento é um OpenAPI 3 válido, com todas as referências resolvendo', async () => {
    const doc = structuredClone(buildOpenApiDocument());
    await expect(SwaggerParser.validate(doc as never)).resolves.toBeTruthy();
  });

  it('documenta EXATAMENTE as rotas que existem (nenhuma a mais, nenhuma a menos)', () => {
    const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };
    const documented = new Set(
      Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${toFastifyPath(path)}`)),
    );
    const real = new Set(app.routeTable.map((r) => `${r.method} ${r.url}`));
    expect([...real].filter((r) => !documented.has(r)), 'rotas sem documentação').toEqual([]);
    expect([...documented].filter((r) => !real.has(r)), 'documentação de rota que não existe').toEqual([]);
  });

  it('rotas protegidas exigem bearerAuth e as públicas declaram security vazio', () => {
    const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, { security: unknown[] }>> };
    for (const r of app.routeTable) {
      const op = doc.paths[r.url.replace(/:(\w+)/g, '{$1}')]![r.method.toLowerCase()]!;
      expect(op.security.length > 0, `${r.method} ${r.url}`).toBe(!r.public);
    }
  });

  it('o corpo documentado vem dos mesmos schemas zod que validam a API (enums e limites)', () => {
    const doc = buildOpenApiDocument() as { components: { schemas: Record<string, { properties: Record<string, { enum?: string[]; maxItems?: number }> }> } };
    const create = doc.components.schemas.CreateTripBody!.properties;
    expect(create.companion!.enum ?? JSON.stringify(create.companion)).toContain('casal');
    expect(create.destinations!.maxItems).toBe(10);
  });

  it('serve a interface em /docs e o JSON em /docs/json', async () => {
    const json = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(json.statusCode).toBe(200);
    expect(json.json().info.title).toBe('Gloube API');
    const ui = await app.inject({ method: 'GET', url: '/docs' });
    expect(ui.statusCode).toBe(200);
    expect(ui.headers['content-type']).toContain('text/html');
  });

  it('não vaza segredos nem exemplos com credenciais reais', () => {
    const text = JSON.stringify(buildOpenApiDocument());
    expect(text).not.toMatch(/AIza|sk-[A-Za-z0-9]{10}|BEGIN (RSA )?PRIVATE|password":"[^"]{3,}/);
  });

  it('em produção a documentação fica desligada por padrão e liga com DOCS_ENABLED=true', async () => {
    const prod = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40) };
    const off = await buildApp(envFor(prod), conn.db);
    expect((await off.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404);
    await off.close();
    const on = await buildApp(envFor({ ...prod, DOCS_ENABLED: 'true' }), conn.db);
    expect((await on.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(200);
    await on.close();
  });
});
